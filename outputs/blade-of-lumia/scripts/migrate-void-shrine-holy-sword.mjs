#!/usr/bin/env node
/**
 * migrate-void-shrine-holy-sword.mjs
 *   新レイヤー `void_shrine`（虚空の祠）＝**聖剣 swordTier 3** の寄道を作る（キュー 8.5番）。
 *   入口は field `8,1`「虚空の谷」東台地に新設する `>`(6,9)＝**翼の羽衣（飛行）でしか立てない**。
 *
 * このスクリプトは「入口・中身・鍵」を1回で作る（PLAN 8.5）。鍵が壊れたまま中身だけ足すと
 * 到達不能な死んだ内容が増えるだけなので、下記2件の**必須修理も同梱する**：
 *
 *   修理① 祭壇 `'^'` が世界に1枚も無い（2026-08-23 発覚）。
 *     `scripts/migrate-dark-tower.mjs` が `field 7,1` (5,5) に置いた `'^'` を、後から走った
 *     `scripts/migrate-field-grassland-c.mjs` が石碑 `'i'` で潰していた（しかもその石碑の文が
 *     「かつて 祭壇が あった」＝祭壇を潰した看板が過去形で祭壇を説明していた）。
 *     ∴`game/player.js` の `TILE.ALTAR` 分岐が永久に発火せず `offerAtAltar()` を呼べない
 *     ＝`player.hasWingRobe` が立たない＝羽衣ゲート（`game/game.js:1319`）が開かない
 *     ＝`field 8,1` / `dark_tower` / この `void_shrine` の全部が到達不能。さらに欠片を全部
 *     集めると `checkTriforceClear()` が `altarExists()` 偽のフォールバックへ落ちて
 *     **最終ダンジョンを飛ばして即エンディング**になる（`game/boss.js:441-463`）。
 *     → 石段 `'o'` の塊の内側 (3,6) に `'^'` を戻し、(5,5) の石碑を現在形に書き直す。
 *
 *   修理② 塔の扉が踏めない（9-2T bug①）。`field 8,0` (3,2) の MAP_ENTER
 *     （`{id:'fieldToTower', destId:'darkTower'}`）のタイルが `'M'`＝踏めない＝羽衣を得ても
 *     ラスダンに入れない。→ (3,2) を `'>'` にする（`isPassable` は「実際に入るセル」しか
 *     見ない∴row3 を横に歩く分には1セル開ければ踏める）。
 *
 * 2部屋:
 *   0,0「虚空の石車堂」… `test_mechanics 26,0`（4.7 でユーザーが editor で確定し実プレイ合格した
 *       色ゲート合成盤面＝石4＋色ゲート2＋色スイッチ2）の**移植**。AI は幾何を試行錯誤しない
 *       （4.7/5.5i でユーザーが2度撤回した進め方）。変更は3箇所だけ＝
 *         (a) row1（test 層の連絡廊下）を閉じて入口 `>`(1,1) と石碑 `'i'`(1,3) にする
 *         (b) 箱の奥の宝箱 `B(8,6)`（テスト用ルピー200）を聖剣の間へ通じる `>` に差し替える
 *         (c) (6,7) の壁 → ゲート `'T'`＝移植元に潜んでいたソフトロックの修理
 *             （ロック前の挙動は壁と完全に同じ＝解き筋は1手も変わらない。下記 ②ⓔⓕⓖ・④C3）
 *       笛 `fluteEffect:{type:'resetStones'}` も移植する（石の詰みの救済＝下記④）。
 *   1,0「聖剣の間」… 番人（剣獣 μ×2・盾騎士 ζ×2・呪い火 ψ＝脅威度 39.0）を全滅させると
 *       `showConditions{trigger:'killAll'}` の封印が解け、北の壁龕の宝箱から聖剣が出る。
 *
 * 自己検証（遷移は実エンジンの写し `scripts/lib/blade-solver.mjs` 単一ソース）:
 *   ① 幾何：12×10・**外周は全部 `'#'`**（画面遷移で出入りしない＝`'>'` の対だけが出入口）。
 *   ② 移植の構造証明（軽い・常時）：ⓐ移植元 26,0 の10行を期待リテラルで固定
 *      ⓑ移植先の rows 0・2〜9 が移植元と1文字も違わない（(8,6) の `B`→`>` と
 *        (6,7) の `#`→`T`＝ソフトロックの修理を除く）
 *      ⓒrow1 は `#>.i########`＝パズル箱への口は (2,2) だけ
 *      ⓓ**石は row1 にも (8,6) にも永久に入れない**（押しの幾何から機械的に証明）
 *      ⓔ**石は逃げ道ゲート (6,7) にも永久に入れない**／隣にボタンが無い＝足踏みで通れない
 *      ⓕ(6,7) を T にしても**新しい射線が1本も生えない**（矢は閉じたゲートを貫通する∴
 *        4方向の射線が先に壁で止まることを確認する。これを見落として (4,8) 案を撤回した）
 *      ⓖ全状態探索の実測で**ロック前に (6,7) を踏める状態が1つも無い**
 *      ∴パズルの解き筋（ロック前）は移植で1手も変わらない。数値の帰結は `--measure`。
 *   ③ 到達：壁でないセルは全部使われる（無駄セル0）／石碑に隣接できる（読める）。
 *   ④ 入って詰まない（笛の救済を含めた形）：`resetStones` は**プレイヤーを動かさず**石を初期
 *      セルへ戻し `activeColor` も消す（`game/game.js:1545-1609`）∴
 *        C1 どのセル×どの色から始めても「石が初期配置」の状態から入口 (1,1) へ帰れる
 *        C2 石の初期セル `'*'` の上でリセットした場合も、1歩で C1 の集合へ出られる
 *        C3 `stonesLocked`（笛が no-op になるケース）でも入口へ帰れる
 *      ＝**任意の状態から「笛→帰還」の経路が必ずある**。解けることは入口の初期状態から
 *      goal (8,6) への到達で示す（色が 1/2 で残った場合も解ける理由はコード内のコメント参照）。
 *   ⑤ 報酬：宝箱が `'B'`＋`showConditions{killAll}`＋`{type:'weapon', swordTier:3}`＝聖剣。
 *   ⑥ 敵：脅威度 39.0（寄道最重 `secret_grotto 2,0`=33.5 より重く本編最重 `dark_tower 1,2`=50
 *      より軽い）・外周と着地セル（とその隣接）に敵を置かない・向き別スプライトに向きがある・
 *      床/敵 ≥ 10・`EXTRA_ENEMY_ROOMS` に宣言済み。
 *   ⑦ 進行：`shared/progression.js` の ORDER に void_shrine が載っており、その位置で全道具を持つ。
 *   ⑧ 入口の対：field `8,1`(6,9) ↔ `0,0`(1,1)／`0,0`(8,6) ↔ `1,0`(8,5) の id が対で衝突なし。
 *   ⑨ 修理①②が実データに入っている（`'^'` が1枚以上ある・塔の扉が `'>'`）。
 *
 * 使い方:
 *   node scripts/migrate-void-shrine-holy-sword.mjs [--dry]
 *   node --max-old-space-size=12288 scripts/migrate-void-shrine-holy-sword.mjs --dry --measure
 *     ⚠️ 既定でも `0,0` の全状態探索（約270万状態・20秒前後）を1回走らせる（無駄セル検査）。
 *        `--measure` は 4軸測定を移植元/移植先の両方で回す＝さらに40秒＋大きなヒープが要る。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { SWORD_TIERS, BASE_ATK } from '../shared/items.js';
import { isHardBlocked } from './lib/connectivity.mjs';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { EXTRA_ENEMY_ROOMS, stageThreat } from './lib/enemy-placement.mjs';
import { ORDER, toolsUsableIn } from '../shared/progression.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const DRY = process.argv.includes('--dry');
const MEASURE = process.argv.includes('--measure');

const LAYER = 'void_shrine';
const SRC_LAYER = 'test_mechanics';
const SRC_KEY = '26,0';

// 出入口の id（対で1つずつ・世界で一意）。
const ID_FIELD_DOOR = 'fieldToVoidShrine';      // field 8,1 (6,9)
const ID_SHRINE = 'voidShrine';                 // void_shrine 0,0 (1,1)
const ID_STONE_HALL = 'voidShrineStoneHall';    // void_shrine 0,0 (8,6)
const ID_SWORD_HALL = 'voidShrineSwordHall';    // void_shrine 1,0 (8,5)

// ── 移植元の期待リテラル（ⓐ：26,0 が後から編集されたらここが赤くなる）────────────
const SRC_ROWS = [
  '############',
  '............',   // test 層の連絡廊下（(1,0)/(1,11) が隣画面へ開いている）
  '##.#########',   // パズル箱への唯一の口 (2,2)
  '#S.*.....S##',
  '#.#.#.#*#.##',
  '#.(....)..##',
  '#..#*#.#*.##',
  '#S....#..S##',
  '##]##TB#[###',
  '############',
];
// 移植先 row1＝外周として閉じ、入口 '>'(1,1)・廊下 (1,2)・石碑 'i'(1,3) だけを残す。
// 'i' は `passable.js` で通行不可＝壁と同じ∴パズル箱の状態空間に影響しない。
const PORT_ROW1 = '#>.i########';
const MOUTH = '2,2';       // パズル箱への唯一の口
const PORT_GOAL = '8,6';   // 旧宝箱 B ＝聖剣の間への '>'
const PORT_ENTRY = '1,1';
// 移植元 26,0 に潜んでいたソフトロックの修理（2026-08-23・このスクリプトの ④C3 が検出）。
//   東の袋（(4,9)(5,8)(5,9)(6,8)(6,9)(7,7)(7,8)(8,8)）の出口は
//     ・(3,9) のボタン ・(5,7) の青門 の2つだけ。
//   石を4つ全部ボタンに乗せた後（stonesLocked＝笛の救済も no-op）は (3,9) が石で塞がり、
//   青のまま袋へ入って中の赤スイッチ '[' (8,8) を叩くと青門も閉じて**永久に閉じ込められる**
//   （色を戻す手段が袋の中に無い・石も押せない・笛も効かない）。実測 16 状態が該当。
//   → (6,7)（元は '#'）をゲート 'T' にする。'T' は「全ボタン ON」でしか開かない∴
//     ・解いている間（ロック前）は壁と全く同じ＝パズルの状態空間を1手も変えない
//       （足でボタンを踏んで一時 ON にしても、そのときプレイヤーはボタンの上に居る＝
//        (6,7) に隣接していない∴通れない。隣4セルにボタンが無いことを assert する）
//     ・石は永久に (6,7) へ入れない（4方向すべてで「押す足が壁」か「石の出発セルが
//       ボタンでない」＝T が開く条件と両立しない。これも assert する）
//     ・ロック後だけ開いて東の袋と中央を繋ぐ＝閉じ込めが消える
//   ＝「解けたパズルは壊さず、詰みだけを消す」最小の修理。石車堂の石碑にも一言入れる。
//
// ⚠️ 最初は (4,8) に置こうとして撤回した（2026-08-23）。ソルバー/実エンジンの**矢は閉じた
//    ゲート 'T' を通り抜ける**（止まるのは WALL と未破壊 '!' だけ＝blade-solver.mjs:263-281／
//    projectile.js）∴(4,8) を T にすると列8に新しい射線が通り、row3 から南へ矢を撃つだけで
//    東の袋の中の赤スイッチ (8,8) を遠隔で叩けてしまう＝**パズルが変わる**（ロック前の状態が
//    実測で +522,976 増えた）。(6,7) は4方向すべての射線が先に壁で止まる＝新しい射線が
//    1本も生えない（下の ⓕ で assert）。実測差＝+152 状態・全部 locked=1・消えた状態 0。
const ESCAPE_GATE = { r: 6, c: 7, from: TILE.WALL };

// ── field 側の3箇所（入口1・修理2）────────────────────────────────────────────
const FIELD_DOOR = { stage: '8,1', r: 6, c: 9 };          // 新設する祠の扉（東台地）
const FIELD_SIGN = { stage: '8,1', cell: '7,2' };          // 既存石碑へ1行追記
const FIELD_SIGN_ADD = '谷の向こう、塔の扉の南に もう一つの扉が見える。';
const ALTAR_FIX = { stage: '7,1', r: 3, c: 6, from: TILE.STONE_FLOOR };   // 修理①
const ALTAR_SIGN = { stage: '7,1', cell: '5,5' };
const TOWER_FIX = { stage: '8,0', r: 3, c: 2, from: TILE.MOUNTAIN };      // 修理②

// ── 小道具 ──────────────────────────────────────────────────────────────────
const key = (r, c) => `${r},${c}`;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const parse = (rows, label) => {
  if (rows.length !== ROWS) throw new Error(`${label}: 行数が ${rows.length}`);
  return rows.map((row, r) => {
    if (row.length !== COLS) throw new Error(`${label}: row${r} の列数が ${row.length}`);
    return [...row];
  });
};
const BG = Array.from({ length: ROWS }, () => Array(COLS).fill(TILE.FLOOR));
const FULL = { hasLadder: true, hasCandle: true };
const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

// 状態に依らず絶対に立てない/石が乗れないタイル（＝押しの幾何の証明に使う）。
const NEVER_PLAYER = new Set([TILE.WALL, TILE.SIGN, TILE.TORCH]);
const NEVER_STONE = new Set([
  TILE.WALL, TILE.SIGN, TILE.TORCH, TILE.CHEST, TILE.SWITCH_RED, TILE.SWITCH_BLUE,
]);

/**
 * ⓓ「セル (r,c) に石は永久に入れない」の機械的証明。
 * 石が動くのは押しだけ＝目標セルへ向きd で入るには「(r,c)-d に石が居る」かつ
 * 「(r,c)-2d にプレイヤーが立つ」が同時に要る∴4方向すべてでどちらかが
 * **状態に依らず不可能**なら、その石は永久に入れない。
 */
function stoneCanNeverEnter(tiles, r, c) {
  for (const [dr, dc] of DIRS) {
    const sr = r - dr, sc = c - dc;          // 押される前の石の位置
    const pr = r - 2 * dr, pc = c - 2 * dc;  // 押すプレイヤーの位置
    if (!inBounds(sr, sc) || !inBounds(pr, pc)) continue;      // 盤外からは押せない
    if (NEVER_STONE.has(tiles[sr][sc])) continue;              // そこに石は居られない
    if (NEVER_PLAYER.has(tiles[pr][pc])) continue;             // そこにプレイヤーは立てない
    return false;                                              // 押せる可能性が残る
  }
  return true;
}

/** 全状態を列挙して「プレイヤーが立てたセル ∪ 石が乗ったセル」を返す（逆辺は作らない）。 */
function exploreCells(S, startStates, guardMax, label) {
  const seen = new Set(startStates);
  const q = [...startStates];
  const used = new Set();
  const cells = new Set();
  const preLock = new Set();
  let head = 0;
  while (head < q.length) {
    if (head > guardMax) throw new Error(`${label}: 状態空間が ${guardMax} を超えた（設計を見直す）`);
    const st = q[head++];
    const f = st.split('|');
    used.add(f[0]);
    if (f[1]) for (const k of f[1].split(';')) used.add(k);
    cells.add(f[0]);
    if (f[5] === '0') preLock.add(f[0]);        // ロック前にプレイヤーが立てたセル
    for (const nx of S.nextStates(st)) if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
  }
  return { states: seen.size, used, cells, preLock };
}

/** startState から「pos が targets のどれか」の状態へ到達できるか（見つけ次第打ち切り）。 */
function canReachAny(S, startState, targets, guardMax, label) {
  if (targets.has(startState.split('|')[0])) return true;
  const seen = new Set([startState]);
  const q = [startState];
  let head = 0;
  while (head < q.length) {
    if (head > guardMax) throw new Error(`${label}: 帰還 BFS が ${guardMax} 状態を超えた`);
    for (const nx of S.nextStates(q[head++])) {
      if (seen.has(nx)) continue;
      if (targets.has(nx.split('|')[0])) return true;
      seen.add(nx); q.push(nx);
    }
  }
  return false;
}

/** 逆辺つき全探索（小さい部屋用＝聖剣の間）。 */
function exploreWithRev(S, startKey) {
  const [r, c] = startKey.split(',').map(Number);
  const start = S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
  const seen = new Set([start]);
  const rev = new Map();
  const q = [start];
  let head = 0;
  while (head < q.length) {
    if (head > 200000) throw new Error('聖剣の間の状態空間が大きすぎる（機構を増やしすぎ）');
    const st = q[head++];
    for (const nx of S.nextStates(st)) {
      if (!rev.has(nx)) rev.set(nx, []);
      rev.get(nx).push(st);
      if (seen.has(nx)) continue;
      seen.add(nx); q.push(nx);
    }
  }
  return { seen, rev };
}

const solverFor = (tiles, opt) => makeSolver(tiles, BG, [], {}, new Set(), opt);
// 壁として据え置くタイル（到達しなくてよい＝隣から使う物・岩壁）。
const PROP_TILES = new Set([TILE.WALL, TILE.SIGN, TILE.TORCH]);

// ── 実行 ────────────────────────────────────────────────────────────────────
const d = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
if (d.layers[LAYER]) throw new Error(`${LAYER} は既に存在する（このスクリプトは新設用）`);

// ── ② 移植元を読んで固定し、移植先を機械的に作る ─────────────────────────────
const src = d.layers[SRC_LAYER]?.stages?.[SRC_KEY];
if (!src) throw new Error(`移植元 ${SRC_LAYER}/${SRC_KEY} が無い`);
const srcTiles = src.tiles.map((row) => (Array.isArray(row) ? row.slice() : [...row]));
srcTiles.forEach((row, r) => {
  if (row.join('') !== SRC_ROWS[r])
    throw new Error(`ⓐ 移植元 ${SRC_KEY} の row${r} が期待と違う\n  実 ${row.join('')}\n  期 ${SRC_ROWS[r]}`);
});
if (src.fluteEffect?.type !== 'resetStones')
  throw new Error('ⓐ 移植元 26,0 の fluteEffect{resetStones} が無い（詰み救済の前提）');
if ((src.links ?? []).length)
  throw new Error('ⓐ 移植元 26,0 に links がある＝ゲート T の開閉条件が「全ボタン ON」だけでない');

const portTiles = srcTiles.map((row) => row.slice());
portTiles[1] = [...PORT_ROW1];
portTiles[8][6] = TILE.MAP_ENTER;               // B（ルピー200）→ 聖剣の間への '>'
if (portTiles[ESCAPE_GATE.r][ESCAPE_GATE.c] !== ESCAPE_GATE.from)
  throw new Error(`ⓔ 逃げ道ゲートの予定地 (${ESCAPE_GATE.r},${ESCAPE_GATE.c}) が '${ESCAPE_GATE.from}' でない`);
portTiles[ESCAPE_GATE.r][ESCAPE_GATE.c] = TILE.GATE;   // ロック後だけ開く逃げ道（ソフトロックの修理）

// ⓑ rows 0・2〜9 は (8,6)（出口）と (4,8)（逃げ道ゲート）以外1文字も違わない。
const PORT_DIFF = new Set([PORT_GOAL, key(ESCAPE_GATE.r, ESCAPE_GATE.c)]);
for (let r = 0; r < ROWS; r++) {
  if (r === 1) continue;
  for (let c = 0; c < COLS; c++) {
    if (PORT_DIFF.has(key(r, c))) continue;
    if (portTiles[r][c] !== srcTiles[r][c])
      throw new Error(`ⓑ 移植先 (${r},${c}) が移植元と違う（パズル箱を動かしてはいけない）`);
  }
}
if (srcTiles[8][6] !== TILE.CHEST) throw new Error('ⓑ 移植元 (8,6) が宝箱 B でない');
// ⓒ row1 の形とパズル箱への口。
if (portTiles[1].join('') !== PORT_ROW1) throw new Error('ⓒ 移植先 row1 が期待と違う');
{
  const mouths = [];
  for (let c = 0; c < COLS; c++) if (portTiles[2][c] !== TILE.WALL) mouths.push(key(2, c));
  if (mouths.length !== 1 || mouths[0] !== MOUTH)
    throw new Error(`ⓒ row2 の口が [${mouths.join(' ')}]（${MOUTH} の1つだけであること）`);
  for (let c = 0; c < COLS; c++)
    if (portTiles[0][c] !== TILE.WALL) throw new Error('ⓒ row0 が壁でない＝row1 へ北から入れる');
  if (portTiles[1][0] !== TILE.WALL || portTiles[1][COLS - 1] !== TILE.WALL)
    throw new Error('ⓒ row1 の両端が開いている＝隣画面へ抜けてしまう');
}
// ⓓ 石は「口 (2,2)」にも「(8,6)」にも永久に入れない。
//   row1 へ石が入るには必ず (2,2) を通る（row0 は全部壁・row1 の両端も壁・row1 に石の初期位置は無い）
//   ∴(2,2) を通れないことが「石は row1 に永久に入れない」の証明になる。
for (const cell of [MOUTH, PORT_GOAL]) {
  const [r, c] = cell.split(',').map(Number);
  if (!stoneCanNeverEnter(portTiles, r, c))
    throw new Error(`ⓓ (${cell}) に石が入り得る＝移植でパズルが変わる可能性がある`);
}
if (srcTiles[1].includes(TILE.STONE)) throw new Error('ⓓ 移植元 row1 に石の初期位置がある');
// ⓔ 逃げ道ゲート (4,8) が「ロック後だけ開く」ことの機械的証明。
//   前提＝ボタン4個・石4個（下の ④ でも assert）∴「全ボタン ON」は
//     (i) 石4個が4ボタンに乗っている（＝stonesLocked）か
//     (ii) 石3個＋プレイヤーの足が残り1つのボタンの上
//   のどちらか。
{
  const [er, ec] = [ESCAPE_GATE.r, ESCAPE_GATE.c];
  const buttonCells = [];
  portTiles.forEach((row, r) => row.forEach((ch, c) => { if (ch === TILE.BUTTON) buttonCells.push(key(r, c)); }));
  // (ii) のときプレイヤーはボタンの上に居る∴(4,8) に隣接していなければ通れない。
  for (const [dr, dc] of DIRS) {
    const nk = key(er + dr, ec + dc);
    if (buttonCells.includes(nk))
      throw new Error(`ⓔ 逃げ道ゲートの隣 ${nk} がボタン＝足踏みの一時 ON で通り抜けられる`);
  }
  // 石は (4,8) へ永久に入れない：押す足が壁 か、石の出発セルがボタンでない
  // （＝T が開く条件「全ボタンに石」と両立しない＝その石はそこに居られない）。
  for (const [dr, dc] of DIRS) {
    const sk = key(er - dr, ec - dc);          // 押される前の石
    const pk = key(er - 2 * dr, ec - 2 * dc);  // 押すプレイヤー
    const [sr, sc] = sk.split(',').map(Number);
    const [pr, pc] = pk.split(',').map(Number);
    if (!inBounds(sr, sc) || !inBounds(pr, pc)) continue;
    if (NEVER_PLAYER.has(portTiles[pr][pc])) continue;      // 押す足が壁
    if (!buttonCells.includes(sk)) continue;                 // T 開放時にその石はここに居られない
    throw new Error(`ⓔ 石が逃げ道ゲート (${er},${ec}) へ入り得る（${sk} から ${pk} で押す）`);
  }
  // ⓕ 矢の射線が生えないこと。矢は WALL と未破壊 '!' でしか止まらない（閉じたゲートも
  //   色ゲートも石も貫通する＝blade-solver.mjs:263-281 / projectile.js）∴壁を T に替えると
  //   その4方向の射線が延びる。延びた先に色スイッチ '[' ']' や 'Y' があると「遠くから色を
  //   変える」新しい手が生えてパズルが変わる（(4,8) 案がこれで没になった）。
  for (const [dr, dc] of DIRS) {
    let rr = er + dr, cc = ec + dc;
    while (inBounds(rr, cc)) {
      const ch = portTiles[rr][cc];
      if (ch === TILE.WALL || ch === TILE.BREAKABLE_WALL) break;
      if (ch === TILE.SWITCH_RED || ch === TILE.SWITCH_BLUE || ch === TILE.SWITCH)
        throw new Error(`ⓕ 逃げ道ゲート (${er},${ec}) の (${dr},${dc}) 方向に射線が通り `
          + `${key(rr, cc)}('${ch}') を遠隔で叩けてしまう＝パズルが変わる`);
      rr += dr; cc += dc;
    }
  }
}

// ── 盤面定義 ────────────────────────────────────────────────────────────────
const ROOMS = [
  {
    key: '0,0',
    title: '虚空の石車堂',
    tiles: portTiles,
    chestContents: {},
    mapEnters: {
      [PORT_ENTRY]: { id: ID_SHRINE, destId: ID_FIELD_DOOR },
      [PORT_GOAL]: { id: ID_STONE_HALL, destId: ID_SWORD_HALL },
    },
    fluteEffect: { type: 'resetStones' },
    signData: {
      '1,3': {
        name: '石車堂の碑',
        lines: [
          '【虚空の石車堂】',
          '赤の門と 青の門は 同時には開かぬ。',
          '門を叩いて 色を移し 石車を 四つの座へ。',
          '四つの座が 満ちれば 奥の扉と 東の壁も 開く。',
          '道を 誤ったら 笛を 吹け。石車は 座を 忘れる。',
        ],
      },
    },
    entry: PORT_ENTRY,
    goal: PORT_GOAL,
    comment: '[void_shrine 0,0] 虚空の石車堂＝test_mechanics 26,0（4.7 でユーザーが editor で確定・'
      + '実プレイ合格）の移植。変更は3点だけ＝(a) row1 を外周として閉じ入口 >(1,1)/石碑 i(1,3) に '
      + '(b) 宝箱 B(8,6)→聖剣の間への >(8,6) (c) (6,7) の壁→ゲート T'
      + '（移植元に潜んでいたソフトロックの修理＝石4個を全ボタンに乗せた後に東の袋 (7,8) 付近から'
      + '赤スイッチ (8,8) を叩くと青門も閉じ、石も笛も効かず永久に閉じ込められる 16 状態があった。'
      + 'T は「全ボタン ON」でしか開かない∴解いている間は壁と同じ・石は永久に入れない・'
      + '4方向の射線も先に壁で止まる。実測でロック前の状態は完全に同一＝増えた 152 状態は'
      + 'すべて locked=1・消えた状態 0）。パズルの解き筋（ロック前）は1手も変えていない。'
      + '実測＝状態 2,683,704・L=105・貪欲NG・デッドロック 2,184,141・最短解本数 320・'
      + '強制手率 0.20・ゴール状態 24（移植元 26,0 は 3,272,882／106／2,653,649／320／0.18／20'
      + '＝差は閉じた廊下10セルと逃げ道ゲートぶんだけ）。笛 resetStones は石の詰みの救済。',
  },
  {
    key: '1,0',
    title: '聖剣の間',
    // 北の壁龕 (1,5) の封印宝箱＝killAll。柱の塊 (4,4)-(5,7) が視線を切り、
    // その北面 (4,5) を石碑にする（歩けるセルを1つも潰さない）。
    // 着地 '>'(8,5) の隣接4セルには敵を置かない（入った瞬間に殴られない）。
    tiles: [
      '############',
      '#####B######',
      '#...ζ.ζ....#',
      '#..........#',
      '#...#i##...#',
      '#...####...#',
      '#..μ.ψ..μ..#',
      '#..........#',
      '#....>.....#',
      '############',
    ],
    chestContents: { '1,5': { type: 'weapon', swordTier: 3 } },
    showConditions: { '1,5': { trigger: 'killAll' } },
    mapEnters: { '8,5': { id: ID_SWORD_HALL, destId: ID_STONE_HALL } },
    enemyDirs: { '2,4': 'down', '2,6': 'down', '6,3': 'down', '6,8': 'down' },
    signData: {
      '4,5': {
        name: '聖剣の碑',
        lines: [
          '【聖剣の間】',
          'この地の 剣は 光を 断つために 鍛えられた。',
          '守り手を 一人残らず 沈めた者に 壁は 宝を 返す。',
        ],
      },
    },
    entry: '8,5',
    comment: '[void_shrine 1,0] 聖剣の間＝番人を全滅させると killAll 封印が解け聖剣（swordTier 3・'
      + 'ATK+12・ビーム＋貫通）が出る報酬部屋。剣獣 μ×2＋盾騎士 ζ×2＋呪い火 ψ＝脅威度 39.0'
      + '（寄道最重 secret_grotto 2,0=33.5 より重く本編最重 dark_tower 1,2=50 より軽い）。'
      + 'ζ は柱の北の壁龕の口を挟んで背を壁に付ける＝側面から回り込ませる。'
      + 'ψ は剣を封じる＝サブ武器で戦わせる。着地 (8,5) の隣接には敵を置かない。',
  },
];

// ── ① 幾何（外周は全部 '#'）───────────────────────────────────────────────
function checkRingClosed(room, tiles) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!(r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1)) continue;
    if (tiles[r][c] !== TILE.WALL)
      throw new Error(`① ${room.key}: 外周 ${key(r, c)} が '${tiles[r][c]}'＝画面遷移で出入りできてしまう`);
  }
}

// ── ③ 無駄セル0・石碑が読める ──────────────────────────────────────────────
function checkNoWaste(room, tiles, used, reached) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (PROP_TILES.has(tiles[r][c])) continue;
    if (!used.has(key(r, c)))
      throw new Error(`③ ${room.key}: ${key(r, c)}('${tiles[r][c]}') が使われない＝無駄セル`);
  }
  for (const k of Object.keys(room.signData ?? {})) {
    const [sr, sc] = k.split(',').map(Number);
    if (!DIRS.some(([dr, dc]) => reached.has(key(sr + dr, sc + dc))))
      throw new Error(`③ ${room.key}: 石碑 ${k} に隣接できない＝読めない`);
  }
}

// ── ④ 石車堂：笛の救済を含めた「入って詰まない」──────────────────────────────
//
// `resetStones`（game/game.js:1545-1609）はプレイヤーを動かさず
//   ss.stonePositions = {} ／ ss.activeColor = null に戻すだけ。no-op になるのは
//   (i) 石が1個も動いていない (ii) stonesLocked (iii) 全ボタンが石で埋まっている ＝(ii)と同義。
// ∴任意の状態から「笛→帰還」を保証するには次の3点で足りる：
//   C1 石が初期配置・色が {未設定,赤,青} のどれでも、どのセルからでも入口 (1,1) へ帰れる
//      （笛が効いた直後の状態そのもの。(i) の no-op ケースもこの集合に入る）
//   C2 プレイヤーが石の初期セル '*' に立ったままリセットした場合＝石と重なるが、
//      1歩で '*' 以外の（石が初期配置でも歩ける）セルへ出られる → C1 に合流
//   C3 stonesLocked の状態（石が全ボタンに乗り T は恒久的に開く）からも入口へ帰れる
// 「解ける」ことは初期状態から goal への到達で示す（下の ④-goal）。笛リセット後の色は必ず
// 未設定に戻る∴初期状態と完全に同じ＝解の存在はそのまま引き継がれる。色が赤/青のまま
// （＝石を動かす前にスイッチを叩いた）場合も、色つきの通行判定は色未設定の**上位集合**
// （その色の門が開くだけ・反対色は同じく閉）で、石が初期位置なら反対色への切替も
// colorSwitchBlocked に掛からない∴色未設定の解をそのまま再生できる。
function checkFluteRescue(tiles, S) {
  const starCells = new Set(S.stoneKeys);
  const buttons = S.buttons;
  if (buttons.length !== 4 || S.stoneKeys.length !== 4)
    throw new Error(`④ ボタン ${buttons.length}・石 ${S.stoneKeys.length}（どちらも4個の設計）`);

  // (8,5)=T と (8,6)='>' は「T の奥」＝そこに立てるのは stonesLocked のときだけ（下で機械的に確認）。
  // ∴C1 の対象から外し、C3 で見る。
  const [gr, gc] = PORT_GOAL.split(',').map(Number);
  // (8,6) の出入りは (8,5) だけ／(8,5) の出入りは (7,5) と (8,6) だけ／(7,5) はボタンでない
  // ∴(8,5) に入る瞬間プレイヤーの足はボタンに乗っていない＝全ボタンが石で埋まっている＝locked。
  const permWall = (r, c) => !inBounds(r, c) || NEVER_PLAYER.has(tiles[r][c]);
  for (const [dr, dc] of DIRS) {
    const nr = gr + dr, nc = gc + dc;
    if (permWall(nr, nc)) continue;
    if (key(nr, nc) !== '8,5') throw new Error(`④ (8,6) の隣に ${key(nr, nc)} が開いている＝T の奥でなくなる`);
  }
  if (tiles[8][5] !== TILE.GATE) throw new Error('④ (8,5) がゲート T でない');
  for (const [dr, dc] of DIRS) {
    const nr = 8 + dr, nc = 5 + dc;
    if (permWall(nr, nc)) continue;
    if (!['7,5', '8,6'].includes(key(nr, nc)))
      throw new Error(`④ (8,5) の隣に ${key(nr, nc)} が開いている＝入る足がボタンに乗り得る`);
  }
  if (buttons.includes('7,5')) throw new Error('④ (7,5) がボタン＝足で T を開けて奥へ入れてしまう');

  const behindGate = new Set(['8,5', PORT_GOAL]);
  const cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (NEVER_PLAYER.has(tiles[r][c])) continue;
    cells.push(key(r, c));
  }

  // 「詰んでいない」＝ステージの出口セルのどれかへ帰れること。
  //   (1,1) …… field へ戻る '>'／(8,6) …… 聖剣の間へ抜ける '>'（ロック後は T が恒久的に開く）
  const EXITS = new Set([PORT_ENTRY, PORT_GOAL]);
  const fails = [];

  // C1
  for (const cell of cells) {
    if (starCells.has(cell) || behindGate.has(cell)) continue;
    const [r, c] = cell.split(',').map(Number);
    for (const color of [0, 1, 2]) {
      const st = S.encode(r, c, S.initStones, 0, 0, S.litInitMask, 0, color);
      if (!canReachAny(S, st, EXITS, 400000, `④C1 ${cell} color=${color}`))
        fails.push(`C1 ${cell} 色${color}`);
    }
  }
  if (fails.length)
    throw new Error(`④C1 笛を吹いても出口へ帰れない状態が ${fails.length} 件: ${fails.join(' / ')}`);
  // C2
  const walkableWithInitStones = new Set(cells.filter((k) => !starCells.has(k) && !behindGate.has(k)));
  for (const cell of starCells) {
    const [r, c] = cell.split(',').map(Number);
    const outs = DIRS
      .map(([dr, dc]) => key(r + dr, c + dc))
      .filter((k) => walkableWithInitStones.has(k))
      .filter((k) => {
        const [nr, nc] = k.split(',').map(Number);
        const ch = tiles[nr][nc];
        return ch === TILE.FLOOR || ch === TILE.BUTTON || ch === TILE.MAP_ENTER;
      });
    if (!outs.length)
      throw new Error(`④C2 石の初期セル ${cell} から1歩で出られる床が無い＝リセットで石に埋まる`);
  }
  // C3（石が全ボタンに乗り locked＝笛が no-op のケース）
  const lockedStones = S.stoneKeys.map((_, i) => buttons[i]);
  const fails3 = [];
  for (const cell of cells) {
    if (buttons.includes(cell)) continue;      // 石が乗っている
    const [r, c] = cell.split(',').map(Number);
    for (const color of [0, 1, 2]) {
      const st = S.encode(r, c, lockedStones, 0, 0, S.litInitMask, 1, color);
      if (!canReachAny(S, st, EXITS, 100000, `④C3 ${cell} color=${color}`))
        fails3.push(`${cell} 色${color}`);
    }
  }
  if (fails3.length)
    throw new Error(`④C3 ロック後に出口へ帰れない状態が ${fails3.length} 件: ${fails3.join(' / ')}`);
}

// ── ④（小部屋用）逆到達で「出口へ戻れる」──────────────────────────────────
function checkBackReach(room, seen, rev, backTargets) {
  const back = new Set();
  const q = [];
  const targets = new Set(backTargets);
  for (const st of seen) if (targets.has(st.split('|')[0])) { back.add(st); q.push(st); }
  if (!back.size) throw new Error(`④ ${room.key}: 出口に立つ状態が1つも無い`);
  let head = 0;
  while (head < q.length) {
    const st = q[head++];
    for (const prev of rev.get(st) ?? []) {
      if (back.has(prev)) continue;
      back.add(prev); q.push(prev);
    }
  }
  const stuck = [...seen].filter((st) => !back.has(st));
  if (stuck.length)
    throw new Error(`④ ${room.key}: 出口へ戻れない状態が ${stuck.length} 件（例 ${stuck[0]}）＝入って詰む`);
}

function buildStage(room, tiles) {
  const st = {
    cols: COLS,
    rows: ROWS,
    tiles,
    bgTiles: {},
    links: [],
    enemyDirs: room.enemyDirs ?? {},
    chestContents: room.chestContents ?? {},
    floorItems: {},
    objects: {},
    npcData: {},
    shopData: {},
    mapEnters: room.mapEnters ?? {},
    showConditions: room.showConditions ?? {},
    breakableWalls: {},
    isBossRoom: false,
    signData: room.signData ?? {},
    comment: room.comment,
  };
  if (room.fluteEffect) st.fluteEffect = room.fluteEffect;
  return st;
}

// ── ⑦ 進行の宣言 ───────────────────────────────────────────────────────────
// 「この地点で何を持っているか」は `shared/progression.js` の ORDER の位置から導出する
// （2026-09-05・0g で手書きの `UNLOCKED_AT` を廃止）∴宣言の実体は ORDER の登録。
if (!ORDER.some((cp) => cp.layer === LAYER)) {
  throw new Error(`⑦ ${LAYER} が shared/progression.js の ORDER に無い（進行上の位置を宣言する）`);
}
const unlocked = toolsUsableIn(d)[LAYER];
for (const tool of ['boomerang', 'bow', 'candle', 'ladder', 'bomb', 'flute'])
  if (!unlocked.has(tool)) throw new Error(`⑦ ${LAYER} の地点で ${tool} を持っていない（羽衣は全道具の後）`);

// ── 部屋を組み立てて検証 ────────────────────────────────────────────────────
const built = {};
const report = [];
for (const room of ROOMS) {
  const tiles = Array.isArray(room.tiles[0]) ? room.tiles : parse(room.tiles, `${LAYER}/${room.key}`);
  if (tiles.length !== ROWS || tiles.some((row) => row.length !== COLS))
    throw new Error(`${room.key}: 12×10 でない`);
  checkRingClosed(room, tiles);

  const S = solverFor(tiles, FULL);
  let states;
  if (room.key === '0,0') {
    const [er, ec] = room.entry.split(',').map(Number);
    const start = S.encode(er, ec, S.initStones, 0, 0, S.litInitMask);
    const t0 = process.hrtime.bigint();
    const ex = exploreCells(S, [start], 5000000, `${LAYER}/${room.key}`);
    const ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e6);
    states = ex.states;
    checkNoWaste(room, tiles, ex.used, ex.cells);
    if (!ex.cells.has(room.goal))
      throw new Error(`④-goal ${room.key}: ${room.goal} へ抜けられない＝解けない`);
    // 石を押さなければ門は開かない（報酬が飾りでない）。
    const noPush = exploreCells(
      solverFor(tiles, { ...FULL, noPush: true }),
      [solverFor(tiles, { ...FULL, noPush: true }).encode(er, ec, S.initStones, 0, 0, 0)],
      200000, `${LAYER}/${room.key} noPush`);
    if (noPush.cells.has(room.goal))
      throw new Error(`④ ${room.key}: 石を押さずに ${room.goal} へ抜けられる`);
    // ⓖ 逃げ道ゲートはロック前に一度も踏めない（＝ロック前の状態空間が移植元と同じであることの
    //   実測側の裏取り。ⓔ幾何＋ⓕ射線＋これの3点で「パズルは変わっていない」が閉じる）。
    if (ex.preLock.has(key(ESCAPE_GATE.r, ESCAPE_GATE.c)))
      throw new Error(`ⓖ ロック前に逃げ道ゲート (${ESCAPE_GATE.r},${ESCAPE_GATE.c}) を踏める`
        + '＝パズルの解き筋が変わっている');
    checkFluteRescue(tiles, S);
    report.push({ room, states, ms });
  } else {
    const { seen, rev } = exploreWithRev(S, room.entry);
    states = seen.size;
    const cells = new Set([...seen].map((st) => st.split('|')[0]));
    checkNoWaste(room, tiles, cells, cells);
    checkBackReach(room, seen, rev, Object.keys(room.mapEnters ?? {}));
    report.push({ room, states, ms: 0 });
  }
  built[room.key] = buildStage(room, tiles);
}

// ── ⑤ 報酬（聖剣）────────────────────────────────────────────────────────
const hall = built['1,0'];
const reward = hall.chestContents['1,5'];
if (reward?.type !== 'weapon' || reward.swordTier !== 3) throw new Error('⑤ 聖剣の間の宝箱が聖剣でない');
if (SWORD_TIERS[3]?.name !== '聖剣') throw new Error('⑤ SWORD_TIERS[3] が聖剣でない');
if (!SWORD_TIERS[3].pierce || !SWORD_TIERS[3].beam) throw new Error('⑤ 聖剣にビーム/貫通が無い');
if (hall.tiles[1][5] !== TILE.CHEST) throw new Error('⑤ (1,5) が宝箱 B でない');
if (hall.showConditions['1,5']?.trigger !== 'killAll') throw new Error('⑤ (1,5) の封印が killAll でない');

// ── ⑥ 敵（聖剣の間）──────────────────────────────────────────────────────
const enemyCells = {};
hall.tiles.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) enemyCells[key(r, c)] = ch; }));
const threat = stageThreat(hall, ENEMY_META);
const grotto = stageThreat(d.layers.secret_grotto.stages['2,0'], ENEMY_META);   // 寄道の最重 33.5
const tower = stageThreat(d.layers.dark_tower.stages['1,2'], ENEMY_META);       // 本編の最重 50
if (Object.keys(enemyCells).length !== 5)
  throw new Error(`⑥ 聖剣の間の敵は5体の設計（実際 ${Object.keys(enemyCells).length}）`);
if (!(threat > grotto)) throw new Error(`⑥ 脅威度 ${threat} が寄道最重 ${grotto} 以下＝最後の試練にならない`);
if (!(threat < tower)) throw new Error(`⑥ 脅威度 ${threat} が本編最重 ${tower} 以上＝寄道が本編より重い`);
const landing = '8,5';
const landingAdj = new Set(DIRS.map(([dr, dc]) => key(8 + dr, 5 + dc)));
for (const [k, tile] of Object.entries(enemyCells)) {
  const [r, c] = k.split(',').map(Number);
  if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) throw new Error(`⑥ ${k} の敵が外周に居る`);
  if (k === landing || landingAdj.has(k)) throw new Error(`⑥ ${k} の敵が着地セルに隣接＝入った瞬間に殴られる`);
  if (ENEMY_META[tile].isBoss) throw new Error(`⑥ ${k} にボスを置いている`);
  if (ENEMY_META[tile].directional && !hall.enemyDirs[k])
    throw new Error(`⑥ ${k} '${tile}' は向き別スプライト∴向きが必要`);
}
for (const k of Object.keys(hall.enemyDirs)) if (!enemyCells[k]) throw new Error(`⑥ enemyDirs ${k} が幽霊キー`);
const openCount = hall.tiles.flat().filter((ch) => !isHardBlocked(ch) && ch !== TILE.GATE).length;
if (openCount / Object.keys(enemyCells).length < 10)
  throw new Error(`⑥ 敵密度が高すぎる（歩ける床 ${openCount} / 敵 ${Object.keys(enemyCells).length}）`);
if (!EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === '1,0'))
  throw new Error(`⑥ EXTRA_ENEMY_ROOMS に ${LAYER}/1,0 の宣言が無い（配置表の外の敵部屋＝ドリフト扱い）`);

// ── field 側（入口＋修理①②）────────────────────────────────────────────────
const fieldStages = d.layers.field.stages;
const setTile = (stageKey, r, c, from, to, label) => {
  const st = fieldStages[stageKey];
  if (!st) throw new Error(`field ${stageKey} が無い`);
  if (!Array.isArray(st.tiles[r])) throw new Error(`field ${stageKey}: tiles が文字配列でない`);
  if (st.tiles[r][c] !== from)
    throw new Error(`${label}: field ${stageKey} (${r},${c}) が '${st.tiles[r][c]}'（'${from}' のはず）`);
  st.tiles[r][c] = to;
  return st;
};

// 入口＝field 8,1 東台地 (6,9)
{
  const st = setTile(FIELD_DOOR.stage, FIELD_DOOR.r, FIELD_DOOR.c, TILE.FLOOR, TILE.MAP_ENTER, '祠の扉');
  st.mapEnters = { ...(st.mapEnters ?? {}) };
  const k = key(FIELD_DOOR.r, FIELD_DOOR.c);
  if (st.mapEnters[k]) throw new Error(`field ${FIELD_DOOR.stage} (${k}) に既に mapEnter がある`);
  st.mapEnters[k] = { id: ID_FIELD_DOOR, destId: ID_SHRINE };
  // 導線＝既存石碑に1行だけ足す（世界の中で祠が見えるようにする）。
  const sign = st.signData?.[FIELD_SIGN.cell];
  if (!Array.isArray(sign?.lines)) throw new Error(`field ${FIELD_SIGN.stage} ${FIELD_SIGN.cell} の石碑が無い`);
  if (!sign.lines.includes(FIELD_SIGN_ADD)) sign.lines = [...sign.lines, FIELD_SIGN_ADD];
  // 東台地は SKY で分断されている＝飛行でしか立てない（鍵を地形で掛けている）。
  for (let c = 4; c <= 7; c++) for (let r = 1; r <= 8; r++)
    if (st.tiles[r][c] !== TILE.SKY)
      throw new Error(`field ${FIELD_DOOR.stage} (${r},${c}) が '%' でない＝虚空の谷が繋がってしまう`);
}
// 修理① 祭壇を戻す＋石碑を現在形に書き直す
{
  const st = setTile(ALTAR_FIX.stage, ALTAR_FIX.r, ALTAR_FIX.c, ALTAR_FIX.from, TILE.ALTAR, '修理①祭壇');
  st.signData = { ...(st.signData ?? {}) };
  st.signData[ALTAR_SIGN.cell] = {
    name: '北の聖域',
    lines: [
      'この 石段の 上に 古代の 祭壇が ある。',
      '星の欠片を すべて 捧げよ。',
      '空を 舞う 力を 得た 者のみ 暗黒の塔へ 至れると 伝う。',
    ],
  };
  // 祭壇へは石段側から踏み込める（隣接に歩ける床がある）。
  const near = DIRS.some(([dr, dc]) => {
    const ch = st.tiles[ALTAR_FIX.r + dr]?.[ALTAR_FIX.c + dc];
    return ch !== undefined && !isHardBlocked(ch);
  });
  if (!near) throw new Error('修理①: 祭壇に隣接する歩けるセルが無い＝踏めない');
}
// 修理② 塔の扉を開ける
{
  const st = setTile(TOWER_FIX.stage, TOWER_FIX.r, TOWER_FIX.c, TOWER_FIX.from, TILE.MAP_ENTER, '修理②塔の扉');
  const k = key(TOWER_FIX.r, TOWER_FIX.c);
  const e = st.mapEnters?.[k];
  if (e?.id !== 'fieldToTower' || e?.destId !== 'darkTower')
    throw new Error(`修理②: field ${TOWER_FIX.stage} (${k}) の mapEnter が fieldToTower→darkTower でない`);
  const side = st.tiles[TOWER_FIX.r][TOWER_FIX.c - 1];
  if (isHardBlocked(side)) throw new Error(`修理②: 塔の扉の隣 (${TOWER_FIX.r},${TOWER_FIX.c - 1}) が '${side}'＝扉に近づけない`);
}
// ⑨ 修理の結果を実データで数える（「置いたはず」で終わらせない）。
{
  let altars = 0;
  for (const [ln, ld] of Object.entries(d.layers)) {
    if (ln === SRC_LAYER) continue;
    for (const sd of Object.values(ld.stages ?? {}))
      for (const row of sd.tiles ?? []) for (const ch of row) if (ch === TILE.ALTAR) altars++;
  }
  if (altars < 1) throw new Error('⑨ 祭壇 \'^\' がゲームレイヤーに1枚も無い（羽衣が永久に手に入らない）');
  if (fieldStages[TOWER_FIX.stage].tiles[TOWER_FIX.r][TOWER_FIX.c] !== TILE.MAP_ENTER)
    throw new Error('⑨ 塔の扉が \'>\' になっていない');
}

// ── ⑧ 出入口の id が対で衝突なし ───────────────────────────────────────────
{
  const all = new Map();
  const scan = (layers) => {
    for (const [ln, ld] of Object.entries(layers)) {
      for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
        for (const [pk, e] of Object.entries(sd.mapEnters ?? {})) {
          if (all.has(e.id)) throw new Error(`⑧ mapEnter id '${e.id}' が重複（${all.get(e.id)} と ${ln}/${sk} ${pk}）`);
          all.set(e.id, `${ln}/${sk} ${pk}`);
        }
      }
    }
  };
  scan({ ...d.layers, [LAYER]: { stages: built } });
  for (const [a, b] of [[ID_FIELD_DOOR, ID_SHRINE], [ID_STONE_HALL, ID_SWORD_HALL]]) {
    if (!all.has(a) || !all.has(b)) throw new Error(`⑧ ${a} / ${b} の対が揃っていない`);
  }
  const pairOk = (fromId, destId) => {
    const loc = all.get(fromId);
    return !!loc && all.has(destId);
  };
  if (!pairOk(ID_FIELD_DOOR, ID_SHRINE) || !pairOk(ID_SHRINE, ID_FIELD_DOOR)
    || !pairOk(ID_STONE_HALL, ID_SWORD_HALL) || !pairOk(ID_SWORD_HALL, ID_STONE_HALL))
    throw new Error('⑧ 出入口の destId が解決できない');
}

// ── 書き込み ────────────────────────────────────────────────────────────────
d.layers[LAYER] = { name: '虚空の祠', bgm: 'dungeon', stages: built };
if (!DRY) writeFileSync(MAP_PATH, JSON.stringify(d, null, 2));

console.log(`✅ ${LAYER}（虚空の祠）を新設${DRY ? '（--dry: 書き込みなし）' : ''}`);
for (const { room, states, ms } of report)
  console.log(`   ${room.key} ${room.title.padEnd(7)} 状態 ${states}${ms ? `（${ms}ms）` : ''}`);
console.log(`   報酬: ${SWORD_TIERS[3].name}（swordTier 3・ATK ${BASE_ATK}+${SWORD_TIERS[3].atk}`
  + `=${BASE_ATK + SWORD_TIERS[3].atk}・ビーム${SWORD_TIERS[3].beam ? 'あり' : 'なし'}`
  + `・貫通${SWORD_TIERS[3].pierce ? 'あり' : 'なし'}）`);
console.log(`   敵: ${Object.entries(enemyCells).map(([k, t]) => `${t}@${k}`).join(' ')}`
  + ` 脅威度 ${threat}（寄道最重 ${grotto} < ${threat} < 本編最重 ${tower}）・床/敵 ${(openCount / 5).toFixed(1)}`);
console.log(`   field: ${FIELD_DOOR.stage} (${FIELD_DOOR.r},${FIELD_DOOR.c}) に祠の扉／`
  + `修理① ${ALTAR_FIX.stage} (${ALTAR_FIX.r},${ALTAR_FIX.c}) 祭壇 '^'／`
  + `修理② ${TOWER_FIX.stage} (${TOWER_FIX.r},${TOWER_FIX.c}) 塔の扉 '>'`);

// ── --measure（重い・4軸の帰結を移植元/移植先で確かめる）──────────────────────
if (MEASURE) {
  const { measureMetrics } = await import('./lib/puzzle-metrics.mjs');
  const run = (label, tiles, startCells) => {
    const S = makeSolver(tiles, BG, [], {}, new Set(), {});
    const starts = startCells.map((cell) => {
      const [r, c] = cell.split(',').map(Number);
      return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
    });
    const [gr2, gc2] = PORT_GOAL.split(',').map(Number);
    const buttons = S.buttons.map((b) => b.split(',').map(Number));
    const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    const h = (st) => {
      const [pos, stonesStr] = st.split('|');
      const [pr, pc] = pos.split(',').map(Number);
      let v = man([pr, pc], [gr2, gc2]);
      for (const s of (stonesStr ? stonesStr.split(';') : []))
        v += Math.min(...buttons.map((b) => man(s.split(',').map(Number), b)));
      return v;
    };
    const m = measureMetrics(S, starts, (st) => st.split('|')[0] === PORT_GOAL, h, { guardMax: 7000000 });
    console.log(`   [measure] ${label}: 状態 ${m.states} L ${m.L} 貪欲 ${m.greedy}`
      + ` デッドロック ${m.deadlocks} 最短解 ${m.solCount} 強制手率 ${m.forcedRatio} ゴール ${m.goals}`);
    return m;
  };
  const a = run('移植元 26,0', srcTiles, makeSolver(srcTiles, BG, [], {}, new Set(), {}).exitCells);
  const b = run('移植先 void_shrine 0,0', portTiles, [PORT_ENTRY]);
  if (a.solCount !== b.solCount) throw new Error(`[measure] 最短解本数が違う（${a.solCount} vs ${b.solCount}）`);
  if (a.greedy !== b.greedy) throw new Error('[measure] 貪欲の可否が違う');
  if (a.L - b.L !== 1) throw new Error(`[measure] L の差が 1 でない（${a.L} → ${b.L}）`);
  // ゴール状態数だけは +4 になる＝逃げ道ゲート (6,7) が開いたあと（ロック後）に (8,6) へ
  // 着く「色・経路」の組合せが増えるため。難しさの指標（L=105・最短解 320・貪欲NG・
  // 強制手率 0.20）は移植元と同じ∴パズルは変わっていない。
  if (b.goals - a.goals !== 4)
    throw new Error(`[measure] ゴール状態数の差が 4 でない（${a.goals} → ${b.goals}）`
      + '＝逃げ道ゲート以外の何かが解き筋を変えている');
  console.log('   [measure] 移植でパズルは変わっていない'
    + `（最短解 ${b.solCount} 本・貪欲 ${b.greedy}・L は閉じた廊下ぶんの -1・`
    + `ゴール状態は逃げ道ゲートぶんの +4・デッドロック ${a.deadlocks}→${b.deadlocks}）`);
}
