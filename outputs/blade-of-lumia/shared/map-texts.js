// ── map-texts.js ── マップデータの「プレイヤーに見える本文」を歩く単一の入口（実行キュー24）。
//
// なぜ要るか＝本文は3種類以上のフィールドに散っている（`showConditions.*.message` /
// `fluteEffect.message` / `npcData` と `signData` の `lines`・`linesAfter`・`linesAfterBoss`）。
// 「本文を全部なめる」処理を書く側がそのたびに歩き方を書くと、**片方だけ直って片方が残る**
// （実際に 2026-09-10 の退行＝`{{key}}` マーカー75件が消えた事故は、データを触る道が
// エディタ／移行スクリプト／検査で別々だったのが根）。∴歩き方は1箇所に置く。
//
// ⚠️ ここは**歩き方と絵文字→マーカーの変換だけ**を持つ。絵の表（キー→スプライト）は
//    `shared/ui-icons.js` が単一の真実（[[blade-tile-sprite-single-source]] と同じ作法）。
//
// ⚠️ `tests/ui-icons.spec.js` は**自分で歩く**（この関数を使わない）＝歩き方に穴が空いたとき
//    検査も同じ穴を持つのを避けるため（番人は独立していないと歯が無くなる）。

import { EMOJI_TO_ICON, UI_ICON } from './ui-icons.js';

const EMOJI = Object.keys(EMOJI_TO_ICON);

/** `{{key}}` の書式（キーは英字だけ＝`tests/ui-icons.spec.js` と同じ形）。 */
export const ICON_MARKER_RE = /\{\{([a-zA-Z]+)\}\}/g;

/**
 * マップの本文を全部なめる。`visit({ at, text, set })` を呼ぶ。
 * `set(next)` で書き換えられる（読むだけなら呼ばない）。
 * 対象＝プレイヤーが実際に読む文字列だけ（層名・ステージ名などのメタは含めない）。
 */
export function forEachMapText(map, visit) {
	const strAt = (holder, key, at) => {
		if (typeof holder?.[key] !== 'string') return;
		visit({ at, text: holder[key], set: (next) => { holder[key] = next; } });
	};
	const linesAt = (arr, at) => {
		if (!Array.isArray(arr)) return;
		for (let i = 0; i < arr.length; i++) strAt(arr, i, `${at}[${i}]`);
	};
	// 会話エントリ（`npcData` / `signData`）＝古い「文字列の配列」形式と `{name,lines}` 形式が
	// 混在する（[[blade-sign-two-formats]]）∴両方を受ける。版（`linesAfter`/`linesAfterBoss`）も同じ本文。
	const entryAt = (entry, at) => {
		if (Array.isArray(entry)) { linesAt(entry, at); return; }
		if (!entry || typeof entry !== 'object') return;
		linesAt(entry.lines, `${at}.lines`);
		linesAt(entry.linesAfter, `${at}.linesAfter`);
		for (const [boss, arr] of Object.entries(entry.linesAfterBoss ?? {})) {
			linesAt(arr, `${at}.linesAfterBoss[${boss}]`);
		}
	};

	for (const [ln, ld] of Object.entries(map?.layers ?? {})) {
		for (const [sk, sd] of Object.entries(ld?.stages ?? {})) {
			const at = `${ln}/${sk}`;
			for (const [key, cond] of Object.entries(sd?.showConditions ?? {})) {
				if (cond && typeof cond === 'object') strAt(cond, 'message', `${at} showConditions[${key}]`);
			}
			if (sd?.fluteEffect && typeof sd.fluteEffect === 'object') {
				strAt(sd.fluteEffect, 'message', `${at} fluteEffect`);
			}
			for (const [key, nd] of Object.entries(sd?.npcData ?? {})) entryAt(nd, `${at} npcData[${key}]`);
			for (const [key, sg] of Object.entries(sd?.signData ?? {})) entryAt(sg, `${at} signData[${key}]`);
		}
	}
}

// 🔥 だけは「同じ絵文字が別の物を指している」＝機械置換できない（かがり火／狼煙はかがり火
// タイル、草・茂みが燃えるのは茂みタイル）。本文で見分ける＝`game/game.js` 側で 🔥 を文脈ごとに
// torch/bush/candle へ書き分けたのと同じ判断。
export function iconKeyForEmoji(emoji, text = '') {
	if (emoji === '🔥' && /草|茂み/.test(text)) return 'bush';
	return EMOJI_TO_ICON[emoji];
}

/** 文中の「絵がある物の絵文字」を `{{key}}` へ直した文字列（変化が無ければ同じ文字列）。 */
export function emojiToIconMarkers(text) {
	let out = String(text);
	for (const emoji of EMOJI) {
		if (!out.includes(emoji)) continue;
		// 絵文字＋（あれば）異体字セレクタ U+FE0F を1マーカーに畳む（残すと単独で豆腐になる）。
		// 直後の空白は本文の一部＝残す。
		out = out.replace(new RegExp(`${emoji}️?`, 'g'), `{{${iconKeyForEmoji(emoji, out)}}}`);
	}
	return out;
}

/** 絵文字とマーカーと異体字セレクタを取り除いた「本文だけ」（移行で日本語が変わっていないかの照合用）。 */
export function iconMarkerBody(text) {
	let s = String(text);
	for (const emoji of EMOJI) s = s.split(emoji).join('');
	return s.replace(ICON_MARKER_RE, '').replace(/️/g, '');
}

/**
 * マップ全体の本文の絵文字を `{{key}}` へ直す（**その場で書き換える**）。
 * 返り値＝`{ changes: [{ at, before, after }] }`。
 * ⚠️ 本文（日本語）が変わったら例外＝黙って文言を書き換えない（キュー24 の ⛔ 止まる条件）。
 */
export function normalizeMapIconMarkers(map) {
	const changes = [];
	forEachMapText(map, ({ at, text, set }) => {
		const after = emojiToIconMarkers(text);
		if (after === text) return;
		if (iconMarkerBody(after) !== iconMarkerBody(text)) {
			throw new Error(`本文が変わった: ${at}\n  ${text}\n  ${after}`);
		}
		set(after);
		changes.push({ at, before: text, after });
	});
	return { changes };
}

/** 本文に残っている「絵がある物の絵文字」を数える（＝退行の検知）。 */
export function findRawIconEmoji(map) {
	const found = [];
	forEachMapText(map, ({ at, text }) => {
		for (const emoji of EMOJI) {
			if (text.includes(emoji)) found.push({ at, emoji, key: iconKeyForEmoji(emoji, text), text });
		}
	});
	return found;
}

/** 本文に在る `{{key}}` を数える（`{ total, texts, unknown }`＝表に無いキーは書き間違い）。 */
export function countIconMarkers(map) {
	let total = 0, texts = 0;
	const unknown = [];
	forEachMapText(map, ({ at, text }) => {
		let hit = 0;
		for (const m of text.matchAll(ICON_MARKER_RE)) {
			hit++;
			if (!UI_ICON[m[1]]) unknown.push({ at, key: m[1], text });
		}
		if (hit) { total += hit; texts++; }
	});
	return { total, texts, unknown };
}
