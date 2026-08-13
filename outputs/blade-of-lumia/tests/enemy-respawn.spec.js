// tests/enemy-respawn.spec.js – 雑魚リスポーン（Phase 9-5b）
//
// フィールドの雑魚（E/C/F）は撃破後、RESPAWN_MOVES(=8) 回のステージ移動が
// 経過してから再入すると復活する。ボス・中ボスは復活しない。
//
// ⚠️ injectEnemy は id が "test-xxx-yyy" 形式 → posKey parse が NaN → リスポーン対象外。
//    このテストでは実マップの雑魚（id="r,c"）を dealDamage で倒す。
//    field/7,13 の E 敵（r=1,c=2 → id="1,2"）を使用。

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

const TARGET_LAYER      = 'field';
const STAGE_WITH_ENEMY  = '7,13';  // E(1,2), E(7,6), C(8,10) を持つフィールド画面
const OTHER_STAGE       = '7,14';  // 村（敵なし）

function makeSave(overrides = {}) {
  const player = {
    x: 5, y: 5,
    hp: 6, maxHp: 6, maxHearts: 3,
    atk: 20, def: 0, keys: 0,
    weapon: 'sword', shield: null, armor: null,
    subItems: {},
    activeSubItem: null,
    rupees: 0, triforceCount: 0,
    maxArrows: 8, maxBombs: 8,
    stageMoves: 0,
    hasWingRobe: false, flying: false, hasLadder: false,
    defeatedBosses: [],
    swordTier: 0, armorTier: -1, shieldTier: -1,
    gachaPulls: {},
    ...overrides,
  };
  return JSON.stringify({
    player,
    stageState: {},
    currentLayer: TARGET_LAYER,
    stageKey: OTHER_STAGE,
    heroDir: 'down',
  });
}

async function boot(page, saveData) {
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
}

// field/7,13 に入り、最初の雑魚を倒して倒した敵の id を返す。
// 戻り値: { killedId, movesAfterKill }
async function killFirstEnemyInStage(page, layer, stage, other) {
  return await page.evaluate(async ({ layer, stage, other }) => {
    window.__game.enterStage(layer, stage, 1, 1);
    const enemies = window.__game.getEnemies();
    if (!enemies.length) return null;
    const target = enemies[0];
    window.__game.dealDamage(target.id, 999, 'sword');
    return { killedId: target.id, movesAfterKill: window.__game.getStageMoves() };
  }, { layer, stage, other });
}

test.describe('Phase 9-5b – 雑魚リスポーン', () => {

  test('stageMoves はステージ移動のたびに増加する', async ({ page }) => {
    await boot(page, makeSave());
    const result = await page.evaluate(async ({ layer, stage, other }) => {
      const before = window.__game.getStageMoves();
      window.__game.enterStage(layer, stage, 1, 1);
      const after1 = window.__game.getStageMoves();
      window.__game.enterStage(layer, other, 1, 1);
      const after2 = window.__game.getStageMoves();
      window.__game.enterStage(layer, stage, 1, 1);
      const after3 = window.__game.getStageMoves();
      return { before, after1, after2, after3 };
    }, { layer: TARGET_LAYER, stage: STAGE_WITH_ENEMY, other: OTHER_STAGE });
    expect(result.before).toBe(0);
    expect(result.after1).toBe(1);
    expect(result.after2).toBe(2);
    expect(result.after3).toBe(3);
  });

  test('雑魚撃破後すぐ（7 移動）では復活しない', async ({ page }) => {
    // move sequence: STAGE(kill, lkm=1) → OTHER → STAGE → OTHER → STAGE → OTHER → STAGE → OTHER → STAGE
    // stageMoves:      1                   2        3        4        5        6        7        8        9 ← not reached yet
    // Re-enter STAGE at stageMoves=7 (diff=7-1=6 < 8) → no respawn
    await boot(page, makeSave());
    const result = await page.evaluate(async ({ layer, stage, other }) => {
      window.__game.enterStage(layer, stage, 1, 1);  // stageMoves=1
      const enemies = window.__game.getEnemies();
      if (!enemies.length) return null;
      window.__game.dealDamage(enemies[0].id, 999, 'sword');  // lastKillMove=1
      // 3 pairs OTHER→STAGE (6 transitions → stageMoves=7 on last STAGE entry, diff=7-1=6 < 8)
      for (let i = 0; i < 3; i++) {
        window.__game.enterStage(layer, other, 1, 1);
        window.__game.enterStage(layer, stage, 1, 1);
      }
      const defeated = window.__game.getDefeatedEnemies(layer, stage);
      return { moves: window.__game.getStageMoves(), defeatedCount: defeated.length };
    }, { layer: TARGET_LAYER, stage: STAGE_WITH_ENEMY, other: OTHER_STAGE });
    expect(result).not.toBeNull();
    expect(result.moves).toBe(7);
    // diff=6 < 8 → defeatedEnemies に残っている（復活していない）
    expect(result.defeatedCount).toBeGreaterThan(0);
  });

  test('8 回移動後に再入すると雑魚が復活する（defeatedEnemies が空になる）', async ({ page }) => {
    // STAGE(kill, lkm=1) → OTHER → STAGE → OTHER → STAGE → OTHER → STAGE → OTHER → STAGE
    // stageMoves:  1          2       3       4       5       6       7       8       9 ← diff=9-1=8 >= 8 ✓
    await boot(page, makeSave());
    const result = await page.evaluate(async ({ layer, stage, other }) => {
      window.__game.enterStage(layer, stage, 1, 1);  // stageMoves=1
      const enemies = window.__game.getEnemies();
      for (const e of enemies) window.__game.dealDamage(e.id, 999, 'sword');  // lastKillMove=1
      // 4 pairs OTHER→STAGE (8 transitions → stageMoves=9 on 4th STAGE entry, diff=9-1=8 >= 8 → respawn)
      for (let i = 0; i < 4; i++) {
        window.__game.enterStage(layer, other, 1, 1);
        window.__game.enterStage(layer, stage, 1, 1);
      }
      const defeated = window.__game.getDefeatedEnemies(layer, stage);
      const enemiesNow = window.__game.getEnemies();
      return { moves: window.__game.getStageMoves(), defeatedCount: defeated.length, enemyCount: enemiesNow.length };
    }, { layer: TARGET_LAYER, stage: STAGE_WITH_ENEMY, other: OTHER_STAGE });
    expect(result).not.toBeNull();
    expect(result.moves).toBe(9);
    // 復活 → defeatedEnemies が空
    expect(result.defeatedCount).toBe(0);
    // enemies 配列に雑魚が再出現
    expect(result.enemyCount).toBeGreaterThan(0);
  });

  test('ダンジョンの雑魚はリスポーン対象外（field のみ復活）', async ({ page }) => {
    await boot(page, makeSave({ defeatedBosses: [] }));
    // dungeon_1/1,0 に入り、雑魚を倒してから 8 回移動しても復活しないことを確認
    const result = await page.evaluate(async ({ layer, other }) => {
      window.__game.enterStage('dungeon_1', '1,0', 1, 1);
      const enemies = window.__game.getEnemies();
      for (const e of enemies) window.__game.dealDamage(e.id, 999, 'sword');
      const defeatedBefore = window.__game.getDefeatedEnemies('dungeon_1', '1,0');
      if (!defeatedBefore.length) return null;  // 敵なし=スキップ
      // 8 回 field/other へ遷移（リスポーン条件を満たすが field 限定なので効かない）
      for (let i = 0; i < 8; i++) window.__game.enterStage(layer, other, 1, 1);
      // dungeon_1 再入
      window.__game.enterStage('dungeon_1', '1,0', 1, 1);
      const defeatedAfter = window.__game.getDefeatedEnemies('dungeon_1', '1,0');
      return { defeatedBefore: defeatedBefore.length, defeatedAfter: defeatedAfter.length };
    }, { layer: TARGET_LAYER, other: OTHER_STAGE });
    expect(result).not.toBeNull();
    // ダンジョンの雑魚は復活しない（倒した記録が残ったまま）
    expect(result.defeatedAfter).toBe(result.defeatedBefore);
  });

});
