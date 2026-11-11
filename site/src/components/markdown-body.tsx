"use client";

// 記事本文の表示（公開ページとエディタのプレビューで共通）。HTML は src/lib/markdown.ts で sanitize 済み。
// ```mermaid の図はブラウザで描く。図がある本文のときだけ mermaid を読み込む（重いので）。
import { useEffect, useRef } from "react";

export function MarkdownBody({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: html が変わる＝中の DOM が作り直されたので図を描き直す
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>("div.mermaid:not([data-processed])"),
    );
    if (nodes.length === 0) return;
    let cancelled = false;
    (async () => {
      // d3-transition は selection に .transition() を足す「読み込むだけで効く」モジュール。
      // バンドル時に落とされると、図にマウスを乗せたとき mermaid が例外を出すので明示的に読む
      await import("d3-transition");
      const { default: mermaid } = await import("mermaid");
      if (cancelled) return;
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      mermaid.initialize({
        startOnLoad: false,
        // 図の中のリンクやスクリプトを使わせない
        securityLevel: "strict",
        theme: dark ? "dark" : "default",
      });
      try {
        await mermaid.run({ nodes, suppressErrors: true });
      } catch {
        // 書きかけの図（プレビュー中）は描けないことがある。元のテキストのまま残す
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [html]);

  return (
    <div
      ref={ref}
      className="markdown-body"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: src/lib/markdown.ts で sanitize 済み
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
