// tests/field-north-band.spec.js — Phase 9-6-BASE ⑤ 北の外周帯 7画面
//
// `scripts/migrate-field-north-band.mjs` は状態空間ソルバー（実エンジンの遷移の写し）で
// 自己検証しているが、**写しが実エンジンと食い違っていないこと**は実エンジンでしか確かめ
// られない（テスト緑でもゲームで壊れる、の再発防止）。この spec は帯の「到着時の道具で
// 解ける仕掛け」3つを実エンジンで踏み、7画面すべてが 0 pageerror で起動することを見る。
//
//  1) 弓ゲート @ 4,1 … 小池の中島に立つ 'Y'(2,9) は歩いて隣に立てない（周囲8セルが下地の水）。
//     東の岸 (2,11) から西へ矢を撃つと Y に当たり、リンクしたゲート 'T'(6,3) が開く。
//       row2:  . . . . . . . . ~ Y ~ .    （~ ＝下地の水・プレイヤーは c11 から撃つ）
//  2) 石押し @ 5,0 … 袋小路の1本道（row7・上下が岩）を西へ石 '*'(7,5) を押し込むと
//     ボタン 'S'(7,1) に乗ってゲート 'T'(2,4) が恒久に開く。押し戻せる向きが無い＝詰まない。
//       row7:  M S . . . * . . . . . M
//  3) ブーメランの火運び @ 9,0 … 狼煙台は 'H'(3,5) だけ点いている（initLitTorches）。
//     (3,4) から東へ投げると往路で火を拾い (3,6) を点ける＝torchesLit で封印の宝箱が出る。
//       row3:  . . . . . H H . . . . .    （木のブーメランの maxRange は 3）

import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl(stage, row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: 'field', stage, row: String(row), col: String(col), ...extra,
	});
	return `${GAME}?${p.toString()}`;
}

test.describe('Phase 9-6-BASE ⑤ – 北の外周帯 7画面', () => {

	test('① 4,1 小池の中島のスイッチは歩いて叩けず、東岸から射た矢で開く（弓ゲート）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		await page.goto(previewUrl('4,1', 2, 11, { ps_bow: '1' }));
		await waitForBoard(page);

		// 西を向く。向き変更は通るが**移動は下地の水で塞がれる**＝中島に歩いて渡れない。
		const stay = await page.evaluate(() => {
			for (let i = 0; i < 8; i++) { window.__game.movePlayer('left'); window.__game.step(1); }
			const p = window.__game.getState().player;
			return { x: p.x, y: p.y };
		});
		expect(stay.x, '池は歩いて渡れない（矢だけが届く）').toBeCloseTo(11, 1);

		const before = await page.evaluate(() => window.__game.getStageState());
		expect(before.switchToggles).not.toContain('2,9');
		expect(before.openGates).not.toContain('6,3');

		// 西へ矢を撃つ：水の上を飛んで中島の 'Y' に当たる（矢を止めるのは '#' と未破壊 '!' だけ）。
		const after = await page.evaluate(() => {
			window.__game.useSubItem();
			for (let i = 0; i < 24; i++) window.__game.step(1);
			return window.__game.getStageState();
		});
		expect(after.switchToggles, '矢が中島の Y(2,9) をトグルする').toContain('2,9');
		expect(after.openGates, 'Y のトグルでリンクしたゲート 6,3 が開く').toContain('6,3');
		expect(errors, `page errors on field 4,1:\n${errors.join('\n')}`).toEqual([]);
	});

	test('② 5,0 袋小路の石をボタンへ押し込むと関門のゲート (2,4) が開く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 石の東側 (7,8) から入る＝押せる向きは西だけ（西側は石の向こうで到達不能）。
		await page.goto(previewUrl('5,0', 7, 8));
		await waitForBoard(page);

		const before = await page.evaluate(() => window.__game.getStageState());
		expect(before.openGates).not.toContain('2,4');

		// ⚠️ 石押しは**実時間**のクールダウン（STONE_PUSH_COOLDOWN_MS = 600ms・player.js:469）が
		// あるので、`step()` を回すだけでは1回しか押せない。1押しごとに実時間を待つ。
		// 石 '*'(7,5) を c5→c1 まで4回押す（+ 開始位置 (7,8) から石の隣 (7,6) まで歩く分）。
		for (let push = 0; push < 8; push++) {
			await page.evaluate(() => {
				for (let i = 0; i < 8; i++) { window.__game.movePlayer('left'); window.__game.step(1); }
			});
			await page.waitForTimeout(650);
		}
		const after = await page.evaluate(() => window.__game.getStageState());
		expect(after.stonePositions?.['7,5'], '石が S(7,1) まで押し込まれる')
			.toEqual({ r: 7, c: 1 });
		expect(after.openGates, '全ボタンに石が乗ってゲート 2,4 が開く').toContain('2,4');
		expect(after.stonesLocked, '押し込んだ石は固定される（押し戻して詰められない）').toBe(true);
		expect(errors, `page errors on field 5,0:\n${errors.join('\n')}`).toEqual([]);
	});

	test('③ 9,0 ブーメランで狼煙へ火を運ぶと torchesLit で宝箱の封印が解ける', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		await page.goto(previewUrl('9,0', 3, 3, { ps_boomerang: '1' }));
		await waitForBoard(page);

		const boot = await page.evaluate(() => window.__game.getStageState());
		expect(boot.litTorches, 'initLitTorches で西の狼煙 (3,5) だけ点いている').toContain('3,5');
		expect(boot.litTorches).not.toContain('3,6');
		expect(boot.conditionsMet ?? []).not.toContain('7,8');

		const after = await page.evaluate(() => {
			window.__game.movePlayer('right');            // 東を向いて (3,4) 側へ寄る
			for (let i = 0; i < 2; i++) window.__game.step(1);
			window.__game.useSubItem();                   // ブーメランを東へ
			for (let i = 0; i < 30; i++) window.__game.step(1);
			return window.__game.getStageState();
		});
		expect(after.litTorches, '往路で火を拾い (3,6) を点ける').toContain('3,6');
		expect(after.conditionsMet, '両方点いて torchesLit ＝宝箱 (7,8) が現れる').toContain('7,8');
		expect(errors, `page errors on field 9,0:\n${errors.join('\n')}`).toEqual([]);
	});

	test('④ 帯の7画面すべてが 0 pageerror で起動して動く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		// 各画面の開いた外周の内側に降りる（'4,0' は崖端・'6,0' は地割れの南など）。
		const spots = [
			['4,0', 4, 1], ['4,1', 8, 6], ['5,0', 4, 1], ['6,0', 8, 6],
			['7,0', 4, 1], ['9,0', 5, 1], ['10,1', 5, 5],
		];
		for (const [stage, row, col] of spots) {
			await page.goto(previewUrl(stage, row, col, { ps_ladder: '1', ps_bomb: '1', ps_candle: '1' }));
			await waitForBoard(page);
			await page.evaluate(() => window.__game.step(20));
		}
		expect(errors, `page errors booting the north band:\n${errors.join('\n')}`).toEqual([]);
	});
});
