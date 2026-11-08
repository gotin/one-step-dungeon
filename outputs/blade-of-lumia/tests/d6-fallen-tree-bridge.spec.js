// tests/d6-fallen-tree-bridge.spec.js
// dungeon_6 `2,0`「枯れ森の淵」と新しい物「枯れ木 'ŧ'」の番人
// （2026-11-08 / PLAN 実行キュー 95 の10室目・盤面は `scripts/migrate-d6-2-0-fallen-tree-bridge.mjs`）。
//
// 枯れ木の規則＝爆風を受けると爆心と反対の向きへ倒れ、先の2マスに幹が横たわる。水の上の幹は橋＝歩ける。
// 根元は切り株＝歩ける。部屋を出ると立ち直る・セーブとロードでは戻らない。生きた木 't' は倒れない。
//
//      1 #~B~~~~~~~~#     ← 宝箱 B(1,2)＝爆弾×3
//      2 #~~.....~~~#     ← 北の中州
//      4 #~ŧ~~~~.~~~#     ← 枯れ木 W(4,2)（小島）
//      6 #..~ŧ~~.~~~#     ← 西の入江 (6,2)・枯れ木 E(6,4)
//      7 #..~.~~~~~~#     ← E の真南の岸 (7,4)
//
// 守るもの
//   ① データ：盤面・宝の中身・総当たりで爆弾1個／置き場は (6,2) だけ・ソルバー（倒す規則なし）では届かない。
//   ② 実機：通し（(6,2) で爆弾→E は東・W は北へ倒れる→橋を渡って宝箱→爆弾 +3）／誤り（E の真南で置くと
//      北へ倒れて東の中州へ渡れない）／入り直すと立ち直る／生きた木は爆風で倒れない（`2,4` の木）。
//   ③ セーブ：倒れた枯れ木はセーブとロードで残る（島で再開して取り残されない）・壊れた値は落とす。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { serializeStageState, deserializeStageState, createStageState, normalizeFallenTrees } from '../game/save.js';
import { LAYER, ROOM, TARGET, CHEST, TREE_W, TREE_E, SEAT, CHEST_CONTENTS, WATER, fallSearch } from '../scripts/migrate-d6-2-0-fallen-tree-bridge.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const room = map.layers[LAYER].stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 枯れ森の淵 ① データ', () => {
	test('盤面・宝箱の中身（爆弾×3）・水', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(Object.keys(room.bgTiles).sort()).toEqual([...WATER].sort());
	});

	test('総当たり：爆弾なしでは届かない・最少1個・置き場は (6,2) だけ', () => {
		const water = new Set(Object.keys(room.bgTiles));
		const S = fallSearch(room.tiles, water);
		expect(S.won(S.reach({})), '爆弾なしで宝箱の前に立てる＝枯れ木が飾り').toBe(false);
		expect(S.minBombs).toBe(1);
		expect(S.firstSeats.filter((f) => f.solves).map((f) => f.seat)).toEqual([SEAT]);
	});
});

// ── ② 実機 ───────────────────────────────────────────────────────────
const GAME = '/blade-of-lumia/game/';
const url = (stage, row, col) => `${GAME}?${new URLSearchParams({
	fromEditor: '1', layer: LAYER, stage, row: String(row), col: String(col), ps_weapon: '1', ps_bomb: '1',
})}`;
async function boot(page, row, col, stage = ROOM) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url(stage, row, col));
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
async function bomb(page) {
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bomb'; window.__game.useSubItem(); });
	await step(page, 30);   // 導火線 2 秒＝16 tick＋余り
}
const snap = (page) => page.evaluate((chest) => {
	const g = window.__game;
	const p = g.getPlayer();
	const ss = g.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		fallen: { ...(ss.fallenTrees ?? {}) },
		opened: [...(ss.openedChests ?? [])].includes(chest),
		bombs: p.subItems?.bomb?.count ?? 0,
		hp: p.hp,
	};
}, CHEST);

test.describe('D6 枯れ森の淵 ② 実機', () => {
	test('通し：(6,2) の爆弾で東の木は東・小島の木は北へ倒れ、橋を渡って宝箱で爆弾 +3', async ({ page }) => {
		const errors = await boot(page, 6, 2);
		// プレビューの爆弾は上限 8 で始まる＝+3 が頭打ちで見えない∴1個から始める（この部屋で使うのは1個）
		await page.evaluate(() => { window.__game.getPlayer().subItems.bomb.count = 1; });
		const s0 = await snap(page);
		await bomb(page);
		let s = await snap(page);
		expect(s.fallen, '倒れ方が違う').toEqual({ [TREE_W]: 'n', [TREE_E]: 'e' });
		expect(s.hp, '自分の爆弾で傷んだ').toBe(s0.hp);
		await expect(page.locator(`.cell[data-row="6"][data-col="5"] canvas`).first(), '幹の絵が無い').toBeVisible();
		// (6,2) → (8,2) → (8,4) → (7,4) → (6,4) 切り株 → (6,7) 中州 → (2,7) → (2,3) → (2,2) 幹 → 北の宝箱
		await walk(page, 'down', 2);
		await walk(page, 'right', 2);
		await walk(page, 'up', 2);
		expect((await snap(page)).pos, '切り株に立てない').toBe(TREE_E);
		await walk(page, 'right', 3);
		expect((await snap(page)).pos, '東の橋を渡れない').toBe('6,7');
		await walk(page, 'up', 4);
		await walk(page, 'left', 5);
		expect((await snap(page)).pos, '北の幹に乗れない').toBe('2,2');
		await walk(page, 'up', 1);
		await step(page, 4);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toBe(true);
		expect(s.bombs, '宝箱で爆弾が3個増えない').toBe(3);
		expect(errors).toEqual([]);
	});

	test('誤り：東の木の真南 (7,4) で置くと北へ倒れ、東の中州へ渡れない', async ({ page }) => {
		const errors = await boot(page, 7, 4);
		await bomb(page);
		const s = await snap(page);
		expect(s.fallen, '真南の爆風で北へ倒れない').toEqual({ [TREE_E]: 'n' });
		await walk(page, 'up', 1);                    // 切り株 (6,4)
		await walk(page, 'right', 2);                 // 東は水
		expect((await snap(page)).pos, '橋の無い水を渡れた').toBe(TREE_E);
		await walk(page, 'up', 2);                    // 北へ倒れた幹 (5,4)(4,4) の先は水
		expect((await snap(page)).pos, '北の幹の先端まで行けない').toBe('4,4');
		await walk(page, 'up', 1);
		expect((await snap(page)).pos, '幹の先の水へ出られた').toBe('4,4');
		expect(errors).toEqual([]);
	});

	test('倒した後に部屋を出て入り直すと、枯れ木は立ち直る', async ({ page }) => {
		await boot(page, 7, 4);
		await bomb(page);
		expect((await snap(page)).fallen, '失敗の状態が作れていない').toEqual({ [TREE_E]: 'n' });
		// (7,4) → (8,4) → (8,5) → 南の口から `2,1` へ出て、戻る
		await walk(page, 'down', 1);
		await walk(page, 'right', 1);
		await page.evaluate(() => window.__game.resume?.());
		for (let i = 0; i < 20 && (await page.evaluate(() => window.__game.getState().stageKey)) === ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('down'));
			await page.waitForTimeout(100);
		}
		await page.waitForFunction(() => window.__game.getState().stageKey === '2,1', null, { timeout: 5000 });
		for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.getState().stageKey)) !== ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('up'));
			await page.waitForTimeout(150);
		}
		await page.waitForFunction((rm) => window.__game.getState().stageKey === rm, ROOM, { timeout: 5000 });
		expect((await snap(page)).fallen, '入り直しても枯れ木が倒れたまま＝やり直せない').toEqual({});
	});

	test('生きた木 t は爆風で倒れない（`2,4` の木 (3,3) の真南で爆弾）', async ({ page }) => {
		const errors = await boot(page, 4, 4, '2,4');
		await walk(page, 'left', 1);                  // (4,3)＝木 (3,3) の真南
		await bomb(page);
		const fallen = await page.evaluate(() => ({ ...(window.__game.getStageState().fallenTrees ?? {}) }));
		expect(fallen, '生きた木が倒れた').toEqual({});
		expect(map.layers[LAYER].stages['2,4'].tiles[3][3], '前提：(3,3) が生きた木').toBe(TILE.TREE);
		await walk(page, 'up', 1);                    // 木 (3,3) へは入れない＝立ったまま
		expect((await snap(page)).pos, '生きた木のセルへ入れた').toBe('4,3');
		expect(errors).toEqual([]);
	});
});

// ── ③ セーブ ─────────────────────────────────────────────────────────
test.describe('枯れ木 ③ セーブ', () => {
	test('倒れた枯れ木はセーブとロードで残る（石と違って戻さない）', () => {
		const ss = createStageState();
		ss.fallenTrees = { [TREE_W]: 'n', [TREE_E]: 'e' };
		ss.stonePositions = { '7,3': { r: 4, c: 3 } };
		const back = deserializeStageState(JSON.parse(JSON.stringify(serializeStageState({ [`${LAYER}:${ROOM}`]: ss }))));
		expect(back[`${LAYER}:${ROOM}`].fallenTrees).toEqual({ [TREE_W]: 'n', [TREE_E]: 'e' });
		expect(back[`${LAYER}:${ROOM}`].stonePositions, '対照：石はロードで戻る').toEqual({});
	});

	test('壊れた値（向きでない・座標でない・配列）は落とす', () => {
		expect(normalizeFallenTrees({ '4,2': 'n', '6,4': 'x', foo: 'e', '1,1': 3 })).toEqual({ '4,2': 'n' });
		expect(normalizeFallenTrees(['4,2'])).toEqual({});
		expect(normalizeFallenTrees(null)).toEqual({});
	});
});
