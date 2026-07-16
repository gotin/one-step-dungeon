// tests/lava-tile.spec.js — Phase 9-6 ⑥-9 volcano L: the LAVA tile ('l')
//
// LAVA was added after the user caught that '~' (WATER) renders as blue water
// everywhere — the volcano's lava was just blue water. TILE.LAVA behaves IDENTICALLY
// to WATER in gameplay (impassable · flyable-over · ladder-crossable · projectiles fly
// over) and differs ONLY in rendering (water sprite shape + red/orange 'lava' palette).
// This locks in:
//   ① LAVA is defined, impassable (passable: false), and NOT a background tile
//   ② its sprite maps to the water SHAPE but the 'lava' PALETTE (not 'water')
//   ③ the 'lava' palette exists and is a distinct RED (not blue like water)
//   ④ connectivity.mjs treats 'l' as HARD_BLOCKED, but NOT ladder-crossable — lava is
//      too hot to bridge with a ladder (user call 2026-07-16); it is crossed only by the
//      permanent 'v' bridges. Flight still crosses it (can't land on lava → would soft-lock).

import { test, expect } from '@playwright/test';
import { TILE, TILE_META, BG_TILES } from '../shared/tiles.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { TILE_PAL } from '../shared/sprites-tiles.js';
import { HARD_BLOCKED, LADDER_OVER, isHardBlocked } from '../scripts/lib/connectivity.mjs';

test.describe('Phase 9-6 ⑥-9 – LAVA tile', () => {
  test('① LAVA は impassable で TILE_META に定義済み・BG_TILES ではない', () => {
    expect(TILE.LAVA, 'TILE.LAVA が定義されていない').toBe('l');
    const meta = TILE_META[TILE.LAVA];
    expect(meta, `TILE_META['l'] が存在しない`).toBeTruthy();
    expect(meta.passable, 'LAVA は通行不可でなければならない（水と同じ）').toBe(false);
    expect(BG_TILES.has(TILE.LAVA), 'LAVA は背景タイルではない（障害物層）').toBe(false);
  });

  test('② LAVA は water の形状＋lava パレットで描画される（water パレットではない）', () => {
    const entry = TILE_SPRITE_MAP[TILE.LAVA];
    expect(entry, `TILE_SPRITE_MAP['l'] が存在しない`).toBeTruthy();
    expect(entry.spr, 'LAVA は water スプライト形状を再利用する').toBe('water');
    expect(entry.pal, "LAVA は 'lava' パレット（青い水ではない）").toBe('lava');
  });

  test('③ lava パレットが存在し、水と違う赤系である', () => {
    const lava = TILE_PAL.lava;
    const water = TILE_PAL.water;
    expect(Array.isArray(lava), `TILE_PAL.lava が配列でない`).toBe(true);
    expect(lava.length).toBeGreaterThanOrEqual(4);
    // the flowing color (index 3) must differ from water's — lava is red/orange, not blue.
    expect(lava[3], 'lava の主色は water と異なる（赤橙）').not.toBe(water[3]);
    // red channel > blue channel for the bright flow color (a real red, not a blue).
    const hex = lava[4] || lava[3];
    const r = parseInt(hex.slice(1, 3), 16), b = parseInt(hex.slice(5, 7), 16);
    expect(r, `lava の明色 ${hex} は赤 > 青 であるべき`).toBeGreaterThan(b);
  });

  test('④ connectivity は LAVA を HARD_BLOCKED とするが、はしご渡り対象にはしない（熱くて渡れない）', () => {
    expect(isHardBlocked(TILE.LAVA), 'LAVA は徒歩不可（HARD_BLOCKED）').toBe(true);
    expect(HARD_BLOCKED.has(TILE.LAVA)).toBe(true);
    expect(LADDER_OVER.has(TILE.LAVA), 'LAVA ははしごで渡れない（水と違う・恒久の v 橋で渡る）').toBe(false);
    expect(LADDER_OVER.has(TILE.WATER), '水は従来どおりはしごで渡れる').toBe(true);
  });
});
