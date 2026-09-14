// バグ修正（2026-09-14・field 9,15 → cave_1 入口）
//
// field 9,15 の `>`（(8,10)・destId:'cave_1'）は `showConditions[8,10]:{trigger:'allSwitchesOn'}`
// で隠された入口。だが室内にボタン 'S' が4個（(4,5)(4,7)(5,5)(5,7)）あるのに石 '*' が
// **0個**だった。ボタンはモーメンタリ式（乗っている間だけON）＝プレイヤー1人では4個を
// 同時にONにできず、`allSwitchesOn` が永久に成立しない＝cave_1 の入口が実質封鎖されていた。
// `check-field-connectivity.mjs` が reachable と出すのはパズルの解けるかを検証しない
// 緩い近似だから（本当のバグを見逃す）。
//
// 同じ型の他2箇所（field 12,2／13,4）はボタン数=石数で解ける設計＝ここも同じ比率に直す。
// 各ボタンの隣に石を1個置き、1回のプッシュで乗る（他の2箇所と同じ「隣接1手」の作り）。
//   (4,4)→右へ押す→(4,5)　(4,8)→左へ押す→(4,7)　(5,4)→右へ押す→(5,5)　(5,8)→左へ押す→(5,7)
//
// 石碑の文言も直す＝①「入口はすぐ右」は位置的に誤り（実際は5行下・5列右）②「石を押して
// 扉を開く仕掛けが多くある」は cave_1 の内容（石パズル0個）の説明として誤り。実際は
// **この部屋自身**の仕掛けの説明に直す（方角の断定はやめる）。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = resolve(HERE, '../work/blade-of-lumia.json');

const LAYER = 'field';
const STAGE = '9,15';
const STONE_TILE = '*';   // TILE.STONE
const BUTTON_TILE = 'S';  // TILE.BUTTON
const SIGN_POS = '3,5';

// [r, c] に石を置く座標＝各ボタンの隣（押せば1手で乗る）。
const STONE_CELLS = [[4, 4], [4, 8], [5, 4], [5, 8]];
const BUTTON_CELLS = [[4, 5], [4, 7], [5, 5], [5, 7]];

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const sd = map.layers?.[LAYER]?.stages?.[STAGE];
if (!sd) throw new Error(`stage not found: ${LAYER} ${STAGE}`);

// ── 事前アサート ───────────────────────────────────────────
for (const [r, c] of BUTTON_CELLS) {
  if (sd.tiles[r][c] !== BUTTON_TILE) throw new Error(`(${r},${c}) はボタンでない＝想定と違う`);
}
for (const [r, c] of STONE_CELLS) {
  if (sd.tiles[r][c] !== '.') throw new Error(`(${r},${c}) は床でない '${sd.tiles[r][c]}'＝別の物を潰す`);
}
const allTilesFlat = sd.tiles.flat();
if (allTilesFlat.filter(t => t === STONE_TILE).length !== 0) {
  throw new Error('石が既にある＝二重に置く事故');
}
if (!sd.npcData?.[SIGN_POS]) throw new Error(`(${SIGN_POS}) の npcData が無い＝直す対象が消えている`);

// ── 書き換え：石を4個置く ────────────────────────────────────
for (const [r, c] of STONE_CELLS) {
  if (!Array.isArray(sd.tiles[r])) throw new Error(`${LAYER} ${STAGE} 行が配列でない`);
  sd.tiles[r][c] = STONE_TILE;
}

// ── 書き換え：石碑の文言を実態に合わせる ────────────────────
// ⚠️ 「ボタン」は check-dialog-integrity.mjs の禁止語（帯1の外の操作説明）に引っかかる
// （実際に一度「ボタン」で書いて⚠️を出した＝2026-09-14）＝「台座」に言い換えて回避。
// ⚠️ 既存 tests/field-connectivity.spec.js「沼地の洞窟への道に鍵・扉のヒント石碑がある」が
// この文言に /鍵|扉/ を要求する＝「扉が開ける」を残す（実際に「道が開ける」で書いて
// このテストを赤くした＝2026-09-14）。
sd.npcData[SIGN_POS].lines = [
  '【沼地の洞窟】',
  '沼地の奥に潜む古い洞窟。',
  '石を運び 台座に乗せる 仕掛けがある。',
  '四つ揃えば 扉が開ける。',
];

// ── 事後アサート ───────────────────────────────────────────
for (const [r, c] of STONE_CELLS) {
  if (sd.tiles[r][c] !== STONE_TILE) throw new Error(`(${r},${c}) 書き換えに失敗`);
}
for (const row of sd.tiles) {
  if (row.length !== sd.cols) throw new Error('行の長さが変わった');
}
if (sd.tiles.length !== sd.rows) throw new Error('行数が変わった');
const stoneCount = sd.tiles.flat().filter(t => t === STONE_TILE).length;
if (stoneCount !== 4) throw new Error(`石が ${stoneCount} 個ある＝4個でない`);

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));

console.log(`直した: ${LAYER} ${STAGE}`);
console.log(`  石4個を配置: ${STONE_CELLS.map(([r, c]) => `(${r},${c})`).join(' ')}`);
console.log(`  石碑(${SIGN_POS})の文言を修正`);
