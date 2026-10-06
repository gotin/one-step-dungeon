// tests/d5-frozen-sluice-piers.spec.js
// dungeon_5 `0,2`（鉄の盾の部屋 `0,1` の南の行き止まり）「凍れる湖の水門の足場」の番人
// （2026-10-06 / PLAN 実行キュー 40 の第2陣 2室目・盤面は `scripts/migrate-d5-0-2-frozen-sluice-piers.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 0,2` と同型＝四角い広間の真ん中に宝箱（ルピー×20）が1つあるだけ。
//
// 新しい盤面（水は bgTiles）:
//      1 #.......S..#   ← 奥のボタン (1,8)→西の足場
//      2 #..*..#..*.#   ← 石 (2,3)・(2,9)
//      3 #..S.S.....#   ← 岸のボタン (3,3)→西の足場（おとり＝湖へ降りる唯一の岸）・(3,5)→東の足場2枚
//      4 #~~~~~~~~~~#
//      5 #~~=~=~~~~~#   ← 西の足場 (5,3)・東の足場 (5,5)
//      6 #~~~~~~~~~~#
//      7 #~~~~=~~~~~#   ← 東の足場 (7,5)
//      8 #~~~~.B~~~~#   ← 南の岸 (8,5)・宝箱 (8,6)＝ルピー×20
//   干した水門は床＝はしごの橋脚になる。岸のボタンに石を乗せると西の足場は干上がるが、岸が塞がって降りられない。
//
// 守るものは2つ。
//   ① データ：盤面・水・水門と links・中身／ソルバーの厳格版と緩い版が同じ最短手数・解1本・詰まない／
//      対照（はしご・石2つ・足場3枚・奥のボタン・橋脚の規則がどれも飾りでない・おとりは解に要らない）／層の接続。
//   ② 挙動（実機）：閉じた足場へははしごを架けられない／岸のボタンを自分で踏むと西の足場が干上がるが離れると戻る／
//      岸のボタンに石を乗せると西の足場は干上がるのに湖へ降りられない／通しで石2つを送り、足場3つを渡って宝箱。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import {
	TARGET, WATER, WATER_MAP, CHEST, STONES, FAR_BUTTON, DECOY_BUTTON, EAST_BUTTON, WEST_PIER, EAST_PIERS, LINKS,
	SHORTEST, solveRoom, withCell,
} from '../scripts/migrate-d5-0-2-frozen-sluice-piers.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '0,2';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
// 実マップから水の盤面を組み直す（定数ではなく実物を測る）
const liveWaterMap = () => rowsOf(stages[ROOM]).map((row, r) =>
	[...row].map((ch, c) => (stages[ROOM].bgTiles?.[`${r},${c}`] === TILE.WATER ? '~' : ch)).join(''));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 0,2 凍れる湖の水門の足場 ① データ', () => {
	test('盤面・水は bgTiles・水門と links・宝箱（敵・植生・看板が無い）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(Object.keys(st.bgTiles).sort()).toEqual([...WATER].sort());
		expect(Object.values(st.bgTiles).every((v) => v === TILE.WATER)).toBe(true);
		expect(st.links).toEqual(LINKS);
		expect(LINKS.filter((l) => l.switchId === FAR_BUTTON).map((l) => l.gateId)).toEqual(WEST_PIER);
		expect(LINKS.filter((l) => l.switchId === DECOY_BUTTON).map((l) => l.gateId)).toEqual(WEST_PIER);
		expect(LINKS.filter((l) => l.switchId === EAST_BUTTON).map((l) => l.gateId)).toEqual(EAST_PIERS);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } });
		expect(st.floorItems ?? {}).toEqual({});
		expect(st.showConditions ?? {}).toEqual({});
		expect(Object.keys(st.signData ?? {})).toEqual([]);
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH, TILE.GATE]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test(`ソルバー：厳格版と緩い版が同じ最短手数 ${SHORTEST}・解1本・詰まない`, () => {
		const wm = liveWaterMap();
		expect(wm).toEqual(WATER_MAP);
		const m = solveRoom(wm);
		const lax = solveRoom(wm, { strict: false });
		expect(m.L, '厳格版の最短手数').toBe(SHORTEST);
		expect(m.solCount, '最短解の本数').toBe(1);
		expect(lax.L, '緩い版だけ短い＝見た目で読めない近道がある').toBe(m.L);
		expect(m.noEscape, '入って詰む状態（厳格）').toBe(0);
		expect(lax.noEscape, '入って詰む状態（緩い）').toBe(0);
	});

	test('対照：はしご・石2つ・足場3枚・奥のボタン・橋脚の規則がどれも飾りでない／おとりは解に要らない', () => {
		expect(solveRoom(WATER_MAP, { hasLadder: false, strict: false }).L, 'はしご無しで届く').toBe(null);
		expect(solveRoom(WATER_MAP, { noPush: true, strict: false }).L, '石を押さずに届く').toBe(null);
		for (const s of STONES) expect(solveRoom(withCell(s, TILE.WALL), { strict: false }).L, `石 ${s} を壁にしても届く`).toBe(null);
		for (const g of [...WEST_PIER, ...EAST_PIERS]) {
			expect(solveRoom(withCell(g, '~'), { strict: false }).L, `足場 ${g} を水にしても届く`).toBe(null);
		}
		expect(solveRoom(WATER_MAP, { strict: false, openTideBanks: false }).L, '開いた水門を橋脚に数えなくても届く').toBe(null);
		expect(solveRoom(WATER_MAP, { strict: false, links: LINKS.filter((l) => l.switchId !== FAR_BUTTON) }).L,
			'奥のボタンの連動を外しても届く＝おとりのボタンで渡れている').toBe(null);
		expect(solveRoom(WATER_MAP, { strict: false, links: LINKS.filter((l) => l.switchId !== DECOY_BUTTON) }).L,
			'おとりのボタンが解に要る').toBe(SHORTEST);
		// おとりのボタンに石を乗せたまま南の岸へ着く状態は無い（石が湖へ降りる唯一の岸を塞ぐ）
		const onDecoy = (st) => st.split('|')[0] === '8,5' && st.split('|')[1].split(';').includes(DECOY_BUTTON);
		expect(solveRoom(WATER_MAP, { strict: false, goalTest: onDecoy }).L, 'おとりに石を残したまま渡れた').toBe(null);
		// 逆向きの対照＝岸 (3,3) をボタンでなく床にすると、石を (3,3) に乗せずに東へ送る道が残るか（測定の土台が生きている）
		expect(solveRoom(withCell(DECOY_BUTTON, TILE.FLOOR), { strict: false, links: LINKS.filter((l) => l.switchId !== DECOY_BUTTON) }).L,
			'岸を床にしたら届かない＝測定が壊れている').not.toBe(null);
	});

	test('層の接続は不変', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '0,2 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
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
// 石押しは実時間のクールダウン（STONE_PUSH_COOLDOWN_MS=600）＝1押しごとに待つ。1押し＝石もプレイヤーも1マス。
async function push(page, d, times) {
	for (let i = 0; i < times; i++) {
		await page.evaluate((dir) => { window.__game.movePlayer(dir); window.__game.step(1); }, d);
		await page.waitForTimeout(650);
	}
}
const snap = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	const ss = window.__game.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		stones: Object.values(ss.stonePositions ?? {}).map((s) => `${s.r},${s.c}`).sort(),
		openGates: [...(ss.openGates ?? [])].sort(),
		opened: [...(ss.openedChests ?? [])],
	};
});
async function run(page, route) {
	for (const [kind, d, n, want] of route) {
		if (kind === 'push') await push(page, d, n); else await walk(page, d, n);
		expect((await snap(page)).pos, `${kind} ${d}×${n} の後`).toBe(want);
	}
}
// 北の口 (1,6) から石 (2,3) を岸のボタン (3,3) へ押し下げるまで
const STONE_TO_DECOY = [
	['walk', 'left', 3, '1,3'],
	['push', 'down', 1, '2,3'],                                   // 石 (2,3) → 岸のボタン (3,3)
];

test.describe('D5 0,2 凍れる湖の水門の足場 ② 実機', () => {
	test('岸のボタンを自分で踏むと西の足場が干上がるが、湖へ降りた瞬間に戻る＝足場へ渡れない（岸へは戻れる）', async ({ page }) => {
		const errors = await boot(page, 1, 6);
		await run(page, [['walk', 'left', 2, '1,4'], ['walk', 'down', 2, '3,4']]);
		await walk(page, 'down', 1);                                  // (4,4) は向こう岸 (5,4) も水＝渡れない
		expect((await snap(page)).pos, '幅2の水へ降りた').toBe('3,4');
		await run(page, [['walk', 'left', 1, DECOY_BUTTON]]);
		expect((await snap(page)).openGates, '岸のボタンを踏んでも西の足場が干上がらない').toEqual([...WEST_PIER]);
		await walk(page, 'right', 1);
		expect((await snap(page)).openGates, '離れても西の足場が干上がったまま').toEqual([]);
		// 踏んだまま真下へ＝はしごで (4,3) に乗った瞬間にボタンから離れ、西の足場 (5,3) は水へ戻る
		await run(page, [['walk', 'left', 1, DECOY_BUTTON]]);
		await walk(page, 'down', 1);
		let s = await snap(page);
		expect(s.pos, '岸のボタンから湖 (4,3) へはしごを架けられない＝足踏みの足場が見えているのに').toBe('4,3');
		expect(s.openGates, 'ボタンを離れても西の足場が干上がったまま').toEqual([]);
		await walk(page, 'down', 2);
		expect((await snap(page)).pos, '戻った足場の上へ渡れた').toBe('4,3');
		await walk(page, 'up', 1);
		s = await snap(page);
		expect(s.pos, '湖の上から岸へ戻れない＝はしごの上で詰む').toBe(DECOY_BUTTON);
		expect(errors).toEqual([]);
	});

	test('岸のボタンに石を乗せると西の足場は干上がるのに、湖へ降りる岸が塞がる（おとり）', async ({ page }) => {
		const errors = await boot(page, 1, 6);
		await run(page, STONE_TO_DECOY);
		let s = await snap(page);
		expect(s.stones, '石が岸のボタンに乗っていない').toContain(DECOY_BUTTON);
		expect(s.openGates, '西の足場が干上がらない').toEqual([...WEST_PIER]);
		// 岸 (3,3) の両脇から湖へ降りようとしても、真下の水の向こうは水＝はしごが架からない
		await run(page, [['walk', 'left', 1, '2,2'], ['walk', 'down', 1, '3,2']]);
		await walk(page, 'down', 1);
		expect((await snap(page)).pos, '(3,2) から湖へ降りた').toBe('3,2');
		// 干上がった西の足場 (5,3) へ届く岸は (3,3) だけ＝石が乗っている
		s = await snap(page);
		expect(s.openGates).toEqual([...WEST_PIER]);
		expect(s.stones).toContain(DECOY_BUTTON);
		expect(errors).toEqual([]);
	});

	test('通し：石を奥のボタンと東のボタンへ送り、足場3つを渡って宝箱を開ける', async ({ page }) => {
		const errors = await boot(page, 1, 6);
		await run(page, [
			['walk', 'right', 4, '1,10'], ['walk', 'down', 1, '2,10'],
			['push', 'left', 1, '2,9'],                                 // 石 (2,9) → (2,8)
			['walk', 'down', 1, '3,9'], ['walk', 'left', 1, '3,8'],
			['push', 'up', 1, '2,8'],                                   // 石 → 奥のボタン (1,8)
		]);
		let s = await snap(page);
		expect(s.stones, '石が奥のボタンに乗っていない').toContain(FAR_BUTTON);
		expect(s.openGates, '西の足場が干上がらない').toEqual([...WEST_PIER]);
		await run(page, [
			['walk', 'left', 1, '2,7'], ['walk', 'up', 1, '1,7'], ['walk', 'left', 4, '1,3'],
			['push', 'down', 1, '2,3'],                                 // 石 (2,3) → 岸のボタン (3,3)
			['walk', 'left', 1, '2,2'], ['walk', 'down', 1, '3,2'],
			['push', 'right', 2, '3,4'],                                // 石 → 東のボタン (3,5)
		]);
		s = await snap(page);
		expect(s.stones, '石が奥と東のボタンに乗っていない').toEqual([FAR_BUTTON, EAST_BUTTON].sort());
		expect(s.openGates, '足場3枚が干上がらない').toEqual([...WEST_PIER, ...EAST_PIERS].sort());
		await run(page, [
			['walk', 'left', 1, '3,3'],
			['walk', 'down', 2, '5,3'],                                 // はしごで (4,3) を渡って西の足場へ
			['walk', 'right', 2, '5,5'],                                // はしごで (5,4) を渡って東の足場へ
			['walk', 'down', 3, '8,5'],                                 // はしごで (6,5) → 東の足場 (7,5) → 南の岸
		]);
		await walk(page, 'right', 1);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toContain(CHEST);
		expect(errors).toEqual([]);
	});
});
