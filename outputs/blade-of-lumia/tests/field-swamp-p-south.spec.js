// tests/field-swamp-p-south.spec.js — Phase 9-6-BASE ⑧ 沼P 南岸 14画面
//
// `scripts/migrate-field-swamp-p-south.mjs` は状態空間ソルバー（実エンジンの遷移の写し）で
// 自己検証しているが、**写しが実エンジンと食い違っていないこと**は実エンジンでしか
// 確かめられない（テスト緑でもゲームで壊れる、の再発防止）。この spec は帯の仕掛けを
// 実エンジンで踏み、14画面すべてが 0 pageerror で起動することを見る。
//
// 到着時の装備は{剣・木の盾}だけ∴到着時に解けるのは 1)2)3) の3つ。
//
//  1) スイッチと水門 @ 12,15 … 'Y'(7,2) を右から斬ると links で '='(5,5) が開き、
//     石畳の桝の中の封印の宝箱 (3,5) に届く（switchOn）。
//  2) 石とボタン @ 11,16 … 1マス幅の樋（'#' で上下を挟み '#'(3,7) で東の端を止めた）に
//     石 '*'(3,3) があり、押せる向きは東だけ。ボタン 'S'(3,6) に石が乗ると全ボタン成立で
//     `stonesLocked`＝門番小屋のゲート 'T'(7,6) が**恒久的に**開き、宝箱 (7,5) に届く。
//     ⚠ ボタンはプレイヤーが乗っている間だけ ON（momentary）＝石で押さえるのが唯一の解。
//       row2:  . . # # # # # # . . . .
//       row3:  . . . * . . S # . . . .   ← 石は 3,6 のボタンで止まる（東は '#'）
//       row4:  . . # # # # # # . . . .
//  3) 茂み @ 12,14 … 棚田の桝の唯一の入口が茂み 'u'(6,4)＝剣で刈ると宝箱 (4,4) に届く。
//  4) 爆弾 @ 11,17 … 物置の崩れ壁 '!'(7,9) を崩すと奥の宝箱 (7,8) に届く。
//  5) ロウソク @ 11,18 … 墓所のかがり火 'H'(3,4)(3,6) はどちらも消灯（initLitTorches なし）。
//     両方点けると torchesLit で封印の宝箱 (5,5) が現れる。
//  6) はしご @ 10,18 … 桟道の抜けた床 'x'(5,7) ははしご無しでは渡れず、渡ると
//     宝箱 (6,7) に届く（袋だが穴を戻れる＝「入って詰む」にならない）。
//  7) スイッチとゲート @ 10,19 … 'Y'(6,3) を右から斬ると 'T'(4,5) が開き、岩室の
//     宝箱 (3,5) に届く（switchOn の封印付き）。
//  8) 笛 @ 8,19 … 祭壇の宝箱 (5,5) は flutePlayed の封印。
//     ⚠️ `showConditions` だけでは開かない：playFlute（game/game.js:1554）は
//        `stageData.fluteEffect` を読み、無い画面では「特に何も起きない」で return する
//        ∴ステージ側の `fluteEffect{type:'reveal'}` とセットで初めて開く（⑧で踏んだ罠。
//        同じ欠落だった既存の `11,14` `13,15` も `scripts/fix-flute-reveal-missing.mjs` で直した）。
//
// ⚠ 4)〜8) は「到着時の道具では解けない＝任意の袋小路の報酬」。実プレイ順で必ず解けること
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

/** 向きだけ変える（半歩は同じタイルに留まる＝前方タイルが目標になる）。 */
async function face(page, dir) {
	await page.evaluate(d => window.__game.movePlayer(d), dir);
	await step(page, 1);
}

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

test.describe('Phase 9-6-BASE ⑧ – 沼P 南岸 14画面', () => {

	test('① 12,15 Y を斬ると水門 (5,5) が開き、桝の宝箱 (3,5) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// スイッチ 'Y'(7,2) の右 (7,3) から入る。
		await page.goto(previewUrl('12,15', 7, 3, { ps_weapon: '1' }));
		await waitForBoard(page);

		const before = await ss(page);
		expect(before.switchToggles ?? [], '初期状態でスイッチが ON').not.toContain('7,2');
		expect(before.openGates ?? [], '初期状態で水門が開いている').not.toContain('5,5');
		expect(before.conditionsMet ?? [], '斬る前に宝箱の封印が解けている').not.toContain('3,5');

		// 斬る前は桝に入れない：'='(5,5) の手前 row6 で止まる。
		await walkTiles(page, 'up', 1);
		await walkTiles(page, 'right', 2);
		expect(await at(page), '水門の真下 (6,5) に立てない').toMatchObject({ r: 6, c: 5 });
		await walkTiles(page, 'up', 3);
		expect((await at(page)).r, '閉じた水門を歩いて通り抜けてしまった').toBe(6);

		// (7,3) に戻り、左を1回押した半歩の位置から斬る＝前方タイルが 'Y'(7,2)。
		await walkTiles(page, 'left', 2);
		await walkTiles(page, 'down', 1);
		expect(await at(page), 'スイッチの右 (7,3) に戻れない').toMatchObject({ r: 7, c: 3 });
		await face(page, 'left');
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 3);
		await face(page, 'right');

		const after = await ss(page);
		expect(after.switchToggles, '剣で Y(7,2) がトグルされない').toContain('7,2');
		expect(after.openGates, 'links 経由で水門 (5,5) が開かない').toContain('5,5');
		expect(after.conditionsMet, 'switchOn で宝箱 (3,5) の封印が解けない').toContain('3,5');

		// 水門が開いた → 桝へ入って宝箱 (3,5) を開ける。
		await walkTiles(page, 'up', 1);
		await walkTiles(page, 'right', 2);
		await walkTiles(page, 'up', 3);
		expect(await at(page), '水門を抜けて宝箱 (3,5) に届かない').toMatchObject({ r: 3, c: 5 });
		expect((await ss(page)).openedChests, '宝箱 (3,5) が開封されない').toContain('3,5');
		expect(errors, `page errors on field 12,15:\n${errors.join('\n')}`).toEqual([]);
	});

	test('② 11,16 樋の石をボタン (3,6) へ押すとゲート (7,6) が恒久的に開く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// まず「押す前はゲートを通り抜けられない」＝小屋の東 (7,8) から西へ。
		await page.goto(previewUrl('11,16', 7, 8));
		await waitForBoard(page);
		expect((await ss(page)).openGates ?? [], '押す前からゲートが開いている').not.toContain('7,6');
		await walkTiles(page, 'left', 3);
		expect((await at(page)).c, '閉じたゲート (7,6) を歩いて通り抜けてしまった').toBe(7);

		// 樋の西端 (3,2) から入り直す＝石 '*'(3,3) を押せる向きは東だけ。
		await page.goto(previewUrl('11,16', 3, 2));
		await waitForBoard(page);

		// ⚠️ 石押しは**実時間**のクールダウン（STONE_PUSH_COOLDOWN_MS = 600ms・player.js:469）が
		// あるので、`step()` を回すだけでは1回しか押せない。1押しごとに実時間を待つ。
		// 石を (3,3)→(3,4)→(3,5)→(3,6) と3回押す（4回目は '#'(3,7) で止まる）。
		for (let push = 0; push < 4; push++) {
			await page.evaluate(() => {
				for (let i = 0; i < 8; i++) { window.__game.movePlayer('right'); window.__game.step(1); }
			});
			await page.waitForTimeout(650);
		}
		const after = await ss(page);
		expect(after.stonePositions?.['3,3'], '石がボタン S(3,6) まで届かない').toEqual({ r: 3, c: 6 });
		expect(after.openGates, '石がボタンに乗ってもゲート (7,6) が開かない').toContain('7,6');
		expect(after.stonesLocked, '押し込んだ石が固定されない（押し戻して詰められる）').toBe(true);

		// 樋を西へ戻り、row5 を回って小屋の東 (7,8) からゲートを抜けて宝箱 (7,5) を開ける。
		await walkTiles(page, 'left', 4);
		expect((await at(page)).c, '樋の西端まで戻れない').toBeLessThanOrEqual(2);
		await walkTiles(page, 'down', 2);
		await walkTiles(page, 'right', 7);
		await walkTiles(page, 'down', 2);
		expect(await at(page), '小屋の東 (7,8) に立てない').toMatchObject({ r: 7, c: 8 });
		await walkTiles(page, 'left', 3);
		expect(await at(page), '開いたゲートを抜けて宝箱 (7,5) に届かない').toMatchObject({ r: 7, c: 5 });
		expect((await ss(page)).openedChests, '宝箱 (7,5) が開封されない').toContain('7,5');

		// 小屋は行き止まりだがゲートは開いたまま＝「入って詰む」にならない。
		await dismissDialog(page);
		await walkTiles(page, 'right', 3);
		expect((await at(page)).c, 'ゲートが閉じて小屋から出られず詰む').toBeGreaterThanOrEqual(7);
		expect(errors, `page errors on field 11,16:\n${errors.join('\n')}`).toEqual([]);
	});

	test('③ 12,14 棚田の桝の入口は茂み (6,4)＝剣で刈ると宝箱 (4,4) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 茂みの真下 (7,4) から入る＝刈る前は桝へ入れない。
		await page.goto(previewUrl('12,14', 7, 4, { ps_weapon: '1' }));
		await waitForBoard(page);
		await walkTiles(page, 'up', 3);
		expect((await at(page)).r, '茂みを刈らずに桝へ入れてしまう＝茂みが飾り').toBe(7);

		// ⚠ 入り直す：上の空振りで y が半歩ずれたまま斬ると、以降の歩数が1タイル狂う
		//    （茂みで movePlayer が拒まれる回数が状態依存＝再現しない歩数になる）。
		await page.goto(previewUrl('12,14', 7, 4, { ps_weapon: '1' }));
		await waitForBoard(page);

		// 上を1回押して向きだけ変える（茂みは通れない∴y は 7.0 のまま）＝前方が 'u'(6,4)。
		await face(page, 'up');
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 3);

		await walkTiles(page, 'up', 3);
		expect(await at(page), '刈った跡を通って宝箱 (4,4) に届かない').toMatchObject({ r: 4, c: 4 });
		expect((await ss(page)).openedChests, '宝箱 (4,4) が開封されない').toContain('4,4');

		// 桝は行き止まりだが刈った入口を戻れる＝「入って詰む」にならない。
		await dismissDialog(page);
		await walkTiles(page, 'down', 3);
		expect((await at(page)).r, '桝から出られず詰む').toBeGreaterThanOrEqual(7);
		expect(errors, `page errors on field 12,14:\n${errors.join('\n')}`).toEqual([]);
	});

	test('④ 11,17 物置の崩れ壁 (7,9) は爆弾でしか崩せず、崩すと宝箱 (7,8) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 爆弾なしで入る＝'!'(7,9) の手前 col10 で止まる。
		await page.goto(previewUrl('11,17', 7, 10));
		await waitForBoard(page);
		await walkTiles(page, 'left', 3);
		expect((await at(page)).c, '爆弾なしで壊せる壁を通り抜けてしまった').toBe(10);

		await page.goto(previewUrl('11,17', 7, 10, { ps_bomb: '1' }));
		await waitForBoard(page);
		expect((await ss(page)).brokenWalls ?? [], '最初から壁が壊れている').not.toContain('7,9');

		await page.evaluate(() => {
			window.__game.step(2);        // クールダウン解消
			window.__game.useSubItem();   // 爆弾設置
			window.__game.step(20);       // 爆発まで 2000ms（TICK_MS=120 × 20）
		});
		expect((await ss(page)).brokenWalls, '爆弾で (7,9) が壊れない').toContain('7,9');

		await walkTiles(page, 'left', 2);
		expect(await at(page), '物置の奥の宝箱 (7,8) に届かない').toMatchObject({ r: 7, c: 8 });
		expect((await ss(page)).openedChests, '宝箱 (7,8) が開封されない').toContain('7,8');
		expect(errors, `page errors on field 11,17:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑤ 11,18 墓所のかがり火 2つをロウソクで点けると封印の宝箱 (5,5) が現れる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 霊廟の唯一の入口 (6,5) から入る＝row3 まで上がれば両方のかがり火の隣に立てる。
		await page.goto(previewUrl('11,18', 6, 5, { ps_candle: '1' }));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getState().player.activeSubItem)).toBe('candle');

		const boot = await ss(page);
		expect(boot.litTorches ?? [], 'initLitTorches なしのはずが点いている').toEqual([]);
		expect(boot.conditionsMet ?? [], '点ける前に宝箱の封印が解けている').not.toContain('5,5');

		// 封印中の宝箱 (5,5) は踏んでも開かない＝奥 (3,5) まで通れる。
		await walkTiles(page, 'up', 3);
		expect(await at(page), 'かがり火の間 (3,5) に立てない').toMatchObject({ r: 3, c: 5 });
		expect((await ss(page)).openedChests ?? [], '封印中の宝箱が踏んだだけで開いた').not.toContain('5,5');

		// 西のかがり火 (3,4)。⚠ 横も1回だけ押す＝半歩は同じタイルに留まり前方が 'H' になる。
		await face(page, 'left');
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 3);
		let cur = await ss(page);
		expect(cur.litTorches, '西のかがり火 (3,4) が点かない').toContain('3,4');
		expect(cur.conditionsMet ?? [], '片方だけで封印が解けている').not.toContain('5,5');

		// 東のかがり火 (3,6)
		await face(page, 'right');
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 3);
		cur = await ss(page);
		expect(cur.litTorches, '東のかがり火 (3,6) が点かない').toContain('3,6');
		expect(cur.conditionsMet, '両方点いても torchesLit で宝箱 (5,5) が現れない').toContain('5,5');

		// 現れた宝箱を開ける（霊廟の中央 (5,5)）。
		await walkTiles(page, 'down', 2);
		expect(await at(page), '現れた宝箱 (5,5) に届かない').toMatchObject({ r: 5, c: 5 });
		expect((await ss(page)).openedChests, '宝箱 (5,5) が開封されない').toContain('5,5');
		expect(errors, `page errors on field 11,18:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑥ 10,18 桟道の抜けた床 (5,7) ははしごでのみ渡れ、渡ると宝箱 (6,7) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// はしごなし：穴 'x'(5,7) の手前 row4 で止まる。
		await page.goto(previewUrl('10,18', 4, 7));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getState().player.hasLadder)).toBe(false);
		await walkTiles(page, 'down', 3);
		expect((await at(page)).r, 'はしご無しで穴を渡れてしまう＝はしごが飾り').toBe(4);

		// はしごあり：穴を渡って台の宝箱 (6,7) まで届く。
		await page.goto(previewUrl('10,18', 4, 7, { ps_ladder: '1' }));
		await waitForBoard(page);
		await walkTiles(page, 'down', 2);
		expect(await at(page), 'はしごで穴 (5,7) を渡って宝箱 (6,7) に届かない').toMatchObject({ r: 6, c: 7 });
		expect((await ss(page)).openedChests, '宝箱 (6,7) が開封されない').toContain('6,7');

		// 台は水に囲われた行き止まりだが穴を戻れる＝「入って詰む」にならない。
		await dismissDialog(page);
		await walkTiles(page, 'up', 2);
		expect((await at(page)).r, '台から穴を戻れず詰む').toBeLessThanOrEqual(4);
		expect(errors, `page errors on field 10,18:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑦ 10,19 Y を斬るとゲート (4,5) が開き、岩室の宝箱 (3,5) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 岩室の入口 'T'(4,5) の下 (6,5) から入る＝斬る前は北へ行けない。
		await page.goto(previewUrl('10,19', 6, 5, { ps_weapon: '1' }));
		await waitForBoard(page);
		const before = await ss(page);
		expect(before.openGates ?? [], '初期状態でゲートが開いている').not.toContain('4,5');
		expect(before.conditionsMet ?? [], '斬る前に宝箱の封印が解けている').not.toContain('3,5');
		await walkTiles(page, 'up', 3);
		expect((await at(page)).r, '閉じたゲート (4,5) を歩いて通り抜けてしまった').toBe(5);

		// スイッチ 'Y'(6,3) の右 (6,4) から斬る。
		await walkTiles(page, 'down', 1);
		await walkTiles(page, 'left', 1);
		expect(await at(page), 'スイッチの右 (6,4) に立てない').toMatchObject({ r: 6, c: 4 });
		await face(page, 'left');
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 3);
		await face(page, 'right');

		const after = await ss(page);
		expect(after.switchToggles, '剣で Y(6,3) がトグルされない').toContain('6,3');
		expect(after.openGates, 'links 経由でゲート (4,5) が開かない').toContain('4,5');
		expect(after.conditionsMet, 'switchOn で宝箱 (3,5) の封印が解けない').toContain('3,5');

		await walkTiles(page, 'right', 1);
		await walkTiles(page, 'up', 3);
		expect(await at(page), '開いたゲートを抜けて宝箱 (3,5) に届かない').toMatchObject({ r: 3, c: 5 });
		expect((await ss(page)).openedChests, '宝箱 (3,5) が開封されない').toContain('3,5');
		expect(errors, `page errors on field 10,19:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑧ 8,19 祭壇の宝箱 (5,5) は笛を吹いて初めて現れる（fluteEffect が要る）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 壇の上 (4,5) から入る＝吹く前は封印されたまま。
		await page.goto(previewUrl('8,19', 4, 5, { ps_flute: '1' }));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getState().player.activeSubItem)).toBe('flute');

		const before = await ss(page);
		expect(before.flutePlayed, '吹く前から flutePlayed が立っている').toBe(false);
		expect(before.conditionsMet ?? [], '吹く前に宝箱の封印が解けている').not.toContain('5,5');

		// 封印中は踏んでも開かない。
		await walkTiles(page, 'down', 1);
		expect(await at(page), '壇の中央 (5,5) に立てない').toMatchObject({ r: 5, c: 5 });
		expect((await ss(page)).openedChests ?? [], '封印中の宝箱が踏んだだけで開いた').not.toContain('5,5');

		// 笛を吹く＝fluteEffect{type:'reveal'} が無いと何も起きない（⑧で踏んだ罠）。
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 3);
		const after = await ss(page);
		expect(after.flutePlayed, '笛を吹いても flutePlayed が立たない＝fluteEffect が無い').toBe(true);
		expect(after.conditionsMet, 'flutePlayed で宝箱 (5,5) の封印が解けない').toContain('5,5');

		// 現れた箱を踏んで開ける（一度離れて戻る）。
		await walkTiles(page, 'up', 1);
		await walkTiles(page, 'down', 1);
		expect((await ss(page)).openedChests, '現れた宝箱 (5,5) が開封されない').toContain('5,5');
		expect(errors, `page errors on field 8,19:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑨ 沼P 南岸の14画面すべてが 0 pageerror で起動して動く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		// 各画面の下地が乾いたセルに降りる（東端 col11 と南端 row9 が水/海の画面がある）。
		const spots = [
			['12,14', 7, 4], ['12,15', 7, 3],
			['11,16', 3, 2], ['11,17', 7, 10], ['11,18', 6, 5],
			['10,17', 4, 5], ['10,18', 4, 7], ['10,19', 6, 5],
			['9,17', 6, 5], ['9,18', 8, 6], ['9,19', 8, 6],
			['8,18', 6, 4], ['8,19', 4, 5], ['7,19', 7, 5],
		];
		for (const [stage, row, col] of spots) {
			await page.goto(previewUrl(stage, row, col, {
				ps_weapon: '1', ps_ladder: '1', ps_bomb: '1', ps_candle: '1', ps_flute: '1',
			}));
			await waitForBoard(page);
			await page.evaluate(() => window.__game.step(20));
		}
		expect(errors, `page errors booting the swamp P south coast:\n${errors.join('\n')}`).toEqual([]);
	});
});
