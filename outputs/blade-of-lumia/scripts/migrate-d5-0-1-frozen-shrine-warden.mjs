// dungeon_5 `0,1`（通り道＝東の `1,1`・南の `0,2` をつなぐ・鉄の盾の部屋）：
// D4 の写しの部屋を「凍れる祠の番鮫」に作り替える（2026-10-10 / PLAN 実行キュー 40 の第3陣 6室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 #.....B.....
//      5 #...........
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   D4 `0,1` と同じ四角い広間の真ん中に、鉄の盾の宝箱 `B(4,6)` が置いてあるだけ。敵も水も氷も無い。
//   鉄の盾＝ゲームで最初の「跳ね返す盾」（reflect 0.5）なのに、入ってすぐ開けられる。
//
// ■ 新しい `0,1`＝凍れる祠の番鮫（地形＋敵だけの通り道＝キュー39 のユーザー判定どおり謎・報酬なし。
//   鉄の盾の宝箱は残す＝第3陣の作法）
//   （'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵・宝箱の文字は tiles 層に置く）
//      0 ############
//      1 #~~~~~~~~~~#
//      2 #~~~~~~~~~~#
//      3 #~~~~####~~#
//      4 #~~~~#Bk<kk.    ← 祠：宝箱 B(4,6)・祠の床 (4,7)・崩れた入口の穴 (4,8) に潜み鮫。東の口（行4-5）
//      5 #~~~~####kk.
//      6 #~~~~~~~~kk#
//      7 #~~~~~~~~kk#
//      8 #~~~~kkkkkk#
//      9 #####..#####     ← 南の口（列5-6）
//   凍れる湖に浮かぶ小さな祠に鉄の盾が祀られている。祠の入口は崩れて凍った穴（水1枚）になり、そこに潜み鮫が棲む。
//   ・見せ場＝**穴の鮫が祠の渡しを塞いでいる＝浮いた鮫をブーメランで止めて斬る**。はしごは穴（水1枚）を渡れるが、
//     敵とは重なれない＝鮫がいる限り祠へ渡れない（潜っていても穴に居る）。鮫は浮いている 1.2 秒しか斬れず、
//     浮けば岸の前で噛む。ブーメランは浮いた鮫に当たると 1.5 秒気絶させる＝気絶の間は潜れず噛めない
//     （`enemyTick` は気絶中に `tickHide` を通らない）∴ブーメランで止めてから斬れば噛まれずに削れる。
//     D5 でブーメランが答えになるのは初めて（D2 の報酬＝D5 では必ず持っている）。
//   ・答え＝①浮いたらブーメラン→寄って斬る ②浮くたびに斬り合う（噛まれる）③浮いたら弓で射る（穴の届く床から）。
//     倒さなければ鉄の盾は取れない（宝箱の前の床 (4,7) へは穴を渡るしかない）。通り道（東の口→南の口）は
//     鮫を倒さずに歩ける＝倒すことは通り抜けには要らない。
//   ・湖の役目＝祠を囲んで、祠へ入る道を穴1つに絞る（はしごでも湖は渡れない＝幅2以上）。
//   ・D5 のここまでの鮫の部屋（`1,2` 水路の番兵・`2,2` 一周道＝先回り・`2,1` 壁穴＝潜っている間に脇を抜ける）とは
//     「鮫が道を塞ぐ＝抜けられない・倒すしかない」「ブーメランで浮いたまま止める」が違う。D7 の通り道
//     （猪・術士・盾騎士・爆弾鬼・骸骨）とも敵・答えが重ならない。
//   ・5.5m の配置表の外に置く敵＝`scripts/lib/enemy-placement.mjs` の EXTRA_ENEMY_ROOMS に宣言する。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と氷は bgTiles だけ／2つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵は穴の潜み鮫1体だけ・穴は水1枚（鮫は動けない）・脅威度・宣言あり
//   ・鉄の盾の宝箱が書き換え前と同じセル・同じ中身／ほかに宝箱・看板・拾い物が無い
//   ・2つの口が道具なしで互いに歩ける／祠の床へは道具なしでは行けず、はしごなら穴を渡って行ける
//   ・祠へは穴を通るしかない（穴を塞ぐとはしごでも行けない）／宝箱に面して立てるのは祠の床だけ
//   ・はしごで増える床は祠の床だけ／取り残された床が無い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-0-1-frozen-shrine-warden.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-0-1-frozen-shrine-warden.mjs         # 書き込み

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
const ROOM  = '0,1';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'#.....B.....',
	'#...........',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面（'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵・宝箱の文字は tiles 層に置く）──
export const GROUND_MAP = [
	'############',
	'#~~~~~~~~~~#',
	'#~~~~~~~~~~#',
	'#~~~~####~~#',
	'#~~~~#Bk~kk.',
	'#~~~~####kk.',
	'#~~~~~~~~kk#',
	'#~~~~~~~~kk#',
	'#~~~~kkkkkk#',
	'#####..#####',
];
export const HOLE = '4,8';          // 祠の崩れた入口＝凍った穴（水1枚）。潜み鮫が棲む
export const ALCOVE = '4,7';        // 祠の床＝宝箱に面して立てる唯一の床
export const BANK = '4,9';          // 穴の東の岸＝はしごで穴を渡る踏み切り
export const CHEST_CELL = '4,6';    // 鉄の盾の宝箱（書き換え前と同じセル）
export const ENEMIES = { [HOLE]: TILE.LURK_SHARK };
export const TARGET = GROUND_MAP.map((row, r) => [...row].map((ch, c) =>
	ENEMIES[`${r},${c}`] ?? (ch === TILE.WATER || ch === TILE.ICE ? TILE.FLOOR : ch)).join(''));
const cellsWhere = (pred) => GROUND_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (pred(ch) ? [`${r},${c}`] : [])));
export const WATER = cellsWhere((ch) => ch === TILE.WATER);
export const ICE = cellsWhere((ch) => ch === TILE.ICE);
export const EXITS = { 東: ['4,11', '5,11'], 南: ['9,5', '9,6'] };
const EXPECT_THREAT = 22.5;
const COMMENT = '【キュー40 凍れる祠の番鮫（2026-10-10）】凍れる湖に浮かぶ小さな祠に鉄の盾が祀られている。'
	+ '祠の入口は崩れて凍った穴（水1枚）になり、潜み鮫が棲む＝鮫がいる限りはしごで穴を渡れない（敵とは重なれない）。'
	+ '浮いた鮫にブーメランを当てると気絶して潜れず噛めない＝止めてから斬る。'
	+ '東の口から南の口へは鮫を倒さずに歩ける（報酬なしの通り道・鉄の盾の宝箱だけ残した）。'
	+ '盤面は scripts/migrate-d5-0-1-frozen-shrine-warden.mjs。';

// ── 幾何の道具（番人からも import）────────────────────────────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// 水を tiles 層へ畳み込んだ実効の盤面（`connectivity.mjs cellTile` と同じ考え＝bgTiles の水も水）。
// 氷は歩ける地面＝床として扱う。宝箱は tiles 層の B のまま（BLOCKED）。敵は数えない（地形だけの模型）。
export const effective = () => GROUND_MAP.map((row, r) => [...row].map((ch, c) =>
	(`${r},${c}` === CHEST_CELL ? TILE.CHEST : (ch === TILE.ICE ? TILE.FLOOR : ch))));
// from から歩けるセル（Set）。withLadder なら幅 1 の水を、進む向きの先が地上のときだけ 1 マス渡る
// ＝`game/passable.js isLadderCrossable`。
// 宝箱は `connectivity.mjs` の BLOCKED に入っていない（層の到達性では開けた後を数える）∴ここでは塞ぐ
// ＝「宝箱に面して立てる床」を数えるための模型。
export function walkable(t, from, withLadder = false) {
	const blocked = (r, c) => BLOCKED.has(t[r][c]) || t[r][c] === TILE.CHEST;
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
	const baseChest = JSON.stringify(room.chestContents ?? {});

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
		check(`${name}の口（${cells.join(' ')}）が開いている（床・下地なし）`,
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
		check(`敵は穴 ${HOLE} の潜み鮫 < だけ（実測 ${JSON.stringify(enemies)}）`,
			JSON.stringify(enemies) === JSON.stringify(ENEMIES));
		check(`鮫は水の上（穴）にいる・水棲・潜る・ボスでない（ブーメランで気絶する）`,
			WATER.includes(HOLE) && ENEMY_META[TILE.LURK_SHARK].move === 'water'
			&& !!ENEMY_META[TILE.LURK_SHARK].hide && !ENEMY_META[TILE.LURK_SHARK].isBoss
			&& (ENEMY_META[TILE.LURK_SHARK].stunnable ?? true));
		{
			const [r, c] = P(HOLE);
			const waterSides = DIRS4.filter(([dr, dc]) => WATER.includes(`${r + dr},${c + dc}`));
			check(`穴は水1枚（四方に水が無い＝鮫は穴から動けない）`, waterSides.length === 0);
		}
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）＝看板部屋 2,3（76.0）より軽い`, threat === EXPECT_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`鉄の盾の宝箱 B が書き換え前と同じセル ${CHEST_CELL} に1つだけ・chestContents は書き換え前と同じ`,
		JSON.stringify(cellsOf(tl, (ch) => ch === TILE.CHEST)) === JSON.stringify([CHEST_CELL])
		&& ORIGINAL[P(CHEST_CELL)[0]][P(CHEST_CELL)[1]] === TILE.CHEST
		&& JSON.stringify(room.chestContents) === baseChest
		&& room.chestContents[CHEST_CELL]?.type === 'shield' && room.chestContents[CHEST_CELL]?.shieldTier === 1);
	check(`看板・本文・拾い物が無い（鉄の盾のほかは報酬なしの通り道）`,
		cellsOf(tl, (ch) => ch === TILE.SIGN).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0
		&& Object.keys(room.floorItems).length === 0);
	check(`石・植生が無い`, cellsOf(tl, (ch) => ch === TILE.STONE || ch === TILE.TREE || ch === TILE.BUSH).length === 0);
	check(`links が書き換え前と同じ・showConditions が空・enemyDirs が空`,
		JSON.stringify(room.links) === baseLinks
		&& Object.keys(room.showConditions ?? {}).length === 0 && Object.keys(room.enemyDirs ?? {}).length === 0);

	// ── ② 歩ける範囲と形 ───────────────────────────────────────────
	const foot = walkable(t, EXITS.東[0]);
	const ladder = walkable(t, EXITS.東[0], true);
	for (const [name, cells] of Object.entries(EXITS)) {
		check(`道具なしで東の口から${name}の口へ歩ける（鮫を倒さずに通り抜けられる）`, cells.every((k) => foot.has(k)));
	}
	check(`祠の床 ${ALCOVE} へは道具なしでは行けない`, !foot.has(ALCOVE));
	check(`はしごなら穴 ${HOLE} を渡って祠の床 ${ALCOVE} へ行ける（地形だけの模型＝鮫を数えない）`, ladder.has(ALCOVE));
	{
		const extra = [...ladder].filter((k) => !foot.has(k));
		check(`はしごで増える床は祠の床だけ（実測 ${extra.join(' ')}）`, JSON.stringify(extra) === JSON.stringify([ALCOVE]));
	}
	{
		const g = effective(); const [r, c] = P(HOLE); g[r][c] = TILE.WALL;
		check(`祠へは穴を通るしかない（穴を塞ぐとはしごでも行けない）`, !walkable(g, EXITS.東[0], true).has(ALCOVE));
		const [br, bc] = P(BANK), [ar, ac] = P(ALCOVE);
		check(`穴は東の岸 ${BANK} と祠の床 ${ALCOVE} に挟まれた横の橋`, br === r && ar === r && bc === c + 1 && ac === c - 1
			&& !BLOCKED.has(t[br][bc]) && !BLOCKED.has(t[ar][ac]));
	}
	{
		const [r, c] = P(CHEST_CELL);
		const faces = DIRS4.map(([dr, dc]) => `${r + dr},${c + dc}`).filter((k) => ladder.has(k));
		check(`宝箱に面して立てるのは祠の床だけ（実測 ${faces.join(' ')}）`, JSON.stringify(faces) === JSON.stringify([ALCOVE]));
	}
	{
		const stranded = cellsOf(t, (ch) => !BLOCKED.has(ch) && ch !== TILE.CHEST).filter((k) => !ladder.has(k));
		check(`取り残された床が無い（実測 ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
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
	console.log(`# ${LAYER} ${ROOM}：通り道を「凍れる祠の番鮫」に作り替える（キュー40 第3陣 6室目）`);
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
