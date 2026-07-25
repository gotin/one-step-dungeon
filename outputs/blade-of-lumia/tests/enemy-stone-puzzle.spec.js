// Phase 5-3: 敵を使ったパズル（敵が石を押す）のスモークテスト
//
// パズル配置：ライブマップ test_mechanics レイヤーの検証ステージ "enemy_stone"
//          0123456789AB
//   row2: #....C....##   C = CHASER(2,5)
//   row3: #....*....##   * = STONE(3,5)
//   row4: #....S...TB#   S = BUTTON(4,5) / T = GATE(4,9) / B = CHEST(4,10)
//   row5: #....#....##   ボタン直下を壁で塞ぐ＝石は越えられない
//   links: [{ switchId:'4,5', gateId:'4,9' }]
//
// 仕組み：チェイサーがプレイヤー（下方）を追って下に進み、石(3,5)をボタン(4,5)へ
//         押し込む。石がボタンに乗ると既存の checkStoneOnSwitch が ON にして
//         連動ゲート(4,9)が開く。CHASER は enemyChase（乱数なし）なので決定論的。
//
// 検証：
//  1) 敵が石を (3,5)→(4,5) ボタンへ押す → switchStates['4,5']===true・openGates に '4,9'
//  2) 石がボタンに乗っていないうちはゲートは閉じている（vacuous pass 防止）
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl(row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: TEST_LAYER, stage: stageKey('enemy_stone'),
		row: String(row), col: String(col),
	});
	return `${GAME}?${p.toString()}`;
}

test.describe('Blade of Lumia – 敵を使ったパズル（Phase 5-3）', () => {

	test('チェイサーが石をボタンへ押し込むとゲートが開く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// プレイヤーをボタンの下 (6,5) に置く。チェイサー(2,5) は下方の
		// プレイヤーを追って真下に進み、石(3,5)→ボタン(4,5) へ押し込む。
		await page.goto(previewUrl(6, 5));
		await waitForBoard(page);

		// 初期状態：ゲートはまだ開いていない（石はボタンに乗っていない）
		const ss0 = await page.evaluate(() => window.__game.getStageState());
		expect(ss0.openGates).not.toContain('4,9');
		expect(ss0.switchStates['4,5']).toBeFalsy();

		// ループを回して敵に石を押させる（CHASER speed=0.5・MOVE_STEP=0.5。
		// (2,5)→(4,5) まで石を2セル動かすのに十分な tick を回す）
		for (let i = 0; i < 80; i++) {
			await page.evaluate(() => window.__game.step(1));
		}

		const ss = await page.evaluate(() => window.__game.getStageState());
		// 石がボタン(4,5)に乗っている
		const stoneOnButton = Object.values(ss.stonePositions).some(st => st.r === 4 && st.c === 5);
		expect(stoneOnButton, '石がボタン(4,5)に押し込まれている').toBe(true);
		// ボタンが ON・連動ゲートが開いている
		expect(ss.switchStates['4,5']).toBe(true);
		expect(ss.openGates).toContain('4,9');
		expect(errors).toEqual([]);
	});

	test('敵が石をボタンに乗せるまではゲートは閉じたまま', async ({ page }) => {
		// プレイヤーを上方 (1,5) に置くと、チェイサー(2,5) はプレイヤーを追って
		// 上（石とは逆方向）へ向かうため、石はボタンに乗らない＝ゲートは閉じたまま。
		await page.goto(previewUrl(1, 5));
		await waitForBoard(page);

		for (let i = 0; i < 40; i++) {
			await page.evaluate(() => window.__game.step(1));
		}

		const ss = await page.evaluate(() => window.__game.getStageState());
		const stoneOnButton = Object.values(ss.stonePositions).some(st => st.r === 4 && st.c === 5);
		expect(stoneOnButton, '石はボタンに乗っていない').toBe(false);
		expect(ss.openGates).not.toContain('4,9');
	});
});
