import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Phase 9-4: data-level regression that themed field regions render as their
// theme, not as the default dark dungeon floor. The *visible* ground on the
// field comes from bgTiles (the tiles-layer '.' FLOOR is invisible and falls
// through to the bgTile class in render-board.js), so this checks bgTiles.
//
// L (fire/volcano) → ash 'c', S (snow) → snow 's', M (swamp) → mud 'w'.
// Ground fillers '.' (dungeon floor) and 'g' (grass) must NOT appear as bgTiles
// in these zones — a future field edit that reverts them would fail here.
// Paths/crossings ('o' stone, 'd' sand, 'v' bridge, '~' water) are allowed.

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));

// Region base map — must match ZONE_MAP in scripts/migrate-field-m4.mjs.
const ZONE_MAP = [
  ['^','^','^','^','^','^','T','K','K','^','^','^','L','^','^','^'],
  ['^','^','F','^','^','G','G','G','G','G','^','L','L','L','^','^'],
  ['^','F','F','F','G','G','G','G','G','G','G','L','L','L','^','^'],
  ['F','F','F','F','G','G','G','G','G','G','G','G','L','S','^','^'],
  ['F','F','F','F','G','G','G','G','G','G','G','G','S','S','S','^'],
  ['F','F','F','F','G','G','G','G','G','G','G','S','S','S','S','^'],
  ['F','F','F','G','G','G','G','G','G','G','S','S','S','S','~','~'],
  ['F','F','F','G','G','G','G','G','G','W','W','S','S','~','~','~'],
  ['F','F','F','G','G','G','G','G','W','W','W','W','~','~','~','~'],
  ['F','F','G','G','G','G','G','G','W','W','W','~','~','~','~','~'],
  ['G','G','G','G','G','G','G','G','W','W','W','~','~','~','~','~'],
  ['G','G','G','G','G','G','G','G','G','W','W','~','~','~','~','~'],
  ['D','G','G','G','G','G','G','G','G','G','M','M','~','~','~','~'],
  ['D','D','G','G','G','G','G','G','G','M','M','M','~','~','~','~'],
  ['D','D','D','G','G','G','G','V','G','G','M','M','~','~','~','~'],
  ['D','D','D','G','G','G','G','G','G','M','M','M','~','~','~','~'],
  ['D','D','D','D','G','G','G','M','M','M','M','~','~','~','~','~'],
  ['~','D','D','~','G','G','G','M','M','~','~','~','~','~','~','~'],
  ['~','~','~','~','~','G','G','~','~','~','~','~','~','~','~','~'],
  ['~','~','~','~','~','~','~','~','~','~','~','~','~','~','~','~'],
];

const THEME = { L: 'c', S: 's', M: 'w' };
const DUNGEON_FLOOR = '.';
const GRASS = 'g';

function loadField() {
  const d = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  return ((d.layers && d.layers.field) || d.field).stages;
}

test.describe('Phase 9-4 – themed field ground (bgTiles)', () => {
  test('L/S/M zones have no dungeon-floor or grass ground filler in bgTiles', () => {
    const stages = loadField();
    const offenders = [];
    for (let sy = 0; sy < ZONE_MAP.length; sy++) {
      for (let sx = 0; sx < ZONE_MAP[sy].length; sx++) {
        const theme = THEME[ZONE_MAP[sy][sx]];
        if (!theme) continue;
        const s = stages[`${sx},${sy}`];
        if (!s || !s.bgTiles) continue;
        for (const pos in s.bgTiles) {
          const ch = s.bgTiles[pos];
          if (ch === DUNGEON_FLOOR || ch === GRASS) {
            offenders.push(`${sx},${sy}@${pos}=${ch} (want ${theme})`);
          }
        }
      }
    }
    expect(offenders, `themed screens still using '.'/'g' ground:\n${offenders.slice(0, 20).join('\n')}`).toEqual([]);
  });

  test('each themed zone actually uses its theme tile', () => {
    const stages = loadField();
    const counts = { c: 0, s: 0, w: 0 };
    for (let sy = 0; sy < ZONE_MAP.length; sy++) {
      for (let sx = 0; sx < ZONE_MAP[sy].length; sx++) {
        const theme = THEME[ZONE_MAP[sy][sx]];
        if (!theme) continue;
        const s = stages[`${sx},${sy}`];
        if (!s || !s.bgTiles) continue;
        for (const pos in s.bgTiles) {
          if (s.bgTiles[pos] === theme) counts[theme]++;
        }
      }
    }
    expect(counts.c, 'ash cells in L zone').toBeGreaterThan(0);
    expect(counts.s, 'snow cells in S zone').toBeGreaterThan(0);
    expect(counts.w, 'mud cells in M zone').toBeGreaterThan(0);
  });
});

// Phase 9-4: lake (W-zone) rework — the 12 lake screens were 2 identical stamped
// grass-causeway patterns with zero bridges. They're now central-island +
// bridge-arm crossings, each with distinct islets. These are DATA-level guards
// so a future field edit can't silently revert them to the crude stamp.
//
// The border openings (top/bottom @ cols 5,6; left/right @ rows 4,5) MUST stay
// walkable or the edge-scroll transition into the neighbour breaks — that's the
// connectivity invariant the migration preserves.

const LAKE_KEYS = [
  '9,7', '10,7', '8,8', '9,8', '10,8', '11,8',
  '10,9', '8,10', '9,10', '10,10', '9,11', '10,11',
];
const WALKABLE_GROUND = new Set(['.', 'g', 'v']); // floor, grass islet, bridge

// A cell value works whether tiles are stored as char-arrays or as row strings.
const cellAt = (tiles, r, c) => (Array.isArray(tiles[r]) ? tiles[r][c] : tiles[r][c]);

// Phase 9-6: water may now live on the bgTiles underlay (tiles cell is FLOOR).
// The EFFECTIVE tile folds a bgTiles-water cell back to '~' so border/trap analysis
// sees water the same whether it sits on tiles or bgTiles (mirrors passable.js
// isWaterAt / connectivity.mjs cellTile). Without this, a moved water border cell
// reads as a walkable '.' and the crossing looks open when the engine blocks it.
const effCellAt = (s, r, c) =>
  (s.bgTiles?.[`${r},${c}`] === '~' ? '~' : cellAt(s.tiles, r, c));

// Hard-blocked border tiles (water/mountain/tree/…). A border cell is trap-free iff
// it MIRRORS its facing neighbour: both walkable (a real crossing) or both blocked.
const BLOCKED_BORDER = new Set(['~', 'M', 't', '#', 'x', '%', 'u', 'f']);
const isWalk = (ch) => WALKABLE_GROUND.has(ch);

test.describe('Phase 9-4 – lake region rework (bridges + islands)', () => {
  // ⑥-6 (2026-07-13): the earlier blanket "all 8 standard border cells walkable"
  // rule predated the preserved D3 corridor (9,9 has wall edges: M top / t bottom)
  // and the stronger traps=0 invariant. Opening a lake border cell that faces a
  // wall would CREATE a soft-lock. The real intent is "lake transitions are safe":
  // a walkable lake border cell must face a walkable neighbour (a genuine crossing),
  // never a wall. Assert that mirror/trap-free condition at the standard cells.
  test('lake border openings are trap-free (walkable cell faces walkable neighbour)', () => {
    const stages = loadField();
    const bad = [];
    const facing = (k, r, c, R, C) => {
      const [sx, sy] = k.split(',').map(Number);
      if (r === 0) return [`${sx},${sy - 1}`, R - 1, c];
      if (r === R - 1) return [`${sx},${sy + 1}`, 0, c];
      if (c === 0) return [`${sx - 1},${sy}`, r, C - 1];
      if (c === C - 1) return [`${sx + 1},${sy}`, r, 0];
      return null;
    };
    for (const k of LAKE_KEYS) {
      const s = stages[k];
      const t = s.tiles, R = s.rows, C = s.cols;
      const openings = [
        [0, 5], [0, 6], [R - 1, 5], [R - 1, 6],       // top / bottom
        [4, 0], [5, 0], [4, C - 1], [5, C - 1],        // left / right
      ];
      for (const [r, c] of openings) {
        if (!isWalk(effCellAt(s, r, c))) continue;       // closed cell → no crossing here
        const f = facing(k, r, c, R, C);
        const ns = f && stages[f[0]];
        if (!ns) continue;                               // off-map → engine clamps, safe
        const nch = effCellAt(ns, f[1], f[2]);
        if (BLOCKED_BORDER.has(nch) || !isWalk(nch))
          bad.push(`${k}@${r},${c}=${effCellAt(s, r, c)} → ${f[0]}@${f[1]},${f[2]}=${nch} (trap)`);
      }
    }
    expect(bad, `lake border openings lead into a wall (soft-lock):\n${bad.join('\n')}`).toEqual([]);
  });

  test('lake screens actually use bridges (first bridges on the field map)', () => {
    const stages = loadField();
    for (const k of LAKE_KEYS) {
      const t = stages[k].tiles;
      let bridges = 0;
      for (let r = 0; r < stages[k].rows; r++)
        for (let c = 0; c < stages[k].cols; c++)
          if (cellAt(t, r, c) === 'v') bridges++;
      expect(bridges, `${k} has no bridge tiles`).toBeGreaterThan(0);
    }
  });

  test('lake screens are not all identical stamps (interior variety)', () => {
    const stages = loadField();
    const sigs = new Set();
    for (const k of LAKE_KEYS) {
      const t = stages[k].tiles;
      const sig = t.map(row => (Array.isArray(row) ? row.join('') : row)).join('|');
      sigs.add(sig);
    }
    // Was 2 distinct patterns across 12 screens; the rework gives many more.
    expect(sigs.size, 'lake screens still collapse into too few distinct patterns').toBeGreaterThan(4);
  });
});
