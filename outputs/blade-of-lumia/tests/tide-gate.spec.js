// tests/tide-gate.spec.js — Phase 9-6 深洋O ④: the TIDE_GATE tile ('=')
//
// The tide gate is the deep-ocean O corridor's "渡る技術" gimmick (DESIGN §19-8-B).
// It reuses the existing switch→gate machinery (ss.openGates via stageData.links),
// so it needs NO real-time tick — a button/switch toggles the water level.
//   - CLOSED (not in ss.openGates): behaves like WATER — impassable on foot,
//     flyable-over (so flight can't land & soft-lock), NOT ladder-crossable
//     (a ladder would trivialise the tide puzzle — you must lower the tide to cross).
//   - OPEN (in ss.openGates): the tide has receded — the cell is walkable floor.
// It differs from a plain GATE ('T') only in its CLOSED look/behaviour: a closed
// GATE is a solid fence, a closed TIDE_GATE is water.
//
// This locks in:
//   ① TIDE_GATE is defined, impassable-by-default (passable:false), not a bg tile
//   ② tilePassable: closed => blocked, open (openGates) => walkable
//   ③ flight crosses a closed tide gate (FLYABLE_OVER), ladder does NOT (not LADDER_OVER)
//   ④ connectivity.mjs treats '=' as a SOLVABLE_GATE (opens via switch), not HARD_BLOCKED

import { test, expect } from '@playwright/test';
import { TILE, TILE_META, BG_TILES } from '../shared/tiles.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import {
  HARD_BLOCKED, SOLVABLE_GATES, LADDER_OVER, isHardBlocked, isBlocked,
} from '../scripts/lib/connectivity.mjs';
import { createPassable } from '../game/passable.js';

test.describe('Phase 9-6 深洋O – TIDE_GATE tile', () => {
  test('① TIDE_GATE は定義済み・デフォルト通行不可・背景タイルではない', () => {
    expect(TILE.TIDE_GATE, 'TILE.TIDE_GATE が定義されていない').toBe('=');
    const meta = TILE_META[TILE.TIDE_GATE];
    expect(meta, `TILE_META['='] が存在しない`).toBeTruthy();
    expect(meta.passable, '潮ゲートは（閉が既定なので）通行不可').toBe(false);
    expect(BG_TILES.has(TILE.TIDE_GATE), '潮ゲートは背景タイルではない（障害物層）').toBe(false);
  });

  test('② スプライトマッピングを持つ（描画で消えない）', () => {
    const entry = TILE_SPRITE_MAP[TILE.TIDE_GATE];
    expect(entry, `TILE_SPRITE_MAP['='] が存在しない`).toBeTruthy();
  });

  // Build a passable() over a stage whose ss we control directly.
  function makePassable(tiles, ss) {
    const stageData = {
      rows: tiles.length,
      cols: tiles[0].length,
      tiles,
    };
    const player = { x: 0, y: 0, flying: false, hasLadder: false };
    return {
      p: createPassable({
        getStageData: () => stageData,
        getEnemies: () => [],
        getPlayer: () => player,
        getCurrentLayer: () => 'field',
        getStageKey: () => '0,0',
        getDebugMode: () => false,
        getSS: () => ss,
        toTileRow: (y) => Math.floor(y),
        toTileCol: (x) => Math.floor(x),
      }),
      player,
    };
  }

  test('③ tilePassable：閉じた潮ゲートは不通・openGates に入れば通行可', () => {
    const tiles = [
      ['.', '.', '.'],
      ['.', '=', '.'],
      ['.', '.', '.'],
    ];
    const ss = { openGates: new Set(), stonePositions: {} };
    const { p } = makePassable(tiles, ss);
    expect(p.tilePassable(1, 1), '潮が満ちている（閉）＝水と同じで不通').toBe(false);
    ss.openGates.add('1,1');
    expect(p.tilePassable(1, 1), '潮が引いた（開）＝床として通行可').toBe(true);
  });

  test('④ 飛行は閉じた潮ゲートを越えられる／はしごでは渡れない', () => {
    const tiles = [
      ['.', '.', '.'],
      ['.', '=', '.'],
      ['.', '.', '.'],
    ];
    const ss = { openGates: new Set(), stonePositions: {} };
    const { p, player } = makePassable(tiles, ss);
    // 徒歩：閉じた潮ゲートには入れない
    player.flying = false; player.hasLadder = false;
    expect(p.isPassable(1, 1, 'v'), '徒歩では閉じた潮ゲートに入れない').toBe(false);
    // 飛行：越えられる（着地不可で詰むのを防ぐ＝水/溶岩と同じ扱い）
    player.flying = true;
    expect(p.isPassable(1, 1, 'v'), '飛行は閉じた潮ゲートを越えられる').toBe(true);
    // はしご：縦橋が成立していても渡れない（潮パズルの無意味化を防ぐ）
    player.flying = false; player.hasLadder = true;
    expect(p.isPassable(1, 1, 'v'), 'はしごでは潮ゲートを渡れない').toBe(false);
  });

  test('⑤ connectivity は TIDE_GATE を SOLVABLE_GATE 扱い（スイッチで開く・壁ではない）', () => {
    expect(SOLVABLE_GATES.has(TILE.TIDE_GATE), '潮ゲートはスイッチで開く解ける門').toBe(true);
    expect(HARD_BLOCKED.has(TILE.TIDE_GATE), '潮ゲートは絶対壁ではない').toBe(false);
    expect(isHardBlocked(TILE.TIDE_GATE), '潮ゲートは HARD_BLOCKED でない').toBe(false);
    expect(isBlocked(TILE.TIDE_GATE), '潮ゲートは（未開時）歩行をブロックする').toBe(true);
    // ladder must NOT cross it in the connectivity model (mirrors passable.js)
    expect(LADDER_OVER.has(TILE.TIDE_GATE), '潮ゲートははしご渡り対象ではない').toBe(false);
  });
});
