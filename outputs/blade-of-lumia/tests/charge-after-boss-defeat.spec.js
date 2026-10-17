// @ts-check
// 2026-10-17 バグ報告：ボスを倒した後、攻撃ボタンを押さないと動けなくなる（全ボス共通）。
//   原因＝input.js の keyup が「終幕中は離しても溜めを解放しない」で**離したこと自体を捨てていた**
//   ＝演出の後も溜め（charge.js の _chargeStart）が残り、溜め中の足止め（player.js movePlayer）で動けない。
//   直し＝終幕中に離したら、ビームは撃たずに溜めだけ取り消す（cancelCharge）。
//   ① 溜めたまま倒し、演出中に離す → 演出の後は溜めが残らず歩ける・演出中にビームは飛ばない
//   ② 溜めている間にウィンドウのフォーカスが外れたら（keyup が届かない＝スクショの Cmd+Shift+4 など）取り消す
//   ③ 演出の後も押し続けていれば、今までどおり溜めが続く（離せばビーム）
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const URL = '/blade-of-lumia/game/?fromEditor=1&layer=dragon_lair&stage=1,0&row=8&col=1&ps_weapon=1&ps_sword=4&ps_hearts=20';

async function setup(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await waitForBoard(page);
  await page.waitForFunction(() => window.__game.getEnemies().length === 1, null, { timeout: 10_000 });
  return errors;
}

/** 右を向いて攻撃キーを押しっぱなし（溜め）→ 竜を倒して終幕に入るまで待つ。 */
async function chargeAndKill(page) {
  await page.evaluate(() => window.__game.setHeroDir('right'));
  await page.keyboard.down('z');
  await page.waitForFunction(() => window.__game.getState().charging === true, null, { timeout: 5_000 });
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.getEnemies()[0];
    g.dealDamage(e.id, 99999, 'arrow', 0, 0);
  });
  await page.waitForFunction(() => window.__game.getState().bossDefeating === true, null, { timeout: 5_000 });
}

test.describe('ボス撃破後の溜め（2026-10-17 バグ報告）', () => {
  test('① 演出中に攻撃キーを離すと、演出の後は溜めが残らず歩ける（ビームも飛ばない）', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = await setup(page);
    await chargeAndKill(page);
    await page.keyboard.up('z');
    const beamsDuring = await page.evaluate(() => (window.__game.getProjectiles?.() ?? []).length);
    await page.waitForFunction(() => window.__game.getState().bossDefeating === false, null, { timeout: 30_000 });
    expect(beamsDuring, '演出中にビームが飛んだ').toBe(0);
    expect(await page.evaluate(() => window.__game.getState().charging), '演出の後も溜めが残っている').toBe(false);
    const x0 = await page.evaluate(() => window.__game.getPlayer().x);
    await page.evaluate(() => {
      const g = window.__game;
      for (let i = 0; i < 4; i++) { g.movePlayer('right'); g.step(1); }
    });
    const x1 = await page.evaluate(() => window.__game.getPlayer().x);
    expect(x1, '攻撃キーを離しているのに動けない').toBeGreaterThan(x0);
    expect(errors).toEqual([]);
  });

  test('② 溜めている間にウィンドウのフォーカスが外れたら（keyup が届かない）溜めを取り消す', async ({ page }) => {
    const errors = await setup(page);
    await page.evaluate(() => window.__game.setHeroDir('right'));
    await page.keyboard.down('z');
    await page.waitForFunction(() => window.__game.getState().charging === true, null, { timeout: 5_000 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    expect(await page.evaluate(() => window.__game.getState().charging), 'フォーカスが外れても溜めが残る').toBe(false);
    expect(await page.evaluate(() => (window.__game.getProjectiles?.() ?? []).length), '取り消しでビームが飛んだ').toBe(0);
    await page.keyboard.up('z');
    expect(errors).toEqual([]);
  });

  test('③ 演出の後も押し続けていれば溜めは続く（離せば今までどおり）', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = await setup(page);
    await chargeAndKill(page);
    await page.waitForFunction(() => window.__game.getState().bossDefeating === false, null, { timeout: 30_000 });
    expect(await page.evaluate(() => window.__game.getState().charging), '押し続けているのに溜めが消えた').toBe(true);
    await page.keyboard.up('z');
    expect(await page.evaluate(() => window.__game.getState().charging), '離しても溜めが残る').toBe(false);
    expect(errors).toEqual([]);
  });
});
