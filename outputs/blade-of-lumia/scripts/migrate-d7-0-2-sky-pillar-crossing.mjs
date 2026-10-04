// dungeon_7 `0,2`（西の輪の南＝`1,2` の西）：D6 の写しの部屋を「空の崩れ柱渡り」に作り替える
// （2026-10-04 / PLAN 実行キュー 39 の第3陣 2室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー39 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #....B.....#     ← 宝箱 B(2,5)＝ルピー×5（素で開く）
//      3〜8 #..........#  （行4-5 は東の口）
//      9 ############
//   `0,1`↔`0,2` は `1,1` と `1,2` をつなぐ迂回路（西の輪）。本筋ではない寄り道。
//
// ■ 新しい `0,2`＝空の崩れ柱渡り（爆弾＋はしご＝崩した柱の跡が、はしごの橋脚になる）
//      0 #####..#####     ← 北の口（列5-6）＝書き換え前と同じ
//      1 #%%%%..%%%%#
//      2 #..!x..%%%%#     ← 入門の柱 !(2,3)・穴 (2,4)＝口のすぐ脇
//      3 #.%%%.5%%%%#     ← 爆弾 5(3,6)＝×4（拾い切り）
//      4 #x%%%.......     ← 穴 (4,1)／東の口（行4-5）
//      5 #!%%x.......     ← 柱 !(5,1)／おとりの穴 (5,4)＝向こうが空
//      6 #.%%%%%%x%%#     ← おとりの穴 (6,8)＝向こうが空
//      7 #.%%%%%%%!%#     ← おとりの柱 !(7,9)＝四方が空・宝箱の真上
//      8 #.x!x.x..B%#     ← 空に浮く柱 !(8,3)＝穴2枚の中継点・宝箱 B(8,9)＝ルピー×30
//      9 ############
//   ・本土は北の口から東の口へ折れる L 字（列5-6／行4-5）＝柱を崩さなくても輪は通り抜けられる。
//     西と南は空 '%' に崩れ落ち、崩れかけの柱 '!' と穴 'x' が残る。
//   ・柱は壁に見えるが、爆弾で崩すと床になる（`game/passable.js` tilePassable が brokenWalls を見る）＝
//     **崩した跡ははしごの橋脚になる**（isLadderBank は「通行できる陸」を見る）。穴の向こうが柱なら
//     そのままでは渡れないが、崩せば渡れる。これが部屋の発見（`3,2` の柱は崩した跡に乗れなかった）。
//   ・爆風（半径2＝上下左右は2セル先・斜めは1）は、穴の手前の岸から向こう岸の柱にちょうど届く。
//   ・解き筋（最短＝北の口から）：(2,5) で爆弾 → 柱 (2,3) が崩れる → 穴 (2,4) を渡って西の島へ →
//     (3,1) で爆弾 → 柱 (5,1) → 穴 (4,1) を縦に渡って西の崖を南へ → (8,1) で爆弾 → 空に浮く柱 (8,3) →
//     穴 (8,2) と (8,4) を続けて渡る → 穴 (8,6) → 宝箱。爆弾は3個（部屋に ×4 を置く＝1個の余り）。
//   ・おとり＝宝箱は東の口から3マス下に見えるが、間は空。本土から南へ伸びる穴 (6,8) も、西へ伸びる
//     穴 (5,4) も向こうが空＝はしごを掛けられない（`2,0` の「穴と空の見分け」の再演）。宝箱の真上の柱
//     (7,9) は本土 (5,9) から空1枚越しに崩せるが、崩した跡は四方が空＝乗れない（柱跡に乗れるのは
//     穴越しのときだけ）。
//   ・敵は置かない（謎解きの部屋）。木・茂み・看板も置かない。
//
// ■ 例外（後から手に入る道具で楽になる手）
//   ・翼の羽衣は D7 では使えない（`shared/progression.js` toolsUsableIn）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／口（北・東）／敵・植生・看板が無い／宝箱の中身／breakableWalls／爆弾の床置き
//   ・厳密な状態空間（位置×崩した柱・はしごは陸→穴1枚→陸を一気に渡る）で宝箱に届く＝最短手数・爆弾3個
//   ・緩いソルバー（blade-solver＝穴の上で曲がる・穴の上で爆弾を置く手も許す）と同じ手数＝曖昧な手に頼らない
//   ・対照＝爆弾無し／はしご無し→届かない・要る柱を壁にすると届かない・要る柱を床にすると爆弾が減る・
//     おとりの柱を床にしても手数は変わらない
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-0-2-sky-pillar-crossing.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-0-2-sky-pillar-crossing.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ITEM_META } from '../shared/items.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '0,2';
const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#%%%%..%%%%#',
	'#..!x..%%%%#',
	'#.%%%.5%%%%#',
	'#x%%%.......',
	'#!%%x.......',
	'#.%%%%%%x%%#',
	'#.%%%%%%%!%#',
	'#.x!x.x..B%#',
	'############',
];
export const EXITS = ['0,5', '0,6', '4,11', '5,11'];   // 北・東の口＝書き換え前と同じ
export const PILLARS = ['2,3', '5,1', '8,3'];           // 崩す柱（崩す順）
export const DECOY_PILLAR = '7,9';                       // おとりの柱（崩しても乗れない）
export const PITS = ['2,4', '4,1', '5,4', '6,8', '8,2', '8,4', '8,6'];
export const DECOY_PITS = ['5,4', '6,8'];                // 向こうが空＝渡れない穴
export const CHEST_CELL = '8,9';
export const BOMB_CELL = '3,6';
export const BOMB_COUNT = 4;                             // 要るのは3個＋余り1個
export const CHEST_CONTENTS = { [CHEST_CELL]: { type: 'rupee', value: 30, name: 'ルピー×30' } };
export const BREAKABLE_WALLS = Object.fromEntries([...PILLARS, DECOY_PILLAR].sort().map((k) => [k, { breakDef: 1 }]));
export const FLOOR_ITEMS = { [BOMB_CELL]: { count: BOMB_COUNT } };
export const SHORTEST = 22;                             // 厳密な最短手数（宝箱の隣に立つまで）
export const MIN_BOMBS = 3;

// ── 状態空間（位置 × 崩した柱）の最短手順 ───────────────────────────────
// 規則＝歩けるのは床・爆弾の床置き・崩した柱。はしごは「陸→穴1枚→陸」を同じ軸で一気に渡る
// （穴の上では止まらない・曲がらない・道具を使わない）＝2手と数える。爆弾＝立っているセルに置き、
// 半径2の円（`game/projectile.js` blastCells）の柱を全部崩す＝1手。ゴール＝宝箱の隣に立つ。
// maxBombs で爆弾の数を縛れる（最少の爆弾数を測る）。
const DIRS = [[-1, 0, '上'], [1, 0, '下'], [0, -1, '左'], [0, 1, '右']];
export function solvePillars(t, { ladder = true, bomb = true, maxBombs = Infinity } = {}) {
	const pillars = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === TILE.BREAKABLE_WALL) pillars.push([r, c]);
	const pi = (r, c) => pillars.findIndex(([a, b]) => a === r && b === c);
	const land = (r, c, m) => {
		const ch = t[r]?.[c];
		if (ch === TILE.FLOOR || ch === TILE.ITEM_BOMB) return true;
		if (ch === TILE.BREAKABLE_WALL) return ((m >> pi(r, c)) & 1) === 1;
		return false;
	};
	const [cr, cc] = CHEST_CELL.split(',').map(Number);
	const goal = (r, c) => Math.abs(r - cr) + Math.abs(c - cc) === 1;
	const starts = EXITS.map((k) => k.split(',').map(Number)).filter(([r, c]) => land(r, c, 0));
	const seen = new Map();
	const q = [];
	for (const [r, c] of starts) { const k = `${r},${c}|0|0`; seen.set(k, null); q.push([r, c, 0, 0]); }
	// 手数は「はしご＝2」を含むので、1手と2手の遷移が混じる＝距離つきの単純な Dijkstra（盤が小さい）。
	const dist = new Map([...seen.keys()].map((k) => [k, 0]));
	while (q.length) {
		q.sort((a, b) => dist.get(`${a[0]},${a[1]}|${a[2]}|${a[3]}`) - dist.get(`${b[0]},${b[1]}|${b[2]}|${b[3]}`));
		const [r, c, m, b] = q.shift();
		const here = `${r},${c}|${m}|${b}`;
		const d = dist.get(here);
		if (goal(r, c)) {
			const steps = [];
			for (let k = here; seen.get(k); k = seen.get(k)[0]) steps.unshift(seen.get(k)[1]);
			return { L: d, bombs: b, steps };
		}
		const push = (nr, nc, nm, nb, cost, act) => {
			const k = `${nr},${nc}|${nm}|${nb}`;
			if (dist.has(k) && dist.get(k) <= d + cost) return;
			dist.set(k, d + cost); seen.set(k, [here, act]); q.push([nr, nc, nm, nb]);
		};
		for (const [dr, dc] of DIRS) {
			if (land(r + dr, c + dc, m)) push(r + dr, c + dc, m, b, 1, `歩く ${r + dr},${c + dc}`);
			else if (ladder && t[r + dr]?.[c + dc] === TILE.PIT && land(r + 2 * dr, c + 2 * dc, m)) {
				push(r + 2 * dr, c + 2 * dc, m, b, 2, `はしご ${r + dr},${c + dc}`);
			}
		}
		if (bomb && b < maxBombs) {
			let nm = m;
			pillars.forEach(([pr, pc], i) => { if ((pr - r) ** 2 + (pc - c) ** 2 <= 4) nm |= (1 << i); });
			if (nm !== m) push(r, c, nm, b + 1, 1, `爆弾 ${r},${c}`);
		}
	}
	return null;
}

// 届くのに要る爆弾の最少数（届かなければ null）
export function minBombsOf(t) {
	for (let n = 0; n <= 8; n++) if (solvePillars(t, { maxBombs: n })) return n;
	return null;
}

// ── 読み込み ─────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の着地セル
	const layerRun = () => bfsLayer(stages, START, { withLadder: true, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: true, openTiles: new Set(['T', '!', 'D', '=']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const before = room.tiles.map(rowStr);
	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	// tiles は「文字の配列の配列」で持つ（[[field-tiles-are-char-arrays]]）。
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => row.split(''));
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
		room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
		log.push(`  ${ROOM}: 宝箱 ${CHEST_CELL}＝ルピー×30（旧＝(2,5) のルピー×5・素で開く）`);
	}
	if (JSON.stringify(room.breakableWalls ?? {}) !== JSON.stringify(BREAKABLE_WALLS)) {
		room.breakableWalls = JSON.parse(JSON.stringify(BREAKABLE_WALLS));
		log.push(`  ${ROOM}: breakableWalls を ${Object.keys(BREAKABLE_WALLS).join(' ')}＝breakDef 1 にした`);
	}
	if (JSON.stringify(room.floorItems ?? {}) !== JSON.stringify(FLOOR_ITEMS)) {
		room.floorItems = JSON.parse(JSON.stringify(FLOOR_ITEMS));
		log.push(`  ${ROOM}: 爆弾の床置き ${BOMB_CELL}＝×${BOMB_COUNT}`);
	}
	room.links ??= [];
	room.bgTiles ??= {};
	room.signData ??= {};
	room.npcData ??= {};
	room.enemyDirs ??= {};
	room.showConditions ??= {};

	// ── 検証の道具 ─────────────────────────────────────────────────────
	const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
	const P = (k) => k.split(',').map(Number);
	const at = (t, k) => { const [r, c] = P(k); return t[r]?.[c]; };
	const cellsOf = (t, pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
		return out;
	};
	const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
	const set = (k, ch) => { const g = grid(); const [r, c] = P(k); g[r][c] = ch; return g; };

	// ── ① 盤面とデータ ────────────────────────────────────────────────
	const t = grid();
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) { edge.push(`0,${c}`, `9,${c}`); }
		for (let r = 1; r < ROWS - 1; r++) { edge.push(`${r},0`, `${r},11`); }
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
		check(`画面の縁で開いているのは北・東の口だけ（実測 ${open.join(' ')}）`, same(open, EXITS));
	}
	check(`敵が居ない（謎解きの部屋）`, cellsOf(t, (ch) => !!ENEMY_META[ch]).length === 0);
	check(`植生・看板・スイッチ・石・門・かがり火が無い`,
		cellsOf(t, (ch) => [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH, TILE.STONE, TILE.GATE, TILE.TORCH].includes(ch)).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`壊せる柱は ${[...PILLARS, DECOY_PILLAR].join(' ')} の4本・どれも breakDef 1（爆弾の破壊力 ${ITEM_META.bomb.breakPower} で崩れる）`,
		same(cellsOf(t, (ch) => ch === TILE.BREAKABLE_WALL), [...PILLARS, DECOY_PILLAR])
		&& JSON.stringify(room.breakableWalls) === JSON.stringify(BREAKABLE_WALLS));
	check(`穴は ${PITS.join(' ')} の7枚`, same(cellsOf(t, (ch) => ch === TILE.PIT), PITS));
	check(`宝箱 B は ${CHEST_CELL} の1枚・中身＝ルピー×30・封印なし（見えているのに届かない）`,
		same(cellsOf(t, (ch) => ch === TILE.CHEST), [CHEST_CELL])
		&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS)
		&& Object.keys(room.showConditions).length === 0);
	check(`爆弾の床置きは本土の ${BOMB_CELL}＝×${BOMB_COUNT}（要る数 ${MIN_BOMBS}＋余り1）`,
		same(cellsOf(t, (ch) => ch === TILE.ITEM_BOMB), [BOMB_CELL])
		&& JSON.stringify(room.floorItems) === JSON.stringify(FLOOR_ITEMS) && BOMB_COUNT === MIN_BOMBS + 1);
	check(`links・bgTiles が空`, room.links.length === 0 && Object.keys(room.bgTiles).length === 0);

	// ── ② おとり＝向こうが空の穴・四方が空の柱 ───────────────────────────
	for (const k of DECOY_PITS) {
		const [r, c] = P(k);
		const across = [[r - 1, c, r + 1, c], [r, c - 1, r, c + 1]].filter(([a, b, d, e]) =>
			[TILE.FLOOR, TILE.BREAKABLE_WALL].includes(t[a][b]) && [TILE.FLOOR, TILE.BREAKABLE_WALL].includes(t[d][e]));
		check(`おとりの穴 ${k} はどちらの軸も片側が空か壁＝はしごを掛けられない`, across.length === 0);
	}
	{
		const [r, c] = P(DECOY_PILLAR);
		const around = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => t[a][b]);
		check(`おとりの柱 ${DECOY_PILLAR} の四方は空と宝箱だけ（崩しても乗れない）`,
			around.every((ch) => ch === TILE.SKY || ch === TILE.CHEST));
	}

	// ── ③ 状態空間＝宝箱に届く・爆弾とはしごが要る ─────────────────────────
	const sol = solvePillars(t);
	console.log(`\n## 解き筋（厳密）\n  ${sol?.steps.join(' → ')}`);
	check(`厳密な状態空間で宝箱の隣に届く（${sol ? sol.L : '解なし'} 手＝想定 ${SHORTEST}・爆弾 ${sol?.bombs} 個）`, sol?.L === SHORTEST);
	check(`要る爆弾の最少数が ${MIN_BOMBS}（実測 ${minBombsOf(t)}）`, minBombsOf(t) === MIN_BOMBS);
	check(`対照：爆弾無しでは届かない`, solvePillars(t, { bomb: false }) === null);
	check(`対照：はしご無しでは届かない`, solvePillars(t, { ladder: false }) === null);
	for (const k of PILLARS) {
		check(`対照：柱 ${k} を壁にすると届かない（どの柱も要る）`, solvePillars(set(k, TILE.WALL)) === null);
		check(`対照：柱 ${k} を床にすると爆弾が減る（${minBombsOf(set(k, TILE.FLOOR))} 個）`, minBombsOf(set(k, TILE.FLOOR)) === MIN_BOMBS - 1);
	}
	check(`対照：おとりの柱 ${DECOY_PILLAR} を床にしても手数は変わらない（近道にならない）`, solvePillars(set(DECOY_PILLAR, TILE.FLOOR))?.L === SHORTEST);

	// ── ④ 緩いソルバー（blade-solver）でも同じ手数・詰まない ─────────────────
	{
		const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
		const [cr, cc] = P(CHEST_CELL);
		const breakDefs = Object.fromEntries(Object.entries(BREAKABLE_WALLS).map(([k, v]) => [k, v.breakDef]));
		const solve = (tt, opts) => {
			const S = makeSolver(tt, bg, [], breakDefs, new Set(), { hasLadder: true, pitCrossable: true, ...opts });
			const starts = EXITS.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
			return measureMetrics(S, starts, (st) => st.split('|')[0] === `${cr},${cc}`, () => 0,
				{ guardMax: 2_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
		};
		const m = solve(t, {});
		// 緩いソルバーは宝箱のセルに乗るまで数える＝厳密（隣に立つまで）＋1
		check(`緩いソルバー（穴の上で曲がる・置く手も許す）でも同じ手数（${m.L}＝${SHORTEST}＋1）`, m.L === SHORTEST + 1);
		check(`入って詰む状態が無い（実測 noEscape=${m.noEscape}）`, m.noEscape === 0);
		check(`対照（緩い）：道具封じでは届かない`, solve(t, { noTools: true }).L === null);
	}

	// ── ⑤ 層の到達性は不変 ─────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
			same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(open.reachedRooms, baseOpen.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ───────────────────────────────────────────────────────────
	console.log(`\n# ${LAYER} ${ROOM}：西の輪の南を「空の崩れ柱渡り」に作り替える（キュー39 第3陣）`);
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

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
