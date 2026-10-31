// dungeon_8 `4,1`（コンパスの十字路 `3,1` の東・南 `4,2` への通り道・床に回復薬）：
// 素の薬の部屋を「猪の泥浴び場」に作り替える
// （2026-10-31 / PLAN 実行キュー 93 の6室目・設計は Opus・ユーザー判断「沈むのは水と溶岩だけ」）
//
// ■ 何が薄かったか（キュー93 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      4 .....7.....#     ← 床に回復薬 7(4,5) が落ちているだけ・敵なし
//      9 #####..#####     ← 西の口（行4-5）・南の口（列5-6）
//
// ■ 新しい `4,1`＝猪の泥浴び場（'~'＝bgTiles の水。tiles 層では床）
//      0 ############
//      1 #......#7..#     ← 回復薬 7(1,8)＝猪の寝床の北西の隅
//      2 #........ω.#     ← 突進猪 ω(2,9)＝寝床の持ち場（enemyHold）。寝床の口は西の (2,7) だけ
//      3 #......##..#
//      4 .......#~~~#     ← 泥沼（行4-5×列8-10・幅2＝はしごでは渡れない）
//      5 .......#~~~#
//      6 #..........#     ← 南岸 (6,9)＝猪の列に立つと、猪が泥沼へ突っ込む
//      7 #..#.......#
//      8 #..........#
//      9 #####..#####
//   ・**主題＝突進猪は突進の勢いで水・溶岩へ突っ込むと沈んで倒れる（キュー93 で足したエンジンの規則・
//     enemy-ai.js dashPlungesAt／startSink）。泥沼を挟んで猪の列に立てば、猪は自分から沈む。**
//   ・猪は寝床の持ち場を動かない（enemyHold）＝歩いて寄ってこない。突進だけはする（行/列に入れば）。
//   ・猪の列は2本だけ＝列9（南岸から泥沼越し）と行2（寝床の口から西の広間）。
//     南岸の (6,9)〜(8,9) に立つ → 猪は南へ突進 → 泥沼 (4,9) へ突っ込んで沈む＝答え①。
//     行2 の西（(2,1)〜(2,6)）に立つ → 猪は口 (2,7) を抜けて西へ突進 → 避ければ西の壁で気絶＝答え②
//     （気絶の間に斬る／持ち場を離れた猪は戻らない＝空いた寝床へ入って薬を取る）。
//   ・寝床の中で斬り合う（口から入る＝隣に立つと突進ではなく体当たり）＝答え③。
//   ・回復薬は直線で狙えない隅＝北は壁・西 (1,7) は壁・南の列8 は (3,8) の壁で切れている
//     ＝ブーメランで持ち帰れない（D4 `4,1` の答えと重ねない）。寝床へ入るのは西の口からだけ。
//   ・西の口↔南の口の通り道は寝床にも泥沼にも塞がれない（はしご無し）。
//   ・脅威度 36.0（看板 `2,1` の 85.5 より軽い）。
//   ・型を重ねない相手＝D8 の毒ヒル3室（`0,2` 水で撒く／`0,1` 笛で眠らせる／`3,1` 重し）・`3,2` 盾騎士の戸口（爆弾）
//     ／D7 `2,3`（猪が空の裂け目の縁で激突＝気絶）。敵が自分から地形に沈むのはここが初めて。
//
// ■ 撤去したもの
//   床の回復薬 7(4,5)。回復薬は寝床の隅 (1,8) へ移した。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と泥は bgTiles だけ／回復薬1つ／宝箱・立札・石・ボタン・門・笛の効き目が無い
//   ・2つの口は、はしごを使わずに互いに歩いて届く／取り残された床が無い（はしご込み）
//   ・寝床へは西の口 (2,7) からしか入れない（口を壁にすると、はしご込みでも薬に届かない）
//   ・泥沼は幅2（はしごで渡れない）・猪の列9 を南へ進むと泥沼に当たる・行2 を西へ進むと西の壁に当たる
//   ・回復薬はどの直線からも狙えない（届く直線は寝床の中だけ）
//   ・敵は ω×1・持ち場（enemyHold）・脅威度が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d8-4-1-boar-wallow.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d8-4-1-boar-wallow.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { holdsPost } from '../shared/enemy-alert.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';
import { reach } from './migrate-d8-0-2-leech-paddy.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_8';
export const ROOM  = '4,1';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（'~' は bgTiles の水として敷き、tiles 側は '.'） ─────────────
export const TARGET = [
	'############',
	'#......#7..#',
	'#........ω.#',
	'#......##..#',
	'.......#~~~#',
	'.......#~~~#',
	'#..........#',
	'#..#.......#',
	'#..........#',
	'#####..#####',
];
export const BOAR = '2,9';
export const POTION = '1,8';
export const DOORWAY = '2,7';                                      // 寝床の口
export const PEN = ['1,8', '1,9', '1,10', '2,8', '2,9', '2,10', '3,9', '3,10'];   // 寝床の中
export const WALLOW = ['4,8', '4,9', '4,10', '5,8', '5,9', '5,10'];               // 泥沼（水）
export const SHORE = ['6,9', '7,9', '8,9'];                        // 南岸の猪の列＝ここに立つと猪が泥沼へ突っ込む
export const WEST_LANE = ['2,1', '2,2', '2,3', '2,4', '2,5', '2,6']; // 行2 の西＝猪が口から飛び出して西の壁へ
export const OPENING = { west: '4,0', south: '9,5' };
// 見た目だけの泥（bgTiles 'w'）＝寝床の床（薬の下も）と南岸
export const MUD = [...PEN, '6,8', '6,9', '6,10'];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

export function tilesOf(target = TARGET) { return target.map((row) => [...row].map((ch) => (ch === TILE.WATER ? TILE.FLOOR : ch))); }
export function bgOf(target = TARGET, mud = MUD) {
	const bg = {};
	target.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === TILE.WATER) bg[key(r, c)] = TILE.WATER; }));
	for (const k of mud) bg[k] = TILE.MUD;
	return bg;
}

// (r,c) から (dr,dc) へまっすぐ進み、最初に当たる「床でない物」を返す（盤面の文字と座標）。
// 敵・薬は床として素通りする（突進の通り道の判定用）。
export function firstObstacle(grid, from, [dr, dc]) {
	let [r, c] = parse(from);
	for (;;) {
		r += dr; c += dc;
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return { ch: '#', at: key(r, c) };
		const ch = grid[r][c];
		if (ch === TILE.WATER || HARD_BLOCKED.has(ch)) return { ch, at: key(r, c) };
	}
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
	room.chestContents = {};
	room.floorItems = {};
	room.showConditions = {};
	room.breakableWalls = {};
	room.signData = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};
	room.enemyHold = { [BOAR]: true };
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
		check(`bgTiles＝水 ${water.length} 枚（泥沼 ${WALLOW.length}）・泥 ${mud.length} 枚（ほかの値なし）`,
			water.length + mud.length === Object.keys(bg).length
			&& water.sort().join() === [...WALLOW].sort().join() && mud.length === MUD.length);
		check(`tiles 層に水を置いていない（水は bgTiles だけ）`, !flat.includes(TILE.WATER));
	}
	check(`回復薬は寝床の隅 ${POTION} の1つだけ`,
		flat.filter((ch) => ch === TILE.ITEM_HEAL_POTION).length === 1 && at(POTION) === TILE.ITEM_HEAL_POTION && PEN.includes(POTION));
	check(`石・宝箱・立札・ボタン・門・床の拾い物・出現条件・笛の効き目が無い`,
		![TILE.STONE, TILE.CHEST, TILE.SIGN, TILE.BUTTON, TILE.GATE].some((ch) => flat.includes(ch))
		&& !Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length && !room.fluteEffect);

	// ── ② 歩行：通り道は塞がない・寝床へは口だけ ─────────────────────────
	{
		const opens = Object.values(OPENING);
		check(`西の口↔南の口は、はしごを使わずに歩いて届く`, reach(grid, [OPENING.west]).has(OPENING.south));
		const floors = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] !== TILE.WATER && !HARD_BLOCKED.has(grid[r][c])) floors.push(key(r, c));
		const lad = reach(grid, opens, { withLadder: true });
		const stranded = floors.filter((k) => !lad.has(k));
		check(`床は全部届く（はしご込み）（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		const shut = grid.map((row) => [...row]);
		{ const [r, c] = parse(DOORWAY); shut[r][c] = TILE.WALL; }
		const sealed = reach(shut, opens, { withLadder: true });
		check(`寝床（${PEN.join('・')}）へは口 ${DOORWAY} を通るしか行けない（口を壁にすると、はしご込みでも届かない）`,
			PEN.every((k) => !sealed.has(k)) && PEN.every((k) => lad.has(k)));
		const walk = reach(grid, opens);
		check(`南岸（${SHORE.join('・')}）と行2 の西（${WEST_LANE.join('・')}）は歩いて届く`, [...SHORE, ...WEST_LANE].every((k) => walk.has(k)));
	}

	// ── ③ 猪の列と泥沼 ───────────────────────────────────────────────────
	{
		const [wr] = parse(WALLOW[0]);
		check(`泥沼は幅2（行${wr}〜${wr + 1}）＝はしごで渡れない（寝床の南の列8〜10 で、泥沼の北も南も床か壁）`,
			[8, 9, 10].every((c) => grid[wr][c] === TILE.WATER && grid[wr + 1][c] === TILE.WATER));
		const south = firstObstacle(grid, BOAR, [1, 0]);
		check(`猪 ${BOAR} が南へ突進すると泥沼に当たる（実測 ${south.at} '${south.ch}'）`, south.ch === TILE.WATER && WALLOW.includes(south.at));
		const west = firstObstacle(grid, BOAR, [0, -1]);
		check(`猪 ${BOAR} が西へ突進すると口 ${DOORWAY} を抜けて西の壁に当たる（実測 ${west.at} '${west.ch}'）`, west.at === '2,0');
		const [br, bc] = parse(BOAR);
		check(`南岸の立ち位置は猪の列（列${bc}）で、猪から 2 マス以上・9 マス以内（突進の間合い）`,
			SHORE.every((k) => { const [r, c] = parse(k); return c === bc && r - br >= 2 && r - br <= 9; }));
		check(`行2 の西の立ち位置は猪の行で、猪から 2 マス以上・9 マス以内`,
			WEST_LANE.every((k) => { const [r, c] = parse(k); return r === br && bc - c >= 2 && bc - c <= 9; }));
		// 回復薬はどの直線からも寝床の外から狙えない（ブーメランで持ち帰れない）
		const lines = [];
		for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			let [r, c] = parse(POTION);
			for (;;) {
				r += d[0]; c += d[1];
				if (r < 0 || c < 0 || r >= ROWS || c >= COLS) break;
				const ch = grid[r][c];
				if (HARD_BLOCKED.has(ch) && ch !== TILE.WATER) break;
				if (ch !== TILE.WATER && !PEN.includes(key(r, c))) lines.push(key(r, c));
			}
		}
		check(`回復薬 ${POTION} へ寝床の外から通る直線が無い（実測 ${lines.join(' ') || 'なし'}）`, lines.length === 0);
	}

	// ── ④ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は突進猪 ω×1（${BOAR}）（実測 ${mobs.join(' ')}）`, mobs.join() === `${TILE.CHARGE_BOAR}@${BOAR}`);
		check(`猪は持ち場を動かない（enemyHold）`, holdsPost(room, BOAR, TILE.CHARGE_BOAR));
		check(`猪は突進する（ENEMY_META.dash）・ボスでない`, !!ENEMY_META[TILE.CHARGE_BOAR].dash && !ENEMY_META[TILE.CHARGE_BOAR].isBoss);
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,1'], ENEMY_META);
		check(`脅威度 ${threat}（ω 36.0）が D8 の看板部屋 2,1（${sig}）より軽い`, threat === 36 && threat < sig);
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
	console.log(`# ${LAYER} ${ROOM}：素の薬の部屋を「猪の泥浴び場」に作り替える（キュー93 の6室目）`);
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
