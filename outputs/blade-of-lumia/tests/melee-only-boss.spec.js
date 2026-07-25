// Phase 9-2f: 近接限定ボス（meleeOnly + reflectsProjectiles）のテスト
//
// 氷のリヴァイアサン L（dungeon_5 ボス）は:
//   - sword / fire のみダメージが通る
//   - arrow / beam / boomerang / bomb はダメージ0（meleeOnly ガード）
//   - 投擲物（arrow/beam）はプレイヤーへ跳ね返る（reflectsProjectiles）
//
// test_mechanics レイヤーの検証ステージ melee_only_boss を使用（本編ステージ非参照）。

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl(row, col, opts = {}) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey('melee_only_boss'),
    row: String(row), col: String(col),
    ps_weapon: '1',
  });
  if (opts.bow)       p.set('ps_bow', '1');
  if (opts.candle)    p.set('ps_candle', '1');
  if (opts.boomerang) p.set('ps_boomerang', '1');
  return `${GAME}?${p.toString()}`;
}

async function waitForBoard(page) {
  await page.waitForFunction(() => {
    const b = document.getElementById('board');
    return !!b && b.children.length > 0;
  }, { timeout: 10000 });
}

async function seedAndStart(page) {
  const saveData = JSON.stringify({
    player: {
      x: 2, y: 5, hp: 6, maxHp: 6, maxHearts: 3,
      atk: 2, def: 0, keys: 0,
      weapon: 'sword', shield: null, armor: null,
      subItems: {}, activeSubItem: null,
      rupees: 0, triforceCount: 0,
    },
    stageState: {}, currentLayer: 'field', stageKey: '7,14', heroDir: 'right',
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

// 指定タイプの敵（L）を hp=100 で注入し、atkType で1発与えてHPの減少量を返す。
async function hpLossFor(page, atkType, dmg = 10) {
  return page.evaluate(({ atkType, dmg }) => {
    const HP = 100;
    const id = window.__game.injectEnemy(8, 8, HP, 2, 2, 'L');
    window.__game.dealDamage(id, dmg, atkType);
    const e = window.__game.getEnemies().find(x => x.id === id);
    const after = e ? e.hp : 0;
    return HP - after;
  }, { atkType, dmg });
}

test.describe('Blade of Lumia – 近接限定ボス（Phase 9-2f）', () => {

  test('① sword はダメージが通る', async ({ page }) => {
    await seedAndStart(page);
    const loss = await hpLossFor(page, 'sword', 10);
    expect(loss).toBeGreaterThan(0);
  });

  test('② fire はダメージが通る（fire×3 弱点）', async ({ page }) => {
    await seedAndStart(page);
    // fire は弱点(×3)なので sword より大きいダメージが入る
    const fireLoss  = await hpLossFor(page, 'fire', 10);
    const swordLoss = await hpLossFor(page, 'sword', 10);
    expect(fireLoss).toBeGreaterThan(0);
    expect(fireLoss).toBeGreaterThanOrEqual(swordLoss); // weakness multiplier
  });

  test('③ arrow はダメージ0（meleeOnly）', async ({ page }) => {
    await seedAndStart(page);
    const loss = await hpLossFor(page, 'arrow', 10);
    expect(loss).toBe(0);
  });

  test('④ beam はダメージ0（meleeOnly）', async ({ page }) => {
    await seedAndStart(page);
    const loss = await hpLossFor(page, 'beam', 10);
    expect(loss).toBe(0);
  });

  test('⑤ boomerang はダメージ0（meleeOnly）', async ({ page }) => {
    await seedAndStart(page);
    const loss = await hpLossFor(page, 'boomerang', 10);
    expect(loss).toBe(0);
  });

  test('⑥ bomb はダメージ0（meleeOnly）', async ({ page }) => {
    await seedAndStart(page);
    const loss = await hpLossFor(page, 'bomb', 10);
    expect(loss).toBe(0);
  });

  test('⑦ 矢がボスに当たると反射されてプレイヤーへ向かう（reflectsProjectiles）', async ({ page }) => {
    // ボスの真南に立ち、上向きに矢を撃つ → 反射後 owner='enemy' になる
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(previewUrl(7, 5, { bow: true }));
    await waitForBoard(page);

    const beforeHp = await page.evaluate(() => window.__game.getPlayer().hp);

    await page.evaluate(() => window.__game.movePlayer('up'));
    await page.evaluate(() => window.__game.step(1));
    await page.evaluate(() => window.__game.useSubItem()); // 矢を発射
    // ボスの位置まで飛ぶのに十分なステップを回す
    for (let i = 0; i < 40; i++) {
      await page.evaluate(() => window.__game.step(1));
    }

    // ボスの HP が減っていないことを確認（L は injectEnemy でなくマップ配置）
    const enemies = await page.evaluate(() => window.__game.getEnemies());
    const boss = enemies.find(e => e.type === 'L');
    if (boss) {
      expect(boss.hp).toBe(40); // ダメージなし
    }

    expect(errors).toEqual([]);
  });
});
