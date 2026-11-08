// dungeon_6 `3,1`（コンパスの部屋＝四方の辻）：薄い部屋を「猪の枯れ木戸」に作り替える
// （2026-11-08 / PLAN 実行キュー 95 の11室目・主題はユーザー判断「猪が枯れ木を倒す」・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー95 の着手時の実測＝`.scratch/q95/dump-d6.mjs`）
//      0 #####..#####
//      2 #....n.....#     ← コンパス n(2,5) が床に置いてあるだけ
//      3 #..u.......#     ← 茂み1
//      6 #......t...#     ← 木1
//      9 #####..#####     ← 口は北・南・西・東（四方の辻）
//   敵なし。
//
// ■ 新しい `3,1`＝猪の枯れ木戸
//      0 #####..#####
//      1 #.t....#.n.#     ← 北東の囲い（中 2×3）の奥にコンパス n(1,9)
//      2 #......#ω..#     ← 突進猪 ω(2,8)＝囲いの中
//      3 #..u...##ŧ##     ← 囲いの南の壁。枯れ木 ŧ(3,9) が囲いの唯一の口を塞ぐ
//      4 ............     ← 東西の通り道（通り抜けに条件は付けない）
//      5 ............
//      6 #..t...ti.t#     ← 碑 i(6,8)・木 (6,7)(6,10)＝列9 の窪み (6,9) が枯れ木の真南
//      7 #.......t..#
//      8 #..........#
//      9 #####..#####
//   ・新しい規則（エンジン）：**突進猪が頭からぶつかった枯れ木は、猪の進む向きへ倒れる**
//     （shared/enemies.js CHARGE_BOAR の dash.fellsTrees・game/enemy-ai.js tickDash・
//     game/projectile.js fellTreeByImpact）。爆風が爆心に背を向けて倒すのと同じ「押された向き」。
//     倒れる先の条件は爆風と同じ＝先の2マスに勇者・敵・物があれば倒れない（揺れるだけ・一言出る）。
//   ・爆弾では開かない：勇者の立てる床で枯れ木と同じ列・距離 2 以内は通り道の (4,9)(5,9) だけ＝
//     爆心に背を向けて北へ倒れようとするが、北の2マス目がコンパス＝塞がっていて揺れるだけ。
//   ・解き方：列9 の (6,9)〜(8,9) に立つ＝猪は勇者めがけて南へ走り、枯れ木に頭を打つ→枯れ木は南へ倒れ、
//     幹は通り道 (4,9)(5,9) に横たわる。切り株 (3,9) が囲いの口になる→猪（気絶中）と戦ってコンパス。
//   ・誤り（ヒント）：通り道 (5,9) に立つと、猪は突進して枯れ木に頭を打つが、倒れる先に勇者が立って
//     いる＝揺れるだけ（「倒れる 先が 塞がっている」）。一歩下がれば倒れる、と読める。
//   ・猪を爆弾で倒してしまうと（爆風は壁を越える）開けられない→入り直すと戻る（enemiesRespawn・
//     倒れた枯れ木も部屋を出ると立ち直る）。
//   ・報酬＝コンパス（この部屋に元からあった物を囲いの奥へ移した＝ルピーにしない）。
//
// ■ 撤去したもの
//   床のコンパス (2,5)（囲いの奥 (1,9) へ移した）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／碑の本文／外周の口の形が不変／敵は猪1体・脅威度・入り直しで戻る
//   ・四方の口がつながる（通り抜けに条件なし）・初めは囲いの中へ歩いて入れない
//   ・爆弾：勇者の立てるどの床に置いても枯れ木は倒れない（エンジン fellTreesFromBlast の写し）
//   ・猪：列9 の窪みの3マスからは南へ倒れる・通り道 (5,9) では倒れない・倒れると囲いの中とコンパスに届く
//   ・猪と同じ行か列に立てる床から見て、囲いを出る最初のセルは壁か枯れ木だけ（猪が外へ飛び出さない）
//   ・層の到達性が書き換え前と同じ・dead-edge 0
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-3-1-boar-felled-gate.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-3-1-boar-felled-gate.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { toolsUsableIn } from '../shared/progression.js';
import { FALL_DIRS, FALLEN_LOG_LEN } from '../game/passable.js';
import { bfsLayer } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_6';
export const ROOM  = '3,1';
export const ROWS = 10, COLS = 12;

export const TARGET = [
	'#####..#####',
	'#.t....#.n.#',
	'#......#ω..#',
	'#..u...##ŧ##',
	'............',
	'............',
	'#..t...ti.t#',
	'#.......t..#',
	'#..........#',
	'#####..#####',
];
export const TREE    = '3,9';
export const BOAR    = '2,8';
export const COMPASS = '1,9';
export const SIGN    = '6,8';
export const PEN     = ['1,8', '1,9', '1,10', '2,8', '2,9', '2,10'];
export const LOGS    = ['4,9', '5,9'];                  // 南へ倒れた幹の2マス
export const SEATS   = ['6,9', '7,9', '8,9'];           // ここに立つと猪が枯れ木を南へ倒す
export const SHAKE   = '5,9';                           // ここに立つと猪は頭を打つが倒れない
export const MOUTHS  = ['0,5', '0,6', '9,5', '9,6', '4,0', '5,0', '4,11', '5,11'];
export const SIGN_DATA = {
	[SIGN]: {
		name: '猪の 枯れ木戸',
		lines: [
			'囲いの 主は 見た 者へ まっすぐ 突き進む。',
			'根の 朽ちた 木は 押された 向きへ 倒れる。',
		],
	},
};

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const BOMB_RADIUS = 2;

// 勇者の歩ける床（切り株と幹を含む）。st＝倒れた枯れ木 { 'r,c': dir }。
export function walkSearch(tiles, st = {}) {
	const logs = new Set();
	for (const [k, d] of Object.entries(st)) {
		const [r, c] = k.split(',').map(Number); const [dr, dc] = FALL_DIRS[d];
		for (let s = 1; s <= FALLEN_LOG_LEN; s++) logs.add(`${r + dr * s},${c + dc * s}`);
	}
	const walkable = (r, c) => {
		const k = `${r},${c}`;
		if (logs.has(k) || st[k]) return true;
		const ch = tiles[r]?.[c];
		return ch === TILE.FLOOR || ch === TILE.SIGN || ch === TILE.ITEM_COMPASS || ch === TILE.CHARGE_BOAR;
	};
	const seen = new Set(MOUTHS); const q = [...MOUTHS];
	while (q.length) {
		const [r, c] = q.shift().split(',').map(Number);
		for (const [dr, dc] of DIRS) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS || seen.has(k) || !walkable(nr, nc)) continue;
			seen.add(k); q.push(k);
		}
	}
	return seen;
}

// 枯れ木 (tr,tc) が dir へ倒れられるか（エンジン projectile.js treeCanFall の写し・敵は猪の位置だけ）。
export function canFall(tiles, tr, tc, dir, { player, enemy } = {}) {
	const [dr, dc] = FALL_DIRS[dir];
	for (let s = 1; s <= FALLEN_LOG_LEN; s++) {
		const r = tr + dr * s, c = tc + dc * s, k = `${r},${c}`;
		if (r <= 0 || c <= 0 || r >= ROWS - 1 || c >= COLS - 1) return false;
		if (tiles[r][c] !== TILE.FLOOR) return false;
		if (k === player || k === enemy) return false;
	}
	return true;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2) の着地セル
	const layerRun = () => bfsLayer(stages, START, { withLadder: false, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: false, openTiles: new Set(['T', '!', 'D', '=']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : [...row][0] + [...row][COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`盤面は ${ROWS}×${COLS}`, TARGET.length === ROWS && TARGET.every((row) => [...row].length === COLS));
	check(`外周の口の形が書き換え前と同じ`, ringOf(before) === ringOf(TARGET));
	room.tiles = TARGET.map((row) => [...row]);
	room.bgTiles = {};
	room.chestContents = {};
	room.showConditions = {};
	room.signData = JSON.parse(JSON.stringify(SIGN_DATA));
	room.breakableWalls = {};
	room.floorItems = {};
	room.links = [];
	room.enemyDirs = {};
	delete room.enemyHold;
	delete room.enemyChase;
	delete room.initLitTorches;
	room.enemiesRespawn = true;   // 猪を爆弾で倒してしまっても入り直せば戻る（枯れ木も立ち直る）
	room.comment = '【キュー95 猪の枯れ木戸（2026-11-08）】突進猪が頭からぶつかった枯れ木は猪の進む向きへ倒れる。'
		+ '囲いの口を塞ぐ枯れ木 (3,9) の真南、窪み (6,9)〜(8,9) に立つと猪が南へ走って枯れ木を倒し、切り株が囲いの口になる（奥にコンパス）。'
		+ '爆弾は北へ倒そうとしてコンパスに塞がれる。通り道 (5,9) に立つと倒れる先を塞いで揺れるだけ。scripts/migrate-d6-3-1-boar-felled-gate.mjs。';

	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	const rc = (k) => k.split(',').map(Number);

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`枯れ木は ${TREE} の1本・コンパスは ${COMPASS} の1つ・宝箱・石・栗・壊せる壁・水は無い`,
		count(TILE.DEAD_TREE) === 1 && at(TREE) === TILE.DEAD_TREE && count(TILE.ITEM_COMPASS) === 1 && at(COMPASS) === TILE.ITEM_COMPASS
		&& !t.flat().some((ch) => [TILE.CHEST, TILE.STONE, TILE.BURR, TILE.BREAKABLE_WALL, TILE.ITEM_BOMB].includes(ch))
		&& Object.keys(room.bgTiles).length === 0);
	check(`碑 ${SIGN} に本文2行`, at(SIGN) === TILE.SIGN && count(TILE.SIGN) === 1 && room.signData[SIGN]?.lines?.length === 2);

	// ── ② 歩いて行ける所 ───────────────────────────────────────────────
	const seen0 = walkSearch(t);
	check(`四方の口がつながる（通り抜けに条件なし）`, MOUTHS.every((m) => seen0.has(m)));
	check(`初めは囲いの中（${PEN.join(' ')}）へ歩いて入れない`, PEN.every((k) => !seen0.has(k)));
	check(`囲いの外の床は全部届く（取り残しなし）`, (() => {
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const k = `${r},${c}`;
			if (PEN.includes(k)) continue;
			if (t[r][c] === TILE.FLOOR && !seen0.has(k)) return false;
		}
		return true;
	})());
	check(`囲いの口は枯れ木 ${TREE} の1つだけ（囲いの縦横の隣で囲いの外のセルは壁か枯れ木）`, PEN.every((k) => {
		const [r, c] = rc(k);
		return DIRS.every(([dr, dc]) => {
			const nk = `${r + dr},${c + dc}`;
			if (PEN.includes(nk)) return true;
			const ch = t[r + dr][c + dc];
			return ch === TILE.WALL || nk === TREE;
		});
	}));

	// ── ③ 爆弾では倒れない ─────────────────────────────────────────────
	{
		const tools = toolsUsableIn(data)[LAYER] ?? new Set();
		check(`D6 で爆弾が使える（toolsUsableIn）`, tools.has('bomb'));
		const [tr, tc] = rc(TREE);
		const pushed = [];
		let fell = 0;
		for (const s of seen0) {
			if (MOUTHS.includes(s)) continue;
			const [r, c] = rc(s);
			const ddr = tr - r, ddc = tc - c;
			if ((ddr !== 0) === (ddc !== 0) || Math.abs(ddr) + Math.abs(ddc) > BOMB_RADIUS) continue;
			const dir = ddr < 0 ? 'n' : ddr > 0 ? 's' : ddc < 0 ? 'w' : 'e';
			pushed.push(`${s}→${dir}`);
			// 爆弾を置いた勇者はその場から離れられる＝勇者を倒れる先から外して数える（甘い側で測る）
			if (canFall(t, tr, tc, dir, {})) fell++;
		}
		check(`爆風が枯れ木に届く床は通り道の ${pushed.join(' ')} だけ`, pushed.join() === '4,9→n,5,9→n');
		check(`そのどれでも枯れ木は倒れない（北の2マス目がコンパスで塞がる）`, fell === 0 && t[1][9] === TILE.ITEM_COMPASS);
	}

	// ── ④ 猪なら倒れる ─────────────────────────────────────────────────
	{
		const [tr, tc] = rc(TREE);
		const [br] = rc(BOAR);
		check(`猪 ${BOAR} が囲いの中・枯れ木の真北の (2,9) は猪が立てる床`, PEN.includes(BOAR) && t[br][tc] === TILE.FLOOR);
		for (const s of SEATS) {
			const [r, c] = rc(s);
			check(`${s} は届く床・猪 (2,9) と同じ列で突進の距離（2〜9）・南へ倒れられる`,
				seen0.has(s) && c === tc && (r - 2) - 0.5 >= 2 && (r - 2) - 0.5 <= 9 && canFall(t, tr, tc, 's', { player: s }));
		}
		check(`通り道 ${SHAKE} に立つと突進はする（距離 ${3 - 0.5}）が倒れる先を塞ぐ＝揺れるだけ`,
			seen0.has(SHAKE) && (5 - 2) - 0.5 >= 2 && !canFall(t, tr, tc, 's', { player: SHAKE }));
		check(`(4,9) は猪の突進の距離の内側（密着＝突進しない）`, (4 - 2) - 0.5 < 2);
		check(`列9 で枯れ木の南に立てる床は ${[SHAKE, '4,9', ...SEATS].join(' ')} だけ`, (() => {
			const got = [];
			for (let r = tr + 1; r < ROWS; r++) if (seen0.has(`${r},${tc}`) && !MOUTHS.includes(`${r},${tc}`)) got.push(`${r},${tc}`);
			return got.sort().join() === ['4,9', SHAKE, ...SEATS].sort().join();
		})());
		const seen1 = walkSearch(t, { [TREE]: 's' });
		check(`南へ倒れると幹は ${LOGS.join(' ')}（通り道の床）・切り株から囲いの中とコンパスに届く`,
			LOGS.every((k) => t[rc(k)[0]][rc(k)[1]] === TILE.FLOOR) && PEN.every((k) => seen1.has(k)) && seen1.has(COMPASS));
		check(`倒れた後も四方の口はつながる`, MOUTHS.every((m) => seen1.has(m)));
	}

	// ── ⑤ 猪は囲いから飛び出さない（勇者と並んだときに出る最初のセルが壁か枯れ木）─────────
	{
		const bad = [];
		for (const p of PEN) {
			const [r, c] = rc(p);
			for (const [dr, dc] of DIRS) {
				// p から (dr,dc) の向きに、勇者の立てる床が並んでいるか
				let rr = r + dr, cc = c + dc, firstOut = null, aligned = false;
				while (rr >= 0 && cc >= 0 && rr < ROWS && cc < COLS) {
					const k = `${rr},${cc}`;
					if (!firstOut && !PEN.includes(k)) firstOut = k;
					if (seen0.has(k)) { aligned = true; break; }
					rr += dr; cc += dc;
				}
				if (!aligned || !firstOut) continue;
				const ch = at(firstOut);
				if (!(ch === TILE.WALL || firstOut === TREE || ch === TILE.ITEM_COMPASS)) bad.push(`${p}→${firstOut}`);
			}
		}
		check(`囲いの中から勇者へ走ったとき最初に当たるのは壁か枯れ木（実測 ${bad.join(' ') || 'すべて'}）`, bad.length === 0);
	}

	// ── ⑥ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は突進猪 ω ${BOAR} の1体だけ（実測 ${mobs.join(' ')}）`, mobs.join() === `${TILE.CHARGE_BOAR}@${BOAR}`);
		check(`突進猪は枯れ木を倒す性質を持つ（dash.fellsTrees）`, ENEMY_META[TILE.CHARGE_BOAR]?.dash?.fellsTrees === true);
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（ω 1体＝36.0）が D6 の看板部屋 2,3（${sig}）より軽い`, threat === 36 && threat < sig);
		check(`入り直すと敵が戻る（enemiesRespawn）`, room.enemiesRespawn === true);
	}

	// ── ⑦ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`, same(open.reachedRooms, baseOpen.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「猪の枯れ木戸」に作り替える（キュー95 の11室目）`);
	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${TARGET[i]}`));
	console.log('\n## 検証');
	let ng = 0;
	for (const [cond, msg] of verify) { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) ng++; }
	if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);
	if (DRY) console.log('\n--dry: 書き込みなし');
	else { writeFileSync(MAP_PATH, JSON.stringify(data, null, 2)); console.log('\n書き込み完了:', MAP_PATH); }
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
