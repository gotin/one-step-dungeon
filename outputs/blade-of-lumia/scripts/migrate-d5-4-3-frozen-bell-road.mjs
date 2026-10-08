// dungeon_5 `4,3`（`3,3` の東の行き止まり）：D4 の写しの部屋を「凍れる湖の鐘の道」に作り替える
// （2026-10-08 / PLAN 実行キュー 40 の第2陣 7室目＝第2陣の最後・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//   `dungeon_4 4,3` と同型＝四角い広間の真ん中に床のルピー（5）が1つあるだけ。口は西だけ（行4-5）。
//
// ■ 語彙＝氷の床（`4,1`）×水門の二つの顔（`4,2`）×鐘（`2,0`・`4,0`）＝D5 の行き止まりの総仕上げ
//   湖を東西に横切る「石の道」（行7）に、氷の上のボタンと水門を交互に並べた：
//     @0(7,6) → 水門 G1(7,7) → @1(7,8) → 水門 G2(7,9) → @2(7,10)
//   水門の下地は氷＝開いていれば石は滑り抜け、閉じていれば石はその手前のボタンで止まる（`4,2` と同じ規則）。
//   水門を開け閉めするのはボタンではなく湖の岩の上の鐘＝上の鐘 (3,9) が手前の G1、下の鐘 (4,9) が奥の G2。
//   石を東へ滑らせたとき「どのボタンで止まるか」を、鐘で選ぶ部屋。
//
// ■ 新しい `4,3`＝凍れる湖の鐘の道
//         0         1
//         012345678901
//      0  ############
//      1  #B~kkkk~~~~#   ← 宝箱 B(1,1)（石が3つのボタンに乗ると現れる）
//      2  #.~kk*k~~~~#   ← 石 *(2,5)
//      3  #.~kkkk~~Y~#   ← 上の鐘 Y(3,9)→手前の水門 G1(7,7)
//      4  ..~kkkk~~Y~#   ← 下の鐘 Y(4,9)→奥の水門 G2(7,9)
//      5  ..~k#*k~~~~#   ← 柱 #(5,4)／石 *(5,5)
//      6  #.~k*o#~~~~#   ← 石 *(6,4)／ブレーキ (6,5)＝石畳／門柱 #(6,6)
//      7  #.~kkk@G@G@#   ← 石の道＝@0(7,6) G1(7,7) @1(7,8) G2(7,9) @2(7,10)
//      8  #.~kk##~~~~#   ← 柱 #(8,5)／門柱 #(8,6)
//      9  ############
//   （'k'＝氷・'~'＝水・'o'＝石畳＝どれも bgTiles。'@'＝氷の上のボタン・'G'＝下地が氷の水門 '='・
//     'Y'＝鐘（湖の岩の上・bg なし）。石の下も氷）
//   ・西の縁（列2）は堀＝人ははしごで渡り、石は渡れない。湖（列7-10）は石の道のほかは全部水。
//   ・鐘は四方が水＝石が乗る道が無い（実エンジンは石を鐘のマスへ押せる＝`4,0` の教訓）。
//     矢は水を飛び越える＝庭の行3・行4 から東へ射る（入口の前からも届く）。
//   ・@0 の上下は門柱＝石は @0 へ西からしか入れない（無いと縦から @0 に止められて G1 が飾りになる）。
//   ・解き筋（最短 50 手・押し 9 回・射る 4 回）：
//     ① 鐘を2つとも鳴らす（水門が両方開く）→ 石 (5,5) を南・南へ道の西端 (7,5) へ → 東へ＝奥の @2 まで滑る。
//     ② 下の鐘を鳴らし直す（奥の水門 G2 が閉じる）→ 2つ目の石を道へ → 東へ＝G2 に当たって @1 で止まる。
//     ③ 上の鐘を鳴らし直す（手前の水門 G1 も閉じる）→ 3つ目の石を道へ → 東へ＝G1 に当たって @0 で止まる。
//   ・読みどころ＝**奥から順に、水門を閉じながら止める**。手前のボタンから埋めると後の石が通れない
//     （@0 の石が道を塞ぐ）。どの鐘がどの水門かは、鳴らして水門が干上がるのを見て読む。
//   ・行き止まりの謎の部屋∴敵は置かない。床のルピー（5）は撤去し、宝箱はルピー×30（`0,3`・`2,0`・`4,0`・
//     `4,1`・`4,2` と同じ重さ。報酬の見直しはキュー45）。宝箱は石が3つのボタンに乗ると現れる（stonesPlaced）。
//
// ■ 厳格版と緩い版の差（2 手）
//   緩い版（はしごの上から石を押せる）は 48 手＝堀のはしご (6,2) から石 (6,3) を東へ押す近道。
//   実エンジンでも打てる手だが、石を運ぶ並びは同じ（新しい解き筋ではない）∴手数の差として記録する。
//
// ■ 飾りの柱
//   門柱 (8,6) は外しても解き筋が変わらない（測定済み）。@0 を上下から挟む形を揃えるために残す。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と氷と石畳は bgTiles だけ／口は西だけ／敵・植生・看板が無い／宝箱と出現条件／石・ボタン・水門・鐘・links
//   ・ソルバー（厳格・緩い）・入って詰む状態が無い・閉じた水門の上に石か自分がいる状態が無い
//   ・対照＝はしご無し／押さない／道具なし／石を1つずつ消す／水門を1枚ずつ氷に（開いたまま）・壁に（閉じたまま）／
//     ブレーキ・柱を1つずつ氷に
//   ・層の到達性（到達室は不変）・dead-edge 0
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-4-3-frozen-bell-road.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-4-3-frozen-bell-road.mjs         # 書き込み

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
const ROOM  = '4,3';

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

// ── 狙いの盤面（'k'＝氷・'~'＝水・'o'＝石畳＝どれも bgTiles。'@'＝氷の上のボタン・'G'＝下地が氷の水門）──
export const ICE_MAP = [
	'############',
	'#B~kkkk~~~~#',
	'#.~kk*k~~~~#',
	'#.~kkkk~~Y~#',
	'..~kkkk~~Y~#',
	'..~k#*k~~~~#',
	'#.~k*o#~~~~#',
	'#.~kkk@G@G@#',
	'#.~kk##~~~~#',
	'############',
];
// tiles 層＝氷・水・石畳は床、'@' はボタン、'G' は水門
export const TARGET = ICE_MAP.map((row) => row.replace(/[k~o]/g, '.').replaceAll('@', TILE.BUTTON).replaceAll('G', TILE.TIDE_GATE));
const cellsOfMap = (pred, map = ICE_MAP) => map.flatMap((row, r) => [...row].flatMap((ch, c) => (pred(ch) ? [`${r},${c}`] : [])));
export const WATER = cellsOfMap((ch) => ch === '~');
// 氷＝'k' と、氷の上に置いた石・ボタン・水門（下地も氷）
export const ICE = cellsOfMap((ch) => ch === 'k' || ch === '*' || ch === '@' || ch === 'G');
export const PAVED = cellsOfMap((ch) => ch === 'o');
export const EXITS = ['4,0', '5,0'];                // 口は西だけ＝書き換え前と同じ
export const CHEST = '1,1';
export const BUTTONS = ['7,6', '7,8', '7,10'];      // 石の道の手前 @0・真ん中 @1・奥 @2
export const GATE_NEAR = '7,7';                     // 手前の水門 G1
export const GATE_FAR = '7,9';                      // 奥の水門 G2
export const BELL_NEAR = '3,9';                     // 上の鐘→手前の水門
export const BELL_FAR = '4,9';                      // 下の鐘→奥の水門
export const STONES = ['2,5', '5,5', '6,4'];
export const PILLARS = ['5,4', '6,6', '8,5', '8,6'];
export const BRAKE = '6,5';
export const LINKS = [{ switchId: BELL_NEAR, gateId: GATE_NEAR }, { switchId: BELL_FAR, gateId: GATE_FAR }];
export const SHOW = { [CHEST]: { trigger: 'stonesPlaced' } };
const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } };
export const SHORTEST = 50;                          // 最短手数（厳格）
export const SHORTEST_LOOSE = 48;                    // 緩い版（はしごの上から押す近道・運ぶ並びは同じ）
export const PUSHES = 9;
export const SHOTS = 4;

const P = (k) => k.split(',').map(Number);

// ソルバーの入力。宝箱は解くまで現れない＝床として渡す（堀の内側＝石は届かない）。
export function solverInput(map = ICE_MAP, links = LINKS) {
	const tiles = map.map((row) => [...row].map((ch) => (
		ch === 'k' || ch === '~' || ch === 'o' || ch === TILE.CHEST ? '.' : ch === '@' ? TILE.BUTTON : ch === 'G' ? TILE.TIDE_GATE : ch)));
	const bg = map.map((row) => [...row].map((ch) => (
		ch === '~' ? '~' : ch === 'k' || ch === '*' || ch === '@' || ch === 'G' ? TILE.ICE : 'g')));
	const by = new Map();
	for (const { switchId, gateId } of links) by.set(switchId, [...(by.get(switchId) ?? []), gateId]);
	return { tiles, bg, linkSpec: [...by] };
}

// 状態空間：ブレードのソルバー＋
//   strict＝画面で読める手だけ（はしごの途中で押さない・射らない・曲がらない／石を橋脚にしない）
//   guard＝鐘を鳴らすと「石か自分が乗っている水門」が閉じる手は不発（game/player.js toggleSwitch と同じ規則）
export function makeRoomSolver(map = ICE_MAP, { strict = true, guard = true, links = LINKS, ...opts } = {}) {
	const { tiles, bg, linkSpec } = solverInput(map, links);
	const S0 = makeSolver(tiles, bg, linkSpec, {}, new Set(), { hasLadder: true, openTideBanks: true, ...opts });
	const isW = (r, c) => bg[r]?.[c] === '~';
	const land = (r, c) => tiles[r]?.[c] !== undefined && !isW(r, c) && !HARD_BLOCKED.has(tiles[r][c]) && tiles[r][c] !== TILE.SWITCH;
	const gates = new Set(linkSpec.flatMap(([, gs]) => gs));
	const openOf = (pos, stones, mask) => {
		const open = new Set();
		for (const [sw, gs] of linkSpec) {
			const i = S0.toggleCells.indexOf(sw);
			const on = i >= 0 ? (mask & (1 << i)) !== 0 : (sw === pos || stones.includes(sw));
			if (on) gs.forEach((g) => open.add(g));
		}
		return open;
	};
	// 閉じた水門の上に石か自分がいる（＝水に沈んだ絵）
	const sunk = (st) => {
		const [pos, ss, m] = st.split('|');
		const stones = ss ? ss.split(';') : [];
		const open = openOf(pos, stones, Number(m));
		return [...gates].some((g) => !open.has(g) && (stones.includes(g) || g === pos));
	};
	const nextStates = (st) => {
		const [pos, ss, mask] = st.split('|');
		const [pr, pc] = P(pos);
		const stones = ss ? ss.split(';') : [];
		let out = S0.nextStates(st);
		if (guard) {
			const before = openOf(pos, stones, Number(mask));
			out = out.filter((nx) => {
				const nmask = nx.split('|')[2];
				if (nmask === mask) return true;
				const after = openOf(pos, stones, Number(nmask));
				return ![...before].some((g) => !after.has(g) && (stones.includes(g) || g === pos));
			});
		}
		if (!strict) return out;
		return out.filter((nx) => {
			const [npos, nss, nmask] = nx.split('|');
			const [nr, nc] = P(npos);
			const moved = nr !== pr || nc !== pc;
			if (isW(pr, pc) && nmask !== mask) return false;                          // はしごの途中で射らない
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

// goal＝全ボタンの上に石。戻り値は measureMetrics の結果＋最短解の手順（押し・鐘）・石が入ったセル・沈んだ状態の数。
export function solveRoom(map = ICE_MAP, opts = {}) {
	const S = makeRoomSolver(map, opts);
	const buttons = cellsOfMap((ch) => ch === '@', map);
	const goalTest = (st) => { const ss = st.split('|')[1].split(';'); return buttons.length > 0 && buttons.every((b) => ss.includes(b)); };
	const starts = EXITS.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	const m = measureMetrics(S, starts, goalTest, () => 0,
		{ guardMax: 4_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
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
	const steps = [];
	let shots = 0;
	for (let i = 1; i < path.length; i++) {
		const a = path[i - 1].split('|'), b = path[i].split('|');
		if (a[1] !== b[1]) {
			const A = a[1].split(';'), B = b[1].split(';');
			const j = A.findIndex((x, k) => x !== B[k]);
			pushList.push(`${A[j]}→${B[j]}`);
			steps.push(`push ${A[j]}→${B[j]}`);
		} else if (a[2] !== b[2]) {
			shots++;
			steps.push(`ring@${b[0]} m${b[2]}`);
		}
	}
	return { ...m, path, pushes: pushList.length, pushList, shots, steps, stoneCells, sunk };
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
		log.push(`  ${ROOM}: links＝上の鐘 ${BELL_NEAR} → 手前の水門 ${GATE_NEAR}／下の鐘 ${BELL_FAR} → 奥の水門 ${GATE_FAR}`);
	}
	if (JSON.stringify(room.showConditions ?? {}) !== JSON.stringify(SHOW)) {
		room.showConditions = JSON.parse(JSON.stringify(SHOW));
		log.push(`  ${ROOM}: 宝箱 ${CHEST} は石が3つのボタンに乗ると現れる（stonesPlaced）`);
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
	check(`石の道（ボタン3つ・水門2枚）と石 ${STONES.join(' ')} の下は氷`, [...BUTTONS, GATE_NEAR, GATE_FAR, ...STONES].every((k) => bgAt(k) === TILE.ICE));
	check(`ブレーキ ${BRAKE} の下は石畳（滑ってきた石が止まる）`, at(BRAKE) === TILE.FLOOR && bgAt(BRAKE) === TILE.STONE_FLOOR);
	check(`鐘 ${BELL_NEAR}・${BELL_FAR} は四方が水（石が乗る道が無い）・bg なし`,
		[BELL_NEAR, BELL_FAR].every((k) => {
			const [r, c] = P(k);
			return at(k) === TILE.SWITCH && bgAt(k) === undefined
				&& [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].every(([y, x]) => bgAt(`${y},${x}`) === TILE.WATER || at(`${y},${x}`) === TILE.SWITCH);
		}));
	check(`湖（列7-10）は石の道（行7）と鐘のほかは全部水`,
		[...Array(8)].flatMap((_, i) => [7, 8, 9, 10].map((c) => `${i + 1},${c}`))
			.filter((k) => P(k)[0] !== 7 && ![BELL_NEAR, BELL_FAR].includes(k)).every((k) => bgAt(k) === TILE.WATER));
	check(`@0 ${BUTTONS[0]} の上下は門柱（石は @0 へ西からしか入れない）`, at('6,6') === TILE.WALL && at('8,6') === TILE.WALL);
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k)) && bgAt(k) !== TILE.WATER).sort();
		check(`画面の縁で開いているのは西の口だけ（実測 ${open.join(' ')}）`, same(open, EXITS));
	}
	check(`敵が居ない（謎解きの部屋）`, cellsOf((ch) => !!ENEMY_META[ch]).length === 0);
	check(`植生・看板・色・かがり火・壊せる壁・門が無い`,
		cellsOf((ch) => [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH_RED, TILE.SWITCH_BLUE,
			TILE.GATE_RED, TILE.GATE_BLUE, TILE.TORCH, TILE.BREAKABLE_WALL, TILE.GATE].includes(ch)).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`宝箱 B は ${CHEST} の1枚・中身＝ルピー×30・石が3つのボタンに乗ると現れる`,
		same(cellsOf((ch) => ch === TILE.CHEST), [CHEST]) && JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS)
		&& JSON.stringify(room.showConditions) === JSON.stringify(SHOW));
	check(`石は ${STONES.join(' ')}・ボタンは ${BUTTONS.join(' ')}・水門は ${GATE_NEAR} と ${GATE_FAR}・鐘は2つ・links は鐘→水門の2本`,
		same(cellsOf((ch) => ch === TILE.STONE), STONES) && same(cellsOf((ch) => ch === TILE.BUTTON), BUTTONS)
		&& same(cellsOf((ch) => ch === TILE.TIDE_GATE), [GATE_NEAR, GATE_FAR])
		&& same(cellsOf((ch) => ch === TILE.SWITCH), [BELL_NEAR, BELL_FAR]) && JSON.stringify(room.links) === JSON.stringify(LINKS));
	check(`柱 ${PILLARS.join(' ')} が壁`, PILLARS.every((k) => at(k) === TILE.WALL));
	check(`floorItems・breakableWalls・mapEnters が空`,
		Object.keys(room.floorItems).length === 0 && Object.keys(room.breakableWalls).length === 0
		&& Object.keys(room.mapEnters ?? {}).length === 0);
	{
		// 道の西端から東へ押した石が止まる所＝水門の開け閉めで決まる
		const slideEnd = (open) => {
			let c = 5;
			const enter = (cc) => { const k = `7,${cc}`; return at(k) !== TILE.WALL && (at(k) !== TILE.TIDE_GATE || open.includes(k)); };
			while (enter(c + 1) && (c === 5 || bgAt(`7,${c}`) === TILE.ICE)) c++;
			return `7,${c}`;
		};
		const both = slideEnd([GATE_NEAR, GATE_FAR]), near = slideEnd([GATE_NEAR]), none = slideEnd([]);
		check(`道の西端から東へ押した石は、両方開＝@2・手前だけ開＝@1・両方閉＝@0 で止まる（実測 ${both}／${near}／${none}）`,
			both === BUTTONS[2] && near === BUTTONS[1] && none === BUTTONS[0]);
	}

	// ── ② ソルバー（状態空間）＝石が3つのボタンに乗る・詰まない・沈まない ─────
	{
		const m = solveRoom();
		check(`厳格版で石が3つのボタンに乗る（L=${m.L}＝想定 ${SHORTEST}・押し ${m.pushes}・鐘 ${m.shots}・最短解 ${m.solCount} 本）`,
			m.L === SHORTEST && m.pushes === PUSHES && m.shots === SHOTS);
		const onButtons = m.pushList.filter((p) => BUTTONS.includes(p.split('→')[1])).map((p) => p.split('→')[1]);
		check(`ボタンは奥から順に埋まる（${onButtons.join(' → ')}）`, JSON.stringify(onButtons) === JSON.stringify([...BUTTONS].reverse()));
		check(`入って詰む状態が無い（厳格 noEscape=${m.noEscape}）`, m.noEscape === 0);
		check(`閉じた水門の上に石か自分がいる状態が無い（厳格 ${m.sunk}）`, m.sunk === 0);
		check(`石は堀の内側（列0-1）にも湖（石の道のほか）にも入れない`,
			[...m.stoneCells].every((k) => P(k)[1] >= 3 && (P(k)[1] <= 6 || P(k)[0] === 7)));
		const v = solveRoom(ICE_MAP, { strict: false });
		check(`緩い版＝${v.L} 手（想定 ${SHORTEST_LOOSE}＝はしごの上から押す近道）・詰まない（noEscape=${v.noEscape}）・沈まない（${v.sunk}）`,
			v.L === SHORTEST_LOOSE && v.noEscape === 0 && v.sunk === 0);
		check(`対照：はしご無しでは届かない（堀を渡れない）`, solveRoom(ICE_MAP, { hasLadder: false, strict: false }).L === null);
		check(`対照：石を押さないと届かない`, solveRoom(ICE_MAP, { noPush: true, strict: false }).L === null);
		check(`対照：鐘を鳴らせない（道具なし）と届かない`, solveRoom(ICE_MAP, { noTools: true, strict: false }).L === null);
		for (const k of STONES) {
			check(`対照：石 ${k} を消すと届かない（緩い版でも）`, solveRoom(withCell(k, 'k'), { strict: false }).L === null);
		}
		const only = (bell) => LINKS.filter((l) => l.switchId === bell);
		check(`対照：手前の水門を氷にする（開いたまま）と届かない＝閉じた顔が要る`,
			solveRoom(withCell(GATE_NEAR, 'k'), { strict: false, links: only(BELL_FAR) }).L === null);
		check(`対照：奥の水門を氷にする（開いたまま）と届かない＝閉じた顔が要る`,
			solveRoom(withCell(GATE_FAR, 'k'), { strict: false, links: only(BELL_NEAR) }).L === null);
		check(`対照：手前の水門を壁にする（閉じたまま）と届かない＝開いた顔が要る`,
			solveRoom(withCell(GATE_NEAR, '#'), { strict: false, links: only(BELL_FAR) }).L === null);
		check(`対照：奥の水門を壁にする（閉じたまま）と届かない＝開いた顔が要る`,
			solveRoom(withCell(GATE_FAR, '#'), { strict: false, links: only(BELL_NEAR) }).L === null);
		check(`対照：柱 (8,5) を氷にすると届かない`, solveRoom(withCell('8,5', 'k')).L === null);
		for (const k of [BRAKE, '5,4', '6,6']) {
			const w = solveRoom(withCell(k, 'k'));
			check(`対照：${k === BRAKE ? 'ブレーキ' : '柱'} ${k} を氷にすると短くなる（L=${w.L}＜${SHORTEST}）`, w.L !== null && w.L < SHORTEST);
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
	console.log(`# ${LAYER} ${ROOM}：東の行き止まりを「凍れる湖の鐘の道」に作り替える（キュー40 第2陣）`);
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
