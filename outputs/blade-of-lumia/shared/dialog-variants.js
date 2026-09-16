// shared/dialog-variants.js ── 会話の「進行で切り替わる版」の単一の真実（実行キュー23）
//
// 会話データ（`signData` / `npcData` の1エントリ）は本文とマークを**版**で持てる：
//   ・`lines` / `mark`                       … 基本（版ではない＝いつでも出る土台）
//   ・`linesAfter`                           … 星の欠片を1つ以上見た後（マークは持てない）
//   ・`linesAfterBoss[タイル文字]` / `markAfterBoss[タイル文字]` … そのボスが「最も後に倒した」とき
//   ・`linesAfterBoss.default`   / `markAfterBoss.default`      … 1体でも倒していれば
//
// ここに置く理由＝**読み手が2つ以上ある**（エディタの版パネル／今後の移行スクリプト／検査）∴
// 「どんな版があるか」「どのボスが選べるか」「その表示名」を各所に手書きしない
// （[[blade-tile-sprite-single-source]]・[[blade-enemy-tables-derive-from-meta]] と同じ作法）。
//
// ⚠️ **並びは「優先順の写し」ではなく優先順そのもの**（2026-09-15 に改めた）。選択規則は
//    「条件がヒットした版のうち**一番下**を採る」の1本で、`game/ui.js pickDialogVariant()` も
//    `readEntryVariants()` の並びを読んで解く∴**並びを2箇所に書かない**（それまでは規則が
//    `game/ui.js` にあり、ここが並びを写していた＝ズレる余地があった）。
//    どの版を「持てるか」はデータの形の話∴ここ、「今どれが出るか」の状態はプレイヤー側の話∴
//    あちら＝役割は分かれたまま。関門は `tests/editor-dialog-variants.spec.js`（実ゲームで確認）。
//
// ⚠️ **その「並び」は会話1件ごとに違ってよい＝`linesAfterBoss` / `markAfterBoss` のキーの順が
//    その会話の優先順**（2026-09-15・ユーザー指示「エディタの版は上下の順番を変更できるUIも
//    必要」）。`variantOptions()` の並びは**新しい版を足すときの既定の並び**でしかない。
//    ∴`readEntryVariants()` はキーの順を**並べ替えない**／`applyEntryVariants()` は渡された
//    ブロックの順でキーを書く＝エディタの▲▼がそのままデータの順になる。
//    ⚠️ JSON のキーの順が意味を持つ＝**会話データを書き換える道具はキーの順を保つこと**
//    （エディタは往復で1バイトも変えない＝`tests/editor-dialog-variants.spec.js` ⑥が縛る）。
//    ただし `linesAfter`（星の欠片）は**単独のキー＝順の中に位置を持てない**∴常に一番上
//    （＝一番弱い）として扱う。
//
// 読み手：
//   ・`editor/editor-props.js`（NPC・看板パネルの「進行で切り替わる版」）
//   ・`tests/editor-dialog-variants.spec.js`

import { labelOf, bossesInOrder } from './progression.js';
import { ENEMY_META } from './enemies.js';

/**
 * 選べるボスの一覧（進行順）＝実マップのボス部屋から導出する。手書きの表は作らない。
 * 返り値の `key` は `linesAfterBoss` / `markAfterBoss` のキー（＝ボスのタイル文字）。
 * 寄道のボス（`optional`）も**同じ一覧に混ぜる**＝キーを分けない（2026-09-15 ユーザー決定）。
 * @param {object} map
 * @returns {{key:string, label:string, optional:boolean}[]}
 */
export function bossVariantOptions(map) {
	return bossesInOrder(map).map((b) => ({
		key: b.tile,
		label: `${ENEMY_META[b.tile]?.name ?? b.tile}（${labelOf(map, b.cp)}）`,
		optional: b.optional,
	}));
}

/** 版の種類＝マークを持てるか／条件文の書き方が違う3種 */
export const VARIANT_KIND = { BOSS: 'boss', DEFAULT: 'default', AFTER: 'after' };

/** `linesAfter`（マークを持てない版）のキー。データ側にキーが無い＝欄も出さない。 */
export const AFTER_KEY = 'after';

/**
 * 版の選択肢＝**上が一般・下が特殊**に並ぶ。選択規則は「条件がヒットした版のうち**一番下**を採る」
 * （2026-09-15 ユーザー決定＝「エディタで条件がヒットしたもののうち下にあるものほど優先。
 * そうすればセリフの内容によってどちらを優先したいのか設計することができる」）。
 * ⚠️ ここの並びは**選択肢の並び＝新しい版を足すときの既定**で、実際の優先順は会話ごとの
 * キーの順（`readEntryVariants()`）＝エディタの▲▼で組み替えられる。
 *
 * 並び＝星の欠片 → どれか1体 → 進行順に全ボス（**寄道も進行上の位置に混ぜる**）。
 * ⚠️ 寄道を混ぜても本編の版は巻き戻らない＝ヒットは「そのボスを倒したか」だけを見るので、
 *    寄道の版を持たない相手では**その上（本編）でヒットした版が残る**（「最も後に倒した1体」で
 *    版を1つに絞る旧規則では、寄道を倒した瞬間に版が消えて基本の台詞へ落ちていた）。
 * @param {object} map
 * @returns {{key:string, kind:string, label:string, supportsMark:boolean, optional?:boolean}[]}
 */
export function variantOptions(map) {
	const opts = [{
		key: AFTER_KEY, kind: VARIANT_KIND.AFTER,
		label: '星の欠片を1つ以上手にした後', supportsMark: false,
	}, {
		key: 'default', kind: VARIANT_KIND.DEFAULT,
		label: 'どれか1体を倒した後（default）', supportsMark: true,
	}];
	for (const o of bossVariantOptions(map)) {
		opts.push({
			key: o.key, kind: VARIANT_KIND.BOSS, label: `${o.label} を倒した後`,
			supportsMark: true, optional: o.optional,
		});
	}
	return opts;
}

function asLines(v) {
	if (Array.isArray(v)) return v.map((s) => String(s));
	if (typeof v === 'string') return [v];        // 古い文字列形式（[[blade-sign-two-formats]]）
	return [];
}

/**
 * 2つのキーの並びを1つに畳む＝`linesAfterBoss` と `markAfterBoss` は
 * `applyEntryVariants()` が**同じブロックの順**で書く∴どちらも同じ並びの部分列になっている。
 * 共通のキーを目印に噛み合わせると、元のブロックの順（＝優先順）が復元できる
 * ＝**本文の無い「印だけの版」も自分の位置に戻る**（末尾へ追い出さない）。
 */
function mergeKeyOrder(a, b) {
	const out = [];
	const push = (k) => { if (!out.includes(k)) out.push(k); };
	let i = 0, j = 0;
	while (i < a.length || j < b.length) {
		if (i >= a.length)          { push(b[j++]); continue; }
		if (j >= b.length)          { push(a[i++]); continue; }
		if (a[i] === b[j])          { push(a[i]); i++; j++; continue; }
		if (!a.includes(b[j]))      { push(b[j++]); continue; }   // b にしか無い＝先に出す
		push(a[i++]);
	}
	return out;
}

/**
 * 会話エントリが**実際に持っている版**を、**その会話の優先順（＝キーの順）**で返す。
 * ⚠️ **並べ替えない**＝キーの順そのものが優先順（下ほど強い）∴エディタの▲▼で組んだ順が
 *    そのまま実ゲームの優先順になる。`variantOptions()` の並びは表示名と種類を引くためだけに使う。
 * `options` に無いキー（消えたボス・打ち間違い）も落とさず**その位置のまま**出す
 * ＝エディタで開いた瞬間に黙って消えるのを防ぐ（往復で1バイトも変えないため）。
 * `linesAfter`（星の欠片）は単独のキー＝順に位置を持てない∴常に先頭（一番弱い）。
 * @param {object} entry 会話データ1件（`{name, lines, mark, linesAfter, linesAfterBoss, markAfterBoss}`）
 * @param {{key:string, kind:string, label:string, supportsMark:boolean}[]} options
 * @returns {{key:string, kind:string, label:string, supportsMark:boolean, lines:string[], mark:object|null}[]}
 */
export function readEntryVariants(entry, options) {
	const lab = entry?.linesAfterBoss ?? {};
	const mab = entry?.markAfterBoss ?? {};
	const byKey = new Map((options ?? []).map((o) => [o.key, o]));

	const out = [];
	if (entry?.linesAfter !== undefined) {
		const opt = byKey.get(AFTER_KEY)
			?? { key: AFTER_KEY, kind: VARIANT_KIND.AFTER, label: AFTER_KEY, supportsMark: false };
		out.push({ ...opt, lines: asLines(entry.linesAfter), mark: null });
	}
	for (const key of mergeKeyOrder(Object.keys(lab), Object.keys(mab))) {
		// 選択肢に無いキー（不明なボス）＝形は boss として扱い、名前が引けないことを明示する。
		const opt = byKey.get(key)
			?? { key, kind: VARIANT_KIND.BOSS, label: `${key}（不明なボス）`, supportsMark: true };
		out.push({
			...opt,
			lines: asLines(lab[key]),
			mark:  opt.supportsMark ? (mab[key] ?? null) : null,
		});
	}
	return out;
}

/**
 * 版の一覧を会話エントリへ書き戻す（`linesAfter` / `linesAfterBoss` / `markAfterBoss` を作り直す）。
 * ⚠️ **キーは渡された順で書く＝その順が優先順**（`readEntryVariants()` が読み返す並び）∴
 *    ブロックを入れ替えたら入れ替わった順で保存される（エディタの▲▼の実体）。
 * ⚠️ **空の版は書かない**＝`{}` や `[""]` が残るとゲーム側が「本文がある」と誤判定し得る。
 *    親キーごと空になったら削除する。基本（`lines` / `mark`）には触らない。
 * @param {object} entry 書き込む先（破壊的）
 * @param {{key:string, kind?:string, lines?:string[], mark?:object|null}[]} blocks
 */
export function applyEntryVariants(entry, blocks) {
	const lab = {};
	const mab = {};
	let after = null;
	for (const b of blocks ?? []) {
		const lines = (b.lines ?? []).map((s) => String(s)).filter((s) => s.trim());
		const isAfter = b.key === AFTER_KEY;
		if (isAfter) {
			if (lines.length) after = lines;
			continue;                                  // `linesAfter` はマークを持てない
		}
		if (!b.key) continue;
		if (lines.length) lab[b.key] = lines;
		if (b.mark) mab[b.key] = b.mark;
	}
	if (after) entry.linesAfter = after; else delete entry.linesAfter;
	if (Object.keys(lab).length) entry.linesAfterBoss = lab; else delete entry.linesAfterBoss;
	if (Object.keys(mab).length) entry.markAfterBoss = mab; else delete entry.markAfterBoss;
}
