// @ts-check
// 実行キュー83（2026-10-18・Fable 実装レビュー #13）。
// 画面を移ったときのセーブは「移った後」に書く。
// 直す前＝`checkStageTransition`（画面端・入口 `>`）と笛のワープが、遷移を始めた瞬間に `saveGame()` していた
// ＝出発側の画面の名前と、盤の外にはみ出した座標（例 `y:-0.5`）が保存され、「続きから」で入口の外／
// 半歩はみ出した位置から始まった。
// 守るもの＝遷移が終わった直後のセーブが、到着側の層・画面・盤の中の座標を指している（3経路とも）。
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard, readSave } from './helpers.js';

function previewUrl(params) {
  return `${GAME_URL}?${new URLSearchParams({ fromEditor: '1', ...params }).toString()}`;
}

// 遷移は setTimeout（端・入口 100ms／笛 400ms）で enterStage を呼ぶ＝実時間で待つ。
// 裏の setInterval が手動 step と並走しないよう、先に pause() する（arrival-landing.spec.js と同じ）。
async function boot(page, url) {
  await page.goto(url);
  await waitForBoard(page);
  await page.evaluate(() => {
    window.__game.pause();
    localStorage.removeItem('blade-of-lumia-save');   // 前のセーブが残っていると「書かれた」ことが見えない
  });
}

async function walkUntil(page, dir, layer, stage, max) {
  for (let i = 0; i < max; i++) {
    await page.evaluate((d) => { window.__game.movePlayer(d); window.__game.step(1); }, dir);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => window.__game.getState());
    if (s.currentLayer === layer && s.stageKey === stage) return true;
  }
  return false;
}

function expectInsideArrival(save, layer, stage, rows, cols) {
  expect(save, 'セーブが書かれていない').not.toBeNull();
  expect([save.currentLayer, save.stageKey], '出発側の画面が保存された').toEqual([layer, stage]);
  const { x, y } = save.player;
  expect(x >= 0 && x <= cols - 1 && y >= 0 && y <= rows - 1, `保存座標 (${x},${y}) が盤の外`).toBe(true);
}

test('画面端を越えた直後のセーブは到着側の画面・盤の中の座標', async ({ page }) => {
  await boot(page, previewUrl({ layer: 'field', stage: '13,2', row: '0', col: '5' }));
  expect(await walkUntil(page, 'up', 'field', '13,1', 8), '北へ抜けられない').toBe(true);
  const st = await page.evaluate(() => window.__game.getState());
  expectInsideArrival(await readSave(page), 'field', '13,1', 10, 12);
  const save = await readSave(page);
  expect({ x: save.player.x, y: save.player.y }, '着地したセルそのものが保存される').toEqual({ x: st.player.x, y: st.player.y });
});

test('入口 > を踏んだ直後のセーブは行き先の層・画面', async ({ page }) => {
  // field 12,2 (8,5) の `>` ＝ D4 の入口。真下 (9,5) から上へ。
  await boot(page, previewUrl({ layer: 'field', stage: '12,2', row: '9', col: '5' }));
  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) { window.__game.movePlayer('up'); window.__game.step(1); }
  });
  await page.waitForFunction(() => window.__game.getState().currentLayer === 'dungeon_4', null, { timeout: 3000 });
  const st = await page.evaluate(() => window.__game.getState());
  const save = await readSave(page);
  expect(save, 'セーブが書かれていない').not.toBeNull();
  expect([save.currentLayer, save.stageKey], '出発側の画面が保存された').toEqual([st.currentLayer, st.stageKey]);
  expect({ x: save.player.x, y: save.player.y }).toEqual({ x: st.player.x, y: st.player.y });
});

test('笛のワープの直後のセーブは運ばれた先の画面', async ({ page }) => {
  // secret_grotto 0,0 の笛＝field 2,0 (8,6) へ運ぶ（tests/flute.spec.js と同じ配置）。
  await boot(page, previewUrl({ layer: 'secret_grotto', stage: '0,0', row: '5', col: '2', ps_flute: '1' }));
  await page.evaluate(() => { window.__game.useSubItem(); window.__game.step(1); });
  await page.waitForFunction(() => window.__game.getState().stageKey === '2,0', null, { timeout: 3000 });
  const save = await readSave(page);
  expect(save, 'セーブが書かれていない').not.toBeNull();
  expect([save.currentLayer, save.stageKey], 'ワープ前の画面が保存された').toEqual(['field', '2,0']);
  expect({ x: save.player.x, y: save.player.y }).toEqual({ x: 6, y: 8 });
});

test('同じ画面に入り直す（続きから・リトライ）では書かない＝倒れた瞬間の部屋をセーブに残さない', async ({ page }) => {
  await boot(page, previewUrl({ layer: 'field', stage: '13,2', row: '4', col: '5' }));
  await page.evaluate(() => { const s = window.__game.getState(); window.__game.enterStage(s.currentLayer, s.stageKey, 4, 5); });
  expect(await readSave(page), '同じ画面への enterStage がセーブを書いた').toBeNull();
});
