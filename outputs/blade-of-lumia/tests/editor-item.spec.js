// ── editor-item.spec.js ── アイテム定義エディタのスモークテスト ───
import { test, expect } from '@playwright/test';

test.describe('editor: item tab', () => {

	test('item tab shows item list and editor', async ({ page }) => {
		const jsErrors = [];
		page.on('pageerror', err => jsErrors.push(err.message));
		page.on('console', msg => {
			if (msg.type() === 'error') jsErrors.push(msg.text());
		});

		await page.goto('http://localhost:18080/blade-of-lumia/editor/');
		await page.waitForLoadState('networkidle');

		// アイテムタブが存在し、クリックできる
		const tabItem = page.locator('#tab-item');
		await expect(tabItem).toBeVisible();
		await tabItem.click();

		// ビューが表示される
		const viewItem = page.locator('#view-item');
		await expect(viewItem).not.toHaveClass(/hidden/);

		// アイテムリストが存在する
		const itemList = page.locator('#item-list');
		await expect(itemList).toBeVisible();

		// 少なくとも1つのアイテムが表示されている
		const itemItems = page.locator('.item-list-item');
		await expect(itemItems.first()).toBeVisible();

		// エクスポートコードのテキストエリアが存在する
		const exportTextarea = page.locator('#item-export-code');
		await expect(exportTextarea).toBeVisible();

		expect(jsErrors).toEqual([]);
	});

	test('item: can select item and see editor form', async ({ page }) => {
		const jsErrors = [];
		page.on('pageerror', err => jsErrors.push(err.message));
		page.on('console', msg => {
			if (msg.type() === 'error') jsErrors.push(msg.text());
		});

		await page.goto('http://localhost:18080/blade-of-lumia/editor/');
		await page.waitForLoadState('networkidle');

		// アイテムタブに移動
		await page.locator('#tab-item').click();

		// 最初のアイテムをクリック
		const firstItem = page.locator('.item-list-item').first();
		await firstItem.click();

		// activeクラスがついている
		await expect(firstItem).toHaveClass(/active/);

		// エディタフォームが表示される
		const editorPanel = page.locator('#item-editor-panel');
		const charForm = editorPanel.locator('.char-form');
		await expect(charForm).toBeVisible();

		// 基本情報の入力欄が存在する
		await expect(page.locator('#item-name')).toBeVisible();
		await expect(page.locator('#item-type')).toBeVisible();

		// 変更適用ボタンが存在する
		await expect(page.locator('#btn-item-apply')).toBeVisible();

		expect(jsErrors).toEqual([]);
	});

	test('item: can edit item name and generate export code', async ({ page }) => {
		const jsErrors = [];
		page.on('pageerror', err => jsErrors.push(err.message));
		page.on('console', msg => {
			if (msg.type() === 'error') jsErrors.push(msg.text());
		});

		await page.goto('http://localhost:18080/blade-of-lumia/editor/');
		await page.waitForLoadState('networkidle');

		// アイテムタブに移動
		await page.locator('#tab-item').click();

		// 最初のアイテムを選択
		await page.locator('.item-list-item').first().click();

		// 名前を変更
		const nameInput = page.locator('#item-name');
		await nameInput.fill('テストアイテム');

		// 変更を適用
		page.once('dialog', dialog => dialog.accept());
		await page.locator('#btn-item-apply').click();

		// エクスポートコードが生成されている
		const exportTextarea = page.locator('#item-export-code');
		const exportCode = await exportTextarea.inputValue();
		expect(exportCode).toContain('ITEM_META');
		expect(exportCode).toContain("'テストアイテム'");

		expect(jsErrors).toEqual([]);
	});

});
