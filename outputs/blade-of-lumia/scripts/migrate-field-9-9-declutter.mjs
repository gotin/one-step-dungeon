#!/usr/bin/env node
/**
 * migrate-field-9-9-declutter.mjs (Phase 9-6-BASE 外周解体・湖W拡張の前提整備)
 *
 * field/9,9（D3レイクショア入口）はテスト用に作られた secret_grotto の2入口
 * （茂み焼き 4,8 / 笛reveal 5,3）を含め、要素が過密（ユーザー指摘）。
 * ユーザー確定（2026-08-20 ディスカッション）＝笛じゃない方（4,8・茂み焼き系）
 * の入口は閉じる。笛の方（5,3・「空中の遺跡」ロア）は残す。
 *
 * やること: 9,9 の (4,8) mapEnter/showConditions を削除し、タイルを床に戻す。
 * 茂み自体（4,7 'u'）とNPC「怪しい旅人」(4,5) は残す＝削除後は「茂みを燃やし
 * ても意味ない」が本当に正しくなる（皮肉が効く・矛盾しない）。
 *
 * 自己検証: 書き込み前に (a) 4,8 が本当に削除対象の入口である (b) 5,3 は変更
 * しない (c) secret_grotto/0,0 の唯一の出口セル 5,2 は無傷 (d) destId=
 * 'secret_grotto' を参照する field 側 mapEnter が書き込み後ちょうど1つ（5,3
 * だけ）になる、の4点を assert する。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = map.layers.field.stages;
const s = field['9,9'];

// ── 事前検証 ──
if (!s) throw new Error('field/9,9 が見つからない');
if (!s.mapEnters?.['4,8'] || s.mapEnters['4,8'].destId !== 'secret_grotto') {
  throw new Error('9,9 の 4,8 は想定した secret_grotto 入口ではない');
}
if (s.mapEnters?.['5,3']?.destId !== 'secret_grotto') {
  throw new Error('9,9 の 5,3 が secret_grotto 入口でない＝残す対象が見当たらない');
}
if (s.tiles[4][8] !== '>') {
  throw new Error(`9,9 tiles[4][8] は '>' のはず（実際: ${s.tiles[4][8]}）`);
}
const grotto = map.layers.secret_grotto?.stages?.['0,0'];
if (!grotto?.mapEnters?.['5,2'] || grotto.mapEnters['5,2'].id !== 'secret_grotto') {
  throw new Error('secret_grotto/0,0 の出口セル 5,2 が想定と違う');
}

// ── 変更 ──
s.tiles[4][8] = '.';
delete s.mapEnters['4,8'];
delete s.showConditions['4,8'];

// ── 事後検証 ──
if (s.mapEnters['4,8']) throw new Error('4,8 の mapEnter が残っている');
if (s.showConditions['4,8']) throw new Error('4,8 の showConditions が残っている');
if (s.tiles[4][8] !== '.') throw new Error('4,8 のタイルが床になっていない');
if (s.mapEnters['5,3']?.destId !== 'secret_grotto') throw new Error('5,3 が変わってしまった');

let secretGrottoRefs = 0;
for (const [, ld] of Object.entries(map.layers)) {
  for (const [, sd] of Object.entries(ld.stages ?? {})) {
    for (const [, e] of Object.entries(sd.mapEnters ?? {})) {
      if (e.destId === 'secret_grotto') secretGrottoRefs++;
    }
  }
}
if (secretGrottoRefs !== 1) {
  throw new Error(`secret_grotto への field 側入口は1つのはず（実際: ${secretGrottoRefs}）`);
}

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
console.log('✅ field/9,9: 茂み焼き系 secret_grotto 入口 (4,8) を削除。笛reveal入口 (5,3) は残置。');
console.log(`   secret_grotto への field 側参照は ${secretGrottoRefs} 件（想定どおり）。`);
