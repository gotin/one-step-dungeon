// tests/d3-tide-sandbar.spec.js
// dungeon_3 `4,3`「潮だまりの砂州」と、潮ゲートが時間で満ち引きする規則の番人
// （2026-11-02 / PLAN 実行キュー 94 の1室目・盤面は `scripts/migrate-d3-4-3-tide-sandbar.mjs`・
//   エンジンは game/tide.js〈tideCycle〉＋ enemy-ai.js sinkEnemiesOnCells〈D8 4,1 の沈みを流用〉）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   床のルピー R(4,6) が1つあるだけ・敵なし。
//
// 新しい盤面（'~'＝bgTiles の水・'='＝潮ゲート〈砂の上〉）:
//      3 #...~~~~~..#   ← 小島（行3〜6×列9〜10）
//      4 ....~~~~~.E#   ← パトロール E(4,10)
//      5 ....=====..#   ← 砂州（幅1・満ち 3.6 秒 → 引き 3.0 秒の繰り返し・最後の 0.72 秒は予告）
//      6 #...~~~~~.B#   ← 宝箱 B(6,10)＝ルピー×20
//
// 守るものは3つ。
//   ① データ：盤面・水と砂・宝箱・潮の周期・砂州は links に無い・満ちれば小島は離れる・宣言・層の接続。
//   ② 部屋（実機）：入ると満ち→引き→（予告）→満ち の周期・予告の間だけ砂州が波打つ
//      ／砂州でぐずぐずすると岸へ押し戻されて半ハート／砂州へ出てきた E が満ち潮に呑まれる（撃破に数え・戻らない）
//      ／ブーメランで止めた E も呑まれる／通し＝E を呑ませて渡り、宝箱 +20、次の引きで戻る。
//   ③ 規則（実機の対照）：小島の上の E は満ちても沈まない／すり抜け（デバッグ）中は押し戻さない
//      ／周期の無い部屋の `=`（D3 `3,0`＝ボタンの潮）は時間で動かない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { tidalCellsOf, tidePhaseAt } from '../game/tide.js';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, TARGET, TIDE_CYCLE, PATROL, CHEST, CHEST_CONTENT, SANDBAR, ISLAND, SHORE_STAND, OPENING, SAND, walk,
} from '../scripts/migrate-d3-4-3-tide-sandbar.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
// 配っているマップで測る＝TARGET で測るとマップを壊しても緑のまま。水は bgTiles∴'~' として重ねる
const grid = room.tiles.map((row, r) => [...rowStr(row)].map((ch, c) => (room.bgTiles?.[`${r},${c}`] === TILE.WATER ? TILE.WATER : ch)));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D3 潮だまりの砂州 ① データ', () => {
	test('盤面・水と砂・宝箱（ルピー×20）・潮の周期', () => {
		expect(grid.map((r) => r.join('')), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(room.chestContents, '宝箱の中身が違う').toEqual({ [CHEST]: CHEST_CONTENT });
		expect(SAND.every((k) => room.bgTiles?.[k] === TILE.SAND), '砂州と小島の下が砂でない').toBe(true);
		expect(rowStr(room.tiles.flat()).includes(TILE.WATER), 'tiles 層に水がある（水は bgTiles だけ）').toBe(false);
		expect(room.tideCycle, '潮の周期が無い／違う').toEqual(TIDE_CYCLE);
		expect(SANDBAR.every((k) => { const [r, c] = k.split(',').map(Number); return grid[r][c] === TILE.TIDE_GATE; }), '砂州が潮ゲートでない').toBe(true);
		expect(room.links ?? [], '砂州が links につながっている＝潮の周期で動かない').toEqual([]);
	});

	test('満ちていれば小島は離れ、引けば全部つながる・口は潮ゲートでない', () => {
		const high = walk(grid, [OPENING.west], { tideOpen: false });
		const low = walk(grid, [OPENING.west], { tideOpen: true });
		const islandFloor = ISLAND.filter((k) => k !== CHEST);
		expect(islandFloor.filter((k) => high.has(k)), '満ちていても小島へ歩いて入れる').toEqual([]);
		expect(islandFloor.filter((k) => !low.has(k)), '引いても小島へ入れない').toEqual([]);
		expect(high.has(SHORE_STAND), '岸の砂州の根元に届かない').toBe(true);
		expect(['4,0', '5,0', '4,1', '5,1'].filter((k) => { const [r, c] = k.split(',').map(Number); return grid[r][c] === TILE.TIDE_GATE; }),
			'口に潮ゲートがある＝入った瞬間に押し戻される').toEqual([]);
	});

	test('敵は E×1（小島）・脅威度は看板部屋より軽い・宣言あり・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.PATROL}@${PATROL}`]);
		expect(room.enemyChase, 'E がいつも追わない＝さまよって砂州へ出てこないことがある').toEqual({ [PATROL]: true });
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['1,3'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: false, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ②③ 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(layer, stage, row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer, stage, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '10', ps_boomerang: '1',
	});
	return `${GAME}?${p.toString()}`;
}
// debug を切る（fromEditor の既定は「無敵・すり抜け」＝すり抜けたままだと水も通れ、押し戻しも起きない）
async function boot(page, row, col, { layer = LAYER, stage = ROOM, enemies = 1, debug = false } = {}) {
	const errors = [];
	page.on('pageerror', (e) => { if (!/resume a context/.test(e.message)) errors.push(e.message); });
	await page.goto(previewUrl(layer, stage, row, col));
	await waitForBoard(page);
	await page.waitForFunction((n) => window.__game.getEnemies().length === n, enemies);
	if (!debug) await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// 共通の手（page.evaluate の中で eval して使う）
const HELPERS = `({
	walk(g, r, c, max = 60) { for (let i = 0; i < max; i++) { const p = g.getState().player; if (Math.abs(p.y - r) < 0.01 && Math.abs(p.x - c) < 0.01) return true;
		g.movePlayer(Math.abs(p.x - c) > 0.01 ? (p.x < c ? 'right' : 'left') : (p.y < r ? 'down' : 'up')); g.step(1); } return false; },
	// 潮が望みの状態になるまで進める（上限 n tick）。成ったら true。
	until(g, pred, n = 120) { for (let i = 0; i < n; i++) { if (pred(g.getStageState().tide)) return true; g.step(1); } return pred(g.getStageState().tide); },
})`;
// 周期の上限＝満ち 3.6 秒＋引き 3.0 秒＝55 tick。⚠️ TIDE_CYCLE から計算しない＝定数を壊すと待ちも追従して緑のまま。
const CYCLE_TICKS = 55;

test.describe('D3 潮だまりの砂州 ② 部屋', () => {
	test('入ると満ちから始まり、引いて砂州が現れ、予告の間だけ波打ち、また満ちる', async ({ page }) => {
		const errors = await boot(page, 5, 3);
		const r = await page.evaluate(([helpers, bar, cyc]) => {
			const g = window.__game; const h = eval(helpers);
			const t0 = g.getStageState().tide;
			// 満ちている間は砂州に踏み込めない
			for (let i = 0; i < 3; i++) { g.movePlayer('right'); g.step(1); }
			const blockedAt = g.getState().player.x;
			let ticks = 0, lowAt = null, warnAt = null, highAt = null, rippleInWarn = false, rippleOutsideWarn = false;
			for (; ticks < cyc * 2 && highAt == null; ticks++) {
				g.step(1);
				const t = g.getStageState().tide;
				const ripple = bar.every((k) => { const [rr, cc] = k.split(',').map(Number);
					return document.querySelector('#board .cell[data-row="' + rr + '"][data-col="' + cc + '"]')?.classList.contains('tide-rising'); });
				if (t.low && lowAt == null) lowAt = ticks;
				if (t.warn && warnAt == null) warnAt = ticks;
				if (t.warn && ripple) rippleInWarn = true;
				if (!t.warn && ripple) rippleOutsideWarn = true;
				if (lowAt != null && !t.low) highAt = ticks;
			}
			const open = g.getStageState().openGates;
			return { t0, blockedAt, lowAt, warnAt, highAt, rippleInWarn, rippleOutsideWarn, openAfter: bar.filter((k) => open.includes(k)) };
		}, [HELPERS, SANDBAR, CYCLE_TICKS]);
		expect(r.t0?.low, '入った瞬間に引いている（満ちから始まらない）').toBe(false);
		expect(r.t0?.cells?.slice().sort(), '潮の周期で動く `=` が砂州と違う').toEqual([...SANDBAR].sort());
		expect(r.blockedAt, '満ちているのに砂州へ踏み込めた').toBe(3);
		expect(r.lowAt, `${CYCLE_TICKS} tick 待っても潮が引かない`).not.toBeNull();
		expect(r.lowAt, '引くのが早すぎる（満ちが 3 秒未満）').toBeGreaterThanOrEqual(25);
		expect(r.warnAt, '予告が来ない').not.toBeNull();
		expect(r.warnAt - r.lowAt, '予告が引きの最後でない（引いてすぐ波打つ）').toBeGreaterThanOrEqual(15);
		expect(r.highAt, '引いたまま満ちない').not.toBeNull();
		expect(r.highAt - r.warnAt, '予告から満ちるまでが短すぎる／長すぎる').toBeGreaterThanOrEqual(4);
		expect(r.highAt - r.warnAt).toBeLessThanOrEqual(8);
		expect(r.rippleInWarn, '予告の間に砂州が波打たない（.tide-rising が付かない）').toBe(true);
		expect(r.rippleOutsideWarn, '予告でないのに砂州が波打っている').toBe(false);
		expect(r.openAfter, '満ちたのに砂州が開いたまま').toEqual([]);
		expect(errors).toEqual([]);
	});

	test('砂州でぐずぐずすると、満ちた瞬間に岸へ押し戻されて半ハート減る', async ({ page }) => {
		const errors = await boot(page, 5, 3);
		const r = await page.evaluate(([helpers, patrol]) => {
			const g = window.__game; const h = eval(helpers);
			g.dealDamage(patrol, 99); g.step(2);   // E は別の番で見る（ここでは押し戻しだけを測る）
			h.until(g, (t) => t.low && !t.warn);
			const go = h.walk(g, 5, 6);
			const hp0 = g.getState().player.hp;
			h.until(g, (t) => !t.low);
			const p = g.getState().player;
			return { go, hp0, hp: p.hp, at: `${p.y},${p.x}`, kills: g.getEnemies().length };
		}, [HELPERS, PATROL]);
		expect(r.kills, '前提：E が倒れていない').toBe(0);
		expect(r.go, '引いた砂州を歩けない').toBe(true);
		expect(r.at, '満ちたのに砂州の上に残った（押し戻されない）').toBe(SHORE_STAND);
		expect(r.hp0 - r.hp, '押し戻されて減ったのが半ハートでない').toBe(1);
		expect(errors).toEqual([]);
	});

	test('砂州へ出てきた E は満ち潮に呑まれて沈み、倒れる（撃破に数え・入り直しても戻らない）', async ({ page }) => {
		const errors = await boot(page, 5, 3);
		const r = await page.evaluate(([helpers, patrol, bar, cyc]) => {
			const g = window.__game; const h = eval(helpers);
			const onBar = (e) => e && bar.includes(`${Math.round(e.y)},${Math.round(e.x)}`);
			// 岸の砂州の根元で待つだけ（E はいつも追う＝引くと砂州へ出てくる）
			const kills0 = g.getPlayer().kills ?? 0;
			let sinkSeen = null;
			for (let i = 0; i < cyc * 3 && g.getEnemies().length; i++) {
				const wasLow = g.getStageState().tide.low;
				const e0 = g.getEnemies()[0];
				const was = onBar(e0);
				g.step(1);
				const e = g.getEnemies()[0];
				if (e?.sinkUntil != null && sinkSeen == null) sinkSeen = { wasLow, nowLow: g.getStageState().tide.low, was, hidden: e.hidden };
			}
			const gone = g.getEnemies().length === 0;
			const kills = (g.getPlayer().kills ?? 0) - kills0;
			const defeated = g.getDefeatedEnemies('dungeon_3', '4,3');
			g.enterStage('dungeon_3', '4,3', 5, 3); g.step(2);
			return { sinkSeen, gone, kills, defeated, back: g.getEnemies().map((e) => e.id), hp: g.getState().player.hp };
		}, [HELPERS, PATROL, SANDBAR, CYCLE_TICKS]);
		expect(r.sinkSeen, 'E が満ち潮で沈まない').not.toBeNull();
		expect(r.sinkSeen.wasLow && !r.sinkSeen.nowLow, 'E が沈み始めたのが満ちた瞬間でない').toBe(true);
		expect(r.sinkSeen.was, '沈み始めた E が砂州の上に居なかった').toBe(true);
		expect(r.sinkSeen.hidden, '沈んでいる E が隠れになっていない＝攻撃が通る').toBe(true);
		expect(r.gone, '沈んだ E が残っている').toBe(true);
		expect(r.kills, '沈んだ E が撃破に数えられていない').toBe(1);
		expect(r.defeated, '沈んだ E が倒した敵の記録に無い＝入り直すと戻る').toContain(PATROL);
		expect(r.back, '入り直したら沈んだ E が戻った').toEqual([]);
		expect(errors).toEqual([]);
	});

	test('砂州の上の E をブーメランで止めておくと、止まったまま満ち潮に呑まれる', async ({ page }) => {
		const errors = await boot(page, 5, 3);
		const r = await page.evaluate(([helpers, bar, cyc]) => {
			const g = window.__game; const h = eval(helpers);
			const onBar = (e) => e && bar.includes(`${Math.round(e.y)},${Math.round(e.x)}`) && Math.abs(e.x - Math.round(e.x)) < 0.01;
			// E が砂州に乗るまで待って、東を向いて投げる
			for (let i = 0; i < cyc * 2 && !onBar(g.getEnemies()[0]); i++) g.step(1);
			const onBar0 = onBar(g.getEnemies()[0]);
			g.setHeroDir('right');
			g.useSubItem();
			let stunned = false, sunk = false;
			for (let i = 0; i < cyc * 2 && g.getEnemies().length; i++) {
				g.step(1);
				const e = g.getEnemies()[0];
				if (e?.stunned || (e?.stunUntil ?? 0) > 0) stunned = true;
				if (e?.sinkUntil != null) sunk = true;
			}
			return { onBar0, stunned, sunk, gone: g.getEnemies().length === 0 };
		}, [HELPERS, SANDBAR, CYCLE_TICKS]);
		expect(r.onBar0, '前提：E が砂州に出てこない').toBe(true);
		expect(r.stunned, '前提：ブーメランで E が止まらない').toBe(true);
		expect(r.sunk, '止まった E が満ち潮で沈まない').toBe(true);
		expect(r.gone).toBe(true);
		expect(errors).toEqual([]);
	});

	test('通し：E を潮に呑ませ、次の引きで渡って宝箱 +20、その次の引きで岸へ戻る', async ({ page }) => {
		const errors = await boot(page, 5, 3);
		const r = await page.evaluate(([helpers, chest, cyc]) => {
			const g = window.__game; const h = eval(helpers);
			for (let i = 0; i < cyc * 3 && g.getEnemies().length; i++) g.step(1);
			const enemiesLeft = g.getEnemies().length;
			const hp0 = g.getState().player.hp;
			h.until(g, (t) => t.low && !t.warn && t.msToChange >= 2400, cyc * 2);
			const cross = h.walk(g, 5, 10);
			const rupees0 = g.getState().player.rupees;
			for (let i = 0; i < 3; i++) { g.movePlayer('down'); g.step(1); }
			const opened = g.getStageState().openedChests.includes(chest);
			const gained = g.getState().player.rupees - rupees0;
			h.walk(g, 5, 9);
			h.until(g, (t) => t.low && !t.warn && t.msToChange >= 2400, cyc * 2);
			const back = h.walk(g, 5, 3);
			return { enemiesLeft, cross, opened, gained, back, hpLost: hp0 - g.getState().player.hp };
		}, [HELPERS, CHEST, CYCLE_TICKS]);
		expect(r.enemiesLeft, 'E が潮に呑まれない').toBe(0);
		expect(r.cross, '引いた間に小島へ渡れない').toBe(true);
		expect(r.opened, '宝箱が開かない').toBe(true);
		expect(r.gained, '宝箱でルピー×20 が増えていない').toBe(20);
		expect(r.back, '次の引きで岸へ戻れない').toBe(true);
		expect(r.hpLost, '引きに合わせて渡ったのに減った').toBe(0);
		expect(errors).toEqual([]);
	});
});

test.describe('D3 潮だまりの砂州 ③ 規則の対照', () => {
	test('周期で動くのは「周期のある部屋の、links に無い `=`」だけ（純関数）', () => {
		const sd = (extra) => ({ rows: 1, cols: 4, tiles: [['=', '=', '.', 'Y']], links: [{ switchId: '0,3', gateId: '0,1' }], ...extra });
		expect(tidalCellsOf(sd({ tideCycle: TIDE_CYCLE })), '鐘につながった `=` まで潮の周期で動く／動くべき `=` が抜ける').toEqual(['0,0']);
		expect(tidalCellsOf(sd({})), '周期の無い部屋の `=` が潮の周期で動く').toEqual([]);
		expect(tidalCellsOf(sd({ tideCycle: { highMs: 0, lowMs: 3000 } })), '満ちの長さ 0 の周期が有効になる').toEqual([]);
		// 位相：満ち → 引き（最後の warnMs が予告）→ 満ち
		const cyc = { highMs: 3600, lowMs: 3000, warnMs: 720 };
		expect(tidePhaseAt(cyc, 0).low, '入った瞬間が引き').toBe(false);
		expect(tidePhaseAt(cyc, 3599).low).toBe(false);
		expect(tidePhaseAt(cyc, 3600).low, '満ちの長さの後に引かない').toBe(true);
		expect(tidePhaseAt(cyc, 3600 + 3000 - 720 - 1).warn, '予告が早すぎる').toBe(false);
		expect(tidePhaseAt(cyc, 3600 + 3000 - 720).warn, '引きの最後の warnMs に予告が無い').toBe(true);
		expect(tidePhaseAt(cyc, 6600).low, '一周して満ちに戻らない').toBe(false);
	});

	test('小島の上の E は満ちても沈まない（呑まれるのは潮ゲートの上だけ）', async ({ page }) => {
		const errors = await boot(page, 4, 1);
		const r = await page.evaluate(([helpers, island, cyc, patrol]) => {
			const g = window.__game; const h = eval(helpers);
			// E を持ち場に立たせる（歩かない）＝小島の上に居続けたまま2周待つ
			g.setEnemyFieldForTest(patrol, { holdPost: true });
			let sunk = false, offIsland = false;
			for (let i = 0; i < cyc * 2; i++) {
				g.step(1);
				const e = g.getEnemies()[0];
				if (!e) break;
				if (e.sinkUntil != null) sunk = true;
				const cells = [`${Math.floor(e.y)},${Math.floor(e.x)}`, `${Math.ceil(e.y)},${Math.ceil(e.x)}`];
				if (!cells.every((k) => island.includes(k))) offIsland = true;
			}
			return { sunk, offIsland, alive: g.getEnemies().length };
		}, [HELPERS, ISLAND, CYCLE_TICKS, PATROL]);
		expect(r.offIsland, '前提：持ち場の E が小島から出た').toBe(false);
		expect(r.sunk, '小島の上の E が満ち潮で沈んだ').toBe(false);
		expect(r.alive).toBe(1);
		expect(errors).toEqual([]);
	});

	test('すり抜け（デバッグ）中は押し戻さない', async ({ page }) => {
		const errors = await boot(page, 5, 3, { debug: true });
		const r = await page.evaluate(([helpers]) => {
			const g = window.__game; const h = eval(helpers);
			h.until(g, (t) => t.low && !t.warn);
			h.walk(g, 5, 6);
			h.until(g, (t) => !t.low);
			g.step(1);
			const p = g.getState().player;
			return { at: `${p.y},${p.x}` };
		}, [HELPERS]);
		expect(r.at, 'すり抜け中なのに押し戻された').toBe('5,6');
		expect(errors).toEqual([]);
	});

	test('周期の無い部屋の潮ゲート（D3 3,0＝ボタンの潮）は時間で動かない', async ({ page }) => {
		const errors = await boot(page, 8, 5, { stage: '3,0', enemies: 0 });
		const r = await page.evaluate((cyc) => {
			const g = window.__game;
			const before = g.getStageState().openGates.slice().sort();
			g.step(cyc * 2);
			return { tide: g.getStageState().tide, before, after: g.getStageState().openGates.slice().sort() };
		}, CYCLE_TICKS);
		expect(r.tide, '周期の無い部屋に潮の状態が立った').toBeNull();
		expect(r.after, '周期の無い部屋の門が時間で動いた').toEqual(r.before);
		expect(errors).toEqual([]);
	});
});
