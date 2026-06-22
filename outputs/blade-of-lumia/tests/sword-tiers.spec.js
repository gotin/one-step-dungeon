// tests/sword-tiers.spec.js – 剣ティアシステムテスト（Phase 7-1）
//
// 検証内容：
//   ①: 下位剣を拾っても ATK は下がらない（ティア比較で弾く）
//   ②: 木の剣（tier=0, beam:false）ではビームが出ない
//   ③: 銅の剣（tier=1, pierce:false）は満タンチャージでも貫通しない
//   ④: 聖剣（tier=3, pierce:true）は満タンチャージで貫通する
//   ⑤: HUD 上の剣名・ATK 値がティアどおりに更新される

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

// 剣あり状態でセーブをロードし、ゲームボードが描画されるまで待つ
async function seedWithSword(page, swordTier) {
  const atk = 2 + [2, 4, 7, 12][swordTier];
  const saveData = JSON.stringify({
    player: {
      x: 2, y: 5,
      hp: 6, maxHp: 6, maxHearts: 3,
      atk, def: 0, keys: 0,
      weapon: 'sword',
      swordTier,
      shield: null, armor: null,
      subItems: {}, activeSubItem: null,
      rupees: 0, triforceCount: 0,
      _equip: { swordName: ['木の剣','銅の剣','銀の剣','聖剣'][swordTier], swordBonus: [2,4,7,12][swordTier] },
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

// 剣なし状態でスタート
async function seedNoSword(page) {
  const saveData = JSON.stringify({
    player: {
      x: 2, y: 5,
      hp: 6, maxHp: 6, maxHearts: 3,
      atk: 2, def: 0, keys: 0,
      weapon: null,
      swordTier: -1,
      shield: null, armor: null,
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

test.describe('Blade of Lumia – 剣ティアシステム', () => {

  test('①: 銀の剣保持中に木の剣を拾っても ATK は下がらない', async ({ page }) => {
    // 銀の剣（tier=2, atk=7）でスタート
    await seedWithSword(page, 2);
    const atkBefore = await page.evaluate(() => window.__game.getPlayer().atk);

    // ゲームの equipSwordTier を直接呼び出して木の剣（tier=0）を拾う試み
    const result = await page.evaluate(() => window.__game.equipSwordTier(0));

    const atkAfter = await page.evaluate(() => window.__game.getPlayer().atk);
    // 下位ティアなので弾かれる（false を返す）
    expect(result).toBe(false);
    // ATK は変わらない
    expect(atkAfter).toBe(atkBefore);
  });

  test('①b: 無剣状態から木の剣を拾うと ATK が BASE_ATK+tier.atk になる', async ({ page }) => {
    await seedNoSword(page);
    const result = await page.evaluate(() => window.__game.equipSwordTier(0));
    expect(result).toBe(true);
    const player = await page.evaluate(() => window.__game.getPlayer());
    // BASE_ATK=2, wood.atk=2 → atk=4
    expect(player.atk).toBe(4);
    expect(player.swordTier).toBe(0);
  });

  test('②: 木の剣（tier=0）ではチャージしてもビームが出ない', async ({ page }) => {
    await seedWithSword(page, 0);  // 木の剣

    await page.evaluate(() => window.__game.startCharge());
    await page.evaluate(() => window.__game.step(6));  // 満タン
    await page.evaluate(() => window.__game.releaseCharge());

    const beams = await page.evaluate(() =>
      window.__game.getProjectiles().filter(p => p.type === 'beam'));
    expect(beams.length).toBe(0);
  });

  test('③: 銅の剣（tier=1）は満タンチャージでも貫通しない（1体目で止まる）', async ({ page }) => {
    await seedWithSword(page, 1);  // 銅の剣

    // 右に hp=1 の敵を2体配置
    const id1 = await page.evaluate(() => window.__game.injectEnemy(4, 5, 1));
    const id2 = await page.evaluate(() => window.__game.injectEnemy(6, 5, 1));

    await page.evaluate(() => window.__game.startCharge());
    await page.evaluate(() => window.__game.step(6));  // 満タン
    await page.evaluate(() => window.__game.releaseCharge());
    await page.evaluate(() => window.__game.step(10));

    const e1 = await page.evaluate((id) => window.__game.getEnemies().find(e => e.id === id) ?? null, id1);
    const e2 = await page.evaluate((id) => window.__game.getEnemies().find(e => e.id === id) ?? null, id2);
    // 1体目は倒れる
    expect(e1, '手前の敵が倒れていない').toBeNull();
    // 2体目は残る（貫通しないため）
    expect(e2, '銅剣で貫通してしまった').not.toBeNull();
  });

  test('④: 聖剣（tier=3）は満タンチャージで2体貫通する', async ({ page }) => {
    await seedWithSword(page, 3);  // 聖剣

    const id1 = await page.evaluate(() => window.__game.injectEnemy(4, 5, 1));
    const id2 = await page.evaluate(() => window.__game.injectEnemy(6, 5, 1));

    await page.evaluate(() => window.__game.startCharge());
    await page.evaluate(() => window.__game.step(6));  // 満タン
    await page.evaluate(() => window.__game.releaseCharge());
    await page.evaluate(() => window.__game.step(10));

    const e1 = await page.evaluate((id) => window.__game.getEnemies().find(e => e.id === id) ?? null, id1);
    const e2 = await page.evaluate((id) => window.__game.getEnemies().find(e => e.id === id) ?? null, id2);
    expect(e1, '手前の敵が倒れていない').toBeNull();
    expect(e2, '奥の敵が倒れていない（貫通していない）').toBeNull();
  });

  test('⑤: HUD の剣名・ATK がティアどおりに表示される', async ({ page }) => {
    await seedNoSword(page);

    // 銀の剣（tier=2）を装備
    await page.evaluate(() => window.__game.equipSwordTier(2));
    await page.evaluate(() => window.__game.updateHud());

    const player = await page.evaluate(() => window.__game.getPlayer());
    // BASE_ATK=2, silver.atk=7 → atk=9
    expect(player.atk).toBe(9);
    expect(player.swordTier).toBe(2);
    expect(player._equip.swordName).toBe('銀の剣');
    expect(player._equip.swordBonus).toBe(7);
  });

});
