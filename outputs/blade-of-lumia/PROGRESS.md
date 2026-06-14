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

- **進行中フェーズ：** Phase 0（技術基盤）
- **進行中タスク：** Phase 0-2 完了 → 次は 0-3（sprites.js 分割）
- **直近の状態：** 弓矢トンネリングバグ修正＋命中テスト追加完了。`projectile.js` に区間補間チェック（1tick=0.4セル分割）を実装。`game.js` に `getEnemiesSnapshot` / `injectTestEnemy` を追加、`main.js` の `window.__game` に `getEnemies` / `injectEnemy` を公開。`projectile.spec.js` に距離1〜8セルの命中テスト（条件3）を追加。**13テストグリーン**（デグレなし）。


---

## セッションログ

<!-- 新しいエントリを上に追加していく（最新が一番上） -->

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
| Phase 0 技術基盤 | 🚧 進行中 | 0-0 ✅ / 0-1 ✅ / 0-2 ✅ 完了。0-2 全 Step 完了（constants.js + save.js + passable.js + conditions.js + render-board.js + render-chars.js + input.js + ui.js + projectile.js + enemy-ai.js + player.js + combat.js + boss.js + main.js、12テストグリーン）。次は 0-3（sprites.js 分割）|

| Phase 1 ストーリー基盤 | 🔲 未着手 | |
| Phase 2 8ダンジョン | 🔲 未着手 | |
| Phase 3 アクション深化 | 🔲 未着手 | |
| Phase 4 サブアイテム | 🔲 未着手 | |
| Phase 5 謎解き | 🔲 未着手 | |
| Phase 6 世界観・NPC | 🔲 未着手 | |
| Phase 7 成長システム | 🔲 未着手 | |
| Phase 8 やりこみ・UX | 🔲 未着手 | |

凡例：🔲 未着手 / 🚧 進行中 / ✅ 完了
