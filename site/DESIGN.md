# Small Isle サイト設計（Step 2）

元の指示書：`SMALL_ISLE_BLOG_DEVELOPMENT.md`（ChatGPT と相談して作成）。本書はそれを現リポジトリに当てはめた実装方針。

## 1. 置き場所とデプロイ

現状：既存の Vercel プロジェクトが `outputs/` を静的配信し、`https://smallisle.works` で公開中。ブログもゲームもこのドメインで配信したい（ユーザー要望 2026-11-10）。

**1プロジェクトに統合する**（ユーザー決定 2026-11-10。Next.js 化は了承済み＝「ビルド不要は気楽さで選んだだけ」）。

- 同じリポジトリの `site/` に Next.js アプリを置き、既存の Vercel プロジェクトをそのまま Next.js のビルドに切り替える（Root Directory = `site/`）。ドメインの付け替えは不要。
- ゲームは `outputs/` から動かさない。ビルドの最初に `site/scripts/copy-games.mjs` が `outputs/` の配信物を `site/public/` へコピーする（`tests/`・`scripts/`・`node_modules/` 等の配信不要物と、トップの `outputs/index.html` は除く）。`site/public/` のコピー先は git-ignore。
- フォルダの `index.html`：Next.js の `public/` はディレクトリの `index.html` を自動では返さないので、`next.config` の fallback rewrite 1本で「Next.js のページに当たらない `/…/` は `/…/index.html` を返す」。ゲームを足しても書き足し不要。
  ∴ `/blade-of-lumia/game/` などの既存 URL は同じドメイン・同じパスのまま動く。
- 変わるのはトップ `/` だけ：ゲーム一覧から Small Isle のトップになる。ゲーム一覧は `/games` へ移す。
- ゲームの push でも Next.js のビルドが走る。軽くするため、記事ページはビルド時に作らず初回アクセス時に生成してキャッシュする（ISR）＝ビルドは DB に触らずコンパイルだけ。
- 弱点：ブログのコードが壊れているとゲームのデプロイも止まる。push 前にローカルで `npm run build` を通す。
- 切り替えは本番に直接出さない：ブランチのプレビューデプロイで既存ゲームの全 URL が動くのを確かめてから main に入れる。
- 開発時のゲームの作業（`outputs/` での vite 開発サーバ・Playwright テスト）は従来どおりで変わらない。
- 採らなかった案：
  - 2プロジェクト＋プロキシ（ブログ側から未知パスをゲームのプロジェクトへ転送）：プロジェクトが2つになり、転送の遅延と `*.vercel.app` での重複公開が残る
  - Vercel Microfrontends：Hobby は転送リクエストが月5万件までで超過枠が無い。Blade of Lumia は1回の起動で多数の JS モジュールを読むので足りなくなる

## 2. 技術構成

- Next.js 16（App Router）＋ TypeScript、Node.js 24
- Neon PostgreSQL（`@neondatabase/serverless`）＋ Drizzle ORM ＋ drizzle-kit（migration）
- 認証：Better Auth ＋ GitHub OAuth。管理者は GitHub のユーザー ID で allowlist（`ADMIN_GITHUB_ID`）
  - 採用理由：Auth.js は Better Auth に合流し v5 は beta のまま。メールの allowlist はメール送信サービスが別途要るので、GitHub OAuth が最も軽い。メールアドレスでなく数値の ID で照合するのは、メール変更で締め出されないため
  - 認証情報は自前実装しない（パスワードを持たない）。セッション等の表は Better Auth が生成する
- Markdown：remark / rehype ＋ `rehype-sanitize`（XSS 対策）、コードのハイライトは Shiki。MDX は使わない
- 画像：Vercel Blob（管理画面と CLI からアップロード → Markdown に URL を貼る）
- CSS：素の CSS（CSS Modules）。UI ライブラリは入れない
- Vercel Hobby ＋ Neon Free から開始。本番 DB と開発 DB は Neon のブランチで分ける

## 3. ディレクトリ構成

```text
site/
├── DESIGN.md                 本書
├── README.md                 起動・DB・migration・デプロイ・管理画面の入り方
├── package.json
├── next.config.ts
├── drizzle.config.ts
├── .env.example
├── drizzle/                  生成された migration（Git 管理）
├── scripts/
│   ├── post.ts               CLI：Markdown ファイルを投稿・更新（push）／取得（pull）
│   ├── export.ts             全記事を Markdown へ書き出す（バックアップ）
│   └── seed.ts
└── src/
    ├── app/
    │   ├── page.tsx                      /
    │   ├── blog/page.tsx                 /blog
    │   ├── blog/[slug]/page.tsx          /blog/[slug]
    │   ├── tags/[tag]/page.tsx           /tags/[tag]
    │   ├── games/page.tsx                /games
    │   ├── projects/page.tsx             /projects
    │   ├── about/page.tsx                /about
    │   ├── admin/…                       /admin/posts, new, [id]/edit
    │   └── api/
    │       ├── auth/[...all]/route.ts    Better Auth
    │       └── admin/posts/…             CLI 用 API（トークン認証）
    ├── db/
    │   ├── schema.ts
    │   └── client.ts
    ├── server/               DB アクセスはここだけ（UI から直接呼ばない）
    │   ├── posts.ts
    │   ├── tags.ts
    │   └── search.ts         検索は差し替えやすいよう1ファイルに閉じる
    ├── lib/
    │   ├── markdown.ts
    │   ├── auth.ts
    │   └── validation.ts     zod スキーマ（管理画面・API・CLI で共通）
    └── proxy.ts              /admin/** の未認証アクセスを弾く（Next.js 16 で middleware.ts から改名）
```

## 4. DB スキーマ

```text
posts
  id            uuid PK
  slug          text UNIQUE
  title         text
  excerpt       text
  body          text            Markdown のまま保存
  status        enum(draft, scheduled, published)
  published_at  timestamptz NULL
  created_at    timestamptz
  updated_at    timestamptz

post_revisions                  保存のたびに1行（上書き事故の保険。MVP に含める）
  id, post_id FK, title, excerpt, body, source enum(admin, cli), created_at

tags
  id, name, slug UNIQUE, created_at

post_tags
  post_id FK, tag_id FK, UNIQUE(post_id, tag_id)

slug_redirects                  slug を変えたとき旧 URL から 308 で飛ばす
  old_slug UNIQUE, post_id FK

（Better Auth 生成：user / session / account / verification）

comments                        Phase 2。指示書の案どおり
```

公開記事の条件は1箇所（`server/posts.ts`）にだけ書く：

```text
status = 'published'
OR (status = 'scheduled' AND published_at <= now())
```

## 5. キャッシュと公開予約

- 公開ページは静的に描画してキャッシュし、記事を保存したら（管理画面・CLI どちらからでも）該当タグを revalidate して即反映する。
- 予約記事は保存しただけでは画面に出ないので、一覧と記事ページに時間ベースの revalidate（10分）を付ける。∴予約公開は最大10分遅れる。Hobby の cron は1日1回までなので cron には頼らない。
- 下書きのプレビュー：管理者がログイン中なら `/blog/[slug]?preview=1` で下書きも表示する。

## 6. CLI / API からの投稿

ローカルで Markdown を書いて、そのまま投稿できる入口。管理画面と同じ `server/posts.ts` を通る。

```markdown
---
slug: first-post
title: はじめての記事
excerpt: 概要
tags: [game-dev, blade-of-lumia]
status: draft
published_at: 2026-11-20T09:00:00+09:00
---

本文（Markdown）
```

- `npm run post push <file.md>`：slug をキーに作成または更新する。本文中のローカル画像は Blob へ上げて URL に置き換える
- `npm run post pull <slug>`：DB の記事を同じ形式の Markdown に書き出す
- API の認証は `ADMIN_API_TOKEN`（Bearer）。値は `.secrets/` か `.env.local` に置き、Git に入れない
- 書きかけの原稿の置き場は `site/drafts/`（git-ignore）

## 7. バックアップ

`npm run export` で全記事を §6 と同じ形式の Markdown に書き出す。出力先を Git 管理下（例：`site/content-backup/`）にすれば、DB を正としつつ Git にも履歴が残る。定期実行するかは運用で決める。

## 8. 検索（Phase 2）

- 最初は `ILIKE`（タイトル・概要・本文・タグ）。
- 次の段は Postgres 標準の Full Text Search ではなく `pg_trgm`（Neon で使える）。標準の FTS は日本語を単語に分けられないため。

## 9. 環境変数

```text
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
ADMIN_GITHUB_ID=
ADMIN_API_TOKEN=
BLOB_READ_WRITE_TOKEN=
```

## 10. MVP の進め方

指示書の Step 3〜10 に沿う。1段ずつ動作確認してからコミットする。

1. ✅ `site/` の雛形（Next.js 16.4・TypeScript・Biome 2 は `site/biome.json` で独立。直下の Biome 1.9 設定は使わない）＋ゲームのコピーと `index.html` の rewrite（2026-11-10。ローカルの `next build && next start` で全ゲーム・エディタを headless で開き、失敗リクエスト0を確認。`/_vercel/speed-insights/script.js` の 404 はローカルだけで vite でも同じ）
2. ✅ DB 接続＋migration、`posts` / `post_revisions` / `tags` / `post_tags` / `slug_redirects`（2026-11-10。`drizzle/0000_init.sql` を開発用ブランチへ適用済み。本番 `main` は切り替え時に適用する）
3. 公開ページ（`/`、`/blog`、`/blog/[slug]`、`/tags/[tag]`）と seed
4. 管理画面の認証（Better Auth＋GitHub）
5. 管理画面の CRUD（textarea＋右に Markdown プレビュー、画像アップロード）
6. CLI / API（push・pull・export）
7. 全体ナビゲーションと `/games`
8. build / lint / test（Playwright で公開ページ・未認証の `/admin` 拒否・作成〜公開〜非公開化）
9. 既存 Vercel プロジェクトを Next.js のビルドへ切り替え（プレビューで確認→本番）。既存ゲームが同じ URL で起動することを確認する

## 11. ユーザー側の作業（実装中に必要になった時点で依頼する）

- ✅ Neon：2026-11-10 に Vercel Marketplace から作成（`small-isle-db`、Free プラン、シンガポール `sin1`、Neon Auth なし）。プロジェクト `one-step-dungeon`（Vercel アカウント gotin-8885 / チーム go-kojima-s-projects）に接続済みで `DATABASE_URL` ほかが自動登録された。手元は `site/.env.local`（`vercel env pull`）
  - ✅ 開発用と本番用を分けた（2026-11-10）：Neon のブランチ `main`＝本番、`development`＝開発（`main` から作成）。Vercel 側の環境変数はプロジェクトの3環境とも `main` を指したまま（integration 管理の変数なので触らない）
  - 手元の env ファイル（すべて git-ignore・権限 600）：
    - `.env.local`：`vercel env pull` の出力＝本番 `main`
    - `.env.development.local` / `.env.production.local`：開発用 `development` の `DATABASE_URL` / `DATABASE_URL_UNPOOLED`。Next.js はこれらを `.env.local` より優先するので、手元の `next dev` も `next start` も開発用ブランチを使う
    - `drizzle.config.ts` は既定で `.env.development.local` だけを読む。本番へ migrate するのは `DB_TARGET=production npm run db:migrate` のときだけ
  - Neon の API キーは `.secrets/neon-api-key`（リポジトリ直下、git-ignore）。ブランチ操作は `NEON_API_KEY` に渡して `npx neonctl` で行う
  - `npm run db:check`：接続先の表と migration の適用数を表示する（接続文字列は出さない）
- GitHub OAuth App の作成（開発用 `http://localhost:3000`、本番用 `https://smallisle.works`）
- Blob ストアの作成
- 切り替え：既存プロジェクトの Root Directory を `site/`、Framework を Next.js に変える（ダッシュボード操作）。ルートの `vercel.json`（`outputDirectory: outputs`）は同時に外す。「Root Directory の外のファイルをビルドに含める」設定が有効であること（`../outputs` を読むため。既定で有効）。直前にプレビューデプロイで既存ゲームの全 URL を確認する
