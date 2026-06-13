import { test, expect } from '@playwright/test';
import { gotoFreshGame } from './helpers.js';

// Phase 0-1 決定論的ゲームループのテスト
// window.__game の step() / getState() を使い、実時間を待たずに
// フレーム単位で世界を進めて状態を検証する。

test.describe('Blade of Lumia – 決定論的ループ（__game フック）', () => {
  test('__game フックが公開されている', async ({ page }) => {
    await gotoFreshGame(page);
    const api = await page.evaluate(() => {
      const g = window.__game;
      if (!g) return null;
      return {
        hasStep: typeof g.step === 'function',
        hasQueueInput: typeof g.queueInput === 'function',
        hasGetState: typeof g.getState === 'function',
      };
    });
    expect(api).not.toBeNull();
    expect(api.hasStep).toBe(true);
    expect(api.hasQueueInput).toBe(true);
    expect(api.hasGetState).toBe(true);
  });

  test('step(n) で論理時間 gameTime が n*TICK_MS だけ進む', async ({ page }) => {
    await gotoFreshGame(page);
    // 駆動装置（setInterval）が走らないよう、step を呼ぶ前後の gameTime 差分だけを見る。
    // setInterval も step を回すため、「差分 >= 期待値」で判定する（厳密一致は避ける）。
    const result = await page.evaluate(() => {
      const before = window.__game.getState().gameTime;
      window.__game.step(10); // 10 フレーム = 1200ms 相当
      const after = window.__game.getState().gameTime;
      return { before, after, delta: after - before };
    });
    // step(10) で最低 10*120=1200 は増える（setInterval の追加分で多少増えてもよい）
    expect(result.delta).toBeGreaterThanOrEqual(1200);
  });

  test('queueInput + step で決定論的にプレイヤーが移動する', async ({ page }) => {
    await gotoFreshGame(page);
    const result = await page.evaluate(() => {
      const g = window.__game;
      const before = g.getState().player;
      // 4方向のうち、移動できる方向を探して入力予約 → step で前進
      const dirs = ['right', 'down', 'left', 'up'];
      let moved = false;
      for (const dir of dirs) {
        const p0 = g.getState().player;
        g.queueInput(dir);
        g.step(5);          // 5 フレーム進める（実時間ゼロ）
        g.releaseInput(dir);
        const p1 = g.getState().player;
        if (p1.x !== p0.x || p1.y !== p0.y) { moved = true; break; }
      }
      const after = g.getState().player;
      return { before, after, moved };
    });
    expect(result.moved, '少なくとも1方向で step による移動が起きること').toBe(true);
  });
});
