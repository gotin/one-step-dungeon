// tests/d1-spider-fence.spec.js
// dungeon_1 `3,1`（紋章の部屋 `2,1` の東の行き止まり）「石の柵と跳躍蜘蛛」の番人
// （2026-10-12 / PLAN 実行キュー 47 の第1陣 5室目・盤面は `scripts/migrate-d1-3-1-spider-fence.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間の真ん中の床にコンパスが落ちているだけ・敵なし（キュー21 の F6）。
//
// 新しい盤面:
//      1 #....#.....#
//      2 #..........#   ← 柵の切れ目（北）
//      3 #....#.....#
//      4 .....#..β..#   ← 西の口／跳躍蜘蛛
//      5 .....#.....#
//      6 #....#.....#
//      7 #..........#   ← 柵の切れ目（南）
//      8 #....#....n#   ← コンパス
//
// 守るものは2つ。
//   ① データ（幾何）：β×1・脅威度・コンパスの位置・柵を越えるのは切れ目だけ（柱の行では跳んでも 0 マス）・層の到達性。
//   ② 挙動（実機）：柵の内側に立つと、蜘蛛は柵の前で跳んでは柱にぶつかり、越えてこない（溜めを安全に見られる）／
//      切れ目のそばに立つと切れ目から来る（柵が守るのは柱の陰だけ）／切れ目から回り込めば木の剣・ハート3つで勝てる／
//      コンパスを拾える。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET, ENTRY, SPIDER, FENCE, FENCE_COL, GAPS, COMPASS, LEAP, SIGNATURE_THREAT, reach, leapCells,
} from '../scripts/migrate-d1-3-1-spider-fence.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_1';
const ROOM = '3,1';
const stages = map.layers[LAYER].stages;

const P = (k) => k.split(',').map(Number);
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const cellsOf = (t, pred) => {
	const out = [];
	t.forEach((row, r) => row.forEach((ch, c) => { if (pred(ch)) out.push(`${r},${c}`); }));
	return out;
};

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D1 3,1 石の柵と跳躍蜘蛛 ① データ', () => {
	test('盤面・敵は β×1・脅威度は看板部屋 1,1 を超えない・コンパスは東の奥の隅・宣言', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		const enemies = cellsOf(t, (ch) => !!ENEMY_META[ch]).map((k) => `${t[P(k)[0]][P(k)[1]]}@${k}`);
		expect(enemies, '敵は跳躍蜘蛛 1体だけ').toEqual([`${TILE.LEAP_SPIDER}@${SPIDER}`]);
		expect(stageThreat(st, ENEMY_META), '看板部屋 1,1 を超えた').toBeLessThanOrEqual(SIGNATURE_THREAT);
		expect(cellsOf(t, (ch) => ch === TILE.ITEM_COMPASS), 'コンパスの位置').toEqual([COMPASS]);
		for (const k of ['signData', 'floorItems', 'mapEnters', 'chestContents', 'showConditions', 'bgTiles']) {
			expect(Object.keys(st[k] ?? {}), `${k} が空でない`).toEqual([]);
		}
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS の宣言').toBe(true);
	});

	test('柵：越えるのは切れ目だけ（両方切るとコンパスへ届かない）・柱の行では西へ跳んでも 0 マス、切れ目の行では 3 マス', () => {
		const t = gridOf();
		for (const k of FENCE) expect(t[P(k)[0]][P(k)[1]], `柱 ${k}`).toBe(TILE.WALL);
		expect(reach(t).has(COMPASS), '切らなくてもコンパスへ届かない＝測定が空虚').toBe(true);
		expect(reach(t, ENTRY, new Set(GAPS)).has(COMPASS), '切れ目を通らずにコンパスへ届く').toBe(false);
		for (const k of FENCE) {
			expect(leapCells(t, `${P(k)[0]},${FENCE_COL + 1}`, [0, -1]), `柵の前 行${P(k)[0]} から西へ跳ぶと柱を越える`).toBe(0);
		}
		for (const g of GAPS) {
			expect(leapCells(t, `${P(g)[0]},${FENCE_COL + 1}`, [0, -1]), `切れ目の行 ${P(g)[0]} で跳べない＝対照が空虚`).toBe(LEAP.cells);
		}
	});

	test('層の接続：dead-edge 0・徒歩で 15 室（書き換え前と同じ）', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(foot.reachedRooms.size, '徒歩で歩ける部屋数').toBe(15);
		for (const k of ['2,1', '3,1']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
// ⚠ プレビューは debugMode:true＝被弾しない・isPassable が無条件 true∴HP と通行を測る本は 'g' で debug を切る。
const GAME = '/blade-of-lumia/game/';
async function boot(page, { row, col }) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '3' });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 1);
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// n tick 立ち止まる（剣は振らない）。蜘蛛の一番西の列・溜めの回数・その場で落ちた跳躍（滞空の前後で動かない）・被弾を返す。
const stand = (page, n) => page.evaluate((n) => {
	const g = window.__game;
	const hp0 = g.getState().player.hp;
	let minX = 99, windups = 0, stuck = 0, prev = null, airFrom = null;
	for (let i = 0; i < n; i++) {
		g.step(1);
		const e = g.getEnemies()[0];
		if (!e) break;
		minX = Math.min(minX, e.x);
		if (e.leapPhase === 'windup' && prev !== 'windup') { windups++; airFrom = `${e.y},${e.x}`; }
		if (e.leapPhase === 'recover' && prev !== 'recover' && airFrom === `${e.y},${e.x}`) stuck++;
		prev = e.leapPhase;
	}
	return { lost: hp0 - g.getState().player.hp, minX, windups, stuck };
}, n);

test.describe('D1 3,1 石の柵と跳躍蜘蛛 ② 実機', () => {
	test('柵の内側 (4,3) に立つと、蜘蛛は柵の前で跳んでは柱にぶつかり、越えてこない（溜めを安全に見られる）', async ({ page }) => {
		const errors = await boot(page, { row: 4, col: 3 });
		// 実測＝150 tick（18 秒）で溜め 11 回・蜘蛛は列6 から西へ出ない・被弾 0。
		const r = await stand(page, 150);
		expect(r.minX, '蜘蛛が柵を越えて西の広間へ来た').toBeGreaterThanOrEqual(FENCE_COL + 1);
		expect(r.windups, '柵の前で溜めを見せない').toBeGreaterThanOrEqual(5);
		expect(r.stuck, '跳んでも柱にぶつかってその場に落ちる、が起きていない').toBeGreaterThanOrEqual(3);
		expect(r.lost, '柵の内側で削られた').toBe(0);
		expect(errors).toEqual([]);
	});

	test('対照：南の切れ目のそば (7,3) に立つと、蜘蛛は切れ目から西の広間へ来る（柵が守るのは柱の陰だけ）', async ({ page }) => {
		const errors = await boot(page, { row: 7, col: 3 });
		const r = await stand(page, 100);
		expect(r.minX, '切れ目のそばでも蜘蛛が来ない＝柵の比較が空虚').toBeLessThan(FENCE_COL);
		expect(errors).toEqual([]);
	});

	test('北の切れ目から回り込めば、木の剣・ハート3つ・盾なしで倒れずに勝ち、コンパスを拾える', async ({ page }) => {
		const errors = await boot(page, { row: 4, col: 0 });
		// 実測＝(4,3)→(2,3)→(2,6) へ回って隣に来たら斬る＝被弾 1（2）・41 tick で撃破。
		const r = await page.evaluate(() => {
			const g = window.__game;
			const wps = [[4, 3], [2, 3], [2, 6]];
			const keys = ['up', 'down', 'left', 'right'];
			const hold = (k) => { for (const o of keys) if (o !== k) g.releaseInput(o); if (k) g.queueInput(k); };
			let wi = 0;
			for (let i = 0; i < 300; i++) {
				const e = g.getEnemies()[0];
				const p = g.getPlayer();
				if (!e) { hold(null); return { killedAt: i, hp: g.getState().player.hp }; }
				const dx = e.x - p.x, dy = e.y - p.y;
				const near = (Math.abs(dx) < 0.6 && Math.abs(dy) <= 1.6) || (Math.abs(dy) < 0.6 && Math.abs(dx) <= 1.6);
				let move = null;
				if (near && e.leapPhase !== 'air') {
					g.setHeroDir(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
					g.swordAttack();
				} else if (wi < wps.length) {
					const [tr, tc] = wps[wi];
					if (Math.abs(p.y - tr) < 0.01 && Math.abs(p.x - tc) < 0.01) wi++;
					else move = Math.abs(p.x - tc) > 0.01 ? (tc > p.x ? 'right' : 'left') : (tr > p.y ? 'down' : 'up');
				} else if (!near) {
					move = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
				}
				hold(move);
				g.step(1);
				if (g.getState().player.hp <= 0) return { died: i };
			}
			return { alive: true };
		});
		expect(r.died, '回り込んで斬り合って倒れた').toBeUndefined();
		expect(r.killedAt, '300 tick で倒せない').toBeDefined();
		expect(r.hp).toBeGreaterThan(0);
		// コンパスへ歩く（2,6 付近から南東の隅 8,10 へ）。
		const got = await page.evaluate(([cr, cc, layer]) => {
			const g = window.__game;
			const keys = ['up', 'down', 'left', 'right'];
			const hold = (k) => { for (const o of keys) if (o !== k) g.releaseInput(o); if (k) g.queueInput(k); };
			for (let i = 0; i < 200; i++) {
				const p = g.getPlayer();
				if (g.getPlayer().dungeonItems?.[layer]?.hasCompass) { hold(null); return true; }
				hold(Math.abs(p.x - cc) > 0.01 ? (cc > p.x ? 'right' : 'left') : (cr > p.y ? 'down' : 'up'));
				g.step(1);
			}
			hold(null);
			return !!g.getPlayer().dungeonItems?.[layer]?.hasCompass;
		}, [...P(COMPASS), LAYER]);
		expect(got, 'コンパスを拾えない').toBe(true);
		expect(errors).toEqual([]);
	});
});
