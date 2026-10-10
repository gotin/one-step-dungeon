// dungeon_5 `3,0`（通り道＝南の `3,1`・東の `4,0` をつなぐ・回復薬の部屋）：
// D4 の写しの部屋を「凍れる氷原の分裂スライム」に作り替える（2026-10-10 / PLAN 実行キュー 40 の第3陣 5室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 #...........
//      5 #....7......
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   D4 `3,0` と同じ四角い広間に回復薬 `7` が落ちているだけ。敵も水も氷も無い。
//
// ■ 新しい `3,0`＝凍れる氷原の分裂スライム（地形＋敵だけの通り道＝キュー39 のユーザー判定どおり謎・報酬なし）
//   （'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵・回復薬の文字は tiles 層に置く）
//      0 ############
//      1 #~~~~~~~~~~#
//      2 #~kδkkδ~~~~#
//      3 #~kkδkk~~~~#
//      4 #~δkkkkkkkk.    ← 東の口（行4-5）。行4 の列7-9 は湖を渡る幅1の氷の堤
//      5 #~kkk7k~~~k.    ← 回復薬 7 (5,5) は書き換え前と同じセル
//      6 #~kδkkk~~~~#
//      7 #~kkkkk~~~~#
//      8 #~~~~kk~~~~#
//      9 #####..#####     ← 南の口（列5-6）
//   （δ は分裂スライム＝tiles 層の敵。下地は氷）
//   凍れる湖に浮かぶ氷原（5×6）に分裂スライム δ×5。氷原から東の口へは湖を渡る幅1の氷の堤だけ。
//   ・見せ場＝**斬るほど増える群れ＝足元の爆弾1個で片が付く**。スライムは鈍いが入ってきたプレイヤーへ一斉に寄り、
//     剣で倒すとその場と隣の空いた床へ小型2体に分かれる＝氷原で斬り合うと、まわりを小型に埋められる
//     （実測＝隣に最大6体）。分裂スライムの弱点は爆弾（分裂させずに潰す）で、**プレイヤーの爆弾は自分を傷めない**
//     ＝足元に置いて群れが寄るのを待てば、1個でまとめて吹き飛ぶ。D6 の看板部屋 `2,3` で会った敵の「解き方」を
//     ここで教える（D6 は D5 より先に遊ぶ）。
//   ・答え＝①足元に爆弾を置いて群れを待つ ②剣で斬り合う（増えた小型は1振りで倒れる・削られる）
//     ③鈍いので氷原の縁を回って堤へ駆け抜ける。倒すことは必須でない。
//   ・湖の役目＝群れを狭い氷原に閉じ込めて自分のまわりへ寄せる・東の口への道を
//     幅1の堤1本に絞る（駆け抜けるなら群れの脇を抜けて堤へ乗る）。
//   ・D5 のここまでの通り道（鮫・射水魚・魚群・鬼火）は水の中／水の上の敵だった＝この部屋は陸の敵と爆弾。
//     D7 の通り道（猪・術士・盾騎士・爆弾鬼・骸骨）とも敵・答えが重ならない。
//   ・⚠️ 叩き台を作る途中で捨てた見せ場＝「幅1の堤で斬れば小型が一列に並んで1体ずつ斬れる」。スライムは
//     素朴に寄るだけ（道を探さない）で、堤の口の手前で前後に揺れて止まり、実測では堤で斬り合う方が削られた
//     （.scratch/q40-3-0-try.mjs）。∴堤は見せ場にせず、道の形としてだけ使う。
//   ・5.5m の配置表の外に置く敵＝`scripts/lib/enemy-placement.mjs` の EXTRA_ENEMY_ROOMS に宣言する。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と氷は bgTiles だけ／2つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵は分裂スライムだけ・どれも氷原の氷の上から始まる・脅威度・宣言あり
//   ・回復薬が書き換え前と同じセル・同じ中身／宝箱・看板が無い
//   ・2つの口が道具なしで互いに歩ける／取り残された床が無い／東の口へは堤を通るしかない
//   ・堤は幅1（両側が水）・氷原は開けている（四方が床のセルがある）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-3-0-frozen-slime-field.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-3-0-frozen-slime-field.mjs         # 書き込み

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
const ROOM  = '3,0';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...........',
	'#....7......',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面（'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵・回復薬の文字は tiles 層に置く）──
export const GROUND_MAP = [
	'############',
	'#~~~~~~~~~~#',
	'#~kkkkk~~~~#',
	'#~kkkkk~~~~#',
	'#~kkkkkkkkk.',
	'#~kkkkk~~~k.',
	'#~kkkkk~~~~#',
	'#~kkkkk~~~~#',
	'#~~~~kk~~~~#',
	'#####..#####',
];
const S = TILE.SPLIT_SLIME;
export const ENEMIES = { '2,3': S, '2,6': S, '3,4': S, '4,2': S, '6,3': S };
export const POTION_CELL = '5,5';
export const TARGET = GROUND_MAP.map((row, r) => [...row].map((ch, c) =>
	ENEMIES[`${r},${c}`] ?? (`${r},${c}` === POTION_CELL ? TILE.ITEM_HEAL_POTION
		: (ch === TILE.WATER || ch === TILE.ICE ? TILE.FLOOR : ch))).join(''));
const cellsWhere = (pred) => GROUND_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (pred(ch) ? [`${r},${c}`] : [])));
export const WATER = cellsWhere((ch) => ch === TILE.WATER);
export const ICE = cellsWhere((ch) => ch === TILE.ICE);
export const EXITS = { 南: ['9,5', '9,6'], 東: ['4,11', '5,11'] };
// 湖を渡る幅1の氷の堤（両側＝北と南が水）。
export const DIKE = ['4,7', '4,8', '4,9'];
const EXPECT_THREAT = 60.0;
const COMMENT = '【キュー40 凍れる氷原の分裂スライム（2026-10-10）】凍れる湖に浮かぶ氷原と、氷原から東の口へ湖を渡る幅1の氷の堤。'
	+ '氷原に分裂スライムが5体。剣で倒すとその場と隣の空いた床へ小型2体に分かれる＝斬り合うと小型にまわりを埋められる。'
	+ '弱点は爆弾（分裂させずに潰す）で、プレイヤーの爆弾は自分を傷めない＝足元に置いて群れを待てば1個で片が付く。'
	+ '回復薬は書き換え前と同じセル。報酬なしの通り道。'
	+ '盤面は scripts/migrate-d5-3-0-frozen-slime-field.mjs。';

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
// 床 k の四方のうち歩ける床の数。
export const floorSides = (t, k) => {
	const [r, c] = P(k);
	return DIRS4.filter(([dr, dc]) => inside(r + dr, c + dc) && !BLOCKED.has(t[r + dr][c + dc])).length;
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
	const basePotion = JSON.stringify(room.floorItems ?? {});

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
		check(`画面の縁で開いているのは2つの口だけ（実測 ${open.join(' ')}）`, JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = {};
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const ch = tl[r][c];
			if (ENEMY_META[ch]) enemies[`${r},${c}`] = ch;
		}
		check(`敵は分裂スライム δ×${Object.keys(ENEMIES).length} だけ（実測 ${Object.keys(enemies).length} 体）`,
			JSON.stringify(Object.entries(enemies).sort()) === JSON.stringify(Object.entries(ENEMIES).sort()));
		check(`どれも分裂する・爆弾で分裂を止められる・氷の上から始まる`,
			Object.entries(ENEMIES).every(([k, ch]) => ENEMY_META[ch].split?.count === 2
				&& ENEMY_META[ch].split?.blockedBy === 'bomb' && ICE.includes(k)));
		check(`敵はどれも氷原から始まる（堤・堤の先には居ない）`, Object.keys(ENEMIES).every((k) => !DIKE.includes(k)));
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）＝看板部屋 2,3（76.0）より軽い`, threat === EXPECT_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`回復薬 7 が書き換え前と同じセル ${POTION_CELL} に1つだけ・floorItems は書き換え前と同じ`,
		JSON.stringify(cellsOf(tl, (ch) => ch === TILE.ITEM_HEAL_POTION)) === JSON.stringify([POTION_CELL])
		&& ORIGINAL[P(POTION_CELL)[0]][P(POTION_CELL)[1]] === TILE.ITEM_HEAL_POTION
		&& JSON.stringify(room.floorItems) === basePotion && room.floorItems[POTION_CELL]?.type === 'potion');
	check(`宝箱・看板・本文が無い（報酬なしの通り道）`,
		cellsOf(tl, (ch) => ch === TILE.CHEST || ch === TILE.SIGN).length === 0
		&& Object.keys(room.chestContents).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`石・植生・壁の柱が無い（内側の壁は0）`,
		cellsOf(tl, (ch) => ch === TILE.STONE || ch === TILE.TREE || ch === TILE.BUSH).length === 0
		&& cellsOf(tl, (ch) => ch === TILE.WALL).every((k) => { const [r, c] = P(k); return r === 0 || r === 9 || c === 0 || c === 11; }));
	check(`links が書き換え前と同じ・showConditions が空・enemyDirs が空`,
		JSON.stringify(room.links) === baseLinks
		&& Object.keys(room.showConditions ?? {}).length === 0 && Object.keys(room.enemyDirs ?? {}).length === 0);

	// ── ② 歩ける範囲と形 ───────────────────────────────────────────
	const foot = walkable(t, EXITS.南[0]);
	for (const [name, cells] of Object.entries(EXITS)) {
		check(`道具なしで南の口から${name}の口へ歩ける`, cells.every((k) => foot.has(k)));
	}
	{
		const stranded = cellsOf(t, (ch) => !BLOCKED.has(ch)).filter((k) => !foot.has(k));
		check(`取り残された床が無い（実測 ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	}
	check(`堤（${DIKE.join(' ')}）は幅1＝北と南が水`,
		DIKE.every((k) => { const [r, c] = P(k); return WATER.includes(`${r - 1},${c}`) && WATER.includes(`${r + 1},${c}`); }));
	{
		// 東の口へは堤を通るしかない＝堤のどれか1枚を壁にすると東の口へ届かない。
		const ok = DIKE.every((k) => {
			const g = effective(); const [r, c] = P(k); g[r][c] = TILE.WALL;
			return !walkable(g, EXITS.南[0]).has(EXITS.東[0]);
		});
		check(`東の口へは堤を通るしかない（堤のどの1枚を塞いでも届かない）`, ok);
		// はしごがあっても堤を迂回できない（湖は幅2以上）。
		const g = effective(); const [r, c] = P(DIKE[1]); g[r][c] = TILE.WALL;
		check(`はしごがあっても堤を迂回できない`, !walkable(g, EXITS.南[0], true).has(EXITS.東[0]));
	}
	{
		const open = cellsOf(t, (ch) => !BLOCKED.has(ch)).filter((k) => floorSides(t, k) === 4 && !DIKE.includes(k));
		check(`氷原は開けている（四方が床のセル ${open.length} 枚）`, open.length >= 12);
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
	console.log(`# ${LAYER} ${ROOM}：通り道を「凍れる氷原の分裂スライム」に作り替える（キュー40 第3陣 5室目）`);
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
