// tests/d8-flute-stone.spec.js
// dungeon_8 `1,2`＝笛で呼び戻す石（笛の間・パズルの部屋）と、石を戻す笛まわりの規則の番人。
//
// 経緯：キュー112（2026-11-22・`scripts/migrate-d8-1-2-flute-stone.mjs`）。ユーザー提案「積極的に笛で戻す操作をしないと
// 解けないパズル」。笛は石だけを元の位置へ戻し、勇者はその場に残る＝石の裏へ回ってから吹くと石が前に戻る。
// 設計中に既存の穴が見つかった＝石の戻る場所に立って吹くと石が勇者に重なり、どの向きにも動けなくなる（D8 `2,4` で実測）。
//
// 守るもの：
// ① 盤面・笛の宝箱・宝箱・水門のつながり・石碑・笛の効き目・石が出ても戻らない指定・敵なし
// ② ソルバー：笛があれば解ける（笛の後に押す）・笛なしでは解けない・閉じ込めなし
// ③ 実機：解をなぞる（笛を1回吹く）と水門が開き、宝箱でルピー +100
// ④ 実機：石の戻る場所に立って笛を吹いても石は戻らず、動ける（D8 `2,4` でも同じ）
// ⑤ 実機：この部屋の石は出ても戻らない（着地セルに石が残っていたときの手当て＝game.js enterStage は未検証）
// ⑥ 実機：笛で石が戻るとき、石が浮いて元の位置へ飛ぶ（キュー112b）＝状態はすぐ戻る・飛んでいる間は元の位置の絵を隠す・勇者は止まる・終われば層が消える
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import {
	AFTER, WATER, CHEST, CONTENT, FLUTE_CHEST, LINKS, SIGN_AFTER, solverOf, nextWith, analyze,
} from '../scripts/migrate-d8-1-2-flute-stone.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dungeon_8';
const ROOM = '1,2';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – D8 笛で呼び戻す石（キュー112）', () => {
	test('① 盤面・宝箱・水門・石碑・笛の効き目・指定・敵なし', () => {
		const g = rowsOf(st);
		expect(g, '1,2 の盤面').toEqual(AFTER);
		expect(Object.keys(st.bgTiles).sort(), '水（bgTiles）').toEqual([...WATER].sort());
		expect(st.chestContents[FLUTE_CHEST].item, '笛の宝箱').toBe('flute');
		expect(st.chestContents[CHEST], '中身').toEqual(CONTENT);
		expect(st.links, '水門のつながり').toEqual(LINKS);
		expect(st.signData['1,9'], '石碑').toEqual(SIGN_AFTER);
		expect(st.fluteEffect, '笛で石が戻る').toEqual({ type: 'resetStones' });
		expect(st.keepStonesOnExit, '石は出ても戻らない').toBe(true);
		expect(g.some((row) => [...row].some((ch) => ENEMY_META[ch])), '敵を置かない').toBe(false);
	});

	test('② ソルバー：笛があれば解ける・笛なしでは解けない・閉じ込めなし', () => {
		const withF = analyze({ flute: true });
		const noF = analyze({ flute: false });
		expect(withF.solvable, '笛があっても解けない').toBe(true);
		expect(withF.events, '笛の後に押す解').toMatch(/F.*P{3,}/);
		expect(noF.solvable, '笛なしで解ける').toBe(false);
		expect(withF.noEscape + noF.noEscape, '閉じ込め').toBe(0);
	});
});

const previewUrl = (row, col, layer = LAYER, stage = ROOM) => `/blade-of-lumia/game/?${new URLSearchParams({
	fromEditor: '1', layer, stage, row: String(row), col: String(col),
	ps_hearts: '13', ps_sword: '0', ps_shield: '1', ps_armor: '0', ps_ladder: '1', ps_flute: '1',
})}`;
const at = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return Number.isInteger(p.y) && Number.isInteger(p.x) ? `${p.y},${p.x}` : `mid ${p.y},${p.x}`;
});
const blow = (page) => page.evaluate(() => { const g = window.__game; g.getPlayer().activeSubItem = 'flute'; g.useSubItem(); g.step(3); });
// 石が戻る演出（キュー112b）の間は勇者が止まる＝演出の層が消えるまで待つ
const flute = async (page) => {
	await blow(page);
	await page.waitForFunction(() => !document.getElementById('stone-return-layer'), null, { timeout: 3000 });
	await page.waitForTimeout(50);
};
const stones = (page) => page.evaluate(() => JSON.stringify(window.__game.getStageState().stonePositions ?? {}));

test.describe('Blade of Lumia – D8 笛で呼び戻す石は実機で解ける（キュー112）', () => {
	test('③ 解をなぞる（笛を1回吹く）と水門が開き、宝箱でルピー +100', async ({ page }) => {
		test.setTimeout(180_000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		// 最短の解（BFS）を手順に起こす
		const S = solverOf(AFTER.map((r, i) => [...r].map((ch, c) => (WATER.includes(`${i},${c}`) ? '~' : ch)).join('')));
		const next = nextWith(S, true);
		const start = S.encode(5, 1, S.initStones, 0, 0, S.litInitMask);
		const par = new Map([[start, null]]); const q = [start]; let goal = null;
		while (q.length) { const s = q.shift(); if (s.split('|')[0] === CHEST) { goal = s; break; } for (const x of next(s)) if (!par.has(x)) { par.set(x, s); q.push(x); } }
		const path = []; for (let x = goal; x; x = par.get(x)) path.unshift(x);

		await freezeGameLoop(page);
		await page.goto(previewUrl(5, 1));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const r0 = await page.evaluate(() => window.__game.getPlayer().rupees);
		let flutes = 0;
		for (let i = 1; i < path.length; i++) {
			const [a, b] = [path[i - 1].split('|'), path[i].split('|')];
			if (a[0] === b[0] && a[1] !== b[1]) {   // 笛
				await flute(page); flutes++;
				expect(await stones(page), `手 ${i}：笛で石が戻らない`).toBe('{}');
				continue;
			}
			const [pr, pc] = a[0].split(',').map(Number); const [nr, nc] = b[0].split(',').map(Number);
			const dir = nr < pr ? 'up' : nr > pr ? 'down' : nc < pc ? 'left' : 'right';
			for (let k = 0; k < 4 && (await at(page)) !== b[0]; k++) {
				await page.evaluate((x) => { window.__game.setHeroDir(x); window.__game.movePlayer(x); window.__game.step(1); }, dir);
			}
			if (a[1] !== b[1]) await page.waitForTimeout(700);   // 石押しの冷却（実時間 600ms）
			expect(await at(page), `手 ${i}：${a[0]} → ${b[0]}`).toBe(b[0]);
		}
		expect(flutes, '笛を吹いた回数').toBe(1);
		await page.evaluate(() => window.__game.step(5));
		const r1 = await page.evaluate(() => window.__game.getPlayer().rupees);
		expect(r1 - r0, 'ルピー×100 を拾えていない').toBe(100);
		expect(errors, errors.join('\n')).toEqual([]);
	});

	test('④ 石の戻る場所に立って笛を吹いても石は戻らず、動ける（D8 2,4 でも同じ）', async ({ page }) => {
		const move = (d, n) => page.evaluate(({ d, n }) => { const g = window.__game; for (let i = 0; i < n * 2; i++) { g.setHeroDir(d); g.movePlayer(d); g.step(1); } }, { d, n });
		for (const [stage, start, dir, origin] of [[ROOM, [7, 7], 'right', '7,8'], ['2,4', [1, 3], 'down', '2,3']]) {
			await freezeGameLoop(page);
			await page.goto(previewUrl(start[0], start[1], LAYER, stage));
			await waitForBoard(page);
			await page.keyboard.press('g');
			await move(dir, 1);                       // 石を1マス押す＝勇者は石の元の位置に立つ
			expect(await at(page), `${stage}：前提＝石の元の位置に立つ`).toBe(origin);
			const before = await stones(page);
			expect(before, `${stage}：前提＝石が動いた`).not.toBe('{}');
			await page.waitForTimeout(700);
			await flute(page);
			expect(await stones(page), `${stage}：石が勇者の上に戻った`).toBe(before);
			const back = dir === 'right' ? 'left' : 'up';
			await move(back, 1);
			expect(await at(page), `${stage}：笛の後に動けない`).not.toBe(origin);
		}
	});

	test('⑤ この部屋の石は出ても戻らない', async ({ page }) => {
		test.setTimeout(60_000);
		await freezeGameLoop(page);
		await page.goto(previewUrl(7, 7));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const move = (d, n) => page.evaluate(({ d, n }) => { const g = window.__game; for (let i = 0; i < n * 2; i++) { g.setHeroDir(d); g.movePlayer(d); g.step(1); } }, { d, n });
		await move('right', 1);                       // 石 (7,8) → (7,9)
		const moved = await stones(page);
		expect(moved, '前提：石が動いた').toBe(JSON.stringify({ '7,8': { r: 7, c: 9 } }));
		// 南の口 (8,6)→(9,6) から出て、戻る
		await move('left', 2); await move('down', 1);
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 4; i++) { g.movePlayer('down'); g.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey !== '1,2', null, { timeout: 5000 });
		await page.evaluate(() => { const g = window.__game; g.step(3); for (let i = 0; i < 3; i++) { g.movePlayer('up'); g.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '1,2', null, { timeout: 5000 });
		expect(await stones(page), '出入りで石が戻った（笛の代わりになる）').toBe(moved);
	});

	test('⑥ 笛で石が戻るとき、石が浮いて元の位置へ飛ぶ（キュー112b）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		const move = (d, n) => page.evaluate(({ d, n }) => { const g = window.__game; for (let i = 0; i < n * 2; i++) { g.setHeroDir(d); g.movePlayer(d); g.step(1); } }, { d, n });
		await freezeGameLoop(page);
		await page.goto(previewUrl(7, 7));
		await waitForBoard(page);
		await page.keyboard.press('g');
		await move('right', 1); await page.waitForTimeout(700);   // 石 (7,8) → (7,9)
		await move('left', 2);                                    // 石の戻る場所から離れる
		const p0 = await at(page);
		await blow(page);
		const mid = await page.evaluate(() => {
			const layer = document.getElementById('stone-return-layer');
			const st = layer?.querySelector('.stone-return');
			const orig = document.querySelector('#board .cell[data-row="7"][data-col="8"] > canvas.obj-sprite');
			return { layer: !!layer, stone: !!st, origHidden: orig?.style.visibility === 'hidden', stones: JSON.stringify(window.__game.getStageState().stonePositions ?? {}) };
		});
		expect(mid.layer && mid.stone, '石が飛ぶ層が出ていない').toBe(true);
		expect(mid.origHidden, '飛んでいる間、元の位置の石の絵が見えている（二重に見える）').toBe(true);
		expect(mid.stones, '状態は吹いた瞬間に戻る').toBe('{}');
		await move('down', 1);
		expect(await at(page), '飛んでいる間に勇者が動いた').toBe(p0);
		await page.waitForFunction(() => !document.getElementById('stone-return-layer'), null, { timeout: 3000 });
		const after = await page.evaluate(() => document.querySelector('#board .cell[data-row="7"][data-col="8"] > canvas.obj-sprite')?.style.visibility);
		expect(after, '着いた後も元の位置の石が隠れたまま').toBe('');
		await page.waitForTimeout(50);
		await move('down', 1);
		expect(await at(page), '演出の後に動けない').not.toBe(p0);
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
