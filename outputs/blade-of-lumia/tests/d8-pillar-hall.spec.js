// tests/d8-pillar-hall.spec.js
// dungeon_8 `3,4`＝剣獣の柱の間（戦闘の部屋）の番人。
//
// 経緯：キュー112（2026-11-21・`scripts/migrate-d8-3-4-pillar-hall.mjs`）。直す前は E・C の素の広間。
// 真ん中に1マスの石柱3本（口から3マス以上離した）。剣獣 μ・盾騎士 ζ・跳躍蜘蛛 β。全滅で南東の隅に宝箱（ルピー×100）。
// 2026-11-21 ユーザー指摘「壁のおかげで簡単すぎる。最初から壁に守られている」→ 柱を減らして真ん中へ寄せた。
//
// 守るもの：
// ① 盤面・石柱・敵の組み合わせ・向き・宝箱の条件・脅威度・通り道（三つの口は戦わずに通れる）
// ② 実機：北の口 (1,6) は入った瞬間から飛ぶ剣が来る（柱に守られない）・踏み込んで柱の陰 (3,7) に立つと来ない
// ③ 実機：全滅させると宝箱が出て、ルピー×100 を拾える
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { reach } from '../scripts/migrate-d8-2-3-island-turrets.mjs';
import {
	AFTER, ENEMIES, DIRS_AFTER, CHEST, LANDINGS, PILLARS, THREAT,
} from '../scripts/migrate-d8-3-4-pillar-hall.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dungeon_8';
const ROOM = '3,4';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – D8 剣獣の柱の間（キュー112）', () => {
	test('① 盤面・石柱・敵・宝箱の条件・脅威度・通り道', () => {
		const g = rowsOf(st);
		expect(g, '3,4 の盤面').toEqual(AFTER);
		expect(PILLARS.every((k) => { const [r, c] = k.split(',').map(Number); return g[r][c] === '#'; }), '石柱').toBe(true);
		const es = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}${ch}`] : [])));
		expect(es, 'ζ・β・μ').toEqual(ENEMIES);
		expect(st.enemyDirs, '向き').toEqual(DIRS_AFTER);
		expect(st.showConditions, '宝箱は全滅で出る').toEqual({ [CHEST]: { trigger: 'killAll' } });
		expect(st.chestContents[CHEST], '中身').toEqual({ type: 'rupee', value: 100, name: 'ルピー×100' });
		expect(stageThreat(st, ENEMY_META), '脅威度').toBe(THREAT);
		const foot = reach(g, new Set(), LANDINGS);
		expect(LANDINGS.every((k) => foot.has(k)), '三つの口が戦わずにつながる').toBe(true);
	});
});

const previewUrl = (row, col, extra = {}) => {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_hearts: '13', ps_sword: '0', ps_shield: '1', ps_armor: '0', ...extra,
	});
	return `/blade-of-lumia/game/?${p}`;
};

test.describe('Blade of Lumia – D8 剣獣の柱の間は実機で遊べる（キュー112）', () => {
	test('② 北の口は飛ぶ剣にさらされる・踏み込んで柱の陰に立つと来ない', async ({ page }) => {
		test.setTimeout(60_000);
		await freezeGameLoop(page);
		const shotsFrom = async (row, col) => {
			await page.goto(previewUrl(row, col));
			await waitForBoard(page);
			await page.keyboard.press('g');
			return page.evaluate(async () => {
				const g = window.__game;
				// 剣獣だけを残す（蜘蛛と盾騎士に動かされないように）
				for (const e of g.getEnemies()) if (e.type !== 'μ') g.dealDamage(e.id, 9999, 'bomb');
				g.step(2);
				const seen = new Set();
				for (let i = 0; i < 400; i++) {
					g.step(1);
					if (i % 4 === 0) await new Promise((r) => setTimeout(r, 15));
					for (const p of g.getProjectiles()) if (p.owner !== 'player') seen.add(p.id);
				}
				return seen.size;
			});
		};
		expect(await shotsFrom(1, 6), '北の口 (1,6) に飛ぶ剣が来ない＝入ってすぐ守られている').toBeGreaterThan(0);
		expect(await shotsFrom(3, 7), '柱 (4,7)(7,7) の陰 (3,7) に飛ぶ剣が来た').toBe(0);
	});

	test('③ 全滅させると宝箱が出て、ルピー×100 を拾える', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		await page.goto(previewUrl(7, 10, {}));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate((chest) => {
			const g = window.__game;
			const out = { types: g.getEnemies().map((e) => e.type).sort() };
			out.before = g.getStageState().conditionsMet.includes(chest);
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'bomb');
			g.step(3);
			out.left = g.getEnemies().length;
			out.after = g.getStageState().conditionsMet.includes(chest);
			out.b0 = g.getPlayer().rupees;
			for (let i = 0; i < 2; i++) { g.movePlayer('down'); g.step(1); }   // (7,10) → 宝箱 (8,10)
			g.step(5);
			out.b1 = g.getPlayer().rupees;
			return out;
		}, CHEST);
		expect(res.types, '敵の種類').toEqual(['ζ', 'β', 'μ'].sort());
		expect(res.before, '最初から宝箱が出ている').toBe(false);
		expect(res.left, '前提：全滅').toBe(0);
		expect(res.after, '全滅しても宝箱が出ない').toBe(true);
		expect(res.b1, 'ルピー×100 を拾えていない').toBe(res.b0 + 100);
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
