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

/**
 * The EFFECTIVE tile at (r,c) for walk analysis, folding the bgTiles water underlay
 * into the tiles layer. Mirrors game/passable.js isWaterAt: a cell is water if the
 * tiles layer is '~' OR the bgTiles layer is '~'. Phase 9-6 深洋O put water on the
 * bgTiles layer (so enemies can stand on it), so a stage whose tiles cell is FLOOR
 * but whose bgTiles cell is '~' must be treated as water here too — otherwise the
 * checker would call it walkable while the engine blocks it (a false green).
 * Any non-water bgTiles value is ignored (only the tiles char carries walls/gates).
 */
export function cellTile(stage, r, c) {
  const ch = stage.tiles[r]?.[c];
  if (ch === TILE.WATER) return ch;                        // already water
  if (stage.bgTiles?.[`${r},${c}`] === TILE.WATER) return TILE.WATER; // water underlay
  return ch;
}

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
export function isLadderBridgeCell(tiles, rows, cols, r, c, bgTiles = null) {
  const bank = (br, bc) => {
    if (br < 0 || br >= rows || bc < 0 || bc >= cols) return false;
    // Phase 9-6: a bank cell that is bgTiles water is NOT land (mirrors passable.js
    // isLadderBank, which excludes bgTiles water underlay from being a bridge pier).
    if (bgTiles?.[`${br},${bc}`] === TILE.WATER) return false;
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

/**
 * Where an edge crossing actually DROPS the player — the exact mirror of
 * game.js checkStageTransition.
 *
 *   if (y < 0)          newRow = rows - 1   // up    → 9 with rows=10
 *   else if (y >= rows) newRow = 0          // down  → 0
 *   else if (x < 0)     newCol = cols - 1   // left  → 11 with cols=12
 *   else if (x >= cols) newCol = 0          // right → 0
 *
 * ⚠️ 2026-07-29 ⑥-landing: these were HALF-CELL offsets (0.5 / rows-1.5) until the
 * engine was changed to land on the boundary cell itself. The half-cell landing made
 * the player's 1-cell hitbox straddle the boundary row/col AND one row/col inward,
 * which caused two opposite bugs at once: a wall one row inward silently cancelled the
 * crossing (68 "見えない壁" map-wide), and a CLOSED gate on the boundary cell could be
 * walked through (the hitbox rested half on the floor behind it). Integer landing makes
 * the footprint exactly one cell, so both classes are structurally impossible.
 *
 * The cross-axis coordinate is preserved (the player's own x/y), so we keep the
 * integer cell the BFS crossed at.
 *
 * @param {string} dir  'up' | 'down' | 'left' | 'right'
 * @param {object} dest destination stage ({rows, cols, ...})
 * @param {number} r    arrival cell row    (the cell bfsLayer crossed into)
 * @param {number} c    arrival cell column
 * @returns {{row:number, col:number}} landing coords for the footprint test
 */
export function edgeLanding(dir, dest, r, c) {
  if (dir === 'up')    return { row: dest.rows - 1, col: c };
  if (dir === 'down')  return { row: 0, col: c };
  if (dir === 'left')  return { row: r, col: dest.cols - 1 };
  return { row: r, col: 0 };   // 'right'
}

/**
 * Does the arrival FOOTPRINT contain a wall? The single source of truth mirroring
 * game.js arrivalIsWall (2026-07-27 ⑥-footprint).
 *
 * 🔑 History — why this is a footprint scan at all. Until 2026-07-29 the engine landed
 * the player HALF a cell inside the border, so their 1-cell hitbox straddled the
 * BOUNDARY row/col AND ONE ROW/COL INWARD (floor(v)..floor(v+0.999)). The engine cancels
 * the transition if ANY of those cells is a wall, so an edge whose boundary cell was open
 * but whose second row/col held a stone/switch/sign was a "見えない壁": the player walked
 * into it and was silently pushed back. 72 such crossings existed map-wide while every
 * checker reported traps = 0, because the old 1-cell check could not see them.
 *
 * ⚠️ ⑥-landing (2026-07-29) made the engine land on the boundary cell itself, so the
 * footprint is now exactly ONE cell and this test collapses into the 1-cell check —
 * i.e. footprintBlockedEdges() is 0 BY CONSTRUCTION, not because the data was fixed.
 * The scan is kept as the ENGINE↔CHECKER SYNC GUARD: it stays a faithful mirror of
 * game.js arrivalIsWall, so if the landing ever drifts back off the boundary cell, the
 * whole class of invisible walls is enumerated again instead of silently reappearing.
 *
 * @param {object} dest  destination stage (rows/cols/tiles/bgTiles)
 * @param {number} nRow  float landing row (see edgeLanding)
 * @param {number} nCol  float landing column
 * @param {{withLadder?:boolean}} [opts]  withLadder mirrors player.hasLadder: a
 *   1-cell-wide WATER/PIT bridge cell in the footprint is a legitimate crossing.
 * @returns {Array<{r:number,c:number,tile:string}>} blocking cells (empty = clear)
 */
export function arrivalFootprintBlocked(dest, nRow, nCol, opts = {}) {
  const { withLadder = false } = opts;
  const r0 = Math.floor(nRow), r1 = Math.floor(nRow + 0.999);
  const c0 = Math.floor(nCol), c1 = Math.floor(nCol + 0.999);
  const hits = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (r < 0 || r >= dest.rows || c < 0 || c >= dest.cols) continue;  // clamped side
      const tile = cellTile(dest, r, c);          // folds tiles/bgTiles water into '~'
      if (!isHardBlocked(tile)) continue;
      if (withLadder && LADDER_OVER.has(tile) &&
          isLadderBridgeCell(dest.tiles, dest.rows, dest.cols, r, c, dest.bgTiles)) continue;
      hits.push({ r, c, tile });
    }
  }
  return hits;
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
 * @param {{blockedRoom?:string, withLadder?:boolean,
 *          openTiles?:Set<string>, followMapEnters?:boolean}} [opts]
 *   withLadder: treat 1-cell-wide WATER/PIT bridge cells as walkable (mirrors
 *   having the ladder item). Used to verify D5-style "ladder crossing" gates.
 *
 *   openTiles: SOLVABLE_GATES chars to treat as ALREADY OPEN (walk through them).
 *   followMapEnters: also traverse '>' ワープ（mapEnters の id⇔destId ペア）.
 *
 *   ⚠️ この2つは既定 off ＝ 既存の呼び出し（field の dead-edge 計測など）の意味を
 *      一切変えない。追加した理由は鍵の順序検査（2026-08-05 キュー5番）：
 *      「鍵は、その鍵で開ける扉 D を通らずに到達できるか」を測るには
 *      **D だけを閉じ、他のゲートは全部開いた** 歩行が必要だった。
 *      全ゲート閉（既定）では、鍵部屋への正規ルートが爆弾壁 '!' や潮ゲートを
 *      通る dungeon_6 型のダンジョンで誤検出する。ワープ追跡が必要な理由も同じで、
 *      D6/D8 の鍵部屋 [1,0] は '>' 経由でしか繋がっていない。
 * @returns {{
 *   reachedRooms:Set<string>, reachedCells:Set<string>,
 *   deadEdges:Array<object>, entrances:Set<string>
 * }}
 *   deadEdges: stepped off an OPEN edge cell but the arrival was a wall or a
 *   missing stage → the engine would clamp/stick the player ("隣に行けない/めり込む").
 *   NOTE: this walk models the engine's 1-CELL arrival check only. For the half-cell
 *   footprint refusal ("見えない壁") use footprintBlockedEdges().
 */
export function bfsLayer(stages, start, opts = {}) {
  const { blockedRoom = null, withLadder = false,
          openTiles = null, followMapEnters = false } = opts;
  // openTiles に入っているゲート文字は「開いている」＝壁でも障害でもない扱いにする。
  const isOpened = (ch) => openTiles !== null && openTiles.has(ch);
  // '>' ワープの行き先表：mapEnters の id → その '>' が置かれたセル。
  // 対向は destId で引く（データ上 id/destId は相互に指し合う）。
  const warpById = new Map();
  if (followMapEnters) {
    for (const [k, s] of Object.entries(stages)) {
      for (const [pk, me] of Object.entries(s.mapEnters || {})) {
        if (me?.id) warpById.set(me.id, { room: k, pos: pk });
      }
    }
  }
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
    const ch = cellTile(s, r, c);
    if (isBlocked(ch) && !isOpened(ch)) {
      // With ladder: a 1-cell-wide WATER/PIT bridge is passable.
      if (withLadder && LADDER_OVER.has(ch) &&
          isLadderBridgeCell(s.tiles, s.rows, s.cols, r, c, s.bgTiles)) {
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
  //
  // 2026-07-27 ⑥-footprint: bfsLayer deliberately does NOT model the arrival FOOTPRINT
  // (a wall one row/col inward from the boundary, which the engine's half-cell landing
  // also refuses). That defect class is enumerated structurally by
  // footprintBlockedEdges() instead — see its header for why a BFS is the wrong tool.
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
    const arrival = cellTile(dest, r, c);
    if (isHardBlocked(arrival)) {
      // With ladder: a 1-cell-wide WATER/PIT bridge at the border is not a dead
      // edge — it's a legitimate ladder crossing (enq will handle passability).
      if (withLadder && LADDER_OVER.has(arrival) &&
          isLadderBridgeCell(dest.tiles, dest.rows, dest.cols, r, c, dest.bgTiles)) {
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
      // followMapEnters: 同一レイヤー内に対向の '>' があればワープ先を歩行に含める。
      // 別レイヤーへ出る入口（ダンジョン出口など）は warpById に無いので何もしない。
      if (followMapEnters && me?.destId && warpById.has(me.destId)) {
        const dst = warpById.get(me.destId);
        const [dr, dc] = parse(dst.pos);
        enq(dst.room, dr, dc);
      }
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
 * Enumerate every crossing the engine refuses because of the arrival FOOTPRINT
 * ("見えない壁") — Phase 9-6 ⑥-footprint.
 *
 * A crossing qualifies when the boundary cell on BOTH sides is walkable (so the player
 * sees a normal, open seam and walks into it) but the half-cell landing's footprint
 * covers a wall one row/col inward, so checkStageTransition cancels and pushes them
 * back. 72 of these existed map-wide while every checker reported traps = 0.
 *
 * ⚠️ Why this is a STRUCTURAL sweep and not part of bfsLayer's walk. Both BFS variants
 * were tried and both under-report, in opposite ways:
 *   - Stop the walk at a footprint violation → the crossing's own destination becomes
 *     unreachable, so the violations BEHIND it are never enumerated (measured: 69 of 72
 *     found) and `reached` collapses (302→285-class numbers). An enumeration that shrinks
 *     as the defect worsens can't be ratcheted to 0.
 *   - Keep walking but only record on reached screens → the strict walk keeps solvable
 *     gates SHUT, so anything behind a tide gate drops out. That silently hid the user's
 *     own reported case (15,13→15,14, behind the new corridor gates): 69 instead of 71.
 *     This is the same loophole that made under-2-axis "improve" 101→83 (field-quality.mjs).
 * A footprint violation is a property of two adjacent stages' TILES, not of the player's
 * current progress, so it is swept per stage pair over all four directions. Gate state,
 * items and route are irrelevant: if the player can ever stand on that boundary cell,
 * they will walk into the invisible wall.
 *
 * @param {object} stages  layer.stages map
 * @param {{withLadder?:boolean}} [opts]  withLadder mirrors having the ladder item
 * @returns {Array<{from:string,dir:string,to:string,at:string,tile:string,
 *   landing:string,blockedAt:string}>}
 */
export function footprintBlockedEdges(stages, opts = {}) {
  // landingOf: injectable landing function, defaults to the engine's real one.
  // ⚠️ 2026-07-29 ⑥-landing: with the integer landing this sweep returns [] BY
  // CONSTRUCTION (the footprint is one cell, and a wall ON that cell is already the
  // `traps` class, skipped below). That makes the sweep's own behaviour untestable
  // against live data, so tests inject the historical half-cell landing to prove the
  // guard still ENUMERATES — i.e. that a landing drift would resurface the 68 invisible
  // walls loudly instead of silently. Production callers never pass this.
  const { withLadder = false, landingOf = edgeLanding } = opts;
  const out = [];
  const DIRS = [
    // [dir, does the source cell sit on this edge?, arrival cell in dest]
    ['up',    (s, r, c) => r === 0,           (s, d, r, c) => [d.rows - 1, c], (k, sx, sy) => sk(sx, sy - 1)],
    ['down',  (s, r, c) => r === s.rows - 1,  (s, d, r, c) => [0, c],          (k, sx, sy) => sk(sx, sy + 1)],
    ['left',  (s, r, c) => c === 0,           (s, d, r, c) => [r, d.cols - 1], (k, sx, sy) => sk(sx - 1, sy)],
    ['right', (s, r, c) => c === s.cols - 1,  (s, d, r, c) => [r, 0],          (k, sx, sy) => sk(sx + 1, sy)],
  ];
  for (const fromK of Object.keys(stages)) {
    const s = stages[fromK];
    const [sx, sy] = parse(fromK);
    for (const [dir, onEdge, arrivalOf, destKey] of DIRS) {
      const toK = destKey(fromK, sx, sy);
      const dest = stages[toK];
      if (!dest) continue;                       // world edge: the engine clamps, safe
      for (let r = 0; r < s.rows; r++) {
        for (let c = 0; c < s.cols; c++) {
          if (!onEdge(s, r, c)) continue;
          // The player must be able to STAND on the source cell to walk off it.
          if (isBlocked(cellTile(s, r, c))) continue;
          const [ar, ac] = arrivalOf(s, dest, r, c);
          if (ar < 0 || ac < 0 || ar >= dest.rows || ac >= dest.cols) continue;
          // A wall ON the boundary cell is the 'arrival-wall' class (traps) — not ours.
          if (isHardBlocked(cellTile(dest, ar, ac))) continue;
          const land = landingOf(dir, dest, ar, ac);
          const foot = arrivalFootprintBlocked(dest, land.row, land.col, { withLadder });
          if (!foot.length) continue;
          out.push({
            from: fromK, dir, to: toK, at: `${ar},${ac}`, tile: foot[0].tile,
            landing: `${land.row},${land.col}`,
            blockedAt: foot.map((h) => `${h.r},${h.c}`).join(' '),
          });
        }
      }
    }
  }
  return out;
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
    const ch = cellTile(s, r, c);
    if (!isHardBlocked(ch)) return true;
    if (LADDER_OVER.has(ch) && isLadderBridgeCell(s.tiles, s.rows, s.cols, r, c, s.bgTiles)) return true;
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
      if (!isBlocked(cellTile(stage, r, c))) return { row: r, col: c };
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
