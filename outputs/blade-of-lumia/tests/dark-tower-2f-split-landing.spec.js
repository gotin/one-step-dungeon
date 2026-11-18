// tests/dark-tower-2f-split-landing.spec.js
// dark_tower 2F の踊り場 `2,0`＝分裂の踊り場（戦闘の部屋）の番人。
//
// 経緯：キュー111（2026-11-17・`scripts/migrate-dark-tower-111-2f-landing.mjs`）。直す前は分裂スライム δ が
// 1体だけの素の箱で、着地 (6,4) から南の口（→ 2,1）まで素通りできた。ユーザー指摘「塔の残りは戦闘の部屋を主体に」
// と難しさの基準（B1 `0,1` を標準装備で「まあまあ」・DECISIONS 2026-11-17）を受けて、
// δ×4（北東に2×2）・ブーメラン鬼 π×2・剣獣 μ を置き、南の口の手前を鍵の扉で閉じた（鍵は全滅で出る）。
//
// 守るもの：
// ① 盤面・敵の組み合わせ・向き・鍵の条件・出入口・脅威度
// ② 通り道（鍵なしでは南の口へ届かない・鍵と爆弾には届く）と着地の安全
// ③ 実機：鍵なしでは扉を抜けられない
// ④ 実機：全滅させると鍵が出て、扉を開けて 2,1 へ抜けられる
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { walkable, clearLine } from '../scripts/migrate-dark-tower-111-3f-stairs.mjs';
import {
	AFTER, ENEMIES, DIRS_AFTER, KEY_CELL, DOOR, STAIRS, PILE, SOUTH_OUT, THREAT,
} from '../scripts/migrate-dark-tower-111-2f-landing.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dark_tower';
const ROOM = '2,0';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – dark_tower 2F 分裂の踊り場（キュー111）', () => {
	test('① 盤面・敵の組み合わせ・鍵の条件・出入口・脅威度', () => {
		const g = rowsOf(st);
		expect(g, '2,0 の盤面').toEqual(AFTER);
		const es = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}${ch}`] : [])));
		expect(es, 'δ×4・π×2・μ').toEqual(ENEMIES);
		expect(st.enemyDirs, '向き（δ は向きを持たない）').toEqual(DIRS_AFTER);
		expect(st.showConditions, '鍵は全滅で出る').toEqual({ [KEY_CELL]: { trigger: 'killAll' } });
		expect(st.mapEnters, '出入口は 1F からの階段だけ').toEqual({ [STAIRS]: { id: '2fEntrance', destId: '1fStairsUp' } });
		expect(g[8], '南の口の手前は扉 (8,5) だけ').toBe('#####D######');
		expect(g[7][1], '爆弾').toBe('5');
		const t = stageThreat(st, ENEMY_META);
		expect(t, '脅威度').toBe(THREAT);
		expect(t, '1室の上限').toBeLessThanOrEqual(162);
	});

	test('② 通り道と着地の安全', () => {
		const g = rowsOf(st);
		const closed = walkable(g, [STAIRS]);
		expect(closed.has(KEY_CELL) && closed.has(PILE), '鍵のセルと爆弾へ歩いて行ける').toBe(true);
		expect(SOUTH_OUT.some((k) => closed.has(k)), '鍵なしで南の口に届く（戦いが飾り）').toBe(false);
		expect(SOUTH_OUT.every((k) => walkable(g, [STAIRS], { open: true }).has(k)), '扉を開くと南の口に届く').toBe(true);
		// 対照：扉を床にすると鍵なしで届く＝扉だけが南の口を守っている
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
		ps_hearts: '15', ps_sword: '2', ps_shield: '2', ps_armor: '0', ps_bomb: '1',
	});
	return `/blade-of-lumia/game/?${p}`;
};

test.describe('Blade of Lumia – dark_tower 2F 分裂の踊り場は実機で抜けられる（キュー111）', () => {
	test('③ 鍵なしでは扉を抜けられない', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(5, 5));
		await waitForBoard(page);
		// ⚠️ プレビューはデバッグモード（無敵・扉すり抜け）で始まる＝G で切る（game/input.js）
		await page.keyboard.press('g');
		const res = await page.evaluate(() => {
			const g = window.__game;
			// 敵に押されて動くのを除く。爆弾で倒す＝δ が分かれない（剣だと小型が残る）
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'bomb');
			g.step(2);
			const left = g.getEnemies().length;
			for (let i = 0; i < 10; i++) { g.movePlayer('down'); g.step(1); }
			return { left, y: g.getPlayer().y, stage: g.getState().stageKey, keys: g.getPlayer().keys };
		});
		expect(res.left, '前提：全滅（小型が残っていない）').toBe(0);
		expect(res.keys ?? 0, '前提：鍵を持っていない').toBe(0);
		expect(res.stage, '扉を抜けて 2,1 へ出てしまった').toBe(ROOM);
		expect(res.y, '扉 (8,5) を抜けた').toBeLessThanOrEqual(7);
		// 対照：デバッグに戻すと扉をすり抜けて 2,1 へ出る＝上の「止まった」は扉のせい
		await page.keyboard.press('g');
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 10; i++) { g.movePlayer('down'); g.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '2,1', null, { timeout: 5000 });
	});

	test('④ 全滅させると鍵が出て、扉を開けて 2,1 へ', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		await page.goto(previewUrl(5, 4));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate((keyCell) => {
			const g = window.__game;
			const walk = (dir, tiles) => { for (let i = 0; i < tiles * 2; i++) { g.movePlayer(dir); g.step(1); } };
			const out = {};
			out.types = g.getEnemies().map((e) => e.type).sort();
			out.keyBefore = g.getStageState().conditionsMet.includes(keyCell);
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'bomb');
			g.step(2);
			out.left = g.getEnemies().length;
			out.keyAfter = g.getStageState().conditionsMet.includes(keyCell);
			walk('right', 2);                       // (5,4) → 鍵 (5,6)
			out.keys = g.getPlayer().keys;
			walk('left', 1); walk('down', 5);       // (5,5) → 扉 (8,5) → 南の口 (9,5) → 2,1
			return out;
		}, KEY_CELL);
		expect(res.types, '敵の種類').toEqual(['δ', 'δ', 'δ', 'δ', 'π', 'π', 'μ'].sort());
		expect(res.keyBefore, '最初から鍵が出ている').toBe(false);
		expect(res.left, '前提：全滅').toBe(0);
		expect(res.keyAfter, '全滅しても鍵が出ない').toBe(true);
		expect(res.keys, '鍵を拾えていない').toBe(1);
		await page.waitForFunction(() => window.__game.getState().stageKey === '2,1', null, { timeout: 5000 });
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
