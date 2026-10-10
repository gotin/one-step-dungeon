// dungeon_2 `1,3`（入口）：D1 の写しの部屋を「砂に沈んだ篝火」に作り替える
// （2026-10-10 / PLAN 実行キュー 41 の第1陣 1室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー41 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #..........#
//      3 #....i.....#     ← 入口の手記（ザーネルの過去）
//      4 ............     ← 西の口（`0,3` 行き止まり）・東の口（`2,3`）
//      5 ............
//      6 #..........#
//      7 #.>........#     ← フィールドへの戻り口 `>`（着地もこのセル）
//      8 #..........#
//      9 ############
//   `dungeon_1 1,3` とバイト一致（差 0）＝四角い広間に手記が1枚あるだけ。
//
// ■ 新しい `1,3`＝砂に沈んだ篝火（D2 の主題「ブーメラン」の予告＝炎を運ぶ）
//      0 #####..#####
//      1 #xxx.......#
//      2 #xHxH......#     ← (2,2) 砂に沈んだ消えた篝火・(2,4) 縁で燃えている篝火
//      3 #xxx.i.....#
//      4 ..B.........     ← (4,2) 2本とも灯ると現れる宝箱
//      5 ............
//      6 #..........#
//      7 #.>........#
//      8 #..........#
//      9 ############
//   ・部屋の北西の隅が砂の流れ落ちた穴（`x` 8 枚）。その真ん中に消えた篝火 (2,2) が1本だけ残る。
//     縁の (2,4) には燃えている篝火。入口に着くと、手記の隣で「燃えている火」と「穴の中の消えた火」が
//     並んで見える。
//   ・消えた篝火は歩いては近づけない（四方が穴と壁）。灯す手はブーメランで炎を運ぶことだけ
//     ＝縁の火の東 (2,5) から西へ投げると、燃えている (2,4) で炎を拾い、穴の上 (2,3) を越えて
//     (2,2) に火を渡す（距離 3＝木の届き ←4 の内側）。ブーメランは2部屋先の `1,1` にある
//     ＝帰り道で灯す小さなおまけ。鍵の部屋 `0,1`（2段の受け渡し）の1段目だけを先に見せる。
//   ・2本とも灯ると (4,2)（穴の南の縁）に宝箱が現れる（`showConditions` torchesLit）。
//   ・手記・戻り口 `>` は書き換え前と同じセルに残した（手記の本文も触らない）。敵は置かない（入口）。
//   ・D2 `0,2`（穴の小島のルピーをブーメランで持ち帰る）と型を分けるため、ここは「回収」ではなく
//     「炎の受け渡し」にした。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（穴は部屋の隅に閉じている）。
//
// 使い方:
//   node scripts/migrate-d2-1-3-sunken-brazier.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d2-1-3-sunken-brazier.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_2';
const ROOM  = '1,3';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#....i.....#',
	'............',
	'............',
	'#..........#',
	'#.>........#',
	'#..........#',
	'############',
];

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#xxx.......#',
	'#xHxH......#',
	'#xxx.i.....#',
	'..B.........',
	'............',
	'#..........#',
	'#.>........#',
	'#..........#',
	'############',
];
export const EXITS = { north: ['0,5', '0,6'], west: ['4,0', '5,0'], east: ['4,11', '5,11'] };
export const LANDING = '7,2';           // 戻り口 `>`＝フィールドから来たときの着地セル
export const SIGN = '3,5';              // 入口の手記（本文は書き換え前のまま）
export const DEAD = '2,2';              // 砂に沈んだ消えた篝火
export const LIT = '2,4';               // 縁で燃えている篝火（initLitTorches）
export const THROW_FROM = '2,5';        // ここから西へ投げる＝LIT → 穴 → DEAD
export const CHEST = '4,2';             // 2本とも灯ると現れる宝箱
export const CHEST_CONTENT = { type: 'rupee', value: 30, name: 'ルピー×30' };
const SIGN_NAME = '砂に埋もれた手記';

// ── 歩行の到達（モジュールとしても使う＝番人が import する） ─────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
export function reach(t, from = LANDING) {
	const seen = new Set([from]);
	const q = [from];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(nk) || BLOCKED.has(t[nr][nc])) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// import されたときはここで止める（番人は定数と reach だけ使う）。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	// 事前条件＝戻り口と手記が想定のセルにある（違えば黙って上書きしない）
	if (room.mapEnters?.[LANDING]?.destId !== 'field_dungeon2') die(`${ROOM} の戻り口が ${LANDING} に無い`);
	if (room.signData?.[SIGN]?.name !== SIGN_NAME) die(`${ROOM} の手記が ${SIGN} に無い`);

	const START = { stage: ROOM, row: 7, col: 2 };
	const OPEN = new Set(['T', '!', 'D', '=']);
	const runs = () => ({
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: false, openTiles: null }),
	});
	// 層の到達性の基準は「書き換え前の盤面」で測る＝適用済みの地図に再実行しても同じ基準になる（冪等）。
	const before = room.tiles.map(rowStr);
	const applied = room.tiles;
	room.tiles = ORIGINAL.map((row) => row.split(''));
	const base = runs();
	room.tiles = applied;

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え（tiles は文字の配列の配列＝[[field-tiles-are-char-arrays]]） ──
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => row.split(''));
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	if (JSON.stringify(room.initLitTorches) !== JSON.stringify([LIT])) {
		room.initLitTorches = [LIT];
		log.push(`  ${ROOM}: initLitTorches = [${LIT}]`);
	}
	if (JSON.stringify(room.chestContents) !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) {
		room.chestContents = { [CHEST]: CHEST_CONTENT };
		log.push(`  ${ROOM}: 宝箱 ${CHEST} の中身＝${CHEST_CONTENT.name}`);
	}
	if (JSON.stringify(room.showConditions) !== JSON.stringify({ [CHEST]: { trigger: 'torchesLit' } })) {
		room.showConditions = { [CHEST]: { trigger: 'torchesLit' } };
		log.push(`  ${ROOM}: 宝箱 ${CHEST} は torchesLit で現れる`);
	}

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const t = room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
	const at = (k) => { const [r, c] = P(k); return t[r]?.[c]; };
	const cellsOf = (pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
		return out;
	};
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k))).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは北・西・東の口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want));
	}
	check(`戻り口 > は ${LANDING} の1枚・行き先は field_dungeon2`,
		JSON.stringify(cellsOf((ch) => ch === TILE.MAP_ENTER)) === JSON.stringify([LANDING])
		&& room.mapEnters[LANDING].destId === 'field_dungeon2' && Object.keys(room.mapEnters).length === 1);
	check(`手記 i は ${SIGN} の1枚・本文は書き換え前のまま`,
		JSON.stringify(cellsOf((ch) => ch === TILE.SIGN)) === JSON.stringify([SIGN])
		&& room.signData[SIGN].name === SIGN_NAME && Object.keys(room.signData).length === 1);
	check(`篝火は ${DEAD}（消えている）と ${LIT}（燃えている）の2本だけ`,
		JSON.stringify(cellsOf((ch) => ch === TILE.TORCH)) === JSON.stringify([DEAD, LIT])
		&& JSON.stringify(room.initLitTorches) === JSON.stringify([LIT]));
	check(`宝箱は ${CHEST} の1つ・torchesLit で現れる・中身は ${CHEST_CONTENT.name}`,
		JSON.stringify(cellsOf((ch) => ch === TILE.CHEST)) === JSON.stringify([CHEST])
		&& room.showConditions[CHEST]?.trigger === 'torchesLit'
		&& Object.keys(room.showConditions).length === 1
		&& room.chestContents[CHEST]?.name === CHEST_CONTENT.name);
	check(`穴 x は北西の隅の 8 枚（${DEAD} を囲む 3×3 の外周）`,
		JSON.stringify(cellsOf((ch) => ch === TILE.PIT))
		=== JSON.stringify(['1,1', '1,2', '1,3', '2,1', '2,3', '3,1', '3,2', '3,3']));
	check(`敵・石・門・スイッチ・ボタン・床の物が無い（入口）`,
		cellsOf((ch) => !!ENEMY_META[ch]).length === 0
		&& cellsOf((ch) => [TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.DOOR, TILE.KEY,
			TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE, TILE.BREAKABLE_WALL].includes(ch)).length === 0);

	// ── ② 篝火の受け渡し ──────────────────────────────────────────────
	{
		const foot = reach(t);
		const [dr, dc] = P(DEAD);
		const nb = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([a, b]) => `${dr + a},${dc + b}`);
		check(`消えた篝火 ${DEAD} の四方はどれも歩けない（穴と壁＝近づけない）`, nb.every((k) => !foot.has(k)));
		check(`投げる座 ${THROW_FROM}・宝箱 ${CHEST}・手記の前・3つの口に歩いて届く`,
			[THROW_FROM, CHEST, '4,5', ...EXITS.north, ...EXITS.west, ...EXITS.east].every((k) => foot.has(k)));
		// 投げる座から西へ＝燃えている火（距離1）→ 穴（距離2）→ 消えた火（距離3）＝木の届き ←4 の内側
		const [tr, tc] = P(THROW_FROM);
		const line = [1, 2, 3].map((d) => at(`${tr},${tc - d}`));
		check(`${THROW_FROM} から西の線が「燃える火・穴・消えた火」（実測 ${line.join('')}）`,
			line.join('') === `${TILE.TORCH}${TILE.PIT}${TILE.TORCH}` && `${tr},${tc - 1}` === LIT && `${tr},${tc - 3}` === DEAD);
		check(`穴の床は1枚も歩けない（宝箱は穴の外）`, cellsOf((ch) => ch === TILE.PIT).every((k) => !foot.has(k)));
		const floors = cellsOf((ch) => !BLOCKED.has(ch));
		check(`床のどのセルにも歩いて立てる（取り残し 0・${floors.length} マス）`, floors.every((k) => foot.has(k)));
	}

	// ── ③ 層の到達性 ──────────────────────────────────────────────────
	{
		const now = runs();
		const sorted = (s) => [...s].sort();
		const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
		check(`徒歩・錠を全部開けた到達室が書き換え前と同じ（${now.foot.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(now.foot.reachedRooms, base.foot.reachedRooms));
		check(`門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`,
			same(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${now.foot.deadEdges.length}）`, now.foot.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：入口を「砂に沈んだ篝火」に作り替える（キュー41 第1陣）`);
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
