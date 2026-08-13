#!/usr/bin/env node
// 9-6 ベースライン再設計・分析専用（マップは一切書き換えない・印字のみ）
// 外周(^/~)を隣接主題地域へ nearest-land 編入し、深洋(陸から d>=DEEP)を新地域 O に、
// 山地/沼 M を山地(M)/沼(P) に分割した「叩き台 ZONE_MAP」を提案する。
// 目的: FIELD-BASELINE-BRAINSTORM.md「新ZONE_MAP座標詰め」の data 土台。

const GRID_W = 16, GRID_H = 20;

// 現行 ZONE_MAP（migrate-field-m4.mjs より）
const ZONE = [
  ['^','^','^','^','^','^','T','K','K','^','^','^','L','^','^','^'],
  ['^','^','F','^','^','G','G','G','G','G','^','L','L','L','^','^'],
  ['^','F','F','F','G','G','G','G','G','G','G','L','L','L','^','^'],
  ['F','F','F','F','G','G','G','G','G','G','G','G','L','S','^','^'],
  ['F','F','F','F','G','G','G','G','G','G','G','G','S','S','S','^'],
  ['F','F','F','F','G','G','G','G','G','G','G','S','S','S','S','^'],
  ['F','F','F','G','G','G','G','G','G','G','S','S','S','S','~','~'],
  ['F','F','F','G','G','G','G','G','G','W','W','S','S','~','~','~'],
  ['F','F','F','G','G','G','G','G','W','W','W','W','~','~','~','~'],
  ['F','F','G','G','G','G','G','G','W','W','W','~','~','~','~','~'],
  ['G','G','G','G','G','G','G','G','W','W','W','~','~','~','~','~'],
  ['G','G','G','G','G','G','G','G','G','W','W','~','~','~','~','~'],
  ['D','G','G','G','G','G','G','G','G','G','M','M','~','~','~','~'],
  ['D','D','G','G','G','G','G','G','G','M','M','M','~','~','~','~'],
  ['D','D','D','G','G','G','G','V','G','G','M','M','~','~','~','~'],
  ['D','D','D','G','G','G','G','G','G','M','M','M','~','~','~','~'],
  ['D','D','D','D','G','G','G','M','M','M','M','~','~','~','~','~'],
  ['~','D','D','~','G','G','G','M','M','~','~','~','~','~','~','~'],
  ['~','~','~','~','~','G','G','~','~','~','~','~','~','~','~','~'],
  ['~','~','~','~','~','~','~','~','~','~','~','~','~','~','~','~'],
];

const OUTER = new Set(['^', '~']);
const SPECIAL = new Set(['T', 'K', 'V']); // 特殊ゾーン(温存)
const DEEP = 4; // 陸(非外周)からのマンハッタン距離 >= DEEP の海 = 深洋 O

// ── 集計 ──
function tally(grid) {
  const c = {};
  for (const row of grid) for (const z of row) c[z] = (c[z] || 0) + 1;
  return c;
}

// ── 各セルから最寄りの「主題陸地」(外周でも特殊でもない)への距離とラベル ──
// BFS multi-source from all land cells.
function nearestLand(grid) {
  const dist = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(Infinity));
  const label = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null));
  const q = [];
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const z = grid[y][x];
    if (!OUTER.has(z) && !SPECIAL.has(z)) {
      dist[y][x] = 0; label[y][x] = z; q.push([x, y]);
    }
  }
  // 4近傍 BFS。tie-break は「先に到達した source」=BFS順(安定)。
  let head = 0;
  while (head < q.length) {
    const [x, y] = q[head++];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x+dx, ny = y+dy;
      if (nx<0||nx>=GRID_W||ny<0||ny>=GRID_H) continue;
      if (dist[ny][nx] > dist[y][x]+1) {
        dist[ny][nx] = dist[y][x]+1;
        label[ny][nx] = label[y][x];
        q.push([nx, ny]);
      }
    }
  }
  return { dist, label };
}

const { dist, label } = nearestLand(ZONE);

// ── 叩き台生成 ──
// 外周セル → nearest-land ラベルへ編入（ただし深洋 O は残す）。特殊は温存。
const draft = ZONE.map(r => r.slice());
const reassign = []; // ログ
for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
  const z = ZONE[y][x];
  if (SPECIAL.has(z)) continue;
  if (!OUTER.has(z)) continue;
  if (z === '~' && dist[y][x] >= DEEP) {
    draft[y][x] = 'O'; // 深洋(新地域)
    reassign.push([x, y, z, 'O', dist[y][x]]);
  } else {
    draft[y][x] = label[y][x];
    reassign.push([x, y, z, label[y][x], dist[y][x]]);
  }
}

// ── 出力 ──
const pad = s => String(s).padEnd(3);
console.log('=== 現行 ZONE_MAP 集計 ===');
console.log(tally(ZONE));
console.log('\n=== 叩き台 ZONE_MAP（外周編入＋深洋O・M分割は未反映） ===');
for (const row of draft) console.log(row.map(pad).join(''));
console.log('\n=== 叩き台 集計 ===');
console.log(tally(draft));

console.log('\n=== 深洋 O（陸から d>=' + DEEP + '）の座標 ===');
const deepCells = reassign.filter(r => r[3] === 'O').map(r => `(${r[0]},${r[1]})`);
console.log(deepCells.length + '画面: ' + deepCells.join(' '));

console.log('\n=== 外周編入の内訳（label別） ===');
const byLabel = {};
for (const [x,y,from,to,d] of reassign) {
  if (to === 'O') continue;
  byLabel[to] = byLabel[to] || [];
  byLabel[to].push(`(${x},${y})`);
}
for (const [lab, cells] of Object.entries(byLabel).sort((a,b)=>b[1].length-a[1].length)) {
  console.log(`  ${lab}: +${cells.length}  ${cells.join(' ')}`);
}

// ── M(44) を 山地M / 沼P に2分割 ──
// ユーザー確定: ラベルは分布とストーリー/スキンの割当のみ（ゲーム機構の制約なし）。
//   境界はギザギザでよい。方針=沼P を D8入口(10,14)/cave_1(9,15) を核に BFS で ~半分育て、
//   残り北側を山地M に。均等(各~22)と「入口=沼側」を両立させる。
const mCells = [];
for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
  if (draft[y][x] === 'M') mCells.push([x, y]);
}
const total = mCells.length;
const inM = new Set(mCells.map(([x, y]) => `${x},${y}`));
// ユーザー確定: 一塊優先（両領域が連結）＋できるだけ均等。
// 方針=山地(北)と沼(南)を両フロントから交互に1マスずつ育て中央でぶつける。
//   → 両領域とも連結を保証しつつ ~22:22 に着地。境界はギザギザ許容。
const mtnSeed = mCells.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0])[0]; // 最北
const swampSeeds = [[10, 14], [9, 15]].filter(([x, y]) => inM.has(`${x},${y}`));
const owner = {}; // key -> 'M' | 'P'
const qM = [`${mtnSeed[0]},${mtnSeed[1]}`];
const qP = swampSeeds.map(([x, y]) => `${x},${y}`);
owner[qM[0]] = 'M';
for (const k of qP) owner[k] = 'P';
let hM = 0, hP = 0;
const grow = (q, hRef, tag) => {
  // 1マス分だけ拡張（未所有の隣接を1つ確保）。確保できたら true。
  while (hRef.h < q.length) {
    const [x, y] = q[hRef.h].split(',').map(Number);
    for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const k = `${x+dx},${y+dy}`;
      if (inM.has(k) && owner[k] === undefined) {
        owner[k] = tag; q.push(k); return true;
      }
    }
    hRef.h++;
  }
  return false;
};
const refM = { h: hM }, refP = { h: hP };
// 交互拡張。数を均等にするため、少ない側を優先。
let cntM = 1, cntP = qP.length;
let liveM = true, liveP = true;
while ((liveM || liveP) && (cntM + cntP) < total) {
  if (cntP <= cntM && liveP) { liveP = grow(qP, refP, 'P'); if (liveP) cntP++; }
  else if (liveM) { liveM = grow(qM, refM, 'M'); if (liveM) cntM++; }
  else if (liveP) { liveP = grow(qP, refP, 'P'); if (liveP) cntP++; }
}
const split = { M: [], P: [] };
for (const [x, y] of mCells) {
  const k = `${x},${y}`;
  const tag = owner[k] || 'M'; // 取り残しは山地へ（起きない想定）
  split[tag].push([x, y]);
  draft[y][x] = tag;
}
console.log(`\n=== M(${total}) → 山地M / 沼P 2分割（沼=D8/cave_1核にBFS育成・境界ギザギザ可） ===`);
console.log(`  山地M: ${split.M.length}画面 (北の高地)  ${split.M.map(([x,y])=>`(${x},${y})`).join(' ')}`);
console.log(`  沼 P : ${split.P.length}画面 (南・D8入口10,14/cave_1 9,15を含む)  ${split.P.map(([x,y])=>`(${x},${y})`).join(' ')}`);
console.log('\n=== 最終叩き台 ZONE_MAP（M分割反映後） ===');
for (const row of draft) console.log(row.map(pad).join(''));
console.log('\n=== 最終集計 ===');
console.log(tally(draft));
