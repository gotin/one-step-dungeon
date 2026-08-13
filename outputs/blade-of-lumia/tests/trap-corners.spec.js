// tests/trap-corners.spec.js — Phase 9-6 ⑥-trap (cross-map arrival-wall root-out)
//
// The ⑥-trap pass closed the last 35 §11-1 corner residuals (seams/traps 35→0).
// The static invariants live in field-invariants.spec.js; this spec is the REAL-
// engine proof for the two non-trivial edits — the preserved D6 fire-temple approach
// (2,4), whose designed top corridor (cols4-7) now MIRRORS onto its plain-forest
// neighbour 2,3 (row9 cols4-7 opened from 't' to floor). Walking UP out of 2,4's
// corridor must scroll into 2,3 and land on FLOOR (not clamp at the border), proving
// the crossing is a legit open seam. And a walled corner (a former trap SOURCE) must
// now REFUSE to scroll (you stay put), proving the arrival-wall is gone.

import { test, expect } from '@playwright/test';
import { waitForBoard, GAME_URL } from './helpers.js';

function previewUrl({ stage, row, col }) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: 'field', stage,
    row: String(row), col: String(col), ps_weapon: '1',
  });
  return `${GAME_URL}?${p.toString()}`;
}
const stageKeyNow = (page) => page.evaluate(() => window.__game.getState().stageKey);

test.describe('Phase 9-6 ⑥-trap – 継ぎ目着地が壁でない', () => {
  test('D6 approach 2,4 の縦通路を上に抜けると 2,3 の床へ正常遷移する（開口ミラー）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    // Start in 2,4's open vertical corridor (col5 rows0-4 are floor), near the top.
    await page.goto(previewUrl({ stage: '2,4', row: 1, col: 5 }));
    await waitForBoard(page);
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.__game.movePlayer('up'));
      await page.waitForTimeout(50);
    }
    // Crossed the top edge into 2,3 (arrival cell 9,5 is now floor, not a tree).
    expect(await stageKeyNow(page)).toBe('2,3');
    expect(errors).toEqual([]);
  });

  test('壁化した旧トラップ角 (7,8 右下) は遷移せず留まる（arrival-wall 消滅）', async ({ page }) => {
    // 7,8's SE corner (9,11) was an open '.' opening onto lake 8,8(9,0)='~'. ⑥-trap
    // walled it to 'M', so stepping there must NOT scroll into the lake.
    await page.goto(previewUrl({ stage: '7,8', row: 9, col: 10 }));
    await waitForBoard(page);
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.__game.movePlayer('right'));
      await page.waitForTimeout(50);
    }
    expect(await stageKeyNow(page)).toBe('7,8'); // did not fall into lake 8,8
  });
});
