import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';

// Phase 0-0 最小スモークテスト
// 目的：ゲームページが「エラーなく起動」し、ゲームボードが描画されることを確認する。
// これがリファクタ（モジュール分割）前の最低限の安全網になる。

test.describe('Blade of Lumia – 起動スモーク', () => {
  test('ページがエラーなく起動し、ゲームボードが描画される', async ({ page }) => {
    /** @type {string[]} */
    const pageErrors = [];
    /** @type {string[]} */
    const consoleErrors = [];

    page.on('pageerror', (err) => {
      pageErrors.push(String(err?.message ?? err));
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // セーブデータがない素のコンテキストなので、ロード後すぐ新規ゲームが始まり
    // #board にタイルセルが描画されるはず。
    await page.goto(GAME_URL);

    // 読み込みエラー時は body が差し替えられる（init().catch の挙動）
    await expect(page.locator('body')).not.toContainText('読み込みエラー');

    // ゲームボードにセルが描画されるのを待つ（描画されれば起動成功とみなす）
    await waitForBoard(page);
    await expect(page.locator('#char-player')).toBeVisible();

    // 致命的エラーが出ていないこと
    expect(pageErrors, `pageerror が発生:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `console.error が発生:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
