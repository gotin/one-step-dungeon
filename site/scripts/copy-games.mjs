// ゲームの配信物（リポジトリ直下の outputs/）を site/public/ へコピーする。
// ゲームは outputs/ に置いたまま開発し（vite 開発サーバ・Playwright テストは従来どおり）、
// 本番では Next.js の静的ファイルとして同じ URL で配信する。site/public/ は丸ごと git-ignore。
// 使い方: node scripts/copy-games.mjs（prebuild / predev から自動で呼ばれる）
import { cpSync, existsSync, rmSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const siteDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(siteDir, "..", "outputs");
const dest = join(siteDir, "public");

// 配信しないもの。トップの index.html / index.css は Next.js のトップに置き換わる。
const SKIP_DIRS = new Set(["node_modules", "tests", "scripts", "playwright-report", "test-results"]);
const SKIP_TOP_FILES = new Set(["index.html", "index.css", "vite.config.mjs"]);
const SKIP_FILES = new Set(["package.json", "package-lock.json", "playwright.config.js", "playtest-notes.json"]);

function shouldCopy(path) {
  const rel = relative(src, path);
  if (rel === "") return true;
  const parts = rel.split(sep);
  const name = basename(path);
  if (parts.some((p) => p.startsWith("."))) return false;
  if (parts.some((p) => SKIP_DIRS.has(p))) return false;
  if (parts.length === 1 && SKIP_TOP_FILES.has(name)) return false;
  if (SKIP_FILES.has(name) || name.endsWith(".md")) return false;
  return true;
}

if (!existsSync(src)) {
  console.error(`copy-games: ${src} が見つかりません`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true, filter: shouldCopy });
console.log(`copy-games: ${relative(siteDir, src)} → ${relative(siteDir, dest)}`);
