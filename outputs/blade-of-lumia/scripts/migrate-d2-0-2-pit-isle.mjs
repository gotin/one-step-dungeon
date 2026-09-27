// dungeon_2 `0,2`：飾りの「石＋ボタンの門」部屋を「穴の小島」に作り替える
// （2026-09-27 / PLAN 実行キュー 34 の1室目・設計は Opus、主題はユーザー確定＝案 A）
//
// ■ 何が壊れていたか（キュー34 の走査＋着手前の実測）
//      0 ############
//      3 #....*.....#     ← 石 *(3,5)
//      4 #...........     ← 口は東 row4-5 だけ（1,2 の西の行き止まり＝寄り道の報酬部屋）
//      5 #....S...TB.     ← ボタン S(5,5)／門 T(5,9)／宝箱 B(5,10)＝ルピー×20
//   (a) 宝箱 B(5,10) は北の (4,10)・南の (6,10) から素で開けられた＝門 T(5,9) を開けても
//       新しく届くセルが 0。石もボタンも門も何も守っていない飾り。
//   (b) D2 の道具はブーメランだけ（`1,1` の宝箱）なのに、`1,1` の書き置き
//       「この ブーメランで 遠くの 物を 回収できる。」を実際に使う部屋が D2 に 1 つも無かった
//       （鍵部屋 `0,1` はブーメランの炎のリレー＝もう一つの性質の方）。
//   (c) 石＋ボタンの本物の門は D1 `2,1` で教え済み＝直して本物にしても繰り返しになる。
//
// ■ 新しい `0,2`＝穴の小島（寄り道の報酬部屋）
//      0 ############
//      1 #.xxxxxx...#
//      2 #.xxRRxx...#     ← 島の R(2,4) R(2,5)
//      3 #.xxRRxx...#     ← 島の R(3,4) R(3,5)
//      4 #.xxxxxx....     ← 入口（東）
//      5 #.xxxxxx....
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 ############
//   部屋の北西を穴 'x' の池にして、真ん中の 2×2 の小島にルピー（大）R ×4 を置く。
//   R は**歩いては取れない**＝ブーメランで拾う（投擲物を止めるのは壁と未破壊の '!' だけ
//   ＝穴の上は飛ぶ・`game/projectile.js`。往路でも復路でも通過セルの R を拾い、`carried` は
//   配列＝1投で複数運べる）。
//   ・**島の縦か横の列に1投＝2個まとめて運ぶ**∴2投で 20 ルピー（旧宝箱と同額）。
//     例＝南の岸 (6,4)↑ で R(3,4) R(2,4)（距離 3・4）／東の岸 (2,8)← で R(2,5) R(2,4)（距離 3・4）
//     ／西の岸 (3,1)→ で R(3,4) R(3,5)（距離 3・4）。
//   ・木のブーメランの実効の届きは **↑← 4 セル／→↓ 5 セル**（maxRange 3 は届くセル数ではない
//     ＝DECISIONS 2026-09-26（2））。この盤面はどの岸からも「近い方の R が距離 3・遠い方が 4」
//     ＝↑← の 4 にちょうど収まる。下の reachOf() がエンジンと同じ式で出し、
//     `tests/d2-pit-isle.spec.js` が実機で 1投2個を測る。
//   ・穴は島とどの床の間も**幅 2 以上**＝はしご（D5 で入手・幅 1 の穴だけ渡れる）を持って
//     再訪しても島へ渡れない。翼の羽衣は穴を越えられない（FLYABLE_OVER に PIT が無い）。
//     R は `passable:true`＝ゲーム側の isLadderBank では橋脚になる∴ゲーム側の判定で数える
//     （DECISIONS 2026-09-27（2）＝`lib/connectivity.mjs` の isLadderBridgeCell は Y/R に甘い）。
//   ・`1,1`（ブーメラン）と `0,2` はどちらも `1,2` の隣＝ブーメランより先にここへ寄れる。
//     そのときは「見えているのに取れない」部屋になり、`1,1` の書き置きを読んで戻ってくる。
//   ・D7 `3,0`（キュー32＝桟橋・柱・銀でだけ届く島）は同じ道具の卒業形。ここは柱も
//     射線の絞り込みも無い入門形にする（D2 の中ではこの性質を初めて使う部屋）。
//
// ■ 撤去したもの
//   石・ボタン・門・宝箱（links と chestContents も空にする）。看板は置かない
//   （キュー20c で間引いた方針のまま＝`1,1` の書き置きが既に教えている）。bgTiles は無し。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／links・chestContents が空／看板なし
//   ・R はどれも歩いて取れない（入口から歩ける範囲に R が無い）
//   ・R ごとの射線（実効の届きで数える）が設計どおり＝どの岸の射線も R を 2 個通る
//   ・はしごで渡れる穴が 1 枚も無い（R も橋脚に数える＝ゲーム側の判定）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   ・対照＝壁で塗ると射線が切れる／幅 1 の穴を作るとはしご橋として検出される
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d2-0-2-pit-isle.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d2-0-2-pit-isle.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { MOVE_STEP } from '../game/constants.js';
import { bfsLayer, HARD_BLOCKED, isLadderBridgeCell } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_2';
const ROOM  = '0,2';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
const TARGET = [
	'############',
	'#.xxxxxx...#',
	'#.xxRRxx...#',
	'#.xxRRxx...#',
	'#.xxxxxx....',
	'#.xxxxxx....',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

// ブーメランの実効の届き（セル数）＝`game/projectile.js` の往路をなぞる（一周目の速度）。
//   式の由来は `scripts/migrate-d7-3-0-boomerang-isles.mjs` と同じ（DECISIONS 2026-09-26（2））。
function reachOf(tier) {
	const step = tier.speed * MOVE_STEP;
	let p = 0.5;
	while (p < tier.maxRange) p += step;
	const travel = p + step;
	return { neg: Math.ceil(travel - 0.5), pos: Math.floor(travel + 0.5) };
}
const WOOD = reachOf(BOOMERANG_TIERS[0]);     // 実測 ↑←4 / →↓5

// 射線の設計（木）。値＝そこから届く立ち位置の一覧（ソート済み）。
const WANT_LANES = {
	'2,4': ['2,1', '2,8', '6,4'],
	'2,5': ['2,1', '2,8', '2,9', '6,5'],
	'3,4': ['3,1', '3,8', '6,4', '7,4'],
	'3,5': ['3,1', '3,8', '3,9', '6,5', '7,5'],
};

// ── 読み込み ─────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`${LAYER} が無い`);
const room = stages[ROOM];
if (!room) die(`${LAYER} ${ROOM} が無い`);

const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>' のセル
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
// tiles は「文字の配列の配列」で持つ（行文字列にするとゲームが落ちる
// ＝[[field-tiles-are-char-arrays]]）。
if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
	room.tiles = TARGET.map((row) => row.split(''));
	log.push(`  ${ROOM}: 盤面を差し替えた`);
}
if ((room.links ?? []).length) {
	log.push(`  ${ROOM}: links（${room.links.map((l) => `${l.switchId}→${l.gateId}`).join(' / ')}）を撤去した`);
	room.links = [];
}
if (Object.keys(room.chestContents ?? {}).length) {
	log.push(`  ${ROOM}: 宝箱の中身（${Object.values(room.chestContents).map((v) => v.name).join(' ')}）を撤去した`);
	room.chestContents = {};
}
room.links ??= [];
room.chestContents ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
// 入口（東の口 col11）から歩ける床（穴・壁・閉じた門は不可）。
function walkable(t) {
	const seen = new Set(), q = [];
	for (let r = 0; r < 10; r++) {
		if (!HARD_BLOCKED.has(t[r][11]) && t[r][11] !== TILE.PIT) { seen.add(`${r},11`); q.push([r, 11]); }
	}
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (nr < 0 || nr > 9 || nc < 0 || nc > 11 || seen.has(k)) continue;
			const ch = t[nr][nc];
			if (HARD_BLOCKED.has(ch) || ch === TILE.PIT) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
// cell へブーメランが直線で届く立ち位置（壁で止まる・穴は越える・距離 ≤ 実効の届き）。
// cell の下/右に立てば ↑/← へ投げる＝reach.neg、上/左に立てば reach.pos。
function throwersOf(t, walk, cell, reach) {
	const [r0, c0] = cell.split(',').map(Number);
	const out = [];
	for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
		const range = (dr === 1 || dc === 1) ? reach.neg : reach.pos;
		for (let d = 1; d <= range; d++) {
			const r = r0 + dr * d, c = c0 + dc * d;
			if (r < 0 || r > 9 || c < 0 || c > 11) break;
			if (t[r][c] === TILE.WALL) break;
			if (walk.has(`${r},${c}`)) out.push(`${r},${c}`);
		}
	}
	return out.sort();
}
// 立ち位置 from から dir へ木で投げたとき、通過する R の一覧（往路＝復路は同じ線をなぞる）。
function rupeesOnLane(t, from, dir, reach) {
	const [r0, c0] = from.split(',').map(Number);
	const [dr, dc] = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
	const range = (dr === -1 || dc === -1) ? reach.neg : reach.pos;
	const got = [];
	for (let d = 1; d <= range; d++) {
		const r = r0 + dr * d, c = c0 + dc * d;
		if (r < 0 || r > 9 || c < 0 || c > 11 || t[r][c] === TILE.WALL) break;
		if (t[r][c] === TILE.ITEM_RUPEE_LARGE) got.push(`${r},${c}`);
	}
	return got;
}
// `game/passable.js` isLadderBank は TILE_META の passable を見る＝R（passable:true）も橋脚になる。
// 島そのものが橋脚になりうるので、ゲーム側の判定を写して数える（DECISIONS 2026-09-27（2））。
const gameBank = (tt, r, c) => {
	if (r < 0 || r > 9 || c < 0 || c > 11) return false;
	const ch = tt[r][c];
	if (ch === TILE.WATER || ch === TILE.PIT) return false;
	return TILE_META[ch]?.passable ?? true;
};
const gameBridge = (tt, r, c) =>
	(gameBank(tt, r - 1, c) && gameBank(tt, r + 1, c)) ||
	(gameBank(tt, r, c - 1) && gameBank(tt, r, c + 1));

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列`, room.tiles.every((r) => Array.isArray(r) && r.length === 12));
check(`${ROOM} の links が空（飾りの石→ボタン→門を撤去）`, room.links.length === 0);
check(`${ROOM} の宝箱の中身が空（宝箱タイルも無い）`,
	Object.keys(room.chestContents).length === 0 && !t.some((row) => row.includes(TILE.CHEST)));
for (const ch of [TILE.STONE, TILE.BUTTON, TILE.GATE, TILE.SIGN]) {
	check(`${ROOM} に '${ch}' が残っていない`, !t.some((row) => row.includes(ch)));
}
check(`${ROOM} の看板データが空`, Object.keys(room.signData ?? {}).length === 0);
const rupees = [];
for (let r = 0; r < 10; r++) for (let c = 0; c < 12; c++) if (t[r][c] === TILE.ITEM_RUPEE_LARGE) rupees.push(`${r},${c}`);
check(`ルピー（大）は 4 個（実測 ${rupees.join(' ')}）`,
	JSON.stringify(rupees.sort()) === JSON.stringify(Object.keys(WANT_LANES).sort()));

// ── ② 歩いて取れない・射線が設計どおり ────────────────────────────────
const walk = walkable(t);
check(`R はどれも歩いて取れない（入口から歩ける範囲に R が無い）`, rupees.every((k) => !walk.has(k)));
check(`入口の口から西の岸 (3,1)・南の岸 (6,4)・東の岸 (2,8) まで歩ける`,
	walk.has('3,1') && walk.has('6,4') && walk.has('2,8'));
check(`木の実効の届き＝↑←${WOOD.neg}／→↓${WOOD.pos}（実機の実測 4／5 と一致）`, WOOD.neg === 4 && WOOD.pos === 5);
for (const [cell, want] of Object.entries(WANT_LANES)) {
	const wood = throwersOf(t, walk, cell, WOOD);
	check(`R(${cell}) へ木で届く座＝[${want}]（実測 [${wood}]）`, JSON.stringify(wood) === JSON.stringify(want));
}
// 岸の座から島へ向けた1投は、必ず R を 2 個通る（1投で2個まとめて運ぶ＝この部屋の読み）。
{
	const seats = [
		['6,4', 'up'], ['6,5', 'up'], ['2,8', 'left'], ['3,8', 'left'], ['2,1', 'right'], ['3,1', 'right'],
	];
	for (const [from, dir] of seats) {
		const got = rupeesOnLane(t, from, dir, WOOD);
		check(`岸 (${from}) から ${dir} の1投で R を 2 個運ぶ（実測 ${got.join(' ') || 'なし'}）`, got.length === 2);
	}
}
// 対照＝射線の途中を壁で塗ると届かなくなる（壁で止まる判定が効いている＝測定が空虚でない）
// （[[blade-control-experiment-needs-tile-wall]]）。
{
	const walled = grid();
	walled[4][4] = TILE.WALL;
	const cut = throwersOf(walled, walkable(walled), '2,4', WOOD);
	check(`対照：(4,4) を壁で塗ると南の岸 (6,4) から R(2,4) へ届かない（実測 [${cut}]）`, !cut.includes('6,4'));
}

// ── ③ はしご・羽衣で島へ渡れない ─────────────────────────────────────
{
	const pits = [];
	for (let r = 0; r < 10; r++) for (let c = 0; c < 12; c++) if (t[r][c] === TILE.PIT) pits.push([r, c]);
	const bridges = pits.filter(([r, c]) => gameBridge(t, r, c)).map(([r, c]) => `${r},${c}`);
	check(`はしごで架けられる穴が 1 枚も無い（R も橋脚に数える・実測 ${bridges.join(' ') || 'なし'}）`, bridges.length === 0);
	const helper = pits.filter(([r, c]) => isLadderBridgeCell(t, 10, 12, r, c, room.bgTiles ?? {})).map(([r, c]) => `${r},${c}`);
	check(`lib/connectivity.mjs の判定でも 0 枚（実測 ${helper.join(' ') || 'なし'}）`, helper.length === 0);
	// 対照＝(2,7) を床にすると (2,6) が R(2,5) と床に挟まれた幅 1 の穴＝ゲーム側の判定で検出される
	const probe = grid();
	probe[2][7] = '.';
	check(`対照：(2,7) を床にすると (2,6) が R を橋脚にしたはしご橋として検出される`, gameBridge(probe, 2, 6));
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
	check(`${ROOM} に到達できる（寄り道の部屋として生きている）`, closed.reachedRooms.has(ROOM));
	check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：飾りの石＋ボタンの門を「穴の小島」に作り替える（キュー34）`);
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
