// tests/lake-boomerang-preview.spec.js — Phase 9-6 ⑥-6 lake W
//
// The lake's try-now preview (§8-1): a large-rupee 'R' sits on a water-locked islet
// at (2,3) of screen 10,7, reachable ONLY by throwing the boomerang (owned post-D2)
// across the 2-tile gap from the col-5 bridge. This verifies the design actually
// works in the real engine: standing on the bridge and throwing LEFT retrieves the
// rupee, and the screen boots with zero page errors.

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

async function seedOnLake(page, stageKey, px, py, heroDir) {
  const saveData = JSON.stringify({
    player: {
      x: px, y: py,
      hp: 6, maxHp: 6, maxHearts: 3,
      atk: 2, def: 0, keys: 0,
      weapon: 'sword', shield: null, armor: null,
      subItems: { boomerang: { count: 99 } },
      activeSubItem: 'boomerang',
      rupees: 0, triforceCount: 0,
    },
    stageState: {},
    currentLayer: 'field',
    stageKey,
    heroDir,
  });
  await page.addInitScript(({ key, value }) => {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
  }, { key: SAVE_KEY, value: saveData });
  await page.goto(GAME_URL);
  await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#btn-continue').click();
  await page.waitForFunction(() => {
    const b = document.getElementById('board');
    return !!b && b.children.length > 0;
  });
}

test.describe('Phase 9-6 ⑥-6 – lake W boomerang preview', () => {
  test('ブーメランで水越しに大ルピー R を回収できる（10,7 の予告編）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    // stand on the col-5 bridge at (2,5), face LEFT toward the R islet at (2,3).
    await seedOnLake(page, '10,7', 5, 2, 'left');

    const result = await page.evaluate(async () => {
      const before = window.__game.getState().player.rupees;
      window.__game.useSubItem();       // throw boomerang left
      window.__game.step(30);           // out-and-back (maxRange 3, catch)
      const after = window.__game.getState().player.rupees;
      return { before, after };
    });

    expect(result.before).toBe(0);
    expect(result.after).toBeGreaterThan(0);   // large rupee retrieved across water
    expect(errors, `page errors on lake 10,7:\n${errors.join('\n')}`).toEqual([]);
  });

  test('回収中もプレイヤースプライトが消えない（renderBoard 単独呼びの回帰）', async ({ page }) => {
    // Regression: collectFieldItem calls renderBoard() (rebuilds an EMPTY char-layer)
    // at pickup; without a paired renderChars() the player sprite vanishes until the
    // next render. Step tick-by-tick through the whole throw and assert #char-player
    // is present on EVERY frame (the boomerang flies over the rupee mid-flight).
    await seedOnLake(page, '10,7', 5, 2, 'left');
    const missing = await page.evaluate(async () => {
      window.__game.useSubItem();
      const gone = [];
      for (let i = 0; i < 30; i++) {
        window.__game.step(1);
        if (!document.getElementById('char-player')) gone.push(i);
      }
      return gone;
    });
    expect(missing, `player sprite missing on frames: ${missing.join(',')}`).toEqual([]);
  });

  test('湖の全画面が 0 pageerror で起動する', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // boot on the west hub (8,9), the previously-orphaned interior now connected.
    await seedOnLake(page, '8,9', 5, 4, 'down');
    // a few steps to shake out render/transition errors.
    await page.evaluate(() => window.__game.step(10));
    expect(errors, `page errors booting lake 8,9:\n${errors.join('\n')}`).toEqual([]);
  });
});
