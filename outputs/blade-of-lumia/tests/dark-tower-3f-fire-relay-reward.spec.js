// tests/dark-tower-3f-fire-relay-reward.spec.js
// dark_tower 3F `3,4`「淵の環」／`3,5`「淵の火渡り」の番人
// （2026-09-23 / PLAN 実行キュー20b ④の残り）。
//
// 直す前の実測：`3,4` は外周が壁だけの素の箱に宝箱2つ（回復薬（大）＋ルピー×30）＝塔に
// 同じ盤面の部屋が複数（棚卸し⑫）、`3,5` は柵 f(2,5) が1枚あるだけの空室（棚卸し⑦）。
//
// 新しい盤面：
//   3,4  3 #..xxxxxx..#   ← 只中に 6×4 の淵。幅2の環の回廊だけが残る
//        8 #B..ω......#   ← 西回りに宝箱（ルピー×30）と突進猪
//   3,5  4 #.#B...HHxx#   ← 火元 H(4,7)＋消えた H(4,8)／西の窪みに封印の宝箱 B(4,3)
//        7 #xxxxxxxxxx#
//   row4 に立って東へブーメランを投げると、往路で (4,7) の炎を拾い (4,8) に点火する
//   ＝`showConditions {trigger:'torchesLit'}` が満ちて封印の宝箱が現れる（中身＝矢筒2つめ）。
//
// 守るものは4つ。
//
// ① データ（幾何と配線）：両室の盤面・`initLitTorches`・封印条件・宝の中身・看板ゼロ・
//    境界の開き・`3,4` から回復薬（大）が消えていること。
// ② データ（ほかの手が通らないこと）：
//    ・ロウソク＝消えたかがり火 (4,8) に**隣接する立てる床が0マス**（前方1セルしか点けない）
//    ・はしご＝両室の穴に `isLadderBridgeCell` が成立するセルが0枚（淵はどこも幅2以上）
//      対照実験＝淵を幅1に狭めると成立する（測れている証明）
//    ・火を運べる射線は row4 から東だけ／木のブーメラン（maxRange 3）でも届く位置が在る
// ③ エンジンの前提：`litTorches` に触るのはロウソクとブーメランの2箇所だけ／ブーメランの
//    受け渡しは**プレイヤーの投擲に限る**（敵のブーメランでは点かない）／穴は飛べない／
//    `torchesLit` は部屋の 'H' が**全部**点いて初めて満ちる。ここが変わると寄道が崩れる。
// ④ 挙動（実機）：ブーメランで点火→封印が解けて矢筒（上限 8→16）／ロウソクでは点かない／
//    はしごを持っていても淵は渡れない。
//    ⚠️ `fromEditor=1` プレビューは debugMode=true ＝壁も穴もすり抜ける（無敵）ので
//       「渡れない」の検証には使えない。セーブを仕込んで「つづきから」で入る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, SAVE_KEY } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { ROWS, COLS, makeSolver } from '../scripts/lib/blade-solver.mjs';
import { isLadderBridgeCell } from '../scripts/lib/connectivity.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const PASSABLE_PATH = fileURLToPath(new URL('../game/passable.js', import.meta.url));
const PROJECTILE_PATH = fileURLToPath(new URL('../game/projectile.js', import.meta.url));
const CONDITIONS_PATH = fileURLToPath(new URL('../game/conditions.js', import.meta.url));
const GAME_JS_PATH = fileURLToPath(new URL('../game/game.js', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dark_tower';
const RING  = '3,4';
const RELAY = '3,5';

const RING_CHEST = '8,1';
const LIT        = '4,7';
const UNLIT      = '4,8';
const RELAY_CHEST = '4,3';
const THROW_SPOT  = '4,6';   // 火元の真西＝木のブーメランでも確実に届く
const NORTH_IN    = ['1,5', '1,6'];

const RING_ROWS = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..xxxxxx..#',
	'#..xxxxxx.θ#',
	'#..xxxxxx..#',
	'#..xxxxxx..#',
	'#..........#',
	'#B..ω......#',
	'#####..#####',
];
const RELAY_ROWS = [
	'#####..#####',
	'#......xxxx#',
	'#.π....xxxx#',
	'#..#...xxxx#',
	'#.#B...HHxx#',
	'#..#...xxxx#',
	'#......xxxx#',
	'#xxxxxxxxxx#',
	'#xxxxxxxxxx#',
	'############',
];

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const at = (st, cell) => { const [r, c] = cell.split(',').map(Number); return st.tiles[r][c]; };

function edgeSig(rows) {
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[ROWS - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[COLS - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
}

/** 部屋の中で歩いて立てる床（北の入口から）。ソルバーの状態空間から座標だけ抜く。 */
function standableCells(stageKey, { noTools = false, litInit = new Set() } = {}) {
	const st = map.layers[LAYER].stages[stageKey];
	const tiles = st.tiles.map((r) => (Array.isArray(r) ? r.slice() : [...r]));
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [k, ch] of Object.entries(st.bgTiles ?? {})) {
		const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
	}
	const S = makeSolver(tiles, bg, [], {}, litInit,
		{ noTools, hasLadder: !noTools, pitCrossable: true });
	const seen = new Set();
	const queue = NORTH_IN.map((cell) => {
		const [r, c] = cell.split(',').map(Number);
		return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
	});
	for (const s of queue) seen.add(s);
	for (let i = 0; i < queue.length; i++) {
		for (const nx of S.nextStates(queue[i])) {
			if (seen.has(nx)) continue;
			seen.add(nx); queue.push(nx);
		}
	}
	return [...new Set([...seen].map((s) => s.split('|')[0]))].sort();
}

/**
 * ブーメランで `target` のかがり火に点火できる射線を列挙する
 * （`game/projectile.js collectAlongBoomerang` と同じ規則＝点いた 'H' で flaming、
 *   消えた 'H' に点火。投擲物は '#' と未破壊の '!' だけで止まる）。
 */
function flameLanes(rows, from, target, litInit, { maxRange = Infinity } = {}) {
	const DIRS = [[-1, 0, '北'], [1, 0, '南'], [0, -1, '西'], [0, 1, '東']];
	const blocked = (r, c) => {
		const ch = rows[r]?.[c];
		return ch === undefined || ch === '#' || ch === '!';
	};
	const hits = [];
	for (const cell of from) {
		const [r0, c0] = cell.split(',').map(Number);
		for (const [dr, dc, name] of DIRS) {
			let flaming = false;
			for (let i = 1; i <= maxRange; i++) {
				const r = r0 + dr * i, c = c0 + dc * i;
				if (blocked(r, c)) break;
				const key = `${r},${c}`;
				if (rows[r][c] === 'H') {
					if (litInit.has(key)) flaming = true;
					else if (flaming && key === target) { hits.push(`${cell}→${name}`); break; }
				}
			}
		}
	}
	return hits.sort();
}

test.describe('Blade of Lumia – dark_tower 3F 淵の環／淵の火渡り（キュー20b ④）', () => {
	// ── ① データ（幾何と配線）────────────────────────────────────────────
	test(`データ：${LAYER} ${RING}＝淵の環`, () => {
		const st = map.layers[LAYER].stages[RING];
		expect(rowsOf(st)).toEqual(RING_ROWS);
		expect(at(st, RING_CHEST), `宝箱は西回りの (${RING_CHEST})`).toBe(TILE.CHEST);
		expect(st.chestContents?.[RING_CHEST], '中身はルピー×30')
			.toEqual({ type: 'rupee', value: 30, name: 'ルピー×30' });
		// 回復薬（大）は撤去した（不変条件(e)＝塔の回復薬（大）を3室以下へ向けた第二歩）
		expect(Object.values(st.chestContents ?? {}).some((cc) => cc?.item === 'bigHealPotion'),
			'回復薬（大）が残っていない').toBe(false);
		expect(Object.keys(st.chestContents ?? {}), '宝箱の登録はこの1つだけ').toEqual([RING_CHEST]);
		// ω 突進猪は sideView＝横向きの絵しか持たない∴初期の向きは left/right
		// （ENEMY-DIRECTIONAL-GUIDE §6-6）。θ 骸骨剣士は directional∴4方向ある。
		expect(st.enemyDirs, '敵の初期の向き').toEqual({ '4,9': 'up', '8,4': 'left' });
		expect(Object.keys(st.showConditions ?? {}), '封印は無い（素の環）').toEqual([]);
		expect(edgeSig(rowsOf(st)), '境界の開きは不変').toBe('N[5,6] S[5,6] W[] E[]');
	});

	test(`データ：${LAYER} ${RELAY} の盤面と火渡りの配線`, () => {
		const st = map.layers[LAYER].stages[RELAY];
		expect(rowsOf(st)).toEqual(RELAY_ROWS);
		expect(at(st, LIT), `火元 (${LIT}) はかがり火`).toBe(TILE.TORCH);
		expect(at(st, UNLIT), `点ける相手 (${UNLIT}) はかがり火`).toBe(TILE.TORCH);
		expect(rowsOf(st).reduce((n, row) => n + [...row].filter((ch) => ch === TILE.TORCH).length, 0),
			"かがり火は2枚だけ（torchesLit は部屋の 'H' 全部を見る）").toBe(2);
		expect(st.initLitTorches, '最初から点いているのは火元だけ').toEqual([LIT]);

		expect(at(st, RELAY_CHEST), `(${RELAY_CHEST}) は宝箱 'B'`).toBe(TILE.CHEST);
		expect(st.showConditions?.[RELAY_CHEST], '封印は torchesLit')
			.toEqual({ trigger: 'torchesLit' });
		// `showConditions[cell].message` は bossYielded（game/boss.js）しか読まない死んだデータ
		expect(st.showConditions[RELAY_CHEST].message, '死んだ message を書いていない').toBeUndefined();
		expect(st.chestContents?.[RELAY_CHEST], '中身は矢筒')
			.toEqual({ type: 'item', item: 'quiver', name: '矢筒' });
		// 宝箱の窪みは壁で囲い、東の (4,4) からだけ入れる＝投擲位置と同じ row4 に在る
		expect([at(st, '3,3'), at(st, '5,3'), at(st, '4,2')], '窪みの三方は壁')
			.toEqual([TILE.WALL, TILE.WALL, TILE.WALL]);
		// 笛では解けない／看板は置かない（ユーザー判定 2026-09-23＝最終盤にヒント看板は不要）
		expect(st.fluteEffect, 'fluteEffect が無い').toBeUndefined();
		expect(rowsOf(st).some((row) => row.includes(TILE.SIGN)), "看板タイル 'i' が1枚も無い").toBe(false);
		expect(Object.keys(st.signData ?? {}), 'signData も空（死にデータを残さない）').toEqual([]);
		expect(st.links ?? [], 'links は空').toEqual([]);
		expect(edgeSig(rowsOf(st)), '境界の開きは不変（南は行き止まり）').toBe('N[5,6] S[] W[] E[]');
	});

	test('データ：矢筒の配置は 3,2 と 3,5 と field 15,7 の3個だけ', () => {
		const found = [];
		for (const [lk, lay] of Object.entries(map.layers ?? {})) {
			for (const [k, s] of Object.entries(lay.stages ?? {})) {
				for (const [cell, cc] of Object.entries(s.chestContents ?? {})) {
					if (cc?.item === 'quiver') found.push(`${lk}/${k}(${cell})`);
				}
			}
		}
		// field 15,7 はキュー13（2026-09-29）で置いた3個目＝items.js の「最大3個配置」の上限
		expect(found.sort()).toEqual([`${LAYER}/3,2(5,5)`, `${LAYER}/${RELAY}(${RELAY_CHEST})`, 'field/15,7(7,5)'].sort());
	});

	// ── ② データ（ほかの手が通らない）──────────────────────────────────
	test(`データ：${RELAY} はロウソクでは点けられない（隣に立てる床が無い）`, () => {
		const stand = standableCells(RELAY, { litInit: new Set([LIT]) });
		const [ur, uc] = UNLIT.split(',').map(Number);
		const around = [[ur - 1, uc], [ur + 1, uc], [ur, uc - 1], [ur, uc + 1]]
			.map(([r, c]) => `${r},${c}`).filter((k) => stand.includes(k));
		expect(around, `消えたかがり火 (${UNLIT}) の隣に立てる床は無い`).toEqual([]);
		// 測定が空振りでない証明＝火元 (4,7) の隣（投擲位置）には立てる
		expect(stand, `投擲位置 (${THROW_SPOT}) には立てる`).toContain(THROW_SPOT);
	});

	test('データ：両室の淵ははしごで渡れない（幅2以上）', () => {
		for (const key of [RING, RELAY]) {
			const st = map.layers[LAYER].stages[key];
			const bridges = [];
			for (let r = 0; r < ROWS; r++) {
				for (let c = 0; c < COLS; c++) {
					if (st.tiles[r][c] !== TILE.PIT) continue;
					if (isLadderBridgeCell(st.tiles, ROWS, COLS, r, c, st.bgTiles)) bridges.push(`${r},${c}`);
				}
			}
			expect(bridges, `${key} にはしごで渡れる穴は無い`).toEqual([]);
			// はしごの有無で歩ける床が1マスも変わらない（幾何の判定を歩行でも裏取り）
			expect(standableCells(key), `${key} はしご有無で歩ける床が同一`)
				.toEqual(standableCells(key, { noTools: true }));
		}
		// 対照実験＝淵を幅1に狭めると isLadderBridgeCell が成立する（測れている証明）
		const narrowed = RELAY_ROWS.map((row) => [...row]);
		for (const c of [8, 9, 10]) narrowed[1][c] = TILE.FLOOR;
		expect(isLadderBridgeCell(narrowed, ROWS, COLS, 1, 7, null),
			'幅1に狭めた穴ははしごで渡れる').toBe(true);
	});

	test(`データ：${RELAY} の火を運べる射線は row4 から東だけ`, () => {
		const stand = standableCells(RELAY, { litInit: new Set([LIT]) });
		const lanes = flameLanes(RELAY_ROWS, stand, UNLIT, new Set([LIT]));
		expect(lanes.length, '火を運べる射線が在る').toBeGreaterThan(0);
		expect(lanes.every((l) => /^4,\d+→東$/.test(l)), `射線はすべて row4 から東（実測 ${lanes}）`)
			.toBe(true);
		// 木のブーメラン（最弱・maxRange 3）でも届く投擲位置が在る
		const wood = flameLanes(RELAY_ROWS, stand, UNLIT, new Set([LIT]),
			{ maxRange: BOOMERANG_TIERS[0].maxRange });
		expect(wood, `木のブーメランでも (${THROW_SPOT}) から点けられる`).toContain(`${THROW_SPOT}→東`);
		// 対照実験＝火元が消えていると1本も無い（炎の受け渡しが効いている証明）
		expect(flameLanes(RELAY_ROWS, stand, UNLIT, new Set()), '火元が無ければ点けられない')
			.toEqual([]);
	});

	// ── ③ エンジンの前提 ────────────────────────────────────────────────
	test('エンジン：火を点けるのはロウソクとプレイヤーのブーメランだけ／穴は飛べない', () => {
		const proj = readFileSync(PROJECTILE_PATH, 'utf8');
		const game = readFileSync(GAME_JS_PATH, 'utf8');
		const passable = readFileSync(PASSABLE_PATH, 'utf8');
		// `litTorches.add` は3箇所だけ＝ロウソク（game.js:1756）／ブーメラン（projectile.js:576）／
		// `initLitTorches` の初期化（game.js:250 getSS＝火元を最初から点けるだけ）。
		// ∴矢・剣ビーム・爆弾では点かない（増えたらこの数が動く）。
		const adds = (src) => (src.match(/litTorches\.add\(/g) ?? []).length;
		expect(adds(proj), 'projectile.js の点火は1箇所（ブーメラン）').toBe(1);
		expect(adds(game), 'game.js は2箇所（ロウソク＋initLitTorches の初期化）').toBe(2);
		expect(game, 'initLitTorches の初期化は getSS の中').toContain('stageState[k].litTorches.add(pk)');
		// かがり火は通行不可＝隣に立てない∴ロウソク（前方1セル）では点けられない。
		// ⚠️ ここが抜けていた（2026-09-23 修正）。着地判定 ARRIVAL_WALL_TILES と
		//    connectivity.mjs の HARD_BLOCKED は元から壁扱い＝通行判定だけが 'H' を落としていた。
		expect(passable, 'tilePassable がかがり火を通行不可にしている')
			.toContain('if (tile === TILE.TORCH)       return false;');
		expect(game, '着地判定 ARRIVAL_WALL_TILES もかがり火を壁扱い（元から）')
			.toContain('TILE.HOUSE_WALL, TILE.HOUSE_ROOF, TILE.SIGN, TILE.TORCH,');
		// 受け渡しはプレイヤーの投擲に限る＝敵のブーメラン（π）でギミックが解けない
		expect(proj, "炎の受け渡しは owner==='player' に限る")
			.toContain("const collects = proj.owner === 'player'");
		// 穴は飛行で越えられない（越えられると淵が意味を失う）
		const m = passable.match(/const FLYABLE_OVER = new Set\(\[([\s\S]*?)\]\)/);
		expect(m, 'passable.js の FLYABLE_OVER が見つからない').not.toBeNull();
		expect(m[1], 'PIT が飛べるようになると淵の火渡りが崩れる').not.toContain('PIT');
		// torchesLit は部屋の 'H' が全部点いて初めて満ちる。
		// ⚠️ ここはソースで見張るしかない＝`every` を `some` に潰しても実機テストは緑のまま
		//    （歯の確認 M3・2026-09-23 実測）。`conditionsMet` は `evaluateConditions()` を
		//    呼んだ時だけ更新され、入室そのものでは再評価されない∴「火元1枚だけで満ちる」
		//    実装に変えても、点火するまで封印は解けない＝挙動の差が出ない準等価変異になる。
		const cond = readFileSync(CONDITIONS_PATH, 'utf8');
		expect(cond, 'torchesLit は全かがり火を見る')
			.toContain('allTorches.every(pk => ss.litTorches?.has(pk))');
	});
});

// ── ④ 挙動（実機・セーブ経由＝debugMode OFF）──────────────────────────────
/** セーブを仕込んで「つづきから」で入る＝無敵もすり抜けも無い素の状態。 */
async function startAt(page, { stage, row, col, dir = 'down', ladder = true, candle = false }) {
	const subItems = {};
	if (candle) subItems.candle = { count: 999 };
	const save = JSON.stringify({
		player: {
			x: col, y: row,
			hp: 20, maxHp: 20, maxHearts: 10, atk: 99, def: 99, keys: 0,
			weapon: 'sword', swordTier: 1, shield: null, armor: null,
			subItems, activeSubItem: candle ? 'candle' : null,
			hasLadder: ladder, maxArrows: 8, maxBombs: 8,
			rupees: 0, triforceCount: 0,
		},
		stageState: {},
		currentLayer: LAYER,
		stageKey: stage,
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

/** 壁/穴に阻まれることを確かめる＝何度押しても座標が動かない。 */
async function pushInto(page, dir, times = 8) {
	const before = await posOf(page);
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	for (let i = 0; i < times; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
	return { before, after: await posOf(page) };
}

test.describe('Blade of Lumia – dark_tower 3,5 の火渡りは実機で通る（キュー20b ④）', () => {
	test('ブーメランで炎を運ぶと封印が解け、矢筒で上限が 8→16 になる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await startAt(page, { stage: RELAY, row: 1, col: 5, dir: 'down' });
		await page.evaluate(() => window.__game.equipBoomerangTier(0));   // 木のブーメラン
		expect(await page.evaluate(() => window.__game.getPlayer().boomerangTier),
			'木のブーメランを持っている').toBe(0);

		const ss0 = await ssOf(page);
		expect(ss0.litTorches, '入室時は火元だけが点いている').toEqual([LIT]);
		expect(ss0.conditionsMet ?? [], '入室時は封印が解けていない').not.toContain(RELAY_CHEST);

		// ① 封印前の宝箱は踏んでも開かない（窪みには入れる）
		await moveTo(page, '4,5');
		await moveTo(page, RELAY_CHEST);
		expect(await page.evaluate(() => window.__game.getPlayer().maxArrows),
			'封印前は矢筒を貰えない').toBe(8);

		// ② かがり火は通行不可＝東へ歩いて火に触ることはできない
		await moveTo(page, '4,4');
		await moveTo(page, THROW_SPOT);
		const east = await pushInto(page, 'right');
		expect(east.after, `(${THROW_SPOT}) から東へは進めない（かがり火と淵）`).toEqual(east.before);

		// ③ 東へブーメランを投げる＝往路で火元の炎を拾い、隣のかがり火に点火する
		//    ⚠️ π ブーメラン鬼が射線に入ると自分の投擲が敵に当たって消える（実機の普通の
		//       出来事）∴数回投げ直す。1回で必ず通ることを要求すると偽の赤が出る。
		await page.evaluate(() => window.__game.setHeroDir('right'));
		let litBoth = false;
		for (let attempt = 0; attempt < 6 && !litBoth; attempt++) {
			await page.evaluate(() => window.__game.useSubItem());
			for (let i = 0; i < 40; i++) await page.evaluate(() => window.__game.step(1));
			litBoth = (await ssOf(page)).litTorches?.includes(UNLIT) ?? false;
		}
		const ss1 = await ssOf(page);
		expect(ss1.litTorches, `消えていたかがり火 (${UNLIT}) に火が灯った`).toContain(UNLIT);
		expect(ss1.conditionsMet, `封印 (${RELAY_CHEST}) が解けた`).toContain(RELAY_CHEST);

		// ④ 窪みへ戻って宝箱を開ける＝矢の上限が +8
		const p = await posOf(page);
		await moveTo(page, `4,${p.x}`);   // row4 に居るはず（念のため軸を揃える）
		await moveTo(page, RELAY_CHEST);
		expect(await page.evaluate(() => window.__game.getPlayer().maxArrows),
			'矢筒で上限 8→16').toBe(16);
		expect(errors).toEqual([]);
	});

	test('ロウソクでは点けられない／はしごを持っていても淵は渡れない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await startAt(page, { stage: RELAY, row: 1, col: 5, dir: 'down', candle: true });
		expect(await page.evaluate(() => !!window.__game.getPlayer().subItems?.candle),
			'ロウソクを持っている').toBe(true);
		expect(await page.evaluate(() => window.__game.getPlayer().hasLadder),
			'はしごも持っている').toBe(true);

		// 投擲位置から東を向いてロウソクを使う＝前方は火元（既に点いている）∴何も増えない
		await moveTo(page, '4,5');
		await moveTo(page, THROW_SPOT);
		await page.evaluate(() => window.__game.setHeroDir('right'));
		await page.evaluate(() => window.__game.useSubItem());
		for (let i = 0; i < 10; i++) await page.evaluate(() => window.__game.step(1));
		expect((await ssOf(page)).litTorches, 'ロウソクでは消えたかがり火に届かない').toEqual([LIT]);

		// かがり火の上には立てない＝東へ1マスも進めない（ロウソクを持っていても間合いに入れない）
		const east = await pushInto(page, 'right');
		expect(east.after, `(${THROW_SPOT}) から東はかがり火で塞がれている`).toEqual(east.before);

		// 淵はどの向きにも幅2以上＝はしごを持っていても渡れない
		await moveTo(page, '6,6');
		const deep = await pushInto(page, 'down');
		expect(deep.after, 'はしごを持っていても幅2の淵は渡れない').toEqual(deep.before);
		expect(errors).toEqual([]);
	});

	test(`${RING}：淵は渡れず、環を回れば南へ抜けられる`, async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await startAt(page, { stage: RING, row: 1, col: 5, dir: 'down' });
		// 只中の淵は幅4（rows3-6）＝はしごでも渡れない
		await moveTo(page, '2,5');
		const into = await pushInto(page, 'down');
		expect(into.after, 'はしごを持っていても 6×4 の淵は渡れない').toEqual(into.before);
		// 西回りで宝箱まで行ける（ルピー×30）
		await moveTo(page, '2,1');
		await moveTo(page, '8,1');
		expect(await page.evaluate(() => window.__game.getPlayer().rupees),
			'西回りの宝箱でルピー×30').toBe(30);
		expect(errors).toEqual([]);
	});
});
