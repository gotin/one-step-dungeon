// 開発用ブランチへサンプル記事を入れる（何度実行しても同じ状態になる）。本番 DB には入れない。
// 使い方: npm run db:seed
import { neon } from "@neondatabase/serverless";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { posts, postTags, tags } from "../src/db/schema.ts";

if (process.env.DB_TARGET === "production") {
  throw new Error("seed は本番 DB には流さない");
}
process.loadEnvFile(".env.development.local");
const url = process.env.DATABASE_URL;
if (!url)
  throw new Error(".env.development.local に DATABASE_URL がありません");
const db = drizzle(neon(url));

const hour = 3600 * 1000;
const samples = [
  {
    slug: "hello-small-isle",
    title: "Small Isle をはじめました",
    excerpt: "ゲームとブログを置く小さな場所。",
    status: "published" as const,
    publishedAt: new Date(Date.now() - 48 * hour),
    tags: ["お知らせ"],
    body: [
      "## はじめに",
      "",
      "ここは作ったものを置く場所です。**太字**、`inline code`、[リンク](/blog/)。",
      "",
      "- 箇条書き1",
      "- 箇条書き2",
      "",
      "> 引用文",
      "",
      "```ts",
      'const greeting: string = "hello";',
      "console.log(greeting);",
      "```",
      "",
      '<script>alert("この行は表示されないはず")</script>',
    ].join("\n"),
  },
  {
    slug: "blade-of-lumia-scrolls",
    title: "Blade of Lumia に剣技の巻物を足した",
    excerpt: "8つ集めると回転斬りが広がる。",
    status: "published" as const,
    publishedAt: new Date(Date.now() - 24 * hour),
    tags: ["ゲーム開発", "Blade of Lumia"],
    body: "巻物を4つで回転斬り、8つで2マス先まで届く。\n\n| 個数 | 効果 |\n| --- | --- |\n| 4 | 回転斬り |\n| 8 | 2マス |",
  },
  {
    slug: "markdown-showcase",
    title: "Markdown の見え方の確認",
    excerpt: "GitHub と同じ書き方がどう見えるかの見本。",
    status: "published" as const,
    publishedAt: new Date(Date.now() - 12 * hour),
    tags: ["お知らせ"],
    body: [
      "## 見出し2",
      "### 見出し3",
      "",
      "> [!NOTE]",
      "> 補足のメモ。",
      "",
      "> [!TIP]",
      "> ヒント。",
      "",
      "> [!IMPORTANT]",
      "> 大事なこと。",
      "",
      "> [!WARNING]",
      "> 注意すること。",
      "",
      "> [!CAUTION]",
      "> 危ないこと。",
      "",
      "絵文字 :smile: :tada: :+1: :sparkles:",
      "",
      "インラインの式 $E = mc^2$ と、ブロックの式：",
      "",
      "$$",
      "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}",
      "$$",
      "",
      "```mermaid",
      "graph LR",
      "  A[記事を書く] --> B{公開?}",
      "  B -- はい --> C[公開ページ]",
      "  B -- いいえ --> D[下書き]",
      "```",
      "",
      "~~取り消し~~、**太字**、*斜体*、`code`、https://smallisle.works",
      "",
      "- [x] 済んだこと",
      "- [ ] まだのこと",
      "",
      "| 列A | 列B |",
      "| --- | ---: |",
      "| あ | 1 |",
      "| い | 22 |",
      "",
      "脚注つきの文[^1]。",
      "",
      "```js",
      "const answer = 42;",
      "```",
      "",
      "[^1]: 脚注の本文。",
    ].join("\n"),
  },
  {
    slug: "draft-not-visible",
    title: "下書き（公開ページに出ないはず）",
    excerpt: "",
    status: "draft" as const,
    publishedAt: null,
    tags: ["ゲーム開発"],
    body: "下書き",
  },
  {
    slug: "scheduled-future",
    title: "予約記事（明日まで出ないはず）",
    excerpt: "",
    status: "scheduled" as const,
    publishedAt: new Date(Date.now() + 24 * hour),
    tags: [],
    body: "予約",
  },
];

const tagSlug = (name: string) => name.toLowerCase().replace(/\s+/g, "-");

await db.delete(posts).where(
  inArray(
    posts.slug,
    samples.map((s) => s.slug),
  ),
);
for (const s of samples) {
  const [post] = await db
    .insert(posts)
    .values({
      slug: s.slug,
      title: s.title,
      excerpt: s.excerpt,
      body: s.body,
      status: s.status,
      publishedAt: s.publishedAt,
    })
    .returning({ id: posts.id });
  for (const name of s.tags) {
    const [tag] = await db
      .insert(tags)
      .values({ name, slug: tagSlug(name) })
      .onConflictDoUpdate({ target: tags.slug, set: { name } })
      .returning({ id: tags.id });
    await db.insert(postTags).values({ postId: post.id, tagId: tag.id });
  }
}
console.log(`seed: ${samples.length} 件`);
