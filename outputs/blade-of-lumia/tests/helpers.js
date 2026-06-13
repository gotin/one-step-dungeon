// Blade of Lumia – E2E テスト共通ヘルパー
// 入力→待機→状態確認の制御は地味に難しいので、ここに集約して使い回す。

export const GAME_URL = '/blade-of-lumia/game/';
export const SAVE_KEY = 'blade-of-lumia-save';

/**
 * ゲームを新規状態（セーブなし）で開き、ボードが描画されるまで待つ。
 * @param {import('@playwright/test').Page} page
 */
export async function gotoFreshGame(page) {
  // セーブが残っているとタイトルが出るので、開く前に消す
  await page.addInitScript((key) => {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  }, SAVE_KEY);
  await page.goto(GAME_URL);
  await waitForBoard(page);
}

/**
 * ゲームボードにセルが描画される（=起動成功）まで待つ。
 * @param {import('@playwright/test').Page} page
 */
export async function waitForBoard(page) {
  const board = page.locator('#board');
  await board.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const b = document.getElementById('board');
    return !!b && b.children.length > 0;
  });
}

/**
 * プレイヤー要素 (#char-player) の左上座標(px)を返す。未描画なら null。
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{left:number, top:number} | null>}
 */
export function getPlayerPixelPos(page) {
  return page.evaluate(() => {
    const el = document.getElementById('char-player');
    if (!el) return null;
    return { left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0 };
  });
}

/**
 * localStorage のセーブデータ(JSON)を返す。なければ null。
 * @param {import('@playwright/test').Page} page
 */
export function readSave(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, SAVE_KEY);
}

/**
 * 指定方向キーを押しっぱなしにして、tick による移動を進める。
 * @param {import('@playwright/test').Page} page
 * @param {'ArrowUp'|'ArrowDown'|'ArrowLeft'|'ArrowRight'} key
 * @param {number} holdMs 押し続ける時間（ms）。tick は 120ms 間隔。
 */
export async function holdKey(page, key, holdMs = 500) {
  await page.keyboard.down(key);
  await page.waitForTimeout(holdMs);
  await page.keyboard.up(key);
}
