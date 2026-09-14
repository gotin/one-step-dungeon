// 実行キュー17-1：⑧の死データを手当てする移行スクリプト（2026-09-14）
//
// `scripts/check-dialog-integrity.mjs`（このタスクで新設）が検出した「読めない本文」
// （signData/npcData がタイル i/P/a/b/$ 以外の上にある＝combat.js の読み取り経路を
// 一度も通らず誰にも読めない）を、その座標のタイルを看板 'i' に差し替えて解決する。
//
// ⚠️ field 2件（PLAN.md 17 ⑧ の記述どおり）に加え、check-dialog-integrity.mjs が
//    ダンジョン内で新たに7件見つけた（ザーネルの記憶・仕掛けヒント等）。ユーザー確定
//    （2026-09-14）＝9件まとめて今すぐ直す。
//
// 直し方＝「本文はそのまま・タイルだけ看板にする」（[[blade-sign-two-formats]] と同じ
// 作法＝データの置き場所は変えず、combat.js が読める場所へ寄せる）。npcData/signData の
// どちらに居るかは変えない（swordAttack の `signData ?? npcData` フォールバックが効く）。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = resolve(HERE, '../work/blade-of-lumia.json');

const SIGN_TILE = 'i'; // TILE.SIGN

// [layer, stage, r, c, store, expectedFromTile]
const FIXES = [
  ['field',      '13,5', 6, 11, 'npcData', 't'],
  ['field',      '9,15', 3, 5,  'npcData', '.'],
  ['dungeon_1',  '2,2',  4, 3,  'npcData', '.'],
  ['dungeon_3',  '1,3',  1, 9,  'npcData', '.'],
  ['dungeon_4',  '1,3',  1, 9,  'npcData', '.'],
  ['dungeon_4',  '1,2',  8, 1,  'signData', '.'],
  ['dungeon_4',  '3,3',  7, 1,  'signData', '.'],
  ['dungeon_6',  '1,3',  1, 9,  'npcData', '.'],
  ['dungeon_7',  '1,3',  1, 9,  'npcData', '.'],
];

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const results = [];

for (const [layer, stage, r, c, store, fromTile] of FIXES) {
  const sd = map.layers?.[layer]?.stages?.[stage];
  if (!sd) throw new Error(`stage not found: ${layer} ${stage}`);
  if (!Array.isArray(sd.tiles[r])) throw new Error(`${layer} ${stage} の tiles 行が配列でない`);

  const before = sd.tiles[r][c];
  if (before !== fromTile) {
    throw new Error(`${layer} ${stage} (${r},${c}) は '${fromTile}' ではなく '${before}'＝想定と違う（別の物を潰す危険）`);
  }
  const entry = sd[store]?.[`${r},${c}`];
  if (!entry) throw new Error(`${layer} ${stage} (${r},${c}) に ${store} が無い＝直す対象が消えている`);

  sd.tiles[r][c] = SIGN_TILE;

  // 事後アサート：行の長さ・行数が変わっていないこと。
  if (sd.tiles[r].length !== sd.cols) throw new Error(`${layer} ${stage} 行の長さが変わった`);
  if (sd.tiles.length !== sd.rows) throw new Error(`${layer} ${stage} 行数が変わった`);
  if (sd.tiles[r][c] !== SIGN_TILE) throw new Error(`${layer} ${stage} (${r},${c}) 書き換えに失敗`);

  results.push({ layer, stage, r, c, before, name: entry.name });
}

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));

console.log(`直した: ${results.length}件`);
for (const r of results) {
  console.log(`  [${r.layer} ${r.stage}] (${r.r},${r.c}) '${r.before}' -> '${SIGN_TILE}'（${r.name}）`);
}
