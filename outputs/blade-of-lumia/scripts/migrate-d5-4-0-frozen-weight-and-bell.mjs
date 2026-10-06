// dungeon_5 `4,0`（`3,0` の東の行き止まり）：D4 の写しの部屋を「凍れる湖の重しと鐘」に作り替える
// （2026-10-06 / PLAN 実行キュー 40 の第2陣 4室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//   `dungeon_4 4,0` と同型＝四角い広間の真ん中に床のルピー（5）が1つあるだけ。口は西だけ（行4-5）。
//   `3,0`（通り道）の東の行き止まり。D5 の中で使える道具＝ブーメラン・弓・ロウソク・爆弾・はしご。
//
// ■ 新しい `4,0`＝凍れる湖の重しと鐘（水門三部屋の総仕上げ）
//         0         1
//         012345678901
//      0  ############
//      1  #...~~~~~~B#   ← 宝箱 B(1,10)＝ルピー×30（面して立てるのは (2,10) だけ）
//      2  #*#.~#~~~~.#   ← 石 *(2,1)（北西の窪み）／島のボタンの北の壁 #(2,5)
//      3  #...#S~Y~~.#   ← 島のボタン S(3,5)（北と西が壁）／鐘 Y(3,7)＝島の東・西の岸からは壁 #(3,4) が射線を切る
//      4  ....=.~=~=.#   ← 水門 =(4,4)＝石の渡し／島 (4,5)／足場 =(4,7)・=(4,9)
//      5  ....~.~~~~.#   ← 島 (5,5)＝石の裏へ回る所（西の岸 (5,3) からはしご）
//      6  #.#.~~~~~~.#
//      7  #..S~~#Y~~.#   ← 岸のボタン S(7,3)＝おとり／鐘 Y(7,7)＝足場 (4,7) からしか射れない（柱 #(7,6)）
//      8  #...~~~~~~.#
//      9  ############
//   links＝鐘 (3,7)→水門 (4,4)／島のボタン (3,5)→足場 (4,7)／鐘 (7,7)→足場 (4,9)／岸のボタン (7,3)→水門 (4,4)
//   ・隣の三部屋の語彙を1部屋で全部使う＝`0,3`（石は干した水門だけを渡る）・`0,2`（石の重しが足場を干す・おとりのボタン）・
//     `2,0`（鐘を射ると足場が干上がり、干した足場が次の鐘を射る立ち位置になる）。新しい手は1つ＝**はしごで石の裏へ回る**
//     （島の石を北のボタンへ押すには島の南 (5,5) に立つ必要があり、そこへは西の岸から水1枚をはしごで渡るしかない）。
//   ・解き筋（最短 41 手・押し 7 回・射る 2 回・はしご 4 回・最短解 1 本）：西の岸 (5,3) から水 (5,4) をはしごで渡って島へ →
//     島のボタン (3,5) の上から東の鐘 (3,7) を射る（水門 (4,4) が干上がる）→ 水門を歩いて岸へ戻り、北西の窪みの石を南へ2つ押して
//     行4 へ → 西の口の前から東へ押して水門を渡し、島 (4,5) へ → 岸へ戻ってはしごで島の南 (5,5) へ回り、石を北のボタン (3,5) へ
//     押す（足場 (4,7) が干上がる）→ はしごで足場 (4,7) へ渡り、真下の鐘 (7,7) を射る（足場 (4,9) が干上がる）→ はしごで
//     足場 (4,9) へ、東の岸を北へ → 宝箱。
//   ・⚠️ 鐘を島の真上 (2,5) に置かない理由＝実エンジンは石を鐘のマスへ押せる（`tilePassable` が Y を通す・ソルバーの
//     HARD_BLOCKED は Y を壁と見る＝食い違い）∴ボタンの北が鐘だと、石を1つ押し過ぎるだけでボタンから鐘へ乗り、取り返せない。
//     ボタンの北と西を壁にして、乗せた石が二度と動かない形にした。
//   ・惑わせるもの＝岸のボタン (7,3) は踏めば水門 (4,4) が干上がるので「ここに石を乗せれば渡れる」に見えるが、石は1つしかない
//     ＝乗せた石は渡れない。踏んだまま石は押せない（離れると閉じる）。水門を干したままにできるのは鐘だけ（射ってから石を運ぶ）。
//   ・鐘はトグル＝射直すと水門が戻る。干した水門の上に石か自分が乗っているときは不発（`game/player.js toggleSwitch`・
//     色スイッチと同じ規則＝この部屋で入れた）。島の石はボタンの上で北と西は壁・東は水＝押し出せない∴足場 (4,7) は戻らない。
//   ・行き止まりの謎の部屋∴敵は置かない。木・茂み・看板は無い。床のルピー（5）は撤去し、宝箱の中身はルピー×30（`0,3`・`2,0` と同じ重さ。
//     報酬の見直しはキュー45）。
//
// ■ 実機の細部に依らないこと（厳格版のソルバーで縛る）
//   厳格版（はしごの途中で射らない・曲がらない・水の上から石を押さない・石を橋脚にしない＋不発の規則）と、緩い版（どれも無し）、
//   剣ビームあり（D5 の剣の下限は木＝ビームは出ないことがある∴解に要らないことを確かめる）で**同じ最短手数**になることを検証する。
//   宝箱は歩けない（ソルバーの HARD_BLOCKED に 'B' が無い＝壁として渡す）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水は bgTiles だけ／口は西だけ／敵・植生・看板が無い／宝箱の中身／石・ボタン・鐘・水門・links
//   ・ソルバー（厳格・緩い・ビーム）で同じ最短手数・入って詰む状態が無い・不発の規則があれば石が沈んだ状態に入らない
//   ・対照＝はしご無し／石を押さない／道具を封じる／鐘・島のボタン・石を1つずつ壁に／水門を1つずつ水に→届かない・
//     岸のボタンを壁にしても同じ手数（おとり）・不発の規則を外すと石が沈んだ状態に入れる（規則が効いている）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-4-0-frozen-weight-and-bell.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-4-0-frozen-weight-and-bell.mjs         # 書き込み

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
const ROOM  = '4,0';

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

// ── 狙いの盤面（`~`＝bgTiles の水・tiles 層では床）────────────────────
export const WATER_MAP = [
	'############',
	'#...~~~~~~B#',
	'#*#.~#~~~~.#',
	'#...#S~Y~~.#',
	'....=.~=~=.#',
	'....~.~~~~.#',
	'#.#.~~~~~~.#',
	'#..S~~#Y~~.#',
	'#...~~~~~~.#',
	'############',
];
export const TARGET = WATER_MAP.map((row) => row.replaceAll('~', '.'));
export const WATER = WATER_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '~' ? [`${r},${c}`] : [])));
export const EXITS = ['4,0', '5,0'];               // 口は西だけ＝書き換え前と同じ
export const CHEST = '1,10';
export const CHEST_FACE = '2,10';                  // 宝箱に面して立てる唯一の陸
export const STONE = '2,1';
export const BELL_FERRY = '3,7';                 // 石の渡しの水門を干す鐘（島からしか射れない）
export const BELL_PIER = '7,7';                    // 東の足場を干す鐘（足場 (4,7) からしか射れない＝東の岸へ渡る前は）
export const ISLAND_BUTTON = '3,5';                // 石の重しで足場 (4,7) を干す
export const DECOY_BUTTON = '7,3';                 // 踏めば水門 (4,4) が干上がるおとり
export const FERRY = '4,4';                        // 石の渡し（水門）
export const PIERS = ['4,7', '4,9'];               // はしごの橋脚になる足場（水門）
export const BEHIND = '5,5';                       // 島の石の裏＝ここへははしごで回る
export const LINKS = [
	{ switchId: BELL_FERRY, gateId: FERRY },
	{ switchId: ISLAND_BUTTON, gateId: '4,7' },
	{ switchId: BELL_PIER, gateId: '4,9' },
	{ switchId: DECOY_BUTTON, gateId: FERRY },
];
const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } };
export const SHORTEST = 41;                     // 最短手数（厳格・緩い・ビーム）
export const PUSHES = 7;
export const SHOTS = 2;

const P = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// ソルバーの入力＝tiles と bg（水）を盤面の写しから作る。links は [源, [水門…]] の形。
// 宝箱は壁として渡す（ソルバーの HARD_BLOCKED に 'B' が無い＝そのままだと宝箱の上を歩く）。
export function solverInput(waterMap = WATER_MAP, links = LINKS) {
	const tiles = waterMap.map((row) => [...row].map((ch) => (ch === '~' ? '.' : ch === TILE.CHEST ? TILE.WALL : ch)));
	const bg = waterMap.map((row) => [...row].map((ch) => (ch === '~' ? '~' : 'g')));
	const by = new Map();
	for (const { switchId, gateId } of links) by.set(switchId, [...(by.get(switchId) ?? []), gateId]);
	return { tiles, bg, linkSpec: [...by] };
}

// 状態空間：ブレードのソルバー＋
//   strict＝画面で読める手だけ（はしごの途中で射らない・曲がらない／水の上から石を押さない／石を橋脚にしない）
//   guard＝鐘を射ると「石か自分が乗っている水門」が閉じる手は不発（game/player.js toggleSwitch と同じ規則）
//   beam＝剣ビーム（溜め撃ち）は鐘を貫通して線上の鐘を全部鳴らす（projectile.js の beam）
export function makeRoomSolver(waterMap = WATER_MAP, { strict = true, guard = true, beam = false, links = LINKS, ...opts } = {}) {
	const { tiles, bg, linkSpec } = solverInput(waterMap, links);
	const S0 = makeSolver(tiles, bg, linkSpec, {}, new Set(), { hasLadder: true, openTideBanks: true, ...opts });
	const isW = (r, c) => bg[r]?.[c] === '~';
	const land = (r, c) => tiles[r]?.[c] !== undefined && !isW(r, c) && !HARD_BLOCKED.has(tiles[r][c]);
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
	// 閉じた水門の上に石がある（＝石が水に沈んだ絵）
	const sunk = (st) => {
		const [pos, ss, m] = st.split('|');
		const stones = ss ? ss.split(';') : [];
		const open = openOf(pos, stones, Number(m));
		return [...gates].some((g) => !open.has(g) && stones.includes(g));
	};
	const withBeam = (st) => {
		const out = S0.nextStates(st);
		if (!beam || opts.noTools) return out;
		const f = st.split('|');
		const [pr, pc] = P(f[0]);
		for (const [dr, dc] of DIRS) {
			let m = Number(f[2]), n = 0;
			for (let r = pr + dr, c = pc + dc; tiles[r]?.[c] !== undefined && tiles[r][c] !== TILE.WALL; r += dr, c += dc) {
				const i = S0.toggleCells.indexOf(`${r},${c}`);
				if (i >= 0) { m ^= (1 << i); n++; }
			}
			if (n >= 2) out.push([f[0], f[1], m, ...f.slice(3)].join('|'));   // 1つだけなら矢と同じ手
		}
		return out;
	};
	const nextStates = (st) => {
		const [pos, ss, mask] = st.split('|');
		const [pr, pc] = P(pos);
		const stones = ss ? ss.split(';') : [];
		let out = withBeam(st);
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
			if (isW(pr, pc) && nmask !== mask) return false;                       // はしごの途中で射らない
			if (nss !== ss && isW(pr, pc)) return false;                            // 水の上から石を押さない
			if (isW(pr, pc) && moved) {                                             // はしごの途中で曲がらない
				const ok = nr !== pr ? land(pr - 1, pc) && land(pr + 1, pc) : land(pr, pc - 1) && land(pr, pc + 1);
				if (!ok) return false;
			}
			if (isW(nr, nc) && moved) {                                             // 石を橋脚にしない
				const ns = nss ? nss.split(';') : [];
				const banks = nr !== pr ? [[nr - 1, nc], [nr + 1, nc]] : [[nr, nc - 1], [nr, nc + 1]];
				if (banks.some(([r, c]) => ns.includes(`${r},${c}`))) return false;
			}
			return true;
		});
	};
	return { ...S0, nextStates, tiles, bg, sunk, openOf };
}

// goal＝宝箱の隣の陸に立つ。戻り値は measureMetrics の結果＋最短解の手順・押した/射った/はしごの回数・石が沈んだ状態の数。
export function solveRoom(waterMap = WATER_MAP, opts = {}) {
	const S = makeRoomSolver(waterMap, opts);
	const [cr, cc] = P(CHEST);
	const goals = new Set(DIRS.map(([dr, dc]) => `${cr + dr},${cc + dc}`));
	const goalTest = (st) => { const pos = st.split('|')[0]; const [r, c] = P(pos); return goals.has(pos) && S.bg[r][c] !== '~'; };
	const starts = EXITS.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	const m = measureMetrics(S, starts, goalTest, () => 0,
		{ guardMax: 3_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
	const par = new Map(starts.map((s) => [s, null]));
	const q = [...starts];
	let goal = null, sunkStates = 0;
	for (let h = 0; h < q.length; h++) {
		const st = q[h];
		if (S.sunk(st)) sunkStates++;
		if (!goal && goalTest(st)) goal = st;
		for (const nx of S.nextStates(st)) {
			if (par.has(nx)) continue;
			par.set(nx, st);
			q.push(nx);
		}
	}
	const path = [];
	for (let s = goal; s; s = par.get(s)) path.unshift(s);
	let pushes = 0, shots = 0, ladder = 0;
	const shotFrom = [];
	for (let i = 1; i < path.length; i++) {
		const [a, as, am] = path[i - 1].split('|');
		const [b, bs, bm] = path[i].split('|');
		if (am !== bm) { shots++; shotFrom.push(a); }
		if (as !== bs) pushes++;
		const [br, bc] = P(b);
		if (S.bg[br][bc] === '~') ladder++;
	}
	return { ...m, path, pushes, shots, shotFrom, ladder, sunkStates };
}
// 盤面の1セルを差し替えた写し（対照実験用）
export const withCell = (k, ch, base = WATER_MAP) => {
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
	const wantBg = Object.fromEntries(WATER.map((k) => [k, TILE.WATER]));
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(wantBg)) {
		room.bgTiles = wantBg;
		log.push(`  ${ROOM}: bgTiles に水 ${WATER.length} 枚`);
	}
	if (JSON.stringify(room.links ?? []) !== JSON.stringify(LINKS)) {
		room.links = LINKS.map((l) => ({ ...l }));
		log.push(`  ${ROOM}: links＝${LINKS.map((l) => `${l.switchId}→${l.gateId}`).join('／')}`);
	}
	if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
		room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
		log.push(`  ${ROOM}: 宝箱 ${CHEST}＝ルピー×30`);
	}
	if (Object.keys(room.floorItems ?? {}).length) {
		room.floorItems = {};
		log.push(`  ${ROOM}: 床のルピー（5）を撤去した`);
	}
	room.signData ??= {};
	room.npcData ??= {};
	room.enemyDirs ??= {};
	room.floorItems ??= {};
	room.showConditions ??= {};
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
	const bgWater = (k) => room.bgTiles[k] === TILE.WATER;
	const nextTo = (k) => { const [r, c] = P(k); return DIRS.map(([dr, dc]) => `${r + dr},${c + dc}`); };
	// 4方向の射線で最初に当たる鐘（壁で止まる・鐘で止まる＝矢と同じ）
	const firstBellFrom = (k, dr, dc) => {
		let [r, c] = P(k);
		for (r += dr, c += dc; t[r]?.[c] !== undefined && t[r][c] !== TILE.WALL; r += dr, c += dc) {
			if (t[r][c] === TILE.SWITCH) return `${r},${c}`;
		}
		return null;
	};
	const bellsFrom = (cells) => new Set(cells.flatMap((k) => DIRS.map(([dr, dc]) => firstBellFrom(k, dr, dc)).filter(Boolean)));

	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	check(`水は bgTiles だけ（${WATER.length} 枚・tiles 層に '~' が無い・水の下は床）`,
		Object.keys(room.bgTiles).length === WATER.length && WATER.every((k) => bgWater(k) && at(k) === TILE.FLOOR)
		&& cellsOf((ch) => ch === TILE.WATER).length === 0);
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k)) && !bgWater(k)).sort();
		check(`画面の縁で開いているのは西の口だけ（実測 ${open.join(' ')}）`, same(open, EXITS));
	}
	check(`敵が居ない（謎解きの部屋）`, cellsOf((ch) => !!ENEMY_META[ch]).length === 0);
	check(`植生・看板・色・かがり火・壊せる壁・門 T が無い`,
		cellsOf((ch) => [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH_RED, TILE.SWITCH_BLUE,
			TILE.GATE_RED, TILE.GATE_BLUE, TILE.TORCH, TILE.BREAKABLE_WALL, TILE.GATE].includes(ch)).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`宝箱 B は ${CHEST} の1枚・中身＝ルピー×30`,
		same(cellsOf((ch) => ch === TILE.CHEST), [CHEST]) && JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
	check(`宝箱に面して立てる陸は ${CHEST_FACE} だけ`,
		same(nextTo(CHEST).filter((k) => at(k) !== undefined && !HARD_BLOCKED.has(at(k)) && at(k) !== TILE.CHEST && !bgWater(k)), [CHEST_FACE]));
	check(`石は ${STONE} の1つ・ボタンは島 ${ISLAND_BUTTON} と岸 ${DECOY_BUTTON}・鐘は ${BELL_FERRY} と ${BELL_PIER}`,
		same(cellsOf((ch) => ch === TILE.STONE), [STONE]) && same(cellsOf((ch) => ch === TILE.BUTTON), [ISLAND_BUTTON, DECOY_BUTTON])
		&& same(cellsOf((ch) => ch === TILE.SWITCH), [BELL_FERRY, BELL_PIER]));
	check(`水門 = は ${FERRY}（石の渡し）と ${PIERS.join(' ')}（足場）・links が源→水門を指す`,
		same(cellsOf((ch) => ch === TILE.TIDE_GATE), [FERRY, ...PIERS]) && JSON.stringify(room.links) === JSON.stringify(LINKS));
	check(`floorItems・showConditions・breakableWalls・mapEnters が空`,
		Object.keys(room.floorItems).length === 0 && Object.keys(room.showConditions).length === 0
		&& Object.keys(room.breakableWalls).length === 0 && Object.keys(room.mapEnters ?? {}).length === 0);
	{
		// 西の岸（列1-3 の陸）から射て当たる鐘は無い＝鐘 (3,7) は島から、鐘 (7,7) は足場 (4,7) から射る
		const westShore = cellsOf((ch, r, c) => c <= 3 && !HARD_BLOCKED.has(ch) && !bgWater(`${r},${c}`));
		const island = ['3,5', '4,5', '5,5'];
		check(`西の岸からはどの鐘にも当たらない（壁 (3,4)・柱 (7,6) が射線を切る）`, bellsFrom(westShore).size === 0);
		check(`島からは鐘 ${BELL_FERRY} だけに当たる`, same(bellsFrom(island), [BELL_FERRY]));
		check(`足場 ${PIERS[0]} からは鐘 ${BELL_PIER} に当たる`, bellsFrom([PIERS[0]]).has(BELL_PIER));
		check(`島の石の裏 ${BEHIND} は島の陸・その西は水1枚で西の岸 (5,3)`,
			at(BEHIND) === TILE.FLOOR && !bgWater(BEHIND) && bgWater('5,4') && !bgWater('5,3') && at('5,3') === TILE.FLOOR);
		check(`島のボタン ${ISLAND_BUTTON} は北と西が壁・東が水＝乗せた石は押し出せない（鐘のマスへも押せない）`,
			at('2,5') === TILE.WALL && at('3,4') === TILE.WALL && bgWater('3,6'));
		check(`鐘はどちらも四方が水か柱か水門＝石が乗る道が無い`,
			[BELL_FERRY, BELL_PIER].every((y) => nextTo(y).every((k) => bgWater(k) || at(k) === TILE.WALL || at(k) === TILE.TIDE_GATE)));
	}

	// ── ② ソルバー（状態空間）＝宝箱の隣に届く・詰まない・実機の細部に依らない ─────
	{
		const m = solveRoom();
		check(`厳格版で宝箱の隣に届く（L=${m.L}＝想定 ${SHORTEST}・押し ${m.pushes}・射る ${m.shots}（${m.shotFrom.join(' ')}）・はしご ${m.ladder}・最短解 ${m.solCount} 本）`,
			m.L === SHORTEST && m.pushes === PUSHES && m.shots === SHOTS);
		check(`最短解は島から鐘を、足場 ${PIERS[0]} から鐘を射る`,
			m.shotFrom.length === 2 && ['3,5', '4,5', '5,5'].includes(m.shotFrom[0]) && m.shotFrom[1] === PIERS[0]);
		check(`入って詰む状態が無い（厳格 noEscape=${m.noEscape}）・石が沈んだ状態に入らない（${m.sunkStates}）`,
			m.noEscape === 0 && m.sunkStates === 0);
		for (const o of [{ strict: false, guard: false }, { beam: true }, { strict: false, guard: false, beam: true }]) {
			const v = solveRoom(WATER_MAP, o);
			check(`${JSON.stringify(o)} でも同じ最短手数（L=${v.L}）・詰まない（noEscape=${v.noEscape}）`, v.L === SHORTEST && v.noEscape === 0);
		}
		{
			const v = solveRoom(WATER_MAP, { guard: false });
			check(`対照：不発の規則を外すと石が沈んだ状態に入れる（${v.sunkStates} 状態＝規則が効いている）`, v.sunkStates > 0);
		}
		check(`対照：はしご無しでは届かない`, solveRoom(WATER_MAP, { hasLadder: false, strict: false }).L === null);
		check(`対照：石を押さないと届かない`, solveRoom(WATER_MAP, { noPush: true, strict: false }).L === null);
		check(`対照：弓を封じる（剣だけ）と届かない`, solveRoom(WATER_MAP, { noTools: true, strict: false }).L === null);
		for (const k of [BELL_FERRY, BELL_PIER, ISLAND_BUTTON, STONE]) {
			check(`対照：${k}（${at(k)}）を壁にすると届かない`, solveRoom(withCell(k, TILE.WALL), { strict: false }).L === null);
		}
		for (const g of [FERRY, ...PIERS]) {
			check(`対照：水門 ${g} を普通の水にすると届かない`, solveRoom(withCell(g, '~'), { strict: false }).L === null);
		}
		{
			const v = solveRoom(withCell(DECOY_BUTTON, TILE.WALL));
			check(`対照：岸のボタン ${DECOY_BUTTON} を壁にしても同じ手数（おとり＝解に要らない・L=${v.L}）`, v.L === SHORTEST);
		}
		check(`対照：島の南 ${BEHIND} を水にすると届かない（石の裏へ回る所）`, solveRoom(withCell(BEHIND, '~'), { strict: false }).L === null);
		check(`対照：開いた水門を橋脚に数えないと届かない（足場が主役）`,
			solveRoom(WATER_MAP, { strict: false, openTideBanks: false }).L === null);
	}

	// ── ③ 層の到達性は不変 ───────────────────────────────────────────
	{
		const now = runs();
		for (const kind of ['ladder', 'foot', 'closed']) {
			check(`層の到達室（${kind}）が書き換え前と同じ（${now[kind].reachedRooms.size} 室）`,
				same(now[kind].reachedRooms, base[kind].reachedRooms));
		}
		check(`レイヤーの dead-edge が 0（実測 ${now.closed.deadEdges.length}）`, now.closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：東の行き止まりを「凍れる湖の重しと鐘」に作り替える（キュー40 第2陣）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}・水は bgTiles）`);
	WATER_MAP.forEach((now, i) => {
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
