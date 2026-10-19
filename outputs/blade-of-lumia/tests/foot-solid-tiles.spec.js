// @ts-check
// キュー85 #5（2026-10-19・Fable 実装レビュー #5）。「徒歩で常に立てない」タイルは `shared/tiles.js FOOT_SOLID_TILES` が単一の真実。
// 旧＝通行（passable.js）・着地（game.js ARRIVAL_WALL_TILES）・接続の検査（connectivity.mjs HARD_BLOCKED）の3か所に
// 別々に列挙していた＝かがり火 'H' を通行だけが落とし、歩いて上に乗れた（2026-09-23 まで）。
//   ① 集合の中身（固い物を足す・外すときは、ここも1行直す＝黙って外れない）
//   ② 接続の検査の集合＝FOOT_SOLID_TILES ＋ 検査だけの分（スイッチ・閉じたままの戸口・石・茂み）
//   ③ 通行と着地がこの集合を読んでいる（実際に歩いて止まるかは bomb-torch・flight-edge-landing など各番人が見る）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, FOOT_SOLID_TILES } from '../shared/tiles.js';
import { NPC_SPRITE_MAP } from '../shared/npcs.js';
import { HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';

const sorted = (xs) => [...xs].sort();

test('① FOOT_SOLID_TILES の中身', () => {
  const expected = [
    TILE.WALL, TILE.WATER, TILE.LAVA, TILE.SKY, TILE.PIT,
    TILE.TREE, TILE.MOUNTAIN, TILE.FENCE, TILE.HOUSE_WALL, TILE.HOUSE_ROOF,
    TILE.SIGN, TILE.MONUMENT, TILE.WARP_STONE, TILE.TORCH,
    ...Object.keys(NPC_SPRITE_MAP),
  ];
  expect(sorted(FOOT_SOLID_TILES)).toEqual(sorted(new Set(expected)));
});

test('② 接続の検査＝FOOT_SOLID_TILES ＋ 検査だけの分', () => {
  const extras = [TILE.DOORWAY_LOCKED, TILE.SWITCH, TILE.SWITCH_RED, TILE.SWITCH_BLUE, TILE.STONE, TILE.BUSH];
  expect(sorted(HARD_BLOCKED)).toEqual(sorted(new Set([...FOOT_SOLID_TILES, ...extras])));
});

test('③ 通行と着地が FOOT_SOLID_TILES を読んでいる（各自で列挙しない）', () => {
  const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const passable = read('../game/passable.js');
  const game = read('../game/game.js');
  expect(passable).toContain('if (FOOT_SOLID_TILES.has(tile)) return false;');
  expect(game).toMatch(/const ARRIVAL_WALL_TILES = new Set\(\[\s*\.\.\.FOOT_SOLID_TILES,/);
  // 旧の個別の列挙が残っていない（残ると集合と食い違う）
  expect(passable).not.toMatch(/if \(tile === TILE\.(TREE|MOUNTAIN|FENCE|HOUSE_WALL|HOUSE_ROOF|TORCH|WALL|LAVA|SKY|PIT)\)/);
});
