import Link from "next/link";
import type { PostSummary } from "@/server/posts";

const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function DateText({ date }: { date: Date }) {
  return <time dateTime={date.toISOString()}>{dateFormat.format(date)}</time>;
}

export function TagLinks({ post }: { post: PostSummary }) {
  return post.tags.map((tag) => (
    <Link key={tag.slug} href={`/tags/${tag.slug}/`} className="chip tag">
      #{tag.name}
    </Link>
  ));
}

export function PostMeta({
  post,
  showUpdated = false,
}: {
  post: PostSummary;
  showUpdated?: boolean;
}) {
  const updatedDiffers =
    showUpdated &&
    post.publishedAt &&
    dateFormat.format(post.updatedAt) !== dateFormat.format(post.publishedAt);
  return (
    <p className="post-meta">
      {post.publishedAt && <DateText date={post.publishedAt} />}
      {updatedDiffers && (
        <span>
          （更新 <DateText date={post.updatedAt} />）
        </span>
      )}
      <TagLinks post={post} />
    </p>
  );
}
