#!/usr/bin/env node
/**
 * generate-sokoban.mjs — PUZZLE-DESIGN.md §3 の逆算生成を実証する（使い捨て実験）
 *
 * §3-1「深さは逆算生成で構成する」を実コードで実証する：
 *   1. ゴール状態（各石が各ボタン S の上）から始める。
 *   2. 「押す」の逆＝「引く」を逆BFS 展開する（プレイヤーが石の押し出し側の隣に
 *      立ち、離れる向きへ1マス動くと石が付いてくる＝順再生の押しの逆）。
 *   3. 引き距離（＝プッシュ最短手数の下限）が最大の初期石配置を採る。
 *   4. その初期配置を実ゲーム遷移（makeSolver）＋4軸（measureMetrics）で測り、
 *      PUZZLE-DESIGN §2 の下限条件をクリアするか確かめる。
 *
 * ⚠️ これは方法論の実証＝**実マップ（work/blade-of-lumia.json）は一切変更しない。**
 *    生成した盤面はコンソールに出すだけ。実データへの反映は 5番以降で別途行う。
 *
 * 盤面テンプレ（10×12・内部 rows1-8/cols1-10）：外周は全周が陸の口（歩ける）。
 * 内部に壁 '#'（WALL）で通路を刻み、ボタン S と宝 B を置く。石 '*' は逆算で決める。
 *
 * Usage (run from outputs/blade-of-lumia/):
 *   node scripts/generate-sokoban.mjs                # 既定テンプレで逆算生成＋測定
 *   node scripts/generate-sokoban.mjs --top 5        # 引き距離上位5配置を測る
 */

import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics, verdict } from './lib/puzzle-metrics.mjs';
import { TILE } from '../shared/tiles.js';

// ── 盤面テンプレ ──────────────────────────────────────────────────────────────
// '.' 床 / '#' 壁 / 'S' ボタン（石の目標）/ 'B' 宝箱 / ' '(空=床扱い)。
// 石 '*' は書かない（逆算で置く）。報酬 B は「全ボタンに石が乗ると出現」で守る。
// 倉庫番の難しさが出るよう、押し引きの取り回しが要る L 字＋くびれた通路にする。
// 開けた部屋＋少数の壁。倉庫番の回り込みは床の余地があってこそ効く（壁だらけの
// 細通路だと石の裏に回れず順方向で詰む＝逆算だけ深くても解なしになる）。
const TEMPLATE = [
  '############',
  '#..........#',
  '#..S....S..#',   // 目標ボタン 2個（開けた床に置く）
  '#..........#',
  '#...#..#...#',   // 中央に散らした壁＝押し引きの取り回しを生む
  '#..........#',
  '#...#..#...#',
  '#..........#',
  '#.....B....#',   // 宝 B（全ボタンに石で出現）
  '############',
];
// 外周から入る口（宝の守りは倉庫番＝口は普通に歩ける）。テンプレの床の縁に1つ開ける。
const ENTRY = '1,1';

// ── テンプレ解析 ──────────────────────────────────────────────────────────────
const grid = TEMPLATE.map((row) => row.split(''));
if (grid.length !== ROWS || grid.some((r) => r.length !== COLS))
  throw new Error(`テンプレは ${ROWS}x${COLS} 必要`);

const buttons = [];
const walls = new Set();
const floors = new Set();
let chest = null;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const ch = grid[r][c];
  if (ch === '#') { walls.add(`${r},${c}`); continue; }
  floors.add(`${r},${c}`);
  if (ch === 'S') buttons.push(`${r},${c}`);
  if (ch === 'B') chest = `${r},${c}`;
}
if (!chest) throw new Error('テンプレに宝 B が無い');
if (!buttons.length) throw new Error('テンプレにボタン S が無い');

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);
const isFloor = (r, c) => floors.has(key(r, c));   // 床（壁でない・盤内）
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// ── 逆算（pull-BFS）───────────────────────────────────────────────────────────
// 状態 = 石集合（ソート済み）× プレイヤー位置。ゴール = 石が全ボタン上。
// 逆操作「引く」= プレイヤーが (pr,pc) にいて隣の石 (sr,sc)=(pr+d) を、プレイヤーが
// さらに1マス進む向き(pr+2d が床)へ「引き寄せる」＝石が (pr+d)→(pr) に来て
// プレイヤーは (pr+2d) へ。これは順再生では「(pr+2d) から石を (pr) 方向へ押した」の逆。
function pullBFS() {
  const goalStones = [...buttons].sort();
  // ゴール状態のプレイヤーは、各ボタンに隣接する任意床から。全部を初期集合にする。
  const encode = (stones, p) => `${stones.join(';')}|${p}`;
  const start = [];
  const stoneSet0 = new Set(goalStones);
  for (const b of goalStones) for (const [dr, dc] of DIRS) {
    const [br, bc] = parse(b);
    const pr = br + dr, pc = bc + dc;
    if (isFloor(pr, pc) && !stoneSet0.has(key(pr, pc))) start.push(encode(goalStones, key(pr, pc)));
  }
  const dist = new Map();
  const q = [];
  for (const s of new Set(start)) { dist.set(s, 0); q.push(s); }
  let head = 0;
  while (head < q.length) {
    const st = q[head++];
    const [stonesStr, pStr] = st.split('|');
    const stones = stonesStr.split(';');
    const stoneSet = new Set(stones);
    const [pr, pc] = parse(pStr);
    const d = dist.get(st);
    // (a) プレイヤーだけ動く（引かない移動）。
    for (const [dr, dc] of DIRS) {
      const nr = pr + dr, nc = pc + dc;
      if (!isFloor(nr, nc) || stoneSet.has(key(nr, nc))) continue;
      const ns = encode(stones, key(nr, nc));
      if (!dist.has(ns)) { dist.set(ns, d); q.push(ns); }   // 移動は距離0（プッシュ数で測る）
    }
    // (b) 引く：プレイヤーの隣（背後 = -d 方向）に石があり、プレイヤーが d 方向へ動ける。
    for (const [dr, dc] of DIRS) {
      const sr = pr - dr, sc = pc - dc;              // 背後の石
      if (!stoneSet.has(key(sr, sc))) continue;
      const nr = pr + dr, nc = pc + dc;              // プレイヤーの引き先
      if (!isFloor(nr, nc) || stoneSet.has(key(nr, nc))) continue;
      // 石は (sr,sc) → (pr,pc) へ付いてくる。
      const ns2 = stones.filter((s) => s !== key(sr, sc));
      ns2.push(key(pr, pc));
      ns2.sort();
      const ns = encode(ns2, key(nr, nc));
      if (!dist.has(ns)) { dist.set(ns, d + 1); q.push(ns); }   // 引き=プッシュ1手
    }
  }
  // 石配置ごとの最大引き距離を集計（初期配置候補＝プッシュ最短手数の下限）。
  const byStones = new Map();
  for (const [st, d] of dist) {
    const stonesStr = st.split('|')[0];
    if (!byStones.has(stonesStr) || byStones.get(stonesStr) < d) byStones.set(stonesStr, d);
  }
  return [...byStones.entries()]
    .map(([stones, pulls]) => ({ stones: stones.split(';'), pulls }))
    .sort((a, b) => b.pulls - a.pulls);
}

// ── 候補を実ゲーム遷移＋4軸で測る ───────────────────────────────────────────────
// テンプレ→makeSolver 用の tiles/bg を作る（石を初期配置、B と S を配置、# を WALL に）。
function buildTiles(stonePlacement) {
  const stoneSet = new Set(stonePlacement);
  const tiles = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
  const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));   // 全陸（水なし）
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = key(r, c);
    if (walls.has(k)) tiles[r][c] = TILE.WALL;
    else if (chest === k) tiles[r][c] = 'B';
    else if (buttons.includes(k)) tiles[r][c] = TILE.BUTTON;
    else if (stoneSet.has(k)) tiles[r][c] = TILE.STONE;
  }
  return { tiles, bg };
}

function measurePlacement(stonePlacement) {
  const { tiles, bg } = buildTiles(stonePlacement);
  // links なし。宝 B は「全ボタンに石」で出す＝goalTest で allSwitchesOn を判定。
  const S = makeSolver(tiles, bg, [], {}, new Set());
  const start = S.encode(...parse(ENTRY), S.initStones, 0, 0, 0);
  // ゴール = プレイヤーが宝セルにいて、かつ全ボタンに石が乗っている。
  const goalTest = (state) => {
    const [pos, stonesStr] = state.split('|');
    if (pos !== chest) return false;
    const stones = stonesStr ? stonesStr.split(';') : [];
    return buttons.every((b) => stones.includes(b));
  };
  // ヒューリスティック：各石→最寄りボタンの距離和 ＋ プレイヤー→宝の距離。
  const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const bpos = buttons.map(parse);
  const [gr, gc] = parse(chest);
  const h = (state) => {
    const [pos, stonesStr] = state.split('|');
    const [pr, pc] = parse(pos);
    let hh = man([pr, pc], [gr, gc]);
    for (const s of (stonesStr ? stonesStr.split(';') : [])) {
      const sp = parse(s);
      hh += Math.min(...bpos.map((b) => man(sp, b)));
    }
    return hh;
  };
  return measureMetrics(S, [start], goalTest, h, { guardMax: 3000000 });
}

// ── 実行：3難易度帯（易/中/難）を選ぶ ────────────────────────────────────────────
// ユーザーが遊び比べて「十分な難しさ」の線を判定するため、L の帯を3つ用意する。
// 罠B（引き距離 < 最短手数 L）を使い、各帯の推定引き距離レンジだけ measure して
// 全 946 候補の重い BFS を避ける（難帯は状態27万＝1回が重い）。
const TIERS = [
  { name: '易', L: [8, 12], estPulls: [3, 6] },
  { name: '中', L: [18, 24], estPulls: [7, 11] },
  { name: '難', L: [38, 48], estPulls: [15, 20] },
];

console.log('逆算生成（pull-BFS）— テンプレ:');
grid.forEach((row, r) => console.log('  ', String(r).padStart(2), row.join('')));
console.log(`  ボタン: ${buttons.join(' / ')}  宝: ${chest}  入口: ${ENTRY}\n`);

const cands = pullBFS();
console.log(`引き距離つき初期配置候補: ${cands.length} 通り（3帯の推定引き距離レンジだけ測る）\n`);

const picks = {};
for (const t of TIERS) {
  const pool = cands.filter((c) => c.pulls >= t.estPulls[0] && c.pulls <= t.estPulls[1]);
  for (const cand of pool) {
    let m;
    try { m = measurePlacement(cand.stones); } catch { continue; }
    if (!verdict(m).pass) continue;
    if (m.L < t.L[0] || m.L > t.L[1]) continue;
    picks[t.name] = { cand, m };
    console.log(`  [${t.name}] 石 ${cand.stones.join(' ')} (引き${cand.pulls}) → L=${m.L} 貪欲NG deadlock=${m.deadlocks} 強制手率=${m.forcedRatio} 本数=${m.solCount}`);
    break;
  }
  if (!picks[t.name]) console.log(`  [${t.name}] L${t.L[0]}〜${t.L[1]} の下限クリア盤面が見つからず（レンジ調整が要る）`);
}

console.log('');
for (const t of TIERS) {
  const p = picks[t.name];
  if (!p) continue;
  console.log(`── ${t.name}（L=${p.m.L}）─ 石 ${p.cand.stones.join(' ')} ──`);
  const { tiles } = buildTiles(p.cand.stones);
  tiles.forEach((row, r) => console.log('  ', String(r).padStart(2), row.join('')));
  console.log('');
}
console.log('※ この盤面は宝が開けた床にある＝測定用（石を全ボタンに乗せるまでの手数を測る）。');
console.log('  実プレイ化には宝を全ボタン連動ゲートの奥へ隔離する（別途 test_mechanics に組む）。');
