// 公開ページ：トップ・記事一覧・記事・タグ・ゲーム一覧と、既存ゲームの URL
// Next.js 16 は移動前のページを隠したまま DOM に残すので、要素は :visible で数える
import { expect, test } from "@playwright/test";
import { GAMES } from "../../src/data/games.ts";

test("トップに最新の記事とゲームが出る", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "最新の記事" })).toBeVisible();
  await expect(page.locator(".post-list li").first()).toBeVisible();
  await expect(page.locator(".game-card:visible")).toHaveCount(GAMES.length);
});

test("ナビで Games へ移ると今いる場所が示される", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "サイト" })
    .getByText("Games")
    .click();
  await expect(page).toHaveURL(/\/games\/$/);
  await expect(
    page.getByRole("link", { name: "Games", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".game-card:visible")).toHaveCount(GAMES.length);
});

test("記事一覧から記事を開ける", async ({ page }) => {
  await page.goto("/blog/");
  const first = page.locator(".post-list li a").first();
  const title = await first.textContent();
  await first.click();
  await expect(page.locator("article > h1")).toHaveText(title ?? "");
});

test("Markdown の見本記事がエラーなく描ける（アラート・数式・図）", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/blog/markdown-showcase/");
  await expect(page.locator(".markdown-alert-note")).toBeVisible();
  await expect(page.locator(".katex").first()).toBeVisible();
  await expect(page.locator("div.mermaid svg")).toBeVisible();
  // 図にマウスを乗せても例外が出ない（d3-transition の読み込み漏れの再発防止）
  await page.locator("div.mermaid svg g.node").first().hover();
  expect(errors).toEqual([]);
});

test("無い記事は not-found になる", async ({ page }) => {
  await page.goto("/blog/no-such-post-e2e/");
  await expect(page.locator("h1:visible", { hasText: "404" })).toBeVisible();
});

test("旧トップの /index.html は /games/ へ転送される", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page).toHaveURL(/\/games\/$/);
});

for (const game of GAMES) {
  test(`ゲーム ${game.title} が同じ URL で開ける`, async ({ request }) => {
    const res = await request.get(game.href);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("<html");
  });
}
