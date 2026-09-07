// tests/veg-skins.spec.js — 木・茂みの肌を下地から導出する（キュー10番 10a-5）
//
// 何を守るテストか：
//   木 `'t'`・茂み `'u'` は世界中で同じ「緑の広葉樹／緑の低木」だった∴火山灰の上に
//   瑞々しい緑の木が 30 本立つ画面（field 12,2）・雪原に夏の木が 34 本立つ画面
//   （field 13,5）が実在した（10a-5 の実測）。山 10a-1d と同じく**タイルは増やさず**
//   絵だけを下地から導く＝マップデータ変更 0。
//
// 観測できること（＝テストの当て所）：
//   ・対応表  下地 → 肌は shared/tile-skins.js の1表だけ（5肌すべてに下地がある）
//   ・セル単位 木・茂みは1セルに1本ずつ立つ別個の個体∴**塊の多数決をしない**
//             ← 山と同じ塊単位にすると、雪原に食い込んだ森の先端まで夏の木になる
//   ・網羅    実マップの木 3140／茂み 226 セルは全部いずれかの肌になり、5肌すべて出る
//   ・受け皿  下地が地面でない（水の上・石畳）セルは「画面の最多の地面」へ落ちる
//   ・形      肌ごとに**形を作り直している**（色の差し替えではない）
//   ・実描画  ゲームの DOM とエディタの canvas に選んだ肌の絵が出る
//             ← 名前（data-art-skin）だけ見ると、実際は緑の木を描いていても緑になる

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { TILE } from '../shared/tiles.js';
import { SPRITES, PAL } from '../shared/sprites.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import {
	VEG_SKINS, GROUND_TO_VEG_SKIN, VEG_SKIN_DEFAULT,
	skinName, vegSkinAt, skinnedSprite,
} from '../shared/tile-skins.js';
import { OBJ_VARIANTS, objVariantName } from '../shared/sprites-tiles.js';
import { gameLayerEntries } from '../shared/layers.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const EDITOR = '/blade-of-lumia/editor/';
const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));

const posKey = (r, c) => `${r},${c}`;
const VEG = [
	{ tile: TILE.TREE, label: '木', spr: TILE_SPRITE_MAP[TILE.TREE].spr, pal: TILE_SPRITE_MAP[TILE.TREE].pal },
	{ tile: TILE.BUSH, label: '茂み', spr: TILE_SPRITE_MAP[TILE.BUSH].spr, pal: TILE_SPRITE_MAP[TILE.BUSH].pal },
];

// 実マップの全画面（レイヤー横断）＝横断集計は gameLayerEntries を通す
function allStages() {
	const out = [];
	for (const [lk, layer] of gameLayerEntries(MAP)) {
		for (const [sk, sd] of Object.entries(layer.stages ?? {})) out.push({ lk, sk, sd });
	}
	return out;
}

// 画面の中の「木／茂み → 肌」
function vegSkinMap(sd, tile) {
	const out = new Map();
	(sd.tiles ?? []).forEach((row, r) => {
		for (let c = 0; c < (row?.length ?? 0); c++) {
			if (row[c] !== tile) continue;
			out.set(posKey(r, c), vegSkinAt(sd, r, c));
		}
	});
	return out;
}

// そのセルに描かれるはずの絵の「色つき格子」（コマ2枚ぶん）。
// ⚠ 木・茂みは揺れる＝canvas に出ているのは 2 コマのどちらか（世界に1つの animFrame）
//    ∴どちらかに一致すれば良い（位相を入れ替えた変種は 2 コマの順が逆＝同じ2枚）。
function wantFrames(spr, pal, skin, r, c) {
	const p = PAL[skinName(pal, skin)];
	const nm = objVariantName(skinName(spr, skin), r, c);
	return SPRITES[nm].map(g => g.map(row => row.map(v => (v ? p[v] : null))));
}

test.describe('木・茂みの肌を下地から導出する', () => {

	test('① 下地 → 肌の対応表が5肌すべてを覆い、絵と色が実在する', () => {
		const mapped = new Set(Object.values(GROUND_TO_VEG_SKIN));
		expect([...mapped].sort(), '肌の一覧と対応表の値が食い違う').toEqual([...VEG_SKINS].sort());
		expect(mapped.has(VEG_SKIN_DEFAULT), '既定の肌が対応表に無い').toBe(true);
		for (const { spr, pal, label } of VEG) {
			for (const skin of VEG_SKINS) {
				expect(SPRITES[skinName(spr, skin)], `${label} の肌 ${skin} の絵が無い`).toBeTruthy();
				expect(PAL[skinName(pal, skin)], `${label} の肌 ${skin} のパレットが無い`).toBeTruthy();
				expect(OBJ_VARIANTS[skinName(spr, skin)], `${label} の肌 ${skin} に変種が無い`)
					.toBeGreaterThanOrEqual(4);
			}
			// 基本名（肌を解決しない描画先が引く1枚）は既定の肌と同じ絵・同じ色
			expect(SPRITES[spr], `${label} の基本名の絵が既定の肌と違う`)
				.toBe(SPRITES[skinName(spr, VEG_SKIN_DEFAULT)]);
			expect(PAL[pal], `${label} の基本名の色が既定の肌と違う`)
				.toEqual(PAL[skinName(pal, VEG_SKIN_DEFAULT)]);
		}
	});

	test('② 導出はセル単位＝隣り合う木でも下地が違えば肌が混ざる（山と違う）', () => {
		// 🔴 ここが 10a-5 の設計の要。山 `mountainSkinMap` は塊で多数決するが、木は
		//    1セル1本の別個体∴森が雪線を跨げば雪の木と夏の木が混ざるのが正しい。
		//    塊で多数決する実装に変えるとこの検査だけが赤くなる（歯）。
		const sd = {
			tiles: [
				'tttt'.split(''),
				'uuuu'.split(''),
			],
			bgTiles: {
				'0,0': TILE.GRASS, '0,1': TILE.GRASS, '0,2': TILE.SNOW, '0,3': TILE.SNOW,
				'1,0': TILE.GRASS, '1,1': TILE.ASH, '1,2': TILE.SAND, '1,3': TILE.MUD,
			},
		};
		expect(vegSkinAt(sd, 0, 0), '草地の木が広葉樹でない').toBe(GROUND_TO_VEG_SKIN[TILE.GRASS]);
		expect(vegSkinAt(sd, 0, 2), '雪原の木が針葉樹でない（隣の草地に引きずられた）')
			.toBe(GROUND_TO_VEG_SKIN[TILE.SNOW]);
		expect(vegSkinAt(sd, 1, 1), '火山灰の茂みが焼け枝でない').toBe(GROUND_TO_VEG_SKIN[TILE.ASH]);
		expect(vegSkinAt(sd, 1, 2), '砂の茂みが乾いた藪でない').toBe(GROUND_TO_VEG_SKIN[TILE.SAND]);
		expect(vegSkinAt(sd, 1, 3), '泥の茂みが葦でない').toBe(GROUND_TO_VEG_SKIN[TILE.MUD]);
		// 一つづきの林（4セル）の中で肌が 2 種になる＝塊の多数決なら 1 種に潰れる
		const used = new Set([0, 1, 2, 3].map(c => vegSkinAt(sd, 0, c)));
		expect(used.size, '一つづきの林で肌が1種に潰れた＝塊の多数決になっている').toBe(2);
	});

	test('③ 下地が地面でないセルは「画面の最多の地面」へ落ちる', () => {
		// 水の上（桟橋の木）・石畳・未設定＝実マップに木 59＋4／茂み 33＋1 セルある。
		const sd = {
			tiles: [
				'..t.'.split(''),
				'....'.split(''),
			],
			bgTiles: { '0,2': TILE.STONE_FLOOR, '1,0': TILE.SNOW, '1,1': TILE.SNOW, '1,2': TILE.GRASS },
		};
		expect(vegSkinAt(sd, 0, 2), '石畳の上の木が画面の最多の地面（雪）を拾わない')
			.toBe(GROUND_TO_VEG_SKIN[TILE.SNOW]);
		const bare = { tiles: sd.tiles, bgTiles: { '0,2': TILE.STONE_FLOOR } };
		expect(vegSkinAt(bare, 0, 2), '地面が無い画面で既定の肌にならない').toBe(VEG_SKIN_DEFAULT);
	});

	test('④ 実マップの木・茂みは全部いずれかの肌になり、5肌すべてが世界に出る', () => {
		for (const { tile, label } of VEG) {
			const count = new Map();
			let cells = 0;
			for (const { lk, sk, sd } of allStages()) {
				for (const [key, skin] of vegSkinMap(sd, tile)) {
					cells++;
					expect(skin, `${lk} ${sk} の${label} ${key} に肌が付いていない`).toBeTruthy();
					expect(VEG_SKINS, `${lk} ${sk} の${label} ${key} で未知の肌が出た`).toContain(skin);
					count.set(skin, (count.get(skin) ?? 0) + 1);
				}
			}
			expect(cells, `実マップの${label}のセル数が減っている`).toBeGreaterThan(label === '木' ? 3000 : 200);
			// ⚠ 砂の上の茂み（arid）は 2026-09-07 の実マップに 0 セル（木は 10 セルある）。
			//    全5肌を要求すると「存在しない地形を作れ」という嘘の赤になる∴実在する肌を
			//    数える（木は5肌すべて出る／茂みは 4 肌以上＋草地以外が必ず出る）。
			const seen = [...count.keys()];
			for (const skin of seen) expect(VEG_SKINS, `${label} で未知の肌 ${skin}`).toContain(skin);
			expect(seen.length, `${label} の肌が世界に出る数が減った＝肌を作った意味が無い`)
				.toBeGreaterThanOrEqual(label === '木' ? VEG_SKINS.length : VEG_SKINS.length - 1);
			expect(cells - (count.get(VEG_SKIN_DEFAULT) ?? 0),
				`${label} が全部 ${VEG_SKIN_DEFAULT}＝下地から導けていない`).toBeGreaterThan(0);
		}
	});

	test('⑤ 肌ごとに形を作り直している（色の差し替えではない）', () => {
		// 🔴 10a-5 の指定＝「絵は肌ごとに形から作り直す」。パレットだけ替えると
		//    雪原に「白い広葉樹」が立つ（形が夏のまま）∴影絵そのものを比べる。
		for (const { spr, label } of VEG) {
			const shape = (name) => SPRITES[name][0].map(row => row.map(v => (v ? 1 : 0)).join('')).join('');
			const base = shape(skinName(spr, VEG_SKIN_DEFAULT));
			for (const skin of VEG_SKINS) {
				if (skin === VEG_SKIN_DEFAULT) continue;
				const other = shape(skinName(spr, skin));
				let diff = 0;
				for (let i = 0; i < base.length; i++) if (base[i] !== other[i]) diff++;
				expect(diff, `${label} の肌 ${skin} が ${VEG_SKIN_DEFAULT} と同じ形＝色だけ替えている`)
					.toBeGreaterThan(40);
			}
		}
	});

	test('⑥ 描画は skinnedSprite() 1本を通る＝肌を持つタイルの判断が1か所', () => {
		// 🔴 ゲームとエディタで表を書き写すと片方だけ緑のまま残る
		//    （[[blade-tile-sprite-single-source]]）。この関数の入出力を固定する。
		const sd = { tiles: ['tuM'.split('')], bgTiles: { '0,0': TILE.SNOW, '0,1': TILE.ASH, '0,2': TILE.SAND } };
		const tree = skinnedSprite(sd, 0, 0, TILE.TREE, TILE_SPRITE_MAP[TILE.TREE]);
		expect(tree.spr, '木の絵に肌が付かない').toBe(skinName('tree', 'snowy'));
		expect(tree.pal, '木の色に肌が付かない').toBe(skinName('tree', 'snowy'));
		expect(tree.skin, '選んだ肌が返らない').toBe('snowy');
		const bush = skinnedSprite(sd, 0, 1, TILE.BUSH, TILE_SPRITE_MAP[TILE.BUSH]);
		expect(bush.spr, '茂みの絵に肌が付かない').toBe(skinName('bush', 'charred'));
		// 肌を持たないタイルは素通し（同じ物がそのまま返る）
		const si = TILE_SPRITE_MAP[TILE.SIGN];
		expect(skinnedSprite(sd, 0, 0, TILE.SIGN, si), '看板に肌が付いた').toBe(si);
		expect(skinnedSprite(sd, 0, 0, TILE.TREE, undefined), '共通表に無いタイルで落ちる').toBeUndefined();
	});

});

test.describe('木・茂みの肌 – 実エンジン', () => {

	// 肌ごとに「その肌の木（茂み）が最も多い field の画面」を実マップから選ぶ（手書きしない）。
	function stageForSkin(tile, skin) {
		let best = null;
		for (const [sk, sd] of Object.entries(MAP.layers.field.stages)) {
			let n = 0;
			for (const s of vegSkinMap(sd, tile).values()) if (s === skin) n++;
			if (n > (best?.n ?? 0)) best = { sk, sd, n };
		}
		return best;
	}
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

	// 画面を開いて「肌つきの絵が描かれたセル」を全部読む。
	// 🔴 `data-art-skin` だけを見ると歯が無い＝肌の名前だけ正しくて実際には緑の木を
	//    描いていても緑になる。∴canvas のドットを肌ごとの「あるべき色」と突き合わせる
	//    （色は書き写さず実物のスプライトとパレットから作る・透明のドットは除く）。
	async function probe(page, pick, tile, spr, pal) {
		const start = landing(pick.sd);
		expect(start, `画面 field ${pick.sk} に着地できるセルが無い`).toBeTruthy();
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: pick.sk,
			row: String(start.r), col: String(start.c),
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);

		const expected = vegSkinMap(pick.sd, tile);
		// セルごと・肌ごとの「あるべき色つき格子」（2コマぶん）を先に作って渡す
		const want = {};
		for (const key of expected.keys()) {
			const [r, c] = key.split(',').map(Number);
			want[key] = {};
			for (const skin of VEG_SKINS) want[key][skin] = wantFrames(spr, pal, skin, r, c);
		}
		// ⚠ セルに data-tile は無い∴「その画面のそのタイルの座標」を先に絞って渡す
		//    （木の検査で茂みのセルを拾わないため）。
		const got = await page.evaluate(({ want }) => {
			const out = {};
			for (const cell of document.querySelectorAll('#board .cell')) {
				const key = `${cell.dataset.row},${cell.dataset.col}`;
				if (!want[key]) continue;
				const cv = cell.querySelector('canvas');
				const rec = { skin: cell.dataset.artSkin ?? null, name: cell.dataset.artSprite ?? null,
					width: cv?.width ?? null, cls: cv?.className ?? null, match: {} };
				if (cv) {
					const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
					const hex = (r, c) => {
						const i = (r * cv.width + c) * 4;
						if (px[i + 3] === 0) return null;
						return `#${[px[i], px[i + 1], px[i + 2]]
							.map(v => v.toString(16).padStart(2, '0')).join('')}`;
					};
					// 揺れる絵＝出ているのは2コマのどちらか∴良い方の一致率を採る
					for (const [skin, frames] of Object.entries(want[key])) {
						let best = 0;
						for (const grid of frames) {
							let hit = 0, total = 0;
							for (let r = 0; r < grid.length; r++) {
								for (let c = 0; c < grid[r].length; c++) {
									if (!grid[r][c]) continue;
									total++;
									if (hex(r, c) === grid[r][c]) hit++;
								}
							}
							if (total && hit / total > best) best = hit / total;
						}
						rec.match[skin] = best;
					}
				}
				out[key] = rec;
			}
			return out;
		}, { want });
		return { expected, got };
	}

	function assertSkins({ expected, got }, label, stageKey) {
		expect(Object.keys(got).length, `画面 field ${stageKey} の${label}の数が食い違う`)
			.toBe(expected.size);
		for (const [key, wantSkin] of expected) {
			expect(got[key], `${label} ${key} が描かれていない`).toBeTruthy();
			expect(got[key].skin, `${label} ${key} の肌が違う`).toBe(wantSkin);
			expect(got[key].name, `${label} ${key} が「肌 → 変種」の名前でない`)
				.toMatch(new RegExp(`@${wantSkin}#\\d+$`));
			expect(got[key].width, `${label} ${key} の絵が 32 ドットでない`).toBe(32);
			expect(got[key].cls, `${label} ${key} がセル全面で貼られていない`).toContain('field-sprite');
			expect(got[key].match[wantSkin],
				`${label} ${key} のドットが ${wantSkin} の絵と違う（一致率 `
				+ `${(got[key].match[wantSkin] * 100).toFixed(1)}%）＝別の肌の絵で描いている`)
				.toBeGreaterThan(0.95);
			for (const skin of VEG_SKINS) {
				if (skin === wantSkin) continue;
				expect(got[key].match[skin], `${label} ${key} が ${skin} の絵とも一致する＝肌の見分けが付かない`)
					.toBeLessThan(0.5);
			}
		}
	}

	for (const skin of VEG_SKINS) {
		test(`⑦ ${skin} の画面で木が ${skin} として描かれる（実 DOM）`, async ({ page }) => {
			const pick = stageForSkin(TILE.TREE, skin);
			expect(pick?.n ?? 0, `肌 ${skin} の木がある field の画面が無い`).toBeGreaterThan(0);
			const r = await probe(page, pick, TILE.TREE, 'tree', 'tree');
			assertSkins(r, '木', pick.sk);
			expect([...r.expected.values()].filter(s => s === skin).length,
				`画面 field ${pick.sk} に肌 ${skin} の木が無い`).toBeGreaterThan(0);
		});
	}

	test('⑧ 茂みも肌で描き分ける（木だけ直っていない）', async ({ page }) => {
		// 🔴 茂みは render-board.js の別の枝（cutBushes を見る枝）で描かれる∴木の枝だけ
		//    直すと「木は地域ごと・茂みは全部緑」になる（10a-4 で同じ穴を踏んでいる）。
		for (const skin of ['charred', 'snowy', 'swamp']) {
			const pick = stageForSkin(TILE.BUSH, skin);
			expect(pick?.n ?? 0, `肌 ${skin} の茂みがある画面が無い`).toBeGreaterThan(0);
			const r = await probe(page, pick, TILE.BUSH, 'bush', 'bush');
			assertSkins(r, '茂み', pick.sk);
		}
	});

	test('⑨ エディタも同じ肌で描く（雪原に置いた木が針葉樹になる）', async ({ page }) => {
		// タイル→スプライトの対応は「エディタとゲームで分けない」が方針
		// （[[blade-tile-sprite-single-source]]／橋のデッキ・山の肌で2度踏んだ食い違い）。
		await page.goto(EDITOR);
		await page.waitForSelector('#world-grid .cell-empty', { state: 'visible' });
		await page.locator('#world-grid .cell-empty').first().click();
		await page.locator('#btn-edit-stage').click();
		await page.waitForSelector('#stage-canvas', { state: 'visible' });

		const CELL = 40;                       // editor-canvas.js の CELL_SIZE
		const AT = { r: 1, c: 1 };
		const paint = async (title, cells) => {
			await page.locator(`button.tile-btn[title="${title}"]`).click();
			const box = await page.locator('#stage-canvas').boundingBox();
			for (const [r, c] of cells) {
				await page.mouse.click(box.x + c * CELL + CELL / 2, box.y + r * CELL + CELL / 2);
			}
		};
		await paint('雪原', [[AT.r, AT.c]]);   // 下地（bgTiles 層）を雪にする
		await paint('木', [[AT.r, AT.c]]);     // その上に木を置く＝針葉樹になるはず

		// 肌ごとの「このドットは何色になるはず」を実物のスプライトとパレットから作る。
		// エディタは静止画（コマ0）で描く∴コマ0だけを比べる。
		// ⚠ エディタは 32 ドットの絵を 40px のセルへ拡大する（1ドット 1.25px）∴境界の
		//    ドットが補間されて一致率は 100% にならない（針葉樹の実測 92.5%）。
		//    肌の見分けは「他の肌が 50% 未満」で付く＝閾値は 0.9 にする。
		const want = {};
		for (const skin of VEG_SKINS) want[skin] = wantFrames('tree', 'tree', skin, AT.r, AT.c)[0];

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
						if (!grid[r][c]) continue;
						total++;
						if (hex((c + 0.5) * dot, (r + 0.5) * dot) === grid[r][c]) hit++;
					}
				}
				out[skin] = { hit, total };
			}
			return out;
		}, { want, cell: CELL, at: AT });

		const conifer = GROUND_TO_VEG_SKIN[TILE.SNOW];
		expect(hits[conifer].hit / hits[conifer].total,
			`エディタの雪原の木が ${conifer} で描かれていない`
			+ `（一致 ${hits[conifer].hit}/${hits[conifer].total}）＝緑の木に戻っている`)
			.toBeGreaterThan(0.9);
		for (const skin of VEG_SKINS) {
			if (skin === conifer) continue;
			expect(hits[skin].hit / hits[skin].total,
				`エディタの雪原の木が ${skin} にも一致する＝肌の見分けが付いていない`)
				.toBeLessThan(0.5);
		}
	});

});
