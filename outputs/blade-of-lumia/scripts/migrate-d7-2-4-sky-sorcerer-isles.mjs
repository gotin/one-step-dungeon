// dungeon_7 `2,4`（十字路 `2,3` の南＝`1,4` と `3,4` をつなぐ通り道）：D6 の写しの部屋を
// 「空の術士の浮島」に作り替える（2026-10-04 / PLAN 実行キュー 39 の第4陣 1室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー39 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #....B.....#     ← 宝箱 B(2,5)＝ルピー×5
//      3 #..........#
//      4 ............
//      5 ............
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 ############
//   D6 `2,4` と同じ四角い広間に宝箱が1つあるだけ。空中の遺跡なのに空が 1 枚も無く、敵もいない。
//
// ■ 新しい `2,4`＝空の術士の浮島（地形＋敵だけの通り道＝キュー39 のユーザー判定どおり謎・報酬なし）
//      0 #####..#####     ← 3つの口（北 列5-6／西・東 行4-5）は変えない。南は壁のまま
//      1 #%..%..%...#
//      2 #.η.%..%..%#     ← 術士 η(2,2)＝北西の浮島
//      3 #%%%%..%%%%#
//      4 ............     ← 西↔東の土手道（幅 2）
//      5 ............
//      6 #%%%%%%%%%%#
//      7 #..%%..%.η.#     ← 術士 η(7,9)＝南東の浮島
//      8 #...%..%%..#
//      9 ############
//   床が割れて空へ落ち、T 字の土手道（北の口からの道＋西↔東の道）だけが残った広間。
//   割れ残った床は浮島（北に2つ・南に3つ）になって空に浮く＝**歩いては行けない**（はしごも空は渡れない）。
//   ・見せ場＝**術士は浮島にも出る＝剣が届かない所から撃ってくる**。
//     - 術士の出現先は「プレイヤーから縦横ちょうど3セル・敵が立てる床」（`pickBlinkCell`）。
//       浮島は土手道から縦横3セルの所に並べた∴出現の約3回に1回は浮島＝剣の届かない所に出る。
//       浮島と土手道の間は空が1枚以上（最短 2.0 セル）＝剣（届き 1.2）では叩けない。
//     - 術士の弱点は矢（×2）。出現先は必ずプレイヤーと同じ行か列＝**出た方を向けばそのまま射線**。
//       D7 は弓の卒業試験のダンジョン＝矢で落とす読みの速さを試す（魔弾は空の上を越えて来る）。
//     - 空の割れ目の列（列4・列7）や角に立つと、縦の3セル先が空＝浮島には出られない
//       ＝**術士は土手道の上にしか出ない**（剣で殴れる）。立ち位置で出る場所を選べる。
//   ・術士は2体＝出た方を向けば盾で魔弾を防げるが、前と後ろに出られると片方は防げない
//     （GUIDE 7-16＝盾で防げる攻撃しか持たない敵は「向く理由」と組むと完全防御になる＝2体で崩す）。
//   ・宝箱 B(2,5)＝ルピー×5 は撤去（通り道は報酬なし）。この宝箱を作業台にしていた
//     `tests/chest-content-shape.spec.js`・`tests/chest-reward-icon.spec.js` は同じ形の
//     `dungeon_6 2,4` の宝箱（ルピー×5・D6 は写しの元＝作り替えない側）へ移した。
//   ・術士は 5.5m の配置表の外＝`scripts/lib/enemy-placement.mjs` の EXTRA_ENEMY_ROOMS に宣言する
//     （弱点の弓は D7 の時点で持っている＝`toolsUsableIn`）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／3つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵は術士2体だけ・どちらも浮島の上／脅威度 36.0／宝箱・看板・植生が無い
//   ・どの口からでも、ほかの2つの口へ道具なしで歩ける／はしごで歩ける床が増えない
//   ・浮島は歩いて行けない／浮島から歩ける床まで剣の届き（1.2）より遠い
//   ・歩ける床のどのセルに立っても、術士の出現先（縦横3セル）が1つ以上ある＝術士が出られない床が無い
//   ・浮島に出る床が十分ある／土手道にしか出ない床（立ち位置の答え）もある
//   ・対照＝浮島を空で塗ると術士が浮島に出る床が 0（＝浮島が出現先を作っている）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-2-4-sky-sorcerer-isles.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-2-4-sky-sorcerer-isles.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';
import { toolsUsableIn } from '../shared/progression.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '2,4';
const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#%..%..%...#',
	'#.η.%..%..%#',
	'#%%%%..%%%%#',
	'............',
	'............',
	'#%%%%%%%%%%#',
	'#..%%..%.η.#',
	'#...%..%%..#',
	'############',
];
export const SORCERERS = ['2,2', '7,9'];
const EXPECT_THREAT = 36.0;
// 口のセル（隣室との開き）＝書き換え前と同じ。
export const EXITS = { 北: ['0,5', '0,6'], 西: ['4,0', '5,0'], 東: ['4,11', '5,11'] };
// 術士の出現の距離（ENEMY_META の blink.range）。
const BLINK = ENEMY_META[TILE.SORCERER].blink.range;
const SWORD_REACH = 1.2;   // game/constants.js（ゲーム側の定数はブラウザ用の import を含む∴ここに写す）
const COMMENT = '【キュー39 空の術士の浮島（2026-10-04）】床が割れて空へ落ち、T 字の土手道だけが残った広間。'
	+ '割れ残った床は浮島（北2・南3）になって空に浮く＝歩いては行けない。'
	+ '見せ場＝術士 η×2 はプレイヤーから縦横3セルの床に出る∴浮島にも出る＝剣が届かず弱点の矢で落とす'
	+ '（D7 は弓の卒業試験）。空の割れ目の列に立つと土手道にしか出ない＝立ち位置で出る場所を選べる。'
	+ '報酬なしの通り道（旧 宝箱 ルピー×5 は撤去）。盤面は scripts/migrate-d7-2-4-sky-sorcerer-isles.mjs。';

// ── 幾何の道具（番人からも import）────────────────────────────────────
// from から歩ける床（敵の文字は湧く前の床＝歩ける）。withLadder なら幅 1 の穴/水を
// 1 マスだけ渡れる＝エンジンの進入軸の橋（`game/passable.js`）。空 '%' ははしごの対象外。
export function walkable(t, from, withLadder) {
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
// 術士の出現先＝プレイヤーのセルから縦横ちょうど BLINK セルの、敵が立てる床
// （`game/enemy-ai.js pickBlinkCell` → `isPassableForEnemy`＝空・穴・壁・水は不可）。
export function blinkTargets(t, r, c) {
	return [[-BLINK, 0], [BLINK, 0], [0, -BLINK], [0, BLINK]]
		.map(([dr, dc]) => [r + dr, c + dc])
		.filter(([y, x]) => inside(y, x) && !HARD_BLOCKED.has(t[y][x]))
		.map(([y, x]) => `${y},${x}`);
}
// 歩ける床ごとの出現先の内訳（浮島 isle／土手道 path）。
export function blinkTable(t, foot) {
	const out = [];
	for (const k of foot) {
		const [r, c] = k.split(',').map(Number);
		const cands = blinkTargets(t, r, c);
		out.push({ k, cands, isle: cands.filter((x) => !foot.has(x)), path: cands.filter((x) => foot.has(x)) });
	}
	return out;
}

// ── 読み込み ─────────────────────────────────────────────────────────
// 盤面（TARGET）と道具は番人からも import する∴直接実行されたときだけ main を走らせる（呼ぶのはファイル末尾）。
function main() {
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

	// ── 書き換え ───────────────────────────────────────────────────────
	// tiles は「文字の配列の配列」で持つ（行文字列にするとゲームが落ちる
	// ＝[[field-tiles-are-char-arrays]]）。η は BMP 内の1文字＝split('') で1セル。
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => row.split(''));
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	if (Object.keys(room.chestContents ?? {}).length) {
		log.push(`  ${ROOM}: 宝箱の中身を撤去した（${JSON.stringify(room.chestContents)}）`);
		room.chestContents = {};
	}
	if (room.comment !== COMMENT) {
		room.comment = COMMENT;
		log.push(`  ${ROOM}: comment を書き換えた`);
	}
	room.links ??= [];
	room.bgTiles ??= {};
	room.signData ??= {};
	room.npcData ??= {};
	room.chestContents ??= {};
	room.floorItems ??= {};
	room.enemyDirs ??= {};

	// ── ① 盤面とデータ ────────────────────────────────────────────────
	const t = grid(room);
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	for (const [name, cells] of Object.entries(EXITS)) {
		check(`${name}の口（${cells.join(' ')}）が開いている`, cells.every((k) => at(t, k) === TILE.FLOOR));
	}
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは3つの口だけ（実測 ${open.join(' ')}）`, JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = {};
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const ch = t[r][c];
			if (ENEMY_META[ch]) (enemies[ch] ??= []).push(`${r},${c}`);
		}
		check(`敵は術士 η×2 だけ（実測 ${JSON.stringify(enemies)}）`,
			JSON.stringify(enemies) === JSON.stringify({ [TILE.SORCERER]: SORCERERS }));
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）＝十字路 2,3（看板部屋 117.0）より軽い`, threat === EXPECT_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
		check(`術士の弱点（矢）の道具＝弓を D7 の時点で持っている`, toolsUsableIn(data)[LAYER]?.has('bow'));
	}
	check(`宝箱・看板・本文・床の拾い物が無い（報酬なしの通り道）`,
		cellsOf(t, (ch) => ch === TILE.CHEST || ch === TILE.SIGN).length === 0
		&& Object.keys(room.chestContents).length === 0 && Object.keys(room.floorItems).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`石・植生が無い`, cellsOf(t, (ch) => ch === TILE.STONE || ch === TILE.TREE || ch === TILE.BUSH).length === 0);
	check(`links が書き換え前と同じ・bgTiles が空・showConditions が空`,
		JSON.stringify(room.links) === baseLinks && Object.keys(room.bgTiles).length === 0
		&& Object.keys(room.showConditions ?? {}).length === 0);

	// ── ② 歩ける範囲 ──────────────────────────────────────────────────
	const foot = walkable(t, EXITS.北[0], false);
	for (const [from, fromCells] of Object.entries(EXITS)) {
		const f = walkable(t, fromCells[0], false);
		for (const [to, cells] of Object.entries(EXITS)) {
			if (to === from) continue;
			check(`道具なしで${from}の口から${to}の口へ歩ける`, cells.every((k) => f.has(k)));
		}
	}
	{
		const ladder = walkable(t, EXITS.北[0], true);
		check(`はしごがあっても空は渡れない（歩ける ${foot.size} マス＝はしご ${ladder.size} マス）`, foot.size === ladder.size);
	}
	const isles = cellsOf(t, (ch) => !HARD_BLOCKED.has(ch)).filter((k) => !foot.has(k));
	{
		check(`術士はどちらも浮島（歩いて行けない床）の上に置いた`, SORCERERS.every((k) => isles.includes(k)));
		let minD = Infinity;
		for (const a of isles) for (const b of foot) {
			const [ar, ac] = a.split(',').map(Number), [br, bc] = b.split(',').map(Number);
			minD = Math.min(minD, Math.hypot(ar - br, ac - bc));
		}
		check(`浮島 ${isles.length} セルから歩ける床までの最短 ${minD.toFixed(2)} ＞ 剣の届き ${SWORD_REACH}（浮島の術士は剣で叩けない）`,
			isles.length > 0 && minD > SWORD_REACH);
	}

	// ── ③ 術士の出現先（浮島にも出る・立ち位置で選べる）──────────────────
	{
		const table = blinkTable(t, foot);
		const none = table.filter((x) => x.cands.length === 0).map((x) => x.k);
		check(`歩ける床のどこに立っても術士の出現先がある（無いと術士がその場に残る＝実測 ${none.length} セル）`, none.length === 0);
		const toIsle = table.filter((x) => x.isle.length > 0);
		check(`浮島に出得る床が歩ける床の 4 割以上（${toIsle.length}/${foot.size}）`, toIsle.length * 10 >= foot.size * 4);
		const p = table.reduce((s, x) => s + x.isle.length / x.cands.length, 0) / foot.size;
		check(`1回の出現が浮島になる平均確率が 0.25〜0.5（実測 ${p.toFixed(2)}）＝剣で殴れる出現も残る`, p >= 0.25 && p <= 0.5);
		const pathOnly = table.filter((x) => x.isle.length === 0 && x.cands.length > 0).map((x) => x.k);
		check(`土手道にしか出ない立ち位置が土手道の上にある（立ち位置の答え・実測 ${pathOnly.join(' ')}）`,
			['4,4', '4,7', '5,4', '5,7'].every((k) => pathOnly.includes(k)));
		// 対照＝浮島を空で塗ると、浮島に出る床が 0 になる＝浮島が出現先を作っている
		// （[[blade-control-experiment-needs-tile-wall]]＝必ず NO になる既知のタイルで塗る）。
		const ctl = grid(room);
		for (const k of isles) { const [r, c] = k.split(',').map(Number); ctl[r][c] = TILE.SKY; }
		const ctlTable = blinkTable(ctl, walkable(ctl, EXITS.北[0], false));
		check(`対照：浮島を空で塗ると、歩ける床から出現先が歩けない床になるセルが 0`,
			ctlTable.every((x) => x.isle.length === 0));
	}

	// ── ④ 層の到達性は不変 ─────────────────────────────────────────────
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

	// ── 出力 ───────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：通り道を「空の術士の浮島」に作り替える（キュー39 第4陣）`);
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

// ── 道具 ─────────────────────────────────────────────────────────────
function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function grid(room) { return room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split(''))); }
function at(t, k) { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; }
function inside(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
function cellsOf(t, pred) {
	const out = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
	return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
