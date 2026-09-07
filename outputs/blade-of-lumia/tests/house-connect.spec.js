// tests/house-connect.spec.js — 連結タイル（家：外壁 `h`／ドア `e`／屋根 `p`）／キュー10番 10a-2
//
// 何を守るテストか：
//   家の3タイルは「1タイル＝1枚の絵」だったので、106＋52＋2 セルを並べると同じ絵が
//   等間隔に繰り返され、橋 `v` と同じ「連続で崩れる」状態になっていた。
//   ∴ 直し方は橋と同じ＝**敷き詰める本体（base）＋開いた辺だけの縁（edge）** に分解し、
//   隣接から部品を選ぶ（shared/tile-connect.js）。
//   家が橋と違う点：
//     ・縁の種類が矩形の建物向け（軒の影／笠石／土台／隅石・棟／軒／破風）
//     ・**画面外には縁を描く**（家は画面を跨いで続かない。橋は逆＝縁なし）
//     ・外壁・ドア・屋根は互いに kin ＝間に縁を描かない（ただし壁の北が屋根なら軒の影）
//
// 観測できること（＝テストの当て所）：
//   ① 部品選択    connectedTileParts() の戻り（edges の種類・edgeCode・base）
//   ② 絵の性質    本体が不透明・32×32・段/石/瓦の周期が格子 32 の約数・セル境界に継ぎ目が出ない
//   ③ 実マップ    field/13,5（屋根1行＋壁の輪郭）・field/5,3（ドアのある2棟）・単独の `h`
//   ④ 実エンジン  ゲームの DOM で canvas.tile-sprite がセル全体を埋め、dataset が ③ と一致
//                 ＋エディタも同じ部品表で描く（実ドットの色で確認）
//
// ⚠ 外壁 `h` は「岩／柱」として単独でも置かれている（孤立した `h` が実測 10 箇所。
//   さらに屋根1枚の下に壁1枚だけの幅1の小屋が 9 箇所）。マップデータは変えない方針∴
//   1セルだけの `h` が四辺すべてに縁を持ち「笠石つきの石塊」／「小さな小屋」として
//   読めることが要件になる（10a-1d の山と同じ考え方）。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { SPRITES } from '../shared/sprites.js';
import { HS_VAR_ROWS, HS_VAR_COLS, HR_VAR_ROWS, HR_VAR_COLS, connectVariantName } from '../shared/sprites-tiles.js';
import { CONNECT_TILE_PARTS, connectedTileParts, isConnectTile } from '../shared/tile-connect.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const MAP = JSON.parse(readFileSync(fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url)), 'utf8'));
const FIELD = MAP.layers.field.stages;

/** 文字列の行を配列に整えた簡易ステージを作る（bgTiles は "r,c" → 文字）。 */
function stage(rows, bg = {}) {
	return { tiles: rows.map(r => r.split('')), bgTiles: bg };
}

const H = TILE.HOUSE_WALL, E = TILE.HOUSE_DOOR, P = TILE.HOUSE_ROOF;
const N32 = 32;                       // 格子＝キャラ・地面・橋と同じ 32×32
const parts = t => CONNECT_TILE_PARTS[t];
/** グリッドの列を取り出す。 */
const colOf = (grid, c) => grid.map(row => row[c]);
/** 家の base の変種を全部並べる。 */
const varNames = (base, rows, cols) => {
	const out = [];
	for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) out.push(`${base}@${i},${j}`);
	return out;
};
const WALL_VARS = () => varNames('houseWallBase', HS_VAR_ROWS, HS_VAR_COLS);
const ROOF_VARS = () => varNames('houseRoofBase', HR_VAR_ROWS, HR_VAR_COLS);
const DOOR_VARS = () => varNames('houseDoorBase', HS_VAR_ROWS, HS_VAR_COLS);

test.describe('連結タイル（家）– 部品の選択', () => {

	test('① 家の3タイルはすべて連結タイル（＝1枚絵の描画経路を通らない）', () => {
		for (const t of [H, E, P]) {
			expect(isConnectTile(t), `${t} が連結タイルでない`).toBe(true);
			expect(parts(t).pal).toBeTruthy();
			expect(parts(t).base).toBeTruthy();
		}
		// 家でないフィールドタイルは連結タイルにしていない（木・山は 10a-1c/1d で別処理）
		expect(isConnectTile(TILE.TREE)).toBe(false);
		expect(isConnectTile(TILE.MOUNTAIN)).toBe(false);
	});

	test('② 壁の内側は縁なし＝壁の中に隅石や笠石が並ばない', () => {
		const p = connectedTileParts(stage(['hhh', 'hhh', 'hhh']), 1, 1, H);
		expect(p.edgeCode).toBe('');
		expect(p.base).toBe('houseWallBase');
		expect(p.sprs).toEqual([connectVariantName('houseWallBase', 1, 1)]);
	});

	test('③ 壁の北が屋根なら軒の影・北が屋根でなければ笠石', () => {
		const roofed = connectedTileParts(stage(['ppp', 'hhh', 'hhh']), 1, 1, H);
		expect(roofed.edges.N).toBe('eave');
		expect(roofed.sprs).toContain('houseWallEaveN');
		expect(roofed.sprs).not.toContain('houseWallCapN');
		const bare = connectedTileParts(stage(['...', 'hhh', 'hhh']), 1, 1, H);
		expect(bare.edges.N).toBe('cap');
		expect(bare.sprs).toContain('houseWallCapN');
	});

	test('④ 壁の南が地面なら土台・東西が外なら隅石／kin の側には縁を描かない', () => {
		const st = stage(['ppp', 'hhh', '...']);
		const p = connectedTileParts(st, 1, 0, H);
		expect(p.edges.N).toBe('eave');     // 北は屋根
		expect(p.edges.S).toBe('foot');     // 南は地面
		expect(p.edges.W).toBe('quoin');    // 西は画面外
		expect(p.edges.E).toBe(null);       // 東は壁（kin）
		expect(p.edgeCode).toBe('NSW');
		expect(p.sprs).toContain('houseWallFootS');
		expect(p.sprs).toContain('houseWallQuoinW');
		expect(p.sprs).not.toContain('houseWallQuoinE');
	});

	test('⑤ ドアは縁を持たず、壁とドアの間にも縁が出ない（1枚の壁に見える）', () => {
		const st = stage(['ppp', 'hhh', 'heh']);
		const d = connectedTileParts(st, 2, 1, E);
		expect(d.edgeCode).toBe('');
		expect(d.base).toBe('houseDoorBase');
		expect(d.sprs).toEqual([connectVariantName('houseDoorBase', 2, 1)]);
		// 隣の壁もドアの側には縁を描かない（隅石が立つと開口の左右で壁が切れて見える）
		expect(connectedTileParts(st, 2, 0, H).edges.E).toBe(null);
		expect(connectedTileParts(st, 2, 2, H).edges.W).toBe(null);
	});

	test('⑥ 単独の `h`（岩／柱）は四辺すべてに縁が付く＝笠石つきの石塊になる', () => {
		const p = connectedTileParts(stage(['...', '.h.', '...']), 1, 1, H);
		expect(p.edgeCode).toBe('NESW');
		for (const name of ['houseWallCapN', 'houseWallQuoinE', 'houseWallQuoinW', 'houseWallFootS']) {
			expect(p.sprs, `単独の h に ${name} が無い`).toContain(name);
		}
	});

	test('⑦ 画面外には縁を描く（橋と逆）＝跨いで続かない家の端を閉じる', () => {
		// 橋は「隣画面へデッキが続く」＝縁なし。家は実測で境界を跨ぐ棟がゼロ∴閉じる。
		// ここを橋と同じ扱いにすると、画面端の家が壁の断面を見せたまま切れる。
		const house = connectedTileParts(stage(['hhh', 'hhh', 'hhh']), 0, 0, H);
		expect(house.edges.N).toBe('cap');
		expect(house.edges.W).toBe('quoin');
		expect(house.edgeCode).toBe('NW');
		const bridge = connectedTileParts(stage(['vvv', 'vvv', 'vvv']), 0, 0, TILE.BRIDGE);
		expect(bridge.edgeCode).toBe('');
	});

	test('⑧ 屋根は北が棟・南が軒・東西が破風／屋根同士は縁なし', () => {
		const st = stage(['...', 'ppp', 'hhh']);
		const mid = connectedTileParts(st, 1, 1, P);
		expect(mid.base).toBe('houseRoofBase');
		expect(mid.edges.N).toBe('ridge');
		expect(mid.edges.S).toBe('eave');   // 下は壁＝屋根でない∴軒で切る
		expect(mid.edges.E).toBe(null);
		expect(mid.edges.W).toBe(null);
		expect(mid.sprs).toContain('houseRoofRidgeN');
		expect(mid.sprs).toContain('houseRoofEaveS');
		const west = connectedTileParts(st, 1, 0, P);
		expect(west.edges.W).toBe('gable');
		expect(west.sprs).toContain('houseRoofGableW');
		expect(connectedTileParts(st, 1, 2, P).sprs).toContain('houseRoofGableE');
		// 屋根が2行あるときは間に縁が出ない（実測では1行だが機構として持つ）
		const two = connectedTileParts(stage(['ppp', 'ppp', 'hhh']), 1, 1, P);
		expect(two.edges.N).toBe(null);
	});

	test('⑨ 窓は「軒の下の壁」にだけ・全セルではない（窓の帯にならない）', () => {
		// 全セルに描くと窓が等間隔に並んで帯に見える（旧 8×8 の失敗）。
		const rows = ['pppppppppp', 'hhhhhhhhhh', 'hhhhhhhhhh'];
		const st = stage(rows);
		let windows = 0;
		for (let c = 0; c < 10; c++) {
			expect(connectedTileParts(st, 2, c, H).sprs, '軒下でない壁に窓がある')
				.not.toContain('houseWallWindow');
			if (connectedTileParts(st, 1, c, H).sprs.includes('houseWallWindow')) windows++;
		}
		expect(windows, '軒下の壁に窓が1つも出ない').toBeGreaterThan(0);
		expect(windows, '軒下の壁すべてに窓が出る＝窓の帯').toBeLessThan(10);
		// 決定的＝同じセルは何度読んでも同じ（乱数を使っていない）
		const once = connectedTileParts(st, 1, 3, H).sprs;
		expect(connectedTileParts(st, 1, 3, H).sprs).toEqual(once);
	});

	test('⑩ 縁の重ね順は左右対称＝角の見え方が東と西で変わらない', () => {
		// ⚠ 辺を見る順（DIR_ORDER = N,E,S,W）のまま重ねると、東の縁だけが南北の帯に
		//   上塗りされ、西の縁は南北の帯に上塗りされる＝同じ家の左右の角が違う絵になる
		//   （実画面で発覚）。∴重ねる順は部品表の `layer` で別に決める。
		for (const [tile, p] of Object.entries(CONNECT_TILE_PARTS)) {
			// 東西の縁を持たないタイル（ドア）は角が無い∴対象外
			const hasEW = Object.values(p).some(v =>
				v && typeof v === 'object' && !Array.isArray(v) && v.E && v.W);
			if (!hasEW) continue;
			const order = p.layer ?? ['N', 'E', 'S', 'W'];
			expect([...order].sort(), `${tile} の layer が4方向を1度ずつ持たない`)
				.toEqual(['E', 'N', 'S', 'W']);
			const idx = d => order.indexOf(d);
			for (const v of ['N', 'S']) {
				expect(Math.sign(idx('E') - idx(v)), `${tile}: 東の縁と ${v} の重ね順`)
					.toBe(Math.sign(idx('W') - idx(v)));
			}
		}
	});

});

test.describe('連結タイル（家）– 絵の性質（並べて崩れないための退行防止）', () => {

	test('⑪ 返る部品はすべて実在し、キャラと同じ格子（32×32）で重ねられる', () => {
		// 🔴 連結タイルは canvas 1枚をセル全体へ拡大する∴8×8 に戻すと 1ドットが
		//    セル幅/8＝キャラの4倍になる（10a-1b の標準を守る番人）。
		expect(SPRITES.heroD[0].length).toBe(N32);
		for (const [tile, p] of Object.entries(CONNECT_TILE_PARTS)) {
			const names = [];
			for (const [key, v] of Object.entries(p)) {
				if (key === 'layer' || !v || typeof v !== 'object' || Array.isArray(v)) continue;
				names.push(...Object.values(v));    // kind ごとの dir → 部品名
			}
			names.push('houseWallWindow');          // extra（幾何から足す部品）も同じ格子
			for (const name of names) {
				const frames = SPRITES[name];
				expect(frames, `${tile}: SPRITES['${name}'] が無い`).toBeTruthy();
				expect(frames[0].length, `${name} の行数`).toBe(N32);
				expect(frames[0][0].length, `${name} の列数`).toBe(N32);
			}
		}
	});

	test('⑫ 本体（壁・屋根・ドア）は不透明＝隣のセルとの間に地面が透けない', () => {
		for (const name of [...WALL_VARS(), ...ROOF_VARS(), ...DOOR_VARS()]) {
			const grid = SPRITES[name];
			expect(grid, `SPRITES['${name}'] が無い`).toBeTruthy();
			expect(grid[0].length).toBe(N32);
			for (const row of grid[0]) {
				expect(row.includes(0), `${name} に透明ドットがある`).toBe(false);
			}
		}
	});

	test('⑬ 段・石・瓦の周期は格子 32 の約数＝セル境界を越えて目地が続く', () => {
		// 周期が約数でないと、セルの継ぎ目で段が半端に切れて「1タイル1枚絵」に戻る。
		// 目地の行を実際の絵から測る（数を直書きしない＝格子が変わっても意味が保たれる）。
		const fullRows = (grid, v) => grid.map((row, r) => (row.every(x => x === v) ? r : -1)).filter(r => r >= 0);
		for (const name of WALL_VARS()) {
			expect(fullRows(SPRITES[name][0], 1), `${name} の段の目地が 8 ごとに来ていない`)
				.toEqual([0, 8, 16, 24]);
		}
		for (const name of ROOF_VARS()) {
			expect(fullRows(SPRITES[name][0], 1), `${name} の段の影が 8 ごとに来ていない`)
				.toEqual([0, 8, 16, 24]);
		}
		// 縦の目地＝石の幅。段ごとに半個ずらす∴偶数段と奇数段で位置が入れ替わる。
		const jointCols = (grid, row, v) =>
			grid[row].map((x, c) => (x === v ? c : -1)).filter(c => c >= 0);
		for (const name of WALL_VARS()) {
			expect(jointCols(SPRITES[name][0], 3, 1), `${name} 段0 の石の幅が 16 でない`).toEqual([0, 16]);
			expect(jointCols(SPRITES[name][0], 11, 1), `${name} 段1 の目地が半個ずれていない`).toEqual([8, 24]);
		}
		for (const name of ROOF_VARS()) {
			expect(jointCols(SPRITES[name][0], 3, 2), `${name} 段0 の瓦の幅が 8 でない`).toEqual([0, 8, 16, 24]);
			expect(jointCols(SPRITES[name][0], 11, 2), `${name} 段1 の瓦が半枚ずれていない`).toEqual([4, 12, 20, 28]);
		}
	});

	test('⑭ 横に並べたセル境界に継ぎ目が出ない（境界に目地が来るか、肌が一致する）', () => {
		// 🔴 石／瓦の「肌」（照りの広さ）は**世界座標の石**で決めないと、セル境界を
		//    またぐ1個の石の左半分と右半分が別の状態になり、石の真ん中に段差が出る。
		//    ∴境界のドットは「右のセルの列0が目地」か「左のセルの列31と同じ色」でなければならない。
		//    （屋根はセルに瓦4枚＝世界座標の瓦が 4c+s なのに 2c+s で決めていて実際に崩れていた）
		const cases = [
			{ label: '外壁',   baseAt: () => 'houseWallBase', joint: 1, rows: HS_VAR_ROWS, cols: HS_VAR_COLS },
			{ label: '屋根',   baseAt: () => 'houseRoofBase', joint: 2, rows: HR_VAR_ROWS, cols: HR_VAR_COLS },
			// ドアの左右は必ず壁＝ドアの本体と壁の本体が隣り合う（石の帯が繋がって見える必要がある）
			{ label: 'ドアと壁', baseAt: (r, c) => (c % 3 === 1 ? 'houseDoorBase' : 'houseWallBase'),
				joint: 1, rows: HS_VAR_ROWS, cols: HS_VAR_COLS },
		];
		for (const { label, baseAt, joint, rows, cols } of cases) {
			for (let r = 0; r < rows + 1; r++) {
				for (let c = 0; c + 1 < cols * 3 + 1; c++) {
					const L = SPRITES[connectVariantName(baseAt(r, c), r, c)][0];
					const R = SPRITES[connectVariantName(baseAt(r, c + 1), r, c + 1)][0];
					const lc = colOf(L, N32 - 1), rc = colOf(R, 0);
					for (let y = 0; y < N32; y++) {
						if (rc[y] === joint) continue;          // 境界そのものが目地＝継ぎ目に見えない
						expect(rc[y], `${label}: (${r},${c})/(${r},${c + 1}) の境界 y=${y} で肌が食い違う`)
							.toBe(lc[y]);
					}
				}
			}
		}
	});

	test('⑮ 縦に並べたセル境界は必ず段の目地になる（石が半端に切れない）', () => {
		// 段の高さ 8 は 32 の約数∴下のセルの行0 は必ず段の目地。ここが崩れると
		// セル境界で石が上下に食い違う。
		for (const name of [...WALL_VARS(), ...DOOR_VARS()]) {
			expect(new Set(SPRITES[name][0][0]), `${name} の行0 が目地でない`).toEqual(new Set([1]));
		}
		for (const name of ROOF_VARS()) {
			expect(new Set(SPRITES[name][0][0]), `${name} の行0 が段の影でない`).toEqual(new Set([1]));
		}
	});

	test('⑯ 本体の絵はセルごとに変わる＝同じ絵が並んで「のっぺり」しない', () => {
		const rows = HS_VAR_ROWS + 1, cols = HS_VAR_COLS + 1;
		const st = stage(Array.from({ length: rows }, () => 'h'.repeat(cols)));
		const at = (r, c) => connectedTileParts(st, r, c, H).sprs[0];
		const seen = new Set();
		for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) seen.add(at(r, c));
		expect(seen.size, '壁の変種が少なすぎる').toBeGreaterThanOrEqual(Math.max(HS_VAR_ROWS, HS_VAR_COLS));
		for (let c = 0; c + 1 < cols; c++) {
			expect(at(0, c), `(0,${c}) と (0,${c + 1}) が同じ絵`).not.toBe(at(0, c + 1));
		}
		for (let r = 0; r + 1 < rows; r++) {
			expect(at(r, 0), `(${r},0) と (${r + 1},0) が同じ絵`).not.toBe(at(r + 1, 0));
		}
		// 屋根・ドアも同じ（ドアを固定1枚にすると左右の石の帯が隣の壁と食い違う）
		const rst = stage(['pppppp', 'hhhhhh']);
		const roofs = new Set([0, 1, 2, 3, 4, 5].map(c => connectedTileParts(rst, 0, c, P).sprs[0]));
		expect(roofs.size, '屋根が横に並んで同じ絵').toBeGreaterThanOrEqual(5);
		const dst = stage(['pppppp', 'hhhhhh', 'eeeeee']);
		const doors = new Set([0, 1, 2, 3, 4, 5].map(c => connectedTileParts(dst, 2, c, E).sprs[0]));
		expect(doors.size, 'ドアの下地が固定1枚').toBeGreaterThanOrEqual(5);
	});

	test('⑰ 縁の帯は細い＝壁の面が黒帯や白帯で潰れない', () => {
		// 軒の影と屋根の軒が両方 4 ドットだと、屋根と壁の間に 8 ドット＝27px の黒帯が
		// 出て壁が潰れた（実画面で判明）。∴壁側は 3 ドットに留める。
		const bandRows = name => SPRITES[name][0].filter(row => row.some(v => v !== 0)).length;
		const bandCols = name => {
			const g = SPRITES[name][0];
			return g[0].map((_, c) => colOf(g, c)).filter(col => col.some(v => v !== 0)).length;
		};
		expect(bandRows('houseWallEaveN')).toBeLessThanOrEqual(3);
		expect(bandRows('houseRoofEaveS')).toBeLessThanOrEqual(5);
		expect(bandRows('houseWallEaveN') + bandRows('houseRoofEaveS'),
			'屋根と壁の境目の暗い帯が太すぎる').toBeLessThanOrEqual(8);
		expect(bandRows('houseWallCapN')).toBeLessThanOrEqual(5);
		expect(bandRows('houseWallFootS')).toBeLessThanOrEqual(4);
		for (const name of ['houseWallQuoinE', 'houseWallQuoinW', 'houseRoofGableE', 'houseRoofGableW']) {
			const w = bandCols(name);
			expect(w, `${name} が太すぎる`).toBeLessThanOrEqual(4);
			expect(w, `${name} が空`).toBeGreaterThanOrEqual(2);   // 明るい面は 2 ドット以上（1 ドットは描き損じに見える）
		}
	});

	test('⑱ 窓はガラスの入った1枚の窓として読める（下半分だけ光る等の破れが無い）', () => {
		const g = SPRITES.houseWallWindow[0];
		// 枠（7）で囲われ、内側はガラス（6）＋映り込み（5）だけ
		const inner = new Set();
		for (let r = 11; r <= 20; r++) for (let c = 11; c <= 20; c++) inner.add(g[r][c]);
		expect([...inner].sort(), 'ガラスの内側に枠以外の色が混ざる').toEqual([5, 6, 7]);
		// 上下2段のガラスに同じ数の映り込みが入る（下段だけ金色に光る、をしない）
		const glints = half => {
			let n = 0;
			for (let r = half === 'top' ? 10 : 16; r <= (half === 'top' ? 15 : 21); r++)
				for (let c = 11; c <= 20; c++) if (g[r][c] === 5) n++;
			return n;
		};
		expect(glints('top')).toBe(glints('bottom'));
		expect(glints('top')).toBeGreaterThan(0);
	});

});

test.describe('連結タイル（家）– 実マップ', () => {

	test('⑲ field/13,5：屋根1行＋壁の輪郭で、内側に縁が出ない', () => {
		const st = FIELD['13,5'];
		const code = (r, c) => connectedTileParts(st, r, c, st.tiles[r][c]).edgeCode;
		// 屋根の行（棟＝北・軒＝南・東西の端だけ破風）
		expect(st.tiles[2][3]).toBe(P);
		expect(code(2, 3)).toBe('NSW');
		expect(code(2, 4)).toBe('NS');
		expect(code(2, 7)).toBe('NES');
		// 屋根の下の壁（軒の影＋端の隅石）。中は東西に縁が出ない
		expect(st.tiles[3][3]).toBe(H);
		expect(code(3, 3)).toBe('NW');
		expect(code(3, 4)).toBe('NS');
		expect(code(3, 7)).toBe('NE');
		expect(connectedTileParts(st, 3, 4, H).edges.N).toBe('eave');
		// 側面の壁（東西が外・南北が壁）＝縁は東西だけ
		expect(code(4, 3)).toBe('EW');
		expect(code(5, 7)).toBe('EW');
		// 南の角
		expect(code(6, 3)).toBe('SW');
		expect(code(6, 7)).toBe('ES');
	});

	test('⑳ field/5,3：ドアの左右で壁が切れない（開口が1枚の壁の中にある）', () => {
		const st = FIELD['5,3'];
		expect(st.tiles[7][3]).toBe(E);
		expect(st.tiles[7][7]).toBe(E);
		for (const c of [3, 7]) {
			const d = connectedTileParts(st, 7, c, E);
			expect(d.edgeCode, `ドア (7,${c}) に縁が出ている`).toBe('');
			expect(d.base).toBe('houseDoorBase');
			// ドアの上は壁（kin）＝ドアの側にも壁の側にも縁が無い
			expect(connectedTileParts(st, 6, c, H).edges.S).toBe(null);
			expect(connectedTileParts(st, 7, c - 1, H).edges.E).toBe(null);
			expect(connectedTileParts(st, 7, c + 1, H).edges.W).toBe(null);
		}
		// 棟は2つに分かれている（(5,5) は家でない）＝それぞれの端に破風が付く
		expect(connectedTileParts(st, 5, 4, P).edges.E).toBe('gable');
		expect(connectedTileParts(st, 5, 6, P).edges.W).toBe('gable');
	});

	test('㉑ 1セルだけの `h` は実マップでも閉じた石塊／小屋になる', () => {
		// マップデータは変えない∴1セルの `h` が絵として成立することが要件。実マップには
		// 2種類ある：家に繋がらない孤立した `h`（岩／柱・10 箇所）と、屋根1枚の下に壁1枚
		// だけの幅1の小屋（9 箇所）。前者は笠石で頂部を閉じ、後者は軒の影が乗る。
		const kin = new Set([H, E, P]);
		const lone = [], huts = [];
		for (const [lk, layer] of Object.entries(MAP.layers)) {
			for (const [sk, sd] of Object.entries(layer.stages)) {
				for (let r = 0; r < sd.tiles.length; r++) {
					for (let c = 0; c < sd.tiles[r].length; c++) {
						if (sd.tiles[r][c] !== H) continue;
						const p = connectedTileParts(sd, r, c, H);
						if (p.edgeCode !== 'NESW') continue;
						const where = `${lk}/${sk} ${r},${c}`;
						// 東西南は必ず外＝隅石と土台で閉じる（開いた断面を見せない）
						for (const name of ['houseWallQuoinE', 'houseWallQuoinW', 'houseWallFootS']) {
							expect(p.sprs, `${where} に ${name} が無い`).toContain(name);
						}
						const north = sd.tiles[r - 1]?.[c];
						if (north === P) {
							huts.push(where);
							expect(p.sprs, `${where}（幅1の小屋）に軒の影が無い`).toContain('houseWallEaveN');
						} else {
							expect(kin.has(north), `${where} は孤立していない`).toBe(false);
							lone.push(where);
							expect(p.sprs, `${where}（岩／柱）に笠石が無い`).toContain('houseWallCapN');
						}
					}
				}
			}
		}
		expect(lone.length, '孤立した h（実測 10 箇所）が見つからない').toBeGreaterThanOrEqual(10);
		expect(huts.length, '幅1の小屋（実測 9 箇所）が見つからない').toBeGreaterThanOrEqual(9);
	});

	test('㉒ 実マップの窓は軒下の壁だけに出て、しかも一部のセルだけ', () => {
		let eave = 0, windows = 0, misplaced = [];
		for (const [lk, layer] of Object.entries(MAP.layers)) {
			for (const [sk, sd] of Object.entries(layer.stages)) {
				for (let r = 0; r < sd.tiles.length; r++) {
					for (let c = 0; c < sd.tiles[r].length; c++) {
						if (sd.tiles[r][c] !== H) continue;
						const p = connectedTileParts(sd, r, c, H);
						const hasWindow = p.sprs.includes('houseWallWindow');
						if (p.edges.N === 'eave') eave++;
						else if (hasWindow) misplaced.push(`${lk}/${sk} ${r},${c}`);
						if (hasWindow && p.edges.N === 'eave') windows++;
					}
				}
			}
		}
		expect(misplaced, '軒下でない壁に窓が出ている').toEqual([]);
		expect(eave, '軒下の壁が見つからない').toBeGreaterThan(20);
		expect(windows / eave, '窓が多すぎる＝窓の帯に見える').toBeLessThan(0.5);
		expect(windows, '窓が1つも出ない').toBeGreaterThan(0);
	});

});

test.describe('連結タイル（家）– 実エンジンの描画', () => {

	const openStage = async (page, sk) => {
		const p = new URLSearchParams({ fromEditor: '1', layer: 'field', stage: sk, row: '0', col: '5' });
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);
	};

	test('㉓ ゲームの家セルはセル全体を埋め、縁の選択が部品表と一致する', async ({ page }) => {
		await openStage(page, '13,5');
		const probe = await page.evaluate(() => {
			const read = (r, c) => {
				const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
				const cv   = cell?.querySelector('canvas.tile-sprite');
				if (!cell || !cv) return null;
				const cr = cell.getBoundingClientRect(), vr = cv.getBoundingClientRect();
				return {
					edges: cv.dataset.tileEdges, variant: cv.dataset.tileVariant,
					cellW: cr.width, sprW: vr.width, sprH: vr.height,
					bgImage: getComputedStyle(cell).backgroundImage,
					bgColor: getComputedStyle(cell).backgroundColor,
					hasBgDataset: !!cell.dataset.bgSprite,
				};
			};
			return { roof: read(2, 4), wall: read(3, 4), side: read(4, 3), corner: read(6, 7) };
		});
		for (const [key, v] of Object.entries(probe)) {
			expect(v, `${key} に canvas.tile-sprite が無い`).not.toBeNull();
			// セル全体を埋める（0.7 倍の中央寄せに戻ると 1ドットがキャラより細かくなる）
			expect(v.sprW, `${key} の幅がセル幅と違う`).toBeCloseTo(v.cellW, 1);
			expect(v.sprH, `${key} の高さがセル幅と違う`).toBeCloseTo(v.cellW, 1);
			// 下地スプライトを外す（非整数倍率の拡大で境界に草色の線が滲む）
			expect(v.bgImage, `${key} に下地スプライトが残っている`).toBe('none');
			expect(v.hasBgDataset).toBe(false);
			expect(v.bgColor).not.toBe('rgba(0, 0, 0, 0)');
		}
		expect(probe.roof.edges).toBe('NS');
		expect(probe.roof.variant).toMatch(/^houseRoofBase@\d+,\d+$/);
		expect(probe.wall.edges).toBe('NS');
		expect(probe.wall.variant).toMatch(/^houseWallBase@\d+,\d+$/);
		expect(probe.side.edges).toBe('EW');
		expect(probe.corner.edges).toBe('ES');
	});

	test('㉓b ゲームでも横に並んだ壁は別の変種を描く（実画面でのっぺりしない）', async ({ page }) => {
		// 部品表（⑯）だけ変種でも、エンジンが代表1枚を描いていたら画面はのっぺりのまま。
		await openStage(page, '13,5');
		const variants = await page.evaluate(() => [3, 4, 5, 6].map(c =>
			document.querySelector(`.cell[data-row="3"][data-col="${c}"] canvas.tile-sprite`)?.dataset.tileVariant));
		for (const v of variants) expect(v, '本体の変種名が canvas に無い').toMatch(/^houseWallBase@\d+,\d+$/);
		expect(new Set(variants).size, `横に並んだ壁が同じ絵（${variants.join(' / ')}）`).toBe(4);
	});

	test('㉔ ゲームのドアも連結タイルとして描かれる（1枚絵の 0.7 倍に戻らない）', async ({ page }) => {
		await openStage(page, '5,3');
		const probe = await page.evaluate(() => {
			const cell = document.querySelector('.cell[data-row="7"][data-col="3"]');
			const cv   = cell?.querySelector('canvas.tile-sprite');
			if (!cv) return null;
			const cr = cell.getBoundingClientRect(), vr = cv.getBoundingClientRect();
			return { edges: cv.dataset.tileEdges, variant: cv.dataset.tileVariant, cellW: cr.width, sprW: vr.width };
		});
		expect(probe, 'ドアに canvas.tile-sprite が無い').not.toBeNull();
		expect(probe.edges).toBe('');
		expect(probe.variant).toMatch(/^houseDoorBase@\d+,\d+$/);
		expect(probe.sprW).toBeCloseTo(probe.cellW, 1);
	});

	test('㉕ エディタも同じ部品表で描く（破風・軒の影が実ドットで出る）', async ({ page }) => {
		// タイル→スプライトの対応は「エディタとゲームで分けない」が方針。
		// ∴エディタでも隣接から部品を選んでいることを canvas の実ドットで確認する。
		await page.goto('http://localhost:18080/blade-of-lumia/editor/');
		await page.waitForSelector('#world-grid .cell-empty', { state: 'visible' });
		await page.locator('#world-grid .cell-empty').first().click();
		await page.locator('#btn-edit-stage').click();
		await page.waitForSelector('#stage-canvas', { state: 'visible' });

		const paint = async (title, cells) => {
			await page.locator(`button.tile-btn[title="${title}"]`).click();
			const box = await page.locator('#stage-canvas').boundingBox();
			for (const [r, c] of cells) {
				await page.mouse.click(box.x + c * 40 + 20, box.y + r * 40 + 20);
			}
		};
		// 屋根1行＋その下に壁2行（実マップの家と同じ組み方）
		await paint('家の屋根', [[1, 1], [1, 2]]);
		await paint('家の外壁', [[2, 1], [2, 2], [3, 1], [3, 2]]);

		// セル = 40px / スプライト 32 ドット → 1 ドット 1.25px（drawSpriteAt は
		// imageSmoothingEnabled=false ∴色は混ざらない）。
		const dots = await page.evaluate(() => {
			const ctx = document.getElementById('stage-canvas').getContext('2d');
			const at = (x, y) => {
				const d = ctx.getImageData(x, y, 1, 1).data;
				return `#${[d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
			};
			return {
				gable: at(40 + 2, 40 + 13),      // 屋根(1,1) の西＝破風の明るい面（ドット 1,10）
				eave:  at(40 + 11, 80 + 3),      // 壁(2,1) の北＝軒の影の2段目（ドット 8,2）
			};
		});
		// 破風板の明るい面（連結が効いていなければ瓦の地 #b8362a / #d4574a）
		expect(dots.gable).toBe('#e88b6a');
		// 軒の影の2段目（連結が効いていなければ石の地 #9c8670 / #bfa88e）
		expect(dots.eave).toBe('#6f5a48');
	});

});
