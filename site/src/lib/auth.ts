// 管理画面のログイン（DESIGN.md §10-4）。GitHub ログインのみ、ADMIN_GITHUB_ID の1人だけ通す。
// 判定は2段：ログインのたび validateUserInfo で GitHub の ID を照合し、管理画面の表示時にも
// requireAdmin（src/server/admin.ts）で保存済みの account を照合する。
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
  },
  user: {
    validateUserInfo: ({ source }) => {
      const id = source.oauth?.profile?.id;
      const allowed =
        source.oauth?.providerId === "github" &&
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
