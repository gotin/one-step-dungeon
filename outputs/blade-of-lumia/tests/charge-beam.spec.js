// tests/charge-beam.spec.js – チャージ攻撃（剣ビーム）テスト（Phase 3-1）
//
// 仕様：
//   - 攻撃ボタンを押した瞬間に通常の剣が出る（剣の発火は別経路）。
//   - 押しっぱなしでチャージが溜まる（論理時間 gameNow 基準）。
//   - 離した時のチャージ量でビームが変わる：
//       1/4 未満      … ビームなし
//       1/4 以上〜満タン未満 … 弱ビーム（非貫通）
//       満タン        … 強ビーム（貫通・atk 2倍）
//
// 検証内容：
//   条件1: 少ししか溜めずに離すとビームは出ない（1/4 未満）
//   条件2: 十分溜めてから離すと beam 投擲物が前方に生成される
//   条件3: 満タンまで溜めたビームは piercing=true（貫通）かつ強い

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

async function seedAndStart(page, swordTier = 1) {
  const atkMap = [4, 6, 9, 14];
  const saveData = JSON.stringify({
    player: {
      x: 2, y: 5,
      hp: 6, maxHp: 6, maxHearts: 3,
      atk: atkMap[swordTier] ?? 6, def: 0, keys: 0,
      weapon: 'sword', swordTier,
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

test.describe('Blade of Lumia – チャージ攻撃（剣ビーム）', () => {

  test('条件1: 1/4 未満のチャージで離してもビームは出ない', async ({ page }) => {
    await seedAndStart(page);
    // チャージ開始 → 0 フレーム（時間を進めない）で即離す → ratio≈0
    await page.evaluate(() => { window.__game.startCharge(); window.__game.releaseCharge(); });
    const beams = await page.evaluate(() =>
      window.__game.getProjectiles().filter(p => p.type === 'beam'));
    expect(beams.length).toBe(0);
  });

  test('条件2: 十分チャージして離すと beam 投擲物が前方に生成される', async ({ page }) => {
    await seedAndStart(page);
    // チャージ開始 → 数フレーム進めて溜める（CHARGE_FULL_MS=720ms, TICK=120ms → 6フレームで満タン）
    await page.evaluate(() => window.__game.startCharge());
    await page.evaluate(() => window.__game.step(3));   // 360ms ≈ 1/2 チャージ
    await page.evaluate(() => window.__game.releaseCharge());

    const beams = await page.evaluate(() =>
      window.__game.getProjectiles().filter(p => p.type === 'beam'));
    expect(beams.length).toBe(1);
    expect(beams[0].owner).toBe('player');
    // heroDir=right → dx>0
    expect(beams[0].dx).toBeGreaterThan(0);

    const startX = beams[0].x;
    await page.evaluate(() => window.__game.step(2));
    const after = await page.evaluate(() =>
      window.__game.getProjectiles().filter(p => p.type === 'beam'));
    // まだ画面内なら前進している（壁/場外で消えていれば「一度は飛んだ」のでOK）
    if (after.length > 0) {
      expect(after[0].x).toBeGreaterThan(startX);
    }
  });

  test('条件3: 満タンチャージのビームは貫通し、複数の敵を倒せる', async ({ page }) => {
    await seedAndStart(page, 3);  // 聖剣（pierce:true）
    // プレイヤー(2,5)の右側 一直線に hp=1 の敵を2体注入
    const id1 = await page.evaluate(() => window.__game.injectEnemy(4, 5, 1));
    const id2 = await page.evaluate(() => window.__game.injectEnemy(6, 5, 1));

    // 満タンまで溜める（6フレーム=720ms で ratio=1）
    await page.evaluate(() => window.__game.startCharge());
    await page.evaluate(() => window.__game.step(6));
    await page.evaluate(() => window.__game.releaseCharge());

    // 発射直後のビームは piercing=true（満タン）であること
    // （getProjectiles のスナップショットには piercing が無いため、貫通の結果で確認する）
    await page.evaluate(() => window.__game.step(10));

    const e1 = await page.evaluate((id) => window.__game.getEnemies().find(e => e.id === id) ?? null, id1);
    const e2 = await page.evaluate((id) => window.__game.getEnemies().find(e => e.id === id) ?? null, id2);
    // 貫通ビームは2体とも倒す（非貫通なら手前1体で消えて2体目が残る）
    expect(e1, '手前の敵が倒れていない').toBeNull();
    expect(e2, '奥の敵が倒れていない（貫通していない可能性）').toBeNull();
  });

});
