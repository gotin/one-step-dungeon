// @ts-check
// 実行キュー82⑩（2026-10-18・Fable 実装レビュー #16）。
// 存在しない画面へ入ろうとしたら（出口の行き先・笛の行き先の書き間違い）、今の画面に留まる。
// 直す前＝`enterStage` は `currentLayer／stageKey` を先に書き換えてから「見つからない」に気づいていた
// ＝層と画面の名前だけが進み、盤面（stageData）は null＝次の一歩で例外になり、セーブも別の画面の名前で書かれた。
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';

test('存在しない画面への enterStage は、今の画面と盤面をそのまま残す', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${GAME_URL}?fromEditor=1&layer=dungeon_4&stage=3,3&row=2&col=1`);
  await waitForBoard(page);
  const r = await page.evaluate(() => {
    const g = window.__game;
    g.pause();
    g.enterStage('field', '99,99', 1, 1);
    const s = g.getState();
    const x0 = g.getPlayer().x;
    for (let i = 0; i < 2; i++) { g.movePlayer('right'); g.step(1); }
    return { layer: s.currentLayer, key: s.stageKey, moved: g.getPlayer().x - x0 };
  });
  expect([r.layer, r.key], '画面の名前だけが進んだ').toEqual(['dungeon_4', '3,3']);
  expect(r.moved, '盤面が壊れて動けない').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
