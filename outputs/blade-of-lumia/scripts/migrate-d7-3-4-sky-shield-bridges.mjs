// dungeon_7 `3,4`（十字路 `2,3` の南東＝`2,4` と `4,4` と `3,3` をつなぐ通り道）：D6 の写しの部屋を
// 「空の盾騎士の細橋」に作り替える（2026-10-04 / PLAN 実行キュー 39 の第4陣 2室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー39 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 .....$......     ← 床のルピー×5（4,5）
//      5 ............
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 ############
//   D6 `3,4` と同じ四角い広間に床のルピーが1つあるだけ。空中の遺跡なのに空が 1 枚も無く、敵もいない。
//
// ■ 新しい `3,4`＝空の盾騎士の細橋（地形＋敵だけの通り道＝キュー39 のユーザー判定どおり謎・報酬なし）
//      0 #####..#####     ← 3つの口（北 列5-6／西・東 行4-5）は変えない。南は壁のまま
//      1 #%%%%.%%%%%#     ← 北の細橋（列5）
//      2 #%%%%.%%%%%#
//      3 #%%%....%%%#
//      4 .%%%........     ← 東の細橋（行4）
//      5 ........%%%.     ← 西の細橋（行5）
//      6 #%%%....%%%#
//      7 #%%%.ζζ.%%%#     ← 盾騎士 ζ(7,5)(7,6)＝広場の南で北を向く
//      8 #%%%%%%%%%%#
//      9 ############
//   床が空へ崩れ、真ん中の広場（4×5）と、3つの口から広場へ渡る幅 1 の細橋だけが残った。
//   ・見せ場＝**盾騎士は正面からの攻撃を全部弾く（剣も矢もブーメランも）。崩すには横か背後へ回るしかない**
//     （`meta.blockFacing`＝向き直りは 720ms ごとの離散判断＝その隙に回り込む）。
//     - 広場（幅 4）では回り込める。**幅 1 の細橋の上では回り込めない**＝橋で正面から出会うと、
//       弾かれて押し戻されるだけになる。
//     - 盾騎士は遅い（1 秒に約 1 セル）＝口から広場まで橋を駆け抜ければ、橋の上で出会わずに広場で戦える。
//       もたつくと騎士が橋の口へ寄ってきて塞ぐ＝「橋で出会うな」。
//     - 答えはほかにもある＝爆弾の爆風は向きを持たない（`attackerDirFrom` が null）∴正面でも通る。
//       口の脇のくぼみ（西 (4,0)／東 (5,11)／北 (0,6)）に避けて、騎士が通り過ぎた横から斬る。
//   ・盾騎士は2体＝片方の背中を取ると、もう片方の正面に立ちやすい（広場が狭い）。
//   ・旧 床のルピー×5 は撤去（通り道は報酬なし）。
//   ・盾騎士は 5.5m の配置表の外＝`scripts/lib/enemy-placement.mjs` の EXTRA_ENEMY_ROOMS に宣言する。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／3つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵は盾騎士2体だけ・向きは北／脅威度 72.0（看板部屋 117.0 より軽い）／宝箱・看板・植生・床の拾い物が無い
//   ・どの口からでも、ほかの2つの口へ道具なしで歩ける／はしごで歩ける床が増えない／取り残された床が無い
//   ・3本の細橋はどのセルも横が空か壁（幅 1）＝橋の上では回り込めない
//   ・広場は 4×5 の床（回り込める）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-3-4-sky-shield-bridges.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-3-4-sky-shield-bridges.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '3,4';
const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#%%%%.%%%%%#',
	'#%%%%.%%%%%#',
	'#%%%....%%%#',
	'.%%%........',
	'........%%%.',
	'#%%%....%%%#',
	'#%%%.ζζ.%%%#',
	'#%%%%%%%%%%#',
	'############',
];
export const KNIGHTS = ['7,5', '7,6'];
export const KNIGHT_DIRS = { '7,5': 'up', '7,6': 'up' };
const EXPECT_THREAT = 72.0;
// 口のセル（隣室との開き）＝書き換え前と同じ。
export const EXITS = { 北: ['0,5', '0,6'], 西: ['4,0', '5,0'], 東: ['4,11', '5,11'] };
// 細橋（幅 1）のセル＝口から広場の手前まで。
export const BRIDGES = {
	北: ['0,5', '1,5', '2,5'],
	西: ['5,0', '5,1', '5,2', '5,3'],
	東: ['4,8', '4,9', '4,10', '4,11'],
};
// 広場＝行3〜7・列4〜7。
export const PLAZA = { r0: 3, r1: 7, c0: 4, c1: 7 };
const COMMENT = '【キュー39 空の盾騎士の細橋（2026-10-04）】床が空へ崩れ、真ん中の広場（4×5）と3つの口から渡る幅1の細橋だけが残った。'
	+ '見せ場＝盾騎士 ζ×2 は正面からの攻撃を全部弾く＝横か背後へ回るしかない。広場では回り込めるが、'
	+ '細橋の上では回り込めない＝騎士は遅いので橋を駆け抜けて広場で戦う（もたつくと橋の口を塞がれる）。'
	+ '爆弾の爆風は向きを持たない＝正面でも通る。口の脇のくぼみに避けて横から斬る手もある。'
	+ '報酬なしの通り道（旧 床のルピー×5 は撤去）。盤面は scripts/migrate-d7-3-4-sky-shield-bridges.mjs。';

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
// 細橋のセルが幅 1 か＝橋の向きに直交する両隣が空か壁（画面の外も壁扱い）。
export function bridgeIsNarrow(t, cells, axis) {
	const side = axis === 'h' ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
	return cells.every((k) => {
		const [r, c] = k.split(',').map(Number);
		return side.every(([dr, dc]) => !inside(r + dr, c + dc) || HARD_BLOCKED.has(t[r + dr][c + dc]));
	});
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
	// ＝[[field-tiles-are-char-arrays]]）。ζ は BMP 内の1文字＝split('') で1セル。
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => row.split(''));
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	if (Object.keys(room.floorItems ?? {}).length) {
		log.push(`  ${ROOM}: 床の拾い物を撤去した（${JSON.stringify(room.floorItems)}）`);
		room.floorItems = {};
	}
	if (JSON.stringify(room.enemyDirs ?? {}) !== JSON.stringify(KNIGHT_DIRS)) {
		room.enemyDirs = { ...KNIGHT_DIRS };
		log.push(`  ${ROOM}: 敵の向きを ${JSON.stringify(KNIGHT_DIRS)} にした`);
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
		check(`敵は盾騎士 ζ×2 だけ（実測 ${JSON.stringify(enemies)}）`,
			JSON.stringify(enemies) === JSON.stringify({ [TILE.SHIELD_KNIGHT]: KNIGHTS }));
		check(`盾騎士は正面ブロックを持つ（meta.blockFacing）`, !!ENEMY_META[TILE.SHIELD_KNIGHT]?.blockFacing);
		check(`敵の向きが ${JSON.stringify(KNIGHT_DIRS)}`, JSON.stringify(room.enemyDirs) === JSON.stringify(KNIGHT_DIRS));
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）＝十字路 2,3（看板部屋 117.0）より軽い`, threat === EXPECT_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
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
		const stranded = cellsOf(t, (ch) => !HARD_BLOCKED.has(ch)).filter((k) => !foot.has(k));
		check(`取り残された床が無い（実測 ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	}

	// ── ③ 細橋と広場 ─────────────────────────────────────────────────
	{
		// 口のセル（縁）は隣がくぼみ＝幅 2。橋として数えるのは口の内側から。
		check(`北の細橋（列5）は幅 1`, bridgeIsNarrow(t, BRIDGES.北.slice(1), 'v'));
		check(`西の細橋（行5）は幅 1`, bridgeIsNarrow(t, BRIDGES.西.slice(1), 'h'));
		check(`東の細橋（行4）は幅 1`, bridgeIsNarrow(t, BRIDGES.東.slice(0, -1), 'h'));
		const plaza = [];
		for (let r = PLAZA.r0; r <= PLAZA.r1; r++) for (let c = PLAZA.c0; c <= PLAZA.c1; c++) plaza.push(`${r},${c}`);
		check(`広場（行${PLAZA.r0}〜${PLAZA.r1}×列${PLAZA.c0}〜${PLAZA.c1}）はすべて歩ける床`, plaza.every((k) => foot.has(k)));
		check(`盾騎士はどちらも広場の中`, KNIGHTS.every((k) => plaza.includes(k)));
		const outside = [...foot].filter((k) => !plaza.includes(k) && !Object.values(BRIDGES).flat().includes(k)).sort();
		check(`広場と細橋の外の床は口の脇のくぼみ3つだけ（実測 ${outside.join(' ')}）`,
			JSON.stringify(outside) === JSON.stringify(['0,6', '4,0', '5,11']));
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
	console.log(`# ${LAYER} ${ROOM}：通り道を「空の盾騎士の細橋」に作り替える（キュー39 第4陣）`);
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
