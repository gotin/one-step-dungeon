// tests/field-delta-o.spec.js — Phase 9-6 深洋O ④: デルタ上半 D1〜D5 実エンジン検証
//
// scripts/migrate-field-delta-o.mjs が作った 5 画面（D1 `14,16` / D2 `15,16` /
// D3 `13,17` / D4 `14,17` / D5 `15,17`）を **実ゲームで** 検証する。データ側は移行
// スクリプト内のソルバー（状態空間の全探索で「解ける / 詰まない / 道具を使わないと
// 報酬に届かない / はしごで迂回できない」を固定）と tests/field-invariants.spec.js が
// 担当するので、ここは「実エンジンで同じことが起きるか」だけを見る。
//
// 廊下 ⑤ が潮ゲート＋石押しの「段階的難化」だったのに対し、上半は **1画面1道具の
// 総復習**（§19-11-G）＝到達時 O=7 で はしご・弓・爆弾・ブーメラン所持済み。
// ソルバーが緑でも実エンジンで壊れうる所を道具ごとに狙う:
//   D1 爆弾 : AOE 半径2の円内の '!'(breakDef≤3) が壊れるか。壊した先の宝へ歩けるか。
//   D2 はしご: 横1セル幅の水（両隣が陸）を進入軸で渡れるか。中州の宝へ届くか。
//   D3 弓   : 水越しに 'Y' を矢で叩けるか（isTilePassableForProj は WALL/未破壊'!'だけ
//             遮る＝矢は水/潮を越える）。叩くと '='(潮ゲート)が開いて宝島へ渡れるか。
//   D4 石押し: 石をボタン 'S' に載せると '='(潮ゲート)が開いたままになり中州の宝が出るか。
//   D5 ブーメラン: 火元1本から炎を運んで全 'H' を灯すと torchesLit で宝が出るか。
//
// ⚠ 実エンジンの移動は半セル単位（MOVE_STEP=0.5）＝1タイル = movePlayer 2回（walkTiles）。
//   道具は heroDir 方向へ飛ぶ。face(dir) は setHeroDir フックで位置を変えず向きだけ確定する
//   （踏んで戻す方式はかがり火列など通り抜け可能な地形で rewind が向きを反転させるため）。
// ⚠ 投擲物・爆弾は step(1) を複数回まわして飛翔/爆発を進める（1 tick では着弾しない）。
//   ブーメランはキャッチまで往復するので多めに回す。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const FIELD = MAP.layers.field.stages;

const DELTA = [
  { key: '14,16', role: 'D1 脇（爆弾壁）' },
  { key: '15,16', role: 'D2 デルタ玄関（はしご水渡り）' },
  { key: '13,17', role: 'D3（弓ゲート）' },
  { key: '14,17', role: 'D4 中央（石押し）' },
  { key: '15,17', role: 'D5（ブーメラン運搬・かがり火）' },
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
    // §8-1: 深洋O は道具総復習の場＝はしご・弓・爆弾・ブーメラン所持前提。
    // ⚠ ps_ladder は必須（はしご迂回の罠を実プレイと同条件で踏むため）。
    ps_weapon: '1', ps_bomb: '1', ps_bow: '1', ps_boomerang: '1', ps_ladder: '1',
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
  return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5), y: p.y, x: p.x };
});

/**
 * 位置を変えずに heroDir だけ dir に向ける。movePlayer での「踏んで戻す」方式は、
 * 壁で弾かれる向きが無い画面（例: かがり火列を通り抜けられる D5）では rewind が
 * heroDir を反転させてしまうので、専用の setHeroDir フックで向きだけ確定させる。
 */
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

test.describe('Phase 9-6 深洋O ④ – デルタ上半 D1〜D5 実エンジン検証', () => {

  for (const { key, role } of DELTA) {
    test(`① ${key} (${role}) が起動し陸に立てて、戦闘ゼロ（§19-8 分離原則）`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));

      const stage = FIELD[key];
      const land = landCells(stage);
      expect(land.length, `${key} に立てる陸セルが無い（全画面 playable 違反）`).toBeGreaterThan(0);
      const [row, col] = land[0];

      await page.goto(previewUrl(key, row, col));
      await waitForBoard(page);

      const snap = await page.evaluate(() => {
        window.__game.step(1);
        return {
          player: window.__game.getState().player,
          enemies: window.__game.getEnemies().length,
        };
      });
      expect(snap.player.y, `${key} のプレイヤー行がずれた`).toBe(row);
      expect(snap.player.x, `${key} のプレイヤー列がずれた`).toBe(col);
      expect(snap.enemies, `${key} は戦闘ゼロのはずが敵が spawn した`).toBe(0);
      expect(errors, `${key} で pageerror`).toEqual([]);
    });
  }

  test('② D1: 爆弾壁 (4,2) を爆弾で壊すと、その先の宝 (4,3) へ歩ける', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['14,16'];
    expect(cellsWith(stage, TILE.BREAKABLE_WALL), 'D1 の爆弾壁が 4,2 でない').toEqual(['4,2']);
    expect(stage.breakableWalls?.['4,2']?.breakDef, 'D1 爆弾壁の breakDef が未設定').toBeGreaterThan(0);
    // 罠: 爆弾壁の下地が水だと壊しても永久に不通。
    expect(stage.bgTiles['4,2'], 'D1 爆弾壁 4,2 の下地が水').not.toBe(TILE.WATER);

    // 爆弾壁の1つ左 (4,1) に立ち、壁 (4,2) を壊す（AOE 半径2＝隣接から届く）。
    await page.goto(previewUrl('14,16', 4, 1));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));

    // 閉じている間は東（宝 4,3）へ進めない。
    await walkTiles(page, 'right', 2);
    expect((await at(page)).c, '爆弾壁を壊す前に宝側へ入れてしまう＝飾り').toBeLessThan(2);

    // (4,1) で爆弾を置いて爆発させる。
    await page.goto(previewUrl('14,16', 4, 1));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));
    await equip(page, 'bomb');
    await useTool(page, 40);

    const broken = await page.evaluate(() => window.__game.getStageState().brokenWalls);
    expect(broken, '爆弾で 4,2 の壁が壊れていない').toContain('4,2');

    // 壊した先の宝 (4,3) へ歩けること（AOE で穴が開いた）。
    await walkTiles(page, 'right', 2);
    expect((await at(page)).c, '爆弾壁を壊したのに宝 (4,3) へ歩けない').toBeGreaterThanOrEqual(3);
    expect(errors).toEqual([]);
  });

  test('③ D2: はしご橋 (4,3 横1セル幅) を渡って中州の宝 (4,5) へ届く', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['15,16'];
    // はしご橋は横1セル幅の水（左 (4,2) 陸・右 (4,4) 陸）。
    expect(stage.bgTiles['4,3'], 'D2 のはしご橋 4,3 が水でない（橋にならない）').toBe(TILE.WATER);
    expect(stage.bgTiles['4,2'], 'D2 の橋脚 4,2 が陸でない').not.toBe(TILE.WATER);
    expect(stage.bgTiles['4,4'], 'D2 の橋脚 4,4 が陸でない').not.toBe(TILE.WATER);
    expect(cellsWith(stage, 'B'), 'D2 の宝が 4,5 でない').toEqual(['4,5']);

    // 橋脚 (4,2) に立ち、右（進入軸=横）へ渡って中州 (4,4)→(4,5) へ。
    await page.goto(previewUrl('15,16', 4, 2));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));

    await walkTiles(page, 'right', 3);   // 4,3(橋) → 4,4 → 4,5
    const after = await at(page);
    expect(after.c, 'はしご橋を渡って中州の宝 (4,5) へ届かない（進入軸の橋判定）')
      .toBeGreaterThanOrEqual(4);
    expect(after.r, 'はしご橋を渡ったら行がずれた').toBe(4);
    expect(errors).toEqual([]);
  });

  test('④ D3: 水越しに Y を矢で叩くと潮が引き、宝島 (5,6) へ渡れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['13,17'];
    expect(cellsWith(stage, TILE.SWITCH), 'D3 の Y が 2,6 でない').toEqual(['2,6']);
    // Y は水で隔離（歩いて剣で叩けない＝弓でだけ叩ける）。西の (2,2)〜(2,5) は水。
    for (const c of [2, 3, 4, 5])
      expect(stage.bgTiles[`2,${c}`], `D3 の Y 西 (2,${c}) が水でない＝歩いて剣で叩けて弓の意味が消える`)
        .toBe(TILE.WATER);
    expect(stage.links.map((l) => l.gateId), 'D3 の links が潮ゲート 6,6 に繋がっていない').toContain('6,6');
    expect(stage.bgTiles['6,6'], 'D3 の潮ゲート 6,6 の下地が水').not.toBe(TILE.WATER);

    // col1 の陸柱 (2,1) に立ち、東へ矢を撃つ（間の水を越えて Y(2,6) に当たる）。
    await page.goto(previewUrl('13,17', 2, 1));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));

    await face(page, 'right');
    await equip(page, 'bow');
    await useTool(page, 30);

    const opened = await page.evaluate(() => {
      const ss = window.__game.getStageState();
      return { toggles: ss.switchToggles, gates: ss.openGates.sort() };
    });
    expect(opened.toggles, '水越しの矢で Y(2,6) が叩けていない').toContain('2,6');
    expect(opened.gates, 'Y を叩いても潮ゲート 6,6 が開かない').toContain('6,6');

    // 開けたまま同じ画面で宝島 (5,6) へ渡る（下 row8 → (7,6) → gate(6,6) → (5,6)）。
    // (2,1) から col1 を南下 → row8 を東へ → col6 を北上して潮ゲートを渡る。
    expect(stage.bgTiles['5,6'], 'D3 の宝島 5,6 が水（開いても立てない）').not.toBe(TILE.WATER);
    await walkTiles(page, 'down', 6);    // 2,1 → 8,1
    await walkTiles(page, 'right', 5);   // 8,1 → 8,6
    await walkTiles(page, 'up', 3);      // 8,6 → 7,6 → gate 6,6 → 5,6
    const onIsland = await at(page);
    expect(onIsland, '潮を引かせたのに宝島 (5,6) へ渡れない（下地が水／openGates が効いていない）')
      .toMatchObject({ r: 5, c: 6 });
    expect(errors).toEqual([]);
  });

  test('⑤ D4: 石をボタン (7,2) に載せると潮が引いたままになり、中州の宝 (4,6) が出る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['14,17'];
    expect(cellsWith(stage, TILE.BUTTON), 'D4 のボタンが 7,2 でない').toEqual(['7,2']);
    expect(cellsWith(stage, TILE.STONE), 'D4 の石が 7,4 でない').toEqual(['7,4']);
    const byGate = new Map(stage.links.map((l) => [l.gateId, l.switchId]));
    expect(byGate.get('6,5'), 'D4 潮ゲート 6,5 が S(7,2) に繋がっていない').toBe('7,2');
    expect(byGate.get('6,6'), 'D4 潮ゲート 6,6 が S(7,2) に繋がっていない').toBe('7,2');
    expect(stage.showConditions?.['4,6']?.switchId, 'D4 の宝の封印が 7,2 のボタンでない').toBe('7,2');

    // 石 (7,4) の右 (7,5) に立ち、左へ2回押してボタン (7,2) へ載せる。
    await page.goto(previewUrl('14,17', 7, 5));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));
    expect(await page.evaluate(() => window.__game.getStageState().conditionsMet),
      '何もしていないのに宝の封印が解けている').toEqual([]);

    const push = async (dir) => {
      await page.evaluate((d) => { window.__game.movePlayer(d); window.__game.step(1); }, dir);
      await page.waitForTimeout(700);
    };
    await push('left');   // 石 7,4 → 7,3
    await push('left');   // 石 7,3 → 7,2（ボタン）

    const held = await page.evaluate(() => {
      const ss = window.__game.getStageState();
      return {
        stones: Object.values(ss.stonePositions).map((s) => `${s.r},${s.c}`),
        state: ss.switchStates['7,2'] ?? false,
        gates: ss.openGates.sort(),
        met: ss.conditionsMet,
      };
    });
    expect(held.stones, '石が 2 回押せていない（クールダウン待ち不足）').toContain('7,2');
    expect(held.state, '石を載せてもボタンが ON にならない').toBe(true);
    expect(held.gates, '石を載せても潮ゲートが開かない').toEqual(['6,5', '6,6']);

    // プレイヤーがボタンから離れても開いたまま（石が保持＝これが解法）。
    await walkTiles(page, 'right', 2);
    const stillOpen = await page.evaluate(() => {
      const ss = window.__game.getStageState();
      return { gates: ss.openGates.sort(), met: ss.conditionsMet };
    });
    expect(stillOpen.gates, '石が乗っているのに潮が閉じた（checkSwitchOff が石を見ていない）')
      .toEqual(['6,5', '6,6']);
    expect(stillOpen.met, '潮を引かせても宝の封印が解けない').toContain('4,6');
    expect(errors).toEqual([]);
  });

  test('⑥ D5: 火元から炎を運んで全かがり火 (5,5/6,5/7,5) を灯すと宝 (9,6) が出る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['15,17'];
    expect(cellsWith(stage, TILE.TORCH).sort(), 'D5 のかがり火が 5,5/6,5/7,5 でない')
      .toEqual(['5,5', '6,5', '7,5']);
    expect(stage.initLitTorches ?? [], 'D5 の火元（初期点灯）が 5,5 でない').toContain('5,5');
    expect(stage.showConditions?.['9,6']?.trigger, 'D5 の宝が torchesLit 封印でない').toBe('torchesLit');

    // ブーメランは「点いたかがり火を通過して flaming を拾い、その後に通る消えた
    // かがり火へ点火」する（projectile.js collectAlongBoomerang）。火元は最奥 (5,5)、
    // 未点灯は手前 (6,5)(7,5)。南 (8,5) に立って**上**へ投げると、往路 7,5→6,5→5,5 で
    // 火元の炎を拾い（射程3で丁度届く）、復路 5,5→6,5→7,5 で 2本を灯す＝1投で全灯。
    await page.goto(previewUrl('15,17', 8, 5));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));
    expect(await page.evaluate(() => window.__game.getStageState().conditionsMet),
      '何もしていないのに宝の封印が解けている（火元だけで充足＝飾り）').toEqual([]);

    await face(page, 'up');
    await equip(page, 'boomerang');
    // ブーメランは往復するので tick を多めに回してキャッチまで進める。
    await useTool(page, 80);

    const lit = await page.evaluate(() => {
      const ss = window.__game.getStageState();
      return { litTorches: (ss.litTorches ?? []).sort(), met: ss.conditionsMet };
    });
    expect(lit.litTorches, 'ブーメランで炎を運んでも全かがり火が灯らない')
      .toEqual(['5,5', '6,5', '7,5']);
    expect(lit.met, '全かがり火を灯しても torchesLit で宝の封印が解けない').toContain('9,6');
    expect(errors).toEqual([]);
  });

  // ⑦ 継ぎ目: 廊下 C4 (15,15) → デルタ玄関 D2 (15,16) の遷移が実際に起きる。
  // ⑥-footprint の回帰: 見た目が開いた継ぎ目が本当に通れること（南北とも）。
  test('⑦ デルタ内部と入口の継ぎ目が見た目どおり通れる（実際に画面が変わる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const isOpen = (stage, r, c) =>
      stage.bgTiles?.[`${r},${c}`] !== TILE.WATER
      && [TILE.FLOOR, ' '].includes(stage.tiles[r][c]);

    // デルタ内部の隣接（設計 §19-11-G のミラー入口を含む）。
    //   15,15(C4) →南→ 15,16(D2 入口)  / 15,16 ↔ 14,16(D1)・15,17(D5)
    //   14,17(D4) ↔ 13,17(D3)・15,17(D5)・14,16(D1)
    const PAIRS = [
      ['15,15', '15,16', 'down'],  // 廊下→玄関（唯一の入口）
      ['15,16', '14,16', 'left'],  // 玄関→D1（西）
      ['15,16', '15,17', 'down'],  // 玄関→D5（南）
      ['14,17', '13,17', 'left'],  // D4→D3（西）
      ['14,17', '14,16', 'up'],    // D4→D1（北）
      ['14,17', '15,17', 'right'], // D4→D5（東・key は "col,row" なので 15,17 は東隣）
    ];
    const DELTA_OF = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

    const walls = [];
    for (const [aKey, bKey, dir] of PAIRS) {
      const [a, b] = [FIELD[aKey], FIELD[bKey]];
      expect(a && b, `${aKey} / ${bKey} が地図に無い`).toBeTruthy();
      const [dr, dc] = DELTA_OF[dir];
      // a 側の出口セル（dir へ抜ける外周セル）を、両側とも開いている列で探す。
      const cols = a.tiles[0].length, rows = a.tiles.length;
      const crossings = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        // a の外周セルが dir 方向の境界にあること。
        const onEdge = (dir === 'down' && r === rows - 1) || (dir === 'up' && r === 0)
          || (dir === 'left' && c === 0) || (dir === 'right' && c === cols - 1);
        if (!onEdge) continue;
        // 角セル（col0/col11 かつ row0/row9）は斜め遷移が曖昧なので継ぎ目候補から外す。
        const isCorner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
        if (isCorner) continue;
        // 遷移先 b のセル（反対の境界）。
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
    expect(
      walls,
      '継ぎ目は開いて見えるのに遷移がキャンセルされる＝「見えない壁」:\n' + walls.join('\n'),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
});
