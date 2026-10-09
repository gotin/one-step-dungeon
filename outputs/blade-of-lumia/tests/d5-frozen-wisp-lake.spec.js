// tests/d5-frozen-wisp-lake.spec.js
// dungeon_5 `3,1`（通り道・コンパスの部屋）「凍れる湖の鬼火」の番人
// （2026-10-09 / PLAN 実行キュー 40 の第3陣 4室目・盤面は `scripts/migrate-d5-3-1-frozen-wisp-lake.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 3,1` の写し＝氷の廃墟なのに水も氷も無い四角い広間の真ん中に、コンパスが落ちているだけだった。
//
// 新しい盤面（'k'＝氷・'~'＝水＝どちらも bgTiles）:
//      1 #~~~~kk~~~~#
//      2 #~kkkkk~~~~#
//      3 #~k~~ψ~~~#~#
//      4 .kk~~~n~~kk.   ← コンパス n (4,6)＝湖へ突き出た桟橋の先
//      5 .kk~#~k~ψk~.
//      6 #~k~ψ~k~~k~#
//      7 #~kkkkkkkk~#
//      8 #~~~~kk~~~~#
//   湖をコの字に巡る幅1の氷の道（＋コンパスへの桟橋）が4つの口をつなぎ、湖の上に呪い火 ψ×3（飛ぶ＝水を越える・剣を封じる）。
//
// 守るものは2つ。
//   ① データ（幾何）：盤面と下地・敵と宣言・コンパスが同じセルで三方が水・報酬なし／4つの口が道具なしで
//      つながる・道は遠回り／層の到達性。
//   ② 挙動（実機）：鬼火は湖の上を飛んで道のプレイヤーへ寄る（水が止めない）／立ち止まると剣を封じられて
//      削られる／弓なら湖越しに射落とせる／駆け抜ければ口から口へ抜けられる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { TARGET, WATER, ICE, ENEMIES, EXITS, ROCKS, COMPASS_CELL, effective, walkable, walkDist, waterSides }
	from '../scripts/migrate-d5-3-1-frozen-wisp-lake.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '3,1';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const P = (k) => k.split(',').map(Number);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 3,1 凍れる湖の鬼火 ① データ', () => {
	test('盤面・水と氷の下地・敵の宣言・コンパスが同じセルで三方が水・報酬なし', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const bgWater = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.WATER).sort();
		const bgIce = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.ICE).sort();
		expect(bgWater, '水は bgTiles').toEqual([...WATER].sort());
		expect(bgIce, '道は氷の bgTiles').toEqual([...ICE].sort());
		expect(Object.keys(st.bgTiles).length).toBe(WATER.length + ICE.length);
		for (const [k, ch] of Object.entries(ENEMIES)) {
			const [r, c] = P(k);
			expect(st.tiles[r][c], `${k} の敵`).toBe(ch);
			expect(ENEMY_META[ch].move, `${k} の敵が飛ばない（水に止められる）`).toBe('air');
			expect(ENEMY_META[ch].inflict?.type, `${k} の敵が剣を封じない`).toBe('sealSword');
			expect(WATER, `${k} の敵が湖の上から始まらない`).toContain(k);
		}
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'5.5m の配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		const [cr, cc] = P(COMPASS_CELL);
		expect(st.tiles[cr][cc], 'コンパスが書き換え前と同じセルに無い').toBe(TILE.ITEM_COMPASS);
		expect(waterSides(COMPASS_CELL), 'コンパスの桟橋の三方が水でない').toBe(3);
		for (const k of ROCKS) expect(st.tiles[P(k)[0]][P(k)[1]], `湖の氷の岩 ${k}`).toBe(TILE.WALL);
		expect(Object.keys(st.chestContents ?? {}), '報酬なしの通り道に宝箱がある').toEqual([]);
		expect(Object.keys(st.floorItems ?? {}), '報酬なしの通り道に拾い物がある').toEqual([]);
	});

	test('4つの口が道具なしでつながり、道は湖を巡る遠回り', () => {
		const t = effective();
		const foot = walkable(t, EXITS.南[1]);
		for (const [name, cells] of Object.entries(EXITS)) {
			for (const k of cells) expect(foot.has(k), `南の口から${name}の口 ${k} へ歩けない`).toBe(true);
		}
		const stranded = [];
		for (let r = 0; r < 10; r++) for (let c = 0; c < 12; c++) {
			if (!BLOCKED.has(t[r][c]) && !foot.has(`${r},${c}`)) stranded.push(`${r},${c}`);
		}
		expect(stranded, '取り残された床').toEqual([]);
		// 北の口→東の口：まっすぐ 9 マスを、湖を巡って 2 倍以上歩く。
		const d = walkDist(t, EXITS.北[1]).get(EXITS.東[0]);
		expect(d, '北→東が湖を巡る遠回りになっていない').toBeGreaterThanOrEqual(18);
	});

	test('層の接続：徒歩で 3,1 を通れる・はしごで全室・dead-edge 0', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const ladder = bfsLayer(stages, START, { withLadder: true, openTiles: OPEN });
		expect(ladder.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(ladder.reachedRooms.size).toBe(Object.keys(stages).length);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		// 徒歩で入れる東側の部屋（書き換え前と同じ 14 室）。3,1 の4つの口は道具なしでつながる。
		for (const k of ['2,1', '3,0', '3,1', '3,2', '4,1']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
		expect(foot.reachedRooms.size).toBe(14);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '10', ps_bow: '1' });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction((n) => window.__game.getEnemies().length === n, Object.keys(ENEMIES).length);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）∴HP を測る本は 'g' で切る。
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// plan＝tick ごとの手（'down' 等 / null＝立ち止まり）。shoot なら縦横に並んだ鬼火を弓で射る。
const runPlan = (page, plan, ticks, shoot = false) => page.evaluate(({ plan, ticks, shoot }) => {
	const g = window.__game;
	const hp0 = g.getState().player.hp;
	const tracks = {};
	let sealed = 0;
	for (let i = 0; i < ticks; i++) {
		if (plan[i]) g.movePlayer(plan[i]);
		if (shoot && i % 3 === 0) {
			const pl = g.getPlayer();
			const e = g.getEnemies().find((x) => Math.abs(x.y - pl.y) < 0.6 || Math.abs(x.x - pl.x) < 0.6);
			if (e) {
				const dy = e.y - pl.y, dx = e.x - pl.x;
				g.setHeroDir(Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 'up' : 'down') : (dx < 0 ? 'left' : 'right'));
				g.useSubItem();
			}
		}
		g.step(1);
		if (g.getState().player.swordSealed) sealed++;
		for (const e of g.getEnemies()) (tracks[e.id] ??= []).push([e.y, e.x]);
	}
	const p = g.getPlayer();
	return { tracks, sealed, hpLost: hp0 - g.getState().player.hp, left: g.getEnemies().length, r: p.y, c: p.x };
}, { plan, ticks, shoot });

// 盤面の BFS で口から口への手を起こす（1 マス＝movePlayer 2 回）。
function route(from, to) {
	const t = effective();
	const prev = new Map([[from, null]]);
	const q = [from];
	while (q.length) {
		const cur = q.shift();
		if (cur === to) break;
		const [r, c] = P(cur);
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc;
			const k = `${nr},${nc}`;
			if (nr < 0 || nr > 9 || nc < 0 || nc > 11 || BLOCKED.has(t[nr][nc]) || prev.has(k)) continue;
			prev.set(k, cur);
			q.push(k);
		}
	}
	const cells = [];
	for (let k = to; k; k = prev.get(k)) cells.unshift(k);
	const moves = [];
	for (let i = 1; i < cells.length; i++) {
		const [r0, c0] = P(cells[i - 1]), [r1, c1] = P(cells[i]);
		const d = r1 < r0 ? 'up' : r1 > r0 ? 'down' : c1 < c0 ? 'left' : 'right';
		moves.push(d, d);
	}
	return moves;
}

test.describe('D5 3,1 凍れる湖の鬼火 ② 実機', () => {
	test('鬼火は湖の上を飛んで、道に立つプレイヤーへ寄る（水が止めない）', async ({ page }) => {
		const errors = await boot(page, 7, 6);
		const r = await runPlan(page, [], 40);
		const water = new Set(WATER);
		const starts = Object.keys(ENEMIES);
		let crossed = 0;
		for (const tr of Object.values(r.tracks)) {
			const startKey = `${Math.round(tr[0][0])},${Math.round(tr[0][1])}`;
			const visited = new Set(tr.map(([y, x]) => `${Math.round(y)},${Math.round(x)}`));
			// 始まりの水とは別の水のマスを通った＝湖の上を飛んだ。
			if ([...visited].some((k) => water.has(k) && k !== startKey && !starts.includes(k))) crossed++;
			const [y, x] = tr[tr.length - 1];
			expect(Math.hypot(y - 7, x - 6), `鬼火が道のプレイヤーへ寄っていない（${y},${x}）`).toBeLessThan(3);
		}
		expect(crossed, '湖の上を飛んで来た鬼火が居ない').toBeGreaterThanOrEqual(2);
		expect(errors).toEqual([]);
	});

	test('道で立ち止まると剣を封じられて削られる', async ({ page }) => {
		for (const [row, col] of [[2, 4], [7, 8], [4, 6]]) {
			const errors = await boot(page, row, col);
			const r = await runPlan(page, [], 120);
			expect(r.sealed, `(${row},${col}) で剣が封じられない`).toBeGreaterThan(30);
			expect(r.hpLost, `(${row},${col}) で 120 tick 立ち止まっても削られない`).toBeGreaterThan(0);
			expect(errors).toEqual([]);
		}
	});

	test('弓なら湖越しに射落とせる（桟橋の付け根から無傷で全滅）', async ({ page }) => {
		const errors = await boot(page, 7, 6);
		const r = await runPlan(page, [], 120, true);
		expect(r.left, '弓で鬼火を射落とせない').toBe(0);
		expect(r.hpLost, '射落とす間に削られた').toBe(0);
		expect(errors).toEqual([]);
	});

	test('駆け抜ければ西の口から北の口へ、南の口から東の口へ抜けられる', async ({ page }) => {
		for (const [from, to, check] of [
			['4,0', '0,6', (r) => r.r < 0.5],
			['9,6', '5,11', (r) => r.c > 10.5],
		]) {
			const errors = await boot(page, ...P(from));
			const mv = route(from, to);
			const r = await runPlan(page, mv, mv.length + 6);
			expect(check(r), `${from} から ${to} へ抜けられない（${r.r},${r.c}）`).toBe(true);
			expect(r.hpLost, `${from}→${to} の駆け抜けで削られすぎ`).toBeLessThanOrEqual(3);
			expect(errors).toEqual([]);
		}
	});
});
