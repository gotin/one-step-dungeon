// tests/snow-stone-gate.spec.js — Phase 9-6 ⑥-8 snow S (+ 9-6-P puzzle bar)
//
// The snow highland's two showcase puzzles, verified in the real engine (not just the
// migration script's static checks), plus a 0-pageerror boot of the S cluster.
//
//  1) 石押し・倉庫番 @ 13,4 (9-6-P — an ORDER puzzle, not a 1-push tap). Grid:
//        row5:  . . M S . * . * . . . .   (button 5,3 · stone A 5,5 · stone B 5,7)
//        row6:  . . . . . S . . . . . .   (button 6,5)
//        row7:  . . . . . M . . . . . .   (wall 6,5-stopper)
//     TWO stones must each rest on their OWN button; the chest at 3,3 is sealed by
//     `allSwitchesOn` (one button alone does nothing). A's start (5,5) sits ON B's
//     push-lane (row5), so ORDER matters: push A DOWN out of row5 first (5,5→6,5), THEN
//     push B LEFT over the now-empty (5,5) to (5,3). We drive the RIGHT order and assert
//     conditionsMet gains 3,3 only after BOTH buttons read pressed.
//  2) 弓ゲート @ 11,6: switch 'Y' at (5,4) sits across a frozen moat, sword-unreachable.
//     Standing east of the moat and firing an arrow WEST strikes Y → opens gate (4,7).
//
// The stone push has a real-time ~600ms cooldown; we HOLD a direction (queueInput) and
// wait real time so processHeldKeys drives the pushes. Plain walking uses movePlayer
// (0.5 cell/call → 2 calls per tile, no cooldown).

import { test, expect } from '@playwright/test';
import { waitForBoard, GAME_URL, SAVE_KEY } from './helpers.js';

async function seedOnS(page, stageKey, px, py, heroDir, extra = {}) {
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

// walk one full tile in a direction (MOVE_STEP=0.5 → two calls), no stone cooldown.
async function walk(page, dir, tiles = 1) {
  for (let i = 0; i < tiles * 2; i++) {
    await page.evaluate((d) => window.__game.movePlayer(d), dir);
  }
}
// hold a direction for `ms` real time so held-key processing drives cooldown-gated pushes.
async function hold(page, dir, ms) {
  await page.evaluate((d) => window.__game.queueInput(d), dir);
  await page.waitForTimeout(ms);
  await page.evaluate((d) => window.__game.releaseInput(d), dir);
  await page.waitForTimeout(200);
}

test.describe('Phase 9-6 ⑥-8 – snow S', () => {
  test('二石を正しい順で二つの印へ押すと封印が解ける（13,4 の倉庫番）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    // spawn just ABOVE stone A @ (5,5): player at (col5,row4), face DOWN.
    await seedOnS(page, '13,4', 5, 4, 'down');

    const before = await page.evaluate(() => window.__game.getStageState().conditionsMet);
    expect(before).not.toContain('3,3');

    // ── push A DOWN col5 onto button (6,5). Wall 'M' at (7,5) stops it ON. ──
    await hold(page, 'down', 1200);   // ~2 push windows; A lands on 6,5, player at 5,5.
    const s1 = await page.evaluate(() => window.__game.getStageState());
    expect(s1.switchStates['6,5'], 'button 6,5 pressed after stone A parks').toBe(true);
    expect(s1.conditionsMet, 'one button alone must NOT unseal 3,3').not.toContain('3,3');

    // ── navigate (5,5) → (5,8), going around stone B (still on row5 at 5,7): ──
    await walk(page, 'up', 1);        // (5,5) → (4,5)  (row4 is all floor)
    await walk(page, 'right', 3);     // (4,5) → (4,8)
    await walk(page, 'down', 1);      // (4,8) → (5,8), east of stone B

    // ── push B LEFT row5 onto button (5,3). Wall 'M' at (5,2) stops it ON. ──
    // B slides (5,7)→(5,6)→(5,5)→(5,4)→(5,3): ~4 pushes × 600ms.
    await page.evaluate(() => window.__game.movePlayer('left'));  // face left
    await hold(page, 'left', 3600);
    const s2 = await page.evaluate(() => window.__game.getStageState());

    expect(s2.switchStates['6,5'], 'button 6,5 still pressed').toBe(true);
    expect(s2.switchStates['5,3'], 'button 5,3 pressed after stone B parks').toBe(true);
    expect(s2.conditionsMet, 'BOTH buttons on → allSwitchesOn unseals chest 3,3').toContain('3,3');
    expect(errors, `page errors on S 13,4:\n${errors.join('\n')}`).toEqual([]);
  });

  test('凍った堀の向こうのスイッチを矢で射るとゲート (4,7) が開く（11,6 の弓ゲート）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    // stand east of the moat at (col7,row5), face LEFT, holding the bow.
    await seedOnS(page, '11,6', 7, 5, 'left', { subItems: { bow: { count: 20 } }, activeSubItem: 'bow' });

    const before = await page.evaluate(() => window.__game.getStageState().openGates);
    expect(before).not.toContain('4,7');

    // fire an arrow WEST: it flies over the frozen moat and strikes Y at (5,4).
    await page.evaluate(() => window.__game.useSubItem());
    for (let i = 0; i < 24; i++) await page.evaluate(() => window.__game.step(1));

    const after = await page.evaluate(() => window.__game.getStageState());
    expect(after.switchToggles, 'arrow must toggle Y at 5,4').toContain('5,4');
    expect(after.openGates, 'toggling Y opens the linked gate 4,7').toContain('4,7');
    expect(errors, `page errors on S 11,6:\n${errors.join('\n')}`).toEqual([]);
  });

  test('雪の代表画面が 0 pageerror で起動する', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // boot on the かがり火 screen (10,6), the west chokepoint (12,5), and the frozen-falls
    // landmark (12,7), then step.
    await seedOnS(page, '10,6', 1, 1, 'down');
    await page.evaluate(() => window.__game.step(10));
    await seedOnS(page, '12,5', 1, 1, 'down');
    await page.evaluate(() => window.__game.step(10));
    await seedOnS(page, '12,7', 1, 1, 'down');
    await page.evaluate(() => window.__game.step(10));
    expect(errors, `page errors booting S screens:\n${errors.join('\n')}`).toEqual([]);
  });
});
