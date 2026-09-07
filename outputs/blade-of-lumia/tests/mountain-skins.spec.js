// tests/mountain-skins.spec.js — 山の肌を下地から導出する（キュー10番 10a-1d）
//
// 何を守るテストか：
//   山 `'M'` は世界中で同じ「雪冠つきの高山」だった∴南西の砂漠にも、溶岩地帯にも、
//   雪原にも同じ雪山が立っていた（ユーザー指摘 2026-09-06）。
//   タイルは増やさず（`TILE.ROCK` を作らず）**絵だけを下地から導く**＝マップデータ変更 0。
//
// 観測できること（＝テストの当て所）：
//   ・対応表  下地 → 肌は shared/tile-skins.js の1表だけ（5肌すべてに下地がある）
//   ・塊単位  一つづきの山（連結成分）は必ず一つの肌になる
//             ← セルごとに導出すると地域の境目で肌が混ざる（実測 18 セル）
//   ・網羅    実マップの山 2391 セルは全部いずれかの肌になる・5肌すべてが世界に出る
//   ・受け皿  下地が地面でない塊は「画面の最多の地面」へ落ちる
//   ・見える  どの肌も輪郭が下地の地の色よりはっきり暗い
//             ← 雪原の雪山を全面白にすると山の形が地面に沈んで見えなくなる
//   ・実描画  ゲームの DOM に選んだ肌が出る（砂漠＝メサ／雪原＝雪山…）

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { TILE } from '../shared/tiles.js';
import { SPRITES, PAL } from '../shared/sprites.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import {
	MOUNTAIN_SKINS, GROUND_TO_MOUNTAIN_SKIN, MOUNTAIN_SKIN_DEFAULT,
	skinName, mountainSkinMap, mountainSkinAt,
} from '../shared/tile-skins.js';
import { OBJ_VARIANTS, objVariantName } from '../shared/sprites-tiles.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));

const MT = TILE_SPRITE_MAP[TILE.MOUNTAIN];      // 形と色の基本名（単一の真実）
const posKey = (r, c) => `${r},${c}`;

// ❌失効（10a-4）：かつてここは肌ごとに「代表1枚」の絵と突き合わせていた。
//   いまは山もセルごとに変種を引く（`mountain@mesa#2`）∴代表1枚と比べると
//   一致率が 75〜90% に落ちて赤くなる（実測）。∴肌ごとに**全変種**の色表を作り、
//   「どれか1枚と一致するか」＋「一致したのが座標から引ける変種か」で見る。
//   変種そのものの品質は tests/field-art-variants.spec.js が受け持つ。
const skinColorGrids = (skin) => {
	const base = skinName(MT.spr, skin);
	const p = PAL[skinName(MT.pal, skin)];
	const n = OBJ_VARIANTS[base] ?? 0;
	const names = n ? Array.from({ length: n }, (_, v) => `${base}#${v}`) : [base];
	return names.map(nm => SPRITES[nm][0].map(row => row.map(v => (v ? p[v] : null))));
};
// 座標から引かれるはずの変種の番号（絵の名前の `#` の後ろ）
const wantVariant = (skin, r, c) => {
	const name = objVariantName(skinName(MT.spr, skin), r, c);
	return name.includes('#') ? Number(name.split('#')[1]) : 0;
};

// 実マップの全画面（レイヤー横断）
function allStages() {
	const out = [];
	for (const [lk, layer] of Object.entries(MAP.layers ?? {})) {
		for (const [sk, sd] of Object.entries(layer.stages ?? {})) out.push({ lk, sk, sd });
	}
	return out;
}

// 山セルの連結成分（4近傍）
function mountainComponents(sd) {
	const isM = (r, c) => sd.tiles?.[r]?.[c] === TILE.MOUNTAIN;
	const seen = new Set();
	const comps = [];
	(sd.tiles ?? []).forEach((row, r) => {
		for (let c = 0; c < row.length; c++) {
			if (!isM(r, c) || seen.has(posKey(r, c))) continue;
			const cells = [];
			const stack = [[r, c]];
			seen.add(posKey(r, c));
			while (stack.length) {
				const [cr, cc] = stack.pop();
				cells.push([cr, cc]);
				for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					const nr = cr + dr, nc = cc + dc;
					if (!isM(nr, nc) || seen.has(posKey(nr, nc))) continue;
					seen.add(posKey(nr, nc));
					stack.push([nr, nc]);
				}
			}
			comps.push(cells);
		}
	});
	return comps;
}

const lum = (hex) => {
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
	if (!m) return null;
	const [r, g, b] = m.slice(1).map(h => parseInt(h, 16));
	return 0.299 * r + 0.587 * g + 0.114 * b;
};

test.describe('山の肌を下地から導出する', () => {

	test('① 下地 → 肌の対応表が5肌すべてを覆い、絵と色が実在する', () => {
		const mapped = new Set(Object.values(GROUND_TO_MOUNTAIN_SKIN));
		expect([...mapped].sort(), '肌の一覧と対応表の値が食い違う')
			.toEqual([...MOUNTAIN_SKINS].sort());
		expect(mapped.has(MOUNTAIN_SKIN_DEFAULT), '既定の肌が対応表に無い').toBe(true);
		for (const skin of MOUNTAIN_SKINS) {
			expect(SPRITES[skinName(MT.spr, skin)], `肌 ${skin} の絵が無い`).toBeTruthy();
			expect(PAL[skinName(MT.pal, skin)], `肌 ${skin} のパレットが無い`).toBeTruthy();
		}
		// 基本名（肌を解決しない描画先が引く1枚）は既定の肌と同じ絵
		expect(SPRITES[MT.spr], '基本名の絵が既定の肌と違う')
			.toBe(SPRITES[skinName(MT.spr, MOUNTAIN_SKIN_DEFAULT)]);
		expect(PAL[MT.pal], '基本名の色が既定の肌と違う')
			.toEqual(PAL[skinName(MT.pal, MOUNTAIN_SKIN_DEFAULT)]);
	});

	test('② 一つづきの山（連結成分）は必ず一つの肌になる', () => {
		// 🔴 セルごとに自分の下地を見ると、地域の境目にある一つの山脈の中で肌が混ざる
		//    （砂漠の中に雪冠・森の中に砂の山）∴導出の単位は塊。
		let comps = 0;
		for (const { lk, sk, sd } of allStages()) {
			const skins = mountainSkinMap(sd);
			for (const cells of mountainComponents(sd)) {
				comps++;
				const used = new Set(cells.map(([r, c]) => skins.get(posKey(r, c))));
				expect(used.size, `${lk} ${sk} の塊（${cells.length}セル・先頭 ${cells[0]}）で肌が混ざった`
					+ `（${[...used].join(',')}）`).toBe(1);
				expect(MOUNTAIN_SKINS, `${lk} ${sk} で未知の肌が出た`).toContain([...used][0]);
			}
		}
		expect(comps, '実マップに山の塊が無い＝この検査が空回りしている').toBeGreaterThan(100);
	});

	test('③ 塊で決めた肌はセルごとに決めた肌と実際に違う＝塊にする意味がある', () => {
		// 空虚な検査の防止＝②は「セルごと導出でも通ってしまう」なら歯が無い。
		// 実測（2026-09-06）＝18 セルが自分の下地と違う肌になる（塊の多数決に従う）。
		let mismatch = 0, total = 0;
		for (const { sd } of allStages()) {
			const skins = mountainSkinMap(sd);
			for (const [key, skin] of skins) {
				total++;
				const own = GROUND_TO_MOUNTAIN_SKIN[sd.bgTiles?.[key]];
				if (own && own !== skin) mismatch++;
			}
		}
		expect(total, '実マップの山セル数').toBeGreaterThan(2000);
		expect(mismatch, 'セルごと導出と1セルも違わない＝塊の多数決が効いていない')
			.toBeGreaterThan(0);
	});

	test('④ 実マップの山は全部いずれかの肌になり、5肌すべてが世界に出る', () => {
		const count = new Map();
		let cells = 0;
		for (const { sd } of allStages()) {
			const skins = mountainSkinMap(sd);
			(sd.tiles ?? []).forEach((row, r) => {
				for (let c = 0; c < row.length; c++) {
					if (row[c] !== TILE.MOUNTAIN) continue;
					cells++;
					const skin = skins.get(posKey(r, c));
					expect(skin, `山 (${r},${c}) に肌が付いていない`).toBeTruthy();
					count.set(skin, (count.get(skin) ?? 0) + 1);
				}
			});
		}
		expect(cells, '実マップの山セル数が減っている').toBeGreaterThan(2000);
		for (const skin of MOUNTAIN_SKINS) {
			expect(count.get(skin) ?? 0, `肌 ${skin} が世界に1セルも出ない＝作った意味が無い`)
				.toBeGreaterThan(50);
		}
	});

	test('⑤ 下地が地面でない塊は「画面の最多の地面」へ落ちる', () => {
		// 石畳や未設定の上に立つ山（実マップに 166 セル）＝その画面の地域の肌になる。
		const sd = {
			tiles: [
				'............'.split(''),
				'....MM......'.split(''),
				'....MM......'.split(''),
				'............'.split(''),
			],
			bgTiles: {
				// 山の下は石畳（地面でない）／画面の地面は砂が最多
				'1,4': TILE.STONE_FLOOR, '1,5': TILE.STONE_FLOOR,
				'2,4': TILE.STONE_FLOOR, '2,5': TILE.STONE_FLOOR,
				'3,0': TILE.SAND, '3,1': TILE.SAND, '3,2': TILE.SAND, '0,0': TILE.GRASS,
			},
		};
		expect(mountainSkinAt(sd, 1, 4), '石畳の上の山が画面の最多の地面（砂）を拾わない')
			.toBe(GROUND_TO_MOUNTAIN_SKIN[TILE.SAND]);
		// 地面が1枚も無い画面＝既定の肌
		const bare = { tiles: sd.tiles, bgTiles: { '1,4': TILE.STONE_FLOOR } };
		expect(mountainSkinAt(bare, 1, 4), '地面が無い画面で既定の肌にならない')
			.toBe(MOUNTAIN_SKIN_DEFAULT);
	});

	test('⑥ 境目の塊は「触れている下地の最多」で決まる', () => {
		// 砂 3 セル・雪 1 セルに跨る一つづきの山＝全部メサ（砂）になる。
		const sd = {
			tiles: [
				'............'.split(''),
				'.MMMM.......'.split(''),
				'............'.split(''),
			],
			bgTiles: {
				'1,1': TILE.SAND, '1,2': TILE.SAND, '1,3': TILE.SAND, '1,4': TILE.SNOW,
			},
		};
		const skins = mountainSkinMap(sd);
		for (let c = 1; c <= 4; c++) {
			expect(skins.get(`1,${c}`), `境目の塊で (1,${c}) だけ肌が違う`)
				.toBe(GROUND_TO_MOUNTAIN_SKIN[TILE.SAND]);
		}
		// 隣接していない別の塊は別々に決まる（塊単位＝画面単位ではない）
		const two = {
			tiles: ['MM..MM'.split(''), '......'.split('')],
			bgTiles: { '0,0': TILE.SAND, '0,1': TILE.SAND, '0,4': TILE.SNOW, '0,5': TILE.SNOW },
		};
		const ts = mountainSkinMap(two);
		expect(ts.get('0,0'), '砂の塊がメサでない').toBe(GROUND_TO_MOUNTAIN_SKIN[TILE.SAND]);
		expect(ts.get('0,4'), '雪の塊が雪山でない').toBe(GROUND_TO_MOUNTAIN_SKIN[TILE.SNOW]);
	});

	test('⑦ どの肌も輪郭が下地よりはっきり暗い＝山が地面に沈まない', () => {
		// 🔴 雪原の雪山を全面白にすると輪郭が失せて山が見えなくなる（設計時の警告）。
		//    ∴「肌の輪郭（6）」と「下地の地の色（地面パレットの 2）」の明度差を固定する。
		const MIN_DELTA = 30;
		for (const [ground, skin] of Object.entries(GROUND_TO_MOUNTAIN_SKIN)) {
			const groundPal = PAL[TILE_SPRITE_MAP[ground].pal];
			expect(groundPal, `下地 ${ground} のパレットが無い`).toBeTruthy();
			const skinPal = PAL[skinName(MT.pal, skin)];
			const gy = lum(groundPal[2]), ry = lum(skinPal[6]);
			expect(gy, `下地 ${ground} の地の色が読めない`).not.toBeNull();
			expect(ry, `肌 ${skin} の輪郭色が読めない`).not.toBeNull();
			expect(gy - ry, `肌 ${skin} の輪郭が下地 ${ground} と近すぎる（山が地面に沈む）`)
				.toBeGreaterThanOrEqual(MIN_DELTA);
		}
	});

});

test.describe('山の肌 – 実エンジン', () => {

	// 肌ごとに「その肌の山が最も多い画面」を実マップから選ぶ（手書きしない）。
	function stageForSkin(skin) {
		let best = null;
		for (const [sk, sd] of Object.entries(MAP.layers.field.stages)) {
			const skins = mountainSkinMap(sd);
			let n = 0;
			for (const s of skins.values()) if (s === skin) n++;
			if (n > (best?.n ?? 0)) best = { sk, sd, n };
		}
		return best;
	}
	// 着地できるセル（歩ける地面で、下地が水でない）
	const LANDABLE = new Set([TILE.FLOOR, TILE.GRASS, TILE.SAND, TILE.STONE_FLOOR,
		TILE.SNOW, TILE.ASH, TILE.MUD]);
	function landing(sd) {
		for (let r = 0; r < sd.tiles.length; r++) {
			const row = sd.tiles[r];
			for (let c = 0; c < row.length; c++) {
				if (!LANDABLE.has(row[c])) continue;
				if (sd.bgTiles?.[posKey(r, c)] === TILE.WATER) continue;
				return { r, c };
			}
		}
		return null;
	}

	for (const skin of MOUNTAIN_SKINS) {
		test(`⑧ ${skin} の画面で山が ${skin} として描かれる（実 DOM）`, async ({ page }) => {
			const pick = stageForSkin(skin);
			expect(pick, `肌 ${skin} の山がある field の画面が無い`).toBeTruthy();
			const start = landing(pick.sd);
			expect(start, `画面 field ${pick.sk} に着地できるセルが無い`).toBeTruthy();

			const p = new URLSearchParams({
				fromEditor: '1', layer: 'field', stage: pick.sk,
				row: String(start.r), col: String(start.c),
			});
			await page.goto(`${GAME}?${p.toString()}`);
			await waitForBoard(page);

			const expected = mountainSkinMap(pick.sd);
			// 🔴 `data-mountain-skin` だけを見ると歯が無い＝肌の名前だけ正しくて
			//    実際には基本の1枚（雪山）を描いていても緑になる。
			//    ∴canvas のドットを肌ごとの「あるべき色」と突き合わせる。色は書き写さず
			//    実物のスプライトとパレットから作る（透明のドットは下地が見えるので除く）。
			const want = {};
			for (const s of MOUNTAIN_SKINS) want[s] = skinColorGrids(s);
			const got = await page.evaluate((want) => {
				const out = {};
				for (const cell of document.querySelectorAll('#board .cell')) {
					if (!cell.dataset.mountainSkin) continue;
					const cv = cell.querySelector('canvas');
					const rec = {
						skin: cell.dataset.mountainSkin,
						attr: cv?.width ?? null,
						cls: cv?.className ?? null,
						match: {},
						variant: {},
					};
					if (cv) {
						const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
						const hex = (r, c) => {
							const i = (r * cv.width + c) * 4;
							if (px[i + 3] === 0) return null;
							return `#${[px[i], px[i + 1], px[i + 2]]
								.map(v => v.toString(16).padStart(2, '0')).join('')}`;
						};
						// 肌ごとに変種を全部当てて、いちばん合う1枚の一致率とその番号を返す
						for (const [s, grids] of Object.entries(want)) {
							let best = 0, bestV = -1;
							grids.forEach((grid, v) => {
								let hit = 0, total = 0;
								for (let r = 0; r < grid.length; r++) {
									for (let c = 0; c < grid[r].length; c++) {
										if (!grid[r][c]) continue;
										total++;
										if (hex(r, c) === grid[r][c]) hit++;
									}
								}
								const rate = total ? hit / total : 0;
								if (rate > best) { best = rate; bestV = v; }
							});
							rec.match[s] = best;
							rec.variant[s] = bestV;
						}
					}
					out[`${cell.dataset.row},${cell.dataset.col}`] = rec;
				}
				return out;
			}, want);
			// 画面の山セルの数と肌が一致する
			expect(Object.keys(got).length, `画面 field ${pick.sk} の山の数が食い違う`)
				.toBe(expected.size);
			for (const [key, wantSkin] of expected) {
				expect(got[key], `山 ${key} が描かれていない`).toBeTruthy();
				expect(got[key].skin, `山 ${key} の肌が違う`).toBe(wantSkin);
				expect(got[key].attr, `山 ${key} の絵が 32 ドットでない`).toBe(32);
				expect(got[key].cls, `山 ${key} がセル全面で貼られていない`).toContain('field-sprite');
				// 描かれたドットが本当にその肌の絵（名前だけ合っている状態を弾く）
				expect(got[key].match[wantSkin],
					`山 ${key} のドットが ${wantSkin} のどの変種とも違う（一致率 `
					+ `${(got[key].match[wantSkin] * 100).toFixed(1)}%）＝別の肌の絵で描いている`)
					.toBeGreaterThan(0.95);
				// 描かれた1枚が「座標から引ける変種」であること（10a-4）＝
				// 肌が合っていても代表1枚に戻っていれば別の番号になって赤くなる
				const [mr, mc] = key.split(',').map(Number);
				expect(got[key].variant[wantSkin],
					`山 ${key} に描かれた ${wantSkin} の絵が座標から引ける変種でない`)
					.toBe(wantVariant(wantSkin, mr, mc));
				for (const s of MOUNTAIN_SKINS) {
					if (s === wantSkin) continue;
					expect(got[key].match[s], `山 ${key} が ${s} の絵とも一致する＝肌の見分けが付かない`)
						.toBeLessThan(0.5);
				}
			}
			// 選んだ画面には目的の肌が実際に出ている（空回り防止）
			expect([...expected.values()].filter(s => s === skin).length,
				`画面 field ${pick.sk} に肌 ${skin} が無い`).toBeGreaterThan(0);
		});
	}

	test('⑨ エディタも同じ肌で描く（砂地に置いた山がメサになる）', async ({ page }) => {
		// タイル→スプライトの対応は「エディタとゲームで分けない」が方針
		// （[[blade-tile-sprite-single-source]]／橋のデッキで同じ食い違いを踏んでいる）。
		// ∴エディタの canvas のドットを実際に読んで、肌が解決されていることを確かめる。
		// メサとアルペンは同じ位置の不透明ドットの色が 265/265 すべて違う（一致率 0%）
		// ∴基本の1枚（雪山）で描いていれば一致率が落ちて必ず赤くなる。
		await page.goto('http://localhost:18080/blade-of-lumia/editor/');
		await page.waitForSelector('#world-grid .cell-empty', { state: 'visible' });
		await page.locator('#world-grid .cell-empty').first().click();
		await page.locator('#btn-edit-stage').click();
		await page.waitForSelector('#stage-canvas', { state: 'visible' });

		const CELL = 40;                       // editor-canvas.js の CELL_SIZE
		const BLOCK = [[1, 1], [1, 2], [2, 1], [2, 2]];
		const paint = async (title, cells) => {
			await page.locator(`button.tile-btn[title="${title}"]`).click();
			const box = await page.locator('#stage-canvas').boundingBox();
			for (const [r, c] of cells) {
				await page.mouse.click(box.x + c * CELL + CELL / 2, box.y + r * CELL + CELL / 2);
			}
		};
		await paint('砂地', BLOCK);            // 下地（bgTiles 層）を砂にする
		await paint('山', BLOCK);              // その上に一つづきの山を置く＝塊は全部メサ

		// 肌ごとの「このドットは何色になるはず」を実物のスプライトとパレットから作る
		// （色を書き写さない。透明のドットは下地が見えるので比べない）。
		// ❌失効（10a-4）：代表1枚ではなく「そのセルの座標から引ける変種」と比べる。
		const at0 = { r: BLOCK[0][0], c: BLOCK[0][1] };
		const want = {};
		for (const skin of MOUNTAIN_SKINS) {
			const p = PAL[skinName(MT.pal, skin)];
			const nm = objVariantName(skinName(MT.spr, skin), at0.r, at0.c);
			want[skin] = SPRITES[nm][0].map(row => row.map(v => (v ? p[v] : null)));
		}

		const hits = await page.evaluate(({ want, cell, at }) => {
			const ctx = document.getElementById('stage-canvas').getContext('2d');
			const n = want[Object.keys(want)[0]].length;      // 32
			const dot = cell / n;
			const px = ctx.getImageData(at.c * cell, at.r * cell, cell, cell).data;
			const hex = (x, y) => {
				const i = (Math.floor(y) * cell + Math.floor(x)) * 4;
				return `#${[px[i], px[i + 1], px[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
			};
			const out = {};
			for (const [skin, grid] of Object.entries(want)) {
				let hit = 0, total = 0;
				for (let r = 0; r < n; r++) {
					for (let c = 0; c < n; c++) {
						const w = grid[r][c];
						if (!w) continue;
						total++;
						if (hex((c + 0.5) * dot, (r + 0.5) * dot) === w) hit++;
					}
				}
				out[skin] = { hit, total };
			}
			return out;
		}, { want, cell: CELL, at: at0 });

		const mesa = GROUND_TO_MOUNTAIN_SKIN[TILE.SAND];
		expect(hits[mesa].hit / hits[mesa].total,
			`エディタの砂地の山が ${mesa} で描かれていない`
			+ `（一致 ${hits[mesa].hit}/${hits[mesa].total}）＝基本の1枚に戻っている`)
			.toBeGreaterThan(0.95);
		for (const skin of MOUNTAIN_SKINS) {
			if (skin === mesa) continue;
			expect(hits[skin].hit / hits[skin].total,
				`エディタの砂地の山が ${skin} にも一致する＝肌の見分けが付いていない`)
				.toBeLessThan(0.5);
		}
	});

});
