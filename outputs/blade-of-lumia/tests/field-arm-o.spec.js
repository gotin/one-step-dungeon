// tests/field-arm-o.spec.js — Phase 9-6 深洋O ④: アーム7（入口・海の戦闘）実エンジン検証
//
// scripts/migrate-field-arm-o.mjs が作った 7 画面（E0..E3 = 本道 col15 / A1..A3 = 脇道 col14）
// を **実ゲームで** 検証する。データレベルの検証（接続・軸・battleScore）は
// scripts/check-field-connectivity.mjs と tests/field-invariants.spec.js が担当するので、
// ここは「実エンジンで動くのか」だけを見る：
//
//   ① 7 画面すべてが pageerror ゼロで起動し、プレイヤーが陸に立てる
//   ② 海棲雑魚（& < /）が実際に spawn し、move='water' が乗っている
//      （タイルを置いても spawn 経路が拾わなければ「絵」になる。ここが一番壊れやすい）
//   ③ 水上の敵の足元は通行不可（bgTiles 水）＝プレイヤーは敵のセルへ歩けない
//      → 水を tiles ではなく bgTiles で持つ移行（2026-07-25）の実ゲーム側の回帰
//   ④ E2/E3 の killAll 封印宝箱は全滅前は開かない（showConditions が効いている）
//   ⑤ 潜み鮫は「潜行して始まる」＝画面に入った瞬間に無敵の当たり判定を出さない
//
// ⚠ 水は bgTiles 単一ソース。tiles 側に '~' は無いので、通行判定の検証は
//   「敵のセルへ movePlayer しても座標が変わらない」で行う（タイル文字を見ない）。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const FIELD = MAP.layers.field.stages;

// アーム7 の 7 画面と、各画面の「安全な立ち位置」（陸・コンテンツ無し）。
// 立ち位置は下の landCells() で実データから求めるので、ここは画面キーと役割だけ。
const ARM = [
  { key: '15,8',  role: 'E0 教' },
  { key: '14,9',  role: 'A1 脇の宝①' },
  { key: '15,9',  role: 'E1 試①' },
  { key: '14,10', role: 'A2 脇の宝②' },
  { key: '15,10', role: 'E2 試②' },
  { key: '14,11', role: 'A3 脇の宝③' },
  { key: '15,11', role: 'E3 最難' },
];
const SEA_MOBS = [TILE.FISH_SCHOOL, TILE.LURK_SHARK, TILE.ARCHER_FISH];

/** 画面の「陸で、tiles にコンテンツが無い」セル一覧（プレイヤーを置ける場所）。 */
function landCells(stage) {
  const out = [];
  for (let r = 0; r < stage.tiles.length; r++) {
    const row = stage.tiles[r];
    for (let c = 0; c < row.length; c++) {
      if (stage.bgTiles?.[`${r},${c}`] === TILE.WATER) continue;
      if (row[c] !== TILE.FLOOR && row[c] !== ' ') continue;
      out.push([r, c]);
    }
  }
  return out;
}

/** 画面上の海棲雑魚の座標一覧。 */
function seaMobCells(stage) {
  const out = [];
  for (let r = 0; r < stage.tiles.length; r++) {
    for (let c = 0; c < stage.tiles[r].length; c++) {
      const ch = stage.tiles[r][c];
      if (SEA_MOBS.includes(ch)) out.push([r, c, ch]);
    }
  }
  return out;
}

function previewUrl(key, row, col, extra = {}) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: 'field', stage: key,
    row: String(row), col: String(col),
    // §8-1 tool timing: 深洋O は D6 の後（expectedPower 7）＝道具は揃っている前提。
    ps_weapon: '1', ps_bomb: '1', ps_bow: '1', ps_boomerang: '1',
    ...extra,
  });
  return `${GAME}?${p.toString()}`;
}

test.describe('Phase 9-6 深洋O ④ – アーム7 実エンジン検証', () => {

  for (const { key, role } of ARM) {
    test(`① ${key} (${role}) が起動し、陸に立てて海棲雑魚が水棲として spawn する`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));

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
          enemies: window.__game.getEnemies().map(e => ({ type: e.type, x: e.x, y: e.y, move: e.move })),
        };
      });

      // プレイヤーは指定した陸セルに居る（水セルに置かれると即詰みになる）
      expect(snap.player.y, `${key} のプレイヤー行がずれた`).toBe(row);
      expect(snap.player.x, `${key} のプレイヤー列がずれた`).toBe(col);

      // データに置いた海棲雑魚が全部 spawn しているか（タイルだけ置いて絵になる事故の検出）。
      // ⚠ 座標一致では判定できない：魚群 '&' は最初の tick で泳いで動く（＝それが正常）。
      // ∴「種類ごとの体数」と「water 属性」で見る。
      const expected = seaMobCells(stage);
      for (const ch of SEA_MOBS) {
        const want = expected.filter(([, , t]) => t === ch);
        if (!want.length) continue;
        const got = snap.enemies.filter(e => e.type === ch);
        expect(got.length, `${key} の '${ch}' が ${want.length} 体のはずが ${got.length} 体（絵になっている）`)
          .toBe(want.length);
        for (const e of got) {
          expect(e.move, `${key} の '${ch}' に water 属性が乗っていない＝陸敵として詰まる`).toBe('water');
        }
      }
      expect(errors, `${key} で pageerror`).toEqual([]);
    });
  }

  test('③ 水上の敵のセルへは歩けない（bgTiles 水の通行判定が実ゲームで効く）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // A3 `14,11` は堤道(row5) の真下に貯水池(rows6-7) があり、鮫(6,5) が堤道の隣接下にいる。
    // 堤道から下（水＝敵のセル）へ踏み出せないことを実エンジンで確かめる。
    const stage = FIELD['14,11'];
    expect(stage.bgTiles['6,5'], '前提が崩れた：14,11 (6,5) は水のはず').toBe(TILE.WATER);
    expect(stage.tiles[6][5], '前提が崩れた：14,11 (6,5) は潜み鮫のはず').toBe(TILE.LURK_SHARK);

    await page.goto(previewUrl('14,11', 5, 5));
    await waitForBoard(page);

    const res = await page.evaluate(() => {
      window.__game.step(1);
      const before = window.__game.getState().player;
      window.__game.movePlayer('down');   // 水（鮫のセル）へ踏み出そうとする
      window.__game.step(1);
      const after = window.__game.getState().player;
      return { before: { x: before.x, y: before.y }, after: { x: after.x, y: after.y } };
    });
    expect(res.after, '水（敵のセル）に歩けてしまう＝bgTiles 水の通行判定が抜けている')
      .toEqual(res.before);
    expect(errors).toEqual([]);
  });

  test('④ E2/E3 の killAll 封印宝箱は敵を倒す前は開かない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // データ側の契約：宝箱セルに killAll の showConditions が付いている
    for (const [key, pos] of [['15,10', '4,3'], ['15,11', '7,3']]) {
      const stage = FIELD[key];
      expect(stage.showConditions?.[pos]?.trigger, `${key} ${pos} の封印条件が killAll でない`).toBe('killAll');
      expect(stage.chestContents?.[pos], `${key} ${pos} に中身が無い`).toBeTruthy();
    }

    // 実エンジン：E3 の宝箱セル(7,3) の隣（7,4 は陸）に立って開けようとしても開かない。
    await page.goto(previewUrl('15,11', 7, 4));
    await waitForBoard(page);
    const res = await page.evaluate(() => {
      window.__game.step(1);
      const before = window.__game.getState().player.rupees;
      window.__game.movePlayer('left');   // 宝箱セルへ（封印中は開かない＝ルピー増えない）
      window.__game.step(1);
      return { before, after: window.__game.getState().player.rupees };
    });
    expect(res.after, '全滅前に封印宝箱が開いてルピーが入った').toBe(res.before);
    expect(errors).toEqual([]);
  });

  test('⑤ 潜み鮫は潜行状態で登場する（入った瞬間に当たり判定を出さない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(previewUrl('14,11', 5, 5));
    await waitForBoard(page);
    const res = await page.evaluate(() => {
      window.__game.step(1);
      const shark = window.__game.getEnemies().find(e => e.type === '<');
      return { hidden: shark?.hidden ?? null, hp: window.__game.getState().player.hp };
    });
    expect(res.hidden, '登場時に浮上している（潜行から始まらない）').toBe(true);
    expect(res.hp, '画面に入った直後に潜行中の鮫でダメージを受けた').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
