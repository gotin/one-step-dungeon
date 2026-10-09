// tests/d5-frozen-four-ponds.spec.js
// dungeon_5 `3,2`（通り道・地図の部屋）「凍れる四つ池の辻」の番人
// （2026-10-09 / PLAN 実行キュー 40 の第3陣 3室目・盤面は `scripts/migrate-d5-3-2-frozen-four-ponds.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 3,2` の写し＝氷の廃墟なのに水も氷も無い四角い広間の真ん中に、地図が落ちているだけだった。
//
// 新しい盤面（'k'＝氷・'~'＝水＝どちらも bgTiles）:
//      1 #&~~~~k~~~&#
//      2 #~~&~~k~&~~#
//      3 #&~~~~k~~~&#
//      4 .kkkkkmkkkk.   ← 地図 m (4,6)＝十字の交わり
//      5 .~~~~~k~~~~.
//      6 #&~~~~k~~~&#
//      7 #~~&~~k~&~~#
//      8 #&~~~~k~~~&#
//   幅1の十字の氷の堤が4つの口をつなぎ、四隅は4つの池。各池に魚群 & が3体。
//
// 守るものは2つ。
//   ① データ（幾何）：盤面と下地・敵と宣言・地図が同じセル・報酬なし／4つの口が道具なしでつながり、
//      はしごで増えない／池は4つで別々・各池に魚群3体・堤は両側が池で交わりだけが池に接しない／層の到達性。
//   ② 挙動（実機）：魚群は自分の池から出ない（陸にも別の池にも行かない）／堤の上に立つと両側の池から群がり
//      削られる・交わりでは削られない／寄って来た群れは堤から斬れる／駆け抜ければ口から口へ抜けられ、地図も拾える。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { TARGET, WATER, ICE, ENEMIES, EXITS, HUB, MAP_CELL, effective, walkable, ponds, pondsTouching }
	from '../scripts/migrate-d5-3-2-frozen-four-ponds.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '3,2';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const P = (k) => k.split(',').map(Number);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 3,2 凍れる四つ池の辻 ① データ', () => {
	test('盤面・水と氷の下地・敵の宣言・地図が同じセル・報酬なし', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const bgWater = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.WATER).sort();
		const bgIce = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.ICE).sort();
		expect(bgWater, '水は bgTiles').toEqual([...WATER].sort());
		expect(bgIce, '堤は氷の bgTiles').toEqual([...ICE].sort());
		expect(Object.keys(st.bgTiles).length).toBe(WATER.length + ICE.length);
		for (const [k, ch] of Object.entries(ENEMIES)) {
			const [r, c] = P(k);
			expect(st.tiles[r][c], `${k} の敵`).toBe(ch);
			expect(ENEMY_META[ch].move, `${k} の敵が水棲でない`).toBe('water');
			expect(WATER, `${k} の敵が水の上にいない`).toContain(k);
		}
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'5.5m の配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		const [mr, mc] = P(MAP_CELL);
		expect(st.tiles[mr][mc], '地図が書き換え前と同じセルに無い').toBe(TILE.ITEM_DUNGEON_MAP);
		expect(Object.keys(st.chestContents ?? {}), '報酬なしの通り道に宝箱がある').toEqual([]);
		expect(Object.keys(st.floorItems ?? {}), '報酬なしの通り道に拾い物がある').toEqual([]);
	});

	test('4つの口が道具なしでつながり、はしごがあっても歩ける床は増えない', () => {
		const t = effective();
		const foot = walkable(t, EXITS.南[1]);
		for (const [name, cells] of Object.entries(EXITS)) {
			for (const k of cells) expect(foot.has(k), `南の口から${name}の口 ${k} へ歩けない`).toBe(true);
		}
		expect(walkable(t, EXITS.南[1], true).size, 'はしごで歩ける床が増えた').toBe(foot.size);
	});

	test('池は4つで別々・各池に魚群3体・堤は両側が池で交わりだけが池に接しない', () => {
		const bodies = ponds();
		expect(bodies.length, '池がつながっている（群れが池をまたいで追える）').toBe(4);
		for (const b of bodies) {
			expect(Object.keys(ENEMIES).filter((k) => b.includes(k)).length, '池の魚群の数').toBe(3);
		}
		const foot = walkable(effective(), EXITS.南[1]);
		const dike = [...foot].filter((k) => { const [r, c] = P(k); return r >= 1 && r <= 8 && c >= 1 && c <= 10; });
		for (const k of dike) {
			if (HUB.includes(k)) expect(pondsTouching(k), `交わり ${k} が池に接している`).toBe(0);
			else expect(pondsTouching(k), `堤 ${k} の両側が池でない`).toBe(2);
		}
		expect(HUB).toContain(MAP_CELL);
	});

	test('層の接続：徒歩で 3,2 を通れる・はしごで全室・dead-edge 0', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const ladder = bfsLayer(stages, START, { withLadder: true, openTiles: OPEN });
		expect(ladder.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(ladder.reachedRooms.size).toBe(Object.keys(stages).length);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		// 徒歩で入れる東側の部屋（書き換え前と同じ 14 室）。3,2 の4つの口は道具なしでつながる。
		for (const k of ['2,2', '3,1', '3,2', '3,3', '4,2']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
		expect(foot.reachedRooms.size).toBe(14);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '10' });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction((n) => window.__game.getEnemies().length === n, Object.keys(ENEMIES).length);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）∴HP を測る本は 'g' で切る。
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// plan＝tick ごとの手（'down' 等 / null＝立ち止まり）。slash なら隣に来た魚群を斬る。
const runPlan = (page, plan, ticks, slash = false) => page.evaluate(({ plan, ticks, slash }) => {
	const g = window.__game;
	const hp0 = g.getState().player.hp;
	const tracks = {};
	let maxNear = 0;
	for (let i = 0; i < ticks; i++) {
		if (plan[i]) g.movePlayer(plan[i]);
		const pl = g.getPlayer();
		if (slash) {
			const e = g.getEnemies().find((x) => Math.abs(x.y - pl.y) + Math.abs(x.x - pl.x) <= 1.1);
			if (e) {
				const dy = e.y - pl.y, dx = e.x - pl.x;
				g.setHeroDir(Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 'up' : 'down') : (dx < 0 ? 'left' : 'right'));
				g.swordAttack();
			}
		}
		g.step(1);
		const p = g.getPlayer();
		const es = g.getEnemies();
		for (const e of es) (tracks[e.id] ??= []).push([e.y, e.x]);
		maxNear = Math.max(maxNear, es.filter((e) => Math.hypot(e.y - p.y, e.x - p.x) <= 1.5).length);
	}
	const p = g.getPlayer();
	return { tracks, maxNear, hpLost: hp0 - g.getState().player.hp, left: g.getEnemies().length, r: p.y, c: p.x };
}, { plan, ticks, slash });
const rep = (d, n) => Array(n).fill(d);

test.describe('D5 3,2 凍れる四つ池の辻 ② 実機', () => {
	test('魚群は自分の池から出ない（陸にも別の池にも行かない）', async ({ page }) => {
		// 堤の4本の腕を行き来して群れを振り回す。
		const errors = await boot(page, 4, 6);
		const plan = [...rep('left', 10), ...rep('right', 20), ...rep('left', 10), ...rep('up', 6), ...rep('down', 14), ...rep('up', 8)];
		const r = await runPlan(page, plan, plan.length + 20);
		const pondOf = new Map();
		ponds().forEach((b, i) => b.forEach((k) => pondOf.set(k, i)));
		for (const [id, tr] of Object.entries(r.tracks)) {
			const home = pondOf.get(id);
			expect(home, `敵 ${id} が池から始まっていない`).not.toBeUndefined();
			for (const [y, x] of tr) {
				const k = `${Math.round(y)},${Math.round(x)}`;
				expect(pondOf.get(k), `魚群 ${id} が ${k} へ出た（自分の池の外）`).toBe(home);
			}
		}
		expect(errors).toEqual([]);
	});

	test('堤に立つと両側の池から群がって削られ、交わりでは削られない', async ({ page }) => {
		for (const [row, col] of [[2, 6], [7, 6], [4, 2], [4, 9]]) {
			const errors = await boot(page, row, col);
			const r = await runPlan(page, [], 120);
			expect(r.maxNear, `堤 (${row},${col}) に群れが3体以上寄らない`).toBeGreaterThanOrEqual(3);
			expect(r.hpLost, `堤 (${row},${col}) で 120 tick 立ち止まっても削られない`).toBeGreaterThan(0);
			expect(errors).toEqual([]);
		}
		const [hr, hc] = P(HUB[0]);
		const errors = await boot(page, hr, hc);
		const r = await runPlan(page, [], 120);
		expect(r.hpLost, `交わり ${HUB[0]} で削られた`).toBe(0);
		expect(errors).toEqual([]);
	});

	test('寄って来た群れは堤から斬れる', async ({ page }) => {
		// (3,6) は北の2つの池の脇＝左右の水へ寄って来た群れを斬る（斜めの魚は斬らない＝隣だけ）。
		const errors = await boot(page, 3, 6);
		const r = await runPlan(page, [], 120, true);
		expect(Object.keys(ENEMIES).length - r.left, '堤から斬って群れを減らせない').toBeGreaterThanOrEqual(4);
		expect(errors).toEqual([]);
	});

	test('駆け抜ければ南の口から地図を拾って西の口へ抜けられる', async ({ page }) => {
		const errors = await boot(page, 9, 6);
		const r = await runPlan(page, [...rep('up', 10), ...rep('left', 14)], 30);
		expect(r.c, '西の口まで抜けられない').toBeLessThan(0);
		const hasMap = await page.evaluate((lk) => !!window.__game.getPlayer().dungeonItems?.[lk]?.hasMap, LAYER);
		expect(hasMap, '交わりの地図を拾えていない').toBe(true);
		expect(errors).toEqual([]);
	});
});
