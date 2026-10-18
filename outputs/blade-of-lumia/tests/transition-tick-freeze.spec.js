// @ts-check
// 実行キュー82④（2026-10-18・Fable 実装レビュー #14）。
// 画面端を越えて遷移が始まった tick の残り（敵・弾・爆弾・炎）は走らない＝遷移の音が鳴った後に被弾しない。
// 直す前＝`gameTick` は先頭で1回だけ `isTransitioning` を見ていた＝`processHeldKeys → movePlayer →
// checkStageTransition` が旗を立てても、同じ tick の `enemyTick`・`projectileTick` は盤外座標の
// プレイヤーに対して走った（HP 1 なら遷移の途中で倒れ、100ms 後の `enterStage` がゲームオーバーの裏で画面を変えた）。
// 観測＝離れた所を飛ぶ敵の弾が、その tick に進むかどうか（当てる形は盤外の座標が絡んで作りにくい＝
// 「世界の残りが走ったか」を直接見る）。
//   ① 遷移が始まった tick には、敵の弾は進まない
//   ② （対照）遷移しない tick なら同じ弾は進む
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';

// field 7,15 の北端（row 0）は列 5 が床・北の 7,14 の南端も床（tests/flight-edge-landing.spec.js と同じ所）
const URL = `${GAME_URL}?fromEditor=1&layer=field&stage=7,15&row=0&col=5&ps_weapon=1`;

async function bulletMove(page, dir) {
  await page.goto(URL);
  await waitForBoard(page);
  return page.evaluate((dir) => {
    const g = window.__game;
    g.pause();
    g.injectEnemyProjectile(2, 5, 1, 0, 2, 1);
    const x0 = g.getProjectiles().find((q) => q.owner === 'enemy').x;
    if (dir) g.queueInput(dir);
    g.step(1);
    const q = g.getProjectiles().find((q) => q.owner === 'enemy');
    return { moved: q ? q.x - x0 : null, transitioning: g.getState().isTransitioning };
  }, dir);
}

test('① 遷移が始まった tick には、敵の弾は進まない', async ({ page }) => {
  const r = await bulletMove(page, 'up');
  expect(r.transitioning, '前提：この tick で遷移が始まった').toBe(true);
  expect(r.moved, '遷移が始まった後も世界が動いた').toBe(0);
});

test('② 対照：遷移しなければ同じ弾は進む', async ({ page }) => {
  const r = await bulletMove(page, null);
  expect(r.transitioning).toBe(false);
  expect(r.moved, '弾が進む形になっていない（①が意味を持たない）').toBeGreaterThan(0);
});
