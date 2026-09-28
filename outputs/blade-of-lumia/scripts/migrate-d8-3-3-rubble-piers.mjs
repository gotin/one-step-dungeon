// dungeon_8 `3,3`：飾りの「石＋ボタンの門」部屋を「崩れ壁の橋脚」（爆弾＋はしご）に作り替える
// （2026-09-28 / PLAN 実行キュー 34 の6室目・設計は Opus。ユーザーの指示＝「図では判断できない
//   ので実装して見せて」∴叩き台のまま実装し、実機で判定を受ける）
//
// ■ 何が壊れていたか（着手前の実測）
//      1 #.......B..#     ← 宝箱 B(1,8)＝ルピー×10・showConditions `stonesPushed`
//      2 #.......T..#     ← 門 T(2,8)＝宝箱とは無関係
//      3 #..*..S....#     ← 石 *(3,3)・ボタン S(3,6)
//   `stonesPushed` はエンジンに無い trigger ∴宝箱は**永久に開かなかった**（5室目の `3,0` と同じ）。
//   この部屋は北・南・西・東の4つの口を持つ「素通りの部屋」＝4つの口を徒歩でつなぐ外周は残す。
//
// ■ 作り替え後（`~`＝bgTiles の水・tiles は '.'）
//      0 #####..#####
//      1 #..........#
//      2 #.########.#
//      3 #.###..~!#.#     ← 北の間 (3,5)(3,6)・水 (3,7)・崩れ壁 !(3,8)
//      4 ..~!#.##.#..     ← 水 (4,2)・崩れ壁 !(4,3)・(4,5)＝橋脚の横の着地・(4,8)
//      5 ..#..~!#B#..     ← 控えの間 (5,3)(5,4)・水 (5,5)・崩れ壁 !(5,6)・宝箱 B(5,8)
//      6 #.###!##~#.#     ← 崩れ壁 !(6,5)・幅2の水 (6,8)(7,8)
//      7 #.######~#.#
//      8 #i.........#     ← 石碑 i(8,1)
//      9 #####..#####
//   解き筋：
//     ① 西の外周 (4,1) で爆弾 → 水 (4,2) 越しに !(4,3) が崩れる → はしごで渡って控えの間へ
//     ② 控えの間 (5,4) で爆弾 → !(5,6) と !(6,5) が1発で崩れる。崩れた (5,6) は**扉ではなく
//        橋脚**（行き止まりの1マス）＝はしごが水 (5,5) に架かる。その上から**横（北）へ**降りて (4,5)
//     ③ 北の間 (3,6) で爆弾 → 水 (3,7) 越しに !(3,8) が崩れる → 渡って (4,8) → 宝箱 (5,8)
//   おとり：東の外周 (3,10)・北の外周 (1,8) からも !(3,8) は壁越しに崩せる（宝箱への道は見えるが
//     入れない）・南の外周 (8,5) からも !(6,5) は壁越しに崩せる（崩れても外周からは届かない）・
//     宝箱の真下は幅2の水（はしごが架からない）。先に崩しても損はしない＝爆弾＋はしごは単調で詰まない。
//
// ■ 設計の不変条件（下の自己検証で担保）
//   ・帰りの橋脚：宝箱側から水 (5,5) へ戻るには縦の両岸 (4,5)/(6,5) が要る。(6,5) が崩れていないと
//     宝箱側に**閉じ込められる**（最初の叩き台で noEscape 1）∴(6,5) は往きの橋脚 (5,6) と同じ
//     1発（(5,4) の爆弾）で必ず崩れる位置に置き、ソルバーで noEscape 0 を確かめる。
//   ・近道が無い：外周から壊せる '!' を壊しても、控えの間・北の間・宝箱へ入れない。
//
// 使い方（outputs/blade-of-lumia/ で）：
//   node scripts/migrate-d8-3-3-rubble-piers.mjs --dry   # 書き込まずに差分と検証
//   node scripts/migrate-d8-3-3-rubble-piers.mjs         # 書き込み（冪等）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { toolsUsableIn } from '../shared/progression.js';
import { bfsLayer } from './lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from './lib/blade-solver.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_8';
const ROOM  = '3,3';

// tiles（水のセルは '.'・水そのものは WATER に置く）
const TARGET = [
	'#####..#####',
	'#..........#',
	'#.########.#',
	'#.###...!#.#',
	'...!#.##.#..',
	'..#...!#B#..',
	'#.###!##.#.#',
	'#.######.#.#',
	'#i.........#',
	'#####..#####',
];
const WATER = {};
for (const k of ['3,7', '4,2', '5,5', '6,8', '7,8']) WATER[k] = TILE.WATER;
const CHEST = '5,8';
const SIGN  = '8,1';
const CRACKS = ['3,8', '4,3', '5,6', '6,5'];
const BREAKABLE_WALLS = Object.fromEntries(CRACKS.map((k) => [k, { breakDef: 1 }]));
const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } };
const SIGN_DATA = {
	[SIGN]: {
		name: '崩れた 砦の 石碑',
		lines: [
			'はしごは 両岸が なければ 架からない。',
			'崩れた 壁も 岸に なる。',
		],
	},
};
// 解き筋（爆弾を置くセル）と、その1発で崩れるべき '!'
const PLAN_BOMBS = [
	['4,1', ['4,3']],
	['5,4', ['5,6', '6,5']],
	['3,6', ['3,8']],
];
const WANT_MIN_BOMBS = 3;

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`${LAYER} が無い`);
const room = stages[ROOM];
if (!room) die(`${LAYER} ${ROOM} が無い`);

const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2) の着地セル
const layerRun = () => bfsLayer(stages, START, { withLadder: true, openTiles: null });
const layerRunOpen = () => bfsLayer(stages, START, { withLadder: true, openTiles: new Set(['T', '!', 'D', '=', '(', ')']) });
const baseClosed = layerRun();
const baseOpen = layerRunOpen();

const before = room.tiles.map(rowStr);
const beforeBg = { ...(room.bgTiles ?? {}) };
const log = [];
const verify = [];
const check = (msg, cond) => verify.push([!!cond, msg]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ── 書き換え ─────────────────────────────────────────────────────────
// tiles は「文字の配列の配列」で持つ（[[field-tiles-are-char-arrays]]）。
if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
	room.tiles = TARGET.map((row) => row.split(''));
	log.push(`  ${ROOM}: 盤面を差し替えた`);
}
if (!same(room.bgTiles ?? {}, WATER)) {
	room.bgTiles = { ...WATER };
	log.push(`  ${ROOM}: bgTiles（水 ${Object.keys(WATER).length} 枚）を敷いた（旧 ${Object.keys(beforeBg).join(' ') || 'なし'}）`);
}
if ((room.links ?? []).length) log.push(`  ${ROOM}: links を空にした`);
room.links = [];
if (!same(room.chestContents ?? {}, CHEST_CONTENTS)) {
	log.push(`  ${ROOM}: 宝箱を ${Object.entries(room.chestContents ?? {}).map(([k, v]) => `${k}=${v.name}`).join(' ') || 'なし'} → ${CHEST}=ルピー×20 にした`);
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
}
if (Object.keys(room.showConditions ?? {}).length) {
	log.push(`  ${ROOM}: showConditions（${Object.entries(room.showConditions).map(([k, v]) => `${k}=${v.trigger}`).join(' ')}）を外した`);
}
room.showConditions = {};
if (!same(room.breakableWalls ?? {}, BREAKABLE_WALLS)) {
	room.breakableWalls = JSON.parse(JSON.stringify(BREAKABLE_WALLS));
	log.push(`  ${ROOM}: breakableWalls（${CRACKS.join(' ')}・breakDef 1）を登録した`);
}
if (!same(room.signData ?? {}, SIGN_DATA)) {
	log.push(`  ${ROOM}: 石碑 ${SIGN}「${SIGN_DATA[SIGN].name}」を置いた`);
	room.signData = JSON.parse(JSON.stringify(SIGN_DATA));
}

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const isWater = (bg, k) => bg[k] === TILE.WATER;
const bg2d = (bg) => Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => (isWater(bg, `${r},${c}`) ? '~' : 'g')));
const EXITS = ['0,5', '0,6', '9,5', '9,6', '4,0', '5,0', '4,11', '5,11'];
const tools = toolsUsableIn(data)[LAYER] ?? new Set();

// 実ゲームと同じ遷移（lib/blade-solver.mjs）で到達状態を全列挙する。
function explore(t, bg, { hasLadder = tools.has('ladder'), noTools = false } = {}) {
	const S = makeSolver(t, bg2d(bg), [], {}, new Set(), {
		hasLadder, hasCandle: tools.has('candle'),
		noTools: noTools || !(tools.has('bow') || tools.has('bomb') || tools.has('boomerang')),
	});
	const starts = S.exitCells.map((cell) => { const [r, c] = cell.split(',').map(Number); return S.encode(r, c, [], 0, 0, 0); });
	const edges = new Map();
	const seen = new Set(starts), q = [...starts];
	for (let h = 0; h < q.length; h++) {
		const ns = S.nextStates(q[h]); edges.set(q[h], ns);
		for (const n of ns) if (!seen.has(n)) { seen.add(n); q.push(n); }
	}
	return { S, starts, edges, states: q };
}
const posOf = (s) => s.split('|')[0];
const brokenOf = (s) => Number(s.split('|')[3]);
function solve(t, bg, opts) {
	const { S, starts, edges, states } = explore(t, bg, opts);
	const goals = states.filter((s) => posOf(s) === CHEST);
	// 最少爆弾数＝0-1 BFS（壊れた壁が増える手だけコスト 1）
	const cost = new Map(starts.map((s) => [s, 0]));
	const dq = [...starts];
	while (dq.length) {
		const s = dq.shift();
		for (const n of edges.get(s)) {
			const w = brokenOf(n) !== brokenOf(s) ? 1 : 0;
			const nk = cost.get(s) + w;
			if (cost.has(n) && cost.get(n) <= nk) continue;
			cost.set(n, nk);
			if (w) dq.push(n); else dq.unshift(n);
		}
	}
	const bombs = goals.length ? Math.min(...goals.map((s) => cost.get(s))) : null;
	// 最短手数 L（BFS 距離）
	const dist = new Map(starts.map((s) => [s, 0]));
	for (const s of states) for (const n of edges.get(s)) if (!dist.has(n)) dist.set(n, dist.get(s) + 1);
	const L = goals.length ? Math.min(...goals.map((s) => dist.get(s))) : null;
	// 詰み＝外周の口へ戻れない到達状態
	const rev = new Map();
	for (const [s, ns] of edges) for (const n of ns) { if (!rev.has(n)) rev.set(n, []); rev.get(n).push(s); }
	const ok = new Set(states.filter((s) => S.exitCells.includes(posOf(s))));
	const rq = [...ok];
	for (let h = 0; h < rq.length; h++) for (const p of rev.get(rq[h]) ?? []) if (!ok.has(p)) { ok.add(p); rq.push(p); }
	return { S, solved: goals.length > 0, bombs, L, states: states.length, noEscape: states.length - ok.size, stateList: states };
}
// 道具なし・はしごなしで歩ける床（4つの口から）
function walk(t, bg, brokenSet = new Set()) {
	const ok = (r, c) => {
		if (isWater(bg, `${r},${c}`)) return false;
		const ch = t[r][c];
		if (ch === TILE.BREAKABLE_WALL) return brokenSet.has(`${r},${c}`);
		return TILE_META[ch]?.passable ?? true;
	};
	const seen = new Set(), q = [];
	for (const e of EXITS) { const [r, c] = e.split(',').map(Number); if (ok(r, c)) { seen.add(e); q.push([r, c]); } }
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
const blastOf = (cell) => {   // その座で爆弾を置いたとき崩れる '!'（半径 2・壁も水も越える）
	const [r, c] = cell.split(',').map(Number);
	return CRACKS.filter((k) => { const [br, bc] = k.split(',').map(Number); return Math.hypot(br - r, bc - c) <= 2; }).sort();
};

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
const bg = room.bgTiles;
const count = (ch) => t.flat().filter((x) => x === ch).length;
const cellsOf = (ch) => t.flatMap((row, r) => row.flatMap((x, c) => (x === ch ? [`${r},${c}`] : []))).sort();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列`, room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
check(`${ROOM} の bgTiles＝水 ${Object.keys(WATER).length} 枚`, same(bg, WATER));
check(`水の下は全部 tiles '.'`, Object.keys(bg).every((k) => { const [r, c] = k.split(',').map(Number); return t[r][c] === TILE.FLOOR; }));
check(`${ROOM} の links が空`, same(room.links, []));
check(`${ROOM} の宝箱＝${CHEST} のルピー×20 だけ`, same(room.chestContents, CHEST_CONTENTS) && same(cellsOf(TILE.CHEST), [CHEST]));
check(`${ROOM} の showConditions が空（エンジンに無い trigger を残さない）`, same(room.showConditions, {}));
for (const ch of [TILE.STONE, TILE.BUTTON, TILE.GATE, TILE.SWITCH]) check(`${ROOM} に '${ch}' が残っていない`, count(ch) === 0);
check(`崩れ壁 '!' は ${CRACKS.join(' ')} の4枚`, same(cellsOf(TILE.BREAKABLE_WALL), [...CRACKS].sort()));
check(`breakableWalls が4枚とも breakDef 1（プレイヤーの爆弾 breakPower 3 で崩れる）`, same(room.breakableWalls, BREAKABLE_WALLS));
check(`石碑 ${SIGN} に本文がある（{name,lines} 形式）`, t[8][1] === TILE.SIGN && Array.isArray(room.signData[SIGN]?.lines) && Object.keys(room.signData).length === 1);
check(`盤面の文字は # . ! B i だけ（敵・石・門などを置かない）`, t.flat().every((ch) => '#.!Bi'.includes(ch)));

// ── ② 素通りの部屋として生きている／近道が無い ───────────────────────────
{
	const w0 = walk(t, bg);
	check(`道具なしで4つの口（北・南・西・東）が互いに歩いてつながる`, EXITS.every((e) => w0.has(e)));
	// 外周（壊す前に歩ける床）に立って爆弾を置いたとき崩れる '!' の全部
	const outer = [...new Set([...w0].flatMap(blastOf))].sort();
	check(`外周から崩せる '!' は ${outer.join(' ')}（(4,3) 入口・(3,8)(6,5) おとり）`, same(outer, ['3,8', '4,3', '6,5']));
	// 外周から崩せる '!' を全部崩しても、徒歩（はしご無し）では中へ入れない
	const w1 = walk(t, bg, new Set(outer));
	const inner = ['3,5', '3,6', '4,5', '4,8', '5,3', '5,4', CHEST];
	check(`外周から崩せる '!' を全部崩しても徒歩では中へ1マスも入れない`, inner.every((k) => !w1.has(k)));
}

// ── ③ ソルバー（実ゲームと同じ遷移）───────────────────────────────────
{
	const m = solve(t, bg);
	check(`解ける（D8 の道具＝${[...tools].join(' ')}・状態 ${m.states}・L ${m.L}）`, m.solved);
	check(`詰み 0＝宝箱側に閉じ込められる状態が無い（実測 noEscape ${m.noEscape}）`, m.noEscape === 0);
	check(`爆弾は最少 ${WANT_MIN_BOMBS} 個（実測 ${m.bombs}）`, m.bombs === WANT_MIN_BOMBS);
	check(`はしご無しでは解けない`, !solve(t, bg, { hasLadder: false }).solved);
	check(`爆弾（道具）無しでは解けない`, !solve(t, bg, { noTools: true }).solved);
	// 必須の '!'＝壁にすると解けない。(6,5) は往きには要らない（帰りの橋脚）
	for (const k of ['3,8', '4,3', '5,6']) {
		const g = grid(); const [r, c] = k.split(',').map(Number); g[r][c] = TILE.WALL;   // [[blade-control-experiment-needs-tile-wall]]
		check(`対照：!(${k}) を壁にすると解けない`, !solve(g, bg).solved);
	}
	{
		const g = grid(); g[6][5] = TILE.WALL;
		const m2 = solve(g, bg);
		check(`対照：帰りの橋脚 !(6,5) を壁にすると宝箱には届くが閉じ込められる（noEscape ${m2.noEscape}）`, m2.solved && m2.noEscape > 0);
	}
	// 解き筋の3発：その座で崩れる '!' が設計どおり
	const done = new Set();
	for (const [cell, want] of PLAN_BOMBS) {
		const got = blastOf(cell).filter((k) => !done.has(k));
		check(`解き筋：${cell} の爆弾で新しく崩れる '!' は ${want.join(' ')}（実測 ${got.join(' ') || 'なし'}）`, same(got, [...want].sort()));
		for (const k of got) done.add(k);
	}
	// 往きの橋脚 (5,6) が**まだ崩れていない**状態で立てる座のうち (5,6) を崩せるものは、
	// どれも帰りの橋脚 (6,5) も一緒に崩す（＝(5,6) だけ崩れて (6,5) が残る状態を作れない）
	const bit56 = 1 << m.S.breakCells.indexOf('5,6');
	const seatsBefore = new Set(m.stateList.filter((s) => !(brokenOf(s) & bit56)).map(posOf));
	const pierSeats = [...seatsBefore].filter((k) => blastOf(k).includes('5,6')).sort();
	check(`!(5,6) を崩せる立ち位置（${pierSeats.join(' ')}）はどれも !(6,5) も崩す`, pierSeats.length > 0 && pierSeats.every((k) => blastOf(k).includes('6,5')));
}

// ── ④ はしごが架かる水（ゲーム側の判定）──────────────────────────────────
// 壊す前に架かる水は無い／全部壊した後に架かるのは (3,7)(4,2)(5,5) の3枚だけ（宝箱の下の幅2は架からない）
const gameBank = (tt, bgx, broken, r, c) => {
	if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
	const ch = tt[r][c];
	if (ch === TILE.WATER || ch === TILE.PIT || isWater(bgx, `${r},${c}`)) return false;
	if (ch === TILE.BREAKABLE_WALL) return broken.has(`${r},${c}`);
	return TILE_META[ch]?.passable ?? true;
};
const gameBridge = (tt, bgx, broken, r, c) =>
	(gameBank(tt, bgx, broken, r - 1, c) && gameBank(tt, bgx, broken, r + 1, c)) ||
	(gameBank(tt, bgx, broken, r, c - 1) && gameBank(tt, bgx, broken, r, c + 1));
{
	const b0 = Object.keys(bg).filter((k) => gameBridge(t, bg, new Set(), ...k.split(',').map(Number)));
	check(`壊す前にはしごが架かる水は 0 枚（実測 ${b0.join(' ') || 'なし'}）`, b0.length === 0);
	const b1 = Object.keys(bg).filter((k) => gameBridge(t, bg, new Set(CRACKS), ...k.split(',').map(Number))).sort();
	check(`全部崩した後に架かるのは 3,7 4,2 5,5 だけ（実測 ${b1.join(' ')}）`, same(b1, ['3,7', '4,2', '5,5']));
}

// ── ⑤ 層の到達性は不変 ───────────────────────────────────────────────
{
	const closed = layerRun();
	const open = layerRunOpen();
	const sameSet = (a, b) => same([...a].sort(), [...b].sort());
	check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, sameSet(closed.reachedRooms, baseClosed.reachedRooms));
	check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`, sameSet(open.reachedRooms, baseOpen.reachedRooms));
	check(`${ROOM} に到達できる`, closed.reachedRooms.has(ROOM));
	check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：飾りの石＋ボタンの門を「崩れ壁の橋脚」に作り替える（キュー34 6室目）`);
console.log(log.join('\n') || '  （変更なし）');

console.log(`\n## 盤面の差分（${ROOM}・水は ~ で重ねて表示）`);
const show = (row, i, b) => row.split('').map((ch, c) => (ch === '.' && isWater(b, `${i},${c}`) ? '~' : ch)).join('');
room.tiles.forEach((row, i) => {
	const was = show(before[i], i, beforeBg), now = show(rowStr(row), i, bg);
	console.log(`   ${String(i).padStart(2)} ${was}   ${was === now ? '=' : '→'}   ${now}`);
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
