// tests/d6-boar-felled-gate.spec.js
// dungeon_6 `3,1`「猪の枯れ木戸」の番人
// （2026-11-08 / PLAN 実行キュー 95 の11室目・盤面は `scripts/migrate-d6-3-1-boar-felled-gate.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四方の辻の床にコンパスが置いてあるだけ（茂み1・木1・敵なし）。
//
// 新しい盤面:
//      1 #.t....#.n.#   ← 北東の石の囲い（中 2×3）の奥にコンパス n(1,9)
//      2 #......#ω..#   ← 突進猪 ω(2,8)
//      3 #..u...##ŧ##   ← 枯れ木 ŧ(3,9)＝囲いの唯一の口
//      4 ............
//      5 ............
//      6 #..t...ti.t#   ← 列9 の窪み (6,9)〜(8,9)＝枯れ木の真南
//   新しい規則＝突進猪が頭からぶつかった枯れ木は、猪の進む向きへ倒れる（dash.fellsTrees）。
//
// 守るものは3つ。
//   ① データ：盤面・コンパスは囲いの中・敵と宣言・入り直しで戻る・層の接続。
//   ② エンジンの前提：枯れ木を倒すのは突進猪だけ（ボスの突進には付いていない）。
//   ③ 挙動（実機）：窪みで待つと猪が枯れ木を南へ倒し、切り株から入って猪を斬りコンパス／
//      通り道 (5,9) では猪が頭を打っても揺れるだけ（一言出る）／爆弾では倒れない（揺れるだけ）／
//      倒した後に入り直すと枯れ木は立ち直り猪も戻る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS, stageThreat } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, TARGET, TREE, BOAR, COMPASS, PEN, SEATS, SHAKE, MOUTHS, walkSearch,
} from '../scripts/migrate-d6-3-1-boar-felled-gate.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 猪の枯れ木戸 ① データ', () => {
	test('盤面・コンパスは囲いの奥・囲いの口は枯れ木1本・四方の口はつながる', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(grid[1][9], 'コンパスが囲いの奥 (1,9) に無い').toBe(TILE.ITEM_COMPASS);
		expect(PEN).toContain(COMPASS);
		expect(grid.flat().filter((ch) => ch === TILE.DEAD_TREE).length, '枯れ木が1本でない').toBe(1);
		const seen = walkSearch(grid);
		expect(MOUTHS.filter((m) => !seen.has(m)), '口どうしがつながらない').toEqual([]);
		expect(PEN.filter((k) => seen.has(k)), '倒す前に囲いの中へ歩いて入れる').toEqual([]);
		const opened = walkSearch(grid, { [TREE]: 's' });
		expect(opened.has(COMPASS), '枯れ木が南へ倒れてもコンパスに届かない').toBe(true);
	});

	test('敵は突進猪1体（囲いの中）・脅威度は看板部屋より軽い・入り直すと戻る・宣言・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.CHARGE_BOAR}@${BOAR}`]);
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['2,3'], ENEMY_META));
		expect(room.enemiesRespawn, '猪を倒してしまったら開けられない（入り直しで戻らない）').toBe(true);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS に宣言が無い').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: false, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ② エンジンの前提 ─────────────────────────────────────────────────
test('D6 猪の枯れ木戸 ② 前提：枯れ木を倒すのは突進猪だけ（ボスの突進には付いていない）', () => {
	expect(ENEMY_META[TILE.CHARGE_BOAR].dash?.fellsTrees, '突進猪が枯れ木を倒さない').toBe(true);
	const others = Object.entries(ENEMY_META)
		.filter(([ch, m]) => ch !== TILE.CHARGE_BOAR && JSON.stringify(m).includes('"fellsTrees"'))
		.map(([ch]) => ch);
	expect(others, '突進猪以外が枯れ木を倒す').toEqual([]);
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
const url = (row, col) => `${GAME}?${new URLSearchParams({
	fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_bomb: '1', ps_hearts: '10',
})}`;
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url(row, col));
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	await step(page, 2);
	return errors;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
const fallen = (page) => page.evaluate(() => ({ ...(window.__game.getStageState().fallenTrees ?? {}) }));
const boars = (page) => page.evaluate(() => window.__game.getEnemies().map((e) => ({ id: e.id, y: e.y, x: e.x, hp: e.hp })));
// 猪を指定のセルへ置き直す（どの列から来るかを固定する＝さまよいの乱数に合否を預けない）
const placeBoar = (page, r, c) => page.evaluate(([r, c]) => {
	const g = window.__game;
	const e = g.getEnemies()[0];
	g.setEnemyFieldForTest(e.id, { y: r, x: c, homeY: r, homeX: c });
}, [r, c]);
// 次の気絶（stunUntil が新しくなる）まで最大 n tick 回す
const untilStun = (page, n) => page.evaluate((n) => {
	const g = window.__game;
	const last = g.getEnemies()[0]?.stunUntil ?? null;
	for (let i = 1; i <= n; i++) {
		g.step(1);
		const e = g.getEnemies()[0];
		if (e && (e.stunUntil ?? null) !== last) return { tick: i, y: e.y, x: e.x };
	}
	return { tick: null };
}, n);
const msgBar = (page) => page.evaluate(() => {
	const bar = document.getElementById('msg-bar');
	return bar.classList.contains('hidden') ? '' : bar.textContent;
});

test.describe('D6 猪の枯れ木戸 ③ 実機', () => {
	test('通し：窪み (7,9) で待つと猪が枯れ木を南へ倒す→切り株から入って猪を斬り、奥でコンパス', async ({ page }) => {
		const errors = await boot(page, 7, 9);
		await placeBoar(page, 2, 9);
		expect(await fallen(page), '入った時点で倒れている').toEqual({});
		const s = await untilStun(page, 40);
		expect(s.tick, '猪が枯れ木に頭を打たない').not.toBe(null);
		expect(await fallen(page), '猪の突進で枯れ木が南へ倒れない').toEqual({ [TREE]: 's' });
		expect(await msgBar(page)).toContain('倒れた');
		await expect(page.locator('.cell[data-row="4"][data-col="9"] canvas').first(), '幹の絵が無い').toBeVisible();
		// (7,9) → (3,9)＝切り株。猪は気絶して (2,9) に居る
		await walk(page, 'up', 4);
		const pos = await page.evaluate(() => { const p = window.__game.getPlayer(); return `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`; });
		expect(pos, '切り株に立てない').toBe(TREE);
		await page.evaluate(() => window.__game.setHeroDir('up'));
		for (let i = 0; i < 20 && (await boars(page)).length; i++) {
			await page.evaluate(() => window.__game.swordAttack());
			await step(page, 4);
		}
		expect(await boars(page), '切り株から猪を斬って倒せない').toEqual([]);
		await walk(page, 'up', 2);   // (3,9) → (1,9)＝コンパス
		const got = await page.evaluate((layer) => !!window.__game.getPlayer().dungeonItems?.[layer]?.hasCompass, LAYER);
		expect(got, 'コンパスが取れない').toBe(true);
		expect(errors).toEqual([]);
	});

	for (const seat of SEATS.filter((k) => k !== '7,9')) {
		test(`窪みのほかの座 ${seat} でも南へ倒れる`, async ({ page }) => {
			const [r, c] = seat.split(',').map(Number);
			await boot(page, r, c);
			await placeBoar(page, 2, 9);
			const s = await untilStun(page, 40);
			expect(s.tick, '猪が枯れ木に頭を打たない').not.toBe(null);
			expect(await fallen(page)).toEqual({ [TREE]: 's' });
		});
	}

	test(`通り道 ${SHAKE} に立つと、猪は頭を打つが倒れる先を塞いでいる＝揺れるだけ（一言出る）`, async ({ page }) => {
		const [r, c] = SHAKE.split(',').map(Number);
		await boot(page, r, c);
		await placeBoar(page, 2, 9);
		const s = await untilStun(page, 40);
		expect(s.tick, '猪が突進しない＝対照が空虚').not.toBe(null);
		expect(await fallen(page), '倒れる先に勇者が立っているのに倒れた').toEqual({});
		expect(await msgBar(page)).toContain('揺れた');
		// 一歩下がれば倒れる（気絶と硬直＝22 tick が明けると、また勇者めがけて突進する）
		await walk(page, 'down', 1);
		const t = await page.evaluate((tree) => {
			const g = window.__game;
			for (let i = 1; i <= 80; i++) { g.step(1); if (g.getStageState().fallenTrees?.[tree]) return i; }
			return null;
		}, TREE);
		expect(t, '一歩下がっても倒れない').not.toBe(null);
		expect(await fallen(page)).toEqual({ [TREE]: 's' });
	});

	test('爆弾では倒れない：通り道 (4,9)・(5,9) の爆風は北へ倒そうとしてコンパスに塞がる', async ({ page }) => {
		await boot(page, 4, 9);
		// 猪は爆風の外 (1,8) で止めておく（倒れる先を塞ぐのはコンパスだけ、を測る）
		await placeBoar(page, 1, 8);
		await page.evaluate(() => { const g = window.__game; g.setEnemyFieldForTest(g.getEnemies()[0].id, { stunUntil: Number.MAX_SAFE_INTEGER }); });
		for (const down of [0, 1]) {
			if (down) await walk(page, 'down', 1);
			await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bomb'; window.__game.useSubItem(); });
			await walk(page, 'left', 2);   // 爆心から離れる
			await step(page, 30);           // 導火線 2 秒＝16 tick＋余り
			expect(await fallen(page), `(${4 + down},9) の爆弾で枯れ木が倒れた`).toEqual({});
			expect(await msgBar(page), `(${4 + down},9) の爆風が枯れ木に届いていない＝対照が空虚`).toContain('揺れた');
			await walk(page, 'right', 2);
		}
		expect((await boars(page)).length, '対照：猪が爆風に巻き込まれた').toBe(1);
	});

	test('倒した後に部屋を出て入り直すと、枯れ木は立ち直り猪も戻る', async ({ page }) => {
		await boot(page, 7, 9);
		await placeBoar(page, 2, 9);
		await untilStun(page, 40);
		expect(await fallen(page), '倒れた状態が作れていない').toEqual({ [TREE]: 's' });
		// (7,9) → (8,9) → (8,6) → 南の口から `3,2` へ出て、戻る
		await walk(page, 'down', 1);
		await walk(page, 'left', 3);
		await page.evaluate(() => window.__game.resume?.());
		for (let i = 0; i < 20 && (await page.evaluate(() => window.__game.getState().stageKey)) === ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('down'));
			await page.waitForTimeout(100);
		}
		await page.waitForFunction(() => window.__game.getState().stageKey === '3,2', null, { timeout: 5000 });
		for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.getState().stageKey)) !== ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('up'));
			await page.waitForTimeout(150);
		}
		await page.waitForFunction((rm) => window.__game.getState().stageKey === rm, ROOM, { timeout: 5000 });
		expect(await fallen(page), '入り直しても枯れ木が倒れたまま').toEqual({});
		expect((await boars(page)).length, '入り直しても猪が戻らない').toBe(1);
	});
});
