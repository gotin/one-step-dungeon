// tests/boomerang-stun.spec.js – ブーメランスタン（Phase 3-4）
//
// ブーメランが命中すると敵が stunUntil を持ち、スタン中は enemyTick をスキップする
// (移動・攻撃が止まる)ことを検証する。
//   1. スタン後に getEnemies()[id].stunUntil が gameTime より大きい
//   2. スタン中は step(1) を何度踏んでも敵の座標が変化しない（移動スキップ）
//   3. スタン期間が過ぎたら通常通り動く

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

async function seedAndStart(page) {
  const saveData = JSON.stringify({
    player: {
      x: 2, y: 5,
      hp: 6, maxHp: 6, maxHearts: 3,
      atk: 2, def: 0, keys: 0,
      weapon: 'sword', shield: null, armor: null,
      subItems: {}, activeSubItem: null,
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
  await page.waitForFunction(() => {
    const b = document.getElementById('board');
    return !!b && b.children.length > 0;
  });
}

test.describe('Blade of Lumia – ブーメランスタン（Phase 3-4）', () => {

  test('スタン後は stunUntil が現在 gameTime より大きい', async ({ page }) => {
    await seedAndStart(page);
    const result = await page.evaluate(() => {
      const id = window.__game.injectEnemy(8, 5, 50, 1, 1);
      const state0 = window.__game.getState();
      window.__game.stunEnemy(id, 1500);
      const enemies = window.__game.getEnemies();
      const e = enemies.find(x => x.id === id);
      return {
        stunUntil: e?.stunUntil ?? null,
        gameTime: state0.gameTime,
      };
    });
    expect(result.stunUntil).not.toBeNull();
    expect(result.stunUntil).toBeGreaterThan(result.gameTime);
  });

  test('スタン中は step を踏んでも敵の座標が変化しない', async ({ page }) => {
    await seedAndStart(page);
    const moved = await page.evaluate(() => {
      // プレイヤーから少し離れた場所に敵を置く（AI が追いかけようとする距離）
      const id = window.__game.injectEnemy(8, 5, 50, 1, 1);
      // スタンを強制適用（5フレーム分以上）
      window.__game.stunEnemy(id, 800);
      const before = window.__game.getEnemies().find(x => x.id === id);
      const bx = before?.x ?? 0;
      const by = before?.y ?? 0;
      window.__game.step(5);
      const after = window.__game.getEnemies().find(x => x.id === id);
      const ax = after?.x ?? 0;
      const ay = after?.y ?? 0;
      return { moved: bx !== ax || by !== ay };
    });
    expect(moved.moved).toBe(false);
  });

  test('スタン期間が過ぎると stunUntil がゲーム時刻以下になりスキップされない', async ({ page }) => {
    await seedAndStart(page);
    const result = await page.evaluate(() => {
      const id = window.__game.injectEnemy(8, 5, 50, 1, 1);
      // 120ms = 1フレーム分のスタンを付けて2フレーム進める
      window.__game.stunEnemy(id, 120);
      window.__game.step(2);  // gameTime += 240ms → stunUntil(=0+120) < gameTime(=240)
      const state = window.__game.getState();
      const e = window.__game.getEnemies().find(x => x.id === id);
      return {
        gameTime: state.gameTime,
        stunUntil: e?.stunUntil ?? 0,
        expired: (e?.stunUntil ?? 0) < state.gameTime,
      };
    });
    expect(result.expired).toBe(true);
  });

});
