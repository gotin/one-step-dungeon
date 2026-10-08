// tests/d5-frozen-bell-road.spec.js
// dungeon_5 `4,3`（`3,3` の東の行き止まり）「凍れる湖の鐘の道」の番人
// （2026-10-08 / PLAN 実行キュー 40 の第2陣 7室目・盤面は `scripts/migrate-d5-4-3-frozen-bell-road.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 4,3` と同型＝四角い広間の真ん中に床のルピー（5）が1つあるだけ。
//
// 語彙＝氷の床（押した石は止まるまで滑る）×下地が氷の水門（開けば滑り抜け、閉じれば止め役）×鐘（矢で鳴らす）。
//      3 #.~kkkk~~Y~#   ← 上の鐘 (3,9)→手前の水門 (7,7)
//      4 ..~kkkk~~Y~#   ← 下の鐘 (4,9)→奥の水門 (7,9)
//      7 #.~kkk@G@G@#   ← 石の道＝@0 (7,6)・水門 (7,7)・@1 (7,8)・水門 (7,9)・@2 (7,10)
//   道の西端から東へ押した石は、両方開＝@2・手前だけ開＝@1・両方閉＝@0 で止まる。
//
// 守るものは3つ。
//   ① データ：盤面・bgTiles・鐘と水門と links・宝箱の出現条件／ソルバーの厳格・緩い・詰まない・沈まない・
//      奥から順に埋まる／対照（はしご・押し・道具・石3つ・水門2枚の両方の顔・柱・ブレーキ）／層の接続。
//   ② 鐘の道（実機）：鐘を鳴らすと対応する水門だけが干上がる／鳴らさずに押した石は @0 で止まる。
//   ③ 通し：奥から順に、水門を閉じながら3つのボタンに石を止めると宝箱が現れて開けられる（ルピー×30）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import {
	TARGET, ICE_MAP, WATER, ICE, PAVED, CHEST, BUTTONS, GATE_NEAR, GATE_FAR, BELL_NEAR, BELL_FAR, STONES, BRAKE,
	LINKS, SHOW, SHORTEST, SHORTEST_LOOSE, PUSHES, SHOTS, solveRoom, withCell,
} from '../scripts/migrate-d5-4-3-frozen-bell-road.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '4,3';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
// 実マップから盤面の写しを組み直す（定数ではなく実物を測る）
const liveIceMap = () => {
	const st = stages[ROOM];
	return rowsOf(st).map((row, r) => [...row].map((ch, c) => {
		const bg = st.bgTiles?.[`${r},${c}`];
		if (bg === TILE.WATER) return '~';
		if (bg === TILE.STONE_FLOOR) return 'o';
		if (bg === TILE.ICE) return ch === TILE.BUTTON ? '@' : ch === TILE.TIDE_GATE ? 'G' : ch === TILE.FLOOR ? 'k' : ch;
		return ch;
	}).join(''));
};
const only = (bell) => LINKS.filter((l) => l.switchId === bell);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 4,3 凍れる湖の鐘の道 ① データ', () => {
	test('盤面・bgTiles・石とボタンと水門と鐘・links・宝箱と出現条件（敵・植生・看板・床の落とし物が無い）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(Object.keys(st.bgTiles).sort()).toEqual([...WATER, ...ICE, ...PAVED].sort());
		for (const k of WATER) expect(st.bgTiles[k], `${k} が水でない`).toBe(TILE.WATER);
		for (const k of ICE) expect(st.bgTiles[k], `${k} が氷でない`).toBe(TILE.ICE);
		expect(st.bgTiles[BRAKE], 'ブレーキが石畳でない').toBe(TILE.STONE_FLOOR);
		for (const g of [GATE_NEAR, GATE_FAR]) expect(st.bgTiles[g], `水門 ${g} の下地が氷でない（開いた水門で石が止まってしまう）`).toBe(TILE.ICE);
		for (const b of [BELL_NEAR, BELL_FAR]) expect(rowsOf(st)[Number(b.split(',')[0])][Number(b.split(',')[1])], `鐘 ${b}`).toBe(TILE.SWITCH);
		expect(st.links).toEqual(LINKS);
		expect(st.showConditions).toEqual(SHOW);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } });
		expect(st.floorItems ?? {}, '床のルピーが残っている').toEqual({});
		expect(Object.keys(st.signData ?? {})).toEqual([]);
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.GATE, TILE.TORCH, TILE.BREAKABLE_WALL]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test(`ソルバー：厳格 ${SHORTEST}（押し ${PUSHES}・鐘 ${SHOTS}）・緩い ${SHORTEST_LOOSE}・詰まない・沈まない・奥から順に埋まる`, () => {
		const im = liveIceMap();
		expect(im).toEqual(ICE_MAP);
		const m = solveRoom(im);
		expect(m.L, '厳格版の最短手数').toBe(SHORTEST);
		expect(m.pushes, '最短解で押す回数').toBe(PUSHES);
		expect(m.shots, '最短解で鐘を鳴らす回数').toBe(SHOTS);
		const onButtons = m.pushList.filter((p) => BUTTONS.includes(p.split('→')[1])).map((p) => p.split('→')[1]);
		expect(onButtons, 'ボタンは奥から順に埋まる').toEqual([...BUTTONS].reverse());
		expect(m.noEscape, '入って詰む状態').toBe(0);
		expect(m.sunk, '閉じた水門の上に石か自分がいる状態').toBe(0);
		const v = solveRoom(im, { strict: false });
		expect(v.L, '緩い版の最短手数（はしごの上から押す近道の 2 手だけ短い）').toBe(SHORTEST_LOOSE);
		expect(v.noEscape).toBe(0);
		expect(v.sunk).toBe(0);
	});

	test('対照：はしご・押し・鐘・石3つ・水門2枚の両方の顔・柱・ブレーキがどれも飾りでない', () => {
		expect(solveRoom(ICE_MAP, { hasLadder: false, strict: false }).L, 'はしご無しで届く').toBe(null);
		expect(solveRoom(ICE_MAP, { noPush: true, strict: false }).L, '石を押さずに届く').toBe(null);
		expect(solveRoom(ICE_MAP, { noTools: true, strict: false }).L, '鐘を鳴らさずに届く').toBe(null);
		for (const k of STONES) expect(solveRoom(withCell(k, 'k'), { strict: false }).L, `石 ${k} が無くても届く`).toBe(null);
		expect(solveRoom(withCell(GATE_NEAR, 'k'), { strict: false, links: only(BELL_FAR) }).L, '手前の水門が開いたままでも届く').toBe(null);
		expect(solveRoom(withCell(GATE_FAR, 'k'), { strict: false, links: only(BELL_NEAR) }).L, '奥の水門が開いたままでも届く').toBe(null);
		expect(solveRoom(withCell(GATE_NEAR, '#'), { strict: false, links: only(BELL_FAR) }).L, '手前の水門が閉じたままでも届く').toBe(null);
		expect(solveRoom(withCell(GATE_FAR, '#'), { strict: false, links: only(BELL_NEAR) }).L, '奥の水門が閉じたままでも届く').toBe(null);
		expect(solveRoom(withCell('8,5', 'k')).L, '柱 (8,5) を氷にしても届く').toBe(null);
		for (const k of [BRAKE, '5,4', '6,6']) expect(solveRoom(withCell(k, 'k')).L, `${k} を氷にしても短くならない`).toBeLessThan(SHORTEST);
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
	const q = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_ladder: '1', ps_bow: '1',
	});
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
// 向いて矢を1本射る（矢が飛び切るまで tick を進める）
async function shoot(page, dir) {
	await page.evaluate((d) => {
		window.__game.setHeroDir(d);
		window.__game.step(1);
		window.__game.getPlayer().activeSubItem = 'bow';
		window.__game.useSubItem();
		window.__game.step(30);
	}, dir);
}
// 石の位置＝動いた石は stonePositions（元のセル→今のセル）、動いていない石は元のセル
const snap = (page) => page.evaluate((stones) => {
	const p = window.__game.getPlayer();
	const ss = window.__game.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		stones: stones.map((k) => { const s = ss.stonePositions?.[k]; return s ? `${s.r},${s.c}` : k; }).sort(),
		bells: [...(ss.switchToggles ?? [])].sort(),
		openGates: [...(ss.openGates ?? [])].sort(),
		met: [...(ss.conditionsMet ?? [])],
		locked: !!ss.stonesLocked,
		opened: [...(ss.openedChests ?? [])],
		rupees: window.__game.getState().player.rupees,
	};
}, STONES);
// [kind, dir, n, 着いた位置, 押した後の石（押しのとき）／開いている水門（射るとき）]
async function run(page, route) {
	for (const [kind, d, n, want, after] of route) {
		if (kind === 'push') await push(page, d);
		else if (kind === 'shoot') await shoot(page, d);
		else await walk(page, d, n);
		const s = await snap(page);
		expect(s.pos, `${kind} ${d}×${n} の後の位置`).toBe(want);
		if (kind === 'push') expect(s.stones.join(' '), `${d} へ押した後の石（ソルバーと同じ所で止まる）`).toBe(after);
		if (kind === 'shoot') expect(s.openGates.join(' '), '鐘を鳴らした後に開いている水門').toBe(after);
	}
}
const sorted = (a) => [...a].sort().join(' ');
// 押し・鐘の列は migrate のソルバー（厳格版）の最短解から起こした（.scratch/q40-4-3-route.mjs）。入口 (4,0) から。
const FIRST_STONE_TO_ROAD = [
	['walk', 'right', 1, '4,1'],
	['walk', 'right', 4, '4,5'],                                       // 堀 (4,2) をはしごで渡る
	['push', 'down', 1, '5,5', '2,5 6,4 6,5'],                         // ブレーキ (6,5) で止まる
	['push', 'down', 1, '6,5', '2,5 6,4 7,5'],                         // 道の西端 (7,5)
	['walk', 'up', 2, '4,5'], ['walk', 'left', 2, '4,3'], ['walk', 'down', 2, '6,3'],
	['push', 'right', 1, '6,4', '2,5 6,5 7,5'],                        // 2つ目の石をブレーキへ
	['walk', 'down', 1, '7,4'],
];
const SOLVE = [
	['shoot', 'right', 1, '4,0', GATE_FAR],                            // 入口の前から下の鐘＝奥の水門
	['walk', 'right', 1, '4,1'], ['walk', 'up', 1, '3,1'],
	['shoot', 'right', 1, '3,1', sorted([GATE_NEAR, GATE_FAR])],       // 上の鐘＝手前の水門（両方開）
	['walk', 'down', 1, '4,1'],
	...FIRST_STONE_TO_ROAD.slice(1),
	['push', 'right', 1, '7,5', '2,5 6,5 7,10'],                       // 両方開＝奥の @2 まで滑る
	['walk', 'left', 1, '7,4'], ['walk', 'up', 1, '6,4'], ['walk', 'left', 1, '6,3'], ['walk', 'up', 2, '4,3'],
	['shoot', 'right', 1, '4,3', GATE_NEAR],                           // 下の鐘を鳴らし直す＝奥の水門が閉じる
	['walk', 'right', 2, '4,5'], ['walk', 'down', 1, '5,5'],
	['push', 'down', 1, '6,5', '2,5 7,10 7,5'],
	['walk', 'left', 1, '6,4'], ['walk', 'down', 1, '7,4'],
	['push', 'right', 1, '7,5', '2,5 7,10 7,8'],                       // 奥の水門に当たって @1 で止まる
	['walk', 'up', 4, '3,5'],
	['shoot', 'right', 1, '3,5', ''],                                  // 上の鐘を鳴らし直す＝手前の水門も閉じる
	['walk', 'left', 1, '3,4'], ['walk', 'up', 2, '1,4'], ['walk', 'right', 1, '1,5'],
	['push', 'down', 1, '2,5', '6,5 7,10 7,8'],                        // 北の石を南へ＝ブレーキまで滑る
	['walk', 'down', 3, '5,5'],
	['push', 'down', 1, '6,5', '7,10 7,5 7,8'],
	['walk', 'left', 1, '6,4'], ['walk', 'down', 1, '7,4'],
	['push', 'right', 1, '7,5', '7,10 7,6 7,8'],                       // 手前の水門に当たって @0 で止まる
];

test.describe('D5 4,3 凍れる湖の鐘の道 ② 鐘の道（実機）', () => {
	test('鐘を鳴らすと対応する水門だけが干上がる・鳴らし直すと閉じる', async ({ page }) => {
		const errors = await boot(page, 4, 0);
		expect((await snap(page)).openGates, '最初から水門が開いている').toEqual([]);
		await shoot(page, 'right');                                      // 行4＝下の鐘
		let s = await snap(page);
		expect(s.bells, '入口の前から下の鐘に当たらない').toEqual([BELL_FAR]);
		expect(s.openGates, '下の鐘で奥の水門だけが干上がらない').toEqual([GATE_FAR]);
		await run(page, [['walk', 'right', 1, '4,1'], ['walk', 'up', 1, '3,1']]);
		await shoot(page, 'right');                                      // 行3＝上の鐘
		s = await snap(page);
		expect(s.bells).toEqual([BELL_FAR, BELL_NEAR].sort());
		expect(s.openGates, '上の鐘で手前の水門が干上がらない').toEqual([GATE_NEAR, GATE_FAR].sort());
		await shoot(page, 'right');
		s = await snap(page);
		expect(s.openGates, '上の鐘を鳴らし直しても手前の水門が閉じない').toEqual([GATE_FAR]);
		expect(errors).toEqual([]);
	});

	test('鐘を鳴らさずに道へ押した石は、閉じた手前の水門に当たって @0 で止まる（宝箱は現れない）', async ({ page }) => {
		test.setTimeout(120_000);
		const errors = await boot(page, 4, 0);
		await run(page, [...FIRST_STONE_TO_ROAD, ['push', 'right', 1, '7,5', `2,5 6,5 ${BUTTONS[0]}`]]);
		const s = await snap(page);
		expect(s.openGates).toEqual([]);
		expect(s.met, '石が1つしか乗っていないのに宝箱が現れた').not.toContain(CHEST);
		expect(s.locked).toBe(false);
		expect(errors).toEqual([]);
	});
});

test.describe('D5 4,3 凍れる湖の鐘の道 ③ 通し（実機）', () => {
	test('通し：奥から順に水門を閉じながら3つのボタンに石を止める→宝箱（ルピー×30）が開く', async ({ page }) => {
		test.setTimeout(180_000);
		const errors = await boot(page, 4, 0);
		await run(page, SOLVE);
		let s = await snap(page);
		expect(s.met, '石が3つのボタンに乗ったのに宝箱が現れない').toContain(CHEST);
		expect(s.locked, '石がロックされない').toBe(true);
		const before = s.rupees;
		// 押した後は道の西端 (7,5)。列3 を北へ上がって行4 を西へ、堀をはしごで渡って帯へ。宝箱 (1,1) の真下 (2,1) から北へ
		await run(page, [['walk', 'left', 2, '7,3'], ['walk', 'up', 3, '4,3'], ['walk', 'left', 2, '4,1'], ['walk', 'up', 2, '2,1']]);
		await walk(page, 'up', 1);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toContain(CHEST);
		expect(s.rupees, 'ルピーが 30 増えない').toBe(before + 30);
		expect(errors).toEqual([]);
	});
});
