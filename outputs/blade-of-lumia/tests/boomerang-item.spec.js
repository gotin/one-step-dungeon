// tests/boomerang-item.spec.js – ブーメランによるアイテム回収（Phase 4-4）
//
// ブーメランが通過したマスの鍵・ルピーを回収できる機能のテスト。
//   1. ブーメランが鍵 K を通過すると player.keys が増加する
//   2. ブーメランがルピー r を通過すると player.rupees が増加する
//   3. 回収済みの鍵は再収集されない（pickedKeys ガード）

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

// field '6,13' に配置されたブーメランパズル：
//   (2,7)=f (fence)  (2,8)=K (key)  (2,9)=f (fence)
// プレイヤーを (2,6) に置いて右向きにブーメランを投げると、
// fence (passable for projectile) を越えて key K を回収できる。

async function seedBoomerang(page, stageKey, px, py, extraSave = {}) {
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
    heroDir: 'right',
    ...extraSave,
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

test.describe('Blade of Lumia – ブーメランでアイテム回収（Phase 4-4）', () => {

  test('ブーメランが K（鍵）を通過すると player.keys が 1 増加する', async ({ page }) => {
    // field '6,13' (2,6) に立って右向きにブーメランを投げる
    // ブーメランは (2,7)=fence を通過し (2,8)=K に到達して回収する
    await seedBoomerang(page, '6,13', 6, 2);

    const result = await page.evaluate(async () => {
      const before = window.__game.getState().player.keys;
      window.__game.useSubItem();
      // ブーメランが (2,8) に到達するのに十分なフレーム数を進める
      // speed=1.5, MOVE_STEP=0.5 → 1tick=0.75セル、2セル到達=約3tick
      // maxRange=3 なので往復で 8~10 tick で十分
      window.__game.step(10);
      const after = window.__game.getState().player.keys;
      return { before, after };
    });
    expect(result.before).toBe(0);
    expect(result.after).toBe(1);
  });

  test('回収済みの鍵はブーメランで再収集されない（pickedKeys ガード）', async ({ page }) => {
    // 同じ鍵を2回投げても keys は 1 のまま
    await seedBoomerang(page, '6,13', 6, 2);

    const result = await page.evaluate(async () => {
      // 1回目：鍵を回収
      window.__game.useSubItem();
      window.__game.step(20); // ブーメランが往復して戻るまで十分待つ
      const after1 = window.__game.getState().player.keys;

      // 2回目：再度ブーメランを投げる
      window.__game.useSubItem();
      window.__game.step(20);
      const after2 = window.__game.getState().player.keys;

      return { after1, after2 };
    });
    expect(result.after1).toBe(1);
    expect(result.after2).toBe(1); // 2回目は増えない
  });

  test('ブーメランが r（ルピー）を通過すると player.rupees が増加する', async ({ page }) => {
    // field '6,13' にはルピー r が (8,6) にある
    // プレイヤーを (8,4) に置いて右向きに投げると r (8,6) に届く
    await seedBoomerang(page, '6,13', 4, 8);

    const result = await page.evaluate(() => {
      const before = window.__game.getState().player.rupees;
      window.__game.useSubItem();
      window.__game.step(10);
      const after = window.__game.getState().player.rupees;
      return { before, after };
    });
    expect(result.before).toBe(0);
    expect(result.after).toBe(1); // r = ルピー×1
  });

});
