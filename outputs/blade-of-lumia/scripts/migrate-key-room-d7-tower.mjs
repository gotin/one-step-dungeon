// D7・dark_tower の鍵部屋を「戦闘型（A）の強化」にする
// （2026-08-08 / PLAN 実行キュー 5.5h・設計は PUZZLE-DESIGN.md §7-4）。
//
// §7-3 A の合否基準＝脅威度（ENEMY_META から HP*ATK/(DEF+1) の合計）が
// 進行順で単調増加すること＋部屋の広さに逃げ場があること（一方的な殴られ待ちにしない）。
//
// 現状（5番で背骨を通したときの暫定形）は3室とも「魔物(W) 1体だけ」で脅威度が
// 全て 18.0（同一）＝進行順で強化されていない。この段では手を触らない D1（§7-2⑥で
// 「据え置き確定」）を基準に、D7 と dark_tower[1,2] を単調増加させる：
//   D1        = 魔物1 + パトロール2        = 18 + 3*2      = 24.0
//   D7        = 魔物1 + センチネル3        = 18 + 6*3      = 36.0
//   dark_tower[1,2] = 魔物1 + チェイサー3  = 18 + 10*3     = 48.0
//
// D7 はさらに「笛（flutePlayed）を2段目に足す」（§7-4）＝新規トリガー
// killAllAndFlute（全滅かつ笛を吹いた、の AND・順序は問わない）に差し替える。
// dark_tower[1,2] は敵構成の強化のみ（キューは既に killAll のまま維持＝§7-4）。
//
// 部屋の広さ（10×12・壁は外周だけ）はそのまま活かし、敵は互いに離した位置へ置く
// （一方的な殴られ待ち防止＝プレイヤーが分断して各個撃破できる間合いを空ける）。
//
// 使い方:
//   node scripts/migrate-key-room-d7-tower.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-key-room-d7-tower.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const ENEMY_THREAT = { E: 3, C: 10, F: 6, W: 18 };

function threatOf(tiles) {
  let total = 0;
  const counts = {};
  for (const row of tiles) for (const t of row) if (ENEMY_THREAT[t] != null) counts[t] = (counts[t] ?? 0) + 1;
  for (const [t, n] of Object.entries(counts)) total += ENEMY_THREAT[t] * n;
  return { total, counts };
}

// ── D7 [1,0]：魔物(3,5)据え置き＋センチネル×3を分散配置 ─────────────────────
// 既存の敵密度が薄い部分（東側と南側）へ、互いに距離を空けて置く（各個撃破が可能に
// なる間合い・入口(4,0)(5,0)からすぐ届く位置には置かない）。
const D7_LAYER = 'dungeon_7', D7_ROOM = '1,0';
const D7_BOARD = [
  '############',
  '#..........#',
  '#..........#',
  '#....W..F..#',
  'D..........#',
  'D......K...#',
  '#..F.......#',
  '#........F.#',
  '#..........#',
  '#####..#####',
];

// ── dark_tower [1,2]：魔物(3,5)据え置き＋チェイサー×3を分散配置 ────────────
const DT_LAYER = 'dark_tower', DT_ROOM = '1,2';
const DT_BOARD = [
  '#####..#####',
  '#..........#',
  '#..C.......#',
  '#....W.....#',
  '#..........#',
  '#.......C..#',
  '#..........#',
  '#.....K..C.#',
  '#..........#',
  '#####DD#####',
];

function assertShape(board, layer, room) {
  if (board.length !== 10) throw new Error(`${layer}[${room}]: rows が 10 でない: ${board.length}`);
  for (const [i, row] of board.entries()) {
    if (row.length !== 12) throw new Error(`${layer}[${room}]: cols が 12 でない: row ${i} = ${row.length}`);
  }
}

function assertBoundaryUnchanged(before, after, layer, room) {
  // 外周（継ぎ目含む）を書き換えていないことを保証する（内部の敵配置だけ変える）。
  for (let r = 0; r < 10; r++) {
    for (const c of [0, 11]) {
      if (before[r][c] !== after[r][c]) {
        throw new Error(`${layer}[${room}]: 境界セル (${r},${c}) を変更してしまった: '${before[r][c]}'→'${after[r][c]}'`);
      }
    }
  }
  for (const r of [0, 9]) {
    for (let c = 0; c < 12; c++) {
      if (before[r][c] !== after[r][c]) {
        throw new Error(`${layer}[${room}]: 境界セル (${r},${c}) を変更してしまった: '${before[r][c]}'→'${after[r][c]}'`);
      }
    }
  }
}

function assertNoOverlapWithKeyOrDoor(board, layer, room) {
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 12; c++) {
      const t = board[r][c];
      if ((t === 'W' || t === 'C' || t === 'F' || t === 'E') && (r === 0 || r === 9 || c === 0 || c === 11)) {
        throw new Error(`${layer}[${room}]: 敵 '${t}' が境界セル (${r},${c}) に居る（継ぎ目を塞ぐ）`);
      }
    }
  }
}

// ── 検査 ────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const d7Stage = data.layers?.[D7_LAYER]?.stages?.[D7_ROOM];
if (!d7Stage) throw new Error(`部屋が無い: ${D7_LAYER}[${D7_ROOM}]`);
const dtStage = data.layers?.[DT_LAYER]?.stages?.[DT_ROOM];
if (!dtStage) throw new Error(`部屋が無い: ${DT_LAYER}[${DT_ROOM}]`);

const d7Before = d7Stage.tiles.map(r => [...r]);
const dtBefore = dtStage.tiles.map(r => [...r]);
const d7After  = D7_BOARD.map(r => r.split(''));
const dtAfter  = DT_BOARD.map(r => r.split(''));

assertShape(D7_BOARD, D7_LAYER, D7_ROOM);
assertShape(DT_BOARD, DT_LAYER, DT_ROOM);
assertBoundaryUnchanged(d7Before, d7After, D7_LAYER, D7_ROOM);
assertBoundaryUnchanged(dtBefore, dtAfter, DT_LAYER, DT_ROOM);
assertNoOverlapWithKeyOrDoor(d7After, D7_LAYER, D7_ROOM);
assertNoOverlapWithKeyOrDoor(dtAfter, DT_LAYER, DT_ROOM);

// 鍵セル(5,7)は両室とも据え置き＝タイルが 'K' のままであることを確認。
if (d7After[5][7] !== 'K') throw new Error(`${D7_LAYER}[${D7_ROOM}]: 鍵セル(5,7)が 'K' でない`);
if (dtAfter[7][6] !== 'K') throw new Error(`${DT_LAYER}[${DT_ROOM}]: 鍵セル(7,6)が 'K' でない`);

// 脅威度の単調増加を確認（D1 = 24.0 が既存の基準）。
const D1_THREAT = 24.0;
const d7Threat = threatOf(d7After);
const dtThreat = threatOf(dtAfter);
if (!(d7Threat.total > D1_THREAT)) throw new Error(`D7 の脅威度 ${d7Threat.total} が D1(${D1_THREAT}) 以下`);
if (!(dtThreat.total > d7Threat.total)) throw new Error(`dark_tower[1,2] の脅威度 ${dtThreat.total} が D7(${d7Threat.total}) 以下`);

// 部屋の広さに対する逃げ場（一方的な殴られ待ち防止）＝内部の空床セル数が敵数の
// 十分な倍数（10×12=120・外周36・内部84セルに対し敵4体は十分に薄い）。
function countEnemies(board) { return board.flat().filter(t => ENEMY_THREAT[t] != null).length; }
const d7Count = countEnemies(d7After.map(r => r));
const dtCount = countEnemies(dtAfter.map(r => r));
if (d7Count < 3 || dtCount < 3) throw new Error('敵の数が少なすぎる（強化になっていない）');
const OPEN_FLOOR_CELLS = 10 * 12 - 2 * 12 - 2 * 8; // 外周(36) を除いた内部84セル
if (OPEN_FLOOR_CELLS / d7Count < 15 || OPEN_FLOOR_CELLS / dtCount < 15) {
  throw new Error('敵密度が高すぎる（逃げ場が無い＝一方的な殴られ待ちになる恐れ）');
}

// ── 書き込み ────────────────────────────────────────────────────────────
d7Stage.tiles = d7After;
d7Stage.enemyDirs = { '3,5': 'down', '3,9': 'left', '6,3': 'right', '7,9': 'up' };
d7Stage.showConditions = {
  '5,7': { trigger: 'killAllAndFlute' },
};
// killAllAndFlute は ss.flutePlayed を見る（conditions.js）。このフラグは
// playFlute() の type:'reveal' 分岐でだけ true になる（game.js）＝この部屋にも
// fluteEffect が要る（無いと "特に何も起きない" で終わり flutePlayed が立たない）。
d7Stage.fluteEffect = { type: 'reveal', message: '🎵 音色が石廊に響いた……守護者たちが色めき立つ' };
d7Stage.comment =
  '[key_gate D7] 戦闘型②（PUZZLE-DESIGN §7-3 A / キュー 5.5h）。'
  + '魔物(3,5)+センチネル(3,9)(6,3)(7,9)＝脅威度36.0（D1の24.0を上回る）。'
  + '全滅（killAll）に加え笛（flutePlayed）を吹くことも要求＝既得道具の総合試験を鍵の関門にも通す。';

dtStage.tiles = dtAfter;
dtStage.enemyDirs = { '3,5': 'down', '2,3': 'right', '5,8': 'left', '7,10': 'up' };
dtStage.comment =
  '[key_gate dark_tower] 戦闘型③（PUZZLE-DESIGN §7-3 A / キュー 5.5h）。'
  + '魔物(3,5)+チェイサー(2,3)(5,8)(7,10)＝脅威度48.0（D7の36.0を上回る）。'
  + '塔の守護者＝進行順で最も脅威度が高い戦闘型の部屋。';

console.log(`# ${D7_LAYER}[${D7_ROOM}] 脅威度: 18.0 → ${d7Threat.total}`);
console.log(`# ${DT_LAYER}[${DT_ROOM}] 脅威度: 18.0 → ${dtThreat.total}`);
console.log('  before / after:');
for (const [layer, room, before, after] of [
  [D7_LAYER, D7_ROOM, d7Before, d7After],
  [DT_LAYER, DT_ROOM, dtBefore, dtAfter],
]) {
  console.log(`  -- ${layer}[${room}] --`);
  for (let i = 0; i < 10; i++) {
    const a = before[i].join('');
    const b = after[i].join('');
    console.log(`   ${String(i).padStart(2)} ${a}   ${a === b ? '=' : '→'}   ${b}`);
  }
}

if (DRY) {
  console.log('\n--dry: 書き込みなし');
} else {
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
  console.log('\n書き込み完了:', MAP_PATH);
}
