// tests/dark-tower-1f-beam-gate.spec.js
// dark_tower 1F `1,1`「遠隔攻撃の関門」の番人（2026-09-21 / PLAN 実行キュー20b ④の 1F 分）。
//
// 直す前の実測：門 T(4,5)(5,5) が**縦に**並んでいて本道の col6 を1枚も塞いでおらず、
// `links` も空＝スイッチ Y(7,8) は叩いても何も起きない飾りだった
// （ユーザー指摘「スイッチあってもなんの意味ないよね？」）。
//
// 新しい盤面（ユーザー設計）：
//    4 #xxxxTTxxxx#   ← 門を横並びにして本道 col5/col6 の両方を塞ぐ
//    5 #xxxx..xxxx#   ← 左右に走っていた壁を穴の帯に置き換える（本道の2マスだけ床）
//    7 #.......Y..#   ← 座は穴の向こう＝歩いては触れない
// `links: [{7,8→4,5},{7,8→4,6}]`＝矢か剣ビームで座を撃つと門2枚が同時に開く。
//
// 守るものは3つ。
//
// ① データ（状態空間）：**遠隔攻撃が無いと南へ抜けられない**（＝関門が飾りでない）。
//    歩いて行けるかの目視では判定できない∴ソルバーで測る（[[blade-puzzle-must-verify-with-solver]]）。
//    対照実験で潰すセルは必ず '#'（未知文字だと通行可になる
//    ＝[[blade-control-experiment-needs-tile-wall]]）。
//    ⚠️ はしごは持たせて測る（`pitCrossable: true`）＝穴の帯を幅2にした意味を直接測る。
//      幅1なら `isLadderBridgeCell` で渡れてしまい関門が無意味になる。
//
// ② 穴が飛行で越えられないこと：`game/passable.js` の `FLYABLE_OVER` に PIT が入って
//    いない＝翼の羽衣では越えられない。ここが変わるとこの部屋の関門は丸ごと崩れるので
//    ソースを直接見張る（エクスポートされていないので import では読めない）。
//
// ③ 挙動（実機）：門が実際に通行を止め、**弓でも剣ビームでも**開く。
//    剣ビームでも開くことが要点＝矢を切らしても詰まない∴この関門の不変条件は
//    「遠隔攻撃が必須」であって「弓が必須」ではない（弓の卒業試験は D3 `1,0` が担う）。
//    ⚠️ `fromEditor=1` プレビューは debugMode=true ＝壁も門もすり抜ける（無敵）ので
//       「門が通れない」の検証には使えない。セーブを仕込んで「つづきから」で入る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, SAVE_KEY } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ROWS, COLS, makeSolver } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const PASSABLE_PATH = fileURLToPath(new URL('../game/passable.js', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dark_tower';
const ROOM = '1,1';
const SWITCH = '7,8';
const GATES = ['4,5', '4,6'];
const NORTH_IN = ['1,5', '1,6'];   // 北の入口 (0,5)(0,6) から入った直後の室内セル
const SOUTH_OUT = '8,5';           // 南の出口 (9,5) の手前＝ここに届けば南へ抜けられる
const EDGES = 'N[5,6] S[5,6] W[] E[]';

// ── ① データ（状態空間）────────────────────────────────────────────────
function rowsOf(st) {
	return st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
}

function edgeSig(rows) {
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[ROWS - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[COLS - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
}

/**
 * 北の入口から `SOUTH_OUT` まで抜けられるか測る。
 * `noTools: true` ＝遠隔攻撃なし（剣だけ）／`kill` ＝そのセルを壁で潰す対照実験。
 */
function measureRoom({ noTools = false, kill = null } = {}) {
	const st = map.layers[LAYER].stages[ROOM];
	const tiles = st.tiles.map((r) => (Array.isArray(r) ? r.slice() : [...r]));
	if (kill) {
		const [r, c] = kill.split(',').map(Number);
		tiles[r][c] = TILE.WALL;
	}
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [k, ch] of Object.entries(st.bgTiles ?? {})) {
		const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
	}
	const linkMap = new Map();
	for (const { switchId, gateId } of st.links ?? []) {
		if (!linkMap.has(switchId)) linkMap.set(switchId, []);
		linkMap.get(switchId).push(gateId);
	}
	// はしごを持たせ、穴も「はしごで幅1なら渡れる」実エンジンどおりの規則で測る
	// ＝穴の帯を幅2にしたことが関門を成立させている、という主張をここで直接測る。
	const S = makeSolver(tiles, bg, [...linkMap.entries()], {}, new Set(),
		{ hasLadder: true, pitCrossable: true, noTools });
	const starts = NORTH_IN.map((cell) => {
		const [r, c] = cell.split(',').map(Number);
		return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
	});
	const [gr, gc] = SOUTH_OUT.split(',').map(Number);
	return measureMetrics(
		S,
		starts,
		(state) => state.split('|')[0] === SOUTH_OUT,
		(state) => {
			const [pr, pc] = state.split('|')[0].split(',').map(Number);
			return Math.abs(pr - gr) + Math.abs(pc - gc);
		},
		// escapeTest を渡さないと noEscape が null になる（＝「入って詰まない」を測れない）
		{ guardMax: 2_000_000, escapeTest: (state) => S.exitCells.includes(state.split('|')[0]) },
	);
}

test.describe('Blade of Lumia – dark_tower 1F の遠隔攻撃の関門（キュー20b ④）', () => {
	test(`データ：${LAYER} ${ROOM} の盤面と配線`, () => {
		const st = map.layers[LAYER].stages[ROOM];
		const rows = rowsOf(st);
		expect(rows[4], 'row4＝横並びの門が本道を塞ぐ').toBe('#xxxxTTxxxx#');
		expect(rows[5], 'row5＝穴の帯（本道の2マスだけ床）').toBe('#xxxx..xxxx#');
		const [sr, sc] = SWITCH.split(',').map(Number);
		expect(st.tiles[sr][sc], `(${SWITCH}) はスイッチ 'Y'`).toBe(TILE.SWITCH);
		for (const g of GATES) {
			const [gr, gc] = g.split(',').map(Number);
			expect(st.tiles[gr][gc], `(${g}) は門 'T'`).toBe(TILE.GATE);
		}
		// 配線は links だけが担う（ステージの switchToggles は誰も読まない幽霊フィールド）
		expect(st.switchToggles, 'ステージに幽霊フィールド switchToggles が無い').toBeUndefined();
		expect(st.links, '座1つで門2枚を開ける').toEqual(
			GATES.map((g) => ({ switchId: SWITCH, gateId: g })));

		// 穴の帯は本道の外で上下2行＝どの向きでも幅2（はしごで渡れない幅）
		for (let c = 1; c <= COLS - 2; c++) {
			if (c === 5 || c === 6) continue;
			expect(st.tiles[4][c], `(4,${c}) は穴`).toBe(TILE.PIT);
			expect(st.tiles[5][c], `(5,${c}) は穴`).toBe(TILE.PIT);
		}
	});

	test(`データ：${LAYER} ${ROOM} は遠隔攻撃が無いと南へ抜けられない`, () => {
		// 素の測定＝抜けられる／浅すぎない／入って詰まない
		// ⚠️ 抜けられないときの L は `null`（`lib/puzzle-metrics.mjs` の表現）＝Infinity ではない。
		const m = measureRoom();
		expect(m.L, '南の出口へ届く（解なし＝null ではない）').not.toBeNull();
		expect(m.L, `最短手数 L=${m.L} が6以上`).toBeGreaterThanOrEqual(6);
		expect(m.noEscape, '入って詰む状態は無い').toBe(0);

		// 対照実験①＝遠隔攻撃を封じると届かない（近接だけでは絶対に開かない）
		expect(measureRoom({ noTools: true }).L,
			'対照実験（遠隔攻撃なし・はしごあり）では南へ抜けられない').toBeNull();

		// 対照実験②＝座を壁で潰すと届かない（門を開ける手段が他に無い）
		expect(measureRoom({ kill: SWITCH }).L,
			'対照実験（座を壁で潰す）では南へ抜けられない').toBeNull();

		// 歯の確認＝既に通れるセルを潰しても結果が変わらない（対照実験が空振りでない証明）
		expect(measureRoom({ kill: '2,9' }).L, '無関係な床を潰しても抜けられる').not.toBeNull();
	});

	test(`データ：${LAYER} ${ROOM} の境界の開きは不変（部屋間の接続を動かさない）`, () => {
		expect(edgeSig(rowsOf(map.layers[LAYER].stages[ROOM]))).toBe(EDGES);
	});

	// ── ② 穴は飛行では越えられない ──────────────────────────────────────
	test('穴 PIT は FLYABLE_OVER に入っていない（翼の羽衣で関門を飛び越えられない）', () => {
		const src = readFileSync(PASSABLE_PATH, 'utf8');
		const m = src.match(/const FLYABLE_OVER = new Set\(\[([\s\S]*?)\]\)/);
		expect(m, 'passable.js の FLYABLE_OVER が見つからない').not.toBeNull();
		expect(m[1], 'PIT が飛べるようになると 1,1 の関門が崩れる').not.toContain('PIT');
	});
});

// ── ③ 挙動（実機・セーブ経由＝debugMode OFF）──────────────────────────────
/** セーブを仕込んで「つづきから」で入る＝無敵もすり抜けも無い素の状態。 */
async function startAt(page, { row, col, dir = 'down', bow = false, ladder = true }) {
	const subItems = {};
	if (bow) subItems.bow = { count: 99 };
	const save = JSON.stringify({
		player: {
			x: col, y: row,
			hp: 6, maxHp: 6, maxHearts: 3, atk: 99, def: 0, keys: 0,
			weapon: 'sword', swordTier: 1, shield: null, armor: null,
			subItems, activeSubItem: bow ? 'bow' : null,
			hasLadder: ladder,
			rupees: 0, triforceCount: 0,
		},
		stageState: {},
		currentLayer: LAYER,
		stageKey: ROOM,
		heroDir: dir,
	});
	await page.addInitScript(({ k, v }) => {
		try { localStorage.setItem(k, v); } catch { /* noop */ }
	}, { k: SAVE_KEY, v: save });
	await page.goto(GAME_URL);
	await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
	await page.locator('#btn-continue').click();
	await page.waitForFunction(() => {
		const b = document.getElementById('board');
		return !!b && b.children.length > 0;
	});
	await page.evaluate(() => window.__game.pause());   // 実ループを止める＝経路が揺れない
}

const posOf = (page) => page.evaluate(() => {
	const p = window.__game.getState().player;
	return { x: p.x, y: p.y };
});
const ssOf = (page) => page.evaluate(() => window.__game.getStageState());

/**
 * 目標セルへ歩く。`movePlayer` 1回＝半マス（[[blade-moveplayer-is-half-tile]]）∴
 * 回数で数えずに**到達するまで繰り返す**。
 */
async function moveTo(page, cell, { guard = 40 } = {}) {
	const [tr, tc] = cell.split(',').map(Number);
	let p = await posOf(page);
	if (p.y !== tr && p.x !== tc) throw new Error(`moveTo は1軸ずつ: (${p.y},${p.x}) → (${cell})`);
	const dir = tr < p.y ? 'up' : tr > p.y ? 'down' : tc < p.x ? 'left' : 'right';
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	for (let i = 0; i < guard; i++) {
		p = await posOf(page);
		if (p.x === tc && p.y === tr) break;
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
	p = await posOf(page);
	expect(`${p.y},${p.x}`, `(${cell}) へ到達`).toBe(cell);
}

/** 壁/穴/閉じた門に阻まれることを確かめる＝何度押しても座標が動かない。 */
async function pushInto(page, dir, times = 8) {
	const before = await posOf(page);
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	for (let i = 0; i < times; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
	return { before, after: await posOf(page) };
}

test.describe('Blade of Lumia – dark_tower 1,1 の門は実機で通行を止める（キュー20b ④）', () => {
	test('矢で座を撃つまで門は通れない／撃てば南へ抜けられる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await startAt(page, { row: 2, col: 8, dir: 'down', bow: true });
		const ss0 = await ssOf(page);
		for (const g of GATES) expect(ss0.openGates ?? [], `入室時 ${g} は閉じている`).not.toContain(g);

		// ① 閉じた門は通れない（本道 col5）
		await moveTo(page, '2,5');
		await moveTo(page, '3,5');
		const atGate = await pushInto(page, 'down');
		expect(atGate.after, '閉じた門に阻まれて1歩も進めない').toEqual(atGate.before);

		// ② 穴の帯も渡れない（はしごを持っていても幅2は渡れない）
		expect(await page.evaluate(() => window.__game.getPlayer().hasLadder),
			'はしごを持っている前提のテスト').toBe(true);
		await moveTo(page, '3,2');
		const atPit = await pushInto(page, 'down');
		expect(atPit.after, 'はしごを持っていても幅2の穴は渡れない').toEqual(atPit.before);

		// ③ col8 から南へ矢を射る＝穴の上を飛んで Y(7,8) に当たる
		await moveTo(page, '3,8');
		await page.evaluate(() => window.__game.setHeroDir('down'));
		await page.evaluate(() => window.__game.useSubItem());
		for (let i = 0; i < 20; i++) await page.evaluate(() => window.__game.step(1));

		const ss1 = await ssOf(page);
		expect(ss1.switchToggles, `矢が Y(${SWITCH}) をトグルした`).toContain(SWITCH);
		for (const g of GATES) expect(ss1.openGates, `門 ${g} が開いた`).toContain(g);
		// ボタン（switchStates）には一切作用しない（'S' と 'Y' は別物＝[[blade-button-vs-switch]]）
		expect(ss1.switchStates?.[SWITCH], 'ボタンの状態は立たない').toBeUndefined();

		// ④ 開いた門を通って南へ抜ける
		await moveTo(page, '3,5');
		await moveTo(page, SOUTH_OUT);
		expect(errors).toEqual([]);
	});

	test('弓が無くても剣ビームで開く（矢を切らしても詰まない）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		// 弓なし＝サブアイテムを何も持たない。剣ビームは溜め攻撃∴弾切れしない。
		await startAt(page, { row: 3, col: 8, dir: 'down', bow: false });
		expect(await page.evaluate(() => window.__game.getPlayer().subItems ?? {}),
			'サブアイテムを持っていない').toEqual({});

		// 溜めて離す（CHARGE_FULL_MS=720ms / TICK=120ms ∴3フレームで 1/2 チャージ＝弱ビーム）
		await page.evaluate(() => window.__game.setHeroDir('down'));
		await page.evaluate(() => window.__game.startCharge());
		await page.evaluate(() => window.__game.step(3));
		await page.evaluate(() => window.__game.releaseCharge());
		for (let i = 0; i < 20; i++) await page.evaluate(() => window.__game.step(1));

		const ss = await ssOf(page);
		expect(ss.switchToggles, `剣ビームが Y(${SWITCH}) をトグルした`).toContain(SWITCH);
		for (const g of GATES) expect(ss.openGates, `門 ${g} が開いた`).toContain(g);

		await moveTo(page, '3,5');
		await moveTo(page, SOUTH_OUT);
		expect(errors).toEqual([]);
	});
});
