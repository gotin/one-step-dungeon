// Phase 4.55 回帰テスト：全ボタンに石を乗せると全ゲートが開く（新ルール①）を
// 「実際の入力経路（movePlayer で半セルずつ動かす）」で検証する。
//
// これは 2e53234 で入れた refreshGates() の新仕様
//   「1ステージの全ボタン S が ON → 全ゲート T を開く」
// が、実機（プレビュー field 10,14）で発火しなかったバグ(1) を捕まえるためのもの。
// 全437テストが緑だったのに実機で壊れていた＝新ルールを「実際に踏む」テストが
// 1つも無かった穴を塞ぐ。
//
// 使うステージ：field 10,14（ユーザー自作パズル・石4/ボタン4/ゲート2）。
//          0123456789AB
//   row2: f..P>......f   P=princess(2,3) / >=入口(2,4)
//   row3: f....S.....f   S=button(3,5)
//   row5: .....**S....   S=button(5,7) stones(5,5)(5,6)
//   row6: f...S.*....f   S=button(6,4) stone(6,6)
//   row7: f....*.....f   stone(7,5)
//   row8: f.....S..i.f   S=button(8,6)
//   row9: fffffTTfffff   T=gate(9,5)(9,6)
//
// 4個の石をすべて4個のボタンへ押し込むと、gate 9,5 と 9,6 が開く。
// solver（scripts/lib/blade-solver.mjs）が全ボタン充足の最短手を求めた経路を再生する。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl(row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: 'field', stage: '10,14',
		row: String(row), col: String(col),
	});
	return `${GAME}?${p.toString()}`;
}

// 全ボタンを石で埋める最短手の「通過セル列」（solver が P/入口を避けた 1,1 スタート
// で求めた経路）。各セルへ「到達するまで movePlayer を繰り返す」ことで、通常移動
// （MOVE_STEP=0.5＝1セル2回）と石押し（1回で1セル・整列時のみ発火）の両方を
// 区別せず正しく再生できる（バグ(2)修正後は整列してからでないと押せないため）。
const WAYPOINTS = [
	'1,1','2,1','3,1','4,1','5,1','6,1','6,2','6,3','6,4','6,5',
	'5,5','4,5','5,5','5,6','6,6','7,6','7,5','8,5','8,4','7,4',
];

test.describe('Blade of Lumia – 石＋ボタン→全ゲート開（Phase 4.55）', () => {
	test('全ボタンに石を乗せると gate 9,5 / 9,6 が開く', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		await page.goto(previewUrl(1, 1));
		await waitForBoard(page);
		await page.evaluate(() => window.__game.pause());   // 実ループの余分な tick を止める

		// 初期状態：ゲートは閉じている
		const ss0 = await page.evaluate(() => window.__game.getStageState());
		expect(ss0.openGates).not.toContain('9,5');

		// プレイヤーの生 float 座標を返す。到達判定は「セル中心＝整数座標に一致」で行う。
		// ⚠️ Math.floor(y+0.5) で丸めると半セル位置（y=1.5）を row2 と誤認して早期停止し、
		// 以降ずっと半セル＝グリッド非整列になり縦の石押しが発火しない（バグ(2)修正の帰結）。
		const pos = async () => page.evaluate(() => {
			const p = window.__game.getState().player;
			return { x: p.x, y: p.y };
		});

		// 各ウェイポイント（セル中心）へ、整数座標に到達するまで movePlayer を繰り返す。
		// 通常移動は半セル刻み（1セル=2回）、石押しは1回で1セル動く。どちらもセル中心
		// （整数）で停止するので「整数一致」を到達条件にすれば両方を区別せず再生できる。
		// 石押しには実時間クールダウン（600ms）があるので毎呼び出し後に待つ。
		for (let i = 1; i < WAYPOINTS.length; i++) {
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

		const ss = await page.evaluate(() => window.__game.getStageState());
		// 4個の石が4個のボタンに乗っている
		const buttons = ['3,5', '5,7', '6,4', '8,6'];
		for (const b of buttons) {
			const [r, c] = b.split(',').map(Number);
			const on = Object.values(ss.stonePositions).some(s => s.r === r && s.c === c);
			expect(on, `石がボタン ${b} に乗っている`).toBe(true);
			expect(ss.switchStates[b], `ボタン ${b} が ON`).toBe(true);
		}
		// 全ゲートが開いている
		expect(ss.openGates).toContain('9,5');
		expect(ss.openGates).toContain('9,6');

		// Phase 4.56: 全ボタンONを一度達成した瞬間に石がロックされる（恒久）。
		// ⚠️ このテストは fromEditor プレビュー＝debugMode=true 経路（壁/石すり抜け許可）
		// なので「押そうとしても動かない」の実証はここではできない（debugMode だと通常移動が
		// 素通りする）。その実証は tests/stone-lock.spec.js（非デバッグのセーブ経由）が担う。
		// ここではロックフラグと、石位置・ゲート状態が変わらないことだけを確認する。
		expect(ss.stonesLocked, '全ボタンON達成でロックが立つ').toBe(true);
		expect(ss.switchStates['6,4'], 'ロック直後もボタン 6,4 は ON のまま').toBe(true);
		expect(ss.openGates, 'ロック直後もゲートは開いたまま').toContain('9,5');
		expect(ss.openGates).toContain('9,6');

		expect(errors).toEqual([]);
	});

	// ロック導入前の閉側検証（旧テストの後半）を分離：全ボタンONに達する「前」に
	// 1個だけボタンへ乗せて外す形で refreshGates() の閉じ側ロジックを検証する
	// （vacuous pass 防止＝新ルールが実際に閉じ側も動くことの確認）。
	test('全ボタンONに達する前は、ボタンから石が外れるとゲートは閉じたまま', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		await page.goto(previewUrl(1, 1));
		await waitForBoard(page);
		await page.evaluate(() => window.__game.pause());

		const pos = async () => page.evaluate(() => {
			const p = window.__game.getState().player;
			return { x: p.x, y: p.y };
		});
		const moveTo = async (waypoints) => {
			for (let i = 1; i < waypoints.length; i++) {
				const [tr, tc] = waypoints[i].split(',').map(Number);
				const [fr, fc] = waypoints[i - 1].split(',').map(Number);
				const dir = tr < fr ? 'up' : tr > fr ? 'down' : tc < fc ? 'left' : 'right';
				await page.evaluate((d) => window.__game.setHeroDir(d), dir);
				for (let guard = 0; guard < 6; guard++) {
					const p = await pos();
					if (p.x === tc && p.y === tr) break;
					await page.evaluate((d) => window.__game.movePlayer(d), dir);
					await page.waitForTimeout(650);
				}
			}
		};

		// 石(6,6)をボタン(6,4)へ1個だけ押し込む（他のボタンは ON にしない＝ロックが立たない）。
		// 石の右隣(6,7)から左を2回押すと (6,6)→(6,5)→(6,4)＝ボタンに直接乗る。
		await moveTo(['1,1', '1,2', '1,3', '1,4', '1,5', '1,6', '1,7', '2,7', '3,7', '4,7', '5,7', '6,7']);
		await page.evaluate((d) => window.__game.setHeroDir(d), 'left');
		await page.evaluate((d) => window.__game.movePlayer(d), 'left');
		await page.waitForTimeout(650);
		await page.evaluate((d) => window.__game.movePlayer(d), 'left');
		await page.waitForTimeout(650);

		let ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.switchStates['6,4'], 'ボタン 6,4 が ON').toBe(true);
		expect(ss.stonesLocked, '1個だけでは全ボタンONに達さずロックしない').toBeFalsy();
		expect(ss.openGates, '1個だけでは全ゲート開の条件を満たさず閉じたまま').not.toContain('9,5');

		// ボタンの真下 (7,4) へ回り込み、上へ2回押して石をボタンから外す。
		await moveTo(['6,5', '7,5', '7,4']);
		await page.evaluate((d) => window.__game.setHeroDir(d), 'up');
		for (let n = 0; n < 2; n++) {
			await page.evaluate((d) => window.__game.movePlayer(d), 'up');
			await page.waitForTimeout(650);
		}
		ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.switchStates['6,4'], 'ボタン 6,4 が OFF に戻る').toBeFalsy();
		expect(ss.openGates).not.toContain('9,5');
		expect(ss.openGates).not.toContain('9,6');

		expect(errors).toEqual([]);
	});
});
