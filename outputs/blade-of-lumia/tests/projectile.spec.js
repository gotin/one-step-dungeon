// tests/projectile.spec.js – 投擲物（弓矢・ブーメラン）飛翔確認テスト
//
// 背景：Phase 0-2 Step 5 の factory 切り出し後、useSubItem が
// projectile.js factory の内部変数ではなく game.js のローカル変数（空の配列）に
// push し続けていたため投擲物が動かなくなるバグが発生した。
// このテストはそのリグレッションを検出するために追加された。
//
// 検証内容：
//   条件1: 弓矢を使用後、1 フレーム後に player 所有の arrow が存在し、dx > 0 であること
//   条件2: ブーメランを使用後、1 フレーム後に player 所有の boomerang が存在し、
//          プレイヤー初期位置から前進していること（往路中）

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

/** サブアイテムが装備済みの状態でゲームを seed する */
async function seedAndStart(page, subItems, activeSubItem) {
  const saveData = JSON.stringify({
    player: {
      x: 5, y: 5,
      hp: 6, maxHp: 6, maxHearts: 3,
      atk: 2, def: 0, keys: 0,
      weapon: 'sword',
      shield: null, armor: null,
      subItems,
      activeSubItem,
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

  // seed があるとタイトルダイアログが表示される → 「続きから」ボタンをクリック
  await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#btn-continue').click();

  // ボードが描画されるまで待機
  await page.waitForFunction(() => {
    const b = document.getElementById('board');
    return !!b && b.children.length > 0;
  });
}

test.describe('Blade of Lumia – 投擲物（弓矢・ブーメラン）', () => {

  test('条件1: 弓矢を使用すると arrow 投擲物が生成され、dx > 0 である', async ({ page }) => {
    await seedAndStart(page, { bow: { count: 10 } }, 'bow');

    // 使用前：投擲物はゼロ
    const beforeCount = await page.evaluate(() => window.__game.getProjectiles().length);
    expect(beforeCount).toBe(0);

    // サブアイテム（弓矢）を使用
    await page.evaluate(() => window.__game.useSubItem());

    // 使用直後：arrow が 1 つ存在する
    const afterCount = await page.evaluate(() => window.__game.getProjectiles().length);
    expect(afterCount).toBe(1);

    const proj = await page.evaluate(() => window.__game.getProjectiles()[0]);
    expect(proj.type).toBe('arrow');
    expect(proj.owner).toBe('player');
    // heroDir=right のため dx > 0（右方向）
    expect(proj.dx).toBeGreaterThan(0);

    // 5 フレーム進める
    await page.evaluate(() => window.__game.step(5));

    // 5フレーム後：arrow がまだ存在し x 座標が前進している、または壁に当たって消えた
    const projs = await page.evaluate(() => window.__game.getProjectiles());
    if (projs.length > 0) {
      const arrow = projs.find(p => p.type === 'arrow' && p.owner === 'player');
      if (arrow) {
        // 発射位置より右に進んでいる
        expect(arrow.x).toBeGreaterThan(proj.x);
      }
    } else {
      // 壁に当たって消えた場合も「一時は生成・飛翔した」ことが確認済み
      console.log('[Arrow Test] Arrow was removed after 5 steps (hit wall or OOB – OK)');
    }
  });

  test('条件2: ブーメランを使用すると boomerang 投擲物が生成され、往路で前進する', async ({ page }) => {
    // Infinity は JSON.stringify でシリアライズできないため count=99 を使用
    await seedAndStart(page, { boomerang: { count: 99 } }, 'boomerang');

    // 使用前：投擲物はゼロ
    const beforeCount = await page.evaluate(() => window.__game.getProjectiles().length);
    expect(beforeCount).toBe(0);

    // サブアイテム（ブーメラン）を使用
    await page.evaluate(() => window.__game.useSubItem());

    // 使用直後：boomerang が 1 つ存在する
    const afterCount = await page.evaluate(() => window.__game.getProjectiles().length);
    expect(afterCount).toBe(1);

    const proj = await page.evaluate(() => window.__game.getProjectiles()[0]);
    expect(proj.type).toBe('boomerang');
    expect(proj.owner).toBe('player');
    expect(proj.dx).toBeGreaterThan(0); // 右向き
    expect(proj.returning).toBe(false);  // 往路

    const startX = proj.x;

    // 3 フレーム進める（maxRange=3 セルなので往路の途中）
    await page.evaluate(() => window.__game.step(3));

    // 3フレーム後：boomerang がまだ存在し、発射座標から動いている
    const projs = await page.evaluate(() => window.__game.getProjectiles());
    expect(projs.length).toBe(1);
    const boom = projs[0];
    expect(boom.type).toBe('boomerang');
    // 全く動いていなければバグ（factory の接続が壊れている）
    expect(Math.abs(boom.x - startX)).toBeGreaterThan(0.01);
  });

});
