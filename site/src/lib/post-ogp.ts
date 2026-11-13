// 記事ごとの OGP（SNS で共有したときのカード）に使う画像と説明文を、記事本文の Markdown から取り出す。
// - 画像：本文の最初の画像。無ければ undefined（呼び出し側でサイト共通の画像にする）
// - 説明文：記事の「要約」が空のときの代わりに、本文の最初の段落から120字まで
import type { Paragraph, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const DESCRIPTION_MAX = 120;

function paragraphText(node: Paragraph): string {
  let text = "";
  visit(node, (n) => {
    if (n.type === "text" || n.type === "inlineCode") text += n.value;
    if (n.type === "break") text += " ";
  });
  return text.replace(/\s+/g, " ").trim();
}

export function postOgp(markdown: string): {
  image?: { url: string; alt: string };
  description: string;
} {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(markdown) as Root;

  let image: { url: string; alt: string } | undefined;
  visit(tree, "image", (n) => {
    // 外部の画像（Blob）かサイト内の絶対パスだけ。相対パスは記事の URL で意味が変わるので使わない
    if (!image && /^(https:\/\/|\/)/.test(n.url)) {
      image = { url: n.url, alt: n.alt ?? "" };
    }
  });

  let description = "";
  visit(tree, "paragraph", (n, _i, parent) => {
    // 引用の中（卒業文集の書き起こしなど）は記事の説明にならないので飛ばす
    if (description || parent?.type === "blockquote") return;
    description = paragraphText(n);
  });
  if (description.length > DESCRIPTION_MAX) {
    description = `${description.slice(0, DESCRIPTION_MAX - 1)}…`;
  }

  return { image, description };
}
