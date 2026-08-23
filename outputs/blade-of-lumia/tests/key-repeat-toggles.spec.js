// キーリピートでトグルが反転し続けないこと（2026-08-23 ユーザー報告の回帰ロック）
//
// 症状＝翼の羽衣を持った状態で F キーを押し続けると、離陸と着陸を交互に繰り返す。
// 原因＝`game/input.js` の keydown ハンドラでトグル系（F 飛行 / Escape ポーズ /
//        g デバッグ）に `e.repeat` ガードが無く、OS のキーリピート（押しっぱなしで
//        秒間 30 回前後の keydown）が毎回トグルを呼んでいた。
//        隣の攻撃キー（' ' / z）には元から `if (!e.repeat)` があった＝付け忘れ。
//
// ⚠️ Playwright の `keyboard.down()` はリピート（`repeat: true`）の keydown を
//    生成しない∴**押しっぱなしの再現には合成イベントを document へ投げる**。
//    リピートを1発ずつ投げて毎回状態を見る（偶数回まとめて投げると反転が打ち消して
//    「変わっていない」に見える＝歯の無いテストになる）。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

/** OS のキーリピート相当（repeat: true の keydown）を1発投げる。 */
const sendRepeat = (page, key) => page.evaluate((k) => {
	document.dispatchEvent(new KeyboardEvent('keydown', { key: k, repeat: true, bubbles: true }));
}, key);

const flying = (page) => page.evaluate(() => window.__game.getState().player.flying);

test.describe('Blade of Lumia – キーリピートとトグル', () => {

	test('F を押し続けても飛行が反転し続けない（離陸したまま）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		// 空島 field 8,1 の足場 (3,2)＝地上タイル∴着陸条件を満たす（＝反転が起きる場所）。
		await page.goto(`${GAME}?fromEditor=1&layer=field&stage=8,1&row=3&col=2&ps_wingrobe=1`);
		await waitForBoard(page);
		expect(await flying(page), '初期は徒歩').toBe(false);

		// 押した瞬間だけ離陸する。
		await page.keyboard.down('f');
		expect(await flying(page), 'F の初回押下で離陸していない').toBe(true);

		// 押しっぱなし＝リピートが何発来ても飛行は続く（1発ずつ確認する）。
		for (let i = 1; i <= 5; i++) {
			await sendRepeat(page, 'f');
			expect(await flying(page), `${i} 発目のキーリピートで着陸した`).toBe(true);
		}
		await page.keyboard.up('f');
		expect(await flying(page), 'キーを離しただけで着陸した').toBe(true);

		// 押し直し（＝リピートではない keydown）はちゃんと効く＝ガードで殺していない。
		await page.keyboard.press('f');
		expect(await flying(page), '押し直しで着陸できない').toBe(false);
		expect(errors, 'pageerror が出た').toEqual([]);
	});

	test('Escape / g を押し続けてもポーズとデバッグ表示が点滅しない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto(`${GAME}?fromEditor=1&layer=field&stage=8,1&row=3&col=2&ps_wingrobe=1`);
		await waitForBoard(page);

		// デバッグの ON/OFF は #msg-bar の直近メッセージで見える。
		// ⚠️ HUD の `[DBG]` では測れない＝`toggleDebugMode()` がラベルへ書いた直後に
		//    毎フレームの `renderBoard()`（render-board.js）が `[layer] key` で上書きする。
		const dbg = () => page.evaluate(() => {
			const t = document.getElementById('msg-bar').textContent;
			return t.includes('DEBUG ON') ? true : t.includes('DEBUG OFF') ? false : null;
		});
		// ⚠️ エディタプレビューは `debugMode = true` で始まる（常に無敵・game.js:1979）
		//    ∴初期値を決め打ちせず「押した結果」を基準に相対で測る。
		expect(await dbg(), '押す前からデバッグのメッセージが出ている').toBeNull();
		await page.keyboard.down('g');
		const first = await dbg();
		expect(first, 'g の初回押下でデバッグが切り替わらない').not.toBeNull();
		for (let i = 1; i <= 5; i++) {
			await sendRepeat(page, 'g');
			expect(await dbg(), `${i} 発目のキーリピートでデバッグが反転した`).toBe(first);
		}
		await page.keyboard.up('g');
		await page.keyboard.press('g');   // 押し直しなら戻せる
		expect(await dbg(), '押し直しでデバッグを戻せない').toBe(!first);

		// ポーズは #pause-overlay の hidden クラスで見える。
		const paused = () => page.evaluate(() =>
			!document.getElementById('pause-overlay').classList.contains('hidden'));
		expect(await paused()).toBe(false);
		await page.keyboard.down('Escape');
		expect(await paused(), 'Escape の初回押下でポーズしない').toBe(true);
		for (let i = 1; i <= 5; i++) {
			await sendRepeat(page, 'Escape');
			expect(await paused(), `${i} 発目のキーリピートでポーズが解けた`).toBe(true);
		}
		await page.keyboard.up('Escape');
		await page.keyboard.press('Escape');   // 押し直しで解除できる
		expect(await paused(), '押し直しでポーズを解除できない').toBe(false);
		expect(errors, 'pageerror が出た').toEqual([]);
	});
});
