// tests/candle-torch.spec.js → bomb-torch.spec.js（Phase 4-5 ③ ロウソクで TORCH 点灯）
//
// パズル配置：ライブマップ test_mechanics レイヤーの検証ステージ "torch_relay"
//   (3,2)=H 点灯済み（initLitTorches: ['3,2']）
//   (3,3)=H 消灯
//
// プレイヤーは東隣の床 (3,4) に立って**西を向く** → 前方 (3,3) が消灯 TORCH → ロウソクで点灯
//
// ロウソクは「前方1マスに炎を出す」。TORCH が前方にあれば点灯する。
//
// ⚠️ 2026-09-23 に手順を書き換えた：それまでは (3,1) から `movePlayer('right')` で
//    x=1.5（点灯済みのかがり火 (3,2) に半歩乗る）→ 前方 (3,3) を点ける、という順だった。
//    同日の修正で `game/passable.js tilePassable` が TILE.TORCH を通行不可にした
//    （それまで**通行判定だけ**が 'H' を素通りさせていて、着地判定 ARRIVAL_WALL_TILES と
//    接続検査 HARD_BLOCKED は元から壁扱い＝食い違っていた）∴かがり火に半歩乗れなくなった。
//    ＝この手順は「かがり火の上を歩ける」バグに依存していた。かがり火の**隣の床**から
//    点ける形に直し、併せて「かがり火に踏み込めない」ことも下で見張る。

import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl({ row, col }) {
	const p = new URLSearchParams({
		fromEditor: '1',
		layer: TEST_LAYER,
		stage: stageKey('torch_relay'),
		row: String(row),
		col: String(col),
		ps_candle: '1',
	});
	return `${GAME}?${p.toString()}`;
}

test.describe('Blade of Lumia – ロウソクで TORCH 点灯（Phase 4-5 ③）', () => {

	test('ロウソクで前方の消灯 TORCH (3,3) を点灯できる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// (3,4)＝消灯 TORCH (3,3) の東隣の床にスポーン → 西を向く
		// 前方 = toTileCol(4 - 1) = 3 ＝(3,3) は消灯 TORCH（`playCandle` の前方1セル）
		await page.goto(previewUrl({ row: 3, col: 4 }));
		await waitForBoard(page);

		const result = await page.evaluate(() => {
			window.__game.setHeroDir('left');
			window.__game.step(1);
			// ロウソク使用（activeSubItem='candle'）
			window.__game.useSubItem();
			window.__game.step(1);
			return window.__game.getStageState();
		});

		expect(result.litTorches).toContain('3,3');
		expect(errors).toEqual([]);
	});

	test('かがり火は通行不可＝踏み込めない（2026-09-23 の通行判定の修正の番人）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// (3,4) から西の (3,3)＝かがり火へ何度押しても座標が動かない。
		// ⚠️ これが緑でないと「隣に立てない＝ロウソクでは点けられない」型のパズル
		//    （dark_tower 3,5「淵の火渡り」）の測定が静かに嘘になる。
		await page.goto(previewUrl({ row: 3, col: 4 }));
		await waitForBoard(page);

		const moved = await page.evaluate(() => {
			const before = window.__game.getPlayer().x;
			window.__game.setHeroDir('left');
			for (let i = 0; i < 8; i++) { window.__game.movePlayer('left'); window.__game.step(1); }
			return { before, after: window.__game.getPlayer().x };
		});
		expect(moved.after, 'かがり火 (3,3) に踏み込めてしまった').toBe(moved.before);
		expect(errors).toEqual([]);
	});

	test('すでに点灯している TORCH に再度ロウソクを使っても litTorches の数は変わらない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// (3,0) にスポーン → movePlayer('right') で x=0.5 → 前方 toTileCol(0.5+1)=1（床）
		// 前方が TORCH でない場合 → litTorches 変化なし確認
		// 別案：(3,1) にスポーン → 前方 (3,2) は initLitTorches で点灯済み
		await page.goto(previewUrl({ row: 3, col: 0 }));
		await waitForBoard(page);

		const result = await page.evaluate(() => {
			// (3,0) → movePlayer('right') → x=0.5 → 前方 toTileCol(1.5)=1（床・TORCH でない）
			window.__game.movePlayer('right');
			window.__game.step(1);
			const before = window.__game.getStageState().litTorches.length;
			window.__game.useSubItem();
			window.__game.step(1);
			const after = window.__game.getStageState().litTorches.length;
			return { before, after };
		});

		// 前方が TORCH でないので litTorches は増えない
		expect(result.after).toBe(result.before);
		expect(errors).toEqual([]);
	});

});
