// 記事本文（Markdown）を HTML にする。公開ページとエディタのプレビューが同じ処理を通る。
// 書き方は GitHub と同じ：GFM（表・取り消し線・タスクリスト・脚注・自動リンク）、`> [!NOTE]` などのアラート、
// `:smile:` の絵文字、`$…$` / `$$…$$` / ```math の数式、```mermaid の図。見た目は github-markdown-css（`.markdown-body`）。
//
// 安全のための順序：
// 1. 本文中の生 HTML は通さない（remark-rehype の既定）
// 2. rehype-sanitize で許可リスト外のタグ・属性を落とす（XSS 対策）
// 3. sanitize の後に、こちらが作る HTML（アラートの見出し・Mermaid の枠・KaTeX・Shiki の色）を足す。
//    どれも本文の文字列をテキストとして扱う（KaTeX は trust: false＝\href などを使わせない）
import rehypeShiki from "@shikijs/rehype";
import type { Element, Root } from "hast";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, {
  defaultSchema,
  type Options as SanitizeSchema,
} from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGemoji from "remark-gemoji";
import remarkGfm from "remark-gfm";
import { remarkAlert } from "remark-github-blockquote-alert";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

// sanitize の許可リスト＝GitHub と同じ既定値に、アラートの枠と見出しの class だけ足す（アイコンの svg は落とす）
const schema: SanitizeSchema = {
  ...defaultSchema,
  // id の頭の user-content- は remark-rehype が既に付けている（ここでも付けると脚注のリンクが切れる）
  clobberPrefix: "",
  attributes: {
    ...defaultSchema.attributes,
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ["className", /^markdown-alert(-[a-z]+)?$/],
    ],
    p: [
      ...(defaultSchema.attributes?.p ?? []),
      ["className", "markdown-alert-title"],
    ],
  },
};

function classesOf(node: Element): string[] {
  const cls = node.properties.className;
  if (Array.isArray(cls)) return cls.map(String);
  return String(cls ?? "")
    .split(" ")
    .filter(Boolean);
}

// アラートの見出しを「絵文字＋GitHub と同じ表記」にする（NOTE → ℹ️ Note）
const ALERT_TITLES: Record<string, string> = {
  NOTE: "ℹ️ Note",
  TIP: "💡 Tip",
  IMPORTANT: "📌 Important",
  WARNING: "⚠️ Warning",
  CAUTION: "🛑 Caution",
};
function alertTitles() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (!classesOf(node).includes("markdown-alert-title")) return;
      for (const child of node.children) {
        if (child.type === "text") {
          child.value = ALERT_TITLES[child.value.trim()] ?? child.value;
        }
      }
    });
  };
}

// ```mermaid を <div class="mermaid">（中身は図の記述のテキスト）にする。図にするのはブラウザ側
// （src/components/markdown-body.tsx）。Shiki の色付けより前に置き換える。
function mermaidBlocks() {
  return (tree: Root) => {
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "pre" || !parent || index === undefined) return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code || !classesOf(code).includes("language-mermaid")) return;
      const text = code.children
        .map((c) => (c.type === "text" ? c.value : ""))
        .join("");
      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: { className: ["mermaid"] },
        children: [{ type: "text", value: text }],
      };
    });
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkGemoji)
  .use(remarkAlert)
  .use(remarkRehype)
  .use(rehypeSanitize, schema)
  .use(alertTitles)
  .use(mermaidBlocks)
  .use(rehypeKatex, { trust: false, strict: "ignore" })
  .use(rehypeShiki, {
    themes: { light: "github-light", dark: "github-dark" },
    lazy: true,
    fallbackLanguage: "text",
  })
  .use(rehypeStringify);

export async function renderMarkdown(markdown: string): Promise<string> {
  return String(await processor.process(markdown));
}
