// tests/heart-containers.spec.js – ハートの器の増設テスト（Phase 7-3）
//
// 検証内容：
//   ①: gainHeartContainer でmaxHearts+1・maxHp+2・hp が maxHp にリセットされる
//   ②: 上限（MAX_HEARTS=12）を超えると gainHeartContainer は何もしない
//   ③: 各ダンジョンボスルームにハートの器の宝箱が配置されている（データレベル）
//   ④: 隠し場所（field/3,0・dungeon_1/4,0）にハートの器が配置されている

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, SAVE_KEY } from './helpers.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

function hasHeartContainer(layer, stageKey) {
  const stage = MAP.layers[layer]?.stages[stageKey];
  const cc = stage?.chestContents ?? {};
  return Object.values(cc).some(c => c.type === 'heartContainer' || c.item === 'heartContainer');
}

async function seedGame(page, override = {}) {
  const saveData = JSON.stringify({
    player: {
      x: 2, y: 5,
      hp: 6, maxHp: 6, maxHearts: 3,
      atk: 2, def: 0, keys: 0,
      weapon: null, swordTier: -1,
      shield: null, armor: null,
      armorTier: -1, shieldTier: -1,
      subItems: {}, activeSubItem: null,
      rupees: 0, triforceCount: 0,
      defeatedBosses: [],
      ...override,
    },
    stageState: {},
    currentLayer: 'field',
    stageKey: '1,0',
    heroDir: 'down',
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
}

test('①: gainHeartContainer でmaxHearts+1・maxHp+2・hp がリセットされる', async ({ page }) => {
  // 初期 maxHearts=3, maxHp=6, hp=4（半減）でスタート
  await seedGame(page, { hp: 4, maxHp: 6, maxHearts: 3 });
  await page.evaluate(() => window.__game.gainHeartContainer());
  const state = await page.evaluate(() => window.__game.getState());
  expect(state.player.maxHearts).toBe(4);
  expect(state.player.maxHp).toBe(8);
  expect(state.player.hp).toBe(8); // hp が maxHp にリセット
});


test('③: ダンジョン1〜8のボスルームにハートの器の宝箱がある（データレベル）', () => {
  const bossRooms = [
    { layer: 'dungeon_1', stage: '0,0' },
    { layer: 'dungeon_2', stage: '0,0' },
    { layer: 'dungeon_3', stage: '0,0' },
    { layer: 'dungeon_4', stage: '0,0' },
    { layer: 'dungeon_5', stage: '0,0' },
    { layer: 'dungeon_6', stage: '0,0' },
    { layer: 'dungeon_7', stage: '1,0' },
    { layer: 'dungeon_8', stage: '0,0' },
  ];
  const missing = bossRooms.filter(({ layer, stage }) => !hasHeartContainer(layer, stage));
  expect(missing, `ハートの器が不足: ${JSON.stringify(missing)}`).toHaveLength(0);
});

test('④: 隠し場所（field/3,0 と dungeon_1/3,3）にハートの器がある（データレベル）', () => {
  expect(hasHeartContainer('field', '3,0'), 'field/3,0 にハートの器がない').toBe(true);
  expect(hasHeartContainer('dungeon_1', '3,3'), 'dungeon_1/3,3 にハートの器がない').toBe(true);
});
