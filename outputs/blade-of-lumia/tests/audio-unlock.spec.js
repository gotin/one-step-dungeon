// @ts-check
// 2026-10-17 ユーザー報告「iPhoneだと音がならない（ミュートではない）」。
// iOS Safari は「触れて離した（touchend）／クリック／キー」の中でしか AudioContext の開始・再開を許さない
// （触れた瞬間＝touchstart は数えない）。操作盤は touchstart で再開を呼び、preventDefault で click も止めていた
// ＝遊んでいる間のタッチが一度も許可にならなかった。さらに iOS はアプリの切り替え・着信の後に音が止まる。
// 直し＝shared/sounds.js installAudioUnlock（ページ全体で、離した・クリック・キーのたびに、止まっていれば再開）。
// ⚠️ iOS の「操作が無いと鳴らさない」決まりそのものは Chromium の headless では再現できない（決まりが効かない）
//    ＝ここでは「止まった音が、ボタンの無い所を触れて離しただけで戻る」を見る（直す前はボタン以外では戻らない）。
//    実機の消音スイッチは対象外（iOS の仕様）。「touchstart では許可にならない」も Chromium は許してしまう＝
//    見張る出来事が touchend／click／keydown／pointerup であること自体は実機で確かめる（歯の確認で緑になる1点）。
import { test, expect } from '@playwright/test';
import { waitForBoard, GAME_URL } from './helpers.js';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

const URL = `${GAME_URL}?fromEditor=1&layer=field&stage=7,14&row=5&col=5&ps_weapon=1`;
const state = (page) => page.evaluate(() => window.__game.getAudioState());

async function suspended(page) {
  await page.goto(URL);
  await waitForBoard(page);
  await page.evaluate(() => window.__game.suspendAudio());
  await expect.poll(() => state(page), { timeout: 3000 }).toBe('suspended');
}

test('① 止まった音が、盤面（ボタンの無い所）をタップしただけで戻る', async ({ page }) => {
  await suspended(page);
  const b = await page.locator('#board').boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await expect.poll(() => state(page), { timeout: 3000 }).toBe('running');
});

test('② 何度止まっても（アプリの切り替え・着信の後）タップのたびに戻る', async ({ page }) => {
  await suspended(page);
  const b = await page.locator('#board').boundingBox();
  for (let i = 0; i < 2; i++) {
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await expect.poll(() => state(page), { timeout: 3000 }).toBe('running');
    await page.evaluate(() => window.__game.suspendAudio());
    await expect.poll(() => state(page), { timeout: 3000 }).toBe('suspended');
  }
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await expect.poll(() => state(page), { timeout: 3000 }).toBe('running');
});

test('③ キーを押しても戻る（PC は今までどおり）', async ({ page }) => {
  await suspended(page);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => state(page), { timeout: 3000 }).toBe('running');
});
