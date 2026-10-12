// dungeon_1 `0,3`（入口の西の行き止まり）：大ルピーが1枚落ちているだけの四角い部屋を「石室の宝棚」に作り替える
// （2026-10-12 / PLAN 実行キュー 47 の第1陣 1室目・設計は Opus）
//
// ■ 何が薄かったか（キュー47 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 #...........     ← 東の口（入口 `1,3`）
//      5 #....R......
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 ############
//   四角い広間の真ん中に大ルピー（R＝5）が1枚＝入ってすぐ拾って出るだけ（キュー21 の F6）。
//
// ■ 新しい `0,3`＝石室の宝棚（D1 で最初に出会う石＝押す向きを選ぶ）
//      0 ############
//      1 #..........#
//      2 #..........#     ← 北の通り（石の北側へ回り込む道）
//      3 ###.#i.....#     ← (3,3) 石の北の立ち位置／(3,5) 書き置き
//      4 #B.*........     ← 西の壁の棚に宝箱 (4,1)・棚の口に石 (4,3)／東の口
//      5 ###.#.......     ← (5,3) 石の下の袋（1マス）
//      6 ####.......#
//      7 #..........#
//      8 #..........#
//      9 ############
//   ・西の壁に幅1の棚（`(4,1)` 宝箱・`(4,2)` 宝箱の前）。棚の口 `(4,3)` を石が塞いでいる。宝箱は踏んで開ける。
//   ・東の口から入ると、目の前の石を西へ押したくなる＝**押すと石は棚へ入り、宝箱の前で止まる＝詰む**
//     （宝箱の前のマスが石で埋まり、石は宝箱に入れないのでもう押せない）。
//   ・⚠️ この部屋で、エンジンが石を宝箱の上へ通していたのが分かった（ソルバーは最初から通さない）＝
//     `game/player.js` の stoneCanEnter に宝箱を足してソルバーに揃えた。部屋を出て入り直せば石は元へ戻る（`enterStage` の石のリセット）。
//   ・答え＝北の通りから `(3,3)` へ回り込み、石を南の袋 `(5,3)` へ押し下ろす＝棚の口が空く（押しは1回）。
//   ・書き置き `(3,5)`（木の看板＝名前に「刻み」「碑」を使わない＝tests/warp-stone.spec.js ①）＝「石は押せば動く／詰まらせたら外へ出よ」＝やり直しの規則だけを言葉にする（答えは言わない）。
//     D1 の石はここが初出＝`2,1`（石でボタンを押して紋章の門を開ける）の前に「石は動く・詰まっても戻る」を覚える。
//   ・敵なし（入口の隣の静かな部屋）。宝箱＝ルピー×30（キュー45 の C 段＝最短 14 手で L16 未満）。
//   ・⚠️ D2 `3,1`（砂の方位盤）・D4〜D8 の鍵の部屋とは型を分けた＝ボタンも門も無い「押す向きを1つ選ぶ」だけ。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（東の口は同じセルで開いたまま）。
//
// 使い方:
//   node scripts/migrate-d1-0-3-stone-storeroom.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d1-0-3-stone-storeroom.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_1';
const ROOM  = '0,3';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...........',
	'#....R......',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#..........#',
	'#..........#',
	'###.#i.....#',
	'#B.*........',
	'###.#.......',
	'####.......#',
	'#..........#',
	'#..........#',
	'############',
];
export const EXITS = { east: ['4,11', '5,11'] };
export const STONE = '4,3';          // 棚の口を塞ぐ石
export const SHELF = '4,2';          // 宝箱の前（ここに立てば開けられる）
export const CHEST = '4,1';
export const POCKET = '5,3';         // 石の下の袋＝正しい押し先
export const NORTH_STAND = '3,3';    // 石を南へ押す立ち位置
export const FRONT_STAND = '4,4';    // 東から入って石を西へ押す立ち位置（＝詰む押し）
export const SIGN = '3,5';
export const SIGN_DATA = {
	name: '石室の 書き置き',
	lines: ['石は 押せば 動く。', '詰まらせたら 一度 外へ 出よ。', '石は 元の 場所へ 戻る。'],
};
export const CHEST_CONTENT = { type: 'rupee', value: 30, name: 'ルピー×30' };   // キュー45 の C 段（L16 未満）
export const SHORTEST = 14;          // 東の口から宝箱を踏むまで（歩き＋押し）

// ── 歩行の到達（石と宝箱と看板を壁として扱う） ─────────────────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
const WALLISH = new Set([TILE.WALL, TILE.STONE, TILE.CHEST, TILE.SIGN]);
export function reach(t, from = EXITS.east[0]) {
	const seen = new Set([from]);
	const q = [from];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(nk) || WALLISH.has(t[nr][nc])) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}

// ── ソルバー（実エンジンの石押しの写し）。goal＝宝箱のマスを踏む（宝箱は踏んで開ける） ───
// 宝箱はプレイヤーは踏めるが石は入れない（solver の passableFor と game/player.js stoneCanEnter が同じ規則）。
export function solveRoom(board = TARGET, { noPush = false } = {}) {
	const tiles = board.map((row) => [...row]);
	const bg = board.map((row) => [...row].map(() => TILE.FLOOR));
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: false, noPush });
	const exits = Object.values(EXITS).flat();
	const starts = exits.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	const goalTest = (st) => st.split('|')[0] === CHEST;
	const m = measureMetrics(S, starts, goalTest, () => 0, {
		guardMax: 1_000_000, greedyFn: () => false,
		escapeTest: (st) => exits.includes(st.split('|')[0]),
	});
	// 最短解の押し列
	const par = new Map(starts.map((s) => [s, null]));
	const q = [...starts];
	let g = null;
	for (let h = 0; h < q.length; h++) {
		if (goalTest(q[h])) { g = q[h]; break; }
		for (const nx of S.nextStates(q[h])) if (!par.has(nx)) { par.set(nx, q[h]); q.push(nx); }
	}
	const pushList = [];
	if (g) {
		const path = [];
		for (let s = g; s; s = par.get(s)) path.unshift(s);
		for (let i = 1; i < path.length; i++) {
			const A = path[i - 1].split('|')[1].split(';'), B = path[i].split('|')[1].split(';');
			const j = A.findIndex((x, k) => x !== B[k]);
			if (j >= 0) pushList.push(`${A[j]}→${B[j]}`);
		}
	}
	return { ...m, pushes: pushList.length, pushList };
}
// 盤面の1セルを差し替えた写し（対照実験用）
export function withCell(k, ch, board = TARGET) {
	const [r, c] = P(k);
	return board.map((row, i) => (i === r ? row.slice(0, c) + ch + row.slice(c + 1) : row));
}

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// import されたときはここで止める（番人は定数と reach・solveRoom だけ使う）。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	// 事前条件＝盤面の外の中身が無い（宝箱と書き置きは、このスクリプトが書いた物なら受ける＝冪等）。
	const extras = ['mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects', 'enemyDirs', 'showConditions', 'bgTiles'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	{
		const cur = room.chestContents ?? {};
		if (Object.keys(cur).length && JSON.stringify(cur) !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) die(`${ROOM} の chestContents が想定外の中身`);
		const sd = room.signData ?? {};
		if (Object.keys(sd).length && JSON.stringify(sd) !== JSON.stringify({ [SIGN]: SIGN_DATA }) && sd[SIGN]?.name !== '石室の 刻み') die(`${ROOM} の signData が想定外の中身`);
	}
	if (room.links?.length) die(`${ROOM} の links が空でない`);
	{
		const now = room.tiles.map(rowStr).join('|');
		if (now !== ORIGINAL.join('|') && now !== TARGET.join('|')) die(`${ROOM} の盤面が書き換え前とも狙いとも違う＝誰かが触った`);
	}

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の戻り口の着地
	const OPEN = new Set(['T', '!', 'D', '=']);
	const runs = () => ({
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: false, openTiles: null }),
	});
	// 層の到達性の基準は「書き換え前の盤面」で測る＝適用済みの地図に再実行しても同じ基準になる（冪等）。
	const before = room.tiles.map(rowStr);
	const applied = room.tiles;
	room.tiles = ORIGINAL.map((row) => row.split(''));
	const base = runs();
	room.tiles = applied;

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え（tiles は文字の配列の配列＝[[field-tiles-are-char-arrays]]） ──
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => [...row]);
		log.push(`  ${ROOM}: 盤面を差し替えた（大ルピーを撤去）`);
	}
	if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) {
		room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
		log.push(`  ${ROOM}: 宝箱 ${CHEST} = ${CHEST_CONTENT.name}`);
	}
	if (JSON.stringify(room.signData ?? {}) !== JSON.stringify({ [SIGN]: SIGN_DATA })) {
		room.signData = { [SIGN]: { ...SIGN_DATA, lines: [...SIGN_DATA.lines] } };
		log.push(`  ${ROOM}: 書き置き ${SIGN}「${SIGN_DATA.name}」`);
	}

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const t = room.tiles.map((r) => [...r]);
	const at = (k) => { const [r, c] = P(k); return t[r]?.[c]; };
	const cellsOf = (pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
		return out;
	};
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k))).sort();
		const was = edge.filter((k) => { const [r, c] = P(k); return !HARD_BLOCKED.has(ORIGINAL[r][c]); }).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは東の口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want) && JSON.stringify(was) === JSON.stringify(want));
	}
	check(`敵が居ない`, cellsOf((ch) => !!ENEMY_META[ch]).length === 0);
	check(`石は棚の口 ${STONE} の1つだけ・宝箱は ${CHEST} の1つだけ`,
		JSON.stringify(cellsOf((ch) => ch === TILE.STONE)) === JSON.stringify([STONE])
		&& JSON.stringify(cellsOf((ch) => ch === TILE.CHEST)) === JSON.stringify([CHEST]));
	check(`宝箱 ${CHEST} は ${CHEST_CONTENT.name}・条件なし（初めから見えている）`,
		JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST]: CHEST_CONTENT })
		&& Object.keys(room.showConditions ?? {}).length === 0);
	check(`書き置き ${SIGN}「${SIGN_DATA.name}」が看板タイルに載っている`,
		at(SIGN) === TILE.SIGN && JSON.stringify(room.signData) === JSON.stringify({ [SIGN]: SIGN_DATA }));
	check(`床に落ちている物（ルピー・薬）・ボタン・門・スイッチが無い`,
		cellsOf((ch) => [TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE, TILE.ITEM_HEAL_POTION, TILE.BUTTON, TILE.GATE, TILE.SWITCH,
			TILE.KEY, TILE.DOOR, TILE.TORCH, TILE.PIT].includes(ch)).length === 0);

	// ── ② 棚の幾何 ──────────────────────────────────────────────────
	{
		const foot = reach(t);
		const floors = cellsOf((ch) => ch === TILE.FLOOR);
		const unreached = floors.filter((k) => !foot.has(k));
		check(`石を動かさずに歩いて届かない床は 宝箱の前 ${SHELF} と袋 ${POCKET} だけ（実測 ${unreached.join(' ')}）`,
			JSON.stringify(unreached.sort()) === JSON.stringify([SHELF, POCKET].sort()));
		check(`石の北 ${NORTH_STAND} と東 ${FRONT_STAND} には歩いて立てる`, foot.has(NORTH_STAND) && foot.has(FRONT_STAND));
		const [sr, sc] = P(STONE);
		check(`石の西は宝箱の前・南は袋（その先は壁）・北は立ち位置`,
			`${sr},${sc - 1}` === SHELF && `${sr + 1},${sc}` === POCKET && `${sr - 1},${sc}` === NORTH_STAND
			&& at(`${sr + 2},${sc}`) === TILE.WALL && at(`${sr},${sc - 2}`) === TILE.CHEST);
		const [pr, pc] = P(POCKET);
		check(`袋 ${POCKET} は北（石の口）以外の3方が壁`,
			[[1, 0], [0, -1], [0, 1]].every(([dr, dc]) => at(`${pr + dr},${pc + dc}`) === TILE.WALL));
		const [hr, hc] = P(SHELF);
		check(`宝箱の前 ${SHELF} は東（石の口）以外の3方が壁か宝箱`,
			[[-1, 0], [1, 0]].every(([dr, dc]) => at(`${hr + dr},${hc + dc}`) === TILE.WALL) && at(`${hr},${hc - 1}`) === TILE.CHEST);
	}

	// ── ③ ソルバー ──────────────────────────────────────────────────
	{
		const m = solveRoom(TARGET);
		check(`最短 ${m.L} 手（期待 ${SHORTEST}）・押しは1回で石を南の袋へ（${m.pushList.join(' ')}）`,
			m.L === SHORTEST && m.pushes === 1 && m.pushList[0] === `${STONE}→${POCKET}`);
		check(`入って詰む状態が 0（どこからでも東の口へ戻れる＝実測 ${m.noEscape}）`, m.noEscape === 0);
		check(`詰みの状態がある＝押す向きを誤る余地がある（実測 ${m.deadlocks}）`, m.deadlocks > 0);
		check(`対照＝押さないと宝箱の前へ届かない`, solveRoom(TARGET, { noPush: true }).L === null);
		// 正面の押し＝東から西へ1回押した後の盤面（石が宝箱の前）からは届かない
		const jammed = withCell(SHELF, TILE.STONE, withCell(STONE, TILE.FLOOR));
		check(`東から西へ押すと石は宝箱の前に入り、そこからは宝箱へ届かない（詰む）`, solveRoom(jammed).L === null);
		// 対照＝宝箱の前に入った石はもう西へ動かない（宝箱に石は入れない）＝詰みが「石が宝箱を隠す」形にならない
		check(`宝箱の前の石を西へ押しても宝箱には入れない（詰んだ盤面の状態は1つの石配置だけ）`,
			solveRoom(jammed).states > 0 && solveRoom(jammed).deadlocks === solveRoom(jammed).states);
		// 対照＝袋が無ければ（壁なら）解けない＝袋が答えの置き場
		check(`対照＝袋 ${POCKET} を壁にすると解けない`, solveRoom(withCell(POCKET, TILE.WALL)).L === null);
	}

	// ── ④ 層の到達性 ──────────────────────────────────────────────────
	{
		const now = runs();
		const sorted = (s) => [...s].sort();
		const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
		check(`徒歩・錠を全部開けた到達室が書き換え前と同じ（${now.foot.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(now.foot.reachedRooms, base.foot.reachedRooms));
		check(`門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`,
			same(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${now.foot.deadEdges.length}）`, now.foot.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：入口の西の行き止まりを「石室の宝棚」に作り替える（キュー47 第1陣）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => {
		const now = rowStr(row);
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === now ? '=' : '→'}   ${now}`);
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
