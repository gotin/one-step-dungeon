// @ts-check
// 実行キュー82⑥（2026-10-18・Fable 実装レビュー #23）。
// 石を押した後始末（約 0.5 秒後の setTimeout＝描き直し・セーブ・足元のイベント・遷移の確認）は、
// その間に倒れていたら走らない＝「倒れた瞬間を保存しない」（game.js recordDeath の方針）を守る。
// 直す前＝後始末は「次の押しが始まったか（世代）」しか見なかった＝石を押した直後に倒れると、
// ゲームオーバーの裏で HP 0 の状態をセーブし、足元の宝箱などのイベントも走った。
//   ① 石を押した直後に倒れる → 後始末の時間が過ぎてもセーブは書かれない
//   ② （対照）倒れなければ、後始末がセーブを書く
import { test, expect } from '@playwright/test';
import { SAVE_KEY, waitForBoard } from './helpers.js';

// field 10,13：石 (3,4) を南へ押せる（tests/stone-debugmode-passthrough.spec.js と同じ所）
const URL = '/blade-of-lumia/game/?fromEditor=1&layer=field&stage=10,13&row=2&col=4&ps_weapon=1&ps_hearts=3';

async function pushStone(page) {
  await page.goto(URL);
  await waitForBoard(page);
  await page.evaluate(() => { window.__game.pause(); window.__game.setHeroDir('down'); });
  await page.keyboard.press('g');   // プレビューは常に無敵（debugMode）＝倒れるために切る
  // 押しが始まるまで半歩ずつ（押しの後始末は実時間の setTimeout）
  const started = await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 4; i++) {
      g.movePlayer('down');
      const sp = g.getStageState().stonePositions?.['3,4'];
      if (sp && sp.r !== 3) return true;
    }
    return false;
  });
  expect(started, '前提：石が動き始めた').toBe(true);
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ marker: 'before' })), SAVE_KEY);
}

const savedMarker = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.marker ?? 'written', SAVE_KEY);

test('① 石を押した直後に倒れたら、後始末はセーブを書かない', async ({ page }) => {
  await pushStone(page);
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.getPlayer();
    p.hp = 1;
    g.injectEnemyProjectile(p.x, p.y, 0, 1, 5, 0.01);
    g.step(1);
  });
  expect(await page.evaluate(() => window.__game.getState().isGameover), '前提：倒れた').toBe(true);
  await page.waitForTimeout(1200);
  expect(await savedMarker(page), '倒れた後に石の後始末がセーブを書いた').toBe('before');
});

test('② 対照：倒れなければ、後始末がセーブを書く', async ({ page }) => {
  await pushStone(page);
  await page.waitForTimeout(1200);
  expect(await savedMarker(page), '後始末がセーブを書いていない（①が意味を持たない）').toBe('written');
});
