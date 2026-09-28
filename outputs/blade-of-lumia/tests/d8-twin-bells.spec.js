// tests/d8-twin-bells.spec.js
// dungeon_8 `3,0`「二色の鐘」の番人
// （2026-09-28 / PLAN 実行キュー 34 の5室目・盤面は `scripts/migrate-d8-3-0-twin-bells.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   石 *(3,3)・ボタン S(3,6)・門 T(4,8)・宝箱 B(2,8) の部屋で、宝箱の出現条件が
//   `stonesPushed`＝エンジンに無い trigger だった∴宝箱は永久に開かず、石もボタンも門も飾り。
//
// 守るものは3つ。
//   ① データ（幾何）：色ゲート6枚が池の周りの6区画の唯一のつなぎ目／片方の色だけでは宝箱に
//      届かない／南西区画には赤の鐘への射線が無い（おとり）／池は幅 2 以上＝はしごで渡れない／
//      実ゲームと同じ遷移のソルバーで「解ける・詰み 0・色の切り替え最少 4 回・投擲物なしでは解けない」。
//   ② データ（層の到達性）：dead-edge 0・到達室数は不変。
//   ③ 挙動（実機）：池越し・閉じた門越しに矢で鐘を鳴らして4回色を移し、宝箱でルピー +20。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE, TILE_META } from '../shared/tiles.js';
import { toolsUsableIn } from '../shared/progression.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { makeSolver } from '../scripts/lib/blade-solver.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_8';
const ROOM = '3,0';
const stages = map.layers[LAYER].stages;
const ROWS = 10, COLS = 12;

const CHEST = '2,2';
const RED_BELL = '2,5';
const BLUE_BELL = '7,6';
const RED_GATES = ['2,7', '4,2', '7,7'];
const BLUE_GATES = ['2,4', '4,9', '7,4'];
const SOUTHWEST = ['5,1', '5,2', '5,3', '6,1', '6,2', '6,3', '7,1', '7,2', '7,3', '8,1', '8,2', '8,3'];

const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const bgOf = () => stages[ROOM].bgTiles ?? {};
const cellOf = (k) => k.split(',').map(Number);
const cellsOf = (t, ch) => t.flatMap((row, r) => row.flatMap((x, c) => (x === ch ? [`${r},${c}`] : []))).sort();
// 南の口から歩いて立てるセル（色ゲートは openColors に入れた色だけ通す・水は不可）。
function walkable(t, bg, openColors = []) {
	const ok = (r, c) => {
		if (bg[`${r},${c}`] === TILE.WATER) return false;
		const ch = t[r][c];
		if (ch === TILE.GATE_RED) return openColors.includes('red');
		if (ch === TILE.GATE_BLUE) return openColors.includes('blue');
		if (ch === TILE.SWITCH_RED || ch === TILE.SWITCH_BLUE) return true;
		return !HARD_BLOCKED.has(ch);
	};
	const seen = new Set(), q = [];
	for (let c = 0; c < COLS; c++) if (ok(ROWS - 1, c)) { seen.add(`${ROWS - 1},${c}`); q.push([ROWS - 1, c]); }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
// cell を直線で射抜ける立ち位置（壁と未破壊の '!' で止まる＝投擲物は水も門も越える）。
function shootersOf(t, walk, cell) {
	const [r0, c0] = cellOf(cell), out = [];
	for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
		for (let r = r0 + dr, c = c0 + dc; r >= 0 && r < ROWS && c >= 0 && c < COLS; r += dr, c += dc) {
			if (t[r][c] === TILE.WALL || t[r][c] === TILE.BREAKABLE_WALL) break;
			if (walk.has(`${r},${c}`)) out.push(`${r},${c}`);
		}
	}
	return out.sort();
}
// 実ゲームと同じ遷移（lib/blade-solver.mjs）＝解けるか・詰み・色の切り替え最少回数。
const tools = toolsUsableIn(map)[LAYER] ?? new Set();
function solve(t, bg, { noTools = false } = {}) {
	const bg2 = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => (bg[`${r},${c}`] === TILE.WATER ? '~' : 'g')));
	const S = makeSolver(t, bg2, [], {}, new Set(), { hasLadder: tools.has('ladder'), hasCandle: tools.has('candle'), noTools });
	const starts = S.exitCells.map((cell) => { const [r, c] = cellOf(cell); return S.encode(r, c, [], 0, 0, 0); });
	const edges = new Map(), seen = new Set(starts), q = [...starts];
	for (let h = 0; h < q.length; h++) {
		const ns = S.nextStates(q[h]); edges.set(q[h], ns);
		for (const n of ns) if (!seen.has(n)) { seen.add(n); q.push(n); }
	}
	const colorOf = (s) => s.split('|')[6];
	const cost = new Map(starts.map((s) => [s, 0])), dq = [...starts];
	while (dq.length) {
		const s = dq.shift();
		for (const n of edges.get(s)) {
			const w = colorOf(n) !== colorOf(s) ? 1 : 0, nk = cost.get(s) + w;
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
	return { solved: goals.length > 0, changes: goals.length ? Math.min(...goals.map((s) => cost.get(s))) : null, noEscape: q.length - ok.size };
}

// ── ① データ（盤面・幾何・ソルバー）────────────────────────────────────
test.describe('D8 二色の鐘 ① データ（盤面と隔離）', () => {
	test('鐘2つ・色ゲート6枚・宝箱・石碑の位置／石・ボタン・門 T・links・出現条件は無い', () => {
		const t = gridOf(), st = stages[ROOM];
		expect(cellsOf(t, TILE.SWITCH_RED), '赤の鐘').toEqual([RED_BELL]);
		expect(cellsOf(t, TILE.SWITCH_BLUE), '青の鐘').toEqual([BLUE_BELL]);
		expect(cellsOf(t, TILE.GATE_RED), '赤門').toEqual([...RED_GATES].sort());
		expect(cellsOf(t, TILE.GATE_BLUE), '青門').toEqual([...BLUE_GATES].sort());
		expect(cellsOf(t, TILE.CHEST), '宝箱').toEqual([CHEST]);
		for (const ch of [TILE.STONE, TILE.BUTTON, TILE.GATE, TILE.SWITCH]) {
			expect(cellsOf(t, ch), `'${ch}' が残っている`).toEqual([]);
		}
		expect(st.links).toEqual([]);
		// 旧盤面の `stonesPushed`（エンジンに無い trigger）の再発を止める
		expect(st.showConditions, '宝箱に出現条件がある').toEqual({});
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } });
		expect(t[8][4]).toBe(TILE.SIGN);
		expect(st.signData['8,4']?.lines?.length, '石碑に本文が無い').toBeGreaterThan(0);
		// 笛の resetStones は activeColor も null に戻す＝色門の奥で吹くと閉じ込められる（持たせない）
		expect(st.fluteEffect ?? null).toBeNull();
		expect(st.initActiveColor ?? null).toBeNull();
	});

	test('片方の色だけでは宝箱に届かない＝赤と青を渡り歩く必要がある', () => {
		const t = gridOf(), bg = bgOf();
		expect(walkable(t, bg).has(CHEST), '門が閉じたまま宝箱に届く').toBe(false);
		expect(walkable(t, bg, ['red']).has(CHEST), '赤だけで宝箱に届く').toBe(false);
		expect(walkable(t, bg, ['blue']).has(CHEST), '青だけで宝箱に届く').toBe(false);
		expect(walkable(t, bg, ['red', 'blue']).has(CHEST), '両方開けても届かない＝道が無い').toBe(true);
	});

	test('南西区画には赤の鐘への射線が無い（おとり）／赤と青の鐘は同じ行・列に無い', () => {
		const t = gridOf(), bg = bgOf();
		const all = walkable(t, bg, ['red', 'blue']);
		// 定数でなく盤面上の実際の鐘を見る（鐘を動かした盤面でも検査が空振りしない）
		const reds = cellsOf(t, TILE.SWITCH_RED), blues = cellsOf(t, TILE.SWITCH_BLUE);
		const redShooters = [...new Set(reds.flatMap((b) => shootersOf(t, all, b)))];
		expect(redShooters.filter((k) => SOUTHWEST.includes(k)), '南西から赤を射てる＝おとりが近道になる').toEqual([]);
		// 入口の南の床・北東の廊下・北西から赤を射てる（解き筋と帰り道の立ち位置）
		for (const k of ['8,5', '2,9', '2,3']) expect(redShooters, `${k} から赤を射てない`).toContain(k);
		// 剣ビームは鐘を貫く＝同じ線に2つ並ぶと矢と結果が変わる
		for (const rb of reds) for (const bb of blues) {
			const [rr, rc] = cellOf(rb), [br, bc] = cellOf(bb);
			expect(rr !== br && rc !== bc, `赤 ${rb} と青 ${bb} の鐘が同じ行か列にある`).toBe(true);
		}
	});

	test('池は幅 2 以上＝はしごで架けられる水が無い（鐘も橋脚に数える）', () => {
		const t = gridOf(), bg = bgOf();
		const bank = (b, r, c) => {
			if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
			const ch = t[r][c];
			if (ch === TILE.WATER || ch === TILE.PIT || b[`${r},${c}`] === TILE.WATER) return false;
			return TILE_META[ch]?.passable ?? true;
		};
		const bridge = (b, r, c) => (bank(b, r - 1, c) && bank(b, r + 1, c)) || (bank(b, r, c - 1) && bank(b, r, c + 1));
		const water = Object.keys(bg).filter((k) => bg[k] === TILE.WATER);
		expect(water.length, '池の水の枚数').toBe(12);
		expect(water.filter((k) => bridge(bg, ...cellOf(k))), 'はしごで池を渡れる').toEqual([]);
		const bg2 = { ...bg };
		delete bg2['6,5']; delete bg2['6,6']; delete bg2['6,7'];
		expect(bridge(bg2, 6, 4), '対照：幅 1 の水を見逃した＝はしご判定が壊れている').toBe(true);
	});

	test('ソルバー（実ゲームと同じ遷移）＝解ける・詰み 0・色の切り替え最少 4 回・投擲物なしでは解けない', () => {
		const t = gridOf(), bg = bgOf();
		const m = solve(t, bg);
		expect(m.solved, '解けない').toBe(true);
		expect(m.noEscape, '南の口へ戻れない状態がある＝色門の中で詰む').toBe(0);
		expect(m.changes, '色の切り替え最少回数').toBe(4);
		expect(solve(t, bg, { noTools: true }).solved, '剣で隣を叩くだけで解ける＝射る謎になっていない').toBe(false);
		for (const bell of [RED_BELL, BLUE_BELL]) {
			const k = gridOf();
			const [r, c] = cellOf(bell);
			k[r][c] = TILE.WALL;
			expect(solve(k, bg).solved, `対照：鐘 ${bell} を壁にしても解ける＝鐘が飾り`).toBe(false);
		}
	});

	test('ソルバー：閉じる側の門の上に立ったままの切替は不発（実エンジンと同じ規則）', () => {
		const t = gridOf(), bg = bgOf();
		const bg2 = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => (bg[`${r},${c}`] === TILE.WATER ? '~' : 'g')));
		const S = makeSolver(t, bg2, [], {}, new Set(), { hasLadder: false });
		const colors = (r, c, color) => new Set(S.nextStates(S.encode(r, c, [], 0, 0, 0, 0, color)).map((s) => s.split('|')[6]));
		// 青 (2) で青門 (2,4) の上＝東隣の赤の鐘 (2,5) を剣でも矢でも赤 (1) にできない
		expect(colors(2, 4, 2).has('1'), '青門の上から赤に切り替わる＝門に埋まる').toBe(false);
		// 対照：門の西 (2,3) からなら開いた門越しの矢で赤にできる
		expect(colors(2, 3, 2).has('1'), '対照：門を降りても赤にできない＝鐘の判定が壊れている').toBe(true);
	});
});

// ── ② データ（層の到達性）────────────────────────────────────────────
test.describe('D8 二色の鐘 ② データ（層の接続は不変）', () => {
	test('dead-edge 0・入口から 3,0 に歩いて入れる', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '3,0 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(21);
	});
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
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
async function walk(page, dir, ops) {
	for (let i = 0; i < ops; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
	}
}
const at = (page) => page.evaluate(() => {
	const { x, y } = window.__game.getState().player;
	return { r: y, c: x };
});
const ss = (page) => page.evaluate(() => window.__game.getStageState());
const color = async (page) => (await ss(page)).activeColor;
const rupees = (page) => page.evaluate(() => window.__game.getState().player.rupees);
const face = async (page, dir) => {
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	await step(page, 1);
};
const shoot = async (page, dir) => {
	await face(page, dir);
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bow'; });
	await page.evaluate(() => window.__game.useSubItem());
	await step(page, 40);
};

test.describe('D8 二色の鐘 ③ 実機', () => {
	test('入口で北へ剣を振っても色は変わらない（鐘は池の向こう）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(8, 5));
		await face(page, 'up');
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 6);
		expect(await color(page), '剣が池を越えて鐘に届いた').toBeNull();
		// 閉じた門は通れない（色が未設定＝赤も青も閉）
		await walk(page, 'up', 2);
		await walk(page, 'left', 4);
		expect(await at(page), '色が未設定なのに青門 (7,4) を抜けた').toEqual({ r: 7, c: 5 });
		expect(errors).toEqual([]);
	});

	test('通し：池越し→門越し→門越し→池越しに4回色を移して宝箱でルピー +20', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(8, 5, { ps_bow: '1' }));
		await toNorthCorridor(page);

		// ⑤ 青門 (2,4) を抜けて宝箱 (2,2) へ
		const r0 = await rupees(page);
		await walk(page, 'left', 8);
		expect(await at(page), '宝箱のセルに立てない（青門が開いていない）').toEqual({ r: 2, c: 2 });
		expect((await ss(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await rupees(page), 'ルピーが 20 増えない').toBe(r0 + 20);
		expect(errors).toEqual([]);
	});

	// 2026-09-28 ユーザー報告：開いた青門 (2,4) の上から赤の鐘 (2,5) を叩くと色が変わり、
	// 閉じた門の中に埋まった。石と同じく「閉じる側のゲートに重なっていたら不発」を守る。
	test('閉じる側の門の上（半マス重なりも）から鐘を叩いても色は変わらない／門を降りれば変わる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(8, 5, { ps_bow: '1' }));
		await toNorthCorridor(page);
		const swingRight = async () => {
			await face(page, 'right');
			await page.evaluate(() => window.__game.swordAttack());
			await step(page, 6);
		};

		// 鐘の上 (2,5) を抜けて青門 (2,4) の上に立ち、東隣の赤の鐘を剣で叩く
		await walk(page, 'left', 4);
		expect(await at(page), '青門 (2,4) の上に立てない').toEqual({ r: 2, c: 4 });
		await swingRight();
		expect(await color(page), '青門の上から赤の鐘を叩いたら色が変わった（門に埋まる）').toBe('blue');
		await shoot(page, 'right');
		expect(await color(page), '青門の上から矢で赤の鐘を鳴らしたら色が変わった').toBe('blue');

		// 半マスだけ門にかかった位置（門と鐘の間）からでも不発
		await walk(page, 'right', 1);
		expect(await at(page), '半マス位置に立てない').toEqual({ r: 2, c: 4.5 });
		await shoot(page, 'right');
		expect(await color(page), '半分門に重なったまま色が変わった').toBe('blue');

		// 対照：門を西へ降りれば、開いた門越しの矢で赤に変わる（不発が「鐘が壊れている」ではない）
		await walk(page, 'left', 3);
		expect(await at(page), '青門の西 (2,3) に降りられない').toEqual({ r: 2, c: 3 });
		await shoot(page, 'right');
		expect(await color(page), '門を降りても赤の鐘が鳴らない').toBe('red');
		expect(errors).toEqual([]);
	});
});

// 入口から①〜④の4回で色を移し、青のまま北の廊下 (2,6) に立つところまで。
async function toNorthCorridor(page) {
	// ① 入口から池越しに北の赤を射る
	await shoot(page, 'up');
	expect(await color(page), '池越しの矢で赤の鐘が鳴らない').toBe('red');

	// ② 赤門 (7,7) を抜けて南東へ。閉じかけの門越しに西の青を射る
	await walk(page, 'right', 2);
	await walk(page, 'up', 2);
	await walk(page, 'right', 4);
	expect(await at(page), '赤門 (7,7) を抜けられない').toEqual({ r: 7, c: 8 });
	await shoot(page, 'left');
	expect(await color(page), '門越しの矢で青の鐘が鳴らない').toBe('blue');
	await walk(page, 'left', 2);
	expect(await at(page), '青にしたのに赤門 (7,7) が閉じない').toEqual({ r: 7, c: 8 });

	// ③ 青門 (4,9) を抜けて北東へ。閉じた赤門 (2,7) 越しに赤を射る
	await walk(page, 'right', 2);
	await walk(page, 'up', 10);
	expect(await at(page), '青門 (4,9) を抜けられない').toEqual({ r: 2, c: 9 });
	await walk(page, 'left', 4);
	expect(await at(page), '青のまま赤門 (2,7) を抜けた').toEqual({ r: 2, c: 8 });
	await shoot(page, 'left');
	expect(await color(page), '閉じた門越しの矢で赤の鐘が鳴らない').toBe('red');

	// ④ 赤門 (2,7) を抜けて北の廊下へ。池越しに南の青を射る
	await walk(page, 'left', 4);
	expect(await at(page), '赤門 (2,7) を抜けられない').toEqual({ r: 2, c: 6 });
	await shoot(page, 'down');
	expect(await color(page), '池越しの矢で青の鐘が鳴らない').toBe('blue');
}
