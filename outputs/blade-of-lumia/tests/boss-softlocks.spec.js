// ボス戦まわりの恒久詰み（実行キュー21 の通しプレイで見つけた F7・F1）
//
// 何のためのテストか（2026-10-11・ユーザー判定「詰み3件だけ先」）：
//   F7 ボス扉（':'）の上に立ったままボスを倒すと、扉から降りた瞬間に扉が閉まり、
//      ボスのいない部屋に閉じ込められていた。閉状態はセーブされる＝「続きから」でも出られない。
//      原因＝game/boss.js whenClearOfBossDoors が「扉から降りるまで閉めるのを待つ」間に
//      ボスが倒されたかを見ずに閉めていた。
//   F1 星の欠片を拾う前に部屋を出ると絵が消え（座標だけ残り、別の部屋の同じ座標を踏むと
//      見えない欠片を拾えた）、拾う前に再読込すると永久に失われていた。
//      欠片の所在を player.pendingTriforce（セーブに入る）に持たせ、入室・描き直しのたびに置き直す。
//   （F12＝攻撃の構えの窓がセーブに残る、は tests/player-debuff-enemies.spec.js ⑰ で測る）
//
// 部屋＝dungeon_1 0,0（D1 のボス部屋）。':' は (9,5)(9,6)、ゴーレム G は (2,6)。

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';

const LAYER = 'dungeon_1';
const BOSS_ROOM = '0,0';

function bossRoomUrl(row, col) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: LAYER, stage: BOSS_ROOM,
    row: String(row), col: String(col),
    ps_weapon: '1', ps_sword: '1', ps_hearts: '10',
  });
  return `${GAME_URL}?${p.toString()}`;
}

async function killBoss(page) {
  await page.evaluate(() => {
    const g = window.__game.getEnemies().find((e) => e.type === 'G');
    window.__game.dealDamage(g.id, 9999, 'sword');
  });
  await page.waitForFunction(
    () => !window.__game.getEnemies().some((e) => e.type === 'G'), null, { timeout: 20_000 });
}

test.describe('ボス戦の恒久詰み（キュー21）', () => {
  test('F7 扉の上でボスを倒してから降りても、扉は閉じない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 扉 (9,5) の上に立って入室＝閉めるのは「扉から降りるまで」待たれている状態
    await page.goto(bossRoomUrl(9, 5));
    await waitForBoard(page);
    await page.waitForTimeout(700);   // 閉めの初回判定（400ms）を確実に過ぎてから
    const before = await page.evaluate(() => window.__game.getStageState().doorwayStates);
    expect(before['9,5'], '扉の上にいるのに閉まった（前提が崩れた）').not.toBe('boss_closed');

    await killBoss(page);
    // 終幕（点滅・爆発・欠片）が終わってループが戻るまで待つ
    await page.waitForTimeout(2500);

    // 扉から降りる（1回＝半マス∴繰り返して 1 マス以上内側へ）
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.__game.movePlayer('up'));
      await page.waitForTimeout(60);
    }
    expect(await page.evaluate(() => window.__game.getPlayer().y),
      '扉から降りられていない（テストの前提）').toBeLessThanOrEqual(8);
    // 待っていた閉め（100ms 刻み）が走るなら必ず走る時間を置く
    await page.waitForTimeout(800);

    const after = await page.evaluate(() => window.__game.getStageState().doorwayStates);
    for (const k of ['9,5', '9,6']) {
      expect(after[k], `ボスを倒した後に扉 ${k} が閉じた＝ボスのいない部屋に閉じ込められる`)
        .not.toBe('boss_closed');
    }
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('F1 拾う前の星の欠片は、部屋を出入りしても・続きからでも残り、別の部屋では拾えない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 部屋の内側（扉の上ではない）で入室＝普通にボス戦が始まる
    await page.goto(bossRoomUrl(8, 5));
    await waitForBoard(page);
    await page.waitForFunction(
      () => !document.getElementById('boss-hpbar')?.classList.contains('hidden'), null,
      { timeout: 5000 });
    await killBoss(page);
    await page.waitForSelector('#pending-triforce-piece', { timeout: 10_000 });
    await page.waitForTimeout(2500);   // 出現直後の「まだ拾えない」1.5 秒を過ぎる

    const pt = await page.evaluate(() => window.__game.getPlayer().pendingTriforce);
    expect(pt, '欠片の所在が player に入っていない＝セーブに残らない').toMatchObject({ layer: LAYER, stage: BOSS_ROOM });
    const count0 = await page.evaluate(() => window.__game.getPlayer().triforceCount);

    // ① 拾わずに隣の部屋へ → 絵は無く、同じ座標を踏んでも拾えない
    await page.evaluate(() => window.__game.enterStage('dungeon_1', '1,0', 5, 5));
    await page.evaluate(({ x, y }) => {
      const p = window.__game.getPlayer(); p.x = x; p.y = y;
      window.__game.pause(); window.__game.step(3);
    }, pt);
    expect(await page.evaluate(() => !!document.getElementById('pending-triforce-piece')),
      '別の部屋に欠片の絵が出ている').toBe(false);
    expect(await page.evaluate(() => window.__game.getPlayer().triforceCount),
      '別の部屋の同じ座標を踏んで、見えない欠片を拾えた').toBe(count0);
    await page.evaluate(() => window.__game.resume());

    // ② ボス部屋へ戻る → 欠片の絵がある
    await page.evaluate(() => window.__game.enterStage('dungeon_1', '0,0', 8, 5));
    expect(await page.evaluate(() => !!document.getElementById('pending-triforce-piece')),
      'ボス部屋に戻ったら欠片が見えない').toBe(true);

    // ③ 拾う前に再読込して「続きから」 → ボス部屋に欠片がある
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
    expect(saved?.player?.pendingTriforce, 'セーブに欠片の所在が無い').toMatchObject({ layer: LAYER, stage: BOSS_ROOM });
    await page.goto(GAME_URL);
    await page.locator('#btn-continue').click();
    await waitForBoard(page);
    await page.evaluate(() => window.__game.enterStage('dungeon_1', '0,0', 8, 5));
    await page.waitForSelector('#pending-triforce-piece', { timeout: 5000 });

    // ④ 踏むと拾える＝所持数 +1・所在は消え、セーブからも消える
    await page.evaluate(({ x, y }) => {
      const p = window.__game.getPlayer(); p.x = x; p.y = y;
      window.__game.pause(); window.__game.step(2);
    }, pt);
    const after = await page.evaluate(() => ({
      count: window.__game.getPlayer().triforceCount,
      pt: window.__game.getPlayer().pendingTriforce,
      el: !!document.getElementById('pending-triforce-piece'),
    }));
    expect(after.count, '続きからの欠片を踏んでも拾えない').toBe(saved.player.triforceCount + 1);
    expect(after.pt, '拾った後も所在が残っている＝もう一度出る').toBeNull();
    expect(after.el, '拾った後も絵が残っている').toBe(false);
    const saved2 = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
    expect(saved2.player.pendingTriforce, '拾った後のセーブに所在が残っている').toBeNull();
    expect(errors, 'pageerror が出た').toEqual([]);
  });
});
