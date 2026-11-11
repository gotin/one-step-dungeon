// 管理者かどうかの判定。管理画面のページ・Server Action・API は必ずここを通す
// （proxy.ts の Cookie 確認は「ログイン画面へ早めに飛ばす」だけで、守りにはならない）。
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { account } from "@/db/schema";
import { auth } from "@/lib/auth";

export type Admin = { userId: string; name: string; image: string | null };

/** 管理者ならその情報、そうでなければ null */
export async function getAdmin(): Promise<Admin | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const adminId = process.env.ADMIN_GITHUB_ID;
  if (!session || !adminId) return null;
  const rows = await getDb()
    .select({ accountId: account.accountId })
    .from(account)
    .where(
      and(
        eq(account.userId, session.user.id),
        eq(account.providerId, "github"),
      ),
    );
  if (!rows.some((r) => r.accountId === adminId)) return null;
  return {
    userId: session.user.id,
    name: session.user.name,
    image: session.user.image ?? null,
  };
}

/** 管理者でなければログイン画面へ飛ばす */
export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) redirect("/login/");
  return admin;
}
