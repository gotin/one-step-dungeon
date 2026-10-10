// tests/d5-frozen-slime-field.spec.js
// dungeon_5 `3,0`（通り道・回復薬の部屋）「凍れる氷原の分裂スライム」の番人
// （2026-10-10 / PLAN 実行キュー 40 の第3陣 5室目・盤面は `scripts/migrate-d5-3-0-frozen-slime-field.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 3,0` の写し＝氷の廃墟なのに水も氷も無い四角い広間に、回復薬が落ちているだけだった。
//
// 新しい盤面（'k'＝氷・'~'＝水＝どちらも bgTiles）:
//      1 #~~~~~~~~~~#
//      2 #~kδkkδ~~~~#
//      3 #~kkδkk~~~~#
//      4 #~δkkkkkkkk.   ← 東の口へは行4 の幅1の氷の堤だけ
//      5 #~kkk7k~~~k.   ← 回復薬 7 (5,5)
//      6 #~kδkkk~~~~#
//      7 #~kkkkk~~~~#
//      8 #~~~~kk~~~~#
//   凍れる湖に浮かぶ氷原に分裂スライム δ×5。剣で斬ると小型に分かれて増え、弱点の爆弾なら分裂させずに潰せる。
//
// 守るものは2つ。
//   ① データ（幾何）：盤面と下地・敵と宣言・回復薬が同じセル・報酬なし／2つの口が道具なしでつながる・
//      東の口へは堤だけ／層の到達性。
//   ② 挙動（実機）：群れは入ってきたプレイヤーへ寄る／剣で斬り合うと増えてまわりを埋められる／
//      足元に爆弾を置けば分裂させずにまとめて潰せる／駆け抜ければ南の口から東の口へ抜けられる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { TARGET, WATER, ICE, ENEMIES, EXITS, DIKE, POTION_CELL, effective, walkable }
	from '../scripts/migrate-d5-3-0-frozen-slime-field.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '3,0';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const P = (k) => k.split(',').map(Number);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 3,0 凍れる氷原の分裂スライム ① データ', () => {
	test('盤面・水と氷の下地・敵の宣言・回復薬が同じセル・報酬なし', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const bgWater = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.WATER).sort();
		const bgIce = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.ICE).sort();
		expect(bgWater, '水は bgTiles').toEqual([...WATER].sort());
		expect(bgIce, '氷原と堤は氷の bgTiles').toEqual([...ICE].sort());
		expect(Object.keys(st.bgTiles).length).toBe(WATER.length + ICE.length);
		expect(Object.keys(ENEMIES).length, '分裂スライムの数').toBe(5);
		for (const [k, ch] of Object.entries(ENEMIES)) {
			const [r, c] = P(k);
			expect(st.tiles[r][c], `${k} の敵`).toBe(ch);
			expect(ch, `${k} の敵が分裂スライムでない`).toBe(TILE.SPLIT_SLIME);
			expect(ENEMY_META[ch].split?.blockedBy, '分裂スライムの弱点が爆弾でない（爆弾の答えが成り立たない）').toBe('bomb');
			expect(ICE, `${k} の敵が氷の上から始まらない`).toContain(k);
			expect(DIKE, `${k} の敵が堤の上から始まる`).not.toContain(k);
		}
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'5.5m の配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		const [pr, pc] = P(POTION_CELL);
		expect(st.tiles[pr][pc], '回復薬が書き換え前と同じセルに無い').toBe(TILE.ITEM_HEAL_POTION);
		expect(st.floorItems, '回復薬の中身が書き換え前と違う').toEqual({ [POTION_CELL]: { type: 'potion', value: 4 } });
		expect(Object.keys(st.chestContents ?? {}), '報酬なしの通り道に宝箱がある').toEqual([]);
	});

	test('2つの口が道具なしでつながり、東の口へは幅1の堤だけ', () => {
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
		for (const k of DIKE) {
			const [r, c] = P(k);
			expect(WATER, `堤 ${k} の北が水でない`).toContain(`${r - 1},${c}`);
			expect(WATER, `堤 ${k} の南が水でない`).toContain(`${r + 1},${c}`);
			const g = effective();
			g[r][c] = TILE.WALL;
			expect(walkable(g, EXITS.南[1]).has(EXITS.東[0]), `堤 ${k} を塞いでも東の口へ届く（迂回路がある）`).toBe(false);
		}
	});

	test('層の接続：徒歩で 3,0 を通って 4,0 へ・はしごで全室・dead-edge 0', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const ladder = bfsLayer(stages, START, { withLadder: true, openTiles: OPEN });
		expect(ladder.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(ladder.reachedRooms.size).toBe(Object.keys(stages).length);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		// 徒歩で入れる東側の部屋（書き換え前と同じ 14 室）。3,0 の2つの口は道具なしでつながる。
		for (const k of ['3,0', '3,1', '4,0']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
		expect(foot.reachedRooms.size).toBe(14);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '10', ps_bomb: '1' });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction((n) => window.__game.getEnemies().length === n, Object.keys(ENEMIES).length);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）∴HP を測る本は 'g' で切る。
	await page.keyboard.press('g');
	await page.evaluate(() => { window.__game.pause(); window.__game.getPlayer().activeSubItem = 'bomb'; });
	return errors;
}
// plan＝tick ごとの手（'down' 等 / null＝立ち止まり）。
// mode: 'idle'＝何もしない／'sword'＝隣の敵へ向いて斬る（2 tick に1回）／
//       'bomb'＝歩き終えてから、群れが 2.5 マス以内に4体寄ったら足元に爆弾を1個だけ置く（導火線 2 秒＝
//       引き付けてから置く。早すぎると取りこぼす＝.scratch/q40-3-0-bomb.mjs）。
const runPlan = (page, plan, ticks, mode = 'idle') => page.evaluate(({ plan, ticks, mode }) => {
	const g = window.__game;
	const hp0 = g.getState().player.hp;
	let maxN = g.getEnemies().length, maxAdj = 0, bombs = 0, splitOnIce = true;
	const water = new Set(window.__water);
	for (let i = 0; i < ticks; i++) {
		if (plan[i]) g.movePlayer(plan[i]);
		const pl = g.getPlayer();
		const adj = g.getEnemies().filter((e) => Math.hypot(e.x - pl.x, e.y - pl.y) < 1.6)
			.sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y));
		maxAdj = Math.max(maxAdj, adj.length);
		if (mode === 'sword' && adj.length && i % 2 === 0) {
			const dy = adj[0].y - pl.y, dx = adj[0].x - pl.x;
			g.setHeroDir(Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 'up' : 'down') : (dx < 0 ? 'left' : 'right'));
			g.swordAttack();
		}
		if (mode === 'bomb' && i >= plan.length && bombs === 0
			&& g.getEnemies().filter((e) => Math.hypot(e.x - pl.x, e.y - pl.y) <= 2.5).length >= 4) { g.useSubItem(); bombs++; }
		g.step(1);
		const es = g.getEnemies();
		maxN = Math.max(maxN, es.length);
		for (const e of es) if (water.has(`${Math.round(e.y)},${Math.round(e.x)}`)) splitOnIce = false;
	}
	const p = g.getPlayer();
	return { hpLost: hp0 - g.getState().player.hp, left: g.getEnemies().length, maxN, maxAdj, bombs, splitOnIce, r: p.y, c: p.x };
}, { plan, ticks, mode });

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
const withWater = (page) => page.evaluate((w) => { window.__water = w; }, WATER);

test.describe('D5 3,0 凍れる氷原の分裂スライム ② 実機', () => {
	test('群れは入ってきたプレイヤーへ寄る（氷原のどこから始まっても）', async ({ page }) => {
		const errors = await boot(page, 6, 4);
		await withWater(page);
		const r = await runPlan(page, [], 60);
		expect(r.maxAdj, '氷原に立っても群れが寄って来ない').toBeGreaterThanOrEqual(4);
		expect(r.hpLost, '寄って来た群れに削られない').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('剣で斬り合うと増えてまわりを埋められる（小型は氷の上にだけ分かれる）', async ({ page }) => {
		const errors = await boot(page, 8, 6);
		await withWater(page);
		const r = await runPlan(page, route('8,6', '6,4'), 300, 'sword');
		expect(r.maxN, '斬っても分裂しない（増えない）').toBeGreaterThan(5);
		expect(r.maxAdj, '斬り合いでまわりを埋められない').toBeGreaterThanOrEqual(5);
		expect(r.splitOnIce, '水の上に敵が居る（分裂の置き場が水へはみ出した）').toBe(true);
		expect(r.left, '剣で斬り合っても片付かない').toBe(0);
		expect(r.hpLost, '斬り合いで削られない（実測 12）').toBeGreaterThanOrEqual(10);
		expect(errors).toEqual([]);
	});

	test('足元に爆弾を1個置けば、分裂させずに群れをまとめて潰せる', async ({ page }) => {
		const errors = await boot(page, 8, 6);
		await withWater(page);
		const r = await runPlan(page, route('8,6', '6,4'), 200, 'bomb');
		expect(r.bombs, '爆弾を置けない').toBe(1);
		expect(r.left, '爆弾1個で群れが片付かない').toBe(0);
		expect(r.maxN, '爆弾で潰したのに分裂した').toBe(5);
		expect(r.hpLost, '爆弾で潰す方が斬り合い（10 以上）より削られる（実測 6）').toBeLessThanOrEqual(6);
		expect(errors).toEqual([]);
	});

	test('プレイヤーの爆弾は自分を傷めない（足元に置いて待つ答えの前提）', async ({ page }) => {
		// 群れから離れた堤の先 (4,10) で足元に置き、群れが届く前の導火線 2 秒（17 tick）を立って待つ。
		// ⚠️ 群れと混ぜて測ると、体当たりの無敵時間が爆風の自傷を隠す（歯の確認で実際に緑のままだった）。
		const errors = await boot(page, 4, 10);
		const r = await page.evaluate(() => {
			const g = window.__game;
			const hp0 = g.getState().player.hp;
			const n0 = g.getPlayer().subItems.bomb.count;
			g.useSubItem();
			let minDist = Infinity;
			for (let i = 0; i < 20; i++) {
				g.step(1);
				const pl = g.getPlayer();
				for (const e of g.getEnemies()) minDist = Math.min(minDist, Math.hypot(e.x - pl.x, e.y - pl.y));
			}
			return { used: n0 - g.getPlayer().subItems.bomb.count, hpLost: hp0 - g.getState().player.hp, minDist };
		});
		expect(r.used, '爆弾を置けない').toBe(1);
		expect(r.minDist, '導火線の間に群れが届いた（自傷と体当たりを分けて測れない）').toBeGreaterThan(1.6);
		expect(r.hpLost, '自分の爆風で削られた').toBe(0);
		expect(errors).toEqual([]);
	});

	test('駆け抜ければ南の口から東の口へ抜けられる', async ({ page }) => {
		const errors = await boot(page, 8, 6);
		await withWater(page);
		const mv = route('8,6', '4,11');
		const r = await runPlan(page, mv, mv.length + 6);
		expect(r.c, `東の口へ抜けられない（${r.r},${r.c}）`).toBeGreaterThan(10.5);
		expect(r.hpLost, '駆け抜けで削られすぎ').toBeLessThanOrEqual(3);
		expect(errors).toEqual([]);
	});
});
