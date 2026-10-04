// tests/d7-sky-pillar-crossing.spec.js
// dungeon_7 `0,2`「空の崩れ柱渡り」の番人
// （2026-10-04 / PLAN 実行キュー 39 の第3陣 2室目・盤面は `scripts/migrate-d7-0-2-sky-pillar-crossing.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_6 0,2` の写し＝北・東の口がある四角い広間に、宝箱（ルピー×5・素で開く）が1つあるだけ。
//
// 新しい盤面（西と南が空へ崩れ落ち、崩れかけの柱 '!' と穴 'x' が残る）:
//      2 #..!x..%%%%#   ← 入門の柱 (2,3)・穴 (2,4)
//      3 #.%%%.5%%%%#   ← 爆弾 ×4 (3,6)
//      4 #x%%%.......   ← 穴 (4,1)
//      5 #!%%x.......   ← 柱 (5,1)／おとりの穴 (5,4)
//      6 #.%%%%%%x%%#   ← おとりの穴 (6,8)
//      7 #.%%%%%%%!%#   ← おとりの柱 (7,9)
//      8 #.x!x.x..B%#   ← 空に浮く柱 (8,3)・宝箱 (8,9)＝ルピー×30
//   穴の向こうが柱だと、はしごの橋脚が無い＝渡れない。爆弾で柱を崩すと跡が床になり、はしごが掛かる。
//
// 守るものは2つ。
//   ① データ：盤面・宝箱・柱・爆弾の床置き／厳密な最短手数と爆弾の最少数／爆弾・はしごのどちらが
//      欠けても届かない／どの柱も要る（壁にすると届かない・床にすると爆弾が1個減る）／おとりの柱は
//      近道にならない（測定が空虚でない対照）／層の到達性は不変。
//   ② 挙動（実機）：柱が立っている間ははしごが掛からない・崩すと掛かる（＝崩した跡が橋脚になる）／
//      おとりの穴ははしごを持っていても渡れない／通しで爆弾を拾い、柱3本を崩して宝箱でルピー +30。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ITEM_META } from '../shared/items.js';
import { bfsLayer, LADDER_OVER } from '../scripts/lib/connectivity.mjs';
import {
	TARGET, PILLARS, DECOY_PILLAR, PITS, DECOY_PITS, CHEST_CELL as CHEST, BOMB_CELL, BOMB_COUNT,
	SHORTEST, MIN_BOMBS, solvePillars, minBombsOf,
} from '../scripts/migrate-d7-0-2-sky-pillar-crossing.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '0,2';
const stages = map.layers[LAYER].stages;
const ROWS = 10, COLS = 12;

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const cellsOf = (t, ch) => {
	const out = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === ch) out.push(`${r},${c}`);
	return out.sort();
};
const setCell = (k, ch) => { const g = gridOf(); const [r, c] = k.split(',').map(Number); g[r][c] = ch; return g; };

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D7 0,2 空の崩れ柱渡り ① データ', () => {
	// ⚠️ 盤面は**実マップから**読む（移行スクリプトの TARGET と一致することは最初の本で別に見る）。
	const t = gridOf();

	test('盤面・宝箱・柱・爆弾の床置き（敵・植生・看板が無い）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } });
		expect(st.showConditions ?? {}, '宝箱は封印しない（見えているのに届かない）').toEqual({});
		expect(cellsOf(t, TILE.BREAKABLE_WALL), '柱の位置').toEqual([...PILLARS, DECOY_PILLAR].sort());
		for (const k of [...PILLARS, DECOY_PILLAR]) {
			expect(st.breakableWalls?.[k]?.breakDef, `柱 ${k} の硬さ`).toBeLessThanOrEqual(ITEM_META.bomb.breakPower);
		}
		expect(cellsOf(t, TILE.PIT), '穴の位置').toEqual([...PITS].sort());
		expect(cellsOf(t, TILE.ITEM_BOMB), '爆弾の床置き').toEqual([BOMB_CELL]);
		expect(st.floorItems, '爆弾の数').toEqual({ [BOMB_CELL]: { count: BOMB_COUNT } });
		expect(BOMB_COUNT, '要る数＋余り1').toBe(MIN_BOMBS + 1);
		expect(st.links ?? [], 'links は空').toEqual([]);
		expect(Object.keys(st.signData ?? {}), '看板データは空').toEqual([]);
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.STONE, TILE.SIGN, TILE.GATE, TILE.SWITCH, TILE.TORCH]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test('最短手数・爆弾の最少数・爆弾とはしごが両方要る', () => {
		expect(LADDER_OVER.has(TILE.PIT), '前提：はしごで穴を渡れる').toBe(true);
		expect(LADDER_OVER.has(TILE.SKY), '前提：はしごで空は渡れない').toBe(false);
		expect(ITEM_META.bomb.aoeRadius, '前提：爆弾の半径（立ち位置はこの値で設計した）').toBe(2);
		const sol = solvePillars(t);
		expect(sol?.L, `手数（${sol?.steps.join(' → ')}）`).toBe(SHORTEST);
		expect(sol.steps.filter((s) => s.startsWith('爆弾')), '爆弾を置く場所').toEqual(['爆弾 2,5', '爆弾 3,1', '爆弾 8,1']);
		expect(sol.steps.filter((s) => s.startsWith('はしご')), '渡る穴').toEqual(['はしご 2,4', 'はしご 4,1', 'はしご 8,2', 'はしご 8,4', 'はしご 8,6']);
		expect(minBombsOf(t), '要る爆弾の最少数').toBe(MIN_BOMBS);
		expect(solvePillars(t, { bomb: false }), '爆弾無しで届いた').toBeNull();
		expect(solvePillars(t, { ladder: false }), 'はしご無しで届いた').toBeNull();
	});

	test('対照：どの柱も要る・おとりの柱は近道にならない・おとりの穴は渡れない（測定が空虚でない）', () => {
		for (const k of PILLARS) {
			expect(solvePillars(setCell(k, TILE.WALL)), `柱 ${k} を壁にしても届いた`).toBeNull();
			expect(minBombsOf(setCell(k, TILE.FLOOR)), `柱 ${k} を床にしても爆弾が減らない`).toBe(MIN_BOMBS - 1);
		}
		expect(solvePillars(setCell(DECOY_PILLAR, TILE.FLOOR))?.L, 'おとりの柱が近道になった').toBe(SHORTEST);
		// おとりの穴の向こうを床にすると渡れる＝「向こうが空だから渡れない」が効いている
		const open = gridOf().map((row) => row.map((ch) => (ch === TILE.SKY ? TILE.FLOOR : ch)));
		expect(solvePillars(open, { bomb: false }), '空を床にしても爆弾無しで届かない').not.toBeNull();
		for (const k of DECOY_PITS) {
			const [r, c] = k.split(',').map(Number);
			const banks = [[r - 1, c, r + 1, c], [r, c - 1, r, c + 1]]
				.filter(([a, b, d, e]) => t[a][b] !== TILE.SKY && t[a][b] !== TILE.WALL && t[d][e] !== TILE.SKY && t[d][e] !== TILE.WALL);
			expect(banks, `おとりの穴 ${k} に両岸がある`).toEqual([]);
		}
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
async function boot(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ...extra,
	});
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
const snap = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	const ss = window.__game.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`, rupees: p.rupees, bombs: p.subItems.bomb?.count ?? 0,
		broken: [...(ss.brokenWalls ?? [])].sort(), opened: [...(ss.openedChests ?? [])],
	};
});
// 足元に爆弾を置いて爆発まで待つ（導火線 2000ms＝TICK 120ms × 17 より長く回す）
async function bomb(page) {
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bomb'; });
	await step(page, 2);
	await page.evaluate(() => window.__game.useSubItem());
	await step(page, 30);
}
async function route(page, legs) {
	for (const [d, n, want] of legs) {
		await walk(page, d, n);
		expect((await snap(page)).pos, `${d}×${n} の後`).toBe(want);
	}
}

test.describe('D7 0,2 空の崩れ柱渡り ② 実機', () => {
	test('柱が立っている間ははしごが掛からず、崩すと跡が橋脚になって渡れる', async ({ page }) => {
		const errors = await boot(page, 2, 5, { ps_ladder: '1', ps_bomb: '1' });
		await walk(page, 'left', 2);
		expect((await snap(page)).pos, '柱が立ったまま穴 (2,4) を渡れた').toBe('2,5');
		await bomb(page);
		expect((await snap(page)).broken, '(2,5) の爆弾で柱 (2,3) が崩れない').toEqual(['2,3']);
		await walk(page, 'left', 2);
		expect((await snap(page)).pos, '崩した跡へはしごが掛からない').toBe('2,3');
		expect(errors).toEqual([]);
	});

	test('はしご無しでは崩した跡へも渡れず、おとりの穴ははしごがあっても渡れない', async ({ page }) => {
		let errors = await boot(page, 2, 5, { ps_bomb: '1' });
		await bomb(page);
		expect((await snap(page)).broken).toEqual(['2,3']);
		await walk(page, 'left', 2);
		expect((await snap(page)).pos, 'はしご無しで穴 (2,4) を渡れた').toBe('2,5');
		expect(errors).toEqual([]);
		errors = await boot(page, 5, 5, { ps_ladder: '1' });
		await walk(page, 'left', 2);
		expect((await snap(page)).pos, 'おとりの穴 (5,4) を渡れた').toBe('5,5');
		await route(page, [['right', 3, '5,8']]);
		await walk(page, 'down', 2);
		expect((await snap(page)).pos, 'おとりの穴 (6,8) を渡れた').toBe('5,8');
		expect(errors).toEqual([]);
	});

	test('通し：爆弾を拾い、柱3本を崩して穴5枚を渡り、宝箱でルピー +30', async ({ page }) => {
		const errors = await boot(page, 1, 5, { ps_ladder: '1' });
		// 初めてのサブアイテムで出るヒントの会話を出さない（D7 に来たプレイヤーは必ず見終わっている＝
		// プレビューではしごだけ持たせた都合で「初めて」になる。会話中は歩けない）。
		await page.evaluate(() => { window.__game.getPlayer()._shownSubItemHint = true; });
		let s = await snap(page);
		expect(s.bombs, 'プレビューで爆弾を持たせていない').toBe(0);
		const r0 = s.rupees;
		await route(page, [['down', 2, '3,5'], ['right', 1, BOMB_CELL]]);
		expect((await snap(page)).bombs, '爆弾 ×4 を拾えない').toBe(BOMB_COUNT);
		await route(page, [['left', 1, '3,5'], ['up', 1, '2,5']]);
		await bomb(page);
		await route(page, [['left', 2, '2,3'], ['left', 2, '2,1'], ['down', 1, '3,1']]);
		await bomb(page);
		expect((await snap(page)).broken, '(3,1) の爆弾で柱 (5,1) が崩れない').toEqual(['2,3', '5,1']);
		await route(page, [['down', 2, '5,1'], ['down', 3, '8,1']]);
		await bomb(page);
		s = await snap(page);
		expect(s.broken, '(8,1) の爆弾で空に浮く柱 (8,3) が崩れない').toEqual(['2,3', '5,1', '8,3']);
		expect(s.bombs, '余りの爆弾').toBe(BOMB_COUNT - MIN_BOMBS);
		await route(page, [['right', 2, '8,3'], ['right', 2, '8,5'], ['right', 2, '8,7'], ['right', 1, '8,8'], ['right', 1, CHEST]]);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toContain(CHEST);
		expect(s.rupees - r0, 'ルピーが 30 増えない').toBe(30);
		expect(errors).toEqual([]);
	});
});
