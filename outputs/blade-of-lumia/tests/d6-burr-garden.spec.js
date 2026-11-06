// tests/d6-burr-garden.spec.js
// dungeon_6 `2,4`「大いが栗の庭」と新しい物「大いが栗 '¤'」の番人
// （2026-11-06 / PLAN 実行キュー 95 の4室目・盤面は `scripts/migrate-d6-2-4-burr-garden.mjs`）。
//
// 大いが栗の理屈（ユーザー判断）＝全身とげ＝手では押せない／丸い＝爆風で止まるまで転がる／重い実＝踏み板を押せる。
// 普通の石 '*' は爆風で動かない（全体のルールにすると既存の石の部屋が崩れる＝PLAN の監査）。
//
//      1 #B#.i......#     ← 宝箱 B(1,1)＝爆弾×5・碑 i(1,4)
//      2 #T#.....*..#     ← 門 T(2,1)／石 *(2,8)
//      3 #..t.......#     ← 木 t(3,3)＝北へ転がる栗の止め木
//      4 .......SS...     ← 踏み板 S(4,7)・S(4,8)
//      7 #..¤.......#     ← 大いが栗 ¤(7,3)
//
// 守るもの
//   ① データ：盤面・宝の中身・ソルバーで解ける／爆弾なし・石押しなしでは解けない。
//   ② 実機：栗は手で押せない（言われる）・石は押せる／爆風で栗は止まるまで転がる・普通の石は動かない／
//      通し（栗を北へ→石を奥の踏み板へ→栗を東へ＝石に当たって手前の踏み板で止まる→門→爆弾×5）／
//      石を置く前に栗を東へ転がすと踏み板を通り過ぎ、門は開かない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE, STONE_TILES } from '../shared/tiles.js';
import { ROWS, COLS, makeSolver } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';
import { LAYER, ROOM, TARGET, CHEST, GATE, BURR, STONE, BUTTONS, CHEST_CONTENTS } from '../scripts/migrate-d6-2-4-burr-garden.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const room = map.layers[LAYER].stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));

function solve(opts = {}) {
	const tiles = room.tiles.map((r) => (Array.isArray(r) ? [...r] : [...String(r)]));
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: false, hasCandle: true, noTools: false, ...opts });
	const starts = S.exitCells.map((cell) => { const [r, c] = cell.split(',').map(Number); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	const goal = (st) => { const f = st.split('|'); return f[0] === CHEST && f[5] === '1'; };
	return measureMetrics(S, starts, goal, () => 0, { guardMax: 4000000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
}

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 大いが栗の庭 ① データ', () => {
	test('盤面・宝箱の中身（爆弾×5＝補給）・大いが栗は石の仲間', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(STONE_TILES.has(TILE.BURR) && STONE_TILES.has(TILE.STONE), 'STONE_TILES に栗か石が無い').toBe(true);
	});

	test('ソルバー：解ける・入って詰まない／対照：爆弾なし・石を押さないと解けない', () => {
		const m = solve();
		expect(m.L, '解けない').not.toBeNull();
		expect(m.noEscape, '入って詰む状態がある').toBe(0);
		expect(solve({ noTools: true }).L, '爆弾なしで解ける＝栗が飾り').toBeNull();
		expect(solve({ noPush: true }).L, '石を押さずに解ける＝石が飾り').toBeNull();
	});
});

// ── ② 実機 ───────────────────────────────────────────────────────────
const GAME = '/blade-of-lumia/game/';
const url = (row, col) => `${GAME}?${new URLSearchParams({
	fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_bomb: '1',
})}`;
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url(row, col));
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	await page.evaluate(() => window.__game.step(2));
	return errors;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
// 石押しは実時間のクールダウン（STONE_PUSH_COOLDOWN_MS=600）＝1押しごとに待つ。
async function push(page, d) {
	await page.evaluate((dir) => { window.__game.movePlayer(dir); window.__game.step(1); }, d);
	await page.waitForTimeout(1000);
}
async function bomb(page) {
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bomb'; window.__game.useSubItem(); });
	await step(page, 30);   // 導火線 2 秒＝16 tick＋余り
}
const snap = (page) => page.evaluate(({ burr, stone, gate, chest }) => {
	const g = window.__game;
	const p = g.getPlayer();
	const ss = g.getStageState();
	const at = (k) => { const s = ss.stonePositions?.[k]; return s ? `${s.r},${s.c}` : k; };
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		burr: at(burr), stone: at(stone),
		gateOpen: [...(ss.openGates ?? [])].includes(gate),
		opened: [...(ss.openedChests ?? [])].includes(chest),
		bombs: p.subItems?.bomb?.count ?? 0,
	};
}, { burr: BURR, stone: STONE, gate: GATE, chest: CHEST });

test.describe('D6 大いが栗の庭 ② 実機', () => {
	test('栗は手で押せず言われる・石は手で押せる', async ({ page }) => {
		const errors = await boot(page, 8, 3);
		await push(page, 'up');                       // (8,3) から北の栗 (7,3) を押す
		let s = await snap(page);
		expect(s.burr, '栗が手で動いた').toBe(BURR);
		expect(s.pos, '栗のセルへ入り込んだ').toBe('8,3');
		await expect(page.locator('#msg-bar')).toContainText('とげが 痛くて 押せない');
		// 石：(1,8) から南へ押す
		await walk(page, 'right', 6);                 // → (8,9)
		await walk(page, 'up', 7);                    // → (1,9)
		await walk(page, 'left', 1);                  // → (1,8)
		await push(page, 'down');
		s = await snap(page);
		expect(s.stone, '石が手で押せない').toBe('3,8');
		expect(errors).toEqual([]);
	});

	test('爆風で栗は止まるまで転がる（木の手前で止まる）・普通の石は爆風で動かない', async ({ page }) => {
		const errors = await boot(page, 8, 3);
		await bomb(page);                             // 栗の南 (8,3)
		let s = await snap(page);
		expect(s.burr, '栗が北へ転がって木 (3,3) の手前で止まらない').toBe('4,3');
		// 対照：石 (2,8) の2マス西 (2,6) で爆弾＝同じ行・距離2（栗なら転がる位置）
		await walk(page, 'right', 3);                 // → (8,6)
		await walk(page, 'up', 6);                    // → (2,6)
		await bomb(page);
		s = await snap(page);
		expect(s.stone, '普通の石が爆風で動いた').toBe(STONE);
		expect(errors).toEqual([]);
	});

	test('通し：栗を北へ→石を奥の踏み板へ→栗を東へ＝手前の踏み板で止まり門が開き、宝箱で爆弾×5', async ({ page }) => {
		const errors = await boot(page, 8, 3);
		await page.evaluate(() => { window.__game.getPlayer().subItems.bomb.count = 2; });
		await bomb(page);                             // ① 栗を北へ（(4,3) で止まる）
		await walk(page, 'right', 6);                 // → (8,9)
		await walk(page, 'up', 7);                    // → (1,9)
		await walk(page, 'left', 1);                  // → (1,8)
		await push(page, 'down');                     // ② 石 (2,8)→(3,8)
		await push(page, 'down');                     //    石 (3,8)→(4,8)＝奥の踏み板
		let s = await snap(page);
		expect(s.stone, '石が奥の踏み板に乗っていない').toBe(BUTTONS[1]);
		expect(s.gateOpen, '踏み板1枚で門が開いた').toBe(false);
		// (3,8) → (3,4) → (5,4)→(5,2)→(4,2)：栗 (4,3) の西
		await walk(page, 'left', 4);                  // → (3,4)
		await walk(page, 'down', 2);                  // → (5,4)
		await walk(page, 'left', 2);                  // → (5,2)
		await walk(page, 'up', 1);                    // → (4,2)
		await bomb(page);                             // ③ 栗を東へ
		s = await snap(page);
		expect(s.burr, '栗が石に当たって手前の踏み板で止まらない').toBe(BUTTONS[0]);
		expect(s.gateOpen, '踏み板が2枚とも埋まったのに門が開かない').toBe(true);
		expect(s.bombs, '爆弾を2個使ったのに残りが0でない').toBe(0);
		// 門を抜けて宝箱へ：(4,2)→(3,2)→(3,1)→(2,1)→(1,1)
		await walk(page, 'up', 1);
		await walk(page, 'left', 1);
		await walk(page, 'up', 2);
		await step(page, 4);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toBe(true);
		expect(s.bombs, '宝箱で爆弾が5個にならない').toBe(5);
		expect(errors).toEqual([]);
	});

	test('石を置く前に栗を東へ転がすと踏み板を通り過ぎ、門は開かない', async ({ page }) => {
		const errors = await boot(page, 8, 3);
		await bomb(page);                             // 栗を北へ（(4,3)）
		await walk(page, 'left', 1);                  // → (8,2)
		await walk(page, 'up', 4);                    // → (4,2)
		await bomb(page);                             // 栗を東へ（止め木なし）
		const s = await snap(page);
		expect(s.burr, '栗が踏み板を通り過ぎて東の端まで転がらない').toBe('4,10');
		expect(s.gateOpen, '止め木なしで門が開いた').toBe(false);
		expect(errors).toEqual([]);
	});
});
