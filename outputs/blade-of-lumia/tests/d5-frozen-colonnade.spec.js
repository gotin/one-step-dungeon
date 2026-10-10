// tests/d5-frozen-colonnade.spec.js
// dungeon_5 `2,3`（看板部屋＝西の入口 `1,3`・北の `2,2`・東の `3,3` をつなぐ通り道）「凍れる柱廊の双つ甲羅」の番人
// （2026-10-10 / PLAN 実行キュー 40 の第3陣 7室目・盤面は `scripts/migrate-d5-2-3-frozen-colonnade.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 2,3` の写し＝氷の廃墟なのに水も氷も柱も無い四角い広間に、5.5m の看板の敵
//   （火吐き亀 φ×2＋跳躍蜘蛛 β）が置いてあるだけだった。
//
// 新しい盤面（'k'＝氷・'~'＝水＝どちらも bgTiles）:
//      1 #~kkkkkkkk~#
//      2 #kkkkkkkkkk#   ← 北の側廊
//      3 #k#φ#kk#β#k#   ← 北の列柱（柱 列2・4・7・9）
//      4 .kkkkkkkkkk.   ← 身廊
//      5 .kkkkkkkkkk.
//      6 #k#k#kk#φ#k#   ← 南の列柱
//      7 #kkkkkkkkkk#   ← 南の側廊
//      8 #~kkkkkkkk~#
//   列柱の切れ目に立つ亀の炎は、柱に挟まれて切れ目の正面と背後にしか届かない。蜘蛛の跳躍も柱で止まる。
//
// 守るものは2つ。
//   ① データ（幾何）：盤面と下地・敵は 5.5m の表どおり・報酬なし／列柱が炎を遮る形／3つの口が道具なしでつながる／層の到達性。
//   ② 挙動（実機）：2体は同時に開く／柱の陰は開く瞬間の炎が届かない（切れ目の正面は焼かれる）／
//      柱の向こうの蜘蛛は柱に跳び当たって落ちる／柱の陰で構えれば身廊より削られずに3体とも倒せる・
//      待つだけでは削られる／駆け抜ければ口から口へ抜けられる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED } from '../scripts/lib/connectivity.mjs';
import { NEW_ENEMY_PLACEMENT, stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { TARGET, WATER, ICE, ENEMIES, EXITS, PILLARS, TURTLES, SPIDER, SHADOW_POST, effective, walkable, breathHits }
	from '../scripts/migrate-d5-2-3-frozen-colonnade.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '2,3';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const P = (k) => k.split(',').map(Number);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 2,3 凍れる柱廊の双つ甲羅 ① データ', () => {
	test('盤面・水と氷の下地・敵は 5.5m の表どおり・報酬なし', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const bgWater = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.WATER).sort();
		const bgIce = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.ICE).sort();
		expect(bgWater, '水は bgTiles').toEqual([...WATER].sort());
		expect(bgIce, '床は氷の bgTiles').toEqual([...ICE].sort());
		expect(Object.keys(st.bgTiles).length).toBe(WATER.length + ICE.length);
		const plan = NEW_ENEMY_PLACEMENT.find((e) => e.layer === LAYER && e.stage === ROOM);
		const planned = Object.entries(plan.place).flatMap(([ch, ks]) => ks.map((k) => [k, ch])).sort();
		expect(Object.entries(ENEMIES).sort(), '敵が 5.5m の配置表と違う').toEqual(planned);
		for (const [k, ch] of Object.entries(ENEMIES)) {
			const [r, c] = P(k);
			expect(st.tiles[r][c], `${k} の敵`).toBe(ch);
		}
		expect(TURTLES.length, '火吐き亀の数').toBe(2);
		expect(ENEMY_META[TILE.FIRE_TURTLE].shell?.breathCells, '亀の炎の長さが 2 でない（列柱の陰の幾何の前提）').toBe(2);
		expect(stageThreat(st, ENEMY_META), '脅威度（看板の梯子）').toBe(76);
		expect(Object.keys(st.chestContents ?? {}), '報酬なしの通り道に宝箱がある').toEqual([]);
		expect(Object.keys(st.floorItems ?? {}), '報酬なしの通り道に拾い物がある').toEqual([]);
	});

	test('列柱が炎を遮る：切れ目の亀の炎は切れ目の正面と背後にしか届かない', () => {
		const t = effective();
		const st = stages[ROOM];
		for (const k of PILLARS) {
			const [r, c] = P(k);
			expect(st.tiles[r][c], `柱 ${k} が無い`).toBe(TILE.WALL);
		}
		for (const tk of TURTLES) {
			const [tr, tc] = P(tk);
			expect(PILLARS, `亀 ${tk} の西に柱が無い`).toContain(`${tr},${tc - 1}`);
			expect(PILLARS, `亀 ${tk} の東に柱が無い`).toContain(`${tr},${tc + 1}`);
			for (let r = 0; r < 10; r++) for (let c = 0; c < 12; c++) {
				if (BLOCKED.has(t[r][c]) || c === tc) continue;
				expect(breathHits(t, tk, `${r},${c}`), `亀 ${tk} の炎が切れ目の外 ${r},${c} へ届く`).toBe(false);
			}
			// 切れ目の正面 2 マスは焼かれる（陰ではない所がある＝立ち位置が問われる）。
			expect(breathHits(t, tk, `${tr + (tr < 5 ? 2 : -2)},${tc}`), `亀 ${tk} の正面 2 マスが焼かれない`).toBe(true);
		}
		expect(TURTLES.every((tk) => !breathHits(t, tk, SHADOW_POST)), `構え所 ${SHADOW_POST} に炎が届く`).toBe(true);
	});

	test('3つの口が道具なしでつながり、層の接続は書き換え前と同じ', () => {
		const t = effective();
		const foot = walkable(t, EXITS.西[0]);
		for (const [name, cells] of Object.entries(EXITS)) {
			for (const k of cells) expect(foot.has(k), `西の口から${name}の口 ${k} へ歩けない`).toBe(true);
		}
		const stranded = [];
		for (let r = 0; r < 10; r++) for (let c = 0; c < 12; c++) {
			if (!BLOCKED.has(t[r][c]) && !foot.has(`${r},${c}`)) stranded.push(`${r},${c}`);
		}
		expect(stranded, '取り残された床').toEqual([]);
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const ladder = bfsLayer(stages, START, { withLadder: true, openTiles: OPEN });
		expect(ladder.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(ladder.reachedRooms.size).toBe(Object.keys(stages).length);
		const walk = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		for (const k of ['2,3', '2,2', '3,3']) expect(walk.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
		expect(walk.reachedRooms.size).toBe(14);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	// 木の剣（ps_sword=0）＝D5 に来る時点で必ず持っている剣。ps_weapon だけだと剣ティアが無い（atk 2）。
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_sword: '0', ps_hearts: '10' });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction((n) => window.__game.getEnemies().length === n, Object.keys(ENEMIES).length);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）∴HP を測る本は 'g' で切る。
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// plan＝tick ごとの手（'down' 等 / null＝立ち止まり）。
// mode: 'idle'＝何もしない／'guard'＝その場で、縦横に隣り合う斬れる敵（開いた亀・跳んでいない蜘蛛）を斬る。
const runPlan = (page, plan, ticks, mode = 'idle') => page.evaluate(({ plan, ticks, mode }) => {
	const g = window.__game;
	const hp0 = g.getState().player.hp;
	const opens = {};
	const prev = {};
	const spider = { cells: new Set(), leaps: 0 };
	for (let i = 0; i < ticks; i++) {
		if (plan[i]) g.movePlayer(plan[i]);
		const pl = g.getPlayer();
		if (mode === 'guard' && !plan[i]) {
			const tgt = g.getEnemies().find((e) => {
				const dx = e.x - pl.x, dy = e.y - pl.y;
				const orth = (Math.abs(dx) < 0.6 && Math.abs(dy) < 1.3) || (Math.abs(dy) < 0.6 && Math.abs(dx) < 1.3);
				return orth && !e.shellClosed && e.leapPhase !== 'air';
			});
			if (tgt) {
				const dy = tgt.y - pl.y, dx = tgt.x - pl.x;
				g.setHeroDir(Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 'up' : 'down') : (dx < 0 ? 'left' : 'right'));
				g.swordAttack();
			}
		}
		g.step(1);
		for (const e of g.getEnemies()) {
			if (e.shellPhase === 'open' && prev[e.id] !== 'open') (opens[e.id] ??= []).push(i);
			prev[e.id] = e.shellPhase;
			if (e.type === 'β') {
				spider.cells.add(`${e.y},${e.x}`);
				if (e.leapPhase === 'air' && prev[`β${e.id}`] !== 'air') spider.leaps++;
				prev[`β${e.id}`] = e.leapPhase;
			}
		}
	}
	const p = g.getPlayer();
	return { hpLost: hp0 - g.getState().player.hp, left: g.getEnemies().length, opens: Object.values(opens),
		spiderCells: [...spider.cells], spiderLeaps: spider.leaps, r: p.y, c: p.x };
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

test.describe('D5 2,3 凍れる柱廊の双つ甲羅 ② 実機', () => {
	test('柱の陰は開く瞬間の炎が届かず、切れ目の正面と背後は焼かれる（2体は同時に開く）', async ({ page }) => {
		// 最初に開くのは 12 tick 目（籠もり 1400ms）。蜘蛛が寄る前の 14 tick だけ見る＝炎だけを測る。
		const errors = await boot(page, 3, 1);   // 切れ目 (3,3) の亀の西 2 マス＝柱 (3,2) の陰
		const shade = await runPlan(page, [], 14);
		expect(shade.opens.length, '亀が2体とも開かない').toBe(2);
		expect(shade.opens[0], '2体の開く tick が違う（同時に開く前提が崩れた）').toEqual(shade.opens[1]);
		expect(shade.hpLost, '柱の陰 (3,1) なのに焼かれた').toBe(0);
		for (const [r, c, why] of [[2, 2, '構え所 (2,2)'], [4, 4, '身廊の斜め (4,4)']]) {
			await boot(page, r, c);
			expect((await runPlan(page, [], 14)).hpLost, `${why} なのに焼かれた`).toBe(0);
		}
		for (const [r, c, why] of [[5, 3, '切れ目の正面 2 マス (5,3)'], [2, 3, '切れ目の背後 (2,3)']]) {
			await boot(page, r, c);
			expect((await runPlan(page, [], 14)).hpLost, `${why} が焼かれない`).toBe(4);
		}
		expect(errors).toEqual([]);
	});

	test('柱の向こうの蜘蛛は柱に跳び当たって落ちる（跳躍は柱を越えない）', async ({ page }) => {
		// (3,5) は蜘蛛 (3,8) の西 3 マス＝跳躍の間合い。間に柱 (3,7)。
		const errors = await boot(page, 3, 5);
		const r = await runPlan(page, [], 40);
		expect(r.spiderLeaps, '蜘蛛が跳ばない（間合いに入っていない）').toBeGreaterThanOrEqual(2);
		expect(r.spiderCells, '蜘蛛が柱を越えて動いた').toEqual([SPIDER]);
		expect(r.hpLost, '柱の陰 (3,5) で削られた').toBe(0);
		expect(errors).toEqual([]);
	});

	test('柱の陰で構えれば身廊より削られずに3体とも倒せる・待つだけでは削られる', async ({ page }) => {
		const errors = await boot(page, ...P(SHADOW_POST));
		const post = await runPlan(page, [], 300, 'guard');
		expect(post.left, `構え所 ${SHADOW_POST} で3体とも倒せない`).toBe(0);
		expect(post.hpLost, `構え所 ${SHADOW_POST} で削られすぎ（実測 8）`).toBeLessThanOrEqual(8);
		await boot(page, 5, 5);
		const nave = await runPlan(page, [], 300, 'guard');
		expect(nave.hpLost, '身廊の真ん中 (5,5) で構えても構え所より削られない（実測 16）').toBeGreaterThanOrEqual(post.hpLost + 8);
		await boot(page, 4, 0);
		const wait = await runPlan(page, [], 120);
		expect(wait.hpLost, '西の口で立ち止まっても削られない（看板＝待つだけでは抜けられない・実測 16）').toBeGreaterThanOrEqual(12);
		expect(errors).toEqual([]);
	});

	test('駆け抜ければ口から口へ抜けられる（西→東・西→北・北→東）', async ({ page }) => {
		const errors = [];
		// 西→東は身廊の南の行5 を真っすぐ（行4 は蜘蛛が切れ目 (3,8) から下りて来て塞ぐ＝盲目の経路では抜けない）。
		for (const [from, to, edge] of [['5,0', '5,11', (r) => r.c > 10.5], ['5,0', '0,5', (r) => r.r < 0.5], ['0,6', '4,11', (r) => r.c > 10.5]]) {
			errors.push(...await boot(page, ...P(from)));
			const mv = route(from, to);
			const r = await runPlan(page, mv, mv.length + 10);
			expect(edge(r), `${from}→${to} へ抜けられない（${r.r},${r.c}）`).toBe(true);
			expect(r.hpLost, `${from}→${to} の駆け抜けで削られすぎ`).toBeLessThanOrEqual(4);
		}
		expect(errors).toEqual([]);
	});
});
