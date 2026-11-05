// tests/d6-rupee-eater-cage.spec.js
// dungeon_6 `0,3`「ルピー喰いの檻」の番人
// （2026-11-05 / PLAN 実行キュー 95 の1室目・盤面は `scripts/migrate-d6-0-3-rupee-eater-cage.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間に木2本・茂み2つ・床のルピー（5）が1つだけ・敵なし。
//
// 新しい盤面:
//      1 #..........#   ← 北の回廊
//      2 ##########.#
//      3 ##B......#.#   ← 檻の奥の宝箱 B(3,2)
//      4 ##σ......!..   ← ルピー喰い σ(4,2)／朽ちた根の扉 !(4,9)／東の口
//      5 ##.......#..
//      6 ##########.#
//      7 #..........#   ← 南の回廊
//   檻の口は朽ちた根1枚＝爆弾でしか開かない（D6 の報酬の予告）。σ は扉の前では気づかない＝
//   回廊で起こして扉の内側まで連れて来てから置くと、扉と一緒に吹き飛ぶ。
//
// 守るものは3つ。
//   ① データ：盤面・宝の中身・扉1枚・開ける前は届かず開けると届く・置ける足場は (4,10) だけ・
//      その爆風が扉と扉の内側 (4,8) だけに届く・檻の中への直線が無い・σ のさまよう箱が扉から遠い・
//      回廊から起こせる・敵と脅威度・層の接続は不変。
//   ② エンジンの前提：σ のさまよい方・爆弾の半径と威力・床の爆弾は爆弾無しでも拾える（置かない理由）。
//   ③ 挙動（実機）：剣では扉が開かない／扉の前で待っても σ は来ない／回廊で起こして置けば σ ごと
//      吹き飛び、宝箱でルピー +30／起こさずに置くと σ は生き残り、檻へ入ると財布を吸われる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE, FLOOR_STACK_TILES } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ITEM_META } from '../shared/items.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS, stageThreat } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, TARGET, CHEST, DOOR, SEAT, INNER, EATER, OPENINGS, CAGE_INSIDE, CHEST_CONTENTS,
	BREAKABLE, ROAM, reach, blast,
} from '../scripts/migrate-d6-0-3-rupee-eater-cage.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));
const rc = (k) => k.split(',').map(Number);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 ルピー喰いの檻 ① データ', () => {
	test('盤面・宝箱の中身・扉1枚（旧 床のルピーが残っていない・床の爆弾が無い）', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(room.breakableWalls).toEqual(BREAKABLE);
		expect(grid.flat().filter((ch) => ch === TILE.BREAKABLE_WALL).length, '朽ちた根が1枚でない').toBe(1);
		expect(grid.flat().includes(TILE.ITEM_BOMB), '床の爆弾がある（爆弾を持つ前に拾える）').toBe(false);
		expect(Object.keys(room.floorItems ?? {}), '床のアイテムが残っている').toEqual([]);
		expect(Object.keys(room.showConditions ?? {}), '宝箱に封印条件が付いている（扉が関門のはず）').toEqual([]);
	});

	test('開ける前は檻に届かず、開けると届く・置ける足場は (4,10) だけ', () => {
		const pre = reach(grid, OPENINGS);
		const post = reach(grid, OPENINGS, { openDoor: true });
		expect(CAGE_INSIDE.filter((k) => pre.has(k)), '開ける前に檻の中へ歩いて届く').toEqual([]);
		expect(post.has(CHEST), '開けても宝箱へ届かない').toBe(true);
		const [r, c] = rc(DOOR);
		const outside = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
			.map(([a, b]) => `${a},${b}`).filter((k) => pre.has(k));
		expect(outside, '扉の外の立てる床が (4,10) だけでない').toEqual([SEAT]);
	});

	test('対照：扉を床にすると開けずに届く・壁にすると開けても届かない（測定が空虚でない）', () => {
		const withCell = (ch) => grid.map((row, r) => row.map((x, c) => (`${r},${c}` === DOOR ? ch : x)));
		expect(reach(withCell(TILE.FLOOR), OPENINGS).has(CHEST)).toBe(true);
		expect(reach(withCell(TILE.WALL), OPENINGS, { openDoor: true }).has(CHEST)).toBe(false);
	});

	test('爆風：足場に置くと扉と扉の内側だけに届く／檻の外から檻の中への直線が無い', () => {
		const b = blast(SEAT);
		expect(b, '足場の爆風が扉に届かない').toContain(DOOR);
		expect(b.filter((k) => CAGE_INSIDE.includes(k)), '足場の爆風が届く檻の中が扉の内側だけでない').toEqual([INNER]);
		const pre = reach(grid, OPENINGS);
		const leaks = [];
		for (const k of pre) {
			const [r0, c0] = rc(k);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				for (let r = r0 + dr, c = c0 + dc; r >= 0 && c >= 0 && r < grid.length && c < grid[0].length; r += dr, c += dc) {
					const ch = grid[r][c];
					if (ch === TILE.WALL || ch === TILE.BREAKABLE_WALL || ch === TILE.TREE) break;
					if (CAGE_INSIDE.includes(`${r},${c}`)) { leaks.push(`${k}→${r},${c}`); break; }
				}
			}
		}
		expect(leaks, '檻の外から剣・矢・ブーメランの直線が檻の中へ通る').toEqual([]);
	});

	test('σ のさまよう箱は扉の外から notice より遠く、回廊からは起こせる', () => {
		const [er, ec] = rc(EATER);
		const [sr, sc] = rc(SEAT);
		const box = CAGE_INSIDE.filter((k) => { const [r, c] = rc(k); return Math.abs(r - er) <= ROAM.radius && Math.abs(c - ec) <= ROAM.radius; });
		expect(box.filter((k) => { const [r, c] = rc(k); return Math.hypot(r - sr, c - sc) <= ROAM.notice; }),
			'扉の外から気づかれるセルがさまよう箱にある').toEqual([]);
		expect(box, '扉の内側にさまよって来る').not.toContain(INNER);
		const pre = [...reach(grid, OPENINGS)];
		const wakes = (row) => pre.some((k) => {
			const [r, c] = rc(k);
			return r === row && box.some((b) => { const [br, bc] = rc(b); return Math.hypot(r - br, c - bc) <= ROAM.notice; });
		});
		expect(wakes(1), '北の回廊から起こせない').toBe(true);
		expect(wakes(7), '南の回廊から起こせない').toBe(true);
	});

	test('敵はルピー喰い 1体・脅威度は看板部屋より軽い・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.RUPEE_EATER}@${EATER}`]);
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['2,3'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS に宣言が無い').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: false, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ② エンジンの前提 ─────────────────────────────────────────────────
test('D6 ルピー喰いの檻 ② 前提：σ のさまよい方・爆弾の半径と威力・床の爆弾は誰でも拾える', () => {
	const roam = ENEMY_META[TILE.RUPEE_EATER].roam;
	expect({ notice: roam.notice, lose: roam.lose, radius: roam.radius }, 'σ のさまよい方が変わった＝起こし方の幾何を測り直す').toEqual(ROAM);
	expect(ITEM_META.bomb.aoeRadius, '爆弾の半径が変わった＝足場の爆風を測り直す').toBe(2);
	expect(ITEM_META.bomb.damage, '爆弾で σ が一撃にならない').toBeGreaterThanOrEqual(ENEMY_META[TILE.RUPEE_EATER].hp);
	expect(FLOOR_STACK_TILES[TILE.ITEM_BOMB].requires, '床の爆弾に条件が付いた＝約束②（床に置かない）を見直せる').toBe(null);
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_rupees: '100', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
async function boot(page, url) {
	await page.goto(url);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	await step(page, 2);
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
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
const ss = (page) => page.evaluate(() => window.__game.getStageState());
const rupees = (page) => page.evaluate(() => window.__game.getState().player.rupees);
const eaters = (page) => page.evaluate(() => window.__game.getEnemies().map((e) => ({ y: e.y, x: e.x, hp: e.hp })));
async function bomb(page) {
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bomb'; });
	await page.evaluate(() => window.__game.useSubItem());
	await step(page, 30);   // 導火線 2 秒＝16 tick＋余り
}
// 北の回廊を西の端まで歩いて σ を起こし、扉の前まで戻る（σ は檻の中をついて来る）
async function lureNorth(page) {
	await walk(page, 'up', 6);      // (4,10) → (1,10)
	await walk(page, 'left', 14);   // → (1,3)
	await step(page, 20);
	await walk(page, 'right', 14);  // → (1,10)
	await walk(page, 'down', 6);    // → (4,10)
	await step(page, 4);
}

test.describe('D6 ルピー喰いの檻 ③ 実機', () => {
	test('剣では扉が開かない・扉の前で待っても σ は扉へ来ない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(4, 10));
		await walk(page, 'left', 4);
		expect(await pos(page), '扉 (4,9) へ踏み込めた').toBe(SEAT);
		await page.evaluate(() => { window.__game.setHeroDir('left'); window.__game.swordAttack(); });
		await step(page, 6);
		expect((await ss(page)).brokenWalls ?? [], '剣で扉が開いた').not.toContain(DOOR);
		let maxX = 0;
		for (let i = 0; i < 6; i++) {
			await step(page, 50);
			for (const e of await eaters(page)) maxX = Math.max(maxX, e.x);
		}
		expect(maxX, 'σ が扉の前の勇者に気づいて扉へ寄った').toBeLessThanOrEqual(5);
		expect(errors).toEqual([]);
	});

	test('通し：北の回廊で起こして扉の前で爆弾＝σ ごと吹き飛び、宝箱でルピー +30', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(4, 10, { ps_bomb: '1' }));
		await lureNorth(page);
		const [ir, ic] = rc(INNER);
		const before = await eaters(page);
		expect(before.length === 1 && Math.abs(before[0].y - ir) < 1 && Math.abs(before[0].x - ic) < 1,
			`σ が扉の内側 ${INNER} までついて来ない（実測 ${JSON.stringify(before)}）`).toBe(true);
		await bomb(page);
		expect((await ss(page)).brokenWalls, '爆弾で扉が開かない').toContain(DOOR);
		expect(await eaters(page), '扉の内側の σ が爆風で倒れない').toEqual([]);
		const r0 = await rupees(page);
		await walk(page, 'left', 16);   // (4,10) → (4,2)
		await walk(page, 'up', 2);      // → (3,2)＝宝箱
		expect((await ss(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await rupees(page), 'ルピーが 30 増えない').toBe(r0 + 30);
		expect(errors).toEqual([]);
	});

	test('起こさずに置くと σ は生き残り、檻へ入ると張り付かれて財布が減る', async ({ page }) => {
		await boot(page, previewUrl(4, 10, { ps_bomb: '1' }));
		await bomb(page);
		expect((await ss(page)).brokenWalls, '爆弾で扉が開かない').toContain(DOOR);
		const alive = await eaters(page);
		expect(alive.length, '起こさずに置いたのに σ が倒れた（扉の内側へ寄って来ている）').toBe(1);
		expect(alive[0].hp, 'σ が爆風を浴びている').toBe(ENEMY_META[TILE.RUPEE_EATER].hp);
		const r0 = await rupees(page);
		await walk(page, 'left', 6);    // (4,10) → (4,7)
		let drained = false;
		for (let i = 0; i < 15 && !drained; i++) {
			await step(page, 10);
			drained = (await rupees(page)) < r0;
		}
		expect(drained, '檻へ入っても σ に財布を吸われない').toBe(true);
	});
});
