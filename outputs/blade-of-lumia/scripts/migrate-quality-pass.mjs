/**
 * migrate-quality-pass.mjs
 *
 * Populates the 320-screen field with enemies, chests, NPCs, and secrets
 * for the quality pass (Phase 9-2F1 質パス).
 *
 * Rules:
 *  - Skip sea/mountain border screens (impassable majority)
 *  - Skip screens with existing mapEnters/npcData/chestContents (dungeon homes, village)
 *  - Add region-appropriate enemies to all other walkable screens
 *  - Add chests and secrets to ~30% of walkable screens
 *  - Placement is deterministic (coordinate-seeded hash)
 *  - Only place on '.' floor tiles; never overwrite existing content
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, '../work/blade-of-lumia.json');

const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
const field = data.layers.field.stages;

// ── helpers ─────────────────────────────────────────────────────────────────

/** Simple deterministic hash from coordinates and salt */
function hash(sx, sy, salt = 0) {
  let h = (sx * 73856093) ^ (sy * 19349663) ^ (salt * 83492791);
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return Math.abs(h);
}

/** Pick element from array using deterministic index */
function pick(arr, sx, sy, salt) {
  return arr[hash(sx, sy, salt) % arr.length];
}

/** Find all floor cells in a stage that are safe to place on */
function getFloorCells(tiles) {
  const cells = [];
  for (let r = 0; r < tiles.length; r++) {
    const row = tiles[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '.') cells.push({ r, c });
    }
  }
  return cells;
}

/** True if tile at (r,c) is already taken */
function isOccupied(tiles, r, c) {
  const t = (tiles[r] || [])[c];
  return t !== null && t !== '.' && t !== undefined;
}

/** Place a tile only if the cell is currently '.' */
function placeTile(tiles, r, c, tileChar) {
  if ((tiles[r] || [])[c] === '.') {
    tiles[r][c] = tileChar;
    return true;
  }
  return false;
}

// ── region classification ────────────────────────────────────────────────────

function classifyRegion(sx, sy, tiles) {
  const all = tiles.flat();
  const cnt = t => all.filter(x => x === t).length;

  const water = cnt('~');
  const mountain = cnt('M') + cnt('#');
  const tree = cnt('t');
  const sand = cnt('d');
  const fence = cnt('f');

  if (water > 70) return 'sea_border';
  if (mountain > 60) return 'mountain_border';
  if (sand > 30) return 'desert';
  if (tree > 20) return 'forest';
  if (fence > 10) return 'swamp';
  if (water > 20) return 'water';
  if (sy <= 5 && sx >= 10) return 'snow';

  // Near dungeon_8 swamp entrance area
  if (sx >= 9 && sx <= 11 && sy >= 12 && sy <= 16) return 'swamp';

  return 'grass';
}

// ── stages to skip ───────────────────────────────────────────────────────────

// Stages with existing meaningful content (dungeon homes, village, NPCs)
const CONTENT_STAGES = new Set([
  '6,13', '7,14', '2,15', '9,9', '12,2', '13,5', '2,4', '10,14', '9,15',
  '5,3',  // forest area with existing enemy + chests
  '7,3',  // chest with NPC
  '8,1',  // sky island approach
]);

// ── enemy/item pools per region ──────────────────────────────────────────────

const ENEMIES = {
  grass:   ['E', 'E', 'E', 'C'],         // mostly patrols
  forest:  ['E', 'C', 'C', 'F'],         // chasers + sentries
  desert:  ['E', 'F', 'F', 'C'],         // sentries (ranged vs shields)
  snow:    ['E', 'F', 'C'],              // mix
  swamp:   ['C', 'C', 'E'],              // chasers in murky terrain
  water:   ['E', 'C'],                   // near water edges
};

// Chest reward pools: [item, name] or {type, value, name}
const CHEST_REWARDS = {
  grass: [
    { type: 'rupee', value: 5,  name: 'ルピー×5' },
    { type: 'rupee', value: 10, name: 'ルピー×10' },
    { type: 'item',  item: 'healPotion', name: '回復薬（小）' },
  ],
  forest: [
    { type: 'rupee', value: 10, name: 'ルピー×10' },
    { type: 'item',  item: 'healPotion', name: '回復薬（小）' },
    { type: 'item',  item: 'bigHealPotion', name: '回復薬（大）' },
  ],
  desert: [
    { type: 'rupee', value: 20, name: 'ルピー×20' },
    { type: 'rupee', value: 5,  name: 'ルピー×5' },
    { type: 'item',  item: 'healPotion', name: '回復薬（小）' },
  ],
  snow: [
    { type: 'rupee', value: 20, name: 'ルピー×20' },
    { type: 'item',  item: 'bigHealPotion', name: '回復薬（大）' },
  ],
  swamp: [
    { type: 'rupee', value: 10, name: 'ルピー×10' },
    { type: 'item',  item: 'healPotion', name: '回復薬（小）' },
  ],
  water: [
    { type: 'rupee', value: 5,  name: 'ルピー×5' },
    { type: 'item',  item: 'healPotion', name: '回復薬（小）' },
  ],
};

// ── placement logic ──────────────────────────────────────────────────────────

/**
 * Find candidate floor cells for enemies:
 * - Must be '.'
 * - Avoid corridor rows 4-5 (main passthrough rows)
 * - Avoid cells adjacent to mapEnters to prevent blocking
 */
function getEnemyCandidates(tiles, mapEnters) {
  const enterCoords = new Set(
    Object.keys(mapEnters || {}).map(k => k) // "r,c" strings
  );
  const candidates = [];
  for (let r = 0; r < tiles.length; r++) {
    const row = tiles[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '.') continue;
      // skip corridor rows
      if (r === 4 || r === 5) continue;
      // skip cells adjacent to map enters
      const near = [`${r-1},${c}`,`${r+1},${c}`,`${r},${c-1}`,`${r},${c+1}`];
      if (near.some(k => enterCoords.has(k))) continue;
      candidates.push({ r, c });
    }
  }
  return candidates;
}

/**
 * Distribute N picks from candidates using deterministic spacing
 */
function pickSpread(candidates, count, sx, sy, salt) {
  if (candidates.length === 0) return [];
  const picked = [];
  const used = new Set();
  // shuffle candidates deterministically
  const shuffled = [...candidates].sort((a, b) => {
    const ha = hash(sx + a.r, sy + a.c, salt);
    const hb = hash(sx + b.r, sy + b.c, salt);
    return ha - hb;
  });
  for (let i = 0; i < shuffled.length && picked.length < count; i++) {
    const cell = shuffled[i];
    // enforce minimum spacing of 2 cells
    const tooClose = picked.some(p =>
      Math.abs(p.r - cell.r) + Math.abs(p.c - cell.c) < 3
    );
    if (!tooClose) {
      picked.push(cell);
      used.add(`${cell.r},${cell.c}`);
    }
  }
  return picked;
}

// ── main loop ────────────────────────────────────────────────────────────────

let modified = 0;
let totalEnemiesAdded = 0;
let totalChestsAdded = 0;
let totalFloorItemsAdded = 0;
let totalBushesAdded = 0;

for (const [key, stage] of Object.entries(field)) {
  const [sx, sy] = key.split(',').map(Number);
  const tiles = stage.tiles;
  if (!tiles) continue;

  const region = classifyRegion(sx, sy, tiles);
  if (region === 'sea_border' || region === 'mountain_border') continue;

  // Skip stages with meaningful existing content
  if (CONTENT_STAGES.has(key)) continue;

  // Skip sky island
  if (region === 'sky') continue;

  const enemyPool = ENEMIES[region] || ENEMIES.grass;
  const chestPool = CHEST_REWARDS[region] || CHEST_REWARDS.grass;

  // ── enemies ────────────────────────────────────────────────────────────────
  const candidates = getEnemyCandidates(tiles, stage.mapEnters);
  if (candidates.length < 3) continue; // not enough space

  // Enemy count: 2-4 based on region + hash
  const baseCount = region === 'desert' || region === 'snow' ? 3 : 2;
  const enemyCount = baseCount + (hash(sx, sy, 1) % 2); // 2-3 or 3-4

  const enemyCells = pickSpread(candidates, enemyCount, sx, sy, 10);
  let addedEnemies = 0;
  for (const cell of enemyCells) {
    const eType = pick(enemyPool, sx + cell.r, sy + cell.c, 20);
    if (placeTile(tiles, cell.r, cell.c, eType)) {
      addedEnemies++;
    }
  }

  if (addedEnemies === 0) continue;
  totalEnemiesAdded += addedEnemies;
  modified++;

  // ── chests (30% of screens) ────────────────────────────────────────────────
  if (hash(sx, sy, 2) % 10 < 3) {
    // Find a floor cell not used by enemies
    const nonEnemy = candidates.filter(c =>
      tiles[c.r][c.c] === '.' // still empty after enemy placement
    );
    if (nonEnemy.length > 0) {
      const chestCells = pickSpread(nonEnemy, 1, sx, sy, 30);
      for (const cell of chestCells) {
        if (placeTile(tiles, cell.r, cell.c, 'B')) {
          const reward = pick(chestPool, sx + cell.r, sy + cell.c, 40);
          if (!stage.chestContents) stage.chestContents = {};
          stage.chestContents[`${cell.r},${cell.c}`] = reward;
          totalChestsAdded++;
        }
      }
    }
  }

  // ── floor rupees (20% of screens) ─────────────────────────────────────────
  if (hash(sx, sy, 3) % 10 < 2) {
    const nonOccupied = candidates.filter(c => tiles[c.r][c.c] === '.');
    if (nonOccupied.length > 0) {
      const rupeeCell = pickSpread(nonOccupied, 1, sx, sy, 50)[0];
      if (rupeeCell && placeTile(tiles, rupeeCell.r, rupeeCell.c, 'r')) {
        totalFloorItemsAdded++;
      }
    }
  }

  // ── bushes (15% of screens, forest/grass only) ────────────────────────────
  if ((region === 'grass' || region === 'forest') && hash(sx, sy, 4) % 10 < 2) {
    const nonOccupied = candidates.filter(c => tiles[c.r][c.c] === '.');
    const bushCells = pickSpread(nonOccupied, 2, sx, sy, 60);
    for (const cell of bushCells) {
      if (placeTile(tiles, cell.r, cell.c, 'u')) {
        totalBushesAdded++;
      }
    }
  }
}

// ── save ─────────────────────────────────────────────────────────────────────

writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));

console.log('=== Quality Pass Complete ===');
console.log(`Screens modified: ${modified}`);
console.log(`Enemies added:    ${totalEnemiesAdded}`);
console.log(`Chests added:     ${totalChestsAdded}`);
console.log(`Floor rupees:     ${totalFloorItemsAdded}`);
console.log(`Bushes added:     ${totalBushesAdded}`);
