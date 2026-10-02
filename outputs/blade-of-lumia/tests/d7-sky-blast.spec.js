// tests/d7-sky-blast.spec.js
// dungeon_7 `3,2`「空越しの発破（崩れかけの柱）」の番人
// （2026-10-01 / PLAN 実行キュー 31 の第1陣 5室目・盤面は `scripts/migrate-d7-3-2-sky-blast.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_6 3,2` とバイト一致＝4方向の口がある四角い広間に、地図と森の木・茂みが置いてあるだけ。
//
// 新しい盤面（南東の一角が空へ崩れ落ち、裂け目の中に崩れかけの柱が1本浮く）:
//      1 #.m........#   ← 地図 (1,2)
//      3 #..#....%.B#   ← 宝箱 (3,10)＝ルピー×30（wallBroken で出る）
//      5 ......%%%@..   ← 東の張り出しの先 (5,9)＝爆風が柱に届く唯一の立ち位置
//      7 #.....@%%!%#   ← 崩れかけの柱 (7,9)・西の土手道の端 (7,6)＝3マス＝届かない
//      8 #......@%%%#   ← (8,7)＝√5＝届かない
//   爆風は半径 2 の円（上下左右は2セル先・斜めは (±1,±1)）＝D8 `3,3` で覚えた「1枚挟んだ向こうまで
//   届く」を、水の代わりに空を挟んで使う。
//
// 守るものは2つ。
//   ① データ（幾何）：柱の四方が空／爆風が柱に届く歩ける床は (5,9) だけ／外れの立ち位置は届かない／
//      地図は謎と無関係に拾える／4つの口がつながる／層の到達性は不変。
//   ② 挙動（実機）：地図を拾える／外れの立ち位置の爆弾・矢では柱は崩れず宝箱は開かない／
//      (5,9) の爆弾で柱が崩れ、宝箱でルピー +30。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ITEM_META } from '../shared/items.js';
import { bfsLayer, BLOCKED, LADDER_OVER } from '../scripts/lib/connectivity.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '3,2';
const stages = map.layers[LAYER].stages;
const ROWS = 10, COLS = 12;

const ROOM_ROWS = [
	'#####..#####',
	'#.m........#',
	'#..........#',
	'#..#....%.B#',
	'.......%%...',
	'......%%%...',
	'#..#...%%%%#',
	'#......%%!%#',
	'#.......%%%#',
	'#####..#####',
];
const PILLAR = '7,9';
const SPOT = '5,9';
const DECOYS = ['7,6', '8,7'];
const MAP_CELL = '1,2';
const CHEST = '3,10';
const EXITS = { 北: ['0,5', '0,6'], 南: ['9,5', '9,6'], 西: ['4,0', '5,0'], 東: ['4,11', '5,11'] };
const ALL_EXITS = Object.values(EXITS).flat();

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const at = (t, k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
const nbrs = (k) => {
	const [r, c] = k.split(',').map(Number);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
		.filter(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS).map(([rr, cc]) => `${rr},${cc}`);
};
// from から歩いて立てるセル（空・壁・壊せる壁は不可。宝箱・地図は踏めるタイル）。
function walkable(t, from = ALL_EXITS) {
	const ok = (k) => { const ch = at(t, k); return ch !== undefined && !BLOCKED.has(ch); };
	const seen = new Set(from.filter(ok)), q = [...seen];
	while (q.length) {
		const k = q.shift();
		for (const n of nbrs(k)) if (!seen.has(n) && ok(n)) { seen.add(n); q.push(n); }
	}
	return seen;
}
const dist = (a, b) => {
	const [ar, ac] = a.split(',').map(Number), [br, bc] = b.split(',').map(Number);
	return Math.sqrt((ar - br) ** 2 + (ac - bc) ** 2);
};
// 爆風（中心からの距離 ≤ 半径＝`game/projectile.js` blastCells）が柱に届く、歩いて立てる床。
const blastSpots = (t) => [...walkable(t)].filter((k) => dist(k, PILLAR) <= ITEM_META.bomb.aoeRadius).sort();

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D7 3,2 空越しの発破 ① データ', () => {
	const t = gridOf();
	const walk = walkable(t);

	test('盤面・宝箱・封印・壊せる壁（敵・植生・看板・門が無い）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(ROOM_ROWS);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } });
		expect(st.showConditions).toEqual({ [CHEST]: { trigger: 'wallBroken', wallId: PILLAR } });
		expect(st.breakableWalls).toEqual({ [PILLAR]: { breakDef: 1 } });
		expect(ITEM_META.bomb.breakPower, '爆弾で柱が壊れない').toBeGreaterThanOrEqual(1);
		expect(st.links ?? [], 'links は空').toEqual([]);
		expect(Object.keys(st.signData ?? {}), '看板データは空').toEqual([]);
		expect(Object.keys(st.npcData ?? {}), 'npcData は空').toEqual([]);
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.STONE, TILE.SIGN, TILE.GATE, TILE.SWITCH, TILE.BUTTON]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test('柱の四方が空・爆風が柱に届く歩ける床は (5,9) の1マスだけ', () => {
		expect(ITEM_META.bomb.aoeRadius, '前提：爆弾の半径（立ち位置はこの値で設計した）').toBe(2);
		expect(nbrs(PILLAR).map((k) => at(t, k)), '柱の隣に空でないセルがある').toEqual(Array(4).fill(TILE.SKY));
		expect(blastSpots(t), '柱に爆風が届く立ち位置').toEqual([SPOT]);
		for (const d of DECOYS) {
			expect(walk.has(d), `外れの立ち位置 (${d}) に立てない`).toBe(true);
			expect(dist(d, PILLAR), `外れの立ち位置 (${d}) から柱に届く`).toBeGreaterThan(ITEM_META.bomb.aoeRadius);
		}
	});

	test('対照：空の1枚が立ち位置を絞っている（測定が空虚でない）', () => {
		// 柱の真上の空 (6,9) を床にすると、柱の隣に立てる＝届く床が増える
		const fill = gridOf(); fill[6][9] = TILE.FLOOR;
		expect(blastSpots(fill).length, '空 (6,9) を床にしても届く床が増えない').toBeGreaterThan(1);
		// 立ち位置を壁にすると（潰すのは '#'）届く床が0
		const noSpot = gridOf(); noSpot[5][9] = TILE.WALL;
		expect(blastSpots(noSpot), '立ち位置を潰しても届く床が残る').toEqual([]);
	});

	test('4つの口がつながる・地図と宝箱に歩いて届く・はしごで空を渡れない・層の接続は不変', () => {
		for (const [from, cells] of Object.entries(EXITS)) {
			const w = walkable(t, [cells[0]]);
			for (const k of ALL_EXITS) expect(w.has(k), `${from}の口から (${k}) へ歩けない`).toBe(true);
		}
		expect(walk.has(MAP_CELL), '地図に歩いて届かない').toBe(true);
		expect(walk.has(CHEST), '宝箱に歩いて届かない').toBe(true);
		expect(LADDER_OVER.has(TILE.SKY), 'はしごが空を渡れるようになった').toBe(false);
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '3,2 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_bomb: '1', ps_bow: '1', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
async function boot(page, row, col, extra) {
	await page.goto(previewUrl(row, col, extra));
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
async function walk(page, dir, tiles) {
	for (let i = 0; i < tiles * 2; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
	}
}
const pos = (page) => page.evaluate(() => {
	const { x, y } = window.__game.getState().player;
	return `${y},${x}`;
});
const ss = (page) => page.evaluate(() => window.__game.getStageState());
const broken = async (page) => [...((await ss(page)).brokenWalls ?? [])].sort();
const rupees = (page) => page.evaluate(() => window.__game.getState().player.rupees);
// 足元に爆弾を置いて爆発まで待つ（導火線 2000ms＝TICK 120ms × 17 より長く回す）
async function bomb(page) {
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bomb'; });
	await step(page, 2);
	await page.evaluate(() => window.__game.useSubItem());
	await step(page, 30);
}
async function shoot(page, dir) {
	await page.evaluate((d) => {
		window.__game.setHeroDir(d);
		window.__game.getPlayer().activeSubItem = 'bow';
	}, dir);
	await step(page, 1);
	await page.evaluate(() => window.__game.useSubItem());
	// 矢が飛んでいなければ「崩れない」は空虚＝先に飛んだことを確かめる
	const flying = await page.evaluate(() => window.__game.getProjectiles()
		.some((p) => p.type === 'arrow' && p.owner === 'player'));
	expect(flying, '矢が飛ばない').toBe(true);
	await step(page, 30);
}

test.describe('D7 3,2 空越しの発破 ② 実機', () => {
	test('地図は謎を解かなくても拾える', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, 1, 3);
		await walk(page, 'left', 1);
		expect(await pos(page)).toBe(MAP_CELL);
		const items = await page.evaluate((l) => window.__game.getPlayer().dungeonItems?.[l], LAYER);
		expect(items?.hasMap, '地図を拾えない').toBe(true);
		expect(errors).toEqual([]);
	});

	test('外れの立ち位置の爆弾・矢では柱は崩れず、宝箱は開かない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		// 西の土手道の端 (7,6)＝柱と同じ行・3マス先
		await boot(page, 7, 6);
		await walk(page, 'right', 1);
		expect(await pos(page), '土手道の端から空へ踏み出せた').toBe('7,6');
		await bomb(page);
		expect(await broken(page), '(7,6) の爆弾で柱が崩れた').toEqual([]);
		// 矢は '!' で止まる＝崩さない
		await shoot(page, 'right');
		expect(await broken(page), '矢で柱が崩れた').toEqual([]);
		// (8,7)＝斜め (1,2) 先＝√5
		await boot(page, 8, 7);
		await bomb(page);
		expect(await broken(page), '(8,7) の爆弾で柱が崩れた').toEqual([]);
		expect((await ss(page)).conditionsMet ?? [], '柱が残ったまま封印が解けた').not.toContain(CHEST);
		// 封印中の宝箱に乗っても開かない
		await boot(page, 3, 9);
		const r0 = await rupees(page);
		await walk(page, 'right', 1);
		expect(await pos(page), '宝箱のセルに立てない').toBe(CHEST);
		expect((await ss(page)).openedChests ?? [], '封印中の宝箱が開いた').not.toContain(CHEST);
		expect(await rupees(page), '封印中にルピーが増えた').toBe(r0);
		expect(errors).toEqual([]);
	});

	test('通し：東の張り出しの先 (5,9) の爆弾で柱が崩れ、宝箱でルピー +30', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, 5, 9);
		await walk(page, 'down', 1);
		expect(await pos(page), '張り出しの先から空へ踏み出せた').toBe(SPOT);
		await bomb(page);
		expect(await broken(page), '(5,9) の爆弾で空越しの柱が崩れない').toEqual([PILLAR]);
		expect((await ss(page)).conditionsMet, '柱が崩れて封印が解けない').toContain(CHEST);
		const r0 = await rupees(page);
		await walk(page, 'up', 2);
		await walk(page, 'right', 1);
		expect(await pos(page)).toBe(CHEST);
		expect((await ss(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await rupees(page), 'ルピーが 30 増えない').toBe(r0 + 30);
		expect(errors).toEqual([]);
	});
});
