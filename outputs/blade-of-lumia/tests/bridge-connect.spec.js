// tests/bridge-connect.spec.js — 連結タイル（橋のデッキ）／キュー10番 10a-1
//
// 何を守るテストか：
//   橋 `v` は「1枚の絵（板＋両端の柱）」だったので、連続配置すると柱が等間隔に並び
//   畑のうねに見えた（2026-08-20 ユーザー指摘）。さらにフィールドの構造タイルは
//   `obj-sprite`＝セルの 0.7 倍・中央寄せで描かれるので、隣り合うセルの間に隙間が空く。
//   ∴ 直し方は「絵を足す」ではなく **敷き詰める本体＋開いた辺だけの縁** に分解し、
//   隣接から部品を選ぶ（shared/tile-connect.js）＋セル全体を埋める（.tile-sprite）。
//
// 観測できること（＝テストの当て所）：
//   ① 部品選択    connectedTileParts() の戻り（base の向き・edges の rail/trim）
//   ② 絵の性質    デッキは不透明で板の向きに一様＝連続配置で1枚の長板に繋がる
//   ③ 実マップ    field/8,9（12x10 の木デッキ）で内側に縁が出ない・水際に手すりが出る
//   ④ 実エンジン  ゲームの DOM で canvas.tile-sprite がセル全体を埋め、
//                 dataset.tileEdges が ③ と同じ選択になっている
//
// ⚠ 2026-09-06（10a-1b-2）: デッキ本体は「セルごとの変種」になった。どのセルも同じ絵だと
//   12セル並べて 1296px の一枚板＝色が1ドットも変わらず「のっぺり」する（ユーザー指摘）。
//   ∴ 板ごとに木口（板の端）を千鳥で入れ、板の地の色を微妙に変える。
//   sprs[0] は変種名（`bridgeDeckH@i,j`）∴向きを見るテストは base を読む。
//
// ⚠ 画面外の隣は「隣画面へデッキが続く」＝縁なしにしている。ここに縁を描くと、
//   辺スクロールで実際に繋がっている通路が塞がって見える（湖の橋アームは
//   境界セル col5,6 / row4,5 をそのまま渡る＝DECISIONS 2026-07-04）。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { SPRITES } from '../shared/sprites.js';
import { BR_VAR_ROWS, BR_VAR_COLS, connectVariantName } from '../shared/sprites-tiles.js';
import { connectedTileParts, isConnectTile, connectTileAt, connectTileIconSprites } from '../shared/tile-connect.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const MAP = JSON.parse(readFileSync(fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url)), 'utf8'));
const FIELD = MAP.layers.field.stages;

/** 文字列の行を配列に整えた簡易ステージを作る（bgTiles は "r,c" → 文字）。 */
function stage(rows, bg = {}) {
	return { tiles: rows.map(r => r.split('')), bgTiles: bg };
}

const V = TILE.BRIDGE, W = TILE.WATER, F = TILE.FLOOR;

test.describe('連結タイル – 部品の選択', () => {

	test('① 橋は連結タイルで、床や木は連結タイルでない', () => {
		expect(isConnectTile(V)).toBe(true);
		expect(isConnectTile(F)).toBe(false);
		expect(isConnectTile(TILE.TREE)).toBe(false);
		expect(connectedTileParts(stage(['vvv', 'vvv', 'vvv']), 1, 1, F)).toBeNull();
	});

	test('② 塊の内側は縁なし（＝畑のうねになる柱が内側に出ない）', () => {
		const p = connectedTileParts(stage(['vvv', 'vvv', 'vvv']), 1, 1, V);
		expect(p.edgeCode).toBe('');
		expect(p.base).toBe('bridgeDeckH');
		// 本体はそのセルの変種1枚だけ（縁は足されない）
		expect(p.sprs).toEqual([connectVariantName('bridgeDeckH', 1, 1)]);
	});

	test('③ 水に面した辺は手すり（rail）', () => {
		// 中央の橋の北だけ水。残りは橋。
		const st = stage(['~vv', 'vvv', 'vvv']);
		const p = connectedTileParts(st, 1, 1, V);
		expect(p.edges.N).toBe(null);        // (0,1) は橋なので繋がる
		const p2 = connectedTileParts(st, 1, 0, V);
		expect(p2.edges.N).toBe('rail');     // (0,0) が水
		expect(p2.sprs).toContain('bridgeRailN');
	});

	test('③b bgTiles だけが水でも手すりになる（見える地面は bgTiles 側）', () => {
		const st = stage(['..v', 'vvv', 'vvv'], { '0,0': W, '0,1': W });
		const p = connectedTileParts(st, 1, 1, V);
		expect(p.edges.N).toBe('rail');
		const dry = connectedTileParts(stage(['..v', 'vvv', 'vvv']), 1, 1, V);
		expect(dry.edges.N).toBe('trim');    // 同じ地形でも水でなければ木口
	});

	test('④ 陸に面した辺は木口（trim）＝乗り降りできる縁に手すりを立てない', () => {
		const st = stage(['ggv', 'vvv', 'vvv'], { '0,0': TILE.GRASS, '0,1': TILE.GRASS });
		const p = connectedTileParts(st, 1, 1, V);
		expect(p.edges.N).toBe('trim');
		expect(p.sprs).toContain('bridgeTrimN');
		expect(p.sprs).not.toContain('bridgeRailN');
	});

	test('⑤ 画面外の隣は縁なし（隣画面へデッキが続く）', () => {
		const p = connectedTileParts(stage(['vvv', 'vvv', 'vvv']), 0, 0, V);
		expect(p.edgeCode).toBe('');
	});

	test('⑥ 板の向きは渡る方向と直交する（東西の橋＝板は南北）', () => {
		// 東西に1幅で伸びる橋アーム（南北は水）
		const ew = connectedTileParts(stage(['~~~', 'vvv', '~~~'], {}), 1, 1, V);
		expect(ew.base).toBe('bridgeDeckV');
		expect(ew.edges.N).toBe('rail');
		expect(ew.edges.S).toBe('rail');
		// 南北に1幅で伸びる橋アーム（東西は水）
		const ns = connectedTileParts(stage(['~v~', '~v~', '~v~'], {}), 1, 1, V);
		expect(ns.base).toBe('bridgeDeckH');
		expect(ns.edges.E).toBe('rail');
		expect(ns.edges.W).toBe('rail');
	});

	test('⑥b 連続長が同じ形（2×2 の渡し）は「端が陸か」で渡る軸を決める', () => {
		// 南北が水・東西が床＝東西に渡る 2×2 のデッキ（dungeon_3/3,3 と同じ形）。
		// 連続長は両軸 2 で同じなので長さでは判別できない。端を見れば分かる。
		const st = stage([
			'.~~.',
			'.vv.',
			'.vv.',
			'.~~.',
		]);
		for (const [r, c] of [[1, 1], [1, 2], [2, 1], [2, 2]]) {
			expect(connectedTileParts(st, r, c, V).base, `(${r},${c}) の板の向き`).toBe('bridgeDeckV');
		}
		// 90度回した形（東西が水・南北が床）は板が東西になる
		const st2 = stage([
			'....',
			'~vv~',
			'~vv~',
			'....',
		]);
		for (const [r, c] of [[1, 1], [1, 2], [2, 1], [2, 2]]) {
			expect(connectedTileParts(st2, r, c, V).base, `(${r},${c}) の板の向き`).toBe('bridgeDeckH');
		}
	});

	test('⑥c 塊は全セル同じ向き＝継ぎはぎにならない（向きは連結成分ごとに1つ）', () => {
		// ⚠ セルごとに「長い方の軸」で決めると、塊の中で向きが混ざる。
		//   下の形は (3,5) が欠けていて列ごとの連続長が違う＝旧規則だと混ざった。
		const st = stage([
			'~~~~~~~',
			'~vvvvv~',
			'~vvvvv~',
			'~vvvv~~',
			'~vvvvv~',
			'~vvvvv~',
			'~~~~~~~',
		]);
		const bases = new Set();
		for (let r = 0; r < st.tiles.length; r++)
			for (let c = 0; c < st.tiles[r].length; c++)
				if (st.tiles[r][c] === V) bases.add(connectedTileParts(st, r, c, V).base);
		expect([...bases]).toEqual(['bridgeDeckH']);
	});

	test('⑥d 下地（bgTiles）に置かれた橋も同じ連結タイル＝層で見た目が変わらない', () => {
		// ⚠ 橋は2つの層に置かれる：既存 870 セルはスクリプトが tiles 層に書いたもの、
		//   エディタのタイルパレットの「橋」は地形（BG_TILES）なので bgTiles 層に書かれる。
		//   tiles 層だけを見ると、エディタで置いた橋だけ柱つきの1枚絵に戻る。
		expect(connectTileAt(stage(['...', '...', '...'], { '1,1': V }), 1, 1)).toBe(V);
		expect(connectTileAt(stage(['...', '.v.', '...']), 1, 1)).toBe(V);
		expect(connectTileAt(stage(['...', '...', '...']), 1, 1)).toBeNull();
		expect(connectTileAt(stage(['...', '...', '...']), -1, 0)).toBeNull();   // 画面外
		// 下地だけの橋でも、水際なら手すりが立つ
		const bgOnly = stage(['...', '...', '...'], { '0,1': W, '1,1': V });
		const p = connectedTileParts(bgOnly, 1, 1, V);
		expect(p.edges.N).toBe('rail');
		// tiles 層の橋の隣が下地の橋＝デッキは続く（縁を描かない＝継ぎ目が出ない）
		const mixed = stage(['~~~', 'v..', '~~~'], { '1,1': V, '1,2': V });
		expect(connectedTileParts(mixed, 1, 0, V).edges.E).toBe(null);
		expect(connectedTileParts(mixed, 1, 1, V).edges.W).toBe(null);
		// 向きも1枚のデッキとして揃う（成分＝3セルの東西の腕 → 板は南北）
		for (const c of [0, 1, 2]) {
			expect(connectedTileParts(mixed, 1, c, V).base, `(1,${c}) の板の向き`).toBe('bridgeDeckV');
		}
	});

	test('⑥e 下地が橋で上に物が乗っていてもデッキは続く扱い', () => {
		// 宝箱を橋の上に置ける（tiles 層＝物／bgTiles 層＝デッキ）。ここで縁を描くと
		// 物のあるセルだけデッキが途切れて見える。
		const st = stage(['~~~', `v${TILE.CHEST}v`, '~~~'], { '1,1': V });
		expect(connectTileAt(st, 1, 1)).toBe(V);
		expect(connectedTileParts(st, 1, 0, V).edges.E).toBe(null);
		expect(connectedTileParts(st, 1, 2, V).edges.W).toBe(null);
	});

	test('⑦ 返る部品はすべて実在し、キャラと同じ格子（32×32）で重ねられる', () => {
		// 🔴 格子の大きさはキャラ（heroD）に合わせる＝画面上の1ドットの大きさを揃える。
		// 連結タイルは canvas 1枚をセル全体へ拡大して描く∴8×8 に戻すと 1ドットが
		// セル幅/8（実測 13.5px）＝キャラの4倍になり「ドットがデカすぎる」に戻る
		// （2026-09-06 ユーザー指摘）。部品どうしのドット数が揃っていないと重ねられない。
		const charDots = SPRITES.heroD[0].length;
		expect(charDots).toBe(32);
		const st = stage(['~g~', 'vvv', '~~~'], {});
		for (const [r, c] of [[1, 0], [1, 1], [1, 2]]) {
			const p = connectedTileParts(st, r, c, V);
			for (const name of p.sprs) {
				const frames = SPRITES[name];
				expect(frames, `SPRITES['${name}'] が無い`).toBeTruthy();
				expect(frames[0].length, `${name} の行数`).toBe(charDots);
				expect(frames[0][0].length, `${name} の列数`).toBe(charDots);
			}
		}
	});

	test('⑦b 本体の絵はセルごとに変わる＝同じ絵が並んで「のっぺり」しない', () => {
		// どのセルも同じ変種だと 12 セル＝1296px が1枚の板になり、色が1ドットも
		// 変わらない（2026-09-06 ユーザー指摘）。∴セル座標から変種を選ぶ。
		const rows = BR_VAR_ROWS + 1, cols = BR_VAR_COLS + 1;
		const st = stage(Array.from({ length: rows }, () => 'v'.repeat(cols)));
		const at = (r, c) => connectedTileParts(st, r, c, V).sprs[0];
		const seen = new Set();
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				seen.add(at(r, c));
				expect(connectedTileParts(st, r, c, V).base, '向きは変種で変わらない').toBe('bridgeDeckH');
			}
		}
		// 板が並ぶ向き（deckH なら行方向）に隣のセルは必ず別の変種＝木口が千鳥で続く
		for (let r = 0; r + 1 < rows; r++) {
			expect(at(r, 0), `(${r},0) と (${r + 1},0) が同じ絵`).not.toBe(at(r + 1, 0));
		}
		expect(seen.size, '変種が1つしか使われていない').toBeGreaterThanOrEqual(BR_VAR_ROWS);
	});

});

test.describe('連結タイル – デッキの絵の性質（畑に戻らないための退行防止）', () => {

	// デッキ本体の変種を全部並べる（`bridgeDeckH@i,j`）。
	const deckNames = base => {
		const out = [];
		for (let i = 0; i < BR_VAR_ROWS; i++)
			for (let j = 0; j < BR_VAR_COLS; j++) out.push(`${base}@${i},${j}`);
		return out;
	};
	const N        = () => SPRITES.bridgeDeckH[0].length;
	const PLANK    = () => N() / 4;                     // 断面の周期（セル内に板4枚）
	// 板の向きに沿った「線」を取り出す（deckH は行／deckV は列）。
	const lineOf = (grid, orient, i) => orient === 'H' ? grid[i] : grid.map(row => row[i]);
	// その線の中で最も多い値＝板の地の色（木口・木目は例外的な少数）
	const dominant = line => {
		const count = new Map();
		for (const v of line) count.set(v, (count.get(v) ?? 0) + 1);
		return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
	};
	// 板 b の木口（板の端＝板を横切る最暗のドット）の位置。
	const seamPos = (name, orient, b) => {
		const line = lineOf(SPRITES[name][0], orient, b * PLANK() + 3);   // 板の地の行/列
		return line.map((v, k) => (v === 6 ? k : -1)).filter(k => k >= 0);
	};

	test('⑧ デッキは不透明＝隣のセルとの間に隙間が空かない', () => {
		for (const name of [...deckNames('bridgeDeckH'), ...deckNames('bridgeDeckV')]) {
			const grid = SPRITES[name];
			expect(grid, `SPRITES['${name}'] が無い`).toBeTruthy();
			for (const row of grid[0]) {
				expect(row.includes(0), `${name} に透明ドットがある`).toBe(false);
			}
		}
	});

	test('⑨ 板の木口は千鳥＝縦の印が隣の板と同じ列に揃わない（周期が目に見えない）', () => {
		// ⚠ 旧テストは「行が一様」を要求していた＝木口も禁止してしまう。守りたいのは
		//   「柱が等間隔に並ばない」ことなので、条件を「千鳥であること」に置き換える
		//   （10a-1b-2・ユーザー承認）。等間隔の支柱は ⑩b が別に守っている。
		const dist = (a, b) => {
			const d = Math.abs(a - b);
			return Math.min(d, N() - d);
		};
		// セル境界を越えて板を順に並べる（変種の周期＋1セル分＝境界もまたぐ）
		for (const [orient, pick] of [['H', R => connectVariantName('bridgeDeckH', R, 0)],
			['V', C => connectVariantName('bridgeDeckV', 0, C)]]) {
			const seams = [];
			for (let k = 0; k < BR_VAR_ROWS + 1; k++) {
				const name = pick(k);
				for (let b = 0; b < 4; b++) {
					const s = seamPos(name, orient, b);
					expect(s, `${name} の板 ${b} に木口が1本ない`).toHaveLength(1);
					seams.push(s[0]);
				}
			}
			for (let k = 1; k < seams.length; k++) {
				expect(dist(seams[k], seams[k - 1]),
					`deck${orient}: 隣り合う板の木口が近すぎる＝縦一直線に見える（${seams[k - 1]}→${seams[k]}）`)
					.toBeGreaterThanOrEqual(6);
			}
			// 少数の列を行き来するだけ（例：2列の交互）だと縞に見える
			expect(new Set(seams).size, `deck${orient}: 木口の列が少なすぎる`).toBeGreaterThanOrEqual(4);
		}
	});

	test('⑨c デッキ本体は板の向きに一様＝柱に見えない（木口・木目は少数の例外）', () => {
		// 木口を入れたので「行がすべて同一」ではなくなった。代わりに「板の向きの線は
		// 大半が同じ色」＝模様が線の 1/4 を超えない、で柱・畑のうねを防ぐ。
		for (const [base, orient] of [['bridgeDeckH', 'H'], ['bridgeDeckV', 'V']]) {
			for (const name of deckNames(base)) {
				const grid = SPRITES[name][0];
				for (let i = 0; i < N(); i++) {
					const line = lineOf(grid, orient, i);
					const dom  = dominant(line);
					const odd  = line.filter(v => v !== dom).length;
					expect(odd, `${name} の ${orient === 'H' ? '行' : '列'} ${i} に模様が多すぎる＝柱に見える`)
						.toBeLessThanOrEqual(N() / 4);
				}
			}
		}
	});

	test('⑨d 板の地の色は板ごとに変わる／1枚の板の中では変わらない', () => {
		// 「板ごとに微妙な色差」＝のっぺり対策。ただし1枚の板の中で色が変わると
		// 板が途中で切れて見える∴板の中（断面の地の行）は同じ色でなければならない。
		const tones = new Set();
		for (let R = 0; R < BR_VAR_ROWS; R++) {
			const name = connectVariantName('bridgeDeckH', R, 0);
			const grid = SPRITES[name][0];
			for (let b = 0; b < 4; b++) {
				const body = [2, 3, 4, 5].map(rr => dominant(lineOf(grid, 'H', b * PLANK() + rr)));
				expect(new Set(body).size, `${name} の板 ${b} の中で地の色が変わっている`).toBe(1);
				tones.add(body[0]);
			}
		}
		expect(tones.size, '板の地の色が1色だけ＝12セル並べると1枚板でのっぺりする').toBeGreaterThanOrEqual(2);
	});

	test('⑨b 木口（trim）の厚みは格子の 1/10 以下＝陸側に枠が回らない', () => {
		// 格子の 1/4（8×8 時代の2ドット）だと陸に面した辺にも太い枠が付き、幅2セルの
		// 渡しが「木箱」に見えた（拡大確認 2026-09-06）。手すり（rail）は太くて良い。
		// ⚠ 生のドット数で固定しない＝格子が変わると意味が変わる（32×32 化で 1→2 ドット）。
		//   守りたいのは「画面上で細いこと」∴格子に対する割合で見る。
		const thickness = (name, axis) => {
			const g = SPRITES[name][0];
			const lines = axis === 'row' ? g : g[0].map((_, c) => g.map(r => r[c]));
			return lines.filter(line => line.some(v => v !== 0)).length / lines.length;
		};
		for (const [name, axis] of [['bridgeTrimN', 'row'], ['bridgeTrimS', 'row'],
			['bridgeTrimW', 'col'], ['bridgeTrimE', 'col']]) {
			const t = thickness(name, axis);
			expect(t, `${name} が太すぎる`).toBeLessThanOrEqual(0.1);
			expect(t, `${name} が空`).toBeGreaterThan(0);
		}
	});

	test('⑩ 板の境目（横線）は板幅ごと＝周期が格子の約数でセル境界を越えて板が続く', () => {
		// 周期が格子の約数でないと、セルの継ぎ目で板が半端に切れて畑のうねに戻る。
		// ⚠ 板ごとに地の色を変えたので「行がそのまま繰り返す」ことでは測れない。
		//   測るのは構造＝「板の境目の線がどこに来るか」。
		for (const [base, orient] of [['bridgeDeckH', 'H'], ['bridgeDeckV', 'V']]) {
			for (const name of deckNames(base)) {
				const grid = SPRITES[name][0];
				const divs = [];
				for (let i = 0; i < N(); i++) if (dominant(lineOf(grid, orient, i)) === 6) divs.push(i);
				expect(divs, `${name} の板の境目が板幅 ${PLANK()} ごとに来ていない`)
					.toEqual([0, 1, 2, 3].map(b => b * PLANK()));
			}
		}
		expect(N() % PLANK(), `板幅 ${PLANK()} が格子 ${N()} の約数でない`).toBe(0);
	});

	test('⑩b 手すりの支柱は等間隔で、間隔が格子の約数＝隣セルと繋いでも詰まらない', () => {
		// 支柱の間隔が格子の約数でないと、セル境界で支柱の間隔だけが狭くなる
		// （旧 8×8 は間隔4で成立していた＝32×32 化でここを崩さないための番人）。
		const g = SPRITES.bridgeRailN[0];
		const capRows = g.findIndex(row => row.includes(0));   // 笠木の下＝支柱だけの行
		expect(capRows, '笠木しかない＝支柱が無い').toBeGreaterThan(0);
		const postCols = g[capRows].map((v, c) => (v ? c : -1)).filter(c => c >= 0);
		expect(postCols.length, '支柱が無い').toBeGreaterThan(0);
		// 支柱の左端どうしの間隔を取る
		const starts = postCols.filter(c => !postCols.includes(c - 1));
		expect(starts.length, 'セル内に支柱が2本以上').toBeGreaterThanOrEqual(2);
		const gaps = starts.slice(1).map((c, i) => c - starts[i]);
		expect(new Set(gaps).size, '支柱の間隔が不均等').toBe(1);
		expect(g[0].length % gaps[0], `間隔 ${gaps[0]} が格子の約数でない`).toBe(0);
	});

});

test.describe('連結タイル – 実マップ field/8,9（12x10 の木デッキ）', () => {

	const st = FIELD['8,9'];

	test('⑪ デッキの内側セルは縁を持たない', () => {
		const p = connectedTileParts(st, 4, 0, V);
		expect(st.tiles[4][0]).toBe(V);
		expect(p.edgeCode).toBe('');
	});

	test('⑫ 北の水際は手すり・内側の草の縁は木口', () => {
		const north = connectedTileParts(st, 1, 0, V);
		expect(north.edges.N).toBe('rail');      // (0,0) は bgTiles が水
		const inner = connectedTileParts(st, 4, 4, V);
		expect(inner.edges.E).toBe('trim');      // (4,5) は草の床＝乗り降りできる
	});

	test('⑬ 縁が付くセルは全体の一部だけ（内側が縁で埋まっていない）', () => {
		let total = 0, withEdge = 0;
		for (let r = 0; r < st.tiles.length; r++) {
			for (let c = 0; c < st.tiles[r].length; c++) {
				if (st.tiles[r][c] !== V) continue;
				total++;
				if (connectedTileParts(st, r, c, V).edgeCode) withEdge++;
			}
		}
		expect(total).toBeGreaterThan(60);
		expect(withEdge / total).toBeLessThan(0.5);
	});

	test('⑬b 1枚に繋がったデッキは板の向きが揃う（実マップで4セルだけ縦板になっていた）', () => {
		// field/8,9 のデッキは草地に挟まれて1セルだけ幅1になる箇所がある。
		// セル単位で向きを決めるとそこだけ縦板になり、広い床の中で継ぎはぎに見えた。
		const bases = new Set();
		for (let r = 0; r < st.tiles.length; r++)
			for (let c = 0; c < st.tiles[r].length; c++)
				if (st.tiles[r][c] === V) bases.add(connectedTileParts(st, r, c, V).base);
		expect([...bases]).toEqual(['bridgeDeckH']);
	});

	test('⑬c dungeon_3/3,3 の 2×2 の渡しは板が渡る方向と直交する', () => {
		// 南北が水（bgTiles）・東西が床＝東西に渡る 2×2。連続長は両軸2で同じ。
		const d = MAP.layers.dungeon_3.stages['3,3'];
		for (const [r, c] of [[4, 7], [4, 8], [5, 7], [5, 8]]) {
			expect(d.tiles[r][c]).toBe(V);
			expect(connectedTileParts(d, r, c, V).base).toBe('bridgeDeckV');
		}
		expect(connectedTileParts(d, 4, 7, V).edges.N).toBe('rail');
		expect(connectedTileParts(d, 4, 7, V).edges.W).toBe('trim');
	});

});

test.describe('連結タイル – 実エンジンの描画', () => {

	test('⑭ ゲームの橋セルはセル全体を埋め、縁の選択が部品表と一致する', async ({ page }) => {
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: '8,9', row: '4', col: '0',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);

		const probe = await page.evaluate(() => {
			const read = (r, c) => {
				const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
				const cv   = cell?.querySelector('canvas.tile-sprite');
				if (!cell || !cv) return null;
				const cr = cell.getBoundingClientRect(), vr = cv.getBoundingClientRect();
				return { edges: cv.dataset.tileEdges, cellW: cr.width, sprW: vr.width };
			};
			return { inner: read(4, 0), north: read(1, 0), east: read(4, 4) };
		});

		// セル全体を埋めている（0.7 倍の中央寄せに戻ると隙間が空く）
		expect(probe.inner).not.toBeNull();
		expect(probe.inner.sprW).toBeCloseTo(probe.inner.cellW, 1);
		// 縁の選択がデータ側と一致
		expect(probe.inner.edges).toBe('');
		expect(probe.north.edges).toBe('N');
		expect(probe.east.edges).toBe('E');
	});

	test('⑭b ゲームでも縦に並んだ橋セルは別の変種を描く（実画面で木口が千鳥になる）', async ({ page }) => {
		// 部品表（⑦b）だけ千鳥でも、エンジンが代表1枚を描いていたら画面はのっぺりのまま。
		// ∴ DOM の canvas に本体の変種名を持たせて実際の描画を観測する。
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: '8,9', row: '4', col: '0',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);

		const variants = await page.evaluate(() => [3, 4, 5].map(r =>
			document.querySelector(`.cell[data-row="${r}"][data-col="0"] canvas.tile-sprite`)?.dataset.tileVariant));
		for (const v of variants) expect(v, '本体の変種名が canvas に無い').toMatch(/^bridgeDeck[HV]@\d+,\d+$/);
		expect(new Set(variants).size, `縦に並んだ橋が同じ絵（${variants.join(' / ')}）`).toBe(3);
	});

	test('⑮ 橋セルは下地スプライトを外す＝セル境界に草色の格子線が出ない', async ({ page }) => {
		// デッキは不透明だが、8ドットの絵を 75px 等の非整数倍率へ拡大すると端の
		// 1デバイスピクセルに下地（bgTiles の草）が滲み、セル境界に緑の細線が並ぶ。
		// ∴ 橋セルでは下地の background-image を外し、セル背景をデッキの色にする。
		// dataset.bgSprite を残すとアニメの再適用（redrawAnimSprites）で戻ってしまう。
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: '8,9', row: '4', col: '0',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);

		const probe = await page.evaluate(() => {
			const cell  = document.querySelector('.cell[data-row="4"][data-col="0"]');
			const grass = document.querySelector('.cell[data-row="4"][data-col="5"]');
			const cs = getComputedStyle(cell);
			return {
				bridgeBgImage: cs.backgroundImage,
				bridgeBgColor: cs.backgroundColor,
				bridgeHasDataset: !!cell.dataset.bgSprite,
				grassBgImage: getComputedStyle(grass).backgroundImage,
			};
		});

		expect(probe.bridgeBgImage).toBe('none');
		expect(probe.bridgeHasDataset).toBe(false);
		expect(probe.bridgeBgColor).not.toBe('rgba(0, 0, 0, 0)');
		// 比較対象：橋でない草セルは下地スプライトを持ったまま（機構ごと消していない）
		expect(probe.grassBgImage).toContain('url(');
	});

	test('⑰ 下地（bgTiles）の橋もゲームで同じ絵になる＝置いた層で見た目が変わらない', async ({ page }) => {
		// ライブマップの橋は 870 セルすべて tiles 層にある（＝スクリプトが書いた）。
		// エディタのタイルパレットの「橋」は BG_TILES ＝ bgTiles 層に書かれるので、
		// 「これから置く橋」はこの経路を通る。実マップに例が無いので、マップ JSON の
		// 応答だけをテスト内で差し替えて確かめる（マップデータは変更しない）。
		await page.route('**/work/blade-of-lumia.json', async route => {
			const res  = await route.fetch();
			const json = await res.json();
			const sd   = json.layers.field.stages['8,9'];
			sd.bgTiles['4,5'] = 'v';    // 元は草の床（デッキに挟まれた隙間）
			sd.bgTiles['5,5'] = 'v';
			await route.fulfill({ json });
		});
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: '8,9', row: '4', col: '0',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);

		const probe = await page.evaluate(() => {
			const read = (r, c) => {
				const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
				const cv   = cell?.querySelector('canvas.tile-sprite');
				if (!cell || !cv) return null;
				const cr = cell.getBoundingClientRect(), vr = cv.getBoundingClientRect();
				return {
					edges: cv.dataset.tileEdges, cellW: cr.width, sprW: vr.width,
					bgImage: getComputedStyle(cell).backgroundImage,
				};
			};
			return { bg: read(4, 5), neighbor: read(4, 4) };
		});

		// 下地の橋のセルもデッキが描かれ、セル全体を埋める（草の下地敷きに落ちていない）
		expect(probe.bg, '下地の橋に canvas.tile-sprite が無い').not.toBeNull();
		expect(probe.bg.sprW).toBeCloseTo(probe.bg.cellW, 1);
		expect(probe.bg.bgImage).toBe('none');
		// tiles 層の隣（4,4）は木口（E）が消える＝層をまたいでデッキが繋がる
		expect(probe.neighbor.edges).not.toContain('E');
	});

	test('⑯ エディタも同じ部品表で描く（水際に手すりが出る＝ゲームと見た目が違わない）', async ({ page }) => {
		// タイル→スプライトの対応は「エディタとゲームで分けない」が方針。
		// ∴ エディタでも隣接から部品を選んでいることを実際の canvas のドットで確認する。
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
		// 南北が水・東西が床の 2×2 の渡し（＝dungeon_3/3,3 と同じ形）
		await paint('水', [[1, 1], [1, 2], [4, 1], [4, 2]]);
		await paint('橋', [[2, 1], [2, 2], [3, 1], [3, 2]]);

		// デッキ上端（行2の1ドット目・2ドット目）の色を読む。
		// 連結が効いていれば手すりの笠木（輪郭 1 → 明部 4）。
		// 効かず代表1枚（bridgeDeckH）だけなら継ぎ目 6 → 板の地 3 になる。
		const dots = await page.evaluate(() => {
			const cv  = document.getElementById('stage-canvas');
			const ctx = cv.getContext('2d');
			const at = (x, y) => {
				const d = ctx.getImageData(x, y, 1, 1).data;
				return `#${[d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
			};
			// セル = 40px / スプライト 32 ドット → 1 ドット 1.25px（drawSpriteAt は
			// imageSmoothingEnabled=false ∴色は混ざらない）。行2の上端は y=80。
			// 手すりの断面＝輪郭2ドット（y 80〜82.5）→ 笠木の明部3ドット（y 82.5〜86.25）。
			return { dot0: at(1 * 40 + 20, 80 + 1), dot1: at(1 * 40 + 20, 80 + 5) };
		});

		expect(dots.dot0).toBe('#5a3a18');   // 手すりの輪郭（デッキ単体なら #3a2010）
		expect(dots.dot1).toBe('#d0a070');   // 手すりの笠木（デッキ単体なら #8a6030）
	});

});

// ══════════════════════════════════════════════════════════════════
// キュー10番 10c-2（2026-09-12）
//   ⓐ 導出の橋 'v'：手すりは水際で切らず、渡る軸の側面を成分の端まで通す。
//      「陸から踏み出した所に手すりが無い＝落ちる」構造に見えるのを直すため
//      （ユーザー指摘）。木口は踏み降りる辺だけに残す。
//   ⓑ 手すりを手で決める橋 8種：導出できない意図（水の上で手すり無し／2枚並べた
//      橋の内側だけ手すりを消す）を文字で指定する。
// ══════════════════════════════════════════════════════════════════

test.describe('連結タイル – 手すりを陸まで通す（10c-2 ⓐ）', () => {

	test('⑱ 南北に渡る腕の側面は、陸に接していても手すり（水際で切れない）', () => {
		// 中央列だけが橋・両側は草（南北に3セル＝渡る軸が南北と分かる）。
		const st = stage(['gvg', 'gvg', 'gvg'], {
			'0,0': TILE.GRASS, '0,2': TILE.GRASS, '1,0': TILE.GRASS,
			'1,2': TILE.GRASS, '2,0': TILE.GRASS, '2,2': TILE.GRASS,
		});
		const p = connectedTileParts(st, 1, 1, V);
		expect(p.base).toBe('bridgeDeckH');       // 南北に渡る＝板は東西
		expect(p.edges.W).toBe('rail');
		expect(p.edges.E).toBe('rail');
		expect(p.sprs).toContain('bridgeRailW');
	});

	test('⑱b 水際から陸に乗った端のセルも側面は手すり・踏み降りる辺だけ木口', () => {
		// row0,1 の東西が水／row2 の東西が草＝橋が陸に乗り上げる形。row3 は草（降り口）。
		const st = stage(['~v~', '~v~', 'gvg', 'ggg']);
		const land = connectedTileParts(st, 2, 1, V);
		expect(land.edges.W).toBe('rail');        // 陸に接していても手すりが続く
		expect(land.edges.E).toBe('rail');
		expect(land.edges.S).toBe('trim');        // 踏み降りる辺だけ木口
		expect(land.sprs).not.toContain('bridgeTrimW');
		const water = connectedTileParts(st, 0, 1, V);
		expect(water.edges.W).toBe('rail');       // 水際も同じ手すり＝段が付かない
	});

	test('⑱c 塊のデッキは対象外＝陸に面した辺は木口のまま（広い床に柵が回らない）', () => {
		const st = stage(['gvvvg', 'gvvvg', 'gvvvg']);
		const p = connectedTileParts(st, 1, 1, V);
		expect(p.edges.W).toBe('trim');
		expect(connectedTileParts(FIELD['8,9'], 4, 4, V).edges.E).toBe('trim');
	});

	test('⑱d 単独の渡し（1×1・2×1）は対象外＝板が「囲われた箱」にならない', () => {
		const one = connectedTileParts(stage(['ggg', 'gvg', 'ggg']), 1, 1, V);
		expect(one.edges.N).toBe('trim');
		expect(one.edges.W).toBe('trim');
		// ダンジョンの落とし穴に架かる 1×1 の板（実マップ）
		const dt = connectedTileParts(MAP.layers.dark_tower.stages['3,1'], 6, 3, V);
		expect(Object.values(dt.edges).some(e => e === 'rail')).toBe(false);
	});

	test('⑱e 2×2 の小さな渡しは画面端に接する軸で向きを決める（島の角に騙されない）', () => {
		// field/10,11 東の腕＝rows4-5 × cols10-11。北に島の角 'j' があるため
		// axisCrosses だけでは「南北も渡っている」と誤答し、西の腕と向きが食い違った。
		const st = FIELD['10,11'];
		for (const [r, c] of [[4, 10], [4, 11], [5, 10], [5, 11]]) {
			expect(connectedTileParts(st, r, c, V).base).toBe('bridgeDeckV');
		}
		// 西の腕（rows4-5 × cols0-1）と同じ向き＝左右対称
		expect(connectedTileParts(st, 4, 0, V).base).toBe('bridgeDeckV');
	});

});

test.describe('連結タイル – 手すりを手で決める橋 8種（10c-2 ⓑ）', () => {

	const MANUAL = [
		[TILE.BRIDGE_V_BOTH, 'bridgeDeckH', ['W', 'E']],
		[TILE.BRIDGE_V_W,    'bridgeDeckH', ['W']],
		[TILE.BRIDGE_V_E,    'bridgeDeckH', ['E']],
		[TILE.BRIDGE_V_NONE, 'bridgeDeckH', []],
		[TILE.BRIDGE_H_BOTH, 'bridgeDeckV', ['N', 'S']],
		[TILE.BRIDGE_H_N,    'bridgeDeckV', ['N']],
		[TILE.BRIDGE_H_S,    'bridgeDeckV', ['S']],
		[TILE.BRIDGE_H_NONE, 'bridgeDeckV', []],
	];

	test('⑲ 8種すべて連結タイルで、文字が重複していない', () => {
		const chars = MANUAL.map(([t]) => t);
		expect(new Set([...chars, V]).size).toBe(9);
		for (const t of chars) expect(isConnectTile(t)).toBe(true);
	});

	test('⑳ 板の向きは文字で決まる（隣接に左右されない）', () => {
		for (const [t, base] of MANUAL) {
			// 周りを全部水にしても、逆に全部陸にしても向きは同じ
			const wet = connectedTileParts(stage(['~~~', `~${t}~`, '~~~']), 1, 1, t);
			const dry = connectedTileParts(stage(['ggg', `g${t}g`, 'ggg']), 1, 1, t);
			expect(wet.base).toBe(base);
			expect(dry.base).toBe(base);
		}
	});

	test('㉑ 手すりは名指しした辺だけ・水の上でも増えない（手すり無しは本当に無し）', () => {
		for (const [t, , rails] of MANUAL) {
			const p = connectedTileParts(stage(['~~~', `~${t}~`, '~~~']), 1, 1, t);
			const got = ['N', 'E', 'S', 'W'].filter(d => p.edges[d] === 'rail');
			expect(got.sort()).toEqual([...rails].sort());
		}
	});

	test('㉒ 手すりを立てない辺は木口（隣が橋族・画面外なら縁なし）', () => {
		const t = TILE.BRIDGE_V_NONE;
		const p = connectedTileParts(stage(['ggg', `g${t}g`, 'ggg']), 1, 1, t);
		expect(p.edges.N).toBe('trim');
		expect(p.edges.W).toBe('trim');
		// 同種が続く辺・画面外は縁なし
		const kin = connectedTileParts(stage([`${t}${t}${t}`]), 0, 1, t);
		expect(kin.edgeCode).toBe('');
	});

	test('㉓ 導出の橋 v と手動の橋の間には木口を描かない（1枚のデッキとして繋がる）', () => {
		const t = TILE.BRIDGE_V_BOTH;
		const st = stage(['~v~', `~${t}~`, '~v~']);
		expect(connectedTileParts(st, 0, 1, V).edges.S).toBeNull();
		expect(connectedTileParts(st, 1, 1, t).edges.N).toBeNull();
		expect(connectedTileParts(st, 2, 1, V).edges.N).toBeNull();
	});

	test('㉔ 2枚並べて1本の橋＝内側に手すりが立たない（╟＋╢）', () => {
		const [wSide, eSide] = [TILE.BRIDGE_V_W, TILE.BRIDGE_V_E];
		const st = stage([`~${wSide}${eSide}~`, `~${wSide}${eSide}~`]);
		const left = connectedTileParts(st, 0, 1, wSide);
		const right = connectedTileParts(st, 0, 2, eSide);
		expect(left.edges.W).toBe('rail');
		expect(left.edges.E).toBeNull();     // 内側＝手すりも木口も無い
		expect(right.edges.E).toBe('rail');
		expect(right.edges.W).toBeNull();
	});

	test('㉕ 8種すべて地形（bgTiles 層に置ける）・通行可・エディタのパレットに載っている', async () => {
		const { BG_TILES, TILE_META, MANUAL_BRIDGE_SPEC } = await import('../shared/tiles.js');
		// パレットは定数名で参照されるのでソースを読んで登録漏れを見る（敵タイルが
		// 2種漏れていた前例と同じ穴＝ここに無いタイルはエディタで置けない）。
		const palette = readFileSync(fileURLToPath(new URL('../editor/editor-palette.js', import.meta.url)), 'utf8');
		const names = Object.keys(TILE).filter(k => MANUAL_BRIDGE_SPEC[TILE[k]]);
		expect(names.length).toBe(8);
		for (const name of names) expect(palette).toContain(`TILE.${name}`);
		for (const [t] of MANUAL) {
			expect(BG_TILES.has(t)).toBe(true);
			expect(TILE_META[t]?.passable).toBe(true);
			expect(TILE_META[t]?.label).toBeTruthy();
		}
	});

	test('㉖ 8種すべて障害軸を与える（水を渡る手段として数える）', async () => {
		const { BRIDGE_KIN } = await import('../shared/tiles.js');
		const { screenAxes } = await import('../scripts/lib/field-quality.mjs');
		expect(BRIDGE_KIN.has(V)).toBe(true);
		for (const [t] of MANUAL) expect(BRIDGE_KIN.has(t)).toBe(true);
		// 水で分断された画面に手動の橋を1枚置くだけで障害軸が立つ
		const t = TILE.BRIDGE_H_BOTH;
		const rows = ['gggggg', '~~~~~~', 'gggggg'];
		const before = screenAxes({ rows: 3, cols: 6, tiles: rows.map(r => r.split('')), bgTiles: {} });
		const after = screenAxes({
			rows: 3, cols: 6,
			tiles: ['gggggg', `~~${t}${t}~~`, 'gggggg'].map(r => r.split('')), bgTiles: {},
		});
		expect(before.has('obstacle')).toBe(false);
		expect(after.has('obstacle')).toBe(true);
	});

	test('㉗ パレットのアイコンに手すりが出る＝8種を見た目で見分けられる', () => {
		const railSprites = { N: 'bridgeRailN', E: 'bridgeRailE', S: 'bridgeRailS', W: 'bridgeRailW' };
		for (const [t, deck, rails] of MANUAL) {
			const icon = connectTileIconSprites(t);
			expect(icon, `${t} のアイコン部品`).toBeTruthy();
			expect(icon.pal).toBe('bridge');
			// 本体は板の向きどおり／手すりは名指しした辺と完全一致（過不足なし）
			expect(icon.sprs[0]).toBe(deck);
			expect(icon.sprs.slice(1).sort()).toEqual(rails.map(d => railSprites[d]).sort());
			// 木口は隣接で決まる＝アイコンには出さない。全部の絵が実在すること。
			for (const s of icon.sprs) {
				expect(s.startsWith('bridgeTrim')).toBe(false);
				expect(SPRITES[s], `${s} の絵`).toBeTruthy();
			}
		}
		// 手すりの辺が違うタイル同士は必ず違う絵の組み合わせになる（8種が同じ絵に見えない）
		const keys = MANUAL.map(([t]) => connectTileIconSprites(t).sprs.join('+'));
		expect(new Set(keys).size).toBe(8);
		// 隣接から導く連結タイルは null＝呼び出し側は従来の1枚絵に落ちる
		for (const t of [TILE.BRIDGE, TILE.HOUSE_WALL, TILE.HOUSE_ROOF, TILE.HOUSE_DOOR, TILE.FENCE]) {
			expect(connectTileIconSprites(t)).toBeNull();
		}
	});

});
