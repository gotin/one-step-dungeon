// tests/d4-lava-cross-map.spec.js
// dungeon_4 `3,2`「溶岩の十字路と地図の袋小路」の番人
// （2026-10-24 / PLAN 実行キュー 92 の2室目・盤面は `scripts/migrate-d4-3-2-lava-cross-map.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四方の口が開いた四角い広間の真ん中に地図 m が1枚落ちているだけ・敵なし＝「通るついでに拾う」。
//
// 新しい盤面:
//      1 #lmll..llll#   ← 地図 m(1,2)＝幅1・奥行き3の袋小路の奥
//      3 #l.l....lll#   ← 袋小路の口 (3,2)
//      4 ............
//      5 ...φ........   ← 火吐き亀 φ(5,3)＝西の通路を巡回し、袋小路の中まで追ってくる
//      6 #lll....lll#
//   四隅は溶岩・4つの口は幅2の通路でつながる（通り抜けは邪魔されない）。
//
// 守るものは3つ。
//   ① データ：盤面・地図1枚・4つの口が全部つながる・地図の袋小路は幅1で口は (3,2) だけ・
//      対照（口を壁）・はしごで溶岩を渡れない・敵は φ 1体（さまよう範囲に袋小路の口）・層の接続は不変。
//   ② 挙動（実機）：溶岩に踏み込めない／東西・南北に通り抜けられる／袋小路の奥で地図を拾える。
//   ③ 主題（実機）：袋小路の奥に立ち止まると、亀が口まで追ってきて炎を浴びせる（＝罰は立ち止まったときだけ。答えは「ブーメランで止めて倒す」でも「隙を見てスルー」でもよい＝2026-10-24 ユーザー判定）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META, ROAM_DEFAULT } from '../shared/enemies.js';
import { bfsLayer, LADDER_OVER } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, TARGET, MAP_CELL, NOOK, NOOK_MOUTH, TURTLE, OPENINGS, reach,
} from '../scripts/migrate-d4-3-2-lava-cross-map.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));
const nbrs = (k) => { const [r, c] = k.split(',').map(Number); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D4 溶岩の十字路 ① データ', () => {
	test('盤面・地図1枚・宝箱や床のアイテムは無い', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(grid.flat().filter((ch) => ch === TILE.ITEM_DUNGEON_MAP).length, '地図が1枚でない').toBe(1);
		expect(grid[1][2], `地図が ${MAP_CELL} に無い`).toBe(TILE.ITEM_DUNGEON_MAP);
		expect(grid.flat().includes(TILE.CHEST), '宝箱がある').toBe(false);
		expect(Object.keys(room.floorItems ?? {})).toEqual([]);
		expect(Object.keys(room.showConditions ?? {})).toEqual([]);
	});

	test('4つの口はどの組でも溶岩を渡らずにつながる（辻の通り抜けを塞がない）', () => {
		const all = Object.values(OPENINGS).flat();
		for (const [name, cells] of Object.entries(OPENINGS)) {
			const r = reach(grid, cells);
			expect(all.filter((k) => !r.has(k)), `${name} の口から届かない口がある`).toEqual([]);
		}
	});

	test('地図の袋小路は幅1・口は (3,2) だけ／対照：口を壁にすると地図に届かない', () => {
		const walk = reach(grid, OPENINGS.west);
		expect(walk.has(MAP_CELL), '地図に届かない').toBe(true);
		for (const k of NOOK.slice(1)) {
			const side = nbrs(k).filter((n) => walk.has(n) && !NOOK.includes(n));
			expect(side, `袋小路 ${k} の横に立てる床がある（幅1でない）`).toEqual([]);
		}
		expect(nbrs(NOOK_MOUTH).filter((n) => walk.has(n)).sort()).toEqual(['2,2', '4,2']);
		const walled = grid.map((row, r) => row.map((x, c) => (`${r},${c}` === NOOK_MOUTH ? TILE.WALL : x)));
		expect(reach(walled, OPENINGS.west).has(MAP_CELL), '対照：口を壁にしても地図に届く＝測定が空虚').toBe(false);
	});

	test('敵は火吐き亀 1体（さまよう範囲に袋小路の口）・脅威度は看板より軽い・はしごで溶岩を渡れない・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.FIRE_TURTLE}@${TURTLE}`]);
		const [tr, tc] = TURTLE.split(',').map(Number);
		const [mr, mc] = NOOK_MOUTH.split(',').map(Number);
		const rad = ENEMY_META[TILE.FIRE_TURTLE].roam?.radius ?? ROAM_DEFAULT.radius;
		expect(Math.max(Math.abs(tr - mr), Math.abs(tc - mc)), '亀のさまよう範囲に袋小路の口が入らない').toBeLessThanOrEqual(rad);
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['2,3'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		expect(LADDER_OVER.has(TILE.LAVA), 'はしごで溶岩を渡れる').toBe(false);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ②③ 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1',
	});
	return `${GAME}?${p.toString()}`;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
async function boot(page, url, { killTurtle = true, mortal = false } = {}) {
	await page.goto(url);
	await waitForBoard(page);
	// ⚠ プレビューは debugMode:true ＝ takeDamage が早期 return する∴炎を測るときは 'g' で切る
	//   （tests/facing-block-enemies.spec.js ⑫ と同じ）。
	if (mortal) await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	if (killTurtle) {
		await page.evaluate(() => {
			for (const e of window.__game.getEnemies()) window.__game.dealDamage(e.id, 99, 'sword');
		});
	}
	await step(page, 2);
}
// movePlayer 1回＝半マス（[[blade-moveplayer-is-half-tile]]）。
async function walk(page, dir, ops) {
	for (let i = 0; i < ops; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
	}
}
const pos = (page) => page.evaluate(() => {
	const { x, y } = window.__game.getState().player;
	return `${y},${x}`;
});
const hasMap = (page) => page.evaluate((l) => window.__game.getPlayer().dungeonItems?.[l]?.hasMap === true, LAYER);

test.describe('D4 溶岩の十字路 ② 実機', () => {
	test('溶岩に踏み込めない・東西と南北に通り抜けられる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		// 西の口から東の口まで（行4）
		await boot(page, previewUrl(4, 1));
		await walk(page, 'right', 18);
		expect(await pos(page), '西→東に通り抜けられない').toBe('4,10');
		// 北の口から南の口まで（列5）
		await boot(page, previewUrl(1, 5));
		await walk(page, 'down', 14);
		expect(await pos(page), '北→南に通り抜けられない').toBe('8,5');
		// 溶岩＝通路 (4,8) から北の (3,8) へ踏み出せない
		await boot(page, previewUrl(4, 8));
		await walk(page, 'up', 4);
		expect(await pos(page), '溶岩 (3,8) へ踏み出せた').toBe('4,8');
		// 袋小路の中 (2,2) から東の溶岩 (2,3) へ踏み出せない
		await boot(page, previewUrl(2, 2));
		await walk(page, 'right', 4);
		expect(await pos(page), '溶岩 (2,3) へ踏み出せた').toBe('2,2');
		expect(errors).toEqual([]);
	});

	test('西の口から袋小路の奥へ歩いて地図を拾える', async ({ page }) => {
		await boot(page, previewUrl(4, 1));
		expect(await hasMap(page), '前提：まだ地図を持っていない').toBe(false);
		await walk(page, 'right', 2);
		await walk(page, 'up', 6);
		expect(await pos(page), '袋小路の奥へ歩いて行けない').toBe(MAP_CELL);
		expect(await hasMap(page), '地図を拾えない').toBe(true);
	});
});

test('D4 溶岩の十字路 ③ 主題：袋小路の奥で立ち止まると、亀が口まで追ってきて炎を浴びせる', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await boot(page, previewUrl(4, 1), { killTurtle: false, mortal: true });
	await walk(page, 'right', 2);
	await walk(page, 'up', 6);
	expect(await pos(page)).toBe(MAP_CELL);
	// 甲羅の周期は 1400ms 籠もり＋1000ms 開き＝2.4 秒。亀は家 (5,3) から袋小路の口まで 3 マス
	// （速さ 0.25 × MOVE_STEP 0.5 ＝ 1 tick に 0.125 マス・開いている間しか歩かない）。
	// 実測（.scratch/q92/shot-3-2.mjs）では 47 tick で初めて焼かれた∴上限 300 tick は約 6 倍の余裕
	// （体当たりが先に当たってもプレビューの 'g' で死ぬまでは続く＝hp 6 は炎か体当たり 1 回で残る）。
	// ⚠️ 亀は体当たり（meta.atk）も炎（shell.breathAtk）も同じ 4 ＝減った量では見分けられない。
	//    炎の絵が出た tick に体当たりも当たることがあり、体当たりの到達（SLAM_RANGE 1.5）は
	//    半マスずれた亀からも届く＝絵や距離でも見分けられない（どれも歯の確認で「炎を消しても緑」）。
	//    ∴**炎の tick そのもの**で見る＝step の直前に亀が「籠もり（closed）・体当たりの予告なし
	//    （slamAt が null）」で、直後に「開き（open）」になった tick にプレイヤーの hp が減り、
	//    炎の絵がプレイヤーのセルに出ている（炎は開いた瞬間にだけ吐く＝tickShell）。
	//    炎の絵は実時間 420ms で消える＝step と同じ evaluate の中で読む。
	let hit = null, inNook = false, hits = 0;
	for (let i = 1; i <= 300 && hit === null; i++) {
		const s = await page.evaluate(() => {
			const g = window.__game;
			const pre = g.getEnemies()[0];
			const before = { hp: g.getState().player.hp, phase: pre?.shellPhase ?? null, slamAt: pre?.slamAt ?? null };
			g.step(1);
			const cellPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
			const fires = [...document.querySelectorAll('.enemy-fire-breath')]
				.map((el) => `${Math.round(parseFloat(el.style.top) / cellPx)},${Math.round(parseFloat(el.style.left) / cellPx)}`);
			const post = g.getEnemies()[0];
			return { before, hp: g.getState().player.hp, fires, phase: post?.shellPhase ?? null, e: post ? [post.y, post.x] : null };
		});
		if (s.e && Math.round(s.e[1]) === 2 && Math.round(s.e[0]) <= 3) inNook = true;
		if (s.hp < s.before.hp) {
			hits++;
			const breathTick = s.before.phase === 'closed' && s.before.slamAt == null && s.phase === 'open';
			if (breathTick && s.fires.includes(MAP_CELL)) hit = { tick: i, loss: s.before.hp - s.hp };
		}
	}
	expect(inNook, '亀が袋小路の口まで追ってこない').toBe(true);
	expect(hit, `袋小路の奥で炎に焼かれない（被弾 ${hits} 回はどれも体当たり）＝炎が奥まで届いていない`).not.toBeNull();
	expect(hit.loss, '浴びた打点が亀の炎と違う').toBe(ENEMY_META[TILE.FIRE_TURTLE].shell.breathAtk);
	expect(errors).toEqual([]);
});
