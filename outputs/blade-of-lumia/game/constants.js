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

// ── Phase 1-3: 終盤フローの MAP_ENTER 予約 ID ──────────────────
// 終盤は「星の欠片を全収集 → 古代の祭壇へ誘導 → 翼の羽衣を入手 →
// 暗黒の塔解放 → ラスボス ザーネル撃破 → エンディング」の順に進む。
// 祭壇・暗黒の塔の入り口（MAP_ENTER）は下記の予約 id を mapEnters.<pos>.id に
// 設定する契約とする（Phase 1-4 が祭壇、Phase 1-5 が暗黒の塔を配置する）。
//   - ALTAR_EXIT_ID:      古代の祭壇ステージの入り口（全欠片収集後に誘導）
//   - DARK_TOWER_EXIT_ID: 暗黒の塔の入り口（hasWingRobe=true のとき通行可）
// これらの id を持つ入り口がマップに存在しない間は、boss.js は従来どおり
// 「全収集 → 即エンディング」のフォールバック動作になる（後方互換）。
export const ALTAR_EXIT_ID      = 'altar';
export const DARK_TOWER_EXIT_ID = 'darkTower';

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

// ── Phase 3-1: チャージ攻撃（剣ビーム）─────────────────────────
// 攻撃ボタンを押した瞬間に通常の剣が出る。押しっぱなしでチャージが溜まり、
// 離した時のチャージ量で発射するビームが変わる（論理時間 gameNow 基準）。
//   - 1/4(CHARGE_MIN_RATIO)未満 … ビームなし（剣は既に振っている）
//   - 1/4以上〜満タン未満        … 弱ビーム（剣ATK・非貫通）
//   - 満タン(CHARGE_FULL_MS)     … 強ビーム（剣ATK×2・貫通）
export const CHARGE_FULL_MS   = 720;   // 満タンまでの所要時間（6 フレーム）
export const CHARGE_MIN_RATIO = 0.25;  // ビームが撃てる最低チャージ割合（1/4）
export const BEAM_SPEED       = 4.0;   // ビーム飛翔速度（セル/tick 換算前）
export const BEAM_STRONG_MULT = 2;     // 満タンビームの威力倍率（剣ATK に対して）

// ── Phase 3-4: ブーメランスタン ──────────────────────────────
export const BOOMERANG_STUN_MS = 1500; // スタン持続時間（ms）

// ── Phase 4-3b: ロウソク炎ダメージ ────────────────────────────
export const CANDLE_FIRE_DMG = 3; // ロウソクの炎による基本ダメージ（控えめ・発見用途の補助）
