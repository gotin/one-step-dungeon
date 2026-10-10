// tests/enemy-drop.spec.js – 雑魚ドロップ（Phase 9-5c）
//
// killEnemy（非ボス）に 35% 確率でフロアドロップが出現する。
// プレイヤーが踏むと拾える。5秒で消滅。ステージ遷移で消える。
// - 矢/爆弾は所持数が少ないほど高確率で出る
// - 満タン時は矢/爆弾はドロップしない
// - 拾ったドロップが max を超えない

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

function makeSave(overrides = {}) {
  const player = {
    x: 5, y: 5,
    hp: 6, maxHp: 6, maxHearts: 3,
    atk: 10, def: 0, keys: 0,
    weapon: 'sword', shield: null, armor: null,
    subItems: {
      bomb: { count: 0 },
      bow:  { count: 0 },
    },
    activeSubItem: null,
    rupees: 0, triforceCount: 0,
    maxArrows: 8, maxBombs: 8,
    hasWingRobe: false, flying: false, hasLadder: false,
    defeatedBosses: [],
    swordTier: -1, armorTier: -1, shieldTier: -1,
    gachaPulls: {},
    ...overrides,
  };
  return JSON.stringify({
    player,
    stageState: {},
    currentLayer: 'field',
    stageKey: '7,14',
    heroDir: 'down',
  });
}

async function boot(page, saveData) {
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

test.describe('Phase 9-5c – 雑魚ドロップ（フロアドロップ方式）', () => {

  test('所持0の状態で雑魚を多数倒すと矢か爆弾のフロアドロップが出現する', async ({ page }) => {
    // 35% × 弾weight(8/total≈0.5) ≈ 17%/回。50回で1回も出ない確率 ≈ 0.01% → 事実上確実
    await boot(page, makeSave());
    const found = await page.evaluate(async () => {
      for (let i = 0; i < 50; i++) {
        const id = window.__game.injectEnemy(8, 3, 1);
        window.__game.dealDamage(id, 1, 'sword');
        const drops = window.__game.getFloorDrops();
        if (drops.some(d => d.type === 'bomb' || d.type === 'arrow')) return true;
      }
      return false;
    });
    expect(found).toBe(true);
  });

  test('フロアドロップを踏むと弾が増える', async ({ page }) => {
    // 敵を倒してドロップが出たら、その座標に pickupFloorDrop を呼んで拾う
    await boot(page, makeSave());
    const result = await page.evaluate(async () => {
      // ドロップが出るまで繰り返す
      for (let i = 0; i < 100; i++) {
        const id = window.__game.injectEnemy(8, 3, 1);
        window.__game.dealDamage(id, 1, 'sword');
        const drops = window.__game.getFloorDrops();
        const bombDrop  = drops.find(d => d.type === 'bomb');
        const arrowDrop = drops.find(d => d.type === 'arrow');
        const heartDrop = drops.find(d => d.type === 'heart');
        const rupeeDrop = drops.find(d => d.type === 'rupee');
        if (bombDrop) {
          const before = window.__game.getPlayer().subItems?.bomb?.count ?? 0;
          window.__game.pickupFloorDrop(bombDrop.r, bombDrop.c);
          const after = window.__game.getPlayer().subItems?.bomb?.count ?? 0;
          return { type: 'bomb', before, after };
        }
        if (arrowDrop) {
          const before = window.__game.getPlayer().subItems?.bow?.count ?? 0;
          window.__game.pickupFloorDrop(arrowDrop.r, arrowDrop.c);
          const after = window.__game.getPlayer().subItems?.bow?.count ?? 0;
          return { type: 'arrow', before, after };
        }
        if (heartDrop) {
          window.__game.pickupFloorDrop(heartDrop.r, heartDrop.c);
          return { type: 'heart', picked: true };
        }
        if (rupeeDrop) {
          const before = window.__game.getPlayer().rupees ?? 0;
          window.__game.pickupFloorDrop(rupeeDrop.r, rupeeDrop.c);
          const after = window.__game.getPlayer().rupees ?? 0;
          return { type: 'rupee', before, after };
        }
      }
      return null;
    });
    expect(result).not.toBeNull();
    if (result.type === 'bomb' || result.type === 'arrow') {
      expect(result.after).toBeGreaterThan(result.before);
    } else if (result.type === 'rupee') {
      expect(result.after).toBeGreaterThan(result.before);
    } else {
      // heart: just checking it didn't crash
      expect(result.picked).toBe(true);
    }
  });

  test('拾ったドロップが maxBombs を超えない', async ({ page }) => {
    // bomb=6 の状態で爆弾ドロップを拾っても 8 を超えない
    await boot(page, makeSave({ subItems: { bomb: { count: 6 }, bow: { count: 0 } } }));
    const result = await page.evaluate(async () => {
      for (let i = 0; i < 100; i++) {
        const id = window.__game.injectEnemy(8, 3, 1);
        window.__game.dealDamage(id, 1, 'sword');
        const drops = window.__game.getFloorDrops();
        for (const d of drops) {
          window.__game.pickupFloorDrop(d.r, d.c);
        }
      }
      const p = window.__game.getPlayer();
      return { bomb: p.subItems?.bomb?.count ?? 0, max: p.maxBombs ?? 8 };
    });
    expect(result.bomb).toBeLessThanOrEqual(result.max);
  });

  test('拾ったドロップが maxArrows を超えない', async ({ page }) => {
    await boot(page, makeSave({ subItems: { bomb: { count: 0 }, bow: { count: 6 } } }));
    const result = await page.evaluate(async () => {
      for (let i = 0; i < 100; i++) {
        const id = window.__game.injectEnemy(8, 3, 1);
        window.__game.dealDamage(id, 1, 'sword');
        const drops = window.__game.getFloorDrops();
        for (const d of drops) {
          window.__game.pickupFloorDrop(d.r, d.c);
        }
      }
      const p = window.__game.getPlayer();
      return { arrow: p.subItems?.bow?.count ?? 0, max: p.maxArrows ?? 8 };
    });
    expect(result.arrow).toBeLessThanOrEqual(result.max);
  });

  test('爆弾・矢が満タン時はフロアに弾ドロップが出ない', async ({ page }) => {
    // HP・弾ともに満タンでも拾えないならドロップ抽選から弾が除外される
    await boot(page, makeSave({
      hp: 6, maxHp: 6,
      subItems: { bomb: { count: 8 }, bow: { count: 8 } },
    }));
    const hasAmmo = await page.evaluate(async () => {
      for (let i = 0; i < 80; i++) {
        const id = window.__game.injectEnemy(8, 3, 1);
        window.__game.dealDamage(id, 1, 'sword');
        const drops = window.__game.getFloorDrops();
        if (drops.some(d => d.type === 'bomb' || d.type === 'arrow')) return true;
        for (const d of drops) window.__game.pickupFloorDrop(d.r, d.c);
      }
      return false;
    });
    expect(hasAmmo).toBe(false);
  });

  // キュー41（2026-10-10 ユーザー指示）：爆弾も弓矢も、置かれた物を拾う前は落とし物で出さない。
  // 爆弾は弾＝能力∴先に配ると爆弾の報酬（D6）より前に壊せる壁が開く（D2 `2,2` のひびの祠で判明）。
  test('爆弾も弓も持たない間は、倒しても爆弾・矢は落ちない（ハート・ルピーは落ちる）', async ({ page }) => {
    // 35% × 50回＝ドロップ自体は事実上必ず出る（出なければ測定が空虚）
    await boot(page, makeSave({ subItems: {} }));
    const r = await page.evaluate(() => {
      const seen = new Set();
      for (let i = 0; i < 50; i++) {
        const id = window.__game.injectEnemy(8, 3, 1);
        window.__game.dealDamage(id, 1, 'sword');
        for (const d of window.__game.getFloorDrops()) seen.add(d.type);
      }
      return [...seen].sort();
    });
    expect(r.length, 'ドロップが1つも出ていない＝測定が空虚').toBeGreaterThan(0);
    expect(r, '爆弾を拾う前なのに爆弾が落ちた').not.toContain('bomb');
    expect(r, '弓を拾う前なのに矢が落ちた').not.toContain('arrow');
  });

  test('爆弾を持たない間は、落とし物の爆弾を拾ってもスロットが生えない（持っていれば +3）', async ({ page }) => {
    await boot(page, makeSave({ subItems: {} }));
    const bombSlot = () => page.evaluate(() => window.__game.getPlayer().subItems?.bomb ?? null);
    await page.evaluate(() => { window.__game.spawnFloorDrop(4, 2, 'bomb'); window.__game.pickupFloorDrop(4, 2); });
    expect(await bombSlot(), '爆弾を持たないのに落とし物の爆弾が入った').toBeNull();

    await page.evaluate(() => window.__game.giveSubItem('bomb'));
    const before = (await bombSlot()).count;
    await page.evaluate(() => { window.__game.spawnFloorDrop(4, 2, 'bomb'); window.__game.pickupFloorDrop(4, 2); });
    expect((await bombSlot()).count).toBe(before + 3);
  });

  test('ボスを倒してもフロアドロップは出ない', async ({ page }) => {
    await boot(page, makeSave({ defeatedBosses: ['A', 'N', 'G', 'B', 'M', 'O', 'L', 'I', 'U'] }));
    await page.evaluate(() => {
      const id = window.__game.injectEnemy(8, 3, 1, 2, 2, 'A');
      window.__game.dealDamage(id, 999, 'sword');
    });
    const drops = await page.evaluate(() => window.__game.getFloorDrops());
    expect(drops.length).toBe(0);
  });

});
