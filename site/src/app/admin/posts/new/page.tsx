import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/server/admin";
import { toEditorValues } from "../editor-values";
import { PostEditor } from "../post-editor";

export const metadata: Metadata = { title: "新しい記事" };

async function NewPost() {
  // ページ単体で取得されることがある（クライアント遷移）ので、レイアウトとは別に確認する
  await requireAdmin();
  return (
    <>
      <h1>新しい記事</h1>
      <PostEditor values={toEditorValues(null)} />
    </>
  );
}

export default function NewPostPage() {
  return (
    <Suspense fallback={<p className="muted">読み込み中…</p>}>
      <NewPost />
    </Suspense>
  );
}
