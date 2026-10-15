// ── tests/touch-overlays.spec.js ── 実行キュー72 ──────────────────
// 不変条件：**タッチだけで会話・店・転移の行き先を抜けられる**（2026-10-15 iPhone 実機のユーザー報告
// ＝「会話を次へ進ませる手段がなかった」）。会話の枠は画面全体を覆い（z-index 50 > 操作盤 30）、
// 剣ボタンにも届かない∴枠のどこをタップしても次へ。店・転移の行き先は Escape でしか閉じられなかった
// ∴枠の中に閉じるボタンを置く（ポーズ画面の「✕ 戻る」と同じ作り）。
//
// 🔴 当て所：
//   ① 会話の枠をタップしても進まない／1回のタップで2行以上進む
//   ② 店を閉じるボタンが無い・効かない・枠の下に隠れる
//   ③ 転移の行き先をやめるボタンが無い・効かない（やめたのに転移する）

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const isOpen = (page, id) => page.evaluate((id) => !document.getElementById(id).classList.contains('hidden'), id);
// 押したいボタンが本当に一番上にあるか（枠の下に隠れていたらタップは届かない）
const topAt = (page, sel) => page.evaluate((sel) => {
	const r = document.querySelector(sel).getBoundingClientRect();
	return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.id ?? null;
}, sel);

test.describe('キュー72 タッチで会話・店・転移の行き先を抜けられる', () => {
	test('① 会話は枠のタップで1行ずつ進み、最後で閉じる（Space と同じ行数）', async ({ page }) => {
		// 同じ会話（はじめからの老賢者）を Space で送った行の並びと、タップで送った行の並びが一致する
		const readAll = async (advance) => {
			await page.addInitScript((key) => { try { localStorage.removeItem(key); } catch { /* noop */ } }, SAVE_KEY);
			await page.goto(GAME_URL);
			await waitForBoard(page);
			await expect(page.locator('#dialog-overlay')).toBeVisible();
			const lines = [];
			for (let i = 0; i < 30 && await isOpen(page, 'dialog-overlay'); i++) {
				lines.push(await page.locator('#dialog-text').textContent());
				await advance();
			}
			expect(await isOpen(page, 'dialog-overlay'), '会話を閉じられない').toBe(false);
			return lines;
		};
		const bySpace = await readAll(() => page.keyboard.press('Space'));
		// 枠の上の方（会話の箱でない所）をタップ＝どこを押しても進む
		const byTap = await readAll(() => page.locator('#dialog-overlay').tap({ position: { x: 195, y: 100 } }));
		expect(bySpace.length, '会話が2行以上ある前提').toBeGreaterThan(1);
		expect(byTap, 'タップ1回＝1行（Space と同じ）').toEqual(bySpace);
	});

	test('② 店は「✕ 戻る」のタップで閉じる', async ({ page }) => {
		await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=9,9&row=5&col=7&ps_weapon=1`);
		await waitForBoard(page);
		await page.evaluate(() => { const g = window.__game; g.pause(); g.setHeroDir('down'); g.swordAttack(); });
		await expect(page.locator('#shop-overlay')).toBeVisible();
		expect(await topAt(page, '#shop-close'), '閉じるボタンが一番上にある').toBe('shop-close');
		await page.locator('#shop-close').tap();
		await expect(page.locator('#shop-overlay')).toBeHidden();
	});

	test('③ 転移の行き先は「✕ やめる」のタップで閉じ、転移しない', async ({ page }) => {
		await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=6,14&row=5&col=4&ps_weapon=1`);
		await waitForBoard(page);
		await page.evaluate(() => {
			const g = window.__game;
			g.getPlayer().litWarpStones = ['field:6,14:4,4', 'field:2,15:6,5'];
			g.setHeroDir('up'); g.swordAttack();
		});
		await expect(page.locator('#warp-overlay')).toBeVisible();
		expect(await topAt(page, '#warp-close'), 'やめるボタンが一番上にある').toBe('warp-close');
		await page.locator('#warp-close').tap();
		await expect(page.locator('#warp-overlay')).toBeHidden();
		// 転移は出発から到着まで約1.3秒の演出＝それより長く待ってから見る
		await page.waitForTimeout(2000);
		expect(await page.evaluate(() => window.__game.getState().stageKey), 'やめたのに転移した').toBe('6,14');
	});
});
