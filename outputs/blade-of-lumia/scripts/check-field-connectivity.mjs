// Phase 2-4 / 9-2pre support: BFS over the field world map to verify every
// dungeon entrance is reachable on foot from the start village, and that no edge
// strands the player. Uses the shared core (scripts/lib/connectivity.mjs) which
// mirrors game.js checkStageTransition + game/passable.js tilePassable.
import { readFileSync } from 'fs';
import { bfsLayer, findOrphanRooms, findEntrances, isBlocked } from './lib/connectivity.mjs';

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

// ── 9-6 HONEST METRICS ──────────────────────────────────────────────────────
// The raw deadEdges count (~1203) is NOT trustworthy for gauging 9-6 progress:
// it counts edges that lead into orphan screens and into intended world-border
// screens (all-water / all-mountain) that the player can never step onto anyway.
// Split it into meaningful buckets so we know the REAL scope of "実際に踏める接続ミス".
//
//   W1 = screens with zero walkable cells (can't stand anywhere) — intended
//        world border OR a broken all-blocked screen, depending on design intent.
//   W2 = orphan screens (walkable but unreachable from the village).
//   HONEST SEAM BUGS = a dead edge whose DESTINATION is a real playable screen
//        (reachable, not W1, not orphan) yet the seam lands you on a wall → the
//        genuine "隣に行けない/めり込む" defect the user pointed at. This is the
//        number 9-6 must drive to 0 (subject to the pending B-policy decision on
//        whether the outer ring is "border" or "waste to rebuild").
const orphanSet = new Set(orphans);
const w1 = [];
for (const k of Object.keys(stages)) {
  const s = stages[k];
  let anyWalk = false;
  for (let r = 0; r < s.rows && !anyWalk; r++)
    for (let c = 0; c < s.cols; c++)
      if (!isBlocked(s.tiles[r]?.[c])) { anyWalk = true; break; }
  if (!anyWalk) w1.push(k);
}
const w1Set = new Set(w1);
const honestSeams = new Set();
for (const e of deadEdges) {
  if (!stages[e.to]) continue;      // no stage there → world edge, not a seam bug
  if (w1Set.has(e.to)) continue;    // dest is all-blocked → intended border
  if (orphanSet.has(e.to)) continue;// dest never enterable → separate (W2) class
  honestSeams.add(`${e.from} -> ${e.to}`);
}
console.log('\n── 9-6 honest metrics (see script comment) ──');
console.log(`  raw dead edges              : ${deadEdges.length}  (NOT a real defect count)`);
console.log(`  W1 all-blocked screens      : ${w1.length}`);
console.log(`  W2 orphan screens           : ${orphans.length}`);
console.log(`  HONEST seam bugs (→ 0 goal) : ${honestSeams.size} distinct screen-pairs`);
if (honestSeams.size)
  console.log('    ' + [...honestSeams].sort().join('  '));

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
