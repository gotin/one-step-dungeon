// tests/projectile.spec.js – 投擲物（弓矢・ブーメラン）飛翔・命中確認テスト
//
// 背景：Phase 0-2 Step 5 の factory 切り出し後、useSubItem が
// projectile.js factory の内部変数ではなく game.js のローカル変数（空の配列）に
// push し続けていたため投擲物が動かなくなるバグが発生した。
// また、弓矢の高速移動（1tick に最大4.5セル）が敵のヒットボックス（0.6セル）を
// 飛び越えて当たらない「トンネリング」バグも発生していた。
// このテストはこれらのリグレッションを検出するために追加された。
//
// 検証内容：
//   条件1: 弓矢を使用後、player 所有の arrow が存在し dx > 0 であること
//   条件2: ブーメランを使用後、boomerang が存在し往路で前進すること
//   条件3: 弓矢が距離 1〜8 セル先にいる敵に正しく命中し HP が減少すること（トンネリング防止）

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
    stageKey: '7,14',
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

  test('条件3: 弓矢が距離 1〜8 セル先の敵に命中し HP が減少する（トンネリング防止）', async ({ page }) => {
    // プレイヤーを (2, 5) に配置して右向きに弓矢を射る
    // 各距離 d（1〜8）に擬似敵を注入し、十分なフレームを経て HP が減少しているか確認する
    // 弓矢 speed=4.5 → 1tick=2.25 セル移動。旧実装では特定距離で飛び越えてヒットしなかった
    const saveData = JSON.stringify({
      player: {
        x: 2, y: 5,
        hp: 6, maxHp: 6, maxHearts: 3,
        atk: 2, def: 0, keys: 0,
        weapon: 'sword', shield: null, armor: null,
        subItems: { bow: { count: 30 } },
        activeSubItem: 'bow',
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

    // hp=1 にすることで矢1発で倒せる（killEnemy で enemies から除去される）。
    // これにより「前の距離の敵が軌道上に残ってブロックする」問題を防ぐ。
    // 矢 atk=5, def=0 → actual = max(1, 5-0) = 5 ≥ 1 → kill 確実
    const ARROW_HP = 1;
    const results = [];

    for (let dist = 1; dist <= 8; dist++) {
      // 各距離ごとに：敵を注入 → 矢を発射 → 10フレーム進める → 敵が消えたか確認
      // （前の距離の敵は1発で倒されて enemies から除去されているので軌道をブロックしない）
      const enemyId = await page.evaluate(
        ([ex, ey, hp]) => window.__game.injectEnemy(ex, ey, hp),
        [2 + dist, 5, ARROW_HP],  // プレイヤー(2,5)の右 dist セル先
      );

      // 弓矢を発射（heroDir=right なので dx>0）
      await page.evaluate(() => window.__game.useSubItem());

      // 矢が到達するのに十分なフレーム数（8セル / 2.25セル/tick ≒ 4tick、余裕で10tick）
      await page.evaluate(() => window.__game.step(10));

      // 敵が存在しなければ（killEnemy で除去された）命中
      const enemySnap = await page.evaluate(
        (id) => window.__game.getEnemies().find(e => e.id === id) ?? null,
        enemyId,
      );

      // hp=1 の敵は当たれば必ず kill される → enemies から消える（null）
      const hit = enemySnap === null;
      results.push({ dist, hit });
      console.log(`[Arrow Hit] dist=${dist} → hit=${hit} enemy=${JSON.stringify(enemySnap)}`);
    }

    // 全距離で命中しているか確認
    const missedDistances = results.filter(r => !r.hit).map(r => r.dist);
    expect(
      missedDistances,
      `距離 ${missedDistances.join(',')} セルの敵に矢が当たらなかった（トンネリングが再発している可能性）`,
    ).toHaveLength(0);
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
