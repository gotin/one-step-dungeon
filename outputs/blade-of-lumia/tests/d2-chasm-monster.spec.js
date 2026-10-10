// tests/d2-chasm-monster.spec.js
// dungeon_2 `1,0`（中ボスの部屋）「流砂の裂け目の魔物」の番人
// （2026-10-10 / PLAN 実行キュー 41 の第2陣 1室目・盤面は `scripts/migrate-d2-1-0-chasm-monster.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_1 1,0` と同じ盤面＝四角い広間に魔物 W とパトロール E×2（D1 の写し）・報酬なし。
//
// 新しい盤面（東西いっぱいの裂け目と一本橋）:
//      1 #....B.....#   ← (1,5) 宝箱（W を倒すと現れる）
//      3 #....W.....#   ← (3,5) 魔物 W
//      4 #...........   ← 東の口（西の枝 `2,0` へ）は裂け目の北
//      6 #xxxx.xxxxx#   ← 裂け目（穴）。渡れるのは列5 の幅1の橋だけ
//      7 #xxxx.xxxxx#
//      8 #..........#   ← 南の岸（入口の着地 (8,5)）
//   南の岸から W の広間へは橋だけ。W は石を投げ、石は穴を越えて飛ぶ。木の盾を前に立てて受ければ無傷。
//
// 守るものは2つ。
//   ① データ（幾何）：W が1体だけ・宝箱は W を倒すと現れる・裂け目を渡れるのは幅1の橋1本だけ・層の到達性。
//   ② 挙動（実機）：岸で立ち止まると W が裂け目の北から石を投げて HP が減る／木の盾で上を向けば無傷／
//      W が生きている間は宝箱が無く、倒すと現れる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET, EXITS, MONSTER, MONSTER_DIR, ENTRY, CHEST, CHEST_CONTENT, CHEST_CONDITION, reach, crossings,
} from '../scripts/migrate-d2-1-0-chasm-monster.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_2';
const ROOM = '1,0';
const stages = map.layers[LAYER].stages;

const P = (k) => k.split(',').map(Number);
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D2 1,0 流砂の裂け目の魔物 ① データ', () => {
	test('盤面・敵は W×1・向き・雑魚の脅威度 0・宝箱は W を倒すと現れる', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		const enemies = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) enemies.push(`${ch}@${r},${c}`); }));
		expect(enemies, '敵は魔物 W 1体だけ').toEqual([`${TILE.MONSTER}@${MONSTER}`]);
		expect(st.enemyDirs).toEqual({ [MONSTER]: MONSTER_DIR });
		expect(stageThreat(st, ENEMY_META), '雑魚を置いていない（看板部屋 2,1 の梯子に触れない）').toBe(0);
		const [cr, cc] = P(CHEST);
		expect(t[cr][cc]).toBe(TILE.CHEST);
		expect(st.chestContents).toEqual({ [CHEST]: CHEST_CONTENT });
		expect(st.showConditions, '宝箱が W を倒すと現れる形でない').toEqual({ [CHEST]: CHEST_CONDITION });
		expect(CHEST_CONDITION.trigger).toBe('killAll');
		for (const k of ['signData', 'floorItems', 'mapEnters', 'bgTiles']) {
			expect(Object.keys(st[k] ?? {}), `${k} が空でない`).toEqual([]);
		}
	});

	test('裂け目を渡れるのは幅1の橋1本だけ・橋を落とすと南の岸から広間（東の口・宝箱・W）へ届かない', () => {
		const t = gridOf();
		// 橋は定数でなく盤面から引く（盤面で橋が増えたり広がったりしたら赤くなるように）
		const bridge = crossings(t);
		expect(bridge.length, '裂け目を渡れるセルが無い').toBeGreaterThan(0);
		expect(new Set(bridge.map((k) => P(k)[1])).size, '橋が幅1の1本でない').toBe(1);
		const cut = reach(t, ENTRY, new Set(bridge));
		for (const k of [...EXITS.east, CHEST, MONSTER]) expect(cut.has(k), `橋を通らずに ${k} へ届く`).toBe(false);
		for (const k of bridge) {
			const [r, c] = P(k);
			expect([t[r][c - 1], t[r][c + 1]], `橋 ${k} の両脇が穴でない`).toEqual([TILE.PIT, TILE.PIT]);
		}
	});

	test('対照：橋を落とさなければ南の岸から広間へ歩ける（測定が空虚でない）', () => {
		const seen = reach(gridOf(), ENTRY);
		for (const k of [...EXITS.east, '2,5', '4,5']) expect(seen.has(k), `${k} へ歩けない`).toBe(true);
	});

	test('層の接続：dead-edge 0・徒歩で 15 室（書き換え前と同じ）', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(foot.reachedRooms.size, '徒歩で歩ける部屋数').toBe(15);
		for (const k of ['1,1', '2,0', '3,0']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const [row, col] = P(ENTRY);
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row, col, ps_weapon: '1', ps_hearts: '3', ...extra });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 1);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）∴HP を測る本は 'g' で切る。
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// 岸で立ち止まって n tick 進める（向きは毎 tick 固定）。W の石が初めて生まれた tick と、そのときの W の行を返す。
const standStill = (page, dir, n) => page.evaluate(({ dir, n }) => {
	const g = window.__game;
	const hp0 = g.getState().player.hp;
	let first = null, wRowAtThrow = null;
	for (let i = 0; i < n; i++) {
		g.setHeroDir(dir);
		g.step(1);
		const pr = g.getProjectiles().filter((x) => x.owner === 'enemy');
		if (pr.length && first == null) { first = i; wRowAtThrow = g.getEnemies()[0]?.y ?? null; }
	}
	return { hp0, hp1: g.getState().player.hp, first, wRowAtThrow };
}, { dir, n });

test.describe('D2 1,0 流砂の裂け目の魔物 ② 実機', () => {
	test('南の岸で立ち止まると W が裂け目の北から石を投げ、盾なしでは HP が減る', async ({ page }) => {
		const errors = await boot(page);
		const r = await standStill(page, 'down', 60);
		expect(r.first, 'W が投げない').not.toBeNull();
		const firstPit = Math.min(...crossings(gridOf()).map((k) => P(k)[0]));
		expect(r.wRowAtThrow, '最初の石を投げたとき W が裂け目の北に居ない＝石が穴を越えていない').toBeLessThan(firstPit);
		expect(r.hp1, '盾なしで立ち止まっても HP が減らない').toBeLessThan(r.hp0);
		expect(errors).toEqual([]);
	});

	test('木の盾（D1 の報酬）で上を向いて立てば無傷', async ({ page }) => {
		const errors = await boot(page, { ps_shield: '0' });
		const r = await standStill(page, 'up', 60);
		expect(r.first, 'W が投げない').not.toBeNull();
		expect(r.hp1, '木の盾で防げない').toBe(r.hp0);
		expect(errors).toEqual([]);
	});

	test('W が生きている間は宝箱が無く、倒すと現れる', async ({ page }) => {
		const errors = await boot(page, { ps_shield: '0', ps_boomerang: '1' });
		const chestShown = () => page.evaluate((k) => window.__game.getStageState().conditionsMet.includes(k), CHEST);
		expect(await chestShown(), '倒す前から宝箱が出ている').toBe(false);
		// 岸から上へブーメランを投げ続けて倒す（盾で上を向いたまま＝石も剣も前で受ける）。
		// 木のブーメラン ATK 3・W は DEF 1・HP 48 ＝24 発。手元に戻るまで次は投げられない∴400 tick 前後かかる。
		const left = await page.evaluate(() => {
			const g = window.__game;
			for (let i = 0; i < 1500; i++) {
				if (g.getEnemies()[0]?.hp <= 0) break;
				g.setHeroDir('up');
				if (!g.getProjectiles().some((x) => x.owner !== 'enemy')) g.useSubItem();
				g.step(1);
			}
			return g.getEnemies()[0]?.hp ?? 0;
		});
		expect(left, 'W を倒せない').toBeLessThanOrEqual(0);
		// ボス格の敵は倒れる演出を実時間で待ってから消える∴tick を進めながら消えるまで待つ。
		await page.waitForFunction((k) => {
			const g = window.__game;
			g.step(1);
			return g.getEnemies().length === 0 && g.getStageState().conditionsMet.includes(k);
		}, CHEST, { polling: 100, timeout: 10000 });
		expect(await chestShown(), 'W を倒しても宝箱が現れない').toBe(true);
		expect(errors).toEqual([]);
	});
});
