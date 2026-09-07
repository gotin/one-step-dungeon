#!/usr/bin/env node
/**
 * migrate-field-13-5-dungeon-entrance.mjs
 *
 * field/13,5（ルミアの村・D5「氷の廃墟」の入口がある画面）の MAP_ENTER を
 * 8,5 → 3,9（鍵 4,9 の真上）へ移す。ユーザー報告（2026-09-07）＝
 * 「鍵を取るための移動ルート上にダンジョン入口があって邪魔」。
 *
 * 8,5 が邪魔な理由（実測・.scratch/13-5-route.mjs の状態空間 BFS）：
 *   家のドア 6,5 の真下 7,5 は、西が商人 'b'(7,4)・東が石碑 'i'(7,6) で塞がれた
 *   1セルの袋小路で、**唯一の出口が 8,5**。∴家から出る／東の石パズルへ向かう／
 *   西や南の隣画面へ抜ける、そのすべてが 8,5 を踏む＝毎回ダンジョンに落ちる。
 *   対照実験でも 8,5 だけが「壁にすると他のセルを失う」唯一のセルだった。
 *
 * 3,9 を選んだ理由：
 *   ・ユーザー指定の「鍵の上側」。石碑 7,6 の「→ 入口はすぐ右」とも噛み合う
 *     （石碑を読む位置＝東の袋小路 7,8/8,7 の側にパズルの先の入口がある）。
 *   ・状態空間 BFS の対照実験で「必須でない」＝3,9 を壁にしても他の 63 セルは
 *     全部到達できる∴どのルートも 3,9 を通らずに済む（＝踏むのは自分の意思のとき）。
 *   ・鍵 4,9 と同じ袋小路にある＝「石を2回押して奥へ入る」1つの目的地にまとまる。
 *
 * ⚠ この '>' は `id: 'field_dungeon5'` を持つ＝dungeon_5/1,3 の 7,2 から戻るときの
 *   **着地セル**でもある（shared/exits.js buildExitRegistry）。∴移設は帰り道の
 *   着地点も動かす。3,9 に着地しても詰まないこと（石を南へ押し下げて町へ戻れる）を
 *   .scratch/13-5-route.mjs の BFS で確認済み。
 *
 * 自己検証：書き込み前後に (a) 8,5 が本当に dungeon_5 入口である (b) 3,9 が素の床で
 * 何のメタデータも持たない (c) 移設後 dungeon_5 への入口がちょうど1つ (d) 'field_dungeon5'
 * を指す側（dungeon_5/1,3 の 7,2）が壊れていない、を assert する。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const FROM = { r: 8, c: 5 };
const TO   = { r: 3, c: 9 };
const fk = `${FROM.r},${FROM.c}`;
const tk = `${TO.r},${TO.c}`;

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const s = map.layers.field?.stages?.['13,5'];

// ── 事前検証 ──
if (!s) throw new Error('field/13,5 が見つからない');
if (s.tiles[FROM.r][FROM.c] !== '>') {
  throw new Error(`13,5 tiles[${FROM.r}][${FROM.c}] は '>' のはず（実際: ${s.tiles[FROM.r][FROM.c]}）`);
}
const enter = s.mapEnters?.[fk];
if (enter?.destId !== 'dungeon_5' || enter?.id !== 'field_dungeon5') {
  throw new Error(`${fk} は想定した D5 入口ではない（実際: ${JSON.stringify(enter)}）`);
}
if (s.tiles[TO.r][TO.c] !== '.') {
  throw new Error(`移設先 ${tk} は素の床のはず（実際: ${s.tiles[TO.r][TO.c]}）`);
}
for (const key of ['mapEnters', 'showConditions', 'chestContents', 'npcData', 'shopData',
  'breakableWalls', 'floorItems']) {
  if (s[key]?.[tk]) throw new Error(`移設先 ${tk} に ${key} が既にある`);
}
// 鍵（ユーザーが追加し直した 4,9）を巻き込んでいないこと
if (s.tiles[4][9] !== 'K') throw new Error(`4,9 の鍵が無い（実際: ${s.tiles[4][9]}）`);

// ── 変更 ──
s.tiles[FROM.r][FROM.c] = '.';
s.tiles[TO.r][TO.c] = '>';
s.mapEnters[tk] = { ...enter };
delete s.mapEnters[fk];

// ── 事後検証 ──
if (s.tiles[FROM.r][FROM.c] !== '.') throw new Error(`${fk} が床になっていない`);
if (s.tiles[TO.r][TO.c] !== '>')     throw new Error(`${tk} が '>' になっていない`);
if (s.mapEnters[fk])                 throw new Error(`${fk} の mapEnter が残っている`);
if (s.mapEnters[tk]?.destId !== 'dungeon_5' || s.mapEnters[tk]?.id !== 'field_dungeon5') {
  throw new Error(`${tk} の mapEnter が移っていない`);
}
if (s.tiles[4][9] !== 'K') throw new Error('4,9 の鍵が消えた');

// dungeon_5 への入口はちょうど1つ／'field_dungeon5' を指す側はちょうど1つ
let toD5 = [], toField = [];
for (const [lk, ld] of Object.entries(map.layers)) {
  for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
    for (const [cell, e] of Object.entries(sd.mapEnters ?? {})) {
      if (e.destId === 'dungeon_5')      toD5.push(`${lk}/${sk}@${cell}`);
      if (e.destId === 'field_dungeon5') toField.push(`${lk}/${sk}@${cell}`);
    }
  }
}
if (toD5.length !== 1 || toD5[0] !== `field/13,5@${tk}`) {
  throw new Error(`dungeon_5 への入口が想定外: ${toD5.join(' ')}`);
}
if (toField.length !== 1) {
  throw new Error(`field_dungeon5 への戻り口が想定外: ${toField.join(' ')}`);
}

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
console.log(`✅ field/13,5: D5 入口を ${fk} → ${tk}（鍵 4,9 の真上）へ移設。`);
console.log(`   家のドア前 ${fk} は素の床に戻した＝家から出るだけでダンジョンに落ちない。`);
console.log(`   戻り口（${toField[0]} → field_dungeon5）の着地セルも ${tk} に移る。`);
