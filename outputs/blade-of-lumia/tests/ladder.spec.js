// Phase 4-1: はしご（自動わたり）のスモークテスト
//
// ⚠️ ギミックテストはライブマップ（work/blade-of-lumia.json）を参照しない。
// dungeon_3 は Phase 9-2d で「水の迷宮」へ再設計され、旧はしごパズル（0,0/1,0）は
// 撤去された（はしご＝D5報酬なので D3 に置くとソフトロック違反）。そのため
// 旧 0,0/1,0 のジオメトリは tests/fixtures/test-stages.json の
//   test_mechanics/ladder_pit    … 旧 0,0（PIT・単セル穴・横橋／縦連続水・はしご宝箱）
//   test_mechanics/ladder_water2 … 旧 1,0（2連続水＝橋脚なしで渡れない不変条件）
//   test_mechanics/ladder_isolated … (3,2) 孤立水（進入軸で向きが決まる回帰）
// として複製・固定してある。ライブ dungeon_3 を編集してもこのテストは壊れない。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

const FIXTURE_SRC = '../tests/fixtures/test-stages.json';

function previewUrl({ stage = 'ladder_pit', layer = 'test_mechanics', row, col, ladder, mapSrc = FIXTURE_SRC }) {
	const p = new URLSearchParams({
		fromEditor: '1', layer, stage,
		row: String(row), col: String(col),
	});
	if (ladder) p.set('ps_ladder', '1');
	if (mapSrc) p.set('ps_mapSrc', mapSrc);
	return `${GAME}?${p.toString()}`;
}

async function walk(page, dir, n) {
	for (let i = 0; i < n; i++) {
		await page.evaluate(d => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
}

test.describe('Blade of Lumia – はしご', () => {
	test('はしごが無いと穴(PIT)で止まる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		// row8 col2 にスポーン（穴 col4 の手前）。右へ進んでも穴で止まる。
		await page.goto(previewUrl({ row: 8, col: 2, ladder: false }));
		await waitForBoard(page);

		let st = await page.evaluate(() => window.__game.getState());
		expect(st.player.hasLadder).toBe(false);

		await walk(page, 'right', 8);
		st = await page.evaluate(() => window.__game.getState());
		// 穴 col4 の手前（col<4）で止まる
		expect(st.player.x).toBeLessThan(4);

		expect(errors).toEqual([]);
	});

	test('はしご所持で両隣が地上の穴を1セルだけ渡れる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(previewUrl({ row: 8, col: 2, ladder: true }));
		await waitForBoard(page);

		let st = await page.evaluate(() => window.__game.getState());
		expect(st.player.hasLadder).toBe(true);

		// 右へ進めば穴 col4・col8 を渡って報酬宝箱(col10)側まで到達できる
		await walk(page, 'right', 18);
		st = await page.evaluate(() => window.__game.getState());
		expect(st.player.x).toBeGreaterThan(8);  // 両方の穴を越えた

		expect(errors).toEqual([]);
	});

	test('はしご所持でも2連続の水は渡れない（橋脚が無い）', async ({ page }) => {
		// fixture ladder_water2（旧 dungeon_3 1,0）：row2 = "#..~~~~~~..#"（col3-8 が連続した水）。
		// col2 から右へ進んでも、連続水は両隣が地上にならないため渡れない。
		await page.goto(previewUrl({ stage: 'ladder_water2', row: 2, col: 2, ladder: true }));
		await waitForBoard(page);
		await walk(page, 'right', 10);
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.player.x).toBeLessThan(3);  // 連続水の手前で止まる
	});

	test('はしごは渡っている最中だけ足元の水/穴セルに出て、渡り切ると消える（初代ゼルダ式）', async ({ page }) => {
		// row8 = "#B..x...x.B#"：col4,col8 が単セルの穴（両隣が地上＝橋が架かる）。
		// はしごは char-layer の .char-ladder 要素として「セル固定」で出る（プレイヤー要素の外）。
		await page.goto(previewUrl({ row: 8, col: 2, ladder: true }));
		await waitForBoard(page);

		// 陸（col2）にいる間は、足元が水/穴でないのではしごは出ない
		expect(await page.locator('.char-ladder').count()).toBe(0);
		// 常設描画もしていない（board セル側にもはしごは無い）
		expect(await page.locator('.cell .ladder-sprite').count()).toBe(0);

		// 穴セル col4 に踏み込む（col2→col4 へ ⇒ 0.5刻みで4歩）。
		// 踏み込んだ瞬間、足元の穴セルにだけはしごが1枚出る。
		await walk(page, 'right', 4);
		let st = await page.evaluate(() => window.__game.getState());
		expect(Math.round(st.player.x)).toBe(4);          // 穴セルの上に乗っている
		expect(await page.locator('.char-ladder').count()).toBeGreaterThanOrEqual(1);
		// はしごはプレイヤー要素の中には入らない（追従しない）
		expect(await page.locator('#char-player .ladder-sprite').count()).toBe(0);

		// 渡り切って陸（col5,6,7）に乗ると、はしごは消える
		await walk(page, 'right', 4);
		st = await page.evaluate(() => window.__game.getState());
		expect(Math.round(st.player.x)).toBe(6);          // 陸セルの上
		expect(await page.locator('.char-ladder').count()).toBe(0);
	});

	test('半セル位置で水に跨っても、はしごは1枚しか出ない（二重表示しない）', async ({ page }) => {
		// row8 col4 は単セルの穴。col2→col4 へ進む途中、x=3.5 で col3(陸) と col4(穴) に跨る。
		// さらに進めば x=4.5 で col4(穴) と col5(陸) に跨る。いずれも橋セルは col4 の1枚だけ。
		await page.goto(previewUrl({ row: 8, col: 2, ladder: true }));
		await waitForBoard(page);
		// col2 → 3歩で x=3.5（col3 陸 + col4 穴 に跨る）
		await walk(page, 'right', 3);
		let st = await page.evaluate(() => window.__game.getState());
		expect(st.player.x).toBeCloseTo(3.5, 1);
		expect(await page.locator('.char-ladder').count()).toBe(1);  // 1枚だけ
		// もう1歩で x=4（col4 穴の上）
		await walk(page, 'right', 1);
		expect(await page.locator('.char-ladder').count()).toBe(1);
		// もう1歩で x=4.5（col4 穴 + col5 陸 に跨る）→ 橋セルは col4 のみ＝1枚
		await walk(page, 'right', 1);
		st = await page.evaluate(() => window.__game.getState());
		expect(st.player.x).toBeCloseTo(4.5, 1);
		expect(await page.locator('.char-ladder').count()).toBe(1);  // 1枚だけ（二重表示しない）
	});

	test('上下に均等に跨るときは下側のセルにはしごが出る（水に浮いて見えない）', async ({ page }) => {
		// col4 は row5,6 が水（左右が陸＝横橋）。陸（col2）で y=5.5 に跨ってから横移動で
		// col4 に入ると、row5/row6 の両水セルに均等に跨る（スクショの状況）。
		// このときはしごは下側 row6 に出すべき（上側 row5 だと足元が水で浮いて見える）。
		await page.goto(previewUrl({ row: 5, col: 2, ladder: true }));
		await waitForBoard(page);
		// まず陸の上で y=5.5 に跨る（row5,row6 col2 は陸なので縦移動 OK）
		await walk(page, 'down', 1);
		let st = await page.evaluate(() => window.__game.getState());
		expect(st.player.y).toBeCloseTo(5.5, 1);
		// y=5.5 を保ったまま右へ col4 へ（col2→col4 = 4歩）。横移動なので水の横橋を渡れる
		await walk(page, 'right', 4);
		st = await page.evaluate(() => window.__game.getState());
		expect(st.player.x).toBeCloseTo(4, 1);
		expect(st.player.y).toBeCloseTo(5.5, 1);
		// はしごは1枚、かつ下側 row6 のセル位置に出ている
		const ladders = page.locator('.char-ladder');
		expect(await ladders.count()).toBe(1);
		const cellPx = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.cell')).width));
		const top = await ladders.first().evaluate(el => parseFloat(el.style.top));
		// top / cellPx ≒ row index。下側＝row6 を期待（row5 ではない）
		expect(Math.round(top / cellPx)).toBe(6);
	});

	test('はしごの向きは進入軸で決まる：縦移動で入れば縦向き／横移動で入れば横向き', async ({ page }) => {
		// フィクスチャ test_mechanics/ladder_isolated の (3,2) は孤立した水
		//（上下左右すべて床＝陸）＝縦橋でも横橋でも成立する。
		// 上から下へ入れば縦向き(ladderV)・左右から入れば横向き(ladderH) になるべき。
		// （セルの地形だけで横優先に決めると、下移動なのに横向きになる不具合の回帰テスト）

		// ── 縦（下移動）で進入 → 縦向き ──
		await page.goto(previewUrl({ layer: 'test_mechanics', stage: 'ladder_isolated', row: 2, col: 2, ladder: true, mapSrc: FIXTURE_SRC }));
		await waitForBoard(page);
		await walk(page, 'down', 2);  // row2 → row3（c2 の水へ縦移動で入る）
		let st = await page.evaluate(() => window.__game.getState());
		expect(Math.round(st.player.y)).toBe(3);
		expect(Math.round(st.player.x)).toBe(2);
		let ladder = page.locator('.char-ladder');
		expect(await ladder.count()).toBe(1);
		expect(await ladder.first().getAttribute('data-orient')).toBe('v');  // 縦向き

		// ── 横（右移動）で進入 → 横向き ──
		await page.goto(previewUrl({ layer: 'test_mechanics', stage: 'ladder_isolated', row: 3, col: 1, ladder: true, mapSrc: FIXTURE_SRC }));
		await waitForBoard(page);
		await walk(page, 'right', 2);  // c1 → c2（水へ横移動で入る）
		st = await page.evaluate(() => window.__game.getState());
		expect(Math.round(st.player.x)).toBe(2);
		expect(Math.round(st.player.y)).toBe(3);
		ladder = page.locator('.char-ladder');
		expect(await ladder.count()).toBe(1);
		expect(await ladder.first().getAttribute('data-orient')).toBe('h');  // 横向き
	});

	test('はしごの上で向きを変えてもはしごは消えない', async ({ page }) => {
		// row8 col4（横橋＝左右が陸）の上に乗る。上下（橋でない軸）を向いても消えてはいけない。
		await page.goto(previewUrl({ row: 8, col: 4, ladder: true }));
		await waitForBoard(page);
		// スポーン直後、col4 の穴の上＝はしごが1枚出ている
		expect(await page.locator('.char-ladder').count()).toBe(1);
		// 上を向く（縦は橋でない）→ それでもはしごは残る
		await page.evaluate(() => window.__game.movePlayer('up'));
		await page.evaluate(() => window.__game.step(1));
		let st = await page.evaluate(() => window.__game.getState());
		// 上は壁/陸でないため進めない（穴の上に留まる）想定。向きだけ変わってもはしごは残る
		expect(Math.round(st.player.x)).toBe(4);
		expect(await page.locator('.char-ladder').count()).toBe(1);
		// 下を向いても残る
		await page.evaluate(() => window.__game.movePlayer('down'));
		await page.evaluate(() => window.__game.step(1));
		st = await page.evaluate(() => window.__game.getState());
		expect(Math.round(st.player.x)).toBe(4);
		expect(await page.locator('.char-ladder').count()).toBe(1);
	});

	// ── Phase 4-1c: 進入軸の通行判定 ──────────────────────────────
	test('縦連続の水は縦方向には渡れない（col4 を下に進んでも止まる）', async ({ page }) => {
		// fixture ladder_pit（旧 dungeon_3 0,0）の col4 は row2〜7 が水で縦に連続している（橋 v 含む）。
		// 各セルは左右(col3,col5)が陸なので「横橋」としては成立するが、縦移動では
		// 縦橋（上下が陸）でないため進入できない＝縦にスルスル渡れてはいけない。
		await page.goto(previewUrl({ row: 1, col: 4, ladder: true }));
		await waitForBoard(page);
		await walk(page, 'down', 8);
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.player.y).toBeLessThan(2);  // 水(row2)の手前で止まる
	});

	test('同じ col4 を横方向には1セルだけ渡れる', async ({ page }) => {
		// row3：col3=陸 col4=水 col5=陸 ＝横橋。横移動なら1セルだけ渡れる。
		await page.goto(previewUrl({ row: 3, col: 2, ladder: true }));
		await waitForBoard(page);
		await walk(page, 'right', 8);
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.player.x).toBeGreaterThan(4);  // col4 の水を越えて先へ進める
	});

	test('横橋の上から上（陸）へ抜けられる（軸ロックされていない）', async ({ page }) => {
		// row8 col8 は pit（左 col7・右 col9 が陸＝横橋）かつ上 row7 col8 が陸。
		// 横移動で乗ってから上へ抜けられる＝橋の軸に縛られない（陸へはいつでも出られる）。
		await page.goto(previewUrl({ row: 8, col: 6, ladder: true }));
		await waitForBoard(page);
		// 右へ進んで pit(col8) の上に乗る
		await walk(page, 'right', 4);
		let st = await page.evaluate(() => window.__game.getState());
		expect(Math.round(st.player.x)).toBe(8);
		// 上へ抜ける（row7 は陸）。軸ロックがあると抜けられない。
		await walk(page, 'up', 4);
		st = await page.evaluate(() => window.__game.getState());
		expect(st.player.y).toBeLessThan(8);  // 上の陸へ出られた
	});

	test('橋（水/穴）の上から交差軸のさらに先の水へは渡れない（多段はしご不変条件）', async ({ page }) => {
		// col4 row3 は横橋（左右が陸）。その上 row2 col4 も水。
		// 横橋の上（col4 row3）に乗ってから上へ進んでも、上は連続水なので進入できない
		//（縦橋ではない＝はしごが多段に伸びない）。
		await page.goto(previewUrl({ row: 3, col: 3, ladder: true }));
		await waitForBoard(page);
		// 右へ1セルだけ進んで col4（横橋）に乗る
		await walk(page, 'right', 2);
		let st = await page.evaluate(() => window.__game.getState());
		expect(Math.round(st.player.x)).toBe(4);
		// 上へ進もうとしても row2 は水（縦橋でない）→ 進めない
		await walk(page, 'up', 4);
		st = await page.evaluate(() => window.__game.getState());
		expect(st.player.y).toBeGreaterThanOrEqual(3);  // 上の水へは渡れない
	});

	test('はしごの宝箱を開けると hasLadder になる', async ({ page }) => {
		// row8 col2 にスポーン → 左の宝箱(col1)を開ける
		await page.goto(previewUrl({ row: 8, col: 2, ladder: false }));
		await waitForBoard(page);

		let st = await page.evaluate(() => window.__game.getState());
		expect(st.player.hasLadder).toBe(false);

		// 左へ1歩で宝箱(8,1)に乗り、攻撃キーで開ける（宝箱は乗ると開く実装）
		await walk(page, 'left', 2);
		st = await page.evaluate(() => window.__game.getState());
		expect(st.player.hasLadder).toBe(true);
	});

	// ── Phase 9-6: bgTiles 下地の水も、はしごで渡れる＋渡り中にはしごが出る ──────────
	// 回帰：水の単一ソース化で湖/海/堀は bgTiles '~' に移行した。render-chars の
	// はしごオーバーレイと game.js の遷移/着地判定が tiles 層の '~' だけを見ていると、
	// 移行後は「はしごが表示されない／水に踏み込める」バグになる（ユーザー報告：
	// dungeon_5 1,1 ではしごが出なかった）。bgTiles 水でも同じ挙動になることを固定する。
	test('bgTiles 下地の水もはしごで渡れる＋渡り中に char-ladder が出る（移行回帰）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		// fixture ladder_bg_bridge：row3 col4 だけ bgTiles 水（tiles は床）。上(2,4)/下(4,4)が
		// 床＝縦橋成立。プレイヤー(8,4)から上へ進むと row3 の水を1セル渡って row2 以上へ抜ける。
		await page.goto(previewUrl({ stage: 'ladder_bg_bridge', row: 8, col: 4, ladder: true }));
		await waitForBoard(page);

		// 陸（row8）では足元が水でないのではしごは出ない
		expect(await page.locator('.char-ladder').count()).toBe(0);

		// 上へ進んで row3 の bgTiles 水セルに乗る（row8→row3 = 縦5セル ⇒ 0.5刻みで10歩）
		await walk(page, 'up', 10);
		let st = await page.evaluate(() => window.__game.getState());
		expect(Math.round(st.player.y), 'bgTiles 水セル(row3)の上に乗れていない').toBe(3);
		// 渡っている最中は char-ladder が縦向きで1枚出る（tiles 水と同じ挙動）
		const ladder = page.locator('.char-ladder');
		expect(await ladder.count(), 'bgTiles 水の上ではしごが出ない（tiles 層だけ見ている回帰）').toBeGreaterThanOrEqual(1);
		expect(await ladder.first().getAttribute('data-orient')).toBe('v');

		// 渡り切って上の陸（row2 以下）へ抜けると、はしごは消える
		await walk(page, 'up', 4);
		st = await page.evaluate(() => window.__game.getState());
		expect(st.player.y, 'bgTiles 水を渡り切って上の陸へ抜けられない').toBeLessThan(3);
		expect(await page.locator('.char-ladder').count()).toBe(0);

		expect(errors).toEqual([]);
	});

	test('bgTiles 下地の水は、はしご無しでは渡れない（tiles 水と同じ）', async ({ page }) => {
		// はしごを持たなければ row3 の bgTiles 水で止まる（水は徒歩不可）。
		await page.goto(previewUrl({ stage: 'ladder_bg_bridge', row: 8, col: 4, ladder: false }));
		await waitForBoard(page);
		await walk(page, 'up', 10);
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.player.y, 'はしご無しで bgTiles 水を渡れてしまった').toBeGreaterThan(3);
	});
});
