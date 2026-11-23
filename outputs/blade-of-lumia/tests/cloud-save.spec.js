// tests/cloud-save.spec.js – ログインしてセーブを預ける（キュー117）
// サイトの API（/api/auth/get-session/・/api/game/blade-of-lumia/…）は route で偽装する。
// 偽装しないとき（開発用の vite サーバ＝/api は HTML）は今までどおり手元だけ＝下の最後のテスト。

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

const API = '**/api/game/blade-of-lumia';

function saveOf(stageKey) {
  return JSON.stringify({
    player: {
      x: 5, y: 5, hp: 6, maxHp: 6, maxHearts: 3, atk: 2, def: 0, keys: 0,
      weapon: null, shield: null, armor: null, subItems: {}, activeSubItem: null,
      rupees: 0, triforceCount: 0, maxArrows: 8, maxBombs: 8, defeatedBosses: [],
      swordTier: -1, armorTier: -1, shieldTier: -1, gachaPulls: {},
    },
    stageState: {}, currentLayer: 'field', stageKey, heroDir: 'down',
  });
}

// 最初の読み込みのときだけ手元のセーブを置く（読み直しで置き直さない＝「こちらで続ける」の後を見るため）
function seedLocalOnce(page, value) {
  return page.addInitScript(({ key, v }) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem(key, v);
  }, { key: SAVE_KEY, v: value });
}

/** サイトの API を偽装する。saves に PUT の本文が溜まる */
async function mockSite(page, { user = null, serverData = null, saveStatus = () => 200 } = {}) {
  const calls = { claims: 0, saves: [], deletes: 0, signIns: [] };
  const json = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/auth/get-session/', (r) => json(r, user ? { user, session: {} } : null));
  await page.route(`${API}/claim/`, (r) => { calls.claims++; return json(r, { token: `t${calls.claims}`, data: serverData, savedAt: null }); });
  await page.route(`${API}/save/`, (r) => {
    const body = r.request().postDataJSON();
    calls.saves.push(body);
    const status = saveStatus(body);
    return json(r, status === 200 ? { savedAt: new Date().toISOString() } : { error: 'x' }, status);
  });
  await page.route('**/api/game/account/', (r) => { calls.deletes++; return json(r, { deleted: true }); });
  await page.route('**/api/auth/sign-in/social/', (r) => {
    calls.signIns.push(r.request().postDataJSON());
    return json(r, { url: '/blade-of-lumia/game/?signed-in-mock=1', redirect: true });
  });
  return calls;
}

async function continueGame(page) {
  await page.locator('#btn-continue').click();
  await expect(page.locator('#title-overlay')).toBeHidden();
  await page.waitForFunction(() => document.getElementById('board')?.children.length > 0);
}

test.describe('キュー117 ログインしてセーブを預ける', () => {

  test('サイトの上では、セーブが無くてもタイトルとログインが出る・「はじめから」は確認なしで始まる', async ({ page }) => {
    const calls = await mockSite(page);
    await page.goto(GAME_URL);
    await expect(page.locator('#title-overlay')).toBeVisible();
    await expect(page.locator('#btn-continue')).toBeHidden();
    await expect(page.locator('#btn-login')).toBeVisible();
    await expect(page.locator('#title-account-user')).toBeHidden();
    expect(calls.claims).toBe(0);   // 未ログインは claim しない

    await page.locator('#btn-newgame').click();
    await expect(page.locator('#confirm-overlay')).toBeHidden();
    await page.waitForFunction(() => document.getElementById('board')?.children.length > 0);
  });

  test('ログインのボタンは Google のログインを今の画面へ戻る形で頼む', async ({ page }) => {
    const calls = await mockSite(page);
    await page.goto(GAME_URL);
    await page.locator('#btn-login').click();
    await page.waitForURL(/signed-in-mock=1/);
    expect(calls.signIns[0]).toEqual({ provider: 'google', callbackURL: '/blade-of-lumia/game/' });
  });

  test('ログイン中・ログイン先にセーブがある → 手元のセーブより優先して続きから', async ({ page }) => {
    await seedLocalOnce(page, saveOf('7,14'));
    await mockSite(page, {
      user: { name: 'テスト太郎', email: 't@example.test' },
      serverData: { [SAVE_KEY]: saveOf('3,4'), 'blade-of-lumia-cleared': null },
    });
    await page.goto(GAME_URL);
    await expect(page.locator('#title-account-name')).toHaveText('テスト太郎');
    await expect(page.locator('#btn-login')).toBeHidden();
    await continueGame(page);
    expect(await page.evaluate(() => window.__game.getState().stageKey)).toBe('3,4');
    expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY)).stageKey).toBe('3,4');
  });

  test('ログイン先にまだ無い → 手元のセーブを上げる・その後の保存も送られる', async ({ page }) => {
    await seedLocalOnce(page, saveOf('7,14'));
    const calls = await mockSite(page, { user: { name: 'A', email: 'a@example.test' } });
    await page.goto(GAME_URL);
    await expect.poll(() => calls.saves.length).toBeGreaterThan(0);
    expect(calls.saves[0].token).toBe('t1');
    expect(JSON.parse(calls.saves[0].data[SAVE_KEY]).stageKey).toBe('7,14');
    expect(Object.keys(calls.saves[0].data).sort()).toEqual([
      'blade-of-lumia-best-time', 'blade-of-lumia-carry', 'blade-of-lumia-cleared', 'blade-of-lumia-save',
    ]);

    // 遊んでいる間の保存（どの口で書いても）は数秒のうちに送られる。変わっていなければ送らない
    await continueGame(page);
    const before = calls.saves.length;
    await page.evaluate((k) => localStorage.setItem(k, '{"stageKey":"9,9"}'), SAVE_KEY);
    await expect.poll(() => calls.saves.length, { timeout: 8000 }).toBe(before + 1);
    expect(calls.saves.at(-1).data[SAVE_KEY]).toBe('{"stageKey":"9,9"}');
    await page.waitForTimeout(3500);
    expect(calls.saves.length).toBe(before + 1);
  });

  test('別の画面に取られた（409）→ 世界を止めて知らせる・「こちらで続ける」で読み直す', async ({ page }) => {
    await seedLocalOnce(page, saveOf('7,14'));
    const calls = await mockSite(page, {
      user: { name: 'A', email: 'a@example.test' },
      serverData: { [SAVE_KEY]: saveOf('7,14') },
      saveStatus: (body) => (body.token === 't1' ? 409 : 200),
    });
    await page.goto(GAME_URL);
    await continueGame(page);
    await page.evaluate((k) => localStorage.setItem(k, '{"stageKey":"9,9"}'), SAVE_KEY);
    await expect(page.locator('#takeover-overlay')).toBeVisible({ timeout: 8000 });

    // 世界が止まっている（実時間のループが回っていない）・ゲームの操作が通らない
    const t0 = await page.evaluate(() => window.__game.getState().player.playMs ?? 0);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__game.getState().player.playMs ?? 0)).toBe(t0);

    // 止まった後はもう送らない
    const n = calls.saves.length;
    await page.evaluate((k) => localStorage.setItem(k, '{"stageKey":"8,8"}'), SAVE_KEY);
    await page.waitForTimeout(3500);
    expect(calls.saves.length).toBe(n);

    // 読み直し＝もう一度 claim してこの画面が書ける画面に戻る（読み直しを待ってから見る＝古い画面の枠で判定しない）
    await Promise.all([page.waitForEvent('load'), page.locator('#btn-takeover').click()]);
    await expect.poll(() => calls.claims).toBe(2);
    await expect(page.locator('#title-overlay')).toBeVisible();
    await expect(page.locator('#takeover-overlay')).toBeHidden();
  });

  test('退会は確認してから消す・戻るでタイトルへ', async ({ page }) => {
    const calls = await mockSite(page, { user: { name: 'A', email: 'a@example.test' } });
    await page.goto(GAME_URL);
    await page.locator('#btn-account-delete').click();
    await expect(page.locator('#account-delete-overlay')).toBeVisible();
    await expect(page.locator('#title-overlay')).toBeHidden();
    await page.locator('#btn-account-delete-no').click();
    await expect(page.locator('#title-overlay')).toBeVisible();
    expect(calls.deletes).toBe(0);

    await page.locator('#btn-account-delete').click();
    await page.locator('#btn-account-delete-yes').click();
    await expect.poll(() => calls.deletes).toBe(1);
  });

  test('サイトの API が無い（開発用の vite サーバ）＝今までどおり：セーブが無ければすぐ始まる', async ({ page }) => {
    await page.goto(GAME_URL);
    await page.waitForFunction(() => document.getElementById('board')?.children.length > 0);
    await expect(page.locator('#title-overlay')).toBeHidden();
    await expect(page.locator('#title-account')).toBeHidden();
  });
});
