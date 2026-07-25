// tests/aquatic-enemy.spec.js — Phase 9-6 深洋O ④: aquatic enemy movement + 魚群 (FISH_SCHOOL '&')
//
// The deep-ocean O arm section needs enemies that live in the water (DESIGN §19-8-A):
// "海が敵" — enemies that swim in the sea, not on land. The land-only enemy AI can't
// express this, so we add a `move` attribute on ENEMY_META that changes how an enemy
// treats water:
//   - 'land' (default / undefined): current behaviour — WATER/LAVA/SKY all blocked.
//   - 'water': swims — WATER is passable, dry land (floor/grass/…) is NOT (can't beach).
//   - 'amphibious': both — WATER and land passable, but速度が地形で変わる
//     (meta.moveSpeed = { water, land } ⇒ 水で速い・陸で遅い 等).
// LAVA/SKY are never swimmable (only flight/ladder cross those, player-only).
//
// 1種目 = FISH_SCHOOL ('&'): a low-HP water-only swarm that surrounds you on narrow
// footing (§19-8-A 特殊型＝魚群). It uses a symbol tile because A–Z are all taken by
// existing enemies (§19-11-B, user-confirmed: assign symbol tiles to enemies).
//
// This locks in:
//   ① FISH_SCHOOL is a low-HP, non-boss, water-move enemy defined on a symbol tile
//   ② sprite/palette present (won't vanish in render), tile def + TILE_META + sprite-map
//   ③ isPassableForEnemy: water enemy swims through WATER, cannot enter dry land;
//      land enemy (default) is blocked by WATER (regression); nobody swims LAVA/SKY
//   ④ amphibious enemy passes both water and land
//   ⑤ FISH_SCHOOL not misplaced anywhere in the live map yet (parts-only)

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { createPassable } from '../game/passable.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';
const FIXTURE_SRC = '../tests/fixtures/test-stages.json';
function fishSwimUrl(stage = 'fish_swim') {
  const p = new URLSearchParams({
    fromEditor: '1', layer: 'test_mechanics', stage,
    row: '1', col: '5', ps_mapSrc: FIXTURE_SRC,
  });
  return `${GAME}?${p.toString()}`;
}

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// Build isPassableForEnemy over a stage we control (no DOM).
// bgTiles: optional { "r,c": tile } 下地層（Phase 9-6: 水を下地に置くケース）。
// player: optional 上書き（飛行/はしごの isPassable テスト用）。
function makePassable(tiles, { bgTiles = {}, player = { x: -9, y: -9 } } = {}) {
  const stageData = { rows: tiles.length, cols: tiles[0].length, tiles, bgTiles };
  return createPassable({
    getStageData: () => stageData,
    getEnemies: () => [],
    getPlayer: () => player,
    getCurrentLayer: () => 'field',
    getStageKey: () => '0,0',
    getDebugMode: () => false,
    getSS: () => ({ openGates: new Set(), stonePositions: {} }),
    toTileRow: (y) => Math.floor(y),
    toTileCol: (x) => Math.floor(x),
  });
}

test.describe('Phase 9-6 深洋O – aquatic enemy movement + 魚群', () => {

  test('① FISH_SCHOOL は記号タイルの低HP・非ボス・水棲の雑魚', () => {
    expect(TILE.FISH_SCHOOL, 'TILE.FISH_SCHOOL が定義されていない').toBe('&');
    const meta = ENEMY_META[TILE.FISH_SCHOOL];
    expect(meta, `ENEMY_META['&'] が存在しない`).toBeTruthy();
    expect(meta.isBoss, '魚群は雑魚（ボスではない）').toBeFalsy();
    expect(meta.hp, '魚群は低HP（1体は脆い）').toBeLessThanOrEqual(2);
    expect(meta.move, '魚群は水棲（water）').toBe('water');
    expect(meta.attack?.type, '魚群は接触攻撃（charge）').toBe('charge');
  });

  test('② タイル定義・スプライト・パレット・スプライトマップが揃っている', () => {
    expect(TILE_META[TILE.FISH_SCHOOL], `TILE_META['&'] が存在しない`).toBeTruthy();
    expect(ENEMY_SPRITES.fishSchool, 'スプライトが無い').toBeTruthy();
    expect(ENEMY_SPRITES.fishSchool.length, '2 フレーム').toBe(2);
    expect(ENEMY_SPRITES.fishSchool[0].length, '16 行').toBe(16);
    expect(ENEMY_SPRITES.fishSchool[0][0].length, '12 列').toBe(12);
    expect(ENEMY_PAL.fishSchool, 'パレットが無い').toBeTruthy();
    expect(ENEMY_PAL.fishSchool[0], 'index0 は透明').toBe('transparent');
    expect(TILE_SPRITE_MAP[TILE.FISH_SCHOOL], 'スプライトマップが無い（描画で消える）').toBeTruthy();
  });

  test('③ 水棲の敵は水を泳ぐ／陸に上がれない・陸の敵は水に入れない（回帰）', () => {
    const tiles = [
      ['.', '~', '.'],
      ['~', '~', '~'],
      ['.', '~', '.'],
    ];
    const p = makePassable(tiles);
    const water = { move: 'water' };
    const land = {};  // move 未指定＝従来の陸敵
    // 水棲：水セルへ入れる
    expect(p.isPassableForEnemy(0, 1, water), '水棲は水を泳ぐ').toBe(true);
    // 水棲：乾いた陸（床）には上がれない
    expect(p.isPassableForEnemy(0, 0, water), '水棲は陸に上がれない').toBe(false);
    // 陸敵（従来）：水に入れない（回帰防止）
    expect(p.isPassableForEnemy(0, 1, land), '陸の敵は水に入れない').toBe(false);
    // 陸敵：床は通れる
    expect(p.isPassableForEnemy(0, 0, land), '陸の敵は床を通れる').toBe(true);
  });

  test('③b 溶岩・空は誰も泳げない（水棲でも不通）', () => {
    const tiles = [
      ['.', 'l', '.'],
      ['.', '%', '.'],
      ['.', '.', '.'],
    ];
    const p = makePassable(tiles);
    const water = { move: 'water' };
    expect(p.isPassableForEnemy(0, 1, water), '水棲でも溶岩は泳げない').toBe(false);
    expect(p.isPassableForEnemy(1, 1, water), '水棲でも空は通れない').toBe(false);
  });

  test('④ 両用の敵は水も陸も通れる', () => {
    const tiles = [
      ['.', '~', '.'],
      ['.', '~', '.'],
      ['.', '.', '.'],
    ];
    const p = makePassable(tiles);
    const amph = { move: 'amphibious' };
    expect(p.isPassableForEnemy(0, 1, amph), '両用は水を通れる').toBe(true);
    expect(p.isPassableForEnemy(0, 0, amph), '両用は陸を通れる').toBe(true);
  });

  // ── 実 spawn 経路の回帰（バグ再発防止）──────────────────────
  // ユーザー報告：魚群を水でない所に置いたら普通にプレイヤーへ近づき、しかも速かった。
  // 原因＝buildEnemies が meta.move を敵インスタンスにコピーしておらず、
  // isPassableForEnemy の self.move が undefined＝陸敵扱いで水棲判定が効かなかった。
  // 単体テスト（③④）は isPassableForEnemy に move を直接渡していたので spawn 経路の
  // 抜けを見逃した。この2本で「実ゲームで魚群を spawn → move が乗る＋陸へ来ない」を固定する。

  test('⑥ 実 spawn で魚群に move:water が乗る（buildEnemies が move をコピー）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(fishSwimUrl());
    await waitForBoard(page);
    const enemies = await page.evaluate(() => window.__game.getEnemies());
    const fish = enemies.find(e => e.type === '&');
    expect(fish, '魚群が spawn していない').toBeTruthy();
    expect(fish.move, '魚群インスタンスに move:water が乗っていない（buildEnemies の抜け）').toBe('water');
    expect(errors).toEqual([]);
  });

  test('⑦ 魚群は水プールから陸へ出られない（プレイヤーに近づけない）', async ({ page }) => {
    await page.goto(fishSwimUrl());
    await waitForBoard(page);
    // 魚群は水プール(rows3-5,cols4-6)内、プレイヤーは陸(1,5)。列 col5 の row2 は床＝魚は
    // 水から陸へ上がれない∴上（プレイヤー方向）へ 1 セルも出られない。多数 tick 回して確認。
    for (let i = 0; i < 120; i++) await page.evaluate(() => window.__game.step(1));
    const enemies = await page.evaluate(() => window.__game.getEnemies());
    const fish = enemies.find(e => e.type === '&');
    expect(fish, '魚群が消えた').toBeTruthy();
    // 水プールの最上行は row3。陸へ上がれないので y は 3 未満にならない（row2=床）。
    expect(fish.y, `魚が陸へ出た（y=${fish.y} < 3）＝move:water が効いていない`).toBeGreaterThanOrEqual(3);
    // 水プールは cols4-6∴x は 4〜6 の範囲を出ない。
    expect(fish.x, `魚が水プール外へ出た（x=${fish.x}）`).toBeGreaterThanOrEqual(4);
    expect(fish.x).toBeLessThanOrEqual(6);
  });

  // ── 19-11-D: 水を bgTiles 下地に置く（敵と水が同一セルに共存）───────────
  // 水は「地形」なので bgTiles 層に置けるようにした（BG_TILES に WATER 追加）。
  // これで敵（tiles 層）と水（bgTiles 層）を同一セルに置ける＝水棲敵を水上に立たせられる。
  // tilePassable/enemyTilePassable/飛行/はしごの水判定は tiles 水と bgTiles 水を同一に扱う。

  test('⑧ bgTiles 下地の水はプレイヤー不通（tiles 層は床でも通れない）', () => {
    const tiles = [
      ['.', '.', '.'],
      ['.', '.', '.'],   // tiles は全部床
      ['.', '.', '.'],
    ];
    const bgTiles = { '1,1': '~' };   // 中央だけ bgTiles 水下地
    const p = makePassable(tiles, { bgTiles });
    expect(p.tilePassable(1, 1), 'bgTiles 水は不通').toBe(false);
    expect(p.tilePassable(0, 0), '水でない床は通行可').toBe(true);
  });

  test('⑨ bgTiles 下地の水も飛行で越えられる・はしごで渡れる', () => {
    const tiles = [
      ['.', '.', '.'],
      ['.', '.', '.'],
      ['.', '.', '.'],
    ];
    const bgTiles = { '1,1': '~' };   // 単独の水下地（上下左右が陸＝橋成立）
    // 飛行中：水下地を越えられる
    const pFly = makePassable(tiles, { bgTiles, player: { x: -9, y: -9, flying: true } });
    expect(pFly.isPassable(1, 1), '飛行で bgTiles 水を越えられる').toBe(true);
    // はしご所持：単独水は縦横どちらの橋も成立＝渡れる
    const pLad = makePassable(tiles, { bgTiles, player: { x: -9, y: -9, hasLadder: true } });
    expect(pLad.isPassable(1, 1), 'はしごで bgTiles 水（単独）を渡れる').toBe(true);
    // 素の徒歩：渡れない
    const pWalk = makePassable(tiles, { bgTiles });
    expect(pWalk.isPassable(1, 1), '徒歩では bgTiles 水を渡れない').toBe(false);
  });

  test('⑩ 水棲の敵は bgTiles 水を泳ぐ・陸には上がれない（tiles 水と同じ）', () => {
    const tiles = [
      ['.', '.', '.'],
      ['.', '.', '.'],
      ['.', '.', '.'],
    ];
    const bgTiles = { '1,1': '~' };
    const p = makePassable(tiles, { bgTiles });
    expect(p.isPassableForEnemy(1, 1, { move: 'water' }), '水棲は bgTiles 水を泳ぐ').toBe(true);
    expect(p.isPassableForEnemy(0, 0, { move: 'water' }), '水棲は陸に上がれない').toBe(false);
    expect(p.isPassableForEnemy(1, 1, {}), '陸敵は bgTiles 水に入れない').toBe(false);
  });

  test('⑪ 実 spawn：bgTiles 水プールの魚は陸へ出られない（tiles に水無し）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // この試作は tiles 層に水を持たず bgTiles のみ（fixture を直接確認）。
    const fx = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/test-stages.json', import.meta.url)), 'utf8'));
    const st = fx.layers.test_mechanics.stages.fish_swim_bg;
    expect(st.tiles.map(r => r.join('')).join('').includes('~'), 'tiles 層に水を持たない（bgTiles のみ）').toBe(false);
    expect(st.bgTiles['4,5'], '中心セルは bgTiles 水').toBe('~');
    await page.goto(fishSwimUrl('fish_swim_bg'));
    await waitForBoard(page);
    const fish0 = (await page.evaluate(() => window.__game.getEnemies())).find(e => e.type === '&');
    expect(fish0, '魚群が spawn していない').toBeTruthy();
    expect(fish0.move, '魚群インスタンスに move:water が乗っている').toBe('water');
    for (let i = 0; i < 120; i++) await page.evaluate(() => window.__game.step(1));
    const fish = (await page.evaluate(() => window.__game.getEnemies())).find(e => e.type === '&');
    expect(fish, '魚群が消えた').toBeTruthy();
    // 水プールは rows3-5,cols4-6。陸へ上がれないので範囲を出ない。
    expect(fish.y, `魚が水プール外(上)へ出た y=${fish.y}`).toBeGreaterThanOrEqual(3);
    expect(fish.y).toBeLessThanOrEqual(5);
    expect(fish.x, `魚が水プール外へ出た x=${fish.x}`).toBeGreaterThanOrEqual(4);
    expect(fish.x).toBeLessThanOrEqual(6);
    expect(errors).toEqual([]);
  });

  test('⑫ bgTiles 下地の水はアニメループの再描画対象（tiles 水と同じ揺らぎ・静止水にならない）', async ({ page }) => {
    // Phase 9-6: tiles 水→bgTiles 水移行後も湖/海が波打つよう、redrawAnimSprites が
    // bgTiles 水セルを再描画対象に含めることを検証する。animFrame はモジュール private で
    // 外から進められないので、フレーム差分でなく「アニメループが water 下地を作り直す配線」を
    // 決定的に確認する＝背景を消して redrawAnimSprites を呼ぶと復元されれば対象に入っている。
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(fishSwimUrl('fish_swim_bg'));
    await waitForBoard(page);
    const waterSel = '#board .cell[data-row="4"][data-col="5"]'; // bgTiles 水（中心）
    await expect(page.locator(waterSel).first()).toHaveAttribute('data-bg-sprite', 'water');
    const result = await page.evaluate(async (sel) => {
      const mod = await import('/blade-of-lumia/shared/sprites.js');
      const el = document.querySelector(sel);
      const had = el.style.backgroundImage.includes('data:image');
      el.style.backgroundImage = '';            // 波の1フレームを消す
      mod.redrawAnimSprites();                   // アニメループ相当を1回
      const restored = el.style.backgroundImage.includes('data:image');
      return { had, restored };
    }, waterSel);
    expect(result.had, 'bgTiles 水に背景画像が敷かれていない').toBe(true);
    expect(result.restored, 'redrawAnimSprites が bgTiles 水を再描画しない（静止水＝アニメ対象外）').toBe(true);
    expect(errors).toEqual([]);
  });

  test('⑤ FISH_SCHOOL はまだライブマップに配置していない（部品のみ）', () => {
    for (const [layerName, layer] of Object.entries(MAP.layers ?? {})) {
      for (const [sk, stage] of Object.entries(layer.stages ?? {})) {
        const flat = (stage.tiles ?? [])
          .map(row => (Array.isArray(row) ? row.join('') : String(row)))
          .join('');
        expect(flat.includes(TILE.FISH_SCHOOL),
          `${layerName}/${sk} に配置済みの '&' がある（まだ部品のみのはず）`).toBe(false);
      }
    }
  });
});
