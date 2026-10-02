// ── Blade of Lumia – 壁（WALL・`#`）の絵 ── キュー23 ─────────────────────
//
// 何を描くか：旧＝CSS の単色（`--wall-color`）だけ＝どの部屋でも灰色の無地の四角で、
// 石畳（敷石の絵）の方が壁らしく見えていた（2026-09-20 ユーザー指摘「壁の表示もただの
// グレーの正方形で、他のタイルに比べて表現力が低すぎておかしい」）。
//
// ✅ 見せ方＝**上面＋前面**（2026-10-03 ユーザー選択＝叩き台 B）。斜め上からの見下ろし＝
//    壁の天端（暗い岩の小石）が見え、**南が開いている壁だけ**下側にレンガの前面が立ち上がる。
//    穴（キュー22 の北の縁＝向こう側の壁の面）・空（キュー38 の北の崖の面）と同じ
//    「南を向いた面だけが見える」視点＝並んでも食い違わない（四方に斜面を付ける案 C は
//    北・東・西を向いた面も見せる＝視点が合わない∴採らなかった）。
//
// 🔴 壁は1マスで終わらない（本編 8,024 マスの9割が部屋の外枠）∴穴・空と同じく
//    **天端（全面）＋縁の部品**を重ねる。どれを重ねるかは `shared/cell-appearance.js` の
//    `wallParts()` だけが決める。
//      天端     `wallCap@0..15`  … 128×128 の小石の模様をセル座標で切った 16 枚（隣と繋がる）
//      前面     `wallFaceS@0..3` … 南が開いている時の立ち上がり（レンガ・列で4種＝目地が繋がる）
//      北の縁   `wallEdgeN`      … 天端の向こう端（輪郭＋光）
//      東西の縁 `wallEdgeW`/`wallEdgeE`（南も開いている時は `.s` 付き＝前面の端にも輪郭）
//               … 輪郭＋天端の面取り（西＝光・東＝陰）＝床との境が細い線1本にならない
//
// パレットの番号：1 輪郭（最暗）/ 2 目地・天端の地色 / 3〜5 天端の小石 / 6〜8 前面と縁の明
const N = 32;
const blank = () => Array.from({ length: N }, () => new Array(N).fill(0));
const hash = (x, y, s = 0) => {
	let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
	h = (h ^ (h >>> 13)) * 1274126177 | 0;
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const WALL_CAP_N = 4;           // 天端の模様の周期（セル）＝128 ドット
export const WALL_FACE_H = 13;         // 前面の高さ（ドット）
const PERIOD = WALL_CAP_N * N;

export const WALL_SPRITES = {};

// ── 天端＝不規則な小石（ボロノイ）。種は 8 ドットの格子・周期 128 で閉じる ─────
const G = 8, GP = PERIOD / G;
function cobble(X, Y) {
	const gx = Math.floor(X / G), gy = Math.floor(Y / G);
	let d1 = 1e9, d2 = 1e9, dx1 = 0, dy1 = 0, id = 0;
	for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
		const cx = gx + i, cy = gy + j;
		const wx = ((cx % GP) + GP) % GP, wy = ((cy % GP) + GP) % GP;
		const sx = cx * G + 1 + hash(wx, wy, 40) * (G - 2), sy = cy * G + 1 + hash(wx, wy, 41) * (G - 2);
		const d = Math.hypot(X + 0.5 - sx, Y + 0.5 - sy);
		if (d < d1) { d2 = d1; d1 = d; dx1 = X + 0.5 - sx; dy1 = Y + 0.5 - sy; id = hash(wx, wy, 42); }
		else if (d < d2) d2 = d;
	}
	return { edge: d2 - d1 < 1.1, dx: dx1, dy: dy1, id };
}
function capIdx(X, Y) {
	const k = cobble(X, Y);
	if (k.edge) return 2;
	let v = k.id < 0.5 ? 3 : 4;
	if (k.dx + k.dy < -3.2) v++;          // 左上に光
	else if (k.dx + k.dy > 3.0) v--;      // 右下に陰
	return Math.max(2, Math.min(5, v));
}
for (let r = 0; r < WALL_CAP_N; r++) for (let c = 0; c < WALL_CAP_N; c++) {
	const g = blank();
	for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g[y][x] = capIdx(c * N + x, r * N + y);
	WALL_SPRITES[`wallCap@${r * WALL_CAP_N + c}`] = [g];
}

// ── 前面＝レンガ（1段 4 ドット・長さ 8・段ごとに半分ずらす）──────────────
// along は列 v の分だけずらした座標＝隣の前面と目地が繋がる。
function brick(along, depth) {
	const course = Math.floor(depth / 4);
	const a = along + (course % 2) * 4;
	if (depth % 4 === 3 || a % 8 === 0) return 3;                    // 目地
	let v = 7;
	if (hash(Math.floor(a / 8) % (PERIOD / 8), course, 77) < 0.3) v--;  // 色の違うレンガ
	if (depth % 4 === 2) v++;                                         // 段の上の縁に光
	return Math.min(8, v);
}
for (let v = 0; v < WALL_CAP_N; v++) {
	const g = blank();
	const top = N - WALL_FACE_H;
	for (let x = 0; x < N; x++) {
		g[top - 1][x] = 8;                                             // 天端の縁（光）
		for (let y = top; y < N; y++) {
			const fy = N - 1 - y;                                      // 床からの高さ
			g[y][x] = fy === 0 ? 1 : brick(v * N + x, fy - 1);         // 接地の影
		}
	}
	WALL_SPRITES[`wallFaceS@${v}`] = [g];
}

// ── 縁 ───────────────────────────────────────────────
{
	const g = blank();
	for (let x = 0; x < N; x++) { g[0][x] = 1; g[1][x] = 7; }
	WALL_SPRITES.wallEdgeN = [g];
}
// 西＝輪郭＋光の面取り / 東＝輪郭＋陰の面取り。faceToo＝前面の行にも輪郭だけ引く
function edgeSide(west, faceToo) {
	const g = blank();
	const capRows = faceToo ? N - WALL_FACE_H - 1 : N;
	for (let y = 0; y < N; y++) {
		const at = (i) => (west ? i : N - 1 - i);
		g[y][at(0)] = 1;
		if (y < capRows) {
			g[y][at(1)] = west ? 7 : 2;
			g[y][at(2)] = west ? 6 : (hash(at(2), y, 9) < 0.5 ? 2 : 3);
		}
	}
	return g;
}
WALL_SPRITES.wallEdgeW = [edgeSide(true, false)];
WALL_SPRITES.wallEdgeE = [edgeSide(false, false)];
WALL_SPRITES['wallEdgeW.s'] = [edgeSide(true, true)];
WALL_SPRITES['wallEdgeE.s'] = [edgeSide(false, true)];

export const WALL_PAL = {
	wall: ['transparent', '#0f1417', '#1c2428', '#263034', '#313c41', '#3c494f', '#4a5960', '#5c6d75', '#788a92'],
};
