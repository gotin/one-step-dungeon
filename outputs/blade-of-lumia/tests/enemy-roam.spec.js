// tests/enemy-roam.spec.js — キュー60「雑魚の移動に『さまよう』を足し、追いかける敵と分ける」
//
// きっかけ＝プレイメモ field 5,12（2026-10-13）「ほとんどの敵がプレーヤーに向かって移動する。
// 雑魚の多くにはさまよう動作があったほうがよさそう。ただし追いかける前提の場面もあるので
// 追いかけ専用の敵も必要」。✅ ユーザー決定（2026-10-14）＝チェイサー C を追いかけ専用にし、
// 素の追いかけだった他の雑魚 15 種を「さまよい→近づくと追う」にする（`ENEMY_META.roam`）。
//
// この本が固定すること：
//   ① データ＝roam を持つのは決定どおりの 15 種。C・ボス・別の歩き方の敵には無い。
//   ② 遠い E は家の周りを歩く（動く・範囲の外へ出ない・寄って来ない・向きは歩く向き）。
//   ③ 近い E（notice 以内）は気づいて追う。
//   ④ 気づいた後は lose を超えるまで追い続け、超えたらさまよいに戻る。
//   ⑤ 遠くから攻撃を受けると気づいて寄って来る。
//   ⑥ 対照：遠い C は今までどおり寄って来る（追いかけ専用）。
//
// 盤面＝検証ステージのバランス行（敵は (r4,c8) の1体・遮蔽なし）。プレビューは debug ON
// （無敵）のまま＝HP は測らない。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ENEMY_META, ROAM_DEFAULT } from '../shared/enemies.js';
import { startsAlert } from '../shared/enemy-alert.js';
import { TILE } from '../shared/tiles.js';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';
const url = (stage, row, col) => `${GAME}?${new URLSearchParams({
  fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage), row: String(row), col: String(col), ps_weapon: '1',
})}`;

async function gotoFrozen(page, stage, row, col) {
  await freezeGameLoop(page);
  await page.goto(url(stage, row, col));
  await waitForBoard(page);
}

// n tick 進めて敵（1体目）の軌跡を返す。place が与えられれば毎 tick プレイヤーをそこへ置き直す。
async function trace(page, n, place = null) {
  return page.evaluate(({ n, place }) => {
    const g = window.__game, p = g.getPlayer();
    g.pause();
    const out = [];
    for (let i = 0; i < n; i++) {
      if (place) { p.x = place.c; p.y = place.r; }
      g.step(1);
      const e = g.getEnemies()[0];
      out.push({ x: e.x, y: e.y, dir: e.dir, noticed: e.noticed, home: e.home, d: Math.hypot(p.x - e.x, p.y - e.y) });
    }
    return out;
  }, { n, place });
}

const ROAM_TILES = [
  TILE.PATROL, TILE.SENTRY, TILE.SKELETON, TILE.BURROW_WORM, TILE.LEAP_SPIDER, TILE.SHIELD_KNIGHT,
  TILE.FIRE_TURTLE, TILE.SPLIT_SLIME, TILE.RUPEE_EATER, TILE.CURSE_FIRE, TILE.POISON_LEECH,
  TILE.CHARGE_BOAR, TILE.FISH_SCHOOL, TILE.LURK_SHARK, TILE.ARCHER_FISH,
];

test.describe('キュー60 – 雑魚のさまよい', () => {

  test('① データ：roam は決定どおりの15種だけ（C・ボス・別の歩き方には無い）', () => {
    const have = Object.entries(ENEMY_META).filter(([, m]) => m.roam).map(([t]) => t).sort();
    expect(have).toEqual([...ROAM_TILES].sort());
    expect(ENEMY_META[TILE.CHASER].roam, 'チェイサー C は追いかけ専用＝roam を持たない').toBeUndefined();
    const BRANCH = ['hitAndAway', 'combat', 'laneStalk', 'burrowAmbush', 'coil', 'gaze', 'soar', 'momentum', 'tongue', 'surge', 'glaciate', 'zigzag'];
    for (const t of have) {
      const m = ENEMY_META[t];
      expect(m.isBoss, `${t}：ボスにさまよいは付けない`).toBe(false);
      expect(BRANCH.filter(k => m[k]), `${t}：別の歩き方を持つ敵は enemyRoam に届かない`).toEqual([]);
      expect(m.speed, `${t}：速さ 0 の敵はさまよえない`).toBeGreaterThan(0);
    }
    expect(ROAM_DEFAULT.lose).toBeGreaterThan(ROAM_DEFAULT.notice);
  });

  test('② 遠い E は家の周りを歩き、寄って来ない（向きは歩く向き）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, 'bal_patrol', 8, 1);   // 敵 (4,8) から約 8 セル
    const tr = await trace(page, 240);
    const home = tr[0].home;
    expect(home).toEqual({ r: 4, c: 8 });
    for (const s of tr) {
      expect(s.noticed, '遠いのに気づいた').toBe(false);
      expect(Math.abs(s.x - home.c), `家から横に ${ROAM_DEFAULT.radius} マスを超えた`).toBeLessThanOrEqual(ROAM_DEFAULT.radius);
      expect(Math.abs(s.y - home.r), `家から縦に ${ROAM_DEFAULT.radius} マスを超えた`).toBeLessThanOrEqual(ROAM_DEFAULT.radius);
      expect(s.d, '寄って来た（気づく距離に入った）').toBeGreaterThan(ROAM_DEFAULT.notice);
    }
    const cells = new Set(tr.map(s => `${s.x},${s.y}`));
    expect(cells.size, '240 tick で一度も歩いていない（さまよっていない）').toBeGreaterThan(3);
    for (let i = 1; i < tr.length; i++) {
      const dx = tr[i].x - tr[i - 1].x, dy = tr[i].y - tr[i - 1].y;
      if (!dx && !dy) continue;
      const want = dy ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
      expect(tr[i].dir, `tick${i}：歩く向きを向いていない`).toBe(want);
    }
    expect(errors).toEqual([]);
  });

  test('③ 近い E は気づいて追う', async ({ page }) => {
    await gotoFrozen(page, 'bal_patrol', 4, 5);   // 敵 (4,8) から 3 セル
    const tr = await trace(page, 40, { r: 4, c: 5 });
    expect(tr[0].noticed).toBe(true);
    expect(Math.min(...tr.map(s => s.d)), '気づいたのに寄って来ない').toBeLessThanOrEqual(1.01);
  });

  test('④ 気づいた後は lose まで追い続け、超えるとさまよいに戻る', async ({ page }) => {
    await gotoFrozen(page, 'bal_patrol', 4, 5);
    const a = await trace(page, 2, { r: 4, c: 5 });
    expect(a.at(-1).noticed).toBe(true);
    // notice と lose の間（5 セル前後）に離れ続ける＝毎 tick プレイヤーを敵の5セル西へ置き直す
    const b = await page.evaluate(() => {
      const g = window.__game, p = g.getPlayer();
      const out = [];
      for (let i = 0; i < 30; i++) {
        const e0 = g.getEnemies()[0];
        p.x = Math.max(1, e0.x - 5); p.y = e0.y;
        g.step(1);
        out.push(g.getEnemies()[0].noticed);
      }
      return out;
    });
    expect(b.every(v => v === true), 'notice と lose の間で見失った（幅が効いていない）').toBe(true);
    // 十分遠い（lose 超え）＝敵のいる側と反対の端の通路（行8 は東西に開いている）
    const ex = await page.evaluate(() => window.__game.getEnemies()[0].x);
    const c = await trace(page, 3, { r: 8, c: ex > 5.5 ? 0 : 11 });
    expect(c.at(-1).noticed, 'lose を超えても追い続けている').toBe(false);
  });

  test('⑤ 遠くから攻撃を受けると気づいて寄って来る', async ({ page }) => {
    await gotoFrozen(page, 'bal_patrol', 8, 1);
    const before = await trace(page, 2);
    expect(before.at(-1).noticed).toBe(false);
    await page.evaluate(() => {
      const g = window.__game, e = g.getEnemies()[0];
      g.dealDamage(e.id, 1);
    });
    const tr = await trace(page, 20, { r: 8, c: 1 });
    expect(tr[0].noticed, '攻撃を受けたのに気づかない').toBe(true);
    expect(tr.at(-1).d, '気づいたのに寄って来ない').toBeLessThan(before.at(-1).d - 1);
  });

  test('⑥ 対照：遠い C（追いかけ専用）は寄って来る', async ({ page }) => {
    await gotoFrozen(page, 'bal_chaser', 8, 1);
    const tr = await trace(page, 40, { r: 8, c: 1 });
    expect(tr.every(s => s.noticed == null), 'C にさまよいの状態が立った').toBe(true);
    expect(tr.at(-1).d, '遠い C が寄って来ない').toBeLessThan(tr[0].d - 3);
  });
});

// ── マップで「追う」を指定する（部屋まるごと enemiesAlert ／配置ごと enemyChase）──────
// ✅ ユーザー承認（2026-10-14）＝優先は 部屋 ＞ 配置 ＞ 種類の既定。指定は「追う」の向きだけ。
test.describe('キュー60 – マップの「追う」指定', () => {

  test('⑦ 判定：部屋 ＞ 配置 ＞ 種類の既定（C は指定が無くても追う）', () => {
    const E = TILE.PATROL, C = TILE.CHASER;
    expect(startsAlert({}, '4,8', E), '指定なしの E はさまよう').toBe(false);
    expect(startsAlert({ enemyChase: { '4,8': true } }, '4,8', E), '配置の指定で追う').toBe(true);
    expect(startsAlert({ enemyChase: { '4,7': true } }, '4,8', E), '別のセルの指定は効かない').toBe(false);
    expect(startsAlert({ enemiesAlert: true }, '4,8', E), '部屋まるごとで追う').toBe(true);
    expect(startsAlert({ enemiesAlert: true, enemyChase: {} }, '4,8', E), '部屋が配置より優先').toBe(true);
    expect(startsAlert({}, '4,8', C), 'C はもともと追う').toBe(true);
  });

  test('⑧ データ：さまよいで崩れた9部屋は部屋まるごと「追う」', () => {
    const map = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
    for (const [lk, sk] of [['dungeon_1', '2,0'], ['dungeon_2', '2,0'], ['dungeon_5', '2,3'],
      ['dungeon_5', '0,1'], ['dungeon_5', '3,0'], ['dungeon_7', '3,4'],
      ['dungeon_5', '3,1'], ['dungeon_5', '3,2'], ['dungeon_7', '4,2']]) {
      expect(map.layers[lk].stages[sk].enemiesAlert, `${lk} ${sk}`).toBe(true);
    }
  });

  // 検証ステージのバランス行（E は (4,8)）のデータだけ差し替えて読ませる。
  async function gotoWithStage(page, patch) {
    await page.route('**/work/blade-of-lumia.json', async (route) => {
      const json = await (await route.fetch()).json();
      Object.assign(json.layers[TEST_LAYER].stages[stageKey('bal_patrol')], patch);
      await route.fulfill({ json });
    });
    await gotoFrozen(page, 'bal_patrol', 8, 1);
  }

  test('⑨ 配置ごとの「追う」：遠い E が最初から寄って来る', async ({ page }) => {
    await gotoWithStage(page, { enemyChase: { '4,8': true } });
    const tr = await trace(page, 40, { r: 8, c: 1 });
    expect(tr[0].noticed, '指定したのに気づいていない').toBe(true);
    expect(tr.at(-1).d, '指定したのに寄って来ない').toBeLessThan(tr[0].d - 3);
  });

  // field 5,12（プレイメモの画面）＝C×2（追いかけ専用＝一覧に出ない）＋ F (4,7)（さまよう）。
  test('⑪ エディタ：一覧はさまよう敵だけ・配置のチェックで保存・部屋をオンにすると灰色で押せない', async ({ page }) => {
    const map = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
    await page.goto('/blade-of-lumia/editor/');
    await page.evaluate((json) => localStorage.setItem('bladeOfLumiaMapData', json), JSON.stringify(map));
    await page.reload();
    await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
    await page.locator('#world-grid .world-cell')
      .filter({ has: page.locator('.cell-coord', { hasText: '(5,12)' }) }).first().click();
    await page.locator('#btn-edit-stage').click();

    const items = page.locator('#enemy-chase-list input[type=checkbox]');
    await expect(items).toHaveCount(1);
    const f = page.locator('#enemy-chase-list input[data-key="4,7"]');
    await expect(f).not.toBeChecked();
    await expect(f).toBeEnabled();

    await f.check();
    const room = page.locator('#stage-enemies-alert');
    await room.check();
    await expect(f, '部屋がオンなのに配置のチェックが押せる').toBeDisabled();
    await expect(f).toBeChecked();

    await page.locator('#btn-save').click();
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('bladeOfLumiaMapData')));
    const sd = saved.layers.field.stages['5,12'];
    expect(sd.enemiesAlert).toBe(true);
    expect(sd.enemyChase).toEqual({ '4,7': true });

    await room.uncheck();
    await expect(f, '部屋をオフに戻したら配置のチェックが戻らない').toBeEnabled();
    await f.uncheck();
    await page.locator('#btn-save').click();
    const saved2 = JSON.parse(await page.evaluate(() => localStorage.getItem('bladeOfLumiaMapData')));
    expect(saved2.layers.field.stages['5,12'].enemiesAlert).toBeUndefined();
    expect(saved2.layers.field.stages['5,12'].enemyChase).toBeUndefined();
  });

  test('⑩ 部屋まるごと「追う」：遠い E が最初から寄って来る', async ({ page }) => {
    await gotoWithStage(page, { enemiesAlert: true });
    const tr = await trace(page, 40, { r: 8, c: 1 });
    expect(tr[0].noticed, '部屋をオンにしたのに気づいていない').toBe(true);
    expect(tr.at(-1).d, '部屋をオンにしたのに寄って来ない').toBeLessThan(tr[0].d - 3);
  });
});
