import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Small Isle",
  description: "A small place for things I make.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
