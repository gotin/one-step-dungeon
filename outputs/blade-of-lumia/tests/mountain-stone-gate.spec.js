// tests/mountain-stone-gate.spec.js — Phase 9-6 ⑥-7 mountain/swamp M
//
// The highland's try-now preview (§8-1): a tool-free stone-push gate on screen 10,13
// (the north approach to the D8 swamp temple). Push the '*' stone at (3,4) DOWN col 4
// onto the 'S' button at (6,4); a wall 'M' at (7,4) stops the stone ON the button, so
// the linked 'T' gate at (4,7) opens onto a boxed rupee. This verifies the design
// works in the real engine (not just the migration script's static checks), and that
// the M cluster boots with zero page errors.

import { test, expect } from '@playwright/test';
import { waitForBoard, GAME_URL, SAVE_KEY } from './helpers.js';

async function seedOnM(page, stageKey, px, py, heroDir) {
  await page.addInitScript(({ key, value }) => {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
  }, {
    key: SAVE_KEY,
    value: JSON.stringify({
      player: {
        x: px, y: py,
        hp: 6, maxHp: 6, maxHearts: 3, atk: 2, def: 0, keys: 0,
        weapon: 'sword', shield: null, armor: null,
        subItems: {}, activeSubItem: null, rupees: 0, triforceCount: 0,
      },
      stageState: {},
      currentLayer: 'field',
      stageKey,
      heroDir,
    }),
  });
  await page.goto(GAME_URL);
  const cont = page.locator('#btn-continue');
  await cont.waitFor({ state: 'visible', timeout: 5000 });
  await cont.click();
  await waitForBoard(page);
}

test.describe('Phase 9-6 ⑥-7 – mountain/swamp M', () => {
  test('石を印へ押し込むと沼路の関門ゲート (4,7) が開く（10,13 の予告編）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    // stand just ABOVE the stone at (3,4): player at (x=4,y=2), face DOWN.
    await seedOnM(page, '10,13', 4, 2, 'down');

    // gate is closed before the button is pressed.
    const before = await page.evaluate(() => window.__game.getStageState().openGates);
    expect(before).not.toContain('4,7');

    // hold DOWN to push the stone down col 4 onto the button at (6,4).
    await page.evaluate(() => window.__game.queueInput('down'));
    await page.waitForTimeout(2500);   // 600ms push cooldown × several pushes
    await page.evaluate(() => window.__game.releaseInput('down'));
    await page.waitForTimeout(300);

    const after = await page.evaluate(() => window.__game.getStageState().openGates);
    expect(after, 'stone-on-button must open the linked gate 4,7').toContain('4,7');
    expect(errors, `page errors on M 10,13:\n${errors.join('\n')}`).toEqual([]);
  });

  test('山地/沼の代表画面が 0 pageerror で起動する', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // boot on the NE chokepoint (11,13) and the south junction (10,16), then step.
    await seedOnM(page, '11,13', 1, 1, 'down');
    await page.evaluate(() => window.__game.step(10));
    await seedOnM(page, '10,16', 1, 1, 'down');
    await page.evaluate(() => window.__game.step(10));
    expect(errors, `page errors booting M screens:\n${errors.join('\n')}`).toEqual([]);
  });
});
