#!/usr/bin/env node
// マップデータの「文中の絵文字」を `{{key}}` マーカーへ移す移行スクリプト（キュー10番 10e）。
//
// なぜ要るか＝メッセージバー・NPC 会話は `shared/ui-icons.js iconText()` を通るように
// なった＝`{{heart}}` のようなマーカーを書けばアイテムと同じドット絵が出る。だが本文は
// コードではなく **マップデータ側**（`showConditions.*.message` / `fluteEffect.message` /
// `npcData.*.lines`）に書かれている∴データを直さないと絵文字のまま出る。
//
// 対象フィールド（実測でこの3種にしか絵文字が無い）：
//   ① layers.*.stages.*.showConditions.*.message
//   ② layers.*.stages.*.fluteEffect.message
//   ③ layers.*.stages.*.npcData.*.lines[]
//
// 置き換える絵文字＝`shared/ui-icons.js EMOJI_TO_ICON` に載っているものだけ（＝絵がある物）。
// ⚠️ 載っていない記号（⚠ ♪ ✦ ⭐ 🏛 🌊 …）は「物」ではない or 絵が無い∴そのまま残す。
// 絵文字の直後の異体字セレクタ（U+FE0F）も一緒に消す（残すと単独で豆腐になる）。

import { readFileSync, writeFileSync } from 'node:fs';
import { EMOJI_TO_ICON, UI_ICON } from '../shared/ui-icons.js';

const PATH = new URL('../work/blade-of-lumia.json', import.meta.url);
const map = JSON.parse(readFileSync(PATH, 'utf8'));

const EMOJI = Object.keys(EMOJI_TO_ICON);
const changes = [];

// 🔥 だけは「同じ絵文字が別の物を指している」＝機械置換できない（かがり火／狼煙は
// かがり火タイル、草・茂みが燃えるのは茂みタイル）。本文で見分ける。
// ⚠️ これは game/game.js 側で 🔥 を文脈ごとに torch/bush/candle へ書き分けたのと同じ判断。
function iconKeyFor(emoji, text) {
	if (emoji === '🔥' && /草|茂み/.test(text)) return 'bush';
	return EMOJI_TO_ICON[emoji];
}

/** 文中の絵文字を `{{key}}` に置き換えた文字列を返す（変化が無ければ同じ文字列）。 */
function convert(text) {
	let out = String(text);
	for (const emoji of EMOJI) {
		if (!out.includes(emoji)) continue;
		// 絵文字＋（あれば）異体字セレクタを 1 マーカーに畳む（直後の空白は本文の一部＝残す）。
		const re = new RegExp(`${emoji}️?`, 'g');
		out = out.replace(re, `{{${iconKeyFor(emoji, out)}}}`);
	}
	return out;
}

/** 絵文字とマーカーを取り除いた「本文だけ」（移行で日本語が変わっていないかの照合用）。 */
function bodyOnly(text) {
	let s = String(text);
	for (const emoji of EMOJI) s = s.split(emoji).join('').split(`${emoji}️`).join('');
	return s.replace(/\{\{[a-zA-Z]+\}\}/g, '').replace(/️/g, '');
}

function apply(holder, key, where) {
	const before = holder[key];
	if (typeof before !== 'string') return;
	const after = convert(before);
	if (after === before) return;
	if (bodyOnly(after) !== bodyOnly(before)) throw new Error(`本文が変わった: ${where}\n  ${before}\n  ${after}`);
	holder[key] = after;
	changes.push({ where, before, after });
}

for (const [ln, ld] of Object.entries(map.layers ?? {})) {
	for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
		const at = `${ln}/${sk}`;
		for (const [cond, c] of Object.entries(sd.showConditions ?? {})) {
			if (c && typeof c === 'object') apply(c, 'message', `${at} showConditions[${cond}]`);
		}
		if (sd.fluteEffect && typeof sd.fluteEffect === 'object') apply(sd.fluteEffect, 'message', `${at} fluteEffect`);
		for (const [npc, nd] of Object.entries(sd.npcData ?? {})) {
			const lines = nd?.lines;
			if (!Array.isArray(lines)) continue;
			for (let i = 0; i < lines.length; i++) apply(lines, i, `${at} npcData[${npc}].lines[${i}]`);
		}
	}
}

// ── 事後検査（直した後に自分で数える）─────────────────────────
const leftover = [];
const unknown  = [];
for (const [ln, ld] of Object.entries(map.layers ?? {})) {
	for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
		const texts = [];
		for (const c of Object.values(sd.showConditions ?? {})) if (typeof c?.message === 'string') texts.push(c.message);
		if (typeof sd.fluteEffect?.message === 'string') texts.push(sd.fluteEffect.message);
		for (const nd of Object.values(sd.npcData ?? {})) {
			if (Array.isArray(nd?.lines)) for (const l of nd.lines) if (typeof l === 'string') texts.push(l);
		}
		for (const t of texts) {
			for (const emoji of EMOJI) if (t.includes(emoji)) leftover.push(`${ln}/${sk}: ${t}`);
			for (const m of t.matchAll(/\{\{([a-zA-Z]+)\}\}/g)) if (!UI_ICON[m[1]]) unknown.push(`${ln}/${sk}: {{${m[1]}}}`);
		}
	}
}
if (leftover.length) throw new Error(`絵文字が残っている:\n${leftover.join('\n')}`);
if (unknown.length)  throw new Error(`UI_ICON に無いマーカーが出来た:\n${unknown.join('\n')}`);

writeFileSync(PATH, JSON.stringify(map, null, 2));
const byKind = {};
for (const ch of changes) {
	const kind = ch.where.includes('npcData') ? 'npcData.lines'
		: ch.where.includes('fluteEffect') ? 'fluteEffect.message' : 'showConditions.message';
	byKind[kind] = (byKind[kind] ?? 0) + 1;
}
console.log(`✅ ${changes.length} 件の文を {{key}} マーカーに移した`);
for (const [k, n] of Object.entries(byKind)) console.log(`   ${k}: ${n} 件`);
