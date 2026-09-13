// tests/fence-connect.spec.js — 連結タイル（柵 `f`）／キュー10番 10a-3
//
// 何を守るテストか：
//   柵は旧 8×8 で「柱＋横棒」を1枚の絵に描き込んでいたので、連続で並べると柱が
//   等間隔に並んで「畑のうね」に見えた（橋 `v`・家と同じ「連続で崩れる」問題）。
//   ∴ 家・橋と同じ「敷き詰める本体＋開いた辺だけの縁」に分解するが、柵は
//   **本体そのものの向きが隣接で変わる**（横棒／縦の柱／L字の角／単独の柱の
//   4パターン）＝shared/tile-connect.js の `baseFrom(nbAll)` が隣接だけから
//   本体名を選ぶ（橋の「成分の外接矩形」は角では機能しないので別の方式）。
//
//   柵は橋・家と違い**不透明ではない**（`opaque:false`）＝上下（横棒）または
//   左右（縦の柱）に地面が見える透明の余白を持つ「セルを埋めない絵」
//   （10a-1c の obj-sprite 系と同じ約束）。render-board.js はこのフラグを見て
//   下地（bgTiles）を消す処理を skip する＝隙間から実際の地面が見える。
//
// 観測できること（＝テストの当て所）：
//   ① 部品選択    connectedTileParts() の戻り（base・edgeCode・opaque）
//   ② 絵の性質    本体が32×32・横棒は上下に透明の余白／縦の柱は左右に透明の
//                 余白を持つ・境界で継ぎ目が出ない
//   ③ 実マップ    field/10,14（矩形の囲い＝角4種＋直線の両端に cap＋隙間で分断）
//   ④ 実エンジン  ゲームの DOM で canvas.tile-sprite の下に地面（bgTiles）が
//                 そのまま残る（橋・家のように下地が消えない）＋エディタも同じ
//                 部品表で描く

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { SPRITES } from '../shared/sprites.js';
import { CONNECT_TILE_PARTS, connectedTileParts, isConnectTile } from '../shared/tile-connect.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const MAP = JSON.parse(readFileSync(fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url)), 'utf8'));
const FIELD = MAP.layers.field.stages;

/** 文字列の行を配列に整えた簡易ステージを作る（bgTiles は "r,c" → 文字）。 */
function stage(rows, bg = {}) {
	return { tiles: rows.map(r => r.split('')), bgTiles: bg };
}

const F = TILE.FENCE;
const N32 = 32;
const parts = CONNECT_TILE_PARTS[F];
/** グリッドの列/行を取り出す。 */
const colOf = (grid, c) => grid.map(row => row[c]);

test.describe('連結タイル（柵）– 部品の選択', () => {

	test('① 柵は連結タイル・不透明ではない（opaque:false）', () => {
		expect(isConnectTile(F)).toBe(true);
		expect(parts.pal).toBeTruthy();
		expect(parts.opaque).toBe(false);
		const p = connectedTileParts(stage(['.f.']), 0, 1, F);
		expect(p.opaque).toBe(false);
		// 橋・家は既定どおり不透明（opaque を書いていない＝true 扱い）のまま
		expect(connectedTileParts(stage(['vvv']), 0, 1, TILE.BRIDGE).opaque).toBe(true);
	});

	test('② 孤立した単独の柵は fencePost（両隣とも柵でない）', () => {
		const p = connectedTileParts(stage(['...', '.f.', '...']), 1, 1, F);
		expect(p.base).toBe('fencePost');
		expect(p.edgeCode).toBe('');   // 自己完結＝端の柱（cap）は要らない
		expect(p.sprs).toEqual(['fencePost']);
	});

	test('③ 横に3つ並ぶ柵：両端は fenceRailH＋端の柱、中央は縁なし', () => {
		const st = stage(['.....', '.fff.', '.....']);
		const left = connectedTileParts(st, 1, 1, F);
		const mid  = connectedTileParts(st, 1, 2, F);
		const right = connectedTileParts(st, 1, 3, F);
		expect(left.base).toBe('fenceRailH');
		expect(left.edgeCode).toBe('W');
		expect(left.sprs).toContain('fenceCapW');
		expect(mid.base).toBe('fenceRailH');
		expect(mid.edgeCode).toBe('');
		expect(right.edgeCode).toBe('E');
		expect(right.sprs).toContain('fenceCapE');
	});

	test('④ 縦に3つ並ぶ柵：両端は fenceRailV＋端の柱、中央は縁なし', () => {
		const st = stage(['.f.', '.f.', '.f.', '.f.', '.f.']);
		const top = connectedTileParts(st, 0, 1, F);
		const mid = connectedTileParts(st, 2, 1, F);
		const bot = connectedTileParts(st, 4, 1, F);
		expect(top.base).toBe('fenceRailV');
		expect(top.edgeCode).toBe('N');
		expect(top.sprs).toContain('fenceCapN');
		expect(mid.base).toBe('fenceRailV');
		expect(mid.edgeCode).toBe('');
		expect(bot.edgeCode).toBe('S');
		expect(bot.sprs).toContain('fenceCapS');
	});

	test('⑤ 角（L字）：縦横それぞれ1方向にだけ続く4パターン全部・端の柱は無い', () => {
		// 十字に柵を置き、中心セルから見た4方向の相手を1つずつ塞いで角を作る。
		const cases = [
			{ rows: ['...', '.ff', '.f.'], base: 'fenceCornerSE' },  // 南＋東
			{ rows: ['...', 'ff.', '.f.'], base: 'fenceCornerSW' },  // 南＋西
			{ rows: ['.f.', '.ff', '...'], base: 'fenceCornerNE' },  // 北＋東
			{ rows: ['.f.', 'ff.', '...'], base: 'fenceCornerNW' },  // 北＋西
		];
		for (const { rows, base } of cases) {
			const p = connectedTileParts(stage(rows), 1, 1, F);
			expect(p.base, `${rows.join('|')} の角`).toBe(base);
			expect(p.edgeCode, `${base} に端の柱が付いている`).toBe('');
			expect(p.sprs).toEqual([base]);
		}
	});

});

test.describe('連結タイル（柵）– 絵の性質（並べて崩れないための退行防止）', () => {

	test('⑥ 返る部品はすべて実在し、キャラと同じ格子（32×32）', () => {
		expect(SPRITES.heroD[0].length).toBe(N32);
		const names = new Set(['fenceRailH', 'fenceRailV', 'fencePost',
			'fenceCornerSE', 'fenceCornerSW', 'fenceCornerNE', 'fenceCornerNW',
			'fenceCapN', 'fenceCapE', 'fenceCapS', 'fenceCapW']);
		for (const name of names) {
			const frames = SPRITES[name];
			expect(frames, `SPRITES['${name}'] が無い`).toBeTruthy();
			expect(frames[0].length, `${name} の行数`).toBe(N32);
			expect(frames[0][0].length, `${name} の列数`).toBe(N32);
		}
	});

	test('⑦ 横棒（fenceRailH）は上下に透明の余白＝セルを埋めない絵', () => {
		const g = SPRITES.fenceRailH[0];
		const rowHasInk = r => g[r].some(v => v !== 0);
		// 上端・下端の数行は完全に透明（地面が見える）
		expect(rowHasInk(0), '上端が塗られている').toBe(false);
		expect(rowHasInk(N32 - 1), '下端が塗られている').toBe(false);
		expect(g.some((row, r) => rowHasInk(r)), '横棒がどこにも描かれていない').toBe(true);
		// 横棒は左端から右端まで途切れず続く（隣のセルと繋がる＝橋のデッキと同じ考え方）
		for (let r = 0; r < N32; r++) {
			if (!rowHasInk(r)) continue;
			expect(g[r].every(v => v !== 0), `行 ${r} が左右どこかで途切れている`).toBe(true);
		}
	});

	test('⑧ 縦の柱（fenceRailV）は左右に透明の余白＝セルを埋めない絵', () => {
		const g = SPRITES.fenceRailV[0];
		const colHasInk = c => colOf(g, c).some(v => v !== 0);
		expect(colHasInk(0), '左端が塗られている').toBe(false);
		expect(colHasInk(N32 - 1), '右端が塗られている').toBe(false);
		expect([...Array(N32).keys()].some(colHasInk), '柱がどこにも描かれていない').toBe(true);
		// 柱は上端から下端まで途切れず続く（隣のセルと繋がる）
		for (let c = 0; c < N32; c++) {
			if (!colHasInk(c)) continue;
			expect(colOf(g, c).every(v => v !== 0), `列 ${c} が上下どこかで途切れている`).toBe(true);
		}
	});

	test('⑨ 横に並べた fenceRailH のセル境界に継ぎ目が出ない（変種を持たないので完全一致）', () => {
		const L = SPRITES.fenceRailH[0], R = SPRITES.fenceRailH[0];
		expect(colOf(L, N32 - 1)).toEqual(colOf(R, 0));
	});

	test('⑩ 角の絵は続く2方向（右・下など）にだけ本体を持ち、開いた2方向は透明', () => {
		// fenceCornerSE（南＋東）＝北・西は透明のまま（cap を足さなくても閉じて見える）
		const g = SPRITES.fenceCornerSE[0];
		expect(colOf(g, 0).every(v => v === 0), '西側が塗られている').toBe(true);
		expect(g[0].every(v => v === 0), '北側が塗られている').toBe(true);
		expect(colOf(g, N32 - 1).some(v => v !== 0), '東側に本体が無い').toBe(true);
		expect(g[N32 - 1].some(v => v !== 0), '南側に本体が無い').toBe(true);
	});

	test('⑭ 角の横棒/縦柱は直進セルと同じ絶対座標で同じ色（陰影の向きが逆転しない）', () => {
		// ❌ 実際に踏んだバグ＝旧実装は fenceCornerSE を reverse() で鏡映して残り3角を作っていた。
		//   横棒・縦柱の帯は「上端が暗い輪郭／下端が最暗」という帯の中の陰影順が固定なのに、
		//   reverse() は伸びる範囲だけでなく帯の中の色の並びまで逆転させ、直進セル
		//   （fenceRailH/fenceRailV＝常に正規の色順）との境界で陰影が食い違って見えた
		//   （ユーザー報告＝矩形の囲いの下2角が隣のセルと繋がって見えない）。
		//   ∴ 「同じ絶対座標なら同じ色」を直接検査する＝reverse() に戻すと必ず赤くなる。
		const railH = SPRITES.fenceRailH[0];
		const railV = SPRITES.fenceRailV[0];
		// 横棒の帯が乗る行＝この範囲では「柱と横棒がぶつかる場所は横棒の色を上塗り」が
		// 意図どおり働く（設計どおりの上塗り＝縦柱の比較からは除く）。
		const isRailRow = r => railH.some((row, rr) => rr === r && row.some(v => v !== 0));
		// 横に続く角（SE・NE）＝東へ伸びる帯。cols14-31 のどの列で見ても railH の同じ行と一致する。
		for (const name of ['fenceCornerSE', 'fenceCornerNE']) {
			const g = SPRITES[name][0];
			for (let c = 14; c <= 31; c++) {
				for (let r = 0; r < N32; r++) {
					if (railH[r][c] === 0) continue;
					expect(g[r][c], `${name} (${r},${c}) が横棒の帯と食い違う`).toBe(railH[r][c]);
				}
			}
		}
		// 縦に続く角（SE・SW）＝南へ伸びる柱。行 9〜31 のうち横棒の帯が乗らない行だけ railV と比較する。
		for (const name of ['fenceCornerSE', 'fenceCornerSW']) {
			const g = SPRITES[name][0];
			for (let r = 9; r <= 31; r++) {
				if (isRailRow(r)) continue;
				for (let c = 0; c < N32; c++) {
					if (railV[r][c] === 0) continue;
					expect(g[r][c], `${name} (${r},${c}) が縦柱の帯と食い違う`).toBe(railV[r][c]);
				}
			}
		}
		// 北へ伸びる角（NE・NW）＝柱は行0〜22（横棒の帯が乗る行を除く）。西へ伸びる角（SW・NW）＝横棒は列0〜17。
		for (const name of ['fenceCornerNE', 'fenceCornerNW']) {
			const g = SPRITES[name][0];
			for (let r = 0; r <= 22; r++) {
				if (isRailRow(r)) continue;
				for (let c = 0; c < N32; c++) {
					if (railV[r][c] === 0) continue;
					expect(g[r][c], `${name} (${r},${c}) が縦柱の帯と食い違う`).toBe(railV[r][c]);
				}
			}
		}
		for (const name of ['fenceCornerSW', 'fenceCornerNW']) {
			const g = SPRITES[name][0];
			for (let c = 0; c <= 17; c++) {
				for (let r = 0; r < N32; r++) {
					if (railH[r][c] === 0) continue;
					expect(g[r][c], `${name} (${r},${c}) が横棒の帯と食い違う`).toBe(railH[r][c]);
				}
			}
		}
	});

});

test.describe('連結タイル（柵）– 実マップ', () => {

	test('⑪ field/10,14：矩形の囲いの4角・両端の柱・隙間での分断', () => {
		const st = FIELD['10,14'];
		const p = (r, c) => connectedTileParts(st, r, c, st.tiles[r][c]);
		// 4つの角（実測どおり）
		expect(p(0, 0).base).toBe('fenceCornerSE');
		expect(p(0, 11).base).toBe('fenceCornerSW');
		expect(p(9, 0).base).toBe('fenceCornerNE');
		expect(p(9, 11).base).toBe('fenceCornerNW');
		// 上辺：壁('#')の手前で途切れる横棒の両端に柱
		expect(p(0, 4).edgeCode).toBe('E');
		expect(p(0, 9).edgeCode).toBe('W');
		// 左辺：row3-4 の隙間（柵が無い）で縦の柱が分断される
		expect(p(3, 0).base).toBe('fenceRailV');
		expect(p(3, 0).edgeCode).toBe('S');
		expect(p(6, 0).base).toBe('fenceRailV');
		expect(p(6, 0).edgeCode).toBe('N');
		// 内側の直線は縁なし
		expect(p(1, 0).edgeCode).toBe('');
		expect(p(0, 1).edgeCode).toBe('');
	});

});

test.describe('連結タイル（柵）– 実エンジンの描画', () => {

	const openStage = async (page, sk) => {
		const p = new URLSearchParams({ fromEditor: '1', layer: 'field', stage: sk, row: '0', col: '5' });
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);
	};

	test('⑫ ゲームの柵セルは canvas.tile-sprite の下に地面（bgTiles）が残る', async ({ page }) => {
		await openStage(page, '10,14');
		const probe = await page.evaluate(() => {
			const read = (r, c) => {
				const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
				const cv   = cell?.querySelector('canvas.tile-sprite');
				if (!cell || !cv) return null;
				return {
					edges: cv.dataset.tileEdges, variant: cv.dataset.tileVariant,
					bgSprite: cell.dataset.bgSprite, hasBgClass: cell.classList.contains('bg-mud'),
					inlineBg: cell.style.background,
				};
			};
			return { corner: read(0, 0), rail: read(0, 1) };
		});
		for (const [key, v] of Object.entries(probe)) {
			expect(v, `${key} に canvas.tile-sprite が無い`).not.toBeNull();
			// 橋・家は下地を消して単色で塗る（opaque）が、柵は opaque:false ∴
			// bgTiles の泥スプライト（10,14 は 'w'=泥）とクラスが残っている。
			expect(v.bgSprite, `${key} の下地スプライトが消されている`).toBeTruthy();
			expect(v.hasBgClass, `${key} に bg-mud クラスが無い`).toBe(true);
			expect(v.inlineBg, `${key} に橋・家と同じ単色の inline background が付いている`).toBe('');
		}
		expect(probe.corner.variant).toBe('fenceCornerSE');
		expect(probe.rail.variant).toBe('fenceRailH');
	});

	test('⑬ エディタも同じ部品表で描く（柵の角が実ドットで出る）', async ({ page }) => {
		await page.goto('http://localhost:18080/blade-of-lumia/editor/');
		await page.waitForSelector('#world-grid .cell-empty', { state: 'visible' });
		await page.locator('#world-grid .cell-empty').first().click();
		await page.locator('#btn-edit-stage').click();
		await page.waitForSelector('#stage-canvas', { state: 'visible' });

		await page.locator('button.tile-btn[title="柵"]').click();
		const box = await page.locator('#stage-canvas').boundingBox();
		// L字＝(1,1)(1,2)(2,1) → (1,1) は「南＋東に続く」角（fenceCornerSE）になる
		for (const [r, c] of [[1, 1], [1, 2], [2, 1]]) {
			await page.mouse.click(box.x + c * 40 + 20, box.y + r * 40 + 20);
		}

		// セル = 40px / スプライト 32 ドット → 1 ドット 1.25px。
		// 柵は opaque:false ∴絵の透明ドット（0）は下地（床の bgColor）をそのまま
		// 残す＝キャンバスは alpha 0 にならない（先に fillRect した床色が見える）。
		const dots = await page.evaluate(() => {
			const ctx = document.getElementById('stage-canvas').getContext('2d');
			const at = (x, y) => {
				const d = ctx.getImageData(x, y, 1, 1).data;
				return `#${[d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
			};
			return {
				post:  at(40 + 19, 40 + 15),   // (1,1) の中心付近＝柱（ドット15,12）
				open:  at(40 + 2,  40 + 2),     // (1,1) の北西＝開いた側は柱の絵が無く床色のまま
			};
		});
		// 11b：エディタの平色は実ゲームの CSS を写した shared/cell-appearance.js が出所
		// （BG_TILE_STYLE[TILE.FLOOR].color ＝ --floor-color）。以前は TILE_META.color の
		// '#2a3540' で、ゲームと違う色をエディタだけが使っていた。
		const FLOOR_COLOR = '#1a2228';
		expect(dots.post).not.toBe(FLOOR_COLOR);
		expect(dots.open).toBe(FLOOR_COLOR);
	});

});
