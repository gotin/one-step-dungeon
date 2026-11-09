// dungeon_3 `2,0`（`1,0`〈鍵の関門〉の東の行き止まり・ボス扉 `1,1` の2室手前・床の大ルピー R）：
// 素の部屋を「射水魚の入り江」に作り替える
// （2026-11-04 / PLAN 実行キュー 94 の4室目・主題はユーザー判断「射水魚の入り江」・設計は Opus）
//
// ■ 何が薄かったか（キュー94 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      4 ......R....#     ← 西の口（行4-5）＝`1,0` へ・床の大ルピー 'R'(4,6)・敵なし
//      9 ############
//
// ■ 新しい `2,0`＝射水魚の入り江（'~'＝bgTiles の水。tiles 層では床。魚の文字は tiles 層に置く）
//      0 ############
//      1 #.........B#     ← 北の岸（行1）・宝箱 B(1,10)＝回復薬（大）（全滅で現れる）
//      2 #..~~~#~~~~#
//      3 #..~/~#~~~~#     ← 西の湾の射水魚 /(3,4)
//      4 ...~~~#~~/~#     ← 西の口（行4-5）／東の湾の射水魚 /(4,9)
//      5 ...~~~#~~~~#
//      6 #..~~~#~~~~#
//      7 #..~~~#~~~~#
//      8 #6.~~~#~~~~#     ← 床の矢束×5 '6'(8,1)
//      9 ############
//   ・**D3 で初めての水棲の敵**（「水の迷宮なのに水棲の敵が 0 体」の解消・ユーザー判断 2026-11-04）。
//     射水魚は水から出られず、届き 6・任意の角度で水弾を撃つ（2.2 秒おき）。勇者の矢は縦横にしか飛ばない
//     ＝**魚は斜めから撃てるが、こちらは並ばないと射返せない。**
//   ・入り江は岩礁（列6 の岩 7 枚）で**西の湾と東の湾に割れていて、魚は1匹ずつ**。水弾も矢も岩で止まる。
//   ・**読み＝湾の上の岸に立って水を向けば、その湾の魚とだけ向き合える。** 魚は勇者へ寄ってきて真下に並ぶ
//     ＝正面の水弾は盾が受け、隣の湾の魚の水弾は岩礁が止める ＝ 盾を構えたまま射る（矢2本で1匹）。
//     **岩礁の付け根 (1,6) だけは両方の湾から斜めに狙われる**＝並ばないので射返せず、盾は片方しか受けない
//     （実測 `.scratch/q94b/probe-plan.mjs`＝勇者ハート6 で (1,6) に立ち続けると 113 tick で倒れる／
//      (1,4) と (1,8) で1匹ずつ射ると被弾はハート1〜2つ）。
//   ・答えは3つ＝①湾の上で下を向いて射る ②寄ってきた魚を岸から斬る（振る間は盾が下がる）
//     ③ブーメランで止めて射る。歩き続ければ水弾はほぼ外れる＝危ないのは立ち止まる所を間違えたとき。
//   ・**全滅（killAll）で宝箱が北東の角に出る＝回復薬（大）**（ボス扉の2室手前）。床の矢束×5（南西の角）
//     ＝矢を切らして来ても詰まない（鍵の関門 `1,0` で矢を使い切ることがある）。
//   ・脅威度 32.0（射水魚 16.0×2）＝看板部屋 `1,3`（36.0）より軽い。
//   ・型を重ねない相手＝D5 `1,2`「凍れる水路の番兵」（鮫・魚・骸骨を全滅ではしご＝水路の向こうへ渡る）・
//     `2,2`「凍れる湖の一周道」（湖を巡る岸を駆け抜ける＝倒すのは任意）・`2,1`（鮫の穴のリズム）。
//     ここは**岩礁が湾を割る＝立ち位置で相手を1匹に絞る**読み。潜み鮫は使わない（「浮いた鮫を岸から斬る」は D5 の型）。
//
// ■ 撤去／移したもの
//   床の大ルピー 'R'(4,6) → 撤去（報酬は宝箱の回復薬（大）に替えた）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水は bgTiles だけ／宝箱1つ＝回復薬（大）・killAll／矢束×5／余計な仕掛けなし／外周の口の形が不変
//   ・西の口から宝箱・矢束・北の岸へ歩いて届く／取り残しなし
//   ・水は岩礁で2つに割れている（魚は互いの湾へ行けない）・魚は1匹ずつ各湾に
//   ・西の湾の上 (1,4) へは東の湾の岩礁沿い（列7）から、東の湾の上 (1,8) へは西の湾の岩礁沿い（列5）から線が通らない
//   ・岩礁の付け根 (1,6) へは両方の湾の岩礁沿いから線が通る（対照）
//   ・脅威度 32.0 が看板部屋より軽い・宣言あり
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d3-2-0-reef-archerfish.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d3-2-0-reef-archerfish.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_3';
export const ROOM  = '2,0';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（'~' は bgTiles の水として敷き、tiles 側は '.'。魚 '/' の下も水） ──────
export const TARGET = [
	'############',
	'#.........B#',
	'#..~~~#~~~~#',
	'#..~/~#~~~~#',
	'...~~~#~~/~#',
	'...~~~#~~~~#',
	'#..~~~#~~~~#',
	'#..~~~#~~~~#',
	'#6.~~~#~~~~#',
	'############',
];
export const FISH_WEST = '3,4';
export const FISH_EAST = '4,9';
export const CHEST_CELL = '1,10';
export const ARROWS_CELL = '8,1';
export const ARROWS_COUNT = 5;
export const REEF_COL = 6;
export const SPOT_WEST = '1,4';    // 西の湾の上＝西の魚とだけ向き合う所
export const SPOT_EAST = '1,8';    // 東の湾の上
export const REEF_ROOT = '1,6';    // 岩礁の付け根＝両方の湾から狙われる所
export const OPENING = { west: '4,0' };
export const CHEST = { type: 'rupee', value: 50, name: 'ルピー×50' };   // キュー100（2026-11-09）で差し替え＝scripts/migrate-q100-dungeon-rewards.mjs

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

export function tilesOf(target = TARGET) { return target.map((row) => [...row].map((ch) => (ch === TILE.WATER ? TILE.FLOOR : ch))); }
export function bgOf(target = TARGET) {
	const bg = {};
	target.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === TILE.WATER || ch === TILE.ARCHER_FISH) bg[key(r, c)] = TILE.WATER; }));
	return bg;
}
const isWater = (grid, r, c) => grid[r]?.[c] === TILE.WATER || grid[r]?.[c] === TILE.ARCHER_FISH;

const standable = (grid, r, c) => {
	if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
	const ch = grid[r][c];
	if (isWater(grid, r, c)) return false;
	return !HARD_BLOCKED.has(ch);
};

// 歩ける所（水と固い物は通れない。宝箱は通れる＝connectivity と同じ）
export function walk(grid, starts) {
	const seen = new Set();
	const q = [];
	for (const k of starts) { const [r, c] = parse(k); if (standable(grid, r, c) && !seen.has(k)) { seen.add(k); q.push([r, c]); } }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = key(nr, nc);
			if (!seen.has(k) && standable(grid, nr, nc)) { seen.add(k); q.push([nr, nc]); }
		}
	}
	return seen;
}

// 水のつながり（魚が泳げる所）
export function swim(grid, start) {
	const seen = new Set([start]);
	const q = [parse(start)];
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = key(nr, nc);
			if (!seen.has(k) && isWater(grid, nr, nc)) { seen.add(k); q.push([nr, nc]); }
		}
	}
	return seen;
}

// 水弾の線が通るか（投擲物はセルの中心を整数座標に持ち、四捨五入したセルが壁なら消える＝projectile.js と同じ見方）。
// 0.05 刻みで線をなぞり、途中のセルに壁が1つでもあれば通らない。
export function lineClear(grid, from, to) {
	const [r0, c0] = parse(from), [r1, c1] = parse(to);
	const n = Math.ceil(Math.hypot(r1 - r0, c1 - c0) / 0.05);
	for (let i = 1; i < n; i++) {
		const y = r0 + (r1 - r0) * i / n, x = c0 + (c1 - c0) * i / n;
		if (grid[Math.round(y)]?.[Math.round(x)] === TILE.WALL) return false;
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

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2)
	const layerRun = () => bfsLayer(stages, START, { withLadder: false, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: false, openTiles: new Set(['T', '!', 'D', '=', '(', ')']) });
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
	room.chestContents = { [CHEST_CELL]: { ...CHEST } };
	room.floorItems = { [ARROWS_CELL]: { count: ARROWS_COUNT } };
	room.showConditions = { [CHEST_CELL]: { trigger: 'killAll' } };
	room.breakableWalls = {};
	room.signData = {};
	room.links = [];
	room.enemyDirs = {};
	delete room.enemyChase;   // 魚はさまよう（気づくまで家の周り）＝届き 6 に入れば気づく前から撃ってくる
	delete room.enemyHold;
	delete room.enemiesRespawn;
	delete room.fluteEffect;
	delete room.tideCycle;

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const grid = TARGET.map((row) => [...row]);
	const at = (k) => { const [r, c] = parse(k); return grid[r][c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === tilesOf().map(rowStr).join('\n'));
	{
		const bg = room.bgTiles;
		const water = Object.keys(bg).filter((k) => bg[k] === TILE.WATER);
		check(`bgTiles＝水 ${water.length} 枚だけ（ほかの値なし）・魚の下も水`,
			water.length === Object.keys(bg).length && water.length > 0 && bg[FISH_WEST] === TILE.WATER && bg[FISH_EAST] === TILE.WATER);
		check(`tiles 層に水を置いていない（水は bgTiles だけ）`, !flat.includes(TILE.WATER));
	}
	check(`宝箱は ${CHEST_CELL} の1つだけ＝回復薬（大）・全滅（killAll）で出る`,
		flat.filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST_CELL) === TILE.CHEST
		&& room.chestContents[CHEST_CELL]?.type === CHEST.type && room.chestContents[CHEST_CELL]?.value === CHEST.value && Object.keys(room.chestContents).length === 1
		&& room.showConditions[CHEST_CELL]?.trigger === 'killAll' && Object.keys(room.showConditions).length === 1);
	check(`床の矢束は ${ARROWS_CELL} の1つ×${ARROWS_COUNT}`,
		flat.filter((ch) => ch === TILE.ITEM_ARROWS).length === 1 && at(ARROWS_CELL) === TILE.ITEM_ARROWS
		&& room.floorItems[ARROWS_CELL]?.count === ARROWS_COUNT && Object.keys(room.floorItems).length === 1);
	check(`石・立札・ボタン・鐘・門・潮ゲート・ほかの拾い物・潮の周期・links が無い`,
		![TILE.STONE, TILE.SIGN, TILE.BUTTON, TILE.SWITCH, TILE.GATE, TILE.TIDE_GATE, TILE.RUPEE, TILE.RUPEE_LARGE,
			TILE.ITEM_HEAL_POTION, TILE.ITEM_BIG_HEAL_POTION].some((ch) => flat.includes(ch))
		&& !room.tideCycle && !room.links.length && !Object.keys(room.signData).length);

	// ── ② 歩行 ──────────────────────────────────────────────────────────
	const floors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (standable(grid, r, c)) floors.push(key(r, c));
	const reach = walk(grid, [OPENING.west]);
	check(`西の口から宝箱・矢束・湾の上・岩礁の付け根へ歩いて届く`,
		[CHEST_CELL, ARROWS_CELL, SPOT_WEST, SPOT_EAST, REEF_ROOT].every((k) => reach.has(k)));
	{
		const stranded = floors.filter((k) => !reach.has(k));
		check(`床が全部つながっている（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	}
	check(`湾の上・付け根は北の岸＝真下が水`,
		[SPOT_WEST, SPOT_EAST, REEF_ROOT].every((k) => { const [r, c] = parse(k); return r === 1 && (k === REEF_ROOT ? grid[2][c] === TILE.WALL : isWater(grid, 2, c)); }));

	// ── ③ 岩礁が湾を割る ───────────────────────────────────────────────
	{
		const west = swim(grid, FISH_WEST);
		const east = swim(grid, FISH_EAST);
		check(`水は岩礁で2つに割れている（西の湾 ${west.size} 枚・東の湾 ${east.size} 枚・行き来なし）`,
			!west.has(FISH_EAST) && !east.has(FISH_WEST) && [...west].every((k) => parse(k)[1] < REEF_COL) && [...east].every((k) => parse(k)[1] > REEF_COL));
		const reef = [];
		for (let r = 2; r <= 8; r++) reef.push(grid[r][REEF_COL]);
		check(`岩礁は列 ${REEF_COL} の行2〜8 の岩 7 枚（北の岸の下から南の壁まで切れ目なし）`, reef.every((ch) => ch === TILE.WALL));
		// 魚が勇者へ寄ると、岩礁沿いの列（西の湾＝列5・東の湾＝列7）に来る。そこから隣の湾の上へは線が通らない。
		const edgeWest = [], edgeEast = [];
		for (let r = 2; r <= 8; r++) { edgeWest.push(key(r, REEF_COL - 1)); edgeEast.push(key(r, REEF_COL + 1)); }
		const leakW = edgeEast.filter((k) => lineClear(grid, k, SPOT_WEST));
		const leakE = edgeWest.filter((k) => lineClear(grid, k, SPOT_EAST));
		check(`西の湾の上 ${SPOT_WEST} へ、東の湾の岩礁沿い（列7）から水弾の線が通らない（実測 ${leakW.join(' ') || 'なし'}）`, leakW.length === 0);
		check(`東の湾の上 ${SPOT_EAST} へ、西の湾の岩礁沿い（列5）から水弾の線が通らない（実測 ${leakE.join(' ') || 'なし'}）`, leakE.length === 0);
		const rootW = edgeWest.filter((k) => lineClear(grid, k, REEF_ROOT));
		const rootE = edgeEast.filter((k) => lineClear(grid, k, REEF_ROOT));
		check(`対照：岩礁の付け根 ${REEF_ROOT} へは両方の湾の岩礁沿いから線が通る（西 ${rootW.length}・東 ${rootE.length}）`, rootW.length > 0 && rootE.length > 0);
	}

	// ── ④ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は射水魚 ×2（西 ${FISH_WEST}・東 ${FISH_EAST}）だけ（実測 ${mobs.join(' ')}）`,
			mobs.sort().join() === [`${TILE.ARCHER_FISH}@${FISH_EAST}`, `${TILE.ARCHER_FISH}@${FISH_WEST}`].sort().join());
		check(`射水魚は水しか泳げず、任意の角度で撃つ（届き ${ENEMY_META[TILE.ARCHER_FISH].attack.range}）`,
			ENEMY_META[TILE.ARCHER_FISH].move === 'water' && ENEMY_META[TILE.ARCHER_FISH].attack.type === 'waterShot');
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['1,3'], ENEMY_META);
		check(`脅威度 ${threat}（射水魚 16.0×2）が D3 の看板部屋 1,3（${sig}）より軽い`, threat === 32 && threat < sig);
		check(`EXTRA_ENEMY_ROOMS に宣言がある`, EXTRA_ENEMY_ROOMS.some((x) => x.layer === LAYER && x.stage === ROOM));
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
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「射水魚の入り江」に作り替える（キュー94 の4室目）`);
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
