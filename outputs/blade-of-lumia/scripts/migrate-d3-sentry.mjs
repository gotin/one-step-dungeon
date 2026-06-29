#!/usr/bin/env node
// Phase 9-3 (b) follow-up: Relocate dungeon_3 F-sentry to the critical path.
//
// Problem (9-2y review): The two F-sentries in stage [2,1] are in a side-room
// reachable only through optional detour (2,3→2,2→2,1 or 3,1→2,1). Players who
// skip the detour never encounter shield-blocking and the hint sign is wasted.
//
// Fix:
//   1. Add F(row3,col8) + F(row5,col8) to stage [1,3] (dungeon entrance room).
//      Players must pass through here to reach [1,2] and the rest of the dungeon,
//      so every player meets the sentries BEFORE obtaining the bow.
//   2. Move the "shield" hint sign from [2,1] to [1,3] (merged with existing sign).
//   3. Remove F×2 from [2,1]. Add arrows (15) as floor reward so the detour
//      still has value.
//
// Run from: outputs/blade-of-lumia/
//   node scripts/migrate-d3-sentry.mjs

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const D3 = data.layers.dungeon_3.stages;

// ── [1,3] entrance room ──────────────────────────────────────────────────────
// Current tiles (row3 col5=`i` sign):
//   row3: #....i.....#
//   row5: #...........   (open passage toward right exit)
// Place sentries at col8 in rows 3 and 5 — right side of the room.
// Players enter from the right (field warp at row7,col2) and walk upward,
// passing through the open rows 4-5; the sentries face them from the east wall.
const st13 = D3['1,3'];

// Mutate tile rows
st13.tiles[3][8] = 'F';
st13.tiles[5][8] = 'F';

// Update sign: keep existing "bow hint" and add shield hint
st13.signData['3,5'] = {
  name: '水の迷宮の入口',
  lines: [
    '番兵が遠くから槍を投げる。',
    '盾で飛び道具を防いで近づけ。',
    '弓矢があれば 奥の扉が開く。',
  ],
};

// ── [2,1] side-room ──────────────────────────────────────────────────────────
// Remove the two F sentries; keep the room layout intact.
// Add arrows as floor reward so the detour is still worthwhile.
const st21 = D3['2,1'];

st21.tiles[5][5] = '.';
st21.tiles[5][7] = '.';

// Remove the now-redundant hint sign (shield advice is in [1,3])
delete st21.signData['2,5'];

// Add arrows at the centre of the room as exploration reward
if (!st21.floorItems) st21.floorItems = {};
st21.floorItems['5,5'] = { count: 15 };

// ── Save ─────────────────────────────────────────────────────────────────────
writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
console.log('migrate-d3-sentry: done');
console.log('  [1,3] F added at (3,8) and (5,8); sign updated with shield hint');
console.log('  [2,1] F removed; arrows(15) added at (5,5); hint sign removed');
