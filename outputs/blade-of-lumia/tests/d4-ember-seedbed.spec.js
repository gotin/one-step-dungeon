// tests/d4-ember-seedbed.spec.js
// dungeon_4 `0,2`「熾火の苗床」の番人
// （2026-10-25 / PLAN 実行キュー 92 の9室目・盤面は `scripts/migrate-d4-0-2-ember-seedbed.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   北の口だけが開いた行き止まりの真ん中に、宝箱（ルピー×5）が置いてあるだけ・敵なし。
//
// 新しい盤面:
//      1 #i.........#   ← 看板「熾火の 苗床」
//      2 #llll..llll#
//      3 #.δ........#   ← 畝（幅1・上下は溶岩）
//      4 #llll..llll#
//      5 #........δ.#
//      6 #llll..llll#
//      7 #.δ........#
//      8 #llll.Bllll#   ← 背骨（列5-6）の突き当たりの宝箱＝全滅で出る
//   分裂スライム δ は斬ると親のマスとその隣に子を2体生む。畝にロウソクの炎を並べて踏ませると、
//   親は炎で倒れ、子は炎の上に生まれて燃え尽きる。
//
// 守るものは3つ。
//   ① データ：盤面・宝箱（killAll）・看板・畝は幅1・敵と脅威度・宣言・層の接続は不変。
//   ② 挙動（実機）：溶岩に踏み込めない／剣で斬ると δ は2体に分かれる（主題の前提＝増える敵）。
//   ③ 主題（実機）：畝に炎を3つ並べると、剣を振らず無傷のまま、親も子も燃え尽きる／全滅で宝箱が出て +20。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, ROWS, COLS, TARGET, CHEST, CHEST_CONTENT, SIGN, SLIMES, LANES, SPINE, OPENING,
	reach, chestReachable,
} from '../scripts/migrate-d4-0-2-ember-seedbed.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));
const at = (k) => { const [r, c] = k.split(',').map(Number); return grid[r][c]; };

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D4 熾火の苗床 ① データ', () => {
	test('盤面・宝箱は1つ（ルピー×20・全滅で出る）・看板に本文・床の拾い物は無い', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(grid.flat().filter((ch) => ch === TILE.CHEST).length, '宝箱が1つでない').toBe(1);
		expect(at(CHEST)).toBe(TILE.CHEST);
		expect(room.chestContents[CHEST]).toMatchObject({ type: 'rupee', value: CHEST_CONTENT.value });
		expect(room.showConditions, '宝箱が全滅で出る形でない').toEqual({ [CHEST]: { trigger: 'killAll' } });
		expect(at(SIGN)).toBe(TILE.SIGN);
		expect(Array.isArray(room.signData?.[SIGN]?.lines) && room.signData[SIGN].lines.length > 0,
			'看板が {name, lines} の形でない＝無言看板になる').toBe(true);
		expect(room.floorItems ?? {}, '床の拾い物の記述が残っている').toEqual({});
	});

	test('取り残しなし・宝箱の隣まで歩ける', () => {
		const walk = reach(grid, OPENING);
		expect(chestReachable(grid, walk), '宝箱の隣まで歩けない').toBe(true);
		const stranded = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const k = `${r},${c}`;
			if (!HARD_BLOCKED.has(grid[r][c]) && grid[r][c] !== TILE.CHEST && grid[r][c] !== TILE.SIGN && !walk.has(k)) stranded.push(k);
		}
		expect(stranded, '取り残された床がある').toEqual([]);
	});

	test('畝は背骨の外で幅1（上下とも溶岩）＝子の生まれる先が東西に絞られる', () => {
		const wide = [];
		for (const r of LANES) for (let c = 1; c < COLS - 1; c++) {
			if (SPINE.includes(c) || grid[r][c] === TILE.WALL) continue;
			if (grid[r - 1][c] !== TILE.LAVA || grid[r + 1][c] !== TILE.LAVA) wide.push(`${r},${c}`);
		}
		expect(wide, '畝に幅2の所がある＝子が上下にも生まれて炎を避ける').toEqual([]);
	});

	test('敵は畝の δ×3・脅威度は看板部屋より軽い・宣言あり・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual(SLIMES.map((k) => `${TILE.SPLIT_SLIME}@${k}`));
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['2,3'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ②③ 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '8', ps_candle: '1', ...extra,   // D4 の想定（ハート 8・木の剣）＋ロウソクの後に来る部屋
	});
	return `${GAME}?${p.toString()}`;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
async function boot(page, url, { mortal = true } = {}) {
	await page.goto(url);
	await waitForBoard(page);
	if (mortal) await page.keyboard.press('g');   // debugMode の無敵を切る＝被弾を測る
	await page.evaluate(() => window.__game.pause());
	await step(page, 2);
}
const pos = (page) => page.evaluate(() => { const { x, y } = window.__game.getState().player; return `${y},${x}`; });

// 半マスずつ、縦を先に合わせて目的の座標へ歩く（movePlayer 1回＝半マス）。page.evaluate の中で使う。
const WALK_SRC = `(g, r, c, onTick) => {
	for (let i = 0; i < 80; i++) {
		const p = g.getState().player;
		if (Math.abs(p.y - r) < 0.01 && Math.abs(p.x - c) < 0.01) return true;
		g.movePlayer(Math.abs(p.y - r) > 0.01 ? (p.y < r ? 'down' : 'up') : (p.x < c ? 'right' : 'left'));
		g.step(1); onTick?.();
	}
	return false;
}`;

test.describe('D4 熾火の苗床 ② 実機', () => {
	test('溶岩に踏み込めない（畝 (3,1) から北へ歩いても畝に留まる）', async ({ page }) => {
		await boot(page, previewUrl(3, 1));
		for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__game.movePlayer('up')); await step(page, 1); }
		expect(await pos(page), '溶岩の上へ歩けた').toBe('3,1');
	});

	test('剣で斬ると δ は2体に分かれる（主題の前提＝増える敵）', async ({ page }) => {
		await boot(page, previewUrl(3, 5));
		const r = await page.evaluate((src) => {
			const g = window.__game; const walk = eval(src);
			walk(g, 3, 4.5);
			let maxKids = 0, swings = 0;
			for (let i = 0; i < 160; i++) {
				const p = g.getState().player;
				const near = g.getEnemies().find((e) => Math.round(e.y) === 3 && e.x < p.x && p.x - e.x < 1.6);
				if (near && i % 4 === 0) { g.setHeroDir('left'); g.swordAttack(); swings++; }
				g.step(1);
				maxKids = Math.max(maxKids, g.getEnemies().filter((e) => String(e.id).startsWith('3,2#')).length);
			}
			return { maxKids, swings };
		}, WALK_SRC);
		expect(r.swings, '前提：δ が寄ってこない＝剣を振っていない').toBeGreaterThan(0);
		expect(r.maxKids, '斬っても δ が分かれない＝炎で子を焼く主題が無い').toBe(2);
	});
});

test.describe('D4 熾火の苗床 ③ 主題', () => {
	test('畝に炎を3つ並べると、剣を振らず無傷のまま親も子も燃え尽きる', async ({ page }) => {
		await boot(page, previewUrl(3, 5));
		const r = await page.evaluate((src) => {
			const g = window.__game; const walk = eval(src);
			const hp0 = g.getState().player.hp; let minHp = hp0;
			// 被弾は畝3 の δ（親か子）が残っている間だけ数える＝他の畝の δ が背骨へ出てきて当たった分は主題の外。
			const laneAlive = () => g.getEnemies().some((e) => String(e.id).startsWith('3,2'));
			const onTick = () => { if (laneAlive()) minHp = Math.min(minHp, g.getState().player.hp); };
			let burned = 0;
			const sumBurn = () => { burned = Math.max(burned, g.getPlacedFlames().reduce((a, f) => a + f.burnedCount, 0)); };
			// 西を向いたまま (3,3)・(3,4)・(3,5) と炎を置きながら背骨の東 (3,6) へ下がる。
			// 子は「親のマス→東→西」の順に生まれる（combat.js pickSplitCells）∴親が倒れる (3,4) の東 (3,5) まで燃やしておく。
			walk(g, 3, 4, onTick); g.setHeroDir('left'); g.useSubItem(); sumBurn();
			walk(g, 3, 5, onTick); g.setHeroDir('left'); g.useSubItem(); sumBurn();
			walk(g, 3, 6, onTick); g.setHeroDir('left'); g.useSubItem(); sumBurn();
			const flames = g.getPlacedFlames().length;
			for (let i = 0; i < 60; i++) { g.step(1); onTick(); sumBurn(); }
			const lane = g.getEnemies().filter((e) => String(e.id).startsWith('3,2')).length;
			return { flames, burned, lane, minHp, hp0, defeated: g.getDefeatedEnemies('dungeon_4', '0,2') };
		}, WALK_SRC);
		expect(r.flames, '前提：炎が3つ置けていない').toBe(3);
		expect(r.lane, '炎を並べても畝の δ（親か子）が残った').toBe(0);
		// 親は hp 4＝炎 3 を2回で倒れる∴焼いた回数が3以上＝少なくとも子が1体、炎の上で焼けた。
		// 残りが0（上）と合わせて＝剣を振らずに子が2体とも燃えた。
		expect(r.burned, '炎が焼いたのが親だけ＝子が炎の上に生まれていない').toBeGreaterThanOrEqual(3);
		expect(r.minHp, '炎だけで片付けたのに、畝の δ が残っている間に被弾した').toBe(r.hp0);
		expect(r.defeated, '撃破の記録が親の posKey に残らない＝部屋を出ると復活する').toContain('3,2');
	});

	test('通し：δ を3体とも片付けると宝箱が出て、開けるとルピー +20', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		// 通しで測るのは「全滅→宝箱→+20」＝被弾は測らない（無敵のまま＝狩りの手順が被弾で崩れない）。
		await boot(page, previewUrl(1, 5), { mortal: false });
		expect((await page.evaluate(() => window.__game.getStageState().conditionsMet)), '前提：宝箱が最初から出ている').not.toContain(CHEST);
		const r = await page.evaluate((src) => {
			const g = window.__game; const walk = eval(src);
			// 1体ずつ：その δ の行の背骨へ下り、畝を詰めて剣で斬る（子も同じ畝に生まれる）。
			let ticks = 0;
			for (let round = 0; round < 40 && g.getEnemies().length; round++) {
				const p0 = g.getState().player;
				const e = [...g.getEnemies()].sort((a, b) => Math.hypot(a.x - p0.x, a.y - p0.y) - Math.hypot(b.x - p0.x, b.y - p0.y))[0];
				const er = Math.round(e.y);
				walk(g, p0.y, Math.min(6, Math.max(5, Math.round(p0.x))));   // 背骨へ
				walk(g, er, Math.min(6, Math.max(5, Math.round(g.getState().player.x))));
				for (let i = 0; i < 60; i++, ticks++) {
					const cur = g.getEnemies().find((x) => x.id === e.id);   // getEnemies はスナップショット＝id で引き直す
					if (!cur) break;
					const p = g.getState().player; const dx = cur.x - p.x, dy = cur.y - p.y;
					if (Math.hypot(dx, dy) < 1.3) {
						g.setHeroDir(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
						if (i % 4 === 0) g.swordAttack();
					} else if (Math.abs(dy) < 0.6) g.movePlayer(dx < 0 ? 'left' : 'right');
					else g.movePlayer(dy < 0 ? 'up' : 'down');
					g.step(1);
				}
			}
			g.step(2);
			return { left: g.getEnemies().length, ticks };
		}, WALK_SRC);
		expect(r.left, `δ が片付かない（${r.ticks} tick）`).toBe(0);
		expect((await page.evaluate(() => window.__game.getStageState().conditionsMet)), '全滅しても宝箱が出ない').toContain(CHEST);
		// 宝箱の手前 (7,6) まで歩いてから数える（畝の中に居たら、同じ行のまま背骨の列6 へ出てから下る）＝倒した δ が落としたルピーを途中で拾っても混ざらない。
		await page.evaluate((src) => { const g = window.__game; const walk = eval(src); walk(g, g.getState().player.y, 6); walk(g, 7, 6); }, WALK_SRC);   // 畝から背骨へ出てから下る（縦を先に合わせると溶岩に阻まれる）
		const rupees0 = await page.evaluate(() => window.__game.getState().player.rupees);
		await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 4; i++) { g.movePlayer('down'); g.step(1); } });
		expect((await page.evaluate(() => window.__game.getStageState().openedChests)), '宝箱が開かない').toContain(CHEST);
		const rupees1 = await page.evaluate(() => window.__game.getState().player.rupees);
		expect(rupees1 - rupees0, 'ルピーが 20 増えない').toBe(20);
		expect(errors).toEqual([]);
	});
});
