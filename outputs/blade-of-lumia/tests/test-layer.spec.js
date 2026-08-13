// tests/test-layer.spec.js — ギミック検証レイヤー（test_mechanics）がライブマップに
// 同居していても本編を壊さない、という不変条件。
//
// 経緯（2026-07-25）：検証ステージは tests/fixtures/test-stages.json に隔離していたが、
// fixture はエディタで開けず、直すたびに生 JSON の手編集になって作業しづらかった
// （ユーザー指摘）。∴ ライブマップ（work/blade-of-lumia.json）の `test_mechanics`
// レイヤーへ移設した。エディタのレイヤータブ・ワールドグリッド・キャンバス編集・
// プレビューがそのまま使えるかわりに、「全レイヤーを横断して数える／検査する」コードが
// 検証ステージを本編と誤認するリスクを負う。実害が出るのは主にこの3つ：
//   ① shared/triforce.js countTriforces()   … 必要な星の欠片が増えてクリア不能になる
//      （検証ステージには dropsTriforce のボス 'J'(ladder_water2) と 'L'(melee_only_boss)
//        が置いてある＝素朴に数えると 8 → 10 になる）
//   ② game/boss.js altarExists()            … テスト用の祭壇で終盤フローが誤作動する
//   ③ scripts/lib/field-quality.mjs warpEnterLandings() … 受け側の無いテスト用ワープが
//      不正着地として赤くなる（candle_gate の candle_gate_exit → candle_gate_dest）
// 除外判定は shared/layers.js（isTestLayer / gameLayerEntries）に1箇所だけ置く。
//
// このスペックが守るもの：
//   ① 星の欠片の総数は 8（テストレイヤーのボスを数えない）
//   ② テストレイヤーのキー接頭辞は test_・本編レイヤーは test_ で始まらない
//   ③ 検証ステージのキーはすべてグリッド座標（エディタのワールドグリッドに出る）
//   ④ tests/test-stage-keys.js の対応表とライブマップの実体が一致している
//   ⑤ startPos は本編（field）を指す＝テストレイヤーがゲーム開始位置を奪わない

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { countTriforces } from '../shared/triforce.js';
import { isTestLayer, gameLayerEntries } from '../shared/layers.js';
import { TEST_LAYER, TEST_STAGE_KEYS } from './test-stage-keys.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

test.describe('ギミック検証レイヤーとライブマップの同居', () => {
	test('① 星の欠片の総数は 8（テストレイヤーのボスを数えない）', () => {
		expect(countTriforces(MAP)).toBe(8);

		// 素朴に全レイヤーを数えると増える＝除外が効いていることの証明（vacuous pass 防止）。
		// countTriforces と同じ数え方（欠片タイル・魔王・dropsTriforce ボス）を除外なしで回す。
		let naive = 0;
		for (const ld of Object.values(MAP.layers)) {
			for (const sd of Object.values(ld.stages ?? {})) {
				for (const row of sd.tiles ?? []) {
					for (const t of row) {
						if (t === TILE.ITEM_TRIFORCE_PIECE || t === TILE.DARK_LORD
							|| ENEMY_META[t]?.dropsTriforce) naive++;
					}
				}
			}
		}
		expect(naive, 'テストレイヤーに dropsTriforce のボスが無い＝この検査が無意味になっている')
			.toBeGreaterThan(8);
	});

	test('② テストレイヤーは test_ 接頭辞・本編レイヤーは非 test_', () => {
		expect(MAP.layers[TEST_LAYER], `${TEST_LAYER} レイヤーが無い`).toBeTruthy();
		expect(isTestLayer(TEST_LAYER)).toBe(true);
		for (const [lk] of gameLayerEntries(MAP)) {
			expect(isTestLayer(lk), `本編レイヤー ${lk} が test_ 接頭辞を持っている`).toBe(false);
		}
	});

	test('③ 検証ステージのキーはすべてグリッド座標（エディタに出る）', () => {
		// editor/editor-world.js は `k.split(',').map(Number)` でキーを座標と解釈する。
		// 名前キーだと NaN になりワールドグリッドに出てこない＝移設の意味が無くなる。
		for (const key of Object.keys(MAP.layers[TEST_LAYER].stages)) {
			const parts = key.split(',');
			expect(parts.length, `キー ${key} が x,y 形式でない`).toBe(2);
			for (const p of parts) {
				expect(Number.isInteger(Number(p)), `キー ${key} が整数座標でない`).toBe(true);
			}
		}
	});

	test('④ 名前↔座標の対応表とライブマップの実体が一致する', () => {
		const live = Object.keys(MAP.layers[TEST_LAYER].stages).sort();
		const table = Object.values(TEST_STAGE_KEYS).sort();
		expect(live).toEqual(table);
		// comment に元の名前が [name] で残っている（エディタで開いたとき何のテストか分かる）。
		for (const [name, key] of Object.entries(TEST_STAGE_KEYS)) {
			const sd = MAP.layers[TEST_LAYER].stages[key];
			expect(sd, `${name} → ${key} のステージが無い`).toBeTruthy();
			expect(sd.comment ?? '', `${key} の comment に [${name}] が無い`).toContain(`[${name}]`);
		}
	});

	test('⑤ startPos は本編 field を指す（テストレイヤーが開始位置を奪わない）', () => {
		expect(isTestLayer(MAP.startPos?.layer)).toBe(false);
		expect(MAP.startPos?.layer).toBe('field');
	});
});
