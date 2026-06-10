// resize_stages.mjs
// dungeon_1 の全ステージを 12×10 に拡張するスクリプト
// 実行: node resize_stages.mjs

import { readFileSync, writeFileSync } from 'fs';

const path = './outputs/blade-of-lumia/work/blade-of-lumia.json';
const data = JSON.parse(readFileSync(path, 'utf8'));

const TARGET_COLS = 12;
const TARGET_ROWS = 10;
const WALL = '#';
const FLOOR = '.';

let modified = 0;

for (const [layerKey, layer] of Object.entries(data.layers ?? {})) {
  for (const [stageKey, stage] of Object.entries(layer.stages ?? {})) {
    const { cols, rows, tiles } = stage;
    if (cols === TARGET_COLS && rows === TARGET_ROWS) continue; // すでに正しいサイズ

    console.log(`[${layerKey}/${stageKey}] ${cols}x${rows} → ${TARGET_COLS}x${TARGET_ROWS}`);

    // 新しいタイル配列を作成
    const newTiles = [];
    for (let r = 0; r < TARGET_ROWS; r++) {
      const newRow = [];
      for (let c = 0; c < TARGET_COLS; c++) {
        if (r === 0 || r === TARGET_ROWS - 1 || c === 0 || c === TARGET_COLS - 1) {
          // 外周は壁
          newRow.push(WALL);
        } else if (r < rows && c < cols) {
          // 元のデータを使う（外周の壁は上書き済みなので内部のみ）
          // ただし元の外周（r=0, r=rows-1, c=0, c=cols-1）は既に壁なのでそのまま
          newRow.push(tiles[r][c]);
        } else {
          // 追加された領域：外周でなければ床（右端・下端の内側）
          newRow.push(FLOOR);
        }
      }
      newTiles.push(newRow);
    }

    stage.cols = TARGET_COLS;
    stage.rows = TARGET_ROWS;
    stage.tiles = newTiles;
    modified++;
  }
}

if (modified > 0) {
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`✅ ${modified} ステージを ${TARGET_COLS}×${TARGET_ROWS} に変換しました`);
} else {
  console.log('変更なし（すべて既に正しいサイズ）');
}
