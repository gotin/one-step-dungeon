// tests/floor-drop-arrow-scale.spec.js – キュー18（敵撃破ドロップの矢が大きすぎる）
//
// 背景：落ちアイテム（game/game.js spawnFloorDrop）は putCellSprite() に任せてセル全面
// （dot32）で描く。ところが矢の絵（shared/sprites-obj32.js arrowGrid()）は他の落ちアイテム
// （rupee/heart/bombItem）と違って余白なしでセルいっぱいの縦向き矢＝全面貼りだと
// 撃った矢（game/projectile.js PROJ_SPRITE_SCALE 基準の cellPx*0.35）の約2.9倍に膨れる。
// 修正は絵を描き直さず、落ちアイテムの矢だけ箱を縮める（FLOOR_DROP_SPRITE_SCALE）。
//
// 検証内容：
//   ① 敵撃破ドロップの矢の実寸が、撃った矢の実寸と大きすぎない関係にある
//      （セル全面には戻っていない）
//   ② rupee/heart/bomb の落ちアイテムはセル全面のまま（矢だけを縮めた・巻き込み無し）

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';

async function seedAndStart(page, subItems, activeSubItem) {
  const saveData = JSON.stringify({
    player: {
      x: 5, y: 5,
      hp: 6, maxHp: 6, maxHearts: 3,
      atk: 2, def: 0, keys: 0,
      weapon: 'sword',
      shield: null, armor: null,
      subItems,
      activeSubItem,
      rupees: 0, triforceCount: 0,
    },
    stageState: {},
    currentLayer: 'field',
    stageKey: '7,14',
    heroDir: 'right',
  });

  await page.addInitScript(({ key, value }) => {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
  }, { key: SAVE_KEY, value: saveData });

  await page.goto(GAME_URL);
  await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#btn-continue').click();
  await waitForBoard(page);
}

test.describe('キュー18 – 落ちアイテムの矢が大きすぎない', () => {

  test('① 敵撃破ドロップの矢は、撃った矢と大きすぎない関係にある（セル全面ではない）', async ({ page }) => {
    await seedAndStart(page, { bow: { count: 10 } }, 'bow');

    // 撃った矢の実寸（既存テスト tests/projectile.spec.js と同じ発射手順）
    await page.evaluate(() => window.__game.useSubItem());
    await page.evaluate(() => window.__game.step(1));
    const flying = await page.evaluate(() => {
      const cv = document.querySelector('[id^="proj-"] canvas.sprite');
      if (!cv) return null;
      const cs = getComputedStyle(cv);
      const anyCell = document.querySelector('#board .cell');
      return {
        cssW: parseFloat(cs.width),
        cellPx: anyCell ? anyCell.getBoundingClientRect().width : null,
      };
    });
    expect(flying, '飛翔中の矢の canvas が見つからない').toBeTruthy();

    // 敵撃破ドロップの矢の実寸
    const dropped = await page.evaluate(() => {
      const layer = document.getElementById('char-layer');
      const before = layer.children.length;
      window.__game.spawnFloorDrop(1, 1, 'arrow');
      if (layer.children.length !== before + 1) return null;
      const added = layer.lastElementChild;
      const cv = added.querySelector('canvas');
      if (!cv) return null;
      const cs = getComputedStyle(cv);
      return { cssW: parseFloat(cs.width) };
    });
    expect(dropped, '落ちアイテム（矢）の canvas が見つからない').toBeTruthy();

    // 撃った矢（cellPx*0.35 基準）と大きすぎない関係＝ほぼ同程度（±少々）
    expect(dropped.cssW).toBeLessThanOrEqual(flying.cssW * 1.2);
    // リグレッション防止＝セル全面（dot32＝cellPx そのもの）には戻っていない
    expect(dropped.cssW).toBeLessThan(flying.cellPx * 0.6);
  });

  test('② rupee/heart/bomb の落ちアイテムはセル全面のまま（矢だけを縮めた・巻き込み無し）', async ({ page }) => {
    await seedAndStart(page, {}, null);

    const spots = { rupee: [1, 1], heart: [1, 2], bomb: [1, 3] };
    for (const [type, [r, c]] of Object.entries(spots)) {
      const size = await page.evaluate(({ r, c, type }) => {
        const layer = document.getElementById('char-layer');
        window.__game.spawnFloorDrop(r, c, type);
        const added = layer.lastElementChild;
        const cv = added.querySelector('canvas');
        const cs = getComputedStyle(cv);
        const anyCell = document.querySelector('#board .cell');
        return {
          cssW: parseFloat(cs.width),
          cellPx: anyCell ? anyCell.getBoundingClientRect().width : null,
        };
      }, { r, c, type });
      expect(size.cssW, `${type} の落ちアイテムがセル全面から外れた`).toBeCloseTo(size.cellPx, 1);
    }
  });

});
