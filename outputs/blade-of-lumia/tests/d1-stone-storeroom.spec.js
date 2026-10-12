// tests/d1-stone-storeroom.spec.js
// dungeon_1 `0,3`（入口の西の行き止まり）「石室の宝棚」の番人
// （2026-10-12 / PLAN 実行キュー 47 の第1陣 1室目・盤面は `scripts/migrate-d1-0-3-stone-storeroom.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間の真ん中に大ルピーが1枚落ちているだけ（キュー21 の F6）。
//
// 新しい盤面（西の壁の棚に宝箱・棚の口に石・石の下に1マスの袋）:
//      2 #..........#   ← 北の通り（石の北へ回り込む道）
//      3 ###.#i.....#   ← (3,3) 石の北の立ち位置／(3,5) 書き置き
//      4 #B.*........   ← 宝箱 (4,1)・石 (4,3)／東の口
//      5 ###.#.......   ← (5,3) 袋
//   東から来て石を西へ押すと棚に入って宝箱の前で止まる＝詰む（出直せば戻る）。北から南へ押し下ろすのが答え。
//
// 守るものは2つ。
//   ① データ：盤面・宝箱・書き置き・ソルバー（最短手数・押す向き・詰まない・対照）・層の接続。
//   ② 挙動（実機）：正面から押すと石は宝箱の前で止まり、宝箱の上へは入らない（エンジンの修正の番人）／
//      詰んでも部屋を出て入り直せば石は戻る／北から押し下ろせば宝箱を開けられる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import {
	TARGET, EXITS, STONE, SHELF, CHEST, POCKET, NORTH_STAND, FRONT_STAND, SIGN, SIGN_DATA, CHEST_CONTENT, SHORTEST,
	reach, solveRoom, withCell,
} from '../scripts/migrate-d1-0-3-stone-storeroom.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_1';
const ROOM = '0,3';
const stages = map.layers[LAYER].stages;

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D1 0,3 石室の宝棚 ① データ', () => {
	test('盤面・宝箱（条件なし）・書き置き・敵も床の物も無い', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: CHEST_CONTENT });
		expect(Object.keys(st.showConditions ?? {}), '宝箱に出現条件が付いた（初めから見えているはず）').toEqual([]);
		expect(st.signData).toEqual({ [SIGN]: SIGN_DATA });
		const all = rowsOf(st).join('');
		expect([...all].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		expect(all.includes(TILE.ITEM_RUPEE_LARGE), '旧盤面の大ルピーが残っている').toBe(false);
	});

	test('棚の形：石を動かさずに届かない床は宝箱の前と袋だけ・石の北と東には立てる', () => {
		const t = rowsOf(stages[ROOM]).map((r) => [...r]);
		const foot = reach(t);
		expect(foot.has(SHELF), '石を動かさずに宝箱の前へ歩けた').toBe(false);
		expect(foot.has(POCKET), '石を動かさずに袋へ歩けた').toBe(false);
		expect(foot.has(NORTH_STAND), '石の北へ回り込めない').toBe(true);
		expect(foot.has(FRONT_STAND), '石の東に立てない').toBe(true);
	});

	test(`ソルバー：最短 ${SHORTEST} 手・押しは1回（石を南の袋へ）・入って詰まない・押す向きを誤ると詰む`, () => {
		const m = solveRoom(rowsOf(stages[ROOM]));
		expect(m.L, '東の口から宝箱を踏むまでの最短手数').toBe(SHORTEST);
		expect(m.pushList, '最短解の押し').toEqual([`${STONE}→${POCKET}`]);
		expect(m.noEscape, '入って詰む状態').toBe(0);
		expect(m.deadlocks, '詰みの状態が無い＝押す向きを誤る余地が無い').toBeGreaterThan(0);
	});

	test('対照：押さない・正面から押した後・袋を壁にする、はどれも解けない', () => {
		expect(solveRoom(TARGET, { noPush: true }).L, '石を押さずに宝箱へ届いた').toBe(null);
		const jammed = withCell(SHELF, TILE.STONE, withCell(STONE, TILE.FLOOR));
		expect(solveRoom(jammed).L, '石が宝箱の前に入っても宝箱へ届いた').toBe(null);
		expect(solveRoom(withCell(POCKET, TILE.WALL)).L, '袋が無くても解けた＝袋が答えの置き場でない').toBe(null);
	});

	test('層の接続：到達室・dead-edge は書き換え前と同じ', () => {
		const start = { stage: '1,3', row: 7, col: 2 };
		const closed = bfsLayer(stages, start, { withLadder: false, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(15);
		expect(closed.reachedRooms.has(ROOM)).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
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
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
// 石押しは実時間のクールダウン（STONE_PUSH_COOLDOWN_MS=600）＝余裕を見て待つ。
async function push(page, d) {
	await page.evaluate((dir) => { window.__game.movePlayer(dir); window.__game.step(1); }, d);
	await page.waitForTimeout(1000);
}
const snap = (page) => page.evaluate(({ stone, chest }) => {
	const g = window.__game;
	const p = g.getPlayer();
	const ss = g.getStageState();
	const s = ss.stonePositions?.[stone];
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		stone: s ? `${s.r},${s.c}` : stone,
		opened: [...(ss.openedChests ?? [])].includes(chest),
		rupees: p.rupees,
		stage: g.getState().stageKey,
	};
}, { stone: STONE, chest: CHEST });

test.describe('D1 0,3 石室の宝棚 ② 挙動（実機）', () => {
	test('東から西へ押すと石は宝箱の前で止まり、宝箱の上へは入らない（何度押しても）', async ({ page }) => {
		const errors = await boot(page, 4, 10);
		await walk(page, 'left', 6);
		expect((await snap(page)).pos, '石の東に着いていない').toBe(FRONT_STAND);
		for (let i = 0; i < 4; i++) await push(page, 'left');
		const s = await snap(page);
		expect(s.stone, '石が宝箱の前で止まっていない（宝箱の上へ乗った）').toBe(SHELF);
		expect(s.pos, 'プレイヤーは棚の口で止まる').toBe(STONE);
		expect(s.opened, '詰んだのに宝箱が開いた').toBe(false);
		expect(errors).toEqual([]);
	});

	test('詰んでも部屋を出て入り直せば石は棚の口へ戻る', async ({ page }) => {
		const errors = await boot(page, 4, 4);
		await push(page, 'left');
		expect((await snap(page)).stone, '石が宝箱の前に入っていない').toBe(SHELF);
		await walk(page, 'right', 9);   // 東の口から入口 `1,3` へ出る（遷移は非同期＝待つ）
		await page.waitForFunction(() => window.__game.getState().stageKey === '1,3', null, { timeout: 5000 });
		await walk(page, 'left', 3);    // 入り直す
		await page.waitForFunction((room) => window.__game.getState().stageKey === room, ROOM, { timeout: 5000 });
		const s = await snap(page);
		expect(s.stone, '入り直しても石が戻っていない').toBe(STONE);
		expect(errors).toEqual([]);
	});

	test('北から回って石を南の袋へ押し下ろすと、棚に入って宝箱を開けられる', async ({ page }) => {
		const errors = await boot(page, 4, 10);
		const rupees0 = (await snap(page)).rupees;
		await walk(page, 'up', 2); await walk(page, 'left', 7); await walk(page, 'down', 1);
		expect((await snap(page)).pos, '石の北に着いていない').toBe(NORTH_STAND);
		await push(page, 'down');
		expect((await snap(page)).stone, '石が袋へ下りていない').toBe(POCKET);
		await walk(page, 'left', 2);    // 宝箱の前を通って宝箱を踏む
		const s = await snap(page);
		expect(s.opened, '宝箱が開いていない').toBe(true);
		expect(s.rupees - rupees0, '宝箱の中身').toBe(CHEST_CONTENT.value);
		expect(errors).toEqual([]);
	});
});
