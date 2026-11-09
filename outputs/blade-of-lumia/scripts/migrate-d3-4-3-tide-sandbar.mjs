// dungeon_3 `4,3`（`3,3` の東の行き止まり・床にルピー R が1つ）：
// 素の部屋を「潮だまりの砂州」に作り替える
// （2026-11-02 / PLAN 実行キュー 94 の1室目・設計は Opus・ユーザー判断「潮の満ち引き」）
//
// ■ 何が薄かったか（キュー94 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      4 ......R....#     ← 床のルピー R(4,6) が1つあるだけ・敵なし
//      9 ############     ← 西の口（行4-5）だけ
//
// ■ 新しい `4,3`＝潮だまりの砂州（'~'＝bgTiles の水。tiles 層では床）
//      0 ############
//      1 #...~~~~~~~#
//      2 #...~~~~~~~#
//      3 #...~~~~~..#     ← 小島（行3〜6×列9〜10・砂 'd'）
//      4 ....~~~~~.E#     ← パトロール E(4,10)
//      5 ....=====..#     ← 砂州＝潮ゲート (5,4)〜(5,8)（幅1・砂 'd' の上・時間で満ち引き）
//      6 #...~~~~~.B#     ← 宝箱 B(6,10)＝ルピー×20
//      7 #...~~~~~~~#
//      8 #...~~~~~~~#
//      9 ############
//   ・**主題＝潮は勝手に満ち引きする（新設のエンジンの規則＝game/tide.js・DECISIONS 2026-11-02）。**
//     満ち 3.6 秒 → 引き 3.0 秒（最後の 0.72 秒は砂州が波打つ予告）の繰り返し。入るたびに満ちから始まる。
//     満ちた瞬間、砂州の上の雑魚は沈んで倒れる／勇者は最後に乾いた所へ押し戻されて半ハート減る。
//   ・D3 の1室目＝規則を**見せる**部屋（入口から3室目＝弓の前にも来られる）。パトロールはいつも追う
//     （enemyChase）＝引くたびに砂州へ出てくる。足は勇者の約 1/4（5 マスに約 40 tick＝引きの 25 tick では
//     渡り切れない）∴砂州へ出た E は必ず満ち潮に呑まれる。答えは3つ：
//     ① 岸で待つ＝砂州へ出てきた E が満ち潮に呑まれるのを見て、次の引きで渡る
//     ② 引いた瞬間に渡る＝砂州の上で E とかち合う（幅1＝すれ違えない）→潮に追われながら斬る（hp 4）
//     ③ 砂州の上の E をブーメランで止めて、満ちるのを待つ（止まったまま沈む）
//     罰＝砂州の上でぐずぐずすると押し戻される（半ハート）。
//   ・脅威度 4.0（E×1・看板 `1,3` の 36.0 より軽い）。
//   ・型を重ねない相手＝D5 の水門（鐘・ボタンで潮を操る＝勇者が動かす）／D4 `4,3`「火口湖の甲羅島」
//     （島の敵を弓で射る）／D8 `4,1`「猪の泥浴び場」（敵が自分の突進で沈む）。ここは**時間が沈める**。
//
// ■ 撤去したもの
//   床のルピー R(4,6)（宝箱ルピー×20 に置き換え）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と砂は bgTiles だけ／宝箱1つ（中身ルピー×20）／潮の周期／砂州は links に無い
//   ・西の口から岸は歩いて届く／小島へは潮が引けば届き、満ちれば届かない／取り残し無し（引いた時）
//   ・砂州は幅1・両脇は水／口と口の前は潮ゲートでない（入ってすぐ押し戻されない）
//   ・パトロールの家は小島・敵と脅威度
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d3-4-3-tide-sandbar.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d3-4-3-tide-sandbar.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_3';
export const ROOM  = '4,3';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（'~' は bgTiles の水として敷き、tiles 側は '.'） ─────────────
export const TARGET = [
	'############',
	'#...~~~~~~~#',
	'#...~~~~~~~#',
	'#...~~~~~..#',
	'....~~~~~.E#',
	'....=====..#',
	'#...~~~~~.B#',
	'#...~~~~~~~#',
	'#...~~~~~~~#',
	'############',
];
export const TIDE_CYCLE = { highMs: 3600, lowMs: 3000, warnMs: 720 };
export const PATROL = '4,10';
export const CHEST = '6,10';
export const CHEST_CONTENT = { type: 'rupee', value: 50, name: 'ルピー×50' };   // キュー100（2026-11-09）で差し替え＝scripts/migrate-q100-dungeon-rewards.mjs
export const SANDBAR = ['5,4', '5,5', '5,6', '5,7', '5,8'];
export const ISLAND = [];
for (let r = 3; r <= 6; r++) for (let c = 9; c <= 10; c++) ISLAND.push(`${r},${c}`);
export const SHORE_STAND = '5,3';   // 砂州の根元（岸の端）
export const OPENING = { west: '4,0' };
// 見た目の砂（bgTiles 'd'）＝砂州と小島（宝箱・パトロールの下も）
export const SAND = [...SANDBAR, ...ISLAND];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

export function tilesOf(target = TARGET) { return target.map((row) => [...row].map((ch) => (ch === TILE.WATER ? TILE.FLOOR : ch))); }
export function bgOf(target = TARGET, sand = SAND) {
	const bg = {};
	target.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === TILE.WATER) bg[key(r, c)] = TILE.WATER; }));
	for (const k of sand) bg[k] = TILE.SAND;
	return bg;
}

// 歩ける所（水と固い物は通れない・潮ゲートは tideOpen のときだけ）
export function walk(grid, starts, { tideOpen = false } = {}) {
	const ok = (r, c) => {
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
		const ch = grid[r][c];
		if (ENEMY_META[ch]) return true;
		if (ch === TILE.WATER) return false;
		if (ch === TILE.TIDE_GATE) return tideOpen;
		return !HARD_BLOCKED.has(ch);
	};
	const seen = new Set();
	const q = [];
	for (const k of starts) { const [r, c] = parse(k); if (ok(r, c) && !seen.has(k)) { seen.add(k); q.push([r, c]); } }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = key(nr, nc);
			if (!seen.has(k) && ok(nr, nc)) { seen.add(k); q.push([nr, nc]); }
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
	room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
	room.floorItems = {};
	room.showConditions = {};
	room.breakableWalls = {};
	room.signData = {};
	room.links = [];
	room.enemyDirs = {};
	room.tideCycle = { ...TIDE_CYCLE };
	room.enemyChase = { [PATROL]: true };   // さまよわずに最初から追う＝引くたびに必ず砂州へ出る
	delete room.enemyHold;
	delete room.enemiesRespawn;
	delete room.fluteEffect;

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const grid = TARGET.map((row) => [...row]);
	const at = (k) => { const [r, c] = parse(k); return grid[r][c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === tilesOf().map(rowStr).join('\n'));
	{
		const bg = room.bgTiles;
		const water = Object.keys(bg).filter((k) => bg[k] === TILE.WATER);
		const sand = Object.keys(bg).filter((k) => bg[k] === TILE.SAND);
		check(`bgTiles＝水 ${water.length} 枚・砂 ${sand.length} 枚（ほかの値なし）`,
			water.length + sand.length === Object.keys(bg).length && sand.sort().join() === [...SAND].sort().join());
		check(`tiles 層に水を置いていない（水は bgTiles だけ）`, !flat.includes(TILE.WATER));
	}
	check(`宝箱は小島の ${CHEST} の1つだけ・中身はルピー×20`,
		flat.filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST) === TILE.CHEST && ISLAND.includes(CHEST)
		&& Object.keys(room.chestContents).join() === CHEST && room.chestContents[CHEST].value === 20);
	check(`潮の周期＝満ち ${TIDE_CYCLE.highMs}ms・引き ${TIDE_CYCLE.lowMs}ms・予告 ${TIDE_CYCLE.warnMs}ms（どれも tick 120ms の倍数）`,
		JSON.stringify(room.tideCycle) === JSON.stringify(TIDE_CYCLE)
		&& Object.values(TIDE_CYCLE).every((v) => v % 120 === 0) && TIDE_CYCLE.warnMs < TIDE_CYCLE.lowMs);
	check(`潮ゲートは砂州の ${SANDBAR.length} 枚だけ・どれも links に無い（＝潮の周期で動く）`,
		flat.filter((ch) => ch === TILE.TIDE_GATE).length === SANDBAR.length && SANDBAR.every((k) => at(k) === TILE.TIDE_GATE)
		&& room.links.length === 0);
	check(`石・立札・ボタン・鐘・門・床の拾い物・出現条件・笛の効き目が無い`,
		![TILE.STONE, TILE.SIGN, TILE.BUTTON, TILE.SWITCH, TILE.GATE, TILE.RUPEE].some((ch) => flat.includes(ch))
		&& !Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length && !room.fluteEffect);

	// ── ② 歩行：満ちれば小島は離れ、引けばつながる ──────────────────────────
	{
		const floors = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const ch = grid[r][c];
			if (ch !== TILE.WATER && !HARD_BLOCKED.has(ch) && ch !== TILE.CHEST) floors.push(key(r, c));
		}
		const high = walk(grid, [OPENING.west], { tideOpen: false });
		const lowW = walk(grid, [OPENING.west], { tideOpen: true });
		const islandFloor = ISLAND.filter((k) => k !== CHEST);
		check(`満ちている間、小島へは歩いて届かない`, islandFloor.every((k) => !high.has(k)));
		const stranded = floors.filter((k) => !lowW.has(k));
		check(`引いている間は床が全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		check(`岸の砂州の根元 ${SHORE_STAND} は満ちていても届く`, high.has(SHORE_STAND));
		// 砂州は幅1＝上下は水
		const narrow = SANDBAR.every((k) => { const [r, c] = parse(k); return grid[r - 1][c] === TILE.WATER && grid[r + 1][c] === TILE.WATER; });
		check(`砂州は幅1（上下は水）`, narrow);
		// 口と口の前（1マス内側）は潮ゲートでない
		const mouth = ['4,0', '5,0', '4,1', '5,1'];
		check(`口と口の前は潮ゲートでない（入った瞬間に押し戻されない）`, mouth.every((k) => at(k) !== TILE.TIDE_GATE));
		// 小島は砂州の東の端としかつながらない（水で囲まれている）
		const islandNeighbors = new Set();
		for (const k of ISLAND) {
			const [r, c] = parse(k);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nk = key(r + dr, c + dc);
				if (!ISLAND.includes(nk) && grid[r + dr][c + dc] !== TILE.WALL && grid[r + dr][c + dc] !== TILE.WATER) islandNeighbors.add(nk);
			}
		}
		check(`小島の陸の隣は砂州の東の端だけ（実測 ${[...islandNeighbors].join(' ')}）`, [...islandNeighbors].join() === '5,8');
	}

	// ── ③ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵はパトロール E×1（${PATROL}・小島）（実測 ${mobs.join(' ')}）`,
			mobs.join() === `${TILE.PATROL}@${PATROL}` && ISLAND.includes(PATROL));
		check(`E は歩く陸の敵（飛ばない・泳がない・ボスでない）＝満ち潮で沈む側`,
			!ENEMY_META[TILE.PATROL].move && !ENEMY_META[TILE.PATROL].isBoss);
		check(`E はいつも追う（enemyChase）＝さまよわず、引くたびに砂州へ出る`,
			JSON.stringify(room.enemyChase) === JSON.stringify({ [PATROL]: true }));
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['1,3'], ENEMY_META);
		check(`脅威度 ${threat}（E 4.0）が D3 の看板部屋 1,3（${sig}）より軽い`, threat === 4 && threat < sig);
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
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「潮だまりの砂州」に作り替える（キュー94 の1室目）`);
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
