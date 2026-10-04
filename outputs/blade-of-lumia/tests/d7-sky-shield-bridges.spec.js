// tests/d7-sky-shield-bridges.spec.js
// dungeon_7 `3,4`（十字路 `2,3` の南東の通り道）「空の盾騎士の細橋」の番人
// （2026-10-04 / PLAN 実行キュー 39 の第4陣 2室目・盤面は `scripts/migrate-d7-3-4-sky-shield-bridges.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   旧 `3,4` は D6 と同じ四角い広間に床のルピー×5 が1つあるだけ。空も敵も無かった。
//
// 守るものは3つ。
//   ① データ：盤面（広場＋幅1の細橋3本）・盾騎士2体と向き・報酬なし・配置表の外の宣言。
//   ② 挙動（プレイヤー）：3つの口のどれからでも、ほかの口へ歩ける。細橋は幅1＝横に並べない。
//   ③ 挙動（敵）＝この部屋の見せ場「細橋の上では盾騎士の背後へ回れない」：
//      ・細橋で正面から出会うと、斬っても弾かれて押し戻されるだけ（騎士の HP は減らない）
//      ・広場では横から斬れば通る（対照＝同じ騎士を正面から斬ると弾かれる）
//      ・口で立ち止まると騎士が細橋の口を塞ぐ／駆け抜ければ橋で出会わずに広場へ着く
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET as BOARD, KNIGHTS, KNIGHT_DIRS, EXITS, BRIDGES, walkable, bridgeIsNarrow,
} from '../scripts/migrate-d7-3-4-sky-shield-bridges.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '3,4';
const st = map.layers[LAYER].stages[ROOM];

const cellsOf = (ch) => {
	const out = [];
	st.tiles.forEach((row, r) => row.forEach((x, c) => { if (x === ch) out.push(`${r},${c}`); }));
	return out;
};

test.describe('D7 3,4 空の盾騎士の細橋 ① データ', () => {
	test('① 盤面・盾騎士・報酬なし', () => {
		expect(st.tiles.every((row) => Array.isArray(row) && row.length === 12), 'tiles が文字の配列の配列でない').toBe(true);
		expect(st.tiles.map((row) => row.join('')), '盤面が変わった').toEqual(BOARD);
		// 盤面の定数そのものも確かめる（TARGET を import しているので、移行スクリプト側で
		// 盤面ごと書き換えられると上の比較は素通りする）。
		expect(BOARD[4], '東の細橋（行4）').toBe('.%%%........');
		expect(BOARD[5], '西の細橋（行5）').toBe('........%%%.');
		expect(BOARD[1], '北の細橋（列5）').toBe('#%%%%.%%%%%#');
		expect(cellsOf(TILE.SHIELD_KNIGHT), '盾騎士は広場の南に2体').toEqual(['7,5', '7,6']);
		expect(KNIGHTS).toEqual(['7,5', '7,6']);
		expect(st.enemyDirs, '盾騎士は北（広場の側）を向く').toEqual({ '7,5': 'up', '7,6': 'up' });
		expect(KNIGHT_DIRS).toEqual(st.enemyDirs);
		const others = Object.keys(ENEMY_META).filter((ch) => ch !== TILE.SHIELD_KNIGHT && cellsOf(ch).length);
		expect(others, '盾騎士のほかに敵がいる').toEqual([]);
		expect(ENEMY_META[TILE.SHIELD_KNIGHT].blockFacing, '盾騎士の正面ブロック（この部屋の前提）').toBeTruthy();
		expect(cellsOf(TILE.CHEST), '報酬なしの通り道').toEqual([]);
		expect(st.floorItems ?? {}, '旧 床のルピーは撤去').toEqual({});
		expect(Object.keys(st.bgTiles ?? {}), '空は tiles の %＝下地は使わない').toEqual([]);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'5.5m の配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
	});
});

test.describe('D7 3,4 空の盾騎士の細橋 ② 地形', () => {
	test('② 3つの口がつながり、細橋は幅1・取り残された床は無い', () => {
		const t = st.tiles;
		for (const [from, fc] of Object.entries(EXITS)) {
			const f = walkable(t, fc[0], false);
			for (const [to, cells] of Object.entries(EXITS)) {
				if (to !== from) expect(cells.every((k) => f.has(k)), `${from}の口から${to}の口へ歩けない`).toBe(true);
			}
		}
		expect(bridgeIsNarrow(t, BRIDGES.北.slice(1), 'v'), '北の細橋が幅1でない').toBe(true);
		expect(bridgeIsNarrow(t, BRIDGES.西.slice(1), 'h'), '西の細橋が幅1でない').toBe(true);
		expect(bridgeIsNarrow(t, BRIDGES.東.slice(0, -1), 'h'), '東の細橋が幅1でない').toBe(true);
		const foot = walkable(t, EXITS.北[0], false);
		const floor = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ch !== TILE.WALL && ch !== TILE.SKY) floor.push(`${r},${c}`); }));
		expect(floor.filter((k) => !foot.has(k)), '取り残された床がある').toEqual([]);
		expect(walkable(t, EXITS.北[0], true).size, 'はしごで空を渡れてしまう').toBe(foot.size);
	});
});

// ── 実プレイ（fromEditor=1 プレビュー）──────────────────────────────
async function open(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const { hurt, ...ps } = extra;
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '10', ...ps });
	await page.goto(`${GAME_URL}?${q}`);
	await waitForBoard(page);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）∴HP を測る本は 'g' で切る。
	if (hurt) await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// 指定のセルの敵だけを残す（keep＝残す敵の初期セル "r,c"）。
const keepOnly = (page, keep) => page.evaluate((keep) => {
	const g = window.__game;
	for (const e of g.getEnemies()) {
		if (!keep.includes(`${Math.round(e.y)},${Math.round(e.x)}`)) g.dealDamage(e.id, 999);
	}
	g.step(1);
	return g.getEnemies().map((e) => ({ id: e.id, type: e.type, r: e.y, c: e.x, hp: e.hp }));
}, keep);
const snap = (page) => page.evaluate(() => {
	const g = window.__game.getState();
	const p = window.__game.getPlayer();
	return { layer: g.currentLayer, stage: g.stageKey, r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});

test.describe('D7 3,4 空の盾騎士の細橋 ③ 敵（細橋では背後へ回れない）', () => {
	test('③ 細橋で正面から出会うと、斬っても弾かれて押し戻されるだけ', async ({ page }) => {
		// 西の細橋 (5,1) で東を向いて待ち、騎士が届いたら斬り続ける（騎士は1体だけ残す）。
		const errors = await open(page, 5, 1, { hurt: true });
		expect((await keepOnly(page, ['7,5'])).map((e) => e.type)).toEqual([TILE.SHIELD_KNIGHT]);
		const r = await page.evaluate(() => {
			const g = window.__game;
			g.setHeroDir('right');
			const ehp0 = g.getEnemies()[0].hp, hp0 = g.getState().player.hp;
			let swings = 0, onBridge = null;
			for (let i = 1; i <= 120; i++) {
				g.step(1);
				const e = g.getEnemies()[0], pl = g.getPlayer();
				if (onBridge == null && e.y === 5 && e.x <= 3) onBridge = i;
				if (Math.abs(e.y - pl.y) < 0.6 && e.x > pl.x && e.x - pl.x <= 1.3) { g.setHeroDir('right'); g.swordAttack(); swings++; }
			}
			const e = g.getEnemies()[0], pl = g.getPlayer();
			return { swings, onBridge, enemyHpLost: ehp0 - e.hp, playerHpLost: hp0 - g.getState().player.hp, px: pl.x, ey: e.y };
		});
		expect(r.onBridge, '騎士が細橋へ出てこない').not.toBeNull();
		expect(r.swings, '騎士に届いて斬った回数').toBeGreaterThanOrEqual(3);
		expect(r.enemyHpLost, '細橋の上で正面から斬って騎士の HP が減った＝回り込めてしまう').toBe(0);
		expect(r.px, '弾かれて押し戻されていない').toBeLessThan(1);
		expect(r.playerHpLost, '正面の騎士の剣が当たらない').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('③ 広場では横から斬れば通る（対照＝同じ騎士を正面から斬ると弾かれる）', async ({ page }) => {
		const hit = async (row, col, dir) => {
			await open(page, row, col);
			const left = await keepOnly(page, ['7,5']);
			expect(left.map((e) => e.type)).toEqual([TILE.SHIELD_KNIGHT]);
			return page.evaluate((dir) => {
				const g = window.__game;
				const e0 = g.getEnemies()[0];
				g.setHeroDir(dir);
				g.swordAttack();
				for (let i = 0; i < 3; i++) g.step(1);
				const e = g.getEnemies()[0];
				return { lost: e0.hp - e.hp, dir: e.dir };
			}, dir);
		};
		// 騎士 (7,5) は北を向いて置かれている（最初の 720ms は向き直らない）。
		const side = await hit(7, 4, 'right');
		expect(side.lost, '広場で横（西）から斬って通らない').toBeGreaterThan(0);
		const front = await hit(6, 5, 'down');
		expect(front.dir, '騎士の向き（対照の前提）').toBe('up');
		expect(front.lost, '対照：正面（北）から斬っても通ってしまう＝向きのブロックが効いていない').toBe(0);
	});

	test('③ 口で立ち止まると騎士が細橋を塞ぐ／駆け抜ければ橋で出会わずに広場へ着く', async ({ page }) => {
		// 立ち止まる：西の口 (5,0) で待つ＝騎士が西の細橋（行5・列1〜3）へ乗る。
		let errors = await open(page, 5, 0);
		const plugged = await page.evaluate(() => {
			const g = window.__game;
			for (let i = 1; i <= 60; i++) {
				g.step(1);
				if (g.getEnemies().some((e) => e.y === 5 && e.x <= 3)) return i;
			}
			return null;
		});
		expect(plugged, '待っても騎士が細橋の口を塞がない').not.toBeNull();
		expect(plugged, '騎士が速すぎる（駆け抜ける暇が無い）').toBeGreaterThan(16);
		expect(errors).toEqual([]);
		// 駆け抜ける：同じ口から東へ4マス＝広場の西端 (5,4) へ。
		errors = await open(page, 5, 0);
		await page.evaluate(() => {
			const g = window.__game;
			for (let i = 0; i < 8; i++) { g.movePlayer('right'); g.step(1); }
		});
		expect(await snap(page), '駆け抜けても広場へ着かない（橋の上で塞がれた）').toEqual({ layer: LAYER, stage: ROOM, r: 5, c: 4 });
		expect(errors).toEqual([]);
	});
});
