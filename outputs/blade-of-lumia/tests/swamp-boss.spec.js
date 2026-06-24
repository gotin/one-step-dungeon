// tests/swamp-boss.spec.js – 沼地の大蝦蟇（8体目の大型ボス・Phase 9-2c）
//
// ⚠️ このボスは「部品」として作成済みだが、まだどのマップにも配置していない。
// 配置先＝新設予定の dungeon_8（9-2{d〜} で設計・配置）。cave_1 は小さな洞窟の
// ままで、欠片ダンジョンにはしない（位置づけ修正・2026-06-24）。
//
// よってここでは「ボス定義（部品）が正しく揃っているか」だけを検証する：
//   ① ENEMY_META に SWAMP_TOAD('I') が dropsTriforce な 2×2 ボスとして定義済み
//   ② スプライト・パレット・向きエイリアスが揃っている
//   ③ タイル定義（TILE.SWAMP_TOAD / TILE_META）が存在する
//   ④ まだライブマップ（dungeon_*/cave_1）には未配置である（誤配置の回帰防止）

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';

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

  test('④ まだライブマップには未配置（dungeon_8 設計まで誤配置しない）', () => {
    for (const [layerName, layer] of Object.entries(MAP.layers ?? {})) {
      for (const [sk, stage] of Object.entries(layer.stages ?? {})) {
        const flat = (stage.tiles ?? [])
          .map(row => (Array.isArray(row) ? row.join('') : String(row)))
          .join('');
        expect(flat.includes(TILE.SWAMP_TOAD),
          `${layerName}/${sk} に未配置のはずの 'I' がある`).toBe(false);
      }
    }
  });
});
