// DB クライアント。モジュールの読み込み時には接続しない（DATABASE_URL の無い `next build` でも落ちないように）。
// DB を触るのは src/server/ だけ。UI のコンポーネントから直接呼ばない。
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL が設定されていません");
  return drizzle(neon(url), { schema });
}

let db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  db ??= createDb();
  return db;
}
