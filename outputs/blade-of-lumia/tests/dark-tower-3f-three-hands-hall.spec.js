// tests/dark-tower-3f-three-hands-hall.spec.js
// dark_tower 3F の階段の部屋 `3,3`＝三つの手の広間（戦闘の部屋）の番人。
//
// 経緯：キュー111（2026-11-17・`scripts/migrate-dark-tower-111-3f-stairs.mjs`）。直す前は素の広間に
// 剣獣 μ×2 とブーメラン鬼 π＝歩けば階段に乗れた（戦わずに素通りできた）。ユーザー指摘「塔の残りは戦闘の部屋を
// 主体に」「戦闘の部屋は敵の組み合わせで難しく」を受けて、役割の違う3体（剣獣 μ・爆弾鬼 λ・突進猪 ω）を
// 全滅させると鍵が出て、階段を囲む扉が開くようにした。地形は 2×2 の柱4本＝射線を切る隠れ場。
//
// 守るもの：
// ① 盤面・敵の組み合わせ・向き・鍵の出現条件・出入口・脅威度（門番 5,2 を超えない）
// ② 通り道：鍵なしで南の寄り道と鍵のセルへ届き、階段へは届かない／入った瞬間に張り付かれない・撃たれない
// ③ 実機：鍵なしでは扉を抜けられない
// ④ 実機：3体を倒すと鍵が出て、扉を開けて 4F へ上がれる
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import {
	AFTER, ENEMIES, DIRS_AFTER, KEY_CELL, DOOR, STAIRS, NORTH_IN, walkable, clearLine,
} from '../scripts/migrate-dark-tower-111-3f-stairs.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dark_tower';
const ROOM = '3,3';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – dark_tower 3F 三つの手の広間（キュー111）', () => {
	test('① 盤面・敵の組み合わせ・鍵の条件・出入口・脅威度', () => {
		const g = rowsOf(st);
		expect(g, '3,3 の盤面').toEqual(AFTER);
		const es = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}${ch}`] : [])));
		expect(es, '剣獣・爆弾鬼・突進猪を1体ずつ').toEqual(ENEMIES);
		expect(new Set(es.map((e) => e.slice(-1))).size, '3体とも別の種類（組み合わせで難しくする）').toBe(3);
		expect(st.enemyDirs, '向き').toEqual(DIRS_AFTER);
		expect(st.showConditions, '鍵は全滅で出る').toEqual({ [KEY_CELL]: { trigger: 'killAll' } });
		expect(Object.keys(st.mapEnters), '出入口は 4F への階段だけ').toEqual([STAIRS]);
		expect(st.mapEnters[STAIRS], '階段の行き先').toEqual({ id: '3fStairsUp', destId: '4fEntrance' });
		expect([g[0], g[9]], '北と南の口 (5,6) はそのまま').toEqual(['#####..#####', '#####..#####']);
		const t = stageThreat(st, ENEMY_META);
		expect(t, '脅威度').toBe(117);
		expect(t, '4F の門番 5,2 を超えない').toBeLessThanOrEqual(stageThreat(map.layers[LAYER].stages['5,2'], ENEMY_META));
	});

	test('② 通り道と着地の安全', () => {
		const g = rowsOf(st);
		const closed = walkable(g, NORTH_IN);
		expect(closed.has('9,5') && closed.has('9,6'), '鍵なしで南の寄り道へ行ける').toBe(true);
		expect(closed.has(KEY_CELL), '鍵のセルへ歩いて行ける').toBe(true);
		expect(closed.has(STAIRS), '鍵なしで階段に届く（戦いが飾り）').toBe(false);
		expect(walkable(g, NORTH_IN, { open: true }).has(STAIRS), '扉を開くと階段に届く').toBe(true);
		// 対照：扉を床にすると鍵なしで届く＝扉だけが階段を守っている
		const noDoor = g.map((r, i) => (i === 7 ? r.replace('D', '.') : r));
		expect(walkable(noDoor, NORTH_IN).has(STAIRS), '対照：扉を外すと届く').toBe(true);
		for (const land of [...NORTH_IN, STAIRS, DOOR, '6,4']) {
			for (const e of ENEMIES) {
				const pos = e.slice(0, -1);
				const [r, c] = pos.split(',').map(Number), [lr, lc] = land.split(',').map(Number);
				expect(Math.max(Math.abs(r - lr), Math.abs(c - lc)), `着地 ${land} と ${e} が近い`).toBeGreaterThanOrEqual(3);
				if (/[μω]$/.test(e)) expect(clearLine(g, pos, land), `着地 ${land} が ${e} の射線上`).toBe(false);
			}
		}
	});
});

const previewUrl = (row, col) => {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '20', ps_shield: '2', ps_armor: '2',
	});
	return `/blade-of-lumia/game/?${p}`;
};

test.describe('Blade of Lumia – dark_tower 3F 三つの手の広間は実機で抜けられる（キュー111）', () => {
	test('③ 鍵なしでは扉を抜けられない', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(6, 4));
		await waitForBoard(page);
		// ⚠️ プレビューはデバッグモード（無敵・扉すり抜け）で始まる＝G で切る（game/input.js）
		await page.keyboard.press('g');
		const res = await page.evaluate(() => {
			const g = window.__game;
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'sword');   // 敵に押されて動くのを除く
			g.step(2);
			for (let i = 0; i < 8; i++) { g.movePlayer('down'); g.step(1); }
			return { y: g.getPlayer().y, stage: g.getState().stageKey, keys: g.getPlayer().keys };
		});
		expect(res.keys ?? 0, '前提：鍵を持っていない').toBe(0);
		expect(res.stage, '階段に乗ってしまった').toBe(ROOM);
		expect(res.y, '扉 (7,4) を抜けた').toBeLessThanOrEqual(6);
		// 対照：デバッグに戻すと扉をすり抜けて階段に乗る＝上の「止まった」は扉のせい
		await page.keyboard.press('g');
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 8; i++) { g.movePlayer('down'); g.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '4,1', null, { timeout: 5000 });
	});

	// ユーザー指摘（2026-11-17）：柱越しに縦に並ぶと、猪が「溜め→柱に激突→気絶」を繰り返していた。
	// 直し＝走り出す前に試し走りし、ただの壁で止まるなら走らない（enemy-ai.js dashLaneOpen）。
	test('⑤ 突進猪は柱越しには走り出さない（対照：柱の無い列では走り出す）', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(1, 2));
		await waitForBoard(page);
		await page.keyboard.press('g');   // デバッグ（無敵）中は敵が勇者を狙わない
		const res = await page.evaluate(() => {
			const g = window.__game;
			const boar = () => g.getEnemies().find((e) => e.type === 'ω');
			for (const e of g.getEnemies()) if (e.type !== 'ω') g.dealDamage(e.id, 9999, 'sword');
			g.step(2);
			const watch = (ticks) => {
				const seen = [];
				for (let i = 0; i < ticks; i++) {
					// 猪を柱 (2..3, 2..3) の真下の列に縛る（うろつきで列を外れて正当に走るのを除く）
					const b = boar();
					g.setEnemyFieldForTest(b.id, { x: watch.col, y: 4 });
					g.step(1);
					if (boar().dashPhase === 'windup') seen.push(i);
				}
				return seen.length;
			};
			watch.col = 2;
			const behindPillar = watch(150);         // 勇者 (1,2)・猪 (4,2)＝間に柱
			for (let i = 0; i < 2; i++) { g.movePlayer('left'); g.step(1); }
			watch.col = 1;
			const openLane = watch(150);             // 勇者 (1,1)・猪 (4,1)＝間は全部床
			return { behindPillar, openLane, player: [g.getPlayer().y, g.getPlayer().x] };
		});
		expect(res.behindPillar, '柱越しに走り出そうとした').toBe(0);
		expect(res.player, '前提：勇者が西の列へ移れた').toEqual([1, 1]);
		expect(res.openLane, '対照：柱の無い列でも走り出さない（試し走りが何でも止めている）').toBeGreaterThan(0);
	});

	test('④ 3体を倒すと鍵が出て、扉を開けて 4F へ', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		await page.goto(previewUrl(1, 5));
		await waitForBoard(page);
		const res = await page.evaluate((keyCell) => {
			const g = window.__game;
			const walk = (dir, tiles) => { for (let i = 0; i < tiles * 2; i++) { g.movePlayer(dir); g.step(1); } };
			const out = {};
			out.types = g.getEnemies().map((e) => e.type).sort();
			out.keyBefore = g.getStageState().conditionsMet.includes(keyCell);
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'sword');
			g.step(2);
			out.left = g.getEnemies().length;
			out.keyAfter = g.getStageState().conditionsMet.includes(keyCell);
			walk('down', 3);                        // (1,5) → 鍵 (4,5)
			out.keys = g.getPlayer().keys;
			walk('left', 1); walk('down', 4);       // (4,4) → 扉 (7,4) → 階段 (8,4)
			return out;
		}, KEY_CELL);
		expect(res.types, '敵の種類').toEqual(['λ', 'μ', 'ω'].sort());
		expect(res.keyBefore, '最初から鍵が出ている').toBe(false);
		expect(res.left, '前提：全滅').toBe(0);
		expect(res.keyAfter, '全滅しても鍵が出ない').toBe(true);
		expect(res.keys, '鍵を拾えていない').toBe(1);
		await page.waitForFunction(() => window.__game.getState().stageKey === '4,1', null, { timeout: 5000 });
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
