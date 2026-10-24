// dungeon_4 `3,2`（地図の部屋・四方の辻）：素の部屋を「溶岩の十字路と地図の袋小路」に作り替える
// （2026-10-24 / PLAN 実行キュー 92 の2室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー92 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 #####..#####
//      4 .....m......     ← 東西南北の4つの口が開いた四角い広間
//      9 #####..#####
//   真ん中に地図 m が1枚落ちているだけ・敵なし＝「通るついでに拾う」。
//
// ■ 新しい `3,2`＝溶岩の十字路と地図の袋小路
//      0 #####..#####
//      1 #lmll..llll#     ← 地図 m(1,2)＝袋小路の奥
//      2 #l.ll..llll#
//      3 #l.l....lll#     ← 袋小路の口 (3,2)／中央の広場（行3〜6・列4〜7）
//      4 ............     ← 西の口／東の口
//      5 ...φ........     ← 火吐き亀 φ(5,3)
//      6 #lll....lll#
//      7 #llll..llll#
//      8 #llll..llll#
//      9 #####..#####
//   ・四隅を溶岩で埋め、4つの口を幅2の通路でつないだ十字路（通り抜けはどの口からも邪魔されない）。
//   ・地図は西の通路から北へ折れる**幅1・奥行き3の袋小路**の突き当たり (1,2)。
//     袋小路の口は (3,2) だけ＝入ると背中が通路に向く。
//   ・火吐き亀 φ が西の通路を巡回（家 (5,3)・さまよう範囲は家から3マス＝袋小路の中まで入る）。
//     亀は**開いた瞬間に正面2マスへ炎を吐く**∴袋小路の奥で地図を拾っている間に亀が口 (3,2) へ
//     来て北を向くと、(2,2)・(1,2) が炎の届く範囲＝逃げ場が無い。
//     ∴「ブーメランで止めて（甲羅を閉じていても硬直は通る）倒してから入る」か「亀が離れた隙に
//     出入りする（スルー）」の読み＝**取るのに1手要る**。どちらも正解（2026-10-24 ユーザー判定）。
//   ・幅2の通路では亀の横（隣の列）に立てる＝甲羅が開いた瞬間を横から叩ける。幅1の袋小路では
//     正面にしか立てない＝炎を吐き終えた直後に詰める読みになる（同じ亀で2つの間合い）。
//   ・D4 の他の部屋と型を分けた＝`0,3` 怨念の封じ祠（もや＝ロウソクの予告・亀は外を巡回）／
//     `1,0` 倉庫番／`1,1` かがり火3本／`1,2` ロウソク入手／`2,3` 剣封じの戦闘（看板）／
//     `3,3` 溶岩越しの灯火。ここは**ロウソク無しで解ける**（地図は D4 で早めに取る物）。
//   ・既存の地図の部屋と型を重ねない＝D2 `3,2`（見えているのに渡れない＝隣の部屋を回る）／
//     D5 `3,2`（四つ池の辻＝地形＋敵の通り道）／D7 `3,2`（空越しの発破）。
//     field `11,0`「外輪の隘路」（φ が宝箱の前に居座る）とも違う＝亀は家を中心に歩き回る・
//     地図の前に置いていない。
//
// ■ 例外（後から手に入る道具で楽になる手）
//   ・翼の羽衣（最終盤）は溶岩の上を飛べる＝四隅を飛んで袋小路の横から入れる。全ダンジョン後の
//     道具∴一周目の約束は崩れない（`0,3`・`3,3` と同じ扱い）。
//   ・はしごは溶岩を渡れない（`LADDER_OVER` に溶岩が無い）＝抜け道にならない。
//   ・ロウソクの置き炎を袋小路の口に置けば、亀が踏んだ時に焼ける（弱点ではないので 2 だけ）。
//
// ■ 撤去したもの
//   なし（地図 m を (4,5) から (1,2) へ移しただけ。floorItems は元から空）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／地図1枚・宝箱なし／floorItems・showConditions・links・signData が空／外周の口の形が不変
//   ・4つの口どうしが溶岩を渡らずに全部つながる（どの口の組でも通り抜けられる）
//   ・地図に届く・地図の隣の立てる床は (2,2) だけ・袋小路の口は (3,2) だけ（＝幅1・奥行き3）
//   ・対照＝袋小路の口を壁にすると地図に届かない（測定が空虚でない）
//   ・亀は家から3マス以内に袋小路の口がある・口の着地セルの隣に居ない・脅威度が看板部屋より軽い
//   ・はしごで溶岩を渡れない／層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d4-3-2-lava-cross-map.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d4-3-2-lava-cross-map.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META, ROAM_DEFAULT } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED, LADDER_OVER, isLadderBridgeCell } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_4';
export const ROOM  = '3,2';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#lmll..llll#',
	'#l.ll..llll#',
	'#l.l....lll#',
	'............',
	'...φ........',
	'#lll....lll#',
	'#llll..llll#',
	'#llll..llll#',
	'#####..#####',
];
export const MAP_CELL = '1,2';
export const NOOK     = ['3,2', '2,2', '1,2'];   // 袋小路（口→奥）
export const NOOK_MOUTH = '3,2';
export const TURTLE = '5,3';
export const OPENINGS = {
	north: ['0,5', '0,6'],
	south: ['9,5', '9,6'],
	west:  ['4,0', '5,0'],
	east:  ['4,11', '5,11'],
};

// 部屋の中だけの歩行（4近傍）。敵のセルは床とみなす・床のアイテム（地図）も踏める。
export function reach(grid, starts) {
	const seen = new Set();
	const q = [];
	const ok = (r, c) => {
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
		const ch = grid[r][c];
		if (ENEMY_META[ch]) return true;
		return !HARD_BLOCKED.has(ch);
	};
	for (const k of starts) {
		const [r, c] = k.split(',').map(Number);
		if (ok(r, c) && !seen.has(k)) { seen.add(k); q.push([r, c]); }
	}
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
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
	const layerRun = () => bfsLayer(stages, START, { withLadder: true, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: true, openTiles: new Set(['T', '!', 'D', '=']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`外周の口の形が書き換え前と同じ`, ringOf(before) === ringOf(TARGET));
	room.tiles = TARGET.map((row) => [...row]);
	room.chestContents = {};
	room.floorItems = {};
	room.showConditions = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`地図は ${MAP_CELL} の1枚だけ`, flat.filter((ch) => ch === TILE.ITEM_DUNGEON_MAP).length === 1 && at(MAP_CELL) === TILE.ITEM_DUNGEON_MAP);
	check(`宝箱は無い・chestContents が空`, !flat.includes(TILE.CHEST) && !Object.keys(room.chestContents).length);
	check(`floorItems・showConditions・signData が空`,
		!Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length && !Object.keys(room.signData ?? {}).length);

	// ── ② 歩行：通り抜けと袋小路 ─────────────────────────────────────────
	const allOpen = Object.values(OPENINGS).flat();
	for (const [name, cells] of Object.entries(OPENINGS)) {
		const r = reach(t, cells);
		const miss = allOpen.filter((k) => !r.has(k));
		check(`${name} の口から他の3つの口へ届く（届かない ${miss.join(' ') || 'なし'}）`, miss.length === 0);
	}
	const walk = reach(t, OPENINGS.west);
	check(`地図 ${MAP_CELL} に歩いて届く`, walk.has(MAP_CELL));
	const nbrs = (k) => { const [r, c] = k.split(',').map(Number); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };
	const standable = (k) => nbrs(k).filter((n) => walk.has(n));
	check(`地図の隣の立てる床は 2,2 だけ（実測 ${standable(MAP_CELL).join(' ')}）`, standable(MAP_CELL).join() === '2,2');
	check(`2,2 の隣は 1,2 と 3,2 だけ（幅1）`, JSON.stringify(standable('2,2').sort()) === JSON.stringify(['1,2', '3,2']));
	check(`袋小路の口 ${NOOK_MOUTH} の隣は 2,2 と 4,2 だけ（実測 ${standable(NOOK_MOUTH).join(' ')}）`,
		JSON.stringify(standable(NOOK_MOUTH).sort()) === JSON.stringify(['2,2', '4,2']));
	const floors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!HARD_BLOCKED.has(t[r][c])) floors.push(`${r},${c}`);
	const stranded = floors.filter((k) => !walk.has(k));
	check(`床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	{
		// 対照＝袋小路の口を壁にすると地図に届かない（潰すのは必ず '#'＝[[blade-control-experiment-needs-tile-wall]]）
		const g = t.map((row, r) => row.map((x, c) => (`${r},${c}` === NOOK_MOUTH ? TILE.WALL : x)));
		check(`対照：袋小路の口を壁にすると地図に届かない`, !reach(g, OPENINGS.west).has(MAP_CELL));
	}

	// ── ③ はしごで溶岩を渡れない ────────────────────────────────────────
	{
		check(`はしごで渡れるタイルに溶岩が入っていない`, !LADDER_OVER.has(TILE.LAVA));
		const bridges = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			if (LADDER_OVER.has(t[r][c]) && isLadderBridgeCell(t, ROWS, COLS, r, c, room.bgTiles)) bridges.push(`${r},${c}`);
		}
		check(`はしごで架けられるセルが1枚も無い（実測 ${bridges.join(' ') || 'なし'}）`, bridges.length === 0);
	}

	// ── ④ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は火吐き亀 φ ${TURTLE} の1体だけ（実測 ${mobs.join(' ')}）`, mobs.join() === `${TILE.FIRE_TURTLE}@${TURTLE}`);
		const [tr, tc] = TURTLE.split(',').map(Number);
		const [mr, mc] = NOOK_MOUTH.split(',').map(Number);
		const rad = ENEMY_META[TILE.FIRE_TURTLE].roam?.radius ?? ROAM_DEFAULT.radius;
		check(`亀のさまよう範囲（家から ${rad} マス）に袋小路の口が入る`, Math.abs(tr - mr) <= rad && Math.abs(tc - mc) <= rad);
		check(`亀は袋小路の中に居ない（家が地図の前ではない＝居座りではない）`, !NOOK.includes(TURTLE));
		check(`亀は口の着地セルの隣に居ない`, !allOpen.some((k) => k === TURTLE || nbrs(k).includes(TURTLE)));
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（φ 1体＝30.0）が D4 の看板部屋 2,3（${sig}）より軽い`, threat === 30 && threat < sig);
	}

	// ── ⑤ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
			same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(open.reachedRooms, baseOpen.reachedRooms));
		check(`${ROOM} に到達できる`, closed.reachedRooms.has(ROOM));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「溶岩の十字路と地図の袋小路」に作り替える（キュー92 の2室目）`);
	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${rowStr(row)}`);
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

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
