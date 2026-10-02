// ── Blade of Lumia – 穴（PIT・`x`）の絵 ── キュー22 ─────────────────────
//
// 何を描くか：穴は「床に開いた、はしごで1マス渡れる暗い穴」。旧＝どの地形でも同じ
// 黒い丸（CSS の放射グラデーション）で、草地に開けても石畳に開けても同じ黒い四角に
// 見えた（2026-09-20 ユーザー指摘「まわりの背景タイルに合わせた穴に見える表現にしたい」
// ＝「草地、床、砂地、雪原、とかにあわせた穴をつくって、まわりに合わせて配置する」）。
//
// 🔴 タイル文字は増やさない（`x` 1文字のまま）。肌（どの地形の穴か）は下地から導く
//    ＝`shared/tile-skins.js` の `pitSkinAt()`。この表は絵だけを持つ。
// 🔴 穴は1マスで終わらない（実測＝309 マス中 269 マスが隣の穴と繋がった裂け目）∴
//    1マスで完結した絵にせず、**底（全面）＋縁の部品**を重ねる＝空（`skyParts`）と同じ形。
//    隣が穴でない辺にだけ縁を描く＝繋がった穴は1つの大きな裂け目に見える。
//    どの部品を重ねるかは `shared/cell-appearance.js` の `pitParts()` だけが決める。
//      底       `pitBody@0..3`   … 暗い底（セル座標で4種＝点の並びが揃わない）
//      北の縁   `pitLipN.<質>@0/1` … 向こう側の壁の面（地面の縁＋地層／石積み／氷）＝穴の深さが読める
//      南の縁   `pitRimS`        … 手前の縁（地面が少しだけ見える）
//      東西の縁 `pitRimW`/`pitRimE` … 地面の縁＋内側への落ち影
//      角の欠け `pitNubNW` 等     … 縦横は穴なのに斜めだけ地面＝角に残った地面の欠片
// 🔴 空（`%`）と描き分ける＝空は「はるか下の海と雲」＋灰色の岩の帯。穴は底が真っ暗で、
//    縁は**その地形の地面の色**（草・砂・雪…）＝「渡れない空」と読み違えない。
//
// パレットの番号（全部の肌で共通の意味＝絵は1つ・色だけ肌ごと）：
//   1 底の点 / 2 底（drawConnectTile がセルの地色に使う＝必ず底の色）
//   3 地面の縁の明 / 4 地面 / 5 地面の縁の下（暗）
//   6〜9 壁の面（明→暗） / 10 差し色（草の葉先・雪の白・燠火…）
//   11〜14 落ち影（濃→薄）
import { skinName } from './tile-skins.js';

const N = 32;
const blank = () => Array.from({ length: N }, () => new Array(N).fill(0));
// 決定的な疑似乱数（座標から）＝実行ごとに絵が揺れない
const hash = (x, y, s = 0) => {
	let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
	h = (h ^ (h >>> 13)) * 1274126177 | 0;
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const SH = [11, 12, 13, 14];

// 肌 → 壁の面の質（北の縁の描き方）。soil＝地層と小石 / block＝石積み / ice＝氷の筋
export const PIT_SKIN_STYLE = {
	grass: 'soil', sand: 'soil', ash: 'soil', mud: 'soil',
	snow: 'ice', stone: 'block', floor: 'block',
};
export const PIT_SKINS = Object.keys(PIT_SKIN_STYLE);
export const PIT_BODY_N = 4;

export const PIT_SPRITES = {};

// ── 底 ──────────────────────────────────────────────
for (let v = 0; v < PIT_BODY_N; v++) {
	const g = blank();
	for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
		g[y][x] = hash(x, y, v + 11) < 0.035 ? 1 : 2;
	}
	PIT_SPRITES[`pitBody@${v}`] = [g];
}

// ── 北の縁（向こう側の壁の面）────────────────────────
// 地面の縁（高さ rim）→ 壁の面（高さ face）→ ぎざぎざの下端 → 底へ落ちる影。
// 2 ドットごとに高さを変える＝崩れた縁。変種2つ（列の偶奇）で隣と同じ形が並ばない。
const RIM_D  = [[3, 2, 3, 3, 2, 2, 3, 2, 3, 3, 2, 3, 2, 2, 3, 3], [2, 3, 3, 2, 3, 2, 2, 3, 3, 2, 3, 3, 2, 3, 2, 2]];
const FACE_D = [[10, 11, 12, 11, 10, 9, 10, 12, 13, 12, 11, 10, 11, 12, 11, 10], [12, 11, 10, 10, 11, 13, 12, 11, 10, 9, 10, 11, 12, 11, 12, 11]];
function lipN(style, v) {
	const g = blank();
	for (let x = 0; x < N; x++) {
		const rim = RIM_D[v][x >> 1];
		const face = FACE_D[v][x >> 1] + (hash(x, 0, v + 3) < 0.3 ? 1 : 0);
		const bottom = rim + face;
		for (let y = 0; y < rim; y++) {
			// 地面の縁：上端は明るく、下端（せり出しの裏）は暗い。草は葉先が垂れる
			g[y][x] = y === rim - 1 ? 5 : (y === 0 && hash(x, y, v) < 0.6 ? 3 : 4);
		}
		if (style !== 'block' && hash(x, 1, v + 7) < 0.22) g[rim][x] = 10;   // 縁から垂れる差し色（葉先・雪・燠火）
		for (let y = rim + (g[rim][x] === 10 ? 1 : 0); y < bottom; y++) {
			const t = (y - rim) / face;   // 0＝上 → 1＝下
			let col = t < 0.25 ? 6 : t < 0.55 ? 7 : t < 0.85 ? 8 : 9;
			if (style === 'soil') {
				if ((y - rim) % 4 === 3 && hash(x, y, v + 5) < 0.7) col = Math.min(9, col + 1);   // 地層の筋
				if (hash(x, y, v + 9) < 0.06) col = 6;                                              // 小石
			} else if (style === 'block') {
				const course = Math.floor((y - rim) / 4);
				const off = course % 2 ? 4 : 0;
				if ((y - rim) % 4 === 3 || (x + off) % 8 === 7) col = 9;                           // 目地
				else if ((y - rim) % 4 === 0 && col < 8) col = Math.max(6, col - 1);               // 石の上面の明るみ
			} else if (style === 'ice') {
				if ((x + (v ? 3 : 0)) % 5 === 0 && t < 0.8) col = Math.max(6, col - 1);            // 氷の縦筋
				if (hash(x, y, v + 13) < 0.05) col = 10;                                            // 光る氷の粒
			}
			g[y][x] = col;
		}
		// 下端のぎざぎざ（底と混ざる）＋落ち影
		if (bottom < N && hash(x, bottom, v) < 0.5) g[bottom][x] = 9;
		for (let i = 0; i < SH.length; i++) {
			const y = bottom + 1 + i;
			if (y < N) g[y][x] = SH[i];
		}
	}
	return g;
}
for (const style of ['soil', 'block', 'ice']) {
	for (let v = 0; v < 2; v++) PIT_SPRITES[`pitLipN.${style}@${v}`] = [lipN(style, v)];
}

// ── 南の縁（手前の縁）＝地面が下端に少しだけ見える ─────────────
{
	const g = blank();
	const D = [3, 2, 3, 4, 3, 2, 2, 3, 4, 3, 3, 2, 3, 3, 4, 3];
	for (let x = 0; x < N; x++) {
		const d = D[x >> 1];
		for (let y = N - d; y < N; y++) g[y][x] = y === N - d ? 3 : (hash(x, y, 21) < 0.2 ? 5 : 4);
	}
	PIT_SPRITES.pitRimS = [g];
}

// ── 東西の縁＝地面の縁（幅 2〜3）＋暗い縁＋内側へ落ちる影 ───────────
function rimSide(fromLeft) {
	const g = blank();
	const D = [2, 3, 2, 2, 3, 3, 2, 3, 2, 2, 3, 2, 3, 3, 2, 2];
	for (let y = 0; y < N; y++) {
		const d = D[y >> 1];
		for (let i = 0; i < d + 1 + SH.length; i++) {
			const x = fromLeft ? i : N - 1 - i;
			g[y][x] = i < d ? (i === 0 ? 4 : (hash(x, y, 31) < 0.3 ? 3 : 4))
				: i === d ? 5
					: SH[i - d - 1];
		}
	}
	return g;
}
PIT_SPRITES.pitRimW = [rimSide(true)];
PIT_SPRITES.pitRimE = [rimSide(false)];

// ── 角の欠け（縦横は穴・斜めだけ地面）＝角に残った地面の小さな欠片 ──────
function nub(top, left) {
	const g = blank();
	for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
		if (i + j > 3) continue;
		const y = top ? i : N - 1 - i, x = left ? j : N - 1 - j;
		g[y][x] = i + j === 3 ? 5 : (i + j === 0 ? 3 : 4);
	}
	return g;
}
PIT_SPRITES.pitNubNW = [nub(true, true)];
PIT_SPRITES.pitNubNE = [nub(true, false)];
PIT_SPRITES.pitNubSW = [nub(false, true)];
PIT_SPRITES.pitNubSE = [nub(false, false)];

// ── 外角の丸め（縦横の2辺とも穴でない角）＝地面で角を丸く埋める ─────────
// 縁を直角に組むと孤立した穴が「黒い四角」に見える（旧の不満そのもの）∴角を地面で削る。
const ROUND_R = 7;
function corner(top, left) {
	const g = blank();
	for (let i = 0; i < ROUND_R; i++) for (let j = 0; j < ROUND_R; j++) {
		const d = Math.hypot(ROUND_R - 0.5 - i, ROUND_R - 0.5 - j);
		if (d <= ROUND_R - 0.5) continue;       // 円の内側＝穴のまま
		const y = top ? i : N - 1 - i, x = left ? j : N - 1 - j;
		g[y][x] = d <= ROUND_R + 0.6 ? 5 : 4;   // 円周＝縁の暗色・外＝地面
	}
	return g;
}
PIT_SPRITES.pitCornerNW = [corner(true, true)];
PIT_SPRITES.pitCornerNE = [corner(true, false)];
PIT_SPRITES.pitCornerSW = [corner(false, true)];
PIT_SPRITES.pitCornerSE = [corner(false, false)];

// ── 肌ごとのパレット ─────────────────────────────────
// 地面の3色（3 明／4 地面／5 暗）は各地面の絵のパレット（sprites-tiles.js の TILE_PAL の
// [3]/[2]/[1]）をそのまま使う＝縁が周りの地面と同じ色で、穴の周りに額縁が出ない。
const SHADOW = ['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.38)', 'rgba(0,0,0,0.22)', 'rgba(0,0,0,0.10)'];
const P = (speck, base, g3, g4, g5, f6, f7, f8, f9, accent) =>
	['transparent', speck, base, g3, g4, g5, f6, f7, f8, f9, accent, ...SHADOW];
export const PIT_PAL = {
	// 草地＝茶色い土の壁・緑の縁から葉先が垂れる
	[skinName('pit', 'grass')]: P('#1a140e', '#0c0a07', '#4a8038', '#427830', '#3a7028', '#7a5a34', '#5e4428', '#43301c', '#2a1e12', '#6aa040'),
	// 砂地＝砂岩の地層
	[skinName('pit', 'sand')]:  P('#22180c', '#110c06', '#d0b058', '#c8a84a', '#bc9c42', '#b08a48', '#906c34', '#6c5026', '#45321a', '#e8d088'),
	// 雪原＝雪の縁・青い氷の壁
	[skinName('pit', 'snow')]:  P('#121a28', '#070a10', '#b8d4e0', '#b0ccd8', '#9ec0d0', '#86a2b8', '#617a90', '#41566a', '#27333f', '#ffffff'),
	// 火山灰＝玄武岩の壁に燠火の赤
	[skinName('pit', 'ash')]:   P('#2a0e08', '#0a0605', '#705040', '#503828', '#2a1810', '#5a4038', '#3e2a24', '#2a1a16', '#180e0a', '#c0502a'),
	// 泥／沼＝泥炭の壁・苔の縁
	[skinName('pit', 'mud')]:   P('#141a0c', '#080a05', '#4a6030', '#384a24', '#30401e', '#4a3e26', '#38301c', '#282214', '#18140c', '#7a9a50'),
	// 石畳＝石積みの壁
	[skinName('pit', 'stone')]: P('#14141e', '#07070c', '#7a7888', '#5a5868', '#3a3848', '#6a6878', '#504e5e', '#3a3848', '#242232', '#c0c0cc'),
	// ダンジョンの床（#1a2228＝絵の無い平色）＝縁の地面は床そのもの・縁の明だけ一段上げて輪郭を読ませる
	[skinName('pit', 'floor')]: P('#0c1014', '#020304', '#2e3c44', '#1a2228', '#10161a', '#4c5a62', '#38444c', '#273038', '#161c21', '#607682'),
};
