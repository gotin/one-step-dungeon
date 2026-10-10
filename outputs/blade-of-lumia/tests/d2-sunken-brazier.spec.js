// tests/d2-sunken-brazier.spec.js
// dungeon_2 `1,3`（入口）「砂に沈んだ篝火」の番人
// （2026-10-10 / PLAN 実行キュー 41 の第1陣 1室目・盤面は `scripts/migrate-d2-1-3-sunken-brazier.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_1 1,3` とバイト一致＝四角い広間に手記が1枚あるだけ（D1 の写し）。
//
// 新しい盤面（北西の隅が砂の流れ落ちた穴）:
//      1 #xxx.......#
//      2 #xHxH......#   ← (2,2) 穴の中の消えた篝火・(2,4) 縁で燃えている篝火
//      3 #xxx.i.....#
//      4 ..B.........   ← (4,2) 2本とも灯ると現れる宝箱
//   (2,5) から西へブーメランを投げる＝燃える火で炎を拾い、穴を越えて消えた火に渡す。
//
// 守るものは2つ。
//   ① データ（幾何）：消えた篝火には歩いて近づけない／投げる座から西の線が「燃える火・穴・消えた火」／
//      宝箱は torchesLit で現れる／層の到達性は書き換え前と同じ。
//   ② 挙動（実機）：(2,5) から西へ投げると消えた火が灯り宝箱が現れる／縁の火を通らない線
//      （穴の南の縁から北へ）では灯らない／穴へは歩いて入れない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { TARGET, LANDING, SIGN, DEAD, LIT, THROW_FROM, CHEST, reach } from '../scripts/migrate-d2-1-3-sunken-brazier.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_2';
const ROOM = '1,3';
const stages = map.layers[LAYER].stages;

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D2 1,3 砂に沈んだ篝火 ① データ', () => {
	test('盤面・戻り口・手記（本文は旧のまま）・篝火・宝箱', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.mapEnters, '戻り口').toEqual({ [LANDING]: { id: 'dungeon_2', destId: 'field_dungeon2' } });
		expect(st.signData[SIGN].name).toBe('砂に埋もれた手記');
		expect(st.initLitTorches, '最初から燃えているのは縁の火だけ').toEqual([LIT]);
		expect(st.showConditions, '宝箱は torchesLit で現れる').toEqual({ [CHEST]: { trigger: 'torchesLit' } });
		expect(st.chestContents[CHEST]?.type).toBe('rupee');
	});

	test('消えた篝火には歩いて近づけない・投げる座から西の線が「燃える火・穴・消えた火」', () => {
		const t = gridOf();
		const foot = reach(t);
		const [r, c] = DEAD.split(',').map(Number);
		for (const k of [`${r - 1},${c}`, `${r + 1},${c}`, `${r},${c - 1}`, `${r},${c + 1}`]) {
			expect(foot.has(k), `消えた篝火の隣 ${k} に歩いて立てる`).toBe(false);
		}
		for (const k of [THROW_FROM, CHEST]) expect(foot.has(k), `${k} に歩いて届かない`).toBe(true);
		const [tr, tc] = THROW_FROM.split(',').map(Number);
		expect([1, 2, 3].map((d) => t[tr][tc - d]).join(''), '西の線').toBe(`${TILE.TORCH}${TILE.PIT}${TILE.TORCH}`);
		expect(`${tr},${tc - 1}`).toBe(LIT);
		expect(`${tr},${tc - 3}`).toBe(DEAD);
	});

	test('対照：穴の (3,2) を床にすると消えた篝火の隣に歩いて立てる（測定が空虚でない）', () => {
		const t = gridOf(); t[3][2] = TILE.FLOOR;
		expect(reach(t).has('3,2')).toBe(true);
	});

	test('層の接続：dead-edge 0・徒歩で 15 室（書き換え前と同じ）', () => {
		const START = { stage: ROOM, row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(foot.reachedRooms.size, '徒歩で歩ける部屋数').toBe(15);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_boomerang: '1' });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// movePlayer 1回＝半マス（[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
const pos = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`;
});
const ss = (page) => page.evaluate(() => window.__game.getStageState());
// 投げてから戻り切るまで進める。
async function throwBoomerang(page, dir) {
	await page.evaluate((d) => {
		window.__game.setHeroDir(d);
		window.__game.getPlayer().activeSubItem = 'boomerang';
	}, dir);
	await step(page, 1);
	await page.evaluate(() => window.__game.useSubItem());
	const flying = () => page.evaluate(() => window.__game.getProjectiles().some((p) => p.type === 'boomerang' && p.owner === 'player'));
	expect(await flying(), 'ブーメランが飛ばない').toBe(true);
	for (let i = 0; i < 200 && await flying(); i++) await step(page, 1);
	expect(await flying(), 'ブーメランが戻らない').toBe(false);
}

test.describe('D2 1,3 砂に沈んだ篝火 ② 実機', () => {
	test('縁の火の東 (2,5) から西へ投げると、消えた篝火が灯り宝箱が現れる', async ({ page }) => {
		const errors = await boot(page, 2, 5);
		const s0 = await ss(page);
		expect(s0.litTorches, '最初から燃えているのは縁の火だけ').toEqual([LIT]);
		expect(s0.conditionsMet ?? [], '投げる前に宝箱が出ている').not.toContain(CHEST);
		await throwBoomerang(page, 'left');
		const s1 = await ss(page);
		expect([...s1.litTorches].sort(), '消えた篝火が灯らない').toEqual([DEAD, LIT]);
		expect(s1.conditionsMet, '宝箱が現れない').toContain(CHEST);
		expect(errors).toEqual([]);
	});

	test('縁の火を通らない線（穴の南の縁 (4,2) から北へ）では灯らない', async ({ page }) => {
		const errors = await boot(page, 4, 2);
		await throwBoomerang(page, 'up');
		const s = await ss(page);
		expect(s.litTorches, '炎を拾わずに灯った').toEqual([LIT]);
		expect(s.conditionsMet ?? []).not.toContain(CHEST);
		expect(errors).toEqual([]);
	});

	test('穴へは歩いて入れない（縁の火の前から西・宝箱の座から北）', async ({ page }) => {
		const errors = await boot(page, 3, 4);
		await walk(page, 'left', 2);
		expect(await pos(page), '(3,4) から西の穴へ踏み込めた').toBe('3,4');
		await boot(page, 5, 2);
		await walk(page, 'up', 3);
		expect(await pos(page), '南から穴へ踏み込めた（宝箱の座 (4,2) で止まるはず）').toBe('4,2');
		expect(errors).toEqual([]);
	});
});
