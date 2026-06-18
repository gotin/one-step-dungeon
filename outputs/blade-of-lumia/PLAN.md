# Blade of Lumia – 開発計画

**目標：** 初代ゼルダの伝説レベルの面白さを持つ、多くの人に「やりたい」と思ってもらえるゲームにする。

---

## 📂 ドキュメント構成と運用ルール

長期開発のため、以下のファイルで進捗・判断を管理する：

| ファイル | 役割 | 更新タイミング |
|---|---|---|
| **PLAN.md**（本ファイル） | 何を作るかの計画。チェックボックスで進捗 | タスク完了時にチェック / 計画変更時 |
| **PROGRESS.md** | 作業ログ。「やったこと・次やること」 | 作業セッションごと |
| **DECISIONS.md** | 設計判断・学び・ハマりどころ（ADR） | 重要な判断・発見・計画変更時 |
| **WORKFLOW.md** | 作業プロンプトのテンプレート集 | フェーズを進める時にコピーして使う |
| **IDEA.md** | アイデア集・ストーリー設定 | アイデア追加時 |

**運用ルール：**
- **セッション開始時**：`PROGRESS.md` の「▶ 次やること」を読んで再開する
- **セッション終了時**：`PROGRESS.md` に新エントリ（やったこと・次やること）を追記する
- **タスク完了時**：`PLAN.md` の該当チェックボックスを `[x]` にする
- **計画変更時**：`PLAN.md` を直接修正し、`DECISIONS.md` に「なぜ変えたか」を記録する
- **重要な判断・ハマりどころ**：`DECISIONS.md` に追記する

---

## フェーズ概要

| フェーズ | テーマ | 優先度 |
|---|---|---|
| **Phase 0** | **技術基盤・エンジニアリング改善** | **★★★ 最高（最初にやる）** |
| Phase 1 | ストーリー基盤の実装 | ★★★ 最高 |
| Phase 2 | ゲームループ完成（8ダンジョン・エンディング） | ★★★ 最高 |
| Phase 3 | アクション・戦闘の深化 | ★★☆ 高 |
| Phase 4 | サブアイテム拡充 | ★★☆ 高 |
| Phase 5 | 謎解き・パズルギミック | ★★☆ 高 |
| Phase 6 | 世界観・NPC・テキスト | ★★☆ 高 |
| Phase 7 | 成長システム | ★☆☆ 中 |
| Phase 8 | やりこみ・UX改善 | ★☆☆ 中 |

> **⚠️ Phase 0 を先に完了させてから Phase 1 以降に進む。**  
> game.js が 4098 行の状態で新機能を追加し続けるとバグ修正もデバッグも困難になる。  
> モジュール分割が完了して初めて、安全かつ高速に機能追加できる基盤が整う。

---

## 🤖 モデル使い分けガイド（Opus / Sonnet）

各タスクに **推奨モデル** を記載しています。基本方針は以下の通り：

| 推奨 | 向いているタスク | 理由 |
|---|---|---|
| **🧠 Opus** | 設計判断・依存関係の見極め・データ構造設計・問題解決 | 全体を読んで「どう分けるか」を判断する重い思考が必要 |
| **⚡ Sonnet** | パターンが決まった実装・コード移動・量産・単純な追加 | 設計が決まれば機械的に進む作業。速くて低コスト |
| **🧠→⚡** | まずOpusで設計を固め、その後Sonnetで実装 | 設計と実装を分けると効率的 |

> **原則：** 「最初の1つ」「全体に影響する設計」は Opus、「2つ目以降の繰り返し」「決まった作業」は Sonnet。

---

## Phase 0：技術基盤・エンジニアリング改善

**目的：** 長期開発・機能追加に耐えられるコードベースを整備する。**最初に完了させる。**

**現状のファイルサイズ（2026-06-15 実測・Phase 0 完了時点）：**
```
game.js    1268行  ✅ 4098行 → 1268行（約70%削減。0-2b で旧本体削除完了）。
                      オーケストレーション層（状態宣言・factory初期化・export）に収束
game.css   分割済 ✅ → css/ 配下11ファイル + @import エントリ（0-3b 完了）
editor.js  分割済 ✅ → 12モジュール（editor-state/layers/world/palette/canvas/props/io/
                      sprite/character/item/tile + エントリ193行。0-3b/0-5 完了）
sprites.js 分割済 ✅ → sprites-player/enemies/items/tiles + aggregator（0-3 完了）
sounds.js   448行  許容範囲内
enemies.js  142行  OK
items.js     92行  OK
tiles.js    198行  OK
npcs.js      17行  OK

【game.js から切り出し済みのモジュール（全て目標400〜700行内）】
player.js 698 / enemy-ai.js 555 / ui.js 529 / projectile.js 440 / boss.js 376 /
render-board.js 308 / combat.js 291 / render-chars.js 266 / input.js 161 /
passable.js 161 / conditions.js 117 / save.js 87 / main.js 78 / constants.js 36

テストコード  Playwright 29本（起動・移動・セーブ/ロード・遷移・投擲物・石押し・VRT・
                      editor スモーク：起動/作成/パレット/エクスポート＋スプライト/キャラ/
                      アイテム/タイル各エディタ）
```


---

### 0-0. テスト基盤の整備（分割前の安全網）⚠️ 最優先　🧠→⚡（設計はOpus、テスト量産はSonnet）

**背景：** 現状テストが1件もない。game.js を16分割する際にデグレ（既存機能の破壊）が起きても気づけない。  
分割作業の前に、**動作確認の安全網**を用意する。

**採用方針：Playwright を中心に据える**

> このゲームは「移動・衝突・演出・遷移」など**実際に動かさないと品質が確認できない**要素が多い。  
> ロジック単体テストだけでは不十分なため、実ブラウザで動かす E2E（Playwright）を主軸にする。  
> ただし**最初から完璧を目指さず、小さなスモークから始める**（起動・移動・遷移程度）。

#### ① Playwright による E2E テスト（主軸）
- [x] Playwright を導入（`npm i -D @playwright/test`、`npx playwright install chromium`）
- [x] **最小スモークテスト**：ゲームページが**エラーなく起動**し、ボードが描画されるか（`pageerror`・`console.error` を監視）
- [x] **スモークテスト（続き）**：
  - [x] キー入力でプレイヤーが**移動**できるか（4方向のいずれかで座標変化を確認）
  - [x] **セーブ/ロード**（localStorage）が機能するか（seed→続きから→復元を確認）
  - [x] **ステージ遷移**が動くか（遷移先ステージへの移動検証は未着手）
- [x] **ビジュアル回帰テスト（VRT）**：
  - 主要画面のスクリーンショットを基準画像として保存
  - リファクタ前後で**ピクセル差分**を比較（ピクセルアートゲームと相性が良い）
  - `expect(page).toHaveScreenshot()` を活用

#### ② 純粋関数の単体テスト（補助）
- [ ] 分割対象の低リスク純粋関数から：
  - `isPassable()` / `tilePassable()` / `toTileRow()` / `toTileCol()` など
  - テストランナーは Node 標準の `node --test`（追加依存なし）

#### ④ 投擲物テスト（サブアイテム動作スモーク）
- [ ] **弓矢テスト**：弓矢を装備・使用 → N フレーム後に `__game.getProjectiles()` に矢が存在し、座標が前進していることを確認
  - 背景：Phase 0-2 Step 5 の factory 切り出し後、useSubItem が旧ローカル変数に push し続けていたバグ（投擲物が動かない）がテストで検出できず実機確認で発覚した。今後の factory 切り出しでも同種のリグレッションが起きうるため追加
- [ ] **ブーメランテスト**：ブーメランを装備・使用 → N フレーム後に飛翔中の投擲物が存在し、プレイヤー元位置から離れていることを確認（`returning: false` の間は前進）

#### ③ 手動テストチェックリスト（自動化が難しい演出系）
- [ ] ボス撃破演出・エンディング・ダイアログ表示などの確認手順を md 化

> **運用：** 分割の各 Step 完了ごとに Playwright スモーク＋VRT を回し、挙動・見た目が変わっていないことを確認する。

> **段階導入の指針：**
> 1. まず「起動するか」だけの最小スモークを1本通す（ここが一番価値が高い）
> 2. 次に移動・遷移・セーブを追加
> 3. 余裕が出たら VRT（スクショ比較）を主要画面に追加
> 4. 入力→待機→状態確認の制御は地味に難しいので、ヘルパー関数を整備して使い回す


---

### 0-1. 決定論的ゲームループ（フレーム制御可能な構造）　🧠 Opus（コア設計）

**背景：** 現状のゲームループは**壁時計（実時間）に依存**しており、テストしづらい。
```js
setInterval(gameTick, TICK_MS)   // 実時間で駆動
setTimeout(() => {...}, 100)      // 演出も実時間
Date.now()                        // クールダウン・無敵時間も実時間
```
→ テストが「実時間を待つ」必要があり、遅く・不安定（flaky）になる。

**目標：時間を外から注入できる決定論的ループにする**

リアルタイムに動かすのではなく、**テストコードが「何フレーム進めるか」を制御**でき、
特定フレームで入力を注入して結果を検証できる構造を持たせる。

#### 設計の3本柱

1. **ゲームループを「駆動装置」から切り離す**
   ```js
   // 本番：requestAnimationFrame / setInterval が step() を駆動
   // テスト：テストコードが game.step(n) を手動で呼ぶ（実時間ゼロ）
   function step(frames = 1) { /* frames 分だけ世界を進める */ }
   ```

2. **実時間（Date.now）を「論理時間 gameTime」に置き換える**
   ```js
   // ❌ 今: if (Date.now() - lastSwordTime < COOLDOWN)
   // ✅ 後: if (gameTime - lastSwordTime < COOLDOWN)  ← gameTime は step で加算
   ```
   クールダウン・無敵時間・敵AIタイマーをすべて論理時間基準にする。

3. **入力をキューに積み、特定フレームで注入できるようにする**
   ```js
   game.queueInput('right');   // 入力を予約
   game.step(5);               // 5フレーム進める
   expect(game.player.x).toBe(...);  // 決定論的に検証
   ```

#### タスク
- [x] `gameTick` を「実時間駆動」と「1フレーム進める純粋ロジック `step()`」に分離
- [x] `Date.now()` 依存のクールダウン・無敵時間・敵AIタイマーを論理時間 `gameTime` に置換
- [x] 入力をキュー化し、テストから注入できる API（`queueInput` / `step`）を用意
- [x] テスト用フックを公開（`window.__game` 等でテストから状態・stepにアクセス）

#### 効果
| 効果 | 内容 |
|---|---|
| テストが高速・安定 | 実時間を待たない → flaky ゼロ |
| 再現性 | 「右5フレーム→攻撃→3フレーム」が毎回同じ結果 |
| デバッグ性 | バグを「Nフレーム目で再現」と特定できる |
| 将来のリプレイ機能 | 入力列の記録→再生でリプレイ・ゴーストも作れる |

> **⚠️ 演出系の扱い：** 見た目のアニメ（CSS/setTimeout）は実時間のままでよいが、  
> **ゲーム状態に影響する待機**（ボス撃破後の処理再開など）は論理時間に寄せる。  
> 「状態を進めるロジック」と「見た目の演出」を分離するのがコツ。
>
> **段階導入：** 全タイマーを一度に論理時間化するのは大変。  
> まず**移動・攻撃・敵AIなどゲームロジックのコア**から論理時間化し、演出は段階的に。  
> 0-2 のモジュール分割と**同時に進める**と二度手間にならない（どうせ game.js を触るため）。

---

### 0-2. game.js のモジュール分割（最優先）　🧠→⚡（分割設計はOpus、コード移動はSonnet）

**分割方針：1モジュール400行以内を目標**

> **⚠️ 循環参照に注意：** game.js 内の関数は相互に呼び合う（例：combat → boss → combat、player → combat → ui）。  
> 単純にファイルを切り出すと ESModule の循環参照エラーになりうる。  
> 対策として、(a) 共有状態は `state.js` に集約、(b) イベント/コールバックで疎結合化、  
> (c) どうしても相互依存する場合は動的 `import()` を使う、のいずれかで依存方向を一方向に保つ。

```
game/
  main.js          （エントリポイント・初期化・ゲームループ）    ~150行
  state.js         （グローバル状態・定数・プレイヤー定義）     ~100行
  save.js          （セーブ・ロード）                          ~100行
  map.js           （マップ読み込み・ステージ管理・遷移）       ~200行
  render-board.js  （タイルグリッド描画）                      ~300行
  render-chars.js  （キャラクター絶対配置描画・石描画）         ~200行
  player.js        （プレイヤー移動・タイルイベント）           ~350行
  combat.js        （剣攻撃・ダメージ・ゲームオーバー）        ~200行
  projectile.js    （投擲物・爆弾・ブーメラン）                ~300行
  enemy-ai.js      （敵AI・HitAndAway・追跡）                  ~400行
  enemy-attack.js  （敵の攻撃処理）                            ~150行
  boss.js          （ボス戦・HPバー・演出・エンディング）       ~300行
  ui.js            （HUD・ポーズ・ダイアログ・ショップ）       ~350行
  input.js         （キーボード・モバイル操作）                ~150行
  passable.js      （通行可否判定・ドアウェイ）                ~200行
  conditions.js    （条件評価・石スイッチ・ゲート連動）        ~150行
```

**分割手順（段階的に実施）：**

- [x] **Step 1: 状態・定数の分離（副作用ゼロ・低リスク）**
  - [x] **Step 1a**：再代入されない純粋定数を `constants.js` へ切り出し（MOVE_STEP / TICK_MS / INVINCIBLE_MS / HP_PER_HEART / MAP_JSON_URL / SAVE_KEY / CLEARED_KEY / DIR_DELTA / SWORD_REACH / SWORD_COOLDOWN_MS / STONE_PUSH_COOLDOWN_MS）。10テストグリーン
  - [x] **Step 1b**：`save.js` にセーブ/ロードの純粋変換関数を切り出し（`createStageState` / `serializeStageState` / `deserializeStageState` / `sanitizeLoadedPlayer`）。game.js の `getSS` / `saveGame` / `loadGame` がこれらを利用。10テストグリーン
    - ※ 当初想定の「状態コンテナ `state.js` への全面移行」は、`player` 等の参照が数百箇所に及び一括置換のデグレリスクが過大なため見送り。状態の再代入は game.js に残し、save.js は「状態を受け取り変換値を返す純粋関数」に限定した（read-only binding 問題を回避）。完全な状態集約は必要になった時点で再判断

- [x] **Step 2: 判定・ロジック系の分離（純粋関数が多い・低リスク）**
  - [x] `passable.js`：`isPassable()` / `tilePassable()` / `isPassableForEnemy()`
  - [x] `conditions.js`：`evaluateConditions()` / `checkStoneOnSwitch()`
  - ※ これらは `stageData`/`enemies`/`player`/`currentLayer`/`stageKey`/`debugMode` 等の再代入される `let` 状態を参照するため、純粋関数化ではなく **factory + 状態 getter 注入方式**を採用（`createPassable(deps)` / `createConditions(deps)`）。getter 経由で常に最新状態を読むので呼び出し側は無改修。10テストグリーン


- [x] **Step 3: 描画系の分離**
  - `render-board.js`：`renderBoard()` / `setCellClass()` / `addCellSprite()`
  - `render-chars.js`：`renderChars()` / `addCharEl()` / `moveCharEl()`
  - ※ `charLayerElRef = { value }` ラッパーを game.js に導入し、render-board が `.value` に新しい charLayerEl を書き込み、render-chars はそれを読む設計。`addShieldOverlay` / `updatePlayerCharEl` も render-chars.js に同梱。10テストグリーン

- [x] **Step 4: 入力・UI系の分離**
  - `input.js`：キーボード・タッチ・スワイプ
  - `ui.js`：HUD・ポーズ・ダイアログ・ショップ
  - ※ `initInput(deps)` factory でキーボード・モバイル・スワイプリスナーを登録し `heldKeys` / `processHeldKeys` を返す。`createUi(deps)` factory で HUD・ポーズ・ダイアログ・ショップを生成。旧インラインコード（キーボードリスナー・processHeldKeys・モバイルボタン等）を削除し、factory 生成版で全て上書き。`updateShieldHud` / `processHeldKeys` は事前に `let` 宣言を追加して TDZ を回避。10テストグリーン（デグレなし）。

- [x] **Step 5: ゲームロジック系の分離（完了）**
  - `projectile.js`：投擲物・爆弾・盾ブロック判定（`createProjectile` factory）✅
  - `enemy-ai.js`：`enemyTick()` / `bossTickHitAndAway()` / `enemyChase()` / `enemyAttack()` / `checkEnemyContact()`（`createEnemyAi` factory）✅
  - `player.js`：`movePlayer()` / `handleTileEvent()` / `checkSwitchOff()` / `giveSubItem()` / `spawnDropEffect()` 等（`createPlayer` factory）✅
  - `combat.js`：`swordAttack()` / `dealDamageToEnemy()` / `takeDamage()` / `gameOver()` / `showDmgPopupFloat()` 等（`createCombat` factory）✅
  - `boss.js`：`onBossDefeated()` / `startBossBattle()` / `startEnding()` / `checkTriforceClear()` / `checkPendingTriforce()` 等（`createBoss` factory）✅
  - ※ factory + getter 注入方式を踏襲。`_proj.fireEnemyProjectile` / `_proj.isShieldBlockingDir` / `_proj.showShieldBlockEffect` を enemy-ai に deps として渡すことで循環参照フリーな設計を実現。10テストグリーン（デグレなし）

- [x] **Step 6: エントリポイントの整理**
  - `main.js`：`init()` 呼び出し・`window.__game` テストフック・`startAnimLoop()` 呼び出し・`window.addEventListener('resize')` を切り出し。game.js は必要な関数を `export` して main.js が `import` する設計。12テストグリーン（デグレなし）

---

### 0-2b. game.js から重複した旧関数本体を削除する（分割の完遂）　🧠→⚡（依存確認はOpus、削除はSonnet）

> **⚠️ 重要：これまでの Step 2〜5 の分割は「コピー＋factory上書き」方式で進めたため、
> 切り出した関数の本体が game.js にも丸ごと残っており、game.js は 4075 行のままほとんど痩せていない。**
> ファイル数は増えたが「1ファイルを小さくして把握しやすくする」という分割本来の目的が未達成。
> このタスクで game.js 内の死蔵コード（factory版で上書き済みの旧 `function` 本体）を削除し、分割を本当に完了させる。

**現状（2026-06-14 実測）：**
```
game.js     4075行  ← 元4098行からほぼ減っていない（要対応）
player.js    698 / enemy-ai.js 555 / ui.js 529 / projectile.js 440 /
boss.js      376 / render-board.js 308 / combat.js 291 / render-chars.js 266 /
input.js     161 / passable.js 161 / conditions.js 117 / save.js 87 / main.js 78 / constants.js 36
```

**game.js に本体が重複して残っている主な関数（grep 確認済み）：**
`renderBoard`(315) / `movePlayer`(1212) / `swordAttack`(1824) / `takeDamage`(2004) / `onBossDefeated`(2498) / `enemyTick`(2845) / `projectileTick`(3412) ほか多数（各 factory 版が上書きして実際に使われている）

**進め方（安全第一・1モジュールずつ）：**
- [ ] **準備**：削除候補の棚卸し。各分割ファイル（passable/conditions/render-board/render-chars/input/ui/projectile/enemy-ai/player/combat/boss）が公開する関数名と、game.js 内の旧 `function` 本体・旧 `let`/`const` 宣言の対応表を作る
- [ ] **削除は依存の浅い順に1モジュールずつ**実施し、毎回 `npx playwright test`（13本）でデグレ確認：
  - [x] passable.js / conditions.js 分（判定系）※ Step2 時点で既に削除済みだった
  - [x] render-board.js / render-chars.js 分（描画系）※ 旧本体6関数を削除し `let` 事前宣言を追加。4075→3624行（451行減）。13テストグリーン
  - [x] input.js / ui.js 分（旧本体削除済み）
  - [x] projectile.js / enemy-ai.js 分（旧本体削除済み・3631→2726行）
  - [x] player.js / combat.js / boss.js 分 ※ factory 統合（deps配線 + 代入ブロック）→ 旧本体削除を1セットで実施。**2726→1268行（1458行減）**・13テストグリーン


- [ ] **各削除で確認すること**：
  - factory が確実にその関数を上書きしている（`xxx = _mod.xxx` が存在する）
  - 削除する旧本体が他から直接参照されていない（クロージャ変数への依存が残っていないか）
  - 旧本体だけが参照していたヘルパー関数・変数が「使われなくなったゴミ」になっていないか（あれば一緒に削除）
- [ ] **目標**：game.js を 4075行 → **大幅に削減**（理想は ~400〜800行のオーケストレーション層：状態宣言・factory初期化・export のみ）
- [ ] 完了後、PLAN.md 冒頭「現状のファイルサイズ」表と「現在の実装状態」表の game.js 行数を更新

> **学びとして DECISIONS.md にも記録済み：** 「コピー＋上書き」方式は動作の安全性は高い（旧実装を残したまま新実装に切り替えられる）が、**旧本体の削除を別ステップとして必ず実施しないと分割が完了しない**。今後の切り出しは「コピー→テスト→旧削除→テスト」を1セットにする。

---

### 0-3. sprites.js の分割　⚡ Sonnet（機械的なファイル分け）


- [x] `sprites.js`（1440行）を機能別に分割：
  - `sprites-player.js`：プレイヤー・NPC・escape/monster/darklord/princess（~340行）
  - `sprites-enemies.js`：patrol/chaser/sentry（~120行）
  - `sprites-items.js`：sword/shield/boomerang/arrow/spear/stone/key/chest/rupee/triforce/heart（~250行）
  - `sprites-tiles.js`：block/door/switch/gate/water/mapEnter/doorway系＋フィールドタイル（~400行）
  - `sprites.js` → aggregator（サブファイルをマージして再エクスポート、~100行）
- ※ HUD・UI要素は items.js・tiles.js に自然に収まったため sprites-ui.js は作成せず
- 13テストグリーン（デグレなし）

---

### 0-3b. editor.js・game.css の分割　🧠→⚡（editor.jsの分割設計はOpus、CSSはSonnet）

**editor.js（1581行）：**
- [x] 機能別に分割（マップ編集 / ステージ管理 / プレビュー / エクスポート など）
- [x] 目標：各ファイル400行以内
- ※ editor.js（1581行）を8モジュールに分割：editor-state(62) / editor-layers(85) / editor-world(289) / editor-palette(134) / editor-canvas(327) / editor-props(409) / editor-io(248) / editor.js(142=エントリ)。editor スモークテスト4本追加（起動・ステージ作成・タイルパレット・JSONエクスポート）。**17テストグリーン**（デグレなし）

**game.css（1660行）：**
- [x] CSS を機能別に分割（レイアウト / HUD / キャラ・スプライト / アニメーション / オーバーレイ など）
- [x] 目標：各ファイル400行以内
- [x] `@import` または `<link>` 複数で読み込む
- ※ `game.css` を `@import` のみのエントリファイルにし、`css/` 配下へ11ファイルに分割（base / hud / board / effects / overlays / mobile / responsive / shop / boss / ending / tiles）。@import 順は元のソース順（カスケード）を厳密に維持（特に `#boss-hpbar` の bottom が `@media(PC)` より後で後勝ちになる挙動を保つため boss.css を responsive.css の後に配置）。index.html は無改修。13テストグリーン（VRT含む＝見た目差分なし）


---

### 0-4. 必要なスプライト・モーション一覧の洗い出し　🧠 Opus（何が必要かの企画判断）　✅ 完了

> **成果物：`SPRITES_NEEDED.md`**（プレイヤーモーション/テーマ別タイル/新ボス・敵/新アイテム・エフェクトを優先度付きで洗い出し）

- [x] プレイヤー：4方向歩行2フレームは実装済みと確認 → 追加候補（剣振り/被ダメ/チャージ構え/翼の羽衣飛行/やられ）を整理
- [x] ダンジョンテーマ別背景タイル（水・炎・氷・森・砂漠・空中/闇）→ パレット差し替え方式を基本方針に
- [x] 新ボス・敵スプライト（ザーネル最優先、炎/岩の大型2×2ボス、通常敵4種）
- [x] 新アイテム（翼の羽衣・はしご・笛・ロウソク・剣ビーム等のエフェクト）
- [x] **最優先5点を抽出**（翼の羽衣 / 古代の祭壇 / ザーネル / 飛行モーション / 星の欠片）
- [x] Phase 0-5 スプライトエディタへの要件フィードバックを記載（対応グリッドサイズ・マルチフレーム・パレット差し替え等）


---

### 0-5. エディタ機能拡張（スプライト・キャラクター・タイル作成支援）　🧠→⚡（UI設計はOpus、各エディタ実装はSonnet）

**背景：**  
- プレイヤーモーションの追加、新キャラクター・敵・アイテムの増加を予定
- スプライトデータ（ピクセルアート）・キャラクター定義・敵定義・アイテム定義は、AIが自動生成するには限界があり、**人間が手作業で作成・調整**する必要がある
- 現在のエディタはステージマップ編集のみ対応
- これらの作業を効率化する支援ツールをエディタに追加する

**追加する機能：**

#### スプライトエディタ ✅ 完了（2026-06-14）
- [x] ピクセルアートを**ブラウザ上でドット絵として描けるエディタ**
  - [x] グリッド表示（32×32/16×16/12×16/8×8/6×6/64×64 をプリセットで選択可）
  - [x] カラーパレット選択（`PAL` の配列形式：先頭 transparent + 任意色。色追加・選択色変更に対応）
  - [x] フレームごとの描画（アニメ対応：追加/複製/削除＋プレビュー再生）
  - [x] 左右反転・クリア機能（コピー＝フレーム複製で代替）
  - [x] 既存スプライト（heroD 等）を読み込んで編集
- [x] 描いたスプライトを `sprites.js` の配列形式にエクスポート（パレット行 + `SPRITES.xxx = [...]`）→ textarea 表示 →「クリップボードにコピー」
- [x] 既存スプライト/パレットの選択・読込・編集
- ※ 実装：`editor/index.html`（🎨タブ＋`#view-sprite`）/ `editor/editor-sprite.js`（自己完結モジュール）/ `editor/editor-sprite.css`。スモークテスト2本追加。**19テストグリーン**

#### キャラクター定義エディタ ✅ 完了（2026-06-15）
- [x] プレイヤー・敵のキャラクター定義（`enemies.js` の中身）をフォームで編集できる
  - [x] HP・ATK・DEF・速度・スプライト名・パレット名の設定
  - [x] 攻撃パターン（sword/spear/stone + range + cooldown）の設定
  - [x] 複数攻撃パターン（attacks配列）の編集
  - [x] ボスフラグ・ヒット&アウェイ・オーラエフェクトのチェックボックス
  - [x] フェーズ設定（HP閾値・速度倍率・攻撃CD倍率）
- [x] 定義内容を JS コードとしてエクスポート
- ※ 実装：`editor/index.html`（🧙タブ＋`#view-character`）/ `editor/editor-character.js`（492行）/ `editor/editor-character.css`（117行）。スモークテスト3本追加。**23テストグリーン**（デグレなし）

#### アイテム定義エディタ ✅ 完了（2026-06-15）
- [x] アイテムの定義（`items.js`）をフォームで編集できる
  - アイテム名・アイコン・タイプ（throwable/placeable/consumable/passive）
  - 効果値（healAmount / aoeRadius / damage / breakPower / piercing / atkBonus / defBonus / damageReduction）
  - スプライト名・パレット名・uses（Infinity/null/数値）
  - EQUIP_META（sword/shield/armor のスロット別ステータス）も編集可能
- [x] 定義内容を JS コードとしてエクスポート
- ※ 実装：`editor/index.html`（📦タブ＋`#view-item`）/ `editor/editor-item.js`（自己完結モジュール）/ `editor/editor-item.css`。スモークテスト3本追加。**26テストグリーン**（デグレなし）

#### タイルバリエーション設計支援 ✅ 完了（2026-06-15）
- [x] ダンジョンテーマ別タイルセットのプレビュー表示
  - 「炎テーマ」「水テーマ」「氷テーマ」などで色パレットを切り替えてプレビュー
  - テーマ用パレットを設定して一括で壁・床タイルの見た目を変更できる
  - ※ 実装：`editor/index.html`（🗺タブ＋`#view-tile`）/ `editor/editor-tile.js` / `editor/editor-tile.css`。テーマプリセット8種（デフォルト/炎/水/氷/森/砂漠/空中/闇）。スモークテスト3本追加。**29テストグリーン**（デグレなし）

---

### 0-6. TypeScript・ビルドの検討（分割完了後）　🧠 Opus（採用判断）　✅ 完了（2026-06-15）

**結論：当面は plain ESModule のまま維持する（TS も `vite build` も導入しない）。Phase 0 をクローズ。**

- [x] TypeScript 採用可否を判断 → **見送り**（理由は DECISIONS.md 参照：分割済みで可読性問題は解消・Phase 1+ はコンテンツ中心で型化の費用対効果が低い・移行コスト大）
- [x] esbuild / `vite build`（bundle+minify）採用可否を判断 → **見送り**
  - 本番 Vercel は `outputs/` を素ファイルのまま静的配信（ビルドなし）。計測で本番同等構成の起動時間を実測：time-to-board は RTT 0ms=269ms / 30ms=482ms / 75ms=817ms。
  - ボトルネックは転送量（gzip後70KBで軽量）ではなく **JS27本の import 連鎖 × RTT**。`vite build` で 300〜500ms 短縮の見込みだが、無ビルド運用の手軽さ喪失・4ゲーム同居の Vercel 設定整合コストに見合わないと判断。
- [x] 再判断トリガーを記録：起動が体感で重い声／モバイル比率上昇時 → **新ツールを足さず `vite build` を blade 内で完結**させ Vercel 配信先を dist に切替（esbuild 単独導入は不要＝Vite 内部で esbuild が動くため）。

> **再判断時のメモ：**
> ```
> # blade-of-lumia 内で完結させる場合（将来）
> vite build   # 内部で esbuild(minify) + Rollup(bundle) → dist/
> ```

---

## Phase 1：ストーリー基盤の実装

**目的：** ゲームにストーリーの骨格を与え、「なぜ旅をするか」が分かるようにする。

### 1-1. テキスト・名称の変更　⚡ Sonnet（単純な置換）　✅ 完了（2026-06-15）
- [x] 「トライフォースのかけら」→「星の欠片（せいのかけら）」に全置換
  - **影響範囲が広いので注意**：表示テキスト（game.js）・`tiles.js`（`ITEM_TRIFORCE_PIECE`・ラベル）・`items.js`・既存JSONマップデータ（`Q` タイル）に及ぶ
  - **方針：表示名のみ「星の欠片」に変更し、内部の変数名・タイル文字（`Q`/`ITEM_TRIFORCE_PIECE`/`triforceCount`）は当面そのまま残す**
    - 理由：既存のセーブデータ・JSONマップとの互換性を壊さないため
    - 完全リネームは Phase 0 の分割完了後に安全に実施（やるなら一括置換＋テスト）
  - ※ 変更箇所：`shared/tiles.js`（ラベル）・`game/boss.js`（pulse×2・エンディング文）・`game/player.js`（pulse）・`work/blade-of-lumia.json`（NPC台詞）。内部変数名は維持。29テストグリーン（デグレなし）
- [x] エンディングメッセージを新ストーリーに合わせて書き直す
  - 「魔王を倒し...」→「ザーネルを倒し、すべての星の欠片を集め、女王ルミアの呪いを解いた。光が世界に戻り、ルミアの地に平和が訪れた……」

### 1-2. 序盤：老賢者との出会い　🧠→⚡（台詞・導入の設計はOpus、配置実装はSonnet）　✅ 完了（2026-06-15）
- [x] 開始直後（最初の村）に老賢者NPCを配置
  - field `1,0`（最初の村）のプレイヤー開始位置（row2,col2）の真南 row3,col2 に NPC タイル `b`（茶系パレット＝老人風）を配置
  - 専用スプライトは未作成（新規スプライトは Phase 0-4 管轄）のため既存 `b` を流用し、名前・台詞で「老賢者」と分かるようにした
- [x] 老賢者の台詞でストーリー導入（`npcData["3,2"]` に5行）
  - 「女王ルミアが魔術師ザーネルの呪いで石になった」
  - 「星の欠片を8つ集めて古代の祭壇に捧げれば呪いは解ける」
  - 「ザーネルがダンジョンに魔物を放ち欠片を封じている」「旅に出よ、若き勇者よ」
  - ※ 既存の村人タロ（道案内）と役割分担：タロは方向案内、老賢者がストーリーを語る

### 1-3. ゲーム終盤フローの変更　🧠 Opus（状態遷移の設計）　✅ 完了（2026-06-15）
- [x] 8個集まった時のフローを変更：
  - 現在：8個集まるとすぐエンディング
  - 変更後：「古代の祭壇」があるステージに誘導 → 捧げると「翼の羽衣」入手 → 暗黒の塔解放 → ラスボス → エンディング
- ※ **設計＋安全な基盤実装**を実施（祭壇・塔・ザーネルの本体配置は 1-4/1-5）。後方互換のフォールバックを残す方針：
  - `constants.js`：終盤フローの MAP_ENTER 予約 id（`ALTAR_EXIT_ID='altar'` / `DARK_TOWER_EXIT_ID='darkTower'`）を定義。1-4/1-5 はこの id を `mapEnters.<pos>.id` に設定する契約
  - `tiles.js`：ラスボス `ZARNEL`（タイル `Z`）追加。`DARK_LORD`（`X`）は「星の欠片を落とすダンジョンボス」として分離
  - `enemies.js`：`ZARNEL` の ENEMY_META 追加（`isFinalBoss:true`・HP80・2フェーズ。専用スプライト未作成のため darklord 流用）
  - `game.js`：`player.hasWingRobe` フラグ追加（初期化2箇所）。`saveGame` は player 全体を JSON 化するため save/load は自動対応。createBoss deps に `getExitRegistry` 注入
  - `boss.js`：`checkTriforceClear` を分岐化（**祭壇 id があれば祭壇へ誘導／無ければ従来エンディング**・羽衣取得済なら何もしない）。`onBossDefeated` に **`isFinalBoss` 撃破でエンディング発火**を追加
  - 検証：29 Playwright テストグリーン＋分岐ロジックの一時 Node テスト5ケース（祭壇有無×収集状況×羽衣有無）グリーン（確認後削除）

### 1-4. 古代の祭壇の実装　🧠→⚡（仕組み設計はOpus、実装はSonnet）　✅ 完了（2026-06-15・最小版/タイル方式A案）
- [x] 古代の祭壇を**フィールドに祭壇タイル（`ALTAR='^'`）1個**として配置（専用ステージ方式ではなく A 案）。最初の村 field `1,0` の row8,col6
  - ※ 1-3 の `altarExists()` を「MAP_ENTER id 検出」→「祭壇タイル `^` の検出」に変更（専用ステージ id も併用フォールバック）。これで全収集時に「祭壇へ向かおう」誘導が出る
- [x] 祭壇インタラクション：星の欠片を全部（`calcTotalTriforces()` 個）持っていれば捧げられる（`boss.js` の `offerAtAltar()`）。不足時は「あと N つ足りない」、取得済は「すでに授かった」
- [x] 捧げた時の演出：光柱フラッシュ（`showAltarLightPillar()`）・fanfare・「翼の羽衣を授かった！」メッセージ・`player.hasWingRobe = true`（saveGame で永続化）
- ※ 描画は専用スプライト未作成のため絵文字 `⛩` フォールバック（render-board.js）。専用スプライトは Phase 0-4 SPRITES_NEEDED.md の最優先5点
- ※ 検証：全29テストグリーン＋エディタプレビュー（`ps_triforce=3` で全収集スポーン）で祭壇に乗り「翼の羽衣」付与・hasWingRobe がセーブに永続化を実ブラウザ確認（一時 spec、確認後削除）

### 1-5. 暗黒の塔（ラストダンジョン）　🧠→⚡（飛行・入場ロジックはOpus、ステージ作成はSonnet）　✅ 完了（2026-06-15）
- [x] 暗黒の塔ステージを作成（`dark_tower` レイヤー：入口フロア `0,1` → ボス部屋 `0,0`）
  - 入口は MAP_ENTER テレポート方式（field の閉じた縁に依存しない）。field `3,0` の到達可能な床(2,2)に portal MAP_ENTER（`id:'fieldToTower'`/`destId:'darkTower'`）を配置 → `destId==='darkTower'`(=`DARK_TOWER_EXIT_ID`) なので game.js が `hasWingRobe` ゲートを適用
  - **飛行移動システムを実装**（ユーザー選択：フル実装）：`player.flying` フラグ・`toggleFlight()`（F キー / モバイル🪽ボタン）。飛行中は**自然物（`SKY`/`WATER`/`TREE`/`BUSH`/`FENCE`）を飛び越えられる**が、**山・壁・家・閉じた門/扉は越えられない**（`passable.js` の `FLYABLE_OVER` Set で種別分類・per-instance データ追加なし）。着陸は地上タイルの上だけ・ステージ遷移で自動着陸（到着が空/水なら飛行維持）。飛行で木境界を越えて遷移先の無い端に出た場合はマップ内へクランプして詰みを防ぐ
  - field `4,0`（空島）：到着足場(3,2) → 虚空 `SKY` の谷(cols4-7) → 浮島の塔入口(3,9)。谷は全行 SKY で分断＝翼の羽衣の飛行でしか渡れない（BFS で「徒歩では塔到達不可・飛行で到達可」を検証）
  - 通常より難しい敵配置（入口フロアに追跡者×2・騎士×2）
  - 最上階のボス部屋にラスボス **`ZARNEL`（タイル `Z`）** を配置（ボス用ドアウェイ `:` で入室ロック・撃破で boss.js の `isFinalBoss` 分岐がエンディング発火）
- [x] ザーネルとの決戦後、女王復活のエンディングに繋げる（`onBossDefeated` の `isFinalBoss` 分岐で発火・実ブラウザで撃破→エンディング発火を確認）
- ※ 実装：`shared/tiles.js`（`SKY`）・`game/passable.js`（飛行通過）・`game/player.js`（`toggleFlight`）・`game/game.js`（飛行ゲート・自動着陸・flying 初期化/state・ps_wingrobe）・`game/input.js`（F/🪽）・`game/ui.js`（飛行ボタン表示）・`game/render-board.js`＋`game/css/tiles.css`（空タイル描画）・`game/render-chars.js`＋`game/css/board.css`（飛行浮遊演出）・`work/blade-of-lumia.json`（field 4,0・dark_tower レイヤー）。スモークテスト3本追加（`tests/dark-tower.spec.js`）。**全32テストグリーン**

#### 1-5 改善 TODO（後日対応）
- [ ] **ステージ遷移で飛行状態をリセットしないようにする** 🧠→⚡
  - 現状：`game/game.js` の `enterStage` が「到着セルが地上なら自動着陸（`player.flying=false`）、空/水なら飛行維持」になっている。そのため**飛んだまま地上のあるステージへ渡ると、毎回着地させられて飛行が解除される**（境界の木を越えてフィールドを飛び回るとき、ステージをまたぐたびに着陸して再離陸が必要＝煩わしい）
  - あるべき挙動：**プレイヤーが飛行中なら、ステージが切り替わっても飛行状態を維持する**。着陸はプレイヤーの操作（F/🪽トグル）でのみ行う
  - 注意点：自動着陸を撤廃しても「空/水の上に着地スポーンしても飛行維持で詰まない」現行の安全性は保たれる（飛行中なので移動可能）。逆に、遷移先で**飛行中のまま地上に降り立ちたい**ケースはトグルで対応すれば足りる
  - テスト：飛行中にステージ端遷移（または MAP_ENTER）した直後 `player.flying === true` のままであることを確認する spec を `tests/dark-tower.spec.js` に追加

---

## Phase 2：ゲームループ完成（8ダンジョン）

**目的：** 「8つのダンジョンを攻略して欠片を集める」という核となるゲームループを完成させる。

### 2-1. ダンジョン数の拡張　⚡ Sonnet（エディタでのステージ作成が主）　✅ 完了（2026-06-15）
- [x] 現在のダンジョン数を確認し、8つになるまで追加
  - dungeon_1（草原の洞窟）/ cave_1（砂漠系）/ dark_tower（ラスト）に加え dungeon_2〜dungeon_7 を追加。計8ダンジョン体制へ
- [x] 各ダンジョンにテーマを設定（最小構成：入口部屋 1,0 + ボス部屋 0,0）：
  1. 草原の洞窟（dungeon_1 — 既存）
  2. 砂漠の神殿（dungeon_2 — field 1,2 row7 から入場）
  3. 水の迷宮（dungeon_3 — field 2,0 row3 から入場）
  4. 炎の神殿（dungeon_4 — field 0,1 row8 から入場）
  5. 氷の廃墟（dungeon_5 — field 2,1 row8 から入場）
  6. 森の聖域（dungeon_6 — field 1,2 row4 から入場）
  7. 空中の遺跡（dungeon_7 — field 2,0 row7 から入場）
  8. cave_1（既存）/ dark_tower（ラスト）
  ※ `calcTotalTriforces()` が動的カウントするため DARK_LORD `X` 7体分が星の欠片9個に反映される（直接2個 + 魔王7体）。祭壇では「あと○つ足りない」と正確に表示される
  ※ BFS で全6新規入口の到達可能性を検証。遷移テスト2本（dungeon_2/dungeon_5）追加。**全35テストグリーン**

### 2-2. ダンジョンボス　🧠→⚡（ボス設計はOpus、配置・調整はSonnet）　✅ 完了（2026-06-16）
- [x] 各ダンジョンに固有ボスを配置（現在の実装を活用・拡張）
  - dungeon_2〜7 を完全リデザイン：entry room `0,0`（テーマ地形・敵・宝箱・石碑）+ boss room `1,0`（isBossRoom=true・DARK_LORD X・DOORWAY_BOSS `:`）
  - ステージ構成：entry `0,0` 右端開口 col11 → boss `1,0`（x>=cols 遷移）。boss `1,0` 左端 `:` → entry `0,0`（x<0 遷移）
  - テーマ：砂漠の神殿(2)・水の迷宮(3)・炎の神殿(4)・氷の廃墟(5)・森の聖域(6)・空中の遺跡(7)
  - フィールド接続は entry `0,0` の MAP_ENTER（`id:'dungeon_X'`）に集約。exitRegistry で正しく解決される
- [x] ボス撃破後に「星の欠片」が出現する演出を実装
  - 既存の `onBossDefeated` が DARK_LORD 撃破で `Q`（星の欠片）を drop する実装を活用（既実装）
  ※ デバッグ用一時テストファイル（debug-boss*.spec.js）を削除。**全37テストグリーン**

### 2-3. ダンジョン進行のヒント　⚡ Sonnet（テキスト配置）　✅ 完了（2026-06-16）
- [x] ダンジョンの入り口付近に「ここに何があるか」を匂わせる石碑・看板
  - 全8ダンジョン入口付近に石碑（看板 `i`）を配置（ダンジョン名・テーマ説明・入口方向）
- [x] NPCの噂話が次のダンジョンの方向を示す（フィールドNPCの台詞設計）
  - タロ・すみっこずき・賢者エルン・ピンクあたまに方向ヒント台詞を追加

### 2-4. フィールドマップ拡張　🧠→⚡（マップ全体設計はOpus、作成はSonnet）　✅ 完了（2026-06-16）
- [x] フィールドを広げて8つのダンジョンへの道を整備
  - BFS（`scripts/check-field-connectivity.mjs`）でワールドマップ全体の徒歩到達性を機械検証。8ダンジョン中6つは徒歩で直接到達済み、残り2つは**既存のギミック付きの道**だと判明：
    - dungeon_4（炎の神殿, field 0,1）：field 1,1 西端の**爆弾で壊せる壁** `!` 経由（NPCハナが明示）
    - cave_1（沼地の洞窟, field 3,1）：field 3,0 の**鍵のかかった扉** `D`（鍵 `K` は東の魔物が守る）＋石押しパズル経由
    - field 4,0（空島）は飛行のみ＝終盤仕様（到達不可は意図どおり）
  - **唯一の穴：field 3,0 のヒントが皆無**だった（鍵・扉の存在が分からず詰む恐れ）→ 補完（下記）
- [x] 各ダンジョンへの道のりに小さな謎・ギミックを配置
  - 既存ギミック（爆弾壁・鍵扉・石押し）は前フェーズで配置済みと確認。本タスクでは**沼地への道のヒントを補完**：
    - field 3,0 (8,5) に石碑追加：「鍵のかかった扉・鍵は東の魔物が守る・扉は南の柵の切れ目」を案内
    - field 2,0 すみっこずきに「東の先に沼地の道・鍵扉の先に古い洞窟」の噂を追加
  - **回帰テスト固定**：`tests/field-connectivity.spec.js`（データレベルBFS）で全8ダンジョン入口の徒歩到達性（ギミック解放込み）＋沼地ヒント石碑の存在を保証。**全39テストグリーン**

---

## Phase 3：アクション・戦闘の深化

**目的：** 戦闘を「ただ殴るだけ」から「考えて戦う」ものにする。

### 3-1. チャージ攻撃（剣ビーム）　🧠→⚡（チャージ機構の設計はOpus、実装はSonnet）　✅ 完了（2026-06-16）
- [x] 攻撃ボタン長押しでエネルギーゲージが溜まる
  - 押した瞬間に通常の剣が出る（既存 `swordAttack()`）→ 押しっぱなしでチャージ開始（論理時間 `gameNow` 基準）
  - 離した時のチャージ量で発射を判定：**1/4未満=ビームなし／1/4以上=弱ビーム（剣ATK・非貫通）／満タン=強ビーム（剣ATK×2・貫通）**
  - チャージ中は移動速度 0.5倍（`getChargeMoveSpeedFactor`）
- [x] ゲージ満タンで「剣ビーム」を発動
  - 正面方向に光の剣撃を飛ばす（満タンは貫通）。ビームは projectile.js の `addProjectile({type:'beam'})` に乗せ、`checkProjHit` に貫通対応（`piercing` + `_hitIds` で二重ヒット防止）を追加
- [x] チャージ中のゲージ表示・エフェクト追加
  - プレイヤー上の CSS オーラ（`.charge-aura` → ready/full クラス）＋ビーム本体（`.sword-beam` / `.beam-strong`）。専用ドット絵スプライトは後回し（既存スラッシュ演出と同じ CSS 代用方針）
- ※ 実装：`game/constants.js`（CHARGE_* / BEAM_*）・`game/charge.js`（`createCharge` factory 新設）・`game/game.js`（factory 配線・gameTick で `tickCharge`・enterStage で `cancelCharge`）・`game/input.js`（攻撃キー/剣ボタンの press→剣+startCharge / release→releaseCharge・チャージ中の移動減速）・`game/projectile.js`（beam 描画＋貫通）・`game/css/effects.css`（オーラ・ビーム）・`game/main.js`（テストフック）。`tests/charge-beam.spec.js` 3本追加。**全42テストグリーン**（VRT 含む）

### 3-2. ボスの大型化　🧠 Opus（複数セル当たり判定の設計が難所）　✅ 完了（2026-06-16）
- [x] 2×2セルサイズ以上のボスを実装（**汎用の size:{w,h} 機構**として実装。試作1体で動作確認済み）
  - [x] 当たり判定を複数セルにまたがるよう拡張
    - `ENEMY_META.size:{w,h}`（省略時 1×1）を追加 → `buildEnemies` が `e.w/e.h` を付与
    - 共通ヘルパー `game/hitbox.js`（`enemyPointHit`/`enemyCenter`/`enemyW/H`）で占有範囲(AABB)判定に一般化。**1×1 では従来挙動と完全一致**（デグレなし）
    - 適用：投擲物/ビーム `checkProjHit`・接触 `checkEnemyContact`・剣 `swordAttack`（body 半サイズぶんリーチ拡張）・敵移動 `isPassableForEnemy`（w×h 占有）・プレイヤー `isPassable`（大型敵セルをブロック）
  - [x] スプライトも大型に対応（`render-chars.js` の `applyEnemySize` で wrapper を w×h セルに拡げ canvas を全面追従。24×24 `rockGolem` スプライト新規作成）
  - [x] 試作：新規 2×2 敵 `ROCK_GOLEM('G')`「岩のゴーレム」を定義。**dungeon_1（最初のダンジョン）のボスに正式採用**（isBoss:true・hitAndAway AI・hp30/atk4/def2・近接剣 range2.2＋岩投げ・HP50%加速）。ボス部屋 dungeon_1 `2,0` の魔王 X を G に置換（開始村の試作 G は撤去）
  - [x] **「動いてる感じ」を付与**：(1) hitAndAway AI で向き切替（`rockGolem{D/R/L/U}` エイリアス・左は flipX・差し替え時も大型 100% 維持）、(2) `board.css` の `golem-lumber` 重々しい揺れアニメ（`large-enemy` クラス）、(3) コア/眼の脈動
  - [x] **欠片整合：汎用 `dropsTriforce` フラグ**で担保（`onBossDefeated` ドロップ＋`calcTotalTriforces` カウントを DARK_LORD 決め打ちから一般化）。合計必要数は9個のまま不変
  - [x] テスト：`tests/large-enemy.spec.js` 3本＋全45テストグリーン（VRT 基準画像更新済み）。実機で dungeon_1 ボス部屋のゴーレム描画・ロック演出・AI 向き切替・エラーなしを確認
  - [x] **大型敵を複数種つくる**（2体目・3体目）：
    - **炎のサラマンドラ `FIRE_SALAMANDER('A')`**（dungeon_4 炎の神殿）：24×24スプライト（溶岩色・オレンジ炎系）・hp35/atk5/def2・hitAndAway・近接剣2.2＋炎石投げ・HP50%加速+攻撃頻度UP。向きエイリアス4つ
    - **氷のリヴァイアサン `ICE_LEVIATHAN('L')`**（dungeon_5 氷の廃墟）：24×24スプライト（氷蒼・白氷核脈動）・hp40/atk4/def3・hitAndAway・咬みつき2.5＋氷礫・HP50%加速。向きエイリアス4つ
    - dungeon_4/5 ボス部屋の `X` を `A`/`L` に置換。`dropsTriforce:true` で欠片整合は自動維持
    - `tests/large-enemy.spec.js` に「2×2 注入でエラーなし・wrapper 大型サイズ」テスト追加。**全46テストグリーン**
    - **砂嵐の蠍王 `SAND_SCORPION('N')`**（dungeon_2）・**深海の海蛇 `SEA_SERPENT('J')`**（dungeon_3）・**古森の巨人 `FOREST_GIANT('O')`**（dungeon_6）・**嵐の鷲王 `STORM_EAGLE('U')`**（dungeon_7）の4体を一括追加。64×64スプライト・ENEMY_META・向きエイリアス・JSON配置。**全46テストグリーン**（変更なし）
    - **Phase 3-2 完了。全8ダンジョンボスが固有大型ボスに**

### 3-3. ボスの弱点属性　🧠→⚡（データ構造設計はOpus、各ボス設定はSonnet）　✅ 完了（2026-06-16）
- [x] **`enemies.js` の `ENEMY_META` に `weakness` フィールドを新設**
  - `weakness: { type, multiplier }`（type='sword'|'beam'|'arrow'|'boomerang'|'bomb'）。未定義なら弱点なし＝全攻撃等倍（後方互換）
- [x] 各ボス（8大型ボス）に「弱点アイテム」を設定（武器をバラけさせて使い分けを促す）
  - 岩のゴーレム→爆弾(×3) / 氷のリヴァイアサン→爆弾(×3) / 炎のサラマンドラ→弓矢(×2) / 嵐の鷲王→弓矢(×2) / 深海の海蛇→剣ビーム(×2) / 古森の巨人→爆弾(×2) / 砂嵐の蠍王→ブーメラン(×3)
- [x] `dealDamageToEnemy()` で攻撃種別 `atkType` を受け取り、弱点なら倍率を適用するよう改修
  - 攻撃元が種別を渡す：剣→`'sword'`・投擲物→`proj.type`（'arrow'/'boomerang'/'beam'）・爆弾→`'bomb'`。倍率は def 適用前の素ダメージに乗算
- [x] 弱点ヒット時に特別なエフェクト・SEを出す（プレイヤーへのフィードバック）
  - ダメージポップアップを「WEAK! -N」のオレンジ大文字（`.weak-dmg`）に・敵中心に放射状フラッシュ（`.weak-burst`）・高めの SE（`key` 音を代用）
- ※ 実装：`shared/enemies.js`（weakness フィールド＋8ボス設定）・`game/combat.js`（`dealDamageToEnemy(e,dmg,atkType)` 弱点判定＋`showWeaknessBurst`）・`game/projectile.js`（proj.type/bomb を atkType として渡す）・`game/game.js`（wrapper に atkType・`dealDamageToEnemyById`/`injectTestEnemy` の type 引数）・`game/main.js`（`__game.dealDamage`/`injectEnemy` の type）・`game/css/effects.css`（weak-dmg/weak-burst）。`tests/weakness.spec.js` 4本追加。**全50テストグリーン**

### 3-4. ブーメランのスタン効果　⚡ Sonnet（既存処理への追加）
- [x] ブーメランが敵に当たった時、一定時間スタン（動けなくなる）
- [x] スタン中は ⭐ エフェクト表示・敵の移動・攻撃をスキップ（BOOMERANG_STUN_MS=1500ms）

---

## Phase 4：サブアイテム拡充

**目的：** 「どのアイテムをどこで使うか」という楽しさを増やす。

> **⚠️ 共通ルール（新アイテム実装時）：エディタのプレビュー設定に所持トグルを必ず追加する**
> 新しいサブアイテム/能力（はしご・笛・ロウソク等）を実装したら、ユーザーが動作確認できるよう
> **エディタの「▶ プレビュー設定」ダイアログにチェックボックスを追加**する（`editor/index.html` の
> `#preview-settings-grid` に `<input id="ps-xxx">`、`editor/editor-io.js` の `getPreviewSettings()` と
> `openPreview()` の URL 組み立てに `ps_xxx` を追加、`game/game.js` の `fromEditor` 分岐で `ps_xxx` を解釈）。
> 動作確認を前提にした能力（移動・探索系）はデフォルトでチェック ON にしておくと確認が楽。
> 参考実装：はしご（`ps_ladder`・デフォルト ON）／翼の羽衣（`ps_wingrobe`・デフォルト OFF）。

### 4-1. はしご　🧠→⚡（通行判定への影響設計はOpus、実装はSonnet）　✅ 完了（2026-06-16）
- [x] 「はしご」アイテムを実装（**自動わたり方式**＝初代ゼルダ式。所持しているだけで効果）
  - 操作不要：両隣（交差軸）が地上の水/穴を1セルだけ自動で渡れる
  - **2連続の水/穴は渡れない**（橋脚＝交差軸の隣が地上にならないため自然にブロック）
  - 対象タイル：水（WATER）＋**新タイル 穴（PIT='x'）**。穴は徒歩通行不可なので「落下」は発生しない（構造的に踏み込めない＝安全）
- [x] はしごが必要なパズルステージの追加（dungeon_3 0,0 最下段：はしご宝箱→単セルの穴2つを渡って報酬宝箱）
- ※ 実装：`shared/tiles.js`（PIT タイル）・`shared/items.js`（ladder 定義）・`game/passable.js`（`LADDER_OVER`／`isLadderBridge`／`isLadderBank`／PIT ブロック）・`game/game.js`（`player.hasLadder` フラグ初期化2箇所・`ps_ladder` プレビュー・getState 公開）・`game/player.js`（宝箱 `type:'ladder'`／giveSubItem passive 分岐）・`game/render-board.js`＋`css/tiles.css`（穴の描画）・`game/render-chars.js`（水/穴上のはしごオーバーレイ）・`editor/editor-props.js`（宝箱の「はしご」選択肢）・`work/blade-of-lumia.json`（dungeon_3 パズル）。`tests/ladder.spec.js` 4本追加。**全57テストグリーン**
- ※ 取得管理は `hasWingRobe` と同型のブールフラグ（save/load 自動対応・passive サブアイテムスロットの混乱を回避）

### 4-1b. はしごの描画を「セル固定」に修正する　⚡ Sonnet（描画位置の修正のみ）　✅ 完了（2026-06-16）
> **背景（ユーザー指摘・2026-06-16）：** 現状のはしご描画は**プレイヤーに張り付くオーバーレイ**になっており、
> プレイヤーが乗っている1セルにだけ・プレイヤーと一緒に動いてしまう（＝はしごがプレイヤーを追従する）。
> **これは誤り。** 初代ゼルダの伝説のように、はしごは「**架かっているセル（水/穴セル）の上に固定で描画**」され、
> プレイヤーはその上を歩く（はしごはプレイヤーの移動に追従しない）のが正しい。
>
> **現状の実装：** `game/render-chars.js` の `addLadderOverlay(div)` が、**プレイヤーの char-abs 要素の中**に
> ladder スプライトを `z-index:-1` で入れている。プレイヤーが乗っている水/穴セルにだけ・移動と一緒に動く。
>
> **あるべき実装（修正方針）：**
> - はしごは **board 側（セル）に描画**する。プレイヤー要素には入れない。
> - **「はしごが架かっている水/穴セル」を判定して、そのセルに ladder スプライトを敷く**。
>   - 「架かっている」の定義：はしご所持中（`player.hasLadder`）で、その水/穴セルが `isLadderBridge`（交差軸の両隣が地上）を満たすセル。
>   - 向き（縦 `ladderV` / 横 `ladderH`）は**そのセル自身の地形**で決める（プレイヤーの向きではない）：左右が地上なら横向き、上下が地上なら縦向き。
>     ※ プレイヤーの移動方向に合わせるのは誤り。セルの「橋がどっち向きに架かるか」で決まる。
> - 描画タイミング：`render-board.js`（セル描画）に組み込むか、`render-chars.js` の `renderChars` で**水/穴セルごとに**敷く。
>   - 注意：`passable.js` の `isLadderBridge`/`isLadderBank` は factory 内ローカル関数。描画側から同じ判定を使えるよう、(a) `createPassable` の戻り値に `isLadderBridge` を加えて export するか、(b) 描画側に同等の軽い判定を持たせる、のどちらかにする（(a) を推奨：判定の二重定義を避ける）。
> - **はしごを常時表示するか/所持時のみか**：初代ゼルダは「はしごを持っていて、かつ架かるセルに乗ったとき」だけ表示。
>   ここは「**はしご所持中は、架かるべき全セルに常時表示**」でも「**プレイヤーが乗っているセルだけ表示**」でもよいが、
>   少なくとも「プレイヤーに追従して別セルへ動く」現象は無くすこと。**まず『プレイヤーが乗っている水/穴セルに、そのセル固定で表示』が最小修正**。
> - 既存の `addLadderOverlay`（プレイヤー要素への追加）は削除する。
>
> **テスト：** `tests/ladder.spec.js` に「はしごスプライトがプレイヤー要素の**外**（セル側）に描画される」or「プレイヤーが乗っている水/穴セルの DOM にはしごが付く」ことを確認する spec を追加してもよい（描画位置の回帰防止）。
>
> **スプライト自体は流用可：** `shared/sprites-items.js` の `ladderV` / `ladderH`（16×16・`ladder` パレット）は作成済み。向き判定とアタッチ先だけ直せばよい。

- [x] `addLadderOverlay`（プレイヤー要素内に常時敷く旧実装）を撤去し、**初代ゼルダ式**＝「**渡っている最中だけ・足元の水/穴セルに1枚出て、渡り切ると消える**」に修正
- [x] はしごは char-layer の `.char-ladder`（セル固定・プレイヤー非追従）として描く。プレイヤーが今重なっている水/穴の橋セルにだけ出す
- [x] 向きは**セルの地形**（左右地上＝横／上下地上＝縦）で決める
- [x] `isLadderBridge` を描画側から使えるよう `ladderOrientationAt(r,c)` を新設して `createPassable` の戻り値に追加（向き判定込み・判定の二重定義を避ける）
- [x] z-index：セル描画より上・プレイヤー/敵（char-abs）より下（`.char-ladder` を `z-index:-1`）
- ※ 当初「全橋セルに常設描画」する誤実装をしてユーザー指摘で修正（DECISIONS.md 参照）。常設ではなく「踏み込んだセルだけ・渡り切れば消える」が正
- ※ 実装：`game/passable.js`（`ladderOrientationAt(r,c)` 新設・export）・`game/game.js`（destructure に追加・`createRenderChars` に `ladderOrientationAt` 注入）・`game/render-chars.js`（`updateLadderOverlay()` 新設、`updatePlayerCharEl`/`renderChars` から呼ぶ）・`game/css/tiles.css`（`.ladder-sprite` セル全面）。`tests/ladder.spec.js` に「渡っている最中だけ出る／渡り切ると消える」回帰テスト1本（計5本）。**全58テストグリーン**

### 4-1c. はしごの「進入軸」通行判定に修正する　⚡ Sonnet　✅ 完了（2026-06-17）
> **背景（ユーザー指摘・2026-06-16〜17）：** 4-1b 完了後も2つの不具合が残っている。
>
> **不具合①：連続する水/穴を「渡れてはいけない方向」に渡れてしまう（核心バグ）**
> - 現状の `isLadderBridge(r,c)` は「**横向きの橋（左右が陸）OR 縦向きの橋（上下が陸）のどちらかが成立すれば通行可**」という
>   **方向を問わない**判定になっている。
> - 例：dungeon_3 0,0 の col4 は縦に水が連続している（row2〜7 が `~`）。各水セルは「左右(col3,col5)が陸」なので
>   **横向きの橋としては全部成立**してしまう。その結果、プレイヤーが col4 を**縦（下）方向に歩いても**各セルが
>   横向き橋として通行可になり、**連続した水を縦にスルスル渡れてしまう**。
> - **あるべき仕様：** はしごで渡れるのは「**進行方向に1セルだけ・その先が陸**」のときのみ。
>   水/穴のセルが進行方向に連続している場合、その方向には渡れない。
>
> **あるべき実装（①の核心・唯一の修正点）：**
> - ルールは1つに集約できる：
>   **「陸セルへはどの方向でも移動できる。水/穴セルへ入る移動は『その進入方向の軸で1セル橋（その先が陸）』のときだけ許可する」**
> - 具体：`isPassable` に**移動方向（または進入軸）を渡す**。水/穴セルへ入ろうとするとき、
>   - **横移動（左右）で入る** → そのセルが**横向きの橋**（左右が陸＝1セル幅）のときだけ通行可
>   - **縦移動（上下）で入る** → そのセルが**縦向きの橋**（上下が陸＝1セル幅）のときだけ通行可
>   - `ladderOrientationAt(r,c)` が返す向きと**進入軸が一致**するときだけ許可する。
> - これにより：
>   - col4（縦連続水）で**下**を押す → 縦の橋ではない → **ブロック**（落ちない・①が直る）
>   - col4 で**左右**を押す → 隣が陸 → 渡れる（1セルだけ）
>
> **③「軸ロック」は採用しない（検討の結果ボツ）：**
> - 一度「はしごの上では橋の軸方向にしか動けない」案を検討したが、
>   例えば「横向きはしご・上=陸・下=水」の状況で**上（陸）へ抜けられないのはストレス**になる。
> - 上記①のルール（陸へはいつでも出られる／水・穴への進入だけ軸一致を要求）にすれば、
>   - 連続水を縦に渡るバグは消える（水への進入は軸一致が必要）
>   - かつ、はしごの途中から横の陸へ自由に抜けられる（ストレスなし）
>   ——という両立が**軸ロックなしで自然に**実現できる。よって軸ロックは入れない。
>
> **描画（`updateLadderOverlay`）も同じ条件に揃える：**
> - はしごを出すのは「プレイヤーが乗っている水/穴セルが、**今の進入軸の橋**であるとき」だけにする。
>   向きも進入軸で決める（縦移動で入った縦橋＝`ladderV`／横移動で入った横橋＝`ladderH`）。
> - ※ 現状の描画は「セルの地形だけで向きを決め、軸を問わず出す」ため、通行判定を①に直したら描画条件も合わせる。
>
> **不具合②：プレビュー設定の「はしご保持」が実機で効かない**
> - コード配線自体は存在する（editor の `ps-ladder` チェックボックス → URL `ps_ladder=1` → `game.js` で `player.hasLadder=true`）。
>   テストハーネスでは `ps_ladder=1` で `hasLadder=true` になることを確認済み。
> - だが**実機で効かず、宝箱から取り直さないとはしごが架からなかった**との報告。**次セッションで実際の「編集→プレビュー起動」を再現して原因調査**する。
> - 仮説：(a) ブラウザ／Vite キャッシュ（このプロジェクトの頻出原因）、(b) 編集中マップが localStorage 未保存で別データを見ている、
>   (c) 4-1b の「渡り中だけ表示」に変えたため陸にいる間ははしごが見えず「効いていない」ように見えた。
> - ①を直すと描画条件も変わるので、**①修正後に②を実機再現して確認**する順がよい。
>
> **不変条件（要テスト固定）：はしごは多段に伸びない＝橋の上から交差軸のさらに先の水へは渡れない**
> - 懸念ケース：プレイヤーが**水/穴の橋セルの上**にいて（中身は水）、上下が水・上の水のさらに上が陸、という配置。
>   「上の水セル」を `isLadderBridge` で判定すると `vert` は「上(row-2)=陸 かつ 下(row,c)=**水**」となり、
>   `isLadderBank(row,c)` が**水を橋脚に算入しない**ため false → **上の水へは渡れない**（現状でも防げている）。
> - これは `isLadderBank` の「水/穴は橋脚にしない」が実質「はしごの上から追加で架けられない」役割を果たしている。
>   この**不変条件を回帰テストで固定**しておく（将来 isLadderBank を触ったときに多段はしごを生まないため）。
> - ※ 区別：プレイヤーが**陸セル**にいて上隣が1セル水・その上が陸 ＝ 正しい縦橋なので渡れて正解（バグではない）。
>
> **テスト：** `tests/ladder.spec.js` に
> - 「**縦連続水を縦方向には渡れない**（col4 を下に進んでも止まる）」
> - 「同じ col4 を**横方向には1セルだけ渡れる**」
> - 「横向き橋の上から**上（陸）へ抜けられる**（軸ロックされていない）」
> - 「**橋（水/穴）の上から交差軸のさらに先の水へは渡れない**（はしごが多段に伸びない不変条件）」
> を追加する（①の回帰防止）。

- [x] `isPassable(nx,ny,axis)` に進入軸を渡し、水/穴への進入は「進入軸の橋（その軸の両隣が陸）」のときだけ許可するよう修正。`isLadderCrossable(r,c,axis)` を新設（`isHorizBridge`/`isVertBridge` に分離）
- [x] `ladderOrientationAt(r,c,axis)` を進入軸対応に（軸の橋でなければ null）。描画と通行判定が同じ向き定義を使う
- [x] `updateLadderOverlay`（描画）も `heroDir` から進入軸を出して「進入軸の橋のときだけ出す・向きも軸で決める」条件に揃えた
- [x] 軸ロック（はしご上は橋方向のみ移動可）は**入れない**。代わりに「既に乗っている水/穴セルは進入軸チェック対象外」とし、陸へはどの軸でも抜けられる手触りを実現
- [x] プレビュー設定「はしご保持」が実機で効かない件 → **真因特定・修正済み（2026-06-17 追加修正）**：`editor/editor.js` の canvas クリック経由プレビュー起動ハンドラが `ps` に `ladder`/`wingrobe` を取りこぼしており `ps_ladder=0` になっていた。`editor-io.js` の `getPreviewSettings` と重複定義だったのが温床（直接 URL では効くため当初「正常」と誤判定した）。両フィールドを追加して修正。回帰テスト（canvas クリック経由で `ps_ladder=1` が iframe URL に渡る）を追加
- [x] **描画の追加修正（2026-06-17）**：半セル straddle で2枚出る不具合 → プレイヤー中心に最も近い橋セル1枚に限定。向き変更で消える不具合 → 向きを「セルの地形」で決める（軸非依存）に戻し、軸チェックは通行判定のみに限定
- [x] `tests/ladder.spec.js` に計6本追加（縦連続水は縦に渡れない／横には1セル渡れる／横橋から上の陸へ抜けられる＝軸ロックなし／橋の上から交差軸の先の水へは渡れない＝多段不変条件／半セルで2枚出ない／向きを変えても消えない）＋editor 1本。**全65テストグリーン**

### 4-2. 笛　🧠 Opus（ワープ・隠し出現の仕組み設計）　✅ 完了
- [x] 「笛」アイテムを実装（active サブアイテム・`subItems.flute`・`type:'magic'`・`uses:Infinity`）
  - サブアイテムとして装備し、使用すると魔法の音楽を奏でる（`playFlute()`）
  - 効果1：`stageData.fluteEffect={type:'reveal'}` で `ss.flutePlayed=true`→`showConditions` の新トリガー `flutePlayed` で隠し入口が出現
  - 効果2：`stageData.fluteEffect={type:'warp', destId}` で `exitRegistry` のワープポイントへ移動
- [x] 笛が必要なギミックを各ダンジョン・フィールドに追加（field 2,0 に reveal＋隠し入口、secret_grotto に warp）
- [x] **エディタのプレビュー設定に「🎵 笛」トグルを追加**（getPreviewSettings 2箇所・ステージ fluteEffect 入力・宝箱内容・トリガー）
- [x] flute スモークテスト4本グリーン（全71テストグリーン）

### 4-3. ロウソク　⚡ Sonnet（茂み切り機能の拡張）　✅ 完了（2026-06-18）
- [x] 「ロウソク」アイテムを実装（active magic サブアイテム・`subItems.candle`・`type:'magic'`・`uses:Infinity`。笛と同型）
  - 前方の茂み（BUSH）を燃やせる（既存の `cutBushes` 機構を再利用＝通行可化・再描画も既存パイプライン）
  - 燃やすと `ss.bushBurned=true` → `evaluateConditions()` で `showConditions` の**新トリガー `bushBurned`** で gate された隠し通路・隠し入口・隠しアイテムが出現（笛の `flutePlayed` と同型）
  - **剣で切っても `bushBurned` は立たない**＝ロウソク固有の発見役割（剣＝通行可化のみ／ロウソク＝通行可化＋発見トリガー）
- [x] ロウソクを使った発見ギミックの追加（field 2,0：(2,6) にロウソク宝箱・(4,7) に茂み・(4,8) に `bushBurned` で出現する隠し入口→`secret_grotto`）
- [x] **エディタのプレビュー設定に「🕯 ロウソク」トグルを追加**（`ps-candle`・デフォルト ON・両 getPreviewSettings に追加＝[[blade-preview-settings-duplicated]] の教訓）。宝箱内容に「ロウソク」・トリガーに「bushBurned」も追加
- ※ 実装：`shared/items.js`（candle 定義）・`game/conditions.js`（bushBurned トリガー）・`game/game.js`（`playCandle()`＋`showCandleFireEffect()`・useSubItem 分岐・ps_candle・getState に hasCandle）・`shared/sounds.js`（`fire` SE）・`game/css/effects.css`（`.candle-fire` 炎演出）・エディタ4ファイル（index.html/editor-io.js/editor.js/editor-props.js）・`work/blade-of-lumia.json`（デモ配置）。`tests/candle.spec.js` 4本。**全75テストグリーン**

### 4-3b. ロウソクの炎で敵にダメージ　⚡ Sonnet（既存ダメージ処理への攻撃種別追加）
> **背景：** 4-3 のロウソクは「茂みを燃やす」発見専用。ユーザー方針で**炎で前方の敵にダメージを与える攻撃要素**を追加する（次タスク）。
- [ ] `playCandle()` で前方セルに敵がいれば `dealDamageToEnemy(e, dmg, 'fire')` でダメージを与える（攻撃種別 `'fire'` を新設）
  - ダメージ量は控えめに（ロウソクは主に発見用途・剣の補助）。値は実装時に決め、`game/constants.js` に集約候補
  - 茂み燃やしと両立：前方が茂みなら燃やす＋（その先/同セルに敵がいれば）炎ダメージ、という素直な処理にする
- [ ] **Phase 3-3 の弱点属性（`weakness.type`）と連動**：`'fire'` を弱点に持つボス/敵を設定できるようにする（例：氷・植物系の敵が炎に弱い）。`shared/enemies.js` の該当敵に `weakness:{type:'fire',multiplier}` を付与
- [ ] 炎ヒット時のエフェクト/SE（既存の `.candle-fire` 演出・`fire` SE を流用、必要なら敵中心に着火演出）
- [ ] テスト：`tests/candle.spec.js` に「前方の敵に炎ダメージが入る」「炎が弱点の敵には倍率ダメージ」を追加
- ※ 実装は `dealDamageToEnemy` に種別を渡すだけ（Phase 3-3 で `atkType` 引数は実装済み）。当たり判定は前方1セル（剣の茂み切りと同じ前方セル判定）でよい

### 4-4. ブーメランでアイテム取得　⚡ Sonnet（既存ブーメラン処理の拡張）
- [ ] ブーメランが通過したマスのアイテムを回収できる機能
  - 届かない場所の鍵・ルピーを取れる
- [ ] この機能を使わないと解けないパズルを設計

### 4-5. アイテムの組み合わせギミック　🧠→⚡（ギミック設計はOpus、配置はSonnet）
- [ ] 弓矢で遠くのスイッチを撃つ仕掛け
- [ ] ブーメランで炎を消す（または火をつける）仕掛け
- [ ] 爆弾＋特定タイルの組み合わせパズル

---

## Phase 5：謎解き・パズルギミック

**目的：** 「頭を使う」楽しさを追加して探索に深みを出す。

### 5-1. 色スイッチ・色ゲート　🧠→⚡（連動ロジック設計はOpus、エディタ対応はSonnet）
- [ ] 赤・青などの色属性スイッチとゲートを実装
  - 赤スイッチON → 赤ゲート開、青ゲート閉
  - 連動する複雑なパズルが作れるように
- [ ] エディタ対応（色属性の設定）

### 5-2. 隠し通路・隠し入口　⚡ Sonnet（既存ギミックの配置）
- [ ] 爆弾で壊せる壁（既存）を使った隠し部屋の増設
- [ ] 看板の「何もない」の裏に宝箱を置くフェイクギミック
- [ ] ロウソクで草を燃やすと現れる隠し入口

### 5-3. 敵を使ったパズル　🧠 Opus（敵AI・誘導ロジックの設計）
- [ ] 「敵をスイッチの上に誘導する」パズル設計
  - 敵AIが石を踏んで押す・スイッチに乗るなどの仕掛け

---

## Phase 6：世界観・NPC・テキスト

**目的：** 世界に「生活感」と「歴史」を与え、探索のモチベーションを高める。

### 6-1. NPCの台詞充実　⚡ Sonnet（テキスト作成・配置）
- [ ] 各村・フィールドのNPCに「噂話」台詞を追加
  - 「東の洞窟に奇妙な音がするらしい」→実際に東にダンジョンがある
  - 「星の欠片を集めると古代の祭壇が目覚めると言い伝えがある」
- [ ] ボス撃破後に変化するNPCの台詞（「ありがとう！」系）

### 6-2. 世界の歴史を語る石碑・壁画　🧠→⚡（ストーリー断片の構成はOpus、配置はSonnet）
- [ ] ダンジョン内に石碑タイルを追加
- [ ] 石碑に「ザーネルがかつて何をしたか」の断片テキスト
- [ ] 読み進めることでザーネルの過去が徐々に分かる

### 6-3. フィールドの充実　⚡ Sonnet（エディタでのマップ作成）
- [ ] 廃城・廃村エリアを追加（かつての戦いの跡）
- [ ] 壊れた遺跡エリアを追加

### 6-4. 「嘘をつくNPC」　⚡ Sonnet（テキスト配置）
- [ ] 一部NPCが嘘の情報を言う（プレイヤーの裏をかく遊び）
  - 「あの洞窟には何もないよ」→実は宝がある

---

## Phase 7：成長・強化システム

**目的：** 「強くなっていく」実感を与える。

### 7-1. 剣の段階的強化　🧠→⚡（バランス設計はOpus、各剣の追加はSonnet）
- [ ] 複数ランクの剣を実装
  - 木の剣（初期）→ 銅の剣 → 銀の剣 → 聖剣
  - 各剣でATK値・剣エフェクトが変化
- [ ] 各剣をダンジョン・宝箱・隠し場所に配置

### 7-2. 防具・盾の強化版　⚡ Sonnet（既存装備の拡張）
- [ ] 上位盾・上位防具の実装
  - 防御力が上がるだけでなく、見た目も変化

### 7-3. ハートの器の増設　⚡ Sonnet（配置作業）
- [ ] 現在より多くのハートの器を隠し場所・強敵撃破報酬に配置
- [ ] 最大HP上限を増やす

### 7-4. リスク・リワード設計　🧠 Opus（難易度・報酬バランスの判断）
- [ ] 「この扉を開けると強い敵が出るが宝もある」系の選択要素
- [ ] 高難度任意エリアへの報酬配置
- [ ] ルピーを払って報酬を引けるNPCショップ（ガチャ的要素）

---

## Phase 8：やりこみ・UX改善

**目的：** 二周目の楽しさ・快適さを高める。

### 8-1. ゲームオーバー体験改善　🧠→⚡（ヒント発火条件の設計はOpus、実装はSonnet）
- [ ] ヒントシステム：同じ場所で3回死ぬとフクロウNPCがヒントを言う
- [ ] デスマーカー：死んだ場所に墓が立ち、そこに行くと少しルピーが貰える

### 8-2. スコア・実績　⚡ Sonnet（集計・表示の実装）
- [ ] クリアタイム表示（二周目モード）
- [ ] 探索率・撃破数などのスコア表示

### 8-3. UX・操作感　⚡ Sonnet（既存処理への追加が中心）
- [ ] バイブレーション対応（Web Vibration API）
- [ ] BGM連動：ボス部屋BGMのテンポアップ
- [ ] タッチジェスチャーの改善

### 8-4. ゲーム全体のバランス調整（プレイヤー強さ vs 敵強さ）　🧠 Opus（数値バランスの全体判断）
> **背景：** 各機能を個別に実装してきたため、プレイヤーが強くなりすぎている箇所がある。
> **ゲームが一通り完成した段階（コンテンツが出揃ってから）にまとめて調整する。**
> 個別に都度いじると全体の難易度感がブレるため、最後にプレイ通しで一括チューニングするのが目的。
- [ ] **既知の要調整点：チャージ攻撃（剣ビーム）が強力すぎる**（Phase 3-1 で実装）。雑魚も比較的簡単に倒せてしまうので、威力・チャージ時間・貫通条件・クールダウン等を見直す
  - 調整候補：満タンビームの倍率（`BEAM_STRONG_MULT`）/ チャージ所要時間（`CHARGE_FULL_MS`）/ 発射のクールダウン追加 / ビームに弱点属性（Phase 3-3）でない敵には等倍 など
- [ ] プレイヤー側の強化要素（剣ランク・ビーム・サブアイテム・二周目2倍）と、敵・ボスのHP/ATK/出現数を**通しプレイで突き合わせて調整**
- [ ] 各ダンジョンの難易度カーブ（序盤→終盤）が緩やかに上がっているか確認・調整
- [ ] ※ 数値は `shared/enemies.js`（ENEMY_META）・`shared/items.js`・`game/constants.js`（CHARGE_*/BEAM_*/SWORD_*）に集約されているので、ここを中心に調整する

---

## 実装優先順位まとめ

```
Step 1: まず技術基盤を整える（Phase 0）
  → Phase 0-0: テスト基盤整備（Playwright E2E/VRT）← 分割前の安全網。最初にやる
  → Phase 0-1: 決定論的ゲームループ（フレーム制御可能な構造）← テストしやすさの土台
  → Phase 0-2: game.js モジュール分割（4098行を16モジュールへ）※0-1と同時進行可
  → Phase 0-3: sprites.js / editor.js / game.css 分割
  → Phase 0-4: 必要なスプライト一覧の洗い出し
  → Phase 0-5: エディタ機能拡張（スプライト/キャラ/アイテム作成支援）

  ※ 0-0 のテスト網を先に張ってから分割すること
  ※ 0-1 の決定論ループ化と 0-2 の分割は同じ game.js を触るので同時に進めると効率的
  ※ ここが完了してから初めてゲーム機能を安全に追加できる

Step 2: ゲームの骨格を完成させる（Phase 1〜2）
  → Phase 1: ストーリー基盤（名称変更・老賢者・祭壇・暗黒の塔）
  → Phase 2: 8ダンジョン・エンディングフロー

Step 3: ゲームを面白くする（Phase 3〜6）
  → Phase 3: アクション深化（剣ビーム・大型ボス・弱点属性）
  → Phase 4: サブアイテム拡充（はしご・笛・ロウソク）
  → Phase 5: 謎解きギミック（色スイッチ・隠し通路）
  → Phase 6: 世界観・NPC（噂話・石碑・嘘をつくNPC）

Step 4: 完成度を上げる（Phase 7〜8）
  → Phase 7: 成長システム（剣ランク・強化防具）
  → Phase 8: やりこみ・UX改善

Step 5: 必要になったら（Phase 0後半）
  → TypeScript 採用
  → esbuild バンドル
```

---

## 現在の実装状態（参考）

| 機能 | 状態 |
|---|---|
| フィールド移動 | ✅ 実装済み |
| ダンジョン（複数） | ✅ 一部実装済み |
| 剣攻撃・盾 | ✅ 実装済み |
| ブーメラン・弓矢・爆弾 | ✅ 実装済み |
| ボス戦（DARK_LORD系） | ✅ 実装済み |
| 星の欠片収集→エンディング | ✅ 実装済み（Phase 1-3 で終盤フロー分岐化：祭壇あれば誘導／無ければ従来どおり即エンディング） |
| 8ダンジョン | ⬜ 未達成（拡張必要） |
| 古代の祭壇→翼の羽衣→暗黒の塔 | ✅ 完了（1-3 基盤＋1-4 祭壇＋1-5 飛行/暗黒の塔）。全収集→祭壇で翼の羽衣→飛行で虚空を越えて塔→ザーネル→エンディングが一本に繋がる |
| ラスボス ザーネル（最終ボス・撃破でエンディング） | ✅ 完了（dark_tower ボス部屋に `Z` 配置・isFinalBoss 撃破でエンディング発火を実ブラウザ確認） |
| 翼の羽衣による飛行移動 | ✅ 完了（1-5：`player.flying`・F/🪽 トグル・自然物（空/水/木/茂み/柵）飛び越え・山/壁/家/門は不可・地上のみ着陸・自動着陸・場外クランプ） |
| 老賢者のストーリー導入 | ✅ 完了（Phase 1-2：最初の村に老賢者NPC配置・ストーリー導入台詞） |
| チャージ攻撃（剣ビーム） | ✅ 完了（Phase 3-1：押下で剣＋長押しチャージ→離してビーム。1/4以上=弱ビーム/満タン=貫通強ビーム。チャージ中は移動半速。charge.js + CSS オーラ。42テストグリーン） |
| はしご | ✅ 完了（Phase 4-1：自動わたり方式・水/穴を1セル渡れる・PIT タイル追加・dungeon_3 パズル。57テストグリーン） |
| 笛 | ✅ 完了（Phase 4-2：active サブアイテム・reveal（隠し入口出現）/warp（ワープ）の2効果・`stageData.fluteEffect`・showConditions の `flutePlayed` トリガー・エディタ対応・71テストグリーン） |
| ロウソク | ✅ 完了（Phase 4-3：active magic サブアイテム・前方の茂みを燃やす（cutBushes 再利用）・`ss.bushBurned`→showConditions の `bushBurned` トリガーで隠し通路/入口出現・エディタ対応・75テストグリーン） |
| 色スイッチ | ⬜ 未実装 |
| 剣の複数ランク | ⬜ 未実装 |
| テスト基盤（Playwright E2E/VRT） | ✅ Phase 0-0 完了（起動・移動・セーブ/ロード・ステージ遷移の4スモーク＋VRT、計5テストがパス） |
| game.js モジュール分割 | ✅ 完了（4098行 → 1268行・約70%削減。0-2b で旧本体削除済み・13テストグリーン） |
| TypeScript・ビルド検討（0-6） | ✅ 完了（plain ESModule 維持と判断。計測根拠は DECISIONS.md。Phase 0 クローズ） |
| game.css 分割 | ✅ 完了（css/ 配下11ファイル + @import エントリ） |
| sprites.js 分割 | ✅ 完了（player/enemies/items/tiles + aggregator） |
| editor.js 分割 | ✅ 完了（8モジュール：editor-state/layers/world/palette/canvas/props/io + エントリ142行。スモークテスト4本追加。17テストグリーン） |

| スプライトエディタ | ✅ 完了（🎨タブ・グリッド可変・パレット・マルチフレーム・反転・既存読込・コードエクスポート。editor-sprite.js。19テストグリーン） |
| キャラクター定義エディタ | ✅ 完了（🧙タブ・敵リスト選択・HP/ATK/DEF/速度/攻撃パターン/フェーズ編集・JSコード生成。editor-character.js 492行。23テストグリーン） |
| アイテム定義エディタ | ✅ 完了（📦タブ・ITEM_META+EQUIP_META選択・タイプ別フィールド・uses形式切替・JSコード生成。editor-item.js。26テストグリーン） |
| タイルバリエーション設計支援 | ✅ 完了（🗺タブ・テーマプリセット8種・パレット編集・JS出力。editor-tile.js。29テストグリーン） |
