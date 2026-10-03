// tests/d8-rubble-piers.spec.js
// dungeon_8 `3,3`「崩れ壁の橋脚」の番人
// （2026-09-28 / PLAN 実行キュー 34 の6室目・盤面は `scripts/migrate-d8-3-3-rubble-piers.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   石 *(3,3)・ボタン S(3,6)・門 T(2,8)・宝箱 B(1,8) の部屋で、宝箱の出現条件が
//   `stonesPushed`＝エンジンに無い trigger だった∴宝箱は永久に開かず、石もボタンも門も飾り。
//   同じ事故を全層で拾う検査（`check-dungeon-integrity.mjs` の未知 trigger）もここで歯を確かめる。
//
// 守るものは4つ。
//   ① データ：崩れ壁4枚・水5枚・宝箱・石碑の位置／石・ボタン・門・出現条件が無い／
//      はしごが架かる水は「壁を崩した後の幅1の3枚」だけ（宝箱の下の幅2は架からない）／
//      実ゲームと同じ遷移のソルバーで「解ける・詰み 0・爆弾最少 3・はしご無し/爆弾無しでは解けない」／
//      帰りの橋脚 (6,5) が無いと宝箱側に閉じ込められる（対照）。
//   ② データ（層の到達性）：dead-edge 0・到達室数は不変。
//   ③ 検査：showConditions の trigger 名が未知なら check-dungeon-integrity.mjs がエラーにする。
//   ④ 挙動（実機）：水越しの爆弾→はしご→崩れ壁を橋脚にして横へ降りる→水越しの爆弾→宝箱で +20、
//      そして宝箱から外周へ歩いて帰れる。
import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE, TILE_META } from '../shared/tiles.js';
import { toolsUsableIn } from '../shared/progression.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { makeSolver } from '../scripts/lib/blade-solver.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const CHECKER = fileURLToPath(new URL('../scripts/check-dungeon-integrity.mjs', import.meta.url));
const PROJECT_DIR = fileURLToPath(new URL('..', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_8';
const ROOM = '3,3';
const stages = map.layers[LAYER].stages;
const ROWS = 10, COLS = 12;

const CHEST = '5,8';
const CRACKS = ['3,8', '4,3', '5,6', '6,5'];
const WATER = ['3,7', '4,2', '5,5', '6,8', '7,8'];
const BRIDGES_AFTER = ['3,7', '4,2', '5,5'];   // 崩した後にだけはしごが架かる幅1の水

const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const bgOf = () => stages[ROOM].bgTiles ?? {};
const cellOf = (k) => k.split(',').map(Number);
const cellsOf = (t, ch) => t.flatMap((row, r) => row.flatMap((x, c) => (x === ch ? [`${r},${c}`] : []))).sort();
// 実ゲームと同じ遷移（lib/blade-solver.mjs）＝解けるか・詰み・爆弾の最少個数。
const tools = toolsUsableIn(map)[LAYER] ?? new Set();
function solve(t, bg, { hasLadder = tools.has('ladder'), noTools = false } = {}) {
	const bg2 = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => (bg[`${r},${c}`] === TILE.WATER ? '~' : 'g')));
	const S = makeSolver(t, bg2, [], {}, new Set(), { hasLadder, hasCandle: tools.has('candle'), noTools });
	const starts = S.exitCells.map((cell) => { const [r, c] = cellOf(cell); return S.encode(r, c, [], 0, 0, 0); });
	const edges = new Map(), seen = new Set(starts), q = [...starts];
	for (let h = 0; h < q.length; h++) {
		const ns = S.nextStates(q[h]); edges.set(q[h], ns);
		for (const n of ns) if (!seen.has(n)) { seen.add(n); q.push(n); }
	}
	// 壊れた壁のビットが増える手＝爆弾1個（0-1 BFS）
	const brokenOf = (s) => s.split('|')[3];
	const cost = new Map(starts.map((s) => [s, 0])), dq = [...starts];
	while (dq.length) {
		const s = dq.shift();
		for (const n of edges.get(s)) {
			const w = brokenOf(n) !== brokenOf(s) ? 1 : 0, nk = cost.get(s) + w;
			if (cost.has(n) && cost.get(n) <= nk) continue;
			cost.set(n, nk);
			if (w) dq.push(n); else dq.unshift(n);
		}
	}
	const goals = q.filter((s) => s.split('|')[0] === CHEST);
	const rev = new Map();
	for (const [s, ns] of edges) for (const n of ns) { if (!rev.has(n)) rev.set(n, []); rev.get(n).push(s); }
	const ok = new Set(q.filter((s) => S.exitCells.includes(s.split('|')[0]))), rq = [...ok];
	for (let h = 0; h < rq.length; h++) for (const p of rev.get(rq[h]) ?? []) if (!ok.has(p)) { ok.add(p); rq.push(p); }
	return { solved: goals.length > 0, bombs: goals.length ? Math.min(...goals.map((s) => cost.get(s))) : null, noEscape: q.length - ok.size };
}

// ── ① データ（盤面・はしご・ソルバー）────────────────────────────────────
test.describe('D8 崩れ壁の橋脚 ① データ', () => {
	test('崩れ壁4枚・水5枚・宝箱・石碑の位置／石・ボタン・門・links・出現条件は無い', () => {
		const t = gridOf(), st = stages[ROOM], bg = bgOf();
		expect(cellsOf(t, TILE.BREAKABLE_WALL), '崩れ壁').toEqual([...CRACKS].sort());
		expect(Object.keys(bg).filter((k) => bg[k] === TILE.WATER).sort(), '水').toEqual([...WATER].sort());
		expect(cellsOf(t, TILE.CHEST), '宝箱').toEqual([CHEST]);
		for (const ch of [TILE.STONE, TILE.BUTTON, TILE.GATE, TILE.SWITCH]) {
			expect(cellsOf(t, ch), `'${ch}' が残っている`).toEqual([]);
		}
		expect(st.links).toEqual([]);
		// 旧盤面の `stonesPushed`（エンジンに無い trigger）の再発を止める
		expect(st.showConditions, '宝箱に出現条件がある').toEqual({});
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } });
		for (const k of CRACKS) expect(st.breakableWalls?.[k]?.breakDef, `崩れ壁 ${k} の breakDef`).toBe(1);
		expect(t[8][1], '崩れた砦の石碑＝石碑タイル（キュー27）').toBe(TILE.MONUMENT);
		expect(st.signData['8,1']?.lines?.length, '石碑に本文が無い').toBeGreaterThan(0);
	});

	test('はしごが架かる水＝崩す前は 0 枚／崩した後は幅1の3枚だけ（宝箱の下の幅2は架からない）', () => {
		const t = gridOf(), bg = bgOf();
		const bank = (broken, r, c) => {
			if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
			const ch = t[r][c];
			if (ch === TILE.WATER || ch === TILE.PIT || bg[`${r},${c}`] === TILE.WATER) return false;
			if (ch === TILE.BREAKABLE_WALL) return broken.has(`${r},${c}`);
			return TILE_META[ch]?.passable ?? true;
		};
		const bridge = (broken, r, c) => (bank(broken, r - 1, c) && bank(broken, r + 1, c)) || (bank(broken, r, c - 1) && bank(broken, r, c + 1));
		expect(WATER.filter((k) => bridge(new Set(), ...cellOf(k))), '崩す前からはしごが架かる').toEqual([]);
		expect(WATER.filter((k) => bridge(new Set(CRACKS), ...cellOf(k))).sort(), '崩した後に架かる水').toEqual([...BRIDGES_AFTER].sort());
		// 橋脚は1枚ずつ効く：(5,6) を崩すと (5,4)↔(5,6) の横に架かる（往き）／(6,5) を崩すと
		// (4,5)↔(6,5) の縦に架かる（帰り＝北の (4,5) は往きでは水 (5,5) を経ないと届かない床）
		expect(bridge(new Set(['5,6']), 5, 5), '(5,6) を崩しても (5,5) に架からない').toBe(true);
		expect(bridge(new Set(['6,5']), 5, 5), '(6,5) を崩しても (5,5) に縦に架からない＝帰りの橋脚が効かない').toBe(true);
	});

	test('ソルバー（実ゲームと同じ遷移）＝解ける・詰み 0・爆弾最少 3・はしご無し/爆弾無しでは解けない', () => {
		const t = gridOf(), bg = bgOf();
		const m = solve(t, bg);
		expect(m.solved, '解けない').toBe(true);
		expect(m.noEscape, '外周へ戻れない状態がある＝宝箱側に閉じ込められる').toBe(0);
		expect(m.bombs, '爆弾の最少個数').toBe(3);
		expect(solve(t, bg, { hasLadder: false }).solved, 'はしご無しで解ける＝はしごが飾り').toBe(false);
		expect(solve(t, bg, { noTools: true }).solved, '爆弾無しで解ける＝崩れ壁が飾り').toBe(false);
		for (const k of ['3,8', '4,3', '5,6']) {
			const g = gridOf(); const [r, c] = cellOf(k); g[r][c] = TILE.WALL;
			expect(solve(g, bg).solved, `対照：崩れ壁 ${k} を壁にしても解ける＝飾り`).toBe(false);
		}
		// 帰りの橋脚 (6,5) を壁にすると、宝箱には届くが帰れない（最初の叩き台の穴）
		const g = gridOf(); g[6][5] = TILE.WALL;
		const m2 = solve(g, bg);
		expect(m2.solved, '対照：(6,5) を壁にすると宝箱に届かない＝往きの道が変わった').toBe(true);
		expect(m2.noEscape, '対照：(6,5) を壁にしても閉じ込められない＝詰みの検出が壊れている').toBeGreaterThan(0);
	});
});

// ── ② データ（層の到達性）────────────────────────────────────────────
test.describe('D8 崩れ壁の橋脚 ② データ（層の接続は不変）', () => {
	test('dead-edge 0・入口から 3,3 に歩いて入れる', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '3,3 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(21);
	});
});

// ── ③ 検査（未知の trigger）───────────────────────────────────────────
test.describe('D8 崩れ壁の橋脚 ③ 検査', () => {
	test('showConditions の trigger 名が未知なら check-dungeon-integrity.mjs がエラーにする', () => {
		const run = (path) => {
			try {
				return execFileSync('node', [CHECKER, 'all'], { cwd: PROJECT_DIR, encoding: 'utf8', env: { ...process.env, BLADE_MAP_PATH: path } });
			} catch (e) {
				return `${e.stdout ?? ''}${e.stderr ?? ''}`;
			}
		};
		// 実マップは 0 エラー
		expect(run(MAP_PATH)).toContain('❌ 0 エラー');
		// 複製に旧盤面と同じ事故（未知の trigger）を埋めるとエラーになる
		const copy = JSON.parse(JSON.stringify(map));
		copy.layers[LAYER].stages[ROOM].showConditions = { [CHEST]: { trigger: 'stonesPushed' } };
		const bad = test.info().outputPath('map-unknown-trigger.json');
		writeFileSync(bad, JSON.stringify(copy));
		const out = run(bad);
		expect(out, '未知の trigger を見逃した').toContain("trigger 'stonesPushed' は未知");
		expect(out).not.toContain('❌ 0 エラー');
	});
});

// ── ④ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ...extra,
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
async function walk(page, dir, tiles) {
	for (let i = 0; i < tiles * 2; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
	}
}
const at = (page) => page.evaluate(() => {
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
const TOOLS = { ps_bomb: '1', ps_ladder: '1' };

test.describe('D8 崩れ壁の橋脚 ④ 実機', () => {
	test('はしごが無いと水 (4,2) を渡れない／崩す前は水 (4,2) の向こうが壁で渡れない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		// はしごを持っていても、向こう岸 (4,3) が崩れる前は架からない
		await boot(page, previewUrl(4, 1, TOOLS));
		await walk(page, 'right', 2);
		expect(await at(page), '崩す前にはしごが架かった').toBe('4,1');
		// 崩しても、はしごが無ければ渡れない
		await boot(page, previewUrl(4, 1, { ps_bomb: '1' }));
		await bomb(page);
		expect(await broken(page), '外周 (4,1) の爆弾で水越しの (4,3) が崩れない').toEqual(['4,3']);
		await walk(page, 'right', 2);
		expect(await at(page), 'はしご無しで水を渡った').toBe('4,1');
		expect(errors).toEqual([]);
	});

	test('宝箱の真下の水は幅2＝はしごを持っていても南から渡れない', async ({ page }) => {
		await boot(page, previewUrl(8, 8, TOOLS));
		await walk(page, 'up', 3);
		expect(await at(page), '幅2の水をはしごで渡った').toBe('8,8');
	});

	test('通し：水越しの爆弾→はしご→崩れ壁を橋脚に横へ降りる→水越しの爆弾→宝箱で +20→外周へ帰れる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(4, 1, TOOLS));

		// ① 西の外周 (4,1) から水越しに (4,3) を崩し、はしごで渡って控えの間 (5,4) へ
		await bomb(page);
		expect(await broken(page), '(4,1) の爆弾で (4,3) が崩れない').toEqual(['4,3']);
		await walk(page, 'right', 2);
		expect(await at(page), 'はしごで水 (4,2) を渡れない').toBe('4,3');
		await walk(page, 'down', 1);
		await walk(page, 'right', 1);
		expect(await at(page), '控えの間 (5,4) に入れない').toBe('5,4');

		// ② (5,4) の爆弾1発で往きの橋脚 (5,6) と帰りの橋脚 (6,5) が一緒に崩れる
		await bomb(page);
		expect(await broken(page), '(5,4) の爆弾で (5,6)(6,5) が崩れない').toEqual(['4,3', '5,6', '6,5']);
		// 崩れた (5,6) を向こう岸にしてはしごで水 (5,5) へ出て、横（北）の (4,5) へ降りる
		await walk(page, 'right', 1);
		expect(await at(page), 'はしごで水 (5,5) に出られない').toBe('5,5');
		await walk(page, 'up', 2);
		await walk(page, 'right', 1);
		expect(await at(page), 'はしごの上から横へ降りて北の間 (3,6) に行けない').toBe('3,6');

		// ③ 北の間 (3,6) から水越しに (3,8) を崩し、渡って宝箱 (5,8) へ
		await bomb(page);
		expect(await broken(page), '(3,6) の爆弾で (3,8) が崩れない').toEqual(['3,8', '4,3', '5,6', '6,5']);
		const r0 = await rupees(page);
		await walk(page, 'right', 2);
		expect(await at(page), 'はしごで水 (3,7) を渡れない').toBe('3,8');
		await walk(page, 'down', 2);
		expect(await at(page), '宝箱のセルに立てない').toBe(CHEST);
		expect((await ss(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await rupees(page), 'ルピーが 20 増えない').toBe(r0 + 20);

		// ④ 帰り道：北の間から (4,5) へ下り、帰りの橋脚 (6,5) を向こう岸にして水 (5,5) を縦に渡り、横（西）の (5,4) へ
		await walk(page, 'up', 2);
		await walk(page, 'left', 3);
		await walk(page, 'down', 2);
		expect(await at(page), '帰りに水 (5,5) へ出られない＝宝箱側に閉じ込められる').toBe('5,5');
		await walk(page, 'left', 1);
		expect(await at(page), '水 (5,5) から控えの間 (5,4) へ降りられない').toBe('5,4');
		await walk(page, 'left', 1);
		await walk(page, 'up', 1);
		await walk(page, 'left', 2);
		expect(await at(page), '西の外周 (4,1) へ帰れない').toBe('4,1');
		expect(errors).toEqual([]);
	});
});
