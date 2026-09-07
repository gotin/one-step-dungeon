// tests/field-art-variants.spec.js — 木・山・茂みをセルごとに違う絵にする／キュー10番 10a-4
//
// 何を守るテストか：
//   ① 同じ絵が木 3113／山 2391／茂み 193 セルに並んでいた（実マップの実測）。
//      ∴ セル座標の決定的なハッシュで**セルごとに違う絵**を選ぶ（10a-1b の地面・
//      10a-2 の家と同じ作法）。名前の付け方は 肌 → 変種＝`mountain@mesa#2` / `tree#3`
//      （`@`＝下地から導く肌・`#`＝セル座標から引く変種）。
//   ② 揺れの同期も一緒に潰す。コマを選ぶのは世界に1つの `animFrame`
//      （`shared/sprites.js` の `startAnimLoop`）∴形を増やしただけでは
//      「林全体が同じ瞬間に同じ向きへざわつく」が残る。変種の半分はコマの順を
//      入れ替えて作る＝同じ瞬間に逆のコマが出る（エンジンには触らない）。
//   ③ 変種を増やすと絵の品質が崩れやすい（枠から出る・穴が空く・1本だけ暗い）。
//      ∴ field-tiles-32.spec.js が基本名に課している条件を**全変種に**課す。
//
// 観測できること（＝テストの当て所）：
//   ・絵の性質  全変種 32×32・影絵 18〜25 ドット・余白・中心±1・1つの塊・穴なし
//   ・均質さ    面積は平均±25%・色の割合は±0.08（1本だけ暗い／極端に小さい木を作らない）
//   ・山        どの変種も輪郭が下へ広がる・行が途切れない・雪／熾火は肌の作り方どおり
//   ・木        どの変種も幹が樹冠の下に見える
//   ・位相      形が同じ2変種はコマの順が逆
//   ・選び方    決定的・画面外の座標でも実在する名前・変種を持たない絵は素の名前
//   ・実エンジン 木の多い画面で複数の変種が敷かれ、**同じ瞬間に別のコマが描かれている**
//               （＝一斉にざわつかない）／エディタと同じ関数を通っている

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { TILE } from '../shared/tiles.js';
import { SPRITES, PAL, CELL_GROUND_N } from '../shared/sprites.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { OBJ_VARIANTS, FIELD_N, MT_SKIN_ART, objVariantName } from '../shared/sprites-tiles.js';
import { MOUNTAIN_SKINS, skinName } from '../shared/tile-skins.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const EDITOR = '/blade-of-lumia/editor/';
const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));

// 揺れる絵（2コマ）と動かない絵（1コマ）で条件が分かれる。
const SWAY = [
	{ base: 'tree', pal: TILE_SPRITE_MAP[TILE.TREE].pal, label: '木' },
	{ base: 'bush', pal: TILE_SPRITE_MAP[TILE.BUSH].pal, label: '茂み' },
];
// 山は肌 5種それぞれに変種を持つ（一覧は手書きせず肌の一覧から導く）。
const STILL = MOUNTAIN_SKINS.map(skin => ({
	base: skinName(TILE_SPRITE_MAP[TILE.MOUNTAIN].spr, skin),
	pal: skinName(TILE_SPRITE_MAP[TILE.MOUNTAIN].pal, skin),
	label: `山(${skin})`, skin,
}));
const ALL = [...SWAY, ...STILL];

const variantNames = (base) =>
	Array.from({ length: OBJ_VARIANTS[base] ?? 0 }, (_, v) => `${base}#${v}`);

function bbox(grid) {
	let r0 = Infinity, r1 = -1, c0 = Infinity, c1 = -1;
	grid.forEach((row, r) => row.forEach((v, c) => {
		if (!v) return;
		r0 = Math.min(r0, r); r1 = Math.max(r1, r);
		c0 = Math.min(c0, c); c1 = Math.max(c1, c);
	}));
	return { r0, r1, c0, c1, h: r1 - r0 + 1, w: c1 - c0 + 1 };
}

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

// 色ごとのドット数と、1コマあたりの面積（透明でないドット数）。
function paint(frames) {
	const h = {};
	let total = 0;
	for (const g of frames) {
		for (const row of g) {
			for (const v of row) { if (!v) continue; h[v] = (h[v] ?? 0) + 1; total++; }
		}
	}
	return { h, total, dots: total / frames.length };
}

test.describe('木・山・茂みの変種 – 絵の性質', () => {

	test('① どの絵にも変種があり、格子とコマ数は基本名と同じ', () => {
		expect(FIELD_N, 'フィールド絵の格子がセル1枚ぶん（32）でない').toBe(CELL_GROUND_N);
		for (const { base, label } of SWAY) {
			expect(OBJ_VARIANTS[base], `${label} に変種が無い`).toBeGreaterThanOrEqual(4);
			// 形 × 位相2種で作る∴必ず偶数（位相の片方だけある＝作り損ない）
			expect(OBJ_VARIANTS[base] % 2, `${label} の変種が奇数＝位相が片方だけ`).toBe(0);
		}
		for (const { base, label } of STILL) {
			expect(OBJ_VARIANTS[base], `${label} に変種が無い`).toBeGreaterThanOrEqual(3);
		}
		for (const { base, label } of ALL) {
			const want = SWAY.some(s => s.base === base) ? 2 : 1;
			for (const name of variantNames(base)) {
				const frames = SPRITES[name];
				expect(frames, `SPRITES['${name}'] が無い`).toBeTruthy();
				expect(frames.length, `${label} ${name} のコマ数`).toBe(want);
				for (const g of frames) {
					expect(g.length, `${name} の行数`).toBe(FIELD_N);
					for (const row of g) expect(row.length, `${name} の列数`).toBe(FIELD_N);
				}
			}
			// 基本名は変種0と同じ絵（TILE_SPRITE_MAP・エディタのパレット見本が指す代表1枚）
			expect(JSON.stringify(SPRITES[base]), `${label} の基本名が変種0と違う絵`)
				.toBe(JSON.stringify(SPRITES[`${base}#0`]));
		}
	});

	test('② どの変種も 18〜25 ドット・余白が残る・横位置は中央', () => {
		// 🔴 変種で枠を外すと「隣のセルへずれた木」「セルを埋める山」が混ざる
		//    ＝見かけの大きさを変えないのが 10a-1c 以来の制約。
		for (const { base, label } of ALL) {
			for (const name of variantNames(base)) {
				SPRITES[name].forEach((g, fi) => {
					const b = bbox(g);
					expect(b.w, `${label} ${name}[${fi}] の横幅（${b.w}）`).toBeGreaterThanOrEqual(18);
					expect(b.w, `${label} ${name}[${fi}] がセルを埋めている（${b.w}）`).toBeLessThanOrEqual(25);
					expect(b.h, `${label} ${name}[${fi}] の高さ（${b.h}）`).toBeGreaterThanOrEqual(14);
					expect(b.h, `${label} ${name}[${fi}] がセルを埋めている（${b.h}）`).toBeLessThanOrEqual(25);
					expect(b.c0, `${label} ${name}[${fi}] が左端に接している`).toBeGreaterThan(0);
					expect(b.c1, `${label} ${name}[${fi}] が右端に接している`).toBeLessThan(FIELD_N - 1);
					expect(b.r1, `${label} ${name}[${fi}] が下端に接している`).toBeLessThan(FIELD_N - 1);
					const mid = (b.c0 + b.c1) / 2;
					expect(Math.abs(mid - (FIELD_N - 1) / 2),
						`${label} ${name}[${fi}] が横にずれている（中心 ${mid}）`).toBeLessThanOrEqual(1);
				});
			}
		}
	});

	test('③ どの変種も1つの塊・穴なし・輪郭に1ドットの欠けが無い', () => {
		for (const { base, label } of ALL) {
			for (const name of variantNames(base)) {
				SPRITES[name].forEach((g, fi) => {
					expect(solidGroups(g), `${label} ${name}[${fi}] の絵が分離している`).toBe(1);
					expect(holes(g), `${label} ${name}[${fi}] に閉じた穴がある`).toBe(0);
					const notches = [];
					for (let r = 1; r < FIELD_N - 1; r++) {
						for (let c = 1; c < FIELD_N - 1; c++) {
							if (g[r][c]) continue;
							if ((g[r][c - 1] && g[r][c + 1]) || (g[r - 1][c] && g[r + 1][c])) notches.push(`${r},${c}`);
						}
					}
					expect(notches, `${label} ${name}[${fi}] の輪郭に1ドットの欠けがある`).toEqual([]);
				});
			}
		}
	});

	test('④ 変種どうしは別の絵で、面積と色の使い方は揃う', () => {
		// 🔴 地面（bgTiles）は色の使用数を**完全に一致**させた＝隣のセルとの密度差が
		//    「地面が市松模様」に見えるから。物（木・山）は透明の余白を挟んで離れて
		//    立つ∴形（大きさ・輪郭）は変えるのが狙いそのもの。守るべきなのは
		//    「1本だけ極端に小さい／1本だけ暗い」が起きないこと∴面積は平均±25%、
		//    色の割合（その絵の中での比率）は平均±0.08 に収める。
		for (const { base, label } of ALL) {
			const names = variantNames(base);
			const shots = new Set(names.map(n => JSON.stringify(SPRITES[n])));
			expect(shots.size, `${label} に同じ絵の変種がある`).toBe(names.length);

			// 🔴 「別の絵」だけでは弱い＝模様が2ドットずれただけでも別の絵になるが、
			//    並べた画面では同じ物が並んで見える（実測：火山の #0/#1 は稜線が
			//    完全に一致して差 13 ドット＝見分けられなかった）。∴差の下限を課す。
			const MIN_DIFF = 20;              // 面積 ≒300 ドットの約7%
			for (let i = 0; i < names.length; i++) {
				for (let j = i + 1; j < names.length; j++) {
					const d = Math.min(...SPRITES[names[i]].map((g, fi) => {
						const other = SPRITES[names[j]][fi].flat();
						return g.flat().reduce((s, v, k) => s + (v !== other[k] ? 1 : 0), 0);
					}));
					expect(d, `${label} ${names[i]} と ${names[j]} の違いが ${d} ドットだけ`
						+ '＝並べても同じ物に見える').toBeGreaterThanOrEqual(MIN_DIFF);
				}
			}

			const stats = names.map(n => ({ n, ...paint(SPRITES[n]) }));
			const meanDots = stats.reduce((s, x) => s + x.dots, 0) / stats.length;
			for (const s of stats) {
				expect(Math.abs(s.dots - meanDots) / meanDots,
					`${label} ${s.n} の面積 ${s.dots} が平均 ${meanDots.toFixed(0)} から離れすぎ`)
					.toBeLessThanOrEqual(0.25);
			}
			for (const col of new Set(stats.flatMap(s => Object.keys(s.h)))) {
				const shares = stats.map(s => (s.h[col] ?? 0) / s.total);
				const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
				shares.forEach((x, i) => {
					expect(Math.abs(x - mean),
						`${label} ${stats[i].n} の色 ${col} の割合 ${x.toFixed(3)}（平均 ${mean.toFixed(3)}）`
						+ '＝1つだけ明るい／暗い絵になっている').toBeLessThanOrEqual(0.08);
				});
			}
		}
	});

	test('⑱ 山の頂は変種ごとに違う＝いちばん目に入る所が同じ絵にならない', () => {
		// 🔴 ユーザー判定（2026-09-07・10a-4b）＝「頂上のところは全部同じになってるけど
		//    そこは変化させないの？」。④の「差 20 ドット以上」は**絵のどこが違ってもよい**
		//    ∴裾だけ違う変種でも通る（火山は火口を守るため頂を削らない例外を入れていた
		//    ＝4変種すべて頂が同一で、並べると同じ山に見えた）。
		//    ∴「頂の帯」＝いちばん高い変種の頂から6行だけを取り出して差を測る。
		const PEAK_ROWS = 6;
		const MIN_PEAK_DIFF = 6;          // 実測の最小は 7（rocky #1/#3）
		for (const { base, label, skin } of STILL) {
			const names = variantNames(base);
			const grids = names.map(n => SPRITES[n][0]);
			const tops = grids.map(g => g.findIndex(row => row.some(Boolean)));
			const r0 = Math.min(...tops);
			for (let i = 0; i < names.length; i++) {
				for (let j = i + 1; j < names.length; j++) {
					let d = 0;
					for (let r = r0; r < r0 + PEAK_ROWS; r++) {
						for (let c = 0; c < FIELD_N; c++) {
							if (!!grids[i][r][c] !== !!grids[j][r][c]) d++;
						}
					}
					expect(d, `${label} ${names[i]} と ${names[j]} の頂の帯の違いが ${d} ドットだけ`
						+ '＝並べると頂が同じ山に見える').toBeGreaterThanOrEqual(MIN_PEAK_DIFF);
				}
			}
			// 削る余地のある肌（行数 > 15）は**背の高さ自体**が2種類以上ある。
			// メサ（15行）は削れない∴幅と縞で違いを出す＝この条件から外す（宣言された例外）。
			if (MT_SKIN_ART[skin].edge.length > 15) {
				expect(new Set(tops).size, `${label} の変種の背の高さが1種類だけ（頂の行 ${tops.join(',')}）`
					+ '＝頂を削らない例外が復活している').toBeGreaterThanOrEqual(2);
			}
		}
	});

	test('⑤ パレットは変種で変えない＝どの変種の色番号もその肌のパレットにある', () => {
		// 名前の2軸のうち色を持つのは肌（`@`）だけ＝変種（`#`）は形と位相しか変えない。
		// ここが崩れると `palette[idx] ?? 'transparent'` で絵に穴が空く。
		for (const { base, pal, label } of ALL) {
			const palette = PAL[pal];
			expect(palette, `パレット ${pal} が無い`).toBeTruthy();
			for (const name of variantNames(base)) {
				for (const g of SPRITES[name]) {
					for (const row of g) {
						for (const idx of row) {
							if (!idx) continue;
							expect(palette[idx], `${label} ${name} が使う色 ${idx} がパレット ${pal} に無い`).toBeTruthy();
						}
					}
				}
			}
		}
	});

	test('⑥ 木はどの変種でも樹冠の下に幹が見える', () => {
		const TRUNK = new Set([5, 6]);       // 幹明・幹暗
		for (const name of variantNames('tree')) {
			SPRITES[name].forEach((g, fi) => {
				const b = bbox(g);
				const lowest = g[b.r1].filter(Boolean);
				expect(lowest.length, `${name}[${fi}] の最下行が空`).toBeGreaterThan(0);
				expect(lowest.every(v => TRUNK.has(v)),
					`${name}[${fi}] の最下行が幹の色でない＝葉が地面に着いている`).toBe(true);
				let lowestLeaf = -1;
				for (let r = 0; r < FIELD_N; r++) if (g[r].some(v => v && !TRUNK.has(v))) lowestLeaf = r;
				expect(b.r1 - lowestLeaf, `${name}[${fi}] の幹が短すぎる＝樹冠に埋もれて木に見えない`)
					.toBeGreaterThanOrEqual(4);
			});
		}
	});

	test('⑦ 山はどの変種でも輪郭が下へ広がり、行が途切れない', () => {
		// 🔴 変種は「削る」方向にしか作れない（幅の最大 25 ドット＝枠の上限）。削った後に
		//    下から上へ丸める処理を落とすと、細い行が挟まって山が「くびれる」。
		for (const { base, label } of STILL) {
			for (const name of variantNames(base)) {
				const g = SPRITES[name][0];
				const b = bbox(g);
				const widths = [];
				for (let r = b.r0; r <= b.r1; r++) {
					const cols = g[r].map((v, c) => (v ? c : -1)).filter(c => c >= 0);
					const w = cols[cols.length - 1] - cols[0] + 1;
					expect(cols.length, `${label} ${name} の行 ${r} が途切れている`).toBe(w);
					widths.push(w);
				}
				for (let i = 1; i < widths.length; i++) {
					expect(widths[i], `${label} ${name} の行 ${b.r0 + i} が上の行より細い＝山に見えない`)
						.toBeGreaterThanOrEqual(widths[i - 1]);
				}
			}
		}
	});

	test('⑧ 山の雪／熾火はどの変種でも肌の作り方どおり', () => {
		// 変種は頂を削る（背を低くする）∴雪線・火口が頂からずれると
		// 「雪が中腹から始まる」「火口が消える」が静かに起きる。
		for (const { base, label, skin } of STILL) {
			const mode = MT_SKIN_ART[skin].snow;
			for (const name of variantNames(base)) {
				const g = SPRITES[name][0];
				const b = bbox(g);
				const mid = b.r0 + (b.r1 - b.r0) / 2;
				const dots = g.flat().filter(Boolean).length;
				const five = g.flat().filter(v => v === 5).length;
				let lowest = -1;
				for (let r = 0; r < FIELD_N; r++) if (g[r].includes(5)) lowest = r;
				if (mode === 'cap') {
					expect(lowest, `${label} ${name} の雪が下半分まで来ている`).toBeLessThan(mid);
				} else if (mode === 'blanket') {
					expect(lowest, `${label} ${name} の雪が上半分で止まっている`).toBeGreaterThan(mid);
					expect((dots - five) / dots, `${label} ${name} が真っ白＝下地の雪原と同化する`)
						.toBeGreaterThanOrEqual(0.2);
					expect(g[b.r1].includes(5), `${label} ${name} の最下行まで雪`).toBe(false);
				} else if (mode === 'none') {
					expect(five, `${label} ${name} に雪／熾火が入っている`).toBe(0);
				} else if (mode === 'ember') {
					expect(five, `${label} ${name} の熾火が消えている`).toBeGreaterThan(3);
					expect(five / dots, `${label} ${name} の熾火が広すぎ`).toBeLessThan(0.05);
					expect(lowest, `${label} ${name} の熾火が中腹まで垂れている`)
						.toBeLessThan(b.r0 + (b.r1 - b.r0) / 3);
					// 🔴 火口＝頂の3行にある最暗色（1）の穴。頂を細める変種を作ると
					//    穴が行の輪郭に丸められ `fdRim` の縁で塗り潰されて消える（実測で
					//    2ドット → 0ドット）。熾火のドット数だけ見ると気づけない
					//    ＝溶岩の筋が残るので総数は変わらない。
					const crater = g.slice(b.r0, b.r0 + 3).flat().filter(v => v === 1).length;
					expect(crater, `${label} ${name} の火口が頂から消えている`).toBeGreaterThanOrEqual(2);
				} else {
					throw new Error(`${label} の雪の作り方 '${mode}' に対する条件が無い`);
				}
				// 雪は列ごとに1本の塊（岩の1ドットが雪に浮かない）
				for (let c = 0; c < FIELD_N; c++) {
					const rows = [];
					for (let r = 0; r < FIELD_N; r++) if (g[r][c] === 5) rows.push(r);
					if (!rows.length) continue;
					expect(rows[rows.length - 1] - rows[0],
						`${label} ${name} 列 ${c} の雪が上下に飛んでいる`).toBe(rows.length - 1);
				}
			}
		}
	});

	test('⑨ 揺れる絵は形が同じ2変種でコマの順が逆＝同じ瞬間に別のコマが出る', () => {
		// 🔴 これが 10a-4 の後半（揺れの同期）の本体。コマを選ぶのは世界に1つの
		//    `animFrame` ∴「絵の中でコマを入れ替えた変種」を隣に置くことでしか
		//    位相はずれない（エンジンを触らずに済ませる方法）。
		for (const { base, label } of SWAY) {
			const n = OBJ_VARIANTS[base];
			for (let s = 0; s < n / 2; s++) {
				const a = SPRITES[`${base}#${s * 2}`];
				const b = SPRITES[`${base}#${s * 2 + 1}`];
				expect(JSON.stringify(a[0]), `${label} 形 ${s} の位相が入れ替わっていない`)
					.toBe(JSON.stringify(b[1]));
				expect(JSON.stringify(a[1]), `${label} 形 ${s} の位相が入れ替わっていない`)
					.toBe(JSON.stringify(b[0]));
			}
		}
	});

});

test.describe('木・山・茂みの変種 – 選び方', () => {

	test('⑩ 同じセルは必ず同じ絵（決定的）・画面外の座標でも実在する名前', () => {
		// エディタの隣接プレビューは r=-0.5 のような座標で描く＝そこで存在しない名前を
		// 返すと絵が消える（連結タイルで踏んだ穴と同じ）。
		for (const { base } of ALL) {
			for (const [r, c] of [[0, 0], [3, 7], [9, 11], [-1, 4], [-0.5, 2.5]]) {
				const name = objVariantName(base, r, c);
				expect(name).toBe(objVariantName(base, r, c));
				expect(SPRITES[name], `${name} が実在しない`).toBeTruthy();
				expect(name, `${base} に変種が付いていない`).toMatch(/#\d+$/);
			}
		}
	});

	test('⑪ 変種を持たない絵は素の名前のまま＝機構が他を壊さない', () => {
		// 看板は揺れも変種も持たない（10a-4 の対象外）。肌を解決していない 'mountain'
		// も素のまま＝肌 → 変種の順序を守らせるための歯。
		expect(OBJ_VARIANTS.sign, '看板に変種を作ってしまっている').toBeUndefined();
		expect(objVariantName('sign', 2, 3)).toBe('sign');
		expect(objVariantName('water', 2, 3)).toBe('water');
		expect(objVariantName('mountain', 2, 3)).toBe('mountain');
	});

	test('⑫ 1画面で全変種が出る・隣が同じ絵になりすぎない・位相が偏らない', () => {
		const rows = 10, cols = 12;
		for (const { base, label } of ALL) {
			const pick = (r, c) => objVariantName(base, r, c);
			const used = new Set();
			let pairs = 0, same = 0, odd = 0, cells = 0;
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const name = pick(r, c);
					used.add(name);
					cells++;
					if (Number(name.split('#')[1]) % 2) odd++;
					if (c + 1 < cols) { pairs++; if (pick(r, c + 1) === name) same++; }
					if (r + 1 < rows) { pairs++; if (pick(r + 1, c) === name) same++; }
				}
			}
			expect(used.size, `${label}：1画面で使われる変種が少なすぎる`).toBe(OBJ_VARIANTS[base]);
			expect(same / pairs, `${label}：隣のセルと同じ絵になりすぎ＝変えた意味がない`).toBeLessThan(0.5);
			if (SWAY.some(s => s.base === base)) {
				// 位相＝変種番号の偶奇。片方に偏ると「ほぼ全部が同じコマ」に戻る。
				expect(odd / cells, `${label}：揺れの位相が偏っている（逆位相 ${odd}/${cells}）`)
					.toBeGreaterThan(0.3);
				expect(odd / cells, `${label}：揺れの位相が偏っている（逆位相 ${odd}/${cells}）`)
					.toBeLessThan(0.7);
			}
		}
	});

});

test.describe('木・山・茂みの変種 – 実エンジンの描画', () => {

	// 実マップから「その物が最も多い画面」を選ぶ（手書きの座標が古くなるのを避ける）。
	const busiest = (tile) => {
		let best = null, bestN = 0;
		for (const [key, sd] of Object.entries(MAP.layers.field.stages)) {
			const n = sd.tiles.reduce((s, row) => s + [...row].filter(ch => ch === tile).length, 0);
			if (n > bestN) { bestN = n; best = key; }
		}
		return { stage: best, count: bestN };
	};

	const openStage = async (page, stage) => {
		const p = new URLSearchParams({ fromEditor: '1', layer: 'field', stage, row: '5', col: '0' });
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);
	};

	const artNames = (page, re) => page.evaluate((src) => {
		const rx = new RegExp(src);
		const out = [];
		document.querySelectorAll('.cell[data-art-sprite]').forEach(cell => {
			if (rx.test(cell.dataset.artSprite)) out.push(cell.dataset.artSprite);
		});
		return out;
	}, re.source);

	test('⑬ 木の多い画面に複数の変種が敷かれている（代表1枚に戻っていない）', async ({ page }) => {
		const { stage, count } = busiest(TILE.TREE);
		expect(count, '木の多い画面が見つからない').toBeGreaterThan(20);
		await openStage(page, stage);
		const names = await artNames(page, /^tree/);
		expect(names.length, `画面 field ${stage} に木が描かれていない`).toBeGreaterThan(20);
		for (const n of names) expect(n, '代表1枚（tree）が敷かれている').toMatch(/^tree#\d+$/);
		expect(new Set(names).size, `画面全体が同じ絵（${[...new Set(names)].join(' ')}）`)
			.toBeGreaterThanOrEqual(4);
	});

	test('⑭ 山の多い画面は「肌 → 変種」の名前で描かれている', async ({ page }) => {
		const { stage, count } = busiest(TILE.MOUNTAIN);
		expect(count, '山の多い画面が見つからない').toBeGreaterThan(20);
		await openStage(page, stage);
		const names = await artNames(page, /^mountain/);
		expect(names.length, `画面 field ${stage} に山が描かれていない`).toBeGreaterThan(20);
		for (const n of names) {
			expect(n, '肌 → 変種の名前になっていない').toMatch(/^mountain@[a-z]+#\d+$/);
		}
		expect(new Set(names).size, `画面全体が同じ山（${[...new Set(names)].join(' ')}）`)
			.toBeGreaterThanOrEqual(3);
	});

	test('⑮ 茂みの多い画面にも変種が敷かれている（木だけ直っていない）', async ({ page }) => {
		const { stage, count } = busiest(TILE.BUSH);
		expect(count, '茂みの多い画面が見つからない').toBeGreaterThan(4);
		await openStage(page, stage);
		const names = await artNames(page, /^bush/);
		expect(names.length, `画面 field ${stage} に茂みが描かれていない`).toBeGreaterThan(4);
		for (const n of names) expect(n, '代表1枚（bush）が敷かれている').toMatch(/^bush#\d+$/);
		expect(new Set(names).size, '茂みが1種類だけ＝変種が効いていない').toBeGreaterThanOrEqual(2);
	});

	test('⑯ 同じ形で位相が逆の木は、同じ瞬間に違う絵が描かれている＝一斉に揺れない', async ({ page }) => {
		// 🔴 ここが「林全体が同時にざわつく」への直接の歯。変種の名前が違うだけでは
		//    足りない（形が同じ・位相が違う2セルの canvas の中身を実際に比べる）。
		const { stage } = busiest(TILE.TREE);
		await openStage(page, stage);
		const probe = await page.evaluate(() => {
			const byVariant = new Map();
			document.querySelectorAll('.cell[data-art-sprite]').forEach(cell => {
				const name = cell.dataset.artSprite;
				if (!name.startsWith('tree#')) return;
				const cv = cell.querySelector('canvas');
				if (!cv) return;
				if (!byVariant.has(name)) byVariant.set(name, cv.toDataURL());
			});
			// 形が同じ（v>>1 が同じ）で位相が違う組を探す
			for (const [nameA, urlA] of byVariant) {
				const v = Number(nameA.split('#')[1]);
				const nameB = `tree#${v ^ 1}`;
				if (!byVariant.has(nameB)) continue;
				return { nameA, nameB, same: urlA === byVariant.get(nameB), n: byVariant.size };
			}
			return { nameA: null, n: byVariant.size };
		});
		expect(probe.nameA, `位相が逆の組が画面に無い（出た変種 ${probe.n} 種）`).toBeTruthy();
		expect(probe.same,
			`${probe.nameA} と ${probe.nameB} が同じ絵で描かれている＝位相がずれていない`).toBe(false);
	});

	test('⑰ エディタのキャンバスでも木が1本ずつ違う（ゲームと食い違わない）', async ({ page }) => {
		// 🔴 橋のデッキ（連結タイル）と山の肌で2度踏んだ食い違い＝エディタが代表1枚を
		//    描き続けると、置いたときの絵とゲームの絵が別物になる。
		//    ∴ 実際にエディタで木を並べ、セルごとの画素が違うことを見る。
		await page.goto(`${EDITOR}`);
		await page.waitForSelector('#world-grid .cell-empty', { state: 'visible' });
		await page.locator('#world-grid .cell-empty').first().click();
		await page.locator('#btn-edit-stage').click();
		await page.waitForSelector('#stage-canvas', { state: 'visible' });

		await page.locator('button.tile-btn[title="木"]').click();
		const box = await page.locator('#stage-canvas').boundingBox();
		const cols = [0, 1, 2, 3, 4, 5, 6, 7];
		for (const c of cols) await page.mouse.click(box.x + c * 40 + 20, box.y + 1 * 40 + 20);

		const shots = await page.evaluate((cs) => {
			const ctx = document.getElementById('stage-canvas').getContext('2d');
			return cs.map(c => ctx.getImageData(c * 40, 40, 40, 40).data.join(','));
		}, cols);
		expect(new Set(shots).size, 'エディタが同じ木を並べている＝ゲームと食い違う')
			.toBeGreaterThanOrEqual(3);
	});

});
