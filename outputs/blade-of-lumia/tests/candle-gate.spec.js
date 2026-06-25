// Phase 9-2e: ロウソク関門（H かがり火を全点灯 → torchesLit → 隠し > テレポートが出現）の不変条件テスト。
//
// ⚠️ ライブマップを参照しない。dungeon_4「炎の神殿」[1,1] かがり火の間のジオメトリを
// tests/fixtures/test-stages.json の test_mechanics/candle_gate として複製・固定する。
//
// 設計の核：消灯 H が 3 つ（initLitTorches なし）。ロウソクで全点灯すると
// torchesLit → conditionsMet に '4,9' が追加 → 隠し > テレポートが出現・通行可。
// 剣・矢・ブーメランでは torchesLit が成立しない（篝火に無効）。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const FIXTURE_SRC = '../tests/fixtures/test-stages.json';

function previewUrl({ row, col, candle = false, weapon = true, bow = false }) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: 'test_mechanics', stage: 'candle_gate',
		row: String(row), col: String(col), ps_mapSrc: FIXTURE_SRC,
	});
	if (candle) p.set('ps_candle', '1');
	if (weapon) p.set('ps_weapon', '1');
	if (bow) p.set('ps_bow', '1');
	return `${GAME}?${p.toString()}`;
}
async function step(page, n) { for (let i = 0; i < n; i++) await page.evaluate(() => window.__game.step(1)); }
async function walk(page, dir, n) {
	for (let i = 0; i < n; i++) {
		await page.evaluate(d => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
}

// Torch positions: H at (2,3), (2,7), (5,5). Player stands one cell in front and fires candle.
// Start at row=7 col=5.

// Teleport player to (row, col) for torch lighting
async function teleport(page, row, col) {
	await page.evaluate(([r, c]) => {
		const p = window.__game.getPlayer();
		p.x = c; p.y = r;
	}, [row, col]);
	await step(page, 1);
}

test.describe('Blade of Lumia – ロウソク関門（Phase 9-2e）', () => {
	test('ロウソクで全かがり火を点灯すると torchesLit → conditionsMet に登録され > が出現', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		// Start anywhere in the room with candle
		await page.goto(previewUrl({ row: 7, col: 5, candle: true }));
		await waitForBoard(page);

		const st0 = await page.evaluate(() => window.__game.getState());
		expect(st0.player.activeSubItem).toBe('candle');

		// Light H(5,5): stand at row=6,col=5 facing up
		await teleport(page, 6, 5);
		await page.evaluate(() => window.__game.movePlayer('up'));
		await step(page, 1);
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 3);

		let ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.litTorches).toContain('5,5');
		expect(ss.conditionsMet ?? []).not.toContain('4,9'); // not yet — 2 more torches

		// Light H(2,3): stand at row=3,col=3 facing up
		await teleport(page, 3, 3);
		await page.evaluate(() => window.__game.movePlayer('up'));
		await step(page, 1);
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 3);

		ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.litTorches).toContain('2,3');
		expect(ss.conditionsMet ?? []).not.toContain('4,9'); // still 1 left

		// Light H(2,7): stand at row=3,col=7 facing up
		await teleport(page, 3, 7);
		await page.evaluate(() => window.__game.movePlayer('up'));
		await step(page, 1);
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 3);

		ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.litTorches).toContain('2,3');
		expect(ss.litTorches).toContain('2,7');
		expect(ss.litTorches).toContain('5,5');
		expect(ss.conditionsMet).toContain('4,9'); // torchesLit met → > visible
		expect(errors).toEqual([]);
	});

	test('剣のみでは torchesLit が成立しない（篝火を剣で叩いても点かない）', async ({ page }) => {
		await page.goto(previewUrl({ row: 6, col: 5, candle: false, weapon: true }));
		await waitForBoard(page);

		// Swing sword toward H(5,5)
		await page.evaluate(() => window.__game.movePlayer('up'));
		await step(page, 1);
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 5);

		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.litTorches ?? []).not.toContain('5,5');
		expect(ss.conditionsMet ?? []).not.toContain('4,9');
	});

	test('弓矢では torchesLit が成立しない（篝火に矢を撃っても点かない）', async ({ page }) => {
		await page.goto(previewUrl({ row: 4, col: 5, candle: false, weapon: false, bow: true }));
		await waitForBoard(page);

		// Shoot arrow down toward H(5,5)
		await page.evaluate(() => window.__game.movePlayer('down'));
		await step(page, 1);
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 20);

		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.litTorches ?? []).not.toContain('5,5');
		expect(ss.conditionsMet ?? []).not.toContain('4,9');
	});
});
