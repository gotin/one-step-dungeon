// tests/weakness-recover-window.spec.js
//   Phase 8-4 (4) 0d-2.11 (A)（2026-08-27）＝**「間」を弱点にした**ことの番人。
//
// G 岩のゴーレムの弱点は爆弾（`weakness: { type:'bomb' }`）だった＝爆弾は D6 の報酬で
// D1 のボスには永久に持って来られない∴弱点が死んでいた。道具の代わりに
// `weakness: { type:'sword', window:'recover', multiplier:3 }` ＝
// **攻撃硬直（`attackFreezeMs`）の窓に斬ったときだけ×3** にした。
//
// この本が守るもの2つ：
//   ① 窓の中だけ倍率が乗る（外は等倍）＝「いつ斬るか」が意味を持つ
//   ② 判定（combat.js）と絵（enemy-ai.js の `.attack-recover`）が**同じ関数**を読む
//      ＝「沈んで見えるのに乗らない／見えないのに乗る」を構造的に防ぐ
//      （敵のガードで判定距離と到達距離がズレて歯の無いテストを書いた前例と同じ轍）。
//
// ⚠️ 窓は実機で立てる（`_freezeUntil` をテストから書かない）＝注入した G を隣に置いて
//    実際に殴らせ、スナップショットの `freezeUntil` / `swingAt` で窓を読む。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { GAME_URL, SAVE_KEY } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';

const GOLEM = TILE.ROCK_GOLEM;

async function seedAndStart(page) {
  const saveData = JSON.stringify({
    player: {
      x: 2, y: 5,
      hp: 12, maxHp: 12, maxHearts: 6,
      atk: 2, def: 0, keys: 0,
      weapon: 'sword', shield: null, armor: null,
      subItems: {}, activeSubItem: null,
      rupees: 0, triforceCount: 0,
    },
    stageState: {},
    currentLayer: 'field',
    stageKey: '7,14',
    heroDir: 'right',
  });
  await page.addInitScript(({ key, value }) => {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
  }, { key: SAVE_KEY, value: saveData });
  await page.goto(GAME_URL);
  await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#btn-continue').click();
  await page.waitForFunction(() => {
    const b = document.getElementById('board');
    return !!b && b.children.length > 0;
  });
  // 実ループの余分な tick が混ざると窓を跨いでしまう∴手で刻む。
  await page.evaluate(() => window.__game.pause());
}

/**
 * 注入した G を隣に置いて実際に殴らせ、**硬直の窓の中**で1発与えて減った HP を返す。
 * 窓に入れなかった場合は理由つきで throw する（黙って等倍を返さない＝歯を残す）。
 */
async function hpLossInRecoverWindow(page, atkType, dmg) {
  return page.evaluate(({ type, atkType, dmg }) => {
    const HP = 400;
    // プレイヤーの隣（東）に置く＝G の近接 range 1.2 の内側。speed 0 で動かない。
    const p = window.__game.getState().player;
    const id = window.__game.injectEnemy(p.x + 1, p.y, HP, 2, 2, type);
    const snap = () => window.__game.getEnemies().find((x) => x.id === id);
    const trace = [];
    for (let i = 0; i < 40; i++) {
      window.__game.step(1);
      const e = snap();
      const now = window.__game.getState().gameTime;
      trace.push(`t${i} swingAt=${e.swingAt} freezeUntil=${e.freezeUntil} now=${now}`);
      // 硬直の窓＝予告が終わっていて（swingAt が下りている）freezeUntil が未来
      const inWindow = e.swingAt == null && e.slamAt == null && e.breathAt == null
        && e.freezeUntil != null && now < e.freezeUntil;
      if (!inWindow) continue;
      const before = snap().hp;
      window.__game.dealDamage(id, dmg, atkType);
      return { loss: before - snap().hp, ticks: i, trace };
    }
    throw new Error(`硬直の窓に入れなかった:\n${trace.join('\n')}`);
  }, { type: GOLEM, atkType, dmg });
}

/** 窓の外（注入直後＝まだ一度も攻撃していない）で1発与えて減った HP を返す */
async function hpLossOutsideWindow(page, atkType, dmg) {
  return page.evaluate(({ type, atkType, dmg }) => {
    const HP = 400;
    const p = window.__game.getState().player;
    // プレイヤーから遠くへ置く＝攻撃が始まらない∴硬直も立たない。
    const id = window.__game.injectEnemy(p.x + 6, p.y + 4, HP, 2, 2, type);
    const snap = () => window.__game.getEnemies().find((x) => x.id === id);
    const e0 = snap();
    if (e0.freezeUntil != null) throw new Error(`注入直後に硬直が立っている: ${e0.freezeUntil}`);
    window.__game.dealDamage(id, dmg, atkType);
    return { loss: HP - snap().hp };
  }, { type: GOLEM, atkType, dmg });
}

test.describe('Blade of Lumia – 硬直の窓が弱点（G 岩のゴーレム・0d-2.11 (A)）', () => {
  test('０ データ側：G の弱点は「剣 × 硬直の窓」', () => {
    const w = ENEMY_META[GOLEM].weakness;
    expect(w, 'G に弱点が無い').toBeTruthy();
    expect(w.type, 'D1 では剣以外を撃てない（サブ道具が世界に無い）').toBe('sword');
    expect(w.window, '窓の指定が無い＝いつ斬っても倍率が乗る').toBe('recover');
    expect(w.multiplier).toBeGreaterThan(1);
    // 窓そのものが無ければ弱点は永久に乗らない
    expect(ENEMY_META[GOLEM].attackFreezeMs, '硬直が無い＝窓が開かない').toBeGreaterThan(0);
  });

  test('① 硬直の窓の中で斬ると弱点倍率が乗る', async ({ page }) => {
    await seedAndStart(page);
    const mult = ENEMY_META[GOLEM].weakness.multiplier;
    const { loss } = await hpLossInRecoverWindow(page, 'sword', 10);
    expect(loss, `硬直中の剣が ${mult} 倍になっていない`).toBe(10 * mult);
  });

  test('② 窓の外で斬ると等倍（＝「いつ斬るか」が意味を持つ）', async ({ page }) => {
    await seedAndStart(page);
    const { loss } = await hpLossOutsideWindow(page, 'sword', 10);
    expect(loss, '窓の外でも倍率が乗っている＝窓が効いていない').toBe(10);
  });

  test('③ 窓の中でも別の攻撃種別は等倍（弱点は剣に限る）', async ({ page }) => {
    await seedAndStart(page);
    const { loss } = await hpLossInRecoverWindow(page, 'bomb', 10);
    expect(loss, '剣以外にも倍率が乗っている').toBe(10);
  });

  test('④ 判定と絵は同じ関数（isInRecoverWindow）を読んでいる', () => {
    const combat  = readFileSync(new URL('../game/combat.js',    import.meta.url), 'utf8');
    const ai      = readFileSync(new URL('../game/enemy-ai.js',  import.meta.url), 'utf8');
    const shared  = readFileSync(new URL('../game/enemy-state.js', import.meta.url), 'utf8');
    expect(shared).toMatch(/export function isInRecoverWindow/);
    for (const [name, src] of [['combat.js', combat], ['enemy-ai.js', ai]]) {
      expect(src, `${name} が enemy-state.js を読み込んでいない`).toMatch(/from '\.\/enemy-state\.js'/);
      expect(src, `${name} が isInRecoverWindow を呼んでいない＝窓が二重定義`).toMatch(/isInRecoverWindow\(/);
    }
  });
});
