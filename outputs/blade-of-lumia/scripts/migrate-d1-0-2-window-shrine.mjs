// dungeon_1 `0,2`（入口側 `1,2` とボス前 `0,1` の間の脇道）：宝箱が1つ置いてあるだけの四角い部屋を
// 「門の窓の祠」に作り替える（2026-10-12 / PLAN 実行キュー 47 の第1陣 2室目・設計は Opus）
//
// ■ 何が薄かったか（キュー47 の着手時の実測）
//      0 #####..#####     ← 北の口（ボス前 `0,1`）
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 #...........     ← 東の口（`1,2`＝北への道しるべの部屋）
//      5 #...........
//      6 #..........#
//      7 #........B.#     ← 宝箱（ルピー×50）
//      8 #..........#
//      9 ############
//   四角い広間の隅に宝箱が1つ＝どちらから入っても拾って抜けるだけ（キュー21 の F6）。
//   `1,2 → 1,1 → 0,1` と `1,2 → 0,2 → 0,1` は同じ長さ＝この部屋は近道でもない並行の道。
//
// ■ 新しい `0,2`＝門の窓の祠（D1 で「別の部屋から回り込む」を覚える）
//      0 #####..#####     ← 北の口（ボス前 `0,1`）
//      1 #.......####
//      2 #.......####
//      3 #..##...#i.#     ← (3,9) 門の立札
//      4 #..#B...T...     ← 祠の宝箱 (4,4)・門 (4,8)・東の口
//      5 #..#Y...#...     ← 祠のスイッチ (5,4)
//      6 #..##...#..#
//      7 #.......####
//      8 #.......####
//      9 ############
//   ・部屋は門 `(4,8)` で2つに分かれている。東の口から入ると小さな前室（2×4）で、門の向こうに
//     祠（東に口を開けた壁のくぼみ）の宝箱とスイッチが真正面に見える。剣はスイッチに届かない。
//   ・答え＝この部屋の中には無い。`1,2` へ戻って北の `1,1`（地中蟲・木の盾）→ 西の `0,1`（ボス前）
//     → 南へ下りると祠の側に出る＝宝箱を開け、スイッチを叩くと門が開いて東の前室とつながる。
//     `0,3`（石室の宝棚）が「部屋の中で石の裏へ回り込む」なら、ここは「ダンジョンの中で部屋の裏へ回り込む」。
//   ・北から先に来た人は、祠で宝箱を取ってスイッチで門を開けるだけ（どちらの順でも詰まない）。
//   ・立札 `(3,9)`（木の看板＝名前に「刻み」「碑」を使わない＝tests/warp-stone.spec.js ①）＝
//     「この 門は 内から 開く。」の1行だけ＝向こう側へ行けばよいことだけを言い、道は言わない。
//   ・門とスイッチは link（Y→T）。スイッチ 'Y' の状態はセーブに入る（switchToggles）＝一度開ければ開いたまま。
//   ・弓（D3 以降）で東から撃っても、スイッチは祠の壁の陰（列4・行5＝東は壁 (5,8)）＝窓越しには当たらない。
//   ・敵なし（ボス前の静かな脇道のまま）。宝箱＝ルピー×50（据え置き・キュー45 の割り当て表の外）。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ
//     （門を閉じたままでも、東の前室は `1,2` から・祠の側は `0,1` から届く）。
//
// 使い方:
//   node scripts/migrate-d1-0-2-window-shrine.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d1-0-2-window-shrine.mjs         # 書き込み

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
const ROOM  = '0,2';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...........',
	'#...........',
	'#..........#',
	'#........B.#',
	'#..........#',
	'############',
];
const ORIGINAL_CHESTS = { '7,9': { type: 'rupee', value: 50, name: 'ルピー×50' } };

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#.......####',
	'#.......####',
	'#..##...#i.#',
	'#..#B...T...',
	'#..#Y...#...',
	'#..##...#..#',
	'#.......####',
	'#.......####',
	'############',
];
export const EXITS = { north: ['0,5', '0,6'], east: ['4,11', '5,11'] };
export const CHEST  = '4,4';         // 祠の宝箱
export const SWITCH = '5,4';         // 祠のスイッチ（剣で叩く）
export const GATE   = '4,8';         // 前室と祠の側を分ける門
export const WINDOW_STAND = '4,9';   // 東の前室で門の正面に立つマス
export const SIGN = '3,9';
export const SIGN_DATA = {
	name: '門の 立札',
	lines: ['この 門は 内から 開く。'],
};
export const LINKS = [{ switchId: SWITCH, gateId: GATE }];
export const CHEST_CONTENT = { type: 'rupee', value: 50, name: 'ルピー×50' };   // 据え置き（位置だけ動かす）
export const NORTH_TO_CHEST = 5;     // 北の口から宝箱を踏むまで
export const NORTH_TO_EAST = 13;     // 北の口から（スイッチを叩いて門を開け）東の口まで

// ── 歩行の到達（門を閉じたまま。宝箱・看板・スイッチは壁扱い） ────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
const WALLISH = new Set([TILE.WALL, TILE.GATE, TILE.CHEST, TILE.SIGN, TILE.SWITCH]);
export function reach(t, from) {
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

// ── ソルバー（実エンジンの Y→T の写し）。from の口から goal のマスへ立つまで ───
// noTools＝D1 の初回（剣だけ）。noTools:false は弓・爆弾・ブーメランを持って戻ってきた後。
export function solveRoom({ from, goal, noTools = true, board = TARGET }) {
	const tiles = board.map((row) => [...row]);
	const bg = board.map((row) => [...row].map(() => TILE.FLOOR));
	const links = LINKS.map((l) => [l.switchId, [l.gateId]]);
	const S = makeSolver(tiles, bg, links, {}, new Set(), { hasLadder: false, noTools });
	const starts = from.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	const goals = Array.isArray(goal) ? goal : [goal];
	return measureMetrics(S, starts, (st) => goals.includes(st.split('|')[0]), () => 0, {
		guardMax: 1_000_000, greedyFn: () => false,
		escapeTest: (st) => from.includes(st.split('|')[0]),
	});
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

	// 事前条件＝盤面の外の中身が無い（宝箱・立札・link は、書き換え前のものか、このスクリプトが書いた物なら受ける＝冪等）。
	const extras = ['mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects', 'enemyDirs', 'showConditions', 'bgTiles'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	{
		const cur = JSON.stringify(room.chestContents ?? {});
		if (cur !== JSON.stringify(ORIGINAL_CHESTS) && cur !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) die(`${ROOM} の chestContents が想定外の中身`);
		const sd = room.signData ?? {};
		if (Object.keys(sd).length && JSON.stringify(sd) !== JSON.stringify({ [SIGN]: SIGN_DATA })) die(`${ROOM} の signData が想定外の中身`);
		const ln = room.links ?? [];
		if (ln.length && JSON.stringify(ln) !== JSON.stringify(LINKS)) die(`${ROOM} の links が想定外の中身`);
	}
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
	const applied = { tiles: room.tiles, links: room.links };
	room.tiles = ORIGINAL.map((row) => row.split(''));
	room.links = [];
	const base = runs();
	room.tiles = applied.tiles;
	room.links = applied.links;

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え（tiles は文字の配列の配列＝[[field-tiles-are-char-arrays]]） ──
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => [...row]);
		log.push(`  ${ROOM}: 盤面を差し替えた（門で前室と祠の側に分けた）`);
	}
	if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) {
		room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
		log.push(`  ${ROOM}: 宝箱 7,9 → ${CHEST}（${CHEST_CONTENT.name}・中身は据え置き）`);
	}
	if (JSON.stringify(room.signData ?? {}) !== JSON.stringify({ [SIGN]: SIGN_DATA })) {
		room.signData = { [SIGN]: { ...SIGN_DATA, lines: [...SIGN_DATA.lines] } };
		log.push(`  ${ROOM}: 立札 ${SIGN}「${SIGN_DATA.name}」`);
	}
	if (JSON.stringify(room.links ?? []) !== JSON.stringify(LINKS)) {
		room.links = LINKS.map((l) => ({ ...l }));
		log.push(`  ${ROOM}: link スイッチ ${SWITCH} → 門 ${GATE}`);
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
		check(`画面の縁で開いているのは北と東の口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want) && JSON.stringify(was) === JSON.stringify(want));
	}
	check(`敵が居ない`, cellsOf((ch) => !!ENEMY_META[ch]).length === 0);
	check(`宝箱は ${CHEST}・スイッチは ${SWITCH}・門は ${GATE} の1つずつ`,
		JSON.stringify(cellsOf((ch) => ch === TILE.CHEST)) === JSON.stringify([CHEST])
		&& JSON.stringify(cellsOf((ch) => ch === TILE.SWITCH)) === JSON.stringify([SWITCH])
		&& JSON.stringify(cellsOf((ch) => ch === TILE.GATE)) === JSON.stringify([GATE]));
	check(`宝箱 ${CHEST} は ${CHEST_CONTENT.name}・条件なし（初めから見えている）`,
		JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST]: CHEST_CONTENT })
		&& Object.keys(room.showConditions ?? {}).length === 0);
	check(`link はスイッチ ${SWITCH} → 門 ${GATE} の1本だけ`, JSON.stringify(room.links) === JSON.stringify(LINKS));
	check(`立札 ${SIGN}「${SIGN_DATA.name}」が看板タイルに載っている`,
		at(SIGN) === TILE.SIGN && JSON.stringify(room.signData) === JSON.stringify({ [SIGN]: SIGN_DATA }));
	check(`石・ボタン・鍵・扉・床の落とし物が無い`,
		cellsOf((ch) => [TILE.STONE, TILE.BUTTON, TILE.KEY, TILE.DOOR, TILE.TORCH, TILE.PIT,
			TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE, TILE.ITEM_HEAL_POTION].includes(ch)).length === 0);

	// ── ② 門で分かれた2つの側 ────────────────────────────────────────
	{
		const eastSide = reach(t, EXITS.east[0]);
		const northSide = reach(t, EXITS.north[0]);
		check(`門を閉じたまま、東の口と北の口は歩いてつながらない`,
			!EXITS.north.some((k) => eastSide.has(k)) && !EXITS.east.some((k) => northSide.has(k)));
		check(`東の前室は ${eastSide.size} マス（2×4−立札＋口の2マス＝9・小部屋）`, eastSide.size === 9);
		check(`東の前室から門の正面 ${WINDOW_STAND} に立てる`, eastSide.has(WINDOW_STAND));
		const [sr, sc] = P(SWITCH), [cr, cc] = P(CHEST), [gr, gc] = P(GATE);
		const nbr = (r, c) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`);
		check(`スイッチと宝箱の隣（立ち位置）は北の側にだけある`,
			nbr(sr, sc).some((k) => northSide.has(k)) && !nbr(sr, sc).some((k) => eastSide.has(k))
			&& nbr(cr, cc).some((k) => northSide.has(k)) && !nbr(cr, cc).some((k) => eastSide.has(k)));
		check(`門の東は前室・西は北の側`, eastSide.has(`${gr},${gc + 1}`) && northSide.has(`${gr},${gc - 1}`));
		check(`祠（宝箱とスイッチ）は東に口を開けたくぼみ＝門と同じ行に宝箱が真正面`,
			cr === gr && [[cr - 1, cc], [cr, cc - 1], [sr, sc - 1], [sr + 1, sc]].every(([r, c]) => at(`${r},${c}`) === TILE.WALL));
	}

	// ── ③ ソルバー ──────────────────────────────────────────────────
	{
		const eastToChest = solveRoom({ from: EXITS.east, goal: CHEST });
		check(`東の口から（剣だけ）宝箱へは届かない＝門の向こう`, eastToChest.L === null && eastToChest.noEscape === 0);
		const eastToNorth = solveRoom({ from: EXITS.east, goal: EXITS.north });
		check(`東の口から（剣だけ）北の口へも抜けられない`, eastToNorth.L === null);
		const eastBow = solveRoom({ from: EXITS.east, goal: CHEST, noTools: false });
		check(`道具（弓・爆弾・ブーメラン）を持って戻っても、東からは開かない＝スイッチは窓越しに当たらない`, eastBow.L === null);
		const northToChest = solveRoom({ from: EXITS.north, goal: CHEST });
		check(`北の口から宝箱まで ${northToChest.L} 手（期待 ${NORTH_TO_CHEST}）`, northToChest.L === NORTH_TO_CHEST && northToChest.noEscape === 0);
		const northToEast = solveRoom({ from: EXITS.north, goal: EXITS.east });
		check(`北の口から門を開けて東の口まで ${northToEast.L} 手（期待 ${NORTH_TO_EAST}）`, northToEast.L === NORTH_TO_EAST && northToEast.noEscape === 0);
		// 対照＝スイッチを床にすると門は開かない＝北から東へ抜けられない
		const noSwitch = TARGET.map((row, i) => (i === P(SWITCH)[0] ? row.slice(0, P(SWITCH)[1]) + '.' + row.slice(P(SWITCH)[1] + 1) : row));
		check(`対照＝スイッチが無ければ北から東へ抜けられない（門は link でしか開かない）`,
			solveRoom({ from: EXITS.north, goal: EXITS.east, board: noSwitch }).L === null);
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
	console.log(`# ${LAYER} ${ROOM}：脇道の四角い部屋を「門の窓の祠」に作り替える（キュー47 第1陣 2室目）`);
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
