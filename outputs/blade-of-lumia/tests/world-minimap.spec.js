// ── tests/world-minimap.spec.js ── キュー11c ───────────────────────────────
// 不変条件：**ワールドマップのサムネ（1セル=1px の見取り図）に、そのセルに乗っている
// 物が必ず出る**。旧実装は手書きの色表（`MINIMAP_COLORS`）に載っている文字だけに前景
// ドットを打っていたので、表に無い物（橋・木・山・茂み・家・柵・看板・多くの敵＝実測
// 7,078 セル）が地面と同じ色で消えていた＝「ぱっと見でどういうステージなのか把握し
// づらい」（2026-09-13 ユーザー指摘）。
//
// 🔴 当て所＝「手書きの表に戻ったら落ちる」形にする（[[blade-enemy-tables-derive-from-meta]]
//    ＝手書きの一覧は必ず取りこぼす）。∴タイルを手で並べず
//    ① 実マップ全セルを走査して「絵があるセルは必ず前景色を持つ」を数で要求する
//    ② `TILE_SPRITE_MAP`（タイル→絵の単一ソース）に載っている**全タイル**が色を出せる
//       ことを要求する＝新しいタイルを足しても自動で網に掛かる
//    ③ 実ブラウザのサムネの**実ピクセル**を読み、共通ソースの答えと一致することを見る
//       （drawMinimap が共通ソースを本当に使っているか＝写した期待値では見抜けない）
//
// 意図した差：サムネは「絵」ではなく「見取り図」＝1セル1色に潰す∴他の3系（ゲームの
// 盤面・ステージキャンバス・右下プレビュー）とドット単位では一致しない。潰し方の決め事は
// shared/cell-appearance.js の 11c 節にある（面積が一番広い明るい色／変種と継ぎ目は解決
// しない／下地と近すぎる色は押しのける）。

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { gameLayerEntries } from '../shared/layers.js';
import {
	cellGlanceColor, spriteGlanceColor, colorDistance,
	BG_TILE_STYLE, HIDE_GROUND_TILES,
	GLANCE_MIN_SEPARATION, GLANCE_DARK_LUM, GLANCE_DULL_SAT,
} from '../shared/cell-appearance.js';

const EDITOR = '/blade-of-lumia/editor/';
const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

// ユーザーが「出ていない」と挙げた物＝橋・障害物・建物。ここが消えたら回帰。
const REPORTED = {
	[TILE.BRIDGE]: '橋', [TILE.TREE]: '木', [TILE.MOUNTAIN]: '山', [TILE.BUSH]: '茂み',
	[TILE.HOUSE_WALL]: '家（壁）', [TILE.HOUSE_ROOF]: '家（屋根）',
	[TILE.FENCE]: '柵', [TILE.SIGN]: '看板',
};

test.describe('ワールドマップのサムネ – 実マップ全走査', () => {

	test('① 絵があるセルは必ず前景色を持ち、下地と見分けが付く', () => {
		let cells = 0, withArt = 0;
		const seen = new Map();          // タイル → 前景色を持ったセル数
		const tooClose = [];
		for (const [lk, ld] of gameLayerEntries(MAP)) {
			for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
				if (!sd?.tiles) continue;
				for (let r = 0; r < sd.rows; r++) {
					for (let c = 0; c < sd.cols; c++) {
						cells++;
						const t = sd.tiles[r][c];
						const g = cellGlanceColor(sd, r, c, t);
						// 絵を持つタイル（TILE_SPRITE_MAP に載っている／連結タイル）は
						// 必ず色が出る＝「表に無いので描かない」が起きない。
						if (!TILE_SPRITE_MAP[t]) continue;
						withArt++;
						expect(g.fg, `${lk}/${sk} (${r},${c}) '${t}' に前景色が無い`).toBeTruthy();
						const d = colorDistance(g.fg, g.base);
						if (d < GLANCE_MIN_SEPARATION - 0.5) tooClose.push(`${lk}/${sk} (${r},${c}) '${t}' d=${d.toFixed(1)}`);
						seen.set(t, (seen.get(t) ?? 0) + 1);
					}
				}
			}
		}
		expect(tooClose.slice(0, 10), '下地と近すぎて1ドットでは見分けが付かないセル').toEqual([]);
		// 空振り防止（実マップの実測＝62,640 セル／絵があるセル 8,059／タイル 47 種）
		expect(cells).toBeGreaterThan(50000);
		expect(withArt).toBeGreaterThan(6000);
		expect(seen.size).toBeGreaterThan(30);
		// ユーザーが挙げた物が実際に含まれていること（画面の作り替えで消えたら気付く）
		for (const [t, name] of Object.entries(REPORTED)) {
			expect(seen.get(t) ?? 0, `${name}（'${t}'）が1セルも色を持っていない`).toBeGreaterThan(0);
		}
	});

	test('② 絵を持つタイルは全部サムネの色を出せる（手書きの一覧を持たない）', () => {
		const missing = [];
		for (const [t, si] of Object.entries(TILE_SPRITE_MAP)) {
			const color = spriteGlanceColor(si.spr, si.pal);
			if (!color) missing.push(`'${t}' → ${si.spr}@${si.pal}`);
		}
		expect(missing, 'TILE_SPRITE_MAP に載っているのに色が出せないタイル').toEqual([]);
		expect(Object.keys(TILE_SPRITE_MAP).length).toBeGreaterThan(50);
	});

	test('③ 潰した色は「暗くて色味も無い」に落ちない（1ドットの記号として読める）', () => {
		// 面積が一番広い明るい色を採ると、絵によっては真っ黒（魔王）や無彩色の暗い灰
		// （レバー）が出る＝1ドットでは何も見えない。その場合だけ「一番鮮やかな色」に
		// 切り替える決め事があり、ここはその**結果**を測る（返った色を自分で測り直す）。
		const bad = [];
		let checked = 0;
		for (const [t, si] of Object.entries(TILE_SPRITE_MAP)) {
			const color = spriteGlanceColor(si.spr, si.pal);
			if (!color) continue;
			checked++;
			const v = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
			const lum = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
			const sat = Math.max(...v) - Math.min(...v);
			if (lum < GLANCE_DARK_LUM && sat < GLANCE_DULL_SAT) {
				bad.push(`'${t}' ${si.spr}@${si.pal} → ${color} (明度 ${lum.toFixed(0)} 彩度 ${sat})`);
			}
		}
		expect(bad, '暗くて色味も無い＝1ドットでは見えない色になったタイル').toEqual([]);
		expect(checked).toBeGreaterThan(50);
	});

	test('⑤ 絵がある下地は床の暗色に落ちない（島の角が穴に見えない）', () => {
		// `BG_TILE_STYLE`（実ゲームの CSS の写し）に色が無い地面＝島の角 q/j/y/z。
		// 下地の色をそのまま `cellBaseColor` に任せると床の暗色になり、サムネでは
		// 島の縁だけ黒く抜けて穴のように見えた（拡大画像で気付いた defect）。
		const floor = BG_TILE_STYLE[TILE.FLOOR].color;
		const holes = [];
		let checked = 0;
		for (const [lk, ld] of gameLayerEntries(MAP)) {
			for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
				if (!sd?.tiles) continue;
				for (const [pos, bg] of Object.entries(sd.bgTiles ?? {})) {
					if (!bg || bg === TILE.FLOOR || BG_TILE_STYLE[bg]?.cls) continue;
					if (!TILE_SPRITE_MAP[bg]) continue;      // 絵が無い下地は対象外
					const [r, c] = pos.split(',').map(Number);
					const t = sd.tiles[r]?.[c];
					if (t === undefined || HIDE_GROUND_TILES.has(t)) continue;
					checked++;
					const g = cellGlanceColor(sd, r, c, t);
					if (g.base === floor) holes.push(`${lk}/${sk} (${r},${c}) bg='${bg}'`);
				}
			}
		}
		expect(holes.slice(0, 10), '絵があるのに床の暗色になった下地').toEqual([]);
		expect(checked, '対象の下地セル（実測 53）').toBeGreaterThan(40);
	});

});

test.describe('ワールドマップのサムネ – 実ブラウザ', () => {

	// 橋・家・山・木・看板・宝箱・敵が同居する画面（実マップから選んだ）
	const SCREENS = ['5,3', '6,0'];

	test('④ サムネの実ピクセルが共通ソースの色と一致する', async ({ page }) => {
		page.on('dialog', d => d.dismiss().catch(() => {}));
		await page.goto(EDITOR);
		await page.waitForSelector('#world-grid');
		const chooser = page.waitForEvent('filechooser');
		await page.locator('#btn-load').click();
		await (await chooser).setFiles(MAP_PATH);
		await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
		await page.locator('#tab-world').click();

		for (const sk of SCREENS) {
			const sd = MAP.layers.field.stages[sk];
			expect(sd, `field/${sk} が実マップに無い`).toBeTruthy();
			const [x, y] = sk.split(',').map(Number);
			const cell = page.locator('#world-grid .world-cell').filter({
				has: page.locator('.cell-coord', { hasText: new RegExp(`^\\(${x},${y}\\)`) }),
			}).first();
			// サムネが実際に描いたピクセルを読む（描画結果そのもの）
			const dots = await cell.locator('canvas.minimap-canvas').evaluate((cv) => {
				const ctx = cv.getContext('2d');
				const out = [];
				for (let r = 0; r < cv.height; r++) {
					for (let c = 0; c < cv.width; c++) {
						const d = ctx.getImageData(c, r, 1, 1).data;
						out.push(`#${[d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`);
					}
				}
				return { w: cv.width, h: cv.height, out };
			});
			expect(dots.w, `field/${sk} のサムネの幅`).toBe(sd.cols);
			expect(dots.h, `field/${sk} のサムネの高さ`).toBe(sd.rows);

			let arted = 0;
			for (let r = 0; r < sd.rows; r++) {
				for (let c = 0; c < sd.cols; c++) {
					const g = cellGlanceColor(sd, r, c, sd.tiles[r][c]);
					if (g.fg) arted++;
					expect(dots.out[r * sd.cols + c], `field/${sk} (${r},${c}) '${sd.tiles[r][c]}'`).toBe(g.fg ?? g.base);
				}
			}
			// 空振り防止＝この画面には物が乗ったセルが十分ある（5,3=53／6,0=54 が実測）
			expect(arted, `field/${sk} に前景色のセルが少なすぎる`).toBeGreaterThan(20);
		}
	});

});
