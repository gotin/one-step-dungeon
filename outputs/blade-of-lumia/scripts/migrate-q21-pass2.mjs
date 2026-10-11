#!/usr/bin/env node
// 実行キュー21 第2パス（2026-10-11）: 通しプレイで見つかったデータ側の不具合をまとめて直す。
//
// 直すこと:
//   F5  防具の宝箱の `name` がティア表の名前と食い違う（D1 [3,0] は「革の鎧」と書いてあるのに
//       実際に出るのは「布の服」）。ゲームは剣・防具・盾の宝箱で `name` を読まず
//       ARMOR_TIERS[armorTier].name を出す（game/player.js grantReward）∴データ側を表に揃える。
//       エディタとデータを読む人だけが誤った名前を見ていた。
//   F8  入口 '>' の着地マスのすぐ隣（斜めを含む・距離 1.5 以内）に敵が居て、着いた瞬間に被弾する。
//       全層を走査して3件（field [2,15]・dungeon_3 [1,3]・dark_tower [0,1]）。敵を最小限だけ動かす。
//   F10 ロウソク（D4 [1,2] の道具部屋の報酬）が field [9,9] の条件なしの宝箱で先に手に入る
//       （ユーザー判定 2026-10-11「D4 だけに残す」）。field 側の中身をルピー×20 に替える。
//       前例＝[9,9] の店からブーメランを外した判断（DECISIONS 2026-09-30）。
//   F2  冒頭の老賢者の話（目的＝星の欠片8つ）は、向いて攻撃キーで話しかけないと出なかった
//       （ユーザー案 2026-10-11「開始直後に老賢者が話しかけてくる。その会話で話し方を伝える」）。
//       老賢者の会話に `introLines`（「はじめから」の直後だけ通常の台詞の後に足す行）を持たせる。
//
// 冪等（何度流しても同じ結果）・事前条件つき（想定と違う現物なら例外＝黙って上書きしない）・
// 自己検証（書いた後に読み直して assert）。書き出しは JSON.stringify(map, null, 2)。
// 実行は outputs/blade-of-lumia/ から:
//   node scripts/migrate-q21-pass2.mjs

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ARMOR_TIERS } from '../shared/items.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH ?? join(__dir, '../work/blade-of-lumia.json');

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const changes = [];
const stage = (layer, key) => {
	const st = data.layers[layer]?.stages?.[key];
	if (!st) throw new Error(`${layer} [${key}] が無い`);
	return st;
};

// ── F5: 防具の宝箱の名前をティア表に揃える ─────────────────────────────
for (const [lk, layer] of Object.entries(data.layers)) {
	for (const [sk, st] of Object.entries(layer.stages ?? {})) {
		for (const [cell, c] of Object.entries(st.chestContents ?? {})) {
			if (c.type !== 'armor') continue;
			const want = ARMOR_TIERS[c.armorTier ?? 0]?.name;
			if (!want) throw new Error(`${lk} [${sk}] (${cell}) armorTier ${c.armorTier} が表に無い`);
			if (c.name === want) continue;
			changes.push(`F5 ${lk} [${sk}] (${cell}) 防具名 "${c.name}" → "${want}"`);
			c.name = want;
		}
	}
}

// ── F8: 入口の着地マスの隣の敵を動かす ─────────────────────────────────
// [層, 部屋, 敵の文字, 元の位置, 移設先, 理由]
const MOVES = [
	['field', '2,15', 'E', [4, 5], [2, 5], '入口 (5,5) の真上＝着地と同時に被弾していた。列柱の内側のまま北へ2マス'],
	['dungeon_3', '1,3', 'η', [6, 3], [6, 4], '入口 (7,2) の斜め隣。もう1体の術士 (2,8) との対角（南西の隅寄り）を保ったまま東へ1マス'],
	['dark_tower', '0,1', 'ζ', [2, 4], [2, 3], '上り階段 (1,5) の斜め隣。もう1体の ζ (2,7) と階段を挟んで左右対称にする'],
];
for (const [lk, sk, ch, [fr, fc], [tr, tc], why] of MOVES) {
	const st = stage(lk, sk);
	if (st.tiles[tr][tc] === ch && st.tiles[fr][fc] !== ch) continue; // 適用済み
	if (st.tiles[fr][fc] !== ch) throw new Error(`${lk} [${sk}] (${fr},${fc}) が '${ch}' でない: '${st.tiles[fr][fc]}'`);
	if (st.tiles[tr][tc] !== '.') throw new Error(`${lk} [${sk}] 移設先 (${tr},${tc}) が床でない: '${st.tiles[tr][tc]}'`);
	st.tiles[tr][tc] = ch;
	st.tiles[fr][fc] = '.';
	const dirs = st.enemyDirs;
	if (dirs?.[`${fr},${fc}`]) {
		dirs[`${tr},${tc}`] = dirs[`${fr},${fc}`];
		delete dirs[`${fr},${fc}`];
	}
	changes.push(`F8 ${lk} [${sk}] '${ch}' (${fr},${fc}) → (${tr},${tc})：${why}`);
}

// ── F10: field [9,9] の宝箱のロウソクをルピーに替える ─────────────────────
{
	const st = stage('field', '9,9');
	const c = st.chestContents?.['2,6'];
	const RUPEE = { type: 'rupee', value: 20, name: 'ルピー×20' };
	if (!c) throw new Error('field [9,9] (2,6) に宝箱の中身が無い');
	if (c.type === 'item' && c.item === 'candle') {
		st.chestContents['2,6'] = RUPEE;
		changes.push('F10 field [9,9] (2,6) ロウソク → ルピー×20');
	} else if (!(c.type === 'rupee' && c.value === 20)) {
		throw new Error(`field [9,9] (2,6) が想定外の中身: ${JSON.stringify(c)}`);
	}
}

// ── F2: 老賢者に「はじめから」の時だけ足す行（話し方の案内）を持たせる ─────────
// ゲームは新規開始の直後に、開始画面で introLines を持つ人の会話を自動で開く（game.js openIntroDialog）。
const INTRO_LINES = [
	'人と話すときは、その者の方を向いて 攻撃ボタンを押すのじゃ。看板や石碑も 同じようにして読める。',
	'迷ったときは、いつでも わしに話しかけるがよい。',
];
{
	const sp = data.startPos;
	const st = stage(sp.layer, sp.stage);
	const hits = Object.entries(st.npcData ?? {}).filter(([, e]) => e?.name === '老賢者');
	if (hits.length !== 1) throw new Error(`開始画面 ${sp.layer} [${sp.stage}] の老賢者が ${hits.length} 人`);
	const [pk, sage] = hits[0];
	if (JSON.stringify(sage.introLines) !== JSON.stringify(INTRO_LINES)) {
		if (sage.introLines !== undefined) throw new Error(`老賢者 (${pk}) に別の introLines がある: ${JSON.stringify(sage.introLines)}`);
		sage.introLines = INTRO_LINES;
		changes.push(`F2 ${sp.layer} [${sp.stage}] (${pk}) 老賢者に introLines ${INTRO_LINES.length} 行`);
	}
}

if (changes.length) writeFileSync(MAP_PATH, JSON.stringify(data, null, 2) + '\n');
console.log(changes.length ? changes.join('\n') : '変更なし（適用済み）');

// ── 自己検証 ─────────────────────────────────────────────────────────
const after = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
for (const layer of Object.values(after.layers)) {
	for (const st of Object.values(layer.stages ?? {})) {
		for (const c of Object.values(st.chestContents ?? {})) {
			if (c.type === 'armor' && c.name !== ARMOR_TIERS[c.armorTier ?? 0].name) throw new Error('F5 検証失敗');
		}
	}
}
for (const [lk, sk, ch, , [tr, tc]] of MOVES) {
	if (after.layers[lk].stages[sk].tiles[tr][tc] !== ch) throw new Error(`F8 検証失敗 ${lk} [${sk}]`);
}
const candles = [];
for (const [lk, layer] of Object.entries(after.layers)) {
	if (lk === 'test_mechanics') continue;
	for (const [sk, st] of Object.entries(layer.stages ?? {})) {
		for (const c of Object.values(st.chestContents ?? {})) if (c.item === 'candle') candles.push(`${lk} [${sk}]`);
	}
}
if (candles.length !== 1 || candles[0] !== 'dungeon_4 [1,2]') throw new Error(`F10 検証失敗: ${candles.join(', ')}`);
{
	const sp = after.startPos;
	const intro = Object.values(after.layers[sp.layer].stages[sp.stage].npcData).filter((e) => e?.introLines);
	if (intro.length !== 1 || intro[0].name !== '老賢者') throw new Error('F2 検証失敗');
}
console.log('自己検証 OK');
