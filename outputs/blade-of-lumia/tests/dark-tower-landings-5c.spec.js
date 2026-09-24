// tests/dark-tower-landings-5c.spec.js
// dark_tower の階段の踊り場3室（1F `1,0` / 2F `2,0` / 3F `3,0`）の差別化
// （2026-09-24 / PLAN 実行キュー20b ⑤-c・`scripts/migrate-dark-tower-5c-landings.mjs` が書いた）。
//
// 直す前の実測（キュー20b の棚卸し⑱・`.scratch/20b-5c-census.mjs`）：
//   `2,0` と `3,0` が**バイト単位で一致**していた（同じ素の箱＋E×2＋階段 '>'）＝
//   階を上がっても同じ部屋に出る。`1,0` も同じ箱で E の数だけが違った。
//
// 新しい姿：
//   `1,0`（1F）＝触らない（E×4 の見張り・16.0）
//   `2,0`（2F）＝δ 分裂スライム1体（12.0）＝同じ 2F の主題（爆弾の関門 `2,1`）の予告
//   `3,0`（3F）＝row3 に幅1の穴の帯を引いて北を「はしごでしか渡れない島」にし矢束を報酬に置く
//               ＝同じ 3F の本番（`3,1` のはしごの関門）の前振り
//
// 守るものは3つ。
// ① ⑱ の再発防止＝3室の盤面が互いに違う（コピーで増やすと赤くなる）
// ② データの性質＝δ の置き方（分裂の湧き場・着地セルの安全）／穴の帯が幅1（はしごで渡れる）／
//    **本道（着地 → 南の口）は はしご無しで歩ける**（島だけが はしご必須）＝状態空間で測る
//    （[[blade-puzzle-must-verify-with-solver]]＝歩行の目視では判定しない）
// ③ 挙動（実機）＝δ が実際の部屋で分裂する／はしご無しでは穴に阻まれ、はしごで渡って矢束が拾える

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ROWS, COLS, makeSolver } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';
import { THREAT_OF, PINNED_STAGES, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dark_tower';
const F1 = '1,0', F2 = '2,0', F3 = '3,0';
const LANDING = '6,4';          // 3室すべて共通＝下の階の階段から上がってきた着地セル
const SLIME = '7,7';            // `2,0` の δ
const PIT_ROW = 3;              // `3,0` の穴の帯
const ISLAND_REWARD = '1,5';    // `3,0` の島の矢束
const SOUTH_OUT = '9,5';        // 本道の出口（→ `3,1` のはしごの関門へ）
const EDGES = 'N[] S[5,6] W[] E[]';
const THREAT_CAP = 900;         // 不変条件 (d4)
const ROOM_CAP = 162;           // 不変条件 (d3)（`1,2` の 225.0 は PINNED_STAGES の既存例外）
const TOTAL_BEFORE = 894;       // ⑤-b 完了時の塔の非ボス合計＝ここより軽くしない

const F2_ROWS = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...>......#',
	'#......δ...#',
	'#..........#',
	'#####..#####',
];
const F3_ROWS = [
	'############',
	'#....6.....#',
	'#...E..E...#',
	'#xxxxxxxxxx#',
	'#..........#',
	'#..........#',
	'#...>......#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

const stageOf = (key) => map.layers[LAYER].stages[key];
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.slice() : [...r]));
const threatOf = (st) => rowsOf(st).join('').split('')
	.reduce((t, ch) => t + (ENEMY_META[ch] ? THREAT_OF(ENEMY_META[ch]) : 0), 0);

function edgeSig(rows) {
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[ROWS - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[COLS - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
}

/**
 * `3,0` の中で `goal` に届くかを状態空間で測る。
 * `hasLadder: false` ＝はしご無し。`fill` ＝そのセルを床に変える（穴を1枚埋める対照）。
 * `kill` ＝そのセルを壁で潰す対照（⚠️ 必ず `'#'`＝[[blade-control-experiment-needs-tile-wall]]）。
 */
function measureF3({ hasLadder = true, goal = ISLAND_REWARD, fill = null, kill = null } = {}) {
	const st = stageOf(F3);
	const tiles = gridOf(st);
	if (fill) { const [r, c] = fill.split(',').map(Number); tiles[r][c] = TILE.FLOOR; }
	if (kill) { const [r, c] = kill.split(',').map(Number); tiles[r][c] = TILE.WALL; }
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [k, ch] of Object.entries(st.bgTiles ?? {})) {
		const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
	}
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder, pitCrossable: true });
	const [lr, lc] = LANDING.split(',').map(Number);
	const start = S.encode(lr, lc, S.initStones, 0, 0, S.litInitMask);
	const [gr, gc] = goal.split(',').map(Number);
	return measureMetrics(S, [start],
		(s) => s.split('|')[0] === goal,
		(s) => {
			const [pr, pc] = s.split('|')[0].split(',').map(Number);
			return Math.abs(pr - gr) + Math.abs(pc - gc);
		},
		{ guardMax: 500_000, escapeTest: (s) => S.exitCells.includes(s.split('|')[0]) });
}

test.describe('Blade of Lumia – dark_tower 踊り場3室の差別化（キュー20b ⑤-c）', () => {

	test('① 1F/2F/3F の踊り場が互いに違う盤面（⑱の再発防止）', () => {
		const sig = (key) => rowsOf(stageOf(key)).join('\n');
		expect(sig(F2), `${F2} の盤面`).toBe(F2_ROWS.join('\n'));
		expect(sig(F3), `${F3} の盤面`).toBe(F3_ROWS.join('\n'));
		expect(sig(F1), `${F1} と ${F2} が同じ盤面（踊り場の使い回し）`).not.toBe(sig(F2));
		expect(sig(F2), `${F2} と ${F3} が同じ盤面（⑱の再発）`).not.toBe(sig(F3));
		expect(sig(F1), `${F1} と ${F3} が同じ盤面（踊り場の使い回し）`).not.toBe(sig(F3));
		// 1F は触らない＝E×4 の見張りのまま（(d4) の予算の余裕をここで使わない）
		expect(threatOf(stageOf(F1)), `${F1} の脅威度`).toBe(16);
		// 3室すべて階段と境界はそのまま（部屋間の接続を動かしていない）
		for (const key of [F1, F2, F3]) {
			expect(edgeSig(rowsOf(stageOf(key))), `${key} の境界の開き`).toBe(EDGES);
			expect(stageOf(key).mapEnters?.[LANDING]?.id, `${key} の階段 ${LANDING}`).toBeTruthy();
		}
	});

	test('② 2,0 の分裂スライムは着地セルから離れ、分裂の湧き場がある', () => {
		const st = stageOf(F2);
		const grid = gridOf(st);
		const cells = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			if (grid[r][c] === TILE.SPLIT_SLIME) cells.push(`${r},${c}`);
		}
		expect(cells, `${F2} の δ は1体だけ`).toEqual([SLIME]);
		expect(threatOf(st), `${F2} の脅威度（E×2 の 8.0 → δ の 12.0）`).toBe(12);

		// 着地直後に張り付かれない（棚卸し⑪）＝チェビシェフ距離3以上
		const [sr, sc] = SLIME.split(',').map(Number);
		const [lr, lc] = LANDING.split(',').map(Number);
		expect(Math.max(Math.abs(sr - lr), Math.abs(sc - lc)),
			`${F2} の δ が着地セル ${LANDING} に近すぎる`).toBeGreaterThanOrEqual(3);

		// ★ 分裂は「小型の置き場所」を要求する＝4近傍が床でないと分裂そのものが起きない
		//   （`pickSplitCells` が空 → 素直に倒れる＝機構が黙って死ぬ）
		for (const [dr, dc, label] of [[1, 0, '南'], [-1, 0, '北'], [0, 1, '東'], [0, -1, '西']]) {
			expect(grid[sr + dr][sc + dc], `${F2} の δ の${label}隣が床でない＝小型の湧き場が足りない`)
				.toBe(TILE.FLOOR);
		}

		// δ は向き別スプライトではない∴enemyDirs は空（残すと幽霊キー）
		expect(ENEMY_META[TILE.SPLIT_SLIME].directional, 'δ が directional になった（前提の変化）')
			.toBeFalsy();
		expect(st.enemyDirs ?? {}, `${F2} の enemyDirs`).toEqual({});

		// 表に登録してある（`tests/hit-trigger-enemies.spec.js` が「表に無い部屋の δ」を弾く）
		const entry = EXTRA_ENEMY_ROOMS.find((e) => e.layer === LAYER && e.stage === F2);
		expect(entry, `${LAYER}/${F2} が EXTRA_ENEMY_ROOMS に無い`).toBeTruthy();
		expect(entry.by, '登録の by が移行スクリプトを指していない')
			.toBe('scripts/migrate-dark-tower-5c-landings.mjs');
	});

	test('③ 3,0 の穴の帯は幅1（はしごで渡れる）で、島に矢束と守り手がある', () => {
		const st = stageOf(F3);
		const grid = gridOf(st);
		expect(threatOf(st), `${F3} の脅威度（E×2 据え置き）`).toBe(8);

		const pits = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			if (grid[r][c] === TILE.PIT) pits.push([r, c]);
		}
		expect(pits.map(([r, c]) => `${r},${c}`).join(' '), `${F3} の穴は row${PIT_ROW} の cols1-10 だけ`)
			.toBe(Array.from({ length: 10 }, (_, i) => `${PIT_ROW},${i + 1}`).join(' '));

		// 幅1＝全列で「上下が陸」＝`game/passable.js` isVertBridge が成立する（陸＝穴/水でない通行可）
		const HARD = new Set([TILE.WALL, TILE.WATER, TILE.PIT, TILE.LAVA, TILE.SKY, TILE.TORCH, TILE.SIGN]);
		const isBank = (r, c) => !HARD.has(grid[r]?.[c]) && !st.bgTiles?.[`${r},${c}`];
		for (const [r, c] of pits) {
			expect(isBank(r - 1, c) && isBank(r + 1, c),
				`${F3} の穴 (${r},${c}) の上下が陸でない＝はしごが架からない`).toBe(true);
		}

		// 島（rows1-2）＝矢束1個と守り手2体。北の外周は全部壁＝穴を渡るしか入口が無い
		const [ir, ic] = ISLAND_REWARD.split(',').map(Number);
		expect(grid[ir][ic], `${F3} の島の報酬は矢束 '6'`).toBe(TILE.ITEM_ARROWS);
		expect([1, 2].flatMap((r) => grid[r].filter((ch) => ENEMY_META[ch])).length,
			`${F3} の島の守り手`).toBe(2);
		expect(rowsOf(st)[0], `${F3} の北の外周`).toBe('############');
		// 着地セルと南の口の間（rows4-9）には穴を掘っていない＝本道は地続き
		for (let r = 4; r < ROWS; r++) {
			expect(rowsOf(st)[r].includes(TILE.PIT), `${F3} row${r} に穴がある＝本道を塞いだ`).toBe(false);
		}
	});

	test('④ 3,0 は島だけが はしご必須で、本道は はしご無しで抜けられる', () => {
		// 島＝はしご無しでは届かない／はしご有りなら届く
		// ⚠️ 届かないときの L は `null`（`lib/puzzle-metrics.mjs` の表現）＝Infinity ではない。
		expect(measureF3({ hasLadder: false }).L, 'はしご無しで島に届いてしまう').toBeNull();
		expect(measureF3({ hasLadder: true }).L, 'はしご有りでも島に届かない').not.toBeNull();

		// 本道＝はしご無しでも南の口に届く（塞ぐと 3F を進めない）／入って詰まない
		const route = measureF3({ hasLadder: false, goal: SOUTH_OUT });
		expect(route.L, 'はしご無しでは南の口に届かない＝3F を進めなくなった').not.toBeNull();
		expect(route.noEscape, '入って詰む状態がある').toBe(0);

		// 歯の確認＝測定が空振りでない証明
		//   (i) 穴を1枚埋めれば はしご無しでも島に届く（＝はしご必須は穴が作っている）
		expect(measureF3({ hasLadder: false, fill: `${PIT_ROW},5` }).L,
			'穴を1枚埋めても島に届かない＝測定が穴を見ていない').not.toBeNull();
		//   (ii) 無関係な床を潰しても本道は通れる（＝本道の測定が過敏でない）
		expect(measureF3({ hasLadder: false, goal: SOUTH_OUT, kill: '8,10' }).L,
			'無関係な床を潰したら本道が通れなくなった').not.toBeNull();
	});

	test('⑤ 塔の脅威度の不変条件（(d3)(d4)）を崩していない', () => {
		const stages = map.layers[LAYER].stages;
		let total = 0;
		const heavy = [];
		for (const [key, st] of Object.entries(stages)) {
			if (st.isBossRoom) continue;
			const t = threatOf(st);
			total += t;
			if (t > ROOM_CAP && !PINNED_STAGES.has(`${LAYER}/${key}`)) heavy.push(`${key}=${t}`);
		}
		expect(heavy, `1室 ${ROOM_CAP} 超の部屋（関門を除く）＝(d3)`).toEqual([]);
		expect(total, `塔の非ボス合計＝(d4)`).toBeLessThanOrEqual(THREAT_CAP);
		expect(total, `⑤-b 時点（${TOTAL_BEFORE}）より軽くなった＝踊り場の作り込みが消えた`)
			.toBeGreaterThan(TOTAL_BEFORE);
	});
});

// ── 挙動（実機・fromEditor=1 プレビュー）──────────────────────────────────
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
// ⚠️ プレイヤーの座標・持ち物は `getPlayer()` で読む（[[blade-snapshot-api-names]]）。
const at = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});

test.describe('Blade of Lumia – 踊り場3室は実機でも狙いどおり（キュー20b ⑤-c）', () => {

	test('⑥ 2,0 の分裂スライムは実際の部屋で小型2体に分かれる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		// 実時間ループを止めてから開く＝δ が勝手に動いて間合いが変わるのを防ぐ
		await page.addInitScript(() => {
			const native = window.setInterval;
			window.__loopBlocked = 0;
			window.setInterval = function (fn, ms, ...rest) {
				if (/step\s*\(\s*1\s*\)/.test(String(fn))) { window.__loopBlocked++; return 0; }
				return native.call(window, fn, ms, ...rest);
			};
		});
		// δ(7,7) の西隣 (7,6) に立つ＝距離ちょうど 1.0（剣の間合い SWORD_REACH 1.2 の内側）
		await page.goto(previewUrl(F2, 7, 6));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__loopBlocked),
			'実時間ループの差し込み阻止が効いていない').toBeGreaterThan(0);

		const res = await page.evaluate(() => {
			const g = window.__game;
			g.pause();
			if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている（計測前提が崩れる）');
			g.equipSwordTier(0);            // 本番と同じ木の剣（atk = 2 + 2 = 4＝δ の hp 4）
			g.step(1);                      // 剣のクールダウン（100ms）を越える
			const before = g.getEnemies();
			g.setHeroDir('right');
			g.swordAttack();                // 実経路で殴る（本番と同じ src 付き）
			const after = g.getEnemies();
			return { before, after, px: g.getPlayer().x, py: g.getPlayer().y };
		});

		const cfg = ENEMY_META[TILE.SPLIT_SLIME].split;
		expect(`${res.py},${res.px}`, '前提：プレイヤーは δ の西隣 (7,6)').toBe('7,6');
		expect(res.before.map((e) => e.id), `${F2} に δ が1体 spawn する`).toEqual([SLIME]);
		expect(res.before[0].type, 'spawn した敵が δ でない').toBe(TILE.SPLIT_SLIME);
		expect(res.before[0].hp, '前提：親の hp').toBe(ENEMY_META[TILE.SPLIT_SLIME].hp);
		expect(res.after.length, '木の剣1発で分裂しなかった（湧き場が足りない？）').toBe(cfg.count);
		for (const c of res.after) {
			expect(c.hp, '小型の hp が childHp でない').toBe(cfg.childHp);
			expect(c.sprite, '小型の絵が childSprite でない').toBe(cfg.childSprite);
			expect(c.splitFrom, '小型が親の posKey を引き継いでいない').toBe(SLIME);
		}
		// 湧き場は「親のセル＋4近傍のうち空いている所」＝プレイヤーの足元 (7,6) は避ける。
		// この部屋で実際に空いていることが ⑤-c の設計の要（外周や壁に押し出されない）。
		const cells = res.after.map((c) => `${c.y},${c.x}`).sort();
		expect(cells, `小型の湧き場所が想定外（${cells.join(' ')}）`)
			.toEqual(['7,7', '7,8']);
		expect(errors, `page errors on ${F2}:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑦ 3,0 は はしご無しでは島に渡れず、はしごで渡ると矢束が拾える', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		// ① はしご無しで穴の帯の手前 (4,5) から北を押す＝渡れない
		// ⚠️ はしごの所持は `player.hasLadder`（bool）＝道具の実体は subItems ではない。
		await page.goto(previewUrl(F3, 4, 5));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getPlayer().hasLadder),
			'はしごを持たない前提のテスト').toBeFalsy();
		await walkTiles(page, 'up', 3);
		expect((await at(page)).r, 'はしご無しで穴を渡って島へ入れてしまった').toBeGreaterThanOrEqual(4);

		// ② はしご有り＋弓所持（矢は1本に減らす）で同じ場所から島の矢束を取る
		await page.goto(previewUrl(F3, 4, 5, { ps_ladder: '1', ps_bow: '1' }));
		await waitForBoard(page);
		const setup = await page.evaluate(() => {
			const p = window.__game.getPlayer();
			p.subItems.bow.count = 1;      // 満タンだと拾っても増えない（`addStack` の上限）
			return { hasLadder: !!p.hasLadder, arrows: p.subItems.bow.count };
		});
		expect(setup.hasLadder, 'はしごを持てていない').toBe(true);
		expect(setup.arrows, '前提：矢は1本').toBe(1);

		await walkTiles(page, 'up', 3);
		const pos = await at(page);
		expect(pos, 'はしごで穴を渡って島の矢束 (1,5) に立てない').toEqual({ r: 1, c: 5 });
		const arrows = await page.evaluate(() => window.__game.getPlayer().subItems.bow.count);
		expect(arrows, '島の矢束を拾えていない').toBeGreaterThan(setup.arrows);
		expect(errors, `page errors on ${F3}:\n${errors.join('\n')}`).toEqual([]);
	});
});
