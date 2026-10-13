#!/usr/bin/env node
/**
 * migrate-dialog-directions.mjs（実行キュー56・2026-10-13）
 *
 * 台詞の方角を実際の位置に合わせる。発端＝ユーザーのプレイメモ（field 3,11）
 * 「二つ目のダンジョンが意外にわからない。南西と言われて彷徨った」。
 * 村 7,14 から砂漠の神殿（field 2,15）は西に5画面・南に1画面＝ほぼ真西なのに、
 * 老賢者・村人タロ・D1 の石碑が「南西」と言っていた。
 *
 * 測り方＝話し手のセルから目的地の入口セルへの向き（1画面 12×10 セルで換算）を
 * 8方位（各 45°）に丸める。**境目から 10° 以内の食い違いは直さない**（どちらとも読める）。
 * 「北へ抜け、東へ」のような道順の文は方角でなく道順∴対象外。
 *
 *   話し手                    目的地        旧      新     実際の向き
 *   村 7,14（老賢者・タロ）   砂漠の神殿    南西 → 西     西から南へ 11°
 *   〃                        水の迷宮      東   → 北東   北から東へ 29°
 *   〃                        森の聖域      西   → 北西   北から西へ 31°
 *   〃                        沼地の神殿    南東 → 東     ほぼ真東
 *   D1 の石碑 6,13 (7,8)      砂漠の神殿    南西 → 西     西から南へ 19°
 *   町 13,5 賢者エルン        沼地の神殿    南東 → 南     南から西へ 21°
 *
 * 自己検証：置換はセルごとに「その文字列がちょうど1回ある」ことを確かめてから行う。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const f = map.layers.field.stages;

// [画面, セル, 名前, [旧, 新] の並び]
const FIXES = [
	['7,14', '3,3', '老賢者', [
		['次は南西の砂漠じゃ。', '次は西の砂漠じゃ。'],
		['次は東の湖じゃ。', '次は北東の湖じゃ。'],
		['次は西の森じゃ。', '次は北西の森じゃ。'],
		['次は南東の沼じゃ。', '次は東の沼じゃ。'],
	]],
	['7,14', '3,5', '村人 タロ', [
		['南西の砂漠に神殿があり', '西の砂漠に神殿があり'],
		['西の森の奥には', '北西の森の奥には'],
		['次は南西の砂漠だってよ。', '次は西の砂漠だってよ。'],
		['東の湖の水の迷宮が次らしいぞ。', '北東の湖の水の迷宮が次らしいぞ。'],
		['西の森に次の欠片があるって聞いたぞ。', '北西の森に次の欠片があるって聞いたぞ。'],
		['今度は南東の沼地らしいぞ。', '今度は東の沼地らしいぞ。'],
	]],
	['6,13', '7,8', '石碑', [
		['次は南西の砂漠へ。', '次は西の砂漠へ。'],
	]],
	['13,5', '4,5', '賢者 エルン', [
		['次は南東の沼じゃ。', '次は南の沼じゃ。'],
	]],
];

/** 会話データ（lines と linesAfterBoss の各版）の中の文字列をすべて並べる。 */
function* allLines(npc) {
	for (const [i, t] of (npc.lines ?? []).entries()) yield [npc.lines, i, t];
	for (const arr of Object.values(npc.linesAfterBoss ?? {})) {
		if (Array.isArray(arr)) for (const [i, t] of arr.entries()) yield [arr, i, t];
	}
}

let n = 0;
for (const [stage, cell, name, pairs] of FIXES) {
	const npc = f[stage]?.npcData?.[cell];
	if (npc?.name !== name) throw new Error(`${stage} (${cell}) は「${name}」のはず（実際: ${npc?.name}）`);
	for (const [from, to] of pairs) {
		const hits = [...allLines(npc)].filter(([, , t]) => t.includes(from));
		if (hits.length !== 1) throw new Error(`${name}：「${from}」が ${hits.length} 回（1回のはず）`);
		const [arr, i, t] = hits[0];
		arr[i] = t.replace(from, to);
		n++;
	}
}

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');
console.log(`方角を ${n} か所直しました`);
