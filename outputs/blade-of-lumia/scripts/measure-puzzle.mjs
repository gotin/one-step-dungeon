#!/usr/bin/env node
/**
 * measure-puzzle.mjs — パズルの難易度を PUZZLE-DESIGN.md §4 の4軸で測る
 *
 * 現ソルバー（verifyPuzzle）は「成立条件」（解ける/詰まない/飾りでない）しか測らず
 * 難易度を測っていなかった＝深洋O 上半5枚が「各画面1手で解ける宝」になった原因。
 * このスクリプトは実ゲームと同じ遷移関数（lib/blade-solver.mjs の makeSolver）で
 * 状態空間を作り、次の4軸を数値で出す：
 *
 *   軸① 深さ L        … 入口→ゴール の最短手数（BFS 距離）
 *   軸② 気づきにくさ   … 貪欲法（ヒューリスティックを増やさない手だけ選ぶ）で解けるか
 *   軸③ デッドロック D … 到達状態のうち「もうゴールへ戻れない」非ゴール状態の数
 *   軸④ 解の細さ      … 最短解の本数＋強制手率（ゴールへ進む手が1つしかない状態の割合）
 *
 * ゴール（＝報酬取得）の定義は map データから導く：
 *   ・報酬セル = chestContents のキー（1個想定）。
 *   ・出現条件 showConditions[報酬セル]：
 *       switchOn  → その switch がその状態で ON（S=足/石が乗る・Y=マスクbit）
 *       torchesLit → 全 'H' 点灯
 *       条件なし   → 常に出現（＝セル到達だけでゴール）
 *   ・ゴール状態 = プレイヤーが報酬セルにいて、かつ出現条件を満たす。
 *
 * 入口は exitCells（外周の陸口）すべて＝「どの縁から入っても最短で何手か」を測る
 * （spec の entryCells に結合しない＝5番のダンジョンパズルにもそのまま使える）。
 *
 * Usage (run from outputs/blade-of-lumia/):
 *   node scripts/measure-puzzle.mjs 14,17            # 実マップの1画面を測る
 *   node scripts/measure-puzzle.mjs 14,16 15,16 ...  # 複数
 *   node scripts/measure-puzzle.mjs --delta-upper    # 深洋O 上半5枚
 *   node scripts/measure-puzzle.mjs --file work/puzzle-lab.json 5,5   # 別マップ（生成実験用）
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TILE } from '../shared/tiles.js';
import { ROWS, COLS, W, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics, verdict } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const DELTA_UPPER = ['14,16', '15,16', '13,17', '14,17', '15,17'];

// ── 引数 ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let mapFile = join(__dir, '../work/blade-of-lumia.json');
const keys = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--file') { mapFile = argv[++i]; continue; }
  if (argv[i] === '--delta-upper') { keys.push(...DELTA_UPPER); continue; }
  keys.push(argv[i]);
}
if (!keys.length) { console.error('usage: measure-puzzle.mjs <key...> | --delta-upper'); process.exit(1); }

// ── map データ → tiles/bg/spec ────────────────────────────────────────────────
const data = JSON.parse(readFileSync(mapFile, 'utf8'));
const stages = data.layers.field.stages;

function loadScreen(key) {
  const st = stages[key];
  if (!st) throw new Error(`stage ${key} が map に無い`);
  const tiles = st.tiles.map((row) => (Array.isArray(row) ? row.slice() : row.split('')));
  // bgTiles は {"r,c": ch} オブジェクト。2D 配列へ戻す（無ければ全 'g'）。
  const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
  if (st.bgTiles) for (const [k, ch] of Object.entries(st.bgTiles)) {
    const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
  }
  // links: [{switchId,gateId}] → [[switchId,[gateId...]]]
  const linkMap = new Map();
  for (const { switchId, gateId } of st.links ?? []) {
    if (!linkMap.has(switchId)) linkMap.set(switchId, []);
    linkMap.get(switchId).push(gateId);
  }
  const links = [...linkMap.entries()];
  const breakDefs = {};
  for (const [k, v] of Object.entries(st.breakableWalls ?? {})) breakDefs[k] = v.breakDef ?? 1;
  const litInit = new Set(st.initLitTorches ?? []);
  const rewardCell = Object.keys(st.chestContents ?? {})[0] ?? null;
  const reveal = rewardCell ? (st.showConditions?.[rewardCell] ?? null) : null;
  return { tiles, bg, links, breakDefs, litInit, rewardCell, reveal };
}

// ── ゴール判定 ────────────────────────────────────────────────────────────────
function makeGoalTest(S, screen) {
  const { tiles, rewardCell, reveal } = screen;
  if (!rewardCell) throw new Error('報酬セル（chestContents）が無い＝測れない');
  const fullLit = (1 << S.torchCells.length) - 1;
  return (state) => {
    const [pos, stonesStr, maskStr, , litStr] = state.split('|');
    if (pos !== rewardCell) return false;
    if (!reveal) return true;
    if (reveal.trigger === 'torchesLit') return Number(litStr) === fullLit && S.torchCells.length > 0;
    if (reveal.trigger === 'switchOn') {
      const sid = reveal.switchId;
      const [sr, sc] = sid.split(',').map(Number);
      const ch = tiles[sr]?.[sc];
      if (ch === TILE.BUTTON) {
        const stones = stonesStr ? stonesStr.split(';') : [];
        return pos === sid || stones.includes(sid);
      }
      if (ch === TILE.SWITCH) {
        const i = S.toggleCells.indexOf(sid);
        return i >= 0 && (Number(maskStr) & (1 << i)) !== 0;
      }
    }
    return true;
  };
}

// ── ヒューリスティック（軸②貪欲法の指標）────────────────────────────────────────
// 「報酬に近づく／石をボタンへ寄せる／かがり火を点ける」を減らす方向。倉庫番は
// これを一度増やす手（石を退避・遠回り）が必須＝貪欲法が詰まる＝insight>0。
function makeHeuristic(S, screen) {
  const { rewardCell } = screen;
  const [gr, gc] = rewardCell.split(',').map(Number);
  const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const buttonPos = S.buttons.map((b) => b.split(',').map(Number));
  return (state) => {
    const [pos, stonesStr, , , litStr] = state.split('|');
    const [pr, pc] = pos.split(',').map(Number);
    let h = man([pr, pc], [gr, gc]);
    const stones = stonesStr ? stonesStr.split(';') : [];
    for (const s of stones) {
      const sp = s.split(',').map(Number);
      if (buttonPos.length) h += Math.min(...buttonPos.map((b) => man(sp, b)));
    }
    const lit = Number(litStr);
    let unlit = 0;
    for (let i = 0; i < S.torchCells.length; i++) if (!(lit & (1 << i))) unlit++;
    h += unlit * 3;
    return h;
  };
}

// ── 全探索＋4軸（測定コアは lib/puzzle-metrics.mjs）──────────────────────────────
function measure(key) {
  const screen = loadScreen(key);
  const { tiles, bg, links, breakDefs, litInit } = screen;
  const S = makeSolver(tiles, bg, links, breakDefs, litInit);
  if (!S.exitCells.length) throw new Error(`${key}: 外周の陸口が無い`);
  const starts = S.exitCells.map((cell) => {
    const [r, c] = cell.split(',').map(Number);
    return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
  });
  const goalTest = makeGoalTest(S, screen);
  const h = makeHeuristic(S, screen);
  const m = measureMetrics(S, starts, goalTest, h, { guardMax: 6000000 });
  return { key, role: stages[key]?.role, reward: screen.rewardCell, ...m };
}

// ── 出力 ──────────────────────────────────────────────────────────────────────
console.log(`\nmap: ${mapFile}`);
for (const key of keys) {
  const m = measure(key);
  console.log(`\n── ${key}${m.role ? ` (${m.role})` : ''} ──`);
  console.log(`  状態空間        : ${m.states}`);
  console.log(`  軸① 最短手数 L  : ${m.L}`);
  console.log(`  軸② 貪欲で解ける: ${m.greedy ? 'YES（insight=0・作業ゲー）' : 'NO（insight>0）'}`);
  console.log(`  軸③ デッドロック: ${m.deadlocks}`);
  console.log(`  軸④ 最短解本数  : ${m.solCount}`);
  console.log(`  軸④ 強制手率    : ${m.forcedRatio}`);
  console.log(`  判定            : ${verdict(m).label}`);
}
console.log('');
