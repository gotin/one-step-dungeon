// tests/d1-window-shrine.spec.js
// dungeon_1 `0,2`（入口側 `1,2` とボス前 `0,1` の間の脇道）「門の窓の祠」の番人
// （2026-10-12 / PLAN 実行キュー 47 の第1陣 2室目・盤面は `scripts/migrate-d1-0-2-window-shrine.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間の隅に宝箱が1つあるだけ（キュー21 の F6）。どちらの口から入っても拾って抜けるだけ。
//
// 新しい盤面（門で東の前室と北の側に分ける）:
//      3 #..##...#i.#   ← (3,9) 門の立札
//      4 #..#B...T...   ← 祠の宝箱 (4,4)・門 (4,8)・東の口
//      5 #..#Y...#...   ← 祠のスイッチ (5,4)
//   東から来ると門の向こうに宝箱とスイッチが見えるが届かない。`1,1 → 0,1` を回って北から入るのが答え。
//
// 守るものは2つ。
//   ① データ：盤面・宝箱・立札・link・ソルバー（東からは剣でも道具でも届かない／北からは届く／対照）・層の接続。
//   ② 挙動（実機）：東の前室からは剣を振っても門は開かず通れない／北の側でスイッチを叩くと門が開き、
//      宝箱を開けて東の口まで抜けられる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import {
	TARGET, EXITS, CHEST, SWITCH, GATE, WINDOW_STAND, SIGN, SIGN_DATA, LINKS, CHEST_CONTENT,
	NORTH_TO_CHEST, NORTH_TO_EAST, reach, solveRoom,
} from '../scripts/migrate-d1-0-2-window-shrine.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_1';
const ROOM = '0,2';
const stages = map.layers[LAYER].stages;

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D1 0,2 門の窓の祠 ① データ', () => {
	test('盤面・宝箱（条件なし）・立札・link・敵が居ない', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: CHEST_CONTENT });
		expect(Object.keys(st.showConditions ?? {}), '宝箱に出現条件が付いた（初めから見えているはず）').toEqual([]);
		expect(st.signData).toEqual({ [SIGN]: SIGN_DATA });
		expect(st.links).toEqual(LINKS);
		expect([...rowsOf(st).join('')].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
	});

	test('門を閉じたまま、東の前室と北の側は歩いてつながらず、宝箱とスイッチの立ち位置は北の側にだけある', () => {
		const t = rowsOf(stages[ROOM]).map((r) => [...r]);
		const east = reach(t, EXITS.east[0]);
		const north = reach(t, EXITS.north[0]);
		expect(EXITS.north.some((k) => east.has(k)), '東から北の口へ歩けた').toBe(false);
		expect(east.has(WINDOW_STAND), '東の前室から門の正面に立てない').toBe(true);
		expect(north.has('4,5'), '北の側から宝箱の東に立てない').toBe(true);
		expect(north.has('5,5'), '北の側からスイッチの東に立てない').toBe(true);
		expect(east.has('4,5') || east.has('5,5'), '東の前室から祠の前に立てた').toBe(false);
	});

	test('ソルバー：東からは剣でも道具でも届かない・北からは届く', () => {
		const t = rowsOf(stages[ROOM]);
		expect(solveRoom({ board: t, from: EXITS.east, goal: CHEST }).L, '東から剣だけで宝箱へ届いた').toBe(null);
		expect(solveRoom({ board: t, from: EXITS.east, goal: CHEST, noTools: false }).L, '東から道具で宝箱へ届いた（窓越しにスイッチが当たる）').toBe(null);
		expect(solveRoom({ board: t, from: EXITS.east, goal: EXITS.north }).L, '東から北の口へ抜けられた').toBe(null);
		const toChest = solveRoom({ board: t, from: EXITS.north, goal: CHEST });
		expect(toChest.L, '北の口から宝箱まで').toBe(NORTH_TO_CHEST);
		expect(toChest.noEscape, '北から入って詰む状態').toBe(0);
		const through = solveRoom({ board: t, from: EXITS.north, goal: EXITS.east });
		expect(through.L, '北の口からスイッチを叩いて東の口まで').toBe(NORTH_TO_EAST);
		expect(through.noEscape, '北から入って詰む状態').toBe(0);
	});

	test('対照：スイッチを床にすると北から東へ抜けられない（門は link でしか開かない）', () => {
		const [r, c] = SWITCH.split(',').map(Number);
		const board = TARGET.map((row, i) => (i === r ? row.slice(0, c) + '.' + row.slice(c + 1) : row));
		expect(solveRoom({ board, from: EXITS.north, goal: EXITS.east }).L).toBe(null);
	});

	test('層の接続：門を閉じたままでも到達室は書き換え前と同じ・dead-edge 0', () => {
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
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1' });   // 剣を持たせる（無いと東の前室の「振っても開かない」が歯を持たない）
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
const swing = (page) => page.evaluate(() => { window.__game.swordAttack(); window.__game.step(3); });
const snap = (page) => page.evaluate(({ sw, gate, chest }) => {
	const g = window.__game;
	const p = g.getPlayer();
	const ss = g.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		switchOn: [...(ss.switchToggles ?? [])].includes(sw),
		gateOpen: [...(ss.openGates ?? [])].includes(gate),
		opened: [...(ss.openedChests ?? [])].includes(chest),
		rupees: p.rupees,
		stage: g.getState().stageKey,
	};
}, { sw: SWITCH, gate: GATE, chest: CHEST });

test.describe('D1 0,2 門の窓の祠 ② 挙動（実機）', () => {
	test('東の前室から門の前で剣を振っても門は開かず、西へは進めない', async ({ page }) => {
		const errors = await boot(page, 4, 10);
		await walk(page, 'left', 3);
		const s0 = await snap(page);
		expect(s0.pos, '門の正面で止まっていない（門を抜けた）').toBe(WINDOW_STAND);
		await swing(page);
		const s = await snap(page);
		expect(s.switchOn, '東からスイッチが入った').toBe(false);
		expect(s.gateOpen, '東から門が開いた').toBe(false);
		await walk(page, 'left', 2);
		expect((await snap(page)).pos, '閉じた門を抜けた').toBe(WINDOW_STAND);
		expect(errors).toEqual([]);
	});

	test('北の側でスイッチを叩くと門が開き、宝箱を開けて東の口まで抜けられる', async ({ page }) => {
		const errors = await boot(page, 5, 5);
		const rupees0 = (await snap(page)).rupees;
		// 左を向く（半マスだけ寄る＝スイッチ 'Y' は踏める床なので1マス歩くと上に乗ってしまう）
		await page.evaluate(() => { window.__game.movePlayer('left'); window.__game.step(1); });
		await swing(page);
		const s1 = await snap(page);
		expect(s1.switchOn, 'スイッチが入っていない').toBe(true);
		expect(s1.gateOpen, '門が開いていない').toBe(true);
		await page.evaluate(() => { window.__game.movePlayer('right'); window.__game.step(1); });
		expect((await snap(page)).pos, 'スイッチの東へ戻っていない').toBe('5,5');
		await walk(page, 'up', 1); await walk(page, 'left', 1);   // 宝箱を踏む
		const s2 = await snap(page);
		expect(s2.opened, '宝箱が開いていない').toBe(true);
		expect(s2.rupees - rupees0, '宝箱の中身').toBe(CHEST_CONTENT.value);
		await walk(page, 'right', 9);   // 門を抜けて東の口から `1,2` へ（遷移は非同期＝待つ）
		await page.waitForFunction(() => window.__game.getState().stageKey === '1,2', null, { timeout: 5000 });
		expect(errors).toEqual([]);
	});
});
