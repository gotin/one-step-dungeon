// tests/ground-seams.spec.js — 地形の継ぎ目（bgTiles の境界）／キュー10番 10b
//
// 何を守るテストか：
//   見える地面（`bgTiles`）が切り替わる辺が、セルの縁でまっすぐ切れていた（実測 4536 辺／
//   19 ペア＋tiles 層の水・溶岩を数えると 22 ペア。うち水・溶岩がらみが 4 分の 3）。
//   ∴自分のセルの 32 ドット絵の中に隣の地面の色を食い込ませる（`shared/ground-seams.js`）。
//   マップデータは動かさない＝接続指標（seams/traps/W1/W2）に影響しない。
//
// 観測できること（＝テストの当て所）：
//   ・優先順位   どちらのセルが塗るかは全順序で決まる（両側が塗ると境界が2重にずれる）
//   ・色         隣の地面の色番号（9〜16）が地面6種のパレット全部にある＝透明の穴が出ない
//   ・発火条件   隣が同じ地形／画面外／地面が隠れるタイルなら継ぎ目を作らない
//   ・食い込み   指定した辺だけ・深さは 1〜SEAM_DEPTH_MAX・辺の全長に1ドット以上
//   ・連続性     同じ境界線に並ぶセルは輪郭が続く（同じ絵のコピーでもない）
//   ・実エンジン 継ぎ目セルが実際に立つ／絵は 32 ドット1枚のまま／水は継ぎ目機構に
//              巻き込まれず名前が変わらない（10j で水自身も 32 ドット no-repeat に
//              なったので「repeat のまま」では見分けられない＝名前で見分ける）

import { test, expect } from '@playwright/test';
import { TILE } from '../shared/tiles.js';
import { SPRITES, PAL, CELL_GROUND_N } from '../shared/sprites.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { GROUND_VARIANTS, GROUND_N, SEAM_TONE_IDX, bgVariantName } from '../shared/sprites-tiles.js';
import { SEAM_PRIORITY, SEAM_DEPTH_MAX, groundSpriteName, visibleGroundSprite } from '../shared/ground-seams.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

// bgTiles だけを持つ小さなステージ（tiles 層は床＝地面を隠さない）。
// rows は bgTile の文字（'g' 草／'d' 砂／'~' 水／'l' 溶岩／'o' 石畳／'s' 雪／'c' 灰／'w' 泥）。
function stage(rows, tilesRows = null) {
	const bgTiles = {};
	rows.forEach((row, r) => [...row].forEach((ch, c) => { bgTiles[`${r},${c}`] = ch; }));
	return {
		tiles: (tilesRows ?? rows.map(row => TILE.FLOOR.repeat(row.length))).map(r => [...r]),
		bgTiles,
	};
}

// 継ぎ目の絵と素の絵を比べて「辺からの食い込みの深さ」を列ごとに測る。
function depthProfile(name, base, dir) {
	const g = SPRITES[name][0], b = SPRITES[base][0], N = GROUND_N;
	const at = (grid, i, k) => (
		dir === 'n' ? grid[k][i] : dir === 's' ? grid[N - 1 - k][i]
			: dir === 'w' ? grid[i][k] : grid[i][N - 1 - k]);
	const out = [];
	for (let i = 0; i < N; i++) {
		let d = 0;
		while (d < N && at(g, i, d) !== at(b, i, d)) d++;
		out.push(d);
	}
	return out;
}

test.describe('地形の継ぎ目 – 決め事', () => {

	test('① 優先順位は全順序＝どちらのセルが塗るか必ず一意に決まる', () => {
		// 両側が塗ると境界が2重にずれて濁る∴「強い方が弱い方へ食い込む」を一意に決める。
		const names = Object.keys(SEAM_PRIORITY);
		for (const g of Object.keys(GROUND_VARIANTS)) {
			expect(names, `地面 ${g} が優先順位表に無い＝継ぎ目が作られない`).toContain(g);
		}
		expect(names, '水が優先順位表に無い').toContain('water');
		expect(names, '溶岩が優先順位表に無い').toContain('lava');
		const vals = Object.values(SEAM_PRIORITY);
		expect(new Set(vals).size, '優先順位に同じ値がある＝どちらが塗るか決まらない').toBe(vals.length);
		// 水・溶岩は必ず陸へ食い込む側（水/溶岩の絵はアニメーションする∴触れない）
		for (const g of Object.keys(GROUND_VARIANTS)) {
			expect(SEAM_PRIORITY.water, `水が ${g} より弱い＝渚が水側に描かれる（描けない）`)
				.toBeGreaterThan(SEAM_PRIORITY[g]);
			expect(SEAM_PRIORITY.lava, `溶岩が ${g} より弱い`).toBeGreaterThan(SEAM_PRIORITY[g]);
		}
	});

	test('② 隣の地面の色は地面6種のパレット全部に定義済み＝透明の穴が出ない', () => {
		const groundTiles = [TILE.GRASS, TILE.SAND, TILE.SNOW, TILE.ASH, TILE.MUD, TILE.STONE_FLOOR];
		for (const t of groundTiles) {
			const { pal } = TILE_SPRITE_MAP[t];
			for (const [u, idx] of Object.entries(SEAM_TONE_IDX)) {
				expect(PAL[pal][idx], `パレット ${pal} に ${u} の継ぎ目色（${idx}）が無い`).toBeTruthy();
			}
			// 1〜8（既存の絵が使う番号）を継ぎ目色で潰していない
			for (let i = 1; i <= 8; i++) expect(PAL[pal][i], `パレット ${pal} の ${i} が消えた`).toBeTruthy();
		}
		// 溶岩は水と別の色＝火山の縁が青くならない
		const ashPal = PAL[TILE_SPRITE_MAP[TILE.ASH].pal];
		expect(ashPal[SEAM_TONE_IDX.lava], '溶岩の継ぎ目色が水と同じ')
			.not.toBe(ashPal[SEAM_TONE_IDX.water]);
	});

	test('③ 隣が同じ地形／画面外／地面が隠れるタイルなら継ぎ目を作らない', () => {
		const all = stage(['ggg', 'ggg', 'ggg']);
		expect(groundSpriteName(all, 'grass', 1, 1), '理由なく継ぎ目が立った')
			.toBe(bgVariantName('grass', 1, 1));
		// 画面の角＝外側2辺は隣が居ない
		expect(groundSpriteName(all, 'grass', 0, 0)).toBe(bgVariantName('grass', 0, 0));
		// 壁・空・穴は地面を隠す（render-board は下地を敷かない）∴継ぎ目の相手にしない
		const hidden = stage(['ggg', 'g~g', 'ggg'], ['ggg', 'g#g', 'ggg']);
		expect(visibleGroundSprite(hidden, 1, 1), '壁の下の水を継ぎ目の相手にしている').toBeNull();
		expect(groundSpriteName(hidden, 'grass', 1, 0), '壁に向かって渚を描いた')
			.toBe(bgVariantName('grass', 1, 0));
	});

	test('④ 塗るのは弱い側だけ＝強い側の絵は継ぎ目でも変わらない', () => {
		const sd = stage(['ggg', 'g~g', 'ggg']);
		// (0,1) の南が水＝水（強い）に接する草（弱い）に継ぎ目が立つ
		const grass = groundSpriteName(sd, 'grass', 0, 1);
		expect(grass, '水に接する草に継ぎ目が無い').toContain('~s=');
		expect(grass).toContain('water');
		// 砂↔石畳＝石畳が強い∴砂だけが塗る（「石畳は完璧」＝2026-09-06 ユーザー判定）
		const paved = stage(['ddd', 'ooo', 'ddd']);
		expect(groundSpriteName(paved, 'stoneFloor', 1, 1), '石畳の絵が継ぎ目で変わった')
			.toBe(bgVariantName('stoneFloor', 1, 1));
		expect(groundSpriteName(paved, 'sand', 0, 1), '砂が石畳の縁を受けていない').toContain('stoneFloor');
	});

	test('⑤ 食い込みは指定した辺だけ・深さ 1〜SEAM_DEPTH_MAX・辺の全長に届く', () => {
		const sd = stage(['ggg', 'g~g', 'ggg']);        // (0,1) の南だけが水
		const name = groundSpriteName(sd, 'grass', 0, 1);
		const base = bgVariantName('grass', 0, 1);
		expect(SPRITES[name], '継ぎ目の絵が登録されていない').toBeTruthy();
		expect(SPRITES[name].length, '継ぎ目の絵が複数コマ（下地は1コマ）').toBe(1);
		expect(SPRITES[name][0].length, '継ぎ目の絵の行数').toBe(CELL_GROUND_N);
		for (const row of SPRITES[name][0]) expect(row.length, '継ぎ目の絵の列数').toBe(CELL_GROUND_N);

		const south = depthProfile(name, base, 's');
		expect(Math.min(...south), '渚が途切れている列がある').toBeGreaterThanOrEqual(1);
		expect(Math.max(...south), `食い込みが ${SEAM_DEPTH_MAX} ドットを超えた＝歩けるセルが水没して見える`)
			.toBeLessThanOrEqual(SEAM_DEPTH_MAX);
		// 反対側（北）は隣が草＝1ドットも塗らない
		expect(Math.max(...depthProfile(name, base, 'n')), '隣が同じ地形の辺まで塗っている').toBe(0);
		// 塗った色は水の継ぎ目色だけ（他の地形の色を混ぜていない）
		const changed = new Set();
		SPRITES[name][0].forEach((row, r) => row.forEach((v, c) => {
			if (v !== SPRITES[base][0][r][c]) changed.add(v);
		}));
		expect([...changed], '継ぎ目に水以外の色が混ざった').toEqual([SEAM_TONE_IDX.water]);
	});

	test('⑥ 同じ境界線に並ぶセルは輪郭が続く（1枚の絵のコピーでない・段差は内側と同じ上限）', () => {
		// 種は「境界の線」ごと＝海岸に沿ったセルが同じ輪郭関数を共有する。セルごとに
		// 種を変えると 32 ドットおきに同じ形が並ぶ／輪郭が仕切り直される。
		const sd = stage(['gggg', '~~~~'], ['gggg', '....']);
		const a = depthProfile(groundSpriteName(sd, 'grass', 0, 1), bgVariantName('grass', 0, 1), 's');
		const b = depthProfile(groundSpriteName(sd, 'grass', 0, 2), bgVariantName('grass', 0, 2), 's');
		expect(a.join(','), '隣のセルが同じ輪郭のコピー＝32 ドットごとに同じ形が並ぶ').not.toBe(b.join(','));
		const jumps = (p) => p.slice(1).map((d, i) => Math.abs(d - p[i]));
		const inner = Math.max(...jumps(a), ...jumps(b));
		expect(Math.abs(b[0] - a[a.length - 1]),
			'セルの境界での段差が内側の段差より大きい＝そこで輪郭が仕切り直されている')
			.toBeLessThanOrEqual(inner);
	});

	test('⑦ 斜めだけが強いときは角に食い込みを足す（岬の角が欠けない）', () => {
		// (1,1) の北東だけが水（北と東は草）＝辺の食い込みでは埋まらない角。
		const sd = stage(['gg~', 'ggg', 'ggg']);
		const name = groundSpriteName(sd, 'grass', 1, 1);
		expect(name, '斜めの水に角の食い込みが無い').toContain('ne=water');
		const g = SPRITES[name][0], b = SPRITES[bgVariantName('grass', 1, 1)][0];
		let changed = 0;
		g.forEach((row, r) => row.forEach((v, c) => { if (v !== b[r][c]) changed++; }));
		expect(changed, '角の印が3ドット未満＝ノイズに見える').toBeGreaterThanOrEqual(3);
		expect(changed, '角の印が大きすぎる').toBeLessThanOrEqual(4);
		// 角の印は北東の隅に居る
		expect(g[0][GROUND_N - 1], '北東の隅が塗られていない').toBe(SEAM_TONE_IDX.water);
	});

	test('⑧ 溶岩の縁は溶岩の色（水と同じ青にしない）', () => {
		const sd = stage(['ccc', 'clc', 'ccc']);
		const name = groundSpriteName(sd, 'ash', 0, 1);
		expect(name, '溶岩に接する灰に継ぎ目が無い').toContain('lava');
		const g = SPRITES[name][0], b = SPRITES[bgVariantName('ash', 0, 1)][0];
		const changed = new Set();
		g.forEach((row, r) => row.forEach((v, c) => { if (v !== b[r][c]) changed.add(v); }));
		expect([...changed], '火山の縁が水の色で塗られた').toEqual([SEAM_TONE_IDX.lava]);
	});

});

test.describe('地形の継ぎ目 – 実エンジンの描画', () => {

	test('⑨ 草↔水の画面（field 9,19）で渚が立ち、絵は 32 ドット1枚のまま', async ({ page }) => {
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: '9,19', row: '9', col: '5',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);

		const probe = await page.evaluate(async () => {
			const cells = [...document.querySelectorAll('.cell[data-bg-sprite]')];
			const names = cells.map(c => c.dataset.bgSprite);
			const seamCell = cells.find(c => c.dataset.bgSprite.includes('~'));
			const waterCell = cells.find(c => c.dataset.bgSprite === 'water');
			const read = async (cell) => {
				if (!cell) return null;
				const st = getComputedStyle(cell);
				const img = new Image();
				await new Promise(res => { img.onload = res; img.src = st.backgroundImage.slice(5, -2); });
				return {
					repeat: st.backgroundRepeat, size: st.backgroundSize,
					dots: img.naturalWidth, dotsH: img.naturalHeight,
				};
			};
			return {
				names,
				seam: await read(seamCell),
				seamName: seamCell?.dataset.bgSprite ?? null,
				water: await read(waterCell),
				waterName: waterCell?.dataset.bgSprite ?? null,
			};
		});

		const seams = probe.names.filter(n => n.includes('~'));
		expect(seams.length, '渚のセルが1枚も立っていない').toBeGreaterThan(10);
		expect(seams.every(n => n.startsWith('grass@') || n.startsWith('sand@') || n.startsWith('mud@')),
			`陸でないセルに継ぎ目が立った（${seams.join(' ')}）`).toBe(true);
		expect(probe.seamName, '継ぎ目の相手が名前に残っていない').toContain('water');
		expect(probe.seam.dots, '継ぎ目の絵が 32 ドットでない').toBe(32);
		expect(probe.seam.repeat, '継ぎ目の絵を repeat で敷いている').toBe('no-repeat');
		expect(probe.seam.size, '継ぎ目の絵がセル全体に伸びていない').toBe('100% 100%');
		// 水は波でアニメーションする＝この機構の外側（壊していない）。10j で水自身も
		// 32 ドット no-repeat になった＝「repeat のまま」では見分けられない∴名前で見る
		// （継ぎ目に巻き込まれると `water~...` のような合成名になり animFrame の巡回対象
		// （`ANIMATED_BG_SPRITES` は 'water' 単独名しか見ない）から外れて波が止まる）。
		expect(probe.water, '水のセルが無い画面を見ている').toBeTruthy();
		expect(probe.waterName, '水まで継ぎ目機構に巻き込んだ＝波が止まる').toBe('water');
		expect(probe.water.repeat, '水セルの絵が no-repeat でない').toBe('no-repeat');
		// 縦横とも 32 ドット（正方形）であること＝キュー10番 10j の歯。旧 12×16 は縦横が
		// 違う長方形で、CSS repeat の倍率探索が横幅（dotCols）しか見ていなかったため
		// 縦だけ割り切れず（108/48=2.25）セルの中で波が途中で切れていた。
		expect(probe.water.dots, '水の絵の横ドット数が 32 でない＝方針Aが未適用').toBe(32);
		expect(probe.water.dotsH, '水の絵の縦ドット数が横と違う＝縦だけ再発する形').toBe(32);
	});

	test('⑩ 砂↔石畳の画面（field 15,8）で石畳側は素の絵のまま', async ({ page }) => {
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: '15,8', row: '5', col: '5',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);
		const names = await page.evaluate(() =>
			[...document.querySelectorAll('.cell[data-bg-sprite]')].map(c => c.dataset.bgSprite));

		const paved = names.filter(n => n.startsWith('stoneFloor@'));
		expect(paved.length, '石畳のセルが無い画面を見ている').toBeGreaterThan(5);
		expect(paved.filter(n => n.includes('sand')), '石畳が砂の色を受けている＝弱い側でない').toEqual([]);
		expect(names.filter(n => n.startsWith('sand@') && n.includes('stoneFloor')).length,
			'砂が石畳の縁を受けていない').toBeGreaterThan(0);
	});

});
