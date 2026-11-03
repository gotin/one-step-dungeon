// dungeon_3 `2,1`（`2,2` の北・`3,1`〈コンパス〉の西＝2つの口の通り道・碑＋床の矢束）：
// 素の部屋を「潮待ちの中洲」に作り替える
// （2026-11-03 / PLAN 実行キュー 94 の2室目・設計は Opus）
//
// ■ 何が薄かったか（キュー94 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      2 #....†.....#     ← 碑「渇いた碑文」(2,5)
//      5 #....6......     ← 床の矢束 '6'(5,5)×10・敵なし
//      9 #####..#####     ← 南の口（列5-6）と東の口（行4-5）
//
// ■ 新しい `2,1`＝潮待ちの中洲（'~'＝bgTiles の水。tiles 層では床）
//      0 ############
//      1 #~~~~~~~~~~#
//      2 #~6=======~#     ← 中洲 (2,2)(3,2)＝乾いた床・矢束 '6'(2,2)×10／東の砂州 (2,3)〜(2,9)
//      3 #~.~~~~~~=~#     ← 東の砂州の曲がり (3,9)
//      4 #~=~~~~~~...     ← 西の砂州 (4,2)／東の岸 (4,9)(4,10)・東の口
//      5 #~=~~~~~~...
//      6 #~=~~~~~~~~#
//      7 #~=~~....†~#     ← 南の岸・碑「渇いた碑文」(7,9)
//      8 #~===.....~#     ← 西の砂州の根元 (8,2)〜(8,4)／南の岸・南の口
//      9 #####..#####
//   ・**主題＝潮は1回の引きでは渡り切れない＝中洲で次の引きを待つ**（1室目 `4,3` は「潮 vs 敵」＝
//     敵が呑まれるのを見せる部屋。2室目は「潮 vs 勇者」＝自分の足で潮を読む部屋）。
//     潮の規則は 1室目と同じ（game/tide.js・DECISIONS 2026-11-02）＝周期も同じ
//     満ち 3.6 秒 → 引き 3.0 秒（最後の 0.72 秒は砂州が波打つ予告）＝D3 の潮のリズムは1つ。
//   ・南の岸から東の岸まで＝砂州 15 枚＋中洲 2 枚＋岸 1 枚＝18 マス＝36 tick（勇者は 1 マス 2 tick）。
//     引きは 25 tick ∴**1回の引きでは渡り切れない**。区間に分けると：
//       西の区間＝南の岸 (8,5) → 中洲 (3,2)＝8 マス＝16 tick（余り 9 tick）
//       東の区間＝中洲 (2,2) → 東の岸 (4,9)＝9 マス＝18 tick（余り 7 tick＝引いた瞬間に出ないと間に合わない）
//     途中で満ちると「最後に乾いた所」へ押し戻されて半ハート＝**中洲より先で呑まれれば中洲へ、
//     手前で呑まれれば岸へ**戻る（押し戻しの規則がそのまま中継点になる＝新しい規則は足していない）。
//   ・中洲の矢束（×10）＝渡る途中で拾える報酬（弓を持っていなければ今までどおり何も起きない）。
//   ・疾風の靴（field `15,19`）を持っていれば 1 回の引きで渡り切れる（1 マス 1 tick＝18 tick）＝寄り道の見返り。
//   ・敵なし（脅威度 0）。この部屋は通り道＝`2,2` ↔ `3,1` は `3,2`（地図）経由でも行ける＝潮を待ちたくなければ回り道。
//   ・型を重ねない相手＝D3 `4,3`「潮だまりの砂州」（敵が呑まれる）／D5 の水門（鐘・ボタンで潮を操る）／
//     D7 `2,0`「空の飛び石」（崩れる足場を渡る＝時間ではなく踏んだ回数）。
//
// ■ 撤去／移したもの
//   床の矢束 (5,5) → 中洲 (2,2)（数は同じ ×10）。碑 (2,5) → 南の岸 (7,9)（本文は同じ）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と砂は bgTiles だけ／矢束は中洲の1つ（×10）／碑の本文は書き換え前と同じ
//   ・潮の周期は 1室目と同じ／砂州は links に無い／余計な仕掛け・敵なし
//   ・満ちている間：南の岸・中洲・東の岸は互いに歩いて届かない／引いている間：全部届く
//   ・区間の長さ（1回の引きで足りる）と通しの長さ（1回の引きでは足りない）を BFS の歩数で測る
//   ・口と口の前は潮ゲートでない／砂州は幅1
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d3-2-1-tide-midbar.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d3-2-1-tide-midbar.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_3';
export const ROOM  = '2,1';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（'~' は bgTiles の水として敷き、tiles 側は '.'） ─────────────
export const TARGET = [
	'############',
	'#~~~~~~~~~~#',
	'#~6=======~#',
	'#~.~~~~~~=~#',
	'#~=~~~~~~...',
	'#~=~~~~~~...',
	'#~=~~~~~~~~#',
	'#~=~~....†~#',
	'#~===.....~#',
	'#####..#####',
];
export const TIDE_CYCLE = { highMs: 3600, lowMs: 3000, warnMs: 720 };   // 1室目 `4,3` と同じ
export const ARROWS = '2,2';
export const ARROWS_COUNT = 10;
export const SIGN = '7,9';
export const MIDBAR = ['2,2', '3,2'];                                  // 中洲（乾いた床）
export const BAR_WEST = ['8,4', '8,3', '8,2', '7,2', '6,2', '5,2', '4,2'];   // 南の岸 → 中洲
export const BAR_EAST = ['2,3', '2,4', '2,5', '2,6', '2,7', '2,8', '2,9', '3,9'];   // 中洲 → 東の岸
export const SOUTH_SHORE = ['7,5', '7,6', '7,7', '7,8', '8,5', '8,6', '8,7', '8,8', '8,9', '9,5', '9,6'];
export const EAST_SHORE = ['4,9', '4,10', '4,11', '5,9', '5,10', '5,11'];
export const SOUTH_STAND = '8,5';   // 西の砂州の根元（南の岸の端）
export const EAST_STAND = '4,9';    // 東の砂州の根元（東の岸の端）
export const OPENING = { south: '8,5', east: '4,11' };
export const SAND = [...BAR_WEST, ...BAR_EAST];
export const TICKS_PER_CELL = 2;    // 勇者＝1 tick に半マス
export const TICK_MS = 120;

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

export function tilesOf(target = TARGET) { return target.map((row) => [...row].map((ch) => (ch === TILE.WATER ? TILE.FLOOR : ch))); }
export function bgOf(target = TARGET, sand = SAND) {
	const bg = {};
	target.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === TILE.WATER) bg[key(r, c)] = TILE.WATER; }));
	for (const k of sand) bg[k] = TILE.SAND;
	return bg;
}

// 歩ける所（水と固い物は通れない・潮ゲートは tideOpen のときだけ）→ 歩数つき
export function walk(grid, starts, { tideOpen = false } = {}) {
	const ok = (r, c) => {
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
		const ch = grid[r][c];
		if (ch === TILE.WATER) return false;
		if (ch === TILE.TIDE_GATE) return tideOpen;
		return !HARD_BLOCKED.has(ch);
	};
	const dist = new Map();
	const q = [];
	for (const k of starts) { const [r, c] = parse(k); if (ok(r, c) && !dist.has(k)) { dist.set(k, 0); q.push([r, c]); } }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = key(nr, nc);
			if (!dist.has(k) && ok(nr, nc)) { dist.set(k, dist.get(key(r, c)) + 1); q.push([nr, nc]); }
		}
	}
	return dist;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2)
	const layerRun = () => bfsLayer(stages, START, { withLadder: false, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: false, openTiles: new Set(['T', '!', 'D', '=', '(', ')']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// 碑の本文は書き換え前のまま運ぶ（既に移してあれば移した先から読む＝冪等）
	const oldSign = room.signData?.['2,5'] ?? room.signData?.[SIGN];
	if (!oldSign) die(`${ROOM} の碑（2,5 か ${SIGN}）の本文が無い`);
	const signBody = JSON.parse(JSON.stringify(oldSign));

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`外周の口の形が書き換え前と同じ`, ringOf(before).replace(/[^#]/g, '.') === ringOf(TARGET).replace(/[^#]/g, '.'));
	room.tiles = tilesOf();
	room.bgTiles = bgOf();
	room.chestContents = {};
	room.floorItems = { [ARROWS]: { count: ARROWS_COUNT } };
	room.showConditions = {};
	room.breakableWalls = {};
	room.signData = { [SIGN]: signBody };
	room.links = [];
	room.enemyDirs = {};
	room.tideCycle = { ...TIDE_CYCLE };
	delete room.enemyChase;
	delete room.enemyHold;
	delete room.enemiesRespawn;
	delete room.fluteEffect;

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const grid = TARGET.map((row) => [...row]);
	const at = (k) => { const [r, c] = parse(k); return grid[r][c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === tilesOf().map(rowStr).join('\n'));
	{
		const bg = room.bgTiles;
		const water = Object.keys(bg).filter((k) => bg[k] === TILE.WATER);
		const sand = Object.keys(bg).filter((k) => bg[k] === TILE.SAND);
		check(`bgTiles＝水 ${water.length} 枚・砂 ${sand.length} 枚（ほかの値なし・中洲と岸は床のまま）`,
			water.length + sand.length === Object.keys(bg).length && sand.sort().join() === [...SAND].sort().join()
			&& [...MIDBAR, ...SOUTH_SHORE, ...EAST_SHORE].every((k) => !bg[k]));
		check(`tiles 層に水を置いていない（水は bgTiles だけ）`, !flat.includes(TILE.WATER));
	}
	check(`矢束は中洲の ${ARROWS} の1つだけ・×${ARROWS_COUNT}（書き換え前と同じ数）`,
		flat.filter((ch) => ch === TILE.ITEM_ARROWS).length === 1 && at(ARROWS) === TILE.ITEM_ARROWS && MIDBAR.includes(ARROWS)
		&& Object.keys(room.floorItems).join() === ARROWS && room.floorItems[ARROWS].count === ARROWS_COUNT);
	check(`碑は南の岸の ${SIGN} の1つだけ・本文「${signBody.lines?.[0]}」は書き換え前と同じ・npcData に本文なし`,
		flat.filter((ch) => ch === '†').length === 1 && at(SIGN) === '†' && SOUTH_SHORE.some((k) => {
			const [r, c] = parse(k); const [sr, sc] = parse(SIGN); return Math.abs(r - sr) + Math.abs(c - sc) === 1;
		}) && Object.keys(room.signData).join() === SIGN && signBody.name === '渇いた碑文'
		&& !Object.keys(room.npcData ?? {}).length);
	check(`潮の周期＝満ち ${TIDE_CYCLE.highMs}ms・引き ${TIDE_CYCLE.lowMs}ms・予告 ${TIDE_CYCLE.warnMs}ms（1室目 4,3 と同じ）`,
		JSON.stringify(room.tideCycle) === JSON.stringify(TIDE_CYCLE)
		&& JSON.stringify(stages['4,3'].tideCycle) === JSON.stringify(TIDE_CYCLE));
	check(`潮ゲートは砂州の ${SAND.length} 枚だけ・どれも links に無い（＝潮の周期で動く）`,
		flat.filter((ch) => ch === TILE.TIDE_GATE).length === SAND.length && SAND.every((k) => at(k) === TILE.TIDE_GATE)
		&& room.links.length === 0);
	check(`宝箱・石・立札・ボタン・鐘・門・ルピー・出現条件・笛の効き目が無い`,
		![TILE.CHEST, TILE.STONE, TILE.SIGN, TILE.BUTTON, TILE.SWITCH, TILE.GATE, TILE.RUPEE].some((ch) => flat.includes(ch))
		&& !Object.keys(room.chestContents).length && !Object.keys(room.showConditions).length && !room.fluteEffect);
	{
		const mobs = flat.filter((ch) => ENEMY_META[ch]);
		check(`敵なし（実測 ${mobs.join(' ') || '0 体'}）・脅威度 0`, !mobs.length && stageThreat(room, ENEMY_META) === 0);
	}

	// ── ② 歩行：満ちれば3つの陸は離れ、引けばつながる。区間と通しの長さ ─────────
	{
		const floors = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const ch = grid[r][c];
			if (ch !== TILE.WATER && !HARD_BLOCKED.has(ch)) floors.push(key(r, c));
		}
		const highS = walk(grid, [OPENING.south]);
		const highE = walk(grid, [OPENING.east]);
		const highM = walk(grid, [MIDBAR[0]]);
		const same = (m, arr) => [...m.keys()].sort().join() === [...arr].sort().join();
		check(`満ちている間、南の口から歩けるのは南の岸だけ（${highS.size} マス）`, same(highS, SOUTH_SHORE));
		check(`満ちている間、東の口から歩けるのは東の岸だけ（${highE.size} マス）`, same(highE, EAST_SHORE));
		check(`満ちている間、中洲はどの岸ともつながらない（${highM.size} マス）`, same(highM, MIDBAR));
		const lowS = walk(grid, [OPENING.south], { tideOpen: true });
		const stranded = floors.filter((k) => !lowS.has(k));
		check(`引いている間は床が全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);

		const lowTicks = TIDE_CYCLE.lowMs / TICK_MS;
		const legW = walk(grid, [SOUTH_STAND], { tideOpen: true }).get(MIDBAR[1]);
		const legE = walk(grid, [MIDBAR[0]], { tideOpen: true }).get(EAST_STAND);
		const whole = walk(grid, [SOUTH_STAND], { tideOpen: true }).get(EAST_STAND);
		check(`西の区間（${SOUTH_STAND} → 中洲 ${MIDBAR[1]}）＝${legW} マス＝${legW * TICKS_PER_CELL} tick ≤ 引き ${lowTicks} tick`,
			legW * TICKS_PER_CELL <= lowTicks);
		check(`東の区間（中洲 ${MIDBAR[0]} → ${EAST_STAND}）＝${legE} マス＝${legE * TICKS_PER_CELL} tick ≤ 引き ${lowTicks} tick`,
			legE * TICKS_PER_CELL <= lowTicks);
		check(`通し（${SOUTH_STAND} → ${EAST_STAND}）＝${whole} マス＝${whole * TICKS_PER_CELL} tick ＞ 引き ${lowTicks} tick＝1回の引きでは渡り切れない（疾風の靴なら ${whole} tick）`,
			whole * TICKS_PER_CELL > lowTicks && whole <= lowTicks);
		const narrow = SAND.every((k) => {
			const [r, c] = parse(k);
			const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dr, dc]) => {
				const ch = grid[r + dr]?.[c + dc];
				return ch && ch !== TILE.WATER && ch !== TILE.WALL;
			});
			return side.length <= 2;
		});
		check(`砂州は幅1（どの砂州のマスも陸の隣は前後の2つまで）`, narrow);
		const mouth = ['8,5', '8,6', '4,10', '5,10', '4,11', '5,11'];
		check(`口と口の前は潮ゲートでない（入った瞬間に押し戻されない）`, mouth.every((k) => at(k) !== TILE.TIDE_GATE));
	}

	// ── ③ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
			same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(open.reachedRooms, baseOpen.reachedRooms));
		check(`${ROOM} に到達できる`, closed.reachedRooms.has(ROOM));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「潮待ちの中洲」に作り替える（キュー94 の2室目）`);
	console.log(`\n## 盤面の差分（${ROOM}・水は ~ で表示）`);
	TARGET.forEach((row, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === tilesOf()[i].join('') ? '=' : '→'}   ${row}`);
	});
	console.log('\n## 検証');
	let ng = 0;
	for (const [cond, msg] of verify) {
		console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
		if (!cond) ng++;
	}
	if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);

	if (DRY) {
		console.log('\n--dry: 書き込みなし');
	} else {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('\n書き込み完了:', MAP_PATH);
	}
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
