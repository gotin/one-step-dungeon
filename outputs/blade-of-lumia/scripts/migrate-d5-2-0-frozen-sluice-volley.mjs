// dungeon_5 `2,0`（`2,1` の北の行き止まり）：D4 の写しの部屋を「凍れる湖の射ち継ぎ」に作り替える
// （2026-10-06 / PLAN 実行キュー 40 の第2陣 3室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//   `dungeon_4 2,0` と同型＝四角い広間の真ん中に宝箱（ルピー×10）が1つあるだけ。口は南だけ（列5-6）。
//   `2,1`（通り道）の北の行き止まり。D5 の中で使える道具＝ブーメラン・弓・ロウソク・爆弾・はしご。
//
// ■ 新しい `2,0`＝凍れる湖の射ち継ぎ（干した水門は、次のスイッチを射る立ち位置になる）
//         0         1
//         012345678901
//      0  ############
//      1  #B.#...#...#   ← 北の岸・宝箱 B(1,1)＝ルピー×30（面して立てるのは (1,2) だけ）
//      2  #~~~~~~~~~~#   ← 凍れる湖（行2-6）
//      3  #~=~=#~~~Y=#   ← 水門 =(3,2)・(3,4)・(3,10)／スイッチ Y(3,9)／崩れ柱 #(3,5)
//      4  #~Y~~~~#~~~#   ← スイッチ Y(4,2)／崩れ柱 #(4,7)
//      5  #~~Y=~~~~#=#   ← スイッチ Y(5,3)／水門 =(5,4)・(5,10)／崩れ柱 #(5,9)
//      6  #~~~~Y~~~~~#   ← スイッチ Y(6,5)
//      7  #..#.......#   ← 南の岸
//      8  #..........#
//      9  #####..#####   ← 南の口（列5-6）
//   ・湖に浮かぶスイッチ `Y`（武器で叩くトグル）を矢で射ると、つながった水門 `=`（潮ゲート）が干上がって床になる
//     （`game/conditions.js refreshGates` ②）。干した水門は床＝はしごの橋脚になる（`0,2` で入れた規則）。
//     スイッチの links＝(6,5)→(5,4)／(4,2)→(5,10)／(5,3)→(3,2)・(3,10)／(3,9)→(3,4)。
//   ・見せ場＝**干した足場が、次のスイッチを射る立ち位置になる**（射ち継ぎ）。南の岸から射られるスイッチは2つだけ
//     （(6,5)＝入口の正面・(4,2)＝列2 の岸から真上）。スイッチ (5,3) は足場 (5,4) の上からしか、
//     スイッチ (3,9) は足場 (3,10) の上からしか当たらない（崩れ柱 (3,5)・(5,9) が他の射線を切る）。
//   ・解き筋（最短 43 手・射る 4 回）：入口から真上のスイッチ (6,5) を射る（足場 (5,4)）→ 列2 の岸から真上のスイッチ (4,2)
//     を射る（足場 (5,10)）→ はしごで足場 (5,4) へ渡り、左のスイッチ (5,3) を射る（足場 (3,2)・(3,10)）→ 東へ回り、
//     はしごで足場 (5,10)・(3,10) へ渡って左のスイッチ (3,9) を射る（足場 (3,4)）→ 戻って足場 (5,4)・(3,4)・(3,2) を
//     渡り、北の岸 (1,2) へ → 宝箱。東の遠回り＝スイッチ (3,9) を射る立ち位置を取りに行くだけの往復が読みどころ。
//   ・崩れ柱の役目＝(3,5)＝足場 (3,4) から東を射られなくする・(5,9)＝南の岸から東のスイッチへ届かなくする（無いと 22 手）・
//     (4,7)＝はしごで (4,10) を渡る途中に西を射るとスイッチ (4,2) が戻り、帰りの足場 (5,10) が沈んで北東に閉じ込められる
//     ＝その射線を切る（緩い版ソルバーで noEscape 20 → 0）・北の (1,3)・(1,7)＝宝箱の小部屋と北東の岸を区切る。
//   ・スイッチはトグル＝射直すと足場が沈む。立っている足場を自分で沈める手は無い（ソルバーで確かめる）。
//   ・剣でもスイッチは叩ける（隣に立てば）。剣ビーム（溜め撃ち）はスイッチを貫通して線上のスイッチを全部トグルする＝手として
//     ソルバーに足して、最短手数が変わらないことを確かめる。矢でしか当たらないのはスイッチ (4,2)（隣が全部水）。
//   ・行き止まりの謎の部屋∴敵は置かない。木・茂み・看板は無い。宝箱の中身はルピー×10 → ×30（`0,3` と同じ重さ）。
//   ・隣の `0,3`（水門＝石の渡し場）・`0,2`（水門＝人の足場・ボタンと石）と同じ水門の語彙を、弓で再演する。
//     D7 の弓の部屋（`2,2` 空の射的場＝射線を探す／`0,3` 空の二色回廊＝色の座）とは「立ち位置を自分で作る」点で違う。
//
// ■ 実機の細部に依らないこと（厳格版のソルバーで縛る）
//   厳格版（はしごの途中で射らない・曲がらない）と緩い版、剣ビームあり／なしの4通りで**同じ最短手数**に
//   なることを検証する。宝箱は歩けない（ソルバーの HARD_BLOCKED に 'B' が無い＝壁として渡す）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水は bgTiles だけ／口は南だけ／敵・植生・看板・石・ボタンが無い／宝箱の中身／スイッチ・水門・links
//   ・ソルバー（厳格・緩い × ビームあり・なし）で同じ最短手数・入って詰む状態が無い・立っている足場を沈める手が無い
//   ・対照＝はしご無し／弓とビームを封じる／スイッチを1つずつ壁に／足場を1つずつ水に／開いた水門を橋脚に数えない／
//     崩れ柱 (4,7) を水に（詰む）／崩れ柱 (5,9) を水に（近道）→どれも狙いどおりに崩れる
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-2-0-frozen-sluice-volley.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-2-0-frozen-sluice-volley.mjs         # 書き込み

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
const ROOM  = '2,0';

// 書き換え前の盤面（層の到達性の基準はこれで測る＝適用済みの地図に再実行しても同じ）
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'#....B.....#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面（`~`＝bgTiles の水・tiles 層では床）────────────────────
export const WATER_MAP = [
	'############',
	'#B.#...#...#',
	'#~~~~~~~~~~#',
	'#~=~=#~~~Y=#',
	'#~Y~~~~#~~~#',
	'#~~Y=~~~~#=#',
	'#~~~~Y~~~~~#',
	'#..#.......#',
	'#..........#',
	'#####..#####',
];
export const TARGET = WATER_MAP.map((row) => row.replaceAll('~', '.'));
export const WATER = WATER_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '~' ? [`${r},${c}`] : [])));
export const EXITS = ['9,5', '9,6'];               // 口は南だけ＝書き換え前と同じ
export const CHEST = '1,1';
export const CHEST_FACE = '1,2';                   // 宝箱に面して立てる唯一の陸
export const BELLS = ['6,5', '4,2', '5,3', '3,9'];  // 解き筋で射る順
export const PIERS = ['5,4', '5,10', '3,2', '3,10', '3,4'];
export const LINKS = [
	{ switchId: '6,5', gateId: '5,4' },
	{ switchId: '4,2', gateId: '5,10' },
	{ switchId: '5,3', gateId: '3,2' },
	{ switchId: '5,3', gateId: '3,10' },
	{ switchId: '3,9', gateId: '3,4' },
];
export const TRAP_PILLAR = '4,7';                  // はしごの途中の射線を切る
export const DETOUR_PILLAR = '5,9';                // 南の岸から東のスイッチへ届かなくする
const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } };
export const SHORTEST = 43;                        // 最短手数（厳格・緩い × ビームあり・なし）
export const SHOTS = 4;                            // 最短解でスイッチを叩く回数

const P = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// ソルバーの入力＝tiles と bg（水）を盤面の写しから作る。links は [スイッチ, [水門…]] の形。
// 宝箱は壁として渡す（ソルバーの HARD_BLOCKED に 'B' が無い＝そのままだと宝箱の上を歩く）。
export function solverInput(waterMap = WATER_MAP, links = LINKS) {
	const tiles = waterMap.map((row) => [...row].map((ch) => (ch === '~' ? '.' : ch === TILE.CHEST ? TILE.WALL : ch)));
	const bg = waterMap.map((row) => [...row].map((ch) => (ch === '~' ? '~' : 'g')));
	const by = new Map();
	for (const { switchId, gateId } of links) by.set(switchId, [...(by.get(switchId) ?? []), gateId]);
	return { tiles, bg, linkSpec: [...by] };
}

// 状態空間：ブレードのソルバー＋剣ビーム（スイッチを貫通して線上のスイッチを全部トグル＝projectile.js の beam）。
// strict＝はしごの途中で射らない・曲がらない（画面で読める手だけ）。
export function makeRoomSolver(waterMap = WATER_MAP, { strict = true, beam = true, links = LINKS, ...opts } = {}) {
	const { tiles, bg, linkSpec } = solverInput(waterMap, links);
	const S0 = makeSolver(tiles, bg, linkSpec, {}, new Set(), { hasLadder: true, openTideBanks: true, ...opts });
	const isW = (r, c) => bg[r]?.[c] === '~';
	const land = (r, c) => tiles[r]?.[c] !== undefined && !isW(r, c) && !HARD_BLOCKED.has(tiles[r][c]);
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
		const out = withBeam(st);
		if (!strict) return out;
		const [pos, , mask] = st.split('|');
		const [pr, pc] = P(pos);
		if (!isW(pr, pc)) return out;
		return out.filter((nx) => {
			const [npos, , nmask] = nx.split('|');
			const [nr, nc] = P(npos);
			if (nmask !== mask) return false;                                      // はしごの途中で射らない
			if (nr === pr && nc === pc) return true;
			return nr !== pr ? land(pr - 1, pc) && land(pr + 1, pc) : land(pr, pc - 1) && land(pr, pc + 1);   // 曲がらない
		});
	};
	// スイッチのマスク → 開いている水門
	const openOf = (mask) => {
		const open = new Set();
		for (const [sw, gs] of linkSpec) { const i = S0.toggleCells.indexOf(sw); if (i >= 0 && (mask & (1 << i))) gs.forEach((g) => open.add(g)); }
		return open;
	};
	return { ...S0, nextStates, tiles, bg, openOf };
}

// goal＝宝箱の隣の陸に立つ。戻り値は measureMetrics の結果＋最短解の手順・射った回数・「立っている足場を沈める手」の数。
export function solveRoom(waterMap = WATER_MAP, opts = {}) {
	const S = makeRoomSolver(waterMap, opts);
	const goals = new Set(DIRS.map(([dr, dc]) => { const [r, c] = P(CHEST); return `${r + dr},${c + dc}`; }));
	const goalTest = (st) => { const pos = st.split('|')[0]; return goals.has(pos) && !S.bg[P(pos)[0]][P(pos)[1]].includes('~'); };
	const starts = EXITS.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	const m = measureMetrics(S, starts, goalTest, () => 0,
		{ guardMax: 3_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
	// 最短解の手順と「立っている足場を自分で沈める手」を BFS で数える
	const par = new Map(starts.map((s) => [s, null]));
	const q = [...starts];
	let goal = null, sinkSelf = 0;
	for (let h = 0; h < q.length; h++) {
		const st = q[h];
		const [pos, , mask] = st.split('|');
		const [r, c] = P(pos);
		for (const nx of S.nextStates(st)) {
			const nmask = nx.split('|')[2];
			if (nmask !== mask && S.tiles[r][c] === TILE.TIDE_GATE && !S.openOf(Number(nmask)).has(pos)) sinkSelf++;
			if (par.has(nx)) continue;
			par.set(nx, st);
			q.push(nx);
			if (!goal && goalTest(nx)) goal = nx;
		}
	}
	const path = [];
	for (let s = goal; s; s = par.get(s)) path.unshift(s);
	const shots = path.filter((s, i) => i > 0 && s.split('|')[2] !== path[i - 1].split('|')[2]).length;
	return { ...m, path, shots, sinkSelf };
}
// 盤面の1セルを差し替えた写し（対照実験用）
export const withCell = (k, ch) => {
	const [r, c] = P(k);
	return WATER_MAP.map((row, i) => (i === r ? row.slice(0, c) + ch + row.slice(c + 1) : row));
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
		log.push(`  ${ROOM}: 宝箱 ${CHEST}＝ルピー×30（旧 (4,5) ルピー×10 から移した）`);
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
		check(`画面の縁で開いているのは南の口だけ（実測 ${open.join(' ')}）`, same(open, EXITS));
	}
	check(`敵が居ない（謎解きの部屋）`, cellsOf((ch) => !!ENEMY_META[ch]).length === 0);
	check(`植生・看板・石・ボタン・色・かがり火・壊せる壁・門 T が無い`,
		cellsOf((ch) => [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.STONE, TILE.BUTTON, TILE.SWITCH_RED, TILE.SWITCH_BLUE,
			TILE.GATE_RED, TILE.GATE_BLUE, TILE.TORCH, TILE.BREAKABLE_WALL, TILE.GATE].includes(ch)).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`宝箱 B は ${CHEST} の1枚・中身＝ルピー×30`,
		same(cellsOf((ch) => ch === TILE.CHEST), [CHEST]) && JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
	check(`宝箱に面して立てる陸は ${CHEST_FACE} だけ`,
		same(nextTo(CHEST).filter((k) => at(k) !== undefined && !HARD_BLOCKED.has(at(k)) && at(k) !== TILE.CHEST && !bgWater(k)), [CHEST_FACE]));
	// 入口の正面のスイッチ (6,5) だけが南の岸 (7,5) に接する（最初の1つ＝剣でも叩ける）。残り3つは湖の中。
	check(`スイッチ Y は ${BELLS.join(' ')}（(6,5) 以外の3つは湖の中＝四方が水か柱か水門）`,
		same(cellsOf((ch) => ch === TILE.SWITCH), BELLS)
		&& BELLS.slice(1).every((y) => nextTo(y).every((k) => bgWater(k) || at(k) === TILE.WALL || at(k) === TILE.TIDE_GATE)));
	check(`水門 = は ${PIERS.join(' ')}・links がスイッチ→水門を指す`,
		same(cellsOf((ch) => ch === TILE.TIDE_GATE), PIERS) && JSON.stringify(room.links) === JSON.stringify(LINKS)
		&& same(LINKS.map((l) => l.gateId), PIERS) && same([...new Set(LINKS.map((l) => l.switchId))], BELLS));
	check(`floorItems・showConditions・breakableWalls・mapEnters が空`,
		Object.keys(room.floorItems).length === 0 && Object.keys(room.showConditions).length === 0
		&& Object.keys(room.breakableWalls).length === 0 && Object.keys(room.mapEnters ?? {}).length === 0);
	check(`スイッチ (4,2) は隣に立てる陸が無い＝矢でしか当たらない`,
		nextTo('4,2').every((k) => bgWater(k) || at(k) === TILE.TIDE_GATE));

	// ── ② ソルバー（状態空間）＝宝箱の隣に届く・詰まない・実機の細部に依らない ─────
	{
		const m = solveRoom();
		check(`厳格版で宝箱の隣に届く（L=${m.L}＝想定 ${SHORTEST}・スイッチを叩く ${m.shots} 回・最短解 ${m.solCount} 本）`,
			m.L === SHORTEST && m.shots === SHOTS);
		for (const o of [{ strict: false }, { beam: false }, { strict: false, beam: false }]) {
			const v = solveRoom(WATER_MAP, o);
			check(`${JSON.stringify(o)} でも同じ最短手数（L=${v.L}）・詰まない（noEscape=${v.noEscape}）・足場を自分で沈める手が無い（${v.sinkSelf}）`,
				v.L === SHORTEST && v.noEscape === 0 && v.sinkSelf === 0);
		}
		check(`入って詰む状態が無い（厳格 noEscape=${m.noEscape}）・足場を自分で沈める手が無い（${m.sinkSelf}）`,
			m.noEscape === 0 && m.sinkSelf === 0);
		check(`対照：はしご無しでは届かない`, solveRoom(WATER_MAP, { hasLadder: false, strict: false }).L === null);
		check(`対照：弓とビームを封じる（剣だけ）と届かない`, solveRoom(WATER_MAP, { noTools: true, strict: false }).L === null);
		for (const y of BELLS) {
			check(`対照：スイッチ ${y} を壁にすると届かない（スイッチは4つとも要る）`, solveRoom(withCell(y, TILE.WALL), { strict: false }).L === null);
		}
		for (const g of PIERS) {
			check(`対照：足場 ${g} を普通の水にすると届かない（足場は5枚とも要る）`, solveRoom(withCell(g, '~'), { strict: false }).L === null);
		}
		check(`対照：開いた水門を橋脚に数えないと届かない（足場が主役）`,
			solveRoom(WATER_MAP, { strict: false, openTideBanks: false }).L === null);
		{
			const v = solveRoom(withCell(TRAP_PILLAR, '~'), { strict: false });
			check(`対照：崩れ柱 ${TRAP_PILLAR} を水にすると、はしごの途中の射ち方で詰む（緩い版 noEscape=${v.noEscape}）`, v.noEscape > 0);
		}
		{
			const v = solveRoom(withCell(DETOUR_PILLAR, '~'));
			check(`対照：崩れ柱 ${DETOUR_PILLAR} を水にすると近道ができる（L=${v.L}）`, v.L !== null && v.L < SHORTEST);
		}
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
	console.log(`# ${LAYER} ${ROOM}：北の行き止まりを「凍れる湖の射ち継ぎ」に作り替える（キュー40 第2陣）`);
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
