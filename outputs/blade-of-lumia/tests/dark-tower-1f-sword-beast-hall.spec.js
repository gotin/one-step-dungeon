// tests/dark-tower-1f-sword-beast-hall.spec.js
// 暗黒の塔 1F の踊り場 `1,0`＝剣獣 μ の習い場（実行キュー111・2026-11-16・
// `scripts/migrate-dark-tower-111-1f-landing.mjs` が書いた）。
//
// 直す前は E×4 の素の箱で、すぐ南の `1,2`（μ×5 の巣）が μ の初出だった。
// 新しい姿＝柱（1×2）4本の間に μ を1体だけ。守るもの：
// ① 盤面と境界（南の口だけ・階段はそのまま）・μ は1体だけ
// ② 着地の安全＝±2 に敵なし・μ は同じ行/列に居ない・着地の真上が柱（入った瞬間は北から撃たれない）
// ③ 柱が射線を切る＝μ が着地と同じ列 (col4) のどこに立っても、間に柱がある（北側の段）
// ④ 実機＝μ が1体 spawn し、着いてから 1 秒は撃たれない・本道（南の口）まで歩ける

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TICK_MS } from '../game/constants.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dark_tower';
const KEY = '1,0';
const LANDING = [6, 4];
const ROWS = [
	'############',
	'#..........#',
	'#....μ.....#',
	'#..##..##..#',
	'#..........#',
	'#..##..##..#',
	'#...>......#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

const st = map.layers[LAYER].stages[KEY];
const grid = () => st.tiles.map((r) => (Array.isArray(r) ? r.slice() : [...r]));
const enemiesOf = (g) => {
	const out = [];
	g.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) out.push({ r, c, ch }); }));
	return out;
};

test.describe('Blade of Lumia – dark_tower 1,0 剣獣の習い場（キュー111）', () => {

	test('① 盤面・境界・敵は μ 1体', () => {
		const g = grid();
		expect(g.map((r) => r.join('')), `${KEY} の盤面`).toEqual(ROWS);
		expect(st.mapEnters?.['6,4']?.id, '階段（1fEntrance）はそのまま').toBe('1fEntrance');
		const es = enemiesOf(g);
		expect(es.map((e) => e.ch), '敵は μ 1体だけ').toEqual(['μ']);
		expect(Object.keys(st.enemyDirs ?? {}), 'enemyDirs は μ の位置だけ').toEqual([`${es[0].r},${es[0].c}`]);
		expect(ENEMY_META['μ'].attacks.some((a) => a.type === 'swordBeam'), '前提：μ は剣ビームを撃つ').toBe(true);
	});

	test('② 着地が安全（±2 に敵なし・同じ行/列に居ない・真上が柱）', () => {
		const g = grid();
		const [lr, lc] = LANDING;
		for (const e of enemiesOf(g)) {
			expect(Math.max(Math.abs(e.r - lr), Math.abs(e.c - lc)), `${e.ch}(${e.r},${e.c}) が着地 ±2 の内`).toBeGreaterThan(2);
			expect(e.r === lr || e.c === lc, `${e.ch}(${e.r},${e.c}) が着地と同じ行/列`).toBe(false);
		}
		expect(g[lr - 1][lc], '着地の真上 (5,4) は柱').toBe('#');
	});

	test('③ 着地の列 (col4) の北側はどこからでも柱が射線を切る', () => {
		// μ は縦横がそろった時だけ、2.5 マス以上離れて撃つ（minRange）。着地の北で撃てる位置
		// ＝col4 の row 1〜3（距離 3 以上）。そこから着地までの間に柱があること。
		const g = grid();
		const [lr, lc] = LANDING;
		const minRange = ENEMY_META['μ'].attacks.find((a) => a.type === 'swordBeam').minRange;
		const open = [];
		for (let r = 1; r < lr; r++) {
			if (g[r][lc] === '#' || lr - r < minRange) continue;
			let blocked = false;
			for (let k = r + 1; k < lr; k++) if (g[k][lc] === '#') blocked = true;
			if (!blocked) open.push(r);
		}
		expect(open, '柱に遮られずに着地を撃てる北の位置').toEqual([]);
	});

	test('④ 実機：μ が1体出て、着いて 1 秒は撃たれず、南の口まで歩ける', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		const p = new URLSearchParams({
			fromEditor: '1', layer: LAYER, stage: KEY, row: String(LANDING[0]), col: String(LANDING[1]),
			ps_weapon: '1', ps_hearts: '20', ps_shield: '2',
		});
		await page.goto(`/blade-of-lumia/game/?${p}`);
		await waitForBoard(page);

		const res = await page.evaluate((ticks) => {
			const g = window.__game;
			const enemies = g.getEnemies().map((e) => ({ type: e.type, id: e.id }));
			const hp0 = g.getPlayer().hp;
			g.step(ticks);
			const hp1 = g.getPlayer().hp;
			return { enemies, hp0, hp1 };
		}, Math.ceil(1000 / TICK_MS));
		expect(res.enemies.map((e) => `${e.type}@${e.id}`), 'μ が (2,5) に1体').toEqual(['μ@2,5']);
		expect(res.hp1, '着いて 1 秒で撃たれた').toBe(res.hp0);

		// 本道＝着地 (6,4) → 東へ1 → 南へ3 で (9,5) の口。南へ出ると 1,1 へ移る。
		await page.evaluate(() => {
			const g = window.__game;
			for (let i = 0; i < 2; i++) { g.movePlayer('right'); g.step(1); }
			for (let i = 0; i < 10; i++) { g.movePlayer('down'); g.step(1); }
		});
		await page.waitForFunction(() => window.__game.getState().stageKey === '1,1', null, { timeout: 5000 });
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
