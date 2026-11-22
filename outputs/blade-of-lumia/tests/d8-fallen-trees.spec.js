// tests/d8-fallen-trees.spec.js
// dungeon_8 `4,4`＝倒木の渡し（パズルの部屋）の番人。
//
// 経緯：キュー112（2026-11-21・`scripts/migrate-d8-4-4-fallen-trees.mjs`）。主題はユーザー選択「倒木の渡し」＝
// D6 の枯れ木（爆風で爆心と反対へ倒れ、水の上に2マスの橋）を沼で使い直す。枯れ木5本・爆弾4個・はしごの一手。
//
// 守るもの：
// ① 盤面・沼の下地・枯れ木・宝箱（いつも見える）・敵なし
// ② 総当たり：爆弾 4・1手目は (3,2) だけ・罠あり・はしご無しでは解けない・道の木4本は要る・B ははしごの一手を作る
// ③ 実機：解をなぞると木が狙いどおりに倒れ、幹と切り株とはしごで宝箱へ渡れてルピー +100
// ④ 実機：罠＝北の岸 (1,4) で置くと B が南へ倒れる（東への橋にならない）
// ⑤ 実機：床の爆弾×5 は、部屋を出て入り直すと倒れた木と一緒に戻る（restockFloorItems・2026-11-21 ユーザー提案）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import {
	AFTER, WATER, TREES, CHEST, CONTENT, DESIGN, FIRST_SEAT, MIN_BOMBS, BLOCKER, fallSearch,
} from '../scripts/migrate-d8-4-4-fallen-trees.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dungeon_8';
const ROOM = '4,4';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const without = (t) => { const [r, c] = t.split(',').map(Number); return DESIGN.map((row, i) => (i === r ? row.slice(0, c) + '~' + row.slice(c + 1) : row)); };

test.describe('Blade of Lumia – D8 倒木の渡し（キュー112）', () => {
	test('① 盤面・沼・枯れ木・宝箱・敵なし', () => {
		const g = rowsOf(st);
		expect(g, '4,4 の盤面').toEqual(AFTER);
		expect(Object.keys(st.bgTiles).sort(), '沼（bgTiles）').toEqual([...WATER].sort());
		expect(TREES.every((k) => { const [r, c] = k.split(',').map(Number); return g[r][c] === TILE.DEAD_TREE; }), '枯れ木5本').toBe(true);
		expect(st.chestContents[CHEST], '中身').toEqual(CONTENT);
		expect(st.showConditions ?? {}, '宝箱はいつも見える').toEqual({});
		expect(g.some((row) => [...row].some((ch) => ENEMY_META[ch])), '敵を置かない').toBe(false);
	});

	test('② 総当たり：爆弾 4・1手目は1か所・罠あり・はしごが要る・道の木は要る', () => {
		const S = fallSearch(DESIGN);
		expect(S.won0, '爆弾なしで届く').toBe(false);
		expect(S.minBombs, '最少の爆弾').toBe(MIN_BOMBS);
		expect(S.firstSeats.filter((f) => f.solves).map((f) => f.seat), '1手目で解ける置き場').toEqual([FIRST_SEAT]);
		expect(S.firstSeats.filter((f) => !f.solves).length, '1手目の罠').toBeGreaterThan(0);
		expect(S.deadlocks, '詰む状態').toBeGreaterThan(0);
		expect(S.noEscape, '口へ戻れない状態').toBe(0);
		expect(fallSearch(DESIGN, { ladder: false }).solvableStart, 'はしご無しで解ける').toBe(false);
		for (const t of TREES.filter((x) => x !== BLOCKER)) expect(fallSearch(without(t)).solvableStart, `枯れ木 ${t} 無しで解ける`).toBe(false);
		expect(fallSearch(without(BLOCKER), { ladder: false }).solvableStart, '対照：B が無ければはしご無しで解ける').toBe(true);
	});
});

const url = (row, col) => `/blade-of-lumia/game/?${new URLSearchParams({
	fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
	ps_hearts: '13', ps_sword: '0', ps_shield: '1', ps_armor: '0', ps_bomb: '1', ps_ladder: '1',
})}`;
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url(row, col));
	await waitForBoard(page);
	await page.evaluate(() => { window.__game.pause(); window.__game.step(2); });
	return errors;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
async function bomb(page) {
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bomb'; window.__game.useSubItem(); });
	await step(page, 30);   // 導火線 2 秒＋余り
}
async function dismissDialog(page) {
	for (let i = 0; i < 8; i++) {
		if (!(await page.evaluate(() => window.__game.getState().isDialog))) return;
		await page.keyboard.press('z');
		await page.waitForTimeout(60);
	}
	expect(await page.evaluate(() => window.__game.getState().isDialog), 'ダイアログが閉じない').toBe(false);
}
const snap = (page) => page.evaluate(() => {
	const g = window.__game; const p = g.getPlayer();
	return { pos: `${p.y},${p.x}`, fallen: { ...(g.getStageState().fallenTrees ?? {}) }, rupees: p.rupees };
});

test.describe('Blade of Lumia – D8 倒木の渡しは実機で解ける（キュー112）', () => {
	test('③ 解をなぞると木が狙いどおりに倒れ、幹と切り株とはしごで宝箱へ渡れる', async ({ page }) => {
		test.setTimeout(60_000);
		const errors = await boot(page, 3, 2);
		const r0 = (await snap(page)).rupees;
		// ① 西の岸 (3,2)：A は B に塞がれて倒れない・B が東へ
		await bomb(page);
		expect((await snap(page)).fallen, '① の倒れ方').toEqual({ '3,4': 'e' });
		// ② 北の岸 (1,4) からはしごで (2,4) を渡り、B の切り株 (3,4) → 幹 (3,5)
		await walk(page, 'up', 2); await walk(page, 'right', 2);
		expect((await snap(page)).pos, '北の岸 (1,4)').toBe('1,4');
		await walk(page, 'down', 2);
		expect((await snap(page)).pos, 'はしごで B の切り株へ渡れない').toBe('3,4');
		await walk(page, 'right', 1);
		await bomb(page);
		expect((await snap(page)).fallen, '② の倒れ方（A は西・C は南）').toEqual({ '3,4': 'e', '3,3': 'w', '4,5': 's' });
		// ③ A の切り株 (3,3)：D が南へ
		await walk(page, 'left', 2);
		expect((await snap(page)).pos, 'A の切り株').toBe('3,3');
		await bomb(page);
		expect((await snap(page)).fallen['5,3'], '③ D が南へ倒れない').toBe('s');
		// ④ 西の岸 → D の切り株 (5,3) → 幹の先 (7,3)：E が東へ
		await walk(page, 'left', 1); await walk(page, 'down', 2); await walk(page, 'right', 1); await walk(page, 'down', 2);
		expect((await snap(page)).pos, 'D の幹の先 (7,3)').toBe('7,3');
		await bomb(page);
		expect((await snap(page)).fallen['7,5'], '④ E が東へ倒れない').toBe('e');
		// ⑤ C の幹を伝って宝箱の前 (7,6) へ：(7,3)→(5,3)→(5,2)→(3,2)→(1,2)→(1,4)→はしご→(3,4)→(3,5)→(7,5)→(7,6)
		await walk(page, 'up', 2); await walk(page, 'left', 1); await walk(page, 'up', 4); await walk(page, 'right', 2);
		await walk(page, 'down', 2); await walk(page, 'right', 1);
		expect((await snap(page)).pos, 'B の幹 (3,5) へ戻れない').toBe('3,5');
		await walk(page, 'down', 4);
		expect((await snap(page)).pos, 'C の幹から E の切り株 (7,5) へ渡れない').toBe('7,5');
		await walk(page, 'right', 1);
		expect((await snap(page)).pos, 'E の幹 (7,6)').toBe('7,6');
		await walk(page, 'down', 1); await step(page, 5);
		expect((await snap(page)).rupees - r0, 'ルピー×100 を拾えていない').toBe(100);
		expect(errors, errors.join('\n')).toEqual([]);
	});

	test('④ 罠：北の岸 (1,4) で置くと B は南へ倒れる', async ({ page }) => {
		await boot(page, 1, 4);
		await bomb(page);
		expect((await snap(page)).fallen, '北の岸の爆風').toEqual({ '3,4': 's' });
	});

	test('⑤ 床の爆弾は、部屋を出て入り直すと倒れた木と一緒に戻る', async ({ page }) => {
		test.setTimeout(60_000);
		const errors = await boot(page, 5, 1);
		const bombs = () => page.evaluate(() => window.__game.getPlayer().subItems?.bomb?.count ?? 0);
		const setBombs = (n) => page.evaluate((k) => { window.__game.getPlayer().subItems.bomb.count = k; }, n);
		// 罠を1つ踏む：(5,2) で置くと D が東へ倒れる
		await walk(page, 'right', 1);
		await bomb(page);
		expect((await snap(page)).fallen, '前提：D が東へ倒れた').toEqual({ '5,3': 'e' });
		// 爆弾を使い切った体で、床の爆弾 (6,1) を拾う
		await setBombs(0);
		await walk(page, 'left', 1); await walk(page, 'down', 1); await step(page, 2);
		await dismissDialog(page);   // 初めて床の爆弾を拾うと道具の案内が出る
		expect(await bombs(), '床の爆弾×5 を拾えない').toBe(5);
		// 西の口から出て、入り直す
		// 西の口の行 (5,1) へ戻る（半マス単位で、ちょうど行5に揃うまで）
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 6 && g.getPlayer().y !== 5; i++) { g.movePlayer('up'); g.step(1); } });
		expect((await snap(page)).pos, '西の口の着地').toBe('5,1');
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 4; i++) { g.movePlayer('left'); g.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '3,4', null, { timeout: 5000 });
		await page.evaluate(() => { const g = window.__game; g.step(3); for (let i = 0; i < 3; i++) { g.movePlayer('right'); g.step(1); } });
		await page.waitForFunction((rm) => window.__game.getState().stageKey === rm, ROOM, { timeout: 5000 });
		await step(page, 3);
		expect((await snap(page)).fallen, '入り直しても木が立ち直らない').toEqual({});
		await setBombs(0);
		// 着地は口の段 (5,0)＝1マス東へ出てから南の床の爆弾 (6,1) へ
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 4 && g.getPlayer().x < 1; i++) { g.movePlayer('right'); g.step(1); } for (let i = 0; i < 6 && g.getPlayer().y < 6; i++) { g.movePlayer('down'); g.step(1); } });
		await step(page, 2);
		expect(await bombs(), '入り直しても床の爆弾が戻らない').toBe(5);
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
