import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // 既存のゲーム配信（vercel.json の trailingSlash: true）と URL の形を揃える
  trailingSlash: true,
  async redirects() {
    // 旧トップ（ゲーム一覧の outputs/index.html）への直リンクを /games へ
    return [{ source: "/index.html", destination: "/games/", permanent: true }];
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      // Next.js のページにもファイルにも当たらない「/…/」は、そのフォルダの index.html を返す。
      // public/ にコピーしたゲーム（/blade-of-lumia/game/ など）をフォルダの URL で開くため。
      fallback: [{ source: "/:path+/", destination: "/:path+/index.html" }],
    };
  },
};

export default nextConfig;
