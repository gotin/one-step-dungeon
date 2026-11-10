import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

export default async function TagPage({ params }: PageProps<"/tags/[tag]">) {
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
