// 記事の作成→公開→非公開化と、予約公開。管理画面と同じ savePost() を通る CLI 用 API で操作する
// （GitHub のログインは自動化できないため）。開発用 DB に e2e- で始まる記事を作り、最後に消す。
import { existsSync } from "node:fs";
import { type APIRequestContext, expect, test } from "@playwright/test";

if (!process.env.ADMIN_API_TOKEN && existsSync(".env.development.local")) {
  process.loadEnvFile(".env.development.local");
}
const TOKEN = process.env.ADMIN_API_TOKEN;
const SLUG = "e2e-publish-flow";
const TAG = "e2e-flow-tag";

test.describe.configure({ mode: "serial" });
test.skip(!TOKEN, "ADMIN_API_TOKEN が無い");

const auth = { authorization: `Bearer ${TOKEN}` };

async function save(
  request: APIRequestContext,
  status: "draft" | "published" | "scheduled",
  publishedAt: string | null = null,
) {
  const res = await request.put(`/api/cli/posts/${SLUG}/`, {
    headers: auth,
    data: {
      slug: SLUG,
      title: "E2E の記事",
      excerpt: "テストで作って消す",
      tags: [TAG],
      status,
      publishedAt,
      body: "E2E の本文。",
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
}

test.afterAll(async ({ request }) => {
  await request.delete(`/api/cli/posts/${SLUG}/`, { headers: auth });
});

test("下書きは公開ページに出ない", async ({ request, page }) => {
  await save(request, "draft");
  await page.goto(`/blog/${SLUG}/`);
  await expect(page.locator("h1:visible", { hasText: "404" })).toBeVisible();
  await page.goto("/blog/");
  await expect(page.getByText("E2E の記事")).toHaveCount(0);
});

test("公開すると記事・一覧・タグに出る", async ({ request, page }) => {
  await save(request, "published");
  await page.goto(`/blog/${SLUG}/`);
  await expect(page.locator("article > h1")).toHaveText("E2E の記事");
  await expect(page.getByText("E2E の本文。")).toBeVisible();
  await page.goto("/blog/");
  await expect(page.getByText("E2E の記事")).toBeVisible();
  await page.goto(`/tags/${TAG}/`);
  await expect(page.getByText("E2E の記事")).toBeVisible();
});

test("下書きに戻すと見えなくなる", async ({ request, page }) => {
  await save(request, "draft");
  await page.goto(`/blog/${SLUG}/`);
  await expect(page.locator("h1:visible", { hasText: "404" })).toBeVisible();
  await page.goto("/blog/");
  await expect(page.getByText("E2E の記事")).toHaveCount(0);
});

test("未来の予約公開はまだ出ない", async ({ request, page }) => {
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  await save(request, "scheduled", future);
  await page.goto(`/blog/${SLUG}/`);
  await expect(page.locator("h1:visible", { hasText: "404" })).toBeVisible();
});

test("削除すると API からも消える", async ({ request }) => {
  const del = await request.delete(`/api/cli/posts/${SLUG}/`, {
    headers: auth,
  });
  expect(del.status()).toBe(200);
  const res = await request.get(`/api/cli/posts/${SLUG}/`, { headers: auth });
  expect(res.status()).toBe(404);
});
