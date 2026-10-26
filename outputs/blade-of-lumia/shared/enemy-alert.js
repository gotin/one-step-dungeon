// ── enemy-alert.js ── 敵が「最初から気づいている（追う）」かの判定（キュー60・2026-10-14）──
//
// さまよう雑魚（ENEMY_META の roam を持つ敵）を、マップデータで「追う」に切り替える。
// ゲーム（game.js buildEnemies）・エディタ（敵の動きパネル）・検査が同じ関数を読む
// ＝優先の規則を二重に持たない。
//
// データ（画面＝stage ごと）：
//   enemiesAlert: true            … 部屋まるごと「敵は最初から気づいている」
//   enemyChase: { "r,c": true }   … 置いた場所ごとの「追う」（enemyDirs と同じ住み方）
// 優先＝部屋 ＞ 配置 ＞ 種類の既定（roam を持たない敵＝C・ボスなどは常に追う）。
// 指定できるのは「追う」の向きだけ（さまよわない敵をさまよわせる指定は持たない）。

import { ENEMY_META } from './enemies.js';

/** その種類の敵はさまようか（＝「追う」の指定が意味を持つか）。 */
export function canRoam(tile) {
	return !!ENEMY_META[tile]?.roam;
}

/** 部屋まるごと「敵は最初から気づいている」か。 */
export function isRoomAlert(sd) {
	return sd?.enemiesAlert === true;
}

/**
 * その場所に置いた敵が、さまよわずに最初から追うか。
 * @param {object} sd    画面データ
 * @param {string} posKey "r,c"
 * @param {string} tile  敵のタイル
 */
export function startsAlert(sd, posKey, tile) {
	if (!canRoam(tile)) return true;
	if (isRoomAlert(sd)) return true;
	return sd?.enemyChase?.[posKey] === true;
}

// ── 持ち場（キュー93 の3室目・2026-10-26）──────────────────────────────
//   enemyHold: { "r,c": true }    … 置いた場所ごとの「持ち場を動かない」（enemyChase と同じ住み方）
// 持ち場の敵は**歩かない**（さまよいも追いも止める）。向き直り・攻撃・専用の移動（突進・跳躍など）は
// 止めない＝「その場に立って構える番兵」。初出＝D8 `3,2`「堀の盾騎士」（騎士が島の縁へ寄ると、
// はしごの着地を塞いでしまう∴持ち場に立たせ、向き直りの合間に横や背中へ渡らせる）。
// 指定できるのはさまよう雑魚だけ（エディタの「敵の動き」と同じ一覧＝canRoam）。

/** その場所に置いた敵が、持ち場を動かないか。 */
export function holdsPost(sd, posKey, tile) {
	if (!canRoam(tile)) return false;
	return sd?.enemyHold?.[posKey] === true;
}
