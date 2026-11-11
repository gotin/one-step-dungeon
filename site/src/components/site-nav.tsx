"use client";

// ヘッダーのナビゲーション。今いる場所のリンクに aria-current を付ける。
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/blog/", label: "Blog", match: ["/blog/", "/tags/"] },
  { href: "/games/", label: "Games", match: ["/games/"] },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="サイト">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={
            l.match.some((m) => pathname.startsWith(m)) ? "page" : undefined
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
