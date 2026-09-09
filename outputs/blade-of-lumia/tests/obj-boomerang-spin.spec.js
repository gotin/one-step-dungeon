// tests/obj-boomerang-spin.spec.js — Phase 10d-6: ブーメラン飛翔中の回転アニメーション
//
// ユーザー指摘＝「ブーメランをなげたときに、ブーメランが回転していない。まっすぐ飛んでいて
// 違和感しかない。ブーメランは回転しながら飛んでいくものなので、それを回転アニメーションで
// 表現してほしい」。
//
// 実装＝ブーメランの canvas（game/projectile.js createProjEl）に CSS クラス
// `boomerang-spin`（game/css/effects.css・@keyframes boomerang-spin-anim）を付け、
// 回転周期（--spin-ms）は個体ごとに JS が計算する：
//   往復（投げてから戻ってキャッチされるまで）の実時間 = 2*maxRange / (speed*MOVE_STEP) * TICK_MS
//   回転周期 = 往復の実時間 / BOOMERANG_ROTATIONS_PER_TRIP(=4)
// ＝木/銀ティア・敵の boomerangThrow（速度/距離が違う）・二周目（2倍速）のどれでも
// 固定値を書かずに自動で追従する（PLAN 10d-6「多めに回す」固定値は禁止）。
// アウラ（.boomerang-flaming）・運搬アイコン（.boomerang-carry）は別要素＝対象外。
//
// 歯の確認（実施済み・mutant は戻し済み）＝
//   ① createProjEl の `cv.classList.add('boomerang-spin')` を削る → ①②③④が赤
//   ② BOOMERANG_ROTATIONS_PER_TRIP を書き換える → ①②③のspin-ms期待値が赤
//   ③ effects.css の @keyframes 名を変える → ④（animationName）が赤

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';

const GAME = '/blade-of-lumia/game/';
const MOVE_STEP = 0.5;
const TICK_MS = 120;
const ROTATIONS_PER_TRIP = 4;

// projectile.js boomerangSpinMs() と同じ式（テスト側は実装を import できない内部関数
// なので式を写して独立に検算する＝実装の式そのものを信用せず組み立て直す）。
function expectedSpinMs(speed, maxRange) {
  const roundTripMs = (2 * maxRange) / (speed * MOVE_STEP) * TICK_MS;
  return Math.max(60, roundTripMs / ROTATIONS_PER_TRIP);
}

function previewUrl(opts = {}) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey('spare_arena'),
    row: String(opts.row ?? 7), col: String(opts.col ?? 2),
    ps_weapon: '1', ps_boomerang: '1',
  });
  if (opts.silver) p.set('ps_silverboomerang', '1');
  if (opts.cleared) p.set('ps_cleared', '1');
  return `${GAME}?${p.toString()}`;
}

// ブーメランを1発投げて、飛翔中の canvas（.sprite）の回転関連プロパティを読む。
async function throwAndReadSpin(page, dir = 'right') {
  return page.evaluate((d) => {
    window.__game.movePlayer(d);
    window.__game.step(1);
    window.__game.useSubItem();
    const p = window.__game.getProjectiles().find(x => x.type === 'boomerang');
    if (!p) return null;
    const el = document.getElementById(`proj-${p.id}`);
    const cv = el?.querySelector('canvas.sprite');
    if (!cv) return null;
    const cs = getComputedStyle(cv);
    return {
      speed: p.speed,
      maxRange: p.maxRange,
      hasClass: cv.classList.contains('boomerang-spin'),
      spinMs: cv.style.getPropertyValue('--spin-ms').trim(),
      animationName: cs.animationName,
      animationDuration: cs.animationDuration,
    };
  }, dir);
}

async function seedBoomerangSave(page, stageKey_, px, py) {
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
    stageKey: stageKey_,
    heroDir: 'right',
  });
  await page.addInitScript(({ key, value }) => {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
  }, { key: SAVE_KEY, value: saveData });
  await page.goto(GAME_URL);
  await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#btn-continue').click();
  await waitForBoard(page);
}

test.describe('Phase 10d-6 – ブーメラン飛翔中の回転アニメーション', () => {

  test('①木ブーメラン：canvasにboomerang-spinクラス＋--spin-msが往復時間/4', async ({ page }) => {
    await page.goto(previewUrl());
    await waitForBoard(page);
    const info = await throwAndReadSpin(page);
    expect(info, 'ブーメランが飛んでいない').not.toBeNull();
    expect(info.speed).toBe(BOOMERANG_TIERS[0].speed);
    expect(info.maxRange).toBe(BOOMERANG_TIERS[0].maxRange);
    expect(info.hasClass, 'boomerang-spin クラスが付いていない').toBe(true);
    const expected = expectedSpinMs(info.speed, info.maxRange);
    expect(info.spinMs).toBe(`${expected}ms`);
  });

  test('②銀ブーメラン：speed/maxRangeが違うので--spin-msも木と違う値になる（ティアに自動追従）', async ({ page }) => {
    await page.goto(previewUrl({ silver: true }));
    await waitForBoard(page);
    const info = await throwAndReadSpin(page);
    expect(info).not.toBeNull();
    expect(info.speed).toBe(BOOMERANG_TIERS[1].speed);
    expect(info.maxRange).toBe(BOOMERANG_TIERS[1].maxRange);
    expect(info.hasClass).toBe(true);
    const expected = expectedSpinMs(info.speed, info.maxRange);
    expect(info.spinMs).toBe(`${expected}ms`);
    // 木と同じ値になっていない＝tier固定値の書き写しではなくproj.speed/maxRangeから算出している証拠
    expect(expected).not.toBe(expectedSpinMs(BOOMERANG_TIERS[0].speed, BOOMERANG_TIERS[0].maxRange));
  });

  test('③二周目（hasCleared）：木ブーメランの速度が2倍になり--spin-msも変わる（tier表の固定値ではない）', async ({ page }) => {
    await page.goto(previewUrl({ cleared: true }));
    await waitForBoard(page);
    const info = await throwAndReadSpin(page);
    expect(info).not.toBeNull();
    expect(info.speed, '二周目の速度2倍がproj.speedに反映されていない').toBe(BOOMERANG_TIERS[0].speed * 2);
    expect(info.maxRange).toBe(BOOMERANG_TIERS[0].maxRange);
    expect(info.hasClass).toBe(true);
    const expected = expectedSpinMs(info.speed, info.maxRange);
    expect(info.spinMs).toBe(`${expected}ms`);
    // 通常速の木（180ms）とは異なる値になる＝proj.speedの実値から毎回算出している証拠
    expect(expected).not.toBe(expectedSpinMs(BOOMERANG_TIERS[0].speed, BOOMERANG_TIERS[0].maxRange));
  });

  test('④実際にCSSアニメーションとして解決されている（durationがspin-msと一致＋実時間で角度が変化する）', async ({ page }) => {
    await page.goto(previewUrl());
    await waitForBoard(page);
    const info = await throwAndReadSpin(page);
    expect(info).not.toBeNull();
    // ⚠️ animation-name の計算値は @keyframes が実在しなくても指定した識別子のまま返る
    // （CSS仕様＝マッチしないキーフレーム名でも animation-name プロパティ自体の値は変わらない）
    // ∴ これだけでは「実際に回っている」歯にならない。名前の一致は前提条件として見るだけ。
    expect(info.animationName).toBe('boomerang-spin-anim');
    const durSec = parseFloat(info.animationDuration);
    const expectedSec = parseFloat(info.spinMs) / 1000;
    expect(Math.abs(durSec - expectedSec)).toBeLessThan(0.005);

    // 実時間で transform（rotate）が実際に変わっていることを見る＝@keyframes が
    // 存在せず解決していない場合はここで検出できる（animation-name だけでは検出不可）。
    const angles = await page.evaluate(async () => {
      const p = window.__game.getProjectiles().find(x => x.type === 'boomerang');
      const el = document.getElementById(`proj-${p.id}`);
      const cv = el.querySelector('canvas.sprite');
      const read = () => getComputedStyle(cv).transform;
      const a = read();
      await new Promise(r => setTimeout(r, 260));
      const b = read();
      return [a, b];
    });
    expect(angles[1], '260ms 経っても transform が変化していない＝回転が実際には起きていない')
      .not.toBe(angles[0]);
  });

  test('⑤炎持ちブーメラン：本体（canvas）は回転するがオーラ（.boomerang-flaming）は回転しない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const p = new URLSearchParams({
      fromEditor: '1', layer: TEST_LAYER, stage: stageKey('torch_relay'),
      row: '3', col: '0', ps_boomerang: '1',
    });
    await page.goto(`${GAME}?${p.toString()}`);
    await waitForBoard(page);

    const info = await page.evaluate(() => {
      window.__game.movePlayer('right');
      window.__game.step(1);
      window.__game.useSubItem();
      for (let i = 0; i < 15; i++) {
        window.__game.step(1);
        const proj = window.__game.getProjectiles().find(x => x.type === 'boomerang');
        const aura = document.querySelector('.boomerang-flaming');
        if (proj?.flaming && aura) {
          const el = document.getElementById(`proj-${proj.id}`);
          const cv = el?.querySelector('canvas.sprite');
          return {
            cvHasSpin: cv?.classList.contains('boomerang-spin') ?? false,
            auraHasSpin: aura.classList.contains('boomerang-spin'),
          };
        }
      }
      return null;
    });
    expect(info, '炎持ちブーメランのフレームを捉えられなかった').not.toBeNull();
    expect(info.cvHasSpin, '炎持ちでも本体は回転するはず').toBe(true);
    expect(info.auraHasSpin, 'オーラまで回転クラスが付いている＝対象外のはずの要素に漏れている').toBe(false);
    expect(errors).toEqual([]);
  });

  test('⑥運搬中：ブーメラン本体は回転するが付随アイコン（.boomerang-carry）は回転しない', async ({ page }) => {
    await seedBoomerangSave(page, '6,13', 6, 2);

    const info = await page.evaluate(() => {
      window.__game.useSubItem();
      for (let i = 0; i < 10; i++) {
        window.__game.step(1);
        const icon = document.querySelector('.boomerang-carry');
        if (icon) {
          const proj = window.__game.getProjectiles().find(x => x.type === 'boomerang');
          const el = document.getElementById(`proj-${proj.id}`);
          const cv = el?.querySelector('canvas.sprite');
          return {
            cvHasSpin: cv?.classList.contains('boomerang-spin') ?? false,
            iconHasSpin: icon.classList.contains('boomerang-spin'),
          };
        }
      }
      return null;
    });
    expect(info, '運搬アイコンが出るフレームを捉えられなかった').not.toBeNull();
    expect(info.cvHasSpin).toBe(true);
    expect(info.iconHasSpin, '運搬アイコンまで回転クラスが付いている＝対象外のはずの要素に漏れている').toBe(false);
  });

  test('⑦敵（ブーメラン鬼）が投げるブーメランにも同じ回転機構が掛かる（owner判定していない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const p = new URLSearchParams({
      fromEditor: '1', layer: TEST_LAYER, stage: stageKey('boomerang_ogre'),
      row: '4', col: '6', ps_weapon: '1',
    });
    await page.goto(`${GAME}?${p.toString()}`);
    await waitForBoard(page);

    const info = await page.evaluate(() => {
      for (let i = 0; i < 40; i++) {
        window.__game.step(1);
        const proj = window.__game.getProjectiles().find(x => x.type === 'boomerang' && x.owner === 'enemy');
        if (proj) {
          const el = document.getElementById(`proj-${proj.id}`);
          const cv = el?.querySelector('canvas.sprite');
          if (!cv) return null;
          return {
            speed: proj.speed,
            maxRange: proj.maxRange,
            hasClass: cv.classList.contains('boomerang-spin'),
            spinMs: cv.style.getPropertyValue('--spin-ms').trim(),
          };
        }
      }
      return null;
    });
    expect(info, '敵のブーメランが飛ばなかった').not.toBeNull();
    const atk = ENEMY_META[TILE.BOOMERANG_OGRE].attack;
    expect(info.speed).toBe(atk.projectileSpeed);
    expect(info.maxRange).toBe(atk.maxRange);
    expect(info.hasClass).toBe(true);
    const expected = expectedSpinMs(info.speed, info.maxRange);
    expect(info.spinMs).toBe(`${expected}ms`);
    expect(errors).toEqual([]);
  });

});
