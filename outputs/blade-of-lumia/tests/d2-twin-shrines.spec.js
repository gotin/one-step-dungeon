// tests/d2-twin-shrines.spec.js
// dungeon_2 `2,2`（南東の環の要）「対の祠」の番人
// （2026-10-10 / PLAN 実行キュー 41 の第3陣 1室目・盤面は `scripts/migrate-d2-2-2-twin-shrines.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_1 2,2` の写しからスイッチと刻みを抜いた形＝四角い広間に巡回兵 E×1 だけ（報酬なし）。
//
// 新しい盤面（北の壁に対の祠）:
//      1 #†.##..##.B#   ← 西の祠＝石碑／東の祠＝宝箱
//      2 #..##..##!!#   ← 東の祠の口をひび割れた壁で封じた
//   ひびは剣でもブーメランでも崩れない。爆弾（D6 の報酬）を手にして戻ると1個で崩れ、宝箱に届く。
//
// 守るものは2つ。
//   ① データ（幾何）：東の祠はひびでしか出入りできない・ひびの下から爆弾1個で2枚とも崩せる・層の到達性。
//   ② 挙動（実機）：剣とブーメランではひびが崩れない／爆弾で崩れて宝箱を開けられる／石碑が読める。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET, EXITS, ENTRY, MONUMENT, CHEST, CRACKS, EAST_SHRINE, CHEST_CONTENT, SIGN, BREAK_DEF, targetBg, reach,
} from '../scripts/migrate-d2-2-2-twin-shrines.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_2';
const ROOM = '2,2';
const stages = map.layers[LAYER].stages;

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const cellsOf = (t, pred) => {
	const out = [];
	t.forEach((row, r) => row.forEach((ch, c) => { if (pred(ch)) out.push(`${r},${c}`); }));
	return out;
};

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D2 2,2 対の祠 ① データ', () => {
	test('盤面・石碑の本文・封じた宝箱（条件なし）・ひび2枚・敵は軽い・宣言', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		expect(cellsOf(t, (ch) => ch === TILE.MONUMENT)).toEqual([MONUMENT]);
		expect(st.signData).toEqual({ [MONUMENT]: SIGN });
		expect(SIGN.lines.join(''), '石碑が「刃では解けぬ」を言っていない').toContain('刃では 解けぬ');
		expect(st.chestContents).toEqual({ [CHEST]: CHEST_CONTENT });
		expect(Object.keys(st.showConditions ?? {}), '宝箱に出現条件が付いた（封の向こうに初めから見えているはず）').toEqual([]);
		expect(cellsOf(t, (ch) => ch === TILE.BREAKABLE_WALL)).toEqual(CRACKS);
		expect(st.breakableWalls).toEqual(Object.fromEntries(CRACKS.map((k) => [k, { breakDef: BREAK_DEF }])));
		const threat = stageThreat(st, ENEMY_META);
		expect(threat).toBeGreaterThan(0);
		expect(threat, '看板部屋 2,1 の 25.0 を超えた').toBeLessThan(25);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS の宣言').toBe(true);
	});

	test('下地：祠は石畳・ほかの床は砂（盤面から引く）', () => {
		expect(stages[ROOM].bgTiles).toEqual(targetBg(rowsOf(stages[ROOM])));
		for (const k of [MONUMENT, CHEST]) expect(stages[ROOM].bgTiles[k], `${k} が祠の石畳の上に無い`).toBe(TILE.STONE_FLOOR);
	});

	test('東の祠はひびでしか出入りできない：崩す前は宝箱の前に立てず、崩せば立てる（対照）', () => {
		const t = gridOf();
		const foot = reach(t, ENTRY);
		for (const k of Object.values(EXITS).flat()) expect(foot.has(k), `口 ${k} に歩いて届かない`).toBe(true);
		const inner = EAST_SHRINE.filter((k) => !CRACKS.includes(k) && k !== CHEST);
		for (const k of inner) expect(foot.has(k), `ひびを崩さずに東の祠の ${k} に入れた`).toBe(false);
		const opened = reach(t, ENTRY, new Set(CRACKS));
		for (const k of inner) expect(opened.has(k), `ひびを崩しても東の祠の ${k} に入れない＝測定が空虚`).toBe(true);
	});

	test('ひびの真下の床から爆弾1個で2枚とも爆風に入る', () => {
		const t = gridOf();
		const foot = reach(t, ENTRY);
		for (const k of ['3,9', '3,10']) {
			expect(foot.has(k), `ひびの下 ${k} に立てない`).toBe(true);
			const [r, c] = k.split(',').map(Number);
			for (const cr of CRACKS) {
				const [a, b] = cr.split(',').map(Number);
				expect(Math.hypot(a - r, b - c), `${k} の爆弾が ${cr} に届かない`).toBeLessThanOrEqual(2);
			}
		}
	});

	test('層：dead-edge 0・徒歩の到達室 15', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(foot.reachedRooms.size, '徒歩で歩ける部屋数').toBe(15);
		for (const k of ['2,1', '2,2', '2,3', '1,2', '3,2']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '3', ...extra });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 3);
	await page.evaluate(() => {
		const g = window.__game;
		g.pause();
		for (const e of g.getEnemies()) g.dealDamage(e.id, 99, 'sword', e.x, e.y);   // 群れは添え物＝先に片付ける
		g.step(2);
	});
	return errors;
}
const broken = (page) => page.evaluate(() => [...(window.__game.getStageState().brokenWalls ?? [])].sort());

test.describe('D2 2,2 対の祠 ② 実機', () => {
	test('剣で叩いてもブーメランを当ててもひびは崩れない', async ({ page }) => {
		const errors = await boot(page, 3, 9, { ps_boomerang: '1' });
		const r = await page.evaluate(() => {
			const g = window.__game;
			g.setHeroDir('up');
			for (let i = 0; i < 6; i++) { g.swordAttack(); g.step(3); }
			const afterSword = [...(g.getStageState().brokenWalls ?? [])];
			let thrown = 0;
			for (let k = 0; k < 3; k++) { if (g.useSubItem() !== false) thrown++; for (let i = 0; i < 20; i++) g.step(1); }
			return { afterSword, thrown };
		});
		expect(r.afterSword, '剣でひびが崩れた').toEqual([]);
		expect(await broken(page), 'ブーメランでひびが崩れた').toEqual([]);
		expect(errors).toEqual([]);
	});

	test('ひびの下で爆弾を置くと2枚とも崩れ、奥の宝箱を開けられる', async ({ page }) => {
		const errors = await boot(page, 3, 9, { ps_bomb: '1' });
		const r = await page.evaluate(() => {
			const g = window.__game;
			const go = (d, n) => { for (let i = 0; i < n; i++) { g.movePlayer(d); g.step(1); } };
			g.setHeroDir('up'); g.useSubItem();
			go('down', 6);                       // 爆風の外へ
			for (let i = 0; i < 60; i++) g.step(1);
			const brokenNow = [...(g.getStageState().brokenWalls ?? [])].sort();
			const rupees0 = g.getPlayer().rupees;
			go('up', 12);                        // (3,9) → 崩れた (2,9) → 祠の (1,9)
			go('right', 4);                      // 宝箱 (1,10) へ
			return { brokenNow, at: [g.getPlayer().y, g.getPlayer().x], opened: [...g.getStageState().openedChests], rupees0, rupees1: g.getPlayer().rupees };
		});
		expect(r.brokenNow, '爆弾でひびが2枚とも崩れていない').toEqual([...CRACKS].sort());
		expect(r.at[0], '祠の中へ歩いて入れていない').toBe(1);
		expect(r.opened, '奥の宝箱が開かない').toContain(CHEST);
		expect(r.rupees1 - r.rupees0, '宝箱の中身').toBe(CHEST_CONTENT.value);
		expect(errors).toEqual([]);
	});

	test('西の祠の石碑を読める（本文の1行目が出る）', async ({ page }) => {
		const errors = await boot(page, 2, 1);
		await page.evaluate(() => { const g = window.__game; g.setHeroDir('up'); g.swordAttack(); g.step(2); });
		await expect(page.locator('body')).toContainText(SIGN.lines[0]);
		expect(errors).toEqual([]);
	});
});
