// tests/swift-boots.spec.js
// 疾風の靴（実行キュー13・2026-09-29 試作）＝持っていると Shift を押している間だけ速く歩ける。
//
// 🔴 ユーザー確定の不変条件＝**プレイヤーが居られる位置はセルの中央か半セルの位置だけ**。
//    靴で変えるのは「半マス進むのにかかる時間」だけ＝1回の移動量（MOVE_STEP 0.5）は変えない。
//    ∴実装は 1 tick に `movePlayer`（半マス）を DASH_SPEED 回呼ぶ（1歩ずつ壁・床・入口を判定）。
//
// 縛るもの：
//   ① 靴＋Shift＝1 tick に 1マス（半マス×2）。位置は毎 tick 半マス格子の上
//   ② 靴が無ければ Shift を押しても普通の速さ／靴があっても Shift を離せば普通の速さ
//   ③ 壁の手前で止まる（2歩目で壁を越えない・格子から外れない）
//   ④ 二周目（1.2 倍）と掛け合わせない＝走ると毎 tick ちょうど 1マス
//   ⑤ 入力の後始末＝Shift を先に離してから文字キーを離しても歩き続けない／フォーカスが外れたら止まる
//   ⑥ 見た目＝走っている間だけ #char-player に .dashing（補間を tick の長さに伸ばす）
//   ⑦ 画面の端を走って越えても、着いた先の位置が半マス格子の上
// 本実装（道具として手に入れる）：
//   ⑧ 置き場所＝field 15,19 の宝箱 (6,7) だけ・道具の定義と所持の判定
//   ⑨ 実プレイ：爆弾＋笛で宝箱を開けると靴が手に入り、文に Shift の使い方が出て 2 秒後も読める。
//      サブアイテム欄には並ばない・その場から走れる・セーブに残る
//   ⑩ ロード：靴を持ったセーブは走れる／靴の無い旧セーブは走れない
//   ⑪ ポーズ画面の「だいじなもの」に靴と使い方が出る（持っていなければ行ごと出ない）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { GAME_URL, SAVE_KEY, waitForBoard, gotoFreshGame } from './helpers.js';
import { ITEM_META, ITEM_OWNED_FLAG, ownsItem } from '../shared/items.js';
import { SUB_ITEM_KEYS } from '../shared/progression.js';
import { SPRITES } from '../shared/sprites.js';

const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));

// dungeon_7 4,2 は敵も仕掛けも無い広間（行2は列1〜10が床・列11が壁／行4・5は左端が開いている）。
const ROOM = `${GAME_URL}?fromEditor=1&layer=dungeon_7&stage=4,2`;
const url = (row, col, extra = '') => `${ROOM}&row=${row}&col=${col}${extra}`;
const BOOTS = '&ps_swiftboots=1';

const onGrid = (v) => Number.isInteger(v * 2);

async function open(page, row, col, extra) {
  await page.goto(url(row, col, extra));
  await waitForBoard(page);
  // 実時間ループを止めて tick を手で進める（余分な tick が混ざらない）。
  await page.evaluate(() => window.__game.pause());
}

// n tick 進めて、各 tick 後の x を返す
async function stepXs(page, n) {
  return page.evaluate((n) => {
    const xs = [];
    for (let i = 0; i < n; i++) { window.__game.step(1); xs.push(window.__game.getPlayer().x); }
    return xs;
  }, n);
}

// セーブ（ROOM と同じ広間の 2,1）を「つづきから」で開き、Shift＋→ で 2 tick 進めた x を返す。
async function continueAndRun(page, extraPlayer) {
  const save = JSON.stringify({
    player: {
      x: 1, y: 2, hp: 6, maxHp: 6, maxHearts: 3, atk: 2, def: 0, keys: 0,
      weapon: null, shield: null, armor: null,
      subItems: {}, activeSubItem: null, rupees: 0, triforceCount: 0,
      ...extraPlayer,
    },
    stageState: {}, currentLayer: 'dungeon_7', stageKey: '4,2', heroDir: 'right',
  });
  await page.addInitScript(({ key, value }) => {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
  }, { key: SAVE_KEY, value: save });
  await page.goto(GAME_URL);
  await page.locator('#btn-continue').click();
  await waitForBoard(page);
  await page.evaluate(() => window.__game.pause());
  expect(await page.evaluate(() => window.__game.getPlayer().x)).toBe(1);
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  const xs = await stepXs(page, 2);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  return { xs, has: await page.evaluate(() => window.__game.getPlayer().hasSwiftBoots) };
}

test.describe('Blade of Lumia – 疾風の靴（Shift で走る）', () => {

  test('① 靴＋Shift で 1 tick に 1マス進み、位置は毎 tick 半マス格子の上', async ({ page }) => {
    await open(page, 2, 1, BOOTS);
    expect(await page.evaluate(() => window.__game.getPlayer().x)).toBe(1);
    await page.keyboard.down('Shift');
    await page.keyboard.down('ArrowRight');
    const xs = await stepXs(page, 4);
    expect(xs, '1 tick ごとに 1マス').toEqual([2, 3, 4, 5]);
    expect(xs.every(onGrid)).toBe(true);
    expect(await page.evaluate(() => window.__game.getState().player.dashing)).toBe(true);
  });

  test('② 靴が無いと Shift を押しても普通の速さ／靴があっても Shift を離せば普通の速さ', async ({ page }) => {
    await open(page, 2, 1);
    await page.keyboard.down('Shift');
    await page.keyboard.down('ArrowRight');
    expect(await stepXs(page, 2), '靴なし＋Shift').toEqual([1.5, 2]);
    expect(await page.evaluate(() => window.__game.getState().player.dashing)).toBe(false);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('Shift');

    await open(page, 2, 1, BOOTS);
    await page.keyboard.down('ArrowRight');
    expect(await stepXs(page, 2), '靴あり・Shift なし').toEqual([1.5, 2]);
    // 走っている途中で Shift を離すと、次の tick から普通の速さに戻る
    await page.keyboard.down('Shift');
    expect(await stepXs(page, 1)).toEqual([3]);
    await page.keyboard.up('Shift');
    expect(await stepXs(page, 1)).toEqual([3.5]);
  });

  test('③ 走っても壁の手前で止まる（2歩目で壁を越えない）', async ({ page }) => {
    // 半セルずらした位置から走る＝奇数回目の半マスで壁に着く組み合わせも踏む
    await open(page, 2, 1, BOOTS);
    await page.keyboard.down('ArrowRight');
    expect(await stepXs(page, 1)).toEqual([1.5]);
    await page.keyboard.down('Shift');
    const xs = await stepXs(page, 12);
    expect(xs.every(onGrid), `格子から外れた: ${xs}`).toBe(true);
    // 列11が壁＝居られる右端は x=10
    expect(Math.max(...xs)).toBe(10);
    expect(xs.at(-1)).toBe(10);
  });

  test('④ 二周目（1.2 倍）でも走ると毎 tick ちょうど 1マス（掛け合わせない）', async ({ page }) => {
    await open(page, 2, 1, `${BOOTS}&ps_cleared=1`);
    await page.keyboard.down('Shift');
    await page.keyboard.down('ArrowRight');
    expect(await stepXs(page, 5)).toEqual([2, 3, 4, 5, 6]);
  });

  test('⑤ Shift を先に離してから文字キーを離しても歩き続けない／フォーカスが外れたら止まる', async ({ page }) => {
    await open(page, 2, 1, BOOTS);
    // Shift を押したまま D を押す＝keydown は 'D'。Shift を先に離すと keyup は 'd' で届く。
    await page.keyboard.down('Shift');
    await page.keyboard.down('KeyD');
    expect(await stepXs(page, 1)).toEqual([2]);
    await page.keyboard.up('Shift');
    await page.keyboard.up('KeyD');
    expect(await stepXs(page, 3), '指を離したのに歩き続けている').toEqual([2, 2, 2]);

    // 押したままフォーカスが外れた（keyup が届かない）→ 全部離したことにする
    await page.keyboard.down('Shift');
    await page.keyboard.down('ArrowRight');
    expect(await stepXs(page, 1)).toEqual([3]);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    expect(await stepXs(page, 2), 'フォーカスが外れても歩き続けている').toEqual([3, 3]);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('Shift');
  });

  test('⑥ 走っている間だけ #char-player に .dashing が付く', async ({ page }) => {
    await open(page, 2, 1, BOOTS);
    const cls = () => page.evaluate(() => document.getElementById('char-player')?.classList.contains('dashing'));
    await page.keyboard.down('ArrowRight');
    await stepXs(page, 1);
    expect(await cls(), '普通に歩いている').toBe(false);
    await page.keyboard.down('Shift');
    await stepXs(page, 1);
    expect(await cls(), '走っている').toBe(true);
    const dur = await page.evaluate(() => getComputedStyle(document.getElementById('char-player')).transitionDuration);
    expect(dur).toContain('0.12s');
    await page.keyboard.up('Shift');
    await stepXs(page, 1);
    expect(await cls(), 'Shift を離した').toBe(false);
  });

  test('⑦ 画面の端を走って越えても、着いた先の位置は半マス格子の上', async ({ page }) => {
    // 行4の左端（列0）が開いている＝左へ走って隣の画面へ出る
    await open(page, 4, 2, BOOTS);
    const before = await page.evaluate(() => window.__game.getState().stageKey);
    await page.keyboard.down('Shift');
    await page.keyboard.down('ArrowLeft');
    await stepXs(page, 3);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('Shift');
    await page.waitForFunction((b) => window.__game.getState().stageKey !== b, before);
    // 遷移の演出が終わるまで待ってから位置を見る
    await page.waitForTimeout(600);
    const p = await page.evaluate(() => window.__game.getPlayer());
    expect(onGrid(p.x) && onGrid(p.y), `着地 ${p.x},${p.y}`).toBe(true);
  });

  test('⑧ 置き場所は field 15,19 の宝箱 (6,7) だけ・道具の定義と所持の判定', () => {
    const where = [];
    for (const [ln, ld] of Object.entries(MAP.layers)) {
      for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
        for (const [pos, ct] of Object.entries(sd.chestContents ?? {})) {
          if (ct?.item === 'swiftBoots') where.push(`${ln} ${sk} ${pos} ${ct.type}`);
        }
      }
    }
    expect(where).toEqual(['field 15,19 6,7 item']);

    const meta = ITEM_META.swiftBoots;
    expect(meta?.type, '持っているだけで効く道具＝サブアイテム欄に並べない').toBe('passive');
    expect(meta.grantable, '宝箱から渡せない').not.toBe(false);
    expect(Array.isArray(SPRITES[meta.sprite]?.[0]), `SPRITES['${meta.sprite}'] が無い`).toBe(true);
    // 進行の鍵にしない（隠し報酬の決まり）
    expect(SUB_ITEM_KEYS).not.toContain('swiftBoots');
    // 所持の判定は ownsItem の1本（フラグの置き場所は ITEM_OWNED_FLAG）
    expect(ITEM_OWNED_FLAG.swiftBoots).toBe('hasSwiftBoots');
    expect(ownsItem({ subItems: {}, hasSwiftBoots: true }, 'swiftBoots')).toBe(true);
    expect(ownsItem({ subItems: {}, hasSwiftBoots: false }, 'swiftBoots')).toBe(false);
  });

  test('⑨ 実プレイ：15,19 の宝箱で靴が手に入り、Shift の使い方が読めて、その場から走れて、セーブに残る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const q = new URLSearchParams({
      fromEditor: '1', layer: 'field', stage: '15,19', row: '4', col: '7',
      ps_weapon: '1', ps_bomb: '1', ps_flute: '1',
    });
    await page.goto(`${GAME_URL}?${q}`);
    await waitForBoard(page);
    const walk = (d, tiles) => page.evaluate(({ d, n }) => {
      for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
    }, { d, n: tiles });
    const use = (id, ticks) => page.evaluate(({ id, n }) => {
      window.__game.getPlayer().activeSubItem = id;
      window.__game.useSubItem();
      for (let i = 0; i < n; i++) window.__game.step(1);
    }, { id, n: ticks });

    expect(await page.evaluate(() => window.__game.getState().player.hasSwiftBoots)).toBe(false);
    // 爆弾で壁 (5,7) を壊し、笛で宝箱の封印を解く（field-delta-o-lower.spec.js ⑨ と同じ手順）
    await walk('down', 2);
    await use('bomb', 40);
    await use('flute', 10);
    await walk('down', 2);
    const got = await page.evaluate(() => {
      const p = window.__game.getPlayer();
      return {
        r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5),
        has: p.hasSwiftBoots, slots: Object.keys(p.subItems),
        opened: [...window.__game.getStageState().openedChests],
        msg: document.getElementById('msg-bar').textContent,
      };
    });
    expect({ r: got.r, c: got.c }, '宝箱のセルに立てていない').toEqual({ r: 6, c: 7 });
    expect(got.opened).toContain('6,7');
    expect(got.has, '宝箱を開けても靴を持っていない').toBe(true);
    expect(got.slots, '靴がサブアイテム欄に入った').not.toContain('swiftBoots');
    expect(got.msg).toContain('疾風の靴');
    expect(got.msg, '使い方（Shift）が文に無い').toContain('Shift');

    // 2 秒（従来の既定）を過ぎても使い方の文が消えていない＝読み切れる長さで出す
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => {
      const el = document.getElementById('msg-bar');
      return !el.classList.contains('hidden') && el.textContent.includes('Shift');
    }), '2.5 秒で使い方の文が消えた').toBe(true);

    // その場から走れる（壊した壁 (5,7) を通って北へ）
    await page.evaluate(() => window.__game.pause());
    await page.keyboard.down('Shift');
    await page.keyboard.down('ArrowUp');
    const ys = await page.evaluate(() => {
      const out = [];
      for (let i = 0; i < 2; i++) { window.__game.step(1); out.push(window.__game.getPlayer().y); }
      return out;
    });
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('Shift');
    expect(ys, '靴を手に入れたのに走れない').toEqual([5, 4]);

    // 宝箱を開けた時点でセーブに書かれている
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.player?.hasSwiftBoots, SAVE_KEY);
    expect(saved, 'セーブに靴が残っていない').toBe(true);
    expect(errors).toEqual([]);
  });

  test('⑩ ロード：靴を持ったセーブは走れる', async ({ page }) => {
    const r = await continueAndRun(page, { hasSwiftBoots: true });
    expect(r.has).toBe(true);
    expect(r.xs, '靴のセーブをロードしたのに走れない').toEqual([2, 3]);
  });

  test('⑩-2 ロード：靴の項目が無い旧セーブは走れない（既定 false で補う）', async ({ page }) => {
    const r = await continueAndRun(page, {});
    expect(r.has).toBe(false);
    expect(r.xs).toEqual([1.5, 2]);
  });

  test('⑪ ポーズ画面の「だいじなもの」に靴と使い方が出る（持っていなければ行ごと出ない）', async ({ page }) => {
    await gotoFreshGame(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.getState().isPaused === true, null, { timeout: 3000 });
    expect(await page.locator('#pause-key-items').count(), '何も持っていないのに行が出た').toBe(0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.getState().isPaused === false, null, { timeout: 3000 });

    await page.evaluate(() => window.__game.grantReward({ type: 'item', item: 'swiftBoots', name: '疾風の靴' }));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.getState().isPaused === true, null, { timeout: 3000 });
    const row = page.locator('#pause-key-items');
    await expect(row).toContainText('疾風の靴');
    await expect(row).toContainText('Shift');
    expect(await row.locator('canvas').count(), '靴の絵が出ていない').toBe(1);
  });
});
