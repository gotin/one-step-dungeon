// Phase 9-2d 追補: 連なった DOOR は1枚の扉＝1個の鍵でまとめて開く不変条件テスト。
//
// 背景：ボス入口は辺スクロールの標準幅 col5,6（2マス）。そこを鍵で塞ぐと "DD"
// （横2セル）になる。鍵は中ボス1ドロップ＝1個なので、隣接2枚を別々の扉にすると
// 2枚目が永久に開かない死にタイルになる。→ 連結した D を「1枚の2セル幅ドア」と
// して扱い、1個の鍵でまとめて開く（将来 field の城門にも流用可）。
//
// ⚠️ 本編ステージ非参照。test_mechanics レイヤーの検証ステージ double_door で固定。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl({ row, col }) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: TEST_LAYER, stage: stageKey('double_door'),
		row: String(row), col: String(col),
	});
	return `${GAME}?${p.toString()}`;
}
async function walk(page, dir, n) {
	for (let i = 0; i < n; i++) {
		await page.evaluate(d => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
}

test.describe('Blade of Lumia – 横2セル扉（連結 DOOR・Phase 9-2d）', () => {
	test('鍵1個で横2セルの扉(1,5)(1,6)が両方開く（鍵は1個だけ消費）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 扉 col5 の真下(row2,col5)にスポーン。まず鍵 K(8,3) を拾いに行く。
		await page.goto(previewUrl({ row: 2, col: 5 }));
		await waitForBoard(page);

		// K(8,3) まで降りて拾う：下へ → 左へ
		await walk(page, 'down', 12);  // row2 → row8（x=5,y=8）
		await walk(page, 'left', 6);   // col5 → col3 で K(8,3) を踏む（x=2,y=8）
		let st = await page.evaluate(() => window.__game.getState());
		expect(st.player.keys).toBe(1);

		// 扉 col5 の真下に戻り、上を押して開ける。x を col5 ちょうどに合わせる。
		await walk(page, 'right', 6);  // col2 → col5（x=5）
		st = await page.evaluate(() => window.__game.getState());
		expect(Math.round(st.player.x)).toBe(5);
		await walk(page, 'up', 16);    // row1 直下へ上り、扉に当たって開錠
		await page.evaluate(() => window.__game.movePlayer('up'));
		await page.evaluate(() => window.__game.step(2));

		const ss = await page.evaluate(() => window.__game.getStageState());
		// 連結した両セルが開いている（隣接2枚を1個の鍵でまとめて開けた）。
		expect(ss.openedDoors).toContain('1,5');
		expect(ss.openedDoors).toContain('1,6');
		// 鍵は1個だけ消費（2個要求していない）。
		st = await page.evaluate(() => window.__game.getState());
		expect(st.player.keys).toBe(0);
		expect(errors).toEqual([]);
	});

	test('鍵が無いと扉は開かない', async ({ page }) => {
		await page.goto(previewUrl({ row: 2, col: 5 }));
		await waitForBoard(page);
		// 鍵を拾わずに扉(row1,col5)へ上って当たる
		await walk(page, 'up', 4);
		await page.evaluate(() => window.__game.movePlayer('up'));
		await page.evaluate(() => window.__game.step(2));
		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.openedDoors ?? []).not.toContain('1,5');
		expect(ss.openedDoors ?? []).not.toContain('1,6');
	});
});
