// tests/editor.spec.js – Editor smoke tests
// エディタの最小動作確認：起動・タイル配置・JSONエクスポート・スプライトエディタ
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

// ─── ⑤ スプライトエディタ：タブ表示 + キャンバス描画 ──────────
test('editor: sprite tab shows canvas and palette', async ({ page }) => {
	const errors = [];
	page.on('pageerror', e => errors.push(e.message));
	page.on('console', msg => {
		if (msg.type() === 'error') errors.push(msg.text());
	});

	await page.goto(EDITOR_URL);
	await page.waitForSelector('#world-grid', { state: 'visible' });

	// スプライトタブをクリック
	await page.locator('#tab-sprite').click();
	await expect(page.locator('#view-sprite')).not.toHaveClass(/hidden/);
	await expect(page.locator('#tab-sprite')).toHaveClass(/active/);

	// 描画キャンバスとパレットが表示される
	await expect(page.locator('#sprite-canvas')).toBeVisible();
	const swatchCount = await page.locator('#sprite-palette .sprite-swatch').count();
	expect(swatchCount).toBeGreaterThan(0);

	expect(errors).toEqual([]);
});

// ─── ⑥ スプライトエディタ：既存読込 → エクスポートコード生成 ──
test('editor: sprite load existing then export valid code', async ({ page }) => {
	await page.goto(EDITOR_URL);
	await page.waitForSelector('#world-grid', { state: 'visible' });
	await page.locator('#tab-sprite').click();

	// heroD を読み込む
	await page.locator('#sprite-load-name').selectOption('heroD');
	await page.locator('#sprite-load-pal').selectOption('hero');
	await page.locator('#sprite-load-btn').click();

	// 32×32 が読み込まれてサイズラベルに反映
	await expect(page.locator('#sprite-size-label')).toHaveText('32 × 32');

	// エクスポートコード生成
	await page.locator('#sprite-export-btn').click();
	const code = await page.locator('#sprite-export-out').inputValue();
	expect(code).toContain('SPRITES.');
	expect(code).toContain('[');
	// 配列形式の行が含まれること
	expect(code.length).toBeGreaterThan(100);
});

// ─── ⑦ スプライト選択でパレットが自動連動する ──────────────
test('editor: selecting a sprite auto-syncs the palette', async ({ page }) => {
	await page.goto(EDITOR_URL);
	await page.waitForSelector('#world-grid', { state: 'visible' });
	await page.locator('#tab-sprite').click();

	// 初期：heroD → hero に自動連動
	await expect(page.locator('#sprite-load-name')).toHaveValue('heroD');
	await expect(page.locator('#sprite-load-pal')).toHaveValue('hero');

	// patrol（敵）に変更 → パレットも patrol に連動
	await page.locator('#sprite-load-name').selectOption('patrol');
	await expect(page.locator('#sprite-load-pal')).toHaveValue('patrol');

	// heroR に変更 → 最長プレフィックス一致で hero に連動
	await page.locator('#sprite-load-name').selectOption('heroR');
	await expect(page.locator('#sprite-load-pal')).toHaveValue('hero');
});

// ─── ⑧ プレビュー設定「はしご」が iframe URL に ps_ladder=1 として渡る（Phase 4-1c bug③ 回帰）──
// canvas クリック経由のプレビュー起動ハンドラ（editor.js）が ps.ladder を取りこぼし、
// ps_ladder=0 になっていた不具合の回帰テスト。
test('editor: ps-ladder checkbox reaches preview iframe as ps_ladder=1', async ({ page }) => {
	await page.goto(EDITOR_URL);
	await page.waitForSelector('#world-grid .cell-empty', { state: 'visible' });

	// ステージを作成 → 編集ビューへ
	await page.locator('#world-grid .cell-empty').first().click();
	await page.locator('#btn-edit-stage').click();
	await expect(page.locator('#view-stage')).not.toHaveClass(/hidden/);

	// プレビュー開始 → 「クリックで開始」モードになる
	await page.locator('#btn-preview').click();
	// キャンバスをクリックして位置確定 → プレビュー設定ダイアログが開く
	await page.locator('#stage-canvas').click({ position: { x: 30, y: 30 } });
	await expect(page.locator('#preview-settings-overlay')).not.toHaveClass(/hidden/);

	// はしごチェック（デフォルト ON だが明示的に確認）→ 開始
	await page.locator('#ps-ladder').check();
	await page.locator('#ps-btn-start').click();

	// iframe の src に ps_ladder=1 が含まれる
	// （openPreview は about:blank → requestAnimationFrame で実URLに差し替えるので待つ）
	await expect.poll(
		() => page.locator('#preview-frame').getAttribute('src'),
		{ timeout: 3000 },
	).toContain('ps_ladder=1');
});
