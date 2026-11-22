// tests/dark-tower-2f-fire-key.spec.js
// 暗黒の塔 2F の階段の部屋 `2,3`＝火を渡す鍵の間（実行キュー111・2026-11-16・
// `scripts/migrate-dark-tower-111-2f-stairs.mjs` が書いた）。
//
// ユーザーの感想「最後のダンジョンなのに簡単」を受けた最初の「本道で道具を重ねる」部屋。
// 階段は鍵の扉の奥。鍵は全かがり火で出る。かがり火 B は壊せる壁の奥（爆弾→ロウソク）、
// C は穴の環の中（B を通して火矢で火を渡す）。爆弾鬼 λ×2 が邪魔をする。
// 守るもの：
// ① 盤面・鍵の条件・階段が扉と壁で囲まれている
// ② ソルバー：解ける／ロウソク・道具・爆弾・火渡しのどれを欠いても解けない
// ③ 実機：爆弾2発 → ロウソク → 火矢 で鍵が出て、拾って扉を開け、階段で 3F へ上がれる

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { AFTER, solveKeyRoom } from '../scripts/migrate-dark-tower-111-2f-stairs.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dark_tower';
const KEY = '2,3';
const KEY_CELL = '2,8';
const st = map.layers[LAYER].stages[KEY];
const rows = () => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – dark_tower 2,3 火を渡す鍵の間（キュー111）', () => {

	test('① 盤面・鍵の条件・階段の囲い', () => {
		expect(rows(), `${KEY} の盤面`).toEqual(AFTER);
		expect(st.showConditions?.[KEY_CELL]?.trigger, '鍵は全かがり火で出る').toBe('torchesLit');
		expect(st.mapEnters?.['8,4']?.id, '階段（2fStairsUp）はそのまま').toBe('2fStairsUp');
		const g = rows();
		expect([g[7][4], g[8][3], g[8][5], g[9][4]], '階段の四方＝扉と壁').toEqual(['D', '#', '#', '#']);
		expect(Object.keys(st.enemyDirs ?? {}).sort(), 'λ の向き').toEqual(['2,2', '6,9']);
	});

	test('② ソルバー：解ける・どれか1つ欠くと解けない', () => {
		expect(solveKeyRoom(AFTER), '全部の道具で解ける').toBe(true);
		expect(solveKeyRoom(AFTER, { hasCandle: false }), 'ロウソク無しで解けた').toBe(false);
		expect(solveKeyRoom(AFTER, { noTools: true }), '道具無しで解けた').toBe(false);
		expect(solveKeyRoom(AFTER.map((r) => r.replace(/!/g, '#'))), '壊せる壁を壊さずに解けた').toBe(false);
		const noLine = AFTER.map((r, i) => (i === 4 ? r.slice(0, 6) + '#' + r.slice(7) : r));
		expect(solveKeyRoom(noLine), 'B→C の火渡しの直線を塞いでも解けた').toBe(false);
	});

	test('③ 実機：爆弾2発 → ロウソク → 火矢 で鍵、扉を開けて 3F へ', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		const p = new URLSearchParams({
			fromEditor: '1', layer: LAYER, stage: KEY, row: '4', col: '3',
			ps_weapon: '1', ps_hearts: '20', ps_shield: '2', ps_armor: '2',
			ps_bomb: '1', ps_candle: '1', ps_bow: '1', ps_arrows: '30',
		});
		await page.goto(`/blade-of-lumia/game/?${p}`);
		await waitForBoard(page);

		const res = await page.evaluate(() => {
			const g = window.__game;
			const walk = (dir, tiles) => { for (let i = 0; i < tiles * 2; i++) { g.movePlayer(dir); g.step(1); } };
			const use = (item, dir, ticks) => { g.getPlayer().activeSubItem = item; g.setHeroDir(dir); g.useSubItem(); g.step(ticks); };
			const out = {};
			// 仕掛けそのものを測るため、爆弾鬼は先に退場させる（爆風で壁が壊れる別解を混ぜない）
			for (const e of g.getEnemies()) g.dealDamage(e.id, 999, 'sword');
			g.step(2);
			out.enemiesLeft = g.getEnemies().length;
			out.keyBefore = g.getStageState().conditionsMet.includes('2,8');
			// 1発目＝(4,3) に置く→西の壁 (4,4)
			use('bomb', 'right', 40);
			out.broken1 = g.getStageState().brokenWalls;
			// 2発目＝(4,4) に立って置く→東の壁 (4,6)（距離2）
			walk('right', 1);
			use('bomb', 'right', 40);
			out.broken2 = g.getStageState().brokenWalls;
			// ロウソクで B (4,5)
			use('candle', 'right', 8);
			out.litB = g.getStageState().litTorches;
			// 火矢＝B を通して C (4,9) へ
			use('bow', 'right', 20);
			out.litC = g.getStageState().litTorches;
			out.keyAfter = g.getStageState().conditionsMet.includes('2,8');
			// 鍵 (2,8) へ：(4,4)→北へ2→東へ4
			walk('up', 2); walk('right', 4);
			out.atKey = [Math.round(g.getPlayer().y), Math.round(g.getPlayer().x)];
			out.keysAfterPick = g.getPlayer().keys;
			// 扉 (7,4) へ：(2,8)→西へ2→南へ4（(4,6) は壊した後の床）→西へ2→南へ2（扉→階段）
			walk('left', 2); walk('down', 4); walk('left', 2); walk('down', 2);
			return out;
		});
		expect(res.enemiesLeft, '前提：爆弾鬼は退場した').toBe(0);
		expect(res.keyBefore, '最初から鍵が出ている').toBe(false);
		expect(res.broken1, '1発目で西の壁が壊れない').toContain('4,4');
		expect(res.broken2, '2発目で東の壁が壊れない').toContain('4,6');
		expect(res.litB, 'ロウソクで B が点かない').toContain('4,5');
		expect(res.litC, '火矢で C に火が渡らない').toContain('4,9');
		expect(res.keyAfter, '2本点けても鍵が出ない').toBe(true);
		expect(res.atKey, '鍵のセルへ歩けていない').toEqual([2, 8]);
		await page.waitForFunction(() => window.__game.getState().stageKey === '3,0', null, { timeout: 5000 });
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
