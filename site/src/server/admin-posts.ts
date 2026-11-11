// 記事の書き込みと、管理画面用の読み出し（下書きも含む・キャッシュしない）。
// 管理画面と CLI / API（§10-6）の両方がここを通る。呼ぶ側で必ず管理者の確認を済ませること。
import { and, desc, eq, ne, notInArray } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { getDb } from "@/db/client";
import {
  postRevisions,
  posts,
  postTags,
  slugRedirects,
  tags,
} from "@/db/schema";
import { POSTS_TAG } from "./posts";

export type PostStatus = "draft" | "scheduled" | "published";

export type AdminPostRow = {
  id: string;
  slug: string;
  title: string;
  status: PostStatus;
  publishedAt: Date | null;
  updatedAt: Date;
};

export type PostInput = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  status: PostStatus;
  publishedAt: Date | null;
  tagNames: string[];
};

export type EditablePost = PostInput & { id: string; updatedAt: Date };

export class PostInputError extends Error {}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** タグ名から URL 用の slug を作る（日本語はそのまま残す） */
export function tagSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function listAllPosts(): Promise<AdminPostRow[]> {
  return getDb()
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      status: posts.status,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .orderBy(desc(posts.updatedAt));
}

export async function getEditablePost(
  where: { id: string } | { slug: string },
): Promise<EditablePost | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(posts)
    .where("id" in where ? eq(posts.id, where.id) : eq(posts.slug, where.slug));
  if (!row) return null;
  const tagRows = await db
    .select({ name: tags.name })
    .from(postTags)
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(eq(postTags.postId, row.id))
    .orderBy(tags.name);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    status: row.status,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    tagNames: tagRows.map((t) => t.name),
  };
}

function normalize(input: PostInput): PostInput {
  const slug = input.slug.trim();
  const title = input.title.trim();
  if (!SLUG_PATTERN.test(slug)) {
    throw new PostInputError(
      "slug は半角の英小文字・数字・ハイフンで書く（例: first-post）",
    );
  }
  if (!title) throw new PostInputError("タイトルが空");
  if (input.status === "scheduled" && !input.publishedAt) {
    throw new PostInputError("予約公開には公開日時が要る");
  }
  // 公開にしたのに日時が無ければ今を公開日時にする
  const publishedAt =
    input.status === "published" && !input.publishedAt
      ? new Date()
      : input.publishedAt;
  const tagNames = [
    ...new Set(input.tagNames.map((t) => t.trim()).filter(Boolean)),
  ];
  return {
    ...input,
    slug,
    title,
    excerpt: input.excerpt.trim(),
    publishedAt,
    tagNames,
  };
}

/**
 * 記事を保存する。id があれば更新、無ければ作成。保存のたびに版を1つ残し、
 * slug を変えたら旧 slug からの転送を登録し、公開ページのキャッシュを作り直す。
 * 戻り値は記事の id。
 */
export async function savePost(
  id: string | null,
  raw: PostInput,
  source: "admin" | "cli",
): Promise<string> {
  const input = normalize(raw);
  const db = getDb();

  const [taken] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      id
        ? and(eq(posts.slug, input.slug), ne(posts.id, id))
        : eq(posts.slug, input.slug),
    );
  if (taken)
    throw new PostInputError(`slug「${input.slug}」は別の記事が使用中`);

  const values = {
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt,
    body: input.body,
    status: input.status,
    publishedAt: input.publishedAt,
  };

  let postId: string;
  if (id) {
    const [before] = await db
      .select({ slug: posts.slug })
      .from(posts)
      .where(eq(posts.id, id));
    if (!before) throw new PostInputError("記事が見つからない");
    await db
      .update(posts)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(posts.id, id));
    postId = id;
    if (before.slug !== input.slug) {
      await db
        .insert(slugRedirects)
        .values({ oldSlug: before.slug, postId })
        .onConflictDoUpdate({
          target: slugRedirects.oldSlug,
          set: { postId },
        });
    }
  } else {
    const [created] = await db
      .insert(posts)
      .values(values)
      .returning({ id: posts.id });
    postId = created.id;
  }
  // 今の slug が過去の転送元に残っていたら消す（自分自身へ転送しないように）
  await db.delete(slugRedirects).where(eq(slugRedirects.oldSlug, input.slug));

  await setTags(postId, input.tagNames);
  await db.insert(postRevisions).values({
    postId,
    title: input.title,
    excerpt: input.excerpt,
    body: input.body,
    source,
  });

  revalidateTag(POSTS_TAG, "max");
  return postId;
}

async function setTags(postId: string, names: string[]) {
  const db = getDb();
  await db.delete(postTags).where(eq(postTags.postId, postId));
  if (names.length === 0) return;
  const ids: string[] = [];
  for (const name of names) {
    const [tag] = await db
      .insert(tags)
      .values({ name, slug: tagSlug(name) })
      .onConflictDoUpdate({ target: tags.slug, set: { name } })
      .returning({ id: tags.id });
    ids.push(tag.id);
  }
  await db
    .insert(postTags)
    .values(ids.map((tagId) => ({ postId, tagId })))
    .onConflictDoNothing();
}

export async function deletePost(id: string): Promise<void> {
  // 版・タグの紐付け・slug の転送は外部キーの cascade で一緒に消える
  await getDb().delete(posts).where(eq(posts.id, id));
  revalidateTag(POSTS_TAG, "max");
}

/** どの記事にも付いていないタグを消す（記事の削除・タグの付け替えのあとに呼ぶ） */
export async function deleteUnusedTags(): Promise<void> {
  const db = getDb();
  await db
    .delete(tags)
    .where(
      notInArray(tags.id, db.select({ id: postTags.tagId }).from(postTags)),
    );
  revalidateTag(POSTS_TAG, "max");
}
