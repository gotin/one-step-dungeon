// ログインしていない人を管理画面・管理用 API に入れないこと
import { expect, test } from "@playwright/test";

for (const path of ["/admin/", "/admin/posts/new/"]) {
  test(`未ログインで ${path} を開くとログイン画面へ`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\/$/);
    await expect(page.getByRole("button", { name: /GitHub/ })).toBeVisible();
  });
}

test("偽のセッション Cookie では管理画面に入れない", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: "forged.token",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
  await page.goto("/admin/");
  await expect(page).toHaveURL(/\/login\/$/);
});

test("画像アップロードのトークンは未ログインに出さない", async ({
  request,
}) => {
  const res = await request.post("/api/admin/upload/", {
    data: {
      type: "blob.generate-client-token",
      payload: {
        pathname: "posts/x.png",
        clientPayload: null,
        multipart: false,
      },
    },
  });
  expect(res.status()).toBe(401);
});

test("CLI 用 API はトークン無し・違うトークンを断る", async ({ request }) => {
  expect((await request.get("/api/cli/posts/")).status()).toBe(401);
  const wrong = await request.put("/api/cli/posts/e2e-x/", {
    headers: { authorization: "Bearer wrong" },
    data: { slug: "e2e-x", title: "x" },
  });
  expect(wrong.status()).toBe(401);
});
