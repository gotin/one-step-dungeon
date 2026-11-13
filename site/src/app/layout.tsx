import type { Metadata } from "next";
import { DotGothic16, JetBrains_Mono, Noto_Sans_JP } from "next/font/google";
import Link from "next/link";
import "github-markdown-css/github-markdown.css";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Suspense } from "react";
import { NavLinks, SiteNav } from "@/components/site-nav";

// ロゴとトップの大見出しはドット文字、ナビ・ゲーム名・日付・タグは JetBrains Mono、本文と題は Noto Sans JP（§10-10）
const dot = DotGothic16({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dot",
  display: "swap",
  preload: false,
});
const jb = JetBrains_Mono({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-jb",
  display: "swap",
});
const noto = Noto_Sans_JP({
  weight: ["400", "700", "800"],
  subsets: ["latin"],
  variable: "--font-noto",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Small Isle", template: "%s | Small Isle" },
  description: "A small place for things I make.",
  // OGP の画像（app/opengraph-image.png＝トップのヒーローを撮ったもの）を絶対 URL にするための基準
  metadataBase: new URL("https://www.smallisle.works"),
  openGraph: { siteName: "Small Isle", type: "website", locale: "ja_JP" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${dot.variable} ${jb.variable} ${noto.variable}`}
    >
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="site-name">
              {/* biome-ignore lint/performance/noImgElement: 32px のドット絵をそのまま出す */}
              <img src="/art/sprites/heroD.png" alt="" width={32} height={32} />
              <span>Small Isle</span>
            </Link>
            <Suspense fallback={<NavLinks />}>
              <SiteNav />
            </Suspense>
          </div>
        </header>
        <main className="site-main">{children}</main>
        <footer className="site-footer">
          <div className="site-footer-shore" aria-hidden="true" />
          <div className="site-footer-inner">
            <span>© Small Isle</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
