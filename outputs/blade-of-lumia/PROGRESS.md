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
- **進行中タスク：** 0-2 game.js モジュール分割（次のターゲット）
- **直近の状態：** Phase 0-1 完了。論理時間 `gameTime` + `step()` 分離 + `window.__game` フックを実装。Playwright 8テスト（既存5＋決定論3）すべてグリーン。次は 0-2 の分割へ（0-1 と同じく game.js を触るので連続して進めると効率的）。

---

## セッションログ

<!-- 新しいエントリを上に追加していく（最新が一番上） -->

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
| Phase 0 技術基盤 | 🚧 進行中 | 0-0 ✅ / 0-1 ✅ 完了（8テストグリーン）。次は 0-2 モジュール分割 |
| Phase 1 ストーリー基盤 | 🔲 未着手 | |
| Phase 2 8ダンジョン | 🔲 未着手 | |
| Phase 3 アクション深化 | 🔲 未着手 | |
| Phase 4 サブアイテム | 🔲 未着手 | |
| Phase 5 謎解き | 🔲 未着手 | |
| Phase 6 世界観・NPC | 🔲 未着手 | |
| Phase 7 成長システム | 🔲 未着手 | |
| Phase 8 やりこみ・UX | 🔲 未着手 | |

凡例：🔲 未着手 / 🚧 進行中 / ✅ 完了
