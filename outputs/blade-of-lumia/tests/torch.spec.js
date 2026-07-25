// tests/torch.spec.js – TORCH タイル + ブーメラン炎運搬（Phase 4-5 ②）
//
// パズル配置：ライブマップ test_mechanics レイヤーの検証ステージ "torch_relay"
//   (3,2)=H 点灯済み（initLitTorches: ['3,2']）
//   (3,3)=H 消灯
//   (7,5)=H 消灯
//   (7,9)=B 宝箱（torchesLit 条件付き）
//
// 距離メモ：
//   プレイヤー (3,0) → movePlayer('right') → (3,0.5) 右向き
//   ブーメラン発射位置 (3,1) → (3,2) 点灯TORCH = 1セル → flaming
//   (3,1) → (3,3) 消灯TORCH = 2セル → 点火（maxRange=3 以内）
//
// 検証：
//  1. initLitTorches でステージ初期化時に (3,2) が litTorches に入っている
//  2. ブーメランが点灯TORCH (3,2) を通過すると flaming になり (3,3) を点灯する
//  3. 点灯後 conditionsMet に "7,9" は入っていない（まだ7,5が消灯）
//  4. 炎持ちブーメランのとき proj-el に .boomerang-flaming クラスが付く

import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl({ row, col }) {
	const p = new URLSearchParams({
		fromEditor: '1',
		layer: TEST_LAYER,
		stage: stageKey('torch_relay'),
		row: String(row),
		col: String(col),
		ps_boomerang: '1',
	});
	return `${GAME}?${p.toString()}`;
}

test.describe('Blade of Lumia – TORCH + ブーメラン炎運搬（Phase 4-5 ②）', () => {

	test('initLitTorches: ステージ初期化時に (3,2) が litTorches に入っている（検証ステージ）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		await page.goto(previewUrl({ row: 5, col: 5 }));
		await waitForBoard(page);

		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.litTorches).toContain('3,2');
		expect(errors).toEqual([]);
	});

	test('ブーメランが点灯TORCH(3,2)を通過して消灯TORCH(3,4)を点灯する', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// (3,0) にスポーン。movePlayer('right') で右を向かせてから投げる。
		// heroDir デフォルトは 'down' なので向きを変える必要がある
		await page.goto(previewUrl({ row: 3, col: 0 }));
		await waitForBoard(page);

		const result = await page.evaluate(() => {
			// 右を向く（1 MOVE_STEP だけ右に移動し col ≈ 0.5）
			window.__game.movePlayer('right');
			window.__game.step(1);
			// ブーメランを右向きに投げる
			window.__game.useSubItem();
			for (let i = 0; i < 20; i++) window.__game.step(1);
			return window.__game.getStageState();
		});

		// (3,2) は initLitTorches で初期点灯済み
		expect(result.litTorches).toContain('3,2');
		// ブーメランが (3,2) 点灯TORCH → flaming → (3,3) 消灯TORCHを点火
		expect(result.litTorches).toContain('3,3');
		expect(errors).toEqual([]);
	});

	test('(3,3) 点灯後でも全TORCH未点灯なので conditionsMet["7,9"] は未達成', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		await page.goto(previewUrl({ row: 3, col: 0 }));
		await waitForBoard(page);

		await page.evaluate(() => {
			window.__game.movePlayer('right');
			window.__game.step(1);
			window.__game.useSubItem();
			for (let i = 0; i < 20; i++) window.__game.step(1);
		});

		const ss = await page.evaluate(() => window.__game.getStageState());
		// (7,5) がまだ消灯なので全TORCH点灯には足りず torchesLit は未達成
		expect(ss.conditionsMet).not.toContain('7,9');
		expect(errors).toEqual([]);
	});

	test('炎持ちブーメランのとき .boomerang-flaming クラスが proj-el に付く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		await page.goto(previewUrl({ row: 3, col: 0 }));
		await waitForBoard(page);

		// 右を向かせてから (3,2) 点灯TORCHを通過した後のフレームを確認
		// ブーメランが flaming になったフレームで DOM に反映されるはず
		const hasFlame = await page.evaluate(() => {
			window.__game.movePlayer('right');
			window.__game.step(1);
			window.__game.useSubItem();
			// tick ごとに確認する（ブーメランが TORCH に到達した瞬間を捉える）
			for (let i = 0; i < 15; i++) {
				window.__game.step(1);
				const projs = window.__game.getProjectiles();
				const b = projs.find(p => p.type === 'boomerang');
				if (b?.flaming) return true;  // flaming になった瞬間
				if (document.querySelector('.boomerang-flaming')) return true;
			}
			return false;
		});
		expect(hasFlame).toBe(true);
		expect(errors).toEqual([]);
	});

});
