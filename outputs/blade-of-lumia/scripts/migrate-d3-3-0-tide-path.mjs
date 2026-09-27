// dungeon_3 `3,0`：飾りの「石＋ボタンの門」部屋を「潮の引く道」（石運び＋潮ゲート）に作り替える
// （2026-09-27 / PLAN 実行キュー 34 の2室目・設計は Opus、主題はユーザー確定＝案 A）
//
// ■ 何が壊れていたか（キュー34 の指摘＋着手前の実測）
//      0 ############
//      3 #....*.....#     ← 石 *(3,5)
//      5 #....S...TB#     ← ボタン S(5,5)・門 T(5,9)・宝箱 B(5,10)＝ルピー×30
//      9 #####..#####     ← 口は南だけ（3,1 の北の行き止まり＝寄り道の報酬部屋）
//   宝箱 (5,10) は (4,10)(6,10) から素で歩いて開けられた＝石もボタンも門も何も守っていない飾り。
//
// ■ 新しい `3,0`＝潮の引く道（寄り道の報酬部屋）
//      0 ############
//      1 #.....#~~B~#     ← 宝箱 B(1,9)＝入江の奥
//      2 #..*..#~~=~#     ← 石 *(2,3)＝北西の小部屋の中／潮 =(2,9)
//      3 #.....#~~=~#     ← 潮 =(3,9)
//      4 ##.####~~=~#     ← 小部屋の口 (4,2)／潮 =(4,9)
//      5 #..........#
//      6 #.......S..#     ← ボタン S(6,8)（links で潮 3 枚と配線）
//      7 #....##....#     ← 柱 (7,5)(7,6)＝石を出口の列へ押し込ませない
//      8 #..........#
//      9 #####..#####
//   水は bgTiles の '~'（tiles 側は '.'）＝[[blade-water-single-source-readers]]。
//   潮 '=' の下には水を敷かない（`dungeon_7 1,2` の潮と同じ＝閉じた潮は TILE_META で通行不可）。
//   ・宝箱へ行く道は潮の3枚だけ。ボタンは踏んでいる間だけ ON＝足で踏んで潮を引かせても、
//     降りた瞬間に潮が満ちる∴**石をボタンに載せる**しかない（全ボタンに石＝石がロックされ潮は引いたまま）。
//   ・石は北西の小部屋の中＝口 (4,2) から南へ出し、6 行目を東へ運ぶ（最短で 11 回押す）。
//     押し間違えて詰めても、部屋を出て入り直せば石は元に戻る（`game/game.js` enterStage）。
//   ・D3 の道具はブーメランと弓（剣はティア 0）。D3 に潮ゲートは 0 枚だった＝この部屋が初出。
//     D1 `2,1`（石1個を1回押すだけ）の一段上の石運び。弓の的（D3 に既に3枚）・直前の
//     D2 `0,2`（ブーメラン）とも主題が重ならない。
//   ・報酬＝ルピー×30（旧のまま）。
//
// ■ 撤去したもの
//   旧石 *(3,5)・旧ボタン S(5,5)・旧門 T(5,9)・旧宝箱 B(5,10) と旧 links（5,5→5,9）。看板は置かない。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／bgTiles／links／宝の中身が狙いどおり・門 T と看板が残っていない
//   ・潮を閉じたままでは宝箱に届かない／開ければ届く（潮が本物）
//   ・ソルバー（実ゲームと同じ遷移関数）で：解がある／石を押さないと届かない（対照）／
//     石が外周（出口を塞ぐ）にも潮のセルにも入らない
//   ・はしごで架けられる水が 1 枚も無い（ゲーム側の isLadderBank に合わせる・対照つき）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d3-3-0-tide-path.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d3-3-0-tide-path.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { bfsLayer, HARD_BLOCKED, isLadderBridgeCell } from './lib/connectivity.mjs';
import { makeSolver, isRing, ROWS, COLS } from './lib/blade-solver.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_3';
const ROOM  = '3,0';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
// tiles は '.'、水は下の POOL（bgTiles）で重ねる。表示用の図はファイル冒頭。
const TARGET = [
	'############',
	'#.....#..B.#',
	'#..*..#..=.#',
	'#.....#..=.#',
	'##.####..=.#',
	'#..........#',
	'#.......S..#',
	'#....##....#',
	'#..........#',
	'#####..#####',
];
// 入江＝rows 1-4 × cols 7,8,10（潮の列 9 と宝箱は除く）。
const POOL = {};
for (let r = 1; r <= 4; r++) for (const c of [7, 8, 10]) POOL[`${r},${c}`] = TILE.WATER;
const BUTTON = '6,8';
const TIDES  = ['2,9', '3,9', '4,9'];
const CHEST  = '1,9';
const STONE  = '2,3';
const LINKS  = TIDES.map((g) => ({ switchId: BUTTON, gateId: g }));
const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } };

// ── 読み込み ─────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`${LAYER} が無い`);
const room = stages[ROOM];
if (!room) die(`${LAYER} ${ROOM} が無い`);

const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2) の着地セル
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
if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(POOL)) {
	room.bgTiles = { ...POOL };
	log.push(`  ${ROOM}: bgTiles（入江の水 ${Object.keys(POOL).length} 枚）を敷いた`);
}
if (JSON.stringify(room.links ?? []) !== JSON.stringify(LINKS)) {
	log.push(`  ${ROOM}: links を ${(room.links ?? []).map((l) => `${l.switchId}→${l.gateId}`).join(' / ') || 'なし'} → ${LINKS.map((l) => `${l.switchId}→${l.gateId}`).join(' / ')} にした`);
	room.links = LINKS.map((l) => ({ ...l }));
}
if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
	log.push(`  ${ROOM}: 宝箱を ${Object.entries(room.chestContents ?? {}).map(([k, v]) => `${k}=${v.name}`).join(' ') || 'なし'} → ${CHEST}=ルピー×30 にした`);
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
}
room.signData ??= {};
room.showConditions ??= {};
room.breakableWalls ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const isWater = (bg, k) => bg[k] === TILE.WATER;
// 入口（南の口 row9）から歩ける床。壁・水（tiles／bgTiles）・石・閉じた潮は不可（open に入れた潮だけ通す）。
function walkable(t, bg, open = new Set()) {
	const ok = (r, c) => {
		const k = `${r},${c}`;
		const ch = t[r][c];
		if (HARD_BLOCKED.has(ch) || isWater(bg, k)) return false;
		if (ch === TILE.TIDE_GATE && !open.has(k)) return false;
		if (ch === TILE.STONE) return false;
		return true;
	};
	const seen = new Set(), q = [];
	for (let c = 0; c < COLS; c++) if (ok(ROWS - 1, c)) { seen.add(`${ROWS - 1},${c}`); q.push([ROWS - 1, c]); }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || seen.has(k)) continue;
			if (!ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
// bgTiles オブジェクト → ソルバーの 2D 配列（measure-puzzle.mjs loadScreen と同じ変換）。
const bg2d = (bg) => {
	const out = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (const [k, ch] of Object.entries(bg)) { const [r, c] = k.split(',').map(Number); out[r][c] = ch; }
	return out;
};
// 南の口から全状態を BFS。石の位置の集合と、宝箱に立てる状態があるかを返す。
function explore(t, bg, opts = {}) {
	const S = makeSolver(t, bg2d(bg), [[BUTTON, TIDES]], {}, new Set(), { hasLadder: true, ...opts });
	const starts = S.exitCells.map((cell) => {
		const [r, c] = cell.split(',').map(Number);
		return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
	});
	const seen = new Set(starts), q = [...starts];
	const stoneCells = new Set();
	let goal = false;
	while (q.length) {
		const st = q.shift();
		const [pos, stonesStr] = st.split('|');
		if (pos === CHEST) goal = true;
		for (const s of stonesStr ? stonesStr.split(';') : []) stoneCells.add(s);
		for (const n of S.nextStates(st)) if (!seen.has(n)) { seen.add(n); q.push(n); }
	}
	return { states: seen.size, stoneCells, goal };
}

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
const bg = room.bgTiles;
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列`, room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
check(`${ROOM} の bgTiles＝入江の水 ${Object.keys(POOL).length} 枚`, JSON.stringify(bg) === JSON.stringify(POOL));
check(`潮 ${TIDES.join(' ')} と宝箱 ${CHEST} の下は水ではない`, [...TIDES, CHEST].every((k) => !isWater(bg, k)));
check(`${ROOM} の links＝${BUTTON}→潮 3 枚`, JSON.stringify(room.links) === JSON.stringify(LINKS));
check(`${ROOM} の宝箱＝${CHEST} のルピー×30 だけ`, JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
for (const ch of [TILE.GATE, TILE.SWITCH, TILE.SIGN]) {
	check(`${ROOM} に '${ch}' が残っていない`, !t.some((row) => row.includes(ch)));
}
{
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	check(`石・ボタン・宝箱は1枚ずつ・潮は3枚`,
		count(TILE.STONE) === 1 && count(TILE.BUTTON) === 1 && count(TILE.CHEST) === 1 && count(TILE.TIDE_GATE) === 3);
	check(`石は ${STONE}・ボタンは ${BUTTON}`, t[2][3] === TILE.STONE && t[6][8] === TILE.BUTTON);
}
check(`${ROOM} の看板データが空`, Object.keys(room.signData).length === 0);

// ── ② 潮が本物＝閉じたままでは宝箱に届かない ──────────────────────────
{
	const closed = walkable(t, bg);
	const opened = walkable(t, bg, new Set(TIDES));
	check(`潮を閉じたままでは宝箱 ${CHEST} にも潮の道にも届かない`, !closed.has(CHEST) && TIDES.every((k) => !closed.has(k)));
	check(`潮を開ければ宝箱 ${CHEST} に届く`, opened.has(CHEST));
	check(`入口からボタン ${BUTTON} と小部屋の口 (4,2) まで歩ける`, closed.has(BUTTON) && closed.has('4,2'));
}

// ── ③ ソルバー＝石を運ばないと届かない・石が詰む場所へ行かない ─────────────
{
	const full = explore(t, bg);
	check(`ソルバーで宝箱 ${CHEST} に届く（状態 ${full.states}）`, full.goal);
	const noPush = explore(t, bg, { noPush: true });
	check(`対照：石を押さないと宝箱に届かない（足で踏むだけでは潮が満ちる）`, !noPush.goal);
	const ring = [...full.stoneCells].filter((k) => isRing(...k.split(',').map(Number)));
	check(`石が外周（出口の列）に入らない（実測 ${ring.join(' ') || 'なし'}）`, ring.length === 0);
	const inTide = [...full.stoneCells].filter((k) => TIDES.includes(k));
	check(`石が潮のセルに入らない（実測 ${inTide.join(' ') || 'なし'}）`, inTide.length === 0);
	check(`石はボタン ${BUTTON} まで運べる`, full.stoneCells.has(BUTTON));
	// 対照＝柱 (7,5)(7,6) を床にすると石を出口の列 (8,5)(8,6) の先＝外周へ押し込める
	const noPillar = grid();
	noPillar[7][5] = TILE.FLOOR; noPillar[7][6] = TILE.FLOOR;
	const ring2 = [...explore(noPillar, bg).stoneCells].filter((k) => isRing(...k.split(',').map(Number)));
	check(`対照：柱を外すと石が外周に入る（実測 ${ring2.join(' ') || 'なし'}）`, ring2.length > 0);
}

// ── ④ はしごで入江を渡れない ────────────────────────────────────────
// ゲーム本体の `game/passable.js` isLadderBank は TILE_META の passable を見る＝宝箱（passable）も
// 橋脚になりうる。閉じた潮は通行不可＝橋脚にならず、はしごは潮を越えない（LADDER_OVER＝水/穴のみ）。
const gameBank = (tt, bgx, r, c, open = new Set()) => {
	if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
	const ch = tt[r][c];
	if (ch === TILE.WATER || ch === TILE.PIT || isWater(bgx, `${r},${c}`)) return false;
	if (ch === TILE.TIDE_GATE) return open.has(`${r},${c}`);
	return TILE_META[ch]?.passable ?? true;
};
const gameBridge = (tt, bgx, r, c, open) =>
	(gameBank(tt, bgx, r - 1, c, open) && gameBank(tt, bgx, r + 1, c, open)) ||
	(gameBank(tt, bgx, r, c - 1, open) && gameBank(tt, bgx, r, c + 1, open));
{
	const bridges = Object.keys(bg).filter((k) => gameBridge(t, bg, ...k.split(',').map(Number)));
	check(`はしごで架けられる水が 1 枚も無い（潮が閉じた状態・実測 ${bridges.join(' ') || 'なし'}）`, bridges.length === 0);
	const bridgesOpen = Object.keys(bg).filter((k) => gameBridge(t, bg, ...k.split(',').map(Number), new Set(TIDES)));
	check(`潮が引いた後も 0 枚（実測 ${bridgesOpen.join(' ') || 'なし'}）`, bridgesOpen.length === 0);
	const helper = Object.keys(bg).filter((k) => isLadderBridgeCell(t, ROWS, COLS, ...k.split(',').map(Number), bg));
	check(`lib/connectivity.mjs の判定でも 0 枚（実測 ${helper.join(' ') || 'なし'}）`, helper.length === 0);
	// 対照＝(1,7) を床にすると (1,8) が床 (1,7) と宝箱 (1,9) に挟まれた幅 1 の水＝検出される
	const bg3 = { ...bg };
	delete bg3['1,7'];
	check(`対照：(1,7) を床にすると (1,8) が宝箱を橋脚にしたはしご橋として検出される`, gameBridge(t, bg3, 1, 8));
}

// ── ⑤ 層の到達性は不変 ───────────────────────────────────────────────
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
console.log(`# ${LAYER} ${ROOM}：飾りの石＋ボタンの門を「潮の引く道」に作り替える（キュー34）`);
console.log(log.join('\n') || '  （変更なし）');

console.log(`\n## 盤面の差分（${ROOM}・水は ~ で重ねて表示）`);
room.tiles.forEach((row, i) => {
	const now = rowStr(row).split('').map((ch, c) => (ch === '.' && isWater(bg, `${i},${c}`) ? '~' : ch)).join('');
	console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${now}`);
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
