// tests/dark-tower-1f-stairs-sentry.spec.js
// 暗黒の塔 1F の階段の部屋 `1,3`＝穴の島の番兵（実行キュー111・2026-11-16・
// `scripts/migrate-dark-tower-111-1f-stairs.mjs` が書いた）。
//
// 直す前は E×2 と階段だけの素の箱。新しい姿＝幅2の穴の環の中の島にセンチネル F を1体。
// 守るもの：
// ① 盤面・境界・階段・宝箱（killAll で大ルピー×50）
// ② 島へは歩いて行けず、穴の環は幅2（はしごで渡れない）＝剣は届かない／本道は西側で通れる
// ③ 実機：F は島から出ない・横に並ぶと槍を投げてくる・矢で倒すと宝箱が出る

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TICK_MS } from '../game/constants.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dark_tower';
const KEY = '1,3';
const CHEST = '1,10';
const ISLAND = ['4,8', '4,9', '5,8', '5,9'];
const ROWS = [
	'#####;;#####',
	'#.........B#',
	'#.....xxxxx#',
	'#.....xxxxx#',
	'#.....xxF.x#',
	'#.....xx..x#',
	'#.....xxxxx#',
	'#.....xxxxx#',
	'#...>......#',
	'#####..#####',
];

const st = map.layers[LAYER].stages[KEY];
const grid = () => st.tiles.map((r) => (Array.isArray(r) ? r.slice() : [...r]));

function reachFrom(g, sr, sc, { ladder = false } = {}) {
	// 歩行の到達（穴は渡れない）。ladder＝穴1枚を跨いで向こうの床へ渡れる（はしご）。
	const walk = (ch) => ch !== undefined && ch !== '#' && ch !== 'x' && ch !== 'B';
	const seen = new Set([`${sr},${sc}`]);
	const q = [[sr, sc]];
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const steps = [[r + dr, c + dc]];
			if (ladder && g[r + dr]?.[c + dc] === 'x') steps.push([r + 2 * dr, c + 2 * dc]);
			for (const [nr, nc] of steps) {
				const ch = g[nr]?.[nc];
				if (!walk(ch) && !ENEMY_META[ch]) continue;
				if (seen.has(`${nr},${nc}`)) continue;
				seen.add(`${nr},${nc}`); q.push([nr, nc]);
			}
		}
	}
	return seen;
}

test.describe('Blade of Lumia – dark_tower 1,3 穴の島の番兵（キュー111）', () => {

	test('① 盤面・境界・階段・宝箱', () => {
		const g = grid();
		expect(g.map((r) => r.join('')), `${KEY} の盤面`).toEqual(ROWS);
		expect(st.mapEnters?.['8,4']?.id, '階段（1fStairsUp）はそのまま').toBe('1fStairsUp');
		expect(st.chestContents?.[CHEST], '宝箱の中身').toEqual({ type: 'rupee', value: 50, name: '大ルピー×50' });
		expect(st.showConditions?.[CHEST], '宝箱は全滅で出る').toEqual({ trigger: 'killAll' });
		expect(Object.keys(st.enemyDirs ?? {}), 'F は向きを持たない').toEqual([]);
		expect(ENEMY_META.F.attack.type, '前提：F は槍を投げる').toBe('spear');
	});

	test('② 島へは歩いてもはしごでも行けない・本道は通れる', () => {
		const g = grid();
		const walk = reachFrom(g, 0, 5);
		for (const k of ['8,4', '9,5', '9,6', '1,9']) expect(walk.has(k), `北の口から ${k} へ歩ける`).toBe(true);
		const withLadder = reachFrom(g, 0, 5, { ladder: true });
		for (const k of ISLAND) expect(withLadder.has(k), `島 ${k} へはしごで渡れてしまう（穴の環が幅1）`).toBe(false);
		// 北の口の2マスは島と同じ行/列に無い
		for (const k of ISLAND) {
			const [r, c] = k.split(',').map(Number);
			expect(r === 0 || c === 5 || c === 6, `北の口と島 ${k} が同じ行/列`).toBe(false);
		}
	});

	test('③ 実機：F は島から出ず、横に並ぶと槍を投げ、矢で倒すと宝箱が出る', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		const p = new URLSearchParams({
			fromEditor: '1', layer: LAYER, stage: KEY, row: '4', col: '5',
			ps_weapon: '1', ps_hearts: '20', ps_shield: '2', ps_bow: '1', ps_arrows: '30',
		});
		await page.goto(`/blade-of-lumia/game/?${p}`);
		await waitForBoard(page);

		const res = await page.evaluate(({ island, tick }) => {
			const g = window.__game;
			const out = { spawned: g.getEnemies().map((e) => `${e.type}@${e.id}`), offIsland: [], spear: false, shots: 0 };
			const onIsland = (e) => island.includes(`${Math.round(e.y)},${Math.round(e.x)}`);
			// 3 秒は何もせず見る＝島から出ないこと・槍が飛んでくること
			for (let i = 0; i < Math.ceil(3000 / tick); i++) {
				g.step(1);
				for (const e of g.getEnemies()) if (!onIsland(e)) out.offIsland.push(`${e.y},${e.x}`);
				if (g.getProjectiles().some((pr) => pr.type === 'spear' && pr.owner === 'enemy')) out.spear = true;
			}
			// F と同じ行に並んで東へ矢を撃つ（倒れるまで・最大 40 発）
			for (let n = 0; n < 40 && g.getEnemies().length; n++) {
				const f = g.getEnemies()[0];
				const want = Math.round(f.y);
				for (let k = 0; k < 6 && Math.round(g.getPlayer().y) !== want; k++) {
					g.movePlayer(g.getPlayer().y < want ? 'down' : 'up'); g.step(1);
				}
				g.setHeroDir('right');
				g.useSubItem(); out.shots++;
				g.step(6);
				for (const e of g.getEnemies()) if (!onIsland(e)) out.offIsland.push(`${e.y},${e.x}`);
			}
			g.step(3);
			out.left = g.getEnemies().length;
			out.met = g.getStageState().conditionsMet;
			return out;
		}, { island: ISLAND, tick: TICK_MS });

		expect(res.spawned, 'F が島に1体').toEqual(['F@4,8']);
		expect(res.offIsland, 'F が島から出た').toEqual([]);
		expect(res.spear, '横に並んでいるのに槍が飛んでこない').toBe(true);
		expect(res.left, `矢 ${res.shots} 発で倒せていない`).toBe(0);
		expect(res.met, '倒したのに宝箱の条件が立たない').toContain(CHEST);
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
