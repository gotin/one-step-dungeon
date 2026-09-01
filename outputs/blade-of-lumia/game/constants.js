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
// 剣攻撃クールダウン：300ms（1秒 3.3 回まで）
//
// Phase 8-4（2026-08-23）で 100ms → 300ms。理由＝100ms は**敵に被弾無敵が無い**
// （combat.js の剣はこのクールダウンだけが門番）ため 1秒10発＝ATK×10 の DPS になり、
// 敵の hp をいくら積んでもボタン連打で溶ける＝「敵の強さ」が数値でなく連打速度で決まっていた。
// 満タンビーム（ATK×2 / CHARGE_FULL_MS 720ms ＝ ATK×2.8/秒）と釣り合う速さがここ
// （ATK×3.3/秒）∴溜めと連打のどちらを選んでも良い＝チャージが「弱い選択」にならない。
// ⚠️ 短縮するときは ENEMY_META の hp（scripts/audit-balance.mjs の目標帯）と必ずセットで見る。
export const SWORD_COOLDOWN_MS = 300;
// 石を押すクールダウン：600ms（重い石はゆっくりしか押せない）
export const STONE_PUSH_COOLDOWN_MS = 600;
// Phase 5.5g3: 剣を構えたポーズ＋剣スプライトを出しておく時間（論理時間 ms）。
// クールダウン（300ms）より短い＝振り終わると盾が戻る（8-4 でクールダウンを伸ばした結果、
// 連打してもポーズは途切れる＝「振っている間だけ盾が下がる」が見た目と一致する）。
export const ATTACK_POSE_MS = 180;

// ── Phase 8-4 (4) 0d-2.7: 敵の近接攻撃（剣・体当たり）の共通の床 ──────────────
// 2026-08-25 のユーザー実プレイ報告：「どの敵もそうなんだけど、接触しただけでもダメージ
// くらうんだっけ？」＝**接触ダメージは 2026-08-17 に廃止済み**（k-7.5）なのに、そう感じる
// 状態が残っていた。原因は接触判定ではなく次の2つ：
//   ① 剣（sword）の予告 `windupMs` が opt-in で、書いてあるのは岩ゴーレム 1 体だけ
//      ＝残りの剣持ちは「到達距離に入った tick に即ダメージ」＝接触ダメージと区別できない
//   ② 体当たり（slam）の予告が 280ms＝2.3 tick ＝人の反応（~300ms）より短い
//      ＝出てから見て避ける時間が物理的に無い
// ∴0d-2.6 で岩ゴーレムにだけ入れた「予告 → 解決 → 硬直」の3拍を**全敵の近接の既定**にした。
//
//   MELEE_WINDUP_MS … 近接（剣・体当たり）の予告の長さの既定値。
//                     根拠＝人が見て判断する時間 ~300ms ＋ 間合いを外す1歩（TICK_MS 120ms）
//                     ＝420ms を tick に切り上げて 4 tick。**これより短くしてはいけない**
//                     （短くすると「予告が出ているのに避けられない」＝予告が飾りになる）。
//                     ボスは個別に長い値を持つ（岩ゴーレムの 600ms＝2歩ぶん外せる）。
//   MELEE_FREEZE_MS … 近接を振り終えた後に動けない時間（＝プレイヤーが殴り返す窓）の既定値。
//                     根拠＝踏み込み1歩＋振り 180ms（ATTACK_POSE_MS）＋離脱1歩 ≒ 3 tick。
//                     間合いが互角（敵の range ≒ プレイヤーの SWORD_REACH）だと予告だけでは
//                     「殴りに行く＝刺し違え」が残る∴反撃の窓を時間で作る（DECISIONS 2026-08-25）。
//                     ⚠️ 遠隔攻撃には掛けない（撃つたびに固まると間合いを保つ挙動が壊れる）。
export const MELEE_WINDUP_MS = 480;
export const MELEE_FREEZE_MS = 360;

// ── Phase 5.5k k-7.5: 体当たり攻撃（slam）────────────────────────
// 接触専門の敵（attack:{type:'charge'} の10種）が持つ近接攻撃。
// 「隣接＝即ダメージ」ではなく **予告モーション → 解決時にまだ隣接していたら被弾**
// （2026-08-17 ユーザー決定）。∴プレイヤーは予告を見て間合いを外せば避けられる。
//   SLAM_RANGE     … 到達距離。剣（sword の range 1.5）と同じ数字を採る＝プレイヤーの
//                    立ち位置が半セルのとき東/南から寄る敵が 1.5 で止まる問題を吸収する
//                    （`toTileCol = floor(x+0.5)` の丸めには手を入れない）。
//   SLAM_WINDUP_MS … 予告の長さ。CSS の拡大縮小2往復（board.css enemy-slam）と同じ長さ。
//                    Phase 8-4 (4) 0d-2.7 で 280 → MELEE_WINDUP_MS（480＝4 tick）。
//                    280ms は人の反応（~300ms）より短く「予告が見えても避けられない」＝
//                    プレイヤーには接触ダメージと区別できなかった（2026-08-25 実プレイ報告）。
//   SLAM_COOLDOWN_MS … 解決してから次の予告までの間隔（毎tick被弾を防ぐ）。
export const SLAM_RANGE       = 1.5;
export const SLAM_WINDUP_MS   = MELEE_WINDUP_MS;
export const SLAM_COOLDOWN_MS = 900;

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

// ── 2026-08-31: ロウソクは「炎を置く」道具になった（連打対策）────────────
// ユーザー実プレイ報告＝「ロウソクの炎が連打できてしまうので簡単になっている」。
// ロウソクは消費なし（count: Infinity）・クールダウンなし・press-edge のみ∴指で
// 毎秒5〜8発入り、炎が弱点の 2×2 ボス（I 沼地の大蝦蟇・O 古森の巨人・L 氷の
// リヴァイアサン）は数秒で溶けていた。
// 対処は「押せる回数を数字で縛る」のではなく**炎を場に残す**こと＝
//   ・1つの炎は 1体の敵に1回だけダメージを与える（同じ炎で焼き続けられない）
//   ・同時に置ける炎は CANDLE_FLAME_MAX 個まで（矢の「同時2本」と同じ作法＝
//     画面に見えている炎の数そのものが上限の告知になる）
//   ・炎は CANDLE_FLAME_MS で燃え尽きる∴次を置くには待つか場所を変える
// ＝「連打できない理由」が機構として画面に見える（クールダウンという不可視の壁を作らない）。
// 1発の重みは敵側の `weakness.multiplier` で調整する（この基礎値を上げると弱点でない
// 雑魚まで強く焼けてロウソクが汎用武器化する∴基礎値は据え置き）。
export const CANDLE_FLAME_MS  = 3500; // 置いた炎が燃えている時間（ms・論理時間で測る）
export const CANDLE_FLAME_MAX = 3;    // 同時に置いておける炎の数

// ── Phase 9-5b: 雑魚リスポーン ────────────────────────────────
// 雑魚（isBoss=false・E/C/F）が復活するまでに必要なステージ移動回数。
export const RESPAWN_MOVES = 8;
