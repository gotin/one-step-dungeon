# Blade of Lumia – 進捗ログ

> **このファイルの役割：** 作業セッションごとの「やったこと・次やること」を記録する。  
> **セッション開始時：** まず最新エントリの「▶ 次やること」を読んで再開する。  
> **セッション終了時：** 新しいエントリを追記する。  
>
> 関連ファイル：
> - `PLAN.md` … 何を作るかの計画（チェックボックスで進捗管理）
> - `DECISIONS.md` … 設計判断・学び・ハマりどころの記録
> - `IDEA.md` … アイデア集・ストーリー設定

---

## 📍 現在地（常に最新に保つ）

- **進行中フェーズ：** Phase 0 完了 → Phase 1 へ
- **進行中タスク：** **Phase 0-5 全完了**（スプライト / キャラクター / アイテム / タイルバリエーション）→ 次は **Phase 1-1**（テキスト・名称変更）または Phase 0-6（TS/ビルド検討）
- **直近の状態：** Phase 0-5 最終タスクの **タイルバリエーション設計支援** を実装。`editor/index.html` に🗺タイルタブ＋`#view-tile` を追加、`editor/editor-tile.js` を新設。機能：テーマプリセット8種（デフォルト/炎/水/氷/森/砂漠/空中/闇）のタイルパレット表示・タイルクリックでパレット編集・色スウォッチ変更・大型プレビューキャンバス・テーマ別 JS コードエクスポート。スタイルは `editor/editor-tile.css` に分離。スモークテスト3本追加。**全29テストグリーン**（デグレなし）。








---

## セッションログ

<!-- 新しいエントリを上に追加していく（最新が一番上） -->

### 2026-06-15 — Phase 0-5（完了）：タイルバリエーション設計支援を実装

**やったこと：**
- **🗺 タイルタブ＋`#view-tile` を `editor/index.html` に追加**（3ペイン：左=テーマ選択+タイルグリッド、中央=パレットエディタ、右=エクスポートコード）
- **`editor/editor-tile.js` を新設**（自己完結モジュール・`initTileEditor()` / `onLeaveTileEditor()` を export）：
  - テーマプリセット8種（デフォルト/炎/水/氷/森/砂漠/空中/闇）：各テーマで主要ダンジョンタイル（block/door/swG/gateG/water/breakableWall/mapEnter/doorway/doorwayBoss/doorwayLocked）の色パレットを上書き定義
  - タイルプレビューグリッド：テーマ別にキャンバスで各タイルスプライトを描画・クリックで選択
  - パレットエディタ：選択タイルの大型プレビューキャンバス + 色スウォッチ（クリックで color input）→ 色変更時にプレビューとグリッドをリアルタイム更新
  - テーマ切り替え：セレクトボックスで変更 → 全タイルグリッド再描画
  - リセット：「テーマ初期値に戻す」ボタンでそのテーマのプリセット値に戻す
  - エクスポート：デフォルト（TILE_PAL）から変更されたタイルのみを `TILE_PAL_OVERRIDE` 形式で JS コード生成 → クリップボードコピー対応
- **`editor/editor-tile.css` を新設**（3ペインレイアウト・タイルプレビューグリッド・パレットスウォッチ・色スウォッチ・大型プレビューキャンバス）
- **`editor/editor.js` を統合**：`initTileEditor()`/`onLeaveTileEditor()` を import・`showView('tile')` 分岐追加・タブクリックリスナー追加
- **editor スモークテスト3本追加**（`tests/editor-tile.spec.js`）：(1) タイルタブ表示＋テーマセレクト＋タイルグリッドが複数アイテム表示＋エクスポートtextarea存在＋JSエラーなし、(2) タイル選択→active＋パレットスウォッチ表示＋大型プレビュー表示＋リセットボタン存在、(3) 炎テーマに切り替え→エクスポートコードに「炎」を含む
- `npx playwright test` → **全29テストグリーン**（既存26＋新3、デグレなし）

**学び・気づき：**
- テーマデータは `themeData[themeKey][tileKey] = palette` の2重オブジェクトに保持し、編集は `themeData` への直接代入とすることで「プリセット初期値」とは別に管理。リセット時は `THEME_PRESETS` の `overrides` に戻す設計にした
- パレット編集は `<input type="color">` を非表示で配置し、スウォッチクリック → `.click()` で呼び出す方式。スウォッチ再描画なしでインプレース更新できるため再描画コストが低い
- エクスポートは「デフォルト TILE_PAL と全く同じパレットの場合は変更なし扱い」（JSON.stringify で比較）にしたため、デフォルトテーマ選択時はコードが簡潔になる

**▶ 次やること：**
- [ ] **Phase 1-1**：テキスト・名称変更（「トライフォースのかけら」→「星の欠片」）⚡  ← Phase 0-5 全完了につき Phase 1 に移行可能
- または
- [ ] **Phase 0-6**：TypeScript・ビルドの検討 🧠

### 2026-06-15 — Phase 0-5（後半）：アイテム定義エディタを実装

**やったこと：**
- **📦 アイテムタブ＋`#view-item` を `editor/index.html` に追加**（3ペイン：左=アイテムリスト、中央=エディタフォーム、右=エクスポートコード）
- **`editor/editor-item.js` を新設**（`initItemEditor()` / `onLeaveItemEditor()` を export）：
  - アイテムリスト描画：`ITEM_META`（サブアイテム）と `EQUIP_META`（装備）を2セクションに分けて列挙・クリックで選択・active ハイライト
  - ITEM_META 用フォーム：名前/アイコン/スプライト名/パレット名・タイプ選択（throwable/placeable/consumable/passive）・uses形式切替（Infinity/null/数値）・タイプ別追加フィールド（breakPower/piercing/aoeRadius/damage/healAmount）の動的表示切替
  - EQUIP_META 用フォーム：名前/アイコン・スロット選択（weapon/shield/armor）・スロット別ステータス（atkBonus/damageReduction/defBonus）の動的表示切替
  - 変更適用：フォーム値を itemBuffer/equipBuffer に反映 → JS コード生成
  - エクスポート：選択中エントリ + Export All（ITEM_META または EQUIP_META 全体）を textarea に表示 → クリップボードコピー
- **`editor/editor-item.css` を新設**（item-layout 3ペイン・アイテムリストスタイル・セクションタイトル・エクスポートパネル）
- **`editor/editor.js` を統合**：`initItemEditor()`/`onLeaveItemEditor()` を import・`showView('item')` 分岐追加・タブクリックリスナー追加
- **editor スモークテスト3本追加**（`tests/editor-item.spec.js`）：(1) アイテムタブ表示＋アイテムリスト＋エクスポートtextarea存在＋JSエラーなし、(2) アイテム選択→active＋フォーム表示＋基本入力欄存在、(3) 名前編集→変更適用→エクスポートコードに `ITEM_META` と編集後名前を含む
- `npx playwright test` → **全26テストグリーン**（既存23＋新3、デグレなし）

**学び・気づき：**
- items.js の `uses` フィールドは `Infinity`・`null`・数値の3パターンがある。`structuredClone` は `Infinity` を正しくコピーする（`NaN` や `undefined` と異なり問題なし）。エクスポートコード生成時も `valueToJs()` ヘルパーで `Infinity`→文字列 `'Infinity'`（引用符なし）に変換する必要がある
- タイプ別追加フィールド（`throwable`/`placeable`/`consumable`/`passive`）の表示切替は、タイプ選択セレクトの `change` イベントで `renderTypeFields()` を再描画する方式にした。フォーム全体を再描画するとフォーカスが飛ぶため、フィールド部分のみを差し替えるのがポイント
- キャラクターエディタと同じ `.char-form` / `.form-row` CSS クラスを流用することで、中央パネルのレイアウトを統一できた（editor-character.css に定義済みのスタイルがそのまま適用される）

**▶ 次やること：**
- [ ] Phase 0-5 残り：タイルバリエーション設計支援（テーマ別パレットプレビュー）⚡ ← 必要性低め、Phase 1 優先でもよい
- または
- [ ] Phase 1 ストーリー基盤：「トライフォースのかけら」→「星の欠片」テキスト変更・老賢者NPC・エンディング書き直し⚡

### 2026-06-15 — Phase 0-5（中盤）：キャラクター定義エディタを実装

**やったこと：**
- **🧙 キャラクタータブ＋`#view-character` を `editor/index.html` に追加**（3ペイン：左=敵リスト、中央=エディタフォーム、右=エクスポートコード）
- **`editor/editor-character.js` を新設**（492行・`initCharacterEditor()` / `onLeaveCharacterEditor()` を export）：
  - 敵リスト描画：`ENEMY_META` 全エントリを列挙・クリックで選択・active ハイライト
  - エディタフォーム：基本情報（名前/HP/ATK/DEF/EXP）・スプライト/パレット名・速度プリセット（低速/通常/高速）＋カスタム値入力
  - ボスフラグ・ヒット&アウェイ・オーラエフェクトのチェックボックス
  - 攻撃設定：単一攻撃（attack）vs 複数攻撃（attacks配列）の切替チェックボックス
    - 単一：タイプ選択（charge/sword/spear/stone）・charge以外は射程/CD/飛翔速度を表示
    - 複数：動的リスト・各エントリごとにタイプ/射程/CD/飛翔速度・追加/削除ボタン
  - フェーズ設定：動的リスト・HP閾値/速度倍率/攻撃CD倍率・追加/削除ボタン
  - 変更適用：フォーム値を editBuffer に反映 → `ENEMY_META[key]` を更新 → JSコード生成
  - エクスポート：`[TILE.XXX]: {...}` 形式でコード生成 → textarea 表示 → クリップボードコピー
- **`editor/editor-character.css` を新設**（117行）：3ペインレイアウト・敵リストアイテム・攻撃/フェーズアイテムのスタイル
- **`editor/editor.js` を統合**：`initCharacterEditor()` を `init()` で呼び出し・`showView('character')` 分岐追加・タブクリックリスナー追加・ビュー離脱時 `onLeaveCharacterEditor()` を呼ぶ
- **editor スモークテスト3本追加**（`tests/editor-character.spec.js`）：(1) キャラクタータブ表示＋敵リスト＋エディタパネル＋エクスポートtextarea存在＋JSエラーなし、(2) 敵選択→active＋フォーム表示＋基本入力欄存在、(3) HP編集→変更適用→エクスポートコードに `"hp": 99` 含む
- `npx playwright test` → **全23テストグリーン**（既存20＋新3、デグレなし）

**学び・気づき：**
- enemies.js の `ENEMY_META` 構造は単一攻撃（attack）と複数攻撃（attacks配列）の二重構造・フェーズ設定（phases配列）・initialModeWeights等の多様なフィールドを持つため、フォームのUI設計で「初見で分かりやすい」と「全機能を網羅」のバランスを取った。複数攻撃は「チェックボックスで切替」形式にし、使わない場合は隠すことでフォームの複雑さを軽減
- 攻撃タイプ（charge/sword/spear/stone）ごとに表示するパラメータが異なる（chargeは射程/CDなし、spear/stoneは飛翔速度あり）ため、タイプ変更イベントで表示/非表示を切り替える動的UIが必須だった
- `structuredClone()` で `ENEMY_META` をディープコピーして編集バッファに入れることで、「変更適用」まで元データを壊さない安全な編集フローを実現
- エクスポートコードは `TILE.` 定数名を含むため、`getTileConstantName()` で逆引き処理を実装（TILE.PATROL → "PATROL"）

**▶ 次やること：**
- [ ] Phase 0-5 残り：アイテム定義エディタ（items.js）/ タイルバリエーション設計支援（テーマ別パレットプレビュー）⚡。同じ自己完結タブ方式で追加

### 2026-06-14 — Phase 0-5（前半）：スプライトエディタを実装

**やったこと：**
- **🎨 スプライトタブ＋`#view-sprite` を `editor/index.html` に追加**（3ペイン：左=グリッド/ツール/パレット、中央=描画キャンバス、右=フレーム/読込/エクスポート）
- **`editor/editor-sprite.js` を新設**（`initSpriteEditor()` / `onLeaveSpriteEditor()` を export・状態は内部に閉じ込め）：
  - グリッド可変（32²/16²/12×16/8²/6²/64² プリセット）／パレット編集（クリック選択・カラーピッカー変更・色追加・index0=透明チェッカー）
  - ドット描画（ペン/消しゴム・ドラッグ連続）／複数フレーム（追加・複製・削除・サムネ選択・再生プレビュー）／左右反転・クリア
  - 既存スプライト読込（`SPRITES`/`PAL` から deep copy）→ heroD 等の派生作成に有効
  - エクスポート：`sprites-*.js` の配列形式コード生成（パレット行 + `SPRITES.xxx = [...]`）→ textarea 表示 → クリップボードコピー
- **`editor/editor.js` を配線**：showView を全ビュー/全タブ一旦リセット方式に拡張し `sprite` 分岐を追加・`init()` で `initSpriteEditor()` を呼ぶ・離脱時に再生停止
- **`editor/editor-sprite.css` を新設**（editor.css と分離してタブ干渉を回避）。index.html から `<link>` 追加
- **editor スモークテスト2本追加**（`tests/editor.spec.js`、計6本）：(5) スプライトタブ表示＋キャンバス/パレット＋JSエラーなし、(6) heroD 読込→32×32反映→エクスポートコードに `SPRITES.` を含む
- `npx playwright test` → **全19テストグリーン**（既存17＋新2、デグレなし）

**学び・気づき：**
- スプライトエディタは既存エディタ状態（mapData/state）と独立しているため editor-state.js に相乗りせず editor-sprite.js 内に専用 state を閉じ込めるのが綺麗。editor.js とは showView と init だけで疎結合に保てた
- データ形式（`SPRITES.x=[frame][row][col]=palIdx`、`PAL.x=[transparent,...]`）を sprites.js の `drawSpriteFrame` と完全一致させたので読込→編集→エクスポートのラウンドトリップが自然に成立
- **Cline の `replace_in_file`/`write_to_file` は PROGRESS.md/PLAN.md のような大きいファイルで「成功と返すが実ファイルが変わらない」事象が発生**。独立した小ファイルは問題なし。→ ドキュメント更新は Node スクリプト（fs.writeFileSync）でディスク直書きする回避策を採用

**▶ 次やること：**
- [ ] Phase 0-5 残り：キャラクター定義エディタ（enemies.js）/ アイテム定義エディタ（items.js）/ タイルバリエーション設計支援（テーマ別パレットプレビュー）⚡。スプライトエディタと同じ自己完結タブ方式で追加可能

### 2026-06-14 — Phase 0-3b 完遂：editor.js（1581行）を8モジュールに分割＋スモークテスト4本追加

**やったこと：**
- **editor Playwright スモークテスト4本を新設**（`tests/editor.spec.js`）：(1) 起動でJSエラーなし＋ワールドグリッド表示、(2) 空セルクリックでステージ作成、(3) ステージ編集ビューへの遷移＋タイルパレット表示、(4) 保存ボタンで有効なJSONがlocalStorageに保存される。4本全グリーンを確認してから分割に着手
- **editor.js（1581行）を8モジュールに分割**：
  - `editor-state.js`（62行）：state オブジェクト・DOM参照・ユーティリティ（getCurrentStage系・stageKey・countTile・findTilePositions）
  - `editor-layers.js`（85行）：レイヤータブ描画・ダンジョンメタパネル・レイヤー追加/削除イベント
  - `editor-world.js`（289行）：ワールドグリッド描画・ミニマップ・ワールドプレビュー・行/列挿入・updateWorldSidePanel
  - `editor-palette.js`（134行）：TILE_SPRITE_MAP・drawSpriteAt・タイルパレット描画（buildTilePalette）
  - `editor-canvas.js`（327行）：ステージキャンバス描画・drawCell・マウスイベント（draw/erase/fill）・フラッドフィル・ツールボタン
  - `editor-props.js`（409行）：右パネル全体（renderSidePanel）・ゲートリンク・剣/防具・宝箱・NPC・ショップ・MAP_ENTER・表示条件・壊せる壁・ドアウェイ
  - `editor-io.js`（248行）：保存（File System Access API + DLフォールバック）・読み込み・プレビュー状態管理（getPreviewPending/setPreviewPending）・openPreview・tryRestoreFromStorage
  - `editor.js`（142行）：エントリ（showView・タブ切替・各モジュールのイベント登録・アニメーションループ・init）
- 各モジュール間の連携は **引数注入（コールバック渡し）+ CustomEvent（editor:resetPreview / editor:showWorld / editor:previewClickAt）** で疎結合化。`editor-world.js` のボタンが `showView` を必要とするケースは CustomEvent で editor.js 側に通知
- **17テストグリーン**（ゲーム側13本＋エディタ4本）。デグレなし

**学び・気づき：**
- editor.js はゲームと異なり「1ファイルにすべてが含まれた素直な構造」だったため、ESModule の read-only binding 問題が起きにくい。factory パターンは不要で、**引数注入（renderWorldGrid を受け取る関数群）** で十分に疎結合にできた
- `_previewPending` のような「複数モジュールをまたぐ状態」は editor-io.js に所有させ、getter/setter（`getPreviewPending` / `setPreviewPending`）で公開するパターンが有効。editor-canvas.js は pending 中の描画ブロックのためにのみ参照するので依存方向が一方向に保たれる
- `showPreviewSettingsDialog` のような「UI操作フロー」は editor-io.js 内部に閉じることで、editor.js から canvas クリック後の処理フローが CustomEvent 経由で整理できた
- editor-props.js が 409 行で目標（400行以内）をわずかに超えたが、右パネルは論理的に1単位（renderSidePanel が全セクションを統括）なので分割しないことが妥当と判断

**▶ 次やること：**
- [ ] Phase 0-4：必要なスプライト・モーション一覧の洗い出し 🧠 Opus（プレイヤーモーション・ダンジョンテーマ別タイル・新ボス敵・新アイテム）
- または
- [ ] Phase 0-5：エディタ機能拡張（スプライトエディタ・キャラ/アイテム定義エディタ）🧠→⚡ ← editor.js 分割が完了したため安全に着手可能


### 2026-06-14 — Phase 0-2b 完遂：player.js / combat.js / boss.js の factory 統合 + 旧本体削除

**やったこと：**
- **3モジュールの factory 統合を実装**：`createPlayer/createCombat/createBoss` を import 済みだが factory 呼び出しが無かった（旧本体が現役）状態を解消。proj/ai の factory ブロック直後に **1ブロックでまとめて createBoss → createCombat → createPlayer を生成**（相互依存：combat→boss の `onBossDefeated`、player→combat,boss の `swordAttack`/`checkTriforceClear`、boss→proj の `showExplosionEffect`）
- deps はすべて getter/wrapper 経由で配線。boss が読み書きする `_bossDefeating` / `_pendingTriforcePieceEl` / `_collectingTriforce` / `pendingTriforcePos` / `bossRoomLocked` / `lastSwordTime` / `lastStonePushTime` は getter/setter で注入。input.js が初期化時に保持する `movePlayer`/`swordAttack`/`useSubItem` は `(dir) => movePlayer(dir)` 等のラッパー化で再代入に追従
- **配線テスト（13 green）→ 旧 function 本体を削除し game.js を再構成**：movePlayer/handleTileEvent/tryPushStone/checkSwitchOff/giveSubItem/gainHeartContainer/spawnDropEffect（player）、swordAttack/showSwordSlashFloat/showEnemySwordSlash/dealDamageToEnemy/killEnemy/takeDamage/showPlayerBlink/showDmgPopupFloat/gameOver（combat）、startDialog/showDialogLine/advanceDialog/togglePause/renderPauseMenu/renderPauseDungeonMap/pauseSelect*/openShop/closeShop/renderShop/shopSelect*/shopBuy/pickDungeonItem（ui — ui.js へ既出）、showBossHpBar/updateBossHpBar/hideBossHpBar/checkBossPhase/onBossDefeated/spawnTriforcePiece/startEnding/buildStaffRollHtml/showBossRoomLockEffect/startBossBattle/checkPendingTriforce/calcTotalTriforces/checkTriforceClear（boss）等を削除
- factory で上書きされる全関数を冒頭で `let xxx = () => {}` 事前宣言（ESM strict mode のホイスティング消失対策）。`isShop` も ui.js getter/setter 用に game.js に残す
- **game.js 2726→1268行（1458行減・元4098行から約 70% 削減）・13テストグリーン**。これで **Phase 0-2 / 0-2b の game.js 分割は全完了**（残りは状態宣言・factory初期化・ループ駆動・init・useSubItem・export のオーケストレーション層）

**学び・気づき：**
- 相互依存する3モジュールは「1つずつ」より **1ブロックでまとめて生成**する方が安全。`const _boss = ...; const _combat = ...; const _player = ...;` の順で生成し、combat の deps に `_boss.onBossDefeated`、player の deps に `_boss.checkTriforceClear` を直接渡せる（生成順を依存の向きに合わせる）
- deps が後方宣言の `let`（`bossRoomLocked` 等）を参照しても、すべて `() => bossRoomLocked` のクロージャ/wrapper 経由なので **factory 生成時には評価されず**、実際の呼び出し時には初期化済みで TDZ にかからない
- 大量の旧本体削除は SEARCH/REPLACE を繰り返すより **write_to_file で再構成**する方が確実（中間に残す関数が挟まると部分削除でコメントブロックが壊れる）

**▶ 次やること：**
- [ ] Phase 0-3b：`editor.js`（1581行）を機能別に分割 🧠→⚡。editor は自動テストが無いため、(1) まず Playwright で editor の最小スモーク（起動・タイル配置・JSON エクスポート）を1〜2本張る → (2) その後 factory/モジュール分割、の順で進めるのが安全


### 2026-06-14 — Phase 0-2b：enemy-ai / projectile の旧本体を game.js から削除


**やったこと：**
- 再開時にまず状況確認：直近コミット `5ae567b`（render 関数削除）時点でコードは健全（**13 passed・git クリーン・構文OK**）。前セッションの中断は token 長等が原因で、壊れた状態はコミットされていなかった
- **enemy-ai の旧本体を削除**（`enemyTick`/`pickApproachMode`/`bossTickHitAndAway`/`enemyAttack`/`fireEnemyProjectile`/`enemyChase`/`checkEnemyContact` ＋ヘルパー、約560行）。factory（`_ai.*`）で上書き済みの dead code
- **projectile の旧本体を削除**（`projectiles`/`nextProjId`/`projectileTick`/`boomerangStep`/`checkProjHit`/`isShieldBlocking(Dir)`/`showShieldBlockEffect`/`isInBounds`/`isTilePassableForProj`/`createProjEl`/`moveProjEl`/`removeProjEl`/`clearProjectiles`/`placedBombs`/`clearBombs`/`placeBomb`/`bombTick`/`explodeBomb`/`showExplosionEffect`、約360行）。factory（`_proj.*`）で上書き済みの dead code
- **game.js 3631→2726行（905行減）・13テストグリーン**

**学び・気づき（重要）：**
- **ESM strict mode の落とし穴**：factory 代入ブロックの `enemyTick = _ai.enemyTick` 等は、削除対象の `function enemyTick(){}` の**ホイスティングによる暗黙の宣言**に依存していた。旧 `function` 本体を削除すると代入先が未宣言になり **ReferenceError で起動失敗**（全テストがタイムアウト）。最初に enemy 系を削除したらこれで全滅した
- **正しい削除パターン（PROGRESS 既出の手順を厳守）**：① factory 代入先の関数を `let xxx = () => {};` で**事前宣言** → ② 旧 `function` 本体を削除 → ③ テスト。render/input/ui 系で確立済みだった手順を、今回 enemy/projectile にも適用して解決
- 削除前に「他所からの参照が旧本体内部に閉じているか」を `grep` で必ず確認した（`fireEnemyProjectile` は projectile/enemy 両方に定義があるが factory 版に一本化済み）

**▶ 次やること：**
- [ ] Phase 0-2b 続き：**player.js / combat.js / boss.js の factory 統合 + 旧本体削除**。⚠️ これら3つは enemy/projectile と違い **factory 統合自体が未完**（`createPlayer/createCombat/createBoss` を import しているが `_player./_combat./_boss.` の呼び出しが無く、game.js の旧本体が現役）。単純削除ではなく「deps 配線 → 代入ブロック追加 → テスト → 旧本体削除 → 再テスト」を **1モジュールずつ** 行う必要がある（相互依存：combat の dealDamageToEnemy/takeDamage を enemy-ai/projectile factory が deps として参照している点に注意）


### 2026-06-14 — Phase 0-3b：game.css を11ファイルに分割（@import エントリ化）


**やったこと：**
- **`game.css`（1661行）を `@import` のみのエントリファイルに書き換え**、機能別に `game/css/` 配下へ分割：
  - `base.css`：リセット・CSS変数（`:root`）・html/body
  - `hud.css`：HUD（ハート・装備・サブアイテム・ウォレット）
  - `board.css`：ボード・セル・char-layer・スプライトサイズ・ドアウェイ背景
  - `effects.css`：剣スラッシュ/突き・ダメージ・点滅・爆発・盾ブロック・ドア・魔王オーラ・家ドア・stone-glow・`.hidden`
  - `overlays.css`：メッセージバー・NPCダイアログ・ポーズ・ゲームオーバー・タイトル/確認
  - `mobile.css`：モバイルコントローラー（D-PAD・アクションボタン）
  - `responsive.css`：`@media (min-width: 600px)` PC向け
  - `shop.css`：ショップ
  - `boss.css`：ボスHPバー・ダンジョンHUD中央・暗転オーバーレイ
  - `ending.css`：エンディング（スタッフロール・THE END）
  - `tiles.css`：bgTile／フィールドタイル背景色
- **カスケード順を厳密に保持**：`#boss-hpbar { bottom: 148px }` は元ソースで `@media(PC){#boss-hpbar{bottom:20px}}` より**後**に定義され後勝ちになる。これを再現するため @import 順を `responsive.css` → `boss.css` の順に配置。`#hud`/`#msg-bar` 等は @media より前なので hud/overlays を responsive より前に置いて元挙動を維持
- `index.html` は無改修（`<link rel="stylesheet" href="game.css">` のまま）
- `npx playwright test` → **13 passed**（VRT の `game-start.png` が一致＝見た目の差分ゼロ）

**学び・気づき：**
- CSS 分割で最も注意すべきは**カスケード順（同詳細度のルールの後勝ち）**。特に `@media` と通常ルールの定義順が逆転すると PC 表示で差が出る。元ソースの行順を @import 順にそのまま写すのが最も安全
- `@import` は CSS の先頭にまとめて書く必要がある（他ルールより前）。エントリを @import 専用にすればこの制約を自然に満たせる
- VRT（`toHaveScreenshot`）が「見た目が1px も変わっていない」ことを保証してくれるので、CSS の機械的分割では特に心強い安全網になった

**▶ 次やること：**
- [ ] Phase 0-3b：`editor.js`（1581行）を機能別に分割 🧠→⚡。ただし editor は自動テストが無くデグレ検知できないため、(1) まず Playwright で editor の最小スモーク（起動・タイル配置・JSON エクスポート）を1〜2本張る → (2) その後 factory/モジュール分割、の順で進めるのが安全


### 2026-06-14 — Phase 0-3：sprites.js を4サブファイル＋aggregatorに分割

**やったこと：**
- **`shared/sprites-player.js` を新設**：hero（4方向2フレーム）/ escape / monster / darklord / princess / npcA / npcB / npcShop の各スプライトデータと対応パレット（hero/escape/monster/darklord/princess/guard/npcA/npcB）を収録（~340行）
- **`shared/sprites-enemies.js` を新設**：patrol（巡回兵）/ chaser（追跡者）/ sentry（騎士）の各スプライトデータと対応パレットを収録（~120行）
- **`shared/sprites-items.js` を新設**：sword/shield（+side/back）/boomerang/arrow/spear（+spearV）/stone/key/chest/rupee/triforce/heart（+empty/half）の各スプライトデータと対応パレットを収録（~250行）
- **`shared/sprites-tiles.js` を新設**：block/door（+doorOpen）/swG/gateG（+gateGopen）/water/breakableWall/mapEnter/doorway/doorwayBoss/doorwayLocked ＋ フィールドタイル全種（grass/sand/stoneFloor/bridge/tree/mountain/bush/fence/houseWall/houseDoor/houseRoof/sign）の各スプライトデータと対応パレットを収録（~400行）
- **`shared/sprites.js` を aggregator に書き換え**：4サブファイルから `PLAYER_PAL`/`PLAYER_SPRITES` 等をインポートし、`PAL = { ...PLAYER_PAL, ...ENEMY_PAL, ...ITEM_PAL, ...TILE_PAL }` / `SPRITES = { ...PLAYER_SPRITES, ... }` でマージして再エクスポート。animation/drawing 関数（`startAnimLoop` / `stopAnimLoop` / `drawSprite` / `makeSprite` / `drawSpriteFrame` / `redrawAnimSprites`）はそのまま残す（~100行）
- `node scripts/check-errors.mjs` → エラーなし
- `npx playwright test` → **13 passed**（デグレなし）
- PLAN.md（0-3 完了）・PROGRESS.md・進捗サマリを更新

**学び・気づき：**
- `sprites-ui.js` は当初 PLAN.md に記載していたが、HUD要素（heart/heartHalf/heartEmpty）はアイテム的な性格、doorway等は tiles 的な性格のため、それぞれ items/tiles に自然に収まった。分割方針は「UI要素か否か」より「何を表すオブジェクトか」で判断した方が良い
- aggregator で `...PLAYER_SPRITES` をスプレッド構文でマージする設計は、外部の import 側（game.js / render-board.js 等）の変更を一切不要にする。エントリポイントが sprites.js → PAL/SPRITES を使う全ファイルへの影響ゼロ
- 各サブファイルは独立した名前空間（`PLAYER_PAL` / `ENEMY_PAL` 等）を持つため、将来さらに細分化する際も aggregator だけ変更すればよい

**▶ 次やること：**
- [ ] Phase 0-3b：`editor.js`（1581行）を機能別に分割 / `game.css`（1660行）を機能別に分割 🧠→⚡


### 2026-06-14 — バグ修正：弓矢が特定距離の敵に当たらない（トンネリング）

**やったこと：**
- **原因特定**：`projectileTick` では 1tick に `speed × MOVE_STEP` だけ一気に移動してから `checkProjHit` で1点判定していた。弓矢は speed=4.5（通常）・9.0（二周目）のため 1tick あたり 2.25〜4.5 セル移動し、敵のヒットボックス（0.6セル）を飛び越えて当たり判定が抜ける「トンネリング」が発生していた
- **修正**：`projectileTick` の直線飛翔ブランチに**区間補間チェック**を実装。1tick の移動量を `HIT_RADIUS×0.8 = 0.4` セル以下の小ステップに分割し、各サブステップで境界・壁・当たり判定を順番にチェックする。ヒットした時点で即 `break` して残移動はスキップ（速度感への影響なし）
  ```
  const numSubs = Math.ceil(step / 0.4);  // 弓矢なら 2.25/0.4 ≒ 6 分割
  for (let i = 0; i < numSubs; i++) {
      proj.x += dx; proj.y += dy;
      // 境界・壁・当たり判定 → ヒットで break
  }
  ```
- `node scripts/check-errors.mjs` → エラーなし
- `npx playwright test` → **12 passed**（デグレなし）

**学び・気づき：**
- 高速投擲物のトンネリングは「当たらない距離がある」という形で現れる。敵が何マス離れていても当たるべきだが、特定距離（ちょうど矢が飛び越えるセル）だけ抜けるのが特徴
- `checkProjHit` の判定閾値（0.6セル）はそのままで、移動ステップを小さくするのが最も安全な修正（判定ロジック自体を変えない）
- ブーメランは `boomerangStep` で別処理しているため影響なし。敵の投擲物（spear/stone）も速度が低めなため実害は少なかったが、同じ修正で恩恵を受ける

**▶ 次やること：**
- [ ] Phase 0-3：`sprites.js`（1440行）を機能別に分割（`sprites-player.js` / `sprites-enemies.js` / `sprites-items.js` / `sprites-tiles.js` / `sprites-ui.js`）⚡


### 2026-06-14 — Phase 0-2 Step 6：main.js エントリポイント整理（Phase 0-2 全完了）

**やったこと：**
- **`game/main.js` を新設**：`init()` 呼び出し・`window.__game` テストフック・`startAnimLoop(() => { redrawAnimSprites(); })` 呼び出し・`window.addEventListener('resize', ...)` を切り出し。`window._debugEnding` もここに集約
- **game.js に `export` を追加**：`init` / `updateBoardScale` / `step` / `movePlayer` / `swordAttack` / `useSubItem` / `getProjectiles` / `startEnding` と、テスト用ヘルパー `getGameState()` / `getInputModule()` をエクスポート。`startAnimLoop` / `redrawAnimSprites` は sprites.js から再 export
- **game.js から旧エントリポイントコードを削除**：`init().catch(...)` / `window.addEventListener('resize')` / `window._debugEnding` / `window.__game` ブロック・`startAnimLoop()` 呼び出しを game.js 末尾から削除
- **`game/index.html` の `script` タグを変更**：`game.js?v=3` → `main.js`
- `node scripts/check-errors.mjs` → ページエラーなし・consoleエラーなし
- `npx playwright test` で **12 passed**（デグレなし）
- PLAN.md（Step 6 完了）・PROGRESS.md・進捗サマリを更新

**学び・気づき：**
- game.js が ESModule の `export` を持つモジュールになったことで、`import` 側（main.js）から必要な関数だけを参照できる設計が整った
- `startAnimLoop` / `redrawAnimSprites` は sprites.js に属する関数なので、`export { startAnimLoop, redrawAnimSprites } from '../shared/sprites.js'` で game.js を経由して再 export する形にした（main.js から sprites.js を直接 import しても良いが、game.js の責務範囲内に留めた）
- `window.__game` の `queueInput` / `releaseInput` は `getInputModule()` を通じて `_inputModule.heldKeys` にアクセスする設計に変更（旧 game.js 内のクロージャ変数直接参照から切り離し）

**▶ 次やること：**
- [ ] Phase 0-3：`sprites.js`（1440行）を機能別に分割（`sprites-player.js` / `sprites-enemies.js` / `sprites-items.js` / `sprites-tiles.js` / `sprites-ui.js`）⚡


### 2026-06-14 — 投擲物テスト追加（projectile.spec.js）

**やったこと：**
- **PLAN.md に「④ 投擲物テスト」を追記**：弓矢・ブーメランの飛翔確認テストは PLAN.md の 0-0 テスト基盤に位置づけた
- **`window.__game` に `useSubItem()` と `getProjectiles()` を追加**：テストからサブアイテム使用・投擲物状態取得ができるように公開
- **`tests/projectile.spec.js` を新設**（2テスト）：
  - 条件1：弓矢を使用後、arrow が factory の投擲物リストに存在し dx > 0（右方向）であること
  - 条件2：ブーメランを使用後、boomerang が factory の投擲物リストに存在し、3フレーム後に初期位置から前進していること
- `npx playwright test` で **12 passed**（既存10＋新規2、デグレなし）

**学び・気づき：**
- seed があるとタイトルダイアログが表示されるため、`waitForBoard` ではなく `#btn-continue` をクリックしてからボード待機が必要（movement.spec.js と同じパターン）
- Infinity は `JSON.stringify` でシリアライズできない → ブーメランの count は 99 を使い、useSubItem の `si.count !== Infinity` チェックを回避
- `getProjectiles()` のスナップショット実装で `returning: p.returning ?? false` としたことでデシリアライズ後も boolean が正しく返る

**▶ 次やること：**
- [ ] Phase 0-2 Step 6：`main.js` への `init()` とゲームループの整理（エントリポイントの切り出し）⚡


### 2026-06-14 — バグ修正：弓矢・ブーメランが動かない不具合

**やったこと：**
- **原因特定**：`useSubItem` の中で `projectiles.push(proj)` / `createProjEl(proj)` / `nextProjId++` を直接参照していた。これらは `projectile.js` factory の内部変数になっており game.js のローカル変数は使われないため、投擲物が実際には追加されず動かなかった
- **修正内容**：
  - factory ブロックに `addProjectile = (config) => _proj.addProjectile(config)` / `getProjectiles = () => _proj.getProjectiles()` を追加して公開
  - `useSubItem` の boomerang / bow 発射処理を `addProjectile(config)` 呼び出しに変更（id 付与は factory 内部で行われる）
  - ブーメラン飛翔中チェックを `projectiles.some(...)` → `getProjectiles().some(...)` に変更
  - `addProjectile` / `getProjectiles` の `let` 事前宣言を factory 上書きの前（`updateShieldHud` / `processHeldKeys` と同じ場所）に追加（TDZ 回避）
- `node scripts/check-errors.mjs` → エラーなし確認
- `npx playwright test` で **10 passed**（デグレなし）

**学び・気づき：**
- projectile.js factory は `_projectiles` / `_nextProjId` / `createProjEl` を**内部に閉じ込めて**いるため、game.js の `let projectiles = []` / `nextProjId` は使われない空の変数になっていた。useSubItem が旧変数に push しても factory の tickループから見えないため投擲物が「存在しないまま」になっていた
- factory API の `addProjectile(config)` に id を含めない設定オブジェクトを渡せば factory 側で `id: _nextProjId++` を付与してくれる設計になっていた（正しい使い方）
- factory 公開後も旧インライン実装（`projectiles = []` / `createProjEl`）が game.js に残っているが、`clearProjectiles` / `projectileTick` は factory 版で上書き済みなので今回の修正で整合がとれた

**▶ 次やること：**
- [ ] Phase 0-2 Step 6：`main.js` への `init()` とゲームループの整理（エントリポイントの切り出し）⚡


### 2026-06-14 — Phase 0-2 Step 5（前半）：projectile.js / enemy-ai.js 切り出し

**やったこと：**
- **`game/projectile.js` を新設**（`createProjectile(deps)` factory）：投擲物・爆弾・盾ブロック判定を game.js から切り出し。内部状態（`_projectiles` / `_placedBombs` / `_nextProjId`）をこのモジュールが所有。公開 API: `projectileTick` / `clearProjectiles` / `addProjectile` / `fireEnemyProjectile` / `isShieldBlocking` / `isShieldBlockingDir` / `showShieldBlockEffect` / `clearBombs` / `placeBomb` / `bombTick` / `showExplosionEffect`
- **`game/enemy-ai.js` を新設**（`createEnemyAi(deps)` factory）：`enemyTick` / `enemyChase` / `bossTickHitAndAway` / `enemyAttack` / `checkEnemyContact` を切り出し。`_proj.fireEnemyProjectile` / `_proj.isShieldBlockingDir` / `_proj.showShieldBlockEffect` を deps として渡すことで循環参照フリー設計
- game.js に `createProjectile` / `createEnemyAi` の import を追加し、factory 初期化ブロック `{ const _proj = createProjectile(...); const _ai = createEnemyAi(...); projectileTick = _proj.projectileTick; ... }` を追加
- `node scripts/check-errors.mjs` → エラーなし確認
- `npx playwright test` で **10 passed**（VRT 含む全テストグリーン＝デグレなし）
- PLAN.md（Step 5 部分完了）・PROGRESS.md・進捗サマリを更新

**学び・気づき：**
- projectile.js が盾ブロック判定（`isShieldBlockingDir`）を所有し、enemy-ai.js がそれを deps として受け取る設計にしたことで、敵の投擲物・近接攻撃ともに同じ判定ロジックを使える循環参照フリーな構造を作れた
- factory ブロックで `_proj` → `_ai` の順に初期化することで、`_proj.fireEnemyProjectile` を `_ai` の deps に渡せる（依存の向きが一方向で明快）
- game.js にはまだ旧インライン実装が残っているが、factory が上書きするため動作は factory 版で統一されている（旧実装は使われない）

**▶ 次やること：**
- [ ] Phase 0-2 Step 5 続き：`player.js`（`movePlayer` / `handleTileEvent`）、`combat.js`（`swordAttack` / `dealDamageToEnemy` / `takeDamage`）、`boss.js`（`onBossDefeated` / `startBossBattle` / `startEnding`）を切り出す ⚡


### 2026-06-14 — Phase 0-2 Step 4：input.js / ui.js 切り出し

**やったこと：**
- **`game/input.js` を新設**（`initInput(deps)` factory）：キーボード・モバイル・スワイプ入力を game.js から切り出し。`heldKeys`（Set）と `processHeldKeys()` を返す。deps は `getIsDialog`/`getIsShop`/`getIsPaused`/`getIsShielding`/`setIsShielding`/`movePlayer`/`swordAttack`/`useSubItem`/`togglePause`/`toggleDebugMode`/`advanceDialog`/`closeShop`/`shopSelectPrev`/`shopSelectNext`/`shopBuy`/`pauseSelectPrev`/`pauseSelectNext`/`hasCleared`/`updateShieldHud`。`resumeAudio` / `MOVE_STEP` は直接 import
- **`game/ui.js` を新設**（`createUi(deps)` factory）：HUD・ポーズ・ダイアログ・ショップを game.js から切り出し。deps に状態フラグの getter/setter を注入して read-only binding 問題を回避
- game.js に `initInput` / `createUi` の import を追加し、factory 呼び出しブロック（`{ const _ui = createUi(...); const _in = initInput(...); ... }`）を追加
- `updateShieldHud` と `processHeldKeys` は factory より前に使われるため `let` 宣言を事前追加（TDZ 回避）
- **旧インラインコードを全削除**：キーボードリスナー（`document.addEventListener('keydown'...)`）・`processHeldKeys` 本体・モバイルボタン（`btn-sword`/`btn-sub`/`btn-menu`/`btn-shield`）・スワイプ・`updateShieldHud` 関数・2つ目の `let _inputModule` 宣言・`const heldKeys` 宣言・`let _activeHeldKeys` 宣言 → 計100行超を削除
- `node scripts/check-errors.mjs` → エラーなし確認
- `npx playwright test` で **10 passed**（VRT 含む全テストグリーン＝デグレなし）
- PLAN.md（Step 4 完了）・PROGRESS.md・進捗サマリを更新

**学び・気づき：**
- token 長エラーで中断した際、前セッションで input.js / ui.js の**ファイル自体は作成済み**だったが、game.js への統合ブロック挿入と旧コード削除が未完または重複していた。再開時は `check-errors.mjs` でページエラーを確認することが最初のステップとして有効
- `Identifier '_inputModule' has already been declared` エラー：新統合ブロックで `let _inputModule = null` が上部にあり、旧インラインコードにも同名宣言が残っていた。旧コードを丸ごと削除することで解決
- `updateShieldHud is not defined` エラー：旧インライン `function updateShieldHud()` を削除したが、factory 上書き前に参照箇所があったため。`let updateShieldHud = () => {};` の事前宣言で解決
- factory 生成関数を game.js の既存 `function` 宣言より先に呼び出す場合、`function` 宣言はホイスティングされるが `let` は TDZ があるため事前宣言が必要

**▶ 次やること：**
- [ ] Phase 0-2 Step 5：ゲームロジック系の分離（`player.js`: movePlayer/handleTileEvent、`combat.js`: swordAttack/dealDamageToEnemy/takeDamage、`projectile.js`: 投擲物・爆弾、`enemy-ai.js`: enemyTick/bossTickHitAndAway、`boss.js`: onBossDefeated/startBossBattle/startEnding）⚡。これらも factory + getter 注入方式を継続


### 2026-06-14 — Phase 0-2 Step 3：render-board.js / render-chars.js 切り出し

**やったこと：**
- **`game/render-board.js` を新設**（`createRenderBoard(deps)` factory）：`renderBoard()` / `setCellClass()` / `addCellSprite()` / `applyBgTileClass()` を切り出し。deps は `getStageData`/`getCurrentLayer`/`getStageKey`/`getSS`/`getBoardEl`/`getStageLabelEl`/`charLayerElRef`/`getDoorwayState`。shared モジュール（`TILE`/`SPRITES`/`PAL`/`NPC_SPRITE_MAP`/`drawSpriteFrame`/`makeSprite`）は直接 import
- **`game/render-chars.js` を新設**（`createRenderChars(deps)` factory）：`renderChars()` / `addCharEl()` / `moveCharEl()` / `removeCharEl()` / `addShieldOverlay()` / `updatePlayerCharEl()` を切り出し。石描画ヘルパー（`makeStoneCanvas` / `addStoneGlow`）も内部関数として実装
- **`charLayerElRef = { value: null }` ラッパーを game.js に追加**：render-board が `renderBoard()` 実行時に `.value` へ新しい charLayerEl を書き込み、render-chars は `.value` を読む。DOM 参照を2モジュール間で安全に共有する設計
- game.js に `createRenderBoard` / `createRenderChars` の import を追加し、`getDoorwayState` 定義後に factory 呼び出しブロックを追加。`renderBoard = () => { _rb.renderBoard(); charLayerEl = charLayerElRef.value; }` の形で旧実装を上書き（`charLayerEl` はアニメーション系コードが直接参照するため game.js 内変数も同期）
- `npx playwright test` で **10 passed**（VRT 含む全テストグリーン＝デグレなし）
- PLAN.md（Step 3 完了・方針を明記）・PROGRESS.md・進捗サマリを更新

**学び・気づき：**
- `charLayerEl` は renderBoard 後に直接 `charLayerEl.appendChild(...)` する箇所（石押しアニメーション・投擲物・剣エフェクト等）が多数あるため、`charLayerElRef.value` で共有しつつ `charLayerEl` も同期させる2重管理が必要だった
- `addShieldOverlay` / `updatePlayerCharEl` は render-chars 側に入れることで、描画系の依存（makeSprite / getCellPx / getHeroDir）が 1 ファイルに集中し見通しが改善
- factory ブロック `{ ... }` を block scope にしたことで `_rb` / `_rc` が外部に漏れず、game.js のグローバルスコープを汚染しない

**▶ 次やること：**
- [ ] Phase 0-2 Step 4：入力・UI系の分離（`input.js`: キーボード・タッチ・スワイプ、`ui.js`: HUD・ポーズ・ダイアログ・ショップ）⚡。これらも大量の状態参照があるため getter 注入方式を継続


### 2026-06-14 — Phase 0-2 Step 2：passable.js / conditions.js 切り出し

**やったこと：**
- 設計判断（Opus）：対象5関数（`isPassable`/`tilePassable`/`isPassableForEnemy`/`checkStoneOnSwitch`/`evaluateConditions`）は `stageData`/`enemies`/`player`/`currentLayer`/`stageKey`/`debugMode` という**再代入される `let` 状態**を多数参照し、呼び出し箇所も多い。save.js のような「全状態を引数で渡す純粋関数化」は呼び出し側の全面改修が必要でリスク大と判断
- **factory + 状態 getter 注入方式**を採用：
  - `game/passable.js` 新設 → `createPassable(deps)` が `{ isPassable, tilePassable, isPassableForEnemy }` を返す
  - `game/conditions.js` 新設 → `createConditions(deps)` が `{ checkStoneOnSwitch, evaluateConditions }` を返す
  - `deps` は `getStageData`/`getEnemies`/`getPlayer`/`getCurrentLayer`/`getStageKey`/`getDebugMode`/`getSS`/`toTileRow`/`toTileCol`（+ conditions は `renderBoard`/`renderChars`）。getter 経由で常に最新の状態を読むので、状態が後で再代入されても正しく動く
- game.js は起動時に一度 `createPassable(...)` / `createConditions(...)` を呼んで分割代入で関数を取得。**呼び出し側のコードは一切変更不要**（関数名そのまま）
- game.js から旧5関数の本体を削除（コメントで「切り出し済み」と明記）
- `npx playwright test` で **10 passed**（石押し・条件評価の往復がグリーン＝注入が正しく機能）
- PLAN.md（Step 2 完了・方針を明記）・PROGRESS.md・DECISIONS.md を更新

**学び・気づき：**
- read-only binding 問題への対処は2パターンある：(A) save.js のように「全状態を引数で渡す純粋関数」、(B) 今回のように「状態 getter を注入する factory」。状態参照が多く呼び出し側改修を避けたい場合は (B) が低リスク。`() => stageData` のクロージャは最新値を返すので再代入に追従できる
- shared モジュール（`TILE`/`NPC_SPRITE_MAP`/`playSound`）は各分割ファイルで直接 import すればよく、注入対象は「game.js スコープの可変状態と相互依存関数」だけに絞れた

**▶ 次やること：**
- [ ] Phase 0-2 Step 3：描画系の分離（`render-board.js`: renderBoard/setCellClass/addCellSprite、`render-chars.js`: renderChars/addCharEl/moveCharEl）⚡。これらも factory + getter 注入方式が使えるが、DOM 要素参照（boardEl/charLayerEl）・makeSprite 等の依存が多いので注入対象の整理が必要


### 2026-06-14 — Phase 0-2 Step 1b：save.js（セーブ/ロードの純粋関数）切り出し


**やったこと：**
- 当初の Step 1b 想定（状態コンテナ `state.js` への全面移行）を再検討。`player` 等の参照が数百箇所に及び一括置換のデグレリスクが過大なため、**より安全な形に再定義**：状態の再代入は game.js に残し、セーブ/ロードの**純粋変換ロジックだけ**を `save.js` に切り出す
- **`game/save.js` を新設**：`createStageState()`（新規ステージ状態の初期値生成）/ `serializeStageState()`（Set→配列）/ `deserializeStageState()`（配列→Set・stonePositions は常にリセット）/ `sanitizeLoadedPlayer()`（旧セーブの passive アイテム混入を除去）の4純粋関数
- game.js の `getSS`/`saveGame`/`loadGame` をこれら利用に簡約（localStorage の read/write と状態再代入のみ game.js に残す）
- `npx playwright test` で **10 passed**（特にセーブ/ロード復元テストがグリーン＝シリアライズ往復が正しい）
- PLAN.md（Step 1b 完了・方針変更を明記）・PROGRESS.md・DECISIONS.md を更新

**学び・気づき：**
- ESModule の read-only binding 問題は「純粋関数として切り出し、状態の所有権は元モジュールに残す」ことで綺麗に回避できた。`save.js` は localStorage にも player にも直接触れず、引数→戻り値だけで完結する（テスタブル）
- セーブ/ロード往復の正しさは movement.spec.js の「続きから復元」テストが実質カバーしている

**▶ 次やること：**
- [ ] Phase 0-2 Step 2：判定・ロジック系（`passable.js`: isPassable/tilePassable/isPassableForEnemy、`conditions.js`: evaluateConditions/checkStoneOnSwitch）の切り出し ⚡。これらは getSS/stageData/enemies/player 等の状態を参照するため、引数で渡す純粋関数化 or アクセサ注入を検討


### 2026-06-14 — Phase 0-2 Step 1a：定数を constants.js へ切り出し

**やったこと：**
- 設計方針を確認：`player`/`stageKey`/`currentLayer`/`mapData` 等は `let` で再代入されるため、ESModule の read-only binding 問題が分割の核心。PLAN の Step 1 を **段階方式（B）** に分解（1a=定数のみ、1b=状態コンテナ化）し、まず低リスクな 1a を実施
- **`game/constants.js` を新設**：再代入されない純粋定数11個を切り出し（MOVE_STEP / TICK_MS / INVINCIBLE_MS / HP_PER_HEART / MAP_JSON_URL / SAVE_KEY / CLEARED_KEY / DIR_DELTA / SWORD_REACH / SWORD_COOLDOWN_MS / STONE_PUSH_COOLDOWN_MS）
- game.js を `import { ... } from './constants.js'` に変更し、インラインの `const` 宣言と重複していた `CLEARED_KEY` を削除（`lastSwordTime`/`lastStonePushTime` の `let` は game.js に残す）
- `npx playwright test` で **10 passed**（デグレなし）
- PLAN.md（Step 1 を 1a/1b に分割・1a完了）・PROGRESS.md・DECISIONS.md を更新

**学び・気づき：**
- DOM参照（`const boardEl = document.getElementById(...)`）・描画密接な `BG_TILE_COLOR_CLASS`・`let` 状態は今回の対象外とし、純粋な値だけを移すことで副作用ゼロ・低リスクに保てた
- ESModule の named import は read-only binding なので、定数（再代入なし）は安全に移せるが、状態（再代入あり）は単一オブジェクト集約（状態コンテナ）が必要 → 1b で実施

**▶ 次やること：**
- [ ] Phase 0-2 Step 1b：可変状態を状態コンテナ方式（`state.js` に `S = {...}`）へ移行し、`save.js`（saveGame/loadGame/getSS）も切り出す 🧠→⚡


### 2026-06-13 — Phase 0-1：決定論的ゲームループ（gameTime / step / __game）

**やったこと：**
- **論理時間 `gameTime` + `gameNow()` を導入**。game.js 内の `Date.now()` 全10箇所（剣CD・無敵・石押しCD・マップ遷移CD・ボスAI `_haTimer`・敵攻撃 `_attackTimes`・爆弾 `fuseEnd`/`bombTick`）を `gameNow()` に置換
- **`gameTick` → `step(frames)` に分離**：driver は `setInterval(() => step(1), TICK_MS)`。`step()` が 1 フレームごとに `gameTime += TICK_MS` してから `gameTick()` を呼ぶ。凍結状態（pause/dialog/gameover/transition）では加算もしない
- **`window.__game` テストフックを公開**：`step(n)` / `queueInput(dir)` / `releaseInput(dir)` / `movePlayer(dir)` / `swordAttack()` / `getState()`
- `tests/deterministic.spec.js` を追加（3テスト）：フック公開確認・`step(10)` で gameTime が ≥1200 進む・`queueInput`+`step` で決定論的に移動
- `npx playwright test` で **8 passed**（既存5＋決定論3、デグレなし）
- DECISIONS.md に実装方針を記録、PLAN.md の 0-1 チェックを完了に

**学び・気づき：**
- 視覚演出（要素削除・点滅・撃破演出）は `setTimeout`/`setInterval` 側で `Date.now()` を使っていなかったため、`Date.now()→gameNow()` の全置換でゲームロジックだけを論理時間化でき、演出は実時間のまま温存できた（PLAN の意図どおり）
- `gameTick` の関数名は互換のため残し、`step()` から呼ぶ構成にしたことで既存の `startGameLoop`/`stopGameLoop` 呼び出し（多数）を変更不要にできた
- replace_in_file で重複ブロックを挿入してしまうミスが発生 → 大きいファイルの編集は SEARCH を一意にし、適用後に必ず重複チェックすること

**石押し検証（追記）：**
- 石押し不具合の報告を受け調査。結論：**game.js のコードは develop と一致しており正常**。実機で見えた不具合は**ブラウザの古いキャッシュ**が原因で、ハードリロードで develop と同じスムーズ動作を確認
- 反省：(1) 最初の石押しテストはユーザー指定の2条件（石サイズ不変・連続押下）を検証しておらず「緑でも無意味」だった、(2) diff の行範囲をずらして「アニメ4行欠落」と誤診断、(3) 「実機で不成立＝コード原因」と思い込んだ（真因はキャッシュ）。詳細は DECISIONS.md に記録
- `tests/stone-push.spec.js` を**2条件を正しく検証する形に作り直し**：石 canvas の実描画サイズを実測（不変確認）／押しっぱなし＋実ループで連続押下（2セル以上前進）を検証。`scripts/find-stone.mjs` を追加（石のあるステージ探索）
- 全テスト **10 passed**

**▶ 次やること：**
- [ ] Phase 0-2：game.js モジュール分割 Step 1（state.js / save.js の切り出し）から着手 🧠→⚡
- ※ 動作確認時はブラウザのハードリロード（キャッシュ無効）を徹底する


### 2026-06-13 — Phase 0-0：ステージ遷移スモーク＋VRT 追加（Phase 0-0 完了）

**やったこと：**
- `tests/transition.spec.js` を追加：
  - field "1,0"（cols=12）の右端付近（x=10, y=5）に seed → ArrowRight 押し続け → `#hud-stage-label` が "2,0" に変わることを確認
  - **1 passed**
- `tests/vrt.spec.js` を追加：
  - 起動直後の画面を `toHaveScreenshot('game-start.png')` で保存（基準画像を自動生成）
  - `maxDiffPixelRatio: 0.01` でピクセル誤差を許容
  - **1 passed**（初回 `--update-snapshots` で基準画像生成 → 通常実行でもパス）
- `scripts/check-stages.mjs` を追加（スクリプトでマップ構造を確認するためのヘルパー。一時作業用）
- `npx playwright test` で **5 passed**（起動・移動・セーブ/ロード・ステージ遷移・VRT）
- PLAN.md・PROGRESS.md の進捗を更新
- `.gitignore` の不要な追記（`tests/**-snapshots/` の除外）を取り消し → VRT 基準画像はリポジトリ管理が正しい運用

**学び・気づき：**
- ステージ遷移の検証は `#hud-stage-label`（`[field] stageKey` 形式）のテキスト変化で確実に確認できる
- `expect(labelEl).toContainText('2,0', { timeout: 3000 })` の形で非同期遷移を自然に待てる
- `--update-snapshots` は初回生成専用。以降は通常実行で差分検出が機能する
- 複数行シェルスクリプトは `.clinerules/no-multiline-shell.md` 違反のため、必ずスクリプトファイルを書き出してから実行すること（今回違反してしまったので注意）

**▶ 次やること：**
- [ ] Phase 0-1：決定論的ゲームループ（`gameTick` を `step()` に分離・`Date.now()` を `gameTime` に置換・入力キュー化）🧠 Opus 推奨

---

### 2026-06-13 — Phase 0-0：移動・セーブ/ロードのスモーク追加

**やったこと：**
- `tests/helpers.js` を新設（`gotoFreshGame` / `waitForBoard` / `getPlayerPixelPos` / `readSave` / `holdKey`）。入力→待機→観測を共通化
- `tests/smoke.spec.js` をヘルパー利用に整理（`#char-player` 表示も確認）
- `tests/movement.spec.js` を追加：
  - 移動スモーク：4方向を順に試し「いずれかで座標変化」を確認（開始位置の壁に依存しないロバスト設計）
  - セーブ/ロード：有効なセーブを seed → タイトル「続きから」→ player座標が復元されることを確認
- `npx playwright test` で **3 passed**
- **WORKFLOW.md にコミットメッセージ作成手順を追記**（Step 5 で案を提示／git status から始める／英語・prefix付き・簡潔／コミット操作はしない）

**学び・気づき：**
- このゲームは**単純な移動だけではセーブしない**（アイテム取得・ステージ遷移・ボス撃破等のイベント時のみ `saveGame()`）。当初「移動→自動セーブ」を前提にしたら失敗した → セーブ/ロードは「ロード復元経路」を検証する形に変更
- タイトルで「続きから」が出る条件は `init()` が `hasSave && stageKey` を満たすこと。seed には `currentLayer`/`stageKey`（startPos の field/"1,0"）が必須だった
- 開始ステージは `work/blade-of-lumia.json` の `startPos`（field, stage "1,0", row2,col2）

**▶ 次やること：**
- [ ] Phase 0-0：ステージ遷移のスモーク（端への移動→別ステージへ切替）を追加
- [ ] 主要画面の VRT（`toHaveScreenshot`）を1枚追加 → その後 0-1/0-2 へ


### 2026-06-13 — Phase 0-0：テスト基盤導入（最小スモーク）

**やったこと：**
- Playwright（`@playwright/test`）を `blade-of-lumia/` 配下に導入（`package.json` / `npm install` / `npx playwright install chromium`）
- `playwright.config.js` を作成：webServer に **Vite**（`npx vite ../ --port 18080`）を指定し、`outputs/` をルートに `/blade-of-lumia/game/` を検証
- `tests/smoke.spec.js`：最小スモークを作成 →「ページがエラーなく起動し、`#board` にセルが描画される」を検証（`pageerror`/`console.error` 監視）
- `.gitignore` を追加（node_modules・test-results・playwright-report 等を除外）
- `npx playwright test` で **1 passed** を確認
- **フィードバック反映**：当初 `python3 -m http.server` を使っていたが、利用技術を Node 系に統一するため Vite に変更（普段の手動確認 `npx vite outputs --port 18080` と同一構成）。`reuseExistingServer` で手動起動中の dev サーバを再利用可能。`npm run dev` も追加

**学び・気づき：**
- このゲームは ESModule + `fetch('../work/...json')` 依存のため `file://` では動かない → HTTPサーバ必須。普段の確認と同じ Vite に揃えると認知負荷が低く、サーバ再利用も効く
- サーバルートが `outputs/` のため、テストURLは `/game/` ではなく `/blade-of-lumia/game/`（`../shared`/`../work` 相対参照と整合）
- 起動フロー：セーブ無し時は `init()` が即 `startNewGame()` → `enterStage()` → `renderBoard()`。よって「`#board` の子要素 > 0」を起動成功の判定に使える
- 読み込み失敗時は `init().catch` が body を「読み込みエラー」表示に差し替える → これを negative assertion に利用

**▶ 次やること：**
- [ ] Phase 0-0 続き：移動・ステージ遷移・セーブ/ロードのスモークを追加（テスト用フック `window.__game` 公開を 0-1 と兼ねて検討）
- [ ] 余裕があれば主要画面の VRT（`toHaveScreenshot`）を1枚追加

---

### 2026-06-13 — 計画策定

**やったこと：**
- IDEA.md にゲーム拡充アイデア・ストーリー設定（星の欠片＋眠れる女王／ラスボス：ザーネル）をまとめた
- PLAN.md を作成（Phase 0〜8、各タスクに推奨モデルを記載）
- Phase 0 にテスト基盤（Playwright E2E/VRT）・決定論的ゲームループ・モジュール分割を整備
- 進捗管理の仕組みを整備：PROGRESS.md（本ファイル）/ DECISIONS.md（判断ログ）/ WORKFLOW.md（AI向け実行手順書）
- → 今後は「WORKFLOW.md に従って進めて」の一言で開発が回る運用にした

**学び・気づき：**
- game.js が 4098 行と肥大化 → 機能追加の前に分割が必須
- テストが 0 件 → 分割前に安全網（テスト基盤）が必要
- 実時間依存のループはテストしづらい → 決定論的ループ化が有効

**▶ 次やること：**
- [ ] Phase 0-0：Playwright を導入し、「ゲームが起動するか」の最小スモークテストを1本通す（🧠 設計はOpus）

---

## 進捗サマリ（PLAN.md のフェーズ別 完了状況）

| フェーズ | 状態 | メモ |
|---|---|---|
| Phase 0 技術基盤 | 🚧 進行中 | 0-0〜0-5 ✅ / **0-6 未着手**（TS/ビルド検討） |






| Phase 1 ストーリー基盤 | 🔲 未着手 | |
| Phase 2 8ダンジョン | 🔲 未着手 | |
| Phase 3 アクション深化 | 🔲 未着手 | |
| Phase 4 サブアイテム | 🔲 未着手 | |
| Phase 5 謎解き | 🔲 未着手 | |
| Phase 6 世界観・NPC | 🔲 未着手 | |
| Phase 7 成長システム | 🔲 未着手 | |
| Phase 8 やりこみ・UX | 🔲 未着手 | |

凡例：🔲 未着手 / 🚧 進行中 / ✅ 完了
