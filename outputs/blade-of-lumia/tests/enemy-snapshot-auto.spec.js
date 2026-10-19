// @ts-check
// 実行キュー85 #11（2026-10-19）。敵のスナップショット（`__game.getEnemies()`）は実体の全欄を写す。
// 旧＝390 行のホワイトリスト＝足し忘れた欄はテストから常に undefined に見えた（[[blade-snapshot-api-names]]）。
// 写し方の約束は game/enemy-snapshot.js の冒頭。
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';

async function setup(page) {
  await page.goto(`${GAME_URL}?fromEditor=1&layer=dungeon_4&stage=3,3&row=2&col=1`);
  await waitForBoard(page);
  return page.evaluate(() => {
    const g = window.__game;
    g.pause();
    return g.injectEnemy(5, 5, 5);
  });
}

test('① 名前を足していない内部の欄も、先頭の _ を外した名前で見える（深いコピー）', async ({ page }) => {
  const id = await setup(page);
  const r = await page.evaluate((id) => {
    const g = window.__game;
    g.setEnemyFieldForTest(id, { _zzProbe: 7, _zzCells: [[1, 2]], _zzCfg: { a: { b: 3 } } });
    const s1 = g.getEnemies().find(e => e.id === id);
    const seen = JSON.parse(JSON.stringify({ probe: s1.zzProbe, cells: s1.zzCells, cfg: s1.zzCfg }));
    s1.zzCells[0][0] = 99;   // 写しを書き換えても実体に響かない
    s1.zzCfg.a.b = 99;
    const s2 = g.getEnemies().find(e => e.id === id);
    return { seen, after: { cells: s2.zzCells, cfg: s2.zzCfg } };
  }, id);
  expect(r.seen).toEqual({ probe: 7, cells: [[1, 2]], cfg: { a: { b: 3 } } });
  expect(r.after, '写しが実体と同じ配列・オブジェクトを指している').toEqual({ cells: [[1, 2]], cfg: { a: { b: 3 } } });
});

test('② DOM（el）と関数は写さない／_ の無い欄が勝つ', async ({ page }) => {
  const id = await setup(page);
  const r = await page.evaluate((id) => {
    const g = window.__game;
    g.setEnemyFieldForTest(id, { _zzFn: () => 1, _hp: 999 });
    const s = g.getEnemies().find(e => e.id === id);
    return { hasEl: 'el' in s, hasFn: 'zzFn' in s, hp: s.hp };
  }, id);
  expect(r.hasEl).toBe(false);
  expect(r.hasFn).toBe(false);
  expect(r.hp, '`_hp` が `hp` を上書きした').toBe(5);
});

test('③ 実体に無い欄：旧ホワイトリストの欄は null・既定値の欄は決まった値・それ以外は undefined', async ({ page }) => {
  const id = await setup(page);
  const s = await page.evaluate((id) => {
    const s = window.__game.getEnemies().find(e => e.id === id);
    return { slamAt: s.slamAt, swingAt: s.swingAt, hidden: s.hidden, guarding: s.guarding,
      stolenRupees: s.stolenRupees, attackTimes: s.attackTimes, phasesTriggered: s.phasesTriggered,
      momSpeed: s.momSpeed, home: s.home, neverKey: 'zzNever' in s };
  }, id);
  expect(s).toEqual({ slamAt: null, swingAt: null, hidden: false, guarding: false,
    stolenRupees: 0, attackTimes: {}, phasesTriggered: [], momSpeed: null, home: null, neverKey: false });
});

test('④ 形を変えて出す欄（[r,c] → {r,c}・レーザーの別名・真偽に畳む欄）', async ({ page }) => {
  const id = await setup(page);
  const s = await page.evaluate((id) => {
    const g = window.__game;
    g.setEnemyFieldForTest(id, { _lsCells: [[3, 4]], _mgCells: [[5, 6]], _aspBeamShape: { lane: 1 }, _aspRetreat: { t: 1 },
      _homeX: 2, _homeY: 8, _momVx: 3, _momVy: 4 });
    const s = g.getEnemies().find(e => e.id === id);
    return { lsCells: s.lsCells, mgCells: s.mgCells, laserWarn: s.laserWarn, aspRetreating: s.aspRetreating,
      home: s.home, momSpeed: s.momSpeed };
  }, id);
  expect(s).toEqual({ lsCells: [{ r: 3, c: 4 }], mgCells: [{ r: 5, c: 6 }], laserWarn: { lane: 1 },
    aspRetreating: true, home: { r: 8, c: 2 }, momSpeed: 5 });
});
