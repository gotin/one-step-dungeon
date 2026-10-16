#!/usr/bin/env node
// scripts/migrate-q76a-golden-wing-hollow.mjs ── 実行キュー76 の①（2026-10-16）
// field 10,14 の石とスイッチの扉の先（10,15）を「金翼の淵」に作り直し、翼の羽衣で淵を
// 渡った先に新しい寄道 `dragon_lair`（邪竜の巣）の入口を開ける。
//
// なぜこの形か（ユーザー決定 2026-10-16・DECISIONS 同日）：
//   ・10,14 の石とスイッチの扉は「下の画面へはここからしか行けない」時代の名残＝今は 10,15 に
//     左右から歩いて入れて意味を失っていた。∴10,15 を山で囲い、入口を 10,14 の扉だけに戻す。
//   ・挑める時期は翼の羽衣の後（最終盤）＝扉の先に幅2の淵（水）を置き、飛ばないと渡れなくする。
//     幅2＝はしご（両隣が地上の1セルだけ渡れる）では越えられない。
//   ・囲いは山 `M`＝飛んでも越えられない（game/passable.js FLYABLE_OVER）。木・柵・茂みは
//     飛べる∴境界には使わない。隣の画面（9,15 東端・11,15 西端・10,16 北端）も山にして
//     縁を揃える＝「開いた縁の先が壁」（seam）を作らない。
//   ・飛行中の画面端の遷移が山の中へ入れた穴は game.js arrivalIsWallFlying で塞いだ（同日）。
//
// 書き換えるもの：
//   ① field 10,15 を作り直す（扉の下の前庭／幅2の淵／洞の口のある島）
//   ② 隣の3画面の縁を山にする（9,15 col 11・11,15 col 0・10,16 row 0）＋角2セル（9,16 (0,11)・11,16 (0,0)）
//   ③ 新レイヤー `dragon_lair`（入口の洞 0,0／主の間 1,0）を `darklord_prison` の直後に挿す
//      ＝主の間はまだ空（ボスと宝箱はキュー76 の③・⑤で置く）∴今は isBossRoom:false
//
// 実行：outputs/blade-of-lumia/ から `node scripts/migrate-q76a-golden-wing-hollow.mjs`

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { TILE } from '../shared/tiles.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const LAYER = 'dragon_lair';
const ENTRANCE = '0,0';
const LAIR = '1,0';
const HOLLOW = '10,15';
const FIELD_DOOR = '7,6';
const LAYER_DOOR = '1,1';
const WARP_ID = 'dragonLair';
const FIELD_WARP_ID = 'fieldToDragonLair';

// ── ① 金翼の淵（field 10,15）────────────────────────────────
// 上辺 (0,5)(0,6) が 10,14 の扉 `TT`(9,5)(9,6) の真下。前庭 rows 1-3 は扉を開ければ
// 羽衣が無くても歩ける＝淵の向こうの洞を「見せる」場所。rows 4-5 が淵（下地の水）、
// rows 6-8 が島＝洞の口 `>`(7,6) の前だけ石畳（古い参道）。
const HOLLOW_ROWS = [
	'MMMMM..MMMMM',
	'MMM......MMM',
	'M..........M',
	'M...i......M',
	'M..........M',
	'M..........M',
	'M..........M',
	'M....M>M...M',
	'MM..MMMMM.MM',
	'MMMMMMMMMMMM',
];
const WATER_ROWS = [4, 5];
const STONE_FLOOR_CELLS = ['6,5', '6,6', '6,7', '7,6'];
const SIGN_CELL = '3,4';

// ── ③ 邪竜の巣 ─────────────────────────────────────────
// 入口の洞：`>`(1,1) は魔将の巣・虚空の祠の入口と同型。東辺 rows 4-5 から主の間へ抜ける。
// 刻み文は石碑 `†`（名前に「刻み文」を含む読み物は碑の扱い＝木の看板 `i` にしない・warp-stone ①）。
const ENTRANCE_ROWS = [
	'############',
	'#>.†.......#',
	'#..........#',
	'#...#..#...#',
	'#...........',
	'#...........',
	'#...#..#...#',
	'#..........#',
	'#..........#',
	'############',
];
// 主の間：遮蔽物を置かない一室（ボス部屋の文法）。3×3 のボスが動ける広さを残すため
// 石碑も置かない。扉 `:` は西辺 rows 4-5＝入口の洞の東辺と向き合う。
const LAIR_ROWS = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	':..........#',
	':..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

const rowsToTiles = (rows) => rows.map((r) => [...r]);
function die(msg) {
	console.error(`✗ ${msg}`);
	process.exit(1);
}

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const fs = map.layers.field?.stages;

// ── 前提の確認 ───────────────────────────────────────────
if (map.layers[LAYER]) die(`${LAYER} が既に存在する（このスクリプトは1回だけ流す）`);
if (!map.layers.darklord_prison) die('darklord_prison が無い（挿す位置の基準）');
const door = fs?.['10,14'];
if (!door) die('field 10,14 が無い');
if (door.tiles[9][5] !== TILE.GATE || door.tiles[9][6] !== TILE.GATE) die('field 10,14 の扉 TT(9,5)(9,6) が無い');
const hollow = fs[HOLLOW];
if (!hollow) die(`field ${HOLLOW} が無い`);
for (const k of ['9,15', '11,15', '10,16', '9,16', '11,16']) if (!fs[k]) die(`field ${k} が無い`);
// 隣の縁に何も置かれていないこと（山で塗り潰すため）
const edgeCells = [
	...[...Array(10).keys()].map((r) => ['9,15', r, 11]),
	...[...Array(10).keys()].map((r) => ['11,15', r, 0]),
	...[...Array(12).keys()].map((c) => ['10,16', 0, c]),
	// 角＝9,16 の右上・11,16 の左上。ここが床のままだと、上（山にした 9,15 / 11,15 の角）と
	// 横（山にした 10,16 の角）へ開いた縁が壁に着く（seam）∴同じく山にする。
	['9,16', 0, 11],
	['11,16', 0, 0],
];
for (const [k, r, c] of edgeCells) {
	const t = fs[k].tiles[r][c];
	if (t !== TILE.FLOOR && t !== TILE.MOUNTAIN) die(`field ${k} (${r},${c}) が床でも山でもない '${t}'`);
	const key = `${r},${c}`;
	for (const f of ['mapEnters', 'signData', 'npcData', 'chestContents', 'showConditions']) {
		if (fs[k][f]?.[key]) die(`field ${k} (${key}) に ${f} がある`);
	}
}

// ── ① field 10,15 ────────────────────────────────────────
hollow.tiles = rowsToTiles(HOLLOW_ROWS);
const bg = {};
for (let r = 0; r < 10; r++) for (let c = 0; c < 12; c++) bg[`${r},${c}`] = 'w';
for (const r of WATER_ROWS) for (let c = 1; c <= 10; c++) bg[`${r},${c}`] = TILE.WATER;
for (const k of STONE_FLOOR_CELLS) bg[k] = TILE.STONE_FLOOR;
hollow.bgTiles = bg;
hollow.enemyDirs = {};
hollow.chestContents = {};
hollow.showConditions = {};
hollow.mapEnters = { [FIELD_DOOR]: { id: FIELD_WARP_ID, destId: WARP_ID } };
hollow.signData = {
	[SIGN_CELL]: {
		name: '淵の 立て札',
		lines: [
			'【金翼の淵】',
			'淵の 向こうに 古い 洞が 口を 開けている。',
			'翼 持たぬ者は この淵を 渡れない。',
		],
	},
};
hollow.comment = `[field ${HOLLOW}] 金翼の淵（キュー76・2026-10-16）。入口は上の 10,14 の石とスイッチの扉`
	+ '（TT）だけ＝左右・下は山で閉じた（山は羽衣でも越えられない）。前庭 rows 1-3 は扉を開ければ歩ける。'
	+ 'rows 4-5 は幅2の淵（下地の水）＝はしごでは渡れず、翼の羽衣で飛ばないと島に届かない。'
	+ `島の洞の口 ${FIELD_DOOR} から寄道 dragon_lair（邪竜の巣）へ降りる。敵は置かない。`;

// ── ② 隣の3画面の縁を山に ────────────────────────────────
for (const [k, r, c] of edgeCells) fs[k].tiles[r][c] = TILE.MOUNTAIN;

// ── ③ 新レイヤー ─────────────────────────────────────────
const blankStage = (rows) => ({
	cols: 12,
	rows: 10,
	tiles: rowsToTiles(rows),
	bgTiles: {},
	links: [],
	enemyDirs: {},
	chestContents: {},
	floorItems: {},
	objects: {},
	npcData: {},
	shopData: {},
	mapEnters: {},
	showConditions: {},
	breakableWalls: {},
	isBossRoom: false,
	signData: {},
	comment: '',
});

const entrance = blankStage(ENTRANCE_ROWS);
entrance.mapEnters = { [LAYER_DOOR]: { id: WARP_ID, destId: FIELD_WARP_ID } };
entrance.signData = {
	'1,3': {
		name: '洞の刻み文',
		lines: [
			'【邪竜の巣】',
			'金の翼を持つ 邪竜が 眠る 淵の底。',
			'討ち果たした者は その翼の 輝きを 纏うという。',
		],
	},
};
entrance.comment = `[${LAYER} ${ENTRANCE}] 邪竜の巣の入口（キュー76・2026-10-16）。field ${HOLLOW} の島の洞の口`
	+ `${FIELD_DOOR} から降りてくる部屋。東辺 rows 4-5 から主の間へ抜ける。敵は置かない＝主との一対一を薄めない。`;

const lair = blankStage(LAIR_ROWS);
lair.comment = `[${LAYER} ${LAIR}] 金翼の邪竜の間（キュー76）。⚠️ 2026-10-16 時点ではまだ空`
	+ '＝ボス（3×3）と金の装束の宝箱はキュー76 の③・⑤で置き、そのとき isBossRoom を true にする。'
	+ '遮蔽物を置かないのはボス部屋の文法どおり（3×3 の体が動ける広さを残す）。';

const layerData = { name: '邪竜の巣', bgm: 'dungeon', bossStage: LAIR, stages: { [ENTRANCE]: entrance, [LAIR]: lair } };
const rebuilt = {};
for (const [k, v] of Object.entries(map.layers)) {
	rebuilt[k] = v;
	if (k === 'darklord_prison') rebuilt[LAYER] = layerData;
}
map.layers = rebuilt;

// ── 自己検証（書いた JSON をもう一度読んで測る）──────────────────
writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
const back = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const bf = back.layers.field.stages;
const h = bf[HOLLOW];
ok(h.tiles.length === 10 && h.tiles.every((row) => Array.isArray(row) && row.length === 12), '10,15 の tiles が 12×10 の文字配列でない');
for (let c = 0; c < 12; c++) {
	if (c === 5 || c === 6) ok(h.tiles[0][c] === TILE.FLOOR, `10,15 (0,${c}) が扉の真下の床でない`);
	else ok(h.tiles[0][c] === TILE.MOUNTAIN, `10,15 (0,${c}) が山でない`);
	ok(h.tiles[9][c] === TILE.MOUNTAIN, `10,15 (9,${c}) が山でない`);
}
for (let r = 0; r < 10; r++) {
	ok(h.tiles[r][0] === TILE.MOUNTAIN && h.tiles[r][11] === TILE.MOUNTAIN, `10,15 row ${r} の左右が山でない`);
	ok(bf['9,15'].tiles[r][11] === TILE.MOUNTAIN, `9,15 (${r},11) が山でない`);
	ok(bf['11,15'].tiles[r][0] === TILE.MOUNTAIN, `11,15 (${r},0) が山でない`);
}
for (let c = 0; c < 12; c++) ok(bf['10,16'].tiles[0][c] === TILE.MOUNTAIN, `10,16 (0,${c}) が山でない`);
ok(bf['9,16'].tiles[0][11] === TILE.MOUNTAIN && bf['11,16'].tiles[0][0] === TILE.MOUNTAIN, '9,16／11,16 の角が山でない');
// 淵は幅2（はしごの両岸条件を満たさない）＝どの列でも rows 4-5 が両方水
for (let c = 1; c <= 10; c++) {
	ok(h.bgTiles[`4,${c}`] === TILE.WATER && h.bgTiles[`5,${c}`] === TILE.WATER, `10,15 col ${c} の淵が幅2でない`);
}
ok(h.tiles[7][6] === TILE.MAP_ENTER && h.mapEnters[FIELD_DOOR]?.destId === WARP_ID, '島の洞の口が無い');
const L = back.layers[LAYER];
ok(L?.name === '邪竜の巣' && L.bossStage === LAIR, 'レイヤー名／bossStage が入っていない');
const order = Object.keys(back.layers);
ok(order[order.indexOf('darklord_prison') + 1] === LAYER, 'dragon_lair が darklord_prison の直後に無い');
ok(L.stages[ENTRANCE].tiles[1][1] === TILE.MAP_ENTER, '入口の洞の `>` が無い');
if (problems.length) {
	for (const p of problems) console.error(`✗ ${p}`);
	process.exit(1);
}
console.log(`✓ field ${HOLLOW} を金翼の淵に作り直し、隣3画面の縁を山にし、${LAYER} を追加した`);
