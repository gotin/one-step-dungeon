// tests/dark-tower-5f-gatekeeper.spec.js
// dark_tower 5F `5,2`＝玉座の門番の間（戦闘の部屋）の番人。
//
// 経緯：キュー111（2026-11-18・`scripts/migrate-dark-tower-111-5f-gate.mjs`）。直す前（20b ⑤-a）は ζ×2・μ の 117 で、
// 通路を空けて走り抜けを残していた。ユーザー判断＝5,0（呪い火の踊り場・147）くらいの強さに上げる。
// 盾騎士 ζ×2 を扉の前に北向きで並べ、剣獣 μ・突進猪 ω と組ませ（153）、南の口の手前を鍵の扉で閉じた（鍵は全滅で出る）。
//
// 守るもの：
// ① 盤面・敵の組み合わせ・向き・鍵の条件・脅威度（3F の大広間以上・162 以下）
// ② 通り道（鍵なしでは南の口へ届かない）と着地の安全
// ③ 実機：鍵なしでは扉を抜けられない
// ④ 実機：全滅させると鍵が出て、扉を開けて玉座の間 5,3 へ
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { walkable, clearLine } from '../scripts/migrate-dark-tower-111-3f-stairs.mjs';
import {
	AFTER, ENEMIES, DIRS_AFTER, KEY_CELL, DOOR, NORTH_IN, SOUTH_OUT, THREAT,
} from '../scripts/migrate-dark-tower-111-5f-gate.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dark_tower';
const ROOM = '5,2';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – dark_tower 5F 玉座の門番の間（キュー111）', () => {
	test('① 盤面・敵の組み合わせ・鍵の条件・脅威度', () => {
		const g = rowsOf(st);
		expect(g, '5,2 の盤面').toEqual(AFTER);
		const es = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}${ch}`] : [])));
		expect(es, 'ω・ζ×2・μ').toEqual(ENEMIES);
		expect(st.enemyDirs, '向き（盾騎士は北＝入ってきたプレイヤーへ盾）').toEqual(DIRS_AFTER);
		expect(st.showConditions, '鍵は全滅で出る').toEqual({ [KEY_CELL]: { trigger: 'killAll' } });
		expect(g[8], '南の口の手前は扉 (8,5) だけ').toBe('#####D######');
		const t = stageThreat(st, ENEMY_META);
		expect(t, '脅威度').toBe(THREAT);
		expect(t, '1室の上限').toBeLessThanOrEqual(162);
		expect(t, '5,0（呪い火の踊り場）くらいの強さ').toBeGreaterThanOrEqual(stageThreat(map.layers[LAYER].stages['5,0'], ENEMY_META));
	});

	test('② 通り道と着地の安全', () => {
		const g = rowsOf(st);
		const closed = walkable(g, NORTH_IN);
		expect(closed.has(KEY_CELL), '鍵のセルへ歩いて行ける').toBe(true);
		expect(SOUTH_OUT.some((k) => closed.has(k)), '鍵なしで南の口に届く（戦いが飾り）').toBe(false);
		expect(SOUTH_OUT.every((k) => walkable(g, NORTH_IN, { open: true }).has(k)), '扉を開くと南の口に届く').toBe(true);
		const noDoor = g.map((r, i) => (i === 8 ? r.replace('D', '.') : r));
		expect(walkable(noDoor, NORTH_IN).has(SOUTH_OUT[0]), '対照：扉を外すと届く').toBe(true);
		for (const land of [...NORTH_IN, '1,5', '1,6', ...SOUTH_OUT, DOOR]) {
			for (const e of ENEMIES) {
				const pos = e.slice(0, -1);
				const [r, c] = pos.split(',').map(Number), [lr, lc] = land.split(',').map(Number);
				expect(Math.max(Math.abs(r - lr), Math.abs(c - lc)), `着地 ${land} と ${e} が近い`).toBeGreaterThanOrEqual(3);
				if ('μω'.includes(e.slice(-1))) expect(clearLine(g, pos, land), `着地 ${land} が ${e} の線上`).toBe(false);
			}
		}
	});
});

// 塔の標準装備（DECISIONS 2026-11-17・キュー21 の dt-start）
const previewUrl = (row, col) => {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_hearts: '15', ps_sword: '2', ps_shield: '2', ps_armor: '0',
	});
	return `/blade-of-lumia/game/?${p}`;
};

test.describe('Blade of Lumia – dark_tower 5F 玉座の門番の間は実機で抜けられる（キュー111）', () => {
	test('③ 鍵なしでは扉を抜けられない', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(7, 5));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate(() => {
			const g = window.__game;
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'bomb');
			g.step(2);
			const left = g.getEnemies().length;
			for (let i = 0; i < 10; i++) { g.movePlayer('down'); g.step(1); }
			return { left, y: g.getPlayer().y, stage: g.getState().stageKey, keys: g.getPlayer().keys };
		});
		expect(res.left, '前提：全滅').toBe(0);
		expect(res.keys ?? 0, '前提：鍵を持っていない').toBe(0);
		expect(res.stage, '扉を抜けて玉座の間へ出てしまった').toBe(ROOM);
		expect(res.y, '扉 (8,5) を抜けた').toBeLessThanOrEqual(7);
		await page.keyboard.press('g');
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 10; i++) { g.movePlayer('down'); g.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '5,3', null, { timeout: 5000 });
	});

	test('④ 全滅させると鍵が出て、扉を開けて玉座の間 5,3 へ', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		await page.goto(previewUrl(4, 5));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate((keyCell) => {
			const g = window.__game;
			const walk = (dir, tiles) => { for (let i = 0; i < tiles * 2; i++) { g.movePlayer(dir); g.step(1); } };
			const out = { types: g.getEnemies().map((e) => e.type).sort() };
			out.keyBefore = g.getStageState().conditionsMet.includes(keyCell);
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'bomb');
			g.step(2);
			out.left = g.getEnemies().length;
			out.keyAfter = g.getStageState().conditionsMet.includes(keyCell);
			walk('down', 2);                        // (4,5) → 鍵 (6,5)
			out.keys = g.getPlayer().keys;
			walk('down', 5);                        // → 扉 (8,5) → 南の口 (9,5) → 5,3
			return out;
		}, KEY_CELL);
		expect(res.types, '敵の種類').toEqual(['ω', 'ζ', 'ζ', 'μ'].sort());
		expect(res.keyBefore, '最初から鍵が出ている').toBe(false);
		expect(res.left, '前提：全滅').toBe(0);
		expect(res.keyAfter, '全滅しても鍵が出ない').toBe(true);
		expect(res.keys, '鍵を拾えていない').toBe(1);
		await page.waitForFunction(() => window.__game.getState().stageKey === '5,3', null, { timeout: 5000 });
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
