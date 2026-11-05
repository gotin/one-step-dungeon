// tests/d8-slumber-weight.spec.js
// dungeon_8 `1,4`「眠る重しの泥橋」と、眠っている重しの敵もボタンを押し続ける規則の番人
// （2026-11-01 / PLAN 実行キュー 93 の8室目・盤面は `scripts/migrate-d8-1-4-slumber-weight.mjs`・
//   エンジンは game/player.js syncEnemyButtons〈眠っている重しの敵＝`_slumberUntil` も数える〉・
//   眠りは enemy-ai.js slumberEnemies・閉じ込め防止は player.js closingGatesTrapsPlayer）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   東の口だけの行き止まりの真ん中に宝箱 B(4,5)＝回復薬（小）が置いてあるだけ・敵なし。
//
// 新しい盤面（'~'＝bgTiles の水）:
//      3 #...~~~~...#   ← 西の小島（行3〜7×列1〜3・泥）
//      5 #B..TΓS~....   ← 宝箱 B(5,1)・門 T(5,4)・間 (5,5)＝ヒル Γ の家・ボタン S(5,6)・堀 (5,7)
//      8 #~~~~~~~...#   ← 広間＝列8〜10（東の口から歩けるのはここだけ）
//
// 守るものは3つ。
//   ① データ：盤面・宝箱と中身・ボタンと門・泥と水・笛の効き目・広間からはしごで渡れるのは堀の1枚だけ・
//      小島へは門だけ・ボタンと門の間に1マス・ヒルの足・enemyChase と enemiesRespawn・脅威度・宣言・層の接続。
//   ② 重し（実機）：入るとヒルがボタンへ這って門が開く／広間のどこに立ってもヒルはボタンから降りない／
//      笛で眠らせてもボタンは押されたまま（規則）／通し＝眠ったヒルの上をはしごで渡り、門は一度も閉じずに宝箱。
//   ③ 対照と詰み防止（実機）：笛なしでは堀を渡れない（ヒルが着地を塞ぐ）／倒すと門が閉じる／自分で踏んでも
//      間へ出ると閉じる（門をくぐれない）／小島にいる間にヒルが起きて降りても門は閉じず、抜けると閉じる／
//      小島側（4か所）で起きたヒルを倒しても門は閉じず戻れる／倒して出入りするとヒルが戻る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop, expectLoopFrozen } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { startsAlert } from '../shared/enemy-alert.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { reach } from '../scripts/migrate-d8-0-2-leech-paddy.mjs';
import {
	LAYER, ROOM, TARGET, LEECH, BUTTON, GATE, MOAT, SHORE, CHEST, CHEST_CONTENT, FLUTE_EFFECT, ISLAND, HALL, OPENING, MUD,
} from '../scripts/migrate-d8-1-4-slumber-weight.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const parse = (k) => k.split(',').map(Number);
// 配っているマップで測る＝TARGET で測るとマップを壊しても緑のまま。水は bgTiles∴'~' として重ねる
const grid = room.tiles.map((row, r) => [...rowStr(row)].map((ch, c) => (room.bgTiles?.[`${r},${c}`] === TILE.WATER ? TILE.WATER : ch)));
const at = (k) => { const [r, c] = parse(k); return grid[r][c]; };

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D8 眠る重しの泥橋 ① データ', () => {
	test('盤面・宝箱（回復薬（小））・ボタンと門・泥と水・笛の効き目・いつも追う・入り直すと戻る', () => {
		expect(grid.map((r) => r.join('')), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		const flat = grid.flat();
		expect(room.chestContents, '宝箱の中身が違う').toEqual({ [CHEST]: CHEST_CONTENT });
		expect(at(CHEST), '宝箱が小島の西の端に無い').toBe(TILE.CHEST);
		expect(flat.filter((ch) => ch === TILE.BUTTON).length * 10 + flat.filter((ch) => ch === TILE.GATE).length, 'ボタン1・門1でない').toBe(11);
		expect([at(BUTTON), at(GATE)], 'ボタンか門の位置が違う').toEqual([TILE.BUTTON, TILE.GATE]);
		expect(flat.includes(TILE.STONE), '石がある＝ヒル以外の重しができる').toBe(false);
		expect(MUD.every((k) => room.bgTiles?.[k] === TILE.MUD), '小島と泥橋が泥でない').toBe(true);
		expect(rowStr(room.tiles.flat()).includes(TILE.WATER), 'tiles 層に水がある（水は bgTiles だけ）').toBe(false);
		expect(room.fluteEffect, '笛の効き目が違う（眠らせられない）').toEqual(FLUTE_EFFECT);
		expect(startsAlert(room, LEECH, TILE.POISON_LEECH), 'ヒルが「いつも追う」でない＝ボタンへ這って行かない').toBe(true);
		expect(room.enemiesRespawn, '入り直してもヒルが戻らない＝倒すと門が二度と開かない').toBe(true);
		expect(room.enemyHold ?? {}, '持ち場が付いた＝ヒルがボタンへ這って行かない').toEqual({});
		expect(room.showConditions ?? {}, '出現条件が付いた').toEqual({});
	});

	test('広間からは堀の1枚だけ渡れる・小島へは門だけ・ボタンと門の間に1マス・ヒルはボタンで止まる', () => {
		const opens = Object.values(OPENING);
		const walk = reach(grid, opens);
		expect([...walk.keys()].sort(), '東の口から歩いて届く床が広間だけでない').toEqual([...HALL, '4,11', '5,11'].sort());
		const landings = [];
		for (const k of HALL) {
			const [r, c] = parse(k);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				if (grid[r + dr]?.[c + dc] !== TILE.WATER) continue;
				const ch = grid[r + 2 * dr]?.[c + 2 * dc];
				if (ch !== undefined && ch !== TILE.WATER && !HARD_BLOCKED.has(ch)) landings.push(`${k}→${r + 2 * dr},${c + 2 * dc}`);
			}
		}
		expect(landings, 'はしごで渡れる所が堀の1枚（岸→ボタン）でない').toEqual([`${SHORE}→${BUTTON}`]);
		expect(at(MOAT), '堀が水でない').toBe(TILE.WATER);
		const shut = grid.map((r) => [...r]);
		{ const [r, c] = parse(GATE); shut[r][c] = TILE.WALL; }
		const sealed = reach(shut, opens, { withLadder: true });
		expect(ISLAND.filter((k) => sealed.has(k)), '門のほかに小島への入り方がある').toEqual([]);
		const lad = reach(grid, opens, { withLadder: true });
		const stranded = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (!HARD_BLOCKED.has(ch) && ch !== TILE.WATER && !lad.has(`${r},${c}`)) stranded.push(`${r},${c}`); }));
		expect(stranded, '取り残された床がある').toEqual([]);
		const [br, bc] = parse(BUTTON), [gr, gc] = parse(GATE);
		expect([br - gr, bc - gc], 'ボタンと門の間が1マスでない＝ボタンを踏みながら門に掛かる').toEqual([0, 2]);
		// ヒルの足（水・壁・閉じた門を歩けない）
		const foot = (r, c) => grid[r]?.[c] !== undefined && grid[r][c] !== TILE.WATER && grid[r][c] !== TILE.GATE && !HARD_BLOCKED.has(grid[r][c]);
		const seen = new Set([LEECH]); const q = [parse(LEECH)];
		while (q.length) {
			const [r, c] = q.shift();
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const k = `${r + dr},${c + dc}`;
				if (foot(r + dr, c + dc) && !seen.has(k)) { seen.add(k); q.push([r + dr, c + dc]); }
			}
		}
		expect([...seen].sort(), '門が閉じている間にヒルが間とボタンの外へ歩ける').toEqual([LEECH, BUTTON].sort());
	});

	test('敵はヒル×1・脅威度は看板部屋より軽い・宣言あり・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.POISON_LEECH}@${LEECH}`]);
		expect(ENEMY_META[TILE.POISON_LEECH].pressesButtons, '毒沼ヒルがボタンを押せない').toBe(true);
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['2,1'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ②③ 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '10', ps_ladder: '1', ps_flute: '1',
	});
	return `${GAME}?${p.toString()}`;
}
// debug を切る（fromEditor の既定は「無敵・すり抜け」＝すり抜けたままだと水も門も敵も通れてしまう）
// 実時間ループは起動前に差し止める（freezeGameLoop）＝起動後の pause() では遅く、並列負荷が高いと
// 止める前にヒルが数 tick 這ってボタンに乗り「入った瞬間は門が閉じている」前提が崩れる（PLAN 99）。
async function boot(page, row = 4, col = 10, { patch } = {}) {
	await freezeGameLoop(page);
	if (patch) {
		await page.route('**/work/blade-of-lumia.json', async (route) => {
			const json = structuredClone(map);
			patch(json.layers[LAYER].stages[ROOM]);
			await route.fulfill({ json });
		});
	}
	await page.goto(previewUrl(row, col));
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 1);
	await expectLoopFrozen(page);
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	await page.evaluate(() => window.__game.step(2));
}
// ページ内で使う関数の文字列：勇者を (r,c) へ歩かせる（縦を先に）／ボタンと門とヒルの状態
const HELPERS = `({
	walk: (g, r, c) => { for (let i = 0; i < 80; i++) { const p = g.getState().player;
		const dy = Math.abs(p.y - r) > 0.01, dx = Math.abs(p.x - c) > 0.01; if (!dy && !dx) return true;
		g.movePlayer(dy ? (p.y < r ? 'down' : 'up') : (p.x < c ? 'right' : 'left')); g.step(1); } return false; },
	pressed: (g, b) => g.getStageState().switchStates[b] === true,
	open: (g, t) => g.getStageState().openGates.includes(t),
	leech: (g) => { const e = g.getEnemies()[0]; return e ? \`\${e.y},\${e.x}\` : null; },
	flute: (g) => { g.getPlayer().activeSubItem = 'flute'; g.useSubItem(); },
})`;
// 入ってヒルがボタンに乗るまでの tick（-1＝乗らない）
const SETTLE = `(g, h, b, n) => { for (let i = 0; i < n; i++) { g.step(1); if (h.leech(g) === b && h.pressed(g, b)) return i; } return -1; }`;
const SLUMBER_TICKS = Math.ceil(FLUTE_EFFECT.ms / 120);   // TICK_MS=120

test.describe('D8 眠る重しの泥橋 ② 重し', () => {
	test('入るとヒルが泥橋の東の端（ボタン）へ這って乗り、門が開く', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(([helpers, settle, b, t]) => {
			const g = window.__game; const h = eval(helpers);
			const closedBefore = !h.open(g, t) && !h.pressed(g, b);
			const tick = eval(settle)(g, h, b, 40);
			return { closedBefore, tick, open: h.open(g, t), hurt: g.getState().player.maxHp - g.getState().player.hp };
		}, [HELPERS, SETTLE, BUTTON, GATE]);
		expect(r.closedBefore, '前提：入った瞬間から門が開いている（ヒルが乗る前）').toBe(true);
		expect(r.tick, '40 tick 待ってもヒルがボタンに乗らない').toBeGreaterThanOrEqual(0);
		expect(r.open, 'ヒルがボタンに乗ったのに門が開かない').toBe(true);
		expect(r.hurt, '口に立っているだけで傷を受けた').toBe(0);
	});

	test('広間のどこに立っても（24 マス×25 tick）ヒルはボタンから降りない', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(([helpers, settle, b, hall]) => {
			const g = window.__game; const h = eval(helpers);
			const tick = eval(settle)(g, h, b, 40);
			const bad = [];
			for (const k of hall) {
				const [rr, cc] = k.split(',').map(Number);
				h.walk(g, rr, cc);
				for (let i = 0; i < 25; i++) { g.step(1); if (h.leech(g) !== b || !h.pressed(g, b)) bad.push(`${k}:${h.leech(g)}`); }
			}
			return { tick, bad: [...new Set(bad)].slice(0, 6), hurt: g.getState().player.maxHp - g.getState().player.hp };
		}, [HELPERS, SETTLE, BUTTON, HALL]);
		expect(r.tick, '前提：ヒルがボタンに乗らない').toBeGreaterThanOrEqual(0);
		expect(r.bad, '広間に立っている間にヒルがボタンから降りた').toEqual([]);
		expect(r.hurt, '広間に立っているだけで傷を受けた（堀を挟んでいるのに）').toBe(0);
	});

	test('笛で眠らせても（泥に沈んでも）ボタンは押されたまま＝門は開いたまま', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(([helpers, settle, b, t, ticks]) => {
			const g = window.__game; const h = eval(helpers);
			const tick = eval(settle)(g, h, b, 40);
			h.flute(g);
			const asleep = g.getEnemies()[0].slumberUntil != null && g.getEnemies()[0].hidden === true;
			let released = false;
			for (let i = 0; i < ticks - 2; i++) { g.step(1); if (!h.pressed(g, b) || !h.open(g, t)) released = true; }
			return { tick, asleep, released, stillAsleep: g.getEnemies()[0].slumberUntil != null };
		}, [HELPERS, SETTLE, BUTTON, GATE, SLUMBER_TICKS]);
		expect(r.tick, '前提：ヒルがボタンに乗らない').toBeGreaterThanOrEqual(0);
		expect(r.asleep, '前提：笛でヒルが眠らない').toBe(true);
		expect(r.released, '眠ったヒルがボタンを離した＝眠らせると門が閉じる').toBe(false);
		expect(r.stillAsleep, '前提：眠りの途中で起きた').toBe(true);
	});

	test('通し：岸で笛→はしごで眠ったヒルの上へ→間→門→小島の宝箱（門は一度も閉じない・行きは無傷）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => { if (!/resume a context/.test(e.message)) errors.push(e.message); });
		await boot(page);
		const r = await page.evaluate(([helpers, settle, b, t, chest, shore]) => {
			const g = window.__game; const h = eval(helpers);
			const tick = eval(settle)(g, h, b, 40);
			const [sr, sc] = shore.split(',').map(Number);
			h.walk(g, sr, sc);
			const hp0 = g.getState().player.hp;
			h.flute(g);
			let closed = false;
			// ⚠️ 歩いた直後（tick の前）にも測る＝movePlayer は同期でボタンを離しうる（3,1 の番人と同じ作法）
			for (let i = 0; i < 30; i++) {
				const p = g.getState().player; if (p.x <= 3.001) break;
				g.movePlayer('left'); if (!h.open(g, t)) closed = true;
				g.step(1); if (!h.open(g, t)) closed = true;
			}
			const p = g.getState().player;
			const island = `${p.y},${p.x}`;
			const hurtWay = hp0 - p.hp;
			const [cr, cc] = chest.split(',').map(Number);
			const go = h.walk(g, cr, cc + 1);
			for (let i = 0; i < 3; i++) { g.movePlayer('left'); g.step(1); }
			return { tick, closed, island, hurtWay, go, opened: g.getStageState().openedChests.includes(chest), potion: !!g.getPlayer().subItems.healPotion };
		}, [HELPERS, SETTLE, BUTTON, GATE, CHEST, SHORE]);
		expect(r.tick, '前提：ヒルがボタンに乗らない').toBeGreaterThanOrEqual(0);
		expect(r.closed, '渡る途中で門が閉じた').toBe(false);
		expect(r.island, '眠ったヒルの上を渡って小島 (5,3) まで行けない').toBe('5,3');
		expect(r.hurtWay, '行きで傷を受けた（眠っているのに）').toBe(0);
		expect(r.go, '小島の宝箱の手前まで行けない').toBe(true);
		expect(r.opened, '宝箱が開かない').toBe(true);
		expect(r.potion, '宝箱から回復薬が出ない').toBe(true);
		expect(errors).toEqual([]);
	});
});

test.describe('D8 眠る重しの泥橋 ③ 対照と詰み防止', () => {
	test('対照：笛なしでは堀を渡れない（起きているヒルが着地のボタンを塞ぐ）', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(([helpers, settle, b, shore]) => {
			const g = window.__game; const h = eval(helpers);
			const tick = eval(settle)(g, h, b, 40);
			const [sr, sc] = shore.split(',').map(Number);
			h.walk(g, sr, sc);
			for (let i = 0; i < 8; i++) { g.movePlayer('left'); g.step(1); }
			return { tick, x: g.getState().player.x, leech: h.leech(g) };
		}, [HELPERS, SETTLE, BUTTON, SHORE]);
		expect(r.tick, '前提：ヒルがボタンに乗らない').toBeGreaterThanOrEqual(0);
		expect(r.x, '起きているヒルの上へ渡れた').toBeGreaterThanOrEqual(7);
		expect(r.leech, 'ヒルがボタンから降りた').toBe(BUTTON);
	});

	test('対照：倒すと門が閉じる・自分でボタンを踏んでも間へ出ると閉じる（門をくぐれない）', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(([helpers, settle, b, t, shore]) => {
			const g = window.__game; const h = eval(helpers);
			const tick = eval(settle)(g, h, b, 40);
			g.dealDamage(g.getEnemies()[0].id, 99); g.step(3);
			const dead = g.getEnemies().length === 0;
			const openDead = h.open(g, t);
			const [sr, sc] = shore.split(',').map(Number);
			h.walk(g, sr, sc);
			for (let i = 0; i < 4; i++) { g.movePlayer('left'); g.step(1); }
			const p1 = g.getState().player; const onIt = `${p1.y},${p1.x}` === b;
			const openOn = h.open(g, t);
			for (let i = 0; i < 6; i++) { g.movePlayer('left'); g.step(1); }
			const p2 = g.getState().player;
			return { tick, dead, openDead, onIt, openOn, x: p2.x, openGap: h.open(g, t) };
		}, [HELPERS, SETTLE, BUTTON, GATE, SHORE]);
		expect(r.tick, '前提：ヒルがボタンに乗らない').toBeGreaterThanOrEqual(0);
		expect(r.dead, '前提：ヒルが倒れていない').toBe(true);
		expect(r.openDead, '重しのヒルを倒したのに門が開いたまま').toBe(false);
		expect(r.onIt, '前提：はしごでボタンへ渡れない').toBe(true);
		expect(r.openOn, '自分で踏んでも門が開かない').toBe(true);
		expect(r.openGap, 'ボタンを降りて間へ出たのに門が開いたまま').toBe(false);
		expect(r.x, '自分で踏んだだけで門をくぐれた').toBeGreaterThanOrEqual(5);
	});

	test('小島にいる間にヒルが起きてボタンを降りても門は閉じず、勇者が抜けると閉じる', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(([helpers, settle, b, t, shore, ticks]) => {
			const g = window.__game; const h = eval(helpers);
			eval(settle)(g, h, b, 40);
			const [sr, sc] = shore.split(',').map(Number);
			h.walk(g, sr, sc);
			h.flute(g);
			for (let i = 0; i < 30; i++) { const p = g.getState().player; if (p.x <= 2.001) break; g.movePlayer('left'); g.step(1); }
			h.walk(g, 3, 1);   // 小島の北西の隅でヒルが起きるのを待つ
			let off = false, closedInside = false;
			for (let i = 0; i < ticks + 30; i++) { g.step(1); if (h.leech(g) !== b) off = true; if (off && !h.open(g, t)) closedInside = true; }
			// ヒルを倒して（小島へ来ていれば）出る
			const e = g.getEnemies()[0]; if (e) { g.dealDamage(e.id, 99); g.step(3); }
			const out = h.walk(g, 3, 3) && h.walk(g, 5, 3) && h.walk(g, 5, 8);   // 宝箱 (5,1) を避けて東の列から下りる
			g.step(2);
			return { off, closedInside, out, x: g.getState().player.x, openAfter: h.open(g, t) };
		}, [HELPERS, SETTLE, BUTTON, GATE, SHORE, SLUMBER_TICKS]);
		expect(r.off, '前提：起きたヒルがボタンを降りない').toBe(true);
		expect(r.closedInside, '小島にいるのに門が閉じた＝閉じ込められる').toBe(false);
		expect(r.out, `小島から広間へ戻れない（x=${r.x}）`).toBe(true);
		expect(r.openAfter, '抜けた後も門が開いたまま（重しが無いのに）').toBe(false);
	});

	// 誤って小島側でヒルを倒しても詰まない。倒す位置は、小島の奥・門の手前・門の上（半分重なる）・北側の4通り。
	// 小島からの出口は門だけ＝この部屋の形だけなら、倒した瞬間に閉じ込められる。守っているのは
	// エンジン共通の closingGatesTrapsPlayer（閉じると出口へ行けない間はボタンを離さない）。
	for (const [label, kr, kc] of [['小島の奥', 5, 2], ['門の手前', 5, 3], ['門の上', 5, 4], ['北側', 3, 2]]) {
		test(`小島側（${label} ${kr},${kc}）で起きたヒルを倒しても門は閉じず、広間へ戻れて、抜けると閉じる`, async ({ page }) => {
			await boot(page);
			const r = await page.evaluate(([helpers, settle, b, t, shore, ticks, kr, kc]) => {
				const g = window.__game; const h = eval(helpers);
				eval(settle)(g, h, b, 40);
				const [sr, sc] = shore.split(',').map(Number);
				h.walk(g, sr, sc);
				h.flute(g);
				for (let i = 0; i < 30; i++) { const p = g.getState().player; if (p.x <= 3.001) break; g.movePlayer('left'); g.step(1); }
				h.walk(g, kr, kc);
				for (let i = 0; i < ticks + 30; i++) g.step(1);   // 起きて勇者を追ってくるまで待つ
				const e = g.getEnemies()[0];
				const awakeOff = !!e && h.leech(g) !== b;
				if (e) g.dealDamage(e.id, 99);
				let closedInside = false;
				for (let i = 0; i < 10; i++) { g.step(1); if (!h.open(g, t)) closedInside = true; }
				const dead = g.getEnemies().length === 0;
				const out = h.walk(g, 5, 3) && h.walk(g, 5, 8);
				g.step(2);
				return { awakeOff, dead, closedInside, out, x: g.getState().player.x, openAfter: h.open(g, t) };
			}, [HELPERS, SETTLE, BUTTON, GATE, SHORE, SLUMBER_TICKS, kr, kc]);
			expect(r.awakeOff, '前提：起きたヒルがボタンを降りて小島側へ来ていない').toBe(true);
			expect(r.dead, '前提：ヒルが倒れていない').toBe(true);
			expect(r.closedInside, '小島側で倒した直後に門が閉じた＝閉じ込められる').toBe(false);
			expect(r.out, `小島から広間へ戻れない（x=${r.x}）`).toBe(true);
			expect(r.openAfter, '抜けた後も門が開いたまま（重しが無いのに）').toBe(false);
		});
	}

	test('ヒルを倒して部屋を出入りするとヒルが戻り、またボタンに乗る', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(([helpers, settle, b]) => {
			const g = window.__game; const h = eval(helpers);
			eval(settle)(g, h, b, 40);
			g.dealDamage(g.getEnemies()[0].id, 99); g.step(4);
			const dead = g.getEnemies().length === 0;
			g.enterStage('dungeon_8', '2,4', 4, 1); g.step(2);
			g.enterStage('dungeon_8', '1,4', 4, 10); g.step(2);
			const back = g.getEnemies().length;
			return { dead, back, tick: eval(settle)(g, h, b, 40) };
		}, [HELPERS, SETTLE, BUTTON]);
		expect(r.dead, '前提：ヒルが倒れていない').toBe(true);
		expect(r.back, '入り直してもヒルが戻らない＝重しが二度と無い').toBe(1);
		expect(r.tick, '戻ったヒルがボタンに乗らない').toBeGreaterThanOrEqual(0);
	});
});
