// ダンジョン進行の背骨を修復する（2026-08-05 / PLAN 実行キュー5番）。
//
// このスクリプトが直すのは3つ。
//
//  ① links: {} → []
//     game/conditions.js refreshGates は links を for...of で回す。`{}` は反復不可＝
//     TypeError。refreshGates は enterStage から必ず呼ばれるので、該当部屋は
//     **入室した瞬間に board も描かれずゲームが死ぬ**。dungeon_5 / dungeon_8 は
//     ほぼ全部屋がこれで、2ダンジョンまるごとプレイ不能だった。
//     （コード側にも Array.isArray ガードを入れたが、データも正しい形にしておく。）
//
//  ② dungeon_5〜8 の鍵部屋 [1,0] に鍵 K を1個ずつ追加
//     この4ダンジョンは鍵扉 D があるのに K が0個＝ボス部屋に永久に入れなかった。
//     置き場所 (5,7) は D4 の既存 K と同じ座標で、4ダンジョン全てで床かつ
//     「扉の手前」＝新しい詰みを作らない。
//
//  ③ 全ての鍵に showConditions {trigger:'killAll'} を付ける
//     床に置いただけの鍵は歩いて拾うだけで、進行の壁として意味を持たない。
//     killAll＝その部屋の敵を全滅させると鍵が出現する。鍵部屋には全て中ボス級の
//     敵（W など）が居るので、条件が最初から満たされていることはない。
//     2026-08-05 ユーザー確定：まず killAll で背骨を通し、難易度の強化は後続タスク。
//     既に条件付きの D3 / D4 はそのまま（冪等）。
//
// 使い方:
//   node scripts/migrate-dungeon-keys.mjs --dry   # 差分だけ表示
//   node scripts/migrate-dungeon-keys.mjs         # 書き込み
//
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// ② の追加先。[レイヤー, 部屋, 行, 列]
const NEW_KEYS = [
  ['dungeon_5', '1,0', 5, 7],
  ['dungeon_6', '1,0', 5, 7],
  ['dungeon_7', '1,0', 5, 7],
  ['dungeon_8', '1,0', 5, 7],
];

// ③ の対象レイヤー。ここに挙げたレイヤーの K は全て killAll 関門付きにする。
const GATE_KEY_LAYERS = [
  'dungeon_1', 'dungeon_2', 'dungeon_3', 'dungeon_4',
  'dungeon_5', 'dungeon_6', 'dungeon_7', 'dungeon_8',
  'dark_tower',
];

const log = [];

// ── ① links: {} → [] （全レイヤー横断。同じクラッシュは test_mechanics にもあった） ──
let linksFixed = 0;
for (const [layerName, layer] of Object.entries(data.layers)) {
  for (const [stageKey, stage] of Object.entries(layer.stages || {})) {
    if (stage.links === undefined || Array.isArray(stage.links)) continue;
    const before = JSON.stringify(stage.links);
    if (before !== '{}') {
      throw new Error(`予期しない links の中身: ${layerName} [${stageKey}] = ${before}`
        + ' ← 空でないオブジェクトを配列に潰すと連動が消える。手で確認せよ');
    }
    stage.links = [];
    linksFixed++;
  }
}
log.push(`① links {} → [] : ${linksFixed} 部屋`);

// ── ② 鍵 K の追加 ──────────────────────────────────────────────────────────
let keysAdded = 0;
for (const [layerName, stageKey, r, c] of NEW_KEYS) {
  const stage = data.layers[layerName]?.stages?.[stageKey];
  if (!stage) throw new Error(`部屋が無い: ${layerName} [${stageKey}]`);
  const row = stage.tiles[r];
  if (!Array.isArray(row)) {
    throw new Error(`tiles が文字配列でない: ${layerName} [${stageKey}] row ${r}`
      + ' ← 行文字列にするとテストが緑でも実ゲームが落ちる');
  }
  if (row[c] === 'K') { log.push(`   ${layerName} [${stageKey}] (${r},${c}) は既に K（skip）`); continue; }
  if (row[c] !== '.') {
    throw new Error(`床でないセルに K を置こうとした: ${layerName} [${stageKey}] (${r},${c}) = '${row[c]}'`);
  }
  row[c] = 'K';
  keysAdded++;
}
log.push(`② 鍵 K 追加 : ${keysAdded} 個`);

// ── ③ 全ての鍵に killAll 関門を付ける ──────────────────────────────────────
let gated = 0, alreadyGated = 0;
for (const layerName of GATE_KEY_LAYERS) {
  const layer = data.layers[layerName];
  if (!layer) throw new Error(`レイヤーが無い: ${layerName}`);
  for (const [stageKey, stage] of Object.entries(layer.stages || {})) {
    for (let r = 0; r < stage.rows; r++) {
      for (let c = 0; c < stage.cols; c++) {
        if (stage.tiles[r]?.[c] !== 'K') continue;
        const posKey = `${r},${c}`;
        if (!stage.showConditions) stage.showConditions = {};
        if (stage.showConditions[posKey]) { alreadyGated++; continue; }
        // 関門にするには「その部屋に倒せる敵が居る」ことが前提。敵ゼロの部屋に
        // killAll を置くと開幕で条件が満たされ、関門が飾りになる。
        const hasEnemy = /[WECFVXZALNJOUGI]/.test(
          stage.tiles.map(row => (Array.isArray(row) ? row.join('') : row)).join('')
        );
        if (!hasEnemy) {
          throw new Error(`敵の居ない部屋に killAll 関門を付けようとした: ${layerName} [${stageKey}] (${posKey})`
            + ' ← 開幕で条件が満たされ関門にならない');
        }
        stage.showConditions[posKey] = { trigger: 'killAll' };
        gated++;
      }
    }
  }
}
log.push(`③ killAll 関門 : ${gated} 個追加 / ${alreadyGated} 個は既存`);

for (const line of log) console.log(line);

if (DRY) {
  console.log('\n--dry: 書き込みなし');
} else {
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
  console.log('\n書き込み完了:', MAP_PATH);
}
