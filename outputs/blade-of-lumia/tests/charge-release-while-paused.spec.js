// @ts-check
// 実行キュー82⑤（2026-10-18・Fable 実装レビュー #21）。
// 溜めている途中でポーズを開き（会話・演出も同じ）、その間に攻撃キーを離したら、ビームは撃たずに溜めを取り消す。
// 直す前＝`charge.js releaseCharge` は `canAct()` を見なかった＝ポーズ中に離すとビームが「止まった世界」に足され、
// ポーズを解いた瞬間に飛んだ。押す（startCharge）と溜める（tickCharge）は canAct を見ていた＝離すだけが抜けていた
// （DECISIONS 2026-10-17（5）の教訓「離すのを無視すると状態が残る＝離す方は効果は出さずに状態だけ戻す」と同じ形）。
//   ① 満タンまで溜めてポーズ → 離す → ポーズを解く：ビームは飛ばず、溜めも残らない
//   ② （対照）ポーズしなければ、同じ溜めで離すとビームが出る
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';

// 敵も仕掛けも無い広間。ビームを撃てる剣（ps_sword=4）
const ROOM = `${GAME_URL}?fromEditor=1&layer=dungeon_4&stage=3,3&row=2&col=1&ps_weapon=1&ps_sword=4`;

async function chargeFull(page) {
  await page.goto(ROOM);
  await waitForBoard(page);
  await page.evaluate(() => { window.__game.pause(); window.__game.setHeroDir('right'); });
  await page.keyboard.down('z');
  // 満タンまで（論理時間で十分に進める）
  await page.evaluate(() => window.__game.step(30));
  expect(await page.evaluate(() => window.__game.getState().charging), '前提：溜めている').toBe(true);
}

const beams = (page) => page.evaluate(() => window.__game.getProjectiles().filter((q) => q.owner === 'player').length);

test('① ポーズ中に攻撃キーを離しても、ビームは飛ばず溜めも残らない', async ({ page }) => {
  await chargeFull(page);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__game.getState().isPaused), '前提：ポーズ中').toBe(true);
  await page.keyboard.up('z');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__game.step(1));
  expect(await beams(page), 'ポーズを解いた瞬間にビームが飛んだ').toBe(0);
  expect(await page.evaluate(() => window.__game.getState().charging), '溜めが残っている').toBe(false);
});

test('② 対照：ポーズしなければ、離すとビームが出る', async ({ page }) => {
  await chargeFull(page);
  await page.keyboard.up('z');
  await page.evaluate(() => window.__game.step(1));
  expect(await beams(page), '溜めの形がビームの出る形になっていない（①が意味を持たない）').toBe(1);
});
