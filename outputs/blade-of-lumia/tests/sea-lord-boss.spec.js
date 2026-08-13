// tests/sea-lord-boss.spec.js — Phase 9-6 深洋O ④: 海の主ミニボス（`{`・聖域の門番）
//
// 深洋O デルタ最奥 `12,19` に立つ一点物（DESIGN §19-9 / §19-11-C 1.5）。既存8ボスと
// 決定的に違うのは **倒すのでなく「認められる」** こと（ユーザー確定 2026-07-26）：
//
//   ① `dropsTriforce` / `isFinalBoss` を持たない  … 欠片8を狂わせない・エンディング誤発火なし
//   ② `yieldAt: 0.25`（新設）                     … HP が 25% 以下になった時点で戦闘終了＝合格。
//      撃破（killEnemy → 爆発 → 消滅）ではなく **戦闘終了 → 報酬授与 → 深みへ退場**。
//   ③ 報酬はデータ駆動 `stageData.bossReward`（新設）… grantReward 形の配列を stage JSON に置く。
//      ∴ boss.js は「何を配るか」を知らない（銀ブーメラン専用コードを持たない）。
//   ④ `move:'amphibious'` + `moveSpeed:{water:1.0, land:0.5}` … クジラなので水では速く陸では鈍い。
//      これまで moveSpeed は定義だけの dead data だった（19-11-A の申し送り）＝ここで実装する。
//
// 検証ステージ = test_mechanics の `sea_lord`（19,0）。右半分（cols6-10）が bgTiles 水・
// 左半分が乾いた陸∴同じ1体で「水の速度」と「陸の速度」を比べられる。
//
// 固定する不変条件：
//   ① ENEMY_META の定義（2×2・isBoss・dropsTriforce/isFinalBoss なし・yieldAt・amphibious）
//   ② タイル定義／スプライト／パレット／向きエイリアス
//   ③ 欠片の総数は 8 のまま（`{` を置いても countTriforces が増えない）
//   ④ 両生の通行（水も陸も通れる）＝水棲/陸棲との差
//   ⑤ 地形別速度の実装（水では land の倍のペースで進む）
//   ⑥ フェーズ加速（phases.speedMultiplier）が地形倍率と併存する
//   ⑦ yieldAt 到達で戦闘終了＝敵が退場し HP バーが消え、ボス扉のロックが解ける
//   ⑧ yieldAt 到達で `stageData.bossReward` が全部授与される（銀ブーメラン＋ハートの器）
//   ⑨ yieldAt の授与は一度だけ（連打しても器が増えない）
//   ⑩ 通常ボス（bossReward の無い部屋）は撃破フローのまま＝yieldAt が無い敵に影響しない
//   ⑪ ライブマップの本編レイヤーには未配置（部品のみ・25画面配置は次タスク）
//   ⑫ check-dungeon-integrity の ALL_BOSS_TILES に `{` が入っている（ボスとして数えられる）

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';
import { countTriforces } from '../shared/triforce.js';
import { gameLayerEntries } from '../shared/layers.js';
import { createPassable } from '../game/passable.js';
import { createEnemyAi } from '../game/enemy-ai.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const INTEGRITY_SRC = readFileSync(
  fileURLToPath(new URL('../scripts/check-dungeon-integrity.mjs', import.meta.url)), 'utf8');

const GAME = '/blade-of-lumia/game/';

// 検証ステージ sea_lord（19,0）。プレイヤーは陸側（4,2）から始める。
function previewUrl(row = 4, col = 2) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey('sea_lord'),
    row: String(row), col: String(col),
    ps_weapon: '1',
  });
  return `${GAME}?${p.toString()}`;
}

// DOM 不要の passable 単体（水/陸の通行判定を素の関数で確かめる）。
function makePassable(tiles, bgTiles = {}) {
  const stageData = {
    rows: tiles.length, cols: tiles[0].length,
    tiles: tiles.map(r => r.split('')),
    bgTiles,
  };
  const ss = {
    openGates: new Set(), openedDoors: new Set(), brokenWalls: new Set(),
    cutBushes: new Set(), stonePositions: {}, doorwayStates: {},
  };
  return createPassable({
    getStageData: () => stageData,
    getPlayer:    () => ({ x: 99, y: 99 }),
    getEnemies:   () => [],
    getCurrentLayer: () => 'test', getStageKey: () => '0,0',
    getSS: () => ss,
    getDebugMode: () => false,
    toTileRow: (y) => Math.floor(y + 0.5),
    toTileCol: (x) => Math.floor(x + 0.5),
  });
}

test.describe('Phase 9-6 – 海の主（部品としての定義）', () => {

  test('① 2×2 のボスだが欠片を落とさず、yieldAt と両生移動を持つ', () => {
    const meta = ENEMY_META[TILE.SEA_LORD];
    expect(meta).toBeTruthy();
    expect(meta.isBoss).toBe(true);
    expect(meta.size).toEqual({ w: 2, h: 2 });
    // 欠片8を狂わせない・エンディングを誤発火しない
    expect(meta.dropsTriforce).toBeFalsy();
    expect(meta.isFinalBoss).toBeFalsy();
    // 「倒す」でなく「認められる」＝HP 25% で戦闘終了
    expect(meta.yieldAt).toBe(0.25);
    // 両生＝水も陸も動くが速度が違う
    expect(meta.move).toBe('amphibious');
    expect(meta.moveSpeed).toEqual({ water: 1.0, land: 0.5 });
    // 弱点なしで既存 D3 ボス（深海の海蛇 hp38/atk4/def3）より強い＝任意の腕試し
    expect(meta.weakness).toBeUndefined();
    const serpent = ENEMY_META[TILE.SEA_SERPENT];
    expect(meta.hp).toBeGreaterThan(serpent.hp);
    expect(meta.atk).toBeGreaterThanOrEqual(serpent.atk);
    expect(meta.def).toBeGreaterThanOrEqual(serpent.def);
  });

  test('② タイル定義・スプライト・パレット・向きエイリアス', () => {
    expect(TILE.SEA_LORD).toBe('{');
    expect(TILE_META[TILE.SEA_LORD]).toBeTruthy();
    expect(TILE_META[TILE.SEA_LORD].passable).toBe(true);
    expect(ENEMY_SPRITES.seaLord).toBeTruthy();
    expect(ENEMY_SPRITES.seaLord.length).toBe(2);            // 2 フレーム
    expect(ENEMY_SPRITES.seaLord[0].length).toBe(64);        // 64×64（2×2 ボス共通）
    expect(ENEMY_SPRITES.seaLord[0][0].length).toBe(64);
    expect(ENEMY_PAL.seaLord?.length).toBeGreaterThanOrEqual(8);
    for (const d of ['D', 'R', 'L', 'U']) {
      expect(ENEMY_SPRITES['seaLord' + d]).toBe(ENEMY_SPRITES.seaLord);
    }
    // フレーム間で絵が変わる（同じ配列を2回並べただけ＝アニメしない、を防ぐ）
    expect(JSON.stringify(ENEMY_SPRITES.seaLord[0]))
      .not.toBe(JSON.stringify(ENEMY_SPRITES.seaLord[1]));
  });

  test('③ 欠片の総数は 8 のまま（海の主を置いても増えない）', () => {
    expect(countTriforces(MAP)).toBe(8);
  });

  test('④ 両生は水も陸も通れる（水棲・陸棲との差）', () => {
    // (1,1) を水、(1,2) を陸にした最小ステージ
    const p = makePassable(
      ['####', '#..#', '####'],
      { '1,1': TILE.WATER },
    );
    const water = { y: 1, x: 1 }, land = { y: 1, x: 2 };
    // 両生＝両方 OK
    expect(p.isPassableForEnemy(water.y, water.x, { move: 'amphibious' })).toBe(true);
    expect(p.isPassableForEnemy(land.y,  land.x,  { move: 'amphibious' })).toBe(true);
    // 水棲＝陸に上がれない／陸棲＝水に入れない（両生の意味を対比で示す）
    expect(p.isPassableForEnemy(land.y,  land.x,  { move: 'water' })).toBe(false);
    expect(p.isPassableForEnemy(water.y, water.x, { move: 'water' })).toBe(true);
    expect(p.isPassableForEnemy(water.y, water.x, { move: 'land' })).toBe(false);
  });

  test('⑤ 地形別速度：足元が水なら moveSpeed.water・陸なら moveSpeed.land', () => {
    // DOM 不要の単体（createEnemyAi の速度解決だけを見る）。
    // これまで moveSpeed は「定義だけ」で enemy-ai が meta.speed を直接読んでいた
    // ＝両生の地形別速度は dead data だった（19-11-A の申し送り）。
    const waterCells = new Set(['3,3']);
    const ai = createEnemyAi({
      getPlayer: () => ({ x: 0, y: 0 }),
      getEnemies: () => [],
      isWaterAt: (r, c) => waterCells.has(`${r},${c}`),
      toTileRow: (y) => Math.floor(y + 0.5),
      toTileCol: (x) => Math.floor(x + 0.5),
    });
    const meta = ENEMY_META[TILE.SEA_LORD];
    const onWater = { type: TILE.SEA_LORD, x: 3, y: 3, speed: meta.speed, moveSpeed: meta.moveSpeed };
    const onLand  = { type: TILE.SEA_LORD, x: 8, y: 3, speed: meta.speed, moveSpeed: meta.moveSpeed };
    const vWater = ai.resolveEnemySpeed(onWater, meta);
    const vLand  = ai.resolveEnemySpeed(onLand,  meta);
    expect(vWater).toBeCloseTo(meta.speed * meta.moveSpeed.water, 6);
    expect(vLand).toBeCloseTo(meta.speed * meta.moveSpeed.land, 6);
    expect(vWater).toBeGreaterThan(vLand);   // クジラは水で速い
    // moveSpeed を持たない敵（既存の全敵）は e.speed そのまま＝後方互換
    const plain = { type: TILE.CHASER, x: 3, y: 3, speed: ENEMY_META[TILE.CHASER].speed };
    expect(ai.resolveEnemySpeed(plain, ENEMY_META[TILE.CHASER]))
      .toBe(ENEMY_META[TILE.CHASER].speed);
  });

  test('⑥ フェーズ加速は地形倍率と併存する（e.speed 基準で解決する）', () => {
    // boss.js checkBossPhase は `boss.speed = meta.speed * speedMultiplier` を書き込む。
    // ∴ 速度解決は meta.speed でなく e.speed を基準にしないとフェーズ加速が消える。
    const ai = createEnemyAi({
      getPlayer: () => ({ x: 0, y: 0 }),
      getEnemies: () => [],
      isWaterAt: () => true,
      toTileRow: (y) => Math.floor(y + 0.5),
      toTileCol: (x) => Math.floor(x + 0.5),
    });
    const meta = ENEMY_META[TILE.SEA_LORD];
    const mult = meta.phases[0].speedMultiplier;
    const raged = {
      type: TILE.SEA_LORD, x: 3, y: 3,
      speed: meta.speed * mult, moveSpeed: meta.moveSpeed,
    };
    expect(ai.resolveEnemySpeed(raged, meta))
      .toBeCloseTo(meta.speed * mult * meta.moveSpeed.water, 6);
  });

  test('⑥b 実 spawn の主は水にも陸にも進める（両生が実ゲームで効く）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // プレイヤーを陸の左端に置く＝主は陸へ上がってこないと届かない
    await page.goto(previewUrl(4, 2));
    await waitForBoard(page);
    const res = await page.evaluate(() => {
      // 実ループ（setInterval(step,120)）を止めてから手動 step する。
      // 止めないと goto→evaluate 間の wall-clock 経過で実ループが余分な tick を
      // 挟み、hitAndAway の approach/retreat フェーズが manual step 開始時点で揺れる。
      window.__game.pause();
      const spawnX = 7;                       // tiles の '{' は (4,7)＝水域(cols6-10)
      const start = window.__game.getEnemies().find(e => e.type === '{');
      // ⚠️ pause() は evaluate の中＝goto〜evaluate の隙間で走った実 tick は消せない。
      // その分だけ hitAndAway の _haTimer と gameTime のズレが残り、さらに接近モードは
      // Math.random()（direct 1.4 / flank 0.3 / wander 0.3）で選ばれる＝pause だけでは
      // 決定論にならない（2026-07-29 実測：フル実行6回中2回赤・単独25回は全緑）。
      // ∴ 測りたいもの（両生＝水から陸へ上がれるか）に無関係な AI のクジ引きを固定する。
      start._haPhase     = 'approach';
      start._haTimer     = Number.MAX_SAFE_INTEGER;  // 計測中に retreat へ落ちない
      start._approachMode = 'direct';                // 迂回（flank/wander）を選ばせない
      let minX = start.x;
      for (let i = 0; i < 60; i++) {
        window.__game.step(1);
        const cur = window.__game.getEnemies().find(e => e.type === '{');
        if (cur) minX = Math.min(minX, cur.x);
      }
      const now = window.__game.getEnemies().find(e => e.type === '{');
      window.__game.resume();
      return { spawnX, seenX: start.x, minX, to: now ? { x: now.x, y: now.y } : null };
    });
    expect(res.to, '主が消えた').toBeTruthy();
    expect(res.minX, '主が全く動いていない').toBeLessThan(res.spawnX);
    // 水域は cols6-10・配置は (4,7) ∴ x<6 まで来たら「水から陸へ上がった」＝両生の証明
    // （水棲 move:'water' ならここで止まる・陸棲なら水上に配置できない）
    // 最終位置ではなく「計測中に到達した最小 x」で判定する＝接触後の押し戻しや
    // 攻撃命中による retreat で戻っても「陸に上がった事実」は消えない。
    expect(res.minX, '主が水域から陸へ上がれていない').toBeLessThan(6);
    expect(errors).toEqual([]);
  });
});

// 海の主を「合格ライン」まで削る。
// 実ダメージは dmg - def（def4）なので、閾値ちょうどの値を渡すと届かない。
// 余裕を持って 90% を渡す（実ダメージ 39 → 残 HP 9/48 = 18.75% ≤ yieldAt 0.25、かつ HP は 0 超）。
async function damageToYield(page) {
  return page.evaluate(() => {
    const boss = window.__game.getEnemies().find(e => e.type === '{');
    window.__game.dealDamage(boss.id, Math.ceil(boss.maxHp * 0.9), 'sword');
    return boss.id;
  });
}

test.describe('Phase 9-6 – 海の主（yieldAt の戦闘終了と報酬）', () => {

  test('⑦ HP 25% 以下で戦闘終了＝退場・HPバー消灯・ロック解除', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(previewUrl());
    await waitForBoard(page);

    // ボス部屋なので入場でロックされる（前提の確認＝vacuous pass 防止）
    await page.waitForFunction(() => !document.getElementById('boss-hpbar')?.classList.contains('hidden'),
      { timeout: 5000 });
    expect(await page.evaluate(() => window.__game.getState().bossRoomLocked),
      '前提：ボス部屋がロックされていない').toBe(true);

    await damageToYield(page);
    // 退場はフェードアウト演出（約2秒）を経てから
    await page.waitForFunction(
      () => !window.__game.getEnemies().some(e => e.type === '{'), { timeout: 10000 });

    const st = await page.evaluate(() => ({
      hpbarHidden: document.getElementById('boss-hpbar')?.classList.contains('hidden'),
      // 爆発演出は出さない＝「倒した」ではなく「退場」
      explosions: document.querySelectorAll('.explosion').length,
      locked: window.__game.getState().bossRoomLocked,
    }));
    expect(st.hpbarHidden, 'HP バーが消えていない').toBe(true);
    expect(st.explosions, '爆発演出が出た（撃破扱いになっている）').toBe(0);
    expect(st.locked, 'ボス部屋のロックが解けていない（出られない）').toBe(false);
    // フェードが終われば DOM 要素も残らない（敵リストから外れた後もしばらく残る＝
    // フェード中の一時状態は正常。最終的に消えることを固定する）
    await page.waitForFunction(
      () => document.querySelectorAll('[id^="char-enemy-"]').length === 0, { timeout: 10000 });
    expect(errors).toEqual([]);
  });

  test('⑧ stageData.bossReward が全部授与される（銀ブーメラン＋ハートの器）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(previewUrl());
    await waitForBoard(page);

    const before = await page.evaluate(() => {
      const p = window.__game.getState().player;
      return { tier: p.boomerangTier, hearts: p.maxHearts };
    });
    expect(before.tier, '前提：銀ブーメラン未所持').toBeLessThan(1);

    await damageToYield(page);
    // 授与は1件ずつ演出を挟むので、最後の器まで待つ
    await page.waitForFunction(
      (h) => {
        const p = window.__game.getState().player;
        return p.boomerangTier >= 1 && p.maxHearts > h;
      }, before.hearts, { timeout: 10000 });
    const after = await page.evaluate(() => {
      const p = window.__game.getState().player;
      return { tier: p.boomerangTier, hearts: p.maxHearts, sub: p.hasBoomerang };
    });
    expect(after.tier, '銀のブーメランが授与されない').toBe(1);
    expect(after.sub, 'サブアイテム枠にブーメランが入っていない').toBe(true);
    expect(after.hearts, 'ハートの器が授与されない').toBe(before.hearts + 1);
    expect(errors).toEqual([]);
  });

  test('⑨ 授与は一度だけ（連打しても器が増えない）', async ({ page }) => {
    await page.goto(previewUrl());
    await waitForBoard(page);
    const beforeHearts = await page.evaluate(() => window.__game.getState().player.maxHearts);

    // 閾値到達と同じフレームで追い討ちする（_yielded / bossDefeating の二重発火防止）
    await page.evaluate(() => {
      const boss = window.__game.getEnemies().find(e => e.type === '{');
      const dmg = Math.ceil(boss.maxHp * 0.9);
      window.__game.dealDamage(boss.id, dmg, 'sword');
      window.__game.dealDamage(boss.id, dmg, 'sword');
      window.__game.dealDamage(boss.id, dmg, 'sword');
    });
    await page.waitForFunction(
      () => window.__game.getState().player.boomerangTier >= 1, { timeout: 10000 });
    // 退場完了まで待ってから数える（遅れて2個目が来ないこと）
    await page.waitForFunction(
      () => !window.__game.getEnemies().some(e => e.type === '{'), { timeout: 10000 });
    const hearts = await page.evaluate(() => window.__game.getState().player.maxHearts);
    expect(hearts, 'ハートの器が二重授与された').toBe(beforeHearts + 1);
  });

  test('⑨b 合格後の追撃では HP0 にならない（弓/ブーメラン連射で倒せてしまうバグ）', async ({ page }) => {
    // 🔴 ユーザー報告（2026-07-26）：「ブーメランと弓矢投げまくってたら普通に HP0 になった」。
    // 原因＝onBossYielded は async（await sleep を挟む）∴合格演出の最中も攻撃が届き、
    // 2発目以降は shouldBossYield が _yielded ガードで false を返して
    // `if (e.hp <= 0) killEnemy(e)` に落ちていた。**小ダメージ連打で確実に再現する。**
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(previewUrl());
    await waitForBoard(page);

    const log = await page.evaluate(() => {
      const g = window.__game;
      const id = g.getEnemies().find(e => e.type === '{').id;
      const hps = [];
      // 8 ダメージ（def4 を抜けて実4）を 30 発。素の実装なら 12 発で HP0 に達する。
      for (let i = 0; i < 30; i++) {
        const before = g.getEnemies().find(e => e.id === id);
        if (!before) break;                       // 退場したら終わり（これは正常）
        g.dealDamage(id, 8, 'arrow');
        const after = g.getEnemies().find(e => e.id === id);
        hps.push(after ? after.hp : 'gone');
      }
      return { hps, minHp: Math.min(...hps.filter(h => typeof h === 'number')) };
    });
    expect(log.minHp, `合格ラインを割った（HP 推移: ${log.hps.join(',')}）`).toBeGreaterThan(0);

    // 撃破フロー（爆発）に落ちていないこと・報酬はきちんと配られること
    await page.waitForFunction(
      () => !window.__game.getEnemies().some(e => e.type === '{'), { timeout: 10000 });
    const st = await page.evaluate(() => ({
      explosions: document.querySelectorAll('.explosion').length,
      tier: window.__game.getState().player.boomerangTier,
    }));
    expect(st.explosions, '爆発演出が出た＝撃破扱いになっている').toBe(0);
    expect(st.tier, '報酬が配られていない').toBe(1);
    expect(errors).toEqual([]);
  });

  test('⑨c 一撃で閾値を飛び越えても HP は合格ラインで止まる（HP バーが空にならない）', async ({ page }) => {
    // HP バーが 0 まで振り切れると、演出が優しくても見た目は「倒した」。
    // ∴ yieldAt ボスのダメージには床を張る（残 HP = ceil(maxHp * yieldAt)）。
    await page.goto(previewUrl());
    await waitForBoard(page);
    const res = await page.evaluate(() => {
      const g = window.__game;
      const boss = g.getEnemies().find(e => e.type === '{');
      g.dealDamage(boss.id, 9999, 'sword');       // 即死級の一撃
      const after = g.getEnemies().find(e => e.type === '{');
      return { hp: after?.hp ?? 0, maxHp: boss.maxHp };
    });
    // 海の主 hp48 / yieldAt 0.25 → 床は 12
    expect(res.hp, '即死級の一撃で HP が床を割った').toBe(Math.ceil(res.maxHp * 0.25));
  });

  test('⑩ yieldAt を持たないボスは従来の撃破フロー（HP0 まで戦う）', async ({ page }) => {
    // 氷のリヴァイアサン（melee_only_boss ステージ・L）は yieldAt 無し。
    // HP を 25% まで削っても退場しない＝yieldAt が全ボスに漏れていないことの証明。
    const p = new URLSearchParams({
      fromEditor: '1', layer: TEST_LAYER, stage: stageKey('melee_only_boss'),
      row: '7', col: '5', ps_weapon: '1',
    });
    await page.goto(`${GAME}?${p.toString()}`);
    await waitForBoard(page);
    const alive = await page.evaluate(() => {
      const boss = window.__game.getEnemies().find(e => e.type === 'L');
      if (!boss) return null;
      window.__game.dealDamage(boss.id, Math.ceil(boss.maxHp * 0.8), 'sword');
      const after = window.__game.getEnemies().find(e => e.type === 'L');
      return { present: !!after, hp: after?.hp ?? 0 };
    });
    expect(alive, '前提：melee_only_boss に L がいる').toBeTruthy();
    expect(alive.present, 'yieldAt の無いボスが 20% で退場した').toBe(true);
    expect(alive.hp).toBeGreaterThan(0);
  });
});

test.describe('Phase 9-6 – 海の主（配置と外部ツール）', () => {

  test('⑪ 本編レイヤーには未配置（部品のみ・25画面配置は次タスク）', () => {
    for (const [layerName, layer] of gameLayerEntries(MAP)) {
      for (const [sk, stage] of Object.entries(layer.stages ?? {})) {
        const flat = (stage.tiles ?? [])
          .map(row => (Array.isArray(row) ? row.join('') : String(row)))
          .join('');
        expect(flat.includes(TILE.SEA_LORD),
          `${layerName}/${sk} に未配置のはずの '{' がある`).toBe(false);
      }
    }
  });

  test('⑫ check-dungeon-integrity の ALL_BOSS_TILES に `{` が入っている', () => {
    const m = INTEGRITY_SRC.match(/const ALL_BOSS_TILES\s*=\s*new Set\(\[([^\]]*)\]/);
    expect(m, 'ALL_BOSS_TILES の宣言が見つからない').toBeTruthy();
    expect(m[1]).toContain("'{'");
    // 欠片ボスの表には入れない（欠片8を狂わせないため）
    const t = INTEGRITY_SRC.match(/const TRIFORCE_BOSS_TILES\s*=\s*new Set\(\[([^\]]*)\]/);
    expect(t[1]).not.toContain("'{'");
  });
});
