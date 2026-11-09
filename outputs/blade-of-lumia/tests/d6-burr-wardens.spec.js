// tests/d6-burr-wardens.spec.js
// dungeon_6 `2,1`「栗番の辻」の番人
// （2026-11-07 / PLAN 実行キュー 95 の6室目・盤面は `scripts/migrate-d6-2-1-burr-wardens.mjs`）。
//
// 既存の事実＝転がる大いが栗は、敵の立つセルの手前で止まる（エンジン変更なし）。
// 持ち場を動かない槍衛（enemyHold）を止め木に使い、倒すと止め木が消える。
//
//      2 #SF.¤..¤SF.#     ← 西の溝＝踏み板 S(2,1)・槍衛 F(2,2)・栗 ¤(2,4)
//                            東の溝＝栗 ¤(2,7)・踏み板 S(2,8)・槍衛 F(2,9)
//      7 #...i....#B#     ← 宝箱 B(7,10)＝ルピー×100（キュー100 で増額）
//      8 #.t......T.#     ← 門 T(8,9)＝踏み板が2枚とも埋まると開く
//
// 守るもの
//   ① データ：盤面・宝の中身・持ち場と入り直し／ソルバー（槍衛＝生きていれば壁）で西だけ倒すと解け、
//      他の3通りでは解けない。
//   ② 実機：西を矢で倒し（矢は栗を越えて届く）通路に爆弾1個＝2枚埋まって門が開き +50／
//      倒さずに置くと西の栗は番兵の手前で止まる／東を倒すと東の栗は踏み板を通り過ぎる／
//      矢を当てても番兵は持ち場を動かない／失敗しても入り直すと栗も番兵も戻る／
//      槍は北の通路にだけ来る（東西の通り道には来ない）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ROWS, COLS, makeSolver } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';
import {
	LAYER, ROOM, TARGET, CHEST, GATE, WARDEN_W, WARDEN_E, BURR_W, BURR_E, PLATE_W, PLATE_E, CHEST_CONTENTS,
} from '../scripts/migrate-d6-2-1-burr-wardens.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const room = map.layers[LAYER].stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));

// 槍衛＝生きていれば壁（止め木）・倒せば床
function solve({ wAlive, eAlive }) {
	const tiles = room.tiles.map((r) => (Array.isArray(r) ? [...r] : [...String(r)]));
	const put = (k, alive) => { const [r, c] = k.split(',').map(Number); tiles[r][c] = alive ? TILE.WALL : TILE.FLOOR; };
	put(WARDEN_W, wAlive); put(WARDEN_E, eAlive);
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: false, hasCandle: true, noTools: false });
	const starts = S.exitCells.map((cell) => { const [r, c] = cell.split(',').map(Number); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	const goal = (st) => { const f = st.split('|'); return f[0] === CHEST && f[5] === '1'; };
	return measureMetrics(S, starts, goal, () => 0, { guardMax: 4000000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
}

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 栗番の辻 ① データ', () => {
	test('盤面・宝箱の中身・番兵は持ち場を動かず入り直すと戻る', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(room.enemyHold, '番兵の持ち場').toEqual({ [WARDEN_W]: true, [WARDEN_E]: true });
		expect(room.enemiesRespawn, '入り直しで番兵が戻らない＝止め木を失うと詰む').toBe(true);
	});

	test('ソルバー：西だけ倒すと解け入って詰まない／両方生かす・東だけ倒す・両方倒すでは解けない', () => {
		const m = solve({ wAlive: false, eAlive: true });
		expect(m.L, '西だけ倒しても解けない').not.toBeNull();
		expect(m.noEscape, '入って詰む状態がある').toBe(0);
		expect(solve({ wAlive: true, eAlive: true }).L, '両方生かしても解ける＝西の番兵が飾り').toBeNull();
		expect(solve({ wAlive: true, eAlive: false }).L, '東だけ倒して解ける').toBeNull();
		expect(solve({ wAlive: false, eAlive: false }).L, '両方倒しても解ける＝東の番兵が止め木でない').toBeNull();
	});
});

// ── ② 実機 ───────────────────────────────────────────────────────────
const GAME = '/blade-of-lumia/game/';
const url = (row, col) => `${GAME}?${new URLSearchParams({
	fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
	ps_weapon: '1', ps_bomb: '1', ps_bow: '1', ps_hearts: '10', ps_rupees: '100',
})}`;
async function boot(page, row, col, { noGod = false } = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url(row, col));
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 2);
	// プレビューは既定で無敵＝被弾を測る回は G で切る
	if (noGod) await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	await page.evaluate(() => window.__game.step(2));
	return errors;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
// 向きを変えるだけ（栗に押しつける＝栗は手で動かない）
const face = (page, d) => page.evaluate((dir) => { window.__game.movePlayer(dir); window.__game.step(1); }, d);
// 本物の弓で、敵が1体減るまで射る（矢は 1 本ごとに満タンへ戻す）
const shootUntilOneFalls = (page) => page.evaluate(() => {
	const g = window.__game; const n0 = g.getEnemies().length;
	for (let i = 0; i < 20 && g.getEnemies().length === n0; i++) {
		const p = g.getPlayer(); p.activeSubItem = 'bow'; p.subItems.bow.count = 8; g.useSubItem(); g.step(12);
	}
	return g.getEnemies().length;
});
async function bomb(page) {
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bomb'; window.__game.useSubItem(); });
	await step(page, 30);   // 導火線 2 秒＝16 tick＋余り
}
const snap = (page) => page.evaluate(({ bw, be, gate, chest }) => {
	const g = window.__game;
	const p = g.getPlayer();
	const ss = g.getStageState();
	const at = (k) => { const s = ss.stonePositions?.[k]; return s ? `${s.r},${s.c}` : k; };
	return {
		burrW: at(bw), burrE: at(be),
		gateOpen: [...(ss.openGates ?? [])].includes(gate),
		opened: [...(ss.openedChests ?? [])].includes(chest),
		wardens: g.getEnemies().map((e) => `${Math.round(e.y)},${Math.round(e.x)}`).sort(),
		rupees: g.getState().player.rupees,
	};
}, { bw: BURR_W, be: BURR_E, gate: GATE, chest: CHEST });

test.describe('D6 栗番の辻 ② 実機', () => {
	test('通し：西の番兵を矢で倒し、通路に爆弾1個＝両方の栗が踏み板で止まり門が開き、宝箱で +50', async ({ page }) => {
		const errors = await boot(page, 2, 5);
		await face(page, 'left');
		expect(await shootUntilOneFalls(page), '矢が栗を越えて西の番兵に届かない').toBe(1);
		let s = await snap(page);
		expect(s.wardens, '倒れたのが西の番兵でない').toEqual([WARDEN_E]);
		await bomb(page);
		s = await snap(page);
		expect(s.burrW, '西の栗が外周の手前の踏み板まで転がらない').toBe(PLATE_W);
		expect(s.burrE, '東の栗が番兵に当たって踏み板で止まらない').toBe(PLATE_E);
		expect(s.gateOpen, '踏み板が2枚とも埋まったのに門が開かない').toBe(true);
		// 門を抜けて宝箱へ：(2,5)→(8,5)→(8,10)→↑(7,10)
		await walk(page, 'down', 6);
		await walk(page, 'right', 5);
		await walk(page, 'up', 1);
		await step(page, 4);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toBe(true);
		expect(s.rupees, '宝箱でルピーが +100 にならない').toBe(200);
		expect(errors).toEqual([]);
	});

	test('番兵を倒さずに置くと、西の栗は番兵の手前で止まり門は開かない', async ({ page }) => {
		const errors = await boot(page, 2, 6);
		await bomb(page);
		const s = await snap(page);
		expect(s.burrW, '西の栗が番兵の手前 (2,3) で止まらない').toBe('2,3');
		expect(s.burrE, '東の栗が踏み板で止まらない').toBe(PLATE_E);
		expect(s.gateOpen, '西の踏み板が空なのに門が開いた').toBe(false);
		expect(s.wardens, '通路の爆風が番兵に届いた').toEqual([WARDEN_W, WARDEN_E].sort());
		expect(errors).toEqual([]);
	});

	test('東の番兵を倒すと、東の栗は踏み板を通り過ぎ門は開かない', async ({ page }) => {
		const errors = await boot(page, 2, 6);
		await face(page, 'right');
		expect(await shootUntilOneFalls(page), '矢が栗を越えて東の番兵に届かない').toBe(1);
		await bomb(page);
		const s = await snap(page);
		expect(s.burrE, '止め木が無いのに東の栗が踏み板で止まった').toBe('2,10');
		expect(s.gateOpen, '東の踏み板が空なのに門が開いた').toBe(false);
		expect(errors).toEqual([]);
	});

	test('矢を当てても番兵は持ち場を動かない（ノックバックで止め木がずれない）', async ({ page }) => {
		const errors = await boot(page, 2, 6);
		await face(page, 'right');
		await page.evaluate(() => { const g = window.__game; g.getPlayer().activeSubItem = 'bow'; g.useSubItem(); g.step(40); });
		const hp = await page.evaluate(() => window.__game.getEnemies().map((e) => e.hp));
		expect(Math.min(...hp), '矢が当たっていない（対照が空虚）').toBeLessThan(12);
		const s = await snap(page);
		expect(s.wardens, '矢を受けた番兵が持ち場からずれた').toEqual([WARDEN_W, WARDEN_E].sort());
		expect(errors).toEqual([]);
	});

	test('東を倒して失敗しても、部屋を出て入り直すと栗も番兵も戻る', async ({ page }) => {
		await boot(page, 2, 6);
		await page.evaluate((we) => {
			const g = window.__game;
			const e = g.getEnemies().find((x) => `${Math.round(x.y)},${Math.round(x.x)}` === we);
			g.dealDamage(e.id, 99, 'sword'); g.step(4);
		}, WARDEN_E);
		await bomb(page);
		expect((await snap(page)).burrE, '失敗の状態が作れていない').toBe('2,10');
		// (2,6) → (4,6) → 西の口から `1,1` へ出て、戻る
		await walk(page, 'down', 2);
		await page.evaluate(() => window.__game.resume?.());
		for (let i = 0; i < 20 && (await page.evaluate(() => window.__game.getState().stageKey)) === ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('left'));
			await page.waitForTimeout(100);
		}
		await page.waitForFunction(() => window.__game.getState().stageKey === '1,1', null, { timeout: 5000 });
		for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.getState().stageKey)) !== ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('right'));
			await page.waitForTimeout(150);
		}
		await page.waitForFunction((rm) => window.__game.getState().stageKey === rm, ROOM, { timeout: 5000 });
		await page.waitForFunction(() => window.__game.getEnemies().length === 2, null, { timeout: 3000 });
		const s = await snap(page);
		expect(s.wardens, '入り直しても番兵が戻らない').toEqual([WARDEN_W, WARDEN_E].sort());
		expect([s.burrW, s.burrE], '入り直しても栗が元の位置に戻らない').toEqual([BURR_W, BURR_E]);
	});

	test('槍は北の通路にだけ来る（東西の通り道の行4〜5には来ない）', async ({ page }) => {
		const hitsAt = async (row, col) => {
			await boot(page, row, col, { noGod: true });
			return page.evaluate(() => {
				const g = window.__game; const hp = () => g.getState().player.hp;
				const h0 = hp(); g.step(80); return h0 - hp();
			});
		};
		expect(await hitsAt(2, 5), '北の通路で槍が来ない＝圧が無い').toBeGreaterThan(0);
		for (const [r, c] of [[4, 2], [5, 2], [4, 9], [5, 9], [4, 5]]) {
			expect(await hitsAt(r, c), `東西の通り道 (${r},${c}) に槍が来た`).toBe(0);
		}
	});
});
