import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { MarkdownBody } from "@/components/markdown-body";
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
  return <MarkdownBody html={html} />;
}

// URL（slug）を読む部分は Suspense の中に置く。外で読むと、リンク先の共通の殻（App Shell）が
// 1つの URL に縛られ、移動がすぐに切り替わらない（Partial Prefetching の instant-shell-url-data）。
// 公開済みの記事は generateStaticParams でビルド時に描画済みなので、ふだんは待ち表示は出ない。
async function Post({ params }: Pick<PageProps<"/blog/[slug]">, "params">) {
  const slug = decodeURIComponent((await params).slug);
  const post = await getPublishedPost(slug);
  if (!post) {
    const renamed = await findRenamedSlug(slug);
    // ストリーミングの途中なので 308 ではなく、ページ内の転送になる
    if (renamed) permanentRedirect(`/blog/${renamed}/`);
    notFound();
  }
  return (
    <article className="post">
      <h1>{post.title}</h1>
      <PostMeta post={post} showUpdated />
      <PostBody markdown={post.body} />
    </article>
  );
}

export default function PostPage({ params }: PageProps<"/blog/[slug]">) {
  return (
    <Suspense fallback={<p className="muted">読み込み中…</p>}>
      <Post params={params} />
    </Suspense>
  );
}
