// tests/d6-fire-arrow-pool.spec.js
// dungeon_6 `1,4`「火矢の淵」と「灯ったかがり火を通った矢は火矢になる」規則の番人
// （2026-11-07 / PLAN 実行キュー 95 の8室目・盤面は `scripts/migrate-d6-1-4-fire-arrow-pool.mjs`）。
//
//      1 #~~~~~....t#     ← 北の岸 (1,6)
//      2 #H~~~~F....#     ← 淵の灯 T1 H(2,1)・岸の火 F H(2,6)（初めから灯っている）・東の岸 (2,7)
//      7 #~~~~~u~...#     ← 葦 u(7,6)
//      8 #H~~Huu~..B#     ← 淵の灯 T3 H(8,1)・T2 H(8,4)・葦 (8,5)(8,6)・南東の岸 (8,8)・宝箱 B(8,10)
//
// 守るもの
//   ① データ：盤面・水・宝の中身と出る条件・初めから灯るのは岸の火だけ。
//   ② 実機：通し（(2,7) から西へ＝T1／(1,6) から南へ＝葦が燃えて T2／(8,8) から西へ＝T2 越しに T3 →宝箱）
//      ／順序（T2 が消えている間の (8,8) の矢は火を持たない＝T3 は点かない）／木のブーメランは届かない。
//   ③ 規則の波及（ユーザー判断で許容＝PLAN キュー95 の8室目）：D8 `2,0` は中継のかがり火の真下なら
//      どこから北へ射ても奥の導火線が燃える（木のブーメランの届きの外 (8,4) から）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import {
	LAYER, ROOM, TARGET, WATER, CHEST, SOURCE, T1, T2, T3, REEDS, CHEST_CONTENTS, SHOW,
} from '../scripts/migrate-d6-1-4-fire-arrow-pool.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const room = map.layers[LAYER].stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 火矢の淵 ① データ', () => {
	test('盤面・水・宝箱の中身と出る条件・初めから灯るのは岸の火だけ', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(Object.keys(room.bgTiles ?? {}).sort()).toEqual([...WATER].sort());
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(room.showConditions).toEqual(SHOW);
		expect(room.initLitTorches, '淵の灯が初めから灯っている＝射る手が要らない').toEqual([SOURCE]);
	});
});

// ── ② 実機 ───────────────────────────────────────────────────────────
const GAME = '/blade-of-lumia/game/';
const url = (layer, stage, row, col, extra = {}) => `${GAME}?${new URLSearchParams({
	fromEditor: '1', layer, stage, row: String(row), col: String(col),
	ps_weapon: '1', ps_bow: '1', ps_boomerang: '1', ps_candle: '1', ps_hearts: '10', ...extra,
})}`;
async function boot(page, { layer = LAYER, stage = ROOM, row = 2, col = 7 } = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url(layer, stage, row, col));
	await waitForBoard(page);
	await page.evaluate(() => {
		const g = window.__game;
		g.pause();
		g.getPlayer()._shownSubItemHint = true;   // 「初めてのサブアイテム」の窓＝開くと足が止まる（本編では既出）
		g.step(2);
	});
	return errors;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
// 向きを変えるだけ（目の前がかがり火・水＝動かない）
const face = (page, d) => page.evaluate((dir) => { window.__game.movePlayer(dir); window.__game.step(1); }, d);
// 撃って、矢が飛んでいる間に一度でも火を持ったかを返す（火矢のオーラの元＝proj.flaming）
const shoot = (page, id = 'bow', ticks = 12) => page.evaluate(({ id, ticks }) => {
	const g = window.__game; g.getPlayer().activeSubItem = id; g.useSubItem();
	let flamed = false;
	for (let i = 0; i < ticks; i++) {
		g.step(1);
		if (g.getProjectiles().some((p) => p.owner === 'player' && p.flaming)) flamed = true;
	}
	return flamed;
}, { id, ticks });
const snap = (page) => page.evaluate(({ chest }) => {
	const g = window.__game;
	const ss = g.getStageState();
	return {
		lit: [...ss.litTorches].sort(),
		burned: [...ss.cutBushes].sort(),
		chestShown: ss.conditionsMet.includes(chest),
		opened: ss.openedChests.includes(chest),
		potion: g.getPlayer().subItems?.healPotion?.count ?? 0,
		pos: `${g.getPlayer().y},${g.getPlayer().x}`,
	};
}, { chest: CHEST });

test.describe('D6 火矢の淵 ② 実機', () => {
	test('通し：岸の火越しに3射（T1 → 葦を燃やして T2 → T2 越しに T3）で宝箱が現れ、回復薬が手に入る', async ({ page }) => {
		const errors = await boot(page);
		// ① (2,7) から西へ
		await face(page, 'left');
		expect(await shoot(page), '岸の火を通った矢が火を持たない').toBe(true);
		let s = await snap(page);
		expect(s.lit, '①の火矢で T1 が灯らない').toContain(T1);
		expect(s.lit).not.toContain(T2);
		// ② (1,6) から南へ＝葦が燃え広がって T2
		await walk(page, 'up', 1);
		await walk(page, 'left', 1);
		expect((await snap(page)).pos, '北の岸 (1,6) に着いていない').toBe('1,6');
		await face(page, 'down');
		await shoot(page, 'bow', 30);   // 飛ぶ 3 tick＋燃え広がり 240ms×3＝6 tick＋余り
		s = await snap(page);
		expect(s.burned, '②の火矢で葦が燃えない').toEqual([...REEDS].sort());
		expect(s.lit, '燃えた葦の火が T2 に移らない').toContain(T2);
		expect(s.lit).not.toContain(T3);
		expect(s.chestShown).toBe(false);
		// ③ (8,8) から西へ＝T2 で火を拾って T3
		await walk(page, 'right', 2);
		await walk(page, 'down', 7);
		expect((await snap(page)).pos, '南東の岸 (8,8) に着いていない').toBe('8,8');
		await face(page, 'left');
		expect(await shoot(page), 'T2 を通った矢が火を持たない').toBe(true);
		s = await snap(page);
		expect(s.lit, '③の火矢で T3 が灯らない').toContain(T3);
		expect(s.chestShown, '淵の灯が全部点いたのに宝箱が現れない').toBe(true);
		const potion0 = s.potion;
		await walk(page, 'right', 2);
		await step(page, 4);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toBe(true);
		expect(s.potion, '宝箱で回復薬が増えない').toBe(potion0 + 1);
		expect(errors).toEqual([]);
	});

	test('順序：T2 が消えている間に南東の岸から西へ射ても火を持たず、T3 は点かない', async ({ page }) => {
		const errors = await boot(page, { row: 8, col: 8 });
		await face(page, 'left');
		expect(await shoot(page), '火元の無い行8 で矢が火を持った').toBe(false);
		const s = await snap(page);
		expect(s.lit, '火元の無い矢で淵の灯が点いた').toEqual([SOURCE]);
		expect(s.burned, '火元の無い矢で葦が燃えた').toEqual([]);
		expect(errors).toEqual([]);
	});

	test('対照：同じ座から木のブーメランを投げても火は運べるが的まで届かない', async ({ page }) => {
		const errors = await boot(page);
		await face(page, 'left');
		expect(await shoot(page, 'boomerang', 60), 'ブーメランが岸の火で火を拾わない（座がずれている）').toBe(true);
		expect((await snap(page)).lit, '木のブーメランで T1 が灯った（届きの外のはず）').toEqual([SOURCE]);
		await walk(page, 'up', 1);
		await walk(page, 'left', 1);
		await face(page, 'down');
		await shoot(page, 'boomerang', 60);
		const s = await snap(page);
		expect(s.burned, '木のブーメランで葦が燃えた（届きの外のはず）').toEqual([]);
		expect(s.lit).toEqual([SOURCE]);
		expect(errors).toEqual([]);
	});
});

// ── ③ 規則の波及（D8 `2,0` 葦の導火線） ──────────────────────────────────
test.describe('D6 火矢の淵 ③ 規則の波及', () => {
	test('D8 `2,0`：中継のかがり火が灯っていれば、木のブーメランが届かない (8,4) から北へ射ても奥のかがり火が灯る', async ({ page }) => {
		const errors = await boot(page, { layer: 'dungeon_8', stage: '2,0', row: 5, col: 3 });
		// 手前の導火線の根元 (4,3) にロウソク＝燃え広がって中継のかがり火 (4,4) が灯る
		await page.evaluate(() => { const g = window.__game; g.getPlayer().activeSubItem = 'candle'; });
		await face(page, 'up');
		await page.evaluate(() => { const g = window.__game; g.useSubItem(); g.step(30); });
		expect((await snap(page)).lit, '手前の導火線で中継のかがり火が灯らない').toContain('4,4');
		await walk(page, 'down', 3);    // (5,4) は水＝先に南へ
		await walk(page, 'right', 1);
		expect((await snap(page)).pos).toBe('8,4');
		await face(page, 'up');
		expect(await shoot(page, 'bow', 60), '中継のかがり火を通った矢が火を持たない').toBe(true);
		const s = await snap(page);
		expect(s.lit, '火矢で奥の導火線が燃えて奥のかがり火 (1,10) が灯らない').toContain('1,10');
		expect(errors).toEqual([]);
	});
});
