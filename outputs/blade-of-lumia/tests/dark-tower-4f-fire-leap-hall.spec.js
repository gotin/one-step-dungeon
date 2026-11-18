// tests/dark-tower-4f-fire-leap-hall.spec.js
// dark_tower 4F の階段の部屋 `4,4`＝火と跳躍の間（戦闘の部屋）の番人。
//
// 経緯：キュー111（2026-11-18・`scripts/migrate-dark-tower-111-4f-stairs.mjs`）。直す前は回復薬（大）の宝箱と
// 5F への階段だけの空室（脅威度 0）で、北の口から階段まで歩けば上がれた。ユーザー指摘「塔の残りは戦闘の部屋を主体に」
// と難しさの基準（DECISIONS 2026-11-17）を受けて、階段を全滅で現れる形にし（B1 入口 `0,1` と同じ）、
// 火吐き亀 φ×2・跳躍蜘蛛 β×2・爆弾鬼 λ・ブーメラン鬼 π を置いた。
//
// 守るもの：
// ① 盤面・敵の組み合わせ・向き・階段の条件・出入口・宝箱・脅威度
// ② 着地の安全（北の口と階段）
// ③ 実機：敵が残っているうちは階段に乗っても 5F へ上がれない
// ④ 実機：全滅させると階段が現れ、乗ると 5F（5,0）へ上がる
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { AFTER, ENEMIES, DIRS_AFTER, STAIRS, CHEST, NORTH_IN, THREAT } from '../scripts/migrate-dark-tower-111-4f-stairs.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dark_tower';
const ROOM = '4,4';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – dark_tower 4F 火と跳躍の間（キュー111）', () => {
	test('① 盤面・敵の組み合わせ・階段の条件・出入口・脅威度', () => {
		const g = rowsOf(st);
		expect(g, '4,4 の盤面').toEqual(AFTER);
		const es = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}${ch}`] : [])));
		expect(es, 'π・β×2・φ×2・λ').toEqual(ENEMIES);
		expect(st.enemyDirs, '向き（φ・β は向きを持たない）').toEqual(DIRS_AFTER);
		expect(st.showConditions, '階段は全滅で現れる').toEqual({ [STAIRS]: { trigger: 'killAll' } });
		expect(st.mapEnters, '階段は 5F の入口へ').toEqual({ [STAIRS]: { id: '4fStairsUp', destId: 'throneEntrance' } });
		expect(st.chestContents[CHEST].item, '回復薬（大）の宝箱').toBe('bigHealPotion');
		const t = stageThreat(st, ENEMY_META);
		expect(t, '脅威度').toBe(THREAT);
		expect(t, '1室の上限').toBeLessThanOrEqual(162);
	});

	test('② 着地の安全', () => {
		for (const land of [...NORTH_IN, STAIRS]) {
			for (const e of ENEMIES) {
				const [r, c] = e.slice(0, -1).split(',').map(Number), [lr, lc] = land.split(',').map(Number);
				const d = Math.max(Math.abs(r - lr), Math.abs(c - lc));
				expect(d, `着地 ${land} と ${e} が近い`).toBeGreaterThanOrEqual(e.endsWith('β') && land !== STAIRS ? 4 : 3);
			}
		}
	});
});

// 塔の標準装備（DECISIONS 2026-11-17・キュー21 の dt-start）
const previewUrl = (row, col) => {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_hearts: '15', ps_sword: '2', ps_shield: '2', ps_armor: '0',
	});
	return `/blade-of-lumia/game/?${p}`;
};

test.describe('Blade of Lumia – dark_tower 4F 火と跳躍の間は実機で抜けられる（キュー111）', () => {
	test('③ 敵が残っているうちは階段に乗っても上がれない', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(8, 6));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate((stairs) => {
			const g = window.__game;
			const out = { left: g.getEnemies().length, shown: g.getStageState().conditionsMet.includes(stairs) };
			for (let i = 0; i < 4; i++) { g.movePlayer('left'); g.step(1); }   // (8,6) → 階段 (8,4)
			out.x = g.getPlayer().x;
			out.stage = g.getState().stageKey;
			return out;
		}, STAIRS);
		expect(res.left, '前提：敵がいる').toBe(6);
		expect(res.shown, '最初から階段が出ている').toBe(false);
		expect(res.x, '前提：階段のセルまで歩いた').toBeCloseTo(4, 1);
		expect(res.stage, '敵が残っているのに 5F へ上がれた').toBe(ROOM);
	});

	test('④ 全滅させると階段が現れ、乗ると 5F へ', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		await page.goto(previewUrl(8, 6));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate((stairs) => {
			const g = window.__game;
			const out = { types: g.getEnemies().map((e) => e.type).sort() };
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'bomb');
			g.step(2);
			out.left = g.getEnemies().length;
			out.shown = g.getStageState().conditionsMet.includes(stairs);
			for (let i = 0; i < 4; i++) { g.movePlayer('left'); g.step(1); }
			return out;
		}, STAIRS);
		expect(res.types, '敵の種類').toEqual(['π', 'β', 'β', 'φ', 'φ', 'λ'].sort());
		expect(res.left, '前提：全滅').toBe(0);
		expect(res.shown, '全滅しても階段が出ない').toBe(true);
		await page.waitForFunction(() => window.__game.getState().stageKey === '5,0', null, { timeout: 5000 });
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
