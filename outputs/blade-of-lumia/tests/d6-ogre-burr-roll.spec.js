// tests/d6-ogre-burr-roll.spec.js
// dungeon_6 `3,4`「鬼火薬の栗転がし」の番人
// （2026-11-07 / PLAN 実行キュー 95 の9室目・盤面は `scripts/migrate-d6-3-4-ogre-burr-roll.mjs`・エンジン変更なし）。
//
//      1 #~~~...t...#
//      2 #~λ~.....t.#     ← 爆弾鬼 λ(2,2)＝1マスの島（周り8マスが水）
//      3 #~~~..t....#
//      6 #.........S#     ← 踏み板 S(6,10)
//      7 #..¤....t..#     ← 大いが栗 ¤(7,3)
//      8 #i........B#     ← 宝箱 B(8,10)＝ルピー×100（キュー100 で回復薬（大）から差し替え）・栗が踏み板に乗ると現れる
//
// 主題＝爆弾鬼の爆弾は勇者の足元に落ち、その爆風でも大いが栗は転がる。栗の隣に立って投げさせ、
// 着弾の前に離れる。鬼から遠い (8,7) だけは投げてこない＝自分の爆弾1個（5押しのうち鬼4・自分1）。
//
// 守るもの
//   ① データ：盤面・中身・出る条件・鬼の島・鬼ありの BFS（自分の爆弾1・5押し）・鬼なしのソルバー（爆弾5・詰まない）。
//   ② 実機：通し（本物の鬼の爆弾4回＋自分の爆弾1個で栗が踏み板へ→宝箱→ルピー×100）／
//      投げられた瞬間に離れれば傷まない（対照＝立ちっぱなしは傷む）／届きの外 (8,7) では投げてこず栗は動かない／
//      鬼は島から動かない／入り直すと鬼も栗も戻る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ROWS, COLS, makeSolver } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, TARGET, WATER, OGRE, BURR, PLATE, CHEST, PUSHES, CHEST_CONTENTS, ogreSearch,
} from '../scripts/migrate-d6-3-4-ogre-burr-roll.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 鬼火薬の栗転がし ① データ', () => {
	test('盤面・中身（ルピー×100）・栗が踏み板に乗ると現れる・敵は島の爆弾鬼1体・宣言あり', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(Object.keys(room.bgTiles ?? {}).sort(), '水が鬼の島の周りと違う').toEqual([...WATER].sort());
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(room.showConditions?.[CHEST]?.trigger, '宝箱の出る条件が栗の踏み板でない').toBe('stonesPlaced');
		expect(room.enemiesRespawn, '入り直しても鬼が戻らない').toBe(true);
		const [or, oc] = OGRE.split(',').map(Number);
		expect(room.tiles[or][oc]).toBe(TILE.BOMB_OGRE);
		for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
			if (dr || dc) expect(WATER, `鬼の島の縁 ${or + dr},${oc + dc} が水でない＝鬼が歩いて出られる`).toContain(`${or + dr},${oc + dc}`);
		}
		expect(stageThreat(room, ENEMY_META), '脅威度が看板部屋 2,3 以上').toBeLessThan(stageThreat(stages['2,3'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((d) => d.layer === LAYER && d.stage === ROOM), '敵の宣言（EXTRA_ENEMY_ROOMS）が無い').toBe(true);
	});

	test('鬼ありの BFS：自分の爆弾1個・5押し（想定の手順）／鬼なしのソルバー：爆弾5個・入って詰まない', () => {
		const t = room.tiles.map((r) => (Array.isArray(r) ? [...r] : [...String(r)]));
		const water = new Set(Object.keys(room.bgTiles));
		const o = ogreSearch(t, water);
		expect(o.sol?.bombs, '鬼に投げさせても自分の爆弾が1個で済まない').toBe(1);
		expect(o.sol?.path, '最短の押し方が想定と違う').toEqual(PUSHES.map((p) => `${p.own ? '自' : '鬼'}@${p.seat}→${p.to}`));
		const grid = t.map((r) => r.slice());
		for (const k of [...water, OGRE]) { const [r, c] = k.split(',').map(Number); grid[r][c] = TILE.WALL; }
		const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
		const S = makeSolver(grid, bg, [], {}, new Set(), { hasLadder: false, hasCandle: true, noTools: false });
		const starts = S.exitCells.map((cell) => { const [r, c] = cell.split(',').map(Number); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
		const goal = (st) => st.split('|')[5] === '1';
		const m = measureMetrics(S, starts, goal, () => 0, { guardMax: 4000000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
		expect(m.L, '鬼なしで解けない').not.toBeNull();
		expect(m.noEscape, '入って詰む状態がある').toBe(0);
	});
});

// ── ② 実機 ───────────────────────────────────────────────────────────
const GAME = '/blade-of-lumia/game/';
const url = (row, col) => `${GAME}?${new URLSearchParams({
	fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
	ps_weapon: '1', ps_bomb: '1', ps_bow: '1', ps_hearts: '10',
})}`;
async function boot(page, row, col, { noGod = false } = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url(row, col));
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 1);
	// プレビューは既定で無敵＝被弾を測る回は G で切る
	if (noGod) await page.keyboard.press('g');
	await page.evaluate(() => { const g = window.__game; g.pause(); g.getPlayer()._shownSubItemHint = true; g.step(2); });
	return errors;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
const snap = (page) => page.evaluate(({ burr, chest }) => {
	const g = window.__game;
	const ss = g.getStageState();
	const p = g.getPlayer();
	const s = ss.stonePositions?.[burr];
	return {
		burr: s ? `${s.r},${s.c}` : burr,
		hp: p.hp,
		pos: `${p.y},${p.x}`,
		ogre: g.getEnemies().map((e) => `${e.y},${e.x}`),
		thrownAt: g.getProjectiles().filter((q) => q.owner === 'enemy' && q.type === 'thrownBomb').map((q) => `${q.targetY},${q.targetX}`),
		chestShown: ss.conditionsMet.includes(chest),
		opened: ss.openedChests.includes(chest),
		rupees: p.rupees ?? 0,
		stageKey: g.getState().stageKey,
	};
}, { burr: BURR, chest: CHEST });
// 座 seat に立ったまま、そこを狙った鬼の爆弾が出るまで待つ（出たら true）
async function waitThrowAt(page, seat, maxTicks = 120) {
	for (let t = 0; t < maxTicks; t++) {
		await step(page, 1);
		if ((await snap(page)).thrownAt.includes(seat)) return true;
	}
	return false;
}
// 投げさせて escape へ逃げ、栗が止まるまで待つ
async function ogrePush(page, seat, escape) {
	expect(await waitThrowAt(page, seat), `${seat} に立っても鬼が投げてこない`).toBe(true);
	for (const [d, n] of escape) await walk(page, d, n);
	await step(page, 16);   // 飛ぶ残り＋転がる
	return snap(page);
}

test.describe('D6 鬼火薬の栗転がし ② 実機', () => {
	test('通し：鬼の爆弾4回＋自分の爆弾1個で栗が踏み板に乗り、宝箱が現れてルピー×100 が手に入る', async ({ page }) => {
		const errors = await boot(page, 7, 2);
		let s = await ogrePush(page, '7,2', [['up', 2]]);
		expect(s.burr, '①鬼の爆風で栗が東へ転がらない').toBe('7,7');
		// ② (5,2) → (5,6) → (8,6) → (8,7)：届きの外＝自分の爆弾
		await walk(page, 'right', 4); await walk(page, 'down', 3); await walk(page, 'right', 1);
		expect((await snap(page)).pos, '栗の南 (8,7) に着いていない').toBe('8,7');
		await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bomb'; window.__game.useSubItem(); });
		await walk(page, 'left', 2);
		await step(page, 24);
		s = await snap(page);
		expect(s.burr, '②自分の爆弾で栗が北へ転がらない').toBe('2,7');
		// ③ (8,5) → (2,5) → (2,6)
		await walk(page, 'up', 6); await walk(page, 'right', 1);
		s = await ogrePush(page, '2,6', [['left', 2]]);
		expect(s.burr, '③鬼の爆風で栗が東へ転がらない').toBe('2,8');
		// ④ (2,4) → (4,4) → (4,10) → (1,10) → (1,8)：木を東から回る
		await walk(page, 'down', 2); await walk(page, 'right', 6); await walk(page, 'up', 3); await walk(page, 'left', 2);
		s = await ogrePush(page, '1,8', [['right', 2]]);
		expect(s.burr, '④鬼の爆風で栗が南へ転がらない').toBe('6,8');
		expect(s.chestShown).toBe(false);
		// ⑤ (1,10) → (5,10) → (5,7) → (6,7)
		await walk(page, 'down', 4); await walk(page, 'left', 3); await walk(page, 'down', 1);
		s = await ogrePush(page, '6,7', [['down', 2]]);
		expect(s.burr, '⑤鬼の爆風で栗が踏み板へ転がらない').toBe(PLATE);
		expect(s.chestShown, '栗が踏み板に乗ったのに宝箱が現れない').toBe(true);
		const rupees0 = s.rupees;
		await walk(page, 'right', 3);
		await step(page, 4);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toBe(true);
		expect(s.rupees, '宝箱でルピー×100 が増えない').toBe(rupees0 + 100);
		expect(errors).toEqual([]);
	});

	test('投げられた瞬間に離れれば傷まない（栗は転がる）／対照：立ちっぱなしは傷む', async ({ page }) => {
		await boot(page, 7, 2, { noGod: true });
		const hp0 = (await snap(page)).hp;
		let s = await ogrePush(page, '7,2', [['up', 2]]);
		expect(s.burr, '離れても栗が転がらない').toBe('7,7');
		expect(s.hp, '投げられた瞬間に2マス離れたのに傷んだ').toBe(hp0);
		// 対照：入り直しの代わりに新しく起動して、座に立ったまま着弾を待つ
		await boot(page, 7, 2, { noGod: true });
		expect(await waitThrowAt(page, '7,2')).toBe(true);
		await step(page, 16);
		s = await snap(page);
		expect(s.burr, '立ちっぱなしでも栗は転がる（対照の前提）').toBe('7,7');
		expect(s.hp, '着弾の真ん中に立っていたのに傷まない＝離れる意味が無い').toBeLessThan(hp0);
	});

	test('届きの外 (8,7) では鬼は投げてこない＝栗は動かない（自分の爆弾が要る）', async ({ page }) => {
		const errors = await boot(page, 7, 2);
		expect((await ogrePush(page, '7,2', [['up', 2]])).burr).toBe('7,7');
		await walk(page, 'right', 4); await walk(page, 'down', 3); await walk(page, 'right', 1);
		let thrown = 0;
		for (let t = 0; t < 150; t++) { await step(page, 1); if ((await snap(page)).thrownAt.length) thrown++; }
		const s = await snap(page);
		expect(s.pos).toBe('8,7');
		expect(thrown, '届きの外なのに鬼が投げてきた').toBe(0);
		expect(s.burr, '投げてこないのに栗が動いた').toBe('7,7');
		expect(errors).toEqual([]);
	});

	test('鬼は1マスの島から動かない', async ({ page }) => {
		await boot(page, 5, 4);
		for (let i = 0; i < 4; i++) { await walk(page, 'right', 4); await walk(page, 'left', 4); }
		expect((await snap(page)).ogre, '鬼が島から動いた').toEqual([OGRE]);
	});

	test('鬼を倒して栗を動かしても、部屋を出て入り直すと鬼も栗も戻る', async ({ page }) => {
		await boot(page, 5, 2);
		await page.evaluate(() => { const g = window.__game; const e = g.getEnemies()[0]; g.dealDamage(e.id, 99, 'arrow'); g.step(4); });
		await walk(page, 'down', 2);   // (7,2)＝栗の西
		await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bomb'; window.__game.useSubItem(); });
		await walk(page, 'up', 2);
		await step(page, 24);
		let s = await snap(page);
		expect(s.ogre, '鬼が倒れていない（前提）').toEqual([]);
		expect(s.burr, '自分の爆弾で栗が動いていない（前提）').toBe('7,7');
		// (5,2) → 西の口 (5,0) から `2,4` へ出て、戻る
		await page.evaluate(() => window.__game.resume?.());
		for (let i = 0; i < 20 && (await snap(page)).stageKey === ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('left'));
			await page.waitForTimeout(100);
		}
		await page.waitForFunction(() => window.__game.getState().stageKey === '2,4', null, { timeout: 5000 });
		for (let i = 0; i < 8 && (await snap(page)).stageKey !== ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('right'));
			await page.waitForTimeout(150);
		}
		await page.waitForFunction((rm) => window.__game.getState().stageKey === rm, ROOM, { timeout: 5000 });
		await page.waitForFunction(() => window.__game.getEnemies().length === 1, null, { timeout: 3000 });
		s = await snap(page);
		expect(s.ogre, '入り直しても鬼が戻らない').toEqual([OGRE]);
		expect(s.burr, '入り直しても栗が元の位置に戻らない').toBe(BURR);
	});
});
