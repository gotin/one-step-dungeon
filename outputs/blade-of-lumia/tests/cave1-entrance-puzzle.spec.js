// バグ修正の番人（2026-09-14）：field 9,15 → cave_1 の入口（8,10・showConditions
// allSwitchesOn）が実際に解けることを実際の入力経路（movePlayer）で確かめる。
//
// 経緯＝ボタン 'S' が4個あるのに石 '*' が0個で、モーメンタリ式のボタン（乗っている間だけ
// ON）を単独プレイヤーで4個同時にONにすることが物理的に不可能だった（cave_1 の入口が
// 実質封鎖）。scripts/migrate-fix-cave1-switch-puzzle.mjs で各ボタンの隣に石を1個ずつ
// 置き、押せば1手で乗る作りに直した（field 12,2／13,4 と同じ「ボタン数=石数」の型）。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl(row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: 'field', stage: '9,15',
		row: String(row), col: String(col),
	});
	return `${GAME}?${p.toString()}`;
}

// 4個の石をそれぞれ隣のボタンへ1手で押し込み、入口 (8,10) まで歩く経路。
// 各要素は隣接1セルの移動（押しも通常移動も1セル刻みで再現できる＝stone-gate-all-buttons
// と同じ作法）。
const WAYPOINTS = [
	'2,2',
	'3,2', '4,2', '4,3',
	'4,4',              // 押す：石(4,4)→(4,5)
	'4,3', '5,3',
	'5,4',              // 押す：石(5,4)→(5,5)
	'6,4', '6,5', '6,6', '6,7', '6,8', '6,9',
	'5,9', '4,9',
	'4,8',              // 押す：石(4,8)→(4,7)
	'4,9', '5,9',
	'5,8',              // 押す：石(5,8)→(5,7)
	'6,8', '7,8', '8,8', '8,9', '8,10',  // 入口へ
];

test.describe('Blade of Lumia – field 9,15 → cave_1 入口の石パズル', () => {
	test('石4個をボタンに乗せると allSwitchesOn が成立し、入口から cave_1 へ入れる', async ({ page }) => {
		test.slow();
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		await page.goto(previewUrl(2, 2));
		await waitForBoard(page);
		await page.evaluate(() => window.__game.pause());

		const pos = async () => page.evaluate(() => {
			const p = window.__game.getState().player;
			return { x: p.x, y: p.y };
		});

		// 最後のウェイポイント (8,10) は入口タイルそのもの＝乗った瞬間に cave_1 へ
		// 遷移し、以降の座標は cave_1 側の座標系になる（field の (8,10) には戻れない）。
		// ∴最後の1歩だけは「到達」でなく「レイヤーが変わった」ことを待つ。
		const last = WAYPOINTS.length - 1;
		for (let i = 1; i < last; i++) {
			const [tr, tc] = WAYPOINTS[i].split(',').map(Number);
			const [fr, fc] = WAYPOINTS[i - 1].split(',').map(Number);
			const dir = tr < fr ? 'up' : tr > fr ? 'down' : tc < fc ? 'left' : 'right';
			await page.evaluate((d) => window.__game.setHeroDir(d), dir);
			for (let guard = 0; guard < 6; guard++) {
				const p = await pos();
				if (p.x === tc && p.y === tr) break;
				await page.evaluate((d) => window.__game.movePlayer(d), dir);
				await page.waitForTimeout(650);
			}
			const p = await pos();
			expect(`${p.y},${p.x}`, `ウェイポイント ${WAYPOINTS[i]} へ到達`).toBe(WAYPOINTS[i]);
		}

		// (8,9) にいる時点＝入口に乗る直前で全ボタンONを確認する。
		const ssBefore = await page.evaluate(() => window.__game.getStageState());
		for (const b of ['4,5', '4,7', '5,5', '5,7']) {
			expect(ssBefore.switchStates[b], `ボタン ${b} が ON`).toBe(true);
		}
		expect(ssBefore.conditionsMet, '入口 (8,10) の条件が成立').toContain('8,10');

		// 最後の1歩＝入口タイルへ乗って cave_1 へ遷移する。
		await page.evaluate(() => window.__game.setHeroDir('right'));
		for (let guard = 0; guard < 6; guard++) {
			const layer = await page.evaluate(() => window.__game.getState().currentLayer);
			if (layer === 'cave_1') break;
			await page.evaluate(() => window.__game.movePlayer('right'));
			await page.waitForTimeout(650);
		}
		const state = await page.evaluate(() => window.__game.getState());
		expect(state.currentLayer, '入口を踏んで cave_1 へ遷移').toBe('cave_1');

		expect(errors).toEqual([]);
	});
});
