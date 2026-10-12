// tests/d1-spear-watch.spec.js
// dungeon_1 `3,2`（目のスイッチの部屋 `2,2` の東の行き止まり）「堀の見張り台」の番人
// （2026-10-12 / PLAN 実行キュー 47 の第1陣 4室目・盤面は `scripts/migrate-d1-3-2-spear-watch.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間の真ん中にルピー×20 の宝箱（初めから見えている）だけ・敵なし（キュー21 の F6）。
//
// 新しい盤面（'~' は下地 bgTiles の水）:
//      1 #..........#   ← 北の回り道（行1 は柱の陰）
//      2 #.....##...#   ← 柱
//      3 #....~~~~..#   ← 堀
//      4 .....~F....#   ← 西の口／見張り台の番兵 F／裏の橋 (4,8)
//      5 .....~.B~..#   ← 宝箱は番兵の背後
//      6 #....~~~~..#
//      8 #..........#   ← 南の回り道（柱が無い＝槍が届く）
//
// 守るものは2つ。
//   ① データ（幾何）：F×1・脅威度・堀・橋が見張り台へ上がる唯一の道・射線（正面と南は届く／北の柱の陰は届かない）・層の到達性。
//   ② 挙動（実機）：正面に居ると番兵は台から降りずに堀ごしに槍を撃つ／北の柱の陰には槍が来ない（南には来る）／
//      東へ回ると橋を渡って降りてくる／木の盾で向き合えば槍を防げる（盾なしは削られる）／木の剣・ハート3つで斬り合って勝てる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET, ENTRY, SENTRY, DAIS, BRIDGE, PILLARS, SHADE, CHEST, CHEST_CONTENT, SIGNATURE_THREAT,
	targetBg, reach, spearHits,
} from '../scripts/migrate-d1-3-2-spear-watch.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_1';
const ROOM = '3,2';
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
test.describe('D1 3,2 堀の見張り台 ① データ', () => {
	test('盤面・敵は F×1・脅威度は看板部屋 1,1 を超えない・宝箱は番兵の背後で初めから見える・宣言', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		const enemies = cellsOf(t, (ch) => !!ENEMY_META[ch]).map((k) => `${t[P(k)[0]][P(k)[1]]}@${k}`);
		expect(enemies, '敵はセンチネル F 1体だけ').toEqual([`${TILE.SENTRY}@${SENTRY}`]);
		expect(stageThreat(st, ENEMY_META), '看板部屋 1,1 を超えた').toBeLessThanOrEqual(SIGNATURE_THREAT);
		expect(st.chestContents).toEqual({ [CHEST]: CHEST_CONTENT });
		expect(DAIS, '宝箱が見張り台の上に無い').toContain(CHEST);
		expect(Object.keys(st.showConditions ?? {}), '宝箱に出現条件が付いた').toEqual([]);
		for (const k of ['signData', 'floorItems', 'mapEnters']) expect(Object.keys(st[k] ?? {}), `${k} が空でない`).toEqual([]);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS の宣言').toBe(true);
	});

	test('堀：下地の水は盤面どおり・tiles に水を書かない・裏の橋が見張り台へ上がる唯一の道（対照：切らなければ届く）', () => {
		const st = stages[ROOM];
		expect(st.bgTiles, '下地の水が狙いと違う').toEqual(targetBg());
		const t = gridOf();
		expect(cellsOf(t, (ch) => ch === TILE.WATER), 'tiles に水').toEqual([]);
		expect(reach(t, st.bgTiles).has('4,7'), '切らなくても見張り台へ届かない＝測定が空虚').toBe(true);
		const cut = reach(t, st.bgTiles, ENTRY, new Set([BRIDGE]));
		for (const k of DAIS) expect(cut.has(k), `橋を通らずに見張り台 ${k} へ上がれる`).toBe(false);
	});

	test('射線：正面と南の回り道には槍が届き、北の柱の陰には届かない・西の口は射程の外', () => {
		const t = gridOf();
		for (const k of ['4,0', '5,0']) expect(spearHits(t, SENTRY, k), `西の口 ${k} が射程の中`).toBe(false);
		expect(['4,2', '4,3', '4,4'].every((k) => spearHits(t, SENTRY, k)), '正面（行4）に射線が通らない').toBe(true);
		for (const s of SHADE) expect(DAIS.filter((d) => spearHits(t, d, s)), `柱の陰 ${s} に届く見張り台のセル`).toEqual([]);
		for (const k of PILLARS) expect(t[P(k)[0]][P(k)[1]], `柱 ${k}`).toBe(TILE.WALL);
		// 対照＝柱の無い南は同じ列で届く（北と南の差が「柱」だけで決まっている）
		for (const k of ['8,6', '8,7']) expect(DAIS.some((d) => spearHits(t, d, k)), `南の回り道 ${k} に届かない`).toBe(true);
	});

	test('層の接続：dead-edge 0・徒歩で 15 室（書き換え前と同じ）', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(foot.reachedRooms.size, '徒歩で歩ける部屋数').toBe(15);
		for (const k of ['2,2', '3,2']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
// ⚠ プレビューは debugMode:true＝被弾しない・isPassable が無条件 true∴HP と通行を測る本は 'g' で debug を切る。
const GAME = '/blade-of-lumia/game/';
async function boot(page, { row, col, shield = false } = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '3' });
	if (shield) q.set('ps_shield', '0');
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 1);
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// n tick 立ち止まる（向きは dir に固定・剣は振らない）。被弾と F の居場所の履歴を返す。
const stand = (page, n, dir) => page.evaluate(({ n, dir }) => {
	const g = window.__game;
	const hp0 = g.getState().player.hp;
	const trail = [];
	let spears = 0;
	const seen = new Set();
	for (let i = 0; i < n; i++) {
		if (dir) g.setHeroDir(dir);
		g.step(1);
		for (const p of g.getProjectiles()) if (p.owner === 'enemy' && !seen.has(p.id)) { seen.add(p.id); spears++; }
		const e = g.getEnemies()[0];
		if (e) trail.push(`${Math.round(e.y)},${Math.round(e.x)}`);
	}
	return { lost: hp0 - g.getState().player.hp, trail: [...new Set(trail)], spears };
}, { n, dir });

test.describe('D1 3,2 堀の見張り台 ② 実機', () => {
	test('正面 (4,3) に立つと、番兵は見張り台から降りずに堀ごしに槍を撃ってくる', async ({ page }) => {
		const errors = await boot(page, { row: 4, col: 3 });
		// 実測＝槍は 3 秒（25 tick）おき・最初の1本は 24 tick 目に当たる∴60 tick で2本は来る。
		const r = await stand(page, 60, 'right');
		expect(r.trail.filter((k) => !DAIS.includes(k)), '番兵が見張り台から降りた').toEqual([]);
		expect(r.lost, '堀ごしの槍が当たっていない').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('北の柱の陰 (1,6) には槍が来ない／柱の無い南 (8,6) には来る', async ({ page }) => {
		let errors = await boot(page, { row: 1, col: 6 });
		const north = await stand(page, 60, 'down');
		expect(north.spears, '柱の陰に槍が飛んできた').toBe(0);
		expect(north.lost, '柱の陰で削られた').toBe(0);
		expect(north.trail.filter((k) => !DAIS.includes(k)), '番兵が見張り台から降りた').toEqual([]);
		expect(errors).toEqual([]);
		errors = await boot(page, { row: 8, col: 6 });
		const south = await stand(page, 60, 'right');
		expect(south.lost, '柱の無い南の回り道で槍が当たらない＝北と南の差が無い').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('東の通路 (4,10) へ回ると、番兵は裏の橋を渡って降りてくる', async ({ page }) => {
		const errors = await boot(page, { row: 4, col: 10 });
		// 実測＝10 tick で橋の上（4,8.5）・15 tick で勇者の隣 (4,9)。
		const r = await stand(page, 30, 'left');
		expect(r.trail, '番兵が橋を渡って東の通路へ来ない').toContain('4,9');
		expect(errors).toEqual([]);
	});

	test('東の通路で番兵に向いて構えると、木の盾は槍を防ぐ（対照：盾なしは削られる）', async ({ page }) => {
		let errors = await boot(page, { row: 4, col: 10, shield: true });
		const guarded = await stand(page, 60, 'left');
		expect(guarded.lost, '木の盾で向き合っているのに槍で削られた').toBe(0);
		expect(errors).toEqual([]);
		errors = await boot(page, { row: 4, col: 10 });
		const bare = await stand(page, 60, 'left');
		expect(bare.lost, '盾なしでも削られない＝盾の比較が空虚').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('木の剣・ハート3つ・盾なしで、東の通路で正面から斬り合えば倒れずに勝てる', async ({ page }) => {
		const errors = await boot(page, { row: 4, col: 10 });
		// 実測＝被弾1（3）・47 tick で撃破。
		const r = await page.evaluate(() => {
			const g = window.__game;
			for (let i = 0; i < 300; i++) {
				const e = g.getEnemies()[0];
				if (!e) return { killedAt: i, hp: g.getState().player.hp };
				const p = g.getPlayer();
				g.setHeroDir('left');
				if (Math.abs(e.y - p.y) < 0.6 && Math.abs(e.x - p.x) <= 1.6) g.swordAttack();
				g.step(1);
				if (g.getState().player.hp <= 0) return { died: i };
			}
			return { alive: true };
		});
		expect(r.died, '斬り合って倒れた').toBeUndefined();
		expect(r.killedAt, '300 tick で倒せない').toBeDefined();
		expect(r.hp).toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});
});
