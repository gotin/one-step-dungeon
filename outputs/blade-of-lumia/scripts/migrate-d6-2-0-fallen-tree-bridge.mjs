// dungeon_6 `2,0`（`2,1` の北の行き止まり）：薄い部屋を「枯れ森の淵」に作り替える
// （2026-11-08 / PLAN 実行キュー 95 の10室目・主題はユーザー判断「倒木の橋」・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー95 の着手時の実測＝`.scratch/q95/dump-d6.mjs`）
//      0 ############
//      2 #....B.....#     ← 宝箱 B(2,5)＝ルピー×10
//      3 #..t...t...#     ← 木2
//      9 #####..#####     ← 口は南だけ
//   床の広間に宝箱が1つあるだけ・敵なし。
//
// ■ 新しい `2,0`＝枯れ森の淵（`~` は bgTiles の水）
//      0 ############
//      1 #~B~~~~~~~~#     ← 宝箱 B(1,2)＝爆弾×3（池の北西の隅）
//      2 #~~.....~~~#     ← 北の中州（行2 の列3〜7・列7 で南へ下りる）
//      3 #~~~~~~.~~~#
//      4 #~ŧ~~~~.~~~#     ← 枯れ木 W(4,2)＝宝箱の真南の小島（周りは水）
//      5 #~~~~~~.~~~#
//      6 #..~ŧ~~.~~~#     ← 枯れ木 E(6,4)＝岸の東の端・東の中州 (6,7) とのあいだは水2マス
//      7 #..~.~~~~~~#     ← (7,4)＝E の真南の岸
//      8 #......i...#     ← 南の岸・碑 i(8,7)
//      9 #####..#####
//   ・新しい規則（エンジン）：爆風を受けた枯れ木は爆心と反対の向きへ倒れ、先の2マスに幹が横たわる。
//     水の上の幹は橋＝歩ける。根元は切り株＝歩ける。部屋を出ると立ち直る（game/projectile.js
//     fellTreesFromBlast・game/passable.js fallenLogAt・game/game.js enterStage）。
//   ・解き方（爆弾1個＝約束①）：西の入江の (6,2) で爆弾。E は東に2マス＝東へ倒れて (6,5)(6,6) に橋＝
//     東の中州へ渡れる。同じ爆風で W も北に2マス＝北へ倒れて (3,2)(2,2) に橋＝北の中州から宝箱の前へ渡れる。
//     道＝岸 (7,4) → E の切り株 → 東の橋 → 中州を北へ → 行2 を西へ → W の幹 (2,2) で宝箱の前。
//   ・誤り＝E の真南 (7,4)／(8,4) で置く→E は北へ倒れて (5,4)(4,4) に橋＝どこにも着かない（入り直せば戻る）。
//     W は勇者の立てる床から縦横2マスの内に (6,2) しか無い＝W を倒せるのも (6,2) だけ。
//   ・報酬＝爆弾×3（旧 ルピー×10 は撤去）＝使った1個を返して、西隣の鍵の部屋 `1,0`（爆弾2個）への補給にする。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水／宝の中身／碑の本文／外周の口の形が不変
//   ・枯れ木の倒し方の総当たり（勇者が歩ける床×爆弾の数）：最少 1 個・置き場は (6,2) だけ・誤りの置き場の結果
//   ・入って詰む状態が無い（どの倒れ方でも口へ戻れる）・2個目以降の爆弾でも誤りからは解けない（入り直しが要る）
//   ・ソルバー（scripts/lib/blade-solver.mjs＝枯れ木は壁）では宝箱へ届かない＝倒す規則なしでは解けない
//   ・層の到達性が書き換え前と同じ・dead-edge 0
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-2-0-fallen-tree-bridge.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-2-0-fallen-tree-bridge.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { toolsUsableIn } from '../shared/progression.js';
import { FALL_DIRS, FALLEN_LOG_LEN } from '../game/passable.js';
import { bfsLayer } from './lib/connectivity.mjs';
import { ROWS as SR, COLS as SC, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_6';
export const ROOM  = '2,0';
export const ROWS = 10, COLS = 12;

// `~` は bgTiles の水（tiles 側は床 '.'）。
export const PLAN_ROWS = [
	'############',
	'#~B~~~~~~~~#',
	'#~~.....~~~#',
	'#~~~~~~.~~~#',
	'#~ŧ~~~~.~~~#',
	'#~~~~~~.~~~#',
	'#..~ŧ~~.~~~#',
	'#..~.~~~~~~#',
	'#......i...#',
	'#####..#####',
];
export const TREE_W = '4,2';
export const TREE_E = '6,4';
export const SEAT   = '6,2';     // 1個で両方を正しく倒す唯一の置き場
export const CHEST  = '1,2';
export const SIGN   = '8,7';
export const MOUTHS = ['9,5', '9,6'];
export const TARGET = PLAN_ROWS.map((row) => row.replace(/~/g, '.'));
export const WATER = [];
PLAN_ROWS.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~') WATER.push(`${r},${c}`); }));
export const CHEST_CONTENTS = { [CHEST]: { type: 'item', item: 'bomb', count: 3, name: '爆弾×3' } };
export const SIGN_DATA = {
	[SIGN]: {
		name: '枯れ森の 淵',
		lines: [
			'根の 朽ちた 木は 爆ぜる 風に 背を 向けて 倒れる。',
			'淵に 倒れた 幹は 水を 渡る 橋と なる。',
		],
	},
};

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

// ── 枯れ木の倒し方の総当たり（実エンジン fellTreesFromBlast の写し）───────────────────
// 状態＝倒れた木 { 'r,c': dir }。手＝勇者が歩ける床（水・木・碑・宝箱でない／切り株と幹は歩ける）に
// 爆弾を置く。爆心と同じ行か列・距離 1〜2 の立っている枯れ木が爆心と反対へ倒れる（先の2マスが
// 内側の床か水で、幹・切り株・勇者が無いときだけ）。ゴール＝宝箱の縦横の隣に立てる。
export function fallSearch(tiles, water, { maxBombs = 3 } = {}) {
	const at = (r, c) => tiles[r]?.[c];
	const isWater = (r, c) => water.has(`${r},${c}`);
	const logsOf = (st) => {
		const logs = new Set();
		for (const [k, d] of Object.entries(st)) {
			const [r, c] = k.split(',').map(Number); const [dr, dc] = FALL_DIRS[d];
			for (let s = 1; s <= FALLEN_LOG_LEN; s++) logs.add(`${r + dr * s},${c + dc * s}`);
		}
		return logs;
	};
	const walkable = (r, c, st, logs) => {
		const k = `${r},${c}`;
		if (logs.has(k) || st[k]) return true;
		return at(r, c) === TILE.FLOOR && !isWater(r, c);
	};
	const reach = (st) => {
		const logs = logsOf(st);
		const seen = new Set(MOUTHS); const q = [...MOUTHS];
		while (q.length) {
			const [r, c] = q.shift().split(',').map(Number);
			for (const [dr, dc] of DIRS) {
				const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
				if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS || seen.has(k) || !walkable(nr, nc, st, logs)) continue;
				seen.add(k); q.push(k);
			}
		}
		return seen;
	};
	const won = (seen) => [...seen].some((k) => { const [r, c] = k.split(',').map(Number); return DIRS.some(([dr, dc]) => `${r + dr},${c + dc}` === CHEST); });
	const blast = (st, br, bc) => {
		const ns = { ...st }; const felled = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const k = `${r},${c}`;
			if (at(r, c) !== TILE.DEAD_TREE || ns[k]) continue;
			const ddr = r - br, ddc = c - bc;
			if ((ddr !== 0) === (ddc !== 0) || Math.abs(ddr) + Math.abs(ddc) > 2) continue;
			const d = ddr < 0 ? 'n' : ddr > 0 ? 's' : ddc < 0 ? 'w' : 'e';
			const [dr, dc] = FALL_DIRS[d];
			const logs = logsOf(ns);
			let ok = true;
			for (let s = 1; s <= FALLEN_LOG_LEN && ok; s++) {
				const lr = r + dr * s, lc = c + dc * s, lk = `${lr},${lc}`;
				ok = lr > 0 && lc > 0 && lr < ROWS - 1 && lc < COLS - 1 && at(lr, lc) === TILE.FLOOR
					&& !logs.has(lk) && !ns[lk] && !(lr === br && lc === bc);
			}
			if (ok) { ns[k] = d; felled.push(`${k}${d}`); }
		}
		return { ns, felled };
	};
	const key = (st) => Object.entries(st).sort().map(([k, d]) => k + d).join('|') || '-';
	// 幅優先＝爆弾の数ごと
	const firstSeats = [];
	{
		const seen0 = reach({});
		for (const s of seen0) {
			if (MOUTHS.includes(s)) continue;
			const [r, c] = s.split(',').map(Number);
			const { ns, felled } = blast({}, r, c);
			if (felled.length) firstSeats.push({ seat: s, felled, solves: won(reach(ns)), state: key(ns) });
		}
	}
	const states = new Map([[key({}), { st: {}, bombs: 0 }]]);
	let frontier = [{}]; let minBombs = won(reach({})) ? 0 : null;
	for (let b = 1; b <= maxBombs && minBombs === null; b++) {
		const next = [];
		for (const st of frontier) {
			for (const s of reach(st)) {
				if (MOUTHS.includes(s)) continue;
				const [r, c] = s.split(',').map(Number);
				const { ns, felled } = blast(st, r, c);
				if (!felled.length) continue;
				const kk = key(ns);
				if (states.has(kk)) continue;
				states.set(kk, { st: ns, bombs: b });
				if (won(reach(ns)) && minBombs === null) minBombs = b;
				next.push(ns);
			}
		}
		frontier = next;
	}
	// 全状態（爆弾の上限なし）を閉じるまで広げる＝詰みと「誤りから解けるか」を見る
	const all = new Map([[key({}), {}]]); const q = [{}];
	while (q.length) {
		const st = q.shift();
		for (const s of reach(st)) {
			if (MOUTHS.includes(s)) continue;
			const [r, c] = s.split(',').map(Number);
			const { ns } = blast(st, r, c);
			const kk = key(ns);
			if (!all.has(kk)) { all.set(kk, ns); q.push(ns); }
		}
	}
	const solvable = new Set();
	{
		// 後ろ向き：その状態から（さらに爆弾を置いて）解けるか
		let changed = true;
		for (const [k, st] of all) if (won(reach(st))) solvable.add(k);
		while (changed) {
			changed = false;
			for (const [k, st] of all) {
				if (solvable.has(k)) continue;
				for (const s of reach(st)) {
					const [r, c] = s.split(',').map(Number);
					if (solvable.has(key(blast(st, r, c).ns))) { solvable.add(k); changed = true; break; }
				}
			}
		}
	}
	return { firstSeats, minBombs, allStates: all, solvable, reach, won, key };
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
	room.bgTiles = Object.fromEntries(WATER.map((k) => [k, '~']));
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
	room.showConditions = {};
	room.signData = JSON.parse(JSON.stringify(SIGN_DATA));
	room.breakableWalls = {};
	room.floorItems = {};
	room.links = [];
	room.enemyDirs = {};
	delete room.enemyHold;
	delete room.enemyChase;
	delete room.enemiesRespawn;
	delete room.initLitTorches;
	room.comment = '【キュー95 枯れ森の淵（2026-11-08）】爆風を受けた枯れ木は爆心と反対へ倒れ、水の上に2マスの橋を架ける（部屋を出ると立ち直る）。'
		+ '西の入江 (6,2) の爆弾1個で、東の枯れ木は東へ（東の中州への橋）・小島の枯れ木は北へ（宝箱の前への橋）。'
		+ '枯れ木の真南 (7,4) で置くと北へ倒れてどこにも着かない。scripts/migrate-d6-2-0-fallen-tree-bridge.mjs。';

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	const water = new Set(Object.keys(room.bgTiles));
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`水 ${water.size} マス（bgTiles）`, water.size === WATER.length);
	check(`宝箱 ${CHEST} は1つ・中身＝爆弾×3・初めから見えている`, count(TILE.CHEST) === 1 && at(CHEST) === TILE.CHEST
		&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS) && !room.showConditions[CHEST]);
	check(`枯れ木は ${TREE_W} と ${TREE_E} の2本・生きた木・石・栗・壊せる壁・茂み・かがり火・床の爆弾は無い`,
		count(TILE.DEAD_TREE) === 2 && at(TREE_W) === TILE.DEAD_TREE && at(TREE_E) === TILE.DEAD_TREE
		&& !t.flat().some((ch) => [TILE.TREE, TILE.STONE, TILE.BURR, TILE.BREAKABLE_WALL, TILE.BUSH, TILE.TORCH, TILE.ITEM_BOMB].includes(ch)));
	check(`碑 ${SIGN} に本文2行`, at(SIGN) === TILE.SIGN && count(TILE.SIGN) === 1 && room.signData[SIGN]?.lines?.length === 2);
	check(`敵は居ない`, !t.flat().some((ch) => ENEMY_META[ch]));
	check(`宝箱の縦横の隣は水か壁だけ（歩いて横に立てない）`, DIRS.every(([dr, dc]) => {
		const [r, c] = CHEST.split(',').map(Number); const k = `${r + dr},${c + dc}`;
		return water.has(k) || t[r + dr][c + dc] === TILE.WALL;
	}));

	// ── ② 倒し方の総当たり ─────────────────────────────────────────────
	{
		const tools = toolsUsableIn(data)[LAYER] ?? new Set();
		check(`D6 で爆弾が使える（toolsUsableIn）`, tools.has('bomb'));
		const S = fallSearch(t, water);
		check(`爆弾なしでは宝箱の前に立てない`, !S.won(S.reach({})));
		check(`最少の爆弾は 1 個（実測 ${S.minBombs}）`, S.minBombs === 1);
		const solving = S.firstSeats.filter((f) => f.solves).map((f) => f.seat);
		check(`1個で解ける置き場は ${SEAT} だけ（実測 ${solving.join(' ') || 'なし'}）`, solving.length === 1 && solving[0] === SEAT);
		const seat = S.firstSeats.find((f) => f.seat === SEAT);
		check(`${SEAT} の爆風で東の木は東・小島の木は北へ倒れる（${seat?.felled.join(' ')}）`,
			seat && seat.felled.includes(`${TREE_E}e`) && seat.felled.includes(`${TREE_W}n`) && seat.felled.length === 2);
		for (const s of ['7,4', '8,4']) {
			const f = S.firstSeats.find((x) => x.seat === s);
			check(`誤り：${s}（東の木の真南）で置くと東の木は北へ倒れ（${f?.felled.join(' ')}）、解けない`, f && f.felled.join() === `${TREE_E}n` && !f.solves);
		}
		const wSeats = S.firstSeats.filter((f) => f.felled.some((x) => x.startsWith(TREE_W))).map((f) => f.seat);
		check(`小島の木を倒せる置き場は ${SEAT} だけ（実測 ${wSeats.join(' ')}）`, wSeats.length === 1 && wSeats[0] === SEAT);
		check(`1個目の置き場で木が動くのは ${S.firstSeats.map((f) => f.seat).join(' ')} の3か所だけ`, S.firstSeats.length === 3);
		// 誤りの後は2個目以降を置いても解けない＝入り直しが要る（橋は部屋を出ると戻る）
		const wrong = S.firstSeats.find((f) => f.seat === '7,4');
		check(`誤り（東の木が北へ）の後は爆弾をいくつ置いても解けない＝入り直しが要る`, wrong && !S.solvable.has(wrong.state));
		// 入って詰む状態が無い＝どの倒れ方でも口へ戻れる（橋は道を足すだけ・幹は塞がない）
		let stuck = 0;
		for (const st of S.allStates.values()) { const seen = S.reach(st); if (!MOUTHS.every((m) => seen.has(m))) stuck++; }
		check(`どの倒れ方でも口へ戻れる（全 ${S.allStates.size} 状態・詰み ${stuck}）`, stuck === 0);
		// はしご（D5 で入手＝D6 の後）：幅1の水を、進む軸の両隣が陸のときだけ渡れる（game/passable.js isLadderCrossable）。
		// 初めから歩ける床から、はしごで初めて届く陸が無いこと（中州・宝箱の前へ近道できない）。
		const seen0 = S.reach({});
		const land = (r, c) => t[r]?.[c] === TILE.FLOOR && !water.has(`${r},${c}`);
		const leaks = [];
		for (const k of water) {
			const [r, c] = k.split(',').map(Number);
			for (const [a, b] of [[[r, c - 1], [r, c + 1]], [[r - 1, c], [r + 1, c]]]) {
				if (!land(...a) || !land(...b)) continue;
				const sa = seen0.has(`${a[0]},${a[1]}`), sb = seen0.has(`${b[0]},${b[1]}`);
				if (sa !== sb) leaks.push(k);
			}
		}
		check(`はしごで初めから歩ける床の外へ渡れる幅1の水が無い（実測 ${leaks.join(' ') || 'なし'}）`, leaks.length === 0);
	}

	// ── ③ ソルバー（枯れ木は壁＝倒す規則なし）では届かない ───────────────────
	{
		const tools = toolsUsableIn(data)[LAYER] ?? new Set();
		const grid = t.map((r) => r.slice());
		for (const k of water) { const [r, c] = k.split(',').map(Number); grid[r][c] = TILE.WALL; }
		const bg = Array.from({ length: SR }, () => Array(SC).fill('g'));
		const S = makeSolver(grid, bg, [], {}, new Set(), { hasLadder: tools.has('ladder'), hasCandle: tools.has('candle'), noTools: false });
		const starts = S.exitCells.map((cell) => { const [r, c] = cell.split(',').map(Number); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
		const [cr, cc] = CHEST.split(',').map(Number);
		const goal = (st) => { const [pr, pc] = st.split('|')[0].split(',').map(Number); return Math.abs(pr - cr) + Math.abs(pc - cc) === 1; };
		const m = measureMetrics(S, starts, goal, () => 0, { guardMax: 400000 });
		check(`ソルバー（枯れ木は壁・爆弾あり）では宝箱の前に届かない（状態 ${m.states}）`, m.L == null);
	}

	// ── ④ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`, same(open.reachedRooms, baseOpen.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「枯れ森の淵」に作り替える（キュー95 の10室目）`);
	console.log(`\n## 盤面の差分（${ROOM}・~ は水）`);
	room.tiles.forEach((row, i) => console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${PLAN_ROWS[i]}`));
	console.log('\n## 検証');
	let ng = 0;
	for (const [cond, msg] of verify) { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) ng++; }
	if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);
	if (DRY) console.log('\n--dry: 書き込みなし');
	else { writeFileSync(MAP_PATH, JSON.stringify(data, null, 2)); console.log('\n書き込み完了:', MAP_PATH); }
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
