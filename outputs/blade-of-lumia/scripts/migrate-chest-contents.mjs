#!/usr/bin/env node
// 宝箱の中身（chestContents）の壊れた指定を、エンジンが実際に渡せる形へ直す移行スクリプト。
// （2026-09-05・ユーザー報告「サブアイテム欄に rupee という文字列が出る」の修理）
//
// 何が壊れていたか：`game/player.js grantReward()` は `type:'item'` を受けると
// `giveSubItem(content.item)` を呼ぶ。`ITEM_META` に無い id を渡すと
// `player.subItems[id] = {count:1}` という**メタの無いスロット**が出来る＝ポーズ画面が
// スプライトも名前も引けず、生の id（"rupee"）を文字で並べる。ルピーは所持金
// （`player.rupees`）であってサブアイテムではない∴宝箱の指定そのものが間違っていた。
//
// 直す形（正しい書き方は同じマップの中に既に在る＝`test_mechanics/7,0@8,10`）：
//   ルピー          … { type:'rupee', value:N, name }          ← grantReward が rupees に加算
//   大回復薬        … { type:'item', item:'bigHealPotion', … }  ← ITEM_META に在る id
//
// 対象（実測 33 件）：
//   ① item:'rupee'      22件（`amount` を持つものと、名前の「×N」しか無いものが混在）
//   ② item:'coin'        2件（`amount` あり＝大ルピー）
//   ③ item:'redPotion'   7件 / item:'healPotionL' 1件（どちらも ITEM_META に無い綴り）
//   ④ 旧形式 { items:[{type:'compass'}] } 1件（`test_mechanics/7,0@2,10`＝type が無く
//      grantReward が何も返さない＝開けても無言。同じ部屋の (8,10) と同じルピー宝箱にする。
//      コンパスは床タイル `pickDungeonItem` 専用でそもそも宝箱からは渡せない）
//   ⑤ { type:'rupee', value:'large' } 1件（`field/5,3@3,7`）＝**このスクリプトの事後検査で
//      見つかった別口の実害**。`player.rupees += 'large'` は文字列連結∴所持ルピーが
//      "12large" のような文字列に化けて HUD もセーブも壊れる。額面は 20 にした
//      （同じ廃城・廃村の一帯の宝箱が 10〜25＝field の最頻値が 20）。

import { readFileSync, writeFileSync } from 'node:fs';
import { ITEM_META } from '../shared/items.js';

const PATH = new URL('../work/blade-of-lumia.json', import.meta.url);
const map = JSON.parse(readFileSync(PATH, 'utf8'));

const BIG_POTION = { item: 'bigHealPotion', name: '回復薬（大）' };
const POTION_ALIASES = new Set(['redPotion', 'healPotionL']);
const RUPEE_ALIASES  = new Set(['rupee', 'coin']);

/** 名前（「ルピー×10」「大ルピー×50」）または amount からルピーの額面を取る。 */
function rupeeValueOf(c) {
	if (Number.isFinite(c.amount)) return c.amount;
	if (Number.isFinite(c.value) && c.value > 0) return c.value;
	const m = /[×x](\d+)/.exec(c.name ?? '');
	if (m) return parseInt(m[1], 10);
	return null;
}

// ── 前提の確認（違っていたら1バイトも書かない）──────────────────
const targets = [];      // { layer, stage, cell, before, after }
for (const [ln, ld] of Object.entries(map.layers)) {
	for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
		for (const [cell, c] of Object.entries(sd.chestContents ?? {})) {
			const where = `${ln}/${sk}@${cell}`;
			if (c.type === 'item' && RUPEE_ALIASES.has(c.item)) {
				const value = rupeeValueOf(c);
				if (!value) throw new Error(`${where}: ルピーの額面が読めない ${JSON.stringify(c)}`);
				targets.push({ ln, sk, cell, before: c, after: { type: 'rupee', value, name: c.name ?? `ルピー×${value}` } });
			} else if (c.type === 'item' && POTION_ALIASES.has(c.item)) {
				targets.push({ ln, sk, cell, before: c, after: { type: 'item', ...BIG_POTION } });
			} else if (!c.type && Array.isArray(c.items)) {
				if (where !== 'test_mechanics/7,0@2,10') throw new Error(`${where}: 想定外の旧形式 ${JSON.stringify(c)}`);
				targets.push({ ln, sk, cell, before: c, after: { type: 'rupee', value: 5, name: 'ルピー' } });
			} else if (c.type === 'rupee' && !Number.isFinite(c.value)) {
				if (where !== 'field/5,3@3,7' || c.value !== 'large') {
					throw new Error(`${where}: 想定外のルピー額面 ${JSON.stringify(c)}`);
				}
				targets.push({ ln, sk, cell, before: c, after: { type: 'rupee', value: 20, name: '大ルピー' } });
			} else if (c.type === 'item' && !ITEM_META[c.item]) {
				throw new Error(`${where}: 想定していない未知のアイテム ${JSON.stringify(c)}`);
			}
		}
	}
}
if (targets.length !== 34) throw new Error(`直す対象が 34 件でない: ${targets.length} 件`);
if (!ITEM_META[BIG_POTION.item]) throw new Error('bigHealPotion が ITEM_META に無い');

// ── 書き換え ────────────────────────────────────────────────
const chestCountBefore = countChests(map);
for (const t of targets) {
	map.layers[t.ln].stages[t.sk].chestContents[t.cell] = t.after;
}

// ── 書いた後の確認 ───────────────────────────────────────────
const KNOWN_TYPES = new Set(['item', 'weapon', 'armor', 'shield', 'boomerang', 'rupee', 'heartContainer', 'ladder']);
const bad = [];
for (const [ln, ld] of Object.entries(map.layers)) {
	for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
		for (const [cell, c] of Object.entries(sd.chestContents ?? {})) {
			if (!KNOWN_TYPES.has(c.type)) bad.push(`${ln}/${sk}@${cell} type=${c.type}`);
			else if (c.type === 'item' && (!ITEM_META[c.item] || ITEM_META[c.item].grantable === false)) {
				bad.push(`${ln}/${sk}@${cell} item=${c.item}`);
			}
			else if (c.type === 'rupee' && !(c.value > 0)) bad.push(`${ln}/${sk}@${cell} value=${c.value}`);
		}
	}
}
if (bad.length) throw new Error(`直した後もエンジンが渡せない宝箱が残っている:\n${bad.join('\n')}`);
if (countChests(map) !== chestCountBefore) throw new Error('宝箱の総数が変わった');

// 額面の合計＝意図（amount／名前の「×N」）どおりに移ったか
const wantSum = targets.filter((t) => t.after.type === 'rupee').reduce((s, t) => s + t.after.value, 0);
const gotSum  = targets.filter((t) => t.after.type === 'rupee')
	.reduce((s, t) => s + map.layers[t.ln].stages[t.sk].chestContents[t.cell].value, 0);
if (wantSum !== gotSum) throw new Error(`ルピーの額面の合計が合わない: ${wantSum} → ${gotSum}`);

writeFileSync(PATH, JSON.stringify(map, null, 2));
const rupees = targets.filter((t) => t.after.type === 'rupee').length;
console.log(`✅ 宝箱 ${targets.length} 件を直した（ルピー ${rupees} 件＝合計 ${gotSum}／回復薬（大） ${targets.length - rupees} 件）。`);

function countChests(m) {
	let n = 0;
	for (const ld of Object.values(m.layers)) {
		for (const sd of Object.values(ld.stages ?? {})) n += Object.keys(sd.chestContents ?? {}).length;
	}
	return n;
}
