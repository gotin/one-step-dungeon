#!/usr/bin/env node
/**
 * migrate-field-forest.mjs  (Phase 9-6 設計⑤ — 1地域を理想形で試作)
 *
 * The prototype region for 9-6. Rebuilds the 26 "plain" forest (F-zone) screens
 * in the NW into the region's ideal form so we can MEASURE the density basis
 * (P1:P2:P3:P4 配分・1画面あたり要素数) that ⑥ Sonnet will mass-produce against,
 * and prove the §4 templates actually clear all four §7 invariants at region
 * scale (seam0 / no orphan / ≥2軸 / no dup layout).
 *
 * The D6 gateway screen (2,4, mapEnters→dungeon_6) is DELIBERATELY left as-is —
 * it is a carefully-built dungeon entrance (already route+combat) and touching it
 * risks the warp. All other 26 forest screens are rebuilt.
 *
 * ── Connectivity invariant (why this is provably safe — same argument as lake) ─
 * The engine crosses a border by preserving the cross-axis coordinate: you must
 * land on a WALKABLE cell at the opposite edge (game.js checkStageTransition,
 * mirrored in scripts/lib/connectivity.mjs). EVERY forest screen's border
 * openings today are exactly top/bottom @ cols 5,6 and left/right @ rows 4,5.
 * The rebuild keeps EXACTLY those cells walkable via a floor "cross" backbone
 * (cols 5,6 + rows 4,5); the backbone alone connects all four openings, so no
 * screen can be orphaned and no seam can open. All content lives strictly in the
 * four quadrant interiors (never on a border row0/9 or col0/11), on STRAIGHT
 * vertical spurs branching off the horizontal backbone — it only ADDS reachable
 * cells. Each screen is BFS-asserted (all 4 openings reachable, all combat/chest
 * features reachable) and dup-asserted before write.
 *
 * ── The 2nd axis every screen earns (screenAxes rules, field-quality.mjs) ──────
 * route is ~free in a forest (3+ open edges + internal trees). Each screen adds
 * one more concrete axis so it clears the ≥2軸 invariant:
 *   P1 分岐路    → obstacle : a genuine land–'x'pit–land ladder-crossing (both
 *                  banks land) with a reward beyond = the D5→D6 come-back motive.
 *   P2 秘密      → secret   : 'u' cuttable bush / '*' pushable stone.
 *   P3 狩り場    → combat   : elite 'F' sentry, or enemies + killAll-sealed 'B'.
 *   P4 ランドマーク→ landmark : 'o' stone-floor forest shrine (ruins) + 'i' sign.
 *   PREVIEW      → secret   : 'H' torches + torchesLit-sealed 'B' (かがり火 preview).
 *     ⚠️ 4-4 originally slotted the 爆弾壁 preview into the forest; that is a
 *     TOOL-TIMING BUG — bomb is D6's OWN reward, so you can't open a bomb-wall
 *     before clearing D6. The forest's correct preview is かがり火 (candle owned
 *     since D4; previews D6's internal torch gimmick). See DECISIONS 2026-07-06.
 *
 * bgTiles (forest 'g') untouched. Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const ROWS = 10, COLS = 12;
const T = 't';   // tree (wall)
const F = '.';   // floor (empty)

// ── base: floor cross backbone through an all-tree screen ─────────────────────
// cols 5,6 vertical + rows 4,5 horizontal. Connects all four border openings.
function baseGrid() {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(T));
  for (let r = 0; r < ROWS; r++) { g[r][5] = F; g[r][6] = F; }
  for (let c = 0; c < COLS; c++) { g[4][c] = F; g[5][c] = F; }
  return g;
}

// Straight vertical spurs off the horizontal backbone (rows 4,5 are already floor).
// Each quadrant spur is a column of 3 interior cells reaching toward a corner.
// The cell adjacent to the backbone is index 0; the far (feature) cell is index 2.
const SPUR = {
  NW: { col: 2, rows: [3, 2, 1] },   // up from [4,2]
  NE: { col: 9, rows: [3, 2, 1] },   // up from [4,9]
  SW: { col: 2, rows: [6, 7, 8] },   // down from [5,2]
  SE: { col: 9, rows: [6, 7, 8] },   // down from [5,9]
};

// ── per-screen specs (26 screens; 2,4 D6-gateway excluded) ────────────────────
// Feature is placed at a spur cell; distinctness comes from quadrant subset +
// feature char + which cell. The script dup-asserts, so any accidental collision
// throws at build time.
const S = (pattern, spurs, feat = [], data = null) => ({ pattern, spurs, feat, data });

const SCREENS = {
  // ── P4 landmarks (forest shrines / ruins: 'o' stone floor + 'i' sign) ──
  '2,1': S('P4', ['NW', 'SE'],
    [['NW', 2, 'o'], ['NW', 1, 'o'], ['SE', 2, 'i'], ['SE', 1, 'u']],
    { sign: { pos: 'SE:2', name: '森の祠', lines: ['朽ちた祠が苔むしている。', '古き森の民が祈りを捧げた場所だという。'] } }),
  '3,5': S('P4', ['SW', 'NE'],
    [['SW', 2, 'o'], ['SW', 1, 'o'], ['NE', 2, 'i'], ['NE', 1, 'u']],
    { sign: { pos: 'NE:2', name: '苔むした石碑', lines: ['「木々の声を聴く者に、森は道を開く」', '文字はそこで途切れている。'] } }),
  '2,8': S('P4', ['NW', 'SE', 'NE'],
    [['NW', 2, 'o'], ['NW', 1, 'o'], ['SE', 2, 'o'], ['NE', 2, 'i']],
    { sign: { pos: 'NE:2', name: '森の奥の遺構', lines: ['崩れた石畳が円を描いている。', 'かつてここに聖樹の社があったのかもしれない。'] } }),

  // ── P3 hunting grounds / gates (combat axis) ──
  '2,3': S('P3', ['NE', 'SW'],
    [['NE', 2, 'B'], ['SW', 1, 'E'], ['SW', 2, 'F']],
    { chest: { pos: 'NE:2', content: { type: 'rupee', value: 20, name: '隠しルピー×20' } },
      show: { pos: 'NE:2', cond: { trigger: 'killAll', message: '🌲 敵を退けると茂みの奥に宝箱が現れた！' } } }),
  '1,5': S('P3', ['SW', 'NE'],
    [['SW', 2, 'B'], ['NE', 1, 'C'], ['NE', 2, 'F']],
    { chest: { pos: 'SW:2', content: { type: 'item', item: 'healPotion', name: '回復薬（小）' } },
      show: { pos: 'SW:2', cond: { trigger: 'killAll', message: '🌲 森の主を倒すと隠し宝が現れた！' } } }),
  '1,7': S('P3', ['NW', 'SE'], [['NW', 2, 'F'], ['SE', 2, 'E'], ['SE', 1, 'E']]),  // elite = combat

  // ── P2 secrets (secret axis: bush / stone) ──
  '2,2': S('P2', ['NW', 'SE'], [['NW', 2, 'u'], ['NW', 1, 'u'], ['SE', 2, '*']]),
  '0,3': S('P2', ['SE'], [['SE', 2, 'u'], ['SE', 1, 'u']]),
  '0,4': S('P2', ['NE'], [['NE', 2, '*'], ['NE', 1, 'u']]),
  '0,6': S('P2', ['SW'], [['SW', 2, '*'], ['SW', 1, 'u']]),
  '0,7': S('P2', ['NW'], [['NW', 2, '*'], ['NW', 1, 'u']]),
  '1,8': S('P2', ['SE', 'NW'], [['SE', 2, 'u'], ['NW', 2, '*']]),

  // ── かがり火 PREVIEW (special P2, adjacent to D6 gateway 2,4) ──
  // NE spur [3,9][2,9][1,9] floor; two torches FLANK the reachable [3,9] cell so
  // both are lightable, chest sits at the far reachable end [1,9].
  '1,4': S('PREVIEW', ['NE', 'SW'],
    [[3, 8, 'H'], [3, 10, 'H'], [1, 9, 'B'], ['SW', 2, 'i']],
    { chest: { pos: '1,9', content: { type: 'rupee', value: 30, name: 'ルピー×30' } },
      show: { pos: '1,9', cond: { trigger: 'torchesLit', message: '🔥 かがり火が全て灯り、宝箱が現れた！' } },
      sign: { pos: 'SW:2', name: '古びた立て札', lines: ['「炎を絶やすな」', 'かがり火にロウソクの火を移せば、森が応えるという。'] } }),

  // ── P1 branch / crossing (obstacle axis: land–'x'pit–land ladder-crossing) ──
  // Pit sits at spur idx1 with FLOOR far bank at idx2 (a genuine b1 crossing you
  // reach with the ladder). A cuttable bush 'u' on a DIFFERENT quadrant's spur
  // far-cell adds decoration + a secret-axis bonus and keeps every screen distinct.
  '1,2': S('P1', ['NW', 'SE'], [['NW', 1, 'x'], ['SE', 2, 'u']]),
  '3,2': S('P1', ['NE', 'SW'], [['NE', 1, 'x'], ['SW', 2, 'u']]),
  '1,3': S('P1', ['SW', 'NE'], [['SW', 1, 'x'], ['NE', 2, 'u']]),
  '3,3': S('P1', ['SE', 'NW'], [['SE', 1, 'x'], ['NW', 2, 'u']]),
  '3,4': S('P1', ['NW', 'SW', 'NE'],   // HUB crossroads: two crossings + signpost
    [['NW', 1, 'x'], ['SW', 1, 'x'], ['NE', 2, 'i']],
    { sign: { pos: 'NE:2', name: '森の道標', lines: ['西へ行けば 森の聖域。', '穴はハシゴがあれば渡れる。'] } }),
  '0,5': S('P1', ['NE', 'SW'], [['NE', 1, 'x'], ['SW', 1, 'x']]),   // twin crossings
  '2,5': S('P1', ['SW', 'SE'], [['SW', 1, 'x'], ['SE', 2, 'u']]),
  '1,6': S('P1', ['NW', 'SE'], [['NW', 1, 'x'], ['SE', 1, 'x']]),   // twin crossings
  '2,6': S('P1', ['NE', 'NW'], [['NE', 1, 'x'], ['NW', 2, 'u']]),
  '2,7': S('P1', ['SE', 'NW', 'SW'], [['SE', 1, 'x'], ['NW', 2, 'u'], ['SW', 2, '*']]),
  '0,8': S('P1', ['SW', 'NE', 'SE'], [['SW', 1, 'x'], ['NE', 1, 'x'], ['SE', 2, 'u']]),
  '0,9': S('P1', ['NW', 'NE'], [['NW', 1, 'x'], ['NE', 2, 'u']]),
  '1,9': S('P1', ['SE', 'SW', 'NE'], [['SE', 1, 'x'], ['SW', 2, 'u'], ['NE', 2, 'u']]),
};

// ── builders ──────────────────────────────────────────────────────────────────
function spurCell(quad, idx) {
  const s = SPUR[quad];
  return [s.rows[idx], s.col];
}

// A feat entry is either quad-relative ['NE',idx,ch] or raw [row,col,ch].
function featCell([a, b]) {
  return typeof a === 'string' ? spurCell(a, b) : [a, b];
}

function carveSpur(g, quad) {
  const s = SPUR[quad];
  for (const r of s.rows) g[r][s.col] = F;
}

function placeFeat(g, feat) {
  for (const entry of feat) {
    const [r, c] = featCell(entry);
    const ch = entry[2];
    if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1)
      throw new Error(`feature touches border @ ${r},${c}`);
    g[r][c] = ch;
  }
}

// ── verification ────────────────────────────────────────────────────────────
const OPENINGS = [[0, 5], [0, 6], [ROWS - 1, 5], [ROWS - 1, 6], [4, 0], [5, 0], [4, COLS - 1], [5, COLS - 1]];

function assertBorderOpenings(g, key) {
  for (const [r, c] of OPENINGS)
    if (isHardBlocked(g[r][c]))
      throw new Error(`border opening broken on ${key} @ ${r},${c} (=${g[r][c]})`);
}

/** BFS the walkable cells; pit 'x' / trees / signs / torches block the walk. */
function walkReach(g, sr, sc) {
  const seen = new Set([`${sr},${sc}`]);
  const q = [[sr, sc]];
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const k = `${nr},${nc}`;
      if (seen.has(k) || isHardBlocked(g[nr][nc])) continue;
      seen.add(k); q.push([nr, nc]);
    }
  }
  return seen;
}

/** A pit 'x' is a valid ladder crossing only if two opposite banks are walkable land. */
function isLadderCrossable(g, r, c) {
  const land = (rr, cc) => {
    const ch = g[rr]?.[cc];
    return ch !== undefined && !isHardBlocked(ch) && ch !== 'x';
  };
  return (land(r - 1, c) && land(r + 1, c)) || (land(r, c - 1) && land(r, c + 1));
}

function assertScreen(g, key, feat) {
  const reach = walkReach(g, 4, 5);
  for (const [r, c] of OPENINGS)
    if (!reach.has(`${r},${c}`))
      throw new Error(`opening ${r},${c} unreachable inside ${key} (would orphan neighbor)`);
  for (const entry of feat) {
    const [r, c] = featCell(entry);
    const ch = entry[2];
    // combat/chest content must be reachable on foot (else dead content).
    if ('ECFB'.includes(ch) && !reach.has(`${r},${c}`))
      throw new Error(`feature '${ch}' @ ${r},${c} unreachable inside ${key}`);
    // every pit must be a genuine ladder crossing (both banks land) — real b1.
    if (ch === 'x' && !isLadderCrossable(g, r, c))
      throw new Error(`pit @ ${r},${c} on ${key} is not a valid ladder crossing (dead hazard)`);
  }
}

// Resolve a "NE:2"-style (quad:idx) or raw "r,c" data position to an "r,c" key.
function resolvePos(pos) {
  if (pos.includes(':')) {
    const [quad, idx] = pos.split(':');
    const [r, c] = spurCell(quad, Number(idx));
    return `${r},${c}`;
  }
  return pos;
}

// ── apply ─────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

const seenLayouts = new Map();
let touched = 0;

for (const [key, spec] of Object.entries(SCREENS)) {
  const stage = field[key];
  if (!stage) throw new Error(`missing forest stage ${key}`);
  if (stage.rows !== ROWS || stage.cols !== COLS)
    throw new Error(`unexpected size on ${key}: ${stage.rows}x${stage.cols}`);

  const g = baseGrid();
  for (const quad of spec.spurs) carveSpur(g, quad);
  placeFeat(g, spec.feat);

  assertBorderOpenings(g, key);
  assertScreen(g, key, spec.feat);

  const hash = g.map((row) => row.join('')).join('|');
  if (seenLayouts.has(hash))
    throw new Error(`duplicate layout: ${key} == ${seenLayouts.get(hash)}`);
  seenLayouts.set(hash, key);

  stage.tiles = g.map((row) => row.slice());   // array-of-char-arrays (engine format)

  if (spec.data?.chest) {
    stage.chestContents = stage.chestContents || {};
    stage.chestContents[resolvePos(spec.data.chest.pos)] = spec.data.chest.content;
  }
  if (spec.data?.show) {
    stage.showConditions = stage.showConditions || {};
    stage.showConditions[resolvePos(spec.data.show.pos)] = spec.data.show.cond;
  }
  if (spec.data?.sign) {
    const sp = resolvePos(spec.data.sign.pos);
    const [sr, sc] = sp.split(',').map(Number);
    // A sign body only shows if it sits on an actual 'i' tile (else it's orphaned
    // data — and an 'i' tile with no body renders "（何も書かれていない）").
    if (stage.tiles[sr][sc] !== 'i')
      throw new Error(`sign on ${key} @ ${sp} is not on an 'i' tile (=${stage.tiles[sr][sc]})`);
    stage.signData = stage.signData || {};
    stage.signData[sp] = { name: spec.data.sign.name, lines: spec.data.sign.lines };
  }
  touched++;
}

// ── guard: no rebuilt screen may leave an 'i' sign tile without a body ────────
// (an 'i' with no signData/npcData renders "（何も書かれていない）" — the exact
//  bug this migration originally shipped; fail loudly if it recurs.)
for (const key of Object.keys(SCREENS)) {
  const stage = field[key];
  for (let r = 0; r < stage.rows; r++) {
    for (let c = 0; c < stage.cols; c++) {
      if (stage.tiles[r][c] !== 'i') continue;
      const pk = `${r},${c}`;
      if (!stage.signData?.[pk] && !stage.npcData?.[pk])
        throw new Error(`empty sign on ${key} @ ${pk} (no signData/npcData body)`);
    }
  }
}

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── report the density basis (⑤ deliverable) ─────────────────────────────────
const byPat = {};
for (const spec of Object.values(SCREENS)) byPat[spec.pattern] = (byPat[spec.pattern] || 0) + 1;
console.log(`9-6 設計⑤ forest prototype: ${touched} screens rebuilt (2,4 D6-gateway preserved).`);
console.log('pattern 配分:', JSON.stringify(byPat));
