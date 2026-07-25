#!/usr/bin/env node
/**
 * migrate-water-to-bgtiles.mjs  (Phase 9-6 深洋O — 水の単一ソース化 0.5)
 *
 * Moves every WATER cell from the *tiles* layer to the *bgTiles* underlay:
 *
 *     tiles[r][c] === '~'   →   tiles[r][c] = '.' (FLOOR)  +  bgTiles["r,c"] = '~'
 *
 * WHY. Phase 9-6-④ made water a terrain that can live on the bgTiles layer so that
 * water-move enemies can stand on it (§19-11-D). Water now has TWO homes — tiles '~'
 * (all the existing lakes/seas/moats) and bgTiles '~' (the enemy footing). isWaterAt()
 * in passable.js already reads BOTH (tiles water OR bgTiles water), so the two behave
 * identically in-engine. This migration collapses them to ONE source of truth (bgTiles),
 * so future water work only touches the underlay.
 *
 * WHY IT'S SAFE (connectivity / metrics unchanged):
 *   - passable.js isWaterAt reads both layers → the engine blocks a moved cell exactly
 *     as before (foot travel, flight-over, ladder-bridge, pier all go through isWaterAt).
 *   - connectivity.mjs cellTile() and field-quality.mjs effectiveFlat() fold bgTiles '~'
 *     into '~', so the checker and every quality metric see the moved water identically.
 *   - render-board.js draws bgTiles '~' with the same 'water' class, and redrawAnimSprites
 *     now animates bgTiles water (Step A) → the waves keep moving.
 *   The tiles cell under water used to carry a hidden ground theme (g/s/w) that the water
 *   sprite covered; we overwrite that bgTiles cell with '~' so the water shows (not the
 *   revealed grass/snow/mud) — matching the old look.
 *
 * SELF-VERIFY (throws if the migration would change behaviour):
 *   For every layer, bfsLayer reachability (rooms + cells, no-ladder AND with-ladder)
 *   must be byte-identical before vs after. For the field layer, all honest metrics
 *   (reached/orphans/w1/seams/traps) + under-2-axis + dup groups must match too.
 *
 * Usage:  node scripts/migrate-water-to-bgtiles.mjs [--dry]
 * Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  bfsLayer, findOrphanRooms, findEntrances, firstWalkable,
} from './lib/connectivity.mjs';
import {
  fieldHonestMetrics, underTwoAxisScreens, duplicateLayoutGroups,
} from './lib/field-quality.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const WATER = '~';
const FLOOR = '.';

// ── snapshot of everything the migration must not change ─────────────────────
function snapshotLayer(stages) {
  // BFS from a stable start (first walkable of a deterministic room) both without
  // and with ladder, capturing reached rooms + cell count. We don't rely on
  // findEntrances here (dungeons differ) — we sweep EVERY room as a BFS start and
  // union the reachability, so the snapshot is independent of entrance heuristics.
  const roomKeys = Object.keys(stages).sort();
  const sig = {};
  for (const withLadder of [false, true]) {
    const rooms = new Set();
    let cells = 0;
    for (const k of roomKeys) {
      const start = { stage: k, ...firstWalkable(stages[k]) };
      const { reachedRooms, reachedCells } = bfsLayer(stages, start, { withLadder });
      for (const r of reachedRooms) rooms.add(`${k}|${r}`);
      cells += reachedCells.size;
    }
    sig[withLadder ? 'ladder' : 'walk'] = {
      rooms: [...rooms].sort().join(','),
      cells,
    };
  }
  return sig;
}

function snapshotAll(data) {
  const out = {};
  for (const [ln, layer] of Object.entries(data.layers || {})) {
    if (!layer.stages) continue;
    out[ln] = snapshotLayer(layer.stages);
  }
  // Field honest metrics + quality (the invariants the field is held to).
  const fh = fieldHonestMetrics(data);
  out.__field = {
    reached: fh.reached.size,
    orphans: fh.orphans.join(','),
    w1: fh.w1.join(','),
    seams: fh.seams.join(','),
    traps: fh.traps.join(','),
    under2: underTwoAxisScreens(data).map(x => x.key).sort().join(','),
    dups: duplicateLayoutGroups(data).map(g => g.join('+')).sort().join(','),
  };
  return out;
}

function assertEqual(before, after) {
  const bj = JSON.stringify(before, null, 2);
  const aj = JSON.stringify(after, null, 2);
  if (bj !== aj) {
    // Find the first differing key for a helpful message.
    const bLines = bj.split('\n'), aLines = aj.split('\n');
    let diffAt = -1;
    for (let i = 0; i < Math.max(bLines.length, aLines.length); i++) {
      if (bLines[i] !== aLines[i]) { diffAt = i; break; }
    }
    throw new Error(
      `SELF-VERIFY FAILED: migration changed behaviour.\n` +
      `  before[${diffAt}]: ${bLines[diffAt]}\n` +
      `  after [${diffAt}]: ${aLines[diffAt]}`
    );
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const before = snapshotAll(data);

let cellsMoved = 0;
const perLayer = {};
for (const [ln, layer] of Object.entries(data.layers || {})) {
  const stages = layer.stages;
  if (!stages) continue;
  for (const [sk, st] of Object.entries(stages)) {
    const tiles = st.tiles;
    if (!Array.isArray(tiles)) continue;
    let moved = 0;
    for (let r = 0; r < tiles.length; r++) {
      const row = tiles[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== WATER) continue;
        row[c] = FLOOR;                       // tiles: water → floor
        if (!st.bgTiles) st.bgTiles = {};
        st.bgTiles[`${r},${c}`] = WATER;      // bgTiles: → water underlay
        moved++;
      }
    }
    if (moved) {
      cellsMoved += moved;
      perLayer[ln] = (perLayer[ln] || 0) + moved;
    }
  }
}

// Verify NOTHING observable changed.
const after = snapshotAll(data);
assertEqual(before, after);

if (DRY) {
  console.log(`[dry] would move ${cellsMoved} water cells: ${JSON.stringify(perLayer)}`);
  console.log('[dry] self-verify PASSED (reachability + field metrics unchanged).');
} else {
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
  console.log(`water→bgTiles migration complete: moved ${cellsMoved} cells ${JSON.stringify(perLayer)}`);
  console.log('self-verify PASSED (reachability + field metrics unchanged).');
}
