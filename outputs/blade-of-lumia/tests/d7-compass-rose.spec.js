// tests/d7-compass-rose.spec.js
// dungeon_7 `3,1`「羅針の間（四方の灯）」の番人
// （2026-10-01 / PLAN 実行キュー 31 の第1陣 4室目・盤面は `scripts/migrate-d7-3-1-compass-rose.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_6 3,1` の写し＝4方向の口がある四角い広間に、コンパスと森の木・茂みが置いてあるだけ。
//
// 新しい盤面（広間の真ん中が羅針盤の形に空へ抜け落ちた吹き抜け）:
//      1 #n...@.....#   ← コンパス (1,1)・北の座 (1,5)
//      2 #...%H%....#   ← 北の灯 (2,5)＝唯一ロウソクが届く
//      4 .@%H%H%H%@..   ← 西の座 (4,1)・西の灯 (4,3)・中心 (4,5)・東の灯 (4,7)・東の座 (4,9)
//      6 #...%H%....#   ← 南の灯 (6,5)
//      8 #.........B#   ← 宝箱 (8,10)＝ルピー×50（torchesLit で出る）
//   北の座でロウソク → 北の座から下へブーメラン（中心・南が灯る）→ 西の座から右・東の座から左へ
//   投げる＝中心で炎を拾い、**復路で**西・東の灯を点ける。
//
// 守るものは3つ。
//   ① データ（幾何と火の受け渡し）：北の灯だけが縁に接し、ほかの4枚は四方が空／
//      どの段のブーメランでも解がある・ロウソクだけ／ブーメランだけでは解けない／
//      コンパスは謎と無関係に拾える／4つの口がつながる／層の到達性は不変。
//   ② エンジンの前提：コンパスの拾得は showConditions で封じられない（だから報酬は宝箱）。
//   ③ 挙動（実機）：コンパスを拾える／火元なしでは何も灯らず宝箱は開かない／
//      通しで5枚が灯り、宝箱でルピー +50／銀のブーメランは2投で済む。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { MOVE_STEP } from '../game/constants.js';
import { bfsLayer, BLOCKED, LADDER_OVER } from '../scripts/lib/connectivity.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const PLAYER_PATH = fileURLToPath(new URL('../game/player.js', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '3,1';
const stages = map.layers[LAYER].stages;
const ROWS = 10, COLS = 12;

const ROOM_ROWS = [
	'#####..#####',
	'#n.........#',
	'#...%H%....#',
	'#..%%%%%...#',
	'..%H%H%H%...',
	'...%%%%%....',
	'#...%H%....#',
	'#....%.....#',
	'#.........B#',
	'#####..#####',
];
const N = '2,5', C = '4,5', S = '6,5', W = '4,3', E = '4,7';
const SEAT_N = '1,5';
const COMPASS = '1,1';
const CHEST = '8,10';
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
// from から歩いて立てるセル（空・壁・かがり火は不可。宝箱・コンパスは踏めるタイル）。
function walkable(t, from = ALL_EXITS) {
	const ok = (k) => { const ch = at(t, k); return ch !== undefined && !BLOCKED.has(ch); };
	const seen = new Set(from.filter(ok)), q = [...seen];
	while (q.length) {
		const k = q.shift();
		for (const n of nbrs(k)) if (!seen.has(n) && ok(n)) { seen.add(n); q.push(n); }
	}
	return seen;
}
// ブーメランの実効の届き＝`migrate-d7-3-0-boomerang-isles.mjs` reachOf と同じ式（一周目の速度）。
function reachOf(tier) {
	const step = tier.speed * MOVE_STEP;
	let p = 0.5;
	while (p < tier.maxRange) p += step;
	const travel = p + step;
	return { neg: Math.ceil(travel - 0.5), pos: Math.floor(travel + 0.5) };
}
const DIR = { 上: [-1, 0], 下: [1, 0], 左: [0, -1], 右: [0, 1] };
// `collectAlongBoomerang` と同じ規則で1投を測る。'#' で止まって同じ道を戻る（往路・復路とも受け渡し）。
// outOnly=true は往路だけで測る対照（復路で点けていることの証明用）。
function throwFrom(t, k, dir, reach, lit, { outOnly = false } = {}) {
	const [r, c] = k.split(',').map(Number);
	const [dr, dc] = DIR[dir];
	const n = (dir === '上' || dir === '左') ? reach.neg : reach.pos;
	const path = [];
	for (let i = 1; i <= n; i++) {
		const kk = `${r + dr * i},${c + dc * i}`;
		const ch = at(t, kk);
		if (ch === undefined) break;
		path.push(kk);
		if (ch === TILE.WALL) break;
	}
	const out = new Set(lit);
	let flaming = false;
	for (const kk of outOnly ? path : [...path, ...[...path].reverse()]) {
		if (at(t, kk) !== TILE.TORCH) continue;
		if (out.has(kk)) flaming = true;
		else if (flaming) out.add(kk);
	}
	return out;
}
// 点いたかがり火の集合を状態に総当たり。手＝隣の火にロウソク／立てる床から4方向へブーメラン。
function relay(t, reach, { candle = true, boomerang = true } = {}) {
	const torches = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === TILE.TORCH) torches.push(`${r},${c}`);
	const stand = [...walkable(t)];
	const key = (s) => [...s].sort().join('|');
	const seen = new Map([[key(new Set()), null]]);
	const q = [new Set()];
	while (q.length) {
		const s = q.shift();
		if (torches.length && torches.every((x) => s.has(x))) {
			const steps = []; let k = key(s);
			while (seen.get(k)) { const [pk, mv] = seen.get(k); steps.unshift(mv); k = pk; }
			return steps;
		}
		const moves = [];
		for (const k of stand) {
			if (candle) for (const n of nbrs(k)) if (at(t, n) === TILE.TORCH && !s.has(n)) moves.push([new Set([...s, n]), `ロウソク ${k}→${n}`]);
			if (boomerang) for (const d of Object.keys(DIR)) {
				const n = throwFrom(t, k, d, reach, s);
				if (n.size > s.size) moves.push([n, `ブーメラン ${k}→${d}`]);
			}
		}
		for (const [n, mv] of moves) { const k = key(n); if (!seen.has(k)) { seen.set(k, [key(s), mv]); q.push(n); } }
	}
	return null;
}

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D7 3,1 羅針の間 ① データ', () => {
	const t = gridOf();
	const walk = walkable(t);

	test('盤面・宝箱・封印の配線（敵・植生・看板・門が無い）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(ROOM_ROWS);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 50, name: 'ルピー×50' } });
		expect(st.showConditions).toEqual({ [CHEST]: { trigger: 'torchesLit' } });
		expect(st.links ?? [], 'links は空').toEqual([]);
		expect(st.initLitTorches ?? [], '最初から点いている火は無い（火元はロウソク）').toEqual([]);
		expect(Object.keys(st.signData ?? {}), '看板データは空').toEqual([]);
		expect(Object.keys(st.npcData ?? {}), 'npcData は空').toEqual([]);
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.STONE, TILE.SIGN, TILE.GATE, TILE.SWITCH, TILE.BUTTON]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test('北の灯だけが北の座に接し、ほかの4枚は四方が空', () => {
		expect(nbrs(N).filter((k) => walk.has(k)), `北の灯 (${N}) の隣の床`).toEqual([SEAT_N]);
		for (const k of [C, S, W, E]) {
			expect(nbrs(k).filter((x) => walk.has(x)), `灯 (${k}) の隣に立てる床がある＝ロウソクで直に点く`).toEqual([]);
			expect(nbrs(k).every((x) => at(t, x) === TILE.SKY || at(t, x) === TILE.TORCH), `灯 (${k}) の四方が空でない`).toBe(true);
		}
	});

	test('4つの口がつながる・コンパスと宝箱に歩いて届く・はしごで空を渡れない', () => {
		for (const [from, cells] of Object.entries(EXITS)) {
			const w = walkable(t, [cells[0]]);
			for (const k of ALL_EXITS) expect(w.has(k), `${from}の口から (${k}) へ歩けない`).toBe(true);
		}
		expect(walk.has(COMPASS), 'コンパスに歩いて届かない').toBe(true);
		expect(walk.has(CHEST), '宝箱に歩いて届かない').toBe(true);
		expect(LADDER_OVER.has(TILE.SKY), 'はしごが空を渡れるようになった').toBe(false);
	});

	test('どの段のブーメランでも解がある・ロウソクだけ／ブーメランだけでは解けない', () => {
		for (const tier of BOOMERANG_TIERS) {
			const reach = reachOf(tier);
			const sol = relay(t, reach);
			expect(sol, `${tier.name}＋ロウソクで解けない`).not.toBeNull();
			expect(sol[0], `${tier.name}の初手がロウソクでない`).toBe(`ロウソク ${SEAT_N}→${N}`);
			expect(relay(t, reach, { candle: false }), `${tier.name}だけで解けた`).toBeNull();
		}
		const wood = relay(t, reachOf(BOOMERANG_TIERS[0]));
		expect(wood.length, `木のブーメランの解の手数（${wood.join(' → ')}）`).toBe(4);
		expect(relay(t, reachOf(BOOMERANG_TIERS[0]), { boomerang: false }), 'ロウソクだけで解けた').toBeNull();
	});

	test('対照：空の隔離と火の受け渡しが本物（測定が空虚でない）', () => {
		const wood = reachOf(BOOMERANG_TIERS[0]);
		// 空を全部床にするとロウソクだけで解ける＝空の隔離が効いている
		const open = gridOf().map((row) => row.map((ch) => (ch === TILE.SKY ? TILE.FLOOR : ch)));
		expect(relay(open, wood, { boomerang: false }), '空を床にしてもロウソクだけで解けない').not.toBeNull();
		// 北の灯を壁にすると（潰すのは '#'）火元が無い＝どの道具でも点かない
		const noN = gridOf(); noN[2][5] = TILE.WALL;
		expect(relay(noN, wood), '北の灯が無くても解けた').toBeNull();
		// 西の座からの投げは往路だけでは西の灯を点けない＝点くのは復路
		const lit = new Set([N, C, S]);
		expect(throwFrom(t, '4,1', '右', wood, lit).has(W), '西の座から往復で西の灯が点かない').toBe(true);
		expect(throwFrom(t, '4,1', '右', wood, lit, { outOnly: true }).has(W), '往路で西の灯が点く').toBe(false);
	});

	test('層の接続は不変', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '3,1 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
	});
});

// ── ② エンジンの前提 ─────────────────────────────────────────────────
test('D7 3,1 羅針の間 ② エンジン：コンパスの拾得は封印判定を通らない（報酬を宝箱にした理由）', () => {
	const src = readFileSync(PLAYER_PATH, 'utf8');
	const body = src.slice(src.indexOf('function pickDungeonItem('), src.indexOf('function pickDungeonItem(') + 600);
	// コンパス・地図を showConditions で隠すと「見えないのに拾える」になる。拾得側に封印判定が
	// 足されたらこの部屋の作りを見直してよい（その時はこの番人を外す）。
	expect(body.includes('showConditions'), 'pickDungeonItem が showConditions を見るようになった').toBe(false);
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_boomerang: '1', ps_candle: '1', ...extra,
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
const lit = async (page) => [...(await ss(page)).litTorches].sort();
const rupees = (page) => page.evaluate(() => window.__game.getState().player.rupees);
async function candle(page, dir) {
	await page.evaluate((d) => {
		window.__game.setHeroDir(d);
		window.__game.getPlayer().activeSubItem = 'candle';
	}, dir);
	await step(page, 1);
	await page.evaluate(() => window.__game.useSubItem());
	await step(page, 2);
}
// 投げてから戻り切るまで進める。watch の灯が灯った瞬間に、ブーメランが復路にいたかを記録する。
async function throwBoomerang(page, dir, watch = null) {
	await page.evaluate((d) => {
		window.__game.setHeroDir(d);
		window.__game.getPlayer().activeSubItem = 'boomerang';
	}, dir);
	await step(page, 1);
	await page.evaluate(() => window.__game.useSubItem());
	const probe = () => page.evaluate((w) => {
		const b = window.__game.getProjectiles().find((p) => p.type === 'boomerang' && p.owner === 'player');
		return { flying: !!b, returning: !!b?.returning, watchLit: !!w && window.__game.getStageState().litTorches.includes(w) };
	}, watch);
	let s = await probe();
	expect(s.flying, 'ブーメランが飛ばない').toBe(true);
	let litWhileReturning = null;
	for (let i = 0; i < 200 && s.flying; i++) {
		await step(page, 1);
		s = await probe();
		if (s.watchLit && litWhileReturning === null) litWhileReturning = s.returning;
	}
	expect(s.flying, 'ブーメランが戻らない').toBe(false);
	return { litWhileReturning };
}
// 北の座 (1,5) → 西の座 (4,1)：北の縁を西へ → 西の縁を南へ。
async function northToWest(page) {
	await walk(page, 'left', 3);
	await walk(page, 'down', 2);
	await walk(page, 'left', 1);
	await walk(page, 'down', 1);
	expect(await pos(page), '西の座 (4,1) へ回れない').toBe('4,1');
}
// 西の座 (4,1) → 東の座 (4,9)：西の縁を北へ → 北の縁を東へ → 東の縁を南へ。
async function westToEast(page) {
	await walk(page, 'up', 1);
	await walk(page, 'right', 1);
	await walk(page, 'up', 2);
	await walk(page, 'right', 7);
	await walk(page, 'down', 3);
	expect(await pos(page), '東の座 (4,9) へ回れない').toBe('4,9');
}

test.describe('D7 3,1 羅針の間 ③ 実機', () => {
	test('コンパスは謎を解かなくても拾える', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, 1, 3);
		await walk(page, 'left', 2);
		expect(await pos(page)).toBe(COMPASS);
		const items = await page.evaluate((l) => window.__game.getPlayer().dungeonItems?.[l], LAYER);
		expect(items?.hasCompass, 'コンパスを拾えない').toBe(true);
		expect(errors).toEqual([]);
	});

	test('空の上は歩けず、火元なしでは何も灯らず、宝箱は開かない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, 4, 1);
		await walk(page, 'right', 2);
		expect(await pos(page), '西の座から空へ踏み出せた').toBe('4,1');
		// ブーメランだけ＝火元が無い∴どの座から投げても何も点かない
		await throwBoomerang(page, 'right');
		expect(await lit(page), '西の座から火元なしで火が点いた').toEqual([]);
		await boot(page, 1, 5);
		await throwBoomerang(page, 'down');
		expect(await lit(page), 'ロウソク無しで火が点いた').toEqual([]);
		// ロウソクで北の灯だけ点けても、封印は解けない
		await candle(page, 'down');
		expect(await lit(page), '北の座から北の灯が点かない').toEqual([N]);
		await boot(page, 7, 10);
		const r0 = await rupees(page);
		await walk(page, 'down', 1);
		expect(await pos(page), '宝箱のセルに立てない').toBe(CHEST);
		expect((await ss(page)).openedChests ?? [], '封印中の宝箱が開いた').not.toContain(CHEST);
		expect(await rupees(page), '封印中にルピーが増えた').toBe(r0);
		expect(errors).toEqual([]);
	});

	test('通し（木）：ロウソク→北から下→西から右→東から左＝5枚が灯り、宝箱でルピー +50', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, 1, 5);
		expect(await page.evaluate(() => window.__game.getState().player.boomerangTier)).toBe(0);
		await candle(page, 'down');
		expect(await lit(page)).toEqual([N]);
		await throwBoomerang(page, 'down');
		expect(await lit(page), '北から下へ投げて中心と南が灯らない').toEqual([N, C, S].sort());
		await northToWest(page);
		const west = await throwBoomerang(page, 'right', W);
		expect(await lit(page), '西の灯が灯らない').toContain(W);
		expect(west.litWhileReturning, '西の灯が往路で灯った（復路で点く設計のはず）').toBe(true);
		expect((await ss(page)).conditionsMet ?? [], '4枚で封印が解けた').not.toContain(CHEST);
		await westToEast(page);
		const east = await throwBoomerang(page, 'left', E);
		expect(await lit(page), '5枚が灯らない').toEqual([N, C, S, W, E].sort());
		expect(east.litWhileReturning, '東の灯が往路で灯った（復路で点く設計のはず）').toBe(true);
		expect((await ss(page)).conditionsMet, '全点灯で封印が解けない').toContain(CHEST);
		const r0 = await rupees(page);
		await walk(page, 'down', 1);
		await walk(page, 'right', 1);
		await walk(page, 'down', 3);
		expect(await pos(page)).toBe(CHEST);
		expect((await ss(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await rupees(page), 'ルピーが 50 増えない').toBe(r0 + 50);
		expect(errors).toEqual([]);
	});

	test('銀のブーメランは届きが長い＝北から下・西から右の2投で5枚が灯る', async ({ page }) => {
		await boot(page, 1, 5, { ps_silverboomerang: '1' });
		expect(await page.evaluate(() => window.__game.getState().player.boomerangTier)).toBe(1);
		await candle(page, 'down');
		await throwBoomerang(page, 'down');
		expect(await lit(page), '銀で北から下へ投げて経線が灯らない').toEqual([N, C, S].sort());
		await northToWest(page);
		await throwBoomerang(page, 'right');
		expect(await lit(page), '銀で西から右へ投げて緯線が灯らない').toEqual([N, C, S, W, E].sort());
		expect((await ss(page)).conditionsMet, '銀の通しで封印が解けない').toContain(CHEST);
	});
});
