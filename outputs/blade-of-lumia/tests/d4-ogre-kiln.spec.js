// tests/d4-ogre-kiln.spec.js
// dungeon_4 `4,2`「爆弾鬼の封じ窯」の番人
// （2026-10-25 / PLAN 実行キュー 92 の5室目・盤面は `scripts/migrate-d4-4-2-ogre-kiln.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   西の口だけが開いた行き止まりの真ん中にルピー×5 が1つ落ちているだけ・敵なし。
//
// 新しい盤面:
//      1 #....#λ...##   ← 窯（北東・壁だけで閉じた 2×4）に爆弾鬼 λ
//      2 #....#....##
//      3 #....#######
//      4〜6 広間（行4-5 は西の口・溶岩の池 (5〜6, 3〜5)）
//      7 ##.........#
//      8 #B!........#   ← 宝物庫：宝箱 B(8,1)（ルピー×20）の東がひび `!`(8,2)
//   D4 では爆弾が無い∴λ の爆弾（投げた瞬間の足元に落ちる・`!` を壊す）をひびの隣で投げさせ、落ちる前に離れる。
//
// 守るものは3つ。
//   ① データ：盤面・宝箱とひび・ひびが壊れる前は宝箱に届かない・窯は倒せない砲台（歩いても線でも届かない／
//      対照＝窯の壁を1枚開けると線ができる）・λ が立ち位置へ投げられる・敵と脅威度・層の接続は不変。
//   ② 挙動（実機）：λ は窯から出ずに投げてくる／矢・ブーメランは窯の中の λ に届かない。
//   ③ 主題（実機）：離れた所に居てもひびは崩れない／ひびの隣で投げさせて離れれば無傷でひびが崩れ、宝箱 +20／
//      立ち止まったままだと爆風を浴びる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, ROWS, COLS, TARGET, KILN, OGRE, CHEST_CELL, CRACK, OPENING, BREAKABLE_WALLS,
	reach, linesIntoKiln, edgeDist, standCells,
} from '../scripts/migrate-d4-4-2-ogre-kiln.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));
const at = (k) => { const [r, c] = k.split(',').map(Number); return grid[r][c]; };
const OGRE_META = ENEMY_META[TILE.BOMB_OGRE];

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D4 爆弾鬼の封じ窯 ① データ', () => {
	test('盤面・宝箱（ルピー×20・最初から置いてある）・ひび1枚（λ の爆風で壊れる）', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(grid.flat().filter((ch) => ch === TILE.CHEST).length, '宝箱が1つでない').toBe(1);
		expect(at(CHEST_CELL)).toBe(TILE.CHEST);
		expect(room.chestContents[CHEST_CELL]).toMatchObject({ type: 'rupee', value: 20 });
		expect(room.showConditions ?? {}, '宝箱に出現条件が付いた').toEqual({});
		expect(grid.flat().filter((ch) => ch === TILE.BREAKABLE_WALL).length, 'ひびが1枚でない').toBe(1);
		expect(at(CRACK)).toBe(TILE.BREAKABLE_WALL);
		expect(room.breakableWalls).toEqual(BREAKABLE_WALLS);
		expect(OGRE_META.attack.blast.breakPower, 'λ の爆風がひびを壊せない').toBeGreaterThanOrEqual(BREAKABLE_WALLS[CRACK].breakDef);
	});

	test('宝箱はひびが壊れる前は届かず、壊れると届く・取り残しなし', () => {
		expect(reach(grid, OPENING).has(CHEST_CELL), 'ひびを壊さずに宝箱へ届く').toBe(false);
		expect(reach(grid, OPENING, new Set([CRACK])).has(CHEST_CELL), 'ひびを壊しても宝箱へ届かない').toBe(true);
		const walk = reach(grid, OPENING);
		const stranded = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const k = `${r},${c}`;
			if (!HARD_BLOCKED.has(grid[r][c]) && grid[r][c] !== TILE.BREAKABLE_WALL && !KILN.includes(k) && k !== CHEST_CELL && !walk.has(k)) stranded.push(k);
		}
		expect(stranded, '取り残された床がある').toEqual([]);
	});

	test('窯は倒せない砲台：歩いても、隣からも、縦横の線でも届かない／対照：窯の壁を1枚開けると線ができる', () => {
		const walk = reach(grid, OPENING, new Set([CRACK]));
		expect(KILN.filter((k) => walk.has(k)), '窯へ歩いて入れる').toEqual([]);
		const touching = [];
		for (const k of KILN) {
			const [r, c] = k.split(',').map(Number);
			for (const n of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`)) {
				if (!KILN.includes(n) && walk.has(n)) touching.push(n);
			}
		}
		expect(touching, '窯の隣に歩けるマスがある＝剣・炎が届く').toEqual([]);
		expect(linesIntoKiln(grid, walk), '窯の中へ矢・ブーメランの線が通る').toEqual([]);
		const open = grid.map((row, r) => row.map((x, c) => (r === 3 && c === 7 ? TILE.FLOOR : x)));
		expect(linesIntoKiln(open, reach(open, OPENING)).length, '対照：壁を開けても線ができない＝測定が空虚').toBeGreaterThan(0);
	});

	test('λ が窯の中からひびの立ち位置へ投げられる・敵と脅威度・層の接続は不変', () => {
		const stands = standCells(reach(grid, OPENING), OGRE_META.attack.blast.radius);
		const throwable = stands.filter((s) => KILN.some((k) => {
			const d = edgeDist(k, s);
			return d <= OGRE_META.attack.range && d >= OGRE_META.attack.minRange;
		}));
		expect(throwable.length, 'λ がひびの立ち位置へ投げられない').toBeGreaterThan(0);
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.BOMB_OGRE}@${OGRE}`]);
		expect(OGRE_META.attack.type).toBe('bombThrow');
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['2,3'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ②③ 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '8', ...extra,   // D4 の想定（profilesAt の min＝ハート 8）
	});
	return `${GAME}?${p.toString()}`;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
async function boot(page, url) {
	await page.goto(url);
	await waitForBoard(page);
	// ⚠ プレビューは debugMode:true ＝ takeDamage が早期 return する∴爆風の被弾を測るため 'g' で切る
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	await step(page, 2);
}
async function walk(page, dir, ops) {   // movePlayer 1回＝半マス（[[blade-moveplayer-is-half-tile]]）
	for (let i = 0; i < ops; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
	}
}
const pos = (page) => page.evaluate(() => { const { x, y } = window.__game.getState().player; return `${y},${x}`; });
const broken = (page) => page.evaluate((k) => window.__game.getStageState().brokenWalls.includes(k), CRACK);

test.describe('D4 爆弾鬼の封じ窯 ② 実機', () => {
	test('λ は窯から出ずに、西の口に居る勇者へ壁越しに投げてくる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(4, 1));
		// 実測（.scratch/q92/probe-4-2.mjs の C）＝15 tick で最初の投擲・以後 18 tick ごと∴上限 60 tick で1回。
		const r = await page.evaluate((kiln) => {
			const g = window.__game;
			let thrown = null; const outside = [];
			for (let i = 0; i < 120; i++) {
				g.step(1);
				if (thrown == null && g.getProjectiles().some((p) => p.owner === 'enemy' && p.type === 'thrownBomb')) thrown = i;
				const e = g.getEnemies()[0];
				const cell = `${Math.round(e.y)},${Math.round(e.x)}`;
				if (!kiln.includes(cell)) outside.push(cell);
			}
			return { thrown, outside };
		}, KILN);
		expect(r.thrown, '西の口に居ても λ が投げてこない').not.toBeNull();
		expect(r.thrown).toBeLessThan(60);
		expect(r.outside, 'λ が窯の外へ出た').toEqual([]);
		expect(errors).toEqual([]);
	});

	test('矢もブーメランも窯の中の λ に届かない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		// 矢＝窯の真下 (4,7) から北へ（南の壁 (3,7) で止まる）。ブーメラン＝窯の西 (1,4) から東へ（壁 (1,5) で止まる）。
		for (const [row, col, dir, extra] of [[4, 7, 'up', { ps_bow: '1' }], [1, 4, 'right', { ps_boomerang: '1' }]]) {
			await boot(page, previewUrl(row, col, extra));
			const r = await page.evaluate((dir) => {
				const g = window.__game;
				let shots = 0;
				for (let i = 0; i < 120; i++) {
					if (!g.getProjectiles().some((p) => p.owner === 'player')) { g.setHeroDir(dir); g.useSubItem(); shots++; }
					g.step(1);
				}
				return { shots, hp: g.getEnemies()[0].hp, item: g.getState().player.activeSubItem };
			}, dir);
			expect(r.item, `前提：${Object.keys(extra)[0]} の道具を持っていない`).toBe(extra.ps_bow ? 'bow' : 'boomerang');
			expect(r.shots, '前提：撃っていない').toBeGreaterThan(3);
			expect(r.hp, `${r.item} が窯の中の λ に当たった`).toBe(OGRE_META.hp);
		}
		expect(errors).toEqual([]);
	});
});
// ⚠️「剣・矢・ブーメランではひびは崩れない」は実機で測らない＝ひびを壊す経路は `explodeAt`（爆風）だけで、
//    剣や投擲物から壊す道がエンジンに無い∴壊して赤くする手が無い（歯の無い番人になる）。

test.describe('D4 爆弾鬼の封じ窯 ③ 主題', () => {
	test('対照：ひびから離れた所で爆弾を浴び続けても、ひびは崩れない', async ({ page }) => {
		await boot(page, previewUrl(4, 8));
		// 広間の東 (4,8)＝ひびから 7 マス。爆弾が足元に落ちても爆風（半径 1.5）はひびに掛からない。
		const r = await page.evaluate(() => {
			const g = window.__game; let throws = 0, had = false;
			for (let i = 0; i < 100; i++) {
				g.step(1);
				const b = g.getProjectiles().some((p) => p.owner === 'enemy');
				if (b && !had) throws++; had = b;
			}
			return { throws };
		});
		expect(r.throws, '前提：λ が投げてこない').toBeGreaterThan(0);
		expect(await broken(page), '離れた所に落ちた爆弾でひびが崩れた').toBe(false);
	});

	test('立ち止まったままだと爆風を浴びる（ひびは崩れるが、痛い）', async ({ page }) => {
		await boot(page, previewUrl(8, 3));
		const hp0 = await page.evaluate(() => window.__game.getState().player.hp);
		// 実測（probe-4-2 の A）＝15 tick で投げ、26 tick で着弾∴上限 60 tick。
		await step(page, 60);
		expect(await broken(page), '足元に落ちた爆弾でひびが崩れない').toBe(true);
		expect(await page.evaluate(() => window.__game.getState().player.hp), '立ち止まっても爆風を浴びない').toBeLessThan(hp0);
	});

	test('通し：ひびの隣で投げさせて離れると、無傷でひびが崩れ、宝箱が開いてルピー +20', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(8, 3));
		const hp0 = await page.evaluate(() => window.__game.getState().player.hp);
		const rupees0 = await page.evaluate(() => window.__game.getState().player.rupees);
		// 爆弾が手を離れたら東へ 4 マス歩く（反応の遅れ 4 tick でも間に合う＝probe-4-2 の B2）。
		const r = await page.evaluate(() => {
			const g = window.__game;
			let thrown = null, walked = 0, minHp = g.getState().player.hp, broke = null;
			for (let i = 0; i < 120; i++) {
				if (thrown == null && g.getProjectiles().some((p) => p.owner === 'enemy' && p.type === 'thrownBomb')) thrown = i;
				if (thrown != null && i >= thrown + 2 && walked < 8) { g.movePlayer('right'); walked++; }
				g.step(1);
				minHp = Math.min(minHp, g.getState().player.hp);
				if (broke == null && g.getStageState().brokenWalls.includes('8,2')) { broke = i; break; }
			}
			return { thrown, broke, minHp };
		});
		expect(r.thrown, 'λ がひびの隣の勇者へ投げてこない').not.toBeNull();
		expect(r.broke, '爆弾が落ちてもひびが崩れない').not.toBeNull();
		expect(r.minHp, '投げられてから離れたのに爆風を浴びた').toBe(hp0);
		// 次の爆弾が落ちる前に宝箱へ（崩れたひび (8,2) を通って西へ）
		await walk(page, 'left', 12);
		expect(await pos(page), '崩れたひびを通って宝箱まで歩けない').toBe(CHEST_CELL);
		expect(await page.evaluate(() => window.__game.getStageState().openedChests), '宝箱が開かない').toContain(CHEST_CELL);
		const rupees1 = await page.evaluate(() => window.__game.getState().player.rupees);
		expect(rupees1 - rupees0, 'ルピーが 20 増えない').toBe(20);
		expect(errors).toEqual([]);
	});
});
