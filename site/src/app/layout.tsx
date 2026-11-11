import type { Metadata } from "next";
import Link from "next/link";
import "github-markdown-css/github-markdown.css";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Suspense } from "react";
import { NavLinks, SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: { default: "Small Isle", template: "%s | Small Isle" },
  description: "A small place for things I make.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <Link href="/" className="site-name">
            Small Isle
          </Link>
          <Suspense fallback={<NavLinks />}>
            <SiteNav />
          </Suspense>
        </header>
        <main className="site-main">{children}</main>
        <footer className="site-footer">
          <a
            href="https://github.com/gotin/one-step-dungeon"
            target="_blank"
            rel="noopener"
          >
            GitHub
          </a>
        </footer>
      </body>
    </html>
  );
}
