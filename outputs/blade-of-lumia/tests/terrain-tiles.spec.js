// tests/terrain-tiles.spec.js – テーマ地形タイル（Phase 9-4a）
//
// SNOW('s') / ASH('c') / MUD('w') が
//   ① tiles.js に定義済み（passable: true）
//   ② tile-sprites.js にスプライト参照がある
//   ③ sprites-tiles.js にパレット定義がある
//   ④ BG_TILES に含まれる（フィールド背景レイヤー用）
//   ⑤ passable.js のブロックリストに含まれない（通行可であること）

import { test, expect } from '@playwright/test';
import { TILE, TILE_META, BG_TILES } from '../shared/tiles.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { TILE_PAL } from '../shared/sprites-tiles.js';

const THEME_TILES = [
  { key: TILE.SNOW, name: 'SNOW', pal: 'snow' },
  { key: TILE.ASH,  name: 'ASH',  pal: 'ash'  },
  { key: TILE.MUD,  name: 'MUD',  pal: 'mud'  },
];

test.describe('Phase 9-4a – テーマ地形タイル（SNOW/ASH/MUD）', () => {

  for (const { key, name, pal } of THEME_TILES) {
    test(`① ${name} は passable: true で TILE_META に定義済み`, () => {
      expect(key, `TILE.${name} 文字が定義されていない`).toBeTruthy();
      const meta = TILE_META[key];
      expect(meta, `TILE_META['${key}'] が存在しない`).toBeTruthy();
      expect(meta.passable, `${name} は passable でなければならない`).toBe(true);
    });

    test(`② ${name} は TILE_SPRITE_MAP にスプライト参照がある`, () => {
      const entry = TILE_SPRITE_MAP[key];
      expect(entry, `TILE_SPRITE_MAP['${key}'] が存在しない`).toBeTruthy();
      expect(typeof entry.spr).toBe('string');
      expect(typeof entry.pal).toBe('string');
    });

    test(`③ ${name} のパレット（${pal}）が sprites-tiles.js に定義済み`, () => {
      expect(TILE_PAL[pal], `TILE_PAL['${pal}'] が存在しない`).toBeTruthy();
      expect(Array.isArray(TILE_PAL[pal])).toBe(true);
      expect(TILE_PAL[pal].length).toBeGreaterThanOrEqual(4);
    });

    test(`④ ${name} は BG_TILES に含まれる`, () => {
      expect(BG_TILES.has(key), `BG_TILES に '${key}' が含まれていない`).toBe(true);
    });
  }

});
