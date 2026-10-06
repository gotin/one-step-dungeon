// ── ground-layer.js ── 地面は下地（bgTiles）にだけ置く ─────────────────────
// キュー42（2026-10-03）。石畳 `o`・砂 `d` などの「地面」が tiles 層に置かれていると、
// 盤面はそれを下地ではなく「物」として扱い、セルより小さな絵（0.7 セル）を床の上に
// 描いていた＝周りに暗い隙間が出て「石畳が小さく表示される」（2026-09-21 ユーザー報告・
// field 5,3）。地面が見える層は bgTiles だけ（[[field-bgtile-is-visible-ground]]）。
//
// エディタの描画ツールは地面を最初から bgTiles に書く（editor-canvas.js applyTool）。
// tiles 層の地面は、それより前に生成スクリプトや手書きで入ったデータの残り。
// ∴ここで「tiles 層の地面を bgTiles へ移し、tiles を床にする」を1つの関数にして、
// 次の全部から呼ぶ（[[blade-bad-data-fix-five-layers]]）：
//   ・データ   … scripts/migrate-lift-ground-tiles.mjs（実マップを1回直す）
//   ・受け口   … game/game.js（マップを読んだ直後＝古いデータを渡されても地面として描く）
//   ・入口     … editor/editor-io.js（読み込み直後と保存の直前）
//   ・検査     … tests/ground-layer.spec.js（実マップの全走査で 0 件）
// セーブ（localStorage の進行データ）はマップのタイルを持たない∴対象外。
//
// ⚠ 通行・ギミックは変わらない＝地面も床も通行可で、ゲームの判定に `TILE.FLOOR` との
//   一致を見る所は無い（描画だけが違っていた）。
// ⚠ 水 `~` と橋は対象外＝tiles 層にも正当に置かれる（水は物として、橋は連結タイルとして描く）。
import { TILE } from './tiles.js';

/** tiles 層に置かれていたら bgTiles へ移す「地面」の文字。 */
export const LIFT_GROUND_TILES = new Set([
	TILE.GRASS, TILE.SAND, TILE.STONE_FLOOR, TILE.SNOW, TILE.ASH, TILE.MUD, TILE.ICE,
	TILE.ISLAND_CORNER_NW, TILE.ISLAND_CORNER_NE, TILE.ISLAND_CORNER_SW, TILE.ISLAND_CORNER_SE,
]);

/**
 * 1画面の tiles 層の地面を bgTiles へ移す（**その場で書き換える**）。
 * 下地に別の地面があっても、tiles 層の地面で上書きする＝今まで画面に見えていた方を残す。
 * @returns {string[]} 移したセルの `r,c`
 */
export function liftStageGroundTiles(stage) {
	const moved = [];
	if (!stage?.tiles) return moved;
	stage.tiles.forEach((row, r) => {
		for (let c = 0; c < row.length; c++) {
			const ch = row[c];
			if (!LIFT_GROUND_TILES.has(ch)) continue;
			stage.bgTiles ??= {};
			stage.bgTiles[`${r},${c}`] = ch;
			row[c] = TILE.FLOOR;   // tiles は文字の配列（[[field-tiles-are-char-arrays]]）
			moved.push(`${r},${c}`);
		}
	});
	return moved;
}

/**
 * マップ全体（全レイヤー・全画面）の tiles 層の地面を bgTiles へ移す（**その場で書き換える**）。
 * 返り値＝`{ changes: [{ layer, stage, cells }] }`（移したものが無ければ空）。
 */
export function liftGroundTiles(map) {
	const changes = [];
	for (const [layer, ld] of Object.entries(map?.layers ?? {})) {
		for (const [stage, sd] of Object.entries(ld?.stages ?? {})) {
			const cells = liftStageGroundTiles(sd);
			if (cells.length) changes.push({ layer, stage, cells });
		}
	}
	return { changes };
}
