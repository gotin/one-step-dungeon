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
// 縁の種類は「そのタイルが何なのか」で違う∴部品表がタイルごとに `edge(dir, nb)` を
// 持ち、隣の状況（nb）から縁の種類を返す。共通の機構はここまで＝どの方向を見るか・
// 画面外や層をまたぐ隣の解決・部品名の組み立て。
//   橋   rail（手すり）… 落ちる側＝隣が水/溶岩。加えて「渡る軸が分かっている橋」の
//                        側面（軸に平行な辺）は陸に接していても手すりを通す。
//                        ⚠ 手すりを水際で切ると、陸から踏み出した所に手すりが無い
//                        ＝構造として危険に見える（2026-09-12 ユーザー指摘）。手すりは
//                        成分の端まで通し、木口は「踏み降りる辺」だけに残す。
//        trim（木口）  … 乗り降りできる側＝渡る軸の端。手すりを立てると「渡れない縁」に
//                        見えてしまうので、板の端の陰だけを描く。
//        画面外＝隣画面へデッキが続くとみなす（縁なし）。ここで縁を描くと、辺
//        スクロールで繋がっている通路が塞がって見える。
//        導出できない意図（水の上なのに手すり無し／2枚並べた橋の内側に手すりを立てない）
//        のために「板の向きと手すりの辺を文字で固定する橋」を8種持つ
//        （tiles.js の MANUAL_BRIDGE_SPEC）。手動の橋は名指しした辺に必ず手すりを立て、
//        それ以外の辺は木口（隣が橋族・画面外なら縁なし）。
//   家   軒の影／笠石／土台／隅石（外壁）・棟／軒／破風（屋根）。
//        画面外は**縁を描く**＝家は跨いで続かない（実測：境界に接する家は単独の1セル
//        だけで、隣画面に続く棟は無い）。橋と逆なので方向ごとの規則をタイルに持たせる。
//   柵   橋・家と違い「本体そのものの向き」が隣接で変わる（横棒／縦の柱／L字の角／
//        単独の柱）∴縁の加算だけでは表現できない＝`baseFrom(nbAll)` で本体名を
//        セルごとに決める（橋の「成分の外接矩形」は角では機能しないので使わない）。
//        縁（cap）は「本体の軸のうち開いた側だけ」に立てる端の柱。
//        ⚠ 柵は不透明ではない（`opaque:false`）＝上下左右に隙間があり、下の地面
//        （bgTiles）が見える絵。描画側（render-board.js）はこのフラグを見て、
//        橋・家のように下地を消して単色で塗りつぶす処理を skip する。

import { TILE, MANUAL_BRIDGE_SPEC, BRIDGE_KIN } from './tiles.js';
import { connectVariantName, tileHash } from './sprites-tiles.js';

// 「落ちる」隣＝手すりを立てる相手。tiles 層と bgTiles 層のどちらで水でも同じ。
const FALL_TILES = new Set([TILE.WATER, TILE.LAVA]);

// 家＝外壁・ドア・屋根の3タイルで1つの建物（kin）。互いの間には縁を描かない
// （壁とドアの間に隅石が立つと1枚の壁に見えない）。ただし壁の北に屋根が来たときは
// 「軒の影」を描く＝kin でも縁が要る∴kin は edge() の中で使う判断材料に留める。
const HOUSE_KIN = new Set([TILE.HOUSE_WALL, TILE.HOUSE_DOOR, TILE.HOUSE_ROOF]);

// 連結タイルの部品表。base/edge のスプライト名は shared/sprites-tiles.js にある。
export const CONNECT_TILE_PARTS = {
	[TILE.BRIDGE]: {
		pal: 'bridge',
		// 板の向き：南北に渡る橋は板が東西（deckH）／東西に渡る橋は板が南北（deckV）。
		// 進行方向と板を直交させると「渡る板」に見える。塊（両軸が繋がる）は deckH。
		baseH: 'bridgeDeckH',
		baseV: 'bridgeDeckV',
		// ctx.span＝この成分が渡っている軸（'NS'|'EW'）。分かっているときは軸に平行な
		// 側面には陸でも手すりを通す（水際で手すりが切れないように）。塊のデッキは
		// span が無い＝陸に面した辺は木口のまま（広い床の周りに柵が回らない）。
		edge: (dir, nb, tile, nbAll, ctx) => {
			if (nb.offscreen || BRIDGE_KIN.has(nb.tile)) return null;
			if (nb.falls) return 'rail';
			if (ctx?.span) {
				const isEnd = ctx.span === 'NS' ? (dir === 'N' || dir === 'S') : (dir === 'E' || dir === 'W');
				if (!isEnd) return 'rail';
			}
			return 'trim';
		},
		rail: { N: 'bridgeRailN', E: 'bridgeRailE', S: 'bridgeRailS', W: 'bridgeRailW' },
		trim: { N: 'bridgeTrimN', E: 'bridgeTrimE', S: 'bridgeTrimS', W: 'bridgeTrimW' },
		layer: ['N', 'S', 'E', 'W'],   // 角は縦（東西）の手すりが手前
	},
	// 外壁＝石積み。北が屋根なら軒の影・北が外なら笠石（天端）・南が外なら土台・
	// 東西が外なら隅石。1セルだけの壁は四辺に縁が付く＝実マップには孤立した `h`（岩/柱）が
	// 10 箇所、屋根1枚の下に壁1枚だけの幅1の小屋が 9 箇所ある（tests/house-connect.spec.js ㉑）。
	[TILE.HOUSE_WALL]: {
		pal: 'houseWall',
		base: 'houseWallBase',
		edge: (dir, nb) => {
			const kin = HOUSE_KIN.has(nb.tile);
			if (dir === 'N') return nb.tile === TILE.HOUSE_ROOF ? 'eave' : kin ? null : 'cap';
			if (dir === 'S') return kin ? null : 'foot';
			return kin ? null : 'quoin';
		},
		eave:  { N: 'houseWallEaveN' },
		cap:   { N: 'houseWallCapN' },
		foot:  { S: 'houseWallFootS' },
		quoin: { E: 'houseWallQuoinE', W: 'houseWallQuoinW' },
		// 笠石・土台・軒の影は角まで通す＝横（南北）の帯を隅石より後に重ねる。
		layer: ['E', 'W', 'N', 'S'],
		// 窓は「軒の下（北が屋根）の壁」にだけ、しかも 1/3 のセルにだけ足す。
		// 全セルに描くと窓が等間隔に並んで「窓の帯」になる（旧 8×8 の失敗）。
		// 決定的（座標のハッシュ）＝同じ家はいつ見ても同じ窓の並び。
		extra: (r, c, edges) =>
			(edges.N === 'eave' && tileHash(Math.floor(r), Math.floor(c)) % 3 === 0
				? ['houseWallWindow'] : []),
	},
	// 屋根＝瓦。隣が屋根でなければ、北は棟・南は軒・東西は破風で切る。
	// 実測では屋根は必ず1行∴北は棟・南は軒（下は壁）になる。
	[TILE.HOUSE_ROOF]: {
		pal: 'houseRoof',
		base: 'houseRoofBase',
		edge: (dir, nb) => (nb.tile === TILE.HOUSE_ROOF ? null
			: dir === 'N' ? 'ridge' : dir === 'S' ? 'eave' : 'gable'),
		ridge: { N: 'houseRoofRidgeN' },
		eave:  { S: 'houseRoofEaveS' },
		gable: { E: 'houseRoofGableE', W: 'houseRoofGableW' },
		// 破風板は棟瓦・軒先の小口を覆う＝縦（東西）の板を後に重ねる。
		layer: ['N', 'S', 'E', 'W'],
	},
	// ドア＝石の開口に板戸。絵の中に石枠を持つ（左右は必ず壁）∴縁は無い。
	// 連結タイルにするのは「壁と同じ 32 ドットの密度で描く」ため。
	[TILE.HOUSE_DOOR]: {
		pal: 'houseDoor',
		base: 'houseDoorBase',
		edge: () => null,
	},
	// 柵＝横棒（横に連続）／柱（縦に連続）／角（両方に連続）／単独の柱、の4パターン。
	// 実マップ（54セル）に4種すべて実在する＝矩形の囲い（角4）・直線（横棒/柱）・
	// 単独の柵（孤立）。opaque:false＝隙間から地面が見える（他の連結タイルと違い
	// 「セルを埋めない絵」＝10a-1c の obj-sprite 系と同じ見た目の約束）。
	[TILE.FENCE]: {
		pal: 'fence',
		opaque: false,
		baseFrom: (nbAll, tile) => {
			const kinH = nbAll.E.tile === tile || nbAll.W.tile === tile;
			const kinV = nbAll.N.tile === tile || nbAll.S.tile === tile;
			if (kinH && kinV) {
				// 角＝続いている縦横それぞれ1方向の頭文字を組んだ名前
				// （例：南と東に続く＝左上の角＝'fenceCornerSE'）。
				const vDir = nbAll.N.tile === tile ? 'N' : 'S';
				const hDir = nbAll.E.tile === tile ? 'E' : 'W';
				return `fenceCorner${vDir}${hDir}`;
			}
			if (kinH) return 'fenceRailH';
			if (kinV) return 'fenceRailV';
			return 'fencePost';   // どちらにも続かない＝孤立した単独の柵
		},
		// 端の柱（cap）は「本体の軸のうち開いている側」にだけ立てる。
		// 角・単独は自分の絵の中で既に閉じている（縁は要らない＝edge は null のまま）。
		edge: (dir, nb, tile, nbAll) => {
			const kinH = nbAll.E.tile === tile || nbAll.W.tile === tile;
			const kinV = nbAll.N.tile === tile || nbAll.S.tile === tile;
			if (nb.tile === tile) return null;             // 続く側には縁を立てない
			if (kinH && !kinV && (dir === 'E' || dir === 'W')) return 'cap';
			if (kinV && !kinH && (dir === 'N' || dir === 'S')) return 'cap';
			return null;
		},
		cap: { N: 'fenceCapN', E: 'fenceCapE', S: 'fenceCapS', W: 'fenceCapW' },
		layer: ['N', 'S', 'E', 'W'],
	},
};

// 手すりを手で決める橋 8種。導出（'v'）と違い、板の向きも手すりの辺も文字で決まる
// ＝作者が意図した通りに出る（＝逆に、置き間違えると手すりが途切れて見える）。
// 新しい絵は要らない：本体は 'v' と同じ bridgeDeckH/V、縁も同じ rail/trim を組み替えるだけ。
for (const [tile, spec] of Object.entries(MANUAL_BRIDGE_SPEC)) {
	const rails = new Set(spec.rails);
	CONNECT_TILE_PARTS[tile] = {
		pal: 'bridge',
		base: spec.deck === 'H' ? 'bridgeDeckH' : 'bridgeDeckV',
		// 名指しした辺は隣が何であれ手すり（画面外・隣の橋でも立てる＝2枚並べた橋の
		// 内側だけ手すりを消す、といった指定が効く）。それ以外の辺は木口で切る。
		edge: (dir, nb) => {
			if (rails.has(dir)) return 'rail';
			if (nb.offscreen || BRIDGE_KIN.has(nb.tile)) return null;
			return 'trim';
		},
		rail: { N: 'bridgeRailN', E: 'bridgeRailE', S: 'bridgeRailS', W: 'bridgeRailW' },
		trim: { N: 'bridgeTrimN', E: 'bridgeTrimE', S: 'bridgeTrimS', W: 'bridgeTrimW' },
		layer: ['N', 'S', 'E', 'W'],
	};
}

/**
 * パレットのボタンなど「隣が無い場所」で1枚絵として見せるときの部品。
 * 隣接から導かれる縁（木口・落ちる側の手すり）は描かず、**そのタイル文字が固定で
 * 持っている意図だけ**を描く＝手動の橋は名指しした手すりを含める。
 * ⚠ これが無いと8種すべて同じ板の絵になり、パレットで見分けが付かない
 *   （2026-09-12 ユーザー指摘＝「パッと見で判断つかなくて操作しづらい」）。
 * @returns {{pal:string, sprs:string[]}|null} 固定の意図を持たないタイルは null
 *   （呼び出し側は従来どおり TILE_SPRITE_MAP の1枚絵にフォールバックする）
 */
export function connectTileIconSprites(tile) {
	const spec = MANUAL_BRIDGE_SPEC[tile];
	if (!spec) return null;
	const parts = CONNECT_TILE_PARTS[tile];
	const rails = new Set(spec.rails);
	return {
		pal: parts.pal,
		sprs: [parts.base, ...layerOrder(parts).filter(d => rails.has(d)).map(d => parts.rail[d])],
	};
}

const DIRS = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };
const DIR_ORDER = ['N', 'E', 'S', 'W'];   // 辺を見る順＝edgeCode の並び（時計回り）
// 縁を重ねる順は辺を見る順とは別物。DIR_ORDER のまま重ねると N,E,S,W ＝ 東の縁だけが
// 南の帯に上塗りされ、西の縁は南の帯を上塗りする＝左右で角の見え方が違う（実測で発覚）。
// ∴どちらの帯を手前にするかはタイルごとに決める（部品表の `layer`）。
const layerOrder = parts => parts.layer ?? DIR_ORDER;

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
	const rows = stageData.rows ?? stageData.tiles.length;
	const cols = stageData.cols ?? stageData.tiles[0].length;
	return {
		size: seen.size, h: maxR - minR + 1, w: maxC - minC + 1, rep,
		// 画面端に接しているか＝その方向へデッキが隣画面へ続く＝渡る軸の手がかり。
		// 2×2 以下では形から軸が読めないので、これで決める（軸の端を辿る axisCrosses は
		// 島の角タイル 'q/j/y/z' を陸と読んで「両軸とも渡っている」と誤答した）。
		touchV: minR === 0 || maxR === rows - 1,
		touchH: minC === 0 || maxC === cols - 1,
	};
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
 * 隣のセルの状況を1つの値にまとめる（縁の種類を決める材料）。
 * @returns {{offscreen:boolean, tile:string|null, falls:boolean}}
 *   tile  = 隣の「効いているタイル」＝連結タイルなら層を問わずその文字、そうでなければ
 *           tiles 層の文字。画面外は null。
 *   falls = 隣が水/溶岩（tiles 層・bgTiles 層のどちらでも）＝落ちる側
 */
function neighborInfo(stageData, r, c, dir) {
	const [dr, dc] = DIRS[dir];
	const nr = r + dr, nc = c + dc;
	const row = stageData.tiles?.[nr];
	if (!row || nc < 0 || nc >= row.length) return { offscreen: true, tile: null, falls: false };
	const nbg = stageData.bgTiles?.[`${nr},${nc}`];
	return {
		offscreen: false,
		tile: connectTileAt(stageData, nr, nc) ?? row[nc],
		falls: FALL_TILES.has(row[nc]) || FALL_TILES.has(nbg),
	};
}

/**
 * 連結タイル1セルの描画部品を返す。
 * @param {object} stageData ステージデータ（tiles / bgTiles を持つ）
 * @param {number} r 行
 * @param {number} c 列
 * @param {string} tile そのセルのタイル文字
 * @returns {{pal:string, base:string, sprs:string[], edges:object, edgeCode:string, opaque:boolean}|null}
 *   base = 本体の名前（橋は板の向き 'bridgeDeckH'|'bridgeDeckV'）＝変種を剥がした名前
 *   sprs = 下から順に重ねるスプライト名（本体の変種 → 縁（部品表の layer 順）→ 追加の部品）
 *   edges = { N:'rail'|'trim'|'eave'|…|null, ... }／edgeCode = 縁がある方向を並べた文字列
 *   opaque = false なら描画側は下地（bgTiles）を消さない＝柵のように隙間から地面が
 *            見える連結タイル用（既定 true＝橋・家と同じ「下地を覆う」扱い）
 */
export function connectedTileParts(stageData, r, c, tile) {
	const parts = CONNECT_TILE_PARTS[tile];
	const tiles = stageData?.tiles;
	if (!parts || !tiles) return null;

	// 4方向の隣接状況をまとめて計算する（edge() と baseFrom() の両方が使う）。
	const nbAll = {};
	for (const dir of DIR_ORDER) nbAll[dir] = neighborInfo(stageData, r, c, dir);

	// 本体の向き。家のように向きが1つしかない部品表は `base` をそのまま使う。
	// 橋は「連結成分ごと」に1つ決める。柵は `baseFrom`＝セルごとに4方向の隣接だけで決める
	// （橋の「成分の外接矩形」は柵の L字の角では機能しない∴別の方式を持つ）。
	// ⚠ セルごとに「長い方の軸」で決めると、広いデッキの中で草に挟まれた1セルだけ
	//   向きが変わって継ぎはぎに見える（field/8,9 で実際に4セル発生した）。
	//   ∴ 成分の外接矩形で決め、成分の中では必ず同じ向きにする。
	//   細長い成分＝橋の腕だけ渡る方向と直交させ、それ以外（塊・L字など）は
	//   deckH＝1枚の広い床として揃える。
	let base = parts.base;
	// span＝この成分が渡っている軸。手すりを「陸に乗ったセルまで」通すかの判断に使う
	// （腕＝渡る軸がある成分だけ。塊は null＝広い床の周りに柵を回さない）。
	let span = null;
	if (!base && parts.baseFrom) {
		base = parts.baseFrom(nbAll, tile);
	} else if (!base) {
		const comp = component(stageData, r, c, tile);
		base = parts.baseH;
		if (comp.h <= 2 && comp.w >= 3)      base = parts.baseV;  // 東西に細長い腕 → 板は南北
		else if (comp.w <= 2 && comp.h >= 3) base = parts.baseH;  // 南北に細長い腕 → 板は東西
		else if (comp.h <= 2 && comp.w <= 2) {
			// 2×2 以下の小さな渡しは形では判別できない＝まず画面端に接する軸を見る
			// （その方向へデッキが隣画面へ続く）。どちらでもなければ軸の端を辿る。
			if (comp.touchH && !comp.touchV) base = parts.baseV;
			else if (comp.touchV && !comp.touchH) base = parts.baseH;
			else {
				const [rr, cc] = comp.rep;
				if (axisCrosses(stageData, rr, cc, tile, 0, 1) && !axisCrosses(stageData, rr, cc, tile, 1, 0)) {
					base = parts.baseV;
				}
			}
		}
		// 渡る軸として扱うのは「腕」だけ＝両軸とも3以上の塊は除く。さらに軸方向に
		// 3セル以上あるか画面端に達しているものに限る（1×1・2×1 の単独の渡しに柵を
		// 回すと落とし穴の上の板が「囲われた箱」になる＝ダンジョンの板が別物に見える）。
		if (!(comp.h >= 3 && comp.w >= 3)) {
			const crossLen = base === parts.baseH ? comp.h : comp.w;
			const touchCross = base === parts.baseH ? comp.touchV : comp.touchH;
			if (crossLen >= 3 || touchCross) span = base === parts.baseH ? 'NS' : 'EW';
		}
	}

	// 縁の種類はタイルごとの規則（parts.edge）に任せる＝橋の rail/trim と家の
	// 軒/笠石/隅石を同じ機構で扱う。画面外の扱いも規則の中で決まる。
	// 4引目に nbAll を渡す＝柵のように「4方向の続き具合」で自分の縁を決めるタイル用。
	// 5引目 ctx は幾何から分かった文脈（橋の渡る軸 span）＝本体の向きより後に決まるので
	// base の決定より後で呼ぶ。
	const edges = {};
	for (const dir of DIR_ORDER) {
		edges[dir] = parts.edge(dir, nbAll[dir], tile, nbAll, { span }) ?? null;
	}

	// 本体はセル座標で変種を選ぶ（板の木口・石の風化が隣のセルと違う＝模様の周期が
	// 目に見えない）。向きの判定（base）と変種の選択は別物∴向きは base として別に返す
	// ＝テストや呼び出し側は「どっち向きのデッキか」を変種名から剥がして読める。
	const sprs = [connectVariantName(base, r, c)];
	for (const dir of layerOrder(parts)) {
		const kind = edges[dir];
		if (!kind) continue;
		const name = parts[kind]?.[dir];
		if (name) sprs.push(name);
	}
	// 幾何から決まる追加の部品（家の窓）。縁ではないので edgeCode には出ない。
	if (parts.extra) sprs.push(...parts.extra(r, c, edges));
	return {
		pal: parts.pal,
		base,
		sprs,
		edges,
		edgeCode: DIR_ORDER.filter(d => edges[d]).join(''),
		opaque: parts.opaque !== false,
	};
}
