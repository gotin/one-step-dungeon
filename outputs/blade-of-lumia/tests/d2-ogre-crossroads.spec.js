// tests/d2-ogre-crossroads.spec.js
// dungeon_2 `1,2`（要の通り道）「ブーメラン鬼の十字路」の番人
// （2026-10-10 / PLAN 実行キュー 41 の第1陣 2室目・盤面は `scripts/migrate-d2-1-2-ogre-crossroads.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_1 1,2` と 6 セル差以内＝四角い広間にパトロール E×2（D1 の写し）。
//
// 新しい盤面（四隅を壁で埋めた十字の広間）:
//      1 ####....####
//      3 #..........#
//      4 .....π......   ← (4,5) ブーメラン鬼（南の入口へ向く）
//      7 ####....####
//   本筋（南の入口 → 北のブーメランの部屋）は π の行を必ず横切る。南の口から上がった (8,5) は
//   π と同じ列・距離 4＝入った瞬間に投げてくる。
//
// 守るものは2つ。
//   ① データ（幾何）：π が1体だけ・本筋は π の線を横切らずに通れない・層の到達性は書き換え前と同じ。
//   ② 挙動（実機）：入口の (8,5) で立ち止まると π が往復するブーメランを投げる／
//      盾なしで立ち止まると HP が減り、木の盾で上を向けば無傷（D1 の報酬で防げる）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { TARGET, EXITS, OGRE, OGRE_DIR, ENTRY, reach, ogreLines } from '../scripts/migrate-d2-1-2-ogre-crossroads.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_2';
const ROOM = '1,2';
const stages = map.layers[LAYER].stages;

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const inward = { north: [1, 0], south: [-1, 0], west: [0, 1], east: [0, -1] };
// cut を歩けないものとして、口 a の内側から口 b に届くか
function joined(t, a, b, cut) {
	const from = EXITS[a].find((k) => !cut.has(k));
	const [r, c] = from.split(',').map(Number);
	const seen = reach(t, `${r + inward[a][0]},${c + inward[a][1]}`, cut);
	return EXITS[b].filter((k) => !cut.has(k)).some((k) => seen.has(k));
}

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D2 1,2 ブーメラン鬼の十字路 ① データ', () => {
	test('盤面・敵は π×1・向き・脅威度・宣言・報酬なし', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		const enemies = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) enemies.push(`${ch}@${r},${c}`); }));
		expect(enemies, '敵はブーメラン鬼1体だけ').toEqual([`${TILE.BOOMERANG_OGRE}@${OGRE}`]);
		expect(st.enemyDirs).toEqual({ [OGRE]: OGRE_DIR });
		expect(stageThreat(st, ENEMY_META), '脅威度＝看板部屋 2,1（25.0）より軽い').toBe(22.5);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS の宣言').toBe(true);
		for (const k of ['chestContents', 'signData', 'floorItems', 'showConditions', 'mapEnters', 'bgTiles']) {
			expect(Object.keys(st[k] ?? {}), `${k} が空でない`).toEqual([]);
		}
	});

	test('本筋（南→北）は π の行・列を横切らずに通れない・南の入口の最初のセルは π の射線', () => {
		const t = gridOf();
		// π の位置は定数でなく盤面から引く（盤面で π が動いたら赤くなるように）
		const found = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ch === TILE.BOOMERANG_OGRE) found.push(`${r},${c}`); }));
		expect(found, 'π が盤面に1体だけ居ない').toHaveLength(1);
		const cut = ogreLines(found[0]);
		expect(joined(t, 'south', 'north', cut), 'π の線を踏まずに南から北へ抜けられる').toBe(false);
		const [er, ec] = ENTRY.split(',').map(Number), [or, oc] = found[0].split(',').map(Number);
		expect(ec, '入口の最初のセルが π と同じ列でない').toBe(oc);
		const atk = ENEMY_META[TILE.BOOMERANG_OGRE].attack;
		expect(er - or).toBeLessThanOrEqual(atk.range);
		expect(er - or).toBeGreaterThanOrEqual(atk.minRange);
	});

	test('対照：線を切らなければ南から北へ歩ける（測定が空虚でない）', () => {
		expect(joined(gridOf(), 'south', 'north', new Set())).toBe(true);
	});

	test('層の接続：dead-edge 0・徒歩で 15 室（書き換え前と同じ）', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(foot.reachedRooms.size, '徒歩で歩ける部屋数').toBe(15);
		for (const k of ['0,2', '1,1', '2,2', '1,3']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const [row, col] = ENTRY.split(',');
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row, col, ps_weapon: '1', ps_hearts: '3', ...extra });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 1);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）∴HP を測る本は 'g' で切る。
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// 立ち止まって n tick 進める（向きは毎 tick 固定）。π のブーメランが初めて飛んだ tick と HP を返す。
const standStill = (page, dir, n) => page.evaluate(({ dir, n }) => {
	const g = window.__game;
	const hp0 = g.getState().player.hp;
	let first = null, returnsHome = false;
	for (let i = 0; i < n; i++) {
		g.setHeroDir(dir);
		g.step(1);
		const pr = g.getProjectiles().filter((x) => x.type === 'boomerang' && x.owner === 'enemy');
		if (pr.length && first == null) { first = i; returnsHome = !!pr[0].returnsToOwner; }
	}
	return { hp0, hp1: g.getState().player.hp, first, returnsHome };
}, { dir, n });

test.describe('D2 1,2 ブーメラン鬼の十字路 ② 実機', () => {
	test('南の入口 (8,5) で立ち止まると π が往復するブーメランを投げ、盾なしでは HP が減る', async ({ page }) => {
		const errors = await boot(page);
		const r = await standStill(page, 'down', 60);
		expect(r.first, 'π が投げない').not.toBeNull();
		expect(r.first, '入ってから投げるまでが長すぎる').toBeLessThan(30);
		expect(r.returnsHome, '投げた本人へ帰るブーメランでない').toBe(true);
		expect(r.hp1, '盾なしで立ち止まっても HP が減らない').toBeLessThan(r.hp0);
		expect(errors).toEqual([]);
	});

	test('木の盾（D1 の報酬）で上を向いて立てば無傷', async ({ page }) => {
		const errors = await boot(page, { ps_shield: '0' });
		const r = await standStill(page, 'up', 60);
		expect(r.first, 'π が投げない').not.toBeNull();
		expect(r.hp1, '木の盾で防げない').toBe(r.hp0);
		expect(errors).toEqual([]);
	});
});
