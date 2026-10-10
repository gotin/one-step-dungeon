// dungeon_5 `2,3`（看板部屋＝西の入口 `1,3`・北の `2,2`・東の `3,3` をつなぐ通り道）：
// D4 の写しの部屋を「凍れる柱廊の双つ甲羅」に作り替える（2026-10-10 / PLAN 実行キュー 40 の第3陣 7室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #..........#
//      3 #..φ....β..#
//      4 ............
//      5 ............
//      6 #.......φ..#
//      7 #..........#
//      8 #..........#
//      9 ############
//   D4 `2,3` と同じ四角い広間に、5.5m の看板の敵（火吐き亀 φ×2＋跳躍蜘蛛 β）が置いてあるだけ。水も氷も柱も無い。
//
// ■ 新しい `2,3`＝凍れる柱廊の双つ甲羅（地形＋敵だけの通り道＝キュー39 のユーザー判定どおり謎・報酬なし）
//   （'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵の文字は tiles 層に置く）
//      0 #####..#####
//      1 #~kkkkkkkk~#
//      2 #kkkkkkkkkk#    ← 北の側廊
//      3 #k#φ#kk#β#k#    ← 北の列柱（柱 列2・4・7・9）。亀 φ と蜘蛛 β は切れ目に立つ
//      4 .kkkkkkkkkk.    ← 身廊（西の口・東の口＝行4-5）
//      5 .kkkkkkkkkk.
//      6 #k#k#kk#φ#k#    ← 南の列柱（同じ列）。亀 φ は切れ目に立つ
//      7 #kkkkkkkkkk#    ← 南の側廊
//      8 #~kkkkkkkk~#
//      9 ############
//   凍った神殿跡。東西に身廊が通り、南北の列柱（崩れた柱8本）が身廊と側廊を分ける。四隅は床の崩れた跡から覗く凍れる湖。
//   ・見せ場＝**列柱は炎と跳躍を遮る＝柱の陰で開く瞬間をやり過ごし、開いている間に斬る**。
//     火吐き亀は籠もっている間は無敵・不動、開いた瞬間にプレイヤーの方へ 2 マスの炎を吐く（壁で止まる）。
//     切れ目に立つ亀の炎は、柱に挟まれて**切れ目の正面（と背後）にしか届かない**＝身廊でも側廊でも、
//     柱の陰に立てば開く瞬間を無傷でやり過ごせる。跳躍蜘蛛の跳躍も柱で止まる（跳んだ先が柱なら手前に落ちて硬直）。
//     亀は開いている間に寄って来て切れ目から身廊へ出る＝待つほど陰は減る。2体は同時に開く
//     （`tickShell` は全員が同じ時刻に籠もりから始まる＝部屋じゅうが一斉に火を吐く）。
//   ・答え＝①柱の陰（例：北の側廊の隅 `(2,2)`＝柱 `(3,2)` の上）で構え、開いた瞬間をやり過ごして寄って来た所を斬る
//     ②弓で開いている間に射る ③身廊を駆け抜ける（西→東）。倒すことは必須でない。
//   ・D5 のほかの通り道（鮫・射水魚・魚群・鬼火・分裂スライム）と敵・答えが重ならない。水は四隅の額縁だけ＝
//     「陸の敵が水で止まる」を使っていない（D7 `2,3`＝空が猪を止める の先取りにならない）。
//     柱の陰は D8 の看板 `2,1`（爆弾鬼の爆風は柱の陰に届く）が後で裏返す＝D5 で先に「柱の陰は効く」を教える。
//   ・敵のセルと種類は 5.5m の配置表（`scripts/lib/enemy-placement.mjs` NEW_ENEMY_PLACEMENT）のまま＝表は触らない。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と氷は bgTiles だけ／3つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵は 5.5m の表どおり（亀2・蜘蛛1・同じセル）・脅威度 76.0・enemyDirs 空
//   ・宝箱・看板・拾い物が無い（報酬なし）
//   ・列柱：行3・行6 の柱は列 2・4・7・9／亀は左右を柱に挟まれた切れ目に立つ／
//     切れ目の亀の炎（2 マス・壁で止まる）が届く床は切れ目の正面と背後だけ
//   ・3つの口が道具なしで互いに歩ける／取り残された床が無い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-2-3-frozen-colonnade.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-2-3-frozen-colonnade.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat, NEW_ENEMY_PLACEMENT } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_5';
const ROOM  = '2,3';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..φ....β..#',
	'............',
	'............',
	'#.......φ..#',
	'#..........#',
	'#..........#',
	'############',
];

// ── 狙いの盤面（'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵の文字は tiles 層に置く）──
export const GROUND_MAP = [
	'#####..#####',
	'#~kkkkkkkk~#',
	'#kkkkkkkkkk#',
	'#k#k#kk#k#k#',
	'.kkkkkkkkkk.',
	'.kkkkkkkkkk.',
	'#k#k#kk#k#k#',
	'#kkkkkkkkkk#',
	'#~kkkkkkkk~#',
	'############',
];
// 敵は 5.5m の配置表のまま（セルも種類も）。
const PLACEMENT = NEW_ENEMY_PLACEMENT.find((e) => e.layer === LAYER && e.stage === ROOM);
export const ENEMIES = Object.fromEntries(Object.entries(PLACEMENT?.place ?? {})
	.flatMap(([ch, keys]) => keys.map((k) => [k, ch])));
export const TARGET = GROUND_MAP.map((row, r) => [...row].map((ch, c) =>
	ENEMIES[`${r},${c}`] ?? (ch === TILE.WATER || ch === TILE.ICE ? TILE.FLOOR : ch)).join(''));
const cellsWhere = (pred) => GROUND_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (pred(ch) ? [`${r},${c}`] : [])));
export const WATER = cellsWhere((ch) => ch === TILE.WATER);
export const ICE = cellsWhere((ch) => ch === TILE.ICE);
export const EXITS = { 西: ['4,0', '5,0'], 北: ['0,5', '0,6'], 東: ['4,11', '5,11'] };
export const COLONNADE_ROWS = [3, 6];
export const PILLAR_COLS = [2, 4, 7, 9];
export const PILLARS = COLONNADE_ROWS.flatMap((r) => PILLAR_COLS.map((c) => `${r},${c}`));
export const TURTLES = Object.keys(ENEMIES).filter((k) => ENEMIES[k] === TILE.FIRE_TURTLE);
export const SPIDER = Object.keys(ENEMIES).find((k) => ENEMIES[k] === TILE.LEAP_SPIDER);
// 柱の陰の構え所（答え①）＝北の側廊の西の隅。柱 (3,2) の真上・切れ目 (3,3) の亀の斜め。
export const SHADOW_POST = '2,2';
const EXPECT_THREAT = 76.0;
const COMMENT = '【キュー40 凍れる柱廊の双つ甲羅（2026-10-10）】凍った神殿跡。東西に身廊が通り、南北の列柱（崩れた柱8本）が身廊と側廊を分ける。'
	+ '火吐き亀2体は列柱の切れ目に立つ＝開いた瞬間の炎は柱に挟まれて切れ目の正面と背後にしか届かない。'
	+ '跳躍蜘蛛の跳躍も柱で止まる。柱の陰で開く瞬間をやり過ごし、開いている間に斬る。'
	+ '亀は開いている間に寄って来て身廊へ出る＝待つほど陰は減る。2体は同時に開く。'
	+ '敵は 5.5m の看板（φ×2＋β・脅威度 76.0）のまま。報酬なしの通り道。'
	+ '盤面は scripts/migrate-d5-2-3-frozen-colonnade.mjs。';

// ── 幾何の道具（番人からも import）────────────────────────────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// 水を tiles 層へ畳み込んだ実効の盤面（`connectivity.mjs cellTile` と同じ考え＝bgTiles の水も水）。
// 氷は歩ける地面＝床として扱う。
export const effective = () => GROUND_MAP.map((row) => [...row].map((ch) => (ch === TILE.ICE ? TILE.FLOOR : ch)));
export function walkable(t, from) {
	const seen = new Set([from]);
	const q = [from];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of DIRS4) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (!inside(nr, nc) || BLOCKED.has(t[nr][nc]) || seen.has(k)) continue;
			seen.add(k);
			q.push(k);
		}
	}
	return seen;
}
// 亀が turtle のセルで開いたとき、player のセルに炎が届くか＝`game/enemy-ai.js breatheFire` の写し。
// 吐く向き＝プレイヤーへの差の大きい軸（同じなら横）。2 マス・壁と水で止まる（`tilePassable`）。
export function breathHits(t, turtle, player) {
	const [tr, tc] = P(turtle), [pr, pc] = P(player);
	const dx = pc - tc, dy = pr - tr;
	if (dx === 0 && dy === 0) return false;
	const [ux, uy] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
	for (let k = 1; k <= 2; k++) {
		const r = tr + uy * k, c = tc + ux * k;
		if (!inside(r, c) || HARD_BLOCKED.has(t[r][c]) || t[r][c] === TILE.WATER) return false;
		if (r === pr && c === pc) return true;
	}
	return false;
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
	if (!PLACEMENT) die(`5.5m の配置表に ${LAYER} ${ROOM} が無い`);

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
	check(`壁の下に下地が無い（はしご・水棲の敵が壁の下の水を水として扱う穴＝D5 0,1 の教訓）`,
		Object.keys(room.bgTiles).every((k) => at(tl, k) !== TILE.WALL));
	for (const [name, cells] of Object.entries(EXITS)) {
		check(`${name}の口（${cells.join(' ')}）が開いている（床・下地なし）`,
			cells.every((k) => at(tl, k) === TILE.FLOOR && !room.bgTiles[k] && ORIGINAL[P(k)[0]][P(k)[1]] === TILE.FLOOR));
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
		check(`敵は 5.5m の配置表どおり（亀 ${TURTLES.join(' ')}・蜘蛛 ${SPIDER}／実測 ${Object.keys(enemies).length} 体）`,
			JSON.stringify(Object.entries(enemies).sort()) === JSON.stringify(Object.entries(ENEMIES).sort())
			&& TURTLES.length === 2 && !!SPIDER);
		check(`どれも書き換え前と同じセル（配置表を動かしていない）`,
			Object.entries(ENEMIES).every(([k, ch]) => ORIGINAL[P(k)[0]][P(k)[1]] === ch));
		check(`敵はどれも氷の上から始まる`, Object.keys(ENEMIES).every((k) => ICE.includes(k)));
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）＝表の期待値 ${PLACEMENT.threat}`, threat === EXPECT_THREAT && PLACEMENT.threat === EXPECT_THREAT);
		check(`enemyDirs が空（亀も蜘蛛も向きを持たない）`, Object.keys(room.enemyDirs ?? {}).length === 0);
	}
	check(`宝箱・看板・本文・拾い物が無い（報酬なしの通り道）`,
		cellsOf(tl, (ch) => ch === TILE.CHEST || ch === TILE.SIGN).length === 0
		&& Object.keys(room.chestContents).length === 0 && Object.keys(room.floorItems).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`links が書き換え前と同じ・showConditions が空`,
		JSON.stringify(room.links) === baseLinks && Object.keys(room.showConditions ?? {}).length === 0);

	// ── ② 列柱 ─────────────────────────────────────────────────────
	{
		const inner = cellsOf(tl, (ch) => ch === TILE.WALL).filter((k) => { const [r, c] = P(k); return r > 0 && r < 9 && c > 0 && c < 11; }).sort();
		check(`内側の壁は列柱の柱 ${PILLARS.length} 本だけ（行 ${COLONNADE_ROWS.join('・')} × 列 ${PILLAR_COLS.join('・')}）`,
			JSON.stringify(inner) === JSON.stringify([...PILLARS].sort()));
		check(`亀はどちらも列柱の切れ目に立つ（左右が柱）`,
			TURTLES.every((k) => { const [r, c] = P(k); return COLONNADE_ROWS.includes(r) && PILLARS.includes(`${r},${c - 1}`) && PILLARS.includes(`${r},${c + 1}`); }));
		// 切れ目の亀の炎が届く床＝切れ目の正面と背後（同じ列）だけ。
		const leaks = TURTLES.flatMap((tk) => {
			const [, tc] = P(tk);
			return cellsOf(t, (ch) => !BLOCKED.has(ch)).filter((k) => breathHits(t, tk, k) && P(k)[1] !== tc).map((k) => `${tk}→${k}`);
		});
		check(`切れ目の亀の炎は切れ目の正面と背後（同じ列）にしか届かない（漏れ ${leaks.join(' ') || 'なし'}）`, leaks.length === 0);
		// 柱が無ければ届くセルがある＝柱が炎を止めている（列柱の陰が意味を持つ）。
		const open = effective().map((row) => row.map((ch) => (ch === TILE.WALL ? TILE.FLOOR : ch)));
		const shaded = TURTLES.flatMap((tk) => {
			const [tr, tc] = P(tk);
			return [`${tr},${tc - 2}`, `${tr},${tc + 2}`].filter((k) => inside(...P(k)) && !BLOCKED.has(at(t, k)) && breathHits(open, tk, k));
		});
		check(`柱が無ければ切れ目の横 2 マスへ炎が届く＝柱が陰を作っている（${shaded.join(' ')}）`, shaded.length >= 2);
		check(`構え所 ${SHADOW_POST} は床・柱の真上・亀 ${TURTLES[0]} の斜め・どの亀の炎も届かない`,
			!BLOCKED.has(at(t, SHADOW_POST)) && PILLARS.includes(`${P(SHADOW_POST)[0] + 1},${P(SHADOW_POST)[1]}`)
			&& TURTLES.every((tk) => !breathHits(t, tk, SHADOW_POST))
			&& Math.abs(P(SHADOW_POST)[0] - P(TURTLES[0])[0]) === 1 && Math.abs(P(SHADOW_POST)[1] - P(TURTLES[0])[1]) === 1);
	}

	// ── ③ 歩ける範囲 ───────────────────────────────────────────────
	{
		const foot = walkable(t, EXITS.西[0]);
		for (const [name, cells] of Object.entries(EXITS)) {
			if (name === '西') continue;
			check(`道具なしで西の口から${name}の口へ歩ける`, cells.every((k) => foot.has(k)));
		}
		const stranded = cellsOf(t, (ch) => !BLOCKED.has(ch)).filter((k) => !foot.has(k));
		check(`取り残された床が無い（実測 ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
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
	console.log(`# ${LAYER} ${ROOM}：看板部屋を「凍れる柱廊の双つ甲羅」に作り替える（キュー40 第3陣 7室目）`);
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
