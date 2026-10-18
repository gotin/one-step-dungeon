// @ts-check
// 実行キュー82③（2026-10-18・Fable 実装レビュー #4）。
// 飛んだまま画面の端を越えて、着いたセルが「飛んで越えられるが歩いては立てない物」（木・茂み・柵・閉じた潮門）
// なら、飛んだまま留まる（降りない）。降りるのは歩いて立てるセルに着いたときだけ＝画面の中で F を押して
// 降りるとき（player.js toggleFlight の「ここには 降りられない！」）と同じ基準。
// 直す前＝`enterStage` は「空・水・溶岩以外なら降ろす」だった＝木の上に着くと降ろされ、木の中に立って
// 4方向とも歩けなかった（F で飛び直せば抜けられるが、気づかないと詰んだように見える）。
// 実マップで画面端の木・茂み・柵・潮門は 1,394 セル（2026-10-18 数えた）＝森の帯を飛ぶとよく踏む。
//   ① 木の上に着いた → 飛んだまま・横の木の上へ動ける
//   ② 床の上に着いた → 今までどおり自動で降りる
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';

const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
const FIELD = MAP.layers.field.stages;

// field 7,15 の北端から 7,14 の南端（row 9）へ飛んで入る。
async function flyNorthInto(page, col) {
  await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=7,15&row=1&col=${col}&ps_weapon=1&ps_wingrobe=1`);
  await waitForBoard(page);
  await page.evaluate(() => { window.__game.pause(); window.__game.toggleFlight(); });
  expect(await page.evaluate(() => window.__game.getPlayer().flying), '前提：飛べた').toBe(true);
  // 半マスずつ北へ。境界を越えると 100ms 後に遷移する＝実時間で待つ
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.__game.movePlayer('up'));
    if (await page.evaluate(() => window.__game.getState().isTransitioning)) break;
  }
  await page.waitForFunction(() => window.__game.getState().stageKey === '7,14'
    && !window.__game.getState().isTransitioning, null, { timeout: 3_000 });
}

test('前提：実マップの形（7,15 北端と 7,14 南端の列 0 は木・列 5 は床）', () => {
  expect(FIELD['7,15'].tiles[0][0]).toBe(TILE.TREE);
  expect(FIELD['7,14'].tiles[9][0]).toBe(TILE.TREE);
  expect(FIELD['7,14'].tiles[9][1]).toBe(TILE.TREE);
  expect(FIELD['7,15'].tiles[0][5]).toBe(TILE.FLOOR);
  expect(FIELD['7,14'].tiles[9][5]).toBe(TILE.FLOOR);
});

test('① 木の上に着いたら飛んだまま留まり、横の木の上へ動ける', async ({ page }) => {
  await flyNorthInto(page, 0);
  const at = await page.evaluate(() => {
    const p = window.__game.getPlayer();
    return { x: p.x, y: p.y, flying: p.flying };
  });
  expect(at.y).toBe(9);
  expect(at.x).toBe(0);
  expect(at.flying, '木の上で降ろされた（木の中に立って動けない）').toBe(true);
  const x2 = await page.evaluate(() => {
    for (let i = 0; i < 2; i++) { window.__game.movePlayer('right'); window.__game.step(1); }
    return window.__game.getPlayer().x;
  });
  expect(x2, '横の木の上へ動けない').toBe(1);
});

test('② 床の上に着いたら今までどおり自動で降りる', async ({ page }) => {
  await flyNorthInto(page, 5);
  const at = await page.evaluate(() => ({ y: window.__game.getPlayer().y, flying: window.__game.getPlayer().flying }));
  expect(at.y).toBe(9);
  expect(at.flying, '床の上なのに降りない').toBe(false);
});
