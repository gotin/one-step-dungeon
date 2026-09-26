// tests/d7-boomerang-isles.spec.js
// dungeon_7 `3,0`「ブーメランの浮島」の番人
// （2026-09-26 / PLAN 実行キュー 32・盤面は `scripts/migrate-d7-3-0-boomerang-isles.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   旧 `3,0` は「石 *(3,3)→ボタン S(3,7)→門 T(1,9)」の部屋だったが、宝箱 B(2,9) は門の
//   **手前**の素の床にあった＝門を開けなくても歩いて開けられた。石もボタンも門も何も
//   守っていない飾り（しかも `dungeon_6 3,0` と盤面が完全に同一＝そちらはキュー33）。
//
// 守るものは3つ。
//   ① データ（幾何）：ルピー（大）5 個はどれも**歩いては取れない**島にある／島と床の間に
//      はしごで架けられる幅 1 の穴が無い／撤去した石・ボタン・門・宝箱が戻っていない。
//   ② データ（射線）：木で届く座は桟橋の上 (4,1)(5,1)／(4,10)(5,10) だけ・真ん中の R(1,5) は
//      銀でだけ届く＝柱 (5,4)(5,7) が真下の岸からの近道を断ち、突堤の先 (6,5) は R(1,5) から距離 5。
//   ③ 挙動（実機）：桟橋の先から木のブーメランを投げると R を拾って戻る。木の届きの境目
//      （↑距離 4 は取れる・5 は取れない）と、銀なら R(1,5) が取れることを実機で測る。
//      歩いて穴へは入れない。
//
// ⚠️ **木の maxRange 3 は「届くセル数」ではない**（2026-09-26 実測）＝往路は tick 冒頭の距離で
//    折り返しを決め、越えた tick でも 1 歩進む・発射位置は手元から 0.5 先・セルは floor(v+0.5)。
//    ∴木の実効の届きは **↑← 4 セル／→↓ 5 セル**（左右非対称）。最初の叩き台は突堤の先を
//    R(1,5) から距離 4 に置いていて、射程 3 を信じた「銀だけ」が木で破れていた（実機で発覚）。
//    下の reachOf() はエンジンの式をなぞり、③ の実機テストが境目そのものを測る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { MOVE_STEP } from '../game/constants.js';
import { HARD_BLOCKED, isLadderBridgeCell } from '../scripts/lib/connectivity.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '3,0';
const st = map.layers[LAYER].stages[ROOM];
const ROWS = 10, COLS = 12;

const RUPEES = ['1,1', '1,5', '1,10', '4,4', '4,7'];
const PIER_W = { row: 4, col: 1 };    // 西の桟橋の先＝R(1,1)↑・R(4,4)→ の 2 投
const PIER_E = { row: 4, col: 10 };   // 東の桟橋の先＝R(1,10)↑・R(4,7)← の 2 投
const JETTY = { row: 6, col: 5 };     // 中央の突堤の先＝R(1,5) まで ↑距離 5（木の届き 4 の外）
// エンジン（game/projectile.js の往路）と同じ式で出す実効の届き。neg＝↑←、pos＝→↓。
function reachOf(tier) {
	const step = tier.speed * MOVE_STEP;
	let p = 0.5;
	while (p < tier.maxRange) p += step;
	const travel = p + step;
	return { neg: Math.ceil(travel - 0.5), pos: Math.floor(travel + 0.5) };
}
const WOOD = reachOf(BOOMERANG_TIERS[0]);
const SILVER = reachOf(BOOMERANG_TIERS[1]);

const gridOf = () => st.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
// 南の口から歩ける床（穴・硬い障害は不可）。
function walkable(t) {
	const seen = new Set(), q = [];
	for (let c = 0; c < COLS; c++) {
		if (!HARD_BLOCKED.has(t[ROWS - 1][c]) && t[ROWS - 1][c] !== TILE.PIT) {
			seen.add(`${ROWS - 1},${c}`); q.push([ROWS - 1, c]);
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
// cell へ直線で届く立ち位置（壁で止まる・穴は越える・距離 ≤ 実効の届き）。
// cell の下/右に立てば ↑/← へ投げる＝reach.neg、上/左に立てば reach.pos。
function throwersOf(t, walk, cell, reach) {
	const [r0, c0] = cell.split(',').map(Number);
	const out = [];
	for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
		const range = (dr === 1 || dc === 1) ? reach.neg : reach.pos;
		for (let d = 1; d <= range; d++) {
			const r = r0 + dr * d, c = c0 + dc * d;
			if (r < 0 || r >= ROWS || c < 0 || c >= COLS || t[r][c] === TILE.WALL) break;
			if (walk.has(`${r},${c}`)) out.push(`${r},${c}`);
		}
	}
	return out.sort();
}

// ── ① データ（幾何）─────────────────────────────────────────────────
test.describe('D7 ブーメランの浮島 ① データ（島は歩いて取れない）', () => {
	test(`${ROOM}：ルピー（大）5 個はどれも歩いて取れない`, () => {
		const t = gridOf(), walk = walkable(t);
		const found = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			if (t[r][c] === TILE.ITEM_RUPEE_LARGE) found.push(`${r},${c}`);
		}
		expect(found.sort()).toEqual([...RUPEES].sort());
		for (const k of RUPEES) expect(walk.has(k), `R(${k}) に歩いて行ける`).toBe(false);
		expect(walk.has(`${PIER_W.row},${PIER_W.col}`), '西の桟橋の先に立てない').toBe(true);
		expect(walk.has(`${PIER_E.row},${PIER_E.col}`), '東の桟橋の先に立てない').toBe(true);
	});

	test(`${ROOM}：はしごで島へ渡れる幅 1 の穴が無い`, () => {
		const t = gridOf(), bridges = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			if (t[r][c] === TILE.PIT && isLadderBridgeCell(t, ROWS, COLS, r, c, st.bgTiles)) bridges.push(`${r},${c}`);
		}
		expect(bridges, 'はしごを架けられる穴＝島へ歩いて渡れる').toEqual([]);
		// 対照：床に挟まれた幅 1 の穴なら検出される（検査が空虚でない）。
		t[7][3] = TILE.PIT;
		expect(isLadderBridgeCell(t, ROWS, COLS, 7, 3, {})).toBe(true);
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
test.describe('D7 ブーメランの浮島 ② データ（木は桟橋の先から・真ん中は銀だけ）', () => {
	const t = gridOf(), walk = walkable(t);
	const W = `${PIER_W.row},${PIER_W.col}`, E = `${PIER_E.row},${PIER_E.col}`;

	test('木で届く座は桟橋の上だけ（柱が真下の岸からの近道を断つ）', () => {
		expect(WOOD, '木の実効の届き（↑←/→↓）＝③の実機で測る境目と同じ').toEqual({ neg: 4, pos: 5 });
		expect(throwersOf(t, walk, '1,1', WOOD)).toEqual([W, '5,1']);
		expect(throwersOf(t, walk, '4,4', WOOD)).toEqual([W]);
		expect(throwersOf(t, walk, '1,10', WOOD)).toEqual([E, '5,10']);
		expect(throwersOf(t, walk, '4,7', WOOD)).toEqual([E]);
		// 柱 (5,4)(5,7) を穴に戻すと岸 (7,4)/(7,7) から木で届く＝柱が本物であることの対照。
		const noPillar = gridOf();
		noPillar[5][4] = TILE.PIT; noPillar[5][7] = TILE.PIT;
		const w2 = walkable(noPillar);
		expect(throwersOf(noPillar, w2, '4,4', WOOD)).toContain('7,4');
		expect(throwersOf(noPillar, w2, '4,7', WOOD)).toContain('7,7');
	});

	test('真ん中の R(1,5) は木では届かず銀でだけ届く', () => {
		expect(throwersOf(t, walk, '1,5', WOOD), '木で R(1,5) に届く').toEqual([]);
		expect(throwersOf(t, walk, '1,5', SILVER)).toEqual(['6,5', '7,5', '8,5', '9,5']);
		// 突堤の先が (5,5) まで伸びると距離 4＝木で届く（最初の叩き台の穴）＝突堤の長さが本物。
		const longJetty = gridOf();
		longJetty[5][5] = '.'; longJetty[5][6] = '.';
		expect(throwersOf(longJetty, walkable(longJetty), '1,5', WOOD)).toContain('5,5');
	});
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, silver = false) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_boomerang: '1',
	});
	if (silver) p.set('ps_silverboomerang', '1');
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

test.describe('D7 ブーメランの浮島 ③ 実機', () => {
	test('入口から桟橋の先まで歩けるが、穴の上へは踏み出せない', async ({ page }) => {
		await boot(page, previewUrl(8, 5));
		await walk(page, 'left', 12);
		await walk(page, 'up', 10);
		expect(await at(page), '西の桟橋の先 (4,1) に着かない').toEqual({ r: PIER_W.row, c: PIER_W.col });
		await walk(page, 'up', 4);
		await walk(page, 'right', 4);
		expect(await at(page), '穴の上を歩けた').toEqual({ r: PIER_W.row, c: PIER_W.col });
	});

	test('西の桟橋の先 (4,1)：木で ↑R(1,1)・→R(4,4) を 1 投ずつ拾える（距離ちょうど 3）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(PIER_W.row, PIER_W.col));
		const r0 = await rupees(page);
		await throwBoomerang(page, 'up');
		expect(await rupees(page), '↑で R(1,1) を拾えない').toBe(r0 + 5);
		await throwBoomerang(page, 'right');
		expect(await rupees(page), '→で R(4,4) を拾えない').toBe(r0 + 10);
		expect(errors).toEqual([]);
	});

	test('東の桟橋の先 (4,10)：木で ↑R(1,10)・←R(4,7) を 1 投ずつ拾える', async ({ page }) => {
		await boot(page, previewUrl(PIER_E.row, PIER_E.col));
		const r0 = await rupees(page);
		await throwBoomerang(page, 'up');
		expect(await rupees(page), '↑で R(1,10) を拾えない').toBe(r0 + 5);
		await throwBoomerang(page, 'left');
		expect(await rupees(page), '←で R(4,7) を拾えない').toBe(r0 + 10);
	});

	test('木の届きの境目：↑距離 4 の (5,1) からは R(1,1) が取れる', async ({ page }) => {
		// 「↑4 は取れる」側の境目。ここが取れなくなったら木の届きが縮んだ＝② の射線表も嘘になる。
		await boot(page, previewUrl(5, 1));
		const r0 = await rupees(page);
		await throwBoomerang(page, 'up');
		expect(await rupees(page), '↑距離 4 の R(1,1) を木で拾えない').toBe(r0 + 5);
	});

	test('中央の突堤の先 (6,5)：歩いてそれ以上北へ出られず、木では R(1,5) に届かず、銀なら拾える', async ({ page }) => {
		await boot(page, previewUrl(8, 5));
		await walk(page, 'up', 8);
		expect(await at(page), '突堤の先 (6,5) で止まらない').toEqual({ r: JETTY.row, c: JETTY.col });
		const r0 = await rupees(page);
		await throwBoomerang(page, 'up');
		expect(await rupees(page), '木で R(1,5) を拾えた（↑距離 5＝木の届き 4 を越えている）').toBe(r0);

		await boot(page, previewUrl(JETTY.row, JETTY.col, true));
		expect(await page.evaluate(() => window.__game.getState().player.boomerangTier)).toBe(1);
		const s0 = await rupees(page);
		await throwBoomerang(page, 'up');
		expect(await rupees(page), '銀で R(1,5) を拾えない').toBe(s0 + 5);
	});
});
