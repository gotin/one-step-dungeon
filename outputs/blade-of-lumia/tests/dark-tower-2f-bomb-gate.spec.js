// tests/dark-tower-2f-bomb-gate.spec.js
// dark_tower 2F「爆弾の関門」と「かがり火3本の封印の宝」の番人
// （2026-09-22 / PLAN 実行キュー20b ④の 2F 分）。
//
// 直す前の実測：
//   ・`2,1` の破壊壁 `!` は (6,10)(7,10)＝**東の外壁に貼り付いた飾り**で、部屋は北から南まで
//     素通しだった（`breakableWalls` の鍵も 1 マスずれて外壁 col11 を指し、値は `true`）。
//   ・`2,2 (5,5)` ↔ `2,3 (5,4)` の `torchesLit` 近道ワープは、**歩いて素通しの隣室**を結ぶ
//     だけ＝かがり火3本の報酬が実質ゼロだった。
//   ∴ 2F はどの道具も要らない通路で、20b の「階＝道具の卒業試験」に反していた。
//
// 新しい機構：
//    2 #....5.....#   ← 爆弾の山（本道 col5 の上）
//    4 #####!!#####   ← 破壊壁2枚＝2F の関門（爆弾が無いと南へ抜けられない）
//   `2,2` は同じセルを封印の宝箱にして、かがり火3本でハートの器（塔で唯一）が出る。
//   案内の刻み文は2室とも置かない（(1,1) に置いていたが、キュー20c＝ユーザー判定
//   2026-09-24 で外した。罅割れ壁は専用の絵・爆弾の作法は dungeon_6 1,2 で既習）。
//
// 守るものは4つ。
//
// ① データ（状態空間）：**爆弾が無いと南へ抜けられない**（＝関門が飾りでない）。
//    歩いて行けるかの目視では判定できない∴ソルバーで測る（[[blade-puzzle-must-verify-with-solver]]）。
//    対照実験が空振りでないことも同時に測る（無関係な床を潰しても抜けられる）。
// ② 詰み防止：**関門の手前に爆弾の山がある**。世界で爆弾が手に入るのは dungeon_6 `1,2` の
//    宝箱（1回・3個）だけ＝消費品を使い切っていたら、この壁は永久に開かない壁になる。
//    山は `2,1` の**北半分**（関門より手前）に在ること・床の爆弾が拾えることの両方を見る。
// ③ 封印の宝は寄道であること：灯さなくても南へは抜けられる／灯す前に踏んでも開かない。
// ④ 挙動（実機）：壁が実際に通行を止め、爆弾1個で2枚とも砕け、ロウソク3本で宝箱が現れる。
//    `fromEditor=1` プレビューで確かめられる（`game/passable.js tilePassable` の debugMode が
//    素通しにするのは鍵扉 `D` と敵の重なりだけ＝壁・破壊壁・門は debugMode でも止まる。
//    先例＝`tests/field-desert-south.spec.js` ②）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ROWS, COLS, makeSolver } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dark_tower';
const GATE_ROOM  = '2,1';
const TORCH_ROOM = '2,2';
const HALL_ROOM  = '2,3';
const WALLS = ['4,5', '4,6'];
const BOMBS = '2,5';
const CHEST = '5,5';
const TORCHES = ['2,3', '2,6', '2,9'];
const NORTH_IN = ['1,5', '1,6'];   // 北の入口 (0,5)(0,6) から入った直後の室内セル
const SOUTH_OUT = '9,5';           // 南の出口＝ここに届けば 2,2 へ抜けられる
const EDGES = 'N[5,6] S[5,6] W[] E[]';

const GATE_ROWS = [
	'#####..#####',
	'#..........#',
	'#....5.....#',
	'#..........#',
	'#####!!#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

function edgeSig(rows) {
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[ROWS - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[COLS - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
}

/**
 * 北の入口から `goal` まで抜けられるか測る。
 * `noTools: true` ＝道具を全部封じる（＝爆弾なし）／`kill` ＝そのセルを壁で潰す対照実験。
 * ⚠️ 潰すセルは必ず `'#'`（未知の文字は通行可になる＝[[blade-control-experiment-needs-tile-wall]]）。
 */
function measureRoom({ noTools = false, kill = null, goal = SOUTH_OUT } = {}) {
	const st = map.layers[LAYER].stages[GATE_ROOM];
	const tiles = st.tiles.map((r) => (Array.isArray(r) ? r.slice() : [...r]));
	if (kill) {
		const [r, c] = kill.split(',').map(Number);
		tiles[r][c] = TILE.WALL;
	}
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [k, ch] of Object.entries(st.bgTiles ?? {})) {
		const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
	}
	const breakDefs = {};
	for (const [k, v] of Object.entries(st.breakableWalls ?? {})) breakDefs[k] = v.breakDef ?? 1;
	// はしごは持たせて測る＝「はしごで迂回できない」も同時に潰す（この部屋に穴も水も無い∴
	// 迂回路が生えないことの確認）。
	const S = makeSolver(tiles, bg, [], breakDefs, new Set(),
		{ hasLadder: true, pitCrossable: true, noTools });
	const starts = NORTH_IN.map((cell) => {
		const [r, c] = cell.split(',').map(Number);
		return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
	});
	const [gr, gc] = goal.split(',').map(Number);
	return measureMetrics(
		S,
		starts,
		(state) => state.split('|')[0] === goal,
		(state) => {
			const [pr, pc] = state.split('|')[0].split(',').map(Number);
			return Math.abs(pr - gr) + Math.abs(pc - gc);
		},
		// escapeTest を渡さないと noEscape が null になる（＝「入って詰まない」を測れない）
		{ guardMax: 2_000_000, escapeTest: (state) => S.exitCells.includes(state.split('|')[0]) },
	);
}

test.describe('Blade of Lumia – dark_tower 2F の爆弾の関門（キュー20b ④）', () => {
	test(`データ：${LAYER} ${GATE_ROOM} の盤面`, () => {
		const st = map.layers[LAYER].stages[GATE_ROOM];
		expect(rowsOf(st), '2,1 の盤面').toEqual(GATE_ROWS);

		// 破壊壁は本道の2枚だけ（東の外壁に貼り付いた旧・飾りが残っていない）
		const bangs = [];
		for (let r = 0; r < st.rows; r++) {
			for (let c = 0; c < st.cols; c++) if (st.tiles[r][c] === TILE.BREAKABLE_WALL) bangs.push(`${r},${c}`);
		}
		expect(bangs, '破壊壁は本道 col5/col6 の2枚だけ').toEqual(WALLS);

		// breakableWalls＝鍵が '!' を指し、値が {breakDef} の形
		// （`game/projectile.js:942` は `?.breakDef ?? 1`＝形が違うと黙って既定 1 に落ちる）
		expect(st.breakableWalls, 'breakableWalls が破壊壁2枚を {breakDef} で指す')
			.toEqual({ '4,5': { breakDef: 1 }, '4,6': { breakDef: 1 } });

		// ⚠️ 案内の刻み文は置かない（キュー20c・ユーザー判定 2026-09-24）。罅割れ壁 '!' は
		// 専用の絵（sprite breakableWall）で壁と見分けられ、爆弾で崩す作法は入手地点
		// dungeon_6 1,2 の「二枚の 岩壁は それでしか 崩れぬ」で既に教えている。
		// 'i' タイルと signData の**両方**が無いことを見張る（片方だけ残すと無言看板／死にデータ）。
		expect(st.tiles[1][1], '(1,1) は素の床（刻み文を外した跡）').toBe(TILE.FLOOR);
		expect(rowsOf(st).some((row) => row.includes(TILE.SIGN)), "看板タイル 'i' が1枚も無い").toBe(false);
		expect(Object.keys(st.signData ?? {}), 'signData も空（死にデータを残さない）').toEqual([]);
	});

	test(`データ：${LAYER} ${GATE_ROOM} は爆弾が無いと南へ抜けられない`, () => {
		// 素の測定＝抜けられる／浅すぎない／入って詰まない
		// ⚠️ 抜けられないときの L は `null`（`lib/puzzle-metrics.mjs` の表現）＝Infinity ではない。
		const m = measureRoom();
		expect(m.L, '南の出口へ届く（解なし＝null ではない）').not.toBeNull();
		expect(m.noEscape, '入って詰む状態は無い').toBe(0);

		// 対照実験＝道具を封じる（＝爆弾なし）と届かない
		expect(measureRoom({ noTools: true }).L,
			'対照実験（爆弾なし・はしごあり）では南へ抜けられない').toBeNull();

		// 歯の確認＝既に通れる床を潰しても結果が変わらない（対照実験が空振りでない証明）
		expect(measureRoom({ kill: '3,9' }).L, '無関係な床を潰しても抜けられる').not.toBeNull();
	});

	// ── ② 詰み防止（爆弾は世界で1回しか手に入らない消費品）────────────────────
	test(`データ：爆弾の山が関門の手前（${GATE_ROOM} 北半分）に在る`, () => {
		const st = map.layers[LAYER].stages[GATE_ROOM];
		const [br, bc] = BOMBS.split(',').map(Number);
		expect(st.tiles[br][bc], `(${BOMBS}) は床の爆弾 '5'`).toBe(TILE.ITEM_BOMB);
		const wallRow = Number(WALLS[0].split(',')[0]);
		expect(br, '爆弾の山は関門の壁より北（手前）に在る').toBeLessThan(wallRow);

		// 爆弾なしでも山には届く（＝関門の手前で必ず補給できる）
		expect(measureRoom({ noTools: true, goal: BOMBS }).L,
			'爆弾なしでは爆弾の山にも辿り着けない＝詰み').not.toBeNull();

		// 世界の爆弾の出どころ＝dungeon_6 の宝箱 1 個だけ、という前提の見張り。
		// ここが増えて「どこでも補給できる」ようになったら、この山は要らなくなる（設計を見直す）。
		let sources = 0;
		for (const layer of Object.values(map.layers)) {
			for (const st2 of Object.values(layer.stages ?? {})) {
				for (const cc of Object.values(st2.chestContents ?? {})) {
					if (cc?.item === 'bomb' || cc?.type === 'bomb') sources++;
				}
			}
		}
		expect(sources, '爆弾を配る宝箱が増減した＝2,1 の山の要否を再設計する').toBe(1);
	});

	test(`データ：${LAYER} ${GATE_ROOM} の境界の開きは不変（部屋間の接続を動かさない）`, () => {
		expect(edgeSig(rowsOf(map.layers[LAYER].stages[GATE_ROOM]))).toBe(EDGES);
	});

	// ── ③ 封印の宝は寄道（近道ワープの置き換え）────────────────────────────
	test(`データ：${LAYER} ${TORCH_ROOM} の封印の宝箱と、撤去した近道ワープ`, () => {
		const st = map.layers[LAYER].stages[TORCH_ROOM];
		const [cr, cc] = CHEST.split(',').map(Number);
		expect(st.tiles[cr][cc], `(${CHEST}) は宝箱 'B'`).toBe(TILE.CHEST);
		expect(rowsOf(st).some((row) => row.includes(TILE.MAP_ENTER)),
			'近道ワープ \'>\' が残っている').toBe(false);
		expect(Object.keys(st.mapEnters ?? {}), '2,2 の mapEnters は空').toEqual([]);
		expect(st.showConditions?.[CHEST]?.trigger, '封印は torchesLit').toBe('torchesLit');
		expect(typeof st.showConditions?.[CHEST]?.message, '開封の文がある').toBe('string');
		expect(st.chestContents?.[CHEST]?.type, '中身はハートの器').toBe('heartContainer');

		// torchesLit は「室内の全 TORCH」が対象（`game/conditions.js:185`）∴本数が変わると難度が変わる
		const torches = [];
		for (let r = 0; r < st.rows; r++) {
			for (let c = 0; c < st.cols; c++) if (st.tiles[r][c] === TILE.TORCH) torches.push(`${r},${c}`);
		}
		expect(torches, 'かがり火は3本').toEqual(TORCHES);

		// 反対側（2,3）＝階段だけが残っている
		const hall = map.layers[LAYER].stages[HALL_ROOM];
		expect(Object.keys(hall.mapEnters ?? {}), '2,3 の出入口は上階の階段だけ').toEqual(['8,4']);

		// 撤去した id が塔のどこにも残っていない（死んだ行き先＝踏めない入口の再発防止）
		const dead = [];
		for (const [k, s] of Object.entries(map.layers[LAYER].stages)) {
			for (const [cell, ent] of Object.entries(s.mapEnters ?? {})) {
				if (['2fCandleGate', '2fMidBoss'].includes(ent?.id)
					|| ['2fCandleGate', '2fMidBoss'].includes(ent?.destId)) dead.push(`${k}(${cell})`);
			}
		}
		expect(dead, '撤去した近道ワープの id が残っている').toEqual([]);
	});

	test('データ：塔のハートの器は 2,2 の1個だけ（キュー20b ⑳の是正の第一歩）', () => {
		const found = [];
		for (const [k, s] of Object.entries(map.layers[LAYER].stages)) {
			for (const [cell, cc] of Object.entries(s.chestContents ?? {})) {
				if (cc?.type === 'heartContainer' || cc?.item === 'heartContainer') found.push(`${k}(${cell})`);
			}
		}
		expect(found, '塔のハートの器').toEqual([`${TORCH_ROOM}(${CHEST})`]);
	});
});

// ── ④ 挙動（実機・fromEditor=1 プレビュー）──────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(stage, row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage, row: String(row), col: String(col), ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
/** n タイル歩く（1タイル = movePlayer 2回／MOVE_STEP = 0.5 セル＝[[blade-moveplayer-is-half-tile]]）。 */
async function walkTiles(page, dir, tiles = 1) {
	await page.evaluate(({ d, n }) => {
		for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
	}, { d: dir, n: tiles });
}
async function step(page, n) { for (let i = 0; i < n; i++) await page.evaluate(() => window.__game.step(1)); }
/**
 * ダイアログを閉じる。**道具を初めて手にすると `maybeShowSubItemHint()`（`game/game.js:741`）が
 * 3ページの説明を開き、閉じるまで movePlayer が丸ごと無視される**
 * （`game/player.js:380` の `getIsDialog()` ガード）。床の爆弾を拾った直後がまさにこれ＝
 * 拾えたのに一歩も動けず「壁に阻まれた」と読み違えるので、必ず閉じてから歩く。
 * 送るキーは 'z'（`game/input.js:100`）＝Enter はダイアログが閉じた後に一時停止を
 * トグルしてしまう（同 :111）ので使わない。
 */
async function dismissDialog(page) {
	for (let i = 0; i < 8; i++) {
		if (!(await page.evaluate(() => window.__game.getState().isDialog))) return;
		await page.keyboard.press('z');
		await page.waitForTimeout(60);
	}
	expect(await page.evaluate(() => window.__game.getState().isDialog), 'ダイアログが閉じない').toBe(false);
}
/**
 * `row` 行に着くまで歩く。`movePlayer` 1回＝半マス（[[blade-moveplayer-is-half-tile]]）で、
 * 床の道具を拾うと半マス目で止まる∴回数で数えず**着くまで繰り返す**（1F の moveTo と同じ作法）。
 */
async function walkToRow(page, dir, row, { guard = 40 } = {}) {
	for (let i = 0; i < guard; i++) {
		if ((await at(page)).r === row) break;
		await page.evaluate((d) => { window.__game.movePlayer(d); window.__game.step(1); }, dir);
	}
}
// ⚠️ プレイヤーの持ち物は `getPlayer()` で読む。`getState().player` は subItems を含まない
//    スナップショット＝内部名で読むと例外なく 0 になる（[[blade-snapshot-api-names]]）。
const at = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});
const ss = (page) => page.evaluate(() => window.__game.getStageState());
const bombCount = (page) => page.evaluate(() => window.__game.getPlayer().subItems?.bomb?.count ?? 0);

test.describe('Blade of Lumia – dark_tower 2F は実機で爆弾を要求する（キュー20b ④）', () => {
	test('爆弾が無いと壁に阻まれる／床の爆弾を拾って1個で2枚とも砕ける', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		// ① 爆弾を持たずに壁の手前 (3,5) から南を押す＝1歩も進めない。
		//    （山 (2,5) を踏まない位置から始める＝拾ってしまわない）
		await page.goto(previewUrl(GATE_ROOM, 3, 5));
		await waitForBoard(page);
		expect(await bombCount(page), '爆弾を持たない前提のテスト').toBe(0);
		await walkTiles(page, 'down', 3);
		expect((await at(page)).r, '爆弾なしで破壊壁を通り抜けてしまった').toBe(3);

		// ② 北の入口から歩くと爆弾の山 (2,5) を踏んで補給できる（＝関門で詰まない）
		await page.goto(previewUrl(GATE_ROOM, 1, 5));
		await waitForBoard(page);
		await walkTiles(page, 'down', 1);
		expect(await at(page), '爆弾の山 (2,5) に乗れない').toMatchObject({ r: 2, c: 5 });
		expect(await bombCount(page), '床の爆弾を拾えない＝爆弾を使い切ったら塔が詰む')
			.toBeGreaterThanOrEqual(1);
		expect(await page.evaluate(() => window.__game.getPlayer().activeSubItem),
			'拾った爆弾が手に持たれる').toBe('bomb');
		await dismissDialog(page);   // 初めての道具＝ヒントが開いている（閉じるまで歩けない）

		// ③ 壁の手前 (3,5) で爆弾を1個置く＝爆風（半径2の円）が '!' 2枚とも砕く
		await walkToRow(page, 'down', 3);
		expect(await at(page), '壁の手前 (3,5) に立てない').toMatchObject({ r: 3, c: 5 });
		const before = await bombCount(page);
		expect((await ss(page)).brokenWalls ?? [], '最初から壁が壊れている').not.toContain(WALLS[0]);
		await page.evaluate(() => {
			window.__game.step(2);        // クールダウン解消
			window.__game.useSubItem();   // 爆弾設置（足元に置かれる）
			window.__game.step(20);       // 爆発まで 2000ms（TICK_MS=120 × 20）
		});
		const after = await ss(page);
		expect(after.brokenWalls, `爆弾1個で ${WALLS[0]} が砕けない`).toContain(WALLS[0]);
		expect(after.brokenWalls, `爆弾1個で ${WALLS[1]} も砕けない（爆風半径2の円）`).toContain(WALLS[1]);
		expect(await bombCount(page), '爆弾が減っていない').toBe(before - 1);

		// ④ 砕けた壁を通って南の出口まで抜けられる
		await walkToRow(page, 'down', 9, { guard: 60 });
		expect((await at(page)).r, '砕いた壁を通って南へ抜けられない').toBeGreaterThanOrEqual(9);
		expect(errors, `page errors on ${GATE_ROOM}:\n${errors.join('\n')}`).toEqual([]);
	});

	test('2,2 はロウソク3本で封印の宝箱が現れる（灯す前に踏んでも開かない）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await page.goto(previewUrl(TORCH_ROOM, 3, 3, { ps_candle: '1' }));
		await waitForBoard(page);
		const boot = await ss(page);
		expect(boot.litTorches ?? [], '最初から点いている').toEqual([]);
		expect(boot.conditionsMet ?? [], '点ける前に封印が解けている').not.toContain(CHEST);

		// ① 灯す前に宝箱を踏んでも開かない（`game/player.js:1003` の封印ガード）
		await walkTiles(page, 'down', 2);
		await walkTiles(page, 'right', 2);
		expect(await at(page), '宝箱 (5,5) に立てない').toMatchObject({ r: 5, c: 5 });
		expect((await ss(page)).openedChests ?? [], '封印されたままの宝箱が開いた').not.toContain(CHEST);

		// ② かがり火を3本とも灯す（row3 から上を向いて灯す＝前方が row2 のかがり火）
		await walkTiles(page, 'up', 2);
		for (const t of TORCHES) {
			const col = Number(t.split(',')[1]);
			const cur = await at(page);
			if (col > cur.c) await walkTiles(page, 'right', col - cur.c);
			else if (col < cur.c) await walkTiles(page, 'left', cur.c - col);
			await page.evaluate(() => window.__game.setHeroDir('up'));
			await step(page, 2);
			await page.evaluate(() => window.__game.useSubItem());
			await step(page, 3);
			expect((await ss(page)).litTorches, `かがり火 (${t}) が点かない`).toContain(t);
		}
		expect((await ss(page)).conditionsMet, '3本点けても torchesLit で封印が解けない').toContain(CHEST);

		// ③ 現れた宝箱を開けるとハートの器が増える
		const heartsBefore = await page.evaluate(() => window.__game.getState().player.maxHearts);
		const cur = await at(page);
		if (cur.c > 5) await walkTiles(page, 'left', cur.c - 5);
		else if (cur.c < 5) await walkTiles(page, 'right', 5 - cur.c);
		await walkTiles(page, 'down', 2);
		expect((await ss(page)).openedChests, '封印が解けた宝箱が開かない').toContain(CHEST);
		expect(await page.evaluate(() => window.__game.getState().player.maxHearts),
			'ハートの器が増えない').toBe(heartsBefore + 1);
		expect(errors, `page errors on ${TORCH_ROOM}:\n${errors.join('\n')}`).toEqual([]);
	});
});
