import { test, expect } from '@playwright/test';
import {
  waitForBoard, GAME_URL, SAVE_KEY,
} from './helpers.js';

// Phase 0-0 スモーク：ステージ遷移
// field "7,14"（12×10）の右端を越えると field "8,14" へ遷移することを確認する。
// #hud-stage-label が "[field] 7,14" → "[field] 8,14" に変わることで検証。

test.describe('Blade of Lumia – ステージ遷移', () => {
  test('右端に到達すると隣のステージに遷移する', async ({ page }) => {
    // field "7,14" の右端付近（x=10, y=5）に seed する。
    // cols=12 なので ArrowRight を数回押せば x>=12 を越えて "8,14" へ遷移する。
    await page.addInitScript(({ key }) => {
      const data = {
        player: {
          x: 10, y: 5,
          hp: 6, maxHp: 6, maxHearts: 3, atk: 2, def: 0, keys: 0,
          weapon: null, shield: null, armor: null,
          subItems: {}, activeSubItem: null, rupees: 0, triforceCount: 0,
        },
        stageState: {},
        currentLayer: 'field',
        stageKey: '7,14',
        heroDir: 'down',
      };
      localStorage.setItem(key, JSON.stringify(data));
    }, { key: SAVE_KEY });

    await page.goto(GAME_URL);

    // セーブがあるのでタイトルが出る → 「続きから」で再開
    const continueBtn = page.locator('#btn-continue');
    await continueBtn.waitFor({ state: 'visible' });
    await continueBtn.click();

    await waitForBoard(page);

    // 初期ステージが "7,14" であることを確認
    const labelEl = page.locator('#hud-stage-label');
    await expect(labelEl).toBeVisible();
    await expect(labelEl).toContainText('7,14');

    // ArrowRight を押し続けて右端を越える。
    // 1 tick = 120ms・1セル程度移動。x=10→12 で遷移するので十分な時間を確保。
    await page.keyboard.down('ArrowRight');
    // ステージが "8,14" に変わるまで最大 3 秒待つ
    await expect(labelEl).toContainText('8,14', { timeout: 3000 });
    await page.keyboard.up('ArrowRight');

    // 遷移後もボードが描画されていること（enterStage が正常完了している）
    const board = page.locator('#board');
    await expect(board).toBeVisible();
    await expect(page.locator('#char-player')).toBeVisible();
  });

  // ── 壁すり抜け防止（arrival-wall）────────────────────────────────
  // engine の checkStageTransition は「隣ステージが在れば無条件で移動」する仕様
  // だったため、開いた辺の対岸が壁（山/水/#等）だと壁の中にめり込み → そこから
  // 隣の床へ動けて「すり抜けた」ように見えるバグがあった。着地 footprint が壁なら
  // 遷移をキャンセルして出ようとした方向にだけ押し戻す修正を回帰固定する。
  // 例：field 13,2 の (0,11) から右へ出ると 14,2 の (0,0)=山 'M' に着地する。
  function previewUrl({ stage, row, col }) {
    const p = new URLSearchParams({
      fromEditor: '1', layer: 'field', stage,
      row: String(row), col: String(col), ps_weapon: '1',
    });
    return `${GAME_URL}?${p.toString()}`;
  }
  const stageKeyNow = (page) => page.evaluate(() => window.__game.getState().stageKey);

  test('壁に面した端は遷移せず留まる（山すり抜け防止・13,2→14,2)', async ({ page }) => {
    await page.goto(previewUrl({ stage: '13,2', row: 0, col: 11 }));
    await waitForBoard(page);
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.__game.movePlayer('right'));
      await page.waitForTimeout(50);
    }
    expect(await stageKeyNow(page)).toBe('13,2'); // 山 14,2 に入っていない
  });

  test('壁に面した端は遷移せず留まる（壁すり抜け防止・13,2→13,1)', async ({ page }) => {
    // 13,1 の下端 row9 は '#####..#####' なので col0 は壁 '#'。
    await page.goto(previewUrl({ stage: '13,2', row: 0, col: 0 }));
    await waitForBoard(page);
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.__game.movePlayer('up'));
      await page.waitForTimeout(50);
    }
    expect(await stageKeyNow(page)).toBe('13,2');
  });

  test('開いた辺（床）は従来どおり正常遷移する（13,2 col5→13,1)', async ({ page }) => {
    // 13,1 の row9 col5 は '.'（'#####..#####' の隙間）＝正当な開口。
    await page.goto(previewUrl({ stage: '13,2', row: 0, col: 5 }));
    await waitForBoard(page);
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.__game.movePlayer('up'));
      await page.waitForTimeout(50);
    }
    expect(await stageKeyNow(page)).toBe('13,1');
  });
});
