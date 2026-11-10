// 記事本文（Markdown）を HTML にする。
// 本文中の生 HTML は通さない（remark-rehype の既定）うえ、rehype-sanitize で許可リスト外を落とす（XSS 対策）。
// コードの色付け（Shiki）は sanitize の後＝Shiki が付けるインラインの色は消さない。
import rehypeShiki from "@shikijs/rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(rehypeShiki, {
    themes: { light: "github-light", dark: "github-dark" },
    lazy: true,
    fallbackLanguage: "text",
  })
  .use(rehypeStringify);

export async function renderMarkdown(markdown: string): Promise<string> {
  return String(await processor.process(markdown));
}
