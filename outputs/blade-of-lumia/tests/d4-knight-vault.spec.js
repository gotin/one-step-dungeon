// tests/d4-knight-vault.spec.js
// dungeon_4 `4,0`「炉番の盾騎士」の番人
// （2026-10-25 / PLAN 実行キュー 92 の7室目・盤面は `scripts/migrate-d4-4-0-knight-vault.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   西の口だけが開いた行き止まりの真ん中に、床のルピー×5 が1つ落ちているだけ・敵なし。
//
// 新しい盤面:
//      1 #......#...#
//      2 #......#.B.#   ← 宝物庫（東・中は 3×8）の宝箱 (2,9)＝ルピー×20
//      3 #..ll..#...#
//      4 ...ll...ζ..#   ← 西の口／宝物庫の戸口 (4,7)（幅1）の内側に盾騎士 ζ (4,8)・西向き
//      5 ...ll..#...#
//      6 #..ll..#...#   ← 溶岩の池（2×4）。四辺の道はどれも幅2
//   戸口で正面から向き合うと弾かれて斬られる＝戸口の前で気づかせて広間へ引き出し、池を回って先に戸口へ。
//
// 守るものは3つ。
//   ① データ：盤面・宝箱・宝物庫の入口は戸口だけ（対照＝戸口を壁にすると届かない）・池の四辺は幅2・
//      敵と向き・脅威度・宣言・層の接続は不変。
//   ② 挙動（実機）：溶岩に踏み込めない／戸口の正面で剣を振っても騎士は無傷で、立ち止まると斬られる／
//      北の道に居る間、騎士は壁の内側から出てこない（戸口の行でしか出てこない）。
//   ③ 主題（実機）：戸口の前で気づかせて池を回ると、無傷で宝箱が開きルピー +20。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, ROWS, COLS, TARGET, CHEST, CHEST_CONTENT, DOOR, KNIGHT, KNIGHT_DIR, POOL, OPENING,
	reach, chestReachable,
} from '../scripts/migrate-d4-4-0-knight-vault.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const grid = room.tiles.map((row) => (Array.isArray(row) ? [...row] : String(row).split('')));
const at = (k) => { const [r, c] = k.split(',').map(Number); return grid[r][c]; };

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D4 炉番の盾騎士 ① データ', () => {
	test('盤面・宝箱は1つ（ルピー×20・最初から置いてある）・床の拾い物は無い', () => {
		expect(room.tiles.map(rowStr), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(grid.flat().filter((ch) => ch === TILE.CHEST).length, '宝箱が1つでない').toBe(1);
		expect(at(CHEST)).toBe(TILE.CHEST);
		expect(room.chestContents[CHEST]).toMatchObject({ type: 'rupee', value: CHEST_CONTENT.value });
		expect(room.showConditions ?? {}, '宝箱に出現条件が付いた').toEqual({});
		expect(room.floorItems ?? {}, '床の拾い物の記述が残っている').toEqual({});
	});

	test('宝物庫の入口は幅1の戸口だけ（対照：戸口を壁にすると宝箱に届かない）・取り残しなし', () => {
		const walk = reach(grid, OPENING);
		expect(chestReachable(grid, walk), '宝箱の隣まで歩けない').toBe(true);
		const [dr, dc] = DOOR.split(',').map(Number);
		expect(grid[dr - 1][dc] + grid[dr + 1][dc], '戸口が幅1でない').toBe('##');
		const shut = grid.map((row, r) => row.map((x, c) => (`${r},${c}` === DOOR ? TILE.WALL : x)));
		expect(chestReachable(shut, reach(shut, OPENING)), '対照：戸口を塞いでも宝箱に届く＝別の入口がある').toBe(false);
		const stranded = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const k = `${r},${c}`;
			if (!HARD_BLOCKED.has(grid[r][c]) && grid[r][c] !== TILE.CHEST && !walk.has(k)) stranded.push(k);
		}
		expect(stranded, '取り残された床がある').toEqual([]);
	});

	test('溶岩の池（2×4）の四辺の道はどれも幅2＝騎士がどの道に居ても横をすり抜けられる', () => {
		const walk = reach(grid, OPENING);
		expect(POOL.every((k) => at(k) === TILE.LAVA), '池が溶岩でない').toBe(true);
		const rs = POOL.map((k) => +k.split(',')[0]), cs = POOL.map((k) => +k.split(',')[1]);
		const [r0, r1, c0, c1] = [Math.min(...rs), Math.max(...rs), Math.min(...cs), Math.max(...cs)];
		const narrow = [];
		for (let c = c0 - 2; c <= c1 + 2; c++) for (const r of [r0 - 1, r0 - 2, r1 + 1, r1 + 2]) if (!walk.has(`${r},${c}`)) narrow.push(`${r},${c}`);
		for (let r = r0; r <= r1; r++) for (const c of [c0 - 1, c0 - 2, c1 + 1, c1 + 2]) if (!walk.has(`${r},${c}`)) narrow.push(`${r},${c}`);
		expect(narrow, '池の周りの道に幅1の所がある＝騎士がそこに居座ると戸口へ戻れない').toEqual([]);
	});

	test('敵は戸口の内側の ζ×1（西向き）・脅威度は看板部屋より軽い・宣言あり・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.SHIELD_KNIGHT}@${KNIGHT}`]);
		expect(room.enemyDirs, '騎士の向きが西でない＝戸口に正面が向かない').toEqual({ [KNIGHT]: KNIGHT_DIR });
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
		ps_weapon: '1', ps_hearts: '8', ...extra,   // D4 の想定（profilesAt の min＝ハート 8・木の剣）
	});
	return `${GAME}?${p.toString()}`;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
async function boot(page, url) {
	await page.goto(url);
	await waitForBoard(page);
	await page.keyboard.press('g');   // debugMode の無敵を切る＝被弾を測る
	await page.evaluate(() => window.__game.pause());
	await step(page, 2);
}
const pos = (page) => page.evaluate(() => { const { x, y } = window.__game.getState().player; return `${y},${x}`; });
// 半マスずつ、縦を先に合わせて目的のマスへ歩く（movePlayer 1回＝半マス）。歩いた間の最小 HP を返す。
async function walk(page, legs) {
	return page.evaluate((legs) => {
		const g = window.__game; let minHp = g.getState().player.hp;
		for (const [r, c] of legs) {
			for (let i = 0; i < 80; i++) {
				const p = g.getState().player;
				if (Math.abs(p.y - r) < 0.01 && Math.abs(p.x - c) < 0.01) break;
				g.movePlayer(Math.abs(p.y - r) > 0.01 ? (p.y < r ? 'down' : 'up') : (p.x < c ? 'right' : 'left'));
				g.step(1); minHp = Math.min(minHp, g.getState().player.hp);
			}
		}
		return minHp;
	}, legs);
}

test.describe('D4 炉番の盾騎士 ② 実機', () => {
	test('溶岩に踏み込めない（池の西 (4,2) から東へ歩いても岸に留まる）', async ({ page }) => {
		await boot(page, previewUrl(4, 2));
		for (let i = 0; i < 6; i++) { await page.evaluate(() => window.__game.movePlayer('right')); await step(page, 1); }
		expect(await pos(page), '溶岩の上へ歩けた').toBe('4,2');
	});

	test('戸口の正面で剣を振っても騎士は無傷・立ち止まると斬られる', async ({ page }) => {
		await boot(page, previewUrl(4, 6));
		const r = await page.evaluate(() => {
			const g = window.__game; g.setHeroDir('right');
			const k0 = g.getEnemies()[0].hp, hp0 = g.getState().player.hp; let swings = 0, near = 99;
			for (let i = 0; i < 60; i++) {
				if (i % 4 === 0) { g.swordAttack(); swings++; }   // 剣の間合いの冷却（約 0.4 秒）ごとに振る
				g.step(1);
				const e = g.getEnemies()[0]; const p = g.getState().player;
				near = Math.min(near, Math.hypot(e.x - p.x, e.y - p.y));
			}
			const e = g.getEnemies()[0];
			return { k0, k1: e.hp, hp0, hp1: g.getState().player.hp, swings, near, dir: e.blockDir ?? e.dir };
		});
		expect(r.swings, '前提：剣を振っていない').toBeGreaterThan(3);
		expect(r.near, '前提：騎士が戸口まで出てこない＝正面で向き合っていない').toBeLessThanOrEqual(1.5);
		expect(r.dir, '前提：騎士が西（戸口の外）を向いていない').toBe('left');
		expect(r.k1, '戸口の正面から斬って騎士の HP が減った＝向き合っても崩せてしまう').toBe(r.k0);
		expect(r.hp1, '戸口の正面に立ち止まっても斬られない＝罰が無い').toBeLessThan(r.hp0);
	});

	test('対照：宝物庫の中で背後 (4,9) から斬ると騎士の HP が減る（上の「無傷」は剣が振れていないせいではない）', async ({ page }) => {
		await boot(page, previewUrl(4, 9));
		const r = await page.evaluate(() => {
			const g = window.__game; g.setHeroDir('left');
			const e0 = g.getEnemies()[0]; const k0 = e0.hp, dir0 = e0.blockDir ?? e0.dir;
			g.swordAttack(); g.step(2);
			return { k0, k1: g.getEnemies()[0].hp, dir0 };
		});
		expect(r.dir0, '前提：騎士が西を向いていない＝勇者が背後に居ない').toBe('left');
		expect(r.k1, '背後から斬っても減らない＝正面の測定が空虚').toBeLessThan(r.k0);
	});

	test('北の道に居る間、騎士は壁の内側から出てこない（出てくるのは戸口の行だけ）', async ({ page }) => {
		await boot(page, previewUrl(2, 6));
		const r = await page.evaluate(() => {
			const g = window.__game; let minX = 99, minDist = 99;
			for (let i = 0; i < 200; i++) {
				g.step(1);
				const e = g.getEnemies()[0]; const p = g.getState().player;
				minX = Math.min(minX, e.x); minDist = Math.min(minDist, Math.hypot(e.x - p.x, e.y - p.y));
			}
			return { minX, minDist };
		});
		expect(r.minDist, '前提：騎士が勇者に気づける距離に来ていない').toBeLessThanOrEqual(4);
		// 宝物庫の西の壁は列7。騎士の体が列7 に半分でも入ったら（x < 7.5）壁の切れ目から出てきている
		// （歯の確認で北の壁 (2,7) を床にすると x=7＝勇者の隣で止まる∴「≥ 7」では見分けられなかった）。
		expect(r.minX, '北の道に立っているだけで騎士が宝物庫から出てきた').toBeGreaterThanOrEqual(7.5);
	});
});

test.describe('D4 炉番の盾騎士 ③ 主題', () => {
	test('通し：戸口の前で気づかせて池を回ると、無傷で宝箱が開きルピー +20', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(4, 1));
		const rupees0 = await page.evaluate(() => window.__game.getState().player.rupees);
		const hp0 = await page.evaluate(() => window.__game.getState().player.hp);
		// 北の道を回って戸口の行 (4,5) へ＝騎士が気づいて戸口から出てくる
		let minHp = await walk(page, [[2, 1], [2, 5], [4, 5]]);
		// 騎士が戸口まで出てくるのを待つ（宝物庫の奥をさまよっている間は気づかない＝実測 0〜56 tick
		// ＝`.scratch/q92/probe-4-0f.mjs` 10 回。上限 120 tick＝約 15 秒）。出てきたらすぐ離れる＝正面で待ち続けない。
		const waited = await page.evaluate(() => {
			const g = window.__game; let i = 0, minHp = g.getState().player.hp;
			// 体が半分でも戸口に入れば（x ≤ 7.5）出てくる途中＝離れてよい（負荷の高いフルで 1/135 回、
			// 7.5 で 120 tick 止まった＝寄る向きの判断が実時間の間合いを持つ）。
			for (; i < 120 && g.getEnemies()[0].x > 7.5; i++) { g.step(1); minHp = Math.min(minHp, g.getState().player.hp); }
			const e = g.getEnemies()[0]; const p = g.getState().player;
			return { i, x: e.x, minHp, dbg: `k${e.y},${e.x} p${p.y},${p.x} noticed=${e.noticed} acc=${e.accum} pause=${e.roamPauseUntil} tgt=${JSON.stringify(e.roamTarget)} dir=${e.dir}/${e.blockDir}` };
		});
		minHp = Math.min(minHp, waited.minHp);
		expect(waited.x, `前提：戸口の行に ${waited.i} tick 立っても騎士が戸口へ寄ってこない（${waited.dbg}）`).toBeLessThanOrEqual(7.5);
		// すぐ北→西→南→東と池を回り、東の道を上って戸口へ。宝物庫の中を北へ回って宝箱へ
		minHp = Math.min(minHp, await walk(page, [[2, 5], [2, 1], [8, 1], [8, 6], [4, 6], [4, 7], [4, 8], [3, 8], [3, 9], [2, 9]]));
		expect(await pos(page), '宝箱まで歩けない').toBe(CHEST);
		expect(await page.evaluate(() => window.__game.getStageState().openedChests), '宝箱が開かない').toContain(CHEST);
		const rupees1 = await page.evaluate(() => window.__game.getState().player.rupees);
		expect(rupees1 - rupees0, 'ルピーが 20 増えない').toBe(CHEST_CONTENT.value);
		expect(minHp, '池を回って先回りしたのに斬られた＝騎士が戸口へ先に戻れる').toBe(hp0);
		const e = await page.evaluate(() => { const e = window.__game.getEnemies()[0]; return { x: e.x, y: e.y }; });
		expect(e.x, '前提：騎士が広間に出ていない＝おびき出しが起きていない').toBeLessThan(7);
		expect(errors).toEqual([]);
	});
});
