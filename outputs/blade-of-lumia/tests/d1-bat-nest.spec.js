// tests/d1-bat-nest.spec.js
// dungeon_1 `3,3`（コウモリの間 `2,3` の奥の行き止まり）「泉の島のコウモリの巣」の番人
// （2026-10-12 / PLAN 実行キュー 47 の第1陣 3室目・盤面は `scripts/migrate-d1-3-3-bat-nest.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間の真ん中にハートの器の宝箱（初めから見えている）と大ルピーだけ・敵なし（キュー21 の F6）。
//
// 新しい盤面（'~' は下地 bgTiles の水）:
//      1 #~~ξ~~~~ξ~~#   ← 地底の泉。コウモリは水の上を飛べる・勇者は入れない
//      3 #...~~~.Rξ~#   ← 西の岸（列1-3）／中の島（列7-9）／大ルピー
//      4 ....~~~.B.~#   ← 島の真ん中に宝箱（コウモリを全滅させると現れる＝ハートの器）
//      5 ..........~#   ← 岸から島へ渡る土手道（幅1）
//      8 #~~ξ~~~~ξ~~#
//
// 守るものは2つ。
//   ① データ（幾何）：ξ×6・脅威度・泉の水・土手道が島へ渡る唯一の道・柱が無い・宝箱は全滅で現れる・層の到達性。
//   ② 挙動（実機）：コウモリは水の上を渡って岸の勇者のもとへ全部来る（どれも引っかからない＝全滅できる）／
//      6体目を倒すまで宝箱は出ない／木の剣とハート3つで岸から迎え撃てば勝てる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET, PLAN_BOARD, BATS, BATS_OVER_WATER, CAUSEWAY, ENTRY, CHEST, CHEST_CONTENT, CHEST_CONDITION, RUPEE,
	SIGNATURE_THREAT, BAT_ROOM_THREAT, targetBg, reach, flyReach,
} from '../scripts/migrate-d1-3-3-bat-nest.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_1';
const ROOM = '3,3';
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
test.describe('D1 3,3 泉の島のコウモリの巣 ① データ', () => {
	test('盤面・敵は ξ×6・脅威度は 2,3 より重く看板部屋 1,1 より軽い・宝箱は全滅で現れる・宣言', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		const enemies = cellsOf(t, (ch) => !!ENEMY_META[ch]).map((k) => `${t[P(k)[0]][P(k)[1]]}@${k}`);
		expect(enemies, '敵はコウモリ ξ 6体だけ').toEqual(BATS.map((k) => `${TILE.BAT_SWARM}@${k}`));
		const threat = stageThreat(st, ENEMY_META);
		expect(threat, '手前のコウモリの間 2,3 より軽い').toBeGreaterThan(BAT_ROOM_THREAT);
		expect(threat, '看板部屋 1,1 を超えた').toBeLessThan(SIGNATURE_THREAT);
		expect(st.chestContents).toEqual({ [CHEST]: CHEST_CONTENT });
		expect(st.showConditions, '宝箱が全滅で現れる形でない').toEqual({ [CHEST]: CHEST_CONDITION });
		expect(t[P(RUPEE)[0]][P(RUPEE)[1]], '大ルピー').toBe(TILE.ITEM_RUPEE_LARGE);
		for (const k of ['signData', 'floorItems', 'mapEnters']) expect(Object.keys(st[k] ?? {}), `${k} が空でない`).toEqual([]);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS の宣言').toBe(true);
	});

	test('泉：下地の水は盤面どおり・tiles に水を書かない・泉の上のコウモリへは歩いて届かない', () => {
		const st = stages[ROOM];
		expect(st.bgTiles, '下地の水が狙いと違う').toEqual(targetBg());
		const t = gridOf();
		expect(cellsOf(t, (ch) => ch === TILE.WATER), 'tiles に水').toEqual([]);
		const seen = reach(t, st.bgTiles);
		for (const k of BATS_OVER_WATER) expect(seen.has(k), `泉の上 ${k} へ歩ける`).toBe(false);
		// 泉の上の ξ のセルは下地が水（盤面の '~' と同じ扱い）
		for (const k of BATS_OVER_WATER) expect(PLAN_BOARD[P(k)[0]][P(k)[1]], k).toBe(TILE.BAT_SWARM);
	});

	test('土手道は島へ渡る唯一の道＝真ん中を切ると宝箱の隣へ届かない（対照：切らなければ届く）', () => {
		const t = gridOf();
		const bg = stages[ROOM].bgTiles;
		const [cr, cc] = P(CHEST);
		const nextToChest = `${cr},${cc - 1}`;
		expect(reach(t, bg).has(nextToChest), '切らなくても島へ届かない＝測定が空虚').toBe(true);
		expect(reach(t, bg, ENTRY, new Set([CAUSEWAY[1]])).has(nextToChest), '土手道を通らずに島へ渡れる').toBe(false);
		for (const k of CAUSEWAY) {
			const [r, c] = P(k);
			expect([bg[`${r - 1},${c}`], bg[`${r + 1},${c}`]], `土手道 ${k} の上下が水でない（幅1でない）`).toEqual([TILE.WATER, TILE.WATER]);
		}
	});

	test('柱が無い：部屋の中に壁が無く、どのコウモリも岸・土手道・島のすべての床へ飛んで行ける', () => {
		const t = gridOf();
		const bg = stages[ROOM].bgTiles;
		const inner = cellsOf(t, (ch) => ch === TILE.WALL).filter((k) => { const [r, c] = P(k); return r > 0 && r < 9 && c > 0 && c < 11; });
		expect(inner, '部屋の中に壁（柱）がある＝まっすぐ寄るコウモリが裏に引っかかる').toEqual([]);
		const floors = [...reach(t, bg)];
		for (const b of BATS) {
			const fr = flyReach(t, b);
			expect(floors.filter((k) => !fr.has(k)), `コウモリ ${b} から飛んで行けない床`).toEqual([]);
		}
	});

	test('層の接続：dead-edge 0・徒歩で 15 室（書き換え前と同じ）', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(foot.reachedRooms.size, '徒歩で歩ける部屋数').toBe(15);
		for (const k of ['2,3', '3,3']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
// ⚠ プレビューは debugMode:true＝被弾しない・isPassable が無条件 true∴HP と通行を測る本は 'g' で debug を切る。
const GAME = '/blade-of-lumia/game/';
async function boot(page, { debugOff = false, row = 4, col = 1 } = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '3' });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction((n) => window.__game.getEnemies().length === n, BATS.length);
	if (debugOff) await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}

test.describe('D1 3,3 泉の島のコウモリの巣 ② 実機', () => {
	test('岸に立って待つと、6体とも水の上を渡って勇者の間合いまで来る（どれも引っかからない）', async ({ page }) => {
		const errors = await boot(page, { debugOff: true });
		// 実測＝40 tick で全員が岸の勇者の周りに集まる（放っておくと 98 tick で倒れる）∴60 tick で見る。
		// 敵どうしは重なれない＝勇者の隣が埋まると後の1体は2列目（マンハッタン 3）で待つ∴「来た」は 3 以内。
		// 引っかかったコウモリは始まりの所（岸から 6 以上）に残る＝3 で区別できる。
		const r = await page.evaluate(() => {
			const g = window.__game;
			const came = new Set();
			const overWater = new Set();   // 通ったセル（下地が水かは呼び出し側で判定する）
			for (let i = 0; i < 60; i++) {
				g.step(1);
				const p = g.getPlayer();
				for (const e of g.getEnemies()) {
					if (Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= 3) came.add(e.id);
					overWater.add(`${e.id}@${Math.round(e.y)},${Math.round(e.x)}`);
				}
			}
			return { came: came.size, total: g.getEnemies().length, hp: g.getState().player.hp, trail: [...overWater] };
		});
		expect(r.total, '待っている間に数が変わった').toBe(6);
		expect(r.came, '岸の勇者の間合いまで来ないコウモリがいる＝全滅できない').toBe(6);
		// 泉の上（盤面の水）を通った＝水を飛び越えて来た
		const water = new Set(Object.keys(stages[ROOM].bgTiles));
		const crossedWater = r.trail.filter((s) => water.has(s.split('@')[1]) && !BATS_OVER_WATER.includes(s.split('@')[1]));
		expect(crossedWater.length, 'コウモリが一度も（始まりのセル以外の）水の上を飛んでいない').toBeGreaterThan(0);
		expect(r.hp, 'debug が切れていない＝コウモリが当たっていない').toBeLessThan(6);
		expect(errors).toEqual([]);
	});

	test('勇者は泉に入れない：岸の東の端 (3,3) から東へ押しても水へ出ない', async ({ page }) => {
		const errors = await boot(page, { debugOff: true, row: 3, col: 3 });
		const r = await page.evaluate(() => {
			const g = window.__game;
			for (let i = 0; i < 8; i++) { g.movePlayer('right'); g.step(2); }
			const p = g.getPlayer();
			return { x: p.x, y: p.y };
		});
		expect(r.x, '泉（列4）へ踏み込んだ').toBeLessThan(3.5);
		expect(errors).toEqual([]);
	});

	test('5体倒しても宝箱は出ず、6体目を倒すと島の真ん中に現れる', async ({ page }) => {
		const errors = await boot(page);
		const chestShown = () => page.evaluate((k) => window.__game.getStageState().conditionsMet.includes(k), CHEST);
		expect(await chestShown(), '倒す前から宝箱が出ている').toBe(false);
		const killOne = () => page.evaluate(() => {
			const g = window.__game;
			const e = g.getEnemies()[0];
			if (!e) return false;
			g.dealDamage(e.id, 99, 'sword', e.x, e.y); g.step(2);
			return true;
		});
		for (let i = 0; i < 5; i++) expect(await killOne(), `${i + 1}体目が居ない`).toBe(true);
		expect(await page.evaluate(() => window.__game.getEnemies().length)).toBe(1);
		expect(await chestShown(), '1体残っているのに宝箱が出た').toBe(false);
		expect(await killOne()).toBe(true);
		expect(await chestShown(), '6体とも倒しても宝箱が現れない').toBe(true);
		expect(errors).toEqual([]);
	});

	test('木の剣・ハート3つで西の岸から迎え撃てば、倒れずに全滅させられる', async ({ page }) => {
		const errors = await boot(page, { debugOff: true });
		// 隣（1.5 以内）に来た一番近いコウモリへ向いて振るだけの素朴な迎え撃ち（実測＝被弾2・49 tick で全滅）。
		const r = await page.evaluate(() => {
			const g = window.__game;
			for (let i = 0; i < 300; i++) {
				const p = g.getPlayer();
				let best = null, bd = 1e9;
				for (const e of g.getEnemies()) { const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y); if (d < bd) { bd = d; best = e; } }
				if (best && bd <= 1.5) {
					const dx = best.x - p.x, dy = best.y - p.y;
					g.setHeroDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
					g.swordAttack();
				}
				g.step(1);
				if (g.getState().player.hp <= 0) return { died: i };
				if (g.getEnemies().length === 0) return { clearedAt: i, hp: g.getState().player.hp };
			}
			return { left: g.getEnemies().length };
		});
		expect(r.died, '岸で迎え撃って倒れた').toBeUndefined();
		expect(r.clearedAt, `300 tick で全滅しない（残り ${r.left}）`).toBeDefined();
		expect(r.hp).toBeGreaterThan(0);
		expect(await page.evaluate((k) => window.__game.getStageState().conditionsMet.includes(k), CHEST), '全滅したのに宝箱が無い').toBe(true);
		expect(errors).toEqual([]);
	});
});
