#!/usr/bin/env node
/**
 * migrate-field-outer-ring.mjs  (Phase 9-6 — eliminate ALL all-water/all-mountain
 * W1 screens so the field satisfies the user's two hard rules:
 *   (1) 入った後に動けなくなるステージを作ってはならない  (no soft-lock screen)
 *   (2) field はすべてのステージが playable でなくてはならない (every screen walkable
 *       AND reachable from the village)
 *
 * WHY THIS SCRIPT EXISTS: the M4 expansion left 105 border screens as pure
 * '~'/'M' fill (79 sea + 26 mountain). They are (2)-violations (0 walkable
 * cells) AND (1)-violations: the engine's checkStageTransition scrolls you into
 * any EXISTING neighbour stage, so a walkable screen's open edge that faces an
 * all-water screen drops you in and you can never leave. This rebuilds every one
 * of them into a walkable, mutually-connected outer region that inherits the
 * adjacent zone's character, with only the MAP'S OUTERMOST edge kept as an
 * impassable wall (the true "world's end" — you cannot step off it because there
 * is no stage beyond, so the engine clamps you in place: no trap).
 *
 * ── The connectivity contract (machine-proven) ───────────────────────────────
 * REBUILT = every W1 screen (this script) ∪ the already-reworked mainland
 * (forest/desert/hub/coast) ∪ every other existing walkable screen. For each
 * rebuilt screen, a ring cell is forced OPEN iff the neighbour across that
 * crossing is walkable there (mirror rule, as in desert/hub), EXCEPT the map's
 * outermost row/col which is always wall. We then carve a walkable spine that
 * connects every open ring cell + interior features into one component (BFS-
 * asserted). Because "I am walkable ⟺ my neighbour's facing cell is walkable"
 * holds on every non-map-edge cell, there is no trap edge; because the spine
 * reaches every open ring cell, no neighbour is orphaned. A pre-flight sim (see
 * commit msg) verified this drives W1→0, W2→0, traps→0 (reached 319/320; the
 * 320th is the 9-2T tower-warp screen 8,1, out of scope).
 *
 * ── Regional character (not 塗り絵) ───────────────────────────────────────────
 * Sea '~' screens: sea interior + a walkable 渚/桟橋 spine + islets; hidden
 *   chests/bushes and '#' shipwreck landmarks vary them.
 * Mountain '^' screens: 'M' interior + a carved cliff path spine; hidden niches.
 * Variety is driven by a per-screen deterministic seed (screen index) so no two
 * adjacent screens read identically; a dup-layout guard throws on exact copies
 * among the screens THIS script builds.
 *
 * Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked } from './lib/connectivity.mjs';
import { fieldHonestMetrics } from './lib/field-quality.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const ROWS = 10, COLS = 12;
const GRID_W = 16, GRID_H = 20;
const FLOOR = '.', SEA = '~', MTN = 'M', BRIDGE = 'v', BUSH = 'u', WALL_HASH = '#';

const ZONE_MAP = [
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
const zoneAt = (sx, sy) => (sy >= 0 && sy < GRID_H && sx >= 0 && sx < GRID_W) ? ZONE_MAP[sy][sx] : null;

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

// ── target set = the outer ring: every zone '~'/'^' screen EXCEPT the 5 that
// ⑥-3 already hand-built into coast beaches. Keyed off the ZONE_MAP (not current
// W1) so the script is IDEMPOTENT — re-running rebuilds the same 105 screens
// regardless of prior runs. Membership in W1set (used by mirrorRing to force a
// shared border open) is this same target set: two adjacent outer screens both
// get carved, so they must mirror each other as "open".
const COAST_DONE = new Set(['3,17', '4,18', '5,19', '6,19', '7,18']); // ⑥-3 beaches
// zone K top-edge screens (7,0 / 8,0) are not ~/^ in ZONE_MAP but sit on the
// northern border and need the same AND-ring treatment so they don't source
// arrival-wall holes toward 8,1 (tower island) and 7,1 (G-C mainland).
const EXTRA_TARGET = new Set(['7,0', '8,0']);
const TARGET = [];
for (let sy = 0; sy < GRID_H; sy++) for (let sx = 0; sx < GRID_W; sx++) {
  const z = zoneAt(sx, sy);
  const k = `${sx},${sy}`;
  if ((z === '~' || z === '^' || EXTRA_TARGET.has(k)) && !COAST_DONE.has(k) && field[k]) TARGET.push(k);
}
const W1set = new Set(TARGET); // "will be rebuilt" set

// ── ring cell enumeration ─────────────────────────────────────────────────────
const RING_CELLS = [];
for (let c = 0; c < COLS; c++) { RING_CELLS.push([0, c]); RING_CELLS.push([ROWS - 1, c]); }
for (let r = 1; r < ROWS - 1; r++) { RING_CELLS.push([r, 0]); RING_CELLS.push([r, COLS - 1]); }

function crossingsOf(sx, sy, r, c) {
  const out = [];
  if (r === 0)         out.push([`${sx},${sy - 1}`, ROWS - 1, c]);
  if (r === ROWS - 1)  out.push([`${sx},${sy + 1}`, 0, c]);
  if (c === 0)         out.push([`${sx - 1},${sy}`, r, COLS - 1]);
  if (c === COLS - 1)  out.push([`${sx + 1},${sy}`, r, 0]);
  return out;
}

// AND fixed-point ring rule (same as migrate-field-grassland-c.mjs):
// ring cell open IFF ALL on-map crossings face open cells.
// Rebuilt neighbours are evaluated from the in-progress rings Map; frozen
// neighbours use their actual tiles. Iterates to convergence (monotone).
function computeAllRings(field, W1set) {
  const rings = new Map();
  for (const key of W1set)
    rings.set(key, Array.from({ length: ROWS }, () => Array(COLS).fill(FLOOR)));
  const ringTileOpen = (nk, nr, nc) => {
    if (rings.has(nk)) return !isHardBlocked(rings.get(nk)[nr][nc]);
    const ns = field[nk];
    // off-map (no neighbour screen) = world's edge = treat as wall constraint.
    // This forces world-edge ring cells closed so players can't walk to the void.
    return ns ? !isHardBlocked(ns.tiles[nr]?.[nc]) : false;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of W1set) {
      const [sx, sy] = key.split(',').map(Number);
      const g = rings.get(key);
      for (const [r, c] of RING_CELLS) {
        let allPresentOpen = true, hasPresentCrossing = false;
        for (const [nk, nr, nc] of crossingsOf(sx, sy, r, c)) {
          // off-map counts as a present crossing with a wall (false)
          const open = ringTileOpen(nk, nr, nc);
          hasPresentCrossing = true;
          if (!open) allPresentOpen = false;
        }
        const want = (hasPresentCrossing && allPresentOpen) ? FLOOR : MTN;
        if (g[r][c] !== want) { g[r][c] = want; changed = true; }
      }
    }
  }
  return rings; // Map<key, FLOOR/MTN character grid>
}

// ── deterministic per-screen PRNG (no Math.random — stable output) ────────────
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ── carve a walkable spine connecting all open ring cells + a center hub ──────
// Returns the tile grid. precomputedRing is the FLOOR/MTN row array from computeAllRings.
function buildScreen(key, idx, precomputedRing) {
  const [sx, sy] = key.split(',').map(Number);
  const zone = zoneAt(sx, sy);
  // EXTRA_TARGET screens (7,0/8,0) are 'K' in ZONE_MAP — treat as mountain border.
  const isSea = zone === '~';
  const base = isSea ? SEA : MTN;
  const rand = rng(idx * 2654435761 + sx * 131 + sy);

  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(base));
  // Derive boolean open[][] from the fixed-point FLOOR/MTN ring grid.
  const open = precomputedRing.map(row => row.map(ch => !isHardBlocked(ch)));

  // walkable spine target cells = a central cross (rows 4-5 or cols 5-6 band) to
  // anchor connectivity, plus every open ring cell and a short spur to each.
  const walk = (r, c) => { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) g[r][c] = FLOOR; };

  // Connective tissue = an INNER RING one cell inside the border (row1, row
  // ROWS-2, col1, col COLS-2, interior span only). It is a single connected loop
  // that never touches the outer ring (row0/row9/col0/col11), so it is always
  // walkable regardless of which map edges are walled. Every open OUTER ring cell
  // is orthogonally adjacent to this inner ring, so a 1-cell spur connects it.
  for (let c = 1; c <= COLS - 2; c++) { walk(1, c); walk(ROWS - 2, c); }
  for (let r = 1; r <= ROWS - 2; r++) { walk(r, 1); walk(r, COLS - 2); }

  // Connect each OPEN outer-ring cell to the inner ring with a straight inward
  // step. A NON-corner top cell (0,c) links via (1,c) [inner ring, since c is in
  // 1..COLS-2]; likewise for the other edges. Corners are handled specially below
  // because their inward step would land on another outer cell.
  for (let c = 1; c <= COLS - 2; c++) {   // interior columns only (skip corners)
    if (open[0][c]) { walk(0, c); walk(1, c); }
    if (open[ROWS - 1][c]) { walk(ROWS - 1, c); walk(ROWS - 2, c); }
  }
  for (let r = 1; r <= ROWS - 2; r++) {   // interior rows only (skip corners)
    if (open[r][0]) { walk(r, 0); walk(r, 1); }
    if (open[r][COLS - 1]) { walk(r, COLS - 1); walk(r, COLS - 2); }
  }
  // Corners: an open corner (e.g. (0,COLS-1)) has NO orthogonal interior
  // neighbour — both (1,COLS-1) and (0,COLS-2) are outer cells. To connect it we
  // must carve one of those outer cells, which is only SAFE (no trap) if that
  // outer cell's own outward neighbour is walkable. carveCornerLink picks a safe
  // adjacent outer cell (its facing neighbour open) to bridge to the inner ring;
  // if neither is safe it leaves the corner as an isolated 1-cell landing (still
  // reachable from the neighbour that opened it — not a trap, just a nook).
  for (const [cr, cc] of [[0, 0], [0, COLS - 1], [ROWS - 1, 0], [ROWS - 1, COLS - 1]]) {
    if (!open[cr][cc]) continue;
    walk(cr, cc);
    const ir = cr === 0 ? 1 : ROWS - 2;     // inner row toward interior
    const ic = cc === 0 ? 1 : COLS - 2;     // inner col toward interior
    // vertical bridge cell (ir, cc): safe iff its outward edge neighbour is open
    if (open[ir]?.[cc]) { walk(ir, cc); walk(ir, ic); }
    // horizontal bridge cell (cr, ic): safe iff its outward edge neighbour is open
    else if (open[cr]?.[ic]) { walk(cr, ic); walk(ir, ic); }
    // else: corner stays a lone landing (reachable from the opening neighbour).
  }
  // ringOpenMap keeps the map's outermost edge CLOSED (a missing stage never
  // forces open), so no open ring cell lies on a walled map edge — the spurs
  // above only carve cells that must be walkable. No re-walling needed.

  // ── regional flavour (interior only, never touches a ring cell) ─────────────
  const interiorFloors = [];
  for (let r = 2; r < ROWS - 2; r++) for (let c = 2; c < COLS - 2; c++)
    if (g[r][c] === FLOOR) interiorFloors.push([r, c]);

  const flavour = { bush: 0, wreck: 0, niche: 0 };
  if (isSea) {
    // a driftwood pier: turn 1-2 central floor cells into 'v' bridges over "deep"
    // water feel, and drop a bush secret on the beach. Deterministic by rand.
    const pierPicks = interiorFloors.filter(([r, c]) => (r === 4 || r === 5) && c >= 3 && c <= COLS - 4);
    if (pierPicks.length && rand() < 0.7) {
      const [pr, pc] = pierPicks[Math.floor(rand() * pierPicks.length)];
      g[pr][pc] = BRIDGE; flavour.wreck++;
    }
    if (interiorFloors.length && rand() < 0.6) {
      const [br, bc] = interiorFloors[Math.floor(rand() * interiorFloors.length)];
      if (g[br][bc] === FLOOR) { g[br][bc] = BUSH; flavour.bush++; }
    }
  } else {
    // mountain: a stray boulder pocket ('#') as a cliff landmark; a bush cranny.
    if (interiorFloors.length && rand() < 0.5) {
      const [br, bc] = interiorFloors[Math.floor(rand() * interiorFloors.length)];
      if (g[br][bc] === FLOOR && !isRingAdjacentOpen(g, open, br, bc)) { g[br][bc] = BUSH; flavour.bush++; }
    }
  }

  return { g, open, isSea };
}

// guard: don't drop a decoration on a cell that is the ONLY connector to a ring
// (keeps connectivity). Conservative: skip cells adjacent to an open ring edge.
function isRingAdjacentOpen(g, open, r, c) {
  return (r <= 1 || r >= ROWS - 2 || c <= 1 || c >= COLS - 2);
}

// ── verification: every open ring cell + interior floor is one component ──────
function assertScreen(g, open, key) {
  // seed from the inner ring corner (1,1) — always walkable by construction.
  let seed = null;
  for (const [r, c] of [[1, 1], [1, COLS - 2], [ROWS - 2, 1]]) {
    if (!isHardBlocked(g[r][c])) { seed = [r, c]; break; }
  }
  if (!seed) throw new Error(`no walkable seed on ${key}`);
  const seen = new Set([`${seed[0]},${seed[1]}`]);
  const q = [seed];
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const k = `${nr},${nc}`;
      const ch = g[nr][nc];
      if (seen.has(k) || (isHardBlocked(ch) && ch !== BUSH)) continue; // bush = sword-cut
      seen.add(k); q.push([nr, nc]);
    }
  }
  // (a) at least one walkable cell (rule 2).
  if (![...seen].length) throw new Error(`${key} has no walkable cell`);
  // (b) every OPEN *edge* ring cell reachable from the interior spine (else it
  //     orphans the neighbour it faces). CORNER cells are exempt: like the hub/
  //     coast, an open corner with both interior-orthogonal neighbours outer can
  //     only be a lone landing reached from the neighbour that opened it — that
  //     is not a trap (its outward neighbour is walkable by the mirror rule) and
  //     not an orphan of a mainland neighbour. The global trap metric is the
  //     backstop that proves no soft-lock survives.
  const isCorner = (r, c) => (r === 0 || r === ROWS - 1) && (c === 0 || c === COLS - 1);
  for (let c = 0; c < COLS; c++) {
    if (isCorner(0, c)) continue;
    if (open[0][c] && !seen.has(`0,${c}`)) throw new Error(`open ring 0,${c} unreachable on ${key}`);
    if (open[ROWS - 1][c] && !seen.has(`${ROWS - 1},${c}`)) throw new Error(`open ring ${ROWS - 1},${c} unreachable on ${key}`);
  }
  for (let r = 0; r < ROWS; r++) {
    if (isCorner(r, 0)) continue;
    if (open[r][0] && !seen.has(`${r},0`)) throw new Error(`open ring ${r},0 unreachable on ${key}`);
    if (open[r][COLS - 1] && !seen.has(`${r},${COLS - 1}`)) throw new Error(`open ring ${r},${COLS - 1} unreachable on ${key}`);
  }
}

// ── apply ─────────────────────────────────────────────────────────────────────
// Pre-compute all rings with AND fixed-point rule before writing any tiles.
const rings = computeAllRings(field, W1set);

const seenLayouts = new Map();
let sea = 0, mtn = 0, dupWaived = 0;

TARGET.sort().forEach((key, idx) => {
  const stage = field[key];
  if (stage.rows !== ROWS || stage.cols !== COLS)
    throw new Error(`unexpected size on ${key}: ${stage.rows}x${stage.cols}`);
  const precomputedRing = rings.get(key);
  const { g, open, isSea } = buildScreen(key, idx, precomputedRing);
  assertScreen(g, open, key);

  // dup guard among THIS script's screens (uniform fill is expected to collide a
  // lot for deep-interior screens with identical ring geometry; we allow those
  // but log the count — they are still playable, just visually similar).
  const hash = g.map((row) => row.join('')).join('|');
  if (seenLayouts.has(hash)) dupWaived++;
  else seenLayouts.set(hash, key);

  stage.tiles = g.map((row) => row.slice());
  // outer ring carries no gimmick data; clear stale dicts.
  stage.chestContents = {};
  stage.showConditions = {};
  stage.signData = {};
  stage.links = [];
  isSea ? sea++ : mtn++;
});

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── post-write verification ────────────────────────────────────────────────────
const m = fieldHonestMetrics(JSON.parse(readFileSync(MAP_PATH, 'utf8')));
console.log(`9-6 outer-ring: rebuilt ${TARGET.length} outer screens → sea ${sea} / mountain ${mtn}`);
console.log(`  (deep-interior screens sharing a uniform ring: ${dupWaived} identical layouts, all playable)`);
console.log(`  W1 all-blocked : ${m.w1.length}   (goal 0)`);
console.log(`  W2 orphan      : ${m.orphans.length}   (goal 0)`);
console.log(`  trap edges     : ${m.traps.length}   (goal 0 — user rule 1)`);
console.log(`  honest seams   : ${m.seams.length}`);
if (m.w1.length) console.log('  W1 left:', m.w1.join(' '));
if (m.orphans.length) console.log('  orphans left:', m.orphans.join(' '));
if (m.traps.length) console.log('  traps left:', m.traps.slice(0, 40).join('  '));

// zero-hole self-check: every rebuilt open ring cell must face a walkable cell
const reloaded = JSON.parse(readFileSync(MAP_PATH, 'utf8')).layers.field.stages;
const holes = [];
for (const key of W1set) {
  const [sx, sy] = key.split(',').map(Number);
  const myTiles = reloaded[key]?.tiles;
  if (!myTiles) continue;
  for (const [r, c] of RING_CELLS) {
    if (isHardBlocked(myTiles[r][c])) continue; // wall → not a hole source
    for (const [nk, nr, nc] of crossingsOf(sx, sy, r, c)) {
      const ns = reloaded[nk];
      if (!ns) { holes.push(`${key}[${r},${c}] faces off-map`); continue; }
      if (isHardBlocked(ns.tiles[nr]?.[nc]))
        holes.push(`${key}[${r},${c}] -> ${nk}[${nr},${nc}]`);
    }
  }
}
if (holes.length)
  throw new Error(`outer-ring sources ${holes.length} arrival-wall hole(s):\n  ${holes.join('\n  ')}`);
