// tests/d8-island-turrets.spec.js
// dungeon_8 `2,3`＝小島の砲台（戦闘の部屋）の番人。
//
// 経緯：キュー112（2026-11-19・`scripts/migrate-d8-2-3-island-turrets.mjs`）。直す前は E×2・C（32）の素の広間。
// ユーザー判断「D8 の残りはパズルと戦闘を半々」を受けて、南の両隅に幅1の水で囲った小島を置き、
// 島に遠くから攻める敵（ブーメラン鬼・爆弾鬼）、陸に近くで斬る敵（骸骨剣士・毒沼ヒル）を置いた。
// はしごで島へ渡れば陸の敵は水の縁で止まる。全滅で北の宝箱（ルピー×50）。
//
// 守るもの：
// ① 盤面・水・敵の組み合わせ・向き・宝箱の条件・脅威度
// ② 実機：はしご無しでは島へ渡れない（対照）・はしごなら渡れる
// ③ 実機：島へ渡ると、陸の敵は水を越えて来ない・島の砲台は島から出ない
// ④ 実機：全滅させると宝箱が出て、ルピー×50 を拾える
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import {
	AFTER, WATER, ENEMIES, DIRS_AFTER, CHEST, WEST_ISLAND, EAST_ISLAND, LANDINGS, THREAT, reach,
} from '../scripts/migrate-d8-2-3-island-turrets.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dungeon_8';
const ROOM = '2,3';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – D8 小島の砲台（キュー112）', () => {
	test('① 盤面・水・敵・宝箱の条件・脅威度', () => {
		const g = rowsOf(st);
		expect(g, '2,3 の盤面').toEqual(AFTER);
		expect(Object.keys(st.bgTiles).sort(), '水（bgTiles）').toEqual([...WATER].sort());
		const es = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}${ch}`] : [])));
		expect(es, 'Γ×2・θ×2・π・λ').toEqual(ENEMIES);
		expect(st.enemyDirs, '向き').toEqual(DIRS_AFTER);
		expect(st.showConditions, '宝箱は全滅で出る').toEqual({ [CHEST]: { trigger: 'killAll' } });
		expect(st.chestContents[CHEST], '中身').toEqual({ type: 'rupee', value: 50, name: 'ルピー×50' });
		expect(stageThreat(st, ENEMY_META), '脅威度').toBe(THREAT);
		const water = new Set(WATER);
		const foot = reach(g, water, LANDINGS);
		expect([...WEST_ISLAND, ...EAST_ISLAND].some((k) => foot.has(k)), '歩きで島へ入れる').toBe(false);
		const ladder = reach(g, water, LANDINGS, { ladder: true });
		expect([...WEST_ISLAND, ...EAST_ISLAND].every((k) => ladder.has(k)), 'はしごで島へ渡れる').toBe(true);
	});
});

const previewUrl = (row, col, extra = {}) => {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_hearts: '15', ps_sword: '2', ps_shield: '2', ps_armor: '0', ...extra,
	});
	return `/blade-of-lumia/game/?${p}`;
};
const walk = (dir, half) => { const g = window.__game; for (let i = 0; i < half; i++) { g.movePlayer(dir); g.step(1); } return g.getPlayer().x; };

test.describe('Blade of Lumia – D8 小島の砲台は実機で遊べる（キュー112）', () => {
	test('② はしご無しでは島へ渡れない・はしごなら渡れる', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(7, 5, { ps_ladder: '0' }));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const xNo = await page.evaluate(`(${walk})('left', 6)`);
		expect(xNo, '対照：はしご無しで水 (7,4) に入った').toBeGreaterThan(4.5);
		await page.goto(previewUrl(7, 5, { ps_ladder: '1' }));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const xYes = await page.evaluate(`(${walk})('left', 6)`);
		expect(xYes, 'はしごで西の島 (7,3) へ渡れない').toBeLessThanOrEqual(3.01);
	});

	test('③ 島へ渡ると陸の敵は水を越えて来ない・砲台は島から出ない', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(7, 5, { ps_ladder: '1' }));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate(`(() => {
			const g = window.__game;
			(${walk})('left', 6);                   // (7,5) → 西の島 (7,3)
			const west = new Set(${JSON.stringify(WEST_ISLAND)}), east = new Set(${JSON.stringify(EAST_ISLAND)});
			const water = new Set(${JSON.stringify(WATER)});
			const bad = [];
			for (let t = 0; t < 400; t++) {
				g.step(1);
				for (const e of g.getEnemies()) {
					const k = Math.round(e.r ?? e.y) + ',' + Math.round(e.c ?? e.x);
					const turret = e.type === 'π' || e.type === 'λ';
					if (water.has(k)) bad.push(t + ':' + e.type + '@' + k + '（水）');
					else if (!turret && (west.has(k) || east.has(k))) bad.push(t + ':' + e.type + '@' + k + '（陸の敵が島）');
					else if (turret && !west.has(k) && !east.has(k)) bad.push(t + ':' + e.type + '@' + k + '（砲台が島の外）');
				}
			}
			return { bad: bad.slice(0, 5), types: g.getEnemies().map((e) => e.type).sort().join(''), x: g.getPlayer().x };
		})()`);
		expect(res.x, '前提：島に居る').toBeLessThanOrEqual(3.01);
		expect(res.bad, res.bad.join(' / ')).toEqual([]);
	});

	test('④ 全滅させると宝箱が出て、ルピー×50 を拾える', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		await page.goto(previewUrl(4, 5));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate((chest) => {
			const g = window.__game;
			const out = { types: g.getEnemies().map((e) => e.type).sort() };
			out.before = g.getStageState().conditionsMet.includes(chest);
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'bomb');
			g.step(2);
			out.left = g.getEnemies().length;
			out.after = g.getStageState().conditionsMet.includes(chest);
			out.rupees0 = g.getPlayer().rupees;
			for (let i = 0; i < 4; i++) { g.movePlayer('up'); g.step(1); }
			g.step(5);
			out.rupees1 = g.getPlayer().rupees;
			return out;
		}, CHEST);
		expect(res.types, '敵の種類').toEqual(['Γ', 'Γ', 'θ', 'θ', 'π', 'λ'].sort());
		expect(res.before, '最初から宝箱が出ている').toBe(false);
		expect(res.left, '前提：全滅').toBe(0);
		expect(res.after, '全滅しても宝箱が出ない').toBe(true);
		expect(res.rupees1 - res.rupees0, 'ルピー×50 を拾えていない').toBe(50);
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
