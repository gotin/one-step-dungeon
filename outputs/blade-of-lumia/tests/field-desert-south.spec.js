// tests/field-desert-south.spec.js — Phase 9-6-BASE ⑥ 砂漠D 南岸＋渚 11画面
//
// `scripts/migrate-field-desert-south.mjs` は状態空間ソルバー（実エンジンの遷移の写し）で
// 自己検証しているが、**写しが実エンジンと食い違っていないこと**は実エンジンでしか
// 確かめられない（テスト緑でもゲームで壊れる、の再発防止）。この spec は南岸の仕掛けを
// 実エンジンで踏み、11画面すべてが 0 pageerror で起動することを見る。
//
//  1) 潮ゲート @ 1,19 … 到着時の道具（剣のみ）で解ける唯一の仕掛け。'Y'(1,5) を下から
//     斬ると links で '='(4,5)(4,6) が開き、封印の宝箱 (5,6) が現れる。
//       row1:  . . . . . Y . . . . . .
//       row4:  . . . . . = = . . . . .   ← 開くまで南のくぼみへ入れない
//  2) 爆弾 @ 3,18 … 石切場の切り残し '!'(3,4) を崩すと '#' のくぼみの宝箱 (3,3) に届く。
//       row3:  . . # B ! . . . . . . M
//  3) はしご @ 2,18 … 陥没の穴 'x'(2,3) ははしご無しでは渡れず、渡ると袋のくぼみの
//     宝箱 (4,3) に届く（袋なので「入って詰む」にはならない＝穴は往復できる）。
//  4) ロウソク @ 0,19 … 岬の狼煙 'H'(5,2)(7,2) はどちらも消灯（initLitTorches なし）。
//     両方点けると torchesLit で封印の宝箱 (6,4) が現れる。
//
// ⚠ 2)3)4) は「到着時の道具では解けない＝任意の袋小路の報酬」。実プレイ順で必ず解けること
//    ではなく、道具を得た後に**本当に解けること**を担保するためのテスト。

import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl(stage, row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: 'field', stage, row: String(row), col: String(col), ...extra,
	});
	return `${GAME}?${p.toString()}`;
}

/** n タイル歩く（1 タイル = movePlayer 2回 / MOVE_STEP = 0.5 セル）。 */
async function walkTiles(page, dir, tiles = 1) {
	await page.evaluate(({ d, n }) => {
		for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
	}, { d: dir, n: tiles });
}

async function step(page, n) { for (let i = 0; i < n; i++) await page.evaluate(() => window.__game.step(1)); }

/**
 * ダイアログを閉じる。道具入りの宝箱（'item'）は giveSubItem がダイアログを開き、
 * **閉じるまで movePlayer が丸ごと無視される**（player.js:380 の getIsDialog ガード）。
 * `window.__game` に advanceDialog は出ていないので実キー（input.js:85）で送る。
 */
async function dismissDialog(page) {
	for (let i = 0; i < 6; i++) {
		if (!(await page.evaluate(() => window.__game.getState().isDialog))) return;
		await page.keyboard.press('Enter');
		await step(page, 1);
	}
	expect(await page.evaluate(() => window.__game.getState().isDialog), 'ダイアログが閉じない').toBe(false);
}

/** プレイヤーの整数タイル座標（toTileRow/Col と同じ floor(v+0.5)）。 */
const at = (page) => page.evaluate(() => {
	const p = window.__game.getState().player;
	return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});

const ss = (page) => page.evaluate(() => window.__game.getStageState());

test.describe('Phase 9-6-BASE ⑥ – 砂漠D 南岸＋渚 11画面', () => {

	test('① 1,19 Y を斬ると潮ゲート (4,5)(4,6) が開き、封印の宝箱 (5,6) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// スイッチ 'Y'(1,5) の真下 (2,5) から入る（左右は下地の水＝入江）。
		await page.goto(previewUrl('1,19', 2, 5, { ps_weapon: '1' }));
		await waitForBoard(page);

		const before = await ss(page);
		expect(before.switchToggles ?? [], '初期状態でスイッチが ON').not.toContain('1,5');
		expect(before.openGates ?? [], '初期状態で潮ゲートが開いている').not.toContain('4,5');
		expect(before.conditionsMet ?? [], '斬る前に宝箱の封印が解けている').not.toContain('5,6');

		// 斬る前は南へ行けない：'='(4,5) の手前 row3 で止まる。
		await walkTiles(page, 'down', 3);
		expect((await at(page)).r, '閉じた潮ゲートを歩いて通り抜けてしまった').toBe(3);

		// (2,5) に戻り、上を1回押した半歩の位置から斬る＝前方タイルが 'Y'(1,5)。
		await walkTiles(page, 'up', 1);
		await page.evaluate(() => window.__game.movePlayer('up'));
		await step(page, 1);
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 3);
		await page.evaluate(() => window.__game.movePlayer('down'));
		await step(page, 1);

		const after = await ss(page);
		expect(after.switchToggles, '剣で Y(1,5) がトグルされない').toContain('1,5');
		expect(after.openGates, 'links 経由で潮ゲート (4,5) が開かない').toContain('4,5');
		expect(after.openGates, 'links 経由で潮ゲート (4,6) が開かない').toContain('4,6');
		expect(after.conditionsMet, 'switchOn で宝箱 (5,6) の封印が解けない').toContain('5,6');

		// 潮が引いた → 南のくぼみへ降りて宝箱 (5,6) を開ける。
		await walkTiles(page, 'down', 3);
		expect((await at(page)).r, '潮ゲートを渡れない').toBeGreaterThanOrEqual(5);
		await walkTiles(page, 'right', 1);
		expect(await at(page), '宝箱 (5,6) に届かない').toMatchObject({ r: 5, c: 6 });
		expect((await ss(page)).openedChests, '宝箱 (5,6) が開封されない').toContain('5,6');
		expect(errors, `page errors on field 1,19:\n${errors.join('\n')}`).toEqual([]);
	});

	test('② 3,18 石切場の切り残し (3,4) は爆弾でしか崩せず、崩すと宝箱 (3,3) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 爆弾なしで入る＝'!'(3,4) の手前 col5 で止まる。
		await page.goto(previewUrl('3,18', 3, 5));
		await waitForBoard(page);
		await walkTiles(page, 'left', 3);
		expect((await at(page)).c, '爆弾なしで壊せる壁を通り抜けてしまった').toBe(5);

		// 爆弾ありで入り直す：(3,5) に置けば AOE が隣の '!'(3,4) を崩す。
		await page.goto(previewUrl('3,18', 3, 5, { ps_bomb: '1' }));
		await waitForBoard(page);
		expect((await ss(page)).brokenWalls ?? [], '最初から壁が壊れている').not.toContain('3,4');

		await page.evaluate(() => {
			window.__game.step(2);        // クールダウン解消
			window.__game.useSubItem();   // 爆弾設置
			window.__game.step(20);       // 爆発まで 2000ms（TICK_MS=120 × 20）
		});
		expect((await ss(page)).brokenWalls, '爆弾で (3,4) が壊れない').toContain('3,4');

		await walkTiles(page, 'left', 2);
		expect(await at(page), 'くぼみの宝箱 (3,3) に届かない').toMatchObject({ r: 3, c: 3 });
		expect((await ss(page)).openedChests, '宝箱 (3,3) が開封されない').toContain('3,3');
		expect(errors, `page errors on field 3,18:\n${errors.join('\n')}`).toEqual([]);
	});

	test('③ 2,18 陥没の穴 (2,3) ははしごでのみ渡れ、渡ると宝箱 (4,3) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// はしごなし：穴 'x'(2,3) の手前 row1 で止まる。
		await page.goto(previewUrl('2,18', 1, 3));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getState().player.hasLadder)).toBe(false);
		await walkTiles(page, 'down', 3);
		expect((await at(page)).r, 'はしご無しで穴を渡れてしまう＝はしごが飾り').toBe(1);

		// はしごあり：穴を渡って袋のくぼみ (3,3)→(4,3) の宝箱まで届く。
		await page.goto(previewUrl('2,18', 1, 3, { ps_ladder: '1' }));
		await waitForBoard(page);
		await walkTiles(page, 'down', 3);
		expect(await at(page), 'はしごで穴 (2,3) を渡って宝箱 (4,3) に届かない').toMatchObject({ r: 4, c: 3 });
		expect((await ss(page)).openedChests, '宝箱 (4,3) が開封されない').toContain('4,3');

		// 袋は行き止まりだが穴を戻れる＝「入って詰む」にならない。
		await dismissDialog(page);   // 回復薬（大）の取得ダイアログを閉じる
		await walkTiles(page, 'up', 3);
		expect((await at(page)).r, 'くぼみから穴を戻れず詰む').toBeLessThanOrEqual(1);
		expect(errors, `page errors on field 2,18:\n${errors.join('\n')}`).toEqual([]);
	});

	test('④ 0,19 岬の狼煙 2つをロウソクで点けると封印の宝箱 (6,4) が現れる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 'H'(5,2) と 'H'(7,2) の間 (6,2) から入る＝上下を向くだけで両方点けられる。
		await page.goto(previewUrl('0,19', 6, 2, { ps_candle: '1' }));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getState().player.activeSubItem)).toBe('candle');

		const boot = await ss(page);
		expect(boot.litTorches ?? [], 'initLitTorches なしのはずが点いている').toEqual([]);
		expect(boot.conditionsMet ?? [], '点ける前に宝箱の封印が解けている').not.toContain('6,4');

		// 北の狼煙 (5,2)
		await page.evaluate(() => window.__game.movePlayer('up'));
		await step(page, 1);
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 3);
		let cur = await ss(page);
		expect(cur.litTorches, '北の狼煙 (5,2) が点かない').toContain('5,2');
		expect(cur.conditionsMet ?? [], '片方だけで封印が解けている').not.toContain('6,4');

		// 南の狼煙 (7,2)。⚠ 下は1回だけ押す＝y=6.0 で自セル row6・前方 row7。
		// 2回押すと y=6.5＝自セルが row7（狼煙の上）になり前方が row8 の砂＝空振りする。
		await page.evaluate(() => window.__game.movePlayer('down'));
		await step(page, 1);
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 3);
		cur = await ss(page);
		expect(cur.litTorches, '南の狼煙 (7,2) が点かない').toContain('7,2');
		expect(cur.conditionsMet, '両方点いても torchesLit で宝箱 (6,4) が現れない').toContain('6,4');

		expect(errors, `page errors on field 0,19:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑤ 南岸＋渚の11画面すべてが 0 pageerror で起動して動く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		// 各画面の下地が乾いた内陸側に降りる（南端 row9 は海・西端 col0 は海の画面がある）。
		const spots = [
			['0,17', 1, 5], ['0,18', 1, 5], ['0,19', 1, 5],
			['1,18', 1, 5], ['1,19', 1, 5],
			['2,15', 5, 5], ['2,18', 1, 5], ['2,19', 1, 5],
			['3,18', 1, 5], ['3,19', 1, 2], ['4,19', 1, 5],
		];
		for (const [stage, row, col] of spots) {
			await page.goto(previewUrl(stage, row, col, {
				ps_weapon: '1', ps_ladder: '1', ps_bomb: '1', ps_candle: '1',
			}));
			await waitForBoard(page);
			await page.evaluate(() => window.__game.step(20));
		}
		expect(errors, `page errors booting the desert south coast:\n${errors.join('\n')}`).toEqual([]);
	});
});
