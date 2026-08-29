// game/enemy-state.js ── 敵の「窓」の判定を、絵と機構で共有する単一の真実
//
// Phase 8-4 (4) 0d-2.11 (A)（2026-08-27）で足した。きっかけ＝G 岩のゴーレムの弱点を
// 爆弾（D6 の報酬＝D1 では永久に持てない＝死んだ弱点）から**攻撃硬直の窓に斬る**へ
// 差し替えたこと。ここに置く理由は1つ＝**判定の窓と、見えている絵の窓を絶対にズラさない**
// （敵の防御の判定距離が攻撃到達距離とズレて「歯のないテスト」を書いた前例と同じ轍を踏まない）。
//
// 読み手：
//   ・`game/enemy-ai.js` syncRecoverMotion … `.attack-recover`（前かがみに沈む絵）の on/off
//   ・`game/combat.js`   dealDamageToEnemy … `weakness.window === 'recover'` の弱点判定
//
// ⚠️ どちらか片方だけを書き換えてはいけない＝「沈んでいるのに弱点が乗らない」「見えていない
//    のに弱点が乗る」のどちらもプレイヤーには理不尽に映る。`tests/weakness-recover-window.spec.js`
//    が「両方がこの関数を呼んでいること」を静的に固定している。

/**
 * 攻撃硬直（＝反撃の窓）の中か。
 *
 * `e._freezeUntil` は攻撃が**成立した tick**（`enemy-ai.js markAttack`）に立つ＝空振りでも入る。
 * 予告中（剣の振り上げ `_swingAt` / 体当たりの溜め `_slamAt` / 炎の吸い込み `_breathAt`）は
 * 硬直の窓に数えない＝「どちらの窓なのか」が絵で一意に読めるようにするため（GUIDE §6-1）。
 * 詠唱（`enemy-ai.js` の castDelayMs）も `_freezeUntil` を使うが、あちらは予告の絵を別に持つ
 * ∴ここでは同じ扱いでよい（動かず止まっている＝殴り返せる窓であることは同じ）。
 */
export function isInRecoverWindow(e, now) {
	if (!e || e._freezeUntil == null || !(now < e._freezeUntil)) return false;
	return e._swingAt == null && e._slamAt == null && e._breathAt == null;
}
