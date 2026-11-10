// 接続先 DB の表と migration の適用状況を表示する（接続文字列は表示しない）。
// 使い方: node --env-file=.env.development.local scripts/db-check.mjs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const host = new URL(process.env.DATABASE_URL).hostname.split(".")[0];
const tables = await sql`
  select table_name from information_schema.tables
  where table_schema = 'public' order by 1`;
const migrations = await sql`
  select count(*)::int as n from drizzle.__drizzle_migrations`.catch(() => [
  { n: 0 },
]);
console.log(`endpoint: ${host}`);
console.log(`tables: ${tables.map((r) => r.table_name).join(" ")}`);
console.log(`migrations applied: ${migrations[0].n}`);
