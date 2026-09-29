// tests/dark-tower-1f-archer-reward.spec.js
// dark_tower 1F `1,4`／`1,5`「小島の射手」の番人（2026-09-23 / PLAN 実行キュー20b ④の
// 封印報酬 `switchOn` 分）。
//
// 直す前の実測：`1,4` は素の箱＋回復薬（大）の宝箱1個（同じ盤面の部屋が塔に複数）、
// `1,5` は小ルピー2枚だけの空室＝1F の行き止まりに寄り道する理由が無かった（棚卸し⑫）。
//
// 新しい盤面：
//    1,5  5 #..........#   ← 北岸（広間の南端）
//         6 #xxxxxxxxx##   ← 穴の海。(6,10) の壁が射線を絞る
//         7 #xx.xxxxxxY#   ← 只中の小島 (7,3)＝唯一の射座／座 Y(7,10)
//         8 #xxxxxxxxxx#
//   小島へは (6,3) の穴1枚（幅1・両岸が床）をはしごで渡る。小島から東へ射抜くと
//   `showConditions {trigger:'switchOn', switchId:'7,10'}` が満ちて封印の宝箱 B(3,2)
//   （西の窪み）が現れる＝中身は**爆弾袋**（世界で唯一の配置・爆弾の上限 +8）。
//
// 守るものは4つ。
//
// ① データ（幾何と配線）：盤面・封印条件・宝の中身・看板ゼロ・境界の開き。
// ② データ（射線）：**はしごが無いと封印を解けない**＝到達できる床から座へ通る射線が
//    0本。はしごが有れば**ちょうど1本**（小島から東）。投擲物の通行規則は
//    `game/projectile.js isTilePassableForProj` と同じ（`#` と未破壊の `!` だけで止まる）。
//    対照実験2つ（測れていることの証明）＝(6,10) を床にすると射線が増える／小島を
//    壁で潰すと0本（潰すセルは必ず '#'＝[[blade-control-experiment-needs-tile-wall]]）。
//    ⚠️ 「座に歩いて行けない」は座セルで測らない＝`lib/connectivity.mjs` の
//      HARD_BLOCKED に 'Y' が入っており BFS では絶対に到達しない＝歯が無い。
//      代わりに**座の隣に立てる床が1マスも無いこと**（＝剣の間合いの外）を測る。
// ③ エンジンの前提：座をトグルできるのは矢と剣ビームだけ／穴は飛行で越えられない。
//    ここが変わると寄道が丸ごと崩れるのでソースを直接見張る。
// ④ 挙動（実機）：はしご無しでは小島に渡れない／広間から南へ撃っても当たらない／
//    小島から射抜くと封印が解けて爆弾袋が手に入る（上限 8→16）。
//    ⚠️ `fromEditor=1` プレビューは debugMode=true ＝壁も穴もすり抜ける（無敵）ので
//       「渡れない」の検証には使えない。セーブを仕込んで「つづきから」で入る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, SAVE_KEY } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ROWS, COLS, makeSolver } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics } from '../scripts/lib/puzzle-metrics.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const PASSABLE_PATH = fileURLToPath(new URL('../game/passable.js', import.meta.url));
const PROJECTILE_PATH = fileURLToPath(new URL('../game/projectile.js', import.meta.url));
const CONDITIONS_PATH = fileURLToPath(new URL('../game/conditions.js', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER  = 'dark_tower';
const PRE    = '1,4';
const ARCHER = '1,5';

const ARROWS = '6,5';    // 床の矢束（PRE）
const ISLAND = '7,3';    // 唯一の射座
const CRACK  = '6,3';    // はしごで渡る穴1枚
const BANK   = '5,3';    // 北岸
const SWITCH = '7,10';
const CHEST  = '3,2';
const SIGN   = '1,1';
const LANE_WALL = '6,10';
const NORTH_IN  = ['1,5', '1,6'];

const PRE_ROWS = [
	'#####..#####',
	'#..........#',
	'#.##....##.#',
	'#.#r....r#.#',
	'#.##....##.#',
	'#..........#',
	'#....6.....#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
const ARCHER_ROWS = [
	'#####..#####',
	'#..........#',
	'#.##r..r...#',
	'#.B#.......#',
	'#.##.......#',
	'#..........#',
	'#xxxxxxxxx##',
	'#xx.xxxxxxY#',
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

/** `1,5` を切り出したソルバー。`kill` のセルは壁で潰す（対照実験）。 */
function solver({ withLadder = true, kill = null } = {}) {
	const st = map.layers[LAYER].stages[ARCHER];
	const tiles = st.tiles.map((r) => (Array.isArray(r) ? r.slice() : [...r]));
	if (kill) { const [r, c] = kill.split(',').map(Number); tiles[r][c] = TILE.WALL; }
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [k, ch] of Object.entries(st.bgTiles ?? {})) {
		const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
	}
	return { S: makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: withLadder, pitCrossable: true }), tiles };
}

/** 北の入口から `goal` まで測る。 */
function measureRoom({ withLadder = true, kill = null, goal = ISLAND } = {}) {
	const { S } = solver({ withLadder, kill });
	const starts = NORTH_IN.map((cell) => {
		const [r, c] = cell.split(',').map(Number);
		return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
	});
	const [gr, gc] = goal.split(',').map(Number);
	return measureMetrics(S, starts, (state) => state.split('|')[0] === goal,
		(state) => {
			const [pr, pc] = state.split('|')[0].split(',').map(Number);
			return Math.abs(pr - gr) + Math.abs(pc - gc);
		},
		{ guardMax: 2_000_000, escapeTest: (state) => S.exitCells.includes(state.split('|')[0]) });
}

/** 歩いて立てる床（`1,5` 内）。ソルバーの状態空間から座標だけ抜く。 */
function standableCells({ withLadder = true, kill = null } = {}) {
	const { S } = solver({ withLadder, kill });
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
	return [...new Set([...seen].map((s) => s.split('|')[0]))];
}

// 投擲物の通行規則（`isTilePassableForProj`：`#` と未破壊の `!` だけで止まる）
const projBlocked = (rows, r, c) => {
	const ch = rows[r]?.[c];
	if (ch === undefined) return true;
	return ch === '#' || ch === '!';
};
/** `from` の各セルから4方向へ撃って `target` に当たる射線を列挙する。 */
function lanesTo(rows, from, target) {
	const DIRS = [[-1, 0, '北'], [1, 0, '南'], [0, -1, '西'], [0, 1, '東']];
	const hits = [];
	for (const cell of from) {
		const [r0, c0] = cell.split(',').map(Number);
		for (const [dr, dc, name] of DIRS) {
			let r = r0 + dr, c = c0 + dc;
			while (!projBlocked(rows, r, c)) {
				if (`${r},${c}` === target) { hits.push(`${cell}→${name}`); break; }
				r += dr; c += dc;
			}
		}
	}
	return hits.sort();
}

test.describe('Blade of Lumia – dark_tower 1F 小島の射手（キュー20b ④）', () => {
	// ── ① データ（幾何と配線）────────────────────────────────────────────
	test(`データ：${LAYER} ${PRE}＝供給の前室`, () => {
		const st = map.layers[LAYER].stages[PRE];
		expect(rowsOf(st)).toEqual(PRE_ROWS);
		expect(at(st, ARROWS), `床の矢束 '6'(${ARROWS})＝寄道の手前で矢を補給できる`)
			.toBe(TILE.ITEM_ARROWS);
		// 回復薬（大）の宝箱は撤去した（不変条件(e)＝塔の回復薬（大）は3室以下へ向けた第一歩）
		expect(rowsOf(st).join('').includes('B'), '宝箱が残っていない').toBe(false);
		expect(Object.keys(st.chestContents ?? {}), 'chestContents が空').toEqual([]);
		expect(edgeSig(rowsOf(st)), '境界の開きは不変').toBe('N[5,6] S[5,6] W[] E[]');
	});

	test(`データ：${LAYER} ${ARCHER} の盤面と封印の配線`, () => {
		const st = map.layers[LAYER].stages[ARCHER];
		expect(rowsOf(st)).toEqual(ARCHER_ROWS);
		expect(at(st, SWITCH), `(${SWITCH}) は座 'Y'`).toBe(TILE.SWITCH);
		expect(rowsOf(st).reduce((n, row) => n + [...row].filter((ch) => ch === TILE.SWITCH).length, 0),
			'座はこの1枚だけ').toBe(1);
		expect(at(st, ISLAND), `小島 (${ISLAND}) は床`).toBe(TILE.FLOOR);
		expect(at(st, CRACK), `渡り所 (${CRACK}) は穴`).toBe(TILE.PIT);
		expect(at(st, BANK), `北岸 (${BANK}) は床`).toBe(TILE.FLOOR);
		expect(at(st, LANE_WALL), `(${LANE_WALL}) の壁が射線を絞る`).toBe(TILE.WALL);
		// 小島の東西南は穴＝はしごでも渡れない幅（東へ6連・西へ2連・南へ1連だが対岸が穴）
		for (const c of [4, 5, 6, 7, 8, 9]) {
			expect(st.tiles[7][c], `(7,${c}) は穴`).toBe(TILE.PIT);
		}

		expect(at(st, CHEST), `(${CHEST}) は宝箱 'B'`).toBe(TILE.CHEST);
		expect(st.showConditions?.[CHEST], '封印は switchOn＝座の座標を指す')
			.toEqual({ trigger: 'switchOn', switchId: SWITCH });
		// `showConditions[cell].message` は bossYielded（game/boss.js）しか読まない死んだデータ
		expect(st.showConditions[CHEST].message, '死んだ message を書いていない').toBeUndefined();
		expect(st.chestContents?.[CHEST], '中身は爆弾袋')
			.toEqual({ type: 'item', item: 'bombBag', name: '爆弾袋' });
		// ⚠️ 看板は置かない（ユーザー判定 2026-09-23＝「みりゃわかるだろ／dark_tower は
		// 最終盤だからヒントなくてもいい」）。案内は地形が担う∴'i' タイルと signData の
		// **両方**が無いことを見張る（片方だけ残すと無言看板／死にデータ＝再発しやすい）。
		expect(at(st, SIGN), `(${SIGN}) は素の床（第一版の刻み文を外した跡）`).toBe(TILE.FLOOR);
		expect(rowsOf(st).some((row) => row.includes(TILE.SIGN)), "看板タイル 'i' が1枚も無い")
			.toBe(false);
		expect(Object.keys(st.signData ?? {}), 'signData も空（死にデータを残さない）').toEqual([]);
		// 配線は showConditions だけ＝`links` は空・ステージの switchToggles は幽霊
		expect(st.links ?? [], 'links は空').toEqual([]);
		expect(st.switchToggles, '幽霊フィールド switchToggles が無い').toBeUndefined();
		expect(edgeSig(rowsOf(st)), '境界の開きは不変（南は行き止まり）').toBe('N[5,6] S[] W[] E[]');
	});

	test('データ：爆弾袋・矢筒は世界で各3個＝上限どおり（報酬の希少さ）', () => {
		let bombBags = 0, quivers = 0;
		for (const lay of Object.values(map.layers ?? {})) {
			for (const s of Object.values(lay.stages ?? {})) {
				for (const cc of Object.values(s.chestContents ?? {})) {
					if (cc?.item === 'bombBag') bombBags++;
					if (cc?.item === 'quiver') quivers++;
				}
			}
		}
		// 世界の合計は3個＝dark_tower 1,5 ＋ field 11,17・15,5（キュー13・2026-09-29）。
		// 座標つきの配置は tests/field-q13-rewards.spec.js ② が見張る。
		expect(bombBags, '爆弾袋は dark_tower 1,5 と field 2個の3個').toBe(3);
		// 矢筒は3個＝3F `3,2`（笛の封印）と `3,5`（淵の火渡りの封印）＋ field 15,7（キュー13）。
		// 配置そのものは tests/dark-tower-3f-fire-relay-reward.spec.js が座標つきで見張る。
		expect(quivers, '矢筒は dark_tower 3,2 と 3,5 と field 15,7 の3個').toBe(3);
	});

	// ── ② データ（到達と射線）──────────────────────────────────────────
	test(`データ：${ARCHER} の小島へははしごが無いと渡れない`, () => {
		const m = measureRoom();
		expect(m.L, '小島へ届く（解なし＝null ではない）').not.toBeNull();
		expect(m.noEscape, '入って詰む状態は無い（小島から北へ戻れる）').toBe(0);
		expect(measureRoom({ withLadder: false }).L, '対照実験（はしご無し）では届かない').toBeNull();
		// 歯の確認＝無関係な床を潰しても届く（対照実験が空振りでない証明）
		expect(measureRoom({ kill: '2,9' }).L, '無関係な床を潰しても小島へ届く').not.toBeNull();
		// 宝箱の窪みは道具なしでも踏める（封印は踏めても開かないだけ）
		expect(measureRoom({ withLadder: false, goal: CHEST }).L,
			'宝箱の窪みははしご無しでも踏める').not.toBeNull();
	});

	test(`データ：${ARCHER} の座への射線はちょうど1本（小島から東）`, () => {
		const rows = ARCHER_ROWS;
		const withL = standableCells();
		const noL   = standableCells({ withLadder: false });

		// 座の隣に立てる床が1マスも無い＝剣では絶対に叩けない
		const [sr, sc] = SWITCH.split(',').map(Number);
		const around = [[sr - 1, sc], [sr + 1, sc], [sr, sc - 1], [sr, sc + 1]]
			.map(([r, c]) => `${r},${c}`).filter((k) => withL.includes(k));
		expect(around, '座の隣に立てる床は無い（剣の間合いの外）').toEqual([]);

		expect(lanesTo(rows, withL, SWITCH), 'はしごありの射線は小島から東の1本だけ')
			.toEqual([`${ISLAND}→東`]);
		expect(lanesTo(rows, noL, SWITCH), 'はしご無しでは射線が無い＝封印を解けない').toEqual([]);

		// 対照実験①＝射線を絞っている壁を床にすると射線が増える
		const opened = rows.map((row, i) => (i === 6 ? `${row.slice(0, 10)}.${row.slice(11)}` : row));
		expect(lanesTo(opened, withL, SWITCH).length,
			`(${LANE_WALL}) を床にすると射線が増える`).toBeGreaterThan(1);
		// 対照実験②＝小島を壁で潰すと射線が0本（小島が唯一の射座）
		const killed = rows.map((row, i) => (i === 7 ? `${row.slice(0, 3)}#${row.slice(4)}` : row));
		expect(lanesTo(killed, standableCells({ kill: ISLAND }), SWITCH),
			'小島を潰すと射線が無い').toEqual([]);
	});

	// ── ③ エンジンの前提 ────────────────────────────────────────────────
	test('エンジン：座をトグルできるのは矢と剣ビームだけ／穴は飛べない', () => {
		const proj = readFileSync(PROJECTILE_PATH, 'utf8');
		expect(proj, "投擲物の座トグルは arrow / beam に限る")
			.toContain("(proj.type === 'arrow' || proj.type === 'beam') && proj.owner === 'player' && toggleSwitch");
		const passable = readFileSync(PASSABLE_PATH, 'utf8');
		const m = passable.match(/const FLYABLE_OVER = new Set\(\[([\s\S]*?)\]\)/);
		expect(m, 'passable.js の FLYABLE_OVER が見つからない').not.toBeNull();
		expect(m[1], 'PIT が飛べるようになると小島の寄道が崩れる').not.toContain('PIT');
		// switchOn は switchToggles（'Y' を叩いた記録）を見る＝ボタン 'S' とは別系統
		const cond = readFileSync(CONDITIONS_PATH, 'utf8');
		expect(cond, "switchOn は ss.switchToggles を見る").toContain('ss.switchToggles?.has(cond.switchId)');
	});
});

// ── ④ 挙動（実機・セーブ経由＝debugMode OFF）──────────────────────────────
/** セーブを仕込んで「つづきから」で入る＝無敵もすり抜けも無い素の状態。 */
async function startAt(page, { row, col, dir = 'down', bow = true, ladder = true }) {
	const subItems = {};
	if (bow) subItems.bow = { count: 99 };
	const save = JSON.stringify({
		player: {
			x: col, y: row,
			hp: 6, maxHp: 6, maxHearts: 3, atk: 99, def: 0, keys: 0,
			weapon: 'sword', swordTier: 1, shield: null, armor: null,
			subItems, activeSubItem: bow ? 'bow' : null,
			hasLadder: ladder, maxArrows: 99, maxBombs: 8,
			rupees: 0, triforceCount: 0,
		},
		stageState: {},
		currentLayer: LAYER,
		stageKey: ARCHER,
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

/** その向きへ矢を射って飛び切るまで進める。 */
async function shoot(page, dir) {
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	await page.evaluate(() => window.__game.useSubItem());
	for (let i = 0; i < 40; i++) await page.evaluate(() => window.__game.step(1));
}

test.describe('Blade of Lumia – dark_tower 1,5 の封印は実機で解ける（キュー20b ④）', () => {
	test('小島から射抜くと封印の宝箱が現れ、爆弾袋で上限が 8→16 になる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await startAt(page, { row: 5, col: 5, dir: 'down' });
		const ss0 = await ssOf(page);
		expect(ss0.conditionsMet ?? [], '入室時は封印が解けていない').not.toContain(CHEST);

		// ① 広間から南へ撃っても当たらない（(6,10) の壁が射線を絞っている）
		await moveTo(page, '5,10');
		await shoot(page, 'down');
		expect((await ssOf(page)).switchToggles ?? [], '広間から南へ撃っても座には当たらない')
			.not.toContain(SWITCH);

		// ② 小島以外の列は穴が3連＝はしごを持っていても渡れない
		expect(await page.evaluate(() => window.__game.getPlayer().hasLadder),
			'はしごを持っている前提のテスト').toBe(true);
		const atPit = await pushInto(page, 'down');
		expect(atPit.after, 'はしごを持っていても幅3の穴は渡れない').toEqual(atPit.before);

		// ③ 封印前の宝箱は踏んでも開かない
		await moveTo(page, '5,1');
		await moveTo(page, '3,1');
		await moveTo(page, CHEST);
		expect(await page.evaluate(() => window.__game.getPlayer().maxBombs),
			'封印前は爆弾袋を貰えない').toBe(8);

		// ④ 北岸 → はしごで小島へ渡る
		await moveTo(page, '3,1');
		await moveTo(page, '5,1');
		await moveTo(page, BANK);
		await moveTo(page, ISLAND);

		// ⑤ 小島から東へ射抜く＝穴の上を飛んで座に当たる
		await shoot(page, 'right');
		const ss1 = await ssOf(page);
		expect(ss1.switchToggles, `矢が座 Y(${SWITCH}) をトグルした`).toContain(SWITCH);
		expect(ss1.conditionsMet, `封印 (${CHEST}) が解けた`).toContain(CHEST);
		// ボタン（switchStates）には一切作用しない（'S' と 'Y' は別物＝[[blade-button-vs-switch]]）
		expect(ss1.switchStates?.[SWITCH], 'ボタンの状態は立たない').toBeUndefined();

		// ⑥ 小島から戻って宝箱を開ける＝爆弾の上限が +8
		await moveTo(page, BANK);
		await moveTo(page, '5,1');
		await moveTo(page, '3,1');
		await moveTo(page, CHEST);
		expect(await page.evaluate(() => window.__game.getPlayer().maxBombs),
			'爆弾袋で上限 8→16').toBe(16);
		expect(errors).toEqual([]);
	});

	test('はしごが無いと小島に渡れない＝封印を解く手が無い', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await startAt(page, { row: 5, col: 3, dir: 'down', ladder: false });
		expect(await page.evaluate(() => window.__game.getPlayer().hasLadder),
			'はしごを持っていない').toBe(false);
		const atCrack = await pushInto(page, 'down');
		expect(atCrack.after, 'はしご無しでは穴1枚も渡れない').toEqual(atCrack.before);

		// 北岸から南へ撃っても座には当たらない（col3 の射線は小島を素通りして穴で尽きる）
		await shoot(page, 'down');
		expect((await ssOf(page)).switchToggles ?? [], '北岸から南へ撃っても座には当たらない')
			.not.toContain(SWITCH);
		expect(errors).toEqual([]);
	});
});
