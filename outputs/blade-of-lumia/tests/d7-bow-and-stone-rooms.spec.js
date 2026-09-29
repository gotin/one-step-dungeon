// tests/d7-bow-and-stone-rooms.spec.js
// dungeon_7 `1,1`「弓の関門」と `1,2`「石と弓の宝の間」の番人
// （2026-09-25 / PLAN 実行キュー 30・盤面は `scripts/migrate-d7-bow-and-stone-rooms.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   ① `1,1` の Y は (3,9)＝**南 (4,9) が素の床**で剣で叩けた＝「弓でなければ開かない」が嘘だった。
//   ② `1,1` と `1,2` が `!` 2枚を除いて同一の盤面＝通すだけの部屋が2つ続いていた。
//   ③ `1,2` の Y/T は**何も守っていない飾り**だった＝門を全部閉じても入口 `1,3` から 20/22 室に
//      歩ける（`1,1` は西 `0,1`・東 `2,1` からも入れる∴`1,2` の北門は迂回できる）。
//      鍵の間 `1,0` を守っているのは `1,1` だけ∴弓の関門は `1,1` に置くのが唯一筋の通る形。
//
// 守るものは4つ。
//   ① データ（幾何）：両室の Y に**歩いて隣接できるセルが 0**＝剣では開かない。
//      `1,1` の池は 2×2＝はしごでも渡れない（幅1なら渡って斬れる＝同じ嘘の再発）。
//      `1,2` の射座は門の奥ただ1つ＝門が開くまで矢を当てられない。
//   ② データ（層の到達性）：`1,1` は門 T と爆弾壁 '!' の**両方**が本物＝片方だけでは `1,0` に届かない。
//   ③ データ（状態空間）：`1,2` の宝は**はしご・石押し・弓の3つ全部**が要る（歩行の目視では
//      判定できない＝[[blade-puzzle-must-verify-with-solver]]）。入って詰む状態が 0。
//   ④ 挙動（実機）：`1,1` は剣では開かず矢で開く。`1,2` は「はしご→石→門→矢→潮→宝箱」が通り、
//      石を乗せる前は射座に入れない。
//
// ⚠️ 報酬は**ハートの器**（矢筒ではない）＝矢筒は「dark_tower 3,2 と 3,5 の 2 個だけ」が
//    確定済みの希少さ（キュー20b ⑳）∴3個目を増やさない。ここでも 2 個のままを見張る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ROWS, COLS, makeSolver } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const BOW_ROOM = '1,1';      // 弓の関門（本道）
const HOARD = '1,2';         // 石と弓の宝の間
const stages = map.layers[LAYER].stages;

const BOW_SWITCH = '1,1';
const BOW_GATES = ['0,5', '0,6'];
const BOW_WALLS = ['1,5', '1,6'];
const BOW_POND = ['1,2', '1,3', '2,2', '2,3'];
const BOW_SHOOT = { row: 1, col: 4 };

const H_SWITCH = '1,10';
const H_TIDE = '2,1';        // Y で引く潮ゲート（宝の間の扉）
const H_GATE = '3,7';        // ボタンで開く門（射座への唯一の口）
const H_ALCOVE = '1,7';      // 唯一の射座
const H_STONE = '7,8';
const H_BUTTON = '7,10';
const H_GAP = '7,6';         // はしごで渡る幅1の水
const H_CHEST = '1,1';

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = (key) => stages[key].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const bgOf = (key) => {
	const g = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [cell, v] of Object.entries(stages[key].bgTiles ?? {})) {
		const [r, c] = cell.split(',').map(Number);
		g[r][c] = v;
	}
	return g;
};
// 歩いて立てるセルか（門は閉・壊せる壁は壊す前・水は不可）。
const standable = (t, bg, r, c) => {
	if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
	if (bg[r][c] === TILE.WATER) return false;
	const ch = t[r][c];
	if (ch === TILE.GATE || ch === TILE.TIDE_GATE || ch === TILE.BREAKABLE_WALL) return false;
	return !HARD_BLOCKED.has(ch);
};
// 直線で cell を撃ち抜ける立ち位置（壁と未破壊の '!' で止まる＝投擲物は水も門も越える）。
const shootersOf = (key, cell) => {
	const t = gridOf(key), bg = bgOf(key), out = new Set();
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		if (!standable(t, bg, r, c)) continue;
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			let rr = r + dr, cc = c + dc;
			while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
				if (`${rr},${cc}` === cell) { out.add(`${r},${c}`); break; }
				const ch = t[rr][cc];
				if (ch === TILE.WALL || ch === TILE.BREAKABLE_WALL) break;
				rr += dr; cc += dc;
			}
		}
	}
	return [...out].sort();
};

// ── ① データ（盤面・配線・幾何）────────────────────────────────────────
test.describe('D7 弓の関門と宝の間 ① データ（盤面と隔離）', () => {
	test(`${BOW_ROOM}：Y(${BOW_SWITCH}) は 2×2 の池の向こう＝歩いても剣でも届かない`, () => {
		const t = gridOf(BOW_ROOM), bg = bgOf(BOW_ROOM);
		expect(t[1][1], `Y が (${BOW_SWITCH}) に無い`).toBe(TILE.SWITCH);
		const [yr, yc] = BOW_SWITCH.split(',').map(Number);
		const around = [[yr - 1, yc], [yr + 1, yc], [yr, yc - 1], [yr, yc + 1]]
			.filter(([r, c]) => standable(t, bg, r, c)).map(([r, c]) => `${r},${c}`);
		expect(around, 'Y の隣に立てる＝剣で叩けてしまう（旧盤面の嘘の再発）').toEqual([]);
		// 池は 2×2＝どの軸でも幅2∴はしごの1マス渡りが成立しない。
		for (const cell of BOW_POND) {
			const [r, c] = cell.split(',').map(Number);
			expect(bg[r][c], `池の ${cell} が水でない（幅1に戻ると渡って斬れる）`).toBe(TILE.WATER);
		}
		// 射座は在る（＝隔離しすぎて誰も開けられない盤面ではない）。
		expect(shootersOf(BOW_ROOM, BOW_SWITCH), '矢で Y を撃てる立ち位置')
			.toEqual([`${BOW_SHOOT.row},${BOW_SHOOT.col}`]);
	});

	test(`${BOW_ROOM}：links は Y→門 ${BOW_GATES.join('/')}・ボタンは置かない`, () => {
		const st = stages[BOW_ROOM];
		expect(st.links).toEqual(BOW_GATES.map((g) => ({ switchId: BOW_SWITCH, gateId: g })));
		for (const g of BOW_GATES) {
			const [r, c] = g.split(',').map(Number);
			expect(gridOf(BOW_ROOM)[r][c], `(${g}) が門でない`).toBe(TILE.GATE);
		}
		for (const w of BOW_WALLS) {
			const [r, c] = w.split(',').map(Number);
			expect(gridOf(BOW_ROOM)[r][c], `(${w}) が爆弾壁でない`).toBe(TILE.BREAKABLE_WALL);
		}
		// ⚠️ ボタン S を1つでも置くと「全ボタンONで全T開」規則に切り替わり、Y→T の links が
		//    まるごと無視される（game/conditions.js）＝矢で門が開かなくなる。
		expect(rowsOf(stages[BOW_ROOM]).some((r) => r.includes(TILE.BUTTON)),
			'この部屋にボタンを置くと Y→T の配線が死ぬ').toBe(false);
	});

	test(`${HOARD}：射座は門 ${H_GATE} の奥 (${H_ALCOVE}) だけ＝門が開くまで矢は当たらない`, () => {
		const t = gridOf(HOARD), bg = bgOf(HOARD);
		expect(t[1][10], `Y が (${H_SWITCH}) に無い`).toBe(TILE.SWITCH);
		const [yr, yc] = H_SWITCH.split(',').map(Number);
		expect([[yr - 1, yc], [yr + 1, yc], [yr, yc - 1], [yr, yc + 1]]
			.filter(([r, c]) => standable(t, bg, r, c)).map(([r, c]) => `${r},${c}`),
		'Y の隣に立てる＝剣で開いてしまう').toEqual([]);
		expect(shootersOf(HOARD, H_SWITCH), '射座（門の奥の1セルだけ）').toEqual([H_ALCOVE]);
		// 射座へ入る口は門ただ1つ＝迂回路が無いこと（門の南 (4,7) 側からしか触れない）。
		const [gr, gc] = H_GATE.split(',').map(Number);
		expect(t[gr][gc], '門が無い').toBe(TILE.GATE);
		expect(t[2][8], '射座の東が開いている＝門を迂回できる').toBe(TILE.WALL);
		expect(t[0][7], '射座の北が開いている＝門を迂回できる').toBe(TILE.WALL);
		expect(t[1][6], '射座の西が開いている＝門を迂回できる').toBe(TILE.WALL);
	});

	test(`${HOARD}：Y は潮ゲート ${H_TIDE} に配線（ボタン盤面で T に繋ぐと死ぬ）`, () => {
		const st = stages[HOARD];
		expect(st.links).toEqual([{ switchId: H_SWITCH, gateId: H_TIDE }]);
		const t = gridOf(HOARD);
		const [tr, tc] = H_TIDE.split(',').map(Number);
		// ⚠️ ボタンのある部屋では links の T エントリが無視される（game/conditions.js）∴
		//    Y が開ける扉は潮ゲート '=' でなければならない。ここが 'T' に戻ると
		//    「ボタンを押した瞬間に宝の扉も開く」＝弓の段が消える。
		expect(t[tr][tc], '宝の扉が潮ゲートでない').toBe(TILE.TIDE_GATE);
		const [sr, sc] = H_STONE.split(',').map(Number);
		expect(t[sr][sc], '石が無い').toBe(TILE.STONE);
		const [br, bc] = H_BUTTON.split(',').map(Number);
		expect(t[br][bc], 'ボタンが無い').toBe(TILE.BUTTON);
		expect(t[7][11], 'ボタンの東が壁でない＝石を押し過ぎられる').toBe(TILE.WALL);
		expect([t[6][8], t[8][8]], '石の通路が幅1でない').toEqual([TILE.WALL, TILE.WALL]);
		const [wr, wc] = H_GAP.split(',').map(Number);
		expect(bgOf(HOARD)[wr][wc], 'はしごで渡る水が無い').toBe(TILE.WATER);
	});

	test('2室は別物の盤面＝双子を解消した／看板は増やしていない', () => {
		expect(rowsOf(stages[BOW_ROOM]).join('|')).not.toBe(rowsOf(stages[HOARD]).join('|'));
		for (const key of [BOW_ROOM, HOARD]) {
			expect(rowsOf(stages[key]).some((r) => r.includes(TILE.SIGN)),
				`${key} に看板タイルがある（キュー20c で間引いた看板は復活させない）`).toBe(false);
			expect(Object.keys(stages[key].signData ?? {}), `${key} の signData が空でない`).toEqual([]);
		}
	});

	test(`${HOARD} の報酬はハートの器／矢筒は dark_tower 2 個＋field 1 個のまま（キュー20b ⑳・キュー13）`, () => {
		expect(stages[HOARD].chestContents?.[H_CHEST])
			.toEqual({ type: 'heartContainer', name: 'ハートの器' });
		const quivers = [];
		for (const [lk, lay] of Object.entries(map.layers ?? {})) {
			for (const [sk, st] of Object.entries(lay.stages ?? {})) {
				for (const [cell, cc] of Object.entries(st.chestContents ?? {})) {
					if (cc?.item === 'quiver') quivers.push(`${lk}/${sk}(${cell})`);
				}
			}
		}
		// 3個目はキュー13（2026-09-29）で field 15,7 に置いた＝items.js の「最大3個配置」の上限
		expect(quivers.sort(), '矢筒は dark_tower の 2 個と field 15,7 だけ')
			.toEqual(['dark_tower/3,2(5,5)', 'dark_tower/3,5(4,3)', 'field/15,7(7,5)'].sort());
	});
});

// ── ② データ（層の到達性＝1,1 の二重錠）──────────────────────────────
test.describe('D7 弓の関門と宝の間 ② データ（本道の錠は両方本物）', () => {
	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の着地セル
	const run = (open) => bfsLayer(stages, START, {
		withLadder: true, openTiles: open ? new Set(open) : null,
	});

	test('門だけ開けても・壁だけ壊しても鍵の間 1,0 へは行けない（両方で1セット）', () => {
		expect(run(null).reachedRooms.has('1,0'), '何も開けずに 1,0 へ行けた').toBe(false);
		expect(run(['T']).reachedRooms.has('1,0'), '門だけで 1,0 へ行けた＝爆弾壁が飾り').toBe(false);
		expect(run(['!']).reachedRooms.has('1,0'), '壁だけで 1,0 へ行けた＝弓の門が飾り').toBe(false);
		expect(run(['T', '!']).reachedRooms.has('1,0'), '両方開けても 1,0 へ行けない').toBe(true);
	});

	test('層の接続は不変（dead-edge 0・鍵扉まで開けば全室に到達）', () => {
		const closed = run(null);
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
		expect(run(['T', '!', 'D']).reachedRooms.size, '全室に到達できない')
			.toBe(Object.keys(stages).length);
	});
});

// ── ③ データ（状態空間＝1,2 の三重の錠）───────────────────────────────
test.describe('D7 弓の関門と宝の間 ③ データ（宝は3つの道具が要る）', () => {
	const measure = (opts = {}, tiles = gridOf(HOARD)) => {
		const S = makeSolver(tiles, bgOf(HOARD), [[H_SWITCH, [H_TIDE]]], {}, new Set(),
			{ hasLadder: true, ...opts });
		const starts = ['8,5', '8,6'].map((cell) => {
			const [r, c] = cell.split(',').map(Number);
			return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
		});
		const [gr, gc] = H_CHEST.split(',').map(Number);
		return measureMetrics(S, starts, (s) => s.split('|')[0] === H_CHEST,
			(s) => {
				const [pr, pc] = s.split('|')[0].split(',').map(Number);
				return Math.abs(pr - gr) + Math.abs(pc - gc);
			},
			{ guardMax: 3_000_000, escapeTest: (s) => S.exitCells.includes(s.split('|')[0]) });
	};

	test('道具が揃えば宝箱に届き、入って詰む状態は無い', () => {
		const m = measure();
		expect(m.L, '宝箱に届かない').not.toBeNull();
		expect(m.noEscape, '入って詰む（出られない）状態がある').toBe(0);
	});

	test('弓・石押し・はしごのどれを封じても届かない（3つ全部が本物）', () => {
		expect(measure({ noTools: true }).L, '遠隔の道具なしで届いた＝潮ゲートが飾り').toBeNull();
		expect(measure({ noPush: true }).L, '石を押さずに届いた＝ボタンと門が飾り').toBeNull();
		expect(measure({ hasLadder: false }).L, 'はしご無しで届いた＝水が飾り').toBeNull();
	});

	test('対照：宝箱のセルを壁で潰すと届かない（測定が空虚でないこと）', () => {
		// [[blade-control-experiment-needs-tile-wall]]＝必ず NO になる盤面を1つ混ぜる。
		const walled = gridOf(HOARD);
		const [gr, gc] = H_CHEST.split(',').map(Number);
		walled[gr][gc] = TILE.WALL;
		expect(measure({}, walled).L, '壁で潰したセルに届いた＝測定が壊れている').toBeNull();
	});
});

// ── ④ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(stage, row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage, row: String(row), col: String(col),
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
// 石押しは**実時間**のクールダウン（`game/constants.js` STONE_PUSH_COOLDOWN_MS=600）で
// 間引かれる＝step() を積んでも連続では押せない。∴1押しごとに実時間を待つ
// （待たないと「1マスだけ動いて止まった」偽の赤になる）。
async function push(page, dir, times) {
	for (let i = 0; i < times; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
		await page.waitForTimeout(650);
	}
}
const face = async (page, dir) => {
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	await step(page, 1);
};
const shoot = async (page) => {
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bow'; });
	await page.evaluate(() => window.__game.useSubItem());
	await step(page, 30);
};

test.describe('D7 弓の関門 ④ 実機（剣では開かず矢で開く）', () => {
	test(`${BOW_ROOM}：射座 (${BOW_SHOOT.row},${BOW_SHOOT.col}) で剣を振っても門は開かない`, async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(BOW_ROOM, 3, 4));
		await walk(page, 'up', 4);
		expect(await at(page), '射座に立てない').toEqual({ r: BOW_SHOOT.row, c: BOW_SHOOT.col });
		// 西へ歩こうとしても池で止まる＝Y に近づけない。
		await walk(page, 'left', 4);
		expect((await at(page)).c, '池の上を歩けてしまった').toBe(BOW_SHOOT.col);
		await face(page, 'left');
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 6);
		const s = await ss(page);
		expect(s.switchToggles ?? [], '剣で Y が反応した（水の向こうに届いている）')
			.not.toContain(BOW_SWITCH);
		for (const g of BOW_GATES) {
			expect(s.openGates ?? [], `剣で門 (${g}) が開いた`).not.toContain(g);
		}
		expect(errors).toEqual([]);
	});

	test(`${BOW_ROOM}：矢は池を越えて Y に当たり、門 ${BOW_GATES.join('/')} が開く`, async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(BOW_ROOM, 3, 4, { ps_bow: '1' }));
		await walk(page, 'up', 4);
		await face(page, 'left');
		await shoot(page);
		const s = await ss(page);
		expect(s.switchToggles, '矢が Y に当たらない').toContain(BOW_SWITCH);
		for (const g of BOW_GATES) expect(s.openGates, `門 (${g}) が開かない`).toContain(g);
		expect(errors).toEqual([]);
	});
});

test.describe('D7 宝の間 ④ 実機（はしご→石→門→矢→潮→宝箱）', () => {
	test(`${HOARD}：はしごが無いと水 (${H_GAP}) を渡れない`, async ({ page }) => {
		await boot(page, previewUrl(HOARD, 7, 3));
		await walk(page, 'right', 10);
		expect((await at(page)).c, 'はしご無しで水を渡れてしまった').toBeLessThan(6);
	});

	test(`${HOARD}：石をボタンに乗せる前は射座に入れない（門が本物）`, async ({ page }) => {
		await boot(page, previewUrl(HOARD, 4, 7, { ps_bow: '1', ps_ladder: '1' }));
		await walk(page, 'up', 4);
		expect((await at(page)).r, '門を越えて射座へ入れてしまった').toBe(4);
		// 門の外から北へ射っても Y には当たらない＝潮は引かない。
		await face(page, 'up');
		await shoot(page);
		const s = await ss(page);
		expect(s.switchToggles ?? [], '門の外から Y に当たった').not.toContain(H_SWITCH);
		expect(s.openGates ?? [], '潮ゲートが開いた').not.toContain(H_TIDE);
	});

	test(`${HOARD}：通し＝はしごで渡り石をボタンへ、矢で潮を引いて宝箱まで`, async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(HOARD, 7, 3, { ps_bow: '1', ps_ladder: '1' }));

		// ① はしごで幅1の水 (7,6) を渡る
		await walk(page, 'right', 8);
		expect(await at(page), 'はしごで水を渡って (7,7) に立てない').toEqual({ r: 7, c: 7 });

		// ② 石 (7,8) を東へ2回押してボタン (7,10) に乗せる（1押し＝プレイヤーも1セル進む）
		await push(page, 'right', 2);
		expect(await at(page), '石を2回押した後の立ち位置').toEqual({ r: 7, c: 9 });
		const pushed = await ss(page);
		expect(Object.values(pushed.stonePositions ?? {}).map((s) => `${s.r},${s.c}`),
			`石がボタン (${H_BUTTON}) に乗っていない`).toContain(H_BUTTON);
		expect(pushed.openGates, `石をボタンに乗せても門 (${H_GATE}) が開かない`).toContain(H_GATE);
		expect(pushed.stonesLocked, '全ボタンに石が乗ったのに石ロックが立たない').toBe(true);

		// ③ 門は恒久開放（石ロック）＝ボタンから離れても閉じない
		await walk(page, 'left', 4);
		expect(await at(page), 'ボタンから離れられない').toEqual({ r: 7, c: 7 });
		expect((await ss(page)).openGates, 'ボタンから離れると門が閉じた（石ロックが効いていない）')
			.toContain(H_GATE);

		// ④ はしごで水を渡って戻り、門 (3,7) をくぐって射座 (1,7) へ
		await walk(page, 'left', 4);
		expect(await at(page), 'はしごで水を西へ渡れない').toEqual({ r: 7, c: 5 });
		await walk(page, 'up', 6);
		expect(await at(page), '(4,5) まで上がれない').toEqual({ r: 4, c: 5 });
		await walk(page, 'right', 4);
		expect(await at(page), '門の手前 (4,7) に立てない').toEqual({ r: 4, c: 7 });
		await walk(page, 'up', 6);
		expect(await at(page), `射座 (${H_ALCOVE}) に立てない（門が開いていない）`).toEqual({ r: 1, c: 7 });

		// ⑤ 東へ矢＝水の上を飛んで Y(1,10) に当たり、潮ゲート (2,1) が引く
		await face(page, 'right');
		await shoot(page);
		const s = await ss(page);
		expect(s.switchToggles, '矢が Y に当たらない').toContain(H_SWITCH);
		expect(s.openGates, `潮ゲート (${H_TIDE}) が引かない`).toContain(H_TIDE);

		// ⑥ 宝箱 (1,1) を開けるとハートの器が増える
		const before = await page.evaluate(() => window.__game.getState().player.maxHearts);
		await walk(page, 'down', 6);
		await walk(page, 'left', 12);
		expect(await at(page), '宝の間の真下 (4,1) に回り込めない').toEqual({ r: 4, c: 1 });
		await walk(page, 'up', 6);
		expect(await at(page), '宝箱のセルに立てない').toEqual({ r: 1, c: 1 });
		expect((await ss(page)).openedChests, '宝箱が開かない').toContain(H_CHEST);
		expect(await page.evaluate(() => window.__game.getState().player.maxHearts),
			'ハートの器が増えない').toBe(before + 1);
		expect(errors).toEqual([]);
	});
});
