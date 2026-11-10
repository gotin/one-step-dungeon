// DB スキーマ（DESIGN.md §4）。変更したら `npm run db:generate` で migration を作る。
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const postStatus = pgEnum("post_status", [
  "draft",
  "scheduled",
  "published",
]);

export const revisionSource = pgEnum("revision_source", ["admin", "cli"]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    // Markdown のまま保存する
    body: text("body").notNull().default(""),
    status: postStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("posts_status_published_at_idx").on(t.status, t.publishedAt)],
);

// 保存のたびに1行（上書き事故の保険）
export const postRevisions = pgTable(
  "post_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    body: text("body").notNull(),
    source: revisionSource("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("post_revisions_post_id_idx").on(t.postId, t.createdAt)],
);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

export const postTags = pgTable(
  "post_tags",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.tagId] }),
    index("post_tags_tag_id_idx").on(t.tagId),
  ],
);

// slug を変えたとき、旧 URL から新しい記事へ 308 で飛ばす
export const slugRedirects = pgTable("slug_redirects", {
  oldSlug: text("old_slug").primaryKey(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});
