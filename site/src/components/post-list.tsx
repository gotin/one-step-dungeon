import Link from "next/link";
import type { PostSummary } from "@/server/posts";
import { DateText, TagLinks } from "./post-meta";

// 作業日誌ふうの一覧：左に日付、右に題・抜粋・タグ
export function PostList({ posts }: { posts: PostSummary[] }) {
  if (posts.length === 0)
    return <p className="muted">まだ記事がありません。</p>;
  return (
    <ul className="post-list">
      {posts.map((post) => (
        <li key={post.slug}>
          <p className="post-list-date">
            {post.publishedAt && <DateText date={post.publishedAt} />}
          </p>
          <div className="post-list-body">
            <h3>
              <Link href={`/blog/${post.slug}/`}>{post.title}</Link>
            </h3>
            {post.excerpt && (
              <p className="post-list-excerpt">{post.excerpt}</p>
            )}
            <p className="chips">
              <TagLinks post={post} />
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
