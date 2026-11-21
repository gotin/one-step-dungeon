// tests/d8-shell-pools.spec.js
// dungeon_8 `4,2`＝甲羅と呪い火の池（戦闘の部屋）の番人。
//
// 経緯：キュー112（2026-11-21・`scripts/migrate-d8-4-2-shell-pools.mjs`）。直す前は床にルピー×3 だけの三つ辻。
// 2×2 の池4つで井の字の通路。火吐き亀×2・呪い火×2・地中蟲×2。全滅で宝箱（回復薬）。
//
// 守るもの：
// ① 盤面・池・敵の組み合わせ・宝箱の条件・脅威度・通り道（三つの口は戦わずに通れる）
// ② 実機：呪い火は池の上を渡って来る・亀と蟲は池に入らない（600 tick）
// ③ 実機：全滅させると宝箱が出て、回復薬を拾える
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { reach } from '../scripts/migrate-d8-2-3-island-turrets.mjs';
import {
	AFTER, WATER, ENEMIES, CHEST, CONTENT, LANDINGS, THREAT,
} from '../scripts/migrate-d8-4-2-shell-pools.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dungeon_8';
const ROOM = '4,2';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – D8 甲羅と呪い火の池（キュー112）', () => {
	test('① 盤面・池・敵・宝箱の条件・脅威度・通り道', () => {
		const g = rowsOf(st);
		expect(g, '4,2 の盤面').toEqual(AFTER);
		expect(Object.keys(st.bgTiles).sort(), '池（bgTiles）').toEqual([...WATER].sort());
		const es = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}${ch}`] : [])));
		expect(es, 'φ×2・ψ×2・α×2').toEqual(ENEMIES);
		expect(st.showConditions, '宝箱は全滅で出る').toEqual({ [CHEST]: { trigger: 'killAll' } });
		expect(st.chestContents[CHEST], '中身').toEqual(CONTENT);
		expect(stageThreat(st, ENEMY_META), '脅威度').toBe(THREAT);
		const foot = reach(g, new Set(WATER), LANDINGS);
		expect(LANDINGS.every((k) => foot.has(k)), '三つの口が戦わずにつながる').toBe(true);
	});
});

const previewUrl = (row, col) => `/blade-of-lumia/game/?${new URLSearchParams({
	fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
	ps_hearts: '13', ps_sword: '0', ps_shield: '1', ps_armor: '0',
})}`;

test.describe('Blade of Lumia – D8 甲羅と呪い火の池は実機で遊べる（キュー112）', () => {
	test('② 呪い火は池を渡って来る・亀と蟲は池に入らない', async ({ page }) => {
		test.setTimeout(60_000);
		await freezeGameLoop(page);
		await page.goto(previewUrl(1, 5));
		await waitForBoard(page);
		// 無敵のまま（倒れないように）北の口で待つ＝敵の動きだけを見る
		const res = await page.evaluate(async (water) => {
			const g = window.__game; const W = new Set(water);
			const onWater = {};
			for (let i = 0; i < 600; i++) {
				g.step(1);
				if (i % 4 === 0) await new Promise((r) => setTimeout(r, 12));
				for (const e of g.getEnemies()) {
					const y = e.r ?? e.y, x = e.c ?? e.x;
					const cells = [[Math.floor(y), Math.floor(x)], [Math.ceil(y), Math.ceil(x)]];
					if (cells.some(([r, c]) => W.has(`${r},${c}`))) onWater[e.type] = (onWater[e.type] ?? 0) + 1;
				}
			}
			return onWater;
		}, WATER);
		expect(res['ψ'] ?? 0, '呪い火が池を渡らない').toBeGreaterThan(0);
		expect(res['φ'] ?? 0, '火吐き亀が池に入った').toBe(0);
		expect(res['α'] ?? 0, '地中蟲が池に入った').toBe(0);
	});

	test('③ 全滅させると宝箱が出て、回復薬を拾える', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		await page.goto(previewUrl(4, 8));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate((chest) => {
			const g = window.__game;
			const out = { types: g.getEnemies().map((e) => e.type).sort() };
			out.before = g.getStageState().conditionsMet.includes(chest);
			// 潜っている地中蟲には何も効かない＝顔を出した時に倒す（最大 800 tick 待つ）
			for (let k = 0; k < 800 && g.getEnemies().length; k++) { for (const e of g.getEnemies()) if (!e.hidden) g.dealDamage(e.id, 9999, 'bomb'); g.step(1); }
			out.left = g.getEnemies().map((e) => e.type);
			out.after = g.getStageState().conditionsMet.includes(chest);
			out.p0 = g.getPlayer().subItems?.healPotion?.count ?? 0;
			for (let i = 0; i < 2; i++) { g.movePlayer('right'); g.step(1); }   // (4,8) → (4,9)、宝箱 (4,10) の前
			for (let i = 0; i < 2; i++) { g.movePlayer('right'); g.step(1); }
			g.step(5);
			out.p1 = g.getPlayer().subItems?.healPotion?.count ?? 0;
			return out;
		}, CHEST);
		expect(res.types, '敵の種類').toEqual(['φ', 'φ', 'ψ', 'ψ', 'α', 'α'].sort());
		expect(res.before, '最初から宝箱が出ている').toBe(false);
		expect(res.left, '前提：全滅').toEqual([]);
		expect(res.after, '全滅しても宝箱が出ない').toBe(true);
		expect(res.p1, '回復薬を拾えていない').toBe(res.p0 + 1);
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
