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
