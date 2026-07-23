// Phase 9-2pre: shared stage-connectivity core (single source of truth).
//
// Same-map (field / dungeon_*) room connectivity is fully machine-checkable.
// This module mirrors game/game.js checkStageTransition (sx/sy edge-scroll) and
// game/passable.js tilePassable, so it catches the REAL bugs that the engine
// itself doesn't guard against:
//   - "dead edge": you step off an open edge but the arrival cell is a wall (or
//     there's no stage there) → you get stuck / clamped → it FEELS broken.
//   - "orphan stage": a room no path can ever reach from the entry.
//
// Both check-dungeon-connectivity.mjs and check-field-connectivity.mjs (and the
// connectivity-tool tests) import from here, so the BLOCKED rule lives in ONE
// place instead of being hand-copied per script.
import { TILE } from '../../shared/tiles.js';
import { NPC_SPRITE_MAP } from '../../shared/npcs.js';

// (HARD_BLOCKED / SOLVABLE_GATES / BLOCKED defined below.)

// Two distinct categories, because "blocks the pure walk" and "is a real dead
// end" are NOT the same thing:
//
//  HARD_BLOCKED — never passable on foot and NOT openable by anything: walls,
//    water, trees, signs, NPCs, etc. Arriving on one of these after an edge
//    crossing is a genuine "stuck / clamped" bug (a DEAD EDGE).
//
//  SOLVABLE_GATES — closed now but the player can open / walk through them
//    (key-door, switch-gate, bomb-wall, boss-doorway). These BLOCK the pure walk
//    (so reachability shows what's gated), but landing on one at a border is NOT
//    a dead-edge bug — it's a legitimate gated passage.
//
// BLOCKED = HARD_BLOCKED ∪ SOLVABLE_GATES is what pure-walk reachability uses.
// Mirrors game/passable.js tilePassable (which returns false for SIGN and NPC
// tiles even though TILE_META marks some passable:true — derive from behavior).

// Tiles that are passable WITH a ladder (water/pit = 1-cell bridge only).
// Mirrors game/passable.js LADDER_OVER.
export const LADDER_OVER = new Set([TILE.WATER, TILE.PIT]);  // 溶岩は含めない（はしごで渡れない）

export const HARD_BLOCKED = new Set([
  TILE.WALL,            // '#'
  TILE.WATER,           // '~'
  TILE.LAVA,            // 'l' (same as water: blocks foot, flyable/ladder-crossable)
  TILE.SKY,             // '%' (flight-only)
  TILE.PIT,             // 'x' (ladder-only)
  TILE.DOORWAY_LOCKED,  // '|' (dead code — never opens => effectively a wall)
  TILE.SWITCH,          // 'Y' (struck by weapon; blocks the cell)
  TILE.SWITCH_RED,      // '['
  TILE.SWITCH_BLUE,     // ']'
  TILE.STONE,           // '*' (pushable but blocks until pushed)
  TILE.TREE,            // 't'
  TILE.MOUNTAIN,        // 'M'
  TILE.BUSH,            // 'u' (until cut)
  TILE.FENCE,           // 'f'
  TILE.HOUSE_WALL,      // 'h'
  TILE.HOUSE_ROOF,      // 'p'
  TILE.SIGN,            // 'i' (passable:false in passable.js — read, don't stand)
  TILE.TORCH,           // 'H' (passable:false)
]);

// NPC tiles (a/b/$ and princess) are not standable in passable.js.
for (const ch of Object.keys(NPC_SPRITE_MAP)) HARD_BLOCKED.add(ch);

// Closed-but-openable gates / walk-through doorways. Block the walk, not a bug.
export const SOLVABLE_GATES = new Set([
  TILE.DOOR,            // 'D' (opens with key)
  TILE.GATE,            // 'T' (opens with switch/button)
  TILE.GATE_RED,        // '(' (opens with activeColor)
  TILE.GATE_BLUE,       // ')'
  TILE.BREAKABLE_WALL,  // '!' (breaks with bomb)
  TILE.DOORWAY_BOSS,    // ':' (walk-through; locks only AFTER entering)
  TILE.TIDE_GATE,       // '=' (Phase 9-6 深洋O: opens via switch/button — tide recedes)
]);

export const BLOCKED = new Set([...HARD_BLOCKED, ...SOLVABLE_GATES]);

/** A tile char blocks the pure walk? (undefined / ' ' = empty floor = walkable.) */
export function isBlocked(ch) {
  if (ch === undefined || ch === ' ') return false;
  return BLOCKED.has(ch);
}

/** A tile char is a genuine wall (arrival here after a crossing = dead edge)? */
export function isHardBlocked(ch) {
  if (ch === undefined || ch === ' ') return false;
  return HARD_BLOCKED.has(ch);
}

/**
 * Mirrors game/passable.js isLadderBridge: a WATER/PIT cell is crossable with a
 * ladder only if the cells on BOTH sides along one axis are non-water/pit floor.
 * (2-wide water blocks crossing — the far side's neighbor is also water.)
 *
 * @param {string[][]} tiles  the stage tile grid
 * @param {number} rows
 * @param {number} cols
 * @param {number} r
 * @param {number} c
 */
export function isLadderBridgeCell(tiles, rows, cols, r, c) {
  const bank = (br, bc) => {
    if (br < 0 || br >= rows || bc < 0 || bc >= cols) return false;
    const t = tiles[br]?.[bc];
    if (t === undefined || t === ' ') return true;   // empty floor
    return !HARD_BLOCKED.has(t) && !SOLVABLE_GATES.has(t) && !LADDER_OVER.has(t);
  };
  // vertical bridge: above and below are both land
  if (bank(r - 1, c) && bank(r + 1, c)) return true;
  // horizontal bridge: left and right are both land
  if (bank(r, c - 1) && bank(r, c + 1)) return true;
  return false;
}

const sk = (sx, sy) => `${sx},${sy}`;
const parse = (key) => key.split(',').map(Number);

/**
 * BFS the walkable cells across a layer's stages, crossing edges exactly the way
 * game.js checkStageTransition does (step off an edge → arrive at the opposite
 * edge of the grid-adjacent stage, preserving the cross-axis coordinate).
 *
 * @param {object} stages  layer.stages map ("sx,sy" -> {rows,cols,tiles,...})
 * @param {{stage:string,row:number,col:number}} start
 * @param {{blockedRoom?:string, withLadder?:boolean}} [opts]
 *   withLadder: treat 1-cell-wide WATER/PIT bridge cells as walkable (mirrors
 *   having the ladder item). Used to verify D5-style "ladder crossing" gates.
 * @returns {{
 *   reachedRooms:Set<string>, reachedCells:Set<string>,
 *   deadEdges:Array<object>, entrances:Set<string>
 * }}
 *   deadEdges: stepped off an OPEN edge cell but the arrival was a wall or a
 *   missing stage → the engine would clamp/stick the player ("隣に行けない/めり込む").
 */
export function bfsLayer(stages, start, opts = {}) {
  const { blockedRoom = null, withLadder = false } = opts;
  const reachedRooms = new Set();
  const reachedCells = new Set();
  const entrances = new Set();
  const deadEdges = [];
  const seenEdge = new Set();
  const q = [];
  const cellKey = (k, r, c) => `${k}:${r},${c}`;

  const enq = (k, r, c) => {
    if (k === blockedRoom) return false;
    const s = stages[k];
    if (!s) return false;
    if (r < 0 || c < 0 || r >= s.rows || c >= s.cols) return false;
    const ch = s.tiles[r]?.[c];
    if (isBlocked(ch)) {
      // With ladder: a 1-cell-wide WATER/PIT bridge is passable.
      if (withLadder && LADDER_OVER.has(ch) &&
          isLadderBridgeCell(s.tiles, s.rows, s.cols, r, c)) {
        // falls through to enqueue
      } else {
        return false;
      }
    }
    const ck = cellKey(k, r, c);
    if (reachedCells.has(ck)) return true; // already walkable & queued
    reachedCells.add(ck);
    q.push([k, r, c]);
    return true;
  };

  // Record an edge crossing. A DEAD EDGE = you stepped off an open edge cell but
  // the arrival is a genuine wall (hard-blocked) or there's no stage / it's OOB
  // → the engine clamps you at the border ("隣に行けない/めり込む"). Landing on a
  // SOLVABLE gate (door/gate/breakable/boss-doorway) is NOT a dead edge — it's a
  // legitimate gated passage, so we don't warn and we don't walk through it here
  // (reachability keeps it gated so --block-room analysis stays meaningful).
  const cross = (fromK, dir, toK, r, c) => {
    const eid = `${fromK}|${dir}|${r},${c}`;
    if (seenEdge.has(eid)) return;
    seenEdge.add(eid);
    const dest = stages[toK];
    if (!dest) {
      deadEdges.push({ from: fromK, dir, to: toK, at: `${r},${c}`, reason: 'no-stage' });
      return;
    }
    if (r < 0 || c < 0 || r >= dest.rows || c >= dest.cols) {
      deadEdges.push({ from: fromK, dir, to: toK, at: `${r},${c}`, reason: 'oob' });
      return;
    }
    const arrival = dest.tiles[r]?.[c];
    if (isHardBlocked(arrival)) {
      // With ladder: a 1-cell-wide WATER/PIT bridge at the border is not a dead
      // edge — it's a legitimate ladder crossing (enq will handle passability).
      if (withLadder && LADDER_OVER.has(arrival) &&
          isLadderBridgeCell(dest.tiles, dest.rows, dest.cols, r, c)) {
        enq(toK, r, c);
        return;
      }
      deadEdges.push({ from: fromK, dir, to: toK, at: `${r},${c}`,
                       reason: 'arrival-wall', tile: arrival });
      return;
    }
    enq(toK, r, c); // walkable arrival, or a solvable gate (enq's isBlocked gates it)
  };

  enq(start.stage, start.row, start.col);

  while (q.length) {
    const [k, r, c] = q.shift();
    reachedRooms.add(k);
    const s = stages[k];
    const ch = s.tiles[r]?.[c];
    if (ch === TILE.MAP_ENTER) {
      const me = s.mapEnters?.[`${r},${c}`];
      if (me?.destId) entrances.add(me.destId);
    }
    const [sx, sy] = parse(k);
    enq(k, r - 1, c); enq(k, r + 1, c); enq(k, r, c - 1); enq(k, r, c + 1);
    // Edge crossings (mirror checkStageTransition: vertical keeps col, horizontal keeps row).
    if (r === 0)          cross(k, 'up',    sk(sx, sy - 1), s.rows - 1, c);
    if (r === s.rows - 1) cross(k, 'down',  sk(sx, sy + 1), 0, c);
    if (c === 0)          cross(k, 'left',  sk(sx - 1, sy), r, s.cols - 1);
    if (c === s.cols - 1) cross(k, 'right', sk(sx + 1, sy), r, 0);
  }

  return { reachedRooms, reachedCells, deadEdges, entrances };
}

/**
 * Find the TRUE external entrances of a layer: rooms that hold a MAP_ENTER whose
 * `id` is referenced by some OTHER layer's `destId` (i.e. you can teleport INTO
 * this layer there — a field door / stair / warp from the outside world). A
 * layer may legitimately have MULTIPLE entrances. Internal back-and-forth stairs
 * (an id only referenced from within the same layer) are NOT external entrances.
 *
 * For the field layer there is no outside world, so the entrance is the player's
 * startPos (passed via mapData.startPos).
 *
 * @param {object} mapData  the whole map (needs all layers to see cross refs)
 * @param {string} layerName
 * @returns {string[]} room keys ("sx,sy") that are external entrances
 */
export function findEntrances(mapData, layerName) {
  const layers = mapData.layers || {};
  const stages = layers[layerName]?.stages || {};

  if (layerName === 'field') {
    const sp = mapData.startPos;
    if (sp?.stage && stages[sp.stage]) return [sp.stage];
    // fallback: room with '@'
    const at = findEntryRoom(stages);
    return at ? [at] : [];
  }

  // destIds referenced from OTHER layers (the outside world pointing in).
  const externalDest = new Set();
  for (const ln of Object.keys(layers)) {
    if (ln === layerName) continue;
    for (const st of Object.values(layers[ln].stages || {}))
      for (const e of Object.values(st.mapEnters || {}))
        if (e.destId) externalDest.add(e.destId);
  }
  const entrances = new Set();
  for (const k of Object.keys(stages))
    for (const e of Object.values(stages[k].mapEnters || {}))
      if (e.id && externalDest.has(e.id)) entrances.add(k);

  // Fallback (no external ref found): the field/exit heuristic, then '@'.
  if (entrances.size === 0) {
    const guess = findEntryRoom(stages);
    if (guess) entrances.add(guess);
  }
  return [...entrances];
}

/**
 * Find TRUE ORPHAN rooms: rooms that can NEVER be entered from ANY of the
 * layer's external entrances, even with every solvable gate (door/gate/
 * breakable/boss-doorway) open AND every MAP_ENTER teleport followed.
 *
 * This is the bug class behind dungeon_1's [3,0]/[4,0]/[5,0]: rooms wall-boxed
 * (or only connected to each other) with no path back to the dungeon entrance.
 * [3,0]<->[4,0] can reach EACH OTHER, but neither connects to the entrance at
 * [0,0] — so both are dead. The definition is "unreachable from the union of
 * all entrances", which is why we BFS from every entrance at once.
 *
 * Difference from bfsLayer().reachedRooms: that BFS keeps gates CLOSED (so a
 * key-door room shows as "unreached" — fine, it's reachable once keyed). Here
 * gates are treated OPEN, so whatever is STILL unreached is a real defect.
 *
 * @param {object} stages   layer.stages
 * @param {string[]|string} entrances  entrance room key(s). Pass the result of
 *   findEntrances(mapData, layerName). A bare string is accepted for one entrance.
 * @returns {{ orphans:string[], reachable:Set<string>, entrances:string[] }}
 */
export function findOrphanRooms(stages, entrances) {
  let entryList = Array.isArray(entrances) ? entrances.slice()
                : entrances ? [entrances] : [];
  // Backward-compatible fallback if no entrances supplied.
  if (entryList.length === 0) {
    const guess = findEntryRoom(stages);
    if (guess) entryList = [guess];
  }
  entryList = entryList.filter(k => stages[k]);

  // id -> room that contains a MAP_ENTER with that id (teleport destinations).
  const idRoom = {};
  for (const k of Object.keys(stages))
    for (const e of Object.values(stages[k].mapEnters || {}))
      if (e.id) idRoom[e.id] = k;

  // Walkable-or-solvable-gate cell? (gates count as open for orphan analysis)
  // Ladder-bridge WATER/PIT cells (1-cell-wide with land on both sides along one
  // axis) are also treated as passable — the ladder item is always reachable inside
  // the dungeon, so these are "soft gates" equivalent to key-doors for the purpose
  // of orphan analysis. Multi-cell water/pit remains hard-blocked.
  const passOpenCell = (s, r, c) => {
    const ch = s.tiles[r]?.[c];
    if (!isHardBlocked(ch)) return true;
    if (LADDER_OVER.has(ch) && isLadderBridgeCell(s.tiles, s.rows, s.cols, r, c)) return true;
    return false;
  };

  const adj = {};
  for (const k of Object.keys(stages)) adj[k] = new Set();
  const edgeCells = (s, side) => {
    const { rows, cols } = s;
    if (side === 'top')    return Array.from({ length: cols }, (_, c) => [0, c]);
    if (side === 'bottom') return Array.from({ length: cols }, (_, c) => [rows - 1, c]);
    if (side === 'left')   return Array.from({ length: rows }, (_, r) => [r, 0]);
    return Array.from({ length: rows }, (_, r) => [r, cols - 1]);
  };
  const opp = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const dlt = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

  for (const k of Object.keys(stages)) {
    const [sx, sy] = parse(k);
    const s = stages[k];
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const [dx, dy] = dlt[side];
      const nk = sk(sx + dx, sy + dy);
      const ns = stages[nk];
      if (!ns) continue;
      const a = edgeCells(s, side), b = edgeCells(ns, opp[side]);
      for (let i = 0; i < a.length; i++) {
        const [r, c] = a[i], [nr, nc] = b[i];
        if (passOpenCell(s, r, c) && passOpenCell(ns, nr, nc)) {
          adj[k].add(nk); adj[nk].add(k);
        }
      }
    }
    // MAP_ENTER teleports (one-directional jump to the room holding destId).
    for (const e of Object.values(s.mapEnters || {}))
      if (e.destId && idRoom[e.destId]) adj[k].add(idRoom[e.destId]);
  }

  // BFS from the UNION of all entrances (a room is dead only if NO entrance reaches it).
  const reachable = new Set(entryList);
  const q = [...entryList];
  while (q.length) {
    const x = q.shift();
    for (const y of adj[x] || []) if (!reachable.has(y)) { reachable.add(y); q.push(y); }
  }
  const orphans = Object.keys(stages).filter(k => !reachable.has(k)).sort();
  return { orphans, reachable, entrances: entryList };
}

/** Verify every edge of every stage points at a grid-adjacent stage. */
export function checkGridAdjacency(stages) {
  const bad = [];
  for (const k of Object.keys(stages)) {
    const [sx, sy] = parse(k);
    for (const [dir, nk] of [
      ['up', sk(sx, sy - 1)], ['down', sk(sx, sy + 1)],
      ['left', sk(sx - 1, sy)], ['right', sk(sx + 1, sy)],
    ]) {
      if (!stages[nk]) continue;
      const [nx, ny] = parse(nk);
      if (Math.abs(sx - nx) + Math.abs(sy - ny) !== 1) bad.push({ from: k, dir, to: nk });
    }
  }
  return bad; // empty = all good (grid neighbors are always adjacent by construction)
}

/** Find the first cell of a stage that is walkable (for picking a BFS start). */
export function firstWalkable(stage) {
  for (let r = 0; r < stage.rows; r++)
    for (let c = 0; c < stage.cols; c++)
      if (!isBlocked(stage.tiles[r]?.[c])) return { row: r, col: c };
  return { row: 1, col: 1 };
}

/**
 * Pick the entry room of a dungeon layer: the room whose mapEnters has a '>' back
 * to a field/exit. Falls back to the '@' player-start tile, then first room.
 */
export function findEntryRoom(stages) {
  for (const k of Object.keys(stages)) {
    const me = stages[k].mapEnters || {};
    if (Object.values(me).some(m => /field|exit/.test(m.destId || ''))) return k;
  }
  for (const k of Object.keys(stages)) {
    const t = stages[k].tiles;
    for (let r = 0; r < t.length; r++)
      for (let c = 0; c < (t[0]?.length || 0); c++)
        if (t[r][c] === TILE.PLAYER) return k;
  }
  return Object.keys(stages)[0];
}
