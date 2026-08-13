// test_mechanics[28,0]（`sword_beast_arena`）を作る／更新する
// （2026-08-12 / ユーザー指摘「近づくモードと遠隔攻撃モードがある感じにしないと
//  常にくっついてくるキャラになってる」を直した機構＝二相と攻撃硬直の検証ステージ）。
//
// 既存の 27,0（`sword_beast`）は水路で東の廊下が5セルしかない＝
//   ・モードが遠隔→近接に切り替わって寄って来ること
//   ・プレイヤーが逃げると距離が開くこと（同速でないこと）
// を測る余地が無い ∴ **遮蔽ゼロの開けた 10×12** を別に用意する。
// 遮蔽が無いことが要点＝壁や水で止まったのか AI が止まったのかを混同しない。
//
// 自己検査（書き込み前に assert）:
//   1. 形（10×12）／外周は全部壁／内部は全面床（剣獣のセルを除く）
//   2. 剣獣はちょうど1体・内部にいる
//   3. enemyDirs のキー集合が盤面の敵セルと一致
//   4. ステージキーは tests/test-stage-keys.js の表から引く（座標を直書きしない）
//   5. 既存ステージを上書きする場合、`sword_beast_arena` 以外の用途に使われていない
//      （＝他の検証ステージを踏み潰さない）
//
// 使い方:
//   node scripts/migrate-test-sword-beast-arena.mjs --dry
//   node scripts/migrate-test-sword-beast-arena.mjs

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { TEST_LAYER, stageKey } from '../tests/test-stage-keys.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const KEY = stageKey('sword_beast_arena');   // '28,0'
const ROWS = 10, COLS = 12;
const BEAST = 'μ';

// 開けた闘技場（遮蔽ゼロ）。剣獣は東端寄り (4,9)＝プレイヤーを西側 (4,2) 付近に置くと
// 初期距離 7＝keepMax(6.5) より外＝「遠すぎるので寄る」も観測できる。
const BOARD = [
  '############',
  '#..........#',
  '#..........#',
  '#..........#',
  '#........μ.#',
  '#..........#',
  '#..........#',
  '#..........#',
  '#..........#',
  '############',
];
const ENEMY_DIRS = { '4,9': 'left' };

const COMMENT =
  '[sword_beast_arena] Phase 5.5k #7 剣獣の「遠隔／近接の二相」と「攻撃硬直」の検証ステージ'
  + '（2026-08-12・ユーザー指摘で AI を直したときに追加）。'
  + '幾何＝外周だけ壁・内部は全面床＝**遮蔽ゼロ**。'
  + '遮蔽を置かないのが要点＝敵が止まったのが壁のせいか AI のせい（間合い維持・硬直）かを'
  + '混同しないため。剣獣1体(4,9)。プレイヤーは save 注入で置く：(4,2)＝row 4 で揃う'
  + '／(4,10)＝近接距離から始める。⚠️ 壁・水・石を内部に置くと二相の観測が成立しなくなる。';

const isEnemy = (t) => ENEMY_META[t] != null;

// ── 検査 ────────────────────────────────────────────────────────────────
if (BOARD.length !== ROWS) throw new Error(`rows が ${ROWS} でない: ${BOARD.length}`);
for (const [i, row] of BOARD.entries()) {
  if ([...row].length !== COLS) throw new Error(`cols が ${COLS} でない: row ${i} = ${[...row].length}`);
}

const grid = BOARD.map(r => [...r]);
const enemyCells = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    const onEdge = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
    if (onEdge) {
      if (t !== '#') throw new Error(`外周(${r},${c}) が壁でない: '${t}'`);
      continue;
    }
    if (isEnemy(t)) { enemyCells.push(`${r},${c}`); continue; }
    if (t !== '.') throw new Error(`内部(${r},${c}) が素の床でない: '${t}'（遮蔽ゼロが条件）`);
  }
}
if (enemyCells.length !== 1) throw new Error(`剣獣は1体だけ置く: ${enemyCells.length} 体`);
const [br, bc] = enemyCells[0].split(',').map(Number);
if (grid[br][bc] !== BEAST) throw new Error(`置いた敵が剣獣(${BEAST})でない: '${grid[br][bc]}'`);

const dirKeys = Object.keys(ENEMY_DIRS);
if (dirKeys.length !== enemyCells.length || dirKeys.some(k => !enemyCells.includes(k))) {
  throw new Error(`enemyDirs が盤面と一致しない（盤面: ${enemyCells.join(' ')} / dirs: ${dirKeys.join(' ')}）`);
}

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const layer = data.layers?.[TEST_LAYER];
if (!layer) throw new Error(`レイヤーが無い: ${TEST_LAYER}`);
const existing = layer.stages[KEY];
if (existing && !(existing.comment ?? '').startsWith('[sword_beast_arena]')) {
  throw new Error(`${TEST_LAYER}[${KEY}] は別の用途で使われている（comment: ${String(existing.comment).slice(0, 40)}…）`);
}

// ── 書き込み ────────────────────────────────────────────────────────────
layer.stages[KEY] = {
  comment: COMMENT,
  tiles: grid,
  bgTiles: existing?.bgTiles ?? {},
  links: existing?.links ?? [],
  enemyDirs: { ...ENEMY_DIRS },
  rows: ROWS,
  cols: COLS,
};

console.log(`# ${TEST_LAYER}[${KEY}] = sword_beast_arena（${existing ? '更新' : '新規'}）`);
for (const [i, row] of grid.entries()) console.log(`   ${String(i).padStart(2)} ${row.join('')}`);
console.log(`# 剣獣 1 体 (${br},${bc}) 向き=${ENEMY_DIRS[enemyCells[0]]} / 内部は全面床（遮蔽ゼロ）`);

if (DRY) {
  console.log('\n--dry: 書き込みなし');
} else {
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
  console.log('\n書き込み完了:', MAP_PATH);
}
