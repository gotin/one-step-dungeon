// tests/d2-burrow-basin.spec.js
// dungeon_2 `3,0`（西の枝の行き止まり）「砂蟲の祭壇」の番人
// （2026-10-10 / PLAN 実行キュー 41 の第2陣 3室目・盤面は `scripts/migrate-d2-3-0-burrow-basin.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_1 3,0` から魔物 W と宝箱を抜いた写し＝四角い広間に回復薬1つだけ（敵なし）。
//
// 新しい盤面（床が砂の広間の真ん中に、壁で囲った小さな祭壇）:
//      3 #...####...#   ← 祭壇の壁
//      4 ....#B.#...#   ← 祭壇の奥に宝箱（地中蟲を全滅させると現れる）
//      5 ....#..#...#   ← 祭壇の中は石畳
//      6 #..........#   ← 祭壇の口は南
//      7 #..α....α..#   ← 地中蟲 α×2（砂の下を寄ってきて、1.0 秒だけ浮いて噛む）
//   浮いた α にブーメランを当てると気絶して潜れず噛めない＝止めてから斬る（D5 0,1 の鮫の陸の予告）。
//
// 守るものは2つ。
//   ① データ（幾何）：α が2体・砂の床・祭壇の口は南だけ・宝箱は全滅で現れる・層の到達性。
//   ② 挙動（実機）：放っておけば α は浮いて1秒で潜る／ブーメランを当てた α は気絶のあいだ浮いたまま潜らない／
//      全滅させると宝箱が現れる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET, WORMS, ALTAR_MOUTH, ENTRY, CHEST, CHEST_CONTENT, CHEST_CONDITION, inAltar, reach,
} from '../scripts/migrate-d2-3-0-burrow-basin.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_2';
const ROOM = '3,0';
const stages = map.layers[LAYER].stages;

const P = (k) => k.split(',').map(Number);
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const cellsOf = (t, pred) => {
	const out = [];
	t.forEach((row, r) => row.forEach((ch, c) => { if (pred(ch)) out.push(`${r},${c}`); }));
	return out;
};

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D2 3,0 砂蟲の祭壇 ① データ', () => {
	test('盤面・敵は α×2・脅威度は看板部屋より軽い・宝箱は全滅で現れる・宣言', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		const enemies = cellsOf(t, (ch) => !!ENEMY_META[ch]).map((k) => `${t[P(k)[0]][P(k)[1]]}@${k}`);
		expect(enemies, '敵は地中蟲 α 2体だけ').toEqual(WORMS.map((k) => `${TILE.BURROW_WORM}@${k}`));
		const threat = stageThreat(st, ENEMY_META);
		expect(threat).toBeGreaterThan(0);
		expect(threat, '看板部屋 2,1 の 25.0 を超えた').toBeLessThan(25);
		expect(st.chestContents).toEqual({ [CHEST]: CHEST_CONTENT });
		expect(st.showConditions, '宝箱が全滅で現れる形でない').toEqual({ [CHEST]: CHEST_CONDITION });
		for (const k of ['signData', 'floorItems', 'mapEnters']) expect(Object.keys(st[k] ?? {}), `${k} が空でない`).toEqual([]);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS の宣言').toBe(true);
	});

	test('下地：祭壇の外の床は全部砂・祭壇の中は石畳・α は砂の上（下地は盤面から引く）', () => {
		const t = gridOf();
		const bg = stages[ROOM].bgTiles ?? {};
		const floors = cellsOf(t, (ch) => !BLOCKED.has(ch) || ch === TILE.CHEST);
		for (const k of floors) expect(bg[k], `${k} の下地`).toBe(inAltar(k) ? TILE.STONE_FLOOR : TILE.SAND);
		expect(Object.keys(bg).length, '壁に下地がある').toBe(floors.length);
		for (const k of cellsOf(t, (ch) => ch === TILE.BURROW_WORM)) expect(bg[k], `α ${k} が砂の上に居ない`).toBe(TILE.SAND);
	});

	test('祭壇の口は南の2マスだけ＝口を塞ぐと祭壇の中（宝箱の隣）へ届かない', () => {
		const t = gridOf();
		const chest = cellsOf(t, (ch) => ch === TILE.CHEST);
		expect(chest, '宝箱が1つでない').toEqual([CHEST]);
		const cut = reach(t, ENTRY, new Set(ALTAR_MOUTH));
		for (const k of ['5,5', '5,6', '4,6']) expect(cut.has(k), `口を通らずに祭壇の中 ${k} へ届く`).toBe(false);
	});

	test('対照：口を塞がなければ祭壇の中・α・回復薬へ歩ける（測定が空虚でない）', () => {
		const seen = reach(gridOf(), ENTRY);
		for (const k of ['5,5', '5,6', '4,6', ...WORMS, '8,1']) expect(seen.has(k), `${k} へ歩けない`).toBe(true);
	});

	test('層の接続：dead-edge 0・徒歩で 15 室（書き換え前と同じ）', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(foot.reachedRooms.size, '徒歩で歩ける部屋数').toBe(15);
		for (const k of ['2,0', '3,0']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: '4', col: '1', ps_weapon: '1', ps_hearts: '3', ...extra });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 2);
	await page.evaluate(() => window.__game.pause());
	return errors;
}

test.describe('D2 3,0 砂蟲の祭壇 ② 実機', () => {
	test('放っておけば α は浮いて1秒ほどで潜る（浮いている最長の連続 tick を測る）', async ({ page }) => {
		const errors = await boot(page);
		// 周期は 1.6 秒潜って 1.0 秒浮く（TICK 120ms＝浮上 8〜9 tick）∴120 tick で3周以上見られる。
		const r = await page.evaluate(() => {
			const g = window.__game;
			const run = {}, best = {};
			let surfacedEver = 0;
			for (let i = 0; i < 120; i++) {
				g.step(1);
				for (const e of g.getEnemies()) {
					run[e.id] = e.hidden ? 0 : (run[e.id] ?? 0) + 1;
					best[e.id] = Math.max(best[e.id] ?? 0, run[e.id]);
					if (!e.hidden) surfacedEver++;
				}
			}
			return { best: Object.values(best), surfacedEver };
		});
		expect(r.surfacedEver, 'α が一度も浮かない').toBeGreaterThan(0);
		for (const b of r.best) expect(b, '放っておいても α が長く浮いたまま＝潜る周期が無い').toBeLessThanOrEqual(10);
		expect(errors).toEqual([]);
	});

	test('浮いた α にブーメランを当てると、気絶のあいだ浮いたまま潜らない（自然に浮いている長さより長い）', async ({ page }) => {
		const errors = await boot(page, { ps_boomerang: '1' });
		// 西の口の脇 (4,1) で待ち、浮いた α が行か列に揃い届き（←↑4／→↓5）に入ったら投げる。
		const r = await page.evaluate(() => {
			const g = window.__game;
			let stunnedId = null, threwAt = null;
			for (let i = 0; i < 200 && stunnedId == null; i++) {
				const pl = g.getPlayer();
				const t = g.getState().gameTime;
				const flying = g.getProjectiles().some((x) => x.owner === 'player');
				const aim = g.getEnemies().find((e) => !e.hidden && (
					(Math.abs(e.y - pl.y) < 0.5 && ((e.x < pl.x && pl.x - e.x <= 4) || (e.x > pl.x && e.x - pl.x <= 5))) ||
					(Math.abs(e.x - pl.x) < 0.5 && ((e.y < pl.y && pl.y - e.y <= 4) || (e.y > pl.y && e.y - pl.y <= 5)))));
				if (aim && !flying) {
					const dx = aim.x - pl.x, dy = aim.y - pl.y;
					g.setHeroDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
					g.useSubItem();
					threwAt = threwAt ?? i;
				}
				g.step(1);
				const hit = g.getEnemies().find((e) => (e.stunUntil ?? 0) > g.getState().gameTime);
				if (hit) stunnedId = hit.id;
			}
			if (stunnedId == null) return { threwAt, stunnedId };
			// 気絶した α が浮いたままの連続 tick と、気絶が解けた後に潜るかを見る。
			let surfaced = 1, hidAfter = false;
			for (let i = 0; i < 40; i++) {
				g.step(1);
				const e = g.getEnemies().find((x) => x.id === stunnedId);
				if (!e) break;
				const stunned = (e.stunUntil ?? 0) > g.getState().gameTime;
				if (!e.hidden && (stunned || !hidAfter)) { if (!hidAfter) surfaced++; }
				if (e.hidden) { hidAfter = true; break; }
			}
			return { threwAt, stunnedId, surfaced, hidAfter };
		});
		expect(r.threwAt, '浮いた α に一度も投げる線が揃わない').not.toBeNull();
		expect(r.stunnedId, 'ブーメランが浮いた α を気絶させない').not.toBeNull();
		expect(r.surfaced, '気絶した α がすぐ潜った＝止めても潜る').toBeGreaterThanOrEqual(12);
		expect(r.hidAfter, '気絶が解けても潜らない＝周期が壊れている').toBe(true);
		expect(errors).toEqual([]);
	});

	test('α が生きている間は宝箱が無く、2体とも倒すと現れる', async ({ page }) => {
		const errors = await boot(page);
		const chestShown = () => page.evaluate((k) => window.__game.getStageState().conditionsMet.includes(k), CHEST);
		expect(await chestShown(), '倒す前から宝箱が出ている').toBe(false);
		// 潜っている α は無敵（hide）＝浮くまで待ってから倒す（周期 2.6 秒＝22 tick 以内に必ず浮く）。
		const killOne = () => page.evaluate(() => {
			const g = window.__game;
			for (let i = 0; i < 40; i++) {
				const e = g.getEnemies().find((x) => !x.hidden);
				if (e) { g.dealDamage(e.id, 99, 'sword', e.x, e.y); g.step(2); return true; }
				g.step(1);
			}
			return false;
		});
		expect(await killOne(), 'α が浮かない').toBe(true);
		expect(await chestShown(), '1体残っているのに宝箱が出た').toBe(false);
		expect(await killOne(), '残りの α が浮かない').toBe(true);
		expect(await page.evaluate(() => window.__game.getEnemies().length)).toBe(0);
		expect(await chestShown(), '2体とも倒しても宝箱が現れない').toBe(true);
		expect(errors).toEqual([]);
	});
});
