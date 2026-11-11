// CLI / API でやりとりする記事の JSON の形。日時は ISO 8601 の文字列。
import type { EditablePost, PostInput, PostStatus } from "./admin-posts";
import { PostInputError } from "./admin-posts";

export type PostJson = {
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  status: PostStatus;
  publishedAt: string | null;
  updatedAt?: string;
  body: string;
};

const STATUSES: PostStatus[] = ["draft", "scheduled", "published"];

export function toPostJson(post: EditablePost): PostJson {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    tags: post.tagNames,
    status: post.status,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    updatedAt: post.updatedAt.toISOString(),
    body: post.body,
  };
}

/** 受け取った JSON を保存用の形にする。形が違えば PostInputError */
export function fromPostJson(value: unknown): PostInput {
  if (typeof value !== "object" || value === null) {
    throw new PostInputError("記事の JSON がオブジェクトではない");
  }
  const v = value as Record<string, unknown>;
  const text = (key: string, required: boolean): string => {
    const field = v[key];
    if (field === undefined || field === null) {
      if (required) throw new PostInputError(`${key} が無い`);
      return "";
    }
    if (typeof field !== "string") {
      throw new PostInputError(`${key} は文字列で書く`);
    }
    return field;
  };
  const status = v.status ?? "draft";
  if (!STATUSES.includes(status as PostStatus)) {
    throw new PostInputError(
      "status は draft / scheduled / published のどれか",
    );
  }
  const tagsValue = v.tags ?? [];
  if (
    !Array.isArray(tagsValue) ||
    tagsValue.some((t) => typeof t !== "string")
  ) {
    throw new PostInputError("tags は文字列の配列で書く");
  }
  let publishedAt: Date | null = null;
  if (v.publishedAt !== undefined && v.publishedAt !== null) {
    if (typeof v.publishedAt !== "string") {
      throw new PostInputError("publishedAt は ISO 8601 の文字列で書く");
    }
    publishedAt = new Date(v.publishedAt);
    if (Number.isNaN(publishedAt.getTime())) {
      throw new PostInputError(`publishedAt が読めない: ${v.publishedAt}`);
    }
  }
  return {
    slug: text("slug", true),
    title: text("title", true),
    excerpt: text("excerpt", false),
    body: text("body", false),
    status: status as PostStatus,
    publishedAt,
    tagNames: tagsValue as string[],
  };
}
