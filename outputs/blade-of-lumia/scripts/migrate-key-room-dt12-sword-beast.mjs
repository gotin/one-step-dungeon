// dark_tower[1,2]（塔の鍵部屋）を「剣獣（μ）の巣」に組み直す
// （2026-08-12 / PLAN 実行キュー 5.5k-2 の (e)・設計は PUZZLE-DESIGN.md §7-3 A の系）。
//
// 5.5h で作った戦闘型③は「魔物(W)1 + チェイサー(C)3 = 脅威度48.0」だった。
// 5.5k で陸上通常敵の最強格 #7 剣獣（μ・HP10/ATK3/DEF2・speed1・剣ビーム range9）を
// 実装した ∴ PLAN 5.5k の 5番「最強格を dark_tower[1,2] に集める」をここで満たす：
//   剣獣 × 5 ＝ 脅威度 50.0（旧 48.0 も D7 の 36.0 も上回る＝進行順の単調増加を壊さない）
//
// 剣獣は「速い（speed 1＝チェイサーの2倍）」かつ「離れると剣ビームを撃つ（range 9・
// minRange 2.5）」＝開けた 10×12 に5体置くと十字砲火で一方的になる。∴内部に
// 2×2 の柱を2つ立てて射線を切れるようにする（投擲物は TILE.WALL で消える＝
// game/projectile.js の canProjectilePass）。柱は入口(0,5)(0,6) の真下に置く
// ＝「入った瞬間に列で撃たれる」不可避ダメージを構造で消す。
//
// 自己検査（書き込み前に assert・migrate-key-room-d7-tower.mjs の作法を踏襲＋強化）:
//   1. 形（10×12）と外周セルの不変（継ぎ目を塞がない）
//   2. 鍵セル(7,6)は 'K' 据え置き・鍵扉(9,5)(9,6) は 'D' 据え置き
//   3. 脅威度は ENEMY_META から導出（手書き表を作らない＝敵を足しても表を直さなくてよい）
//      D1(24.0) < D7 < 変更後 dark_tower[1,2] かつ 変更前(48.0) 以下にしない
//   4. 敵密度＝実際に歩ける床セル数（柱を引いた実数）÷敵数 ≧ 15
//   5. 接続性＝壁でない全セルが入口から到達可能（柱で床を孤立させていない）
//   6. enemyDirs のキー集合が盤面の敵セルと完全一致（5.5h の '7,10' のような失効キーを残さない）
//
// 使い方:
//   node scripts/migrate-key-room-dt12-sword-beast.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-key-room-dt12-sword-beast.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dark_tower', ROOM = '1,2';
const ROWS = 10, COLS = 12;
const KEY_CELL = [7, 6];
const DOOR_CELLS = [[9, 5], [9, 6]];
const PREV_THREAT = 48.0;   // 5.5h の戦闘型③（W1 + C3）。ここから下げない
const D1_THREAT = 24.0;     // §7-2⑥で据え置き確定の基準

// 剣獣の巣：四隅に4体＋鍵扉の前に1体（最後の1体が出口を塞ぐ）。
// 柱は (2-3,5-6) と (5-6,5-6)＝入口列(5,6)の射線を切り、row4 だけが東西に抜ける
// 「射線の通る廊下」として残る（プレイヤーが意識して渡る場所）。
const BOARD = [
  '#####..#####',
  '#..........#',
  '#.μ..##..μ.#',
  '#....##....#',
  '#..........#',
  '#....##....#',
  '#.μ..##..μ.#',
  '#.....K....#',
  '#.....μ....#',
  '#####DD#####',
];
// 向き＝北の2体は闘技場を見下ろす（プレイヤーが降りてくる方＝下）、南の2体は中央の鍵の方を向く、
// 扉番は鍵の方＝上。結果として4方向すべてが初期配置に現れる＝実機で向き別スプライトを一目で検分できる。
const ENEMY_DIRS = {
  '2,2': 'down', '2,9': 'down',
  '6,2': 'right', '6,9': 'left',
  '8,6': 'up',
};

// ── 検査の道具 ──────────────────────────────────────────────────────────
const ENEMY_THREAT = Object.fromEntries(
  Object.entries(ENEMY_META).map(([t, m]) => [t, (m.hp * m.atk) / ((m.def ?? 0) + 1)]),
);
const isEnemy = (t) => ENEMY_THREAT[t] != null;

function threatOf(tiles) {
  let total = 0;
  const counts = {};
  for (const row of tiles) for (const t of row) if (isEnemy(t)) { counts[t] = (counts[t] ?? 0) + 1; total += ENEMY_THREAT[t]; }
  return { total, counts };
}

function assertShape(board) {
  if (board.length !== ROWS) throw new Error(`rows が ${ROWS} でない: ${board.length}`);
  for (const [i, row] of board.entries()) {
    if ([...row].length !== COLS) throw new Error(`cols が ${COLS} でない: row ${i} = ${[...row].length}`);
  }
}

function assertBoundaryUnchanged(before, after) {
  const diff = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
      if (before[r][c] !== after[r][c]) diff.push(`(${r},${c}) '${before[r][c]}'→'${after[r][c]}'`);
    }
  }
  if (diff.length) throw new Error(`外周セルを変更してしまった（継ぎ目が壊れる）: ${diff.join(' / ')}`);
}

function assertEnemiesInside(board) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!isEnemy(board[r][c])) continue;
    if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) throw new Error(`敵 '${board[r][c]}' が外周(${r},${c}) に居る`);
    if (r === KEY_CELL[0] && c === KEY_CELL[1]) throw new Error(`敵が鍵セル(${r},${c}) に重なっている`);
  }
}

// 壁でないセルが全部つながっているか（柱で床を孤立させていないか）を入口から BFS。
function assertConnected(board) {
  const open = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] !== '#';
  const seen = new Set();
  const q = [[0, 5]];                       // 北の継ぎ目（入口）から
  seen.add('0,5');
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
      if (open(nr, nc) && !seen.has(k)) { seen.add(k); q.push([nr, nc]); }
    }
  }
  const isolated = [];
  let openCount = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!open(r, c)) continue;
    openCount++;
    if (!seen.has(`${r},${c}`)) isolated.push(`(${r},${c})`);
  }
  if (isolated.length) throw new Error(`入口から到達できない床がある: ${isolated.join(' ')}`);
  return openCount;
}

// ── 検査 ────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stage = data.layers?.[LAYER]?.stages?.[ROOM];
if (!stage) throw new Error(`部屋が無い: ${LAYER}[${ROOM}]`);

const before = stage.tiles.map(r => [...r]);
const after = BOARD.map(r => [...r]);

assertShape(BOARD);
assertBoundaryUnchanged(before, after);
assertEnemiesInside(after);

if (after[KEY_CELL[0]][KEY_CELL[1]] !== 'K') throw new Error(`鍵セル(${KEY_CELL}) が 'K' でない`);
for (const [r, c] of DOOR_CELLS) {
  if (after[r][c] !== 'D') throw new Error(`鍵扉(${r},${c}) が 'D' でない`);
}
if (stage.showConditions?.[`${KEY_CELL[0]},${KEY_CELL[1]}`]?.trigger !== 'killAll') {
  throw new Error(`鍵の出現条件が killAll でない（この部屋の関門は据え置きのはず）`);
}

const d1 = threatOf(data.layers.dungeon_1.stages['1,0'].tiles);
const d7 = threatOf(data.layers.dungeon_7.stages['1,0'].tiles);
const dt = threatOf(after);
if (d1.total !== D1_THREAT) throw new Error(`D1 の脅威度が基準 ${D1_THREAT} でない: ${d1.total}`);
if (!(dt.total > d7.total)) throw new Error(`変更後の脅威度 ${dt.total} が D7(${d7.total}) 以下`);
if (!(dt.total >= PREV_THREAT)) throw new Error(`変更後の脅威度 ${dt.total} が変更前(${PREV_THREAT}) より弱い`);

const enemyCells = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (isEnemy(after[r][c])) enemyCells.push(`${r},${c}`);
const dirKeys = Object.keys(ENEMY_DIRS);
const missing = enemyCells.filter(k => !dirKeys.includes(k));
const stale = dirKeys.filter(k => !enemyCells.includes(k));
if (missing.length || stale.length) {
  throw new Error(`enemyDirs が盤面と一致しない（欠け: ${missing.join(' ') || 'なし'} / 失効: ${stale.join(' ') || 'なし'}）`);
}

const openCount = assertConnected(after);
const perEnemy = openCount / enemyCells.length;
if (perEnemy < 15) throw new Error(`敵密度が高すぎる（床 ${openCount} / 敵 ${enemyCells.length} = ${perEnemy.toFixed(1)} < 15）`);

// ── 書き込み ────────────────────────────────────────────────────────────
stage.tiles = after;
stage.enemyDirs = { ...ENEMY_DIRS };
stage.comment =
  '[key_gate dark_tower] 戦闘型③（PUZZLE-DESIGN §7-3 A / キュー 5.5k-2）。'
  + '剣獣(2,2)(2,9)(6,2)(6,9)(8,6)＝陸上通常敵の最強格を5体集めた「剣獣の巣」で脅威度50.0'
  + '（旧構成48.0・D7の36.0を上回る）。'
  + '柱(2-3,5-6)(5-6,5-6) は剣ビームの射線を切るための遮蔽＝入口(0,5)(0,6) の真下を塞いで'
  + '「入室即被弾」を構造で消し、row4 だけを東西に射線が通る廊下として残す。'
  + '鍵の関門は killAll 据え置き。';

console.log(`# ${LAYER}[${ROOM}] 脅威度: ${threatOf(before).total} → ${dt.total}`
  + `（D1 ${d1.total} < D7 ${d7.total} < ${dt.total}）`);
console.log(`# 敵構成: ${JSON.stringify(dt.counts)} / 歩ける床 ${openCount} セル ÷ 敵 ${enemyCells.length} = ${perEnemy.toFixed(1)}`);
console.log('  before / after:');
for (let i = 0; i < ROWS; i++) {
  const a = before[i].join(''), b = after[i].join('');
  console.log(`   ${String(i).padStart(2)} ${a}   ${a === b ? '=' : '→'}   ${b}`);
}

if (DRY) {
  console.log('\n--dry: 書き込みなし');
} else {
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
  console.log('\n書き込み完了:', MAP_PATH);
}
