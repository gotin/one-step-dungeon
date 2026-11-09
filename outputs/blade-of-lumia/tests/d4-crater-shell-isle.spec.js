// tests/d4-crater-shell-isle.spec.js
// dungeon_4 `4,3`「火口湖の甲羅島」の番人
// （2026-10-24 / PLAN 実行キュー 92 の4室目・盤面は `scripts/migrate-d4-4-3-crater-shell-isle.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   西の口だけが開いた行き止まりの真ん中にルピー×5 が1つ落ちているだけ・敵なし。
//
// 新しい盤面:
//      1 #6..lllllξφ#   ← 島（北東の角・2×2）に火吐き亀 φ と蝙蝠 ξ×3／矢束 6(1,1)
//      2 #...lllllξξ#
//      3〜7 湖（行4-5 は西の口・湖の岩 (5,6)・南西の岸は斜め）
//      8 #.........B#   ← 宝箱 B(8,10)＝ルピー×50（killAll）（キュー100 で増額）
//   島は岸から縦横 6 マス＝木のブーメラン（実効 4.5 マス）の外＝弓で、甲羅が開いた瞬間に射る。
//
// 守るものは3つ。
//   ① データ：盤面・宝箱と矢束・島へは歩いて届かず隣は溶岩と壁だけ・岸から島への線は全部 6 マス以上
//      （対照＝岸を1列広げると縮む）・亀の炎が岸に届かない・敵と脅威度・層の接続は不変。
//   ② 挙動（実機）：溶岩に踏み込めない／蝙蝠は湖を越えて岸へ来る。
//   ③ 主題（実機）：木のブーメランは島に届かない（亀は無傷）／閉じた甲羅には矢が効かない／
//      開いた瞬間に射れば倒せる／通しで全滅→宝箱→ルピー +50。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, ROWS, COLS, TARGET, ISLE, TURTLE, BATS, CHEST_CELL, ARROWS_CELL, ARROWS_COUNT, OPENING,
	WOOD_REACH, MIN_SHOT, reach, shotLines,
} from '../scripts/migrate-d4-4-3-crater-shell-isle.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));
const nbrs = (k) => { const [r, c] = k.split(',').map(Number); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };
const at = (k) => { const [r, c] = k.split(',').map(Number); return grid[r][c]; };

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D4 火口湖の甲羅島 ① データ', () => {
	test('盤面・宝箱（ルピー×50・killAll）・床の矢束', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(grid.flat().filter((ch) => ch === TILE.CHEST).length, '宝箱が1つでない').toBe(1);
		expect(at(CHEST_CELL)).toBe(TILE.CHEST);
		expect(room.chestContents[CHEST_CELL]).toMatchObject({ type: 'rupee', value: 50 });
		expect(room.showConditions).toEqual({ [CHEST_CELL]: { trigger: 'killAll' } });
		expect(at(ARROWS_CELL)).toBe(TILE.ITEM_ARROWS);
		expect(room.floorItems).toEqual({ [ARROWS_CELL]: { count: ARROWS_COUNT } });
	});

	test('島へは歩いて届かず隣は溶岩と壁だけ・岸の床は全部届く', () => {
		const walk = reach(grid, OPENING);
		expect(walk.has(CHEST_CELL) && walk.has(ARROWS_CELL), '宝箱か矢束に届かない').toBe(true);
		expect(ISLE.filter((k) => walk.has(k)), '島へ歩いて渡れる').toEqual([]);
		const fence = new Set();
		for (const k of ISLE) for (const n of nbrs(k)) if (!ISLE.includes(n)) fence.add(at(n));
		expect([...fence].sort(), '島の隣に溶岩と壁以外がある').toEqual([TILE.WALL, TILE.LAVA].sort());
		const stranded = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const k = `${r},${c}`;
			if (!HARD_BLOCKED.has(grid[r][c]) && !ISLE.includes(k) && !walk.has(k)) stranded.push(k);
		}
		expect(stranded, '取り残された床がある').toEqual([]);
	});

	test('岸から島への線は西と南にあり全部 6 マス以上（木のブーメランの外）／対照：岸を1列広げると縮む・亀の炎は岸に届かない', () => {
		const lines = shotLines(grid, reach(grid, OPENING));
		expect(lines.length, '岸から島へ射る線が無い').toBeGreaterThan(0);
		expect(lines.some((l) => l.to === TURTLE), '亀の居場所へ射る線が無い').toBe(true);
		const min = Math.min(...lines.map((l) => l.dist));
		expect(min, `岸から島まで ${min} マス＝木のブーメラン（実効 ${WOOD_REACH}）が届く`).toBeGreaterThanOrEqual(MIN_SHOT);
		expect(MIN_SHOT).toBeGreaterThan(WOOD_REACH);
		const wide = grid.map((row, r) => row.map((x, c) => (c === 4 && r >= 1 && r <= 8 ? TILE.FLOOR : x)));
		expect(Math.min(...shotLines(wide, reach(wide, OPENING)).map((l) => l.dist)), '対照：岸を広げても縮まない＝測定が空虚').toBeLessThan(MIN_SHOT);
		const cells = ENEMY_META[TILE.FIRE_TURTLE].shell.breathCells;
		const walk = reach(grid, OPENING);
		const burnt = [];
		for (const k of ISLE) {
			const [r0, c0] = k.split(',').map(Number);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				for (let i = 1; i <= cells; i++) {
					const r = r0 + dr * i, c = c0 + dc * i;
					if (r < 0 || c < 0 || r >= ROWS || c >= COLS || HARD_BLOCKED.has(grid[r][c])) break;
					if (walk.has(`${r},${c}`)) burnt.push(`${k}→${r},${c}`);
				}
			}
		}
		expect(burnt, '亀の炎が岸に届く').toEqual([]);
	});

	test('敵は島の上の φ×1・ξ×3・脅威度は看板より軽い・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		const want = [`${TILE.FIRE_TURTLE}@${TURTLE}`, ...BATS.map((k) => `${TILE.BAT_SWARM}@${k}`)];
		expect(mobs.sort()).toEqual(want.sort());
		expect(ENEMY_META[TILE.FIRE_TURTLE].move, '亀が溶岩を越えるようになった＝島の前提が変わった').toBeUndefined();
		expect(ENEMY_META[TILE.BAT_SWARM].move).toBe('air');
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
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
async function boot(page, url, { killBats = true, mortal = false } = {}) {
	await page.goto(url);
	await waitForBoard(page);
	// ⚠ プレビューは debugMode:true ＝ takeDamage が早期 return する∴HP を測るときは 'g' で切る
	if (mortal) await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	if (killBats) {
		await page.evaluate((bat) => {
			for (const e of window.__game.getEnemies()) if (e.type === bat) window.__game.dealDamage(e.id, 99, 'sword');
		}, TILE.BAT_SWARM);
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
const turtleHp = (page) => page.evaluate((t) => window.__game.getEnemies().find((e) => e.type === t)?.hp ?? null, TILE.FIRE_TURTLE);

test.describe('D4 火口湖の甲羅島 ② 実機', () => {
	test('溶岩に踏み込めない（西の岸から東・南の岸から北）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(4, 2));
		await walk(page, 'right', 8);
		expect(await pos(page), '西の岸から溶岩 (4,4) へ踏み出せた').toBe('4,3');
		await boot(page, previewUrl(8, 9));
		await walk(page, 'up', 6);
		expect(await pos(page), '南の岸から溶岩 (7,9) へ踏み出せた').toBe('8,9');
		expect(errors).toEqual([]);
	});

	test('蝙蝠は島から湖を越えて岸へ来る', async ({ page }) => {
		await boot(page, previewUrl(4, 2), { killBats: false });
		// 実測（.scratch/q92/probe-4-3.mjs の D）＝23 tick で最初の接触∴上限 200 tick。
		const onBank = await page.evaluate((bat) => {
			const g = window.__game;
			for (let i = 0; i < 200; i++) {
				g.step(1);
				if (g.getEnemies().some((e) => e.type === bat && e.x <= 3.5)) return i;
			}
			return null;
		}, TILE.BAT_SWARM);
		expect(onBank, '蝙蝠が西の岸（列3 以西）まで来ない').not.toBeNull();
	});
});

test.describe('D4 火口湖の甲羅島 ③ 主題', () => {
	test('西の岸から東へ木のブーメランを投げ続けても島に届かない（亀は無傷）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(1, 3, { ps_boomerang: '1' }));
		const r = await page.evaluate(() => {
			const g = window.__game;
			let throws = 0, maxX = 0;
			for (let i = 0; i < 300; i++) {
				if (!g.getProjectiles().some((x) => x.owner === 'player')) { g.setHeroDir('right'); g.useSubItem(); throws++; }
				g.step(1);
				for (const p of g.getProjectiles()) if (p.owner === 'player') maxX = Math.max(maxX, p.x);
			}
			return { throws, maxX, item: g.getState().player.activeSubItem };
		});
		expect(r.item, '前提：ブーメランを持っていない').toBe('boomerang');
		expect(r.throws, '前提：ブーメランを投げていない').toBeGreaterThan(5);
		expect(r.maxX, 'ブーメランが島（列9）の手前で折り返さない').toBeLessThan(8.5);
		expect(await turtleHp(page), 'ブーメランが島の亀に当たった').toBe(ENEMY_META[TILE.FIRE_TURTLE].hp);
		expect(errors).toEqual([]);
	});

	test('甲羅が閉じている間に射った矢は弾かれ、開いた瞬間に射った矢は刺さる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(1, 3, { ps_bow: '1' }));
		// 亀と同じ行に立ち、閉じている間に1本・開いた瞬間に1本射る。どちらも当たり終わるまで待つ。
		const r = await page.evaluate((T) => {
			const g = window.__game;
			const turtle = () => g.getEnemies().find((e) => e.type === T);
			const align = () => {
				for (let i = 0; i < 40; i++) {
					const t = turtle(), pl = g.getPlayer();
					const tr = Math.round(t.y);
					if (Math.round(pl.y) === tr && Math.abs(t.y - tr) < 0.01) return true;
					if (Math.round(pl.y) !== tr) g.movePlayer(tr < pl.y ? 'up' : 'down');
					g.step(1);
				}
				return false;
			};
			const shootWhen = (wantClosed) => {
				for (let i = 0; i < 200; i++) {
					if (!align()) return null;
					const t = turtle();
					// 矢は 6 マスを約 3 tick で飛ぶ＝窓の残りが短い時は待つ（閉じ際・開き際を跨がない）
					const left = t.shellUntil - g.getState().gameTime;
					if (t.shellClosed === wantClosed && left > 600) {
						const hp0 = t.hp;
						g.setHeroDir('right'); g.useSubItem();
						for (let k = 0; k < 12 && g.getProjectiles().some((x) => x.owner === 'player'); k++) g.step(1);
						return { hp0, hp: turtle().hp };
					}
					g.step(1);
				}
				return null;
			};
			return { closed: shootWhen(true), open: shootWhen(false) };
		}, TILE.FIRE_TURTLE);
		expect(r.closed, '閉じている窓で射てなかった').not.toBeNull();
		expect(r.closed.hp, '閉じた甲羅に矢が刺さった').toBe(r.closed.hp0);
		expect(r.open, '開いた窓で射てなかった').not.toBeNull();
		expect(r.open.hp, '開いた甲羅に矢が刺さらない').toBeLessThan(r.open.hp0);
		expect(errors).toEqual([]);
	});

	test('通し：蝙蝠を片付け、開いた瞬間に射って亀を倒すと宝箱が出てルピー +50', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(1, 3, { ps_bow: '1' }));
		expect((await page.evaluate(() => window.__game.getStageState().conditionsMet)), '前提：宝箱が最初から出ている').not.toContain(CHEST_CELL);
		// 実測（probe-4-3 の B open）＝5 射・39 tick で倒れた∴上限 600 tick。
		const r = await page.evaluate((T) => {
			const g = window.__game;
			const turtle = () => g.getEnemies().find((e) => e.type === T);
			let shots = 0, i = 0;
			for (; i < 600 && turtle(); i++) {
				const t = turtle(), pl = g.getPlayer();
				const tr = Math.round(t.y);
				if (Math.round(pl.y) !== tr) { g.movePlayer(tr < pl.y ? 'up' : 'down'); g.step(1); continue; }
				if (!g.getProjectiles().some((x) => x.owner === 'player') && !t.shellClosed) { g.setHeroDir('right'); g.useSubItem(); shots++; }
				g.step(1);
			}
			return { left: g.getEnemies().length, shots, ticks: i };
		}, TILE.FIRE_TURTLE);
		expect(r.left, `亀が倒れない（${r.shots} 射・${r.ticks} tick）`).toBe(0);
		expect(r.shots, '矢を射る前に倒れた（他の手で倒れた）').toBeGreaterThan(0);
		await step(page, 2);
		const rupees0 = await page.evaluate(() => window.__game.getState().player.rupees);
		expect((await page.evaluate(() => window.__game.getStageState().conditionsMet)), '全滅しても宝箱が出ない').toContain(CHEST_CELL);
		// 宝箱 (8,10) へ：西の岸を (8,3) まで下り、南の岸を東へ
		const row = Number((await pos(page)).split(',')[0]);
		await walk(page, 'down', (8 - row) * 2);
		await walk(page, 'right', 14);
		expect(await pos(page), '南の岸を宝箱まで歩けない').toBe(CHEST_CELL);
		expect((await page.evaluate(() => window.__game.getStageState().openedChests)), '宝箱が開かない').toContain(CHEST_CELL);
		const rupees1 = await page.evaluate(() => window.__game.getState().player.rupees);
		expect(rupees1 - rupees0, 'ルピーが 50 増えない').toBe(50);
		expect(errors).toEqual([]);
	});
});
