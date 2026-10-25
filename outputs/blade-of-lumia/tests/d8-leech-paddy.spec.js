// tests/d8-leech-paddy.spec.js
// dungeon_8 `0,2`「毒ヒルの泥田」の番人
// （2026-10-25 / PLAN 実行キュー 93 の1室目・盤面は `scripts/migrate-d8-0-2-leech-paddy.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   北の口と東の口が開いた通り道の真ん中に宝箱（回復薬）が1つあるだけ・敵なし。
//
// 新しい盤面（~ は bgTiles の水）:
//      1 #~~~~......#
//      2 #B..~......#   ← 宝箱 (2,1)＝回復薬（小）・島の北西の隅
//      4 #.Γ.~.......   ← 島の毒沼ヒル (4,2)・東の口
//      6 #...~...Γ..#   ← 本土の毒沼ヒル (6,8)
//      7 #~.~~......#   ← 畦 (7,2)＝歩いて島へ入れる唯一のセル
//   ヒルは水を渡れない（追い方は回り込まない）＝はしごで幅1の堀を跨げば撒ける。
//
// 守るものは3つ。
//   ① データ：盤面・水と泥・宝箱は島の1つ・歩いて島へは畦だけ（対照＝畦を水にすると歩いて届かない）・
//      堀は幅1＝はしごなら1枚・敵と脅威度・層の接続は不変。
//   ② 挙動（実機）：はしご無しでは堀に踏み込めない／はしごで渡れる／島のヒルも本土のヒルも堀の縁で止まる。
//   ③ 主題（実機）：島のヒルを南の岸へ引き付けてから北の行で渡ると、島のヒルに追いつかれずに宝箱が開く。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, ROWS, COLS, TARGET, CHEST, CHEST_CONTENT, DIKE, ISLAND, ISLAND_LEECH, MAIN_LEECH, OPENING, MUD,
	tilesOf, bgOf, reach, mainland,
} from '../scripts/migrate-d8-0-2-leech-paddy.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
// 配っているマップの盤面（tiles に bgTiles の水を重ねた図）で測る＝TARGET で測るとマップを壊しても緑のまま
const grid = room.tiles.map((row, r) => [...rowStr(row)].map((ch, c) => (room.bgTiles?.[`${r},${c}`] === TILE.WATER ? TILE.WATER : ch)));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D8 毒ヒルの泥田 ① データ', () => {
	test('盤面・水と泥・宝箱は島の1つ（回復薬）・床の拾い物や出現条件は無い', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(tilesOf().map(rowStr));
		expect(room.bgTiles, 'bgTiles（堀の水と島の泥）が違う').toEqual(bgOf());
		expect(grid.map((r) => r.join('')), '水の配置が TARGET と違う').toEqual(TARGET);
		expect(grid.flat().filter((ch) => ch === TILE.CHEST).length, '宝箱が1つでない').toBe(1);
		expect(room.chestContents, '宝箱の中身が違う').toEqual({ [CHEST]: CHEST_CONTENT });
		expect(ISLAND.includes(CHEST), '宝箱が島の上に無い').toBe(true);
		expect(MUD.every((k) => room.bgTiles[k] === TILE.MUD), '島と畦に泥が無い').toBe(true);
		expect(room.floorItems ?? {}, '床の拾い物の記述が残っている').toEqual({});
		expect(room.showConditions ?? {}, '出現条件が付いた').toEqual({});
	});

	test('取り残しなし・歩いて島へ入れるのは畦だけ（対照：畦を水にすると歩いては島に届かない）', () => {
		const foot = reach(grid, OPENING);
		const stranded = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const k = `${r},${c}`;
			if (!HARD_BLOCKED.has(grid[r][c]) && !foot.has(k)) stranded.push(k);
		}
		expect(stranded, '取り残された床がある').toEqual([]);
		const main = mainland(grid);
		expect(ISLAND.filter((k) => main.has(k)), '畦を通らずに島へ歩いて入れる').toEqual([]);
		const cut = grid.map((row, r) => row.map((ch, c) => (`${r},${c}` === DIKE ? TILE.WATER : ch)));
		expect(reach(cut, OPENING).has(ISLAND_LEECH), '対照：畦を水にしても歩いて島に届く＝測定が空虚').toBe(false);
	});

	test('堀は幅1＝はしごなら本土から島へ水1枚（行2〜6 のどこでも）', () => {
		const cut = grid.map((row, r) => row.map((ch, c) => (`${r},${c}` === DIKE ? TILE.WATER : ch)));
		const lad = reach(cut, OPENING, { withLadder: true });
		const island = ISLAND.filter((k) => k !== CHEST);
		expect(island.filter((k) => lad.get(k) !== 1), 'はしごで水1枚では届かない島の床がある').toEqual([]);
		for (let r = 2; r <= 6; r++) {
			expect(`${grid[r][3]}${grid[r][4]}${grid[r][5]}`, `行${r} の堀が幅1でない`).toMatch(/^[^~#]~\.$/);
		}
	});

	test('敵は毒沼ヒル×2（島と本土）・脅威度は看板部屋より軽い・宣言あり・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([ISLAND_LEECH, MAIN_LEECH].map((k) => `${TILE.POISON_LEECH}@${k}`));
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
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '8', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// debug を切る（fromEditor の既定は「無敵・すり抜け」＝すり抜けたままだと水も敵も通れてしまう）
async function boot(page, url) {
	await page.goto(url);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 2);
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	await step(page, 2);
}
const pos = (page) => page.evaluate(() => { const { x, y } = window.__game.getState().player; return `${y},${x}`; });
const leeches = (page) => page.evaluate(() => window.__game.getEnemies().map((e) => ({ id: e.id, y: e.y, x: e.x })));
const ISLAND_ID = ISLAND_LEECH;   // 敵の id は出現セル
const MAIN_ID = MAIN_LEECH;

test.describe('D8 毒ヒルの泥田 ② 実機', () => {
	test('はしご無しでは堀に踏み込めない（北の岸 (2,5) から西へ歩いても岸に留まる）', async ({ page }) => {
		await boot(page, previewUrl(2, 5));
		for (let i = 0; i < 6; i++) { await page.evaluate(() => window.__game.movePlayer('left')); await step(page, 1); }
		expect(await pos(page), '水の上へ歩けた').toBe('2,5');
	});

	test('はしごがあれば、北の岸 (2,5) から堀を1枚渡って島 (2,3) に立てる', async ({ page }) => {
		await boot(page, previewUrl(2, 5, { ps_ladder: '1' }));
		for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__game.movePlayer('left')); await step(page, 1); }
		expect(await pos(page), 'はしごで堀を渡れない').toBe('2,3');
	});

	test('島のヒルは本土の勇者を追って堀の縁で止まる（150 tick・水に入らない・縁まで来る）', async ({ page }) => {
		await boot(page, previewUrl(4, 6));
		const r = await page.evaluate((id) => {
			const g = window.__game; let maxX = -1, onWater = false;
			for (let i = 0; i < 150; i++) {
				g.step(1);
				const e = g.getEnemies().find((x) => x.id === id);
				maxX = Math.max(maxX, e.x);
				if (e.x > 3.01) onWater = true;
			}
			return { maxX, onWater };
		}, ISLAND_ID);
		expect(r.onWater, `島のヒルが堀へ出た（最大 x=${r.maxX}）`).toBe(false);
		expect(r.maxX, '島のヒルが堀の縁まで寄ってこない＝引き付けが起きない').toBe(3);
	});

	test('本土のヒルは島へ渡った勇者を追って堀の縁で止まる（150 tick・水に入らない・縁まで来る）', async ({ page }) => {
		// 渡り方は ③ の通しと同じ＝南の岸 (6,5) で島のヒルを南へ引き付けてから、北の行 (2,5) で渡る。
		// ⚠️ 岸に立ったまま渡る行を選ぶと、島のヒルが縁を上下して着地へ先回りする（行を選び直しても 4/160 回
		// 着地を塞がれた）＝島のヒルを遠ざけてから駆け上がるのがこの部屋の答えそのもの。
		// 本土のヒルは東の口から入った時点で気づいて付いてくる（(4,10) から 2.8 マス）。
		await boot(page, previewUrl(4, 10, { ps_ladder: '1' }));
		await page.evaluate(() => {
			const g = window.__game;
			const go = (r, c) => { for (let i = 0; i < 120; i++) { const p = g.getState().player; if (Math.abs(p.y - r) < 0.01 && Math.abs(p.x - c) < 0.01) return;
				g.movePlayer(Math.abs(p.y - r) > 0.01 ? (p.y < r ? 'down' : 'up') : (p.x < c ? 'right' : 'left')); g.step(1); } };
			go(4, 5); go(6, 5);
			g.step(25);
			go(2, 5); go(2, 3);
		});
		expect(await pos(page), '前提：島へ渡れない').toBe('2,3');
		const r = await page.evaluate((id) => {
			const g = window.__game; let minX = 99, onWater = false;
			for (let i = 0; i < 150; i++) {
				g.step(1);
				const e = g.getEnemies().find((x) => x.id === id);
				minX = Math.min(minX, e.x);
				if (e.x < 4.99) onWater = true;
			}
			return { minX, onWater };
		}, MAIN_ID);
		expect(r.onWater, `本土のヒルが堀へ出た（最小 x=${r.minX}）`).toBe(false);
		expect(r.minX, '本土のヒルが堀の縁まで寄ってこない').toBe(5);
	});
});

test.describe('D8 毒ヒルの泥田 ③ 主題', () => {
	test('通し：島のヒルを南の岸へ引き付け、北の行で渡ると、追いつかれずに宝箱が開き回復薬が手に入る', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(4, 10, { ps_ladder: '1' }));
		const r = await page.evaluate(({ id }) => {
			const g = window.__game;
			let minHp = g.getState().player.hp, closest = 99, crossed = false;
			const tick = () => {
				g.step(1);
				const p = g.getState().player; minHp = Math.min(minHp, p.hp);
				if (crossed) { const e = g.getEnemies().find((x) => x.id === id); closest = Math.min(closest, Math.hypot(e.x - p.x, e.y - p.y)); }
			};
			const go = (r, c) => { for (let i = 0; i < 120; i++) { const p = g.getState().player; if (Math.abs(p.y - r) < 0.01 && Math.abs(p.x - c) < 0.01) return true;
				g.movePlayer(Math.abs(p.y - r) > 0.01 ? (p.y < r ? 'down' : 'up') : (p.x < c ? 'right' : 'left')); tick(); } return false; };
			// 東の口から西の岸へ → 南の岸 (6,5) に立って島のヒルを南へ引き付ける（実測 25 tick で (6,3) まで来る）
			go(4, 5); go(6, 5);
			for (let i = 0; i < 25; i++) tick();
			const lured = g.getEnemies().find((x) => x.id === id).y;
			// 北の岸 (2,5) へ駆け上がり、堀を渡って宝箱へ
			go(2, 5);
			crossed = true;
			go(2, 3); go(2, 2);
			for (let i = 0; i < 3; i++) { g.movePlayer('left'); tick(); }
			return { lured, minHp, closest, opened: g.getStageState().openedChests, potion: g.getPlayer().subItems.healPotion?.count ?? 0 };
		}, { id: ISLAND_ID });
		expect(r.lured, '前提：南の岸に立っても島のヒルが南へ寄ってこない').toBeGreaterThanOrEqual(5);
		expect(r.opened, '宝箱が開かない').toContain(CHEST);
		expect(r.potion, '回復薬が手に入らない').toBe(1);
		expect(r.closest, `渡ってから宝箱までの間に島のヒルが ${r.closest.toFixed(2)} マスまで寄った＝撒けていない`).toBeGreaterThanOrEqual(1.5);
		expect(r.minHp, '倒れた').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});
});
