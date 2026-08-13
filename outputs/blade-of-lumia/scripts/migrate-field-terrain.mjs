#!/usr/bin/env node
/**
 * migrate-field-terrain.mjs  (Phase 9-4 — themed ground repaint)
 *
 * Repaints the *bgTiles* layer (the actual visible ground — the tiles-layer
 * '.' FLOOR is invisible and falls through to the bgTile class in
 * render-board.js) so themed regions read as their theme instead of the
 * default dark dungeon floor / plain grass.
 *
 * Findings from the live data (2026-07-04) that scope this migration:
 *   - Grass regions (G/F/W/D/V) already have correct bgTiles from M1–M4.
 *   - L (fire/volcano)  : bgTiles half '.' FLOOR → renders as dark dungeon floor.
 *   - S (snow)          : bgTiles mostly '.' FLOOR → dark dungeon floor.
 *   - M (swamp)         : bgTiles plain 'g' grass → should be mud.
 *
 * So we only repaint the L → ASH('c'), S → SNOW('s'), M → MUD('w') zones.
 * This is purely cosmetic: passable.js reads the *tiles* layer, not bgTiles,
 * so connectivity is unaffected (verified by check-field-connectivity.mjs).
 *
 * Preserved bgTile chars (not repainted): stone path 'o', sand 'd', bridge 'v',
 * water '~' — these carry meaning (paths / crossings) that theme paint must not
 * clobber. Only the plain ground fillers '.' and 'g' become the theme tile.
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

// ── region base map (must match ZONE_MAP in migrate-field-m4.mjs) ─────────────
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

// zone → theme bgTile char
const ZONE_THEME = {
  L: 'c', // fire/volcano → ASH
  S: 's', // snow         → SNOW
  M: 'w', // swamp        → MUD
};

// bgTile chars that plain-ground paint replaces
const GROUND_FILLERS = new Set(['.', 'g']);

// ── apply ─────────────────────────────────────────────────────────────────────
let screensTouched = 0;
let cellsRepainted = 0;

for (let sy = 0; sy < 20; sy++) {
  for (let sx = 0; sx < 16; sx++) {
    const zone = ZONE_MAP[sy][sx];
    const theme = ZONE_THEME[zone];
    if (!theme) continue;

    const key = `${sx},${sy}`;
    const stage = field[key];
    if (!stage || !stage.bgTiles) continue;

    let touched = false;
    for (const posKey in stage.bgTiles) {
      const cur = stage.bgTiles[posKey];
      if (GROUND_FILLERS.has(cur) && cur !== theme) {
        stage.bgTiles[posKey] = theme;
        cellsRepainted++;
        touched = true;
      }
    }
    if (touched) screensTouched++;
  }
}

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
console.log(
  `9-4 terrain repaint complete: ${cellsRepainted} bgTile cells across ${screensTouched} screens ` +
  `repainted to themed ground (L→ash, S→snow, M→mud).`
);
