// tests/d8-sluice-stones.spec.js
// dungeon_8 `1,3`＝水門と石（入口・パズルの部屋）の番人。
//
// 経緯：キュー112（2026-11-21・`scripts/migrate-d8-1-3-sluice-stones.mjs`）。最初の「入口は軽く」（葦とヒル1匹）は
// ユーザー指摘「簡単すぎる・難しさに寄与していない」で取り下げ、ユーザー選択の主題「水門と石」で作り直した。
//
// 守るもの：
// ① 盤面・水門のつながり・宝箱・戻り口・石碑・北の水の帯・敵なし
// ② ソルバー：押し 19・詰む状態あり・閉じ込めなし・石も水門も2つとも効く
// ③ 実機：解をなぞると水門が開き、宝箱でルピー +100
// ④ 実機：自分で踏み板に立つと水門は開くが、降りると閉じる（石に押さえさせる理由）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import {
	AFTER, WATER, CHEST, CONTENT, STONES, GATES, LINKS, MIN_PUSHES, DESIGN, bestSolution, measureRoom,
} from '../scripts/migrate-d8-1-3-sluice-stones.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dungeon_8';
const ROOM = '1,3';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const set = (design, k, ch) => design.map((row, r) => [...row].map((x, c) => (`${r},${c}` === k ? ch : x)).join(''));

test.describe('Blade of Lumia – D8 水門と石（キュー112）', () => {
	test('① 盤面・水門のつながり・宝箱・戻り口・石碑・水の帯・敵なし', () => {
		const g = rowsOf(st);
		expect(g, '1,3 の盤面').toEqual(AFTER);
		expect(Object.keys(st.bgTiles).sort(), '水（bgTiles）').toEqual([...WATER].sort());
		expect(st.links, '水門のつながり').toEqual(LINKS);
		expect(st.chestContents[CHEST], '中身').toEqual(CONTENT);
		expect(st.mapEnters['7,2'].destId, '戻り口').toBe('field_dungeon8');
		expect(st.signData['7,4'].name, '石碑').toBe('沼地の神殿・入口の石碑');
		expect(g.some((row) => [...row].some((ch) => ENEMY_META[ch])), '敵を置かない').toBe(false);
	});

	test('② ソルバー：押し 19・詰む状態あり・閉じ込めなし・石も水門も効く', () => {
		expect(bestSolution(DESIGN)?.pushes, '最少の押し').toBe(MIN_PUSHES);
		const m = measureRoom(DESIGN);
		expect(m.deadlocks, '詰む状態').toBeGreaterThan(0);
		expect(m.noEscape, '閉じ込め').toBe(0);
		for (const s of STONES) expect(bestSolution(set(DESIGN, s, '#')), `対照：石 ${s} 無しで解ける`).toBeNull();
		for (const gk of GATES) {
			const e = bestSolution(set(DESIGN, gk, '.'), { links: LINKS.filter((l) => l.gateId !== gk) });
			expect(!e || e.pushes < MIN_PUSHES, `対照：水門 ${gk} を開けっぱなしにしても易しくならない`).toBe(true);
		}
	});
});

const previewUrl = (row, col) => `/blade-of-lumia/game/?${new URLSearchParams({
	fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
	ps_hearts: '13', ps_sword: '0', ps_shield: '1', ps_armor: '0', ps_ladder: '1',
})}`;
const at = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return Number.isInteger(p.y) && Number.isInteger(p.x) ? `${p.y},${p.x}` : `mid ${p.y},${p.x}`;
});

test.describe('Blade of Lumia – D8 水門と石は実機で解ける（キュー112）', () => {
	test('③ 解をなぞると水門が開き、宝箱でルピー +100', async ({ page }) => {
		test.setTimeout(180_000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		const { cells } = bestSolution(DESIGN);
		await freezeGameLoop(page);
		await page.goto(previewUrl(...cells[0].split(',').map(Number)));
		await waitForBoard(page);
		await page.keyboard.press('g');
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
			if (before !== after) { pushes++; await page.waitForTimeout(700); }   // 石押しの冷却（実時間 600ms）
			expect(await at(page), `手 ${i}：${cells[i - 1]} → ${cells[i]}`).toBe(cells[i]);
		}
		expect(pushes, '押した回数').toBe(MIN_PUSHES);
		await page.evaluate(() => window.__game.step(5));
		const r1 = await page.evaluate(() => window.__game.getPlayer().rupees);
		expect(r1 - r0, 'ルピー×100 を拾えていない').toBe(100);
		expect(errors, errors.join('\n')).toEqual([]);
	});

	test('④ 自分で踏み板に立つと水門は開くが、降りると閉じる', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(5, 10));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const open = () => page.evaluate(() => [...(window.__game.getStageState().openGates ?? [])].sort());
		expect(await open(), '前提：最初は閉じている').toEqual([]);
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 2; i++) { g.movePlayer('up'); g.step(1); } g.step(2); });   // (5,10) → 踏み板 (4,10)
		expect(await open(), '踏み板 (4,10) に立つと水門 (7,10) が開く').toEqual(['7,10']);
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 2; i++) { g.movePlayer('down'); g.step(1); } g.step(2); });
		expect(await open(), '降りても水門が閉じない').toEqual([]);
	});
});
