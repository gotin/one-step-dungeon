// 公開ページ用の記事の読み出し。結果は Next.js のキャッシュに載せ、記事を保存したら
// revalidateTag(POSTS_TAG) で作り直す。予約記事が時刻を過ぎて出るよう、10分ごとにも作り直す。
import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { posts, postTags, slugRedirects, tags } from "@/db/schema";

export const POSTS_TAG = "posts";

export type PostSummary = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: Date | null;
  updatedAt: Date;
  tags: { name: string; slug: string }[];
};

export type PostDetail = PostSummary & { body: string };

function cachePosts() {
  cacheTag(POSTS_TAG);
  cacheLife({ stale: 300, revalidate: 600, expire: 86400 });
}

// 公開記事の条件はここだけに書く
const isPublic = or(
  eq(posts.status, "published"),
  and(eq(posts.status, "scheduled"), lte(posts.publishedAt, sql`now()`)),
);

async function tagsFor(postIds: string[]) {
  const byPost = new Map<string, { name: string; slug: string }[]>();
  if (postIds.length === 0) return byPost;
  const rows = await getDb()
    .select({ postId: postTags.postId, name: tags.name, slug: tags.slug })
    .from(postTags)
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(inArray(postTags.postId, postIds))
    .orderBy(tags.name);
  for (const r of rows) {
    const list = byPost.get(r.postId) ?? [];
    list.push({ name: r.name, slug: r.slug });
    byPost.set(r.postId, list);
  }
  return byPost;
}

const summaryColumns = {
  id: posts.id,
  slug: posts.slug,
  title: posts.title,
  excerpt: posts.excerpt,
  publishedAt: posts.publishedAt,
  updatedAt: posts.updatedAt,
};

export async function listPublishedPosts(
  options: { tagSlug?: string; limit?: number } = {},
): Promise<PostSummary[]> {
  "use cache";
  cachePosts();
  const db = getDb();
  const where = options.tagSlug
    ? and(
        isPublic,
        inArray(
          posts.id,
          db
            .select({ id: postTags.postId })
            .from(postTags)
            .innerJoin(tags, eq(tags.id, postTags.tagId))
            .where(eq(tags.slug, options.tagSlug)),
        ),
      )
    : isPublic;
  const rows = await db
    .select(summaryColumns)
    .from(posts)
    .where(where)
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(options.limit ?? 1000);
  const tagMap = await tagsFor(rows.map((r) => r.id));
  return rows.map(({ id, ...r }) => ({ ...r, tags: tagMap.get(id) ?? [] }));
}

export async function getPublishedPost(
  slug: string,
): Promise<PostDetail | null> {
  "use cache";
  cachePosts();
  const [row] = await getDb()
    .select({ ...summaryColumns, body: posts.body })
    .from(posts)
    .where(and(eq(posts.slug, slug), isPublic));
  if (!row) return null;
  const tagMap = await tagsFor([row.id]);
  const { id, ...rest } = row;
  return { ...rest, tags: tagMap.get(id) ?? [] };
}

// slug を変えた記事の旧 slug なら、今の slug を返す
export async function findRenamedSlug(oldSlug: string): Promise<string | null> {
  "use cache";
  cachePosts();
  const [row] = await getDb()
    .select({ slug: posts.slug })
    .from(slugRedirects)
    .innerJoin(posts, eq(posts.id, slugRedirects.postId))
    .where(and(eq(slugRedirects.oldSlug, oldSlug), isPublic));
  return row?.slug ?? null;
}

export async function listPublishedSlugs(): Promise<string[]> {
  "use cache";
  cachePosts();
  const rows = await getDb()
    .select({ slug: posts.slug })
    .from(posts)
    .where(isPublic);
  return rows.map((r) => r.slug);
}

export async function getTag(
  slug: string,
): Promise<{ name: string; slug: string } | null> {
  "use cache";
  cachePosts();
  const [row] = await getDb()
    .select({ name: tags.name, slug: tags.slug })
    .from(tags)
    .where(eq(tags.slug, slug));
  return row ?? null;
}

export async function listTagSlugs(): Promise<string[]> {
  "use cache";
  cachePosts();
  const rows = await getDb().select({ slug: tags.slug }).from(tags);
  return rows.map((r) => r.slug);
}
