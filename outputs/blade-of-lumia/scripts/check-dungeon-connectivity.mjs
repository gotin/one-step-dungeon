// Phase 9-2 support: verify a dungeon's room connectivity at the TILE level.
// Uses the shared core (scripts/lib/connectivity.mjs) which mirrors
// game/game.js checkStageTransition (sx/sy edge-scroll) and game/passable.js
// tilePassable — so it catches the real "edge openings don't line up" bug
// (dead edges) and orphan rooms, not just graph adjacency.
//
// Usage: node scripts/check-dungeon-connectivity.mjs dungeon_2 [--block-room=1,1]
//   Reports: reachable rooms from entry, dead edges (arrival walled / no stage),
//   orphan rooms, boss-room single-entry check, and (with --block-room) whether
//   blocking the gate room cuts off the boss (critical-path one-way check).
import { readFileSync } from 'fs';
import {
  bfsLayer, checkGridAdjacency, firstWalkable, findEntrances, findOrphanRooms,
} from './lib/connectivity.mjs';

const layerName = process.argv[2] || 'dungeon_2';
const d = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
const layer = d.layers[layerName];
if (!layer) { console.error(`layer not found: ${layerName}`); process.exit(1); }
const stages = layer.stages;

let problems = 0;

// External entrances: rooms the OUTSIDE world teleports into (a dungeon may have
// several). "Dead" = unreachable from the UNION of all entrances.
const entrances = findEntrances(d, layerName);
console.log(`Layer: ${layerName} — ${Object.keys(stages).length} rooms. Entrances: ${entrances.join(' ') || '(none found!)'}`);
if (entrances.length === 0) {
  problems++;
  console.log(`\n❌ NO EXTERNAL ENTRANCE — no other layer's destId points into ${layerName} (you can't get in at all).`);
}

// Pure-walk reachability from each entrance (gates CLOSED) — informational; the
// union shows what's reachable on foot before opening anything.
const reachedRooms = new Set();
const deadEdges = [];
for (const e of entrances) {
  const r = bfsLayer(stages, { stage: e, ...firstWalkable(stages[e]) });
  for (const k of r.reachedRooms) reachedRooms.add(k);
  deadEdges.push(...r.deadEdges);
}
const allRooms = new Set(Object.keys(stages));
const unreached = [...allRooms].filter(r => !reachedRooms.has(r));
console.log(`Reached on foot (gates closed):           ${[...reachedRooms].sort().join(' ') || '(none)'}`);
console.log(`Unreached (gated OR orphan — see below):  ${unreached.join(' ') || '(none)'}`);

// Grid adjacency (edges always point at grid neighbors by construction; report anomalies).
const badAdj = checkGridAdjacency(stages);
if (badAdj.length) {
  problems += badAdj.length;
  console.log(`\n⚠️ non-adjacent edges: ${badAdj.map(b => `${b.from}->${b.to}`).join(' ')}`);
}

// TRUE ORPHANS: rooms unreachable even with EVERY gate open + teleports followed.
// This is the real defect (e.g. a fully wall-boxed room with no mapEnter) that
// pure-walk reachability hides inside "unreached (gated)". A gated-but-reachable
// room is NOT an orphan.
const { orphans } = findOrphanRooms(stages, entrances);
if (orphans.length) {
  problems += orphans.length;
  console.log(`\n❌ ORPHAN ROOMS (unreachable from ANY entrance, even with all gates open + teleports):`);
  console.log(`   ${orphans.join(' ')}`);
  console.log(`   → connect an edge/teleport from the reachable area, or remove the room. (gated rooms are fine; these aren't gated, they're cut off — even rooms that reach each other but not the entrance count.)`);
} else {
  console.log(`\n✅ no orphan rooms (every room is reachable once its gates are opened)`);
}

// Dead edges = stepped off an open edge but arrival is a wall / missing stage.
if (deadEdges.length) {
  problems += deadEdges.length;
  console.log(`\n⚠️ DEAD EDGES (open edge, but you can't actually cross — clamp/stuck):`);
  for (const e of deadEdges)
    console.log(`  ${e.from} ${e.dir} → ${e.to} @ ${e.at}  [${e.reason}${e.tile ? ` '${e.tile}'` : ''}]`);
} else {
  console.log(`\n✅ no dead edges (every open border lines up with a walkable arrival)`);
}

// Boss room: isBossRoom flag — only the intended single entry should line up.
const bossRoom = Object.keys(stages).find(sk => stages[sk].isBossRoom);
if (bossRoom) {
  const [bx, by] = bossRoom.split(',').map(Number);
  const neighbors = [[bx + 1, by], [bx - 1, by], [bx, by + 1], [bx, by - 1]]
    .map(([x, y]) => `${x},${y}`).filter(k => stages[k]);
  console.log(`\nBoss room: ${bossRoom}  grid-neighbors with a stage: ${neighbors.join(' ') || '(none)'}`);
  console.log(`  (only the intended single entry should actually have lined-up edge openings)`);
}

// Item-gate / critical-path check: blocking the gate room must cut the boss off.
const gateArg = process.argv.find(a => a.startsWith('--block-room='));
if (gateArg && bossRoom) {
  const blocked = gateArg.split('=')[1];
  const reached = new Set();
  for (const e of entrances) {
    const { reachedRooms: r2 } = bfsLayer(stages, { stage: e, ...firstWalkable(stages[e]) },
                                          { blockedRoom: blocked });
    for (const k of r2) reached.add(k);
  }
  const cut = !reached.has(bossRoom);
  console.log(`\nBlocking room ${blocked}: boss ${bossRoom} reachable? ${reached.has(bossRoom)}  ` +
              `=> ${cut ? '✅ gate holds (boss cut off)' : '❌ boss reachable via detour'}`);
}

// Overall verdict (non-zero exit so CI / scripts can gate on it).
console.log(`\n${problems === 0 ? '✅ PASS' : `❌ FAIL — ${problems} connectivity problem(s)`}`);
if (problems > 0) process.exitCode = 1;
