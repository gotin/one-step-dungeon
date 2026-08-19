// tests/field-delta-o-lower.spec.js — Phase 9-6 深洋O ④: デルタ下半9画面 実エンジン検証
//
// scripts/migrate-field-delta-o-lower.mjs が作った 9 画面を **実ゲームで** 検証する。
// データ側（解ける / 詰まない / 道具を使わないと届かない / はしごで迂回できない）は
// 移行スクリプト内のソルバー全探索と tests/field-invariants.spec.js が担当するので、
// ここは「実エンジンで同じことが起きるか」だけを見る（設計 FIELD-9-6-DESIGN.md §19-11-I）。
//
// 上半 D1〜D5 が「1画面1道具の総復習」だったのに対し、下半は **ロアの収束＋聖域**：
//   12,18 海の石碑A ＋ 海草の隠し    … 剣で茂みを刈って宝へ（🔑 bushBurned 封印は作らない）
//   13,18 D7 はしごの縦橋            … 縦1セル幅の水を渡って中州へ
//   14,18 D8 弓の縦撃ち              … 水で隔離した 'Y' を南向きの矢で叩き '=' を開ける
//   15,18 海の石碑B ＋ ブーメラン献灯 … 火元は最奥（1投で全灯する唯一の配置）
//   11,19 聖域                        … **火元 0 本**＝ロウソクで 3 本灯してハートの器
//   12,19 海の主の闘技場              … ':'(ボス扉) の上に着地でき、退場でロックが解ける
//   13,19 D10 大通りの跡              … 海草の隠し（2 枚目）
//   14,19 D11 沈没船と石の物置        … 石を 2 回押して物置へ入る
//   15,19 隠し報酬                    … 爆弾壁＋笛の二重封印
//
// ⚠ 実エンジンの移動は半セル単位（MOVE_STEP=0.5）＝1タイル = movePlayer 2回（walkTiles）。
// ⚠ 道具は heroDir 方向へ飛ぶ。face(dir) は setHeroDir フックで位置を変えず向きだけ決める。
// ⚠ 投擲物・爆弾は step(1) を複数回まわして飛翔/爆発を進める（ブーメランは往復ぶん多め）。
// ⚠ 石押しはクールダウンがあるので 1 回ごとに wall-clock で待つ（upper spec と同じ 700ms）。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const FIELD = MAP.layers.field.stages;

const DELTA_LOWER = [
  { key: '12,18', role: '海の石碑A＋海草の隠し', enemies: 0 },
  { key: '13,18', role: 'D7 はしごの縦橋', enemies: 0 },
  { key: '14,18', role: 'D8 弓の縦撃ち', enemies: 0 },
  { key: '15,18', role: '海の石碑B＋ブーメラン献灯', enemies: 0 },
  { key: '11,19', role: '聖域（ロウソクの献灯）', enemies: 0 },
  { key: '12,19', role: '海の主の闘技場', enemies: 1 },
  { key: '13,19', role: 'D10 大通りの跡', enemies: 0 },
  { key: '14,19', role: 'D11 沈没船と石の物置', enemies: 0 },
  { key: '15,19', role: '隠し報酬（爆弾＋笛）', enemies: 0 },
];

/** 陸で、tiles にコンテンツが無いセル一覧（プレイヤーを置ける場所）。 */
function landCells(stage) {
  const out = [];
  for (let r = 0; r < stage.tiles.length; r++) {
    for (let c = 0; c < stage.tiles[r].length; c++) {
      if (stage.bgTiles?.[`${r},${c}`] === TILE.WATER) continue;
      const ch = stage.tiles[r][c];
      if (ch !== TILE.FLOOR && ch !== ' ') continue;
      out.push([r, c]);
    }
  }
  return out;
}

const cellsWith = (stage, ch) => {
  const out = [];
  for (let r = 0; r < stage.tiles.length; r++)
    for (let c = 0; c < stage.tiles[r].length; c++)
      if (stage.tiles[r][c] === ch) out.push(`${r},${c}`);
  return out;
};

function previewUrl(key, row, col, extra = {}) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: 'field', stage: key,
    row: String(row), col: String(col),
    // §8-1: 深洋O は道具総復習の場＝全道具所持。下半は **ロウソクと笛** も要る。
    // ⚠ ps_ladder は必須（はしご迂回の罠を実プレイと同条件で踏むため）。
    // ⚠ ps_silverboomerang は渡さない＝ボス報酬（銀のブーメラン）の授与を観測するため。
    ps_weapon: '1', ps_bomb: '1', ps_bow: '1', ps_boomerang: '1', ps_ladder: '1',
    ps_candle: '1', ps_flute: '1',
    ...extra,
  });
  return `${GAME}?${p.toString()}`;
}

/** n タイル歩く（1 タイル = movePlayer 2回）。 */
async function walkTiles(page, dir, tiles = 1) {
  await page.evaluate(({ d, n }) => {
    for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
  }, { d: dir, n: tiles });
}

/** プレイヤーの整数タイル座標（toTileRow/Col と同じ floor(v+0.5)）。 */
const at = (page) => page.evaluate(() => {
  const p = window.__game.getState().player;
  return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});

/** 位置を変えずに heroDir だけ dir に向ける（踏んで戻す方式は rewind で反転するため）。 */
async function face(page, dir) {
  await page.evaluate((d) => { window.__game.setHeroDir(d); window.__game.step(1); }, dir);
}

/** activeSubItem を id に切り替える（切替 API が無いので直接書く）。 */
async function equip(page, id) {
  await page.evaluate((sub) => { window.__game.getPlayer().activeSubItem = sub; }, id);
}

/** 道具を1回使い、tick を n 回まわして投擲物/爆発を進める。 */
async function useTool(page, ticks = 30) {
  await page.evaluate((n) => {
    window.__game.useSubItem();
    for (let i = 0; i < n; i++) window.__game.step(1);
  }, ticks);
}

/**
 * 剣を1回振る（茂み刈り）。振っている間は移動入力が食われる（実測：直後に walkTiles すると
 * 4 回の movePlayer のうち 2 回が swing に吸われて 1 タイルしか進まない）∴振り終わるまで回す。
 */
async function slash(page, ticks = 12) {
  await page.evaluate((n) => {
    window.__game.swordAttack();
    for (let i = 0; i < n; i++) window.__game.step(1);
  }, ticks);
}

const ss = (page) => page.evaluate(() => window.__game.getStageState());

/** ある画面へ入り、1 tick 進めて安定させる。 */
async function enter(page, key, row, col, extra = {}) {
  await page.goto(previewUrl(key, row, col, extra));
  await waitForBoard(page);
  await page.evaluate(() => window.__game.step(1));
}

test.describe('Phase 9-6 深洋O ④ – デルタ下半9画面 実エンジン検証', () => {

  for (const { key, role, enemies } of DELTA_LOWER) {
    test(`① ${key} (${role}) が起動し陸に立てて、敵は ${enemies} 体`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));

      const stage = FIELD[key];
      const land = landCells(stage);
      expect(land.length, `${key} に立てる陸セルが無い（全画面 playable 違反）`).toBeGreaterThan(0);
      const [row, col] = land[0];

      await enter(page, key, row, col);

      const snap = await page.evaluate(() => ({
        player: window.__game.getState().player,
        enemies: window.__game.getEnemies().length,
      }));
      expect(snap.player.y, `${key} のプレイヤー行がずれた`).toBe(row);
      expect(snap.player.x, `${key} のプレイヤー列がずれた`).toBe(col);
      // 戦闘は闘技場 12,19 だけに閉じる（§19-8 分離原則）。
      expect(snap.enemies, `${key} の敵数が設計と違う`).toBe(enemies);
      expect(errors, `${key} で pageerror`).toEqual([]);
    });
  }

  // ② 12,18 / ③ 13,19: 海草（茂み）で囲った宝。剣で刈らないと入れない。
  // 🔑 封印トリガーは使わない（剣で刈っても ss.bushBurned は立たない＝ロウソク前提の
  //    bushBurned 封印は永久ソフトロックになる。§19-11-I の発見②）∴「物理的な囲い」で守る。
  for (const [key, standAt, bushAt, chestAt] of [
    ['12,18', [7, 7], '7,6', '7,5'],
    ['13,19', [8, 7], '8,6', '8,5'],
  ]) {
    test(`② ${key}: 海草 ${bushAt} を剣で刈らないと宝 ${chestAt} へ入れない`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));

      const stage = FIELD[key];
      expect(stage.tiles[Number(bushAt.split(',')[0])][Number(bushAt.split(',')[1])],
        `${key} の ${bushAt} が海草でない`).toBe(TILE.BUSH);
      expect(cellsWith(stage, 'B'), `${key} の宝が ${chestAt} でない`).toEqual([chestAt]);
      // 隠し封印を持たないこと＝剣で刈れば必ず開く（bushBurned のソフトロックを作らない）。
      expect(stage.showConditions?.[chestAt], `${key} の宝に封印が付いている（bushBurned の罠）`)
        .toBeUndefined();

      const [row, col] = standAt;
      await enter(page, key, row, col);

      // 刈る前は海草で弾かれる。
      await face(page, 'left');
      await walkTiles(page, 'left', 2);
      expect((await at(page)).c, `${key}: 海草を刈る前に宝へ入れてしまう＝隠しが飾り`).toBe(col);

      // 剣で1回刈ってから同じ道を歩く。
      await slash(page);
      await walkTiles(page, 'left', 2);
      expect(await at(page), `${key}: 海草を刈ったのに宝 ${chestAt} へ届かない`)
        .toMatchObject({ r: Number(chestAt.split(',')[0]), c: Number(chestAt.split(',')[1]) });
      expect(errors).toEqual([]);
    });
  }

  test('③ 13,18: はしごで縦1セル幅の水 (4,5) を渡って中州の宝 (6,6) へ届く', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['13,18'];
    expect(stage.bgTiles['4,5'], '13,18 のはしご橋 4,5 が水でない（橋にならない）').toBe(TILE.WATER);
    expect(stage.bgTiles['3,5'], '13,18 の北の橋脚 3,5 が陸でない').not.toBe(TILE.WATER);
    expect(stage.bgTiles['5,5'], '13,18 の南の橋脚 5,5 が陸でない').not.toBe(TILE.WATER);
    expect(cellsWith(stage, 'B'), '13,18 の宝が 6,6 でない').toEqual(['6,6']);

    // はしご無しでは渡れない（進入軸=縦の幅1水はしご判定が本当に効いているかの対照）。
    await enter(page, '13,18', 3, 5, { ps_ladder: '0' });
    await walkTiles(page, 'down', 3);
    expect((await at(page)).r, 'はしご無しで縦の水を渡れてしまう＝はしごが飾り').toBe(3);

    // はしご有りなら渡れて、中州の宝へ届く。
    await enter(page, '13,18', 3, 5);
    await walkTiles(page, 'down', 3);      // 3,5 → 橋 4,5 → 5,5 → 6,5
    expect((await at(page)).r, 'はしごで縦の水 (4,5) を渡れない（進入軸の橋判定）')
      .toBeGreaterThanOrEqual(5);
    await walkTiles(page, 'right', 1);     // 6,5 → 6,6（宝）
    expect(await at(page), '橋を渡ったのに中州の宝 (6,6) へ届かない').toMatchObject({ r: 6, c: 6 });
    expect(errors).toEqual([]);
  });

  test('④ 14,18: 水で隔離した Y (4,5) を南向きの矢で叩くと潮 (8,8) が引き、宝島 (5,8) へ渡れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['14,18'];
    expect(cellsWith(stage, TILE.SWITCH), '14,18 の Y が 4,5 でない').toEqual(['4,5']);
    // Y は四方水で隔離＝歩いて剣で叩けない（弓でだけ叩ける）。
    for (const [r, c] of [[3, 5], [5, 5], [4, 4], [4, 6]])
      expect(stage.bgTiles[`${r},${c}`], `14,18 の Y 隣 (${r},${c}) が水でない＝剣で叩けて弓の意味が消える`)
        .toBe(TILE.WATER);
    expect(stage.links.map((l) => l.gateId), '14,18 の links が潮ゲート 8,8 に繋がっていない')
      .toContain('8,8');
    expect(stage.bgTiles['8,8'], '14,18 の潮ゲート 8,8 の下地が水').not.toBe(TILE.WATER);

    // 潮が引く前は '=' で弾かれる。
    await enter(page, '14,18', 8, 9);
    await walkTiles(page, 'left', 1);
    expect((await at(page)).c, '潮ゲートが閉じているのに通れる＝ゲートが飾り').toBe(9);

    // 北の桟橋 (1,5) から**南へ**矢を撃つ（間の水を越えて Y(4,5) に当たる）。
    await enter(page, '14,18', 1, 5);
    await face(page, 'down');
    await equip(page, 'bow');
    await useTool(page, 30);

    const opened = await ss(page);
    expect(opened.switchToggles, '水越しの縦撃ちで Y(4,5) が叩けていない').toContain('4,5');
    expect(opened.openGates, 'Y を叩いても潮ゲート 8,8 が開かない').toContain('8,8');

    // 開けたまま宝島へ：(1,5)→東の陸柱 col11→南下→row8 を西へ→ゲートを北上。
    await walkTiles(page, 'right', 6);   // 1,5 → 1,11
    await walkTiles(page, 'down', 7);    // 1,11 → 8,11
    await walkTiles(page, 'left', 3);    // 8,11 → 8,8（開いた潮ゲート）
    await walkTiles(page, 'up', 3);      // 8,8 → 7,8 → 6,8 → 5,8（宝）
    expect(await at(page), '潮を引かせたのに宝島 (5,8) へ渡れない（下地が水／openGates が効いていない）')
      .toMatchObject({ r: 5, c: 8 });
    expect(errors).toEqual([]);
  });

  test('⑤ 15,18: 火元は最奥 (4,9)。1投のブーメランで全かがり火が灯り宝 (3,8) が出る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['15,18'];
    expect(cellsWith(stage, TILE.TORCH).sort(), '15,18 のかがり火が 4,7/4,8/4,9 でない')
      .toEqual(['4,7', '4,8', '4,9']);
    // 火元は投擲点 (4,6) から**最も遠い** (4,9)。手前だと往路で炎を拾えず1投で全灯しない。
    expect(stage.initLitTorches ?? [], '15,18 の火元（初期点灯）が最奥 4,9 でない').toEqual(['4,9']);
    expect(stage.showConditions?.['3,8']?.trigger, '15,18 の宝が torchesLit 封印でない').toBe('torchesLit');

    await enter(page, '15,18', 4, 6);
    expect((await ss(page)).conditionsMet, '何もしていないのに封印が解けている（火元だけで充足＝飾り）')
      .toEqual([]);

    await face(page, 'right');
    await equip(page, 'boomerang');
    await useTool(page, 80);   // 往復してキャッチするまで回す

    const lit = await ss(page);
    expect(lit.litTorches.sort(), 'ブーメランで炎を運んでも全かがり火が灯らない')
      .toEqual(['4,7', '4,8', '4,9']);
    expect(lit.conditionsMet, '全かがり火を灯しても torchesLit で宝の封印が解けない').toContain('3,8');
    expect(errors).toEqual([]);
  });

  test('⑥ 11,19 聖域: 火元 0 本からロウソクで 3 本灯すとハートの器 (5,6) が現れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['11,19'];
    expect(cellsWith(stage, TILE.TORCH).sort(), '聖域のかがり火が 5,5/5,7/7,6 でない')
      .toEqual(['5,5', '5,7', '7,6']);
    // 献灯の儀＝**火元が無い**（ブーメランの炎運搬では解けない＝ロウソク専用）。
    expect(stage.initLitTorches ?? [], '聖域に初期点灯があると献灯の儀にならない').toEqual([]);
    expect(stage.showConditions?.['5,6']?.trigger, '聖域の宝が torchesLit 封印でない').toBe('torchesLit');
    expect(stage.chestContents?.['5,6']?.type, '聖域の宝がハートの器でない').toBe('heartContainer');
    // 🔑 祭壇 '^' を置かない（踏むと offerAtAltar が発火し hasAltar のマップ走査にも乗る）。
    expect(cellsWith(stage, TILE.ALTAR), '聖域に祭壇 ^ がある（offerAtAltar が誤発火する）').toEqual([]);

    await enter(page, '11,19', 4, 5);
    expect((await ss(page)).conditionsMet, '何もしていないのに器の封印が解けている').toEqual([]);
    await equip(page, 'candle');

    await face(page, 'down');
    await useTool(page, 4);              // (4,5) の南 = かがり火 5,5
    await walkTiles(page, 'right', 2);   // 4,5 → 4,6 → 4,7
    await face(page, 'down');
    await useTool(page, 4);              // (4,7) の南 = かがり火 5,7
    await walkTiles(page, 'left', 1);    // 4,7 → 4,6
    await walkTiles(page, 'down', 2);    // 4,6 → 5,6（宝の上）→ 6,6
    await face(page, 'down');
    await useTool(page, 4);              // (6,6) の南 = かがり火 7,6

    const lit = await ss(page);
    expect(lit.litTorches.sort(), 'ロウソクで 3 本すべて灯せない（火元なしの献灯が成立しない）')
      .toEqual(['5,5', '5,7', '7,6']);
    expect(lit.conditionsMet, '3 本灯してもハートの器の封印が解けない').toContain('5,6');
    expect(errors).toEqual([]);
  });

  test('⑦ 12,19: ボス扉 ":" の上に着地できて闘技場が閉じ、退場後の宝箱で銀のブーメランを受け取る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const CHEST = '2,5';
    const stage = FIELD['12,19'];
    expect(stage.isBossRoom, '12,19 が isBossRoom でない').toBe(true);
    expect(cellsWith(stage, TILE.SEA_LORD), '12,19 の海の主が 4,5 でない').toEqual(['4,5']);
    // ボス扉は**プレイヤーが着地する境界セルそのもの**（内側に置くと入場直後に閉じ込められる）。
    expect(cellsWith(stage, TILE.DOORWAY_BOSS).sort(), 'ボス扉が四隅の入口セルに無い')
      .toEqual(['4,0', '4,11', '5,0', '5,11']);
    // 2026-08-19 ユーザー確定：報酬は淵の北の回廊に**宝箱**で現れる（その場で授与しない）。
    // ∴bossReward は持たない（持つと宝箱と二重取得）。主は水の上にいる∴主の足元では渡せない。
    expect(stage.bossReward, '12,19 に bossReward が残っている＝宝箱と二重取得になる').toBeUndefined();
    expect(cellsWith(stage, TILE.CHEST), `12,19 の宝箱が ${CHEST} の1個だけでない`).toEqual([CHEST]);
    expect(stage.chestContents?.[CHEST], '宝箱の中身が銀のブーメランでない')
      .toEqual({ type: 'boomerang', boomerangTier: 1, name: '銀のブーメラン' });
    expect(stage.showConditions?.[CHEST]?.trigger, '宝箱に bossYielded 封印が無い＝戦う前に取れる')
      .toBe('bossYielded');

    // 東の入口 (5,11) は ':' ＝ここへ着地できることが設計の前提（隣画面から入ってくる位置）。
    await enter(page, '12,19', 5, 11);
    const before = await page.evaluate(() => {
      const p = window.__game.getState().player;
      return {
        tier: p.boomerangTier, hearts: p.maxHearts,
        conditionsMet: window.__game.getStageState().conditionsMet,
      };
    });
    expect(before.tier, '前提：銀ブーメラン未所持').toBeLessThan(1);
    expect(before.conditionsMet, '戦う前から宝箱の封印が解けている').not.toContain(CHEST);

    await page.waitForFunction(
      () => !document.getElementById('boss-hpbar')?.classList.contains('hidden'), { timeout: 5000 });
    expect(await page.evaluate(() => window.__game.getState().bossRoomLocked),
      'ボス部屋に入ったのにロックされない').toBe(true);

    await page.evaluate(() => {
      const boss = window.__game.getEnemies().find((e) => e.type === '{');
      window.__game.dealDamage(boss.id, Math.ceil(boss.maxHp * 0.9), 'sword');
    });
    // 終幕は async でメッセージを順に見せる∴「演出が終わったか」を待ってから歩かせる
    // （途中はゲームループが止まっている＝歩けない）。
    await page.waitForFunction(
      (cell) => window.__game.getStageState().conditionsMet.includes(cell), CHEST, { timeout: 20000 });
    await page.waitForFunction(() => !window.__game.getState().bossDefeating, { timeout: 20000 });
    expect(await page.evaluate(() => window.__game.getEnemies().some((e) => e.type === '{')),
      '合格しても海の主が居残っている').toBe(false);

    const yielded = await page.evaluate(() => {
      const p = window.__game.getState().player;
      return {
        tier: p.boomerangTier, hearts: p.maxHearts,
        locked: window.__game.getState().bossRoomLocked,
        opened: window.__game.getStageState().openedChests,
      };
    });
    expect(yielded.locked, '海の主が退場してもロックが解けない（聖域へ抜けられない）').toBe(false);
    expect(yielded.tier, '宝箱を開ける前に銀ブーメランが手に入っている').toBeLessThan(1);
    expect(yielded.opened, '宝箱が勝手に開いている').not.toContain(CHEST);
    expect(yielded.hearts, 'ここでハートの器が増えた（器は聖域の宝箱に置いたはず）').toBe(before.hearts);

    // 淵の北の回廊まで歩いて自分で開ける。闘技場は中央が淵（rows3-6 × cols4-7 が水）の
    // **リング**∴row5 を直進すると 5,7 の水で止まる。東の辺を北上して北の回廊へ回り込む：
    //   5,11 →(左3) 5,8 →(上3) 2,8 →(左3) 2,5（宝箱）。row2 の 'h'（2,2 / 2,9）は跨がない。
    await walkTiles(page, 'left', 3);
    await walkTiles(page, 'up', 3);
    await walkTiles(page, 'left', 3);
    expect(await at(page), '宝箱のセルへ歩いて着けない').toEqual({ r: 2, c: 5 });

    const got = await page.evaluate(() => {
      const p = window.__game.getState().player;
      return {
        tier: p.boomerangTier, hasBoomerang: !!p.hasBoomerang,
        opened: window.__game.getStageState().openedChests,
        msg: document.getElementById('msg-bar')?.textContent ?? '',
      };
    });
    expect(got.opened, '宝箱を踏んでも開かない').toContain(CHEST);
    expect(got.tier, '宝箱から銀のブーメランが出ない').toBeGreaterThanOrEqual(1);
    expect(got.hasBoomerang, 'ブーメランを持っていない').toBe(true);
    expect(got.msg, '入手メッセージが出ない').toContain('銀のブーメラン');
    expect(errors).toEqual([]);
  });

  test('⑧ 14,19: 石 (5,7) を 2 回押して物置に入り、宝 (7,8) へ届く', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['14,19'];
    expect(cellsWith(stage, TILE.STONE), '14,19 の石が 5,7 でない').toEqual(['5,7']);
    expect(cellsWith(stage, 'B'), '14,19 の宝が 7,8 でない').toEqual(['7,8']);
    // 物置の唯一の入口が石のセル（他は崩れ壁 'h' で囲われている）。
    for (const pk of ['5,6', '5,8', '6,6', '6,9', '7,6', '7,9', '8,7', '8,8'])
      expect(stage.tiles[Number(pk.split(',')[0])][Number(pk.split(',')[1])],
        `14,19 の物置の囲い ${pk} が 'h' でない＝石を押さずに回り込める`).toBe(TILE.HOUSE_WALL);

    await enter(page, '14,19', 4, 7);
    const push = async (dir) => {
      await page.evaluate((d) => { window.__game.movePlayer(d); window.__game.step(1); }, dir);
      await page.waitForTimeout(700);   // 石押しのクールダウン
    };
    await push('down');   // 石 5,7 → 6,7、プレイヤー → 5,7
    await push('down');   // 石 6,7 → 7,7、プレイヤー → 6,7

    const stones = await page.evaluate(() =>
      Object.values(window.__game.getStageState().stonePositions).map((s) => `${s.r},${s.c}`));
    expect(stones, '石が 2 回押せていない（クールダウン待ち不足 or 押し先が壁）').toContain('7,7');
    expect(await at(page), '石を押した後にプレイヤーが物置へ入れていない').toMatchObject({ r: 6, c: 7 });

    await walkTiles(page, 'right', 1);   // 6,7 → 6,8
    await walkTiles(page, 'down', 1);    // 6,8 → 7,8（宝）
    expect(await at(page), '物置に入ったのに宝 (7,8) へ届かない').toMatchObject({ r: 7, c: 8 });
    expect(errors).toEqual([]);
  });

  test('⑨ 15,19: 爆弾で壁 (5,7) を壊し、さらに笛を吹かないと宝 (6,7) は現れない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['15,19'];
    expect(cellsWith(stage, TILE.BREAKABLE_WALL), '15,19 の爆弾壁が 5,7 でない').toEqual(['5,7']);
    expect(stage.breakableWalls?.['5,7']?.breakDef, '15,19 爆弾壁の breakDef が未設定').toBeGreaterThan(0);
    expect(stage.bgTiles['5,7'], '15,19 爆弾壁 5,7 の下地が水（壊しても通れない）').not.toBe(TILE.WATER);
    expect(stage.showConditions?.['6,7']?.trigger, '15,19 の宝が flutePlayed 封印でない').toBe('flutePlayed');
    // 笛は stageData.fluteEffect が無いと鳴らない（＝封印が永久に解けない）。
    expect(stage.fluteEffect?.type, '15,19 に fluteEffect が無い（笛が鳴らず封印が解けない）').toBe('reveal');

    await enter(page, '15,19', 4, 7);
    // 壊す前は金庫に入れない。
    await walkTiles(page, 'down', 2);
    expect((await at(page)).r, '爆弾壁を壊す前に金庫へ入れてしまう＝壁が飾り').toBe(4);

    await equip(page, 'bomb');
    await useTool(page, 40);
    expect((await ss(page)).brokenWalls, '爆弾で 5,7 の壁が壊れていない').toContain('5,7');

    // 壁を壊しただけでは宝は出ない（二重封印）。
    const mid = await ss(page);
    expect(mid.conditionsMet, '壁を壊しただけで宝が出た＝笛の封印が飾り').not.toContain('6,7');

    await equip(page, 'flute');
    await useTool(page, 10);
    const done = await ss(page);
    expect(done.flutePlayed, '笛を吹いても flutePlayed が立たない').toBe(true);
    expect(done.conditionsMet, '笛を吹いても宝 (6,7) の封印が解けない').toContain('6,7');

    // 二重封印を両方解けば宝へ歩ける。
    await walkTiles(page, 'down', 2);
    expect(await at(page), '両方解いたのに宝 (6,7) へ歩けない').toMatchObject({ r: 6, c: 7 });
    expect(errors).toEqual([]);
  });

  test('⑩ 下半の継ぎ目が見た目どおり通れる（塞いだ継ぎ目は両側とも水）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // ':'（ボス扉）は SOLVABLE_GATES ＝isHardBlocked が false ∴「開いている」と数える
    // （passable.js STATEFUL_TILES も ':' を含まない＝着地できる。§19-11-I の発見①）。
    const isOpen = (stage, r, c) =>
      stage.bgTiles?.[`${r},${c}`] !== TILE.WATER
      && [TILE.FLOOR, ' ', TILE.DOORWAY_BOSS].includes(stage.tiles[r][c]);

    // 通れるべき継ぎ目（key は "col,row"）。
    //   15,17(上半 D5) →南→ 15,18 が下半への入口。row18 は東西に一本、
    //   14,18 →南→ 14,19 が row19 への唯一の降り口。row19 は西へ聖域まで繋がる。
    const PAIRS = [
      ['15,17', '15,18', 'down'],   // 上半 → 下半（入口）
      ['12,18', '13,18', 'right'],
      ['13,18', '14,18', 'right'],
      ['14,18', '15,18', 'right'],
      ['14,18', '14,19', 'down'],   // row18 → row19 の唯一の降り口
      ['13,19', '14,19', 'right'],
      ['14,19', '15,19', 'right'],
      ['13,19', '12,19', 'left'],   // 闘技場へ（東のボス扉に着地できるか）
      ['11,19', '12,19', 'right'],  // 聖域から闘技場へ（西のボス扉に着地できるか）
    ];
    const DELTA_OF = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

    const walls = [];
    for (const [aKey, bKey, dir] of PAIRS) {
      const [a, b] = [FIELD[aKey], FIELD[bKey]];
      expect(a && b, `${aKey} / ${bKey} が地図に無い`).toBeTruthy();
      const rows = a.tiles.length, cols = a.tiles[0].length;
      const crossings = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const onEdge = (dir === 'down' && r === rows - 1) || (dir === 'up' && r === 0)
          || (dir === 'left' && c === 0) || (dir === 'right' && c === cols - 1);
        if (!onEdge) continue;
        // 角セルは斜め遷移が曖昧なので候補から外す。
        if ((r === 0 || r === rows - 1) && (c === 0 || c === cols - 1)) continue;
        const br = dir === 'down' ? 0 : dir === 'up' ? rows - 1 : r;
        const bc = dir === 'left' ? cols - 1 : dir === 'right' ? 0 : c;
        if (isOpen(a, r, c) && isOpen(b, br, bc)) crossings.push([r, c]);
      }
      expect(crossings.length, `${aKey}→${bKey} (${dir}) に両側開いた継ぎ目が無い`).toBeGreaterThan(0);

      const [r, c] = crossings[0];
      await page.goto(previewUrl(aKey, r, c));
      await waitForBoard(page);
      await walkTiles(page, dir, 1);
      const moved = await page
        .waitForFunction((want) => window.__game.getState().stageKey === want, bKey, { timeout: 1500 })
        .then(() => true).catch(() => false);
      if (!moved) {
        const now = await page.evaluate(() => {
          const s = window.__game.getState();
          return `${s.stageKey} @${s.player.y},${s.player.x}`;
        });
        walls.push(`${aKey} (${r},${c}) --${dir}--> ${bKey} で弾き返された（現在 ${now}）`);
      }
    }
    expect(walls, '継ぎ目は開いて見えるのに遷移がキャンセルされる＝「見えない壁」:\n' + walls.join('\n'))
      .toEqual([]);

    // 塞いだ継ぎ目（row18 の3枚 → row19）は**両側とも水**＝dead edge にならない形で閉じる。
    // 陸で閉じると「開いて見えるのに弾かれる」traps/seams になる。
    for (const [aKey, bKey] of [['12,18', '12,19'], ['13,18', '13,19'], ['15,18', '15,19']]) {
      const [a, b] = [FIELD[aKey], FIELD[bKey]];
      for (let c = 0; c < a.tiles[0].length; c++) {
        const aOpen = a.bgTiles?.[`${a.tiles.length - 1},${c}`] !== TILE.WATER;
        const bOpen = b.bgTiles?.[`0,${c}`] !== TILE.WATER;
        expect(aOpen || bOpen,
          `${aKey}↔${bKey} の col${c} が水で閉じていない（片側だけ陸＝見えない壁）`).toBe(false);
      }
    }
    expect(errors).toEqual([]);
  });
});
