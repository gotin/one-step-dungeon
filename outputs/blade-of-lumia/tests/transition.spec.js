import { test, expect } from '@playwright/test';
import {
  waitForBoard, GAME_URL, SAVE_KEY,
} from './helpers.js';

// Phase 0-0 スモーク：ステージ遷移
// field "7,14"（12×10）の右端を越えると field "8,14" へ遷移することを確認する。
// #hud-stage-label が "[field] 7,14" → "[field] 8,14" に変わることで検証。

test.describe('Blade of Lumia – ステージ遷移', () => {
  test('右端に到達すると隣のステージに遷移する', async ({ page }) => {
    // field "7,14" の右端付近（x=10, y=5）に seed する。
    // cols=12 なので ArrowRight を数回押せば x>=12 を越えて "8,14" へ遷移する。
    await page.addInitScript(({ key }) => {
      const data = {
        player: {
          x: 10, y: 5,
          hp: 6, maxHp: 6, maxHearts: 3, atk: 2, def: 0, keys: 0,
          weapon: null, shield: null, armor: null,
          subItems: {}, activeSubItem: null, rupees: 0, triforceCount: 0,
        },
        stageState: {},
        currentLayer: 'field',
        stageKey: '7,14',
        heroDir: 'down',
      };
      localStorage.setItem(key, JSON.stringify(data));
    }, { key: SAVE_KEY });

    await page.goto(GAME_URL);

    // セーブがあるのでタイトルが出る → 「続きから」で再開
    const continueBtn = page.locator('#btn-continue');
    await continueBtn.waitFor({ state: 'visible' });
    await continueBtn.click();

    await waitForBoard(page);

    // 初期ステージが "7,14" であることを確認
    const labelEl = page.locator('#hud-stage-label');
    await expect(labelEl).toBeVisible();
    await expect(labelEl).toContainText('7,14');

    // ArrowRight を押し続けて右端を越える。
    // 1 tick = 120ms・1セル程度移動。x=10→12 で遷移するので十分な時間を確保。
    await page.keyboard.down('ArrowRight');
    // ステージが "8,14" に変わるまで最大 3 秒待つ
    await expect(labelEl).toContainText('8,14', { timeout: 3000 });
    await page.keyboard.up('ArrowRight');

    // 遷移後もボードが描画されていること（enterStage が正常完了している）
    const board = page.locator('#board');
    await expect(board).toBeVisible();
    await expect(page.locator('#char-player')).toBeVisible();
  });
});
