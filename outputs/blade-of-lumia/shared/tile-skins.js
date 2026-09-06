// ── tile-skins.js ── 同じタイルの絵を「下地（bgTiles）」から選び分ける ──────
// キュー10番 10a-1d。山 `'M'` は世界中で同じ絵（雪冠つきの高山）だったので、
// 南西の砂漠にも溶岩地帯にも雪原にも「同じ雪山」が立っていた。
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

// 肌つきのスプライト名／パレット名。`mountain@snowy` のように基本名から導く
// （`bgVariantName` の `grass@0` と同じ書式＝変種の名前の付け方を1つに保つ）。
export const skinName = (base, skin) => `${base}@${skin}`;

const posKey = (r, c) => `${r},${c}`;

// 画面の中で最も多い地面の下地（塊が地面に触れていないときの受け皿）。
function majorityGround(sd) {
	const votes = new Map();
	for (const g of Object.values(sd?.bgTiles ?? {})) {
		if (!GROUND_TO_MOUNTAIN_SKIN[g]) continue;
		votes.set(g, (votes.get(g) ?? 0) + 1);
	}
	return pickSkin(votes) ?? MOUNTAIN_SKIN_DEFAULT;
}

// 票（下地 → 数）から肌を決める。同数は MOUNTAIN_SKINS の順で決着＝実行ごとに揺れない。
function pickSkin(votes) {
	let best = null, bestN = 0;
	for (const [ground, n] of votes) {
		const skin = GROUND_TO_MOUNTAIN_SKIN[ground];
		if (!skin) continue;
		if (n > bestN || (n === bestN && MOUNTAIN_SKINS.indexOf(skin) < MOUNTAIN_SKINS.indexOf(best))) {
			best = skin; bestN = n;
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
			let skin = pickSkin(own);
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
				skin = pickSkin(around);
			}
			// ③ それも無ければ画面ごとの最多の地面 → 既定
			if (!skin) {
				if (fallback === null) fallback = majorityGround(sd);
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
