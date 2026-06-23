// Phase 2-4 / 9-2pre support: BFS over the field world map to verify every
// dungeon entrance is reachable on foot from the start village, and that no edge
// strands the player. Uses the shared core (scripts/lib/connectivity.mjs) which
// mirrors game.js checkStageTransition + game/passable.js tilePassable.
import { readFileSync } from 'fs';
import { bfsLayer, findOrphanRooms, findEntrances } from './lib/connectivity.mjs';

const d = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
const field = (d.layers && d.layers.field) || d.field;
const stages = field.stages;

const startStage = (d.startPos && d.startPos.stage) || '1,0';
const startR = d.startPos?.row ?? 2, startC = d.startPos?.col ?? 2;
console.log('start:', startStage, `(row ${startR}, col ${startC})`,
            '=>', JSON.stringify(stages[startStage].tiles[startR][startC]));

const { reachedRooms, deadEdges, entrances } = bfsLayer(stages,
  { stage: startStage, row: startR, col: startC });

console.log('\nReached field stages:', [...reachedRooms].sort().join('  '));
const unreached = Object.keys(stages).filter(k => !reachedRooms.has(k));
console.log('UNREACHED stages    :', unreached.join('  ') || '(none)');

// True orphans: unreachable even with every gimmick gate open + teleports.
const { orphans } = findOrphanRooms(stages, findEntrances(d, 'field'));
if (orphans.length) {
  console.log('\n❌ ORPHAN stages (can NEVER be entered — sealed, not just gated):', orphans.join('  '));
} else {
  console.log('✅ no orphan stages (all reachable once gates are open)');
}

if (deadEdges.length) {
  console.log('\n⚠️ DEAD EDGES (open border but arrival walled / no stage):');
  for (const e of deadEdges)
    console.log(`  ${e.from} ${e.dir} → ${e.to} @ ${e.at}  [${e.reason}${e.tile ? ` '${e.tile}'` : ''}]`);
} else {
  console.log('\n✅ no dead edges');
}

console.log('\nDungeon entrances (✓ reachable on foot from start):');
for (const sk of Object.keys(stages).sort()) {
  const me = stages[sk].mapEnters || {};
  for (const pos of Object.keys(me)) {
    const id = me[pos].destId;
    if (!id) continue;
    const reached = entrances.has(id);
    console.log(`  ${reached ? '✓' : '✗'} ${id.padEnd(14)} field ${sk} @ ${pos}` +
                (reached ? '' : '  [UNREACHABLE]'));
  }
}
