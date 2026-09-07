// tests/field-tiles-32.spec.js — 木・山・茂み・看板の 32 ドット化／キュー10番 10a-1c
//
// 何を守るテストか：
//   ① この4種は 8×8 で描かれていた。0.7 セル（108×0.7 = 75.59px）に伸ばすと
//      1ドット＝9.45px ∴プレイヤー（32ドット＝3.375px）や地面（32ドット）と
//      粗さが揃わず、木や山だけ「別のゲームの絵」に見えていた。
//      ∴ 32×32 の格子で描き直し、canvas はセル全面（.field-sprite）に貼る。
//   ② ただし**見た目の大きさは変えない**（PLAN の制約＝「セルを埋めない絵」は
//      意図的。木や山がセルを埋めると世界の見え方が変わる）。∴絵の側に透明の
//      余白を持たせて 18〜25 ドットに収める＝見かけは従来の 0.7 セルと同じ。
//   ③ 絵そのものの品質。1ドットの孤立した粒・櫛の歯の輪郭・雪線の1列だけの
//      欠け（試作で実際に出た）は 3.375px の四角として目に見える＝ノイズになる。
//
// 観測できること（＝テストの当て所）：
//   ・格子    4種すべて 32×32（全コマ）
//   ・大きさ  影絵の縦横 18〜25 ドット・左右に余白が残る・横位置は中央
//   ・輪郭    影絵は1つの連結成分・内側に透明の穴が無い
//   ・コマ    木・茂みは2コマで別の絵、かつ見かけの大きさが揃う（＝絵が飛ばない）
//   ・色      使う色番号は全部パレットに定義済み（木の 7＝葉の日向を足した）
//   ・山      雪は列ごとに1本の連続した塊・雪線の段差は2列以上の幅を持つ
//             ・輪郭は下へ行くほど広がる・雪は上半分だけ
//   ・木      樹冠の下に幹が見える
//   ・実描画  ゲームの DOM で canvas が 32 ドット・セル全面＝1ドットがキャラと同じ
//             （.obj-sprite に戻っていない＝9.45px ピッチの再発防止）
//   ・単一の真実 形と色は TILE_SPRITE_MAP から引く

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { TILE } from '../shared/tiles.js';
import { SPRITES, PAL, CELL_GROUND_N } from '../shared/sprites.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { FIELD_N, MT_SKIN_ART } from '../shared/sprites-tiles.js';
import { MOUNTAIN_SKINS, VEG_SKINS, skinName } from '../shared/tile-skins.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));

// 木・山・茂み・看板が1画面に同居する（見比べ用に選んだ）画面。
const PROBE_STAGE = '10,1';
// 山は下地から選ぶ肌が5種ある（10a-1d）∴絵の品質はどの肌でも満たす。
// 一覧は手書きせず TILE_SPRITE_MAP と肌の一覧から導く（[[blade-tile-sprite-single-source]]）。
const MT = TILE_SPRITE_MAP[TILE.MOUNTAIN];
// タイル単位の一覧（山は肌が5種あっても 'M' 1タイル）＝共通表の検査・実 DOM の検査はこちら。
const ART_TILE_KINDS = [
	{ tile: TILE.TREE,     spr: 'tree',     label: '木'   },
	{ tile: TILE.MOUNTAIN, spr: MT.spr,     label: '山'   },
	{ tile: TILE.BUSH,     spr: 'bush',     label: '茂み' },
	{ tile: TILE.SIGN,     spr: 'sign',     label: '看板' },
];
// 絵単位の一覧＝山・木・茂みは肌ごとの5枚へ展開する（絵の品質はどの肌でも満たす）。
// ⚠ 木・茂みも 10a-5 から肌ごとに**形を作り直した**（色の差し替えではない）∴素の名前
//    1枚だけ見ると針葉樹・椰子・葦の品質を一度も見ないまま緑になる。
const MOUNTAIN_ART = MOUNTAIN_SKINS.map(skin => ({
	tile: TILE.MOUNTAIN, spr: skinName(MT.spr, skin), pal: skinName(MT.pal, skin),
	label: `山(${skin})`, skin,
}));
const vegArt = (tile, label) => VEG_SKINS.map(skin => ({
	tile, spr: skinName(TILE_SPRITE_MAP[tile].spr, skin), pal: skinName(TILE_SPRITE_MAP[tile].pal, skin),
	label: `${label}(${skin})`, skin,
}));
const TREE_ART = vegArt(TILE.TREE, '木');
const BUSH_ART = vegArt(TILE.BUSH, '茂み');
const SKIN_ART = { [TILE.MOUNTAIN]: MOUNTAIN_ART, [TILE.TREE]: TREE_ART, [TILE.BUSH]: BUSH_ART };
const ART_TILES = ART_TILE_KINDS.flatMap(e => SKIN_ART[e.tile] ?? [e]);

const framesOf = (spr) => SPRITES[spr];

function bbox(grid) {
	let r0 = Infinity, r1 = -1, c0 = Infinity, c1 = -1;
	grid.forEach((row, r) => row.forEach((v, c) => {
		if (!v) return;
		r0 = Math.min(r0, r); r1 = Math.max(r1, r);
		c0 = Math.min(c0, c); c1 = Math.max(c1, c);
	}));
	return { r0, r1, c0, c1, h: r1 - r0 + 1, w: c1 - c0 + 1 };
}

// 不透明ドットの連結成分の数（4近傍）。2つ以上＝絵が空中で分離している。
function solidGroups(grid) {
	const n = grid.length;
	const seen = Array.from({ length: n }, () => Array(n).fill(false));
	let groups = 0;
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			if (seen[r][c] || !grid[r][c]) continue;
			groups++;
			const stack = [[r, c]];
			seen[r][c] = true;
			while (stack.length) {
				const [cr, cc] = stack.pop();
				for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					const nr = cr + dr, nc = cc + dc;
					if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
					if (seen[nr][nc] || !grid[nr][nc]) continue;
					seen[nr][nc] = true;
					stack.push([nr, nc]);
				}
			}
		}
	}
	return groups;
}

// 絵の内側に閉じ込められた透明ドット（＝穴）の数。外周から塗って残ったもの。
function holes(grid) {
	const n = grid.length;
	const seen = Array.from({ length: n }, () => Array(n).fill(false));
	const stack = [];
	for (let i = 0; i < n; i++) {
		for (const [r, c] of [[0, i], [n - 1, i], [i, 0], [i, n - 1]]) {
			if (!grid[r][c] && !seen[r][c]) { seen[r][c] = true; stack.push([r, c]); }
		}
	}
	while (stack.length) {
		const [cr, cc] = stack.pop();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = cr + dr, nc = cc + dc;
			if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
			if (seen[nr][nc] || grid[nr][nc]) continue;
			seen[nr][nc] = true;
			stack.push([nr, nc]);
		}
	}
	let count = 0;
	for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!grid[r][c] && !seen[r][c]) count++;
	return count;
}

test.describe('木・山・茂み・看板の 32 ドット絵', () => {

	test('① 4種すべて 32×32＝キャラ・地面・橋と同じ格子', () => {
		expect(FIELD_N, 'フィールド絵の格子がセル1枚ぶん（32）でない').toBe(CELL_GROUND_N);
		for (const { spr, label } of ART_TILES) {
			const frames = framesOf(spr);
			expect(frames, `SPRITES['${spr}'] が無い`).toBeTruthy();
			frames.forEach((g, fi) => {
				expect(g.length, `${label}（${spr}）コマ${fi} の行数`).toBe(FIELD_N);
				for (const row of g) expect(row.length, `${label} コマ${fi} の列数`).toBe(FIELD_N);
			});
		}
	});

	test('② 影絵は 18〜25 ドット・左右に余白が残る＝セルを埋めない絵のまま', () => {
		// 🔴 見かけの大きさを変えないのが 10a-1c の制約（PLAN）。セル全面に貼る
		//    canvas の中で、絵は 32 ドットのうち 18〜25 ドットだけを使う
		//    ＝22/32 ≒ 0.69 セル＝従来の obj-sprite（0.7 倍）と同じ大きさに見える。
		for (const { spr, label } of ART_TILES) {
			framesOf(spr).forEach((g, fi) => {
				const b = bbox(g);
				expect(b.w, `${label} コマ${fi} の横幅が範囲外（${b.w}ドット）`).toBeGreaterThanOrEqual(18);
				expect(b.w, `${label} コマ${fi} がセルを埋めている（${b.w}ドット）`).toBeLessThanOrEqual(25);
				expect(b.h, `${label} コマ${fi} の高さが範囲外（${b.h}ドット）`).toBeGreaterThanOrEqual(14);
				expect(b.h, `${label} コマ${fi} がセルを埋めている（${b.h}ドット）`).toBeLessThanOrEqual(25);
				expect(b.c0, `${label} コマ${fi} が左端に接している＝余白が無い`).toBeGreaterThan(0);
				expect(b.c1, `${label} コマ${fi} が右端に接している＝余白が無い`).toBeLessThan(FIELD_N - 1);
				expect(b.r1, `${label} コマ${fi} が下端に接している＝余白が無い`).toBeLessThan(FIELD_N - 1);
				// 横位置は中央（セルの中心に立っていないと隣のセルへずれて見える）
				const mid = (b.c0 + b.c1) / 2;
				expect(Math.abs(mid - (FIELD_N - 1) / 2),
					`${label} コマ${fi} が横にずれている（中心 ${mid}）`).toBeLessThanOrEqual(1);
			});
		}
	});

	test('③ 影絵は1つの塊・内側に穴が無い・輪郭が櫛の歯にならない', () => {
		// 円の合併で輪郭を作ると、円の重なりに1ドットの隙間が空いて輪郭が櫛の歯に
		// なる（試作で実際に出た）∴fdFoliage は隙間埋めの工程を持つ。隙間は「閉じた穴」
		// ではなく縁の欠け＝上下または左右を絵に挟まれた透明ドットとして現れる。
		for (const { spr, label } of ART_TILES) {
			framesOf(spr).forEach((g, fi) => {
				expect(solidGroups(g), `${label} コマ${fi} の絵が分離している`).toBe(1);
				expect(holes(g), `${label} コマ${fi} の絵に閉じた穴（透明の抜け）がある`).toBe(0);
				const notches = [];
				for (let r = 1; r < FIELD_N - 1; r++) {
					for (let c = 1; c < FIELD_N - 1; c++) {
						if (g[r][c]) continue;
						if ((g[r][c - 1] && g[r][c + 1]) || (g[r - 1][c] && g[r + 1][c])) notches.push(`${r},${c}`);
					}
				}
				expect(notches, `${label} コマ${fi} の輪郭に1ドットの欠け（櫛の歯）がある`).toEqual([]);
			});
		}
	});

	test('④ 木・茂みは2コマで別の絵、かつ見かけの大きさが揃う＝風でざわつくだけ', () => {
		// 絵全体を横にずらすと「木そのものが1ドット飛ぶ」ように見える∴動かすのは
		// 一部の房だけ＝影絵の大きさはコマ間でほぼ同じになる。
		for (const { spr } of [...TREE_ART, ...BUSH_ART]) {
			const frames = framesOf(spr);
			expect(frames.length, `${spr} が2コマでない＝揺れない`).toBe(2);
			expect(JSON.stringify(frames[0]), `${spr} の2コマが同じ絵`).not.toBe(JSON.stringify(frames[1]));
			const [a, b] = frames.map(bbox);
			expect(Math.abs(a.w - b.w), `${spr} のコマ間で幅が変わりすぎ`).toBeLessThanOrEqual(2);
			expect(Math.abs(a.h - b.h), `${spr} のコマ間で高さが変わりすぎ`).toBeLessThanOrEqual(2);
			expect(Math.abs(a.r1 - b.r1), `${spr} のコマ間で接地位置が動く＝浮いて見える`).toBeLessThanOrEqual(1);
		}
		// 山・看板は動かない（風で揺れる物ではない）＝山は5肌すべて1コマ
		for (const { spr, label } of MOUNTAIN_ART) {
			expect(framesOf(spr).length, `${label} が複数コマ＝山が揺れる`).toBe(1);
		}
		expect(framesOf('sign').length, '看板が複数コマ＝看板が揺れる').toBe(1);
	});

	test('⑤ 使う色番号は全部パレットに定義済み＝透明の抜けが出ない', () => {
		// 木は陰影を4段にするため 7（葉の日向）を足した。片方だけ直すと
		// `palette[idx] ?? 'transparent'` で葉に穴が空く。
		for (const entry of ART_TILES) {
			const { spr, label } = entry;
			// 山は肌ごとに色を持つ∴その肌のパレットを見る（基本名だと熾火などを見落とす）
			const pal = entry.pal ?? TILE_SPRITE_MAP[entry.tile].pal;
			const palette = PAL[pal];
			expect(palette, `パレット ${pal} が無い`).toBeTruthy();
			for (const g of framesOf(spr)) {
				for (const row of g) {
					for (const idx of row) {
						if (!idx) continue;
						expect(palette[idx], `${label} が使う色 ${idx} がパレット ${pal} に無い`).toBeTruthy();
					}
				}
			}
		}
	});

	test('⑥ 雪を持つ肌の雪は列ごとに1本の塊で、雪線の段差は2列以上の幅を持つ', () => {
		// 🔴 凸凹（2列ごと）と「頂上から離れるほど雪線が上がる」分が噛み合わず、
		//    1列だけ深い／浅い列が出て、雪の中に岩の1ドット・岩の中に雪の1ドットが
		//    浮いた（試作で実測）。3.375px の粒＝ノイズに見える。
		// 対象は「雪を持つ肌」だけ（雪なしの肌・熾火の肌は⑦で別に見る）＝作りの表から導く。
		const SNOWY_MODES = new Set(['cap', 'blanket']);
		const targets = MOUNTAIN_ART.filter(({ skin }) => SNOWY_MODES.has(MT_SKIN_ART[skin].snow));
		expect(targets.length, '雪を持つ肌が1つも無い＝この検査が空回りしている').toBeGreaterThan(1);
		for (const { spr, label } of targets) {
			const g = framesOf(spr)[0];
			const SNOW = 5;
			const bottoms = [];
			for (let c = 0; c < FIELD_N; c++) {
				const rows = [];
				for (let r = 0; r < FIELD_N; r++) if (g[r][c] === SNOW) rows.push(r);
				if (!rows.length) { bottoms.push(null); continue; }
				expect(rows[rows.length - 1] - rows[0],
					`${label} 列 ${c} の雪が上下に飛んでいる（岩が挟まっている）`).toBe(rows.length - 1);
				bottoms.push(rows[rows.length - 1]);
			}
			expect(bottoms.filter(b => b !== null).length, `${label} に雪が無い`).toBeGreaterThan(6);
			for (let c = 1; c < FIELD_N - 1; c++) {
				if (bottoms[c] === null || bottoms[c - 1] === null || bottoms[c + 1] === null) continue;
				const lo = Math.min(bottoms[c - 1], bottoms[c + 1]);
				const hi = Math.max(bottoms[c - 1], bottoms[c + 1]);
				expect(bottoms[c] >= lo && bottoms[c] <= hi,
					`${label} 列 ${c} の雪線が両隣（${bottoms[c - 1]}, ${bottoms[c + 1]}）と食い違う`
					+ `（${bottoms[c]}）＝1列だけの歯＝雪に岩の粒が浮く`).toBe(true);
				expect(Math.abs(bottoms[c] - bottoms[c - 1]),
					`${label} 列 ${c} で雪線が飛んでいる`).toBeLessThanOrEqual(2);
			}
		}
	});

	test('⑦ 山の輪郭は5肌すべて下へ行くほど広がる', () => {
		for (const { spr, label } of MOUNTAIN_ART) {
			const g = framesOf(spr)[0];
			const b = bbox(g);
			const widths = [];
			for (let r = b.r0; r <= b.r1; r++) {
				const cols = g[r].map((v, c) => (v ? c : -1)).filter(c => c >= 0);
				widths.push(cols[cols.length - 1] - cols[0] + 1);
				// 各行は1本の帯（山の途中が透明で切れない）
				expect(cols.length, `${label} の行 ${r} が途切れている`).toBe(widths[widths.length - 1]);
			}
			for (let i = 1; i < widths.length; i++) {
				expect(widths[i], `${label} の行 ${b.r0 + i} が上の行より細い＝山に見えない`)
					.toBeGreaterThanOrEqual(widths[i - 1]);
			}
		}
	});

	test('⑦b 5（雪／熾火）の使い方は肌ごとの作り方どおり', () => {
		// 🔴 「雪は上半分だけ」は雪山（blanket）では必ず破れる∴肌ごとに条件を分ける。
		//    ・cap     …雪冠＝上半分で止まる（下半分まで来たら雪原に見える）
		//    ・blanket …裾まで下りる＝下半分まで来る。ただし岩と輪郭を必ず残す
		//                （全面白にすると下地の雪原と同化して山が消える）
		//    ・none    …5 を1ドットも使わない（砂漠・泥の山に雪は要らない）
		//    ・ember   …雪ではなく溶岩＝上の 1/3 に収まる少量（雪と見間違えない）
		for (const { spr, label, skin } of MOUNTAIN_ART) {
			const g = framesOf(spr)[0];
			const b = bbox(g);
			const mid = b.r0 + (b.r1 - b.r0) / 2;
			const dots = g.flat().filter(Boolean).length;
			const five = g.flat().filter(v => v === 5).length;
			let lowest = -1;
			for (let r = 0; r < FIELD_N; r++) if (g[r].includes(5)) lowest = r;
			const mode = MT_SKIN_ART[skin].snow;
			if (mode === 'cap') {
				expect(lowest, `${label} の雪が下半分まで来ている＝雪原に見える`).toBeLessThan(mid);
			} else if (mode === 'blanket') {
				expect(lowest, `${label} の雪が上半分で止まっている＝雪山に見えない`).toBeGreaterThan(mid);
				// 雪でないドット（岩・影・輪郭）が全体の 1/5 以上残る＝地面に沈まない
				expect((dots - five) / dots, `${label} が真っ白＝下地の雪原と同化して山が消える`)
					.toBeGreaterThanOrEqual(0.2);
				// 雪の下に岩が見える（最下行は雪でない）
				expect(g[b.r1].includes(5), `${label} の最下行まで雪＝裾の岩が無い`).toBe(false);
			} else if (mode === 'none') {
				expect(five, `${label} に雪／熾火が入っている（この肌には要らない）`).toBe(0);
			} else if (mode === 'ember') {
				expect(five, `${label} に熾火が無い`).toBeGreaterThan(3);
				expect(five / dots, `${label} の熾火が広すぎ＝雪冠に見える`).toBeLessThan(0.05);
				expect(lowest, `${label} の熾火が山の中腹まで垂れている`)
					.toBeLessThan(b.r0 + (b.r1 - b.r0) / 3);
			} else {
				throw new Error(`${label} の雪の作り方 '${mode}' に対する条件が無い`);
			}
		}
	});

	test('⑧ 木はどの肌でも樹冠の下に幹が見える（葉だけの玉になっていない）', () => {
		const TRUNK = new Set([5, 6]);       // 幹明・幹暗
		for (const { spr, label } of TREE_ART) {
			for (const g of framesOf(spr)) {
				const b = bbox(g);
				const lowest = g[b.r1].filter(Boolean);
				expect(lowest.length, `${label} の最下行が空`).toBeGreaterThan(0);
				expect(lowest.every(v => TRUNK.has(v)), `${label} の最下行が幹の色でない＝葉が地面に着いている`).toBe(true);
				// 幹は樹冠より下へ 4 ドット以上伸びる。
				// 🔴 測るのは**幹の色が現れる列の帯**の中だけ（2026-09-07）。行のどこかに
				//    葉の色があるかで測ると、幹から離れて垂れる苔（沼の木）まで「幹が
				//    埋もれている」と数えた。苔の形は field-art-variants ⑳ が縛る。
				const tc = [];
				for (let r = 0; r < FIELD_N; r++) {
					for (let c = 0; c < FIELD_N; c++) if (TRUNK.has(g[r][c])) tc.push(c);
				}
				const [c0, c1] = [Math.min(...tc), Math.max(...tc)];
				let lowestLeaf = -1;
				for (let r = 0; r < FIELD_N; r++) {
					for (let c = c0; c <= c1; c++) if (g[r][c] && !TRUNK.has(g[r][c])) { lowestLeaf = r; break; }
				}
				expect(b.r1 - lowestLeaf, `${label} の幹が短すぎる＝樹冠に埋もれて木に見えない`).toBeGreaterThanOrEqual(4);
			}
		}
	});

	test('⑨ 形と色は TILE_SPRITE_MAP から引く（書き写した表を持たない）', () => {
		for (const { tile, spr, label } of ART_TILE_KINDS) {
			const si = TILE_SPRITE_MAP[tile];
			expect(si, `${label} が共通表に無い`).toBeTruthy();
			expect(si.spr, `${label} の形が ${spr} でない`).toBe(spr);
			expect(SPRITES[si.spr], `${label} の形 ${si.spr} が実在しない`).toBeTruthy();
		}
	});

});

test.describe('木・山・茂み・看板 – 実エンジンのドット密度', () => {

	test('⑩ 4種の canvas は 32 ドットをセル全面に貼る＝1ドットがキャラと同じ', async ({ page }) => {
		// 🔴 0.7 倍の obj-sprite に戻ると 1ドット＝2.36px（32ドットなら）／
		//    8ドットの絵なら 9.45px ∴どちらもキャラ（3.375px）と揃わない。
		//    ここは実 DOM で「canvas の属性サイズ 32」と「CSS 幅＝セル幅」を見る。
		const stage = MAP.layers.field.stages[PROBE_STAGE];
		expect(stage, `画面 field ${PROBE_STAGE} が無い`).toBeTruthy();
		const at = {};
		stage.tiles.forEach((row, r) => [...row].forEach((ch, c) => {
			if (!at[ch]) at[ch] = { r, c };
		}));
		for (const { tile, label } of ART_TILE_KINDS) {
			expect(at[tile], `画面 field ${PROBE_STAGE} に ${label} が無い`).toBeTruthy();
		}

		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: PROBE_STAGE, row: '5', col: '0',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);

		const probe = await page.evaluate((spots) => {
			const read = (el) => {
				if (!el) return null;
				const cs = getComputedStyle(el);
				return {
					cls: el.className,
					attr: el.width,
					cssW: parseFloat(cs.width),
					cssH: parseFloat(cs.height),
				};
			};
			const out = { cellPx: null, hero: read(document.querySelector('#char-layer canvas')), tiles: {} };
			const anyCell = document.querySelector('#board .cell');
			out.cellPx = anyCell ? anyCell.getBoundingClientRect().width : null;
			for (const [key, { r, c }] of Object.entries(spots)) {
				const cell = document.querySelector(`#board .cell[data-row="${r}"][data-col="${c}"]`);
				out.tiles[key] = read(cell?.querySelector('canvas'));
			}
			return out;
		}, Object.fromEntries(ART_TILE_KINDS.map(({ tile, label }) => [label, at[tile]])));

		expect(probe.cellPx, 'セルの寸法が取れない').toBeGreaterThan(10);
		expect(probe.hero, 'プレイヤーの canvas が無い').toBeTruthy();
		const heroPitch = probe.hero.cssW / probe.hero.attr;

		for (const { label } of ART_TILE_KINDS) {
			const t = probe.tiles[label];
			expect(t, `${label} のセルに canvas が無い`).toBeTruthy();
			expect(t.attr, `${label} の絵が 32 ドットでない（${t.attr}）`).toBe(32);
			expect(t.cls, `${label} が 0.7 倍の obj-sprite に戻っている`).not.toContain('obj-sprite');
			expect(t.cls, `${label} にセル全面のクラスが付いていない`).toContain('field-sprite');
			expect(t.cssW, `${label} の canvas がセル全体を覆っていない`).toBeCloseTo(probe.cellPx, 1);
			expect(t.cssW / t.attr, `${label} の1ドットがプレイヤー（${heroPitch}px）と揃っていない`)
				.toBeCloseTo(heroPitch, 5);
			expect(t.cssW / t.attr, `${label} の1ドットが 1px 級＝ピッチが崩れている`).toBeGreaterThan(2);
		}
	});

});
