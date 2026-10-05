// tests/d5-frozen-lake-jetty.spec.js
// dungeon_5 `1,3`（入口）「凍れる湖の桟橋」の番人
// （2026-10-05 / PLAN 実行キュー 40 の第1陣 1室目・盤面は `scripts/migrate-d5-1-3-frozen-lake-jetty.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 1,3` と 6 セル差＝四角い広間に石碑と敵が1体いるだけ（D4 の写し）。
//
// 新しい盤面（部屋の西の三分の一が凍れる湖）:
//      1 #~~~.!!....#
//      2 #~~~.....E.#
//      3 #~~~†......#
//      4 .~~.........   ← 幅2の水＝はしごでも渡れない
//      5 .~..........   ← 幅1の水 (5,1)＝はしごで西の口へ渡れる
//      6 #~~........#
//      7 #~>........#   ← 戻り口は湖に突き出た桟橋の先
//      8 #~~........#
//   はしごはこの部屋の北（`1,2`）にある＝取って戻れば西の口（`0,3`）へ入れる。
//
// 守るものは2つ。
//   ① データ（幾何）：はしご無しでは西の口に届かない／はしごで幅1の水を1枚渡れば届く／
//      行4 は幅2で渡れない（対照つき）／層の到達性（はしご無しで抜けるのは `0,3` だけ）。
//   ② 挙動（実機）：はしご無しでは (5,1) を渡れない／はしごがあっても行4 は渡れない／
//      はしごで (5,1) を渡って西の口から `0,3` へ出られる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { bfsLayer, LADDER_OVER } from '../scripts/lib/connectivity.mjs';
import { TARGET, EXITS, LANDING, CROSSING, reach } from '../scripts/migrate-d5-1-3-frozen-lake-jetty.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '1,3';
const stages = map.layers[LAYER].stages;

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 1,3 凍れる湖の桟橋 ① データ', () => {
	test('盤面・戻り口・石碑（本文は旧のまま）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.mapEnters, '戻り口').toEqual({ [LANDING]: { id: 'dungeon_5', destId: 'field_dungeon5' } });
		expect(st.signData['3,4'].name).toBe('氷の廃墟・入口の石碑');
	});

	test('はしご無しでは西の口に届かない・はしごで幅1の水を1枚渡れば届く', () => {
		const t = gridOf();
		expect(LADDER_OVER.has(TILE.WATER), '前提：はしごで水を渡れる').toBe(true);
		const foot = reach(t);
		for (const k of EXITS.west) expect(foot.has(k), `はしご無しで西の口 ${k} に届く`).toBe(false);
		for (const k of ['2,5', '2,6', ...EXITS.east]) expect(foot.has(k), `はしご無しで ${k} に届かない`).toBe(true);
		expect(reach(t, { withLadder: true }).get('5,0'), '渡る水の枚数').toBe(1);
		expect(t[4][1] === TILE.WATER && t[4][2] === TILE.WATER, '行4 は幅2の水').toBe(true);
	});

	test('対照：渡りを潰すと届かない・行4 の幅を1にすると渡れる（測定が空虚でない）', () => {
		const wall = gridOf(); wall[5][1] = TILE.WALL;
		expect(reach(wall, { withLadder: true }).has('5,0'), `${CROSSING} を壁にしても届く`).toBe(false);
		const wide = gridOf(); wide[5][2] = TILE.WATER;
		expect(reach(wide, { withLadder: true }).has('5,0'), '幅2にしても届く').toBe(false);
		const thin = gridOf(); thin[4][2] = TILE.FLOOR;
		expect(reach(thin, { withLadder: true, from: '4,2' }).get('4,0'), '行4 を幅1にしても渡れない').toBe(1);
	});

	test('層の接続：はしごがあれば全室・はしご無しでは 0,3 に入れない', () => {
		const START = { stage: ROOM, row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const ladder = bfsLayer(stages, START, { withLadder: true, openTiles: OPEN });
		expect(ladder.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(ladder.reachedRooms.size, 'はしごありで歩ける部屋数').toBe(Object.keys(stages).length);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.reachedRooms.has('0,3'), 'はしご無しで 0,3 に入れる').toBe(false);
		expect(foot.reachedRooms.has('1,2'), 'はしご無しで 1,2（はしごの宝箱）に届かない').toBe(true);
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
	const g = window.__game.getState();
	const p = window.__game.getPlayer();
	return { stage: g.stageKey, pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}` };
});

test.describe('D5 1,3 凍れる湖の桟橋 ② 実機', () => {
	test('はしご無しでは幅1の水 (5,1) を渡れない', async ({ page }) => {
		const errors = await boot(page, 5, 2);
		await walk(page, 'left', 2);
		expect(await snap(page), 'はしご無しで水へ入れた').toEqual({ stage: ROOM, pos: '5,2' });
		expect(errors).toEqual([]);
	});

	test('はしごがあっても、行4 の幅2の水は渡れない', async ({ page }) => {
		const errors = await boot(page, 4, 3, { ps_ladder: '1' });
		await walk(page, 'left', 3);
		expect(await snap(page), 'はしごで幅2の水を渡れた').toEqual({ stage: ROOM, pos: '4,3' });
		expect(errors).toEqual([]);
	});

	test('通し：桟橋から行5 へ回り、はしごで (5,1) を渡って西の口から 0,3 へ出る', async ({ page }) => {
		const errors = await boot(page, 7, 3, { ps_ladder: '1' });
		await walk(page, 'up', 2);
		expect((await snap(page)).pos).toBe('5,3');
		await walk(page, 'left', 3);
		expect((await snap(page)).pos, '渡りの向こう岸 (5,0) に着かない').toBe('5,0');
		await page.evaluate(() => { for (let i = 0; i < 6; i++) { window.__game.movePlayer('left'); window.__game.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '0,3', null, { timeout: 5000 });
		expect(errors).toEqual([]);
	});
});
