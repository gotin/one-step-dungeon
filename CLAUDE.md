# プロジェクト設定

## コミットメッセージ・PRタイトル

このプロジェクトではチケット番号を使わない。
グローバル設定（`~/.claude/CLAUDE.md`）のチケット番号ルールは**このプロジェクトでは適用しない**。

コミットメッセージは `prefix: summary` 形式のみ（例: `feat: add bow gate mechanic`）。

## ブランチ運用（2026-11-13 ユーザー確定。Blade・サイトとも共通）

`main`（本番）・`develop`（本番の手前）・`feature/*`（作業）の3種類を使う。

1. 作業は `develop` から `feature/<内容>` を切って行う。コミットはこのブランチに積む。
2. `feature/*` → `develop` の PR を作る。マージすると develop のプレビューに出る。
3. 本番に出すときは `develop` → `main` の PR を作り、マージする。マージ＝本番公開（Vercel の production ブランチが `main`）。

- `main` と `develop` は GitHub のブランチ保護で直接 push できない（PR 必須・承認数0・管理者も対象・force push と削除は禁止）。
- PR のマージは、ユーザーに頼まれたときだけ行う。特に `develop` → `main` は本番公開なので必ず確認する。
- develop のプレビュー：`https://one-step-dungeon-git-develop-go-kojima-s-projects.vercel.app/`（Deployment Protection 付き。`vercel curl` で読める）。
- プレビューの DB は開発用の Neon ブランチ（Vercel の Preview 環境の `DATABASE_URL` / `DATABASE_URL_UNPOOLED` だけを開発用に差し替えてある）。本番の記事は読まない・書かない。
- ブログの記事の投稿・編集は DB への書き込みなので、ブランチとは関係なく本番の管理画面か CLI（`POST_ENV_FILE=.env.post.production`）で行う。
- 使い終わった `feature/*` はマージ後に消す。溜め込まない（2026-06〜08 に作業ブランチへ2か月ぶんのコミットが溜まり、公開が止まっていた）。

## Blade of Lumia：敵キャラ作業前の必読

`outputs/blade-of-lumia/` で敵キャラ（陸上敵の directional 機構・スプライト生成）関連のタスクに着手する前に、必ず以下2文書を読むこと：

- `outputs/blade-of-lumia/ENEMY-DIRECTIONAL-GUIDE.md`（向き別スプライト・攻撃・ガード機構の実装知見。guardRangeの罠・敵と重なれない制約・歯の確認の落とし穴など）
- `outputs/blade-of-lumia/SPRITE-PIPELINE.md`（スプライト生成〜量子化の手順書。複数フレームは `quantize-shared.mjs` 必須）

これは2026-08-10、skeleton（骸骨剣士）の①エンジン基盤実装で手戻りが発生した反省から追加した恒久ルール。残り14種の敵実装・今後の新規敵追加のいずれも対象。

## 文体（原始人モードとの関係）

原始人モード（genshijin）が有効でも、**チャット以外のあらゆる出力先には常に通常日本語を使う**。
これはユーザーの確定方針（2026-07-31）＝「どんな場合もチャット以外の場所に対しては通常日本語を使え」。

- 対象＝ドキュメント（`.md` / `.txt` 等）、コミットメッセージ、PR、コードコメント、その他ファイル内容すべて。
- 原始人口調はチャットでの応答本文にのみ適用する。
- **ファイル生成・編集時に「原始人口調で書くか？」の確認は不要**（答えは常に通常日本語）。
