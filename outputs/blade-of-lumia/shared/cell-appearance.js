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
import { SPRITES, PAL } from './sprites.js';
import { groundSpriteName } from './ground-seams.js';
import { connectedTileParts, isConnectTile } from './tile-connect.js';
import { skinnedSprite, skinName, pitSkinAt } from './tile-skins.js';
import { PIT_SKIN_STYLE, PIT_BODY_N } from './sprites-pit.js';
import { objVariantName } from './sprites-tiles.js';
import { ENEMY_TILES } from './enemies.js';
import { npcSpriteOf } from './npcs.js';
import { SKY_TILE_N } from './sprites-sky.js';
import { WALL_CAP_N } from './sprites-wall.js';

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
	TILE.ITEM_BOOMERANG, TILE.ITEM_BOMB, TILE.ITEM_ARROWS,
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
	// 壁＝天端＋前面＋縁の絵（`wallParts`）を重ねる。平色は見取り図（サムネ）の色＝絵の下に隠れる
	[TILE.WALL]:            { cls: 'wall',                 color: '#3a4448' },   // --wall-color
	[TILE.WATER]:           { cls: 'water',                color: '#0e2040' },
	[TILE.LAVA]:            { cls: 'lava',                 color: '#5a1408' },
	[TILE.GATE]:            { cls: 'gate',                 color: '#1a2c40' },
	[TILE.DOOR]:            { cls: 'door',                 color: '#2a1a08' },
	[TILE.BREAKABLE_WALL]:  { cls: 'breakable-wall',       color: '#3a3028' },
	[TILE.DOORWAY]:         { cls: 'doorway',              color: '#0e1a20' },
	[TILE.DOORWAY_BOSS]:    { cls: 'doorway-boss',         color: '#1a0c10' },
	[TILE.DOORWAY_LOCKED]:  { cls: 'doorway-locked',       color: '#121830' },
	// 空＝はるか下の海と雲の絵（`skyParts`）を重ねる。平色はその海の色（見取り図もこれ）。
	// 穴＝底と縁の絵（`pitParts`・肌は下地から）を重ねる。平色は絵の下・見取り図の色。
	// CSS は旧来のグラデーション（絵が全面を覆うので画面には出ない）＝キャンバスでは平色で近似する
	[TILE.SKY]:             { cls: 'sky', color: '#0455ae' },
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
 * 空（SKY）のセルに重ねる部品（キュー38）。
 * ① 海と雲の絵＝128×128 の切り身 `skySea@k`＋`skyCloud@k`（k はセル座標で決まる＝隣の空と
 *    絵が繋がる）。ゲームは雲の層だけを流す（game/sky-drift.js）＝ここが返すのは流れる前の姿。
 * ② 北が空でない（地面・壁など）なら崖の面 `skyLipN`、東西が空でないなら影
 *    ＝穴（黒）と違い「はるか下」に見せる。画面の外（盤面の端）は空が続くとみなして描かない。
 * @returns {{sprs:string[], pal:string, opaque:boolean, edgeCode:string}}
 *   edgeCode … 縁を描いた向き（'N'/'W'/'E' の並び・無ければ '-'）＝テストが観測する
 */
export function skyParts(stageData, r, c) {
	const n = SKY_TILE_N;
	const k = (((r % n) + n) % n) * n + (((c % n) + n) % n);
	const sprs = [`skySea@${k}`, `skyCloud@${k}`];
	const tiles = stageData?.tiles;
	const ground = (rr, cc) => {
		const t = tiles?.[rr]?.[cc];
		return t !== undefined && t !== TILE.SKY;
	};
	let edgeCode = '';
	if (ground(r - 1, c)) { sprs.push('skyLipN');   edgeCode += 'N'; }
	if (ground(r, c - 1)) { sprs.push('skyShadeW'); edgeCode += 'W'; }
	if (ground(r, c + 1)) { sprs.push('skyShadeE'); edgeCode += 'E'; }
	return { sprs, pal: 'sky', opaque: true, edgeCode: edgeCode || '-' };
}

/**
 * 穴（PIT）のセルに重ねる部品（キュー22）。空（`skyParts`）と同じ「底＋縁」の形。
 * ① 底 `pitBody@k`（k はセル座標で4種）。
 * ② 隣が穴でない辺にだけ縁＝北は向こう側の壁の面 `pitLipN.<質>@(c%2)`、南は手前の縁、
 *    東西は地面の縁＋落ち影。縦横が穴で斜めだけ穴でない角には地面の欠片 `pitNub..`。
 *    ＝繋がった穴は1つの裂け目に見える。盤面の外は穴が続くとみなす（画面の境目に縁を出さない）。
 * ③ 色は肌（`pitSkinAt`＝下地から導く）のパレット `pit@<肌>`。絵は肌に依らず共通
 *    （北の縁だけ肌の「質」＝地層／石積み／氷で絵を選ぶ）。
 * 重ね順＝底 → 東西 → 南 → 北 → 角（北の縁の地面が東西の縁の上端を覆う）。
 * @returns {{sprs:string[], pal:string, opaque:boolean, edgeCode:string, skin:string}}
 *   edgeCode … 縁を描いた向き（'W'/'E'/'S'/'N'＋角の欠け 'nw' 等＋外角の丸め '(nw)' 等・無ければ '-'）＝テストが観測する
 */
export function pitParts(stageData, r, c) {
	const tiles = stageData?.tiles;
	const open = (rr, cc) => {
		const t = tiles?.[rr]?.[cc];
		return t !== undefined && t !== TILE.PIT;
	};
	const skin = pitSkinAt(stageData, r, c);
	const sprs = [`pitBody@${(((r * 3 + c) % PIT_BODY_N) + PIT_BODY_N) % PIT_BODY_N}`];
	let edgeCode = '';
	const n = open(r - 1, c), s = open(r + 1, c), w = open(r, c - 1), e = open(r, c + 1);
	if (w) { sprs.push('pitRimW'); edgeCode += 'W'; }
	if (e) { sprs.push('pitRimE'); edgeCode += 'E'; }
	if (s) { sprs.push('pitRimS'); edgeCode += 'S'; }
	if (n) { sprs.push(`pitLipN.${PIT_SKIN_STYLE[skin]}@${((c % 2) + 2) % 2}`); edgeCode += 'N'; }
	if (!n && !w && open(r - 1, c - 1)) { sprs.push('pitNubNW'); edgeCode += 'nw'; }
	if (!n && !e && open(r - 1, c + 1)) { sprs.push('pitNubNE'); edgeCode += 'ne'; }
	if (!s && !w && open(r + 1, c - 1)) { sprs.push('pitNubSW'); edgeCode += 'sw'; }
	if (!s && !e && open(r + 1, c + 1)) { sprs.push('pitNubSE'); edgeCode += 'se'; }
	// 外角（2辺とも穴でない）は地面で丸く削る＝孤立した穴が四角に見えない
	if (n && w) { sprs.push('pitCornerNW'); edgeCode += '(nw)'; }
	if (n && e) { sprs.push('pitCornerNE'); edgeCode += '(ne)'; }
	if (s && w) { sprs.push('pitCornerSW'); edgeCode += '(sw)'; }
	if (s && e) { sprs.push('pitCornerSE'); edgeCode += '(se)'; }
	return { sprs, pal: skinName('pit', skin), opaque: true, edgeCode: edgeCode || '-', skin };
}

/**
 * 壁（WALL）のセルに重ねる部品（キュー23）。穴・空と同じ「本体＋開いた辺の縁」の形。
 * ① 天端 `wallCap@k`（k はセル座標＝隣の壁と小石の模様が繋がる）。
 * ② 隣が壁でない辺にだけ縁＝南は立ち上がりの前面 `wallFaceS@(c%4)`、北は輪郭、
 *    東西は輪郭＋面取り（南も開いていれば前面の端まで輪郭を引く `.s` 版）。
 *    斜め見下ろし＝南を向いた面だけが見える（穴の北の縁・空の崖の面と同じ視点）。
 *    盤面の外は壁が続くとみなす（部屋の外枠の外側に輪郭を出さない）。
 * 重ね順＝天端 → 前面 → 北 → 東西（東西の輪郭が前面の端も締める）。
 * @returns {{sprs:string[], pal:string, opaque:boolean, edgeCode:string}}
 *   edgeCode … 縁を描いた向き（'S'＝前面・'N'・'W'・'E' の並び・無ければ '-'）＝テストが観測する
 */
export function wallParts(stageData, r, c) {
	const tiles = stageData?.tiles;
	const open = (rr, cc) => {
		const t = tiles?.[rr]?.[cc];
		return t !== undefined && t !== TILE.WALL;
	};
	const n = WALL_CAP_N;
	const rr = ((r % n) + n) % n, cc = ((c % n) + n) % n;
	const sprs = [`wallCap@${rr * n + cc}`];
	let edgeCode = '';
	const s = open(r + 1, c);
	if (s) { sprs.push(`wallFaceS@${cc}`); edgeCode += 'S'; }
	if (open(r - 1, c)) { sprs.push('wallEdgeN'); edgeCode += 'N'; }
	if (open(r, c - 1)) { sprs.push(s ? 'wallEdgeW.s' : 'wallEdgeW'); edgeCode += 'W'; }
	if (open(r, c + 1)) { sprs.push(s ? 'wallEdgeE.s' : 'wallEdgeE'); edgeCode += 'E'; }
	return { sprs, pal: 'wall', opaque: true, edgeCode: edgeCode || '-' };
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

	// ①b 空（キュー38）＝海と雲の2層の切り身＋崖の縁と影。連結タイルと同じ「部品を重ねる」形で返す
	//    ＝エディタ・プレビューは橋と同じ道で描ける。ゲームだけは雲を流すため game/sky-drift.js が
	//    2層を大きな背景として敷き、縁の部品だけを canvas に描く（どの部品かはここの答えに従う）。
	if (t === TILE.SKY) {
		d.objConnect = skyParts(stageData, r, c);
		return d;
	}
	// ①c 穴（キュー22）＝底＋縁の部品。空と同じ形＝エディタ・プレビュー・ゲームが同じ道で描く。
	if (t === TILE.PIT) {
		d.objConnect = pitParts(stageData, r, c);
		return d;
	}
	// ①d 壁（キュー23）＝天端＋前面＋縁の部品。空・穴と同じ形。
	if (t === TILE.WALL) {
		d.objConnect = wallParts(stageData, r, c);
		return d;
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
	// 店は店ごとに見た目を差し替えられる（shopData.sprite＝情報屋）。ゲームと同じ npcSpriteOf で引く。
	if (t === TILE.NPC_SHOP) {
		const m = npcSpriteOf(stageData, `${r},${c}`, t);
		d.obj = { spr: m.sprite, pal: m.pal, flipX: false, role, skin: null };
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
// ── 1セル＝1ドットの見取り図の色（ワールドマップのサムネ）── キュー11c ─────────
//
// 何を直すか：エディタのワールドマップに並ぶステージのサムネ（`drawMinimap`）が
// 手書きの色表（旧 `MINIMAP_COLORS`）にある文字にだけ前景ドットを打っていたので、
// **表に載っていない物が地面と同じ色で消えていた**（2026-09-13 ユーザー指摘＝
// 「橋、障害物・建物もあるなら表示した方がいい。ぱっと見でどういうステージなのか
// 把握しづらい」）。実データで数えた消えていたセル＝7,078
//   木 3,147／山 2,394／橋 503／茂み 226／看板 184／石床 114／家 106＋52／柵 48／
//   墓 47／敵 20種ほか（表に載っていない敵タイルも全部消えていた）。
//
// 🔴 方針＝**色も絵から導く**（[[blade-tile-sprite-single-source]]／
//    [[blade-enemy-tables-derive-from-meta]]＝手書きの表は必ず取りこぼす）。
//    導き方＝「その絵で**面積が一番広い明るい色**」＝`spriteGlanceColor`。
//    暗い輪郭・影を混ぜた平均は濁って地面と見分けが付かなくなる∴明度が下位
//    `GLANCE_DARK_QUANTILE` の色（輪郭・影）を捨ててから最頻色を採る。
//    ⚠ この導出は旧 `MINIMAP_COLORS` の手書きの色を**ほぼ再現する**（実測＝
//      パトロール #4888c0・追跡 #c03030・門番 #9040c0・ボス #f0c040 は完全一致、
//      鍵・宝箱・扉・入口は同系）＝手書きの表は「絵の一番目立つ色」を人が目で
//      拾ったものだった∴機械的に導ける。
//
// 決め事：
//   ① 変種（`sprites-tiles.js` の `#0`〜`#7`）は**解決しない**＝形だけが違って色は
//      同じ。肌（`tile-skins.js`）は解決する＝山の色が地域で変わる（灰／黒／橙／白）。
//   ② 地面の継ぎ目（`ground-seams.js`）も解決しない。1ドットには効かないのに、
//      ワールドマップは全ステージ（実測 522 画面 62,640 セル）を一度に描く∴
//      セルごとに継ぎ目の絵を作ると重い。下地は平色（`cellBaseColor`）で足りる。
//   ③ **地面と見分けが付くことを保証する**＝導いた色が下地に近すぎる場合は明暗方向へ
//      押しのける（`GLANCE_MIN_SEPARATION`）。茂みが草地に、墓が石畳に埋もれるのを防ぐ
//      （見取り図＝記号なので実際の絵より強く出て良い）。
//   ④ 明るい色が無い絵（真っ黒＝魔王・レバー）は「その絵で一番鮮やかな色」に切り替える。
//   ⑤ 下地も同じやり方で色を導く＝`BG_TILE_STYLE`（実ゲームの CSS の写し）に色が無い
//      地面（島の角 q/j/y/z＝実測 53 セル）は床の暗色ではなくその地面の絵の色にする。
//      ＝拡大して見たら島の角だけ穴のように黒く抜けていた（[[judge-obvious-visual-defects-yourself]]）。

export const GLANCE_MIN_SEPARATION = 48;   // 下地との RGB 距離の下限
export const GLANCE_DARK_QUANTILE  = 0.25; // 輪郭・影として捨てる明度の下位割合
// 「1ドットの記号として読めない色」の判定＝暗く（明度が低く）色味も無い。
// この2つを両方満たす色に落ちたら、その絵で一番鮮やかな色に切り替える。
export const GLANCE_DARK_LUM = 70;
export const GLANCE_DULL_SAT = 24;

const hexRgb = (col) => {
	const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(col ?? '');
	return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};
const toHex = ([r, g, b]) => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const rgbLum = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
const rgbSat = (v) => Math.max(...v) - Math.min(...v);

/** 2色の隔たり（RGB 空間の距離）。1ドットで見分けが付くかの目安。 */
export function colorDistance(a, b) {
	const x = hexRgb(a), y = hexRgb(b);
	return x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : 0;
}

const glanceCache = new Map();

/**
 * スプライト1枚を「見取り図の1ドット」に潰した色。
 * 面積が一番広い明るい色（輪郭・影を捨てた最頻色）。明るい色を持たない絵は
 * 一番鮮やかな色に切り替える（真っ黒なドットは記号にならない）。
 * @returns {string|null} `#rrggbb`（絵かパレットが無ければ null）
 */
export function spriteGlanceColor(spr, palName) {
	const key = `${spr}|${palName}`;
	if (glanceCache.has(key)) return glanceCache.get(key);
	const grid = SPRITES[spr]?.[0];
	const pal  = PAL[palName];
	let result = null;
	if (grid && pal) {
		const count = new Map();
		for (const row of grid) {
			for (const idx of row) {
				if (idx === 0) continue;                      // 透明
				const v = hexRgb(pal[idx]);
				if (!v) continue;
				const k = toHex(v);
				count.set(k, (count.get(k) ?? 0) + 1);
			}
		}
		if (count.size) {
			const colors = [...count.keys()];
			const lums = colors.map(c => rgbLum(hexRgb(c))).sort((a, b) => a - b);
			const cut = lums[Math.floor(lums.length * GLANCE_DARK_QUANTILE)];
			const bright = colors.filter(c => rgbLum(hexRgb(c)) > cut);
			const pool = bright.length ? bright : colors;
			result = pool.sort((a, b) => count.get(b) - count.get(a))[0];
			// 暗くて色味も無い＝記号にならない（魔王・レバー）∴一番鮮やかな色に替える
			const v = hexRgb(result);
			if (rgbLum(v) < GLANCE_DARK_LUM && rgbSat(v) < GLANCE_DULL_SAT) {
				result = colors.sort((a, b) =>
					(rgbSat(hexRgb(b)) + rgbLum(hexRgb(b)) * 0.5) - (rgbSat(hexRgb(a)) + rgbLum(hexRgb(a)) * 0.5))[0];
			}
		}
	}
	glanceCache.set(key, result);
	return result;
}

/** 下地に近すぎる前景色を明暗方向へ押しのける（見分けが付くことの保証）。 */
export function separateFromBase(fg, base) {
	const b = hexRgb(base);
	let v = hexRgb(fg);
	if (!b || !v) return fg;
	// 下地の方が明るければ前景を暗く、暗ければ明るくする（色味は保つ）
	const target = rgbLum(b) > rgbLum(v) ? 0 : 255;
	for (let i = 0; i < 16 && Math.hypot(v[0] - b[0], v[1] - b[1], v[2] - b[2]) < GLANCE_MIN_SEPARATION; i++) {
		v = v.map(x => x + (target - x) * 0.12);
	}
	return toHex(v);
}

/**
 * そのセルのタイル文字を「1枚の絵」に落とす（見取り図用）。
 * 連結タイル（橋・家・柵）は部品の1枚目で代表する＝1ドットには十分。
 * @returns {{spr:string,pal:string}|null}
 */
function glanceSprite(stageData, r, c, tile) {
	if (isConnectTile(tile)) {
		const parts = connectedTileParts(stageData, r, c, tile);
		return parts ? { spr: parts.sprs[0], pal: parts.pal } : null;
	}
	const si = TILE_SPRITE_MAP[tile];
	if (!si) return null;
	const skinned = skinnedSprite(stageData, r, c, tile, si);
	// 変種は色が同じ∴解決しない。ただし肌付きの名前そのものが絵として
	// 登録されていない場合があるので、その時だけ変種 #0 を借りる。
	return { spr: SPRITES[skinned.spr] ? skinned.spr : objVariantName(skinned.spr, 0, 0), pal: skinned.pal };
}

/**
 * 1セルを見取り図の色に潰す。ワールドマップのサムネ（1セル=1px）だけが使う。
 * @returns {{base:string, fg:string|null, spr:string|null}}
 *   base … 下地の色（`cellBaseColor`＝実ゲームの CSS の写し。CSS に色が無い下地は
 *          その地面の絵から導く）
 *   fg   … そのセルに乗っている「物」の色（何も乗っていなければ null）
 *   spr  … fg の出所のスプライト名（テスト・調査用）
 */
export function cellGlanceColor(stageData, r, c, tile) {
	const t  = tile ?? stageData?.tiles?.[r]?.[c] ?? TILE.FLOOR;
	const bg = stageData?.bgTiles?.[`${r},${c}`] ?? TILE.FLOOR;
	let base = cellBaseColor(t, bg);
	// 下地に絵はあるが CSS に色が無いもの（島の角 q/j/y/z＝実測 53 セル）は
	// `cellBaseColor` が床の暗色に落ちる＝サムネでは島に穴が空いて見えた
	// （拡大して自分で見て気付いた defect）∴その地面の絵から色を導く。
	if (!HIDE_GROUND_TILES.has(t) && bg !== TILE.FLOOR && !BG_TILE_STYLE[bg]?.cls) {
		const gs = glanceSprite(stageData, r, c, bg);
		const col = gs && spriteGlanceColor(gs.spr, gs.pal);
		if (col) base = col;
	}

	const os = glanceSprite(stageData, r, c, t);
	if (!os) return { base, fg: null, spr: null };
	const { spr, pal } = os;

	const raw = spriteGlanceColor(spr, pal);
	if (!raw) return { base, fg: null, spr: null };
	return { base, fg: separateFromBase(raw, base), spr };
}

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
