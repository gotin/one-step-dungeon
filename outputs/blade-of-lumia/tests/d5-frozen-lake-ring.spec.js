// tests/d5-frozen-lake-ring.spec.js
// dungeon_5 `2,2`（四つ辻＝通り道）「凍れる湖の一周道」の番人
// （2026-10-08 / PLAN 実行キュー 40 の第3陣 1室目・盤面は `scripts/migrate-d5-2-2-frozen-lake-ring.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 2,2` の写し＝氷の廃墟なのに水も氷も敵も無い四角い広間だった。
//
// 新しい盤面（'k'＝氷・'~'＝水＝どちらも bgTiles）:
//      1 #kkkkkkkkkk#
//      2 #kk~~~~~~kk#
//      3 #k~~/~~~~~k#   ← 射水魚 /
//      4 .k~~#~~~~~k.   ← 氷の岩 #(4,4)
//      5 .k~~~~~#~~k.   ← 氷の岩 #(5,7)
//      6 #k~~~~<~~~k#   ← 潜み鮫 <
//      7 #kk~~~~~~kk#
//      8 #kkkkkkkkkk#
//   4つの口は湖を巡る幅1の氷の岸だけでつながる。
//
// 守るものは2つ。
//   ① データ（幾何）：盤面と下地・敵と宣言・報酬なし／4つの口が道具なしでつながり、はしごで増えない／
//      湖がひと続き・鮫の顎が届かないのは四隅の角と口の前だけ／層の到達性。
//   ② 挙動（実機）：鮫は潜ったまま岸のプレイヤーの前へ先回りして浮く（陸には上がらない）・浮いた鮫は岸から斬れる／
//      岸で立ち止まると削られる／駆け抜ければ口から口へ抜けられる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { TARGET, GROUND_MAP, WATER, ICE, ROCKS, ENEMIES, EXITS, SAFE_NOOKS, effective, walkable, nearestWaterDist }
	from '../scripts/migrate-d5-2-2-frozen-lake-ring.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '2,2';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 2,2 凍れる湖の一周道 ① データ', () => {
	test('盤面・水と氷の下地・敵の宣言・報酬なし', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const bgWater = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.WATER).sort();
		const bgIce = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.ICE).sort();
		expect(bgWater, '水は bgTiles').toEqual([...WATER].sort());
		expect(bgIce, '岸は氷の bgTiles').toEqual([...ICE].sort());
		expect(Object.keys(st.bgTiles).length).toBe(WATER.length + ICE.length);
		for (const [k, ch] of Object.entries(ENEMIES)) {
			const [r, c] = k.split(',').map(Number);
			expect(st.tiles[r][c], `${k} の敵`).toBe(ch);
			expect(ENEMY_META[ch].move, `${k} の敵が水棲でない`).toBe('water');
			expect(WATER, `${k} の敵が水の上にいない`).toContain(k);
		}
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'5.5m の配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		expect(Object.keys(st.chestContents ?? {}), '報酬なしの通り道に宝箱がある').toEqual([]);
		expect(Object.keys(st.floorItems ?? {}), '報酬なしの通り道に拾い物がある').toEqual([]);
	});

	test('4つの口が道具なしでつながり、はしごがあっても歩ける床は増えない', () => {
		const t = effective();
		const foot = walkable(t, EXITS.西[0]);
		for (const [name, cells] of Object.entries(EXITS)) {
			for (const k of cells) expect(foot.has(k), `西の口から${name}の口 ${k} へ歩けない`).toBe(true);
		}
		expect(walkable(t, EXITS.西[0], true).size, 'はしごで湖を渡れる所がある').toBe(foot.size);
		// 歩ける床＝岸の氷と口だけ（湖の中に立てる所が無い）。
		expect(foot.size).toBe(ICE.length + 8);
	});

	test('湖はひと続き・氷の岩は湖の中・鮫の顎が届かないのは四隅の角と口の前だけ', () => {
		const water = new Set(WATER);
		const seen = new Set([WATER[0]]), q = [WATER[0]];
		while (q.length) {
			const [r, c] = q.shift().split(',').map(Number);
			for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const nk = `${r + dr},${c + dc}`;
				if (water.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(nk); }
			}
		}
		expect(seen.size, '湖が分かれている＝鮫が回れない所がある').toBe(WATER.length);
		for (const k of ROCKS) {
			const [r, c] = k.split(',').map(Number);
			expect(GROUND_MAP[r][c], `${k} が岩でない`).toBe(TILE.WALL);
			for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) expect(water.has(`${r + dr},${c + dc}`), `岩 ${k} が岸に接している`).toBe(true);
		}
		const bite = ENEMY_META[TILE.LURK_SHARK].attacks.find((a) => a.type === 'sword').range;
		const shore = [...walkable(effective(), EXITS.西[0])];
		const safe = shore.filter((k) => nearestWaterDist(k) > bite).sort();
		expect(safe).toEqual([...SAFE_NOOKS].sort());
	});

	test('層の接続：徒歩で 2,2 を通れる・はしごで全室・dead-edge 0', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const ladder = bfsLayer(stages, START, { withLadder: true, openTiles: OPEN });
		expect(ladder.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(ladder.reachedRooms.size).toBe(Object.keys(stages).length);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		// 徒歩で入れる東側の部屋（書き換え前と同じ 14 室）。2,2 の4つの口は道具なしでつながる。
		for (const k of ['2,1', '2,2', '2,3', '3,2', '1,2']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
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
	await page.waitForFunction(() => window.__game.getEnemies().length === 2);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）∴HP を測る本は 'g' で切る。
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// plan＝tick ごとの手（'down' 等 / null＝立ち止まり）。敵の軌跡（id ごと）と被弾を返す。
const runPlan = (page, plan, ticks) => page.evaluate(({ plan, ticks }) => {
	const g = window.__game;
	const hp0 = g.getState().player.hp;
	const tracks = {};
	for (let i = 0; i < ticks; i++) {
		if (plan[i]) g.movePlayer(plan[i]);
		g.step(1);
		for (const e of g.getEnemies()) (tracks[e.id] ??= []).push([e.y, e.x, e.hidden]);
	}
	const p = g.getPlayer();
	return { tracks, hpLost: hp0 - g.getState().player.hp, r: p.y, c: p.x, stage: g.getState().stageKey };
}, { plan, ticks });
const rep = (d, n) => Array(n).fill(d);
const WATER_SET = new Set(WATER);
// 軌跡の中で、敵の体が乗った水でないセル（体の占める行・列の全セルで見る＝半マスの位置も拾う）。
const landTouched = (track) => {
	const out = new Set();
	for (const [y, x] of track) {
		for (const r of [Math.floor(y), Math.ceil(y)]) for (const c of [Math.floor(x), Math.ceil(x)]) {
			if (!WATER_SET.has(`${r},${c}`)) out.add(`${r},${c}`);
		}
	}
	return [...out];
};

test.describe('D5 2,2 凍れる湖の一周道 ② 実機', () => {
	test('鮫は潜ったまま岸のプレイヤーの前へ先回りして浮く（陸には上がらない）', async ({ page }) => {
		const errors = await boot(page, 8, 5);
		const r = await runPlan(page, [], 40);
		const shark = r.tracks['6,6'];
		expect(shark, '鮫が居ない').toBeTruthy();
		// 南の岸 (8,5) の真上の水 (7,5) まで寄って、そこで浮く。
		const surfacedNear = shark.filter(([y, x, hidden]) => !hidden && Math.hypot(y - 8, x - 5) <= 1.01);
		expect(surfacedNear.length, `鮫が岸の前で浮かない（最後 ${JSON.stringify(shark.at(-1))}）`).toBeGreaterThan(0);
		expect(shark[0][2], '入った直後の鮫が潜っていない').toBe(true);
		for (const [id, tr] of Object.entries(r.tracks)) expect(landTouched(tr), `敵 ${id} が水から出た`).toEqual([]);
		expect(errors).toEqual([]);
	});

	test('浮いた鮫は岸から剣で斬れる（潜っている間は斬っても減らない）', async ({ page }) => {
		const errors = await boot(page, 8, 5);
		const res = await page.evaluate(() => {
			const g = window.__game;
			g.setHeroDir('up');
			let hiddenHits = 0, shownHits = 0;
			for (let i = 0; i < 80; i++) {
				const s = g.getEnemies().find((e) => e.type === '<');
				if (!s) break;
				const near = Math.abs(s.x - 5) < 0.6 && Math.abs(s.y - 7) < 0.6;
				if (near) {
					const hp0 = s.hp, wasHidden = s.hidden;
					g.swordAttack();
					g.step(1);
					const after = g.getEnemies().find((e) => e.type === '<');
					const lost = hp0 - (after ? after.hp : 0);
					if (wasHidden && lost > 0) hiddenHits++;
					if (!wasHidden && lost > 0) shownHits++;
				} else g.step(1);
			}
			return { hiddenHits, shownHits };
		});
		expect(res.shownHits, '浮いた鮫を岸から斬れない').toBeGreaterThan(0);
		expect(res.hiddenHits, '潜っている鮫が斬られた').toBe(0);
		expect(errors).toEqual([]);
	});

	test('岸の縁で立ち止まると削られる（北の岸 (1,5)・南の岸 (8,5)）', async ({ page }) => {
		for (const [row, col] of [[1, 5], [8, 5]]) {
			const errors = await boot(page, row, col);
			const r = await runPlan(page, [], 120);
			expect(r.hpLost, `(${row},${col}) で 120 tick 立ち止まっても削られない`).toBeGreaterThan(0);
			for (const [id, tr] of Object.entries(r.tracks)) expect(landTouched(tr), `敵 ${id} が水から出た`).toEqual([]);
			expect(errors).toEqual([]);
		}
	});

	test('駆け抜ければ西の口から岸を回って北の口へ抜けられる', async ({ page }) => {
		const errors = await boot(page, 4, 0);
		// (4,0)→(4,1)→北へ (1,1)→東へ (1,5)→北の口
		const r = await runPlan(page, [...rep('right', 2), ...rep('up', 6), ...rep('right', 8), ...rep('up', 4)], 30);
		expect(r.r, '北の口まで抜けられない').toBeLessThan(0.5);
		expect(r.c).toBe(5);
		expect(errors).toEqual([]);
	});
});
