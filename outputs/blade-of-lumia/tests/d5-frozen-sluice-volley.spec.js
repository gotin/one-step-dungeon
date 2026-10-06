// tests/d5-frozen-sluice-volley.spec.js
// dungeon_5 `2,0`（`2,1` の北の行き止まり）「凍れる湖の射ち継ぎ」の番人
// （2026-10-06 / PLAN 実行キュー 40 の第2陣 3室目・盤面は `scripts/migrate-d5-2-0-frozen-sluice-volley.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 2,0` と同型＝四角い広間の真ん中に宝箱（ルピー×10）が1つあるだけ。
//
// 新しい盤面（水は bgTiles）:
//      1 #B.#...#...#   ← 宝箱 (1,1)＝ルピー×30（面して立てるのは (1,2) だけ）
//      2 #~~~~~~~~~~#
//      3 #~=~=#~~~Y=#   ← 水門 (3,2)・(3,4)・(3,10)／スイッチ (3,9)
//      4 #~Y~~~~#~~~#   ← スイッチ (4,2)／崩れ柱 (4,7)
//      5 #~~Y=~~~~#=#   ← スイッチ (5,3)／水門 (5,4)・(5,10)
//      6 #~~~~Y~~~~~#   ← スイッチ (6,5)＝入口の正面
//   スイッチを射ると水門が干上がる。干した足場ははしごの橋脚であり、次のスイッチを射る立ち位置でもある。
//
// 守るものは2つ。
//   ① データ：盤面・水・スイッチと水門と links・中身／ソルバーの厳格と緩い × ビームあり・なしが同じ最短手数・
//      詰まない・立っている足場を自分で沈める手が無い／対照（はしご・弓・スイッチ4つ・足場5枚・橋脚の規則・崩れ柱2本）／層の接続。
//   ② 挙動（実機）：閉じた足場へははしごを架けられない／入口から射た矢が湖と閉じた水門を越えてスイッチに当たる／
//      はしごの途中で西を射ても崩れ柱に止まり帰りの足場が沈まない／通しでスイッチ4つを射て足場5つを渡り宝箱。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import {
	TARGET, WATER, WATER_MAP, CHEST, BELLS, PIERS, LINKS, TRAP_PILLAR, DETOUR_PILLAR, SHORTEST, SHOTS,
	solveRoom, withCell,
} from '../scripts/migrate-d5-2-0-frozen-sluice-volley.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '2,0';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
// 実マップから水の盤面を組み直す（定数ではなく実物を測る）
const liveWaterMap = () => rowsOf(stages[ROOM]).map((row, r) =>
	[...row].map((ch, c) => (stages[ROOM].bgTiles?.[`${r},${c}`] === TILE.WATER ? '~' : ch)).join(''));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 2,0 凍れる湖の射ち継ぎ ① データ', () => {
	test('盤面・水は bgTiles・スイッチと水門と links・宝箱（敵・植生・看板・石が無い）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(Object.keys(st.bgTiles).sort()).toEqual([...WATER].sort());
		expect(Object.values(st.bgTiles).every((v) => v === TILE.WATER)).toBe(true);
		expect(st.links).toEqual(LINKS);
		expect([...new Set(LINKS.map((l) => l.switchId))].sort()).toEqual([...BELLS].sort());
		expect(LINKS.map((l) => l.gateId).sort()).toEqual([...PIERS].sort());
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } });
		expect(st.floorItems ?? {}).toEqual({});
		expect(st.showConditions ?? {}).toEqual({});
		expect(Object.keys(st.signData ?? {})).toEqual([]);
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.STONE, TILE.BUTTON, TILE.GATE]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test(`ソルバー：厳格・緩い × ビームあり・なしが同じ最短手数 ${SHORTEST}・詰まない・足場を自分で沈めない`, () => {
		const wm = liveWaterMap();
		expect(wm).toEqual(WATER_MAP);
		const m = solveRoom(wm);
		expect(m.L, '厳格版の最短手数').toBe(SHORTEST);
		expect(m.shots, '最短解でスイッチを叩く回数').toBe(SHOTS);
		for (const o of [{}, { strict: false }, { beam: false }, { strict: false, beam: false }]) {
			const v = solveRoom(wm, o);
			expect(v.L, `${JSON.stringify(o)} の最短手数＝見た目で読めない近道がある`).toBe(SHORTEST);
			expect(v.noEscape, `${JSON.stringify(o)} で入って詰む状態`).toBe(0);
			expect(v.sinkSelf, `${JSON.stringify(o)} で立っている足場を自分で沈める手`).toBe(0);
		}
	});

	test('対照：はしご・弓・スイッチ4つ・足場5枚・橋脚の規則・崩れ柱2本がどれも飾りでない', () => {
		expect(solveRoom(WATER_MAP, { hasLadder: false, strict: false }).L, 'はしご無しで届く').toBe(null);
		expect(solveRoom(WATER_MAP, { noTools: true, strict: false }).L, '剣だけで届く＝弓が要らない').toBe(null);
		for (const y of BELLS) expect(solveRoom(withCell(y, TILE.WALL), { strict: false }).L, `スイッチ ${y} を壁にしても届く`).toBe(null);
		for (const g of PIERS) expect(solveRoom(withCell(g, '~'), { strict: false }).L, `足場 ${g} を水にしても届く`).toBe(null);
		expect(solveRoom(WATER_MAP, { strict: false, openTideBanks: false }).L, '開いた水門を橋脚に数えなくても届く').toBe(null);
		expect(solveRoom(withCell(TRAP_PILLAR, '~'), { strict: false }).noEscape,
			`崩れ柱 ${TRAP_PILLAR} を水にしても詰まない＝柱が要らない（測定が壊れている）`).toBeGreaterThan(0);
		const detour = solveRoom(withCell(DETOUR_PILLAR, '~'));
		expect(detour.L, `崩れ柱 ${DETOUR_PILLAR} を水にしても近道ができない`).not.toBe(null);
		expect(detour.L).toBeLessThan(SHORTEST);
	});

	test('層の接続は不変', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '2,0 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_ladder: '1', ps_bow: '1',
	});
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
// 向いて矢を1本射る（矢が飛び切るまで tick を進める）
async function shoot(page, dir) {
	await page.evaluate((d) => {
		window.__game.setHeroDir(d);
		window.__game.step(1);
		window.__game.getPlayer().activeSubItem = 'bow';
		window.__game.useSubItem();
		window.__game.step(30);
	}, dir);
}
const snap = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	const ss = window.__game.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		bells: [...(ss.switchToggles ?? [])].sort(),
		openGates: [...(ss.openGates ?? [])].sort(),
		opened: [...(ss.openedChests ?? [])],
		rupees: window.__game.getState().player.rupees,
	};
});
async function run(page, route) {
	for (const [d, n, want] of route) {
		await walk(page, d, n);
		expect((await snap(page)).pos, `${d}×${n} の後`).toBe(want);
	}
}
const sorted = (a) => [...a].sort();

test.describe('D5 2,0 凍れる湖の射ち継ぎ ② 実機', () => {
	test('閉じた足場へははしごを架けられない／入口から真上を射ると、湖越しにスイッチ (6,5) に当たり足場 (5,4) が干上がる', async ({ page }) => {
		const errors = await boot(page, 8, 4);
		await run(page, [['up', 1, '7,4']]);
		await walk(page, 'up', 2);
		expect((await snap(page)).pos, '閉じた足場 (5,4) へ渡れた').toBe('7,4');
		await run(page, [['right', 1, '7,5']]);
		await shoot(page, 'up');
		let s = await snap(page);
		expect(s.bells, 'スイッチ (6,5) に当たらない').toEqual(['6,5']);
		expect(s.openGates, '足場 (5,4) が干上がらない').toEqual(['5,4']);
		await run(page, [['left', 1, '7,4'], ['up', 2, '5,4']]);
		// 足場の上から左のスイッチ (5,3) を射る＝北の足場 (3,2)・(3,10) が干上がる
		await shoot(page, 'left');
		s = await snap(page);
		expect(s.bells).toEqual(sorted(['6,5', '5,3']));
		expect(s.openGates).toEqual(sorted(['5,4', '3,2', '3,10']));
		expect(errors).toEqual([]);
	});

	test('列2 の岸から真上を射ると、湖越しにスイッチ (4,2) に当たり足場 (5,10) が干上がる（スイッチ (4,2) は矢でしか当たらない）', async ({ page }) => {
		const errors = await boot(page, 8, 2);
		await shoot(page, 'up');
		const s = await snap(page);
		expect(s.bells, 'スイッチ (4,2) に当たらない').toEqual(['4,2']);
		expect(s.openGates).toEqual(['5,10']);
		expect(errors).toEqual([]);
	});

	test(`はしごで (4,10) を渡る途中に西を射っても、崩れ柱 ${TRAP_PILLAR} に止まり帰りの足場 (5,10) が沈まない`, async ({ page }) => {
		// (4,10) にはしごが架かるのは足場 (5,10)・(3,10) が両方干上がっているときだけ＝スイッチ3つを射てから
		const errors = await boot(page, 8, 5);
		await shoot(page, 'up');                                       // スイッチ (6,5) → 足場 (5,4)
		await run(page, [['left', 3, '8,2']]);
		await shoot(page, 'up');                                       // スイッチ (4,2) → 足場 (5,10)
		await run(page, [['right', 2, '8,4'], ['up', 1, '7,4'], ['up', 2, '5,4']]);
		await shoot(page, 'left');                                     // スイッチ (5,3) → 足場 (3,2)・(3,10)
		await run(page, [['down', 2, '7,4'], ['right', 6, '7,10'], ['up', 2, '5,10']]);
		await walk(page, 'up', 1);                                     // はしごで (4,10) の上へ
		expect((await snap(page)).pos, 'はしごの上に乗れない').toBe('4,10');
		const want = sorted(['6,5', '4,2', '5,3']);
		expect((await snap(page)).bells).toEqual(want);
		await shoot(page, 'left');
		const s = await snap(page);
		expect(s.bells, '崩れ柱を越えてスイッチ (4,2) に当たった').toEqual(want);
		expect(s.openGates, '帰りの足場 (5,10) が沈んだ').toContain('5,10');
		await walk(page, 'down', 1);
		expect((await snap(page)).pos, '足場 (5,10) へ戻れない').toBe('5,10');
		expect(errors).toEqual([]);
	});

	test('通し：スイッチ4つを射て足場5つを渡り、北の岸の宝箱（ルピー×30）を開ける', async ({ page }) => {
		const errors = await boot(page, 8, 5);
		await shoot(page, 'up');                                       // スイッチ (6,5) → 足場 (5,4)
		await run(page, [['left', 3, '8,2']]);
		await shoot(page, 'up');                                       // スイッチ (4,2) → 足場 (5,10)
		await run(page, [['right', 2, '8,4'], ['up', 1, '7,4'], ['up', 2, '5,4']]);
		await shoot(page, 'left');                                     // スイッチ (5,3) → 足場 (3,2)・(3,10)
		await run(page, [['down', 2, '7,4'], ['right', 6, '7,10'], ['up', 4, '3,10']]);
		await shoot(page, 'left');                                     // スイッチ (3,9) → 足場 (3,4)
		let s = await snap(page);
		expect(s.bells).toEqual(sorted(BELLS));
		expect(s.openGates).toEqual(sorted(PIERS));
		const before = s.rupees;
		await run(page, [
			['down', 4, '7,10'], ['left', 6, '7,4'],
			['up', 4, '3,4'],                                            // (6,4)→足場(5,4)→(4,4)→足場(3,4)
			['left', 2, '3,2'],                                          // はしごで (3,3) を渡る
			['up', 2, '1,2'],                                            // はしごで (2,2) を渡って北の岸へ
		]);
		await walk(page, 'left', 1);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toContain(CHEST);
		expect(s.rupees, 'ルピーが 30 増えない').toBe(before + 30);
		expect(errors).toEqual([]);
	});
});
