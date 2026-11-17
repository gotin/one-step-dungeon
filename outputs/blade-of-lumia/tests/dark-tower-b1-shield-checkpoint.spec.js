// tests/dark-tower-b1-shield-checkpoint.spec.js
// dark_tower B1 の入口 `0,1`＝盾の関所（戦闘の部屋）の番人。
//
// 経緯：キュー111（2026-11-17・`scripts/migrate-dark-tower-111-b1-entrance.mjs`）。直す前は盾騎士 ζ×2・
// 突進猪 ω・術士 η がいたが、着地 (5,5) から階段 (1,5) まで4マス＝走り抜ければ戦わずに 1F へ上がれた。
// ユーザー指摘「塔の残りは戦闘の部屋を主体に」「爆弾と他の敵の組み合わせだけでも難易度は上がる」を受けて、
// 階段を全滅で現れる隠し入口にし、術士を爆弾鬼に替え、突進を止める1マスの柱を4本置いた。
//
// 守るもの：
// ① 盤面・敵の組み合わせ・向き・階段の出現条件・出入口・脅威度
// ② 着地（島から・1F から・南から）の安全と、戦わずに南の寄り道へ行けること
// ③ 実機：全滅させる前は階段を踏んでも 1F へ上がれない
// ④ 実機：全滅させると階段が現れ、踏むと 1F へ上がる
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { walkable, clearLine } from '../scripts/migrate-dark-tower-111-3f-stairs.mjs';
import {
	AFTER, ENEMIES, DIRS_AFTER, STAIRS, LANDING, SOUTH_OUT, SOUTH_IN,
} from '../scripts/migrate-dark-tower-111-b1-entrance.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dark_tower';
const ROOM = '0,1';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – dark_tower B1 盾の関所（キュー111）', () => {
	test('① 盤面・敵の組み合わせ・階段の出現条件・出入口・脅威度', () => {
		const g = rowsOf(st);
		expect(g, '0,1 の盤面').toEqual(AFTER);
		const es = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}${ch}`] : [])));
		expect(es, '盾騎士×2・爆弾鬼・突進猪').toEqual(ENEMIES);
		expect(st.enemyDirs, '向き（盾騎士は下＝着地の方へ盾を向ける）').toEqual(DIRS_AFTER);
		expect(st.showConditions, '階段は全滅で現れる').toEqual({ [STAIRS]: { trigger: 'killAll' } });
		expect(st.mapEnters[STAIRS], '階段の行き先').toEqual({ id: 'b1fStairsUp', destId: '1fEntrance' });
		expect(st.mapEnters[LANDING], '島への出口').toEqual({ id: 'towerEntrance', destId: 'islandToTower' });
		expect(st.chestContents['6,5'].item, '回復薬（大）の宝箱').toBe('bigHealPotion');
		expect(stageThreat(st, ENEMY_META), '脅威度').toBe(144);
	});

	test('② 着地の安全と、戦わずに南の寄り道へ行けること', () => {
		const g = rowsOf(st);
		const reach = walkable(g, [LANDING]);
		expect(SOUTH_OUT.every((k) => reach.has(k)), '着地から南の口へ行ける').toBe(true);
		for (const land of [LANDING, STAIRS, ...SOUTH_IN]) {
			for (const e of ENEMIES) {
				const pos = e.slice(0, -1);
				const [r, c] = pos.split(',').map(Number), [lr, lc] = land.split(',').map(Number);
				expect(Math.max(Math.abs(r - lr), Math.abs(c - lc)), `着地 ${land} と ${e} が近い`).toBeGreaterThanOrEqual(3);
				if (e.endsWith('ω')) expect(clearLine(g, pos, land), `着地 ${land} が ${e} の突進の線上`).toBe(false);
			}
		}
		// 柱は突進の線を切る（row3・row6 は柱で途切れ、row7 は端から端まで開いている）
		expect(clearLine(g, '6,10', '6,1'), 'row6 は柱で切れている').toBe(false);
		expect(clearLine(g, '7,10', '7,1'), '対照：row7 は開いている').toBe(true);
	});
});

const previewUrl = (row, col) => {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '20', ps_shield: '2', ps_armor: '2',
	});
	return `/blade-of-lumia/game/?${p}`;
};

test.describe('Blade of Lumia – dark_tower B1 盾の関所は実機で抜けられる（キュー111）', () => {
	test('③ 全滅させる前は階段を踏んでも上がれない', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(4, 5));
		await waitForBoard(page);
		await page.keyboard.press('g');   // プレビューはデバッグモードで始まる（game/input.js）
		const res = await page.evaluate(() => {
			const g = window.__game;
			// 敵を部屋の隅へ寄せて動きを止める（押されて道を外れるのを除く）。倒しはしない＝全滅の条件は立たない
			for (const e of g.getEnemies()) g.setEnemyFieldForTest(e.id, { stunUntil: Number.MAX_SAFE_INTEGER });
			g.step(1);
			for (let i = 0; i < 6; i++) { g.movePlayer('up'); g.step(1); }
			return { y: g.getPlayer().y, x: g.getPlayer().x, stage: g.getState().stageKey, left: g.getEnemies().length };
		});
		expect(res.left, '前提：敵が残っている').toBe(4);
		expect([res.y, res.x], '前提：階段のセル (1,5) に立った').toEqual([1, 5]);
		expect(res.stage, '全滅前に階段で上がれた（戦いが飾り）').toBe(ROOM);
	});

	test('④ 全滅させると階段が現れ、踏むと 1F へ', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		await page.goto(previewUrl(4, 5));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate((stairs) => {
			const g = window.__game;
			const out = {};
			out.types = g.getEnemies().map((e) => e.type).sort();
			out.before = g.getStageState().conditionsMet.includes(stairs);
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'sword');
			g.step(2);
			out.left = g.getEnemies().length;
			out.after = g.getStageState().conditionsMet.includes(stairs);
			for (let i = 0; i < 6; i++) { g.movePlayer('up'); g.step(1); }
			return out;
		}, STAIRS);
		expect(res.types, '敵の種類').toEqual(['ζ', 'ζ', 'λ', 'ω'].sort());
		expect(res.before, '最初から階段が出ている').toBe(false);
		expect(res.left, '前提：全滅').toBe(0);
		expect(res.after, '全滅しても階段が出ない').toBe(true);
		await page.waitForFunction(() => window.__game.getState().stageKey === '1,0', null, { timeout: 5000 });
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
