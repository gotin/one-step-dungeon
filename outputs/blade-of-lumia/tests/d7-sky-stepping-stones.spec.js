// tests/d7-sky-stepping-stones.spec.js
// dungeon_7 `2,0`「空の飛び石」の番人
// （2026-10-03 / PLAN 実行キュー 39 の第2陣 1室目・盤面は `scripts/migrate-d7-2-0-sky-stepping-stones.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_6 2,0` と同型＝四角い広間に宝箱（ルピー×10・素で開く）が1つあるだけ。
//
// 新しい盤面（床の大半が空へ崩れ、飛び石の床が残った）:
//      1 #%%%..%%%%%#
//      2 #%%%.B.x..%#   ← 宝箱 (2,5)＝ルピー×20・穴 (2,7)
//      3 #%%%%%%%%.%#   ← (3,5)＝宝箱の真下の空＝1枚なのに渡れない
//      4 #..x..%%%.%#   ← 穴 (4,3)
//      5 #.%%%.x...%#   ← 穴 (5,6)
//      6 #.%%%%%%%%%#
//      7 #..x....%%%#   ← 穴 (7,3)
//      8 #%%%%..%%%%#
//   飛び石の切れ目は2種類＝穴（はしごで1マス渡れる）と空（渡れない）。宝箱へは穴を4つ渡って回り込む。
//
// 守るものは2つ。
//   ① データ（幾何）：はしご無しでは宝箱に届かない／はしごで穴を4つ渡れば届く／おとりの空が道を
//      延ばしている（対照）／取り残された床が無い／層の到達性は不変。
//   ② 挙動（実機）：はしご無しでは最初の穴を渡れない／はしごがあっても宝箱の真下の空は渡れない／
//      穴を4つ渡って宝箱を開け、ルピー +20。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, LADDER_OVER } from '../scripts/lib/connectivity.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '2,0';
const stages = map.layers[LAYER].stages;
const ROWS = 10, COLS = 12;

const ROOM_ROWS = [
	'############',
	'#%%%..%%%%%#',
	'#%%%.B.x..%#',
	'#%%%%%%%%.%#',
	'#..x..%%%.%#',
	'#.%%%.x...%#',
	'#.%%%%%%%%%#',
	'#..x....%%%#',
	'#%%%%..%%%%#',
	'#####..#####',
];
const CHEST = '2,5';
const EXITS = ['9,5', '9,6'];
const PITS = ['7,3', '4,3', '5,6', '2,7'];

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
// 口から歩けるセルと、渡った穴の最少数（はしごは進む向きの先が地上のときだけ穴を1マス渡る
// ＝`game/passable.js isLadderBridge`）。
function reach(t, withLadder) {
	const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
	const blocked = (r, c) => BLOCKED.has(t[r][c]);
	const cost = new Map(EXITS.map((k) => [k, 0]));
	const dq = [...EXITS];
	while (dq.length) {
		const k = dq.shift();
		const [r, c] = k.split(',').map(Number);
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc)) continue;
			if (!blocked(nr, nc)) {
				if (!cost.has(nk) || cost.get(nk) > cost.get(k)) { cost.set(nk, cost.get(k)); dq.unshift(nk); }
				continue;
			}
			const fr = nr + dr, fc = nc + dc, fk = `${fr},${fc}`;
			if (withLadder && LADDER_OVER.has(t[nr][nc]) && inside(fr, fc) && !blocked(fr, fc)) {
				if (!cost.has(fk) || cost.get(fk) > cost.get(k) + 1) { cost.set(fk, cost.get(k) + 1); dq.push(fk); }
			}
		}
	}
	return cost;
}

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D7 2,0 空の飛び石 ① データ', () => {
	const t = gridOf();

	test('盤面・宝箱（敵・植生・看板・門が無い）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(ROOM_ROWS);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } });
		expect(st.showConditions ?? {}, '宝箱は封印しない（届けば開く）').toEqual({});
		expect(st.links ?? [], 'links は空').toEqual([]);
		expect(Object.keys(st.signData ?? {}), '看板データは空').toEqual([]);
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.STONE, TILE.SIGN, TILE.GATE, TILE.SWITCH, TILE.BUTTON]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test('はしご無しでは届かない・はしごで穴を4つ渡れば届く・床が取り残されない', () => {
		expect(LADDER_OVER.has(TILE.PIT), '前提：はしごで穴を渡れる').toBe(true);
		expect(LADDER_OVER.has(TILE.SKY), '前提：はしごで空は渡れない').toBe(false);
		expect(reach(t, false).has(CHEST), 'はしご無しで宝箱に届く').toBe(false);
		const ladder = reach(t, true);
		expect(ladder.get(CHEST), '渡る穴の最少数').toBe(PITS.length);
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			if (t[r][c] === TILE.FLOOR || t[r][c] === TILE.CHEST) {
				expect(ladder.has(`${r},${c}`), `床 (${r},${c}) に立てない`).toBe(true);
			}
		}
	});

	test('対照：宝箱の真下の空1枚が道を延ばしている・1つ目の穴が要（測定が空虚でない）', () => {
		const fill = gridOf(); fill[3][5] = TILE.PIT;
		expect(reach(fill, true).get(CHEST), '(3,5) を穴にしても渡りが減らない').toBeLessThan(PITS.length);
		const wall = gridOf(); wall[7][3] = TILE.WALL;
		expect(reach(wall, true).has(CHEST), '1つ目の穴を潰しても届く').toBe(false);
	});

	test('層の接続は不変', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '2,0 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ...extra });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
const snap = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`, rupees: p.rupees,
		opened: [...(window.__game.getStageState().openedChests ?? [])],
	};
});

test.describe('D7 2,0 空の飛び石 ② 実機', () => {
	test('はしご無しでは最初の穴 (7,3) を渡れない', async ({ page }) => {
		const errors = await boot(page, 7, 4);
		await walk(page, 'left', 2);
		expect((await snap(page)).pos, 'はしご無しで穴へ入れた').toBe('7,4');
		expect(errors).toEqual([]);
	});

	test('はしごがあっても、宝箱の真下の空 (3,5) は渡れない', async ({ page }) => {
		const errors = await boot(page, 4, 5, { ps_ladder: '1' });
		await walk(page, 'up', 2);
		expect((await snap(page)).pos, 'はしごで空を渡れた').toBe('4,5');
		expect(errors).toEqual([]);
	});

	test('通し：南の口から穴を4つ渡って宝箱を開ける＝ルピー +20', async ({ page }) => {
		const errors = await boot(page, 8, 5, { ps_ladder: '1' });
		const r0 = (await snap(page)).rupees;
		const route = [
			['up', 1, '7,5'], ['left', 1, '7,4'], ['left', 2, '7,2'],   // 穴 (7,3)
			['left', 1, '7,1'], ['up', 3, '4,1'], ['right', 1, '4,2'],
			['right', 2, '4,4'],                                        // 穴 (4,3)
			['right', 1, '4,5'], ['down', 1, '5,5'],
			['right', 2, '5,7'],                                        // 穴 (5,6)
			['right', 2, '5,9'], ['up', 3, '2,9'], ['left', 1, '2,8'],
			['left', 2, '2,6'],                                         // 穴 (2,7)
			['left', 1, CHEST],
		];
		for (const [d, n, want] of route) {
			await walk(page, d, n);
			expect((await snap(page)).pos, `${d}×${n} の後`).toBe(want);
		}
		const s = await snap(page);
		expect(s.opened, '宝箱が開かない').toContain(CHEST);
		expect(s.rupees - r0, 'ルピーが 20 増えない').toBe(20);
		expect(errors).toEqual([]);
	});
});
