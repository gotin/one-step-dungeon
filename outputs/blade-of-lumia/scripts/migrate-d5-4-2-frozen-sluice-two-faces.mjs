// dungeon_5 `4,2`（`3,2` の東の行き止まり）：D4 の写しの部屋を「凍れる床の水門」に作り替える
// （2026-10-06 / PLAN 実行キュー 40 の第2陣 6室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//   `dungeon_4 4,2` と同型＝四角い広間の真ん中に床のルピー（5）が1つあるだけ。口は西だけ（行4-5）。
//
// ■ 語彙＝氷の床（`4,1` で入れた TILE.ICE 'k'・押した石は止まるまで滑る）×水門（潮ゲート '='）
//   水門の下地を氷にした（bgTiles の ICE）。閉じた水門は水＝石は入れない＝**滑る石を止める壁**。
//   開いた水門は氷＝**石はそのまま滑り抜ける**。同じ1枚が、開け閉めで「止め役」と「通り道」の
//   二つの顔を持つ＝この部屋の主題。水門はボタン S（石畳の上＝滑ってきた石はここで止まる）に
//   石か自分が乗っている間だけ開く（`game/conditions.js refreshGates` ②）。
//
// ■ 新しい `4,2`＝凍れる床の水門
//         0         1
//         012345678901
//      0  ############
//      1  #B~kkkk~kkk#   ← 宝箱 B(1,1)（石が2つのボタンに乗ると現れる）
//      2  #.~kkkk~#kk#   ← 柱 #(2,8)
//      3  #.#kkk@Gk*S#   ← 壁 #(3,2)／氷の上のボタン @(3,6)／氷の水門 G(3,7)／石 *(3,9)／水門のボタン S(3,10)
//      4  ..~kkkk~k#o#   ← 柱 #(4,9)／ブレーキ (4,10)＝石畳
//      5  ..~kkkk~kkk#
//      6  #.~kkkk~k*k#   ← 石 *(6,9)
//      7  #.~kkkk~*kk#   ← 石 *(7,8)
//      8  #.~kkkk~kkk#
//      9  ############
//   （'k'＝氷・'~'＝水・'o'＝石畳＝どれも bgTiles。'@'＝氷の上のボタン・'S'＝石畳の上のボタン・
//     'G'＝下地が氷の水門 '='。石の下も氷）
//   ・列7 は水路（幅1）＝人ははしごで渡れるが、石は水門 G を通るしかない。西の縁（列2）は堀。
//   ・解き筋（最短 65 手・押し 10 回・最短解 42 本）：
//     ① ボタン S(3,10) の上に立って石 (3,9) を西へ押す＝足の下で水門が開き、石は水門と @ を滑り抜けて
//        壁 (3,2) の手前 (3,3) で止まる（踏まずに押すと閉じた水門に当たって (3,8) で止まる）。
//     ② 石 (6,9) を東へ寄せ、石 (7,8) を北へ＝柱 (2,8) で (3,8) に止まる。
//     ③ 石 (6,10) を北へ＝ブレーキ (4,10) で止まり、もう一度北へ＝ボタン S に乗る（水門が開いたまま）。
//     ④ 石 (3,8) を西へ＝開いた水門を抜け、(3,3) の石に当たって (3,4) で止まる。
//     ⑤ ボタン S の石を南へどかす＝水門が閉じる。
//     ⑥ (3,3) の石を北へどけ、(3,4) の石を東へ＝@ を越えようとして**閉じた水門に当たって @ の上で止まる**。
//     ⑦ 石をボタン S へ戻す＝2つのボタンに石が乗って宝箱が現れる。
//   ・読みどころ＝**水門を開けて石を西へ渡し、閉めて @ に止める**。開けたまま押すと @ を素通りして
//     西へ抜け、閉めたままだと東から渡せない。最初の1手は「ボタンの上から押す」（モーメンタリの水門を
//     自分の足で開ける）、2度目の渡しは石で押さえて開ける（立つべき所が石の後ろでボタンから離れている）。
//   ・壁 (3,2)＝堀に面した (3,3) の石を「はしごの上から東へ押す」近道を消す（無いと押し 5 回で解ける）。
//   ・行き止まりの謎の部屋∴敵は置かない。床のルピー（5）は撤去し、宝箱はルピー×30（`0,3`・`2,0`・`4,0`・
//     `4,1` と同じ重さ。報酬の見直しはキュー45）。宝箱は石が2つのボタンに乗ると現れる（stonesPlaced）。
//
// ■ 水門が石の下で閉じる（石が水に沈んだ絵になる）形は盤面で起きない
//   水門は下地が氷＝石はその上で止まらず滑り抜ける。止まるのは向こうが塞がっているときだけで、
//   その状態を状態空間で数えて 0 を確かめる（ボタン S の水門は鐘と違い不発の規則が無い）。
//
// ■ 厳格版と緩い版の差（2 手）
//   緩い版（はしごの途中で曲がれる）は 63 手＝水路のはしご (4,7) から北の開いた水門 (3,7) へ折れる近道。
//   実エンジンは「はしごの上から陸へは軸を問わず抜けられる」（game/passable.js）＝実機でも打てる手だが、
//   石の動かし方は同じ（押しの並びが違うだけ・新しい解き筋ではない）∴手数の差として記録し、番人で縛る。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と氷と石畳は bgTiles だけ／口は西だけ／敵・植生・看板が無い／宝箱と出現条件／石・ボタン・水門・links
//   ・ソルバー（厳格・緩い）・入って詰む状態が無い・石が沈む状態が無い・石は堀の内側に入れない
//   ・対照＝はしご無し／石を押さない／石を1つ消す／水門を壁に（閉じたまま）／水門を氷に（開いたまま）／
//     柱・壁・ブレーキを1つずつ消す
//   ・層の到達性（到達室は不変）・dead-edge 0
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-4-2-frozen-sluice-two-faces.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-4-2-frozen-sluice-two-faces.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_5';
const ROOM  = '4,2';

// 書き換え前の盤面（層の到達性の基準はこれで測る＝適用済みの地図に再実行しても同じ）
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'...........#',
	'.....r.....#',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

// ── 狙いの盤面（'k'＝氷・'~'＝水・'o'＝石畳＝どれも bgTiles。'@'＝氷の上のボタン・'S'＝石畳の上のボタン・
//    'G'＝下地が氷の水門）──────────────────────────────────────────────
export const ICE_MAP = [
	'############',
	'#B~kkkk~kkk#',
	'#.~kkkk~#kk#',
	'#.#kkk@Gk*S#',
	'..~kkkk~k#o#',
	'..~kkkk~kkk#',
	'#.~kkkk~k*k#',
	'#.~kkkk~*kk#',
	'#.~kkkk~kkk#',
	'############',
];
// tiles 層＝氷・水・石畳は床、'@' はボタン、'G' は水門
export const TARGET = ICE_MAP.map((row) => row.replace(/[k~o]/g, '.').replaceAll('@', TILE.BUTTON).replaceAll('G', TILE.TIDE_GATE));
const cellsOfMap = (pred, map = ICE_MAP) => map.flatMap((row, r) => [...row].flatMap((ch, c) => (pred(ch) ? [`${r},${c}`] : [])));
export const WATER = cellsOfMap((ch) => ch === '~');
// 氷＝'k' と、氷の上に置いた石・ボタン・水門（下地も氷）
export const ICE = cellsOfMap((ch) => ch === 'k' || ch === '*' || ch === '@' || ch === 'G');
// 石畳＝ブレーキと、水門のボタンの下地（滑ってきた石はここで止まる）
export const PAVED = cellsOfMap((ch) => ch === 'o' || ch === 'S');
export const EXITS = ['4,0', '5,0'];                // 口は西だけ＝書き換え前と同じ
export const CHEST = '1,1';
export const ICE_BUTTON = '3,6';                     // 氷の上のボタン＝閉じた水門に当たって止まる
export const GATE = '3,7';                           // 下地が氷の水門
export const GATE_BUTTON = '3,10';                   // 水門のボタン（石畳）
export const STONES = ['3,9', '6,9', '7,8'];
export const PILLARS = ['2,8', '4,9'];               // 石 (7,8) を (3,8) に止める柱／石を (3,9)・(4,10) の列へ導く柱
export const MOAT_WALL = '3,2';                      // 堀に面した (3,3) の石を、はしごの上から押させない壁
export const BRAKE = '4,10';
export const LINKS = [{ switchId: GATE_BUTTON, gateId: GATE }];
export const SHOW = { [CHEST]: { trigger: 'stonesPlaced' } };
const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } };
export const SHORTEST = 65;                          // 最短手数（厳格）
export const SHORTEST_LOOSE = 63;                    // 緩い版（はしごから開いた水門へ折れる近道・押しの中身は同じ）
export const PUSHES = 10;

const P = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// ソルバーの入力。宝箱は解くまで現れない＝床として渡す（堀の内側＝石は届かない）。
export function solverInput(map = ICE_MAP) {
	const tiles = map.map((row) => [...row].map((ch) => (
		ch === 'k' || ch === '~' || ch === 'o' || ch === TILE.CHEST ? '.' : ch === '@' ? TILE.BUTTON : ch === 'G' ? TILE.TIDE_GATE : ch)));
	const bg = map.map((row) => [...row].map((ch) => (
		ch === '~' ? '~' : ch === 'k' || ch === '*' || ch === '@' || ch === 'G' ? TILE.ICE : 'g')));
	const gates = cellsOfMap((ch) => ch === 'G', map);
	const switches = cellsOfMap((ch) => ch === 'S', map);
	return { tiles, bg, linkSpec: switches.map((s) => [s, gates]) };
}

// strict＝画面で読める手だけ（はしごの途中で押さない・曲がらない／石を橋脚にしない）
export function makeRoomSolver(map = ICE_MAP, { strict = true, ...opts } = {}) {
	const { tiles, bg, linkSpec } = solverInput(map);
	const S0 = makeSolver(tiles, bg, linkSpec, {}, new Set(), { hasLadder: true, ...opts });
	const isW = (r, c) => bg[r]?.[c] === '~';
	const land = (r, c) => tiles[r]?.[c] !== undefined && !isW(r, c) && !HARD_BLOCKED.has(tiles[r][c]);
	const gates = new Set(linkSpec.flatMap(([, gs]) => gs));
	const openOf = (pos, stones) => {
		const open = new Set();
		for (const [sw, gs] of linkSpec) if (sw === pos || stones.includes(sw)) gs.forEach((g) => open.add(g));
		return open;
	};
	// 閉じた水門の上に石か自分がいる（＝水に沈んだ絵）
	const sunk = (st) => {
		const [pos, ss] = st.split('|');
		const stones = ss ? ss.split(';') : [];
		const open = openOf(pos, stones);
		return [...gates].some((g) => !open.has(g) && (stones.includes(g) || g === pos));
	};
	const nextStates = (st) => {
		const out = S0.nextStates(st);
		if (!strict) return out;
		const [pos, ss] = st.split('|');
		const [pr, pc] = P(pos);
		return out.filter((nx) => {
			const [npos, nss] = nx.split('|');
			const [nr, nc] = P(npos);
			const moved = nr !== pr || nc !== pc;
			if (nss !== ss && isW(pr, pc)) return false;                              // はしごの途中で押さない
			if (isW(pr, pc) && moved) {                                               // はしごの途中で曲がらない
				const ok = nr !== pr ? land(pr - 1, pc) && land(pr + 1, pc) : land(pr, pc - 1) && land(pr, pc + 1);
				if (!ok) return false;
			}
			if (isW(nr, nc) && moved) {                                               // 石を橋脚にしない
				const ns = nss ? nss.split(';') : [];
				const banks = nr !== pr ? [[nr - 1, nc], [nr + 1, nc]] : [[nr, nc - 1], [nr, nc + 1]];
				if (banks.some(([r, c]) => ns.includes(`${r},${c}`))) return false;
			}
			return true;
		});
	};
	return { ...S0, nextStates, tiles, bg, sunk };
}

// goal＝全ボタンの上に石。戻り値は measureMetrics の結果＋最短解の手順・押した回数・石が入ったセル・沈んだ状態の数。
export function solveRoom(map = ICE_MAP, opts = {}) {
	const S = makeRoomSolver(map, opts);
	const buttons = cellsOfMap((ch) => ch === '@' || ch === 'S', map);
	const goalTest = (st) => { const ss = st.split('|')[1].split(';'); return buttons.length > 0 && buttons.every((b) => ss.includes(b)); };
	const starts = EXITS.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	const m = measureMetrics(S, starts, goalTest, () => 0,
		{ guardMax: 3_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
	const par = new Map(starts.map((s) => [s, null]));
	const q = [...starts];
	let goal = null, sunk = 0;
	const stoneCells = new Set();
	for (let h = 0; h < q.length; h++) {
		const st = q[h];
		st.split('|')[1].split(';').filter(Boolean).forEach((k) => stoneCells.add(k));
		if (S.sunk(st)) sunk++;
		if (!goal && goalTest(st)) goal = st;
		for (const nx of S.nextStates(st)) {
			if (par.has(nx)) continue;
			par.set(nx, st);
			q.push(nx);
		}
	}
	const path = [];
	for (let s = goal; s; s = par.get(s)) path.unshift(s);
	const pushList = [];
	for (let i = 1; i < path.length; i++) {
		const as = path[i - 1].split('|')[1], bs = path[i].split('|')[1];
		if (as === bs) continue;
		const A = as.split(';'), B = bs.split(';');
		const j = A.findIndex((x, k) => x !== B[k]);
		pushList.push(`${A[j]}→${B[j]}`);
	}
	return { ...m, path, pushes: pushList.length, pushList, stoneCells, sunk };
}
// 盤面の1セルを差し替えた写し（対照実験用）
export const withCell = (k, ch, base = ICE_MAP) => {
	const [r, c] = P(k);
	return base.map((row, i) => (i === r ? row.slice(0, c) + ch + row.slice(c + 1) : row));
};

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の着地セル
	const OPEN = new Set(['T', '!', 'D', '=']);
	const runs = () => ({
		ladder: bfsLayer(stages, START, { withLadder: true, openTiles: OPEN }),
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: true, openTiles: null }),
	});
	// 基準は書き換え前の盤面で測る＝適用済みの地図に再実行しても同じ（冪等）。
	const before = room.tiles.map(rowStr);
	const saved = { tiles: room.tiles, bgTiles: room.bgTiles };
	room.tiles = ORIGINAL.map((row) => row.split(''));
	room.bgTiles = {};
	const base = runs();
	room.tiles = saved.tiles;
	room.bgTiles = saved.bgTiles;

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => row.split(''));   // [[field-tiles-are-char-arrays]]
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	const wantBg = Object.fromEntries([...WATER.map((k) => [k, TILE.WATER]), ...ICE.map((k) => [k, TILE.ICE]), ...PAVED.map((k) => [k, TILE.STONE_FLOOR])]
		.sort(([a], [b]) => { const [ar, ac] = P(a), [br, bc] = P(b); return ar - br || ac - bc; }));
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(wantBg)) {
		room.bgTiles = wantBg;
		log.push(`  ${ROOM}: bgTiles に水 ${WATER.length} 枚・氷 ${ICE.length} 枚・石畳 ${PAVED.length} 枚`);
	}
	if (JSON.stringify(room.links ?? []) !== JSON.stringify(LINKS)) {
		room.links = LINKS.map((l) => ({ ...l }));
		log.push(`  ${ROOM}: links＝ボタン ${GATE_BUTTON} → 水門 ${GATE}`);
	}
	if (JSON.stringify(room.showConditions ?? {}) !== JSON.stringify(SHOW)) {
		room.showConditions = JSON.parse(JSON.stringify(SHOW));
		log.push(`  ${ROOM}: 宝箱 ${CHEST} は石が2つのボタンに乗ると現れる（stonesPlaced）`);
	}
	if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
		room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
		log.push(`  ${ROOM}: 宝箱 ${CHEST}＝ルピー×30`);
	}
	if (Object.keys(room.floorItems ?? {}).length) {
		room.floorItems = {};
		log.push(`  ${ROOM}: 床のルピーを撤去した`);
	}
	room.signData ??= {};
	room.npcData ??= {};
	room.enemyDirs ??= {};
	room.breakableWalls ??= {};

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const t = room.tiles.map((r) => [...r]);
	const at = (k) => { const [r, c] = P(k); return t[r]?.[c]; };
	const cellsOf = (pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c], r, c)) out.push(`${r},${c}`);
		return out;
	};
	const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
	const bgAt = (k) => room.bgTiles[k];

	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	check(`水 ${WATER.length} 枚・氷 ${ICE.length} 枚・石畳 ${PAVED.length} 枚は bgTiles だけ（tiles 層に '~'/'k' が無い・水の下は床）`,
		Object.keys(room.bgTiles).length === WATER.length + ICE.length + PAVED.length
		&& WATER.every((k) => bgAt(k) === TILE.WATER && at(k) === TILE.FLOOR)
		&& ICE.every((k) => bgAt(k) === TILE.ICE)
		&& PAVED.every((k) => bgAt(k) === TILE.STONE_FLOOR)
		&& cellsOf((ch) => ch === TILE.WATER || ch === TILE.ICE).length === 0);
	check(`水門 ${GATE} と氷の上のボタン ${ICE_BUTTON}・石 ${STONES.join(' ')} の下は氷`, [GATE, ICE_BUTTON, ...STONES].every((k) => bgAt(k) === TILE.ICE));
	check(`水門のボタン ${GATE_BUTTON}・ブレーキ ${BRAKE} の下は石畳（滑ってきた石が止まる）`,
		at(GATE_BUTTON) === TILE.BUTTON && at(BRAKE) === TILE.FLOOR && [GATE_BUTTON, BRAKE].every((k) => bgAt(k) === TILE.STONE_FLOOR));
	check(`西の堀は列2（幅1）・水路は列7（幅1）＝水は全部この2列`,
		WATER.every((k) => [2, 7].includes(P(k)[1])) && WATER.filter((k) => P(k)[1] === 7).length === 7);
	check(`水路を石が越えられる所は水門 ${GATE} だけ（列7 の陸は水門の1枚）`,
		[...Array(8)].map((_, i) => `${i + 1},7`).filter((k) => bgAt(k) !== TILE.WATER).join() === GATE && at(GATE) === TILE.TIDE_GATE);
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k)) && bgAt(k) !== TILE.WATER).sort();
		check(`画面の縁で開いているのは西の口だけ（実測 ${open.join(' ')}）`, same(open, EXITS));
	}
	check(`敵が居ない（謎解きの部屋）`, cellsOf((ch) => !!ENEMY_META[ch]).length === 0);
	check(`植生・看板・色・かがり火・壊せる壁・門・鐘が無い`,
		cellsOf((ch) => [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH_RED, TILE.SWITCH_BLUE, TILE.SWITCH,
			TILE.GATE_RED, TILE.GATE_BLUE, TILE.TORCH, TILE.BREAKABLE_WALL, TILE.GATE].includes(ch)).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`宝箱 B は ${CHEST} の1枚・中身＝ルピー×30・石が2つのボタンに乗ると現れる`,
		same(cellsOf((ch) => ch === TILE.CHEST), [CHEST]) && JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS)
		&& JSON.stringify(room.showConditions) === JSON.stringify(SHOW));
	check(`石は ${STONES.join(' ')}・ボタンは ${ICE_BUTTON} と ${GATE_BUTTON}・水門は ${GATE} の1枚・links はボタン→水門の1本`,
		same(cellsOf((ch) => ch === TILE.STONE), STONES) && same(cellsOf((ch) => ch === TILE.BUTTON), [ICE_BUTTON, GATE_BUTTON])
		&& same(cellsOf((ch) => ch === TILE.TIDE_GATE), [GATE]) && JSON.stringify(room.links) === JSON.stringify(LINKS));
	check(`柱 ${PILLARS.join(' ')}・堀の壁 ${MOAT_WALL} が壁`, [...PILLARS, MOAT_WALL].every((k) => at(k) === TILE.WALL));
	check(`floorItems・breakableWalls・mapEnters が空`,
		Object.keys(room.floorItems).length === 0 && Object.keys(room.breakableWalls).length === 0
		&& Object.keys(room.mapEnters ?? {}).length === 0);
	{
		// 氷の上のボタン @ は、閉じた水門が東にある時だけ止まる＝東へ押した石は水門が開いていれば素通りする
		const [br, bc] = P(ICE_BUTTON);
		const slideEnd = (r, c, dr, dc, gateOpen) => {
			const enter = (k) => !HARD_BLOCKED.has(at(k)) && bgAt(k) !== TILE.WATER && (at(k) !== TILE.TIDE_GATE || gateOpen);
			while (bgAt(`${r},${c}`) === TILE.ICE && enter(`${r + dr},${c + dc}`)) { r += dr; c += dc; }
			return `${r},${c}`;
		};
		check(`東へ押した石は、水門が閉じていれば @ の上で止まり、開いていれば素通りする（実測 ${slideEnd(br, bc, 0, 1, false)}／${slideEnd(br, bc, 0, 1, true)}）`,
			slideEnd(br, bc, 0, 1, false) === ICE_BUTTON && slideEnd(br, bc, 0, 1, true) !== ICE_BUTTON);
	}

	// ── ② ソルバー（状態空間）＝石が2つのボタンに乗る・詰まない・沈まない ─────
	{
		const m = solveRoom();
		check(`厳格版で石が2つのボタンに乗る（L=${m.L}＝想定 ${SHORTEST}・押し ${m.pushes}・最短解 ${m.solCount} 本）`,
			m.L === SHORTEST && m.pushes === PUSHES);
		check(`最初の押しはボタン S の上から西へ＝石が水門を抜けて (3,3) まで滑る（${m.pushList[0]}）`, m.pushList[0] === '3,9→3,3');
		check(`@ に乗せる押しは東へ＝閉じた水門に当たって止まる（${m.pushList.at(-2)}）`, m.pushList.at(-2) === `3,4→${ICE_BUTTON}`);
		check(`入って詰む状態が無い（厳格 noEscape=${m.noEscape}）`, m.noEscape === 0);
		check(`閉じた水門の上に石か自分がいる状態が無い（厳格 ${m.sunk}）`, m.sunk === 0);
		check(`石は堀の内側（列0-1）に入れない（石が入ったセルの最小の列＝${Math.min(...[...m.stoneCells].map((k) => P(k)[1]))}）`,
			[...m.stoneCells].every((k) => P(k)[1] >= 3));
		const v = solveRoom(ICE_MAP, { strict: false });
		check(`緩い版＝${v.L} 手（想定 ${SHORTEST_LOOSE}＝はしごから開いた水門へ折れる近道）・詰まない（noEscape=${v.noEscape}）・沈まない（${v.sunk}）`,
			v.L === SHORTEST_LOOSE && v.noEscape === 0 && v.sunk === 0);
		check(`対照：はしご無しでは届かない（堀と水路を渡れない）`, solveRoom(ICE_MAP, { hasLadder: false, strict: false }).L === null);
		check(`対照：石を押さないと届かない`, solveRoom(ICE_MAP, { noPush: true, strict: false }).L === null);
		for (const k of STONES) {
			check(`対照：石 ${k} を消すと届かない（緩い版でも）`, solveRoom(withCell(k, 'k'), { strict: false }).L === null);
		}
		check(`対照：水門を壁にする（閉じたまま）と届かない（緩い版でも）`, solveRoom(withCell(GATE, '#'), { strict: false }).L === null);
		check(`対照：水門を氷にする（開いたまま）と届かない（緩い版でも）`, solveRoom(withCell(GATE, 'k'), { strict: false }).L === null);
		check(`対照：ブレーキ ${BRAKE} を氷にすると届かない`, solveRoom(withCell(BRAKE, 'k')).L === null);
		check(`対照：柱 (2,8) を氷にすると届かない`, solveRoom(withCell('2,8', 'k')).L === null);
		{
			const w = solveRoom(withCell('4,9', 'k'));
			check(`対照：柱 (4,9) を氷にすると短くなる（L=${w.L}＜${SHORTEST}）`, w.L !== null && w.L < SHORTEST);
		}
		{
			const w = solveRoom(withCell(MOAT_WALL, '~'), { strict: false });
			check(`対照：堀の壁 ${MOAT_WALL} を水にすると、緩い版で押し 5 回の近道が出る（押し ${w.pushes}）`, w.pushes <= 5);
		}
	}

	// ── ③ 層の到達性 ─────────────────────────────────────────────────
	{
		const now = runs();
		for (const kind of ['ladder', 'closed', 'foot']) {
			check(`層の到達室（${kind}）が書き換え前と同じ（${now[kind].reachedRooms.size} 室）`,
				same(now[kind].reachedRooms, base[kind].reachedRooms));
		}
		const fieldOnFoot = [...now.foot.reachedCells].filter((ck) => ck.startsWith(`${ROOM}:`) && P(ck.split(':')[1])[1] >= 3);
		const fieldLadder = [...now.ladder.reachedCells].filter((ck) => ck.startsWith(`${ROOM}:`) && P(ck.split(':')[1])[1] >= 3);
		check(`はしご無しでは堀の向こうに届かない（徒歩 ${fieldOnFoot.length} マス／はしご ${fieldLadder.length} マス）`,
			fieldOnFoot.length === 0 && fieldLadder.length > 0);
		check(`レイヤーの dead-edge が 0（実測 ${now.closed.deadEdges.length}）`, now.closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：東の行き止まりを「凍れる床の水門」に作り替える（キュー40 第2陣）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}・水と氷と石畳は bgTiles）`);
	ICE_MAP.forEach((now, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === TARGET[i] ? '=' : '→'}   ${now}`);
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
