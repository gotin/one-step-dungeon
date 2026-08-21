// tests/sub-item-hint-pulse.spec.js — Phase 0b（2026-08-21 ユーザー報告）
//
// 症状：はじめてサブアイテムを拾ったとき、初回だけ開く「！ ヒント」ダイアログ（3行）と、
// 毎回出る pulse('☐ ◯◯ を手に入れた！')（#msg-bar・game/ui.js）が同時に走る。pulse の
// 消灯タイマーは setTimeout の実時間＝stopGameLoop()（ダイアログ中）でも止まらないので、
// ヒントを読み終える前に 2000ms が経過し、閉じた瞬間には既にアイテム名が消えている。
//
// 修正：pulse() はオーバーレイ（ダイアログ／ショップ／ポーズ）が開いている間は表示を保留し、
// 閉じた瞬間に出し直す（消灯タイマーもそこから数え直す）。並びが違う2経路（床置き／宝箱）
// を両方直す必要がある＝床置き（player.js）は元々 pulse() → maybeShowSubItemHint() の順で
// 呼んでいた＝ヒントが開く前に pulse が実時間で走り出す＝呼び順を入れ替えて修正。宝箱は
// giveSubItem() の中で先に maybeShowSubItemHint() が呼ばれる順だった＝ui.js 側の保留だけで直る。
//
// 検証ステージ = test_mechanics の bomb_wall（3,0）。ブーメラン(4,1)・爆弾(4,6) の床置きと
// 回復薬（小）の宝箱(2,5) を1枚の盤面で両方測れる。

import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl(row, col) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey('bomb_wall'),
    row: String(row), col: String(col),
  });
  return `${GAME}?${p.toString()}`;
}

// #msg-bar を 150ms 間隔でサンプリングし、指定文字列が連続して何回見えるかを返す。
async function sampleMsgBar(page, iterations = 16) {
  return page.evaluate(async (n) => {
    const bar = document.getElementById('msg-bar');
    const runs = [];
    for (let i = 0; i < n; i++) {
      const text = bar.classList.contains('hidden') ? '' : bar.textContent;
      if (runs.length && runs[runs.length - 1].text === text) runs[runs.length - 1].samples++;
      else runs.push({ text, samples: 1 });
      await new Promise(r => setTimeout(r, 150));
    }
    return runs;
  }, iterations);
}

function heldSamples(timeline, needle) {
  return timeline
    .filter(run => run.text.includes(needle))
    .reduce((max, run) => Math.max(max, run.samples), 0);
}

test.describe('Phase 0b: サブアイテム取得メッセージがオーバーレイ中に消灯しない', () => {
  test('① 宝箱経路：初回ヒントを読み終えてもアイテム名が1.5秒以上読める', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(previewUrl(3, 5));
    await waitForBoard(page);

    // (3,5) から北へ1歩＝チェスト(2,5)を開ける。回復薬（小）は非passive＝ヒント対象。
    // movePlayer は MOVE_STEP=0.5 の半セル移動＝1セル進むには2回呼ぶ。
    await page.evaluate(() => window.__game.movePlayer('up'));
    await page.evaluate(() => window.__game.movePlayer('up'));
    await expect.poll(() => page.evaluate(() => document.getElementById('dialog-overlay')?.classList.contains('hidden') === false))
      .toBe(true);

    // ヒント3行を「実際に読む」速度（各行 700ms）で進める＝旧2000msタイマーなら
    // ここで既に消灯している時間帯を作る。
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(700);
      await page.keyboard.press(' ');
    }
    await expect.poll(() => page.evaluate(() => document.getElementById('dialog-overlay')?.classList.contains('hidden')))
      .toBe(true);

    const timeline = await sampleMsgBar(page);
    const shown = timeline.map(r => `${r.samples}×${r.text || '(空)'}`).join(' / ');
    expect(heldSamples(timeline, '回復薬'), `アイテム名が1.5秒読めない（表示: ${shown}）`)
      .toBeGreaterThanOrEqual(10);
    expect(errors).toEqual([]);
  });

  test('② 床置き経路：初回はヒント後に読める／2回目以降はヒント無しで即出る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(previewUrl(4, 2));
    await waitForBoard(page);

    // (4,2) から西へ1歩＝ブーメラン(4,1)。初回サブアイテム取得＝ヒントが開く。
    await page.evaluate(() => window.__game.movePlayer('left'));
    await page.evaluate(() => window.__game.movePlayer('left'));
    await expect.poll(() => page.evaluate(() => document.getElementById('dialog-overlay')?.classList.contains('hidden') === false))
      .toBe(true);

    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(700);
      await page.keyboard.press(' ');
    }
    await expect.poll(() => page.evaluate(() => document.getElementById('dialog-overlay')?.classList.contains('hidden')))
      .toBe(true);

    const timeline1 = await sampleMsgBar(page);
    const shown1 = timeline1.map(r => `${r.samples}×${r.text || '(空)'}`).join(' / ');
    expect(heldSamples(timeline1, 'ブーメラン'), `初回：アイテム名が1.5秒読めない（表示: ${shown1}）`)
      .toBeGreaterThanOrEqual(10);

    // ブーメラン(4,1) → 爆弾(4,6) まで東へ5歩（movePlayer は半セル移動＝1歩=2呼び出し）。
    // 2回目以降＝ヒントはもう出ない（回帰）。
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.__game.movePlayer('right'));
    }
    const dialogOpenAfter2nd = await page.evaluate(
      () => document.getElementById('dialog-overlay')?.classList.contains('hidden') === false);
    expect(dialogOpenAfter2nd, '2回目以降はヒントダイアログが出ない').toBe(false);

    const timeline2 = await sampleMsgBar(page, 8);
    const shown2 = timeline2.map(r => `${r.samples}×${r.text || '(空)'}`).join(' / ');
    expect(heldSamples(timeline2, '爆弾'), `2回目以降のメッセージが出ていない（表示: ${shown2}）`)
      .toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});
