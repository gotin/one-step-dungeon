// tests/d6-sacred-fire-relay.spec.js
// dungeon_6 `1,1`（鍵の部屋 `1,0` へのワープを出す関門）「聖樹の火の継ぎ渡し」の番人
// （2026-10-12 / PLAN 実行キュー 47 の第2陣 1室目・盤面は `scripts/migrate-d6-1-1-sacred-fire-relay.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   D4 `1,1` の写し＝床の上のかがり火3本をロウソクで歩いて灯すだけ。
//
// 新しい盤面（木立ちの中にかがり火4本を「+」の形に並べる）:
//      2 #.HtHt.....#   ← 聖樹の火 F(2,2)＝初めから点いている・A(2,4)
//      4 ...tHtHt.>..   ← B(4,4)・C(4,6)・ワープ (4,9)
//   A・B・C は四方が木＝ロウソクでは点かない。同じ直線に並ぶのは F–A・A–B・B–C だけ
//   ∴ブーメランで 行2 → 列4 → 行4 の順に火を継ぐ（3投）。
//
// 守るものは2つ。
//   ① データ：盤面・火元・据え置きのワープ／条件／書き置き・ロウソク封じ・直線の鎖・ソルバー・層の接続。
//   ② 挙動（実機）：木のブーメランで3投すると A→B→C の順に点いてワープが出る／順を飛ばした投げでは点かない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_6';
const ROOM = '1,1';
const stages = map.layers[LAYER].stages;

const TARGET = [
	'############',
	'#.tttt.....#',
	'#.HtHt.....#',
	'#..tttt..i.#',
	'...tHtHt.>..',
	'....ttt.....',
	'#..........#',
	'#..........#',
	'#i.........#',
	'#####..#####',
];
const FIRE = '2,2', A = '2,4', B = '4,4', C = '4,6';
const WARP = '4,9';
const OPENINGS = ['4,0', '5,0', '4,11', '5,11', '9,5', '9,6'];

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
// 検査は実マップの盤面で行う（定数 TARGET で測ると、データを壊しても盤面の一致検査1本しか赤くならない）
const LIVE = () => rowsOf(stages[ROOM]);
const nbrs = (k) => {
	const [r, c] = k.split(',').map(Number);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
		.filter(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS).map(([rr, cc]) => `${rr},${cc}`);
};
function walkable(t) {
	const ok = (k) => { const [r, c] = k.split(',').map(Number); const ch = t[r]?.[c]; return ch !== undefined && !HARD_BLOCKED.has(ch) && ch !== TILE.TORCH; };
	const seen = new Set(OPENINGS.filter(ok)), q = [...seen];
	while (q.length) for (const n of nbrs(q.shift())) if (!seen.has(n) && ok(n)) { seen.add(n); q.push(n); }
	return seen;
}
// 同じ行・列に並び、間に壁（ブーメランを止めるタイル）が無いかがり火の組
function relayEdges(t) {
	const torches = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === TILE.TORCH) torches.push([r, c]);
	const out = [];
	for (let i = 0; i < torches.length; i++) for (let j = i + 1; j < torches.length; j++) {
		const [r1, c1] = torches[i], [r2, c2] = torches[j];
		if (r1 !== r2 && c1 !== c2) continue;
		let blocked = false;
		for (let r = Math.min(r1, r2), c = Math.min(c1, c2); r <= Math.max(r1, r2) && c <= Math.max(c1, c2); r1 === r2 ? c++ : r++) {
			if (t[r][c] === TILE.WALL || t[r][c] === TILE.BREAKABLE_WALL) blocked = true;
		}
		if (!blocked) out.push(`${r1},${c1}-${r2},${c2}`);
	}
	return out.sort();
}
function solve(board, opts) {
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const S = makeSolver(board, bg, [], {}, new Set([FIRE]), { hasLadder: true, ...opts });
	const starts = OPENINGS.map((cell) => {
		const [r, c] = cell.split(',').map(Number);
		return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
	});
	const fullLit = (1 << S.torchCells.length) - 1;
	return measureMetrics(S, starts, (st) => Number(st.split('|')[4]) === fullLit, () => 0,
		{ guardMax: 2_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
}

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 1,1 聖樹の火の継ぎ渡し ① データ', () => {
	test('盤面・聖樹の火・ワープと条件と書き置きは据え置き・敵が居ない', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.initLitTorches, '聖樹の火が初めから点いていない').toEqual([FIRE]);
		expect(st.showConditions).toEqual({ [WARP]: { trigger: 'torchesLit' } });
		expect(st.mapEnters).toEqual({ [WARP]: { id: 'd6_gatehall', destId: 'd6_bosswing' } });
		expect(st.signData['3,9']?.name, '鍵番の書き置きが消えた').toBe('鍵番の 書き置き');
		expect(st.signData['8,1']?.name).toBe('聖樹のかがり火の間');
		expect([...rowsOf(st).join('')].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
	});

	test('消えた3本（A・B・C）の隣に立てる床が無い＝ロウソクでは点かない', () => {
		const t = LIVE().map((r) => [...r]);
		const w = walkable(t);
		for (const k of [A, B, C]) expect(nbrs(k).filter((n) => w.has(n)), `${k} の隣に立てる`).toEqual([]);
		expect(nbrs(FIRE).some((n) => w.has(n)), '聖樹の火の隣に立てない（見せ場が遠い）').toBe(true);
	});

	test('かがり火が同じ直線に並ぶのは F–A・A–B・B–C の3組だけ（木の鎖＝継ぐ順が1通り）', () => {
		expect(relayEdges(LIVE().map((r) => [...r]))).toEqual([`${FIRE}-${A}`, `${A}-${B}`, `${B}-${C}`].sort());
	});

	test('ソルバー：ロウソク＋ブーメランで全点灯に届き、詰まない／道具無しでは届かない', () => {
		const on = solve(LIVE(), { hasCandle: true });
		expect(on.L, '全点灯に届かない').not.toBe(null);
		expect(on.noEscape, '入って詰む状態').toBe(0);
		expect(solve(LIVE(), { noTools: true }).L, '道具無しで全点灯した').toBe(null);
	});

	test('対照：A と B の間の木 (3,4) を壁にするとソルバーでも全点灯できない（列4 が火の通り道）', () => {
		const board = LIVE().map((row, i) => (i === 3 ? row.slice(0, 4) + '#' + row.slice(5) : row));
		expect(solve(board, { hasCandle: true }).L).toBe(null);
	});

	test('層の接続：到達室は書き換え前と同じ・dead-edge 0', () => {
		const start = { stage: '1,3', row: 7, col: 2 };
		const closed = bfsLayer(stages, start, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
		expect(closed.reachedRooms.has(ROOM)).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_boomerang: '1', ps_candle: '1' });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
	for (let i = 0; i < 4; i++) window.__game.step(1);
}, { d, n: tiles });
// その向きへブーメランを投げ、手元へ戻るまで回す（木＝往復 8 tick 程度・40 tick は余裕）
const toss = (page, d) => page.evaluate((d) => {
	const g = window.__game;
	g.getPlayer().activeSubItem = 'boomerang';
	g.setHeroDir(d);
	g.useSubItem();
	for (let i = 0; i < 40; i++) g.step(1);
	return g.getProjectiles().filter((p) => p.type === 'boomerang').length;
}, d);
const snap = (page) => page.evaluate((warp) => {
	const g = window.__game;
	const p = g.getPlayer();
	const ss = g.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		lit: [...ss.litTorches].sort(),
		warp: ss.conditionsMet.includes(warp),
		tier: p.boomerangTier ?? 0,
	};
}, WARP);

test.describe('D6 1,1 聖樹の火の継ぎ渡し ② 挙動（実機）', () => {
	test('木のブーメランで 行2 → 列4 → 行4 の3投：A→B→C の順に点いてワープが出る', async ({ page }) => {
		const errors = await boot(page, 2, 1);
		const s0 = await snap(page);
		expect(s0.tier, '木のブーメランで測っていない').toBe(0);
		expect(s0.lit, '初めは聖樹の火だけ').toEqual([FIRE]);
		expect(s0.warp).toBe(false);

		expect(await toss(page, 'right'), 'ブーメランが戻っていない').toBe(0);
		expect((await snap(page)).lit, '① (2,1)→右 で A が点かない').toEqual([FIRE, A].sort());

		await walk(page, 'down', 4); await walk(page, 'right', 3);
		expect((await snap(page)).pos).toBe('6,4');
		await toss(page, 'up');
		expect((await snap(page)).lit, '② (6,4)→上 で B が点かない').toEqual([FIRE, A, B].sort());

		await walk(page, 'left', 3); await walk(page, 'up', 2);
		expect((await snap(page)).pos).toBe('4,1');
		await toss(page, 'right');
		const s3 = await snap(page);
		expect(s3.lit, '③ (4,1)→右 で C が点かない').toEqual([FIRE, A, B, C].sort());
		expect(s3.warp, '全点灯でワープが出ない').toBe(true);
		expect(errors).toEqual([]);
	});

	test('順を飛ばした投げでは点かない：A より先に列4・行4 へ投げても何も点かない', async ({ page }) => {
		const errors = await boot(page, 6, 4);
		await toss(page, 'up');
		expect((await snap(page)).lit, 'A が点く前に列4 で点いた').toEqual([FIRE]);
		await walk(page, 'left', 3); await walk(page, 'up', 2);
		expect((await snap(page)).pos).toBe('4,1');
		await toss(page, 'right');
		const s = await snap(page);
		expect(s.lit, 'B が点く前に行4 で点いた').toEqual([FIRE]);
		expect(s.warp).toBe(false);
		expect(errors).toEqual([]);
	});
});
