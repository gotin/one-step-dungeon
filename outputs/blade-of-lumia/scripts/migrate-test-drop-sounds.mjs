// キュー90：落とし物を拾った音の試し場を test_mechanics の 0,2・1,2 に作る（2026-10-19・ユーザー提案「test_mechanicsの0,2とかにアイテムを床においておいて」）
//
// 敵の落とし物は盤面のタイルではない（倒したときに出る一時的な物・5 秒で消える）∴タイルでは置けない。
// 画面データの `testSetup`（game.js applyTestSetup＝テスト層でだけ効く）で「入るたびに置く」。
// プレビューは常に無敵で HP が減らない∴プレイヤーの状態も画面側で揃え、2 画面に分ける：
//   0,2 drop_sounds      ＝ HP 2・爆弾 2・矢 2 で始まる＝4 種とも増える音（ルピー・ハート・爆弾・矢）
//   1,2 drop_sounds_full ＝ HP 満タン・爆弾 8・矢 8 で始まる＝ハート・爆弾・矢は「増えなかった」音
//      #  #  #  #  #  #  #  #  #  #  #  #
//      #  .  .  .  .  .  .  .  .  .  .  #
//      #  i  .  .  .  .  .  .  .  .  .  #   ← 看板 (2,1)
//      #  .  .  .  .  .  .  .  .  .  .  #
//      #  .  .  R  .  H  .  B  .  A  .  #   ← 落とし物 (4,3)(4,5)(4,7)(4,9)
//      #  .  .  .  .  .  .  .  .  .  .  #
//      #  .  .  .  .  .  .  .  .  .  .  #
//      #  .  .  .  .  .  @  .  .  .  .  #   ← 立ち位置 (7,6)
//      #  .  .  .  .  .  .  .  .  .  .  #
//      #  #  #  #  #  #  #  #  #  #  #  #
// 再実行しても同じ結果（冪等）。
//   node scripts/migrate-test-drop-sounds.mjs --dry   # 差分のみ
//   node scripts/migrate-test-drop-sounds.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_STAGE_KEYS } from '../tests/test-stage-keys.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(HERE, '../work/blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const ROWS = 10, COLS = 12;
function room() {
	const tiles = [];
	for (let r = 0; r < ROWS; r++) {
		const row = [];
		for (let c = 0; c < COLS; c++) row.push(r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 ? '#' : '.');
		tiles.push(row);
	}
	tiles[2][1] = 'i';
	return tiles;
}
const DROPS = [{ r: 4, c: 3, type: 'rupee' }, { r: 4, c: 5, type: 'heart' }, { r: 4, c: 7, type: 'bomb' }, { r: 4, c: 9, type: 'arrow' }];

const STAGES = {
	drop_sounds: {
		comment: '[drop_sounds] キュー90 落とし物を拾った音の試し場（増える側）。入るたびに testSetup でルピー・ハート・爆弾・矢を床に置き、HP 2・爆弾 2・矢 2 にする＝4 種とも増える音が鳴る。scripts/migrate-test-drop-sounds.mjs が書き込む（手編集しない）。',
		testSetup: { player: { hp: 2, bombs: 2, arrows: 2 }, floorDrops: DROPS },
		sign: ['落とし物の音（増える）', 'ルピー＝チャリン／ハート＝ポワン／爆弾＝ゴトッ・ジジッ／矢＝カシャッ', '入り直すと置き直す（HP 2・爆弾 2・矢 2 に戻る）。'],
	},
	drop_sounds_full: {
		comment: '[drop_sounds_full] キュー90 落とし物を拾った音の試し場（満タン側）。入るたびに testSetup でハート・爆弾・矢を床に置き、HP 満タン・爆弾 8・矢 8 にする＝増えなかった音（ポン↓）が鳴る。scripts/migrate-test-drop-sounds.mjs が書き込む（手編集しない）。',
		testSetup: { player: { hp: 99, bombs: 8, arrows: 8 }, floorDrops: DROPS.filter((d) => d.type !== 'rupee') },
		sign: ['落とし物の音（満タン）', 'ハート・爆弾・矢が満タンのとき＝小さく下がる「ポン↓」（増えなかった）', '入り直すと置き直す。'],
	},
};

const text = readFileSync(MAP_PATH, 'utf8');
const data = JSON.parse(text);
const stages = data.layers.test_mechanics.stages;
for (const [name, def] of Object.entries(STAGES)) {
	const key = TEST_STAGE_KEYS[name];
	if (!key) throw new Error(`test-stage-keys.js に ${name} が無い`);
	if (stages[key] && !String(stages[key].comment ?? '').startsWith(`[${name}]`)) throw new Error(`${key} は別の画面が使っている`);
	stages[key] = {
		comment: def.comment,
		tiles: room(), bgTiles: {}, links: [],
		signData: { '2,1': { name: def.sign[0], lines: def.sign.slice(1) } },
		testSetup: def.testSetup,
		rows: ROWS, cols: COLS,
	};
	console.log(`${key} ${name}：落とし物 ${def.testSetup.floorDrops.length}`);
}
const out = JSON.stringify(data, null, 2) + (text.endsWith('\n') ? '\n' : '');
if (out === text) console.log('変更なし');
else if (DRY) console.log('（--dry：書き込まない）');
else { writeFileSync(MAP_PATH, out); console.log('書き込んだ'); }
