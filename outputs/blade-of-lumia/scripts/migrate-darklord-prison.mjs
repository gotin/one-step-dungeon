#!/usr/bin/env node
// scripts/migrate-darklord-prison.mjs ── 実行キュー 0o（2026-09-05）
// 「X 魔王を世界のどこかに配置する」＝新設の寄道洞窟 `darklord_prison`（魔王の岩牢）の
// 主の間に 1 体だけ置き、討伐報酬にハートの器を置く。入口は空島（field 8,1）の
// **虚空の只中に浮く黒岩**＝翼の羽衣で飛ばないと立てない場所に作る。
//
// ⚠️ **この記述は 2026-09-05 の 0o-2 で失効した部分がある（このスクリプトは1回実行済み・履歴）。**
//    (i) 入口は 0o-2 (c) で空島（field 8,1 の浮岩 5,6）→ **南湖（field 9,10）の岩礁 (1,2)** へ移った
//        （`scripts/migrate-relocate-cave-mouths.mjs`）＝浮岩と扉跡は虚空／床へ戻してある。
//    (ii) 部屋は 0o-2 (b) で 2部屋 → **3部屋**（`0,0` 前室 → `0,1` 二色の錠の間 → `0,2` 封魔の間）に
//        なり、報酬も**ハートの器＝錠の間／ルミアの剣（剣 tier4）＝主の間の killAll 宝箱**へ組み替わった
//        （`scripts/migrate-darklord-prison-puzzle.mjs`）。現在の形はそちらの2本と
//        `tests/darklord-prison.spec.js` のヘッダを見る。
//
// なぜこの形か（ユーザー確定＋現物からの導出）：
//   (1) X の置き場は「新設の寄道の主（V と同型）」＝ユーザー確定（2026-09-05）。
//       dark_tower の道中でもなく既存の中ボス部屋でもない＝世界に1体だけの主。
//   (2) 報酬はハートの器×1（主の間・killAll 封印）＋回復薬（大）×1（前室・封印なし）。
//       剣0-3／盾0-2／防具0-2／銀のブーメランは**全ティアが既に世界に在る**（監査の
//       unplacedTiers が空）∴残っている恒久強化はハートの器だけ。回復薬（大）は「関門前の
//       一息」＝dark_tower の各階と同じ作法（ユーザーの回答は回復薬（大）・枠が寄道に
//       変わった分の恒久強化を主の間に足した）。
//   (3) 入場ゲートは地形そのもの＝虚空の祠（6,9）・魔将の巣（8,9）と同じ羽衣の関門だが、
//       扉を**東台地に4枚目として並べない**（扉の一覧になる）。虚空 `%` の只中に
//       2×2 の浮岩を彫って、そこに扉を置く＝飛行以外では絶対に立てないことが幾何で決まる。
//   (4) 主の間の幾何は闘技場 `test_mechanics 23,1`（bal_dark_lord）と**同じ**にする。
//       X の詔（lockstep）の実測「床のどのセルでも 60 tick 以内に被弾」はその床の上で
//       採った数∴同じ幾何なら実測がそのまま移る。外周を閉じ、扉 `:` と宝箱だけを足した。
//
// 書き換えるもの（3点）：
//   ① 新レイヤー `darklord_prison`（2部屋）を追加（`warlord_lair` の直後に挿す）
//   ② field `8,1` の虚空に浮岩（4セル）を彫り、扉 `>`(5,6) を置く＋石碑に1行足す
//   ③ 星の欠片の総数が 8 のままであることを確かめる（X を置いた影響を測る）
//
// ⚠️ X は `dropsTriforce` を持たない＝撃破しても星の欠片は落ちない。岩牢は翼の羽衣＝
//    古代の祭壇で欠片を全部捧げた後にしか入れない∴落とすと総数が 9 になり祭壇が永久に
//    開かない循環になる。0o で `game/boss.js` と `shared/triforce.js` のタイル名決め打ち
//    （`boss.type === TILE.DARK_LORD`）を撤去して `ENEMY_META` 由来へ一本化した。
// ⚠️ 主の間は `isBossRoom: true`＝`game/boss.js startBossBattle()` が走る。
//    「扉が閉じた」の pulse は**無条件**で出る∴部屋には `:`（DOORWAY_BOSS）が必須。
// ⚠️ 宝箱は `killAll` 封印（`game/conditions.js` は `enemies.length === 0` で判定）∴
//    主の間に雑魚を足してはいけない（雑魚だけ倒して宝箱が開く抜け道になる）。
// ⚠️ 虚空を彫るとき row 6（虚空の祠 spec）と row 8（魔将の巣 spec）の cols 4-7 は
//    `%%%%` のまま残す＝どちらも「歩いては渡れない」ことの証明に使っている行。
//
// 実行：outputs/blade-of-lumia/ から `node scripts/migrate-darklord-prison.mjs`

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ITEM_META } from '../shared/items.js';
import { countTriforces } from '../shared/triforce.js';
import { EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const LAYER = 'darklord_prison';
const ENTRANCE = '0,0';          // 岩牢の口（field からワープで入る前室＋竪坑）
const CELL = '0,1';              // 封魔の間（isBossRoom）。ステージキーは `x,y`＝南は y+1
const FIELD_STAGE = '8,1';       // 空島（塔の扉・虚空の祠・魔将の巣と同じ画面）
const FIELD_DOOR = '5,6';        // 虚空に彫る浮岩の上の扉
const ISLET_FLOOR = ['4,5', '4,6', '5,5'];   // 浮岩の残り3セル（扉と合わせて 2×2）
const WARP_ID = 'darklordPrison';            // 岩牢側の出入口 id
const FIELD_WARP_ID = 'fieldToDarklordPrison'; // フィールド側の出入口 id
const SHARD_TOTAL = 8;           // 星の欠片の総数（この移行で動かしてはいけない）

// ── 盤面（行リテラル＝目で見て設計する。読む側も1画面で全体が分かる）──────────
// 前室＋竪坑：row 1-2 が前室（着地 `>`(1,1)・刻み文 `i`(2,1)・回復薬（大） `B`(1,10)）、
// row 3-4 で漏斗状に狭まり、row 5-9 は 2 列幅（cols 5-6）の竪坑＝下って主の間へ降りる。
// 南辺 row 9 の cols 5-6 だけを開ける＝主の間の北辺の扉 `:` とちょうど向き合う。
// 敵は置かない＝主との一対一を薄めない。
const ENTRANCE_ROWS = [
	'############',
	'#>........B#',
	'#i.........#',
	'###......###',
	'####....####',
	'#####..#####',
	'#####..#####',
	'#####..#####',
	'#####..#####',
	'#####..#####',
];
// 封魔の間：闘技場 `test_mechanics 23,1`（bal_dark_lord）と同じ幾何＝内部は全面床
// （遮蔽ゼロ）・X は (4,8)・看板は (6,1)。そこへ外周を閉じ、北辺 cols 5-6 に扉 `:`、
// 南東の隅に宝箱 `B`(8,10) を足した。遮蔽を置かないのはボス部屋の文法
// （dungeon_1 0,0 / dark_tower 0,0）どおりで、かつ詔（lockstep）の実測条件そのもの。
const CELL_ROWS = [
	'#####::#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'#.......X..#',
	'#..........#',
	'#i.........#',
	'#..........#',
	'#.........B#',
	'############',
];

const POTION_CELL = '1,10';      // 前室の回復薬（大）（封印なし＝関門前の一息）
const HEART_CELL = '8,10';       // 主の間のハートの器（killAll 封印）
const BOSS_CELL = '4,8';         // X（闘技場と同じ座標）
const ARENA = { layer: 'test_mechanics', stage: '23,1' };   // 幾何の出所

// ── ここから下は「書く」処理 ──────────────────────────────────
const rowsToTiles = (rows) => rows.map((r) => [...r]);
const cellsOf = (rows, ch) => {
	const out = [];
	rows.forEach((row, r) => [...row].forEach((c, i) => { if (c === ch) out.push(`${r},${i}`); }));
	return out;
};

function die(msg) {
	console.error(`✗ ${msg}`);
	process.exit(1);
}

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// ── 前提の確認（壊れた前提の上に書かない）────────────────────────
if (map.layers[LAYER]) die(`${LAYER} が既に存在する（このスクリプトは1回だけ流す）`);
const xMeta = ENEMY_META[TILE.DARK_LORD];
if (!xMeta?.isBoss) die("TILE.DARK_LORD 'X' がボスでない");
if (xMeta.dropsTriforce) die('X が星の欠片を落とす＝祭壇の後の寄道に置くと循環する');
if (!ITEM_META.heartContainer) die('ITEM_META に heartContainer が無い');
if (!ITEM_META.bigHealPotion) die('ITEM_META に bigHealPotion（回復薬（大））が無い');
const beforeShards = countTriforces(map);
if (beforeShards !== SHARD_TOTAL) die(`星の欠片の総数が ${SHARD_TOTAL} でない: ${beforeShards}`);
if (!EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === CELL)) {
	die(`EXTRA_ENEMY_ROOMS に ${LAYER}/${CELL} の宣言が無い（配置表の外の敵部屋＝ドリフト扱いになる）`);
}
// 主の間の幾何が闘技場と同じであること（＝詔の実測が移る根拠）を現物で確かめる。
const arena = map.layers[ARENA.layer]?.stages?.[ARENA.stage];
if (!arena) die(`闘技場 ${ARENA.layer}/${ARENA.stage} が無い＝幾何の出所を確かめられない`);
for (const [r, c] of [[4, 8], [6, 1]]) {
	const want = arena.tiles[r][c];
	const got = CELL_ROWS[r][c];
	if (want !== got) die(`主の間 (${r},${c}) が闘技場と違う: 闘技場 '${want}' / 設計 '${got}'`);
}
for (let r = 1; r <= 8; r++) {
	for (let c = 1; c <= 10; c++) {
		const a = arena.tiles[r][c], b = CELL_ROWS[r][c];
		// 闘技場の床セルは主の間でも床（宝箱1枚だけは足す＝報酬）。
		if (a === TILE.FLOOR && b !== TILE.FLOOR && `${r},${c}` !== HEART_CELL) {
			die(`主の間 (${r},${c}) に闘技場に無い遮蔽を置いた（詔の実測条件が崩れる）: '${b}'`);
		}
	}
}
const fieldStage = map.layers.field?.stages?.[FIELD_STAGE];
if (!fieldStage) die(`field ${FIELD_STAGE} が無い`);
for (const key of [FIELD_DOOR, ...ISLET_FLOOR]) {
	const [r, c] = key.split(',').map(Number);
	if (fieldStage.tiles[r][c] !== TILE.SKY) {
		die(`field ${FIELD_STAGE} (${key}) が虚空 SKY でない＝浮岩を彫る場所を間違えている`);
	}
}
if (fieldStage.mapEnters?.[FIELD_DOOR]) die(`field ${FIELD_STAGE} (${FIELD_DOOR}) に既に出入口がある`);

// ── ① 新レイヤー ────────────────────────────────────────────
// ステージのキー構成は既存の寄道（void_shrine / warlord_lair）と同じ順・同じ既定値で作る
// ＝エディタが後から開いても足りないキーを補わない（差分が読める）。
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
entrance.mapEnters = { '1,1': { id: WARP_ID, destId: FIELD_WARP_ID } };
entrance.chestContents = {
	[POTION_CELL]: { type: 'item', item: 'bigHealPotion', name: ITEM_META.bigHealPotion.name },
};
entrance.signData = {
	'2,1': {
		name: '岩牢の刻み文',
		lines: [
			'【封魔の岩牢】',
			'星の欠片を 継いだ 者よ。ここは 塔ではない。',
			'塔の主より 古い 王が 岩に 縫い留められている。',
			'竪坑を 下れば 扉は 内から 閉じる。逃げ場は 無い。',
		],
	},
};
entrance.comment = `[${LAYER} ${ENTRANCE}] 岩牢の口＝空島（field ${FIELD_STAGE}）の虚空に浮く岩の `
	+ `扉 (${FIELD_DOOR}) から入る前室。翼の羽衣で虚空を飛ばないと浮岩に立てない＝入場ゲートは`
	+ '地形そのもの（虚空の祠・魔将の巣と同型だが、扉を東台地に並べず虚空の只中に置いた）。'
	+ `前室（rows 1-2）で回復薬（大） (${POTION_CELL}) を拾い、漏斗（rows 3-4）から 2 列幅の竪坑`
	+ '（rows 5-9・cols 5-6）を下って南辺から封魔の間へ降りる。敵は置かない＝主との一対一を薄めない。';

const cell = blankStage(CELL_ROWS);
cell.isBossRoom = true;
cell.chestContents = {
	[HEART_CELL]: { type: 'heartContainer', name: ITEM_META.heartContainer.name },
};
cell.showConditions = { [HEART_CELL]: { trigger: 'killAll' } };
cell.enemyDirs = { [BOSS_CELL]: 'up' };   // 北辺の扉（＝プレイヤーが降りてくる側）を向いて待つ
cell.signData = {
	'6,1': {
		name: '封魔の碑',
		lines: [
			'【封魔の間】',
			'八つの 欠片が 揃った 日に この王は 目を 開く。',
			'——器を ひとつ 置いていく。生きて 帰る 者のために。',
		],
	},
};
cell.comment = `[${LAYER} ${CELL}] 封魔の間＝寄道の主の間。X 魔王を世界で1体だけここに置いた`
	+ '（0o・2026-09-05。それまで X はどのレイヤーにも居なかった＝監査の🔴「会えない敵」）。'
	+ `幾何は闘技場 ${ARENA.layer} ${ARENA.stage}（bal_dark_lord）と同じ＝内部は全面床・遮蔽ゼロ・`
	+ `X (${BOSS_CELL})・看板 (6,1)。詔（lockstep）の「床のどのセルでも 60 tick 以内に被弾」は`
	+ 'その床で採った実測∴同じ幾何なら移る。isBossRoom:true ∴入室で `:`（北辺 0,5/0,6）が閉じ'
	+ `HP バーが出る＝一対一の一戦になる。宝箱 (${HEART_CELL}) は killAll 封印∴**この部屋に`
	+ '雑魚を足してはいけない**（雑魚だけ倒して開く抜け道になる）。'
	+ '⚠️ X は星の欠片を落とさない（祭壇より後の寄道＝落とすと総数が 9 になって祭壇が開かない）。';

// レイヤーは `warlord_lair` の直後（＝ORDER の並び）に挿す＝JSON を読む人が進行順に辿れる。
const layerData = {
	name: '魔王の岩牢', bgm: 'dungeon', bossStage: CELL,
	stages: { [ENTRANCE]: entrance, [CELL]: cell },
};
const rebuilt = {};
for (const [k, v] of Object.entries(map.layers)) {
	rebuilt[k] = v;
	if (k === 'warlord_lair') rebuilt[LAYER] = layerData;
}
if (!rebuilt[LAYER]) rebuilt[LAYER] = layerData;   // warlord_lair が無い場合の保険
map.layers = rebuilt;

// ── ② field 8,1（虚空に浮岩＋扉／石碑の1行）──────────────────────
for (const key of ISLET_FLOOR) {
	const [r, c] = key.split(',').map(Number);
	fieldStage.tiles[r][c] = TILE.FLOOR;
}
const [fdr, fdc] = FIELD_DOOR.split(',').map(Number);
fieldStage.tiles[fdr][fdc] = TILE.MAP_ENTER;
fieldStage.mapEnters = { ...(fieldStage.mapEnters ?? {}), [FIELD_DOOR]: { id: FIELD_WARP_ID, destId: WARP_ID } };
const stele = fieldStage.signData?.['7,2'];
if (!stele?.lines) die(`field ${FIELD_STAGE} (7,2) の石碑が {name,lines} 形式でない`);
const NEW_SIGN_LINE = '虚空の 只中に 黒い岩が 浮く。魔王が 岩に 縫い留められている。';
if (!stele.lines.includes(NEW_SIGN_LINE)) stele.lines.push(NEW_SIGN_LINE);

// ── ③ 自己検証（書いた JSON をもう一度読んで測る）──────────────────
const out = JSON.stringify(map, null, 2);   // 実マップの整形（スペース2）を保つ
writeFileSync(MAP_PATH, out);
const back = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

const L = back.layers[LAYER];
ok(L?.name === '魔王の岩牢', 'レイヤー名が入っていない');
ok(L?.bossStage === CELL, 'bossStage が主の間を指していない');
for (const [sk, rows] of [[ENTRANCE, ENTRANCE_ROWS], [CELL, CELL_ROWS]]) {
	const st = L?.stages?.[sk];
	ok(Array.isArray(st?.tiles) && st.tiles.every((r) => Array.isArray(r) && r.length === 12),
		`${sk} の tiles が 12 列の文字配列でない`);
	ok(st?.tiles?.length === 10, `${sk} の行数が 10 でない`);
	ok(st?.tiles?.map((r) => r.join('')).join('|') === rows.join('|'), `${sk} の盤面が設計と違う`);
	ok(Array.isArray(st?.links), `${sk} の links が配列でない（{} は refreshGates を殺す）`);
}
const cellBack = L?.stages?.[CELL];
ok(cellBack?.isBossRoom === true, '主の間が isBossRoom でない');
ok(cellsOf(CELL_ROWS, TILE.DOORWAY_BOSS).join(' ') === '0,5 0,6',
	'主の間の `:` が北辺 cols 5-6 に無い（竪坑の出口と噛み合わない＝扉が開かない）');
ok(cellBack?.chestContents?.[HEART_CELL]?.type === 'heartContainer', 'ハートの器の宝箱が無い');
ok(cellBack?.showConditions?.[HEART_CELL]?.trigger === 'killAll', '宝箱が killAll 封印でない');
ok(cellBack?.enemyDirs?.[BOSS_CELL] === 'up', '主の向きが入っていない');
const entranceBack = L?.stages?.[ENTRANCE];
ok(entranceBack?.chestContents?.[POTION_CELL]?.item === 'bigHealPotion', '前室の回復薬（大）が無い');
ok(!entranceBack?.showConditions?.[POTION_CELL], '前室の回復薬（大）に封印が付いている（関門前の一息）');
ok(!entranceBack?.isBossRoom, '前室がボス部屋になっている');
ok(entranceBack?.signData?.['2,1']?.lines?.length > 0, '前室の刻み文が無言看板');
ok(cellBack?.signData?.['6,1']?.lines?.length > 0, '封魔の碑が無言看板');
// 竪坑の出口（前室 row 9）と主の間の扉が同じ列＝歩いて降りられる
for (const c of [5, 6]) {
	ok(entranceBack?.tiles?.[9]?.[c] === TILE.FLOOR, `前室の南辺 (9,${c}) が塞がっている`);
	ok(cellBack?.tiles?.[0]?.[c] === TILE.DOORWAY_BOSS, `主の間の北辺 (0,${c}) が扉でない`);
}

// 世界の X は主の間の1体だけ／主の間に雑魚は居ない（test_ レイヤーの闘技場は数えない）
const xCells = [];
let mobsInPrison = 0;
for (const [lk, layer] of Object.entries(back.layers)) {
	if (lk.startsWith('test_')) continue;
	for (const [sk, st] of Object.entries(layer.stages ?? {})) {
		(st.tiles ?? []).forEach((row, r) => row.forEach((ch, c) => {
			if (ch === TILE.DARK_LORD) xCells.push(`${lk}/${sk} (${r},${c})`);
			if (lk === LAYER && ENEMY_META[ch] && !ENEMY_META[ch].isBoss) mobsInPrison += 1;
		}));
	}
}
ok(xCells.length === 1 && xCells[0] === `${LAYER}/${CELL} (${BOSS_CELL})`,
	`X が1体だけ主の間に居ない: ${xCells.join(' / ')}`);
ok(mobsInPrison === 0, `${LAYER} に雑魚が居る（killAll 封印が抜け道になる）`);

// 星の欠片の総数は動かない（X を置いても 8）＝祭壇の授与条件が壊れていない
const afterShards = countTriforces(back);
ok(afterShards === SHARD_TOTAL,
	`X を置いたら星の欠片の総数が ${beforeShards} → ${afterShards} になった（祭壇が開かない）`);

// field 側（浮岩・扉・虚空の残り・石碑）
const fb = back.layers.field.stages[FIELD_STAGE];
ok(fb.tiles[fdr][fdc] === TILE.MAP_ENTER, `field ${FIELD_STAGE} (${FIELD_DOOR}) に扉が無い`);
ok(fb.mapEnters[FIELD_DOOR]?.destId === WARP_ID, 'フィールド側の扉が岩牢を指していない');
for (const key of ISLET_FLOOR) {
	const [r, c] = key.split(',').map(Number);
	ok(fb.tiles[r][c] === TILE.FLOOR, `浮岩の (${key}) が床になっていない`);
}
// 浮岩は虚空に囲まれている＝歩いて渡れる橋になっていない（西の台地は col 3・東は col 8）
for (const r of [4, 5]) {
	ok(fb.tiles[r][4] === TILE.SKY, `(${r},4) が虚空でない＝西の台地から歩いて渡れる橋になった`);
	ok(fb.tiles[r][7] === TILE.SKY, `(${r},7) が虚空でない＝東の台地から歩いて渡れる橋になった`);
}
// 既存 spec が「歩いては渡れない」の証明に使っている行は虚空のまま
ok(fb.tiles[6].join('').slice(4, 8) === '%%%%', 'row 6 の虚空を埋めた（虚空の祠 spec が読む行）');
ok(fb.tiles[8].join('').slice(4, 8) === '%%%%', 'row 8 の虚空を埋めた（魔将の巣 spec が読む行）');
ok(fb.signData['7,2'].lines.includes(NEW_SIGN_LINE), '石碑に案内の1行が入っていない');
ok(fb.signData['7,2'].lines.some((l) => l.includes('もう一つの扉')), '祠の案内を壊した');
ok(fb.signData['7,2'].lines.some((l) => l.includes('魔将')), '魔将の案内を壊した');

// 出入口 id は世界で一意（exitRegistry は id → 座標の1対1）
const seen = new Map();
for (const [lk, layer] of Object.entries(back.layers)) {
	for (const [sk, st] of Object.entries(layer.stages ?? {})) {
		for (const [pk, me] of Object.entries(st.mapEnters ?? {})) {
			if (!me?.id) continue;
			ok(!seen.has(me.id), `出入口 id "${me.id}" が ${seen.get(me.id)} と ${lk}/${sk} (${pk}) で衝突`);
			seen.set(me.id, `${lk}/${sk} (${pk})`);
		}
	}
}
ok(seen.get(WARP_ID) === `${LAYER}/${ENTRANCE} (1,1)`, '岩牢側の出入口が着地セルに無い');
ok(back.layers[LAYER].stages[ENTRANCE].mapEnters['1,1']?.destId === FIELD_WARP_ID,
	'岩牢側の出入口がフィールドを指していない');

if (problems.length) {
	console.error('✗ 自己検証で問題を検出（マップは書き換わっている＝git で戻せる）:');
	problems.forEach((p) => console.error(`   - ${p}`));
	process.exit(1);
}

console.log('✓ darklord_prison を追加した');
console.log(`   ${LAYER}/${ENTRANCE} 岩牢の口   … field ${FIELD_STAGE} (${FIELD_DOOR}) ⇔ (1,1)`
	+ `／${ITEM_META.bigHealPotion.name}（${POTION_CELL}・封印なし）`);
console.log(`   ${LAYER}/${CELL} 封魔の間   … X ×1（${BOSS_CELL}・向き up）`
	+ `＋ ${ITEM_META.heartContainer.name}（${HEART_CELL}・killAll 封印）`);
console.log(`   field ${FIELD_STAGE} … 虚空の只中に浮岩 2×2（${[...ISLET_FLOOR, FIELD_DOOR].join(' ')}）`);
console.log(`   星の欠片の総数 ＝ ${afterShards}（X を置いても動かない）`);
