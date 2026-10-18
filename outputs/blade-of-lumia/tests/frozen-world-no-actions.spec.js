// @ts-check
// 実行キュー82①（2026-10-18・Fable 実装レビュー #1）。
// 演出で世界を止めている間（`isTransitioning`＝金の装束・光の紋章の演出／転移の石碑／画面遷移）は、
// 剣もサブアイテムも何もしない。
// 直す前＝`useSubItem`／`swordAttack` の入口が `isTransitioning` を見ていなかった（キーボードの B・Space、
// 画面の道具ボタン・剣ボタンのどれからでも通る）。金の装束の演出は閃光までの 1.5 秒 `hasGoldGarb` を
// 一時的に下ろす＝この間に矢を撃つと `saveGame()` が「装束なし」で書かれ、直後に閉じると装束が消えていた。
//   ① 金の装束の演出中に道具（弓）を使っても矢は出ず、セーブも「装束なし」にならない
//   ② 同じ演出中に剣を振っても振れない（構えの窓が立たない）
//   ③ 演出が終われば道具も剣も今までどおり使える（ガードが残りっぱなしでない）
import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';

// 敵も仕掛けも無い広間（tests/gold-garb.spec.js と同じ作業台）。弓と矢を持たせる。
const ROOM = `${GAME_URL}?fromEditor=1&layer=dungeon_4&stage=3,3&row=2&col=1&ps_weapon=1&ps_bow=1`;
const GARB = { type: 'item', item: 'goldGarb', name: '金の装束' };

async function startGarbAwakening(page) {
  await page.goto(ROOM);
  await waitForBoard(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.pause();
    const p = g.getPlayer();
    p.activeSubItem = 'bow';
    p.subItems.bow = { ...(p.subItems.bow ?? {}), count: 10 };
  });
  // 入手 → 演出（宝箱と同じ入口）。閃光の前＝装束が一時的に下りている窓まで待つ
  await page.evaluate((c) => window.__game.grantReward(c), GARB);
  await page.waitForFunction(() => !!document.querySelector('.garb-awakening-aura')
    && !window.__game.getPlayer().hasGoldGarb, null, { timeout: 3_000 });
  expect(await page.evaluate(() => window.__game.getState().isTransitioning), '前提：演出で世界が止まっている').toBe(true);
}

test('① 金の装束の演出中に道具を使っても矢は出ず、セーブも「装束なし」にならない', async ({ page }) => {
  await startGarbAwakening(page);
  // 入手の時点のセーブ（装束あり）を基準にする＝演出中に書き換わらないこと
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ marker: 'before' })), SAVE_KEY);
  const r = await page.evaluate((k) => {
    const g = window.__game;
    const arrowsBefore = g.getPlayer().subItems.bow.count;
    g.useSubItem();
    return {
      projectiles: g.getProjectiles().filter((q) => q.owner === 'player').length,
      arrowsUsed: arrowsBefore - g.getPlayer().subItems.bow.count,
      save: JSON.parse(localStorage.getItem(k) ?? 'null'),
    };
  }, SAVE_KEY);
  expect(r.projectiles, '演出中に矢が飛んだ').toBe(0);
  expect(r.arrowsUsed, '演出中に矢が減った').toBe(0);
  expect(r.save?.marker, '演出中にセーブが書かれた（装束が下りている間）').toBe('before');
});

test('② 金の装束の演出中に剣を振っても振れない', async ({ page }) => {
  await startGarbAwakening(page);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const before = g.getPlayer()._atkUntil ?? null;
    g.swordAttack();
    return { before, after: g.getPlayer()._atkUntil ?? null, held: !!document.querySelector('.sword-held') };
  });
  expect(r.after, '演出中に剣の構えの窓が立った').toBe(r.before);
  expect(r.held, '演出の上に剣が描かれた').toBe(false);
});

test('③ 演出が終われば道具も剣も今までどおり使える', async ({ page }) => {
  await startGarbAwakening(page);
  await page.waitForFunction(() => !window.__game.getState().isTransitioning
    && !document.querySelector('.garb-awakening'), null, { timeout: 5_000 });
  const r = await page.evaluate(() => {
    const g = window.__game;
    const arrowsBefore = g.getPlayer().subItems.bow.count;
    g.useSubItem();
    const shot = arrowsBefore - g.getPlayer().subItems.bow.count;
    g.step(5);   // 剣のクールダウンを抜ける
    const before = g.getPlayer()._atkUntil ?? null;
    g.swordAttack();
    return { shot, swung: (g.getPlayer()._atkUntil ?? null) !== before, garb: !!g.getPlayer().hasGoldGarb };
  });
  expect(r.garb, '演出の後に装束が無い').toBe(true);
  expect(r.shot, '演出の後に矢が撃てない').toBe(1);
  expect(r.swung, '演出の後に剣が振れない').toBe(true);
});
