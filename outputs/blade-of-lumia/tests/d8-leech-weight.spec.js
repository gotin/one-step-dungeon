// tests/d8-leech-weight.spec.js
// dungeon_8 `3,1`「ヒルの重し」と、敵がボタンを押す機構（ENEMY_META.pressesButtons）の番人
// （2026-10-27 / PLAN 実行キュー 93 の5室目・盤面は `scripts/migrate-d8-3-1-leech-weight.mjs`・
//   エンジンは game/player.js syncEnemyButtons〈gameTick が enemyTick の後に呼ぶ〉・
//   閉じ込め防止は同 closingGatesTrapsPlayer・入り直しの再出現は game.js enterStage の stage.enemiesRespawn）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   4つの口が開いた十字路の床にコンパス n(3,5) が落ちているだけ・敵なし。
//
// 新しい盤面（'~'＝bgTiles の水）:
//      1 #..##......#   ← 北西の隅 (1,1)(1,2)(2,1)＝ヒルを呼ぶ立ち位置
//      2 #.~S.~...~~#   ← ボタン S(2,3)＝泥溝の西の袋（北は壁・西と南は水）
//      3 #..~Γ~...~~#   ← 毒沼ヒル Γ(3,4)＝泥溝 (2,4)(3,4) から出られない
//      6 #T#........#   ← 門 T(6,1)＝ボタンが押されている間だけ開く
//      8 #n#.....~~.#   ← コンパス n(8,1)＝門の奥
//
// 守るものは3つ。
//   ① データ：盤面・ボタンと門とコンパス・ヒルの泥溝は閉じている・コンパスへは門だけ・十字路は塞がない・
//      enemyChase と enemiesRespawn・押せる敵は Γ だけ・脅威度・宣言・層の接続。
//   ② 重し（実機）：隅で待つとヒルがボタンへ這い込み門が開く／西の列を下りれば押したまま門をくぐってコンパス／
//      東へ出るとヒルが降りて門が閉じる／口で待ってもヒルはボタンへ乗らない／対照＝押せない敵にすると開かない／
//      自分で踏めば開き、降りれば閉じる。
//   ③ 詰み防止（実機）：門の奥でヒルが倒れても、勇者が出てくるまで門は閉じない（門のセルに半分重なっている間も）／
//      門の奥で部屋に入り直しても（ヒルは溝に戻る）閉じ込められない／倒して出入りするとヒルが戻る・対照＝
//      enemiesRespawn を外すと戻らない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { startsAlert } from '../shared/enemy-alert.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { reach } from '../scripts/migrate-d8-0-2-leech-paddy.mjs';
import {
	LAYER, ROOM, TARGET, BUTTON, GATE, COMPASS, LEECH, TROUGH, VAULT, CALL_SPOTS, WEST_ROUTE, OPENING, MUD,
} from '../scripts/migrate-d8-3-1-leech-weight.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const parse = (k) => k.split(',').map(Number);
// 配っているマップで測る＝TARGET で測るとマップを壊しても緑のまま。水は bgTiles∴'~' として重ねる
const grid = room.tiles.map((row, r) => [...rowStr(row)].map((ch, c) => (room.bgTiles?.[`${r},${c}`] === TILE.WATER ? TILE.WATER : ch)));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D8 ヒルの重し ① データ', () => {
	test('盤面・ボタンと門とコンパス・泥と水・いつも追う・入り直すと戻る', () => {
		expect(grid.map((r) => r.join('')), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		const flat = grid.flat();
		expect(flat.filter((ch) => ch === TILE.ITEM_COMPASS).length, 'コンパスが1つでない').toBe(1);
		expect(grid[parse(COMPASS)[0]][parse(COMPASS)[1]], 'コンパスが門の奥に無い').toBe(TILE.ITEM_COMPASS);
		expect(grid[parse(BUTTON)[0]][parse(BUTTON)[1]], 'ボタンが袋の先に無い').toBe(TILE.BUTTON);
		expect(grid[parse(GATE)[0]][parse(GATE)[1]], '門が無い').toBe(TILE.GATE);
		expect(flat.filter((ch) => ch === TILE.BUTTON).length * 10 + flat.filter((ch) => ch === TILE.GATE).length, 'ボタン1・門1でない').toBe(11);
		expect(flat.includes(TILE.STONE), '石がある＝ヒル以外の重しができる').toBe(false);
		expect(MUD.every((k) => room.bgTiles?.[k] === TILE.MUD), '泥溝とボタンの下が泥でない').toBe(true);
		expect(rowStr(room.tiles.flat()).includes(TILE.WATER), 'tiles 層に水がある（水は bgTiles だけ）').toBe(false);
		expect(startsAlert(room, LEECH, TILE.POISON_LEECH), 'ヒルが「いつも追う」でない＝さまよって勝手にボタンへ乗る').toBe(true);
		expect(room.enemiesRespawn, '入り直してもヒルが戻らない＝倒すと門が二度と開かない').toBe(true);
		expect(room.showConditions ?? {}, '出現条件が付いた').toEqual({});
		expect(room.fluteEffect, '笛の効き目が付いた').toBeUndefined();
	});

	test('ヒルの泥溝は閉じている・コンパスへは門だけ・十字路は塞がない・ボタンへははしごだけ', () => {
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
		expect([...seen].sort(), 'ヒルが泥溝の外へ歩ける').toEqual([...TROUGH, BUTTON].sort());
		const [br, bc] = parse(BUTTON);
		expect([grid[br - 1][bc], grid[br][bc - 1], grid[br + 1][bc]], 'ボタンの袋の北・西・南が壁・水・水でない＝袋の中でヒルが動く')
			.toEqual([TILE.WALL, TILE.WATER, TILE.WATER]);

		const opens = Object.values(OPENING);
		const shut = grid.map((r) => [...r]);
		{ const [r, c] = parse(GATE); shut[r][c] = TILE.WALL; }
		const pairs = [];
		for (const [a, ka] of Object.entries(OPENING)) {
			const f = reach(shut, [ka]);
			for (const [b, kb] of Object.entries(OPENING)) if (a !== b && !f.has(kb)) pairs.push(`${a}→${b}`);
		}
		expect(pairs, '門か水に塞がれて抜けられない口の組がある（十字路の通り道を塞いだ）').toEqual([]);
		const sealed = reach(shut, opens, { withLadder: true });
		expect(VAULT.filter((k) => sealed.has(k)), '門のほかにコンパスへの入り方がある').toEqual([]);
		const walk = reach(shut, opens);
		expect([...CALL_SPOTS, ...WEST_ROUTE].filter((k) => !walk.has(k)), '呼ぶ隅か西の列へ歩いて行けない').toEqual([]);
		expect(walk.has(BUTTON), 'ボタンへ歩いて行ける＝袋が開いている').toBe(false);
		expect(sealed.get(BUTTON), 'はしごでボタンへ渡れない（水1枚で）').toBe(1);
		const lad = reach(grid, opens, { withLadder: true });
		const stranded = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (!HARD_BLOCKED.has(ch) && ch !== TILE.WATER && !lad.has(`${r},${c}`)) stranded.push(`${r},${c}`); }));
		expect(stranded, '取り残された床がある').toEqual([]);
	});

	test('敵はヒル×1・押せる敵は毒沼ヒルだけ・脅威度は看板部屋より軽い・宣言あり・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.POISON_LEECH}@${LEECH}`]);
		expect(Object.entries(ENEMY_META).filter(([, m]) => m.pressesButtons).map(([k]) => k),
			'毒沼ヒルのほかにボタンを押せる敵がいる＝既存の石の部屋を敵が勝手に崩す').toEqual([TILE.POISON_LEECH]);
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
		ps_weapon: '1', ps_hearts: '10', ps_ladder: '1', ps_bomb: '1', ps_bow: '1',
	});
	return `${GAME}?${p.toString()}`;
}
// debug を切る（fromEditor の既定は「無敵・すり抜け」＝すり抜けたままだと水も門も通れてしまう）
async function boot(page, row = 4, col = 1, { patch } = {}) {
	if (patch) {
		// 対照：部屋のデータだけを書き換えたマップを配る（ディスクのマップの複製＝route.fetch はしない）
		await page.route('**/work/blade-of-lumia.json', async (route) => {
			const json = structuredClone(map);
			patch(json.layers[LAYER].stages[ROOM]);
			await route.fulfill({ json });
		});
	}
	await page.goto(previewUrl(row, col));
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 1);
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	await page.evaluate(() => window.__game.step(2));
}
// ページ内で使う関数の文字列：勇者を (r,c) へ歩かせる（h＝横を先に）／ボタンと門の状態
const HELPERS = `({
	walk: (g, r, c, h) => { for (let i = 0; i < 80; i++) { const p = g.getState().player;
		const dy = Math.abs(p.y - r) > 0.01, dx = Math.abs(p.x - c) > 0.01; if (!dy && !dx) return true;
		const vert = h ? !dx : dy; g.movePlayer(vert ? (p.y < r ? 'down' : 'up') : (p.x < c ? 'right' : 'left')); g.step(1); } return false; },
	pressed: (g, b) => g.getStageState().switchStates[b] === true,
	open: (g, t) => g.getStageState().openGates.includes(t),
})`;
// 隅 (2,1) で待ち、ボタンが押されるまでの tick（-1＝押されない）
const CALL = `(g, h, b, n) => { h.walk(g, 2, 1); for (let i = 0; i < n; i++) { g.step(1); if (h.pressed(g, b)) return i; } return -1; }`;

test.describe('D8 ヒルの重し ② 重し', () => {
	test('北西の隅で待つとヒルが袋へ這い込みボタンを押す＝門が開く', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(([helpers, call, b, t]) => {
			const g = window.__game; const h = eval(helpers);
			const closedBefore = !h.open(g, t);
			const at = eval(call)(g, h, b, 60);
			const e = g.getEnemies()[0];
			return { closedBefore, at, open: h.open(g, t), leech: `${e.y},${e.x}`, hurt: 20 - g.getState().player.hp };
		}, [HELPERS, CALL, BUTTON, GATE]);
		expect(r.closedBefore, '前提：入った時から門が開いている').toBe(true);
		expect(r.at, '隅で 60 tick 待ってもヒルがボタンを押さない').toBeGreaterThanOrEqual(0);
		expect(r.leech, 'ボタンを押したのがヒルでない').toBe(BUTTON);
		expect(r.open, 'ボタンが押されたのに門が開かない').toBe(true);
		expect(r.hurt, '隅で待っていて傷を受けた（水を挟んでいるのに）').toBe(0);
	});

	test('通し：隅で呼ぶ→西の列を下りて門をくぐりコンパスを拾う（その間ずっと押したまま）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => { if (!/resume a context/.test(e.message)) errors.push(e.message); });
		await boot(page);
		const r = await page.evaluate(([helpers, call, b, t, cr, cc]) => {
			const g = window.__game; const h = eval(helpers);
			const at = eval(call)(g, h, b, 60);
			let released = false;
			// 一歩ずつ確かめながら下りる。⚠️ 歩いた直後（tick の前）にも測る＝movePlayer は同期で
			// checkSwitchOff を呼ぶ∴あちらがヒルを数えずに離すと、次の tick で押し直されて tick 後だけ見ると緑になる
			// （実害＝一歩ごとに門が閉じて開き直し、ボタンの音が鳴る）。
			for (let i = 0; i < 80; i++) {
				const p = g.getState().player; if (Math.abs(p.y - cr) < 0.01) break;
				g.movePlayer('down'); if (!h.pressed(g, b)) released = true;
				g.step(1); if (!h.pressed(g, b)) released = true;
			}
			const p = g.getState().player;
			return { at, released, at2: `${p.y},${p.x}`, compass: g.getPlayer().dungeonItems?.dungeon_8?.hasCompass === true, hurt: 20 - p.hp };
		}, [HELPERS, CALL, BUTTON, GATE, ...parse(COMPASS)]);
		expect(r.at, '前提：ヒルがボタンを押さない').toBeGreaterThanOrEqual(0);
		expect(r.released, '西の列を下りる途中でヒルがボタンから降りた').toBe(false);
		expect(r.at2, '門をくぐってコンパスのマスまで歩けない').toBe(COMPASS);
		expect(r.compass, 'コンパスを拾えていない').toBe(true);
		expect(r.hurt, '無傷で解けない').toBe(0);
		expect(errors).toEqual([]);
	});

	test('袋より東へ出るとヒルが溝へ戻り、ボタンが離れて門が閉じる', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(([helpers, call, b, t]) => {
			const g = window.__game; const h = eval(helpers);
			const at = eval(call)(g, h, b, 60);
			h.walk(g, 5, 1); h.walk(g, 5, 6, true);
			let off = -1;
			for (let i = 0; i < 40 && off < 0; i++) { g.step(1); if (!h.pressed(g, b)) off = i; }
			const e = g.getEnemies()[0];
			return { at, off, open: h.open(g, t), leechOff: `${e.y},${e.x}` !== b };
		}, [HELPERS, CALL, BUTTON, GATE]);
		expect(r.at, '前提：ヒルがボタンを押さない').toBeGreaterThanOrEqual(0);
		expect(r.off, '東へ出てもボタンが押されたまま').toBeGreaterThanOrEqual(0);
		expect(r.leechOff, 'ヒルがボタンの上に残っている').toBe(true);
		expect(r.open, 'ボタンが離れたのに門が開いたまま').toBe(false);
	});

	for (const [name, rr, cc] of [['西の口', 4, 1], ['東の口', 4, 10], ['南の口', 8, 5], ['北の口', 1, 6], ['門の前', 5, 1]]) {
		test(`対照：${name} (${rr},${cc}) で 120 tick 待ってもヒルはボタンへ乗らない`, async ({ page }) => {
			await boot(page, rr, cc);
			const r = await page.evaluate(([helpers, b]) => {
				const g = window.__game; const h = eval(helpers); let ever = false;
				for (let i = 0; i < 120; i++) { g.step(1); if (h.pressed(g, b)) ever = true; }
				return ever;
			}, [HELPERS, BUTTON]);
			expect(r, `${name}で待っているだけでヒルがボタンを押した＝解かずに開く`).toBe(false);
		});
	}

	test('対照：押せない敵にすると、ヒルが袋に入ってもボタンは押されない（門は開かない）', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(([helpers, b, t]) => {
			const g = window.__game; const h = eval(helpers);
			g.setEnemyMetaForTest('Γ', { pressesButtons: false });
			h.walk(g, 2, 1); let onButton = false;
			for (let i = 0; i < 60; i++) { g.step(1); const e = g.getEnemies()[0]; if (`${e.y},${e.x}` === b) onButton = true; }
			return { onButton, pressed: h.pressed(g, b), open: h.open(g, t) };
		}, [HELPERS, BUTTON, GATE]);
		expect(r.onButton, '前提：ヒルが袋へ這い込まない').toBe(true);
		expect(r.pressed || r.open, '押せない敵でもボタンが押された＝番人に歯が無い').toBe(false);
	});

	test('自分で踏む（はしごで袋へ渡る）と門が開き、降りると閉じる', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(([helpers, b, t]) => {
			const g = window.__game; const h = eval(helpers);
			h.walk(g, 2, 1);
			for (let i = 0; i < 4; i++) { g.movePlayer('right'); g.step(1); }
			const p = g.getState().player; const onIt = `${p.y},${p.x}` === b;
			const openOn = h.open(g, t);
			for (let i = 0; i < 4; i++) { g.movePlayer('left'); g.step(1); }
			g.step(2);
			return { onIt, openOn, openOff: h.open(g, t), pressedOff: h.pressed(g, b) };
		}, [HELPERS, BUTTON, GATE]);
		expect(r.onIt, '前提：はしごでボタンへ渡れない').toBe(true);
		expect(r.openOn, '自分で踏んでも門が開かない').toBe(true);
		expect(r.openOff || r.pressedOff, '降りたのにボタンが押されたまま').toBe(false);
	});
});

test.describe('D8 ヒルの重し ③ 詰み防止', () => {
	test('門の奥でヒルが倒れても、勇者が門を抜けるまで閉じない（門のセルに重なっている間も）', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(([helpers, call, b, t, cr, cc, tr]) => {
			const g = window.__game; const h = eval(helpers);
			const at = eval(call)(g, h, b, 60);
			h.walk(g, cr, cc);
			g.dealDamage(g.getEnemies()[0].id, 99); g.step(4);
			const dead = g.getEnemies().length === 0;
			const openInside = h.open(g, t);
			const steps = [];
			for (let i = 0; i < 12; i++) {
				const p = g.getState().player; if (p.y <= tr - 1 + 0.01) break;
				g.movePlayer('up'); g.step(1);
				const q = g.getState().player; steps.push(`${q.y}:${h.open(g, t)}`);
			}
			const p = g.getState().player;
			g.step(2);
			return { at, dead, openInside, steps, out: p.y, openAfter: h.open(g, t) };
		}, [HELPERS, CALL, BUTTON, GATE, ...parse(COMPASS), parse(GATE)[0]]);
		expect(r.at, '前提：ヒルがボタンを押さない').toBeGreaterThanOrEqual(0);
		expect(r.dead, '前提：ヒルが倒れていない').toBe(true);
		expect(r.openInside, '門の奥に居るのに門が閉じた＝閉じ込められる').toBe(true);
		expect(r.out, `門を抜けて (${parse(GATE)[0] - 1}) まで戻れない（途中 ${r.steps.join(' ')}）`).toBe(parse(GATE)[0] - 1);
		expect(r.steps.filter((s) => Number(s.split(':')[0]) > parse(GATE)[0] - 1 && s.endsWith('false')),
			'門のセルに重なっている間に門が閉じた').toEqual([]);
		expect(r.openAfter, '門を抜けた後も門が開いたまま（重しが無いのに）').toBe(false);
	});

	test('門の奥で部屋に入り直しても（ヒルは溝へ戻る）閉じ込められない', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(([helpers, call, b, t, cr, cc, tr]) => {
			const g = window.__game; const h = eval(helpers);
			eval(call)(g, h, b, 60);
			h.walk(g, cr, cc);
			g.enterStage('dungeon_8', '3,1', cr, cc); g.step(4);
			const e = g.getEnemies()[0];
			const leechHome = `${e.y},${e.x}` !== b;
			const openInside = h.open(g, t);
			const ok = h.walk(g, tr - 1, cc);
			return { leechHome, openInside, ok };
		}, [HELPERS, CALL, BUTTON, GATE, ...parse(COMPASS), parse(GATE)[0]]);
		expect(r.leechHome, '前提：入り直してもヒルがボタンの上').toBe(true);
		expect(r.openInside, '門の奥で入り直したら門が閉じた＝閉じ込められる').toBe(true);
		expect(r.ok, '門の奥から出られない').toBe(true);
	});

	test('ヒルを倒して部屋を出入りするとヒルが戻る', async ({ page }) => {
		await boot(page);
		const r = await page.evaluate(() => {
			const g = window.__game;
			g.dealDamage(g.getEnemies()[0].id, 99); g.step(4);
			const dead = g.getEnemies().length === 0;
			g.enterStage('dungeon_8', '3,2', 1, 5); g.step(2);
			g.enterStage('dungeon_8', '3,1', 4, 1); g.step(2);
			return { dead, back: g.getEnemies().length };
		});
		expect(r.dead, '前提：ヒルが倒れていない').toBe(true);
		expect(r.back, '入り直してもヒルが戻らない＝重しが二度と無い').toBe(1);
	});

	test('対照：enemiesRespawn を外すと、倒したヒルは入り直しても戻らない', async ({ page }) => {
		await boot(page, 4, 1, { patch: (st) => { delete st.enemiesRespawn; } });
		const r = await page.evaluate(() => {
			const g = window.__game;
			g.dealDamage(g.getEnemies()[0].id, 99); g.step(4);
			g.enterStage('dungeon_8', '3,2', 1, 5); g.step(2);
			g.enterStage('dungeon_8', '3,1', 4, 1); g.step(2);
			return g.getEnemies().length;
		});
		expect(r, '対照で戻った＝番人に歯が無い（ダンジョンの敵が元から戻る）').toBe(0);
	});
});
