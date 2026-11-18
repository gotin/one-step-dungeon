// tests/dark-tower-5f-curse-fire-landing.spec.js
// dark_tower 5F の踊り場 `5,0`＝呪い火の踊り場（戦闘の部屋）の番人。
//
// 経緯：キュー111（2026-11-18・`scripts/migrate-dark-tower-111-5f-landing.mjs`）。直す前は階段だけの空室（脅威度 0）で、
// 着地 (6,4) から南の口（→ 5,1）まで歩けば抜けられた。ユーザー指摘「塔の残りは戦闘の部屋を主体に」と難しさの基準
// （DECISIONS 2026-11-17・ボスに近いほど難しくてよい）を受けて、呪い火 ψ×4（触れると剣を封じる）と
// 盾騎士 ζ・剣獣 μ・爆弾鬼 λ・骸骨剣士 θ を置き、南の口の手前を鍵の扉で閉じた（鍵は全滅で出る）。
//
// 守るもの：
// ① 盤面・敵の組み合わせ・向き・鍵の条件・出入口・脅威度
// ② 通り道（鍵なしでは南の口へ届かない・鍵と矢束と爆弾には届く）と着地の安全
// ③ 実機：鍵なしでは扉を抜けられない
// ④ 実機：全滅させると鍵が出て、扉を開けて 5,1 へ抜けられる
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { walkable, clearLine } from '../scripts/migrate-dark-tower-111-3f-stairs.mjs';
import {
	AFTER, ENEMIES, DIRS_AFTER, KEY_CELL, DOOR, STAIRS, ARROWS, BOMBS, SOUTH_OUT, THREAT,
} from '../scripts/migrate-dark-tower-111-5f-landing.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dark_tower';
const ROOM = '5,0';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – dark_tower 5F 呪い火の踊り場（キュー111）', () => {
	test('① 盤面・敵の組み合わせ・鍵の条件・出入口・脅威度', () => {
		const g = rowsOf(st);
		expect(g, '5,0 の盤面').toEqual(AFTER);
		const es = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}${ch}`] : [])));
		expect(es, 'ψ×4・ζ・μ・λ・θ').toEqual(ENEMIES);
		expect(st.enemyDirs, '向き（ψ は向きを持たない）').toEqual(DIRS_AFTER);
		expect(st.showConditions, '鍵は全滅で出る').toEqual({ [KEY_CELL]: { trigger: 'killAll' } });
		expect(st.mapEnters, '出入口は 4F からの階段だけ').toEqual({ [STAIRS]: { id: 'throneEntrance', destId: '4fStairsUp' } });
		expect(g[8], '南の口の手前は扉 (8,5) だけ').toBe('#####D######');
		expect(ENEMY_META['ψ'].inflict?.type, '前提：呪い火は剣を封じる').toBe('sealSword');
		const t = stageThreat(st, ENEMY_META);
		expect(t, '脅威度').toBe(THREAT);
		expect(t, '1室の上限').toBeLessThanOrEqual(162);
	});

	test('② 通り道と着地の安全', () => {
		const g = rowsOf(st);
		const closed = walkable(g, [STAIRS]);
		expect([KEY_CELL, ARROWS, BOMBS].every((k) => closed.has(k)), '鍵のセル・矢束・爆弾へ歩いて行ける').toBe(true);
		expect(SOUTH_OUT.some((k) => closed.has(k)), '鍵なしで南の口に届く（戦いが飾り）').toBe(false);
		expect(SOUTH_OUT.every((k) => walkable(g, [STAIRS], { open: true }).has(k)), '扉を開くと南の口に届く').toBe(true);
		const noDoor = g.map((r, i) => (i === 8 ? r.replace('D', '.') : r));
		expect(walkable(noDoor, [STAIRS]).has(SOUTH_OUT[0]), '対照：扉を外すと届く').toBe(true);
		for (const land of [STAIRS, ...SOUTH_OUT, DOOR]) {
			for (const e of ENEMIES) {
				const pos = e.slice(0, -1);
				const [r, c] = pos.split(',').map(Number), [lr, lc] = land.split(',').map(Number);
				expect(Math.max(Math.abs(r - lr), Math.abs(c - lc)), `着地 ${land} と ${e} が近い`).toBeGreaterThanOrEqual(3);
				if (e.endsWith('μ')) expect(clearLine(g, pos, land), `着地 ${land} が ${e} のビームの線上`).toBe(false);
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

test.describe('Blade of Lumia – dark_tower 5F 呪い火の踊り場は実機で抜けられる（キュー111）', () => {
	test('③ 鍵なしでは扉を抜けられない', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(6, 5));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate(() => {
			const g = window.__game;
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'bomb');
			g.step(2);
			const left = g.getEnemies().length;
			for (let i = 0; i < 10; i++) { g.movePlayer('down'); g.step(1); }
			return { left, y: g.getPlayer().y, stage: g.getState().stageKey, keys: g.getPlayer().keys };
		});
		expect(res.left, '前提：全滅').toBe(0);
		expect(res.keys ?? 0, '前提：鍵を持っていない').toBe(0);
		expect(res.stage, '扉を抜けて 5,1 へ出てしまった').toBe(ROOM);
		expect(res.y, '扉 (8,5) を抜けた').toBeLessThanOrEqual(7);
		await page.keyboard.press('g');
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 10; i++) { g.movePlayer('down'); g.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '5,1', null, { timeout: 5000 });
	});

	test('④ 全滅させると鍵が出て、扉を開けて 5,1 へ', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		await page.goto(previewUrl(5, 5));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate((keyCell) => {
			const g = window.__game;
			const walk = (dir, tiles) => { for (let i = 0; i < tiles * 2; i++) { g.movePlayer(dir); g.step(1); } };
			const out = { types: g.getEnemies().map((e) => e.type).sort() };
			out.keyBefore = g.getStageState().conditionsMet.includes(keyCell);
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'bomb');
			g.step(2);
			out.left = g.getEnemies().length;
			out.keyAfter = g.getStageState().conditionsMet.includes(keyCell);
			walk('right', 2);                       // (5,5) → 鍵 (5,7)
			out.keys = g.getPlayer().keys;
			walk('left', 2); walk('down', 5);       // (5,5) → 扉 (8,5) → 南の口 (9,5) → 5,1
			return out;
		}, KEY_CELL);
		expect(res.types, '敵の種類').toEqual(['ψ', 'ψ', 'ψ', 'ψ', 'ζ', 'μ', 'λ', 'θ'].sort());
		expect(res.keyBefore, '最初から鍵が出ている').toBe(false);
		expect(res.left, '前提：全滅').toBe(0);
		expect(res.keyAfter, '全滅しても鍵が出ない').toBe(true);
		expect(res.keys, '鍵を拾えていない').toBe(1);
		await page.waitForFunction(() => window.__game.getState().stageKey === '5,1', null, { timeout: 5000 });
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
