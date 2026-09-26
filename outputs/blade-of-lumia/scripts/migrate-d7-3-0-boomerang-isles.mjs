// dungeon_7 `3,0`：飾りの「石＋ボタンの門」部屋を「ブーメランの浮島」に作り替える
// （2026-09-26 / PLAN 実行キュー 32・設計は Opus、主題はユーザー確定）
//
// ■ 何が壊れていたか（キュー32 の指摘＋着手前の実測）
//      0 ############
//      1 #........T.#     ← 門 T(1,9)＝ボタン S(3,7) と配線
//      2 #........B.#     ← 宝箱 B(2,9)＝ルピー×10
//      3 #..*...S...#     ← 石 *(3,3)
//      9 #####..#####     ← 口は南だけ（3,1 の北の行き止まり＝寄り道の報酬部屋）
//   (a) 門 T(1,9) は宝箱 B(2,9) の**北**にある＝宝箱は門の手前の素の床に置かれていて、
//       門を開けなくても歩いて開けられた。石もボタンも門も何も守っていない飾り。
//   (b) 石を押すだけなら D4 で既習の語彙＝D7 終盤で出す仕掛けとして中身が無い。
//   (c) `dungeon_6 3,0` と盤面が完全に同一（そちらはキュー33 で別に直す）。
//
// ■ 新しい `3,0`＝ブーメランの浮島（寄り道の報酬部屋）
//      0 ############
//      1 #RxxxRxxxxR#     ← 島の R(1,1) R(1,5) R(1,10)
//      2 #xxxxxxxxxx#
//      3 #xxxxxxxxxx#
//      4 #.xxRxxRxx.#     ← 桟橋の先 (4,1)(4,10)／島の R(4,4) R(4,7)
//      5 #.xx#xx#xx.#     ← 柱 #(5,4)(5,7)＝真下からの射線を断つ
//      6 #.xxx..xxx.#     ← 中央の突堤の先 (6,5)(6,6)
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   北半分は穴 'x' の海。ルピー（大）R は**歩いては取れない**島に置き、ブーメランで拾う
//   （投擲物を止めるのは壁と未破壊の '!' だけ＝穴の上は飛ぶ・`game/projectile.js`。
//   往路でも復路でも通過セルの R を拾い、`carried` は配列＝1投で複数運べる）。
//   ・⚠️ **射程の数字（木 maxRange 3・銀 6）はそのまま「届くセル数」ではない**（実測）。
//     往路は「tick 冒頭の距離が maxRange 未満なら 1 tick 進む」＝閾値を越える tick でも
//     1 歩進んでから折り返す。しかも発射位置が手元から 0.5 先・セルは floor(v+0.5) で丸める。
//     ∴木（1 tick 1.0 セル）の実効の届きは **↑← 4 セル／→↓ 5 セル**（左右非対称）、
//     銀（1 tick 2.5 セル）は 10〜11 セル＝この部屋では壁まで届く。下の reachOf() が
//     エンジンと同じ式で出し、`tests/d7-boomerang-isles.spec.js` が実機で境目を測る。
//   ・桟橋の先 (4,1)／(4,10) がそれぞれ 2 投の座＝上へ投げて角の R、横へ投げて内側の R。
//       (4,1) ↑ → R(1,1)（距離3）　(4,1) → → R(4,4)（距離3）
//       (4,10)↑ → R(1,10)（距離3）　(4,10)← → R(4,7)（距離3）
//     向かいの桟橋からの横投げは距離 6＝木では届かない（銀なら届く）。
//   ・真ん中の R(1,5) は中央の突堤の先 (6,5) から真上へ距離 5＝木（↑4）では届かず、
//     **銀でだけ届く**。最初の叩き台は突堤が (5,5) まで伸びていて距離 4＝木で取れてしまった
//     （実測で発覚）∴(5,5)(5,6) を穴にして突堤を 1 段縮めた。
//   ・二周目（hasCleared）はブーメランが 2 倍速＝木の届きも伸びて R(1,5) に届く。
//     「銀でだけ」は一周目の約束（二周目は道具が強くなる設計のまま）。
//   ・柱 (5,4)(5,7) は「R(4,4)/R(4,7) を真下の岸から拾う」近道を断つためのもの。
//     柱が無いと岸 (7,4)/(7,7) から真上へ距離 3＝木で届いてしまい、
//     桟橋の先へ回る意味が消える（射線を列挙して確かめた＝下の ②）。
//   ・穴はどの島とも**幅 2 以上**で隔てる＝はしご（幅 1 の穴だけ渡れる・
//     `scripts/lib/connectivity.mjs` isLadderBridgeCell）で島へ渡れない。
//     翼の羽衣は穴を越えられない（FLYABLE_OVER に PIT が無い）。
//   ・報酬は木で 4×5＝20 ルピー、銀を持って再訪すれば +5＝25（旧宝箱は 10）。
//   ・D7 到達時にブーメランは必ず持っている（D2 の道具）・D7 ではまだ一度も使わせていなかった。
//
// ■ 撤去したもの
//   石・ボタン・門・宝箱（links と chestContents も空にする）。看板は置かない
//   （キュー20c で間引いた方針のまま）。bgTiles は無し（穴は tiles の 'x'）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／links・chestContents が空／看板なし
//   ・R はどれも歩いて取れない（入口から歩ける範囲に R が無い）
//   ・R ごとの射線（実効の届きで数える）が設計どおり：R(1,5) は銀でだけ、他 4 つは桟橋の先から木で
//   ・はしごで渡れる穴が、歩ける床と島の間に 1 枚も無い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   ・対照＝R を壁で塗ると射線が 0 になる（射線の測定が空虚でない）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-3-0-boomerang-isles.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-3-0-boomerang-isles.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { MOVE_STEP } from '../game/constants.js';
import { bfsLayer, HARD_BLOCKED, isLadderBridgeCell } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '3,0';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
const TARGET = [
	'############',
	'#RxxxRxxxxR#',
	'#xxxxxxxxxx#',
	'#xxxxxxxxxx#',
	'#.xxRxxRxx.#',
	'#.xx#xx#xx.#',
	'#.xxx..xxx.#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ブーメランの実効の届き（セル数）＝`game/projectile.js` の往路をなぞる（一周目の速度）。
//   発射位置は手元から 0.5 先・tick 冒頭の距離が maxRange 未満なら 1 tick（speed×MOVE_STEP）進み、
//   越えた tick でも 1 歩進んでから折り返す。セルは floor(v+0.5)＝負の向き（↑←）は切り下げ、
//   正の向き（→↓）は切り上げになる∴同じ飛距離でも ↑← と →↓ で 1 セル違う。
function reachOf(tier) {
	const step = tier.speed * MOVE_STEP;
	let p = 0.5;
	while (p < tier.maxRange) p += step;
	const travel = p + step;
	return { neg: Math.ceil(travel - 0.5), pos: Math.floor(travel + 0.5) };
}
const WOOD = reachOf(BOOMERANG_TIERS[0]);     // 実測 ↑←4 / →↓5
const SILVER = reachOf(BOOMERANG_TIERS[1]);   // 10 / 11＝この部屋では壁まで

// 射線の設計。値＝そこから届く立ち位置の一覧（ソート済み）。
const WANT_LANES = {
	'1,1':  { wood: ['4,1', '5,1'],   silver: ['4,1', '5,1', '6,1', '7,1', '8,1'] },
	'1,5':  { wood: [],               silver: ['6,5', '7,5', '8,5', '9,5'] },
	'1,10': { wood: ['4,10', '5,10'], silver: ['4,10', '5,10', '6,10', '7,10', '8,10'] },
	// 銀なら向かいの桟橋（距離 6）からも届く＝銀の再訪は楽になるだけで、木の座は変わらない。
	'4,4':  { wood: ['4,1'],  silver: ['4,1', '4,10'] },
	'4,7':  { wood: ['4,10'], silver: ['4,1', '4,10'] },
};

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
if (Object.keys(room.bgTiles ?? {}).length) {
	log.push(`  ${ROOM}: bgTiles を空にした`);
	room.bgTiles = {};
}
room.links ??= [];
room.chestContents ??= {};
room.bgTiles ??= {};
room.signData ??= {};
room.showConditions ??= {};
room.breakableWalls ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
// 入口（南の口 row9）から歩ける床（穴・壁・閉じた門は不可）。
function walkable(t) {
	const seen = new Set(), q = [];
	for (let c = 0; c < 12; c++) {
		if (!HARD_BLOCKED.has(t[9][c]) && t[9][c] !== TILE.PIT) { seen.add(`9,${c}`); q.push([9, c]); }
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
// cell から (dr,dc) へ離れた立ち位置は逆向きに投げる＝下/右に立てば ↑/←（reach.neg）。
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
check(`${ROOM} の看板データが空`, Object.keys(room.signData).length === 0);
const rupees = [];
for (let r = 0; r < 10; r++) for (let c = 0; c < 12; c++) if (t[r][c] === TILE.ITEM_RUPEE_LARGE) rupees.push(`${r},${c}`);
check(`ルピー（大）は 5 個（実測 ${rupees.join(' ')}）`,
	JSON.stringify(rupees.sort()) === JSON.stringify(Object.keys(WANT_LANES).sort()));

// ── ② 歩いて取れない・射線が設計どおり ────────────────────────────────
const walk = walkable(t);
check(`R はどれも歩いて取れない（入口から歩ける範囲に R が無い）`, rupees.every((k) => !walk.has(k)));
check(`入口の口 (9,5)(9,6) から北の岸 (7,1)(7,10) まで歩ける`, walk.has('7,1') && walk.has('7,10'));
for (const [cell, want] of Object.entries(WANT_LANES)) {
	const wood = throwersOf(t, walk, cell, WOOD);
	const silver = throwersOf(t, walk, cell, SILVER);
	check(`R(${cell}) へ木で届く座＝[${want.wood}]（実測 [${wood}]）`, JSON.stringify(wood) === JSON.stringify(want.wood));
	check(`R(${cell}) へ銀で届く座＝[${want.silver}]（実測 [${silver}]）`, JSON.stringify(silver) === JSON.stringify(want.silver));
}
check(`木の実効の届き＝↑←${WOOD.neg}／→↓${WOOD.pos}（実機の実測 4／5 と一致）`, WOOD.neg === 4 && WOOD.pos === 5);
// 対照＝射線の途中を壁で塗ると届かなくなる（壁で止まる判定が効いている＝測定が空虚でない）
// （[[blade-control-experiment-needs-tile-wall]]）。
{
	// R(4,4) を壁で塗ると、(4,1) から向こうの R(4,7) への射線（銀）が切れるはず。
	const walled = grid();
	walled[4][4] = TILE.WALL;
	const behind = throwersOf(walled, walkable(walled), '4,7', SILVER);
	check(`対照：R(4,4) を壁で塗ると (4,1) から R(4,7) へ銀でも届かない（実測 [${behind}]）＝壁で止まる判定が効く`,
		!behind.includes('4,1'));
}

// ── ③ はしご・羽衣で島へ渡れない ─────────────────────────────────────
{
	const bridges = [];
	for (let r = 0; r < 10; r++) for (let c = 0; c < 12; c++) {
		if (t[r][c] !== TILE.PIT) continue;
		if (isLadderBridgeCell(t, 10, 12, r, c, room.bgTiles)) bridges.push(`${r},${c}`);
	}
	check(`はしごで架けられる穴が 1 枚も無い（実測 ${bridges.join(' ') || 'なし'}）`, bridges.length === 0);
	// 対照＝幅 1 の穴を作れば検出される（検査が空虚でない）
	const probe = grid();
	probe[7][3] = TILE.PIT;   // 左右 (7,2)(7,4) が床＝幅 1 の穴
	check(`対照：床に挟まれた幅 1 の穴 (7,3) ははしご橋として検出される`,
		isLadderBridgeCell(probe, 10, 12, 7, 3, {}));
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
	check(`${ROOM} に到達できる（寄り道の部屋として生きている）`, open.reachedRooms.has(ROOM));
	check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：飾りの石＋ボタンの門を「ブーメランの浮島」に作り替える（キュー32）`);
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
