import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

test.describe('Blade of Lumia – 新規ダンジョン接続', () => {
  test('dungeon_2 入口（field 1,2）からダンジョンに入れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // field 1,2 row7: M....>.....M — col5 に '>', col4 からスポーン
    const url = `${GAME}?fromEditor=1&layer=field&stage=1%2C2&row=7&col=4`;
    await page.goto(url);
    await waitForBoard(page);

    await expect(page.locator('#hud-stage-label')).toContainText('1,2');

    await page.evaluate(() => window.__game.movePlayer('right'));
    await page.evaluate(() => window.__game.step(8));
    await page.evaluate(() => window.__game.step(20));
    await page.waitForTimeout(300);

    await expect(page.locator('#hud-stage-label')).toContainText('dungeon_2', { timeout: 3000 });
    expect(errors).toHaveLength(0);
  });

  test('dungeon_5 入口（field 2,1）からダンジョンに入れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // field 2,1 row8: t....>....tt — col5 に '>', col4 からスポーン
    const url = `${GAME}?fromEditor=1&layer=field&stage=2%2C1&row=8&col=4`;
    await page.goto(url);
    await waitForBoard(page);

    await expect(page.locator('#hud-stage-label')).toContainText('2,1');

    await page.evaluate(() => window.__game.movePlayer('right'));
    await page.evaluate(() => window.__game.step(8));
    await page.evaluate(() => window.__game.step(20));
    await page.waitForTimeout(300);

    await expect(page.locator('#hud-stage-label')).toContainText('dungeon_5', { timeout: 3000 });
    expect(errors).toHaveLength(0);
  });

  test('dungeon_3 エントリ(1,3)上端から弓入手部屋(1,2)へ遷移できる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // Phase 9-2d で dungeon_3 を「水の迷宮」(18部屋)へ再設計。エントリは 1,3、
    // 上端開口(row0 col5,6)から弓矢入手部屋 1,2 へ繋がる（臨界経路の1段目）。
    // 1,3 row1 col5 付近からスポーンし、上へ進んで遷移を確認する。
    const url = `${GAME}?fromEditor=1&layer=dungeon_3&stage=1%2C3&row=1&col=5`;
    await page.goto(url);
    await waitForBoard(page);

    await expect(page.locator('#hud-stage-label')).toContainText('1,3');

    // 上端まで繰り返し up を押して遷移を待つ
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => { window.__game.movePlayer('up'); window.__game.step(2); });
    }

    // 遷移は setTimeout(100ms) で非同期なので waitForFunction で待つ
    await page.waitForFunction(
      () => window.__game.getState().stageKey === '1,2',
      null, { timeout: 3000 }
    );
    expect(errors).toHaveLength(0);
  });
});
