// tests/d4-lava-relay.spec.js
// dungeon_4 `3,3`「溶岩越しの灯火」の番人
// （2026-09-28 / PLAN 実行キュー 34 の3室目・盤面は `scripts/migrate-d4-3-3-lava-relay.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   石 *(3,3)・ボタン S(3,7)・門 T(1,9)・宝箱 B(2,9) の部屋で、宝箱は (2,8)(2,10)(3,9) から
//   素で歩いて開けられた＝石もボタンも門も何も守っていない飾り。
//
// 新しい盤面（南半分が溶岩の池）:
//      6 #.lll.lllll#   ← 突堤 (6,5)
//      7 #.lHlH#llll#   ← 西の岸 (7,1)・奥の火 H(7,3)・手前の火 H(7,5)・柱 (7,6)
//      8 #Blllllllll#   ← 宝箱 B(8,1)＝ルピー×20（torchesLit で出る）
//   突堤からロウソクで手前の火を点け、西の岸から右へブーメランを投げる＝往路で奥の火を素通りし、
//   手前の火で炎を拾い、**復路で奥の火を点ける**。
//
// 守るものは3つ。
//   ① データ（幾何と火の受け渡し）：奥の火の隣に立てる床が無い／手前の火は突堤からだけ／
//      解は2手・ロウソクだけ／ブーメランだけでは解けない・奥を点ける座は (7,1)→右 だけ／
//      はしごで溶岩を渡れない／層の到達性は不変。
//   ② エンジンの前提：ブーメランの炎の受け渡しは往路・復路の両方で走る／溶岩ははしごで渡れない。
//   ③ 挙動（実機）：溶岩の上は歩けない／ロウソクだけでは封印が解けない（宝箱は開かない）／
//      ロウソク→ブーメランの通しで奥の火が**復路で**灯り、宝箱でルピー +20。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { MOVE_STEP } from '../game/constants.js';
import { bfsLayer, HARD_BLOCKED, LADDER_OVER } from '../scripts/lib/connectivity.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const PASSABLE_PATH = fileURLToPath(new URL('../game/passable.js', import.meta.url));
const PROJECTILE_PATH = fileURLToPath(new URL('../game/projectile.js', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_4';
const ROOM = '3,3';
const stages = map.layers[LAYER].stages;
const ROWS = 10, COLS = 12;

const ROOM_ROWS = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'............',
	'............',
	'#.lll.lllll#',
	'#.lHlH#llll#',
	'#Blllllllll#',
	'############',
];
const FAR = '7,3';
const NEAR = '7,5';
const PIER = '6,5';
const SHORE = '7,1';
const CHEST = '8,1';
const OPENINGS = ['0,5', '0,6', '4,0', '5,0', '4,11', '5,11'];

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const at = (t, k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
const nbrs = (k) => {
	const [r, c] = k.split(',').map(Number);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
		.filter(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS).map(([rr, cc]) => `${rr},${cc}`);
};
// 口から歩いて立てるセル（壁・溶岩・かがり火は不可。宝箱は踏んで開けるタイル＝立てる）。
function walkable(t) {
	const ok = (k) => { const ch = at(t, k); return ch !== undefined && !HARD_BLOCKED.has(ch) && ch !== TILE.TORCH; };
	const seen = new Set(OPENINGS.filter(ok)), q = [...seen];
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
test.describe('D4 溶岩越しの灯火 ① データ', () => {
	const t = gridOf();
	const walk = walkable(t);

	test('盤面・宝箱・封印の配線（旧の石・ボタン・門・看板が残っていない）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(ROOM_ROWS);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } });
		expect(st.showConditions).toEqual({ [CHEST]: { trigger: 'torchesLit' } });
		expect(st.links ?? [], 'links は空').toEqual([]);
		expect(Object.keys(st.signData ?? {}), '看板データは空').toEqual([]);
		expect(st.initLitTorches ?? [], '最初から点いている火は無い（火元はロウソク）').toEqual([]);
		for (const ch of [TILE.STONE, TILE.BUTTON, TILE.GATE, TILE.SIGN]) {
			expect(rowsOf(st).some((row) => row.includes(ch)), `'${ch}' が残っている`).toBe(false);
		}
	});

	test('奥の火は四方が溶岩・手前の火は突堤からだけ・宝箱は西の岸から', () => {
		expect(nbrs(FAR).filter((k) => walk.has(k)), `奥の火 (${FAR}) の隣に立てる床がある＝ロウソクで直に点く`).toEqual([]);
		expect(nbrs(NEAR).filter((k) => walk.has(k)), `手前の火 (${NEAR}) の隣の床`).toEqual([PIER]);
		expect(nbrs(CHEST).filter((k) => walk.has(k)), `宝箱 (${CHEST}) へ踏み込める床`).toEqual([SHORE]);
		for (const k of OPENINGS) expect(walk.has(k), `口 (${k}) が他の口とつながらない`).toBe(true);
	});

	test('解は「突堤でロウソク → 岸から右へブーメラン」の2手・どちらか片方では解けない', () => {
		for (const tier of BOOMERANG_TIERS) {
			const reach = reachOf(tier);
			expect(relay(t, reach), `${tier.name}＋ロウソク`).toEqual([`ロウソク ${PIER}→${NEAR}`, `ブーメラン ${SHORE}→右`]);
			expect(relay(t, reach, { candle: false }), `${tier.name}だけで解けた`).toBeNull();
			const seats = [];
			for (const k of walk) for (const d of Object.keys(DIR)) if (throwFrom(t, k, d, reach, new Set([NEAR])).has(FAR)) seats.push(`${k}→${d}`);
			expect(seats, `${tier.name}で奥の火を点ける座`).toEqual([`${SHORE}→右`]);
		}
		expect(relay(t, reachOf(BOOMERANG_TIERS[0]), { boomerang: false }), 'ロウソクだけで解けた').toBeNull();
	});

	test('対照：溶岩の隔離と火の受け渡しが本物（測定が空虚でない）', () => {
		const wood = reachOf(BOOMERANG_TIERS[0]);
		// 奥の火の西 (7,2) を床にするとロウソクだけで解ける＝溶岩の隔離が効いている
		const open = gridOf(); open[7][2] = TILE.FLOOR;
		expect(relay(open, wood, { boomerang: false }), '(7,2) を床にしてもロウソクだけで解けない').not.toBeNull();
		// 手前の火を壁にすると（潰すのは '#'）どの道具でも奥が点かない＝受け渡しが要
		const noNear = gridOf(); noNear[7][5] = TILE.WALL;
		expect(relay(noNear, wood), '手前の火が無くても解けた').toBeNull();
		// 往路だけで測ると岸からの投げは奥を点けない＝点くのは復路
		expect(throwFrom(t, SHORE, '右', wood, new Set([NEAR]), { outOnly: true }).has(FAR), '往路で奥の火が点く').toBe(false);
	});

	test('はしごで溶岩を渡れない・層の接続は不変', () => {
		expect(LADDER_OVER.has(TILE.LAVA), 'lib の LADDER_OVER に溶岩が入った').toBe(false);
		const passable = readFileSync(PASSABLE_PATH, 'utf8');
		const m = passable.match(/const LADDER_OVER = new Set\(\[([\s\S]*?)\]\)/);
		expect(m, 'passable.js の LADDER_OVER が見つからない').not.toBeNull();
		expect(m[1], 'ゲーム本体のはしごが溶岩を渡れるようになった').not.toContain('LAVA');
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '3,3 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(18);
	});
});

// ── ② エンジンの前提 ─────────────────────────────────────────────────
test('D4 溶岩越しの灯火 ② エンジン：炎の受け渡しは往路・復路の両方で走る', () => {
	const proj = readFileSync(PROJECTILE_PATH, 'utf8');
	const body = proj.slice(proj.indexOf('function boomerangStep('), proj.indexOf('function lobStep('));
	// 往路のサブステップと復路のサブステップに1箇所ずつ。復路側が消えるとこの部屋は解けない。
	expect((body.match(/if \(collects\) collectAlongBoomerang\(proj\);/g) ?? []).length,
		'boomerangStep の受け渡しが往路・復路の2箇所でない').toBe(2);
	expect(body.indexOf('// 復路'), '復路の区切りが見つからない').toBeGreaterThan(0);
	expect(body.slice(body.indexOf('// 復路')), '復路に受け渡しが無い').toContain('if (collects) collectAlongBoomerang(proj);');
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
async function boot(page, url) {
	await page.goto(url);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
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
async function candle(page, dir) {
	await page.evaluate((d) => {
		window.__game.setHeroDir(d);
		window.__game.getPlayer().activeSubItem = 'candle';
	}, dir);
	await step(page, 1);
	await page.evaluate(() => window.__game.useSubItem());
	await step(page, 2);
}
// 投げてから戻り切るまで進める。奥の火が灯った瞬間に、ブーメランが復路にいたかを記録する。
async function throwBoomerang(page, dir) {
	await page.evaluate((d) => {
		window.__game.setHeroDir(d);
		window.__game.getPlayer().activeSubItem = 'boomerang';
	}, dir);
	await step(page, 1);
	await page.evaluate(() => window.__game.useSubItem());
	const probe = () => page.evaluate((far) => {
		const b = window.__game.getProjectiles().find((p) => p.type === 'boomerang' && p.owner === 'player');
		return { flying: !!b, returning: !!b?.returning, farLit: window.__game.getStageState().litTorches.includes(far) };
	}, FAR);
	let s = await probe();
	expect(s.flying, 'ブーメランが飛ばない').toBe(true);
	let litWhileReturning = null;
	for (let i = 0; i < 200 && s.flying; i++) {
		await step(page, 1);
		s = await probe();
		if (s.farLit && litWhileReturning === null) litWhileReturning = s.returning;
	}
	expect(s.flying, 'ブーメランが戻らない').toBe(false);
	return { litWhileReturning };
}

test.describe('D4 溶岩越しの灯火 ③ 実機', () => {
	test('溶岩の上は歩けず、かがり火にも踏み込めない', async ({ page }) => {
		await boot(page, previewUrl(5, 5));
		await walk(page, 'down', 8);
		expect(await pos(page), '突堤 (6,5) の先へ進めた（手前の火の上）').toBe(PIER);
		await walk(page, 'left', 4);
		expect(await pos(page), '突堤から西の溶岩へ踏み出せた').toBe(PIER);
		await boot(page, previewUrl(7, 1));
		await walk(page, 'right', 4);
		expect(await pos(page), '西の岸から溶岩へ踏み出せた').toBe(SHORE);
	});

	test('ロウソクだけ・ブーメランだけでは封印が解けず、宝箱は開かない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		// ブーメランだけ＝火元が無い∴何も点かない
		await boot(page, previewUrl(7, 1));
		await throwBoomerang(page, 'right');
		expect((await ss(page)).litTorches, 'ロウソク無しで火が点いた').toEqual([]);
		// ロウソクで手前だけ点けても、奥が消えている限り封印は解けない
		await boot(page, previewUrl(5, 5));
		await walk(page, 'down', 2);
		expect(await pos(page)).toBe(PIER);
		await candle(page, 'down');
		const s1 = await ss(page);
		expect(s1.litTorches, '突堤から手前の火が点かない').toEqual([NEAR]);
		expect(s1.conditionsMet ?? [], '手前だけで封印が解けた').not.toContain(CHEST);
		// 岸へ回って宝箱を踏む＝封印中は開かない
		const r0 = await rupees(page);
		await walk(page, 'up', 2);
		await walk(page, 'left', 8);
		await walk(page, 'down', 4);
		expect(await pos(page), '西の岸 (7,1) へ回れない').toBe(SHORE);
		await walk(page, 'down', 2);
		expect(await pos(page), '宝箱のセルに立てない').toBe(CHEST);
		expect((await ss(page)).openedChests ?? [], '封印中の宝箱が開いた').not.toContain(CHEST);
		expect(await rupees(page), '封印中にルピーが増えた').toBe(r0);
		expect(errors).toEqual([]);
	});

	test('通し：突堤でロウソク→岸から右へブーメラン＝奥の火が復路で灯り、宝箱でルピー +20', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(5, 5));
		await walk(page, 'down', 2);
		await candle(page, 'down');
		expect((await ss(page)).litTorches, '手前の火が点かない').toEqual([NEAR]);
		await walk(page, 'up', 2);
		await walk(page, 'left', 8);
		await walk(page, 'down', 4);
		expect(await pos(page)).toBe(SHORE);
		const { litWhileReturning } = await throwBoomerang(page, 'right');
		const s = await ss(page);
		expect([...s.litTorches].sort(), '奥の火が灯らない').toEqual([FAR, NEAR].sort());
		expect(litWhileReturning, '奥の火が往路で灯った（復路で点く設計のはず）').toBe(true);
		expect(s.conditionsMet, '全点灯で封印が解けない').toContain(CHEST);
		const r0 = await rupees(page);
		await walk(page, 'down', 2);
		expect((await ss(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await rupees(page), 'ルピーが 20 増えない').toBe(r0 + 20);
		expect(errors).toEqual([]);
	});

	test('銀のブーメランでも同じ座で灯る（柱で折り返す）', async ({ page }) => {
		await boot(page, previewUrl(5, 5, { ps_silverboomerang: '1' }));
		expect(await page.evaluate(() => window.__game.getState().player.boomerangTier)).toBe(1);
		await walk(page, 'down', 2);
		await candle(page, 'down');
		await walk(page, 'up', 2);
		await walk(page, 'left', 8);
		await walk(page, 'down', 4);
		const { litWhileReturning } = await throwBoomerang(page, 'right');
		expect((await ss(page)).litTorches, '銀で奥の火が灯らない').toContain(FAR);
		expect(litWhileReturning, '銀で奥の火が往路で灯った').toBe(true);
	});
});
