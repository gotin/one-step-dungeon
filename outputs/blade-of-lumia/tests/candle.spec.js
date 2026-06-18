// Phase 4-3: ロウソク（キャンドル）のスモークテスト
//
// デモ配置（work/blade-of-lumia.json）：
//   field 2,0 …… (2,6) にロウソクの宝箱。(4,7) に茂み 'u'。
//                  (4,8) に bushBurned で gate された隠し入口 '>'
//                  （destId='secret_grotto'）。
//
// 検証：
//  1) ps_candle=1 でロウソクを所持してプレビューを開始できる
//  2) 隠し入口は茂みを燃やすまで遷移しない（踏んでも別ステージへ行かない）
//  3) ロウソクで前方の茂みを燃やすと隠し入口が出現し、踏むと secret_grotto へ遷移する
//  4) 前方に茂みがなければ何も出現しない（bushBurned が立たない）
//  5) 前方に敵がいるとき炎ダメージが入る（Phase 4-3b）
//  6) 炎が弱点の敵（氷のリヴァイアサン L）は倍率ダメージを受ける（Phase 4-3b）
import { test, expect } from '@playwright/test';
import { waitForBoard, SAVE_KEY } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl({ layer = 'field', stage = '2,0', row, col, candle = true }) {
	const p = new URLSearchParams({
		fromEditor: '1', layer, stage,
		row: String(row), col: String(col),
	});
	if (candle) p.set('ps_candle', '1');
	return `${GAME}?${p.toString()}`;
}

async function walk(page, dir, n) {
	for (let i = 0; i < n; i++) {
		await page.evaluate(d => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
}

test.describe('Blade of Lumia – ロウソク', () => {
	test('ps_candle=1 でロウソクを所持しアクティブになる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(previewUrl({ row: 4, col: 6, candle: true }));
		await waitForBoard(page);

		const st = await page.evaluate(() => window.__game.getState());
		expect(st.player.hasCandle).toBe(true);
		expect(st.player.activeSubItem).toBe('candle');
		expect(errors).toEqual([]);
	});

	test('隠し入口は茂みを燃やすまで遷移しない', async ({ page }) => {
		// (4,6) スポーン → 右へ歩く。隠し入口 (4,8) はまだ出ていない（茂み (4,7) が塞ぐ）
		// ので別ステージへ行かない。
		await page.goto(previewUrl({ row: 4, col: 6, candle: true }));
		await waitForBoard(page);

		await walk(page, 'right', 6);
		await page.waitForTimeout(300);
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.currentLayer).toBe('field');
		expect(st.stageKey).toBe('2,0');
	});

	test('ロウソクで茂みを燃やすと隠し入口が出現し secret_grotto へ入れる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(previewUrl({ row: 4, col: 6, candle: true }));
		await waitForBoard(page);

		// 右を向く（壁/茂みで動けなくても heroDir は右になる）
		await page.evaluate(() => window.__game.movePlayer('right'));
		await page.evaluate(() => window.__game.step(1));
		// 前方 (4,7) の茂みを燃やす → bushBurned → (4,8) の隠し入口が出現
		await page.evaluate(() => window.__game.useSubItem());
		await page.evaluate(() => window.__game.step(1));

		// 燃えた茂み (4,7) を通り、隠し入口 (4,8) に乗る
		await walk(page, 'right', 4);
		await page.waitForFunction(() => {
			const s = window.__game.getState();
			return s.currentLayer === 'secret_grotto';
		}, { timeout: 3000 });

		const st = await page.evaluate(() => window.__game.getState());
		expect(st.currentLayer).toBe('secret_grotto');
		expect(errors).toEqual([]);
	});

	test('前方に茂みがなければ隠し入口は出現しない', async ({ page }) => {
		// (4,6) で下を向いて使う（前方 (5,6) は床）→ bushBurned は立たない。
		await page.goto(previewUrl({ row: 4, col: 6, candle: true }));
		await waitForBoard(page);

		await page.evaluate(() => window.__game.movePlayer('down'));
		await page.evaluate(() => window.__game.step(1));
		// 元の位置 (4,6) に戻る（隠し入口の判定を素直にするため上に戻す）
		await page.evaluate(() => window.__game.movePlayer('up'));
		await page.evaluate(() => window.__game.step(1));
		await page.evaluate(() => window.__game.useSubItem());
		await page.evaluate(() => window.__game.step(1));

		// 隠し入口 (4,8) は出ていないので、右へ歩いても遷移しない
		await walk(page, 'right', 6);
		await page.waitForTimeout(300);
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.currentLayer).toBe('field');
		expect(st.stageKey).toBe('2,0');
	});

	test('前方に敵がいるとき炎ダメージが入る', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		// (4,6) スポーン・右向き → 右移動で player.x=6.5 → 前方 tc = toTileCol(6.5+1) = toTileCol(7.5) = 7
		// 敵を (x=7, y=4) に注入 → toTileCol(7)=7, toTileRow(4)=4 で一致
		await page.goto(previewUrl({ row: 4, col: 6, candle: true }));
		await waitForBoard(page);

		await page.evaluate(() => window.__game.step(2)); // クールダウン対策
		const result = await page.evaluate(() => {
			const HP = 30;
			// 右を向く・移動（(4,6) → 動けない場合も heroDir='right' になる）
			window.__game.movePlayer('right');
			window.__game.step(1);
			// player.x は 6 か 6.5。前方 tc は toTileCol(player.x + 1)。
			// player.x=6.5 → toTileCol(7.5)=7。player.x=6 → toTileCol(7)=7。
			// どちらも tc=7 なので敵を (x=7, y=4) に注入する。
			const id = window.__game.injectEnemy(7, 4, HP);
			window.__game.useSubItem(); // ロウソクを使う
			window.__game.step(1);
			const e = window.__game.getEnemies().find(x => x.id === id);
			return { hpAfter: e ? e.hp : -1, hpBefore: HP };
		});
		expect(result.hpAfter).toBeLessThan(result.hpBefore);
		expect(errors).toEqual([]);
	});

	test('炎が弱点の敵（氷のリヴァイアサン L）は倍率ダメージを受ける', async ({ page }) => {
		// weakness.spec.js と同じ injectEnemy + dealDamage パターンで
		// fire(×3) vs sword(×1) のダメージ差を確認する。
		const saveData = JSON.stringify({
			player: {
				x: 2, y: 5,
				hp: 6, maxHp: 6, maxHearts: 3,
				atk: 2, def: 0, keys: 0,
				weapon: 'sword', shield: null, armor: null,
				subItems: {}, activeSubItem: null,
				rupees: 0, triforceCount: 0,
			},
			stageState: {},
			currentLayer: 'field',
			stageKey: '1,0',
			heroDir: 'right',
		});
		await page.addInitScript(({ key, value }) => {
			try { localStorage.setItem(key, value); } catch { /* noop */ }
		}, { key: SAVE_KEY, value: saveData });
		await page.goto('/blade-of-lumia/game/');
		await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
		await page.locator('#btn-continue').click();
		await page.waitForFunction(() => {
			const b = document.getElementById('board');
			return !!b && b.children.length > 0;
		});

		const losses = await page.evaluate(() => {
			const HP = 200;
			const swordId = window.__game.injectEnemy(8, 8, HP, 2, 2, 'L');
			window.__game.dealDamage(swordId, 10, 'sword');
			const eSword = window.__game.getEnemies().find(x => x.id === swordId);
			const swordLoss = HP - (eSword ? eSword.hp : 0);

			const fireId = window.__game.injectEnemy(8, 8, HP, 2, 2, 'L');
			window.__game.dealDamage(fireId, 10, 'fire');
			const eFire = window.__game.getEnemies().find(x => x.id === fireId);
			const fireLoss = HP - (eFire ? eFire.hp : 0);

			return { swordLoss, fireLoss };
		});
		// 氷のリヴァイアサンは fire が弱点(×3)。sword(×1) の3倍ダメージ
		expect(losses.fireLoss).toBe(losses.swordLoss * 3);
	});
});
