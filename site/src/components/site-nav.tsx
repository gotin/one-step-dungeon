"use client";

// ヘッダーのナビゲーション。今いる場所のリンクに aria-current を付ける。
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/blog/", label: "Blog", match: ["/blog/", "/tags/"] },
  { href: "/games/", label: "Games", match: ["/games/"] },
];

/** 今いる場所が分からないとき（pathname 無し）は、どれも強調しない */
export function NavLinks({ pathname }: { pathname?: string }) {
  return (
    <nav aria-label="サイト">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={
            pathname && l.match.some((m) => pathname.startsWith(m))
              ? "page"
              : undefined
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

// usePathname() は URL を読むので、レイアウトでは <Suspense> の中に置く（外だとビルドが止まる）
export function SiteNav() {
  return <NavLinks pathname={usePathname()} />;
}
