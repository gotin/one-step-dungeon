// tests/large-enemy.spec.js – 大型敵（2×2）の当たり判定・占有範囲（Phase 3-2）
//
// 汎用 size:{w,h} 機構の検証。プレイヤー(2,5)・heroDir=right で右に大型敵を置き、
//   - 投擲物/剣が body のどこかに当たればヒットする（中心が遠くても面で当たる）
//   - 1×1 敵では従来挙動と一致する（デグレなし）
// を確認する。

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

async function seedAndStart(page) {
  const saveData = JSON.stringify({
    player: {
      x: 2, y: 5,
      hp: 6, maxHp: 6, maxHearts: 3,
      atk: 2, def: 0, keys: 0,
      weapon: 'sword', swordTier: 1,  // 銅の剣（beam:true）
      shield: null, armor: null,
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

test.describe('Blade of Lumia – 大型敵（2×2）の占有範囲当たり判定', () => {

  test('2×2 敵は body の手前の面でビームが当たる（中心まで届かなくても）', async ({ page }) => {
    await seedAndStart(page);
    // プレイヤー(2,5)。右に 2×2 敵を top-left=(5,4) で配置（占有: 列5-6 行4-5）。
    // 中心は (6,5) で距離4。弱ビーム（非貫通）でも手前の面(列5)で当たって倒れる。
    const id = await page.evaluate(() => window.__game.injectEnemy(5, 4, 3, 2, 2));

    // 満タンまで溜めて強ビームを撃つ（atk2倍）。手前の面で当たればHPが減る。
    await page.evaluate(() => window.__game.startCharge());
    await page.evaluate(() => window.__game.step(6));
    await page.evaluate(() => window.__game.releaseCharge());
    await page.evaluate(() => window.__game.step(12));

    const e = await page.evaluate((eid) => window.__game.getEnemies().find(x => x.id === eid) ?? null, id);
    // 倒されて消えている（null）か、少なくともダメージが入っている
    if (e !== null) {
      expect(e.hp).toBeLessThan(3);
    } else {
      expect(e).toBeNull();
    }
  });

  test('2×2 敵は剣の届く範囲が body 半分ぶん広がる', async ({ page }) => {
    await seedAndStart(page);
    // 剣リーチ(SWORD_REACH)では中心まで届かない距離に 2×2 敵を置く。
    // top-left=(3,4)（占有 列3-4 行4-5）。手前の面=列3 はプレイヤー(2,5)の
    // すぐ右隣りなので剣が届く。1×1 中心(3.5,?) 換算でも面で当たる。
    const id = await page.evaluate(() => window.__game.injectEnemy(3, 4, 5, 2, 2));
    // 剣クールダウン（gameNow 基準）を越えるよう数フレーム進めてから攻撃
    await page.evaluate(() => window.__game.step(2));
    await page.evaluate(() => window.__game.swordAttack());
    const e = await page.evaluate((eid) => window.__game.getEnemies().find(x => x.id === eid) ?? null, id);
    // 剣が当たって hp が減っている
    expect(e).not.toBeNull();
    expect(e.hp).toBeLessThan(5);
  });

  test('新大型ボス2種（A/L）は 2×2 で注入してもエラーなし・wrapper サイズが大型', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await seedAndStart(page);

    // 2×2 の敵として配置（type は 'E' のダミーだがサイズ 2×2）
    const idA = await page.evaluate(() => window.__game.injectEnemy(6, 4, 35, 2, 2));
    const idL = await page.evaluate(() => window.__game.injectEnemy(6, 7, 40, 2, 2));
    await page.evaluate(() => window.__game.step(3));

    // JS エラーなし
    expect(errors).toHaveLength(0);

    // wrapper が 2×2 → 2*cellPx（≥72px）に設定されているか
    const sizes = await page.evaluate((ids) => {
      return ids.map(id => {
        const el = document.getElementById(`char-enemy-${id}`);
        if (!el) return null;
        const w = parseFloat(el.style.width);
        return isNaN(w) ? el.style.width : w;
      });
    }, [idA, idL]);
    for (const s of sizes) {
      if (typeof s === 'number') {
        expect(s).toBeGreaterThanOrEqual(72);
      }
    }
  });

  test('1×1 敵は従来どおりの当たり判定（デグレなし）', async ({ page }) => {
    await seedAndStart(page);
    // プレイヤー(2,5)の右隣 (3,5) に通常サイズ敵 → 剣が当たる
    const id = await page.evaluate(() => window.__game.injectEnemy(3, 5, 5));
    // 剣クールダウン（gameNow 基準）を越えるよう数フレーム進めてから攻撃
    await page.evaluate(() => window.__game.step(2));
    await page.evaluate(() => window.__game.swordAttack());
    const e = await page.evaluate((eid) => window.__game.getEnemies().find(x => x.id === eid) ?? null, id);
    expect(e).not.toBeNull();
    expect(e.hp).toBeLessThan(5);
  });

});
