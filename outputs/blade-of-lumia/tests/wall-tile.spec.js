// tests/wall-tile.spec.js
// 壁（WALL・`#`）の見た目の番人（2026-10-03 / PLAN 実行キュー 23）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   実ゲームの壁は CSS の単色（`--wall-color` #3a4448）だけ＝どの部屋でも無地の灰色の四角で、
//   石畳（敷石の絵）の方が壁らしく見えていた（ユーザー指摘「壁の表示もただのグレーの正方形で、
//   他のタイルに比べて表現力が低すぎておかしい」）。
//
// 守るもの（✅ ユーザー選択＝叩き台 B「上面＋前面」）:
//   ① 部品＝天端（セル座標で 16 枚）＋南が開いていれば前面＋北・東西の縁（実マップのセルで手書きの期待値）
//   ② 地図の全部の壁の部品が 32×32 の絵として在る・天端と前面は全面不透明（床が透けない）
//   ③ 実ゲーム＝壁のセルが記述どおりの部品で塗られ、前面（南が床の壁の下側）は天端より明るい
//   ④ エディタ＝パレットの壁のボタンが絵を持つ
//   （エディタ・プレビュー・ゲームの3系の一致は tests/editor-game-parity.spec.js の「壁」カテゴリ）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { wallParts } from '../shared/cell-appearance.js';
import { WALL_FACE_H } from '../shared/sprites-wall.js';
import { SPRITES, PAL } from '../shared/sprites.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const room = (lk, sk) => map.layers[lk].stages[sk];

test.describe('壁の見た目 ①②（データ）', () => {
	test('① 部品＝天端＋南の前面＋北・東西の縁（実マップ・手書きの期待値）', () => {
		const cases = [
			// [層, 画面, r, c, 部品, edgeCode]
			// 部屋の外枠の角＝周りが壁と盤面の外だけ＝天端のみ
			['dark_tower', '4,3', 0, 0, ['wallCap@0'], '-'],
			// 北の扉口の西隣＝南が床（前面）・東が扉口（前面の端まで輪郭）
			['dark_tower', '4,3', 0, 4, ['wallCap@0', 'wallFaceS@0', 'wallEdgeE.s'], 'SE'],
			// 仕切り壁の西端＝北・南・西が床
			['dark_tower', '4,3', 2, 2, ['wallCap@10', 'wallFaceS@2', 'wallEdgeN', 'wallEdgeW.s'], 'SNW'],
			// その東隣＝南が壁（前面なし）・北と東が床＝東の縁は天端の全高
			['dark_tower', '4,3', 2, 3, ['wallCap@11', 'wallEdgeN', 'wallEdgeE'], 'NE'],
			// field の石畳の中の壁（2026-09-21 のユーザー報告の現物）＝四方が開いている
			['field', '5,3', 1, 2, ['wallCap@6', 'wallFaceS@2', 'wallEdgeN', 'wallEdgeW.s', 'wallEdgeE.s'], 'SNWE'],
		];
		for (const [lk, sk, r, c, sprs, edge] of cases) {
			const sd = room(lk, sk);
			expect(sd.tiles[r][c], `${lk} ${sk} (${r},${c}) が壁でない＝盤面が変わった`).toBe(TILE.WALL);
			const p = wallParts(sd, r, c);
			expect(p.sprs, `${lk} ${sk} (${r},${c}) の部品`).toEqual(sprs);
			expect(p.edgeCode, `${lk} ${sk} (${r},${c}) の縁`).toBe(edge);
			expect(p.pal).toBe('wall');
		}
		// 盤面の外は壁が続くとみなす＝外枠の外側に輪郭を出さない（手作りの盤面で端を縛る）
		const edge = wallParts({ tiles: [[TILE.WALL, '.']] }, 0, 0);
		expect(edge.sprs, '盤面の端の壁').toEqual(['wallCap@0', 'wallEdgeE']);
		expect(edge.edgeCode).toBe('E');
	});

	test('② 地図の全部の壁の部品が 32×32 の絵として在る・天端と前面は全面不透明', () => {
		let n = 0;
		const used = new Set();
		for (const [lk, ld] of Object.entries(map.layers)) {
			for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
				sd.tiles?.forEach((row, r) => row.forEach((t, c) => {
					if (t !== TILE.WALL) return;
					n++;
					for (const s of wallParts(sd, r, c).sprs) used.add(s);
				}));
			}
		}
		expect(n, '壁が地図に無い＝走査が空振り').toBeGreaterThan(5000);
		expect(PAL.wall, 'パレット wall が無い').toBeTruthy();
		for (const s of used) {
			const g = SPRITES[s]?.[0];
			expect(g?.length, `${s} が無い／高さ違い`).toBe(32);
			expect(g.every((row) => row.length === 32), `${s} の幅`).toBe(true);
		}
		// 天端は 16 枚とも使われ、全部のドットが塗られている（床の色が透けない）
		const caps = [...used].filter((s) => s.startsWith('wallCap@'));
		expect(caps.length, '天端の切り身が全部使われていない').toBe(16);
		for (const s of caps) expect(SPRITES[s][0].flat().includes(0), `${s} に透明なドット`).toBe(false);
		// 前面は下 WALL_FACE_H 行＋その上の光の1行が全部塗られている
		for (const s of [...used].filter((s) => s.startsWith('wallFaceS@'))) {
			const rows = SPRITES[s][0].slice(32 - WALL_FACE_H - 1);
			expect(rows.flat().includes(0), `${s} の前面に透明なドット`).toBe(false);
		}
	});
});

test.describe('壁の見た目 ③ 実ゲーム', () => {
	test('③ 壁のセルは記述どおりの部品で塗られ、前面は天端より明るい（dark_tower 4,3）', async ({ page }) => {
		const sd = room('dark_tower', '4,3');
		await page.goto(`${GAME_URL}?fromEditor=1&layer=dark_tower&stage=4,3&row=1&col=1`);
		await waitForBoard(page);
		await page.evaluate(() => window.__game.pause());
		const got = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#board .cell.wall')].map((el) => [
			`${el.dataset.row},${el.dataset.col}`, el.querySelector('canvas.tile-sprite')?.dataset.tileSprs ?? null,
		])));
		const want = [];
		sd.tiles.forEach((row, r) => row.forEach((t, c) => { if (t === TILE.WALL) want.push(`${r},${c}`); }));
		expect(Object.keys(got).sort()).toEqual(want.sort());
		for (const pos of want) expect(got[pos], pos).toBe(wallParts(sd, ...pos.split(',').map(Number)).sprs.join(' '));

		// 実ピクセル＝前面のある (2,2) の下側は、前面の無い (2,3) の下側（天端）より明るい
		const bottomLum = async (r, c) => {
			const png = await page.locator(`#board .cell[data-row="${r}"][data-col="${c}"]`).screenshot();
			return page.evaluate(async (b64) => {
				const im = new Image(); im.src = `data:image/png;base64,${b64}`; await im.decode();
				const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
				const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
				const y0 = Math.floor(im.height * 0.62), y1 = Math.floor(im.height * 0.95);
				const x0 = Math.floor(im.width * 0.15), x1 = Math.floor(im.width * 0.85);
				const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
				let s = 0;
				for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
				return s / (d.length / 4);
			}, png.toString('base64'));
		};
		const face = await bottomLum(2, 2), cap = await bottomLum(2, 3);
		expect(face - cap, `前面 ${face.toFixed(1)} と天端 ${cap.toFixed(1)} の明るさの差が小さい`).toBeGreaterThan(20);
		// 単色に戻っていない＝天端のセルの中に明暗のばらつきがある
		expect(cap, '天端が床と同じくらい暗い／明るすぎる').toBeGreaterThan(25);
		expect(cap).toBeLessThan(90);
	});
});

test.describe('壁 ④ エディタ', () => {
	test('④ パレットの壁のボタンが絵（文字ではない）を持つ', async ({ page }) => {
		await page.goto('/blade-of-lumia/editor/');
		// パレットはステージを開くまで隠れている＝DOM に在れば足りる
		await page.waitForSelector('#tile-palette .tile-btn', { state: 'attached' });
		const btn = page.locator('#tile-palette .tile-btn[title="壁"]');
		await expect(btn).toHaveCount(1);
		await expect(btn.locator('canvas')).toHaveCount(1);
		await expect(btn.locator('.tile-icon')).toHaveCount(0);
	});
});
