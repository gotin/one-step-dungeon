// @ts-check
// 実行キュー82⑪（2026-10-18・Fable 実装レビュー #3・#7）＝性能の番人。
// 基準線（.scratch/q82/perf.mjs・森の画面 field 0,3・CPU 4 倍絞り・1 秒あたりの主スレッド時間）：
//   直す前 立ち止まり 117ms／歩き 150ms → 直した後 47ms／64ms（2026-10-18）。
// 縛るもの：
//   ① アニメの描き直し（redrawAnimSprites）は、描くコマ・絵・色・向きが変わらないキャンバスを塗り直さない
//      ＝gameTick（120ms）ごとの呼び出しで、animFrame（400ms）が変わっていなければ塗りは 0 回
//   ② 絵の名前・向き（dataset）が変わったキャンバスは、次の tick ですぐ描き直す（敵の向きが遅れない）
//   ③ 半歩の移動で HUD（ハート・装備・道具の絵）を作り直さない
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';

// 森の画面（木 77 本＝アニメするキャンバスが一番多い画面の1つ）
const URL = `${GAME_URL}?fromEditor=1&layer=field&stage=0,3&row=5&col=5&ps_weapon=1`;

async function open(page) {
  await page.goto(URL);
  await waitForBoard(page);
  await page.evaluate(() => {
    window.__game.pause();
    // 測る区間は1回の evaluate の中＝アニメループ（400ms の実時間）は割り込まない＝animFrame は動かない
    window.__fills = 0;
    const orig = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (...a) {
      if (this.canvas.classList.contains('sprite') && this.canvas.dataset.sprite) window.__fills++;
      return orig.apply(this, a);
    };
  });
}

test('① animFrame が変わらなければ、tick ごとの描き直しで塗りは 0 回', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const n = document.querySelectorAll('canvas.sprite[data-sprite]').length;
    window.__game.step(1);   // 1回目＝作られたときの記録がそのまま使われる
    window.__fills = 0;
    window.__game.step(3);
    return { n, fills: window.__fills };
  });
  expect(r.n, '前提：アニメするキャンバスが多い画面').toBeGreaterThan(50);
  expect(r.fills, '同じ絵を塗り直している').toBe(0);
});

test('② 向き（dataset）が変わったキャンバスは次の tick ですぐ描き直す', async ({ page }) => {
  await open(page);
  const fills = await page.evaluate(() => {
    window.__game.step(1);
    const cv = document.querySelector('canvas.sprite[data-sprite]');
    cv.dataset.flipX = cv.dataset.flipX === '1' ? '' : '1';
    window.__fills = 0;
    window.__game.step(1);
    return window.__fills;
  });
  expect(fills, '向きを変えたのに描き直されない').toBeGreaterThan(0);
});

test('③ 半歩の移動で HUD の絵を作り直さない', async ({ page }) => {
  await open(page);
  const same = await page.evaluate(() => {
    const before = [...document.querySelectorAll('#hud-hearts canvas, #hud-equip-sword canvas, #hud-sub-icon canvas')];
    for (let i = 0; i < 2; i++) { window.__game.movePlayer('right'); window.__game.step(1); }
    const after = [...document.querySelectorAll('#hud-hearts canvas, #hud-equip-sword canvas, #hud-sub-icon canvas')];
    return { n: before.length, same: before.length === after.length && before.every((c, i) => c === after[i]), moved: window.__game.getPlayer().x };
  });
  expect(same.moved, '前提：動けた').toBeGreaterThan(5);
  expect(same.n, '前提：HUD に絵がある').toBeGreaterThan(0);
  expect(same.same, '移動で HUD の絵が作り直された').toBe(true);
});
