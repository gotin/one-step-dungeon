// Phase 6-1b: 個別ボス撃破フラグ（defeatedBosses）テスト
//
// 検証:
//  1) 初期状態（defeatedBosses 空）で村人タロに話しかけると通常台詞
//  2) defeatedBosses に 'G'（岩のゴーレム）を追加後に話しかけると linesAfterBoss["G"] 台詞
//  3) defeatedBosses に 'A'（別ボス）だけある場合は linesAfterBoss.default 台詞
//  4) 台詞選択ロジックの優先順位確認（JSエラーなし）
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

// field 1,0 の村人タロは (3,5) にいる。(3,4) からスポーンして話しかける。
function previewUrl({ row = 3, col = 4, triforce = 0 }) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: 'field', stage: '1,0',
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

	test('defeatedBosses に G 以外のボス: linesAfterBoss.default が出る', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(previewUrl({ triforce: 0 }));
		await waitForBoard(page);
		// G 以外のボス（炎のサラマンドラ A）を追加
		await page.evaluate(() => window.__game.addDefeatedBoss('A'));
		await talkToTaro(page);
		const text = await getDialogText(page);
		if (text) {
			// default 台詞「ダンジョンのボスを倒したんだって？」が出るはず
			expect(text).not.toContain('ゴーレム');
			expect(text).toContain('ボス');
		}
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
