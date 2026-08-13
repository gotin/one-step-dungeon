// 境界を跨ぐ鍵扉の回帰テスト
// （2026-08-06 ユーザー報告「dungeon_6 でパズルをクリアして鍵をとって左のステージに
//  移動したらドアの上に埋まった状態になって動けなくなった」の再発防止）。
//
// 何が起きていたか：
//   1枚の扉を鍵部屋側と着地側の**両面**に D で描いていた。エンジンの扉は部屋単位
//   （ss.openedDoors／player.js collectDoorRun は部屋内の連結成分だけ）∴手前を鍵1個で
//   開けて隣室へ抜けると、隣室側の D は閉じたまま残り、その**閉じた扉セルの中に着地**する
//   （game.js arrivalTileBlocked が 'D' を常に着地可としていた）。半セル移動＋
//   floor(v+0.5) のタイル解決では4方向すべての次の半歩が同じ扉セルに解決される＝一切動けない。
//   鍵は消費済みなので自力では開けられず、セーブにも残る恒久詰みだった。
//
// 直しは2点セット＝このスペックも2点を別々に固定する：
//   ① データ：境界扉は鍵を持って来る側の1面だけ。着地側は ';'（常時開放の境界通路）。
//      → テスト①（全レイヤー静的検査）
//   ② エンジン：閉じた 'D' への着地は拒否する（＝鍵が足りなければ遷移そのものが起きない）。
//      → テスト③（dark_tower 1,3 → 1,2 の閉じた扉に鍵0で突撃）
//   そして実際に鍵1個で抜けられて埋まらないこと＝テスト②。
//
// ⚠️ debugMode（fromEditor=1）では鍵扉が素通りになる∴セーブ注入＋「つづきから」で
//    本編と同じ経路で起動する（プレビュー URL では扉のテストにならない）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';

const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));

const tileAt = (stage, r, c) => (Array.isArray(stage?.tiles?.[r]) ? stage.tiles[r][c] : undefined);

test.describe('境界を跨ぐ鍵扉 ① データ：両面 D を作らない', () => {
  test('境界上の D の対向セルは D ではない（全レイヤー）', () => {
    const offenders = [];
    for (const [layerName, layer] of Object.entries(MAP.layers ?? {})) {
      const stages = layer.stages ?? {};
      for (const [stageKey, stage] of Object.entries(stages)) {
        if (!Array.isArray(stage.tiles)) continue;
        const rows = stage.tiles.length;
        const cols = stage.tiles[0].length;
        const [sx, sy] = stageKey.split(',').map(Number);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (tileAt(stage, r, c) !== 'D') continue;
            const mirrors = [];
            if (r === 0)        mirrors.push([`${sx},${sy - 1}`, rows - 1, c]);
            if (r === rows - 1) mirrors.push([`${sx},${sy + 1}`, 0, c]);
            if (c === 0)        mirrors.push([`${sx - 1},${sy}`, r, cols - 1]);
            if (c === cols - 1) mirrors.push([`${sx + 1},${sy}`, r, 0]);
            for (const [mk, mr, mc] of mirrors) {
              if (tileAt(stages[mk], mr, mc) === 'D') {
                offenders.push(`${layerName} [${stageKey}](${r},${c}) ↔ [${mk}](${mr},${mc})`);
              }
            }
          }
        }
      }
    }
    expect(offenders, '両面 D の境界扉は抜けた先で埋まる（着地側を ";" にする）').toEqual([]);
  });
});

// ── 実エンジン ─────────────────────────────────────────────────
async function boot(page, { layer, stageKey, x, y, keys, heroDir }) {
  const save = {
    player: {
      x, y, hp: 99, maxHp: 99, maxHearts: 20, atk: 99, def: 99, keys,
      weapon: 'sword', shield: null, armor: null, subItems: {}, activeSubItem: null,
      rupees: 0, triforceCount: 0,
    },
    stageState: {}, currentLayer: layer, stageKey, heroDir,
  };
  await page.goto(GAME_URL);
  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: SAVE_KEY, v: JSON.stringify(save) });
  await page.reload();
  await page.locator('#btn-continue').waitFor({ state: 'visible' });
  await page.locator('#btn-continue').click();
  await waitForBoard(page);
}

const snap = (page) => page.evaluate(() => {
  const s = window.__game.getState();
  return {
    x: s.player.x, y: s.player.y, room: s.stageKey, layer: s.currentLayer,
    keys: s.player.keys, openedDoors: window.__game.getStageState().openedDoors ?? [],
  };
});

// 遷移は setTimeout(100ms) を挟む∴入力の合間は実時間で待つ（step だけでは進まない）。
async function walk(page, dir, n) {
  for (let i = 0; i < n; i++) {
    await page.evaluate((d) => { window.__game.setHeroDir(d); window.__game.movePlayer(d); }, dir);
    await page.waitForTimeout(80);
  }
}

test.describe('境界を跨ぐ鍵扉 ② 鍵1個で抜けられて、抜けた先で動ける', () => {
  test('dungeon_6 鍵部屋[1,0] → ボス部屋[0,0]：鍵1個・着地後に動ける', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 鍵部屋の扉(4,0)(5,0)と同じ行、少し東に立って西へ歩く。
    await boot(page, { layer: 'dungeon_6', stageKey: '1,0', x: 2, y: 4, keys: 1, heroDir: 'left' });

    await walk(page, 'left', 4);       // 扉に当たって開錠（鍵1個消費）
    const atDoor = await snap(page);
    expect(atDoor.room, 'まだ鍵部屋に居る').toBe('1,0');
    expect(atDoor.openedDoors, '手前の扉が開いていない').toContain('4,0');
    expect(atDoor.keys, '鍵の消費は1個').toBe(0);

    await walk(page, 'left', 4);       // 開いた扉を通って西へ抜ける
    const arrived = await snap(page);
    expect(arrived.room, 'ボス部屋へ遷移していない').toBe('0,0');

    // 埋まっていない＝西へ歩けば境界セル(col11)から内側へ動ける。
    const before = arrived.x;
    await walk(page, 'left', 4);
    const after = await snap(page);
    expect(after.room, '着地直後に別の部屋へ飛んだ').toBe('0,0');
    expect(after.x, `着地セル(x=${before})から動けない＝扉に埋まっている`).toBeLessThan(before);
    expect(errors).toEqual([]);
  });
});

test.describe('境界を跨ぐ鍵扉 ③ 鍵が無ければ遷移そのものが拒否される', () => {
  test('dark_tower [1,3] → 閉じた扉のある [1,2]：鍵0では遷移しない（埋まらない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // [1,2] の南辺(9,5)(9,6)が鍵扉。その真下＝[1,3] の(1,5)から北へ突撃する。
    await boot(page, { layer: 'dark_tower', stageKey: '1,3', x: 5, y: 1, keys: 0, heroDir: 'up' });

    await walk(page, 'up', 6);
    const st = await snap(page);
    expect(st.room, '閉じた鍵扉へ着地してしまった（鍵0なのに遷移した）').toBe('1,3');
    expect(st.y, '境界セルまでは寄れる').toBe(0);

    // 押し戻されただけ＝そこから南へ普通に戻れる（埋まっていない）。
    await walk(page, 'down', 4);
    const back = await snap(page);
    expect(back.room).toBe('1,3');
    expect(back.y, '境界セルから動けない＝埋まっている').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
