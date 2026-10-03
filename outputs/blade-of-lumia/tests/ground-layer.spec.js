// tests/ground-layer.spec.js
// 地面（石畳・砂など）は下地（bgTiles）にだけ置く、の番人（2026-10-03 / PLAN 実行キュー 42）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   tiles 層に石畳 `o` が 114 マス・砂 `d` が 5 マス置かれていて、盤面はそれを「物」として
//   0.7 セル（obj-sprite）の絵で描いていた＝周りに暗い隙間が出て「石畳の中に石畳が小さめに
//   表示される」（2026-09-21 ユーザー報告・field 5,3）。
//
// 守るもの（[[blade-bad-data-fix-five-layers]]）:
//   ① データ＝実マップの全レイヤー・全画面の tiles 層に地面が 0 件
//   ② 移し方の規則（shared/ground-layer.js）＝手書きの小さな盤面で
//   ③ 実ゲーム＝field 5,3 の元 tiles 層だったセルが下地の石畳で描かれ、物の絵が無い
//   ④ ゲームの受け口＝tiles 層に地面が入った古いマップを渡しても、下地として描く
//   ⑤ エディタの入口＝tiles 層に地面が入った控えを読み込んでも、下地として描き・下地として保存する
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { LIFT_GROUND_TILES, liftStageGroundTiles, liftGroundTiles } from '../shared/ground-layer.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP_TEXT = readFileSync(MAP_PATH, 'utf8');
const freshMap = () => JSON.parse(MAP_TEXT);

// field 5,3 の広場で、移す前は tiles 層の石畳だったセル（移行前の JSON の直読み）
const FORMER_TILE_STONE = ['1,4', '1,5', '1,6', '2,1', '2,2', '2,3', '2,8', '2,9', '3,2', '3,9'];
// 同じ画面の素の床（tiles も下地も `.`）＝壊れたデータを差し込む先
const PLAIN = { r: 4, c: 0 };

test.describe('地面の層 ①②（データ）', () => {
	test('① 実マップの tiles 層に地面が 1 つも無い（全レイヤー・全画面）', () => {
		const found = [];
		for (const [lk, ld] of Object.entries(freshMap().layers)) {
			for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
				sd.tiles.forEach((row, r) => row.forEach((ch, c) => {
					if (LIFT_GROUND_TILES.has(ch)) found.push(`${lk} ${sk} ${r},${c} '${ch}'`);
				}));
			}
		}
		expect(found).toEqual([]);
		// 対照＝field 5,3 の元の石畳は下地に在る（消えていない）
		const sd = freshMap().layers.field.stages['5,3'];
		for (const k of FORMER_TILE_STONE) expect(sd.bgTiles[k], k).toBe(TILE.STONE_FLOOR);
	});

	test('② 移し方＝tiles の地面は下地へ（下地の別の地面は上書き）・水と橋は動かさない', () => {
		const st = {
			tiles: [
				[TILE.STONE_FLOOR, TILE.SAND, TILE.WATER, TILE.BRIDGE, TILE.FLOOR, TILE.WALL],
			],
			bgTiles: { '0,0': TILE.GRASS },
		};
		const moved = liftStageGroundTiles(st);
		expect(moved).toEqual(['0,0', '0,1']);
		expect(st.tiles[0]).toEqual([TILE.FLOOR, TILE.FLOOR, TILE.WATER, TILE.BRIDGE, TILE.FLOOR, TILE.WALL]);
		expect(st.bgTiles).toEqual({ '0,0': TILE.STONE_FLOOR, '0,1': TILE.SAND });
		// 2回目は何もしない
		expect(liftStageGroundTiles(st)).toEqual([]);
		// bgTiles を持たない画面にも作って書く
		const bare = { tiles: [[TILE.SNOW]] };
		liftStageGroundTiles(bare);
		expect(bare).toEqual({ tiles: [[TILE.FLOOR]], bgTiles: { '0,0': TILE.SNOW } });
		// マップ全体版は画面ごとの移した位置を返す
		const map = { layers: { a: { stages: { '0,0': { tiles: [[TILE.MUD]] }, '1,0': { tiles: [[TILE.FLOOR]] } } } } };
		expect(liftGroundTiles(map).changes).toEqual([{ layer: 'a', stage: '0,0', cells: ['0,0'] }]);
	});
});

/** field 5,3 の指定セルの「描かれ方」を読む */
function readCells(page, keys) {
	return page.evaluate((ks) => Object.fromEntries(ks.map((k) => {
		const [r, c] = k.split(',');
		const el = document.querySelector(`#board .cell[data-row="${r}"][data-col="${c}"]`);
		return [k, {
			bg: el?.dataset.bgSprite ?? null,
			obj: el ? el.querySelectorAll('canvas.obj-sprite, canvas.field-sprite').length : -1,
		}];
	})), keys);
}

test.describe('地面の層 ③④（実ゲーム）', () => {
	test('③ field 5,3 の元 tiles 層の石畳は下地の石畳で描かれ、物の絵（0.7 セル）が無い', async ({ page }) => {
		await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=5,3&row=4&col=0`);
		await waitForBoard(page);
		await page.evaluate(() => window.__game.pause());
		const got = await readCells(page, FORMER_TILE_STONE);
		for (const k of FORMER_TILE_STONE) {
			expect(got[k].bg, `${k} が下地の石畳で描かれていない`).toMatch(/^stoneFloor@\d+$/);
			expect(got[k].obj, `${k} に物の絵が残っている`).toBe(0);
		}
	});

	test('④ tiles 層に地面が入った古いマップを渡しても、下地として描く（受け口）', async ({ page }) => {
		const bad = freshMap();
		const sd = bad.layers.field.stages['5,3'];
		expect(sd.tiles[PLAIN.r][PLAIN.c]).toBe(TILE.FLOOR);
		expect(sd.bgTiles[`${PLAIN.r},${PLAIN.c}`]).toBeUndefined();
		sd.tiles[PLAIN.r][PLAIN.c] = TILE.STONE_FLOOR;   // 移行前の壊れた置き方を再現
		await page.route('**/work/blade-of-lumia.json', (route) => route.fulfill({
			status: 200, contentType: 'application/json', body: JSON.stringify(bad),
		}));
		await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=5,3&row=4&col=1`);
		await waitForBoard(page);
		await page.evaluate(() => window.__game.pause());
		const key = `${PLAIN.r},${PLAIN.c}`;
		// 対照＝同じ画面の素の床（tiles も下地も `.`）＝下地の絵が無いことを確かめて、読み方が正しいと示す
		const got = await readCells(page, [key, '5,0']);
		expect(sd.tiles[5][0]).toBe(TILE.FLOOR);
		expect(got['5,0'].bg, '素の床に下地の絵が付いている＝読み方が間違い').toBeNull();
		expect(got[key].bg, '差し込んだ石畳が下地として描かれていない').toMatch(/^stoneFloor@\d+$/);
		expect(got[key].obj).toBe(0);
	});
});

test.describe('地面の層 ⑤（エディタ）', () => {
	test('⑤ tiles 層に地面が入った控えを読み込むと、下地として描き・下地として保存する', async ({ page }) => {
		const bad = freshMap();
		const sd = bad.layers.field.stages['5,3'];
		sd.tiles[PLAIN.r][PLAIN.c] = TILE.STONE_FLOOR;
		// エディタは localStorage の控えからしか復元しない∴入れてから読み直す（最小化＝容量の上限）
		await page.goto('/blade-of-lumia/editor/');
		await page.evaluate((json) => localStorage.setItem('bladeOfLumiaMapData', json), JSON.stringify(bad));
		await page.reload();
		await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
		const tabs = page.locator('#layer-tabs button.layer-tab');
		for (let i = 0; i < await tabs.count(); i++) {
			if (await tabs.nth(i).evaluate((el) => el.childNodes[0]?.textContent ?? '') === 'field') { await tabs.nth(i).click(); break; }
		}
		await page.locator('#world-grid .world-cell').filter({ has: page.locator('.cell-coord', { hasText: /^\(5,3\)/ }) }).first().click();
		await page.locator('#btn-edit-stage').click();
		await page.waitForSelector('#stage-canvas', { state: 'visible' });

		// 描画＝下地の地面の絵（`stoneFloor@N@パレット`）。物として描くと変種の無い `stoneFloor@stoneFloor` になる
		const log = await page.evaluate((k) => window.__editorDrawLog.get(k), `${PLAIN.r},${PLAIN.c}`);
		expect(log.sprs[0], 'エディタが tiles 層の石畳を物として描いている').toMatch(/^stoneFloor@\d+@stoneFloor$/);

		await page.locator('#btn-save').click();
		const saved = await page.evaluate((p) => {
			const m = JSON.parse(localStorage.getItem('bladeOfLumiaMapData'));
			const s = m.layers.field.stages['5,3'];
			return { t: s.tiles[p.r][p.c], bg: s.bgTiles[`${p.r},${p.c}`] };
		}, PLAIN);
		expect(saved).toEqual({ t: TILE.FLOOR, bg: TILE.STONE_FLOOR });
	});
});
