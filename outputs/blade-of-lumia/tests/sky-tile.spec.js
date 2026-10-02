// tests/sky-tile.spec.js
// 空（SKY・`%`）の見た目の番人（2026-10-02 / PLAN 実行キュー 38）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   空は CSS のグラデーションの固定の星空だった（`game/css/tiles.css` `.cell.sky`）。
//   ユーザー指摘「空が下に見えているなら、星空は変。陸か海が見えるはず」。
//   選ばれた絵＝候補 C「遠い海」・参考画像 `refs/海+雲.png`（はるか下の海と雲）。
//   続けて「止まった雲は床に描いた空の絵にしか見えない」∴海と雲を2層に分け、雲だけ流す。
//
// 守るものは5つ。
//   ① 絵の選び方：128×128 の絵（海・雲の2層）を 32×32 の 16 枚に分け、セル座標で並べる
//      （k＝(r%4)*4 + c%4）＝隣の空と絵が繋がる。期待値は手で書いた表
//      （skyParts の戻り値を期待値にすると、並びが狂っても両側が同じだけ狂って緑になる）。
//   ② 縁：北が空でないセルは崖の面、東西が空でないセルは影。盤面の端は空が続くとみなす。
//   ③ 実ゲーム：空のセルが海と雲の2層の背景で塗られ、縁の部品も記述どおり。画面に海の青が見える。
//   ④ 穴と見分けが付く：平色が穴の黒から十分離れている。2層が本当に分かれている。
//   ⑤ 流れ：時間が経つと雲の層だけが動き、海の層は止まっている。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { skyParts, TILE_CELL_STYLE, colorDistance } from '../shared/cell-appearance.js';
import { SKY_SPRITES, SKY_PAL, SKY_SEA, SKY_CLOUD } from '../shared/sprites-sky.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const room = (lk, sk) => map.layers[lk].stages[sk];
const both = (k) => [`skySea@${k}`, `skyCloud@${k}`];

test.describe('空の見た目 ① 絵の選び方と縁（データ）', () => {
	test('① 切り身はセル座標で選ぶ＝4セルで1周する（手書きの表）', () => {
		const sd = { tiles: Array.from({ length: 10 }, () => new Array(12).fill(TILE.SKY)) };
		const table = [
			[0, 0, 0], [0, 1, 1], [0, 3, 3], [0, 4, 0],
			[1, 0, 4], [1, 2, 6], [3, 3, 15], [4, 4, 0],
			[5, 7, 7], [9, 11, 7], [6, 9, 9],
		];
		for (const [r, c, k] of table) {
			expect(skyParts(sd, r, c).sprs.slice(0, 2), `(${r},${c})`).toEqual(both(k));
		}
		// 32 枚＋縁の部品が全部 32×32 で揃っている（重ねて描ける）
		const names = [...Array.from({ length: 16 }, (_, k) => both(k)).flat(), 'skyLipN', 'skyShadeW', 'skyShadeE'];
		for (const name of names) {
			const g = SKY_SPRITES[name]?.[0];
			expect(g?.length, `${name} の高さ`).toBe(32);
			expect(g.every((row) => row.length === 32), `${name} の幅`).toBe(true);
		}
	});

	test('② 縁＝北が空でなければ崖の面・東西が空でなければ影（実マップ D7 2,2 / 2,1）', () => {
		const d22 = room('dungeon_7', '2,2');
		const cases = [
			// [盤面, r, c, 重ねる部品, edgeCode]
			[d22, 1, 1, [...both(5), 'skyLipN', 'skyShadeW', 'skyShadeE'], 'NWE'],   // 北＝壁・西＝壁・東＝床
			[d22, 3, 2, [...both(14), 'skyLipN', 'skyShadeW'], 'NW'],                // 北＝床・西＝床・東＝空
			[d22, 4, 5, both(1), '-'],                                                // 四方が空＝縁なし
			[room('dungeon_7', '2,1'), 0, 0, both(0), '-'],                           // 盤面の角＝外は空が続く
		];
		for (const [sd, r, c, sprs, edge] of cases) {
			expect(sd.tiles[r][c], `(${r},${c}) が空でない＝盤面が変わった`).toBe(TILE.SKY);
			const p = skyParts(sd, r, c);
			expect(p.sprs, `(${r},${c}) の部品`).toEqual(sprs);
			expect(p.edgeCode, `(${r},${c}) の縁`).toBe(edge);
			expect(p.pal).toBe('sky');
		}
	});

	test('④ 穴（黒）と見分けられる＋海と雲が本当に2層に分かれている', () => {
		const sky = TILE_CELL_STYLE[TILE.SKY].color, pit = TILE_CELL_STYLE[TILE.PIT].color;
		expect(colorDistance(sky, pit), `空 ${sky} と穴 ${pit} が近すぎる`).toBeGreaterThan(120);
		expect(SKY_PAL.sky, '平色が絵のパレットに無い').toContain(sky);
		// 海の層は全面が不透明＝雲が流れて行った後に穴が空かない
		expect(SKY_SEA.flat().every((v) => v > 0), '海の層に透明なドットがある').toBe(true);
		// 雲の層は大半が透明（＝下の海が見える）で、雲がちゃんとある
		const cloud = SKY_CLOUD.flat().filter((v) => v > 0).length / (128 * 128);
		expect(cloud, '雲の層が空っぽ／全面を覆っている').toBeGreaterThan(0.15);
		expect(cloud).toBeLessThan(0.5);
		// 海の層に雲の白い塊が残っていない（白波の点はよい）＝明るい色の 3×3 が全部明るい所が無い
		let blob = 0;
		for (let y = 1; y < 127; y++) for (let x = 1; x < 127; x++) {
			let all = true;
			for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1; dx++) if (SKY_SEA[y + dy][x + dx] < 9) { all = false; break; }
			if (all) blob++;
		}
		expect(blob, '海の層に雲の塊が残っている').toBe(0);
	});
});

test.describe('空の見た目 ③⑤ 実ゲーム', () => {
	const sd = room('dungeon_7', '2,2');
	const goto = async (page) => {
		await page.goto(`${GAME_URL}?fromEditor=1&layer=dungeon_7&stage=2,2&row=8&col=4`);
		await waitForBoard(page);
	};

	test('③ 空のセルは海と雲の2層で塗られ、縁の部品も記述どおり', async ({ page }) => {
		await goto(page);
		const got = await page.evaluate(() => {
			const out = {};
			for (const el of document.querySelectorAll('#board .cell.sky')) {
				const cv = el.querySelector('canvas.tile-sprite');
				out[`${el.dataset.row},${el.dataset.col}`] = {
					sprs: cv?.dataset.tileSprs ?? null,
					edges: cv?.dataset.tileEdges ?? null,
					layers: (getComputedStyle(el).backgroundImage.match(/url\(/g) ?? []).length,
				};
			}
			return out;
		});
		const want = [];
		sd.tiles.forEach((row, r) => row.forEach((t, c) => { if (t === TILE.SKY) want.push(`${r},${c}`); }));
		expect(Object.keys(got).sort(), '空のセルの数が盤面と違う').toEqual(want.sort());
		for (const pos of want) {
			const p = skyParts(sd, ...pos.split(',').map(Number));
			expect(got[pos].sprs, `${pos} の絵`).toBe(p.sprs.join(' '));
			expect(got[pos].edges, `${pos} の縁`).toBe(p.edgeCode);
			expect(got[pos].layers, `${pos} の背景が海と雲の2層でない`).toBe(2);
		}
		// 画面に海の青が見える（縁の無いセルの実ピクセル）
		const inner = want.filter((pos) => skyParts(sd, ...pos.split(',').map(Number)).edgeCode === '-');
		expect(inner.length, '縁の無い空のセルが無い＝盤面が変わった').toBeGreaterThan(3);
		const [r, c] = inner[0].split(',');
		const png = await page.locator(`#board .cell[data-row="${r}"][data-col="${c}"]`).screenshot();
		const blue = await page.evaluate(async (b64) => {
			const im = new Image(); im.src = `data:image/png;base64,${b64}`; await im.decode();
			const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
			const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
			const d = ctx.getImageData(0, 0, im.width, im.height).data;
			let n = 0, t = 0;
			for (let i = 0; i < d.length; i += 4) { t++; if ((d[i + 2] > 150 && d[i + 2] > d[i] + 40) || (d[i] > 180 && d[i + 1] > 180 && d[i + 2] > 200)) n++; }
			return n / t;
		}, png.toString('base64'));
		expect(blue, '空のセルに海の青（か雲の白）が見えない').toBeGreaterThan(0.7);
	});

	test('⑤ 時間が経つと雲の層だけが動き、海の層は止まっている', async ({ page }) => {
		await goto(page);
		const read = () => page.evaluate(() => {
			const el = document.querySelector('#board .cell.sky');
			const [cloud, sea] = getComputedStyle(el).backgroundPosition.split(',').map((s) => s.trim());
			return { cloud, sea };
		});
		await page.waitForTimeout(300);
		const a = await read();
		await page.waitForTimeout(1200);
		const b = await read();
		expect(b.cloud, '雲が流れていない').not.toBe(a.cloud);
		expect(b.sea, '海まで動いている（奥行きの差が出ない）').toBe(a.sea);
	});
});
