// tests/d5-frozen-sluice-two-faces.spec.js
// dungeon_5 `4,2`（`3,2` の東の行き止まり）「凍れる床の水門」の番人
// （2026-10-06 / PLAN 実行キュー 40 の第2陣 6室目・盤面は `scripts/migrate-d5-4-2-frozen-sluice-two-faces.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 4,2` と同型＝四角い広間の真ん中に床のルピー（5）が1つあるだけ。
//
// 語彙＝氷の床（`4,1` で入れた TILE.ICE＝押した石は止まるまで滑る）×水門（潮ゲート '='）。
// 水門の下地を氷にした＝閉じていれば石を止める壁、開いていれば石が滑り抜ける氷。
//      1 #B~kkkk~kkk#   ← 宝箱 (1,1)（石が2つのボタンに乗ると現れる）
//      2 #.~kkkk~#kk#   ← 柱 (2,8)
//      3 #.#kkk@Gk*S#   ← 壁 (3,2)／氷の上のボタン (3,6)／氷の水門 (3,7)／石 (3,9)／水門のボタン (3,10)＝石畳
//      4 ..~kkkk~k#o#   ← 柱 (4,9)／ブレーキ (4,10)＝石畳
//      6 #.~kkkk~k*k#   ← 石 (6,9)
//      7 #.~kkkk~*kk#   ← 石 (7,8)
//   列2 は堀・列7 は水路（どちらも幅1＝人ははしごで渡る・石は水門だけを通る）。
//
// 守るものは3つ。
//   ① データ：盤面・bgTiles・水門と links・宝箱の出現条件／ソルバーの厳格・緩い・詰まない・沈まない／
//      対照（はしご・押し・石3つ・水門の両方の顔・ブレーキ・柱・堀の壁）／層の接続。
//   ② 水門の二つの顔（実機）：ボタンの上から押すと開いた水門を滑り抜ける／開いたまま東へ押すと @ を素通りする。
//   ③ 通し：閉じた水門に当てて @ に止め、ボタンへ石を戻すと宝箱が現れて開けられる（ルピー×30）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import {
	TARGET, ICE_MAP, WATER, ICE, PAVED, CHEST, ICE_BUTTON, GATE, GATE_BUTTON, STONES, PILLARS, MOAT_WALL, BRAKE,
	LINKS, SHOW, SHORTEST, SHORTEST_LOOSE, PUSHES, solveRoom, withCell,
} from '../scripts/migrate-d5-4-2-frozen-sluice-two-faces.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '4,2';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
// 実マップから盤面の写しを組み直す（定数ではなく実物を測る）
const liveIceMap = () => {
	const st = stages[ROOM];
	return rowsOf(st).map((row, r) => [...row].map((ch, c) => {
		const bg = st.bgTiles?.[`${r},${c}`];
		if (bg === TILE.WATER) return '~';
		if (bg === TILE.STONE_FLOOR) return ch === TILE.BUTTON ? 'S' : 'o';
		if (bg === TILE.ICE) return ch === TILE.BUTTON ? '@' : ch === TILE.TIDE_GATE ? 'G' : ch === TILE.FLOOR ? 'k' : ch;
		return ch;
	}).join(''));
};

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 4,2 凍れる床の水門 ① データ', () => {
	test('盤面・bgTiles・石とボタンと水門・links・宝箱と出現条件（敵・植生・看板・床の落とし物が無い）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(Object.keys(st.bgTiles).sort()).toEqual([...WATER, ...ICE, ...PAVED].sort());
		for (const k of WATER) expect(st.bgTiles[k], `${k} が水でない`).toBe(TILE.WATER);
		for (const k of ICE) expect(st.bgTiles[k], `${k} が氷でない`).toBe(TILE.ICE);
		for (const k of [GATE_BUTTON, BRAKE]) expect(st.bgTiles[k], `${k} が石畳でない`).toBe(TILE.STONE_FLOOR);
		expect(st.bgTiles[GATE], '水門の下地が氷でない（開いた水門で石が止まってしまう）').toBe(TILE.ICE);
		expect(st.links).toEqual(LINKS);
		expect(st.showConditions).toEqual(SHOW);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } });
		expect(st.floorItems ?? {}, '床のルピーが残っている').toEqual({});
		expect(Object.keys(st.signData ?? {})).toEqual([]);
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.GATE, TILE.SWITCH, TILE.TORCH, TILE.BREAKABLE_WALL]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test(`ソルバー：厳格 ${SHORTEST}（押し ${PUSHES}）・緩い ${SHORTEST_LOOSE}・詰まない・水門の上で沈まない・石は堀を越えない`, () => {
		const im = liveIceMap();
		expect(im).toEqual(ICE_MAP);
		const m = solveRoom(im);
		expect(m.L, '厳格版の最短手数').toBe(SHORTEST);
		expect(m.pushes, '最短解で押す回数').toBe(PUSHES);
		expect(m.pushList[0], '最初はボタンの上から西へ＝開いた水門を抜けて (3,3) まで').toBe('3,9→3,3');
		expect(m.pushList.at(-2), '@ には東へ押して閉じた水門に当てる').toBe(`3,4→${ICE_BUTTON}`);
		expect(m.noEscape, '入って詰む状態').toBe(0);
		expect(m.sunk, '閉じた水門の上に石か自分がいる状態').toBe(0);
		expect([...m.stoneCells].filter((k) => Number(k.split(',')[1]) < 3), '石が堀を越えた').toEqual([]);
		const v = solveRoom(im, { strict: false });
		expect(v.L, '緩い版の最短手数（はしごから開いた水門へ折れる近道の 2 手だけ短い）').toBe(SHORTEST_LOOSE);
		expect(v.noEscape).toBe(0);
		expect(v.sunk).toBe(0);
	});

	test('対照：はしご・押し・石3つ・水門の両方の顔・ブレーキ・柱・堀の壁がどれも飾りでない', () => {
		expect(solveRoom(ICE_MAP, { hasLadder: false, strict: false }).L, 'はしご無しで届く').toBe(null);
		expect(solveRoom(ICE_MAP, { noPush: true, strict: false }).L, '石を押さずに届く').toBe(null);
		for (const k of STONES) expect(solveRoom(withCell(k, 'k'), { strict: false }).L, `石 ${k} が無くても届く`).toBe(null);
		expect(solveRoom(withCell(GATE, '#'), { strict: false }).L, '水門が閉じたままでも届く＝通り道の顔が要らない').toBe(null);
		expect(solveRoom(withCell(GATE, 'k'), { strict: false }).L, '水門が開いたままでも届く＝止め役の顔が要らない').toBe(null);
		expect(solveRoom(withCell(BRAKE, 'k')).L, 'ブレーキを氷にしても届く').toBe(null);
		expect(solveRoom(withCell(PILLARS[0], 'k')).L, `柱 ${PILLARS[0]} を氷にしても届く`).toBe(null);
		expect(solveRoom(withCell(PILLARS[1], 'k')).L, `柱 ${PILLARS[1]} を氷にしても短くならない`).toBeLessThan(SHORTEST);
		expect(solveRoom(withCell(MOAT_WALL, '~'), { strict: false }).pushes, '堀の壁が無くても、はしごの上から押す近道が出ない').toBeLessThanOrEqual(5);
	});

	test('層の接続：到達室は不変・はしご無しでは堀の向こうに届かない', () => {
		const start = { stage: '1,3', row: 7, col: 2 };
		const closed = bfsLayer(stages, start, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
		const field = (r) => [...r.reachedCells].filter((ck) => ck.startsWith(`${ROOM}:`) && Number(ck.split(':')[1].split(',')[1]) >= 3);
		const OPEN = new Set(['T', '!', 'D', '=']);
		expect(field(bfsLayer(stages, start, { withLadder: false, openTiles: OPEN })), '徒歩で堀を越えた').toEqual([]);
		expect(field(bfsLayer(stages, start, { withLadder: true, openTiles: OPEN })).length, 'はしごで堀を越えられない').toBeGreaterThan(0);
	});
});

// ── ② ③ 実機（fromEditor=1 プレビュー）──────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_ladder: '1' });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
// 石押しは実時間のクールダウン（STONE_PUSH_COOLDOWN_MS=600）。滑る石はアニメが長い（1セル 90ms 足す）＝余裕を見て待つ。
async function push(page, d) {
	await page.evaluate((dir) => { window.__game.movePlayer(dir); window.__game.step(1); }, d);
	await page.waitForTimeout(1300);
}
// 石の位置＝動いた石は stonePositions（元のセル→今のセル）、動いていない石は元のセル
const snap = (page) => page.evaluate((stones) => {
	const p = window.__game.getPlayer();
	const ss = window.__game.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		stones: stones.map((k) => { const s = ss.stonePositions?.[k]; return s ? `${s.r},${s.c}` : k; }).sort(),
		openGates: [...(ss.openGates ?? [])].sort(),
		met: [...(ss.conditionsMet ?? [])],
		locked: !!ss.stonesLocked,
		opened: [...(ss.openedChests ?? [])],
		rupees: window.__game.getState().player.rupees,
	};
}, STONES);
// [kind, dir, n, 着いた位置, 押した後の石（押しのときだけ）]
async function run(page, route) {
	for (const [kind, d, n, want, stonesAfter] of route) {
		if (kind === 'push') await push(page, d); else await walk(page, d, n);
		const s = await snap(page);
		expect(s.pos, `${kind} ${d}×${n} の後の位置`).toBe(want);
		if (stonesAfter) expect(s.stones.join(' '), `${d} へ押した後の石（ソルバーと同じ所で止まる）`).toBe(stonesAfter);
	}
}
// 押しの列は migrate のソルバー（厳格版）の最短解から起こした（.scratch/q40-4-2-route.mjs）。入口 (5,0) から。
const FIRST = [
	['walk', 'right', 10, '5,10'],                                    // 堀 (5,2)・水路 (5,7) をはしごで渡る
	['walk', 'up', 2, '3,10'],                                        // 水門のボタンの上に立つ
	['push', 'left', 1, '3,9', '3,3 6,9 7,8'],                        // 足の下で水門が開き、石は水門と @ を滑り抜けて (3,3)
];
const TO_OPEN_FERRY = [
	...FIRST,
	['walk', 'left', 1, '3,8'], ['walk', 'down', 3, '6,8'],
	['push', 'right', 1, '6,9', '3,3 6,10 7,8'],
	['walk', 'down', 2, '8,9'], ['walk', 'left', 1, '8,8'],
	['push', 'up', 1, '7,8', '3,3 3,8 6,10'],                         // 列8 を北へ＝柱 (2,8) で (3,8)
	['walk', 'right', 2, '7,10'],
	['push', 'up', 1, '6,10', '3,3 3,8 4,10'],                        // ブレーキ (4,10) で止まる
	['walk', 'up', 1, '5,10'],
	['push', 'up', 1, '4,10', '3,10 3,3 3,8'],                        // 水門のボタンへ＝石で水門を開けたままにする
	['walk', 'down', 1, '5,10'], ['walk', 'left', 2, '5,8'], ['walk', 'up', 1, '4,8'], ['walk', 'left', 2, '4,6'],
	['walk', 'up', 3, '1,6'], ['walk', 'right', 3, '1,9'], ['walk', 'down', 2, '3,9'],
	['push', 'left', 1, '3,8', '3,10 3,3 3,4'],                       // 開いた水門を抜け、(3,3) の石に当たって (3,4)
];
const SOLVE = [
	...TO_OPEN_FERRY,
	['walk', 'right', 1, '3,9'], ['walk', 'up', 1, '2,9'], ['walk', 'right', 1, '2,10'],
	['push', 'down', 1, '3,10', '3,3 3,4 4,10'],                      // ボタンの石をどかす＝水門が閉じる
	['walk', 'left', 2, '3,8'], ['walk', 'down', 1, '4,8'], ['walk', 'left', 5, '4,3'],
	['push', 'up', 1, '3,3', '1,3 3,4 4,10'],                         // (3,3) の石を北へどける
	['push', 'right', 1, '3,4', `1,3 ${ICE_BUTTON} 4,10`],            // 東へ＝閉じた水門に当たって @ の上で止まる
	['walk', 'down', 2, '5,4'], ['walk', 'right', 6, '5,10'],
	['push', 'up', 1, '4,10', `1,3 ${GATE_BUTTON} ${ICE_BUTTON}`],     // 石をボタンへ戻す
];
// 対照：ボタンの石をどかさない（水門が開いたまま）で同じ押し込みをする
const OPEN_OVERSHOOT = [
	...TO_OPEN_FERRY,
	['walk', 'down', 1, '4,8'], ['walk', 'left', 5, '4,3'],
	['push', 'up', 1, '3,3', '1,3 3,10 3,4'],
	['push', 'right', 1, '3,4', '1,3 3,10 3,9'],                      // @ を素通りし、開いた水門も抜けてボタンの石の手前まで
];

test.describe('D5 4,2 凍れる床の水門 ② 水門の二つの顔（実機）', () => {
	test('ボタンの上に立つと水門が開き、そこから押した石は水門を滑り抜ける／降りると閉じる', async ({ page }) => {
		const errors = await boot(page, 5, 10);
		expect((await snap(page)).openGates, '最初から水門が開いている').toEqual([]);
		await walk(page, 'up', 2);
		expect((await snap(page)).openGates, 'ボタンを踏んでも水門が開かない').toEqual([GATE]);
		await run(page, [['push', 'left', 1, '3,9', '3,3 6,9 7,8']]);
		expect((await snap(page)).openGates, 'ボタンを降りても水門が開いたまま').toEqual([]);
		expect(errors).toEqual([]);
	});

	test('開いたまま東へ押すと @ を素通りする（宝箱は現れない）', async ({ page }) => {
		test.setTimeout(120_000);
		const errors = await boot(page, 5, 0);
		await run(page, OPEN_OVERSHOOT);
		const s = await snap(page);
		expect(s.openGates).toEqual([GATE]);
		expect(s.met, '石が @ を素通りしたのに宝箱が現れた').not.toContain(CHEST);
		expect(s.locked).toBe(false);
		expect(errors).toEqual([]);
	});
});

test.describe('D5 4,2 凍れる床の水門 ③ 通し（実機）', () => {
	test('通し：水門を開けて西へ渡し、閉めて @ に止め、ボタンに石を戻す→宝箱（ルピー×30）が開く', async ({ page }) => {
		test.setTimeout(120_000);
		const errors = await boot(page, 5, 0);
		await run(page, SOLVE);
		let s = await snap(page);
		expect(s.met, '石が2つのボタンに乗ったのに宝箱が現れない').toContain(CHEST);
		expect(s.locked, '石がロックされない').toBe(true);
		const before = s.rupees;
		// 押した後はブレーキ (4,10) の上。行5 へ降りて西へ戻り、水路と堀をはしごで渡って帯へ。宝箱 (1,1) の真下 (2,1) から北へ
		await run(page, [['walk', 'down', 1, '5,10'], ['walk', 'left', 9, '5,1'], ['walk', 'up', 3, '2,1']]);
		await walk(page, 'up', 1);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toContain(CHEST);
		expect(s.rupees, 'ルピーが 30 増えない').toBe(before + 30);
		expect(errors).toEqual([]);
	});
});
