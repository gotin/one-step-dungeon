// tests/pit-tile.spec.js
// 穴（PIT・`x`）の見た目とエディタ配置の番人（2026-10-02 / PLAN 実行キュー 22）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   ① エディタのパレットに穴が無かった＝エディタから穴を置けなかった（既存の穴はスクリプトで入れた物だけ）。
//   ② 絵は CSS の放射グラデーションの黒い丸＝どの地形に開けても同じ「ただの黒い正方形」
//      （ユーザー指摘「草地、床、砂地、雪原、とかにあわせた穴をつくって、まわりに合わせて配置する」）。
//
// 守るもの:
//   ① 肌の選び方＝自分の下地 → 周り8マスの下地 → 床（手書きの表）
//   ② 部品＝底＋隣が穴でない辺の縁＋角（実マップのセルで手書きの期待値）
//   ③ 実ゲーム＝穴のセルが記述どおりの部品で塗られ、底は暗く縁は周りの地面の色
//   ④ 空（はるか下の海）と見分けが付く・地図に出る全部の穴の部品が絵として存在する
//   ⑤ エディタ＝パレットから穴を置ける・下地は残る（肌が下地から決まる）・保存して読み直しても残る
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { pitParts, TILE_CELL_STYLE, colorDistance } from '../shared/cell-appearance.js';
import { pitSkinAt } from '../shared/tile-skins.js';
import { SPRITES, PAL } from '../shared/sprites.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const room = (lk, sk) => map.layers[lk].stages[sk];
const ALL4 = ['pitCornerNW', 'pitCornerNE', 'pitCornerSW', 'pitCornerSE'];

test.describe('穴の見た目 ①②④（データ）', () => {
	test('① 肌＝自分の下地 → 周りの下地の最多 → 床', () => {
		const g = (bg, tiles) => ({ tiles: tiles ?? [['.', '.', '.'], ['.', 'x', '.'], ['.', '.', '.']], bgTiles: bg });
		const table = [
			[g({ '1,1': TILE.GRASS }), 'grass'],
			[g({ '1,1': TILE.SAND }), 'sand'],
			[g({ '1,1': TILE.SNOW }), 'snow'],
			[g({ '1,1': TILE.ASH }), 'ash'],
			[g({ '1,1': TILE.MUD }), 'mud'],
			[g({ '1,1': TILE.STONE_FLOOR }), 'stone'],
			[g({}), 'floor'],                                                        // ダンジョンの床
			[g({ '0,0': 'g', '0,1': 'g', '1,0': 'g', '2,2': 'g', '1,2': 'g' }), 'grass'],   // 下地なし・周りの多数が草
			[g({ '0,0': 'g' }), 'floor'],                                           // 斜めに草1枚だけ＝床の多数
			// 周りが全部穴（裂け目の真ん中・下地なし）＝床
			[g({}, [['x', 'x', 'x'], ['x', 'x', 'x'], ['x', 'x', 'x']]), 'floor'],
		];
		table.forEach(([sd, want], i) => expect(pitSkinAt(sd, 1, 1), `表の ${i} 行目`).toBe(want));
	});

	test('② 部品＝底＋隣が穴でない辺の縁＋角（実マップ・手書きの期待値）', () => {
		const cases = [
			// [層, 画面, r, c, 部品, パレット, edgeCode]
			// 草地に1マスだけ開いた穴＝四方に縁・四隅を丸める
			['field', '3,1', 7, 8, ['pitBody@1', 'pitRimW', 'pitRimE', 'pitRimS', 'pitLipN.soil@0', ...ALL4], 'pit@grass', 'WESN(nw)(ne)(sw)(se)'],
			// 雪原の穴＝北の縁は氷の壁
			['field', '11,7', 4, 4, ['pitBody@0', 'pitRimW', 'pitRimE', 'pitRimS', 'pitLipN.ice@0', ...ALL4], 'pit@snow', 'WESN(nw)(ne)(sw)(se)'],
			// ダンジョンの床・北西の角（北と西が壁・南東の斜めだけ床）＝石積みの壁＋角の欠け
			['dungeon_7', '1,3', 1, 1, ['pitBody@0', 'pitRimW', 'pitLipN.block@1', 'pitNubSE', 'pitCornerNW'], 'pit@floor', 'WNse(nw)'],
			// 裂け目の真ん中＝縁なし（繋がった穴は1つに見える）
			['dungeon_7', '1,3', 5, 5, ['pitBody@0'], 'pit@floor', '-'],
		];
		for (const [lk, sk, r, c, sprs, pal, edge] of cases) {
			const sd = room(lk, sk);
			expect(sd.tiles[r][c], `${lk} ${sk} (${r},${c}) が穴でない＝盤面が変わった`).toBe(TILE.PIT);
			const p = pitParts(sd, r, c);
			expect(p.sprs, `${lk} ${sk} (${r},${c}) の部品`).toEqual(sprs);
			expect(p.pal, `${lk} ${sk} (${r},${c}) の肌`).toBe(pal);
			expect(p.edgeCode, `${lk} ${sk} (${r},${c}) の縁`).toBe(edge);
		}
		// 盤面の外は穴が続くとみなす＝画面の境目に縁を出さない（実マップに端の穴は無い∴手で作る）
		const corner = pitParts({ tiles: [[TILE.PIT, '.'], ['.', '.']] }, 0, 0);
		expect(corner.sprs, '盤面の角の穴').toEqual(['pitBody@0', 'pitRimE', 'pitRimS', 'pitCornerSE']);
		expect(corner.edgeCode).toBe('ES(se)');
	});

	test('④ 地図の全部の穴の部品が絵として在る・32×32・空と見分けが付く', () => {
		let n = 0;
		const skins = new Set();
		for (const [lk, ld] of Object.entries(map.layers)) {
			for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
				sd.tiles?.forEach((row, r) => row.forEach((t, c) => {
					if (t !== TILE.PIT) return;
					n++;
					const p = pitParts(sd, r, c);
					skins.add(p.skin);
					expect(PAL[p.pal], `${lk} ${sk} (${r},${c}) のパレット ${p.pal} が無い`).toBeTruthy();
					for (const s of p.sprs) {
						const g = SPRITES[s]?.[0];
						expect(g?.length, `${s} が無い／高さ違い`).toBe(32);
						expect(g.every((row) => row.length === 32), `${s} の幅`).toBe(true);
					}
				}));
			}
		}
		expect(n, '穴が地図に無い＝走査が空振り').toBeGreaterThan(200);
		// 実マップに出る肌（2026-10-02 実測＝草・雪・灰・泥・石畳・砂・床）
		expect([...skins].sort()).toEqual(['ash', 'floor', 'grass', 'mud', 'sand', 'snow', 'stone']);
		// 空（海の青）と穴の底（黒）は平色でも絵の底でも十分離れている
		const sky = TILE_CELL_STYLE[TILE.SKY].color;
		for (const pal of Object.keys(PAL).filter((k) => k.startsWith('pit@'))) {
			expect(colorDistance(PAL[pal][2], sky), `${pal} の底が空に近い`).toBeGreaterThan(120);
			// 底は drawConnectTile がセルの地色に使う＝暗いこと
			expect(colorDistance(PAL[pal][2], '#000000'), `${pal} の底が明るすぎる`).toBeLessThan(40);
		}
	});
});

test.describe('穴の見た目 ③ 実ゲーム', () => {
	test('③ 穴のセルは記述どおりの部品で塗られ、底は暗く縁は草の色（field 3,1）', async ({ page }) => {
		const sd = room('field', '3,1');
		await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=3,1&row=4&col=4`);
		await waitForBoard(page);
		const got = await page.evaluate(() => {
			const el = document.querySelector('#board .cell[data-row="7"][data-col="8"]');
			const cv = el?.querySelector('canvas.tile-sprite');
			return { cls: el?.className, sprs: cv?.dataset.tileSprs, pal: cv?.dataset.tilePal, edges: cv?.dataset.tileEdges };
		});
		const p = pitParts(sd, 7, 8);
		expect(got.sprs, '穴の部品').toBe(p.sprs.join(' '));
		expect(got.pal).toBe(p.pal);
		expect(got.edges).toBe(p.edgeCode);
		expect(got.cls).toContain('pit');
		// 実ピクセル＝中央は暗い・左右の縁の近くは草の緑（周りの地面と同じ色）
		const png = await page.locator('#board .cell[data-row="7"][data-col="8"]').screenshot();
		const px = await page.evaluate(async (b64) => {
			const im = new Image(); im.src = `data:image/png;base64,${b64}`; await im.decode();
			const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
			const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
			const at = (fx, fy) => [...ctx.getImageData(Math.floor(im.width * fx), Math.floor(im.height * fy), 1, 1).data].slice(0, 3);
			return { mid: at(0.5, 0.7), west: at(0.02, 0.6), east: at(0.97, 0.6) };
		}, png.toString('base64'));
		expect(Math.max(...px.mid), '穴の底が暗くない').toBeLessThan(40);
		for (const [side, [r, g, b]] of [['西', px.west], ['東', px.east]]) {
			expect(g > r + 15 && g > b + 15, `${side}の縁が草の緑でない (${r},${g},${b})`).toBe(true);
		}
	});

	test('③b ダンジョンの裂け目＝全部の穴のセルが描かれている（dark_tower 3,5）', async ({ page }) => {
		const sd = room('dark_tower', '3,5');
		const sp = (() => { for (let r = 0; r < sd.rows; r++) for (let c = 0; c < sd.cols; c++) if (sd.tiles[r][c] === TILE.FLOOR) return { r, c }; })();
		await page.goto(`${GAME_URL}?fromEditor=1&layer=dark_tower&stage=3,5&row=${sp.r}&col=${sp.c}`);
		await waitForBoard(page);
		const got = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#board .cell.pit')].map((el) => [
			`${el.dataset.row},${el.dataset.col}`, el.querySelector('canvas.tile-sprite')?.dataset.tileSprs ?? null,
		])));
		const want = [];
		sd.tiles.forEach((row, r) => row.forEach((t, c) => { if (t === TILE.PIT) want.push(`${r},${c}`); }));
		expect(Object.keys(got).sort()).toEqual(want.sort());
		for (const pos of want) expect(got[pos], pos).toBe(pitParts(sd, ...pos.split(',').map(Number)).sprs.join(' '));
	});
});

// ③c 端数の拡大率で、穴のセルの上端・左端に暗い線が透けない（2026-10-02 ユーザー指摘
//    「うっすら上と左に枠線がはいってしまう」）。原因＝拡大した canvas の縁の1デバイスピクセルが
//    半透明になり、下のセル背景（底の黒）と `.cell.pit` の内側の影が透けていた。
//    直す前の実測＝dsf 1.25〜2.5 のどれでも上端・左端の最暗が輝度 1〜2（真っ黒の線）。
test.describe('穴の見た目 ③c 端数の拡大率', () => {
	test.use({ deviceScaleFactor: 1.75, viewport: { width: 1111, height: 870 } });
	test('③c 雪原の穴（field 11,7 (4,4)）のセルの上端・左端に黒い線が出ない', async ({ page }) => {
		await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=11,7&row=8&col=8`);
		await waitForBoard(page);
		await page.evaluate(() => window.__game.pause());
		const box = await page.evaluate(() => {
			const r = document.querySelector('#board .cell[data-row="4"][data-col="4"]').getBoundingClientRect();
			return { x: r.x - r.width * 0.2, y: r.y - r.height * 0.2, width: r.width * 1.4, height: r.height * 1.4, cw: r.width };
		});
		const png = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
		const res = await page.evaluate(async ({ b64, cw }) => {
			const im = new Image(); im.src = `data:image/png;base64,${b64}`; await im.decode();
			const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
			const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
			const d = ctx.getImageData(0, 0, im.width, im.height).data;
			const lum = (x, y) => { const i = (y * im.width + x) * 4; return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
			const edge = Math.round(im.width * (0.2 / 1.4));   // セル境目のデバイス座標
			let top = 999, left = 999;
			for (let k = -2; k <= 2; k++) {
				for (let x = edge + 4; x < im.width - edge - 4; x++) top = Math.min(top, lum(x, edge + k));
				for (let y = edge + 4; y < im.height - edge - 4; y++) left = Math.min(left, lum(edge + k, y));
			}
			return { top, left };
		}, { b64: png.toString('base64'), cw: box.cw });
		// 上端の帯は雪の縁（明るい）・左端の帯は雪の縁と北の壁の面（最暗でも輝度 40 台）
		expect(res.top, '穴のセルの上端に暗い線が出ている').toBeGreaterThan(100);
		expect(res.left, '穴のセルの左端に黒い線が出ている').toBeGreaterThan(30);
	});
});

test.describe('穴 ⑤ エディタ', () => {
	test('⑤ パレットから穴を置ける・下地が残り肌が決まる・保存して読み直しても残る', async ({ page }) => {
		page.on('dialog', (d) => d.dismiss().catch(() => {}));
		await page.goto('/blade-of-lumia/editor/');
		await page.waitForSelector('#world-grid');
		const chooser = page.waitForEvent('filechooser');
		await page.locator('#btn-load').click();
		await (await chooser).setFiles(MAP_PATH);
		await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
		// field 3,1 を開く（草地・(4,4) は草の床）
		const tabs = page.locator('#layer-tabs button.layer-tab');
		for (let i = 0; i < await tabs.count(); i++) {
			if (await tabs.nth(i).evaluate((el) => el.childNodes[0]?.textContent ?? '') === 'field') { await tabs.nth(i).click(); break; }
		}
		await page.locator('#world-grid .world-cell').filter({ has: page.locator('.cell-coord', { hasText: /^\(3,1\)/ }) }).first().click();
		await page.locator('#btn-edit-stage').click();
		await page.waitForSelector('#stage-canvas', { state: 'visible' });
		expect(room('field', '3,1').tiles[4][4]).toBe(TILE.FLOOR);
		expect(room('field', '3,1').bgTiles['4,4']).toBe(TILE.GRASS);

		// パレットに穴のボタンがあり、絵（文字ではない）を持つ
		const btn = page.locator('#tile-palette .tile-btn[title="穴（はしご）"]');
		await expect(btn).toHaveCount(1);
		await expect(btn.locator('canvas')).toHaveCount(1);
		await btn.click();
		// (4,4) をクリック（キャンバスの CSS サイズに合わせて座標を出す）
		const box = await page.locator('#stage-canvas').boundingBox();
		const size = await page.evaluate(() => ({ w: document.getElementById('stage-canvas').width }));
		const k = box.width / size.w;
		await page.mouse.click(box.x + (4 * 40 + 20) * k, box.y + (4 * 40 + 20) * k);
		const log = await page.evaluate(() => window.__editorDrawLog.get('4,4'));
		expect(log.sprs[0], '置いたセルに穴の底が描かれていない').toMatch(/^pitBody@\d@pit@grass$/);

		// 保存 → 控え（localStorage）に穴と下地が残る
		await page.locator('#btn-save').click();
		const saved = await page.evaluate(() => {
			const m = JSON.parse(localStorage.getItem('bladeOfLumiaMapData'));
			const sd = m.layers.field.stages['3,1'];
			return { t: sd.tiles[4][4], bg: sd.bgTiles['4,4'] };
		});
		expect(saved).toEqual({ t: TILE.PIT, bg: TILE.GRASS });
	});
});
