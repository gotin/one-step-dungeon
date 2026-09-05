#!/usr/bin/env node
// scripts/migrate-relocate-cave-mouths.mjs ── 実行キュー 0o-2 (c)（2026-09-05）
// 寄道の入口を「全部 field 8,1」から**分散**させる。
//
// ユーザーの再考（2026-09-05）：「洞窟の入り口が全部 8,1 なのも変。分散させたい」
// 確定（AskUserQuestion）：**岩牢＝湖の孤島**／**魔将の巣＝山の裂け目の向こう岸（field 6,0）**。
// 虚空の祠だけは空島（field 8,1）に残す＝空島に3枚並べたのを1枚に減らす。
//
// 何をするか（3画面）：
//   ① field 8,1（空島）… `5,6`（岩牢）と `8,9`（魔将の巣）の扉を**撤去**し、地形を元の虚空へ
//      戻す（浮岩 rows 4-5 → SKY・東台地 (8,9) → 床）。石碑の魔将/魔王の2行も落とす。
//      残るのは `3,2` 塔への戻り／`3,9` 塔の入口／`6,9` 虚空の祠 の3枚。
//   ② field 9,10（南湖）… 湖の水面 row 1 / cols 1-4 を**黒い岩の岩礁**に塗り替え、
//      `1,2` に岩牢の口を置く。橋は架けない＝翼の羽衣で水を越えるしか降り立てない。
//      十字路の北の行き止まり (3,6) に標を立てる＝孤島が「気づける」ようにする。
//   ③ field 6,0（虚空の淵）… row 3 の虚空8枚の**向こう岸**（北の崖 `####`）を彫って
//      岩棚＋洞の口 `2,6` にする。羽衣で裂け目を越えないと岩棚に立てない。
//      既にある「淵の伝承碑」(8,3) に魔将の2行を足す（8,1 の石碑から移す）。
//
// ⚠️ 扉の対応は**座標ではなく id**で解決される（`game/game.js` の exitRegistry ＝
//    `destId` → 同じ `id` を持つ mapEnter）∴`fieldToDarklordPrison` /
//    `fieldToWarlordLair` の id を保てば寄道側の戻り口は直さなくてよい。
// ⚠️ 看板タイル `i` は **passable.js では通行不可**（`scripts/lib/connectivity.mjs` の
//    HARD_BLOCKED に入っている＝tiles.js のコメント「通行可」より実装が真実）∴
//    標は「行き止まりの葉セル」に立てる＝どの経路も切らない。
// ⚠️ 飛行で越えられるのは FLYABLE_OVER（空・水・溶岩・木・茂み・柵・潮門）だけ＝
//    山 `M` と壁 `#` は飛んでも越えられない。岩棚を壁で囲み、虚空側だけを開けるのが
//    「羽衣ゲート」の作り方（このスクリプトが徒歩 BFS と飛行 BFS の両方で確かめる）。
//
// 実行：outputs/blade-of-lumia/ から `node scripts/migrate-relocate-cave-mouths.mjs`

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { TILE } from '../shared/tiles.js';
import { cellTile, isBlocked, isLadderBridgeCell, LADDER_OVER } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const SKY_ISLAND = '8,1';     // 空島（撤去する側）
const LAKE = '9,10';          // 南湖（岩牢の新しい入口）
const RIFT = '6,0';           // 虚空の淵（魔将の巣の新しい入口）

const PRISON_DOOR = { r: 1, c: 2 };    // 湖の孤島の洞の口
const LAIR_DOOR = { r: 2, c: 6 };      // 裂け目の向こう岸の洞の口
const LAKE_SIGN = { r: 3, c: 6 };      // 十字路の北の行き止まり（葉セル）

// 孤島＝湖の水面 row 1 / cols 1-4 の1行だけ（黒い岩の細い岩礁）。
// ⚠️ **2行（rows 1-2）にしてはいけない**＝はしごは「水1枚の両岸が陸」なら渡れる
//    （`isLadderBridgeCell`）∴row 2 まで陸にすると 橋 row 4 → 水 row 3 → 陸 row 2 が
//    1枚渡りになって、D5 のはしごを持った時点で羽衣ゲートが消える。1行なら水が2枚
//    （rows 2-3）残る∴はしごでは渡れない。下の自己検証がこの穴を毎回塞ぐ。
const ISLAND = [[1, 1], [1, 2], [1, 3], [1, 4]];

// 飛行で越えられるタイル（game/passable.js FLYABLE_OVER と同じ＝山・壁は含まない）
const FLYABLE = new Set([TILE.SKY, TILE.WATER, TILE.LAVA, TILE.TREE, TILE.BUSH, TILE.FENCE, TILE.TIDE_GATE]);

function die(msg) {
	console.error(`✗ ${msg}`);
	process.exit(1);
}

const rowStr = (st, r) => st.tiles[r].join('');
const setCell = (st, r, c, ch) => { st.tiles[r][c] = ch; };
const setBg = (st, r, c, ch) => { (st.bgTiles ??= {})[`${r},${c}`] = ch; };

// ── 徒歩／はしご／飛行の到達（画面内だけ・BFS）──────────────────────
// 徒歩＝`isBlocked(cellTile())`（bgTiles の水下地も畳み込む）。
// はしご＝水/穴のうち「進入軸の両隣が陸」の1枚だけ渡れる（`isLadderBridgeCell`）。
//         ⚠️ はしごは D5 の報酬＝羽衣より**ずっと早く**手に入る∴入場ゲートを地形で作る
//            ときは「徒歩で届かない」だけでは足りない＝はしごでも届かないことまで測る。
// 飛行＝床の上か FLYABLE の上を進める（着地できるのは床＝到達判定は床セルで見る）。
function reach(st, start, { flying = false, ladder = false } = {}) {
	const R = st.rows, C = st.cols;
	const key = (r, c) => `${r},${c}`;
	const walkable = (r, c) => !isBlocked(cellTile(st, r, c));
	const ladderable = (r, c) => ladder && LADDER_OVER.has(cellTile(st, r, c))
		&& isLadderBridgeCell(st.tiles, R, C, r, c, st.bgTiles);
	const enterable = (r, c) => walkable(r, c) || ladderable(r, c)
		|| (flying && FLYABLE.has(cellTile(st, r, c)));
	if (!walkable(start.r, start.c)) die(`到達判定の起点 (${start.r},${start.c}) が歩けない`);
	const seen = new Set([key(start.r, start.c)]);
	const q = [[start.r, start.c]];
	for (let i = 0; i < q.length; i++) {
		const [r, c] = q[i];
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc;
			if (nr < 0 || nc < 0 || nr >= R || nc >= C) continue;
			if (seen.has(key(nr, nc)) || !enterable(nr, nc)) continue;
			seen.add(key(nr, nc));
			q.push([nr, nc]);
		}
	}
	return { has: (r, c) => seen.has(key(r, c)) && walkable(r, c), size: seen.size };
}

// ── 前提の確認 ────────────────────────────────────────────
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const F = map.layers.field?.stages;
if (!F) die('field レイヤーが無い');
const sky = F[SKY_ISLAND], lake = F[LAKE], rift = F[RIFT];
for (const [k, st] of [[SKY_ISLAND, sky], [LAKE, lake], [RIFT, rift]]) {
	if (!st) die(`field ${k} が無い`);
	if (st.rows !== 10 || st.cols !== 12) die(`field ${k} が 10x12 でない`);
	if (!st.tiles.every((r) => Array.isArray(r) && r.length === 12)) die(`field ${k} の tiles が文字配列でない`);
}
// 空島に撤去する2枚が居るか（＝まだ移していないか）
if (sky.mapEnters?.['5,6']?.id !== 'fieldToDarklordPrison') die('空島 (5,6) に岩牢の扉が無い（既に移した？）');
if (sky.mapEnters?.['8,9']?.id !== 'fieldToWarlordLair') die('空島 (8,9) に魔将の巣の扉が無い（既に移した？）');
if (Object.keys(sky.mapEnters).length !== 5) die(`空島の扉が5枚でない: ${Object.keys(sky.mapEnters).join(' ')}`);
if (rowStr(sky, 4) !== 'M...%..%...M') die(`空島 row4 が想定と違う: ${rowStr(sky, 4)}`);
if (rowStr(sky, 5) !== 'M...%.>%...M') die(`空島 row5 が想定と違う: ${rowStr(sky, 5)}`);
if (rowStr(sky, 8) !== 'M...%%%%.>.M') die(`空島 row8 が想定と違う: ${rowStr(sky, 8)}`);
const stele = sky.signData?.['7,2']?.lines;
if (stele?.length !== 5) die(`空島の石碑が5行でない: ${stele?.length}`);
if (!stele[3].includes('魔将') || !stele[4].includes('魔王')) die('空島の石碑の4-5行目が魔将/魔王の案内でない');
// 湖：孤島にするセルが全部「水の上の床」か（陸を潰さない）
for (const [r, c] of ISLAND) {
	if (lake.tiles[r][c] !== TILE.FLOOR) die(`南湖 (${r},${c}) が床でない: ${lake.tiles[r][c]}`);
	if (lake.bgTiles?.[`${r},${c}`] !== TILE.WATER) die(`南湖 (${r},${c}) の下地が水でない`);
}
if (Object.keys(lake.mapEnters ?? {}).length !== 0) die('南湖に既に扉がある');
if (Object.keys(lake.signData ?? {}).length !== 0) die('南湖に既に看板がある');
if (lake.tiles[LAKE_SIGN.r][LAKE_SIGN.c] !== TILE.FLOOR) die('南湖の標を立てるセルが床でない');
// 裂け目：北の崖が壁のままか
if (rowStr(rift, 1) !== 'MMMMM##MMMMM') die(`虚空の淵 row1 が想定と違う: ${rowStr(rift, 1)}`);
if (rowStr(rift, 2) !== 'MMMM####MMMM') die(`虚空の淵 row2 が想定と違う: ${rowStr(rift, 2)}`);
if (rowStr(rift, 3) !== 'MM%%%%%%%%MM') die(`虚空の淵 row3 が想定と違う: ${rowStr(rift, 3)}`);
if (Object.keys(rift.mapEnters ?? {}).length !== 0) die('虚空の淵に既に扉がある');
if (!rift.signData?.['8,3']?.lines) die('虚空の淵の伝承碑が {name,lines} 形式でない');

// ── ① 空島（field 8,1）＝2枚を撤去して虚空へ戻す ──────────────────
delete sky.mapEnters['5,6'];
delete sky.mapEnters['8,9'];
for (const [r, c] of [[4, 5], [4, 6], [5, 5], [5, 6]]) setCell(sky, r, c, TILE.SKY);
setCell(sky, 8, 9, TILE.FLOOR);
sky.signData['7,2'].lines = stele.slice(0, 3);   // 魔将・魔王の2行を落とす（移設先へ移した）
sky.comment = (sky.comment ? `${sky.comment} ` : `[field ${SKY_ISLAND}] 空島（虚空の谷の向こう＝暗黒の塔と虚空の祠の玄関）。`)
	+ `⚠️ 0o-2 (c)（2026-09-05）で寄道の入口を分散させた＝岩牢 (5,6) を南湖 ${LAKE} の孤島へ、`
	+ `魔将の巣 (8,9) を虚空の淵 ${RIFT} の裂け目の向こう岸へ移し、浮岩（rows 4-5）と`
	+ '東台地の扉跡 (8,9) を元の地形へ戻した。この画面に残るのは 塔への戻り (3,2)／'
	+ '塔の入口 (3,9)／虚空の祠 (6,9) の3枚。石碑の魔将・魔王の2行も移設先の碑へ移した。';

// ── ② 南湖（field 9,10）＝黒い岩の孤島 ──────────────────────────
// 見える地面は bgTiles（[[field-bgtile-is-visible-ground]]）∴岩肌 `c` を敷く＝
// 青一色の湖に黒い岩が浮いて見える＝プレイヤーが「気づける」（指標だけでは足りない）。
for (const [r, c] of ISLAND) setBg(lake, r, c, TILE.ASH);
setCell(lake, PRISON_DOOR.r, PRISON_DOOR.c, TILE.MAP_ENTER);
lake.mapEnters = { [`${PRISON_DOOR.r},${PRISON_DOOR.c}`]: { id: 'fieldToDarklordPrison', destId: 'darklordPrison' } };
setCell(lake, LAKE_SIGN.r, LAKE_SIGN.c, TILE.SIGN);
lake.signData = {
	[`${LAKE_SIGN.r},${LAKE_SIGN.c}`]: {
		name: '湖の岩の標',
		lines: [
			'【南湖の孤島】',
			'湖の 北に 黒き 岩の 島が ひとつ。橋は 無い。',
			'空を 舞う者だけが 水を 越えて 降り立てる。',
			'岩の 裂け目は 牢の 口。古き 王が 岩に 縫い留められている。',
		],
	},
};
lake.comment = (lake.comment ?? '')
	+ `[field ${LAKE}] 南湖＝湖の水面 row 1 / cols 1-4 を黒い岩の岩礁に塗り替え、`
	+ `岩牢の口 (${PRISON_DOOR.r},${PRISON_DOOR.c}) を置いた（0o-2 (c)・2026-09-05。`
	+ '入口が全部 field 8,1 に並んでいたのを分散させた）。橋は架けない＝四方が水∴'
	+ '翼の羽衣で水を越えるしか降り立てない（入場ゲートは地形そのもの＝虚空の祠と同型）。'
	+ `下地は岩肌 \`c\`＝青一色の湖に黒く見える。標 (${LAKE_SIGN.r},${LAKE_SIGN.c}) は`
	+ '十字路の北の行き止まり（葉セル）＝看板は通行不可だが経路を切らない。'
	+ '⚠️ 岩礁は **1行（row 1）だけ**にする＝row 2 まで陸にすると 橋 row 4 →水 row 3 →陸 row 2 が'
	+ '「水1枚の両岸が陸」になって**はしご（D5）で渡れてしまう**（羽衣ゲートが消える）。'
	+ '⚠️ 岩礁を橋や陸で繋いではいけない＝繋いだ瞬間に羽衣ゲートが消える。';

// ── ③ 虚空の淵（field 6,0）＝裂け目の向こう岸の岩棚 ────────────────
rift.tiles[1] = [...'MMMMM..MMMMM'];   // 崖の奥の窪み（縦2セルの足場にする）
rift.tiles[2] = [...'MMMM..>.MMMM'];
for (const c of [5, 6]) setBg(rift, 1, c, TILE.ASH);
for (const c of [4, 5, 6, 7]) setBg(rift, 2, c, TILE.ASH);
rift.mapEnters = { [`${LAIR_DOOR.r},${LAIR_DOOR.c}`]: { id: 'fieldToWarlordLair', destId: 'warlordLair' } };
rift.signData['8,3'].lines = [
	...rift.signData['8,3'].lines,
	'裂け目の 向こう岸、崖の 岩肌に 洞が ひとつ 空いている。',
	'魔将が 棲み 伝説の 鎧を 抱えて 眠る。',
];
rift.comment = (rift.comment ?? '')
	+ `[field ${RIFT}] 虚空の淵＝row 3 の虚空8枚の**向こう岸**（北の崖 \`####\`）を彫って`
	+ `岩棚 (2,4)-(2,7) ＋崖奥の窪み (1,5)/(1,6) と魔将の巣の口 (${LAIR_DOOR.r},${LAIR_DOOR.c}) にした`
	+ '（0o-2 (c)・2026-09-05）。岩棚の北は窪みの先が山 `M`・東西は山・南は虚空∴'
	+ '翼の羽衣で裂け目を越えるしか岩棚に立てない（山と壁は飛んでも越えられない＝'
	+ '`game/passable.js` FLYABLE_OVER に無い）。下地は岩肌 `c`＝崖の棚に見える。'
	+ '伝承碑 (8,3) に魔将の2行を足した（field 8,1 の石碑から移した）。'
	+ '⚠️ row 3 の虚空を埋めてはいけない＝埋めた瞬間に羽衣ゲートが消える。';

// ── 寄道側の部屋コメント（入口の所在が書いてある）────────────────────
const fixComment = (layer, from, to) => {
	const st = map.layers[layer]?.stages?.['0,0'];
	if (!st?.comment?.includes(from)) die(`${layer} 0,0 のコメントに「${from}」が無い（記述が動いた）`);
	st.comment = st.comment.replace(from, to);
};
fixComment('warlord_lair', `空島（field ${SKY_ISLAND}）の扉 (8,9)`,
	`虚空の淵（field ${RIFT}）の裂け目の向こう岸の扉 (${LAIR_DOOR.r},${LAIR_DOOR.c})`);
map.layers.warlord_lair.stages['0,0'].comment +=
	` ⚠️ 0o-2 (c)（2026-09-05）で入口を空島（field ${SKY_ISLAND} 8,9）から`
	+ `虚空の淵（field ${RIFT} ${LAIR_DOOR.r},${LAIR_DOOR.c}）へ移した＝寄道の入口を分散させた。`
	+ '扉の対応は id（fieldToWarlordLair）で解決される∴この部屋の幾何は1セルも動かしていない。';
fixComment('darklord_prison', `空島（field ${SKY_ISLAND}）の虚空に浮く岩の 扉 (5,6)`,
	`南湖（field ${LAKE}）の孤島の 扉 (${PRISON_DOOR.r},${PRISON_DOOR.c})`);
fixComment('darklord_prison', '翼の羽衣で虚空を飛ばないと浮岩に立てない',
	'翼の羽衣で湖の水面を飛ばないと孤島に立てない');
map.layers.darklord_prison.stages['0,0'].comment +=
	` ⚠️ 0o-2 (c)（2026-09-05）で入口を空島（field ${SKY_ISLAND} 5,6）から`
	+ `南湖の孤島（field ${LAKE} ${PRISON_DOOR.r},${PRISON_DOOR.c}）へ移した＝寄道の入口を分散させた。`
	+ '扉の対応は id（fieldToDarklordPrison）で解決される∴この部屋の幾何は1セルも動かしていない。';

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));

// ── 自己検証（書いた JSON をもう一度読む）──────────────────────
const back = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const BF = back.layers.field.stages;
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

// 空島＝扉3枚・虚空が戻っている・石碑から魔将/魔王が消えて祠の案内は残る
const b1 = BF[SKY_ISLAND];
ok(Object.keys(b1.mapEnters).sort().join(' ') === '3,2 3,9 6,9',
	`空島の扉が3枚（3,2 3,9 6,9）でない: ${Object.keys(b1.mapEnters).sort().join(' ')}`);
ok(rowStr(b1, 4) === 'M...%%%%...M', `空島 row4 が虚空に戻っていない: ${rowStr(b1, 4)}`);
ok(rowStr(b1, 5) === 'M...%%%%...M', `空島 row5 が虚空に戻っていない: ${rowStr(b1, 5)}`);
ok(rowStr(b1, 8) === 'M...%%%%...M', `空島 row8 の扉跡が床に戻っていない: ${rowStr(b1, 8)}`);
const bStele = b1.signData['7,2'].lines.join('\n');
ok(!/魔将|魔王|黒い岩/.test(bStele), '空島の石碑に魔将/魔王の記述が残っている');
ok(bStele.includes('もう一つの扉'), '空島の石碑から虚空の祠の案内が消えた（tests/void-shrine.spec.js が読む）');

// 南湖＝孤島は徒歩では届かず、飛べば届く
const b2 = BF[LAKE];
ok(b2.tiles[PRISON_DOOR.r][PRISON_DOOR.c] === TILE.MAP_ENTER, '南湖の扉タイルが `>` でない');
ok(b2.mapEnters[`${PRISON_DOOR.r},${PRISON_DOOR.c}`]?.id === 'fieldToDarklordPrison', '南湖の扉の id が違う');
ok(b2.tiles[LAKE_SIGN.r][LAKE_SIGN.c] === TILE.SIGN, '南湖の標タイルが `i` でない');
ok(b2.signData[`${LAKE_SIGN.r},${LAKE_SIGN.c}`]?.lines?.length > 0, '南湖の標が無言看板');
ok(ISLAND.every(([r, c]) => b2.bgTiles[`${r},${c}`] === TILE.ASH), '南湖の孤島の下地が岩肌でない');
const lakeStart = { r: 5, c: 5 };     // 中央の十字路（陸／橋）
const lakeFoot = reach(b2, lakeStart, { flying: false });
const lakeFly = reach(b2, lakeStart, { flying: true });
const lakeLadder = reach(b2, lakeStart, { ladder: true });
ok(!lakeFoot.has(PRISON_DOOR.r, PRISON_DOOR.c), '南湖の孤島に徒歩で届いてしまう（羽衣ゲートが無い）');
ok(!lakeLadder.has(PRISON_DOOR.r, PRISON_DOOR.c),
	'南湖の孤島に**はしご**で渡れてしまう（水1枚の両岸が陸＝D5 の時点でゲートが消える）');
ok(lakeFly.has(PRISON_DOOR.r, PRISON_DOOR.c), '南湖の孤島に飛んでも届かない（詰み）');
ok(ISLAND.filter(([r, c]) => b2.tiles[r][c] === TILE.FLOOR).length >= 2,
	'孤島の足場が1枚しかない（戻ってきた瞬間に扉へ吸い込まれ続ける）');
ok(!lakeFoot.has(LAKE_SIGN.r, LAKE_SIGN.c), '標のセルが歩ける（看板は通行不可のはず）');
ok(lakeFoot.has(4, 6), '南湖の十字路が徒歩で繋がっていない（前提が崩れた）');

// 虚空の淵＝岩棚は徒歩では届かず、飛べば届く
const b3 = BF[RIFT];
ok(rowStr(b3, 1) === 'MMMMM..MMMMM', `虚空の淵 row1 が窪みになっていない: ${rowStr(b3, 1)}`);
ok(rowStr(b3, 2) === 'MMMM..>.MMMM', `虚空の淵 row2 が岩棚になっていない: ${rowStr(b3, 2)}`);
ok(rowStr(b3, 3) === 'MM%%%%%%%%MM', '虚空の淵 row3 の虚空が埋まった');
ok(b3.mapEnters[`${LAIR_DOOR.r},${LAIR_DOOR.c}`]?.id === 'fieldToWarlordLair', '虚空の淵の扉の id が違う');
ok([4, 5, 6, 7].every((c) => b3.bgTiles[`2,${c}`] === TILE.ASH), '虚空の淵の岩棚の下地が岩肌でない');
ok(b3.signData['8,3'].lines.some((l) => l.includes('魔将')), '伝承碑が魔将に触れていない');
const riftStart = { r: 4, c: 0 };     // 裂け目の南岸
const riftFoot = reach(b3, riftStart, { flying: false });
const riftFly = reach(b3, riftStart, { flying: true });
const riftLadder = reach(b3, riftStart, { ladder: true });
ok(!riftFoot.has(LAIR_DOOR.r, LAIR_DOOR.c), '岩棚に徒歩で届いてしまう（羽衣ゲートが無い）');
// 裂け目は虚空 `%`＝はしごが架かるのは水/穴だけ（LADDER_OVER）∴今は自明だが、
// 後で虚空を水や穴に置き換えたら 1枚渡りが生まれる∴ここも歯にしておく。
ok(!riftLadder.has(LAIR_DOOR.r, LAIR_DOOR.c), '岩棚に**はしご**で渡れてしまう（裂け目が水/穴になった？）');
ok(riftFly.has(LAIR_DOOR.r, LAIR_DOOR.c), '岩棚に飛んでも届かない（詰み）');

// 世界全体＝入口 id は各1枚だけ（座標ではなく id で解決される）
const seen = new Map();
for (const [lk, layer] of Object.entries(back.layers)) {
	for (const [sk, st] of Object.entries(layer.stages ?? {})) {
		for (const [pos, e] of Object.entries(st.mapEnters ?? {})) {
			if (!e?.id) continue;
			seen.set(e.id, [...(seen.get(e.id) ?? []), `${lk}/${sk}@${pos}`]);
		}
	}
}
for (const id of ['fieldToDarklordPrison', 'darklordPrison', 'fieldToWarlordLair', 'warlordLair', 'fieldToVoidShrine']) {
	ok(seen.get(id)?.length === 1, `入口 id ${id} が1枚でない: ${(seen.get(id) ?? []).join(' ')}`);
}
ok(seen.get('fieldToDarklordPrison')?.[0] === `field/${LAKE}@${PRISON_DOOR.r},${PRISON_DOOR.c}`,
	`岩牢の入口が南湖に無い: ${seen.get('fieldToDarklordPrison')}`);
ok(seen.get('fieldToWarlordLair')?.[0] === `field/${RIFT}@${LAIR_DOOR.r},${LAIR_DOOR.c}`,
	`魔将の巣の入口が虚空の淵に無い: ${seen.get('fieldToWarlordLair')}`);

if (problems.length) {
	console.error('✗ 自己検証で問題を検出（マップは書き換わっている＝git で戻せる）:');
	problems.forEach((p) => console.error(`   - ${p}`));
	process.exit(1);
}

console.log('✓ 寄道の入口を分散させた');
console.log(`   field ${SKY_ISLAND} 空島     … 扉3枚（塔への戻り 3,2／塔の入口 3,9／虚空の祠 6,9）＝浮岩と扉跡を虚空へ戻した`);
console.log(`   field ${LAKE} 南湖     … 黒い岩の岩礁（row 1 / cols 1-4）＋岩牢の口 ${PRISON_DOOR.r},${PRISON_DOOR.c}`
	+ `＋標 ${LAKE_SIGN.r},${LAKE_SIGN.c}（徒歩✗／はしご✗／飛行✓）`);
console.log(`   field ${RIFT} 虚空の淵 … 裂け目の向こう岸の岩棚（2,4-2,7）＋魔将の巣の口 ${LAIR_DOOR.r},${LAIR_DOOR.c}`
	+ '（徒歩✗／飛行✓）＋伝承碑に魔将の2行');
