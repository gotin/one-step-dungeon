#!/usr/bin/env node
// マップデータの「文中の絵文字」を `{{key}}` マーカーへ移す移行スクリプト（キュー10番 10e）。
//
// なぜ要るか＝メッセージバー・NPC 会話は `shared/ui-icons.js iconText()` を通るように
// なった＝`{{heart}}` のようなマーカーを書けばアイテムと同じドット絵が出る。だが本文は
// コードではなく **マップデータ側**（`showConditions.*.message` / `fluteEffect.message` /
// 会話データの `lines` ほか）に書かれている∴データを直さないと絵文字のまま出る。
//
// 置き換える絵文字＝`shared/ui-icons.js EMOJI_TO_ICON` に載っているものだけ（＝絵がある物）。
// ⚠️ 載っていない記号（⚠ ♪ ✦ ⭐ 🏛 🌊 …）は「物」ではない or 絵が無い∴そのまま残す。
//
// 🔁 **冪等**＝何度当ててもよい（マーカーはもう絵文字ではない∴2回目は0件）。
//
// ── 2026-09-16（実行キュー24）の改訂 ────────────────────────────────
// この移行は 2026-09-09（`e1f83b8`）に75件当てたが、翌日 `3e71a24`（スプライトの作業）で
// **古い localStorage を抱えたエディタから保存され75件とも巻き戻った**。∴
//   ① 歩き方（どのフィールドが本文か）を `shared/map-texts.js` に移し、エディタ・検査と
//      **同じ1本**にした（片方だけ直る形をやめた）。
//   ② `BLADE_MAP_PATH` で別ファイルに当てられる＝本番の前に `.scratch` のコピーで空撃ちする。
//   ③ 再発の入口はこのスクリプトでは塞げない（保存する側の問題）∴エディタ側で
//      保存時のマーカー化＋「ファイルが読み込み後に変わっている」検知を入れた（editor-io.js）。
//
// Usage:
//   node scripts/migrate-ui-icon-markers.mjs
//   BLADE_MAP_PATH=/abs/path/to/copy.json node scripts/migrate-ui-icon-markers.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeMapIconMarkers, findRawIconEmoji, countIconMarkers } from '../shared/map-texts.js';

const PATH = process.env.BLADE_MAP_PATH
	? new URL(`file://${process.env.BLADE_MAP_PATH}`)
	: new URL('../work/blade-of-lumia.json', import.meta.url);

const map = JSON.parse(readFileSync(PATH, 'utf8'));
const { changes } = normalizeMapIconMarkers(map);

// ── 事後検査（直した後に自分で数える）─────────────────────────
const leftover = findRawIconEmoji(map);
if (leftover.length) {
	throw new Error(`絵文字が残っている:\n${leftover.map((f) => `${f.at}: ${f.text}`).join('\n')}`);
}
const { total, texts, unknown } = countIconMarkers(map);
if (unknown.length) {
	throw new Error(`UI_ICON に無いマーカーが出来た:\n${unknown.map((u) => `${u.at}: {{${u.key}}}`).join('\n')}`);
}

writeFileSync(PATH, JSON.stringify(map, null, 2));

const byKind = {};
for (const ch of changes) {
	const kind = ch.at.includes('npcData') ? 'npcData'
		: ch.at.includes('signData') ? 'signData'
		: ch.at.includes('fluteEffect') ? 'fluteEffect.message' : 'showConditions.message';
	byKind[kind] = (byKind[kind] ?? 0) + 1;
}
console.log(`✅ ${changes.length} 件の文を {{key}} マーカーに移した`);
for (const [k, n] of Object.entries(byKind)) console.log(`   ${k}: ${n} 件`);
console.log(`── いま本文に在るマーカー: ${total} 個 / ${texts} 本文 ──`);
