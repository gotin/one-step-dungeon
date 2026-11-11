// 管理画面のトップ＝全記事の一覧（下書き・予約も含む）
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/server/admin";
import { listAllPosts, type PostStatus } from "@/server/admin-posts";

const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "下書き",
  scheduled: "予約",
  published: "公開",
};

const formatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "medium",
  timeStyle: "short",
});

async function PostTable() {
  await requireAdmin();
  const posts = await listAllPosts();
  return (
    <>
      <h1>記事</h1>
      <p>
        <Link href="/admin/posts/new/" className="button">
          新しい記事を書く
        </Link>
      </p>
      {posts.length === 0 ? (
        <p className="muted">まだ記事がない。</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>タイトル</th>
              <th>状態</th>
              <th>公開日時</th>
              <th>更新</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id}>
                <td>
                  <Link href={`/admin/posts/${post.id}/`}>{post.title}</Link>
                  <div className="muted small">{post.slug}</div>
                </td>
                <td>
                  <span className={`status status-${post.status}`}>
                    {STATUS_LABEL[post.status]}
                  </span>
                </td>
                <td className="small">
                  {post.publishedAt ? formatter.format(post.publishedAt) : "—"}
                </td>
                <td className="small">{formatter.format(post.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// Cookie を読む処理は Suspense の中に置く（ページ単体で取得されるときも殻を先に返せるように）
export default function AdminHome() {
  return (
    <Suspense fallback={<p className="muted">読み込み中…</p>}>
      <PostTable />
    </Suspense>
  );
}
