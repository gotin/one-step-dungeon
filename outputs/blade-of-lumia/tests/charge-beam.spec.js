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
//   条件4: 溜めている間は移動できない（向き変更だけは通る）（Phase 5.5g5）
//   条件5: 溜めている間は剣を構えたまま（出しっぱなし）で、離すと戻る（Phase 5.5g6）

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

  test('条件4: チャージ中は移動できない（向きだけは変えられる）', async ({ page }) => {
    // 溜めている間に歩けると「溜めながら間合いを詰める」ができてしまい、
    // 攻撃ポーズ（Phase 5.5g4）で足を止めた規則と食い違う。窓は charge.js の
    // _chargeStart（isCharging）＝オーラ表示と同じ1つの窓。
    await seedAndStart(page);
    // 実ループを止めてから論理時間を進める（余分な tick を排除）
    await page.evaluate(() => { window.__game.pause(); window.__game.step(3); });

    const posOf = () => page.evaluate(() => {
      const p = window.__game.getPlayer();
      return { x: p.x, y: p.y };
    });
    const heroSprite = () => page.evaluate(() =>
      document.querySelector('#char-player canvas[data-sprite]')?.dataset.sprite ?? null);
    // 構えた剣の向き（class の dir-* から取る。未描画なら null）
    const swordHeldDir = () => page.evaluate(() => {
      const el = document.querySelector('.sword-held');
      if (!el) return null;
      return [...el.classList].find(c => c.startsWith('dir-'))?.slice(4) ?? null;
    });

    // 前提：チャージしていなければ右へ動ける（field 7,14 の (2,5) の右は床）
    const before = await posOf();
    await page.evaluate(() => window.__game.movePlayer('right'));
    const moved = await posOf();
    expect(moved.x, 'チャージしていない状態で右へ動けていない（盤面が変わった？）')
      .toBeGreaterThan(before.x);

    // チャージ中：movePlayer でも押しっぱなし（heldKeys）でも動かない
    await page.evaluate(() => window.__game.startCharge());
    const charging = await posOf();
    await page.evaluate(() => window.__game.movePlayer('right'));
    expect(await posOf(), 'チャージ中に movePlayer で動いてしまった').toEqual(charging);
    await page.evaluate(() => { window.__game.queueInput('right'); window.__game.step(1); });
    expect(await posOf(), 'チャージ中に押しっぱなし経路で動いてしまった').toEqual(charging);
    await page.evaluate(() => window.__game.releaseInput('right'));

    // 向きは変えられる（＝離した瞬間に飛ぶビームの狙いを付けられる）
    // Phase 5.5g6 で溜め中は剣を構えたまま＝スプライトは攻撃ポーズ（*Atk）になり、
    // 構えた剣（.sword-held）も向きに合わせて描き直される。
    expect(await heroSprite(), 'チャージ中に剣を構えていない（右向き）').toBe('heroRAtk');
    expect(await swordHeldDir(), '構えた剣の向きが右でない').toBe('right');
    await page.evaluate(() => window.__game.movePlayer('down'));
    expect(await heroSprite(), 'チャージ中に向きを変えられない（ビームを狙えない）')
      .toBe('heroDAtk');
    expect(await swordHeldDir(), '向きを変えたのに構えた剣が古い向きのまま残っている')
      .toBe('down');
    expect(await posOf(), '向き変更で位置まで動いてしまった').toEqual(charging);

    // 離せば再び動ける（向きは下に変わっているので右へ向け直してから歩く）
    await page.evaluate(() => { window.__game.releaseCharge(); window.__game.step(2); });
    await page.evaluate(() => window.__game.movePlayer('right'));
    const after = await posOf();
    expect(after.x, 'チャージを離した後も動けない').toBeGreaterThan(charging.x);
  });

  test('条件5: 溜めている間は剣を構えたまま（出しっぱなし）で、離すと戻る', async ({ page }) => {
    // 攻撃ポーズは通常 ATTACK_POSE_MS=180ms で切れる∴溜め（CHARGE_FULL_MS=720ms）の
    // 途中で剣が消えてしまうのがバグ（ユーザー報告）。窓は _atkUntil 1 つのままで、
    // チャージ中だけ game.js tickAttackPose が延長し続ける。
    await seedAndStart(page);
    await page.evaluate(() => { window.__game.pause(); window.__game.step(3); });

    const held = () => page.evaluate(() => ({
      sword:  document.querySelectorAll('.sword-held').length,
      sprite: document.querySelector('#char-player canvas[data-sprite]')?.dataset.sprite ?? null,
    }));

    // 実プレイと同じ順（押した瞬間に剣が出る → 押しっぱなしで溜まる）
    await page.evaluate(() => { window.__game.swordAttack(); window.__game.startCharge(); });
    expect(await held(), '攻撃直後に剣が出ていない').toEqual({ sword: 1, sprite: 'heroRAtk' });

    // 満タン（720ms＝6フレーム）を越えて進めても剣は出たまま・重複もしない
    await page.evaluate(() => window.__game.step(8));
    expect(await held(), '溜めている途中で剣が消えた／二重に出た')
      .toEqual({ sword: 1, sprite: 'heroRAtk' });

    // 離せばポーズの窓（180ms＝2フレーム）が切れて通常の絵に戻る
    await page.evaluate(() => { window.__game.releaseCharge(); window.__game.step(2); });
    expect(await held(), '離した後も剣が出しっぱなしになっている')
      .toEqual({ sword: 0, sprite: 'heroR' });
  });

});
