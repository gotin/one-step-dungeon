// dungeon_7 `1,3`（入口）：D6 の写しの森の部屋を「崩れた着地台」に作り替える
// （2026-10-01 / PLAN 実行キュー 31 の第1陣 1室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー31 の着手時の実測）
//      0 #####..#####
//      1 #........i.#     ← 看板 i(1,9)「空中の遺跡の入口」（本文は npcData 側に持つ形）
//      2 #..u....u..#     ← 茂み u
//      3 #..t.i..t..#     ← 木 t・石碑 i(3,5)
//      4 ............
//      5 ............
//      6 #..........#
//      7 #.>........#     ← 笛で降りる着地 >(7,2)
//      8 #..........#
//      9 ############
//   `dungeon_6 1,3`（森の聖域の入口）と盤面がバイト一致＝空中の遺跡の入口なのに森の木と
//   茂みが立つ四角い箱。D7 に最初に着いたとき、空に来た手応えが何も無い。
//
// ■ 新しい `1,3`＝崩れた着地台（穴の空の予告＋はしごの再演）
//      0 #####..#####
//      1 #xx......xx#     ← 広間の北の角が崩れて空（穴 x）が覗く
//      2 #x.....x..x#     ← 広間の床にも抜けた穴 (2,7)
//      3 #...xi.....#     ← 石碑 i(3,5)（本文はそのまま）／崖の縁の欠け (3,4)
//      4 ..xvxxx.x...     ← 西・東・北の口は変えない（隣室との開きは不変）
//      5 ..xvxxxxx...       崖の縁は段々・歯こぼれ（(4,7) は穴に突き出た岩の舌）
//      6 #xxvxxxxxxx#     ← 渡れるのは石の橋 v(4..6,3) の 3 マスだけ
//      7 #.>.xxxxx.B#     ← 西の着地台（> と橋の袂）／東の張り出し（宝箱 B(7,10)）
//      8 #i..xxx....#     ← 看板 i(8,1)「空中の遺跡の入口」＝着地台に移した
//      9 ############
//   ・2026-10-01 のユーザー判定（行6 の一直線の帯＋橋 1 マスは「崩れた感が何も無い」）で
//     作り直した形。直す方向＝橋を伸ばす・穴を広げる・穴の幅に広い所と狭い所を作る。
//     ∴穴の幅は列ごとに違う＝橋の列は 3、中央は 5（行4〜8 を縦に貫く）、東は 1（行6 だけ）。
//   ・笛で着く `>`(7,2) は南西の小さな台の上＝降りた瞬間、足元が空に浮いているのが見える。
//     台から広間へは橋 v(4..6,3) を北へ渡るだけ＝道具は要らない（入口で詰ませない）。
//   ・東の張り出しは、裂け目の一番細い所（幅 1）の向こうに宝箱が見える＝はしごを持っていれば
//     広間から真下へ 1 マス渡れる（D5 の道具の再演）。西の台からは幅 3〜5 の穴で渡れない。
//   ・宝箱の中身＝ルピー×30（D7 の他の宝箱 ×5／×10 より重い＝寄り道の手間の分）。
//   ・看板 i(1,9)「ここは 道具の 試しの 場。」は北の角が崩れる∴着地台の隅 (8,1) へ移した
//     ＝降りてすぐ読める。本文は npcData にある（signData でなく npcData に本文を持つ看板
//     ＝[[blade-sign-two-formats]]）∴npcData のキーごと動かす（`check-dialog-integrity.mjs` が
//     「読めないタイルの上の npcData」を拾う）。
//   ・木・茂みは撤去（空中の遺跡に森の植生を残さない）。bgTiles は空のまま（穴は tiles の 'x'）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／`>` と mapEnters が不変／石碑の本文が残る／宝箱の中身
//   ・はしご無しで、着地から北・西・東の口へ歩ける（入口で詰まない）
//   ・はしご無しでは宝箱に届かない／はしごがあれば届く
//   ・西の台と東の張り出しの間に、はしごで架けられる穴が無い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   ・対照＝橋 v(6,3) を壁で塗ると、はしご無しでは着地台から出られない（歩行判定が空虚でない）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-1-3-crumbled-landing.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-1-3-crumbled-landing.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { bfsLayer, HARD_BLOCKED, isLadderBridgeCell } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '1,3';
const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
const TARGET = [
	'#####..#####',
	'#xx......xx#',
	'#x.....x..x#',
	'#...xi.....#',
	'..xvxxx.x...',
	'..xvxxxxx...',
	'#xxvxxxxxxx#',
	'#.>.xxxxx.B#',
	'#i..xxx....#',
	'############',
];
const NOTE_FROM = '1,9', NOTE_TO = '8,1';   // 看板「空中の遺跡の入口」（本文は npcData）
const LANDING = '7,2';
const CHEST = '7,10';
const BRIDGE = ['4,3', '5,3', '6,3'];
const CHEST_CONTENT = { type: 'rupee', value: 30, name: 'ルピー×30' };
const SIGN = '3,5';
// 口のセル（隣室との開き）＝北 (0,5)(0,6)・西 (4,0)(5,0)・東 (4,11)(5,11)。
const EXITS = { 北: ['0,5', '0,6'], 西: ['4,0', '5,0'], 東: ['4,11', '5,11'] };

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
const baseMapEnters = JSON.stringify(room.mapEnters);
const baseSign = JSON.stringify(room.signData?.[SIGN]);

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
if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) {
	room.chestContents = { [CHEST]: CHEST_CONTENT };
	log.push(`  ${ROOM}: 宝箱 ${CHEST} に ${CHEST_CONTENT.name} を入れた`);
}
room.npcData ??= {};
if (room.npcData[NOTE_FROM]) {
	room.npcData[NOTE_TO] = room.npcData[NOTE_FROM];
	delete room.npcData[NOTE_FROM];
	log.push(`  ${ROOM}: 看板「${room.npcData[NOTE_TO].name}」の本文（npcData）を ${NOTE_FROM} → ${NOTE_TO} へ移した`);
}
room.links ??= [];
room.bgTiles ??= {};
room.signData ??= {};
room.showConditions ??= {};
room.breakableWalls ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
// from から歩ける床。withLadder なら幅 1 の穴を 1 マスだけ渡れる＝エンジンの進入軸の橋
// （`game/passable.js`：踏み込む向きの軸で両隣が陸のときだけ）。穴の手前は今いるセル＝陸∴
// 向こう側 (nr+dr, nc+dc) が盤内の陸かだけを見る。宝箱は立てない（隣に立って開ける）。
function walkable(t, from, withLadder) {
	const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
	const blocked = (r, c) => HARD_BLOCKED.has(t[r][c]) || t[r][c] === TILE.CHEST;
	const seen = new Set([from]), q = [from.split(',').map(Number)];
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(k)) continue;
			const ladderOk = withLadder && t[nr][nc] === TILE.PIT
				&& inside(nr + dr, nc + dc) && !blocked(nr + dr, nc + dc);
			if (blocked(nr, nc) && !ladderOk) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
const nextTo = (walk, cell) => {
	const [r, c] = cell.split(',').map(Number);
	return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => walk.has(`${r + dr},${c + dc}`));
};

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列`, room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
check(`着地 '>' は ${LANDING} のまま・mapEnters が不変`,
	t[7][2] === TILE.MAP_ENTER && JSON.stringify(room.mapEnters) === baseMapEnters && room.mapEnters[LANDING]?.destId === 'field_dungeon7');
check(`石碑 ${SIGN} の本文が残っている（「空中の遺跡」）`,
	t[3][5] === TILE.SIGN && JSON.stringify(room.signData[SIGN]) === baseSign && room.signData[SIGN]?.lines?.[0] === '【空中の遺跡】');
{
	const signs = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === TILE.SIGN) signs.push(`${r},${c}`);
	check(`看板は石碑 (3,5) と入口の看板 (${NOTE_TO}) の 2 枚・どれも本文がある（実測 ${signs.join(' ')}）`,
		JSON.stringify(signs) === JSON.stringify(['3,5', NOTE_TO])
		&& signs.every((k) => (room.signData[k] ?? room.npcData[k])?.lines?.length));
	check(`入口の看板の本文が ${NOTE_TO} にある（「ここは 道具の 試しの 場。」）`,
		room.npcData[NOTE_TO]?.lines?.[0] === 'ここは 道具の 試しの 場。');
	// 本文だけ残ってタイルが消えた＝読めない npcData（check-dialog-integrity のエラー）が無い
	const stray = Object.keys({ ...room.signData, ...room.npcData }).filter((k) => {
		const [r, c] = k.split(',').map(Number);
		return t[r]?.[c] !== TILE.SIGN;
	});
	check(`看板でないセルに本文（signData／npcData）が残っていない（実測 ${stray.join(' ') || 'なし'}）`, stray.length === 0);
}
check(`木・茂みが残っていない`, !t.some((row) => row.includes(TILE.TREE) || row.includes(TILE.BUSH)));
check(`宝箱 ${CHEST} の中身＝${CHEST_CONTENT.name}`,
	t[7][10] === TILE.CHEST && JSON.stringify(room.chestContents[CHEST]) === JSON.stringify(CHEST_CONTENT));
{
	// 橋は南北に 3 マス・両脇は穴＝横から乗れない（成分が NS に渡る橋＝両側に手すりが通る）。
	const ok = BRIDGE.every((k) => {
		const [r, c] = k.split(',').map(Number);
		return t[r][c] === TILE.BRIDGE && t[r][c - 1] === TILE.PIT && t[r][c + 1] === TILE.PIT;
	});
	check(`橋 v は ${BRIDGE.join(' ')} の 3 マス・両脇は穴`, ok
		&& t.flat().filter((ch) => ch === TILE.BRIDGE).length === BRIDGE.length);
	// 穴の幅に広い所と狭い所がある（判定の言葉＝「穴の幅が大きいところ、小さいところ」）。
	// 列ごとに、行6 を通る穴の縦の連なりの長さを測る（橋の列 3 は除く）。
	const depth = (c) => {
		let top = 6, bot = 6;
		while (t[top - 1]?.[c] === TILE.PIT) top--;
		while (t[bot + 1]?.[c] === TILE.PIT) bot++;
		return bot - top + 1;
	};
	const cols = [1, 2, 4, 5, 6, 7, 8, 9, 10];
	const depths = cols.map(depth);
	check(`裂け目の縦の幅が列で違う＝最大 6・最小 1（実測 列${cols.join('/')}＝${depths.join(' ')}）`,
		Math.max(...depths) === 6 && Math.min(...depths) === 1);
}
check(`bgTiles が空（穴は tiles の 'x'）`, Object.keys(room.bgTiles).length === 0);

// ── ② 歩ける範囲 ────────────────────────────────────────────────────
const foot = walkable(t, LANDING, false);
const ladder = walkable(t, LANDING, true);
for (const [name, cells] of Object.entries(EXITS)) {
	check(`はしご無しで着地から${name}の口（${cells.join(' ')}）へ歩ける`, cells.every((k) => foot.has(k)));
}
check(`はしご無しでは宝箱 ${CHEST} に届かない`, !nextTo(foot, CHEST));
check(`はしごがあれば宝箱 ${CHEST} に届く`, nextTo(ladder, CHEST));
{
	// 西の台（着地側）から東の張り出しへ、はしごで横に渡れる穴が無い＝入口は必ず広間を経る。
	const bridges = [];
	for (const r of [7, 8]) for (let c = 4; c <= 8; c++) {
		if (t[r][c] === TILE.PIT && isLadderBridgeCell(t, ROWS, COLS, r, c, room.bgTiles)) bridges.push(`${r},${c}`);
	}
	check(`西の台と東の張り出しの間（行7-8・列4-8）にはしご橋になる穴が無い（実測 ${bridges.join(' ') || 'なし'}）`, bridges.length === 0);
	// 東の張り出しへのはしごの渡り口は、裂け目の一番細い (6,9) だけ。
	const east = walkable(t, '7,9', false);
	check(`東の張り出しは歩いては閉じている（実測 ${[...east].sort().join(' ')}）`,
		[...east].every((k) => ['7,9', '8,7', '8,8', '8,9', '8,10'].includes(k)));
}
{
	// 対照＝橋を壁で塗ると、はしご無しでは着地台から出られない（歩行判定が空虚でない）
	// （[[blade-control-experiment-needs-tile-wall]]）。
	const walled = grid();
	walled[6][3] = TILE.WALL;
	const cut = walkable(walled, LANDING, false);
	check(`対照：橋 v(6,3) を壁で塗ると、はしご無しでは北の口へ出られない`, !cut.has('0,5'));
}

// ── ③ 層の到達性は不変 ───────────────────────────────────────────────
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
console.log(`# ${LAYER} ${ROOM}：入口を「崩れた着地台」に作り替える（キュー31 第1陣）`);
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
