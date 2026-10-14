#!/usr/bin/env node
/**
 * migrate-field-6-13-shield-veteran.mjs（実行キュー63・2026-10-14）
 *
 * 草原の洞窟（D1）の入口の前＝field 6,13 に、盾の使い方を話す老兵を1人置く。
 * ユーザー提案（キュー59 の判定時）＝「盾をゲットしたあとで NPC で、赤い×は体当たり攻撃で
 * 盾でも守れない、それ以外は守れる、みたいな盾についての説明をしてあげられるといいかも」。
 * 話し手＝ユーザー選択「新しい人物を洞窟前に」（村人ハナはボスの版 G/after を持つ∴盾の版を
 * 足すと優先順で食い合う＝どちらかが聞けなくなる）。
 *
 * 実マップで裏取りした事実：
 *   - 木の盾＝dungeon_1 1,1 の宝箱（chestContents 3,5 shieldTier 0）＝D1 の中で手に入る。
 *   - field 6,13 (8,8) が D1 の入口 '>'、(7,8) が石碑、(6,11) が隠し洞窟の入口。
 *   - 絵＝人のタイル 'b'（茶髪の人）。同じ画面の村人ハナが 'a'＝同じ絵の人が2人並ぶのを避けた。
 *     「×」は台詞の字では小さく潰れる（headless で目視）∴本文は「バツ印」と書く。
 *   - 置き場 (8,10) は入口の東の袋小路（北 (7,10) と西 (8,9) だけが床）＝塞いでも
 *     どこへの道も切らない（(7,10)→(7,11) の東の出口は (7,10) が残るので開いたまま）。
 *
 * 台詞の版：
 *   - 基本（盾を持たない）＝盾の在処と「見せに来い」。
 *   - `item:shield`（盾を手にした後・`shared/dialog-variants.js VARIANT_EQUIP_IDS`）＝
 *     盾で防げるもの（剣・牙・飛び道具＝正面なら構えなくても防ぐ）／剣を振っている間は
 *     効かない／体当たりは防げない（赤い点滅＝予告・赤い×＝盾を貫いた印・キュー59）。
 *     事実の出所＝`game/projectile.js isShieldBlockingDir()`・`isShieldActive()`、
 *     `game/enemy-ai.js` の slam（k-7.5 決定④＝盾を通さない）。
 *
 * 冪等：既に老兵がいれば何もしない。置く前にセルが床かを確かめる（違えば何も書かない）。
 * Run from: outputs/blade-of-lumia/
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const STAGE = '6,13';
const POS = [8, 10];
const NAME = '老兵 ガルド';

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const s = map.layers.field?.stages?.[STAGE];
if (!s) throw new Error(`field/${STAGE} が見つからない`);
const posKey = POS.join(',');

if (s.npcData?.[posKey]?.name === NAME) {
	console.log('老兵は既にいる＝何もしない');
	process.exit(0);
}

const EXPECT = { '8,8': '>', '7,8': '†', '6,11': '>', [posKey]: '.', '7,10': '.', '8,9': '.' };
for (const [k, ch] of Object.entries(EXPECT)) {
	const [r, c] = k.split(',').map(Number);
	if (s.tiles[r][c] !== ch) throw new Error(`(${k}) は '${ch}' のはず（実際: '${s.tiles[r][c]}'）`);
}
if (s.npcData?.[posKey]) throw new Error(`npcData ${posKey} に既に別の会話がある`);

s.tiles[POS[0]][POS[1]] = 'b';
s.npcData = s.npcData ?? {};
s.npcData[posKey] = {
	name: NAME,
	lines: [
		'わしは むかし 城の門を 守っておった 兵じゃ。',
		'この洞窟の奥に 木の盾が 眠っておるそうな。',
		'盾を 手に入れたら、わしに 見せに来なさい。',
		'使い方を 教えてやろう。',
	],
	linesAfterBoss: {
		'item:shield': [
			'ほう、盾を 手に入れたか。よい面構えじゃ。',
			'盾は 構えずともよい。敵の方を 向いて立てば 守ってくれる。',
			'剣や 牙の一撃も、飛んでくる 矢や石も、正面なら 防げる。',
			'ただし 剣を振る間は 盾が 横を向く。守るなら 振らずに待て。',
			'気をつけよ。体ごと ぶつかってくる攻撃は 盾では 防げん。',
			'そういう敵は 赤く光ってから 突っ込んでくる。',
			'盾に 赤い バツ印が出たら、盾を 貫かれた しるしじゃ。',
			'赤く光ったら、下がるか 横へ よけるのじゃ。',
		],
	},
};

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');
console.log(`field ${STAGE} (${posKey}) に ${NAME} を置きました`);
