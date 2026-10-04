// tests/d7-sky-bomb-cape.spec.js
// dungeon_7 `4,1`（`3,1` の東の通り道）「空の爆弾鬼の岬」の番人
// （2026-10-04 / PLAN 実行キュー 39 の第4陣 3室目・盤面は `scripts/migrate-d7-4-1-sky-bomb-cape.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   旧 `4,1` は D6 と同じ四角い広間に回復薬（小）と床の妖精があるだけ。空も敵も無かった。
//
// 守るものは3つ。
//   ① データ：盤面（土手道＋空の割れ目＋岬＋崩れ残った柱）・爆弾鬼1体と向き・報酬なし・配置表の外の宣言。
//   ② 地形：西の口から南の口へ歩ける。岬は土手道の角と斜めに隣り合うのに、歩くと行8 を回る遠回り。
//      矢の射線は土手道の横からは柱で切れ、行8 の割れ目の下 (8,8) からだけ北へ岬に通る。
//   ③ 挙動＝この部屋の見せ場「爆弾は空を越えて来るが、剣は空を越えない」：
//      ・西の口の脇では投げてこない／土手道の角で立ち止まると、空越しに爆弾が来て当たる
//      ・駆け抜ければ当たらない
//      ・首を回って詰め寄ると、密着の間は投げない＝岬の先へ追い詰めて剣で倒せる
//      ・角から東へ撃つ矢は柱で止まる／(8,8) から北へ撃つ矢は空を越えて当たる
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET as BOARD, OGRES, OGRE_DIRS, EXITS, CORNER, CAPE_TIP, capeCells, walkable, walkDist, arrowLane,
} from '../scripts/migrate-d7-4-1-sky-bomb-cape.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '4,1';
const st = map.layers[LAYER].stages[ROOM];

const cellsOf = (ch) => {
	const out = [];
	st.tiles.forEach((row, r) => row.forEach((x, c) => { if (x === ch) out.push(`${r},${c}`); }));
	return out;
};

test.describe('D7 4,1 空の爆弾鬼の岬 ① データ', () => {
	test('① 盤面・爆弾鬼・報酬なし', () => {
		expect(st.tiles.every((row) => Array.isArray(row) && row.length === 12), 'tiles が文字の配列の配列でない').toBe(true);
		expect(st.tiles.map((row) => row.join('')), '盤面が変わった').toEqual(BOARD);
		// 盤面の定数そのものも確かめる（TARGET を import しているので、移行スクリプト側で
		// 盤面ごと書き換えられると上の比較は素通りする）。
		expect(BOARD[2], '岬と爆弾鬼').toBe('#%%%%%%..λ.#');
		expect(BOARD[4], '土手道・崩れ残った柱・割れ目・首（行4）').toBe('.......#%..#');
		expect(BOARD[5], '土手道・崩れ残った柱・割れ目・首（行5）').toBe('.......#%..#');
		expect(BOARD[8], '行8＝土手道と首をつなぐ唯一の道').toBe('#%%%%......#');
		expect(cellsOf(TILE.BOMB_OGRE), '爆弾鬼は岬に1体').toEqual(['2,9']);
		expect(OGRES).toEqual(['2,9']);
		expect(st.enemyDirs, '爆弾鬼は西（土手道の側）を向く').toEqual({ '2,9': 'left' });
		expect(OGRE_DIRS).toEqual(st.enemyDirs);
		const others = Object.keys(ENEMY_META).filter((ch) => ch !== TILE.BOMB_OGRE && cellsOf(ch).length);
		expect(others, '爆弾鬼のほかに敵がいる').toEqual([]);
		expect(ENEMY_META[TILE.BOMB_OGRE].attack.type, '爆弾鬼の放物線の投擲（この部屋の前提）').toBe('bombThrow');
		expect(cellsOf(TILE.CHEST).concat(cellsOf(TILE.ITEM_HEAL_POTION)), '報酬なしの通り道（旧 回復薬は撤去）').toEqual([]);
		expect(st.floorItems ?? {}, '旧 床の妖精は撤去').toEqual({});
		expect(Object.keys(st.bgTiles ?? {}), '空は tiles の %＝下地は使わない').toEqual([]);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'5.5m の配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
	});
});

test.describe('D7 4,1 空の爆弾鬼の岬 ② 地形', () => {
	test('② 口がつながり、岬は近いのに遠い・矢の射線は (8,8) から北の1本', () => {
		const t = st.tiles;
		const foot = walkable(t, EXITS.西[0], false);
		expect(EXITS.南.every((k) => foot.has(k)), '西の口から南の口へ歩けない').toBe(true);
		const floor = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ch !== TILE.WALL && ch !== TILE.SKY) floor.push(`${r},${c}`); }));
		expect(floor.filter((k) => !foot.has(k)), '取り残された床がある').toEqual([]);
		expect(walkable(t, EXITS.西[0], true).size, 'はしごで空を渡れてしまう').toBe(foot.size);
		// 近いのに遠い：角 (4,6) と岬の先 (3,7) は斜めに隣り合うが、歩くと行8 を回る。
		expect(CORNER).toBe('4,6');
		expect(CAPE_TIP).toBe('3,7');
		expect(walkDist(t, CORNER).dist.get(CAPE_TIP), '角から岬の先まで歩くと近い＝回り込む理由が無い').toBeGreaterThanOrEqual(10);
		// 矢の射線：土手道（行4-5）から東へは柱で止まる／(8,8) から北へだけ岬に届く。
		const cape = capeCells();
		const neckOrCape = (k) => cape.includes(k) || (Number(k.split(',')[1]) >= 9 && foot.has(k));
		for (const r of [4, 5]) for (let c = 0; c <= 6; c++) {
			expect(arrowLane(t, `${r},${c}`, [0, 1]).some(neckOrCape), `土手道 (${r},${c}) から東への矢が首/岬に届く`).toBe(false);
		}
		expect(arrowLane(t, '8,8', [-1, 0]).some((k) => cape.includes(k)), '(8,8) から北への矢が岬に届かない').toBe(true);
	});
});

// ── 実プレイ（fromEditor=1 プレビュー）──────────────────────────────
async function open(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '10', ps_bow: '1', ...extra });
	await page.goto(`${GAME_URL}?${q}`);
	await waitForBoard(page);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）∴HP を測るこの部屋の本はすべて 'g' で切る。
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// plan＝tick ごとの手（'right' 等 / null＝立ち止まり）。投げられた爆弾の数と被弾を数える。
const runPlan = (page, plan, ticks) => page.evaluate(({ plan, ticks }) => {
	const g = window.__game;
	const hp0 = g.getState().player.hp;
	const seen = new Set();
	for (let i = 0; i < ticks; i++) {
		if (plan[i]) g.movePlayer(plan[i]);
		g.step(1);
		for (const pr of g.getProjectiles()) if (pr.owner === 'enemy' && pr.lob) seen.add(pr.id);
	}
	const p = g.getPlayer();
	return { throws: seen.size, hpLost: hp0 - g.getState().player.hp, r: p.y, c: p.x };
}, { plan, ticks });
const rep = (d, n) => Array(n).fill(d);

test.describe('D7 4,1 空の爆弾鬼の岬 ③ 敵（爆弾は空を越え、剣は越えない）', () => {
	test('③ 西の口の脇では投げない／土手道の角で立ち止まると空越しに爆弾が当たる', async ({ page }) => {
		let errors = await open(page, 4, 0);
		const mouth = await runPlan(page, [], 120);
		expect(mouth.throws, '西の口の脇（投擲距離の外）で爆弾が来た').toBe(0);
		expect(errors).toEqual([]);
		errors = await open(page, 4, 6);
		const corner = await runPlan(page, [], 120);
		expect(corner.throws, '角で立ち止まっても爆弾が来ない').toBeGreaterThanOrEqual(2);
		expect(corner.hpLost, '空越しの爆弾が当たらない').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('③ 西の口から南の口へ駆け抜ければ当たらない', async ({ page }) => {
		const errors = await open(page, 4, 0);
		const r = await runPlan(page, [...rep('right', 12), ...rep('down', 9)], 24);
		expect({ r: r.r, c: r.c }, '南の口の手前まで駆け抜けられない').toEqual({ r: 8.5, c: 6 });
		expect(r.hpLost, '駆け抜けたのに爆弾が当たった').toBe(0);
		expect(errors).toEqual([]);
	});

	test('③ 首を回って詰め寄ると密着の間は投げない＝岬の先へ追い詰めて剣で倒せる', async ({ page }) => {
		const errors = await open(page, 8, 9);
		const r = await page.evaluate(() => {
			const g = window.__game;
			const hp0 = g.getState().player.hp;
			const seen = new Set(); let closeThrows = 0;
			for (let i = 0; i < 300; i++) {
				const e = g.getEnemies()[0];
				if (!e) return { killedAt: i, closeThrows, hpLost: hp0 - g.getState().player.hp };
				const pl = g.getPlayer();
				const dx = e.x - pl.x, dy = e.y - pl.y;
				if (Math.abs(dy) < 0.6 && Math.abs(dx) <= 1.3) { g.setHeroDir(dx > 0 ? 'right' : 'left'); g.swordAttack(); }
				else if (Math.abs(dx) < 0.6 && Math.abs(dy) <= 1.3) { g.setHeroDir(dy > 0 ? 'down' : 'up'); g.swordAttack(); }
				else if (Math.abs(dy) >= Math.abs(dx)) g.movePlayer(dy > 0 ? 'down' : 'up');
				else g.movePlayer(dx > 0 ? 'right' : 'left');
				g.step(1);
				for (const pr of g.getProjectiles()) {
					if (pr.owner !== 'enemy' || !pr.lob || seen.has(pr.id)) continue;
					seen.add(pr.id);
					const e2 = g.getEnemies()[0], p2 = g.getPlayer();
					if (e2 && Math.hypot(e2.x - p2.x, e2.y - p2.y) < 2.0) closeThrows++;
				}
			}
			return { killedAt: null, closeThrows, hpLost: hp0 - g.getState().player.hp };
		});
		expect(r.killedAt, '詰め寄っても岬の爆弾鬼を倒せない').not.toBeNull();
		expect(r.closeThrows, '密着（2セル未満）しているのに投げた').toBe(0);
		expect(r.hpLost, '詰め寄って追い詰めたのに被弾した').toBe(0);
		expect(errors).toEqual([]);
	});

	test('③ 角から東へ撃つ矢は柱で止まる／(8,8) から北へ撃つ矢は空を越えて当たる', async ({ page }) => {
		const shoot = async (row, col, dir, ticks) => {
			await open(page, row, col);
			return page.evaluate(({ dir, ticks }) => {
				const g = window.__game;
				const p = g.getPlayer();
				p._shownSubItemHint = true;
				p.activeSubItem = 'bow';
				const hp0 = g.getEnemies()[0].hp;
				let shots = 0;
				for (let i = 0; i < ticks; i++) {
					const e = g.getEnemies()[0];
					if (!e) return { killed: true, shots, lost: hp0 };
					const lined = dir === 'right' ? (Math.abs(e.y - p.y) < 0.6 && e.x > p.x) : (Math.abs(e.x - p.x) < 0.6 && e.y < p.y);
					if (lined) { g.setHeroDir(dir); g.useSubItem(); shots++; }
					g.step(1);
				}
				return { killed: false, shots, lost: hp0 - g.getEnemies()[0].hp };
			}, { dir, ticks });
		};
		// 角 (4,6)：鬼は退がって首の上端 (4,9) で同じ行に並ぶ＝撃てる向きは出るが、柱が止める。
		const blocked = await shoot(4, 6, 'right', 120);
		expect(blocked.shots, '角で鬼と同じ行に並ばない＝測り方が崩れている').toBeGreaterThanOrEqual(3);
		expect(blocked.lost, '角から東への矢が柱を越えて当たった').toBe(0);
		const lane = await shoot(8, 8, 'up', 120);
		expect(lane.lost, '(8,8) から北への矢が空を越えて当たらない').toBeGreaterThan(0);
	});
});
