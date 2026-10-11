// tests/d2-sand-color-gates.spec.js
// dungeon_2 `3,3`（地図の庭への唯一の通り道）「二色の砂門」の番人
// （2026-10-11 / PLAN 実行キュー 41 の第3陣 5室目・盤面は `scripts/migrate-d2-3-3-sand-color-gates.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間の真ん中に回復薬が1つだけ（D1 `3,3` の写しから宝箱を抜いた形）。
//
// 新しい盤面（真ん中は砂に埋もれた祠・まわりを幅2の環が回り、四隅の色門4枚で4区画に割れる）:
//      0 #####..#####   ← 北の口（地図の庭へ）
//      1 #..........#   ┐ 北の廊下
//      2 #..........#   ┘
//      3 #((###[##))#   ← 北西の赤門・祠の北面の赤の紋（帰り道の近道）・北東の青門
//      4 ...†####]..#   ← 西の門番の間（石碑）／東の門番の間（青の紋）
//      5 ...]#####..#   ← 西の門番の間の青の紋
//      6 #))##[###((#   ← 南西の青門・祠の南面の赤の紋・南東の赤門
//      7 #..........#   ┐ 南の廊下
//      8 #.........7#   ┘
//   入口から北の口は赤門1枚の向こうに見えるが、入口の紋は青。南（青）→ 赤 → 東（赤）→ 青 → 北（青）と環を回る。
//
// 守るものは3つ。
//   ① データ（幾何）：紋と門の位置・色ごとの歩行で区画が割れる・入口に赤の紋が無い・ソルバー（剣で隣を叩くだけ）で
//      抜けられる・色の切り替え最少3回・詰み0・帰り道は赤1回の近道・どの紋が欠けても抜けられないか詰む。
//   ② データ（層の到達性）：dead-edge 0・到達室数は不変。
//   ③ 挙動（実機）：閉じた赤門は通れない／青を叩くと南西の青門が開く／南で赤を叩くと背中の青門が閉じる／
//      環を回って北の口から地図の庭 `3,2` へ抜けられる／北の赤の紋で入口へ直に戻れる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED } from '../scripts/lib/connectivity.mjs';
import { TARGET, targetBg, walkColors, solve, SIGN_DATA } from '../scripts/migrate-d2-3-3-sand-color-gates.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_2';
const ROOM = '3,3';
const stages = map.layers[LAYER].stages;
const ROWS = 10, COLS = 12;

const P = (k) => k.split(',').map(Number);
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const cellsOf = (t, ch) => t.flatMap((row, r) => row.flatMap((x, c) => (x === ch ? [`${r},${c}`] : []))).sort();
// 紋を剣で叩ける立ち位置＝紋の四方の歩ける床（盤面から引く＝紋を動かしたら検査も動く）。
const strikeCells = (t, k) => {
	const [r, c] = P(k);
	return [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => [r + dr, c + dc])
		.filter(([nr, nc]) => nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !BLOCKED.has(t[nr][nc]))
		.map(([nr, nc]) => `${nr},${nc}`);
};
const ENTRY = '5,1';     // 西の口の内側
const NORTH = ['0,5', '0,6'];

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D2 3,3 二色の砂門 ① データ', () => {
	test('盤面・紋2色×2・色門2色×4・碑・回復薬／敵・石・ボタン・links・笛の効果・初期色は無い', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		expect(cellsOf(t, TILE.SWITCH_RED).length, '赤の紋の数').toBe(2);
		expect(cellsOf(t, TILE.SWITCH_BLUE).length, '青の紋の数').toBe(2);
		expect(cellsOf(t, TILE.GATE_RED).length, '赤門の枚数').toBe(4);
		expect(cellsOf(t, TILE.GATE_BLUE).length, '青門の枚数').toBe(4);
		expect(t.flat().filter((ch) => ENEMY_META[ch]), '敵がいる').toEqual([]);
		for (const ch of [TILE.STONE, TILE.BUTTON, TILE.GATE, TILE.SWITCH]) expect(cellsOf(t, ch), `'${ch}' がある`).toEqual([]);
		expect(cellsOf(t, TILE.ITEM_HEAL_POTION), '回復薬').toEqual(['8,10']);
		const signs = cellsOf(t, TILE.MONUMENT);
		expect(signs.length, '石碑').toBe(1);
		expect(cellsOf(t, TILE.SIGN), '木の看板が碑を名乗っている').toEqual([]);
		expect(st.signData?.[signs[0]], '碑に本文が無い').toEqual(SIGN_DATA);
		expect(st.links ?? []).toEqual([]);
		// 笛の resetStones は activeColor も null に戻す＝色門の奥で吹くと閉じ込められる（持たせない）
		expect(st.fluteEffect ?? null).toBeNull();
		expect(st.initActiveColor ?? null).toBeNull();
		expect(st.bgTiles).toEqual(targetBg());
	});

	test('紋は祠の壁面＝叩く立ち位置は1つずつ／赤と青の紋は同じ行・列に無い', () => {
		const t = gridOf();
		const reds = cellsOf(t, TILE.SWITCH_RED), blues = cellsOf(t, TILE.SWITCH_BLUE);
		for (const k of [...reds, ...blues]) expect(strikeCells(t, k).length, `紋 ${k} を叩ける床の数`).toBe(1);
		// 銅の剣以上の溜め撃ちは色スイッチを貫く＝同じ線に2つあると「最後に通った色」になる（D8 3,0 と同じ作法）
		for (const a of reds) for (const b of blues) {
			const [ar, ac] = P(a), [br, bc] = P(b);
			expect(ar !== br && ac !== bc, `赤 ${a} と青 ${b} の紋が同じ行か列にある`).toBe(true);
		}
	});

	test('色ごとの歩行：閉じていれば入口から出られない／入口に赤の紋が無い／赤の紋は青門の向こう／北へは赤だけか青だけでは入口から抜けられない', () => {
		const t = gridOf();
		const none = walkColors(t, ENTRY), red = walkColors(t, ENTRY, ['red']), blue = walkColors(t, ENTRY, ['blue']);
		const both = walkColors(t, ENTRY, ['red', 'blue']);
		expect([...none].sort(), '門が全部閉じても入口の外へ出られる').toEqual(['4,0', '4,1', '4,2', '5,0', '5,1', '5,2']);
		const reds = cellsOf(t, TILE.SWITCH_RED), blues = cellsOf(t, TILE.SWITCH_BLUE);
		// 入口（門が閉じたまま立てるセル）から叩ける紋は青だけ
		const atEntry = [...reds, ...blues].filter((k) => strikeCells(t, k).some((s) => none.has(s)));
		expect(atEntry.map((k) => t[P(k)[0]][P(k)[1]]), '入口で叩ける紋が青1つでない').toEqual([TILE.SWITCH_BLUE]);
		// 赤だけ開いていれば入口から北の口へ直に届く（＝北西の赤門が入口の目の前にある＝見えている近道）
		expect(NORTH.every((k) => red.has(k)), '北西の赤門が入口と北の廊下をつないでいない').toBe(true);
		// 青だけ開けると赤の紋を叩ける立ち位置に届くが、北の口には届かない
		expect(reds.some((k) => strikeCells(t, k).some((s) => blue.has(s))), '青で入れる区画に赤の紋が無い').toBe(true);
		expect(NORTH.some((k) => blue.has(k)), '青だけで北の口に届く').toBe(false);
		expect(NORTH.every((k) => both.has(k))).toBe(true);
	});

	test('ソルバー（実ゲームと同じ遷移・剣で隣を叩くだけ）＝抜けられる・切り替え最少3回・詰み0・帰りは赤1回の近道', () => {
		const t = gridOf();
		const m = solve(t);
		expect(m.solved, '西の口から北の口へ抜けられない').toBe(true);
		expect(m.changes, '色の切り替え最少回数').toBe(3);
		expect(m.noEscape, '西の口へ戻れない状態がある＝色門の中で詰む').toBe(0);
		expect(m.arrivalColors, '初めて北の口に着いたときの色').toEqual(['2']);
		expect(m.returnChanges, '帰り道の切り替え回数（北の赤の紋で北西の赤門を開ける）').toBe(1);
	});

	test('対照：どの紋を壁にしても抜けられないか詰む（紋は全部要る）', () => {
		const t = gridOf();
		for (const k of [...cellsOf(t, TILE.SWITCH_RED), ...cellsOf(t, TILE.SWITCH_BLUE)]) {
			const tt = gridOf();
			const [r, c] = P(k);
			tt[r][c] = TILE.WALL;
			const m = solve(tt);
			expect(!m.solved || m.noEscape > 0, `紋 ${k} が無くても抜けられて詰みも無い＝飾り`).toBe(true);
		}
		// 対照の対照：北西の赤門を青にすると入口の青1回で北へ抜けられる（ソルバーが色を見ている）
		const easy = gridOf();
		easy[3][1] = TILE.GATE_BLUE; easy[3][2] = TILE.GATE_BLUE;
		expect(solve(easy).changes, '対照：入口の目の前を青門にしても切り替えが減らない＝測定が空虚').toBe(1);
	});
});

// ── ② データ（層の到達性）────────────────────────────────────────────
test.describe('D2 3,3 二色の砂門 ② データ（層の接続は不変）', () => {
	test('dead-edge 0・到達室数は不変・3,3 と 3,2 に歩いて入れる', () => {
		const start = { stage: '1,3', row: 7, col: 2 };
		const closed = bfsLayer(stages, start, { withLadder: false, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(15);
		for (const k of ['3,3', '3,2', '2,3']) expect(closed.reachedRooms.has(k), `${k} に入れない`).toBe(true);
		const open = bfsLayer(stages, start, { withLadder: false, openTiles: new Set(['T', '!', 'D', '=', TILE.GATE_RED, TILE.GATE_BLUE]) });
		expect(open.deadEdges).toEqual([]);
		expect(open.reachedCells.has('3,2:5,5'), '色門を開けても地図の庭に届かない').toBe(true);
	});
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1' });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => {
		const g = window.__game;
		g.pause();
		// 通る点（セル）を順に歩く。1 tick に半マス。着いたら次の点へ。止められたら false。
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
		// 向きを変えて剣を振る（剣のクールダウンが明けるまで進めてから）。
		window.__strike = (dir) => {
			g.step(10);
			g.setHeroDir(dir); g.step(1);
			g.swordAttack(); g.step(6);
			return g.getStageState().activeColor ?? null;
		};
		window.__pos = () => { const p = g.getPlayer(); return `${p.y},${p.x}`; };
	});
	return errors;
}

test.describe('D2 3,3 二色の砂門 ③ 実機', () => {
	test('入口：閉じた赤門は通れず、青の紋を叩くと南西の青門が開いて南の廊下へ出られる', async ({ page }) => {
		const errors = await boot(page, 5, 1);
		const r = await page.evaluate(() => {
			const g = window.__game;
			const c0 = g.getStageState().activeColor ?? null;
			const north = window.__walk([[4, 1], [2, 1]], 30);   // 北西の赤門 (3,1) で止まる
			const stopN = window.__pos();
			window.__walk([[5, 2]]);
			const c1 = window.__strike('right');                 // 青の紋 (5,3)
			const south = window.__walk([[7, 2]], 30);           // 南西の青門 (6,2) を抜ける
			return { c0, north, stopN, c1, south, at: window.__pos() };
		});
		expect(r.c0, '初めから色が付いている').toBeNull();
		expect(r.north, '閉じた赤門を抜けた').toBe(false);
		expect(r.stopN).toBe('4,1');
		expect(r.c1, '青の紋を叩いても青にならない').toBe('blue');
		expect(r.south, '青にしても南西の青門を抜けられない').toBe(true);
		expect(r.at).toBe('7,2');
		expect(errors).toEqual([]);
	});

	test('通し：南で赤を叩くと背中の青門が閉じ、東で青を叩いて北の口から地図の庭へ抜ける／北の赤で入口へ直に戻れる', async ({ page }) => {
		test.setTimeout(60_000);
		const errors = await boot(page, 5, 1);
		const r = await page.evaluate(() => {
			const g = window.__game;
			const out = {};
			window.__walk([[5, 2]]);
			out.c1 = window.__strike('right');                                  // 西の青
			out.toSouth = window.__walk([[7, 2], [7, 5]]);
			out.c2 = window.__strike('up');                                     // 南の赤 (6,5)
			out.backBlocked = !window.__walk([[7, 2], [5, 2]], 30);             // 背中の南西の青門は閉じた
			out.toEast = window.__walk([[7, 9], [4, 9]]);                       // 南東の赤門 (6,9) を抜ける
			out.c3 = window.__strike('left');                                   // 東の青 (4,8)
			out.toNorth = window.__walk([[2, 9], [2, 6]]);                      // 北東の青門 (3,9) を抜ける
			out.c4 = window.__strike('down');                                   // 北の赤 (3,6)＝帰り道の近道
			out.home = window.__walk([[2, 1], [5, 1]]);                         // 北西の赤門 (3,1) を抜けて入口へ
			out.at = window.__pos();
			return out;
		});
		expect(r.c1).toBe('blue');
		expect(r.toSouth, '南の廊下の赤の紋の前へ行けない').toBe(true);
		expect(r.c2).toBe('red');
		expect(r.backBlocked, '赤にしても背中の青門が閉じない').toBe(true);
		expect(r.toEast, '赤にしても南東の赤門を抜けられない').toBe(true);
		expect(r.c3).toBe('blue');
		expect(r.toNorth, '青にしても北東の青門を抜けられない').toBe(true);
		expect(r.c4).toBe('red');
		expect(r.home, '北の赤で北西の赤門が開かない＝帰り道の近道が無い').toBe(true);
		expect(r.at).toBe('5,1');
		expect(errors).toEqual([]);
	});

	test('北の廊下（青）から北の口へ歩くと地図の部屋 3,2 の南東の庭に出る', async ({ page }) => {
		const errors = await boot(page, 5, 1);
		await page.evaluate(() => {
			window.__walk([[5, 2]]); window.__strike('right');
			window.__walk([[7, 2], [7, 5]]); window.__strike('up');
			window.__walk([[7, 9], [4, 9]]); window.__strike('left');
			window.__walk([[2, 9], [1, 6]]);
			for (let i = 0; i < 6; i++) { window.__game.movePlayer('up'); window.__game.step(1); }
		});
		await page.waitForFunction(() => window.__game.getState().stageKey === '3,2');
		const p = await page.evaluate(() => { const pl = window.__game.getPlayer(); return { r: Math.round(pl.y), c: Math.round(pl.x) }; });
		expect(p.r, '3,2 の南の口から入っていない').toBeGreaterThanOrEqual(7);
		expect(errors).toEqual([]);
	});
});
