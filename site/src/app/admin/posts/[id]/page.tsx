import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/server/admin";
import {
  getEditablePost,
  getRevision,
  listRevisions,
} from "@/server/admin-posts";
import { toEditorValues } from "../editor-values";
import { PostEditor } from "../post-editor";

export const metadata: Metadata = { title: "記事の編集" };

const formatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "medium",
  timeStyle: "medium",
});

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
  const { saved, rev } = await searchParams;
  // ?rev= の版を選んだら、その版のタイトル・概要・本文をエディタに読み込む（保存するまで記事は変わらない）
  const revision =
    typeof rev === "string" && UUID.test(rev)
      ? await getRevision(post.id, rev)
      : null;
  const values = toEditorValues(post);
  if (revision) {
    values.title = revision.title;
    values.excerpt = revision.excerpt;
    values.body = revision.body;
  }
  const revisions = await listRevisions(post.id);
  const isPublic =
    post.status === "published" ||
    (post.status === "scheduled" &&
      post.publishedAt !== null &&
      post.publishedAt <= new Date());
  return (
    <>
      <h1>記事の編集</h1>
      <p className="muted">
        {saved && !revision && <span className="saved">保存した。</span>}
        {isPublic ? (
          <Link href={`/blog/${post.slug}/`}>公開ページを見る →</Link>
        ) : (
          "まだ公開されていない"
        )}
      </p>
      {revision && (
        <p className="notice">
          {formatter.format(revision.createdAt)}{" "}
          の版を読み込んだ。保存するとこの内容に戻る（
          <Link href={`/admin/posts/${post.id}/`}>読み込みをやめる</Link>）
        </p>
      )}
      {/* 保存・版の読み込みのたびに中身を作り直す（key を変える）＝その値で入力欄を初期化する */}
      <PostEditor
        key={`${post.updatedAt.toISOString()}:${revision ? rev : ""}`}
        values={values}
      />
      {/* 保存＝そのまま記事に反映されるので、いちばん新しい版が「今の記事」（公開中なら公開ページの中身）。
          エディタに出ている版は、?rev= で読み込んだ版か、なければいちばん新しい版 */}
      <details className="revisions" open={revision !== null}>
        <summary>保存した版（{revisions.length}）</summary>
        <ul>
          {revisions.map((r, i) => {
            const latest = i === 0;
            const inEditor = revision ? r.id === rev : latest;
            return (
              <li key={r.id} aria-current={inEditor ? "true" : undefined}>
                <Link href={`/admin/posts/${post.id}/?rev=${r.id}`}>
                  {formatter.format(r.createdAt)}
                </Link>{" "}
                {inEditor && (
                  <span className="rev-badge">エディタに表示中</span>
                )}
                {latest && (
                  <span
                    className={
                      isPublic ? "rev-badge rev-badge-public" : "rev-badge"
                    }
                  >
                    {isPublic ? "公開中" : "最新（未公開）"}
                  </span>
                )}{" "}
                <span className="muted small">
                  {r.source === "cli" ? "CLI" : "管理画面"}・{r.title}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
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
