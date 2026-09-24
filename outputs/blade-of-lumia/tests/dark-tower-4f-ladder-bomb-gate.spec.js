// tests/dark-tower-4f-ladder-bomb-gate.spec.js
// dark_tower 4F「はしご＋爆弾の複合関門」の番人（2026-09-22 / PLAN 実行キュー20b ④の 4F 分）。
//
// 直す前の実測（キュー20b ⑯・DECISIONS 2026-09-21（8）で検算済み）：
//   `4,2` は配線されていない仕掛けの寄せ集めだった＝H×2（どの showConditions にも使われて
//   いない）／破壊壁 (2,4)（背後は普通の床の飾り）／row6 は穴3枚＋橋1枚＋col5 が素通しの床
//   （穴の帯として機能していない）。対照実験＝row6 を全幅の穴にすると24/30室（4,3以降6室が
//   閉じる）→ はしごで30/30室。
//
// 新しい機構：row6 を全幅の穴にしてはしごの渡りにし、渡った先（row7）に爆弾の山、
//   その先（row8）を破壊壁2枚で塞ぐ＝はしご「と」爆弾の両方が要る複合関門。
//
// 守るものは2つ。
// ① データ（部屋単独の対照実験）：**はしごが無いと渡れない**／**はしごがあっても爆弾（道具）
//    が無いと南へ抜けられない**。`!` は 2,1 の関門とも共有する文字なので**塔全体の BFS では
//    区別できない**＝この部屋だけを切り出したソルバーで測る（[[blade-puzzle-must-verify-with-solver]]）。
// ② 挙動（実機）：はしご無しでは穴に阻まれ、はしごだけでは壁に阻まれ、爆弾も使うと南へ抜ける。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ROWS, COLS, makeSolver } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dark_tower';
const GATE_ROOM = '4,2';
const BOMBS = '7,5';
const WALLS = ['8,5', '8,6'];
const NORTH_IN = ['1,5', '1,6'];
const SOUTH_OUT = '9,5';
const EDGES = 'N[5,6] S[5,6] W[] E[]';

const GATE_ROWS = [
	'#####..#####',
	'#i.........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#xxxxxxxxxx#',
	// (7,1) の刻み文＝2026-09-23 に `4,1` から移設した「この先は 石の 間」（石の間 `4,3` の
	// 1室手前で読ませる＝詰み回復の笛は `4,3` の中で吹かないと効かない）。廊下の端に置いて
	// いるのは 'i' が通行不可で、途中に置くと row7 の東西が分断されるため。
	'#i...5.....#',
	'#####!!#####',
	'#####..#####',
];

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

function edgeSig(rows) {
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[ROWS - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[COLS - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
}

/**
 * `4,2` だけを切り出して測る。`!` は `2,1` の関門とも共有する文字なので、塔全体の BFS の
 * openTiles では「この部屋のはしご」と「この部屋の爆弾」を独立に測れない
 * （[[blade-control-experiment-needs-tile-wall]] と同じ「対照実験の対象を正しく選ぶ」問題）。
 * `withLadder` ＝はしご。`noTools` ＝道具封じ（＝爆弾なし。この部屋に矢/剣ビーム/ロウソクは無い）。
 */
function measureRoom({ withLadder = true, noTools = false, goal = SOUTH_OUT } = {}) {
	const st = map.layers[LAYER].stages[GATE_ROOM];
	const tiles = st.tiles.map((r) => (Array.isArray(r) ? r.slice() : [...r]));
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [k, ch] of Object.entries(st.bgTiles ?? {})) {
		const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
	}
	const breakDefs = {};
	for (const [k, v] of Object.entries(st.breakableWalls ?? {})) breakDefs[k] = v.breakDef ?? 1;
	const S = makeSolver(tiles, bg, [], breakDefs, new Set(),
		{ hasLadder: withLadder, pitCrossable: true, noTools });
	const starts = NORTH_IN.map((cell) => {
		const [r, c] = cell.split(',').map(Number);
		return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
	});
	const [gr, gc] = goal.split(',').map(Number);
	return measureMetrics(
		S,
		starts,
		(state) => state.split('|')[0] === goal,
		(state) => {
			const [pr, pc] = state.split('|')[0].split(',').map(Number);
			return Math.abs(pr - gr) + Math.abs(pc - gc);
		},
		{ guardMax: 2_000_000, escapeTest: (state) => S.exitCells.includes(state.split('|')[0]) },
	);
}

test.describe('Blade of Lumia – dark_tower 4F のはしご＋爆弾の複合関門（キュー20b ④）', () => {
	test(`データ：${LAYER} ${GATE_ROOM} の盤面`, () => {
		const st = map.layers[LAYER].stages[GATE_ROOM];
		expect(rowsOf(st), '4,2 の盤面').toEqual(GATE_ROWS);

		expect(st.breakableWalls, 'breakableWalls が破壊壁2枚を {breakDef} で指す')
			.toEqual({ '8,5': { breakDef: 1 }, '8,6': { breakDef: 1 } });

		let torches = 0;
		for (let r = 0; r < st.rows; r++) {
			for (let c = 0; c < st.cols; c++) if (st.tiles[r][c] === TILE.TORCH) torches++;
		}
		expect(torches, '配線の無いかがり火は撤去済み').toBe(0);

		expect(st.tiles[1][1], '(1,1) は刻み文 i').toBe(TILE.SIGN);
		expect(st.signData?.['1,1']?.lines?.length ?? 0, '刻み文の本文').toBeGreaterThanOrEqual(2);

		// 2026-09-23 に `4,1` から移設した2枚目（石の間の予告＋詰み回復の笛）。
		expect(st.tiles[7][1], '(7,1) は移設した刻み文 i').toBe(TILE.SIGN);
		expect(st.signData?.['7,1']?.lines?.length ?? 0, '移設した刻み文の本文').toBeGreaterThanOrEqual(2);
	});

	test(`データ：${LAYER} ${GATE_ROOM} の境界の開きは不変（部屋間の接続を動かさない）`, () => {
		expect(edgeSig(rowsOf(map.layers[LAYER].stages[GATE_ROOM]))).toBe(EDGES);
	});

	test(`データ：${LAYER} ${GATE_ROOM} ははしごと爆弾の両方が要る（独立に測る）`, () => {
		const full = measureRoom();
		expect(full.L, '南の出口へ届く（解なし＝null ではない）').not.toBeNull();
		expect(full.noEscape, '入って詰む状態は無い').toBe(0);

		expect(measureRoom({ withLadder: false }).L,
			'対照実験（はしごなし）では穴を渡れない').toBeNull();
		expect(measureRoom({ noTools: true }).L,
			'対照実験（はしごあり・爆弾なし）では壁を抜けられない').toBeNull();
		expect(measureRoom({ noTools: true, goal: BOMBS }).L,
			'はしごがあれば爆弾なしでも山には届く（詰みではない）').not.toBeNull();

		// 歯の確認＝既に通れる床を潰しても結果が変わらない（対照実験が空振りでない証明）
		const st = map.layers[LAYER].stages[GATE_ROOM];
		const tiles = st.tiles.map((r) => r.slice());
		tiles[1][9] = TILE.WALL;
		const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
		const S = makeSolver(tiles, bg, [], { '8,5': 1, '8,6': 1 }, new Set(),
			{ hasLadder: true, pitCrossable: true });
		const starts = NORTH_IN.map((cell) => {
			const [r, c] = cell.split(',').map(Number);
			return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
		});
		const [gr, gc] = SOUTH_OUT.split(',').map(Number);
		const killed = measureMetrics(S, starts, (state) => state.split('|')[0] === SOUTH_OUT,
			(state) => {
				const [pr, pc] = state.split('|')[0].split(',').map(Number);
				return Math.abs(pr - gr) + Math.abs(pc - gc);
			}, { guardMax: 2_000_000 });
		expect(killed.L, '無関係な床を潰しても抜けられる').not.toBeNull();
	});
});

// ── 挙動（実機・fromEditor=1 プレビュー）──────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(stage, row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage, row: String(row), col: String(col), ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
async function walkTiles(page, dir, tiles = 1) {
	await page.evaluate(({ d, n }) => {
		for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
	}, { d: dir, n: tiles });
}
async function walkToRow(page, dir, row, { guard = 40 } = {}) {
	for (let i = 0; i < guard; i++) {
		if ((await at(page)).r === row) break;
		await page.evaluate((d) => { window.__game.movePlayer(d); window.__game.step(1); }, dir);
	}
}
/** 初めて道具を拾うと3ページのヒントが開く＝閉じるまで movePlayer が無視される。 */
async function dismissDialog(page) {
	for (let i = 0; i < 8; i++) {
		if (!(await page.evaluate(() => window.__game.getState().isDialog))) return;
		await page.keyboard.press('z');
		await page.waitForTimeout(60);
	}
	expect(await page.evaluate(() => window.__game.getState().isDialog), 'ダイアログが閉じない').toBe(false);
}
// ⚠️ 座標・持ち物は `getPlayer()` で読む（[[blade-snapshot-api-names]]）。
const at = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});
const ss = (page) => page.evaluate(() => window.__game.getStageState());
const bombCount = (page) => page.evaluate(() => window.__game.getPlayer().subItems?.bomb?.count ?? 0);

test.describe('Blade of Lumia – dark_tower 4F は実機ではしご「と」爆弾を要求する（キュー20b ④）', () => {
	test('はしご無しでは渡れず、はしごだけでは壁に阻まれ、爆弾も使うと南へ抜ける', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		// ① はしご無しで穴の帯の手前 (5,5) から南を押す＝渡れない。
		await page.goto(previewUrl(GATE_ROOM, 5, 5));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getPlayer().hasLadder),
			'はしごを持たない前提のテスト').toBeFalsy();
		await walkTiles(page, 'down', 3);
		expect((await at(page)).r, 'はしごなしで穴の帯を渡り抜けてしまった').toBeLessThanOrEqual(6);

		// ② はしごだけを持たせる＝穴は渡れるが、爆弾を使わないと壁の先へ抜けられない。
		await page.goto(previewUrl(GATE_ROOM, 5, 5, { ps_ladder: '1' }));
		await waitForBoard(page);
		expect(await bombCount(page), '爆弾を持たない前提のテスト').toBe(0);
		await walkToRow(page, 'down', 7, { guard: 20 });
		expect((await at(page)).r, 'はしごを持っていても穴の帯を渡れない').toBe(7);
		expect(await at(page), '爆弾の山 (7,5) に乗れない').toMatchObject({ r: 7, c: 5 });
		expect(await bombCount(page), '床の爆弾を拾えない').toBeGreaterThanOrEqual(1);
		await dismissDialog(page);   // 初めての道具＝ヒントが開いている
		await walkTiles(page, 'down', 1);
		expect((await at(page)).r, '爆弾を使わずに壁を通り抜けてしまった').toBe(7);

		// ③ 壁の手前 (7,5) で爆弾を1個置く＝爆風（半径2の円）が '!' 2枚とも砕く
		const before = await bombCount(page);
		expect((await ss(page)).brokenWalls ?? [], '最初から壁が壊れている').not.toContain(WALLS[0]);
		await page.evaluate(() => {
			window.__game.step(2);
			window.__game.useSubItem();
			window.__game.step(20);
		});
		const after = await ss(page);
		expect(after.brokenWalls, `爆弾1個で ${WALLS[0]} が砕けない`).toContain(WALLS[0]);
		expect(after.brokenWalls, `爆弾1個で ${WALLS[1]} も砕けない`).toContain(WALLS[1]);
		expect(await bombCount(page), '爆弾が減っていない').toBe(before - 1);

		// ④ 砕けた壁を通って南の出口まで抜けられる
		await walkToRow(page, 'down', 9, { guard: 60 });
		expect((await at(page)).r, '砕いた壁を通って南へ抜けられない').toBeGreaterThanOrEqual(9);
		expect(errors, `page errors on ${GATE_ROOM}:\n${errors.join('\n')}`).toEqual([]);
	});
});
