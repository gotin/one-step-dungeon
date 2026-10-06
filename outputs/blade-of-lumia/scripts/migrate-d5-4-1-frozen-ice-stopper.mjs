// dungeon_5 `4,1`（`3,1` の東の行き止まり）：D4 の写しの部屋を「凍れる床の石止め」に作り替える
// （2026-10-06 / PLAN 実行キュー 40 の第2陣 5室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//   `dungeon_4 4,1` と同型＝四角い広間の真ん中に床の回復薬が1つあるだけ。口は西だけ（行4-5）。
//
// ■ 新しい語彙＝氷の床（TILE.ICE 'k'・bgTiles に置く地面）
//   人は普通に歩けるが、押した石は氷の上にいる間、止まるまで滑る（game/player.js の石押し・
//   scripts/lib/blade-solver.mjs が同じ規則）。止まるのは「次へ入れない（壁・水・石…）」か
//   「氷でないセルに乗った」とき。水門三部屋（`0,3`・`0,2`・`2,0`・`4,0`）に続く D5 の2つ目の語彙
//   （2026-10-06 ユーザー選択「氷の床・石だけ滑る」）。この部屋はその入門。
//
// ■ 新しい `4,1`＝凍れる床の石止め
//         0         1
//         012345678901
//      0  ############
//      1  #B~kkkkkk#k#   ← 宝箱 B(1,1)（石を置くと現れる）／レールの柱 #(1,9)
//      2  #.~kkokk@kk#   ← ブレーキ (2,5)＝石畳 'o'（氷でない＝石はここで止まる）／氷の上のボタン @(2,8)
//      3  #.~kkkkkk#k#   ← レールの柱 #(3,9)
//      4  ..~kk#kkkk##
//      5  ..~kkkk#kkk#
//      6  #.~kkkkkkkk#
//      7  #.~kk*k*kkk#   ← 石 *(7,5)・*(7,7)
//      8  #.~kkkkkkkk#
//      9  ############
//   （'k'＝氷・'~'＝水・'o'＝石畳＝どれも bgTiles。'@'＝ボタン S。石とボタンの下も氷）
//   ・ブレーキを石畳にした理由＝ダンジョンの床（下地なし）は氷の中では真っ暗＝「穴」に見えた（初版の撮影）。
//   ・主題＝**石は石で止める**。ボタンは氷の上＝石1つを押しても滑り過ぎる。ボタンの上で止めるには、
//     向こう側にもう1つの石を「止め役」として置いてから押し込むしかない。ボタンの上下を挟む柱
//     (1,9)・(3,9) が東へ滑る石を列8 に揃える「レール」になっている（止め役は行1、押し込む石は行3）。
//   ・解き筋（最短 44 手・押し 10 回・最短解 20 本）：南の2つの石の一方をもう一方で止めて列6 へ寄せ、
//     北へ滑らせて行1 へ（止め役の候補）→ もう一方を柱 (4,5)・(5,7) で折り曲げて列6 を北へ＝行1 の石に
//     当たって行2 で止まる → 行1 の石を東へ＝柱 (1,9) で (1,8) に止まる（止め役）→ 行2 の石を西へ＝
//     ブレーキの床 (2,5) で止まる → 南へ＝柱 (4,5) で (3,5) に止まる → 東へ＝柱 (3,9) で (3,8) に止まる →
//     北へ押し込む＝止め役 (1,8) に当たってボタン (2,8) の上で止まる → 宝箱。
//   ・西の縁は幅1の水の堀（列2・行1-8）。人ははしごで渡れる（8 か所）が石は渡れない＝石が入口の口を
//     塞いで出られなくなる形が無い（堀が無いと、石2つで口を塞ぐ状態が 148 あった）。宝箱は堀の内側
//     （列1）＝石が届かない。∴この部屋の謎ははしごが要る（徒歩では堀の手前の帯までしか入れない・意図）。
//   ・行き止まりの謎の部屋∴敵は置かない。床の回復薬は撤去し、宝箱はルピー×30（`0,3`・`2,0`・`4,0` と
//     同じ重さ。報酬の見直しはキュー45）。宝箱は石がボタンに乗ると現れる（stonesPlaced＝石もロック）。
//
// ■ 実機の細部に依らないこと（厳格版のソルバーで縛る）
//   厳格版（はしごの途中で押さない・曲がらない）と緩い版で同じ最短手数を検証する。宝箱は条件で現れる
//   ＝解くまで床∴ソルバーには床として渡す（石も滑り込めるが、行き着けない＝堀の内側）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と氷は bgTiles だけ／口は西だけ／敵・植生・看板が無い／宝箱と出現条件／石・ボタン
//   ・ソルバー（厳格・緩い）で同じ最短手数・入って詰む状態が無い・石は堀の内側に入れない
//   ・対照＝はしご無し／石を押さない／石を1つ消す／氷を床にする／レールの柱・ブレーキの床・
//     折り曲げの柱を1つずつ消す／堀を床にする（→ 詰む状態が出る）
//   ・層の到達性（到達室は不変・はしご無しでは堀の向こうに届かない）・dead-edge 0
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-4-1-frozen-ice-stopper.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-4-1-frozen-ice-stopper.mjs         # 書き込み

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
const ROOM  = '4,1';

// 書き換え前の盤面（層の到達性の基準はこれで測る＝適用済みの地図に再実行しても同じ）
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'...........#',
	'.....7.....#',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

// ── 狙いの盤面（'k'＝氷・'~'＝水・'o'＝石畳＝どれも bgTiles。'@'＝氷の上のボタン）──────
export const ICE_MAP = [
	'############',
	'#B~kkkkkk#k#',
	'#.~kkokk@kk#',
	'#.~kkkkkk#k#',
	'..~kk#kkkk##',
	'..~kkkk#kkk#',
	'#.~kkkkkkkk#',
	'#.~kk*k*kkk#',
	'#.~kkkkkkkk#',
	'############',
];
// tiles 層＝氷・水は床、'@' はボタン
export const TARGET = ICE_MAP.map((row) => row.replace(/[k~o]/g, '.').replaceAll('@', TILE.BUTTON));
const cellsOfMap = (pred, map = ICE_MAP) => map.flatMap((row, r) => [...row].flatMap((ch, c) => (pred(ch) ? [`${r},${c}`] : [])));
export const WATER = cellsOfMap((ch) => ch === '~');
// 氷＝'k' と、氷の上に置いた石・ボタン（下地も氷）
export const ICE = cellsOfMap((ch) => ch === 'k' || ch === '*' || ch === '@');
export const EXITS = ['4,0', '5,0'];                // 口は西だけ＝書き換え前と同じ
export const CHEST = '1,1';
export const BUTTON = '2,8';
export const STONES = ['7,5', '7,7'];
export const BRAKE = '2,5';                          // 氷でない床（石畳）＝滑る石が止まる
export const RAILS = ['1,9', '3,9'];                 // ボタンの上下を挟む柱
export const BENDS = ['4,5', '5,7'];                 // 押し込む石を折り曲げる柱
export const SHOW = { [CHEST]: { trigger: 'stonesPlaced' } };
const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } };
export const SHORTEST = 44;                          // 最短手数（厳格・緩い）
export const PUSHES = 10;

const P = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// ソルバーの入力。宝箱は解くまで現れない＝床として渡す。
export function solverInput(map = ICE_MAP) {
	const tiles = map.map((row) => [...row].map((ch) => (ch === 'k' || ch === '~' || ch === 'o' || ch === TILE.CHEST ? '.' : ch === '@' ? TILE.BUTTON : ch)));
	const bg = map.map((row) => [...row].map((ch) => (ch === '~' ? '~' : ch === 'k' || ch === '*' || ch === '@' ? TILE.ICE : 'g')));
	return { tiles, bg };
}

// strict＝画面で読める手だけ（はしごの途中で石を押さない・曲がらない）
export function makeRoomSolver(map = ICE_MAP, { strict = true, ...opts } = {}) {
	const { tiles, bg } = solverInput(map);
	const S0 = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: true, ...opts });
	const isW = (r, c) => bg[r]?.[c] === '~';
	const land = (r, c) => tiles[r]?.[c] !== undefined && !isW(r, c) && !HARD_BLOCKED.has(tiles[r][c]);
	const nextStates = (st) => {
		const out = S0.nextStates(st);
		if (!strict) return out;
		const [pos, ss] = st.split('|');
		const [pr, pc] = P(pos);
		return out.filter((nx) => {
			const [npos, nss] = nx.split('|');
			const [nr, nc] = P(npos);
			if (nss !== ss && isW(pr, pc)) return false;                              // はしごの途中で押さない
			if (isW(pr, pc) && (nr !== pr || nc !== pc)) {                            // はしごの途中で曲がらない
				return nr !== pr ? land(pr - 1, pc) && land(pr + 1, pc) : land(pr, pc - 1) && land(pr, pc + 1);
			}
			return true;
		});
	};
	return { ...S0, nextStates, tiles, bg };
}

// goal＝ボタンの上に石。戻り値は measureMetrics の結果＋最短解の手順・押した回数・石が入ったセル。
export function solveRoom(map = ICE_MAP, opts = {}) {
	const S = makeRoomSolver(map, opts);
	const buttons = cellsOfMap((ch) => ch === '@', map);
	const goalTest = (st) => { const ss = st.split('|')[1].split(';'); return buttons.length > 0 && buttons.every((b) => ss.includes(b)); };
	const starts = EXITS.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	const m = measureMetrics(S, starts, goalTest, () => 0,
		{ guardMax: 3_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
	const par = new Map(starts.map((s) => [s, null]));
	const q = [...starts];
	let goal = null;
	const stoneCells = new Set();
	for (let h = 0; h < q.length; h++) {
		const st = q[h];
		st.split('|')[1].split(';').filter(Boolean).forEach((k) => stoneCells.add(k));
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
	return { ...m, path, pushes: pushList.length, pushList, stoneCells };
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
	const wantBg = Object.fromEntries([...WATER.map((k) => [k, TILE.WATER]), ...ICE.map((k) => [k, TILE.ICE]), [BRAKE, TILE.STONE_FLOOR]]
		.sort(([a], [b]) => { const [ar, ac] = P(a), [br, bc] = P(b); return ar - br || ac - bc; }));
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(wantBg)) {
		room.bgTiles = wantBg;
		log.push(`  ${ROOM}: bgTiles に水 ${WATER.length} 枚・氷 ${ICE.length} 枚・石畳 1 枚（ブレーキ）`);
	}
	if (JSON.stringify(room.showConditions ?? {}) !== JSON.stringify(SHOW)) {
		room.showConditions = JSON.parse(JSON.stringify(SHOW));
		log.push(`  ${ROOM}: 宝箱 ${CHEST} は石がボタンに乗ると現れる（stonesPlaced）`);
	}
	if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
		room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
		log.push(`  ${ROOM}: 宝箱 ${CHEST}＝ルピー×30`);
	}
	if (Object.keys(room.floorItems ?? {}).length) {
		room.floorItems = {};
		log.push(`  ${ROOM}: 床の回復薬を撤去した`);
	}
	if (!Array.isArray(room.links) || room.links.length) {
		room.links = [];
		log.push(`  ${ROOM}: links を空の配列に`);
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
	check(`水 ${WATER.length} 枚・氷 ${ICE.length} 枚は bgTiles だけ（tiles 層に '~'/'k' が無い・水の下は床）`,
		Object.keys(room.bgTiles).length === WATER.length + ICE.length + 1
		&& WATER.every((k) => bgAt(k) === TILE.WATER && at(k) === TILE.FLOOR)
		&& ICE.every((k) => bgAt(k) === TILE.ICE)
		&& cellsOf((ch) => ch === TILE.WATER || ch === TILE.ICE).length === 0);
	check(`石 ${STONES.join(' ')} とボタン ${BUTTON} の下は氷`, [...STONES, BUTTON].every((k) => bgAt(k) === TILE.ICE));
	check(`ブレーキ ${BRAKE} は氷でない床（石畳の下地）`, at(BRAKE) === TILE.FLOOR && bgAt(BRAKE) === TILE.STONE_FLOOR);
	check(`西の堀は列2 の行1-8 の水（幅1）`, WATER.length === 8 && WATER.every((k) => P(k)[1] === 2));
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k)) && bgAt(k) !== TILE.WATER).sort();
		check(`画面の縁で開いているのは西の口だけ（実測 ${open.join(' ')}）`, same(open, EXITS));
	}
	check(`敵が居ない（謎解きの部屋）`, cellsOf((ch) => !!ENEMY_META[ch]).length === 0);
	check(`植生・看板・色・かがり火・壊せる壁・門・水門・鐘が無い`,
		cellsOf((ch) => [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH_RED, TILE.SWITCH_BLUE, TILE.SWITCH,
			TILE.GATE_RED, TILE.GATE_BLUE, TILE.TORCH, TILE.BREAKABLE_WALL, TILE.GATE, TILE.TIDE_GATE].includes(ch)).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`宝箱 B は ${CHEST} の1枚・中身＝ルピー×30・石がボタンに乗ると現れる`,
		same(cellsOf((ch) => ch === TILE.CHEST), [CHEST]) && JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS)
		&& JSON.stringify(room.showConditions) === JSON.stringify(SHOW));
	check(`石は ${STONES.join(' ')}・ボタンは ${BUTTON} の1つ`,
		same(cellsOf((ch) => ch === TILE.STONE), STONES) && same(cellsOf((ch) => ch === TILE.BUTTON), [BUTTON]));
	check(`レールの柱 ${RAILS.join(' ')}・折り曲げの柱 ${BENDS.join(' ')} が壁`, [...RAILS, ...BENDS].every((k) => at(k) === TILE.WALL));
	check(`floorItems・breakableWalls・mapEnters・links が空`,
		Object.keys(room.floorItems).length === 0 && Object.keys(room.breakableWalls).length === 0
		&& Object.keys(room.mapEnters ?? {}).length === 0 && Array.isArray(room.links) && room.links.length === 0);
	{
		// ボタンは氷の上＝列8 を北・南から、行2 を東・西から押しても、止め役が無ければ滑り過ぎる
		const [br, bc] = P(BUTTON);
		const slideEnd = (r, c, dr, dc) => {
			while (bgAt(`${r},${c}`) === TILE.ICE && !HARD_BLOCKED.has(at(`${r + dr},${c + dc}`)) && bgAt(`${r + dr},${c + dc}`) !== TILE.WATER) { r += dr; c += dc; }
			return `${r},${c}`;
		};
		const ends = DIRS.map(([dr, dc]) => slideEnd(br, bc, dr, dc));
		check(`ボタンの上で止まる向きが無い（石だけでは滑り過ぎる・実測 ${ends.join(' ')}）`, !ends.includes(BUTTON));
	}

	// ── ② ソルバー（状態空間）＝石がボタンに乗る・詰まない・実機の細部に依らない ─────
	{
		const m = solveRoom();
		check(`厳格版で石がボタンに乗る（L=${m.L}＝想定 ${SHORTEST}・押し ${m.pushes}・最短解 ${m.solCount} 本）`,
			m.L === SHORTEST && m.pushes === PUSHES);
		check(`最後の押しは北へ＝止め役 (1,8) に当たってボタンで止まる（${m.pushList.at(-1)}）`,
			m.pushList.at(-1) === `3,8→${BUTTON}` && m.path.at(-1).split('|')[1].split(';').includes('1,8'));
		check(`入って詰む状態が無い（厳格 noEscape=${m.noEscape}）`, m.noEscape === 0);
		check(`石は堀の内側（列0-1）に入れない（石が入ったセルの最小の列＝${Math.min(...[...m.stoneCells].map((k) => P(k)[1]))}）`,
			[...m.stoneCells].every((k) => P(k)[1] >= 3));
		const v = solveRoom(ICE_MAP, { strict: false });
		check(`緩い版でも同じ最短手数（L=${v.L}）・詰まない（noEscape=${v.noEscape}）`, v.L === SHORTEST && v.noEscape === 0);
		check(`対照：はしご無しでは届かない（堀を渡れない）`, solveRoom(ICE_MAP, { hasLadder: false, strict: false }).L === null);
		check(`対照：石を押さないと届かない`, solveRoom(ICE_MAP, { noPush: true, strict: false }).L === null);
		for (const k of STONES) {
			check(`対照：石 ${k} を消すと届かない（止め役が要る・緩い版でも）`, solveRoom(withCell(k, 'k'), { strict: false }).L === null);
		}
		{
			const flat = ICE_MAP.map((row) => row.replaceAll('k', '.').replaceAll('o', '.').replace('@', TILE.BUTTON));
			const f = (() => {   // 氷を全部床に＝ただの倉庫番（ボタンは床）
				const { tiles, bg } = solverInput(flat);
				const S = makeSolver(tiles, bg.map((r) => r.map((x) => (x === TILE.ICE ? 'g' : x))), [], {}, new Set(), { hasLadder: true });
				const starts = EXITS.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
				return measureMetrics(S, starts, (st) => st.split('|')[1].split(';').includes(BUTTON), () => 0, { guardMax: 3_000_000 });
			})();
			check(`対照：氷を床にすると別物（ただの倉庫番・L=${f.L}≠${SHORTEST}）`, f.L !== SHORTEST);
		}
		// 柱・ブレーキの対照は厳格版で測る＝緩い版では「はしごの上（堀）から石を押す」別解が柱の代わりをする
		for (const k of [...RAILS, ...BENDS]) {
			check(`対照：柱 ${k} を氷にすると届かない（厳格）`, solveRoom(withCell(k, 'k')).L === null);
		}
		check(`対照：ブレーキ ${BRAKE} を氷にすると届かない（厳格）`, solveRoom(withCell(BRAKE, 'k')).L === null);
		{
			const noMoat = ICE_MAP.map((row) => row.replace('~', 'k'));
			const w = solveRoom(noMoat, { strict: false });
			check(`対照：堀を氷にすると入って詰む状態が出る（noEscape=${w.noEscape}＝堀が石を締め出している）`, w.noEscape > 0);
		}
	}

	// ── ③ 層の到達性 ─────────────────────────────────────────────────
	{
		const now = runs();
		for (const kind of ['ladder', 'closed']) {
			check(`層の到達室（${kind}）が書き換え前と同じ（${now[kind].reachedRooms.size} 室）`,
				same(now[kind].reachedRooms, base[kind].reachedRooms));
		}
		// bfsLayer は口のセルに立てば「到達室」に数える＝堀の手前の帯（列1）までは徒歩で入れる。
		// ∴部屋の数ではなくセルで見る＝徒歩では堀の向こう（氷の場・列3 以東）に1マスも届かない。
		check(`はしご無しの到達室は書き換え前と同じ（${now.foot.reachedRooms.size} 室＝帯までは入れる）`,
			same(now.foot.reachedRooms, base.foot.reachedRooms));
		const fieldOnFoot = [...now.foot.reachedCells].filter((ck) => ck.startsWith(`${ROOM}:`) && P(ck.split(':')[1])[1] >= 3);
		const fieldLadder = [...now.ladder.reachedCells].filter((ck) => ck.startsWith(`${ROOM}:`) && P(ck.split(':')[1])[1] >= 3);
		check(`はしご無しでは堀の向こうに届かない（徒歩 ${fieldOnFoot.length} マス／はしご ${fieldLadder.length} マス）`,
			fieldOnFoot.length === 0 && fieldLadder.length > 0);
		check(`レイヤーの dead-edge が 0（実測 ${now.closed.deadEdges.length}）`, now.closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：東の行き止まりを「凍れる床の石止め」に作り替える（キュー40 第2陣）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}・水と氷は bgTiles）`);
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
