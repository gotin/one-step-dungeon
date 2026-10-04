// tests/d7-sky-stone-ferry.spec.js
// dungeon_7 `1,4`「空の石運び」の番人
// （2026-10-04 / PLAN 実行キュー 39 の第2陣 3室目・盤面は `scripts/migrate-d7-1-4-sky-stone-ferry.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_6 1,4` と同型＝四角い広間に宝箱（回復薬・素で開く）が1つあるだけ。
//
// 新しい盤面（床の南と北が空へ崩れた広間に、石2つとボタン2つ）:
//      1 #BT..%S%%%%#   ← 宝箱 (1,1)＝回復薬（大）・門 T (1,2)・北の小島のボタン (1,6)
//      2 #%%%.x.%%%%#   ← 穴 (2,5)＝人だけが小島から宝箱の側へ渡れる
//      3 #%%%%%.%%%%#   ← 小島へ上がる1マス幅の土手 (3,6)
//      4 #S......%%..   ← 西の端のボタン (4,1)
//      5 #.x.........   ← 穴 (5,2)＝人は渡れるが石は通れない
//      6 #*...*...%%#   ← 石 (6,1)・(6,5)
//      7 #...%%%%%%%#   ← 南西の張り出し
//   石は穴にも空にも入れない／人ははしごで穴を1マス渡れる＝穴は「人の通り道・石の壁」。
//
// 守るものは2つ。
//   ① データ：盤面・中身／ソルバーの厳格版と緩い版が同じ最短手数（実機の細部＝穴の上から押す・
//      石を橋脚にする・はしごの途中で曲がる、に解き方が頼らない）・詰まない／対照（はしご・石・穴が飾りでない）
//      ／層の到達性は不変。
//   ② 挙動（実機）：石は穴へ押し込めない／通しで石2つをボタンへ運び、穴を渡って宝箱を開ける。
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
const ROOM = '1,4';
const stages = map.layers[LAYER].stages;

const ROOM_ROWS = [
	'############',
	'#BT..%S%%%%#',
	'#%%%.x.%%%%#',
	'#%%%%%.%%%%#',
	'#S......%%..',
	'#.x.........',
	'#*...*...%%#',
	'#...%%%%%%%#',
	'#%%%%%%%%%%#',
	'############',
];
const CHEST = '1,1';
const GATE = '1,2';
const EXITS = ['4,11', '5,11'];
const SHORTEST = 35;

const P = (k) => k.split(',').map(Number);
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const nextTo = (k) => { const [r, c] = P(k); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };

// 厳格版＝見た目で読めない3つの手を後継から除く（移行スクリプトの strictify と同じ規則）。
function strictify(S, tiles) {
	const isPit = (r, c) => tiles[r]?.[c] === TILE.PIT;
	const land = (r, c) => tiles[r]?.[c] !== undefined && !isPit(r, c) && tiles[r][c] !== TILE.WALL && tiles[r][c] !== TILE.SKY;
	const orig = S.nextStates;
	return {
		...S,
		nextStates(state) {
			const [pos, stonesStr] = state.split('|');
			const [pr, pc] = P(pos);
			return orig(state).filter((nx) => {
				const [npos, nstones] = nx.split('|');
				const [nr, nc] = P(npos);
				const moved = nr !== pr || nc !== pc;
				if (nstones !== stonesStr && isPit(pr, pc)) return false;
				if (isPit(pr, pc) && moved) {
					const ok = nr !== pr ? land(pr - 1, pc) && land(pr + 1, pc) : land(pr, pc - 1) && land(pr, pc + 1);
					if (!ok) return false;
				}
				if (isPit(nr, nc) && moved) {
					const stones = nstones ? nstones.split(';') : [];
					const banks = nr !== pr ? [[nr - 1, nc], [nr + 1, nc]] : [[nr, nc - 1], [nr, nc + 1]];
					if (banks.some(([r, c]) => stones.includes(`${r},${c}`))) return false;
				}
				return true;
			});
		},
	};
}
function solve(t, { strict = true, ...opts } = {}) {
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	let chest = null;
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === TILE.CHEST) chest = `${r},${c}`;
	const goals = new Set(nextTo(chest));
	const S0 = makeSolver(t, bg, [], {}, new Set(), { hasLadder: true, pitCrossable: true, ...opts });
	const S = strict ? strictify(S0, t) : S0;
	const starts = EXITS.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	return measureMetrics(S, starts, (st) => goals.has(st.split('|')[0]), () => 0,
		{ guardMax: 2_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
}
// 盤面から拾う（定数ではなく実物を見る＝D7 二色回廊の番人で踏んだ罠）
const cellsOf = (t, ch) => {
	const out = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === ch) out.push(`${r},${c}`);
	return out;
};

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D7 1,4 空の石運び ① データ', () => {
	test('盤面・宝箱（敵・植生・看板が無い・門はボタンの全押しで開く）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(ROOM_ROWS);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } });
		expect(st.showConditions ?? {}, '宝箱は封印しない（門が関門）').toEqual({});
		expect(st.links ?? [], 'links は空（T はボタンの全押しで開く）').toEqual([]);
		expect(Object.keys(st.signData ?? {}), '看板データは空').toEqual([]);
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test(`ソルバー：厳格版と緩い版が同じ最短手数 ${SHORTEST}・詰まない`, () => {
		const t = gridOf();
		const m = solve(t);
		const lax = solve(t, { strict: false });
		expect(m.L, '厳格版の最短手数').toBe(SHORTEST);
		expect(lax.L, '緩い版だけ短い＝見た目で読めない近道がある').toBe(m.L);
		expect(m.noEscape, '入って詰む状態（厳格）').toBe(0);
		expect(lax.noEscape, '入って詰む状態（緩い）').toBe(0);
	});

	test('対照：はしご・石2つ・穴2つがどれも飾りでない（測定が空虚でない）', () => {
		const t = gridOf();
		expect(solve(t, { hasLadder: false, strict: false }).L, 'はしご無しで届く').toBe(null);
		expect(solve(t, { noPush: true, strict: false }).L, '石を押さずに届く').toBe(null);
		const stones = cellsOf(t, TILE.STONE);
		expect(stones.length, '石の数').toBe(2);
		for (const s of stones) {
			const g = gridOf(); const [r, c] = P(s); g[r][c] = TILE.WALL;
			expect(solve(g, { strict: false }).L, `石 ${s} を壁にしても届く`).toBe(null);
		}
		const pits = cellsOf(t, TILE.PIT);
		expect(pits.sort(), '穴の位置').toEqual(['2,5', '5,2']);
		const fill = gridOf(); fill[5][2] = TILE.FLOOR;
		expect(solve(fill).L, '穴 (5,2) を床にしても手数が減らない＝石の壁として効いていない').toBeLessThan(SHORTEST);
		const sky = gridOf(); sky[2][5] = TILE.SKY;
		expect(solve(sky, { strict: false }).L, '穴 (2,5) を空にしても届く').toBe(null);
	});

	test('層の接続は不変', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '1,4 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_ladder: '1', ...extra });
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
		openGates: [...(ss.openGates ?? [])],
		locked: !!ss.stonesLocked,
		opened: [...(ss.openedChests ?? [])],
	};
});

test.describe('D7 1,4 空の石運び ② 実機', () => {
	test('石は穴へ押し込めない（穴 (5,2) の真下から押しても石は動かない）', async ({ page }) => {
		const errors = await boot(page, 6, 6);
		await push(page, 'left', 3);                       // 石 (6,5) を西の溝 (6,2) へ
		expect((await snap(page)).pos).toBe('6,3');
		await walk(page, 'down', 1); await walk(page, 'left', 1);
		expect((await snap(page)).pos, '張り出しに立てない').toBe('7,2');
		await push(page, 'up', 1);
		const s = await snap(page);
		expect(s.pos, '石を穴へ押し込んで前へ出た').toBe('7,2');
		expect(s.stones, '石が穴へ入った').toContain('6,2');
		expect(errors).toEqual([]);
	});

	test('通し：石2つをボタンへ運び、門が開いたまま穴 (2,5) を渡って宝箱を開ける', async ({ page }) => {
		const errors = await boot(page, 4, 10);
		const route = [
			['walk', 'down', 1, '5,10'], ['walk', 'left', 2, '5,8'], ['walk', 'down', 1, '6,8'], ['walk', 'left', 2, '6,6'],
			['push', 'left', 3, '6,3'],                                   // 石 B を西の溝へ
			['walk', 'down', 1, '7,3'], ['walk', 'left', 2, '7,1'],
			['push', 'up', 2, '5,1'],                                     // 石 A を西のボタン (4,1) へ
			['walk', 'down', 1, '6,1'], ['push', 'right', 1, '6,2'],      // 石 B を張り出しの上へ戻す
			['walk', 'down', 1, '7,2'], ['walk', 'right', 1, '7,3'],
			['push', 'up', 2, '5,3'],                                     // 石 B を行4 へ押し上げる
			['walk', 'down', 1, '6,3'], ['walk', 'left', 1, '6,2'],
			['walk', 'up', 2, '4,2'],                                     // はしごで穴 (5,2) を縦に渡って石 B の西へ
			['push', 'right', 3, '4,5'],                                  // 行4 を東へ
			['walk', 'down', 1, '5,5'], ['walk', 'right', 1, '5,6'],
			['push', 'up', 3, '2,6'],                                     // 土手を北へ＝小島のボタン (1,6) へ
		];
		for (const [kind, d, n, want] of route) {
			if (kind === 'push') await push(page, d, n); else await walk(page, d, n);
			expect((await snap(page)).pos, `${kind} ${d}×${n} の後`).toBe(want);
		}
		let s = await snap(page);
		expect(s.stones, '石が2つともボタンに乗っていない').toEqual(['1,6', '4,1']);
		expect(s.openGates, '門が開かない').toContain(GATE);
		expect(s.locked, '石ロックが立たない＝ボタンを離れると門が閉じる').toBe(true);

		await walk(page, 'left', 2);                               // はしごで穴 (2,5) を渡る
		expect((await snap(page)).pos, '穴 (2,5) を渡れない').toBe('2,4');
		await walk(page, 'up', 1);
		await walk(page, 'left', 3);
		s = await snap(page);
		expect(s.pos, '宝箱まで歩けない').toBe(CHEST);
		expect(s.opened, '宝箱が開かない').toContain(CHEST);
		expect(errors).toEqual([]);
	});
});
