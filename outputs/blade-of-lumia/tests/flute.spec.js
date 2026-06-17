// Phase 4-2: 笛（フルート）のスモークテスト
//
// デモ配置（work/blade-of-lumia.json）：
//   field 2,0 …… fluteEffect={type:'reveal'}。(5,3) に flutePlayed で gate された
//                  隠しダンジョン入口 '>' （destId='secret_grotto'）。
//   secret_grotto 0,0 …… fluteEffect={type:'warp', destId:'field_secret_back'}。
//
// 検証：
//  1) ps_flute=1 で笛を所持してプレビューを開始できる
//  2) 隠し入口は笛を吹くまで遷移しない（踏んでも別ステージへ行かない）
//  3) 笛を吹く（reveal）と隠し入口が出現し、踏むと secret_grotto へ遷移する
//  4) secret_grotto で笛を吹く（warp）と field へ運ばれる
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl({ layer = 'field', stage = '2,0', row, col, flute = true }) {
	const p = new URLSearchParams({
		fromEditor: '1', layer, stage,
		row: String(row), col: String(col),
	});
	if (flute) p.set('ps_flute', '1');
	return `${GAME}?${p.toString()}`;
}

async function walk(page, dir, n) {
	for (let i = 0; i < n; i++) {
		await page.evaluate(d => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
}

test.describe('Blade of Lumia – 笛', () => {
	test('ps_flute=1 で笛を所持しアクティブになる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(previewUrl({ row: 4, col: 4, flute: true }));
		await waitForBoard(page);

		const st = await page.evaluate(() => window.__game.getState());
		expect(st.player.hasFlute).toBe(true);
		expect(st.player.activeSubItem).toBe('flute');
		expect(errors).toEqual([]);
	});

	test('隠し入口は笛を吹くまで遷移しない', async ({ page }) => {
		// (4,4) スポーン → 隠し入口 (5,3) の上に乗る（down 2 で y=5・left 2 で x=3）。
		// 笛を吹いていないので showConditions が未達＝遷移しない。
		await page.goto(previewUrl({ row: 4, col: 4, flute: true }));
		await waitForBoard(page);

		await walk(page, 'down', 2);
		await walk(page, 'left', 2);
		// 遷移 setTimeout（100ms）が起きないことを確かめるため少し実時間を待つ
		await page.waitForTimeout(300);
		const st = await page.evaluate(() => window.__game.getState());
		// field 2,0 に留まったまま（secret_grotto に飛んでいない）
		expect(st.currentLayer).toBe('field');
		expect(st.stageKey).toBe('2,0');
	});

	test('笛を吹く（reveal）と隠し入口が出現し secret_grotto へ入れる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(previewUrl({ row: 4, col: 4, flute: true }));
		await waitForBoard(page);

		// 笛を吹く → reveal
		await page.evaluate(() => window.__game.useSubItem());
		await page.evaluate(() => window.__game.step(1));

		// 隠し入口 (5,3) に乗る（down 2 で y=5・left 2 で x=3）
		await walk(page, 'down', 2);
		await walk(page, 'left', 2);
		await page.waitForFunction(() => {
			const s = window.__game.getState();
			return s.currentLayer === 'secret_grotto';
		}, { timeout: 3000 });

		const st = await page.evaluate(() => window.__game.getState());
		expect(st.currentLayer).toBe('secret_grotto');
		expect(errors).toEqual([]);
	});

	test('secret_grotto で笛を吹く（warp）と field へ戻る', async ({ page }) => {
		await page.goto(previewUrl({ layer: 'secret_grotto', stage: '0,0', row: 5, col: 2, flute: true }));
		await waitForBoard(page);

		let st = await page.evaluate(() => window.__game.getState());
		expect(st.currentLayer).toBe('secret_grotto');

		await page.evaluate(() => window.__game.useSubItem());
		await page.waitForFunction(() => {
			const s = window.__game.getState();
			return s.currentLayer === 'field';
		}, { timeout: 3000 });

		st = await page.evaluate(() => window.__game.getState());
		expect(st.currentLayer).toBe('field');
	});
});
