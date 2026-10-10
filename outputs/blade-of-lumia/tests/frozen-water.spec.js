// キュー44（2026-10-10）：D5「氷の廃墟」の水を「一面に凍った湖面」の絵にした（ユーザー選択＝案B）。
// 🔴 見た目だけ＝タイルは `~`／`=` のまま。はしご・水棲の敵・投擲物・飛行は水と同じ。
//
// 番人の観点：
//   ① 記述（shared/cell-appearance.js）＝D5 の水の下地・tiles 層の水・潮ゲートが凍った水の肌になる／
//      層の名前を渡さないと普通の水（渡し忘れは黙って普通の水になる＝②③が実画面で見張る）／
//      他の層（field の湖）と溶岩は変わらない
//   ② 絵＝部屋1枚ぶんの模様を切り分けた 120 枚（同じ絵の繰り返しにしない）・目地が無い（氷の床と違う）・
//      2コマはきらめきだけが違う（ひびは動かない）
//   ③ 実ゲーム＝D5 の部屋の水は全部凍った水の絵・場所ごとの切り身・アニメーションする／潮ゲートは青緑の氷／
//      field の湖は普通の水のまま（対照）
//   ④ D5 `1,1` の浮氷＝下地が氷の床（湖に浮かぶ板に見える）・この部屋に石は無い（氷の床は石だけを滑らせる）
//
// ⚠ エディタ・ワールドプレビューとの一致は tests/editor-game-parity.spec.js（凍った水の画面を必ず選ぶ）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { SPRITES, PAL } from '../shared/sprites.js';
import { describeCell, cellGlanceColor } from '../shared/cell-appearance.js';
import { WATER_SKIN_BY_LAYER, FROZEN_WATER_ROWS, FROZEN_WATER_COLS, frozenWaterSpriteName, frozenSluiceSpriteName } from '../shared/tile-skins.js';
import { ICE_FLOES, floes, effective } from '../scripts/migrate-d5-1-1-frozen-lake-floes.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const GAME = '/blade-of-lumia/game/';
const D5 = map.layers.dungeon_5.stages;
const FIELD_LAKE = '9,7';   // field で下地の水が一番早く見つかる画面（72 枚）＝対照

const firstFloor = (sd) => {
	for (let r = 0; r < sd.rows; r++) for (let c = 0; c < sd.cols; c++) {
		if (sd.tiles[r][c] === TILE.FLOOR && !sd.bgTiles?.[`${r},${c}`]) return { r, c };
	}
	for (let r = 0; r < sd.rows; r++) for (let c = 0; c < sd.cols; c++) {
		if (sd.tiles[r][c] === TILE.FLOOR && sd.bgTiles?.[`${r},${c}`] !== TILE.WATER) return { r, c };
	}
	throw new Error('床が無い');
};
const firstTile = (sd, t) => {
	for (let r = 0; r < sd.rows; r++) for (let c = 0; c < sd.cols; c++) if (sd.tiles[r][c] === t) return [r, c];
	throw new Error(`${t} が無い`);
};
async function open(page, layer, stage) {
	const sd = map.layers[layer].stages[stage];
	const sp = firstFloor(sd);
	const q = new URLSearchParams({ fromEditor: '1', layer, stage, row: String(sp.r), col: String(sp.c) });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
}

test.describe('凍った水 ① 記述', () => {
	test('D5 の水は凍った水の肌・層を渡さなければ普通の水・他の層と溶岩は変わらない', () => {
		expect(WATER_SKIN_BY_LAYER).toEqual({ dungeon_5: 'frozen' });
		let bgSeen = 0, tileSeen = 0, tideSeen = 0;
		for (const [sk, sd] of Object.entries(D5)) {
			for (let r = 0; r < sd.rows; r++) for (let c = 0; c < sd.cols; c++) {
				const t = sd.tiles[r][c];
				const bg = sd.bgTiles?.[`${r},${c}`];
				const d = describeCell(sd, r, c, undefined, 'dungeon_5');
				const plain = describeCell(sd, r, c);
				const at = `${sk} (${r},${c})`;
				if (t === TILE.WATER) {
					tileSeen++;
					expect(d.obj, at).toMatchObject({ spr: frozenWaterSpriteName(r, c), pal: 'frozenWater', skin: 'frozen' });
					expect(plain.obj, `${at} 層なし`).toMatchObject({ spr: 'water', pal: 'water' });
				} else if (t === TILE.TIDE_GATE) {
					tideSeen++;
					expect(d.obj, at).toMatchObject({ spr: frozenSluiceSpriteName(r, c), pal: 'frozenTide', skin: 'frozen' });
				} else if (bg === TILE.WATER && !d.hideGround) {
					bgSeen++;
					expect(d.ground, at).toEqual({ spr: frozenWaterSpriteName(r, c), pal: 'frozenWater' });
					expect(plain.ground?.spr, `${at} 層なし`).toBe('water');
				}
			}
		}
		// 空振り防止＝3種類とも実データで見た（実測 2026-10-10：下地 494／tiles 19／潮ゲート 17）
		expect(bgSeen).toBeGreaterThan(300);
		expect(tileSeen).toBeGreaterThan(10);
		expect(tideSeen).toBeGreaterThan(10);

		// 見取り図（サムネ）の色＝氷の地。白いひびの色に潰れると湖が真っ白になり魚群と見分けが付かない
		const room = D5['1,1'];
		expect(cellGlanceColor(room, 1, 1, undefined, 'dungeon_5').base).toBe(PAL.frozenWater[2]);
		expect(cellGlanceColor(room, 1, 1).base, '層なしは普通の水の色').toBe('#0e2040');
		expect(cellGlanceColor(D5['1,3'], ...firstTile(D5['1,3'], TILE.WATER), undefined, 'dungeon_5').fg).toBe(PAL.frozenWater[2]);

		// 他の層＝field の湖は普通の水のまま（D5 の名前を渡しても field の画面を描く呼び手は渡さない）
		const lake = map.layers.field.stages[FIELD_LAKE];
		const [k] = Object.entries(lake.bgTiles).find(([, v]) => v === TILE.WATER);
		const [r, c] = k.split(',').map(Number);
		expect(describeCell(lake, r, c, undefined, 'field').ground?.spr).toBe('water');
		// 溶岩は肌の対象外（D5 の名前で描いても赤い水の形のまま）
		const lava = { rows: 1, cols: 1, tiles: [[TILE.LAVA]], bgTiles: {} };
		expect(describeCell(lava, 0, 0, undefined, 'dungeon_5').obj).toMatchObject({ spr: 'water', pal: 'lava' });
	});
});

test.describe('凍った水 ② 絵', () => {
	test('部屋1枚ぶんの 120 枚・繰り返さない・目地が無い・2コマはきらめきだけが違う', () => {
		const names = [];
		for (let r = 0; r < FROZEN_WATER_ROWS; r++) for (let c = 0; c < FROZEN_WATER_COLS; c++) names.push(frozenWaterSpriteName(r, c));
		expect(new Set(names).size).toBe(120);
		const prints = new Set();
		let uniformEdges = 0;
		for (const n of names) {
			const fr = SPRITES[n];
			expect(fr, n).toBeTruthy();
			expect(fr.length, `${n} は2コマ`).toBe(2);
			expect(fr[0].length).toBe(32);
			expect(fr[0][0].length).toBe(32);
			prints.add(fr[0].map((row) => row.join('')).join('|'));
			// 2コマの違いはきらめき（8）だけ＝ひび（5・6）・霜（4）・気泡（7）は動かない
			let diff = 0;
			for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
				const a = fr[0][y][x], b = fr[1][y][x];
				if (a === b) continue;
				diff++;
				expect(a === 8 || b === 8, `${n} (${y},${x}) きらめき以外が動いた ${a}→${b}`).toBe(true);
				expect(Math.min(a, b), `${n} きらめきの下は氷の地`).toBeLessThanOrEqual(3);
			}
			// 目地が無い＝右端の列・下端の行が1色で揃わない（氷の床 iceFloor は全セルが 1＝目地で揃う）。
			// ⚠ 1枚だけなら偶然揃う（ひびがセルの縁に沿う・まだらの1区画に収まる）∴割合で測る
			if (new Set(fr[0].map((row) => row[31])).size === 1 || new Set(fr[0][31]).size === 1) uniformEdges++;
		}
		expect(uniformEdges, `縁が1色のセルが ${uniformEdges}/120＝目地に見える`).toBeLessThanOrEqual(6);
		expect(prints.size, '同じ絵のセルがある＝繰り返して見える').toBe(120);
		// 対照：氷の床の右端は目地で1色（この検査に歯がある）
		expect(new Set(SPRITES.iceFloor[0].map((row) => row[31])).size).toBe(1);
		// きらめきは本当にある（2コマが同じ＝アニメーションしない、を防ぐ）
		const anyGlint = names.some((n) => JSON.stringify(SPRITES[n][0]) !== JSON.stringify(SPRITES[n][1]));
		expect(anyGlint).toBe(true);
	});
});

test.describe('凍った水 ③ 実ゲーム', () => {
	test('D5 1,1：水は全部凍った水の切り身・アニメーションする／field の湖は普通の水（対照）', async ({ page }) => {
		await open(page, 'dungeon_5', '1,1');
		const sd = D5['1,1'];
		const want = Object.entries(sd.bgTiles).filter(([, v]) => v === TILE.WATER).map(([k]) => k);
		const got = await page.evaluate(() => Object.fromEntries(
			[...document.querySelectorAll('#board .cell')].map((el) => [`${el.dataset.row},${el.dataset.col}`, el.dataset.bgSprite ?? null])));
		for (const k of want) {
			const [r, c] = k.split(',').map(Number);
			expect(got[k], `${k} の水`).toBe(frozenWaterSpriteName(r, c));
		}
		expect(Object.values(got).filter((v) => v === 'water').length, '普通の水が残っている').toBe(0);
		// アニメーション＝きらめきのコマが切り替わる（400ms ごと）
		const sel = `#board .cell[data-row="1"][data-col="1"]`;
		const before = await page.locator(sel).evaluate((el) => el.style.backgroundImage);
		await page.waitForFunction(([s, b]) => document.querySelector(s).style.backgroundImage !== b, [sel, before], { timeout: 3000 });

		await open(page, 'field', FIELD_LAKE);
		const lake = await page.evaluate(() => ({
			plain: document.querySelectorAll('#board .cell[data-bg-sprite="water"]').length,
			frozen: document.querySelectorAll('#board .cell[data-bg-sprite^="frozenWater"]').length,
		}));
		expect(lake.plain).toBeGreaterThan(20);
		expect(lake.frozen).toBe(0);
	});

	test('D5 の tiles 層の水と閉じた潮ゲートも凍った水（潮ゲートは青緑の氷）', async ({ page }) => {
		const nameOf = { [TILE.WATER]: frozenWaterSpriteName, [TILE.TIDE_GATE]: frozenSluiceSpriteName };
		for (const [stage, tile, pal] of [['1,3', TILE.WATER, 'frozenWater'], ['0,2', TILE.TIDE_GATE, 'frozenTide']]) {
			const sd = D5[stage];
			const cells = [];
			for (let r = 0; r < sd.rows; r++) for (let c = 0; c < sd.cols; c++) if (sd.tiles[r][c] === tile) cells.push([r, c]);
			expect(cells.length, `${stage} に ${tile} がある`).toBeGreaterThan(0);
			await open(page, 'dungeon_5', stage);
			for (const [r, c] of cells) {
				const info = await page.locator(`#board .cell[data-row="${r}"][data-col="${c}"]`).evaluate((el) => ({
					skin: el.dataset.waterSkin ?? null,
					spr: el.querySelector('canvas.sprite')?.dataset.sprite ?? null,
					pal: el.querySelector('canvas.sprite')?.dataset.pal ?? null,
				}));
				expect(info, `${stage} (${r},${c})`).toEqual({ skin: 'frozen', spr: nameOf[tile](r, c), pal });
			}
		}
	});
});

test.describe('凍った水 ③b 水門（ユーザー選択＝案C）', () => {
	test('水門は凍った湖と同じ切り身に石の枠を焼き込んだ絵・色は湖から離れた明るい青緑', () => {
		const frame = SPRITES.sluiceFrame[0];
		expect(frame[0][0], '枠の外の縁').toBe(11);
		expect(frame[16][16], '枠の中は透明').toBe(0);
		const bad = [];
		for (let r = 0; r < FROZEN_WATER_ROWS; r++) for (let c = 0; c < FROZEN_WATER_COLS; c++) {
			const ice = SPRITES[frozenWaterSpriteName(r, c)][0], gate = SPRITES[frozenSluiceSpriteName(r, c)][0];
			for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
				if (gate[y][x] !== (frame[y][x] || ice[y][x])) bad.push(`${r},${c} (${y},${x})`);
			}
		}
		expect(bad.slice(0, 5), `枠＋氷になっていない画素 ${bad.length}`).toEqual([]);
		// 色＝氷の地（パレット 2）どうしが RGB で十分に離れている（少し寄せただけで湖に溶けた初版の再発防止）
		// 実測：初版 #28675d＝約 36（ユーザー指摘「わかりにくい」）／案C #36a08a＝約 63
		const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
		const [a, b] = [rgb(PAL.frozenWater[2]), rgb(PAL.frozenTide[2])];
		expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(50);
	});

	test('D5 0,2：ボタンで干上げた水門にも石の枠だけが残る／閉じている水門は枠つきの氷', async ({ page }) => {
		const q = new URLSearchParams({ fromEditor: '1', layer: 'dungeon_5', stage: '0,2', row: '3', col: '4' });
		await page.goto(`${GAME}?${q}`);
		await waitForBoard(page);
		await page.evaluate(() => { window.__game.pause(); for (let i = 0; i < 2; i++) { window.__game.movePlayer('left'); window.__game.step(1); } });
		const open = await page.evaluate(() => [...(window.__game.getStageState().openGates ?? [])]);
		expect(open, '岸のボタン (3,3) で西の水門が干上がる').toEqual(['5,3']);
		const look = (r, c) => page.locator(`#board .cell[data-row="${r}"][data-col="${c}"]`).evaluate((el) => ({
			frame: el.dataset.sluiceFrame ?? null,
			sprites: [...el.querySelectorAll('canvas.sprite')].map((cv) => cv.dataset.sprite ?? '(静止画)'),
		}));
		expect(await look(5, 3), '干上がった水門＝枠だけ').toEqual({ frame: '1', sprites: ['(静止画)'] });
		expect(await look(5, 5), '閉じた水門＝枠つきの氷').toEqual({ frame: null, sprites: [frozenSluiceSpriteName(5, 5)] });
	});
});

test.describe('凍った水 ④ D5 1,1 の浮氷', () => {
	test('浮氷の下地は氷の床・浮氷は部屋の数え方と一致・石は無い', async ({ page }) => {
		const sd = D5['1,1'];
		expect([...ICE_FLOES].sort()).toEqual([...floes(effective())].sort());
		for (const k of ICE_FLOES) expect(sd.bgTiles[k], k).toBe(TILE.ICE);
		expect(sd.tiles.flat().includes(TILE.STONE), '氷の床は石を滑らせる＝石があると挙動が変わる').toBe(false);
		await open(page, 'dungeon_5', '1,1');
		for (const k of ICE_FLOES) {
			const [r, c] = k.split(',').map(Number);
			const spr = await page.locator(`#board .cell[data-row="${r}"][data-col="${c}"]`).evaluate((el) => el.dataset.bgSprite ?? null);
			expect(spr, `${k} の浮氷`).toMatch(/^iceFloor/);
		}
	});
});
