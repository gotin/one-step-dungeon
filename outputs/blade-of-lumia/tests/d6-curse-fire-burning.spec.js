// tests/d6-curse-fire-burning.spec.js
// dungeon_6 `2,2`「呪い火の野焼き」の番人
// （2026-11-05 / PLAN 実行キュー 95 の3室目・盤面は `scripts/migrate-d6-2-2-curse-fire-burning.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四方の口の十字に茂み2つ・木1本・床のルピー×3 があるだけ・敵なし。
//
// 新しい盤面（`~` は bgTiles の水）:
//      1 #Huu~..tttt#     ← 北西の池の島：かがり火 H(1,1)＋茂み5
//      2 #uuu~..tttt#
//      3 #~~~~uuBttt#     ← 宝箱 B(3,7)＝かがり火が全部灯ると現れる
//      4 ....uψuu....     ← 呪い火 ψ(4,5)＝十字の真ん中の茂みの檻の中
//      5 ....uuuu....
//      6 #tttiuu~~~~#     ← 碑 i(6,4)
//      7 #tttt..~uuu#     ← 南東の池の島：茂み5＋かがり火 H(8,10)
//      8 #tttt..~uuH#
//   新しいルール＝呪い火 ψ の体に縦横で接した茂みは燃える（ロウソクと同じ燃え広がり）。
//
// 守るものは3つ。
//   ① データ：盤面・水・宝の中身と出る条件・碑・入り直しで戻る・最初から追う・檻と島の形・
//      ロウソクが島に届かない・通り抜け・敵と脅威度・宣言・層の接続。
//   ② エンジンの前提：ψ は茂みを燃やす・飛ぶ・勇者より遅い。
//   ③ 挙動（実機）：入口に立つだけ／十字をまっすぐ抜けるだけでは檻しか燃えない／
//      東の腕の先で待って南の腕の先へ走ると南東の島が灯る／西の腕の先で待って北の腕の先へで北西の島／
//      2本灯ると宝箱が出て +30／ロウソクは島に届かない／ψ を斬っても入り直すと戻る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS, stageThreat } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, TARGET, WATER, PSI, CHEST, SIGN, TORCH_NW, TORCH_SE, MOUTHS,
	CHEST_CONTENTS, SHOW, SIGN_DATA, reach, bushGroup,
} from '../scripts/migrate-d6-2-2-curse-fire-burning.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));
const water = new Set(Object.keys(room.bgTiles ?? {}).filter((k) => room.bgTiles[k] === TILE.WATER));
const rc = (k) => k.split(',').map(Number);
const PEN = [...bushGroup(grid, '3,5').cells].sort();
const NW = [...bushGroup(grid, '1,2').cells].sort();
const SE = [...bushGroup(grid, '7,9').cells].sort();

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D6 呪い火の野焼き ① データ', () => {
	test('盤面・水・宝箱の中身と出る条件・碑・入り直しで戻る・最初から追う', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect([...water].sort(), '水の下地が違う').toEqual([...WATER].sort());
		expect(room.chestContents).toEqual(CHEST_CONTENTS);
		expect(room.showConditions, '宝箱がかがり火で現れる、でない').toEqual(SHOW);
		expect(room.signData).toEqual(SIGN_DATA);
		expect(grid[rc(SIGN)[0]][rc(SIGN)[1]]).toBe(TILE.SIGN);
		expect(room.enemiesRespawn, 'ψ を斬ると二度と島に火を点けられない').toBe(true);
		expect(room.enemyChase, 'ψ がさまよう＝家の周りの池の上を歩いて勝手に島を燃やす（謎が乱数で解ける）').toEqual({ [PSI]: true });
		expect(room.initLitTorches ?? [], '初めから灯ったかがり火がある＝ブーメランで火を運べてしまう').toEqual([]);
		expect(Object.keys(room.floorItems ?? {}), '床のアイテムが残っている').toEqual([]);
	});

	test('檻と島：檻は1かたまりでかがり火に接しない・島はそれぞれかがり火1本に接する', () => {
		expect(PEN.length, '檻の茂みのかたまりが 11 でない').toBe(11);
		const [pr, pc] = rc(PSI);
		expect([[pr - 1, pc], [pr + 1, pc], [pr, pc - 1], [pr, pc + 1]].every(([r, c]) => PEN.includes(`${r},${c}`)), 'ψ の四方が檻でない').toBe(true);
		expect(bushGroup(grid, '3,5').torches.size, '檻が燃えるとかがり火まで灯る').toBe(0);
		expect([NW.length, [...bushGroup(grid, '1,2').torches]], '北西の島').toEqual([5, [TORCH_NW]]);
		expect([SE.length, [...bushGroup(grid, '7,9').torches]], '南東の島').toEqual([5, [TORCH_SE]]);
	});

	test('ロウソクが島に届かない：島の茂みとかがり火は勇者の立てる床に縦横で接しない（＝腕を追う ψ も島に接しない）', () => {
		const walk = reach(grid, Object.values(MOUTHS).flat(), water);
		const islets = [...NW, ...SE, TORCH_NW, TORCH_SE];
		const touching = islets.filter((k) => {
			const [r, c] = rc(k);
			return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([a, b]) => walk.has(`${a},${b}`) && !islets.includes(`${a},${b}`));
		});
		expect(touching, '勇者の立てる床に接する島のセルがある').toEqual([]);
	});

	test('通り抜け：四方の口がつながる・床は全部届く', () => {
		const seen = reach(grid, MOUTHS.west, water);
		expect([...MOUTHS.north, ...MOUTHS.south, ...MOUTHS.east].filter((k) => !seen.has(k)), '西の口から抜けられない口がある').toEqual([]);
		const stranded = [];
		grid.forEach((row, r) => row.forEach((ch, c) => {
			if (water.has(`${r},${c}`)) return;
			if ((ch === TILE.FLOOR || ch === TILE.CHEST || ENEMY_META[ch]) && !seen.has(`${r},${c}`)) stranded.push(`${r},${c}`);
		}));
		expect(stranded, '届かない床がある').toEqual([]);
	});

	test('敵は呪い火 1体・脅威度は看板部屋より軽い・宣言・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.CURSE_FIRE}@${PSI}`]);
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['2,3'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS に宣言が無い').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: false, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ② エンジンの前提 ─────────────────────────────────────────────────
test('D6 呪い火の野焼き ② 前提：ψ は茂みを燃やす・飛ぶ・勇者より遅い', () => {
	const m = ENEMY_META[TILE.CURSE_FIRE];
	expect(m.ignitesBushes, '呪い火が茂みを燃やさない＝島に火を点ける手段が無い').toBe(true);
	expect(m.move, '呪い火が飛ばない＝池を越えられない').toBe('air');
	// 勇者は 1 tick に 0.5 マス（速度換算 1.0）＝ψ を腕の先に置き去りにして隣の腕へ回れる
	expect(m.speed, '呪い火が勇者と同じ速さ＝置き去りにできない').toBeLessThan(1.0);
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '10', ps_rupees: '100', ps_candle: '1', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
async function boot(page, row, col) {
	await page.goto(previewUrl(row, col));
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
}
const state = (page) => page.evaluate(() => window.__game.getStageState());
// 台本を実機で回す：['wait', n] / ['waitPsi', 'x>=' | 'x<=', v]（ψ がその列まで来るのを待つ）/
// ['go', r, c]（縦を先に、まっすぐ歩く・movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）
const run = (page, plan) => page.evaluate((plan) => {
	const g = window.__game;
	const P = () => g.getState().player;
	for (const st of plan) {
		if (st[0] === 'wait') g.step(st[1]);
		else if (st[0] === 'waitPsi') {
			for (let i = 0; i < 300; i++) {
				const e = g.getEnemies()[0];
				if (!e || (st[1] === 'x>=' ? e.x >= st[2] : e.x <= st[2])) break;
				g.step(1);
			}
		} else {
			const [, r, c] = st;
			for (let i = 0; i < 200; i++) {
				const p = P();
				if (p.y === r && p.x === c) break;
				g.movePlayer(p.y !== r ? (r > p.y ? 'down' : 'up') : (c > p.x ? 'right' : 'left'));
				g.step(1);
			}
		}
	}
	const p = P();
	return { y: p.y, x: p.x };
}, plan);
const ROUTE_SE = [['waitPsi', 'x>=', 8.5], ['go', 5, 10], ['go', 5, 6], ['go', 8, 6], ['wait', 60]];
const ROUTE_NW = [['waitPsi', 'x<=', 2.5], ['go', 5, 1], ['go', 5, 5], ['go', 1, 5], ['wait', 60]];

test.describe('D6 呪い火の野焼き ③ 実機', () => {
	test('入口に立つだけ・十字をまっすぐ抜けるだけでは檻しか燃えない（島は灯らない）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		const cases = [
			{ start: [4, 1], plan: [['wait', 200]] },
			{ start: [1, 5], plan: [['wait', 200]] },
			{ start: [4, 10], plan: [['wait', 200]] },
			{ start: [8, 5], plan: [['wait', 200]] },
			{ start: [4, 1], plan: [['wait', 20], ['go', 4, 10], ['wait', 100]] },
			{ start: [8, 6], plan: [['wait', 20], ['go', 1, 6], ['wait', 100]] },
		];
		for (const cs of cases) {
			await boot(page, ...cs.start);
			await run(page, cs.plan);
			const s = await state(page);
			expect([...s.cutBushes].sort(), `檻だけが燃える、でない（${JSON.stringify(cs)}）`).toEqual(PEN);
			expect(s.litTorches, `島に火が付いた（${JSON.stringify(cs)}）`).toEqual([]);
		}
		expect(errors).toEqual([]);
	});

	test('東の腕の先で待ち、南の腕の先へ走ると、ψ が池を斜めに横切って南東の島が燃え (8,10) が灯る', async ({ page }) => {
		await boot(page, 4, 10);
		await run(page, ROUTE_SE);
		const s = await state(page);
		expect(s.litTorches, '南東のかがり火が灯らない').toEqual([TORCH_SE]);
		expect(SE.every((k) => s.cutBushes.includes(k)), '南東の島が燃え切っていない').toBe(true);
		expect(NW.some((k) => s.cutBushes.includes(k)), '北西の島まで燃えた').toBe(false);
		expect(s.conditionsMet, '1本で宝箱が出た').not.toContain(CHEST);
	});

	test('西の腕の先で待ち、北の腕の先へ走ると、北西の島が燃え (1,1) が灯る', async ({ page }) => {
		await boot(page, 4, 1);
		await run(page, ROUTE_NW);
		const s = await state(page);
		expect(s.litTorches, '北西のかがり火が灯らない').toEqual([TORCH_NW]);
		expect(NW.every((k) => s.cutBushes.includes(k)), '北西の島が燃え切っていない').toBe(true);
	});

	test('2本灯ると宝箱が現れ、開けるとルピー +50', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, 4, 10);
		await run(page, [...ROUTE_SE, ['go', 5, 6], ['go', 5, 1], ['waitPsi', 'x<=', 2.5], ['go', 4, 1], ['go', 4, 5], ['go', 1, 5], ['wait', 60]]);
		const s = await state(page);
		expect([...s.litTorches].sort(), '2本灯らない').toEqual([TORCH_NW, TORCH_SE].sort());
		expect(s.conditionsMet, '2本灯っても宝箱が出ない').toContain(CHEST);
		const r0 = await page.evaluate(() => window.__game.getState().player.rupees);
		await run(page, [['go', 3, 5], ['go', 3, 6]]);
		await page.evaluate(() => { window.__game.movePlayer('right'); window.__game.step(2); });
		expect((await state(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await page.evaluate(() => window.__game.getState().player.rupees), 'ルピーが 50 増えない').toBe(r0 + 50);
		expect(errors).toEqual([]);
	});

	test('ロウソクは島に届かない（北の腕 (2,5) から西・南の腕 (7,6) から東へ使っても島は燃えない）', async ({ page }) => {
		await boot(page, 2, 5);
		// ψ を先に退ける（ψ に島を燃やさせない＝ロウソクだけを測る）
		await page.evaluate(() => { const g = window.__game; const e = g.getEnemies()[0]; g.dealDamage(e.id, 99, 'sword'); g.step(2); });
		const fire = (dir) => page.evaluate((d) => {
			const g = window.__game;
			g.setHeroDir(d);
			g.getPlayer().activeSubItem = 'candle';
			g.useSubItem();
			g.step(30);
		}, dir);
		await fire('left');
		await run(page, [['go', 5, 5], ['go', 5, 6], ['go', 7, 6]]);
		await fire('right');
		const s = await state(page);
		expect([...NW, ...SE].filter((k) => s.cutBushes.includes(k)), 'ロウソクで島の茂みが燃えた').toEqual([]);
		expect(s.litTorches).toEqual([]);
	});

	test('ψ を斬っても、部屋を出て入り直すと戻る（enemiesRespawn）', async ({ page }) => {
		await boot(page, 4, 1);
		await page.evaluate(() => { const g = window.__game; const e = g.getEnemies()[0]; g.dealDamage(e.id, 99, 'sword'); g.step(4); });
		expect(await page.evaluate(() => window.__game.getEnemies().length), 'ψ が倒れない').toBe(0);
		await page.evaluate(() => window.__game.resume?.());
		for (let i = 0; i < 6 && (await page.evaluate(() => window.__game.getState().stageKey)) === ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('left'));
			await page.waitForTimeout(150);
		}
		await page.waitForFunction(() => window.__game.getState().stageKey === '1,2', null, { timeout: 5000 });
		for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.getState().stageKey)) !== ROOM; i++) {
			await page.evaluate(() => window.__game.movePlayer('right'));
			await page.waitForTimeout(150);
		}
		await page.waitForFunction((rm) => window.__game.getState().stageKey === rm, ROOM, { timeout: 5000 });
		expect(await page.evaluate(() => window.__game.getEnemies().map((e) => e.type)), '入り直しても ψ が戻らない').toEqual([TILE.CURSE_FIRE]);
	});
});
