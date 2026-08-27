// tests/weakness-feedback.spec.js — Phase 8-4 (4) 0d-2.11（2026-08-26）
// **弱点が当たったことを「文字なし」で伝える**＝専用 SE ＋ クリティカル的なエフェクト。
//
// 動機（ユーザーの実プレイ報告 2026-08-26・N 砂嵐の蠍王の判定）：
//   「ブーメランが弱点だって気が付いてなかった。ブーメランで余裕でたおせた。」
//   ＝弱点を使わずに戦って「結構厳しい」と言っていた。弱点に気づく機会が本編に無く、
//   当てたときのフィードバックも弱かった（音は鍵の入手音 `key` の流用＝宝箱と同じ音）。
// 決定（ユーザー確定）：**弱点専用の音を鳴らし、クリティカル的な効果表示を出す。文字は出さない。**
//   ∴旧実装の `WEAK! -8` という英字表示は削除する（ゲーム中に他の英字表示は無く浮いていた）。
//
// ⚠️ 既存の `tests/weakness.spec.js` は**倍率だけ**を測っている（HP の減り）＝
//    音・DOM・文字を1つも見ていない∴「WEAK! を消す」「専用 SE にする」では緑のまま。
//    ここは**鳴った周波数と出た DOM** を見る。
//
// 固定する不変条件：
//   ① 弱点ヒットは通常ヒットと**別の音**（専用 SE `weakHit` の高音帯が鳴る・
//      鍵の音 `key` の流用に戻っていない）
//   ② ポップアップに英字を出さない（弱点でも通常でも `-N` の数字だけ）
//   ③ 弱点ヒットだけに専用エフェクトが出る（`.weak-burst` ＝ 放射刃・閃光・衝撃波リングの3枚）
//   ④ 文字を消した代わりの強調が残っている（数字が通常より大きく、専用アニメで跳ねる）

import { test, expect } from '@playwright/test';
import { ENEMY_META } from '../shared/enemies.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';

// 弱点の題材＝N 砂嵐の蠍王（ブーメラン ×3）。弱点でない攻撃種別＝剣。
const WEAK_TYPE = 'N';

// 専用 SE `weakHit` の高音帯（shared/sounds.js）。通常ヒット `hit` は 150/100/80Hz ∴
// この3つが鳴っていれば「別の音になった」と言える。
const WEAK_TONES = [1568, 2093, 2637];
// 鍵の音（旧実装の流用先）。ここに戻ったら弱点だけ宝箱と同じ音になる。
const KEY_TONES = [880, 1100, 1320];

// 障害物のない検証アリーナ（boomerang-boss-no-stun.spec.js と同じ土俵）。
function previewUrl() {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey('spare_arena'),
    row: '7', col: '2', ps_weapon: '1', ps_boomerang: '1',
  });
  return `${GAME}?${p.toString()}`;
}

// AudioContext を張り子に差し替えて**鳴った周波数**を記録する。
// ⚠️ ページ側に置く（`addInitScript`）＝spec 間で張り子を取り合わない。
//    `playSound` は getAudioContext() の結果をモジュール内に持つ∴goto より前に差し替える。
async function enterArena(page) {
  await page.addInitScript(() => {
    window.__tones = [];
    const rec = () => ({
      type: '', frequency: { setValueAtTime(f) { window.__tones.push(f); } },
      connect() {}, start() {}, stop() {},
    });
    const gain = () => ({
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {},
    });
    window.AudioContext = function () {
      return {
        currentTime: 0, state: 'running', destination: {},
        createOscillator: rec, createGain: gain, resume() {}, close() {},
      };
    };
    window.webkitAudioContext = window.AudioContext;
  });
  await page.goto(previewUrl());
  await waitForBoard(page);
}

/**
 * 敵を1体注入して `atkType` で1発当て、鳴った音と出た DOM を返す。
 *   ・`step()` を1回も回さない＝注入直後に当てる。潜行（`hide`）を持つ敵は最初の tick で
 *     潜って当たり判定から外れる（`combat.js` の `if (e.hidden) return;`）∴進めてはいけない。
 *   ・DOM は当てた直後に読む（ポップアップ 700ms・閃光 500ms で消える）。
 */
async function hitAndObserve(page, type, atkType, dmg = 10) {
  return page.evaluate(({ type, atkType, dmg, w, h }) => {
    document.querySelectorAll('.dmg-popup, .weak-burst').forEach(el => el.remove());
    window.__tones = [];
    const id = window.__game.injectEnemy(8, 8, 200, w, h, type);
    window.__game.dealDamage(id, dmg, atkType);
    const e = window.__game.getEnemies().find(x => x.id === id);
    const popup = document.querySelector('.dmg-popup');
    const burst = document.querySelector('.weak-burst');
    const cs = popup ? getComputedStyle(popup) : null;
    return {
      loss:      200 - (e?.hp ?? 0),
      tones:     [...window.__tones],
      popupText: popup?.textContent ?? null,
      popupCls:  popup?.className ?? null,
      fontSize:  cs ? parseFloat(cs.fontSize) : null,
      animName:  cs ? cs.animationName : null,
      bursts:    document.querySelectorAll('.weak-burst').length,
      parts:     burst ? [...burst.children].map(c => c.className) : [],
    };
  }, { type, atkType, dmg, w: ENEMY_META[type].size?.w ?? 1, h: ENEMY_META[type].size?.h ?? 1 });
}

test.describe('Phase 8-4 (4) 0d-2.11 – 弱点ヒットの手応え（文字なし）', () => {

  test('① 弱点ヒットは通常ヒットと別の音（専用 SE・鍵の流用に戻っていない）', async ({ page }) => {
    expect(ENEMY_META[WEAK_TYPE].weakness, `${WEAK_TYPE} の弱点が消えている`).toBeTruthy();
    await enterArena(page);
    const weak   = await hitAndObserve(page, WEAK_TYPE, ENEMY_META[WEAK_TYPE].weakness.type);
    const normal = await hitAndObserve(page, WEAK_TYPE, 'sword');

    for (const f of WEAK_TONES) {
      expect(weak.tones, `弱点ヒットで専用 SE の ${f}Hz が鳴っていない`
        + `（鳴った音＝${weak.tones.join('/')}）`).toContain(f);
    }
    // 通常ヒットには高音帯が無い＝「別の音」であることの裏返し
    for (const f of WEAK_TONES) {
      expect(normal.tones, `通常ヒットでも ${f}Hz が鳴っている（音で区別できない）`).not.toContain(f);
    }
    // 鍵の音（旧・流用先）に戻っていない
    expect(KEY_TONES.every(f => weak.tones.includes(f)),
      '弱点ヒットが鍵の入手音そのまま＝宝箱と同じ音に聞こえる（専用 SE に戻す）').toBe(false);
  });

  test('② ポップアップに英字を出さない（弱点でも数字だけ）', async ({ page }) => {
    await enterArena(page);
    const weak   = await hitAndObserve(page, WEAK_TYPE, ENEMY_META[WEAK_TYPE].weakness.type);
    const normal = await hitAndObserve(page, WEAK_TYPE, 'sword');

    expect(weak.popupText, '弱点ヒットのポップアップが出ていない').toBeTruthy();
    expect(weak.popupText, '弱点ヒットに文字が出ている（「文字は出さない」＝ユーザー確定）')
      .toMatch(/^-\d+$/);
    expect(weak.popupText, `弱点の表示に英字が混ざっている（${weak.popupText}）`)
      .not.toMatch(/[A-Za-z]/);
    expect(normal.popupText, '通常ヒットのポップアップが数字だけでない').toMatch(/^-\d+$/);
    // 数字そのものは弱点倍率を反映している（表示を消したついでに値まで消していない）
    expect(weak.popupText, '弱点ヒットの数字が通常と同じ＝倍率が表示に出ていない')
      .not.toBe(normal.popupText);
    expect(weak.popupText).toBe(`-${weak.loss}`);
  });

  test('③ 弱点ヒットだけに専用エフェクト（放射刃・閃光・衝撃波の3枚）', async ({ page }) => {
    await enterArena(page);
    const weak   = await hitAndObserve(page, WEAK_TYPE, ENEMY_META[WEAK_TYPE].weakness.type);
    const normal = await hitAndObserve(page, WEAK_TYPE, 'sword');

    expect(weak.bursts, '弱点ヒットの閃光が出ていない').toBe(1);
    expect(normal.bursts, '通常ヒットでも弱点の閃光が出ている（区別できない）').toBe(0);
    // 文字を出さない∴「特別さ」は形で伝える＝3枚重ねが要る
    expect(weak.parts, 'クリティカル表現の3枚が揃っていない'
      + '（親の .weak-burst だけでは旧実装＝ただの円に戻っている）')
      .toEqual(['weak-burst-star', 'weak-burst-flash', 'weak-burst-ring']);
  });

  test('④ 文字を消した代わりの強調が残っている（数字が大きく専用アニメで跳ねる）', async ({ page }) => {
    await enterArena(page);
    const weak   = await hitAndObserve(page, WEAK_TYPE, ENEMY_META[WEAK_TYPE].weakness.type);
    const normal = await hitAndObserve(page, WEAK_TYPE, 'sword');

    expect(weak.popupCls, '弱点のクラス .weak-dmg が付いていない').toContain('weak-dmg');
    expect(weak.fontSize, '弱点の数字が通常と同じ大きさ＝文字も強調も無くなっている')
      .toBeGreaterThan(normal.fontSize);
    expect(weak.animName, '弱点の数字が通常と同じアニメ＝跳ねが無い').toBe('weak-popup-anim');
    expect(normal.animName, '通常ヒットのアニメが変わっている（回帰）').toBe('popup-anim');
  });
});
