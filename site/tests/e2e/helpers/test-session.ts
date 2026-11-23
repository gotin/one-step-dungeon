// テスト用のログイン：開発用 DB に仮のユーザーとセッションを直接作り、Better Auth と同じ形で署名した Cookie を返す。
// Google のログイン画面を通さずに、ログインが要る API（/api/game/…）を確かめるため。
// ⚠️ 開発用 DB（.env.development.local）だけで動く。E2E_BASE_URL（プレビュー・本番）へ向けたときは使わない。
import { createHmac, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

let loaded = false;
function env(): { url: string; secret: string } {
  if (process.env.E2E_BASE_URL) {
    throw new Error("test-session は開発用 DB 専用（E2E_BASE_URL が付いている）");
  }
  if (!loaded) {
    process.loadEnvFile(".env.development.local");
    loaded = true;
  }
  const url = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!url || !secret) throw new Error("DATABASE_URL / BETTER_AUTH_SECRET が無い");
  return { url, secret };
}

export type TestUser = {
  userId: string;
  /** context.addCookies に渡す Cookie の値（署名つき・URL エンコード済み） */
  cookieValue: string;
  /** request の headers に付ける cookie ヘッダー */
  cookieHeader: string;
};

export const SESSION_COOKIE = "better-auth.session_token";

/** 仮のユーザーとセッションを作る。終わったら deleteTestUser で消す */
export async function createTestUser(label: string): Promise<TestUser> {
  const { url, secret } = env();
  const sql = neon(url);
  const id = `e2e-${label}-${randomBytes(6).toString("hex")}`;
  const token = randomBytes(24).toString("base64url");
  await sql`INSERT INTO "user" (id, name, email, email_verified) VALUES (${id}, ${`E2E ${label}`}, ${`${id}@example.test`}, true)`;
  await sql`INSERT INTO "session" (id, expires_at, token, user_id) VALUES (${`${id}-s`}, now() + interval '1 hour', ${token}, ${id})`;
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  const cookieValue = encodeURIComponent(`${token}.${signature}`);
  return {
    userId: id,
    cookieValue,
    cookieHeader: `${SESSION_COOKIE}=${cookieValue}`,
  };
}

export async function deleteTestUser(user: TestUser): Promise<void> {
  const { url } = env();
  await neon(url)`DELETE FROM "user" WHERE id = ${user.userId}`;
}

export async function countRows(
  table: "user" | "session" | "game_saves",
  userId: string,
): Promise<number> {
  const { url } = env();
  const sql = neon(url);
  const rows =
    table === "user"
      ? await sql`SELECT count(*)::int AS n FROM "user" WHERE id = ${userId}`
      : table === "session"
        ? await sql`SELECT count(*)::int AS n FROM "session" WHERE user_id = ${userId}`
        : await sql`SELECT count(*)::int AS n FROM "game_saves" WHERE user_id = ${userId}`;
  return (rows[0] as { n: number }).n;
}
