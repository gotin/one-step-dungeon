// サイトの E2E テスト。既定は開発サーバ（port 3000・開発用 DB）に対して走らせる。
// 起動していなければ `npm run dev -- -p 3000` を立てる。別の URL へは E2E_BASE_URL で向ける。
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// Vercel のプレビュー（Deployment Protection 付き）へは、手元の OIDC トークンをヘッダーで付けて入る。
// トークンは `vercel env pull` で .env.local に入る短命のもの
const oidc = process.env.E2E_VERCEL_OIDC_TOKEN;
const extraHTTPHeaders = oidc
  ? { "x-vercel-trusted-oidc-idp-token": oidc }
  : undefined;

export default defineConfig({
  testDir: "tests/e2e",
  workers: 2,
  timeout: 60_000,
  reporter: "list",
  use: { baseURL, extraHTTPHeaders, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- -p 3000",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  outputDir: "test-results",
});
