// tests/boomerang-item.spec.js – ブーメランによるアイテム回収（Phase 4-4）
//
// ブーメランが通過したマスの鍵・ルピーを回収できる機能のテスト。
//   1. ブーメランが鍵 K を通過すると player.keys が増加する
//   2. ブーメランがルピー r を通過すると player.rupees が増加する
//   3. 回収済みの鍵は再収集されない（pickedKeys ガード）

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

// field '6,13' に配置されたブーメランパズル：
//   (2,7)=f (fence)  (2,8)=K (key)  (2,9)=f (fence)
// プレイヤーを (2,6) に置いて右向きにブーメランを投げると、
// fence (passable for projectile) を越えて key K を回収できる。

async function seedBoomerang(page, stageKey, px, py, extraSave = {}) {
  const saveData = JSON.stringify({
    player: {
      x: px, y: py,
      hp: 6, maxHp: 6, maxHearts: 3,
      atk: 2, def: 0, keys: 0,
      weapon: 'sword', shield: null, armor: null,
      subItems: { boomerang: { count: 99 } },
      activeSubItem: 'boomerang',
      rupees: 0, triforceCount: 0,
    },
    stageState: {},
    currentLayer: 'field',
    stageKey,
    heroDir: 'right',
    ...extraSave,
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

test.describe('Blade of Lumia – ブーメランでアイテム回収（Phase 4-4）', () => {

  test('ブーメランが K（鍵）を通過すると player.keys が 1 増加する', async ({ page }) => {
    // field '6,13' (2,6) に立って右向きにブーメランを投げる
    // ブーメランは (2,7)=fence を通過し (2,8)=K に到達して回収する
    await seedBoomerang(page, '6,13', 6, 2);

    const result = await page.evaluate(async () => {
      const before = window.__game.getState().player.keys;
      window.__game.useSubItem();
      // ブーメランが (2,8) に到達するのに十分なフレーム数を進める
      // speed=1.5, MOVE_STEP=0.5 → 1tick=0.75セル、2セル到達=約3tick
      // maxRange=3 なので往復で 8~10 tick で十分
      window.__game.step(10);
      const after = window.__game.getState().player.keys;
      return { before, after };
    });
    expect(result.before).toBe(0);
    expect(result.after).toBe(1);
  });

  test('回収済みの鍵はブーメランで再収集されない（pickedKeys ガード）', async ({ page }) => {
    // 同じ鍵を2回投げても keys は 1 のまま
    await seedBoomerang(page, '6,13', 6, 2);

    const result = await page.evaluate(async () => {
      // 1回目：鍵を回収
      window.__game.useSubItem();
      window.__game.step(20); // ブーメランが往復して戻るまで十分待つ
      const after1 = window.__game.getState().player.keys;

      // 2回目：再度ブーメランを投げる
      window.__game.useSubItem();
      window.__game.step(20);
      const after2 = window.__game.getState().player.keys;

      return { after1, after2 };
    });
    expect(result.after1).toBe(1);
    expect(result.after2).toBe(1); // 2回目は増えない
  });

  test('ブーメランが r（ルピー）を通過すると player.rupees が増加する', async ({ page }) => {
    // field '6,13' にはルピー r が (8,6) にある
    // プレイヤーを (8,4) に置いて右向きに投げると r (8,6) に届く
    await seedBoomerang(page, '6,13', 4, 8);

    const result = await page.evaluate(() => {
      const before = window.__game.getState().player.rupees;
      window.__game.useSubItem();
      window.__game.step(10);
      const after = window.__game.getState().player.rupees;
      return { before, after };
    });
    expect(result.before).toBe(0);
    expect(result.after).toBe(1); // r = ルピー×1
  });

  // ── Phase 4-6: アイテム運搬（初代ゼルダ式）＝拾った瞬間は入手せず、戻ってキャッチで確定 ──

  test('①往路でアイテムに触れても即入手しない（ブーメランが運搬中）', async ({ page }) => {
    await seedBoomerang(page, '6,13', 6, 2);

    const result = await page.evaluate(() => {
      window.__game.useSubItem();
      // 1tick でブーメランは K(2,8) を通過する（start x=7 → x=8）。
      // ここでは拾って carried に積むが player.keys にはまだ加算しない。
      window.__game.step(1);
      const proj = window.__game.getProjectiles().find(p => p.type === 'boomerang');
      return {
        keys: window.__game.getState().player.keys,
        carriedCount: proj?.carriedCount ?? 0,
      };
    });
    expect(result.keys).toBe(0);          // まだ入手していない
    expect(result.carriedCount).toBe(1);  // ブーメランが運搬中
  });

  test('②運搬中はブーメランに付随アイコン（.boomerang-carry）が表示される', async ({ page }) => {
    await seedBoomerang(page, '6,13', 6, 2);

    const seen = await page.evaluate(() => {
      window.__game.useSubItem();
      // 拾ってから戻るまでの間、付随アイコンが DOM に出るフレームがあるか
      for (let i = 0; i < 10; i++) {
        window.__game.step(1);
        if (document.querySelector('.boomerang-carry')) return true;
      }
      return false;
    });
    expect(seen).toBe(true);
  });

  test('②戻ってキャッチが成立すると運搬アイテムが確定入手される', async ({ page }) => {
    await seedBoomerang(page, '6,13', 6, 2);

    const result = await page.evaluate(() => {
      window.__game.useSubItem();
      window.__game.step(1);
      const mid = window.__game.getState().player.keys;   // 運搬中＝0
      window.__game.step(20);                              // 戻ってキャッチ
      const after = window.__game.getState().player.keys;  // 入手＝1
      const gone  = window.__game.getProjectiles().some(p => p.type === 'boomerang');
      return { mid, after, gone };
    });
    expect(result.mid).toBe(0);
    expect(result.after).toBe(1);
    expect(result.gone).toBe(false);  // キャッチしてブーメランは消えている
  });

  test('④取り逃し（キャッチ前にステージ遷移）＝入手されず、アイテムはその場に残る', async ({ page }) => {
    await seedBoomerang(page, '6,13', 6, 2);

    const result = await page.evaluate(() => {
      // 投げて運搬状態にする
      window.__game.useSubItem();
      window.__game.step(1);
      const carrying = window.__game.getProjectiles().find(p => p.type === 'boomerang')?.carriedCount ?? 0;

      // キャッチ前に別ステージへ遷移＝clearProjectiles で取り逃し
      window.__game.enterStage('field', '7,14', 1, 1);
      const afterMiss = window.__game.getState().player.keys;

      // 元ステージへ戻って再度投げると、鍵はまだ回収できる（＝その場に残っていた）
      window.__game.enterStage('field', '6,13', 2, 6);
      window.__game.useSubItem();
      window.__game.step(20);
      const afterRetry = window.__game.getState().player.keys;
      return { carrying, afterMiss, afterRetry };
    });
    expect(result.carrying).toBe(1);   // 運搬していた
    expect(result.afterMiss).toBe(0);  // 取り逃し＝入手されない
    expect(result.afterRetry).toBe(1); // タイルは残っていたので再回収できる
  });

  test('キャッチ後にブーメランの DOM 要素（.proj-el）が残らない（残骸バグ回帰）', async ({ page }) => {
    // Phase 4-6 の moveProjEl 自己修復が、除去済みブーメランを毎tick末尾で
    // 復活させて画面に残骸が残るバグの回帰テスト。
    await seedBoomerang(page, '6,13', 6, 2);

    const leftover = await page.evaluate(() => {
      window.__game.useSubItem();
      for (let i = 0; i < 25; i++) {
        window.__game.step(1);
        if (!window.__game.getProjectiles().some(p => p.type === 'boomerang')) break;
      }
      return document.querySelectorAll('.proj-el').length;
    });
    expect(leftover).toBe(0);
  });

  // ── Phase 4-6: 敵ドロップ（rupee/heart 等）もブーメランで拾える ──

  test('敵ドロップ（ルピー）をブーメランで運搬しキャッチで入手する', async ({ page }) => {
    await seedBoomerang(page, '7,14', 5, 2);

    const result = await page.evaluate(() => {
      // プレイヤー(2,5)の右2セル先(2,7)に敵ドロップ（ルピー）を撒く
      window.__game.spawnFloorDrop(2, 7, 'rupee');
      const beforeRupees = window.__game.getState().player.rupees;
      const beforeDrops = window.__game.getFloorDrops().length;

      window.__game.useSubItem();
      window.__game.step(1);   // 往路でドロップを拾って運搬（画面から消える）
      const midRupees = window.__game.getState().player.rupees;
      const midDrops = window.__game.getFloorDrops().length;
      const carrying = window.__game.getProjectiles().find(p => p.type === 'boomerang')?.carriedCount ?? 0;

      window.__game.step(20);  // 戻ってキャッチ
      const afterRupees = window.__game.getState().player.rupees;
      return { beforeRupees, beforeDrops, midRupees, midDrops, carrying, afterRupees };
    });
    expect(result.beforeDrops).toBe(1);
    expect(result.midDrops).toBe(0);       // 運搬中は画面から消える
    expect(result.midRupees).toBe(result.beforeRupees);  // まだ入手していない
    expect(result.carrying).toBe(1);       // ブーメランが運搬中
    expect(result.afterRupees).toBe(result.beforeRupees + 1);  // キャッチで入手
  });

  test('敵ドロップ（ハート）をブーメランで運搬しキャッチで HP 回復する', async ({ page }) => {
    // HP を減らした状態で開始（heal を観測するため）
    await seedBoomerang(page, '7,14', 5, 2, {
      player: {
        x: 5, y: 2, hp: 3, maxHp: 6, maxHearts: 3,
        atk: 2, def: 0, keys: 0,
        weapon: 'sword', shield: null, armor: null,
        subItems: { boomerang: { count: 99 } }, activeSubItem: 'boomerang',
        rupees: 0, triforceCount: 0,
      },
    });

    const result = await page.evaluate(() => {
      window.__game.spawnFloorDrop(2, 7, 'heart');
      const beforeHp = window.__game.getState().player.hp;
      window.__game.useSubItem();
      window.__game.step(1);
      const midHp = window.__game.getState().player.hp;  // 運搬中＝未回復
      window.__game.step(20);
      const afterHp = window.__game.getState().player.hp;
      return { beforeHp, midHp, afterHp };
    });
    expect(result.midHp).toBe(result.beforeHp);          // 運搬中は回復しない
    expect(result.afterHp).toBe(result.beforeHp + 1);    // キャッチで HP+1
  });

  // ── Phase 4-6: 復路の攻撃判定復活 ──

  test('③ブーメランの復路でも敵にダメージが入る', async ({ page }) => {
    // 敵のいない直線でブーメランを投げ、折り返した（returning）後に
    // 復路の軌道上へ敵を注入する。復路で checkProjHit が働けばダメージが入る。
    await seedBoomerang(page, '7,14', 2, 5);

    const result = await page.evaluate(async () => {
      window.__game.useSubItem();
      // 折り返すまで進める（maxRange=3・speed2.0）
      let proj = null;
      for (let i = 0; i < 10; i++) {
        window.__game.step(1);
        proj = window.__game.getProjectiles().find(p => p.type === 'boomerang');
        if (proj?.returning) break;
      }
      if (!proj) return { threw: false };
      // 復路の進行方向（プレイヤー側）へ1セル先に敵を注入
      const tr = Math.round(proj.y);
      const tc = Math.max(0, Math.round(proj.x) - 1);
      const id = window.__game.injectEnemy(tc, tr, 50, 1, 1);
      // 復路で敵を通過するまで進める
      window.__game.step(6);
      const e = window.__game.getEnemies().find(x => x.id === id);
      return { threw: true, returning: proj.returning, hp: e?.hp ?? null };
    });
    expect(result.threw).toBe(true);
    expect(result.returning).toBe(true);
    expect(result.hp).not.toBeNull();
    expect(result.hp).toBeLessThan(50);  // 復路で削れている
  });

});
