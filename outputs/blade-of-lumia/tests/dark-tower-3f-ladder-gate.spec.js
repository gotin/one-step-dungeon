// tests/dark-tower-3f-ladder-gate.spec.js
// dark_tower 3F「はしごの関門」の番人（2026-09-22 / PLAN 実行キュー20b ④の 3F 分）。
//
// 直す前の実測（キュー20b ⑮・DECISIONS 2026-09-21（8）で検算済み）：
//   `3,1` の row6 は穴 x×10 の中に橋 v（TILE.BRIDGE＝常時通行可）が1枚 (6,3) 残っていて、
//   はしご不要の抜け道になっていた（対照実験＝橋を戻すと18/30室・はしごで30/30室）。
//
// 新しい機構：
//    6 #xxxxxxxxxx#   ← 橋を撤去した穴の一本帯（row5/row7 が全幅の床＝isLadderBridgeCell 成立）
//   刻み文 (1,1) に湖/沼/雪原の「飛び石」看板と同じ文法の案内文を置いた。
//
// 守るものは2つ。
// ① データ（状態空間）：**はしごが無いと南（3,2 以降）へ抜けられない**。歩いて行けるかの
//    目視では判定できない∴ソルバーで測る（[[blade-puzzle-must-verify-with-solver]]）。
//    対照実験が空振りでないことも同時に測る（無関係な床を潰しても抜けられる）。
// ② 挙動（実機）：はしご無しでは穴に阻まれ、はしごを使うと渡れる（`fromEditor=1` プレビュー）。
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
const GATE_ROOM = '3,1';
const NORTH_IN = ['1,5', '1,6'];   // 北の入口 (0,5)(0,6) から入った直後の室内セル
const SOUTH_OUT = '9,5';           // 南の出口＝ここに届けば 3,2 へ抜けられる
const EDGES = 'N[5,6] S[5,6] W[] E[]';

const GATE_ROWS = [
	'#####..#####',
	'#i.........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#xxxxxxxxxx#',
	'#..........#',
	'#..........#',
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
 * 北の入口から `goal` まで抜けられるか測る。
 * `hasLadder: false` ＝はしご無し。`kill` ＝そのセルを壁で潰す対照実験。
 * ⚠️ 潰すセルは必ず `'#'`（未知の文字は通行可になる＝[[blade-control-experiment-needs-tile-wall]]）。
 */
function measureRoom({ hasLadder = true, kill = null, goal = SOUTH_OUT } = {}) {
	const st = map.layers[LAYER].stages[GATE_ROOM];
	const tiles = st.tiles.map((r) => (Array.isArray(r) ? r.slice() : [...r]));
	if (kill) {
		const [r, c] = kill.split(',').map(Number);
		tiles[r][c] = TILE.WALL;
	}
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [k, ch] of Object.entries(st.bgTiles ?? {})) {
		const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
	}
	const S = makeSolver(tiles, bg, [], {}, new Set(),
		{ hasLadder, pitCrossable: true });
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
		// escapeTest を渡さないと noEscape が null になる（＝「入って詰まない」を測れない）
		{ guardMax: 2_000_000, escapeTest: (state) => S.exitCells.includes(state.split('|')[0]) },
	);
}

test.describe('Blade of Lumia – dark_tower 3F のはしごの関門（キュー20b ④）', () => {
	test(`データ：${LAYER} ${GATE_ROOM} の盤面`, () => {
		const st = map.layers[LAYER].stages[GATE_ROOM];
		expect(rowsOf(st), '3,1 の盤面').toEqual(GATE_ROWS);

		// 橋 'v' が1枚も残っていない（旧・飾りの再発防止）
		const bridges = [];
		for (let r = 0; r < st.rows; r++) {
			for (let c = 0; c < st.cols; c++) if (st.tiles[r][c] === TILE.BRIDGE) bridges.push(`${r},${c}`);
		}
		expect(bridges, '橋は1枚も残っていない').toEqual([]);

		// 刻み文は 'i' タイルと同じ座標に本文つき（[[blade-sign-two-formats]]＝本文が無いと無言看板）
		expect(st.tiles[1][1], '(1,1) は刻み文 i').toBe(TILE.SIGN);
		expect(st.signData?.['1,1']?.lines?.length ?? 0, '刻み文の本文').toBeGreaterThanOrEqual(2);
	});

	test(`データ：${LAYER} ${GATE_ROOM} ははしごが無いと南へ抜けられない`, () => {
		// 素の測定＝抜けられる／入って詰まない
		// ⚠️ 抜けられないときの L は `null`（`lib/puzzle-metrics.mjs` の表現）＝Infinity ではない。
		const m = measureRoom();
		expect(m.L, '南の出口へ届く（解なし＝null ではない）').not.toBeNull();
		expect(m.noEscape, '入って詰む状態は無い').toBe(0);

		// 対照実験＝はしごが無いと届かない
		expect(measureRoom({ hasLadder: false }).L,
			'対照実験（はしごなし）では南へ抜けられない').toBeNull();

		// 歯の確認＝既に通れる床を潰しても結果が変わらない（対照実験が空振りでない証明）
		expect(measureRoom({ kill: '1,9' }).L, '無関係な床を潰しても抜けられる').not.toBeNull();
	});

	test(`データ：${LAYER} ${GATE_ROOM} の境界の開きは不変（部屋間の接続を動かさない）`, () => {
		expect(edgeSig(rowsOf(map.layers[LAYER].stages[GATE_ROOM]))).toBe(EDGES);
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
/** n タイル歩く（1タイル = movePlayer 2回／MOVE_STEP = 0.5 セル＝[[blade-moveplayer-is-half-tile]]）。 */
async function walkTiles(page, dir, tiles = 1) {
	await page.evaluate(({ d, n }) => {
		for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
	}, { d: dir, n: tiles });
}
// ⚠️ プレイヤーの座標は `getPlayer()` で読む（[[blade-snapshot-api-names]]）。
const at = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});

test.describe('Blade of Lumia – dark_tower 3F は実機ではしごを要求する（キュー20b ④）', () => {
	test('はしご無しでは穴に阻まれ、はしごを使うと渡れる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		// ① はしごを持たずに穴の帯の手前 (5,5) から南を押す＝渡れない。
		// ⚠️ はしごの所持は `player.hasLadder`（bool）で見る＝道具の実体は subItems ではない
		//    （`shared/items.js` の ITEM_OWNED_FLAG={ladder:'hasLadder'}）。
		await page.goto(previewUrl(GATE_ROOM, 5, 5));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getPlayer().hasLadder),
			'はしごを持たない前提のテスト').toBeFalsy();
		await walkTiles(page, 'down', 3);
		expect((await at(page)).r, 'はしごなしで穴の帯を渡り抜けてしまった').toBeLessThanOrEqual(6);

		// ② はしごを持たせて同じ場所から南へ渡る。
		await page.goto(previewUrl(GATE_ROOM, 5, 5, { ps_ladder: '1' }));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getPlayer().hasLadder),
			'はしごを持てていない').toBeTruthy();
		await walkTiles(page, 'down', 4);
		expect((await at(page)).r, 'はしごを持っていても穴の帯を渡れない').toBeGreaterThanOrEqual(8);
		expect(errors, `page errors on ${GATE_ROOM}:\n${errors.join('\n')}`).toEqual([]);
	});
});
