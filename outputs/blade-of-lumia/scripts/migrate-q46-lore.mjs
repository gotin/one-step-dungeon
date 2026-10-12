#!/usr/bin/env node
// キュー46: ザーネルの記憶（其の一〜八）と老賢者の語りを、物語の筋が通るように書き直す。
//
// ユーザー判定（2026-10-12・PLAN キュー46）：
//   ① 女王は「ザーネルに欺かれて海の底に沈められ、そこで呪いにより石になって眠っている」
//   ② ザーネルの動機は「失うことへの恐れ」（病で民を救えず、死を覆す力を求めた）
//   ③ 下の文面で OK　④ 表記は漢字まじり＋文節ごとの空白に揃える
//
// 筋（時系列）：平和 → 失う恐れ → 女王を欺いて海に沈める（深みで石になる）→ 死を覆す儀式で
// 心を焼かれる → 守護獣を魔物に変え欠片を封じる → 北の空の塔に籠る／女王は沈む前に
// 「光の剣を継ぐ者」を祈った → 塔で失った者の名を数え続ける → 終章（据え置き）。
// ダンジョンは順不同で回れる∴碑は「何個目の欠片」「最後の欠片」を言わない。碑はボス部屋に
// あり倒した後に読む∴「〜を倒せ」「弓を手に」のような戦う前の語り口を使わない。
//
// 何度流しても同じ結果になる（差し替え先と同じなら何もしない／想定外の現行文なら止まる）。
// Run from: outputs/blade-of-lumia/
//   node scripts/migrate-q46-lore.mjs

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const L = data.layers;

const TABLETS = [
	['dungeon_1', '0,0', '1,9', 'ザーネルの記憶 其の一', [
		'むかし この国に ルミアという',
		'民に 慕われる 女王が いた。',
		'宮廷の 賢者 ザーネルと 力を 分かち合い',
		'この 地を 守って いた。',
	]],
	['dungeon_2', '0,0', '1,1', 'ザーネルの記憶 其の二', [
		'ザーネルは 失うことを 恐れた。',
		'二度と 誰も 死なせぬ 力を 求め、',
		'それを 止める 女王と',
		'次第に 道を 違えて いった。',
	]],
	['dungeon_3', '0,0', '1,9', 'ザーネルの記憶 其の三', [
		'ザーネルは 女王を 欺き 力を 奪い、',
		'ルミアを 遠い 海の 底へ 沈めた。',
		'呪いを 受けた 女王は 深みで 石と なり、',
		'今も 眠り 続けて いる。',
	]],
	['dungeon_4', '0,0', '1,5', 'ザーネルの記憶 其の四', [
		'止める 声は もう 無かった。',
		'彼は 死を 覆す ため 星の欠片の 力を 求めた。',
		'禁断の 儀式は 暴走し 全てを 焼き、',
		'炎の 中で 人の 心も 灼き 尽くされた。',
	]],
	['dungeon_6', '0,0', '1,5', 'ザーネルの記憶 其の五', [
		'心を 失った 彼は',
		'国の 守護獣を 魔物へ 変え、',
		'八つの 星の欠片を 神殿の 奥に 封じた。',
		'光に 満ちた 国は 魔物の 巣と なった。',
	]],
	['dungeon_5', '0,0', '1,5', 'ザーネルの記憶 其の六', [
		'女王の いない 国に',
		'彼を 止める 者は もう いなかった。',
		'ザーネルは 北の 空に 黒き 塔を 築き、',
		'誰も 届かぬ 高みに 独り 籠った。',
	]],
	['dungeon_8', '0,0', '1,5', 'ザーネルの記憶 其の七', [
		'沈む 前に 女王は 祈った。',
		'八つの 欠片が 再び 集う 日、',
		'光の 剣を 継ぐ 者が',
		'空への 道を 開くように と。',
	]],
	['dungeon_7', '0,0', '1,5', 'ザーネルの記憶 其の八', [
		'塔の 上で ザーネルは 今も 数えて いる。',
		'病で 失った 者たちの 名を。',
		'数え 終える 日は 来ない。',
	]],
];

for (const [layer, stage, key, name, lines] of TABLETS) {
	const sd = L[layer]?.stages?.[stage]?.signData?.[key];
	if (!sd) throw new Error(`碑が見つからない: ${layer}/${stage}[${key}]`);
	if (sd.name !== name) throw new Error(`碑の名前が想定外: ${layer}/${stage}[${key}] = ${sd.name}`);
	sd.lines = lines;
}

// 文字列の置き換え（現行文 → 新文）。新文が既に入っていれば何もしない。
function replaceLine(arr, from, to, where) {
	if (arr.includes(to)) return;
	const i = arr.indexOf(from);
	if (i < 0) throw new Error(`想定の行が無い: ${where}: ${from}`);
	arr[i] = to;
}

// ── 老賢者（field 7,14 の (3,3)）────────────────────────────────────────────
const sage = L.field.stages['7,14'].npcData['3,3'];
if (sage.name !== '老賢者') throw new Error(`老賢者の位置が想定外: ${sage.name}`);
{
	const OLD = 'この国の女王ルミアは、闇の魔術師ザーネルの呪いを受け……石に変えられてしまったのじゃ。';
	const NEW1 = 'この国の女王ルミアは、闇の魔術師ザーネルに欺かれ、海の底へ沈められた。';
	const NEW2 = '呪いで石に変えられ、今も深みで眠っておられる。';
	if (!sage.lines.includes(NEW1)) {
		const i = sage.lines.indexOf(OLD);
		if (i < 0) throw new Error('老賢者の女王の行が無い');
		sage.lines.splice(i, 1, NEW1, NEW2);
	}
	const A = sage.linesAfterBoss;
	replaceLine(A.G, '次は南西の砂漠じゃ。砂漠の神殿に二つ目の欠片が眠る。', '次は南西の砂漠じゃ。砂漠の神殿に欠片が眠る。', '老賢者 G');
	replaceLine(A.N, '次は東の湖じゃ。水の迷宮に三つ目の欠片がある。', '次は東の湖じゃ。水の迷宮に欠片がある。', '老賢者 N');
	replaceLine(A.J, '次は北東の火山じゃ。炎の神殿に四つ目の欠片が封じられておる。', '次は北東の火山じゃ。炎の神殿に欠片が封じられておる。', '老賢者 J');
	replaceLine(A.A, '次は西の森じゃ。森の聖域に五つ目の欠片が眠る。', '次は西の森じゃ。森の聖域に欠片が眠る。', '老賢者 A');
	replaceLine(A.O, '次は北東の雪原じゃ。氷の廃墟に六つ目の欠片がある。', '次は北東の雪原じゃ。氷の廃墟に欠片がある。', '老賢者 O');
	replaceLine(A.L, '次は南東の沼じゃ。沼地の神殿に七つ目の欠片が眠る。', '次は南東の沼じゃ。沼地の神殿に欠片が眠る。', '老賢者 L');
	replaceLine(A.I, '残る欠片は空の彼方じゃ。笛を吹けば雲上への道が開く。', '空の彼方にも欠片がある。笛を吹けば雲上への道が開く。', '老賢者 I');
	replaceLine(A.I, '空中の遺跡に最後の欠片が……嵐の鷲王が守っておる。', '空中の遺跡の欠片は……嵐の鷲王が守っておる。', '老賢者 I');
	replaceLine(A.U, '全ての欠片が揃った！残るは石の台に捧げることじゃ。', '空の欠片も手にしたか。8つ揃ったら、石の台に捧げるのじゃ。', '老賢者 U');
}

// ── 賢者エルン（field 13,5 の (4,5)）────────────────────────────────────────
const ern = L.field.stages['13,5'].npcData['4,5'];
if (ern.name !== '賢者 エルン') throw new Error(`エルンの位置が想定外: ${ern.name}`);
replaceLine(ern.linesAfterBoss.O, '次は 北東の 雪原じゃ。氷の 廃墟に 六つ目の 欠片が ある。', '次は 北東の 雪原じゃ。氷の 廃墟に 欠片が ある。', 'エルン O');

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2) + (readFileSync(MAP_PATH, 'utf8').endsWith('\n') ? '\n' : ''));
console.log('キュー46: 碑 8 枚・老賢者・エルンを書き直した');
