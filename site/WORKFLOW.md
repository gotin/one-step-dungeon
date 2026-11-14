# Small Isle サイト ワークフロー（`/workflow site` の手順書）

smallisle.works（ブログ＋ゲーム配信）の開発を、セッションをまたいで同じ手順で進めるための runbook。
設計と進み具合の唯一の記録は `site/DESIGN.md`。このファイルは「どう進めるか」だけを書く。

## 🟢 デフォルトフロー：次の段を進める

### Step 1. 現状をつかむ

1. `site/DESIGN.md` を全文読む（記憶に頼らない）。
2. §10「MVP の進め方」で ✅ の付いていない最初の項目が今の段。項目の下に「途中まで」の記録があれば、その続きから始める。
3. `git --no-pager log --oneline -5` と `git status --short` で、未コミットの作業が残っていないかを見る。残っていれば、それが今の段の途中の作業かを先に確かめる。
4. §11「ユーザー側の作業」に、今の段で必要なのにまだ済んでいないもの（OAuth App・Blob ストアなど）があれば、実装より先にユーザーへ頼む（手順は CLI / MCP でできる所まで自分でやり、残りだけを頼む）。

### Step 2. 実装する

- 1つの段が大きいときは、動作確認できる単位に分けて進め、分けた単位ごとにコミットする（例：§10-5 を「CRUD とプレビュー」と「画像アップロード」に分ける）。分けたことは §10 の該当項目の下に書く。
- 守ること：
  - DB は開発用ブランチ（`.env.development.local`）だけを触る。本番（`main`）への migration は §10-9 の切り替えのときに `DB_TARGET=production` を付けたときだけ。
  - 秘密の値は画面にも会話にも出さない。ユーザーに入れてもらうときは `read -s` で git-ignore のファイルへ書く（長いコマンドは貼り付けで折り返されて壊れるので、`.scratch/` にスクリプトを置いて短い1行で実行してもらう）。
  - 管理画面のページ・Server Action・API は必ず `requireAdmin()`（`src/server/admin.ts`）を通す。
  - 記事の書き込みは `src/server/admin-posts.ts` に集める（管理画面と CLI が同じ処理を通る）。
  - Next.js 16 / Better Auth などの API は記憶で書かず、context7 か `node_modules` の型定義で確かめる。

### Step 3. 確かめる

1. `cd site && npx biome check src && npx next typegen && npx tsc --noEmit`
2. 開発サーバは **port 3000 固定**（GitHub OAuth の戻り先がこの port）。起動前に `lsof -nP -iTCP:3000 -sTCP:LISTEN` で空きを確かめる。別プロジェクトが使っていたら止めずにユーザーへ伝える。
   - Claude が起動するときは、ツールのプロセスグループから切り離す（`run_in_background` や `nohup … & disown` では、しばらくして正常終了の形で止まる＝2026-11-11 に5回止まった）。`site/` で次を実行する：
     ```sh
     python3 -c 'import os
     if os.fork() == 0:
         os.setsid(); log = os.open("../.scratch/blog/dev.log", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
         os.dup2(os.open("/dev/null", os.O_RDONLY), 0); os.dup2(log, 1); os.dup2(log, 2)
         os.execvp("npm", ["npm", "run", "dev", "--", "-p", "3000"])'
     ```
3. 未ログインで確かめられることは自分で `curl` か headless（`.scratch/blog/` のスクリプト）で確かめる。ログインが要る操作はユーザーに試してもらう。
4. 公開ページへの影響がある段では、既存ゲームが同じ URL で開けることも確かめる（`.scratch/blog/check-games.mjs`）。

### Step 4. 記録する

- `site/DESIGN.md` §10 の該当項目に ✅ と日付、確認したこと、確かめていないこと、後で効く注意点を書く。段の途中で区切るときは「途中まで：何ができて何が残っているか」を書く。
- 設計を変えたら DESIGN.md の該当の節も直す（古い記述を残さない）。

### Step 5. 報告とコミット

- 作業は `develop` から切った `feature/*` で行う（ブランチ運用はリポジトリ直下の `CLAUDE.md`）。段（または分けた単位）が終わったら、ユーザーの確認を待たずに `feature/*` へコミットしてよい。push と PR は頼まれたときだけ。`develop` → `main` の PR のマージ＝本番公開なので必ず確認する。コミットメッセージは `prefix: summary` の英語。
- ユーザーの確認が要る操作（ログインして試すなど）がある場合は、その結果を聞いてからコミットする。
- 報告に必ず入れるもの：
  1. **試し方**：起動方法（`cd site && npm run dev -- -p 3000`）、確認 URL（`http://localhost:3000/...` を具体的に）、操作手順と「何が見えれば正しいか」。画面に出る変化が無い段は「画面に出る変化なし」と書く。
  2. 確かめていないこと（あれば）。
  3. 次の段の名前。

## 🔀 分岐フロー

- **不具合の報告**：まず原因を調べて事実を伝える。直したら Step 3〜5 と同じ。
- **設計の相談・変更**：DESIGN.md を直してから実装に入る。
- **本番への切り替え（§10-9）**：プレビューデプロイで全ゲームの URL を確認してから。ダッシュボードの操作・本番 DB への migration・push は、それぞれ実行前にユーザーに確認する。
