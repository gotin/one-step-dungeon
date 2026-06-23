// Phase 4-5 ①: 武器でトグルするスイッチ（SWITCH 'Y'）のスモークテスト
//
// タイルの呼び分け（2026-06-20 リネーム）：
//   - ボタン BUTTON('S')：プレイヤー/石が乗っている間だけ ON＝モーメンタリ式（従来のスイッチ）
//   - スイッチ SWITCH('Y')：矢・剣など武器の攻撃で ON↔OFF をトグル（攻撃まで状態維持）
//
// パズル配置（tests/fixtures/test-stages.json）：test_mechanics ステージ "arrow_switch"
//   スイッチ Y(8,9) は南側。北エリア（rows1-6）から下向きに矢を射ると Y(8,9) に当たる。
//   ON → ゲート T(2,9) が開く（links: switchId 8,9 → gateId 2,9）。もう一度撃つと閉じる。
//
// 検証：
//  1) 北から下向きに矢を射ると Y(8,9) が ON になりゲート 2,9 が開く
//  2) 撃った後に射手がその場を離れても ON 維持（モーメンタリではない＝トグル）
//  3) もう一度矢を撃つと OFF に戻り、ゲートも閉じる（トグル動作）
//  4) 剣でもトグルできる（前方のスイッチを剣で叩くと ON になる）
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

const FIXTURE_SRC = '../tests/fixtures/test-stages.json';

function previewUrl({ layer = 'test_mechanics', stage = 'arrow_switch', row, col, bow = true, weapon = false }) {
	const p = new URLSearchParams({
		fromEditor: '1', layer, stage,
		row: String(row), col: String(col),
		ps_mapSrc: FIXTURE_SRC,
	});
	if (bow) p.set('ps_bow', '1');
	if (weapon) p.set('ps_weapon', '1');
	return `${GAME}?${p.toString()}`;
}

async function shootDown(page) {
	await page.evaluate(() => window.__game.useSubItem());
	for (let i = 0; i < 20; i++) await page.evaluate(() => window.__game.step(1));
}

test.describe('Blade of Lumia – 武器でトグルするスイッチ（Phase 4-5 ①）', () => {
	test('北から矢を射るとスイッチが ON になりゲートが開く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		// 北エリア (5,9) にスポーン（heroDir 既定 'down'）。Y(8,9) の真上の列。
		await page.goto(previewUrl({ row: 5, col: 9 }));
		await waitForBoard(page);

		const st0 = await page.evaluate(() => window.__game.getState());
		expect(st0.player.activeSubItem).toBe('bow');

		await shootDown(page);

		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.switchToggles).toContain('8,9');
		expect(ss.openGates).toContain('2,9');
		// ボタン（switchStates）には一切作用しない（別物の証明）
		expect(ss.switchStates['8,9']).toBeUndefined();
		expect(errors).toEqual([]);
	});

	test('撃った後に移動しても ON 維持（モーメンタリではなくトグル）', async ({ page }) => {
		await page.goto(previewUrl({ row: 5, col: 9 }));
		await waitForBoard(page);

		await shootDown(page);

		// 射手が動き回る → ON のまま（checkSwitchOff はボタン専用なので無関係）
		for (let i = 0; i < 3; i++) {
			await page.evaluate(() => window.__game.movePlayer('left'));
			await page.evaluate(() => window.__game.step(1));
		}
		for (let i = 0; i < 3; i++) {
			await page.evaluate(() => window.__game.movePlayer('up'));
			await page.evaluate(() => window.__game.step(1));
		}

		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.switchToggles).toContain('8,9');
		expect(ss.openGates).toContain('2,9');
	});

	test('もう一度矢を撃つと OFF に戻りゲートも閉じる（トグル）', async ({ page }) => {
		await page.goto(previewUrl({ row: 5, col: 9 }));
		await waitForBoard(page);

		// 1発目：ON
		await shootDown(page);
		let ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.switchToggles).toContain('8,9');
		expect(ss.openGates).toContain('2,9');

		// 2発目：OFF（トグルで元に戻る）
		await shootDown(page);
		ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.switchToggles).not.toContain('8,9');
		expect(ss.openGates).not.toContain('2,9');
	});

	test('剣でもスイッチをトグルできる', async ({ page }) => {
		// スイッチ Y(8,9) の右隣 (8,10) にスポーンし、左を向いて剣で叩く。
		await page.goto(previewUrl({ row: 8, col: 10, bow: false, weapon: true }));
		await waitForBoard(page);

		// 左を向く
		await page.evaluate(() => window.__game.movePlayer('left'));
		await page.evaluate(() => window.__game.step(2));
		// 剣で前方（スイッチ Y(8,9)）を叩く
		await page.evaluate(() => window.__game.swordAttack());
		await page.evaluate(() => window.__game.step(1));

		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.switchToggles).toContain('8,9');
		expect(ss.openGates).toContain('2,9');
	});
});
