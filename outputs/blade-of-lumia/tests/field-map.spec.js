// ── tests/field-map.spec.js ── 実行キュー15 ────────────────────────────────
// 不変条件：**field でポーズを開くと「1セル=1px の見取り図」が出て、今いる画面が
// 分かる**。ユーザーの言葉＝「今ダンジョンには地図があるじゃない？でも field にはない。
// なのに結構広くて、今自分がどこにいるのかすらわからないわけよ」（2026-09-13）。
//
// 🔴 当て所（何を壊したら赤くなるべきか）：
//   ① 地図を持っていないのに見えてしまう（層別のゲートが壊れる）
//   ② 拾えない／文がダンジョン用のままになる
//   ③ 寸法が破綻する（1画面 24px の四角に戻す＝870×1086px でポーズ枠からはみ出す）
//   ④ 未訪問が見えてしまう（探索感を殺す）／訪問済みの絵が共通ソースと食い違う
//      ＝**実ブラウザの実ピクセル**を読む（写した期待値では「本当に cellGlanceColor を
//        呼んでいるか」が見抜けない＝11c の world-minimap.spec.js ④ と同じ作法）
//   ⑤ 現在地マーカーが「今いる画面」からずれる（1画面ぶんずれても絵は自然に見える∴
//      目視では気付けない＝数で押さえる）
//   ⑥ ダンジョンの部屋グリッドを壊す（field 用の見取り図で置き換えてしまう）
//
// 意図した差：見取り図は「絵」ではなく記号＝1セル1色に潰す∴ゲームの盤面とドット単位で
// 一致しない（潰し方の決め事は shared/cell-appearance.js の 11c 節）。

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cellGlanceColor } from '../shared/cell-appearance.js';
import { gotoFreshGame } from './helpers.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

// 地図タイル 'm' を置いた画面（scripts/migrate-place-field-map-item.mjs）。
const START_STAGE = '7,14';
const MAP_ITEM_RC = [4, 3];

/** field の見取り図の寸法をマップから計算する（画面数や画面サイズが変わっても追従する） */
function fieldGeometry() {
	const ld = MAP.layers.field;
	const keys = Object.keys(ld.stages);
	const coords = keys.map(k => k.split(',').map(Number));
	const minX = Math.min(...coords.map(c => c[0])), maxX = Math.max(...coords.map(c => c[0]));
	const minY = Math.min(...coords.map(c => c[1])), maxY = Math.max(...coords.map(c => c[1]));
	const first = ld.stages[keys[0]];
	// 全画面が同じ大きさであること＝見取り図が格子として成立する前提（実測 12×10）。
	for (const k of keys) {
		expect([ld.stages[k].cols, ld.stages[k].rows], `field/${k} の画面サイズが違う`).toEqual([first.cols, first.rows]);
	}
	return {
		minX, maxX, minY, maxY, cols: first.cols, rows: first.rows,
		w: (maxX - minX + 1) * first.cols,
		h: (maxY - minY + 1) * first.rows,
	};
}

/** その層の地図を持たせる（拾う手順を通さずに描画だけ測りたいとき） */
async function grantMap(page, layerKey) {
	await page.evaluate((lk) => {
		const p = window.__game.getPlayer();
		if (!p.dungeonItems) p.dungeonItems = {};
		p.dungeonItems[lk] = { ...(p.dungeonItems[lk] ?? {}), hasMap: true, hasCompass: false };
	}, layerKey);
}

/** ポーズを開く（開くたびに地図が描き直される＝描画は開いた時点の状態を写す） */
async function openPause(page) {
	await page.keyboard.press('Escape');
	await expect(page.locator('#pause-overlay')).toBeVisible();
}

/** キャンバスの実ピクセルを '#rrggbb' の配列で読む */
function readCanvas(page) {
	return page.locator('#pause-map-canvas').evaluate((cv) => {
		const ctx = cv.getContext('2d');
		const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
		const out = [];
		for (let i = 0; i < d.length; i += 4) {
			out.push(`#${[d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')}`);
		}
		return { w: cv.width, h: cv.height, cssW: cv.clientWidth, cssH: cv.clientHeight, out };
	});
}

test.describe('field の地図（ポーズ画面の見取り図）', () => {

	test('① 地図を持っていない間は field でもポーズに地図が出ない', async ({ page }) => {
		await gotoFreshGame(page);
		await openPause(page);
		await expect(page.locator('#pause-dungeon-map')).toBeHidden();
		await expect(page.locator('#pause-map-here')).toBeHidden();
	});

	test('② 開始画面の地図タイルを踏むと手に入り、文が field 用になる', async ({ page }) => {
		await gotoFreshGame(page);
		// 空振り防止＝踏む先に本当に地図タイルがある（移行スクリプトが戻されたら赤くなる）
		const [mr, mc] = MAP_ITEM_RC;
		expect(MAP.layers.field.stages[START_STAGE].tiles[mr][mc], 'field 開始画面に地図タイルが無い').toBe('m');

		const before = await page.evaluate(() => {
			const s = window.__game.getState();
			const p = window.__game.getPlayer();
			return { layer: s.currentLayer ?? s.layer, stage: s.stageKey ?? s.currentStage, hasMap: !!p.dungeonItems?.field?.hasMap };
		});
		expect(before.hasMap, '最初から地図を持っている＝拾う意味が無い').toBe(false);

		// movePlayer 1回＝0.5セル∴1セル進むには2回（tests/dungeon-key-gate.spec.js と同じ作法）。
		const walk = async (dir, cells) => {
			for (let i = 0; i < cells * 2; i++) await page.evaluate(d => window.__game.movePlayer(d), dir);
		};
		const start = await page.evaluate(() => {
			const p = window.__game.getPlayer();
			return { r: Math.round(p.y), c: Math.round(p.x) };
		});
		await walk('down',  mr - start.r);
		await walk('right', mc - start.c);

		const after = await page.evaluate(() => {
			const p = window.__game.getPlayer();
			return { r: Math.round(p.y), c: Math.round(p.x), hasMap: !!p.dungeonItems?.field?.hasMap };
		});
		expect([after.r, after.c], '地図タイルまで歩けていない').toEqual([mr, mc]);
		expect(after.hasMap, '地図タイルを踏んでも hasMap が立たない').toBe(true);
		// 文＝「ダンジョンの地図」ではない（field で拾ったら地方の地図）
		await expect(page.locator('#msg-bar')).toContainText('ルミア地方の地図');

		await openPause(page);
		await expect(page.locator('#pause-dungeon-map')).toBeVisible();
		await expect(page.locator('#pause-map-label')).toHaveText('ルミア地方の地図');
	});

	test('③ 見取り図の寸法＝1セル1px・既定 CSS2倍（1画面24pxの四角に戻ったら赤）', async ({ page }) => {
		const g = fieldGeometry();
		await gotoFreshGame(page);
		await grantMap(page, 'field');
		await openPause(page);

		const cv = await readCanvas(page);
		expect([cv.w, cv.h], 'キャンバスは field 全体を1セル1pxで持つ').toEqual([g.w, g.h]);
		// 実測（1280×720 の既定ビューポート）＝2倍。ここが3倍・24px格子になるとポーズ枠から
		// はみ出す（IDEA.md の実測＝3倍で枠 約850px／24px格子で 870×1086px）。
		expect([cv.cssW, cv.cssH], 'CSS 上の大きさが 2 倍でない').toEqual([g.w * 2, g.h * 2]);
		// ポーズ枠ごと窓に収まっている（scale-to-fit の目的そのもの）
		const fits = await page.locator('#pause-box').evaluate(el => el.getBoundingClientRect().height <= window.innerHeight);
		expect(fits, 'ポーズ枠が窓の高さを超えた').toBe(true);
		// 画面の縦横比＝ゲーム画面と同じ（1セル1px なら自動的にそうなる）
		expect(g.cols / g.rows).toBeCloseTo(MAP.layers.field.stages[START_STAGE].cols / MAP.layers.field.stages[START_STAGE].rows, 6);
	});

	test('④ 未訪問は真っ黒／訪問済みの絵は共通ソース（cellGlanceColor）と一致する', async ({ page }) => {
		const g = fieldGeometry();
		await gotoFreshGame(page);
		await grantMap(page, 'field');
		await openPause(page);

		const cv = await readCanvas(page);
		const visited = await page.evaluate(() => {
			const s = window.__game.getState();
			return s.stageKey ?? s.currentStage;
		});
		expect(visited, '開始画面が想定と違う').toBe(START_STAGE);

		const [vx, vy] = visited.split(',').map(Number);
		const ox = (vx - g.minX) * g.cols, oy = (vy - g.minY) * g.rows;
		const sd = MAP.layers.field.stages[visited];

		// (a) 訪問済みの画面＝1ドットずつ共通ソースと一致する
		let arted = 0;
		for (let r = 0; r < sd.rows; r++) {
			for (let c = 0; c < sd.cols; c++) {
				const glance = cellGlanceColor(sd, r, c, sd.tiles[r][c]);
				if (glance.fg) arted++;
				const px = cv.out[(oy + r) * cv.w + (ox + c)];
				expect(px, `field/${visited} (${r},${c}) '${sd.tiles[r][c]}' の色`).toBe(glance.fg ?? glance.base);
			}
		}
		expect(arted, 'この画面に物が乗ったセルが少なすぎる＝空振り').toBeGreaterThan(10);

		// (b) それ以外は全部真っ黒（1画面でも漏れたら「行っていない場所」が見える）
		const leaked = [];
		for (let y = 0; y < cv.h; y++) {
			for (let x = 0; x < cv.w; x++) {
				if (x >= ox && x < ox + sd.cols && y >= oy && y < oy + sd.rows) continue;
				if (cv.out[y * cv.w + x] !== '#000000') {
					leaked.push(`px(${x},${y})=${cv.out[y * cv.w + x]} 画面 ${g.minX + Math.floor(x / g.cols)},${g.minY + Math.floor(y / g.rows)}`);
					if (leaked.length > 5) break;
				}
			}
			if (leaked.length > 5) break;
		}
		expect(leaked, '未訪問の画面が見えている').toEqual([]);

		// (c) 隣の画面へ移ると、その画面が黒でなくなる（訪問で描き足される＝キャッシュが
		//     「一度描いたら描き直さない」形でも新しい訪問を取り込めている）
		await page.keyboard.press('Escape');
		await page.evaluate((sk) => {
			const [x, y] = sk.split(',').map(Number);
			window.__game.enterStage('field', `${x + 1},${y}`, 4, 1);
		}, START_STAGE);
		await openPause(page);
		const cv2 = await readCanvas(page);
		const nx = (vx + 1 - g.minX) * g.cols;
		const nsd = MAP.layers.field.stages[`${vx + 1},${vy}`];
		let painted = 0;
		for (let r = 0; r < nsd.rows; r++) {
			for (let c = 0; c < nsd.cols; c++) {
				const glance = cellGlanceColor(nsd, r, c, nsd.tiles[r][c]);
				const px = cv2.out[(oy + r) * cv2.w + (nx + c)];
				expect(px, `field/${vx + 1},${vy} (${r},${c}) の色`).toBe(glance.fg ?? glance.base);
				if (px !== '#000000') painted++;
			}
		}
		expect(painted, '移った先の画面が黒のまま＝描き足されていない').toBeGreaterThan(50);
		// 前に居た画面は消えない
		expect(cv2.out[(oy + 0) * cv2.w + (ox + 0)]).toBe(cv.out[(oy + 0) * cv.w + (ox + 0)]);
	});

	test('⑤ 現在地マーカーが今いる画面の矩形とぴったり重なる', async ({ page }) => {
		const g = fieldGeometry();
		await gotoFreshGame(page);
		await grantMap(page, 'field');

		for (const sk of [START_STAGE, '8,14', '7,15']) {
			expect(MAP.layers.field.stages[sk], `field/${sk} が実マップに無い`).toBeTruthy();
			await page.evaluate((s) => window.__game.enterStage('field', s, 4, 1), sk);
			await openPause(page);
			const box = await page.evaluate(() => {
				const wrap = document.getElementById('pause-map-wrap').getBoundingClientRect();
				const cv   = document.getElementById('pause-map-canvas');
				const cvr  = cv.getBoundingClientRect();
				const her  = document.getElementById('pause-map-here').getBoundingClientRect();
				const bw   = parseFloat(getComputedStyle(cv).borderLeftWidth) || 0;
				return {
					here:   { x: her.left - wrap.left, y: her.top - wrap.top, w: her.width, h: her.height },
					// 画素の原点＝枠線の内側。描画領域の実寸も測る（拡大率が整数か確かめる）。
					canvas: { x: cvr.left - wrap.left + bw, y: cvr.top - wrap.top + bw, w: cv.clientWidth, h: cv.clientHeight },
				};
			});
			const [sx, sy] = sk.split(',').map(Number);
			// マーカーは「画素×拡大率」で置く∴描画領域が整数倍でないと必ずずれる。
			const scale = box.canvas.w / g.w;
			expect(scale, '拡大率が整数でない＝1ドットの大きさが不均一').toBe(Math.round(scale));
			expect(box.canvas.h, '縦横で拡大率が違う').toBe(g.h * scale);
			expect(box.here.w, 'マーカーの幅＝1画面ぶん').toBeCloseTo(g.cols * scale, 1);
			expect(box.here.h, 'マーカーの高さ＝1画面ぶん').toBeCloseTo(g.rows * scale, 1);
			expect(box.here.x - box.canvas.x, `field/${sk} のマーカーの x`).toBeCloseTo((sx - g.minX) * g.cols * scale, 1);
			expect(box.here.y - box.canvas.y, `field/${sk} のマーカーの y`).toBeCloseTo((sy - g.minY) * g.rows * scale, 1);
			await page.keyboard.press('Escape');
		}
	});

	test('⑥ ダンジョンは部屋グリッドのまま（見取り図で置き換えていない）', async ({ page }) => {
		await gotoFreshGame(page);
		await page.evaluate(() => window.__game.enterStage('dungeon_1', '2,2', 5, 5));
		await grantMap(page, 'dungeon_1');
		await openPause(page);

		await expect(page.locator('#pause-map-label')).toHaveText('ダンジョンマップ');
		// 部屋グリッドに現在地マーカーの div は使わない（現在地は塗り潰しで描く）
		await expect(page.locator('#pause-map-here')).toBeHidden();

		const ld = MAP.layers.dungeon_1;
		const coords = Object.keys(ld.stages).map(k => k.split(',').map(Number));
		const spanX = Math.max(...coords.map(c => c[0])) - Math.min(...coords.map(c => c[0])) + 1;
		const spanY = Math.max(...coords.map(c => c[1])) - Math.min(...coords.map(c => c[1])) + 1;
		const CELL = 24, PAD = 3;
		const cv = await readCanvas(page);
		expect([cv.w, cv.h], 'ダンジョン地図の寸法が部屋グリッド（24+3）でない')
			.toEqual([spanX * (CELL + PAD) + PAD, spanY * (CELL + PAD) + PAD]);
		// 現在地の四角（#80c0f0）が実際に塗られている
		expect(cv.out, '現在地の色が塗られていない').toContain('#80c0f0');
	});

});
