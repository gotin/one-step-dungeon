// tests/stone-lock.spec.js — Phase 4.56: 石ロック（全ボタンON→ゲート開いたら石を固定）
//
// 背景：全ボタンONでゲートが開いた後、石を1個どかしてから別ステージへ移動すると
// enterStage の allSolved 判定が false になり石位置がリセットされ、一度クリアした
// パズルを解き直す羽目になっていた（4.55 完了後にユーザーが発案）。
// 対策＝崩れること自体を起こさせない：refreshGates() が「全ボタンON→全ゲート開」を
// 確定した瞬間に stonesLocked を立て、以後 movePlayer は石検出そのものを行わない
// （石は壁と同じ通行不可のまま＝押せない）。
//
// 利用マップ：field "10,13"（山地/沼M・9-6-⑦の予告編）。石(3,4)をボタン(6,4)へ
// 押し込むと連動ゲート(4,7)が開く（既存 mountain-stone-gate.spec.js と同じ配置）。
// 単一ボタンだが「1ステージの全ボタン S が ON」条件はこの1個で満たされるため
// ロック検証に使える。

import { test, expect } from '@playwright/test';
import { waitForBoard, GAME_URL, SAVE_KEY } from './helpers.js';

async function seedOnM(page, stageKey, px, py, heroDir) {
  await page.addInitScript(({ key, value }) => {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
  }, {
    key: SAVE_KEY,
    value: JSON.stringify({
      player: {
        x: px, y: py,
        hp: 6, maxHp: 6, maxHearts: 3, atk: 2, def: 0, keys: 0,
        weapon: 'sword', shield: null, armor: null,
        subItems: {}, activeSubItem: null, rupees: 0, triforceCount: 0,
      },
      stageState: {},
      currentLayer: 'field',
      stageKey,
      heroDir,
    }),
  });
  await page.goto(GAME_URL);
  const cont = page.locator('#btn-continue');
  await cont.waitFor({ state: 'visible', timeout: 5000 });
  await cont.click();
  await waitForBoard(page);
}

test.describe('Phase 4.56 – 石ロック（全ボタンON後は崩せない）', () => {
  test('全ボタンONの瞬間にロックが立ち、以後石を押そうとしても動かない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    // stand just ABOVE the stone at (3,4): player at (x=4,y=2), face DOWN.
    await seedOnM(page, '10,13', 4, 2, 'down');

    // push the stone down onto the button (real input path: hold DOWN).
    await page.evaluate(() => window.__game.queueInput('down'));
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__game.releaseInput('down'));
    await page.waitForTimeout(300);

    let ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.switchStates['6,4'], 'ボタン 6,4 が ON').toBe(true);
    expect(ss.openGates, 'ゲート 4,7 が開く').toContain('4,7');
    expect(ss.stonesLocked, '全ボタンON達成でロックが立つ').toBe(true);

    // try to push the (now locked) stone further down — nothing should move.
    const before = await page.evaluate(() => window.__game.getState().player);
    await page.evaluate(() => window.__game.queueInput('down'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__game.releaseInput('down'));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.__game.getState().player);
    expect(after.y, 'ロック済みの石はプレイヤーを進ませない（壁と同じ通行不可）').toBe(before.y);

    ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.stonePositions['3,4'], '石の位置は変わらない').toEqual({ r: 6, c: 4 });
    expect(ss.switchStates['6,4'], 'ボタンは ON のまま').toBe(true);
    expect(ss.openGates, 'ゲートは開いたまま').toContain('4,7');

    expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('ロック後にステージを往復しても石位置・ゲート開が維持される', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await seedOnM(page, '10,13', 4, 2, 'down');

    await page.evaluate(() => window.__game.queueInput('down'));
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__game.releaseInput('down'));
    await page.waitForTimeout(300);

    let ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.stonesLocked).toBe(true);
    expect(ss.openGates).toContain('4,7');

    // move to the open lane (col5,6 at row9) then cross south into 10,14, then back.
    await page.evaluate(() => window.__game.setHeroDir('right'));
    for (let i = 0; i < 2; i++) await page.evaluate(() => window.__game.movePlayer('right'));

    await page.evaluate(() => window.__game.setHeroDir('down'));
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.__game.movePlayer('down'));
      await page.waitForTimeout(20);
      const st = await page.evaluate(() => window.__game.getState());
      if (st.stageKey !== '10,13') break;
    }
    await page.waitForTimeout(200);
    let st = await page.evaluate(() => window.__game.getState());
    expect(st.stageKey, '南のステージへ遷移した').not.toBe('10,13');

    // walk back north into 10,13.
    await page.evaluate(() => window.__game.setHeroDir('up'));
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.__game.movePlayer('up'));
      await page.waitForTimeout(20);
      const s2 = await page.evaluate(() => window.__game.getState());
      if (s2.stageKey === '10,13') break;
    }
    await page.waitForTimeout(200);
    st = await page.evaluate(() => window.__game.getState());
    expect(st.stageKey, '10,13 へ戻った').toBe('10,13');

    ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.stonesLocked, '往復後もロックは維持される').toBe(true);
    expect(ss.stonePositions['3,4'], '石の位置は往復後も変わらない').toEqual({ r: 6, c: 4 });
    expect(ss.switchStates['6,4'], 'ボタンは往復後も ON のまま').toBe(true);
    expect(ss.openGates, '往復後もゲートは開いたまま').toContain('4,7');

    expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
  });
});
