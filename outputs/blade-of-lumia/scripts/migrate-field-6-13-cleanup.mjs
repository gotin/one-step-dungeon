#!/usr/bin/env node
/**
 * migrate-field-6-13-cleanup.mjs（実行キュー56・2026-10-13）
 *
 * field 6,13（草原の洞窟＝D1 の入口）は昔の実験画面で、意味の無い仕掛けが残っていた。
 * ユーザーのプレイメモ「宝箱いらない／鍵、ドアもいらない／左側の爆弾で開く壁もいらなさそう／
 * ブーメランについて語るNPCもいらない」と、その後の判断（立て看板も消す・左の壁は開ける・
 * 床のハートの器は草陰の祠へ移す）に従って片づける。
 *
 *   消す   ＝宝箱 B×3（中身ごと）・柵 f×4 と鍵 K・扉 D・扉の石碑 †(4,8)・冒険者 a(3,2)・
 *            立て看板 i(1,2)・北の壁 #(1,3) と壊せる壁 !(1,4)・床のハートの器 9(8,3)
 *   開ける ＝西端の壊せる壁 !(6,0)(7,0)→床（5,13 の東端は元から床＝爆弾なしで行き来できる）
 *   直す   ＝村人ハナの台詞から「柵の中の鍵と、ひびの入った壁」を除く
 *   残す   ＝D1 の入口・D1 の石碑 †(7,8)・茂み u と草陰の祠の入口・巡回兵 E・床のルピー r
 *
 * 床の器の絵の見本は検証ステージ test_mechanics 3,0 (8,3) に置く（下の注記）。
 * 床のハートの器は草陰の祠のパズル部屋へ移す（別スクリプト）＝このスクリプトだけを流すと
 * 一時的に器が1つ減る点に注意。
 *
 * 自己検証：消す前に各セルの文字が想定どおりかを assert（違えば何も書かない）。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const s = map.layers.field?.stages?.['6,13'];
if (!s) throw new Error('field/6,13 が見つからない');

const at = (r, c) => s.tiles[r][c];
const EXPECT = {
	'1,5': 'B', '2,5': 'B', '6,8': 'B',
	'1,8': 'f', '2,7': 'f', '2,9': 'f', '3,8': 'f', '2,8': 'K',
	'5,8': 'D', '4,8': '†', '3,2': 'a', '1,2': 'i',
	'1,3': '#', '1,4': '!', '6,0': '!', '7,0': '!', '8,3': '9',
	// 残すもの（念のため）
	'7,8': '†', '8,8': '>', '6,10': 'u', '6,11': '>', '5,7': 'a',
};
for (const [k, ch] of Object.entries(EXPECT)) {
	const [r, c] = k.split(',').map(Number);
	if (at(r, c) !== ch) throw new Error(`(${k}) は '${ch}' のはず（実際: '${at(r, c)}'）`);
}

// ── タイル：消すセルを床に ──
const CLEAR = Object.keys(EXPECT).filter((k) => !['7,8', '8,8', '6,10', '6,11', '5,7'].includes(k));
for (const k of CLEAR) {
	const [r, c] = k.split(',').map(Number);
	s.tiles[r][c] = '.';
}

// ── 付随データ ──
s.chestContents = {};
s.breakableWalls = {};
for (const k of ['4,8', '1,2', '3,2']) {
	if (!s.npcData[k]) throw new Error(`npcData ${k} が無い`);
	delete s.npcData[k];
}
const hana = s.npcData['5,7'];
if (hana?.name !== '村人 ハナ') throw new Error('村人ハナが (5,7) にいない');
const OLD_HANA = '柵の中の鍵と、ひびの入った壁……わたしには手が出せないよ。';
if (!hana.lines.includes(OLD_HANA)) throw new Error('ハナの台詞が想定外');
hana.lines = [
	'ここは村の北西、草原の窪みだよ。',
	'そこの黒い口が 草原の洞窟。魔物がいるって、みんな近づかない。',
	'行くなら、剣を しっかり握っていってね。',
];

// 床置きのハートの器（タイル '9'）は field 6,13 の (8,3) が実マップで唯一の1枚だった＝消すと
// 「床の器の絵」を確かめる番人（tests/obj-dot32-items.spec.js ⑨）の的が無くなる。
// エンジンは '9' を描けるまま∴旧 6,13 と同じ配置を持つ検証ステージ test_mechanics 3,0 の同じセルに見本を置く。
const tm = map.layers.test_mechanics?.stages?.['3,0'];
if (tm?.tiles?.[8]?.[3] !== '.') throw new Error('test_mechanics 3,0 (8,3) が床でない');
tm.tiles[8][3] = '9';

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');
console.log('field 6,13 を片づけました：', CLEAR.length, 'セル');
