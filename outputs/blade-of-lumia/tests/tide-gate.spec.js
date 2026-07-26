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
//   ⑤〜⑧ 実エンジン（検証ステージ test_mechanics/tide_gate）での動作：
//     ⑤ 閉じたまま右へ歩いても壁列 col5 を越えられない
//     ⑥ Y スイッチを剣で叩くと links 経由で openGates に (4,5) が入り、通り抜けられる
//     ⑦ 見た目：閉＝セルに water クラス＋水スプライト／開＝どちらも消える
//     ⑧ もう一度叩くと閉じ直し、通れなくなる（トグルであることの確認）
//
// 検証ステージのジオメトリ（[tide_gate] = test_mechanics/18,0）：
//   col5 が壁の一枚岩で、その唯一の切れ目が潮ゲート (4,5)。左半分にスタート(4,3)と
//   Y スイッチ(3,3)、右半分に宝箱(7,8)。潮ゲートの左右 (4,4)/(4,6) は床なので、
//   もしこのセルが水ならはしごの横橋が成立する形＝「はしごでは渡れない」の検証が
//   vacuous pass にならない（はしご肯定側は tests/ladder.spec.js が担当）。

import { test, expect } from '@playwright/test';
import { TILE, TILE_META, BG_TILES } from '../shared/tiles.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import {
  HARD_BLOCKED, SOLVABLE_GATES, LADDER_OVER, isHardBlocked, isBlocked,
} from '../scripts/lib/connectivity.mjs';
import { createPassable } from '../game/passable.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';
const GATE_KEY = '4,5';      // 潮ゲートの座標（検証ステージ内）
const GATE_SEL = '#board .cell[data-row="4"][data-col="5"]';

function previewUrl({ row = 4, col = 3, weapon = true, ladder = false } = {}) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey('tide_gate'),
    row: String(row), col: String(col),
  });
  if (weapon) p.set('ps_weapon', '1');
  if (ladder) p.set('ps_ladder', '1');
  return `${GAME}?${p.toString()}`;
}

async function step(page, n) { for (let i = 0; i < n; i++) await page.evaluate(() => window.__game.step(1)); }
async function walk(page, dir, n) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(d => window.__game.movePlayer(d), dir);
    await page.evaluate(() => window.__game.step(1));
  }
}
/**
 * スタート(4,3)から Y スイッチ(3,3)を剣で叩き、元の位置(4,3)へ戻る。
 * 1操作 = 0.5 セル（MOVE_STEP）なので、上を1回押した y=3.5 の位置から
 * 剣を振ると前方タイルがちょうど (3,3)＝スイッチになる。叩いたら下へ1回戻す＝
 * 何回呼んでも同じ位置・同じ効果（トグルを2回叩く検証に必要）。
 * 戻さないと 2回目は y=3.0＝スイッチの上に立ってしまい、前方が (2,3) の床になって
 * 空振りする。ゲートと同じ行(row4)に戻るので、そのまま右へ歩けば潮ゲートに当たる。
 */
async function hitSwitchAbove(page) {
  await page.evaluate(() => window.__game.movePlayer('up'));
  await step(page, 1);
  await page.evaluate(() => window.__game.swordAttack());
  await step(page, 3);
  await page.evaluate(() => window.__game.movePlayer('down'));
  await step(page, 1);
}

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

// ── 実エンジンでの動作（PLAN 9-6 ④ の未了項目・2026-07-25）─────────────────
// ①〜⑤はユニット（定義とロジック）。潮ゲートは既存の links→openGates 機構に
// 相乗りする設計なので「本当にスイッチで開いて歩けるのか」は実際にゲームを
// 起動して確かめないと分からない（配線ミスは全部ここに出る）。
test.describe('Phase 9-6 深洋O – TIDE_GATE 実エンジン（検証ステージ tide_gate）', () => {
  test('⑥ 閉じたまま右へ歩いても壁列を越えられない（潮が満ちている）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(previewUrl());
    await waitForBoard(page);

    const ss0 = await page.evaluate(() => window.__game.getStageState());
    expect(ss0.openGates, '初期状態で潮ゲートが開いている').not.toContain(GATE_KEY);

    // 潮ゲート(4,5)へ向かって右へ歩き続ける → col5 で止まる（col≧5 に入れない）
    await walk(page, 'right', 12);
    const st = await page.evaluate(() => window.__game.getState());
    expect(st.player.x, '閉じた潮ゲートを歩いて通り抜けてしまった').toBeLessThan(5);
    expect(errors).toEqual([]);
  });

  test('⑦ Y スイッチを剣で叩くと潮ゲートが openGates に入り、通り抜けられる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // スタート(4,3)の真上が Y スイッチ(3,3)。
    await page.goto(previewUrl());
    await waitForBoard(page);

    await hitSwitchAbove(page);

    const ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.switchToggles, 'Y スイッチが ON になっていない').toContain('3,3');
    expect(ss.openGates, 'links 経由で潮ゲート(4,5)が開いていない').toContain(GATE_KEY);

    // 潮が引いた → 右半分へ歩いて渡れる（col5 を越えて col6 以降へ）
    await walk(page, 'right', 12);
    const st = await page.evaluate(() => window.__game.getState());
    expect(st.player.x, '潮が引いたのに潮ゲートを渡れない').toBeGreaterThan(5);
    expect(errors).toEqual([]);
  });

  test('⑧ 見た目：閉＝水クラス＋水スプライト／開＝どちらも消える', async ({ page }) => {
    await page.goto(previewUrl());
    await waitForBoard(page);

    // 閉（満潮）：セルに water クラス、かつ水スプライト（canvas）が乗っている
    await expect(page.locator(GATE_SEL)).toHaveClass(/water/);
    expect(await page.locator(`${GATE_SEL} canvas`).count(),
      '閉じた潮ゲートに水スプライトが描かれていない').toBeGreaterThan(0);

    await hitSwitchAbove(page);

    // 開（引き潮）：water クラスが外れ、水スプライトも消える
    // （render-board.js の addCellSprite で return を忘れると水が残る＝その回帰）
    await expect(page.locator(GATE_SEL)).not.toHaveClass(/water/);
    expect(await page.locator(`${GATE_SEL} canvas`).count(),
      '潮が引いたのに水スプライトが残っている').toBe(0);
  });

  test('⑨ もう一度叩くと閉じ直して通れなくなる（トグル）', async ({ page }) => {
    await page.goto(previewUrl());
    await waitForBoard(page);

    await hitSwitchAbove(page);
    const ssOpen = await page.evaluate(() => window.__game.getStageState());
    expect(ssOpen.openGates).toContain(GATE_KEY);

    await hitSwitchAbove(page);
    const ssClosed = await page.evaluate(() => window.__game.getStageState());
    expect(ssClosed.switchToggles ?? [], 'Y スイッチが OFF に戻っていない').not.toContain('3,3');
    expect(ssClosed.openGates ?? [], '潮ゲートが閉じ直していない').not.toContain(GATE_KEY);

    // 閉じ直したので渡れない
    await walk(page, 'down', 2);
    await walk(page, 'right', 12);
    const st = await page.evaluate(() => window.__game.getState());
    expect(st.player.x, '閉じ直した潮ゲートを渡れてしまった').toBeLessThan(5);
  });

  test('⑩ はしごを持っていても閉じた潮ゲートは渡れない（潮パズルの無意味化を防ぐ）', async ({ page }) => {
    // 潮ゲート(4,5)の左右 (4,4)/(4,6) は床＝もしここが水なら横橋が成立する形。
    // ∴「はしごでも渡れない」が構造的に保証されていることの実エンジン確認。
    await page.goto(previewUrl({ ladder: true }));
    await waitForBoard(page);

    const st0 = await page.evaluate(() => window.__game.getState());
    expect(st0.player.hasLadder, 'はしご未所持＝この検査が無意味').toBe(true);

    await walk(page, 'right', 12);
    const st = await page.evaluate(() => window.__game.getState());
    expect(st.player.x, 'はしごで閉じた潮ゲートを渡れてしまった').toBeLessThan(5);
  });
});
