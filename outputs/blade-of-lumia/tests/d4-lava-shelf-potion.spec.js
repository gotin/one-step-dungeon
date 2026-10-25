// tests/d4-lava-shelf-potion.spec.js
// dungeon_4 `4,1`「溶岩の川向こうの薬棚」の番人
// （2026-10-25 / PLAN 実行キュー 92 の6室目・盤面は `scripts/migrate-d4-4-1-lava-shelf-potion.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   西の口だけが開いた行き止まりの真ん中に回復薬（小）が1つ落ちているだけ・敵なし。
//
// 新しい盤面:
//      1 #....llllll#
//      2 #.....llll7#   ← 東の壁際の棚 (2,10) に回復薬。岸の出っ張り (2,5) から 5 マス・岸の奥 (2,4) から 6 マス
//      3 #.θ..llllll#
//      4〜5 西の口（岸は列5 まで出ている）
//      7 #..θ..lllll#   ← 骸骨剣士 θ×2 が岸をさまよう
//   棚へは歩いて行けない＝ブーメランで持ち帰る（`game/player.js collectFieldItem` が回復薬を運べるようにした）。
//
// 守るものは3つ。
//   ① データ：盤面・回復薬は棚の1つだけ・棚へは歩いて届かない・5 マス以内の投げ場は (2,5) だけ
//      （対照＝出っ張りを溶岩にすると投げ場が無くなる）・敵と脅威度・層の接続は不変。
//   ② 挙動（実機）：溶岩に踏み込めない／満杯なら薬は棚に残る（運ばない）／骸骨は岸の勇者へ寄ってくる。
//   ③ 主題（実機）：(2,5) から投げると薬を持ち帰る／(2,4) からは届かない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, ROWS, COLS, TARGET, SHELF, THROW, TOO_FAR, SKELETONS, OPENING, WOOD_FETCH,
	reach, linesToShelf,
} from '../scripts/migrate-d4-4-1-lava-shelf-potion.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));
const at = (k) => { const [r, c] = k.split(',').map(Number); return grid[r][c]; };

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D4 溶岩の川向こうの薬棚 ① データ', () => {
	test('盤面・回復薬（小）は棚の1つだけ・宝箱や床の拾い物の記述は無い', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(grid.flat().filter((ch) => ch === TILE.ITEM_HEAL_POTION).length, '回復薬が1つでない').toBe(1);
		expect(at(SHELF)).toBe(TILE.ITEM_HEAL_POTION);
		expect(grid.flat().includes(TILE.CHEST), '宝箱がある').toBe(false);
		expect(room.floorItems ?? {}, '床の拾い物の記述が残っている').toEqual({});
		expect(room.showConditions ?? {}, '出現条件が付いた').toEqual({});
	});

	test('棚へは歩いて届かず、隣は溶岩と壁だけ・取り残しなし', () => {
		const walk = reach(grid, OPENING);
		expect(walk.has(SHELF), '棚へ歩いて届く').toBe(false);
		const [r, c] = SHELF.split(',').map(Number);
		const sides = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => grid[a]?.[b]);
		expect(sides.every((ch) => ch === TILE.WALL || ch === TILE.LAVA), `棚の隣に床がある（${sides.join('')}）`).toBe(true);
		const stranded = [];
		for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) {
			const k = `${rr},${cc}`;
			if (!HARD_BLOCKED.has(grid[rr][cc]) && k !== SHELF && !walk.has(k)) stranded.push(k);
		}
		expect(stranded, '取り残された床がある').toEqual([]);
	});

	test(`棚へ ${WOOD_FETCH} マス以内で投げられる岸は ${THROW} だけ／${TOO_FAR} は外／対照：出っ張りを溶岩にすると投げ場が無い`, () => {
		const lines = linesToShelf(grid, reach(grid, OPENING));
		expect(lines.filter((l) => l.dist <= WOOD_FETCH).map((l) => l.from)).toEqual([THROW]);
		expect(lines.find((l) => l.from === TOO_FAR)?.dist).toBe(WOOD_FETCH + 1);
		const lava = grid.map((row, r) => row.map((x, c) => (`${r},${c}` === THROW ? TILE.LAVA : x)));
		expect(linesToShelf(lava, reach(lava, OPENING)).filter((l) => l.dist <= WOOD_FETCH), '対照：出っ張りを消しても投げ場が残る＝測定が空虚').toEqual([]);
	});

	test('敵は岸の θ×2・脅威度は看板部屋より軽い・宣言あり・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual(SKELETONS.map((k) => `${TILE.SKELETON}@${k}`));
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
		ps_weapon: '1', ps_boomerang: '1', ps_hearts: '8', ...extra,   // D4 の想定（profilesAt の min＝ハート 8）
	});
	return `${GAME}?${p.toString()}`;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
async function boot(page, url) {
	await page.goto(url);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	await step(page, 2);
}
const pos = (page) => page.evaluate(() => { const { x, y } = window.__game.getState().player; return `${y},${x}`; });
const potions = (page) => page.evaluate(() => window.__game.getPlayer().subItems.healPotion?.count ?? 0);
const shelfTaken = (page) => page.evaluate((k) => window.__game.getStageState().pickedKeys.includes(k), SHELF);
// 東へ1回投げ、戻って消えるまで進める。木のブーメラン（speed 2.0・maxRange 3）は 5 マス先で折り返して
// 10 tick ほどで手元に戻る∴上限 40 tick。
async function throwEast(page) {
	return page.evaluate(() => {
		const g = window.__game;
		g.setHeroDir('right'); g.useSubItem();
		let flew = false;
		for (let i = 0; i < 40; i++) {
			g.step(1);
			const p = g.getProjectiles().some((x) => x.owner === 'player' && x.type === 'boomerang');
			if (p) flew = true;
			else if (flew) break;
		}
		return { flew, item: g.getState().player.activeSubItem };
	});
}

test.describe('D4 溶岩の川向こうの薬棚 ② 実機', () => {
	test('溶岩に踏み込めない（出っ張りから東へ歩いても岸に留まる）', async ({ page }) => {
		await boot(page, previewUrl(2, 5));
		for (let i = 0; i < 6; i++) { await page.evaluate(() => window.__game.movePlayer('right')); await step(page, 1); }
		expect(await pos(page), '溶岩の上へ歩けた').toBe(THROW);
	});

	test('満杯（回復薬を1本持っている）なら、ブーメランが通っても薬は棚に残る', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(2, 5));
		await page.evaluate(() => { window.__game.getPlayer().subItems.healPotion = { count: 1 }; });
		// 飛んでいる間も毎 tick 見る＝「拾って運び、手元で満杯と分かって棚へ戻す」でも終わりの姿は同じになる
		// （apply の戻し）∴終わりだけ見ると満杯の門を外しても緑のまま（歯の確認で実際にそうなった）。
		const r = await page.evaluate((shelf) => {
			const g = window.__game;
			g.setHeroDir('right'); g.useSubItem();
			let flew = false, carried = false;
			for (let i = 0; i < 40; i++) {
				g.step(1);
				if (g.getStageState().pickedKeys.includes(shelf)) carried = true;
				const p = g.getProjectiles().some((x) => x.owner === 'player' && x.type === 'boomerang');
				if (p) flew = true;
				else if (flew) break;
			}
			return { flew, carried };
		}, SHELF);
		expect(r.flew, '前提：ブーメランが飛ばない').toBe(true);
		expect(r.carried, '満杯なのにブーメランが薬を棚から持ち上げた').toBe(false);
		expect(await potions(page), '満杯なのに回復薬が増えた').toBe(1);
		expect(await shelfTaken(page), '満杯なのに棚の薬が消えた').toBe(false);
		expect(errors).toEqual([]);
	});

	test('骸骨は岸の勇者へ寄ってくる（西の口に立つと 60 tick 以内に 2 マスまで来る）', async ({ page }) => {
		await boot(page, previewUrl(4, 1));
		const near = await page.evaluate(() => {
			const g = window.__game; let best = 99;
			for (let i = 0; i < 60; i++) {
				g.step(1);
				const { x, y } = g.getState().player;
				for (const e of g.getEnemies()) best = Math.min(best, Math.hypot(e.x - x, e.y - y));
			}
			return best;
		});
		expect(near, '骸骨が寄ってこない＝岸の戦いが起きない').toBeLessThanOrEqual(2);
	});
});

test.describe('D4 溶岩の川向こうの薬棚 ③ 主題', () => {
	test(`出っ張り ${THROW} から東へ投げると、ブーメランが棚の回復薬を持ち帰る`, async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(2, 5));
		expect(await potions(page), '前提：最初から回復薬を持っている').toBe(0);
		const r = await throwEast(page);
		expect(r.item, '前提：ブーメランを構えていない').toBe('boomerang');
		expect(r.flew).toBe(true);
		expect(await shelfTaken(page), 'ブーメランが棚の薬を拾わない').toBe(true);
		expect(await potions(page), '持ち帰った回復薬が手に入らない').toBe(1);
		expect(errors).toEqual([]);
	});

	test(`対照：岸の奥 ${TOO_FAR} からは 6 マス＝ブーメランが手前で折り返し、薬は棚に残る`, async ({ page }) => {
		await boot(page, previewUrl(2, 4));
		const r = await throwEast(page);
		expect(r.flew, '前提：ブーメランが飛ばない').toBe(true);
		expect(await shelfTaken(page), '6 マス先の棚の薬を拾った＝出っ張りまで出る意味が無い').toBe(false);
		expect(await potions(page)).toBe(0);
	});
});
