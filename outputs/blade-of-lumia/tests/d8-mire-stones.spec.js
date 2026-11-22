// tests/d8-mire-stones.spec.js
// dungeon_8 `2,4`＝底なし沼の石（パズルの部屋）と、底なし沼の肌（溶岩タイル＋泥の下地）の番人。
//
// 経緯：キュー112（2026-11-21・`scripts/migrate-d8-2-4-mire-stones.mjs`）。ユーザーが選んだ主題「泥に沈める石」。
// 新しいタイルは作らず、溶岩 `l`（石を押し込むと沈んで床になる）を、下地が泥のとき泥沼の色で描く
// （shared/tile-skins.js lavaSkinAt・render-board.js・沈んだときの言葉と音は player.js）。
// 石2つを同じ列の泥に沈め、水の帯をはしごで渡って宝箱へ。
//
// 守るもの：
// ① 盤面・泥と水の下地・宝箱・笛・敵なし
// ② 肌：下地が泥の溶岩は 'mire'、ほかの溶岩（D4）は肌なし
// ③ ソルバー：押し 11・はしご無しでは解けない・石は2つとも要る・詰む状態あり・閉じ込めなし
// ④ 実機：泥の溶岩は泥沼の色で描かれる（.mire）・解をなぞると石が泥に沈んで足場になり、宝箱へ渡れる
// ⑤ 実機：石を沈めた後に笛を吹くと、石が戻って泥も戻る
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import { describeCell } from '../shared/cell-appearance.js';
import {
	AFTER, MIRE, WATER, CHEST, STONES, MIN_PUSHES, DESIGN, bestSolution, measureRoom,
} from '../scripts/migrate-d8-2-4-mire-stones.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dungeon_8';
const ROOM = '2,4';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – D8 底なし沼の石（キュー112）', () => {
	test('① 盤面・泥と水の下地・宝箱・笛・敵なし', () => {
		const g = rowsOf(st);
		expect(g, '2,4 の盤面').toEqual(AFTER);
		expect(MIRE.every((k) => st.bgTiles[k] === TILE.MUD), '底なし沼の下地は泥').toBe(true);
		expect(WATER.every((k) => st.bgTiles[k] === TILE.WATER), '水の帯').toBe(true);
		expect(st.chestContents[CHEST], '中身').toEqual({ type: 'rupee', value: 50, name: 'ルピー×50' });
		expect(st.fluteEffect, '笛で石が戻る').toEqual({ type: 'resetStones' });
		expect(g.some((row) => [...row].some((ch) => ENEMY_META[ch])), '敵を置かない').toBe(false);
	});

	test('② 肌：下地が泥の溶岩は泥沼・D4 の溶岩は肌なし', () => {
		const [r, c] = MIRE[0].split(',').map(Number);
		expect(describeCell(st, r, c, TILE.LAVA, LAYER).obj?.skin, 'D8 の泥の溶岩').toBe('mire');
		expect(describeCell(st, r, c, TILE.LAVA, LAYER).obj?.pal, '泥の色').toBe('mire');
		// D4 の溶岩（下地は泥でない）は今までどおり
		let d4 = null;
		for (const [k, s] of Object.entries(map.layers.dungeon_4.stages)) {
			s.tiles.forEach((row, rr) => row.forEach((ch, cc) => { if (!d4 && ch === TILE.LAVA) d4 = { s, rr, cc, k }; }));
		}
		expect(d4, '前提：D4 に溶岩がある').toBeTruthy();
		expect(describeCell(d4.s, d4.rr, d4.cc, TILE.LAVA, 'dungeon_4').obj?.pal, `D4 ${d4.k} の溶岩`).toBe('lava');
	});

	test('③ ソルバー：押し 11・はしごと石2つが要る・詰む状態あり・閉じ込めなし', () => {
		expect(bestSolution(DESIGN)?.pushes, '最少の押し').toBe(MIN_PUSHES);
		expect(bestSolution(DESIGN, { ladder: false }), 'はしご無しで解ける').toBeNull();
		for (const s of STONES) {
			const [r, c] = s.split(',').map(Number);
			const walled = DESIGN.map((row, i) => (i === r ? row.slice(0, c) + '#' + row.slice(c + 1) : row));
			expect(bestSolution(walled), `対照：石 ${s} を壁にすると解けない`).toBeNull();
		}
		const m = measureRoom(DESIGN);
		expect(m.deadlocks, '詰む状態').toBeGreaterThan(0);
		expect(m.noEscape, '閉じ込め').toBe(0);
	});
});

const previewUrl = (row, col, extra = {}) => {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_hearts: '13', ps_sword: '0', ps_shield: '1', ps_armor: '0', ps_ladder: '1', ...extra,
	});
	return `/blade-of-lumia/game/?${p}`;
};
const at = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return Number.isInteger(p.y) && Number.isInteger(p.x) ? `${p.y},${p.x}` : `mid ${p.y},${p.x}`;
});

test.describe('Blade of Lumia – D8 底なし沼の石は実機で解ける（キュー112）', () => {
	test('④ 泥沼の色で描かれ、解をなぞると石が泥に沈んで宝箱へ渡れる', async ({ page }) => {
		test.setTimeout(120_000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		const { cells } = bestSolution(DESIGN);
		await freezeGameLoop(page);
		await page.goto(previewUrl(...cells[0].split(',').map(Number)));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const [mr, mc] = MIRE[0].split(',').map(Number);
		expect(await page.locator(`#board .cell[data-row="${mr}"][data-col="${mc}"]`).getAttribute('class'), '泥沼の色').toContain('mire');
		const r0 = await page.evaluate(() => window.__game.getPlayer().rupees);
		let pushes = 0;
		for (let i = 1; i < cells.length; i++) {
			const [a, b] = cells[i - 1].split(',').map(Number);
			const [c, d] = cells[i].split(',').map(Number);
			const dir = c < a ? 'up' : c > a ? 'down' : d < b ? 'left' : 'right';
			const before = await page.evaluate(() => JSON.stringify(window.__game.getStageState().stonePositions ?? {}));
			for (let k = 0; k < 4 && (await at(page)) !== cells[i]; k++) {
				await page.evaluate((x) => { window.__game.setHeroDir(x); window.__game.movePlayer(x); window.__game.step(1); }, dir);
			}
			const after = await page.evaluate(() => JSON.stringify(window.__game.getStageState().stonePositions ?? {}));
			// 石押しの冷却（600ms）。泥に沈んだ押しは、沈むのを見せ終わるまで移動が止まる（約 1.2 秒）
			const sank = (s) => (s.match(/"sunk"/g) ?? []).length;
			if (before !== after) { pushes++; await page.waitForTimeout(sank(after) > sank(before) ? 1400 : 700); }
			expect(await at(page), `手 ${i}：${cells[i - 1]} → ${cells[i]}`).toBe(cells[i]);
		}
		expect(pushes, '押した回数').toBe(MIN_PUSHES);
		const sunk = await page.evaluate(() => Object.values(window.__game.getStageState().stonePositions ?? {}).map((s) => s.sunk).filter(Boolean).sort());
		expect(sunk, '石が2つとも同じ列の泥に沈んだ').toEqual(['5,6', '6,6']);
		expect(await page.locator('#board .cell[data-row="5"][data-col="6"]').getAttribute('data-cooled-lava'), '沈んだ石の足場').toBe('1');
		await page.evaluate(() => window.__game.step(5));
		const r1 = await page.evaluate(() => window.__game.getPlayer().rupees);
		expect(r1 - r0, 'ルピー×50 を拾えていない').toBe(50);
		// キュー112b：泥橋の先（7,6）(8,6) に乗ったら石は固まる（lockStonesAt）＝小島で笛を吹いても泥橋は消えず、帰れる
		expect(await page.evaluate(() => window.__game.getStageState().stonesLocked), '泥橋の先に乗っても石が固まらない（lockStonesAt）').toBe(true);
		const bridge = await page.evaluate(() => JSON.stringify(window.__game.getStageState().stonePositions));
		await page.evaluate(() => { const g = window.__game; g.getPlayer().activeSubItem = 'flute'; g.useSubItem(); g.step(3); });
		expect(await page.evaluate(() => JSON.stringify(window.__game.getStageState().stonePositions)), '小島で笛を吹いたら泥橋が消えた').toBe(bridge);
		for (let k = 0; k < 12 && (await at(page)) !== '4,6'; k++) {
			await page.evaluate(() => { const g = window.__game; g.setHeroDir('up'); g.movePlayer('up'); g.step(1); });
		}
		expect(await at(page), '宝箱の小島から泥橋を渡って戻れない').toBe('4,6');
		expect(errors, errors.join('\n')).toEqual([]);
	});

	test('⑤ 石を沈めた後に笛を吹くと、石が戻って泥も戻る', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(1, 8, { ps_flute: '1' }));
		await waitForBoard(page);
		await page.keyboard.press('g');
		// (1,8) から石 (3,8) を南へ2回＝(5,8) の泥に沈む
		const down = () => page.evaluate(() => { const g = window.__game; for (let i = 0; i < 2; i++) { g.setHeroDir('down'); g.movePlayer('down'); g.step(1); } });
		await down();                              // (1,8) → (2,8)
		await down();                              // 石 (3,8) → (4,8)
		await page.waitForTimeout(700);            // 石押しの冷却時間（実時間 600ms）
		await down();                              // 石 (4,8) → (5,8) の泥に沈む
		await page.waitForTimeout(700);
		// 沈むのを見せ終わるまでは笛も吹けない（キュー112b・game.js playFlute）
		await page.waitForFunction(() => !window.__game.movesHeld(), null, { timeout: 3000 });
		const res = await page.evaluate(() => {
			const g = window.__game;
			const sunk = Object.values(g.getStageState().stonePositions ?? {}).map((s) => s.sunk).filter(Boolean);
			g.useSubItem(); g.step(3);
			return { sunk, after: JSON.stringify(g.getStageState().stonePositions ?? {}) };
		});
		expect(res.sunk, '前提：石が泥に沈んだ').toEqual(['5,8']);
		expect(res.after, '笛を吹いても石が戻らない').toBe('{}');
		expect(await page.locator('#board .cell[data-row="5"][data-col="8"]').getAttribute('data-cooled-lava'), '泥が戻っていない').toBeNull();
	});

	// 2026-11-21 ユーザー指摘「石を泥に入れた瞬間にプレイヤーが石の上に乗ってしまい、何が起きたかわからない」
	test('⑥ 石が泥に沈む押しの後は、沈むのを見せ終わるまで移動が止まる（ふつうの押しは止まらない）', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(1, 8));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const down = () => page.evaluate(() => { const g = window.__game; for (let i = 0; i < 2; i++) { g.setHeroDir('down'); g.movePlayer('down'); g.step(1); } return g.getPlayer().y; });
		await down();                              // (1,8) → (2,8)
		expect(await down(), 'ふつうの押し：石 (3,8)→(4,8)・プレイヤー (3,8)').toBe(3);
		await page.waitForTimeout(700);
		expect(await down(), '沈む押し：石 (4,8)→(5,8) の泥・プレイヤー (4,8)').toBe(4);
		// 押しっぱなし（すぐ次の下）＝止まる
		expect(await down(), '沈むのを見せている間に石の上へ進んだ').toBe(4);
		await page.waitForTimeout(500);
		expect(await down(), 'まだ見せている間に進んだ').toBe(4);
		await page.waitForTimeout(900);
		expect(await down(), '見せ終わった後も進めない').toBe(5);
	});

	// キュー112b（ユーザーの問い「逆に脱出できなくなるステージはない？」を状態空間で測って発覚）：
	// 沈めた石の足場に立って笛を吹くと、足元が泥に戻ってどの向きにも動けなくなっていた＝不発にした
	test('⑦ 沈めた石の足場に立って笛を吹いても石は戻らず、動ける', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		await page.goto(previewUrl(1, 3, { ps_flute: '1' }));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const move = (d) => page.evaluate((x) => { const g = window.__game; for (let i = 0; i < 2; i++) { g.setHeroDir(x); g.movePlayer(x); g.step(1); } }, d);
		for (let i = 0; i < 3; i++) {                 // 石 (2,3) を南へ3回＝(5,3) の泥に沈む
			await move('down'); await page.waitForTimeout(700);
			await page.waitForFunction(() => !window.__game.movesHeld(), null, { timeout: 3000 });
		}
		await move('down');                           // 沈んだ石の足場 (5,3) に乗る
		expect(await at(page), '前提：沈んだ石の足場に立つ').toBe('5,3');
		const before = await page.evaluate(() => JSON.stringify(window.__game.getStageState().stonePositions));
		expect(before, '前提：石が (5,3) に沈んだ').toContain('"sunk":"5,3"');
		await page.evaluate(() => { const g = window.__game; g.getPlayer().activeSubItem = 'flute'; g.useSubItem(); g.step(3); });
		expect(await page.evaluate(() => JSON.stringify(window.__game.getStageState().stonePositions)), '足場の上で笛が効いて泥に戻った').toBe(before);
		await move('up');
		expect(await at(page), '笛の後に足場から動けない').toBe('4,3');
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
