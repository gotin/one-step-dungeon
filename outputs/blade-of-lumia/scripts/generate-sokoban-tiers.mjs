#!/usr/bin/env node
/**
 * generate-sokoban-tiers.mjs — PUZZLE-DESIGN §3-2c「石3固定・壁の幾何で難易度を作り分ける」
 * を実証し、易/中/難のお試しパズル盤面（PLAN 実行キュー4.6）を生成する。
 *
 * generate-sokoban.mjs（4.5・2ボタン開けた部屋）との違い：
 *   ・石数を 3 に固定（§3-2c＝石1〜2は回り込み制約が出ず倉庫番として本質的に難しくならない）。
 *   ・難易度の主役を「石数」でなく「壁の幾何」に置く＝易/中/難で TEMPLATE を変える。
 *   ・帯ごとに実効エリア（床の広さ）を絞って状態空間を測定可能に保つ（3石は爆発しやすい）。
 *
 * 手順（§3）：
 *   1. 各帯の TEMPLATE（3ボタン S・宝 B・壁 #）から逆算(pull-BFS)で石3個の初期配置候補を作る。
 *   2. 引き距離上位から順に実ゲーム遷移（makeSolver）＋4軸（measureMetrics）で測る。
 *   3. §2 下限条件（verdict.pass）を満たし、かつ帯の L レンジに入る最初の1枚を採用する。
 *
 * ⚠️ 実マップ（work/blade-of-lumia.json）は変更しない。採用盤面はコンソールに出すだけ＝
 *    実プレイ化（test_mechanics へ組む）は別スクリプトで行う。
 *
 * Usage (run from outputs/blade-of-lumia/):
 *   node scripts/generate-sokoban-tiers.mjs            # 3帯すべて
 *   node scripts/generate-sokoban-tiers.mjs 易         # 指定帯だけ
 */

import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics, verdict } from './lib/puzzle-metrics.mjs';
import { TILE } from '../shared/tiles.js';

// ── 帯ごとの壁テンプレ（3ボタン S・宝 B・石は逆算で置く）────────────────────────
// '#' 壁 / '.' 床 / 'S' ボタン(石の目標) / 'B' 宝。実効エリアを壁で囲って床を絞る
// （3石は状態空間が爆発しやすい＝measureMetrics が回る範囲に保つ）。
// 難易度の主役は「くびれ・回り込みの絞り」＝壁の幾何（§3-2c）。
const TIERS = [
  {
    // 易：狭い開け小部屋。石3をすぐ近くの3ボタンへ押し込むだけ＝取り回しが単純で
    // 選択肢が少ない＝3帯で最も浅い。壁で床を絞って状態空間を測定可能に保つ。
    // ※ 石3固定では L18 未満は構造的に出ない（§3-2c＝石3が難しさの下限）。
    name: '易', L: [18, 26], guardMax: 800000,
    template: [
      '############',
      '#####..#####',
      '####.SS.####',
      '####.S..####',
      '####....####',
      '####....####',
      '####.B..####',
      '#####..#####',
      '############',
      '############',
    ],
    entry: '1,5',
  },
  {
    // 中：くびれ1本＋中央に散らした壁。石をどける退避と回り込みが要る。
    name: '中', L: [18, 30], guardMax: 2000000,
    template: [
      '############',
      '#####..#####',
      '###.....S###',
      '###.S.#..###',
      '###..#...###',
      '###...#S.###',
      '###.#....###',
      '###..B...###',
      '#####..#####',
      '############',
    ],
    entry: '1,5',
  },
  {
    // 難：くびれ複数＋デッドロック角。石を壁角へ押すと詰み・順序依存が強い。
    name: '難', L: [34, 60], guardMax: 6000000,
    template: [
      '############',
      '##......####',
      '##.S#.S.####',
      '##..#..#####',
      '##...#..S###',
      '##.#....####',
      '##...#..####',
      '##.B..#.####',
      '##......####',
      '############',
    ],
    entry: '1,3',
  },
];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function analyze(template) {
  const grid = template.map((row) => row.split(''));
  if (grid.length !== ROWS || grid.some((r) => r.length !== COLS))
    throw new Error(`テンプレは ${ROWS}x${COLS} 必要`);
  const buttons = [], walls = new Set(), floors = new Set();
  let chest = null;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = grid[r][c];
    if (ch === '#') { walls.add(key(r, c)); continue; }
    floors.add(key(r, c));
    if (ch === 'S') buttons.push(key(r, c));
    if (ch === 'B') chest = key(r, c);
  }
  if (!chest) throw new Error('テンプレに宝 B が無い');
  if (buttons.length !== 3) throw new Error(`テンプレのボタンは 3 個必要（今 ${buttons.length}）`);
  return { buttons, walls, floors, chest };
}

// ── 逆算(pull-BFS)：ゴール（石が全ボタン上）から引き距離で初期配置を作る ──────────
function pullBFS({ buttons, floors }) {
  const isFloor = (r, c) => floors.has(key(r, c));
  const goalStones = [...buttons].sort();
  const encode = (stones, p) => `${stones.join(';')}|${p}`;
  const stoneSet0 = new Set(goalStones);
  const start = [];
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
    for (const [dr, dc] of DIRS) {   // プレイヤーだけ動く（引かない移動＝距離0）
      const nr = pr + dr, nc = pc + dc;
      if (!isFloor(nr, nc) || stoneSet.has(key(nr, nc))) continue;
      const ns = encode(stones, key(nr, nc));
      if (!dist.has(ns)) { dist.set(ns, d); q.push(ns); }
    }
    for (const [dr, dc] of DIRS) {   // 引く（＝押しの逆・距離+1）
      const sr = pr - dr, sc = pc - dc;
      if (!stoneSet.has(key(sr, sc))) continue;
      const nr = pr + dr, nc = pc + dc;
      if (!isFloor(nr, nc) || stoneSet.has(key(nr, nc))) continue;
      const ns2 = stones.filter((s) => s !== key(sr, sc));
      ns2.push(key(pr, pc));
      ns2.sort();
      const ns = encode(ns2, key(nr, nc));
      if (!dist.has(ns)) { dist.set(ns, d + 1); q.push(ns); }
    }
  }
  const byStones = new Map();
  for (const [st, d] of dist) {
    const stonesStr = st.split('|')[0];
    if (!byStones.has(stonesStr) || byStones.get(stonesStr) < d) byStones.set(stonesStr, d);
  }
  return [...byStones.entries()]
    .map(([stones, pulls]) => ({ stones: stones.split(';'), pulls }))
    .filter((c) => c.stones.every((s) => !buttons.includes(s)))   // 初期に石がボタン上=既に解けてる=除外
    .sort((a, b) => b.pulls - a.pulls);
}

// ── 候補を実ゲーム遷移＋4軸で測る ───────────────────────────────────────────────
function buildTiles({ walls, buttons, chest }, stonePlacement) {
  const stoneSet = new Set(stonePlacement);
  const tiles = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
  const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = key(r, c);
    if (walls.has(k)) tiles[r][c] = TILE.WALL;
    else if (chest === k) tiles[r][c] = 'B';
    else if (buttons.includes(k)) tiles[r][c] = TILE.BUTTON;
    else if (stoneSet.has(k)) tiles[r][c] = TILE.STONE;
  }
  return { tiles, bg };
}

function measurePlacement(t, entry, stonePlacement, guardMax) {
  const { tiles, bg } = buildTiles(t, stonePlacement);
  const S = makeSolver(tiles, bg, [], {}, new Set());
  const start = S.encode(...parse(entry), S.initStones, 0, 0, 0);
  const goalTest = (state) => {
    const [pos, stonesStr] = state.split('|');
    if (pos !== t.chest) return false;
    const stones = stonesStr ? stonesStr.split(';') : [];
    return t.buttons.every((b) => stones.includes(b));
  };
  const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const bpos = t.buttons.map(parse);
  const [gr, gc] = parse(t.chest);
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
  return measureMetrics(S, [start], goalTest, h, { guardMax });
}

// ── 実行 ────────────────────────────────────────────────────────────────────
const only = process.argv.slice(2)[0];
const tiers = only ? TIERS.filter((t) => t.name === only) : TIERS;

for (const tier of tiers) {
  const t = analyze(tier.template);
  console.log(`\n════ ${tier.name}帯（L 目標 ${tier.L[0]}〜${tier.L[1]}）════`);
  tier.template.forEach((row, r) => console.log('  ', String(r).padStart(2), row));
  console.log(`  ボタン: ${t.buttons.join(' / ')}  宝: ${t.chest}  入口: ${tier.entry}`);

  const cands = pullBFS(t);
  console.log(`  引き距離つき石3配置候補: ${cands.length} 通り（引き距離降順に測る）`);

  let picked = null, tested = 0, tooBig = 0;
  for (const cand of cands) {
    let m;
    try { m = measurePlacement(t, tier.entry, cand.stones, tier.guardMax); }
    catch { tooBig++; continue; }
    tested++;
    if (process.env.DEBUG) console.log(`    · 石${cand.stones.join(' ')} pull${cand.pulls} L=${m.L} greedy=${m.greedy} dl=${m.deadlocks} fr=${m.forcedRatio} ${verdict(m).label}`);
    if (!verdict(m).pass) continue;
    if (m.L < tier.L[0] || m.L > tier.L[1]) continue;
    picked = { cand, m };
    break;
  }
  console.log(`  測定: ${tested} 件（状態超過スキップ ${tooBig} 件）`);

  if (!picked) { console.log(`  ✗ ${tier.name}帯：下限クリア×L帯内の盤面が見つからず（テンプレ or レンジ調整）`); continue; }
  const { cand, m } = picked;
  console.log(`  ✅ 石 ${cand.stones.join(' ')} (引き${cand.pulls}) → L=${m.L} 貪欲NG deadlock=${m.deadlocks} 強制手率=${m.forcedRatio} 本数=${m.solCount} 状態=${m.states}`);
  const { tiles } = buildTiles(t, cand.stones);
  console.log(`  ── 採用盤面（* が石の初期位置）──`);
  tiles.forEach((row, r) => console.log('    ', String(r).padStart(2), row.join('')));
}
console.log('\n※ 盤面は測定用（宝が開けた床にある）。実プレイ化では宝を allSwitchesOn ゲートの奥へ隔離する。');
