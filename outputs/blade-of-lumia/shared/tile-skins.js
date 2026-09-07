// ── tile-skins.js ── 同じタイルの絵を「下地（bgTiles）」から選び分ける ──────
// キュー10番 10a-1d（山）・10a-5（木・茂み）。山 `'M'` は世界中で同じ絵（雪冠つきの
// 高山）だったので、南西の砂漠にも溶岩地帯にも雪原にも「同じ雪山」が立っていた。
// 木 `'t'`・茂み `'u'` も同じ穴だった＝火山灰の上に瑞々しい緑の木が 30 本立つ画面
// （`field 12,2`）・雪原に夏の木が 34 本立つ画面（`field 13,5`）が実在した（10a-5 の実測）。
//
// 🔴 タイルは増やさない（`TILE.ROCK` を作らない）。
//    機構は完全に同じ（通行不可）でタイルを増やすとマップデータの書き換えになり、
//    データ／エンジン／セーブ／エディタ／検査の5層＋接続指標（GATE_TILES）に波及する。
//    下地は既に地域ごとに正しく塗られている∴**絵だけを下地から導出する**＝マップ変更 0。
//
// 🔴 導出の単位は「セル」ではなく「山の連結成分（塊）」＝橋の板の向きと同型。
//    自分のセルの下地だけで決めると、地域の境目にある一つづきの山脈の中で肌が
//    混ざる（実測＝砂漠の中に雪冠 29 セル・森の中に砂の山 35 セルなど）。
//    塊に触れている下地の最多で決める＝一つづきの山は必ず一つの肌になる。
import { TILE } from './tiles.js';

// 肌の一覧（順序＝票が同数のときの決着順。決定的にするため固定する）
export const MOUNTAIN_SKINS = ['alpine', 'volcanic', 'snowy', 'mesa', 'rocky'];

// 下地 → 山の肌。ここが唯一の対応表（ゲームもエディタも検証スクリプトもここを読む）。
export const GROUND_TO_MOUNTAIN_SKIN = {
	[TILE.GRASS]: 'alpine',    // 草地・森＝岩肌＋雪冠（従来の絵）
	[TILE.ASH]:   'volcanic',  // 火山灰＝黒い溶岩の岩・雪なし
	[TILE.SNOW]:  'snowy',     // 雪原＝雪線が裾まで下りた雪山
	[TILE.SAND]:  'mesa',      // 砂＝砂岩のメサ（背が低く平らな頂・雪なし）
	[TILE.MUD]:   'rocky',     // 泥／沼＝低い苔むした岩山・雪なし
};

// 下地が地面でない（床・石畳・未設定）塊の肌。画面ごとの最多の地面 → これ。
export const MOUNTAIN_SKIN_DEFAULT = 'alpine';

// ── 植生（木 `'t'`・茂み `'u'`）の肌（10a-5）───────────────────────────
// 🔴 導出の単位は**セル**＝山（塊）と違う。木・茂みは1セルに1本ずつ立つ別個の個体で、
//    一つづきの岩体ではない∴森が雪線を跨げば「雪の木と夏の木が混ざる」のが正しい姿。
//    塊で多数決すると、雪原に食い込んだ森の先端まで夏の木になる（山とは逆に嘘になる）。
// 🔴 木と茂みは同じ表を共有する（同じ下地なら同じ地域＝植生の系統も同じ）。
//    絵は肌ごとに**形から作り直す**（色の差し替えではない）＝`shared/sprites-tiles.js`。
export const VEG_SKINS = ['leafy', 'snowy', 'charred', 'arid', 'swamp'];
export const GROUND_TO_VEG_SKIN = {
	[TILE.GRASS]: 'leafy',    // 草地・森＝広葉樹／緑の低木（従来の絵）
	[TILE.SNOW]:  'snowy',    // 雪原＝雪の乗った段状の針葉樹／雪をかぶった低木
	[TILE.ASH]:   'charred',  // 火山灰＝葉の落ちた焼け木／焼け残りの枝
	[TILE.SAND]:  'arid',     // 砂＝椰子／乾いた棘の藪
	[TILE.MUD]:   'swamp',    // 泥／沼＝垂れた樹冠と支柱根／葦の株
};
// 下地が地面でない（水の上・石畳・未設定）ときの肌。画面ごとの最多の地面 → これ。
export const VEG_SKIN_DEFAULT = 'leafy';

// 肌つきのスプライト名／パレット名。`mountain@snowy` のように基本名から導く
// （`bgVariantName` の `grass@0` と同じ書式＝変種の名前の付け方を1つに保つ）。
export const skinName = (base, skin) => `${base}@${skin}`;

const posKey = (r, c) => `${r},${c}`;

// 肌の表を持つ下地（＝地面）の一覧。同数のときの決着順もこれ＝実行ごとに揺れない。
// ⚠ 順序は MOUNTAIN_SKINS（alpine/volcanic/snowy/mesa/rocky）と1対1で並べる
//    ＝10a-1d の決着順をそのまま保つ（並べ替えると既存の画面の肌が変わる）。
const GROUND_ORDER = [TILE.GRASS, TILE.ASH, TILE.SNOW, TILE.SAND, TILE.MUD];

// 画面の中で最も多い地面の下地（下地が地面でないときの受け皿）。
function majorityGroundTile(sd) {
	const votes = new Map();
	for (const g of Object.values(sd?.bgTiles ?? {})) {
		if (!GROUND_ORDER.includes(g)) continue;
		votes.set(g, (votes.get(g) ?? 0) + 1);
	}
	return pickGround(votes);
}

// 票（下地 → 数）から下地を1つ決める。同数は GROUND_ORDER の順で決着。
function pickGround(votes) {
	let best = null, bestN = 0;
	for (const [ground, n] of votes) {
		if (!GROUND_ORDER.includes(ground)) continue;
		if (n > bestN || (n === bestN && GROUND_ORDER.indexOf(ground) < GROUND_ORDER.indexOf(best))) {
			best = ground; bestN = n;
		}
	}
	return best;
}

/**
 * 画面 1 枚ぶんの「山のセル → 肌」を作る。
 *
 * ⚠ わざとキャッシュを持たない。1画面は 12×10＝120 セル∴走査は数十マイクロ秒で、
 *    エディタで下地を塗ったときに古い肌が残る（黙って間違う）方がはるかに高い代償。
 *
 * @param {object} sd ステージデータ（tiles／bgTiles）
 * @returns {Map<string,string>} "r,c" → 肌
 */
export function mountainSkinMap(sd) {
	const out = new Map();
	const rows = sd?.tiles?.length ?? 0;
	if (!rows) return out;
	const isM = (r, c) => sd.tiles[r]?.[c] === TILE.MOUNTAIN;
	const bgAt = (r, c) => sd.bgTiles?.[posKey(r, c)];
	const seen = new Set();
	let fallback = null;   // 画面ごとの最多の地面（要るときだけ測る）

	for (let r = 0; r < rows; r++) {
		const cols = sd.tiles[r]?.length ?? 0;
		for (let c = 0; c < cols; c++) {
			if (!isM(r, c) || seen.has(posKey(r, c))) continue;
			// 塊（4近傍の連結成分）を集める
			const cells = [];
			const stack = [[r, c]];
			seen.add(posKey(r, c));
			while (stack.length) {
				const [cr, cc] = stack.pop();
				cells.push([cr, cc]);
				for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					const nr = cr + dr, nc = cc + dc;
					if (!isM(nr, nc) || seen.has(posKey(nr, nc))) continue;
					seen.add(posKey(nr, nc));
					stack.push([nr, nc]);
				}
			}
			// ① 塊が乗っている下地の最多
			const own = new Map();
			for (const [cr, cc] of cells) {
				const g = bgAt(cr, cc);
				if (g) own.set(g, (own.get(g) ?? 0) + 1);
			}
			let skin = GROUND_TO_MOUNTAIN_SKIN[pickGround(own)];
			// ② 乗っている下地が地面でないなら、塊の周りの下地の最多
			if (!skin) {
				const around = new Map();
				for (const [cr, cc] of cells) {
					for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
						const nr = cr + dr, nc = cc + dc;
						if (isM(nr, nc)) continue;
						const g = bgAt(nr, nc);
						if (g) around.set(g, (around.get(g) ?? 0) + 1);
					}
				}
				skin = GROUND_TO_MOUNTAIN_SKIN[pickGround(around)];
			}
			// ③ それも無ければ画面ごとの最多の地面 → 既定
			if (!skin) {
				if (fallback === null) {
					fallback = GROUND_TO_MOUNTAIN_SKIN[majorityGroundTile(sd)] ?? MOUNTAIN_SKIN_DEFAULT;
				}
				skin = fallback;
			}
			for (const [cr, cc] of cells) out.set(posKey(cr, cc), skin);
		}
	}
	return out;
}

/** 1セルぶんの肌（見つからない＝山でないセルなら既定）。 */
export function mountainSkinAt(sd, r, c) {
	return mountainSkinMap(sd).get(posKey(r, c)) ?? MOUNTAIN_SKIN_DEFAULT;
}

/**
 * 木・茂み 1セルぶんの肌（10a-5）。**そのセルの下地だけ**で決める。
 *   ① 自分のセルの下地が地面 → その肌
 *   ② 地面でない（水の上・石畳・洞窟の床・未設定）→ 画面ごとの最多の地面の肌
 *   ③ 画面に地面が1枚も無い（ダンジョン内部など）→ 既定（緑の木）
 * ⚠ 山の `mountainSkinMap` のような塊の多数決はしない（この関数の上の表のコメント）。
 */
export function vegSkinAt(sd, r, c) {
	const own = GROUND_TO_VEG_SKIN[sd?.bgTiles?.[posKey(r, c)]];
	if (own) return own;
	return GROUND_TO_VEG_SKIN[majorityGroundTile(sd)] ?? VEG_SKIN_DEFAULT;
}

/**
 * タイル1枚の「絵と色の名前」に肌を織り込む（肌を持たないタイルは素通し）。
 *
 * 🔴 ゲーム（`game/render-board.js`）とエディタ（`editor/editor-canvas.js`）は
 *    **必ずこの関数だけ**を通す＝「どのタイルが肌を持つか」「山は塊・植生はセル」を
 *    2か所に書き写さない（[[blade-tile-sprite-single-source]]。橋のデッキ・山の肌で
 *    2度踏んだ「エディタとゲームで別の絵が出る」食い違いへの恒久対処）。
 *
 * @param {object} sd ステージデータ
 * @param {number} r 行  @param {number} c 列
 * @param {string} tile タイル文字
 * @param {{spr:string,pal:string}|undefined} si 共通表（TILE_SPRITE_MAP）の1行
 * @returns {{spr:string,pal:string,skin?:string}|undefined} 肌を織り込んだ名前
 */
export function skinnedSprite(sd, r, c, tile, si) {
	if (!si) return si;
	const skin = tile === TILE.MOUNTAIN ? mountainSkinAt(sd, r, c)
		: (tile === TILE.TREE || tile === TILE.BUSH) ? vegSkinAt(sd, r, c)
			: null;
	if (!skin) return si;
	return { ...si, spr: skinName(si.spr, skin), pal: skinName(si.pal, skin), skin };
}
