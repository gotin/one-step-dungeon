// tests/d3-tide-spiral.spec.js
// dungeon_3 `4,1`「渦の砂州」の番人
// （2026-11-04 / PLAN 実行キュー 94 の5室目＝潮の総仕上げ・盤面は `scripts/migrate-d3-4-1-tide-spiral.mjs`・
//   潮の規則は game/tide.js〈1室目 `4,3` で足した tideCycle〉をそのまま使う＝エンジンの変更なし）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   床のルピー R が1つあるだけ・敵なし・水なし。
//
// 新しい盤面（'~'＝bgTiles の水・'='＝潮ゲート〈砂の上〉）:
//      1 #~=======..#   ← 北の砂州 (1,2)〜(1,8)／中洲 (1,9)(1,10)
//      2 #~=~~~~~~E=#   ← 中洲 (2,9)＝パトロール E／東の砂州の先 (2,10)
//      4 #~=....~~~=#   ← 北の砂州の先 (4,2)／中央の小島
//      5 #~~...B~~~=#   ← 宝箱 (5,6)＝ルピー×50
//      8 #~~~~..====#   ← 南の岸・南の口／東の砂州の根元 (8,7)〜(8,10)
//
// 守るものは2つ。
//   ① データ：盤面・水と砂・宝箱（ルピー×50）・潮の周期（1・2室目と同じ）・満ちれば3つの陸は離れ
//      引けばつながる・区間の余りは 3 tick・通しは1回の引きでは足りない・E と enemyChase・宣言・層の接続。
//   ② 部屋（実機）：岸に居る間 E は中洲から出ない／素直に走ると E に塞がれ、満ちて岸へ押し戻される
//      （E も呑まれる）／角で誘い出して岸へ引き返せば E だけが呑まれる／縦の段で射れば同じ引きで中洲へ
//      ／通し＝誘い出す → 中洲 → 次の引きで小島・宝箱 +50・無傷／北の砂州で満ちると中洲へ押し戻される。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS, stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { tidalCellsOf } from '../game/tide.js';
import {
	LAYER, ROOM, TARGET, TIDE_CYCLE, CHEST, CHEST_ITEM, PATROL, MIDBAR, ISLAND, SHORE, BAR_EAST, BAR_NORTH,
	SHORE_STAND, MID_LAND, MID_STAND, ISLAND_LAND, BAR_CORNER, MOUTH, SAND, walk,
} from '../scripts/migrate-d3-4-1-tide-spiral.mjs';

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
test.describe('D3 渦の砂州 ① データ', () => {
	test('盤面・水と砂・宝箱（小島・ルピー×50）・潮の周期（1・2室目と同じ）', () => {
		expect(grid.map((r) => r.join('')), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(room.chestContents, '宝箱の中身が違う').toEqual({ [CHEST]: CHEST_ITEM });
		expect(CHEST_ITEM, '報酬がルピー×50 でない').toEqual({ type: 'rupee', value: 50, name: 'ルピー×50' });
		expect(ISLAND.includes(CHEST), '宝箱が小島に無い').toBe(true);
		expect(SAND.every((k) => room.bgTiles?.[k] === TILE.SAND), '砂州の下が砂でない').toBe(true);
		expect([...MIDBAR, ...ISLAND, ...SHORE].filter((k) => room.bgTiles?.[k]), '中洲・小島・岸に見た目の下地がある').toEqual([]);
		expect(rowStr(room.tiles.flat()).includes(TILE.WATER), 'tiles 層に水がある（水は bgTiles だけ）').toBe(false);
		expect(room.tideCycle, '潮の周期が無い／違う').toEqual(TIDE_CYCLE);
		expect(room.tideCycle, '1室目 4,3 と潮のリズムが違う').toEqual(stages['4,3'].tideCycle);
		expect(room.tideCycle, '2室目 2,1 と潮のリズムが違う').toEqual(stages['2,1'].tideCycle);
		expect(tidalCellsOf(room).sort(), '潮の周期で動く `=` が砂州と違う').toEqual([...SAND].sort());
	});

	test('満ちれば岸・中洲・小島は離れ、引けば全部つながる・区間の余りは 3 tick・通しは足りない・口は潮ゲートでない', () => {
		const same = (m) => [...m.keys()].sort();
		expect(same(walk(grid, ['9,5'])), '満ちていても南の岸から先へ歩ける').toEqual([...SHORE].sort());
		expect(same(walk(grid, [MID_STAND])), '満ちていても中洲から先へ歩ける').toEqual([...MIDBAR].sort());
		expect(walk(grid, [ISLAND_LAND]).has(MID_STAND), '満ちていても小島から中洲へ歩ける').toBe(false);
		expect(walk(grid, ['9,5'], { tideOpen: true }).has(ISLAND_LAND), '引いても岸から小島へ渡れない').toBe(true);
		const legE = walk(grid, [SHORE_STAND], { tideOpen: true }).get(MID_LAND);
		const legN = walk(grid, [MID_STAND], { tideOpen: true }).get(ISLAND_LAND);
		const whole = walk(grid, [SHORE_STAND], { tideOpen: true }).get(ISLAND_LAND);
		expect(legE * TICKS_PER_CELL, '東の区間が1回の引きで渡れない').toBeLessThanOrEqual(LOW_TICKS);
		expect(LOW_TICKS - legE * TICKS_PER_CELL, '東の区間の余りが 3 tick より多い＝切迫しない').toBeLessThanOrEqual(3);
		expect(legN * TICKS_PER_CELL, '北の区間が1回の引きで渡れない').toBeLessThanOrEqual(LOW_TICKS);
		expect(LOW_TICKS - legN * TICKS_PER_CELL, '北の区間の余りが 3 tick より多い＝切迫しない').toBeLessThanOrEqual(3);
		expect(whole * TICKS_PER_CELL, '通しが1回の引きで渡れる＝中洲で待つ意味が無い').toBeGreaterThan(LOW_TICKS);
		expect(MOUTH.filter((k) => { const [r, c] = k.split(',').map(Number); return grid[r][c] === TILE.TIDE_GATE; }),
			'口に潮ゲートがある＝入った瞬間に押し戻される').toEqual([]);
	});

	test('敵は中洲の E×1・いつも追う・宣言あり・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs, '敵の顔ぶれか位置が違う').toEqual([`${TILE.PATROL}@${PATROL}`]);
		expect(room.enemyChase, 'E がいつも追わない＝角に来ても砂州へ出てこない').toEqual({ [PATROL]: true });
		expect(stageThreat(room, ENEMY_META)).toBe(4);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), '敵の宣言が無い').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: false, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ② 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '10', ps_bow: '1', ps_shield: '1',
	});
	return `${GAME}?${p.toString()}`;
}
// debug を切る（fromEditor の既定は「無敵・すり抜け」＝すり抜けたままだと水も通れ、押し戻しも起きない）
async function boot(page) {
	const errors = [];
	page.on('pageerror', (e) => { if (!/resume a context/.test(e.message)) errors.push(e.message); });
	await page.goto(previewUrl(8, 6));
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game?.getEnemies?.().length === 1);
	await page.keyboard.press('g');
	await page.evaluate(() => { const g = window.__game; g.pause(); g.getPlayer()._shownSubItemHint = true; });
	return errors;
}
// 共通の手（page.evaluate の中で eval して使う）。path は "r,c" の列＝1マスずつ歩く（曲がり角を正しく曲がる）。
const HELPERS = `({
	to(g, r, c, max = 8) { for (let i = 0; i < max; i++) { const p = g.getState().player; if (Math.abs(p.y - r) < 0.01 && Math.abs(p.x - c) < 0.01) return true;
		g.movePlayer(Math.abs(p.x - c) > 0.01 ? (p.x < c ? 'right' : 'left') : (p.y < r ? 'down' : 'up')); g.step(1); } return false; },
	path(g, cells) { for (const k of cells) { const [r, c] = k.split(',').map(Number); if (!this.to(g, r, c)) return k; } return null; },
	until(g, pred, n = 120) { for (let i = 0; i < n; i++) { if (pred(g.getStageState().tide)) return true; g.step(1); } return pred(g.getStageState().tide); },
	at(g) { const p = g.getState().player; return p.y + ',' + p.x; },
	foe(g) { const e = g.getEnemies()[0]; return e ? e.y + ',' + e.x : null; },
	// 引いた瞬間（引きの残りがほぼ丸ごと）まで待つ
	freshLow(g) { this.until(g, (t) => !t.low, 120); return this.until(g, (t) => t.low && t.msToChange >= 2900, 120); },
	// 角で E が東の砂州の先に乗り切るまで待つ（半歩のまま戻ると E は中洲へ引っ込む）
	lure(g, corner, back) { this.path(g, corner); for (let i = 0; i < 20 && this.foe(g) !== '2,10'; i++) g.step(1); const out = this.foe(g); this.path(g, back); return out; },
})`;
const TO_CORNER = ['8,7', '8,8', '8,9', BAR_CORNER];
const BACK = ['8,9', '8,8', '8,7', SHORE_STAND];
const ROUTE_EAST = [...BAR_EAST, MID_LAND];
const ROUTE_NORTH = [MID_STAND, ...BAR_NORTH, ISLAND_LAND];

test.describe('D3 渦の砂州 ② 部屋', () => {
	test('勇者が岸に居る間は、引いていても E は中洲から出ない', async ({ page }) => {
		const errors = await boot(page);
		const r = await page.evaluate(([helpers]) => {
			const g = window.__game; const h = eval(helpers);
			const seen = new Set(); let lows = 0, wasLow = false;
			for (let i = 0; i < 140; i++) { g.step(1); seen.add(h.foe(g)); const low = g.getStageState().tide.low; if (low && !wasLow) lows++; wasLow = low; }
			return { seen: [...seen], lows };
		}, [HELPERS]);
		expect(r.lows, '待つ間に一度も引かない').toBeGreaterThanOrEqual(2);
		expect(r.seen, 'E が中洲から動いた').toEqual([PATROL]);
		expect(errors).toEqual([]);
	});

	test('素直に走ると、東の砂州の先で E に塞がれ、満ちて岸へ押し戻される（E も呑まれる）', async ({ page }) => {
		const errors = await boot(page);
		const r = await page.evaluate(([helpers, route]) => {
			const g = window.__game; const h = eval(helpers);
			const hp0 = g.getState().player.hp;
			h.freshLow(g);
			const below = h.path(g, route.slice(0, 9));   // (3,10)＝東の砂州の先の1つ手前まで
			for (let i = 0; i < 2; i++) g.step(1);
			const foeAt = h.foe(g);
			const stuck = below ?? h.path(g, route.slice(9));
			h.until(g, (t) => !t.low, 40);
			for (let i = 0; i < 12; i++) g.step(1);
			return { stuck, foeAt, end: h.at(g), hpLost: hp0 - g.getState().player.hp, left: g.getEnemies().length };
		}, [HELPERS, ROUTE_EAST]);
		expect(r.stuck, '塞がれずに中洲まで渡れた＝E が道を塞がない').toBe('2,10');
		expect(r.foeAt, 'E が東の砂州の先に居ない').toBe('2,10');
		expect(r.end, '岸の根元へ押し戻されない').toBe(SHORE_STAND);
		expect(r.hpLost, '押し戻されて減ったのが半ハートでない').toBe(1);
		expect(r.left, '砂州の上の E が呑まれない').toBe(0);
		expect(errors).toEqual([]);
	});

	test('角で誘い出して岸へ引き返せば、E だけが満ち潮に呑まれる（無傷）', async ({ page }) => {
		const errors = await boot(page);
		const r = await page.evaluate(([helpers, corner, back]) => {
			const g = window.__game; const h = eval(helpers);
			const hp0 = g.getState().player.hp;
			h.freshLow(g);
			const out = h.lure(g, corner, back);
			const backInLow = g.getStageState().tide.low;
			h.until(g, (t) => !t.low, 40);
			for (let i = 0; i < 12; i++) g.step(1);
			return { out, backInLow, end: h.at(g), hpLost: hp0 - g.getState().player.hp, left: g.getEnemies().length };
		}, [HELPERS, TO_CORNER, BACK]);
		expect(r.out, '角に来ても E が東の砂州の先へ出ない').toBe('2,10');
		expect(r.backInLow, '誘い出してから岸へ戻るのが間に合わない').toBe(true);
		expect(r.end).toBe(SHORE_STAND);
		expect(r.hpLost, '引き返したのに減った').toBe(0);
		expect(r.left, '砂州へ出た E が呑まれない').toBe(0);
		expect(errors).toEqual([]);
	});

	test('縦の段で一直線になった E を射れば、同じ引きで中洲へ渡れる', async ({ page }) => {
		const errors = await boot(page);
		const r = await page.evaluate(([helpers, route]) => {
			const g = window.__game; const h = eval(helpers);
			const hp0 = g.getState().player.hp;
			h.freshLow(g);
			h.path(g, route.slice(0, 5));   // (7,10)＝縦の段の下
			g.setHeroDir('up');
			for (let i = 0; i < 30 && g.getEnemies().length; i++) { const e = g.getEnemies()[0]; if (Math.abs(e.x - 10) < 0.6) g.useSubItem(); g.step(1); }
			const left = g.getEnemies().length;
			const stuck = h.path(g, route.slice(5));
			const lowAtLanding = g.getStageState().tide.low;
			h.until(g, (t) => !t.low, 40);
			return { left, stuck, lowAtLanding, end: h.at(g), hpLost: hp0 - g.getState().player.hp };
		}, [HELPERS, ROUTE_EAST]);
		expect(r.left, '縦の段で射ても E が落ちない').toBe(0);
		expect(r.stuck, '射てから中洲まで渡れない').toBeNull();
		expect(r.lowAtLanding).toBe(true);
		expect(r.end, '中洲で満ちを待てない').toBe(MID_LAND);
		expect(r.hpLost).toBe(0);
		expect(errors).toEqual([]);
	});

	test('通し：誘い出して呑ませ、次の引きで中洲・その次の引きで小島へ渡って宝箱 +50＝無傷', async ({ page }) => {
		const errors = await boot(page);
		const r = await page.evaluate(([helpers, corner, back, east, north, chest]) => {
			const g = window.__game; const h = eval(helpers);
			const hp0 = g.getState().player.hp;
			h.freshLow(g);
			h.lure(g, corner, back);
			h.until(g, (t) => !t.low, 40);
			for (let i = 0; i < 6; i++) g.step(1);
			const left = g.getEnemies().length;
			h.freshLow(g);
			const stuckE = h.path(g, east);
			h.until(g, (t) => !t.low, 40);
			const waited = h.at(g);
			h.freshLow(g);
			const stuckN = h.path(g, north);
			h.until(g, (t) => !t.low, 40);
			const onIsland = h.at(g);
			const rupees0 = g.getState().player.rupees;
			h.path(g, ['4,4', '4,5', '5,5']);
			for (let i = 0; i < 3; i++) { g.movePlayer('right'); g.step(1); }
			return { left, stuckE, waited, stuckN, onIsland, opened: g.getStageState().openedChests.includes(chest),
				gained: g.getState().player.rupees - rupees0, hpLost: hp0 - g.getState().player.hp };
		}, [HELPERS, TO_CORNER, BACK, ROUTE_EAST, ROUTE_NORTH, CHEST]);
		expect(r.left, 'E が呑まれない').toBe(0);
		expect(r.stuckE, '東の砂州を1回の引きで渡り切れない').toBeNull();
		expect(r.waited, '中洲で満ちを待ったら動かされた').toBe(MID_LAND);
		expect(r.stuckN, '北の砂州を1回の引きで渡り切れない').toBeNull();
		expect(r.onIsland, '小島で満ちを待てない').toBe(ISLAND_LAND);
		expect(r.opened, '宝箱が開かない').toBe(true);
		expect(r.gained, '宝箱でルピー×50 が増えていない').toBe(50);
		expect(r.hpLost, '潮を読んで渡ったのに減った').toBe(0);
		expect(errors).toEqual([]);
	});

	test('北の砂州で満ちると、岸でなく中洲へ押し戻される', async ({ page }) => {
		const errors = await boot(page);
		const r = await page.evaluate(([helpers, corner, back, east, north]) => {
			const g = window.__game; const h = eval(helpers);
			h.freshLow(g);
			h.lure(g, corner, back);
			h.freshLow(g);
			h.path(g, east);
			h.to(g, 1, 9);
			const hp0 = g.getState().player.hp;
			// 引いてから 4 tick 遅れて踏み出す＝余り 3 tick を食い潰して北の砂州の上で満ちる
			h.freshLow(g);
			for (let i = 0; i < 4; i++) g.step(1);
			const stuck = h.path(g, north.slice(1));
			h.until(g, (t) => !t.low, 40);
			return { stuck, end: h.at(g), hpLost: hp0 - g.getState().player.hp };
		}, [HELPERS, TO_CORNER, BACK, ROUTE_EAST, ROUTE_NORTH]);
		expect(r.stuck, '4 tick 遅れても渡り切れた＝余りが 3 tick より多い').not.toBeNull();
		expect(MIDBAR, `中洲へ押し戻されない（${r.end}）`).toContain(r.end);
		expect(r.hpLost).toBe(1);
		expect(errors).toEqual([]);
	});
});
