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
