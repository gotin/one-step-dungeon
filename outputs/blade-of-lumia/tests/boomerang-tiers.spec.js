// tests/boomerang-tiers.spec.js — Phase 9-6 深洋O ④: 銀のブーメラン（ティア方式）
//
// 銀のブーメランは「2つ目のサブアイテム枠」ではなく **木のブーメランのティア差し替え**
// （ユーザー確定 2026-07-26・AskUserQuestion）。理由＝サブアイテム枠を増やすと
// 「木と銀を持ち替える」無意味な選択が生まれる。剣/防具/盾と同じティア方式に揃える。
//
//   BOOMERANG_TIERS[0] wood   … atk3 / speed2.0 / maxRange3（既存の挙動そのまま）
//   BOOMERANG_TIERS[1] silver … atk6 / speed5.0 / maxRange6（海の主の報酬）
//     speed 5.0 ＝ 20.8セル/秒＝**弓矢（4.5＝18.8）より速い**（ユーザー指摘
//     2026-07-26「もっと速くてよさそう」＝当初の 3.0 では上位品なのに矢より鈍かった）。
//   player.boomerangTier (-1=未所持, 0..1) で管理し equipBoomerangTier(i) が下位を拒否する。
//
// 🔑 boomerangStep は既に proj.maxRange / proj.speed を参照する（projectile.js）∴
//   発射ブロックがティアの値を渡すだけでロジック改変は不要。
// 🔑 二周目（hasCleared）の 2倍速はティアに掛ける倍率として維持する
//   （木: 2.0→4.0 = 既存テストの値と一致）。
//
// 固定する不変条件：
//   ① BOOMERANG_TIERS の定義（キー・名前・atk・speed・maxRange）
//   ② equipBoomerangTier は上位のみ受け付け、下位は拒否する（剣/防具/盾と同型）
//   ③ 木ティアの発射値（既存挙動の回帰＝atk3 / speed2.0 / maxRange3）
//   ④ 銀ティアの発射値（atk6 / speed5.0 / maxRange6）
//   ⑤ 銀は木では届かない距離（7マス先）の敵に届く＝maxRange が実効
//   ⑤b/⑤c 銀（1tick 2.5セル）が敵・アイテムをすり抜けない（トンネリング防止の回帰）
//   ⑥ grantReward({type:'boomerang', boomerangTier}) でティアが上がる（報酬経路）
//   ⑦ 旧セーブデータの補完（boomerangTier 未定義＝所持なら wood / 未所持なら -1）
//   ⑧ HUD/ポーズのアイテム名がティア名になる（銀を持っていると「銀のブーメラン」）

import { test, expect } from '@playwright/test';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { sanitizeLoadedPlayer } from '../game/save.js';
import { ITEM_META } from '../shared/items.js';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

// 障害物の無い草原（field 2,15 は 5,5 の MAP_ENTER 以外すべて床）に立たせる。
// ブーメランの飛翔距離を測るので、往復の経路に木・水・壁が無い画面を選ぶ。
function previewUrl(opts = {}) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: 'field', stage: '2,15',
    row: String(opts.row ?? 2), col: String(opts.col ?? 2),
    ps_weapon: '1', ps_boomerang: '1',
  });
  if (opts.silver) p.set('ps_silverboomerang', '1');
  if (opts.cleared) p.set('ps_cleared', '1');
  return `${GAME}?${p.toString()}`;
}

// ブーメランを1発投げて、飛んでいる投擲物のスナップショットを返す。
async function throwAndSnapshot(page, dir = 'right') {
  return page.evaluate((d) => {
    window.__game.movePlayer(d);
    window.__game.step(1);
    window.__game.useSubItem();
    const p = window.__game.getProjectiles().find(x => x.type === 'boomerang');
    return p ? { atk: p.atk, speed: p.speed, maxRange: p.maxRange } : null;
  }, dir);
}

test.describe('Phase 9-6 – 銀のブーメラン（ティア方式）', () => {

  test('① BOOMERANG_TIERS の定義（wood / silver）', () => {
    expect(Array.isArray(BOOMERANG_TIERS)).toBe(true);
    expect(BOOMERANG_TIERS.length).toBe(2);
    expect(BOOMERANG_TIERS[0]).toMatchObject({
      key: 'wood', name: 'ブーメラン', atk: 3, speed: 2.0, maxRange: 3,
    });
    expect(BOOMERANG_TIERS[1]).toMatchObject({
      key: 'silver', name: '銀のブーメラン', atk: 6, speed: 5.0, maxRange: 6,
    });
    // 上位ティアは全パラメータで上位（「強くなった」が体感できる）
    expect(BOOMERANG_TIERS[1].atk).toBeGreaterThan(BOOMERANG_TIERS[0].atk);
    expect(BOOMERANG_TIERS[1].speed).toBeGreaterThan(BOOMERANG_TIERS[0].speed);
    expect(BOOMERANG_TIERS[1].maxRange).toBeGreaterThan(BOOMERANG_TIERS[0].maxRange);
  });

  test('② equipBoomerangTier は上位のみ・下位は拒否（剣/防具/盾と同型）', async ({ page }) => {
    await page.goto(previewUrl());
    await waitForBoard(page);
    const res = await page.evaluate(() => {
      const up   = window.__game.equipBoomerangTier(1);
      const tier1 = window.__game.getState().player.boomerangTier;
      const down = window.__game.equipBoomerangTier(0);   // 下位は無視
      const tier2 = window.__game.getState().player.boomerangTier;
      const bad  = window.__game.equipBoomerangTier(9);   // 存在しないティア
      return { up, tier1, down, tier2, bad };
    });
    expect(res.up).toBe(true);
    expect(res.tier1).toBe(1);
    expect(res.down).toBe(false);
    expect(res.tier2).toBe(1);
    expect(res.bad).toBe(false);
  });

  test('③ 木ティアの発射値（既存挙動の回帰）', async ({ page }) => {
    await page.goto(previewUrl());
    await waitForBoard(page);
    const proj = await throwAndSnapshot(page);
    expect(proj).toEqual({ atk: 3, speed: 2.0, maxRange: 3 });
  });

  test('④ 銀ティアの発射値（atk6 / speed5.0 / maxRange6）', async ({ page }) => {
    await page.goto(previewUrl({ silver: true }));
    await waitForBoard(page);
    const tier = await page.evaluate(() => window.__game.getState().player.boomerangTier);
    expect(tier, 'ps_silverboomerang でティア1になる').toBe(1);
    const proj = await throwAndSnapshot(page);
    expect(proj).toEqual({ atk: 6, speed: 5.0, maxRange: 6 });
  });

  test('④b 二周目（姫状態）の2倍速はティア値に掛かる', async ({ page }) => {
    await page.goto(previewUrl({ silver: true, cleared: true }));
    await waitForBoard(page);
    const proj = await throwAndSnapshot(page);
    expect(proj.speed).toBe(10.0);     // 5.0 × 2
    expect(proj.maxRange).toBe(6);     // 射程は二周目でも変わらない
  });

  test('⑤ 銀は7マス先の敵に届く・木は届かない（maxRange が実効）', async ({ page }) => {
    // 同じ配置で「木＝当たらない／銀＝当たる」を比べる（maxRange が効いている証明）。
    // 実際の到達距離は maxRange より約1.5セル長い（発射位置が +0.5・折り返し判定が
    // 移動前の距離で行われるため）。木 maxRange3 → 到達 ~4.5 / 銀 maxRange6 → 到達 ~7.5。
    // ∴ 7マス先が「木は届かず銀は届く」境界になる。
    async function hitAt(silver) {
      await page.goto(previewUrl({ silver, row: 2, col: 2 }));
      await waitForBoard(page);
      return page.evaluate(() => {
        // プレイヤーの右 7 マスに敵を置く（hp 大きめ＝1発では死なない）
        const pl = window.__game.getPlayer();
        const id = window.__game.injectEnemy(pl.x + 7, pl.y, 50, 1, 1);
        window.__game.movePlayer('right');
        window.__game.step(1);
        const before = window.__game.getEnemies().find(e => e.id === id).hp;
        window.__game.useSubItem();
        window.__game.step(40);          // 往路＋復路
        const after = window.__game.getEnemies().find(e => e.id === id)?.hp ?? 0;
        return before - after;
      });
    }
    expect(await hitAt(false), '木のブーメラン（射程3）が7マス先に届いた').toBe(0);
    expect(await hitAt(true), '銀のブーメラン（射程6）が7マス先に届かない').toBeGreaterThan(0);
  });

  // ── 高速化（speed5.0＝1tick 2.5セル）のトンネリング防止 ────────────────
  // 敵のヒットボックスは 0.6セル・アイテム判定は 1セル ∴ 1tick で 2.5セル飛ぶと
  // 素朴な「1tick=1回移動」では箱を丸ごと飛び越えて判定が抜ける。
  // boomerangStep は 0.4セル刻みに分割して進む＝下の2本がその回帰テスト。

  test('⑤b 銀は1tick で飛び越える位置の敵にも当たる（トンネリング防止）', async ({ page }) => {
    await page.goto(previewUrl({ silver: true, row: 2, col: 2 }));
    await waitForBoard(page);
    const res = await page.evaluate(() => {
      const pl = window.__game.getPlayer();
      // 右2セル先＝銀の1tick（2.5セル）の**途中**にいる敵。分割しないと素通りする。
      const id = window.__game.injectEnemy(pl.x + 2, pl.y, 50, 1, 1);
      window.__game.movePlayer('right');
      window.__game.step(1);
      const before = window.__game.getEnemies().find(e => e.id === id).hp;
      window.__game.useSubItem();
      window.__game.step(1);            // 1tick だけ進める（飛び越え判定）
      const after = window.__game.getEnemies().find(e => e.id === id)?.hp ?? 0;
      return { before, after };
    });
    expect(res.after, '1tick で飛び越えた先の敵に当たっていない').toBeLessThan(res.before);
  });

  test('⑤c 銀は1tick で通過した全セルのアイテムを拾う（拾い落とし防止）', async ({ page }) => {
    await page.goto(previewUrl({ silver: true, row: 2, col: 2 }));
    await waitForBoard(page);
    const carried = await page.evaluate(() => {
      window.__game.movePlayer('right');
      window.__game.step(1);
      window.__game.useSubItem();
      const p = window.__game.getProjectiles().find(x => x.type === 'boomerang');
      const r = Math.floor(p.y + 0.5), c = Math.floor(p.x + 0.5);
      // 発射位置の右 +1 / +2 セル＝どちらも銀の1tick の射程内に入る
      window.__game.spawnFloorDrop(r, c + 1, 'rupee');
      window.__game.spawnFloorDrop(r, c + 2, 'rupee');
      window.__game.step(1);
      return window.__game.getProjectiles().find(x => x.type === 'boomerang')?.carriedCount ?? 0;
    });
    expect(carried, '通過セルのアイテムを拾い落とした').toBe(2);
  });

  test('⑥ grantReward({type:"boomerang"}) でティアが上がる（報酬経路）', async ({ page }) => {
    await page.goto(previewUrl());
    await waitForBoard(page);
    const res = await page.evaluate(() => {
      const msg = window.__game.grantReward({
        type: 'boomerang', boomerangTier: 1, name: '銀のブーメラン',
      });
      const st = window.__game.getState().player;
      return { msg, tier: st.boomerangTier, active: st.activeSubItem };
    });
    expect(res.tier).toBe(1);
    expect(res.msg).toContain('銀のブーメラン');
    // 未所持から報酬で貰った場合もサブアイテムとして使える状態になる
    expect(res.active).toBeTruthy();
  });

  test('⑦ 旧セーブデータの補完（所持=wood / 未所持=-1）', () => {
    const owned = sanitizeLoadedPlayer(
      { subItems: { boomerang: { count: Infinity } } }, ITEM_META);
    expect(owned.boomerangTier).toBe(0);
    const none = sanitizeLoadedPlayer({ subItems: {} }, ITEM_META);
    expect(none.boomerangTier).toBe(-1);
    // 既に値があるセーブは上書きしない
    const silver = sanitizeLoadedPlayer(
      { subItems: { boomerang: { count: Infinity } }, boomerangTier: 1 }, ITEM_META);
    expect(silver.boomerangTier).toBe(1);
  });

  test('⑧ HUD/ポーズの表示名がティア名になる', async ({ page }) => {
    await page.goto(previewUrl({ silver: true }));
    await waitForBoard(page);
    await page.keyboard.press('Escape');   // ポーズを開く
    await page.locator('#pause-items .pause-item-name').first().waitFor({ timeout: 5000 });
    const name = await page.evaluate(
      () => document.querySelector('#pause-items .pause-item-name')?.textContent ?? '');
    expect(name).toBe('銀のブーメラン');
  });
});
