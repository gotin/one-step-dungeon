// tests/volcano-gate.spec.js — Phase 9-6 ⑥-9 volcano L
//
// The volcano slope's two try-now previews (§8-1: tools owned at the D4 approach =
// {sword, shield, boomerang, bow}), verified in the real engine (not just the migration
// script's static checks), plus a 0-pageerror boot of the L cluster.
//
//  1) 弓ゲート @ 12,1: switch 'Y' at (5,4) sits across a lava moat, sword-unreachable.
//     Standing east of the moat and firing an arrow WEST strikes Y → opens gate (4,7).
//       row5:  . . . M Y ~ ~ . . . . .   (Y 5,4 · lava moat 5,5-5,6 · player fires from 5,7)
//  2) ブーメラン隙間越し回収 @ 12,3: a large-rupee 'R' on a lava islet at (4,7), ringed
//     by lava so it can't be walked to. Standing at (4,5) and throwing RIGHT flies the
//     boomerang over the lava and the return grabs the rupee.
//       row4:  . . . . . . ~ R ~ . . .   (R 4,7 ringed by lava · player throws from 4,5)

import { test, expect } from '@playwright/test';
import { waitForBoard, GAME_URL, SAVE_KEY } from './helpers.js';

async function seedOnL(page, stageKey, px, py, heroDir, extra = {}) {
  await page.addInitScript(({ key, value }) => {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
  }, {
    key: SAVE_KEY,
    value: JSON.stringify({
      player: {
        x: px, y: py,
        hp: 8, maxHp: 8, maxHearts: 4, atk: 2, def: 0, keys: 0,
        weapon: 'sword', shield: null, armor: null,
        subItems: extra.subItems || {}, activeSubItem: extra.activeSubItem || null,
        rupees: 0, triforceCount: 0,
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

test.describe('Phase 9-6 ⑥-9 – volcano L', () => {
  test('溶岩の堀の向こうのスイッチを矢で射るとゲート (4,7) が開く（12,1 の弓ゲート）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    // stand east of the lava moat at (col7,row5), face LEFT, holding the bow.
    await seedOnL(page, '12,1', 7, 5, 'left', { subItems: { bow: { count: 20 } }, activeSubItem: 'bow' });

    const before = await page.evaluate(() => window.__game.getStageState().openGates);
    expect(before).not.toContain('4,7');

    // fire an arrow WEST: it flies over the lava moat and strikes Y at (5,4).
    await page.evaluate(() => window.__game.useSubItem());
    for (let i = 0; i < 24; i++) await page.evaluate(() => window.__game.step(1));

    const after = await page.evaluate(() => window.__game.getStageState());
    expect(after.switchToggles, 'arrow must toggle Y at 5,4').toContain('5,4');
    expect(after.openGates, 'toggling Y opens the linked gate 4,7').toContain('4,7');
    expect(errors, `page errors on L 12,1:\n${errors.join('\n')}`).toEqual([]);
  });

  test('ブーメランで溶岩越しに大ルピー R を回収できる（12,3 の予告編）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    // stand at (col5,row4), face RIGHT toward the R islet at (4,7) two tiles east.
    await seedOnL(page, '12,3', 5, 4, 'right', { subItems: { boomerang: { count: 99 } }, activeSubItem: 'boomerang' });

    const result = await page.evaluate(async () => {
      const before = window.__game.getState().player.rupees;
      window.__game.useSubItem();       // throw boomerang right
      window.__game.step(30);           // out-and-back (maxRange 3, catch)
      const after = window.__game.getState().player.rupees;
      return { before, after };
    });

    expect(result.before).toBe(0);
    expect(result.after).toBeGreaterThan(0);   // large rupee retrieved over the lava
    expect(errors, `page errors on L 12,3:\n${errors.join('\n')}`).toEqual([]);
  });

  test('火山の代表画面が 0 pageerror で起動する', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // boot on the caldera landmark (12,0), the かがり火 come-back (11,2), and the
    // chokepoint gauntlet (13,1), then step.
    await seedOnL(page, '12,0', 5, 5, 'down');
    await page.evaluate(() => window.__game.step(10));
    await seedOnL(page, '11,2', 1, 1, 'down');
    await page.evaluate(() => window.__game.step(10));
    await seedOnL(page, '13,1', 1, 1, 'down');
    await page.evaluate(() => window.__game.step(10));
    expect(errors, `page errors booting L screens:\n${errors.join('\n')}`).toEqual([]);
  });
});
