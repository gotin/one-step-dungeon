---
name: workflow
description: Blade of Lumia の開発を進める。outputs/blade-of-lumia/WORKFLOW.md の手順書（runbook）に従って、次にやるべきタスクを自律的に判断・実行・記録する。ユーザーが「WORKFLOW に従って進めて」「次のタスクを進めて」「workflow」と言ったときに使う。
---

# Blade of Lumia ワークフロー実行

このスキルは `outputs/blade-of-lumia/WORKFLOW.md` の runbook に従って開発を進めるためのもの。

## 手順

1. **まず `outputs/blade-of-lumia/WORKFLOW.md` を全文 Read する**（毎回必ず読む。内容が更新されている可能性があるため記憶に頼らない）。
2. WORKFLOW.md に書かれたフロー（デフォルトフロー / 分岐フロー）に従って進める。
   - ユーザーから特に指定がなければ「🟢 デフォルトフロー：次タスクを進める」を実行する。
   - ユーザーがレビュー・バグ報告・アイデア相談など特定の指示をしている場合は、該当する「🔀 分岐フロー」を実行する。
3. WORKFLOW.md が参照する関連ファイル（`PLAN.md` / `PROGRESS.md` / `DECISIONS.md` / `IDEA.md`）も WORKFLOW.md の指示に従って読み書きする。これらは `outputs/blade-of-lumia/` 配下にある。

## 注意

- WORKFLOW.md の指示が常に優先される。このファイルは「WORKFLOW.md を読んで従え」という入口にすぎない。
- コミット操作は実行しない（WORKFLOW.md の規定どおり、メッセージ案の提示まで）。
- `git` を使うときは `git --no-pager ...` を付ける。
