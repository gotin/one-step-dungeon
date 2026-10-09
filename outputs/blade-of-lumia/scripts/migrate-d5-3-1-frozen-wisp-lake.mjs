// dungeon_5 `3,1`（通り道＝北の `3,0`・南の `3,2`・西の `2,1`・東の `4,1` をつなぐ・コンパスの部屋）：
// D4 の写しの部屋を「凍れる湖の鬼火」に作り替える（2026-10-09 / PLAN 実行キュー 40 の第3陣 4室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 ......n.....
//      5 ............
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   D4 `3,1` と同じ四角い広間の真ん中にコンパス `n` が落ちているだけ。敵も水も氷も無い。
//
// ■ 新しい `3,1`＝凍れる湖の鬼火（地形＋敵だけの通り道＝キュー39 のユーザー判定どおり謎・報酬なし）
//   （'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵・コンパスの文字は tiles 層に置く）
//      0 #####..#####     ← 北の口（列5-6）
//      1 #~~~~kk~~~~#
//      2 #~kkkkk~~~~#
//      3 #~k~~ψ~~~#~#
//      4 .kk~~~n~~kk.     ← 西・東の口（行4-5）・コンパス n (4,6) は書き換え前と同じセル＝湖へ突き出た桟橋の先
//      5 .kk~#~k~ψk~.
//      6 #~k~ψ~k~~k~#
//      7 #~kkkkkkkk~#
//      8 #~~~~kk~~~~#
//      9 #####..#####     ← 南の口（列5-6）
//   （ψ は呪い火＝tiles 層の敵。下地は水）
//   部屋の大半が凍れる湖に沈み、4つの口は湖をコの字に巡る幅1の氷の道だけでつながる
//   （北の口→東の口はまっすぐ 9 マスのところを、西・南を回って 23 マス歩く）。
//   ・見せ場＝**この部屋の水はプレイヤーを守らない**。D5 のここまでの敵（潜み鮫・射水魚・魚群）は水に縛られ、
//     水が境目だった。呪い火（D4 の看板の敵＝剣を封じる）は空を飛ぶ＝水を越えて、湖を遠回りする道の
//     プレイヤーへ真っすぐ寄って来る。道は遠回り、鬼火は近道。
//   ・コンパスは湖へ突き出た桟橋の先（三方が水）＝拾いに行くと三方の水から寄られる。
//   ・答え＝①弓で湖越しに射落とす（hp 3）②寄って来た所を斬る（ただし予告の後に隣にいると剣が 3 秒封じられる）
//     ③走って振り切る（鬼火はプレイヤーより遅い）。倒すことは必須でない。
//   ・氷の岩（湖の中の `#`）は鬼火を止める唯一の物＝飛ぶ敵にとって障害は壁だけ。
//   ・水棲の敵ではないが 5.5m の配置表の外＝`scripts/lib/enemy-placement.mjs` の EXTRA_ENEMY_ROOMS に宣言する。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と氷は bgTiles だけ／4つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵は呪い火だけ・どれも飛ぶ（move:'air'）・水の上から始まる・脅威度・宣言あり
//   ・コンパス n が書き換え前と同じセル・三方が水の桟橋の先／宝箱・看板・床の拾い物が無い
//   ・4つの口が道具なしで互いに歩ける／取り残された床が無い
//   ・道は遠回り＝口から口の歩く手数が、まっすぐの距離より十分長い組がある
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-3-1-frozen-wisp-lake.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-3-1-frozen-wisp-lake.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED, LADDER_OVER } from './lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_5';
const ROOM  = '3,1';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'......n.....',
	'............',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面（'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵・コンパスの文字は tiles 層に置く）──
export const GROUND_MAP = [
	'#####..#####',
	'#~~~~kk~~~~#',
	'#~kkkkk~~~~#',
	'#~k~~~~~~#~#',
	'.kk~~~k~~kk.',
	'.kk~#~k~~k~.',
	'#~k~~~k~~k~#',
	'#~kkkkkkkk~#',
	'#~~~~kk~~~~#',
	'#####..#####',
];
const W = TILE.CURSE_FIRE;
export const ENEMIES = { '3,5': W, '5,8': W, '6,4': W };
export const COMPASS_CELL = '4,6';
export const TARGET = GROUND_MAP.map((row, r) => [...row].map((ch, c) =>
	ENEMIES[`${r},${c}`] ?? (`${r},${c}` === COMPASS_CELL ? TILE.ITEM_COMPASS
		: (ch === TILE.WATER || ch === TILE.ICE ? TILE.FLOOR : ch))).join(''));
const cellsWhere = (pred) => GROUND_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (pred(ch) ? [`${r},${c}`] : [])));
export const WATER = cellsWhere((ch) => ch === TILE.WATER);
export const ICE = cellsWhere((ch) => ch === TILE.ICE);
export const EXITS = { 北: ['0,5', '0,6'], 南: ['9,5', '9,6'], 西: ['4,0', '5,0'], 東: ['4,11', '5,11'] };
// 湖の中の氷の岩（四方のどれかが水の壁）。
export const ROCKS = ['3,9', '5,4'];
const EXPECT_THREAT = 9.0;
const COMMENT = '【キュー40 凍れる湖の鬼火（2026-10-09）】部屋の大半が凍れる湖に沈み、4つの口は湖をコの字に巡る幅1の氷の道だけでつながる。'
	+ '湖の上に呪い火（剣を封じる鬼火）が3体。鬼火は空を飛ぶ＝水を越えて、遠回りする道のプレイヤーへ真っすぐ寄って来る'
	+ '（この部屋の水はプレイヤーを守らない）。コンパスは湖へ突き出た桟橋の先（三方が水）。'
	+ '答え＝弓で湖越しに射落とす／寄って来た所を斬る（予告の後に隣にいると剣が封じられる）／走って振り切る。報酬なしの通り道。'
	+ '盤面は scripts/migrate-d5-3-1-frozen-wisp-lake.mjs。';

// ── 幾何の道具（番人からも import）────────────────────────────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// 水を tiles 層へ畳み込んだ実効の盤面（`connectivity.mjs cellTile` と同じ考え＝bgTiles の水も水）。
// 氷は歩ける地面＝床として扱う。
export const effective = () => GROUND_MAP.map((row) => [...row].map((ch) => (ch === TILE.ICE ? TILE.FLOOR : ch)));
// from から歩けるセルと手数（Map）。withLadder なら幅 1 の水を、進む向きの先が地上のときだけ 1 マス渡る
// ＝`game/passable.js isLadderCrossable`。
export function walkDist(t, from, withLadder = false) {
	const blocked = (r, c) => BLOCKED.has(t[r][c]);
	const dist = new Map([[from, 0]]);
	const q = [from];
	while (q.length) {
		const cur = q.shift();
		const [r, c] = P(cur);
		for (const [dr, dc] of DIRS4) {
			const nr = r + dr, nc = c + dc;
			if (!inside(nr, nc)) continue;
			let to = null, cost = 1;
			if (!blocked(nr, nc)) to = `${nr},${nc}`;
			else if (withLadder && LADDER_OVER.has(t[nr][nc]) && inside(nr + dr, nc + dc) && !blocked(nr + dr, nc + dc)) { to = `${nr + dr},${nc + dc}`; cost = 2; }
			if (to && !dist.has(to)) { dist.set(to, dist.get(cur) + cost); q.push(to); }
		}
	}
	return dist;
}
export const walkable = (t, from, withLadder = false) => new Set(walkDist(t, from, withLadder).keys());
// 床 k の四方に水があるか／いくつあるか。
export const waterSides = (k) => {
	const [r, c] = P(k);
	return DIRS4.filter(([dr, dc]) => WATER.includes(`${r + dr},${c + dc}`)).length;
};

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の着地セル
	const OPEN = new Set(['T', '!', 'D', '=']);
	const runs = () => ({
		ladder: bfsLayer(stages, START, { withLadder: true, openTiles: OPEN }),
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: true, openTiles: null }),
	});
	// 基準は書き換え前の盤面で測る＝適用済みの地図に再実行しても同じ（冪等）。
	const before = room.tiles.map(rowStr);
	const saved = { tiles: room.tiles, bgTiles: room.bgTiles };
	room.tiles = ORIGINAL.map((row) => row.split(''));
	room.bgTiles = {};
	const base = runs();
	room.tiles = saved.tiles;
	room.bgTiles = saved.bgTiles;
	const baseLinks = JSON.stringify(room.links ?? []);

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => [...row]);   // [[field-tiles-are-char-arrays]]
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	const wantBg = Object.fromEntries(GROUND_MAP.flatMap((row, r) => [...row].flatMap((ch, c) =>
		(ch === TILE.WATER || ch === TILE.ICE ? [[`${r},${c}`, ch]] : []))));
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(wantBg)) {
		room.bgTiles = wantBg;
		log.push(`  ${ROOM}: bgTiles に水 ${WATER.length} 枚・氷 ${ICE.length} 枚`);
	}
	if (room.comment !== COMMENT) {
		room.comment = COMMENT;
		log.push(`  ${ROOM}: comment を書き換えた`);
	}
	room.links ??= [];
	room.signData ??= {};
	room.npcData ??= {};
	room.chestContents ??= {};
	room.floorItems ??= {};

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const tl = room.tiles.map((r) => [...r]);
	const t = effective();
	const at = (g, k) => { const [r, c] = P(k); return g[r]?.[c]; };
	const cellsOf = (g, pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(g[r][c])) out.push(`${r},${c}`);
		return out;
	};
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	check(`tiles 層に水・氷を書いていない（どちらも bgTiles の単一ソース）`,
		cellsOf(tl, (ch) => ch === TILE.WATER || ch === TILE.ICE).length === 0);
	check(`bgTiles＝水 ${WATER.length} 枚・氷 ${ICE.length} 枚だけ`, JSON.stringify(room.bgTiles) === JSON.stringify(wantBg));
	for (const [name, cells] of Object.entries(EXITS)) {
		check(`${name}の口（${cells.join(' ')}）が開いている（床・氷なし）`,
			cells.every((k) => at(tl, k) === TILE.FLOOR && !room.bgTiles[k]));
	}
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは4つの口だけ（実測 ${open.join(' ')}）`, JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = {};
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const ch = tl[r][c];
			if (ENEMY_META[ch]) enemies[`${r},${c}`] = ch;
		}
		check(`敵は呪い火 ψ×${Object.keys(ENEMIES).length} だけ（実測 ${Object.keys(enemies).length} 体）`,
			JSON.stringify(Object.entries(enemies).sort()) === JSON.stringify(Object.entries(ENEMIES).sort()));
		check(`どれも飛ぶ（move:'air'＝水を越える）・剣を封じる・水の上から始まる`,
			Object.entries(ENEMIES).every(([k, ch]) => ENEMY_META[ch].move === 'air'
				&& ENEMY_META[ch].inflict?.type === 'sealSword' && WATER.includes(k)));
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）＝看板部屋 2,3（76.0）より軽い`, threat === EXPECT_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`コンパス n が書き換え前と同じセル ${COMPASS_CELL} に1つだけ`,
		JSON.stringify(cellsOf(tl, (ch) => ch === TILE.ITEM_COMPASS)) === JSON.stringify([COMPASS_CELL])
		&& ORIGINAL[P(COMPASS_CELL)[0]][P(COMPASS_CELL)[1]] === TILE.ITEM_COMPASS);
	check(`コンパスは三方が水の桟橋の先（実測 ${waterSides(COMPASS_CELL)} 方）`, waterSides(COMPASS_CELL) === 3);
	check(`宝箱・看板・本文・床の拾い物・回復薬が無い（報酬なしの通り道）`,
		cellsOf(tl, (ch) => ch === TILE.CHEST || ch === TILE.SIGN || ch === TILE.ITEM_HEAL_POTION).length === 0
		&& Object.keys(room.chestContents).length === 0 && Object.keys(room.floorItems).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`石・植生が無い`, cellsOf(tl, (ch) => ch === TILE.STONE || ch === TILE.TREE || ch === TILE.BUSH).length === 0);
	check(`links が書き換え前と同じ・showConditions が空・enemyDirs が空`,
		JSON.stringify(room.links) === baseLinks
		&& Object.keys(room.showConditions ?? {}).length === 0 && Object.keys(room.enemyDirs ?? {}).length === 0);
	check(`湖の氷の岩（${ROCKS.join(' ')}）は壁で、水に接する`,
		ROCKS.every((k) => at(tl, k) === TILE.WALL && waterSides(k) >= 2));

	// ── ② 歩ける範囲 ──────────────────────────────────────────────
	const foot = walkable(t, EXITS.南[0]);
	for (const [name, cells] of Object.entries(EXITS)) {
		check(`道具なしで南の口から${name}の口へ歩ける`, cells.every((k) => foot.has(k)));
	}
	{
		const stranded = cellsOf(t, (ch) => !BLOCKED.has(ch)).filter((k) => !foot.has(k));
		check(`取り残された床が無い（実測 ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	}
	{
		// 道は遠回り＝北の口→東の口の歩く手数が、まっすぐの距離（マンハッタン）の2倍以上。
		const d = walkDist(t, EXITS.北[1]).get(EXITS.東[0]);
		const [r0, c0] = P(EXITS.北[1]), [r1, c1] = P(EXITS.東[0]);
		const straight = Math.abs(r1 - r0) + Math.abs(c1 - c0);
		check(`北の口→東の口は歩いて ${d} 手・まっすぐ ${straight}＝2倍以上の遠回り`, d >= straight * 2);
	}

	// ── ③ 層の到達性は不変 ─────────────────────────────────────────
	{
		const now = runs();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`はしごありの到達室が書き換え前と同じ（${now.ladder.reachedRooms.size} 室）`, same(now.ladder.reachedRooms, base.ladder.reachedRooms));
		check(`徒歩の到達室が書き換え前と同じ（${now.foot.reachedRooms.size} 室）`, same(now.foot.reachedRooms, base.foot.reachedRooms));
		check(`門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`, same(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${now.closed.deadEdges.length}）`, now.closed.deadEdges.length === 0);
	}

	// ── 出力 ───────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：通り道を「凍れる湖の鬼火」に作り替える（キュー40 第3陣 4室目）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => {
		const now = rowStr(row);
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === now ? '=' : '→'}   ${now}   ${GROUND_MAP[i]}`);
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
