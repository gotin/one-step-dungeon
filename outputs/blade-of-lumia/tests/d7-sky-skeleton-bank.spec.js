// tests/d7-sky-skeleton-bank.spec.js
// dungeon_7 `4,2`（`4,1` と `3,2` をつなぐ角の通り道）「空の骸骨の並走岸」の番人
// （2026-10-05 / PLAN 実行キュー 39 の第4陣 4室目・盤面は `scripts/migrate-d7-4-2-sky-skeleton-bank.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   旧 `4,2` は D6 と同じ四角い広間に何も無かった。空も敵も無かった。
//
// 守るものは3つ。
//   ① データ：盤面（桟橋＋土手道＋空の割れ目＋合流点＋南の岸）・骸骨剣士2体・報酬なし・配置表の外の宣言。
//   ② 地形：北の口から西の口へ歩ける。岸と土手道をつなぐのは合流点 (6,3) の1マスだけ。土手道から南への矢は空を越えて岸へ届く。
//   ③ 挙動＝この部屋の見せ場「骸骨は空を渡れない＝向こう岸を並んでついて来て、合流点から上がって来る」：
//      ・北の桟橋を下りると、東の骸骨が向こう岸でこちらと同じ列に並ぶ（割れ目を渡らない）
//      ・土手道で立ち止まると、西の骸骨が合流点から上がって来て斬られる
//      ・駆け抜ければ斬られない
//      ・並んで足を止めた骸骨は、空越しの矢で射られる
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET as BOARD, SKELETONS, EXITS, JUNCTION, bankCells, walkable, arrowLane,
} from '../scripts/migrate-d7-4-2-sky-skeleton-bank.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '4,2';
const st = map.layers[LAYER].stages[ROOM];

const cellsOf = (ch) => {
	const out = [];
	st.tiles.forEach((row, r) => row.forEach((x, c) => { if (x === ch) out.push(`${r},${c}`); }));
	return out;
};

test.describe('D7 4,2 空の骸骨の並走岸 ① データ', () => {
	test('① 盤面・骸骨剣士・報酬なし', () => {
		expect(st.tiles.every((row) => Array.isArray(row) && row.length === 12), 'tiles が文字の配列の配列でない').toBe(true);
		expect(st.tiles.map((row) => row.join('')), '盤面が変わった').toEqual(BOARD);
		// 盤面の定数そのものも確かめる（TARGET を import しているので、移行スクリプト側で
		// 盤面ごと書き換えられると上の比較は素通りする）。
		expect(BOARD[3], '北の桟橋（列5-6）').toBe('#%%%%..%%%%#');
		expect(BOARD[5], '西の口へ折れる土手道').toBe('.......%%%%#');
		expect(BOARD[6], '空の割れ目と合流点 (6,3)').toBe('#%%.%%%%%%%#');
		expect(BOARD[7], '南の岸・西の骸骨').toBe('#θ.........#');
		expect(BOARD[8], '南の岸・東の骸骨').toBe('#........θ.#');
		expect(cellsOf(TILE.SKELETON), '骸骨剣士は岸の西の端と東の端').toEqual(['7,1', '8,9']);
		expect(SKELETONS).toEqual(['7,1', '8,9']);
		const others = Object.keys(ENEMY_META).filter((ch) => ch !== TILE.SKELETON && cellsOf(ch).length);
		expect(others, '骸骨剣士のほかに敵がいる').toEqual([]);
		const meta = ENEMY_META[TILE.SKELETON];
		expect(!meta.move && !meta.combat && !meta.attacks, '骸骨剣士が陸を歩いて追う敵でなくなった（この部屋の前提）').toBe(true);
		expect(cellsOf(TILE.CHEST).concat(cellsOf(TILE.ITEM_HEAL_POTION)), '報酬なしの通り道').toEqual([]);
		expect(st.floorItems ?? {}, '床の拾い物は置かない').toEqual({});
		expect(Object.keys(st.bgTiles ?? {}), '空は tiles の %＝下地は使わない').toEqual([]);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'5.5m の配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
	});
});

test.describe('D7 4,2 空の骸骨の並走岸 ② 地形', () => {
	test('② 口がつながり、岸へは合流点からだけ・土手道から南への矢は岸へ届く', () => {
		const t = st.tiles;
		const foot = walkable(t, EXITS.北[0]);
		expect(EXITS.西.every((k) => foot.has(k)), '北の口から西の口へ歩けない').toBe(true);
		const floor = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ch !== TILE.WALL && ch !== TILE.SKY) floor.push(`${r},${c}`); }));
		expect(floor.filter((k) => !foot.has(k)), '取り残された床がある').toEqual([]);
		expect(walkable(t, EXITS.北[0], true).size, 'はしごで空を渡れてしまう').toBe(foot.size);
		// 岸に隣り合う岸の外の床＝合流点だけ。
		const bank = bankCells(t);
		const gates = new Set();
		for (const k of bank) {
			const [r, c] = k.split(',').map(Number);
			for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const ch = t[r + dr]?.[c + dc];
				const nk = `${r + dr},${c + dc}`;
				if (ch != null && !bank.includes(nk) && ch !== TILE.WALL && ch !== TILE.SKY) gates.add(nk);
			}
		}
		expect([...gates], '岸と土手道をつなぐのが合流点の1マスでない').toEqual([JUNCTION]);
		expect(JUNCTION).toBe('6,3');
		// 土手道の行5 から南への矢：合流点の列以外は空1枚を越えて岸へ届く。
		for (const c of [1, 2, 4, 5, 6]) {
			const lane = arrowLane(t, `5,${c}`, [1, 0]);
			expect(t[6][c], `(6,${c}) が空でない`).toBe(TILE.SKY);
			expect(lane.some((k) => bank.includes(k)), `(5,${c}) から南への矢が岸へ届かない`).toBe(true);
		}
	});
});

// ── 実プレイ（fromEditor=1 プレビュー）──────────────────────────────
async function open(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '10', ps_bow: '1' });
	await page.goto(`${GAME_URL}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 2);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）∴HP を測るこの部屋の本はすべて 'g' で切る。
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// plan＝tick ごとの手（'down' 等 / null＝立ち止まり）。骸骨の軌跡（id ごと）と被弾を返す。
const runPlan = (page, plan, ticks) => page.evaluate(({ plan, ticks }) => {
	const g = window.__game;
	const hp0 = g.getState().player.hp;
	const tracks = {};
	for (let i = 0; i < ticks; i++) {
		if (plan[i]) g.movePlayer(plan[i]);
		g.step(1);
		for (const e of g.getEnemies()) (tracks[e.id] ??= []).push([e.y, e.x]);
	}
	const p = g.getPlayer();
	return { tracks, hpLost: hp0 - g.getState().player.hp, r: p.y, c: p.x };
}, { plan, ticks });
const rep = (d, n) => Array(n).fill(d);
// 軌跡の中で、骸骨の体が乗った空のセル（体の占める行・列の全セルで見る＝半マスの位置も拾う）。
const skyTouched = (track) => {
	const out = new Set();
	for (const [y, x] of track) {
		for (const r of [Math.floor(y), Math.ceil(y)]) for (const c of [Math.floor(x), Math.ceil(x)]) {
			if (BOARD[r]?.[c] === TILE.SKY) out.add(`${r},${c}`);
		}
	}
	return [...out];
};

test.describe('D7 4,2 空の骸骨の並走岸 ③ 敵（骸骨は空を渡れず、並んでついて来る）', () => {
	test('③ 北の桟橋を下りると、東の骸骨が向こう岸で同じ列に並ぶ（割れ目を渡らない）', async ({ page }) => {
		const errors = await open(page, 1, 6);
		// 桟橋を (5,6) まで下りて、そのまま立ち止まる。
		const r = await runPlan(page, rep('down', 8), 40);
		expect({ r: r.r, c: r.c }, '土手道 (5,6) まで下りられない').toEqual({ r: 5, c: 6 });
		const east = r.tracks['8,9'];
		expect(east, '東の骸骨が居ない').toBeTruthy();
		const [ey, ex] = east.at(-1);
		expect(ey, '東の骸骨が岸（行7-8）にいない').toBeGreaterThanOrEqual(7);
		expect(Math.abs(ex - 6), `東の骸骨がこちらの列（6）に並ばない（列 ${ex}）`).toBeLessThan(0.6);
		expect(ex, '東の骸骨が岸の東の端から動いていない').toBeLessThan(9);
		for (const [id, tr] of Object.entries(r.tracks)) {
			expect(skyTouched(tr), `骸骨 ${id} が空に乗った`).toEqual([]);
		}
		expect(errors).toEqual([]);
	});

	test('③ 土手道で立ち止まると、西の骸骨が合流点から上がって来て斬られる', async ({ page }) => {
		const errors = await open(page, 1, 5);
		const r = await runPlan(page, rep('down', 8), 70);
		// 誰が上がって来るかは id で決め打ちしない（置き方を変えて誰も上がらなくなる壊れ方を拾う）。
		const climbed = Object.values(r.tracks).filter((tr) => tr.some(([y, x]) => y === 6 && x === 3) && tr.some(([y]) => y <= 5));
		expect(climbed.length, '合流点 (6,3) を通って土手道へ上がって来る骸骨がいない').toBeGreaterThanOrEqual(1);
		expect(r.hpLost, '立ち止まったのに斬られない').toBeGreaterThan(0);
		for (const [id, tr] of Object.entries(r.tracks)) {
			expect(skyTouched(tr), `骸骨 ${id} が空に乗った`).toEqual([]);
		}
		expect(errors).toEqual([]);
	});

	test('③ 北の口から西の口へ駆け抜ければ斬られない', async ({ page }) => {
		const errors = await open(page, 1, 5);
		const r = await runPlan(page, [...rep('down', 8), ...rep('left', 10)], 18);
		expect({ r: r.r, c: r.c }, '西の口まで駆け抜けられない').toEqual({ r: 5, c: 0 });
		expect(r.hpLost, '駆け抜けたのに斬られた').toBe(0);
		expect(errors).toEqual([]);
	});

	test('③ 並んで足を止めた骸骨は、土手道から空越しの矢で射られる', async ({ page }) => {
		const errors = await open(page, 1, 6);
		await runPlan(page, rep('down', 8), 12);
		const r = await page.evaluate(() => {
			const g = window.__game;
			const p = g.getPlayer();
			p._shownSubItemHint = true;
			p.activeSubItem = 'bow';
			const target = () => g.getEnemies().find((e) => e.id === '8,9');
			const hp0 = target().hp;
			let shots = 0, minRow = 99;
			for (let i = 0; i < 120; i++) {
				const e = target();
				if (!e) return { killed: true, shots, lost: hp0, minRow };
				minRow = Math.min(minRow, e.y);
				if (Math.abs(e.x - p.x) < 0.6 && e.y > p.y + 1.5) { g.setHeroDir('down'); g.useSubItem(); shots++; }
				g.step(1);
			}
			const e = target();
			return { killed: !e, shots, lost: e ? hp0 - e.hp : hp0, minRow };
		});
		expect(r.shots, '東の骸骨が真下に並ばない＝測り方が崩れている').toBeGreaterThanOrEqual(1);
		expect(r.lost, '空越しの矢が当たらない').toBeGreaterThan(0);
		expect(r.minRow, '射られている骸骨が岸を離れた＝空越しの的になっていない').toBeGreaterThanOrEqual(7);
		expect(errors).toEqual([]);
	});
});
