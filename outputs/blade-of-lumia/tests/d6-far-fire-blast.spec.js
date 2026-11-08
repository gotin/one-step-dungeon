// tests/d6-far-fire-blast.spec.js
// dungeon_6 `4,4`「遠火の発破」の番人
// （2026-11-08 / PLAN 実行キュー 95 の13室目・盤面は `scripts/migrate-d6-4-4-far-fire-blast.mjs`）。
//
//      3 #...~¤~ŧ~~B#     ← 大いが栗 ¤(3,5)（池の中）・枯れ木 ŧ(3,7)（岬の先）・宝箱 B(3,10)（小島）
//      4 ....~~~.~~~#     ← 西の口・岬 (4,7)〜(6,7)
//      7 #....H.....#     ← かがり火 H(7,5)（初めから灯っている）
//      8 #i........t#     ← 射る座 (8,5)
//
// 守るもの
//   ① データ：盤面・水・宝の中身・初めから灯るのはかがり火だけ。
//   ② 実機：通し（(8,5) から北へ火矢→栗が爆ぜる→枯れ木が東へ倒れる→岬・切り株・幹を渡って宝箱）
//      ／誤り（岬で爆弾＝北へ倒れて宝箱へ渡れない）／対照（木のブーメランは届かない・火の無い矢は栗を爆ぜさせない）
//      ／入り直すと栗も枯れ木も戻る。
//   規則そのもの（火矢・焼き栗・倒木）の番人は d6-fire-arrow-pool／d6-roast-burr-pool／d6-fallen-tree-bridge。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import {
	LAYER, ROOM, TARGET, WATER, CHEST, BURR, TREE, TORCH, CHEST_CONTENTS,
} from '../scripts/migrate-d6-4-4-far-fire-blast.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const room = map.layers[LAYER].stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 遠火の発破 ① データ', () => {
	test('盤面・水・宝箱の中身・初めから灯るのはかがり火だけ', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(Object.keys(room.bgTiles ?? {}).sort()).toEqual([...WATER].sort());
		expect(room.bgTiles[BURR], '栗の下が水でない＝岸から触れられる').toBe('~');
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(room.initLitTorches, 'かがり火が消えている＝火矢が作れない').toEqual([TORCH]);
	});
});

// ── ② 実機 ───────────────────────────────────────────────────────────
const GAME = '/blade-of-lumia/game/';
const url = (row, col) => `${GAME}?${new URLSearchParams({
	fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
	ps_weapon: '1', ps_bow: '1', ps_boomerang: '1', ps_bomb: '1', ps_hearts: '10',
})}`;
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url(row, col));
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
// 撃って、飛んでいる間に一度でも火を持ったかを返す（proj.flaming）
const shoot = (page, id = 'bow', ticks = 30) => page.evaluate(({ id, ticks }) => {
	const g = window.__game; g.getPlayer().activeSubItem = id; g.useSubItem();
	let flamed = false;
	for (let i = 0; i < ticks; i++) {
		g.step(1);
		if (g.getProjectiles().some((p) => p.owner === 'player' && p.flaming)) flamed = true;
	}
	return flamed;
}, { id, ticks });
async function bomb(page) {
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bomb'; window.__game.useSubItem(); });
	await step(page, 30);   // 導火線 2 秒＝16 tick＋余り
}
const snap = (page) => page.evaluate(({ chest, burr }) => {
	const g = window.__game;
	const p = g.getPlayer();
	const ss = g.getStageState();
	const s = ss.stonePositions?.[burr];
	// 爆ぜたかは部屋の栗の全部で見る（元セルの鍵だけを見ると、栗の置き場が変わったとき測定が空振りする）
	const burst = Object.values(ss.stonePositions ?? {}).some((x) => x.sunk);
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		burr: burst ? 'burst' : s ? `${s.r},${s.c}` : burr,
		fallen: { ...(ss.fallenTrees ?? {}) },
		opened: [...(ss.openedChests ?? [])].includes(chest),
		bigPotion: p.subItems?.bigHealPotion?.count ?? 0,
		hp: p.hp,
		stage: g.getState().stageKey,
	};
}, { chest: CHEST, burr: BURR });

test.describe('D6 遠火の発破 ② 実機', () => {
	test('通し：かがり火の真南 (8,5) から北へ射ると栗が爆ぜ、枯れ木が東へ倒れて橋になり、回復薬（大）が手に入る', async ({ page }) => {
		const errors = await boot(page, 8, 5);
		const s0 = await snap(page);
		await face(page, 'up');
		expect(await shoot(page), 'かがり火を通った矢が火を持たない').toBe(true);
		let s = await snap(page);
		expect(s.burr, '火矢が栗を爆ぜさせない').toBe('burst');
		expect(s.fallen, '栗の爆風で枯れ木が東へ倒れない').toEqual({ [TREE]: 'e' });
		expect(s.hp, '栗の爆風で傷んだ').toBe(s0.hp);
		// (8,5) → (8,7) → 岬を北へ (4,7) → 切り株 (3,7) → 幹 (3,8)(3,9) → 東の宝箱
		await walk(page, 'right', 2);
		await walk(page, 'up', 4);
		expect((await snap(page)).pos, '岬の先に着かない').toBe('4,7');
		await walk(page, 'up', 1);
		expect((await snap(page)).pos, '切り株に立てない').toBe(TREE);
		await walk(page, 'right', 2);
		expect((await snap(page)).pos, '幹を渡れない').toBe('3,9');
		await walk(page, 'right', 1);
		await step(page, 4);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toBe(true);
		expect(s.bigPotion, '宝箱で回復薬（大）が増えない').toBe(s0.bigPotion + 1);
		expect(errors).toEqual([]);
	});

	test('誤り：岬 (5,7) で爆弾を置くと枯れ木は北へ倒れ、宝箱へ渡れない', async ({ page }) => {
		const errors = await boot(page, 5, 7);
		await bomb(page);
		const s = await snap(page);
		expect(s.fallen, '岬の爆風で北へ倒れない').toEqual({ [TREE]: 'n' });
		expect(s.burr, '爆風で栗が動いた・爆ぜた（爆風は火ではない・四方は水）').toBe(BURR);
		await walk(page, 'up', 2);                    // 切り株 (3,7)
		expect((await snap(page)).pos, '切り株に立てない').toBe(TREE);
		await walk(page, 'right', 2);                 // 東は水
		expect((await snap(page)).pos, '橋の無い水を渡れた').toBe(TREE);
		expect(errors).toEqual([]);
	});

	test('対照：同じ座 (8,5) から木のブーメランを投げると火は拾うが、栗まで届かない', async ({ page }) => {
		const errors = await boot(page, 8, 5);
		await face(page, 'up');
		expect(await shoot(page, 'boomerang', 60), 'ブーメランがかがり火で火を拾わない（座がずれている）').toBe(true);
		const s = await snap(page);
		expect(s.burr, '木のブーメランで栗が爆ぜた（届きの外のはず）').toBe(BURR);
		expect(s.fallen).toEqual({});
		expect(errors).toEqual([]);
	});

	test('対照：西の岸 (3,3) から東へ射た火の無い矢は栗を貫いても爆ぜさせない', async ({ page }) => {
		const errors = await boot(page, 3, 3);
		await face(page, 'right');
		expect(await shoot(page), '火元の無い行で矢が火を持った').toBe(false);
		const s = await snap(page);
		expect(s.burr, '火の無い矢で栗が爆ぜた').toBe(BURR);
		expect(s.fallen).toEqual({});
		expect(errors).toEqual([]);
	});

	test('入り直すと、爆ぜた栗も倒れた枯れ木も戻る', async ({ page }) => {
		await boot(page, 8, 5);
		await face(page, 'up');
		await shoot(page);
		expect((await snap(page)).fallen, '前提の状態が作れていない').toEqual({ [TREE]: 'e' });
		// (8,5)（真上はかがり火）→ (8,2)（(8,1) は碑）→ (4,2) → (4,1) → 西の口から `3,4` へ出て、戻る
		await walk(page, 'left', 3);
		await walk(page, 'up', 4);
		await walk(page, 'left', 1);
		expect((await snap(page)).pos, '西の口の前に着かない').toBe('4,1');
		await page.evaluate(() => window.__game.resume?.());
		for (let i = 0; i < 20 && (await page.evaluate(() => window.__game.getState().stageKey)) === ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('left'));
			await page.waitForTimeout(100);
		}
		await page.waitForFunction(() => window.__game.getState().stageKey === '3,4', null, { timeout: 5000 });
		for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.getState().stageKey)) !== ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('right'));
			await page.waitForTimeout(150);
		}
		await page.waitForFunction((rm) => window.__game.getState().stageKey === rm, ROOM, { timeout: 5000 });
		const s = await snap(page);
		expect(s.fallen, '入り直しても枯れ木が倒れたまま').toEqual({});
		expect(s.burr, '入り直しても栗が戻らない').toBe(BURR);
	});
});
