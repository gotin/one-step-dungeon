// tests/swift-boots.spec.js
// 疾風の靴（実行キュー13・2026-09-29 試作）＝持っていると Shift を押している間だけ速く歩ける。
//
// 🔴 ユーザー確定の不変条件＝**プレイヤーが居られる位置はセルの中央か半セルの位置だけ**。
//    靴で変えるのは「半マス進むのにかかる時間」だけ＝1回の移動量（MOVE_STEP 0.5）は変えない。
//    ∴実装は 1 tick に `movePlayer`（半マス）を DASH_SPEED 回呼ぶ（1歩ずつ壁・床・入口を判定）。
//
// 縛るもの：
//   ① 靴＋Shift＝1 tick に 1マス（半マス×2）。位置は毎 tick 半マス格子の上
//   ② 靴が無ければ Shift を押しても普通の速さ／靴があっても Shift を離せば普通の速さ
//   ③ 壁の手前で止まる（2歩目で壁を越えない・格子から外れない）
//   ④ 二周目（1.2 倍）と掛け合わせない＝走ると毎 tick ちょうど 1マス
//   ⑤ 入力の後始末＝Shift を先に離してから文字キーを離しても歩き続けない／フォーカスが外れたら止まる
//   ⑥ 見た目＝走っている間だけ #char-player に .dashing（補間を tick の長さに伸ばす）
//   ⑦ 画面の端を走って越えても、着いた先の位置が半マス格子の上
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';

// dungeon_7 4,2 は敵も仕掛けも無い広間（行2は列1〜10が床・列11が壁／行4・5は左端が開いている）。
const ROOM = `${GAME_URL}?fromEditor=1&layer=dungeon_7&stage=4,2`;
const url = (row, col, extra = '') => `${ROOM}&row=${row}&col=${col}${extra}`;
const BOOTS = '&ps_swiftboots=1';

const onGrid = (v) => Number.isInteger(v * 2);

async function open(page, row, col, extra) {
  await page.goto(url(row, col, extra));
  await waitForBoard(page);
  // 実時間ループを止めて tick を手で進める（余分な tick が混ざらない）。
  await page.evaluate(() => window.__game.pause());
}

// n tick 進めて、各 tick 後の x を返す
async function stepXs(page, n) {
  return page.evaluate((n) => {
    const xs = [];
    for (let i = 0; i < n; i++) { window.__game.step(1); xs.push(window.__game.getPlayer().x); }
    return xs;
  }, n);
}

test.describe('Blade of Lumia – 疾風の靴（Shift で走る）', () => {

  test('① 靴＋Shift で 1 tick に 1マス進み、位置は毎 tick 半マス格子の上', async ({ page }) => {
    await open(page, 2, 1, BOOTS);
    expect(await page.evaluate(() => window.__game.getPlayer().x)).toBe(1);
    await page.keyboard.down('Shift');
    await page.keyboard.down('ArrowRight');
    const xs = await stepXs(page, 4);
    expect(xs, '1 tick ごとに 1マス').toEqual([2, 3, 4, 5]);
    expect(xs.every(onGrid)).toBe(true);
    expect(await page.evaluate(() => window.__game.getState().player.dashing)).toBe(true);
  });

  test('② 靴が無いと Shift を押しても普通の速さ／靴があっても Shift を離せば普通の速さ', async ({ page }) => {
    await open(page, 2, 1);
    await page.keyboard.down('Shift');
    await page.keyboard.down('ArrowRight');
    expect(await stepXs(page, 2), '靴なし＋Shift').toEqual([1.5, 2]);
    expect(await page.evaluate(() => window.__game.getState().player.dashing)).toBe(false);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('Shift');

    await open(page, 2, 1, BOOTS);
    await page.keyboard.down('ArrowRight');
    expect(await stepXs(page, 2), '靴あり・Shift なし').toEqual([1.5, 2]);
    // 走っている途中で Shift を離すと、次の tick から普通の速さに戻る
    await page.keyboard.down('Shift');
    expect(await stepXs(page, 1)).toEqual([3]);
    await page.keyboard.up('Shift');
    expect(await stepXs(page, 1)).toEqual([3.5]);
  });

  test('③ 走っても壁の手前で止まる（2歩目で壁を越えない）', async ({ page }) => {
    // 半セルずらした位置から走る＝奇数回目の半マスで壁に着く組み合わせも踏む
    await open(page, 2, 1, BOOTS);
    await page.keyboard.down('ArrowRight');
    expect(await stepXs(page, 1)).toEqual([1.5]);
    await page.keyboard.down('Shift');
    const xs = await stepXs(page, 12);
    expect(xs.every(onGrid), `格子から外れた: ${xs}`).toBe(true);
    // 列11が壁＝居られる右端は x=10
    expect(Math.max(...xs)).toBe(10);
    expect(xs.at(-1)).toBe(10);
  });

  test('④ 二周目（1.2 倍）でも走ると毎 tick ちょうど 1マス（掛け合わせない）', async ({ page }) => {
    await open(page, 2, 1, `${BOOTS}&ps_cleared=1`);
    await page.keyboard.down('Shift');
    await page.keyboard.down('ArrowRight');
    expect(await stepXs(page, 5)).toEqual([2, 3, 4, 5, 6]);
  });

  test('⑤ Shift を先に離してから文字キーを離しても歩き続けない／フォーカスが外れたら止まる', async ({ page }) => {
    await open(page, 2, 1, BOOTS);
    // Shift を押したまま D を押す＝keydown は 'D'。Shift を先に離すと keyup は 'd' で届く。
    await page.keyboard.down('Shift');
    await page.keyboard.down('KeyD');
    expect(await stepXs(page, 1)).toEqual([2]);
    await page.keyboard.up('Shift');
    await page.keyboard.up('KeyD');
    expect(await stepXs(page, 3), '指を離したのに歩き続けている').toEqual([2, 2, 2]);

    // 押したままフォーカスが外れた（keyup が届かない）→ 全部離したことにする
    await page.keyboard.down('Shift');
    await page.keyboard.down('ArrowRight');
    expect(await stepXs(page, 1)).toEqual([3]);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    expect(await stepXs(page, 2), 'フォーカスが外れても歩き続けている').toEqual([3, 3]);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('Shift');
  });

  test('⑥ 走っている間だけ #char-player に .dashing が付く', async ({ page }) => {
    await open(page, 2, 1, BOOTS);
    const cls = () => page.evaluate(() => document.getElementById('char-player')?.classList.contains('dashing'));
    await page.keyboard.down('ArrowRight');
    await stepXs(page, 1);
    expect(await cls(), '普通に歩いている').toBe(false);
    await page.keyboard.down('Shift');
    await stepXs(page, 1);
    expect(await cls(), '走っている').toBe(true);
    const dur = await page.evaluate(() => getComputedStyle(document.getElementById('char-player')).transitionDuration);
    expect(dur).toContain('0.12s');
    await page.keyboard.up('Shift');
    await stepXs(page, 1);
    expect(await cls(), 'Shift を離した').toBe(false);
  });

  test('⑦ 画面の端を走って越えても、着いた先の位置は半マス格子の上', async ({ page }) => {
    // 行4の左端（列0）が開いている＝左へ走って隣の画面へ出る
    await open(page, 4, 2, BOOTS);
    const before = await page.evaluate(() => window.__game.getState().stageKey);
    await page.keyboard.down('Shift');
    await page.keyboard.down('ArrowLeft');
    await stepXs(page, 3);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('Shift');
    await page.waitForFunction((b) => window.__game.getState().stageKey !== b, before);
    // 遷移の演出が終わるまで待ってから位置を見る
    await page.waitForTimeout(600);
    const p = await page.evaluate(() => window.__game.getPlayer());
    expect(onGrid(p.x) && onGrid(p.y), `着地 ${p.x},${p.y}`).toBe(true);
  });
});
