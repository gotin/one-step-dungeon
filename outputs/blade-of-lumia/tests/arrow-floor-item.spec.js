// ── tests/arrow-floor-item.spec.js ── 実行キュー19（2026-09-21）────────────
// 不変条件：**床に置くのは「矢束」（矢だけ）で、弓そのものは床から手に入らない**。
//
// 🔴 当て所（何を壊したら赤くなるべきか）：
//   ① 矢束を踏んでも本数が増えない／`floorItems.count` を読まない
//   ② 弓を持っていないのに矢が入る（＝`subItems.bow` が生えて `ownsItem('bow')` が真に
//      なる＝弓を入手する前に弓が撃てる／会話の `item:bow` の版が先に出る）
//   ③ 拾えなかった矢束が消える（弓を得てから戻ってきても二度と拾えない＝進行の損失）
//   ④ 本数を書いていない矢束が拾えない（既定 `ITEM_META.bow.defaultStack` を見ていない）
//   ⑤ 満タンで踏むとタイルだけ消える（矢を捨てさせる）
//   ⑥ 爆弾（同じ `FLOOR_STACK_TILES` の機構）が壊れる
//   ⑦ 敵ドロップの矢が弓なしで入る（床タイルだけ塞いでドロップの穴が残る）
//   ⑧ 宝箱の弓を開けても矢が1本しか付かない（`defaultStack` が初回取得に効かない）
//   ⑨ エディタで本数を変えて保存しても残らない／空欄で既定に戻せない
//   ⑩ 床の矢束がセル全面に貼られる（撃った矢の大きさに揃っていない）
//   ⑪ **矢を撃ち切ると弓を失う**（スロットを消す＝`ownsItem('bow')` が偽に戻り矢を拾えない
//      ＝二度と補充できない詰み。2026-09-21 ユーザー報告の原因）
//   ⑫ 上限超えで持っている状態で矢束を踏むと本数が減る（拾って損する）
//   ⑬ 爆弾を置き切ると火薬を失う（⑪ と同じ機構が projectile.js にもある）
//   ⑭ プレビュー設定が上限超えの本数を渡す（⑫ の状態をエディタ側で作ってしまう）
//
// ⚠️ 歯の無い場所（2026-09-21 時点）：combat.js のドロップ抽選の重み（弓が無ければ
//    矢の重み 0＝そもそも落ちない）は乱択の中 ∴ ここでは測っていない。矢が入らない
//    保証そのものは ⑦（受け取り側 `applyFloorDropEffect` のゲート）が持つ。
//
// 盤面は test_mechanics の `arrow_pickup`（43,0）＝矢束2つ（(4,4) 本数4／(4,7) 本数なし）
// と爆弾1つ（(6,4) 本数2）。fixture ではなくライブマップに置く決まり（test-stage-keys.js）。
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { ITEM_META } from '../shared/items.js';
import { FLOOR_STACK_TILES } from '../shared/tiles.js';
import { TILE } from '../shared/tiles.js';
import { ARROW_CELL_SCALE } from '../shared/tile-sprites.js';

const GAME_URL   = '/blade-of-lumia/game/';
const EDITOR_URL = '/blade-of-lumia/editor/';
const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const STAGE = stageKey('arrow_pickup');

// 期待値は実データ・実定義から引く（手書きの数を置かない）。
const ST = MAP.layers[TEST_LAYER].stages[STAGE];
const ARROW_A = { r: 4, c: 4, count: ST.floorItems['4,4'].count };  // 本数を書いた矢束
const ARROW_B = { r: 4, c: 7 };                                      // 本数を書いていない矢束
const BOMB    = { r: 6, c: 4, count: ST.floorItems['6,4'].count };
const ARROW_DEFAULT = ITEM_META.bow.defaultStack;
const BOMB_DEFAULT  = ITEM_META.bomb.defaultStack;

function previewUrl({ row, col, params = {} }) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: TEST_LAYER, stage: STAGE,
		row: String(row), col: String(col), ...params,
	});
	return `${GAME_URL}?${p.toString()}`;
}

/** 盤面を開いて実ループを止める（手動 step だけで進める）。 */
async function open(page, opts) {
	await page.goto(previewUrl(opts));
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	// ⚠️ 初めてサブアイテムを得ると「！ヒント」の会話が開き、**以降の移動が止まる**
	//    （拾えたのか歩けなかったのかが混ざる）∴出したことにして塞ぐ。
	//    ヒント自体の検査は tests/sub-item-hint-pulse.spec.js が持つ。
	await page.evaluate(() => { window.__game.getPlayer()._shownSubItemHint = true; });
}

/** dir へ n 回 movePlayer（1回＝半マス）＋1 tick。 */
async function walk(page, dir, n) {
	for (let i = 0; i < n; i++) {
		await page.evaluate(d => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
}

/** そのセルまで歩く（同じ行／列だけ・半マス刻み∴距離×2 回）。 */
async function walkTo(page, { r, c }) {
	const st = await page.evaluate(() => window.__game.getState());
	const dc = c - Math.round(st.player.x);
	const dr = r - Math.round(st.player.y);
	if (dc) await walk(page, dc > 0 ? 'right' : 'left', Math.abs(dc) * 2);
	if (dr) await walk(page, dr > 0 ? 'down' : 'up', Math.abs(dr) * 2);
	const st2 = await page.evaluate(() => window.__game.getState());
	expect({ x: Math.round(st2.player.x), y: Math.round(st2.player.y) }, '目的のセルに立てていない').toEqual({ x: c, y: r });
}

const arrows = (page) => page.evaluate(() => window.__game.getPlayer().subItems.bow?.count ?? null);
const bombs  = (page) => page.evaluate(() => window.__game.getPlayer().subItems.bomb?.count ?? null);
/** 弓を持った状態を作る（本数は指定値・上限も必要なら上げる） */
function grantBow(page, count, quivers = 0) {
	return page.evaluate(({ count, quivers }) => {
		for (let i = 0; i < quivers; i++) window.__game.giveSubItem('quiver');
		const p = window.__game.getPlayer();
		p.subItems.bow = { count };
		p.activeSubItem = 'bow';
	}, { count, quivers });
}
const picked = (page) => page.evaluate(() => window.__game.getStageState().pickedKeys ?? []);

test.describe('床の矢束（矢だけ置ける機構・実行キュー19）', () => {

	test('① 本数を書いた矢束を踏むとその本数だけ増え、タイルは拾われる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await open(page, { row: ARROW_A.r, col: 2 });
		await grantBow(page, 0);

		await walkTo(page, ARROW_A);
		expect(await arrows(page)).toBe(ARROW_A.count);
		expect(await picked(page)).toContain(`${ARROW_A.r},${ARROW_A.c}`);
		expect(errors).toEqual([]);
	});

	test('④ 本数を書いていない矢束は既定（ITEM_META.bow.defaultStack）で拾える', async ({ page }) => {
		// 既定 10 は上限 8 を超える∴矢筒1つ（+8＝上限16）を渡してから測る
		// （上限でクランプされると「既定が10」なのか「8」なのか区別できない）。
		// ⚠️ 東側（col 10）から寄る＝西から歩くと途中の矢束 (4,4) を踏んでしまい、
		//    どちらの束を拾ったのか分からなくなる。
		await open(page, { row: ARROW_B.r, col: 10 });
		await grantBow(page, 0, 1);
		expect(await page.evaluate(() => window.__game.getPlayer().maxArrows)).toBe(16);

		await walkTo(page, ARROW_B);
		expect(await arrows(page)).toBe(ARROW_DEFAULT);
	});

	test('② 弓を持たない間は矢束を拾えない（subItems.bow が生えない＝弓も撃てない）', async ({ page }) => {
		await open(page, { row: ARROW_A.r, col: 2 });
		expect(await arrows(page), '最初から弓を持っている＝この検査の前提が壊れている').toBeNull();

		await walkTo(page, ARROW_A);
		expect(await arrows(page), '弓が無いのに矢が入った').toBeNull();
		expect(await page.evaluate(() => window.__game.getPlayer().activeSubItem)).not.toBe('bow');
	});

	test('③ 拾えなかった矢束はタイルが残る（弓を手に入れてから拾える）', async ({ page }) => {
		await open(page, { row: ARROW_A.r, col: 2 });
		await walkTo(page, ARROW_A);
		expect(await picked(page), '拾えていないのにタイルが消えた').not.toContain(`${ARROW_A.r},${ARROW_A.c}`);

		// 弓を普通に入手する（宝箱と同じ道＝giveSubItem）。初回取得は defaultStack 本。
		await page.evaluate(() => { window.__game.giveSubItem('quiver'); window.__game.giveSubItem('bow'); });
		expect(await arrows(page), '⑧ 宝箱の弓で矢が1本しか付いていない').toBe(ARROW_DEFAULT);

		// 一度離れて踏み直す（同じセルに立ち続けたままでは再判定が起きない）
		await walk(page, 'left', 2);
		await walkTo(page, ARROW_A);
		expect(await arrows(page)).toBe(ARROW_DEFAULT + ARROW_A.count);
		expect(await picked(page)).toContain(`${ARROW_A.r},${ARROW_A.c}`);
	});

	test('⑤ 満タンで踏んでもタイルは消えない（矢を捨てさせない）', async ({ page }) => {
		await open(page, { row: ARROW_A.r, col: 2 });
		await grantBow(page, 8);   // maxArrows の既定 8 ＝満タン
		await walkTo(page, ARROW_A);
		expect(await arrows(page)).toBe(8);
		expect(await picked(page), '満タンで踏んだだけでタイルが消えた').not.toContain(`${ARROW_A.r},${ARROW_A.c}`);

		// 撃って空けてから踏み直すと拾える＝タイルは生きている
		await page.evaluate(() => { window.__game.getPlayer().subItems.bow.count = 0; });
		await walk(page, 'left', 2);
		await walkTo(page, ARROW_A);
		expect(await arrows(page)).toBe(ARROW_A.count);
	});

	test('⑥ 爆弾も同じ機構で本数を読む（必要な道具は無い＝弓なしでも拾える）', async ({ page }) => {
		await open(page, { row: BOMB.r, col: 2 });
		expect(await bombs(page)).toBeNull();
		await walkTo(page, BOMB);
		expect(await bombs(page)).toBe(BOMB.count);
		// 機構の宣言（FLOOR_STACK_TILES）と実挙動が一致していること
		expect(FLOOR_STACK_TILES[TILE.ITEM_BOMB].requires).toBeNull();
		expect(ITEM_META[FLOOR_STACK_TILES[TILE.ITEM_BOMB].item].defaultStack).toBe(BOMB_DEFAULT);
	});

	test('⑩ 床の矢束は撃った矢・落ちている矢と同じ大きさ（セル全面に貼らない）', async ({ page }) => {
		// ⚠️ 自己レビューで見つけた欠陥＝`arrow` の絵は余白なし（ink 27×15）∴dot32 の
		//    セル全面貼りだと「撃たれた矢が床を横切っている」ように見え、同じ部屋の爆弾
		//    より大きくなる。キュー18 でユーザー判定 OK になった敵ドロップの矢と同じ
		//    大きさ（ARROW_CELL_SCALE）に揃えるのが正しい見かけ。
		await open(page, { row: ARROW_A.r, col: 2 });
		const size = (r, c) => page.evaluate(([r, c]) => {
			const cv = document.querySelector(`#board .cell[data-row="${r}"][data-col="${c}"] canvas`);
			const cell = document.querySelector(`#board .cell[data-row="${r}"][data-col="${c}"]`);
			if (!cv || !cell) return null;
			return { w: parseFloat(getComputedStyle(cv).width), cellPx: cell.getBoundingClientRect().width, cls: cv.className };
		}, [r, c]);

		const arrow = await size(ARROW_A.r, ARROW_A.c);
		expect(arrow, '矢束のセルに canvas が無い').toBeTruthy();
		expect(arrow.w / arrow.cellPx, '矢束がセル全面に貼られている（撃った矢の大きさに揃っていない）')
			.toBeCloseTo(ARROW_CELL_SCALE, 2);

		// 爆弾は巻き込まれていない＝縮小は矢束だけの例外
		const bomb = await size(BOMB.r, BOMB.c);
		expect(bomb.w / bomb.cellPx, '爆弾まで縮んでいる（例外表が効きすぎている）').toBeCloseTo(1, 1);
	});

	test('⑪ 矢を撃ち切っても弓は失わない（そのまま矢束を拾える・HUD は ×0）', async ({ page }) => {
		// 🔴 2026-09-21 ユーザー報告の当て所。撃ち切ったときスロットを消すと
		//    `ownsItem(player,'bow')` が偽に戻り、ここで「弓矢が無いと持っていけない」に
		//    なる＝二度と矢を補充できない詰み。
		await open(page, { row: ARROW_A.r, col: 2 });
		await grantBow(page, 1);
		await page.evaluate(() => window.__game.useSubItem());   // 最後の1本を撃つ

		expect(await page.evaluate(() => !!window.__game.getPlayer().subItems.bow),
			'撃ち切って弓のスロットが消えた（弓を失った）').toBe(true);
		expect(await arrows(page)).toBe(0);
		expect(await page.evaluate(() => window.__game.getPlayer().activeSubItem),
			'撃ち切って持ち替えが起きた（弓を構えたままであるべき）').toBe('bow');
		expect(await page.evaluate(() => document.getElementById('hud-sub-count').textContent),
			'残弾 0 が空欄＝笛やブーメランと同じ見た目になっている').toBe('×0');

		// 拾える（ここが報告された症状）
		await walkTo(page, ARROW_A);
		expect(await arrows(page), '弓を持っているのに矢束を拾えなかった').toBe(ARROW_A.count);
		expect(await picked(page)).toContain(`${ARROW_A.r},${ARROW_A.c}`);
	});

	test('⑫ 上限を超えて持っている状態で矢束を踏んでも本数が減らない', async ({ page }) => {
		// プレビュー設定や旧セーブは上限（既定8）を超える本数を直接持てる。
		// `Math.min(prev+add, cap)` だけだと**踏んだだけで 10 → 8 に減る**（拾って損する）。
		await open(page, { row: ARROW_A.r, col: 2 });
		await grantBow(page, 10);
		expect(await page.evaluate(() => window.__game.getPlayer().maxArrows)).toBe(8);

		await walkTo(page, ARROW_A);
		expect(await arrows(page), '矢束を踏んで矢が減った').toBe(10);
		expect(await picked(page), '拾えていないのにタイルが消えた').not.toContain(`${ARROW_A.r},${ARROW_A.c}`);
	});

	test('⑬ 爆弾を置き切っても火薬は失わない（床の爆弾を拾える）', async ({ page }) => {
		// 弓と同じ機構（`delete player.subItems[id]`）が projectile.js にもあった。
		await open(page, { row: BOMB.r, col: 2 });
		await page.evaluate(() => {
			const p = window.__game.getPlayer();
			p.subItems.bomb = { count: 1 }; p.activeSubItem = 'bomb';
		});
		await page.evaluate(() => window.__game.useSubItem());   // 最後の1個を置く

		expect(await page.evaluate(() => !!window.__game.getPlayer().subItems.bomb),
			'置き切って爆弾のスロットが消えた（火薬を失った）').toBe(true);
		expect(await bombs(page)).toBe(0);
		await walkTo(page, BOMB);
		expect(await bombs(page), '火薬を持っているのに床の爆弾を拾えなかった').toBe(BOMB.count);
	});

	test('⑭ プレビュー設定の弓矢は上限ちょうど（上限超えの状態を作らない）', async ({ page }) => {
		await open(page, { row: ARROW_A.r, col: 2, params: { ps_bow: '1' } });
		const p = await page.evaluate(() => {
			const pl = window.__game.getPlayer();
			return { count: pl.subItems.bow?.count, max: pl.maxArrows };
		});
		expect(p.count, 'プレビューが上限を超える本数を渡している（⑫ の状態を自分で作る）').toBe(p.max);
	});

	test('⑦ 敵ドロップの矢も弓が無ければ入らない（弓があれば入る）', async ({ page }) => {
		await open(page, { row: ARROW_A.r, col: 2 });
		// 弓なし：ドロップを拾っても矢は増えない（スロットも生えない）
		await page.evaluate(() => { window.__game.spawnFloorDrop(4, 2, 'arrow'); window.__game.pickupFloorDrop(4, 2); });
		expect(await arrows(page), '弓が無いのに敵ドロップの矢が入った').toBeNull();

		// 弓あり：同じドロップで +3
		await grantBow(page, 0);
		await page.evaluate(() => { window.__game.spawnFloorDrop(4, 2, 'arrow'); window.__game.pickupFloorDrop(4, 2); });
		expect(await arrows(page)).toBe(3);
	});
});

test.describe('エディタで矢束の本数を編集する（実行キュー19）', () => {
	async function openTestStage(page) {
		await page.goto(EDITOR_URL);
		await page.evaluate((json) => localStorage.setItem('bladeOfLumiaMapData', json), JSON.stringify(MAP));
		await page.reload();
		await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
		await page.locator('.layer-tab', { hasText: new RegExp(`^${TEST_LAYER}`) }).click();
		const [x, y] = STAGE.split(',');
		const cell = page.locator('#world-grid .world-cell')
			.filter({ has: page.locator('.cell-coord', { hasText: `(${x},${y})` }) });
		await cell.first().click();
		await page.locator('#btn-edit-stage').click();
		await expect(page.locator('#view-stage')).not.toHaveClass(/hidden/);
	}
	const floorItem = (page, label) => page.locator('#equip-flooritems-list .link-item')
		.filter({ has: page.locator('.link-item-header', { hasText: label }) });

	test('⑨ 本数欄が出て、変えて保存すると floorItems.count に入る（空欄＝既定に戻る）', async ({ page }) => {
		page.on('dialog', (d) => d.dismiss());   // 保存はダイアログを出す
		await openTestStage(page);

		// 3件（矢束2つ・爆弾1つ）が並び、本数は実データどおり出る
		await expect(page.locator('#equip-flooritems-list .link-item')).toHaveCount(3);
		const itemA = floorItem(page, `矢束 (${ARROW_A.r},${ARROW_A.c})`);
		const itemB = floorItem(page, `矢束 (${ARROW_B.r},${ARROW_B.c})`);
		await expect(itemA.locator('[data-f="count"]')).toHaveValue(String(ARROW_A.count));
		await expect(itemB.locator('[data-f="count"]')).toHaveValue('');
		await expect(itemB.locator('[data-f="count"]')).toHaveAttribute('placeholder', `既定 ${ARROW_DEFAULT}`);
		await expect(floorItem(page, `爆弾 (${BOMB.r},${BOMB.c})`).locator('[data-f="count"]'))
			.toHaveValue(String(BOMB.count));

		// 本数を変える／片方は空欄にして既定へ戻す
		await itemB.locator('[data-f="count"]').fill('7');
		await itemA.locator('[data-f="count"]').fill('');

		await page.locator('#btn-save').click();
		const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('bladeOfLumiaMapData')));
		const fi = saved.layers[TEST_LAYER].stages[STAGE].floorItems;
		expect(fi[`${ARROW_B.r},${ARROW_B.c}`].count, '本数の編集が保存されていない').toBe(7);
		expect(fi[`${ARROW_A.r},${ARROW_A.c}`]?.count, '空欄にしても本数が残っている').toBeUndefined();

		// 保存した内容で開き直しても同じ（往復で失われない）
		await page.reload();
		await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
		await page.locator('.layer-tab', { hasText: new RegExp(`^${TEST_LAYER}`) }).click();
		const [x, y] = STAGE.split(',');
		await page.locator('#world-grid .world-cell')
			.filter({ has: page.locator('.cell-coord', { hasText: `(${x},${y})` }) }).first().click();
		await page.locator('#btn-edit-stage').click();
		await expect(floorItem(page, `矢束 (${ARROW_B.r},${ARROW_B.c})`).locator('[data-f="count"]')).toHaveValue('7');
		await expect(floorItem(page, `矢束 (${ARROW_A.r},${ARROW_A.c})`).locator('[data-f="count"]')).toHaveValue('');
	});
});
