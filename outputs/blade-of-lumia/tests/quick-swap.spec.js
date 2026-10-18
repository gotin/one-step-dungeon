// @ts-check
// 実行キュー84（2026-10-18・ユーザー提案＝ブレスオブワイルド風）。X 長押しで道具の早替え＋Cmd／Alt 単押しの道具使用を消す。
//   ① X を押し続けると枠が開く → ←→ で選ぶ → X を離すとその道具に持ち替わって閉じる
//   ② ちょっと押しただけ（開く前に離した）＝何もしない
//   ③ X を押したまま Escape ＝持ち替えずに閉じる（ポーズも開かない）
//   ④ 開いている間は世界が止まる（押しっぱなしの矢印でも歩かない）・閉じたらそのまま歩き続ける
//   ⑤ Cmd（Meta）／Alt の単押しで道具を使わない（対照：B は使う）
//   ⑥ 道具が0個なら開かない
//   ⑦ 溜めの途中で開いたら溜めを取り消す（止まった世界で攻撃キーを離してもビームが残らない）
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';

// 敵も仕掛けも無い広間（charge-release-while-paused と同じ）。弓・木のブーメラン・爆弾＝並びは bow, boomerang, bomb
const ROOM = `${GAME_URL}?fromEditor=1&layer=dungeon_4&stage=3,3&row=2&col=1&ps_weapon=1&ps_sword=4`;
const ITEMS = '&ps_bow=1&ps_boomerang=1&ps_bomb=1';

const state = (page) => page.evaluate(() => window.__game.getState());
const overlayShown = (page) => page.evaluate(() => !document.getElementById('quickswap-overlay').classList.contains('hidden'));

async function open(page, url = ROOM + ITEMS) {
  await page.goto(url);
  await waitForBoard(page);
  await page.evaluate(() => { window.__game.pause(); window.__game.setHeroDir('right'); });
}

async function holdXUntilOpen(page) {
  await page.keyboard.down('x');
  await page.waitForFunction(() => window.__game.getState().quickSwapOpen, null, { timeout: 2000 });
}

test('① X 長押しで枠が開き、→ で選んで X を離すと持ち替わる', async ({ page }) => {
  await open(page);
  expect((await state(page)).player.activeSubItem, '前提：今の道具は弓').toBe('bow');
  await holdXUntilOpen(page);
  expect(await overlayShown(page), '枠が見えていない').toBe(true);
  expect((await state(page)).quickSwapSelected, '開いた時は今の道具を選んでいる').toBe('bow');
  const slots = await page.locator('#quickswap-items .quickswap-slot').evaluateAll((els) => els.map((e) => e.dataset.item));
  expect(slots, 'ポーズの持ち物欄と同じ並び').toEqual(['bow', 'boomerang', 'bomb']);
  await page.keyboard.press('ArrowRight');
  expect((await state(page)).quickSwapSelected).toBe('boomerang');
  expect(await page.locator('#quickswap-items .quickswap-slot.selected').getAttribute('data-item')).toBe('boomerang');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect((await state(page)).quickSwapSelected, '← で端から反対の端へ回る').toBe('bomb');
  await page.keyboard.up('x');
  const s = await state(page);
  expect(s.player.activeSubItem, 'X を離したのに持ち替わっていない').toBe('bomb');
  expect(s.quickSwapOpen).toBe(false);
  expect(await overlayShown(page)).toBe(false);
});

test('② ちょっと押しただけなら何もしない', async ({ page }) => {
  await open(page);
  await page.keyboard.press('x');
  await page.waitForTimeout(600);
  const s = await state(page);
  expect(s.quickSwapOpen, '離した後に枠が開いた').toBe(false);
  expect(await overlayShown(page)).toBe(false);
  expect(s.player.activeSubItem).toBe('bow');
  expect(s.isPaused).toBe(false);
});

test('③ X を押したまま Escape＝持ち替えずに閉じる（ポーズも開かない）', async ({ page }) => {
  await open(page);
  await holdXUntilOpen(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  let s = await state(page);
  expect(s.quickSwapOpen, 'Escape で閉じない').toBe(false);
  expect(s.isPaused, 'Escape がポーズまで開いた').toBe(false);
  await page.keyboard.up('x');
  s = await state(page);
  expect(s.player.activeSubItem, 'やめたのに持ち替わった').toBe('bow');
  expect(s.quickSwapOpen).toBe(false);
});

test('④ 開いている間は世界が止まる・閉じたら押しっぱなしの矢印でそのまま歩く', async ({ page }) => {
  await open(page);
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => window.__game.step(2));
  await holdXUntilOpen(page);
  await page.evaluate(() => window.__game.pause());   // 早替えは閉じるときにループを再開する＝ここでは手で進める
  const x0 = (await state(page)).player.x;
  await page.evaluate(() => window.__game.step(10));
  expect((await state(page)).player.x, '枠が開いている間に歩いた').toBe(x0);
  await page.keyboard.up('x');
  await page.evaluate(() => window.__game.pause());
  await page.evaluate(() => window.__game.step(4));
  expect((await state(page)).player.x, '閉じた後、押しっぱなしの矢印で歩かない').toBeGreaterThan(x0);
  await page.keyboard.up('ArrowRight');
});

for (const key of ['Meta', 'Alt']) {
  test(`⑤ ${key} の単押しで道具を使わない（対照：B は使う）`, async ({ page }) => {
    await open(page);
    const arrows = () => page.evaluate(() => window.__game.getPlayer().subItems.bow.count);
    const shots = () => page.evaluate(() => window.__game.getProjectiles().filter((q) => q.owner === 'player').length);
    const before = await arrows();
    await page.keyboard.press(key);
    await page.evaluate(() => window.__game.step(1));
    expect(await shots(), `${key} で矢が飛んだ`).toBe(0);
    expect(await arrows()).toBe(before);
    await page.keyboard.press('b');
    await page.evaluate(() => window.__game.step(1));
    expect(await arrows(), '対照：B で矢が減らない（⑤が意味を持たない）').toBe(before - 1);
  });
}

test('⑥ 道具が0個なら開かない', async ({ page }) => {
  await open(page, ROOM);
  expect(await page.evaluate(() => Object.keys(window.__game.getPlayer().subItems).length), '前提：道具なし').toBe(0);
  await page.keyboard.down('x');
  await page.waitForTimeout(600);
  expect((await state(page)).quickSwapOpen).toBe(false);
  expect(await overlayShown(page)).toBe(false);
  await page.keyboard.up('x');
});

test('⑦ 溜めの途中で開いたら溜めを取り消す', async ({ page }) => {
  await open(page);
  await page.keyboard.down('z');
  await page.evaluate(() => window.__game.step(30));
  expect((await state(page)).charging, '前提：溜めている').toBe(true);
  await holdXUntilOpen(page);
  expect((await state(page)).charging, '開いたのに溜めが残っている').toBe(false);
  await page.keyboard.up('z');
  await page.keyboard.up('x');
  await page.evaluate(() => { window.__game.pause(); window.__game.step(1); });
  const beams = await page.evaluate(() => window.__game.getProjectiles().filter((q) => q.owner === 'player').length);
  expect(beams, '閉じた後にビームが飛んだ').toBe(0);
});
