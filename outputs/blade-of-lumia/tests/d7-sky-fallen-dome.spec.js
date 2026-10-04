// tests/d7-sky-fallen-dome.spec.js
// dungeon_7 `2,3`（十字路＝D7 の看板部屋）「空の崩れ天蓋」の番人
// （2026-10-04 / PLAN 実行キュー 39 の第3陣 3室目・盤面は `scripts/migrate-d7-2-3-sky-fallen-dome.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   旧 `2,3` は D6 と同じ四角い広間に 5.5m の敵4体（突進猪2・ブーメラン鬼2）を足しただけ。
//   空中の遺跡なのに空が 1 枚も無く、突進の激突先は森の木と茂みだった。
//
// 守るものは3つ。
//   ① データ：盤面（天蓋が抜け落ちた空の裂け目＋四隅の柱）と、敵4体が書き換え前と同じセル。
//   ② 挙動（プレイヤー）：裂け目は越えられない＝北から南へは西か東の橋を回る。
//   ③ 挙動（敵）＝この部屋の見せ場「空は猪を止めるが、ブーメランは通す」：
//      ・裂け目の向こうで軸が合った猪は、空の縁へ突っ込んで気絶する（空へは出ない）
//      ・ブーメラン鬼の投擲は裂け目の上を越えて向こう岸のプレイヤーに届く
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { TARGET as BOARD } from '../scripts/migrate-d7-2-3-sky-fallen-dome.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '2,3';
const st = map.layers[LAYER].stages[ROOM];

const cellsOf = (ch) => {
	const out = [];
	st.tiles.forEach((row, r) => row.forEach((x, c) => { if (x === ch) out.push(`${r},${c}`); }));
	return out;
};

test.describe('D7 2,3 空の崩れ天蓋 ① データ', () => {
	test('① 盤面と敵の構成', () => {
		expect(st.tiles.every((row) => Array.isArray(row) && row.length === 12), 'tiles が文字の配列の配列でない').toBe(true);
		expect(st.tiles.map((row) => row.join('')), '盤面が変わった').toEqual(BOARD);
		// 盤面の定数そのものも確かめる（TARGET を import しているので、移行スクリプト側で
		// 盤面ごと書き換えられると上の比較は素通りする）。
		expect(BOARD[4], '裂け目（行4）').toBe('....%%%%....');
		expect(BOARD[5], '裂け目（行5）').toBe('....%%%%....');
		expect(cellsOf(TILE.CHARGE_BOAR), '突進猪は北と南に1体ずつ（5.5m の配置表と同じセル）').toEqual(['2,5', '7,6']);
		expect(cellsOf(TILE.BOOMERANG_OGRE), 'ブーメラン鬼は上段の左右（同上）').toEqual(['3,3', '3,8']);
		expect(cellsOf(TILE.WALL).filter((k) => !/^(0|9),|,(0|11)$/.test(k)), '柱の残骸は裂け目の四隅').toEqual(['3,4', '3,7', '6,4', '6,7']);
		expect(cellsOf(TILE.TREE).concat(cellsOf(TILE.BUSH)), '森の木・茂みは撤去').toEqual([]);
		expect(cellsOf(TILE.CHEST), '報酬なしの通り道').toEqual([]);
		expect(Object.keys(st.bgTiles ?? {}), '空は tiles の %＝下地は使わない').toEqual([]);
	});
});

// ── 実プレイ（fromEditor=1 プレビュー）──────────────────────────────
async function open(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const { hurt, ...ps } = extra;
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ...ps });
	await page.goto(`${GAME_URL}?${q}`);
	await waitForBoard(page);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）∴HP を測る本は 'g' で切る
	//    （切らないと「轢かれない」「届かない」が無条件に成り立つ）。
	if (hurt) await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// 指定の種類・セル以外の敵を倒す（keep＝残す敵の初期セル "r,c"。空なら全滅）。
const keepOnly = (page, keep) => page.evaluate((keep) => {
	const g = window.__game;
	for (const e of g.getEnemies()) {
		if (!keep.includes(`${Math.round(e.y)},${Math.round(e.x)}`)) g.dealDamage(e.id, 999);
	}
	g.step(1);
	return g.getEnemies().map((e) => ({ id: e.id, type: e.type, r: e.y, c: e.x }));
}, keep);
// 1マス＝movePlayer 2回（[[blade-moveplayer-is-half-tile]]）
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
const snap = (page) => page.evaluate(() => {
	const g = window.__game.getState();
	const p = window.__game.getPlayer();
	return { layer: g.currentLayer, stage: g.stageKey, r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});

test.describe('D7 2,3 空の崩れ天蓋 ② プレイヤー', () => {
	test('② 北の半分から南へ、裂け目は越えられない（はしごでも）', async ({ page }) => {
		const errors = await open(page, 3, 5, { ps_ladder: '1' });
		expect(await keepOnly(page, []), '敵が倒れない').toEqual([]);
		await walk(page, 'down', 3);
		expect(await snap(page), '裂け目 (4,5) へ入れてしまった').toMatchObject({ r: 3, c: 5 });
		expect(errors).toEqual([]);
	});

	test('② 北の口から西の橋を回って南の口へ抜けられる', async ({ page }) => {
		const errors = await open(page, 1, 5);
		expect(await keepOnly(page, []), '敵が倒れない').toEqual([]);
		// (1,5)→(2,5)→西へ (2,3)→(3,3)→(4,3)→(4,2)... 南の半分は (6,3) から (7,3)→(7,5)→(8,5)
		await walk(page, 'down', 1);
		await walk(page, 'left', 2);
		await walk(page, 'down', 5);   // (2,3)→(7,3)
		expect(await snap(page), '西の橋で南の半分へ渡れない').toMatchObject({ r: 7, c: 3 });
		await walk(page, 'right', 2);
		await walk(page, 'down', 1);
		expect(await snap(page)).toEqual({ layer: LAYER, stage: ROOM, r: 8, c: 5 });
		expect(errors).toEqual([]);
	});
});

test.describe('D7 2,3 空の崩れ天蓋 ③ 敵（空は猪を止め、ブーメランは通す）', () => {
	test('③ 裂け目の向こうで軸が合った猪は、空の縁へ突っ込んで気絶する（空へは出ない）', async ({ page }) => {
		// 北の岸 (2,6) に立つ＝南の猪 ω(7,6) と同じ列・距離 5（突進の距離 2〜9 の内）。
		const errors = await open(page, 2, 6, { hurt: true });
		const left = await keepOnly(page, ['7,6']);
		expect(left.map((e) => e.type), '南の猪だけを残す').toEqual(['ω']);
		const r = await page.evaluate((board) => {
			const g = window.__game;
			const id = g.getEnemies()[0].id;
			const out = { stunAt: null, minY: Infinity, onSky: null, hpBefore: g.getState().player.hp };
			for (let i = 0; i < 40; i++) {
				g.step(1);
				const e = g.getEnemies().find((x) => x.id === id);
				out.minY = Math.min(out.minY, e.y);
				for (let rr = Math.floor(e.y); rr <= Math.floor(e.y + 0.999); rr++) {
					for (let cc = Math.floor(e.x); cc <= Math.floor(e.x + 0.999); cc++) {
						if (board[rr]?.[cc] === '%') out.onSky ??= `${e.y},${e.x}@${i}`;
					}
				}
				if (e.stunUntil != null && out.stunAt == null) out.stunAt = { i, y: e.y, x: e.x };
			}
			out.hpAfter = g.getState().player.hp;
			return out;
		}, BOARD);
		expect(r.onSky, '猪が空の上に出た').toBeNull();
		expect(r.stunAt, '猪が空の縁で気絶しない（突進が始まらないか、縁を壁と見なしていない）').not.toBeNull();
		expect(r.stunAt.y, '気絶したのが空の縁（行6）でない').toBe(6);
		expect(r.hpAfter, '裂け目の向こうの猪に轢かれた').toBe(r.hpBefore);
		expect(errors).toEqual([]);
	});

	test('③ ブーメラン鬼の投擲は裂け目の上を越えて、向こう岸に届く', async ({ page }) => {
		// 南の岸 (6,6) に立ち、東の鬼を北の岸 (3,6) へ移す＝同じ列・距離 3（投げる距離 2〜4 の内）。
		// 鬼は間合い（keepMin 2.5〜keepMax 3.5）の内なので歩かずに投げる。
		const errors = await open(page, 6, 6, { hurt: true });
		const left = await keepOnly(page, ['3,8']);
		expect(left.map((e) => e.type), '東の鬼だけを残す').toEqual(['π']);
		const r = await page.evaluate(() => {
			const g = window.__game;
			const id = g.getEnemies()[0].id;
			g.setEnemyFieldForTest(id, { x: 6, y: 3 });
			const out = { overSky: null, maxY: -Infinity, hpBefore: g.getState().player.hp };
			for (let i = 0; i < 40; i++) {
				g.step(1);
				for (const p of g.getProjectiles()) {
					if (p.owner !== 'enemy') continue;
					out.maxY = Math.max(out.maxY, p.y);
					if (p.y >= 4 && p.y < 6) out.overSky ??= `${p.y},${p.x}@${i}`;
				}
			}
			out.hpAfter = g.getState().player.hp;
			return out;
		});
		expect(r.overSky, '鬼の投擲が裂け目の上を飛ばない').not.toBeNull();
		expect(r.hpAfter, '向こう岸のプレイヤーに届かない').toBeLessThan(r.hpBefore);
		expect(errors).toEqual([]);
	});
});
