// ── shared/layers.js ── レイヤーの種別判定（単一の真実）─────────
//
// ライブマップ（work/blade-of-lumia.json）には「本編のレイヤー」と
// 「ギミック検証用のテストレイヤー」が同居する（2026-07-25 ユーザー確定）。
// テストステージを別ファイル（tests/fixtures/test-stages.json）に置くと
// エディタで開けず作業しづらいため、ライブマップに取り込んだ。
//
// ⚠️ そのかわり「全レイヤーを横断して数える／検査する」コードは、
// テストレイヤーを必ず除外しないと本編のゲーム挙動を壊す。実害の例：
//   - shared/triforce.js countTriforces()  … 必要な星の欠片数が増えてクリア不能になる
//   - game/boss.js altarExists()           … テスト用の祭壇で終盤フローが誤作動する
//   - scripts/lib/field-quality.mjs warpEnterLandings() … テスト用ワープが不正着地として赤くなる
//
// ∴ 判定はこのファイルの1箇所だけに置く。呼び手が個別に文字列比較を書くと、
// 新しいテストレイヤーを足したときに必ずどれかが漏れる。
//
// 命名規約＝`test_` で始まるレイヤーキーはテスト専用（現在は `test_mechanics` のみ）。

/** テスト専用レイヤーのキー接頭辞（この規約でしか判定しない）。 */
export const TEST_LAYER_PREFIX = 'test_';

/**
 * レイヤーキーがテスト専用か。
 * @param {string} layerKey
 * @returns {boolean}
 */
export function isTestLayer(layerKey) {
	return typeof layerKey === 'string' && layerKey.startsWith(TEST_LAYER_PREFIX);
}

/**
 * mapData.layers から本編レイヤーだけを [key, layerData] で返す。
 * 「全レイヤー横断」の走査はこれを使う（Object.entries(mapData.layers) を直接回さない）。
 * @param {object} mapData
 * @returns {Array<[string, object]>}
 */
export function gameLayerEntries(mapData) {
	return Object.entries(mapData?.layers ?? {}).filter(([lk]) => !isTestLayer(lk));
}
