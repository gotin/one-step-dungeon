// tests/d5-frozen-ice-stopper.spec.js
// dungeon_5 `4,1`（`3,1` の東の行き止まり）「凍れる床の石止め」の番人
// （2026-10-06 / PLAN 実行キュー 40 の第2陣 5室目・盤面は `scripts/migrate-d5-4-1-frozen-ice-stopper.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 4,1` と同型＝四角い広間の真ん中に床の回復薬が1つあるだけ。
//
// 新しい語彙＝氷の床（TILE.ICE 'k'・bgTiles）。押した石は氷の上にいる間、止まるまで滑る（人は滑らない）。
// 新しい盤面（'k'＝氷・'~'＝水・'o'＝石畳＝どれも bgTiles。'@'＝氷の上のボタン）:
//      1 #B~kkkkkk#k#   ← 宝箱 (1,1)（石がボタンに乗ると現れる）／レールの柱 (1,9)
//      2 #.~kkokk@kk#   ← ブレーキ (2,5)＝石畳／ボタン (2,8)（氷の上＝石1つでは滑り過ぎる）
//      3 #.~kkkkkk#k#   ← レールの柱 (3,9)
//      4 ..~kk#kkkk##   ← 折り曲げの柱 (4,5)
//      5 ..~kkkk#kkk#   ← 折り曲げの柱 (5,7)
//      7 #.~kk*k*kkk#   ← 石 (7,5)・(7,7)
//   列2 は幅1の堀（はしごで渡る・石は渡れない＝入口を石で塞げない）。
//
// 守るものは3つ。
//   ① データ：盤面・水と氷と石畳は bgTiles・宝箱の出現条件／ソルバーの厳格・緩いが同じ最短手数・詰まない・
//      石は堀を越えない／対照（はしご・押し・石2つ・氷・レール・折り曲げ・ブレーキ・堀）／層の接続。
//   ② 滑り（エンジン `game/player.js` の石押し）：氷の上では止まるまで滑る／氷でない床（ブレーキ）で止まる／
//      氷の上のボタンは素通りする（止め役が無いと乗らない）。ソルバーと同じ規則＝押すたびに石の位置を突き合わせる。
//   ③ 通し：止め役を置いてから押し込むと石がボタンの上で止まり、宝箱が現れて開けられる（ルピー×30）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import {
	TARGET, ICE_MAP, WATER, ICE, CHEST, BUTTON, STONES, BRAKE, RAILS, BENDS, SHOW,
	SHORTEST, PUSHES, solveRoom, withCell,
} from '../scripts/migrate-d5-4-1-frozen-ice-stopper.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '4,1';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
// 実マップから盤面の写しを組み直す（定数ではなく実物を測る）
const liveIceMap = () => {
	const st = stages[ROOM];
	return rowsOf(st).map((row, r) => [...row].map((ch, c) => {
		const bg = st.bgTiles?.[`${r},${c}`];
		if (bg === TILE.WATER) return '~';
		if (bg === TILE.STONE_FLOOR) return 'o';
		if (bg === TILE.ICE) return ch === TILE.BUTTON ? '@' : ch === TILE.FLOOR ? 'k' : ch;
		return ch;
	}).join(''));
};

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 4,1 凍れる床の石止め ① データ', () => {
	test('盤面・水と氷と石畳は bgTiles・石とボタン・宝箱と出現条件（敵・植生・看板・床の落とし物が無い）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(Object.keys(st.bgTiles).sort()).toEqual([...WATER, ...ICE, BRAKE].sort());
		for (const k of WATER) expect(st.bgTiles[k], `${k} が水でない`).toBe(TILE.WATER);
		for (const k of ICE) expect(st.bgTiles[k], `${k} が氷でない`).toBe(TILE.ICE);
		expect(st.bgTiles[BRAKE], 'ブレーキが石畳でない').toBe(TILE.STONE_FLOOR);
		for (const k of [...STONES, BUTTON]) expect(st.bgTiles[k], `${k}（石・ボタン）の下が氷でない`).toBe(TILE.ICE);
		expect(st.showConditions).toEqual(SHOW);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } });
		expect(st.floorItems ?? {}, '床の回復薬が残っている').toEqual({});
		expect(st.links).toEqual([]);
		expect(Object.keys(st.signData ?? {})).toEqual([]);
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.GATE, TILE.TIDE_GATE, TILE.SWITCH, TILE.TORCH, TILE.BREAKABLE_WALL]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test(`ソルバー：厳格・緩いが同じ最短手数 ${SHORTEST}・押し ${PUSHES}・詰まない・石は堀を越えない`, () => {
		const im = liveIceMap();
		expect(im).toEqual(ICE_MAP);
		const m = solveRoom(im);
		expect(m.L, '厳格版の最短手数').toBe(SHORTEST);
		expect(m.pushes, '最短解で押す回数').toBe(PUSHES);
		expect(m.pushList.at(-1), '最後は北へ押し込んで止め役に当てる').toBe(`3,8→${BUTTON}`);
		expect(m.noEscape, '入って詰む状態').toBe(0);
		expect([...m.stoneCells].filter((k) => Number(k.split(',')[1]) < 3), '石が堀を越えた').toEqual([]);
		const v = solveRoom(im, { strict: false });
		expect(v.L, '緩い版の最短手数＝見た目で読めない近道がある').toBe(SHORTEST);
		expect(v.noEscape).toBe(0);
	});

	test('対照：はしご・押し・石2つ・氷・レールと折り曲げの柱・ブレーキ・堀がどれも飾りでない', () => {
		expect(solveRoom(ICE_MAP, { hasLadder: false, strict: false }).L, 'はしご無しで届く').toBe(null);
		expect(solveRoom(ICE_MAP, { noPush: true, strict: false }).L, '石を押さずに届く').toBe(null);
		for (const k of STONES) expect(solveRoom(withCell(k, 'k'), { strict: false }).L, `石 ${k} が無くても届く＝止め役が要らない`).toBe(null);
		for (const k of [...RAILS, ...BENDS]) expect(solveRoom(withCell(k, 'k')).L, `柱 ${k} を氷にしても届く`).toBe(null);
		expect(solveRoom(withCell(BRAKE, 'k')).L, 'ブレーキを氷にしても届く').toBe(null);
		expect(solveRoom(ICE_MAP.map((row) => row.replace('~', 'k')), { strict: false }).noEscape, '堀が無くても詰まない＝堀が要らない').toBeGreaterThan(0);
	});

	test('層の接続：門を閉じたままの到達室は不変・はしご無しでは堀の向こうに届かない', () => {
		const start = { stage: '1,3', row: 7, col: 2 };
		const closed = bfsLayer(stages, start, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
		// reachedCells の形＝`部屋:r,c`（部屋の名前にも ',' がある∴':' で先に割る）
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
// 押しの列は `scripts/migrate-d5-4-1-...` のソルバーの状態空間から起こした（.scratch/q40-4-1-route.mjs）。
// 入口の帯 (4,1) から堀 (6,2) をはしごで渡り、南の石へ。
const TO_STONES = [
	['walk', 'down', 2, '6,1'],
	['walk', 'right', 7, '6,8'],                                    // (6,2) をはしごで渡る
	['walk', 'down', 1, '7,8'],
	['push', 'left', 1, '7,7', '7,5 7,6'],                          // 石 (7,7) が西へ滑り、石 (7,5) に当たって止まる
	['walk', 'down', 1, '8,7'], ['walk', 'left', 1, '8,6'],
	['push', 'up', 1, '7,6', '1,6 7,5'],                            // 列6 を北の壁まで滑る
	['walk', 'down', 1, '8,6'], ['walk', 'left', 1, '8,5'],
	['push', 'up', 1, '7,5', '1,6 5,5'],                            // 列5 を北へ＝柱 (4,5) で止まる
	['walk', 'up', 1, '6,5'], ['walk', 'left', 1, '6,4'], ['walk', 'up', 1, '5,4'],
	['push', 'right', 1, '5,5', '1,6 5,6'],                         // 行5 を東へ＝柱 (5,7) で止まる
	['walk', 'down', 1, '6,5'], ['walk', 'right', 1, '6,6'],
	['push', 'up', 1, '5,6', '1,6 2,6'],                            // 列6 を北へ＝行1 の石に当たって行2 で止まる
	['walk', 'up', 2, '3,6'],
];
const SOLVE = [
	...TO_STONES,
	['walk', 'left', 1, '3,5'], ['walk', 'up', 2, '1,5'],
	['push', 'right', 1, '1,6', '1,8 2,6'],                         // 止め役＝行1 を東へ＝レールの柱 (1,9) で (1,8)
	['walk', 'right', 1, '1,7'], ['walk', 'down', 1, '2,7'],
	['push', 'left', 1, '2,6', '1,8 2,5'],                          // 行2 を西へ＝ブレーキ (2,5) で止まる
	['walk', 'up', 1, '1,6'], ['walk', 'left', 1, '1,5'],
	['push', 'down', 1, '2,5', '1,8 3,5'],                          // 南へ＝柱 (4,5) で (3,5)
	['walk', 'left', 1, '2,4'], ['walk', 'down', 1, '3,4'],
	['push', 'right', 1, '3,5', '1,8 3,8'],                         // 行3 を東へ＝レールの柱 (3,9) で (3,8)
	['walk', 'right', 1, '3,6'], ['walk', 'down', 1, '4,6'], ['walk', 'right', 2, '4,8'],
	['push', 'up', 1, '3,8', `1,8 ${BUTTON}`],                      // 押し込む＝止め役 (1,8) に当たってボタンの上で止まる
];
// 対照：止め役 (1,6)→(1,8) を置かないまま同じ押し込みをする
const NO_STOPPER = [
	...TO_STONES.slice(0, -1),
	['walk', 'up', 2, '3,6'], ['walk', 'right', 1, '3,7'], ['walk', 'up', 1, '2,7'],
	['push', 'left', 1, '2,6', '1,6 2,5'],
	['walk', 'down', 1, '3,6'], ['walk', 'left', 2, '3,4'], ['walk', 'up', 2, '1,4'], ['walk', 'right', 1, '1,5'],
	['push', 'down', 1, '2,5', '1,6 3,5'],
	['walk', 'left', 1, '2,4'], ['walk', 'down', 1, '3,4'],
	['push', 'right', 1, '3,5', '1,6 3,8'],
	['walk', 'right', 1, '3,6'], ['walk', 'down', 1, '4,6'], ['walk', 'right', 2, '4,8'],
	['push', 'up', 1, '3,8', '1,6 1,8'],                            // ボタン (2,8) を素通りして北の壁まで滑る
];

test.describe('D5 4,1 凍れる床の石止め ② 滑り（実機）', () => {
	test('氷の上の石は止まるまで滑る（柱・石・北の壁）／人は滑らない（押した後は石の元のセルへ1マス）', async ({ page }) => {
		const errors = await boot(page, 8, 5);
		await run(page, [['push', 'up', 1, '7,5', '5,5 7,7']]);     // 列5 を2マス滑って柱 (4,5) の手前で止まる
		await run(page, [['walk', 'down', 1, '8,5'], ['walk', 'right', 2, '8,7']]);
		await run(page, [['push', 'up', 1, '7,7', '5,5 6,7']]);     // 柱 (5,7) の手前＝1マス
		expect(errors).toEqual([]);
	});

	test(`止め役が無いと、押し込んだ石は氷の上のボタン ${BUTTON} を素通りする（宝箱は現れない）`, async ({ page }) => {
		test.setTimeout(90_000);
		const errors = await boot(page, 4, 1);
		await run(page, NO_STOPPER);
		const s = await snap(page);
		expect(s.met, '石がボタンを素通りしたのに宝箱が現れた').not.toContain(CHEST);
		expect(s.locked).toBe(false);
		expect(errors).toEqual([]);
	});
});

test.describe('D5 4,1 凍れる床の石止め ③ 通し（実機）', () => {
	test('通し：止め役を置き、ブレーキとレールで石を揃えて押し込む→ボタンの上で止まり、宝箱（ルピー×30）が開く', async ({ page }) => {
		test.setTimeout(90_000);
		const errors = await boot(page, 4, 1);
		await run(page, SOLVE);
		let s = await snap(page);
		expect(s.met, '石がボタンに乗ったのに宝箱が現れない').toContain(CHEST);
		expect(s.locked, '石がロックされない').toBe(true);
		const before = s.rupees;
		// 行3 を西へ戻り、堀 (3,2) をはしごで渡って帯へ。宝箱 (1,1) の真下 (2,1) から北へ
		await run(page, [['walk', 'left', 7, '3,1'], ['walk', 'up', 1, '2,1']]);
		await walk(page, 'up', 1);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toContain(CHEST);
		expect(s.rupees, 'ルピーが 30 増えない').toBe(before + 30);
		expect(errors).toEqual([]);
	});
});
