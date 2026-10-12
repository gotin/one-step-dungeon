// dungeon_1 `3,2`（目のスイッチの部屋 `2,2` の東の行き止まり）：宝箱が置いてあるだけの四角い部屋を
// 「堀の見張り台」に作り替える（2026-10-12 / PLAN 実行キュー 47 の第1陣 4室目・設計は Opus・
// 主題＝ユーザー選択「槍の番兵の射線」）
//
// ■ 何が薄かったか（キュー47 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 ...........#     ← 西の口（`2,2` から）
//      5 ...........#
//      6 #....B.....#     ← ルピー×20 の宝箱（初めから見えている）
//      7 #..........#
//      8 #..........#
//      9 ############
//   西の口だけにつながる行き止まり。入れば宝箱を開けて帰るだけ（キュー21 の F6）。
//
// ■ 新しい `3,2`＝堀の見張り台（センチネル F が槍で射線を守る）
//      0 ############
//      1 #..........#     ← 北の回り道（行1 は柱の陰＝縦の槍が届かない）
//      2 #.....##...#     ← 柱 (2,6)(2,7)
//      3 #....~~~~..#     ← 堀（bgTiles '~'）。槍は水の上を飛ぶ・勇者も F も渡れない
//      4 .....~F....#     ← 西の口／見張り台（列6-7・行4-5）／裏の橋 (4,8)
//      5 .....~.B~..#     ← 宝箱（ルピー×20・据え置き）は番兵の背後
//      6 #....~~~~..#
//      7 #..........#
//      8 #..........#     ← 南の回り道（柱が無い＝列6-7 で縦の槍が届く）
//      9 ############
//   ・センチネル F×1（脅威度 18.0＝看板部屋 `1,1` と同じ・D1 で飛び道具を撃つ雑魚はここだけ）。
//     縦横がそろうと射程 4 で槍を撃つ（3 秒おき）。追い方は「寄る向きの2択」だけ（`enemyChase`）
//     ∴勇者が西・北・南に居るあいだは、堀に阻まれて見張り台から降りない。
//   ・正面（西の口の前）は射線＝堀ごしに槍だけが飛んでくる。剣は堀の向こうへ届かない。
//   ・答え＝北の回り道を柱の陰（行1）を伝って東へ回り、裏の橋から見張り台へ上がる。
//     南の回り道には柱が無い＝列6-7 を渡る間に縦の槍が来る（北と南で「射線を読む」差を付けた。
//     両方に柱を置くと回り道がどちらも安全になり、読む物が無くなる）。
//     勇者が東へ回ると F は橋を渡って降りてくる＝東の通路（列9-10）で斬り合う。
//     木の盾があれば、槍の来る向きへ向いていれば防げる（D1「盾の入門」の練習・中ボスの石の予行）。
//   ・宝箱は番兵の背後＝見張り台の上。F を倒すか、東の通路へ引きずり出して橋を抜ければ開けられる。
//   ・D1 の他の部屋と型を分けた＝`0,3` 石の裏へ回り込む・`0,2` 部屋の裏へ回り込む・`2,1` 石とボタン・
//     `2,2` スイッチの小部屋・`1,1` 地中蟲（看板）・`2,3` コウモリ（看板②）・`3,3` 追えない所から来る群れ・
//     `1,0` 魔物（関門）。ここは「撃ってくる相手の射線を読む」部屋。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（西の口は同じセルで開いたまま）。
//
// 使い方:
//   node scripts/migrate-d1-3-2-spear-watch.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d1-3-2-spear-watch.mjs         # 書き込み

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
const ROOM  = '3,2';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'...........#',
	'...........#',
	'#....B.....#',
	'#..........#',
	'#..........#',
	'############',
];
const ORIGINAL_CHESTS = { '6,5': { type: 'rupee', value: 20, name: 'ルピー×20' } };

// ── 狙いの盤面（'~' は説明用＝tiles には '.' を書き、水は bgTiles に置く） ─────
export const PLAN_BOARD = [
	'############',
	'#..........#',
	'#.....##...#',
	'#....~~~~..#',
	'.....~F....#',
	'.....~.B~..#',
	'#....~~~~..#',
	'#..........#',
	'#..........#',
	'############',
];
export const TARGET = PLAN_BOARD.map((row) => row.replaceAll('~', '.'));
export const EXITS = { west: ['4,0', '5,0'] };
export const ENTRY = '4,0';
export const SENTRY = '4,6';                                       // 番兵の持ち場（見張り台の北西の角）
export const DAIS = ['4,6', '4,7', '5,6', '5,7'];                  // 見張り台（2×2）
export const BRIDGE = '4,8';                                       // 裏の橋（幅1）
export const PILLARS = ['2,6', '2,7'];                             // 北の回り道の柱（南には置かない）
export const SHADE = ['1,6', '1,7'];                               // 柱の陰（縦の槍が届かない）
export const EAST = { c0: 9, c1: 10 };                             // 東の通路（斬り合う場所）
export const CHEST = '5,7';
export const CHEST_CONTENT = { type: 'rupee', value: 20, name: 'ルピー×20' };   // 据え置き（位置だけ動かす）
export const SPEAR_RANGE = ENEMY_META[TILE.SENTRY].attack.range;   // 4
export const SIGNATURE_THREAT = 18;                                // 看板部屋 `1,1`（地中蟲）

// 下地＝堀の水だけ（床は既定の石の床のまま＝D1 の他の部屋と同じ）。盤面から導く。
export function targetBg(board = PLAN_BOARD) {
	const bg = {};
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (board[r][c] === '~') bg[`${r},${c}`] = TILE.WATER;
	return bg;
}

// ── 歩行の到達（水・壁・宝箱は通れない） ─────────────────────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
export function walkable(t, bg, k) {
	const [r, c] = P(k);
	if (!inside(r, c)) return false;
	if (bg[k] === TILE.WATER) return false;
	const ch = t[r][c];
	if (ENEMY_META[ch]) return true;               // 敵の居るセルの下は床
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
// 番兵の槍が from から to へ届くか＝縦か横にそろい・射程内・間に壁が無い（槍は水の上を飛ぶ＝
// `game/projectile.js` の isTilePassableForProj は壁だけで止まる）。
export function spearHits(t, from, to, range = SPEAR_RANGE) {
	const [fr, fc] = P(from), [tr, tc] = P(to);
	if (fr !== tr && fc !== tc) return false;
	const d = Math.abs(fr - tr) + Math.abs(fc - tc);
	if (d === 0 || d > range) return false;
	const sr = Math.sign(tr - fr), sc = Math.sign(tc - fc);
	for (let i = 1; i < d; i++) if (t[fr + sr * i][fc + sc * i] === TILE.WALL) return false;
	return true;
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

	// 事前条件＝盤面の外の中身が無い（宝箱・下地は、書き換え前の物か、このスクリプトが書いた物なら受ける＝冪等）。
	const extras = ['signData', 'mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects', 'enemyDirs', 'showConditions'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	{
		const cc = JSON.stringify(room.chestContents ?? {});
		if (cc !== JSON.stringify(ORIGINAL_CHESTS) && cc !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) die(`${ROOM} の chestContents が想定外の中身`);
		const cur = room.bgTiles ?? {};
		if (Object.keys(cur).length && JSON.stringify(cur) !== JSON.stringify(targetBg())) die(`${ROOM} の bgTiles が想定外の中身`);
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

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え（tiles は文字の配列の配列＝[[field-tiles-are-char-arrays]]） ──
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => [...row]);
		log.push(`  ${ROOM}: 盤面を差し替えた（堀の見張り台）`);
	}
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(targetBg())) {
		room.bgTiles = targetBg();
		log.push(`  ${ROOM}: 下地＝堀の水 ${Object.keys(room.bgTiles).length} マス`);
	}
	if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) {
		room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
		log.push(`  ${ROOM}: 宝箱 6,5 → ${CHEST}（${CHEST_CONTENT.name}・中身は据え置き）`);
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
		check(`敵はセンチネル F×1 だけ・持ち場 ${SENTRY}（実測 ${enemies.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(enemies) === JSON.stringify([SENTRY]) && at(SENTRY) === TILE.SENTRY);
		const f = ENEMY_META[TILE.SENTRY];
		check(`F は槍（spear）を撃つ・射程 ${SPEAR_RANGE}・地を歩く・ボスでない・弱点の道具を持たない`,
			f.attack?.type === 'spear' && SPEAR_RANGE === 4 && !f.move && !f.isBoss && !f.weakness);
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度 ${threat}＝看板部屋 \`1,1\` の ${SIGNATURE_THREAT}.0 を超えない`, threat <= SIGNATURE_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`宝箱 ${CHEST} は ${CHEST_CONTENT.name}（据え置き）・見張り台の上・初めから見えている（出現条件なし）`,
		at(CHEST) === TILE.CHEST && cellsOf((ch) => ch === TILE.CHEST).length === 1 && DAIS.includes(CHEST)
		&& JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST]: CHEST_CONTENT })
		&& !Object.keys(room.showConditions ?? {}).length);
	check(`部屋の中の壁は柱 ${PILLARS.join(' ')} だけ・看板・仕掛け・床の物なし`,
		JSON.stringify(cellsOf((ch) => ch === TILE.WALL).filter((k) => { const [r, c] = P(k); return r > 0 && r < 9 && c > 0 && c < 11; })) === JSON.stringify(PILLARS)
		&& cellsOf((ch) => [TILE.SIGN, TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.DOOR, TILE.KEY, TILE.TORCH, TILE.PIT,
			TILE.BREAKABLE_WALL, TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE, TILE.ITEM_HEAL_POTION].includes(ch)).length === 0);
	{
		const water = Object.keys(bg);
		check(`下地は堀の水だけ（${water.length} マス）・水は床の上にだけ置く`,
			water.every((k) => bg[k] === TILE.WATER && at(k) === TILE.FLOOR));
		check(`見張り台 ${DAIS.join(' ')} は橋 ${BRIDGE} の側を除いて堀に囲まれている`,
			DAIS.every((k) => {
				const [r, c] = P(k);
				return [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dr, dc]) => {
					const nk = `${r + dr},${c + dc}`;
					return DAIS.includes(nk) || nk === BRIDGE || bg[nk] === TILE.WATER;
				});
			}));
	}

	// ── ② 射線と回り道の幾何 ──────────────────────────────────────────
	{
		const foot = reach(t, bg);
		const floors = cellsOf((ch) => !BLOCKED.has(ch) || !!ENEMY_META[ch]).filter((k) => bg[k] !== TILE.WATER);
		check(`水でない床のどのセルにも歩いて立てる（取り残し 0・${floors.length} マス）`, floors.every((k) => foot.has(k)));
		check(`対照＝裏の橋 ${BRIDGE} を切ると見張り台（宝箱の隣・番兵の持ち場）へ届かない＝台へ上がる道はこの1本`,
			!reach(t, bg, ENTRY, new Set([BRIDGE])).has('4,7') && !reach(t, bg, ENTRY, new Set([BRIDGE])).has(SENTRY));
		const [er, ec] = P(ENTRY), [sr, sc] = P(SENTRY);
		check(`西の口 ${EXITS.west.join(' ')} は射程の外（番兵まで ${sc - ec} マス > ${SPEAR_RANGE}）＝入った瞬間には撃たれない`,
			EXITS.west.every((k) => !spearHits(t, SENTRY, k)));
		// 正面の射線＝西の床から番兵へ剣が届かない（隣が堀）のに、槍は届くセルがある。
		const front = floors.filter((k) => { const [, c] = P(k); return c < 5; }).filter((k) => spearHits(t, SENTRY, k));
		check(`正面（列1-4）に射線が通るセルがある（${front.join(' ')}）＝堀ごしに槍だけが飛んでくる`, front.length >= 2);
		check(`番兵の持ち場の4近傍のうち歩いて立てるのは見張り台の上だけ＝堀の外から剣が届かない`,
			[[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dr, dc]) => {
				const nk = `${sr + dr},${sc + dc}`;
				return !foot.has(nk) || DAIS.includes(nk);
			}));
		// 柱の陰＝見張り台のどこに番兵が居ても、行1・行8 の列6-7 には縦の槍が届かない。
		check(`柱の陰 ${SHADE.join(' ')} には見張り台のどこからも槍が届かない`,
			SHADE.every((s) => DAIS.every((d) => !spearHits(t, d, s))));
		check(`対照＝柱の無い南の回り道（行7-8 の列6-7）には見張り台から槍が届く`,
			['7,6', '8,6', '7,7', '8,7'].every((k) => DAIS.some((d) => spearHits(t, d, k))));
		// 北・南の回り道は、柱の陰を通れば一度も射線に入らずに東の通路へ出られる。
		const lineOf = new Set(floors.filter((k) => DAIS.some((d) => spearHits(t, d, k))));
		const safeReach = reach(t, bg, '1,1', lineOf);
		check(`射線を避けて北の回り道から東の通路へ出られる（射線 ${lineOf.size} マスを踏まずに 1,10 へ）`, safeReach.has('1,10'));
		check(`対照＝南の回り道は射線を踏まずには抜けられない（8,1 → 8,10 が射線で切れる）＝北と南で読む差がある`,
			!reach(t, bg, '8,1', lineOf).has('8,10'));
		const east = floors.filter((k) => { const [, c] = P(k); return c >= EAST.c0 && c <= EAST.c1; });
		check(`東の通路（列${EAST.c0}-${EAST.c1}）は幅2・行1-8 の ${east.length} マス`, east.length === 16);
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
	console.log(`# ${LAYER} ${ROOM}：行き止まりの四角い部屋を「堀の見張り台」に作り替える（キュー47 第1陣 4室目）`);
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
