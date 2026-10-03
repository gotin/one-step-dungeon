// tests/d7-sky-bells.spec.js
// dungeon_7 `0,3`「空の二色回廊」の番人
// （2026-10-03 / PLAN 実行キュー 39 の第2陣 2室目・盤面は `scripts/migrate-d7-0-3-sky-bells.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_6 0,3` と同型＝四角い広間に、拾えない床の落とし物 `{type:'rupee',count:5}` があるだけ。
//
// 新しい盤面（広間の真ん中が空に抜け、縁の回廊を色の門3枚が区切る）:
//      1 #B......(..#   ← 宝箱 (1,1)＝ルピー×30・赤門 (1,8)
//      2 #..%%%%%%..#
//      3 #.%%%%%%%%.#
//      4 #(%%%%%%%%..   ← 赤門 (4,1)・東の口
//      5 #.%%[%%#%%..   ← 赤の座 (5,4)・柱 (5,7)＝入口から赤への射線を遮る
//      6 #.%%#%]%%%.#   ← 青の座 (6,6)・柱 (6,4)＝南の回廊から赤への射線を遮る
//      7 #..%%%%%%..#
//      8 #........).#   ← 青門 (8,9)
//   入口から射れるのは青だけ → 青門を抜けて西の回廊 (5,1) から赤を射る → 赤門を抜けて宝箱。
//
// 守るものは2つ。
//   ① データ：座は剣で叩けない／赤と青の座は同じ行・列に無い／入口側から赤は射れない（柱のおとり・対照つき）／
//      ソルバーで解ける・詰み 0・剣だけでは解けない・どちらの座を潰しても解けない／層の到達性は不変。
//   ② 挙動（実機）：入口の行5 から西へ射ても赤は鳴らない／青の前は青門を抜けられない／
//      青→回り込んで赤→宝箱でルピー +30、北の回廊から入口へ戻れる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { makeSolver } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '0,3';
const stages = map.layers[LAYER].stages;
const ROWS = 10, COLS = 12;

const ROOM_ROWS = [
	'############',
	'#B......(..#',
	'#..%%%%%%..#',
	'#.%%%%%%%%.#',
	'#(%%%%%%%%..',
	'#.%%[%%#%%..',
	'#.%%#%]%%%.#',
	'#..%%%%%%..#',
	'#........).#',
	'############',
];
const CHEST = '1,1';
const RED_SEAT = '5,4', BLUE_SEAT = '6,6';
const EXITS = ['4,11', '5,11'];

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const cellOf = (k) => k.split(',').map(Number);
const cellsOf = (t, ch) => t.flatMap((row, r) => row.flatMap((x, c) => (x === ch ? [`${r},${c}`] : []))).sort();
const nextTo = (k) => { const [r, c] = cellOf(k); return [`${r - 1},${c}`, `${r + 1},${c}`, `${r},${c - 1}`, `${r},${c + 1}`]; };
// 東の口から歩いて立てるセル（色ゲートは openColors に入れた色だけ通す）。
function walkable(t, openColors = []) {
	const ok = (r, c) => {
		const ch = t[r][c];
		if (ch === TILE.GATE_RED) return openColors.includes('red');
		if (ch === TILE.GATE_BLUE) return openColors.includes('blue');
		return !HARD_BLOCKED.has(ch);
	};
	const seen = new Set(EXITS), q = EXITS.map(cellOf);
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
// cell を直線で射抜ける立ち位置（壁と未破壊の '!' で止まる＝投擲物は空も門も越える）。
function shootersOf(t, walk, cell) {
	const [r0, c0] = cellOf(cell), out = [];
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
	const starts = EXITS.map((k) => { const [r, c] = cellOf(k); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	const goals = new Set(nextTo(CHEST));
	return measureMetrics(S, starts, (st) => goals.has(st.split('|')[0]), () => 0,
		{ guardMax: 2_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
}

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D7 0,3 空の二色回廊 ① データ', () => {
	test('盤面・宝箱・座と門（敵・植生・看板・T 門・Y 座・死んだ落とし物が無い）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(ROOM_ROWS);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } });
		expect(st.floorItems ?? {}, '拾えない床の落とし物が残っている').toEqual({});
		expect(st.showConditions ?? {}).toEqual({});
		expect(st.links ?? []).toEqual([]);
		expect(Object.keys(st.signData ?? {})).toEqual([]);
		// 笛の石戻しは色も null に戻す＝色門の奥で吹くと閉じ込められる（持たせない）
		expect(st.fluteEffect ?? null).toBeNull();
		expect(st.initActiveColor ?? null).toBeNull();
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.STONE, TILE.SIGN, TILE.GATE, TILE.SWITCH, TILE.BUTTON]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test('座は空に浮く（剣で叩けない）・赤と青の座は同じ行・列に無い', () => {
		const t = gridOf();
		const all = walkable(t, ['red', 'blue']);
		// 定数でなく盤面上の実際の座を見る（座を動かした盤面でも検査が空振りしない）
		const reds = cellsOf(t, TILE.SWITCH_RED), blues = cellsOf(t, TILE.SWITCH_BLUE);
		for (const seat of [...reds, ...blues]) {
			expect(nextTo(seat).filter((k) => all.has(k)), `座 ${seat} の隣に立てる`).toEqual([]);
		}
		// 剣ビームは座を貫く＝同じ線に2つ並ぶと1発で両方の色を通り抜ける
		for (const rb of reds) for (const bb of blues) {
			const [rr, rc] = cellOf(rb), [br, bc] = cellOf(bb);
			expect(rr !== br && rc !== bc, `赤 ${rb} と青 ${bb} の座が同じ行か列にある`).toBe(true);
		}
		expect(reds, '赤の座').toEqual([RED_SEAT]);
		expect(blues, '青の座').toEqual([BLUE_SEAT]);
	});

	test('入口側から射れるのは青だけ（赤は柱のおとり）・西の回廊からなら赤を射れる', () => {
		const t = gridOf();
		const closed = walkable(t);
		expect(nextTo(CHEST).filter((k) => closed.has(k)), '門を閉じたまま宝箱に届く').toEqual([]);
		expect(shootersOf(t, closed, RED_SEAT), '入口側から赤を射れる＝回り込みが要らない').toEqual([]);
		expect(shootersOf(t, closed, BLUE_SEAT), '入口側から青を射れない＝最初の一手が無い').toContain('6,10');
		expect(shootersOf(t, walkable(t, ['blue']), RED_SEAT), '青門の内側から赤を射れない').toContain('5,1');
		// 対照：柱 (5,7) を空にすると入口の行5 から赤が見える（射線の判定が空虚でない）
		const open = gridOf(); open[5][7] = TILE.SKY;
		expect(shootersOf(open, walkable(open), RED_SEAT), '対照：柱を消しても入口から赤が見えない').not.toEqual([]);
	});

	test('ソルバー（実ゲームと同じ遷移）＝解ける・詰み 0・剣だけでは解けない・どちらの座も要る', () => {
		const m = solve(gridOf());
		expect(m.L, '解けない').not.toBeNull();
		expect(m.noEscape, '東の口へ戻れない状態がある＝色門の中で詰む').toBe(0);
		expect(solve(gridOf(), { noTools: true }).L, '剣で隣を叩くだけで解ける').toBeNull();
		for (const seat of [RED_SEAT, BLUE_SEAT]) {
			const k = gridOf(); const [r, c] = cellOf(seat); k[r][c] = TILE.WALL;
			expect(solve(k).L, `対照：座 ${seat} を壁にしても解ける＝座が飾り`).toBeNull();
		}
	});

	test('層の接続は不変', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '0,3 に届かない').toBe(true);
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
const pos = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`;
});
const ss = (page) => page.evaluate(() => window.__game.getStageState());
const color = async (page) => (await ss(page)).activeColor ?? null;
const rupees = (page) => page.evaluate(() => window.__game.getPlayer().rupees);
const shoot = async (page, dir) => {
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	await step(page, 1);
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bow'; });
	await page.evaluate(() => window.__game.useSubItem());
	await step(page, 40);
};

test.describe('D7 0,3 空の二色回廊 ② 実機', () => {
	test('入口の行5 から西へ射ても赤は鳴らない（柱が遮る）／色が未設定のまま青門は抜けられない', async ({ page }) => {
		const errors = await boot(page, 5, 10);
		await shoot(page, 'left');
		expect(await color(page), '柱を越えて赤の座が鳴った').toBeNull();
		await walk(page, 'down', 3);
		expect(await pos(page)).toBe('8,10');
		await walk(page, 'left', 2);
		expect(await pos(page), '色が未設定なのに青門 (8,9) を抜けた').toBe('8,10');
		expect(errors).toEqual([]);
	});

	test('通し：青を射る→南を回って西の回廊から赤を射る→宝箱でルピー +30→北の回廊から入口へ戻る', async ({ page }) => {
		const errors = await boot(page, 6, 10);
		await shoot(page, 'left');
		expect(await color(page), '入口の行6 から青の座が鳴らない').toBe('blue');

		const route1 = [['down', 2, '8,10'], ['left', 9, '8,1'], ['up', 3, '5,1']];
		for (const [d, n, want] of route1) {
			await walk(page, d, n);
			expect(await pos(page), `${d}×${n} の後`).toBe(want);
		}
		await shoot(page, 'right');
		expect(await color(page), '西の回廊から赤の座が鳴らない').toBe('red');

		const r0 = await rupees(page);
		await walk(page, 'up', 4);
		expect(await pos(page), '赤門 (4,1) を抜けて宝箱へ届かない').toBe(CHEST);
		expect((await ss(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await rupees(page), 'ルピーが 30 増えない').toBe(r0 + 30);

		// 帰り道：北の回廊の赤門 (1,8) を抜けて入口の東の口の手前へ
		for (const [d, n, want] of [['right', 9, '1,10'], ['down', 3, '4,10']]) {
			await walk(page, d, n);
			expect(await pos(page), `帰り道 ${d}×${n} の後`).toBe(want);
		}
		expect(errors).toEqual([]);
	});
});
