import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

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
          <nav>
            <Link href="/blog/">Blog</Link>
            <Link href="/#games">Games</Link>
          </nav>
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
