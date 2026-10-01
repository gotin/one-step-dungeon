// dungeon_7 `2,2`（中央の十字路）：D6 の写しの部屋を「空の射的場」に作り替える
// （2026-10-01 / PLAN 実行キュー 31 の第1陣 3室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー31 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #..u....u..#     ← 茂み u×2
//      3 #..........#
//      4 ............
//      5 ............
//      6 #..t.......#     ← 木 t
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   `dungeon_6 2,2` と盤面がバイト一致＝4方向の口がある四角い広間に森の木と茂みが残るだけ。
//
// ■ 新しい `2,2`＝空の射的場（弓の卒業試験の再演＝空の向こうの座を、射線を探して射る）
//      0 #####..#####     ← 4つの口（北・南 列5-6／西・東 行4-5）は変えない
//      1 #%.........#     ← 北の縁。(1,7) が唯一の射座（下を向いて射る）
//      2 #..%%..%%%.#
//      3 #.%%%%%%%..#
//      4 ...%%%%%%%..
//      5 ....%%%%%...
//      6 #..%#%%Y#%.#     ← 座 Y(6,7)・柱の残骸 (6,4)(6,8)
//      7 #%..%..#%%.#     ← 柱の残骸 (7,7)
//      8 #BT........#     ← 南西の奥：門 T(8,2) の向こうに宝箱 B(8,1)
//      9 #####..#####
//   ・広間の真ん中が空 '%' に抜け落ちた吹き抜け。縁は段々に欠け（北の口の張り出し・東の張り出し
//     (3,9)(5,9)・西の張り出し (5,3)・崩れた角 (1,1)(7,1)・西の縁の細り (3,1)）、4つの口は
//     縁を一周する回廊でつながる。
//   ・座 Y は吹き抜けの中に浮く（四方が空か柱＝歩いて隣に立てない＝剣で叩けない）。
//     空は歩いてもはしごでも渡れない∴遠隔攻撃（矢・剣ビーム）でしか当たらない。
//   ・座と同じ行・列に乗る縁は4方向あるが、柱の残骸 '#' が3方向を遮る
//     （西＝(6,4)／東＝(6,8)／南＝(7,7)）。開いているのは北の縁 (1,7) から真下だけ
//     ＝矢が空の上を 4 マス飛んで座に当たる。口から入ってすぐの位置（行4-5・列5-6）は
//     どれも座の行・列に乗らない＝「射線を探す」のが試験。
//   ・座に当てると links で門 T(8,2) が開き、南西の奥の宝箱 B(8,1)（ルピー×20）に届く。
//     宝箱は寄り道の報酬＝門を開けなくても4つの口どうしは歩いて行き来できる。
//   ・敵は置かない（謎解きの部屋）。茂み・木は撤去。看板も置かない。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／4つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵・植生・石・看板が無い／宝箱の中身／links が座→門の1本だけ
//   ・座の四方に歩ける床が無い（剣で叩けない）・柱の残骸の位置
//   ・射線＝門を閉じたまま立てるどのセルからどの向きに射っても、座に当たるのは (1,7) の下向きだけ
//     （矢を止めるのは壁と罅割れ壁だけ＝`game/projectile.js isTilePassableForProj` の写し）
//   ・門を閉じたまま、どの口からでもほかの3つの口へ道具なしで歩ける
//   ・門を閉じたままでは宝箱の隣に立てない／開けると立てる
//   ・はしごがあっても空は渡れない（歩行の到達範囲が増えない）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   ・対照＝(5,7) を壁で塗ると射線が 0 本になる（射線の判定が空虚でない）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-2-2-sky-shooting-gallery.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-2-2-sky-shooting-gallery.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '2,2';
const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
const TARGET = [
	'#####..#####',
	'#%.........#',
	'#..%%..%%%.#',
	'#.%%%%%%%..#',
	'...%%%%%%%..',
	'....%%%%%...',
	'#..%#%%Y#%.#',
	'#%..%..#%%.#',
	'#BT........#',
	'#####..#####',
];
// 口のセル（隣室との開き）＝書き換え前と同じ。
const EXITS = { 北: ['0,5', '0,6'], 南: ['9,5', '9,6'], 西: ['4,0', '5,0'], 東: ['4,11', '5,11'] };
const SWITCH_CELL = '6,7';
const GATE_CELL   = '8,2';
const CHEST_CELL  = '8,1';
const CHEST       = { type: 'rupee', value: 20, name: 'ルピー×20' };
const PILLARS     = ['6,4', '6,8', '7,7'];
// 唯一の射座（セル:向き）。
const ONLY_LANE   = '1,7:down';

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
const LINKS = [{ switchId: SWITCH_CELL, gateId: GATE_CELL }];
if (JSON.stringify(room.links ?? []) !== JSON.stringify(LINKS)) {
	room.links = LINKS;
	log.push(`  ${ROOM}: links＝座 ${SWITCH_CELL} → 門 ${GATE_CELL}`);
}
room.chestContents ??= {};
if (JSON.stringify(room.chestContents) !== JSON.stringify({ [CHEST_CELL]: CHEST })) {
	room.chestContents = { [CHEST_CELL]: CHEST };
	log.push(`  ${ROOM}: 宝箱 ${CHEST_CELL}＝${CHEST.name}`);
}
room.bgTiles ??= {};
room.signData ??= {};
room.npcData ??= {};
room.floorItems ??= {};
room.showConditions ??= {};
room.breakableWalls ??= {};
room.enemyDirs ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const DIRS4 = [[-1, 0, 'up'], [1, 0, 'down'], [0, -1, 'left'], [0, 1, 'right']];
const P = (k) => k.split(',').map(Number);
// from から歩けるセル（宝箱 B は踏んで開ける＝歩ける）。門 T は閉じていれば壁・gateOpen なら
// 通れる。withLadder なら幅 1 の穴/水を 1 マスだけ渡れる＝エンジンの進入軸の橋
// （`game/passable.js`）。空 '%' ははしごの対象外。
function walkable(t, from, { withLadder = false, gateOpen = false } = {}) {
	const blocked = (r, c) => BLOCKED.has(t[r][c]) && !(gateOpen && t[r][c] === TILE.GATE);
	const ladderOver = (ch) => ch === TILE.PIT || ch === TILE.WATER;
	const seen = new Set([from]), q = [P(from)];
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
// 立てるセルから4方向へ矢を射て、座に当たる「セル:向き」を全部返す。
// 矢を止めるのは壁と罅割れ壁だけ（`game/projectile.js isTilePassableForProj`）＝空・門・宝箱は越える。
function lanesTo(t, stand, target) {
	const out = [];
	for (const k of stand) {
		const [r, c] = P(k);
		for (const [dr, dc, name] of DIRS4) {
			let rr = r + dr, cc = c + dc;
			while (inside(rr, cc)) {
				if (`${rr},${cc}` === target) { out.push(`${k}:${name}`); break; }
				const ch = t[rr][cc];
				if (ch === TILE.WALL || ch === TILE.BREAKABLE_WALL) break;
				rr += dr; cc += dc;
			}
		}
	}
	return out.sort();
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
	check(`${name}の口（${cells.join(' ')}）が開いている`, cells.every((k) => { const [r, c] = P(k); return t[r][c] === TILE.FLOOR; }));
}
{
	// 口の両脇は塞がっている＝口の幅（2）が隣室と同じまま。
	const edge = [];
	for (let c = 0; c < COLS; c++) { edge.push(`0,${c}`, `9,${c}`); }
	for (let r = 1; r < ROWS - 1; r++) { edge.push(`${r},0`, `${r},11`); }
	const open = edge.filter((k) => { const [r, c] = P(k); return !HARD_BLOCKED.has(t[r][c]); }).sort();
	const want = Object.values(EXITS).flat().sort();
	check(`画面の縁で開いているのは4つの口だけ（実測 ${open.join(' ')}）`, JSON.stringify(open) === JSON.stringify(want));
}
check(`敵が居ない（謎解きの部屋）`, cellsOf(t, (ch) => !!ENEMY_META[ch]).length === 0);
check(`石・植生・看板が残っていない`,
	cellsOf(t, (ch) => [TILE.STONE, TILE.TREE, TILE.BUSH, TILE.SIGN].includes(ch)).length === 0
	&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
check(`座 Y は ${SWITCH_CELL} の1つ・門 T は ${GATE_CELL} の1つ・宝箱 B は ${CHEST_CELL} の1つ`,
	JSON.stringify(cellsOf(t, (ch) => ch === TILE.SWITCH)) === JSON.stringify([SWITCH_CELL])
	&& JSON.stringify(cellsOf(t, (ch) => ch === TILE.GATE)) === JSON.stringify([GATE_CELL])
	&& JSON.stringify(cellsOf(t, (ch) => ch === TILE.CHEST)) === JSON.stringify([CHEST_CELL]));
check(`宝箱の中身＝${CHEST.name}`, JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST_CELL]: CHEST }));
check(`links＝座 → 門 の1本だけ`, JSON.stringify(room.links) === JSON.stringify(LINKS));
check(`showConditions・floorItems・bgTiles が空`,
	Object.keys(room.showConditions).length === 0 && Object.keys(room.floorItems).length === 0
	&& Object.keys(room.bgTiles).length === 0);
{
	const [r, c] = P(SWITCH_CELL);
	const around = DIRS4.map(([dr, dc]) => t[r + dr][c + dc]);
	check(`座の四方は空か柱だけ＝歩いて隣に立てない（実測 ${around.join('')}）`,
		around.every((ch) => ch === TILE.SKY || ch === TILE.WALL));
}
check(`柱の残骸 ${PILLARS.join(' ')} が壁`, PILLARS.every((k) => { const [r, c] = P(k); return t[r][c] === TILE.WALL; }));
{
	const sky = cellsOf(t, (ch) => ch === TILE.SKY).length;
	check(`吹き抜けの空が 30 マス以上（実測 ${sky}）`, sky >= 30);
	// 列ごとの空の数が揃っていない＝縁が一直線でない（崩れた形）。
	const perCol = [];
	for (let c = 1; c < COLS - 1; c++) perCol.push(t.filter((row) => row[c] === TILE.SKY).length);
	check(`列ごとの空の数に 3 種類以上の幅がある（実測 ${perCol.join('/')}）`, new Set(perCol).size >= 3);
}

// ── ② 射線 ──────────────────────────────────────────────────────────
const footClosed = walkable(t, EXITS.北[0]);
{
	const lanes = lanesTo(t, footClosed, SWITCH_CELL);
	check(`座に当たる射線は ${ONLY_LANE} の1本だけ（実測 ${lanes.join(' ') || 'なし'}）`,
		JSON.stringify(lanes) === JSON.stringify([ONLY_LANE]));
	// 口から入ってすぐの4マス（各口の内側2マス）はどれも射線に乗らない。
	const entry = ['1,5', '1,6', '8,5', '8,6', '4,1', '5,1', '4,10', '5,10'];
	check(`口の内側のセルはどれも射座でない`, entry.every((k) => !lanes.some((l) => l.startsWith(`${k}:`))));
	// 対照＝射線の途中 (5,7) を壁で塗ると射線が 0 本（判定が空虚でない）
	// （[[blade-control-experiment-needs-tile-wall]]）。
	const walled = grid();
	walled[5][7] = TILE.WALL;
	check(`対照：(5,7) を壁で塗ると射線が 0 本`, lanesTo(walled, footClosed, SWITCH_CELL).length === 0);
	// 対照＝西の柱 (6,4) を空にすると西の縁から射線が通る（柱が実際に射線を遮っている）。
	const noPillar = grid();
	noPillar[6][4] = TILE.SKY;
	check(`対照：柱 (6,4) を空にすると西の縁からも射線が通る`,
		lanesTo(noPillar, footClosed, SWITCH_CELL).some((l) => l.endsWith(':right')));
}

// ── ③ 歩ける範囲 ────────────────────────────────────────────────────
for (const [from, fromCells] of Object.entries(EXITS)) {
	const foot = walkable(t, fromCells[0]);
	for (const [to, cells] of Object.entries(EXITS)) {
		if (to === from) continue;
		check(`門を閉じたまま、道具なしで${from}の口から${to}の口へ歩ける`, cells.every((k) => foot.has(k)));
	}
}
{
	const footOpen = walkable(t, EXITS.北[0], { gateOpen: true });
	check(`門を閉じたままでは宝箱に届かない`, !footClosed.has(CHEST_CELL));
	check(`門を開けると門 ${GATE_CELL} を通って宝箱に届く`, footOpen.has(GATE_CELL) && footOpen.has(CHEST_CELL));
	check(`門を開けても歩ける範囲は門と宝箱の2マスしか増えない`, footOpen.size === footClosed.size + 2);
	const ladder = walkable(t, EXITS.北[0], { withLadder: true });
	check(`はしごがあっても空は渡れない（歩ける ${footClosed.size} マス＝はしご ${ladder.size} マス）`, footClosed.size === ladder.size);
	const floors = cellsOf(t, (ch) => ch === TILE.FLOOR);
	check(`床のどのセルにも門を閉じたまま歩いて行ける（取り残された床が無い）`, floors.every((k) => footClosed.has(k)));
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
console.log(`# ${LAYER} ${ROOM}：中央の十字路を「空の射的場」に作り替える（キュー31 第1陣）`);
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
