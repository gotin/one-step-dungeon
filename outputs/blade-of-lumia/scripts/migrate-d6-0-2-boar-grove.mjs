// dungeon_6 `0,2`（爆弾の櫃 `1,2` の西＝`0,1` への通り道）：薄い部屋を「猪の木立ち」に作り替える
// （2026-11-05 / PLAN 実行キュー 95 の2室目・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー95 の着手時の実測＝`.scratch/q95/dump-d6.mjs`）
//      0 #####..#####     ← 北の口（`0,1` へ）
//      2 #....B.....#     ← 宝箱（ルピー×5）が床に置いてあるだけ
//      4 #...........     ← 東の口（`1,2` 爆弾の櫃から）
//      6 #..u....H..#     ← 茂み1つ・消えたかがり火1つ（どこにもつながらない飾り）
//      9 ############
//   四角い広間に宝箱・茂み・かがり火が1つずつ・敵なし。
//
// ■ 新しい `0,2`＝猪の木立ち（木の柱の並ぶ林に突進猪。倒すと宝箱が現れる）
//      0 #####..#####
//      1 #u.........#
//      2 #.t..t..t..#
//      3 #..........#
//      4 #.t..t..t...     ← 東の口
//      5 #...........
//      6 #.t..t..t..#
//      7 #...ω......#     ← 突進猪 ω(7,4)
//      8 #B........u#     ← 宝箱 B(8,1)＝猪を倒すと現れる（killAll）
//      9 ############
//   ・突進猪はこちらの行/列に入ると溜め 3 tick → 直線に突進し、地形に当たると 12 tick 気絶する
//     （`shared/enemies.js` CHARGE_BOAR の dash）。突進を始めるかは**間に何があっても**判断する
//     （`game/enemy-ai.js` tickDash の idle＝視線を見ない）＝**木の陰に立てば猪は木に頭を打つ**。
//   ・木は縦横3マスおきの柱（9本）＝林のどこに居ても、すぐ隣に盾になる木がある。開けた所で
//     避けると猪は壁まで走って遠くで気絶する（斬りに行く前に起きる）。木の陰で受ければ目の前で
//     気絶する＝回り込んで斬れる。**「森の木を盾にする」が答え**（D6＝森の聖域の語彙）。
//   ・倒すと宝箱（ルピー×20・旧 ルピー×5）が現れる。倒さずに東の口から北の口へ抜けてもよい
//     （ここは `1,2` 北の岩壁を迂回して `1,1` へ行く道＝ユーザー判断 2026-11-05「迂回はそのまま」
//     ＝通り抜けに条件を付けない）。
//   ・爆弾は使わない（キュー95 の混ぜ方＝同じ形を連続させない・1室目 `0,3` が爆弾）。爆弾の
//     在庫も食わない（`1,2` の 3 個＝`0,3` で 1 個・鍵の部屋 `1,0` で 2 個）。
//   ・D6 の他の部屋と型を分けた＝`0,3` ルピー喰いの檻（爆弾）／`2,3` 分裂スライムの巣（看板・
//     開けた広間の戦闘）／`3,3` 檻の番人（石）／`1,1` 聖樹の火の継ぎ渡し（火）。ダンジョンの
//     突進猪は D7 `2,3`（空の上で鬼と）・D8 `4,1`（泥の水へ突っ込ませて沈める）＝木を盾に
//     するのはここだけ。
//
// ■ 撤去したもの
//   床の宝箱 B(2,5)（中身はルピー×20 に増やして (8,1) へ）・茂み u(6,3)・かがり火 H(6,8)。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／宝の中身と出る条件（killAll）／breakableWalls・floorItems・links・signData が空／外周の口の形が不変
//   ・東の口と北の口がつながる・床は全部届く（取り残しなし）・宝箱に届く
//   ・木の柱：どの木も四方のうち向かい合う2辺が床＝「陰に立つ側」と「猪が来る側」がある
//   ・林の床のどこからも、縦横1マスに木か壁がある（盾が遠くない）
//   ・敵と脅威度（看板 `2,3` より軽い）・床の爆弾と朽ちた根が無い・層の到達性が書き換え前と同じ
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-0-2-boar-grove.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-0-2-boar-grove.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_6';
export const ROOM  = '0,2';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#u.........#',
	'#.t..t..t..#',
	'#..........#',
	'#.t..t..t...',
	'#...........',
	'#.t..t..t..#',
	'#...ω......#',
	'#B........u#',
	'############',
];
export const CHEST = '8,1';
export const BOAR  = '7,4';
export const EAST_MOUTH  = ['4,11', '5,11'];
export const NORTH_MOUTH = ['0,5', '0,6'];
export const TREES = [];
for (const r of [2, 4, 6]) for (const c of [2, 5, 8]) TREES.push(`${r},${c}`);
export const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 50, name: 'ルピー×50' } };   // キュー100（2026-11-09）で差し替え＝scripts/migrate-q100-dungeon-rewards.mjs
export const SHOW = { [CHEST]: { trigger: 'killAll', message: '{{sword}} 木立ちの 主を 退けた！宝箱が現れた！' } };

// 部屋の中だけの歩行（4近傍）。敵のセルと宝箱は床とみなす。
export function reach(grid, starts) {
	const seen = new Set();
	const q = [];
	const ok = (r, c) => {
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
		const ch = grid[r][c];
		if (ENEMY_META[ch]) return true;
		if (ch === TILE.CHEST) return true;
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
	const layerRun = () => bfsLayer(stages, START, { withLadder: false, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: false, openTiles: new Set(['T', '!', 'D', '=']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`盤面は ${ROWS}×${COLS}`, TARGET.length === ROWS && TARGET.every((row) => [...row].length === COLS));
	check(`外周の口の形が書き換え前と同じ`, ringOf(before) === ringOf(TARGET));
	room.tiles = TARGET.map((row) => [...row]);
	room.chestContents = { ...CHEST_CONTENTS };
	room.showConditions = JSON.parse(JSON.stringify(SHOW));
	room.breakableWalls = {};
	room.floorItems = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`宝箱 ${CHEST} の中身＝ルピー×20`, JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
	check(`宝箱は1つだけ`, t.flat().filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST) === TILE.CHEST);
	check(`宝箱は猪を倒すと現れる（showConditions は ${CHEST} の killAll だけ）`,
		JSON.stringify(Object.keys(room.showConditions)) === JSON.stringify([CHEST]) && room.showConditions[CHEST].trigger === 'killAll');
	check(`床の爆弾 '5'・朽ちた根 '!'・かがり火 'H' が無い`,
		![TILE.ITEM_BOMB, TILE.BREAKABLE_WALL, TILE.TORCH].some((ch) => t.flat().includes(ch)));
	check(`breakableWalls・floorItems・signData が空`,
		!Object.keys(room.breakableWalls).length && !Object.keys(room.floorItems).length && !Object.keys(room.signData ?? {}).length);

	// ── ② 歩行：通り抜けと取り残し ─────────────────────────────────────
	const fromEast = reach(t, EAST_MOUTH);
	check(`東の口から北の口へ抜けられる`, NORTH_MOUTH.every((k) => fromEast.has(k)));
	check(`東の口から宝箱 ${CHEST} に届く`, fromEast.has(CHEST));
	const floors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = t[r][c];
		if (ch === TILE.FLOOR || ENEMY_META[ch] || ch === TILE.CHEST) floors.push(`${r},${c}`);
	}
	const stranded = floors.filter((k) => !fromEast.has(k));
	check(`床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);

	// ── ③ 木の柱：盾になる形 ────────────────────────────────────────────
	{
		const floorAt = (r, c) => { const ch = t[r]?.[c]; return ch === TILE.FLOOR || ENEMY_META[ch] || ch === TILE.CHEST; };
		check(`木は ${TREES.length} 本の柱だけ（実測 ${t.flat().filter((ch) => ch === TILE.TREE).length}）`,
			TREES.every((k) => at(k) === TILE.TREE) && t.flat().filter((ch) => ch === TILE.TREE).length === TREES.length);
		const bad = TREES.filter((k) => {
			const [r, c] = k.split(',').map(Number);
			return !(floorAt(r - 1, c) && floorAt(r + 1, c) && floorAt(r, c - 1) && floorAt(r, c + 1));
		});
		check(`どの木も四方が床＝縦にも横にも「陰に立つ側」と「猪が来る側」がある（欠け ${bad.join(' ') || 'なし'}）`, bad.length === 0);
		// 林の中（行1〜8・列1〜10）のどの床からも、縦横1マスに木か壁がある＝すぐ横に盾がある
		const blocks = (r, c) => { const ch = t[r]?.[c]; return ch === TILE.TREE || ch === TILE.WALL || ch === TILE.BUSH; };
		const far = floors.filter((k) => {
			const [r, c] = k.split(',').map(Number);
			if (r < 1 || r > 8 || c < 1 || c > 10) return false;
			return ![[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1], [r - 1, c - 1], [r - 1, c + 1], [r + 1, c - 1], [r + 1, c + 1]].some(([a, b]) => blocks(a, b));
		});
		check(`林の床のどこからも周り8マスに木か壁がある（遠いセル ${far.join(' ') || 'なし'}）`, far.length === 0);
	}

	// ── ④ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は突進猪 ω ${BOAR} の1体だけ（実測 ${mobs.join(' ')}）`, mobs.join() === `${TILE.CHARGE_BOAR}@${BOAR}`);
		check(`突進猪は壁ヒットで気絶する（dash.stunMs ${ENEMY_META[TILE.CHARGE_BOAR].dash?.stunMs}）`, (ENEMY_META[TILE.CHARGE_BOAR].dash?.stunMs ?? 0) > 0);
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（ω 1体＝36.0）が D6 の看板部屋 2,3（${sig}）より軽い`, threat === 36 && threat < sig);
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
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「猪の木立ち」に作り替える（キュー95 の2室目）`);
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
