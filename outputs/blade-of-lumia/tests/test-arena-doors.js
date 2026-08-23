// ── tests/test-arena-doors.js ── 敵アリーナ（test_mechanics の 10×12）の「通路」の単一の真実
//
// 敵を試すとき、アリーナからアリーナへ**歩いて移動できる**必要がある（2026-08-16 ユーザー指摘）。
// ∴ 28,0〜38,0 の各アリーナは左右の外周に通路（door）を持つ＝隣のステージへ抜けられる。
// 2026-08-23 に y=1 の34枚（Phase 8-4 のリバランス実プレイ検証行・BALANCE_ARENAS）も
// 同じ通路仕様で並べた＝通路の定義（行・開け方）はこのファイル1箇所だけ。
//
// ⚠️ 2026-08-16 の事故：この通路はユーザーが後から開けたものだったが、生成スクリプトが
//    「外周は全部壁」と宣言していたため**盤面のドリフト（手編集の事故）と誤認して2回塞いだ**
//    （k-4b・k-5a）。∴ 通路は「消えてよい例外」ではなくアリーナの仕様＝ここで定義し、
//    生成スクリプトが必ず開け、スペックが「開いていること」を assert する。
//
// ## 通路の行が rows 7/8 である理由
//
// アリーナの計測はすべて **row 4**（敵は (4,9)・プレイヤーは (4,7)〜(4,10)）で行う。
// そのうち2本は**外周の壁を突き当たりとして測る**：
//   ・facing-block ⑦  … 盾騎士のノックバックで壁（4,11）に押し込まれない
//   ・facing-block ⑫③ … 火吐き亀の炎が壁（4,11）で止まる
// ∴ row 4/5 に通路を開けると、この2本は「壁の無い盤面」を測る＝歯が抜ける。
// 計測帯（rows 4/5）から離れた rows 7/8 に置けば、通路と計測の両方が成立する。
//
// ## 行が2つ必要な理由
//
// 横断遷移の着地は `game.js checkStageTransition` が **反対軸の座標をそのまま持ち込む**
// （`newRow = y`）＝ y は半セル（例 7.5）になりうる。`arrivalIsWall()` は float の
// footprint で判定する∴半セル位置では 2 行に跨る ⇒ 1 行だけ開けると「たまに入れない」。

import { TILE } from '../shared/tiles.js';

/** 通路にする行（上下端でない・計測帯 rows 4/5 でもない2行）。 */
export const ARENA_DOOR_ROWS = [7, 8];

/**
 * 通路を持つアリーナ（tests/test-stage-keys.js の名前）。
 * 28,0〜38,0 の横並び1列＝左右の外周を開けると隣同士が歩いて繋がる。
 * ⚠️ 27,0 `sword_beast` は水路と壁で東半分が埋まっている（通路にならない）∴含めない
 *    ＝28,0 から西へ出ようとしても着地が壁で遷移がキャンセルされるだけ（無害）。
 * ⚠️ 2026-08-16、ユーザーが 32,0 に空きアリーナ（`spare_arena`＝敵なし・通路だけ開けた
 *    通り抜け部屋）を挿入した＝以降の4枚のキーが +1 ずれた（test-stage-keys.js を追従済み）。
 *    この列の順序は**ステージキーの並び順と一致していなければならない**（②の実機走破が
 *    隣接キーを前提に歩く）∴名前を足すときは座標順に入れる。
 */
export const DOOR_ARENAS = [
	'sword_beast_arena',   // 28,0
	'burrow_worm',         // 29,0
	'leap_spider',         // 30,0
	'bat_swarm',           // 31,0 ⚠️ 内部は水帯で東西が分断されている＝徒歩の横断にははしごが要る
	'spare_arena',         // 32,0 敵なし（ユーザーが挿入・生成スクリプトの管轄外）
	'shield_knight',       // 33,0
	'fire_turtle',         // 34,0
	'split_slime',         // 35,0
	'rupee_eater',         // 36,0
	'bomb_ogre',           // 37,0 ⚠️ 内部に壁(4,7)が1枚ある（爆弾が壁を越える検証用）＝徒歩の横断は rows 7/8 で通る
	'boomerang_ogre',      // 38,0
];

/**
 * Phase 8-4 (2)「実プレイでリバランスを確かめる行」＝ y=1 の横並び34枚（2026-08-23）。
 * ユーザー依頼「試して欲しいボス敵・ザコ敵を test_mechanics の二行目（x,1 の行）に
 * 並べて、ステージの間に壁なしで移動できるように」。
 *
 * 1体/1ステージ（アリーナ作法と同じ＝どの敵の手応えを見ているのか混ざらない）。
 * 並び順（＝x 座標）は scripts/migrate-test-balance-row.mjs が ENEMY_META から導出する：
 *   陸/空ザコ → 水棲ザコ → 陸ボス → 水棲ボス → ラスボス（Z は最後）。
 * ⚠️ この配列は「宣言」側＝migrate が導出結果と突き合わせて食い違えば止まる
 *    （敵を1種足したら migrate が「表に無い」と言う＝黙って並びがずれない）。
 * ⚠️ 順序はステージキーの並び順と一致していなければならない（歩いて渡る検査が
 *    隣接キーを前提にする）。DOOR_ARENAS と同じ制約。
 */
export const BALANCE_ARENAS = [
	'bal_patrol',           // 0,1
	'bal_chaser',           // 1,1
	'bal_sentry',           // 2,1
	'bal_skeleton',         // 3,1
	'bal_sword_beast',      // 4,1
	'bal_burrow_worm',      // 5,1
	'bal_leap_spider',      // 6,1
	'bal_bat_swarm',        // 7,1
	'bal_shield_knight',    // 8,1
	'bal_fire_turtle',      // 9,1
	'bal_split_slime',      // 10,1
	'bal_rupee_eater',      // 11,1
	'bal_bomb_ogre',        // 12,1
	'bal_boomerang_ogre',   // 13,1
	'bal_curse_fire',       // 14,1
	'bal_poison_leech',     // 15,1
	'bal_sorcerer',         // 16,1
	'bal_charge_boar',      // 17,1
	'bal_fish_school',      // 18,1 ← ここから水棲（bgTiles の水帯 rows 4/5）
	'bal_lurk_shark',       // 19,1
	'bal_archer_fish',      // 20,1
	'bal_monster',          // 21,1 ← ここからボス
	'bal_boss',             // 22,1
	'bal_dark_lord',        // 23,1
	'bal_fire_salamander',  // 24,1
	'bal_ice_leviathan',    // 25,1
	'bal_sand_scorpion',    // 26,1
	'bal_sea_serpent',      // 27,1
	'bal_forest_giant',     // 28,1
	'bal_storm_eagle',      // 29,1
	'bal_rock_golem',       // 30,1
	'bal_swamp_toad',       // 31,1
	'bal_sea_lord',         // 32,1 水棲ボス
	'bal_zarnel',           // 33,1 ⚠️ ラスボス＝撃破でエンディング∴**行の最後**に置く
];

/**
 * 通路で繋がった「鎖」の一覧。鎖の中では隣り合うステージへ歩いて抜けられる
 * （鎖をまたぐ移動は無い＝行が違う／間に水路のステージが挟まる）。
 */
export const DOOR_CHAINS = [DOOR_ARENAS, BALANCE_ARENAS];

/**
 * そのアリーナの通路セル（[row, col] の配列）。左右の外周それぞれ ARENA_DOOR_ROWS の2セル。
 * @param {number} cols
 * @returns {Array<[number, number]>}
 */
export function arenaDoorCells(cols) {
	return ARENA_DOOR_ROWS.flatMap(r => [[r, 0], [r, cols - 1]]);
}

/** 通路セルかどうか。 */
export function isArenaDoor(r, c, cols) {
	return ARENA_DOOR_ROWS.includes(r) && (c === 0 || c === cols - 1);
}

/**
 * グリッド（文字の2次元配列）に通路を開ける。生成スクリプトはこれを通してから書き込む
 * ＝「外周は全部壁」の盤面を書いて通路を潰す事故を構造的に起こせなくする。
 * @param {string[][]} grid
 * @returns {string[][]} 同じ grid（破壊的に変更）
 */
export function openArenaDoors(grid) {
	const cols = grid[0].length;
	for (const [r, c] of arenaDoorCells(cols)) {
		if (grid[r] === undefined) throw new Error(`通路の行 ${r} が盤面に無い（rows=${grid.length}）`);
		grid[r][c] = TILE.FLOOR;
	}
	return grid;
}
