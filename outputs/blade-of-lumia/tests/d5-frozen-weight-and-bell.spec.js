// tests/d5-frozen-weight-and-bell.spec.js
// dungeon_5 `4,0`（`3,0` の東の行き止まり）「凍れる湖の重しと鐘」の番人
// （2026-10-06 / PLAN 実行キュー 40 の第2陣 4室目・盤面は `scripts/migrate-d5-4-0-frozen-weight-and-bell.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 4,0` と同型＝四角い広間の真ん中に床のルピー（5）が1つあるだけ。
//
// 新しい盤面（水は bgTiles）:
//      1 #...~~~~~~B#   ← 宝箱 (1,10)＝ルピー×30（面して立てるのは (2,10) だけ）
//      2 #*#.~#~~~~.#   ← 石 (2,1)
//      3 #...#S~Y~~.#   ← 島のボタン (3,5)／鐘 (3,7)→水門 (4,4)
//      4 ....=.~=~=.#   ← 水門 (4,4)＝石の渡し／足場 (4,7)←島のボタン・(4,9)←鐘 (7,7)
//      5 ....~.~~~~.#   ← 島の南 (5,5)＝石の裏へ回る所
//      7 #..S~~#Y~~.#   ← 岸のボタン (7,3)＝おとり（→水門 (4,4)）／鐘 (7,7)
//
// 守るものは3つ。
//   ① データ：盤面・水・石・ボタン・鐘・水門と links・中身／ソルバーの厳格・緩い・ビームが同じ最短手数・詰まない・
//      石が沈んだ状態に入らない／対照（はしご・押し・弓・鐘2つ・島のボタン・石・水門3枚・島の南・橋脚の規則・おとり）／層の接続。
//   ② 挙動（実機）：岸のボタンは踏んでいる間だけ水門を干す（おとり）／鐘で干した水門は戻らない／
//      通しで石を島のボタンへ運び、足場2つを渡って宝箱。
//   ③ 不発の規則（`game/player.js toggleSwitch`・この部屋で入れた）：干した水門の上に石があるとき、鐘を射っても水門は閉じない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import {
	TARGET, WATER, WATER_MAP, CHEST, STONE, BELL_FERRY, BELL_PIER, ISLAND_BUTTON, DECOY_BUTTON, FERRY, PIERS, BEHIND,
	LINKS, SHORTEST, PUSHES, SHOTS, solveRoom, withCell,
} from '../scripts/migrate-d5-4-0-frozen-weight-and-bell.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '4,0';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
// 実マップから水の盤面を組み直す（定数ではなく実物を測る）
const liveWaterMap = () => rowsOf(stages[ROOM]).map((row, r) =>
	[...row].map((ch, c) => (stages[ROOM].bgTiles?.[`${r},${c}`] === TILE.WATER ? '~' : ch)).join(''));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 4,0 凍れる湖の重しと鐘 ① データ', () => {
	test('盤面・水は bgTiles・石とボタンと鐘・水門と links・宝箱（敵・植生・看板・床の落とし物が無い）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(Object.keys(st.bgTiles).sort()).toEqual([...WATER].sort());
		expect(Object.values(st.bgTiles).every((v) => v === TILE.WATER)).toBe(true);
		expect(st.links).toEqual(LINKS);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } });
		expect(st.floorItems ?? {}, '床のルピー（5）が残っている').toEqual({});
		expect(st.showConditions ?? {}).toEqual({});
		expect(Object.keys(st.signData ?? {})).toEqual([]);
		const at = (k) => { const [r, c] = k.split(',').map(Number); return rowsOf(st)[r][c]; };
		expect(at(STONE)).toBe(TILE.STONE);
		expect([ISLAND_BUTTON, DECOY_BUTTON].map(at)).toEqual([TILE.BUTTON, TILE.BUTTON]);
		expect([BELL_FERRY, BELL_PIER].map(at)).toEqual([TILE.SWITCH, TILE.SWITCH]);
		expect([FERRY, ...PIERS].map(at)).toEqual([TILE.TIDE_GATE, TILE.TIDE_GATE, TILE.TIDE_GATE]);
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.GATE, TILE.TORCH, TILE.BREAKABLE_WALL]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test(`ソルバー：厳格・緩い・ビームが同じ最短手数 ${SHORTEST}・詰まない・石が沈んだ状態に入らない`, () => {
		const wm = liveWaterMap();
		expect(wm).toEqual(WATER_MAP);
		const m = solveRoom(wm);
		expect(m.L, '厳格版の最短手数').toBe(SHORTEST);
		expect(m.pushes, '最短解で押す回数').toBe(PUSHES);
		expect(m.shots, '最短解で鐘を射る回数').toBe(SHOTS);
		expect(m.shotFrom[1], '2つ目の鐘は足場 (4,7) から射る').toBe(PIERS[0]);
		expect(m.sunkStates, '石が沈んだ状態に入れる').toBe(0);
		for (const o of [{}, { strict: false, guard: false }, { beam: true }, { strict: false, guard: false, beam: true }]) {
			const v = solveRoom(wm, o);
			expect(v.L, `${JSON.stringify(o)} の最短手数＝見た目で読めない近道がある`).toBe(SHORTEST);
			expect(v.noEscape, `${JSON.stringify(o)} で入って詰む状態`).toBe(0);
		}
		expect(solveRoom(wm, { guard: false }).sunkStates, '不発の規則を外しても石が沈まない＝規則の測定が壊れている').toBeGreaterThan(0);
	});

	test('対照：はしご・押し・弓・鐘2つ・島のボタン・石・水門3枚・島の南・橋脚の規則がどれも飾りでない／岸のボタンはおとり', () => {
		expect(solveRoom(WATER_MAP, { hasLadder: false, strict: false }).L, 'はしご無しで届く').toBe(null);
		expect(solveRoom(WATER_MAP, { noPush: true, strict: false }).L, '石を押さずに届く').toBe(null);
		expect(solveRoom(WATER_MAP, { noTools: true, strict: false }).L, '剣だけで届く＝弓が要らない').toBe(null);
		for (const k of [BELL_FERRY, BELL_PIER, ISLAND_BUTTON, STONE]) {
			expect(solveRoom(withCell(k, TILE.WALL), { strict: false }).L, `${k} を壁にしても届く`).toBe(null);
		}
		for (const g of [FERRY, ...PIERS]) expect(solveRoom(withCell(g, '~'), { strict: false }).L, `水門 ${g} を水にしても届く`).toBe(null);
		expect(solveRoom(withCell(BEHIND, '~'), { strict: false }).L, `島の南 ${BEHIND} を水にしても届く`).toBe(null);
		expect(solveRoom(WATER_MAP, { strict: false, openTideBanks: false }).L, '開いた水門を橋脚に数えなくても届く').toBe(null);
		expect(solveRoom(withCell(DECOY_BUTTON, TILE.WALL)).L, '岸のボタンが解に要る（おとりになっていない）').toBe(SHORTEST);
	});

	test('層の接続は不変', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '4,0 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
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
// 石押しは実時間のクールダウン（STONE_PUSH_COOLDOWN_MS=600）＝1押しごとに待つ。1押し＝石もプレイヤーも1マス。
async function push(page, d, times) {
	for (let i = 0; i < times; i++) {
		await page.evaluate((dir) => { window.__game.movePlayer(dir); window.__game.step(1); }, d);
		await page.waitForTimeout(650);
	}
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
const snap = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	const ss = window.__game.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		stones: Object.values(ss.stonePositions ?? {}).map((s) => `${s.r},${s.c}`).sort(),
		bells: [...(ss.switchToggles ?? [])].sort(),
		openGates: [...(ss.openGates ?? [])].sort(),
		opened: [...(ss.openedChests ?? [])],
		rupees: window.__game.getState().player.rupees,
	};
});
async function run(page, route) {
	for (const [kind, d, n, want] of route) {
		if (kind === 'push') await push(page, d, n); else await walk(page, d, n);
		expect((await snap(page)).pos, `${kind} ${d}×${n} の後`).toBe(want);
	}
}
const sorted = (a) => [...a].sort();
// 西の岸から島へ渡り、島のボタンの上から東の鐘を射る（水門 (4,4) が干上がる）
const RING_FERRY_BELL = [
	['walk', 'right', 4, '5,5'],                                   // (5,4) をはしごで渡って島の南へ
	['walk', 'up', 2, '3,5'],                                      // 島のボタンの上
];
// 北西の窪みの石を行4 へ下ろし、西の口の前から東へ押して水門 (4,4) の上まで
const STONE_TO_FERRY = [
	['walk', 'down', 1, '4,5'], ['walk', 'left', 2, '4,3'],       // 干した水門を歩いて岸へ
	['walk', 'up', 3, '1,3'], ['walk', 'left', 2, '1,1'],
	['push', 'down', 2, '3,1'],                                    // 石 (2,1)→(4,1)
	['walk', 'right', 1, '3,2'], ['walk', 'down', 2, '5,2'], ['walk', 'left', 2, '5,0'], ['walk', 'up', 1, '4,0'],
	['push', 'right', 3, '4,3'],                                   // 石 (4,1)→(4,4)＝水門の上
];

test.describe('D5 4,0 凍れる湖の重しと鐘 ② 実機', () => {
	test(`岸のボタン ${DECOY_BUTTON} は踏んでいる間だけ水門 ${FERRY} を干す（おとり）`, async ({ page }) => {
		const errors = await boot(page, 7, 2);
		expect((await snap(page)).openGates).toEqual([]);
		await run(page, [['walk', 'right', 1, DECOY_BUTTON]]);
		expect((await snap(page)).openGates, '踏んでも水門が干上がらない').toEqual([FERRY]);
		await run(page, [['walk', 'up', 1, '6,3']]);
		expect((await snap(page)).openGates, '離れても水門が戻らない').toEqual([]);
		expect(errors).toEqual([]);
	});

	test('通し：鐘で水門を干し、石を島へ渡して裏から島のボタンへ押し、足場から鐘を射て宝箱（ルピー×30）を開ける', async ({ page }) => {
		const errors = await boot(page, 5, 1);
		await run(page, RING_FERRY_BELL);
		await shoot(page, 'right');                                    // 鐘 (3,7) → 水門 (4,4)
		let s = await snap(page);
		expect(s.bells, '島から東の鐘に当たらない').toEqual([BELL_FERRY]);
		expect(s.openGates).toContain(FERRY);
		await run(page, [...STONE_TO_FERRY, ['push', 'right', 1, FERRY]]);   // 水門を渡して島 (4,5) へ
		expect((await snap(page)).stones).toEqual(['4,5']);
		await run(page, [
			['walk', 'left', 1, '4,3'], ['walk', 'down', 1, '5,3'],
			['walk', 'right', 2, BEHIND],                                // はしごで島の南へ回る
			['push', 'up', 1, '4,5'],                                    // 石を島のボタンへ
		]);
		s = await snap(page);
		expect(s.stones).toEqual([ISLAND_BUTTON]);
		expect(s.openGates, '足場 (4,7) が干上がらない').toContain(PIERS[0]);
		await push(page, 'up', 1);                                     // ボタンの北は壁＝石はもう動かない
		expect((await snap(page)).stones, '島のボタンから石が押し出せた').toEqual([ISLAND_BUTTON]);
		await run(page, [['walk', 'right', 2, PIERS[0]]]);             // はしごで足場 (4,7) へ
		await shoot(page, 'down');                                     // 鐘 (7,7) → 足場 (4,9)
		s = await snap(page);
		expect(s.bells).toEqual(sorted([BELL_FERRY, BELL_PIER]));
		expect(s.openGates).toEqual(sorted([FERRY, ...PIERS]));
		const before = s.rupees;
		await run(page, [['walk', 'right', 3, '4,10'], ['walk', 'up', 2, '2,10']]);
		await walk(page, 'up', 1);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toContain(CHEST);
		expect(s.rupees, 'ルピーが 30 増えない').toBe(before + 30);
		expect(errors).toEqual([]);
	});
});

// ── ③ 不発の規則 ─────────────────────────────────────────────────────
test.describe('D5 4,0 凍れる湖の重しと鐘 ③ 不発の規則', () => {
	test(`干した水門 ${FERRY} の上に石があるとき、鐘を射り直しても水門は閉じない（石が水に沈まない）／どかせば射り直せる`, async ({ page }) => {
		const errors = await boot(page, 5, 1);
		await run(page, RING_FERRY_BELL);
		await shoot(page, 'right');
		await run(page, STONE_TO_FERRY);
		let s = await snap(page);
		expect(s.stones, '石が水門の上に無い').toEqual([FERRY]);
		await run(page, [['walk', 'down', 1, '5,3'], ['walk', 'right', 2, BEHIND], ['walk', 'up', 2, ISLAND_BUTTON]]);
		await shoot(page, 'right');                                    // 石が水門の上＝不発
		s = await snap(page);
		expect(s.bells, '石が乗っているのに鐘が鳴った').toEqual([BELL_FERRY]);
		expect(s.openGates, '石の下の水門が閉じた').toContain(FERRY);
		expect(s.stones).toEqual([FERRY]);
		// 対照：石を島の側から西へ押し戻して水門を空ければ、同じ所から射り直せて水門が戻る（規則が「いつも不発」になっていない）
		await run(page, [['walk', 'down', 1, '4,5'], ['push', 'left', 1, FERRY], ['walk', 'right', 1, '4,5'], ['walk', 'up', 1, ISLAND_BUTTON]]);
		expect((await snap(page)).stones).toEqual(['4,3']);
		await shoot(page, 'right');
		s = await snap(page);
		expect(s.bells, '石をどかしたのに鐘が鳴らない').toEqual([]);
		expect(s.openGates, '水門が戻らない').not.toContain(FERRY);
		expect(errors).toEqual([]);
	});
});
