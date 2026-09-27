// tests/d2-pit-isle.spec.js
// dungeon_2 `0,2`「穴の小島」の番人
// （2026-09-27 / PLAN 実行キュー 34 の1室目・盤面は `scripts/migrate-d2-0-2-pit-isle.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   旧 `0,2` は「石 *(3,5)→ボタン S(5,5)→門 T(5,9)」の部屋だったが、宝箱 B(5,10) は北 (4,10)・
//   南 (6,10) の素の床から開けられた＝門を開けても新しく届くセルが 0。何も守っていない飾り。
//   しかも D2 の道具（ブーメラン）の「遠くの物を回収する」性質を使う部屋が D2 に 1 つも無かった。
//
// 守るものは3つ。
//   ① データ（幾何）：ルピー（大）4 個はどれも**歩いては取れない**小島にある／島と床の間に
//      はしごで架けられる幅 1 の穴が無い（R も橋脚に数える＝ゲーム側の判定）／撤去した
//      石・ボタン・門・宝箱が戻っていない。
//   ② データ（射線）：どの岸の座から島へ投げても、1 投の線が R を 2 個通る（近い方が距離 3・
//      遠い方が 4＝木の届き ↑←4 にちょうど収まる）。
//   ③ 挙動（実機）：南・東・西の岸から木のブーメランを投げると 1 投で R を 2 個運ぶ。
//      届きの境目（↑距離 4 は取れる・5 は取れない）を (7,4) で測る。歩いて穴へは入れない。
//
// ⚠️ 木の maxRange 3 は「届くセル数」ではない（DECISIONS 2026-09-26（2））＝実効は ↑←4／→↓5。
//    下の reachOf() はエンジンの式をなぞり、③ の実機テストが境目そのものを測る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE, TILE_META } from '../shared/tiles.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { MOVE_STEP } from '../game/constants.js';
import { HARD_BLOCKED, isLadderBridgeCell } from '../scripts/lib/connectivity.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_2';
const ROOM = '0,2';
const st = map.layers[LAYER].stages[ROOM];
const ROWS = 10, COLS = 12;

const RUPEES = ['2,4', '2,5', '3,4', '3,5'];
// エンジン（game/projectile.js の往路）と同じ式で出す実効の届き。neg＝↑←、pos＝→↓。
function reachOf(tier) {
	const step = tier.speed * MOVE_STEP;
	let p = 0.5;
	while (p < tier.maxRange) p += step;
	const travel = p + step;
	return { neg: Math.ceil(travel - 0.5), pos: Math.floor(travel + 0.5) };
}
const WOOD = reachOf(BOOMERANG_TIERS[0]);

const gridOf = () => st.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
// 東の口（col11）から歩ける床（穴・硬い障害は不可）。
function walkable(t) {
	const seen = new Set(), q = [];
	for (let r = 0; r < ROWS; r++) {
		if (!HARD_BLOCKED.has(t[r][COLS - 1]) && t[r][COLS - 1] !== TILE.PIT) {
			seen.add(`${r},${COLS - 1}`); q.push([r, COLS - 1]);
		}
	}
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || seen.has(k)) continue;
			const ch = t[nr][nc];
			if (HARD_BLOCKED.has(ch) || ch === TILE.PIT) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
// 立ち位置 from から dir へ木で投げたとき、線上にある R（壁で止まる・穴は越える）。
function rupeesOnLane(t, from, dir, reach) {
	const [r0, c0] = from.split(',').map(Number);
	const [dr, dc] = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
	const range = (dr === -1 || dc === -1) ? reach.neg : reach.pos;
	const got = [];
	for (let d = 1; d <= range; d++) {
		const r = r0 + dr * d, c = c0 + dc * d;
		if (r < 0 || r >= ROWS || c < 0 || c >= COLS || t[r][c] === TILE.WALL) break;
		if (t[r][c] === TILE.ITEM_RUPEE_LARGE) got.push(`${r},${c}`);
	}
	return got;
}
// `game/passable.js` isLadderBank を写した判定＝R（passable:true）も橋脚になる
// （`isLadderBridgeCell` は HARD_BLOCKED 基準でゲームより甘い＝DECISIONS 2026-09-27（2））。
const gameBank = (t, r, c) => {
	if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
	const ch = t[r][c];
	if (ch === TILE.WATER || ch === TILE.PIT) return false;
	return TILE_META[ch]?.passable ?? true;
};
const gameBridge = (t, r, c) =>
	(gameBank(t, r - 1, c) && gameBank(t, r + 1, c)) || (gameBank(t, r, c - 1) && gameBank(t, r, c + 1));

// 岸の座と投げる向き＝どれも R を 2 個通る。
const SEATS = [
	['6,4', 'up'], ['6,5', 'up'], ['2,8', 'left'], ['3,8', 'left'], ['2,1', 'right'], ['3,1', 'right'],
];

// ── ① データ（幾何）─────────────────────────────────────────────────
test.describe('D2 穴の小島 ① データ（島は歩いて取れない）', () => {
	test(`${ROOM}：ルピー（大）4 個はどれも歩いて取れない`, () => {
		const t = gridOf(), walk = walkable(t);
		const found = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			if (t[r][c] === TILE.ITEM_RUPEE_LARGE) found.push(`${r},${c}`);
		}
		expect(found.sort()).toEqual([...RUPEES].sort());
		for (const k of RUPEES) expect(walk.has(k), `R(${k}) に歩いて行ける`).toBe(false);
		for (const [seat] of SEATS) expect(walk.has(seat), `岸の座 (${seat}) に立てない`).toBe(true);
	});

	test(`${ROOM}：はしごで島へ渡れる幅 1 の穴が無い（R も橋脚に数える）`, () => {
		const t = gridOf(), bridges = [], helper = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			if (t[r][c] !== TILE.PIT) continue;
			if (gameBridge(t, r, c)) bridges.push(`${r},${c}`);
			if (isLadderBridgeCell(t, ROWS, COLS, r, c, st.bgTiles ?? {})) helper.push(`${r},${c}`);
		}
		expect(bridges, 'はしごを架けられる穴＝島へ歩いて渡れる（ゲーム側の判定）').toEqual([]);
		expect(helper, 'はしごを架けられる穴（lib の判定）').toEqual([]);
		// 対照：(2,7) を床にすると (2,6) が R(2,5) と床に挟まれた幅 1 の穴＝検出される。
		t[2][7] = '.';
		expect(gameBridge(t, 2, 6)).toBe(true);
	});

	test(`${ROOM}：飾りの石・ボタン・門・宝箱を撤去した（戻っていない）`, () => {
		const rows = gridOf().map((r) => r.join(''));
		for (const ch of [TILE.STONE, TILE.BUTTON, TILE.GATE, TILE.CHEST, TILE.SIGN]) {
			expect(rows.some((r) => r.includes(ch)), `'${ch}' が残っている`).toBe(false);
		}
		expect(st.links ?? []).toEqual([]);
		expect(st.chestContents ?? {}).toEqual({});
		expect(st.signData ?? {}).toEqual({});
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles が文字の配列の配列でない').toBe(true);
	});
});

// ── ② データ（射線）─────────────────────────────────────────────────
test.describe('D2 穴の小島 ② データ（どの岸からも1投で2個）', () => {
	test('岸の座から島へ向けた1投の線は R を 2 個通る', () => {
		expect(WOOD, '木の実効の届き（↑←/→↓）＝③の実機で測る境目と同じ').toEqual({ neg: 4, pos: 5 });
		const t = gridOf();
		for (const [from, dir] of SEATS) {
			expect(rupeesOnLane(t, from, dir, WOOD).length, `(${from}) から ${dir}`).toBe(2);
		}
		// 対照：一つ下の (7,4) からの ↑ は遠い方の R(2,4) が距離 5＝木の届き 4 の外で 1 個だけ。
		expect(rupeesOnLane(t, '7,4', 'up', WOOD)).toEqual(['3,4']);
		// 対照：線の途中を壁で塗ると止まる（壁で止まる判定が効いている）。
		const walled = gridOf();
		walled[4][4] = TILE.WALL;
		expect(rupeesOnLane(walled, '6,4', 'up', WOOD)).toEqual([]);
	});
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_boomerang: '1',
	});
	return `${GAME}?${p.toString()}`;
}
async function boot(page, url) {
	await page.goto(url);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
async function walk(page, dir, ops) {
	for (let i = 0; i < ops; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
	}
}
const at = (page) => page.evaluate(() => {
	const { x, y } = window.__game.getState().player;
	return { r: y, c: x };
});
const rupees = (page) => page.evaluate(() => window.__game.getState().player.rupees);
// 向きを変えて投げ、ブーメランが戻り切るまで進める（戻ったら運搬物が確定加算される）。
async function throwBoomerang(page, dir) {
	await page.evaluate((d) => {
		window.__game.setHeroDir(d);
		window.__game.getPlayer().activeSubItem = 'boomerang';
	}, dir);
	await step(page, 1);
	await page.evaluate(() => window.__game.useSubItem());
	const flying = () => page.evaluate(() => window.__game.getProjectiles().some((p) => p.type === 'boomerang'));
	expect(await flying(), 'ブーメランが飛ばない').toBe(true);
	for (let i = 0; i < 200 && await flying(); i++) await step(page, 1);
	expect(await flying(), 'ブーメランが戻らない').toBe(false);
}

test.describe('D2 穴の小島 ③ 実機', () => {
	test('入口から南の岸 (6,4) まで歩けるが、穴の上へは踏み出せない', async ({ page }) => {
		await boot(page, previewUrl(6, 10));
		await walk(page, 'left', 12);
		expect(await at(page), '南の岸 (6,4) に着かない').toEqual({ r: 6, c: 4 });
		await walk(page, 'up', 4);
		expect(await at(page), '穴の上を歩けた').toEqual({ r: 6, c: 4 });
	});

	test('南の岸 (6,4)↑・(6,5)↑：木の1投で R を 2 個ずつ＝2投で 20 ルピー', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(6, 4));
		const r0 = await rupees(page);
		await throwBoomerang(page, 'up');
		expect(await rupees(page), '(6,4)↑ の1投で R(3,4) R(2,4) の 2 個を運ばない').toBe(r0 + 10);
		await walk(page, 'right', 2);
		expect(await at(page)).toEqual({ r: 6, c: 5 });
		await throwBoomerang(page, 'up');
		expect(await rupees(page), '(6,5)↑ の1投で R(3,5) R(2,5) の 2 個を運ばない').toBe(r0 + 20);
		expect(errors).toEqual([]);
	});

	test('東の岸 (2,8)← と西の岸 (3,1)→ でも1投で 2 個ずつ運ぶ', async ({ page }) => {
		await boot(page, previewUrl(2, 8));
		const r0 = await rupees(page);
		await throwBoomerang(page, 'left');
		expect(await rupees(page), '(2,8)← の1投で R(2,5) R(2,4) を運ばない').toBe(r0 + 10);

		await boot(page, previewUrl(3, 1));
		const s0 = await rupees(page);
		await throwBoomerang(page, 'right');
		expect(await rupees(page), '(3,1)→ の1投で R(3,4) R(3,5) を運ばない').toBe(s0 + 10);
	});

	test('木の届きの境目：(7,4)↑ は距離 4 の R(3,4) だけ取れて、距離 5 の R(2,4) は残る', async ({ page }) => {
		// 「↑4 は取れる・↑5 は取れない」を1投で両側から測る。ここがずれたら ② の射線表も嘘になる。
		await boot(page, previewUrl(7, 4));
		const r0 = await rupees(page);
		await throwBoomerang(page, 'up');
		expect(await rupees(page), '(7,4)↑ で R(3,4) の 1 個だけにならない').toBe(r0 + 5);
	});
});
