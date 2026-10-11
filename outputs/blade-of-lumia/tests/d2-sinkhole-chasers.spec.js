// tests/d2-sinkhole-chasers.spec.js
// dungeon_2 `2,3`（入口の東の通り道）「流砂の大穴と追い手」の番人
// （2026-10-10 / PLAN 実行キュー 41 の第3陣 2室目・盤面は `scripts/migrate-d2-2-3-sinkhole-chasers.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間に巡回兵 E と追跡者 C が1体ずつ＝床と雑魚だけ。
//
// 新しい盤面（真ん中に砂の流れ落ちた歪な大穴・岸が一周する）:
//      1 #..........#   ← 北の岸
//      2 #...xxxx...#
//      3 #..xxxxxxx.#
//      4 ...xxxxxxx..   ← 西の口／東の口
//      5 ....xxxxx...
//      6 #....xxx...#
//      7 #.....C....#   ← 追跡者 C×1（南の岸）
//      8 #.........B#   ← 宝箱（条件なし）
//   C はまっすぐ寄るだけで穴を回り込まない＝向こう岸に立つと岸で足止めされる。
//
// 守るものは2つ。
//   ① データ（幾何）：大穴が南の岸と北の岸を真っすぐには結ばない・岸が一周する・層の到達性。
//   ② 挙動（実機）：北の岸に立つと C は南に足止めされる（対照＝西の口に立てば寄られる）／北の岸を回れば C を西の縁に
//      置き去りにしたまま宝箱を開けられる／ブーメランなら北の岸から穴越しに無傷で倒せる。
//   ⚠️ 大穴が C を止めるのは「プレイヤーが向こう岸に居る間」だけ＝南の岸で留まれば C は岸を回って追いつく（実測）。
//      C の足はプレイヤーの半分＝走り続ければ南の岸でも振り切れる。∴「南を通ると必ず削られる」は主張しない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { TARGET, CHEST, CHEST_CONTENT, targetBg, reach, pitsOf } from '../scripts/migrate-d2-2-3-sinkhole-chasers.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_2';
const ROOM = '2,3';
const stages = map.layers[LAYER].stages;

const P = (k) => k.split(',').map(Number);
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const cellsOf = (t, pred) => {
	const out = [];
	t.forEach((row, r) => row.forEach((ch, c) => { if (pred(ch)) out.push(`${r},${c}`); }));
	return out;
};
// 列 c で、行 r0 から真上へ北の岸（行1）まで進む線が穴で切れているか。
const cutUpward = (t, r0, c) => { for (let r = r0 - 1; r >= 1; r--) if (t[r][c] === TILE.PIT) return true; return false; };

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D2 2,3 流砂の大穴と追い手 ① データ', () => {
	test('盤面・敵は追跡者 C×1・脅威度は看板部屋より軽い・宝箱は条件なし・宣言', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		const enemies = cellsOf(t, (ch) => !!ENEMY_META[ch]).map((k) => t[P(k)[0]][P(k)[1]]);
		expect(enemies, '敵が追跡者1体でない').toEqual([TILE.CHASER]);
		const threat = stageThreat(st, ENEMY_META);
		expect(threat).toBeGreaterThan(0);
		expect(threat, '看板部屋 2,1 の 25.0 を超えた').toBeLessThan(25);
		expect(st.chestContents).toEqual({ [CHEST]: CHEST_CONTENT });
		expect(Object.keys(st.showConditions ?? {}), '宝箱に出現条件が付いた（初めから見えているはず）').toEqual([]);
		for (const k of ['signData', 'floorItems', 'mapEnters', 'npcData', 'breakableWalls']) expect(Object.keys(st[k] ?? {}), `${k} が空でない`).toEqual([]);
		expect(st.links ?? [], 'links が空でない').toEqual([]);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS の宣言').toBe(true);
	});

	test('下地：床は全部砂・穴と壁には置かない（盤面から引く）', () => {
		expect(stages[ROOM].bgTiles).toEqual(targetBg(rowsOf(stages[ROOM])));
		const t = gridOf();
		for (const k of pitsOf(t)) expect(stages[ROOM].bgTiles[k], `穴 ${k} に下地がある`).toBeUndefined();
	});

	test('大穴：C の居る列は北の岸まで穴で切れている・岸は一周する（C の位置は盤面から引く）', () => {
		const t = gridOf();
		const [cr, cc] = P(cellsOf(t, (ch) => ch === TILE.CHASER)[0]);
		expect(cutUpward(t, cr, cc), 'C の真上が北の岸まで穴で切れていない').toBe(true);
		const pits = pitsOf(t);
		const touchesWall = pits.some((k) => { const [r, c] = P(k); return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => t[r + dr]?.[c + dc] === TILE.WALL); });
		expect(touchesWall, '穴が外周の壁に接している＝岸が一周しない').toBe(false);
		const foot = reach(t);
		const floors = cellsOf(t, (ch) => ch !== TILE.WALL && ch !== TILE.PIT && ch !== TILE.CHEST);
		for (const k of floors) expect(foot.has(k), `${k} に歩いて立てない`).toBe(true);
	});

	test('対照：穴を床にすると C の列は北の岸まで真っすぐつながる（測定が空虚でない）', () => {
		const t = gridOf();
		const [cr, cc] = P(cellsOf(t, (ch) => ch === TILE.CHASER)[0]);
		const filled = t.map((row) => row.map((ch) => (ch === TILE.PIT ? TILE.FLOOR : ch)));
		expect(cutUpward(filled, cr, cc)).toBe(false);
	});

	test('層の接続：dead-edge 0・徒歩で 15 室（書き換え前と同じ）', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(foot.reachedRooms.size, '徒歩で歩ける部屋数').toBe(15);
		for (const k of ['1,3', '2,3', '2,2', '3,3']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '3', ps_shield: '1', ...extra });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 1);
	await page.keyboard.press('g');   // fromEditor の無敵を切る（被弾を測る）
	await page.evaluate(() => {
		const g = window.__game;
		g.pause();
		// 通る点（セル）を順に歩く。1 tick に半マス。着いたら次の点へ。
		window.__walk = (wp, maxT = 200) => {
			const q = wp.map(([r, c]) => ({ r, c }));
			let i = 0;
			for (; i < maxT && q.length; i++) {
				const pl = g.getPlayer();
				const dy = q[0].r - pl.y, dx = q[0].c - pl.x;
				if (Math.abs(dy) < 0.01 && Math.abs(dx) < 0.01) { q.shift(); continue; }
				g.movePlayer(Math.abs(dx) >= 0.01 ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
				g.step(1);
			}
			return q.length === 0;
		};
	});
	return errors;
}

test.describe('D2 2,3 流砂の大穴と追い手 ② 実機', () => {
	test('北の岸に立つと C は南の岸に足止めされて寄れない／対照＝西の口に立てば寄られて HP が減る', async ({ page }) => {
		const errors = await boot(page, 0, 6);
		const north = await page.evaluate(() => {
			const g = window.__game;
			window.__walk([[1, 6]]);
			const hp0 = g.getPlayer().hp;
			let minY = Infinity;
			for (let i = 0; i < 200; i++) { g.step(1); for (const e of g.getEnemies()) minY = Math.min(minY, e.y); }
			return { hp0, hp1: g.getPlayer().hp, minY, left: g.getEnemies().length };
		});
		expect(north.left, 'C が居ない＝測定が空虚').toBe(1);
		expect(north.hp1, '北の岸に立っているのに削られた').toBe(north.hp0);
		expect(north.minY, 'C が南の岸から北へ上がってきた（穴を回り込んだ）').toBeGreaterThanOrEqual(6);
		const errors2 = await boot(page, 4, 0);
		const west = await page.evaluate(() => {
			const g = window.__game;
			window.__walk([[4, 1]]);
			const hp0 = g.getPlayer().hp;
			for (let i = 0; i < 150; i++) g.step(1);
			return { hp0, hp1: g.getPlayer().hp };
		});
		expect(west.hp1, '西の口に立っても C に寄られない＝C が動いていない（足止めの測定が空虚）').toBeLessThan(west.hp0);
		expect(errors).toEqual([]);
		expect(errors2).toEqual([]);
	});

	test('西の口から北の岸を回れば、C を西の縁に置き去りにしたまま宝箱まで行けて、条件なしで開く', async ({ page }) => {
		const errors = await boot(page, 4, 0);
		const r = await page.evaluate(() => {
			const g = window.__game;
			const hp0 = g.getPlayer().hp, rupees0 = g.getPlayer().rupees;
			const arrived = window.__walk([[4, 1], [1, 1], [1, 10], [4, 10], [7, 10]]);
			for (let i = 0; i < 4; i++) { g.movePlayer('down'); g.step(1); }   // 宝箱 (8,10) へ体当たり
			const e = g.getEnemies()[0];
			return { arrived, hp0, hp1: g.getPlayer().hp, gained: g.getPlayer().rupees - rupees0,
				opened: [...g.getStageState().openedChests], ex: e?.x ?? null };
		});
		expect(r.arrived, '北の岸を回って宝箱の前まで歩けない').toBe(true);
		expect(r.hp1, '北の岸を回ったのに宝箱を開けるまでに削られた').toBe(r.hp0);
		expect(r.opened, '宝箱が開いていない').toContain(CHEST);
		expect(r.gained, '宝箱の中身').toBe(CHEST_CONTENT.value);
		expect(r.ex, 'C が西の縁に残っていない（追ってきた）').not.toBeNull();
		expect(r.ex, 'C が西の縁に残っていない（追ってきた）').toBeLessThan(5);
		expect(errors).toEqual([]);
	});

	test('ブーメランなら北の岸から穴越しに投げて、無傷で C を倒せる（西寄りへ上がって縁へ寄せる）', async ({ page }) => {
		const errors = await boot(page, 4, 0, { ps_boomerang: '1' });
		const r = await page.evaluate(() => {
			const g = window.__game;
			const hp0 = g.getPlayer().hp;
			window.__walk([[4, 1], [1, 1], [1, 3]]);
			let throws = 0, crossed = false;
			for (let i = 0; i < 300 && g.getEnemies().length; i++) {
				const pl = g.getPlayer(), e = g.getEnemies()[0];
				const flying = g.getProjectiles().some((x) => x.owner === 'player');
				if (!flying && Math.abs(e.x - pl.x) < 0.5 && e.y - pl.y <= 5) { g.setHeroDir('down'); g.useSubItem(); throws++; }
				else if (!flying && Math.abs(e.x - pl.x) >= 0.5) g.movePlayer(e.x > pl.x ? 'right' : 'left');
				g.step(1);
				for (const pr of g.getProjectiles()) if (pr.owner === 'player' && pr.y > 2.5 && pr.y < 5.5) crossed = true;
			}
			const pl = g.getPlayer();
			return { hp0, hp1: pl.hp, left: g.getEnemies().length, throws, crossed, y: pl.y };
		});
		expect(r.crossed, 'ブーメランが穴の上を飛んでいない＝測定が空虚').toBe(true);
		expect(r.left, 'ブーメランで C を倒せない').toBe(0);
		expect(r.hp1, '北の岸から投げているのに削られた').toBe(r.hp0);
		expect(r.y, '北の岸から離れて戦った').toBeLessThan(1.5);
		expect(r.throws, '投げた回数が多すぎる').toBeLessThanOrEqual(8);
		expect(errors).toEqual([]);
	});
});
