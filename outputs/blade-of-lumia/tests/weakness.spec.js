// tests/weakness.spec.js – ボスの弱点属性（Phase 3-3）
//
// ENEMY_META[type].weakness = { type, multiplier } により、
// 弱点の攻撃種別なら multiplier 倍ダメージが入ることを検証する。
//   - 炎のサラマンドラ(A) は arrow が弱点（×2）
//   - 岩のゴーレム(G) は bomb が弱点（×3）
//   - 弱点でない攻撃種別は等倍（従来挙動）
//   - 弱点未定義の敵（ダミー 'E'）は atkType を渡しても等倍

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
    stageKey: '1,0',
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

// 指定タイプの敵を hp=200 で注入し、dmg を atkType で1発与えて減ったHPを返す。
async function hpLossFor(page, type, dmg, atkType) {
  return page.evaluate(({ type, dmg, atkType }) => {
    const HP = 200;
    const id = window.__game.injectEnemy(8, 8, HP, 2, 2, type);
    window.__game.dealDamage(id, dmg, atkType);
    const e = window.__game.getEnemies().find(x => x.id === id);
    const after = e ? e.hp : 0;
    return HP - after;
  }, { type, dmg, atkType });
}

test.describe('Blade of Lumia – ボスの弱点属性（Phase 3-3）', () => {

  test('炎のサラマンドラ(A) は arrow で剣の2倍ダメージを受ける', async ({ page }) => {
    await seedAndStart(page);
    // 注入敵は def=0。dmg=10 → sword: 10 / arrow(×2): 20
    const swordLoss = await hpLossFor(page, 'A', 10, 'sword');
    const arrowLoss = await hpLossFor(page, 'A', 10, 'arrow');
    expect(swordLoss).toBe(10);
    expect(arrowLoss).toBe(20);
    expect(arrowLoss).toBeGreaterThan(swordLoss);
  });

  test('岩のゴーレム(G) は bomb で大ダメージ（×3）を受ける', async ({ page }) => {
    await seedAndStart(page);
    // 注入敵は def=0。dmg=10 → sword: 10 / bomb(×3): 30
    const swordLoss = await hpLossFor(page, 'G', 10, 'sword');
    const bombLoss  = await hpLossFor(page, 'G', 10, 'bomb');
    expect(swordLoss).toBe(10);
    expect(bombLoss).toBe(30);
  });

  test('弱点でない攻撃種別は等倍（炎ボスに bomb は弱点ではない）', async ({ page }) => {
    await seedAndStart(page);
    // 炎ボスの弱点は arrow。bomb は等倍 → sword と同じ
    const swordLoss = await hpLossFor(page, 'A', 10, 'sword');
    const bombLoss  = await hpLossFor(page, 'A', 10, 'bomb');
    expect(bombLoss).toBe(swordLoss);
  });

  test('弱点未定義の敵（ダミーE）は atkType を渡しても等倍', async ({ page }) => {
    await seedAndStart(page);
    // ダミー敵 'E' は ENEMY_META になく weakness なし・def=0
    const a = await hpLossFor(page, 'E', 10, 'arrow');
    const b = await hpLossFor(page, 'E', 10, 'bomb');
    const c = await hpLossFor(page, 'E', 10, undefined);
    expect(a).toBe(10);
    expect(b).toBe(10);
    expect(c).toBe(10);
  });

});
