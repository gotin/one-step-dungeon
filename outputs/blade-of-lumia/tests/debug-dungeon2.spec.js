import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

test('dungeon_2 ボス部屋（0,0）の状態確認', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // dungeon_2 の 0,0 に直接スポーン
  await page.goto(`${GAME}?fromEditor=1&layer=dungeon_2&stage=0%2C0&row=5&col=1`);
  await waitForBoard(page);

  const label = await page.locator('#hud-stage-label').textContent();
  console.log('label:', label);

  const state = await page.evaluate(() => window.__game?.getState?.());
  console.log('currentLayer:', state?.currentLayer);
  console.log('stageKey:', state?.stageKey);
  console.log('enemies count:', state?.enemies?.length);
  console.log('stageData tiles[0]:', state?.stageData?.tiles?.[0]);
  console.log('stageData tiles[2]:', state?.stageData?.tiles?.[2]);

  // ボード上のセルを確認
  const cellCount = await page.locator('#board .cell').count();
  console.log('cell count:', cellCount);

  // 壁タイルのクラスを確認
  const firstCells = await page.evaluate(() => {
    const cells = document.querySelectorAll('#board .cell');
    return Array.from(cells).slice(0, 12).map(c => c.className);
  });
  console.log('first row classes:', firstCells);

  console.log('errors:', errors);
});
