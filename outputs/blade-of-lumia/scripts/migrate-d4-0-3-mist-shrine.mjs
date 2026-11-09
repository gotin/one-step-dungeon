// dungeon_4 `0,3`（入口の西の行き止まり）：素の部屋を「怨念の封じ祠」に作り替える
// （2026-10-24 / PLAN 実行キュー 92 の1室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー92 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      4 #....r......     ← 東の口（入口 `1,3`）。北・西・南は閉じている＝行き止まり
//      9 ############
//   四角い広間の真ん中に床のルピー（3）が1つだけ・敵なし。
//
// ■ 新しい `0,3`＝怨念の封じ祠（溶岩の環の中の祠を、怨念のもやが塞いでいる）
//      0 ############
//      1 #..........#
//      2 #.lllll....#     ← 溶岩の環（tiles 層の 'l'）
//      3 #.l...l....#
//      4 #.l.B.Ψ.....     ← 祠の宝箱 B(4,4)／怨念のもや Ψ(4,6)／東の口
//      5 #.l...l.....
//      6 #.lllll....#
//      7 #......φ...#     ← 火吐き亀 φ(7,7)
//      8 #..........#
//      9 ############
//   ・溶岩の環の中の小島（3×3）が祠。環の切れ目は東の (4,6) だけで、そこに怨念のもやが1枚立つ。
//     もやは**ロウソクの聖なる火でしか祓えない**（剣は「すり抜けた… 実体が ない」・投擲物も素通り）。
//   ・D4 で最初に入れる部屋の1つ（入口 `1,3` の西隣）＝**ロウソクを手に入れる前に来る**。
//     東の口から行4 を西へ歩くと真正面にもやが見え、その向こうに宝箱が見える＝「ここで手に入る
//     火で祓う」の予告（D5 `1,3`「西の口が湖の向こうに見える」＝はしごの予告と同じ役）。
//     ロウソクは2部屋先の `1,2` の宝箱。取って戻ると、(4,7) から西を向いて火を出せば祓える。
//   ・もやを祓える足場は (4,7) だけ（もやの東）。溶岩の上には立てない・炎も置けない。
//   ・火吐き亀 φ＝炎の神殿の番人。D4 は本編の進行で φ に初めて会うダンジョン（D5 `2,3` の
//     「双つ甲羅」が再演）。甲羅を閉じている間は無敵・開いた瞬間に正面2マスへ炎を吐く∴
//     もやの前で足を止めて火を出す間に寄られると焼かれる＝先に側背から片付けるか、間合いを見る。
//     ロウソクの前に来ても後に来ても同じ亀（ダンジョンの敵は復活しない）。
//   ・報酬＝宝箱のルピー×20（旧 床のルピー×3）。
//   ・D4 の他の部屋と型を分けた＝`1,0` 倉庫番／`1,1` かがり火3本／`1,2` ロウソク入手／
//     `2,3` 剣封じの戦闘（看板）／`3,3` 溶岩越しの灯火（ブーメランで炎を運ぶ）。怨念のもやは
//     本編ダンジョンで初めて（field 5 か所・塔 1 か所＝キュー88/89）。
//   ・field `11,0`「外輪の隘路」（溶岩の谷を橋で渡った先に φ が宝箱の前に居座る）と型を
//     重ねないため、亀は祠の**外**を巡回させた（祠の中に置かない＝居座りではない）。
//
// ■ 例外（後から手に入る道具で楽になる手）
//   ・翼の羽衣（最終盤に祭壇で授かる）は溶岩ともやの上を飛べる（`game/passable.js` FLYABLE_OVER）。
//     羽衣は全ダンジョン後の道具∴一周目の約束（ロウソクで祓う）は崩れない（D4 `3,3` と同じ扱い）。
//   ・はしごは溶岩を渡れない（`LADDER_OVER` に溶岩が無い）＝抜け道にならない。
//
// ■ 撤去したもの
//   床のルピー r(4,5)（floorItems も）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／宝の中身／floorItems・showConditions・links・signData が空／外周の口の形が不変
//   ・もや無し（祓う前）で東の口から：宝箱に届かない・小島の外の床は全部届く（取り残しなし）
//   ・もやを祓うと宝箱に届く／もやの隣の立てる床は (4,7)（外）と (4,5)（祠の中）だけ
//   ・対照＝もやを床にすると祓わずに届く・もやを壁にすると祓っても届かない（測定が空虚でない）
//   ・はしごで溶岩を渡れない／亀は素の床の上・口の着地セルを塞がない
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d4-0-3-mist-shrine.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d4-0-3-mist-shrine.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED, LADDER_OVER, isLadderBridgeCell } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_4';
export const ROOM  = '0,3';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#..........#',
	'#.lllll....#',
	'#.l...l....#',
	'#.l.B.Ψ.....',
	'#.l...l.....',
	'#.lllll....#',
	'#......φ...#',
	'#..........#',
	'############',
];
export const CHEST  = '4,4';
export const MIST   = '4,6';
export const SEAT   = '4,7';   // もやを祓う足場（西を向いてロウソク）
export const TURTLE = '7,7';
export const OPENINGS = ['4,11', '5,11'];
export const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 50, name: 'ルピー×50' } };   // キュー100（2026-11-09）で差し替え＝scripts/migrate-q100-dungeon-rewards.mjs

// 部屋の中だけの歩行（4近傍）。`clearMist` で祓った後を測る。敵のセルは床とみなす。
export function reach(grid, starts, { clearMist = false } = {}) {
	const seen = new Set();
	const q = [];
	const ok = (r, c) => {
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
		const ch = grid[r][c];
		if (ch === TILE.CURSE_MIST) return clearMist;
		if (ENEMY_META[ch]) return true;
		if (ch === TILE.CHEST) return true;   // 宝箱は踏んで開けるタイル
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
	room.chestContents = { ...CHEST_CONTENTS };
	room.floorItems = {};
	room.showConditions = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`宝箱 ${CHEST} の中身＝ルピー×20`, JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
	check(`宝箱は1つだけ`, t.flat().filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST) === TILE.CHEST);
	check(`もやは ${MIST} の1枚だけ`, t.flat().filter((ch) => ch === TILE.CURSE_MIST).length === 1 && at(MIST) === TILE.CURSE_MIST);
	check(`floorItems・showConditions・signData が空`,
		!Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length && !Object.keys(room.signData ?? {}).length);
	check(`床のルピー（旧 r）が残っていない`, !t.flat().includes(TILE.ITEM_RUPEE));

	// ── ② 歩行：祓う前は宝箱に届かず、祓うと届く ─────────────────────────
	const pre = reach(t, OPENINGS);
	const post = reach(t, OPENINGS, { clearMist: true });
	check(`祓う前：東の口から宝箱 ${CHEST} に届かない`, !pre.has(CHEST));
	check(`祓う前：もやの足場 ${SEAT} には届く`, pre.has(SEAT));
	check(`祓った後：宝箱に届く`, post.has(CHEST));
	const island = ['3,3', '3,4', '3,5', '4,3', '4,4', '4,5', '5,3', '5,4', '5,5'];
	const floors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = t[r][c];
		if (ch === TILE.FLOOR || ENEMY_META[ch]) floors.push(`${r},${c}`);
	}
	const stranded = floors.filter((k) => !island.includes(k) && !pre.has(k));
	check(`祓う前：小島の外の床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	check(`祓った後：床は全部届く`, floors.every((k) => post.has(k)));
	const nbrs = (k) => { const [r, c] = k.split(',').map(Number); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };
	const standable = nbrs(MIST).filter((k) => post.has(k) && at(k) !== TILE.CURSE_MIST);
	check(`もやの隣の立てる床は ${SEAT}（外）と 4,5（祠の中）だけ（実測 ${standable.join(' ')}）`,
		JSON.stringify(standable.sort()) === JSON.stringify(['4,5', SEAT].sort()));
	check(`祠の外から祓える足場は ${SEAT} だけ（＝西を向いて火を出す）`, standable.filter((k) => pre.has(k)).join() === SEAT);
	{
		// 対照①＝もやを床にすると祓わずに届く／対照②＝もやを壁にすると祓っても届かない
		//         （潰すのは必ず '#'＝[[blade-control-experiment-needs-tile-wall]]）
		const g = (ch) => t.map((row, r) => row.map((x, c) => (`${r},${c}` === MIST ? ch : x)));
		check(`対照：もやを床にすると祓わずに宝箱へ届く`, reach(g(TILE.FLOOR), OPENINGS).has(CHEST));
		check(`対照：もやを壁にすると祓っても宝箱へ届かない`, !reach(g(TILE.WALL), OPENINGS, { clearMist: true }).has(CHEST));
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
		check(`亀は祠の外（祓う前に歩いて届く床）`, pre.has(TURTLE) && !island.includes(TURTLE));
		check(`亀は口の着地セルの隣に居ない`, !OPENINGS.some((k) => nbrs(k).includes(TURTLE)) && !OPENINGS.includes(TURTLE));
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
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「怨念の封じ祠」に作り替える（キュー92 の1室目）`);
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
