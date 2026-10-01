// dungeon_7 `2,1`（中央の十字路）：D6 の写しの部屋を「空の十字橋」に作り替える
// （2026-10-01 / PLAN 実行キュー 31 の第1陣 2室目・設計は Opus・ユーザー選択＝案 A）
//
// ■ 何が薄かったか（キュー31 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #....F.....#     ← センチネル F
//      3 #..*...#...#     ← 石 * と柱 #
//      4 ............
//      5 ............
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   `dungeon_6 2,1` と盤面がバイト一致＝4方向の口がある四角い広間に騎士が1体立つだけ。
//   空中の遺跡なのに「空」が1マスも無い（D7 全体で空 '%' は 0 枚だった）。
//
// ■ 新しい `2,1`＝空の十字橋（嵐の鷲王の予告＝飛ぶ敵を飛び道具で落とす）
//      0 %%%%#..#%%%%     ← 4つの口（北・南 列5-6／西・東 行4-5）は変えない
//      1 %%%%%.ξ%%%%%     ← 北の橋の上にコウモリ ξ(1,6)
//      2 %%%%%..%%#%%     ← 空に浮いた柱の残骸 (2,9)
//      3 %%%%..F.%%%%     ← 中央の台にセンチネル F(3,6)
//      4 ..%.........     ← 西の橋の欠け (4,2)＝幅 1
//      5 .........ξ..     ← 東の橋の上にコウモリ ξ(5,9)
//      6 %%%%....%%%%
//      7 %%%%%.ξ%%%%%     ← 南の橋の上にコウモリ ξ(7,6)
//      8 %#%%%.%%%%%%     ← 南の橋の欠け (8,6)＝幅 1・柱の残骸 (8,1)
//      9 %%%%#..#%%%%
//   ・床の大半を空 '%'（虚空）にして、4つの口をつなぐ幅 2 の石の橋と中央の台だけ残す。
//     空は歩いてもはしごでも渡れない（飛行専用・D7 ではまだ羽衣が無い）＝橋から落ちない形。
//   ・橋は所々が欠けて幅 1 になる（崩れかけの橋）＝一直線の十字にしない。
//     空に浮いた柱の残骸 '#' を 2 本置く（遺跡が崩れて空へ散った手応え）。
//   ・中央の台にセンチネル F（元からいた騎士＝重い敵は残す）。
//   ・コウモリ ξ×3 を橋の上に置く＝飛行敵（move:'air'）は空の上を飛べる∴橋の横の虚空から
//     寄ってくる。剣が届かない空の上の敵は弓・ブーメランで落とす＝ボス嵐の鷲王の予告。
//     ⚠️ 敵は空のセルの上に「置けない」＝tiles の敵の文字はそのセルの地形を上書きする∴
//        空に置くと、敵が動いた後にそこが床として残り、空に歩ける浮島ができてしまう。
//        bgTiles の '%' は通行判定が見ない（水だけが bgTiles を読む）∴下地での回避も不可。
//        ∴コウモリは橋の上で湧き、そこから空へ飛び出す形にした。
//   ・報酬なし（戦闘で抜ける通り道）。石・柱・植生は撤去。
//   ・脅威度＝F 18.0＋ξ 2.0×3＝24.0（D7 看板部屋 2,3 の 117.0 よりずっと軽い）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／4つの口が書き換え前と同じ位置で開いている／宝箱・看板・本文が無い
//   ・敵の構成（F×1・ξ×3）と、敵がどれも橋（歩ける床）の上にいる
//   ・どの口からでも、ほかの3つの口へ道具なしで歩ける（十字路として機能する）
//   ・はしごがあっても空は渡れない（歩行の到達範囲が増えない）
//   ・橋のどのセルも空に接している（「空の上の橋」になっている）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   ・対照＝中央の台を壁で塗ると、西の口から東の口へ歩けない（歩行判定が空虚でない）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-2-1-sky-cross-bridge.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-2-1-sky-cross-bridge.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '2,1';
const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
const TARGET = [
	'%%%%#..#%%%%',
	'%%%%%.ξ%%%%%',
	'%%%%%..%%#%%',
	'%%%%..F.%%%%',
	'..%.........',
	'.........ξ..',
	'%%%%....%%%%',
	'%%%%%.ξ%%%%%',
	'%#%%%.%%%%%%',
	'%%%%#..#%%%%',
];
const EXPECT_ENEMIES = { [TILE.SENTRY]: ['3,6'], 'ξ': ['1,6', '5,9', '7,6'] };
const EXPECT_THREAT = 24.0;
// 口のセル（隣室との開き）＝書き換え前と同じ。
const EXITS = { 北: ['0,5', '0,6'], 南: ['9,5', '9,6'], 西: ['4,0', '5,0'], 東: ['4,11', '5,11'] };
// 空に浮いた柱の残骸。
const PILLARS = ['2,9', '8,1'];

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
const baseLinks = JSON.stringify(room.links ?? []);

const before = room.tiles.map(rowStr);
const log = [];
const verify = [];
const check = (msg, cond) => verify.push([!!cond, msg]);

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ── 書き換え ─────────────────────────────────────────────────────────
// tiles は「文字の配列の配列」で持つ（行文字列にするとゲームが落ちる
// ＝[[field-tiles-are-char-arrays]]）。
// ⚠️ 行の文字数は「文字」で数える＝ξ は1文字（split('') は UTF-16 単位だが ξ は BMP 内）。
if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
	room.tiles = TARGET.map((row) => row.split(''));
	log.push(`  ${ROOM}: 盤面を差し替えた`);
}
room.links ??= [];
room.bgTiles ??= {};
room.signData ??= {};
room.npcData ??= {};
room.chestContents ??= {};
room.showConditions ??= {};
room.breakableWalls ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// from から歩ける床（敵の文字は湧く前の床＝歩ける）。withLadder なら幅 1 の穴/水を
// 1 マスだけ渡れる＝エンジンの進入軸の橋（`game/passable.js`）。空 '%' ははしごの対象外。
function walkable(t, from, withLadder) {
	const blocked = (r, c) => HARD_BLOCKED.has(t[r][c]);
	const ladderOver = (ch) => ch === TILE.PIT || ch === TILE.WATER;
	const seen = new Set([from]), q = [from.split(',').map(Number)];
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of DIRS4) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(k)) continue;
			const ladderOk = withLadder && ladderOver(t[nr][nc])
				&& inside(nr + dr, nc + dc) && !blocked(nr + dr, nc + dc);
			if (blocked(nr, nc) && !ladderOk) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
const cellsOf = (t, pred) => {
	const out = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
	return out;
};

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
	room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
for (const [name, cells] of Object.entries(EXITS)) {
	check(`${name}の口（${cells.join(' ')}）が開いている`, cells.every((k) => {
		const [r, c] = k.split(',').map(Number);
		return t[r][c] === TILE.FLOOR;
	}));
}
{
	// 口の両脇は塞がっている＝口の幅（2）が隣室と同じまま。
	const edge = [];
	for (let c = 0; c < COLS; c++) { edge.push(`0,${c}`, `9,${c}`); }
	for (let r = 1; r < ROWS - 1; r++) { edge.push(`${r},0`, `${r},11`); }
	const open = edge.filter((k) => { const [r, c] = k.split(',').map(Number); return !HARD_BLOCKED.has(t[r][c]); }).sort();
	const want = Object.values(EXITS).flat().sort();
	check(`画面の縁で開いているのは4つの口だけ（実測 ${open.join(' ')}）`, JSON.stringify(open) === JSON.stringify(want));
}
{
	const enemies = {};
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = t[r][c];
		if (ENEMY_META[ch]) (enemies[ch] ??= []).push(`${r},${c}`);
	}
	check(`敵の構成＝センチネル F×1・コウモリ ξ×3（実測 ${JSON.stringify(enemies)}）`,
		Object.keys(enemies).length === Object.keys(EXPECT_ENEMIES).length
		&& Object.entries(EXPECT_ENEMIES).every(([ch, cells]) => JSON.stringify(enemies[ch]) === JSON.stringify(cells)));
	const threat = stageThreat(room, ENEMY_META);
	check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）`, threat === EXPECT_THREAT);
	check(`コウモリは飛行敵（move:'air'）＝空の上を飛べる`, ENEMY_META['ξ']?.move === 'air');
}
check(`宝箱・看板・本文が無い（報酬なしの通り道）`,
	cellsOf(t, (ch) => ch === TILE.CHEST || ch === TILE.SIGN).length === 0
	&& Object.keys(room.chestContents).length === 0
	&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
check(`石・植生が残っていない`, cellsOf(t, (ch) => ch === TILE.STONE || ch === TILE.TREE || ch === TILE.BUSH).length === 0);
check(`空に浮いた柱の残骸は ${PILLARS.join(' ')} の2本・どれも四方が空`, PILLARS.every((k) => {
	const [r, c] = k.split(',').map(Number);
	return t[r][c] === TILE.WALL && DIRS4.every(([dr, dc]) => !inside(r + dr, c + dc) || t[r + dr][c + dc] === TILE.SKY);
}));
check(`links が書き換え前と同じ・bgTiles が空`,
	JSON.stringify(room.links) === baseLinks && Object.keys(room.bgTiles).length === 0);
{
	// 床（橋と台）のどのセルも、上下左右か斜めのどこかで空に接している＝「空の上の橋」。
	// 中央の台の真ん中まで空から離れた広い床があると、ただの広間に戻る。
	const floors = cellsOf(t, (ch) => !HARD_BLOCKED.has(ch));
	const far = floors.filter((k) => {
		const [r, c] = k.split(',').map(Number);
		for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
			if (t[r + dr]?.[c + dc] === TILE.SKY) return false;
		}
		return true;
	});
	// 中央の交差（行4-5 × 列4-7）は空から 1 マス離れていてよい＝2 マス以上離れた床が無い。
	check(`空から離れた床は中央の交差だけ（実測 ${far.join(' ') || 'なし'}）`,
		far.every((k) => { const [r, c] = k.split(',').map(Number); return r >= 4 && r <= 5 && c >= 4 && c <= 7; }));
	const sky = cellsOf(t, (ch) => ch === TILE.SKY).length;
	check(`空が床より多い（空 ${sky}・床 ${floors.length}）`, sky > floors.length);
}

// ── ② 歩ける範囲 ────────────────────────────────────────────────────
for (const [from, fromCells] of Object.entries(EXITS)) {
	const foot = walkable(t, fromCells[0], false);
	for (const [to, cells] of Object.entries(EXITS)) {
		if (to === from) continue;
		check(`道具なしで${from}の口から${to}の口へ歩ける`, cells.every((k) => foot.has(k)));
	}
}
{
	const foot = walkable(t, EXITS.西[0], false);
	const ladder = walkable(t, EXITS.西[0], true);
	check(`はしごがあっても空は渡れない（歩ける ${foot.size} マス＝はしご ${ladder.size} マス）`, foot.size === ladder.size);
	const floors = cellsOf(t, (ch) => !HARD_BLOCKED.has(ch));
	check(`橋と台のどのセルにも歩いて行ける（取り残された床が無い）`, floors.every((k) => foot.has(k)));
}
{
	// 対照＝中央の交差を壁で塗ると、西から東へ歩けない（歩行判定が空虚でない）
	// （[[blade-control-experiment-needs-tile-wall]]）。
	const walled = grid();
	for (let r = 3; r <= 6; r++) for (let c = 4; c <= 7; c++) walled[r][c] = TILE.WALL;
	const cut = walkable(walled, EXITS.西[0], false);
	check(`対照：中央の台を壁で塗ると、西の口から東の口へ歩けない`, !cut.has(EXITS.東[0]));
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
console.log(`# ${LAYER} ${ROOM}：中央の十字路を「空の十字橋」に作り替える（キュー31 第1陣）`);
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
