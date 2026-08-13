import { test, expect } from '@playwright/test';
import {
  gotoFreshGame, getPlayerPixelPos, readSave, holdKey,
  waitForBoard, GAME_URL, SAVE_KEY,
} from './helpers.js';

// Phase 0-0 スモーク（続き）：移動・セーブ/ロード
// 決定論的ループ（0-1）導入前なので、実時間 tick(120ms) を待って DOM/localStorage を観測する方式。

test.describe('Blade of Lumia – 移動', () => {
  test('方向キーでプレイヤーが移動する（座標が変化する）', async ({ page }) => {
    await gotoFreshGame(page);

    const before = await getPlayerPixelPos(page);
    expect(before, 'プレイヤー要素が存在すること').not.toBeNull();

    // 開始位置によっては特定方向が壁の可能性があるため、4方向を順に試し
    // 「いずれかの方向で座標が変わる」ことを確認する（＝移動操作が機能している）。
    const dirs = /** @type {const} */ (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']);
    let moved = false;
    let last = before;
    for (const key of dirs) {
      await holdKey(page, key, 400);
      const pos = await getPlayerPixelPos(page);
      if (pos && (pos.left !== last.left || pos.top !== last.top)) {
        moved = true;
        break;
      }
      last = pos ?? last;
    }
    expect(moved, '少なくとも1方向でプレイヤーが移動すること').toBe(true);
  });
});

test.describe('Blade of Lumia – セーブ / ロード', () => {
  // 注意：このゲームは「単純な移動だけ」ではセーブしない（アイテム取得・ステージ遷移・
  // ボス撃破などイベント時のみ saveGame() が走る仕様）。
  // ここでは loadGame()（タイトルの「続きから」による復元）経路がデグレしていないことを検証する。
  // テスト側で有効なセーブを localStorage に直接書き込み、リロード→続きから で
  // その値が保持・復元されることを確認する。

  test('続きからでセーブされた位置が復元される', async ({ page }) => {
    // 既知の固定セーブを seed する。タイトルで「続きから」が出る条件は
    // init() が hasSave && stageKey を満たすこと → currentLayer/stageKey が必須。
    // 開始ステージはマップの startPos（field / "1,0"）に合わせる。
    const SEED_X = 2;
    const SEED_Y = 3;
    await page.addInitScript(({ key, x, y }) => {
      const data = {
        player: {
          x, y,
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
    }, { key: SAVE_KEY, x: SEED_X, y: SEED_Y });

    await page.goto(GAME_URL);

    // セーブがあるのでタイトルが出る → 「続きから」で復元
    const continueBtn = page.locator('#btn-continue');
    await continueBtn.waitFor({ state: 'visible' });
    await continueBtn.click();

    await waitForBoard(page);
    await expect(page.locator('#char-player')).toBeVisible();

    // 復元された player 座標が seed と一致すること（loadGame の正常動作）
    const restored = await readSave(page);
    expect(restored, 'セーブが読めること').not.toBeNull();
    expect(restored.player.x).toBe(SEED_X);
    expect(restored.player.y).toBe(SEED_Y);
  });
});
