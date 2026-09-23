// tests/field-snow-s-east.spec.js — Phase 9-6-BASE ⑨ 雪原S 東の縁 14画面
//
// `scripts/migrate-field-snow-s-east.mjs` は状態空間ソルバー（実エンジンの遷移の写し）で
// 自己検証しているが、**写しが実エンジンと食い違っていないこと**は実エンジンでしか
// 確かめられない（テスト緑でもゲームで壊れる、の再発防止）。この spec は帯の仕掛けを
// 実エンジンで踏み、14画面すべてが 0 pageerror で起動することを見る。
//
// 到着時の力は `_REGION_POWER.S = 6`＝{剣・盾・ブーメラン・弓・ロウソク}。
// ∴到着時に解けるのは 1)〜6) の6つ。7)〜9) は道具を得てから戻る袋小路の報酬。
//
//  1) 茂み @ 14,3 … 雪庇の蔵の唯一の入口が茂み 'u'(4,8)＝剣で刈ると宝箱 (3,8) に届く。
//  2) 茂み @ 12,9 … 霜枯れの林の唯一の青い茂み 'u'(5,2)＝刈ると宝箱 (4,2) に届く。
//     ⚠ 1) と 2) は同じ「茂み」だが囲い方が別（岩の蔵／木立の袋）＝軸の重複ではない。
//  3) 石とボタン @ 15,3 … 溶岩樋（col5・上下を 'M' で挟んだ1マス幅）の石 '*'(6,5) を
//     **北へ**3回押すとボタン 'S'(3,5) に乗り、全ボタン成立で `stonesLocked`＝
//     氷室のゲート 'T'(5,9) が恒久的に開いて宝箱 (6,9) に届く。
//     ⚠ 押せる向きは北だけ（樋の東西は 'M'・南は入口）＝手順が一意。
//  4) ロウソク @ 15,4 … 鐘楼のかがり火 'H'(4,4)(4,7) はどちらも消灯（initLitTorches なし）。
//     両方点けると torchesLit で封印の宝箱 (5,5) が現れる。
//  5) ブーメラン @ 13,9 … 氷洞のかがり火は 'H'(4,3) だけ点いている（initLitTorches）。
//     (4,6) から西へ投げると往路で (4,3) の火を拾い**復路で** (4,5) を点け、
//     続けて (4,4) から東へ投げると (4,5) の火を拾って (4,7) を点ける（木のブーメラン＝射程3）。
//     3基すべてで torchesLit ＝宝箱 (6,4) が現れる。
//     ⚠ かがり火 'H' は**実エンジンでは歩いて通れる**（`game/passable.js` の
//        `tilePassable()` は TORCH を塞いでいない）。塞いでいるのは editor 用の
//        `TILE_META.passable:false` と `scripts/lib/connectivity.mjs` だけ＝
//        **接続検査から見ると壁**∴かがり火を封印に使ってはいけない（検査だけが騙される）。
//        この spec が row5 を回り込むのは、接続検査が保証している側の道を通るため。
//  6) 弓 @ 15,7 … 氷丘の島の 'Y'(2,10) は**あらゆる軸で幅2以上の水**に囲われている
//     ＝はしごでも渡れず剣も届かない。row2 を西 (2,7) から東へ射た矢だけが当たり、
//     links で潮の戸 '='(6,5) が開いて封印の宝箱 (7,5) に届く（switchOn）。
//     ⚠ ⑨で踏んだ罠：最初は 'Y'(2,9) を**幅1**の水で囲っていた。幅1の水は
//        `canLadderCross` が縦横どちらでも渡れる＝隣に立って剣で叩けてしまい、
//        migrate の noTools 対照実験が赤くなった。幅1の水は封印にならない。
//  7) 全滅 @ 14,7 … 氷漬けの館の奥の間の宝箱 (5,5) は killAll の封印。
//  8) 爆弾 @ 15,5 … 裂け目の石室の '!'(3,3) を崩すと奥の宝箱 (3,4) に届く。
//  9) はしご @ 15,6 … 断崖の陥没穴 'x'(4,5) ははしご無しでは渡れず、渡ると宝箱 (4,6) に届く。
// 10) 笛 @ 13,8 … 氷下の鐘楼跡の宝箱 (6,5) は flutePlayed の封印。
//     ⚠️ `showConditions` だけでは開かない：playFlute（game/game.js）は `stageData.fluteEffect`
//        を読み、無い画面では「特に何も起きない」で return する（⑧で踏んだ罠）
//        ∴ステージ側の `fluteEffect{type:'reveal'}` とセットで初めて開く。
//
// ⚠ 7)〜10) は「到着時の道具では解けない＝任意の袋小路の報酬」。実プレイ順で必ず解けること
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
 * **閉じるまで movePlayer が丸ごと無視される**（player.js の getIsDialog ガード）。
 */
async function dismissDialog(page) {
	for (let i = 0; i < 6; i++) {
		if (!(await page.evaluate(() => window.__game.getState().isDialog))) return;
		await page.keyboard.press('Enter');
		await step(page, 1);
	}
	expect(await page.evaluate(() => window.__game.getState().isDialog), 'ダイアログが閉じない').toBe(false);
}

/**
 * 部屋の敵を全員倒す（killAll 条件の成立トリガー）。
 * 雑魚だけなので HP0 で即消えるが、除去→evaluateConditions は tick を跨ぐ∴待つ。
 */
async function killEveryEnemy(page) {
	await page.evaluate(() => {
		for (const e of window.__game.getEnemies()) window.__game.dealDamage(e.id, 9999);
	});
	await page.waitForFunction(() => window.__game.getEnemies().length === 0, null, { timeout: 15_000 });
}

/** プレイヤーの整数タイル座標（toTileRow/Col と同じ floor(v+0.5)）。 */
const at = (page) => page.evaluate(() => {
	const p = window.__game.getState().player;
	return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});

const ss = (page) => page.evaluate(() => window.__game.getStageState());

test.describe('Phase 9-6-BASE ⑨ – 雪原S 東の縁 14画面', () => {

	test('① 14,3 雪庇の蔵の入口は茂み (4,8)＝剣で刈ると宝箱 (3,8) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 茂みの真下 (5,8) から入る＝刈る前は蔵へ入れない。
		await page.goto(previewUrl('14,3', 5, 8, { ps_weapon: '1' }));
		await waitForBoard(page);
		await walkTiles(page, 'up', 3);
		expect((await at(page)).r, '茂みを刈らずに蔵へ入れてしまう＝茂みが飾り').toBe(5);

		// ⚠ 入り直す：上の空振りで y が半歩ずれたまま斬ると以降の歩数が1タイル狂う。
		await page.goto(previewUrl('14,3', 5, 8, { ps_weapon: '1' }));
		await waitForBoard(page);
		await face(page, 'up');
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 3);

		await walkTiles(page, 'up', 2);
		expect(await at(page), '刈った跡を通って宝箱 (3,8) に届かない').toMatchObject({ r: 3, c: 8 });
		expect((await ss(page)).openedChests, '宝箱 (3,8) が開封されない').toContain('3,8');

		// 蔵は行き止まりだが刈った入口を戻れる＝「入って詰む」にならない。
		await dismissDialog(page);
		await walkTiles(page, 'down', 2);
		expect((await at(page)).r, '蔵から出られず詰む').toBeGreaterThanOrEqual(5);
		expect(errors, `page errors on field 14,3:\n${errors.join('\n')}`).toEqual([]);
	});

	test('② 12,9 木立の袋の入口は茂み (5,2)＝剣で刈ると宝箱 (4,2) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		await page.goto(previewUrl('12,9', 6, 2, { ps_weapon: '1' }));
		await waitForBoard(page);
		await walkTiles(page, 'up', 3);
		expect((await at(page)).r, '茂みを刈らずに木立の袋へ入れてしまう').toBe(6);

		await page.goto(previewUrl('12,9', 6, 2, { ps_weapon: '1' }));
		await waitForBoard(page);
		await face(page, 'up');
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 3);

		await walkTiles(page, 'up', 2);
		expect(await at(page), '刈った跡を通って宝箱 (4,2) に届かない').toMatchObject({ r: 4, c: 2 });
		expect((await ss(page)).openedChests, '宝箱 (4,2) が開封されない').toContain('4,2');

		await dismissDialog(page);
		await walkTiles(page, 'down', 2);
		expect((await at(page)).r, '木立の袋から出られず詰む').toBeGreaterThanOrEqual(6);
		expect(errors, `page errors on field 12,9:\n${errors.join('\n')}`).toEqual([]);
	});

	test('③ 15,3 溶岩樋の石を北へ押してボタン (3,5) に乗せると氷室 (5,9) が恒久的に開く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// まず「押す前は氷室のゲートを通り抜けられない」＝ゲートの北 (4,9) から南へ。
		await page.goto(previewUrl('15,3', 4, 9));
		await waitForBoard(page);
		expect((await ss(page)).openGates ?? [], '押す前からゲートが開いている').not.toContain('5,9');
		await walkTiles(page, 'down', 3);
		expect((await at(page)).r, '閉じたゲート (5,9) を歩いて通り抜けてしまった').toBe(4);

		// 樋の南の入口 (8,5) から入り直す＝石 '*'(6,5) を押せる向きは北だけ。
		await page.goto(previewUrl('15,3', 8, 5));
		await waitForBoard(page);

		// ⚠️ 石押しは**実時間**のクールダウン（STONE_PUSH_COOLDOWN_MS = 600ms・player.js）が
		// あるので、`step()` を回すだけでは1回しか押せない。1押しごとに実時間を待つ。
		// 石を (6,5)→(5,5)→(4,5)→(3,5) と3回押す（4回目は 'M'(2,5) で止まる）。
		for (let push = 0; push < 4; push++) {
			await page.evaluate(() => {
				for (let i = 0; i < 8; i++) { window.__game.movePlayer('up'); window.__game.step(1); }
			});
			await page.waitForTimeout(650);
		}
		const after = await ss(page);
		expect(after.stonePositions?.['6,5'], '石がボタン S(3,5) まで届かない').toEqual({ r: 3, c: 5 });
		expect(after.openGates, '石がボタンに乗ってもゲート (5,9) が開かない').toContain('5,9');
		expect(after.stonesLocked, '押し込んだ石が固定されない（押し戻して詰められる）').toBe(true);

		// 樋を南へ戻り、東の氷室へ回ってゲートを抜けて宝箱 (6,9) を開ける。
		// ⚠ 石を北へ押した後のプレイヤーは石の真下（4,5）＝南へ5タイルで最下段 row9 に着く。
		await walkTiles(page, 'down', 5);
		expect((await at(page)).r, '樋を抜けて最下段 row9 まで戻れない').toBe(9);
		await walkTiles(page, 'right', 2);
		await walkTiles(page, 'up', 5);
		expect(await at(page), 'ゲートの北 (4,7) 側まで登れない').toMatchObject({ r: 4, c: 7 });
		await walkTiles(page, 'right', 2);
		await walkTiles(page, 'down', 2);
		expect(await at(page), '開いたゲートを抜けて宝箱 (6,9) に届かない').toMatchObject({ r: 6, c: 9 });
		expect((await ss(page)).openedChests, '宝箱 (6,9) が開封されない').toContain('6,9');

		// 氷室は行き止まりだがゲートは開いたまま＝「入って詰む」にならない。
		await dismissDialog(page);
		await walkTiles(page, 'up', 2);
		expect((await at(page)).r, 'ゲートが閉じて氷室から出られず詰む').toBeLessThanOrEqual(4);
		expect(errors, `page errors on field 15,3:\n${errors.join('\n')}`).toEqual([]);
	});

	test('④ 15,4 鐘楼のかがり火 2つをロウソクで点けると封印の宝箱 (5,5) が現れる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 西のかがり火の真下 (5,4) から入る。
		await page.goto(previewUrl('15,4', 5, 4, { ps_candle: '1' }));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getState().player.activeSubItem)).toBe('candle');

		const boot = await ss(page);
		expect(boot.litTorches ?? [], 'initLitTorches なしのはずが点いている').toEqual([]);
		expect(boot.conditionsMet ?? [], '点ける前に宝箱の封印が解けている').not.toContain('5,5');

		// 西のかがり火 (4,4)。上を押しても**かがり火が通行不可**で1歩も動かない＝
		// 立ち位置 (5,4) に留まったまま向きだけ north になり、前方が 'H' になる。
		// ⚠️ 2026-09-23 まで 'H' は `game/passable.js tilePassable()` が塞いでおらず
		//    （着地判定 ARRIVAL_WALL_TILES と接続検査 HARD_BLOCKED は元から壁扱い＝食い違い）、
		//    ここで半歩（y=4.5）踏み込めた∴`face('down')` で半歩を戻す細工が要った。
		//    通行判定を直した今は細工が**過剰補正**になる（y=5.5 へずれて東の看板 (6,5) で
		//    詰まり (6,4) に居残る＝実測の赤）∴細工を外した。
		await face(page, 'up');
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 3);
		let cur = await ss(page);
		expect(cur.litTorches, '西のかがり火 (4,4) が点かない').toContain('4,4');
		expect(cur.conditionsMet ?? [], '片方だけで封印が解けている').not.toContain('5,5');

		// 封印中の宝箱 (5,5) は踏んでも開かない＝東のかがり火の下 (5,7) まで通れる。
		// （かがり火が通行不可になった今、y は 5.0 のまま＝軸合わせは要らない）
		await walkTiles(page, 'right', 3);
		expect(await at(page), '東のかがり火の真下 (5,7) に立てない').toMatchObject({ r: 5, c: 7 });
		expect((await ss(page)).openedChests ?? [], '封印中の宝箱が踏んだだけで開いた').not.toContain('5,5');

		await face(page, 'up');
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 3);
		cur = await ss(page);
		expect(cur.litTorches, '東のかがり火 (4,7) が点かない').toContain('4,7');
		expect(cur.conditionsMet, '両方点いても torchesLit で宝箱 (5,5) が現れない').toContain('5,5');

		// 現れた宝箱 (5,5) を開ける（row5 を西へ2タイル＝半歩のずれは無い）。
		await walkTiles(page, 'left', 2);
		expect(await at(page), '現れた宝箱 (5,5) に届かない').toMatchObject({ r: 5, c: 5 });
		expect((await ss(page)).openedChests, '宝箱 (5,5) が開封されない').toContain('5,5');
		expect(errors, `page errors on field 15,4:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑤ 13,9 ブーメランで火を2基へ運ぶと torchesLit で宝箱 (6,4) が現れる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 中央のかがり火の東隣 (4,6) から入る。
		await page.goto(previewUrl('13,9', 4, 6, { ps_boomerang: '1' }));
		await waitForBoard(page);
		const boot = await ss(page);
		expect(boot.litTorches, 'initLitTorches で西のかがり火 (4,3) だけ点いている').toContain('4,3');
		expect(boot.litTorches).not.toContain('4,5');
		expect(boot.litTorches).not.toContain('4,7');
		expect(boot.conditionsMet ?? [], '点ける前に宝箱の封印が解けている').not.toContain('6,4');

		// 西へ投げる：往路で (4,5)(4,4) を素通りし (4,3) で火を拾い、**復路で** (4,5) を点ける。
		await page.evaluate(() => {
			window.__game.movePlayer('left');            // 西を向く（半歩＝x 5.5・タイル列は 6 のまま）
			for (let i = 0; i < 2; i++) window.__game.step(1);
			window.__game.useSubItem();
			for (let i = 0; i < 40; i++) window.__game.step(1);
		});
		let cur = await ss(page);
		expect(cur.litTorches, '復路で中央のかがり火 (4,5) を点けられない').toContain('4,5');
		expect(cur.conditionsMet ?? [], '2基だけで torchesLit が成立している').not.toContain('6,4');

		// (4,4) へ回り込む＝接続検査が壁として扱う (4,5) を避けて row5 を通る
		// （実エンジンなら 'H' を踏み越えられるが、保証されている側の道を歩く）。
		await walkTiles(page, 'down', 1);
		await walkTiles(page, 'left', 2);
		await walkTiles(page, 'up', 1);
		expect(await at(page), '中央のかがり火の西隣 (4,4) に立てない').toMatchObject({ r: 4, c: 4 });

		// 東へ投げる：往路で (4,5) の火を拾い (4,7) を点ける。
		await page.evaluate(() => {
			window.__game.movePlayer('right');
			for (let i = 0; i < 2; i++) window.__game.step(1);
			window.__game.useSubItem();
			for (let i = 0; i < 40; i++) window.__game.step(1);
		});
		cur = await ss(page);
		expect(cur.litTorches, '東のかがり火 (4,7) を点けられない').toContain('4,7');
		expect(cur.conditionsMet, '3基すべて点いても torchesLit で宝箱 (6,4) が現れない').toContain('6,4');

		// 現れた宝箱 (6,4) を開ける。
		await walkTiles(page, 'down', 2);
		expect(await at(page), '現れた宝箱 (6,4) に届かない').toMatchObject({ r: 6, c: 4 });
		expect((await ss(page)).openedChests, '宝箱 (6,4) が開封されない').toContain('6,4');
		expect(errors, `page errors on field 13,9:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑥ 15,7 氷丘の島の Y(2,10) は歩いても届かず、西から射た矢だけが潮の戸を開く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 水際の (2,7) から入る（剣も持たせる＝「剣で叩けない」ことも見る）。
		await page.goto(previewUrl('15,7', 2, 7, { ps_bow: '1', ps_weapon: '1' }));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getState().player.activeSubItem)).toBe('bow');

		const before = await ss(page);
		expect(before.switchToggles ?? [], '初期状態でスイッチが ON').not.toContain('2,10');
		expect(before.openGates ?? [], '初期状態で潮の戸が開いている').not.toContain('6,5');
		expect(before.conditionsMet ?? [], '射る前に宝箱の封印が解けている').not.toContain('7,5');

		// 東を向く：向き変更は通るが**移動は下地の水（幅2以上）で塞がれる**＝島へ歩けない。
		const stay = await page.evaluate(() => {
			for (let i = 0; i < 8; i++) { window.__game.movePlayer('right'); window.__game.step(1); }
			const p = window.__game.getState().player;
			return { x: p.x, y: p.y };
		});
		expect(stay.x, '幅2以上の水を歩いて渡れてしまう（矢だけが届くはず）').toBeCloseTo(7, 1);

		// 剣も届かない（間合いは隣接1セル＝水の上の (2,8) には立てない）。
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 3);
		expect((await ss(page)).switchToggles ?? [], '水を挟んだ Y に剣が届いてしまう').not.toContain('2,10');

		// 東へ矢を撃つ：水の上を飛んで島の 'Y' に当たる（矢を止めるのは '#' と未破壊 '!' だけ）。
		const after = await page.evaluate(() => {
			window.__game.useSubItem();
			for (let i = 0; i < 24; i++) window.__game.step(1);
			return window.__game.getStageState();
		});
		expect(after.switchToggles, '矢が島の Y(2,10) をトグルしない').toContain('2,10');
		expect(after.openGates, 'links 経由で潮の戸 (6,5) が開かない').toContain('6,5');
		expect(after.conditionsMet, 'switchOn で宝箱 (7,5) の封印が解けない').toContain('7,5');

		// 開いた戸を抜けて宝箱 (7,5) を開ける。
		await walkTiles(page, 'down', 3);
		await walkTiles(page, 'left', 2);
		expect(await at(page), '戸の北 (5,5) に立てない').toMatchObject({ r: 5, c: 5 });
		await walkTiles(page, 'down', 2);
		expect(await at(page), '開いた戸を抜けて宝箱 (7,5) に届かない').toMatchObject({ r: 7, c: 5 });
		expect((await ss(page)).openedChests, '宝箱 (7,5) が開封されない').toContain('7,5');

		// 桝は行き止まりだが戸は開いたまま＝「入って詰む」にならない。
		await dismissDialog(page);
		await walkTiles(page, 'up', 2);
		expect((await at(page)).r, '戸が閉じて桝から出られず詰む').toBeLessThanOrEqual(5);
		expect(errors, `page errors on field 15,7:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑦ 14,7 奥の間の宝箱 (5,5) は killAll＝3体倒すまで現れない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 奥の間の中 (4,5) から入る。
		await page.goto(previewUrl('14,7', 4, 5, { ps_weapon: '1' }));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getEnemies().length), '敵が3体いない').toBe(3);
		expect((await ss(page)).conditionsMet ?? [], '倒す前に封印が解けている').not.toContain('5,5');

		// 封印中は踏んでも開かない。
		await walkTiles(page, 'down', 1);
		expect(await at(page), '奥の間の (5,5) に立てない').toMatchObject({ r: 5, c: 5 });
		expect((await ss(page)).openedChests ?? [], '封印中の宝箱が踏んだだけで開いた').not.toContain('5,5');

		await killEveryEnemy(page);
		expect((await ss(page)).conditionsMet, '全滅しても killAll で宝箱 (5,5) が現れない').toContain('5,5');

		// 現れた箱を踏んで開ける（一度離れて戻る）。
		await walkTiles(page, 'up', 1);
		await walkTiles(page, 'down', 1);
		expect((await ss(page)).openedChests, '現れた宝箱 (5,5) が開封されない').toContain('5,5');
		expect(errors, `page errors on field 14,7:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑧ 15,5 裂け目の岩 (3,3) は爆弾でしか崩せず、崩すと宝箱 (3,4) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 爆弾なしで入る＝'!'(3,3) の手前 col2 で止まる。
		await page.goto(previewUrl('15,5', 3, 2));
		await waitForBoard(page);
		await walkTiles(page, 'right', 3);
		expect((await at(page)).c, '爆弾なしで壊せる岩を通り抜けてしまった').toBe(2);

		await page.goto(previewUrl('15,5', 3, 2, { ps_bomb: '1' }));
		await waitForBoard(page);
		expect((await ss(page)).brokenWalls ?? [], '最初から岩が壊れている').not.toContain('3,3');

		await page.evaluate(() => {
			window.__game.step(2);        // クールダウン解消
			window.__game.useSubItem();   // 爆弾設置
			window.__game.step(20);       // 爆発まで 2000ms（TICK_MS=120 × 20）
		});
		expect((await ss(page)).brokenWalls, '爆弾で (3,3) が壊れない').toContain('3,3');

		await walkTiles(page, 'right', 2);
		expect(await at(page), '石室の宝箱 (3,4) に届かない').toMatchObject({ r: 3, c: 4 });
		expect((await ss(page)).openedChests, '宝箱 (3,4) が開封されない').toContain('3,4');

		// 石室は行き止まりだが崩した跡を戻れる＝「入って詰む」にならない。
		await dismissDialog(page);
		await walkTiles(page, 'left', 2);
		expect((await at(page)).c, '石室から出られず詰む').toBeLessThanOrEqual(2);
		expect(errors, `page errors on field 15,5:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑨ 15,6 断崖の陥没穴 (4,5) ははしごでのみ渡れ、渡ると宝箱 (4,6) に届く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// はしごなし：穴 'x'(4,5) の手前 col4 で止まる。
		await page.goto(previewUrl('15,6', 4, 4));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getState().player.hasLadder)).toBe(false);
		await walkTiles(page, 'right', 3);
		expect((await at(page)).c, 'はしご無しで穴を渡れてしまう＝はしごが飾り').toBe(4);

		// はしごあり：穴を渡って宝箱 (4,6) まで届く。
		await page.goto(previewUrl('15,6', 4, 4, { ps_ladder: '1' }));
		await waitForBoard(page);
		await walkTiles(page, 'right', 2);
		expect(await at(page), 'はしごで穴 (4,5) を渡って宝箱 (4,6) に届かない').toMatchObject({ r: 4, c: 6 });
		expect((await ss(page)).openedChests, '宝箱 (4,6) が開封されない').toContain('4,6');

		// 岩で囲われた行き止まりだが穴を戻れる＝「入って詰む」にならない。
		await dismissDialog(page);
		await walkTiles(page, 'left', 2);
		expect((await at(page)).c, '穴を戻れず詰む').toBeLessThanOrEqual(4);
		expect(errors, `page errors on field 15,6:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑩ 13,8 氷下の宝箱 (6,5) は笛を吹いて初めて現れる（fluteEffect が要る）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 礎石の内側 (5,5) から入る＝吹く前は封印されたまま。
		await page.goto(previewUrl('13,8', 5, 5, { ps_flute: '1' }));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getState().player.activeSubItem)).toBe('flute');

		const before = await ss(page);
		expect(before.flutePlayed, '吹く前から flutePlayed が立っている').toBe(false);
		expect(before.conditionsMet ?? [], '吹く前に宝箱の封印が解けている').not.toContain('6,5');

		// 封印中は踏んでも開かない。
		await walkTiles(page, 'down', 1);
		expect(await at(page), '鐘楼跡の中央 (6,5) に立てない').toMatchObject({ r: 6, c: 5 });
		expect((await ss(page)).openedChests ?? [], '封印中の宝箱が踏んだだけで開いた').not.toContain('6,5');

		// 笛を吹く＝fluteEffect{type:'reveal'} が無いと何も起きない（⑧で踏んだ罠）。
		await page.evaluate(() => window.__game.useSubItem());
		await step(page, 3);
		const after = await ss(page);
		expect(after.flutePlayed, '笛を吹いても flutePlayed が立たない＝fluteEffect が無い').toBe(true);
		expect(after.conditionsMet, 'flutePlayed で宝箱 (6,5) の封印が解けない').toContain('6,5');

		// 現れた箱を踏んで開ける（一度離れて戻る）。
		await walkTiles(page, 'up', 1);
		await walkTiles(page, 'down', 1);
		expect((await ss(page)).openedChests, '現れた宝箱 (6,5) が開封されない').toContain('6,5');
		expect(errors, `page errors on field 13,8:\n${errors.join('\n')}`).toEqual([]);
	});

	test('⑪ 雪原S 東の縁の14画面すべてが 0 pageerror で起動して動く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		// 各画面の下地が乾いたセルに降りる（東端 col11 と入江が水/海の画面がある）。
		const spots = [
			['14,3', 7, 2], ['15,3', 8, 5], ['15,4', 5, 4], ['15,5', 5, 5],
			['14,6', 5, 5], ['15,6', 7, 2],
			['13,7', 2, 2], ['14,7', 8, 5], ['15,7', 2, 7],
			['12,8', 7, 7], ['13,8', 2, 5], ['14,8', 5, 4],
			['12,9', 6, 2], ['13,9', 4, 6],
		];
		for (const [stage, row, col] of spots) {
			await page.goto(previewUrl(stage, row, col, {
				ps_weapon: '1', ps_ladder: '1', ps_bomb: '1', ps_candle: '1',
				ps_flute: '1', ps_bow: '1', ps_boomerang: '1',
			}));
			await waitForBoard(page);
			await page.evaluate(() => window.__game.step(20));
		}
		expect(errors, `page errors booting the snow S east edge:\n${errors.join('\n')}`).toEqual([]);
	});
});
