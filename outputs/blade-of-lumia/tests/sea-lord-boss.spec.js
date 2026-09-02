// tests/sea-lord-boss.spec.js — Phase 9-6 深洋O ④: 海の主ミニボス（`{`・聖域の門番）
//
// 深洋O デルタ最奥 `12,19` に立つ一点物（DESIGN §19-9 / §19-11-C 1.5）。既存8ボスと
// 決定的に違うのは **倒すのでなく「認められる」** こと（ユーザー確定 2026-07-26）：
//
//   ① `dropsTriforce` / `isFinalBoss` を持たない  … 欠片8を狂わせない・エンディング誤発火なし
//   ② `yieldAt: 0.25`（新設）                     … HP が 25% 以下になった時点で戦闘終了＝合格。
//      撃破（killEnemy → 爆発 → 消滅）ではなく **戦闘終了 → 報酬授与 → 深みへ退場**。
//   ③ 報酬はデータ駆動… ∴ boss.js は「何を配るか」を知らない（銀ブーメラン専用コードを持たない）。
//      経路は2つ：(a) `stageData.bossReward` ＝その場で授与／(b) `showConditions` の
//      `trigger:'bossYielded'` ＝封印を解いて **宝箱** を出し、プレイヤーが歩いて開ける。
//      🔴 2026-08-19 ユーザー報告「銀のブーメランがいつの間にか手に入ってた／普通に宝箱が
//      出ればいい」で (b) を新設し、銀のブーメランは (b) に移した（本編 12,19 も同じ）。
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
//   ⑧ yieldAt 到達で `stageData.bossReward`（器）はその場で授与され、銀ブーメランは宝箱に移る
//   ⑧b 合格するまで宝箱は開かない（bossYielded 封印が効いている＝先に報酬を取れない）
//   ⑧c 合格後に宝箱を開けると銀のブーメランが手に入る（プレイヤーが自分で受け取る）
//   ⑨ yieldAt の授与は一度だけ（連打しても器が増えない）
//   ⑩ 通常ボス（bossReward の無い部屋）は撃破フローのまま＝yieldAt が無い敵に影響しない
//   ⑬ 終幕のメッセージが読める長さ出る＋報酬があっても見送りの台詞が出る
//   ⑬b 終幕中は入力を飲む（連打の失敗メッセージで台詞が消えない）
//   ⑪ ライブマップの本編レイヤーには **field `12,19` に1体だけ**（2026-08-19 に配置。
//      それまでは「部品のみ・未配置」を固定していたが、デルタ下半9画面の作り込みで
//      闘技場が実在した∴「未配置」から「唯一の1体＋ボス部屋設定」へ書き換えた）。
//      報酬の渡し方も本編は宝箱1本＝bossReward を持たない（持つと二重取得）
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

  // ⚠️ この本は**2度書き換わっている**。読む順に：
  //    (1) 〜2026-08: 「陸のプレイヤーを追って歩いて上がる」＝両生の証明。
  //    (2) 2026-09-01（0d-3 打ち寄せ surge の実装）: 「平時は水のセルからはみ出さず、陸へ出る道は
  //        予告つきの乗り上げ1本だけ」＝(1) を**通ってはいけない振る舞い**として裏返した。
  //    (3) 2026-09-01（0n の作り直し）: ユーザーの実プレイ報告「この位置にいればずっと攻撃が
  //        あたらず…のループで倒せてしまう」＝(2) は**斜めにずれた床を永久の安全地帯にした**
  //        （水に閉じた主は軸を合わせられない）。∴両生へ戻し、地形が決めるのは
  //        **硬直の長さ**（陸 `strandedMs` / 水 `strandedWaterMs`）だけにした。
  //        ここで測るのは (1) の「陸へ上がって追う」＋**地形別の速さ**（水は陸の倍）の実装。
  //    （旧版が触っていた `_haPhase` / `_approachMode` は hitAndAway:false ＝死んだ数値）
  test('⑥b 実 spawn の主は平時から水を出て陸を追う（速さだけが地形で変わる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const meta = ENEMY_META[TILE.SEA_LORD];
    // 水域は rows1-8 × cols6-10・配置は (4,7)（body は rows4-5 / cols7-8）
    // ∴ body の左端 x が 6 未満＝「水から陸へ出た」。
    // 速さは `resolveEnemySpeed` が**体の左上のセル**の地形で決める（GUIDE §7-12）
    // ∴同じ丸め（`toTileRow/Col` ＝ floor(v + 0.5)）で足元を再現して刻みを仕分ける。
    const run = () => page.evaluate(() => {
      // 実ループ（setInterval(step,120)）を止めてから手動 step する
      // （止めないと goto〜evaluate の wall-clock ぶん余分な tick が挟まる）。
      window.__game.pause();
      const pick = () => window.__game.getEnemies().find(e => e.type === '{');
      const start = pick();
      const out = { spawnX: start.x, minX: start.x, surges: 0, samples: [] };
      for (let i = 0; i < 60; i++) {
        window.__game.step(1);
        const cur = pick();
        if (!cur) break;
        out.minX = Math.min(out.minX, cur.x);
        out.surges = cur.surges ?? 0;
        out.samples.push({
          x: cur.x, y: cur.y, phase: cur.surgePhase ?? 'idle',
          surges: cur.surges ?? 0, land: cur.surgeLand ?? 0,
        });
      }
      window.__game.resume();
      return out;
    });
    const footWater = (s) => {
      const r = Math.floor(s.y + 0.5), c = Math.floor(s.x + 0.5);
      return r >= 1 && r <= 8 && c >= 6 && c <= 10;
    };

    // ① 斜めにずれた立ち位置（(8,2)）＝軸が合わない∴乗り上げは来ない。それでも主は
    //    **水を出て陸へ上がり**寄って来る＝(3) の核（斜めの安全地帯が無い）。
    await page.goto(previewUrl(8, 2));
    await waitForBoard(page);
    const far = await run();
    expect(far.samples.length, '主が消えた').toBeGreaterThan(0);
    expect(far.minX, '主が全く動いていない＝水の中でも寄って来ない').toBeLessThan(far.spawnX);
    expect(far.minX, '平時に水から出ていない＝斜めにずれて立てば永久に安全（0n で捨てた設計）')
      .toBeLessThan(6);
    // ② 刻みの大きさ＝足元の地形（水は陸の倍）。乗り上げが始まる前の平時だけで測る。
    const idle = far.samples.filter(s => s.phase === 'idle' && s.surges === 0);
    const stepsBy = { water: [], land: [] };
    for (let i = 1; i < idle.length; i++) {
      const d = Math.abs(idle[i].x - idle[i - 1].x) + Math.abs(idle[i].y - idle[i - 1].y);
      if (d < 1e-9) continue;                        // 塞がれて動けなかった tick は測らない
      stepsBy[footWater(idle[i - 1]) ? 'water' : 'land'].push(d);
    }
    expect(stepsBy.water.length, '水の上を歩く tick が観測できていない').toBeGreaterThan(0);
    expect(stepsBy.land.length, '陸の上を歩く tick が観測できていない＝水から出ていない')
      .toBeGreaterThan(0);
    for (const d of stepsBy.water) {
      expect(d, `水の上の刻み ${d} が speed×moveSpeed.water と違う`)
        .toBeCloseTo(meta.speed * meta.moveSpeed.water, 6);
    }
    for (const d of stepsBy.land) {
      expect(d, `陸の上の刻み ${d} が speed×moveSpeed.land と違う＝陸で鈍っていない`)
        .toBeCloseTo(meta.speed * meta.moveSpeed.land, 6);
    }

    // ③ 軸の合う立ち位置（(4,4)＝寄って来た body の面まで 2.0 セル）＝乗り上げが来る
    await page.goto(previewUrl(4, 4));
    await waitForBoard(page);
    const near = await run();
    expect(near.surges, '軸が合う位置に立っているのに乗り上げて来ない').toBeGreaterThanOrEqual(1);
    expect(near.samples.some(s => s.land > 0 && s.phase !== 'idle'),
      '乗り上げの相で体が陸へ出た tick が無い＝陸で止まる（長い窓）が起きていない').toBe(true);
    expect(errors).toEqual([]);
  });
});

// 検証ステージ 19,0 の報酬の宝箱（scripts/migrate-sea-lord-reward-chest.mjs が置く）。
// 開始位置 (4,2) から 上2タイル → 右1タイル で乗れる。
const CHEST_CELL = '2,3';

/** n タイル歩く（実エンジンの移動は半セル単位＝1タイル = movePlayer 2回）。 */
async function walkTiles(page, dir, tiles = 1) {
  await page.evaluate(({ d, n }) => {
    for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
  }, { d: dir, n: tiles });
}

/** プレイヤー位置・報酬・宝箱・メッセージのスナップショット。 */
const snapshot = (page) => page.evaluate(() => {
  const p = window.__game.getState().player;
  const st = window.__game.getStageState();
  const bar = document.getElementById('msg-bar');
  return {
    pos: { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) },
    tier: p.boomerangTier, hearts: p.maxHearts, hasBoomerang: p.hasBoomerang,
    openedChests: st.openedChests, conditionsMet: st.conditionsMet,
    msg: bar?.classList.contains('hidden') ? '' : (bar?.textContent ?? ''),
  };
});

/** 宝箱の封印が解けて演出が終わるまで待つ（終幕は async でメッセージを順に見せる）。 */
async function waitForYieldFinale(page) {
  await page.waitForFunction(
    (cell) => window.__game.getStageState().conditionsMet.includes(cell),
    CHEST_CELL, { timeout: 20000 });
  await page.waitForFunction(
    () => !window.__game.getState().bossDefeating, { timeout: 20000 });
}

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

  test('⑧ bossReward(器)はその場で授与・銀ブーメランは宝箱で渡される', async ({ page }) => {
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
    // (a) その場で授与する経路＝ハートの器
    await page.waitForFunction(
      (h) => window.__game.getState().player.maxHearts > h, before.hearts, { timeout: 15000 });
    // (b) 宝箱で渡す経路＝封印が解けて宝箱が現れる（ここでは まだ 手に入らない）
    await waitForYieldFinale(page);

    const after = await snapshot(page);
    expect(after.hearts, 'ハートの器が授与されない').toBe(before.hearts + 1);
    expect(after.conditionsMet, `合格したのに宝箱 ${CHEST_CELL} の封印が解けない`).toContain(CHEST_CELL);
    // ⚠️ ここが 2026-08-19 の修正点：合格しただけでは渡らない（歩いて宝箱を開けて受け取る）。
    expect(after.tier, '宝箱を開けていないのに銀のブーメランを持っている').toBeLessThan(1);
    expect(after.openedChests, '誰も開けていないのに宝箱が開封済み').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('⑧b 合格するまで宝箱は開かない（bossYielded 封印が効いている）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(previewUrl());
    await waitForBoard(page);

    // 戦う前に宝箱のセルへ歩いて乗る（封印中でも通行はできる＝乗れるが開かない）。
    await walkTiles(page, 'up', 2);
    await walkTiles(page, 'right', 1);

    const st = await snapshot(page);
    expect(st.pos, `宝箱 ${CHEST_CELL} のセルへ歩けない（手順が違う）`).toMatchObject({ r: 2, c: 3 });
    expect(st.openedChests, '合格前なのに宝箱が開いた＝先に銀のブーメランを持って主と戦える').toEqual([]);
    expect(st.tier, '合格前に銀のブーメランが手に入った').toBeLessThan(1);
    expect(st.msg, '封印されている案内が出ない（踏んでも無反応＝飾りの宝箱に見える）').toContain('封印');
    expect(errors).toEqual([]);
  });

  test('⑧c 合格後に宝箱を開けると銀のブーメランが手に入る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(previewUrl());
    await waitForBoard(page);

    await damageToYield(page);
    await waitForYieldFinale(page);

    // 主が退場した後、自分で歩いて開ける。
    await walkTiles(page, 'up', 2);
    await walkTiles(page, 'right', 1);

    const st = await snapshot(page);
    expect(st.pos, `宝箱 ${CHEST_CELL} へ届かない`).toMatchObject({ r: 2, c: 3 });
    expect(st.openedChests, '宝箱を踏んでも開かない').toContain(CHEST_CELL);
    expect(st.tier, '宝箱から銀のブーメランが出ない').toBe(1);
    expect(st.hasBoomerang, 'サブアイテム枠にブーメランが入っていない').toBe(true);
    expect(st.msg, '受け取ったメッセージが出ない').toContain('銀のブーメラン');
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
      (h) => window.__game.getState().player.maxHearts > h, beforeHearts, { timeout: 15000 });
    // 終幕が終わるまで待ってから数える（遅れて2個目が来ないこと）
    await page.waitForFunction(
      () => !window.__game.getEnemies().some(e => e.type === '{'), { timeout: 15000 });
    await waitForYieldFinale(page);
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

    // 撃破フロー（爆発）に落ちていないこと・報酬の道はきちんと開くこと
    await page.waitForFunction(
      () => !window.__game.getEnemies().some(e => e.type === '{'), { timeout: 15000 });
    await waitForYieldFinale(page);
    const st = await page.evaluate(() => ({
      explosions: document.querySelectorAll('.explosion').length,
      conditionsMet: window.__game.getStageState().conditionsMet,
    }));
    expect(st.explosions, '爆発演出が出た＝撃破扱いになっている').toBe(0);
    expect(st.conditionsMet, '報酬の宝箱の封印が解けていない').toContain(CHEST_CELL);
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

  test('⑬ 終幕のメッセージが読める長さ出る（見送りの台詞も出る）', async ({ page }) => {
    // 🔴 2026-08-19 ユーザー報告「いつの間にか手に入ってた」の本体はここ。
    //   ・pulse は共有バー1本＝次の pulse が前を即上書きする（ui.js msgBarEl）。
    //     旧実装は sleep(700)/sleep(900) で繋いでいた∴3000/2600ms 指定でも 1 秒未満しか出ない。
    //   ・見送りの台詞は「bossReward が空のときだけ」出していた∴報酬を持つ闘技場では
    //     一度も見られなかった（本編 field 12,19 がまさにそれ）。
    // ∴メッセージバーを 150ms 間隔でサンプリングし、各台詞が連続して何回見えるかで測る。
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(previewUrl());
    await waitForBoard(page);

    // 入場演出（startBossBattle の「⚠ 扉が閉じた！」→「海の主 が 現れた！」）は setTimeout
    // 400ms/1200ms で出る＝即ダメージを入れると終幕の1行目を入場演出が上書きしてしまう
    // （テスト固有の事情。実プレイでは入場から戦闘終了まで数十秒ある）∴出し切るまで待つ。
    await page.waitForFunction(
      () => (document.getElementById('msg-bar')?.textContent ?? '').includes('現れた'),
      null, { timeout: 5000 });
    await page.waitForFunction(
      () => document.getElementById('msg-bar')?.classList.contains('hidden'),
      null, { timeout: 6000 });

    const timeline = await page.evaluate(async () => {
      const bar = document.getElementById('msg-bar');
      const boss = window.__game.getEnemies().find(e => e.type === '{');
      window.__game.dealDamage(boss.id, Math.ceil(boss.maxHp * 0.9), 'sword');
      const runs = [];
      for (let i = 0; i < 95; i++) {
        const text = bar.classList.contains('hidden') ? '' : bar.textContent;
        if (runs.length && runs[runs.length - 1].text === text) runs[runs.length - 1].samples++;
        else runs.push({ text, samples: 1 });
        await new Promise(r => setTimeout(r, 150));
      }
      return runs;
    });

    // 1サンプル = 150ms ∴ 10 サンプル ≒ 1.5 秒。旧実装は 700/900ms = 4〜6 サンプルで消えていた。
    const held = (needle) => timeline
      .filter(run => run.text.includes(needle))
      .reduce((max, run) => Math.max(max, run.samples), 0);
    const shown = timeline.map(r => `${r.samples}×${r.text || '(空)'}`).join(' / ');

    for (const [needle, label] of [
      ['よくやった、若き剣よ', '合格の台詞'],
      ['深みへ帰っていった',   '見送りの台詞（報酬があっても出る）'],
      ['ハートの器',           '器の授与'],
      ['宝箱が 現れた',        '宝箱の出現'],
    ]) {
      expect(held(needle), `${label}「${needle}」が 1.5 秒読めない（表示: ${shown}）`)
        .toBeGreaterThanOrEqual(10);
    }
    expect(errors).toEqual([]);
  });

  test('⑬b 終幕中はキー連打を飲む（自分の操作で台詞が消えない）', async ({ page }) => {
    // 🔴 2026-08-20 ユーザー報告「よくやった、若き剣よ が表示されなかった」の実因。
    //   終幕は stopGameLoop でループを止めるが **入力ハンドラは生きていた** ∴最後の一撃の
    //   直後に攻撃/道具キーを連打すると swordAttack / useSubItem が走り、その失敗メッセージ
    //   （「サブアイテムがない！」「剣を持っていない！」「ブーメランが戻ってくる！」…）が
    //   共有バー1本の #msg-bar へ割り込んで台詞を上書きしていた（実ブラウザで再現・
    //   `.scratch/probe-yield-msgbar.mjs` で textContent の setter を乗っ取って実測）。
    // ∴ここでは「殴った直後も押し続ける人間の手」を合成キーイベントで再現する。
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(previewUrl());
    await waitForBoard(page);
    await page.waitForFunction(
      () => (document.getElementById('msg-bar')?.textContent ?? '').includes('現れた'),
      null, { timeout: 5000 });
    await page.waitForFunction(
      () => document.getElementById('msg-bar')?.classList.contains('hidden'),
      null, { timeout: 6000 });

    const timeline = await page.evaluate(async () => {
      const bar = document.getElementById('msg-bar');
      const boss = window.__game.getEnemies().find(e => e.type === '{');
      window.__game.dealDamage(boss.id, Math.ceil(boss.maxHp * 0.9), 'sword');
      const runs = [];
      const mash = (key) => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keyup',   { key, bubbles: true }));
      };
      for (let i = 0; i < 40; i++) {
        const text = bar.classList.contains('hidden') ? '' : bar.textContent;
        if (runs.length && runs[runs.length - 1].text === text) runs[runs.length - 1].samples++;
        else runs.push({ text, samples: 1 });
        mash('b');    // サブアイテム（このプレビューは所持していない＝失敗メッセージが出る）
        mash(' ');    // 攻撃キー
        await new Promise(r => setTimeout(r, 150));
      }
      return runs;
    });

    const held = (needle) => timeline
      .filter(run => run.text.includes(needle))
      .reduce((max, run) => Math.max(max, run.samples), 0);
    const shown = timeline.map(r => `${r.samples}×${r.text || '(空)'}`).join(' / ');
    expect(held('よくやった、若き剣よ'),
      `連打で合格の台詞が消される（表示: ${shown}）`).toBeGreaterThanOrEqual(10);
    // 連打の失敗メッセージが1つでも割り込んでいたら入力を飲めていない
    expect(timeline.map(r => r.text).join('|'),
      `終幕中に入力由来のメッセージが割り込んだ（表示: ${shown}）`)
      .not.toMatch(/サブアイテムがない|剣を持っていない|ブーメランが戻ってくる/);
    expect(errors).toEqual([]);
  });
});

test.describe('Phase 9-6 – 海の主（配置と外部ツール）', () => {

  test('⑪ 本編レイヤーの `{` は field 12,19 の1体だけ（報酬は宝箱で渡す）', () => {
    const found = [];
    for (const [layerName, layer] of gameLayerEntries(MAP)) {
      for (const [sk, stage] of Object.entries(layer.stages ?? {})) {
        const flat = (stage.tiles ?? [])
          .map(row => (Array.isArray(row) ? row.join('') : String(row)))
          .join('');
        const n = [...flat].filter(ch => ch === TILE.SEA_LORD).length;
        if (n) found.push(`${layerName}/${sk}×${n}`);
      }
    }
    // 聖域の門番は世界に1体（増やすと「認められる」儀式が使い回しになる）。
    expect(found, '海の主が field 12,19 の1体だけになっていない').toEqual(['field/12,19×1']);

    const arena = MAP.layers.field.stages['12,19'];
    expect(arena.isBossRoom, '12,19 が isBossRoom でない＝入場しても戦闘が始まらない').toBe(true);

    // 2026-08-19 ユーザー確定：報酬は**その場で授与しない**。淵の北の回廊に宝箱が現れ、
    // プレイヤーが歩いて開けて受け取る（「いつの間にか手に入ってた」への対処）。
    // ∴本編の闘技場に bossReward は無い（あると宝箱と二重取得になる）。
    expect(arena.bossReward, '12,19 に bossReward が残っている＝宝箱と二重取得になる').toBeUndefined();

    const CELL = '2,5';
    const [r, c] = CELL.split(',').map(Number);
    const row = arena.tiles[r];
    expect(Array.isArray(row) ? row[c] : row[c], `${CELL} が宝箱タイルでない`).toBe(TILE.CHEST);
    expect(arena.chestContents?.[CELL], `${CELL} の宝箱の中身が銀のブーメランでない`)
      .toEqual({ type: 'boomerang', boomerangTier: 1, name: '銀のブーメラン' });
    // 封印が無いと戦う前に取れる＝門番の儀式が意味を失う。
    expect(arena.showConditions?.[CELL]?.trigger, `${CELL} の宝箱に bossYielded 封印が無い`)
      .toBe('bossYielded');
    expect(arena.showConditions[CELL].message, '宝箱の出現メッセージが無い（無言で現れる）')
      .toBeTruthy();
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
