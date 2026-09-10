// tests/ground-variants.spec.js — 地面（bgTiles）のセルごとの変種／キュー10番 10a-1b-2・10a-1b-3
//
// 何を守るテストか：
//   ① 草地の絵は行ごとに色が揃った横縞＝「格子」で、1セルに何枚も敷くとパターンが
//      目に見えた（2026-09-06 ユーザー指摘「草地のノイズ感もパターン化されすぎてて
//      結局違和感は残ってる」）。∴ 株をまばらに散らした絵を複数作り、セル座標の
//      ハッシュでセルごとに選ぶ（決定的＝同じ画面はいつ来ても同じ絵）。
//   ② さらに 10a-1b-3 で「地面もセル1枚ぶんの 32 ドット絵」にした。それまでの機構は
//      8×8 の絵を CSS の background-repeat で敷いていて、`--cell` 108px では
//      108 % 8 !== 0 ∴倍率が 1 に落ちて 1ドット＝1px・しかもセル境界で模様が切れて
//      いた（キャラは 3.375px ∴同じ画面でドットの粗さが揃わない）。
//      いまは 32 ドットの絵を1枚だけセル全体に伸ばす＝1ドットは常に cellPx/32。
//   ③ 2026-09-06 のユーザー判定＝「今はノイズ粒子を入れました、みたいに見える」
//      「粒の色の下地に対するコントラストが強すぎる・ゴミゴミして見える」。∴
//      ・印は 1ドット単位で散らさず 3ドット以上のかたまり（＝素材の模様に見える）
//      ・地の色でないドットは全体の 1/4 まで（地の色が主役）
//      ・地形ごとに専用の形（草の株／小石／吹きだまり／火山岩／泥の筋）＝流用しない
//      （石畳は「完璧・このままでいい」と判定されたので触っていない）
//   ④ さらに 2026-09-06 の2回目の判定＝「火山灰＝いい／泥＝まぁまぁ／草地・砂地＝やっぱり
//      コントラストが強い感じが目立ってしまってる」「草地は本当に草の絵を書くとかでもいいのかも？
//      砂は色変化を抑えればそれでいいのかも」。∴
//      ・許すコントラストの幅は**地形ごとに違う**（草・砂・泥＝抑える／火山灰＝広いまま）
//      ・草地は「粒を目立たせる」のではなく葉の形（3本の葉が立つ株）で草に見せる
//
// 観測できること（＝テストの当て所）：
//   ・絵の性質   6形（草/砂/雪/灰/泥/石畳）すべて 32×32・変種3種以上・色の使用数が同じ
//   ・模様の粒度 印は3ドット以上のかたまり・非地色は 1/4 以下（＝ノイズに見えない）
//   ・石畳       縦の目地が段ごとにずれ（千鳥）、かつ変種に依らない＝セル境界で繋がる
//   ・パレット   変種が使う色番号は6種のパレット全部に定義済み（＝透明の穴が出ない）
//   ・単一の真実 地形→形の対応は TILE_SPRITE_MAP だけ（形を地形間で流用しない）
//   ・選び方     セル座標だけで決まる（決定的）・偏らない・1種に潰れない
//   ・実エンジン セルに敷かれる絵は 32×32 の1枚（repeat しない）＋変種が複数種類

import { test, expect } from '@playwright/test';
import { TILE } from '../shared/tiles.js';
import { SPRITES, PAL, CELL_GROUND_N } from '../shared/sprites.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import {
	GROUND_VARIANTS, GROUND_N, GROUND_MARK_MIN, SCATTER_BLOCK,
	STONE_SIDE, STONE_OFF, bgVariantName,
} from '../shared/sprites-tiles.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const SHAPES = Object.keys(GROUND_VARIANTS);       // grass / sand / snow / ash / mud / stoneFloor
// 石畳だけは「石＋目地」という連続構造＝印を散らす形ではない（⑥で別に守る）。
const SCATTER_SHAPES = SHAPES.filter(n => n !== 'stoneFloor');

// 色ごとのドット数（ヒストグラム）。密度が違うと隣のセルとの明暗差が出る。
function hist(grid) {
	const h = {};
	for (const row of grid) for (const v of row) h[v] = (h[v] ?? 0) + 1;
	return h;
}

// 地の色（2）でないドットのかたまり（4近傍・上下左右は輪＝トーラス）を列挙する。
function marks(grid) {
	const n = grid.length;
	const seen = Array.from({ length: n }, () => Array(n).fill(false));
	const wrap = (x) => ((x % n) + n) % n;
	const out = [];
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			if (seen[r][c] || grid[r][c] === 2) continue;
			const stack = [[r, c]];
			seen[r][c] = true;
			const cells = [];
			while (stack.length) {
				const [cr, cc] = stack.pop();
				cells.push([cr, cc]);
				for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					const nr = wrap(cr + dr), nc = wrap(cc + dc);
					if (seen[nr][nc] || grid[nr][nc] === 2) continue;
					seen[nr][nc] = true;
					stack.push([nr, nc]);
				}
			}
			out.push(cells);
		}
	}
	return out;
}

test.describe('地面の変種 – 絵の性質', () => {

	test('① 6形すべてが 32×32＝キャラ・橋と同じドット密度', () => {
		expect(GROUND_N, '地面の格子がセル1枚ぶん（32）でない').toBe(CELL_GROUND_N);
		expect(SHAPES.length, '地面の形が減っている').toBeGreaterThanOrEqual(6);
		for (const name of SHAPES) {
			for (let v = 0; v < GROUND_VARIANTS[name]; v++) {
				const frames = SPRITES[`${name}@${v}`];
				expect(frames, `SPRITES['${name}@${v}'] が無い`).toBeTruthy();
				// 下地は1コマだけ描く（applyBgSpriteToCell は animFrame でコマを選ぶ∴
				// 2コマ以上あると「盤面を作り直すたび絵が変わる」＝決定的でなくなる）
				expect(frames.length, `${name}@${v} が複数コマ`).toBe(1);
				expect(frames[0].length, `${name}@${v} の行数`).toBe(GROUND_N);
				for (const row of frames[0]) {
					expect(row.length, `${name}@${v} の列数`).toBe(GROUND_N);
				}
			}
		}
	});

	test('② 変種は3種以上あり、どれも色の使用数が同じ＝セルごとに明るさが変わらない', () => {
		// 密度が違うと「地面が市松模様」に見える＝周期を消すつもりで別の模様を作ってしまう。
		for (const name of SHAPES) {
			const n = GROUND_VARIANTS[name];
			expect(n, `${name} の変種が少なすぎる（セルごとに変えられない）`).toBeGreaterThanOrEqual(3);
			const ref = JSON.stringify(hist(SPRITES[`${name}@0`][0]));
			for (let v = 1; v < n; v++) {
				expect(JSON.stringify(hist(SPRITES[`${name}@${v}`][0])),
					`${name}@${v} の色の使用数が ${name}@0 と違う`).toBe(ref);
			}
		}
	});

	test('③ 変種どうしは別の絵（同じ絵を名前だけ変えていない）', () => {
		for (const name of SHAPES) {
			const seen = new Set();
			for (let v = 0; v < GROUND_VARIANTS[name]; v++) {
				seen.add(JSON.stringify(SPRITES[`${name}@${v}`][0]));
			}
			expect(seen.size, `${name} に同じ絵の変種がある`).toBe(GROUND_VARIANTS[name]);
		}
	});

	test('④ 印どうしは融合していない＝ブロックごとに決まった数だけ立っている', () => {
		// 印が隣接して繋がると、そこだけ大きな塊になって「地面に模様が浮く」＝
		// セルを並べたときに大きな周期として見える。`scatter` の margin（隣接禁止）が
		// 効いている限り、連結成分の数は「ブロック数 × 置く種類の数」で決まる。
		const blocks = (GROUND_N / SCATTER_BLOCK) ** 2;
		const STEPS = 2;             // どの地形も「主役の印＋崩しの印」の2種（設計上の定数）
		for (const name of SCATTER_SHAPES) {
			for (let v = 0; v < GROUND_VARIANTS[name]; v++) {
				expect(marks(SPRITES[`${name}@${v}`][0]).length,
					`${name}@${v} の印の数が ${blocks}×${STEPS} でない＝印が隣り合って繋がっている`)
					.toBe(blocks * STEPS);
			}
		}
	});

	test('⑤ 印の色は地の色から離れすぎない（地形ごとの上限）＝かつ見える幅はある', () => {
		// 🔴 2026-09-06（2回目の判定）＝「火山灰＝いい／泥＝まぁまぁ／草地・砂地＝やっぱり
		//    コントラストが強い感じが目立ってしまってる」。∴地形ごとに上限が違う：
		//    ・草・砂・泥＝抑える（±18 まで）／・雪も同じく抑える（同日の追加指定＝
		//      「雪も砂地と同じようにコントラスト抑えた方がよさそう」）
		//    ・火山灰＝岩が浮くのが正しい（「いい」）∴広いまま
		//    下限（5）も要る＝寄せすぎると 10a-1b-3 の「うっすら粒が散っている」に戻る。
		const CONTRAST_MAX = { grass: 18, sand: 18, snow: 18, mud: 18, ash: 60 };
		const Y = (hex) => {
			const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
			return 0.299 * r + 0.587 * g + 0.114 * b;   // 目に見える明るさ
		};
		const groundTiles = [TILE.GRASS, TILE.SAND, TILE.SNOW, TILE.ASH, TILE.MUD];
		for (const t of groundTiles) {
			const { spr, pal } = TILE_SPRITE_MAP[t];
			const palette = PAL[pal];
			const base = Y(palette[2]);
			const max = CONTRAST_MAX[spr];
			expect(max, `${spr} の上限が表に無い`).toBeTruthy();
			const used = new Set();
			for (let v = 0; v < GROUND_VARIANTS[spr]; v++) {
				for (const row of SPRITES[`${spr}@${v}`][0]) for (const idx of row) used.add(idx);
			}
			used.delete(2);
			expect(used.size, `${spr} が模様の色を使っていない`).toBeGreaterThan(0);
			let widest = 0;
			for (const idx of used) {
				const d = Math.abs(Y(palette[idx]) - base);
				widest = Math.max(widest, d);
				expect(d, `${spr} の色 ${idx}（${palette[idx]}）が地の色から離れすぎ＝ゴミゴミ見える`)
					.toBeLessThanOrEqual(max);
			}
			expect(widest, `${spr} の模様が地の色に寄りすぎ＝うっすら粒が散っているだけに見える`)
				.toBeGreaterThanOrEqual(5);
		}
	});

	test('⑥ 石畳の縦目地は段ごとにずれ、かつ変種に依らない＝セル境界で石が切れない', () => {
		const jointCols = (grid, band) => {
			const row = grid[band * STONE_SIDE + 1];       // 段の中ほど（面取りの行を避ける）
			const cols = [];
			row.forEach((v, c) => { if (v === 6) cols.push(c); });
			return cols;
		};
		const bands = GROUND_N / STONE_SIDE;
		const ref = [];
		for (let v = 0; v < GROUND_VARIANTS.stoneFloor; v++) {
			const g = SPRITES[`stoneFloor@${v}`][0];
			for (let band = 0; band < bands; band++) {
				const cols = jointCols(g, band);
				// 目地は石の一辺ごとに1本＝等間隔。端も 8 で繋がる（32 は 8 の倍数）∴
				// 右隣のセルと目地が続き、境界に欠けた石が出ない。
				expect(cols.length, `stoneFloor@${v} 段${band} の目地の本数`).toBe(GROUND_N / STONE_SIDE);
				for (let i = 1; i < cols.length; i++) {
					expect(cols[i] - cols[i - 1], `stoneFloor@${v} 段${band} の目地の間隔`).toBe(STONE_SIDE);
				}
				expect(cols[0] + GROUND_N - cols[cols.length - 1],
					`stoneFloor@${v} 段${band} の目地がセル境界で繋がらない`).toBe(STONE_SIDE);
				// 段ごとの横ずれ＝上下の段と目地が揃わない（千鳥）
				if (band > 0) {
					expect(cols[0], `stoneFloor@${v} 段${band} が上の段と同じ位置＝畑のうね`)
						.not.toBe(jointCols(g, band - 1)[0]);
				}
				// 変種で横ずれを変えない（変えるとセル境界で目地がずれる）
				if (v === 0) ref[band] = cols.join(',');
				else expect(cols.join(','), `stoneFloor@${v} 段${band} の目地位置が変種で違う`).toBe(ref[band]);
			}
			expect(new Set(STONE_OFF).size, '段の横ずれが1種類＝千鳥にならない').toBeGreaterThan(1);
		}
	});

	test('⑦ 変種が使う色番号は地面パレット全種に定義済み＝透明の穴が出ない', () => {
		// 形とパレットは1対1になった（2026-09-06）が、色番号 1〜8 の意味は6種で共通∴
		// 形を作り替えるとき片方のパレットにしか色を足さないと、もう片方で
		// `palette[idx] ?? 'transparent'` が透けて地面に穴が空く。
		const groundTiles = [TILE.GRASS, TILE.SAND, TILE.SNOW, TILE.ASH, TILE.MUD, TILE.STONE_FLOOR];
		for (const t of groundTiles) {
			const { spr, pal } = TILE_SPRITE_MAP[t];
			expect(GROUND_VARIANTS[spr], `タイル ${t} の形 ${spr} に変種が無い`).toBeGreaterThan(0);
			const palette = PAL[pal];
			expect(palette, `パレット ${pal} が無い`).toBeTruthy();
			for (let v = 0; v < GROUND_VARIANTS[spr]; v++) {
				for (const row of SPRITES[`${spr}@${v}`][0]) {
					for (const idx of row) {
						if (idx === 0) continue;
						expect(palette[idx], `${spr}@${v} が使う色 ${idx} がパレット ${pal} に無い`).toBeTruthy();
					}
				}
			}
		}
	});

	test('⑧ 印は3ドット以上のかたまり＝1ドットの粒を散らしたノイズでない', () => {
		// 🔴 1ドット＝3.375px の四角が地の上にぽつんと乗ると、素材の模様ではなく
		//    「ノイズ粒子を入れました」に見える（2026-09-06 ユーザー判定）。
		for (const name of SCATTER_SHAPES) {
			for (let v = 0; v < GROUND_VARIANTS[name]; v++) {
				const grid = SPRITES[`${name}@${v}`][0];
				const found = marks(grid);
				expect(found.length, `${name}@${v} に印が無い`).toBeGreaterThan(0);
				const smallest = Math.min(...found.map(m => m.length));
				expect(smallest, `${name}@${v} に ${GROUND_MARK_MIN} ドット未満の孤立した粒がある`)
					.toBeGreaterThanOrEqual(GROUND_MARK_MIN);
			}
		}
	});

	test('⑨ 地の色でないドットは 1/4 まで＝地の色が主役（ゴミゴミしない）', () => {
		for (const name of SCATTER_SHAPES) {
			for (let v = 0; v < GROUND_VARIANTS[name]; v++) {
				const grid = SPRITES[`${name}@${v}`][0];
				const total = GROUND_N * GROUND_N;
				const marked = grid.flat().filter(x => x !== 2).length;
				expect(marked / total, `${name}@${v} は印が多すぎる＝下地が見えない`).toBeLessThanOrEqual(0.25);
				expect(marked, `${name}@${v} に模様が無い＝ただの単色`).toBeGreaterThan(0);
			}
		}
	});

	test('⑩ 地形ごとに専用の形＝別の地形の形を流用していない', () => {
		// 砂の形を灰に、草の形を泥に流用していた（パレットだけ違う）＝素材が違うのに
		// 同じ模様だった。2026-09-06 に灰＝火山岩・泥＝ドロドロの筋へ作り分けた。
		const pairs = [
			[TILE.GRASS, 'grass'], [TILE.SAND, 'sand'], [TILE.SNOW, 'snow'],
			[TILE.ASH, 'ash'], [TILE.MUD, 'mud'], [TILE.STONE_FLOOR, 'stoneFloor'],
		];
		const seen = new Set();
		for (const [tile, spr] of pairs) {
			expect(TILE_SPRITE_MAP[tile].spr, `タイル ${tile} の形が ${spr} でない`).toBe(spr);
			const shot = JSON.stringify(SPRITES[`${spr}@0`][0]);
			expect(seen.has(shot), `${spr} が他の地形と同じ絵`).toBe(false);
			seen.add(shot);
			expect(bgVariantName(spr, 1, 1), `${spr} に変種が無い`).toMatch(new RegExp(`^${spr}@\\d+$`));
		}
	});

});

test.describe('地面の変種 – 選び方', () => {

	test('⑪ 同じセルは必ず同じ変種（決定的＝乱数を使っていない）', () => {
		for (const name of SHAPES) {
			for (const [r, c] of [[0, 0], [3, 7], [9, 11], [-1, 4]]) {
				expect(bgVariantName(name, r, c)).toBe(bgVariantName(name, r, c));
			}
		}
	});

	test('⑫ 変種を持たないスプライトはそのままの名前（機構が他を壊さない）', () => {
		// 水（12×16・波でアニメーション）は変種を持たない＝この機構の外側にいる。
		expect(GROUND_VARIANTS.water, '水に変種を作ってしまっている').toBeUndefined();
		expect(bgVariantName('water', 2, 3)).toBe('water');
		expect(SPRITES[bgVariantName('grass', 2, 3)], '選ばれた変種が実在しない').toBeTruthy();
	});

	test('⑬ 1画面（12×10）でどの変種も使われ、隣が同じ絵になる割合が半分未満', () => {
		const rows = 10, cols = 12;
		for (const name of SHAPES) {
			const pick = (r, c) => bgVariantName(name, r, c);
			const used = new Set();
			let pairs = 0, same = 0;
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					used.add(pick(r, c));
					if (c + 1 < cols) { pairs++; if (pick(r, c) === pick(r, c + 1)) same++; }
					if (r + 1 < rows) { pairs++; if (pick(r, c) === pick(r + 1, c)) same++; }
				}
			}
			expect(used.size, `${name}：1画面で使われる変種が少なすぎる`).toBe(GROUND_VARIANTS[name]);
			expect(same / pairs, `${name}：隣のセルと同じ絵になりすぎ＝変えた意味がない`).toBeLessThan(0.5);
		}
	});

});

test.describe('地面の変種 – 実エンジンの描画', () => {

	test('⑭ ゲームの草セルは複数の変種を敷いている（代表1枚に戻っていない）', async ({ page }) => {
		// 草の多い画面（村のある field/6,6）で見る。
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: '6,6', row: '5', col: '5',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);

		const probe = await page.evaluate(() => {
			const names = [];
			document.querySelectorAll('.cell[data-bg-sprite]').forEach(cell => {
				if (cell.dataset.bgSprite.startsWith('grass')) names.push(cell.dataset.bgSprite);
			});
			return names;
		});
		expect(probe.length, '草の下地セルが無い画面を見ている').toBeGreaterThan(20);
		// 名前は `grass@2`、隣に強い地形があるセルは `grass@2~n=water~3,4`（継ぎ目＝10b）。
		// ここで見たいのは変種の割り振り∴継ぎ目の部分を落として数える。
		const bases = probe.map(n => n.split('~')[0]);
		for (const n of bases) expect(n, '代表1枚（grass）が敷かれている').toMatch(/^grass@\d+$/);
		expect(new Set(bases).size, `画面全体が同じ絵（${[...new Set(bases)].join(' ')}）`)
			.toBeGreaterThanOrEqual(3);
	});

	test('⑮ 地面はセル1枚に 32 ドットの絵を1枚だけ敷く＝1ドットが cellPx/32', async ({ page }) => {
		// 旧機構（CSS repeat）だと 108 % 8 !== 0 ∴倍率 1 に落ちて 1ドット＝1px、
		// さらにセル境界で模様が切れていた。ここが崩れると同じ画面でドットの
		// 粗さが揃わない（キャラ・橋は 3.375px）。
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: '12,17', row: '5', col: '5',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);

		const probe = await page.evaluate(async () => {
			const pick = (pred) => [...document.querySelectorAll('.cell[data-bg-sprite]')]
				.find(c => pred(c.dataset.bgSprite));
			const read = async (cell) => {
				if (!cell) return null;
				const st = getComputedStyle(cell);
				const url = st.backgroundImage.slice(5, -2);          // url("…") の中身
				const img = new Image();
				await new Promise(res => { img.onload = res; img.src = url; });
				return {
					repeat: st.backgroundRepeat,
					size: st.backgroundSize,
					dots: img.naturalWidth,
					cellPx: cell.getBoundingClientRect().width,
				};
			};
			return {
				ground: await read(pick(n => n.startsWith('stoneFloor'))),
				water:  await read(pick(n => n === 'water')),
			};
		});

		const g = probe.ground;
		expect(g, '石畳の下地セルが無い画面を見ている').toBeTruthy();
		expect(g.repeat, '地面を repeat で敷いている＝セル境界で模様が切れる').toBe('no-repeat');
		expect(g.size, '地面がセル全体に伸びていない').toBe('100% 100%');
		expect(g.dots, '地面の絵が 32 ドットでない').toBe(32);
		expect(g.cellPx / g.dots, '1ドットがキャラ・橋（cellPx/32）と揃っていない')
			.toBeCloseTo(g.cellPx / 32, 5);
		expect(g.cellPx / g.dots, '1ドットが 1px 級＝旧機構に戻っている').toBeGreaterThan(2);

		// 水は 12×16・波でアニメーションする∴従来どおり repeat（機構の外側）。
		expect(probe.water, '水のセルが無い画面を見ている').toBeTruthy();
		expect(probe.water.repeat, '水まで no-repeat にしている').toBe('repeat');
	});

	test('⑯ 火山灰・泥の画面には専用の形が敷かれている（砂・草の流用に戻っていない）', async ({ page }) => {
		// 対応表を書き写した場所が3か所あり（ゲーム／エディタ／共通表）、書き写しは
		// 実際にズレていた（雪が草の形のまま）∴実エンジンで見て裏を取る。
		for (const [stage, want] of [['12,2', 'ash'], ['9,15', 'mud']]) {
			const p = new URLSearchParams({
				fromEditor: '1', layer: 'field', stage, row: '5', col: '5',
			});
			await page.goto(`${GAME}?${p.toString()}`);
			await waitForBoard(page);
			const names = await page.evaluate(() => {
				const s = new Set();
				document.querySelectorAll('.cell[data-bg-sprite]').forEach(c => s.add(c.dataset.bgSprite));
				return [...s];
			});
			const own = names.filter(n => n.startsWith(`${want}@`));
			expect(own.length, `${stage} に ${want} の下地が無い（敷かれているのは ${names.join(' ')}）`)
				.toBeGreaterThan(0);
			expect(new Set(own).size, `${stage} の ${want} が1種類だけ＝変種が効いていない`)
				.toBeGreaterThanOrEqual(3);
		}
	});

});
