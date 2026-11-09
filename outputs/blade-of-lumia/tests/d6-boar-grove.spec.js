// tests/d6-boar-grove.spec.js
// dungeon_6 `0,2`「猪の木立ち」の番人
// （2026-11-05 / PLAN 実行キュー 95 の2室目・盤面は `scripts/migrate-d6-0-2-boar-grove.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間に宝箱（ルピー×5）・茂み・消えたかがり火が1つずつ・敵なし。
//
// 新しい盤面:
//      0 #####..#####   ← 北の口（0,1 へ）
//      2 #.t..t..t..#
//      4 #.t..t..t...   ← 東の口（1,2 爆弾の櫃から）
//      6 #.t..t..t..#   ← 木の柱は縦横3マスおきに9本
//      7 #...ω......#   ← 突進猪 ω(7,4)
//      8 #B........u#   ← 宝箱 B(8,1)＝猪を倒すと現れる
//   猪は列に入れば間に何があっても突進する＝木の陰に立てば目の前の木に頭を打って気絶する。
//
// 守るものは3つ。
//   ① データ：盤面・宝の中身と出る条件・通り抜け・木の柱の形・敵と脅威度・宣言・層の接続。
//   ② エンジンの前提：猪の突進の数字（気絶・溜め・突進の最短距離）。
//   ③ 挙動（実機）：木の陰で待つと猪は木に頭を打ち続けて届かない（対照＝木の無い列だと轢かれる）／
//      気絶の間に回り込めば斬れる／倒すと宝箱が現れてルピー +50（キュー100 で増額）／戦わずに東の口から北の口へ抜けられる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS, stageThreat } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, TARGET, CHEST, BOAR, EAST_MOUTH, NORTH_MOUTH, TREES, CHEST_CONTENTS, SHOW, reach,
} from '../scripts/migrate-d6-0-2-boar-grove.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));
const rc = (k) => k.split(',').map(Number);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 猪の木立ち ① データ', () => {
	test('盤面・宝箱の中身と出る条件（旧 床の宝箱・茂み・かがり火が残っていない）', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(room.showConditions, '宝箱が猪を倒すと現れる、でない').toEqual(SHOW);
		const flat = grid.flat();
		expect(flat.filter((ch) => ch === TILE.CHEST).length, '宝箱が1つでない').toBe(1);
		expect(flat.includes(TILE.TORCH), 'どこにもつながらないかがり火が残っている').toBe(false);
		expect(flat.includes(TILE.ITEM_BOMB) || flat.includes(TILE.BREAKABLE_WALL), '爆弾の部屋になっている（1室目 0,3 と同じ形）').toBe(false);
		expect(Object.keys(room.floorItems ?? {}), '床のアイテムが残っている').toEqual([]);
	});

	test('通り抜け：東の口から北の口へ・床は全部届く', () => {
		const seen = reach(grid, EAST_MOUTH);
		expect(NORTH_MOUTH.filter((k) => !seen.has(k)), '東の口から北の口へ抜けられない').toEqual([]);
		const stranded = [];
		grid.forEach((row, r) => row.forEach((ch, c) => {
			if ((ch === TILE.FLOOR || ch === TILE.CHEST || ENEMY_META[ch]) && !seen.has(`${r},${c}`)) stranded.push(`${r},${c}`);
		}));
		expect(stranded, '届かない床がある').toEqual([]);
	});

	test('木の柱：9本・どれも四方が床（縦にも横にも陰に立つ側と猪が来る側がある）', () => {
		expect(grid.flat().filter((ch) => ch === TILE.TREE).length).toBe(TREES.length);
		const floorAt = (r, c) => [TILE.FLOOR, TILE.CHEST].includes(grid[r]?.[c]) || !!ENEMY_META[grid[r]?.[c]];
		const bad = TREES.filter((k) => {
			const [r, c] = rc(k);
			return grid[r][c] !== TILE.TREE || !(floorAt(r - 1, c) && floorAt(r + 1, c) && floorAt(r, c - 1) && floorAt(r, c + 1));
		});
		expect(bad, '四方が床でない木がある').toEqual([]);
	});

	test('敵は突進猪 1体・脅威度は看板部屋より軽い・宣言・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.CHARGE_BOAR}@${BOAR}`]);
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['2,3'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS に宣言が無い').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: false, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ② エンジンの前提 ─────────────────────────────────────────────────
test('D6 猪の木立ち ② 前提：突進は地形に当たると気絶・溜めの予告・密着では走らない', () => {
	const dash = ENEMY_META[TILE.CHARGE_BOAR].dash;
	expect(dash.stunMs, '激突で気絶しない＝木の陰に立つ意味が消える').toBeGreaterThan(0);
	expect(dash.windupMs, '溜めの予告が無い').toBeGreaterThan(0);
	// 木1本を挟んで向かい合う最短の形（勇者・木・空き・猪）は中心どうしで 3＝minRange の内側
	expect(3 - 0.5, '木を挟んだ距離 3 で突進しない＝陰の立ち位置を測り直す').toBeGreaterThanOrEqual(dash.minRange);
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '10', ps_rupees: '100', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
// プレビューは既定で無敵（game.js「エディタプレビューは常に無敵」）＝被弾を測る回は G で切る
async function boot(page, url) {
	await page.goto(url);
	await waitForBoard(page);
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	await step(page, 2);
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// movePlayer 1回＝半マス（[[blade-moveplayer-is-half-tile]]）。
async function walk(page, dir, ops) {
	for (let i = 0; i < ops; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
	}
}
const hp = (page) => page.evaluate(() => window.__game.getState().player.hp);
const boars = (page) => page.evaluate(() => window.__game.getEnemies().map((e) => ({ id: e.id, y: e.y, x: e.x, hp: e.hp, stunUntil: e.stunUntil ?? null })));

// 猪を指定のセルへ置き直す（どこから来るかを固定する＝さまよいの乱数に合否を預けない）
const placeBoar = (page, r, c) => page.evaluate(([r, c]) => {
	const g = window.__game;
	const e = g.getEnemies()[0];
	g.setEnemyFieldForTest(e.id, { y: r, x: c, homeY: r, homeX: c });
}, [r, c]);
// 次の気絶（stunUntil が新しくなる）まで最大 n tick 回す。気絶した位置と tick を返す
const untilStun = (page, n) => page.evaluate((n) => {
	const g = window.__game;
	const last = g.getEnemies()[0]?.stunUntil ?? null;
	for (let i = 1; i <= n; i++) {
		g.step(1);
		const e = g.getEnemies()[0];
		if (e && (e.stunUntil ?? null) !== last) return { tick: i, y: e.y, x: e.x, hp: e.hp };
	}
	const e = g.getEnemies()[0];
	return { tick: null, y: e?.y, x: e?.x, hp: e?.hp };
}, n);

test.describe('D6 猪の木立ち ③ 実機', () => {
	test('木の陰：勇者 (3,5)・木 (6,5)・猪 (7,5) の列で、猪は木に頭を打って気絶し勇者は無傷', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(3, 5));
		await placeBoar(page, 7, 5);
		const hp0 = await hp(page);
		const s = await untilStun(page, 40);
		expect(s.tick, '猪が木に頭を打って気絶しない').not.toBe(null);
		expect(s.y, `猪が木の列を越えて北へ来た（実測 ${JSON.stringify(s)}）`).toBeGreaterThanOrEqual(6.5);
		expect(await hp(page), '木の陰に居たのに轢かれた').toBe(hp0);
		expect(errors).toEqual([]);
	});

	test('対照：木の無い列（勇者 (3,4)・猪 (7,4)）だと轢かれる（盾は木＝測定が空虚でない）', async ({ page }) => {
		await boot(page, previewUrl(3, 4));
		await placeBoar(page, 7, 4);
		const hp0 = await hp(page);
		// 溜め 3 tick＋突進 2 tick で届く。体当たり（slam）は突進の硬直明け（実測 19 tick 目）＝10 tick で切って突進だけを測る
		await step(page, 10);
		expect(await hp(page), '木の無い列でも突進に轢かれない＝木の陰の番人が空虚').toBeLessThan(hp0);
	});

	test('気絶の間に回り込めば斬れる（木の陰 (3,5) から列6を降りて猪の東隣へ）', async ({ page }) => {
		await boot(page, previewUrl(3, 5));
		await placeBoar(page, 7, 5);
		const hp0 = await hp(page);
		const s = await untilStun(page, 40);
		expect(s.tick, '猪が気絶しない').not.toBe(null);
		await walk(page, 'right', 2);   // (3,5) → (3,6)
		await walk(page, 'down', 8);    // → (7,6)＝猪の東隣
		await page.evaluate(() => window.__game.setHeroDir('left'));
		for (let i = 0; i < 3; i++) {
			await page.evaluate(() => window.__game.swordAttack());
			await step(page, 3);
		}
		const [b] = await boars(page);
		expect(b?.hp ?? 0, '気絶した猪を斬れない').toBeLessThan(s.hp);
		expect(await hp(page), '回り込む間に轢かれた').toBe(hp0);
	});

	test('倒すと宝箱が現れ、開けるとルピー +50', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(8, 3));
		expect((await page.evaluate(() => window.__game.getStageState())).conditionsMet ?? [], '倒す前から宝箱が出ている').not.toContain(CHEST);
		const [b] = await boars(page);
		await page.evaluate((id) => window.__game.dealDamage(id, 99, 'sword'), b.id);
		await step(page, 4);
		expect(await boars(page), '猪が倒れない').toEqual([]);
		expect((await page.evaluate(() => window.__game.getStageState())).conditionsMet, '倒しても宝箱が出ない').toContain(CHEST);
		const r0 = await page.evaluate(() => window.__game.getState().player.rupees);
		await walk(page, 'left', 4);   // (8,3) → (8,1)＝宝箱
		expect((await page.evaluate(() => window.__game.getStageState())).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await page.evaluate(() => window.__game.getState().player.rupees), 'ルピーが 50 増えない').toBe(r0 + 50);
		expect(errors).toEqual([]);
	});

	test('戦わずに東の口から北の口へ抜けられる（迂回路＝通り抜けに条件を付けない）', async ({ page }) => {
		await boot(page, previewUrl(4, 10));
		const hp0 = await hp(page);
		await walk(page, 'up', 6);      // (4,10) → (1,10)
		await walk(page, 'left', 8);    // → (1,6)
		for (let i = 0; i < 8; i++) {
			await walk(page, 'up', 1);
			if ((await page.evaluate(() => window.__game.getState().stageKey)) !== ROOM) break;
		}
		await page.waitForFunction(() => window.__game.getState().stageKey === '0,1');
		expect(await hp(page), '通り抜ける間に轢かれた').toBe(hp0);
	});
});
