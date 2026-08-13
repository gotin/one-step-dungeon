import { test, expect } from '@playwright/test';
import {
  bfsLayer, isBlocked, isHardBlocked, BLOCKED, HARD_BLOCKED, SOLVABLE_GATES,
  findEntryRoom, firstWalkable, findOrphanRooms, findEntrances,
  isLadderBridgeCell, cellTile, footprintBlockedEdges, edgeLanding,
  arrivalFootprintBlocked,
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

// The landing checkStageTransition used BEFORE ⑥-landing (2026-07-29): half a cell inside
// the border, so the player's 1-cell hitbox straddled the boundary row/col AND one inward.
// The engine no longer does this — it is kept here as the DEFECT GENERATOR: the footprint
// sweep is silent under the integer landing (0 by construction), so the only way to prove
// the sweep still catches the "見えない壁" class is to feed it this landing. If someone
// reverts the engine to a half-cell landing, the sweep produces exactly this output again.
const LEGACY_HALF_CELL_LANDING = (dir, dest, r, c) => {
  if (dir === 'up')    return { row: dest.rows - 1.5, col: c };
  if (dir === 'down')  return { row: 0.5, col: c };
  if (dir === 'left')  return { row: r, col: dest.cols - 1.5 };
  return { row: r, col: 0.5 };   // 'right'
};

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

  // 2026-07-27 ⑥-footprint. The user's report: 「15,13 から南に歩いても弾き返される」.
  // The boundary cell was open, so every checker said the crossing was fine — but the
  // engine landed the player at a HALF-CELL offset (checkStageTransition: down → row 0.5,
  // up → rows-1.5), their 1-cell hitbox straddled the boundary row AND the row one
  // INWARD, and arrivalIsWall cancelled the transition if EITHER held a wall. Result: a
  // 見えない壁. 72 of these existed map-wide while `traps` read 0.
  //
  // ⚠️ 2026-07-29 ⑥-landing: the ENGINE was fixed (landing = the boundary cell itself), so
  // a wall one row inward no longer blocks anything and this fixture is legitimately clean
  // in both analyses. What must still hold — and what this test now pins — is that the
  // checker and the engine agree on WHERE the player lands: run the same fixture through
  // both landings and assert the half-cell one WOULD have flagged it. If edgeLanding ever
  // drifts back off the boundary cell, the mismatch shows up here (and 68 invisible walls
  // come back with it).
  test('(a3) 境界の1つ内側の壁は整数着地では無害（旧 半セル着地なら見えない壁になる形）', () => {
    // Three stages stacked vertically. Every seam is open at BOTH col5 and col8; 0,1 holds
    // a stone at (1,5) and (8,5) — one row inside each of its own boundaries, i.e. inside
    // the footprint the OLD half-cell landing would have covered.
    const stages = {
      '0,0': room([{ side: 'bottom', idx: 5 }, { side: 'bottom', idx: 8 }]),
      '0,1': room([{ side: 'top', idx: 5 }, { side: 'top', idx: 8 },
                   { side: 'bottom', idx: 5 }, { side: 'bottom', idx: 8 }],
                  [{ r: 1, c: 5, ch: '*' }, { r: 8, c: 5, ch: '*' }]),
      '0,2': room([{ side: 'top', idx: 5 }, { side: 'top', idx: 8 }]),
    };

    // (1) integer landing: the boundary cells are open and the footprint is ONE cell, so
    // nothing is flagged — by construction, not because the data was moved.
    const { deadEdges, reachedRooms } = bfsLayer(stages, { stage: '0,0', row: 1, col: 1 });
    expect(deadEdges.filter((e) => e.reason === 'arrival-wall'), '境界セル自体は開いている').toEqual([]);
    expect(reachedRooms.has('0,1')).toBe(true);
    expect(footprintBlockedEdges(stages),
      '整数着地なら footprint は境界セル1つ＝1つ内側の石は無害').toEqual([]);

    // (2) the guard: the SAME fixture under the old half-cell landing IS blocked, in both
    // directions and only on the defective col5 lane. This is what makes (1) meaningful —
    // it proves the fixture still contains the hazard and that the only reason it passes
    // is the landing coordinate. If the engine's landing ever drifts back off the boundary
    // cell, this is the shape that comes back (68 crossings map-wide).
    const legacy = footprintBlockedEdges(stages, { landingOf: LEGACY_HALF_CELL_LANDING });
    const down = legacy.find((e) => e.from === '0,0' && e.dir === 'down');
    expect(down, '旧着地: 上から入る側は row1 の石で弾かれていた').toBeTruthy();
    expect(down.to).toBe('0,1');
    expect(down.at).toBe('0,5');
    expect(down.tile).toBe('*');
    expect(down.landing, '旧着地は row 0.5＝row0 と row1 にまたがる').toBe('0.5,5');
    expect(down.blockedAt).toContain('1,5');

    const up = legacy.find((e) => e.from === '0,2' && e.dir === 'up');
    expect(up, '旧着地: 下から入る側は row8 の石で弾かれていた').toBeTruthy();
    expect(up.to).toBe('0,1');
    expect(up.landing, '旧着地は row rows-1.5 = 8.5＝row8 と row9 にまたがる').toBe('8.5,5');
    expect(up.blockedAt).toContain('8,5');
    expect(legacy.filter((e) => e.at.endsWith(',8')), 'col8 レーンは旧着地でも正常').toEqual([]);
  });

  test('(a4) 着地セルが壁でなければ検出しない（正常な継ぎ目を誤検出しない）', () => {
    const stages = {
      '0,0': room([{ side: 'bottom', idx: 5 }]),
      '0,1': room([{ side: 'top', idx: 5 }]),
    };
    const { deadEdges } = bfsLayer(stages, { stage: '0,0', row: 1, col: 1 });
    expect(deadEdges).toEqual([]);
    expect(footprintBlockedEdges(stages), '境界セルが空いていれば正当な継ぎ目').toEqual([]);
  });

  // The enumeration must NOT depend on the player's route or on gate state. The strict
  // walk keeps solvable gates shut, so a reached-source filter dropped the user's own
  // reported case (15,13→15,14 lives behind the corridor tide gates) — 69 instead of 71.
  // Still a property of the sweep after ⑥-landing, and it matters precisely WHEN the guard
  // fires: a landing drift must resurface hazards behind gates too, not just the ones on
  // the player's current strict-walk frontier. Driven through the legacy landing because
  // that is the only landing under which the sweep produces output at all.
  test('(a5) footprint 検出はゲートの奥でも列挙される（進行状況で数が減らない）', () => {
    const stages = {
      '0,0': room([{ side: 'bottom', idx: 5 }]),
      // A full-width '=' tide gate line across 0,1: the strict walk stops at it, so
      // 0,1's own south half AND all of 0,2 are "unreached" — but the player WILL walk
      // there once the gate opens.
      '0,1': room([{ side: 'top', idx: 5 }, { side: 'bottom', idx: 5 }]),
      '0,2': room([{ side: 'top', idx: 5 }], [{ r: 1, c: 5, ch: '*' }]),
    };
    for (let c = 1; c <= 10; c++) stages['0,1'].tiles[5][c] = '=';
    const { reachedRooms } = bfsLayer(stages, { stage: '0,0', row: 1, col: 1 });
    expect(reachedRooms.has('0,2'), 'ゲート閉状態では 0,2 は未到達').toBe(false);
    const foot = footprintBlockedEdges(stages, { landingOf: LEGACY_HALF_CELL_LANDING });
    expect(foot.map((e) => `${e.from}->${e.to}`),
      'ゲートの奥の見えない壁も必ず列挙される（到達済みで絞らない）').toEqual(['0,1->0,2']);
    expect(footprintBlockedEdges(stages), '現行の整数着地では無害').toEqual([]);
  });

  // The engine↔checker contract, pinned literally. game.js checkStageTransition lands the
  // player on the BOUNDARY CELL (⑥-landing 2026-07-29): down → row 0, up → rows-1,
  // right → col 0, left → cols-1. If these numbers ever drift from game.js, every
  // footprint finding silently becomes wrong, so they are asserted literally.
  test('edgeLanding は checkStageTransition の着地座標そのもの（整数＝境界セル）', () => {
    const dest = { rows: 10, cols: 12 };
    expect(edgeLanding('down',  dest, 0, 5)).toEqual({ row: 0, col: 5 });
    expect(edgeLanding('up',    dest, 9, 5)).toEqual({ row: 9, col: 5 });
    expect(edgeLanding('right', dest, 4, 0)).toEqual({ row: 4, col: 0 });
    expect(edgeLanding('left',  dest, 4, 11)).toEqual({ row: 4, col: 11 });

    // An integer landing's footprint is exactly ONE cell: the boundary cell blocks,
    // the row/col one inward does not.
    const stage = { rows: 10, cols: 12, tiles: Array.from({ length: 10 }, () => Array(12).fill('.')) };
    stage.tiles[1][5] = '*';                     // one row inward from the top edge
    expect(arrivalFootprintBlocked(stage, 0, 5), '1つ内側の石は着地に無関係').toEqual([]);
    stage.tiles[0][6] = '*';                     // ON the boundary row
    expect(arrivalFootprintBlocked(stage, 0, 6).map((h) => `${h.r},${h.c}`)).toEqual(['0,6']);
    // Lateral crossing: only the boundary column is checked.
    stage.tiles[4][1] = '*';
    expect(arrivalFootprintBlocked(stage, 4, 0), '横入りも1セル＝col1 の石は無関係').toEqual([]);
    stage.tiles[4][0] = '*';
    expect(arrivalFootprintBlocked(stage, 4, 0).map((h) => `${h.r},${h.c}`)).toEqual(['4,0']);
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
    // the player start. Sea ('~') and mountain ('#'/'M') border stages (M4
    // additions) are intentionally fully-impassable and will always be
    // unreachable on foot; exclude them from the orphan check.
    // If a WALKABLE screen is ever stranded, this turns red.
    const url = new URL('../work/blade-of-lumia.json', import.meta.url);
    const d = JSON.parse(readFileSync(url, 'utf8'));
    const entrances = findEntrances(d, 'field');
    expect(entrances).toEqual([d.startPos.stage]); // startPos drives the field entrance

    // Filter out fully-impassable border stages (every tile is '~', '#', or 'M').
    const BORDER_TILES = new Set(['~', '#', 'M', '%']);
    const walkableStages = {};
    for (const [k, s] of Object.entries(d.layers.field.stages)) {
      const allImpassable = s.tiles.every(row =>
        (Array.isArray(row) ? row : row.split('')).every(ch => BORDER_TILES.has(ch))
      );
      if (!allImpassable) walkableStages[k] = s;
    }

    const { orphans } = findOrphanRooms(walkableStages, entrances);
    expect(orphans).toEqual([]);
  });

  // ⑥-footprint, DUNGEON side. field's are ratcheted in field-invariants.spec.js;
  // the same defect existed in dungeon layers and had no owner, so it is ratcheted here.
  //
  // ✅ 2026-07-29 ⑥-landing: the last one (dungeon_7: 1) is gone, and every layer is now
  // 0 BY CONSTRUCTION — the engine lands on the boundary cell, so the footprint is a single
  // cell and a wall there is already the `traps` class. The ratchet stays as the
  // ENGINE↔CHECKER sync guard: any drift back toward a multi-cell landing re-enumerates the
  // whole class here instead of it silently reappearing in-game.
  const FOOTPRINT_BASELINE = {};   // ⚠️ 全層 0。緩めるな（増えたら着地がずれた合図）
  test('見えない壁 (arrival footprint) — 全ダンジョン層で 0（整数着地で構造的に不可能）', () => {
    const url = new URL('../work/blade-of-lumia.json', import.meta.url);
    const d = JSON.parse(readFileSync(url, 'utf8'));
    for (const [name, layer] of Object.entries(d.layers)) {
      if (name === 'field' || !layer.stages) continue;   // field: field-invariants.spec.js
      const found = footprintBlockedEdges(layer.stages);
      const ceiling = FOOTPRINT_BASELINE[name] || 0;
      expect(
        found.length,
        `${name}: 継ぎ目は開いて見えるのに着地 footprint が壁で弾き返される遷移が ` +
        `基準 ${ceiling} を超えた:\n` +
        found.map((e) => `  ${e.from} -${e.dir}-> ${e.to} @${e.at} tile='${e.tile}' ` +
                         `(blocked ${e.blockedAt})`).join('\n'),
      ).toBeLessThanOrEqual(ceiling);
    }
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

  // Phase 9-6 深洋O: water may live on the bgTiles underlay (so enemies can stand on
  // it). cellTile folds bgTiles '~' into '~' so the checker blocks it the same as a
  // tiles-layer '~', matching the engine's isWaterAt (tiles water OR bgTiles water).
  // This is the safety net that makes the tiles '~' → bgTiles '~' migration honest:
  // without it the checker would call a bgTiles-water cell walkable while the engine
  // blocks it (a false green).
  test('cellTile: bgTiles water underlay folds to ~ (tiles floor + bgTiles water = water)', () => {
    const s = { rows: 3, cols: 3, tiles: [['.', '.', '.'], ['.', '.', '.'], ['.', '.', '.']],
                bgTiles: { '1,1': '~' } };
    expect(cellTile(s, 0, 0), 'plain floor stays floor').toBe('.');
    expect(cellTile(s, 1, 1), 'floor over bgTiles water reads as water').toBe('~');
    expect(isBlocked(cellTile(s, 1, 1)), 'bgTiles water blocks the walk').toBe(true);
  });

  test('bfsLayer: an all-bgTiles-water screen blocks foot travel (matches tiles water)', () => {
    // Two rooms side by side; the right one is floored on the tiles layer but has a
    // full bgTiles water underlay. Walking right must NOT enter it (it's a lake).
    const left  = room([{ side: 'right', idx: 5 }], [{ r: 5, c: 11, ch: '.' }]);
    const right = room([{ side: 'left',  idx: 5 }]);
    // Paint the right room entirely as bgTiles water — including its left-edge
    // opening cell (5,0), which is the exact cell you land on crossing right.
    const bg = {};
    for (let r = 0; r < right.rows; r++) for (let c = 0; c < right.cols; c++) bg[`${r},${c}`] = '~';
    right.bgTiles = bg;
    const stages = {
      '0,0': { ...left, mapEnters: { '1,1': { id: 'e', destId: 'field' } } },
      '1,0': right,
    };
    const { reachedRooms, deadEdges } = bfsLayer(stages, { stage: '0,0', row: 1, col: 1 });
    // Crossing right lands on a bgTiles-water cell = hard-blocked arrival = dead edge,
    // and the water room is never walked into.
    expect(reachedRooms.has('1,0'), 'bgTiles-water room is not walkable').toBe(false);
    expect(deadEdges.some(e => e.to === '1,0' && e.reason === 'arrival-wall'),
      'stepping into bgTiles water is a dead edge').toBe(true);
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
