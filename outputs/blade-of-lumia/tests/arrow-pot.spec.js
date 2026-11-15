// 矢の壺（TILE.ARROW_POT '0'・2026-11-15）と D8 二色の鐘の間の「矢を撃ち尽くしても出られる」
//
// きっかけ＝ユーザー指摘「このステージって矢がなくなったらつまない？」＋「決まった数の矢を置くだけじゃだめ…
// 矢の数が0になったら矢が自動的に現れるツボ」。作った時のソルバーは矢を無限として数えていた＝見逃した。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE, FOOT_SOLID_TILES } from '../shared/tiles.js';
import { arrowPotState, arrowPotRefillCount, ARROW_POT_REFILL } from '../shared/arrow-pot.js';
import { D8_ARROW_POTS } from '../scripts/migrate-d8-3-0-arrow-pots.mjs';

const map = JSON.parse(readFileSync(fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url)), 'utf8'));
const P = D8_ARROW_POTS;

test.describe('矢の壺の決まり', () => {
	test('弓が無い／矢がある＝何もしない・弓があって0本＝5本に戻る（矢筒の上限を超えない）', () => {
		expect(arrowPotState({ subItems: {} })).toBe('noBow');
		expect(arrowPotState({ subItems: { bow: { count: 3 } } })).toBe('hasArrows');
		expect(arrowPotRefillCount({ subItems: { bow: { count: 3 } }, maxArrows: 8 }), '矢があるのに増えた').toBe(3);
		expect(arrowPotState({ subItems: { bow: { count: 0 } } })).toBe('ready');
		expect(arrowPotRefillCount({ subItems: { bow: { count: 0 } }, maxArrows: 8 })).toBe(ARROW_POT_REFILL);
		expect(arrowPotRefillCount({ subItems: { bow: { count: 0 } }, maxArrows: 3 })).toBe(3);
		expect(FOOT_SOLID_TILES.has(TILE.ARROW_POT), '壺に乗れる').toBe(true);
	});
});

// ── 盤の上の総当たり：矢0本・剣で隣の鐘を叩くだけ（ビーム無し＝木の剣）で、どこからでも壺か出口に届く ──
function escapeCheck(sd) {
	const tiles = sd.tiles.map((r) => (Array.isArray(r) ? r : [...r]));
	const H = tiles.length, W = tiles[0].length;
	const water = (r, c) => sd.bgTiles?.[`${r},${c}`] === '~';
	const walk = (r, c, color) => {
		if (r < 0 || c < 0 || r >= H || c >= W) return false;
		const t = tiles[r][c];
		if (FOOT_SOLID_TILES.has(t) || water(r, c)) return false;
		if (t === TILE.GATE_RED) return color === 'red';
		if (t === TILE.GATE_BLUE) return color === 'blue';
		return true;
	};
	const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
	const goal = (r, c) => r === H - 1 || D.some(([dr, dc]) => tiles[r + dr]?.[c + dc] === TILE.ARROW_POT);
	const stuck = [];
	// 色が未設定（null）なのは入る前だけ＝門が全部閉じていて入口の区画から出られない∴入口から届く所だけを始点にする。
	// 一度でも鐘を鳴らせば null には戻らない（この部屋は笛の resetStones を持たない＝PLAN キュー34 5室目）。
	const fromEntrance = new Set();
	{
		const q = [[H - 1, tiles[H - 1].findIndex((t, c) => walk(H - 1, c, null))]];
		while (q.length) {
			const [y, x] = q.shift();
			if (fromEntrance.has(`${y},${x}`)) continue;
			fromEntrance.add(`${y},${x}`);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (walk(y + dr, x + dc, null)) q.push([y + dr, x + dc]);
		}
	}
	for (const color of [null, 'red', 'blue']) {
		for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
			if (!walk(r, c, color)) continue;
			if (color === null && !fromEntrance.has(`${r},${c}`)) continue;
			const seen = new Set([`${r},${c},${color}`]);
			const q = [[r, c, color]];
			let ok = false;
			while (q.length && !ok) {
				const [y, x, col] = q.shift();
				if (goal(y, x)) { ok = true; break; }
				const next = [];
				for (const [dr, dc] of D) {
					if (walk(y + dr, x + dc, col)) next.push([y + dr, x + dc, col]);
					const t = tiles[y + dr]?.[x + dc];
					if (t === TILE.SWITCH_RED) next.push([y, x, 'red']);    // 隣の鐘を剣で叩く
					if (t === TILE.SWITCH_BLUE) next.push([y, x, 'blue']);
				}
				if (tiles[y][x] === TILE.SWITCH_RED) next.push([y, x, 'red']);   // 鐘の上に立って足元を…は叩けないが、隣へ1歩で同じ
				if (tiles[y][x] === TILE.SWITCH_BLUE) next.push([y, x, 'blue']);
				for (const n of next) {
					if (!walk(n[0], n[1], n[2])) continue;   // 色が変わって門の中に居る＝その状態は取らない
					const k = n.join(',');
					if (!seen.has(k)) { seen.add(k); q.push(n); }
				}
			}
			if (!ok) stuck.push(`${r},${c}:${color}`);
		}
	}
	return stuck;
}

test.describe('D8 二色の鐘の間（dungeon_8 3,0）', () => {
	const sd = map.layers[P.layer].stages[P.stage];

	test('壺が2つ・どこに居ても矢0本で壺か出口に届く（壺を外すと届かない所が出る＝対照）', () => {
		for (const [r, c] of P.pots) expect(sd.tiles[r][c]).toBe(TILE.ARROW_POT);
		expect(escapeCheck(sd), '矢0本で閉じ込められる場所がある').toEqual([]);
		const without = structuredClone(sd);
		for (const [r, c] of P.pots) without.tiles[r][c] = '.';
		expect(escapeCheck(without).length, '壺が無くても全部届く＝この検査に歯が無い').toBeGreaterThan(0);
	});

	test('実ゲーム＝矢0本で壺が光り、叩くと矢が5本・矢があると光らず増えない', async ({ page }) => {
		const [r, c] = P.pots[1];   // 右上の区画の壺 (1,10)＝南 (2,10) に立って上を向く
		await page.goto(`${GAME_URL}?fromEditor=1&layer=${P.layer}&stage=${P.stage}&row=${r + 1}&col=${c}&ps_weapon=1&ps_bow=1&ps_arrows=0`);
		await waitForBoard(page);
		const cellSel = `#board .cell[data-row="${r}"][data-col="${c}"]`;
		await expect(page.locator(cellSel)).toHaveClass(/arrow-pot-ready/);
		const count = () => page.evaluate(() => window.__game.getPlayer().subItems.bow.count);
		expect(await count()).toBe(0);
		await page.evaluate(() => { window.__game.setHeroDir('up'); window.__game.swordAttack(); });
		// 剣を振って叩く（2026-11-15 ユーザー指定「ちゃんと攻撃できるように」）→ 矢が飛び出して届く演出
		expect(await page.evaluate(() => (window.__game.getPlayer()._atkUntil ?? 0) > 0), '剣を振っていない').toBe(true);
		await page.waitForFunction(() => document.querySelectorAll('.arrow-pot-flyer').length > 0, null, { timeout: 1000 });
		expect(await count(), '矢が届く前に本数が増えた').toBe(0);
		await expect.poll(count).toBe(ARROW_POT_REFILL);
		expect(await page.evaluate(() => document.querySelectorAll('.arrow-pot-flyer').length), '飛んだ矢が残っている').toBe(0);
		await expect(page.locator('#msg-bar')).toContainText('壺から矢が湧いた');
		await expect(page.locator(cellSel), '矢があるのに光っている').not.toHaveClass(/arrow-pot-ready/);
		await page.waitForTimeout(300);
		await page.evaluate(() => window.__game.swordAttack());
		await page.waitForTimeout(300);
		expect(await count(), '矢があるのに増えた').toBe(ARROW_POT_REFILL);
	});

	test('実ゲーム＝撃って0本になった瞬間に光る・壺には乗れない', async ({ page }) => {
		const [r, c] = P.pots[1];
		await page.goto(`${GAME_URL}?fromEditor=1&layer=${P.layer}&stage=${P.stage}&row=${r + 1}&col=${c}&ps_weapon=1&ps_bow=1&ps_arrows=1`);
		await waitForBoard(page);
		const cellSel = `#board .cell[data-row="${r}"][data-col="${c}"]`;
		await expect(page.locator(cellSel)).not.toHaveClass(/arrow-pot-ready/);
		await page.evaluate(() => { window.__game.setHeroDir('down'); });
		await page.evaluate(() => window.__game.useSubItem?.());
		await expect.poll(() => page.evaluate(() => window.__game.getPlayer().subItems.bow.count)).toBe(0);
		await expect(page.locator(cellSel)).toHaveClass(/arrow-pot-ready/);
		// 上へ歩いても壺のセルには入らない
		await page.evaluate(() => window.__game.setHeroDir('up'));
		for (let i = 0; i < 6; i++) await page.evaluate(() => window.__game.movePlayer('up'));
		const pos = await page.evaluate(() => { const p = window.__game.getPlayer(); return Math.round(p.y); });
		expect(pos, '壺に乗れた').toBe(r + 1);
	});
});
