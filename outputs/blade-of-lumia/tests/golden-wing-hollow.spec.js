// 金翼の淵（field 10,15）と邪竜の巣（dragon_lair）の入口＝実行キュー76 の①（2026-10-16）
//
// field 10,14 の石とスイッチの扉（TT）の先を、羽衣でしか渡れない淵のある隠し場所にした。
// 詳細は scripts/migrate-q76a-golden-wing-hollow.mjs・DECISIONS 2026-10-16。
//
//   ① データ：10,15 は扉の真下以外を山で閉じ、隣3画面の縁も山・淵は幅2・寄道が進行順に載る
//   ② 羽衣なし（はしごあり）では前庭から淵を越えられない
//   ③ 羽衣で淵を飛んで島に降り、洞の口に乗ると邪竜の巣へ入れる
//   ④ 飛行中でも画面端の山の中へは遷移しない（10,14 の柵の上から 10,15 の山へ飛べない）
//   ⑤ 邪竜の巣から出ると島へ戻り、また飛び立てる（入って詰まない）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { gameLayerEntries } from '../shared/layers.js';
import { ORDER } from '../shared/progression.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(readFileSync(join(__dir, '../work/blade-of-lumia.json'), 'utf8'));
const FIELD = MAP.layers.field.stages;
const GAME = '/blade-of-lumia/game/';

function url(layer, stage, row, col, extra = {}) {
  const p = new URLSearchParams({
    fromEditor: '1', layer, stage, row: String(row), col: String(col),
    ps_weapon: '1', ps_hearts: '15', ...extra,
  });
  return `${GAME}?${p.toString()}`;
}
/** n タイル歩く（1 タイル = movePlayer 2回・MOVE_STEP 0.5）。 */
async function walkTiles(page, dir, tiles = 1) {
  await page.evaluate(({ d, n }) => {
    for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
  }, { d: dir, n: tiles });
}
const at = (page) => page.evaluate(() => {
  const p = window.__game.getState().player;
  return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});
const state = (page) => page.evaluate(() => {
  const s = window.__game.getState();
  return { layer: s.currentLayer, stage: s.stageKey, flying: !!s.player.flying };
});
/** 端へ向かって1歩ずつ進み、遷移（setTimeout 越し）を待つ。渡れなければ元のキーのまま。 */
async function walkAcross(page, dir, tries = 6) {
  const from = (await state(page)).stage;
  for (let k = 0; k < tries; k++) {
    await page.evaluate((d) => { window.__game.movePlayer(d); window.__game.step(1); }, dir);
    try {
      await page.waitForFunction((s) => window.__game.getState().stageKey !== s, from, { timeout: 400 });
      break;
    } catch { /* まだ端に着いていない／拒まれた */ }
  }
  return (await state(page)).stage;
}

test.describe('金翼の淵（field 10,15）と邪竜の巣の入口', () => {
  test('① 10,15 は扉の真下だけが開き、隣の縁も山・淵は幅2・寄道が進行順に載る', () => {
    const h = FIELD['10,15'];
    const M = TILE.MOUNTAIN;
    for (let c = 0; c < 12; c++) {
      expect(h.tiles[0][c], `10,15 (0,${c})`).toBe(c === 5 || c === 6 ? TILE.FLOOR : M);
      expect(h.tiles[9][c], `10,15 (9,${c}) が山でない`).toBe(M);
      expect(FIELD['10,16'].tiles[0][c], `10,16 (0,${c}) が山でない`).toBe(M);
    }
    for (let r = 0; r < 10; r++) {
      expect([h.tiles[r][0], h.tiles[r][11]], `10,15 row ${r} の左右が山でない`).toEqual([M, M]);
      expect(FIELD['9,15'].tiles[r][11], `9,15 (${r},11) が山でない`).toBe(M);
      expect(FIELD['11,15'].tiles[r][0], `11,15 (${r},0) が山でない`).toBe(M);
    }
    // 扉の真上は 10,14 の石とスイッチの扉（ここ以外から入れない）
    expect([FIELD['10,14'].tiles[9][5], FIELD['10,14'].tiles[9][6]]).toEqual([TILE.GATE, TILE.GATE]);
    // 淵＝どの列でも rows 4-5 が両方水＝はしご（両岸が地上の1セル）では渡れない
    for (let c = 1; c <= 10; c++) {
      expect([h.bgTiles[`4,${c}`], h.bgTiles[`5,${c}`]], `10,15 col ${c} の淵が幅2でない`)
        .toEqual([TILE.WATER, TILE.WATER]);
    }
    // 看板は本文を持つ（i タイルは本文必須）
    expect(h.signData['3,4']?.lines?.length, '淵の立て札に本文が無い').toBeGreaterThan(0);

    // 出入口の対応
    const registry = {};
    for (const [lk, ld] of gameLayerEntries(MAP)) {
      for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
        for (const [pk, me] of Object.entries(sd.mapEnters ?? {})) registry[me.id] = { layer: lk, stage: sk, pos: pk, destId: me.destId };
      }
    }
    expect(registry.fieldToDragonLair).toMatchObject({ layer: 'field', stage: '10,15', pos: '7,6', destId: 'dragonLair' });
    expect(registry.dragonLair).toMatchObject({ layer: 'dragon_lair', stage: '0,0', pos: '1,1', destId: 'fieldToDragonLair' });

    // 寄道は羽衣の後（魔王の岩牢の直後・塔の前）
    const ids = ORDER.map((o) => o.id);
    expect(ids[ids.indexOf('dragon_lair') - 1]).toBe('darklord_prison');
    expect(ORDER.find((o) => o.id === 'dragon_lair')?.optional).toBe(true);
    expect(MAP.layers.dragon_lair.name).toBe('邪竜の巣');
  });

  test('② 羽衣なしでは、はしごを持っていても前庭から淵を越えられない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url('field', '10,15', 2, 6, { ps_ladder: '1' }));
    await waitForBoard(page);
    await walkTiles(page, 'down', 5);
    expect((await at(page)).r, '歩いて（はしごで）淵に入れた').toBe(3);
    await page.evaluate(() => window.__game.toggleFlight());
    expect((await state(page)).flying, '羽衣なしで飛べた').toBe(false);
    expect(errors).toEqual([]);
  });

  test('③ 羽衣で淵を飛んで島に降り、洞の口に乗ると邪竜の巣へ入れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url('field', '10,15', 2, 6, { ps_wingrobe: '1' }));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.toggleFlight());
    expect((await state(page)).flying).toBe(true);
    await walkTiles(page, 'down', 4);
    expect(await at(page), '淵を越えて島 (6,6) まで飛べていない').toEqual({ r: 6, c: 6 });
    await page.evaluate(() => window.__game.toggleFlight());
    expect((await state(page)).flying, '島に降りられない').toBe(false);
    await walkTiles(page, 'down', 1);
    await page.waitForFunction(() => window.__game.getState().currentLayer === 'dragon_lair', null, { timeout: 3000 });
    expect(await state(page)).toMatchObject({ layer: 'dragon_lair', stage: '0,0' });
    expect(await page.evaluate(() => window.__game.getEnemies().length), '入口の洞に敵が居る').toBe(0);
    expect(errors).toEqual([]);
  });

  test('④ 飛行中でも 10,14 の柵の上から 10,15 の山の中へは遷移しない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // (8,3) は柵 (9,3) の真上の床。柵は飛んで越えられるが、その先の 10,15 (0,3) は山。
    await page.goto(url('field', '10,14', 8, 3, { ps_wingrobe: '1' }));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.toggleFlight());
    expect((await state(page)).flying).toBe(true);
    await walkTiles(page, 'down', 1);
    expect(await at(page), '柵の上へ飛べていない（前提が崩れている）').toEqual({ r: 9, c: 3 });
    expect(await walkAcross(page, 'down'), '飛行中に山の中へ遷移した').toBe('10,14');
    expect(await at(page)).toEqual({ r: 9, c: 3 });
    expect(errors).toEqual([]);
  });

  test('⑤ 邪竜の巣から出ると島に戻り、また飛び立てる（入って詰まない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url('dragon_lair', '0,0', 2, 1, { ps_wingrobe: '1' }));
    await waitForBoard(page);
    await walkTiles(page, 'up', 1);
    await page.waitForFunction(() => window.__game.getState().currentLayer === 'field', null, { timeout: 3000 });
    expect(await state(page)).toMatchObject({ layer: 'field', stage: '10,15', flying: false });
    const p = await at(page);
    expect(p.r >= 6 && p.r <= 8, `島の外 (${p.r},${p.c}) に戻った`).toBe(true);
    // 島から飛び立って淵を越え、前庭へ戻れる
    await page.evaluate(() => window.__game.toggleFlight());
    expect((await state(page)).flying, '島から飛び立てない').toBe(true);
    await walkTiles(page, 'up', 5);
    expect((await at(page)).r, '淵を越えて前庭へ戻れない').toBeLessThanOrEqual(3);
    expect(errors).toEqual([]);
  });
});
