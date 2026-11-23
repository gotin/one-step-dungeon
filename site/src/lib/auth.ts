// ログイン（DESIGN.md §10-4）。2つの入口がある：
// - GitHub＝管理画面。ADMIN_GITHUB_ID の1人だけ通す。判定は2段：ログインのたび validateUserInfo で
//   GitHub の ID を照合し、管理画面の表示時にも requireAdmin（src/server/admin.ts）で保存済みの account を照合する。
// - Google＝ゲームを遊ぶ人（Blade of Lumia キュー117：セーブを預かる）。誰でも通す。
//   管理画面は requireAdmin が GitHub の account を見るので、Google でログインした人は入れない。
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // 複数の Google アカウントを持つ人が、どれでログインするか選べるように
      prompt: "select_account",
    },
  },
  user: {
    validateUserInfo: ({ source }) => {
      const providerId = source.oauth?.providerId;
      if (providerId === "google") return;
      const id = source.oauth?.profile?.id;
      const allowed =
        providerId === "github" &&
        process.env.ADMIN_GITHUB_ID !== undefined &&
        String(id) === process.env.ADMIN_GITHUB_ID;
      if (!allowed) {
        return {
          error: "not_admin",
          errorDescription: "このアカウントではログインできません",
        };
      }
    },
  },
  // サイトは trailingSlash: true＝/api/auth/xxx も末尾 / 付きへ 308 で回されて届くので、それを受け付ける
  advanced: { skipTrailingSlashes: true },
  // Server Action からログアウトしたときにも Cookie を消せるように（必ず最後に置く）
  plugins: [nextCookies()],
});
