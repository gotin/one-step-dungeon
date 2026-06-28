import { test, expect } from '@playwright/test';
import {
  bfsLayer, isBlocked, isHardBlocked, BLOCKED, HARD_BLOCKED, SOLVABLE_GATES,
  findEntryRoom, firstWalkable, findOrphanRooms, findEntrances,
  isLadderBridgeCell,
} from '../scripts/lib/connectivity.mjs';
import { readFileSync } from 'fs';

// Phase 9-2pre: the connectivity checker is the safety net for every dungeon /
// field stage we build, so the CHECKER ITSELF must be tested. We feed it tiny
// hand-built fixtures with KNOWN defects and assert it flags them — and that a
// correct map comes back clean. Without this, "the checker passed" means nothing.

// Build a 10x12 room: all floor inside, walls on the border, with a list of
// edge openings { side, idx } punched through (idx = col for top/bottom, row
// for left/right). Extra tiles can be stamped via `stamp` entries.
function room(openings = [], stamp = []) {
  const rows = 10, cols = 12;
  const t = [];
  for (let r = 0; r < rows; r++) {
    const line = [];
    for (let c = 0; c < cols; c++) {
      const border = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      line.push(border ? '#' : '.');
    }
    t.push(line);
  }
  for (const { side, idx } of openings) {
    if (side === 'top')    t[0][idx] = '.';
    if (side === 'bottom') t[rows - 1][idx] = '.';
    if (side === 'left')   t[idx][0] = '.';
    if (side === 'right')  t[idx][cols - 1] = '.';
  }
  for (const { r, c, ch } of stamp) t[r][c] = ch;
  return { rows, cols, tiles: t };
}

test.describe('connectivity tool — BLOCKED categories (single source of truth)', () => {
  test('hard walls block AND count as dead-end material; solvable gates block walk but are not hard', () => {
    expect(isBlocked('#')).toBe(true);
    expect(isHardBlocked('#')).toBe(true);
    // floor / empty are walkable
    expect(isBlocked('.')).toBe(false);
    expect(isBlocked(' ')).toBe(false);
    expect(isBlocked(undefined)).toBe(false);
    // solvable gates block the pure walk but are NOT hard walls (not dead edges)
    for (const g of [...SOLVABLE_GATES]) {
      expect(isBlocked(g), `${g} blocks walk`).toBe(true);
      expect(isHardBlocked(g), `${g} is not a hard wall`).toBe(false);
    }
    // BLOCKED is the union
    expect(BLOCKED.size).toBe(HARD_BLOCKED.size + SOLVABLE_GATES.size);
    // boss doorway ':' must be a solvable gate, not a hard wall (you walk through it)
    expect(SOLVABLE_GATES.has(':')).toBe(true);
  });
});

test.describe('connectivity tool — detects known defects', () => {
  test('(a) misaligned opening => DEAD EDGE flagged', () => {
    // Two rooms stacked vertically. Top room [0,0] opens its bottom edge at col5;
    // bottom room [0,1] does NOT open its top edge at col5 (still a wall).
    const stages = {
      '0,0': room([{ side: 'bottom', idx: 5 }]),
      '0,1': room([]), // top edge fully walled => arrival at (0,5) is '#'
    };
    const { deadEdges } = bfsLayer(stages, { stage: '0,0', row: 1, col: 1 });
    expect(deadEdges.length).toBeGreaterThan(0);
    const e = deadEdges.find(x => x.from === '0,0' && x.dir === 'down');
    expect(e, 'dead edge from 0,0 going down').toBeTruthy();
    expect(e.reason).toBe('arrival-wall');
  });

  test('(a2) edge opening to a NON-EXISTENT stage => DEAD EDGE (no-stage)', () => {
    const stages = { '0,0': room([{ side: 'right', idx: 4 }]) }; // opens toward 1,0 which doesn't exist
    const { deadEdges } = bfsLayer(stages, { stage: '0,0', row: 1, col: 1 });
    const e = deadEdges.find(x => x.dir === 'right');
    expect(e).toBeTruthy();
    expect(e.reason).toBe('no-stage');
  });

  test('(b) orphan stage => unreachable (not in reachedRooms)', () => {
    // 0,0 connects down to 0,1. 5,5 is far away with no aligned neighbor => orphan.
    const stages = {
      '0,0': room([{ side: 'bottom', idx: 5 }]),
      '0,1': room([{ side: 'top', idx: 5 }]),
      '5,5': room([]), // isolated
    };
    const { reachedRooms } = bfsLayer(stages, { stage: '0,0', row: 1, col: 1 });
    expect(reachedRooms.has('0,0')).toBe(true);
    expect(reachedRooms.has('0,1')).toBe(true);
    expect(reachedRooms.has('5,5'), 'orphan must NOT be reached').toBe(false);
    const orphans = Object.keys(stages).filter(k => !reachedRooms.has(k));
    expect(orphans).toEqual(['5,5']);
  });

  test('(b2) SEALED room (all walls, no mapEnter) => TRUE ORPHAN, even though it has no dead edge', () => {
    // This is the dungeon_1 [5,0] bug: a room fully boxed in walls with no
    // mapEnter. It produces NO dead edge (it has no open border at all), so the
    // checker must catch it via orphan analysis, NOT dead-edge analysis.
    const sealed = room([]); // every border is '#', no openings
    const stages = {
      '0,0': { ...room([{ side: 'bottom', idx: 5 }]),
               mapEnters: { '1,1': { id: 'd', destId: 'field_1' } } },
      '0,1': room([{ side: 'top', idx: 5 }]),
      '5,0': sealed,
    };
    // dead-edge analysis alone would say "clean" — prove that, then prove orphan catches it.
    const { deadEdges } = bfsLayer(stages, { stage: '0,0', row: 1, col: 1 });
    expect(deadEdges, 'a sealed room creates no dead edge').toEqual([]);
    const { orphans } = findOrphanRooms(stages, '0,0');
    expect(orphans, 'sealed room is flagged as a true orphan').toContain('5,0');
  });

  test('(b3) gated-but-reachable room is NOT an orphan (door/boss-doorway count as open)', () => {
    // 0,0 -> 0,1 via a key DOOR at the border. 0,1 is gated, not sealed.
    const stages = {
      '0,0': { ...room([{ side: 'bottom', idx: 5 }]),
               mapEnters: { '1,1': { id: 'd', destId: 'field_1' } } },
      '0,1': room([], [{ r: 0, c: 5, ch: 'D' }]), // top opening is a key-door
    };
    // pure-walk reachability keeps it gated (unreached) ...
    const { reachedRooms } = bfsLayer(stages, { stage: '0,0', row: 1, col: 1 });
    expect(reachedRooms.has('0,1')).toBe(false);
    // ... but orphan analysis (gates open) says it IS reachable => not an orphan.
    const { orphans } = findOrphanRooms(stages, '0,0');
    expect(orphans).not.toContain('0,1');
  });

  test('(b4) rooms that reach EACH OTHER but not the entrance are BOTH orphans', () => {
    // The dungeon_1 [3,0]<->[4,0] case: an island of two rooms connected to each
    // other but with no path back to the entrance. "Dead" = unreachable from the
    // ENTRANCE, so an internally-connected island still counts as dead.
    const stages = {
      '0,0': { ...room([]), mapEnters: { '1,1': { id: 'd', destId: 'field_1' } } }, // entrance, sealed otherwise
      '3,0': room([{ side: 'right', idx: 4 }]), // connects to 4,0
      '4,0': room([{ side: 'left', idx: 4 }]),  // connects to 3,0, nothing else
    };
    const { orphans, reachable } = findOrphanRooms(stages, ['0,0']);
    expect(orphans).toEqual(['3,0', '4,0']);
    expect(reachable.has('0,0')).toBe(true); // entrance itself is reachable
  });

  test('(b5) MULTIPLE entrances: a room reachable from the 2nd entrance is NOT an orphan', () => {
    // Two separate entrances. 0,1 is reachable only from entrance B (9,9), not A.
    // With single-entrance BFS it would be wrongly flagged; union BFS must clear it.
    const stages = {
      '0,0': { ...room([]), mapEnters: { '1,1': { id: 'a', destId: 'field_1' } } }, // entrance A (isolated)
      '9,9': { ...room([{ side: 'right', idx: 4 }]), mapEnters: { '1,1': { id: 'b', destId: 'field_1' } } }, // entrance B
      '10,9': room([{ side: 'left', idx: 4 }]), // reachable only from B
    };
    const entrances = ['0,0', '9,9'];
    const { orphans } = findOrphanRooms(stages, entrances);
    expect(orphans, '10,9 is reachable via entrance B, not an orphan').not.toContain('10,9');
    // Sanity: with ONLY entrance A, 10,9 WOULD be unreachable (proves union matters).
    const single = findOrphanRooms(stages, ['0,0']);
    expect(single.orphans).toContain('10,9');
  });

  test('findEntrances: dungeon entrance = room whose mapEnter id is referenced by another layer', () => {
    const mapData = {
      startPos: { stage: '1,0', row: 2, col: 2 },
      layers: {
        field: { stages: { '1,0': { rows: 10, cols: 12, tiles: [],
          mapEnters: { '8,8': { id: 'field_1', destId: 'dungeon_1' } } } } },
        dungeon_1: { stages: {
          '0,0': { rows: 10, cols: 12, tiles: [],
            mapEnters: { '7,2': { id: 'dungeon_1', destId: 'field_1' },     // <- external entrance
                         '4,9': { id: 'd1_stair', destId: 'd1_stair2' } } },  // internal stair only
          '2,0': { rows: 10, cols: 12, tiles: [],
            mapEnters: { '7,8': { id: 'd1_stair2', destId: 'd1_stair' } } },
        } },
      },
    };
    // dungeon_1's external entrance is 0,0 (referenced by field's destId), NOT 2,0.
    expect(findEntrances(mapData, 'dungeon_1')).toEqual(['0,0']);
    // field's entrance is the player start.
    expect(findEntrances(mapData, 'field')).toEqual(['1,0']);
  });

  test('regression: real dungeon_1 has no dead rooms after 9-2a2 remake', () => {
    // Phase 9-2a2 remade dungeon_1 into a 4×4 grid with all rooms connected.
    // Old dead rooms 3,0/4,0/5,0 were removed; new layout has no orphans.
    const url = new URL('../work/blade-of-lumia.json', import.meta.url);
    const d = JSON.parse(readFileSync(url, 'utf8'));
    const entrances = findEntrances(d, 'dungeon_1');
    expect(entrances).toEqual(['1,3']);
    const { orphans } = findOrphanRooms(d.layers.dungeon_1.stages, entrances);
    expect(orphans).toEqual([]);
  });

  test('regression: real FIELD has no dead stages (entrance = startPos)', () => {
    // The field is a real layer too — lock in that it has zero dead stages from
    // the player start. Sky island (8,0) and tower (6,0) are flight-only and
    // added in M2+; they are not yet in the field layer. If a future field edit
    // strands a screen, this turns red.
    const url = new URL('../work/blade-of-lumia.json', import.meta.url);
    const d = JSON.parse(readFileSync(url, 'utf8'));
    const entrances = findEntrances(d, 'field');
    expect(entrances).toEqual([d.startPos.stage]); // startPos drives the field entrance
    const { orphans } = findOrphanRooms(d.layers.field.stages, entrances);
    expect(orphans).toEqual([]);
  });

  test('(c) correctly aligned rooms => clean (no dead edges, all reached)', () => {
    // Vertical pair aligned at col5; horizontal pair aligned at row4.
    const stages = {
      '0,0': room([{ side: 'bottom', idx: 5 }, { side: 'right', idx: 4 }]),
      '0,1': room([{ side: 'top', idx: 5 }]),
      '1,0': room([{ side: 'left', idx: 4 }]),
    };
    const { reachedRooms, deadEdges } = bfsLayer(stages, { stage: '0,0', row: 1, col: 1 });
    expect(deadEdges).toEqual([]);
    expect([...reachedRooms].sort()).toEqual(['0,0', '0,1', '1,0']);
  });

  test('boss-doorway arrival is NOT a dead edge (walk-through gate)', () => {
    // Bottom room opens its top edge but the cell is ':' (DOORWAY_BOSS). The
    // player walks through it, so this must NOT be flagged as a dead edge.
    const stages = {
      '0,0': room([{ side: 'bottom', idx: 5 }]),
      '0,1': room([], [{ r: 0, c: 5, ch: ':' }]),
    };
    const { deadEdges } = bfsLayer(stages, { stage: '0,0', row: 1, col: 1 });
    expect(deadEdges).toEqual([]);
  });

  test('--block-room equivalent: blocking a corridor cuts off the far room', () => {
    // Chain 0,0 -> 0,1 -> 0,2. Block 0,1 => 0,2 unreachable (one-way / gate proof).
    const stages = {
      '0,0': room([{ side: 'bottom', idx: 5 }]),
      '0,1': room([{ side: 'top', idx: 5 }, { side: 'bottom', idx: 5 }]),
      '0,2': room([{ side: 'top', idx: 5 }]),
    };
    const open = bfsLayer(stages, { stage: '0,0', row: 1, col: 1 });
    expect(open.reachedRooms.has('0,2')).toBe(true);
    const blocked = bfsLayer(stages, { stage: '0,0', row: 1, col: 1 }, { blockedRoom: '0,1' });
    expect(blocked.reachedRooms.has('0,2'), 'blocking 0,1 cuts 0,2 off').toBe(false);
  });
});

test.describe('connectivity tool — --with-ladder (1-cell bridge)', () => {
  // Build a 10x12 room with a single-cell water moat at row 3 (col1-10),
  // with land on row2 and row4 on either side => each column is a valid vertical bridge.
  function moatRoom(openings = [], extraStamp = []) {
    const r = room(openings);
    for (let c = 1; c <= 10; c++) r.tiles[3][c] = '~';  // water moat
    for (const { r: row, c: col, ch } of extraStamp) r.tiles[row][col] = ch;
    return r;
  }

  test('isLadderBridgeCell: 1-cell-wide water (land above and below) = bridge', () => {
    const t = Array.from({ length: 10 }, (_, r) =>
      Array.from({ length: 12 }, (_, c) => (r === 0 || r === 9 || c === 0 || c === 11) ? '#' : '.'));
    t[3][5] = '~';  // single water cell, floor above (2,5) and below (4,5)
    expect(isLadderBridgeCell(t, 10, 12, 3, 5)).toBe(true);
  });

  test('isLadderBridgeCell: 2-cell-wide water = NOT a bridge (far neighbor is also water)', () => {
    const t = Array.from({ length: 10 }, (_, r) =>
      Array.from({ length: 12 }, (_, c) => (r === 0 || r === 9 || c === 0 || c === 11) ? '#' : '.'));
    t[3][5] = '~'; t[4][5] = '~';  // two consecutive water cells vertically
    // cell (3,5): above=(2,5)=floor OK, below=(4,5)=water NOT a bank => no vertical bridge
    // cell (3,5): left=(3,4)=floor OK, right=(3,6)=floor OK => horizontal bridge IS valid
    // But the moat is vertical movement; for the test, set horizontal neighbors to water too:
    t[3][4] = '~'; t[3][6] = '~';
    expect(isLadderBridgeCell(t, 10, 12, 3, 5)).toBe(false);  // neither axis bridgeable
  });

  test('--with-ladder: boss room unreachable without ladder, reachable with (3-room chain)', () => {
    // Chain: entry[0,2] → moat[0,1] → boss[0,0].
    // BFS enters moat room from below (arrives at row9), must cross row3 moat to reach row0 → boss.
    // Without ladder: row3 moat blocks upward walk → boss[0,0] unreachable.
    // With ladder: 1-cell vertical bridge → boss reachable.
    const entry    = room([{ side: 'top', idx: 5 }]);   // top opening → moat[0,1]
    const moatRoom_ = moatRoom([{ side: 'top', idx: 5 }, { side: 'bottom', idx: 5 }]); // both openings
    const bossRoom  = room([{ side: 'bottom', idx: 5 }]); // bottom opening ← moat
    const stages = {
      '0,0': { ...bossRoom, isBossRoom: true },
      '0,1': moatRoom_,
      '0,2': { ...entry, mapEnters: { '1,1': { id: 'e', destId: 'field' } } },
    };
    // Without ladder: moat at row3 of [0,1] blocks walk from row9→row0 → boss[0,0] unreachable
    const noLadder = bfsLayer(stages, { stage: '0,2', row: 8, col: 6 });
    expect(noLadder.reachedRooms.has('0,0'), 'no ladder: boss unreachable').toBe(false);
    // With ladder: row3 is a 1-cell vertical bridge (row2 and row4 both land) → boss reachable
    const withLadder = bfsLayer(stages, { stage: '0,2', row: 8, col: 6 }, { withLadder: true });
    expect(withLadder.reachedRooms.has('0,0'), 'with ladder: boss reachable').toBe(true);
  });

  test('--with-ladder: 2x2 water block has no bridge (neither axis has land on both sides)', () => {
    // A 2×2 block of water: no cell has land on BOTH sides along either axis.
    // This is structurally impassable even with a ladder.
    const r = room([{ side: 'bottom', idx: 5 }, { side: 'top', idx: 5 }]);
    // Overwrite cells to create 2×2 water at rows 3-4, cols 5-6
    r.tiles[3][5] = '~'; r.tiles[3][6] = '~';
    r.tiles[4][5] = '~'; r.tiles[4][6] = '~';
    // Cell (3,5): above=(2,5)=`.` ok, below=(4,5)=`~` NOT land → no vertical bridge.
    //            left=(3,4)=`.` ok, right=(3,6)=`~` NOT land → no horizontal bridge.
    // isLadderBridgeCell should return false for (3,5).
    expect(isLadderBridgeCell(r.tiles, r.rows, r.cols, 3, 5)).toBe(false);
    expect(isLadderBridgeCell(r.tiles, r.rows, r.cols, 3, 6)).toBe(false);
    expect(isLadderBridgeCell(r.tiles, r.rows, r.cols, 4, 5)).toBe(false);
    expect(isLadderBridgeCell(r.tiles, r.rows, r.cols, 4, 6)).toBe(false);
  });

  test('ladder-bridge orphan analysis: moat-gated room is NOT orphan (ladder always obtainable)', () => {
    // A room behind a 1-cell water moat is NOT an orphan — the ladder is always in the dungeon.
    const entrance = room([{ side: 'bottom', idx: 5 }]);
    const behind = moatRoom([{ side: 'top', idx: 5 }]);
    const stages = {
      '0,0': { ...entrance, mapEnters: { '1,1': { id: 'e', destId: 'field' } } },
      '0,1': behind,
    };
    const { orphans } = findOrphanRooms(stages, ['0,0']);
    expect(orphans, '0,1 behind moat is not an orphan').not.toContain('0,1');
  });

  test('regression: real dungeon_5 — boss unreachable without ladder, reachable with', () => {
    const url = new URL('../work/blade-of-lumia.json', import.meta.url);
    const d = JSON.parse(readFileSync(url, 'utf8'));
    const stages = d.layers.dungeon_5.stages;
    const entrances = findEntrances(d, 'dungeon_5');
    expect(entrances).toEqual(['1,3']);

    // Without ladder: boss 0,0 unreachable (water moat blocks)
    const noLadder = bfsLayer(stages, { stage: '1,3', ...firstWalkable(stages['1,3']) });
    expect(noLadder.reachedRooms.has('0,0'), 'no ladder: boss unreachable').toBe(false);

    // With ladder: all rooms reachable
    const withLadder = bfsLayer(stages, { stage: '1,3', ...firstWalkable(stages['1,3']) }, { withLadder: true });
    expect(withLadder.reachedRooms.has('0,0'), 'with ladder: boss reachable').toBe(true);
    expect(withLadder.reachedRooms.size, 'all 20 rooms reachable with ladder').toBe(20);

    // No orphans (ladder bridges count as passable)
    const { orphans } = findOrphanRooms(stages, entrances);
    expect(orphans).toEqual([]);
  });
});

test.describe('connectivity tool — helpers', () => {
  test('findEntryRoom prefers the field/exit MAP_ENTER room', () => {
    const stages = {
      '0,0': room([]),
      '1,0': { ...room([]), mapEnters: { '5,5': { destId: 'field_1' } } },
    };
    expect(findEntryRoom(stages)).toBe('1,0');
  });

  test('firstWalkable returns an inside floor cell, not the wall border', () => {
    const w = firstWalkable(room([]));
    expect(w).toEqual({ row: 1, col: 1 });
  });
});
