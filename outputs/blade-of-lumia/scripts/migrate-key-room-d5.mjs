// D5 の鍵部屋を「道具型③＝はしごで水路を渡る2段」に作り替える
// （2026-08-06 / PLAN 実行キュー 5.5d・設計は PUZZLE-DESIGN.md §7-4）。
//
// 芯：Y①(4,8) は3方向が壁・1方向（東）だけが水(3,9→縦の1セル幅)を挟んだ通路。
// はしご（player.hasLadder）でその水を渡って初めて Y① の隣（4,9）に立てる→叩くと
// links でゲート T(5,9) が開く→奥のチャンバー2へ入れる→そこにも水(7,9)で隔離した
// Y②(8,8) があり、渡って叩くと showConditions(switchOn) で鍵(6,10) が出現する。
// **段数2・はしごを抜くと解けない**（Y①/Y②とも隣接セルは壁+水のみ＝矢でも届かない
// 立ち位置が無い＝水の対岸に「立てるセル」自体が存在しないよう設計している）。
//
// D3（弓の2段）と違う核心：矢は水を素通しするので「隔離すれば剣封じ」で足りたが、
// はしご関門は「対岸から矢で狙えない」ことも同時に保証する必要がある。ここでは
// Y①/Y②の**唯一の隣接床セル**を水の向こう側（東）に置き、西側（水を挟まず矢が
// 素通しできる位置）には床セルを一切置かない＝矢を放てる立ち位置そのものが
// チャンバーの外に存在しない（射線を作る前提の「立てるセル」が無い）。
//
// 部屋の位相（PUZZLE-DESIGN §7-2）：dungeon_5 [1,0] は「終端相当」＝入口は南
// (9,5)(9,6) の1本、もう一方の辺（西 (4,0)(5,0)）はボス部屋 [0,0] への出口だが
// ボス部屋自体が別の鍵扉で守られている＝本道（南↔西）はこのパズルに関与しない。
//
// このスクリプトは書き込む前に自分で盤面を検査する（migrate-key-room-d2/d3.mjs と
// 同じ作法）：
//   ① 10×12 の文字配列
//   ② 継ぎ目（南入口 row9 col5,6・西出口 row4,5 col0・他の外周は全壁）が壊れていない
//   ③ Y はちょうど2つ・T はちょうど1つ・K はちょうど1つ・~ はちょうど2つ
//   ④ Y①/Y②とも「隣接セルがちょうど1つだけ通行可（水を挟んだ対岸）」＝
//      矢でも剣でも直接は届かない（対岸の立ち位置に渡るにはその水を渡るしかない）
//   ⑤ その水セルは「はしごで渡れる1セル幅の橋」（縦/横どちらかの両隣が陸）
//   ⑥⑦⑧ 到達性（はしご有無×gate開閉の4状態でBFS）：
//      - はしご無しでは Y①の対岸にも到達できない（水を渡れない）
//      - はしご有り・gate閉ではチャンバー2（Y②の対岸・鍵）に到達できない
//      - はしご有り・gate開でチャンバー2・鍵に到達できる
//      - 南入口→西出口の本道はいずれの状態でも到達可能（このパズルに関与しない）
//   ⑨ 鍵に switchOn(Y②) の関門が付いている
//   ⑩ tiles 層に見た目だけの地面タイルを混ぜていない
//   ⑪ 敵が1体は居る（圧のある部屋にする）
//
// 使い方:
//   node scripts/migrate-key-room-d5.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-key-room-d5.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_5';
const ROOM  = '1,0';

// 新しい盤面。
// 本道（常時開放）＝ 南入口(9,5)(9,6)→広間(row1-8,col1-6)→西出口(4,0)(5,0)。
// 分岐（広間の北東角 (1,7) から）＝ はしご必須のチャンバー1(Y①)→gate T(5,9)→チャンバー2(Y②)→鍵(6,10)。
const BOARD = [
  '############',
  '#..........#',
  '#.E....##.##',
  '#......##~##',
  '.......#Y.##',
  '.......##T##',
  '#......##.K#',
  '#......##~##',
  '#......#Y.##',
  '#####..#####',
];

// tiles 層に置いてはいけない「見た目だけの地面タイル」（塗りは bgTiles の仕事）。
const DECOR_TILES = new Set(['d', 'g', 'o', 's', 'a', 'm']);

const Y1 = [4, 8];
const Y1_APPROACH = [4, 9];   // Y①の唯一の隣接床セル（水の対岸）
const WATER1 = [3, 9];
const GATE_T = [5, 9];
const Y2 = [8, 8];
const Y2_APPROACH = [8, 9];   // Y②の唯一の隣接床セル（水の対岸）
const WATER2 = [7, 9];
const KEY_CELL = [6, 10];
const SOUTH_ENTRY = [9, 5];   // 南入口の代表セル
const WEST_EXIT = [4, 0];     // 西出口の代表セル
const ENEMY_RE = /[WECFVXZALNJOUGI]/;

// ── 盤面の検査（書き込み前） ───────────────────────────────────────────────
const grid = BOARD.map(r => r.split(''));
const ROWS = grid.length, COLS = grid[0].length;
const at = (r, c) => grid[r]?.[c];
const isWall = (r, c) => at(r, c) === undefined || at(r, c) === '#';
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const LADDER_OVER = new Set(['~', 'x']);

// ① 形
if (ROWS !== 10) throw new Error(`rows が 10 でない: ${ROWS}`);
for (const [i, row] of grid.entries()) {
  if (row.length !== 12) throw new Error(`cols が 12 でない: row ${i} = ${row.length}`);
}

// ② 継ぎ目
for (const [r, c, want, why] of [
  [9, 5, '.', '南の入口'], [9, 6, '.', '南の入口'],
  [4, 0, '.', '西の出口'], [5, 0, '.', '西の出口'],
]) {
  if (at(r, c) !== want) throw new Error(`継ぎ目が壊れている: (${r},${c}) は '${want}'（${why}）でなく '${at(r, c)}'`);
}
for (let c = 0; c < COLS; c++) {
  if (at(0, c) !== '#') throw new Error(`北の外周が漏れている: (0,${c})`);
  if (c !== 5 && c !== 6 && at(9, c) !== '#') throw new Error(`南の外周が漏れている: (9,${c})`);
}
for (let r = 0; r < ROWS; r++) {
  if (r !== 4 && r !== 5 && at(r, 0) !== '#') throw new Error(`西の外周が漏れている: (${r},0)`);
  if (at(r, 11) !== '#') throw new Error(`東の外周が漏れている: (${r},11)`);
}

// ③ 個数
function countTile(ch) { return grid.flat().filter(t => t === ch).length; }
if (countTile('Y') !== 2) throw new Error(`Y が2個でない: ${countTile('Y')}`);
if (countTile('T') !== 1) throw new Error(`T が1個でない: ${countTile('T')}`);
if (countTile('K') !== 1) throw new Error(`K が1個でない: ${countTile('K')}`);
if (countTile('~') !== 2) throw new Error(`~ が2個でない: ${countTile('~')}`);
if (at(...Y1) !== 'Y') throw new Error(`Y①(${Y1}) が Y でない`);
if (at(...Y2) !== 'Y') throw new Error(`Y②(${Y2}) が Y でない`);
if (at(...GATE_T) !== 'T') throw new Error(`gate(${GATE_T}) が T でない`);
if (at(...KEY_CELL) !== 'K') throw new Error(`鍵(${KEY_CELL}) が K でない`);
if (at(...WATER1) !== '~') throw new Error(`水①(${WATER1}) が ~ でない`);
if (at(...WATER2) !== '~') throw new Error(`水②(${WATER2}) が ~ でない`);
if (!ENEMY_RE.test(BOARD.join(''))) throw new Error('敵が居ない（圧が無い部屋になっている）');

// ④ Y①/Y②とも「隣接セルがちょうど1つだけ通行可（水は含めない）」
//    ＝矢/剣が届く立ち位置が対岸1か所しか無い（西側などに迂回の床が無い）
function passableNeighbors([yr, yc]) {
  const out = [];
  for (const [dr, dc] of DIRS) {
    const rr = yr + dr, cc = yc + dc;
    const t = at(rr, cc);
    if (t !== undefined && t !== '#' && !LADDER_OVER.has(t)) out.push([rr, cc]);
  }
  return out;
}
for (const [label, Y, approach] of [['Y①', Y1, Y1_APPROACH], ['Y②', Y2, Y2_APPROACH]]) {
  const nbs = passableNeighbors(Y);
  if (nbs.length !== 1) {
    throw new Error(`${label}(${Y}) の通行可能な隣接セルが1つでない: ${JSON.stringify(nbs)}`
      + '（水を渡らずに叩ける迂回路がある、または対岸の立ち位置が無い）');
  }
  if (nbs[0][0] !== approach[0] || nbs[0][1] !== approach[1]) {
    throw new Error(`${label}(${Y}) の唯一の隣接セルが想定(${approach})と違う: ${nbs[0]}`);
  }
}

// ⑤ 水セルがはしごで渡れる1セル幅の橋か（縦/横どちらかの両隣が「陸」＝水/穴でなく通行可）
function isLadderBank(r, c, gateOpen) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  const t = at(r, c);
  if (LADDER_OVER.has(t)) return false;
  if (t === '#') return false;
  if (t === 'T') return gateOpen;
  return true;
}
function isVertBridge(r, c, gateOpen) { return isLadderBank(r - 1, c, gateOpen) && isLadderBank(r + 1, c, gateOpen); }
function isHorizBridge(r, c, gateOpen) { return isLadderBank(r, c - 1, gateOpen) && isLadderBank(r, c + 1, gateOpen); }
for (const [label, W] of [['水①', WATER1], ['水②', WATER2]]) {
  if (!isVertBridge(...W, false) && !isHorizBridge(...W, false)) {
    throw new Error(`${label}(${W}) がはしごで渡れる1セル幅の橋になっていない`);
  }
}

// ⑥⑦⑧ 到達性（はしご有無×gate開閉の4状態でBFS）
function walkReach(startR, startC, { withLadder, gateOpen }) {
  const seen = new Set([`${startR},${startC}`]);
  const q = [[startR, startC]];
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of DIRS) {
      const rr = r + dr, cc = c + dc;
      const t = at(rr, cc);
      if (t === undefined || t === '#') continue;
      if (t === 'T' && !gateOpen) continue;
      if (t === 'Y') continue; // スイッチは剣で叩くセル＝立てない（矢/剣は隣接から届く）
      if (LADDER_OVER.has(t)) {
        if (!withLadder) continue;
        if (!isVertBridge(rr, cc, gateOpen) && !isHorizBridge(rr, cc, gateOpen)) continue;
      }
      const k = `${rr},${cc}`;
      if (seen.has(k)) continue;
      seen.add(k); q.push([rr, cc]);
    }
  }
  return seen;
}
const noLadderClosed = walkReach(...SOUTH_ENTRY, { withLadder: false, gateOpen: false });
const ladderClosed   = walkReach(...SOUTH_ENTRY, { withLadder: true,  gateOpen: false });
const ladderOpen      = walkReach(...SOUTH_ENTRY, { withLadder: true,  gateOpen: true });

// 本道（南入口→西出口）はどの状態でも到達可能（このパズルに関与しない）
for (const [label, reach] of [['はしご無し/gate閉', noLadderClosed], ['はしご有り/gate閉', ladderClosed], ['はしご有り/gate開', ladderOpen]]) {
  if (!reach.has(`${WEST_EXIT[0]},${WEST_EXIT[1]}`)) {
    throw new Error(`本道（南入口→西出口）が塞がれている（${label}）`);
  }
}
// はしご無しでは Y①の対岸にすら到達できない
if (noLadderClosed.has(`${Y1_APPROACH[0]},${Y1_APPROACH[1]}`)) {
  throw new Error('はしご無しで Y①の対岸に到達できてしまう（水が渡れてしまっている）');
}
// はしご有り・gate閉：Y①対岸には到達できるが、チャンバー2（gate の奥）には到達できない
if (!ladderClosed.has(`${Y1_APPROACH[0]},${Y1_APPROACH[1]}`)) {
  throw new Error('はしご有りでも Y①の対岸に到達できない＝解けない盤面');
}
if (ladderClosed.has(`${Y2_APPROACH[0]},${Y2_APPROACH[1]}`)) {
  throw new Error('gate閉のときに Y②の対岸へ到達できてしまう（段数2が成立しない）');
}
if (ladderClosed.has(`${KEY_CELL[0]},${KEY_CELL[1]}`)) {
  throw new Error('gate閉のときに鍵セルへ到達できてしまう');
}
// はしご有り・gate開：チャンバー2・鍵に到達できる
if (!ladderOpen.has(`${Y2_APPROACH[0]},${Y2_APPROACH[1]}`)) {
  throw new Error('gate開でも Y②の対岸に到達できない＝解けない盤面（水②の橋が壊れている可能性）');
}
if (!ladderOpen.has(`${KEY_CELL[0]},${KEY_CELL[1]}`)) {
  throw new Error('gate開でも鍵セルへ到達できない＝解けない盤面');
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
// 旧・宝箱（ハートの器）は本道側の常時アクセス可セルへ引き継ぐ（削除しない）。
stage.chestContents = { '1,9': { type: 'heartContainer', name: 'ハートの器' } };
// 旧・floorItems の残骸（鍵の別置き 6,5）は新盤面に対応セルが無い＝削除する。
stage.floorItems = {};
stage.comment =
  '[key_gate D5] 道具型③（PUZZLE-DESIGN §7-3 B / キュー 5.5d）。'
  + `Y①(${Y1}) は水(${WATER1})で隔離＝はしごが無いと対岸(${Y1_APPROACH})に立てず叩けない。`
  + `叩くと links で gate T(${GATE_T}) が開く→奥のチャンバー2へ入れる→`
  + `そこも水(${WATER2})で隔離した Y②(${Y2}) をはしごで渡って叩く→`
  + `showConditions(switchOn) で鍵(${KEY_CELL}) が出現。`
  + 'Y①/Y②とも通行可能な隣接セルは水の対岸1か所だけ＝矢でも剣でも迂回して届く立ち位置が無く、'
  + 'はしご（水を渡る手段）が必須。南入口(row9 col5,6)↔西出口(row4,5 col0) の本道は'
  + 'このパズルの状態に関わらず常時通行可（ボス部屋への扉は別の鍵扉が守る）。';

console.log(`# ${LAYER} [${ROOM}] を道具型③（はしご水路の2段関門）に更新`);
console.log(`  Y① ${Y1} 対岸: (${Y1_APPROACH})  水①: (${WATER1})`);
console.log(`  gate T ${GATE_T} ← Y①`);
console.log(`  Y② ${Y2} 対岸: (${Y2_APPROACH})（gate開時のみ到達）  水②: (${WATER2})`);
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
