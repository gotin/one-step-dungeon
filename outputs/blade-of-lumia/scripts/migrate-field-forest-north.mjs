#!/usr/bin/env node
/**
 * migrate-field-forest-north.mjs
 *   9-6-BASE 外周解体＋隣接地域編入（キュー8番）の**森 F 北西 +8画面**を作り込む。
 *   `0,0` `1,0` `2,0` `3,0` `0,1` `1,1` `3,1` `0,2`（実データで全て 0〜1軸の空塗り絵）。
 *
 * 背景:
 *   これら8画面は「外周＝縁取りだけの塗り絵」として残っていた最後のまとまりで、
 *   森 F の北西角に穴として開いていた（歩けるが何も無い＝素通り）。ここを森の作り込み
 *   （細いバックボーン＋噛み合う樹海）で埋め、併せて **銅の剣 tier1 の洞窟入口**（`0,0` の
 *   爆弾で割る崖の裂け目）を世界へ差し込む。洞窟の中身は
 *   `scripts/migrate-forest-cave-bronze-sword.mjs`（別スクリプト）が作る。
 *
 * 設計（ユーザー確定 2026-08-20）:
 *   骨格＝崖 'M' と樹海 't' の噛み合わせ帯／洞窟入口＝`0,0`／洞窟のパズル＝かがり火＋石押し。
 *   1画面ずつ「何のための画面か」を決めた一点物（量産しない）:
 *     0,0 岩室の裂け目 … 爆弾壁 '!' の奥に洞窟入口 '>'（銅の剣への導線）
 *     1,0 北縁の分かれ道 … 環状の道＋穴 'x' 越しの宝（はしご）
 *     2,0 風の環状列石 … 石畳 'o' の環状列石＝笛ワープの着地点（ロアを合わせる）
 *     3,0 東の樹海口 … 茂み 'u' の奥の宝＋東へ抜ける崖沿いの道
 *     0,1 森の番人 … センチネル+チェイサーを全滅させると封印が解ける宝箱
 *     1,1 押し石の隠れ処 … 石 '*' を1手ずらして開く隠れ処
 *     3,1 裂け目の道標 … 茂みの奥の道標＋穴 'x' 越しの宝
 *     0,2 苔むした古道 … 石畳の古道（ランドマーク）＋北の裂け目を指す道標
 *
 * 自己検証（このスクリプトは検証込みで1本＝流し込みだけの migrate にしない）:
 *   ① 外周リング：隣画面の**実データ**から必要な開口を不動点で求め、盤面と1セル単位で照合。
 *      閉じたリングセルは地図境界なら崖 'M'・それ以外は樹海 't'（見た目の統一）。
 *   ② 徒歩だけの到達（道具なし・ゲート閉）で、開いた外周セルが**全部ひとつの塊**にある
 *      ＝どの辺から入っても他の辺へ抜けられる（traps を作らない）。
 *   ③ 状態空間（scripts/lib/blade-solver.mjs＝実エンジンの遷移の写し）で
 *      - 壁でないセルが**全部**到達可能＝無駄セル0（作り込んだのに入れない部屋を作らない）
 *      - 宝箱・洞窟入口・看板の隣が到達可能
 *      - どの到達状態からも開いた外周セルへ戻れる＝入って詰まない
 *      - 対照実験で「その道具が無いと届かない」＝仕掛けが飾りでないこと
 *        （爆弾／はしご／石押し／茂み刈りをそれぞれ封じて未到達を確認）
 *   ④ 画面の軸（field-quality.screenAxes）が全画面 2軸以上＝素通り画面を増やさない。
 *   ⑤ 同一配置の重複が無い（既存 320 画面すべてとタイル列を照合）。
 *   ⑥ 宝箱/showConditions のセルは 'B'・看板のセルは 'i' で本文がある・mapEnters のセルは '>'。
 *
 * 使い方: node scripts/migrate-field-forest-north.mjs [--dry] [--rings]
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked, cellTile } from './lib/connectivity.mjs';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { screenAxes } from './lib/field-quality.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const DRY = process.argv.includes('--dry');
const RINGS_ONLY = process.argv.includes('--rings');

// ── 盤面 ────────────────────────────────────────────────────────────────────
// '.' 草地（下地 bgTiles 'g'）/ 't' 樹海 / 'M' 崖 / 'u' 茂み / '!' 爆弾で割れる岩 /
// 'x' 穴（はしごで幅1だけ渡れる）/ '*' 押せる石 / 'o' 石畳 / 'B' 宝箱 / 'i' 石碑・道標 /
// '>' 洞窟入口 / 'F' センチネル / 'C' チェイサー。
//
// tools 欄＝その画面の仕掛けの「必須性」を対照実験で示す指定。
//   { cell, control } … control を封じたら cell に到達できないこと。
//   control: 'noTools'（爆弾/弓/ロウソク封じ）/ 'noLadder' / 'noPush' / 'noBush'
const SCREENS = [
  {
    key: '0,0',
    title: '岩室の裂け目',
    // 崖に囲まれた北西の隅。中央の樹海帯で南北を仕切り、西の崖沿いだけが道。
    // 岩 '!' を割ると北の窪みへ入れ、そこに洞窟入口 '>'（銅の剣の岩室）がある。
    tiles: [
      'MMMMMMMMMMMM',
      'M.>.tttttttt',
      'M...tttttttt',
      'Mt!ttttttttt',
      'M...........',
      'Mi.tt..ttt..',
      'Mtttt..ttttt',
      'Mtttt..ttttt',
      'Mtttt..ttttt',
      'Mtttt..ttttt',
    ],
    breakableWalls: { '3,2': { breakDef: 2 } },
    mapEnters: { '1,2': { id: 'field_forest_cave', destId: 'forest_cave' } },
    signData: {
      '5,1': {
        name: '崖の道標',
        lines: [
          '【岩室の裂け目】',
          '北の岩肌に 割れ目の跡がある。',
          '硬い岩は 爆ぜる音を待っている。',
        ],
      },
    },
    tools: [{ cell: '1,2', control: 'noTools', why: '爆弾で岩を割らないと洞窟入口に立てない' }],
  },
  {
    key: '1,0',
    title: '北縁の分かれ道',
    // 崖の南縁を東西に走る道が row1 と row4 の二本に分かれ、col1/col10 で環になる。
    // 西の小部屋は道から一歩外れた宝、東の窪みは穴 'x' を渡らないと入れない宝。
    tiles: [
      'MMMMMMMMMMMM',
      't..........t',
      't.tttttttt.t',
      't.tttt..tt.t',
      '............',
      '..ttt..ttt..',
      't...t..tttxt',
      't.B.t..tt..t',
      't...t..tt.Bt',
      'ttttt..ttttt',
    ],
    chestContents: {
      '7,2': { type: 'item', item: 'healPotion', name: '回復薬（小）' },
      '8,10': { type: 'rupee', value: 30, name: 'ルピー×30' },
    },
    tools: [{ cell: '8,10', control: 'noLadder', why: 'はしごで穴を渡らないと東の窪みへ入れない' }],
  },
  {
    key: '2,0',
    title: '風の環状列石',
    // 石畳を**環**に敷いた列石（中は草地のまま＝環に見える形にする）。西と東の口を
    // 立石（崖岩 'M'）が二対で挟む。空中の遺跡から笛で吹き戻される着地点がここ
    // （(8,6)＝tests/flute.spec.js が固定）＝「風がここへ人を運ぶ」ロアを合わせる。
    // ⚠️ 石畳 'o' も草地 '.' も歩ける∴中を草地に抜いても歩行・状態空間は変わらない
    //    （見た目だけの作り込み）。環にしないと看板の「石を環に並べた」と絵が食い違う。
    tiles: [
      'MMMMMMMMMMMM',
      'tttttttttttt',
      'tt.....ttttt',
      'tt.ttttttttt',
      '............',
      '..tMooooMt..',
      't.ioo..oo..t',
      't..Mo..oM.tt',
      'tt..oooo..tt',
      'ttttt..ttttt',
    ],
    signData: {
      '6,2': {
        name: '風の環状列石',
        lines: [
          '【風の環状列石】',
          '石を環に並べたのは 古き森の民。',
          '風がここへ 人を運ぶという。',
        ],
      },
    },
  },
  {
    key: '3,0',
    title: '東の樹海口',
    // 東の崖沿いに縦の道（col10-11）が通り、そこから東の未整地へ抜ける。
    // 北西の茂みを刈ると小さな宝の窪み。
    tiles: [
      'MMMMMMMMMMMM',
      'tttttttttt..',
      'ttBttttttt..',
      'ttuttttttM..',
      '............',
      '..ttt..ttt..',
      'ttttt..tMt..',
      'ttttt..ttt..',
      'ttttt..ttt..',
      'ttttt..tttt.',
    ],
    chestContents: { '2,2': { type: 'rupee', value: 20, name: 'ルピー×20' } },
    tools: [{ cell: '2,2', control: 'noBush', why: '茂みを刈らないと宝の窪みへ入れない' }],
  },
  {
    key: '0,1',
    title: '森の番人',
    // 北の広間に番人（センチネル+チェイサー）。全滅させると壁龕の宝箱の封印が解ける。
    // 南は崖沿いの縦道が素通りできる＝戦うか走り抜けるかを選べる。
    tiles: [
      'Mtttt..ttttt',
      'Mt.....B.ttt',
      'Mt..C..F..tt',
      'Mt.tt...t.tt',
      'M...........',
      'Mtttt..tttt.',
      'Mtttt..ttttt',
      'Mtttt..ttttt',
      'Mtttt..ttttt',
      'Mtttt..ttttt',
    ],
    chestContents: { '1,7': { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } },
    showConditions: { '1,7': { trigger: 'killAll' } },
  },
  {
    key: '1,1',
    title: '押し石の隠れ処',
    // 四方に抜ける十字路。南西の袋小路は石 '*' で塞がっていて、1手押しずらすと
    // その裏の隠れ処（宝箱）に入れる。
    tiles: [
      'ttttt..ttttt',
      'tt.....ttttt',
      'tt.tt..ttttt',
      'tt...t.ttttt',
      '............',
      '...t...tt...',
      'tt.tt..ttt.t',
      't.*....tt..t',
      'tB.tt..tt..t',
      'ttttt..ttttt',
    ],
    chestContents: { '8,1': { type: 'rupee', value: 25, name: 'ルピー×25' } },
    tools: [{ cell: '8,1', control: 'noPush', why: '石を押しずらさないと隠れ処に入れない' }],
  },
  {
    key: '3,1',
    title: '裂け目の道標',
    // 東の崖沿いの縦道（col10-11）に沿って、西に茂みの奥の道標、東に穴を渡る宝。
    tiles: [
      'ttttt..tttt.',
      'tt.....ttt..',
      'tt.ttt.tt...',
      'tt.ttt.ttt..',
      '............',
      '..tt.....t..',
      't.ttt..t.t..',
      'tu..t..txt..',
      't.i.t..t.Bt.',
      'ttttt..ttttt',
    ],
    chestContents: { '8,9': { type: 'rupee', value: 50, name: 'ルピー×50' } },
    signData: {
      '8,2': {
        name: '樹海の道標',
        lines: [
          '【樹海の道標】',
          '刈り開いた先に 古い道標が埋もれていた。',
          '「北へ登れば 崖。東へ下れば 深き樹海」',
        ],
      },
    },
    tools: [
      { cell: '8,2', control: 'noBush', why: '茂みを刈らないと道標へ近づけない' },
      { cell: '8,9', control: 'noLadder', why: 'はしごで穴を渡らないと東の宝に届かない' },
    ],
  },
  {
    key: '0,2',
    title: '苔むした古道',
    // 森の民が敷いた石畳の古道が南北に貫く（ランドマーク）。門柱の立石が二対。
    // 道端の道標が北の「裂け目」＝銅の剣の洞窟を指す＝世界の中に導線を置く。
    tiles: [
      'Mtttt..ttttt',
      'Mttt.oo.tttt',
      'MtttMooMtttt',
      'Mttt.oo.tttt',
      'M...ooooo...',
      'M.tt.iooo.t.',
      'Mttt.oo.tttt',
      'MtttMooMtttt',
      'Mttt.oo.tttt',
      'Mtttt..ttttt',
    ],
    signData: {
      '5,5': {
        name: '古道の道標',
        lines: [
          '【苔むした古道】',
          'この石畳は 森の民が敷いたもの。',
          '北へ登れば 岩室の裂け目。',
          '硬い岩は 爆ぜる音を待っている。',
        ],
      },
    },
  },
];

// ── 小道具 ──────────────────────────────────────────────────────────────────
const key = (r, c) => `${r},${c}`;
const parse = (rows, label) => {
  if (rows.length !== ROWS) throw new Error(`${label}: 行数が ${rows.length}（${ROWS} でない）`);
  return rows.map((row, r) => {
    if (row.length !== COLS) throw new Error(`${label}: row${r} の列数が ${row.length}（${COLS} でない）`);
    return [...row];
  });
};
const RING = [];
for (let c = 0; c < COLS; c++) { RING.push([0, c]); RING.push([ROWS - 1, c]); }
for (let r = 1; r < ROWS - 1; r++) { RING.push([r, 0]); RING.push([r, COLS - 1]); }
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 徒歩で立てるか（道具なし・ゲート閉）。敵タイルは床の上に立っている＝歩ける。 */
const walkable = (tiles, r, c) => {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  const ch = tiles[r][c];
  if (ch === TILE.GATE) return false;
  if (ch === TILE.BREAKABLE_WALL) return false;
  if (ENEMY_META[ch]) return true;
  return !isHardBlocked(ch);
};

// ── ① 外周リングの必要開口（隣画面の実データからの不動点） ──────────────────
// 規則は「地域ごとに変わる」（湖=リング保持ミラー／森=細バックボーン）ので、ここでは
// **隣が実在するなら隣の実タイルに合わせる（ミラー）／隣も今回作る画面なら標準の細い十字
// （縦は col5,6・横は row4,5）** を採り、両者が衝突する角セルは閉じる（veto）。
// 未着手の隣が開いているのに壁を作ると継ぎ目バグ、逆に隣が壁なのに開けると dead edge。
const isStandardCross = (axis, r, c) => (axis === 'v' ? (c === 5 || c === 6) : (r === 4 || r === 5));
const crossingsOf = (sx, sy, r, c) => {
  const out = [];
  if (r === 0) out.push([`${sx},${sy - 1}`, ROWS - 1, c, 'v']);
  if (r === ROWS - 1) out.push([`${sx},${sy + 1}`, 0, c, 'v']);
  if (c === 0) out.push([`${sx - 1},${sy}`, r, COLS - 1, 'h']);
  if (c === COLS - 1) out.push([`${sx + 1},${sy}`, r, 0, 'h']);
  return out;
};
function requiredRings(fieldStages, rebuiltKeys) {
  const req = new Map();
  for (const k of rebuiltKeys) req.set(k, Array.from({ length: ROWS }, () => Array(COLS).fill(false)));
  let changed = true;
  while (changed) {          // 作り替え画面同士が互いを参照する∴不動点まで回す
    changed = false;
    for (const k of rebuiltKeys) {
      const [sx, sy] = k.split(',').map(Number);
      for (const [r, c] of RING) {
        let want = false, veto = false;
        for (const [nk, nr, nc, axis] of crossingsOf(sx, sy, r, c)) {
          if (rebuiltKeys.has(nk)) {
            if (isStandardCross(axis, r, c) || req.get(nk)[nr][nc]) want = true;
          } else {
            const ns = fieldStages[nk];
            if (!ns) continue;                                  // 地図の外＝この向きは無関係
            if (!isHardBlocked(cellTile(ns, nr, nc))) want = true;
            else veto = true;                                   // 隣が壁＝開けたら dead edge
          }
        }
        const next = want && !veto;
        if (req.get(k)[r][c] !== next) { req.get(k)[r][c] = next; changed = true; }
      }
    }
  }
  return req;
}

function checkRing(spec, tiles, need) {
  const [sx, sy] = spec.key.split(',').map(Number);
  for (const [r, c] of RING) {
    const open = walkable(tiles, r, c);
    if (need[r][c] && !open)
      throw new Error(`${spec.key}: 外周 ${key(r, c)} は開いていないといけない（隣が開いている＝継ぎ目バグ）`);
    if (!need[r][c] && open)
      throw new Error(`${spec.key}: 外周 ${key(r, c)} は閉じていないといけない（隣が壁 or 地図の外＝dead edge）`);
    if (need[r][c]) continue;
    // 閉じた外周の見た目＝地図の境界は崖 'M'、内側の境界は樹海 't'（森の統一）。
    const onMapEdge = (r === 0 && sy === 0) || (c === 0 && sx === 0);
    const wantTile = onMapEdge ? TILE.MOUNTAIN : TILE.TREE;
    if (tiles[r][c] !== wantTile)
      throw new Error(`${spec.key}: 閉じた外周 ${key(r, c)} が '${tiles[r][c]}'（'${wantTile}' で統一する）`);
  }
}

// ── ② 徒歩だけの到達（開いた外周が全部ひとつの塊か） ────────────────────────
function walkBFS(tiles, startKey) {
  const seen = new Set([startKey]);
  const q = [startKey];
  while (q.length) {
    const [r, c] = q.shift().split(',').map(Number);
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc, k = key(nr, nc);
      if (seen.has(k)) continue;
      if (!walkable(tiles, nr, nc)) continue;
      seen.add(k); q.push(k);
    }
  }
  return seen;
}

// ── ③ 状態空間（実エンジンの遷移の写し） ────────────────────────────────────
const BG = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));   // 森の下地（水は無い）
const FULL = { hasLadder: true, hasCandle: true, bushCuttable: true, pitCrossable: true };
const CONTROLS = {
  noTools: { ...FULL, noTools: true },
  noLadder: { ...FULL, hasLadder: false },
  noPush: { ...FULL, noPush: true },
  noBush: { ...FULL, bushCuttable: false },
};
function solverFor(tiles, spec, opt) {
  const breaks = Object.fromEntries(
    Object.entries(spec.breakableWalls ?? {}).map(([k, v]) => [k, v.breakDef]));
  return makeSolver(tiles, BG, [], breaks, new Set(), opt);
}
/** 到達状態と逆辺（詰み判定用）。 */
function explore(S, startKey) {
  const [r, c] = startKey.split(',').map(Number);
  const start = S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
  const seen = new Set([start]);
  const rev = new Map();
  const q = [start];
  let guard = 0;
  while (q.length) {
    if (++guard > 3000000) throw new Error('状態空間が大きすぎる（設計を単純に）');
    const st = q.shift();
    for (const nx of S.nextStates(st)) {
      if (!rev.has(nx)) rev.set(nx, []);
      rev.get(nx).push(st);
      if (seen.has(nx)) continue;
      seen.add(nx); q.push(nx);
    }
  }
  return { seen, rev };
}
const cellsOf = (seen) => new Set([...seen].map((st) => st.split('|')[0]));

// 壁として据え置くタイル（到達しなくてよい）。'i' 石碑と 'H' かがり火は「隣から使う」物。
const PROP_TILES = new Set([TILE.TREE, TILE.MOUNTAIN, TILE.WALL, TILE.WATER, TILE.SIGN, TILE.TORCH]);

function checkStates(spec, tiles, openRing) {
  const S = solverFor(tiles, spec, FULL);
  const { seen, rev } = explore(S, openRing[0]);
  const reached = cellsOf(seen);

  // (a) 無駄セル0＝壁でないセルは全部（道具を使えば）到達できる。
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (PROP_TILES.has(tiles[r][c])) continue;
    if (!reached.has(key(r, c)))
      throw new Error(`${spec.key}: ${key(r, c)}('${tiles[r][c]}') に道具を使っても到達できない＝無駄セル`);
  }
  // (b) 看板は隣に立てる＝読める。
  for (const k of Object.keys(spec.signData ?? {})) {
    const [nr, nc] = k.split(',').map(Number);
    if (!DIRS.some(([dr, dc]) => reached.has(key(nr + dr, nc + dc))))
      throw new Error(`${spec.key}: 看板 ${k} に隣接できない＝読めない`);
  }
  // (c) 入って詰まない＝どの到達状態からも「開いた外周セルに立つ状態」へ戻れる。
  const back = new Set();
  const rq = [];
  const openSet = new Set(openRing);
  for (const st of seen) if (openSet.has(st.split('|')[0])) { back.add(st); rq.push(st); }
  while (rq.length) {
    const st = rq.shift();
    for (const prev of rev.get(st) ?? []) {
      if (back.has(prev)) continue;
      back.add(prev); rq.push(prev);
    }
  }
  const stuck = [...seen].filter((st) => !back.has(st));
  if (stuck.length)
    throw new Error(`${spec.key}: 外周へ戻れない状態が ${stuck.length} 件（例 ${stuck[0]}）＝入って詰む`);

  // (d) 対照実験＝仕掛けが飾りでない。
  for (const t of spec.tools ?? []) {
    const opt = CONTROLS[t.control];
    if (!opt) throw new Error(`${spec.key}: 未知の control '${t.control}'`);
    const r2 = cellsOf(explore(solverFor(tiles, spec, opt), openRing[0]).seen);
    if (r2.has(t.cell))
      throw new Error(`${spec.key}: ${t.control} でも ${t.cell} に届く＝「${t.why}」が成立していない`);
  }
  return seen.size;
}

// ── ④⑥ 中身の整合（宝箱/看板/入口/軸） ─────────────────────────────────────
function buildStage(spec, tiles) {
  const bgTiles = {};
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) bgTiles[key(r, c)] = 'g';
  return {
    cols: COLS,
    rows: ROWS,
    tiles,
    bgTiles,
    links: [],
    enemyDirs: spec.enemyDirs ?? {},
    chestContents: spec.chestContents ?? {},
    floorItems: spec.floorItems ?? {},
    objects: {},
    npcData: {},
    shopData: {},
    mapEnters: spec.mapEnters ?? {},
    showConditions: spec.showConditions ?? {},
    breakableWalls: spec.breakableWalls ?? {},
    isBossRoom: false,
    signData: spec.signData ?? {},
  };
}

function checkContent(spec, stage) {
  const t = stage.tiles;
  const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r][c]; };
  for (const k of Object.keys(stage.chestContents))
    if (at(k) !== TILE.CHEST) throw new Error(`${spec.key}: 宝箱 ${k} のタイルが '${at(k)}'（'B' でない）`);
  for (const k of Object.keys(stage.showConditions))
    if (at(k) !== TILE.CHEST) throw new Error(`${spec.key}: showConditions ${k} のタイルが '${at(k)}'（'B' でない）`);
  for (const [k, sd] of Object.entries(stage.signData)) {
    if (at(k) !== TILE.SIGN) throw new Error(`${spec.key}: 看板 ${k} のタイルが '${at(k)}'（'i' でない）`);
    if (!sd.lines?.length) throw new Error(`${spec.key}: 看板 ${k} に本文が無い（無言看板）`);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (t[r][c] === TILE.SIGN && !stage.signData[key(r, c)])
      throw new Error(`${spec.key}: 'i'(${key(r, c)}) に signData が無い＝無言看板`);
    if (t[r][c] === TILE.CHEST && !stage.chestContents[key(r, c)])
      throw new Error(`${spec.key}: 'B'(${key(r, c)}) に中身が無い`);
    if (t[r][c] === TILE.BREAKABLE_WALL && !stage.breakableWalls[key(r, c)])
      throw new Error(`${spec.key}: '!'(${key(r, c)}) に breakableWalls の定義が無い`);
    if (t[r][c] === TILE.MAP_ENTER && !stage.mapEnters[key(r, c)])
      throw new Error(`${spec.key}: '>'(${key(r, c)}) に mapEnters が無い`);
    if (ENEMY_META[t[r][c]]?.directional && !stage.enemyDirs[key(r, c)])
      throw new Error(`${spec.key}: 向き別スプライトの敵 '${t[r][c]}'(${key(r, c)}) に enemyDirs が無い`);
  }
  for (const k of Object.keys(stage.mapEnters))
    if (at(k) !== TILE.MAP_ENTER) throw new Error(`${spec.key}: mapEnters ${k} のタイルが '${at(k)}'（'>' でない）`);
  const axes = screenAxes(stage);
  if (axes.size < 2) throw new Error(`${spec.key}: 軸が ${axes.size} 個（[${[...axes]}]）＝素通り画面`);
  return axes;
}

// ── 実行 ────────────────────────────────────────────────────────────────────
const d = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = d.layers.field.stages;
const rebuilt = new Set(SCREENS.map((s) => s.key));
for (const k of rebuilt) if (!stages[k]) throw new Error(`field ${k} が無い`);

const req = requiredRings(stages, rebuilt);
if (RINGS_ONLY) {
  for (const s of SCREENS) {
    const g = req.get(s.key);
    console.log(`=== ${s.key} ${s.title}`);
    console.log('   要開口:', RING.filter(([r, c]) => g[r][c]).map(([r, c]) => key(r, c)).join(' '));
  }
  process.exit(0);
}

const report = [];
for (const spec of SCREENS) {
  const tiles = parse(spec.tiles, spec.key);
  checkRing(spec, tiles, req.get(spec.key));

  // ② 開いた外周が全部ひとつの塊にあること。
  const openRing = RING.filter(([r, c]) => req.get(spec.key)[r][c]).map(([r, c]) => key(r, c));
  if (!openRing.length) throw new Error(`${spec.key}: 開いた外周が無い＝孤立画面`);
  const comp = walkBFS(tiles, openRing[0]);
  const off = openRing.filter((k) => !comp.has(k));
  if (off.length) throw new Error(`${spec.key}: 外周 ${off.join(' ')} が徒歩で他の外周とつながらない`);

  const states = checkStates(spec, tiles, openRing);
  const stage = buildStage(spec, tiles);
  const axes = checkContent(spec, stage);
  report.push({ spec, stage, states, axes });
}

// ⑤ 同一配置の重複（既存の全画面と照合＝dup ratchet を増やさない）。
const hashOf = (s) => (s.tiles ?? []).map((row) => (Array.isArray(row) ? row.join('') : row)).join('|');
const others = new Map();
for (const [k, s] of Object.entries(stages)) if (!rebuilt.has(k)) others.set(hashOf(s), k);
const mine = new Map();
for (const { spec, stage } of report) {
  const h = hashOf(stage);
  if (others.has(h)) throw new Error(`${spec.key}: 既存 ${others.get(h)} と同一配置`);
  if (mine.has(h)) throw new Error(`${spec.key}: ${mine.get(h)} と同一配置`);
  mine.set(h, spec.key);
}

for (const { spec, stage } of report) stages[spec.key] = stage;

// 書式は他の migrate と同じ 2スペース・末尾改行なし（違えるとファイル全体が差分になる）。
if (!DRY) writeFileSync(MAP_PATH, JSON.stringify(d, null, 2));

console.log(`✅ 森F 北西 +8画面を作り込み${DRY ? '（--dry: 書き込みなし）' : ''}`);
for (const { spec, states, axes } of report) {
  console.log(`   ${spec.key.padEnd(4)} ${spec.title.padEnd(9)} 軸[${[...axes].join(',')}] 状態 ${states}`
    + (spec.tools?.length ? ` 対照 ${spec.tools.map((t) => t.control).join('/')}` : ''));
}
