// ── Blade of Lumia – 地形の継ぎ目（bgTiles の境界）── キュー10番 10b ───────
//
// 何を直すか：見える地面（`bgTiles`）が切り替わる辺が、セルの縁でまっすぐ切れていた
// （実測 4536 辺 / 19 ペア。うち水がらむ辺が 3381＝75%）。草地と水が定規で切った
// ように接するので「タイルを並べた盤」に見える。
//
// 🔴 機構＝**自分のセルの 32 ドット絵の中に隣の地面の色を塗る**。新しい層も遷移タイルも
//    作らない∴マップデータは1ビットも動かない（接続指標＝seams/traps/W1/W2 に影響なし）。
//    ❗ PLAN 10b の旧記述「`bgTiles` は CSS `background-repeat` で敷いている∴セルに
//      canvas を足す作法が使えない／境界セルに2層目を重ねるか `tiles` 層に遷移タイルを置く」
//      は 10a-1b-3（2026-09-06・方針A）で失効した。地面は既に「セル1枚＝32×32 の絵1枚」
//      （`applyBgSpriteToCell` の `no-repeat` / `100% 100%`）∴絵の中で隣を混ぜられる。
//
// 決め事：
//   ① **どちらのセルが塗るかを優先順位で決める**（両側が塗ると境界が2重にずれて濁る）。
//      優先度の高い地形が低い地形へ**食い込む**＝食い込まれる側（低い方）だけが塗る。
//      ∴石畳（高い）の絵は継ぎ目でも一切変わらない（「石畳は完璧」＝2026-09-06 ユーザー判定）。
//   ② **輪郭は継ぎ目の線ごとに1つの種で作る**＝海岸に沿った隣のセルへ輪郭が続く
//      （セルごとに種を変えると 32 ドットおきに同じ形が並ぶ／輪郭が仕切り直される）。
//   ③ 斜めだけが高い地形のときは角に小さな食い込みを足す（岬の角が欠けて見えるのを防ぐ）。
//      印は 3 ドット以上＝`GROUND_MARK_MIN` と同じ理由（1ドットはノイズに見える）。
//
// 読み手（11b で更新）：`groundSpriteName` を呼ぶのは `shared/cell-appearance.js`
// `describeCell` の1か所だけになった。実ゲームの盤面・エディタのステージキャンバス・
// ワールドプレビューの3系はいずれもその記述を読んで描く∴継ぎ目の絵はどの系でも同じ。
// （10b 当時の「エディタは bgTiles を平らな色で描く＝読み手は1つ」という記述は失効。
//  食い違いは 2026-09-13 にユーザーが指摘し 11b で構造的に解消した。）

import { TILE } from './tiles.js';
import { TILE_SPRITE_MAP } from './tile-sprites.js';
import { SPRITES, registerSprite } from './sprites.js';
import { GROUND_N, GROUND_VARIANTS, SEAM_TONE_IDX, bgVariantName, tileHash } from './sprites-tiles.js';

// 食い込む向き（数字が大きいほど強い＝弱い側の絵に食い込む）。
// 溶岩・水が一番強い＝渚／熱い縁は必ず陸側のセルに描かれる（水・溶岩はアニメーション
// する絵〈32×32・10j〉∴そちらを触れない、という都合とも一致する）。
// 石畳は舗装＝崩れた縁が土に散る側が自然∴土（草/砂/泥/灰/雪）より強い。
export const SEAM_PRIORITY = {
	grass: 0, snow: 1, sand: 2, mud: 3, ash: 4, stoneFloor: 5, water: 6, lava: 7,
};

export const SEAM_DEPTH_MAX = 3;      // 食い込みの深さ（ドット）＝32 の 1/10 まで

// tiles 層に置かれると地面が隠れるタイル＝継ぎ目の相手にしない
// （`render-board.js setCellClass` がここで `return` して下地を敷かないセル）。
const HIDE_GROUND = new Set([TILE.WALL, TILE.SKY, TILE.PIT]);

const DIRS    = { n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] };
const CORNERS = { ne: ['n', 'e'], se: ['s', 'e'], sw: ['s', 'w'], nw: ['n', 'w'] };

// そのセルで「見えている地面」の名前（継ぎ目の相手として何を混ぜるか）。
// ⚠ 溶岩は `TILE_SPRITE_MAP` では水と同じ形（`water`）を指す∴ここで先に分ける。
//   混ぜる色は別（`SEAM_TONE_IDX.lava`）＝火山の縁に青を塗らない。
// ⚠ 潮ゲート（`TILE.TIDE_GATE`）は開閉で見た目が変わる∴継ぎ目を作らない（null）。
export function visibleGroundSprite(stageData, r, c) {
	const rows = stageData?.tiles?.length ?? 0;
	if (r < 0 || c < 0 || r >= rows) return null;          // 画面外＝隣の画面（継ぎ目を作らない）
	const row = stageData.tiles[r];
	if (!row || c >= row.length) return null;
	const t = row[c];
	if (t === TILE.WATER) return 'water';
	if (t === TILE.LAVA)  return 'lava';
	if (HIDE_GROUND.has(t)) return null;
	const bg = stageData.bgTiles?.[`${r},${c}`] ?? TILE.FLOOR;
	if (bg === TILE.WATER) return 'water';
	if (bg === TILE.LAVA)  return 'lava';
	const spr = TILE_SPRITE_MAP[bg]?.spr;
	return spr && spr in SEAM_PRIORITY ? spr : null;
}

// 継ぎ目の「線」ごとの種。同じ線（同じ境界行／列）に並ぶセルは同じ種を引く∴
// 輪郭がセルをまたいで続く（セル座標を種に混ぜると 32 ドットで仕切り直される）。
function edgeSeed(dir, u, r, c) {
	const horiz = dir === 'n' || dir === 's';
	const line  = dir === 'n' ? r : dir === 's' ? r + 1 : dir === 'w' ? c : c + 1;
	return tileHash((horiz ? 0 : 7919) + line, SEAM_TONE_IDX[u] * 131 + 17);
}

// 継ぎ目に沿った世界ドット座標 pos での食い込みの深さ（1〜SEAM_DEPTH_MAX）。
// 4ドットごとの段（step）＋1ドットごとの崩し（jit）＝定規の線でも階段でもない縁になる。
function depthAt(seed, pos) {
	const step = 1 + tileHash(seed, pos >> 2) % 2;              // 1〜2
	const jit  = tileHash(seed ^ 0x5bf03635, pos) % 2;          // 0〜1
	return step + jit;
}

function paintEdge(g, dir, u, r, c) {
	const N = GROUND_N;
	const idx = SEAM_TONE_IDX[u];
	const seed = edgeSeed(dir, u, r, c);
	const horiz = dir === 'n' || dir === 's';
	const world = (horiz ? c : r) * N;      // 継ぎ目に沿った世界ドット座標の起点
	for (let i = 0; i < N; i++) {
		const depth = depthAt(seed, world + i);
		for (let k = 0; k < depth; k++) {
			if      (dir === 'n') g[k][i] = idx;
			else if (dir === 's') g[N - 1 - k][i] = idx;
			else if (dir === 'w') g[i][k] = idx;
			else                  g[i][N - 1 - k] = idx;
		}
	}
}

// 斜めだけが強い地形のとき＝角に 3〜4 ドットの食い込みを置く（岬の角の欠けを埋める）。
function paintCorner(g, key, u, r, c) {
	const N = GROUND_N;
	const idx = SEAM_TONE_IDX[u];
	const r0 = key[0] === 'n' ? 0 : N - 1, dr = key[0] === 'n' ? 1 : -1;
	const c0 = key[1] === 'e' ? N - 1 : 0, dc = key[1] === 'e' ? -1 : 1;
	const cells = [[0, 0], [0, 1], [1, 0]];
	if (tileHash(r * 31 + c, SEAM_TONE_IDX[u]) % 2) cells.push([1, 1]);
	for (const [a, b] of cells) g[r0 + a * dr][c0 + b * dc] = idx;
}

function seamGrid(baseName, seams, r, c) {
	const g = SPRITES[baseName][0].map(row => row.slice());
	for (const dir of Object.keys(DIRS))    if (seams[dir]) paintEdge(g, dir, seams[dir], r, c);
	for (const key of Object.keys(CORNERS)) if (seams[key]) paintCorner(g, key, seams[key], r, c);
	return g;
}

// このセルに敷く地面スプライトの名前を返す（変種＋継ぎ目）。継ぎ目がある組み合わせは
// その場で絵を作って `SPRITES` に登録する（名前が同じなら絵も同じ∴使い回される）。
// 名前＝`grass@2~n=water.ne=water~3,4`（変種 `@` ／継ぎ目 `~` ／セル座標）。
// ⚠ セル座標を名前に含める理由＝輪郭が世界ドット座標から決まる（線に沿って続く）∴
//   同じ隣接でもセルによって絵が違う。座標を落とすと1枚の絵を使い回して輪郭が切れる。
export function groundSpriteName(stageData, spr, r, c) {
	const base = bgVariantName(spr, r, c);
	const mine = SEAM_PRIORITY[spr];
	// 変種を持たない地面（水・溶岩＝アニメーションする絵）はこの機構の外側。
	if (mine === undefined || !GROUND_VARIANTS[spr]) return base;

	const seams = {};
	for (const [dir, [dr, dc]] of Object.entries(DIRS)) {
		const u = visibleGroundSprite(stageData, r + dr, c + dc);
		if (u && SEAM_PRIORITY[u] > mine) seams[dir] = u;
	}
	for (const [key, [a, b]] of Object.entries(CORNERS)) {
		const u = visibleGroundSprite(stageData, r + DIRS[a][0], c + DIRS[b][1]);
		// 辺で既に同じ地形が食い込んでいる角は、辺の食い込みが埋める∴足さない
		if (u && SEAM_PRIORITY[u] > mine && seams[a] !== u && seams[b] !== u) seams[key] = u;
	}
	const dirs = [...Object.keys(DIRS), ...Object.keys(CORNERS)].filter(d => seams[d]);
	if (!dirs.length) return base;

	const name = `${base}~${dirs.map(d => `${d}=${seams[d]}`).join('.')}~${r},${c}`;
	if (!SPRITES[name]) registerSprite(name, [seamGrid(base, seams, r, c)]);
	return name;
}
