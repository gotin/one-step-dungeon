// 樹海の岩室（forest_cave）＝銅の剣（swordTier 1）の寄道
//
// 盤面（scripts/migrate-forest-cave-bronze-sword.mjs が生成・状態空間で自己検証済み）:
//   field 0,0 「岩室の裂け目」…… 爆弾で '!'(3,2) を割ると洞窟入口 '>'(1,2) に立てる。
//   0,0 「石車の前室」 …… 1マス幅の岩溝2本。石車を2つのボタン (3,2)/(8,10) に据えると
//        門 'T'(2,10) が恒久ロック（stonesLocked）＝東 (2,11) から岩室へ抜けられる。
//   1,0 「かがり火の岩室」 …… 'H' 3基を灯すと封印宝箱 (1,6) が現れ銅の剣。
//        骸骨剣士 θ×2・剣獣 μ が巡回（脅威度 20.0）。
//
// ここで守るもの（migrate の状態空間検証は「盤面が解ける」ことしか言えない。
// **実エンジンで本当にその手順が通るか**は別物∴実プレイで通す）:
//   ① データ契約（2部屋・境界の突き合わせ・宝箱の中身・torchesLit 封印・links が配列）
//   ② field 側の入口は爆弾で割るまで入れない（岩 '!' が壁として働く）
//   ③ 門は石2つがボタンに据わるまで開かない（石1つ＋自分の足では通れない）
//   ④ 石車を2つ据えて門を抜け、岩室へ入れる（stonesLocked が持続する）
//   ⑤ 宝箱は3基を灯すまで開かず、灯した後に開くと銅の剣（swordTier 1・ATK = 2+4 = 6）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { waitForBoard } from './helpers.js';
import { SWORD_TIERS, BASE_ATK } from '../shared/items.js';
import { ENEMY_META } from '../shared/enemies.js';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { toolsUsableIn } from '../shared/progression.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(readFileSync(join(__dir, '../work/blade-of-lumia.json'), 'utf8'));
const STAGES = MAP.layers.forest_cave.stages;
const FIELD = MAP.layers.field.stages;
const GAME = '/blade-of-lumia/game/';

/** 道具込みのプレビュー URL（D6 以降＝爆弾・ロウソクを持っている地点。笛/はしごは持たせない）。 */
function previewUrl(layer, stage, row, col, extra = {}) {
  const p = new URLSearchParams({
    fromEditor: '1', layer, stage, row: String(row), col: String(col),
    ps_weapon: '1', ps_bomb: '1', ps_bow: '1', ps_boomerang: '1', ps_candle: '1',
    ...extra,
  });
  return `${GAME}?${p.toString()}`;
}

/** n タイル歩く（1 タイル = movePlayer 2回・MOVE_STEP 0.5）。 */
async function walkTiles(page, dir, tiles = 1) {
  await page.evaluate(({ d, n }) => {
    for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
  }, { d: dir, n: tiles });
}
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
/** 石を1回押す。
 *  ⚠️ 石押しのクールダウン（STONE_PUSH_COOLDOWN_MS 600ms）は **実時間 Date.now()** で測る＝
 *  `step(n)` を回しても消化されない∴押しの間は実時間で待つ。押しが通ると
 *  プレイヤーは「石が居たセル」へ1タイル丸ごと移動する（半歩移動ではない）。 */
async function pushStone(page, dir, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.waitForTimeout(650);
    await page.evaluate((d) => { window.__game.movePlayer(d); window.__game.step(1); }, dir);
  }
}
/** 敵を全部消す（この spec は戦闘の検証ではない＝押し引きの検証に集中する）。 */
const clearEnemies = async (page) => {
  await page.evaluate(() => {
    for (const e of window.__game.getEnemies()) window.__game.dealDamage(e.id, 9999);
  });
  await page.waitForFunction(() => window.__game.getEnemies().length === 0, null, { timeout: 15_000 });
};

const tileAt = (stageKey, r, c) => STAGES[stageKey].tiles[r][c];

test.describe('Blade of Lumia – 樹海の岩室（銅の剣）', () => {

  test('① データ契約：2部屋・境界が揃う・宝箱は銅の剣・torchesLit 封印', () => {
    expect(Object.keys(STAGES).sort()).toEqual(['0,0', '1,0']);
    expect(MAP.layers.forest_cave.bgm, '洞窟の BGM').toBe('dungeon');

    // field 側の入口（爆弾で割る岩の奥）と洞窟側の帰り口が対になっている。
    expect(FIELD['0,0'].tiles[1][2], 'field 0,0 の洞窟入口').toBe('>');
    expect(FIELD['0,0'].mapEnters['1,2']).toEqual({ id: 'field_forest_cave', destId: 'forest_cave' });
    expect(FIELD['0,0'].breakableWalls['3,2'].breakDef, '爆弾で割れる硬さ（<=3）').toBeLessThanOrEqual(3);
    expect(STAGES['0,0'].mapEnters['1,1']).toEqual({ id: 'forest_cave', destId: 'field_forest_cave' });

    // 部屋の継ぎ目（着地は境界セルそのもの＝⑥-landing）。
    expect(tileAt('0,0', 2, 11), '前室の東口').toBe('.');
    expect(tileAt('1,0', 2, 0), '岩室の西の着地セル').toBe('.');

    // 前室のギミック（migrate の設計値がデータに入っている）。
    const a = STAGES['0,0'];
    expect(tileAt('0,0', 2, 10), '門 T').toBe('T');
    expect([tileAt('0,0', 3, 2), tileAt('0,0', 8, 10)], 'ボタン2つ').toEqual(['S', 'S']);
    expect([tileAt('0,0', 3, 6), tileAt('0,0', 6, 10)], '石車2つ').toEqual(['*', '*']);
    // ボタン式の門は links を持たない（refreshGates は「全ボタン ON」で全 'T' を開ける）。
    expect(Array.isArray(a.links), 'links は配列（{} は refreshGates を TypeError で殺す）').toBe(true);
    expect(a.links).toEqual([]);

    // 岩室（報酬と封印）。
    const b = STAGES['1,0'];
    expect(b.chestContents['1,6']).toEqual({ type: 'weapon', swordTier: 1 });
    expect(b.showConditions['1,6']).toEqual({ trigger: 'torchesLit' });
    expect(SWORD_TIERS[1].name, '銅の剣が tier1').toBe('銅の剣');
    expect(Array.isArray(b.links)).toBe(true);
    const torches = [];
    b.tiles.forEach((row, r) => row.forEach((ch, c) => { if (ch === 'H') torches.push(`${r},${c}`); }));
    expect(torches, 'かがり火は3基').toEqual(['3,2', '3,9', '7,5']);

    // enemyDirs に幽霊キーが無く、向き別スプライトの敵には向きがある。
    const enemyCells = {};
    b.tiles.forEach((row, r) => row.forEach((ch, c) => {
      if (ENEMY_META[ch]) enemyCells[`${r},${c}`] = ch;
    }));
    expect(Object.keys(enemyCells).length, '岩室の敵の数').toBe(3);
    for (const k of Object.keys(b.enemyDirs)) expect(enemyCells[k], `幽霊キー ${k}`).toBeTruthy();
    for (const [k, tile] of Object.entries(enemyCells)) {
      if (!ENEMY_META[tile].directional) continue;
      expect(b.enemyDirs[k], `${k} '${tile}' は向き別スプライト∴向きが必要`).toBeTruthy();
    }
    // 入口の着地セルとその内側に敵を置かない（入室即被弾を防ぐ）。
    expect(enemyCells['2,0']).toBeUndefined();
    expect(enemyCells['2,1']).toBeUndefined();

    // 配置表の外に作った敵部屋＝EXTRA_ENEMY_ROOMS に宣言しておく（各機構 spec の
    // 「配置表に無い部屋に湧いていない」が赤くならないように）。
    expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === 'forest_cave' && e.stage === '1,0'),
      'かがり火の岩室が EXTRA_ENEMY_ROOMS に宣言されていない').toBe(true);
    // 進行の宣言＝爆弾とロウソクを持つ地点（D6 以降）。はしご・笛は要らない設計。
    // （2026-09-05・0g で手書き表を廃止＝実マップの報酬配置からの導出で測る）
    expect([...toolsUsableIn(MAP).forest_cave].sort()).toEqual(['bomb', 'boomerang', 'bow', 'candle']);
  });

  test('② field 側の入口は爆弾で岩を割るまで入れない', async ({ page }) => {
    await page.goto(previewUrl('field', '0,0', 4, 2));
    await waitForBoard(page);

    // 未破壊の '!'(3,2) は壁と同じ＝北の窪みへ上がれない。
    await walkTiles(page, 'up', 1);
    expect(await at(page), '未破壊の岩を通り抜けた').toEqual({ r: 4, c: 2 });

    await equip(page, 'bomb');
    await useTool(page, 30);
    const st = await page.evaluate(() => window.__game.getStageState());
    expect(st.brokenWalls, '爆弾で (3,2) が壊れていない').toContain('3,2');

    // 割れた口から入口 '>'(1,2) へ上がると洞窟へ遷移する。
    await walkTiles(page, 'up', 3);
    await page.waitForFunction(() => window.__game.getState().currentLayer === 'forest_cave', null,
      { timeout: 3000 });
    const s = await page.evaluate(() => window.__game.getState());
    expect(s.stageKey, '前室に入っていない').toBe('0,0');
    expect(Math.floor(s.player.y + 0.5), '洞窟側の着地セルが (1,1) でない').toBe(1);
    expect(Math.floor(s.player.x + 0.5)).toBe(1);
  });

  test('③ 門は石車2つが据わるまで開かない（石1つ＋自分の足では通れない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // 門 (2,10) へ寄れるのは北の (1,10) だけ（(2,9)/(1,11)/(3,11) は岩壁）。
    await page.goto(previewUrl('forest_cave', '0,0', 1, 10));
    await waitForBoard(page);

    let st = await page.evaluate(() => { window.__game.step(1); return window.__game.getStageState(); });
    expect(st.openGates, '初期は門が閉じている').not.toContain('2,10');

    // 門の手前から南へ進んでも抜けられない。
    await walkTiles(page, 'down', 2);
    expect(await at(page), '閉じた門を通り抜けた').toEqual({ r: 1, c: 10 });

    // 岩溝②の石車だけを据える（=ボタン1つ）→ 恒久ロックはしない。
    await walkTiles(page, 'left', 2);
    await walkTiles(page, 'down', 4);
    expect(await at(page)).toEqual({ r: 5, c: 8 });
    await walkTiles(page, 'right', 2);
    expect(await at(page)).toEqual({ r: 5, c: 10 });
    await pushStone(page, 'down', 2);   // 石を (7,10)→(8,10) へ2回押す
    expect(await at(page), '石車を溝の底まで押せていない').toEqual({ r: 7, c: 10 });
    st = await page.evaluate(() => window.__game.getStageState());
    expect(st.switchStates['8,10'], 'ボタン (8,10) が石で押されていない').toBe(true);
    expect(st.switchStates['3,2'], 'まだ押していないボタン (3,2)').toBeFalsy();
    expect(st.stonesLocked, '石1つで恒久ロックしてしまった').toBeFalsy();

    // もう一方のボタン (3,2) は1マス幅の溝の底＝人は永久に立てない（石専用）∴
    // 門の前に戻った時点で ON は1つ＝門は閉じたまま。
    await walkTiles(page, 'up', 2);
    await walkTiles(page, 'left', 2);
    await walkTiles(page, 'up', 4);
    await walkTiles(page, 'right', 2);
    expect(await at(page)).toEqual({ r: 1, c: 10 });
    st = await page.evaluate(() => window.__game.getStageState());
    expect(st.openGates, '石1つだけで門が開いた').not.toContain('2,10');
    await walkTiles(page, 'down', 2);
    expect(await at(page), '石1つだけで門を通れた').toEqual({ r: 1, c: 10 });
    expect(errors).toEqual([]);
  });

  test('④ 石車を2つ据えると門が恒久ロックし、岩室へ抜けられる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(previewUrl('forest_cave', '0,0', 3, 8));
    await waitForBoard(page);

    // 岩溝①＝西へ4回押して石車をボタン (3,2) に据える（溝は1マス幅＝押せる向きは西だけ）。
    await walkTiles(page, 'left', 1);
    await pushStone(page, 'left', 4);
    expect(await at(page), '石車を溝の底まで押せていない').toEqual({ r: 3, c: 3 });
    let st = await page.evaluate(() => window.__game.getStageState());
    expect(st.switchStates['3,2'], 'ボタン (3,2) が石で押されていない').toBe(true);

    // 岩溝②＝南へ2回押して石車をボタン (8,10) に据える → 2つ揃って恒久ロック。
    await walkTiles(page, 'right', 5);
    await walkTiles(page, 'down', 2);
    await walkTiles(page, 'right', 2);
    expect(await at(page)).toEqual({ r: 5, c: 10 });
    await pushStone(page, 'down', 2);
    st = await page.evaluate(() => window.__game.getStageState());
    expect([st.switchStates['3,2'], st.switchStates['8,10']],
      'ボタン2つが石で押されていない').toEqual([true, true]);
    expect(st.stonesLocked, '石2つでも恒久ロックしない').toBeTruthy();
    expect(st.openGates, '門が開いていない').toContain('2,10');

    // 門を通って東の縁 (2,11) から岩室へ。
    await walkTiles(page, 'up', 2);
    await walkTiles(page, 'left', 2);
    await walkTiles(page, 'up', 4);
    await walkTiles(page, 'right', 2);
    expect(await at(page)).toEqual({ r: 1, c: 10 });
    await walkTiles(page, 'down', 1);
    expect(await at(page), '開いた門に入れていない').toEqual({ r: 2, c: 10 });
    await walkTiles(page, 'right', 1);
    expect(await at(page), '門の東の縁へ出られていない').toEqual({ r: 2, c: 11 });
    await walkTiles(page, 'right', 1);
    await page.waitForFunction(() => window.__game.getState().stageKey === '1,0', null,
      { timeout: 3000 });

    const s = await page.evaluate(() => window.__game.getState());
    expect(s.stageKey).toBe('1,0');
    expect(Math.floor(s.player.y + 0.5), '着地行が入口と揃っていない').toBe(2);
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('⑤ 宝箱は3基を灯すまで開かず、灯した後に銅の剣が手に入る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // 壁龕（row1-2 の cols5-7）へ入れるのは (2,5)→(1,5) だけ（(2,6) は石碑）∴(3,5) から始める。
    await page.goto(previewUrl('forest_cave', '1,0', 3, 5));
    await waitForBoard(page);

    const spawned = await page.evaluate(() => {
      window.__game.step(3);
      return window.__game.getEnemies().map((e) => e.type).sort();
    });
    expect(spawned, '設計どおりの敵が spawn しない').toEqual(['θ', 'θ', 'μ']);
    await clearEnemies(page);   // ここは火を点ける手順の検証＝戦闘は別 spec の担当

    // 封印中：宝箱のセルに乗っても開かない（隠しタイルは条件を満たすまで現れない）。
    await walkTiles(page, 'up', 2);
    await walkTiles(page, 'right', 1);
    expect(await at(page), '壁龕の宝箱のセルに立てていない').toEqual({ r: 1, c: 6 });
    let st = await page.evaluate(() => window.__game.getStageState());
    expect(st.openedChests, '灯す前に宝箱が開いた').not.toContain('1,6');
    let tier = await page.evaluate(() => window.__game.getState().player.swordTier);
    expect(tier, '灯す前に銅の剣を渡した').not.toBe(1);

    // ロウソクで 'H' 3基を灯す（前方1セルを灯す＝火元は要らない）。
    await equip(page, 'candle');
    await walkTiles(page, 'left', 1);
    await walkTiles(page, 'down', 2);
    await walkTiles(page, 'left', 2);
    expect(await at(page)).toEqual({ r: 3, c: 3 });
    await face(page, 'left');
    await useTool(page, 10);                      // (3,2)
    await walkTiles(page, 'down', 4);
    await walkTiles(page, 'right', 1);
    expect(await at(page)).toEqual({ r: 7, c: 4 });
    await face(page, 'right');
    await useTool(page, 10);                      // (7,5)
    await walkTiles(page, 'up', 3);
    await walkTiles(page, 'right', 4);
    await walkTiles(page, 'up', 1);
    expect(await at(page)).toEqual({ r: 3, c: 8 });
    await face(page, 'right');
    await useTool(page, 10);                      // (3,9)
    st = await page.evaluate(() => window.__game.getStageState());
    expect([...st.litTorches].sort(), 'かがり火3基が灯っていない')
      .toEqual(['3,2', '3,9', '7,5']);

    // 封印が解けた宝箱に乗ると銅の剣。
    await walkTiles(page, 'left', 3);
    await walkTiles(page, 'up', 2);
    await walkTiles(page, 'right', 1);
    await page.waitForFunction(() => (window.__game.getState().player.swordTier ?? -1) === 1, null,
      { timeout: 3000 });
    expect(await at(page), '宝箱のセルに立てていない').toEqual({ r: 1, c: 6 });

    tier = await page.evaluate(() => window.__game.getState().player.swordTier);
    expect(tier, '銅の剣（tier1）になっていない').toBe(1);
    const atk = await page.evaluate(() => window.__game.getPlayer().atk);
    expect(atk, 'ATK が BASE_ATK + 銅の剣になっていない').toBe(BASE_ATK + SWORD_TIERS[1].atk);
    st = await page.evaluate(() => window.__game.getStageState());
    expect(st.openedChests, '宝箱が開封済みになっていない').toContain('1,6');
    expect(errors, 'pageerror が出た').toEqual([]);
  });
});
