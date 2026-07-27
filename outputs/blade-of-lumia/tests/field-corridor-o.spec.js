// tests/field-corridor-o.spec.js — Phase 9-6 深洋O ⑤: 廊下C1〜C4（潮ゲート＋石押し）実エンジン検証
//
// scripts/migrate-field-corridor-o.mjs が作った 4 画面（C1 `15,12` 〜 C4 `15,15`）を
// **実ゲームで** 検証する。データ側は移行スクリプト内のソルバー（状態空間の全探索で
// 「解ける / 詰まない / ゲートを迂回できない」を固定）と tests/field-invariants.spec.js が
// 担当するので、ここは「実エンジンで同じことが起きるのか」だけを見る。
//
// ソルバーが緑でも実エンジンで壊れうる箇所が3つある。そこを狙う:
//   ① 潮ゲートは「開いたのに歩けない」形になりやすい。passable.js tilePassable は
//      isWaterAt() を TIDE_GATE 判定より先に見るので、ゲートの下地が水だと openGates に
//      入っても永久に不通（見た目だけ開く）。∴ 実際に**歩いて渡れるか**で見る。
//   ② ボタン 'S' はモーメンタリ。プレイヤーが降りると閉じる＝石で押さえるのが解法。
//      これが逆（踏んだら開いたまま）だとパズルが崩壊するので、
//      「踏む→開く→降りる→閉じる」「石を載せる→降りても開いたまま」の両方を見る。
//   ③ はしごは1セル幅の水を渡れる（isLadderBridge）。ゲートの隣に1セル幅の水路が
//      あるとパズルを迂回できる。移行スクリプトが幾何で禁じているので、
//      ここでは「ゲートを閉じたまま南に抜けられない」を実エンジンで確かめる。
//
// ⚠ 実エンジンの移動は **半セル単位**（constants.js MOVE_STEP=0.5）。movePlayer 1回では
//   タイルを跨がず、toTileCol は floor(x+0.5) なので「半分だけ隣に入った」状態になる。
//   ここを間違えると、
//     - ボタンに乗ったつもりで乗れていない（handleTileEvent は整数セルで判定）
//     - 剣の前方セルが1つ先にずれる（swordAttack は player.x±1 を見る）
//   ∴ 1タイル歩く = movePlayer 2回（walkTiles）。向きだけ変えて叩く時は
//   「半歩入って叩き、半歩戻る」（faceAndStrike）で整数セルに揃え直す。
//   ※ スイッチ 'Y' は tilePassable に禁止規則が無い＝**歩いて乗れる**タイルなので、
//     看板 'i' のように「移動が壁で弾かれて向きだけ変わる」当てにはできない。
//
// ⚠ 石押しは実時間クールダウン（STONE_PUSH_COOLDOWN_MS=600ms）。押しは1回で
//   丸ごと1タイル進む（player も石の元セルへ整数座標で移動する）ので、
//   walkTiles と混ぜず push() で 650ms 空けて1回ずつ送る。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const FIELD = MAP.layers.field.stages;

const CORRIDOR = [
  { key: '15,12', role: 'C1 潮の教' },
  { key: '15,13', role: 'C2 石で保持' },
  { key: '15,14', role: 'C3 順序依存' },
  { key: '15,15', role: 'C4 複合' },
];

/** 画面の「陸で、tiles にコンテンツが無い」セル一覧（プレイヤーを置ける場所）。 */
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
    // §8-1 tool timing: 深洋O は D6 の後＝道具は揃っている前提。
    // ⚠ ps_ladder は必須。はしごを持っていないプレイヤーで検証すると
    //   「はしごで1セル幅の水を渡ってゲートを迂回できる」罠を素通りさせてしまう
    //   （実プレイのプレイヤーは必ず持っている＝テストが実プレイより甘くなる）。
    ps_weapon: '1', ps_bomb: '1', ps_bow: '1', ps_boomerang: '1', ps_ladder: '1',
    ...extra,
  });
  return `${GAME}?${p.toString()}`;
}

/** n タイル歩く（MOVE_STEP=0.5 なので 1 タイル = movePlayer 2回）。 */
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
 * dir へ1タイル歩いてから、その先のセルを剣で叩く。
 * 「1タイル歩く」＝ movePlayer 2回で整数セルに着地する、が肝。半歩ずれた位置から
 * 叩くと swordAttack の前方セル（toTileCol(x±1)）が1つ先にずれるので、
 * 呼ぶ側は **叩きたいセルの2タイル手前** に立ってからこれを呼ぶ。
 */
async function walkAndStrike(page, dir, tiles = 1) {
  await walkTiles(page, dir, tiles);
  await page.evaluate(() => { window.__game.swordAttack(); window.__game.step(1); });
}

/**
 * 石を1タイル押す。
 *  - 押しは実時間クールダウン 600ms（STONE_PUSH_COOLDOWN_MS）で守られている
 *  - 押しの成立後、handleTileEvent / checkSwitchOff は
 *    setTimeout(STONE_PUSH_COOLDOWN_MS-60+10) の中で走る＝**押した直後の
 *    getStageState にはまだボタン ON が反映されていない**
 * ∴ 押す前後の両方で実時間を待つ。
 */
async function push(page, dir) {
  await page.evaluate((d) => { window.__game.movePlayer(d); window.__game.step(1); }, dir);
  await page.waitForTimeout(700);   // アニメ後の handleTileEvent/checkSwitchOff を待つ
}

test.describe('Phase 9-6 深洋O ⑤ – 廊下C1〜C4 実エンジン検証', () => {

  for (const { key, role } of CORRIDOR) {
    test(`① ${key} (${role}) が起動し陸に立てて、戦闘ゼロ・潮ゲートは初期状態で閉じている`, async ({ page }) => {
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
          ss: window.__game.getStageState(),
        };
      });

      expect(snap.player.y, `${key} のプレイヤー行がずれた`).toBe(row);
      expect(snap.player.x, `${key} のプレイヤー列がずれた`).toBe(col);
      // §19-8 分離原則: 廊下は戦闘ゼロ（パズルに集中させる画面）。
      expect(snap.enemies, `${key} は戦闘ゼロのはずが敵が spawn した`).toBe(0);
      // 潮は満ちて始まる（ゲートが最初から開いていたらパズルが成立しない）。
      expect(snap.ss.openGates, `${key} の潮ゲートが最初から開いている`).toEqual([]);
      expect(errors, `${key} で pageerror`).toEqual([]);
    });
  }

  test('② C1: Y を剣で叩くと潮が引き、閉じている間は渡れず開くと渡れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['15,12'];
    // データ側の前提（画面を作り替えたらここで気づく）
    expect(cellsWith(stage, TILE.SWITCH), 'C1 の Y が 1,9 でない').toEqual(['1,9']);
    expect(stage.links.map((l) => l.gateId).sort(), 'C1 の links が潮ゲート4枚に繋がっていない')
      .toEqual(['3,5', '3,6', '4,5', '4,6']);
    // 罠: ゲートの下地が水だと openGates に入っても永久に不通。
    for (const g of ['3,5', '3,6', '4,5', '4,6'])
      expect(stage.bgTiles[g], `C1 の潮ゲート ${g} の下地が水（開いても歩けない）`).not.toBe(TILE.WATER);

    // ゲートの真上 (2,5) に立ち、閉じている間は南へ渡れないことを見る。
    await page.goto(previewUrl('15,12', 2, 5));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));

    await walkTiles(page, 'down', 3);   // 潮ゲート 3,5 / 4,6 を越えようとする
    const closed = await at(page);
    expect(closed.r, '潮が満ちている（ゲート閉）のに渡れてしまう＝パズルが飾り').toBe(2);

    // Y (1,9) の2タイル左 (1,7) から右へ1タイル歩き、(1,9) を剣で叩く → 潮が引く。
    // ※ 'Y' は歩いて乗れるタイルなので「壁に弾かれて向きだけ変わる」当てにはできない。
    await page.goto(previewUrl('15,12', 1, 7));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));
    await walkAndStrike(page, 'right', 1);

    const opened = await page.evaluate(() => {
      const ss = window.__game.getStageState();
      return { openGates: ss.openGates.sort(), toggles: ss.switchToggles };
    });
    expect(opened.toggles, 'Y のトグルが switchToggles に入っていない').toContain('1,9');
    expect(opened.openGates, 'Y を叩いても潮ゲートが開かない').toEqual(['3,5', '3,6', '4,5', '4,6']);

    // 開いた状態で本当に歩いて渡れるか（isWaterAt が先に効く罠の実地検出）。
    const beforeWalk = await at(page);
    expect(beforeWalk, 'Y を叩いた後の立ち位置が (1,8) でない（半セル移動の取り違え）')
      .toMatchObject({ r: 1, c: 8 });
    await walkTiles(page, 'left', 3);    // (1,5) へ
    await walkTiles(page, 'down', 1);    // (2,5)
    const atTop = await at(page);
    expect(atTop, 'ゲート上端 (2,5) に歩けなかった（前提崩れ）').toMatchObject({ r: 2, c: 5 });
    await walkTiles(page, 'down', 3);    // 潮ゲート 3,5 / 4,5 を渡って (5,5)
    const after = await at(page);
    expect(after.r, '潮が引いたのに潮ゲートを歩いて渡れない（下地が水／openGates が効いていない）')
      .toBeGreaterThan(4);
    expect(errors).toEqual([]);
  });

  test('③ C2: ボタンはモーメンタリ（踏む→開く／降りる→閉じる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['15,13'];
    expect(cellsWith(stage, TILE.BUTTON), 'C2 の S が 2,2 でない').toEqual(['2,2']);
    // 'Y' は置かない画面（テーマは「保持」1つ）— 混ざっていたら設計が崩れている。
    expect(cellsWith(stage, TILE.SWITCH), 'C2 に Y が混ざっている（1画面1テーマ違反）').toEqual([]);

    // ボタンの隣 (2,3) から乗って降りる（1タイル = movePlayer 2回）。
    await page.goto(previewUrl('15,13', 2, 3));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));

    await walkTiles(page, 'left', 1);   // (2,2) ボタンへ乗る
    expect(await at(page), 'ボタン (2,2) に乗れていない').toMatchObject({ r: 2, c: 2 });
    const on = await page.evaluate(() => {
      const ss = window.__game.getStageState();
      return { gates: ss.openGates.sort(), state: ss.switchStates['2,2'] ?? false };
    });
    expect(on.state, 'ボタンを踏んでも switchStates が ON にならない').toBe(true);
    expect(on.gates, 'ボタンを踏んでも潮ゲートが開かない').toEqual(['4,5', '4,6', '5,5', '5,6']);

    // 降りる方向は **北**。東 (2,3→2,4) には石があり、踏み出すと「押し」になって
    // プレイヤーが石の元セルへ丸ごと1タイル飛ぶ＝降りたかどうかの検証が濁る。
    await walkTiles(page, 'up', 1);     // (1,2) へ降りる
    expect(await at(page), 'ボタンから降りられていない').toMatchObject({ r: 1, c: 2 });
    const off = await page.evaluate(() => {
      const ss = window.__game.getStageState();
      return { gates: ss.openGates, state: ss.switchStates['2,2'] ?? false };
    });
    expect(off.state, 'ボタンから降りても ON のまま＝モーメンタリでない（石で押さえる意味が消える）').toBe(false);
    expect(off.gates, 'ボタンから降りても潮ゲートが開いたまま').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('④ C2: 石をボタンに載せると降りても潮が引いたまま（＝これが解法）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['15,13'];
    expect(cellsWith(stage, TILE.STONE), 'C2 の石が 2,4 でない').toEqual(['2,4']);

    // 石 (2,4) の右 (2,5) に立ち、左へ2回押して (2,2) のボタンへ載せる。
    // 押しは1回で丸ごと1タイル動く（プレイヤーも石の元セルへ整数座標で移動）。
    await page.goto(previewUrl('15,13', 2, 5));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));

    await push(page, 'left');   // 石 2,4 → 2,3（プレイヤー 2,4）
    await push(page, 'left');   // 石 2,3 → 2,2（プレイヤー 2,3）

    const held = await page.evaluate(() => {
      const ss = window.__game.getStageState();
      return {
        stones: Object.values(ss.stonePositions).map((s) => `${s.r},${s.c}`),
        gates: ss.openGates.sort(),
        state: ss.switchStates['2,2'] ?? false,
      };
    });
    expect(held.stones, '石が 2 回押せていない（クールダウン待ちが足りない可能性）').toContain('2,2');
    expect(held.state, '石を載せてもボタンが ON にならない').toBe(true);
    expect(held.gates, '石を載せても潮ゲートが開かない').toEqual(['4,5', '4,6', '5,5', '5,6']);
    expect(await at(page), '石を押した後のプレイヤー位置が (2,3) でない').toMatchObject({ r: 2, c: 3 });

    // プレイヤーがボタンから離れても開いたまま（石が保持している＝これが解法）。
    await walkTiles(page, 'right', 2);   // (2,5) へ
    expect(await at(page), 'プレイヤーがボタンから離れられていない').toMatchObject({ r: 2, c: 5 });
    const stillOpen = await page.evaluate(() => window.__game.getStageState().openGates.sort());
    expect(stillOpen, '石が乗っているのに潮ゲートが閉じた（checkSwitchOff が石を見ていない）')
      .toEqual(['4,5', '4,6', '5,5', '5,6']);

    // そして実際に渡れる（開いた潮ゲート 4,5/5,5 の上を歩いて南へ抜ける）。
    await walkTiles(page, 'down', 4);    // 2,5 → 6,5
    const after = await at(page);
    expect(after.r, '石で潮を引かせたのに歩いて渡れない').toBeGreaterThan(5);
    expect(errors).toEqual([]);
  });

  test('⑤ C4: 2枚の潮ゲートが直列（石で前半、Y で後半）で、閉じたままでは南に抜けられない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['15,15'];
    // 前半 GB は石のボタン、後半 GA は Y のトグル＝別機構が直列に並んでいること。
    const byGate = new Map(stage.links.map((l) => [l.gateId, l.switchId]));
    expect(byGate.get('3,5'), 'C4 前半ゲートが S(1,2) に繋がっていない').toBe('1,2');
    expect(byGate.get('7,5'), 'C4 後半ゲートが Y(5,3) に繋がっていない').toBe('5,3');
    expect(stage.signData['5,8']?.lines?.length, 'C4 の海の石碑に本文が無い').toBeGreaterThan(0);

    // 前半ゲートの真上 (2,5) から、何も操作せずに南へ抜けられないこと。
    await page.goto(previewUrl('15,15', 2, 5));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));
    await walkTiles(page, 'down', 8);
    // ゲートは 3,5 にあるので row は 2 のまま（1マスも進めない）。
    expect((await at(page)).r, '潮ゲートを開けずに南へ進めた＝パズルを迂回できる（はしご迂回を含む）')
      .toBe(2);

    // 後半 GA も同じ: 前半を石で開けても、Y を叩くまで南へは抜けられない。
    // 石 (1,5) を左に3回押して (1,2) のボタンへ載せる → GB(3,5..4,6) が開く。
    await page.goto(previewUrl('15,15', 1, 6));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));
    await push(page, 'left');   // 石 1,5 → 1,4
    await push(page, 'left');   // 石 1,4 → 1,3
    await push(page, 'left');   // 石 1,3 → 1,2（ボタン）
    const half = await page.evaluate(() => window.__game.getStageState().openGates.sort());
    expect(half, '石で前半ゲートが開かない').toEqual(['3,5', '3,6', '4,5', '4,6']);

    // 前半を通って南へ降り、後半ゲートの前で止まる（直列であることの確認）。
    await walkTiles(page, 'right', 2);   // (1,5)
    await walkTiles(page, 'down', 8);    // 3,5/4,5 は渡れるが 7,5 は閉じている
    expect((await at(page)).r, '後半ゲートが閉じているのに南へ抜けられた（直列になっていない）')
      .toBe(6);

    // Y (5,3) を叩く: (5,5) から左へ1タイル歩いて (5,4)、その先の (5,3) を叩く。
    await walkTiles(page, 'up', 1);      // (5,5)
    await walkAndStrike(page, 'left', 1);
    expect(await at(page), 'Y を叩く立ち位置が (5,4) でない').toMatchObject({ r: 5, c: 4 });
    const full = await page.evaluate(() => window.__game.getStageState().openGates.sort());
    expect(full, 'Y を叩いても後半ゲートが開かない')
      .toEqual(['3,5', '3,6', '4,5', '4,6', '7,5', '7,6', '8,5', '8,6']);

    // 両方開いた状態で南へ抜けられる。
    await walkTiles(page, 'right', 1);   // (5,5)
    await walkTiles(page, 'down', 4);    // 7,5/8,5 を渡って (9,5)
    expect((await at(page)).r, '両方開けたのに南へ抜けられない').toBeGreaterThan(8);
    expect(errors).toEqual([]);
  });

  test('⑦ C4: 海の石碑が読める（デルタ導入ロア）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 石碑 'i' (5,8) の2タイル右 (5,10)? row5 の陸は col3-8 なので、
    // 左隣の (5,7) に立って右を叩く＝(5,6) から右へ1タイル歩いて (5,7) → (5,8) を叩く。
    await page.goto(previewUrl('15,15', 5, 6));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));
    await walkAndStrike(page, 'right', 1);
    expect(await at(page), '石碑を読む立ち位置が (5,7) でない').toMatchObject({ r: 5, c: 7 });

    await page.waitForTimeout(150);
    const name = await page.locator('#dialog-name').textContent().catch(() => '');
    expect(name, '海の石碑の見出しが出ない').toContain('潮 廊');

    // ダイアログは1行ずつページ送り（ui.js showDialogLine / advanceDialog）。
    // Space で最後まで送り、全行を集めて突き合わせる。
    const lines = [];
    for (let i = 0; i < 5; i++) {
      const t = await page.locator('#dialog-text').textContent().catch(() => '');
      if (!t) break;
      lines.push(t);
      const next = await page.locator('#dialog-next').textContent().catch(() => '');
      if (next.includes('閉じる')) break;
      await page.keyboard.press('Space');
      await page.waitForTimeout(80);
    }
    const body = lines.join('\n');
    expect(body, '海の石碑の本文が出ない（無言看板になっている）').toContain('潮の 廊を 越えた');
    expect(body, '海の主への導入ロアが読めない').toContain('海の 主');
    expect(lines.length, '石碑の本文が全行送れない').toBe(3);
    expect(errors).toEqual([]);
  });

  // C3 は順序依存パズル: 石Aを北のボタン(1,2)に載せて col8 の潮ゲート(3,8/4,8)を
  // 開け、その開いた縦レーンを通して石Bを南のボタン(5,8)まで落とす。順序を逆にすると
  // 石Bは col8 のレーンに入れない（＝これが「順序依存」の中身）。宝箱 6,3 は後半
  // ボタン 5,8 の switchOn で封印されているので、通し切るまで現れない。
  test('⑧ C3: 石A→石Bの順で二つの潮を引くと南へ抜けられ、宝箱の封印が解ける', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const stage = FIELD['15,14'];
    // 封印の鍵は「後半ゲートを保持しているボタン 5,8」＝ Y ではなくボタンであること。
    // （switchOn は switchStates を見る＝Y の switchToggles では絶対に成立しない）
    expect(stage.showConditions['6,3']?.switchId, 'C3 の封印が 5,8 のボタンでない').toBe('5,8');
    expect(stage.tiles[5][8], 'C3 の 5,8 がボタン(S)でない＝switchOn が永久に成立しない')
      .toBe(TILE.BUTTON);

    // 石A (1,5) の右 (1,6) から始める。
    await page.goto(previewUrl('15,14', 1, 6));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.step(1));
    expect(await page.evaluate(() => window.__game.getStageState().conditionsMet),
      '何もしていないのに宝箱の封印が解けている').toEqual([]);

    // ① 石A を西へ3回押して北のボタン (1,2) へ → col8 の潮ゲートが開く。
    await push(page, 'left');   // 石A 1,5 → 1,4
    await push(page, 'left');   // 石A 1,4 → 1,3
    await push(page, 'left');   // 石A 1,3 → 1,2（ボタン）
    const phase1 = await page.evaluate(() => {
      const ss = window.__game.getStageState();
      return { gates: ss.openGates.sort(), met: ss.conditionsMet };
    });
    expect(phase1.gates, '石A を載せても col8 の潮ゲートが開かない').toEqual(['3,8', '4,8']);
    expect(phase1.met, '前半だけで宝箱の封印が解けた（順序依存になっていない）').toEqual([]);

    // ② 開いた col8 レーンを使って石B (2,8) を南のボタン (5,8) まで落とす。
    expect(await at(page), '石A を押し終えた立ち位置が (1,3) でない').toMatchObject({ r: 1, c: 3 });
    await walkTiles(page, 'right', 5);   // (1,8) 石B の真上
    expect(await at(page), '石B の真上 (1,8) に立てていない').toMatchObject({ r: 1, c: 8 });
    await push(page, 'down');   // 石B 2,8 → 3,8（開いた潮ゲートの上）
    await push(page, 'down');   // 石B 3,8 → 4,8
    await push(page, 'down');   // 石B 4,8 → 5,8（ボタン）

    const phase2 = await page.evaluate(() => {
      const ss = window.__game.getStageState();
      return {
        gates: ss.openGates.sort(),
        stones: Object.values(ss.stonePositions).map((s) => `${s.r},${s.c}`).sort(),
        met: ss.conditionsMet,
        button58: ss.switchStates['5,8'] ?? false,
      };
    });
    expect(phase2.stones, '石が (1,2) と (5,8) の両ボタンに載っていない').toEqual(['1,2', '5,8']);
    expect(phase2.button58, '石B を載せても後半ボタンが ON にならない').toBe(true);
    expect(phase2.gates, '二つの潮が引いていない（南の出口が開かない）')
      .toEqual(['3,8', '4,8', '7,5', '7,6', '8,5', '8,6']);
    expect(phase2.met, '二つの潮を引いても宝箱の封印が解けない').toContain('6,3');

    // ③ 南へ抜けられる。石B が (5,8) を塞いでいるので col8 では降りられず、
    //    col7 の下り坂（3,7/4,7 は陸）へ回る＝これが石Bを横に逃がさない幾何の裏返し。
    expect(await at(page), '石B を押し終えた立ち位置が (4,8) でない').toMatchObject({ r: 4, c: 8 });
    await walkTiles(page, 'left', 1);    // (4,7) col7 の下り坂へ
    expect(await at(page), 'col7 の下り坂 (4,7) に回れない').toMatchObject({ r: 4, c: 7 });
    await walkTiles(page, 'down', 2);    // (6,7)
    await walkTiles(page, 'left', 1);    // (6,6) 南の潮ゲートの真上
    expect(await at(page), '南の潮ゲート上端 (6,6) に着けない').toMatchObject({ r: 6, c: 6 });
    await walkTiles(page, 'down', 3);    // 7,6 / 8,6 を渡って (9,6)
    expect((await at(page)).r, '二つの潮を引いたのに南の出口を抜けられない').toBe(9);
    expect(errors).toEqual([]);
  });

  // ⚠ 「潮ゲートを迂回できない」は **1列をまっすぐ南へ歩いて** も保証できない。ゲート帯の
  //   脇に1セル幅の水路が1本あるだけで、はしごを持ったプレイヤーはそこを渡って南へ抜ける。
  //   実際にその穴を C4 の col7 に仕込んだら、直線歩きの検証は素通りした（＝甘かった）。
  //   ∴ 実エンジンの通行判定そのままで **歩ける範囲を全部たどる**（DFS＋バックトラック）。
  //
  //   検証したい不変条件は「ゲート帯を1枚も越えられないこと」ではなく
  //   **「パズルを解かずに南の出口へ出られないこと」**。C3 の col8 ゲート帯は石を落とす
  //   ためのもので、プレイヤーが col7 から横を通り抜けるのは設計どおり＝そこを禁じては
  //   いけない。∴ 見るのは「南端の行（row9）に到達できるか」1点。
  //
  //   ボタン 'S' はモーメンタリなので、DFS がボタンを踏んでもゲートは踏んでいる間だけ開き、
  //   離れた瞬間に閉じる＝「解かずに抜ける」経路にはならない（この自己整合性も同時に効く）。
  //   石は押すと不可逆なので踏み込まない（探索が状態を壊さないため）。
  test('⑨ パズルを解かずに南の出口へは出られない（実エンジンで歩ける範囲を全探索）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const escapes = [];
    for (const { key, role } of CORRIDOR) {
      const stage = FIELD[key];
      // 北の入口＝row0..1 の立てるセル（廊下は北から入って南へ抜ける1本道）。
      const north = [];
      for (let r = 0; r <= 1; r++) {
        for (let c = 0; c < 12; c++) {
          if (stage.bgTiles[`${r},${c}`] === TILE.WATER) continue;
          const ch = stage.tiles[r][c];
          if (ch === TILE.FLOOR || ch === ' ') north.push([r, c]);
        }
      }
      expect(north.length, `${key} に北の入口セルが無い`).toBeGreaterThan(0);
      const [sr, sc] = north[0];

      await page.goto(previewUrl(key, sr, sc));
      await waitForBoard(page);
      const reached = await page.evaluate(({ r0, c0 }) => {
        const cur = () => {
          const p = window.__game.getState().player;
          return [Math.floor(p.y + 0.5), Math.floor(p.x + 0.5)];
        };
        const walk = (d) => { for (let i = 0; i < 2; i++) { window.__game.movePlayer(d); window.__game.step(1); } };
        const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
        const DIRS = [['up', -1, 0], ['down', 1, 0], ['left', 0, -1], ['right', 0, 1]];
        const stoneCells = () => {
          const ss = window.__game.getStageState();
          return new Set(Object.values(ss.stonePositions ?? {}).map((s) => `${s.r},${s.c}`));
        };
        const visited = new Set([`${r0},${c0}`]);
        const stack = [[r0, c0, 0]];   // [row, col, 試した方向数]
        while (stack.length) {
          const top = stack[stack.length - 1];
          if (top[2] >= DIRS.length) {                       // この頂点は掃き終わり → 戻る
            stack.pop();
            if (stack.length) {
              const parent = stack[stack.length - 1];
              const d = DIRS.find(([, dr, dc]) => parent[0] + dr === top[0] && parent[1] + dc === top[1]);
              walk(OPP[d[0]]);
              const [br, bc] = cur();
              if (br !== parent[0] || bc !== parent[1]) throw new Error(`backtrack failed at ${br},${bc}`);
            }
            continue;
          }
          const [d, dr, dc] = DIRS[top[2]++];
          const nr = top[0] + dr, nc = top[1] + dc;
          if (nr < 0 || nr > 9 || nc < 0 || nc > 11) continue;   // 画面外＝遷移するので踏まない
          if (visited.has(`${nr},${nc}`)) continue;
          if (stoneCells().has(`${nr},${nc}`)) continue;         // 石＝押すと不可逆
          walk(d);
          const [ar, ac] = cur();
          if (ar === nr && ac === nc) {
            visited.add(`${nr},${nc}`);
            stack.push([nr, nc, 0]);
          } else if (ar !== top[0] || ac !== top[1]) {
            throw new Error(`unexpected move ${top[0]},${top[1]} -> ${ar},${ac}`);
          }
        }
        return [...visited];
      }, { r0: sr, c0: sc });

      const south = reached.filter((k) => Number(k.split(',')[0]) === 9);
      if (south.length) escapes.push(`${key}(${role}) ${sr},${sc} から ${south.join(' ')} に到達`);
    }
    expect(
      escapes,
      '潮を引かせずに南の出口（row9）へ出られる＝パズルを迂回できる（1セル幅の水+はしご/脇道）:\n'
      + escapes.join('\n'),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('⑥ 廊下は唯一の道: C1 の西/東の外周は海で、隣の画面へ横に抜けられない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // データ側の契約: 廊下4画面の col0 / col11 は全行が海（西外周の封鎖）。
    for (const { key } of CORRIDOR) {
      const st = FIELD[key];
      for (let r = 0; r < st.tiles.length; r++) {
        expect(st.bgTiles[`${r},0`], `${key} (${r},0) が海でない＝廊下を横から迂回できる`).toBe(TILE.WATER);
        expect(st.bgTiles[`${r},11`], `${key} (${r},11) が海でない`).toBe(TILE.WATER);
      }
    }

    // 実エンジン: C1 の中央 (1,5) から西へ歩き続けても画面を出られない。
    await page.goto(previewUrl('15,12', 1, 5));
    await waitForBoard(page);
    const res = await page.evaluate(() => {
      window.__game.step(1);
      for (let i = 0; i < 12; i++) { window.__game.movePlayer('left'); window.__game.step(1); }
      const s = window.__game.getState();
      return { stage: s.stageKey ?? s.stage ?? null, x: s.player.x };
    });
    expect(res.x, '西端の海に踏み込めた（bgTiles 水の通行判定が抜けている）').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
