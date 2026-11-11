import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PostList } from "@/components/post-list";
import { getTag, listPublishedPosts, listTagSlugs } from "@/server/posts";

const NO_TAG = "__no-tag__";

export async function generateStaticParams() {
  const slugs = await listTagSlugs();
  return (slugs.length > 0 ? slugs : [NO_TAG]).map((tag) => ({ tag }));
}

export async function generateMetadata({
  params,
}: PageProps<"/tags/[tag]">): Promise<Metadata> {
  const tag = await getTag(decodeURIComponent((await params).tag));
  return tag ? { title: `#${tag.name}` } : {};
}

// URL を読む部分は Suspense の中に置く（理由は blog/[slug]/page.tsx と同じ）
async function TagPosts({ params }: Pick<PageProps<"/tags/[tag]">, "params">) {
  const tag = await getTag(decodeURIComponent((await params).tag));
  if (!tag) notFound();
  const posts = await listPublishedPosts({ tagSlug: tag.slug });
  return (
    <>
      <h1>#{tag.name}</h1>
      <PostList posts={posts} />
    </>
  );
}

export default function TagPage({ params }: PageProps<"/tags/[tag]">) {
  return (
    <Suspense fallback={<p className="muted">読み込み中…</p>}>
      <TagPosts params={params} />
    </Suspense>
  );
}
