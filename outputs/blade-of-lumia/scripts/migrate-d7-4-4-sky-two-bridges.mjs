// dungeon_7 `4,4`（`3,4` の東の行き止まり＝D7 で一番奥の部屋）：D6 の写しの部屋を「空の二つの渡り」に作り替える
// （2026-10-04 / PLAN 実行キュー 39 の第2陣 4室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー39 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #....B....t#     ← 宝箱 B(2,5)＝ルピー×5（素で開く）・森の木 t(2,10)
//      3 #..........#
//      4 ...........#     ← 口は西だけ（行4-5＝`3,4` の東の口へ）
//      5 ...........#
//      6 #.........u#     ← 茂み u(6,10)
//      7〜8 #..........#
//      9 ############
//
// ■ 新しい `4,4`＝空の二つの渡り（弓の卒業試験の再演＋石＝色の座を射る場所が「向こう岸」にしかない）
//      0 ############
//      1 #....%%%.TB#     ← 宝箱 B(1,10)＝ルピー×50・門 T(1,9)
//      2 #..*%%%%.%%#     ← 石 *(2,3)／東岸の北の袋 (1,8)〜(2,8)＝宝箱への道
//      3 #.....(....#     ← 北の渡り（赤門 (3,6)）
//      4 .....%%%...#
//      5 .....)..S..#     ← 南の渡り（青門 (5,5)）・ボタン S(5,8)
//      6 #..%%%%%...#
//      7 #%%%%[%%...#     ← 赤の座 [(7,5)＝空に浮く
//      8 #%%%%%]%...#     ← 青の座 ](8,6)＝空に浮く（東岸の (8,7) とだけ接する）
//      9 ############
//   ・中央を空の谷が南北に走り、渡りは2本＝北（赤門）と南（青門）。東岸のボタンに石が乗ると門 T が開く
//     （`game/conditions.js refreshGates` ①＝全ボタンに石が乗るとロック＝開いたまま）。
//   ・赤の座は北の渡りの西半分 (3,5) から真下に射れる（谷越し・青門の上を矢が抜ける）。
//     青の座は**東岸からしか鳴らせない**＝南の渡りの東半分 (5,6) から真下／(8,7) から剣・矢。
//     北の渡りの赤門の中 (3,6) からも青の座へ射線は通るが、閉じる側の門（赤）に立っているので不発
//     （`game/player.js setActiveColor`＝switchDenied の音）。
//   ・謎の本体＝**石は見えている北の渡りでは運べない**。赤門を抜けて東岸 (3,8) まで押すと、宝箱へ続く
//     北の袋 (2,8) の入口を石が自分で塞ぎ、ボタン (5,8) へ押し下ろす立ち位置が無くなる。∴先に人だけが
//     北の渡り（赤）で向こう岸へ渡り、南の渡りから青を射て青門を開けておき、戻って石を南の渡りで運ぶ。
//   ・解き筋（最短 45 手）：石を南へ (5,3) まで押し下ろす → (3,5) から赤 → 北の渡りで東岸へ → 南の渡りの
//     (5,6) から青 → 南の渡りを西へ戻る（赤門は閉じている）→ 石を東へ押して青門を抜け (5,8) のボタンへ
//     （門 T が開く）→ 西岸へ戻って (3,5) から赤 → 北の渡りから北の袋へ上がり宝箱。
//   ・行き止まりの謎の部屋∴敵は置かない。木・茂み・看板は無い（空中の遺跡に森の木を残さない）。
//   ・宝箱はルピー×50＝D7 で一番奥の部屋（第2陣の他の宝箱＝`2,0` ×20／`0,3` ×30／`1,4` 回復薬（大））。
//
// ■ 例外（後から手に入る道具で楽になる手）
//   ・翼の羽衣は D7 では使えない（`shared/progression.js` toolsUsableIn）。
//   ・色の座は D8 `3,0`「二色の鐘」で習う語彙（D7 は D8 の後）。`0,3` でも再演済み。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／口は西だけ／敵・植生・看板が無い／宝箱の中身／石・ボタン・門・座の位置
//   ・座は剣で叩けない（赤）・西岸から青を射れない・赤と青の座が同じ行・列に無い（剣ビームの貫通）
//   ・ソルバーで宝箱の隣に届く（45 手）・入って詰む状態が無い
//   ・対照＝道具封じ／石を押さない／座を1つ壁にする→届かない・青門を壁にする→届かない（北の渡りでは
//     石を運べない）・門を床にすると手数が減る（どちらの門も効いている）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-4-4-sky-two-bridges.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-4-4-sky-two-bridges.mjs         # 書き込み

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
const ROOM  = '4,4';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#....%%%.TB#',
	'#..*%%%%.%%#',
	'#.....(....#',
	'.....%%%...#',
	'.....)..S..#',
	'#..%%%%%...#',
	'#%%%%[%%...#',
	'#%%%%%]%...#',
	'############',
];
export const EXITS = ['4,0', '5,0'];          // 口は西だけ＝書き換え前と同じ
export const CHEST_CELL = '1,10';
export const GATE_CELL = '1,9';
export const BUTTON_CELL = '5,8';
export const STONE_CELL = '2,3';
export const RED_GATE = '3,6';
export const BLUE_GATE = '5,5';
export const RED_SEAT = '7,5';
export const BLUE_SEAT = '8,6';
export const CHEST_CONTENTS = { [CHEST_CELL]: { type: 'rupee', value: 50, name: 'ルピー×50' } };
export const SHORTEST = 45;

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
	log.push(`  ${ROOM}: 宝箱 ${CHEST_CELL}＝ルピー×50（旧＝(2,5) のルピー×5）`);
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
const P = (k) => k.split(',').map(Number);
const at = (t, k) => { const [r, c] = P(k); return t[r]?.[c]; };
const cellsOf = (t, pred) => {
	const out = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
	return out;
};
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const nextTo = (k) => { const [r, c] = P(k); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };

export function solveRoom(t, opts = {}) {
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const goals = new Set(nextTo(CHEST_CELL));
	const S = makeSolver(t, bg, [], {}, new Set(), { hasLadder: true, pitCrossable: true, ...opts });
	const starts = EXITS.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	return measureMetrics(S, starts, (st) => goals.has(st.split('|')[0]), () => 0,
		{ guardMax: 2_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
}

// 門を閉じたまま（色なし）歩ける床（石は壁扱い）。color＝'red'|'blue' でその色の門を開ける。
function walkable(t, color = null) {
	const open = new Set([TILE.FLOOR, TILE.BUTTON]);
	if (color === 'red') open.add(TILE.GATE_RED);
	if (color === 'blue') open.add(TILE.GATE_BLUE);
	const seen = new Set();
	const q = EXITS.filter((k) => open.has(at(t, k)));
	q.forEach((k) => seen.add(k));
	while (q.length) for (const n of nextTo(q.shift())) if (!seen.has(n) && open.has(at(t, n))) { seen.add(n); q.push(n); }
	return seen;
}
// セル集合のうち、座へ矢が届く立ち位置（壁だけが矢を止める＝game/projectile.js isTilePassableForProj）。
function shootersOf(t, cells, seat) {
	const [sr, sc] = P(seat);
	return [...cells].filter((k) => {
		const [r, c] = P(k);
		if (r !== sr && c !== sc) return false;
		const dr = Math.sign(sr - r), dc = Math.sign(sc - c);
		for (let rr = r + dr, cc = c + dc; rr !== sr || cc !== sc; rr += dr, cc += dc) {
			const ch = t[rr][cc];
			if (ch === TILE.WALL || ch === TILE.SWITCH_RED || ch === TILE.SWITCH_BLUE) return false;
		}
		return true;
	});
}

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
	room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
{
	const edge = [];
	for (let c = 0; c < COLS; c++) { edge.push(`0,${c}`, `9,${c}`); }
	for (let r = 1; r < ROWS - 1; r++) { edge.push(`${r},0`, `${r},11`); }
	const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
	check(`画面の縁で開いているのは西の口だけ（実測 ${open.join(' ')}）`, same(open, EXITS));
}
check(`敵が居ない（謎解きの部屋）`, cellsOf(t, (ch) => !!ENEMY_META[ch]).length === 0);
check(`植生・看板・Y・かがり火・壊せる壁・穴が無い`,
	cellsOf(t, (ch) => [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH, TILE.TORCH, TILE.BREAKABLE_WALL, TILE.PIT].includes(ch)).length === 0
	&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
check(`宝箱 B は ${CHEST_CELL} の1枚・中身＝ルピー×50`,
	same(cellsOf(t, (ch) => ch === TILE.CHEST), [CHEST_CELL])
	&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
check(`門 T は ${GATE_CELL}・ボタンは ${BUTTON_CELL}・石は ${STONE_CELL} の1つずつ`,
	same(cellsOf(t, (ch) => ch === TILE.GATE), [GATE_CELL]) && same(cellsOf(t, (ch) => ch === TILE.BUTTON), [BUTTON_CELL])
	&& same(cellsOf(t, (ch) => ch === TILE.STONE), [STONE_CELL]));
check(`赤門 ${RED_GATE}・青門 ${BLUE_GATE}・赤の座 ${RED_SEAT}・青の座 ${BLUE_SEAT} の1枚ずつ`,
	same(cellsOf(t, (ch) => ch === TILE.GATE_RED), [RED_GATE]) && same(cellsOf(t, (ch) => ch === TILE.GATE_BLUE), [BLUE_GATE])
	&& same(cellsOf(t, (ch) => ch === TILE.SWITCH_RED), [RED_SEAT]) && same(cellsOf(t, (ch) => ch === TILE.SWITCH_BLUE), [BLUE_SEAT]));
check(`links・showConditions・breakableWalls・floorItems・bgTiles が空（門 T はボタンで開く）`,
	room.links.length === 0 && Object.keys(room.showConditions).length === 0
	&& Object.keys(room.breakableWalls).length === 0 && Object.keys(room.floorItems).length === 0
	&& Object.keys(room.bgTiles).length === 0);
check(`笛の効果・初期色を持たない（笛の石戻しは色も null に戻す）`,
	(room.fluteEffect ?? null) === null && (room.initColor ?? null) === null && (room.activeColor ?? null) === null);

// ── ② 座と射線（盤面の実物から拾う＝定数だけ見て緑にならない） ─────────────
{
	const [red] = cellsOf(t, (ch) => ch === TILE.SWITCH_RED);
	const [blue] = cellsOf(t, (ch) => ch === TILE.SWITCH_BLUE);
	const [rr, rc] = P(red), [br, bc] = P(blue);
	check(`赤と青の座が同じ行・列に無い（貫通する剣ビームで両方を鳴らせない）`, rr !== br && rc !== bc);
	check(`赤の座の四方は空か壁（剣で叩けない）`, nextTo(red).every((k) => [TILE.SKY, TILE.WALL].includes(at(t, k))));
	const west = walkable(t);                 // 門を閉じたまま＝西岸
	const westRed = walkable(t, 'red');       // 赤を開けた＝北の渡りで東岸まで
	check(`西岸から赤は射れる（実測 ${shootersOf(t, west, red).join(' ')}）`, shootersOf(t, west, red).length > 0);
	check(`西岸から青は射れない`, shootersOf(t, west, blue).length === 0 && !nextTo(blue).some((k) => west.has(k)));
	const eastOnly = shootersOf(t, westRed, blue).filter((k) => at(t, k) !== TILE.GATE_RED);
	check(`赤を開けて渡った東岸から青を射れる（赤門の中は不発なので数えない・実測 ${eastOnly.join(' ')}）`,
		eastOnly.length > 0 && eastOnly.every((k) => P(k)[1] > P(BLUE_GATE)[1]));
	check(`赤門の中 ${RED_GATE} からも青への射線は通る（＝不発になる立ち位置・試す人への罠）`, shootersOf(t, westRed, blue).includes(RED_GATE));
}

// ── ③ ソルバー（状態空間）＝宝箱の隣に届く・詰まない ──────────────────────
{
	const m = solveRoom(t);
	check(`ソルバー（矢・色の門・石）で宝箱の隣に届く（L=${m.L}＝想定 ${SHORTEST}）`, m.L === SHORTEST);
	check(`入って詰む状態が無い（実測 noEscape=${m.noEscape}）`, m.noEscape === 0);
	check(`対照：道具封じ（剣で隣を叩くだけ）では届かない`, solveRoom(t, { noTools: true }).L === null);
	check(`対照：石を押さなければ届かない`, solveRoom(t, { noPush: true }).L === null);
	for (const seat of [RED_SEAT, BLUE_SEAT]) {
		const g = grid(); const [r, c] = P(seat); g[r][c] = TILE.WALL;
		check(`対照：座 ${seat} を壁にすると届かない（両方の色が要る）`, solveRoom(g).L === null);
	}
	const noSouth = grid(); { const [r, c] = P(BLUE_GATE); noSouth[r][c] = TILE.WALL; }
	check(`対照：南の渡り（青門）を壁にすると届かない（北の渡りでは石を運べない）`, solveRoom(noSouth).L === null);
	for (const gate of [RED_GATE, BLUE_GATE]) {
		const g = grid(); const [r, c] = P(gate); g[r][c] = TILE.FLOOR;
		const l = solveRoom(g).L;
		check(`対照：門 ${gate} を床にすると手数が減る（実測 ${l}＝門が効いている）`, l !== null && l < m.L);
	}
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
console.log(`# ${LAYER} ${ROOM}：東の行き止まりを「空の二つの渡り」に作り替える（キュー39 第2陣）`);
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
