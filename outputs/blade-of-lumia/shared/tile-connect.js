// ── Blade of Lumia – 連結タイル（隣接で見た目が変わるタイル）─────
// 「単体では良いが、連続して並べると崩れる」タイルを直すための単一の真実。
// エディタ（editor/editor-canvas.js）とゲーム（game/render-board.js）の両方が
// この表と関数を使う＝「エディタとゲームで見た目が違う」を作らない
// （tile-sprites.js の TILE_SPRITE_MAP と同じ方針）。
//
// 考え方：1タイル＝1枚の絵ではなく「敷き詰める本体（base）＋開いた辺だけに
// 足す縁（edge）」に分解する。柱や手すりを絵の中に描き込むと、隣に並べたときに
// 内側にも柱が並んで畑のうねに見える（2026-08-20 ユーザー指摘の橋 `v`）。
//
// 辺の種類は2つある：
//   rail（手すり）… 隣が水/溶岩＝落ちる側。柵を立てるのが自然。
//   trim（木口）  … 隣が陸＝乗り降りできる側。手すりを立てると「渡れない縁」に
//                   見えてしまうので、板の端の陰だけを描く。
//   （隣が同じタイル／画面外＝辺なし。画面外は隣画面へデッキが続くとみなす。
//     ここで縁を描くと、辺スクロールで繋がっている通路が塞がって見える。）

import { TILE } from './tiles.js';
import { connectVariantName } from './sprites-tiles.js';

// 「落ちる」隣＝手すりを立てる相手。tiles 層と bgTiles 層のどちらで水でも同じ。
const FALL_TILES = new Set([TILE.WATER, TILE.LAVA]);

// 連結タイルの部品表。base/edge のスプライト名は shared/sprites-tiles.js にある。
export const CONNECT_TILE_PARTS = {
	[TILE.BRIDGE]: {
		pal: 'bridge',
		// 板の向き：南北に渡る橋は板が東西（deckH）／東西に渡る橋は板が南北（deckV）。
		// 進行方向と板を直交させると「渡る板」に見える。塊（両軸が繋がる）は deckH。
		baseH: 'bridgeDeckH',
		baseV: 'bridgeDeckV',
		rail: { N: 'bridgeRailN', E: 'bridgeRailE', S: 'bridgeRailS', W: 'bridgeRailW' },
		trim: { N: 'bridgeTrimN', E: 'bridgeTrimE', S: 'bridgeTrimS', W: 'bridgeTrimW' },
	},
};

const DIRS = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };
const DIR_ORDER = ['N', 'E', 'S', 'W'];

/**
 * そのセルの「連結タイル」は何か。tiles 層と bgTiles 層のどちらに置かれていても同じ橋。
 * ⚠ 橋は両方の層に置かれる：既存の 870 セルはスクリプトが tiles 層に書いたもの、
 *   エディタのタイルパレットの「橋」は地形（BG_TILES）なので bgTiles 層に書く。
 *   どちらか一方だけを見ると「エディタで置いた橋だけ柱つきの1枚絵」になる（＝畑に戻る）。
 * tiles 層に別の物（宝箱・敵など）が乗っていても、下地が橋ならデッキは続いている扱い
 * ＝隣のセルとの間に縁を描かない。
 * @returns {string|null} 連結タイルの文字。連結タイルでない／画面外なら null
 */
export function connectTileAt(stageData, r, c) {
	const row = stageData?.tiles?.[r];
	if (!row || c < 0 || c >= row.length) return null;
	if (isConnectTile(row[c])) return row[c];
	const bg = stageData.bgTiles?.[`${r},${c}`];
	return isConnectTile(bg) ? bg : null;
}

/**
 * (r,c) を含む同種タイルの連結成分（4近傍・画面内）の外接矩形と代表セルを返す。
 * 板の向きは「セルごと」ではなく「この成分ごと」に決める＝成分の中で向きが
 * 混ざらない（＝継ぎはぎにならない）ことを構造で保証する。
 */
function component(stageData, r, c, tile) {
	const seen = new Set([`${r},${c}`]);
	const stack = [[r, c]];
	let minR = r, maxR = r, minC = c, maxC = c;
	while (stack.length) {
		const [cr, cc] = stack.pop();
		for (const dir of DIR_ORDER) {
			const [dr, dc] = DIRS[dir];
			const nr = cr + dr, nc = cc + dc;
			if (connectTileAt(stageData, nr, nc) !== tile) continue;
			const k = `${nr},${nc}`;
			if (seen.has(k)) continue;
			seen.add(k); stack.push([nr, nc]);
			if (nr < minR) minR = nr;
			if (nr > maxR) maxR = nr;
			if (nc < minC) minC = nc;
			if (nc > maxC) maxC = nc;
		}
	}
	// 代表セル＝成分内で最も北西のセル（どのセルから呼んでも同じ答えになるように）
	let rep = null;
	for (const k of seen) {
		const [rr, cc] = k.split(',').map(Number);
		if (!rep || rr < rep[0] || (rr === rep[0] && cc < rep[1])) rep = [rr, cc];
	}
	return { size: seen.size, h: maxR - minR + 1, w: maxC - minC + 1, rep };
}

/**
 * その軸が「渡っている」軸か＝同種タイルの連続を両端まで辿り、その先の
 * 両方が落ちない（水/溶岩でない）か。橋は落ちる物を跨いで陸と陸を繋ぐので、
 * 端が陸なら「その軸方向に渡っている」＝板をその軸と直交させたい。
 * 画面外は隣画面へデッキが続くとみなす（＝渡っている側として扱う）。
 */
function axisCrosses(stageData, r, c, tile, dr, dc) {
	const tiles = stageData.tiles;
	for (const sign of [1, -1]) {
		let rr = r + dr * sign, cc = c + dc * sign;
		while (connectTileAt(stageData, rr, cc) === tile) {
			rr += dr * sign; cc += dc * sign;
		}
		const row = tiles[rr];
		if (!row || cc < 0 || cc >= row.length) continue;   // 画面外＝続く扱い
		if (FALL_TILES.has(row[cc]) || FALL_TILES.has(stageData.bgTiles?.[`${rr},${cc}`])) return false;
	}
	return true;
}

/** そのタイルが連結タイルか。 */
export function isConnectTile(tile) {
	return Object.prototype.hasOwnProperty.call(CONNECT_TILE_PARTS, tile);
}

/**
 * 連結タイル1セルの描画部品を返す。
 * @param {object} stageData ステージデータ（tiles / bgTiles を持つ）
 * @param {number} r 行
 * @param {number} c 列
 * @param {string} tile そのセルのタイル文字
 * @returns {{pal:string, base:string, sprs:string[], edges:object, edgeCode:string}|null}
 *   base = 本体の向き（'bridgeDeckH'|'bridgeDeckV'）＝変種を剥がした名前
 *   sprs = 下から順に重ねるスプライト名（本体の変種 → N,E,S,W の縁）
 *   edges = { N:'rail'|'trim'|null, ... }／edgeCode = 縁がある方向を並べた文字列
 */
export function connectedTileParts(stageData, r, c, tile) {
	const parts = CONNECT_TILE_PARTS[tile];
	const tiles = stageData?.tiles;
	if (!parts || !tiles) return null;

	const edges = {};
	const linked = {};
	for (const dir of DIR_ORDER) {
		const [dr, dc] = DIRS[dir];
		const nr = r + dr, nc = c + dc;
		const row = tiles[nr];
		// 画面外＝隣画面へ続く扱い（縁を描かない）
		if (!row || nc < 0 || nc >= row.length) { linked[dir] = true; edges[dir] = null; continue; }
		// 隣が同じ連結タイル（層は問わない）＝デッキが続く
		if (connectTileAt(stageData, nr, nc) === tile) { linked[dir] = true; edges[dir] = null; continue; }
		const nt = row[nc];
		const nbg = stageData.bgTiles?.[`${nr},${nc}`];
		linked[dir] = false;
		edges[dir] = (FALL_TILES.has(nt) || FALL_TILES.has(nbg)) ? 'rail' : 'trim';
	}

	// 板の向きは「連結成分ごと」に1つ決める。
	// ⚠ セルごとに「長い方の軸」で決めると、広いデッキの中で草に挟まれた1セルだけ
	//   向きが変わって継ぎはぎに見える（field/8,9 で実際に4セル発生した）。
	//   ∴ 成分の外接矩形で決め、成分の中では必ず同じ向きにする。
	//   細長い成分＝橋の腕だけ渡る方向と直交させ、それ以外（塊・L字など）は
	//   deckH＝1枚の広い床として揃える。
	const comp = component(stageData, r, c, tile);
	let base = parts.baseH;
	if (comp.h <= 2 && comp.w >= 3)      base = parts.baseV;  // 東西に細長い腕 → 板は南北
	else if (comp.w <= 2 && comp.h >= 3) base = parts.baseH;  // 南北に細長い腕 → 板は東西
	else if (comp.h <= 2 && comp.w <= 2) {
		// 2×2 以下の小さな渡しは形では判別できない＝端を見て渡る軸を決める。
		const [rr, cc] = comp.rep;
		if (axisCrosses(stageData, rr, cc, tile, 0, 1) && !axisCrosses(stageData, rr, cc, tile, 1, 0)) {
			base = parts.baseV;
		}
	}
	// 本体はセル座標で変種を選ぶ（板の木口が千鳥になる＝模様の周期が目に見えない）。
	// 向きの判定（base）と変種の選択は別物∴向きは base として別に返す
	// ＝テストや呼び出し側は「どっち向きのデッキか」を変種名から剥がして読める。
	const sprs = [connectVariantName(base, r, c)];
	for (const dir of DIR_ORDER) {
		const kind = edges[dir];
		if (kind) sprs.push(parts[kind][dir]);
	}
	return {
		pal: parts.pal,
		base,
		sprs,
		edges,
		edgeCode: DIR_ORDER.filter(d => edges[d]).join(''),
	};
}
