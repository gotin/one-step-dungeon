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
  await dismissIntroDialog(page);
  // 老賢者の話を読み終えると目的地マーク（草原の洞窟）が付く＝仕様どおり。だがこのヘルパーを使う
  // テストは「印が1つも無い新規状態」を前提に書かれている∴ここで空に戻す。
  // 開始の会話で印が付くこと自体は tests/q21-pass2.spec.js ① が縛る。
  await page.evaluate(() => {
    const p = window.__game.getPlayer();
    p.mapMarks = [];
    p.selectedMarkId = null;
    window.__game.updateHud();
  });
}

/**
 * 「はじめから」の直後に老賢者が話しかけてくる会話（キュー21 F2）を最後まで送って閉じる。
 * 会話中はゲームループが止まる＝閉じないと移動・tick を見るテストが進まない。
 * @param {import('@playwright/test').Page} page
 */
export async function dismissIntroDialog(page) {
  for (let i = 0; i < 30; i++) {
    const open = await page.evaluate(() => {
      const el = document.getElementById('dialog-overlay');
      return !!el && !el.classList.contains('hidden');
    });
    if (!open) return;
    await page.keyboard.press('Space');
  }
}

/**
 * 実時間ループ（game.js startGameLoop = setInterval(() => step(1), TICK_MS)）を
 * **ページの評価前に**差し止める。以降の goto すべてに効く（1ページ1回でよい）。
 *
 * ⚠ 起動後に `__game.pause()` を呼ぶのでは遅い（キュー53・2026-10-13 実測）：
 *   goto → waitForBoard → evaluate の間にも実ループは回っており、並列負荷が高いと
 *   止める前に 1〜5 tick 進む（地中蟲の潜伏周期が1 tick 前にずれる／ψ の位相が変わる）。
 *   単独では 0 tick で済むので、フルテストでだけ赤になる。
 *   ∴ step(n) の tick 番号で周期・間合いを測るテストは、これで開始時刻を gameTime=0 に固定する。
 *
 * 差し止めが効いたことは `expectLoopFrozen` で確かめる（game.js のループの形が変わったら赤）。
 * @param {import('@playwright/test').Page} page
 */
export async function freezeGameLoop(page) {
  await page.addInitScript(() => {
    const native = window.setInterval;
    window.__loopBlocked = 0;
    window.setInterval = function (fn, ms, ...rest) {
      if (/step\s*\(\s*1\s*\)/.test(String(fn))) { window.__loopBlocked++; return 0; }
      return native.call(window, fn, ms, ...rest);
    };
  });
}

/**
 * `freezeGameLoop` が効いていて、論理時間が 1 tick も進んでいないことを確かめる。
 * @param {import('@playwright/test').Page} page
 */
export async function expectLoopFrozen(page) {
  const s = await page.evaluate(() => ({
    blocked: window.__loopBlocked ?? 0,
    gameTime: window.__game.getState().gameTime,
  }));
  if (!(s.blocked > 0)) {
    throw new Error('実時間ループの差し止めが効いていない（freezeGameLoop の呼び忘れか、game.js startGameLoop の形が変わった）');
  }
  if (s.gameTime !== 0) {
    throw new Error(`測定の前に論理時間が進んでいる（gameTime=${s.gameTime}）`);
  }
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

// ── 宝箱を開けるテスト用の素の部屋（2026-11-08・キュー95 の13室目）─────────────
// 宝箱の受け口（中身の形・文の頭の絵）を測る本は、実マップの「素の部屋」を借りていた
// （dungeon_7 2,4 → dungeon_6 2,4 → dungeon_6 4,4）。素の部屋は作り込みの対象＝借りるたびに
// 作り替えで壊れた∴盤面ごと `page.route` でマップ応答へ差し込み、実マップから切り離す。
// 部屋＝四角い広間・宝箱 (2,5)・敵なし・口は西（行4-5）。宝箱の真下 2 マス (4,5) から上へ歩けば開く。
export const PLAIN_CHEST_ROOM = {
  layer: 'dungeon_6', stage: '4,4', chest: '2,5', r: 2, c: 5,
  tiles: [
    '############',
    '#..........#',
    '#....B.....#',
    '#..........#',
    '...........#',
    '...........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '############',
  ],
};

/**
 * マップ応答の PLAIN_CHEST_ROOM の部屋を素の広間に差し替える（宝箱の中身は content・null なら空箱）。
 * ⚠️ `route.fetch()` で取りに行かない＝全体実行の負荷下で巨大な JSON の取得が `socket hang up` で
 *    落ちた（2026-09-30）。呼び手がディスクから読んだマップ（map）の複製を返す。
 */
export async function routePlainChestRoom(page, map, content) {
  await page.route('**/work/blade-of-lumia.json', async (route) => {
    const json = structuredClone(map);
    const R = PLAIN_CHEST_ROOM;
    const sd = json.layers[R.layer].stages[R.stage];
    sd.tiles = R.tiles.map((row) => [...row]);
    sd.bgTiles = {};
    sd.chestContents = content ? { [R.chest]: content } : {};
    sd.showConditions = {};
    sd.signData = {};
    sd.initLitTorches = [];
    sd.breakableWalls = {};
    sd.floorItems = {};
    delete sd.enemyChase;
    delete sd.enemiesRespawn;
    delete sd.enemyHold;
    await route.fulfill({ json });
  });
}
