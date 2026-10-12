// dungeon_1 `3,3`（コウモリの間 `2,3` の奥の行き止まり）：ハートの器が置いてあるだけの四角い部屋を
// 「泉の島のコウモリの巣」に作り替える（2026-10-12 / PLAN 実行キュー 47 の第1陣 3室目・設計は Opus・
// 主題＝ユーザー選択「コウモリの巣」）
//
// ■ 何が薄かったか（キュー47 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 .....B.....#     ← ハートの器（初めから見えている）
//      5 ....R......#     ← 大ルピー
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 ############
//   西の口（コウモリの間 `2,3`）だけにつながる行き止まり。入ればハートの器を拾って帰るだけ（キュー21 の F6）。
//
// ■ 新しい `3,3`＝泉の島のコウモリの巣（`2,3` で顔を見せたコウモリの棲み家）
//      0 ############
//      1 #~~ξ~~~~ξ~~#     ← 地底の泉（bgTiles '~'）。コウモリは水の上を飛べる・勇者は入れない
//      2 #~~~~~~~~~~#
//      3 #...~~~.Rξ~#     ← 西の岸（列1-3）／中の島（列7-9・行3-6）／大ルピー (3,8)
//      4 ....~~~.B.~#     ← 西の口／島の真ん中に宝箱（コウモリを全滅させると現れる）
//      5 ..........~#     ← 岸から島へ渡る土手道（行5・列4-6＝幅1）
//      6 #...~~~..ξ~#
//      7 #~~~~~~~~~~#
//      8 #~~ξ~~~~ξ~~#
//      9 ############
//   ・コウモリ ξ×6（脅威度 12.0＝`2,3` の 8.0 より重く、看板部屋 `1,1` の 18.0 より軽い）。4体は泉の上、2体は島の上。
//     ξ は水の上を飛べる（`enemyTilePassable` の 'air'）＝勇者が追えない所からジグザグに寄ってくる。
//     1体ずつは木の剣1振り（HP2・atk1）。部屋の中に壁の柱を置かない＝コウモリは道を探さず
//     まっすぐ寄るだけ∴柱があると裏に引っかかって全滅できなくなる（宝箱が永久に出ない）。
//   ・答え＝西の岸で迎え撃つ（背は壁・左右と前は水）か、土手道で挟まれながら島へ渡るか。
//     全滅させると島の真ん中 `(4,8)` に宝箱（ハートの器）が現れる（killAll）。
//   ・大ルピーは書き換え前の物を島の北の角へ＝群れの中へ渡る誘い。
//   ・D1 の他の部屋と型を分けた＝`0,3` 石の裏へ回り込む・`0,2` 部屋の裏へ回り込む・`2,1` 石とボタン・
//     `2,2` スイッチの小部屋・`1,1` 地中蟲（看板）・`2,3` コウモリ（看板②）・`1,0` 魔物（関門）。
//     ここは「追えない所から来る群れ」＝D1 で唯一、地形が敵の側に付く部屋。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（西の口は同じセルで開いたまま）。
//   ・ハートの器の総数は変わらない（`shared/progression.js` のハート数の導出に触れない）。
//
// 使い方:
//   node scripts/migrate-d1-3-3-bat-nest.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d1-3-3-bat-nest.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_1';
const ROOM  = '3,3';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'.....B.....#',
	'....R......#',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];
const ORIGINAL_CHESTS = { '4,5': { type: 'heartContainer', name: 'ハートの器' } };

// ── 狙いの盤面（'~' は説明用＝tiles には '.' を書き、水は bgTiles に置く） ─────
export const PLAN_BOARD = [
	'############',
	'#~~ξ~~~~ξ~~#',
	'#~~~~~~~~~~#',
	'#...~~~.Rξ~#',
	'....~~~.B.~#',
	'..........~#',
	'#...~~~..ξ~#',
	'#~~~~~~~~~~#',
	'#~~ξ~~~~ξ~~#',
	'############',
];
export const TARGET = PLAN_BOARD.map((row) => row.replaceAll('~', '.'));
export const EXITS = { west: ['4,0', '5,0'] };
export const ENTRY = '4,0';
export const BATS = ['1,3', '1,8', '3,9', '6,9', '8,3', '8,8'];   // 盤面の順（行→列）
export const BATS_OVER_WATER = ['1,3', '1,8', '8,3', '8,8'];
export const CAUSEWAY = ['5,4', '5,5', '5,6'];                    // 岸から島へ渡る土手道（幅1）
export const ISLE = { r0: 3, r1: 6, c0: 7, c1: 9 };
export const SHORE = { r0: 3, r1: 6, c0: 1, c1: 3 };
export const CHEST = '4,8';
export const CHEST_CONTENT = { type: 'heartContainer', name: 'ハートの器' };   // 据え置き（位置だけ動かす）
export const CHEST_CONDITION = { trigger: 'killAll', message: 'コウモリの 群れを 退けた！島に 宝箱が 現れた！' };
export const RUPEE = '3,8';                    // 大ルピー＝書き換え前の物を島の北の角へ
export const SIGNATURE_THREAT = 18;            // 看板部屋 `1,1`（地中蟲）
export const BAT_ROOM_THREAT = 8;              // 手前の `2,3`（コウモリの看板②）

export const inIsle = (k) => { const [r, c] = k.split(',').map(Number); return r >= ISLE.r0 && r <= ISLE.r1 && c >= ISLE.c0 && c <= ISLE.c1; };

// 下地＝泉の水だけ（床は既定の石の床のまま＝D1 の他の部屋と同じ）。盤面から導く。
export function targetBg(board = PLAN_BOARD) {
	const bg = {};
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (board[r][c] === '~') bg[`${r},${c}`] = TILE.WATER;
	// コウモリが泉の上から始まるセル（盤面では ξ・下地は水）
	for (const k of BATS_OVER_WATER) bg[k] = TILE.WATER;
	return Object.fromEntries(Object.entries(bg).sort(([a], [b]) => {
		const [ar, ac] = a.split(',').map(Number), [br, bc] = b.split(',').map(Number);
		return ar - br || ac - bc;
	}));
}

// ── 歩行の到達（水・壁・宝箱は通れない） ─────────────────────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
export function walkable(t, bg, k) {
	const [r, c] = P(k);
	if (!inside(r, c)) return false;
	if (bg[k] === TILE.WATER) return false;
	const ch = t[r][c];
	if (ENEMY_META[ch]) return true;               // 敵の居るセルの下は床（水の上の ξ は bg で弾いた）
	return !BLOCKED.has(ch);
}
export function reach(t, bg, from = ENTRY, cut = new Set()) {
	const seen = new Set([from]);
	const q = [from];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nk = `${r + dr},${c + dc}`;
			if (seen.has(nk) || cut.has(nk) || !walkable(t, bg, nk)) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}
// 飛ぶ者の到達（壁だけが止める＝水の上も行ける）。
export function flyReach(t, from) {
	const seen = new Set([from]);
	const q = [from];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(nk) || t[nr][nc] === TILE.WALL) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// import されたときはここで止める（番人は定数と reach だけ使う）。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	// 事前条件＝盤面の外の中身が無い（宝箱・出現条件・下地は、書き換え前の物か、このスクリプトが書いた物なら受ける＝冪等）。
	const extras = ['signData', 'mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects', 'enemyDirs'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	{
		const cc = JSON.stringify(room.chestContents ?? {});
		if (cc !== JSON.stringify(ORIGINAL_CHESTS) && cc !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) die(`${ROOM} の chestContents が想定外の中身`);
		for (const [k, want] of [['showConditions', { [CHEST]: CHEST_CONDITION }], ['bgTiles', targetBg()]]) {
			const cur = room[k] ?? {};
			if (Object.keys(cur).length && JSON.stringify(cur) !== JSON.stringify(want)) die(`${ROOM} の ${k} が想定外の中身`);
		}
		if (room.links?.length) die(`${ROOM} の links が空でない`);
	}
	{
		const now = room.tiles.map(rowStr).join('|');
		if (now !== ORIGINAL.join('|') && now !== TARGET.join('|')) die(`${ROOM} の盤面が書き換え前とも狙いとも違う＝誰かが触った`);
	}

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の戻り口の着地
	const OPEN = new Set(['T', '!', 'D', '=']);
	const runs = () => ({
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: false, openTiles: null }),
	});
	// 層の到達性の基準は「書き換え前の盤面」で測る＝適用済みの地図に再実行しても同じ基準になる（冪等）。
	const before = room.tiles.map(rowStr);
	const applied = { tiles: room.tiles, bgTiles: room.bgTiles };
	room.tiles = ORIGINAL.map((row) => row.split(''));
	delete room.bgTiles;
	const base = runs();
	room.tiles = applied.tiles;
	if (applied.bgTiles !== undefined) room.bgTiles = applied.bgTiles;
	const heartsBefore = countHearts(data);

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え（tiles は文字の配列の配列＝[[field-tiles-are-char-arrays]]） ──
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => [...row]);
		log.push(`  ${ROOM}: 盤面を差し替えた（泉と中の島）`);
	}
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(targetBg())) {
		room.bgTiles = targetBg();
		log.push(`  ${ROOM}: 下地＝泉の水 ${Object.keys(room.bgTiles).length} マス`);
	}
	if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) {
		room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
		log.push(`  ${ROOM}: 宝箱 4,5 → ${CHEST}（${CHEST_CONTENT.name}・中身は据え置き）`);
	}
	if (JSON.stringify(room.showConditions ?? {}) !== JSON.stringify({ [CHEST]: CHEST_CONDITION })) {
		room.showConditions = { [CHEST]: { ...CHEST_CONDITION } };
		log.push(`  ${ROOM}: 宝箱 ${CHEST} をコウモリ全滅（killAll）で出現させる`);
	}

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const t = room.tiles.map((r) => [...r]);
	const bg = room.bgTiles ?? {};
	const at = (k) => { const [r, c] = P(k); return t[r]?.[c]; };
	const cellsOf = (pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
		return out;
	};
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	check(`tiles に水 '~' を書いていない（水は bgTiles の単一ソース＝[[blade-water-single-source-readers]]）`,
		cellsOf((ch) => ch === TILE.WATER).length === 0);
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k)) && bg[k] !== TILE.WATER).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは西の口だけ＝書き換え前と同じ行き止まり（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = cellsOf((ch) => !!ENEMY_META[ch]);
		check(`敵はコウモリ ξ×${BATS.length} だけ・${BATS.join(' ')}（実測 ${enemies.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(enemies) === JSON.stringify(BATS) && BATS.every((k) => at(k) === TILE.BAT_SWARM));
		const b = ENEMY_META[TILE.BAT_SWARM];
		check(`ξ は飛ぶ（move ${b.move}）・木の剣1振りで落ちる（HP ${b.hp}）・ボスでない・弱点の道具を持たない`,
			b.move === 'air' && b.hp <= 2 && !b.isBoss && !b.weakness);
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度 ${threat}＝手前の \`2,3\` の ${BAT_ROOM_THREAT}.0 より重く、看板部屋 \`1,1\` の ${SIGNATURE_THREAT}.0 より軽い`,
			threat > BAT_ROOM_THREAT && threat < SIGNATURE_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`宝箱 ${CHEST} は ${CHEST_CONTENT.name}・コウモリ全滅（killAll）で現れる＝関門はこれ1つ`,
		at(CHEST) === TILE.CHEST && cellsOf((ch) => ch === TILE.CHEST).length === 1
		&& JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST]: CHEST_CONTENT })
		&& JSON.stringify(room.showConditions) === JSON.stringify({ [CHEST]: CHEST_CONDITION }));
	check(`ハートの器の総数が書き換え前と同じ（${countHearts(data)}＝${heartsBefore}）`, countHearts(data) === heartsBefore);
	check(`床の物＝大ルピー ${RUPEE}（書き換え前の物）だけ`,
		at(RUPEE) === TILE.ITEM_RUPEE_LARGE
		&& cellsOf((ch) => [TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE, TILE.ITEM_HEAL_POTION, TILE.ITEM_BIG_HEAL_POTION].includes(ch)).length === 1);
	check(`看板・仕掛け・壁の柱が無い（部屋の中の壁 0）`,
		cellsOf((ch) => [TILE.SIGN, TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.DOOR,
			TILE.KEY, TILE.TORCH, TILE.PIT, TILE.BREAKABLE_WALL].includes(ch)).length === 0
		&& cellsOf((ch) => ch === TILE.WALL).every((k) => { const [r, c] = P(k); return r === 0 || r === 9 || c === 0 || c === 11; }));
	{
		const water = Object.keys(bg).filter((k) => bg[k] === TILE.WATER);
		check(`下地は泉の水だけ（${water.length} マス）・水は床の上にだけ置く（壁・宝箱・ルピーの下に無い）`,
			water.length === Object.keys(bg).length
			&& water.every((k) => at(k) === TILE.FLOOR || at(k) === TILE.BAT_SWARM));
		check(`泉の上から始まるコウモリは ${BATS_OVER_WATER.join(' ')}・島の上は ${BATS.filter(inIsle).join(' ')}`,
			BATS_OVER_WATER.every((k) => bg[k] === TILE.WATER)
			&& BATS.filter((k) => !BATS_OVER_WATER.includes(k)).every((k) => inIsle(k) && bg[k] === undefined));
	}

	// ── ② 泉と島の幾何 ──────────────────────────────────────────────
	{
		const foot = reach(t, bg);
		const floors = cellsOf((ch) => !BLOCKED.has(ch) || !!ENEMY_META[ch]).filter((k) => bg[k] !== TILE.WATER);
		check(`水でない床のどのセルにも歩いて立てる（取り残し 0・${floors.length} マス）`, floors.every((k) => foot.has(k)));
		const [cr, cc] = P(CHEST);
		check(`宝箱の隣・大ルピー・島のコウモリの居場所へ歩いて届く`,
			[`${cr},${cc - 1}`, RUPEE, ...BATS.filter(inIsle)].every((k) => foot.has(k)));
		check(`泉の上のコウモリの居場所へは歩いて届かない（${BATS_OVER_WATER.join(' ')}）`,
			BATS_OVER_WATER.every((k) => !foot.has(k)));
		check(`土手道 ${CAUSEWAY.join(' ')} は幅1＝上下が水`,
			CAUSEWAY.every((k) => { const [r, c] = P(k); return bg[`${r - 1},${c}`] === TILE.WATER && bg[`${r + 1},${c}`] === TILE.WATER; }));
		check(`対照＝土手道の真ん中を切ると島へ届かない（島へ渡る道はこの1本）`,
			!reach(t, bg, ENTRY, new Set([CAUSEWAY[1]])).has(`${cr},${cc - 1}`));
		// 柱が無い＝どのコウモリも壁に止められずに勇者の居る所まで飛べる（まっすぐ寄るだけでも詰まらない）。
		check(`どのコウモリからも西の岸・土手道・島のすべての床へ、壁を越えずに飛んで行ける`,
			BATS.every((b) => { const fr = flyReach(t, b); return floors.every((k) => fr.has(k)); }));
		// 入った瞬間に噛まれない＝西の口から一番近いコウモリまでマンハッタン距離 6 以上（`2,3` は 5）。
		const near = Math.min(...BATS.map((k) => { const [r, c] = P(k); const [er, ec] = P(ENTRY); return Math.abs(r - er) + Math.abs(c - ec); }));
		check(`西の口から一番近いコウモリまで ${near} マス（≥ 6）`, near >= 6);
		const shore = floors.filter((k) => { const [r, c] = P(k); return r >= SHORE.r0 && r <= SHORE.r1 && c >= SHORE.c0 && c <= SHORE.c1; });
		check(`西の岸は 3×4＝${shore.length} マス（迎え撃つ足場）`, shore.length === 12);
	}

	// ── ③ 層の到達性 ──────────────────────────────────────────────────
	{
		const now = runs();
		const sorted = (s) => [...s].sort();
		const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
		check(`徒歩・錠を全部開けた到達室が書き換え前と同じ（${now.foot.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(now.foot.reachedRooms, base.foot.reachedRooms));
		check(`門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`,
			same(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${now.foot.deadEdges.length}）`, now.foot.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：行き止まりの四角い部屋を「泉の島のコウモリの巣」に作り替える（キュー47 第1陣 3室目）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}・'~' は下地の水）`);
	room.tiles.forEach((row, i) => {
		const now = [...rowStr(row)].map((ch, c) => (bg[`${i},${c}`] === TILE.WATER && ch === TILE.FLOOR ? '~' : ch)).join('');
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
}

// 本編の全層のハートの器の数（宝箱の中身と床の '9'）。
function countHearts(data) {
	let n = 0;
	for (const layer of Object.values(data.layers)) for (const st of Object.values(layer.stages ?? {})) {
		for (const v of Object.values(st.chestContents ?? {})) if (v?.type === 'heartContainer') n++;
		for (const row of st.tiles ?? []) for (const ch of row) if (ch === TILE.ITEM_HEART_CONTAINER) n++;
	}
	return n;
}
