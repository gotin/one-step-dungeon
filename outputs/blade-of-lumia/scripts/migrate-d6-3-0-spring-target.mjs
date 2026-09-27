// dungeon_6 `3,0`：飾りの「石＋ボタンの門」部屋を「泉の的」（弓）に作り替える
// （2026-09-27 / PLAN 実行キュー 33・設計は Opus、主題はユーザー確定＝案 A）
//
// ■ 何が壊れていたか（キュー33 の指摘＋着手前の実測）
//      0 ############
//      1 #........T.#     ← 門 T(1,9)＝ボタン S(3,7) と配線・北は壁＝開けても行ける所が増えない
//      2 #........B.#     ← 宝箱 B(2,9)＝ルピー×10・(3,9) から素で歩いて開けられる
//      3 #..*...S...#     ← 石 *(3,3)
//      9 #####..#####     ← 口は南だけ（3,1 の北の行き止まり＝寄り道の報酬部屋）
//   石もボタンも門も何も守っていない飾り（`dungeon_7 3,0` と盤面が同一だった＝そちらは
//   キュー32 で「ブーメランの浮島」に作り替え済み）。
//
// ■ 新しい `3,0`＝泉の的（寄り道の報酬部屋）
//      0 ############
//      1 #B#~~~~~~~.#     ← 宝箱 B(1,1)＝窪みの奥
//      2 #.#~~~~Y~~.#     ← 的 Y(2,7)＝泉の小島／東の縁 (2,10) から西へ撃つのが唯一の射線
//      3 #T#~~~~~~~.#     ← 門 T(3,1)＝窪みの口（links で Y(2,7) と配線）
//      4 #..~~~~~~~.#
//      5 #..~~~~#~~.#     ← 柱 #(5,7)＝真下の岸から撃つ射線を断つ
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   水は bgTiles の '~'（tiles 側は '.'）＝[[blade-water-single-source-readers]]。
//   ・門 T(3,1) は宝箱の窪み (1,1)(2,1) の**唯一の口**＝今度は本当に宝を封じる。
//   ・Y を叩けるのは剣（隣の1マス）・矢・剣ビームだけ（`game/combat.js` と
//     `game/projectile.js:637`＝投擲物は arrow/beam のみ・ブーメランは叩かない）。
//     Y の4近傍はすべて水＝剣は届かない。D6 時点の剣はティア 0（木＝ビーム無し・
//     `scripts/audit-balance.mjs` の実測）∴**一周目は矢でだけ開く**。後で銅の剣以上を持って
//     再訪すればビームでも開く（`dark_tower 1,1` と同じ約束）＝射線は矢と同じ。
//   ・投擲物を止めるのは壁と未破壊の '!' だけ（`isTilePassableForProj`）＝水・門・宝箱は
//     素通りする∴射線は「Y から4方向へ壁に当たるまで」で数える。上＝(0,7) 壁・
//     下＝柱 (5,7)・左＝(2,2) 壁（窪みの仕切り）で切れ、残るのは右の (2,10) だけ。
//   ・水は Y と床の間を**幅 2 以上**で隔てる＝はしご（幅 1 だけ渡れる・D5 で入手）を持って
//     再訪しても小島に立てない＝剣で叩く近道ができない。
//   ・報酬＝ルピー×20（旧 10）。D7 `3,0` の浮島（20／25）と同じ帯。
//   ・D6 で弓を使う場所はここが初めて（D6 の Y は 0 枚だった）。D6 の他の部屋の主題
//     （倉庫番・かがり火・爆弾壁・分裂スライム）とも、D7 `3,0`（ブーメラン）とも重ならない。
//
// ■ 撤去したもの
//   石・ボタン・旧宝箱 B(2,9)・旧門 T(1,9) と旧 links（3,7→1,9）。看板は置かない。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／bgTiles／links／宝の中身が狙いどおり・石とボタンが残っていない
//   ・門を閉じたままでは宝箱に届かない／開ければ届く（門が本物）
//   ・Y の隣に立てるセルが 0（剣では叩けない）／Y への射線は (2,10) だけ
//   ・対照＝柱を外すと真下の岸から撃てる／水を1列床にすると隣に立てる（検査が空虚でない）
//   ・はしごで架けられる水が 1 枚も無い（Y も橋脚に数える＝ゲーム側の isLadderBank に合わせる）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-3-0-spring-target.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-3-0-spring-target.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { bfsLayer, HARD_BLOCKED, isLadderBridgeCell } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_6';
const ROOM  = '3,0';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
// tiles は '.'、水は下の SPRING（bgTiles）で重ねる。表示用の図はファイル冒頭。
const TARGET = [
	'############',
	'#B#........#',
	'#.#....Y...#',
	'#T#........#',
	'#..........#',
	'#......#...#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
// 泉＝rows 1-5 × cols 3-9 のうち、的 Y(2,7) と柱 (5,7) を除く全部。
const SPRING = {};
for (let r = 1; r <= 5; r++) for (let c = 3; c <= 9; c++) {
	if ((r === 2 && c === 7) || (r === 5 && c === 7)) continue;
	SPRING[`${r},${c}`] = TILE.WATER;
}
const TARGET_Y = '2,7';
const GATE     = '3,1';
const CHEST    = '1,1';
const LINKS    = [{ switchId: TARGET_Y, gateId: GATE }];
const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } };
const WANT_SHOOTERS = ['2,10'];

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
if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(SPRING)) {
	room.bgTiles = { ...SPRING };
	log.push(`  ${ROOM}: bgTiles（泉の水 ${Object.keys(SPRING).length} 枚）を敷いた`);
}
if (JSON.stringify(room.links ?? []) !== JSON.stringify(LINKS)) {
	log.push(`  ${ROOM}: links を ${(room.links ?? []).map((l) => `${l.switchId}→${l.gateId}`).join(' / ') || 'なし'} → ${TARGET_Y}→${GATE} にした`);
	room.links = LINKS.map((l) => ({ ...l }));
}
if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
	log.push(`  ${ROOM}: 宝箱を ${Object.entries(room.chestContents ?? {}).map(([k, v]) => `${k}=${v.name}`).join(' ') || 'なし'} → ${CHEST}=ルピー×20 にした`);
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
}
room.signData ??= {};
room.showConditions ??= {};
room.breakableWalls ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const isWater = (bg, k) => bg[k] === TILE.WATER;
// 入口（南の口 row9）から歩ける床。壁・水（tiles／bgTiles）・門は不可（open に入れた門だけ通す）。
function walkable(t, bg, open = new Set()) {
	const ok = (r, c) => {
		const k = `${r},${c}`;
		const ch = t[r][c];
		if (HARD_BLOCKED.has(ch) || isWater(bg, k)) return false;
		if (ch === TILE.GATE && !open.has(k)) return false;
		if (ch === TILE.STONE) return false;
		return true;
	};
	const seen = new Set(), q = [];
	for (let c = 0; c < 12; c++) if (ok(9, c)) { seen.add(`9,${c}`); q.push([9, c]); }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (nr < 0 || nr > 9 || nc < 0 || nc > 11 || seen.has(k)) continue;
			if (!ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
// cell へ矢が直線で届く立ち位置（壁で止まる・水／門／宝箱は素通り・射程の上限なし）。
function shootersOf(t, walk, cell) {
	const [r0, c0] = cell.split(',').map(Number);
	const out = [];
	for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
		for (let d = 1; ; d++) {
			const r = r0 + dr * d, c = c0 + dc * d;
			if (r < 0 || r > 9 || c < 0 || c > 11) break;
			if (t[r][c] === TILE.WALL || t[r][c] === TILE.BREAKABLE_WALL) break;
			if (walk.has(`${r},${c}`)) out.push(`${r},${c}`);
		}
	}
	return out.sort();
}
const neighborsOf = (cell) => {
	const [r, c] = cell.split(',').map(Number);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`);
};

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
const bg = room.bgTiles;
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列`, room.tiles.every((r) => Array.isArray(r) && r.length === 12));
check(`${ROOM} の bgTiles＝泉の水 ${Object.keys(SPRING).length} 枚`, JSON.stringify(bg) === JSON.stringify(SPRING));
check(`的 Y${TARGET_Y} と柱 (5,7) の下は水ではない`, !isWater(bg, TARGET_Y) && !isWater(bg, '5,7'));
check(`${ROOM} の links＝${TARGET_Y}→${GATE} の1本`, JSON.stringify(room.links) === JSON.stringify(LINKS));
check(`${ROOM} の宝箱＝${CHEST} のルピー×20 だけ`, JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
for (const ch of [TILE.STONE, TILE.BUTTON, TILE.SIGN]) {
	check(`${ROOM} に '${ch}' が残っていない`, !t.some((row) => row.includes(ch)));
}
{
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	check(`Y・門・宝箱はちょうど1枚ずつ`, count(TILE.SWITCH) === 1 && count(TILE.GATE) === 1 && count(TILE.CHEST) === 1);
}
check(`${ROOM} の看板データが空`, Object.keys(room.signData).length === 0);

// ── ② 門が本物＝閉じたままでは宝箱に届かない ──────────────────────────
{
	const closed = walkable(t, bg);
	const opened = walkable(t, bg, new Set([GATE]));
	check(`門を閉じたままでは宝箱 ${CHEST} にも窪み (2,1) にも届かない`, !closed.has(CHEST) && !closed.has('2,1'));
	check(`門を開ければ宝箱 ${CHEST} に届く`, opened.has(CHEST));
	check(`入口から東の縁 (2,10) と門の前 (4,1) まで歩ける`, closed.has('2,10') && closed.has('4,1'));
}

// ── ③ Y は矢でだけ＝隣に立てない・射線は (2,10) だけ ───────────────────
{
	const walk = walkable(t, bg, new Set([GATE]));   // 門を開けた後でも近道が増えないこと
	const adj = neighborsOf(TARGET_Y).filter((k) => walk.has(k));
	check(`Y${TARGET_Y} の隣に立てるセルが 0＝剣では叩けない（実測 [${adj}]）`, adj.length === 0);
	const shooters = shootersOf(t, walk, TARGET_Y);
	check(`Y${TARGET_Y} への射線＝[${WANT_SHOOTERS}]（実測 [${shooters}]）`, JSON.stringify(shooters) === JSON.stringify(WANT_SHOOTERS));
	// 対照①＝柱 (5,7) を床にすると真下の岸 (6,7) 以南から撃てる＝柱が射線を断っている
	const noPillar = grid();
	noPillar[5][7] = TILE.FLOOR;
	const s2 = shootersOf(noPillar, walkable(noPillar, bg, new Set([GATE])), TARGET_Y);
	check(`対照：柱 (5,7) を外すと真下の岸から撃てる（実測 [${s2}]）`, s2.includes('6,7') && s2.includes('8,7'));
	// 対照②＝的の東 (2,8)(2,9) の水を床にすると隣に立てる＝隣接の検査が空虚でない
	const bg2 = { ...bg };
	delete bg2['2,8']; delete bg2['2,9'];
	const adj2 = neighborsOf(TARGET_Y).filter((k) => walkable(t, bg2, new Set([GATE])).has(k));
	check(`対照：(2,8)(2,9) を床にすると Y の隣 (2,8) に立てる（実測 [${adj2}]）`, adj2.includes('2,8'));
}

// ── ④ はしごで小島へ渡れない ────────────────────────────────────────
// `lib/connectivity.mjs` は Y を HARD_BLOCKED（橋脚にならない）として数えるが、ゲーム本体の
// `game/passable.js` isLadderBank は TILE_META の passable を見る＝Y（passable:true）も橋脚になる。
// 的の小島そのものが橋脚になりうるので、ここではゲーム側の判定を写して数える。
const gameBank = (tt, bgx, r, c) => {
	if (r < 0 || r > 9 || c < 0 || c > 11) return false;
	const ch = tt[r][c];
	if (ch === TILE.WATER || ch === TILE.PIT || isWater(bgx, `${r},${c}`)) return false;
	if (ch === TILE.GATE) return false;   // 閉じた門は橋脚にならない（開いた後も周りに水が無い）
	return TILE_META[ch]?.passable ?? true;
};
const gameBridge = (tt, bgx, r, c) =>
	(gameBank(tt, bgx, r - 1, c) && gameBank(tt, bgx, r + 1, c)) ||
	(gameBank(tt, bgx, r, c - 1) && gameBank(tt, bgx, r, c + 1));
{
	const bridges = Object.keys(bg).filter((k) => gameBridge(t, bg, ...k.split(',').map(Number)));
	check(`はしごで架けられる水が 1 枚も無い（Y も橋脚に数える・実測 ${bridges.join(' ') || 'なし'}）`, bridges.length === 0);
	const helper = Object.keys(bg).filter((k) => isLadderBridgeCell(t, 10, 12, ...k.split(',').map(Number), bg));
	check(`lib/connectivity.mjs の判定でも 0 枚（実測 ${helper.join(' ') || 'なし'}）`, helper.length === 0);
	// 対照＝(2,9) を床にすると (2,8) が的 Y(2,7) と床 (2,9) に挟まれた幅 1 の水＝ゲーム側の判定で検出される
	const bg3 = { ...bg };
	delete bg3['2,9'];
	check(`対照：(2,9) を床にすると (2,8) が Y を橋脚にしたはしご橋として検出される`, gameBridge(t, bg3, 2, 8));
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
console.log(`# ${LAYER} ${ROOM}：飾りの石＋ボタンの門を「泉の的」に作り替える（キュー33）`);
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
