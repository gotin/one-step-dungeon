import Link from "next/link";
import type { PostSummary } from "@/server/posts";
import { PostMeta } from "./post-meta";

export function PostList({ posts }: { posts: PostSummary[] }) {
  if (posts.length === 0)
    return <p className="muted">まだ記事がありません。</p>;
  return (
    <ul className="post-list">
      {posts.map((post) => (
        <li key={post.slug}>
          <h3>
            <Link href={`/blog/${post.slug}/`}>{post.title}</Link>
          </h3>
          <PostMeta post={post} />
          {post.excerpt && <p>{post.excerpt}</p>}
        </li>
      ))}
    </ul>
  );
}
