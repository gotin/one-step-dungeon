import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/server/admin";
import { getEditablePost } from "@/server/admin-posts";
import { toEditorValues } from "../editor-values";
import { PostEditor } from "../post-editor";

export const metadata: Metadata = { title: "記事の編集" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function EditPost({
  params,
  searchParams,
}: PageProps<"/admin/posts/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const post = await getEditablePost({ id });
  if (!post) notFound();
  const { saved } = await searchParams;
  const isPublic =
    post.status === "published" ||
    (post.status === "scheduled" &&
      post.publishedAt !== null &&
      post.publishedAt <= new Date());
  return (
    <>
      <h1>記事の編集</h1>
      <p className="muted">
        {saved && <span className="saved">保存した。</span>}
        {isPublic ? (
          <Link href={`/blog/${post.slug}/`}>公開ページを見る →</Link>
        ) : (
          "まだ公開されていない"
        )}
      </p>
      {/* 保存のたびに中身を作り直す（key を変える）＝保存後の値で入力欄を初期化する */}
      <PostEditor
        key={post.updatedAt.toISOString()}
        values={toEditorValues(post)}
      />
    </>
  );
}

export default function EditPostPage(props: PageProps<"/admin/posts/[id]">) {
  return (
    <Suspense fallback={<p className="muted">読み込み中…</p>}>
      <EditPost {...props} />
    </Suspense>
  );
}
