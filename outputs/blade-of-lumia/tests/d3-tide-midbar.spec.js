// tests/d3-tide-midbar.spec.js
// dungeon_3 `2,1`「潮待ちの中洲」の番人
// （2026-11-03 / PLAN 実行キュー 94 の2室目・盤面は `scripts/migrate-d3-2-1-tide-midbar.mjs`・
//   潮の規則は game/tide.js〈1室目 `4,3` で足した tideCycle〉をそのまま使う＝エンジンの変更なし）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   碑と床の矢束が1つずつあるだけ・敵なし・水なし。
//
// 新しい盤面（'~'＝bgTiles の水・'='＝潮ゲート〈砂の上〉）:
//      2 #~6=======~#   ← 中洲 (2,2)(3,2)・矢束 (2,2)／東の砂州 (2,3)〜(2,9)
//      3 #~.~~~~~~=~#   ← 東の砂州の曲がり (3,9)
//      4 #~=~~~~~~...   ← 西の砂州 (4,2)／東の岸・東の口
//      7 #~=~~....†~#   ← 南の岸・碑 (7,9)
//      8 #~===.....~#   ← 西の砂州の根元／南の岸・南の口
//
// 守るものは2つ。
//   ① データ：盤面・水と砂・矢束（中洲・×10）・碑（本文は同じ）・潮の周期（1室目と同じ）・
//      満ちれば3つの陸は離れ引けばつながる・区間は1回の引きで足り、通しは足りない・層の接続。
//   ② 部屋（実機）：通し＝南の岸 → 中洲（矢束を拾う）→ 次の引きで東の岸、無傷
//      ／1回の引きで通そうとすると、東の砂州の上で満ちて中洲へ押し戻される（岸までは戻らない）
//      ／西の砂州で満ちると南の岸へ押し戻される／東の口から入っても中洲を経て南の岸へ渡れる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { tidalCellsOf } from '../game/tide.js';
import {
	LAYER, ROOM, TARGET, TIDE_CYCLE, ARROWS, ARROWS_COUNT, SIGN, MIDBAR, BAR_WEST, BAR_EAST,
	SOUTH_SHORE, EAST_SHORE, SOUTH_STAND, EAST_STAND, OPENING, SAND, walk,
} from '../scripts/migrate-d3-2-1-tide-midbar.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
// 配っているマップで測る＝TARGET で測るとマップを壊しても緑のまま。水は bgTiles∴'~' として重ねる
const grid = room.tiles.map((row, r) => [...rowStr(row)].map((ch, c) => (room.bgTiles?.[`${r},${c}`] === TILE.WATER ? TILE.WATER : ch)));
// 引きの長さ＝25 tick・勇者は 1 マス 2 tick。⚠️ TIDE_CYCLE から計算しない＝定数を壊すと物差しも追従して緑のまま。
const LOW_TICKS = 25;
const TICKS_PER_CELL = 2;

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D3 潮待ちの中洲 ① データ', () => {
	test('盤面・水と砂・矢束（中洲・×10）・碑・潮の周期（1室目と同じ）', () => {
		expect(grid.map((r) => r.join('')), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(room.floorItems, '矢束の位置か数が違う').toEqual({ [ARROWS]: { count: ARROWS_COUNT } });
		expect(MIDBAR.includes(ARROWS), '矢束が中洲に無い').toBe(true);
		expect(Object.keys(room.signData ?? {}), '碑の位置が違う').toEqual([SIGN]);
		expect(room.signData[SIGN].name).toBe('渇いた碑文');
		expect(room.signData[SIGN].lines?.length, '碑の本文が無い＝無言の碑').toBeGreaterThan(0);
		expect(SAND.every((k) => room.bgTiles?.[k] === TILE.SAND), '砂州の下が砂でない').toBe(true);
		expect([...MIDBAR, ...SOUTH_SHORE, ...EAST_SHORE].filter((k) => room.bgTiles?.[k]), '中洲・岸に見た目の下地がある').toEqual([]);
		expect(rowStr(room.tiles.flat()).includes(TILE.WATER), 'tiles 層に水がある（水は bgTiles だけ）').toBe(false);
		expect(room.tideCycle, '潮の周期が無い／違う').toEqual(TIDE_CYCLE);
		expect(room.tideCycle, '1室目 4,3 と潮のリズムが違う').toEqual(stages['4,3'].tideCycle);
		expect(tidalCellsOf(room).sort(), '潮の周期で動く `=` が砂州と違う').toEqual([...SAND].sort());
	});

	test('満ちれば南の岸・中洲・東の岸は離れ、引けば全部つながる・口は潮ゲートでない', () => {
		const same = (m) => [...m.keys()].sort();
		expect(same(walk(grid, [OPENING.south])), '満ちていても南の岸から先へ歩ける').toEqual([...SOUTH_SHORE].sort());
		expect(same(walk(grid, [OPENING.east])), '満ちていても東の岸から先へ歩ける').toEqual([...EAST_SHORE].sort());
		expect(same(walk(grid, [MIDBAR[0]])), '満ちていても中洲から岸へ歩ける').toEqual([...MIDBAR].sort());
		const low = walk(grid, [OPENING.south], { tideOpen: true });
		expect(low.has(OPENING.east), '引いても南の口から東の口へ渡れない').toBe(true);
		expect(['8,5', '8,6', '4,10', '5,10', '4,11', '5,11'].filter((k) => { const [r, c] = k.split(',').map(Number); return grid[r][c] === TILE.TIDE_GATE; }),
			'口に潮ゲートがある＝入った瞬間に押し戻される').toEqual([]);
	});

	test('区間は1回の引きで渡れ、通しは渡れない・敵なし・層の接続は不変', () => {
		const legW = walk(grid, [SOUTH_STAND], { tideOpen: true }).get(MIDBAR[1]);
		const legE = walk(grid, [MIDBAR[0]], { tideOpen: true }).get(EAST_STAND);
		const whole = walk(grid, [SOUTH_STAND], { tideOpen: true }).get(EAST_STAND);
		expect(legW * TICKS_PER_CELL, '西の区間が1回の引きで渡れない').toBeLessThanOrEqual(LOW_TICKS);
		expect(legE * TICKS_PER_CELL, '東の区間が1回の引きで渡れない').toBeLessThanOrEqual(LOW_TICKS);
		expect(whole * TICKS_PER_CELL, '通しが1回の引きで渡れる＝中洲で待つ意味が無い').toBeGreaterThan(LOW_TICKS);
		const mobs = grid.flat().filter((ch) => ENEMY_META[ch]);
		expect(mobs, '敵が居る').toEqual([]);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: false, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.reachedRooms.has('3,1'), 'コンパスの間 3,1 に入れない（地図の間 3,2 経由の回り道が切れた）').toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ② 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '10', ps_bow: '1',
	});
	return `${GAME}?${p.toString()}`;
}
// debug を切る（fromEditor の既定は「無敵・すり抜け」＝すり抜けたままだと水も通れ、押し戻しも起きない）
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => { if (!/resume a context/.test(e.message)) errors.push(e.message); });
	await page.goto(previewUrl(row, col));
	await waitForBoard(page);
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// 共通の手（page.evaluate の中で eval して使う）。path は "r,c" の列＝1マスずつ歩く（曲がり角を正しく曲がる）。
const HELPERS = `({
	to(g, r, c, max = 40) { for (let i = 0; i < max; i++) { const p = g.getState().player; if (Math.abs(p.y - r) < 0.01 && Math.abs(p.x - c) < 0.01) return true;
		g.movePlayer(Math.abs(p.x - c) > 0.01 ? (p.x < c ? 'right' : 'left') : (p.y < r ? 'down' : 'up')); g.step(1); } return false; },
	path(g, cells) { for (const k of cells) { const [r, c] = k.split(',').map(Number); if (!this.to(g, r, c, 8)) return k; } return null; },
	until(g, pred, n = 120) { for (let i = 0; i < n; i++) { if (pred(g.getStageState().tide)) return true; g.step(1); } return pred(g.getStageState().tide); },
	// 引いた瞬間（引きの残りがほぼ丸ごと）まで待つ
	at(g) { const p = g.getState().player; return p.y + ',' + p.x; },
	freshLow(g) { this.until(g, (t) => !t.low, 120); return this.until(g, (t) => t.low && t.msToChange >= 2800, 120); },
})`;
const ROUTE_WEST = [...BAR_WEST, MIDBAR[1], MIDBAR[0]];            // 南の岸の根元 → 中洲（矢束）
const ROUTE_EAST = [...BAR_EAST, EAST_STAND];                      // 中洲 → 東の岸

test.describe('D3 潮待ちの中洲 ② 部屋', () => {
	test('通し：引いたら中洲へ渡って矢束を拾い、次の引きで東の岸へ＝無傷', async ({ page }) => {
		const errors = await boot(page, 8, 5);
		const r = await page.evaluate(([helpers, w, e]) => {
			const g = window.__game; const h = eval(helpers);
			const hp0 = g.getState().player.hp;
			g.getPlayer().subItems.bow.count = 0;   // ps_bow は満タンで始まる＝撃ち尽くした状態にしてから拾う
			g.getPlayer()._shownSubItemHint = true; // 本編では弓（1,2）で既に出ている「初めてのサブアイテム」の窓＝開くと足が止まる
			const arrows0 = g.getPlayer().subItems.bow.count ?? 0;
			const high0 = !g.getStageState().tide.low;
			h.freshLow(g);
			const stuckW = h.path(g, w);
			const arrows = (g.getPlayer().subItems.bow.count ?? 0) - arrows0;
			// 中洲で満ちを待つ（押し戻されない＝乾いた所）
			h.until(g, (t) => !t.low);
			const waited = h.at(g);
			h.freshLow(g);
			const stuckE = h.path(g, e);
			h.until(g, (t) => !t.low);
			return { high0, stuckW, arrows, waited, stuckE, end: h.at(g), hpLost: hp0 - g.getState().player.hp };
		}, [HELPERS, ROUTE_WEST, ROUTE_EAST]);
		expect(r.high0, '入った瞬間に引いている').toBe(true);
		expect(r.stuckW, '西の砂州を1回の引きで渡り切れない').toBeNull();
		expect(r.arrows, '中洲で矢束を拾えない').toBeGreaterThan(0);
		expect(r.waited, '中洲で満ちを待ったら動かされた').toBe(MIDBAR[0]);
		expect(r.stuckE, '東の砂州を1回の引きで渡り切れない').toBeNull();
		expect(r.end, '東の岸に着いていない').toBe(EAST_STAND);
		expect(r.hpLost, '引きに合わせて渡ったのに減った').toBe(0);
		expect(errors).toEqual([]);
	});

	test('1回の引きで通そうとすると、東の砂州の上で満ちて中洲へ押し戻される（岸までは戻らない）', async ({ page }) => {
		const errors = await boot(page, 8, 5);
		const r = await page.evaluate(([helpers, route, bar]) => {
			const g = window.__game; const h = eval(helpers);
			const hp0 = g.getState().player.hp;
			h.freshLow(g);
			let caught = null;
			for (const k of route) {
				const [rr, cc] = k.split(',').map(Number);
				const before = g.getStageState().tide.low;
				h.to(g, rr, cc, 8);
				if (before && !g.getStageState().tide.low) { caught = k; break; }
				if (!g.getStageState().tide.low) { caught = k; break; }
			}
			const p = g.getState().player;
			return { caught, end: h.at(g), onEastBar: caught != null && bar.includes(caught), hpLost: hp0 - p.hp };
		}, [HELPERS, [...ROUTE_WEST, ...ROUTE_EAST], BAR_EAST]);
		expect(r.caught, '1回の引きで通しが渡れた＝中洲で待つ意味が無い').not.toBeNull();
		expect(r.onEastBar, `満ちたのが東の砂州の上でない（${r.caught}）`).toBe(true);
		expect(MIDBAR, `中洲へ押し戻されない（${r.end}）`).toContain(r.end);
		expect(r.hpLost, '押し戻されて減ったのが半ハートでない').toBe(1);
		expect(errors).toEqual([]);
	});

	test('西の砂州で満ちると、南の岸へ押し戻される', async ({ page }) => {
		const errors = await boot(page, 8, 5);
		const r = await page.evaluate(([helpers, bar]) => {
			const g = window.__game; const h = eval(helpers);
			const hp0 = g.getState().player.hp;
			// 予告が来てから踏み出す＝渡り切る前に満ちる
			h.until(g, (t) => t.warn, 120);
			h.path(g, bar.slice(0, 4));
			h.until(g, (t) => !t.low);
			const p = g.getState().player;
			return { end: h.at(g), hpLost: hp0 - p.hp };
		}, [HELPERS, BAR_WEST]);
		expect(r.end, '南の岸の根元へ押し戻されない').toBe(SOUTH_STAND);
		expect(r.hpLost).toBe(1);
		expect(errors).toEqual([]);
	});

	test('東の口から入っても、中洲を経て南の岸へ渡れる', async ({ page }) => {
		const errors = await boot(page, 4, 10);
		const r = await page.evaluate(([helpers, routeE, routeW]) => {
			const g = window.__game; const h = eval(helpers);
			const pos = () => { const p = g.getState().player; return `${p.y},${p.x}`; };
			const hp0 = g.getState().player.hp;
			h.freshLow(g);
			const stuckE = h.path(g, routeE);
			h.until(g, (t) => !t.low);
			const mid = pos();
			h.freshLow(g);
			const stuckW = h.path(g, routeW);
			h.until(g, (t) => !t.low);
			return { stuckE, mid, stuckW, end: pos(), hpLost: hp0 - g.getState().player.hp };
		}, [HELPERS, [EAST_STAND, ...BAR_EAST.slice().reverse(), MIDBAR[0]], [MIDBAR[1], ...BAR_WEST.slice().reverse(), SOUTH_STAND]]);
		expect(r.stuckE, '東の砂州を1回の引きで渡り切れない').toBeNull();
		expect(r.mid, '中洲で満ちを待てない').toBe(MIDBAR[0]);
		expect(r.stuckW, '西の砂州を1回の引きで渡り切れない').toBeNull();
		expect(r.end, '南の岸に着いていない').toBe(SOUTH_STAND);
		expect(r.hpLost).toBe(0);
		expect(errors).toEqual([]);
	});
});
