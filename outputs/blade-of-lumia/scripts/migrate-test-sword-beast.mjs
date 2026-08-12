// Phase 5.5k #7 剣獣（SWORD_BEAST）のマップ側移行（2026-08-11）。
//
// このスクリプトは2つのことをする：
//
//   ① SKELETON のタイル文字を 'k' → 'θ' に置き換える
//      理由＝5.5k で「新規の陸上通常敵15種はギリシャ文字を使う」と決めた
//      （shared/tiles.js の該当コメント参照。ASCII の空きが14文字しか無く、
//       敵15種で使い切って地形/ギミック用が1文字も残らないため）。
//      'k' は暫定文字で、マップ上の実体は test_mechanics[0,0] の1セルだけ。
//
//   ② 検証ステージ test_mechanics[27,0]（= tests/test-stage-keys.js の `sword_beast`）を作る
//      幾何の芯＝**水路で敵とプレイヤーを隔てる**：
//        ・col 5 の rows 1-8 が水（'~'）＝陸上敵は入れない（passable.js enemyTilePassable）が
//          投擲物は飛び越える（isTilePassableForProj は WALL と未破壊の壊せる壁だけで止まる）。
//        ・東半分（cols 6-10）は row 4 の廊下だけ床＝剣獣は row 4 に閉じ込められる。
//        ・西半分（cols 1-4, rows 1-8）は素の床＝プレイヤーが row を選べる。
//      これで「高速で詰めてくる敵に密着される前に遠隔攻撃だけを観測する」状態が作れる。
//      剣獣は ENEMY_SPEED_FAST（0.5セル/tick）∴水路が無いと minRange(2.5) に届く前に
//      密着して近接に切り替わる＝飛ぶ斬撃の検証が成立しない。
//      プレイヤーの初期位置はスペック側が save 注入で決める（'@' は置かない）：
//        ・(4,2)  … 水路越しに row 4 で揃う＝飛ぶ斬撃が飛んでくる（陽性）
//        ・(2,2)  … row も col も揃わない（東の敵は row 4 の cols 6-10 にしか居られず、
//                   プレイヤーは col 2）∴幾何的に揃い得ない（陰性・空虚でない）
//        ・(4,10) … 東の廊下の中＝近接が起きる。guards:false なので構えないことを見る
//
// 使い方:
//   node scripts/migrate-test-sword-beast.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-test-sword-beast.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const OLD_SKELETON = 'k';
const NEW_SKELETON = 'θ';
const SWORD_BEAST  = 'μ';
const TEST_LAYER = 'test_mechanics';
const TEST_KEY   = '27,0';

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const rowsOf = (t) => t.map(r => (Array.isArray(r) ? [...r] : r.split('')));

// ── ① SKELETON 'k' → 'θ' を全レイヤー走査で置換 ─────────────────────────
// ⚠️ tiles は「文字の配列の配列」でなければならない（行を文字列にするとテストは
// 緑でも実ゲームが落ちる＝過去の実害）。読み込み時に配列へ正規化して書き戻す。
let replaced = 0;
for (const [layerName, layer] of Object.entries(data.layers ?? {})) {
	for (const [stageKey, stage] of Object.entries(layer.stages ?? {})) {
		if (!stage.tiles) continue;
		const grid = rowsOf(stage.tiles);
		let touched = false;
		grid.forEach((row, r) => row.forEach((ch, c) => {
			if (ch !== OLD_SKELETON) return;
			row[c] = NEW_SKELETON;
			touched = true;
			replaced++;
			console.log(`  '${OLD_SKELETON}' → '${NEW_SKELETON}': ${layerName}[${stageKey}] (${r},${c})`);
		}));
		if (touched) stage.tiles = grid;
		// コメント中の "(k)" 表記も直す（古い文字が残ると次に読む人が混乱する）。
		if (typeof stage.comment === 'string' && stage.comment.includes(`(${OLD_SKELETON})`)) {
			stage.comment = stage.comment.replaceAll(`(${OLD_SKELETON})`, `(${NEW_SKELETON})`);
		}
	}
}
console.log(`# SKELETON タイル置換: ${replaced} セル`);

// ── ② sword_beast 検証ステージを組む ────────────────────────────────────
const ROWS = 10, COLS = 12;
const W = '#', F = '.', WATER = '~';

const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(W));
for (let r = 1; r <= 8; r++) {
	for (let c = 1; c <= 4; c++) grid[r][c] = F;   // 西の広間（プレイヤー側）
	grid[r][5] = WATER;                            // 水路（陸上敵は越えられない／斬撃は越える）
}
for (let c = 6; c <= 10; c++) grid[4][c] = F;      // 東の廊下（剣獣を row 4 に閉じ込める）
grid[4][8] = SWORD_BEAST;                          // 剣獣

// ── 検査（幾何が崩れたら書き込まない）──────────────────────────────────
function fail(msg) { throw new Error(`[sword_beast] ${msg}`); }
if (grid.length !== ROWS) fail(`rows が ${ROWS} でない`);
for (const [i, row] of grid.entries()) if (row.length !== COLS) fail(`cols が ${COLS} でない: row ${i}`);
// 敵は1体だけ。
const beasts = grid.flat().filter(ch => ch === SWORD_BEAST).length;
if (beasts !== 1) fail(`剣獣が ${beasts} 体（1体でなければならない）`);
// 水路が rows 1-8 で途切れていないこと＝途切れると敵が西へ渡って密着し、遠隔の検証が壊れる。
for (let r = 1; r <= 8; r++) if (grid[r][5] !== WATER) fail(`水路が途切れている: (${r},5)='${grid[r][5]}'`);
// 東側は row 4 以外に床が無いこと＝敵が row を変えられると陰性ケースが空虚になる。
for (let r = 1; r <= 8; r++) for (let c = 6; c <= 10; c++) {
	const want = r === 4 ? F : W;
	if (grid[r][c] !== want && !(r === 4 && grid[r][c] === SWORD_BEAST)) {
		fail(`東側 (${r},${c}) が '${want}' でない: '${grid[r][c]}'`);
	}
}
// 陽性ケース（プレイヤー(4,2)）が range/minRange を満たすこと。
// 剣獣が最も西へ寄れるのは (4,6)＝距離 4（minRange 2.5 以上・range 9 以内）。
const distNearest = 6 - 2, distFarthest = 8 - 2;
if (!(distNearest >= 2.5 && distFarthest <= 9)) fail(`陽性ケースの距離が範囲外: ${distNearest}〜${distFarthest}`);
// 陰性ケース（プレイヤー(2,2)）が幾何的に揃わないこと＝敵の取り得る全セルで
// |dx|>=1 かつ |dy|>=1（enemyAttack の swordBeam は sameCol/sameRow のときだけ撃つ）。
for (let c = 6; c <= 10; c++) {
	const dx = c - 2, dy = 4 - 2;
	if (Math.abs(dx) < 1.0 || Math.abs(dy) < 1.0) fail(`陰性ケースで揃ってしまう敵位置 (4,${c})`);
}

const COMMENT =
	'[sword_beast] Phase 5.5k #7 剣獣(μ)の検証ステージ。'
	+ '幾何＝col 5 の rows 1-8 が水路（陸上敵は越えられない／飛ぶ斬撃は飛び越える）。'
	+ '東は row 4 の廊下だけ床＝剣獣(4,8)は row 4 に閉じ込められる。西(cols 1-4)は素の床。'
	+ 'プレイヤーは save 注入で置く：(4,2)＝水路越しに row 4 で揃う→飛ぶ斬撃が来る／'
	+ '(2,2)＝row も col も揃わない（陰性）／(4,10)＝東の廊下で近接（guards:false＝構えないことの確認）。'
	+ '⚠️ 水路を1セルでも塞ぐと剣獣が西へ渡って密着し、遠隔攻撃の検証が成立しなくなる。';

const testStages = data.layers?.[TEST_LAYER]?.stages;
if (!testStages) fail(`${TEST_LAYER} レイヤーが無い`);
const stage = {
	comment: COMMENT,
	tiles: grid,
	bgTiles: {},
	links: [],
	enemyDirs: {},
	rows: ROWS,
	cols: COLS,
};

console.log(`\n# ${TEST_LAYER}[${TEST_KEY}]（${testStages[TEST_KEY] ? '既存を上書き' : '新規作成'}）`);
grid.forEach((row, i) => console.log(`   ${String(i).padStart(2)} ${row.join('')}`));

if (DRY) {
	console.log('\n--dry: 書き込みなし');
} else {
	testStages[TEST_KEY] = stage;
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
	console.log('\n書き込み完了:', MAP_PATH);
	console.log('\n▶ 試す URL（vite dev / port 18080）:');
	console.log(`  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${TEST_LAYER}&stage=${TEST_KEY}&row=4&col=2`);
}
