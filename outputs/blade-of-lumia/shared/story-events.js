// shared/story-events.js ── 「ボスを倒した後の次はどこ」をキャラクターの出来事で示す仕組み（実行キュー103）
//
// 人（`npcData` の1エントリ）に次の4つを持たせられる：
//   ・`showWhen: [キー, ...]`   … 全部が成り立つときだけ居る（無ければいつでも居る）
//   ・`hideWhen: [キー, ...]`   … どれか1つでも成り立てば居ない（無ければ消えない）
//   ・`approach: true`          … 居る状態で画面に居合わせたら、向こうから歩いてきて話しかける（1回だけ）
//   ・`setsFlag: "出来事の名前"` … この人との会話を読み終えたら「出来事」を記す（`player.storyFlags`）
//
// キーは会話の「進行で切り替わる版」（`shared/dialog-variants.js`）と**同じ書き方**＝
//   ボスのタイル文字（`L`）／`default`（どれか1体）／`after`（星の欠片を1つ以上）／
//   `item:<道具id>`（その道具を手にした後）／`flag:<出来事の名前>`（その出来事の後）。
// ∴出来事は台詞・印の版の条件にもなる（`linesAfterBoss['flag:…']`）＝「示された場所で出来事を
// こなすと次が示される」連鎖を、ボス撃破と同じ道具立てで書ける（2026-11-14 ユーザー方針）。
//
// ここに置く理由＝読み手が2つ以上ある（ゲームの描画・通行・会話・未読の印／エディタの選択肢／検査）
// ∴「成り立つか」の判定を各所に手書きしない。

import { ownsItem } from './items.js';

/** 出来事の版のキーの接頭辞＝`flag:<出来事の名前>`（ボスの版は1字・道具の版は `item:`）。 */
export const FLAG_KEY_PREFIX = 'flag:';

/** 出来事の名前 → 版のキー */
export function flagVariantKey(name) { return `${FLAG_KEY_PREFIX}${name}`; }

/** 版のキー → 出来事の名前（出来事の版でなければ null） */
export function flagNameOfVariantKey(key) {
	return typeof key === 'string' && key.startsWith(FLAG_KEY_PREFIX)
		? key.slice(FLAG_KEY_PREFIX.length)
		: null;
}

/**
 * 条件のキー1つが、今のプレイヤーで成り立つか。
 * 会話の版（`game/ui.js pickDialogVariant`）・人の出現（下の `npcPresent`）が同じ判定を読む。
 * @param {string} key
 * @param {object} player
 */
export function conditionKeyHolds(key, player) {
	if (typeof key !== 'string' || !key) return false;
	if (key === 'after')   return (player?.triforceCount ?? 0) > 0;
	if (key === 'default') return (player?.defeatedBosses?.size ?? 0) > 0;
	if (key.startsWith('item:')) return ownsItem(player, key.slice('item:'.length));
	const flag = flagNameOfVariantKey(key);
	if (flag !== null) return (player?.storyFlags ?? []).includes(flag);
	return !!player?.defeatedBosses?.has(key);
}

function asKeys(v) {
	if (Array.isArray(v)) return v.filter((k) => typeof k === 'string' && k);
	if (typeof v === 'string' && v) return [v];
	return [];
}

/**
 * その人が今そこに居るか（`showWhen` を全部満たし、`hideWhen` をどれも満たさない）。
 * 居ない人は描かない・話せない・通れる（ただの地面）。
 * @param {object|undefined} entry `npcData` の1エントリ
 * @param {object} player
 */
export function npcPresent(entry, player) {
	if (!entry || typeof entry !== 'object') return true;
	const show = asKeys(entry.showWhen);
	if (show.length && !show.every((k) => conditionKeyHolds(k, player))) return false;
	const hide = asKeys(entry.hideWhen);
	if (hide.some((k) => conditionKeyHolds(k, player))) return false;
	return true;
}

/** 「向こうから話しかけてきた」記録の id（`player.approachedNpcs` の要素）。 */
export function approachId(layer, stage, posKey) {
	return `${layer}:${stage}:${posKey}`;
}

/**
 * まだ話しかけに来ていない、今そこに居る `approach` の人（最初の1人）。
 * @returns {{posKey:string, r:number, c:number, entry:object}|null}
 */
export function pendingApproach(stageData, layer, stage, player, isNpcTile) {
	const done = new Set(player?.approachedNpcs ?? []);
	for (const [posKey, entry] of Object.entries(stageData?.npcData ?? {})) {
		if (entry?.approach !== true) continue;
		const [r, c] = posKey.split(',').map(Number);
		if (!isNpcTile(stageData.tiles?.[r]?.[c])) continue;   // 人の居ないセルの会話データは使わない
		if (done.has(approachId(layer, stage, posKey))) continue;
		if (!npcPresent(entry, player)) continue;
		return { posKey, r, c, entry };
	}
	return null;
}

/**
 * マップに書かれた出来事の名前を全部（`setsFlag` から導く＝手書きの一覧を作らない）。
 * エディタの選択肢と検査が読む。並び＝層 → 画面 → セルの出現順・重複なし。
 * @returns {{name:string, layer:string, stage:string, posKey:string, who:string}[]}
 */
export function listStoryFlags(map) {
	const out = [];
	const seen = new Set();
	for (const [layer, ld] of Object.entries(map?.layers ?? {})) {
		for (const [stage, sd] of Object.entries(ld?.stages ?? {})) {
			for (const [posKey, entry] of Object.entries(sd?.npcData ?? {})) {
				const name = entry?.setsFlag;
				if (typeof name !== 'string' || !name || seen.has(name)) continue;
				seen.add(name);
				out.push({ name, layer, stage, posKey, who: entry.name ?? '' });
			}
		}
	}
	return out;
}
