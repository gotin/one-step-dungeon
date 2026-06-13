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
- **進行中タスク：** 0-0 テスト基盤整備（Playwright導入＋最小スモーク完了）
- **直近の状態：** Playwright導入済み・最小スモーク1本パス。次は移動/遷移/セーブのスモーク追加。

---

## セッションログ

<!-- 新しいエントリを上に追加していく（最新が一番上） -->

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
| Phase 0 技術基盤 | 🚧 進行中 | 0-0 テスト基盤導入中（最小スモーク1本パス） |
| Phase 1 ストーリー基盤 | 🔲 未着手 | |
| Phase 2 8ダンジョン | 🔲 未着手 | |
| Phase 3 アクション深化 | 🔲 未着手 | |
| Phase 4 サブアイテム | 🔲 未着手 | |
| Phase 5 謎解き | 🔲 未着手 | |
| Phase 6 世界観・NPC | 🔲 未着手 | |
| Phase 7 成長システム | 🔲 未着手 | |
| Phase 8 やりこみ・UX | 🔲 未着手 | |

凡例：🔲 未着手 / 🚧 進行中 / ✅ 完了
