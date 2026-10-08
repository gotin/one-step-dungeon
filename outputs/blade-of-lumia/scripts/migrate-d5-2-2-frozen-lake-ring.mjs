// dungeon_5 `2,2`（四つ辻＝`2,1`・`1,2`・`3,2`・`2,3` をつなぐ通り道）：D4 の写しの部屋を
// 「凍れる湖の一周道」に作り替える（2026-10-08 / PLAN 実行キュー 40 の第3陣 1室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 ............
//      5 ............
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   D4 `2,2` と同じ四角い広間に何も無い。氷の廃墟なのに水も氷も無く、敵もいない。
//
// ■ 新しい `2,2`＝凍れる湖の一周道（地形＋敵だけの通り道＝キュー39 のユーザー判定どおり謎・報酬なし）
//   （'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵の文字は tiles 層に置く）
//      0 #####..#####
//      1 #kkkkkkkkkk#     ← 北の口（列5-6）
//      2 #kk~~~~~~kk#
//      3 #k~~/~~~~~k#     ← 射水魚 /
//      4 .k~~#~~~~~k.     ← 西・東の口（行4-5）／氷の岩 #(4,4)
//      5 .k~~~~~#~~k.     ← 氷の岩 #(5,7)
//      6 #k~~~~<~~~k#     ← 潜み鮫 <
//      7 #kk~~~~~~kk#
//      8 #kkkkkkkkkk#     ← 南の口（列5-6）
//      9 #####..#####
//   四つ辻の真ん中が凍れる湖に沈み、4つの口は湖を巡る幅1の氷の岸だけでつながる。
//   ・見せ場＝**どの口からどの口へも、湖の縁を回るしかない＝湖から狙われ続ける。**
//     潜み鮫は潜ったまま湖を横切ってこちらの岸へ先回りし（隠れている間も寄ってくる）、浮いた瞬間に噛む
//     （届き 1.6＝縁に立つと届く）。離れれば水刃。射水魚は湖の奥から水弾を撃つ。
//   ・読み＝**四隅の角と口の前だけは鮫の顎が届かない**（いちばん近い水まで 2 以上）＝ほかの岸は全部届く。
//     氷の岩2本は湖を横切る射線を切る（矢も水弾も止まる）。
//   ・答えは3つ＝①駆け抜ける（立ち止まらなければほぼ当たらない）②浮いた鮫を岸から斬る
//     ③射水魚を岸から弓で射る。倒すことは必須でない。
//   ・水棲の敵は 5.5m の配置表の外＝`scripts/lib/enemy-placement.mjs` の EXTRA_ENEMY_ROOMS に宣言する。
//   ・D5 `1,2`（水路を挟んだ鮫・射水魚・骸骨＝全滅ではしご）と敵の種類は同じだが、`1,2` は「水路の向こうへ
//     はしごで渡る」、こちらは「湖の外周を巡る」＝岸の形が違う。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と氷は bgTiles だけ／4つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵は潜み鮫・射水魚の2体だけ・どちらも水の上・脅威度 38.5（看板部屋 2,3 の 76.0 より軽い）・宣言あり
//   ・宝箱・看板・床の拾い物が無い
//   ・4つの口が道具なしで互いに歩ける／はしごで歩ける床が増えない／取り残された床が無い
//   ・湖（水）はひと続き＝鮫は湖のどこへでも回れる／氷の岩は水に囲まれている
//   ・岸の辺は鮫の顎の届き（1.6）の内／四隅の角と口の前だけが届きの外
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-2-2-frozen-lake-ring.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-2-2-frozen-lake-ring.mjs         # 書き込み

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
const ROOM  = '2,2';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'............',
	'............',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面（'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵の文字は tiles 層に置く）──
export const GROUND_MAP = [
	'#####..#####',
	'#kkkkkkkkkk#',
	'#kk~~~~~~kk#',
	'#k~~~~~~~~k#',
	'.k~~#~~~~~k.',
	'.k~~~~~#~~k.',
	'#k~~~~~~~~k#',
	'#kk~~~~~~kk#',
	'#kkkkkkkkkk#',
	'#####..#####',
];
export const ENEMIES = { '3,4': TILE.ARCHER_FISH, '6,6': TILE.LURK_SHARK };
export const TARGET = GROUND_MAP.map((row, r) => [...row].map((ch, c) =>
	ENEMIES[`${r},${c}`] ?? (ch === TILE.WATER || ch === TILE.ICE ? TILE.FLOOR : ch)).join(''));
const cellsWhere = (pred) => GROUND_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (pred(ch) ? [`${r},${c}`] : [])));
export const WATER = cellsWhere((ch) => ch === TILE.WATER);
export const ICE = cellsWhere((ch) => ch === TILE.ICE);
export const ROCKS = ['4,4', '5,7'];
export const EXITS = { 北: ['0,5', '0,6'], 南: ['9,5', '9,6'], 西: ['4,0', '5,0'], 東: ['4,11', '5,11'] };
// 鮫の顎が届かない岸＝四隅の角と口の前（いちばん近い水まで 2 以上）。
export const SAFE_NOOKS = ['1,1', '1,10', '8,1', '8,10', '4,0', '5,0', '4,11', '5,11',
	'0,5', '0,6', '9,5', '9,6'];
const EXPECT_THREAT = 38.5;
const COMMENT = '【キュー40 凍れる湖の一周道（2026-10-08）】四つ辻の真ん中が凍れる湖に沈み、4つの口は湖を巡る'
	+ '幅1の氷の岸だけでつながる。湖に潜み鮫・射水魚。鮫は潜ったまま先回りして浮いた瞬間に噛む（縁に立つと届く）、'
	+ '射水魚は湖の奥から撃つ。四隅の角と口の前だけは鮫の顎が届かない。氷の岩2本が湖を横切る射線を切る。'
	+ '答え＝駆け抜ける／浮いた鮫を岸から斬る／射水魚を弓で射る。報酬なしの通り道。'
	+ '盤面は scripts/migrate-d5-2-2-frozen-lake-ring.mjs。';

// ── 幾何の道具（番人からも import）────────────────────────────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// 水を tiles 層へ畳み込んだ実効の盤面（`connectivity.mjs cellTile` と同じ考え＝bgTiles の水も水）。
// 氷は歩ける地面＝床として扱う。
export const effective = () => GROUND_MAP.map((row) => [...row].map((ch) => (ch === TILE.ICE ? TILE.FLOOR : ch)));
// from から歩けるセル。withLadder なら幅 1 の水を、進む向きの先が地上のときだけ 1 マス渡る
// ＝`game/passable.js isLadderCrossable`。
export function walkable(t, from, withLadder = false) {
	const blocked = (r, c) => BLOCKED.has(t[r][c]);
	const seen = new Set([from]);
	const q = [from];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of DIRS4) {
			const nr = r + dr, nc = c + dc;
			if (!inside(nr, nc)) continue;
			let to = null;
			if (!blocked(nr, nc)) to = `${nr},${nc}`;
			else if (withLadder && LADDER_OVER.has(t[nr][nc]) && inside(nr + dr, nc + dc) && !blocked(nr + dr, nc + dc)) to = `${nr + dr},${nc + dc}`;
			if (to && !seen.has(to)) { seen.add(to); q.push(to); }
		}
	}
	return seen;
}
// セルからいちばん近い水までの距離（ユークリッド＝敵の届きと同じ物差し）。
export function nearestWaterDist(k) {
	const [r, c] = P(k);
	return Math.min(...WATER.map((w) => { const [wr, wc] = P(w); return Math.hypot(wr - r, wc - c); }));
}

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
		check(`敵は射水魚 / と潜み鮫 < の2体だけ（実測 ${JSON.stringify(enemies)}）`,
			JSON.stringify(enemies) === JSON.stringify(ENEMIES));
		check(`2体とも水棲（move:'water'）で、水の上に置かれている`,
			Object.entries(ENEMIES).every(([k, ch]) => ENEMY_META[ch].move === 'water' && WATER.includes(k)));
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）＝看板部屋 2,3（76.0）より軽い`, threat === EXPECT_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`宝箱・看板・本文・床の拾い物・回復薬が無い（報酬なしの通り道）`,
		cellsOf(tl, (ch) => ch === TILE.CHEST || ch === TILE.SIGN || ch === TILE.ITEM_HEAL_POTION).length === 0
		&& Object.keys(room.chestContents).length === 0 && Object.keys(room.floorItems).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`石・植生が無い`, cellsOf(tl, (ch) => ch === TILE.STONE || ch === TILE.TREE || ch === TILE.BUSH).length === 0);
	check(`links が書き換え前と同じ・showConditions が空・enemyDirs が空`,
		JSON.stringify(room.links) === baseLinks
		&& Object.keys(room.showConditions ?? {}).length === 0 && Object.keys(room.enemyDirs ?? {}).length === 0);

	// ── ② 歩ける範囲 ──────────────────────────────────────────────
	const foot = walkable(t, EXITS.西[0]);
	for (const [name, cells] of Object.entries(EXITS)) {
		check(`道具なしで西の口から${name}の口へ歩ける`, cells.every((k) => foot.has(k)));
	}
	{
		const ladder = walkable(t, EXITS.西[0], true);
		check(`はしごがあっても歩ける床が増えない（湖は厚い・岩は床でない＝${foot.size} マス）`, foot.size === ladder.size);
		const stranded = cellsOf(t, (ch) => !BLOCKED.has(ch)).filter((k) => !foot.has(k));
		check(`取り残された床が無い（実測 ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		check(`歩ける床は湖を巡る岸だけ＝氷 ${ICE.length} 枚＋口 8 マス`, foot.size === ICE.length + 8);
	}

	// ── ③ 湖と岸 ──────────────────────────────────────────────────
	{
		const water = new Set(WATER);
		const seen = new Set([WATER[0]]), q = [WATER[0]];
		while (q.length) {
			const [r, c] = P(q.shift());
			for (const [dr, dc] of DIRS4) {
				const nk = `${r + dr},${c + dc}`;
				if (water.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(nk); }
			}
		}
		check(`湖はひと続き（${seen.size}/${WATER.length} 枚）＝鮫は湖のどこへでも回れる`, seen.size === WATER.length);
		check(`氷の岩 ${ROCKS.join(' ')} は壁で、四方が水（岸から離れた湖の中）`,
			ROCKS.every((k) => at(t, k) === TILE.WALL && DIRS4.every(([dr, dc]) => { const [r, c] = P(k); return water.has(`${r + dr},${c + dc}`); })));
		const bite = ENEMY_META[TILE.LURK_SHARK].attacks.find((a) => a.type === 'sword').range;
		const shore = [...foot];
		const inBite = shore.filter((k) => nearestWaterDist(k) <= bite).sort();
		const outBite = shore.filter((k) => nearestWaterDist(k) > bite).sort();
		check(`鮫の顎（届き ${bite}）が届かない岸＝四隅の角と口の前だけ（実測 ${outBite.join(' ')}）`,
			JSON.stringify(outBite) === JSON.stringify([...SAFE_NOOKS].sort()));
		check(`岸の残り ${inBite.length} マスはすべて顎の届きの内（縁を歩くと噛まれる）`, inBite.length === shore.length - SAFE_NOOKS.length);
		const fishRange = ENEMY_META[TILE.ARCHER_FISH].attack.range;
		check(`射水魚の届き ${fishRange} は湖の幅（列2〜9）を越える＝向こう岸まで撃てる`, fishRange >= 6);
	}

	// ── ④ 層の到達性は不変 ─────────────────────────────────────────
	{
		const now = runs();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`はしごありの到達室が書き換え前と同じ（${now.ladder.reachedRooms.size} 室）`, same(now.ladder.reachedRooms, base.ladder.reachedRooms));
		check(`徒歩の到達室が書き換え前と同じ（${now.foot.reachedRooms.size} 室）`, same(now.foot.reachedRooms, base.foot.reachedRooms));
		check(`門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`, same(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${now.closed.deadEdges.length}）`, now.closed.deadEdges.length === 0);
	}

	// ── 出力 ───────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：通り道を「凍れる湖の一周道」に作り替える（キュー40 第3陣 1室目）`);
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
