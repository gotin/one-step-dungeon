// ── Blade of Lumia – 1セルの「見た目」の単一の真実 ── キュー11b ────────────
//
// 何を直すか：同じセルを描く系が3つあり（実ゲームの盤面 / エディタのステージ
// キャンバス / エディタのワールド右下プレビュー）、それぞれが別々に「何を描くか」を
// 決めていたので見た目が食い違っていた（2026-09-13 ユーザー指摘）。実データで数えた
// 食い違い（71,880 セル走査）＝
//   ・エディタとプレビューが bgTiles の地面スプライトを一切敷かない … 約 38,000 セル
//     （草 21,075／水 4,103／泥 3,705／砂 3,154／雪 2,917／灰 2,051／石畳 1,066、
//       島の角 q/j/y/z が 53＝ユーザーが「緑の四角に見える」と報告した現物）
//   ・プレビューが連結タイル（橋・家・柵）を代表1枚の絵で描く … 721 セル
//   ・プレビューが肌／変種を選ばない（山・木・茂み） … 237 セル
//   ・エディタとプレビューが横に連なった扉（doorL＋反転）を選ばない … 各 16 セル
//   ・平色の出所が違う（TILE_META.color と実ゲームの CSS で床・壁・水・溶岩がずれる）
//
// 🔴 方針＝**「1セルに何を描くか」をここだけが決める**（[[blade-tile-sprite-single-source]]
//    ＝タイル→スプライトの対応を単一ソースにした方針を、セルの描画手順まで広げたもの）。
//    3つの描画系はここから返る記述（descriptor）を**自分の画材で**描くだけにする＝
//    ゲームは DOM＋CSS、エディタとプレビューは 2D キャンバス。∴ゲームの DOM 構造・
//    CSS・性能は変わらない（11b の「⛔ 止まる条件」に触れない）。
//
// 決め事：
//   ① 返すのは「状態に依らない見た目」だけ。宝箱の開封・扉の開閉・トーチの点灯など
//      **実行時の状態で変わる絵はゲーム側の分岐が持つ**（ここは基本形＝role で区別する）。
//   ② 敵とプレイヤーは盤面には描かれない（render-chars.js が実体として描く）∴
//      role='entity'。エディタとプレビューは配置を見るために描く＝**意図した差**。
//   ③ 絵を持たないタイルの文字アイコンもエディタ／プレビューだけが描く（`icon`）。
//      ゲームは CSS の色だけ＝これも意図した差。
//   ④ 平色は**実ゲームの CSS の値**をここに写す（TILE_META.color ではない）。
//      写し間違いは tests/editor-game-parity.spec.js が実際の computedStyle と比べて弾く。

import { TILE, TILE_META } from './tiles.js';
import { TILE_SPRITE_MAP } from './tile-sprites.js';
import { SPRITES } from './sprites.js';
import { groundSpriteName } from './ground-seams.js';
import { connectedTileParts, isConnectTile } from './tile-connect.js';
import { skinnedSprite } from './tile-skins.js';
import { objVariantName } from './sprites-tiles.js';
import { ENEMY_TILES } from './enemies.js';

// tiles 層に置かれると下地（bgTiles）が見えなくなるタイル。
// ＝render-board.js setCellClass がここで return して applyBgTileClass を呼ばないセル。
// ⚠ 水・溶岩も「下地を敷かない」側（自分の絵でセルを埋める）。ground-seams.js の
//   同名の集合は「継ぎ目の相手にするか」の判断で、水・溶岩は相手にする∴別物。
export const HIDE_GROUND_TILES = new Set([TILE.WALL, TILE.SKY, TILE.PIT, TILE.WATER, TILE.LAVA]);

// 盤面に描かれない（render-chars.js が実体として描く）タイル。
// ⚠ NPC は render-board.js が盤面に描く∴ここには入れない。
export const ENTITY_TILES = new Set([...ENEMY_TILES, TILE.PLAYER]);

// 実行時の状態で絵が変わるタイル（開閉・点灯・取得済み・押下・色の切り替え）。
// エディタ／プレビューは基本形（配置が分かる姿）を描く＝状態を持たないので当然。
export const STATEFUL_TILES = new Set([
	TILE.CHEST, TILE.KEY, TILE.BUTTON, TILE.SWITCH, TILE.GATE, TILE.TIDE_GATE,
	TILE.GATE_RED, TILE.GATE_BLUE, TILE.SWITCH_RED, TILE.SWITCH_BLUE,
	TILE.BREAKABLE_WALL, TILE.MAP_ENTER, TILE.TORCH, TILE.STONE,
	TILE.DOOR, TILE.DOORWAY_BOSS, TILE.DOORWAY_LOCKED,
	TILE.ITEM_SWORD, TILE.ITEM_SHIELD, TILE.ITEM_ARMOR,
	TILE.ITEM_BOOMERANG, TILE.ITEM_BOMB, TILE.ITEM_BOW,
	TILE.ITEM_HEAL_POTION, TILE.ITEM_BIG_HEAL_POTION,
	TILE.ITEM_HEART_CONTAINER, TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE,
	TILE.ITEM_TRIFORCE_PIECE, TILE.ITEM_DUNGEON_MAP, TILE.ITEM_COMPASS,
]);

// ── セルの平色（実ゲームの CSS が真実・ここはその写し）───────────────────
// cls＝ゲームがセルに付ける CSS クラス名。color＝そのクラスの背景色。
// approx:true は CSS がグラデーションのもの（キャンバスでは平色で近似する）。
// 🔴 値をいじるときは CSS 側も直す（tests/editor-game-parity.spec.js が
//    実際の computedStyle と突き合わせるので、片方だけ直すと落ちる）。
export const BG_TILE_STYLE = {
	[TILE.FLOOR]:       { cls: '',               color: '#1a2228' },   // --floor-color
	[TILE.GRASS]:       { cls: 'bg-grass',       color: '#3a6e28' },
	[TILE.SAND]:        { cls: 'bg-sand',        color: '#c8a84a' },
	[TILE.STONE_FLOOR]: { cls: 'bg-stonefloor',  color: '#6a6878' },
	[TILE.SNOW]:        { cls: 'bg-snow',        color: '#c8dce8' },
	[TILE.ASH]:         { cls: 'bg-ash',         color: '#4a3028' },
	[TILE.MUD]:         { cls: 'bg-mud',         color: '#3a4a28' },
	[TILE.BRIDGE]:      { cls: 'bg-bridge',      color: '#8a6030' },
	// 10c-2：手すりを手で決める橋も下地の色は橋と同じ（板が透ける隙間は無い）
	[TILE.BRIDGE_V_BOTH]: { cls: 'bg-bridge',    color: '#8a6030' },
	[TILE.BRIDGE_V_W]:    { cls: 'bg-bridge',    color: '#8a6030' },
	[TILE.BRIDGE_V_E]:    { cls: 'bg-bridge',    color: '#8a6030' },
	[TILE.BRIDGE_V_NONE]: { cls: 'bg-bridge',    color: '#8a6030' },
	[TILE.BRIDGE_H_BOTH]: { cls: 'bg-bridge',    color: '#8a6030' },
	[TILE.BRIDGE_H_N]:    { cls: 'bg-bridge',    color: '#8a6030' },
	[TILE.BRIDGE_H_S]:    { cls: 'bg-bridge',    color: '#8a6030' },
	[TILE.BRIDGE_H_NONE]: { cls: 'bg-bridge',    color: '#8a6030' },
	// Phase 9-6 深洋O：bgTiles 層の水は tiles 層の水と同じ 'water' クラスで青く塗る
	[TILE.WATER]:       { cls: 'water',          color: '#0e2040' },
};

// tiles 層のタイル自身がセルに付ける色（状態を持つものは「基本形＝閉じている姿」）。
export const TILE_CELL_STYLE = {
	[TILE.WALL]:            { cls: 'wall',                 color: '#3a4448' },   // --wall-color
	[TILE.WATER]:           { cls: 'water',                color: '#0e2040' },
	[TILE.LAVA]:            { cls: 'lava',                 color: '#5a1408' },
	[TILE.GATE]:            { cls: 'gate',                 color: '#1a2c40' },
	[TILE.DOOR]:            { cls: 'door',                 color: '#2a1a08' },
	[TILE.BREAKABLE_WALL]:  { cls: 'breakable-wall',       color: '#3a3028' },
	[TILE.DOORWAY]:         { cls: 'doorway',              color: '#0e1a20' },
	[TILE.DOORWAY_BOSS]:    { cls: 'doorway-boss',         color: '#1a0c10' },
	[TILE.DOORWAY_LOCKED]:  { cls: 'doorway-locked',       color: '#121830' },
	// 空・穴はグラデーション（星空／底の見えない穴）＝キャンバスでは平色で近似する
	[TILE.SKY]:             { cls: 'sky', color: '#120f2c', approx: true },
	[TILE.PIT]:             { cls: 'pit', color: '#050608', approx: true },
};

/**
 * そのセルの平色（スプライトが乗る前の下地の色）。
 * 実ゲームの CSS の重なり順に合わせる＝`css/tiles.css` は最後に読まれるので
 * `bg-*`（下地）が `door`/`gate`/`doorway-*`（tiles 層のタイル）より前に出る。
 * ∴「下地に色があるならそれ・無ければタイル自身の色・どちらも無ければ床」。
 */
export function cellBaseColor(tile, bgTile = TILE.FLOOR) {
	const own = TILE_CELL_STYLE[tile];
	if (HIDE_GROUND_TILES.has(tile)) return own?.color ?? BG_TILE_STYLE[TILE.FLOOR].color;
	const bg = BG_TILE_STYLE[bgTile];
	if (bg?.cls) return bg.color;
	return own?.color ?? BG_TILE_STYLE[TILE.FLOOR].color;
}

// 横に連なった扉は「1枚の大きな門」に見せる＝左セルは doorL、右セルはそれを左右反転。
// 単独の扉だけ door（枠が四方にある絵）。縦の連結は今は単独扱い。
function doorSprite(stageData, r, c) {
	const left  = stageData?.tiles?.[r]?.[c - 1] === TILE.DOOR;
	const right = stageData?.tiles?.[r]?.[c + 1] === TILE.DOOR;
	if (right && !left) return { spr: 'doorL', flipX: false };
	if (left && !right) return { spr: 'doorL', flipX: true };
	if (left && right)  return { spr: 'doorL', flipX: false };
	return { spr: 'door', flipX: false };
}

/**
 * 1セルの「状態に依らない見た目」を返す。3つの描画系（ゲーム／エディタのステージ
 * キャンバス／ワールドプレビュー）はこれを共通の設計図として使う。
 *
 * @param {object} stageData ステージデータ（tiles / bgTiles を持つ）
 * @param {number} r 行
 * @param {number} c 列
 * @param {string} [tile] そのセルのタイル文字（省略時は stageData から読む。
 *   エディタの「隣画面の帯」は r/c が半端な値になる∴明示的に渡せるようにしている）
 * @returns {{
 *   tile:string, bgTile:string, baseColor:string, hideGround:boolean,
 *   ground:{spr:string,pal:string}|null,
 *   groundConnect:object|null, objConnect:object|null,
 *   obj:{spr:string,pal:string,flipX:boolean,role:string,skin:string|null}|null,
 *   icon:string|null,
 * }}
 *   ground        … bgTiles の地面スプライト（変種＋継ぎ目を解決した名前・セル全面に敷く）
 *   groundConnect … bgTiles 層の連結タイル（橋）の部品。ground の代わりに敷く
 *   objConnect    … tiles 層の連結タイル（橋・家・柵）の部品
 *   obj           … tiles 層の「物」の絵。role='static'（ゲームも盤面に描く）／
 *                   'stateful'（状態で変わる＝ゲーム側の分岐が本番）／
 *                   'entity'（盤面には描かない＝敵・プレイヤー）
 *   icon          … 絵を持たないタイルの文字（エディタ／プレビューだけが描く）
 */
export function describeCell(stageData, r, c, tile) {
	const posKey = `${r},${c}`;
	const t  = tile ?? stageData?.tiles?.[r]?.[c] ?? TILE.FLOOR;
	const bg = stageData?.bgTiles?.[posKey] ?? TILE.FLOOR;
	const d = {
		tile: t, bgTile: bg,
		baseColor: cellBaseColor(t, bg),
		hideGround: HIDE_GROUND_TILES.has(t),
		ground: null, groundConnect: null, objConnect: null, obj: null, icon: null,
	};

	// ① 下地（bgTiles）。連結タイル（エディタのパレットの「橋」は BG_TILES ＝ bgTiles 層へ
	//    書かれる）は部品で描く＝置いた層で見た目が変わらない。
	if (!d.hideGround) {
		if (isConnectTile(bg)) {
			d.groundConnect = connectedTileParts(stageData, r, c, bg);
		} else if (bg !== TILE.FLOOR) {
			const si = TILE_SPRITE_MAP[bg];
			if (si) {
				// 変種（隣と同じ絵が並ばない）＋継ぎ目（隣の地面の色を自分の絵の縁へ食い込ませる）
				const spr = groundSpriteName(stageData, si.spr, r, c);
				if (SPRITES[spr]) d.ground = { spr, pal: si.pal };
			}
		}
	}

	// ② tiles 層の連結タイル（橋・家・柵）。下地の上に重ねる。
	if (isConnectTile(t)) {
		d.objConnect = connectedTileParts(stageData, r, c, t);
		if (d.objConnect) return d;
	}

	// ③ tiles 層の「物」。形と色は TILE_SPRITE_MAP（単一ソース）から引く。
	const si = TILE_SPRITE_MAP[t];
	if (!si) {
		if (t !== TILE.FLOOR && t !== TILE.WALL) d.icon = TILE_META[t]?.icon ?? '?';
		return d;
	}
	const role = ENTITY_TILES.has(t) ? 'entity' : STATEFUL_TILES.has(t) ? 'stateful' : 'static';
	if (t === TILE.DOOR) {
		const { spr, flipX } = doorSprite(stageData, r, c);
		d.obj = { spr, pal: si.pal, flipX, role, skin: null };
		return d;
	}
	// 山・木・茂みは下地から肌を選び（tile-skins.js）、さらにセル座標で変種を選ぶ
	// （sprites-tiles.js）。順序は必ず 肌 → 変種＝`mountain@mesa#2`。
	const skinned = skinnedSprite(stageData, r, c, t, si);
	const spr = objVariantName(skinned.spr, r, c);
	if (SPRITES[spr]) {
		d.obj = { spr, pal: skinned.pal, flipX: false, role, skin: skinned.skin ?? null };
	} else if (t !== TILE.FLOOR && t !== TILE.WALL) {
		d.icon = TILE_META[t]?.icon ?? '?';   // 表に載っているが絵が無い（＝作りかけ）
	}
	return d;
}

/**
 * 「1セルに実際に何を描いたか」の記録（描画系ごと・1セル分）。
 * 🔴 呼び出し側は **描画手順の中で押す**＝describeCell の答えを写して作ってはいけない
 *    （写すと「期待値を自分で作るテスト」になり食い違いを検出できなくなる）。
 * @returns {{sprs:string[], icon:string|null}}
 *   sprs … 下から順に実際に描いたスプライト（`名前@パレット`・左右反転は名前の後に `!`）
 *   icon … 絵が無いタイルの文字（エディタ／プレビューだけが描く＝ゲームは CSS の色だけ）
 */
export function makeDrawLog() {
	return { sprs: [], icon: null };
}

/**
 * 記述を1行の文字列にする（テスト・調査でセル同士を比べるため）。
 * 状態で変わる絵・盤面に描かれない実体・文字アイコンは含めない
 * ＝「3つの描画系が一致していなければおかしい部分」だけを並べる。
 */
export function cellAppearanceKey(d) {
	const parts = [`base=${d.baseColor}`];
	if (d.ground)        parts.push(`ground=${d.ground.spr}@${d.ground.pal}`);
	if (d.groundConnect) parts.push(`bgconnect=${d.groundConnect.sprs.join('+')}@${d.groundConnect.pal}`);
	if (d.objConnect)    parts.push(`connect=${d.objConnect.sprs.join('+')}@${d.objConnect.pal}`);
	if (d.obj && d.obj.role !== 'entity') {
		parts.push(`obj=${d.obj.spr}${d.obj.flipX ? '!' : ''}@${d.obj.pal}`);
	}
	return parts.join(' ');
}
