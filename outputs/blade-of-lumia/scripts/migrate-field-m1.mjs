#!/usr/bin/env node
// Phase 9-2F1 M1: Migrate field layer to 16×20 frame (~46 stages)
// Village 7,14 · D1-D8 entrance homes · grass corridors
// Run from: outputs/blade-of-lumia/

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const oldField = data.layers.field;
const oldStages = oldField.stages;

// ── helpers ──────────────────────────────────────────────────────────────────

function makeGrassTiles() {
  return Array.from({ length: 10 }, () => Array(12).fill('.'));
}

function makeGrassBgTiles() {
  const bg = {};
  for (let r = 0; r < 10; r++) for (let c = 0; c < 12; c++) bg[`${r},${c}`] = 'g';
  return bg;
}

function emptyStage() {
  return {
    cols: 12, rows: 10,
    tiles: makeGrassTiles(),
    bgTiles: makeGrassBgTiles(),
    links: [], enemyDirs: {}, chestContents: {},
    floorItems: {}, objects: {}, npcData: {}, shopData: {},
    mapEnters: {}, showConditions: {}, breakableWalls: {}, isBossRoom: false,
  };
}

function deepCopy(x) { return JSON.parse(JSON.stringify(x)); }

// Open a specific border cell (row,col) of a stage (set to '.')
function openCell(stage, row, col) {
  if (Array.isArray(stage.tiles[row])) {
    stage.tiles[row][col] = '.';
  } else {
    const arr = stage.tiles[row].split('');
    arr[col] = '.';
    stage.tiles[row] = arr.join('');
  }
}

// Open the canonical corridor cells at stage borders (rows 4,5 for W/E;
// cols 5,6 for N/S). Only opens the BFS connection points, preserving thematic
// tile content elsewhere. Dead-edge warnings at non-open border cells are
// accepted for M1 (they're "no-stage" map-boundary warnings, not gameplay bugs).
function openBorder(stage, sides) {
  if (sides.includes('N')) { openCell(stage, 0, 5); openCell(stage, 0, 6); }
  if (sides.includes('S')) { openCell(stage, 9, 5); openCell(stage, 9, 6); }
  if (sides.includes('W')) { openCell(stage, 4, 0); openCell(stage, 5, 0); }
  if (sides.includes('E')) { openCell(stage, 4, 11); openCell(stage, 5, 11); }
}

// ── remap existing stages ─────────────────────────────────────────────────────

const newStages = {};

// ── 7,14 ← 1,0 (village, startPos row2 col2) ──────────────────────────────
// Fix: N border (row0 mountains) and W border (col0 mountains)
{
  const s = deepCopy(oldStages['1,0']);
  openBorder(s, 'NSWE'); // open all for full world connectivity
  newStages['7,14'] = s;
}

// ── 6,13 ← 1,1 (D1 + hidden_cave entrance) ───────────────────────────────
// col11[5]='.' already → BFS can enter from 7,13 E→W. No fix needed but open N too.
{
  const s = deepCopy(oldStages['1,1']);
  openBorder(s, 'NS'); // open N for potential future, S already open
  newStages['6,13'] = s;
}

// ── 9,9 ← 2,0 (D3 lake · secret_grotto · flute reveal · shops) ──────────
// col0[4,5]='.' already open. Need E to connect back to 8,9 corridor.
{
  const s = deepCopy(oldStages['2,0']);
  openBorder(s, 'W');
  newStages['9,9'] = s;
}

// ── 12,2 ← 0,1 (D4 volcano) ──────────────────────────────────────────────
// Both W (from 11,2) and E (to 13,2 D5-path) needed
{
  const s = deepCopy(oldStages['0,1']);
  openBorder(s, 'NSWE');
  newStages['12,2'] = s;
}

// ── 2,4 ← 1,2 (D6 forest, D2 entrance removed) ───────────────────────────
// 1,2 had D6@[4][2] and D2@[7][5]. Keep only D6. Fix E border for corridor.
{
  const s = deepCopy(oldStages['1,2']);
  // Remove D2 entrance
  delete s.mapEnters['7,5'];
  openCell(s, 7, 5); // replace '>' with '.'
  openBorder(s, 'NSWE');
  newStages['2,4'] = s;
}

// ── 2,15 ← new D2 stub (desert, D2 entrance) ────────────────────────────
{
  const s = emptyStage();
  // D2 entrance > at [5][5]
  s.tiles[5][5] = '>';
  s.mapEnters['5,5'] = { id: 'field_dungeon2', destId: 'dungeon_2' };
  // Stone tablet hinting at D2
  s.npcData['3,5'] = {
    name: '石碑',
    lines: ['【砂漠の神殿】', '砂漠の奥深くに 古代の神殿が眠る。', '→ すぐ前に入口がある。'],
  };
  openBorder(s, 'NSWE');
  newStages['2,15'] = s;
}

// ── 13,5 ← 2,1 (D5 snow) ──────────────────────────────────────────────────
// N border needed (from 13,4 corridor)
{
  const s = deepCopy(oldStages['2,1']);
  openBorder(s, 'NSWE');
  newStages['13,5'] = s;
}

// ── 10,14 ← 3,1 (D8 swamp, cave_1 content removed) ──────────────────────
// 3,1 had D8@[2][4] and cave_1@[8][10]. Keep only D8. Fix W border.
{
  const s = deepCopy(oldStages['3,1']);
  // Remove cave_1 entrance and its killAll gate
  delete s.mapEnters['8,10'];
  delete s.showConditions['8,10'];
  openCell(s, 8, 10); // replace '>' with '.'
  // Remove cave_1 hint stone npc (8,9) — goes to 9,15
  delete s.npcData['8,9'];
  openBorder(s, 'NSWE');
  newStages['10,14'] = s;
}

// ── 9,15 ← cave_1 derived from 3,1 ──────────────────────────────────────
{
  const s = emptyStage();
  // cave_1 entrance at [8][10] with killAll gate
  s.tiles[8][10] = '>';
  s.mapEnters['8,10'] = { id: 'field_2', destId: 'cave_1' };
  s.showConditions['8,10'] = { trigger: 'allSwitchesOn' };
  // Hint stone (from 3,1 NPC 8,9)
  const orig = oldStages['3,1'];
  if (orig.npcData && orig.npcData['8,9']) {
    s.npcData['3,5'] = deepCopy(orig.npcData['8,9']); // reposition to visible spot
  }
  // Some hostile tiles to justify killAll gate
  s.tiles[4][5] = 'S'; // stone enemy
  s.tiles[4][7] = 'S';
  s.tiles[5][5] = 'S';
  s.tiles[5][7] = 'S';
  openBorder(s, 'NSWE');
  newStages['9,15'] = s;
}

// ── 6,0 and 8,0 (tower/sky island) skipped for M1 ───────────────────────
// Tower (dark_tower) and sky island (D7) are flight-only; they'll be added
// as reachable-by-flight stubs in a later milestone (M2+). For now, the
// fieldToTower / fluteEffect references are preserved in the backup but not
// included in the foot-accessible M1 map so they don't generate orphan errors.

// ── 5,3 ← 0,2 (ruins: castle ruins + abandoned village) ─────────────────
// Fix E border (col11[4,5]='t' → '.')
{
  const s = deepCopy(oldStages['0,2']);
  openBorder(s, 'NSWE');
  newStages['5,3'] = s;
}

// ── corridor stages (simple grass, all borders open) ─────────────────────

// N spine: 7,0 through 7,13 (7,14 = village, already added)
for (let sy = 0; sy <= 13; sy++) newStages[`7,${sy}`] = emptyStage();

// E branch toward D4 (from 7,2 east): 8,2 · 9,2 · 10,2 · 11,2
for (let sx = 8; sx <= 11; sx++) newStages[`${sx},2`] = emptyStage();

// D5 branch (from 12,2 D4 eastward then south): 13,2 · 13,3 · 13,4
for (let sy = 2; sy <= 4; sy++) newStages[`13,${sy}`] = emptyStage();

// D6 branch (from 7,4 westward): 6,4 · 5,4 · 4,4 · 3,4
for (let sx = 3; sx <= 6; sx++) newStages[`${sx},4`] = emptyStage();

// D2 branch (from 7,14 south then west): 7,15 · 6,15 · 5,15 · 4,15 · 3,15
newStages['7,15'] = emptyStage();
for (let sx = 3; sx <= 6; sx++) newStages[`${sx},15`] = emptyStage();

// D3 branch (from 7,9 east): 8,9
newStages['8,9'] = emptyStage();

// D8 branch (from 7,14 east): 8,14 · 9,14
newStages['8,14'] = emptyStage();
newStages['9,14'] = emptyStage();

// Ruins approach (from 7,3 west): 6,3
newStages['6,3'] = emptyStage();

// N spine toward tower (7,0 through 7,1 are grass corridors; sky island / tower
// are NOT added here — flight-only, added in M2+)
// newStages['7,0'] already added via spine loop above

// ── assemble new field layer ──────────────────────────────────────────────

data.startPos = { layer: 'field', stage: '7,14', row: 2, col: 2 };

data.layers.field = {
  stages: newStages,
};

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
console.log(`✅ migrated field to ${Object.keys(newStages).length} stages`);
console.log('   startPos → 7,14');
console.log('   old stages replaced:', Object.keys(oldStages).join(' '));
console.log('   new stage keys:', Object.keys(newStages).sort().join(' '));
