// tests/d8-leech-stones.spec.js
// dungeon_8 `0,3`＝ヒルと石の泥道（パズルの部屋）の番人。
//
// 経緯：キュー112（2026-11-19・`scripts/migrate-d8-0-3-leech-stones.mjs`）。直す前は E・C の素の広間（入口の西の行き止まり・報酬なし）。
// ユーザーが選んだ主題「ヒルと石の泥道」＝沼の中の泥道で石2つを踏み板2つへ運ぶ倉庫番。両方乗ると宝箱（ルピー×100）。
// 角や袋小路へ押すと詰む＝笛で石が戻る。西の広場に毒沼ヒル×2（石は押さない）。
//
// 守るもの：
// ① 盤面・沼・踏み板と石・宝箱の条件・笛の効き目・敵
// ② ソルバー：最少の押し 11・はしごの近道なし・詰む状態がある・閉じ込めなし・石は2つとも要る
// ③ 実機：ソルバーの解をなぞると宝箱が出て、ルピー×100 を拾える
// ④ 実機：石を動かした後に笛を吹くと、石が元に戻る
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import {
	AFTER, DESIGN, WATER, ENEMIES, CHEST, BUTTONS, STONES, MIN_PUSHES, THREAT, bestSolution, measureRoom,
} from '../scripts/migrate-d8-0-3-leech-stones.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dungeon_8';
const ROOM = '0,3';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const cellsOf = (g, ch) => g.flatMap((row, r) => [...row].flatMap((x, c) => (x === ch ? [`${r},${c}`] : [])));

test.describe('Blade of Lumia – D8 ヒルと石の泥道（キュー112）', () => {
	test('① 盤面・沼・踏み板と石・宝箱の条件・笛・敵', () => {
		const g = rowsOf(st);
		expect(g, '0,3 の盤面').toEqual(AFTER);
		expect(Object.keys(st.bgTiles).sort(), '沼（bgTiles）').toEqual([...WATER].sort());
		expect(cellsOf(g, 'S'), '踏み板').toEqual(BUTTONS);
		expect(cellsOf(g, '*'), '石').toEqual(STONES);
		expect(st.showConditions, '宝箱は両方の踏み板に石で出る').toEqual({ [CHEST]: { trigger: 'stonesPlaced' } });
		expect(st.chestContents[CHEST], '中身').toEqual({ type: 'rupee', value: 100, name: 'ルピー×100' });
		expect(st.fluteEffect, '笛で石が戻る').toEqual({ type: 'resetStones' });
		const es = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}${ch}`] : [])));
		expect(es, '弱い敵（毒沼ヒル）だけ').toEqual(ENEMIES);
		expect(stageThreat(st, ENEMY_META), '脅威度').toBe(THREAT);
	});

	test('② ソルバー：押し 11・はしごの近道なし・詰む状態あり・閉じ込めなし・石は2つとも要る', () => {
		expect(bestSolution(DESIGN)?.pushes, '最少の押し（はしごあり）').toBe(MIN_PUSHES);
		expect(bestSolution(DESIGN, { ladder: false })?.pushes, '最少の押し（はしごなし）').toBe(MIN_PUSHES);
		const m = measureRoom(DESIGN);
		expect(m.deadlocks, '詰む状態').toBeGreaterThan(0);
		expect(m.noEscape, '口へ戻れなくなる状態').toBe(0);
		for (const s of STONES) {
			const [r, c] = s.split(',').map(Number);
			const walled = DESIGN.map((row, i) => (i === r ? row.slice(0, c) + '#' + row.slice(c + 1) : row));
			expect(bestSolution(walled), `対照：石 ${s} を壁にすると解けない`).toBeNull();
		}
	});
});

// D8 の標準装備（presetsFrom の D8 の min＝道筋どおり）
const previewUrl = (row, col, extra = {}) => {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_hearts: '13', ps_sword: '0', ps_shield: '1', ps_armor: '0', ...extra,
	});
	return `/blade-of-lumia/game/?${p}`;
};
// 半マス（6.5 など）は「まだ着いていない」＝マスにぴったり乗ったときだけ座標を返す（丸めると半マスで次の手へ進んでしまう）
const at = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return Number.isInteger(p.y) && Number.isInteger(p.x) ? `${p.y},${p.x}` : `mid ${p.y},${p.x}`;
});

test.describe('Blade of Lumia – D8 ヒルと石の泥道は実機で解ける（キュー112）', () => {
	test('③ ソルバーの解をなぞると宝箱が出て、ルピー×100 を拾える', async ({ page }) => {
		test.setTimeout(90_000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		const { cells } = bestSolution(DESIGN);
		await freezeGameLoop(page);
		await page.goto(previewUrl(...cells[0].split(',').map(Number)));
		await waitForBoard(page);
		await page.keyboard.press('g');
		// ヒルは解き筋の上に居る＝先に倒しておく（ここで見るのは石の解き筋）
		await page.evaluate(() => { const g = window.__game; for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'bomb'); g.step(2); });
		let pushes = 0;
		for (let i = 1; i < cells.length; i++) {
			const [r0, c0] = cells[i - 1].split(',').map(Number);
			const [r1, c1] = cells[i].split(',').map(Number);
			const dir = r1 < r0 ? 'up' : r1 > r0 ? 'down' : c1 < c0 ? 'left' : 'right';
			const before = await page.evaluate(() => JSON.stringify(window.__game.getStageState().stonePositions ?? {}));
			for (let k = 0; k < 4 && (await at(page)) !== cells[i]; k++) {
				await page.evaluate((d) => { window.__game.setHeroDir(d); window.__game.movePlayer(d); window.__game.step(1); }, dir);
			}
			const after = await page.evaluate(() => JSON.stringify(window.__game.getStageState().stonePositions ?? {}));
			if (before !== after) { pushes++; await page.waitForTimeout(700); }   // 石押しの冷却時間（実時間 600ms）
			expect(await at(page), `手 ${i}：${cells[i - 1]} → ${cells[i]}`).toBe(cells[i]);
		}
		expect(pushes, '押した回数').toBe(MIN_PUSHES);
		const res = await page.evaluate((chest) => {
			const g = window.__game;
			g.step(3);
			const met = g.getStageState().conditionsMet.includes(chest);
			const r0 = g.getPlayer().rupees;
			return { met, r0 };
		}, CHEST);
		expect(res.met, '両方の踏み板に石でも宝箱が出ない').toBe(true);
		// (4,9) → 宝箱 (4,1)：row4 を西へ（石は踏み板の上に移った）
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 18; i++) { g.movePlayer('left'); g.step(1); } g.step(5); });
		const r1 = await page.evaluate(() => window.__game.getPlayer().rupees);
		expect(r1 - res.r0, 'ルピー×100 を拾えていない').toBe(100);
		expect(errors, errors.join('\n')).toEqual([]);
	});

	test('④ 石を動かした後に笛を吹くと、石が元に戻る', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(4, 8, { ps_flute: '1' }));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate(() => {
			const g = window.__game;
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'bomb');
			g.step(2);
			for (let i = 0; i < 2; i++) { g.setHeroDir('left'); g.movePlayer('left'); g.step(1); }   // (4,8) → (4,7)
			for (let i = 0; i < 2; i++) { g.setHeroDir('left'); g.movePlayer('left'); g.step(1); }   // 石 (4,6) を西へ
			const moved = JSON.stringify(g.getStageState().stonePositions ?? {});
			g.useSubItem(); g.step(3);
			return { moved, after: JSON.stringify(g.getStageState().stonePositions ?? {}) };
		});
		expect(res.moved, '前提：石を動かせていない').not.toBe('{}');
		expect(res.after, '笛を吹いても石が戻らない').toBe('{}');
	});
});
