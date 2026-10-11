// tests/q21-pass2.spec.js
// 実行キュー21 第2パス（2026-10-11）の番人。通しプレイで見つかった気づきのうち、
// 操作・画面に関わる3件（F2・F3・F4）を縛る。データ側（F5・F8・F10）は
// scripts/migrate-q21-pass2.mjs の自己検証と、下の「データ」節で縛る。F14 は
// tests/solver-tiles-water-ladder.spec.js。
//
// F2  「はじめから」の直後に老賢者が向こうから話しかけてきて、その会話で話し方を教える
//     （ユーザー案 2026-10-11）。「続きから」では話しかけてこない。
// F3  「続きから／はじめから」の画面でキーを押しても例外が出ない（旧＝Space が swordAttack に届き
//     `Cannot read properties of null (reading 'tiles')`）。さらに矢印で選び Space/Enter で押せる
//     （ユーザー報告 2026-10-11「矢印キーを押しても何もうごかない。スペースキーもなにもうごかない」）。
// F4  看板の前で剣を振っても、近くに敵がいる間は看板が開かない（旧＝戦うたびに会話が開いた）。
//     敵がいなければ従来どおり読める。
//
// 歯の確認（2026-10-11・専用ポート 18090 で実施）：
//   F2 ＝ startNewGame の openIntroDialog() 呼び出しを消す → ① が赤
//   F3 ＝ input.js の buttonOverlayOpen() で return する行を消す → ③ が赤
//   F4 ＝ combat.js の看板分岐の enemyNearby 条件を消す → ⑤ が赤
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';
import { isEnemyTile } from '../shared/enemies.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const dialogOpen = (page) => page.evaluate(() =>
  !document.getElementById('dialog-overlay').classList.contains('hidden'));
const dialogName = (page) => page.evaluate(() => document.getElementById('dialog-name')?.textContent ?? '');

/** 開始画面 (2,2) から下へ2マス→西端 (4,0) から隣の画面へ出る＝部屋を出る直前にセーブが入る。 */
async function walkOutToSave(page) {
  await page.evaluate(() => {
    window.__game.pause();
    for (let i = 0; i < 4; i++) { window.__game.movePlayer('down'); window.__game.step(1); }
    for (let i = 0; i < 12; i++) { window.__game.movePlayer('left'); window.__game.step(1); }
    window.__game.resume();
  });
  await page.waitForFunction((key) => !!localStorage.getItem(key), SAVE_KEY);
}

/** 会話を最後まで送り、読んだ行を返す。 */
async function readWholeDialog(page) {
  const lines = [];
  for (let i = 0; i < 30 && await dialogOpen(page); i++) {
    lines.push(await page.evaluate(() => document.getElementById('dialog-text').textContent));
    await page.keyboard.press('Space');
  }
  return lines;
}

test.describe('キュー21 F2 – はじめからの直後に老賢者が話しかけてくる', () => {
  test('① 新規ゲームを始めると老賢者の会話が開き、最後に話し方の案内が出る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript((key) => { try { localStorage.removeItem(key); } catch { /* noop */ } }, SAVE_KEY);
    await page.goto(GAME_URL);
    await waitForBoard(page);
    await page.waitForFunction(() => !document.getElementById('dialog-overlay').classList.contains('hidden'));
    expect(await dialogName(page)).toBe('老賢者');

    const sp = map.startPos;
    const sage = Object.values(map.layers[sp.layer].stages[sp.stage].npcData).find((e) => e.name === '老賢者');
    const lines = await readWholeDialog(page);
    // 通常の台詞（目的＝星の欠片8つ）→ 足す行（話し方）の順に全部読める。
    expect(lines).toHaveLength(sage.lines.length + sage.introLines.length);
    expect(lines.slice(-sage.introLines.length).join('')).toContain('攻撃ボタン');
    expect(await dialogOpen(page)).toBe(false);
    // 自分で話しかけたときと同じく、読み終えると老賢者の印（草原の洞窟）が付く。
    const marks = await page.evaluate(() => window.__game.getPlayer().mapMarks.map((m) => m.stage));
    expect(marks).toEqual([sage.mark.stage]);

    // 閉じたら歩ける（会話でゲームループが止まったままにならない）。
    const before = await page.evaluate(() => window.__game.getState().player);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
    const after = await page.evaluate(() => window.__game.getState().player);
    expect(after.x).toBeGreaterThan(before.x);
    expect(errors).toEqual([]);
  });

  test('② 「続きから」では話しかけてこない', async ({ page }) => {
    // 1回目：新規で始めて会話を閉じ、部屋を出てセーブを作る（場所は隣の画面になる）。
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem('q21-f2')) { localStorage.removeItem(key); sessionStorage.setItem('q21-f2', '1'); }
    }, SAVE_KEY);
    await page.goto(GAME_URL);
    await waitForBoard(page);
    await page.waitForFunction(() => !document.getElementById('dialog-overlay').classList.contains('hidden'));
    await readWholeDialog(page);
    await walkOutToSave(page);

    // 2回目：再読込→タイトル→続きから。
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('title-overlay').classList.contains('hidden'));
    await page.click('#btn-continue');
    await waitForBoard(page);
    await page.waitForTimeout(400);
    expect(await dialogOpen(page)).toBe(false);
  });
});

test.describe('キュー21 F3 – タイトル画面はキーで選んで押せる', () => {
  /** 新規で始めて会話を閉じ、部屋を出てセーブを作り、再読込してタイトルを出す。 */
  async function toTitle(page, tag) {
    await page.addInitScript(([key, tag]) => {
      if (!sessionStorage.getItem(tag)) { localStorage.removeItem(key); sessionStorage.setItem(tag, '1'); }
    }, [SAVE_KEY, tag]);
    await page.goto(GAME_URL);
    await waitForBoard(page);
    await page.waitForFunction(() => !document.getElementById('dialog-overlay').classList.contains('hidden'));
    await readWholeDialog(page);
    await walkOutToSave(page);
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('title-overlay').classList.contains('hidden'));
  }
  const focusedId = (page) => page.evaluate(() => document.activeElement?.id ?? '');

  test('③ 開いた時点で「続きから」が選ばれていて、Space で続きから始まる（pageerror 0・勝手に歩かない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await toTitle(page, 'q21-f3a');
    await expect.poll(() => focusedId(page)).toBe('btn-continue');

    await page.keyboard.down('ArrowLeft');                // 矢印を押したまま決定する
    await page.keyboard.press('Space');
    await page.keyboard.up('ArrowLeft');
    await page.waitForFunction(() => document.getElementById('title-overlay').classList.contains('hidden'));
    const p0 = await page.evaluate(() => window.__game.getState().player);
    await page.waitForTimeout(500);
    const p1 = await page.evaluate(() => window.__game.getState().player);
    expect({ x: p1.x, y: p1.y }, '続きからの直後に勝手に歩いた').toEqual({ x: p0.x, y: p0.y });
    expect(errors).toEqual([]);
  });

  test('③b 矢印で「はじめから」へ移して Space → 削除確認は安全側（戻る）が選ばれ、Space で戻れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await toTitle(page, 'q21-f3b');
    await expect.poll(() => focusedId(page)).toBe('btn-continue');
    await page.keyboard.press('ArrowDown');
    expect(await focusedId(page)).toBe('btn-newgame');
    await page.keyboard.press('ArrowDown');               // 端で折り返す
    expect(await focusedId(page)).toBe('btn-continue');
    await page.keyboard.press('ArrowUp');
    expect(await focusedId(page)).toBe('btn-newgame');

    await page.keyboard.press('Space');
    await page.waitForFunction(() => !document.getElementById('confirm-overlay').classList.contains('hidden'));
    await expect.poll(() => focusedId(page), '削除確認で「削除して開始」が既定になっている').toBe('btn-confirm-no');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => !document.getElementById('title-overlay').classList.contains('hidden'));
    expect(await page.evaluate((key) => !!localStorage.getItem(key), SAVE_KEY), 'セーブが消えた').toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('キュー21 F4 – 戦闘中は看板の前で剣を振っても看板が開かない', () => {
  // D1 [1,2] の道しるべ (7,5)。その真上 (6,5) に立って下を向く。
  const url = `${GAME_URL}?fromEditor=1&layer=dungeon_1&stage=1,2&row=6&col=5&ps_sword=0`;

  async function setup(page) {
    await page.goto(url);
    await waitForBoard(page);
    await page.evaluate(() => {
      window.__game.pause();
      // 部屋の敵を消して条件を固定する（E は巡回で近づいたり離れたりする）。
      for (const e of window.__game.getEnemies()) window.__game.dealDamage(e.id, 999, 'sword');
      window.__game.step(2);
      window.__game.setHeroDir('down');
    });
    expect(await page.evaluate(() => window.__game.getEnemies().length)).toBe(0);
  }

  test('④ 対照：敵がいなければ従来どおり看板が開く', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => window.__game.swordAttack());
    expect(await dialogOpen(page)).toBe(true);
  });

  test('⑤ 2マス以内に敵がいると看板は開かず剣を振る（離れれば読める）', async ({ page }) => {
    await setup(page);
    // 横 2 マス（中心距離 2）＝戦闘中。動かない敵を置く。
    const id = await page.evaluate(() => window.__game.injectEnemy(7, 6, 5));
    await page.evaluate(() => window.__game.swordAttack());
    expect(await dialogOpen(page)).toBe(false);
    // 剣は振れている＝構えのポーズに入っている。
    expect(await page.evaluate(() => (window.__game.getPlayer()._atkUntil ?? 0) > 0)).toBe(true);

    // 敵を倒せば読める。
    await page.evaluate((eid) => { window.__game.dealDamage(eid, 999, 'sword'); window.__game.step(10); }, id);
    await page.evaluate(() => window.__game.swordAttack());
    expect(await dialogOpen(page)).toBe(true);
  });
});

test.describe('キュー21 第2パス – データ', () => {
  test('⑥ F8：本編の入口 > の着地マスの隣（斜めを含む）に敵がいない', () => {
    const bad = [];
    for (const [lk, layer] of Object.entries(map.layers)) {
      if (lk === 'test_mechanics') continue;
      for (const [sk, st] of Object.entries(layer.stages)) {
        for (const pk of Object.keys(st.mapEnters ?? {})) {
          const [r, c] = pk.split(',').map(Number);
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const ch = st.tiles[r + dr]?.[c + dc];
            if (ch && isEnemyTile(ch)) bad.push(`${lk} [${sk}] 入口 (${pk}) の隣 (${r + dr},${c + dc}) に ${ch}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('⑦ F10：ロウソクの宝箱は D4 [1,2] の1つだけ', () => {
    const where = [];
    for (const [lk, layer] of Object.entries(map.layers)) {
      if (lk === 'test_mechanics') continue;
      for (const [sk, st] of Object.entries(layer.stages)) {
        for (const c of Object.values(st.chestContents ?? {})) if (c.item === 'candle') where.push(`${lk} [${sk}]`);
      }
    }
    expect(where).toEqual(['dungeon_4 [1,2]']);
  });
});
