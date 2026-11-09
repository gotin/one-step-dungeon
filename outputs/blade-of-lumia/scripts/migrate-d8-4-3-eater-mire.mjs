// dungeon_8 `4,3`（`4,2` の南・`3,3` の東・`4,4` の北＝3つの口の通り道・宝箱ルピー×30）：
// 素の宝箱の部屋を「ルピー喰いの底なし沼」に作り替える
// （2026-10-31 / PLAN 実行キュー 93 の7室目・設計は Opus・ユーザー判断「規則を足す」）
//
// ■ 何が薄かったか（キュー93 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 #####..#####
//      4 .....B.....#     ← 宝箱 B(4,5)＝ルピー×30 が真ん中に置いてあるだけ・敵なし
//      9 #####..#####     ← 北の口（列5-6）・西の口（行4-5）・南の口（列5-6）
//
// ■ 新しい `4,3`＝ルピー喰いの底なし沼（'~'＝bgTiles の水。tiles 層では床）
//      0 #####..#####
//      1 #..........#     ← 北岸（列8〜10）＝堀 (2,8)〜(2,10) を縦に渡れる
//      2 #......~~~~#     ← 堀（幅1）
//      3 #......~...#     ← 小島（行3〜6×列8〜10・床は泥 'w'＝宝箱の下も）
//      4 .......~σ..#     ← ルピー喰い σ(4,8)
//      5 .......~..B#     ← 宝箱 B(5,10)＝ルピー×30（小島の東の端）
//      6 #......~.σ.#     ← ルピー喰い σ(6,9)
//      7 #......~~~~#     ← 堀（幅1）
//      8 #..........#     ← 南岸（列8〜10）
//      9 #####..#####
//   ・**主題＝張り付いたルピー喰いを、はしごで渡る水の上で剥がす（叩く）と、足場が無く沈んで倒れる
//     （キュー93 で足したエンジンの規則＝enemy-ai.js detachLeech → bodyAllLiquid → startSink・
//     `4,1` の「沈むのは水と溶岩だけ」の延長）。はしごに戦闘の役が生まれる（Fable レビュー #13）。**
//   ・σ は水を渡れない＝小島から出ない。小島へ入るには堀（幅1）をはしごで渡るしかない。
//   ・σ は硬い（hp 15・def 1＝木の剣 15 振り・銅の剣 5 振り）。張り付くと 0.6 秒ごとにルピーを 2 吸う
//     ＝小島で2体と殴り合うと大損（倒せば吸った分の半分が戻る）。
//   ・答えは3つ：
//     ① 岸から堀越しに射る・投げる（σ は堀の縁で止まる＝距離 2 では張り付けない。安全だが手数が多い）
//     ② 堀の水の上（はしごの上）に立つ → 小島の σ が寄って張り付く → その場で叩く → σ は水へ落ちて沈む
//        （小島で張り付かれても、堀へ下がってから叩けば同じ）
//     ③ 小島で殴り合う（ルピーを吸われる）
//   ・通り道（北の口・西の口・南の口）は堀にも小島にも塞がれない（はしご無し・列1〜6）。
//   ・脅威度 45.0（σ 22.5×2・看板 `2,1` の 85.5 より軽い）。
//   ・型を重ねない相手＝D8 `0,2`「毒ヒルの泥田」（水でヒルを撒く＝堀は守り）／D1 `2,0`「裏口の金庫」
//     （σ を金庫から出さずに床のルピーを拾う）／`4,1`「猪の泥浴び場」（敵が自分の突進で沈む）。
//     ここは**勇者が運んで沈める**＝張り付きを逆手に取る。
//
// ■ 撤去したもの
//   なし（宝箱 B(4,5) は小島の東の端 (5,10) へ移した・中身はルピー×30 のまま）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と泥は bgTiles だけ／宝箱1つ（中身ルピー×30）／石・立札・ボタン・門・笛の効き目が無い
//   ・3つの口は、はしごを使わずに互いに歩いて届く／取り残された床が無い（はしご込み）
//   ・小島へは歩いて届かず、はしごなら届く／堀は幅1＝小島の縁のどこからでも渡れる
//   ・σ は小島から歩いて出られない／岸に立つと σ と 2 マス離れる（張り付けない）
//   ・敵は σ×2・脅威度が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d8-4-3-eater-mire.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d8-4-3-eater-mire.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';
import { reach } from './migrate-d8-0-2-leech-paddy.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_8';
export const ROOM  = '4,3';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（'~' は bgTiles の水として敷き、tiles 側は '.'） ─────────────
export const TARGET = [
	'#####..#####',
	'#..........#',
	'#......~~~~#',
	'#......~...#',
	'.......~σ..#',
	'.......~..B#',
	'#......~.σ.#',
	'#......~~~~#',
	'#..........#',
	'#####..#####',
];
export const EATERS = ['4,8', '6,9'];
export const CHEST = '5,10';
export const CHEST_CONTENT = { type: 'rupee', value: 50, name: 'ルピー×50' };   // キュー100（2026-11-09）で差し替え＝scripts/migrate-q100-dungeon-rewards.mjs
export const ISLAND = [];
for (let r = 3; r <= 6; r++) for (let c = 8; c <= 10; c++) ISLAND.push(`${r},${c}`);
export const MOAT = [];
for (let c = 7; c <= 10; c++) MOAT.push(`2,${c}`, `7,${c}`);
for (let r = 3; r <= 6; r++) MOAT.push(`${r},7`);
// 堀を渡る立ち位置（はしごの上＝体の下が全部水）。小島の σ と隣り合う＝張り付かれる場所。
export const WEST_MOAT = ['3,7', '4,7', '5,7', '6,7'];
export const OPENING = { north: '0,5', west: '4,0', south: '9,5' };
// 見た目だけの泥（bgTiles 'w'）＝小島の床（宝箱の下も＝抜くと宝箱だけ迷宮の床に見えて穴が空く）
export const MUD = [...ISLAND];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

export function tilesOf(target = TARGET) { return target.map((row) => [...row].map((ch) => (ch === TILE.WATER ? TILE.FLOOR : ch))); }
export function bgOf(target = TARGET, mud = MUD) {
	const bg = {};
	target.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === TILE.WATER) bg[key(r, c)] = TILE.WATER; }));
	for (const k of mud) bg[k] = TILE.MUD;
	return bg;
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
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: true, openTiles: new Set(['T', '!', 'D', '=', '(', ')']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`外周の口の形が書き換え前と同じ`, ringOf(before).replace(/[^#]/g, '.') === ringOf(TARGET).replace(/[^#]/g, '.'));
	room.tiles = tilesOf();
	room.bgTiles = bgOf();
	room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
	room.floorItems = {};
	room.showConditions = {};
	room.breakableWalls = {};
	room.signData = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};
	delete room.enemyHold;
	delete room.enemyChase;
	delete room.enemiesRespawn;
	delete room.fluteEffect;

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const grid = TARGET.map((row) => [...row]);   // 水を '~' で描いた図＝歩行の判定に使う
	const at = (k) => { const [r, c] = parse(k); return grid[r][c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === tilesOf().map(rowStr).join('\n'));
	{
		const bg = room.bgTiles;
		const water = Object.keys(bg).filter((k) => bg[k] === TILE.WATER);
		const mud = Object.keys(bg).filter((k) => bg[k] === TILE.MUD);
		check(`bgTiles＝水 ${water.length} 枚（堀 ${MOAT.length}）・泥 ${mud.length} 枚（ほかの値なし）`,
			water.length + mud.length === Object.keys(bg).length
			&& water.sort().join() === [...MOAT].sort().join() && mud.length === MUD.length);
		check(`tiles 層に水を置いていない（水は bgTiles だけ）`, !flat.includes(TILE.WATER));
	}
	check(`宝箱は小島の ${CHEST} の1つだけ・中身はルピー×30`,
		flat.filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST) === TILE.CHEST && ISLAND.includes(CHEST)
		&& Object.keys(room.chestContents).join() === CHEST && room.chestContents[CHEST].type === 'rupee' && room.chestContents[CHEST].value === CHEST_CONTENT.value);
	check(`石・立札・ボタン・門・床の拾い物・出現条件・笛の効き目が無い`,
		![TILE.STONE, TILE.SIGN, TILE.BUTTON, TILE.GATE].some((ch) => flat.includes(ch))
		&& !Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length && !room.fluteEffect);

	// ── ② 歩行：通り道は塞がない・小島へははしごだけ ─────────────────────
	{
		const opens = Object.values(OPENING);
		const walk = reach(grid, [OPENING.west]);
		check(`3つの口（北・西・南）は、はしごを使わずに互いに歩いて届く`, opens.every((k) => walk.has(k)));
		const floors = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] !== TILE.WATER && !HARD_BLOCKED.has(grid[r][c])) floors.push(key(r, c));
		const lad = reach(grid, opens, { withLadder: true });
		const stranded = floors.filter((k) => !lad.has(k));
		check(`床は全部届く（はしご込み）（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		const islandFloor = ISLAND.filter((k) => k !== CHEST);
		check(`小島へは歩いて届かず、はしごなら届く`, islandFloor.every((k) => !walk.has(k) && lad.has(k)));
		// 堀は幅1＝小島の縁のどこからでも渡れる（その軸の両岸が床）
		const crossings = [];
		for (let r = 3; r <= 6; r++) if (grid[r][6] === TILE.FLOOR && grid[r][8] !== TILE.WATER && !HARD_BLOCKED.has(grid[r][8])) crossings.push(`${r},7`);
		for (let c = 8; c <= 10; c++) {
			if (grid[1][c] === TILE.FLOOR && grid[3][c] === TILE.FLOOR) crossings.push(`2,${c}`);
			if (grid[8][c] === TILE.FLOOR && !HARD_BLOCKED.has(grid[6][c])) crossings.push(`7,${c}`);
		}
		check(`堀は幅1＝西の4枚・北の3枚・南の3枚がはしごで渡れる（実測 ${crossings.length} 枚）`, crossings.length === 10);
		// σ は小島から歩いて出られない
		const eaterWalk = reach(grid, EATERS);
		const out = [...eaterWalk.keys()].filter((k) => !ISLAND.includes(k));
		check(`σ は小島から歩いて出られない（はみ出し ${out.join(' ') || 'なし'}）`, out.length === 0);
		// 岸（堀の外側の床）は小島の床と 2 マス以上離れる＝σ は岸の勇者に張り付けない
		const shore = floors.filter((k) => !ISLAND.includes(k));
		const near = shore.filter((k) => { const [r, c] = parse(k); return ISLAND.some((i) => { const [ir, ic] = parse(i); return Math.abs(ir - r) + Math.abs(ic - c) <= 1; }); });
		check(`岸の床は小島と隣り合わない（隣 ${near.join(' ') || 'なし'}）`, near.length === 0);
		check(`堀の西の立ち位置（${WEST_MOAT.join('・')}）は水で、小島の床と隣り合う`,
			WEST_MOAT.every((k) => at(k) === TILE.WATER && MOAT.includes(k)) && WEST_MOAT.every((k) => { const [r, c] = parse(k); return ISLAND.includes(key(r, c + 1)); }));
	}

	// ── ③ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵はルピー喰い σ×2（${EATERS.join('・')}）（実測 ${mobs.join(' ')}）`,
			mobs.join() === EATERS.map((k) => `${TILE.RUPEE_EATER}@${k}`).join());
		check(`σ は張り付いて吸う（ENEMY_META.leech）・飛ばない・泳がない・ボスでない`,
			!!ENEMY_META[TILE.RUPEE_EATER].leech && !ENEMY_META[TILE.RUPEE_EATER].move && !ENEMY_META[TILE.RUPEE_EATER].isBoss);
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,1'], ENEMY_META);
		check(`脅威度 ${threat}（σ 22.5×2）が D8 の看板部屋 2,1（${sig}）より軽い`, threat === 45 && threat < sig);
	}

	// ── ④ 層の到達性は不変 ───────────────────────────────────────────────
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
	console.log(`# ${LAYER} ${ROOM}：素の宝箱の部屋を「ルピー喰いの底なし沼」に作り替える（キュー93 の7室目）`);
	console.log(`\n## 盤面の差分（${ROOM}・水は ~ で表示）`);
	TARGET.forEach((row, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === tilesOf()[i].join('') ? '=' : '→'}   ${row}`);
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
