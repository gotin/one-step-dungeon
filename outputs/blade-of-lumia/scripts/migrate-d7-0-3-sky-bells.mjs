// dungeon_7 `0,3`（入口 `1,3` の西の行き止まり）：D6 の写しの部屋を「空の二色回廊」に作り替える
// （2026-10-03 / PLAN 実行キュー 39 の第2陣 2室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー39 の着手時の実測）
//      0 ############
//      1〜3 #..........#
//      4 #...........     ← 口は東だけ（行4-5＝入口 `1,3` の西の口へ）
//      5 #...........
//      6〜8 #..........#
//      9 ############
//   四角い広間に、拾えない床の落とし物 `{type:'rupee',count:5}`（4,5）があるだけ（PLAN 0ac の観測＝死んだ floorItems）。
//
// ■ 新しい `0,3`＝空の二色回廊（弓の卒業試験の再演＝空に浮く色の座を射て、回廊を一方通行で一周する）
//      0 ############
//      1 #B......(..#     ← 宝箱 B(1,1)＝ルピー×30・北の回廊の赤門 (1,8)＝帰り道
//      2 #..%%%%%%..#
//      3 #.%%%%%%%%.#
//      4 #(%%%%%%%%..     ← 西の回廊の赤門 (4,1)
//      5 #.%%[%%#%%..     ← 赤の座 (5,4)・柱の残骸 (5,7)
//      6 #.%%#%]%%%.#     ← 青の座 (6,6)・柱の残骸 (6,4)
//      7 #..%%%%%%..#
//      8 #........).#     ← 南の回廊の青門 (8,9)＝行き道
//      9 ############
//   ・広間の真ん中が空 '%' に抜け落ち、縁が回廊として一周する。回廊は門3枚で区切られる＝
//     東（入口）／南〜西（青門の内側）／北（赤門の内側）。宝箱は北西の角。
//   ・色の座 '['（赤）/']'（青）は空の中に浮く＝隣に立てない∴剣では叩けず、矢か剣ビームでしか当たらない。
//     色は「セット」（D8 二色の鐘と同じ規則）＝赤にすると赤門が開き青門が閉じる。最初は両方閉。
//   ・東（入口）から見える座は青だけ（(6,10) から西へ）。赤の座 (5,4) は入口の行5 に乗っているが、
//     柱の残骸 (5,7) が射線を遮る（おとり）。
//   ・解き方（一方通行の一周）：入口で青を射る → 青門 (8,9) を抜けて南の回廊を西へ → 西の回廊の (5,1)
//     から東へ赤を射る（青門が背後で閉じる）→ 赤門 (4,1) を抜けて北西の宝箱 → 北の回廊の赤門 (1,8) を
//     抜けて入口へ戻る。赤の座は西の回廊と北の回廊からしか射線が無い（南の (8,4) は柱 (6,4) が遮る）。
//   ・赤さえ開けば北の回廊から歩いて宝箱へ届く＝謎の本体は「赤を射る立ち位置へ、青で回り込む」こと。
//     ∴「赤だけでは届かない」は不変条件にしない（座を壁にする対照2つで、両方の座が要ることを縛る）。
//   ・赤と青の座は同じ行・列に無い＝貫通する剣ビームで1発で両方を鳴らせない（D8 と同じ注意）。
//   ・行き止まりの謎の部屋∴敵は置かない。木・茂み・看板は無い。死んだ床の落とし物は消す。
//   ・笛の効果（fluteEffect）も初期色（initActiveColor）も持たせない＝笛の石戻しは色も null に戻すため。
//
// ■ 例外（後から手に入る道具で楽になる手）
//   ・翼の羽衣は D7 では使えない（`shared/progression.js` toolsUsableIn）。
//   ・弓は D3 で手に入る＝D7 の時点で必ず持っている。剣ビーム（剣ティア）でも同じ座を鳴らせる。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／口は東だけ／縁で開いているのは口だけ／敵・植生・石・看板・T 門・Y 座が無い／宝箱の中身／死んだ落とし物が無い
//   ・座の四方に歩ける床が無い（剣で叩けない）・赤と青の座が同じ行・列に無い
//   ・門を閉じたままでは宝箱に届かない／青だけ・赤だけでも届かない（両方の色を渡り歩く）
//   ・射線＝門を閉じたまま立てるセルからは青しか射れない（赤は柱のおとり）／西の回廊 (5,1) から赤を射れる
//   ・対照＝柱 (5,7) を空にすると入口から赤を射れる（おとりの判定が空虚でない）
//   ・ソルバー（矢・色ゲート）で宝箱の隣に届く・入って詰む状態が無い・道具封じ（剣だけ）では届かない
//   ・対照＝青の座を壁にすると届かない（座が飾りでない）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-0-3-sky-bells.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-0-3-sky-bells.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '0,3';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
const TARGET = [
	'############',
	'#B......(..#',
	'#..%%%%%%..#',
	'#.%%%%%%%%.#',
	'#(%%%%%%%%..',
	'#.%%[%%#%%..',
	'#.%%#%]%%%.#',
	'#..%%%%%%..#',
	'#........).#',
	'############',
];
const EXITS = ['4,11', '5,11'];                // 口は東だけ＝書き換え前と同じ
const CHEST_CELL = '1,1';
const RED_SEAT = '5,4', BLUE_SEAT = '6,6';
const RED_GATES = ['1,8', '4,1'], BLUE_GATES = ['8,9'];
const PILLARS = ['5,7', '6,4'];                // 射線を遮る柱の残骸
const RED_SHOOTER = '5,1';                     // 解き筋で赤を射る立ち位置（西の回廊）
const CHEST_CONTENTS = { [CHEST_CELL]: { type: 'rupee', value: 30, name: 'ルピー×30' } };

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
	log.push(`  ${ROOM}: 宝箱 ${CHEST_CELL}＝ルピー×30`);
}
if (Object.keys(room.floorItems ?? {}).length) {
	log.push(`  ${ROOM}: 拾えない床の落とし物を消した（${JSON.stringify(room.floorItems)}）`);
	room.floorItems = {};
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
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
// 口から歩けるセル（色ゲートは openColors に入れた色だけ通す。座は立てる床として数えない＝空の中）。
function walkable(t, openColors = []) {
	const ok = (r, c) => {
		const ch = t[r][c];
		if (ch === TILE.GATE_RED) return openColors.includes('red');
		if (ch === TILE.GATE_BLUE) return openColors.includes('blue');
		if (ch === TILE.SWITCH_RED || ch === TILE.SWITCH_BLUE) return true;
		return !HARD_BLOCKED.has(ch);
	};
	const seen = new Set(), q = [];
	for (const k of EXITS) { const [r, c] = P(k); if (ok(r, c)) { seen.add(k); q.push([r, c]); } }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
// cell を直線で射抜ける立ち位置（壁と未破壊の '!' で止まる＝`game/projectile.js isTilePassableForProj`）。
function shootersOf(t, walk, cell) {
	const [r0, c0] = P(cell), out = [];
	for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
		for (let r = r0 + dr, c = c0 + dc; inside(r, c); r += dr, c += dc) {
			if (t[r][c] === TILE.WALL || t[r][c] === TILE.BREAKABLE_WALL) break;
			if (walk.has(`${r},${c}`)) out.push(`${r},${c}`);
		}
	}
	return out.sort();
}
const nextTo = (k) => { const [r, c] = P(k); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
	room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
check(`東の口（${EXITS.join(' ')}）が開いている`, EXITS.every((k) => at(t, k) === TILE.FLOOR));
{
	const edge = [];
	for (let c = 0; c < COLS; c++) { edge.push(`0,${c}`, `9,${c}`); }
	for (let r = 1; r < ROWS - 1; r++) { edge.push(`${r},0`, `${r},11`); }
	const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
	check(`画面の縁で開いているのは東の口だけ（実測 ${open.join(' ')}）`, same(open, EXITS));
}
check(`敵が居ない（謎解きの部屋）`, cellsOf(t, (ch) => !!ENEMY_META[ch]).length === 0);
check(`石・植生・看板・T 門・Y 座・ボタン・かがり火・壊せる壁・穴が無い`,
	cellsOf(t, (ch) => [TILE.STONE, TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.TORCH, TILE.BREAKABLE_WALL, TILE.PIT].includes(ch)).length === 0
	&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
check(`宝箱 B は ${CHEST_CELL} の1枚・中身＝ルピー×30`,
	same(cellsOf(t, (ch) => ch === TILE.CHEST), [CHEST_CELL])
	&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
check(`赤の座は ${RED_SEAT}・青の座は ${BLUE_SEAT} の1枚ずつ`,
	same(cellsOf(t, (ch) => ch === TILE.SWITCH_RED), [RED_SEAT]) && same(cellsOf(t, (ch) => ch === TILE.SWITCH_BLUE), [BLUE_SEAT]));
check(`赤門は ${RED_GATES.join(' ')}・青門は ${BLUE_GATES.join(' ')}`,
	same(cellsOf(t, (ch) => ch === TILE.GATE_RED), RED_GATES) && same(cellsOf(t, (ch) => ch === TILE.GATE_BLUE), BLUE_GATES));
check(`柱の残骸 ${PILLARS.join(' ')} が壁`, PILLARS.every((k) => at(t, k) === TILE.WALL));
check(`links・showConditions・breakableWalls・floorItems・bgTiles が空`,
	room.links.length === 0 && Object.keys(room.showConditions).length === 0
	&& Object.keys(room.breakableWalls).length === 0 && Object.keys(room.floorItems).length === 0
	&& Object.keys(room.bgTiles).length === 0);
check(`笛の効果・初期色を持たない（笛の石戻しは色も null に戻す）`,
	(room.fluteEffect ?? null) === null && (room.initActiveColor ?? null) === null);

// ── ② 色の座と射線 ──────────────────────────────────────────────────
{
	const all = walkable(t, ['red', 'blue']);
	for (const seat of [RED_SEAT, BLUE_SEAT]) {
		check(`座 ${seat} の四方に歩ける床が無い（剣で叩けない）`, nextTo(seat).every((k) => !all.has(k) || at(t, k) === TILE.SWITCH_RED || at(t, k) === TILE.SWITCH_BLUE));
	}
	const [rr, rc] = P(RED_SEAT), [br, bc] = P(BLUE_SEAT);
	check(`赤と青の座が同じ行・列に無い（貫通する剣ビームで両方を鳴らせない）`, rr !== br && rc !== bc);

	const closed = walkable(t);
	check(`門を閉じたままでは宝箱に届かない`, !nextTo(CHEST_CELL).some((k) => closed.has(k)));
	check(`青だけ開けても宝箱に届かない`, !nextTo(CHEST_CELL).some((k) => walkable(t, ['blue']).has(k)));
	// 赤だけ開けば北の回廊から歩いて届く＝謎の本体は「赤を射る立ち位置へ、青で行く」こと（③の対照で縛る）
	check(`赤を開ければ届く（北の回廊）`, nextTo(CHEST_CELL).some((k) => walkable(t, ['red']).has(k)));

	const redFromEntry = shootersOf(t, closed, RED_SEAT);
	const blueFromEntry = shootersOf(t, closed, BLUE_SEAT);
	check(`入口側（門を閉じたまま）から赤は射れない（実測 ${redFromEntry.join(' ') || 'なし'}）`, redFromEntry.length === 0);
	check(`入口側から青は射れる（実測 ${blueFromEntry.join(' ')}）`, blueFromEntry.length > 0);
	const blueSide = walkable(t, ['blue']);
	check(`青門の内側（西の回廊 ${RED_SHOOTER}）から赤を射れる`, blueSide.has(RED_SHOOTER) && shootersOf(t, blueSide, RED_SEAT).includes(RED_SHOOTER));
	// 対照＝柱 (5,7) を空にすると入口の行5 から赤が見える（おとりの判定が空虚でない）
	const open57 = grid(); open57[5][7] = TILE.SKY;
	check(`対照：柱 (5,7) を空にすると入口側から赤を射れる`, shootersOf(open57, walkable(open57), RED_SEAT).length > 0);
}

// ── ③ ソルバー（状態空間）＝宝箱の隣に届く・詰まない ─────────────────
{
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const goals = new Set(nextTo(CHEST_CELL));
	const solve = (tt, opts) => {
		const S = makeSolver(tt, bg, [], {}, new Set(), { hasLadder: true, pitCrossable: true, ...opts });
		const starts = EXITS.map((cell) => {
			const [r, c] = P(cell);
			return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
		});
		return measureMetrics(S, starts, (st) => goals.has(st.split('|')[0]), () => 0,
			{ guardMax: 2_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
	};
	const m = solve(t, {});
	check(`ソルバー（矢・色ゲート）で宝箱の隣に届く（L=${m.L}）`, m.L !== null);
	check(`入って詰む状態が無い（実測 noEscape=${m.noEscape}）`, m.noEscape === 0);
	check(`対照：道具封じ（剣で隣を叩くだけ）では宝箱に届かない`, solve(t, { noTools: true }).L === null);
	const noBlue = grid(); { const [r, c] = P(BLUE_SEAT); noBlue[r][c] = TILE.WALL; }
	check(`対照：青の座を壁にすると届かない（座が飾りでない）`, solve(noBlue, {}).L === null);
	const noRed = grid(); { const [r, c] = P(RED_SEAT); noRed[r][c] = TILE.WALL; }
	check(`対照：赤の座を壁にすると届かない`, solve(noRed, {}).L === null);
}

// ── ④ 層の到達性は不変 ───────────────────────────────────────────────
{
	const closed = layerRun();
	const open = layerRunOpen();
	check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
		same(closed.reachedRooms, baseClosed.reachedRooms));
	check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
		same(open.reachedRooms, baseOpen.reachedRooms));
	check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：西の行き止まりを「空の二色回廊」に作り替える（キュー39 第2陣）`);
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
