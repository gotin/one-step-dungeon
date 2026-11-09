// tests/d6-roast-burr-pool.spec.js
// dungeon_6 `3,2`「焼き栗の淵」と「火に触れた大いが栗は爆ぜる」規則の番人
// （2026-11-07 / PLAN 実行キュー 95 の7室目・盤面は `scripts/migrate-d6-3-2-roast-burr-pool.mjs`）。
//
//      1 #.m.......B#     ← 宝箱 B(1,10)＝根が崩れると現れる（wallBroken）
//      4 ..~~!~.¤H...     ← 朽ちた根 !(4,4)・岬の先 (4,6)・大いが栗 ¤(4,7)・かがり火 H(4,8)・東の岸 (4,9)
//
// 守るもの
//   ① データ：盤面・水・宝の中身と出る条件・壊せる壁1枚。
//   ② 実機：通し（東の岸で爆弾＝栗が岬の先へ→かがり火を灯す→火の付いたブーメランで栗が爆ぜ、根が崩れて
//      宝箱 +50・勇者は無傷）／転がす前に火を運ぶと栗は付け根で爆ぜ根は無傷（その後の爆弾は何も動かさない）
//      ／爆弾の爆風は栗を爆ぜさせない／火の無いブーメランでは爆ぜない／入り直すと栗は戻り、かがり火は
//      灯ったまま。
//   ③ 規則（別の部屋）：ロウソクを栗に向けると爆ぜる（`2,4` 大いが栗の庭）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import {
	LAYER, ROOM, TARGET, WATER, CHEST, ROOT, BURR, TIP, TORCH, CHEST_CONTENTS, SHOW,
} from '../scripts/migrate-d6-3-2-roast-burr-pool.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const room = map.layers[LAYER].stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 焼き栗の淵 ① データ', () => {
	test('盤面・水・宝箱の中身と出る条件・壊せる壁は根の1枚', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(Object.keys(room.bgTiles ?? {}).sort()).toEqual([...WATER].sort());
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(room.showConditions).toEqual(SHOW);
		expect(room.breakableWalls).toEqual({ [ROOT]: { breakDef: 1 } });
		expect(room.initLitTorches, 'かがり火が初めから灯っている＝ロウソクの手が要らない').toBeUndefined();
	});
});

// ── ② 実機 ───────────────────────────────────────────────────────────
const GAME = '/blade-of-lumia/game/';
const url = (layer, stage, row, col) => `${GAME}?${new URLSearchParams({
	fromEditor: '1', layer, stage, row: String(row), col: String(col),
	ps_weapon: '1', ps_bomb: '1', ps_candle: '1', ps_boomerang: '1', ps_hearts: '10', ps_rupees: '100',
})}`;
async function boot(page, { layer = LAYER, stage = ROOM, row = 4, col = 9, noGod = false } = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url(layer, stage, row, col));
	await waitForBoard(page);
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
// 向きを変えるだけ（目の前がかがり火＝動かない）
const face = (page, d) => page.evaluate((dir) => { window.__game.movePlayer(dir); window.__game.step(1); }, d);
const use = (page, id, ticks) => page.evaluate(({ id, ticks }) => {
	const g = window.__game; g.getPlayer().activeSubItem = id; g.useSubItem(); g.step(ticks);
}, { id, ticks });
const bomb = (page) => use(page, 'bomb', 30);              // 導火線 2 秒＝16 tick＋余り
const candle = (page) => use(page, 'candle', 2);
const boomerang = (page) => use(page, 'boomerang', 60);    // 往復して手元へ戻るまで
const snap = (page) => page.evaluate(({ burr, root, chest, torch }) => {
	const g = window.__game;
	const ss = g.getStageState();
	const st = ss.stonePositions?.[burr];
	return {
		burr: st ? (st.sunk ? st.sunk : `${st.r},${st.c}`) : burr,
		rootBroken: ss.brokenWalls.includes(root),
		chestShown: ss.conditionsMet.includes(chest),
		opened: ss.openedChests.includes(chest),
		torchLit: ss.litTorches.includes(torch),
		hp: g.getPlayer().hp,
		scrolls: g.getPlayer().scrolls ?? 0,
	};
}, { burr: BURR, root: ROOT, chest: CHEST, torch: TORCH });

test.describe('D6 焼き栗の淵 ② 実機', () => {
	test('通し：爆弾で栗を岬の先へ→かがり火を灯す→火を運んで栗が爆ぜ、根が崩れて宝箱 +50（勇者は無傷）', async ({ page }) => {
		const errors = await boot(page, { noGod: true });
		const hp0 = (await snap(page)).hp;
		await bomb(page);
		let s = await snap(page);
		expect(s.burr, '東の岸の爆弾で栗が岬の先へ転がらない').toBe(TIP);
		expect(s.rootBroken, '爆弾だけで根が崩れた').toBe(false);
		await face(page, 'left');
		await candle(page);
		expect((await snap(page)).torchLit, 'ロウソクでかがり火が灯らない').toBe(true);
		await boomerang(page);
		s = await snap(page);
		expect(s.burr, '火の付いたブーメランが通っても栗が爆ぜない').toBe('burst');
		expect(s.rootBroken, '岬の先で爆ぜた栗の爆風が根に届かない').toBe(true);
		expect(s.chestShown, '根が崩れたのに宝箱が現れない').toBe(true);
		expect(s.hp, '栗の爆発で勇者が傷んだ').toBe(hp0);
		// 宝箱へ：(4,9)→(4,10)→(2,10)→↑(1,10)
		await walk(page, 'right', 1);
		await walk(page, 'up', 2);
		await walk(page, 'up', 1);
		await step(page, 4);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toBe(true);
		expect(s.scrolls, '宝箱で剣技の巻物が手に入らない（キュー100 でルピー×50 から差し替え）').toBe(1);
		expect(errors).toEqual([]);
	});

	test('誤り：転がす前に火を運ぶと栗は付け根で爆ぜ、根は崩れない（その後の爆弾は何も動かさない）', async ({ page }) => {
		const errors = await boot(page);
		await face(page, 'left');
		await candle(page);
		await boomerang(page);
		let s = await snap(page);
		expect(s.burr, '付け根の栗の上を火が通っても爆ぜない').toBe('burst');
		expect(s.rootBroken, '付け根で爆ぜた栗の爆風が根に届いた（距離 3）').toBe(false);
		expect(s.chestShown).toBe(false);
		await bomb(page);
		s = await snap(page);
		expect(s.rootBroken, '爆ぜた後の岸の爆弾で根が崩れた').toBe(false);
		expect(errors).toEqual([]);
	});

	test('爆弾の爆風は栗を爆ぜさせない・火の無いブーメランでも爆ぜない', async ({ page }) => {
		const errors = await boot(page);
		await bomb(page);
		expect((await snap(page)).burr, '爆風で栗が爆ぜた（転がるだけのはず）').toBe(TIP);
		await face(page, 'left');
		await boomerang(page);
		const s = await snap(page);
		expect(s.burr, '火の無いブーメランで栗が爆ぜた').toBe(TIP);
		expect(s.rootBroken).toBe(false);
		// 対照＝同じ投げ方でも火を拾えば爆ぜる（この投げ方で栗の上を通っている）
		await candle(page);
		await boomerang(page);
		expect((await snap(page)).burr, '対照：火を拾った同じ投げ方で爆ぜない').toBe('burst');
		expect(errors).toEqual([]);
	});

	test('付け根で爆ぜさせても、部屋を出て入り直すと栗は戻り、かがり火は灯ったまま', async ({ page }) => {
		await boot(page);
		await face(page, 'left');
		await candle(page);
		await boomerang(page);
		expect((await snap(page)).burr, '失敗の状態が作れていない').toBe('burst');
		// (4,9) → 東の口から `4,2` へ出て、戻る
		await page.evaluate(() => window.__game.resume?.());
		for (let i = 0; i < 20 && (await page.evaluate(() => window.__game.getState().stageKey)) === ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('right'));
			await page.waitForTimeout(100);
		}
		await page.waitForFunction(() => window.__game.getState().stageKey === '4,2', null, { timeout: 5000 });
		for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.getState().stageKey)) !== ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('left'));
			await page.waitForTimeout(150);
		}
		await page.waitForFunction((rm) => window.__game.getState().stageKey === rm, ROOM, { timeout: 5000 });
		const s = await snap(page);
		expect(s.burr, '入り直しても栗が付け根に戻らない＝やり直せない').toBe(BURR);
		expect(s.torchLit, '入り直したらかがり火が消えた').toBe(true);
	});
});

// ── ③ 規則：ロウソクを栗に向けると爆ぜる（`2,4` 大いが栗の庭）──────────────
test.describe('大いが栗は火で爆ぜる ③ ロウソク', () => {
	test('`2,4` の栗 (7,3) に東から (7,4) でロウソクを向けると爆ぜて消える（勇者は無傷）', async ({ page }) => {
		const errors = await boot(page, { stage: '2,4', row: 7, col: 4, noGod: true });
		const hp0 = await page.evaluate(() => window.__game.getPlayer().hp);
		await face(page, 'left');
		await candle(page);
		await step(page, 4);
		const r = await page.evaluate(() => {
			const g = window.__game; const st = g.getStageState().stonePositions?.['7,3'];
			return { st, hp: g.getPlayer().hp };
		});
		expect(r.st?.sunk, 'ロウソクを向けても栗が爆ぜない').toBe('burst');
		expect(r.hp, '栗の爆発で勇者が傷んだ').toBe(hp0);
		expect(errors).toEqual([]);
	});
});
