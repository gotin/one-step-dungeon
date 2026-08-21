// tests/field-mountain-m-coast.spec.js — Phase 9-6-BASE ⑦ 山地M 東の水落ち 13画面
//
// `scripts/migrate-field-mountain-m-coast.mjs` は状態空間ソルバー（実エンジンの遷移の写し）で
// 自己検証しているが、**写しが実エンジンと食い違っていないこと**は実エンジンでしか
// 確かめられない（テスト緑でもゲームで壊れる、の再発防止）。この spec は帯の仕掛けを
// 実エンジンで踏み、13画面すべてが 0 pageerror で起動することを見る。
//
// 到着時の装備は{剣・木の盾}だけ∴到着時に解ける仕掛けは 1)2)3) の3つ。
//
//  1) 潮ゲート @ 13,14 … 'Y'(1,3) を右から斬ると links で '='(2,6)(2,7) が開き、
//     滝壺のくぼみ（下地が乾いた cols6-7）へ降りて封印の宝箱 (4,6) に届く。
//       row1:  . . . Y . . . . . . . .
//       row2:  . . . . . . = = . . . .   ← 開くまで滝壺へ入れない（左右は下地の水）
//  2) 石とボタン @ 13,12 … 1マス幅の樋（'#' で挟み '###' で底を止めた）に石 '*'(1,3) が
//     あり、押せる向きは南だけ。ボタン 'S'(3,3) に石が乗ると全ボタン成立で
//     `stonesLocked`＝ゲート 'T'(6,7) が**恒久的に**開き、囲いの宝箱 (6,9) に届く。
//     ⚠ ボタンはプレイヤーが乗っている間だけ ON（momentary）＝石で押さえるのが唯一の解。
//       row1:  . . # * # . . . . . . .
//       row3:  . . # S # . . . . . . .
//       row4:  . . # # # . . # # # # .   ← 樋の底＝石は 3,3 で止まる
//  3) スイッチとゲート @ 13,16 … 'Y'(7,2) を下から斬ると 'T'(5,6) が開き、岩室の
//     宝箱 (4,6) に届く（switchOn の封印付き）。
//  4) 爆弾 @ 14,12 … 崖の切り残し '!'(2,4) を崩すと風穴の宝箱 (2,3) に届く。
//  5) 爆弾 @ 12,17 … 崩れた門 '!'(6,6) を崩すと門の奥の宝箱 (6,5) に届く。
//  6) はしご @ 14,13 … 水路の抜けた底 'x'(5,3) ははしご無しでは渡れず、渡ると
//     袋のくぼみの宝箱 (7,3) に届く（袋だが穴を戻れる＝「入って詰む」にならない）。
//  7) ロウソク @ 14,14 … 見張りのかがり火 'H'(4,4)(4,8) はどちらも消灯
//     （initLitTorches なし）。両方点けると torchesLit で封印の宝箱 (4,6) が現れる。
//
// ⚠ 4)〜7) は「到着時の道具では解けない＝任意の袋小路の報酬」。実プレイ順で必ず解けること
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

test.describe('Phase 9-6-BASE ⑦ – 山地M 東の水落ち 13画面', () => {

	test('① 13,14 Y を斬ると潮ゲート (2,6)(2,7) が開き、滝壺の宝箱 (4,6) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// スイッチ 'Y'(1,3) の右 (1,4) から入る（row1 は下地が乾いた岸）。
		await page.goto(previewUrl('13,14', 1, 4, { ps_weapon: '1' }));
		await waitForBoard(page);

		const before = await ss(page);
		expect(before.switchToggles ?? [], '初期状態でスイッチが ON').not.toContain('1,3');
		expect(before.openGates ?? [], '初期状態で潮ゲートが開いている').not.toContain('2,6');
		expect(before.conditionsMet ?? [], '斬る前に宝箱の封印が解けている').not.toContain('4,6');

		// 斬る前は滝壺へ降りられない：'='(2,6) の手前 row1 で止まる。
		await walkTiles(page, 'right', 2);
		expect((await at(page)).c, '潮ゲートの真上 (1,6) に立てない').toBe(6);
		await walkTiles(page, 'down', 3);
		expect((await at(page)).r, '閉じた潮ゲートを歩いて通り抜けてしまった').toBe(1);

		// (1,4) に戻り、左を1回押した半歩の位置から斬る＝前方タイルが 'Y'(1,3)。
		await walkTiles(page, 'left', 2);
		await page.evaluate(() => window.__game.movePlayer('left'));
		await step(page, 1);
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 3);
		await page.evaluate(() => window.__game.movePlayer('right'));
		await step(page, 1);

		const after = await ss(page);
		expect(after.switchToggles, '剣で Y(1,3) がトグルされない').toContain('1,3');
		expect(after.openGates, 'links 経由で潮ゲート (2,6) が開かない').toContain('2,6');
		expect(after.openGates, 'links 経由で潮ゲート (2,7) が開かない').toContain('2,7');
		expect(after.conditionsMet, 'switchOn で宝箱 (4,6) の封印が解けない').toContain('4,6');

		// 落水が止まった → くぼみへ降りて宝箱 (4,6) を開ける。
		await walkTiles(page, 'right', 2);
		await walkTiles(page, 'down', 3);
		expect(await at(page), '潮ゲートを渡って宝箱 (4,6) に届かない').toMatchObject({ r: 4, c: 6 });
		expect((await ss(page)).openedChests, '宝箱 (4,6) が開封されない').toContain('4,6');
		expect(errors, `page errors on field 13,14:\n${errors.join('\n')}`).toEqual([]);
	});

	test('② 13,12 樋の石をボタン (3,3) へ落とすとゲート (6,7) が恒久的に開く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// まず「押す前はゲートを通り抜けられない」＝ゲートの手前 (6,6) から東へ。
		await page.goto(previewUrl('13,12', 6, 6));
		await waitForBoard(page);
		expect((await ss(page)).openGates ?? [], '押す前からゲートが開いている').not.toContain('6,7');
		await walkTiles(page, 'right', 3);
		expect((await at(page)).c, '閉じたゲート (6,7) を歩いて通り抜けてしまった').toBe(6);

		// 樋の真上 (0,3) から入り直す＝石 '*'(1,3) を押せる向きは南だけ。
		await page.goto(previewUrl('13,12', 0, 3));
		await waitForBoard(page);

		// ⚠️ 石押しは**実時間**のクールダウン（STONE_PUSH_COOLDOWN_MS = 600ms・player.js:469）が
		// あるので、`step()` を回すだけでは1回しか押せない。1押しごとに実時間を待つ。
		// 石を (1,3)→(2,3)→(3,3) と2回押す（3回目は樋の底 '###' で止まる）。
		for (let push = 0; push < 3; push++) {
			await page.evaluate(() => {
				for (let i = 0; i < 8; i++) { window.__game.movePlayer('down'); window.__game.step(1); }
			});
			await page.waitForTimeout(650);
		}
		const after = await ss(page);
		expect(after.stonePositions?.['1,3'], '石がボタン S(3,3) まで落ちない').toEqual({ r: 3, c: 3 });
		expect(after.openGates, '石がボタンに乗ってもゲート (6,7) が開かない').toContain('6,7');
		expect(after.stonesLocked, '押し込んだ石が固定されない（押し戻して詰められる）').toBe(true);

		// 樋を戻り、囲いの入口 (6,6) からゲートを抜けて宝箱 (6,9) を開ける。
		// ⚠ 歩数は**ちょうど**にする：row0 で上を余分に押すと画面遷移（北の `13,11`）が起きて
		//    以降の歩行が別ステージで空回りする（歩数を多めに取る書き方が通らない唯一の場所）。
		await walkTiles(page, 'up', 2);
		await walkTiles(page, 'right', 3);
		await walkTiles(page, 'down', 6);
		expect(await at(page), 'ゲートの手前 (6,6) に立てない').toMatchObject({ r: 6, c: 6 });
		await walkTiles(page, 'right', 3);
		expect(await at(page), '開いたゲートを抜けて宝箱 (6,9) に届かない').toMatchObject({ r: 6, c: 9 });
		expect((await ss(page)).openedChests, '宝箱 (6,9) が開封されない').toContain('6,9');

		// 囲いは行き止まりだがゲートは開いたまま＝「入って詰む」にならない。
		await dismissDialog(page);   // 回復薬（大）の取得ダイアログを閉じる
		await walkTiles(page, 'left', 3);
		expect((await at(page)).c, 'ゲートが閉じて囲いから出られず詰む').toBeLessThanOrEqual(6);
		expect(errors, `page errors on field 13,12:\n${errors.join('\n')}`).toEqual([]);
	});

	test('③ 13,16 Y を斬るとゲート (5,6) が開き、岩室の宝箱 (4,6) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 岩室の入口 'T'(5,6) の手前 (6,6) から入る＝斬る前は北へ行けない。
		await page.goto(previewUrl('13,16', 6, 6, { ps_weapon: '1' }));
		await waitForBoard(page);
		const before = await ss(page);
		expect(before.openGates ?? [], '初期状態でゲートが開いている').not.toContain('5,6');
		expect(before.conditionsMet ?? [], '斬る前に宝箱の封印が解けている').not.toContain('4,6');
		await walkTiles(page, 'up', 2);
		expect((await at(page)).r, '閉じたゲート (5,6) を歩いて通り抜けてしまった').toBe(6);

		// スイッチ 'Y'(7,2) の真下 (8,2) から斬る。
		await page.goto(previewUrl('13,16', 8, 2, { ps_weapon: '1' }));
		await waitForBoard(page);
		await page.evaluate(() => window.__game.movePlayer('up'));
		await step(page, 1);
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 3);
		await page.evaluate(() => window.__game.movePlayer('down'));
		await step(page, 1);

		const after = await ss(page);
		expect(after.switchToggles, '剣で Y(7,2) がトグルされない').toContain('7,2');
		expect(after.openGates, 'links 経由でゲート (5,6) が開かない').toContain('5,6');
		expect(after.conditionsMet, 'switchOn で宝箱 (4,6) の封印が解けない').toContain('4,6');

		// 水際（row8 col6 以東は下地の海）を避けて col5 を北上し、岩室へ入る。
		await walkTiles(page, 'right', 3);
		await walkTiles(page, 'up', 2);
		await walkTiles(page, 'right', 1);
		expect(await at(page), 'ゲートの手前 (6,6) に立てない').toMatchObject({ r: 6, c: 6 });
		await walkTiles(page, 'up', 2);
		expect(await at(page), '開いたゲートを抜けて宝箱 (4,6) に届かない').toMatchObject({ r: 4, c: 6 });
		expect((await ss(page)).openedChests, '宝箱 (4,6) が開封されない').toContain('4,6');
		expect(errors, `page errors on field 13,16:\n${errors.join('\n')}`).toEqual([]);
	});

	test('④ 14,12 崖の切り残し (2,4) は爆弾でしか崩せず、崩すと風穴の宝箱 (2,3) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 爆弾なしで入る＝'!'(2,4) の手前 col5 で止まる。
		await page.goto(previewUrl('14,12', 2, 5));
		await waitForBoard(page);
		await walkTiles(page, 'left', 3);
		expect((await at(page)).c, '爆弾なしで壊せる壁を通り抜けてしまった').toBe(5);

		// 爆弾ありで入り直す：(2,5) に置けば AOE が隣の '!'(2,4) を崩す。
		await page.goto(previewUrl('14,12', 2, 5, { ps_bomb: '1' }));
		await waitForBoard(page);
		expect((await ss(page)).brokenWalls ?? [], '最初から壁が壊れている').not.toContain('2,4');

		await page.evaluate(() => {
			window.__game.step(2);        // クールダウン解消
			window.__game.useSubItem();   // 爆弾設置
			window.__game.step(20);       // 爆発まで 2000ms（TICK_MS=120 × 20）
		});
		expect((await ss(page)).brokenWalls, '爆弾で (2,4) が壊れない').toContain('2,4');

		await walkTiles(page, 'left', 2);
		expect(await at(page), '風穴の宝箱 (2,3) に届かない').toMatchObject({ r: 2, c: 3 });
		expect((await ss(page)).openedChests, '宝箱 (2,3) が開封されない').toContain('2,3');
		expect(errors, `page errors on field 14,12:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑤ 12,17 崩れた門 (6,6) は爆弾でしか崩せず、崩すと門の奥の宝箱 (6,5) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 爆弾なしで入る＝'!'(6,6) の手前 col7 で止まる。
		await page.goto(previewUrl('12,17', 6, 7));
		await waitForBoard(page);
		await walkTiles(page, 'left', 3);
		expect((await at(page)).c, '爆弾なしで壊せる壁を通り抜けてしまった').toBe(7);

		await page.goto(previewUrl('12,17', 6, 7, { ps_bomb: '1' }));
		await waitForBoard(page);
		expect((await ss(page)).brokenWalls ?? [], '最初から壁が壊れている').not.toContain('6,6');

		await page.evaluate(() => {
			window.__game.step(2);
			window.__game.useSubItem();
			window.__game.step(20);
		});
		expect((await ss(page)).brokenWalls, '爆弾で (6,6) が壊れない').toContain('6,6');

		await walkTiles(page, 'left', 2);
		expect(await at(page), '門の奥の宝箱 (6,5) に届かない').toMatchObject({ r: 6, c: 5 });
		expect((await ss(page)).openedChests, '宝箱 (6,5) が開封されない').toContain('6,5');
		expect(errors, `page errors on field 12,17:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑥ 14,13 水路の抜けた底 (5,3) ははしごでのみ渡れ、渡ると宝箱 (7,3) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// はしごなし：穴 'x'(5,3) の手前 row4 で止まる。
		await page.goto(previewUrl('14,13', 4, 3));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getState().player.hasLadder)).toBe(false);
		await walkTiles(page, 'down', 3);
		expect((await at(page)).r, 'はしご無しで穴を渡れてしまう＝はしごが飾り').toBe(4);

		// はしごあり：穴を渡って袋のくぼみ (6,3)→(7,3) の宝箱まで届く。
		await page.goto(previewUrl('14,13', 4, 3, { ps_ladder: '1' }));
		await waitForBoard(page);
		await walkTiles(page, 'down', 3);
		expect(await at(page), 'はしごで穴 (5,3) を渡って宝箱 (7,3) に届かない').toMatchObject({ r: 7, c: 3 });
		expect((await ss(page)).openedChests, '宝箱 (7,3) が開封されない').toContain('7,3');

		// 袋は行き止まりだが穴を戻れる＝「入って詰む」にならない。
		await dismissDialog(page);   // 回復薬（大）の取得ダイアログを閉じる
		await walkTiles(page, 'up', 3);
		expect((await at(page)).r, 'くぼみから穴を戻れず詰む').toBeLessThanOrEqual(4);
		expect(errors, `page errors on field 14,13:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑦ 14,14 見張りのかがり火 2つをロウソクで点けると封印の宝箱 (4,6) が現れる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 囲いの中 (5,6)（唯一の入口 (6,6) の内側）から入る＝row5 を横に歩けば両方の
		// かがり火 'H'(4,4)(4,8) の真下に立てる。
		await page.goto(previewUrl('14,14', 5, 6, { ps_candle: '1' }));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getState().player.activeSubItem)).toBe('candle');

		const boot = await ss(page);
		expect(boot.litTorches ?? [], 'initLitTorches なしのはずが点いている').toEqual([]);
		expect(boot.conditionsMet ?? [], '点ける前に宝箱の封印が解けている').not.toContain('4,6');

		// 西のかがり火 (4,4)。⚠ 上は1回だけ押す＝y=5.0 で自セル row5・前方 row4。
		// 2回押すと y=4.5＝自セルが row4 になり前方が row3 の床＝空振りする。
		await walkTiles(page, 'left', 2);
		expect(await at(page), '西のかがり火の真下 (5,4) に立てない').toMatchObject({ r: 5, c: 4 });
		await page.evaluate(() => window.__game.movePlayer('up'));
		await step(page, 1);
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 3);
		let cur = await ss(page);
		expect(cur.litTorches, '西のかがり火 (4,4) が点かない').toContain('4,4');
		expect(cur.conditionsMet ?? [], '片方だけで封印が解けている').not.toContain('4,6');

		// 東のかがり火 (4,8)
		await page.evaluate(() => window.__game.movePlayer('down'));
		await step(page, 1);
		await walkTiles(page, 'right', 4);
		expect(await at(page), '東のかがり火の真下 (5,8) に立てない').toMatchObject({ r: 5, c: 8 });
		await page.evaluate(() => window.__game.movePlayer('up'));
		await step(page, 1);
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 3);
		cur = await ss(page);
		expect(cur.litTorches, '東のかがり火 (4,8) が点かない').toContain('4,8');
		expect(cur.conditionsMet, '両方点いても torchesLit で宝箱 (4,6) が現れない').toContain('4,6');

		expect(errors, `page errors on field 14,14:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑧ 東の水落ちの13画面すべてが 0 pageerror で起動して動く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		// 各画面の下地が乾いたセルに降りる（東端 col11 と南端 row9 が海の画面がある）。
		const spots = [
			['12,12', 7, 5], ['13,12', 0, 3], ['14,12', 2, 5],
			['12,13', 4, 3], ['13,13', 8, 5], ['14,13', 4, 3],
			['13,14', 1, 4], ['14,14', 5, 6],
			['13,15', 1, 5], ['14,15', 1, 5],
			['12,16', 1, 5], ['13,16', 8, 2], ['12,17', 6, 7],
		];
		for (const [stage, row, col] of spots) {
			await page.goto(previewUrl(stage, row, col, {
				ps_weapon: '1', ps_ladder: '1', ps_bomb: '1', ps_candle: '1',
			}));
			await waitForBoard(page);
			await page.evaluate(() => window.__game.step(20));
		}
		expect(errors, `page errors booting the mountain M east coast:\n${errors.join('\n')}`).toEqual([]);
	});
});
