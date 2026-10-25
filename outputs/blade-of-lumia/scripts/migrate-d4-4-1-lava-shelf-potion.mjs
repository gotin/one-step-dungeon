// dungeon_4 `4,1`（`3,1` 呪い火の炉の東の行き止まり）：素の部屋を「溶岩の川向こうの薬棚」に作り替える
// （2026-10-25 / PLAN 実行キュー 92 の6室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー92 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      4 ......7....#     ← 西の口だけが開いた行き止まり
//      9 ############
//   真ん中に回復薬（小）が1つ落ちているだけ・敵なし。floorItems に使われていない「小さな妖精」の記述が残っていた
//   （'7' は回復薬のタイル＝床の薬は floorItems を読まない）。
//
// ■ 新しい `4,1`＝溶岩の川向こうの薬棚
//      0 ############
//      1 #....llllll#
//      2 #.....llll7#     ← 東の壁際の棚 (2,10) に回復薬。岸の出っ張り (2,5) から縦横ちょうど 5 マス
//      3 #.θ..llllll#     ← 骸骨剣士 θ×2（(3,2)・(7,3)）が岸をさまよう
//      4 ......lllll#     ← 西の口（行4-5）。この2行と行7 の岸も列5 まで出ているが、棚とは行が違う
//      5 ......lllll#
//      6 #....llllll#
//      7 #..θ..lllll#
//      8 #....llllll#
//      9 ############
//   ・**主題＝ブーメランは床の物を持ち帰る（鍵・ルピーだけでなく回復薬も）。** 東の壁際の棚は溶岩の川の向こう＝
//     歩いては行けない。岸の出っ張り（列5）のうち、棚と同じ行にあるのは (2,5) だけ＝そこから東へ投げると
//     ちょうど 5 マス先の棚を通って持ち帰る。岸の奥（列4）からは 6 マス＝木のブーメランは手前で折り返す。
//   ・`4,3` 火口湖の甲羅島（同じ東の列の南端）と対（つい）＝あちらは「6 マス＝ブーメランは届かない∴弓」、
//     こちらは「5 マス＝届く。ただし並ぶ行と近い岸を選ぶ」。ブーメランの届く距離を2部屋で覚える。
//   ・骸骨剣士 θ×2 が岸をさまよう＝Fable レビュー #2（D4 はほぼ無戦闘）を薄める戦い。ブーメランを投げている間は
//     手元に無い（止める道具が飛んでいる）＝先に骸骨を片付けてから落ち着いて投げるのが楽。
//   ・D4 の他の部屋と型を分けた＝`0,3` 怨念の封じ祠（もや）／`3,2` 溶岩の十字路と地図の袋小路（追ってくる亀）／
//     `3,1` 呪い火の炉（置き炎）／`4,3` 火口湖の甲羅島（開いた甲羅を弓で射る）／`4,2` 爆弾鬼の封じ窯（敵の爆弾で
//     ひびを壊させる）／`3,3` 溶岩越しの灯火（ブーメランで火を持ち帰る）。
//   ・ロウソク無しで解ける（`3,1` から来られる）。
//
// ■ エンジンの変更（同じコミット）
//   `game/player.js collectFieldItem` がブーメランで運べる床の物に回復薬（小・大）を足した。満杯なら拾わない
//   （床の薬を踏んだときと同じ）。地図・コンパスは運ばない（D2 `3,2` がそれを前提にしている）。
//
// ■ 撤去したもの
//   床の回復薬（旧 (4,6)）と、使われていなかった floorItems の「小さな妖精」の記述。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／回復薬は棚の1つだけ／宝箱・床の拾い物・出現条件なし／外周の口の形が不変
//   ・棚へは歩いて届かず、隣は溶岩と壁だけ／棚の外の床は全部届く
//   ・棚へ縦横に壁の無い線が引ける歩けるマスは、5 マス以内では (2,5) だけ・6 マスの (2,4) は木のブーメランの外
//   ・対照＝出っ張り (2,5) を溶岩にすると、5 マス以内の投げ場が無くなる
//   ・敵は θ×2 だけ・脅威度が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d4-4-1-lava-shelf-potion.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d4-4-1-lava-shelf-potion.mjs         # 書き込み

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

export const LAYER = 'dungeon_4';
export const ROOM  = '4,1';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#....llllll#',
	'#.....llll7#',
	'#.θ..llllll#',
	'......lllll#',
	'......lllll#',
	'#....llllll#',
	'#..θ..lllll#',
	'#....llllll#',
	'############',
];
export const SHELF = '2,10';         // 回復薬（小）の棚
export const THROW = '2,5';          // 棚へ投げられる唯一の岸
export const TOO_FAR = '2,4';        // 同じ行の 6 マス＝木のブーメランは手前で折り返す
export const SKELETONS = ['3,2', '7,3'];
export const OPENING = ['4,0', '5,0'];
export const JUT_COL = 5;            // 岸が出っ張る列（棚の行のほかにも出っ張りがある＝位置だけでは答えが見えない）
// 木のブーメランが床の物を持ち帰れる距離（投げた岸のマスから数えて何マス先のマスまで）。
// maxRange 3 で折り返す（投げた位置から 4.5 マス先＝x+4.5）が、拾う判定のマスは `toTileCol = floor(x+0.5)`
// ∴折り返し点 x+4.5 は 5 マス先のマスに数えられる＝実効は 5 マス先まで届く・6 マス先は届かない
// （`4,3` 火口湖の甲羅島の「6 マス＝届かない」と同じ数え方。`tests/d4-lava-shelf-potion.spec.js` が実機で測る）。
export const WOOD_FETCH = 5;

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

// 部屋の中だけの歩行（4近傍）。敵のセルは床とみなす・床のアイテムも踏める。
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
		const [r, c] = parse(k);
		if (ok(r, c) && !seen.has(k)) { seen.add(k); q.push([r, c]); }
	}
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

// 歩けるマス（walk）から棚へ、縦横に並んで間に壁の無い線（ブーメランの線）。溶岩の上は飛ぶ。
export function linesToShelf(grid, walk) {
	const out = [];
	const [r0, c0] = parse(SHELF);
	for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
		for (let r = r0 + dr, c = c0 + dc, d = 1; r >= 0 && c >= 0 && r < ROWS && c < COLS; r += dr, c += dc, d++) {
			const ch = grid[r][c];
			if (ch === TILE.WALL || ch === TILE.BREAKABLE_WALL) break;
			if (walk.has(key(r, c))) out.push({ from: key(r, c), dist: d });
		}
	}
	return out;
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
	// 外周の口の形＝西の口（行4-5）だけが開いていること。東の壁際の棚 (2,10) は外周の内側。
	check(`外周の口の形が書き換え前と同じ`, ringOf(before).replace(/[^#.]/g, '.') === ringOf(TARGET).replace(/[^#.]/g, '.'));
	room.tiles = TARGET.map((row) => [...row]);
	room.chestContents = {};
	room.floorItems = {};
	room.showConditions = {};
	room.breakableWalls = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = parse(k); return t[r]?.[c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`回復薬（小）は棚 ${SHELF} の1つだけ`,
		flat.filter((ch) => ch === TILE.ITEM_HEAL_POTION).length === 1 && at(SHELF) === TILE.ITEM_HEAL_POTION);
	check(`宝箱・床の拾い物・出現条件・signData が空`,
		!flat.includes(TILE.CHEST) && !Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length
		&& !Object.keys(room.chestContents).length && !Object.keys(room.signData ?? {}).length);

	// ── ② 歩行：棚は届かない・取り残しなし ─────────────────────────────
	const walk = reach(t, OPENING);
	check(`棚 ${SHELF} へは歩いて届かない`, !walk.has(SHELF));
	{
		const [r, c] = parse(SHELF);
		const sides = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => t[a]?.[b]);
		check(`棚の隣は溶岩と壁だけ（実測 ${sides.join('')}）`, sides.every((ch) => ch === TILE.WALL || ch === TILE.LAVA));
	}
	const floors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const k = key(r, c);
		if (!HARD_BLOCKED.has(t[r][c]) && k !== SHELF) floors.push(k);
	}
	const stranded = floors.filter((k) => !walk.has(k));
	check(`棚の外の床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);

	// ── ③ 投げ場：4 マス以内は (2,6) だけ ──────────────────────────────
	{
		const lines = linesToShelf(t, walk);
		const near = lines.filter((l) => l.dist <= WOOD_FETCH).map((l) => l.from);
		check(`棚へ ${WOOD_FETCH} マス以内で投げられる岸は ${THROW} だけ（実測 ${near.join(' ') || 'なし'}）`, near.join() === THROW);
		const far = lines.find((l) => l.from === TOO_FAR);
		check(`同じ行の ${TOO_FAR} は ${far?.dist} マス＝木のブーメランの外（出っ張りまで出る意味がある）`, far?.dist === WOOD_FETCH + 1);
		const opened = t.map((row, r) => row.map((x, c) => (key(r, c) === THROW ? TILE.LAVA : x)));
		const nearOpened = linesToShelf(opened, reach(opened, OPENING)).filter((l) => l.dist <= WOOD_FETCH);
		check(`対照：出っ張り ${THROW} を溶岩にすると ${WOOD_FETCH} マス以内の投げ場が無くなる`, nearOpened.length === 0);
		const other = [];
		for (let r = 1; r < ROWS - 1; r++) if (r !== parse(SHELF)[0] && t[r][JUT_COL] === TILE.FLOOR) other.push(key(r, JUT_COL));
		check(`列${JUT_COL} まで出ている岸は他の行にもある（${other.join(' ')}）＝出っ張りの位置だけでは答えが見えない`, other.length >= 2);
	}

	// ── ④ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は岸の θ×2 だけ（実測 ${mobs.join(' ')}）`, mobs.join() === SKELETONS.map((k) => `${TILE.SKELETON}@${k}`).join() && SKELETONS.every((k) => walk.has(k)));
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（θ 18.0×2）が D4 の看板部屋 2,3（${sig}）より軽い`, threat === 36 && threat < sig);
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
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「溶岩の川向こうの薬棚」に作り替える（キュー92 の6室目）`);
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
