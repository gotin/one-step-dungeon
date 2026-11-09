// tests/d6-wildfire-sweep.spec.js
// dungeon_6 `4,1`「野火の掃討」と、燃える茂みが敵を焼く規則の番人
// （2026-11-08 / PLAN 実行キュー 95 の14室目・盤面は `scripts/migrate-d6-4-1-wildfire-sweep.mjs`）。
//
//      2 #.~~~H~~~~.#     ← 北のかがり火 H(2,5)＝射る座 (1,5)（誤り）
//      3 #.~uuuuuuH.#     ← 茂みの垣 (3,3)〜(3,8)・東のかがり火 H(3,9)＝射る座 (3,10)（正解）
//      4 ..~#ζ..ζ#~.#     ← 1列の檻に盾騎士 ζ×2（最初から追う＝勇者の方を向く）
//      8 #i........B#     ← 宝箱 B(8,10)＝ルピー×50（キュー100 で回復薬（大）から差し替え）（killAll）
//
// 守るもの
//   ① データ：盤面・水・宝の中身と出現条件・かがり火2つは初めから灯る・騎士は追う・茂みは部屋を出ると戻る。
//   ② 実機：通し（(3,10) から西へ火矢→騎士は横を向いている＝2体とも焼ける→宝箱→ルピー +50・無傷）
//      ／誤り（(1,5) から南へ火矢＝騎士は見上げて盾で弾く＝2体とも無傷・垣は燃え尽きる）
//      ／対照（火の無い矢は正面の盾に弾かれる）
//      ／入り直すと垣が戻り、騎士も元の位置から（やり直せる）。
//   ③ 規則：呪い火 ψ は自分の点けた火で焼けない（D6 `2,2`＝ψ が茂みの檻に接して燃やす部屋）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import {
	LAYER, ROOM, TARGET, WATER, CHEST, KNIGHTS, HEDGE, TORCH_N, TORCH_E, CHEST_CONTENTS, SHOT_WRONG, SHOT_RIGHT,
} from '../scripts/migrate-d6-4-1-wildfire-sweep.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const room = map.layers[LAYER].stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const rc = (k) => k.split(',').map(Number);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 野火の掃討 ① データ', () => {
	test('盤面・水・宝箱・かがり火・騎士の動き・茂みが戻る指定', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(Object.keys(room.bgTiles ?? {}).sort()).toEqual([...WATER].sort());
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(room.showConditions[CHEST]?.trigger, '宝箱が騎士を倒して現れる形でない').toBe('killAll');
		expect([...room.initLitTorches].sort(), 'かがり火が消えている＝火矢が作れない').toEqual([TORCH_N, TORCH_E].sort());
		expect(room.enemyChase, '騎士がさまよう＝向きが乱数になる').toEqual(Object.fromEntries(KNIGHTS.map((k) => [k, true])));
		expect(room.regrowBushes, '失敗すると垣が二度と戻らない').toBe(true);
		expect(room.floorItems ?? {}, '読み手の無い「小さな妖精」が残っている').toEqual({});
	});
});

// ── ② 実機 ───────────────────────────────────────────────────────────
const GAME = '/blade-of-lumia/game/';
const url = (layer, stage, row, col) => `${GAME}?${new URLSearchParams({
	fromEditor: '1', layer, stage, row: String(row), col: String(col),
	ps_weapon: '1', ps_bow: '1', ps_boomerang: '1', ps_bomb: '1', ps_candle: '1', ps_hearts: '10',
})}`;
async function boot(page, at, { layer = LAYER, stage = ROOM } = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const [row, col] = rc(at);
	await page.goto(url(layer, stage, row, col));
	await waitForBoard(page);
	await page.evaluate(() => {
		const g = window.__game;
		g.pause();
		g.getPlayer()._shownSubItemHint = true;   // 「初めてのサブアイテム」の窓＝開くと足が止まる（本編では既出）
	});
	// 騎士が勇者の方を向き終わるまで待つ（向き直りは 720ms＝6 tick ごと・最初から追う）
	await step(page, 20);
	return errors;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
// 向きを変えるだけ（目の前が水・かがり火＝動かない）
const face = (page, d) => page.evaluate((dir) => { window.__game.movePlayer(dir); window.__game.step(1); }, d);
const shoot = (page, id = 'bow', ticks = 40) => page.evaluate(({ id, ticks }) => {
	const g = window.__game; g.getPlayer().activeSubItem = id; g.useSubItem();
	for (let i = 0; i < ticks; i++) g.step(1);
}, { id, ticks });
const snap = (page) => page.evaluate((chest) => {
	const g = window.__game;
	const p = g.getPlayer();
	const ss = g.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		knights: g.getEnemies().map((e) => ({ at: `${e.y},${e.x}`, dir: e.dir, hp: e.hp })),
		burned: [...(ss.cutBushes ?? [])].sort(),
		cond: [...(ss.conditionsMet ?? [])],
		opened: [...(ss.openedChests ?? [])].includes(chest),
		rupees: p.rupees ?? 0,
		hp: p.hp,
	};
}, CHEST);

test.describe('D6 野火の掃討 ② 実機', () => {
	test('通し：東のかがり火越しに (3,10) から西へ射ると、横を向いた騎士が2体とも焼け、ルピー×50 が手に入る', async ({ page }) => {
		const errors = await boot(page, SHOT_RIGHT.at);
		const s0 = await snap(page);
		expect(s0.knights.map((k) => k.dir), '騎士が勇者の方（東）を向いていない＝前提が崩れている').toEqual(['right', 'right']);
		await face(page, SHOT_RIGHT.dir);
		await shoot(page);
		let s = await snap(page);
		expect(s.burned, '火矢で垣が燃え尽きない').toEqual([...HEDGE].sort());
		expect(s.knights, '燃える茂みに接した騎士が焼けない').toEqual([]);
		expect(s.cond, '騎士を倒しても宝箱が現れない').toContain(CHEST);
		expect(s.hp, '野火で勇者が傷んだ').toBe(s0.hp);
		// (3,10) → 東の岸を南へ (7,10) → 宝箱 (8,10)
		await walk(page, 'down', 4);
		expect((await snap(page)).pos, '宝箱の前に着かない').toBe('7,10');
		await walk(page, 'down', 1);
		await step(page, 4);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toBe(true);
		expect(s.rupees, '宝箱でルピー×50 が増えない').toBe(s0.rupees + 50);
		expect(errors).toEqual([]);
	});

	test('燃え広がり：騎士を持ち場から動かさない盤面で、(3,10) から木のブーメランを投げると、西の騎士 (4,4) は伝ってきた火で焼ける', async ({ page }) => {
		// 本番の盤面では騎士が勇者の方（東）へ寄る＝ブーメランが直に燃やす (3,8)〜(3,6) の下に2体とも来る
		// （実測＝木のブーメランは x=5.5 まで飛ぶ）∴燃え広がりの火の焼きを測れない。騎士を持ち場に留めて
		// (4,4) に残す＝その上の (3,4) はブーメランが届かず、燃え広がりの火でしか燃えない。
		await page.route('**/work/blade-of-lumia.json', async (route) => {
			const json = structuredClone(map);
			json.layers[LAYER].stages[ROOM].enemyHold = Object.fromEntries(KNIGHTS.map((k) => [k, true]));
			await route.fulfill({ json });
		});
		const errors = await boot(page, SHOT_RIGHT.at);
		expect((await snap(page)).knights.map((k) => `${k.at}:${k.dir}`), '騎士が持ち場で東を向いていない').toEqual(['4,4:right', '4,7:right']);
		await face(page, SHOT_RIGHT.dir);
		// ブーメランが一番西まで来た位置（x は左上基準・セルは floor(x+0.5)）＝列4 に入っていないこと
		const minX = await page.evaluate(() => {
			const g = window.__game; g.getPlayer().activeSubItem = 'boomerang'; g.useSubItem();
			let m = Infinity;
			for (let i = 0; i < 12; i++) {
				g.step(1);
				for (const p of g.getProjectiles()) if (p.owner === 'player') m = Math.min(m, p.x);
			}
			return m;
		});
		expect(Math.floor(minX + 0.5), 'ブーメランが列4（西の騎士の上）まで届いた＝燃え広がりの道を測れていない').toBeGreaterThan(4);
		await step(page, 40);
		const s = await snap(page);
		expect(s.burned, '垣が燃え尽きない').toEqual([...HEDGE].sort());
		expect(s.knights, '燃え広がった火で西の騎士が焼けない').toEqual([]);
		expect(errors).toEqual([]);
	});

	test('誤り：北のかがり火越しに (1,5) から南へ射ると、騎士は見上げて盾で弾き、垣だけが燃え尽きる', async ({ page }) => {
		const errors = await boot(page, SHOT_WRONG.at);
		const s0 = await snap(page);
		expect(s0.knights.map((k) => k.dir), '騎士が勇者の方（北）を向いていない＝前提が崩れている').toEqual(['up', 'up']);
		await face(page, SHOT_WRONG.dir);
		await shoot(page);
		const s = await snap(page);
		expect(s.burned, '火矢で垣が燃え尽きない＝火が騎士の隣を通っていない').toEqual([...HEDGE].sort());
		expect(s.knights.map((k) => k.hp), '盾の正面から来た火で騎士が傷んだ').toEqual([18, 18]);
		expect(s.cond).not.toContain(CHEST);
		// 騎士は檻と垣の跡から出られない（行3〜4・堀の内側）
		for (const k of s.knights) {
			const [r, c] = k.at.split(',').map(Number);
			expect(r >= 3 && r <= 4 && c >= 3 && c <= 8, `騎士が檻と垣の跡の外へ出た（${k.at}）`).toBe(true);
		}
		expect(errors).toEqual([]);
	});

	test('対照：火の無い矢（かがり火の無い列 (1,4) から南へ）は騎士の正面の盾に弾かれる', async ({ page }) => {
		const errors = await boot(page, '1,4');
		await face(page, 'down');
		const before = (await snap(page)).knights;
		expect(before.some((k) => k.at === '4,4'), '騎士が列4に居ない＝矢が当たらず歯が無い').toBe(true);
		await shoot(page);
		const s = await snap(page);
		expect(s.burned, '火の無い矢で垣が燃えた').toEqual([]);
		expect(s.knights.map((k) => k.hp), '正面から射た矢で騎士が傷んだ').toEqual([18, 18]);
		expect(errors).toEqual([]);
	});

	test('入り直すと、燃え尽きた垣が戻り、騎士も元の位置から', async ({ page }) => {
		await boot(page, SHOT_WRONG.at);
		await face(page, SHOT_WRONG.dir);
		await shoot(page);
		expect((await snap(page)).burned, '前提の状態が作れていない').toEqual([...HEDGE].sort());
		// (1,5) → (1,1) → (4,1) → 西の口から `3,1` へ出て、戻る
		await walk(page, 'left', 4);
		await walk(page, 'down', 3);
		expect((await snap(page)).pos, '西の口の前に着かない').toBe('4,1');
		await page.evaluate(() => window.__game.resume?.());
		for (let i = 0; i < 20 && (await page.evaluate(() => window.__game.getState().stageKey)) === ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('left'));
			await page.waitForTimeout(100);
		}
		await page.waitForFunction(() => window.__game.getState().stageKey === '3,1', null, { timeout: 5000 });
		for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.getState().stageKey)) !== ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('right'));
			await page.waitForTimeout(150);
		}
		await page.waitForFunction((rm) => window.__game.getState().stageKey === rm, ROOM, { timeout: 5000 });
		await page.evaluate(() => window.__game.pause());
		const s = await snap(page);
		expect(s.burned, '入り直しても垣が燃えたまま').toEqual([]);
		expect(s.knights.map((k) => k.hp), '騎士が欠けている').toEqual([18, 18]);
	});
});

// ── ③ 規則 ───────────────────────────────────────────────────────────
test.describe('燃える茂みの規則 ③', () => {
	test('呪い火 ψ は自分が茂みに点けた火で焼けない（D6 `2,2`＝ψ は茂みの檻に接している）', async ({ page }) => {
		const errors = await boot(page, '4,0', { stage: '2,2' });
		await step(page, 40);
		const s = await page.evaluate(() => {
			const g = window.__game;
			return { psi: g.getEnemies().map((e) => e.hp), burned: [...(g.getStageState().cutBushes ?? [])].length };
		});
		expect(s.burned, 'ψ が檻の茂みを燃やしていない＝歯が無い').toBeGreaterThan(0);
		expect(s.psi, 'ψ が自分の点けた火で焼けた').toEqual([3]);
		expect(errors).toEqual([]);
	});
});
