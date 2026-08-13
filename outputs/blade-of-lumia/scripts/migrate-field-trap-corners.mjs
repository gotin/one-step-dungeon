#!/usr/bin/env node
/**
 * migrate-field-trap-corners.mjs  (Phase 9-6 ⑥-trap — cross-map arrival-wall root-out)
 *
 * The FINAL, cross-map trap-eradication pass promised by ⑥-trap (PLAN.md). After all
 * 8 regions + the outer ring were reworked, `field-invariants` still reported
 * traps = seams = 35 — every one a §11-1 CORNER RESIDUAL: a reached screen has an
 * OPEN corner cell ('.') whose edge-scroll lands on a HARD-BLOCKED corner of a
 * region-boundary neighbour (forest 't' / mountain 'M' / lake '~' / D8 fence 'f').
 * These survive the per-region mirror-AND because a grid CORNER answers to TWO
 * crossings on two different neighbours: at the time a region was reworked, one of
 * those neighbours was still 塗り絵, so the corner could not yet be resolved. Now
 * that every neighbour is finished, the mismatched (open ↔ wall) corner pairs can be
 * closed globally — this is the user's rule stated literally: 「そもそも壁に向かって
 * 辺を開けない」= don't open an edge toward a wall.
 *
 * ── The fix = the global mirror-AND fixed point across every region boundary ─────
 * For each live arrival-wall trap, the SOURCE cell is always a grid CORNER (verified:
 * all 44 source cells are (0,0)/(0,cols-1)/(rows-1,0)/(rows-1,cols-1)). We WALL that
 * open source corner to match the wall it faces — 't'/'M' kept as-is, 'f'/'~' → 'M'
 * (a corner is never a legit water/fence crossing). This is terminal: wall↔wall is
 * trap-free from both directions, so no cascade. A corner is decorative border, never
 * load-bearing — the connectivity BFS confirms reached/orphans are unchanged.
 *
 * EXCEPTION — a trap SOURCED FROM A PRESERVED entrance screen must NOT wall the entrance
 * (we never touch designed content). Only one such case cascades cleanly on the dest
 * side: 2,4 (D6 fire-temple approach) — its wide top corridor (cols4-7 open) is designed,
 * and the neighbour above (2,3) is plain forest. So we MIRROR by opening 2,3's two
 * arrival cells (9,4/9,7) to '.', matching the preserved corridor. (9,15 cave_1's trap
 * corners are empty decoration far from its '>' entrance, so those source corners ARE
 * walled — allowed, they carry no content.)
 *
 * Result (proven in-memory before writing): seams 35→0, traps 35→0, reached 319 (=
 * unchanged, residual 1 = 9-2T tower warp 8,1), W1/W2/dup/under-2-axis all unchanged.
 * This drives the last two 9-6 connectivity invariants to their GOAL of 0.
 *
 * Purely a `tiles`-layer rewrite of empty corner cells + 2 dest-side openings; no
 * bgTiles, no designed feature (mapEnter/sign/chest) is touched. Self-verifying: it
 * recomputes traps and iterates the mirror-AND to a fixed point, then asserts 0.
 * Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { bfsLayer, isHardBlocked } from './lib/connectivity.mjs';
import { fieldHonestMetrics } from './lib/field-quality.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers.field.stages;
const start = {
  stage: data.startPos.stage, row: data.startPos.row, col: data.startPos.col,
};

// Preserved entrance/content screens — NEVER wall these. Only 2,4 needs a dest-side
// fix (its designed D6 approach corridor); the rest never source a corner trap that
// would require editing them.
const OPEN_DEST_SOURCE = new Set(['2,4']); // D6 fire-temple approach — mirror on dest side

/** Recompute the live arrival-wall traps (reached source → hard-blocked arrival). */
function liveTraps() {
  const { reachedRooms, deadEdges } = bfsLayer(stages, start);
  return deadEdges.filter(
    (e) => stages[e.to] && reachedRooms.has(e.from) && e.reason === 'arrival-wall',
  );
}

/** The source edge cell a trap steps OFF from (always a grid corner here). */
function sourceCell(e) {
  const s = stages[e.from];
  const [ar, ac] = e.at.split(',').map(Number);
  if (e.dir === 'right') return [ar, s.cols - 1];
  if (e.dir === 'left') return [ar, 0];
  if (e.dir === 'up') return [0, ac];
  return [s.rows - 1, ac]; // down
}

const walled = new Set();
const opened = new Set();
let round = 0;
for (;;) {
  const traps = liveTraps();
  if (traps.length === 0) break;
  if (++round > 15) throw new Error(`mirror-AND did not converge (round ${round})`);
  for (const e of traps) {
    if (OPEN_DEST_SOURCE.has(e.from)) {
      // Preserved source: mirror by opening the destination arrival cell to floor.
      const [ar, ac] = e.at.split(',').map(Number);
      if (stages[e.to].mapEnters?.[`${ar},${ac}`])
        throw new Error(`refuse to open a mapEnter cell ${e.to}(${ar},${ac})`);
      stages[e.to].tiles[ar][ac] = '.';
      opened.add(`${e.to}(${ar},${ac})`);
    } else {
      // Rebuilt source: wall the open corner to match the wall it faces.
      // A corner can source TWO traps (two crossings); once walled it is already
      // hard-blocked, so skip idempotently (isHardBlocked can't step off).
      const [r, c] = sourceCell(e);
      const cur = stages[e.from].tiles[r][c];
      if (isHardBlocked(cur)) continue; // already walled by the other crossing
      if (cur !== '.')
        throw new Error(`source ${e.from}(${r},${c}) is '${cur}', not an empty corner`);
      if (stages[e.from].mapEnters?.[`${r},${c}`])
        throw new Error(`refuse to wall a mapEnter cell ${e.from}(${r},${c})`);
      const wall = (e.tile === '~' || e.tile === 'f') ? 'M' : e.tile; // t/M stay; ~/f → M
      stages[e.from].tiles[r][c] = wall;
      walled.add(`${e.from}(${r},${c})=${wall}`);
    }
  }
}

// ── guard: the two 9-6 connectivity invariants hit their GOAL of 0 ────────────
const m = fieldHonestMetrics(data);
if (m.traps.length !== 0)
  throw new Error(`traps not eradicated: ${m.traps.length}\n${m.traps.join('\n')}`);
if (m.seams.length !== 0)
  throw new Error(`seams not eradicated: ${m.seams.length}\n${m.seams.join('\n')}`);
if (m.w1.length !== 0 || m.orphans.length !== 0)
  throw new Error(`regressed W1/W2: w1=${m.w1.length} orphans=${m.orphans.length}`);
// reached must NOT drop (walling corners can't disconnect anything walkable).
if (m.reached.size !== 319)
  throw new Error(`reached changed to ${m.reached.size} (expected 319 — a corner was load-bearing?!)`);

const DRY = process.argv.includes('--dry');
if (!DRY) writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

console.log(
  `9-6 ⑥-trap: mirror-AND fixed point in ${round} round(s) — ` +
  `walled ${walled.size} corner(s), opened ${opened.size} dest cell(s)` +
  `${DRY ? ' [DRY — not written]' : ''}`,
);
console.log(`  seams 35→${m.seams.length}  traps 35→${m.traps.length}  ` +
  `reached ${m.reached.size}  W1 ${m.w1.length}  W2 ${m.orphans.length}`);
console.log('  opened:', [...opened].join(' ') || '(none)');
