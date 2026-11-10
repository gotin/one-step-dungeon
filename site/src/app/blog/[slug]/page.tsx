import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PostMeta } from "@/components/post-meta";
import { renderMarkdown } from "@/lib/markdown";
import {
  findRenamedSlug,
  getPublishedPost,
  listPublishedSlugs,
} from "@/server/posts";

// Cache Components では1件以上返す必要がある。記事が無いうちは存在しない slug で 404 を作る
const NO_POST = "__no-post__";

export async function generateStaticParams() {
  const slugs = await listPublishedSlugs();
  return (slugs.length > 0 ? slugs : [NO_POST]).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(decodeURIComponent(slug));
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt || undefined,
    openGraph: { title: post.title, description: post.excerpt || undefined },
  };
}

async function PostBody({ markdown }: { markdown: string }) {
  "use cache";
  const html = await renderMarkdown(markdown);
  // renderMarkdown は sanitize 済みの HTML を返す
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitize 済み
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default async function PostPage({ params }: PageProps<"/blog/[slug]">) {
  const slug = decodeURIComponent((await params).slug);
  const post = await getPublishedPost(slug);
  if (!post) {
    const renamed = await findRenamedSlug(slug);
    if (renamed) permanentRedirect(`/blog/${renamed}/`);
    notFound();
  }
  return (
    <article>
      <h1>{post.title}</h1>
      <PostMeta post={post} showUpdated />
      <PostBody markdown={post.body} />
    </article>
  );
}
