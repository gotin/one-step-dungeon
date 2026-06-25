// Phase 9-2d: 弓ゲート（Y を矢でトグル→T が開く）の不変条件テスト。
//
// ⚠️ ライブマップを参照しない。dungeon_3「水の迷宮」の臨界経路を支える弓ゲート
// [1,1] のジオメトリを tests/fixtures/test-stages.json の test_mechanics/bow_gate
// として複製・固定する（[[blade-gimmick-tests-use-fixtures]]）。
//
// 設計の核：Y(1,10) は水島で上下左右が水/壁＝歩いても剣でも届かない。col10 の
// 通路(row6)から上へ矢を撃つと届く（距離5 > boomerang maxRange3）。これにより
// 「弓が無ければ T が開かない＝ボスに到達できない」を保証する（弓必須の関門）。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const FIXTURE_SRC = '../tests/fixtures/test-stages.json';

function previewUrl({ row, col, bow = false, weapon = true }) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: 'test_mechanics', stage: 'bow_gate',
		row: String(row), col: String(col), ps_mapSrc: FIXTURE_SRC,
	});
	if (bow) p.set('ps_bow', '1');
	if (weapon) p.set('ps_weapon', '1');
	return `${GAME}?${p.toString()}`;
}
async function step(page, n) { for (let i = 0; i < n; i++) await page.evaluate(() => window.__game.step(1)); }
async function walk(page, dir, n) {
	for (let i = 0; i < n; i++) {
		await page.evaluate(d => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
}

test.describe('Blade of Lumia – 弓ゲート（Phase 9-2d）', () => {
	test('弓で col10 を上に撃つと Y(1,10) が ON になり T ゲート(4,0/5,0)が開く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		// 発射位置: row6 col10（島の真下の通路）。
		await page.goto(previewUrl({ row: 6, col: 10, bow: true }));
		await waitForBoard(page);

		const st0 = await page.evaluate(() => window.__game.getState());
		expect(st0.player.activeSubItem).toBe('bow');

		await page.evaluate(() => window.__game.movePlayer('up')); // 上を向く
		await step(page, 1);
		await page.evaluate(() => window.__game.useSubItem());      // 上へ矢を撃つ
		await step(page, 30);

		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.switchToggles).toContain('1,10');
		expect(ss.openGates).toContain('4,0');
		expect(ss.openGates).toContain('5,0');
		expect(errors).toEqual([]);
	});

	test('弓なし（剣のみ）では Y に届かず T は開かない（歩いても剣でも不可）', async ({ page }) => {
		await page.goto(previewUrl({ row: 6, col: 10, bow: false, weapon: true }));
		await waitForBoard(page);

		// 島へ近づこうと上へ歩く → 水(row5..2 col10)で止まり row1 の島には乗れない。
		await walk(page, 'up', 8);
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.player.y).toBeGreaterThanOrEqual(5);

		// 剣を振っても Y(1,10) は水越しで届かない。
		await page.evaluate(() => window.__game.movePlayer('up'));
		await step(page, 1);
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 3);

		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.switchToggles ?? []).not.toContain('1,10');
		expect(ss.openGates ?? []).not.toContain('4,0');
	});

	test('ブーメランでは届かない（maxRange3 < 距離5・かつ Y はトグルされない）', async ({ page }) => {
		// boomerang で col10 を上に投げても Y(1,10) には距離が足りず、
		// そもそも boomerang は SWITCH をトグルしない（矢/剣/ビームのみ）。
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'test_mechanics', stage: 'bow_gate',
			row: '6', col: '10', ps_mapSrc: FIXTURE_SRC, ps_boomerang: '1',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);
		await page.evaluate(() => window.__game.movePlayer('up'));
		await step(page, 1);
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 30);
		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.switchToggles ?? []).not.toContain('1,10');
		expect(ss.openGates ?? []).not.toContain('4,0');
	});
});
