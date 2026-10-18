// @ts-check
// 実行キュー82⑨（2026-10-18・Fable 実装レビュー #24）。
// 敵が落とした物（ハート・ルピー・矢・爆弾）の寿命 5 秒は**ゲームの時間**で数える＝ポーズ・会話の間は減らない。
// 直す前＝実時間の setTimeout(5000)＝落ちた瞬間に看板を読む／ポーズを開くと、戻ったときには消えていた
// （論理時間で測る方針から外れていた唯一のゲームの状態）。
//   ① ゲームを止めたまま実時間で 5 秒以上たっても消えない
//   ② ゲームの時間で 5 秒たつと消える（その手前では残っている）
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TICK_MS } from '../game/constants.js';

const ROOM = `${GAME_URL}?fromEditor=1&layer=dungeon_4&stage=3,3&row=2&col=1&ps_weapon=1`;
const LIFE_MS = 5000;

async function open(page) {
  await page.goto(ROOM);
  await waitForBoard(page);
  await page.evaluate(() => { window.__game.pause(); window.__game.spawnFloorDrop(6, 6, 'heart'); });
  expect(await page.evaluate(() => window.__game.getFloorDrops().length)).toBe(1);
}

test('① ゲームを止めている間は、実時間で 5 秒以上たっても消えない', async ({ page }) => {
  test.setTimeout(20_000);
  await open(page);
  await page.waitForTimeout(LIFE_MS + 800);
  expect(await page.evaluate(() => window.__game.getFloorDrops().length), '止まっている間に消えた').toBe(1);
});

test('② ゲームの時間で 5 秒たつと消える', async ({ page }) => {
  await open(page);
  const before = Math.floor(LIFE_MS / TICK_MS) - 1;
  const n = await page.evaluate((t) => { window.__game.step(t); return window.__game.getFloorDrops().length; }, before);
  expect(n, '寿命の手前で消えた').toBe(1);
  const m = await page.evaluate(() => { window.__game.step(3); return window.__game.getFloorDrops().length; });
  expect(m, 'ゲームの時間で 5 秒たっても消えない').toBe(0);
});
