// tests/d5-frozen-canal-guards.spec.js
// dungeon_5 `1,2`（はしごの部屋）「凍れる水路の番兵」の番人
// （2026-10-05 / PLAN 実行キュー 40 の第1陣 2室目・盤面は `scripts/migrate-d5-1-2-frozen-canal-guards.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 1,2` と 4 セル差＝D5 の報酬（はしご）が、敵も仕掛けも無い箱に素で置かれていた。
//   ユーザー判定（2026-10-05）「せめて敵を何匹かおいて全滅したらはしごの宝箱が現れるようにする」。
//
// 新しい盤面（水は bgTiles の `~`）:
//      1 #~~~~..~~~~#   ← 北の口へ続く細い岸 (1,5)(1,6)
//      2 #~<~~~~~~~~#   ← 水路。(2,5)(2,6) だけ厚さ1＝はしごの渡り
//      3 #~~~......~#
//      4 #....B....θ.   ← 宝箱 B(4,5)＝はしご（敵全滅で現れる）
//      6 #..#....#..#   ← 柱の残骸 2本
//   水に潜み鮫 `<`(2,2)・射水魚 `/`(1,9)、陸に骸骨剣士 θ(4,10)。
//
// 守るものは2つ。
//   ① データ（幾何）：はしご無しでも宝箱・東の口に届き、北の口には届かない／はしごで水1枚を渡れば届く
//      （対照つき）／敵と封印と宣言／層の到達性。
//   ② 挙動（実機）：1体でも残っていれば宝箱は出ない・全滅で出る／宝箱ではしごを得て水路を渡り `1,1` へ／
//      はしご無しでは渡れない／水の敵は岸から矢で射れる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { TARGET, WATER, ENEMIES, EXITS, CHEST_CELL, effective, reach } from '../scripts/migrate-d5-1-2-frozen-canal-guards.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '1,2';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 1,2 凍れる水路の番兵 ① データ', () => {
	test('盤面・水・宝箱の封印・敵の宣言', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(Object.keys(st.bgTiles).sort(), '水は bgTiles').toEqual([...WATER].sort());
		expect(Object.values(st.bgTiles).every((v) => v === TILE.WATER)).toBe(true);
		expect(st.chestContents).toEqual({ [CHEST_CELL]: { type: 'item', item: 'ladder', name: 'はしご' } });
		expect(st.showConditions, 'はしごの宝箱は敵全滅で現れる').toEqual({ [CHEST_CELL]: { trigger: 'killAll' } });
		for (const [k, ch] of Object.entries(ENEMIES)) {
			const [r, c] = k.split(',').map(Number);
			expect(st.tiles[r][c], `${k} の敵`).toBe(ch);
		}
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'5.5m の配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
	});

	test('はしご無しでも宝箱と東の口・北の口は水路の向こう／はしごで水1枚', () => {
		const t = effective();
		const foot = reach(t);
		for (const k of [CHEST_CELL, ...EXITS.east]) expect(foot.has(k), `はしご無しで ${k} に届かない`).toBe(true);
		for (const k of EXITS.north) expect(foot.has(k), `はしご無しで北の口 ${k} に届く`).toBe(false);
		expect(reach(t, { withLadder: true }).get('0,5'), '渡る水の枚数').toBe(1);
	});

	test('対照：渡りを潰す・水路を厚さ2にすると、はしごでも届かない（測定が空虚でない）', () => {
		const wall = effective(); wall[2][5] = TILE.WALL; wall[2][6] = TILE.WALL;
		expect(reach(wall, { withLadder: true }).has('0,5'), '渡りを壁にしても届く').toBe(false);
		const thick = effective(); thick[3][5] = TILE.WATER; thick[3][6] = TILE.WATER;
		expect(reach(thick, { withLadder: true }).has('0,5'), '厚さ2にしても届く').toBe(false);
	});

	test('層の接続：はしごがあれば全室・はしご無しでは 1,1 の側へ入れない', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const ladder = bfsLayer(stages, START, { withLadder: true, openTiles: OPEN });
		expect(ladder.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(ladder.reachedRooms.size).toBe(Object.keys(stages).length);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		for (const k of ['1,1', '0,1', '0,2']) expect(foot.reachedRooms.has(k), `はしご無しで ${k} に入れる`).toBe(false);
		expect(foot.reachedRooms.has(ROOM), 'はしご無しで 1,2 に入れない').toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ...extra });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
const snap = (page) => page.evaluate(() => {
	const g = window.__game.getState();
	const p = window.__game.getPlayer();
	return { stage: g.stageKey, pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`, ladder: !!p.hasLadder,
		shown: [...(window.__game.getStageState().conditionsMet ?? [])] };
});
// 指定の種類だけ残して倒す（倒す数＝実際に減ったか確かめる）。
// 潜み鮫は潜っている間は無敵（`hide`）∴浮くまで tick を進めながら毎 tick 叩く（周期 2.0s＋1.2s＝最大 ~27 tick）。
const killExcept = (page, keep) => page.evaluate((keep) => {
	const g = window.__game;
	for (let i = 0; i < 60; i++) {
		const rest = g.getEnemies().filter((e) => !keep.includes(e.type));
		if (rest.length === 0) break;
		for (const e of rest) g.dealDamage(e.id, 999);
		g.step(1);
	}
	return g.getEnemies().map((e) => e.type).sort();
}, keep);

test.describe('D5 1,2 凍れる水路の番兵 ② 実機', () => {
	test('1体でも残っていれば宝箱は出ない・全滅で出る', async ({ page }) => {
		const errors = await boot(page, 8, 5);
		expect((await snap(page)).shown, '入った直後に宝箱が出ている').not.toContain(CHEST_CELL);
		for (const last of ['<', '/', 'θ']) {
			await boot(page, 8, 5);
			expect(await killExcept(page, [last]), `${last} だけ残す`).toEqual([last]);
			await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__game.step(1); });
			expect((await snap(page)).shown, `${last} が残っているのに宝箱が出た`).not.toContain(CHEST_CELL);
		}
		expect(await killExcept(page, [])).toEqual([]);
		await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__game.step(1); });
		expect((await snap(page)).shown, '全滅しても宝箱が出ない').toContain(CHEST_CELL);
		expect(errors).toEqual([]);
	});

	test('はしご無しでは水路の渡り (2,5) を渡れない', async ({ page }) => {
		const errors = await boot(page, 3, 5);
		await killExcept(page, []);
		await walk(page, 'up', 2);
		expect((await snap(page)).pos, 'はしご無しで水路へ入れた').toBe('3,5');
		expect(errors).toEqual([]);
	});

	test('通し：全滅→宝箱ではしご→水路を渡って北の口から 1,1 へ', async ({ page }) => {
		const errors = await boot(page, 8, 5);
		await killExcept(page, []);
		await walk(page, 'up', 3);   // (8,5)→(5,5)
		await walk(page, 'up', 1);   // 宝箱 (4,5) を開ける
		// はしごの初回ヒントの会話が開いたら閉じる（[[blade-moveplayer-is-half-tile]] と同じく操作の作法）
		for (let i = 0; i < 4; i++) await page.keyboard.press('Enter');
		let s = await snap(page);
		expect(s.ladder, '宝箱からはしごを得ていない').toBe(true);
		// 宝箱のセルに乗って開ける＝(4,5) に立っている。列6 へずれて北へ
		expect(s.pos, '宝箱のセル (4,5) に立っていない').toBe('4,5');
		await walk(page, 'right', 1);
		await walk(page, 'up', 1);
		s = await snap(page);
		expect(s.pos, '岸 (3,6) に立てない').toBe('3,6');
		await walk(page, 'up', 2);
		expect((await snap(page)).pos, 'はしごで水路を渡れない').toBe('1,6');
		await page.evaluate(() => { for (let i = 0; i < 6; i++) { window.__game.movePlayer('up'); window.__game.step(1); } });
		await page.waitForFunction(() => window.__game.getState().stageKey === '1,1', null, { timeout: 5000 });
		expect(errors).toEqual([]);
	});

	test('水の敵は岸から矢で射れる（射水魚を岸 (3,9) から北へ）', async ({ page }) => {
		const errors = await boot(page, 3, 9, { ps_bow: '1' });
		expect(await killExcept(page, ['/']), '射水魚だけ残す').toEqual(['/']);
		const hit = await page.evaluate(() => {
			const g = window.__game;
			const hp0 = g.getEnemies()[0].hp;
			for (let i = 0; i < 40; i++) {
				const e = g.getEnemies()[0];
				if (!e) return { killed: true };
				const pl = g.getPlayer();
				if (Math.abs(e.x - pl.x) < 0.6) { g.setHeroDir('up'); g.useSubItem(); }
				g.step(1);
			}
			const e = g.getEnemies()[0];
			return { killed: !e, hpLost: e ? hp0 - e.hp : hp0 };
		});
		expect(hit.killed || hit.hpLost > 0, `矢が射水魚に当たらない（${JSON.stringify(hit)}）`).toBe(true);
		expect(errors).toEqual([]);
	});
});
