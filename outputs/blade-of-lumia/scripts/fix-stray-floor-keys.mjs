// 余剰の「床置き鍵」（floorItems の item:'key'）を削除する
// （2026-08-06 / PLAN 実行キュー 5.5f の途中で見つけた既存バグの修理）。
//
// 何が壊れていたか：
//   dungeon_6 / dungeon_7 / dungeon_8 の鍵部屋 [1,0] はどれも**鍵を2個持っていた**——
//   タイル 'K'(5,7) と floorItems['6,5'] = { type:'item', item:'key' }。
//   ところが check-dungeon-integrity.mjs の keyCells() は **タイル 'K' しか数えていなかった**
//   ∴検査(6)「鍵の数 == 鍵扉の枚数」は緑のまま、実ゲームでは鍵が3個余っていた。
//   player.keys はグローバルなので、余剰の3個で **dark_tower の鍵扉2枚をパズル抜きで開けられる**
//   ＝5.5 で積み上げている関門（倉庫番・弓・はしご…）を丸ごと迂回できる状態だった。
//   さらに D6 の鍵部屋は 5.5f で「敵を置かない倉庫番」になる∴余剰鍵に付いていた
//   `killAll` 関門は永久に成立しない（＝拾えない鍵が床に残る）。
//
// 直し方（この2点セットで初めて塞がる）：
//   ① 余剰の床置き鍵とその showConditions エントリを削除する（このスクリプト）。
//   ② keyCells() が floorItems の鍵も数えるようにする（check-dungeon-integrity.mjs 側）。
//      ①だけでは同じ事故が再発する／②だけでは検査(6) が今すぐ赤くなる∴①→②の順で入れる。
//
// 安全弁：「同じ部屋にタイル 'K' が既にある床置き鍵」だけを消す（＝重複の削除）。
// 同室に 'K' が無い床置き鍵はその部屋の唯一の鍵かもしれない∴削除せず error にする
// （黙って進行不能にしないため）。
//
// 使い方:
//   node scripts/fix-stray-floor-keys.mjs --dry   # 検出のみ
//   node scripts/fix-stray-floor-keys.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const tileAt = (stage, r, c) => {
  const row = stage.tiles?.[r];
  if (row === undefined || row === null) return undefined;
  return (Array.isArray(row) ? row : String(row).split(''))[c];
};
const hasKeyTile = (stage) => {
  for (let r = 0; r < (stage.rows ?? 0); r++) {
    for (let c = 0; c < (stage.cols ?? 0); c++) if (tileAt(stage, r, c) === 'K') return true;
  }
  return false;
};

let removed = 0;
for (const [layerName, layer] of Object.entries(data.layers ?? {})) {
  for (const [stageKey, stage] of Object.entries(layer.stages ?? {})) {
    for (const [cell, item] of Object.entries(stage.floorItems ?? {})) {
      if (item?.item !== 'key') continue;
      if (!hasKeyTile(stage)) {
        throw new Error(`[${layerName}] [${stageKey}] (${cell}) の床置き鍵は同室に 'K' タイルが無い`
          + '＝この部屋の唯一の鍵かもしれないので自動削除しない（設計を確認してから手で直す）');
      }
      const cond = stage.showConditions?.[cell];
      delete stage.floorItems[cell];
      if (cond) delete stage.showConditions[cell];
      removed++;
      console.log(`- [${layerName}] [${stageKey}] floorItems['${cell}'] の鍵を削除`
        + `（同室のタイル 'K' と重複）${cond ? ` ＋ showConditions['${cell}'] (${cond.trigger}) も削除` : ''}`);
    }
  }
}

console.log(`\n余剰の床置き鍵: ${removed} 個`);
if (!removed) {
  console.log('（削除対象なし＝既に修理済み）');
} else if (DRY) {
  console.log('--dry: 書き込みなし');
} else {
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
  console.log('書き込み完了:', MAP_PATH);
}
