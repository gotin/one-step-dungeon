// tests/dark-tower-3f-ladder-gate.spec.js
// dark_tower 3F の関門 `3,1` の番人。
//
// 経緯：
//   ・キュー20b ④（2026-09-22）＝row6 の穴の一本帯をはしごで渡るだけの関門にした（それまでは橋 v が1枚残っていて
//     はしご無しで素通しだった）。
//   ・キュー111（2026-11-17・`scripts/migrate-dark-tower-111-3f-gate.mjs`）＝「最後のダンジョンなのに簡単」を受けて
//     **はしごと石の関門**（パズルの部屋・敵なし）に作り直した。南の門 T (8,5)(8,6) は踏み板 S (4,1)(7,2) の両方に
//     石が乗ると開く。2つ目の石を北へ押し上げる立ち位置 (7,4) へは、穴 (7,5) をはしごで渡って入る。
//
// 守るもの：
// ① 盤面・敵なし・橋なし・刻み文なし・境界の開き
// ② ソルバー：解ける／抜け出せなくなる状態 0／詰む状態がある／最少の押し 15／はしご・押し・穴 (7,5) のどれを欠いても解けない
// ③ 実機：はしご無しでは row3 の穴の帯を渡れない
// ④ 実機：ソルバーの解をそのままなぞると、石がロックして門が開き、南の口から 3,2 へ抜けられる
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import {
	AFTER, MIN_PUSHES, LADDER_KEY_PIT, measureGate, bestSolution, wallAt,
} from '../scripts/migrate-dark-tower-111-3f-gate.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dark_tower';
const GATE_ROOM = '3,1';
const st = map.layers[LAYER].stages[GATE_ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – dark_tower 3F はしごと石の関門（キュー111）', () => {
	test('① 盤面・敵なし・橋なし・刻み文なし・境界の開き', () => {
		const g = rowsOf(st);
		expect(g, '3,1 の盤面').toEqual(AFTER);
		const cells = (pred) => g.flatMap((row, r) => [...row].flatMap((ch, c) => (pred(ch) ? [`${r},${c}`] : [])));
		expect(cells((ch) => !!ENEMY_META[ch]), 'パズルの部屋に敵を置かない').toEqual([]);
		expect(cells((ch) => ch === TILE.BRIDGE), '橋は1枚も無い（はしご無しの抜け道の再発防止）').toEqual([]);
		expect(cells((ch) => ch === TILE.SIGN), '刻み文は置かない（キュー20c）').toEqual([]);
		expect(Object.keys(st.signData ?? {}), 'signData も空').toEqual([]);
		expect(cells((ch) => ch === TILE.BUTTON), '踏み板').toEqual(['4,1', '7,2']);
		expect(cells((ch) => ch === TILE.STONE), '石').toEqual(['6,6', '6,9']);
		expect(cells((ch) => ch === TILE.GATE), '南の門').toEqual(['8,5', '8,6']);
		expect([g[0], g[9]], '北と南の口 (5,6) はそのまま').toEqual(['#####..#####', '#####..#####']);
		expect(g.every((r) => r[0] === '#' && r[11] === '#'), '東西の境界は壁').toBe(true);
	});

	test('② ソルバー：解ける・詰む手がある・どれか1つ欠くと解けない', () => {
		const m = measureGate(AFTER);
		expect(m.L, '南の口へ届く').not.toBeNull();
		expect(m.noEscape, '抜け出せなくなる状態は無い').toBe(0);
		expect(m.deadlocks, '押す順を間違えると詰む状態がある').toBeGreaterThan(0);
		expect(bestSolution(AFTER).pushes, '最少の押し').toBe(MIN_PUSHES);
		expect(measureGate(AFTER, { hasLadder: false }).L, 'はしご無しで抜けられた').toBeNull();
		expect(measureGate(AFTER, { noPush: true }).L, '石を押さずに抜けられた').toBeNull();
		expect(measureGate(wallAt(AFTER, LADDER_KEY_PIT)).L, `穴 ${LADDER_KEY_PIT} を壁にしても抜けられた（石の裏へ回る手が飾り）`).toBeNull();
		expect(measureGate(wallAt(AFTER, '1,9')).L, '対照の空振り検査：無関係な床を潰したら解けなくなった').not.toBeNull();
	});
});

// ── 実機（fromEditor=1 プレビュー）──────────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: GATE_ROOM, row: String(row), col: String(col), ...extra });
	return `${GAME}?${p.toString()}`;
}
const at = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return `${p.y},${p.x}`;
});

test.describe('Blade of Lumia – dark_tower 3F の関門は実機で解ける（キュー111）', () => {
	test('③ はしご無しでは row3 の穴の帯を渡れない', async ({ page }) => {
		await page.goto(previewUrl(2, 5));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getPlayer().hasLadder), 'はしごを持たない前提').toBeFalsy();
		await page.evaluate(() => { for (let i = 0; i < 6; i++) { window.__game.movePlayer('down'); window.__game.step(1); } });
		const r = await page.evaluate(() => window.__game.getPlayer().y);
		expect(r, 'はしご無しで穴の帯を渡ってしまった').toBeLessThanOrEqual(2);
	});

	test('④ ソルバーの解をなぞると石がロックし、門を抜けて 3,2 へ', async ({ page }) => {
		test.setTimeout(90_000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		const { cells } = bestSolution(AFTER);
		await page.goto(previewUrl(...cells[0].split(',').map(Number), { ps_ladder: '1' }));
		await waitForBoard(page);
		await page.evaluate(() => window.__game.pause?.());
		expect(await page.evaluate(() => window.__game.getPlayer().hasLadder), 'はしごを持てていない').toBeTruthy();

		let pushes = 0;
		for (let i = 1; i < cells.length; i++) {
			const [r0, c0] = cells[i - 1].split(',').map(Number);
			const [r1, c1] = cells[i].split(',').map(Number);
			if (r0 === r1 && c0 === c1) continue;
			const dir = r1 < r0 ? 'up' : r1 > r0 ? 'down' : c1 < c0 ? 'left' : 'right';
			const before = await page.evaluate(() => JSON.stringify(window.__game.getStageState().stonePositions ?? {}));
			// 1マス＝movePlayer 2回（[[blade-moveplayer-is-half-tile]]）。石押しは1回で1マス進む＝到達したら止める。
			for (let k = 0; k < 4 && (await at(page)) !== cells[i]; k++) {
				await page.evaluate((d) => { window.__game.setHeroDir(d); window.__game.movePlayer(d); window.__game.step(1); }, dir);
			}
			const after = await page.evaluate(() => JSON.stringify(window.__game.getStageState().stonePositions ?? {}));
			if (before !== after) { pushes++; await page.waitForTimeout(700); }   // 石押しの冷却時間（実時間 600ms）
			if (cells[i] === '9,5' || cells[i] === '9,6') break;
			expect(await at(page), `手 ${i}：${cells[i - 1]} → ${cells[i]}`).toBe(cells[i]);
		}
		expect(pushes, '押した回数').toBe(MIN_PUSHES);
		expect(await page.evaluate(() => window.__game.getStageState().stonesLocked), '両方の踏み板に石＝ロック').toBe(true);
		await page.evaluate(() => { for (let i = 0; i < 6; i++) { window.__game.movePlayer('down'); window.__game.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '3,2', null, { timeout: 5000 });
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
