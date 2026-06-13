import { defineConfig, devices } from '@playwright/test';

// Blade of Lumia – Playwright 設定
// このゲームは ESModule + fetch(JSON) で動くため file:// では起動できない。
// 利用技術を Node 系に統一するため、ローカルサーバは Vite を使う。
//
// 普段の手動確認（リポジトリルートで `npx vite outputs --port 18080`）と同じ構成：
//   - サーバルート = outputs/（このファイルから見て ../）
//   - ゲームは http://localhost:18080/blade-of-lumia/game/ で開く
// すでに開発サーバを立てている場合は reuseExistingServer で再利用する。

const PORT = 18080;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // ピクセルアートが滲まないようデバイススケールを固定
    deviceScaleFactor: 1,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // `outputs/` を配信（このファイルの 1 つ上）。手動確認の `vite outputs` と同等。
    command: `npx vite ../ --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/blade-of-lumia/game/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
