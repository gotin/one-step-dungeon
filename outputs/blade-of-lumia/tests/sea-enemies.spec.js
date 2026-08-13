// tests/sea-enemies.spec.js — Phase 9-6 深洋O ④: 海棲雑魚②接近型 / ③遠隔型
//
// アーム7の「海が敵」を成立させる残り2種（DESIGN §19-8-A / §19-11-C）。
// ①魚群（'&'）は tests/aquatic-enemy.spec.js で固定済み。ここは②③を固定する。
//
// ②接近型 = 潜み鮫 LURK_SHARK ('<')：潜行↔浮上のリズム戦闘（ユーザー確定 2026-07-25）。
//   潜行中（e.hidden）… 追跡は続くが「無敵・攻撃なし・接触ダメージなし」
//   ⚠ 2026-08-13（5.5k k-3）に機構名を一般化した＝`meta.submerge`→`meta.hide`（style:'water'）／
//     `e.submerged`→`e.hidden`。同じ規則を陸（地中蟲）・空（跳躍蜘蛛の滞空）でも使うため。
//   浮上中               … 噛みつき（sword range1.6）で殴ってくる／こちらの攻撃も通る
//   ∴「浮上した 1.2 秒だけが殴れる窓」＝海のリズム。
//   さらに二段構え（ユーザー確定 2026-07-25・追加）＝**離れていれば遠隔・隣接すれば噛みつき**。
//   鮫は水しか泳げない＝陸に上がれない∴射程を近接だけにすると「岸から2マス離れて立つ」で
//   完全に無害な置物になる。∴遠隔＝水刃（waterBlade・任意角）を持たせ、近接リーチの
//   すぐ外から撃つ。`minRange` は「近すぎる時はこの攻撃を出さない」汎用フィールド（新設）。
//
// ③遠隔型 = 射水魚 ARCHER_FISH ('/')：水中から水弾（waterShot）を任意角で撃つ。
//   'stone' と同じ任意角型なので斜めにも飛ぶ。投擲物スプライトは ITEM_SPRITES.waterShot
//   （projectile.js createProjEl が makeSprite(proj.type, proj.type) を呼ぶ＝type 名が
//   スプライト名とパレット名を兼ねる＝名前が無いと弾が「見えない」まま飛ぶ）。
//
// 固定する不変条件：
//   ① 2種の定義（記号タイル・水棲・非ボス・攻撃タイプ）
//   ② タイル定義／スプライト／パレット／スプライトマップ／waterShot の名前解決
//   ③ 潜行FSM の周期が論理時間どおり（潜行2.0s → 浮上1.2s → 潜行）
//   ④ 潜行中は全ダメージ無効・浮上中は通る（リズム戦闘の核心）
//   ⑤ 潜行中は接触ダメージを与えない（無敵と対の扱い）
//   ⑥ 潜行中は攻撃しない・浮上中だけ噛みつく
//   ⑦ 射水魚が水弾を発射し、任意角（斜め）に飛ぶ
//   ⑧ クールダウン前は撃たない（⑦が vacuous pass でない証明）
//   ⑨ 2種ともライブマップ未配置（部品のみ）
//   ⑩ 潜み鮫は遠隔（水刃）も持ち、離れたプレイヤーへ撃つ（浮上中のみ）
//   ⑪ minRange＝隣接時は遠隔を撃たず噛みつきに切り替わる（二段構えの核心）
//   ⑫ 敵スプライトがプレイヤーの左右に応じて反転する（横向き敵の向きバグ）
//
// tick 換算（TICK_MS=120・gameNow は step() で 120ms ずつ進む）：
//   spawn 時 hidden=true → 初 tick(now=120) で _hideUntil=2120
//   → now>=2120 で浮上 = tick18(2160)  → 浮上は 2160+1200=3360 まで
//   → now>=3360 で再潜行 = tick28(3360)
//   射水魚 cooldown 2200ms・lastTime=0 → now-0>=2200 で初弾 = tick19(2280)

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { ENEMY_META, PROJECTILE_SPRITE } from '../shared/enemies.js';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';
import { ITEM_SPRITES, ITEM_PAL } from '../shared/sprites-items.js';
import { SPRITES, PAL } from '../shared/sprites.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { createEnemyAi } from '../game/enemy-ai.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { gameLayerEntries } from '../shared/layers.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl(stage, row, col) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col),
    ps_weapon: '1',
  });
  return `${GAME}?${p.toString()}`;
}

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// 潜み鮫の検証ステージ：水プール rows4-6/cols2-9・鮫(4,5)・プレイヤーは真上の陸(3,5)。
// 鮫は陸に上がれないので座標は動かない＝距離1.0固定で噛みつき range1.6 が届く。
const SHARK_URL = previewUrl('lurk_shark', 3, 5);
// 射水魚の検証ステージ：水プール rows5-7/cols2-4・魚(5,4)・プレイヤーは斜め上の陸(2,7)。
// 距離 √(3²+3²)=4.24 ≤ range6 ∴斜めに撃つ。魚は四方が陸/水端で動けない＝距離固定。
const FISH_URL = previewUrl('archer_fish', 2, 7);
// 二段構えの遠隔側 検証ステージ：同じ水プールで、プレイヤーを右上の陸(1,9)へ置く。
// 鮫(4,5) との距離 √(3²+4²)=5.0 ＝ 噛みつき range1.6 の外・水刃 range6 の内。
const SHARK_FAR_URL = previewUrl('lurk_shark', 1, 9);
// 向き反転 検証ステージ：プレイヤーを鮫と同じ行の右端の陸(4,10) に置く（水プールは cols2-9）。
const SHARK_EAST_URL = previewUrl('lurk_shark', 4, 10);

test.describe('Phase 9-6 深洋O – 海棲雑魚②接近型・③遠隔型', () => {

  test('① 潜み鮫・射水魚の定義（記号タイル・水棲・非ボス・攻撃タイプ）', () => {
    expect(TILE.LURK_SHARK, 'TILE.LURK_SHARK が未定義').toBe('<');
    expect(TILE.ARCHER_FISH, 'TILE.ARCHER_FISH が未定義').toBe('/');

    const shark = ENEMY_META[TILE.LURK_SHARK];
    expect(shark, `ENEMY_META['<'] が無い`).toBeTruthy();
    expect(shark.isBoss, '潜み鮫は雑魚').toBeFalsy();
    expect(shark.move, '潜み鮫は水棲').toBe('water');
    expect(shark.hide, '潜行周期 hide が無い').toBeTruthy();
    expect(shark.hide.hiddenMs, '潜行時間').toBeGreaterThan(0);
    expect(shark.hide.shownMs, '浮上時間').toBeGreaterThan(0);
    expect(shark.hide.style, '見た目の種別（水＝波紋）').toBe('water');
    expect(shark.attack?.type, '浮上中は噛みつき（sword）').toBe('sword');
    expect(shark.attack.range, '岸のプレイヤー（距離1.0）に届くリーチ').toBeGreaterThanOrEqual(1.2);
    // 二段構え＝attacks 配列に噛みつき（sword）と遠隔（waterBlade）の2本
    const bite  = shark.attacks?.find(a => a.type === 'sword');
    const blade = shark.attacks?.find(a => a.type === 'waterBlade');
    expect(bite,  'attacks に噛みつきが無い').toBeTruthy();
    expect(blade, 'attacks に遠隔（水刃）が無い＝岸から離れると無害な置物になる').toBeTruthy();
    // minRange は噛みつきリーチ以上＝両者の間に「どちらも出ない隙間」を作らない
    expect(blade.minRange, '遠隔に minRange が無い＝隣接でも遠隔が出る').toBeGreaterThanOrEqual(bite.range);
    expect(blade.range, '遠隔の射程が近接より広くない').toBeGreaterThan(bite.range);
    // 噛みつきは minRange 無し＝どんなに近くても出る（下限は近接側に付けない）
    expect(bite.minRange, '噛みつきに minRange は付けない').toBeUndefined();

    const fish = ENEMY_META[TILE.ARCHER_FISH];
    expect(fish, `ENEMY_META['/'] が無い`).toBeTruthy();
    expect(fish.isBoss, '射水魚は雑魚').toBeFalsy();
    expect(fish.move, '射水魚は水棲').toBe('water');
    expect(fish.attack?.type, '射水魚は水弾').toBe('waterShot');
    expect(fish.attack.range, '遠くから狙う射程').toBeGreaterThanOrEqual(4);
  });

  test('② タイル定義・スプライト・パレット・スプライトマップ・水弾の名前解決', () => {
    for (const [tile, spr, pal] of [
      [TILE.LURK_SHARK,  'lurkShark',  'lurkShark'],
      [TILE.ARCHER_FISH, 'archerFish', 'archerFish'],
    ]) {
      expect(TILE_META[tile], `TILE_META['${tile}'] が無い`).toBeTruthy();
      expect(ENEMY_SPRITES[spr], `${spr} スプライトが無い`).toBeTruthy();
      expect(ENEMY_SPRITES[spr].length, `${spr} は 2 フレーム`).toBe(2);
      expect(ENEMY_SPRITES[spr][0].length, `${spr} は 16 行`).toBe(16);
      expect(ENEMY_SPRITES[spr][0][0].length, `${spr} は 12 列`).toBe(12);
      expect(ENEMY_PAL[pal], `${pal} パレットが無い`).toBeTruthy();
      expect(ENEMY_PAL[pal][0], 'index0 は透明').toBe('transparent');
      expect(TILE_SPRITE_MAP[tile], 'スプライトマップが無い（描画で消える）').toBeTruthy();
      expect(TILE_SPRITE_MAP[tile].spr).toBe(spr);
    }
    // 水弾：createProjEl は makeSprite(proj.type, proj.type) を呼ぶので、
    // マージ後の SPRITES / PAL に 'waterShot' が両方揃っていないと弾が描画されない。
    expect(ITEM_SPRITES.waterShot, 'waterShot スプライトが無い').toBeTruthy();
    expect(ITEM_PAL.waterShot, 'waterShot パレットが無い').toBeTruthy();
    expect(SPRITES.waterShot, 'マージ後の SPRITES に waterShot が無い').toBeTruthy();
    expect(PAL.waterShot, 'マージ後の PAL に waterShot が無い').toBeTruthy();
    expect(PROJECTILE_SPRITE.waterShot, 'PROJECTILE_SPRITE に waterShot が無い').toBe('waterShot');
    // 水刃（潜み鮫の遠隔）も同じ契約＝type 名でスプライト/パレットを引く
    expect(ITEM_SPRITES.waterBlade, 'waterBlade スプライトが無い').toBeTruthy();
    expect(ITEM_PAL.waterBlade, 'waterBlade パレットが無い').toBeTruthy();
    expect(SPRITES.waterBlade, 'マージ後の SPRITES に waterBlade が無い').toBeTruthy();
    expect(PAL.waterBlade, 'マージ後の PAL に waterBlade が無い').toBeTruthy();
    expect(PROJECTILE_SPRITE.waterBlade, 'PROJECTILE_SPRITE に waterBlade が無い').toBe('waterBlade');
  });

  test('⑤ 潜行中の敵は接触ダメージを与えない（浮上中は与える）', () => {
    // checkEnemyContact 単体（DOM 不要）。プレイヤーと敵を同一セルに重ねる。
    const calls = [];
    const enemy = { id: 'e1', type: TILE.LURK_SHARK, x: 5, y: 5, hidden: true };
    const ai = createEnemyAi({
      getPlayer:  () => ({ x: 5, y: 5 }),
      getEnemies: () => [enemy],
      takeDamage: (amt) => calls.push(amt),
    });
    ai.checkEnemyContact();
    expect(calls, '潜行中は重なってもダメージなし').toEqual([]);
    enemy.hidden = false;
    ai.checkEnemyContact();
    expect(calls.length, '浮上中は接触ダメージが入る').toBe(1);
    expect(calls[0], '潜み鮫の atk が入る').toBe(ENEMY_META[TILE.LURK_SHARK].atk);
  });

  test('③ 潜行↔浮上の周期が論理時間どおり（潜行2.0s→浮上1.2s→潜行）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(SHARK_URL);
    await waitForBoard(page);

    // ⚠ 計測は1回の evaluate 内で完結させる。ゲームループ（setInterval）も gameTime を
    // 進めるので、await をまたいで tick を数えると実時間ぶんの tick が混ざって数がずれる。
    // ∴「連続 step して状態が切り替わった tick 番号」を1回のループで拾う。
    const flips = await page.evaluate(() => {
      const at = [];
      let prev = window.__game.getEnemies().find(x => x.type === '<')?.hidden;
      const first = prev;
      for (let i = 1; i <= 45; i++) {
        window.__game.step(1);
        const cur = window.__game.getEnemies().find(x => x.type === '<')?.hidden;
        if (cur !== prev) { at.push({ tick: i, hidden: cur }); prev = cur; }
      }
      return { first, at };
    });

    // 登場時は潜行＝水中から現れる
    expect(flips.first, '登場時は潜行').toBe(true);
    // 潜行 2000ms / 浮上 1200ms・TICK_MS=120 ∴ 潜行は 17 tick 続き 18 tick 目で浮上、
    // 浮上は 10 tick 続き 28 tick 目で再潜行（2000/120=16.7→17・1200/120=10）。
    expect(flips.at.length, '1周期ぶんの切り替わりが観測できない').toBeGreaterThanOrEqual(2);
    expect(flips.at[0], '2.0s 経過で浮上').toEqual({ tick: 18, hidden: false });
    expect(flips.at[1], '1.2s 経過で再潜行').toEqual({ tick: 28, hidden: true });

    // 陸へは上がれない（水プール rows4-6 の中に留まる）
    const shark = await page.evaluate(() => window.__game.getEnemies().find(x => x.type === '<'));
    expect(shark.y, '鮫が陸へ上がった').toBeGreaterThanOrEqual(4);
    expect(shark.y).toBeLessThanOrEqual(6);
    expect(errors).toEqual([]);
  });

  test('④ 潜行中は攻撃が通らない・浮上中は通る（リズム戦闘）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(SHARK_URL);
    await waitForBoard(page);

    // 潜行中（1 tick 目）に剣ダメージ → 0（無敵）
    const submergedLoss = await page.evaluate(() => {
      window.__game.step(1);
      const e = window.__game.getEnemies().find(x => x.type === '<');
      const before = e.hp;
      window.__game.dealDamage(e.id, 5, 'sword');
      const after = window.__game.getEnemies().find(x => x.type === '<').hp;
      return { hidden: e.hidden, loss: before - after };
    });
    expect(submergedLoss.hidden, '前提：潜行中').toBe(true);
    expect(submergedLoss.loss, '潜行中は無敵＝ダメージ0').toBe(0);

    // 浮上まで進めて（合計 18 tick）同じ攻撃 → 通る
    const surfacedLoss = await page.evaluate(() => {
      for (let i = 0; i < 17; i++) window.__game.step(1);
      const e = window.__game.getEnemies().find(x => x.type === '<');
      const before = e.hp;
      window.__game.dealDamage(e.id, 5, 'sword');
      const after = window.__game.getEnemies().find(x => x.type === '<')?.hp ?? 0;
      return { hidden: e.hidden, loss: before - after };
    });
    expect(surfacedLoss.hidden, '前提：浮上中').toBe(false);
    expect(surfacedLoss.loss, '浮上中はダメージが通る').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('⑥ 潜行中は攻撃しない・浮上中だけ噛みつく', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(SHARK_URL);
    await waitForBoard(page);

    // 1 tick ずつ進めて「敵の剣エフェクト（.sword-thrust）が増えた tick」の
    // 潜行状態を数える。エフェクト除去は setTimeout(260ms) なので同期ループ中は消えない。
    const res = await page.evaluate((n) => {
      let whileSubmerged = 0, whileSurfaced = 0;
      for (let i = 0; i < n; i++) {
        const before = document.querySelectorAll('.sword-thrust').length;
        window.__game.step(1);
        const after = document.querySelectorAll('.sword-thrust').length;
        if (after > before) {
          const e = window.__game.getEnemies().find(x => x.type === '<');
          if (e?.hidden) whileSubmerged++; else whileSurfaced++;
        }
      }
      return { whileSubmerged, whileSurfaced };
    }, 40);   // 40 tick = 潜行(1-17) → 浮上(18-27) → 潜行(28-40) の1周期を含む

    expect(res.whileSurfaced, '浮上中は噛みついてくる').toBeGreaterThan(0);
    expect(res.whileSubmerged, '潜行中に攻撃した（無敵のまま殴ってくる）').toBe(0);
    expect(errors).toEqual([]);
  });

  test('⑦ 射水魚は水弾を任意角（斜め）に撃つ', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(FISH_URL);
    await waitForBoard(page);

    const fish0 = await page.evaluate(() => window.__game.getEnemies().find(e => e.type === '/'));
    expect(fish0, '射水魚が spawn していない').toBeTruthy();
    expect(fish0.move, '射水魚インスタンスに move:water が乗っていない').toBe('water');

    // cooldown 2200ms → tick19(2280) で初弾。発射直後に観測する。
    const shot = await page.evaluate(() => {
      for (let i = 0; i < 19; i++) window.__game.step(1);
      return window.__game.getProjectiles().find(p => p.type === 'waterShot') ?? null;
    });
    expect(shot, '水弾が発射されない').toBeTruthy();
    expect(shot.owner, '敵の投擲物').toBe('enemy');
    // プレイヤー(2,7) は魚(5,4) の右上＝dx>0・dy<0 の斜め（任意角）
    expect(shot.dx, '右向き成分がない＝任意角で飛んでいない').toBeGreaterThan(0.1);
    expect(shot.dy, '上向き成分がない＝任意角で飛んでいない').toBeLessThan(-0.1);

    // 実際に斜めへ進む（x 増加・y 減少）
    const moved = await page.evaluate((id) => {
      for (let i = 0; i < 3; i++) window.__game.step(1);
      return window.__game.getProjectiles().find(p => p.id === id) ?? null;
    }, shot.id);
    if (moved) {
      expect(moved.x, '水弾が右へ進まない').toBeGreaterThan(shot.x);
      expect(moved.y, '水弾が上へ進まない').toBeLessThan(shot.y);
    }
    expect(errors).toEqual([]);
  });

  test('⑧ クールダウン前は撃たない（⑦が空振り成功でない証明）', async ({ page }) => {
    await page.goto(FISH_URL);
    await waitForBoard(page);
    // 18 tick（gameTime 2160 < cooldown 2200）＝まだ 1 発も出ていない
    const none = await page.evaluate(() => {
      for (let i = 0; i < 18; i++) window.__game.step(1);
      return window.__game.getProjectiles().filter(p => p.type === 'waterShot').length;
    });
    expect(none, 'クールダウン前に撃っている').toBe(0);
  });

  test('⑩ 潜み鮫は遠隔（水刃）も持ち、離れたプレイヤーへ撃つ（浮上中のみ）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(SHARK_FAR_URL);
    await waitForBoard(page);

    // ⚠ ③と同じ理由（ゲームループも gameTime を進める）で1回の evaluate 内で完結させる。
    // 潜行中に撃った水刃と、浮上後に撃った水刃を tick ごとに区別して記録する。
    const res = await page.evaluate(() => {
      const seen = new Set();
      let hiddenShots = 0;
      let firstSurfacedShot = null;
      let dist = 0;
      for (let i = 1; i <= 30; i++) {
        window.__game.step(1);
        const e = window.__game.getEnemies().find(x => x.type === '<');
        const player = window.__game.getPlayer();
        dist = Math.hypot(player.x - e.x, player.y - e.y);
        for (const p of window.__game.getProjectiles()) {
          if (p.type !== 'waterBlade' || seen.has(p.id)) continue;
          seen.add(p.id);
          if (e.hidden) hiddenShots++;
          else if (!firstSurfacedShot) firstSurfacedShot = p;
        }
      }
      return { hiddenShots, proj: firstSurfacedShot, dist };
    });

    // 前提＝噛みつきリーチ(1.6)の外にいる＝これが「置物問題」の状況そのもの
    expect(res.dist, '前提：噛みつきリーチの外にいる').toBeGreaterThan(1.6);
    expect(res.hiddenShots, '潜行中に遠隔を撃っている（潜行は完全な無干渉のはず）').toBe(0);
    expect(res.proj, '浮上後も水刃が飛ばない＝離れると無害な置物のまま').toBeTruthy();
    expect(res.proj.owner, '敵の投擲物').toBe('enemy');
    // プレイヤー(1,9) は鮫（rows4-6 の水プール内）より上＝上向き成分を持つ任意角
    expect(res.proj.dy, '上向き成分がない＝プレイヤーを狙っていない').toBeLessThan(-0.1);
    expect(Math.hypot(res.proj.dx, res.proj.dy), '方向ベクトルが単位長でない').toBeCloseTo(1, 3);
    expect(errors).toEqual([]);
  });

  test('⑪ minRange＝隣接時は遠隔を撃たず噛みつきに切り替わる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 岸ぎわの検証ステージ（プレイヤー(3,5)・鮫(4,5)＝距離1.0）＝噛みつきリーチ内
    await page.goto(SHARK_URL);
    await waitForBoard(page);

    const res = await page.evaluate(() => {
      let bites = 0;
      for (let i = 0; i < 40; i++) {
        const before = document.querySelectorAll('.sword-thrust').length;
        window.__game.step(1);
        if (document.querySelectorAll('.sword-thrust').length > before) bites++;
      }
      return {
        bites,
        blades: window.__game.getProjectiles().filter(p => p.type === 'waterBlade').length,
      };
    });
    expect(res.bites, '隣接しているのに噛みついてこない').toBeGreaterThan(0);
    expect(res.blades, 'minRange 内（隣接）で遠隔を撃っている').toBe(0);
    expect(errors).toEqual([]);
  });

  test('⑫ 敵スプライトはプレイヤーの左右に応じて反転する（横向き敵）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 鮫(4,5) の右にプレイヤー(4,9) を置いた検証ステージ（水プールは rows4-6/cols2-9）
    await page.goto(SHARK_EAST_URL);
    await waitForBoard(page);

    const flipOf = () => page.evaluate(() => {
      const el = document.getElementById('char-enemy-4,5');
      const cv = el?.querySelector('canvas.sprite');
      return cv ? cv.dataset.flipX : null;
    });

    // プレイヤーが右側 → 反転なし（素の絵が右向き）
    await page.evaluate(() => window.__game.step(1));
    expect(await flipOf(), 'プレイヤーが右なのに反転している').toBe('');

    // プレイヤーを鮫の左へワープさせる → 反転する
    await page.evaluate(() => {
      const p = window.__game.getPlayer();
      p.x = 1; p.y = 4;
      window.__game.step(1);
    });
    expect(await flipOf(), 'プレイヤーが左なのに反転しない').toBe('1');
    expect(errors).toEqual([]);
  });

  test('⑨ 潜み鮫・射水魚は深洋Oアーム7に配置済み・かつ必ず水上に立つ', () => {
    // 2026-07-26 の 9-6④ アーム7 で初配置。以降は「未配置」ではなく
    // 「配置されている・かつ水棲の不変条件を守っている」を守る。
    // 水は bgTiles 単一ソース（tiles に '~' は書かない）なので、水判定は bgTiles を見る。
    const placed = { [TILE.LURK_SHARK]: [], [TILE.ARCHER_FISH]: [] };
    for (const [layerName, layer] of gameLayerEntries(MAP)) {
      for (const [sk, stage] of Object.entries(layer.stages ?? {})) {
        const tiles = stage.tiles ?? [];
        for (let r = 0; r < tiles.length; r++) {
          const row = Array.isArray(tiles[r]) ? tiles[r] : String(tiles[r]).split('');
          for (let c = 0; c < row.length; c++) {
            const ch = row[c];
            if (ch !== TILE.LURK_SHARK && ch !== TILE.ARCHER_FISH) continue;
            expect(stage.bgTiles?.[`${r},${c}`] === TILE.WATER,
              `${layerName}/${sk} (${r},${c}) の '${ch}' が水上にいない（水棲敵は動けない）`).toBe(true);
            placed[ch].push(`${layerName}/${sk}`);
          }
        }
      }
    }
    expect(placed[TILE.LURK_SHARK].length, '潜み鮫が本編レイヤーに1体もいない').toBeGreaterThan(0);
    expect(placed[TILE.ARCHER_FISH].length, '射水魚が本編レイヤーに1体もいない').toBeGreaterThan(0);
    // 初配置は深洋O アーム7（field 15,8〜15,11 / 14,9〜14,11）に限る。
    const ARM = new Set(['15,8', '14,9', '15,9', '14,10', '15,10', '14,11', '15,11']
      .map(k => `field/${k}`));
    for (const [ch, keys] of Object.entries(placed)) {
      for (const key of keys) {
        expect(ARM.has(key), `'${ch}' がアーム7外の ${key} にいる（配置範囲の想定外）`).toBe(true);
      }
    }
  });
});
