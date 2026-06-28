#!/usr/bin/env node
// Phase 9-2F1 M4: Field expansion — all remaining border cells (sea/mountain → 320 total)
// Adds 110 sea ('~' zone) and mountain ('^' zone) border stages.
// Run from: outputs/blade-of-lumia/

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field;

// ── zone map ─────────────────────────────────────────────────────────────────
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

function zoneAt(sx, sy) {
  if (sy < 0 || sy >= ZONE_MAP.length) return '~';
  if (sx < 0 || sx >= 16) return '~';
  return ZONE_MAP[sy][sx];
}

// ── tile generators for border areas ─────────────────────────────────────────
function makeTiles(fn) {
  return Array.from({ length: 10 }, (_, r) =>
    Array.from({ length: 12 }, (_, c) => fn(r, c))
  );
}

// Sea: all water, with open corridor rows/cols for any walking neighbors
function seaTiles(variant = 0) {
  return makeTiles((r,c) => {
    if (r===4||r===5) return '~'; // row-corridor is also sea (impassable sea)
    if (c===5||c===6) return '~'; // col-corridor is also sea
    return '~';
  });
}

// Mountain: all mountain (#/M), impassable
function mountainTiles(variant = 0) {
  const heavy = variant % 2 === 0;
  return makeTiles((r,c) => {
    if (r===4||r===5) return heavy ? 'M' : '#';
    if (c===5||c===6) return heavy ? 'M' : '#';
    return heavy ? 'M' : '#';
  });
}

function makeBgTiles(tileChar) {
  const bg = {};
  for (let r=0;r<10;r++) for (let c=0;c<12;c++) bg[`${r},${c}`] = tileChar;
  return bg;
}

function borderStage(zone, variant=0) {
  let tiles, bg;
  if (zone === '~') {
    tiles = seaTiles(variant);
    bg = 'g';
  } else {
    tiles = mountainTiles(variant);
    bg = '.';
  }
  return {
    cols: 12, rows: 10,
    tiles,
    bgTiles: makeBgTiles(bg),
    links: [], enemyDirs: {}, chestContents: {},
    floorItems: {}, objects: {}, npcData: {}, shopData: {},
    mapEnters: {}, showConditions: {}, breakableWalls: {}, isBossRoom: false,
  };
}

// ── collect all missing barrier cells ────────────────────────────────────────
const BARRIERS = new Set(['^', '~']);
const existingKeys = new Set(Object.keys(field.stages));

const NEW_STAGES = [];
for (let sy = 0; sy < 20; sy++) {
  for (let sx = 0; sx < 16; sx++) {
    const z = zoneAt(sx, sy);
    if (BARRIERS.has(z) && !existingKeys.has(`${sx},${sy}`)) {
      NEW_STAGES.push([sx, sy]);
    }
  }
}

console.log(`M4: adding ${NEW_STAGES.length} border stages`);

// ── apply ─────────────────────────────────────────────────────────────────────
let added = 0;
NEW_STAGES.forEach(([sx, sy], idx) => {
  const key = `${sx},${sy}`;
  if (existingKeys.has(key)) {
    console.warn(`SKIP ${key} (already exists)`);
    return;
  }
  const zone = zoneAt(sx, sy);
  const stage = borderStage(zone, idx);
  // Border stages have no open corridors — they are impassable walls/sea.
  // No openBorder() needed; walkable neighbors handle their own borders.
  field.stages[key] = stage;
  added++;
});

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
console.log(`M4 complete: added ${added} border stages. Total field stages: ${Object.keys(field.stages).length}`);
