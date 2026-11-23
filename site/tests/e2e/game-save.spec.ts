// ゲームのセーブの API（Blade of Lumia キュー117）：預かる・最後に開いた画面だけが書ける・退会で消える
import { expect, test } from "@playwright/test";
import {
  countRows,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers/test-session";

const GAME = "blade-of-lumia";
const claimUrl = `/api/game/${GAME}/claim/`;
const saveUrl = `/api/game/${GAME}/save/`;

let u: TestUser;
test.beforeEach(async () => {
  u = await createTestUser("save");
});
test.afterEach(async () => {
  await deleteTestUser(u);
});

test("未ログインは claim も save も 401", async ({ request }) => {
  expect((await request.post(claimUrl)).status()).toBe(401);
  const res = await request.put(saveUrl, { data: { token: "x", data: {} } });
  expect(res.status()).toBe(401);
});

test("初めての claim はセーブ無し → 保存 → 次の claim で同じものが返る", async ({
  request,
}) => {
  const headers = { cookie: u.cookieHeader };
  const first = await (await request.post(claimUrl, { headers })).json();
  expect(first.data).toBeNull();
  expect(typeof first.token).toBe("string");

  const data = {
    "blade-of-lumia-save": JSON.stringify({ stageKey: "3,4", hp: 6 }),
    "blade-of-lumia-cleared": null,
  };
  const put = await request.put(saveUrl, {
    headers,
    data: { token: first.token, data },
  });
  expect(put.status()).toBe(200);
  expect(typeof (await put.json()).savedAt).toBe("string");

  const second = await (await request.post(claimUrl, { headers })).json();
  expect(second.data).toEqual(data);
  expect(second.token).not.toBe(first.token);
});

test("後から開いた画面が claim すると、先の画面の保存は 409", async ({
  request,
}) => {
  const headers = { cookie: u.cookieHeader };
  const a = await (await request.post(claimUrl, { headers })).json();
  const b = await (await request.post(claimUrl, { headers })).json();
  const save = (token: string, v: string) =>
    request.put(saveUrl, {
      headers,
      data: { token, data: { "blade-of-lumia-save": v } },
    });
  expect((await save(a.token, "from-a")).status()).toBe(409);
  expect((await save(b.token, "from-b")).status()).toBe(200);
  // 先の画面が取り戻す（claim し直す）と、後の画面の保存が預かられている
  const again = await (await request.post(claimUrl, { headers })).json();
  expect(again.data).toEqual({ "blade-of-lumia-save": "from-b" });
  expect((await save(b.token, "late-b")).status()).toBe(409);
});

test("知らないキー・文字列でない値・知らないゲームは断る", async ({
  request,
}) => {
  const headers = { cookie: u.cookieHeader };
  const { token } = await (await request.post(claimUrl, { headers })).json();
  const bad = async (data: unknown) =>
    (await request.put(saveUrl, { headers, data: { token, data } })).status();
  expect(await bad({ "bladeOfLumiaMapData": "x" })).toBe(400);
  expect(await bad({ "blade-of-lumia-save": 1 })).toBe(400);
  expect(await bad(["x"])).toBe(400);
  const other = await request.post("/api/game/other-game/claim/", { headers });
  expect(other.status()).toBe(404);
});

test("別のサイトからの書き込みは 403", async ({ request }) => {
  const res = await request.post(claimUrl, {
    headers: { cookie: u.cookieHeader, origin: "https://evil.example" },
  });
  expect(res.status()).toBe(403);
});

test("退会でユーザー・セッション・セーブが消える", async ({ request }) => {
  const headers = { cookie: u.cookieHeader };
  const { token } = await (await request.post(claimUrl, { headers })).json();
  await request.put(saveUrl, {
    headers,
    data: { token, data: { "blade-of-lumia-save": "x" } },
  });
  expect(await countRows("game_saves", u.userId)).toBe(1);
  const del = await request.delete("/api/game/account/", { headers });
  expect(del.status()).toBe(200);
  expect(await countRows("user", u.userId)).toBe(0);
  expect(await countRows("session", u.userId)).toBe(0);
  expect(await countRows("game_saves", u.userId)).toBe(0);
  // 消えた後の Cookie ではもう入れない
  expect((await request.post(claimUrl, { headers })).status()).toBe(401);
});
