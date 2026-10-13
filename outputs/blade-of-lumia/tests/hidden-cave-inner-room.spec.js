// tests/hidden-cave-inner-room.spec.js
// 草陰の祠（hidden_cave）の奥の間 `1,0`「影の灯の間」の番人
// （2026-10-13 / PLAN 実行キュー56・盤面は `scripts/migrate-hidden-cave-inner-room.mjs`）。
//
// 経緯＝field 6,13 の床にそのまま置いてあったハートの器を、ユーザー判断で草陰の祠へ移した
// （「祠の中にステージを増やしてパズル要素を解いたらハートの器がとれるようにする、ぐらいの難易度」）。
//
//        0123456789AB
//     1  #......#tHt#   ← 影の灯 SH (1,9)＝隣に立てない
//     2  #..*.t.#.t.#   ← 石 (2,3)
//     3  #.t...t#.H.#   ← 灯 A (3,9)
//     4  ...t...T...#   ← 入口 (4,0)・門 (4,7)
//     6  #....S.#...#   ← ボタン (6,5)
//     8  #.....i#.B.#   ← 書き置き (8,6)・宝箱 (8,9)
//   石をボタンへ → 門が開く → A をロウソクで点ける → (4,9) から上へブーメランで SH へ火を運ぶ → 宝箱
//
// 守るもの：
//   ① データ：盤面・宝箱の中身と出る条件・表の間とつながっている・field 6,13 の床から器が消えた
//   ② ソルバー：解ける・出られなくなる状態 0・石を押さないと解けない・ロウソク無しでは解けない
//   ③ 挙動（実機）：上の手順で宝箱が出る（木のブーメラン＝射程3で届く）／A を点ける前の投げでは点かない
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'hidden_cave';
const ROOM = '1,0';
const stages = map.layers[LAYER].stages;
const A = '3,9', SH = '1,9', CHEST = '8,9';

const TARGET = [
	'############',
	'#......#tHt#',
	'#..*.t.#.t.#',
	'#.t...t#.H.#',
	'...t...T...#',
	'#.t..t.#...#',
	'#....S.#...#',
	'#.t....#...#',
	'#.....i#.B.#',
	'############',
];
const rowsOf = (st) => st.tiles.map((r) => r.join(''));
const nbrs = (k) => {
	const [r, c] = k.split(',').map(Number);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`);
};

function solve(opts) {
	const board = rowsOf(stages[ROOM]);
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const S = makeSolver(board, bg, [], {}, new Set(), { hasLadder: false, ...opts });
	const starts = [S.encode(4, 0, S.initStones, 0, 0, S.litInitMask)];
	const full = (1 << S.torchCells.length) - 1;
	return measureMetrics(S, starts, (st) => Number(st.split('|')[4]) === full, () => 0,
		{ guardMax: 1_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
}

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('草陰の祠 奥の間 ① データ', () => {
	test('盤面・宝箱（ハートの器）と出る条件・書き置き', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'heartContainer', name: 'ハートの器' } });
		expect(st.showConditions[CHEST]?.trigger).toBe('torchesLit');
		expect(st.signData['8,6']?.lines?.length, '書き置きの本文が無い').toBeGreaterThan(0);
		expect(st.initLitTorches ?? [], '初めから点いている灯がある').toEqual([]);
	});

	test('表の間の東の壁が開いていて、奥の間まで歩いて行ける', () => {
		expect(stages['0,0'].tiles[4][11]).toBe('.');
		const r = bfsLayer(stages, { stage: '0,0', row: 8, col: 1 }, { withLadder: false, openTiles: null });
		expect(r.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(r.reachedRooms.has(ROOM)).toBe(true);
	});

	test('field 6,13 の床から器が消えた（移した＝最大ハートの総数は増えも減りもしない）', () => {
		const t = map.layers.field.stages['6,13'].tiles;
		expect(t.some((r) => r.includes('9')), 'field 6,13 に床の器が残っている').toBe(false);
	});

	test('影の灯は隣に立てない（ロウソクでは点かない）・灯 A は隣に立てる', () => {
		const t = stages[ROOM].tiles;
		const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
		expect(nbrs(SH).filter((k) => at(k) === '.'), '影の灯の隣に床がある').toEqual([]);
		expect(nbrs(A).filter((k) => at(k) === '.').length).toBeGreaterThan(0);
	});
});

// ── ② ソルバー ───────────────────────────────────────────────────────
test.describe('草陰の祠 奥の間 ② ソルバー', () => {
	test('解ける・出られなくなる状態 0・石とロウソクはどちらも要る', () => {
		const on = solve({ hasCandle: true });
		expect(on.L, '全点灯に届かない').not.toBe(null);
		expect(on.noEscape, '入って出られなくなる状態がある').toBe(0);
		expect(solve({ hasCandle: true, noPush: true }).L, '石を押さずに解けた（石が飾り）').toBe(null);
		expect(solve({ hasCandle: false }).L, 'ロウソク無しで解けた').toBe(null);
	});
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_boomerang: '1', ps_candle: '1', ps_weapon: '1' });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。石は歩いた先にあれば押す。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
	for (let i = 0; i < 4; i++) window.__game.step(1);
}, { d, n: tiles });
// 石を n 回押す。押しには実時間の待ち（STONE_PUSH_COOLDOWN_MS＝600ms）がある∴1回ごとに待つ。
const push = async (page, d, n) => {
	for (let i = 0; i < n; i++) { await page.waitForTimeout(650); await walk(page, d, 1); }
};
const use = (page, item, d) => page.evaluate(({ item, d }) => {
	const g = window.__game;
	g.getPlayer().activeSubItem = item;
	g.setHeroDir(d);
	g.useSubItem();
	for (let i = 0; i < 40; i++) g.step(1);
}, { item, d });
const snap = (page) => page.evaluate((chest) => {
	const g = window.__game;
	const p = g.getPlayer();
	const ss = g.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		lit: [...ss.litTorches].sort(),
		gate: ss.openGates.includes('4,7'),
		chest: ss.conditionsMet.includes(chest),
	};
}, CHEST);

test.describe('草陰の祠 奥の間 ③ 挙動（実機）', () => {
	test('石をボタンへ → 門が開く → A をロウソク → (4,9) から上へ木のブーメラン → 宝箱が出る', async ({ page }) => {
		const errors = await boot(page, 4, 1);
		expect((await snap(page)).gate, '初めから門が開いている').toBe(false);

		await walk(page, 'up', 2); await walk(page, 'right', 1);       // (2,2)
		await push(page, 'right', 1);                                  // 押す：石 (2,3)→(2,4)
		await walk(page, 'up', 1); await walk(page, 'right', 1);       // (1,4)
		await push(page, 'down', 4);                                   // 押す：石 → (6,4)
		expect((await snap(page)).pos).toBe('5,4');
		await walk(page, 'left', 1); await walk(page, 'down', 1);      // (6,3)
		await push(page, 'right', 1);                                  // 押す：石 → ボタン (6,5)
		expect((await snap(page)).gate, '石をボタンに乗せても門が開かない').toBe(true);

		await walk(page, 'up', 2); await walk(page, 'right', 5);       // 門を抜けて (4,9)
		expect((await snap(page)).pos).toBe('4,9');
		await use(page, 'candle', 'up');
		expect((await snap(page)).lit, 'ロウソクで A が点かない').toEqual([A]);
		await use(page, 'boomerang', 'up');
		const s = await snap(page);
		expect(s.lit, '木のブーメランで影の灯へ火が運べない').toEqual([SH, A].sort());
		expect(s.chest, '二つの灯が揃っても宝箱が出ない').toBe(true);
		expect(errors).toEqual([]);
	});

	test('A を点ける前に投げても影の灯は点かない（火元が要る）', async ({ page }) => {
		const errors = await boot(page, 4, 9);   // 門の内側から始める（プレビューは無敵・門は閉じたまま）
		await use(page, 'boomerang', 'up');
		const s = await snap(page);
		expect(s.lit).toEqual([]);
		expect(s.chest).toBe(false);
		expect(errors).toEqual([]);
	});
});
