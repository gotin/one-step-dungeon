// tests/stone-debugmode-passthrough.spec.js — 回帰防止：
// エディタプレビュー（fromEditor=1・debugMode=true）でプレイヤーが石をすり抜けない。
//
// 背景：`passable.js isPassable()` は debugMode 中「敵すり抜け可能」を許すために
// `if (debugMode) return true;` を早期に置いていたが、この return が「移動後の石が
// あるセルには移動できない」チェックより前にあった。石を壁に押しきった（＝これ以上
// 押せない）後にさらに同方向へ入力すると、プレイヤーが石のセル（＝スイッチの上）へ
// すり抜けて侵入できてしまっていた（2026-08-01 ユーザー報告：4.56 石ロックの完了報告
// で提示した確認 URL が fromEditor プレビューだったため実機で発覚）。
//
// 修正＝石の存在チェックを debugMode 判定より前に移動（敵すり抜けは debugMode のまま
// 許可するが、石は「動かした後もそこに存在する物体」なので debugMode でも通行不可）。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
function previewUrl(stage, row, col) {
	const p = new URLSearchParams({ fromEditor: '1', layer: 'field', stage, row: String(row), col: String(col) });
	return `${GAME}?${p.toString()}`;
}

test.describe('Blade of Lumia – デバッグモード(fromEditor)プレビューでの石すり抜け防止', () => {
	test('石を壁に押しきった後、さらに押してもプレイヤーは石のセルへ侵入できない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// field 10,13: stone(3,4) を DOWN へ押すと button(6,4) に乗り、
		// wall(7,4) がそれ以上の押し出しを止める（石はこれ以上動けない）。
		await page.goto(previewUrl('10,13', 2, 4));
		await waitForBoard(page);
		await page.evaluate(() => window.__game.setHeroDir('down'));

		// 石が壁に止まるまで十分な回数押す。
		for (let i = 0; i < 6; i++) {
			await page.evaluate(() => window.__game.movePlayer('down'));
			await page.waitForTimeout(650);
		}

		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.stonePositions['3,4'], '石はボタン(6,4)で壁に止まって固定されている').toEqual({ r: 6, c: 4 });

		const p = await page.evaluate(() => window.__game.getState().player);
		const onStone = ss.stonePositions['3,4'].r === p.y && ss.stonePositions['3,4'].c === p.x;
		expect(onStone, 'プレイヤーは石のセル（＝スイッチの上）へすり抜けていない').toBe(false);
		expect(p.y, 'プレイヤーは石の1マス手前で止まっている').toBe(5);

		expect(errors).toEqual([]);
	});
});
