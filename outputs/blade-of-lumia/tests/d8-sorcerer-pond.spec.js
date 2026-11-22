// tests/d8-sorcerer-pond.spec.js
// dungeon_8 `2,2`＝術士の沼の環（戦闘の部屋）の番人。
//
// 経緯：キュー112（2026-11-20・`scripts/migrate-d8-2-2-sorcerer-pond.mjs`）。直す前は E×2 の素の四つ辻。
// 真ん中に沼と小島、周りの幅2の環が四つの口をつなぐ。四隅に術士×2・爆弾鬼・分裂スライム。全滅で小島に宝箱（回復薬（大））。
//
// 守るもの：
// ① 盤面・沼・敵の組み合わせ・向き・宝箱の条件・脅威度・通り道（四つの口は戦わずに通れる・小島へははしごだけ）
// ② 実機：はしご無しでは小島へ渡れない（対照）・はしごなら北から渡れる
// ③ 実機：全滅させると小島に宝箱が出て、回復薬（大）を拾える
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { reach } from '../scripts/migrate-d8-2-3-island-turrets.mjs';
import {
	AFTER, WATER, ENEMIES, DIRS_AFTER, CHEST, ISLAND, LANDINGS, THREAT,
} from '../scripts/migrate-d8-2-2-sorcerer-pond.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dungeon_8';
const ROOM = '2,2';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – D8 術士の沼の環（キュー112）', () => {
	test('① 盤面・沼・敵・宝箱の条件・脅威度・通り道', () => {
		const g = rowsOf(st);
		expect(g, '2,2 の盤面').toEqual(AFTER);
		expect(Object.keys(st.bgTiles).sort(), '沼（bgTiles）').toEqual([...WATER].sort());
		const es = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}${ch}`] : [])));
		expect(es, 'η×2・λ・δ').toEqual(ENEMIES);
		expect(st.enemyDirs, '向き').toEqual(DIRS_AFTER);
		expect(st.showConditions, '宝箱は全滅で出る').toEqual({ [CHEST]: { trigger: 'killAll' } });
		expect(st.chestContents[CHEST].item, '中身').toBe('bigHealPotion');
		expect(stageThreat(st, ENEMY_META), '脅威度').toBe(THREAT);
		const water = new Set(WATER);
		const foot = reach(g, water, LANDINGS);
		expect(LANDINGS.every((k) => foot.has(k)), '四つの口が戦わずにつながる').toBe(true);
		expect(ISLAND.some((k) => foot.has(k)), '歩きで小島へ入れる').toBe(false);
		expect(ISLAND.every((k) => reach(g, water, LANDINGS, { ladder: true }).has(k)), 'はしごで小島へ渡れる').toBe(true);
	});
});

const previewUrl = (row, col, extra = {}) => {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_hearts: '13', ps_sword: '0', ps_shield: '1', ps_armor: '0', ...extra,
	});
	return `/blade-of-lumia/game/?${p}`;
};
const walk = (dir, half) => { const g = window.__game; for (let i = 0; i < half; i++) { g.movePlayer(dir); g.step(1); } return g.getPlayer().y; };

test.describe('Blade of Lumia – D8 術士の沼の環は実機で遊べる（キュー112）', () => {
	test('② はしご無しでは小島へ渡れない・はしごなら北から渡れる', async ({ page }) => {
		await freezeGameLoop(page);
		for (const [ladder, expectY] of [['0', (y) => y >= 2], ['1', (y) => y >= 4]]) {
			await page.goto(previewUrl(2, 5, { ps_ladder: ladder }));
			await waitForBoard(page);
			await page.keyboard.press('g');
			// 敵を消して（術士の瞬間移動で道を塞がれないように）通れるかだけを見る
			await page.evaluate(() => { const g = window.__game; for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'bomb'); g.step(2); });
			const y = await page.evaluate(`(${walk})('down', 4)`);
			expect(expectY(y), `はしご ${ladder}：y=${y}`).toBe(true);
			if (ladder === '0') expect(y, '対照：はしご無しで水 (3,5) に入った').toBeLessThan(2.6);
		}
	});

	test('③ 全滅させると小島に宝箱が出て、回復薬（大）を拾える', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		await page.goto(previewUrl(2, 6, { ps_ladder: '1' }));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate((chest) => {
			const g = window.__game;
			const out = { types: g.getEnemies().map((e) => e.type).sort() };
			out.before = g.getStageState().conditionsMet.includes(chest);
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'bomb');
			g.step(3);
			out.left = g.getEnemies().length;
			out.after = g.getStageState().conditionsMet.includes(chest);
			out.p0 = g.getPlayer().subItems?.bigHealPotion?.count ?? 0;
			for (let i = 0; i < 4; i++) { g.movePlayer('down'); g.step(1); }   // (2,6) → 水 (3,6) をはしごで → 宝箱 (4,6)
			g.step(5);
			out.p1 = g.getPlayer().subItems?.bigHealPotion?.count ?? 0;
			return out;
		}, CHEST);
		expect(res.types, '敵の種類').toEqual(['η', 'λ', 'δ', 'η'].sort());
		expect(res.before, '最初から宝箱が出ている').toBe(false);
		expect(res.left, '前提：全滅').toBe(0);
		expect(res.after, '全滅しても宝箱が出ない').toBe(true);
		expect(res.p1, '回復薬（大）を拾えていない').toBe(res.p0 + 1);
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
