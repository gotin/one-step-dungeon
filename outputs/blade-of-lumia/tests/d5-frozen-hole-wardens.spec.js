// tests/d5-frozen-hole-wardens.spec.js
// dungeon_5 `2,1`（通り道）「凍れる壁穴の番鮫」の番人
// （2026-10-09 / PLAN 実行キュー 40 の第3陣 2室目・盤面は `scripts/migrate-d5-2-1-frozen-hole-wardens.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 2,1` の写し＝氷の廃墟なのに水も氷も無い四角い広間に、センチネル F×2 と石2つだった。
//
// 新しい盤面（'k'＝氷・'~'＝水＝どちらも bgTiles）:
//      1 #kkkkkkkkkk#
//      2 #kkkkkkkkkk#
//      3 #######<k###   ← 抜け道 (3,8)・穴 (3,7) に潜み鮫
//      4 #kkkkkkkkkk.
//      5 #kkkkk/kkkk.   ← 穴 (5,6) に射水魚
//      6 ###k<#######   ← 抜け道 (6,3)・穴 (6,4) に潜み鮫
//      7 #kkkkkkkkkk#
//      8 #kkkkkkkkkk#
//   廃墟の壁2本が部屋を3つの帯に割り、帯から帯へは幅1の抜け道だけ。抜け道の脇の穴（水1枚）に潜み鮫。
//
// 守るものは2つ。
//   ① データ（幾何）：盤面と下地・敵と宣言・報酬なし／3つの口が道具なしでつながり、はしごで増えない／
//      穴は水1枚・帯をつなぐのは抜け道1マスだけ・抜け道は顎の届きの内／北と南の帯に陰がある／層の到達性。
//   ② 挙動（実機）：鮫は穴から動かず潜った状態で始まる／抜け道では浮いている間だけ噛まれる／
//      陰の床では立ち止まっても撃たれず、陰でない床では削られる（射線の模型と実機が一致する）／
//      浮いた鮫は抜け道から斬れて、潜っている間は減らない／駆け抜ければ口から口へ抜けられる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { TARGET, GROUND_MAP, WATER, ICE, ENEMIES, EXITS, BANDS, GAPS, effective, walkable, shelteredCells }
	from '../scripts/migrate-d5-2-1-frozen-hole-wardens.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '2,1';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const P = (k) => k.split(',').map(Number);
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 2,1 凍れる壁穴の番鮫 ① データ', () => {
	test('盤面・水と氷の下地・敵の宣言・報酬なし', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const bgWater = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.WATER).sort();
		const bgIce = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.ICE).sort();
		expect(bgWater, '水は bgTiles').toEqual([...WATER].sort());
		expect(bgIce, '床は氷の bgTiles').toEqual([...ICE].sort());
		expect(Object.keys(st.bgTiles).length).toBe(WATER.length + ICE.length);
		for (const [k, ch] of Object.entries(ENEMIES)) {
			const [r, c] = P(k);
			expect(st.tiles[r][c], `${k} の敵`).toBe(ch);
			expect(ENEMY_META[ch].move, `${k} の敵が水棲でない`).toBe('water');
			expect(WATER, `${k} の敵が水の上にいない`).toContain(k);
		}
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'5.5m の配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		expect(Object.keys(st.chestContents ?? {}), '報酬なしの通り道に宝箱がある').toEqual([]);
		expect(Object.keys(st.floorItems ?? {}), '報酬なしの通り道に拾い物がある').toEqual([]);
	});

	test('3つの口が道具なしでつながり、はしごがあっても歩ける床は増えない', () => {
		const t = effective();
		const foot = walkable(t, EXITS.南[0]);
		for (const [name, cells] of Object.entries(EXITS)) {
			for (const k of cells) expect(foot.has(k), `南の口から${name}の口 ${k} へ歩けない`).toBe(true);
		}
		expect(walkable(t, EXITS.南[0], true).size, 'はしごで歩ける床が増えた').toBe(foot.size);
	});

	test('穴は水1枚・帯をつなぐのは抜け道1マスだけ・抜け道は顎の届きの内・北と南の帯に陰がある', () => {
		const water = new Set(WATER);
		for (const k of WATER) {
			const [r, c] = P(k);
			for (const [dr, dc] of DIRS4) expect(water.has(`${r + dr},${c + dc}`), `穴 ${k} が水1枚でない＝鮫が動ける`).toBe(false);
		}
		const t = effective();
		const bite = ENEMY_META[TILE.LURK_SHARK].attacks.find((a) => a.type === 'sword').range;
		for (const [name, { gap, hole }] of Object.entries(GAPS)) {
			expect(ENEMIES[hole], `${name}の穴 ${hole} に鮫がいない`).toBe(TILE.LURK_SHARK);
			const [gr, gc] = P(gap), [hr, hc] = P(hole);
			expect(Math.hypot(gr - hr, gc - hc), `${name}の抜け道が顎の届きの外`).toBeLessThanOrEqual(bite);
			const cut = t.map((row) => [...row]);
			cut[gr][gc] = TILE.WALL;
			expect(walkable(cut, `${BANDS[name][0]},1`).has(`${BANDS.中[0]},1`), `${name}の帯から抜け道以外で中の帯へ行ける`).toBe(false);
		}
		const shelter = shelteredCells(t, [...walkable(t, EXITS.南[0])]);
		for (const name of ['北', '南']) {
			expect(shelter.filter((k) => BANDS[name].includes(P(k)[0])).length, `${name}の帯に陰が無い`).toBeGreaterThanOrEqual(4);
		}
		expect(shelter.filter((k) => BANDS.中.includes(P(k)[0])), '中の帯に陰がある＝射水魚の見張りが効かない').toEqual([]);
		// 陰は抜け道の反対側の隅＝陰から抜け道へは走って行く（陰の中から抜け道を斬れない）。
		for (const k of shelter) {
			for (const { gap } of Object.values(GAPS)) {
				const [r, c] = P(k), [gr, gc] = P(gap);
				expect(Math.abs(r - gr) + Math.abs(c - gc), `陰 ${k} が抜け道 ${gap} の隣`).toBeGreaterThanOrEqual(3);
			}
		}
	});

	test('層の接続：徒歩で 2,1 を通れる・はしごで全室・dead-edge 0', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const ladder = bfsLayer(stages, START, { withLadder: true, openTiles: OPEN });
		expect(ladder.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(ladder.reachedRooms.size).toBe(Object.keys(stages).length);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		// 徒歩で入れる東側の部屋（書き換え前と同じ 14 室）。2,1 の3つの口は道具なしでつながる。
		for (const k of ['2,0', '2,1', '2,2', '3,1']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
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
	await page.waitForFunction(() => window.__game.getEnemies().length === 3);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）∴HP を測る本は 'g' で切る。
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// plan＝tick ごとの手（'down' 等 / null＝立ち止まり）。敵の軌跡（id ごと）と、被弾した tick の鮫の状態を返す。
const runPlan = (page, plan, ticks) => page.evaluate(({ plan, ticks }) => {
	const g = window.__game;
	const hp0 = g.getState().player.hp;
	const tracks = {};
	const hits = [];
	let last = hp0;
	for (let i = 0; i < ticks; i++) {
		if (plan[i]) g.movePlayer(plan[i]);
		g.step(1);
		for (const e of g.getEnemies()) (tracks[e.id] ??= []).push([e.y, e.x, e.hidden]);
		const hp = g.getState().player.hp;
		if (hp < last) hits.push(i);
		last = hp;
	}
	const p = g.getPlayer();
	return { tracks, hits, hpLost: hp0 - g.getState().player.hp, r: p.y, c: p.x };
}, { plan, ticks });
const rep = (d, n) => Array(n).fill(d);

test.describe('D5 2,1 凍れる壁穴の番鮫 ② 実機', () => {
	test('鮫も魚も穴から動かない・鮫は潜った状態で始まり浮き沈みを繰り返す', async ({ page }) => {
		const errors = await boot(page, 4, 10);
		const r = await runPlan(page, [], 60);
		for (const [id, tr] of Object.entries(r.tracks)) {
			const moved = tr.filter(([y, x]) => `${y},${x}` !== id);
			expect(moved, `敵 ${id} が穴から動いた`).toEqual([]);
		}
		for (const { hole } of Object.values(GAPS)) {
			const tr = r.tracks[hole];
			expect(tr[0][2], `穴 ${hole} の鮫が潜った状態で始まらない`).toBe(true);
			expect(tr.some(([, , h]) => !h), `穴 ${hole} の鮫が 60 tick で一度も浮かない`).toBe(true);
		}
		expect(errors).toEqual([]);
	});

	test('抜け道では浮いている鮫にだけ噛まれる（潜っている間は無傷）', async ({ page }) => {
		for (const { gap, hole } of Object.values(GAPS)) {
			const [gr, gc] = P(gap);
			const errors = await boot(page, gr, gc);
			// ほかの2体（魚・向こうの鮫）は抜け道を遠くから撃てる∴先に退かす＝この穴の鮫の噛みつきだけを測る。
			await page.evaluate((keep) => {
				const g = window.__game;
				for (const e of g.getEnemies()) {
					if (e.id === keep) continue;
					g.setEnemyFieldForTest(e.id, { hidden: false });
					g.dealDamage(e.id, 999);
				}
			}, hole);
			expect(await page.evaluate(() => window.__game.getEnemies().length), `抜け道 ${gap}：ほかの敵を退かせない`).toBe(1);
			const r = await runPlan(page, [], 80);
			const tr = r.tracks[hole];
			expect(r.hits.length, `抜け道 ${gap} で 80 tick 立っても噛まれない`).toBeGreaterThan(0);
			// 被弾した tick（またはその直前の tick）に鮫は浮いていた＝潜っている窓では攻撃しない。
			for (const i of r.hits) {
				expect(!tr[i][2] || (i > 0 && !tr[i - 1][2]), `抜け道 ${gap}：潜っている tick ${i} に削られた`).toBe(true);
			}
			// 最初の潜りの窓（入ってから浮くまで）は無傷。
			const firstShown = tr.findIndex(([, , h]) => !h);
			expect(r.hits.every((i) => i >= firstShown - 1), `抜け道 ${gap}：最初の潜りの窓で削られた`).toBe(true);
			expect(errors).toEqual([]);
		}
	});

	test('陰の床では 120 tick 立ち止まっても撃たれず、陰でない床では削られる（射線の模型と実機が一致）', async ({ page }) => {
		const t = effective();
		const shelter = new Set(shelteredCells(t, [...walkable(t, EXITS.南[0])]));
		for (const [row, col] of [[1, 1], [2, 2], [7, 8], [8, 10]]) {
			expect(shelter.has(`${row},${col}`), `(${row},${col}) が模型で陰でない`).toBe(true);
			const errors = await boot(page, row, col);
			const r = await runPlan(page, [], 120);
			expect(r.hpLost, `陰 (${row},${col}) で撃たれた`).toBe(0);
			expect(errors).toEqual([]);
		}
		// (1,3)・(8,8) は陰の隣＝弾が「穴の脇の壁を斜めに越えて生まれる」ことを数えない模型（中心から中心の直線）
		// だと陰に見えてしまう床（叩き台の初版で踏んだ）。実機で撃たれることをここで縛る。
		for (const [row, col] of [[1, 8], [4, 10], [4, 3], [7, 1], [1, 3], [8, 8]]) {
			expect(shelter.has(`${row},${col}`), `(${row},${col}) が模型で陰になっている`).toBe(false);
			const errors = await boot(page, row, col);
			const r = await runPlan(page, [], 120);
			expect(r.hpLost, `(${row},${col}) で 120 tick 立ち止まっても削られない`).toBeGreaterThan(0);
			expect(errors).toEqual([]);
		}
	});

	test('浮いた鮫は抜け道から剣で斬れる（潜っている間は斬っても減らない）', async ({ page }) => {
		const errors = await boot(page, 3, 8);
		const res = await page.evaluate(() => {
			const g = window.__game;
			g.setHeroDir('left');
			let hiddenHits = 0, shownHits = 0;
			for (let i = 0; i < 80; i++) {
				const s = g.getEnemies().find((e) => e.type === '<' && Math.round(e.y) === 3);
				if (!s) break;
				const hp0 = s.hp, wasHidden = s.hidden;
				g.swordAttack();
				g.step(1);
				const after = g.getEnemies().find((e) => e.type === '<' && Math.round(e.y) === 3);
				const lost = hp0 - (after ? after.hp : 0);
				if (wasHidden && lost > 0) hiddenHits++;
				if (!wasHidden && lost > 0) shownHits++;
			}
			return { hiddenHits, shownHits };
		});
		expect(res.shownHits, '浮いた鮫を抜け道から斬れない').toBeGreaterThan(0);
		expect(res.hiddenHits, '潜っている鮫が斬られた').toBe(0);
		expect(errors).toEqual([]);
	});

	test('駆け抜ければ南の口から抜け道2つを通って北の口へ抜けられる', async ({ page }) => {
		const errors = await boot(page, 9, 5);
		const U = (n) => rep('up', 2 * n), L = (n) => rep('left', 2 * n), R = (n) => rep('right', 2 * n);
		// (9,5)→(8,5)→(8,3)→南の抜け道 (6,3)→(4,3)→(4,8)→北の抜け道 (3,8)→(2,8)→(2,6)→(0,6)
		const r = await runPlan(page, [...U(1), ...L(2), ...U(4), ...R(5), ...U(2), ...L(2), ...U(2)], 40);
		expect(r.r, '北の口まで抜けられない').toBeLessThan(0.5);
		expect(r.c).toBe(6);
		expect(errors).toEqual([]);
	});
});
