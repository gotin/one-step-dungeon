// dungeon_7 `2,0`（北の行き止まり）：D6 の写しの部屋を「空の飛び石」に作り替える
// （2026-10-03 / PLAN 実行キュー 39 の第2陣 1室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー39 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #....B.....#     ← 宝箱 B＝ルピー×10（素で開く）
//      3〜8 #..........#
//      9 #####..#####     ← 口は南だけ（`2,1`「空の十字橋」の北の腕へ）
//   `dungeon_6 2,0` と同型＝四角い広間に宝箱が1つあるだけ。
//
// ■ 新しい `2,0`＝空の飛び石（穴 `x` と空 `%` の見分け＋はしごの再演＝D7 の主題「穴の空」）
//      0 ############
//      1 #%%%..%%%%%#
//      2 #%%%.B.x..%#     ← 宝箱 B(2,5)＝ルピー×20・穴 (2,7)＝4つ目の渡り
//      3 #%%%%%%%%.%#     ← (3,5)＝宝箱の真下の空＝1枚なのに渡れない（おとり）
//      4 #..x..%%%.%#     ← 穴 (4,3)＝2つ目の渡り
//      5 #.%%%.x...%#     ← 穴 (5,6)＝3つ目の渡り
//      6 #.%%%%%%%%%#
//      7 #..x....%%%#     ← 穴 (7,3)＝1つ目の渡り・(6,7) の空もおとり
//      8 #%%%%..%%%%#
//      9 #####..#####
//   ・床の大半が空へ崩れ落ち、飛び石の床が残った。飛び石どうしの切れ目は2種類＝
//     穴 `x`（はしごで1マスだけ渡れる）と空 `%`（何があっても渡れない）。
//   ・宝箱は入ってすぐ見える北の小島。真下の (4,5) からは空1枚で隔てただけ＝近いのに渡れない。
//     正しい道は穴を4つ渡って西→北→東→北と回り込む（はしごの渡りは毎回自動）。
//   ・穴はどれも幅1で、渡る向きの両側が床（`game/passable.js isLadderBridge`）。
//     空の1枚の切れ目（おとり）は (3,5)・(6,7)・(3,4) の3か所＝穴と同じ幅なのに渡れない。
//   ・行き止まりの部屋∴敵は置かない（謎解きの部屋）。木・茂み・看板は無い。
//
// ■ 例外（後から手に入る道具で楽になる手）
//   ・翼の羽衣は D7 では使えない（`shared/progression.js` toolsUsableIn）＝空を飛んで宝箱へ直行する手は
//     一周目には無い。
//   ・はしごが無いと宝箱には届かない（はしごは D5 で手に入る＝D7 の時点で必ず持っている）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／口は南だけ／縁で開いているのは口だけ／敵・植生・石・看板・門・座が無い／宝箱の中身
//   ・はしご無しでは宝箱に届かない・はしごがあれば届く・最短で穴を4つ渡る
//   ・対照＝おとりの空 (3,5) を穴にすると渡りが減る（空1枚が道を延ばしている証明）／
//     1つ目の穴 (7,3) を壁にすると届かない（潰すのは必ず '#'＝[[blade-control-experiment-needs-tile-wall]]）
//   ・取り残された床が無い（はしごを使えば全部の床に立てる）
//   ・ソルバー（はしご・pitCrossable＝tiles 層の穴を渡る）で宝箱の床に届く・入って詰む状態が無い・道具封じでは届かない
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-2-0-sky-stepping-stones.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-2-0-sky-stepping-stones.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED, LADDER_OVER } from './lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '2,0';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
const TARGET = [
	'############',
	'#%%%..%%%%%#',
	'#%%%.B.x..%#',
	'#%%%%%%%%.%#',
	'#..x..%%%.%#',
	'#.%%%.x...%#',
	'#.%%%%%%%%%#',
	'#..x....%%%#',
	'#%%%%..%%%%#',
	'#####..#####',
];
const EXITS = ['9,5', '9,6'];                  // 口は南だけ＝書き換え前と同じ
const CHEST_CELL = '2,5';
const PITS   = ['7,3', '4,3', '5,6', '2,7'];   // 渡る順
const DECOYS = ['3,5', '6,7', '3,4'];          // 穴と同じ幅1なのに空＝渡れない切れ目
const CHEST_CONTENTS = { [CHEST_CELL]: { type: 'rupee', value: 20, name: 'ルピー×20' } };

// ── 読み込み ─────────────────────────────────────────────────────────
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

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ── 書き換え ─────────────────────────────────────────────────────────
// tiles は「文字の配列の配列」で持つ（[[field-tiles-are-char-arrays]]）。
if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
	room.tiles = TARGET.map((row) => row.split(''));
	log.push(`  ${ROOM}: 盤面を差し替えた`);
}
if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
	log.push(`  ${ROOM}: 宝箱 ${CHEST_CELL}＝ルピー×20`);
}
room.links ??= [];
room.bgTiles ??= {};
room.signData ??= {};
room.npcData ??= {};
room.floorItems ??= {};
room.enemyDirs ??= {};
room.showConditions ??= {};
room.breakableWalls ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
const at = (t, k) => { const [r, c] = P(k); return t[r]?.[c]; };
const cellsOf = (t, pred) => {
	const out = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
	return out;
};
// 口から歩けるセルと、そこへ着くまでに渡った穴の最少数（0-1 BFS）。
// withLadder なら幅 1 の穴/水を、進む向きの先が地上のときだけ 1 マス渡れる
// ＝エンジンの進入軸の橋（`game/passable.js isLadderBridge`）と同じ。
function reach(t, { withLadder = false } = {}) {
	const blocked = (r, c) => BLOCKED.has(t[r][c]);
	const cost = new Map();
	const dq = [];
	for (const k of EXITS) { const [r, c] = P(k); if (!blocked(r, c)) { cost.set(k, 0); dq.push(k); } }
	while (dq.length) {
		const k = dq.shift();
		const [r, c] = P(k);
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc)) continue;
			if (!blocked(nr, nc)) {
				const nCost = cost.get(k);
				if (!cost.has(nk) || cost.get(nk) > nCost) { cost.set(nk, nCost); dq.unshift(nk); }
				continue;
			}
			// はしご：穴の上に立ち、その先の地上へ渡る（穴の上の位置は「渡り中」なので記録しない）
			const fr = nr + dr, fc = nc + dc, fk = `${fr},${fc}`;
			if (withLadder && LADDER_OVER.has(t[nr][nc]) && inside(fr, fc) && !blocked(fr, fc)) {
				const nCost = cost.get(k) + 1;
				if (!cost.has(fk) || cost.get(fk) > nCost) { cost.set(fk, nCost); dq.push(fk); }
			}
		}
	}
	return cost;
}

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
	room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
check(`南の口（${EXITS.join(' ')}）が開いている`, EXITS.every((k) => at(t, k) === TILE.FLOOR));
{
	const edge = [];
	for (let c = 0; c < COLS; c++) { edge.push(`0,${c}`, `9,${c}`); }
	for (let r = 1; r < ROWS - 1; r++) { edge.push(`${r},0`, `${r},11`); }
	const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
	check(`画面の縁で開いているのは南の口だけ（実測 ${open.join(' ')}）`, JSON.stringify(open) === JSON.stringify([...EXITS].sort()));
}
check(`敵が居ない（謎解きの部屋）`, cellsOf(t, (ch) => !!ENEMY_META[ch]).length === 0);
check(`石・植生・看板・門・座・かがり火・壊せる壁が無い`,
	cellsOf(t, (ch) => [TILE.STONE, TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.TORCH, TILE.BREAKABLE_WALL].includes(ch)).length === 0
	&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
check(`宝箱 B は ${CHEST_CELL} の1枚・中身＝ルピー×20`,
	JSON.stringify(cellsOf(t, (ch) => ch === TILE.CHEST)) === JSON.stringify([CHEST_CELL])
	&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
check(`links・showConditions・breakableWalls・floorItems・bgTiles が空`,
	room.links.length === 0 && Object.keys(room.showConditions).length === 0
	&& Object.keys(room.breakableWalls).length === 0 && Object.keys(room.floorItems).length === 0
	&& Object.keys(room.bgTiles).length === 0);
check(`穴は ${PITS.join(' ')} の4枚だけ`,
	JSON.stringify(cellsOf(t, (ch) => ch === TILE.PIT).sort()) === JSON.stringify([...PITS].sort()));
check(`おとり ${DECOYS.join(' ')} は空`, DECOYS.every((k) => at(t, k) === TILE.SKY));

// ── ② はしごと飛び石 ────────────────────────────────────────────────
{
	const foot = reach(t);
	const ladder = reach(t, { withLadder: true });
	check(`はしご無しでは宝箱に届かない（歩ける ${foot.size} マス）`, !foot.has(CHEST_CELL));
	check(`はしごがあれば宝箱に届き、渡る穴は最少で4つ（実測 ${ladder.get(CHEST_CELL)}）`, ladder.get(CHEST_CELL) === 4);
	// 穴のどれも「渡る向きの両側が床」＝渡れる（向きの読み違いで渡れない穴を作っていない）
	for (const k of PITS) {
		const [r, c] = P(k);
		const h = !BLOCKED.has(t[r][c - 1]) && !BLOCKED.has(t[r][c + 1]);
		const v = !BLOCKED.has(t[r - 1][c]) && !BLOCKED.has(t[r + 1][c]);
		check(`穴 ${k} は渡る向きの両側が床（横 ${h}／縦 ${v}・どちらか1つだけ）`, h !== v);
	}
	// 取り残された床が無い（はしごを使えば全部の床に立てる）
	const floors = cellsOf(t, (ch) => ch === TILE.FLOOR || ch === TILE.CHEST);
	check(`床のどのセルにも、はしごを使えば立てる（${floors.length} マス）`, floors.every((k) => ladder.has(k)));
	check(`はしごは空を渡れない（前提）`, !LADDER_OVER.has(TILE.SKY));
	// 対照①＝宝箱の真下のおとり (3,5) を穴にすると、渡りが減る（空の1枚が道を延ばしている証明）
	const fill = grid(); fill[3][5] = TILE.PIT;
	const fillCost = reach(fill, { withLadder: true }).get(CHEST_CELL);
	check(`対照：おとり (3,5) を穴にすると渡りが減る（4 → ${fillCost}）`, fillCost < 4);
	// 対照②＝1つ目の穴を壁にすると届かない（必ず '#' で潰す）
	const wall = grid(); wall[7][3] = TILE.WALL;
	check(`対照：1つ目の穴 (7,3) を壁にすると宝箱に届かない`, !reach(wall, { withLadder: true }).has(CHEST_CELL));
}

// ── ③ ソルバー（状態空間）＝宝箱の床に届く・詰まない ─────────────────
{
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const [cr, cc] = P(CHEST_CELL);
	const solve = (opts) => {
		const S = makeSolver(t, bg, [], {}, new Set(), { hasLadder: true, pitCrossable: true, ...opts });
		const starts = EXITS.map((cell) => {
			const [r, c] = P(cell);
			return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
		});
		const m = measureMetrics(S, starts, (st) => st.split('|')[0] === `${cr},${cc}`, () => 0,
			{ guardMax: 2_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
		return m;
	};
	const m = solve({});
	check(`ソルバー（はしご）で宝箱の床に届く（L=${m.L}）`, m.L !== null);
	check(`入って詰む状態が無い（実測 noEscape=${m.noEscape}）`, m.noEscape === 0);
	check(`対照：道具封じ（はしご無し）では宝箱に届かない`, solve({ noTools: true, hasLadder: false }).L === null);
}

// ── ④ 層の到達性は不変 ───────────────────────────────────────────────
{
	const closed = layerRun();
	const open = layerRunOpen();
	const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
	check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
		same(closed.reachedRooms, baseClosed.reachedRooms));
	check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
		same(open.reachedRooms, baseOpen.reachedRooms));
	check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：北の行き止まりを「空の飛び石」に作り替える（キュー39 第2陣）`);
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
