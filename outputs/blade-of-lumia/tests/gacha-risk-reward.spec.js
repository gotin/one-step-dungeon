// tests/gacha-risk-reward.spec.js – Phase 7-4 リスク・リワードシステムテスト
//
// 検証内容：
//   ①: grantReward 切り出し後もチェスト付与（rupee）が従来通り
//   ⑥: 強敵部屋の封印宝箱は killAll 前は開かず、全滅後に開く
//
// ❌ 失効（2026-09-30・キュー36）：旧 ②〜⑤（ルピー不足・random 固定・天井・カウンタ保持）は
//    削除した＝テストの中に抽選の式を書き直していて `shopBuy` を一度も通らず、店を壊しても
//    赤くならなかった（キーも旧位置の `field:2,0:6,9` のまま）。くじは実際の店を開いて引く
//    `tests/gacha-once.spec.js` が見張る。

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

// 標準的なプレイヤーセーブを注入してゲーム開始
async function seed(page, extra = {}) {
  const player = {
    x: 5, y: 5,
    hp: 6, maxHp: 6, maxHearts: 3,
    atk: 2, def: 0, keys: 0,
    weapon: null, shield: null, armor: null,
    swordTier: -1, armorTier: -1, shieldTier: -1,
    subItems: {}, activeSubItem: null,
    rupees: 100, triforceCount: 0,
    hasWingRobe: false, flying: false, hasLadder: false,
    defeatedBosses: [],
    gachaPulls: {},
    ...extra,
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

test.describe('Blade of Lumia – ガチャ・リスク・リワード（Phase 7-4）', () => {

  test('①: grantReward でルピーが付与される（チェスト付与回帰）', async ({ page }) => {
    await seed(page, { rupees: 0 });
    const msg = await page.evaluate(() =>
      window.__game.grantReward({ type: 'rupee', value: 25 })
    );
    const player = await page.evaluate(() => window.__game.getPlayer());
    expect(player.rupees).toBe(25);
    expect(msg).toContain('25');
  });

  test('①b: grantReward でハートの器が付与される', async ({ page }) => {
    await seed(page);
    const before = await page.evaluate(() => window.__game.getPlayer().maxHearts);
    await page.evaluate(() => window.__game.grantReward({ type: 'heartContainer' }));
    const after = await page.evaluate(() => window.__game.getPlayer().maxHearts);
    expect(after).toBe(before + 1);
  });

  test('⑥: dungeon_1/3,0 の封印宝箱に killAll 条件が設定されている（データレベル確認）', async ({ page }) => {
    // データファイルを fetch して dungeon_1/3,0 の showConditions を確認
    await page.goto('/blade-of-lumia/game/');
    await page.waitForFunction(() => {
      const b = document.getElementById('board');
      return !!b && b.children.length > 0;
    });
    const result = await page.evaluate(async () => {
      const res = await fetch('/blade-of-lumia/work/blade-of-lumia.json');
      const data = await res.json();
      const stage = data?.layers?.dungeon_1?.stages?.['3,0'];
      return {
        showCondition: stage?.showConditions?.['3,10'] ?? null,
        chestContent:  stage?.chestContents?.['3,10'] ?? null,
        tileAt3_8: stage?.tiles?.[3]?.[8] ?? null,   // 強敵タイル
        tileAt3_10: stage?.tiles?.[3]?.[10] ?? null,  // 宝箱タイル
      };
    });
    expect(result.showCondition?.trigger).toBe('killAll');
    expect(result.chestContent?.type).toBe('armor');
    expect(result.tileAt3_8).toBe('W');   // MONSTER
    expect(result.tileAt3_10).toBe('B');  // 宝箱
  });

});
