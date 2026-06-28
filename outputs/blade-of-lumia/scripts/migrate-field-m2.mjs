#!/usr/bin/env node
// Phase 9-2F1 M2: Field layer expansion ~128 screens
// Adds ~79 regional screens (Forest/Desert/Water/Lava/Snow/Swamp/Grassland)
// Run from: outputs/blade-of-lumia/

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field;

// ── zone classification (from design map) ───────────────────────────────────
// Returns zone type for given sx,sy
function zoneAt(sx, sy) {
  // Hard-coded zone map matching PLAN.md 9-2F1 地理基準図
  const map = [
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
  if (sy < 0 || sy >= map.length) return '~';
  if (sx < 0 || sx >= 16) return '~';
  return map[sy][sx];
}

// ── tile pattern generators ──────────────────────────────────────────────────
// Each returns a 10×12 array of tile characters.
// Borders at col5,6 (rows 0,9) and row4,5 (cols 0,11) are left passable '.'
// so openBorder() can write to them later.

function makeTiles(fn) {
  return Array.from({ length: 10 }, (_, r) =>
    Array.from({ length: 12 }, (_, c) => fn(r, c))
  );
}

// grassland: open field with occasional trees
function grassTiles(variant = 0) {
  const treePos = [
    [[1,2],[3,7],[6,1],[7,9],[8,4]],
    [[2,3],[2,9],[5,1],[7,8],[8,3]],
    [[1,4],[4,2],[6,9],[7,2],[3,8]],
    [[2,1],[3,9],[5,10],[7,3],[8,7]],
  ][variant % 4];
  const treeSet = new Set(treePos.map(([r,c]) => `${r},${c}`));
  return makeTiles((r,c) => {
    if (r===0||r===9) return (c===5||c===6) ? '.' : '.';
    if (c===0||c===11) return '.';
    return treeSet.has(`${r},${c}`) ? 't' : '.';
  });
}

// forest: dense tree border, walkable interior cross
function forestTiles(variant = 0) {
  const sparse = variant % 2 === 0;
  return makeTiles((r,c) => {
    // borders open at correct spots
    if (r===0) return (c===5||c===6) ? '.' : 't';
    if (r===9) return (c===5||c===6) ? '.' : 't';
    if (c===0) return (r===4||r===5) ? '.' : 't';
    if (c===11) return (r===4||r===5) ? '.' : 't';
    // rows 4,5 are always open (W/E corridor)
    if (r===4||r===5) return '.';
    // cols 5,6 are always open (N/S corridor)
    if (c===5||c===6) return '.';
    // sparse interior trees
    if (sparse) {
      if ((r===2&&c===2)||(r===2&&c===9)||(r===7&&c===3)||(r===7&&c===8)) return 't';
    } else {
      if ((r===2&&(c===2||c===4||c===8))||(r===7&&(c===2||c===7||c===9))) return 't';
    }
    return '.';
  });
}

// desert: sand floor with rocks
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

// water: water field with cross-shaped walkable path
function waterTiles(variant = 0) {
  const islandPos = [
    [[2,2],[2,9],[7,3],[7,8]],
    [[3,1],[3,10],[6,2],[6,9]],
  ][variant % 2];
  const islands = new Set(islandPos.map(([r,c]) => `${r},${c}`));
  return makeTiles((r,c) => {
    // corridor rows/cols stay open
    if (r===4||r===5) return '.';
    if (c===5||c===6) return '.';
    // small islands of ground
    if (islands.has(`${r},${c}`)) return '.';
    // inner strip is walkable for traversal
    if (r>=2&&r<=7&&c>=2&&c<=9) return '~';
    if (r===0||r===1||r===8||r===9) return '~';
    if (c===0||c===1||c===10||c===11) return '~';
    return '~';
  });
}

// lava/volcano: rocky with lava pools
function lavaTiles(variant = 0) {
  return makeTiles((r,c) => {
    if (r===4||r===5) return '.';
    if (c===5||c===6) return '.';
    if (r===0||r===9) return '#';
    if (c===0||c===11) return '#';
    // lava pool
    if (r>=2&&r<=7&&c>=2&&c<=4) return (r===3||r===4||r===5||r===6) && (c===2||c===3||c===4) ? '~' : '.';
    if (r>=3&&r<=6&&c>=7&&c<=9) return '~';
    return '.';
  });
}

// snow: mountain peaks and frozen rivers
function snowTiles(variant = 0) {
  const heavy = variant % 2 === 0;
  return makeTiles((r,c) => {
    if (r===4||r===5) return '.';
    if (c===5||c===6) return '.';
    if (r===0||r===9) return heavy ? 'M' : '.';
    if (c===0||c===11) return heavy ? 'M' : '.';
    // frozen river
    if ((r===2||r===7)&&c>=1&&c<=10) return '~';
    // mountain chunks
    if (heavy&&((r===1&&(c===1||c===10))||(r===8&&(c===1||c===10)))) return 'M';
    return '.';
  });
}

// swamp: water pools with dead trees
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

function makeBgTiles(tileChar) {
  const bg = {};
  for (let r=0;r<10;r++) for (let c=0;c<12;c++) bg[`${r},${c}`] = tileChar;
  return bg;
}

function emptyStage(zone, variant=0) {
  let tiles, bg;
  switch (zone) {
    case 'F': tiles = forestTiles(variant); bg = 'g'; break;
    case 'D': tiles = desertTiles(variant); bg = 'd'; break;
    case 'W': tiles = waterTiles(variant); bg = 'g'; break;
    case 'L': tiles = lavaTiles(variant); bg = '.'; break;
    case 'S': tiles = snowTiles(variant); bg = '.'; break;
    case 'M': tiles = swampTiles(variant); bg = 'g'; break;
    default:  tiles = grassTiles(variant); bg = 'g'; break;
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

// ── open borders toward neighbors ───────────────────────────────────────────
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

// ── new M2 stages ────────────────────────────────────────────────────────────
// List of [sx, sy] to add. Zones from zoneAt().
const NEW_STAGES = [
  // Grassland central mesh
  // sy2 lateral (connect forest to E spine)
  [4,2],[5,2],[6,2],
  // sy3 E extension
  [8,3],[9,3],[10,3],[11,3],
  // sy4 E extension
  [8,4],[9,4],[10,4],[11,4],
  // sy5 lateral fill
  [5,5],[6,5],[8,5],[9,5],[10,5],
  // sy6 lateral fill
  [4,6],[5,6],[6,6],[8,6],[9,6],
  // sy7 lateral fill
  [4,7],[5,7],[6,7],[8,7],
  // sy8 lateral fill
  [4,8],[5,8],[6,8],

  // Forest block (N/S/W of D6 entrance 2,4)
  [1,2],[2,2],[3,2],          // sy2 forest
  [0,3],[1,3],[2,3],[3,3],    // sy3 forest
  [0,5],[1,5],[2,5],[3,5],    // sy5 forest (S of D6)
  [0,6],[1,6],                 // sy6 forest

  // Desert block (around D2 entrance 2,15)
  [2,14],[1,14],[0,14],        // sy14 desert (N of D2)
  [0,15],[1,15],               // sy15 desert (W of D2)
  [0,16],[1,16],[2,16],[3,16], // sy16 desert
  [1,17],[2,17],               // sy17 desert

  // Water/Lake block (around D3 entrance 9,9)
  [9,7],[10,7],                // sy7 lake N
  [8,8],[9,8],[10,8],          // sy8 lake
  [10,9],                      // sy9 lake E
  [8,10],[9,10],[10,10],       // sy10 lake
  [9,11],                      // sy11 lake S

  // Lava/Volcano (around D4 entrance 12,2)
  [12,1],[13,1],               // sy1 volcano N
  [12,3],                      // sy3 volcano S

  // Snow (around D5 entrance 13,5)
  [12,4],[14,4],               // sy4 snow
  [11,5],[12,5],[14,5],        // sy5 snow
  [10,6],[11,6],[12,6],        // sy6 snow

  // Swamp (around D8 entrance 10,14)
  [10,12],[11,12],             // sy12 swamp N
  [9,13],[10,13],[11,13],      // sy13 swamp
  [11,14],                     // sy14 swamp (E of D8)
  [10,15],[11,15],             // sy15 swamp
  [9,16],                      // sy16 swamp
];

// Build combined stage key set (M1 + new M2)
const existingKeys = new Set(Object.keys(field.stages));
const newKeys = new Set(NEW_STAGES.map(([sx,sy]) => `${sx},${sy}`));
const allKeys = new Set([...existingKeys, ...newKeys]);

function hasStage(sx, sy) { return allKeys.has(`${sx},${sy}`); }

// ── apply ────────────────────────────────────────────────────────────────────
let added = 0;
NEW_STAGES.forEach(([sx, sy], idx) => {
  const key = `${sx},${sy}`;
  if (existingKeys.has(key)) {
    console.warn(`SKIP ${key} (already exists)`);
    return;
  }
  const zone = zoneAt(sx, sy);
  const stage = emptyStage(zone, idx);

  // open borders toward any neighbor in the combined set
  const sides = [];
  if (hasStage(sx,   sy-1)) sides.push('N');
  if (hasStage(sx,   sy+1)) sides.push('S');
  if (hasStage(sx-1, sy))   sides.push('W');
  if (hasStage(sx+1, sy))   sides.push('E');
  if (sides.length > 0) openBorder(stage, sides.join(''));

  field.stages[key] = stage;
  added++;
});

// ── save ─────────────────────────────────────────────────────────────────────
writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
console.log(`M2 complete: added ${added} stages. Total field stages: ${Object.keys(field.stages).length}`);
