// tests/swamp-boss.spec.js – 沼地の大蝦蟇（8体目の大型ボス・Phase 9-2c/9-2h）
//
// ボスは dungeon_8/0,0 に配置済み（Phase 9-2h・2026-06-27）。
// cave_1 は小洞窟のまま（欠片ダンジョンにしない）。
//
// 検証：
//   ① ENEMY_META に SWAMP_TOAD('I') が dropsTriforce な 2×2 ボスとして定義済み
//   ② スプライト・パレット・向きエイリアスが揃っている
//   ③ タイル定義（TILE.SWAMP_TOAD / TILE_META）が存在する
//   ④ 配置は dungeon_8/0,0 のみ（他のレイヤーには誤配置していない）

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';
import { gameLayerEntries } from '../shared/layers.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

test.describe('Phase 9-2c – 沼地の大蝦蟇（部品としての定義）', () => {

  test('① SWAMP_TOAD は dropsTriforce な 2×2 大型ボス', () => {
    const meta = ENEMY_META[TILE.SWAMP_TOAD];
    expect(meta).toBeTruthy();
    expect(meta.isBoss).toBe(true);
    expect(meta.dropsTriforce).toBe(true);
    expect(meta.size).toEqual({ w: 2, h: 2 });
    expect(meta.weakness?.type).toBe('fire'); // 剣でも可・任意ボーナス
  });

  test('② スプライト・パレット・向きエイリアスが揃っている', () => {
    expect(ENEMY_SPRITES.swampToad).toBeTruthy();
    expect(ENEMY_SPRITES.swampToad.length).toBe(2);          // 2 フレーム
    expect(ENEMY_SPRITES.swampToad[0].length).toBe(64);      // 64×64
    expect(ENEMY_SPRITES.swampToad[0][0].length).toBe(64);
    expect(ENEMY_PAL.swampToad?.length).toBeGreaterThanOrEqual(8);
    for (const d of ['D', 'R', 'L', 'U']) {
      expect(ENEMY_SPRITES['swampToad' + d]).toBe(ENEMY_SPRITES.swampToad);
    }
  });

  test('③ タイル定義（SWAMP_TOAD / TILE_META）が存在する', () => {
    expect(TILE.SWAMP_TOAD).toBe('I');
    expect(TILE_META[TILE.SWAMP_TOAD]).toBeTruthy();
  });

  test('④ 配置は dungeon_8/0,0 のみ（他の本編レイヤーへの誤配置がない）', () => {
    // テストレイヤー（test_*）は除外＝ギミック検証ステージの配置は誤配置ではない。
    for (const [layerName, layer] of gameLayerEntries(MAP)) {
      for (const [sk, stage] of Object.entries(layer.stages ?? {})) {
        if (layerName === 'dungeon_8' && sk === '0,0') continue; // 正規配置
        const flat = (stage.tiles ?? [])
          .map(row => (Array.isArray(row) ? row.join('') : String(row)))
          .join('');
        expect(flat.includes(TILE.SWAMP_TOAD),
          `${layerName}/${sk} に誤配置の 'I' がある`).toBe(false);
      }
    }
  });
});
