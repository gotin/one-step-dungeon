// tests/ammo-capacity.spec.js – 弾数上限・容量拡充アイテム（Phase 9-5a）

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

function seed(page, overrides = {}) {
  const player = {
    x: 1, y: 1,
    hp: 6, maxHp: 6, maxHearts: 3,
    atk: 2, def: 0, keys: 0,
    weapon: null, shield: null, armor: null,
    subItems: {},
    activeSubItem: null,
    rupees: 0, triforceCount: 0,
    maxArrows: 8, maxBombs: 8,
    hasWingRobe: false, flying: false, hasLadder: false,
    defeatedBosses: [],
    swordTier: -1, armorTier: -1, shieldTier: -1,
    gachaPulls: {},
    ...overrides,
  };
  const saveData = JSON.stringify({
    player,
    stageState: {},
    currentLayer: 'field',
    stageKey: '7,14',
    heroDir: 'down',
  });
  return page.addInitScript(({ key, value }) => {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
  }, { key: SAVE_KEY, value: saveData });
}

async function boot(page) {
  await page.goto(GAME_URL);
  await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#btn-continue').click();
  await page.waitForFunction(() => {
    const b = document.getElementById('board');
    return !!b && b.children.length > 0;
  });
}

test.describe('Phase 9-5a – 弾数上限と容量拡充アイテム', () => {

  test('初期 maxBombs=8 / maxArrows=8 がプレイヤーに設定される', async ({ page }) => {
    await seed(page);
    await boot(page);
    const result = await page.evaluate(() => {
      const p = window.__game.getState().player;
      return { maxBombs: p.maxBombs, maxArrows: p.maxArrows };
    });
    expect(result.maxBombs).toBe(8);
    expect(result.maxArrows).toBe(8);
  });

  test('旧セーブ（maxBombs/maxArrows 未設定）ロード後は 8 に補完される', async ({ page }) => {
    const saveData = JSON.stringify({
      player: {
        x: 1, y: 1,
        hp: 6, maxHp: 6, maxHearts: 3,
        atk: 2, def: 0, keys: 0,
        weapon: null, shield: null, armor: null,
        subItems: {},
        activeSubItem: null,
        rupees: 0, triforceCount: 0,
        // maxArrows / maxBombs を意図的に省略（旧セーブ想定）
        hasWingRobe: false, flying: false, hasLadder: false,
        defeatedBosses: [],
        swordTier: -1, armorTier: -1, shieldTier: -1,
        gachaPulls: {},
      },
      stageState: {},
      currentLayer: 'field',
      stageKey: '7,14',
      heroDir: 'down',
    });
    await page.addInitScript(({ key, value }) => {
      try { localStorage.setItem(key, value); } catch { /* noop */ }
    }, { key: SAVE_KEY, value: saveData });
    await boot(page);
    const result = await page.evaluate(() => {
      const p = window.__game.getState().player;
      return { maxBombs: p.maxBombs, maxArrows: p.maxArrows };
    });
    expect(result.maxBombs).toBe(8);
    expect(result.maxArrows).toBe(8);
  });

  test('quiver を取得すると maxArrows が 8 → 16 になる', async ({ page }) => {
    await seed(page);
    await boot(page);
    const result = await page.evaluate(() => {
      const before = window.__game.getState().player.maxArrows;
      window.__game.giveSubItem('quiver');
      const after = window.__game.getState().player.maxArrows;
      return { before, after };
    });
    expect(result.before).toBe(8);
    expect(result.after).toBe(16);
  });

  test('bombBag を取得すると maxBombs が 8 → 16 になる', async ({ page }) => {
    await seed(page);
    await boot(page);
    const result = await page.evaluate(() => {
      const before = window.__game.getState().player.maxBombs;
      window.__game.giveSubItem('bombBag');
      const after = window.__game.getState().player.maxBombs;
      return { before, after };
    });
    expect(result.before).toBe(8);
    expect(result.after).toBe(16);
  });

  test('quiver × 3 で maxArrows は 32 になる', async ({ page }) => {
    await seed(page);
    await boot(page);
    const result = await page.evaluate(() => {
      window.__game.giveSubItem('quiver');
      window.__game.giveSubItem('quiver');
      window.__game.giveSubItem('quiver');
      return window.__game.getState().player.maxArrows;
    });
    expect(result).toBe(32);
  });

  test('爆弾は maxBombs(8) でクランプされ上限を超えない', async ({ page }) => {
    // 爆弾を 7 個持った状態で giveSubItem('bomb') を 3 回 → クランプで 8 で止まる
    await seed(page, { subItems: { bomb: { count: 7 } }, activeSubItem: 'bomb' });
    await boot(page);
    const result = await page.evaluate(() => {
      window.__game.giveSubItem('bomb');  // 7+1=8 → clamp to 8
      window.__game.giveSubItem('bomb');  // 8+1=9 → clamp to 8
      window.__game.giveSubItem('bomb');  // clamp to 8
      return window.__game.getPlayer().subItems.bomb?.count;
    });
    expect(result).toBe(8);
  });

  test('bombBag 取得後は上限 16 まで爆弾を持てる', async ({ page }) => {
    await seed(page, { subItems: { bomb: { count: 8 } }, activeSubItem: 'bomb', maxBombs: 8 });
    await boot(page);
    const result = await page.evaluate(() => {
      window.__game.giveSubItem('bombBag');  // maxBombs: 8 → 16
      window.__game.giveSubItem('bomb');     // 8+1=9 ≤ 16 → 9
      window.__game.giveSubItem('bomb');     // 10
      window.__game.giveSubItem('bomb');     // 11
      return {
        count: window.__game.getPlayer().subItems.bomb?.count,
        max: window.__game.getState().player.maxBombs,
      };
    });
    expect(result.max).toBe(16);
    expect(result.count).toBe(11);
  });

  test('矢は maxArrows(8) でクランプされ上限を超えない', async ({ page }) => {
    await seed(page, { subItems: { bow: { count: 7 } }, activeSubItem: 'bow' });
    await boot(page);
    const result = await page.evaluate(() => {
      window.__game.giveSubItem('bow');  // 7+1=8 → clamp to 8
      window.__game.giveSubItem('bow');  // 8+1=9 → clamp to 8
      return window.__game.getPlayer().subItems.bow?.count;
    });
    expect(result).toBe(8);
  });

  test('ロード後も maxBombs/maxArrows がセーブから復元される', async ({ page }) => {
    await seed(page, { maxBombs: 24, maxArrows: 16 });
    await boot(page);
    const result = await page.evaluate(() => {
      const p = window.__game.getState().player;
      return { maxBombs: p.maxBombs, maxArrows: p.maxArrows };
    });
    expect(result.maxBombs).toBe(24);
    expect(result.maxArrows).toBe(16);
  });

});
