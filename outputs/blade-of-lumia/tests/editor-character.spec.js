// ── editor-character.spec.js ── キャラクター定義エディタのスモークテスト ───
import { test, expect } from '@playwright/test';

test.describe('editor: character tab', () => {

	test('character tab shows enemy list and editor', async ({ page }) => {
		// JSエラーを監視
		const jsErrors = [];
		page.on('pageerror', err => jsErrors.push(err.message));
		page.on('console', msg => {
			if (msg.type() === 'error') jsErrors.push(msg.text());
		});

		await page.goto('http://localhost:18080/blade-of-lumia/editor/');
		await page.waitForLoadState('networkidle');

		// キャラクタータブをクリック
		const tabCharacter = page.locator('#tab-character');
		await expect(tabCharacter).toBeVisible();
		await tabCharacter.click();

		// ビューが表示される
		const viewCharacter = page.locator('#view-character');
		await expect(viewCharacter).not.toHaveClass(/hidden/);

		// 敵リストが存在する
		const enemyList = page.locator('#char-enemy-list');
		await expect(enemyList).toBeVisible();

		// 少なくとも1つの敵アイテムが表示されている
		const enemyItems = page.locator('.char-enemy-item');
		await expect(enemyItems.first()).toBeVisible();

		// エディタパネルが存在する
		const editorPanel = page.locator('#char-editor-panel');
		await expect(editorPanel).toBeVisible();

		// エクスポートコードのテキストエリアが存在する
		const exportTextarea = page.locator('#char-export-code');
		await expect(exportTextarea).toBeVisible();

		// JSエラーがないことを確認
		expect(jsErrors).toEqual([]);
	});

	test('character: can select enemy and see editor form', async ({ page }) => {
		const jsErrors = [];
		page.on('pageerror', err => jsErrors.push(err.message));
		page.on('console', msg => {
			if (msg.type() === 'error') jsErrors.push(msg.text());
		});

		await page.goto('http://localhost:18080/blade-of-lumia/editor/');
		await page.waitForLoadState('networkidle');

		// キャラクタータブに移動
		await page.locator('#tab-character').click();

		// 最初の敵をクリック
		const firstEnemy = page.locator('.char-enemy-item').first();
		await firstEnemy.click();

		// activeクラスがついている
		await expect(firstEnemy).toHaveClass(/active/);

		// エディタフォームが表示される
		const editorPanel = page.locator('#char-editor-panel');
		const charForm = editorPanel.locator('.char-form');
		await expect(charForm).toBeVisible();

		// 基本情報の入力欄が存在する
		const nameInput = page.locator('#char-name');
		await expect(nameInput).toBeVisible();
		const hpInput = page.locator('#char-hp');
		await expect(hpInput).toBeVisible();
		const atkInput = page.locator('#char-atk');
		await expect(atkInput).toBeVisible();

		// 変更適用ボタンが存在する
		const btnApply = page.locator('#btn-apply-changes');
		await expect(btnApply).toBeVisible();

		// JSエラーがないことを確認
		expect(jsErrors).toEqual([]);
	});

	test('character: can edit enemy stats and generate export code', async ({ page }) => {
		const jsErrors = [];
		page.on('pageerror', err => jsErrors.push(err.message));
		page.on('console', msg => {
			if (msg.type() === 'error') jsErrors.push(msg.text());
		});

		await page.goto('http://localhost:18080/blade-of-lumia/editor/');
		await page.waitForLoadState('networkidle');

		// キャラクタータブに移動
		await page.locator('#tab-character').click();

		// 最初の敵を選択
		await page.locator('.char-enemy-item').first().click();

		// HP値を変更
		const hpInput = page.locator('#char-hp');
		await hpInput.fill('99');

		// 変更を適用
		await page.locator('#btn-apply-changes').click();

		// アラートを処理
		page.once('dialog', dialog => dialog.accept());

		// エクスポートコードが生成されている
		const exportTextarea = page.locator('#char-export-code');
		const exportCode = await exportTextarea.inputValue();
		expect(exportCode).toContain('TILE.');
		expect(exportCode).toContain('"hp": 99');

		// JSエラーがないことを確認
		expect(jsErrors).toEqual([]);
	});

});
