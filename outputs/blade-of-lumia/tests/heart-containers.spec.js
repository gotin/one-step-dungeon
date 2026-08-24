// tests/heart-containers.spec.js – ハートの器の増設テスト（Phase 7-3）
//
// 検証内容：
//   ①: gainHeartContainer でmaxHearts+1・maxHp+2・hp が maxHp にリセットされる
//   ②: 上限（MAX_HEARTS=12）を超えると gainHeartContainer は何もしない
//   ③: 各ダンジョンボスルームにハートの器の宝箱が配置されている（データレベル）
//   ④: 隠し場所（field/3,0・dungeon_1/4,0）にハートの器が配置されている
//   ⑤: プレビュー設定 `ps_hearts` でハートの数を変えられる（2026-08-24）
//   ⑥: `ps_hearts` を渡さなければ既定の3つ（回帰）
//   ⑦: プレビュー設定は editor.js / editor-io.js / index.html の**3箇所**に同じ項目が要る
//
// ⑤〜⑦の背景（2026-08-24・ユーザー依頼）＝ボスの強さの判定に「ハート3個では無理／10個なら
// 勝てる」の切り分けが要る∴プレビュー開始時にハートの数を選べるようにした。
// ⚠️ `maxHearts`（HUD が描く数）と `maxHp`（実際の耐久）は `HP_PER_HEART` で結ばれている
//    ∴片方だけ書くと「ハートは10個あるのに2発で死ぬ」になる → ⑤が両方を見る。
// ⚠️ プレビュー設定の読み取りは editor.js（クリック位置から開く経路）と editor-io.js
//    （ステージ全体をプレビューする経路）に**同じコードが2つある**∴片方に足すと
//    もう片方の経路では既定値のまま黙って動く → ⑦が静的に両方を見る。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';

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
    stageKey: '7,14',
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
    { layer: 'dungeon_7', stage: '0,0' },
    { layer: 'dungeon_8', stage: '0,0' },
  ];
  const missing = bossRooms.filter(({ layer, stage }) => !hasHeartContainer(layer, stage));
  expect(missing, `ハートの器が不足: ${JSON.stringify(missing)}`).toHaveLength(0);
});

test('④: 隠し場所（field/7,3 と dungeon_1/3,3）にハートの器がある（データレベル）', () => {
  expect(hasHeartContainer('field', '7,3'), 'field/7,3 にハートの器がない').toBe(true);
  expect(hasHeartContainer('dungeon_1', '3,3'), 'dungeon_1/3,3 にハートの器がない').toBe(true);
});

// ── プレビュー設定のハート数（2026-08-24）──────────────────────────
const HP_PER_HEART = 2;   // game/constants.js（テストから import しない＝結果を独立に書く）

/** エディタプレビューの URL（ps_hearts だけを可変にする） */
function previewUrl(extra) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: 'test_mechanics', stage: '32,0',
    row: '4', col: '2', ps_weapon: '1',
    ...(extra ?? {}),
  });
  return `${GAME_URL}?${p.toString()}`;
}

async function previewHearts(page, extra) {
  await page.goto(previewUrl(extra));
  await waitForBoard(page);
  return page.evaluate(() => {
    const pl = window.__game.getPlayer();
    return {
      hp: pl.hp, maxHp: pl.maxHp, maxHearts: pl.maxHearts,
      // HUD に実際に並んだハートの数（`maxHearts` を書いただけで描かれていない事故を弾く）
      hudHearts: document.getElementById('hud-hearts')?.childElementCount ?? -1,
    };
  });
}

test('⑤: ps_hearts でハートの数・最大HP・現在HP・HUD が揃って変わる', async ({ page }) => {
  const r = await previewHearts(page, { ps_hearts: '10' });
  expect(r.maxHearts, 'ps_hearts が読まれていない').toBe(10);
  expect(r.maxHp, 'maxHp が maxHearts × HP_PER_HEART になっていない＝HUD と耐久がずれる')
    .toBe(10 * HP_PER_HEART);
  expect(r.hp, 'プレビュー開始時は満タンでない').toBe(r.maxHp);
  expect(r.hudHearts, 'HUD に描かれたハートの数が maxHearts と違う').toBe(10);
});

test('⑥: ps_hearts を渡さなければ既定の3つ（回帰）', async ({ page }) => {
  const r = await previewHearts(page);
  expect(r.maxHearts).toBe(3);
  expect(r.maxHp).toBe(3 * HP_PER_HEART);
  expect(r.hudHearts).toBe(3);
});

test('⑦: プレビュー設定の hearts は editor.js / editor-io.js / index.html の3箇所に揃っている', () => {
  const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const editorJs = read('../editor/editor.js');
  const editorIo = read('../editor/editor-io.js');
  const html     = read('../editor/index.html');

  // 入力欄そのもの
  expect(html, 'index.html に ps-hearts の入力欄が無い').toContain('id="ps-hearts"');
  // 2つの読み取り経路（クリック位置プレビュー／ステージ全体プレビュー）の両方
  expect(editorJs, "editor.js の ps 定義に hearts が無い（クリック位置からのプレビューで既定値のまま動く）")
    .toContain("getElementById('ps-hearts')");
  expect(editorIo, 'editor-io.js の getPreviewSettings に hearts が無い')
    .toContain("getElementById('ps-hearts')");
  // URL 組み立て（ここが抜けるとゲーム側は何も受け取らない）
  expect(editorIo, 'openPreview の URL に ps_hearts が無い').toContain('ps_hearts=');
});
