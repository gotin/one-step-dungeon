// tests/d5-frozen-lake-floes.spec.js
// dungeon_5 `1,1`（石碑が湖を語る部屋）「凍れる湖の浮氷」の番人
// （2026-10-05 / PLAN 実行キュー 40 の第1陣 3室目・盤面は `scripts/migrate-d5-1-1-frozen-lake-floes.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 1,1` の写し＝四角い広間に水の帯が1本あるだけ。石碑「凍れる湖に橋を架けよ。
//   はしごを使え。」が語る湖が無かった。
//
// 新しい盤面（水は bgTiles）:
//      1 #~~~~..~~~~#     ← 北の岸（本筋＝鍵の部屋 `1,0`）
//      2 #~~~~.~.~~~#
//      3 #~~~~~~~~~~#
//      4 ..~.~~~.~.~#     ← 西の岸（寄道＝鉄の盾 `0,1`）・浮氷
//      5 ..~~~.~~~~~#     ← おとりの浮氷 (5,5)＝南の岸から幅2
//      6 #~~.~~~~~.~#
//      7 #~~~~~~~~~~#
//      8 #†.........#     ← 南の岸・石碑
//   湖に魚群 & ×5。
//
// 守るものは2つ。
//   ① データ（幾何）：浮氷の並び・本筋5回／寄道3回・おとりに届かない・どの浮氷も要る（対照つき）・層の接続。
//   ② 挙動（実機）：はしご無しでは南の岸から出られない／はしごで浮氷を渡って北の口から `1,0` へ出る／
//      魚群が渡りの水に居座るとはしごで渡れない（斬れば渡れる）／浮氷の上では魚群が複数寄って来る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET, WATER, ENEMIES, EXITS, MONUMENT, DECOY, NORTH_ROUTE, WEST_ROUTE, effective, reach, floes,
} from '../scripts/migrate-d5-1-1-frozen-lake-floes.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '1,1';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const P = (k) => k.split(',').map(Number);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 1,1 凍れる湖の浮氷 ① データ', () => {
	test('盤面・水は bgTiles・石碑（本文は旧のまま）・魚群5体・宣言', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(Object.keys(st.bgTiles).sort()).toEqual([...WATER].sort());
		expect(Object.values(st.bgTiles).every((v) => v === TILE.WATER)).toBe(true);
		expect(st.signData).toEqual({ [MONUMENT]: { name: '氷の廃墟の石碑', lines: ['「凍れる湖に橋を架けよ。はしごを使え。」'] } });
		for (const [k, ch] of Object.entries(ENEMIES)) {
			const [r, c] = P(k);
			expect(st.tiles[r][c], `${k} の敵`).toBe(TILE.FISH_SCHOOL);
			expect(ch).toBe(TILE.FISH_SCHOOL);
			expect(st.bgTiles[k], `${k} の魚群が水の上にいない`).toBe(TILE.WATER);
		}
		expect(Object.keys(ENEMIES).length).toBe(5);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), '5.5m の配置表の外の敵＝宣言が無い').toBe(true);
	});

	test('浮氷の並び：本筋は5回・寄道は3回渡る・おとりには届かない・はしご無しでは出られない', () => {
		const t = effective();
		expect(floes(t).sort()).toEqual([...NORTH_ROUTE.slice(0, 4), ...WEST_ROUTE.slice(0, 2), DECOY].sort());
		const foot = reach(t);
		for (const k of [...EXITS.north, ...EXITS.west]) expect(foot.has(k), `はしご無しで ${k} に届く`).toBe(false);
		const ladder = reach(t, { withLadder: true });
		NORTH_ROUTE.forEach((k, i) => expect(ladder.get(k), `本筋 ${k} は ${i + 1} 回目`).toBe(i + 1));
		WEST_ROUTE.forEach((k, i) => expect(ladder.get(k), `寄道 ${k} は ${i + 1} 回目`).toBe(i + 1));
		expect(ladder.get('0,5'), '北の口').toBe(5);
		expect(ladder.get('4,0'), '西の口').toBe(3);
		expect(ladder.has(DECOY), 'おとりに届く').toBe(false);
	});

	test('対照：浮氷を1枚でも水にすると届かない・おとりの下を床にすると届く（測定が空虚でない）', () => {
		for (const k of [...NORTH_ROUTE.slice(0, 4)]) {
			const g = effective(); const [r, c] = P(k); g[r][c] = TILE.WATER;
			expect(reach(g, { withLadder: true }).has('0,5'), `${k} を水にしても北の口に届く`).toBe(false);
		}
		for (const k of WEST_ROUTE.slice(0, 2)) {
			const g = effective(); const [r, c] = P(k); g[r][c] = TILE.WATER;
			expect(reach(g, { withLadder: true }).has('4,0'), `${k} を水にしても西の口に届く`).toBe(false);
		}
		const g = effective(); g[6][5] = TILE.FLOOR;
		expect(reach(g, { withLadder: true }).has(DECOY), '(6,5) を床にしてもおとりに届かない').toBe(true);
	});

	test('層の接続：はしごがあれば全室・dead-edge 0・はしご無しでは 1,1 に入れない', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const ladder = bfsLayer(stages, START, { withLadder: true, openTiles: OPEN });
		expect(ladder.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(ladder.reachedRooms.size).toBe(Object.keys(stages).length);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.reachedRooms.has(ROOM)).toBe(false);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col, { ladder = true, god = true } = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '6' });
	if (ladder) q.set('ps_ladder', '1');
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 5);
	// プレビューは debugMode＝無敵かつ敵をすり抜ける∴魚群とぶつかる本は 'g' で切る
	if (!god) await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
const snap = (page) => page.evaluate(() => {
	const g = window.__game.getState();
	const p = window.__game.getPlayer();
	return { stage: g.stageKey, pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}` };
});

test.describe('D5 1,1 凍れる湖の浮氷 ② 実機', () => {
	test('はしご無しでは南の岸から浮氷へ渡れない', async ({ page }) => {
		const errors = await boot(page, 8, 9, { ladder: false });
		await walk(page, 'up', 2);
		expect(await snap(page), 'はしご無しで水を渡れた').toEqual({ stage: ROOM, pos: '8,9' });
		expect(errors).toEqual([]);
	});

	test('はしごがあっても、おとりの浮氷 (5,5) へは渡れない（幅2）', async ({ page }) => {
		const errors = await boot(page, 8, 5);
		await walk(page, 'up', 3);
		expect(await snap(page), '幅2の水を渡れた').toEqual({ stage: ROOM, pos: '8,5' });
		expect(errors).toEqual([]);
	});

	test('通し：はしごで浮氷を5回渡って北の口から 1,0 へ出る', async ({ page }) => {
		const errors = await boot(page, 8, 9);
		const trail = [];
		for (const [d, n] of [['up', 2], ['up', 2], ['left', 2], ['up', 2], ['left', 2]]) { await walk(page, d, n); trail.push((await snap(page)).pos); }
		expect(trail, '浮氷の並び').toEqual(NORTH_ROUTE);
		await page.evaluate(() => { for (let i = 0; i < 8; i++) { window.__game.movePlayer('up'); window.__game.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '1,0', null, { timeout: 5000 });
		expect(errors).toEqual([]);
	});

	test('通し：はしごで浮氷を3回渡って西の口から 0,1 へ出る', async ({ page }) => {
		const errors = await boot(page, 8, 3);
		const trail = [];
		for (const [d, n] of [['up', 2], ['up', 2], ['left', 2]]) { await walk(page, d, n); trail.push((await snap(page)).pos); }
		expect(trail).toEqual(WEST_ROUTE);
		await page.evaluate(() => { for (let i = 0; i < 6; i++) { window.__game.movePlayer('left'); window.__game.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '0,1', null, { timeout: 5000 });
		expect(errors).toEqual([]);
	});

	test('魚群が渡りの水に居座ると、はしごでも渡れない・斬って退かせば渡れる', async ({ page }) => {
		const errors = await boot(page, 4, 9, { god: false });
		// 湖の魚群を全部倒し、渡りの水 (4,8) に動かない魚群を1体だけ置く（どの魚が来るかに依存させない）
		await page.evaluate(() => {
			const g = window.__game;
			for (const e of g.getEnemies()) g.dealDamage(e.id, 99);
			g.step(1);
			g.injectEnemy(8, 4, 1, 1, 1, '&', 0);
		});
		expect(await page.evaluate(() => window.__game.getEnemies().length), '置き直しの前提').toBe(1);
		await walk(page, 'left', 2);
		expect((await snap(page)).pos, '魚群が居る水をはしごで渡れた').toBe('4,9');
		// 斬る
		await page.evaluate(() => {
			const g = window.__game;
			for (let i = 0; i < 40 && g.getEnemies().length; i++) { g.setHeroDir('left'); g.swordAttack(); g.step(1); }
		});
		expect(await page.evaluate(() => window.__game.getEnemies().length), '魚群を斬れない').toBe(0);
		await page.evaluate(() => { for (let i = 0; i < 10; i++) window.__game.step(1); });   // 振りの硬直が解けるまで
		await walk(page, 'left', 2);
		expect((await snap(page)).pos, '退かしても渡れない').toBe('4,7');
		expect(errors).toEqual([]);
	});

	test('浮氷の上では魚群が複数寄って来る・岸では1体ずつ', async ({ page }) => {
		const measure = async (row, col) => {
			await boot(page, row, col, { god: false });
			return page.evaluate(() => {
				const g = window.__game; let adjMax = 0;
				for (let i = 0; i < 120; i++) {
					g.step(1);
					const pl = g.getPlayer();
					adjMax = Math.max(adjMax, g.getEnemies().filter((e) => Math.abs(e.x - pl.x) + Math.abs(e.y - pl.y) <= 1.6).length);
				}
				return adjMax;
			});
		};
		expect(await measure(4, 7), '浮氷 (4,7) に寄って来た魚群の最大数').toBeGreaterThanOrEqual(3);
		expect(await measure(8, 5), '南の岸 (8,5) に寄って来た魚群の最大数').toBeLessThanOrEqual(1);
	});
});
