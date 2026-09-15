// shared/marks.js ── 目的地マーク（実行キュー16）の単一の真実
//
// 「今どこ」はキュー15 の地図が解いた。ここが解くのは **「次どこ」**＝
// NPC・看板が教えた場所を地図に印として残し、ゲーム画面では選択中の1つだけを
// 方向と距離感で指す（距離は**数字で出さない**＝4段に落とす。キュー22）。ユーザーの言葉（2026-09-13）＝「マークはマークのリストも表示して
// 選択中のマークという概念も追加して、選択してるマークは目立たせる表示ができると
// いいかも？ あとゲーム画面に選択してるマークがどちらの方向にあるのかを常に表示とか
// あるといいかも？（表示の仕方で方向と距離がわかるとなおよい）」
//
// ここに置く理由＝**読み手が3つある**（ゲームの UI／エディタの入力欄／検査）∴
// 手書きの対応表を各所に散らさない（[[blade-tile-sprite-single-source]] と同じ作法）。
//
// 読み手：
//   ・`game/ui.js`（ポーズの一覧・見取り図の記号・HUD の方向表示・会話からの追加）
//   ・`editor/editor-props.js`（NPC／看板の「教える目的地」欄の種類の選択肢）
//   ・`tests/field-map-marks.spec.js`（マップ全走査で行き先の実在を確かめる）

// マークの種類→色。見取り図の記号と一覧の点で同じ色を使う（別の表を作らない）。
export const MARK_KINDS = {
	dungeon: { color: '#ff6060', label: 'ダンジョン' },
	cave:    { color: '#f0b040', label: '洞窟・寄道' },
	town:    { color: '#60d0ff', label: '町・人' },
	item:    { color: '#f0f060', label: '宝・道具' },
	other:   { color: '#ffffff', label: 'その他' },
};
export const DEFAULT_MARK_KIND = 'other';

// 画面キー（"x,y"）の形。ここを通らない文字列は捨てる＝データの書き間違いが
// 「無言で1件も出ない」ではなく **検査で赤くなる**（tests 側が同じ関数を通す）。
const STAGE_KEY_RE = /^-?\d+,-?\d+$/;

export function isStageKey(s) { return typeof s === 'string' && STAGE_KEY_RE.test(s); }

// マークの同一性＝**1画面に1つ**（層＋画面）。配列の添字を id にすると
// 並びが変わった瞬間に選択が別のマークへ移る∴座標から作る。
export function markId(layer, stage) { return `${layer}:${stage}`; }

/**
 * 会話データの `mark` フィールド（単体でも配列でも受ける）を正規化する。
 * `layer` 省略＝その会話が置かれている層（ほとんどの場合 field）。
 * @param {object|object[]|null|undefined} mark
 * @param {string} fallbackLayer
 * @returns {{layer:string, stage:string, label:string, kind:string}[]}
 */
export function normalizeDialogMarks(mark, fallbackLayer) {
	const out = [];
	for (const m of [].concat(mark ?? [])) {
		if (!m || typeof m !== 'object') continue;
		const stage = typeof m.stage === 'string' ? m.stage : '';
		if (!isStageKey(stage)) continue;
		out.push({
			layer: typeof m.layer === 'string' && m.layer ? m.layer : fallbackLayer,
			stage,
			label: String(m.label ?? '目的地'),
			kind:  MARK_KINDS[m.kind] ? m.kind : DEFAULT_MARK_KIND,
		});
	}
	return out;
}

/** セーブから読んだ配列を掃除する（壊れた要素・重なった画面を落とす） */
export function normalizeSavedMarks(list) {
	const out = [];
	const seen = new Set();
	for (const m of Array.isArray(list) ? list : []) {
		if (!m || typeof m !== 'object') continue;
		if (!isStageKey(m.stage) || typeof m.layer !== 'string' || !m.layer) continue;
		const id = markId(m.layer, m.stage);
		if (seen.has(id)) continue;
		seen.add(id);
		out.push({
			layer: m.layer,
			stage: m.stage,
			label: String(m.label ?? '目的地'),
			kind:  MARK_KINDS[m.kind] ? m.kind : DEFAULT_MARK_KIND,
		});
	}
	return out;
}

/**
 * マークを1件足す（同じ画面が既にあれば名前と種類を上書きする＝教え直しで増えない）。
 * 配列を **その場で** 書き換える（player.mapMarks を直接渡す）。
 * @returns {boolean} 新しく足したら true（＝「地図に記した」と知らせるのはこの時だけ）
 */
export function addMark(marks, mark) {
	const id = markId(mark.layer, mark.stage);
	const hit = marks.find(m => markId(m.layer, m.stage) === id);
	if (hit) { hit.label = mark.label; hit.kind = mark.kind; return false; }
	marks.push({ layer: mark.layer, stage: mark.stage, label: mark.label, kind: mark.kind });
	return true;
}

// 8方向の矢印（y は下向きが正＝画面グリッドと同じ向き）。
// atan2 を 45° 刻みに丸める＝「どちらに寄っているか」を境界で取り違えない。
const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

// 距離の段（実行キュー22・2026-09-14 ユーザー指定）。
// ❌ キュー16 の「あと N 画面」という数字表示は失効＝**数える距離は残すが画面には出さない**
// （ユーザーの言葉＝「あと何画面、みたいな具体的な数字にはしたくなかった。はっきりしすぎて
// 探索が簡単になりすぎる。矢印の大きさ（とか太さとか色とか）で距離を示せるといい」）。
// ∴ 連続量（field の最大は 34 画面＝16×20 の対角）を4段に落とし、見た目だけで伝える。
// 境界の根拠（field の実測 16×20＝320画面）：
//   near 1〜2   ＝隣か1つ飛ばし＝「もう着く」
//   mid  3〜6   ＝同じ地域の中（地域リワークの1地域はおよそ 4×4 画面）
//   far  7〜13  ＝地域をまたぐ
//   distant 14〜＝世界の反対側（最大 34）
// 見た目の値は CSS 側（`game/css/boss.css` の `.mark-dist-*`）が持つ＝ここは段の切り方だけ。
export const MARK_DIST_BANDS = [
	{ band: 'here',    max: 0 },
	{ band: 'near',    max: 2 },
	{ band: 'mid',     max: 6 },
	{ band: 'far',     max: 13 },
	{ band: 'distant', max: Infinity },
];

/**
 * 画面数 → 距離の段。CSS クラスは `mark-dist-${band}`（HUD の矢印とポーズ一覧が同じ表を読む）。
 * @param {number} screens
 * @returns {'here'|'near'|'mid'|'far'|'distant'}
 */
export function markDistBand(screens) {
	const n = Number.isFinite(screens) ? Math.max(0, screens) : Infinity;
	return (MARK_DIST_BANDS.find(b => n <= b.max) ?? MARK_DIST_BANDS[MARK_DIST_BANDS.length - 1]).band;
}

/**
 * 今いる画面から目的の画面への向きと距離。
 * **距離は画面数（マンハッタン）**＝field は画面グリッドで斜めの遷移が無い∴
 * 実際に通る画面の枚数はこれ。px 距離は画面の大きさに依存して意味が薄い。
 * ⚠️ `screens` は**画面に数字として出さない**（キュー22）＝段（`band`）に落として見た目で伝える。
 * 矢印は方向だけ＝道案内ではない（水・山で直進できないのは割り切り）。
 * @returns {{here:boolean, arrow:string, dx:number, dy:number, screens:number, band:string}|null}
 */
export function markGuide(fromStage, toStage) {
	if (!isStageKey(fromStage) || !isStageKey(toStage)) return null;
	const [fx, fy] = fromStage.split(',').map(Number);
	const [tx, ty] = toStage.split(',').map(Number);
	const dx = tx - fx, dy = ty - fy;
	if (dx === 0 && dy === 0) return { here: true, arrow: '◎', dx, dy, screens: 0, band: 'here' };
	const idx = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
	const screens = Math.abs(dx) + Math.abs(dy);
	return { here: false, arrow: ARROWS[idx], dx, dy, screens, band: markDistBand(screens) };
}

/** マークの色（未知の種類でも必ず色が返る＝無色で消えない） */
export function markColor(kind) {
	return (MARK_KINDS[kind] ?? MARK_KINDS[DEFAULT_MARK_KIND]).color;
}
