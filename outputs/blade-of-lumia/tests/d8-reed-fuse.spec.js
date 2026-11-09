// tests/d8-reed-fuse.spec.js
// dungeon_8 `2,0`「葦の導火線」と燃え広がる茂みの番人
// （2026-10-26 / PLAN 実行キュー 93 の4室目・盤面は `scripts/migrate-d8-2-0-reed-fuse.mjs`（2版目）・
//   エンジンは game/projectile.js spreadFireFrom／flushFireSpread／collectAlongBoomerang（火の付いた
//   ブーメランが葦を燃やす）・game.js playCandle／enterStage・combat.js cutBush の「水に立つ葦は刈れない」）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   南の口だけの行き止まりに宝箱（ルピー×20）が1つ置いてあるだけ・敵なし・仕掛けなし。
//
// 新しい盤面（'~' は bgTiles の水・小島以外の 'u' の下も水）:
//      1 #~~~uuuuuuH#   ← 奥の導火線 → 奥のかがり火 H(1,10)（小島）
//      2 #~~~u~~~~..#   ← 奥の根元 (2,4)＝どの岸にも接しない
//      3 #uuu~~~u~~~#   ← 手前の導火線／(3,4) が水の隙間
//      4 #u~uH~uuu~~#   ← 手前の根元 (4,1)(4,3)／中継のかがり火 H(4,4)／囮 (3,7)(4,6-8)
//      5 #...~......#   ← (5,4) は水＝中継のかがり火の前に立てない
//      6 #..........#   ← (6,4)＝ブーメランを北へ投げる立ち位置
//      7 #........B.#   ← 封印の宝箱（torchesLit＝2つとも）
//
// 守るものは3つ。
//   ① データ：盤面・水と泥・2つのかがり火・宝箱と封印・小島へ届かない・中継の前に立てない・岸に接する葦は
//      水の上・燃え広がりの届く先（手前→中継／奥→奥のかがり火／囮→どこにも）・ブーメランの線・層の接続。
//   ② 機構（実機）：水に立つ葦は剣で刈れない（対照＝下地を泥にすると刈れる）／囮は 240ms ずつ遅れて
//      つながった4本だけが燃える／火を拾っていないブーメランでは葦は燃えない。
//   ③ 主題（実機）：通し＝手前に火→中継が灯る→(6,4) からブーメラン→奥の導火線が燃えて宝箱を開ける／
//      一つ下 (7,4) から投げても奥に届かない／途中はセーブしない／途中で部屋を出ても燃え切っている。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { reach } from '../scripts/migrate-d8-0-2-leech-paddy.mjs';
import {
	LAYER, ROOM, TARGET, TORCH, RELAY, GAP, FAR_ROOT, THROW_STAND, NOTCH, CHEST, CHEST_CONTENT,
	FUSE_ROOT, FUSE_STAND, NEAR_ROOTS, DECOY, ISLET, OPENING, tilesOf, fireReach,
} from '../scripts/migrate-d8-2-0-reed-fuse.mjs';
import { FIRE_SPREAD_MS, TICK_MS } from '../game/constants.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const parse = (k) => k.split(',').map(Number);
const N4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// 配っているマップで測る（TARGET で測るとマップを壊しても緑のまま）。水は bgTiles から '~' に描き戻す。
const grid = room.tiles.map((row, r) => [...rowStr(row)].map((ch, c) =>
	(ch === TILE.FLOOR && room.bgTiles?.[`${r},${c}`] === TILE.WATER ? TILE.WATER : ch)));
// 火元からかがり火に灯るまでの燃え移りの回数（縦横の最短）
function fireDepth(g, root, torch) {
	const dist = new Map([[root, 0]]);
	const q = [root];
	while (q.length) {
		const k = q.shift(); const [r, c] = parse(k);
		for (const [dr, dc] of N4) {
			const nk = `${r + dr},${c + dc}`, ch = g[r + dr]?.[c + dc];
			if (dist.has(nk)) continue;
			if (nk === torch && ch === TILE.TORCH) return dist.get(k) + 1;
			if (ch === TILE.BUSH) { dist.set(nk, dist.get(k) + 1); q.push(nk); }
		}
	}
	return -1;
}

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D8 葦の導火線 ① データ', () => {
	test('盤面・水と泥・2つのかがり火・封印の宝箱', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトと違う').toEqual(tilesOf().map((r) => r.join('')));
		expect(grid.map((r) => r.join('')), '水の敷き方が移行スクリプトの TARGET と違う').toEqual(TARGET);
		grid.forEach((row, r) => row.forEach((ch, c) => {
			const k = `${r},${c}`;
			if (ch === TILE.BUSH && !ISLET.includes(k)) expect(room.bgTiles[k], `葦 ${k} の下地が水でない`).toBe(TILE.WATER);
		}));
		expect([...ISLET, RELAY].map((k) => room.bgTiles[k]), '小島・中継のかがり火の下地が泥でない').toEqual([...ISLET, RELAY].map(() => TILE.MUD));
		const torches = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ch === TILE.TORCH) torches.push(`${r},${c}`); }));
		expect(torches.sort(), 'かがり火が中継と奥の2つでない').toEqual([RELAY, TORCH].sort());
		expect(room.chestContents, '宝箱の中身が変わった').toEqual({ [CHEST]: CHEST_CONTENT });
		expect(room.showConditions, '宝箱の封印が torchesLit でない').toEqual({ [CHEST]: { trigger: 'torchesLit' } });
		expect(grid.flat().filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
	});

	test('小島へ届かない・中継のかがり火の前に立てない・岸に接する葦は水の上・奥の導火線は岸に接しない', () => {
		const lad = reach(grid, OPENING, { withLadder: true });
		const burnt = grid.map((row) => row.map((ch) => (ch === TILE.BUSH ? TILE.WATER : ch)));
		const after = reach(burnt, OPENING, { withLadder: true });
		expect(ISLET.filter((k) => lad.has(k) || after.has(k)), '小島へ歩いて届く＝導火線が要らない').toEqual([]);
		const stranded = [];
		grid.forEach((row, r) => row.forEach((ch, c) => {
			const k = `${r},${c}`;
			if (!HARD_BLOCKED.has(ch) && ch !== TILE.WATER && !ISLET.includes(k) && !lad.has(k)) stranded.push(k);
		}));
		expect(stranded, '取り残された岸の床がある').toEqual([]);
		const [rr, rc] = parse(RELAY);
		expect(N4.filter(([dr, dc]) => lad.has(`${rr + dr},${rc + dc}`)), '中継のかがり火の隣に立てる＝ロウソクで直に点けられる').toEqual([]);
		expect(grid[parse(NOTCH)[0]][parse(NOTCH)[1]], '中継のかがり火の前が水でない').toBe(TILE.WATER);
		const touchable = [];
		grid.forEach((row, r) => row.forEach((ch, c) => {
			if (ch === TILE.BUSH && N4.some(([dr, dc]) => lad.has(`${r + dr},${c + dc}`))) touchable.push(`${r},${c}`);
		}));
		expect(touchable.sort(), '岸に接する葦が手前の根元と囮でない').toEqual([...NEAR_ROOTS, ...DECOY.filter((k) => k !== '3,7')].sort());
		expect(touchable.filter((k) => room.bgTiles[k] !== TILE.WATER), '剣で刈れる（水の上でない）葦が岸に接している').toEqual([]);
		expect([...fireReach(grid, FAR_ROOT).burnt].filter((k) => touchable.includes(k)), '奥の導火線が岸に接している＝ロウソクで直に点けられる').toEqual([]);
		expect(lad.has(FUSE_STAND) && lad.has(THROW_STAND), '火を点ける立ち位置／投げる立ち位置へ歩けない').toBe(true);
	});

	test('燃え広がりの届く先・ブーメランの線・層の接続', () => {
		const near = fireReach(grid, FUSE_ROOT);
		expect(near.torches.has(RELAY) && !near.torches.has(TORCH), '手前の火が中継に届かない／隙間を越えて奥まで届く').toBe(true);
		expect(grid[parse(GAP)[0]][parse(GAP)[1]], '隙間が水でない').toBe(TILE.WATER);
		expect(fireReach(grid, FAR_ROOT).torches.has(TORCH), '奥の根元の火が奥のかがり火に届かない').toBe(true);
		const d = fireReach(grid, DECOY[1]);
		expect([...d.burnt].sort(), '囮のつながりが変わった').toEqual([...DECOY].sort());
		expect(d.torches.size, '囮の火がかがり火に届く＝囮にならない').toBe(0);
		// 投げる線＝立ち位置の真北に 中継 → 隙間 → 奥の根元 が並ぶ
		const [sr, sc] = parse(THROW_STAND);
		expect([RELAY, GAP, FAR_ROOT].map((k) => parse(k)[1]), '線が立ち位置の列に無い').toEqual([sc, sc, sc]);
		expect([RELAY, GAP, FAR_ROOT].map((k) => sr - parse(k)[0]), '立ち位置からの距離が 2・3・4 でない').toEqual([2, 3, 4]);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ②③ 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
// ⚠️ ps_boomerang は木（届くのは 4 マス）＝D8 で保証される最低のティアで測る
function previewUrl(row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '10', ps_candle: '1', ps_ladder: '1', ps_bomb: '1', ps_bow: '1', ps_boomerang: '1',
	});
	return `${GAME}?${p.toString()}`;
}
// debug を切る（fromEditor の既定は「無敵・すり抜け」）。mutate＝配るマップの複製を書き換える（対照用）
async function boot(page, row, col, { mutate = null } = {}) {
	if (mutate) {
		await page.route('**/work/blade-of-lumia.json', async (route) => {
			const json = structuredClone(map);
			mutate(json.layers[LAYER].stages[ROOM]);
			await route.fulfill({ json });
		});
	}
	await page.goto(previewUrl(row, col));
	await waitForBoard(page);
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	await page.evaluate(() => window.__game.step(2));
}
const WALK = `(g, r, c, h) => { for (let i = 0; i < 80; i++) { const p = g.getState().player;
	const dy = Math.abs(p.y - r) > 0.01, dx = Math.abs(p.x - c) > 0.01; if (!dy && !dx) return true;
	const vert = h ? !dx : dy; g.movePlayer(vert ? (p.y < r ? 'down' : 'up') : (p.x < c ? 'right' : 'left')); g.step(1); } return false; }`;
// 手前の導火線に火を点けて中継が灯るまで待つ（ページ内）。戻り値＝灯るまでの tick 数（-1＝灯らない）
const LIGHT_NEAR = `(g, walk, sr, sc, relay) => { walk(g, sr + 1, sc, true); walk(g, sr, sc, false); g.setHeroDir('up');
	g.getPlayer().activeSubItem = 'candle'; g.useSubItem();
	for (let i = 0; i < 60; i++) { g.step(1); if (g.getStageState().litTorches.includes(relay)) return i + 1; } return -1; }`;
const SPREAD_TICKS = FIRE_SPREAD_MS / TICK_MS;

test.describe('D8 葦の導火線 ② 機構', () => {
	test('水に立つ葦は剣で刈れない', async ({ page }) => {
		await boot(page, 8, 6);
		const r = await page.evaluate((walkSrc) => {
			const g = window.__game; const walk = eval(walkSrc);
			walk(g, 5, 6, false); g.setHeroDir('up');
			for (let i = 0; i < 3; i++) { g.swordAttack(); g.step(4); }
			return g.getStageState().cutBushes;
		}, WALK);
		expect(r, '水の上の葦が剣で刈れた').toEqual([]);
	});

	test('対照：同じ葦の下地を泥にすると剣で刈れる（刈れないのは「水の上」だから）', async ({ page }) => {
		await boot(page, 8, 6, { mutate: (st) => { st.bgTiles['4,6'] = TILE.MUD; } });
		const r = await page.evaluate((walkSrc) => {
			const g = window.__game; const walk = eval(walkSrc);
			walk(g, 5, 6, false); g.setHeroDir('up');
			g.swordAttack(); g.step(4);
			return g.getStageState().cutBushes;
		}, WALK);
		expect(r, '泥の上の葦も剣で刈れない＝番人に歯が無い').toEqual(['4,6']);
	});

	test('囮に火を点けると、つながった4本だけが 240ms ずつ遅れて燃え、かがり火は灯らない', async ({ page }) => {
		await boot(page, 8, 6);
		const r = await page.evaluate(([walkSrc, spreadTicks]) => {
			const g = window.__game; const walk = eval(walkSrc);
			walk(g, 5, 6, false); g.setHeroDir('up');
			g.getPlayer().activeSubItem = 'candle';
			g.useSubItem();
			const first = [...g.getStageState().cutBushes];
			const pending = g.getFireSpread().map((f) => `${f.r},${f.c}`).sort();
			g.step(spreadTicks - 1);
			const early = [...g.getStageState().cutBushes];
			g.step(1);
			const second = [...g.getStageState().cutBushes].sort();
			g.step(spreadTicks * 6);
			const ss = g.getStageState();
			return { first, pending, early, second, all: [...ss.cutBushes].sort(), lit: ss.litTorches, met: ss.conditionsMet, left: g.getFireSpread().length };
		}, [WALK, SPREAD_TICKS]);
		expect(r.first, '火を点けた葦が燃えていない').toEqual(['4,6']);
		expect(r.pending, '隣の葦に燃え移る予定が立っていない').toEqual(['4,7']);
		expect(r.early, '燃え移るのが早すぎる（間隔を守っていない）').toEqual(['4,6']);
		expect(r.second, `${FIRE_SPREAD_MS}ms 後に隣へ燃え移っていない`).toEqual(['4,6', '4,7']);
		expect(r.all, '囮のほかの葦まで燃えた').toEqual([...DECOY].sort());
		expect(r.lit, '囮の火でかがり火が灯った').toEqual([]);
		expect(r.met, '囮の火で宝箱が出た').toEqual([]);
		expect(r.left, '燃え広がりが終わらない').toBe(0);
	});

	test('火を拾っていないブーメランでは葦は燃えない（中継が灯る前に投げても何も起きない）', async ({ page }) => {
		await boot(page, 8, 4);
		const r = await page.evaluate(([walkSrc, tr, tc]) => {
			const g = window.__game; const walk = eval(walkSrc);
			walk(g, tr, tc, false); g.setHeroDir('up');
			g.getPlayer().activeSubItem = 'boomerang';
			g.useSubItem();
			g.step(14);
			const ss = g.getStageState();
			return { cut: ss.cutBushes, lit: ss.litTorches, flying: g.getProjectiles().length };
		}, [WALK, ...parse(THROW_STAND)]);
		expect(r.flying, '前提：ブーメランが戻っていない').toBe(0);
		expect(r.cut, '火の無いブーメランで葦が燃えた').toEqual([]);
		expect(r.lit, '火の無いブーメランでかがり火が灯った').toEqual([]);
	});
});

test.describe('D8 葦の導火線 ③ 主題', () => {
	test('通し：手前に火→中継が灯る→(6,4) から北へブーメラン→奥の導火線が燃えて宝箱を開ける', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => { if (!/resume a context/.test(e.message)) errors.push(e.message); });
		await boot(page, 8, 5);
		const r = await page.evaluate(([walkSrc, lightSrc, fr, fc, relay, tr, tc, torch, cr, cc]) => {
			const g = window.__game; const walk = eval(walkSrc); const lightNear = eval(lightSrc);
			const relayAt = lightNear(g, walk, fr, fc, relay);
			for (let i = 0; i < 40 && g.getFireSpread().length; i++) g.step(1);
			const afterNear = { lit: [...g.getStageState().litTorches], met: [...g.getStageState().conditionsMet] };
			walk(g, tr + 1, fc, false); walk(g, tr + 1, tc, true); walk(g, tr, tc, false); g.setHeroDir('up');
			g.getPlayer().activeSubItem = 'boomerang';
			g.useSubItem();
			let farAt = -1;
			for (let i = 0; i < 80 && farAt < 0; i++) { g.step(1); if (g.getStageState().litTorches.includes(torch)) farAt = i + 1; }
			g.step(4);
			const ss = g.getStageState();
			const scrolls0 = g.getPlayer().scrolls ?? 0;
			const go = walk(g, cr, cc - 1, false);
			for (let i = 0; i < 3; i++) { g.movePlayer('right'); g.step(1); }
			return { relayAt, afterNear, farAt, cut: ss.cutBushes.length, met: ss.conditionsMet, go,
				opened: g.getStageState().openedChests.includes(`${cr},${cc}`), gained: (g.getPlayer().scrolls ?? 0) - scrolls0 };
		}, [WALK, LIGHT_NEAR, ...parse(FUSE_STAND), RELAY, ...parse(THROW_STAND), TORCH, ...parse(CHEST)]);
		const nearN = fireReach(grid, FUSE_ROOT).burnt.size, farN = fireReach(grid, FAR_ROOT).burnt.size;
		expect(r.relayAt, '手前の火が中継のかがり火に灯らない／一度に灯った（間隔が無い）')
			.toBe(fireDepth(grid, FUSE_ROOT, RELAY) * SPREAD_TICKS);
		expect(r.afterNear, '手前の火だけで奥のかがり火が灯った・宝箱が出た').toEqual({ lit: [RELAY], met: [] });
		expect(r.farAt, '運んだ火で奥のかがり火が灯らない').toBeGreaterThan(0);
		expect(r.cut, '燃え残った導火線がある').toBe(nearN + farN);
		expect(r.met, '宝箱の封印が解けない').toEqual([CHEST]);
		expect(r.go, '宝箱の隣へ歩けない').toBe(true);
		expect(r.opened, '宝箱を開けられない').toBe(true);
		expect(r.gained, '中身の剣技の巻物が入らない（キュー100 でルピー×20 から差し替え）').toBe(1);
		expect(errors).toEqual([]);
	});

	test('一つ下の (7,4) から投げても木のブーメランは奥の根元に届かない（立ち位置を探させる）', async ({ page }) => {
		await boot(page, 8, 5);
		const r = await page.evaluate(([walkSrc, lightSrc, fr, fc, relay, tr, tc]) => {
			const g = window.__game; const walk = eval(walkSrc); const lightNear = eval(lightSrc);
			const relayAt = lightNear(g, walk, fr, fc, relay);
			for (let i = 0; i < 40 && g.getFireSpread().length; i++) g.step(1);
			const cut0 = g.getStageState().cutBushes.length;
			walk(g, tr + 1, fc, false); walk(g, tr + 1, tc, true); g.setHeroDir('up');
			g.getPlayer().activeSubItem = 'boomerang';
			g.useSubItem();
			g.step(20);
			return { relayAt, cut0, cut: g.getStageState().cutBushes.length, lit: g.getStageState().litTorches };
		}, [WALK, LIGHT_NEAR, ...parse(FUSE_STAND), RELAY, ...parse(THROW_STAND)]);
		expect(r.relayAt, '前提：中継が灯っていない').toBeGreaterThan(0);
		expect(r.cut, '(7,4) から投げて奥の導火線が燃えた＝立ち位置の謎が無い').toBe(r.cut0);
		expect(r.lit, '(7,4) から投げて奥のかがり火が灯った').toEqual([RELAY]);
	});

	test('燃え広がりの途中はセーブしない＝燃え切ったときに1回だけ（途中で再読込しても導火線が途切れない）', async ({ page }) => {
		await boot(page, 8, 5);
		const s = await page.evaluate(([walkSrc, sr, sc, saveKey, ssKey, midTicks]) => {
			const g = window.__game; const walk = eval(walkSrc);
			const saved = () => { const sv = JSON.parse(localStorage.getItem(saveKey) ?? 'null'); const st = sv?.stageState?.[ssKey];
				return { cut: st?.cutBushes?.length ?? 0, lit: st?.litTorches ?? [] }; };
			walk(g, sr + 1, sc, true); walk(g, sr, sc, false); g.setHeroDir('up');
			g.getPlayer().activeSubItem = 'candle';
			g.useSubItem();
			const atIgnite = saved();
			g.step(midTicks);
			const midway = { ...saved(), pending: g.getFireSpread().length };
			for (let i = 0; i < 80 && g.getFireSpread().length; i++) g.step(1);
			return { atIgnite, midway, done: saved() };
		}, [WALK, ...parse(FUSE_STAND), 'blade-of-lumia-save', `${LAYER}_${ROOM}`, SPREAD_TICKS * 2]);
		const nearN = fireReach(grid, FUSE_ROOT).burnt.size;
		expect(s.atIgnite.cut, '火を点けた瞬間に「火元だけ燃えた」状態がセーブされた').toBe(0);
		expect(s.midway.pending, '前提：燃え広がりの途中でない').toBeGreaterThan(0);
		expect(s.midway.cut, '燃え広がりの途中の状態がセーブされた').toBe(0);
		expect(s.done, '燃え切った状態がセーブされていない').toEqual({ cut: nearN, lit: [RELAY] });
	});

	test('燃え広がりの途中で部屋を出ても、戻ると燃え切っている（導火線が途中で止まって詰まない）', async ({ page }) => {
		await boot(page, 8, 5);
		// 手前の導火線は短い（5 手＝1.2 秒）＝出口まで歩く間に燃え切る∴長い奥の導火線で測る：
		// 中継を灯した後、(6,4) からブーメランで奥に火を移し、すぐ南の口へ歩いて出る。
		const before = await page.evaluate(([walkSrc, lightSrc, fr, fc, relay, tr, tc]) => {
			const g = window.__game; const walk = eval(walkSrc); const lightNear = eval(lightSrc);
			lightNear(g, walk, fr, fc, relay);
			for (let i = 0; i < 40 && g.getFireSpread().length; i++) g.step(1);
			walk(g, tr + 1, fc, false); walk(g, tr + 1, tc, true); walk(g, tr, tc, false); g.setHeroDir('up');
			g.getPlayer().activeSubItem = 'boomerang';
			g.useSubItem();
			for (let i = 0; i < 12 && g.getFireSpread().length === 0; i++) g.step(1);   // 奥の根元に火が移るまで
			// ブーメランで点いたときも途中はセーブしない（セーブに残るのは手前が燃え切った時点＝奥の根元は未燃）
			const sv = JSON.parse(localStorage.getItem('blade-of-lumia-save') ?? 'null')?.stageState?.['dungeon_8_2,0'];
			const savedAtFarIgnite = { cut: sv?.cutBushes?.length ?? 0, lit: sv?.litTorches ?? [] };
			walk(g, 8, tc, false); walk(g, 8, 5, true);
			const pendingBeforeExit = g.getFireSpread().length;
			const cutBeforeExit = g.getStageState().cutBushes.length;
			for (let i = 0; i < 4; i++) { g.movePlayer('down'); g.step(1); }
			return { pendingBeforeExit, cutBeforeExit, savedAtFarIgnite };
		}, [WALK, LIGHT_NEAR, ...parse(FUSE_STAND), RELAY, ...parse(THROW_STAND)]);
		// 遷移は非同期＝待つ
		await page.waitForFunction(() => window.__game.getState().stageKey === '2,1', null, { timeout: 5000 });
		await page.evaluate(() => { const g = window.__game; g.step(3); for (let i = 0; i < 3; i++) { g.movePlayer('up'); g.step(1); } });
		await page.waitForFunction((rm) => window.__game.getState().stageKey === rm, ROOM, { timeout: 5000 });
		const r = await page.evaluate(() => { const ss = window.__game.getStageState(); return { cut: ss.cutBushes.length, lit: [...ss.litTorches].sort(), met: ss.conditionsMet }; });
		const all = fireReach(grid, FUSE_ROOT).burnt.size + fireReach(grid, FAR_ROOT).burnt.size;
		expect(before.pendingBeforeExit, '前提：部屋を出る前に燃え広がりが終わっていた（途中で出ていない）').toBeGreaterThan(0);
		expect(before.cutBeforeExit, '前提：部屋を出る前に燃え切っていた').toBeLessThan(all);
		expect(before.savedAtFarIgnite, 'ブーメランで奥に火が移った瞬間の状態がセーブされた')
			.toEqual({ cut: fireReach(grid, FUSE_ROOT).burnt.size, lit: [RELAY] });
		expect(r.cut, '途中で出たら導火線が燃え残った').toBe(all);
		expect(r.lit, '途中で出たら奥のかがり火が灯らない').toEqual([RELAY, TORCH].sort());
		expect(r.met, '途中で出たら宝箱の封印が解けない').toEqual([CHEST]);
	});
});
