// dungeon_7 `3,2`（地図の部屋）：D6 の写しの部屋を「空越しの発破（崩れかけの柱）」に作り替える
// （2026-10-01 / PLAN 実行キュー 31 の第1陣 5室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー31 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #....m.....#     ← 地図 m
//      3 #......u...#     ← 茂み u
//      4 ............
//      5 ............
//      6 #..t.......#     ← 木 t
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   `dungeon_6 3,2` とバイト一致＝4方向の口がある四角い広間に、地図と森の木・茂みが置いてあるだけ。
//
// ■ 新しい `3,2`＝空越しの発破（D8 `3,3`「崩れ壁の橋脚」で覚えた「爆風は1枚挟んだ向こうまで
//   届く」の卒業版＝水の代わりに空を挟む）
//      0 #####..#####     ← 4つの口（北・南 列5-6／西・東 行4-5）は変えない
//      1 #.m........#     ← 地図 m(1,2)
//      2 #..........#
//      3 #..#....%.B#     ← 柱 #(3,3)・宝箱 B(3,10)＝ルピー×30（wallBroken で出る）
//      4 .......%%...
//      5 ......%%%@..     ← 東の張り出しの先 (5,9)＝爆風が柱に届く唯一の立ち位置
//      6 #..#...%%%%#     ← 柱 #(6,3)
//      7 #.....@%%!%#     ← 崩れかけの柱 !(7,9)・西の土手道の端 (7,6)＝3マス＝届かない
//      8 #......@%%%#     ← (8,7)＝√5＝届かない
//      9 #####..#####
//   （@ は説明用の印。実際の盤面は床 '.'）
//   ・南東の一角が空 '%' へ崩れ落ちた。裂け目は北東の (3,8) から南東の隅へ向かって広がる
//     （行ごとの空の数 1/2/3/4/3/3）＝西の段丘と東の張り出しを裂く。
//   ・崩れかけの柱 '!'（7,9）が裂け目の中に1本だけ浮く＝四方が空＝隣に立てない。
//     壊せるのは爆弾だけ（矢・ブーメランは '!' で止まる・剣は届かない）。
//   ・爆風は半径 2 の円（`game/projectile.js` blastCells＝上下左右は2セル先・斜めは (±1,±1)）。
//     柱に届く立ち位置は東の張り出しの先 (5,9) だけ（空 (6,9) を1枚挟んで真上）。
//     西の土手道から見ると柱は同じ行にあって近そうに見えるが、(7,6) は3マス・(8,7) は √5＝外れ。
//     置いた瞬間に届く範囲の外形が床に出る（キュー35）∴外れの場所に置けば「1マス足りない」が読める。
//   ・崩れたら（`wallBroken`）北東の隅に宝箱 B(3,10)（ルピー×30＝爆弾1個と立ち位置探しの対価）。
//   ・地図は北西 (1,2) の床に置く＝謎を解かなくても拾える
//     （地図・コンパスの拾得は showConditions で封じられない＝`game/player.js` pickDungeonItem
//     には封印判定が無い∴隠すと「見えないのに拾える」になる。だから報酬は宝箱にした＝3,1 と同じ）。
//   ・段丘に柱 '#' を2本（(3,3)／(6,3)）残した＝崩れずに立っている列柱。浮いた '!' はその列の
//     崩れかけの1本、という見え方にする。
//   ・4つの口は道具なしで行き来できる（裂け目は北の縁 行1〜2 を割っていない）。
//   ・敵は置かない（謎解きの部屋）。茂み・木は撤去。看板も置かない。
//
// ■ 例外（後から手に入る道具で楽になる手）
//   ・翼の羽衣は D7 では使えない（`shared/progression.js` toolsUsableIn）＝空を飛んで柱の隣に
//     立つ手は一周目には無い。羽衣で飛んでも爆弾は要る（柱を壊せるのは爆風だけ）。
//   ・はしごは空を渡れない（`LADDER_OVER` に空が無い）＝抜け道にならない。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／4つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵・植生・石・看板・門・座が無い／宝箱の中身と showConditions／breakableWalls／links が空／地図が1枚
//   ・柱の四方が空／爆風が柱に届く歩ける床は (5,9) の1マスだけ・外れの (7,6)／(8,7) は届かない
//   ・対照＝空 (6,9) を床にすると柱の真上に立てて届く床が増える／東の張り出しの先を壁にすると
//     届く床が0（潰すのは必ず '#'＝[[blade-control-experiment-needs-tile-wall]]）
//   ・ソルバー（爆弾）で柱を崩せる・柱を崩す手は (5,9) からだけ・道具封じでは崩せない・詰み 0
//   ・どの口からでもほかの3つの口へ道具なしで歩ける／地図と宝箱に歩いて届く／
//     はしごがあっても歩ける範囲が増えない／取り残された床が無い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-3-2-sky-blast.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-3-2-sky-blast.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ITEM_META } from '../shared/items.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED, LADDER_OVER } from './lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '3,2';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
const TARGET = [
	'#####..#####',
	'#.m........#',
	'#..........#',
	'#..#....%.B#',
	'.......%%...',
	'......%%%...',
	'#..#...%%%%#',
	'#......%%!%#',
	'#.......%%%#',
	'#####..#####',
];
// 口のセル（隣室との開き）＝書き換え前と同じ。
const EXITS = { 北: ['0,5', '0,6'], 南: ['9,5', '9,6'], 西: ['4,0', '5,0'], 東: ['4,11', '5,11'] };
const PILLAR = '7,9';
const SPOT   = '5,9';                 // 爆風が柱に届く唯一の立ち位置
const DECOYS = ['7,6', '8,7'];        // 近そうに見えて届かない立ち位置
const MAP_CELL   = '1,2';
const CHEST_CELL = '3,10';
const CHEST_CONTENTS  = { [CHEST_CELL]: { type: 'rupee', value: 30, name: 'ルピー×30' } };
const SHOW_CONDITIONS = { [CHEST_CELL]: { trigger: 'wallBroken', wallId: PILLAR } };
const BREAKABLE_WALLS = { [PILLAR]: { breakDef: 1 } };
const RADIUS = ITEM_META.bomb.aoeRadius;

// ── 読み込み ─────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`${LAYER} が無い`);
const room = stages[ROOM];
if (!room) die(`${LAYER} ${ROOM} が無い`);

const START = { stage: '1,3', row: 7, col: 2 };   // 入口の着地セル
const layerRun = () => bfsLayer(stages, START, { withLadder: true, openTiles: null });
const layerRunOpen = () => bfsLayer(stages, START, { withLadder: true, openTiles: new Set(['T', '!', 'D', '=']) });
const baseClosed = layerRun();
const baseOpen = layerRunOpen();

const before = room.tiles.map(rowStr);
const log = [];
const verify = [];
const check = (msg, cond) => verify.push([!!cond, msg]);

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ── 書き換え ─────────────────────────────────────────────────────────
// tiles は「文字の配列の配列」で持つ（行文字列にするとゲームが落ちる
// ＝[[field-tiles-are-char-arrays]]）。
if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
	room.tiles = TARGET.map((row) => row.split(''));
	log.push(`  ${ROOM}: 盤面を差し替えた`);
}
if ((room.links ?? []).length) {
	log.push(`  ${ROOM}: links を外した`);
	room.links = [];
}
if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
	log.push(`  ${ROOM}: 宝箱 ${CHEST_CELL}＝ルピー×30`);
}
if (JSON.stringify(room.showConditions ?? {}) !== JSON.stringify(SHOW_CONDITIONS)) {
	room.showConditions = JSON.parse(JSON.stringify(SHOW_CONDITIONS));
	log.push(`  ${ROOM}: showConditions を ${CHEST_CELL}=wallBroken(${PILLAR}) にした`);
}
if (JSON.stringify(room.breakableWalls ?? {}) !== JSON.stringify(BREAKABLE_WALLS)) {
	room.breakableWalls = JSON.parse(JSON.stringify(BREAKABLE_WALLS));
	log.push(`  ${ROOM}: breakableWalls を ${PILLAR}=breakDef 1 にした`);
}
room.links ??= [];
room.bgTiles ??= {};
room.signData ??= {};
room.npcData ??= {};
room.floorItems ??= {};
room.enemyDirs ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
const at = (t, k) => { const [r, c] = P(k); return t[r]?.[c]; };
const nbrs = (k) => {
	const [r, c] = P(k);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
		.filter(([rr, cc]) => inside(rr, cc)).map(([rr, cc]) => `${rr},${cc}`);
};
const cellsOf = (t, pred) => {
	const out = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
	return out;
};
const allExits = Object.values(EXITS).flat();
// 口から歩けるセル。宝箱 B・地図 m は踏めるタイル（封印中の宝箱にも乗れる）。
// withLadder なら幅 1 の穴/水を 1 マスだけ渡れる＝エンジンの進入軸の橋（`game/passable.js`）。
function walkable(t, from, { withLadder = false } = {}) {
	const blocked = (r, c) => BLOCKED.has(t[r][c]);
	const seen = new Set(), q = [];
	for (const k of from) { const [r, c] = P(k); if (!blocked(r, c)) { seen.add(k); q.push([r, c]); } }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(k)) continue;
			const ladderOk = withLadder && LADDER_OVER.has(t[nr][nc])
				&& inside(nr + dr, nc + dc) && !blocked(nr + dr, nc + dc);
			if (blocked(nr, nc) && !ladderOk) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
// 爆風が柱に届く、歩いて立てる床（`blastCells` と同じ＝中心からの距離 ≤ 半径）。
const dist = (a, b) => { const [ar, ac] = P(a), [br, bc] = P(b); return Math.sqrt((ar - br) ** 2 + (ac - bc) ** 2); };
const blastSpots = (t) => [...walkable(t, allExits)].filter((k) => dist(k, PILLAR) <= RADIUS).sort();

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
	room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
for (const [name, cells] of Object.entries(EXITS)) {
	check(`${name}の口（${cells.join(' ')}）が開いている`, cells.every((k) => at(t, k) === TILE.FLOOR));
}
{
	// 口の両脇は塞がっている＝口の幅（2）が隣室と同じまま。
	const edge = [];
	for (let c = 0; c < COLS; c++) { edge.push(`0,${c}`, `9,${c}`); }
	for (let r = 1; r < ROWS - 1; r++) { edge.push(`${r},0`, `${r},11`); }
	const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
	check(`画面の縁で開いているのは4つの口だけ（実測 ${open.join(' ')}）`, JSON.stringify(open) === JSON.stringify([...allExits].sort()));
}
check(`敵が居ない（謎解きの部屋）`, cellsOf(t, (ch) => !!ENEMY_META[ch]).length === 0);
check(`石・植生・看板・門・座・かがり火が残っていない`,
	cellsOf(t, (ch) => [TILE.STONE, TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.TORCH].includes(ch)).length === 0
	&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
check(`壊せる壁は柱 ${PILLAR} の1枚だけ`,
	JSON.stringify(cellsOf(t, (ch) => ch === TILE.BREAKABLE_WALL)) === JSON.stringify([PILLAR]));
check(`breakableWalls＝${PILLAR} が breakDef 1（爆弾の破壊力 ${ITEM_META.bomb.breakPower} で壊れる）`,
	JSON.stringify(room.breakableWalls) === JSON.stringify(BREAKABLE_WALLS) && ITEM_META.bomb.breakPower >= 1);
check(`地図 m は ${MAP_CELL} の1枚・宝箱 B は ${CHEST_CELL} の1枚`,
	JSON.stringify(cellsOf(t, (ch) => ch === TILE.ITEM_DUNGEON_MAP)) === JSON.stringify([MAP_CELL])
	&& JSON.stringify(cellsOf(t, (ch) => ch === TILE.CHEST)) === JSON.stringify([CHEST_CELL]));
check(`宝箱の中身＝ルピー×30`, JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
check(`showConditions＝${CHEST_CELL} が wallBroken(${PILLAR}) だけ`, JSON.stringify(room.showConditions) === JSON.stringify(SHOW_CONDITIONS));
check(`links が空・floorItems・bgTiles が空`,
	room.links.length === 0 && Object.keys(room.floorItems).length === 0 && Object.keys(room.bgTiles).length === 0);
{
	// 裂け目の空の量と、行ごとの幅の不揃い（崩れた形を盤面の形で出す＝1,3 の判定の教訓）。
	const sky = cellsOf(t, (ch) => ch === TILE.SKY);
	const perRow = Array.from({ length: ROWS }, (_, r) => sky.filter((k) => P(k)[0] === r).length);
	check(`裂け目の空が 16 マス・行ごとの幅が 1/2/3/4/3/3（行3〜8・実測 ${perRow.slice(3, 9).join('/')}）`,
		sky.length === 16 && perRow.slice(3, 9).join('/') === '1/2/3/4/3/3');
}

// ── ② 柱と立ち位置 ──────────────────────────────────────────────────
const foot = walkable(t, allExits);
check(`爆弾の半径が 2（立ち位置の設計はこの値で決めた）`, RADIUS === 2);
check(`柱 ${PILLAR} の四方が空（隣に立てない・実測 ${nbrs(PILLAR).map((k) => at(t, k)).join('')}）`,
	nbrs(PILLAR).every((k) => at(t, k) === TILE.SKY));
{
	const spots = blastSpots(t);
	check(`爆風が柱に届く歩ける床は ${SPOT} の1マスだけ（実測 ${spots.join(' ') || 'なし'}）`,
		JSON.stringify(spots) === JSON.stringify([SPOT]));
	for (const d of DECOYS) {
		check(`外れの立ち位置 ${d} に歩いて立てて、柱まで ${dist(d, PILLAR).toFixed(2)}＞${RADIUS}（届かない）`,
			foot.has(d) && dist(d, PILLAR) > RADIUS);
	}
	// 対照①＝柱の真上の空 (6,9) を床にすると、届く床が増える（空の1枚が立ち位置を絞っている証明）
	const fill = grid(); fill[6][9] = TILE.FLOOR;
	check(`対照：空 (6,9) を床にすると届く床が増える（実測 ${blastSpots(fill).join(' ')}）`, blastSpots(fill).length > 1);
	// 対照②＝立ち位置を壁にすると届く床が0（必ず '#' で潰す）
	const noSpot = grid(); { const [r, c] = P(SPOT); noSpot[r][c] = TILE.WALL; }
	check(`対照：立ち位置 ${SPOT} を壁にすると届く床が0`, blastSpots(noSpot).length === 0);
}
for (const [from, fromCells] of Object.entries(EXITS)) {
	const w = walkable(t, [fromCells[0]]);
	for (const [to, cells] of Object.entries(EXITS)) {
		if (to === from) continue;
		check(`道具なしで${from}の口から${to}の口へ歩ける`, cells.every((k) => w.has(k)));
	}
}
check(`地図 ${MAP_CELL}・宝箱 ${CHEST_CELL}・立ち位置 ${SPOT} に歩いて届く`,
	[MAP_CELL, CHEST_CELL, SPOT].every((k) => foot.has(k)));
{
	const floors = cellsOf(t, (ch) => ch === TILE.FLOOR || ch === TILE.CHEST || ch === TILE.ITEM_DUNGEON_MAP);
	check(`床のどのセルにも歩いて行ける（取り残された床が無い）`, floors.every((k) => foot.has(k)));
	const ladder = walkable(t, allExits, { withLadder: true });
	check(`はしごがあっても空は渡れない（歩ける ${foot.size} マス＝はしご ${ladder.size} マス）`,
		!LADDER_OVER.has(TILE.SKY) && foot.size === ladder.size);
}

// ── ③ ソルバー（状態空間）＝柱を崩せる・崩す手は立ち位置からだけ・詰まない ─────
{
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	// ⚠️ ソルバーの breakDefs は「セル→数」（`measure-puzzle.mjs` と同じ変換）。breakableWalls の
	//    {breakDef} をそのまま渡すと `{} <= 3` が偽＝爆弾で何も壊れない測定になる（最初にこれを踏んだ）。
	const breakDefs = Object.fromEntries(Object.entries(room.breakableWalls).map(([k, v]) => [k, v.breakDef ?? 1]));
	const solve = (opts) => {
		const S = makeSolver(t, bg, [], breakDefs, new Set(), { hasLadder: true, ...opts });
		const starts = allExits.map((cell) => {
			const [r, c] = P(cell);
			return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
		});
		const m = measureMetrics(S, starts, (st) => st.split('|')[3] === '1', () => 0,
			{ guardMax: 2_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
		return { S, starts, m };
	};
	const { S, starts, m } = solve({});
	check(`ソルバー（爆弾）で柱を崩せる（L=${m.L}）`, m.L !== null);
	check(`入って詰む状態が無い（実測 noEscape=${m.noEscape}）`, m.noEscape === 0);
	// 柱が崩れる遷移（broken 0→1）の起点のセルを全部集める＝立ち位置が1つだけか
	const from = new Set();
	const seen = new Set(starts), q = [...starts];
	while (q.length) {
		const st = q.shift();
		for (const nx of S.nextStates(st)) {
			if (st.split('|')[3] === '0' && nx.split('|')[3] === '1') from.add(st.split('|')[0]);
			if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
		}
	}
	check(`ソルバーでも柱を崩す手は ${SPOT} からだけ（実測 ${[...from].sort().join(' ')}）`,
		JSON.stringify([...from]) === JSON.stringify([SPOT]));
	check(`対照：道具封じでは柱を崩せない`, solve({ noTools: true }).m.L === null);
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
	check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：地図の部屋を「空越しの発破（崩れかけの柱）」に作り替える（キュー31 第1陣）`);
console.log(log.join('\n') || '  （変更なし）');

console.log(`\n## 盤面の差分（${ROOM}）`);
room.tiles.forEach((row, i) => {
	const now = rowStr(row);
	console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === now ? '=' : '→'}   ${now}`);
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
