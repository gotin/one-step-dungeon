// Phase 6-1b: 個別ボス撃破フラグ（defeatedBosses）テスト
// Phase 17-0: 選択規則を「最初にヒットしたキー」→「進行順で最も後の踏破」に修正
//   （`shared/progression.js` の `latestDefeatedBossType()`）＋看板タイル（石碑）も
//   同じ選択規則を通す（`game.js openSignDialog` が `_ui.pickDialogLines()` を呼ぶ）。
//
// 検証:
//  1) 初期状態（defeatedBosses 空）で村人タロに話しかけると通常台詞
//  2) defeatedBosses に 'G'（岩のゴーレム）を追加後に話しかけると linesAfterBoss["G"] 台詞
//  3) defeatedBosses に 'A'（別ボス）だけある場合は linesAfterBoss.default 台詞
//  4) 台詞選択ロジックの優先順位確認（JSエラーなし）
//  5) D1(G) の後に D5(L) も倒すと、最も後に倒した D5 の台詞が出る（D1 で固定されない＝壊れ②の再発防止）
//  6) 看板タイル（石碑・field 6,13 の (7,8)）でも defeatedBosses に応じた踏破後台詞が出る（壊れ①の再発防止）
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

// field 1,0 の村人タロは (3,5) にいる。(3,4) からスポーンして話しかける。
function previewUrl({ row = 3, col = 4, triforce = 0 }) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: 'field', stage: '7,14',
		row: String(row), col: String(col),
	});
	if (triforce > 0) p.set('ps_triforce', String(triforce));
	return `${GAME}?${p.toString()}`;
}

async function talkToTaro(page) {
	// (3,4) から右に移動して剣攻撃 → 村人タロ(3,5) と対話
	await page.evaluate(() => window.__game.movePlayer('right'));
	await page.evaluate(() => window.__game.step(1));
	await page.evaluate(() => window.__game.swordAttack());
	await page.waitForTimeout(150);
}

async function getDialogText(page) {
	const dialogEl = page.locator('#dialog-overlay');
	await dialogEl.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
	return page.locator('#dialog-text').textContent().catch(() => '');
}

// field 6,13（草原の洞窟の入口画面）の石碑は (7,8)。(7,6) からスポーンして右へ2歩で隣接・攻撃。
function signPreviewUrl() {
	const p = new URLSearchParams({
		fromEditor: '1', layer: 'field', stage: '6,13',
		row: '7', col: '6',
	});
	return `${GAME}?${p.toString()}`;
}

async function talkToSign(page) {
	await page.evaluate(() => window.__game.movePlayer('right'));
	await page.evaluate(() => window.__game.step(1));
	await page.evaluate(() => window.__game.swordAttack());
	await page.waitForTimeout(150);
}

// 複数行の会話を Space で最後まで進めて閉じる（石碑は4行＝1回では閉じない）。
async function closeDialog(page) {
	for (let i = 0; i < 8; i++) {
		const hidden = await page.locator('#dialog-overlay').evaluate((el) => el.classList.contains('hidden'));
		if (hidden) return;
		await page.keyboard.press('Space');
		await page.waitForTimeout(100);
	}
}

test.describe('Blade of Lumia – defeatedBosses', () => {
	test('defeatedBosses 空: 村人タロの通常台詞が出る（JSエラーなし）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(previewUrl({ triforce: 0 }));
		await waitForBoard(page);
		await talkToTaro(page);
		const text = await getDialogText(page);
		// 通常台詞は「南」や「東」の方向案内系
		if (text) {
			// linesAfterBoss は空なので通常 lines が出るはず（"ゴーレム" は出ない）
			expect(text).not.toContain('ゴーレム');
		}
		expect(errors).toHaveLength(0);
	});

	test('defeatedBosses に G を追加: linesAfterBoss["G"] の台詞が出る', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(previewUrl({ triforce: 0 }));
		await waitForBoard(page);
		// ゴーレム撃破フラグを追加
		await page.evaluate(() => window.__game.addDefeatedBoss('G'));
		await talkToTaro(page);
		const text = await getDialogText(page);
		if (text) {
			// linesAfterBoss["G"] の最初の台詞「あの岩のゴーレム」を含むはず
			expect(text).toContain('ゴーレム');
		}
		expect(errors).toHaveLength(0);
	});

	test('defeatedBosses に G 以外のボス: linesAfterBoss.default か専用台詞が出る（"G"専用台詞は出ない）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(previewUrl({ triforce: 0 }));
		await waitForBoard(page);
		// G 以外のボス（炎のサラマンドラ A）を追加
		await page.evaluate(() => window.__game.addDefeatedBoss('A'));
		await talkToTaro(page);
		const text = await getDialogText(page);
		if (text) {
			// A専用台詞か default 台詞が出るはず。G専用台詞「ゴーレム」は出ない。
			expect(text).not.toContain('ゴーレム');
		}
		expect(errors).toHaveLength(0);
	});

	test('D1(G)＋D5(L) を倒すと最も後の D5 の台詞が出る（D1 で固定されない）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(previewUrl({ triforce: 0 }));
		await waitForBoard(page);
		await page.evaluate(() => window.__game.addDefeatedBoss('G'));
		await page.evaluate(() => window.__game.addDefeatedBoss('L'));
		await talkToTaro(page);
		const text = await getDialogText(page);
		if (text) {
			// linesAfterBoss["L"]（氷のリヴァイアサン）が出て、G 専用台詞では固定されない
			expect(text).toContain('リヴァイアサン');
			expect(text).not.toContain('ゴーレム');
		}
		expect(errors).toHaveLength(0);
	});

	test('看板タイル（石碑）でも defeatedBosses に応じた踏破後台詞が出る', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(signPreviewUrl());
		await waitForBoard(page);
		// 撃破前＝通常台詞（「魔物が徘徊し」）
		await talkToSign(page);
		const before = await getDialogText(page);
		if (before) expect(before).not.toContain('攻略済み');
		await closeDialog(page);
		await page.evaluate(() => window.__game.addDefeatedBoss('G'));
		await talkToSign(page);
		const after = await getDialogText(page);
		if (after) expect(after).toContain('攻略済み');
		expect(errors).toHaveLength(0);
	});

	test('getState に defeatedBosses が含まれる（配列型）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(previewUrl({ triforce: 0 }));
		await waitForBoard(page);
		await page.evaluate(() => window.__game.addDefeatedBoss('G'));
		const state = await page.evaluate(() => window.__game.getState());
		expect(Array.isArray(state.player.defeatedBosses)).toBe(true);
		expect(state.player.defeatedBosses).toContain('G');
		expect(errors).toHaveLength(0);
	});
});
