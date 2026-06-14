// ── Blade of Lumia – constants.js ─────────────────────────────
// game.js から切り出した「再代入されない純粋な定数」を集約するモジュール。
// （Phase 0-2 Step 1a：モジュール分割の足場づくり。副作用ゼロ）
//
// 方針：
//  - ここには値が変化しない定数のみを置く（数値・文字列・固定マップ）。
//  - 可変状態（player / stageKey 等の let）や DOM 参照は対象外。
//  - 描画ロジックに密接な定数（BG_TILE_COLOR_CLASS 等）は描画系分離（Step 3）で扱う。

// 座標系：x/y はセル単位の float（0.5 刻みで移動）
// 例: x=1.5 → タイル列 1 の右端 / タイル列 2 の左端の中間
export const MOVE_STEP     = 0.5;   // 1 操作 = 0.5 セル
export const TICK_MS       = 120;   // 敵行動 tick 間隔（ms）
export const INVINCIBLE_MS = 1500;  // 無敵時間（ms）
export const HP_PER_HEART  = 2;
export const MAP_JSON_URL  = '../work/blade-of-lumia.json';
export const SAVE_KEY      = 'blade-of-lumia-save';
export const CLEARED_KEY   = 'blade-of-lumia-cleared';

// 移動方向 → (dy, dx) セル単位
export const DIR_DELTA = {
	up:    [-MOVE_STEP, 0],
	down:  [ MOVE_STEP, 0],
	left:  [0, -MOVE_STEP],
	right: [0,  MOVE_STEP],
};

// ── 戦闘関連 ──────────────────────────────────────────────────
// 剣リーチ：プレイヤー中心から敵中心までの距離で判定するため、
// 隣接セルの敵との距離 = 1.0 セルなので、1.2 あれば十分届く（少し余裕あり）
export const SWORD_REACH = 1.2;
// 剣攻撃クールダウン：100ms（1秒10回まで）
// Phase 3 で攻撃速度UP装備が実装されたらここを短縮する
export const SWORD_COOLDOWN_MS = 100;
// 石を押すクールダウン：600ms（重い石はゆっくりしか押せない）
export const STONE_PUSH_COOLDOWN_MS = 600;
