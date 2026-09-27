// tests/d3-tide-path.spec.js
// dungeon_3 `3,0`「潮の引く道」の番人
// （2026-09-27 / PLAN 実行キュー 34 の2室目・盤面は `scripts/migrate-d3-3-0-tide-path.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   石 *(3,5)・ボタン S(5,5)・門 T(5,9)・宝箱 B(5,10) の部屋で、宝箱は (4,10)(6,10) から
//   素で歩いて開けられた＝石もボタンも門も何も守っていない飾り。
//
// 守るものは3つ。
//   ① データ（幾何とソルバー）：宝箱への道は潮 3 枚だけ／石を押さないと届かない（足で踏むだけでは
//      潮が満ちる）／石は外周にも潮のセルにも入らない／はしごで入江を渡れない。
//   ② データ（層の到達性）：dead-edge 0・到達室数は不変。
//   ③ 挙動（実機）：足で踏む間だけ潮が引く／石をボタンへ運ぶと潮が引いたまま（石ロック）→
//      宝箱でルピー +30／押し間違えても部屋を出入りすれば石が戻る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE, TILE_META } from '../shared/tiles.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { makeSolver, isRing } from '../scripts/lib/blade-solver.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_3';
const ROOM = '3,0';
const stages = map.layers[LAYER].stages;
const ROWS = 10, COLS = 12;

const BUTTON = '6,8';
const TIDES = ['2,9', '3,9', '4,9'];
const CHEST = '1,9';
const STONE = '2,3';

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const bgOf = () => stages[ROOM].bgTiles ?? {};
const cellOf = (k) => k.split(',').map(Number);
// 南の口から歩いて立てるセル（潮は open に入れたときだけ通す・水と石は不可）。
function walkable(t, bg, open = new Set()) {
	const ok = (r, c) => {
		const k = `${r},${c}`;
		if (bg[k] === TILE.WATER || t[r][c] === TILE.STONE) return false;
		if (t[r][c] === TILE.TIDE_GATE) return open.has(k);
		return !HARD_BLOCKED.has(t[r][c]);
	};
	const seen = new Set(), q = [];
	for (let c = 0; c < COLS; c++) if (ok(ROWS - 1, c)) { seen.add(`${ROWS - 1},${c}`); q.push([ROWS - 1, c]); }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
// 実ゲームと同じ遷移関数で南の口から全状態を探索（石の位置の集合と、宝箱に立てるか）。
function explore(t, bg, opts = {}) {
	const bg2 = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [k, ch] of Object.entries(bg)) { const [r, c] = cellOf(k); bg2[r][c] = ch; }
	const S = makeSolver(t, bg2, [[BUTTON, TIDES]], {}, new Set(), { hasLadder: true, ...opts });
	const starts = S.exitCells.map((cell) => S.encode(...cellOf(cell), S.initStones, 0, 0, S.litInitMask));
	const seen = new Set(starts), q = [...starts], stoneCells = new Set();
	let goal = false;
	while (q.length) {
		const st = q.shift();
		const [pos, stonesStr] = st.split('|');
		if (pos === CHEST) goal = true;
		for (const s of stonesStr ? stonesStr.split(';') : []) stoneCells.add(s);
		for (const n of S.nextStates(st)) if (!seen.has(n)) { seen.add(n); q.push(n); }
	}
	return { stoneCells, goal };
}

// ── ① データ（盤面・配線・ソルバー）─────────────────────────────────────
test.describe('D3 潮の引く道 ① データ（盤面とソルバー）', () => {
	test('宝箱 B(1,9) への道は潮 3 枚だけ＝潮が満ちたままでは届かない', () => {
		const t = gridOf(), bg = bgOf();
		expect(t[1][9], `宝箱が (${CHEST}) に無い`).toBe(TILE.CHEST);
		for (const k of TIDES) expect(t[cellOf(k)[0]][cellOf(k)[1]], `潮が (${k}) に無い`).toBe(TILE.TIDE_GATE);
		const closed = walkable(t, bg);
		expect(closed.has(CHEST), '潮が満ちたまま宝箱に届く＝潮が飾り（旧盤面の再発）').toBe(false);
		expect(walkable(t, bg, new Set(TIDES)).has(CHEST), '潮を引かせても宝箱に届かない').toBe(true);
		// 潮の下に水を敷くと、潮が引いても水で歩けない（D7 1,2 の潮と同じく下地は床）。
		expect([...TIDES, CHEST].filter((k) => bg[k] === TILE.WATER), '潮/宝箱の下に水がある').toEqual([]);
		expect(stages[ROOM].chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } });
	});

	test('links はボタン S(6,8)→潮 3 枚／門 T・的 Y・看板は置かない', () => {
		const rows = rowsOf(stages[ROOM]);
		expect(rows[2][3], `石が (${STONE}) に無い`).toBe(TILE.STONE);
		expect(rows[6][8], `ボタンが (${BUTTON}) に無い`).toBe(TILE.BUTTON);
		for (const ch of [TILE.GATE, TILE.SWITCH, TILE.SIGN]) {
			expect(rows.some((r) => r.includes(ch)), `'${ch}' がある`).toBe(false);
		}
		expect(stages[ROOM].links).toEqual(TIDES.map((g) => ({ switchId: BUTTON, gateId: g })));
		expect(Object.keys(stages[ROOM].signData ?? {})).toEqual([]);
	});

	test('ソルバー：石を運ぶと届き、押さなければ届かない／石は外周にも潮にも入らない', () => {
		const t = gridOf(), bg = bgOf();
		const full = explore(t, bg);
		expect(full.goal, 'ソルバーで宝箱に届かない').toBe(true);
		expect(full.stoneCells.has(BUTTON), '石をボタンまで運べない').toBe(true);
		expect(explore(t, bg, { noPush: true }).goal, '石を押さずに届く＝足で踏むだけで潮が引いたまま').toBe(false);
		const bad = [...full.stoneCells].filter((k) => isRing(...cellOf(k)) || TIDES.includes(k));
		expect(bad, '石が外周（出口を塞ぐ）か潮のセル（水に沈む）に入る').toEqual([]);
		// 対照：柱 (7,5)(7,6) を外すと石を出口の列へ押し込める＝外周の検査が空虚でない。
		const noPillar = gridOf();
		noPillar[7][5] = TILE.FLOOR; noPillar[7][6] = TILE.FLOOR;
		const ring = [...explore(noPillar, bg).stoneCells].filter((k) => isRing(...cellOf(k)));
		expect(ring.length, '対照：柱を外しても石が外周に入らない＝検査が壊れている').toBeGreaterThan(0);
	});

	test('入江の水ははしごで架けられない（潮が満ちても引いても・宝箱も橋脚に数える）', () => {
		const t = gridOf(), bg = bgOf();
		// ゲーム本体の isLadderBank（game/passable.js）は passable を見る＝宝箱も橋脚になる。
		const bank = (b, open, r, c) => {
			if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
			const ch = t[r][c];
			if (ch === TILE.WATER || ch === TILE.PIT || b[`${r},${c}`] === TILE.WATER) return false;
			if (ch === TILE.TIDE_GATE) return open.has(`${r},${c}`);
			return TILE_META[ch]?.passable ?? true;
		};
		const bridge = (b, open, r, c) =>
			(bank(b, open, r - 1, c) && bank(b, open, r + 1, c)) || (bank(b, open, r, c - 1) && bank(b, open, r, c + 1));
		const water = Object.keys(bg).filter((k) => bg[k] === TILE.WATER);
		expect(water.length, '入江の水の枚数').toBe(12);
		for (const open of [new Set(), new Set(TIDES)]) {
			expect(water.filter((k) => bridge(bg, open, ...cellOf(k))), 'はしごで宝箱へ渡れる＝潮の近道').toEqual([]);
		}
		// 対照：(1,7) を床にすると (1,8) が床と宝箱に挟まれた幅 1 の水になる＝検出されること。
		const bg2 = { ...bg };
		delete bg2['1,7'];
		expect(bridge(bg2, new Set(), 1, 8), '対照：幅 1 の水を見逃した＝はしご判定が壊れている').toBe(true);
	});
});

// ── ② データ（層の到達性）────────────────────────────────────────────
test.describe('D3 潮の引く道 ② データ（層の接続は不変）', () => {
	test('dead-edge 0・入口から 3,0 に歩いて入れる', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '3,0 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(16);
	});
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
async function boot(page, url) {
	await page.goto(url);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// movePlayer 1回＝半マス（[[blade-moveplayer-is-half-tile]]）。
async function walk(page, dir, ops) {
	for (let i = 0; i < ops; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
	}
}
// 石押しは実時間のクールダウン（STONE_PUSH_COOLDOWN_MS=600）で間引かれる＝1押しごとに待つ。
// 1押しでプレイヤーも1セル進む。
async function push(page, dir, times) {
	for (let i = 0; i < times; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
		await page.waitForTimeout(650);
	}
}
// 境界を越える遷移は setTimeout で入る＝1操作ごとに実時間を待ち、着いたら止める。
async function walkUntilStage(page, dir, target, max) {
	for (let i = 0; i < max; i++) {
		await walk(page, dir, 1);
		await page.waitForTimeout(150);
		if (await page.evaluate(() => window.__game.getState().stageKey) === target) return true;
	}
	return false;
}
const at = (page) => page.evaluate(() => {
	const { x, y } = window.__game.getState().player;
	return { r: y, c: x };
});
const ss = (page) => page.evaluate(() => window.__game.getStageState());
const rupees = (page) => page.evaluate(() => window.__game.getState().player.rupees);
const stonesOf = (s) => Object.values(s.stonePositions ?? {}).map((p) => `${p.r},${p.c}`);

test.describe('D3 潮の引く道 ③ 実機（石をボタンへ運ぶと潮が引く）', () => {
	test('潮が満ちたままでは潮の列を北へ進めない', async ({ page }) => {
		await boot(page, previewUrl(6, 9));
		await walk(page, 'up', 8);
		expect(await at(page), '満ちた潮の上を歩けてしまった').toEqual({ r: 5, c: 9 });
	});

	test('足でボタンを踏む間だけ潮が引き、降りると満ちる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(6, 10));
		await walk(page, 'left', 4);
		expect(await at(page), `ボタン (${BUTTON}) に立てない`).toEqual({ r: 6, c: 8 });
		const on = await ss(page);
		for (const g of TIDES) expect(on.openGates, `ボタンを踏んでも潮 (${g}) が引かない`).toContain(g);
		await walk(page, 'right', 2);
		const off = await ss(page);
		for (const g of TIDES) expect(off.openGates, `ボタンから降りても潮 (${g}) が引いたまま`).not.toContain(g);
		expect(off.stonesLocked, '足で踏んだだけで石ロックが立った').toBe(false);
		expect(errors).toEqual([]);
	});

	test('通し：石を小部屋から出してボタンへ→潮が引いたまま→宝箱でルピー +30', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(2, 4));

		// ① 西へ1回押して石を小部屋の口の列 (2,2) へ
		await push(page, 'left', 1);
		expect(stonesOf(await ss(page)), '石が (2,2) に動かない').toEqual(['2,2']);
		// ② 北から回り込んで南へ4回＝口 (4,2) を抜けて (6,2) へ
		await walk(page, 'up', 2);
		await walk(page, 'left', 2);
		expect(await at(page), '(1,2) に回り込めない').toEqual({ r: 1, c: 2 });
		await push(page, 'down', 4);
		expect(stonesOf(await ss(page)), '石が (6,2) に出ない').toEqual(['6,2']);
		// ③ 西から回り込んで東へ6回＝ボタン (6,8) へ
		await walk(page, 'left', 2);
		await walk(page, 'down', 2);
		expect(await at(page), '(6,1) に回り込めない').toEqual({ r: 6, c: 1 });
		await push(page, 'right', 6);
		const locked = await ss(page);
		expect(stonesOf(locked), `石がボタン (${BUTTON}) に乗っていない`).toEqual([BUTTON]);
		expect(locked.stonesLocked, '全ボタンに石が乗ったのに石ロックが立たない').toBe(true);
		for (const g of TIDES) expect(locked.openGates, `石を乗せても潮 (${g}) が引かない`).toContain(g);

		// ④ ボタンから離れても潮は引いたまま＝潮の道を北へ抜けて宝箱 (1,9) へ
		const r0 = await rupees(page);
		await walk(page, 'down', 2);
		await walk(page, 'right', 4);
		await walk(page, 'up', 12);
		expect(await at(page), '宝箱のセルに立てない（潮が満ちた）').toEqual({ r: 1, c: 9 });
		expect((await ss(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await rupees(page), 'ルピーが 30 増えない').toBe(r0 + 30);
		expect(errors).toEqual([]);
	});

	test('押し間違えて石を詰めても、部屋を出て入り直せば石は元の位置に戻る', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(2, 4));
		// 西へ2回押して石を西の壁際 (2,1) に詰める（そこからは口 (4,2) へ出せない）
		await push(page, 'left', 2);
		expect(stonesOf(await ss(page)), '石が (2,1) に詰まらない').toEqual(['2,1']);
		// 小部屋を出て、柱 (7,5)(7,6) の西を回って南の口から 3,1 へ抜け、北へ戻る
		await walk(page, 'down', 12);
		expect(await at(page), '小部屋の口を抜けて (8,2) へ出られない').toEqual({ r: 8, c: 2 });
		await walk(page, 'right', 6);
		expect(await walkUntilStage(page, 'down', '3,1', 8), '3,1 へ出られない').toBe(true);
		expect(await walkUntilStage(page, 'up', ROOM, 8), '3,0 へ戻れない').toBe(true);
		// 押された石だけが stonePositions に載る＝空なら石はタイル上の元位置 (2,3) に戻っている。
		expect(stonesOf(await ss(page)), '入り直しても詰めた石が残っている').toEqual([]);
		expect(errors).toEqual([]);
	});
});
