#!/usr/bin/env node
// Phase 9-2F1 M3: Field expansion — all remaining 84 walkable cells (→ 210 total)
// Fills every G/F/D/W/L/S/M/T/K/V cell in the design map not yet added in M1/M2.
// Run from: outputs/blade-of-lumia/

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field;

// ── zone classification ──────────────────────────────────────────────────────
const ZONE_MAP = [
  // sy0
  ['^','^','^','^','^','^','T','K','K','^','^','^','L','^','^','^'],
  // sy1
  ['^','^','F','^','^','G','G','G','G','G','^','L','L','L','^','^'],
  // sy2
  ['^','F','F','F','G','G','G','G','G','G','G','L','L','L','^','^'],
  // sy3
  ['F','F','F','F','G','G','G','G','G','G','G','G','L','S','^','^'],
  // sy4
  ['F','F','F','F','G','G','G','G','G','G','G','G','S','S','S','^'],
  // sy5
  ['F','F','F','F','G','G','G','G','G','G','G','S','S','S','S','^'],
  // sy6
  ['F','F','F','G','G','G','G','G','G','G','S','S','S','S','~','~'],
  // sy7
  ['F','F','F','G','G','G','G','G','G','W','W','S','S','~','~','~'],
  // sy8
  ['F','F','F','G','G','G','G','G','W','W','W','W','~','~','~','~'],
  // sy9
  ['F','F','G','G','G','G','G','G','W','W','W','~','~','~','~','~'],
  // sy10
  ['G','G','G','G','G','G','G','G','W','W','W','~','~','~','~','~'],
  // sy11
  ['G','G','G','G','G','G','G','G','G','W','W','~','~','~','~','~'],
  // sy12
  ['D','G','G','G','G','G','G','G','G','G','M','M','~','~','~','~'],
  // sy13
  ['D','D','G','G','G','G','G','G','G','M','M','M','~','~','~','~'],
  // sy14
  ['D','D','D','G','G','G','G','V','G','G','M','M','~','~','~','~'],
  // sy15
  ['D','D','D','G','G','G','G','G','G','M','M','M','~','~','~','~'],
  // sy16
  ['D','D','D','D','G','G','G','M','M','M','M','~','~','~','~','~'],
  // sy17
  ['~','D','D','~','G','G','G','M','M','~','~','~','~','~','~','~'],
  // sy18
  ['~','~','~','~','~','G','G','~','~','~','~','~','~','~','~','~'],
  // sy19
  ['~','~','~','~','~','~','~','~','~','~','~','~','~','~','~','~'],
];

function zoneAt(sx, sy) {
  if (sy < 0 || sy >= ZONE_MAP.length) return '~';
  if (sx < 0 || sx >= 16) return '~';
  return ZONE_MAP[sy][sx];
}

// ── tile generators (same as M2) ─────────────────────────────────────────────
function makeTiles(fn) {
  return Array.from({ length: 10 }, (_, r) =>
    Array.from({ length: 12 }, (_, c) => fn(r, c))
  );
}

function grassTiles(variant = 0) {
  const treePos = [
    [[1,2],[3,7],[6,1],[7,9],[8,4]],
    [[2,3],[2,9],[5,1],[7,8],[8,3]],
    [[1,4],[4,2],[6,9],[7,2],[3,8]],
    [[2,1],[3,9],[5,10],[7,3],[8,7]],
  ][variant % 4];
  const treeSet = new Set(treePos.map(([r,c]) => `${r},${c}`));
  return makeTiles((r,c) => treeSet.has(`${r},${c}`) ? 't' : '.');
}

function forestTiles(variant = 0) {
  const sparse = variant % 2 === 0;
  return makeTiles((r,c) => {
    if (r===0) return (c===5||c===6) ? '.' : 't';
    if (r===9) return (c===5||c===6) ? '.' : 't';
    if (c===0) return (r===4||r===5) ? '.' : 't';
    if (c===11) return (r===4||r===5) ? '.' : 't';
    if (r===4||r===5) return '.';
    if (c===5||c===6) return '.';
    if (sparse) {
      if ((r===2&&c===2)||(r===2&&c===9)||(r===7&&c===3)||(r===7&&c===8)) return 't';
    } else {
      if ((r===2&&(c===2||c===4||c===8))||(r===7&&(c===2||c===7||c===9))) return 't';
    }
    return '.';
  });
}

function desertTiles(variant = 0) {
  const rockPos = [
    [[2,2],[3,8],[7,3],[8,9]],
    [[2,4],[3,2],[6,8],[8,3]],
    [[2,8],[3,4],[7,1],[7,9]],
  ][variant % 3];
  const rocks = new Set(rockPos.map(([r,c]) => `${r},${c}`));
  return makeTiles((r,c) => {
    if (r===4||r===5) return '.';
    if (c===5||c===6) return '.';
    if (rocks.has(`${r},${c}`)) return '#';
    return 'd';
  });
}

function waterTiles(variant = 0) {
  const islandPos = [
    [[2,2],[2,9],[7,3],[7,8]],
    [[3,1],[3,10],[6,2],[6,9]],
  ][variant % 2];
  const islands = new Set(islandPos.map(([r,c]) => `${r},${c}`));
  return makeTiles((r,c) => {
    if (r===4||r===5) return '.';
    if (c===5||c===6) return '.';
    if (islands.has(`${r},${c}`)) return '.';
    return '~';
  });
}

function lavaTiles(variant = 0) {
  return makeTiles((r,c) => {
    if (r===4||r===5) return '.';
    if (c===5||c===6) return '.';
    if (r===0||r===9) return '#';
    if (c===0||c===11) return '#';
    if (r>=3&&r<=6&&c>=7&&c<=9) return '~';
    if (r>=2&&r<=7&&c>=2&&c<=4) return '~';
    return '.';
  });
}

function snowTiles(variant = 0) {
  const heavy = variant % 2 === 0;
  return makeTiles((r,c) => {
    if (r===4||r===5) return '.';
    if (c===5||c===6) return '.';
    if (r===0||r===9) return heavy ? 'M' : '.';
    if (c===0||c===11) return heavy ? 'M' : '.';
    if ((r===2||r===7)&&c>=1&&c<=10) return '~';
    if (heavy&&((r===1&&(c===1||c===10))||(r===8&&(c===1||c===10)))) return 'M';
    return '.';
  });
}

function swampTiles(variant = 0) {
  const poolPos = [
    [[1,1],[1,9],[8,2],[8,8]],
    [[2,1],[2,10],[7,1],[7,10]],
  ][variant % 2];
  const pools = new Set(poolPos.map(([r,c]) => `${r},${c}`));
  const deadTrees = new Set(variant%2===0
    ? [[1,3],[1,8],[8,3],[8,9]].map(([r,c])=>`${r},${c}`)
    : [[2,3],[2,8],[7,2],[7,9]].map(([r,c])=>`${r},${c}`)
  );
  return makeTiles((r,c) => {
    if (r===4||r===5) return '.';
    if (c===5||c===6) return '.';
    if (pools.has(`${r},${c}`)) return '~';
    if (deadTrees.has(`${r},${c}`)) return 't';
    return '.';
  });
}

// Tower approach: open grass with dark sky border (SKY '%' tiles for atmosphere)
function towerApproachTiles(variant = 0) {
  return makeTiles((r,c) => {
    if (r===4||r===5) return '.';
    if (c===5||c===6) return '.';
    // border of mountain
    if (r===0||r===9) return 'M';
    if (c===0||c===11) return 'M';
    return '.';
  });
}

// Sky island: open with SKY ('%') impassable tiles around walkable plateau
function skyTiles(variant = 0) {
  return makeTiles((r,c) => {
    if (r===4||r===5) return '.';
    if (c===5||c===6) return '.';
    // sky surrounds the plateau
    if (r===0||r===1||r===8||r===9) return '%';
    if (c===0||c===1||c===10||c===11) return '%';
    return '.';
  });
}

function makeBgTiles(tileChar) {
  const bg = {};
  for (let r=0;r<10;r++) for (let c=0;c<12;c++) bg[`${r},${c}`] = tileChar;
  return bg;
}

function emptyStage(zone, variant=0) {
  let tiles, bg;
  switch (zone) {
    case 'F': tiles = forestTiles(variant);        bg = 'g'; break;
    case 'D': tiles = desertTiles(variant);        bg = 'd'; break;
    case 'W': tiles = waterTiles(variant);         bg = 'g'; break;
    case 'L': tiles = lavaTiles(variant);          bg = '.'; break;
    case 'S': tiles = snowTiles(variant);          bg = '.'; break;
    case 'M': tiles = swampTiles(variant);         bg = 'g'; break;
    case 'T': tiles = towerApproachTiles(variant); bg = '.'; break;
    case 'K': tiles = skyTiles(variant);           bg = '.'; break;
    default:  tiles = grassTiles(variant);         bg = 'g'; break;
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

// ── open borders toward neighbors ────────────────────────────────────────────
function openCell(stage, row, col) {
  if (Array.isArray(stage.tiles[row])) {
    stage.tiles[row][col] = '.';
  } else {
    const arr = stage.tiles[row].split('');
    arr[col] = '.';
    stage.tiles[row] = arr.join('');
  }
}

function openBorder(stage, sides) {
  if (sides.includes('N')) { openCell(stage,0,5); openCell(stage,0,6); }
  if (sides.includes('S')) { openCell(stage,9,5); openCell(stage,9,6); }
  if (sides.includes('W')) { openCell(stage,4,0); openCell(stage,5,0); }
  if (sides.includes('E')) { openCell(stage,4,11); openCell(stage,5,11); }
}

// ── collect all missing walkable cells ───────────────────────────────────────
const WALKABLE = new Set(['G','F','D','W','L','S','M','V','T','K']);
const existingKeys = new Set(Object.keys(field.stages));

const NEW_STAGES = [];
for (let sy = 0; sy < 20; sy++) {
  for (let sx = 0; sx < 16; sx++) {
    const z = zoneAt(sx, sy);
    if (WALKABLE.has(z) && !existingKeys.has(`${sx},${sy}`)) {
      NEW_STAGES.push([sx, sy]);
    }
  }
}

console.log(`M3: adding ${NEW_STAGES.length} stages`);

// Combined key set for neighbor checks
const allKeys = new Set([...existingKeys, ...NEW_STAGES.map(([sx,sy]) => `${sx},${sy}`)]);

function hasStage(sx, sy) { return allKeys.has(`${sx},${sy}`); }

// ── apply ─────────────────────────────────────────────────────────────────────
let added = 0;
NEW_STAGES.forEach(([sx, sy], idx) => {
  const key = `${sx},${sy}`;
  if (existingKeys.has(key)) {
    console.warn(`SKIP ${key} (already exists)`);
    return;
  }
  const zone = zoneAt(sx, sy);
  const stage = emptyStage(zone, idx);

  const sides = [];
  if (hasStage(sx,   sy-1)) sides.push('N');
  if (hasStage(sx,   sy+1)) sides.push('S');
  if (hasStage(sx-1, sy))   sides.push('W');
  if (hasStage(sx+1, sy))   sides.push('E');
  if (sides.length > 0) openBorder(stage, sides.join(''));

  field.stages[key] = stage;
  added++;
});

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
console.log(`M3 complete: added ${added} stages. Total field stages: ${Object.keys(field.stages).length}`);
