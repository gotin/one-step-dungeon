// ── tests/test-stage-keys.js ── ギミック検証ステージの名前 → グリッド座標（単一の真実）
//
// ギミック検証ステージは 2026-07-25 に tests/fixtures/test-stages.json から
// ライブマップ（work/blade-of-lumia.json）の `test_mechanics` レイヤーへ移設した。
// 理由：fixture はエディタで開けず、テストステージを直すたびに生 JSON を手編集する
// ことになって作業しづらかった（ユーザー指摘）。ライブマップに置けばレイヤータブ・
// ワールドグリッド・キャンバス編集・プレビューがそのまま使える。
//
// ⚠️ ステージキーはグリッド座標でなければならない。editor/editor-world.js は
// `k.split(',').map(Number)` でキーを座標として解釈する（getWorldSize / insertRow /
// insertCol / renderWorldGrid）ので、`lurk_shark` のような名前キーは NaN になり、
// ワールドグリッドにステージが出てこない＝移設の目的が達成できない。
//
// ∴ 実体は座標キー、テストコードからは名前で引く。その対応表がこのファイル。
// スペックは `stageKey('lurk_shark')` と書く（座標を直書きしない：レイアウトを
// 並べ替えたときに全スペックを直す羽目になる）。
// scripts/migrate-test-layer-to-live.mjs もこの表を読んで移設する＝表が唯一の定義。
//
// レイアウトは y=0 の1行に横並び（x=宣言順）。ステージを足すときは次の x を使う。

export const TEST_LAYER = 'test_mechanics';

/** 名前 → ライブマップ上のステージキー（`x,y`）。 */
export const TEST_STAGE_KEYS = {
	color_switch:     '0,0',
	torch_relay:      '1,0',
	arrow_switch:     '2,0',
	bomb_wall:        '3,0',
	enemy_stone:      '4,0',
	hidden_cave_test: '5,0',
	ladder_isolated:  '6,0',
	ladder_pit:       '7,0',
	ladder_water2:    '8,0',
	bow_gate:         '9,0',
	double_door:      '10,0',
	candle_gate:      '11,0',
	melee_only_boss:  '12,0',
	fish_swim:        '13,0',
	fish_swim_bg:     '14,0',
	lurk_shark:       '15,0',
	archer_fish:      '16,0',
	ladder_bg_bridge: '17,0',
	tide_gate:        '18,0',
	sea_lord:         '19,0',
	// 石パズルのお試し4枚（Phase 4.6 方法論の実プレイ検証）。易/中/難は石3、激難は石4。
	// 盤面は scripts/generate-sokoban-playable.mjs が生成・4軸測定し、
	// scripts/migrate-test-sokoban-tiers.mjs が測定値を再現確認して書き込んだもの。
	sokoban_easy:     '20,0',
	sokoban_medium:   '21,0',
	sokoban_hard:     '22,0',
	sokoban_extreme:  '23,0',
	// 合成パズル（石＋色スイッチ/色ゲート）の枠。**2026-08-02 現在は再設計中**（PLAN 実行キュー
	// 4.7＝色ゲートを「石の搬送路」ではなく「プレイヤーの通路」に使う形。設計は
	// PUZZLE-DESIGN.md §3-2e）。24,0 には旧盤面（解なし）が残置されている＝新パズルを
	// 書き込むまでこのキーを参照するテストは無い。
	sokoban_color:    '24,0',
	// 回帰フィクスチャ（旧 Phase 5-1「合成」の盤面をそのまま退避したもの）＝石3＋色スイッチ／
	// 色ゲートの直列2枚。2026-08-02 に「閉じた門の中に立って石を押せない」バグ修正を入れた結果
	// **解なし**になった＝パズルではなく、抜け道（閉じた門の中に立って石を先へ押す）の回帰用。
	// ⚠️ 石を**開いた**門へ押し込むのは正当（廊下C3 = field 15,14 がその設計）。
	// 24,0 から 25,0 へ退避した理由＝24,0 を可解なパズルに作り直すと「解けたら失敗」の
	// assert が成立しなくなる。石 (4,4) が赤ゲート (4,5) の隣＝抜け道を実機で直接踏める
	// ジオメトリはこの盤面しか無い∴捨てずに座標を移した。
	sokoban_gate_push_regression: '25,0',
};

/**
 * 検証ステージ名 → ステージキー。未知の名前は即エラー（typo で別ステージを
 * 開いてテストが無言で通る／落ちるのを防ぐ）。
 * @param {string} name
 * @returns {string}
 */
export function stageKey(name) {
	const key = TEST_STAGE_KEYS[name];
	if (!key) {
		throw new Error(
			`未知のテストステージ名: ${name}（tests/test-stage-keys.js の表に追加すること）`,
		);
	}
	return key;
}
