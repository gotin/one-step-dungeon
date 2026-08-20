// 空中の遺跡（secret_grotto）＝銀の剣（swordTier 2）の寄道
//
// 盤面（scripts/migrate-secret-grotto-silver-sword.mjs が生成・自己検証済み）:
//   0,0 「入口の間」 …… 既存の小部屋（ルピー30）。東 (5,11) を1マス開けた。
//   1,0 「断たれた歩廊」 …… 爆弾 '!'(3,2) → 弓で 'Y'(2,6) → 門 'T'(5,10) が開く。
//        東西は col5 の穴で断たれ、渡れるのは (7,5) の1セルだけ（はしご）。
//   2,0 「銀の玉座」 …… 盾騎士2・術士・剣獣を全滅させると封印宝箱 (1,6) が開き銀の剣。
//
// ここで守るもの（migrate の状態空間検証は「盤面が解ける」ことしか言えない。
// **実エンジンで本当にその手順が通るか**は別物∴実プレイで通す）:
//   ① データ契約（部屋数・境界の突き合わせ・宝箱の中身・killAll 封印・links が配列）
//   ② 門は弓を撃つまで閉じている（撃たずに出口へ行けない）
//   ③ 爆弾を割るまで射座（row2 西）へ入れない
//   ④ はしご・爆弾・弓を持って 1,0 を実際に踏破し 2,0 へ抜けられる
//   ⑤ 玉座の宝箱は全滅前は開かず、全滅後に開くと銀の剣（swordTier 2・ATK = 2+7 = 9）になる
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { waitForBoard } from './helpers.js';
import { SWORD_TIERS, BASE_ATK } from '../shared/items.js';
import { ENEMY_META } from '../shared/enemies.js';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(readFileSync(join(__dir, '../work/blade-of-lumia.json'), 'utf8'));
const STAGES = MAP.layers.secret_grotto.stages;
const GAME = '/blade-of-lumia/game/';

/** 道具込みのプレビュー URL（笛で入る終盤の寄道＝全道具所持が前提）。 */
function previewUrl(stage, row, col) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: 'secret_grotto', stage,
    row: String(row), col: String(col),
    ps_weapon: '1', ps_bomb: '1', ps_bow: '1', ps_ladder: '1', ps_flute: '1',
  });
  return `${GAME}?${p.toString()}`;
}

/** n タイル歩く（1 タイル = movePlayer 2回・MOVE_STEP 0.5）。 */
async function walkTiles(page, dir, tiles = 1) {
  await page.evaluate(({ d, n }) => {
    for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
  }, { d: dir, n: tiles });
}
/** プレイヤーの整数タイル座標（toTileRow/Col と同じ floor(v+0.5)）。 */
const at = (page) => page.evaluate(() => {
  const p = window.__game.getState().player;
  return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});
const equip = (page, id) =>
  page.evaluate((sub) => { window.__game.getPlayer().activeSubItem = sub; }, id);
const face = (page, dir) =>
  page.evaluate((d) => { window.__game.setHeroDir(d); window.__game.step(1); }, dir);
/** 道具を1回使い tick をまわす（爆弾の導火線は 2000ms＝TICK 120ms で約17 tick）。 */
const useTool = (page, ticks = 30) => page.evaluate((n) => {
  window.__game.useSubItem();
  for (let i = 0; i < n; i++) window.__game.step(1);
}, ticks);

const tileAt = (stageKey, r, c) => STAGES[stageKey].tiles[r][c];

test.describe('Blade of Lumia – 空中の遺跡（銀の剣）', () => {

  test('① データ契約：3部屋・境界が揃う・宝箱は銀の剣・killAll 封印', () => {
    expect(Object.keys(STAGES).sort()).toEqual(['0,0', '1,0', '2,0']);

    // 境界の突き合わせ（着地は境界セルそのもの＝⑥-landing）。
    expect(tileAt('0,0', 5, 11), '0,0 の東が開いていない').toBe('.');
    expect(tileAt('1,0', 5, 0), '1,0 の西の着地セル').toBe('.');
    expect(tileAt('1,0', 5, 11), '1,0 の東の出口').toBe('.');
    expect(tileAt('2,0', 5, 0), '2,0 の西の着地セル').toBe('.');

    // 歩廊のギミック（migrate の設計値がデータに入っている）。
    const b = STAGES['1,0'];
    expect(tileAt('1,0', 2, 6), 'スイッチ Y').toBe('Y');
    expect(tileAt('1,0', 5, 10), '門 T').toBe('T');
    expect(b.links, 'links は配列（{} は refreshGates を TypeError で殺す）').toEqual([
      { switchId: '2,6', gateId: '5,10' },
    ]);
    expect(b.breakableWalls['3,2'].breakDef, '爆弾で割れる硬さ（<=3）').toBeLessThanOrEqual(3);

    // 玉座（報酬と封印）。
    const c = STAGES['2,0'];
    expect(c.chestContents['1,6']).toEqual({ type: 'weapon', swordTier: 2 });
    expect(c.showConditions['1,6']).toEqual({ trigger: 'killAll' });
    expect(SWORD_TIERS[2].name, '銀の剣が tier2').toBe('銀の剣');
    expect(Array.isArray(c.links)).toBe(true);

    // enemyDirs に幽霊キーが無く、向き別スプライトの敵には向きがある。
    const enemyCells = {};
    c.tiles.forEach((row, r) => row.forEach((ch, cc) => {
      if (ENEMY_META[ch]) enemyCells[`${r},${cc}`] = ch;
    }));
    expect(Object.keys(enemyCells).length, '玉座の敵の数').toBe(4);
    for (const k of Object.keys(c.enemyDirs)) expect(enemyCells[k], `幽霊キー ${k}`).toBeTruthy();
    for (const [k, tile] of Object.entries(enemyCells)) {
      if (!ENEMY_META[tile].directional) continue;
      expect(c.enemyDirs[k], `${k} '${tile}' は向き別スプライト∴向きが必要`).toBeTruthy();
    }
    // 入口の着地セルとその内側に敵を置かない（入室即被弾を防ぐ）。
    expect(enemyCells['5,0']).toBeUndefined();
    expect(enemyCells['5,1']).toBeUndefined();

    // 5.5m の配置表の外に作った敵部屋＝EXTRA_ENEMY_ROOMS に宣言しておく。これが無いと
    // 各機構 spec の「配置表に無い部屋に湧いていない」（facing-block ⑭ 等）が赤くなる。
    expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === 'secret_grotto' && e.stage === '2,0'),
      '銀の玉座が EXTRA_ENEMY_ROOMS に宣言されていない').toBe(true);
  });

  test('② 門は弓で Y を撃つまで閉じている（撃たずに出口へは行けない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // 東側（門の手前）に直接立って試す＝門だけを単独で測る。
    await page.goto(previewUrl('1,0', 5, 9));
    await waitForBoard(page);

    let st = await page.evaluate(() => {
      window.__game.step(1);
      return window.__game.getStageState();
    });
    expect(st.openGates, '初期は門が閉じている').not.toContain('5,10');
    expect(st.switchToggles, '初期はスイッチが OFF').not.toContain('2,6');

    await walkTiles(page, 'right', 2);
    expect(await at(page), '閉じた門を通り抜けた').toEqual({ r: 5, c: 9 });
    expect(errors).toEqual([]);
  });

  test('③ 爆弾で割るまで射座（row2 西）へ入れない', async ({ page }) => {
    await page.goto(previewUrl('1,0', 4, 2));
    await waitForBoard(page);

    // 未破壊の '!'(3,2) は壁と同じ＝北へ進めない。
    await walkTiles(page, 'up', 1);
    expect(await at(page), '未破壊の爆弾壁を通り抜けた').toEqual({ r: 4, c: 2 });

    await equip(page, 'bomb');
    await useTool(page, 30);
    const st = await page.evaluate(() => window.__game.getStageState());
    expect(st.brokenWalls, '爆弾で (3,2) が壊れていない').toContain('3,2');

    await walkTiles(page, 'up', 2);
    expect(await at(page), '爆弾で開いた口から射座へ上がれない').toEqual({ r: 2, c: 2 });
  });

  test('④ 爆弾→弓→はしごで歩廊を踏破し銀の玉座へ抜けられる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(previewUrl('1,0', 5, 1));
    await waitForBoard(page);

    // (5,1) → (4,2) で爆弾を置き '!'(3,2) を割る（AOE 半径2）。
    await walkTiles(page, 'up', 1);
    await walkTiles(page, 'right', 1);
    expect(await at(page)).toEqual({ r: 4, c: 2 });
    await equip(page, 'bomb');
    await useTool(page, 30);

    // 射座 (2,2) へ上がり、東へ矢を放つ。矢は穴3枚を飛び越えて 'Y'(2,6) に当たる。
    await walkTiles(page, 'up', 2);
    expect(await at(page)).toEqual({ r: 2, c: 2 });
    await face(page, 'right');
    await equip(page, 'bow');
    await useTool(page, 40);
    let st = await page.evaluate(() => window.__game.getStageState());
    expect(st.switchToggles, '矢が Y を叩いていない').toContain('2,6');
    expect(st.openGates, 'Y が ON なのに門が開いていない').toContain('5,10');

    // 西へ戻り、唯一のはしご橋 (7,5) を渡って東側へ。
    await walkTiles(page, 'down', 2);
    await walkTiles(page, 'down', 3);
    expect(await at(page)).toEqual({ r: 7, c: 2 });
    await walkTiles(page, 'right', 2);
    expect(await at(page)).toEqual({ r: 7, c: 4 });
    await walkTiles(page, 'right', 2);   // (7,5) 穴を渡って (7,6) へ
    expect(await at(page), 'はしごで穴を渡れていない').toEqual({ r: 7, c: 6 });

    // 東側を回って開いた門 (5,10) を通り、東の縁 (5,11) から 2,0 へ。
    await walkTiles(page, 'right', 1);
    await walkTiles(page, 'up', 2);
    expect(await at(page)).toEqual({ r: 5, c: 7 });
    await walkTiles(page, 'right', 4);
    expect(await at(page), '開いた門を通れていない').toEqual({ r: 5, c: 11 });
    await walkTiles(page, 'right', 1);
    await page.waitForFunction(() => window.__game.getState().stageKey === '2,0', null,
      { timeout: 3000 });

    st = await page.evaluate(() => window.__game.getState());
    expect(st.stageKey).toBe('2,0');
    expect(Math.floor(st.player.y + 0.5), '着地行が入口と揃っていない').toBe(5);
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('⑤ 玉座の宝箱は全滅前は開かず、全滅後に銀の剣が手に入る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // 宝箱 (1,6) の真下 (2,6) から始める（壁龕の中＝敵に殴られない位置）。
    await page.goto(previewUrl('2,0', 2, 6));
    await waitForBoard(page);

    const spawned = await page.evaluate(() => {
      window.__game.step(3);   // 各機構の初期化（術士の瞬間移動・盾騎士の構え）を通す
      return window.__game.getEnemies().map((e) => e.type).sort();
    });
    expect(spawned, '設計どおりの敵が spawn しない').toEqual(['ζ', 'ζ', 'η', 'μ']);

    // 封印中：宝箱に乗っても開かない（ps_weapon は素の剣＝swordTier -1 のまま）。
    await walkTiles(page, 'up', 1);
    expect(await at(page)).toEqual({ r: 1, c: 6 });
    let st = await page.evaluate(() => window.__game.getStageState());
    expect(st.openedChests, '全滅前に宝箱が開いた').not.toContain('1,6');
    let tier = await page.evaluate(() => window.__game.getState().player.swordTier);
    expect(tier, '全滅前に銀の剣を渡した').not.toBe(2);

    // 全滅させる → 封印が解ける。
    await page.evaluate(() => {
      for (const e of window.__game.getEnemies()) window.__game.dealDamage(e.id, 9999);
    });
    await page.waitForFunction(() => window.__game.getEnemies().length === 0, null,
      { timeout: 15_000 });

    // 一度降りて乗り直す（handleTileEvent は「そのセルに入った」時に走る）。
    await walkTiles(page, 'down', 1);
    await walkTiles(page, 'up', 1);
    await page.waitForFunction(() => (window.__game.getState().player.swordTier ?? 0) === 2, null,
      { timeout: 3000 });

    tier = await page.evaluate(() => window.__game.getState().player.swordTier);
    expect(tier, '銀の剣（tier2）になっていない').toBe(2);
    const atk = await page.evaluate(() => window.__game.getPlayer().atk);
    expect(atk, 'ATK が BASE_ATK + 銀の剣になっていない').toBe(BASE_ATK + SWORD_TIERS[2].atk);
    st = await page.evaluate(() => window.__game.getStageState());
    expect(st.openedChests, '宝箱が開封済みになっていない').toContain('1,6');
    expect(errors, 'pageerror が出た').toEqual([]);
  });
});
