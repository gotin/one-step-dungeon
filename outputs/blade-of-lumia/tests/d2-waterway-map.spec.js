// tests/d2-waterway-map.spec.js
// dungeon_2 `3,2`（地図の部屋）「地下水路の向こうの地図」の番人
// （2026-10-11 / PLAN 実行キュー 41 の第3陣 4室目・盤面は `scripts/migrate-d2-3-2-waterway-map.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間の真ん中に床の地図が1つだけ（D1 `3,2` の写しから宝箱を抜いた形）。
//
// 新しい盤面（水は下地 '~'・幅2の L 字の水路で部屋を割る）:
//      1 #..........#   ┐ 北西の通り道（西の口・北の口）
//      2 #..........#   ┘
//      3 #..~~~~~~~~#   ← 水路（北の壁際の帯）
//      4 ...~~~~~~~~#   ← 西の口
//      5 ...~~m.....#   ← 地図＝南東の庭の角（西の口から水の向こうに見える）
//      6 #..~~......#
//      7 #..~~......#   ← 水路（縦の帯）＝南の壁まで
//      8 #..~~......#
//      9 #####..#####   ← 南の口（庭へは `3,3` から上がるしかない）
//   水路に魚群 &×3（水から出られず、水際に立つと噛む）。
//
// 守るものは2つ。
//   ① データ（幾何）：西の口・北の口から地図へは歩いて（はしごでも）届かない・南の口からは届く・取り残しなし・層の到達性。
//   ② 挙動（実機）：西の口から東へ歩いても水際で止まる／ブーメランを水の上へ投げても地図は持ち帰れない（回り道が省けない）／
//      南の口から上がれば地図を拾える／魚群は水際に立つと噛み、水から1マス離れれば噛まない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { TARGET, targetBg, reach, waterOf, WEST_ENTRY, NORTH_ENTRY, SOUTH_ENTRY } from '../scripts/migrate-d2-3-2-waterway-map.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_2';
const ROOM = '3,2';
const stages = map.layers[LAYER].stages;

const P = (k) => k.split(',').map(Number);
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const cellsOf = (t, pred) => {
	const out = [];
	t.forEach((row, r) => row.forEach((ch, c) => { if (pred(ch)) out.push(`${r},${c}`); }));
	return out;
};
// 地図のセルは盤面から引く（移行スクリプトの定数を見ない＝盤面で地図を動かしたら赤くなる）。
const mapCellOf = (t) => cellsOf(t, (ch) => ch === TILE.ITEM_DUNGEON_MAP)[0];

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D2 3,2 地下水路の向こうの地図 ① データ', () => {
	test('盤面・敵は魚群×3（水の上）・脅威度は看板部屋より軽い・地図は1つ・ほかの仕掛けなし・宣言', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		const enemies = cellsOf(t, (ch) => !!ENEMY_META[ch]);
		expect(enemies.map((k) => t[P(k)[0]][P(k)[1]]), '敵が魚群3体でない').toEqual([TILE.FISH_SCHOOL, TILE.FISH_SCHOOL, TILE.FISH_SCHOOL]);
		for (const k of enemies) expect(st.bgTiles[k], `魚群 ${k} が水の上に居ない`).toBe(TILE.WATER);
		const threat = stageThreat(st, ENEMY_META);
		expect(threat).toBeGreaterThan(0);
		expect(threat, '看板部屋 2,1 の 25.0 を超えた').toBeLessThan(25);
		expect(cellsOf(t, (ch) => ch === TILE.ITEM_DUNGEON_MAP).length, '床の地図が1つでない').toBe(1);
		for (const k of ['signData', 'floorItems', 'mapEnters', 'npcData', 'breakableWalls', 'chestContents', 'showConditions']) expect(Object.keys(st[k] ?? {}), `${k} が空でない`).toEqual([]);
		expect(st.links ?? [], 'links が空でない').toEqual([]);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS の宣言').toBe(true);
	});

	test('下地：L 字の水路・地図の台は石畳・ほかの床は砂', () => {
		expect(stages[ROOM].bgTiles).toEqual(targetBg());
		const t = gridOf();
		expect(stages[ROOM].bgTiles[mapCellOf(t)], '地図が石畳の台の上に無い').toBe('o');
	});

	test('水路が部屋を割る：西の口・北の口から地図へは歩いて（はしごでも）届かず、南の口からは届く・取り残しなし（地図は盤面から引く）', () => {
		const t = gridOf();
		const bg = stages[ROOM].bgTiles;
		const m = mapCellOf(t);
		const west = reach(t, bg, WEST_ENTRY);
		const south = reach(t, bg, SOUTH_ENTRY);
		expect(west.has(NORTH_ENTRY), '西の口と北の口が歩いてつながっていない').toBe(true);
		expect(west.has(m), '西の口から地図に歩いて届く＝水路が部屋を割っていない').toBe(false);
		expect(reach(t, bg, WEST_ENTRY, { ladder: true }).has(m), 'はしごで西の口から地図に届く＝水路に幅1の所がある').toBe(false);
		expect(south.has(m), '南の口から地図に届かない').toBe(true);
		const floors = cellsOf(t, (ch) => ch !== TILE.WALL).filter((k) => bg[k] !== TILE.WATER);
		for (const k of floors) expect(west.has(k) || south.has(k), `${k} にどの口からも立てない`).toBe(true);
		// 西の口から地図が水の向こうに見える＝同じ行。
		expect(P(m)[0], '地図が西の口と同じ行に無い（水の向こうに見えない）').toBe(P(WEST_ENTRY)[0]);
	});

	test('対照：地図の行の水を床にすると西の口から地図へ歩いて届く（測定が空虚でない）', () => {
		const t = gridOf();
		const bg = { ...stages[ROOM].bgTiles };
		const [mr] = P(mapCellOf(t));
		for (const k of waterOf(bg)) if (P(k)[0] === mr) bg[k] = TILE.SAND;
		expect(reach(t, bg, WEST_ENTRY).has(mapCellOf(t))).toBe(true);
	});

	test('層の接続：dead-edge 0・徒歩で 15 室（書き換え前と同じ）', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(foot.reachedRooms.size, '徒歩で歩ける部屋数').toBe(15);
		for (const k of ['3,1', '3,2', '2,2', '3,3']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '3', ...extra });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 3);
	await page.keyboard.press('g');   // fromEditor の無敵を切る（被弾を測る）
	await page.evaluate(() => {
		const g = window.__game;
		g.pause();
		// 通る点（セル）を順に歩く。1 tick に半マス。着いたら次の点へ。
		window.__walk = (wp, maxT = 200) => {
			const q = wp.map(([r, c]) => ({ r, c }));
			let i = 0;
			for (; i < maxT && q.length; i++) {
				const pl = g.getPlayer();
				const dy = q[0].r - pl.y, dx = q[0].c - pl.x;
				if (Math.abs(dy) < 0.01 && Math.abs(dx) < 0.01) { q.shift(); continue; }
				g.movePlayer(Math.abs(dx) >= 0.01 ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
				g.step(1);
			}
			return q.length === 0;
		};
		window.__hasMap = () => !!g.getPlayer().dungeonItems?.dungeon_2?.hasMap;
	});
	return errors;
}

test.describe('D2 3,2 地下水路の向こうの地図 ② 実機', () => {
	test('西の口から東へ歩き続けても水際で止まり、地図は拾えない', async ({ page }) => {
		const errors = await boot(page, 5, 0);
		const r = await page.evaluate(() => {
			const g = window.__game;
			// 先に魚群を落とす＝プレイヤーは敵と重なれない∴魚が水の行に居ると、水が歩けても魚に止められて緑になる。
			for (const e of g.getEnemies()) g.dealDamage(e.id, 99);
			g.step(1);
			const fish = g.getEnemies().length;
			let maxX = 0;
			for (let i = 0; i < 40; i++) { g.movePlayer('right'); g.step(1); maxX = Math.max(maxX, g.getPlayer().x); }
			return { fish, maxX, y: g.getPlayer().y, has: window.__hasMap() };
		});
		expect(r.fish, '魚群が残っている＝止めたのが水か魚か分からない').toBe(0);
		expect(r.y, '地図の行を歩いていない').toBe(5);
		expect(r.maxX, '水の上を歩けた').toBeLessThan(2.5);
		expect(r.has, '西の口から地図を拾えた').toBe(false);
		expect(errors).toEqual([]);
	});

	test('西の岸から水の上へブーメランを投げても地図は持ち帰れない（地図の上を飛んで戻る）', async ({ page }) => {
		// 水から1マス離れた (5,1) に立って、入った直後に投げる（歩く間に魚群が水路の地図の行へ寄ると、
		// ブーメランが魚に当たって手前で折り返す＝地図の上まで飛ばない）。
		const errors = await boot(page, 5, 1, { ps_boomerang: '1' });
		const r = await page.evaluate(() => {
			const g = window.__game;
			g.setHeroDir('right'); g.useSubItem();
			let maxX = 0, back = false;
			for (let i = 0; i < 120; i++) {
				g.step(1);
				const pr = g.getProjectiles().filter((x) => x.owner === 'player');
				for (const x of pr) maxX = Math.max(maxX, x.x);
				if (maxX > 0 && !pr.length) { back = true; break; }
			}
			return { maxX, back, has: window.__hasMap(), picked: g.getStageState().pickedKeys };
		});
		expect(r.maxX, 'ブーメランが地図の上まで飛んでいない＝測定が空虚').toBeGreaterThanOrEqual(5);
		expect(r.back, 'ブーメランが戻ってこない').toBe(true);
		expect(r.has, 'ブーメランが地図を持ち帰った＝回り道が省ける').toBe(false);
		expect(r.picked, '地図のセルが拾われた扱いになった').not.toContain('5,5');
		expect(errors).toEqual([]);
	});

	test('南の口から上がれば地図を拾える', async ({ page }) => {
		const errors = await boot(page, 9, 6);
		const r = await page.evaluate(() => {
			const g = window.__game;
			const before = window.__hasMap();
			const arrived = window.__walk([[8, 6], [6, 6], [5, 6], [5, 5]]);
			return { before, arrived, has: window.__hasMap() };
		});
		expect(r.before, '初めから地図を持っている＝測定が空虚').toBe(false);
		expect(r.arrived, '南の口から地図のセルまで歩けない').toBe(true);
		expect(r.has, '地図を拾えない').toBe(true);
		expect(errors).toEqual([]);
	});

	test('魚群は水際に立つと噛み、水から1マス離れれば噛まない', async ({ page }) => {
		const errors = await boot(page, 5, 0);
		const dry = await page.evaluate(() => {
			const g = window.__game;
			window.__walk([[5, 1]]);
			const hp0 = g.getPlayer().hp;
			for (let i = 0; i < 150; i++) g.step(1);
			return { hp0, hp1: g.getPlayer().hp, fish: g.getEnemies().length };
		});
		expect(dry.fish, '魚群が居ない＝測定が空虚').toBe(3);
		expect(dry.hp1, '水から1マス離れているのに噛まれた').toBe(dry.hp0);
		const errors2 = await boot(page, 5, 0);
		const wet = await page.evaluate(() => {
			const g = window.__game;
			window.__walk([[5, 2]]);
			const hp0 = g.getPlayer().hp;
			for (let i = 0; i < 150; i++) g.step(1);
			return { hp0, hp1: g.getPlayer().hp };
		});
		expect(wet.hp1, '水際に立っても噛まれない＝魚群が寄ってこない').toBeLessThan(wet.hp0);
		expect(errors).toEqual([]);
		expect(errors2).toEqual([]);
	});
});
