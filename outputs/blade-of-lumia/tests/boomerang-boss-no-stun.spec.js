// tests/boomerang-boss-no-stun.spec.js — Phase 8-4 (2)（2026-08-23）
// **ボスはブーメランで硬直しない**（ダメージは通る）。ザコは従来どおり硬直する。
//
// 動機（ユーザーの実プレイ報告 2026-08-23・リバランス検証行 y=1 を歩いて確認した結果）：
//   「ブーメランで動けなくさせることができてしまえば、あとはブーメランと剣を連打しまくれば
//     勝ててしまう」。
//   数字で裏取り＝スタン 1500ms（game/constants.js BOOMERANG_STUN_MS）に対して
//   ブーメランの往復は 木 6マス≒0.7秒／銀 12マス≒0.6秒（BOOMERANG_TIERS の speed）
//   ∴投げ直しが硬直より速い＝**永久に固められる**。しかも同時に飛ばせるのは1枚だけ＝
//   「投げる → 当たる → 硬直 → 戻る → また投げる」で切れ目が出ない。
//
// 決定：ダメージは残し、**硬直だけ**ボスから外す。判定は ENEMY_META から導出＝
//   `stunnable ?? !isBoss`（`stunnable` を明示した敵だけが例外）。一覧は手書きしない。
//
// ⚠️ この本が要る理由＝既存の `tests/boomerang-stun.spec.js` は
//    `window.__game.stunEnemy(id, ms)` を直接叩いて**スタン機構そのもの**を測っている
//    ＝ブーメランを1枚も投げていない∴「誰が硬直するか」の変更では緑のまま。
//    ここは**実際にブーメランを投げて**当てる（projectile.js の boomerang 分岐を通す）。
//
// 固定する不変条件：
//   ① 導出の形（ボス13種はすべて硬直しない側・ザコはすべて硬直する側）
//   ② 実機：ボスに当てるとダメージは入るが stunUntil が立たない・⭐も出ない
//   ③ 実機：ザコに当てるとダメージ＋硬直＋ガード解除が入る（従来挙動の回帰）
//   ④ N 砂嵐の蠍王のブーメラン弱点（×3）は硬直を外しても残る（damage が3倍）
//   ⑤ L 氷のリヴァイアサンは打ち返す＝ダメージ0・硬直なし（reflect が先に効く回帰）

import { test, expect } from '@playwright/test';
import { ENEMY_META } from '../shared/enemies.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';
const WOOD = BOOMERANG_TIERS[0];

// 実装（game/projectile.js の boomerang 分岐）と同じ導出。ここを書き換えたら実装も動く。
const stunExpected = (m) => m.stunnable ?? !m.isBoss;
// ブーメランで期待されるダメージ（injectEnemy の敵は def 0）。
const dmgExpected = (m) =>
  WOOD.atk * (m.weakness?.type === 'boomerang' ? m.weakness.multiplier : 1);

const ENTRIES = Object.entries(ENEMY_META);
// 打ち返す敵（L）は投擲物が敵の弾に変わる＝そもそも当たらない∴⑤で別に測る。
// 隠れ窓・跳躍・瞬間移動・突進を持つ敵は AI が勝手に姿を消す/動く＝当てた瞬間を
// 固定できない（`e.hidden` の敵は当たり判定から外れる仕様）∴ループから除く。
const UNSTABLE = (m) => m.reflectsProjectiles || m.hide || m.leap || m.blink || m.dash;
// ダメージを打ち消す機構を持つ敵（φ 甲羅・ζ 正面ブロック）は、当たった瞬間が
// 閉じ/構え中かで damage が 0 になりうる＝**それが 5.5k の設計**（「ダメージが
// 正面ブロックされても阻害効果は貫通する」）∴damage は 0 か規定値のどちらでもよく、
// 硬直が入ることだけを固定する。
const DMG_BLOCKER = (m) => !!(m.shell || m.blockFacing || m.guards);
const HITTABLE = ENTRIES.filter(([, m]) => !UNSTABLE(m));
const BOSS_TYPES = HITTABLE.filter(([, m]) => m.isBoss);
const ZAKO_TYPES = HITTABLE.filter(([, m]) => !m.isBoss);

// 障害物のない検証アリーナ（rows 7/8 が全面床）。boomerang-tiers.spec.js と同じ土俵。
function previewUrl() {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey('spare_arena'),
    row: '7', col: '2', ps_weapon: '1', ps_boomerang: '1',
  });
  return `${GAME}?${p.toString()}`;
}

/**
 * アリーナに入り直してから、プレイヤーの右2マスに `type` の敵を1体だけ置いてブーメランを当てる。
 *   ・毎回 `enterStage` で入り直す＝前の回に注入した敵を消す（往路は1体目で折り返す∴残すと
 *     次の敵に届かない）。`getEnemies()` は**ホワイトリストのスナップショット**を返す
 *     ∴受け取った配列を splice しても実体の敵は消えない（`_guarding` も `guarding` で出る）。
 *   ・入り直すとプレイヤー位置も戻る＝右へ歩き続けて隣のアリーナへ渡る事故も防げる。
 *   ・敵は hp 999 ＝撃破させない（ラスボス Z を倒すとスタッフロールが始まる）。
 */
async function throwAt(page, type, meta) {
  return page.evaluate(({ type, w, h, layer, stage }) => {
    window.__game.enterStage(layer, stage, 7, 2);
    window.__game.movePlayer('right');            // 右を向く（半セル進む）
    window.__game.step(1);
    const pl = window.__game.getPlayer();
    const id = window.__game.injectEnemy(pl.x + 2, pl.y, 999, w, h, type);
    const find = () => window.__game.getEnemies().find(e => e.id === id);
    const stars0 = document.querySelectorAll('.stun-burst').length;
    const before = find()?.hp;
    window.__game.useSubItem();
    // ⚠️ 当たった直後に測る。step(20) は論理時間 20×120ms = 2400ms ＝スタン 1500ms を
    //    跨いでしまう∴「ザコも硬直していない」に見える（1回目に踏んだ罠）。
    let e = null;
    for (let i = 0; i < 20; i++) {
      window.__game.step(1);
      e = find();
      // hp が減った tick／硬直が立った tick で観測を止める。
      // （φ 甲羅・ζ 正面ブロックは damage 0 で硬直だけ入る∴hp だけを見ていると
      //   20 tick 走り切ってスタンが切れ「ザコも硬直しない」に見える）
      if (!e || e.hp < before || (e.stunUntil ?? 0) > 0) break;
    }
    return {
      injected: before,
      damage:   before - (e?.hp ?? 0),
      stunned:  (e?.stunUntil ?? 0) > window.__game.getState().gameTime,
      guarding: !!e?.guarding,
      stars:    document.querySelectorAll('.stun-burst').length - stars0,
    };
  }, {
    type, w: meta.size?.w ?? 1, h: meta.size?.h ?? 1,
    layer: TEST_LAYER, stage: stageKey('spare_arena'),
  });
}

async function enterArena(page) {
  await page.goto(previewUrl());
  await waitForBoard(page);
}

test.describe('Phase 8-4 (2) – ブーメランの硬直はザコだけ（ボスはダメージのみ）', () => {

  test('① 導出の形：ボスは全種が硬直しない側・ザコは全種が硬直する側', () => {
    const bosses = ENTRIES.filter(([, m]) => m.isBoss);
    const zako   = ENTRIES.filter(([, m]) => !m.isBoss);
    expect(bosses.length, 'ボスの種類数（ENEMY_META から導出）').toBe(13);
    expect(zako.length, 'ザコの種類数（ENEMY_META から導出）').toBe(21);
    for (const [t, m] of bosses) {
      expect(stunExpected(m), `${t} ${m.name}: ボスが硬直する側に入っている`
        + '（意図した例外なら stunnable: true を書いてこの本の期待値も直す）').toBe(false);
    }
    for (const [t, m] of zako) {
      expect(stunExpected(m), `${t} ${m.name}: ザコが硬直しない側に入っている`
        + '（ブーメランでガードを崩して斬るのがザコ戦の設計）').toBe(true);
    }
  });

  test('② 実機：ボスはダメージだけ入り、硬直も⭐も出ない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await enterArena(page);
    for (const [t, m] of BOSS_TYPES) {
      const r = await throwAt(page, t, m);
      expect(r.damage, `${t} ${m.name}: ブーメランのダメージが入っていない`
        + '（硬直を外すのはダメージを消すことではない）').toBe(dmgExpected(m));
      expect(r.stunned, `${t} ${m.name}: ボスが硬直した`
        + '（投げ直しが硬直より速い＝永久に固められる）').toBe(false);
      expect(r.stars, `${t} ${m.name}: 硬直していないのに⭐が出た（見た目だけ残っている）`).toBe(0);
    }
    expect(errors, 'ゲームで pageerror').toEqual([]);
  });

  test('③ 実機：ザコはダメージ＋硬直＋ガード解除（従来挙動の回帰）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await enterArena(page);
    for (const [t, m] of ZAKO_TYPES) {
      const r = await throwAt(page, t, m);
      if (DMG_BLOCKER(m)) {
        // 甲羅/正面ブロック中なら 0（＝阻害だけ通る）・開いていれば規定値
        expect([0, dmgExpected(m)], `${t} ${m.name}: ダメージが 0 でも規定値でもない`)
          .toContain(r.damage);
      } else {
        expect(r.damage, `${t} ${m.name}: ブーメランのダメージが入っていない`).toBe(dmgExpected(m));
      }
      expect(r.stunned, `${t} ${m.name}: ザコが硬直しない`
        + '（ボスの変更をザコまで巻き込んでいる）').toBe(true);
      expect(r.guarding, `${t} ${m.name}: ガードが解除されていない`).toBe(false);
      expect(r.stars, `${t} ${m.name}: 硬直したのに⭐が出ない`).toBeGreaterThan(0);
    }
    expect(errors, 'ゲームで pageerror').toEqual([]);
  });

  test('④ N 砂嵐の蠍王：ブーメラン弱点（×3）は硬直を外しても残る', async ({ page }) => {
    const meta = ENEMY_META['N'];
    expect(meta.weakness, 'N のブーメラン弱点が消えている').toMatchObject({ type: 'boomerang' });
    await enterArena(page);
    const r = await throwAt(page, 'N', meta);
    expect(r.damage, 'N のブーメラン弱点倍率が効いていない')
      .toBe(WOOD.atk * meta.weakness.multiplier);
    expect(r.damage, '弱点でないボスと同じダメージ＝倍率が失われている')
      .toBeGreaterThan(WOOD.atk);
    expect(r.stunned, '弱点持ちのボスだけ硬直が残っている').toBe(false);
  });

  test('⑤ L 氷のリヴァイアサン：打ち返す＝ダメージ0・硬直なし（reflect が先）', async ({ page }) => {
    const meta = ENEMY_META['L'];
    expect(meta.reflectsProjectiles, 'L の打ち返しが消えている').toBe(true);
    await enterArena(page);
    const r = await throwAt(page, 'L', meta);
    expect(r.damage, 'L にブーメランのダメージが通った（meleeOnly + reflect の回帰）').toBe(0);
    expect(r.stunned, 'L が硬直した（reflect より後で硬直が入っている）').toBe(false);
  });
});
