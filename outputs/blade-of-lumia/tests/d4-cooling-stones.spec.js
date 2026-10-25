// tests/d4-cooling-stones.spec.js
// dungeon_4 `2,0`「冷え石の渡り」の番人
// （2026-10-25 / PLAN 実行キュー 92 の8室目・盤面は `scripts/migrate-d4-2-0-cooling-stones.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   真ん中に宝箱（ルピー×5）が1つ置いてあるだけの素の部屋・敵なし。
//
// 新しい盤面:
//      1 #....B.....#   ← 向こう岸の宝箱 (1,5)＝ルピー×20
//      3 #llllllllll#   ← 溶岩の川（深さ 2・壁から壁まで）
//      4 #llllllllll#
//      5 #....ll....#
//      6 #.#..##..*.#   ← 東の棚の石 (6,9)＝真下が壁で北へ押せない
//      7 #*.......#.#   ← 西の壁際の石 (7,1)＝北へしか押せない
//      8 #.......i#.#   ← 看板 (8,8)
//   石を溶岩へ押し込むと沈んで冷え、足場になる（新しい地形ルール）。西の石を列1 に沈め、東の石を列1 まで
//   運んで冷えた跡を通して沈めると、向こう岸へ渡れる。
//
// 守るものは3つ。
//   ① データ：盤面・宝箱・看板・敵なし・解ける・閉じ込めなし・沈むルールが無いと解けない・石は2個とも要る・
//      層の接続は不変。
//   ② ルール（実機）：石は溶岩に沈んで冷えた溶岩（床）になり、人が乗れる／まだ溶岩のセルには乗れない／
//      部屋を出て入り直すと石も溶岩も元に戻る。
//   ③ 主題（実機）：通しで2個沈めて川を渡り、宝箱が開いてルピー +20。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import {
	LAYER, ROOM, TARGET, CHEST, CHEST_CONTENT, STONE_WEST, STONE_EAST, SIGN, OPENING, reach, solve,
} from '../scripts/migrate-d4-2-0-cooling-stones.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));
// ソルバーは配っているマップの盤面で測る（TARGET で測ると、マップが壊れても緑のまま＝歯が無い）。
const LIVE = room.tiles.map(rowStr);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D4 冷え石の渡り ① データ', () => {
	test('盤面・宝箱（ルピー×20）・看板の本文・敵なし', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(room.chestContents[CHEST]).toMatchObject({ type: 'rupee', value: CHEST_CONTENT.value });
		expect(room.showConditions ?? {}).toEqual({});
		expect(room.signData?.[SIGN]?.lines?.length, '看板に本文が無い（{name, lines} でないと描画されない）').toBeGreaterThan(0);
		expect(grid.flat().filter((ch) => ENEMY_META[ch]), '敵が居る＝敵も石を押すので謎が崩れる').toEqual([]);
	});

	test('歩くだけでは届かない・ソルバーで解ける・閉じ込めなし・答えの置き方は1通り', () => {
		const walk = reach(grid, OPENING);
		const [cr, cc] = CHEST.split(',').map(Number);
		expect([[cr + 1, cc], [cr, cc - 1], [cr, cc + 1]].some(([r, c]) => walk.has(`${r},${c}`)), '歩くだけで宝箱へ届く').toBe(false);
		const m = solve(LIVE);
		expect(m.L, '解けない').not.toBeNull();
		expect(m.noEscape, '口へ戻れなくなる押し方がある').toBe(0);
		expect(m.crossings, '向こう岸へ渡れる石の置き方が列1 の1通りでない').toEqual(['s3,1;s4,1']);
	});

	test('対照：沈むルールが無いと解けない・石を1個外すと解けない', () => {
		expect(solve(LIVE, { lavaSinks: false }).L, '石が沈まなくても渡れた').toBeNull();
		for (const s of [STONE_WEST, STONE_EAST]) {
			const one = LIVE.map((row, r) => [...row].map((ch, c) => (`${r},${c}` === s ? '.' : ch)).join(''));
			expect(solve(one).L, `石 ${s} が無くても渡れた＝川が深さ 2 になっていない`).toBeNull();
		}
	});

	test('層の接続：到達できる・dead-edge 0', () => {
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(run.reachedRooms.has(ROOM)).toBe(true);
		expect(run.deadEdges).toEqual([]);
	});
});

// ── ②③ 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col) });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// 1マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles = 1) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
// 石押しは実時間のクールダウン（STONE_PUSH_COOLDOWN_MS=600）＝余裕を見て待つ。
async function push(page, d) {
	await page.evaluate((dir) => { window.__game.movePlayer(dir); window.__game.step(1); }, d);
	await page.waitForTimeout(800);
}
const snap = (page) => page.evaluate(() => {
	const g = window.__game;
	const p = g.getPlayer();
	const ss = g.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		stones: JSON.parse(JSON.stringify(ss.stonePositions ?? {})),
		opened: [...(ss.openedChests ?? [])],
		rupees: p.rupees,
		stage: g.getState().stageKey,
	};
});
const cooledCell = (page, r, c) => page.locator(`#board .cell[data-row="${r}"][data-col="${c}"]`)
	.evaluate((el) => el.dataset.cooledLava === '1');

test.describe('D4 冷え石の渡り ② ルール（実機）', () => {
	test('石を溶岩へ押し込むと沈んで冷え、人が乗れる（その先のまだ熱い溶岩には乗れない）', async ({ page }) => {
		const errors = await boot(page, 8, 1);
		expect(await cooledCell(page, 4, 1), '前提：最初から冷えている').toBe(false);
		for (let i = 0; i < 2; i++) await push(page, 'up');   // (7,1)→(6,1)→(5,1)
		// 3回目＝溶岩 (4,1) へ。押した直後（石がまだ転がっている間）は溶岩の絵のまま＝石が届いてから冷える
		// （2026-10-25 ユーザー指摘「落ちる直前に溶岩の中の石が描かれ、その上を押している石が動いて見える」）。
		await page.evaluate(() => { window.__game.movePlayer('up'); window.__game.step(1); });
		expect(await cooledCell(page, 4, 1), '石が届く前に冷えた溶岩の絵になった').toBe(false);
		await page.waitForTimeout(800);
		const s = await snap(page);
		expect(s.stones[STONE_WEST], '石が溶岩に沈んだ記録が無い').toMatchObject({ sunk: '4,1' });
		expect(await cooledCell(page, 4, 1), '沈んだセルが冷えた溶岩の絵になっていない').toBe(true);
		expect(await page.locator('#char-stone-7-1').count(), '沈んだ石がまだ描かれている').toBe(0);
		await walk(page, 'up', 3);
		expect((await snap(page)).pos, '冷えた溶岩に乗れない／その先の溶岩 (3,1) に乗れた').toBe('4,1');
		expect(errors).toEqual([]);
	});

	test('部屋を出て入り直すと、沈んだ石は元の場所へ戻り、溶岩も熱いまま戻る', async ({ page }) => {
		const errors = await boot(page, 8, 1);
		for (let i = 0; i < 3; i++) await push(page, 'up');
		expect((await snap(page)).stones[STONE_WEST]).toMatchObject({ sunk: '4,1' });
		// (5,1) → 行7 → 列5 → 南の口 (9,5) の外へ（遷移は非同期＝待つ）
		await walk(page, 'down', 2); await walk(page, 'right', 4); await walk(page, 'down', 4);
		await page.waitForFunction(() => window.__game.getState().stageKey === '2,1', null, { timeout: 5000 });
		await walk(page, 'up', 3);
		await page.waitForFunction((room) => window.__game.getState().stageKey === room, ROOM, { timeout: 5000 });
		const s = await snap(page);
		expect(s.stones, '入り直しても石の記録が残っている＝溶岩が冷えたまま').toEqual({});
		expect(await cooledCell(page, 4, 1), '入り直しても冷えた溶岩が残っている').toBe(false);
		expect(errors).toEqual([]);
	});
});

// ソルバーの最短解（`.scratch/q92/design-2-0.mjs` の道筋を向きに直したもの）。P＝石を押す1手。
// (8,6) から：東の石を西へ出して行7 を西の壁際まで運び、先に西の石を列1 に沈め、その跡を通して東の石を沈める。
const SOLUTION = ['up', 'right', 'up', 'up', 'right', 'right', 'right', 'down', 'Pleft', 'Pleft', 'up', 'left', 'Pdown',
	'right', 'down', 'Pleft', 'Pleft', 'Pleft', 'Pleft', 'Pleft', 'down', 'left', 'left', 'Pup', 'Pup', 'Pup', 'right', 'right',
	'down', 'down', 'Pleft', 'down', 'left', 'Pup', 'Pup', 'Pup', 'Pup', 'up', 'up', 'up', 'right', 'right', 'right',
	'right'];   // 最後の1歩＝宝箱 (1,5) を踏んで開ける（ソルバーのゴールは宝箱の隣）

test.describe('D4 冷え石の渡り ③ 主題', () => {
	test('通し：2個を列1 に続けて沈めて川を渡ると、宝箱が開きルピー +20', async ({ page }) => {
		test.setTimeout(60_000);
		const errors = await boot(page, 8, 6);
		const rupees0 = (await snap(page)).rupees;
		for (const m of SOLUTION) {
			if (m.startsWith('P')) await push(page, m.slice(1));
			else await walk(page, m);
		}
		const s = await snap(page);
		expect(s.stones[STONE_WEST], '西の石が (4,1) に沈んでいない').toMatchObject({ sunk: '4,1' });
		expect(s.stones[STONE_EAST], '東の石が (3,1) に沈んでいない').toMatchObject({ sunk: '3,1' });
		expect(s.opened, '宝箱が開いていない').toContain(CHEST);
		expect(s.rupees - rupees0, '宝箱の中身').toBe(CHEST_CONTENT.value);
		expect(errors).toEqual([]);
	});
});
