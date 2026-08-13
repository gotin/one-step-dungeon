// D3 の鍵部屋を「道具型②＝弓の2段関門」に作り替える
// （2026-08-06 / PLAN 実行キュー 5.5c・設計は PUZZLE-DESIGN.md §7-4）。
//
// 芯：水で完全に隔離した Y①(2,6) を矢で叩く→ links でゲート T(5,8) が開く→
// T の奥（チャンバー2）へ入れるようになる→そこでしか撃てない Y②(8,9) を叩く→
// showConditions（switchOn）で鍵 K(6,10) が出現する。**段数2・弓を抜くと解けない**
// （Y①/Y②ともに隣接セルが水/壁のみ＝剣では絶対に届かない）。
//
// 部屋の位相（PUZZLE-DESIGN §7-2）：dungeon_3 [1,0] は「通り抜け」＝東(row4,5 col11)
// ↔南(row9 col5,6) の通行路を1本必ず空ける必要がある。∴この部屋は
//   ①常時開放の本道（東入口→col5,6 の縦穴→南出口。ゲート・パズルに一切関与しない）
//   ②本道から分岐する詰め物のパズル支室（チャンバー1＝Y①・チャンバー2＝Y②+鍵）
// の2階建てで作る。本道はどのタイミングでも塞がれない（機械 assert する）。
//
// 弓の仕組み（実コード裏取り済み・DECISIONS 参照）：
//   - `game/projectile.js isTilePassableForProj` は WALL と未破壊 '!' だけで矢を止める。
//     水（'~'）もゲート（'T'、閉でも）も矢を素通しする＝射線は「壁で切れているか」だけで
//     決まる。∴ Y を「隣接セルが全部 水/壁」にすれば剣では絶対に叩けず、遠くの陸から
//     直線上（4方向）に矢を飛ばして初めて当てられる。
//   - Y に矢が当たると `game/player.js toggleSwitch` が switchToggles をトグルし
//     `refreshGates()` が動く。本設計は Y①→gate T の `links` 連動、Y②→鍵は
//     `showConditions{trigger:'switchOn', switchId:Y②}`（D2 の torchesLit と同型）。
//
// このスクリプトは書き込む前に自分で盤面を検査する（migrate-key-room-d2.mjs と同じ作法）：
//   ① 10×12 の文字配列
//   ② 継ぎ目（東入口 row4,5 col11・南出口 row9 col5,6・他の外周は全壁）が壊れていない
//   ③ Y はちょうど2つ・T はちょうど1つ・K はちょうど1つ
//   ④ Y①/Y②とも「隣接セルが全部 水/壁」＝剣で叩けない（剣は隣接1マスしか届かない）
//   ⑤ Y①は常時（gate 前）陸の直線上から矢で叩ける（水は矢を止めない）
//   ⑥ Y②の射線位置（vantage）は gate が閉のときは歩いて到達できず、開いたときだけ到達できる
//   ⑦ 東入口→南出口の本道は gate の状態に関わらず常に到達可能（通り抜け部屋の絶対条件）
//   ⑧ 東入口→Y①vantage・東入口→gate は常に到達可能（チャンバー1は常時アクセス可）
//   ⑨ 鍵に switchOn(Y②) の関門が付いている
//   ⑩ tiles 層に見た目だけの地面タイルを混ぜていない
//   ⑪ 敵が1体は居る（圧のある部屋にする）
//
// 使い方:
//   node scripts/migrate-key-room-d3.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-key-room-d3.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_3';
const ROOM  = '1,0';

// 新しい盤面。
// 本道（常時開放）＝ row4 全幅 + col5,6 の縦穴（row4→row9）。
// チャンバー1（常時アクセス可・分岐 (3,3)⇄(4,3)）＝ Y①(2,6) を水(row1-3,col5-8)で隔離。
// チャンバー2（gate T(5,8) の奥）＝ Y②(8,9) を水(7,9)で隔離・鍵 K(6,10) は switchOn で出現。
const BOARD = [
  '############',
  '###~########',
  '###Y########',
  '###~########',
  '##E......B..',
  '#####..#T##.',
  '#####..#..K#',
  '#####..##~##',
  '#####..#~Y~#',
  '#####..#####',
];

// tiles 層に置いてはいけない「見た目だけの地面タイル」（塗りは bgTiles の仕事）。
const DECOR_TILES = new Set(['d', 'g', 'o', 's', 'a', 'm']);

const Y1 = [2, 3];
const GATE_T = [5, 8];
const Y2 = [8, 9];
const KEY_CELL = [6, 10];
const ENTRY = [4, 11];       // 東入口の代表セル
const SOUTH_EXIT = [9, 5];   // 南出口の代表セル
const ENEMY_RE = /[WECFVXZALNJOUGI]/;

// ── 盤面の検査（書き込み前） ───────────────────────────────────────────────
const grid = BOARD.map(r => r.split(''));
const ROWS = grid.length, COLS = grid[0].length;
const at = (r, c) => grid[r]?.[c];
const isWall = (r, c) => at(r, c) === undefined || at(r, c) === '#';
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// ① 形
if (ROWS !== 10) throw new Error(`rows が 10 でない: ${ROWS}`);
for (const [i, row] of grid.entries()) {
  if (row.length !== 12) throw new Error(`cols が 12 でない: row ${i} = ${row.length}`);
}

// ② 継ぎ目
for (const [r, c, want, why] of [
  [4, 11, '.', '東の入口'], [5, 11, '.', '東の入口'],
  [9, 5, '.', '南の出口'], [9, 6, '.', '南の出口'],
]) {
  if (at(r, c) !== want) throw new Error(`継ぎ目が壊れている: (${r},${c}) は '${want}'（${why}）でなく '${at(r, c)}'`);
}
for (let c = 0; c < COLS; c++) {
  if (at(0, c) !== '#') throw new Error(`北の外周が漏れている: (0,${c})`);
  if (c !== 5 && c !== 6 && at(9, c) !== '#') throw new Error(`南の外周が漏れている: (9,${c})`);
}
for (let r = 0; r < ROWS; r++) {
  if (at(r, 0) !== '#') throw new Error(`西の外周が漏れている: (${r},0)`);
  if (r !== 4 && r !== 5 && at(r, 11) !== '#') throw new Error(`東の外周が漏れている: (${r},11)`);
}

// ③ 個数
function countTile(ch) {
  return grid.flat().filter(t => t === ch).length;
}
if (countTile('Y') !== 2) throw new Error(`Y が2個でない: ${countTile('Y')}`);
if (countTile('T') !== 1) throw new Error(`T が1個でない: ${countTile('T')}`);
if (countTile('K') !== 1) throw new Error(`K が1個でない: ${countTile('K')}`);
if (at(...Y1) !== 'Y') throw new Error(`Y①(${Y1}) が Y でない`);
if (at(...Y2) !== 'Y') throw new Error(`Y②(${Y2}) が Y でない`);
if (at(...GATE_T) !== 'T') throw new Error(`gate(${GATE_T}) が T でない`);
if (at(...KEY_CELL) !== 'K') throw new Error(`鍵(${KEY_CELL}) が K でない`);
if (!ENEMY_RE.test(BOARD.join(''))) throw new Error('敵が居ない（圧が無い部屋になっている）');

// ④ 剣で叩けない（隣接セルが全部 水/壁）
function isSwordUnreachable([yr, yc]) {
  for (const [dr, dc] of DIRS) {
    const t = at(yr + dr, yc + dc);
    if (t !== '~' && t !== '#' && t !== undefined) return false;
  }
  return true;
}
if (!isSwordUnreachable(Y1)) throw new Error(`Y①(${Y1}) が剣で叩ける隣接セルを持つ`);
if (!isSwordUnreachable(Y2)) throw new Error(`Y②(${Y2}) が剣で叩ける隣接セルを持つ`);

// ⑤ 矢の射線（4方向・WALL/未破壊'!'だけで止まる＝水は素通し）で立てるセルから Y に届くか
const standable = (r, c) => !isWall(r, c) && !'HYD[]()*T=|~x'.includes(at(r, c));
function arrowVantagePoints([yr, yc]) {
  const out = [];
  for (const [dr, dc] of DIRS) {
    // Y から逆方向へ辿って「立てるセル」を探す（wall で打ち切り）
    for (let k = 1; k < Math.max(ROWS, COLS); k++) {
      const rr = yr - dr * k, cc = yc - dc * k;
      if (isWall(rr, cc)) break;
      if (standable(rr, cc)) out.push({ r: rr, c: cc, dir: [dr, dc] });
    }
  }
  return out;
}
const vantage1 = arrowVantagePoints(Y1);
if (vantage1.length === 0) throw new Error(`Y①(${Y1}) を矢で叩ける立ち位置が無い`);

// ⑥⑦⑧ 到達性（gate 開閉2状態でBFS）
function walkReach(startR, startC, gateOpen) {
  const seen = new Set([`${startR},${startC}`]);
  const q = [[startR, startC]];
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of DIRS) {
      const rr = r + dr, cc = c + dc;
      const t = at(rr, cc);
      if (t === undefined || t === '#' || t === '~' || t === 'Y') continue;
      if (t === 'T' && !gateOpen) continue;
      const k = `${rr},${cc}`;
      if (seen.has(k)) continue;
      seen.add(k); q.push([rr, cc]);
    }
  }
  return seen;
}
const reachClosed = walkReach(ENTRY[0], ENTRY[1], false);
const reachOpen   = walkReach(ENTRY[0], ENTRY[1], true);

// ⑦ 本道（東入口→南出口）は gate 状態に関わらず常に到達可能
if (!reachClosed.has(`${SOUTH_EXIT[0]},${SOUTH_EXIT[1]}`)) {
  throw new Error('gate 閉のとき東入口→南出口の本道が塞がれている（通り抜け部屋の絶対条件違反）');
}
if (!reachOpen.has(`${SOUTH_EXIT[0]},${SOUTH_EXIT[1]}`)) {
  throw new Error('gate 開のとき東入口→南出口の本道が塞がれている');
}

// ⑧ チャンバー1（Y①vantage・gate 手前セル）は常時アクセス可
const y1VantageReachableClosed = vantage1.some(v => reachClosed.has(`${v.r},${v.c}`));
if (!y1VantageReachableClosed) throw new Error('gate 閉のとき Y① を撃てる立ち位置に到達できない（常時アクセス可のはず）');
const gateApproach = `${GATE_T[0] - 1},${GATE_T[1]}`; // (4,8) gate の本道側セル
if (!reachClosed.has(gateApproach)) throw new Error(`gate 手前 ${gateApproach} に到達できない（gate 閉状態でも本道からは行けるはず）`);

// ⑥ Y②の射線位置（vantage2）は gate 閉のときは到達不能・開いたときだけ到達可能
const vantage2 = arrowVantagePoints(Y2);
if (vantage2.length === 0) throw new Error(`Y②(${Y2}) を矢で叩ける立ち位置が無い`);
const v2ReachableClosed = vantage2.some(v => reachClosed.has(`${v.r},${v.c}`));
const v2ReachableOpen   = vantage2.some(v => reachOpen.has(`${v.r},${v.c}`));
if (v2ReachableClosed) throw new Error('gate 閉のときに Y② の射線位置へ到達できてしまう（段数2が成立しない）');
if (!v2ReachableOpen) throw new Error('gate 開のときに Y② の射線位置へ到達できない＝解けない盤面');

// ⑨ 鍵の関門・鍵セルは gate 開のとき到達可能（switchOn 達成後に拾えることの前提）
if (!reachOpen.has(`${KEY_CELL[0]},${KEY_CELL[1]}`)) {
  throw new Error(`gate 開のとき鍵セル ${KEY_CELL} に到達できない`);
}

// ⑩ 見た目だけの地面タイルを tiles 層に混ぜていないか
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (DECOR_TILES.has(at(r, c))) {
      throw new Error(`tiles 層に見た目だけの地面タイル '${at(r, c)}' がある: (${r},${c})`);
    }
  }
}

// ── 書き込み ──────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stage = data.layers?.[LAYER]?.stages?.[ROOM];
if (!stage) throw new Error(`部屋が無い: ${LAYER} [${ROOM}]`);

const before = stage.tiles.map(r => (Array.isArray(r) ? r.join('') : String(r)));
stage.tiles  = grid.map(r => [...r]);       // ⚠️ 文字配列で持つ（行文字列だと実ゲームが落ちる）
stage.rows   = ROWS;
stage.cols   = COLS;
stage.links  = [{ switchId: `${Y1[0]},${Y1[1]}`, gateId: `${GATE_T[0]},${GATE_T[1]}` }];
stage.showConditions = {
  [`${KEY_CELL[0]},${KEY_CELL[1]}`]: { trigger: 'switchOn', switchId: `${Y2[0]},${Y2[1]}` },
};
// 旧・宝箱（ハートの器）は本道の常時アクセス可セルへ引き継ぐ（削除しない）。
stage.chestContents = { '4,9': { type: 'heartContainer', name: 'ハートの器' } };
stage.comment =
  '[key_gate D3] 道具型②（PUZZLE-DESIGN §7-3 B / キュー 5.5c）。水で完全隔離した '
  + `Y①(${Y1}) を矢で叩く→links で gate T(${GATE_T}) が開く→奥のチャンバー2へ入れる→`
  + `そこでしか撃てない Y②(${Y2}) を叩く→showConditions(switchOn) で鍵(${KEY_CELL}) が出現。`
  + 'Y①/Y②とも隣接セルが水/壁のみ＝剣では絶対に叩けない（弓が必須）。'
  + '東入口(row4,5 col11)↔南出口(row9 col5,6) の本道は gate の状態に関わらず常時通行可'
  + '（この部屋は通り抜け部屋＝背骨の一部）。';

console.log(`# ${LAYER} [${ROOM}] を道具型②（弓の2段関門）に更新`);
console.log(`  Y① ${Y1} vantage: ${vantage1.map(v => `(${v.r},${v.c})`).join(' / ')}`);
console.log(`  gate T ${GATE_T} ← Y①`);
console.log(`  Y② ${Y2} vantage(gate開時のみ到達): ${vantage2.map(v => `(${v.r},${v.c})`).join(' / ')}`);
console.log(`  鍵 ${KEY_CELL} 関門 switchOn(${Y2})`);
console.log('  before / after:');
for (let i = 0; i < ROWS; i++) {
  const a = before[i] ?? '';
  const b = grid[i].join('');
  console.log(`   ${String(i).padStart(2)} ${a}   ${a === b ? '=' : '→'}   ${b}`);
}

if (DRY) {
  console.log('\n--dry: 書き込みなし');
} else {
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
  console.log('\n書き込み完了:', MAP_PATH);
}
