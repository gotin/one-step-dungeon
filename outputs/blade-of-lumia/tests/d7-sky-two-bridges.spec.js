// tests/d7-sky-two-bridges.spec.js
// dungeon_7 `4,4`「空の二つの渡り」の番人
// （2026-10-04 / PLAN 実行キュー 39 の第2陣 4室目・盤面は `scripts/migrate-d7-4-4-sky-two-bridges.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_6 4,4` と同型＝四角い広間に宝箱（ルピー×5）と森の木・茂みが残っているだけ。
//
// 新しい盤面（中央を空の谷が南北に走り、渡りは北＝赤門・南＝青門の2本）:
//      1 #....%%%.TB#   ← 門 T (1,9)・宝箱 (1,10)＝ルピー×50
//      2 #..*%%%%.%%#   ← 石 (2,3)／東岸の北の袋 (1,8)〜(2,8)
//      3 #.....(....#   ← 北の渡り（赤門 (3,6)）
//      4 .....%%%...#
//      5 .....)..S..#   ← 南の渡り（青門 (5,5)）・ボタン (5,8)
//      6 #..%%%%%...#
//      7 #%%%%[%%...#   ← 赤の座 (7,5)
//      8 #%%%%%]%...#   ← 青の座 (8,6)＝東岸からしか鳴らせない
//   石は北の渡りでは運べない（東岸で北の袋を塞ぐ）∴先に人だけ赤で渡り、南の渡りから青を射て、戻って石を南の渡りで運ぶ。
//
// 守るものは2つ。
//   ① データ：座は剣で叩けない（赤）／赤と青の座は同じ行・列に無い／西岸から青は射れない／
//      ソルバーで 45 手・詰み 0・道具封じ・石を押さない・座を潰す・南の渡りを潰す→解けない／
//      門を床にすると手数が減る／層の到達性は不変。
//   ② 挙動（実機）：赤門の中から青を射ても不発／通しで石をボタンへ運び、門 T を抜けて宝箱でルピー +50。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '4,4';
const stages = map.layers[LAYER].stages;

const ROOM_ROWS = [
	'############',
	'#....%%%.TB#',
	'#..*%%%%.%%#',
	'#.....(....#',
	'.....%%%...#',
	'.....)..S..#',
	'#..%%%%%...#',
	'#%%%%[%%...#',
	'#%%%%%]%...#',
	'############',
];
const CHEST = '1,10';
const GATE = '1,9';
const EXITS = ['4,0', '5,0'];
const SHORTEST = 45;

const P = (k) => k.split(',').map(Number);
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const nextTo = (k) => { const [r, c] = P(k); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };
// 盤面から拾う（定数ではなく実物を見る＝D7 二色回廊の番人で踏んだ罠）
const cellsOf = (t, ch) => {
	const out = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === ch) out.push(`${r},${c}`);
	return out;
};
// 西の口から歩いて立てるセル（石は壁・色の門は openColors の色だけ通す）。
function walkable(t, openColors = []) {
	const ok = (k) => {
		const ch = t[P(k)[0]]?.[P(k)[1]];
		if (ch === TILE.GATE_RED) return openColors.includes('red');
		if (ch === TILE.GATE_BLUE) return openColors.includes('blue');
		return ch === TILE.FLOOR || ch === TILE.BUTTON;
	};
	const seen = new Set(EXITS), q = [...EXITS];
	while (q.length) for (const n of nextTo(q.shift())) if (!seen.has(n) && ok(n)) { seen.add(n); q.push(n); }
	return seen;
}
// cell を直線で射抜ける立ち位置（壁と未破壊の '!' で止まる＝投擲物は空も門も越える）。
function shootersOf(t, walk, cell) {
	const [r0, c0] = P(cell), out = [];
	for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
		for (let r = r0 + dr, c = c0 + dc; r >= 0 && r < ROWS && c >= 0 && c < COLS; r += dr, c += dc) {
			if (t[r][c] === TILE.WALL || t[r][c] === TILE.BREAKABLE_WALL) break;
			if (walk.has(`${r},${c}`)) out.push(`${r},${c}`);
		}
	}
	return out.sort();
}
function solve(t, opts = {}) {
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const S = makeSolver(t, bg, [], {}, new Set(), { hasLadder: true, pitCrossable: true, ...opts });
	const starts = EXITS.map((k) => { const [r, c] = P(k); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	const goals = new Set(nextTo(CHEST));
	return measureMetrics(S, starts, (st) => goals.has(st.split('|')[0]), () => 0,
		{ guardMax: 2_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
}

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D7 4,4 空の二つの渡り ① データ', () => {
	test('盤面・宝箱（敵・植生・看板が無い・門 T はボタンで開く）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(ROOM_ROWS);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 50, name: 'ルピー×50' } });
		expect(st.floorItems ?? {}).toEqual({});
		expect(st.showConditions ?? {}, '宝箱は封印しない（門 T が関門）').toEqual({});
		expect(st.links ?? [], 'links は空（T はボタンで開く）').toEqual([]);
		expect(Object.keys(st.signData ?? {})).toEqual([]);
		// 笛の石戻しは色も null に戻す＝持たせない
		expect(st.fluteEffect ?? null).toBeNull();
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH, TILE.PIT]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test('座：赤は剣で叩けない・赤と青は同じ行・列に無い・西岸から青は射れない（東岸から射る）', () => {
		const t = gridOf();
		const reds = cellsOf(t, TILE.SWITCH_RED), blues = cellsOf(t, TILE.SWITCH_BLUE);
		expect(reds.length, '赤の座').toBe(1);
		expect(blues.length, '青の座').toBe(1);
		const [red] = reds, [blue] = blues;
		const all = walkable(t, ['red', 'blue']);
		expect(nextTo(red).filter((k) => all.has(k)), `赤の座 ${red} の隣に立てる`).toEqual([]);
		const [rr, rc] = P(red), [br, bc] = P(blue);
		expect(rr !== br && rc !== bc, '赤と青の座が同じ行か列にある（剣ビームが両方を通り抜ける）').toBe(true);

		const west = walkable(t);
		expect(nextTo(CHEST).filter((k) => west.has(k)), '門を閉じたまま宝箱に届く').toEqual([]);
		expect(shootersOf(t, west, red), '西岸から赤を射れない＝最初の一手が無い').not.toEqual([]);
		expect(shootersOf(t, west, blue), '西岸から青を射れる＝向こう岸へ渡る必要が無い').toEqual([]);
		expect(nextTo(blue).filter((k) => west.has(k)), '西岸から青の座を剣で叩ける').toEqual([]);
		const eastSide = walkable(t, ['red']);
		expect(shootersOf(t, eastSide, blue), '赤で渡った先（南の渡りの東半分）から青を射れない').toContain('5,6');
	});

	test(`ソルバー（実ゲームと同じ遷移）＝最短 ${SHORTEST} 手・詰み 0・対照`, () => {
		const t = gridOf();
		const m = solve(t);
		expect(m.L, '最短手数').toBe(SHORTEST);
		expect(m.noEscape, '西の口へ戻れない状態がある＝色の門の向こうで詰む').toBe(0);
		expect(solve(t, { noTools: true }).L, '剣で隣を叩くだけで解ける').toBeNull();
		expect(solve(t, { noPush: true }).L, '石を押さずに届く').toBeNull();
		for (const ch of [TILE.SWITCH_RED, TILE.SWITCH_BLUE]) {
			const g = gridOf(); const [r, c] = P(cellsOf(g, ch)[0]); g[r][c] = TILE.WALL;
			expect(solve(g).L, `対照：座 '${ch}' を壁にしても解ける＝座が飾り`).toBeNull();
		}
		// 北の渡り（赤）だけでは石を運べない＝南の渡りを潰すと解けない
		const noSouth = gridOf(); { const [r, c] = P(cellsOf(noSouth, TILE.GATE_BLUE)[0]); noSouth[r][c] = TILE.WALL; }
		expect(solve(noSouth).L, '南の渡りを潰しても解ける＝北の渡りで石を運べてしまう').toBeNull();
		for (const ch of [TILE.GATE_RED, TILE.GATE_BLUE]) {
			const g = gridOf(); const [r, c] = P(cellsOf(g, ch)[0]); g[r][c] = TILE.FLOOR;
			const l = solve(g).L;
			expect(l !== null && l < m.L, `門 '${ch}' を床にしても手数が減らない（実測 ${l}）＝門が飾り`).toBe(true);
		}
	});

	test('層の接続は不変', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '4,4 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_bow: '1', ...extra });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
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
const shoot = async (page, dir) => {
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	await step(page, 1);
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bow'; });
	await page.evaluate(() => window.__game.useSubItem());
	await step(page, 40);
};
const snap = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	const ss = window.__game.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		color: ss.activeColor ?? null,
		stones: Object.values(ss.stonePositions ?? {}).map((s) => `${s.r},${s.c}`).sort(),
		openGates: [...(ss.openGates ?? [])],
		locked: !!ss.stonesLocked,
		opened: [...(ss.openedChests ?? [])],
		rupees: p.rupees,
	};
});

test.describe('D7 4,4 空の二つの渡り ② 実機', () => {
	test('赤門の中 (3,6) から青の座を射ても不発（閉じる側の門に立っている）／一歩手前なら赤は鳴る', async ({ page }) => {
		const errors = await boot(page, 3, 5);
		await shoot(page, 'down');
		expect((await snap(page)).color, '北の渡りの西半分 (3,5) から赤の座が鳴らない').toBe('red');
		await walk(page, 'right', 1);
		expect((await snap(page)).pos, '赤門 (3,6) に乗れない').toBe('3,6');
		await shoot(page, 'down');
		expect((await snap(page)).color, '赤門の中から青に切り替わった＝自分を門に埋められる').toBe('red');
		expect(errors).toEqual([]);
	});

	test('通し：石を下ろす→赤で渡って南の渡りから青→戻って石を南の渡りでボタンへ→赤で渡って宝箱 +50', async ({ page }) => {
		const errors = await boot(page, 4, 1);
		const r0 = (await snap(page)).rupees;
		const leg = async (route) => {
			for (const [kind, d, n, want] of route) {
				if (kind === 'push') await push(page, d, n); else await walk(page, d, n);
				expect((await snap(page)).pos, `${kind} ${d}×${n} の後`).toBe(want);
			}
		};
		await leg([['walk', 'up', 3, '1,1'], ['walk', 'right', 2, '1,3'], ['push', 'down', 3, '4,3'],
			['walk', 'up', 1, '3,3'], ['walk', 'right', 2, '3,5']]);
		expect((await snap(page)).stones, '石が (5,3) へ下りない').toEqual(['5,3']);
		await shoot(page, 'down');
		expect((await snap(page)).color).toBe('red');

		await leg([['walk', 'right', 3, '3,8'], ['walk', 'down', 2, '5,8'], ['walk', 'left', 2, '5,6']]);
		await shoot(page, 'down');
		expect((await snap(page)).color, '南の渡りの東半分 (5,6) から青の座が鳴らない').toBe('blue');

		await leg([['walk', 'left', 2, '5,4'], ['walk', 'up', 1, '4,4'], ['walk', 'left', 2, '4,2'], ['walk', 'down', 1, '5,2'],
			['push', 'right', 5, '5,7']]);
		let s = await snap(page);
		expect(s.stones, '石がボタン (5,8) に乗らない').toEqual(['5,8']);
		expect(s.openGates, '門 T が開かない').toContain(GATE);
		expect(s.locked, '石ロックが立たない').toBe(true);

		await leg([['walk', 'left', 3, '5,4'], ['walk', 'up', 2, '3,4'], ['walk', 'right', 1, '3,5']]);
		await shoot(page, 'down');
		expect((await snap(page)).color).toBe('red');
		await leg([['walk', 'right', 3, '3,8'], ['walk', 'up', 2, '1,8'], ['walk', 'right', 2, CHEST]]);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toContain(CHEST);
		expect(s.rupees, 'ルピーが 50 増えない').toBe(r0 + 50);
		expect(errors).toEqual([]);
	});
});
