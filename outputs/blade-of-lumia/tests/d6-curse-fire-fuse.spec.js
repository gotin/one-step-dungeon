// tests/d6-curse-fire-fuse.spec.js
// dungeon_6 `4,2`「呪い火の導火」の番人
// （2026-11-08 / PLAN 実行キュー 95 の12室目・盤面は `scripts/migrate-d6-4-2-curse-fire-fuse.mjs`・エンジン変更なし）。
//
//      1 #..........#     ← 北の岸
//      2 #.ψ~~~~~~~.#     ← 呪い火 ψ(2,2)＝池の北西の隅（最初から追う）
//      4 ..~S.¤t¤~~.#     ← 小島：踏み板 S(4,3)・西の栗 ¤(4,5)・木・東の栗 ¤(4,7)
//      7 #..........#     ← 南の岸
//      8 #i........B#     ← 宝箱 B(8,10)＝ルピー×50（キュー100 で回復薬（大）から差し替え）・栗が踏み板に乗ると現れる
//
// 主題＝呪い火 ψ に縦横で接した大いが栗は爆ぜ、爆風は隣の栗を転がす。踏み板から遠い東の栗を焼かせると
// 西の栗が踏み板へ転がる。ψ は勇者へまっすぐ寄る＝北の岸で引き寄せてから南東へ走ると池を斜めに渡る。
//
// 守るもの
//   ① データ：盤面・水・中身・出る条件・最初から追う・入り直しで戻る・宣言・勇者の火も爆弾も届かない・連鎖の向き。
//   ② 実機：通し（北で待って東回りで南東へ→東の栗が爆ぜ西の栗が踏み板→宝箱→ルピー×50）／
//      誤り（西の口から南の岸を東へ＝西の栗が爆ぜて踏み板は空）／口から口へ抜けるだけでは栗に触れない／
//      失敗しても入り直すと ψ も栗も戻る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, TARGET, WATER, PSI, BURR_W, BURR_E, PLATE, CHEST, CHEST_CONTENTS, SHOW, SIGN_DATA, reach, rollFrom,
} from '../scripts/migrate-d6-4-2-curse-fire-fuse.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((r) => (Array.isArray(r) ? [...r] : [...String(r)]));
const water = new Set(Object.keys(room.bgTiles ?? {}).filter((k) => room.bgTiles[k] === TILE.WATER));
const rc = (k) => k.split(',').map(Number);
const nb = (k) => { const [r, c] = rc(k); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 呪い火の導火 ① データ', () => {
	test('盤面・水・中身（ルピー×50）・栗が踏み板に乗ると現れる・ψ は最初から追い入り直すと戻る・宣言あり', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect([...water].sort(), '水の下地が違う').toEqual([...WATER].sort());
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(room.showConditions, '宝箱の出る条件が栗の踏み板でない').toEqual(SHOW);
		expect(room.signData).toEqual(SIGN_DATA);
		expect(room.enemyChase, 'ψ がさまよう＝池の上を飛んで勝手に栗に触れる').toEqual({ [PSI]: true });
		expect(room.enemiesRespawn, '失敗して ψ が消えたら二度と栗を焼けない').toBe(true);
		expect(ENEMY_META[TILE.CURSE_FIRE].ignitesBushes, 'ψ が火元でない').toBe(true);
		expect(stageThreat(room, ENEMY_META), '脅威度が看板部屋 2,3 以上').toBeLessThan(stageThreat(stages['2,3'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((d) => d.layer === LAYER && d.stage === ROOM), '敵の宣言（EXTRA_ENEMY_ROOMS）が無い').toBe(true);
	});

	test('勇者の火も爆弾も届かない：栗に接する床が無い・火元が無い・どこに爆弾を置いても栗は動かない（はしごの床も）', () => {
		const flat = grid.flat();
		expect([TILE.TORCH, TILE.BUSH].filter((ch) => flat.includes(ch)), 'かがり火か茂み＝勇者の火元がある').toEqual([]);
		expect(room.initLitTorches ?? []).toEqual([]);
		const walk = reach(grid, water);
		const walkLadder = reach(grid, water, { ladder: true });
		expect([...nb(BURR_W), ...nb(BURR_E)].filter((k) => walk.has(k)), 'ロウソクで栗を焼ける床がある').toEqual([]);
		expect(nb(BURR_E).filter((k) => walkLadder.has(k)), 'はしごで渡ると東の栗をロウソクで焼ける').toEqual([]);
		const moved = [...walkLadder].filter((k) => {
			const a = rollFrom(grid, water, { w: BURR_W, e: BURR_E }, k, 2);
			return a.w !== BURR_W || a.e !== BURR_E;
		});
		expect(moved, '爆弾で栗を動かせる置き場がある').toEqual([]);
	});

	test('連鎖：東の栗が爆ぜると西の栗は踏み板で止まる／西の栗が爆ぜても東の栗は動かない', () => {
		expect(rollFrom(grid, water, { w: BURR_W }, BURR_E, 2).w).toBe(PLATE);
		expect(rollFrom(grid, water, { e: BURR_E }, BURR_W, 2).e).toBe(BURR_E);
	});
});

// ── ② 実機 ───────────────────────────────────────────────────────────
const GAME = '/blade-of-lumia/game/';
const url = (row, col) => `${GAME}?${new URLSearchParams({
	fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
	ps_weapon: '1', ps_hearts: '10',
})}`;
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url(row, col));
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 1);
	await page.evaluate(() => { const g = window.__game; g.pause(); g.getPlayer()._shownSubItemHint = true; });
	return errors;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// (r,c) へ歩く（縦を先に・1 tick に半マス＝[[blade-moveplayer-is-half-tile]]）。岸の角を経由して呼ぶ。
const go = (page, r, c) => page.evaluate(({ r, c }) => {
	const g = window.__game;
	for (let i = 0; i < 200; i++) {
		const p = g.getState().player;
		if (p.y === r && p.x === c) return;
		g.movePlayer(p.y !== r ? (r > p.y ? 'down' : 'up') : (c > p.x ? 'right' : 'left'));
		g.step(1);
	}
}, { r, c });
const snap = (page) => page.evaluate(({ w, e, chest }) => {
	const g = window.__game;
	const ss = g.getStageState();
	const pos = (k) => { const s = ss.stonePositions?.[k]; return s ? (s.sunk ? 'burst' : `${s.r},${s.c}`) : k; };
	const p = g.getPlayer();
	return {
		w: pos(w), e: pos(e),
		psi: g.getEnemies().map((x) => `${x.y},${x.x}`),
		chestShown: ss.conditionsMet.includes(chest),
		opened: ss.openedChests.includes(chest),
		rupees: p.rupees ?? 0,
		stageKey: g.getState().stageKey,
	};
}, { w: BURR_W, e: BURR_E, chest: CHEST });

test.describe('D6 呪い火の導火 ② 実機', () => {
	test('通し：北の岸で ψ を引き寄せ、東回りで南東へ走ると、ψ が池を斜めに渡って東の栗を焼き、西の栗が踏み板へ→宝箱→ルピー×50', async ({ page }) => {
		const errors = await boot(page, 1, 5);
		await step(page, 60);
		let s = await snap(page);
		expect([s.w, s.e], '北の岸で待つだけで栗が動いた').toEqual([BURR_W, BURR_E]);
		await go(page, 1, 10);
		await go(page, 7, 10);
		await step(page, 120);
		s = await snap(page);
		expect(s.e, '東の栗が爆ぜていない').toBe('burst');
		expect(s.w, '西の栗が踏み板へ転がっていない').toBe(PLATE);
		expect(s.chestShown, '栗が踏み板に乗ったのに宝箱が現れない').toBe(true);
		const rupees0 = s.rupees;
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 2; i++) { g.movePlayer('down'); g.step(1); } g.step(4); });
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toBe(true);
		expect(s.rupees, '宝箱でルピー×50 が増えない').toBe(rupees0 + 50);
		expect(errors).toEqual([]);
	});

	test('誤り：西の口から南の岸を東へ歩くと、ψ は西の栗に触れる＝西の栗が爆ぜ、東の栗は動かず踏み板は空', async ({ page }) => {
		const errors = await boot(page, 5, 1);
		await go(page, 7, 1);
		await go(page, 7, 10);
		await step(page, 120);
		const s = await snap(page);
		expect(s.w, '西の栗が爆ぜていない（ψ が触れる規則を見せる失敗）').toBe('burst');
		expect(s.e, '東の栗が動いた').toBe(BURR_E);
		expect(s.chestShown, '踏み板が空なのに宝箱が現れた').toBe(false);
		expect(errors).toEqual([]);
	});

	test('口から口へ抜けるだけ・口に立つだけでは ψ は栗に触れない', async ({ page }) => {
		await boot(page, 4, 1);
		await step(page, 200);
		await go(page, 1, 1);
		await go(page, 1, 5);
		await step(page, 200);
		await go(page, 1, 1);
		await go(page, 4, 1);
		await step(page, 200);
		const s = await snap(page);
		expect([s.w, s.e], '西の口と北の口を行き来しただけで栗が動いた').toEqual([BURR_W, BURR_E]);
		expect(s.psi.length, 'ψ が消えた').toBe(1);
	});

	test('失敗しても、部屋を出て入り直すと ψ も栗も戻る', async ({ page }) => {
		await boot(page, 5, 1);
		await go(page, 7, 1);
		await go(page, 7, 10);
		await step(page, 120);
		let s = await snap(page);
		expect([s.w, s.psi.length], '失敗の前提（西の栗が爆ぜて ψ が消える）が立たない').toEqual(['burst', 0]);
		await go(page, 7, 1);
		await go(page, 5, 1);
		await page.evaluate(() => window.__game.resume?.());
		for (let i = 0; i < 20 && (await snap(page)).stageKey === ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('left'));
			await page.waitForTimeout(100);
		}
		await page.waitForFunction(() => window.__game.getState().stageKey === '3,2', null, { timeout: 5000 });
		for (let i = 0; i < 8 && (await snap(page)).stageKey !== ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('right'));
			await page.waitForTimeout(150);
		}
		await page.waitForFunction((rm) => window.__game.getState().stageKey === rm, ROOM, { timeout: 5000 });
		await page.waitForFunction(() => window.__game.getEnemies().length === 1, null, { timeout: 3000 });
		s = await snap(page);
		expect(s.psi, '入り直しても ψ が戻らない').toEqual([PSI]);
		expect([s.w, s.e], '入り直しても栗が元の位置に戻らない').toEqual([BURR_W, BURR_E]);
	});
});
