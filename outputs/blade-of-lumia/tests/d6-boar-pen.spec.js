// tests/d6-boar-pen.spec.js
// dungeon_6 `0,1`「猪の囲い」の番人
// （2026-11-06 / PLAN 実行キュー 95 の5室目・盤面は `scripts/migrate-d6-0-1-boar-pen.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間に宝箱（ルピー×10）と木が2本・敵なし。
//
// 新しい盤面（`~` は bgTiles の水）:
//      0 ############
//      1 #~~#.ω..#~~#   ← 突進猪 ω(1,5)＝石の囲いの中
//      2 #~~#....#~~#
//      3 #~~###!##~~#   ← 囲いの南の壁。壊せる壁は (3,6) の1枚だけ
//      4 #B.~~~~~~...   ← 宝箱 B(4,1)＝猪を倒すと現れる・東の口
//      5 #..~~~~~~...
//      6 #..........#   ← 岸。(6,6) が壊せる壁の列
//      9 #####..#####   ← 南の口
//   新しい規則＝突進猪が頭からぶつかった壊せる壁は砕ける（dash.breaksWalls）。
//
// 守るものは3つ。
//   ① データ：盤面・水・宝の中身と出る条件・壊せる壁1枚・通り抜け・爆風が届かない形・敵と脅威度・宣言・層の接続。
//   ② エンジンの前提：猪だけが壊せる壁を砕く（ボスの突進には付いていない）。
//   ③ 挙動（実機）：壊せる壁の列で待つと猪が壁を砕く（勇者は無傷）／対照＝普通の壁の列では頭を打つだけ／
//      砕けた後も列に居れば猪は池に沈み、宝箱が現れて爆弾 +3／岸から爆弾を置いても壁は砕けない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS, stageThreat } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, TARGET, WATER, BOAR, WALL, SHORE, CHEST, PEN, EAST_MOUTH, SOUTH_MOUTH,
	CHEST_CONTENTS, SHOW, BREAKABLE, BLAST_RADIUS, reach,
} from '../scripts/migrate-d6-0-1-boar-pen.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));
const water = new Set(Object.keys(room.bgTiles ?? {}).filter((k) => room.bgTiles[k] === TILE.WATER));
const rc = (k) => k.split(',').map(Number);
const manhattan = (a, b) => { const [ar, ac] = rc(a), [br, bc] = rc(b); return Math.abs(ar - br) + Math.abs(ac - bc); };

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 猪の囲い ① データ', () => {
	test('盤面・水・宝箱の中身と出る条件・壊せる壁は1枚（旧 床の宝箱・木が残っていない）', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect([...water].sort(), '水の下地が違う').toEqual([...WATER].sort());
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(room.showConditions, '宝箱が猪を倒すと現れる、でない').toEqual(SHOW);
		expect(room.breakableWalls).toEqual(BREAKABLE);
		const walls = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ch === TILE.BREAKABLE_WALL) walls.push(`${r},${c}`); }));
		expect(walls, '壊せる壁が (3,6) の1枚でない').toEqual([WALL]);
		expect(grid.flat().filter((ch) => ch === TILE.CHEST).length, '宝箱が1つでない').toBe(1);
		expect(grid.flat().includes(TILE.ITEM_BOMB), '床の爆弾がある（爆弾を持つ前に拾えて 1,2 の授け物が空になる）').toBe(false);
		expect(Object.keys(room.floorItems ?? {}), '床のアイテムが残っている').toEqual([]);
	});

	test('通り抜け：南の口から東の口へ・囲いの外の床は全部届く・囲いには砕けた後も入れない', () => {
		const seen = reach(grid, SOUTH_MOUTH, water);
		expect(EAST_MOUTH.filter((k) => !seen.has(k)), '南の口から東の口へ抜けられない').toEqual([]);
		expect(seen.has(CHEST), '宝箱に届かない').toBe(true);
		const stranded = [];
		grid.forEach((row, r) => row.forEach((ch, c) => {
			const k = `${r},${c}`;
			if (water.has(k) || PEN.includes(k)) return;
			if ((ch === TILE.FLOOR || ch === TILE.CHEST || ENEMY_META[ch]) && !seen.has(k)) stranded.push(k);
		}));
		expect(stranded, '届かない床がある').toEqual([]);
		const opened = reach(grid, SOUTH_MOUTH, water, new Set([WALL]));
		expect(PEN.filter((k) => opened.has(k)), '壁が砕けたら囲いへ歩いて入れる（池が隔てていない）').toEqual([]);
	});

	test('爆弾では開かない：勇者が立てる床から壊せる壁と囲いの中は爆風の外', () => {
		const opened = reach(grid, SOUTH_MOUTH, water, new Set([WALL]));
		const near = [];
		for (const k of opened) for (const tk of [WALL, ...PEN]) if (manhattan(k, tk) <= BLAST_RADIUS) near.push(`${k}→${tk}`);
		expect(near, '爆風が壊せる壁か猪に届く床がある').toEqual([]);
		// 岸・壊せる壁・囲いの中が同じ列で、壁と岸のあいだは水
		const [sr, sc] = rc(SHORE), [wr, wc] = rc(WALL);
		expect(sc).toBe(wc);
		for (let r = wr + 1; r < sr; r++) expect(water.has(`${r},${wc}`), `(${r},${wc}) が水でない＝砕けた後の突進が池へ落ちない`).toBe(true);
	});

	test('敵は突進猪 1体（囲いの中）・脅威度は看板部屋より軽い・宣言・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.CHARGE_BOAR}@${BOAR}`]);
		expect(PEN).toContain(BOAR);
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['2,3'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS に宣言が無い').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: false, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ② エンジンの前提 ─────────────────────────────────────────────────
test('D6 猪の囲い ② 前提：壊せる壁を砕くのは突進猪だけ（ボスの突進には付いていない）', () => {
	expect(ENEMY_META[TILE.CHARGE_BOAR].dash?.breaksWalls, '突進猪が壊せる壁を砕かない').toBe(true);
	const others = Object.entries(ENEMY_META)
		.filter(([ch, m]) => ch !== TILE.CHARGE_BOAR && JSON.stringify(m).includes('"breaksWalls"'))
		.map(([ch]) => ch);
	expect(others, '突進猪以外が壊せる壁を砕く（ボスの部屋の壁が崩れる）').toEqual([]);
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '10', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
// プレビューは既定で無敵（game.js「エディタプレビューは常に無敵」）＝被弾を測る回は G で切る
async function boot(page, url) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url);
	await waitForBoard(page);
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	await step(page, 2);
	return errors;
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
const broken = (page) => page.evaluate(() => [...(window.__game.getStageState().brokenWalls ?? [])].sort());
const boars = (page) => page.evaluate(() => window.__game.getEnemies().map((e) => ({ id: e.id, y: e.y, x: e.x, hp: e.hp })));
// 猪を指定のセルへ置き直す（どの列から来るかを固定する＝さまよいの乱数に合否を預けない）
const placeBoar = (page, r, c) => page.evaluate(([r, c]) => {
	const g = window.__game;
	const e = g.getEnemies()[0];
	g.setEnemyFieldForTest(e.id, { y: r, x: c, homeY: r, homeX: c });
}, [r, c]);
// 次の気絶（stunUntil が新しくなる）まで最大 n tick 回す
const untilStun = (page, n) => page.evaluate((n) => {
	const g = window.__game;
	const last = g.getEnemies()[0]?.stunUntil ?? null;
	for (let i = 1; i <= n; i++) {
		g.step(1);
		const e = g.getEnemies()[0];
		if (e && (e.stunUntil ?? null) !== last) return { tick: i, y: e.y, x: e.x };
	}
	return { tick: null };
}, n);

test.describe('D6 猪の囲い ③ 実機', () => {
	test('壊せる壁の列：岸 (6,6) で待つと猪が突進して壁を砕き、頭を打って囲いの中で止まる（勇者は無傷）', async ({ page }) => {
		const errors = await boot(page, previewUrl(6, 6));
		await placeBoar(page, 2, 6);
		const hp0 = await hp(page);
		expect(await broken(page), '入った時点で壁が砕けている').toEqual([]);
		const s = await untilStun(page, 40);
		expect(s.tick, '猪が壁に頭を打たない').not.toBe(null);
		expect(await broken(page), '猪の突進で壊せる壁が砕けない').toEqual([WALL]);
		expect(s.y, `猪が壁の手前で止まらない（実測 ${JSON.stringify(s)}）`).toBeLessThanOrEqual(2);
		expect(await hp(page), '岸に居たのに傷を負った').toBe(hp0);
		expect(errors).toEqual([]);
	});

	test('対照：普通の壁の列（岸 (6,4)・猪 (2,4)）では頭を打って気絶するだけ＝壁は砕けない', async ({ page }) => {
		await boot(page, previewUrl(6, 4));
		await placeBoar(page, 2, 4);
		const s = await untilStun(page, 40);
		expect(s.tick, '猪が壁に頭を打たない＝対照が空虚').not.toBe(null);
		await step(page, 60);   // 2回目の突進まで回す
		expect(await broken(page), '普通の壁の列なのに壊せる壁が砕けた').toEqual([]);
		expect((await boars(page)).length, '普通の壁の列で猪が倒れた').toBe(1);
	});

	test('砕けた後も列に居れば猪は池に沈む→宝箱が現れ、開けると爆弾 +3', async ({ page }) => {
		const errors = await boot(page, previewUrl(6, 6));
		await placeBoar(page, 2, 6);
		const st = (p) => p.evaluate(() => window.__game.getStageState());
		expect((await st(page)).conditionsMet ?? [], '倒す前から宝箱が出ている').not.toContain(CHEST);
		const gone = await page.evaluate(() => {
			const g = window.__game;
			for (let i = 1; i <= 300; i++) { g.step(1); if (g.getEnemies().length === 0) return i; }
			return null;
		});
		expect(gone, '猪が池に沈まない').not.toBe(null);
		expect(await broken(page)).toEqual([WALL]);
		expect((await st(page)).conditionsMet, '猪が沈んでも宝箱が出ない').toContain(CHEST);
		const b0 = await page.evaluate(() => window.__game.getPlayer().subItems?.bomb?.count ?? 0);
		await walk(page, 'left', 10);   // (6,6) → (6,1)
		await walk(page, 'up', 4);      // → (4,1)＝宝箱
		expect((await st(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await page.evaluate(() => window.__game.getPlayer().subItems?.bomb?.count ?? 0), '爆弾が 3 増えない').toBe(b0 + 3);
		expect(errors).toEqual([]);
	});

	test('岸から爆弾を置いても壊せる壁は砕けず、囲いの猪も傷まない（爆風は池を越えて届かない）', async ({ page }) => {
		await boot(page, previewUrl(6, 6, { ps_bomb: '1' }));
		await placeBoar(page, 2, 6);
		// 猪の突進が先に壁を砕くと測れない＝猪を列の外の奥へ置き直してから爆弾
		await placeBoar(page, 1, 4);
		const [b0] = await boars(page);
		const bombs = () => page.evaluate(() => window.__game.getPlayer().subItems?.bomb?.count ?? 0);
		const n0 = await bombs();
		await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bomb'; });
		await page.evaluate(() => window.__game.useSubItem());
		expect(await bombs(), '爆弾が置けていない＝測定が空虚').toBe(n0 - 1);
		await walk(page, 'left', 4);    // 置いて (6,4) へ離れる＝自分の列に猪を入れない
		await step(page, 24);           // 導火線 16 tick＋余り
		expect(await broken(page), '岸の爆弾で壊せる壁が砕けた').toEqual([]);
		const [b1] = await boars(page);
		expect(b1?.hp, '岸の爆弾で囲いの猪が傷んだ').toBe(b0.hp);
	});
});
