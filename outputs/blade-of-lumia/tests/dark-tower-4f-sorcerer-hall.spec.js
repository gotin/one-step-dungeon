// tests/dark-tower-4f-sorcerer-hall.spec.js
// dark_tower 4F の踊り場 `4,1`＝術士と亡者の広間（戦闘の部屋）の番人。
//
// 経緯：キュー111（2026-11-18・`scripts/migrate-dark-tower-111-4f-landing.mjs`）。直す前は盾騎士 ζ と剣獣 μ の
// 2体（81）だけの素の箱で、着地 (6,4) から南の口（→ 4,2）まで素通りできた。ユーザー指摘「塔の残りは戦闘の部屋を主体に」
// と難しさの基準（B1 `0,1` を標準装備で「まあまあ」・ボスに近いほど難しくてよい＝DECISIONS 2026-11-17）を受けて、
// 切れ目3つの壁で北の広間と南の前室に仕切り、術士 η×2・骸骨剣士 θ×2・剣獣 μ・盾騎士 ζ を置き、
// 南の口の手前を鍵の扉で閉じた（鍵は全滅で出る）。
//
// 守るもの：
// ① 盤面・敵の組み合わせ・向き・鍵の条件・出入口・脅威度
// ② 通り道（鍵なしでは南の口へ届かない・鍵と矢束には届く）と着地の安全
// ③ 実機：鍵なしでは扉を抜けられない
// ④ 実機：全滅させると鍵が出て、扉を開けて 4,2 へ抜けられる
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { walkable, clearLine } from '../scripts/migrate-dark-tower-111-3f-stairs.mjs';
import {
	AFTER, ENEMIES, DIRS_AFTER, KEY_CELL, DOOR, STAIRS, PILE, SOUTH_OUT, GAPS, THREAT,
} from '../scripts/migrate-dark-tower-111-4f-landing.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dark_tower';
const ROOM = '4,1';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – dark_tower 4F 術士と亡者の広間（キュー111）', () => {
	test('① 盤面・敵の組み合わせ・鍵の条件・出入口・脅威度', () => {
		const g = rowsOf(st);
		expect(g, '4,1 の盤面').toEqual(AFTER);
		const es = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}${ch}`] : [])));
		expect(es, 'η×2・θ×2・μ・ζ').toEqual(ENEMIES);
		expect(st.enemyDirs, '向き（η は向きを持たない）').toEqual(DIRS_AFTER);
		expect(st.showConditions, '鍵は全滅で出る').toEqual({ [KEY_CELL]: { trigger: 'killAll' } });
		expect(st.mapEnters, '出入口は 3F からの階段だけ').toEqual({ [STAIRS]: { id: '4fEntrance', destId: '3fStairsUp' } });
		expect(g[8], '南の口の手前は扉 (8,5) だけ').toBe('#####D######');
		expect([...g[4]].flatMap((ch, c) => (ch === '#' ? [] : [`4,${c}`])), '仕切りの切れ目').toEqual(GAPS);
		expect(g[7][1], '矢束').toBe('6');
		const t = stageThreat(st, ENEMY_META);
		expect(t, '脅威度').toBe(THREAT);
		expect(t, '1室の上限').toBeLessThanOrEqual(162);
	});

	test('② 通り道と着地の安全', () => {
		const g = rowsOf(st);
		const closed = walkable(g, [STAIRS]);
		expect(closed.has(KEY_CELL) && closed.has(PILE), '鍵のセルと矢束へ歩いて行ける').toBe(true);
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
		ps_hearts: '15', ps_sword: '2', ps_shield: '2', ps_armor: '0', ps_bow: '1',
	});
	return `/blade-of-lumia/game/?${p}`;
};

test.describe('Blade of Lumia – dark_tower 4F 術士と亡者の広間は実機で抜けられる（キュー111）', () => {
	test('③ 鍵なしでは扉を抜けられない', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(5, 5));
		await waitForBoard(page);
		// ⚠️ プレビューはデバッグモード（無敵・扉すり抜け）で始まる＝G で切る（game/input.js）
		await page.keyboard.press('g');
		const res = await page.evaluate(() => {
			const g = window.__game;
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'arrow');
			g.step(2);
			const left = g.getEnemies().length;
			for (let i = 0; i < 10; i++) { g.movePlayer('down'); g.step(1); }
			return { left, y: g.getPlayer().y, stage: g.getState().stageKey, keys: g.getPlayer().keys };
		});
		expect(res.left, '前提：全滅').toBe(0);
		expect(res.keys ?? 0, '前提：鍵を持っていない').toBe(0);
		expect(res.stage, '扉を抜けて 4,2 へ出てしまった').toBe(ROOM);
		expect(res.y, '扉 (8,5) を抜けた').toBeLessThanOrEqual(7);
		// 対照：デバッグに戻すと扉をすり抜けて 4,2 へ出る＝上の「止まった」は扉のせい
		await page.keyboard.press('g');
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 10; i++) { g.movePlayer('down'); g.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '4,2', null, { timeout: 5000 });
	});

	// 2026-11-18 の実機確認で、(6,5) に立つと術士が3マス南＝鍵の扉の向こうの南の口 (9,5) へワープし、
	// 矢も剣も届かない所に立っていた（ワープは壁を越える）。game/enemy-ai.js pickBlinkCell で、閉じた鍵の扉を
	// 越えた先を出現先から外した。直す前は同じ立ち位置で 8 秒のうちに (9,5) へ出たのを headless で見ている。
	test('⑤ 術士は閉じた鍵の扉の向こう（南の口）へワープしない', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(6, 5));
		await waitForBoard(page);
		const res = await page.evaluate(() => {
			const g = window.__game;
			// 術士 (1,1) だけ残す（デバッグモードのまま＝プレイヤーは魔弾で倒れない）
			for (const e of g.getEnemies()) if (e.id !== '1,1') g.dealDamage(e.id, 9999, 'bomb');
			g.step(2);
			const seen = new Set(), player = new Set();
			for (let i = 0; i < 18 * 30; i++) {            // 18 tick＝ワープ1周期・30 回ぶん
				g.step(1);
				const p = g.getPlayer();
				player.add(`${Math.round(p.y)},${Math.round(p.x)}`);
				for (const e of g.getEnemies()) if (!e.hidden) seen.add(`${Math.round(e.r ?? e.y)},${Math.round(e.c ?? e.x)}`);
			}
			return { left: g.getEnemies().map((e) => e.type), seen: [...seen], player: [...player] };
		});
		expect(res.left, '前提：術士1体だけ').toEqual(['η']);
		expect(res.player, '前提：立ち位置 (6,5) から動いていない').toEqual(['6,5']);
		expect(res.seen.length, '前提：何度もワープした').toBeGreaterThanOrEqual(3);
		expect(res.seen.filter((k) => Number(k.split(',')[0]) >= 8), `扉の向こうに出た（出た場所: ${res.seen}）`).toEqual([]);
		expect(res.seen, '残りの三方（北・東・西）には出る').toEqual(expect.arrayContaining(['3,5', '6,8', '6,2']));
	});

	test('④ 全滅させると鍵が出て、扉を開けて 4,2 へ', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		await page.goto(previewUrl(5, 6));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate((keyCell) => {
			const g = window.__game;
			const walk = (dir, tiles) => { for (let i = 0; i < tiles * 2; i++) { g.movePlayer(dir); g.step(1); } };
			const out = {};
			out.types = g.getEnemies().map((e) => e.type).sort();
			out.keyBefore = g.getStageState().conditionsMet.includes(keyCell);
			for (const e of g.getEnemies()) g.dealDamage(e.id, 9999, 'arrow');
			g.step(2);
			out.left = g.getEnemies().length;
			out.keyAfter = g.getStageState().conditionsMet.includes(keyCell);
			walk('up', 2);                          // (5,6) → 切れ目 (4,6) → 鍵 (3,6)
			out.keys = g.getPlayer().keys;
			walk('down', 2); walk('left', 1); walk('down', 5);   // (5,5) → 扉 (8,5)（開けるのに1歩ぶん止まる）→ 南の口 (9,5) → 4,2
			return out;
		}, KEY_CELL);
		expect(res.types, '敵の種類').toEqual(['η', 'η', 'θ', 'θ', 'μ', 'ζ'].sort());
		expect(res.keyBefore, '最初から鍵が出ている').toBe(false);
		expect(res.left, '前提：全滅').toBe(0);
		expect(res.keyAfter, '全滅しても鍵が出ない').toBe(true);
		expect(res.keys, '鍵を拾えていない').toBe(1);
		await page.waitForFunction(() => window.__game.getState().stageKey === '4,2', null, { timeout: 5000 });
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
