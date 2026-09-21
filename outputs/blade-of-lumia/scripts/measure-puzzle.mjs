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
 *
 * ── ダンジョン層の部屋も測れる（実行キュー 20 で追加・2026-09-21）──────────────
 *   node scripts/measure-puzzle.mjs --layer dungeon_1 2,1
 *   node scripts/measure-puzzle.mjs --layer dungeon_1 --goal 2,3 2,2   # 報酬が宝箱でない部屋
 *   node scripts/measure-puzzle.mjs --layer dungeon_1 --no-push 2,1    # 対照実験（石を押さない）
 *   node scripts/measure-puzzle.mjs --layer dungeon_1 --kill 8,9 2,2   # 対照実験（機構を壁で潰す）
 *
 *   ・`--layer` を付けると**その層で使える道具**を `shared/progression.js toolsUsableIn()`
 *     から導く（手書きの道具表を持たない＝[[blade-enemy-tables-derive-from-meta]] と同じ作法）。
 *     例：`dungeon_1` は道具ゼロ＝弓/爆弾/ブーメラン/はしご/ロウソク無しで測る。
 *     **field（既定）は従来どおりの前提（はしごあり・ロウソク無し）を維持する**＝既存の
 *     測定値（廊下O・上半5枚）を動かさないため。
 *   ・報酬セルは `chestContents` のキー → 無ければ床の報酬タイル（地図 `m`／鍵 `K`）を自動で拾う。
 *     複数あるときは `--goal r,c` で指定する。
 *   ・**対照実験**＝「その仕掛けを使わないと報酬に届かないか」を数で示す道具
 *     （届かないとき `measureMetrics` の L は `null`＝出力は「∞」と書く）：
 *       `--no-push`  石を押せない（壁として固定）
 *       `--kill r,c` そのセルを `#`（WALL）で潰す＝スイッチ/かがり火を無効化する
 *     どちらも「報酬に届かない（解なし）」になれば、その仕掛けは飾りでない
 *     （[[blade-control-experiment-needs-tile-wall]]＝未知文字で潰すと通行可になり全部
 *      「必須でない」と出る∴潰すのは必ず `#`）。
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TILE } from '../shared/tiles.js';
import { toolsUsableIn } from '../shared/progression.js';
import { ROWS, COLS, W, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics, verdict } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const DELTA_UPPER = ['14,16', '15,16', '13,17', '14,17', '15,17'];
// 床に落ちている報酬タイル（宝箱が無い部屋のゴール候補）。
const REWARD_TILES = [TILE.ITEM_DUNGEON_MAP, TILE.KEY];

// ── 引数 ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let mapFile = join(__dir, '../work/blade-of-lumia.json');
let layer = 'field';
let goalOverride = null;
let noPush = false;
const killCells = [];
const keys = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--file') { mapFile = argv[++i]; continue; }
  if (argv[i] === '--layer') { layer = argv[++i]; continue; }
  if (argv[i] === '--goal') { goalOverride = argv[++i]; continue; }
  if (argv[i] === '--kill') { killCells.push(argv[++i]); continue; }
  if (argv[i] === '--no-push') { noPush = true; continue; }
  if (argv[i] === '--delta-upper') { keys.push(...DELTA_UPPER); continue; }
  keys.push(argv[i]);
}
if (!keys.length) { console.error('usage: measure-puzzle.mjs [--layer L] [--goal r,c] [--no-push] [--kill r,c] <key...> | --delta-upper'); process.exit(1); }

// ── map データ → tiles/bg/spec ────────────────────────────────────────────────
const data = JSON.parse(readFileSync(mapFile, 'utf8'));
if (!data.layers[layer]) throw new Error(`layer ${layer} が map に無い`);
const stages = data.layers[layer].stages;

// 道具の前提＝field は従来どおり（はしごあり／ロウソク無し／弓・爆弾・ブーメラン可）。
// それ以外の層は「その層に着く時点で使える道具」を実マップから導く。
const solverOpts = (() => {
  if (layer === 'field') return {};
  const tools = toolsUsableIn(data)[layer] ?? new Set();
  return {
    hasLadder: tools.has('ladder'),
    hasCandle: tools.has('candle'),
    noTools: !(tools.has('bow') || tools.has('bomb') || tools.has('boomerang')),
    tools: [...tools],
  };
})();

function loadScreen(key) {
  const st = stages[key];
  if (!st) throw new Error(`stage ${key} が ${layer} に無い`);
  const tiles = st.tiles.map((row) => (Array.isArray(row) ? row.slice() : row.split('')));
  // 対照実験＝指定セルを WALL で潰す（未知文字で潰すと通行可になる∴必ず '#'）
  for (const cell of killCells) {
    const [r, c] = cell.split(',').map(Number);
    if (!tiles[r]?.[c]) throw new Error(`--kill ${cell} が盤面の外`);
    tiles[r][c] = TILE.WALL;
  }
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
  // 報酬セル＝①`--goal` 指定 → ②`chestContents` のキー → ③床の報酬タイル（地図/鍵）。
  // ③が複数あるときは曖昧∴`--goal` を要求する（黙って1つ選ばない）。
  let rewardCell = goalOverride ?? Object.keys(st.chestContents ?? {})[0] ?? null;
  if (!rewardCell) {
    const found = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (REWARD_TILES.includes(tiles[r][c])) found.push(`${r},${c}`);
    }
    if (found.length > 1) throw new Error(`${key}: 報酬タイルが複数（${found.join(' ')}）＝--goal で指定する`);
    rewardCell = found[0] ?? null;
  }
  const reveal = rewardCell ? (st.showConditions?.[rewardCell] ?? null) : null;
  return { tiles, bg, links, breakDefs, litInit, rewardCell, reveal };
}

// ── ゴール判定 ────────────────────────────────────────────────────────────────
function makeGoalTest(S, screen) {
  const { tiles, rewardCell, reveal } = screen;
  if (!rewardCell) throw new Error('報酬セル（chestContents／床の報酬タイル）が無い＝測れない');
  const fullLit = (1 << S.torchCells.length) - 1;
  // 笛は「持っていれば吹ける」＝盤面の状態を持たない∴道具の有無だけで決まる。
  const hasFlute = layer === 'field' || (solverOpts.tools ?? []).includes('flute');
  return (state) => {
    const [pos, stonesStr, maskStr, , litStr, lockedStr] = state.split('|');
    if (pos !== rewardCell) return false;
    if (!reveal) return true;
    if (reveal.trigger === 'flutePlayed') return hasFlute;
    if (reveal.trigger === 'stonesPlaced') return Number(lockedStr) === 1;
    if (reveal.trigger === 'killAll') return true;   // 戦闘は測らない（上界として通す）
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
  const S = makeSolver(tiles, bg, links, breakDefs, litInit, { ...solverOpts, noPush });
  if (!S.exitCells.length) throw new Error(`${key}: 外周の陸口が無い`);
  const starts = S.exitCells.map((cell) => {
    const [r, c] = cell.split(',').map(Number);
    return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
  });
  const goalTest = makeGoalTest(S, screen);
  const h = makeHeuristic(S, screen);
  // escapeTest＝「外周の口に立てる状態」＝ここへ戻れない状態はハードロック（入って詰む）。
  const escapeTest = (state) => S.exitCells.includes(state.split('|')[0]);
  const m = measureMetrics(S, starts, goalTest, h, { guardMax: 6000000, escapeTest });
  return { key, role: stages[key]?.role, reward: screen.rewardCell, ...m };
}

// ── 出力 ──────────────────────────────────────────────────────────────────────
console.log(`\nmap: ${mapFile}  /  layer: ${layer}`);
if (layer !== 'field') console.log(`道具の前提: ${(solverOpts.tools ?? []).join(' ') || '（道具ゼロ）'}`);
if (noPush || killCells.length) console.log(`対照実験: ${[noPush ? '石を押さない' : null, killCells.length ? `WALL で潰す ${killCells.join(' ')}` : null].filter(Boolean).join(' / ')}`);
for (const key of keys) {
  const m = measure(key);
  console.log(`\n── ${key}${m.role ? ` (${m.role})` : ''} ──`);
  console.log(`  報酬セル        : ${m.reward}`);
  console.log(`  状態空間        : ${m.states}`);
  // 届かないときの L は null（`lib/puzzle-metrics.mjs` の表現）＝Infinity ではない。
  console.log(`  軸① 最短手数 L  : ${m.L == null ? '∞（報酬に届かない＝解なし）' : m.L}`);
  console.log(`  軸② 貪欲で解ける: ${m.greedy ? 'YES（insight=0・作業ゲー）' : 'NO（insight>0）'}`);
  console.log(`  軸③ デッドロック: ${m.deadlocks}`);
  console.log(`  軸④ 最短解本数  : ${m.solCount}`);
  console.log(`  軸④ 強制手率    : ${m.forcedRatio}`);
  console.log(`  詰み（noEscape）: ${m.noEscape}`);
  console.log(`  判定            : ${verdict(m).label}`);
}
console.log('');
