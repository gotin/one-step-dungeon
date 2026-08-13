import { test, expect } from '@playwright/test';
import { waitForBoard, GAME_URL, SAVE_KEY } from './helpers.js';

// 石押しのリグレッション防止テスト。
// ユーザー指定の2条件を「実際の入力経路（キー押しっぱなし）」で検証する：
//   条件1: 石の大きさは移動前後で変わらない
//   条件2: プレイヤーは石を動かしたあとも、その先に障害物がない限り継続して動かせる
//
// 重要: 実機の入力は「キー押しっぱなし → 毎tick(120ms) processHeldKeys → movePlayer」。
// なので queueInput で押下状態にし、実ループ（setInterval）を waitForTimeout で
// 回して観測する（movePlayer を手動で1回ずつ呼ぶのは実機を再現していない）。
//
// 利用マップ：field "12,2" の (r=2, c=7) に石。左に床が続く。
// プレイヤーを石の左隣 (x=6,y=2) に置き、右(→)を押しっぱなしにする。

test.describe('Blade of Lumia – 石押し', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ key }) => {
      const data = {
        player: {
          x: 6, y: 2,
          hp: 6, maxHp: 6, maxHearts: 3, atk: 2, def: 0, keys: 0,
          weapon: null, shield: null, armor: null,
          subItems: {}, activeSubItem: null, rupees: 0, triforceCount: 0,
        },
        stageState: {},
        currentLayer: 'field',
        stageKey: '12,2',
        heroDir: 'right',
      };
      localStorage.setItem(key, JSON.stringify(data));
    }, { key: SAVE_KEY });

    await page.goto(GAME_URL);
    const continueBtn = page.locator('#btn-continue');
    await continueBtn.waitFor({ state: 'visible' });
    await continueBtn.click();
    await waitForBoard(page);
  });

  // 移動した石キャンバスの実描画サイズ(px)を返す。なければ null。
  const stoneSize = (page) => page.evaluate(() => {
    const div = document.querySelector('[id^="char-stone-"]');
    if (!div) return null;
    const cv = div.querySelector('canvas');
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });

  const getX = (page) => page.evaluate(() => window.__game.getState().player.x);

  test('条件2: 右を押しっぱなしで石を連続して押せる（複数セル前進）', async ({ page }) => {
    const startX = await getX(page);

    // 右キーを押しっぱなしにして実ループを十分に回す（クールダウン600ms×複数回ぶん）
    await page.evaluate(() => window.__game.queueInput('right'));
    await page.waitForTimeout(2500); // 600ms CD で理論上3〜4回押せる時間
    await page.evaluate(() => window.__game.releaseInput('right'));
    await page.waitForTimeout(300);

    const endX = await getX(page);
    // 石を継続して押せていれば、開始から2セル以上は前進しているはず
    expect(endX - startX, '押しっぱなしで石を継続して押し、2セル以上前進すること').toBeGreaterThanOrEqual(2);
  });

  test('条件1: 石の大きさは移動の前後で変わらない', async ({ page }) => {
    // 1回押して石を1セル動かす
    await page.evaluate(() => window.__game.queueInput('right'));
    await page.waitForTimeout(800);
    const size1 = await stoneSize(page);
    expect(size1, '移動した石の要素が存在すること').not.toBeNull();

    // さらに押して2セル目へ
    await page.waitForTimeout(800);
    const size2 = await stoneSize(page);
    await page.evaluate(() => window.__game.releaseInput('right'));
    expect(size2, '2回目移動後も石の要素が存在すること').not.toBeNull();

    // サイズが変わっていないこと（±1px の誤差は許容）
    expect(Math.abs(size2.w - size1.w), `石の幅が変化しない (1回目=${size1.w} 2回目=${size2.w})`).toBeLessThanOrEqual(1);
    expect(Math.abs(size2.h - size1.h), `石の高さが変化しない (1回目=${size1.h} 2回目=${size2.h})`).toBeLessThanOrEqual(1);

    // 移動した石は1個だけ（重複描画されない）
    const count = await page.evaluate(() =>
      document.querySelectorAll('[id^="char-stone-"]').length);
    expect(count, '移動した石の要素は1つだけ').toBe(1);
  });

  // Phase 4.55 バグ(B) 回帰＝押し方向と直交する軸が 0.5 セルずれた位置から石へ
  // 向かったとき、石にめり込んで凍結せず、直交軸をスナップして押せること。
  // 旧「x/y 両方整数」ガードでは y=2.5 で右押し＝押しも通常移動もできず凍結していた。
  test('バグ(B): 直交軸が0.5ずれた位置(y=2.5)から石へ向かうとスナップして押せる', async ({ page }) => {
    // まず縦に半セルだけ動かして y=2.5 を作る（石(2,7)に対し押し軸x=6は整数・直交軸yが半セルずれ）
    await page.evaluate(() => window.__game.movePlayer('down'));
    const mid = await page.evaluate(() => window.__game.getState().player);
    expect(mid.y, '0.5セルの直交ずれを作れている(y=2.5)').toBe(2.5);

    // 右を押しっぱなし＝実入力経路（processHeldKeys）で観測する
    await page.evaluate(() => window.__game.queueInput('right'));
    await page.waitForTimeout(1400); // スナップ＋押し（CD 600ms×2回ぶん）
    await page.evaluate(() => window.__game.releaseInput('right'));
    await page.waitForTimeout(300);

    const end = await page.evaluate(() => ({
      p: window.__game.getState().player,
      ss: window.__game.getStageState(),
    }));
    // 直交軸(y)が整数セルにスナップされている（半セルで凍結していない）
    expect(Number.isInteger(end.p.y), 'y が整数にスナップされている(凍結でない)').toBe(true);
    // 石が実際に押されて元位置(2,7)から移動している
    const moved = Object.values(end.ss.stonePositions ?? {}).some(s => s.c > 7 && s.r === 2);
    expect(moved, '石(2,7)が右へ押されている').toBe(true);
    // プレイヤーも前進している（凍結なら x=6 のまま）
    expect(end.p.x, 'プレイヤーが石を押して前進している').toBeGreaterThan(6);
  });
});
