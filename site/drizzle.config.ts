// drizzle-kit は .env を自動で読まないので、ここで読み込む。
// 既定は開発用ブランチ（.env.development.local）。本番 DB（.env.local＝`vercel env pull` の出力）を
// 触るのは `DB_TARGET=production` を付けたときだけ（うっかり本番へ migrate しないため）。
import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

const target =
  process.env.DB_TARGET === "production" ? "production" : "development";
const envFile =
  target === "production" ? ".env.local" : ".env.development.local";
if (!existsSync(envFile)) {
  throw new Error(`${envFile} がありません（DESIGN.md §9 の手順で作る）`);
}
process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error(`${envFile} に DATABASE_URL がありません`);
console.log(`drizzle-kit: ${target} の DB を使う`);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
});
