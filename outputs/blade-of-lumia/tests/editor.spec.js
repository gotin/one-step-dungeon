// tests/editor.spec.js – Editor smoke tests
// エディタの最小動作確認：起動・タイル配置・JSONエクスポート
import { test, expect } from '@playwright/test';

const EDITOR_URL = '/blade-of-lumia/editor/';

// ─── ① 起動スモーク ──────────────────────────────────────────
test('editor: starts without JS errors and shows world grid', async ({ page }) => {
	const errors = [];
	page.on('pageerror', e => errors.push(e.message));
	page.on('console', msg => {
		if (msg.type() === 'error') errors.push(msg.text());
	});

	await page.goto(EDITOR_URL);
	// ワールドグリッドが描画されるまで待機
	await page.waitForSelector('#world-grid', { state: 'visible' });
	// タイルパレットはステージビューなのでここでは確認不要
	// ワールドタブがアクティブ
	await expect(page.locator('#tab-world')).toHaveClass(/active/);
	// エラーなし
	expect(errors).toEqual([]);
});

// ─── ② ステージ追加（空セルをクリックしてステージが作成されること） ──
test('editor: can create a new stage by clicking empty cell', async ({ page }) => {
	await page.goto(EDITOR_URL);
	await page.waitForSelector('#world-grid .cell-empty', { state: 'visible' });

	// 最初の空セルをクリック
	await page.locator('#world-grid .cell-empty').first().click();

	// クリック後、選択済み（has-stage + selected クラスが付く）
	await expect(page.locator('#world-grid .world-cell.has-stage.selected')).toBeVisible();

	// サイドパネルにステージ情報が表示される
	const infoRowCount = await page.locator('#world-stage-info .info-row').count();
	expect(infoRowCount).toBeGreaterThan(0);
	await expect(page.locator('#world-stage-actions')).not.toHaveClass(/hidden/);
});

// ─── ③ ステージ編集ビューへの遷移（タイルパレット表示確認） ──
test('editor: can open stage edit view and see tile palette', async ({ page }) => {
	await page.goto(EDITOR_URL);
	await page.waitForSelector('#world-grid .cell-empty', { state: 'visible' });

	// ステージを作成して選択
	await page.locator('#world-grid .cell-empty').first().click();
	// 「編集」ボタンをクリック
	await page.locator('#btn-edit-stage').click();

	// ステージ編集ビューが表示される
	await expect(page.locator('#view-stage')).not.toHaveClass(/hidden/);
	await expect(page.locator('#view-world')).toHaveClass(/hidden/);

	// タイルパレットが描画される（ボタンが1つ以上ある）
	await expect(page.locator('#tile-palette .tile-btn').first()).toBeVisible();

	// キャンバスが表示される
	await expect(page.locator('#stage-canvas')).toBeVisible();
});

// ─── ④ JSON エクスポート（buildSaveData が localStorage に保存されること） ──
test('editor: save button stores valid JSON in localStorage', async ({ page }) => {
	// 保存ダイアログが出るので dialog を自動 dismiss
	page.on('dialog', d => d.dismiss());

	await page.goto(EDITOR_URL);
	await page.waitForSelector('#world-grid', { state: 'visible' });

	// 保存ボタンをクリック（File System Access API は未対応なのでフォールバック）
	await page.locator('#btn-save').click();

	// localStorage に保存されているか確認
	const stored = await page.evaluate(() => localStorage.getItem('bladeOfLumiaMapData'));
	expect(stored).toBeTruthy();

	// JSON として valid（パースできる）
	const data = JSON.parse(stored);
	expect(data).toHaveProperty('layers');
	expect(data.layers).toHaveProperty('field');
});
