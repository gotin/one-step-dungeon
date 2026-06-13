import { test, expect } from '@playwright/test';
import { gotoFreshGame } from './helpers.js';

// Phase 0-0 VRT（ビジュアル回帰テスト）
// ゲーム起動直後の画面をスクリーンショットで保存し、
// リファクタ前後でピクセル差分が出ないことを確認する。
// 初回実行時に基準画像（*.png-snapshots/）が自動生成される。
// 以降は差分が検出された場合にテストが失敗する。

test.describe('Blade of Lumia – VRT', () => {
  test('ゲーム起動直後の画面が変化していない', async ({ page }) => {
    await gotoFreshGame(page);

    // ボードが安定するまで少し待つ（スプライト描画が完了するタイミング）
    await page.waitForTimeout(500);

    // ページ全体のスクリーンショットを基準画像と比較
    // 初回実行時は基準画像を自動生成する（--update-snapshots フラグで更新可能）
    await expect(page).toHaveScreenshot('game-start.png', {
      // フォントレンダリングやサブピクセルの差異を許容
      maxDiffPixelRatio: 0.01,
    });
  });
});
