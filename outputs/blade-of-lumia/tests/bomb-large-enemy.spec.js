// @ts-check
// 実行キュー82②（2026-10-18・Fable 実装レビュー #6）。
// 爆風は敵の**体のどこか**が爆風のセルに入っていれば当たる（1体には1回だけ）。
// 直す前＝`projectile.js explodeAt` が敵の左上タイル（`e.x/e.y`）しか見ていなかった＝2×2／3×3 のボスは
// 爆風の絵が体に重なっていても無傷になり得た。ロウソクの炎で同じ罠を直した記録が hitbox.js にある
// （占有セルは `enemyOccupiesTile` の1か所で決める）。
//   ① 2×2：左上は爆風の外・右下寄りのセルだけが中＝当たる
//   ② 3×3：左上は爆風の外・下の段だけが中＝当たる
//   ③ 2×2 の4セル全部が爆風の中でも、ダメージは1回分（セルの数だけ重ねない）
//   ④ 体のどのセルも爆風の外＝当たらない（範囲を広げすぎていない）
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';
import { ITEM_META } from '../shared/items.js';
import { TICK_MS } from '../game/constants.js';

// 敵も仕掛けも無い広間（10×12）。爆弾を持たせる。
const ROOM = `${GAME_URL}?fromEditor=1&layer=dungeon_4&stage=3,3&row=2&col=1&ps_weapon=1&ps_bomb=1`;
const DMG = ITEM_META.bomb.damage;
const RADIUS = ITEM_META.bomb.aoeRadius;
// 導火線 2000ms を越える tick 数
const FUSE_TICKS = Math.ceil(2000 / TICK_MS) + 1;
// 爆弾を置くセル（プレイヤーの足元）
const BR = 5, BC = 3;

async function blastHp(page, enemy) {
  await page.goto(ROOM);
  await waitForBoard(page);
  return page.evaluate(({ enemy, BR, BC, FUSE_TICKS }) => {
    const g = window.__game;
    g.pause();
    const p = g.getPlayer();
    p.x = BC; p.y = BR;
    p.activeSubItem = 'bomb';
    p.subItems.bomb = { ...(p.subItems.bomb ?? {}), count: 5 };
    const id = g.injectEnemy(enemy.x, enemy.y, 100, enemy.w, enemy.h);
    g.useSubItem();
    g.step(FUSE_TICKS);
    return g.getEnemies().find((e) => e.id === id)?.hp;
  }, { enemy, BR, BC, FUSE_TICKS });
}

// 爆風の中か（projectile.js blastCells と同じ円）
const inBlast = (r, c) => Math.hypot(r - BR, c - BC) <= RADIUS;
const cellsOf = ({ x, y, w, h }) => {
  const out = [];
  for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) out.push([r, c]);
  return out;
};

test('前提：爆風の半径と置き場所の幾何', () => {
  expect(RADIUS).toBe(2);
  // ①②の敵は左上が爆風の外・他のセルのどれかが中
  for (const e of [{ x: 4, y: 3, w: 2, h: 2 }, { x: 4, y: 2, w: 3, h: 3 }]) {
    expect(inBlast(e.y, e.x), `左上 (${e.y},${e.x}) が爆風の中＝直す前でも当たってしまう`).toBe(false);
    expect(cellsOf(e).some(([r, c]) => inBlast(r, c))).toBe(true);
  }
  expect(cellsOf({ x: 3, y: 4, w: 2, h: 2 }).every(([r, c]) => inBlast(r, c))).toBe(true);
  expect(cellsOf({ x: 6, y: 6, w: 2, h: 2 }).some(([r, c]) => inBlast(r, c))).toBe(false);
});

test('① 2×2：左上が外でも、体の一部が爆風に入れば当たる', async ({ page }) => {
  expect(await blastHp(page, { x: 4, y: 3, w: 2, h: 2 })).toBe(100 - DMG);
});

test('② 3×3：左上が外でも、体の一部が爆風に入れば当たる', async ({ page }) => {
  expect(await blastHp(page, { x: 4, y: 2, w: 3, h: 3 })).toBe(100 - DMG);
});

test('③ 2×2 の4セル全部が爆風の中でも、ダメージは1回分', async ({ page }) => {
  expect(await blastHp(page, { x: 3, y: 4, w: 2, h: 2 })).toBe(100 - DMG);
});

test('④ 体のどのセルも爆風の外なら当たらない', async ({ page }) => {
  expect(await blastHp(page, { x: 6, y: 6, w: 2, h: 2 })).toBe(100);
});
