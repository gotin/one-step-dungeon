// @ts-check
// 実行キュー82⑦（2026-10-18・Fable 実装レビュー #15＋直す途中で見つけた穴）。
//   (a) 画面の大きさが変わってセル（--cell）が変わったら、勇者・石・落とし物を描き直す。
//       直す前＝resize は盤面のセルの背景だけ合わせ直し、キャラ層は px のまま＝スマホを回すと勇者と石が
//       次の描き直しまで別の場所に見えた（敵は毎 tick 動かされるので自然に直る）。
//   (b) キャラ層の描き直し（renderChars＝スイッチ・宝箱・押した石のたびに呼ばれる）の後も、落とし物の絵が残る。
//       直す前＝renderChars は char-layer を空にして作り直すが落とし物は作り直さなかった＝拾えるのに見えなかった。
//   ① 横長（レーン）→ 正方形（帯）でセルが変わる → 勇者・石・落とし物の位置が新しいセルの大きさに揃う
//   ② 描き直しの後も落とし物の絵が付いている・同じ位置
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';

// field 10,13：石 (3,4) を南へ押せる画面（tests/stone-debugmode-passthrough.spec.js と同じ所）
const URL = '/blade-of-lumia/game/?fromEditor=1&layer=field&stage=10,13&row=2&col=4&ps_weapon=1';

async function open(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL);
  await waitForBoard(page);
  await page.evaluate(() => { window.__game.pause(); window.__game.spawnFloorDrop(5, 6, 'heart'); });
}

const readPos = (page) => page.evaluate(() => {
  const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
  const p = window.__game.getPlayer();
  const pe = document.getElementById('char-player');
  const st = document.getElementById('char-stone-3-4');
  return {
    cell,
    player: { want: [p.x * cell, p.y * cell], got: [parseFloat(pe.style.left), parseFloat(pe.style.top)] },
    stoneLeft: st ? parseFloat(st.style.left) : null,
    drop: window.__game.getFloorDropViews()[0],
  };
});

test('① セルの大きさが変わったら、勇者・石・落とし物が新しい大きさの位置に描き直される', async ({ page }) => {
  await open(page);
  // 動かした石だけがキャラ層に乗る（動かしていない石は盤面のタイル＝セルの大きさに自然に付いてくる）
  await page.evaluate(() => {
    const g = window.__game;
    g.setHeroDir('down');
    for (let i = 0; i < 4 && !g.getStageState().stonePositions?.['3,4']; i++) g.movePlayer('down');
  });
  await page.waitForTimeout(700);   // 押しの後始末（実時間）
  const st = await page.evaluate(() => window.__game.getStageState().stonePositions['3,4']);
  expect(st, '前提：石が1マス動いた').toEqual({ r: 4, c: 4 });
  const a = await readPos(page);
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.waitForTimeout(400);
  const b = await readPos(page);
  expect(b.cell, '前提：セルの大きさが変わった').not.toBe(a.cell);
  expect(b.player.got, '勇者が古いセルの大きさの位置のまま').toEqual(b.player.want);
  expect(b.stoneLeft, '石が古いセルの大きさの位置のまま').toBe(4 * b.cell);
  expect(b.drop.shown, '落とし物の絵が消えた').toBe(true);
  expect(b.drop.left, '落とし物が古いセルの大きさの位置のまま').toBe((6 + 0.5) * b.cell);
});

test('② キャラ層の描き直しの後も、落とし物の絵が付いている', async ({ page }) => {
  await open(page);
  const before = (await readPos(page)).drop;
  expect(before.shown, '前提：落とし物が見えている').toBe(true);
  await page.evaluate(() => window.__game.renderChars());
  const after = (await readPos(page)).drop;
  expect(after.shown, '描き直しで落とし物の絵が消えた（拾えるのに見えない）').toBe(true);
  expect(after.left).toBe(before.left);
});
