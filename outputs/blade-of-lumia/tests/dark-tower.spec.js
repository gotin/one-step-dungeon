// Phase 1-5: 暗黒の塔・飛行（翼の羽衣）のスモークテスト
//
// エディタプレビューモード（?fromEditor=1 + ps_wingrobe=1）で空島(field 4,0)に
// スポーンさせ、(1) 飛行できない地形(SKY)が飛行で越えられる、(2) 飛行トグルが
// hasWingRobe に依存する、(3) 塔入口へ渡れる、を実挙動で確認する。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

// 空島 field 4,0：到着足場(3,2) / 虚空 SKY (cols4-7) / 浮島(3,9 が塔入口)
function previewUrl({ row, col, wing }) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: 'field', stage: '4,0',
		row: String(row), col: String(col),
	});
	if (wing) p.set('ps_wingrobe', '1');
	return `${GAME}?${p.toString()}`;
}

test.describe('Blade of Lumia – 暗黒の塔・飛行', () => {
	test('翼の羽衣があれば飛行トグルでき、虚空(SKY)を越えて塔入口へ渡れる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		// 足場の左端 row3,col2（到着地点）にスポーン。翼の羽衣あり。
		await page.goto(previewUrl({ row: 3, col: 2, wing: true }));
		await waitForBoard(page);

		// 初期は徒歩
		let st = await page.evaluate(() => window.__game.getState());
		expect(st.player.hasWingRobe).toBe(true);
		expect(st.player.flying).toBe(false);

		// 離陸
		await page.evaluate(() => window.__game.toggleFlight());
		st = await page.evaluate(() => window.__game.getState());
		expect(st.player.flying).toBe(true);

		// 右へ進んで虚空(cols4-7)を越える。飛行中なので越えられるはず。
		for (let i = 0; i < 16; i++) {
			await page.evaluate(() => window.__game.movePlayer('right'));
			await page.evaluate(() => window.__game.step(1));
		}
		st = await page.evaluate(() => window.__game.getState());
		// 虚空を越えて浮島側（col >= 8 付近）へ到達できている
		expect(st.player.x).toBeGreaterThan(7);

		expect(errors).toEqual([]);
	});

	test('翼の羽衣が無いと飛行トグルは効かない（虚空を越えられない）', async ({ page }) => {
		await page.goto(previewUrl({ row: 3, col: 2, wing: false }));
		await waitForBoard(page);

		await page.evaluate(() => window.__game.toggleFlight());
		let st = await page.evaluate(() => window.__game.getState());
		expect(st.player.flying).toBe(false); // 羽衣なし → 飛べない

		// 右へ押しても虚空(col4-)で止まる
		for (let i = 0; i < 16; i++) {
			await page.evaluate(() => window.__game.movePlayer('right'));
			await page.evaluate(() => window.__game.step(1));
		}
		st = await page.evaluate(() => window.__game.getState());
		expect(st.player.x).toBeLessThan(4); // 虚空の手前で止まる
	});

	test('飛行中は木(自然物)を飛び越えられるが、山(MOUNTAIN)は越えられない', async ({ page }) => {
		// field 1,0：row2 は "M.@....tt..." で col7,8 が木、col0 が山(M)。
		// 木越えテスト：col6 から右へ飛ぶと木(col7,8)を越えて col>8 へ到達できる。
		await page.goto(`${GAME}?fromEditor=1&layer=field&stage=1,0&row=2&col=6&ps_wingrobe=1`);
		await waitForBoard(page);
		await page.evaluate(() => window.__game.toggleFlight());
		let st = await page.evaluate(() => window.__game.getState());
		expect(st.player.flying).toBe(true);
		for (let i = 0; i < 10; i++) {
			await page.evaluate(() => window.__game.movePlayer('right'));
			await page.evaluate(() => window.__game.step(1));
		}
		st = await page.evaluate(() => window.__game.getState());
		expect(st.player.x).toBeGreaterThan(8); // 木(col7,8)を飛び越えた

		// 山越え不可テスト：col1 から左へ飛んでも山(col0)は越えられず留まる。
		await page.goto(`${GAME}?fromEditor=1&layer=field&stage=1,0&row=2&col=1&ps_wingrobe=1`);
		await waitForBoard(page);
		await page.evaluate(() => window.__game.toggleFlight());
		for (let i = 0; i < 6; i++) {
			await page.evaluate(() => window.__game.movePlayer('left'));
			await page.evaluate(() => window.__game.step(1));
		}
		st = await page.evaluate(() => window.__game.getState());
		expect(st.player.x).toBeGreaterThanOrEqual(1); // 山(col0)を越えられず留まる
	});

	test('塔入口に乗ると暗黒の塔(dark_tower 0,1)へ遷移する', async ({ page }) => {
		// 塔入口の隣 row3,col8 にスポーン（飛行で島に渡った後の状態を模擬）。
		await page.goto(previewUrl({ row: 3, col: 8, wing: true }));
		await waitForBoard(page);

		// 右へ1歩 → 入口(3,9)に乗る → 遷移
		await page.evaluate(() => window.__game.movePlayer('right'));
		await page.evaluate(() => window.__game.step(1));
		await page.waitForFunction(() => window.__game.getState().currentLayer === 'dark_tower', null, { timeout: 3000 });
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.currentLayer).toBe('dark_tower');
		expect(st.stageKey).toBe('0,1');
	});
});
