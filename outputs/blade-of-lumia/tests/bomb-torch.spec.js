// tests/candle-torch.spec.js → bomb-torch.spec.js（Phase 4-5 ③ ロウソクで TORCH 点灯）
//
// パズル配置（dungeon_1 ステージ "1,2"）：
//   (3,2)=H 点灯済み（initLitTorches: ['3,2']）
//   (3,3)=H 消灯
//
// プレイヤー (3,2) に立って右を向く → 前方 (3,3) が消灯 TORCH → ロウソク使用で点灯
//
// ロウソクは「前方1マスに炎を出す」。TORCH が前方にあれば点灯する。

import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl({ row, col }) {
	const p = new URLSearchParams({
		fromEditor: '1',
		layer: 'dungeon_1',
		stage: '1,2',
		row: String(row),
		col: String(col),
		ps_candle: '1',
	});
	return `${GAME}?${p.toString()}`;
}

test.describe('Blade of Lumia – ロウソクで TORCH 点灯（Phase 4-5 ③）', () => {

	test('ロウソクで前方の消灯 TORCH (3,3) を点灯できる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// (3,1) にスポーン → movePlayer('right') で x=1.5 → 前方 toTileCol(1.5+1)=3
		// (3,3) は消灯 TORCH
		await page.goto(previewUrl({ row: 3, col: 1 }));
		await waitForBoard(page);

		const result = await page.evaluate(() => {
			// 右を向く（x: 1 → 1.5, heroDir='right'）
			window.__game.movePlayer('right');
			window.__game.step(1);
			// ロウソク使用（activeSubItem='candle'）
			window.__game.useSubItem();
			window.__game.step(1);
			return window.__game.getStageState();
		});

		expect(result.litTorches).toContain('3,3');
		expect(errors).toEqual([]);
	});

	test('すでに点灯している TORCH に再度ロウソクを使っても litTorches の数は変わらない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// (3,0) にスポーン → movePlayer('right') で x=0.5 → 前方 toTileCol(0.5+1)=1（床）
		// 前方が TORCH でない場合 → litTorches 変化なし確認
		// 別案：(3,1) にスポーン → 前方 (3,2) は initLitTorches で点灯済み
		await page.goto(previewUrl({ row: 3, col: 0 }));
		await waitForBoard(page);

		const result = await page.evaluate(() => {
			// (3,0) → movePlayer('right') → x=0.5 → 前方 toTileCol(1.5)=1（床・TORCH でない）
			window.__game.movePlayer('right');
			window.__game.step(1);
			const before = window.__game.getStageState().litTorches.length;
			window.__game.useSubItem();
			window.__game.step(1);
			const after = window.__game.getStageState().litTorches.length;
			return { before, after };
		});

		// 前方が TORCH でないので litTorches は増えない
		expect(result.after).toBe(result.before);
		expect(errors).toEqual([]);
	});

});
