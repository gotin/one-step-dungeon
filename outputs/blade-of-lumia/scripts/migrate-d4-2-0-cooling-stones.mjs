// dungeon_4 `2,0`（`2,1` の北の行き止まり）：素の部屋を「冷え石の渡り」に作り替える
// （2026-10-25 / PLAN 実行キュー 92 の8室目・設計は Opus・新しい地形ルール＝ユーザー承認）
//
// ■ 何が薄かったか（キュー92 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      4 #....B.....#     ← 真ん中に宝箱（ルピー×5）が1つ置いてあるだけ・敵なし
//      9 #####..#####
//
// ■ 新しい `2,0`＝冷え石の渡り
//      0 ############
//      1 #....B.....#     ← 向こう岸の宝箱 (1,5)
//      2 #..........#
//      3 #llllllllll#     ← 溶岩の川（幅 10・深さ 2）＝壁から壁まで切れ目なし
//      4 #llllllllll#
//      5 #....ll....#     ← 広間の真ん中の溶岩だまり（飾り＋石の捨て場）
//      6 #.#..##..*.#     ← 東の棚の石 B (6,9)
//      7 #*.......#.#     ← 西の壁際の石 A (7,1)
//      8 #.......i#.#     ← 看板 (8,8)
//      9 #####..#####
//   ・**主題＝石を溶岩へ押し込むと沈んで冷え、足場になる（新しい地形ルール・game/passable.js lavaCooledAt）。**
//     川は深さ 2＝石1個では渡れない。2個目の石は1個目が冷やしたセルの上を転がって、その先の溶岩へ沈む
//     ＝同じ列に2個続けて沈めると道ができる。
//   ・**答えの芯＝西の石 A は北へしか押せない**（西は壁・東へ押すには壁の中に立つ必要がある）∴道は列1 にしか
//     作れない。東の石 B は真下が壁 (7,9) で北へ押せない＝先に西へ出して列1 まで運び、A が沈んだ跡を通して
//     北へ押す。B を先に別の列で沈めると A が届かず詰む（部屋を出れば石は戻る＝やり直し）。
//   ・**閉じ込めは起きない**（ソルバーの noEscape 0＝どの押し方をしても口へ戻れる）。
//   ・D4 の倉庫番（`1,0`「石送りの間」＝石をボタンへ）と分けた：石は消費する物で、ボタンも門も無い。
//   ・ロウソク無しで解ける（`2,1` から来られる）。敵は置かない＝敵も石を押す（Phase 5-3）∴測った謎が
//     敵に崩される。D4 の他の部屋（もや・亀×3・置き炎・弓・爆弾鬼・ブーメラン運び・盾騎士）と型が重ならない。
//
// ■ 撤去したもの
//   旧 宝箱（ルピー×5・(4,5)）。報酬は向こう岸の宝箱のルピー×20 に置き換えた。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／宝箱1つと中身／看板／外周の口の形が不変／敵なし
//   ・歩くだけでは宝箱に届かない（川は壁から壁まで）
//   ・ソルバー（lavaSinks）で解ける・noEscape 0／対照＝沈めるルール無しでは解けない・石を1個にすると解けない
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる＝冪等。
//
// 使い方:
//   node scripts/migrate-d4-2-0-cooling-stones.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d4-2-0-cooling-stones.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { makeSolver } from './lib/blade-solver.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_4';
export const ROOM  = '2,0';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#....B.....#',
	'#..........#',
	'#llllllllll#',
	'#llllllllll#',
	'#....ll....#',
	'#.#..##..*.#',
	'#*.......#.#',
	'#.......i#.#',
	'#####..#####',
];
export const CHEST = '1,5';
export const CHEST_CONTENT = { type: 'rupee', value: 50, name: 'ルピー×50' };   // キュー100（2026-11-09）で差し替え＝scripts/migrate-q100-dungeon-rewards.mjs
export const STONE_WEST = '7,1';
export const STONE_EAST = '6,9';
export const RIVER_ROWS = [3, 4];
export const OPENING = ['9,5', '9,6'];
export const SIGN = '8,8';
export const SIGN_DATA = { name: '冷え石の 渡し場', lines: ['溶けた 岩に 石を 沈めれば 冷えて 足場となる。', '流れは 深い。石 ひとつでは 渡れぬ。'] };

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

// 部屋の中だけの歩行（4近傍・石は動かさない＝壁）。
export function reach(grid, starts) {
	const seen = new Set();
	const q = [];
	const ok = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS && !HARD_BLOCKED.has(grid[r][c]);
	for (const k of starts) { const [r, c] = parse(k); if (ok(r, c) && !seen.has(k)) { seen.add(k); q.push([r, c]); } }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = key(nr, nc);
			if (seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}

// ソルバーで測る：口から入って宝箱の隣に立てるか（L＝最短手数）／口へ二度と立てない状態の数（noEscape）。
export function solve(rows, { lavaSinks = true } = {}) {
	const tiles = rows.map((r) => [...r]);
	const bg = tiles.map((r) => r.map(() => '.'));
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: false, lavaSinks });
	const [cr, cc] = parse(CHEST);
	const posOf = (st) => st.slice(0, st.indexOf('|'));
	const isGoal = (st) => { const [r, c] = posOf(st).split(',').map(Number); return Math.abs(r - cr) + Math.abs(c - cc) === 1; };
	const id = new Map(), list = [], dist = [], preds = [];
	const add = (s, d) => { id.set(s, list.length); list.push(s); dist.push(d); preds.push([]); };
	for (const k of OPENING) add(S.encode(...parse(k), S.initStones, 0, 0, 0), 0);
	let L = null;
	const crossings = new Set();   // 向こう岸（行 ≤ 2）に立てた時の石の並び（stoneKeys 順＝東 (6,9)・西 (7,1)）
	for (let i = 0; i < list.length; i++) {
		if (L == null && isGoal(list[i])) L = dist[i];
		if (Number(posOf(list[i]).split(',')[0]) <= 2) crossings.add(list[i].split('|')[1]);
		for (const n of S.nextStates(list[i])) {
			let j = id.get(n);
			if (j === undefined) { add(n, dist[i] + 1); j = list.length - 1; }
			preds[j].push(i);
		}
	}
	const ok = new Uint8Array(list.length), q = [];
	list.forEach((s, i) => { if (OPENING.includes(posOf(s))) { ok[i] = 1; q.push(i); } });
	for (let k = 0; k < q.length; k++) for (const p of preds[q[k]]) if (!ok[p]) { ok[p] = 1; q.push(p); }
	return { L, states: list.length, noEscape: list.length - q.length, crossings: [...crossings] };
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
	check(`外周の口の形が書き換え前と同じ`, ringOf(before).replace(/[^#.]/g, '.') === ringOf(TARGET).replace(/[^#.]/g, '.'));
	room.tiles = TARGET.map((row) => [...row]);
	room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
	room.floorItems = {};
	room.showConditions = {};
	room.breakableWalls = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};
	room.signData = { [SIGN]: { ...SIGN_DATA, lines: [...SIGN_DATA.lines] } };

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = parse(k); return t[r]?.[c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`宝箱は ${CHEST} の1つだけ・中身は ${CHEST_CONTENT.name}`,
		flat.filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST) === TILE.CHEST
		&& JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST]: CHEST_CONTENT }));
	check(`石は ${STONE_WEST}・${STONE_EAST} の2個だけ`,
		flat.filter((ch) => ch === TILE.STONE).length === 2 && at(STONE_WEST) === TILE.STONE && at(STONE_EAST) === TILE.STONE);
	check(`看板 ${SIGN} に本文（{name, lines}＝描画される形）`,
		at(SIGN) === TILE.SIGN && Array.isArray(room.signData[SIGN]?.lines) && room.signData[SIGN].lines.length > 0);
	check(`敵は置かない（敵も石を押す＝謎が崩れる）`, !flat.some((ch) => ENEMY_META[ch]));
	check(`川（行 ${RIVER_ROWS.join('・')}）は壁から壁まで溶岩`,
		RIVER_ROWS.every((r) => t[r].slice(1, COLS - 1).every((ch) => ch === TILE.LAVA)));

	// ── ② 歩くだけでは届かない・解ける・閉じ込めなし ─────────────────────
	{
		const walk = reach(t, OPENING);
		const [cr, cc] = parse(CHEST);
		const adj = [[cr + 1, cc], [cr, cc - 1], [cr, cc + 1]].some(([r, c]) => walk.has(key(r, c)));
		check(`歩くだけでは宝箱の隣に立てない`, !adj);
		const m = solve(TARGET);
		check(`ソルバー（石が溶岩に沈む）で解ける（L ${m.L}・状態 ${m.states}）`, m.L != null);
		check(`閉じ込めなし＝どう押しても口へ戻れる（noEscape ${m.noEscape}）`, m.noEscape === 0);
		check(`向こう岸へ渡れる石の置き方は1通り＝西の石が (4,1)・東の石が (3,1) に沈む（実測 ${m.crossings.join(' / ')}）`,
			m.crossings.length === 1 && m.crossings[0] === `s3,1;s4,1`);
		const off = solve(TARGET, { lavaSinks: false });
		check(`対照：石が沈まなければ解けない`, off.L == null);
		for (const s of [STONE_WEST, STONE_EAST]) {
			const one = TARGET.map((row, r) => [...row].map((ch, c) => (key(r, c) === s ? '.' : ch)).join(''));
			check(`対照：石 ${s} を外す（1個だけ）と解けない`, solve(one).L == null);
		}
	}

	// ── ③ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`, same(open.reachedRooms, baseOpen.reachedRooms));
		check(`${ROOM} に到達できる`, closed.reachedRooms.has(ROOM));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「冷え石の渡り」に作り替える（キュー92 の8室目）`);
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
