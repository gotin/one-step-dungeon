// ── tests/play-stats.spec.js ── 実行キュー66 ──────────────────────
// 不変条件：**遊びの記録＝探索率・宝箱・撃破数・倒れた回数**（ユーザー決定 2026-10-14＝4つとも・
// ポーズ画面と THE END の両方に出す）。
//   ・探索率＝訪れた画面 ÷ 本編の全画面（テストレイヤーは数えない・切り捨て＝全部回るまで 100% にならない）
//   ・宝箱＝開けた 'B' ÷ 本編の全 'B'（古いセーブの余計な posKey で分子が増えない）
//   ・撃破数＝倒した雑魚の延べ数（killEnemy で足す）
//   ・倒れた回数＝ゲームオーバーの回数（妖精でよみがえった分は数えない）。セーブ全体は書かず
//     回数だけ既存のセーブへ書き足す（ゲームオーバーの画面で閉じても消えない・HP 0 を残さない）
//
// 🔴 当て所：
//   ① 集計：テストレイヤーを数える／'B' 以外の posKey を数える／探索率を四捨五入する
//   ② 雑魚を倒しても撃破数が増えない
//   ③ ゲームオーバーで回数が増えない／セーブに残らない／セーブに HP 0 を書く／妖精の復活も数える
//   ④ 壊れたセーブ値で NaN
//   ⑤ ポーズ画面に出ない ⑥ THE END に出ない

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { gotoFreshGame, SAVE_KEY } from './helpers.js';
import { sanitizeLoadedPlayer } from '../game/save.js';
import { collectPlayStats, explorePercent, playStatsItems } from '../game/play-stats.js';
import { gameLayerEntries } from '../shared/layers.js';
import { ITEM_META } from '../shared/items.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

// 実際の保存の口（床のルピーを拾う＝saveGame）を通してセーブを作る（clear-time.spec.js ③ と同じ）。
async function makeSave(page) {
	await page.evaluate(() => {
		const g = window.__game;
		const p = g.getPlayer();
		const r = Math.round(p.y), c = Math.round(p.x);
		g.spawnFloorDrop(r, c, 'rupee');
		g.pickupFloorDrop(r, c);
	});
}

// HP 1 の主人公に敵の弾を当てる（rupee-sinks.spec.js の妖精の瓶と同じ当て方）。
async function hitOnce(page) {
	await page.evaluate(() => {
		const g = window.__game;
		const p = g.getPlayer();
		p.hp = 1;
		g.injectEnemyProjectile(p.x, p.y, -1, 0, 4, 2);
		g.step(2);
	});
}

test.describe('キュー66 遊びの記録（探索率・宝箱・撃破数・倒れた回数）', () => {
	test('① 純粋関数：テストレイヤーと B 以外を数えない・探索率は切り捨て', () => {
		const map = {
			layers: {
				field: { stages: {
					'0,0': { tiles: ['.B.', '...'] },        // 行が文字列
					'0,1': { tiles: [['B', '.'], ['.', 'B']] }, // 行が文字配列
					'0,2': { tiles: ['...'] },
				} },
				dungeon_1: { stages: { '0,0': { tiles: ['B'] } } },
				test_mechanics: { stages: { '0,0': { tiles: ['BBB'] } } },
			},
		};
		const stageState = {
			'field_0,0':          { visited: true,  openedChests: new Set(['0,1', '1,1']) }, // 1,1 は B ではない
			'field_0,1':          { visited: true,  openedChests: ['1,1'] },                  // 保存形式（配列）
			'dungeon_1_0,0':      { visited: true,  openedChests: [] },                       // レイヤー名に _
			'test_mechanics_0,0': { visited: true,  openedChests: ['0,0', '0,1'] },
		};
		const s = collectPlayStats(map, stageState, { kills: 7, deaths: 'x' });
		expect(s).toEqual({ visited: 3, stages: 4, opened: 2, chests: 4, kills: 7, deaths: 0 });
		expect(explorePercent(522, 523), '1画面残しで 100% と出た').toBe(99);
		expect(explorePercent(523, 523)).toBe(100);
		expect(explorePercent(0, 0)).toBe(0);
		expect(playStatsItems(s).map((i) => `${i.label} ${i.value}`))
			.toEqual(['探索率 75%', '宝箱 2/4', '撃破数 7', '倒れた回数 0']);
	});

	test('① 実データ：分母は本編の全画面・全宝箱（テストレイヤーは入らない）', async ({ page }) => {
		let stages = 0, chests = 0;
		for (const [, layer] of gameLayerEntries(MAP)) {
			for (const sd of Object.values(layer.stages ?? {})) {
				stages++;
				for (const row of sd.tiles ?? []) for (const ch of row) if (ch === 'B') chests++;
			}
		}
		await gotoFreshGame(page);
		const s = await page.evaluate(() => window.__game.getPlayStats());
		expect(s.stages).toBe(stages);
		expect(s.chests).toBe(chests);
		expect(s.visited, '開始の画面が訪問済みに数えられていない').toBeGreaterThanOrEqual(1);
		// テストレイヤーへ入っても探索率は増えない
		const before = s.visited;
		await page.evaluate(() => { window.__game.pause(); window.__game.enterStage('test_mechanics', '0,0', 1, 1); });
		expect((await page.evaluate(() => window.__game.getPlayStats())).visited).toBe(before);
	});

	test('② 雑魚を倒すと撃破数が1増える', async ({ page }) => {
		await gotoFreshGame(page);
		const id = await page.evaluate(() => {
			const g = window.__game;
			g.pause();
			const p = g.getPlayer();
			return g.injectEnemy(p.x + 3, p.y, 1);
		});
		expect(await page.evaluate(() => window.__game.getPlayer().kills)).toBe(0);
		await page.evaluate((id) => window.__game.dealDamage(id, 99), id);
		expect(await page.evaluate(() => window.__game.getEnemies().length)).toBe(0);
		expect(await page.evaluate(() => window.__game.getPlayer().kills), '倒しても撃破数が増えない').toBe(1);
	});

	test('③ ゲームオーバーで倒れた回数が増え、回数だけセーブに残る（HP 0 は書かない）', async ({ page }) => {
		await gotoFreshGame(page);
		await page.evaluate(() => window.__game.pause());
		await makeSave(page);
		const hpSaved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).player.hp, SAVE_KEY);
		await hitOnce(page);
		await expect(page.locator('#gameover-overlay')).toBeVisible();
		expect(await page.evaluate(() => window.__game.getPlayer().deaths)).toBe(1);
		const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).player, SAVE_KEY);
		expect(saved.deaths, 'ゲームオーバーの回数がセーブに残らない').toBe(1);
		expect(saved.hp, 'ゲームオーバーでセーブ全体（HP 0）を書いた').toBe(hpSaved);

		// リトライしてもう一度＝2
		await page.locator('#gameover-retry').click();
		await page.evaluate(() => window.__game.pause());
		await hitOnce(page);
		await expect(page.locator('#gameover-overlay')).toBeVisible();
		expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).player.deaths, SAVE_KEY)).toBe(2);
	});

	test('③ 妖精の瓶でよみがえった分は数えない', async ({ page }) => {
		await gotoFreshGame(page);
		await page.evaluate(() => { window.__game.pause(); window.__game.getPlayer().fairies = 1; });
		await hitOnce(page);
		await expect(page.locator('#gameover-overlay')).toBeHidden();
		expect(await page.evaluate(() => window.__game.getPlayer().deaths)).toBe(0);
	});

	test('④ セーブの壊れた値は 0', () => {
		for (const bad of [undefined, 'abc', -5, NaN, null]) {
			const p = sanitizeLoadedPlayer({ subItems: {}, kills: bad, deaths: bad }, ITEM_META);
			expect([p.kills, p.deaths], `壊れた値 ${bad}`).toEqual([0, 0]);
		}
		const p = sanitizeLoadedPlayer({ subItems: {}, kills: 12.9, deaths: 3 }, ITEM_META);
		expect([p.kills, p.deaths]).toEqual([12, 3]);
	});

	test('⑤ ポーズ画面に4項目が出る', async ({ page }) => {
		await gotoFreshGame(page);
		await page.evaluate(() => {
			const p = window.__game.getPlayer();
			p.kills = 42; p.deaths = 3;
		});
		await page.keyboard.press('Escape');
		await expect.poll(() => page.evaluate(() => window.__game.getState().isPaused)).toBe(true);
		const s = await page.evaluate(() => window.__game.getPlayStats());
		const pct = Math.floor((s.visited / s.stages) * 100);
		await expect(page.locator('#pause-score [data-stat="explore"]')).toHaveText(`探索率 ${pct}%`);
		await expect(page.locator('#pause-score [data-stat="chests"]')).toHaveText(`宝箱 ${s.opened}/${s.chests}`);
		await expect(page.locator('#pause-score [data-stat="kills"]')).toHaveText('撃破数 42');
		await expect(page.locator('#pause-score [data-stat="deaths"]')).toHaveText('倒れた回数 3');
		// 置き場所（2026-10-14 ユーザー指摘）＝装備の行のすぐ下ではなく、枠の一番下に区切り線を挟んで置く
		const place = await page.evaluate(() => {
			const el = document.getElementById('pause-score');
			return {
				inStats: !!el.closest('#pause-stats'),
				isLast: el.parentElement.id === 'pause-box' && el === el.parentElement.lastElementChild,
				border: getComputedStyle(el).borderTopStyle,
			};
		});
		expect(place).toEqual({ inStats: false, isLast: true, border: 'solid' });
	});

	test('⑥ THE END に4項目が出る', async ({ page }) => {
		await gotoFreshGame(page);
		await page.evaluate(() => {
			window.__game.pause();
			const p = window.__game.getPlayer();
			p.kills = 321; p.deaths = 4;
			window._debugEnding();
		});
		await page.evaluate(() => document.getElementById('ending-scroll')
			.dispatchEvent(new Event('animationend')));
		await expect(page.locator('#ending-phase2')).toBeVisible();
		await expect(page.locator('#ending-score [data-stat="kills"]')).toHaveText('撃破数 321');
		await expect(page.locator('#ending-score [data-stat="deaths"]')).toHaveText('倒れた回数 4');
		await expect(page.locator('#ending-score [data-stat="explore"]')).toContainText('探索率');
		await expect(page.locator('#ending-score [data-stat="chests"]')).toContainText('宝箱');
	});
});
