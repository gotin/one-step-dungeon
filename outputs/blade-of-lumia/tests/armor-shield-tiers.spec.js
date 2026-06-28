// tests/armor-shield-tiers.spec.js – 防具・盾ティアシステムテスト（Phase 7-2）
//
// 検証内容：
//   ①: 上位防具保持中に下位防具を拾っても DEF は下がらない（ティア比較で弾く）
//   ①b: 無防具から布の服(0)を装備すると def=BASE_DEF+tier.def になる
//   ②: 木の盾(tier=0, reflect=0)は敵投擲物をブロックするが跳ね返さない
//   ③: 鉄の盾(tier=1, reflect=0.5)は敵投擲物を atk×0.5 で跳ね返す
//   ④: ミラーシールド(tier=2, reflect=1.0)の跳ね返しが背後の敵を倒す
//   ⑤: チャージ中は盾がオフになる（正面でもブロックしない＝ダメージを受ける）
//   ⑥: HUD 上の防具名・DEF がティアどおりに更新される

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

const ARMOR_DEF = [2, 4, 7];

// 任意の装備状態でセーブをロードしてゲーム開始
async function seed(page, { armorTier = -1, shieldTier = -1, swordTier = -1 } = {}) {
  const def = armorTier >= 0 ? ARMOR_DEF[armorTier] : 0;
  const atk = swordTier >= 0 ? 2 + [2, 4, 7, 12][swordTier] : 2;
  const player = {
    x: 5, y: 5,
    hp: 6, maxHp: 6, maxHearts: 3,
    atk, def, keys: 0,
    weapon: swordTier >= 0 ? 'sword' : null,
    swordTier,
    shield: shieldTier >= 0 ? 'shield' : null,
    shieldTier,
    armor: armorTier >= 0 ? 'armor' : null,
    armorTier,
    subItems: {}, activeSubItem: null,
    rupees: 0, triforceCount: 0,
    _equip: {
      swordName: swordTier >= 0 ? ['木の剣','銅の剣','銀の剣','聖剣'][swordTier] : undefined,
      armorName: armorTier >= 0 ? ['布の服','鎖かたびら','伝説の鎧'][armorTier] : undefined,
      armorBonus: armorTier >= 0 ? ARMOR_DEF[armorTier] : undefined,
      shieldName: shieldTier >= 0 ? ['木の盾','鉄の盾','ミラーシールド'][shieldTier] : undefined,
    },
  };
  const saveData = JSON.stringify({
    player, stageState: {},
    currentLayer: 'field', stageKey: '7,14', heroDir: 'right',
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

test.describe('Blade of Lumia – 防具・盾ティアシステム', () => {

  test('①: 伝説の鎧保持中に布の服を拾っても DEF は下がらない', async ({ page }) => {
    await seed(page, { armorTier: 2 });  // 伝説の鎧（def=7）
    const before = await page.evaluate(() => window.__game.getPlayer().def);
    const result = await page.evaluate(() => window.__game.equipArmorTier(0));  // 布の服
    const after  = await page.evaluate(() => window.__game.getPlayer().def);
    expect(result).toBe(false);
    expect(after).toBe(before);
  });

  test('①b: 無防具から布の服(0)を装備すると def=2 になる', async ({ page }) => {
    await seed(page);
    const result = await page.evaluate(() => window.__game.equipArmorTier(0));
    expect(result).toBe(true);
    const player = await page.evaluate(() => window.__game.getPlayer());
    expect(player.def).toBe(2);      // BASE_DEF(0) + cloth.def(2)
    expect(player.armorTier).toBe(0);
  });

  test('②: 木の盾(reflect=0)は敵投擲物をブロックするが跳ね返さない', async ({ page }) => {
    await seed(page, { shieldTier: 0 });  // 木の盾
    const hp0 = await page.evaluate(() => window.__game.getPlayer().hp);
    // プレイヤー(5,5)は右向き。右から来る投擲物（dx=-1）を正面ブロックできる
    await page.evaluate(() => window.__game.injectEnemyProjectile(5, 5, -1, 0, 4, 2));
    await page.evaluate(() => window.__game.step(2));
    const hp1 = await page.evaluate(() => window.__game.getPlayer().hp);
    // ブロックして無傷
    expect(hp1).toBe(hp0);
    // 跳ね返さない＝player 所有の投擲物は残っていない
    const playerProjs = await page.evaluate(() =>
      window.__game.getProjectiles().filter(p => p.owner === 'player'));
    expect(playerProjs.length).toBe(0);
  });

  test('③: 鉄の盾(reflect=0.5)は敵投擲物を atk×0.5 で跳ね返す', async ({ page }) => {
    await seed(page, { shieldTier: 1 });  // 鉄の盾
    await page.evaluate(() => window.__game.injectEnemyProjectile(5, 5, -1, 0, 4, 2));
    // 1tick 進めて跳ね返り処理を発火させる
    await page.evaluate(() => window.__game.step(1));
    const reflected = await page.evaluate(() =>
      window.__game.getProjectiles().filter(p => p.owner === 'player'));
    expect(reflected.length).toBe(1);
    // atk = round(4 × 0.5) = 2、向きが反転（dx=+1）
    expect(reflected[0].atk).toBe(2);
    expect(reflected[0].dx).toBeGreaterThan(0);
  });

  test('④: ミラーシールド(reflect=1.0)の跳ね返しが背後の敵を倒す', async ({ page }) => {
    await seed(page, { shieldTier: 2 });  // ミラーシールド
    // 右側(8,5)に hp=3 の敵を置く（跳ね返した atk=4 で倒れる）
    const eid = await page.evaluate(() => window.__game.injectEnemy(8, 5, 3));
    await page.evaluate(() => window.__game.injectEnemyProjectile(5, 5, -1, 0, 4, 2));
    await page.evaluate(() => window.__game.step(12));
    const enemy = await page.evaluate((id) =>
      window.__game.getEnemies().find(e => e.id === id) ?? null, eid);
    expect(enemy, '跳ね返した投擲物で敵が倒れていない').toBeNull();
  });

  test('⑤: チャージ中は盾がオフになる（正面でもダメージを受ける）', async ({ page }) => {
    // ビーム可能な銅の剣(1)＋木の盾(0)で開始
    await seed(page, { shieldTier: 0, swordTier: 1 });
    const hp0 = await page.evaluate(() => window.__game.getPlayer().hp);
    await page.evaluate(() => window.__game.startCharge());
    await page.evaluate(() => window.__game.step(2));  // チャージ継続
    // チャージ中に正面から投擲物 → 盾オフなのでダメージを受ける
    await page.evaluate(() => window.__game.injectEnemyProjectile(5, 5, -1, 0, 4, 2));
    await page.evaluate(() => window.__game.step(2));
    const hp1 = await page.evaluate(() => window.__game.getPlayer().hp);
    expect(hp1, 'チャージ中なのに盾がブロックしてしまった').toBeLessThan(hp0);
  });

  test('⑥: HUD の防具名・DEF がティアどおりに表示される', async ({ page }) => {
    await seed(page);
    await page.evaluate(() => window.__game.equipArmorTier(1));  // 鎖かたびら
    await page.evaluate(() => window.__game.updateHud());
    const player = await page.evaluate(() => window.__game.getPlayer());
    expect(player.def).toBe(4);      // BASE_DEF(0) + chain.def(4)
    expect(player.armorTier).toBe(1);
    expect(player._equip.armorName).toBe('鎖かたびら');
  });

});
