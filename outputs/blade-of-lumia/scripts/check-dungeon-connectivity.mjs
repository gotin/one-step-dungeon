// Phase 9-2 support: verify a dungeon's room connectivity at the TILE level.
// Mirrors game/game.js checkStageTransition (sx/sy edge-scroll) and
// game/passable.js tilePassable, so it catches the real "edge openings don't
// line up" bug — not just graph adjacency. Walks 4-dir within a stage and
// crosses to adjacent stages by stepping off an edge.
//
// Usage: node scripts/check-dungeon-connectivity.mjs dungeon_2 [--item-gate=boomerang]
//   Reports: reachable rooms from entry, boss-room single-entry check, and
//   (with an item gate) whether blocking the gate room cuts off the boss.
import { readFileSync } from 'fs';

const layerName = process.argv[2] || 'dungeon_2';
const d = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
const layer = d.layers[layerName];
if (!layer) { console.error(`layer not found: ${layerName}`); process.exit(1); }
const stages = layer.stages;

// Blocked-on-foot tiles (mirrors passable.js with no keys/switches/subitems).
// A closed DOOR(D)/GATE(T)/BREAKABLE(!)/WATER(~)/PIT(x)/SKY(%) blocks the path —
// which is what we WANT when proving "you cannot reach the boss without X".
const BLOCKED = new Set([
  '#','~','%','T','D','!','*','t','M','u','f','h','p','i','|','x',
  ':','S','Y','[',']','(',')',  // boss-doorway & switches treated as walls for pure-walk reachability
]);
const isBlocked = (ch) => ch !== undefined && ch !== ' ' && BLOCKED.has(ch);

// Find the room that contains a given role by tile char (first match).
function findRoomWithTile(ch) {
  for (const sk of Object.keys(stages)) {
    const t = stages[sk].tiles;
    for (let r = 0; r < t.length; r++) for (let c = 0; c < t[0].length; c++)
      if (t[r][c] === ch) return { sk, r, c };
  }
  return null;
}

function bfs(startSk, startR, startC, blockedRoom) {
  const seenCells = new Set(), reachedRooms = new Set(), q = [[startSk, startR, startC]];
  const key = (sk, r, c) => `${sk}:${r},${c}`;
  const enq = (sk, r, c) => {
    if (sk === blockedRoom) return;
    const st = stages[sk]; if (!st) return;
    if (r < 0 || c < 0 || r >= st.rows || c >= st.cols) return;
    if (isBlocked(st.tiles[r][c])) return;
    const k = key(sk, r, c); if (seenCells.has(k)) return;
    seenCells.add(k); q.push([sk, r, c]);
  };
  enq(startSk, startR, startC);
  while (q.length) {
    const [sk, r, c] = q.shift();
    reachedRooms.add(sk);
    const st = stages[sk];
    const [sx, sy] = sk.split(',').map(Number);
    enq(sk, r-1, c); enq(sk, r+1, c); enq(sk, r, c-1); enq(sk, r, c+1);
    if (r === 0)          enq(`${sx},${sy-1}`, st.rows-1, c);
    if (r === st.rows-1)  enq(`${sx},${sy+1}`, 0, c);
    if (c === 0)          enq(`${sx-1},${sy}`, r, st.cols-1);
    if (c === st.cols-1)  enq(`${sx+1},${sy}`, r, 0);
  }
  return reachedRooms;
}

// Entry room = the one with a '>' MAP_ENTER back to the field, else the @ start.
let entry = null;
for (const sk of Object.keys(stages)) {
  const me = stages[sk].mapEnters || {};
  if (Object.values(me).some(m => /field/.test(m.destId || ''))) { entry = sk; break; }
}
if (!entry) { const p = findRoomWithTile('@'); entry = p?.sk ?? Object.keys(stages)[0]; }
const [esx, esy] = entry.split(',').map(Number);
// start at a passable cell in the entry room
let er = 1, ec = 1; const et = stages[entry].tiles;
outer: for (let r = 0; r < et.length; r++) for (let c = 0; c < et[0].length; c++)
  if (!isBlocked(et[r][c])) { er = r; ec = c; break outer; }

console.log(`Layer: ${layerName} — ${Object.keys(stages).length} rooms. Entry: ${entry}`);

const allRooms = new Set(Object.keys(stages));
const reached = bfs(entry, er, ec, null);
const unreached = [...allRooms].filter(r => !reached.has(r));
console.log(`Reached from entry (walls/doors closed): ${[...reached].sort().join(' ')}`);
console.log(`Unreached (need door/switch/subitem):    ${unreached.join(' ') || '(none)'}`);

// Boss room: isBossRoom flag
const bossRoom = Object.keys(stages).find(sk => stages[sk].isBossRoom);
if (bossRoom) {
  const [bx, by] = bossRoom.split(',').map(Number);
  const neighbors = [[bx+1,by],[bx-1,by],[bx,by+1],[bx,by-1]]
    .map(([x,y]) => `${x},${y}`).filter(k => stages[k]);
  console.log(`\nBoss room: ${bossRoom}  grid-neighbors with a stage: ${neighbors.join(' ') || '(none)'}`);
  console.log(`  (only the intended single entry should actually have lined-up edge openings)`);
}

// Item-gate check: blocking the gate room must cut the boss off.
const gateArg = process.argv.find(a => a.startsWith('--block-room='));
if (gateArg && bossRoom) {
  const blocked = gateArg.split('=')[1];
  const r2 = bfs(entry, er, ec, blocked);
  const cut = !r2.has(bossRoom);
  console.log(`\nBlocking room ${blocked}: boss ${bossRoom} reachable? ${r2.has(bossRoom)}  ` +
              `=> ${cut ? '✅ gate holds (boss cut off)' : '❌ boss reachable via detour'}`);
}
