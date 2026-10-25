// dungeon_8 `0,2`（笛の間 `1,2` の西・`0,1` との通り道）：素の部屋を「毒ヒルの泥田」に作り替える
// （2026-10-25 / PLAN 実行キュー 93 の1室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー93 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 #####..#####     ← 北の口（列5-6）→ `0,1`
//      4 #....B......     ← 宝箱 B(4,5)＝回復薬（小）・東の口（行4-5）→ `1,2`
//      9 ############
//   真ん中に宝箱が1つあるだけ・敵なし。
//
// ■ 新しい `0,2`＝毒ヒルの泥田
//      0 #####..#####
//      1 #~~~~......#     ← 島の北の堀（壁に接する＝はしごの橋脚が無い）
//      2 #B..~......#     ← 宝箱 B(2,1)＝回復薬（小）・島の北西の隅
//      3 #...~......#
//      4 #.Γ.~.......     ← 島の毒沼ヒル Γ(4,2)・東の口
//      5 #...~.......
//      6 #...~...Γ..#     ← 本土の毒沼ヒル Γ(6,8)
//      7 #~.~~......#     ← 畦 (7,2)＝歩いて島へ入れる唯一のセル
//      8 #..........#     ← 南の小道（畦へ回り込む道）
//      9 ############
//   （`~`＝bgTiles の水・tiles は '.'。島（宝箱の下も）と畦は bgTiles の泥 `w`＝見た目だけ）
//   ・**主題＝鈍い毒沼ヒルは水を渡れない、勇者ははしごで渡れる＝水を1枚跨げばヒルを撒ける。**
//     島（3×5）と本土の間の堀（列4）は幅1＝本土の列5 から島の列3 へ、行2〜6 のどこでも渡れる。
//     敵の足では島の出入りは南の畦 (7,2) だけ＝追ってくるヒルは堀の縁で止まる（追い方は「長い軸を先に」の
//     一歩ずつ＝回り込まない）。
//   ・答えは3つ＝①本土の岸に立って島のヒルを堀の縁へ引き付け、離れた行から渡って宝箱へ（撒く）
//     ②堀を挟んで岸から射る・投げる（ヒルは水を越えて来ない）③南の小道から畦を通って島で斬り合う
//     （毒は無敵を貫く＝狭い島で正面から当たると重い）。倒すことは必須でない（全滅条件なし）。
//   ・本土のヒルは入ってすぐ寄ってくる＝島へ渡ると、こんどは本土のヒルが堀の縁で止まる。
//     「はしごで撒く」が両側で効く。
//   ・D8 の看板部屋 `2,1`（爆弾鬼と毒の廊下）が毒沼ヒルの本番＝ここはその手前の顔見せ（脅威度 9.0＝85.5 より軽い）。
//   ・型を重ねない相手＝D2 `2,3` 流砂の大穴と追い手（追い手は穴を回り込まない＝勇者が向こう岸を選んで歩く。
//     はしごは使わない）／D5 の水路の部屋（水の敵が岸を撃つ・こちらは陸の敵を水が止める）。
//
// ■ 撤去したもの
//   宝箱（旧 (4,5)）。中身の回復薬（小）は島の宝箱 (2,1) へ移した。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／bgTiles（水と泥）／宝箱は島の1つだけ（中身は回復薬）／外周の口の形が不変
//   ・取り残しなし（歩いて全部の床に届く）／歩いて島へ入るには畦 (7,2) を通るしかない
//   ・堀は幅1＝はしごなら本土から島へ1枚で渡れる・敵の足（水を渡れない）では畦だけ
//   ・対照＝畦を水にすると、歩いては島に届かない（はしごでは届く）
//   ・敵は Γ×2（島と本土に1体ずつ）・脅威度が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d8-0-2-leech-paddy.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d8-0-2-leech-paddy.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED, LADDER_OVER } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_8';
export const ROOM  = '0,2';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（'~' は bgTiles の水として敷き、tiles 側は '.'） ─────────────
export const TARGET = [
	'#####..#####',
	'#~~~~......#',
	'#B..~......#',
	'#...~......#',
	'#.Γ.~.......',
	'#...~.......',
	'#...~...Γ..#',
	'#~.~~......#',
	'#..........#',
	'############',
];
export const CHEST = '2,1';
export const CHEST_CONTENT = { type: 'item', item: 'healPotion', name: '回復薬（小）' };
export const DIKE = '7,2';                    // 歩いて島へ入れる唯一のセル
export const ISLAND_LEECH = '4,2';
export const MAIN_LEECH = '6,8';
export const OPENING = ['0,5', '0,6', '4,11', '5,11'];
// 島＝行2〜6 × 列1〜3（宝箱のセルを含む）
export const ISLAND = [];
for (let r = 2; r <= 6; r++) for (let c = 1; c <= 3; c++) ISLAND.push(`${r},${c}`);
// 見た目だけの泥（bgTiles 'w'）＝島の全セル（宝箱の下も＝敷かないとそこだけ床が抜けて見える）と畦。
export const MUD = [...ISLAND, DIKE];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

// TARGET（水を '~' で描いた図）→ tiles（'~' を '.' に）と bgTiles（水と泥）
export function tilesOf(target = TARGET) { return target.map((row) => [...row].map((ch) => (ch === TILE.WATER ? TILE.FLOOR : ch))); }
export function bgOf(target = TARGET, mud = MUD) {
	const bg = {};
	target.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === TILE.WATER) bg[key(r, c)] = TILE.WATER; }));
	for (const k of mud) bg[k] = TILE.MUD;
	return bg;
}

// 部屋の中だけの歩行（4近傍）。grid は水を '~' で描いた図。敵のセルは床とみなす。
// withLadder なら幅1の水を、進む向きの先が陸のときだけ1枚渡る（game/passable.js isLadderCrossable と同じ）。
// 戻り値＝Map（セル → 渡った水の枚数の最小）。
export function reach(grid, starts, { withLadder = false } = {}) {
	const inside = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS;
	const land = (r, c) => {
		if (!inside(r, c)) return false;
		const ch = grid[r][c];
		if (ENEMY_META[ch]) return true;
		return !HARD_BLOCKED.has(ch);
	};
	const dist = new Map();
	const dq = [];
	for (const k of starts) { const [r, c] = parse(k); if (land(r, c) && !dist.has(k)) { dist.set(k, 0); dq.push([r, c]); } }
	while (dq.length) {
		const [r, c] = dq.shift();
		const d = dist.get(key(r, c));
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc;
			if (land(nr, nc)) {
				const k = key(nr, nc);
				if (!dist.has(k) || dist.get(k) > d) { dist.set(k, d); dq.unshift([nr, nc]); }
				continue;
			}
			if (!withLadder || !inside(nr, nc) || !LADDER_OVER.has(grid[nr][nc])) continue;
			const fr = nr + dr, fc = nc + dc, k = key(fr, fc);
			if (!land(fr, fc)) continue;
			if (!dist.has(k) || dist.get(k) > d + 1) { dist.set(k, d + 1); dq.push([fr, fc]); }
		}
	}
	return dist;
}

// 本土（口から、島と畦を通らずに歩ける床）
export function mainland(grid) {
	const cut = grid.map((row, r) => [...row].map((ch, c) => (key(r, c) === DIKE ? TILE.WALL : ch)));
	const m = reach(cut, OPENING);
	return new Set([...m.keys()].filter((k) => !ISLAND.includes(k)));
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
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const grid = TARGET.map((row) => [...row]);   // 水を '~' で描いた図＝歩行の判定に使う
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === tilesOf().map(rowStr).join('\n'));
	{
		const bg = room.bgTiles;
		const water = Object.keys(bg).filter((k) => bg[k] === TILE.WATER);
		const mud = Object.keys(bg).filter((k) => bg[k] === TILE.MUD);
		check(`bgTiles＝水 ${water.length} 枚・泥 ${mud.length} 枚（ほかの値なし）`,
			water.length + mud.length === Object.keys(bg).length && water.length === 12 && mud.length === MUD.length);
		check(`tiles 層に水を置いていない（水は bgTiles だけ）`, !flat.includes(TILE.WATER));
		check(`泥は島と畦だけ（水の上には無い）`, mud.every((k) => (ISLAND.includes(k) || k === DIKE) && grid[parse(k)[0]][parse(k)[1]] !== TILE.WATER));
	}
	check(`宝箱は島の ${CHEST} の1つだけ・中身は回復薬（小）`,
		flat.filter((ch) => ch === TILE.CHEST).length === 1 && t[2][1] === TILE.CHEST
		&& Object.keys(room.chestContents).join() === CHEST && room.chestContents[CHEST].item === 'healPotion');
	check(`床の拾い物・出現条件・石碑が空`,
		!Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length && !Object.keys(room.signData ?? {}).length);

	// ── ② 歩行：取り残しなし・島へは畦だけ ───────────────────────────────
	const foot = reach(grid, OPENING);
	{
		const floors = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!HARD_BLOCKED.has(grid[r][c])) floors.push(key(r, c));
		const stranded = floors.filter((k) => !foot.has(k));
		check(`床は全部歩いて届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		const main = mainland(grid);
		const island = ISLAND.filter((k) => k !== CHEST);
		check(`畦 ${DIKE} を塞ぐと、島の床へは歩いて届かない（本土 ${main.size} マス・島に入り込んだセル 0）`,
			island.every((k) => !main.has(k)));
		const [dr, dc] = parse(DIKE);
		const sides = [[dr, dc - 1], [dr, dc + 1]].map(([a, b]) => grid[a][b]);
		check(`畦の左右は水（実測 ${sides.join('')}）＝幅1の畦`, sides.every((ch) => ch === TILE.WATER));
	}

	// ── ③ はしご：堀は幅1＝本土から1枚で島へ ─────────────────────────────
	{
		const cut = grid.map((row, r) => row.map((ch, c) => (key(r, c) === DIKE ? TILE.WATER : ch)));
		check(`対照：畦を水にすると、歩いては島に届かない`, !reach(cut, OPENING).has(ISLAND_LEECH));
		const lad = reach(cut, OPENING, { withLadder: true });
		const isl = ISLAND.filter((k) => k !== CHEST);
		check(`畦を水にしても、はしごなら島の床すべてに水1枚で届く`, isl.every((k) => lad.get(k) === 1));
		// 本土の列5（行2〜6）から西へ1枚＝島の列3 に着く（どの行からでも渡れる）
		const banks = [];
		for (let r = 2; r <= 6; r++) {
			if (grid[r][5] === TILE.FLOOR && grid[r][4] === TILE.WATER && grid[r][3] !== TILE.WATER && !HARD_BLOCKED.has(grid[r][3])) banks.push(r);
		}
		check(`堀（列4）は行2〜6 の5か所すべてで幅1＝本土の岸から島へ渡れる（実測 行${banks.join(',')}）`, banks.length === 5);
		const wall = grid[1].slice(1, 5).join('');
		check(`島の北の堀（行1）は壁に接する＝縦には渡れない（${wall}）`, wall === '~~~~' && grid[0].slice(1, 5).join('') === '####');
	}

	// ── ④ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		const want = [ISLAND_LEECH, MAIN_LEECH].map((k) => `${TILE.POISON_LEECH}@${k}`);
		check(`敵は毒沼ヒル Γ×2（島 ${ISLAND_LEECH}・本土 ${MAIN_LEECH}）（実測 ${mobs.join(' ')}）`, mobs.join() === want.join());
		check(`島のヒルは島の上・本土のヒルは本土の上`, ISLAND.includes(ISLAND_LEECH) && mainland(grid).has(MAIN_LEECH));
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,1'], ENEMY_META);
		check(`脅威度 ${threat}（Γ 4.5×2）が D8 の看板部屋 2,1（${sig}）より軽い`, threat === 9 && threat < sig);
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
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「毒ヒルの泥田」に作り替える（キュー93 の1室目）`);
	console.log(`\n## 盤面の差分（${ROOM}・水は ~ で表示）`);
	TARGET.forEach((row, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === row ? '=' : '→'}   ${row}`);
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
