// 「境界を跨ぐ鍵扉」（両画面に D を描いた1枚の扉）を片面だけにする
// （2026-08-06 / ユーザー報告「D6 でパズルをクリアして鍵をとって左のステージに移動したら
//  ドアの上に埋まって動けなくなった」の修理）。
//
// 何が壊れていたか：
//   D4/D6/D7/D8 のボス入口と dark_tower の2枚は、1枚の扉を鍵部屋側と着地側の**両面**に
//   D で描いていた（DECISIONS.md 2026-07-29 決定2＝検査は畳んで1枚と数える）。
//   ところがエンジンの扉は**部屋単位**（player.js collectDoorRun は部屋内の連結成分だけ、
//   ss.openedDoors も部屋ごと）∴鍵部屋側を鍵1個で開けて隣室へ抜けると、隣室側の D は
//   閉じたまま残り、その閉じた扉セルの中に着地する（game.js arrivalTileBlocked は 'D' を
//   常に着地可としていた）。半セル移動＋floor(v+0.5) のタイル解決のため、そこから4方向
//   すべての次の半歩が同じ扉セルに解決される＝**一切動けない**。鍵は消費済み∴自力で開けられず、
//   セーブにも残る恒久詰み（実測：鍵2個持たせると抜けられる＝1枚の扉に鍵2個かかっていた）。
//
// 直し方（この2点セットで初めて塞がる）：
//   ① 着地側の D を ';'（常時開放の境界通路）にして、扉は鍵部屋側の1面だけにする（このスクリプト）。
//   ② 閉じた 'D' への着地を拒否する（game.js arrivalTileBlocked）。
//      ①だけだと将来また両面 D を置いた瞬間に同じ埋まりが起きる／②だけだと着地側の扉が
//      永久に開かない（＝ボス部屋に入れない）∴両方入れる。
//
// どちらの面を残すか：**鍵 'K' がある部屋側を残す**（プレイヤーは鍵を持っている側から扉に触る）。
// 両面に K がある／どちらにも K が無い場合は判断できない∴error で止める（黙って進行不能にしない）。
//
// 使い方:
//   node scripts/migrate-boundary-doors.mjs --dry   # 検出のみ
//   node scripts/migrate-boundary-doors.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const DOOR = 'D';
const DOORWAY = ';';   // 常時開放出入り口（ステージ境界の通路）

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const tileAt = (stage, r, c) => (Array.isArray(stage?.tiles?.[r]) ? stage.tiles[r][c] : undefined);
const hasKeyTile = (stage) => (stage?.tiles ?? []).some(row => row.includes('K'));

// 境界セル (r,c) に対する隣室の対向セル。境界でなければ null。
function mirrorOf(stageKey, stage, r, c) {
  const [x, y] = stageKey.split(',').map(Number);
  const rows = stage.tiles.length;
  const cols = stage.tiles[0].length;
  if (r === 0)        return [`${x},${y - 1}`, rows - 1, c];
  if (r === rows - 1) return [`${x},${y + 1}`, 0, c];
  if (c === 0)        return [`${x - 1},${y}`, r, cols - 1];
  if (c === cols - 1) return [`${x + 1},${y}`, r, 0];
  return null;
}

let changed = 0;
const pairsSeen = new Set();

for (const [layerName, layer] of Object.entries(data.layers ?? {})) {
  const stages = layer.stages ?? {};
  for (const [stageKey, stage] of Object.entries(stages)) {
    if (!Array.isArray(stage.tiles)) continue;
    for (let r = 0; r < stage.tiles.length; r++) {
      for (let c = 0; c < stage.tiles[r].length; c++) {
        if (tileAt(stage, r, c) !== DOOR) continue;
        const mirror = mirrorOf(stageKey, stage, r, c);
        if (!mirror) continue;
        const [mKey, mr, mc] = mirror;
        const mStage = stages[mKey];
        if (!mStage || tileAt(mStage, mr, mc) !== DOOR) continue;   // 片面のみ＝既に正しい

        // 同じ論理扉を両側から2回処理しないための識別子。
        const id = [layerName, ...[`${stageKey}:${r},${c}`, `${mKey}:${mr},${mc}`].sort()].join('|');
        if (pairsSeen.has(id)) continue;
        pairsSeen.add(id);

        const keyHere = hasKeyTile(stage);
        const keyThere = hasKeyTile(mStage);
        if (keyHere === keyThere) {
          throw new Error(`[${layerName}] 境界扉 [${stageKey}](${r},${c}) ↔ [${mKey}](${mr},${mc}) は`
            + `どちらの面を残すか判断できない（鍵 'K' が ${keyHere ? '両室にある' : 'どちらの室にも無い'}）`
            + '＝設計を確認して手で直す');
        }
        // 鍵が無い側＝プレイヤーが着地してくる側。そこを常時開放の通路にする。
        const [dropKey, dropStage, dr, dc] = keyHere
          ? [mKey, mStage, mr, mc]
          : [stageKey, stage, r, c];
        dropStage.tiles[dr][dc] = DOORWAY;
        changed++;
        console.log(`- [${layerName}] [${dropKey}] (${dr},${dc}) の 'D' → ';'`
          + `（扉は鍵のある [${keyHere ? stageKey : mKey}] 側に残す）`);
      }
    }
  }
}

console.log(`\n両面 D を片面化したセル: ${changed} 個`);
if (!changed) {
  console.log('（対象なし＝既に修理済み）');
} else if (DRY) {
  console.log('--dry: 書き込みなし');
} else {
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
  console.log('書き込み完了:', MAP_PATH);
}
