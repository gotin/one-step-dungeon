// dungeon_5 `2,1`（通り道＝北の `2,0`・南の `2,2`・東の `3,1` をつなぐ）：D4 の写しの部屋を
// 「凍れる壁穴の番鮫」に作り替える（2026-10-09 / PLAN 実行キュー 40 の第3陣 2室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #...*..*...#
//      3 #..........#
//      4 #..F........
//      5 #...........
//      6 #.......F..#
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   D4 `2,1` と同じ四角い広間にセンチネル F×2 と石2つ。氷の廃墟なのに水も氷も無い。
//
// ■ 新しい `2,1`＝凍れる壁穴の番鮫（地形＋敵だけの通り道＝キュー39 のユーザー判定どおり謎・報酬なし）
//   （'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵の文字は tiles 層に置く）
//      0 #####..#####     ← 北の口（列5-6）
//      1 #kkkkkkkkkk#
//      2 #kkkkkkkkkk#
//      3 #######<k###     ← 崩れた壁＝抜け道 (3,8)・その脇の氷の穴 (3,7) に潜み鮫
//      4 #kkkkkkkkkk.     ← 東の口（行4-5）
//      5 #kkkkk/kkkk.     ← 氷の穴 (5,6) に射水魚
//      6 ###k<#######     ← 崩れた壁＝抜け道 (6,3)・その脇の氷の穴 (6,4) に潜み鮫
//      7 #kkkkkkkkkk#
//      8 #kkkkkkkkkk#
//      9 #####..#####     ← 南の口（列5-6）
//   廃墟の壁2本が部屋を北・中・南の3つの帯に割り、帯から帯へは壁の崩れた幅1の抜け道しかない。
//   抜け道のすぐ脇の壁は凍った穴（水1枚）になっていて、潜み鮫が1体ずつ棲む。
//   ・見せ場＝**鮫の穴の脇を、鮫が潜っている間に抜ける**（リズムの関門）。穴は水1枚＝鮫は動けない
//     （2,2 の湖のように先回りしない）。浮いている間（1.2 秒）に抜け道へ入ると噛まれ（届き 1.6）、
//     潜っている間（2 秒）は攻撃しない。抜け道の前後3マスは顎の届きの内。
//   ・離れて待つと浮くたびに水刃が飛んでくる（届き 6・任意の角度）＝帯の隅には壁の陰になる床があり、
//     そこで波紋を見て間合いを計る。中の帯（東の口へつながる広間）は射水魚が見張る＝陰がほとんど無い。
//   ・答えは3つ＝①潜った瞬間に抜ける ②浮いた鮫を抜け道から斬る（鮫は穴から逃げられない）
//     ③弓で射る。倒すことは必須でない。
//   ・水棲の敵は 5.5m の配置表の外＝`scripts/lib/enemy-placement.mjs` の EXTRA_ENEMY_ROOMS に宣言する。
//   ・2,2（湖を巡る岸＝鮫が先回りする「位置の読み」）とは読みが違う＝こちらは鮫が動かない「間合いの読み」。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と氷は bgTiles だけ／3つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵は潜み鮫×2・射水魚×1 だけ・どれも水の上・脅威度 61.0（看板部屋 2,3 の 76.0 より軽い）・宣言あり
//   ・宝箱・看板・床の拾い物が無い
//   ・3つの口が道具なしで互いに歩ける／はしごで歩ける床が増えない／取り残された床が無い
//   ・穴はどれも水1枚（鮫も魚も穴から出られない）
//   ・帯から帯へは抜け道1マスだけ（抜け道を壁にすると帯が切れる）／抜け道は鮫の顎の届きの内
//   ・北と南の帯には、どの水の敵の射線も届かない床（待つ所）がある
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-2-1-frozen-hole-wardens.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-2-1-frozen-hole-wardens.mjs         # 書き込み

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
const ROOM  = '2,1';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#...*..*...#',
	'#..........#',
	'#..F........',
	'#...........',
	'#.......F..#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面（'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵の文字は tiles 層に置く）──
export const GROUND_MAP = [
	'#####..#####',
	'#kkkkkkkkkk#',
	'#kkkkkkkkkk#',
	'#######~k###',
	'#kkkkkkkkkk.',
	'#kkkkk~kkkk.',
	'###k~#######',
	'#kkkkkkkkkk#',
	'#kkkkkkkkkk#',
	'#####..#####',
];
export const ENEMIES = { '3,7': TILE.LURK_SHARK, '5,6': TILE.ARCHER_FISH, '6,4': TILE.LURK_SHARK };
export const TARGET = GROUND_MAP.map((row, r) => [...row].map((ch, c) =>
	ENEMIES[`${r},${c}`] ?? (ch === TILE.WATER || ch === TILE.ICE ? TILE.FLOOR : ch)).join(''));
const cellsWhere = (pred) => GROUND_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (pred(ch) ? [`${r},${c}`] : [])));
export const WATER = cellsWhere((ch) => ch === TILE.WATER);
export const ICE = cellsWhere((ch) => ch === TILE.ICE);
export const EXITS = { 北: ['0,5', '0,6'], 南: ['9,5', '9,6'], 東: ['4,11', '5,11'] };
// 帯（北・中・南）と、帯をつなぐ抜け道（その脇の鮫の穴）。
export const BANDS = { 北: [1, 2], 中: [4, 5], 南: [7, 8] };
export const GAPS = { 北: { gap: '3,8', hole: '3,7' }, 南: { gap: '6,3', hole: '6,4' } };
const EXPECT_THREAT = 61.0;
const COMMENT = '【キュー40 凍れる壁穴の番鮫（2026-10-09）】廃墟の壁2本が部屋を北・中・南の帯に割り、帯から帯へは'
	+ '壁の崩れた幅1の抜け道しかない。抜け道の脇の凍った穴（水1枚）に潜み鮫が1体ずつ棲む＝穴から動けない。'
	+ '浮いている間に抜け道へ入ると噛まれ、潜っている間は攻撃しない＝波紋を見て潜った瞬間に抜ける。'
	+ '離れて待つと浮くたびに水刃＝帯の隅の壁の陰で待つ。中の帯は穴の射水魚が見張る。'
	+ '答え＝潜った瞬間に抜ける／浮いた鮫を抜け道から斬る／弓で射る。報酬なしの通り道。'
	+ '盤面は scripts/migrate-d5-2-1-frozen-hole-wardens.mjs。';

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
// 水の敵の射線（水弾・水刃）が from から to のプレイヤーへ届くか＝`game/projectile.js` の飛び方をそのまま辿る。
//   ・撃つのはプレイヤーとの距離が届き range 以内のときだけ（`enemy-ai.js enemyAttack`）。
//   ・弾は敵の中心から 0.8 先に生まれ（`fireEnemyProjectile`）、**生まれた位置の壁は見ない**。
//     その後 1 tick の移動量 speed を ceil(speed/0.4) 個の副ステップに割り、副ステップごとに
//     セル（中心の四捨五入＝`hitbox.js toTileIndex`）が壁なら消える（`isTilePassableForProj`）。
//   ・プレイヤーに当たるのは縦横とも 0.5 未満に近づいたとき（`checkProjHit`）。
//   ⚠️ 穴が壁の列にある∴弾は穴の脇の壁を斜めに越えて生まれる＝中心から中心の直線で測ると
//      「壁の陰」を多く見積もる（叩き台の初版で、陰のはずの (1,1) が 120 tick で 4 回撃たれて発覚）。
export function seesFrom(t, from, to, range, speed) {
	const [fr, fc] = P(from), [tr, tc] = P(to);
	const d = Math.hypot(tr - fr, tc - fc);
	if (d === 0 || d > range) return false;
	const dy = (tr - fr) / d, dx = (tc - fc) / d;
	let y = fr + dy * 0.8, x = fc + dx * 0.8;
	const subs = Math.max(1, Math.ceil(speed / 0.4));
	for (let n = 0; n < 200; n++) {
		y += dy * speed / subs; x += dx * speed / subs;
		const r = Math.floor(y + 0.5), c = Math.floor(x + 0.5);
		if (!inside(r, c) || t[r][c] === TILE.WALL) return false;
		if (Math.abs(y - tr) < 0.5 && Math.abs(x - tc) < 0.5) return true;
	}
	return false;
}
// 水の敵の遠隔攻撃（鮫＝水刃・魚＝水弾）の届きと弾速。
export function shotOf(ch) {
	const meta = ENEMY_META[ch];
	return (meta.attacks ?? [meta.attack]).find((a) => a.type === 'waterShot' || a.type === 'waterBlade');
}
// どの水の敵の射線も届かない床（帯の陰）。
export function shelteredCells(t, cells) {
	return cells.filter((k) => Object.entries(ENEMIES).every(([e, ch]) => {
		const a = shotOf(ch);
		return !seesFrom(t, e, k, a.range, a.projectileSpeed);
	}));
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
		check(`画面の縁で開いているのは3つの口だけ（実測 ${open.join(' ')}）`, JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = {};
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const ch = tl[r][c];
			if (ENEMY_META[ch]) enemies[`${r},${c}`] = ch;
		}
		check(`敵は潜み鮫 <×2・射水魚 /×1 だけ（実測 ${JSON.stringify(enemies)}）`,
			JSON.stringify(enemies) === JSON.stringify(ENEMIES));
		check(`3体とも水棲（move:'water'）で、水の上に置かれている`,
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
	check(`石・植生が無い（旧 石2つは撤去）`, cellsOf(tl, (ch) => ch === TILE.STONE || ch === TILE.TREE || ch === TILE.BUSH).length === 0);
	check(`links が書き換え前と同じ・showConditions が空・enemyDirs が空`,
		JSON.stringify(room.links) === baseLinks
		&& Object.keys(room.showConditions ?? {}).length === 0 && Object.keys(room.enemyDirs ?? {}).length === 0);

	// ── ② 歩ける範囲 ──────────────────────────────────────────────
	const foot = walkable(t, EXITS.南[0]);
	for (const [name, cells] of Object.entries(EXITS)) {
		check(`道具なしで南の口から${name}の口へ歩ける`, cells.every((k) => foot.has(k)));
	}
	{
		const ladder = walkable(t, EXITS.南[0], true);
		check(`はしごがあっても歩ける床が増えない（${foot.size} マス）`, foot.size === ladder.size);
		const stranded = cellsOf(t, (ch) => !BLOCKED.has(ch)).filter((k) => !foot.has(k));
		check(`取り残された床が無い（実測 ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	}

	// ── ③ 穴と抜け道 ──────────────────────────────────────────────
	{
		const water = new Set(WATER);
		check(`穴はどれも水1枚（四方に水が無い＝鮫も魚も穴から出られない）`,
			WATER.every((k) => { const [r, c] = P(k); return DIRS4.every(([dr, dc]) => !water.has(`${r + dr},${c + dc}`)); }));
		const bite = ENEMY_META[TILE.LURK_SHARK].attacks.find((a) => a.type === 'sword').range;
		for (const [name, { gap, hole }] of Object.entries(GAPS)) {
			check(`${name}の抜け道 ${gap} の脇の穴 ${hole} に潜み鮫`, ENEMIES[hole] === TILE.LURK_SHARK);
			const [gr, gc] = P(gap), [hr, hc] = P(hole);
			check(`${name}の抜け道 ${gap} は鮫の顎の届き（${bite}）の内`, Math.hypot(gr - hr, gc - hc) <= bite);
			// 抜け道を壁にすると帯が切れる＝帯から帯へはこの1マスだけ。
			const cut = t.map((row) => [...row]);
			cut[gr][gc] = TILE.WALL;
			const reach = walkable(cut, `${BANDS[name][0]},1`);
			check(`${name}の抜け道 ${gap} を壁にすると${name}の帯から中の帯へ歩けない（帯をつなぐのは幅1の抜け道だけ）`,
				!reach.has(`${BANDS.中[0]},1`));
			// 抜け道を通る上下の3マス（帯の縁・抜け道・向こうの帯の縁）はすべて顎の届きの内。
			const through = [`${gr - 1},${gc}`, gap, `${gr + 1},${gc}`];
			check(`${name}の抜け道を縦に抜ける3マス（${through.join(' ')}）はすべて顎の届きの内`,
				through.every((k) => { const [r, c] = P(k); return Math.hypot(r - hr, c - hc) <= bite; }));
		}
		const shelter = shelteredCells(t, [...foot]);
		for (const name of ['北', '南']) {
			const rows = BANDS[name];
			const cells = shelter.filter((k) => rows.includes(P(k)[0]));
			check(`${name}の帯に水の敵の射線が届かない床（待つ所）がある（実測 ${cells.join(' ')}）`, cells.length >= 4);
		}
		const mid = shelter.filter((k) => BANDS.中.includes(P(k)[0]));
		check(`中の帯は陰がほとんど無い（射水魚が見張る・実測 ${mid.join(' ') || 'なし'}）`, mid.length <= 1);
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
	console.log(`# ${LAYER} ${ROOM}：通り道を「凍れる壁穴の番鮫」に作り替える（キュー40 第3陣 2室目）`);
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
