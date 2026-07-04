#!/usr/bin/env node
/**
 * migrate-field-lake.mjs  (Phase 9-4 — lake region rework)
 *
 * The lake (W) region east of the village was 12 screens collapsed into just 2
 * near-identical stamped patterns: a plain grass plus-cross (cols 5,6 + rows 4,5)
 * punched straight through open water, with a few unreachable single-cell grass
 * dots floating in the lake. Bridges ('v') were 0 across the entire 320-screen
 * map, even though the field design (PLAN 9-4 (B)) calls for lakes to be crossed
 * by bridges with island landings.
 *
 * This rebuilds all 12 lake screens as a *central grass island + four wooden
 * bridge arms* reaching each shore, over an open-water lake, and gives every
 * screen a distinct set of small reachable islets (grass + a short bridge spur)
 * in its quadrants so no two screens read the same.
 *
 * ── Connectivity invariant (why this is provably safe) ──────────────────────
 * The game's edge-scroll (game.js checkStageTransition, mirrored in
 * scripts/lib/connectivity.mjs) crosses a border by preserving the cross-axis
 * coordinate: you must land on a *walkable* cell at the opposite edge. Every
 * lake screen's border openings today are exactly row0/row9 @ cols 5,6 and
 * col0/col11 @ rows 4,5. The new base keeps EXACTLY those cells walkable
 * (bridge 'v' is passable — not in connectivity's BLOCKED set, and passable:true
 * in tiles.js). Decorative islets live strictly in the interior (never on a
 * border row/col) and each branches off an already-walkable bridge arm, so they
 * only ADD reachable cells — they can never change any border transition.
 * check-field-connectivity.mjs must stay identical (verified after run).
 *
 * Purely a `tiles`-layer rewrite; bgTiles (all 'g' grass here) are untouched —
 * water '~' renders over bgTile regardless, and bridges/grass sit on grass.
 *
 * Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

// The 12 lake (W-zone) screens, in a stable order so decorations are deterministic.
const LAKE_KEYS = [
  '9,7', '10,7',
  '8,8', '9,8', '10,8', '11,8',
  '10,9',
  '8,10', '9,10', '10,10',
  '9,11', '10,11',
];

const ROWS = 10, COLS = 12;
const W = '~';   // water
const V = 'v';   // wooden bridge (passable, renders bridge sprite)
const I = '.';   // island floor (renders as the grass bgTile beneath)
const G = 'g';   // grass islet tile (walkable, animated grass sprite)

// ── base: central 2×2 island + four 2-wide bridge arms to each shore ──────────
// Keeps row0/row9 @ cols 5,6 and col0/col11 @ rows 4,5 walkable (border openings).
function baseGrid() {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(W));
  // vertical arms (cols 5,6) — up: rows 0-3, down: rows 6-9
  for (let r = 0; r < ROWS; r++) { g[r][5] = V; g[r][6] = V; }
  // horizontal arms (rows 4,5) — left: cols 0-4, right: cols 7-11
  for (let c = 0; c < COLS; c++) { g[4][c] = V; g[5][c] = V; }
  // central island where the arms meet (rows 4,5 × cols 5,6)
  g[4][5] = I; g[4][6] = I; g[5][5] = I; g[5][6] = I;
  return g;
}

// Per-screen decorations: reachable islets in the water quadrants. Each entry is
// [row, col, char]. Every islet branches off a bridge arm via a spur ('v'); none
// touches a border row (0/9) or column (0/11), so border openings stay identical.
// Twelve distinct sets so no two lake screens read the same.
const DECOS = [
  // 0 — NE islet
  [[3, 8, V], [2, 8, G], [2, 9, G]],
  // 1 — SW islet
  [[6, 3, V], [7, 3, G], [7, 2, G]],
  // 2 — NW islet
  [[2, 4, V], [2, 3, G], [1, 3, G]],
  // 3 — SE islet
  [[7, 7, V], [7, 8, G], [8, 8, G]],
  // 4 — NE + SW dots
  [[3, 9, V], [2, 9, G], [6, 2, V], [7, 2, G]],
  // 5 — NW + SE dots
  [[3, 4, V], [2, 4, G], [6, 7, V], [7, 7, G]],
  // 6 — larger NE island
  [[3, 8, V], [2, 8, G], [2, 9, G], [1, 8, G]],
  // 7 — larger SW island
  [[6, 3, V], [7, 3, G], [7, 2, G], [8, 3, G]],
  // 8 — NW cluster
  [[2, 4, V], [2, 3, G], [1, 3, G], [1, 4, G]],
  // 9 — SE cluster
  [[7, 7, V], [7, 8, G], [8, 8, G], [8, 7, G]],
  // 10 — NE + SW pair
  [[3, 9, V], [2, 9, G], [2, 8, G], [6, 2, V], [7, 2, G]],
  // 11 — NW + SE pair
  [[3, 3, V], [2, 3, G], [2, 2, G], [6, 8, V], [7, 8, G]],
];

// ── sanity guards ─────────────────────────────────────────────────────────────
function assertBorderOpenings(g, key) {
  const open = (r, c) => g[r][c] === V || g[r][c] === I || g[r][c] === G;
  const ok =
    open(0, 5) && open(0, 6) &&              // top
    open(ROWS - 1, 5) && open(ROWS - 1, 6) && // bottom
    open(4, 0) && open(5, 0) &&              // left
    open(4, COLS - 1) && open(5, COLS - 1);  // right
  if (!ok) throw new Error(`border opening broken on ${key}`);
}

function assertDecoInterior(deco, key) {
  for (const [r, c] of deco) {
    if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1)
      throw new Error(`deco touches border on ${key} @ ${r},${c}`);
  }
}

// ── apply ─────────────────────────────────────────────────────────────────────
let touched = 0;
LAKE_KEYS.forEach((key, i) => {
  const stage = field[key];
  if (!stage) throw new Error(`missing lake stage ${key}`);
  if (stage.rows !== ROWS || stage.cols !== COLS)
    throw new Error(`unexpected size on ${key}: ${stage.rows}x${stage.cols}`);

  const g = baseGrid();
  const deco = DECOS[i % DECOS.length];
  assertDecoInterior(deco, key);
  for (const [r, c, ch] of deco) g[r][c] = ch;
  assertBorderOpenings(g, key);

  stage.tiles = g.map(row => row.slice());  // array-of-char-arrays (engine format)
  touched++;
});

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
console.log(
  `9-4 lake rework complete: ${touched} lake screens rebuilt as central island + ` +
  `four bridge arms with per-screen islets (first bridges 'v' on the field map).`
);
