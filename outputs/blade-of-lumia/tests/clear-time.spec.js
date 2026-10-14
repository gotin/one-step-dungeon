// ── tests/clear-time.spec.js ── 実行キュー65 ──────────────────────
// 不変条件：**クリアタイム＝遊んでいた時間だけ**（ユーザー決定 2026-10-14）。世界が進んだ
// 分だけ `player.playMs` が増え、ポーズ中は増えない。セーブに乗り、はじめからで 0 に戻る。
// THE END の画面にクリアタイムと自己ベストが出る（周回をまたいで残す・短ければ更新）。
//
// 🔴 当て所：
//   ① step で増えない／TICK_MS 以外の量で増える
//   ② ポーズ中も増える（実時間を数えている）
//   ③ セーブに残らない／はじめからで 0 に戻らない／壊れたセーブ値で NaN
//   ④ THE END に出ない・ベストを比べない（遅い周回で上書きする）
//   ⑦ エディタのプレビュー（途中の部屋から始まる数秒の「クリア」）が本番の自己ベストを書き換える

import { test, expect } from '@playwright/test';
import { gotoFreshGame, GAME_URL, SAVE_KEY } from './helpers.js';
import { sanitizeLoadedPlayer } from '../game/save.js';
import { formatPlayTime, recordClearTime } from '../game/play-time.js';
import { ITEM_META } from '../shared/items.js';
import { TICK_MS, BEST_TIME_KEY } from '../game/constants.js';

test.describe('キュー65 クリアタイム（遊んでいた時間）', () => {
	test('① step(n) で n×TICK_MS 増える', async ({ page }) => {
		await gotoFreshGame(page);
		const before = await page.evaluate(() => { window.__game.pause(); return window.__game.getPlayer().playMs; });
		await page.evaluate(() => window.__game.step(50));
		const after = await page.evaluate(() => window.__game.getPlayer().playMs);
		expect(after - before).toBe(50 * TICK_MS);
	});

	test('② ポーズ画面を開いている間は増えない', async ({ page }) => {
		await gotoFreshGame(page);
		await page.evaluate(() => window.__game.pause());
		await page.keyboard.press('Escape');
		await expect.poll(() => page.evaluate(() => window.__game.getState().isPaused)).toBe(true);
		const before = await page.evaluate(() => window.__game.getPlayer().playMs);
		await page.evaluate(() => window.__game.step(50));
		expect(await page.evaluate(() => window.__game.getPlayer().playMs), 'ポーズ中に時間が増えた').toBe(before);
		await page.keyboard.press('Escape');
		await expect.poll(() => page.evaluate(() => window.__game.getState().isPaused)).toBe(false);
		await page.evaluate(() => window.__game.step(10));
		expect(await page.evaluate(() => window.__game.getPlayer().playMs)).toBe(before + 10 * TICK_MS);
	});

	test('③ セーブに乗り、続きからで戻り、はじめからで 0／壊れた値は 0', async ({ page, context }) => {
		await gotoFreshGame(page);
		// 実際の保存の口（床のルピーを拾う＝saveGame）を通す
		await page.evaluate(() => {
			window.__game.pause();
			window.__game.step(20);
			const p = window.__game.getPlayer();
			const r = Math.round(p.y), c = Math.round(p.x);
			window.__game.spawnFloorDrop(r, c, 'rupee');
			window.__game.pickupFloorDrop(r, c);
		});
		const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY);
		expect(saved.player.playMs, 'セーブに遊んだ時間が無い').toBeGreaterThanOrEqual(20 * TICK_MS);
		const savedMs = saved.player.playMs;
		await page.close();

		// 別ページ（同じ localStorage・セーブを消す初期化スクリプト無し）＝タイトル→続きから
		const p2 = await context.newPage();
		await p2.goto(GAME_URL);
		await p2.locator('#btn-continue').click();
		const resumed = await p2.evaluate(() => window.__game.getPlayer().playMs);
		expect(resumed, '続きからで時間が戻らない').toBeGreaterThanOrEqual(savedMs);
		expect(resumed).toBeLessThan(savedMs + 60_000);
		await p2.close();

		// タイトル→はじめから→はい＝0 から（開始の会話で世界は止まっている）
		const p3 = await context.newPage();
		await p3.goto(GAME_URL);
		await p3.locator('#btn-newgame').click();
		await p3.locator('#btn-confirm-yes').click();
		expect(await p3.evaluate(() => window.__game.getPlayer().playMs), 'はじめからで 0 に戻らない')
			.toBeLessThan(5 * TICK_MS);

		for (const bad of [undefined, 'abc', -5, NaN, null]) {
			const p = sanitizeLoadedPlayer({ subItems: {}, playMs: bad }, ITEM_META);
			expect(p.playMs, `壊れた値 ${bad}`).toBe(0);
		}
		expect(sanitizeLoadedPlayer({ subItems: {}, playMs: 12345.7 }, ITEM_META).playMs).toBe(12345);
	});

	test('④ 純粋関数：書式と自己ベストの比較', () => {
		expect(formatPlayTime(0)).toBe('0:00:00');
		expect(formatPlayTime(((1 * 60 + 2) * 60 + 3) * 1000 + 999)).toBe('1:02:03');
		expect(formatPlayTime(100 * 3600 * 1000)).toBe('100:00:00');
		const store = new Map();
		const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
		expect(recordClearTime(5000, storage, 'k')).toEqual({ ms: 5000, best: 5000, isNewBest: true });
		expect(recordClearTime(7000, storage, 'k'), '遅い周回でベストを上書きした').toEqual({ ms: 7000, best: 5000, isNewBest: false });
		expect(store.get('k')).toBe('5000');
		expect(recordClearTime(3000, storage, 'k')).toEqual({ ms: 3000, best: 3000, isNewBest: true });
	});

	test('⑤ THE END にクリアタイムと自己ベストが出る', async ({ page }) => {
		await gotoFreshGame(page);
		await page.evaluate((k) => {
			localStorage.setItem(k, String(30 * 60 * 1000));   // ベスト 0:30:00
			window.__game.pause();
			window.__game.getPlayer().playMs = (1 * 3600 + 23 * 60 + 45) * 1000;
			window._debugEnding();
		}, BEST_TIME_KEY);
		// スタッフロールは CSS アニメの終わりを待つ＝飛ばして THE END へ
		await page.evaluate(() => document.getElementById('ending-scroll')
			.dispatchEvent(new Event('animationend')));
		await expect(page.locator('#ending-phase2')).toBeVisible();
		await expect(page.locator('#ending-time-clear')).toHaveText('1:23:45');
		await expect(page.locator('#ending-time-best')).toHaveText('ベスト 0:30:00');
		expect(await page.evaluate((k) => localStorage.getItem(k), BEST_TIME_KEY), '遅い周回でベストが書き換わった')
			.toBe(String(30 * 60 * 1000));
	});

	test('⑥ ベスト未記録／短い周回は「ベスト更新！」で保存', async ({ page }) => {
		await gotoFreshGame(page);
		await page.evaluate((k) => {
			localStorage.removeItem(k);
			window.__game.pause();
			window.__game.getPlayer().playMs = 10 * 60 * 1000;
			window._debugEnding();
		}, BEST_TIME_KEY);
		await page.evaluate(() => document.getElementById('ending-scroll')
			.dispatchEvent(new Event('animationend')));
		await expect(page.locator('#ending-time-clear')).toHaveText('0:10:00');
		await expect(page.locator('#ending-time-best')).toHaveText('ベスト更新！');
		expect(await page.evaluate((k) => localStorage.getItem(k), BEST_TIME_KEY)).toBe(String(10 * 60 * 1000));
	});

	test('⑦ プレビューでクリアしても自己ベストは書かない（表示はする）', async ({ page }) => {
		await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=7,14&row=4&col=5`);
		await page.waitForFunction(() => window.__game?.getPlayer);
		await page.evaluate((k) => {
			localStorage.setItem(k, String(30 * 60 * 1000));
			window.__game.pause();
			window.__game.getPlayer().playMs = 5000;
			window._debugEnding();
		}, BEST_TIME_KEY);
		await page.evaluate(() => document.getElementById('ending-scroll')
			.dispatchEvent(new Event('animationend')));
		await expect(page.locator('#ending-time-clear')).toHaveText('0:00:05');
		expect(await page.evaluate((k) => localStorage.getItem(k), BEST_TIME_KEY), 'プレビューのクリアが本番のベストを書き換えた')
			.toBe(String(30 * 60 * 1000));
	});
});
