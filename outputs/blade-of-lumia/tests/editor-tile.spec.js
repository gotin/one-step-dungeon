// ── editor-tile.spec.js ── タイルバリエーション設計支援のスモークテスト ──
import { test, expect } from '@playwright/test';

test.describe('editor: tile tab', () => {

	test('tile tab shows theme selector and tile grid', async ({ page }) => {
		const jsErrors = [];
		page.on('pageerror', err => jsErrors.push(err.message));
		page.on('console', msg => {
			if (msg.type() === 'error') jsErrors.push(msg.text());
		});

		await page.goto('http://localhost:18080/blade-of-lumia/editor/');
		await page.waitForLoadState('networkidle');

		const tabTile = page.locator('#tab-tile');
		await expect(tabTile).toBeVisible();
		await tabTile.click();

		const viewTile = page.locator('#view-tile');
		await expect(viewTile).not.toHaveClass(/hidden/);

		// テーマセレクトが存在し複数オプションを持つ
		const themeSelect = page.locator('#tile-theme-select');
		await expect(themeSelect).toBeVisible();
		const optCount = await themeSelect.locator('option').count();
		expect(optCount).toBeGreaterThan(1);

		// タイルプレビューグリッドに複数のプレビューアイテムが表示されている
		const previewItems = page.locator('.tile-preview-item');
		await expect(previewItems.first()).toBeVisible();
		const itemCount = await previewItems.count();
		expect(itemCount).toBeGreaterThan(3);

		// エクスポートコードのテキストエリアが存在する
		const exportTextarea = page.locator('#tile-export-code');
		await expect(exportTextarea).toBeVisible();

		expect(jsErrors).toEqual([]);
	});

	test('tile: can select tile and see palette editor', async ({ page }) => {
		const jsErrors = [];
		page.on('pageerror', err => jsErrors.push(err.message));
		page.on('console', msg => {
			if (msg.type() === 'error') jsErrors.push(msg.text());
		});

		await page.goto('http://localhost:18080/blade-of-lumia/editor/');
		await page.waitForLoadState('networkidle');

		await page.locator('#tab-tile').click();

		// 最初のタイルをクリック
		const firstTile = page.locator('.tile-preview-item').first();
		await firstTile.click();

		// activeクラスがつく
		await expect(firstTile).toHaveClass(/active/);

		// パレットパネルにスウォッチが表示される
		const swatches = page.locator('.tile-swatch');
		await expect(swatches.first()).toBeVisible();
		const swatchCount = await swatches.count();
		expect(swatchCount).toBeGreaterThan(1);

		// 大型プレビューキャンバスが表示される
		const largePrev = page.locator('.tile-large-preview');
		await expect(largePrev).toBeVisible();

		// リセットボタンが存在する
		const btnReset = page.locator('button:has-text("テーマ初期値に戻す")');
		await expect(btnReset).toBeVisible();

		expect(jsErrors).toEqual([]);
	});

	test('tile: can switch theme and export code reflects theme name', async ({ page }) => {
		const jsErrors = [];
		page.on('pageerror', err => jsErrors.push(err.message));
		page.on('console', msg => {
			if (msg.type() === 'error') jsErrors.push(msg.text());
		});

		await page.goto('http://localhost:18080/blade-of-lumia/editor/');
		await page.waitForLoadState('networkidle');

		await page.locator('#tab-tile').click();

		// 炎テーマに切り替え
		const themeSelect = page.locator('#tile-theme-select');
		await themeSelect.selectOption('fire');

		// タイルグリッドが更新されている
		const previewItems = page.locator('.tile-preview-item');
		await expect(previewItems.first()).toBeVisible();

		// エクスポートコードに炎テーマの文言が含まれる
		const exportTextarea = page.locator('#tile-export-code');
		const code = await exportTextarea.inputValue();
		expect(code).toContain('炎');

		expect(jsErrors).toEqual([]);
	});

});
