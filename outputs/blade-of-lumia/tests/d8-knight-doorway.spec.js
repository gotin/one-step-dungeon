// tests/d8-knight-doorway.spec.js
// dungeon_8 `3,2`「戸口の盾騎士」と敵の持ち場 `enemyHold` の番人
// （2026-10-26 / PLAN 実行キュー 93 の3室目・盤面は `scripts/migrate-d8-3-2-knight-doorway.mjs`・
//   エンジンは shared/enemy-alert.js holdsPost → game.js buildEnemies `holdPost` → enemy-ai.js enemyTick の歩きの分岐）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   4つの口が開いた十字路の床に地図 m(3,5) が落ちているだけ・敵なし。
//
// 新しい盤面:
//      1 #......#.m.#   ← 地図の間（北東・中は 2×3）の奥に地図 (1,9)
//      2 #......#...#
//      3 #......##ζ##   ← 戸口 (3,9)＝幅1。盾騎士が持ち場を動かず、南を向いて構える
//      4 ............
//      5 ............   ← (5,9)＝剣は届かず、爆弾の爆風は届く
//   正面は剣も矢もブーメランも弾く。爆風には向きが無い＝爆弾1発（20 ＞ hp 18）。斜め下に立つと横を向く。
//
// 守るものは3つ。
//   ① データ：盤面・地図・持ち場・向き・地図の間へは戸口だけ・十字路は騎士の前を通らずに歩ける・敵と脅威度・宣言・層の接続。
//   ② 持ち場（実機）：騎士は戸口から動かない（勇者が近くに居ても）／対照＝持ち場を外すと戸口から出てくる。
//   ③ 主題（実機）：正面で斬ると弾かれて傷を受け、騎士の HP は減らない／2 マス離れて置いた爆弾1発で倒れ、
//      無傷で地図を拾える／斜め下に立つと横を向く＝真下へ入って斬ると通る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { holdsPost } from '../shared/enemy-alert.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { reach } from '../scripts/migrate-d8-0-2-leech-paddy.mjs';
import {
	LAYER, ROOM, TARGET, MAP_CELL, KNIGHT, KNIGHT_DIR, FRONT, BOMB_SPOT, FLANKS, VAULT, OPENING,
} from '../scripts/migrate-d8-3-2-knight-doorway.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
// 配っているマップの盤面で測る＝TARGET で測るとマップを壊しても緑のまま
const grid = room.tiles.map((row) => [...rowStr(row)]);
const parse = (k) => k.split(',').map(Number);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D8 戸口の盾騎士 ① データ', () => {
	test('盤面・地図・騎士の持ち場と向き', () => {
		expect(grid.map((r) => r.join('')), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(grid.flat().filter((ch) => ch === TILE.ITEM_DUNGEON_MAP).length, '地図が1つでない').toBe(1);
		const [mr, mc] = parse(MAP_CELL);
		expect(grid[mr][mc], '地図が地図の間の奥に無い').toBe(TILE.ITEM_DUNGEON_MAP);
		expect(room.enemyDirs, '騎士の向きが違う').toEqual({ [KNIGHT]: KNIGHT_DIR });
		expect(room.enemyHold, '持ち場の指定が違う').toEqual({ [KNIGHT]: true });
		expect(holdsPost(room, KNIGHT, TILE.SHIELD_KNIGHT), 'holdsPost が持ち場と読まない').toBe(true);
		expect(Object.keys(room.bgTiles ?? {}), '下地（水・泥）が残っている').toEqual([]);
		expect(room.floorItems ?? {}, '床の拾い物の記述が残っている').toEqual({});
		expect(room.showConditions ?? {}, '出現条件が付いた').toEqual({});
	});

	test('地図の間へは戸口だけ・戸口の両脇は壁・十字路は騎士の前を通らずに歩ける', () => {
		const opens = Object.values(OPENING);
		const lad = reach(grid, opens, { withLadder: true });
		expect(VAULT.filter((k) => !lad.has(k)), '地図の間に届かないマスがある').toEqual([]);
		const sealed = grid.map((r) => [...r]);
		{ const [r, c] = parse(KNIGHT); sealed[r][c] = TILE.WALL; }
		const s = reach(sealed, opens, { withLadder: true });
		expect(VAULT.filter((k) => s.has(k)), '戸口のほかに地図の間への入り方がある（騎士を避けて入れる）').toEqual([]);
		const [kr, kc] = parse(KNIGHT);
		expect([grid[kr][kc - 1], grid[kr][kc + 1]], '戸口の両脇が壁でない＝騎士の横へ回れる').toEqual([TILE.WALL, TILE.WALL]);
		const avoid = grid.map((r) => [...r]);
		for (const k of [FRONT, ...FLANKS, KNIGHT]) { const [r, c] = parse(k); avoid[r][c] = TILE.WALL; }
		const pairs = [];
		for (const [a, ka] of Object.entries(OPENING)) {
			const f = reach(avoid, [ka]);
			for (const [b, kb] of Object.entries(OPENING)) if (a !== b && !f.has(kb)) pairs.push(`${a}→${b}`);
		}
		expect(pairs, '騎士の前を通らないと抜けられない口の組がある（十字路の通り道を塞いだ）').toEqual([]);
		const stranded = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (!HARD_BLOCKED.has(ch) && !lad.has(`${r},${c}`)) stranded.push(`${r},${c}`); }));
		expect(stranded, '取り残された床がある').toEqual([]);
	});

	test('敵は盾騎士×1・脅威度は看板部屋より軽い・宣言あり・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.SHIELD_KNIGHT}@${KNIGHT}`]);
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
// debug を切る（fromEditor の既定は「無敵・すり抜け」＝すり抜けたままだと騎士の正面も通れてしまう）
async function boot(page, row, col, { noHold = false } = {}) {
	if (noHold) {
		// 対照：持ち場の指定だけを外したマップを配る（ディスクのマップの複製＝route.fetch はしない）
		await page.route('**/work/blade-of-lumia.json', async (route) => {
			const json = structuredClone(map);
			delete json.layers[LAYER].stages[ROOM].enemyHold;
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
// 勇者を (r,c) へ歩かせる（h＝横を先に）。ページ内で使う関数の文字列
const WALK = `(g, r, c, h) => { for (let i = 0; i < 80; i++) { const p = g.getState().player;
	const dy = Math.abs(p.y - r) > 0.01, dx = Math.abs(p.x - c) > 0.01; if (!dy && !dx) return true;
	const vert = h ? !dx : dy; g.movePlayer(vert ? (p.y < r ? 'down' : 'up') : (p.x < c ? 'right' : 'left')); g.step(1); } return false; }`;

test.describe('D8 戸口の盾騎士 ② 持ち場', () => {
	test('騎士は戸口から動かない（勇者が戸口の前・斜め・遠くに居ても 120 tick ずっと (3,9)）', async ({ page }) => {
		await boot(page, 8, 5);
		const r = await page.evaluate(([walkSrc, knight]) => {
			const g = window.__game; const walk = eval(walkSrc); const seen = new Set();
			const watch = (n) => { for (let i = 0; i < n; i++) { g.step(1); const e = g.getEnemies()[0]; seen.add(`${e.y},${e.x}`); } };
			walk(g, 5, 9, true); watch(40);
			walk(g, 4, 10, true); watch(40);
			walk(g, 6, 2, false); watch(40);
			return { seen: [...seen], knight };
		}, [WALK, KNIGHT]);
		expect(r.seen, '騎士が持ち場を離れた').toEqual([r.knight]);
	});

	test('対照：持ち場を外すと、近くに立った勇者の前で戸口から動き出す', async ({ page }) => {
		await boot(page, 8, 5, { noHold: true });
		// ⚠️ 判定は「(3,9) 以外の位置に居たことがある」。旧版は「戸口の外（y>3.01）へ出る」で、勇者を
		//   (6,9) に立たせていた＝持ち場を外した騎士は地図の間をさまよい（roam・気づく距離 4）、遠い北寄りの
		//   マスで気づかないまま 120 tick を過ぎることがあった（2026-11-04・キュー98）。かといって戸口の
		//   真下 (4,9) では、戸口に立ったまま剣で斬ってくる＝「出る」は起きない。動き出すこと自体が
		//   持ち場の有無の差（持ち場ありは 120 tick ずっと (3,9)＝上のテスト）なので、それを見る。
		const r = await page.evaluate(([walkSrc, fr, fc, knight]) => {
			const g = window.__game; const walk = eval(walkSrc); const seen = new Set();
			walk(g, fr, fc, true);
			for (let i = 0; i < 120; i++) { g.step(1); const e = g.getEnemies()[0]; seen.add(`${e.y},${e.x}`); }
			seen.delete(knight);
			return [...seen];
		}, [WALK, ...parse(FRONT), KNIGHT]);
		expect(r.length, '持ち場を外しても騎士が戸口から動かない＝番人に歯が無い').toBeGreaterThan(0);
	});
});

test.describe('D8 戸口の盾騎士 ③ 主題', () => {
	test('正面（戸口の真下）で斬ると弾かれて傷を受け、騎士の HP は減らない', async ({ page }) => {
		await boot(page, 8, 5);
		const r = await page.evaluate(([walkSrc, fr, fc]) => {
			const g = window.__game; const walk = eval(walkSrc);
			walk(g, fr + 1, fc, true); g.step(10);
			const hp0 = g.getState().player.hp; const ehp0 = g.getEnemies()[0].hp;
			g.movePlayer('up'); g.step(1); g.movePlayer('up'); g.step(1);
			for (let i = 0; i < 8; i++) { g.swordAttack(); g.step(3); }
			return { hurt: hp0 - g.getState().player.hp, ehp0, ehp: g.getEnemies()[0].hp, dir: g.getEnemies()[0].dir };
		}, [WALK, ...parse(FRONT)]);
		expect(r.ehp, '正面から斬って騎士に通った').toBe(r.ehp0);
		expect(r.hurt, '正面に立っていて騎士に斬られなかった').toBeGreaterThan(0);
		expect(r.dir, '前提：騎士が南（勇者の方）を向いていない').toBe('down');
	});

	test('通し：2 マス離れて爆弾を置き1発で倒す→無傷で戸口を抜けて地図を拾う', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => { if (!/resume a context/.test(e.message)) errors.push(e.message); });
		await boot(page, 8, 5);
		const r = await page.evaluate(([walkSrc, br, bc, mr, mc]) => {
			const g = window.__game; const walk = eval(walkSrc);
			const hp0 = g.getState().player.hp;
			walk(g, br, bc, true); g.step(5);
			g.getPlayer().activeSubItem = 'bomb';
			g.useSubItem();
			walk(g, br + 2, bc, false);
			let gone = -1;
			for (let i = 0; i < 60 && gone < 0; i++) { g.step(1); if (g.getEnemies().length === 0) gone = i; }
			const okIn = walk(g, mr + 3, mc, false) && walk(g, mr, mc, false);
			return { gone, okIn, map: g.getPlayer().dungeonItems?.dungeon_8?.hasMap === true, hurt: hp0 - g.getState().player.hp };
		}, [WALK, ...parse(BOMB_SPOT), ...parse(MAP_CELL)]);
		expect(r.gone, '爆弾1発で騎士が倒れない').toBeGreaterThanOrEqual(0);
		expect(r.okIn, '騎士を倒した後、戸口を抜けて地図の間へ歩けない').toBe(true);
		expect(r.map, '地図を拾えていない').toBe(true);
		expect(r.hurt, '2 マス離れて爆弾を置いたのに傷を受けた').toBe(0);
		expect(errors).toEqual([]);
	});

	test('斜め下に立つと騎士は横を向く＝真下へ入って斬ると通る（根気の答え）', async ({ page }) => {
		await boot(page, 8, 5);
		const r = await page.evaluate(([walkSrc, fr, fc, sr, sc]) => {
			const g = window.__game; const walk = eval(walkSrc);
			walk(g, sr, sc, true);
			let turned = null;
			for (let i = 0; i < 12; i++) { g.step(1); const d = g.getEnemies()[0].dir; if (d !== 'down') { turned = d; break; } }
			const ehp0 = g.getEnemies()[0].hp;
			g.movePlayer('right'); g.step(1); g.movePlayer('right'); g.step(1);
			g.setHeroDir('up');
			g.swordAttack(); g.step(2);
			const p = g.getState().player;
			return { turned, at: `${p.y},${p.x}`, ehp0, ehp: g.getEnemies()[0].hp };
		}, [WALK, ...parse(FRONT), ...parse(FLANKS[0])]);
		expect(r.turned, '斜め下に立っても騎士が横を向かない').toBe('left');
		expect(r.at, '前提：戸口の真下へ入れていない').toBe(FRONT);
		expect(r.ehp, '横を向いた騎士を真下から斬っても通らない').toBeLessThan(r.ehp0);
	});
});
