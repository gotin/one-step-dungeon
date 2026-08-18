// tests/blink-enemy.spec.js — Phase 5.5k k-8「瞬間移動」（解禁1体・#5 術士）
//
// k-8 で足したのは **meta.blink ＝敵の移動手段としての瞬間移動**（enemy-ai.js `tickBlink`）。
// これまでの敵の移動は全部「歩く/泳ぐ/飛ぶ」＝速度の話で、GUIDE §7-2 の縛り
// （敵はプレイヤーより遅い＝走れば必ず振り切れる）から出られなかった。
// 術士は **speed 0（歩かない）** かつ瞬間移動で距離をリセットする＝
// 「振り切る」ではなく「出た瞬間を叩く」遊びになる。
//
//   術士 SORCERER ('η') … `blink:{ shownMs, goneMs, castDelayMs, range, style }`
//     shown（1440ms＝12 tick）… 姿がある＝**殴れる窓**／魔弾（attack.type='magicBolt'）を撃つ窓
//     gone （720ms＝6 tick） … 消える＝**無敵**（`e.hidden`＝combat.js dealDamageToEnemy が無効化）・
//                              攻撃もしない。消えた場所に回る魔法陣が残る（`.hiding.hide-warp`）
//     出現              … プレイヤーから range(3) セル離れたカーディナルのセルへ跳ぶ →
//                              プレイヤーを向く → castDelayMs（360ms＝3 tick）の詠唱（動かない・
//                              撃たない）→ 魔弾1発。出現先は**四方からランダム**（直前の方向は除く）
//     弱点 arrow（×2）  … 消える前に弓で落とす＝サブ武器の使い所（機構は weakness.spec.js が番人）
//
// 検証ステージ＝test_mechanics[41,0] `sorcerer`
// （scripts/migrate-test-blink-arena.mjs が自己検査付きで生成。座標は `stageKey()` から引く）。
// 外周は壁だが**左右 rows 7/8 は隣のアリーナへの通路**（tests/test-arena-doors.js）∴塞がない。
// ⚠️ probe(4,5) は「四方すべてに距離 3 の内部の床がある」立ち位置＝⑧（出現先）の土台。
//    ここを動かすと「ランダムに選ばれた」のか「壁で1つ飛ばされた」のか区別できなくなる
//    （migrate スクリプトが4方位の床を検査している＝幾何の歯はそちら側にもある）。
//
// tick 換算（TICK_MS=120・step() が論理時間を 120ms 進める・tick i の now = 120×i）。
// 実測（置いて待つだけ＝実プレイの形／.scratch の計測で確認した値）：
//   t 1 now  120 … shown（置いた場所 (4,9)・blinkUntil 1560）
//   t10 now 1200 … 置いた場所から魔弾1発（クールダウン 1200 の初期値 0 ∴ここが1発目）
//   t13 now 1560 … gone（hidden=true・`.hiding hide-warp`・blinkUntil 2280）
//   t19 now 2280 … 出現①＝プレイヤー(4,5)から3セルの四方のどれか・プレイヤーを向く・
//                  freezeUntil 2640。⚠️ **どの方向に出るかは毎回ランダム**（下記）
//   t22 now 2640 … 詠唱明け＝魔弾1発（出現から3 tick 後）
//   t31/ t37     … gone → 出現②（以降 18 tick 周期＝shown 12 + gone 6）
//   t49/ t55 …    … 以下同様。**時刻は決定的・場所だけが確率的**
//
// ⚠️ 出現先は 2026-08-18 のユーザー指摘で**固定巡回（北→東→南→西）からランダムへ変更**した
//    （「四つのうちどれかをランダムにしないと簡単すぎる」＝次の出現位置が読めると
//     プレイヤーは出る前から狙って待てる）。直前と同じ方向だけは候補から外す＝毎回3択。
//    ∴⑧は「出現セルの列」を固定できない＝**性質**で書く（四方のどれか／距離が range／
//    プレイヤーを向く／同じ方向が連続しない／十分な回数で四方すべて出る／
//    ある方向の次に来る方向が1通りではない＝固定巡回に戻すと赤）。
//
// ⚠ 計測は1回の evaluate 内で完結させ、冒頭で pause() する。実時間ループは
//   `gotoFrozen()` でそもそも起動させない（k-3〜k-7 spec と同じ理由＝animFrame や
//   setInterval が混ざると tick 境界が揺れる）。
// ⚠ プレビュー（fromEditor=1）は debugMode:true ＝ takeDamage が早期 return する。
//   この spec は**敵の hp** と**投擲物の本数**しか見ない（プレイヤーの HP は見ない）∴
//   'g' で debug を切る必要が無い＝魔弾がプレイヤーに当たってもノイズにならない。
// ⚠ 魔弾は `magicBolt` 型＝**挙動は `stone` と同じ**（任意角・盾で防げる・壁で消える。
//   enemy-ai.js の分岐も stone と同居＝1行も分けていない）で、**絵とパレットだけ**藍＋金
//   （k-8c。それまでは stone 流用＝金の宝珠から灰色の石が出ていた）。経路そのものの番人は
//   tests/*projectile*.spec.js 側∴ここでは「型と絵」（⑭⑮）と「出る／出ない tick」だけを固定する。
// ⚠ k-8a 時点のスプライトは既存絵（センチネル）のエイリアス＋術士パレット
//   （GUIDE §2「機構が先・絵は後」）∴絵の中身は主張せず、名前解決と
//   「床に沈まない色であること」だけを押さえる。実描き（32×32）は k-8b の担当。
//
// ── 歯の実測（2026-08-18・機構を1つずつ壊して**実際に**赤くなった本を書いた）──────
//   enemy-ai.js tickBlink を丸ごと無効化（`const cfg = null`）………… ⑤⑥⑧⑨⑩⑪⑫
//   tickBlink の gone で `setEnemyHidden(e, true, style)` を落とす ……… ⑤⑥⑪
//   出現時の `e._freezeUntil = now + castDelayMs` を落とす …………………… ⑨⑩
//   pickBlinkCell を固定巡回に戻す（乱数を消して出現回数で回す）………………… ⑧
//   pickBlinkCell の候補を1方向だけにする（＝毎回同じセルに出る）……………… ⑧⑫
//   pickBlinkCell の「直前の方向を除く」を外す（＝同じ方向が連続し得る）……… ⑧
//     ⚠️ この破壊は**確率的にしか赤くならない**（連続が1回も出ない引きもある）＝
//        30 回で少なくとも1回連続する確率 ≒ 1−(3/4)^29 ≒ 99.98%（実測でも赤）。
//   pickBlinkCell の距離を `cfg.range` から 1 に変える ……………………… ⑧⑨⑩
//   ENEMY_META の speed を 0 から NORMAL に上げる ……………………………… ①⑨⑫
//   ENEMY_META の blink.range を 3 から 5 に変える ……………………………… ④⑧⑫
//   HIDE_STYLES から 'warp' を外す …………………………………………………… ⑪
//   ENEMY_PAL.sorcerer を暗い藍だけにする（床に沈む色）………………………… ②
//   editor-palette.js から TILE.SORCERER を外す ………………………………… ③
// ── 歯の実測（2026-08-18・k-8c 魔弾の絵の分）──────────────────────────────
//   ENEMY_META の attack.type を 'magicBolt' → 'stone' に戻す ……………… ①⑭⑮
//   ITEM_SPRITES.magicBolt を消す（絵の登録漏れ＝透明な弾）………………… ⑭⑮
//   enemy-ai.js で type を捨てて 'stone' をハードコードして撃つ ………… ⑮
//   ITEM_PAL.magicBolt を stone と同じ灰にする ………………………………… ⑭
//     ⚠️ ⑮は赤にならない＝⑮は「描かれたドットの色」を ITEM_PAL.magicBolt から引く∴
//        パレットごと差し替えると自己一貫して緑になる（色の**中身**の番人は⑭側＝
//        パレット＝ENEMY_PAL.sorcerer・金＝魔法陣の色）。
//   ITEM_PAL.stone を藍＋金に塗り替えて代用する ………………………………… ⑭
//   enemy-ai.js の分岐から `|| atk.type === 'magicBolt'` を外す ………… ⑦⑨⑩⑮
// ── 壊しても**赤くならなかった**もの（＝保険の行。歯があるふりをしない）──────────
//   tickBlink の gone の戻り値を true→false（行動ゲートの専有をやめる）… 赤 0
//   enemyTick の `&& !blinking` を外す ………………………………………………… 赤 0
//     どちらも「消えている間に攻撃される」は enemyTick 側の
//     `if (!e.hidden) enemyAttack(e, meta)` が独立に止めており、speed 0 で歩けもしない
//     ∴今の術士では観測差が出ない（他の機構と組んだ敵のための二重の守り）。
//   出現時の `e._attackTimes = {}` を落とす ………………………………………… 赤 0
//     今の数値（cooldown 1200・周期 18 tick）だと自然なクールダウンが偶然
//     同じ tick に落ちる∴差が出ない。cooldown を伸ばしたときの保険。
// ※ CSS（`.hide-warp::after` の魔法陣の見た目・@keyframes）は⑪がクラスまでしか見ない
//    ＝絵そのものは目視の担当（GUIDE §2）。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { ENEMY_META, ENEMY_SPEED_FAST, PROJECTILE_SPRITE } from '../shared/enemies.js';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';
import { ITEM_SPRITES, ITEM_PAL } from '../shared/sprites-items.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { TICK_MS } from '../game/constants.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { isArenaDoor, arenaDoorCells, ARENA_DOOR_ROWS } from './test-arena-doors.js';

const GAME   = '/blade-of-lumia/game/';
const EDITOR = '/blade-of-lumia/editor/';

function previewUrl(stage, row, col, extra) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col),
    ps_weapon: '1',
    ...(extra ?? {}),
  });
  return `${GAME}?${p.toString()}`;
}

// 敵は (4,9)＝x9,y4。probe は (4,5)＝同じ行・dist 4.0（魔弾の射程 2.0〜6.5 の内側）。
const SORC = (extra) => previewUrl('sorcerer', 4, 5, extra);

// 実時間ループ（game.js startGameLoop = setInterval(() => step(1), TICK_MS)）を
// ページ評価の**前に**無効化する（k-3〜k-7 spec と同じ仕掛け）。
const frozen = new WeakSet();
async function gotoFrozen(page, url) {
  if (!frozen.has(page)) {
    await page.addInitScript(() => {
      const native = window.setInterval;
      window.__loopBlocked = 0;
      window.setInterval = function (fn, ms, ...rest) {
        if (/step\s*\(\s*1\s*\)/.test(String(fn))) { window.__loopBlocked++; return 0; }
        return native.call(window, fn, ms, ...rest);
      };
    });
    frozen.add(page);
  }
  await page.goto(url);
  await waitForBoard(page);
  expect(await page.evaluate(() => window.__loopBlocked),
    '実時間ループの差し込み阻止が効いていない（game.js startGameLoop の形が変わった？）')
    .toBeGreaterThan(0);
}

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// 石床の相対輝度（shared/sprites-tiles.js stoneFloor＝明部 #3a3848=57.6）。
// 敵の色がこれ以下だと床に沈んで輪郭が見えない（k-4〜k-6 で実際に起きた欠陥）。
const FLOOR_LUM = 57.6;
const lumOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
const threatOf = (m) => (m.hp * m.atk) / (m.def + 1);
const M = () => ENEMY_META[TILE.SORCERER];

// 2フレーム間で色番号が違うセルの数（SPRITE-PIPELINE.md §6 の「差分ドット」の数え方）。
const dots = (a, b) => {
  let n = 0;
  for (let y = 0; y < a.length; y++) for (let x = 0; x < a[y].length; x++) if (a[y][x] !== b[y][x]) n++;
  return n;
};

// 消える演出（`.hide-warp` の魔法陣）の輪の色＝CSS が単一の真実。
// ②が「絵の金＝この色」を固定する＝どちらか片方だけ変えると赤（k-8b 合格条件2）。
const WARP_GOLD = (() => {
  const css = readFileSync(fileURLToPath(new URL('../game/css/board.css', import.meta.url)), 'utf8');
  const block = css.match(/\.char-abs\.hiding\.hide-warp::after\s*\{[^}]*\}/)?.[0] ?? '';
  const m = block.match(/border:[^;]*rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) throw new Error('board.css の .hide-warp::after から魔法陣の輪の色を読めない');
  return '#' + [1, 2, 3].map(i => Number(m[i]).toString(16).padStart(2, '0')).join('');
})();

// 実測した拍（上のヘッダの表と同じ値。テスト本文で使う tick）。
const T_FIRST_SHOT = 10;   // 置いた場所からの1発目
const T_GONE_1     = 13;   // 最初に消える tick
const T_APPEAR_1   = 19;   // 最初の出現
// ⑧で数える出現回数。出現先はランダム（直前の方向を除いた3択）∴「四方すべて出る」を
// 見るには回数が要る＝30 回なら1方向が一度も出ない確率は 4×(2/3)^29 ≒ 3e-5（flaky にしない）。
const APPEARS      = 30;
const T_SHOT_1     = 22;   // 出現①の魔弾（詠唱 3 tick 後）
const CYCLE        = 18;   // shown 12 + gone 6

test.describe('Phase 5.5k k-8 – 瞬間移動（術士）', () => {

  test('① 術士の定義（記号タイル・非ボス・歩かない・拍と射程の整合・弱点）', () => {
    expect(TILE.SORCERER, 'TILE.SORCERER が未定義').toBe('η');
    const m = M();
    expect(m, "ENEMY_META['η'] が無い").toBeTruthy();
    expect(m.name, '術士の名前').toBe('術士');
    expect(m.isBoss, '術士は通常敵').toBeFalsy();
    // 通常敵の最強格＝剣獣（脅威度 10）を超えない
    expect(threatOf(m), '術士の脅威度が剣獣（10）以上＝通常敵の最強格を追い越している')
      .toBeLessThan(threatOf(ENEMY_META[TILE.SWORD_BEAST]));
    // ★ 歩かない＝移動手段は瞬間移動だけ。歩く敵にすると「ワープする追跡者」になり
    //   GUIDE §7-2（走れば振り切れる）の逃げ道が消える。
    expect(m.speed, '術士が歩く（speed>0）＝瞬間移動が「ワープする追跡者」になる').toBe(0);
    expect(m.speed, 'GUIDE §7-2＝敵はプレイヤー（速度換算 1.0）より速くない')
      .toBeLessThan(ENEMY_SPEED_FAST);
    expect(m.directional, '術士は向き別スプライトを持たない（1枚＝k-8b で描く）').toBeFalsy();
    expect(m.guards, '術士はガードしない（消えることが防御＝k-4 の機構は持たせない）').toBeFalsy();

    // blink の数値＝拍。tick の整数倍でないと観測 tick が揺れる。
    const b = m.blink;
    expect(b, '術士に blink が無い＝瞬間移動の機構を持っていない').toBeTruthy();
    for (const k of ['shownMs', 'goneMs', 'castDelayMs']) {
      expect(b[k], `blink.${k} が無い`).toBeGreaterThan(0);
      expect(b[k] % TICK_MS, `blink.${k}=${b[k]} が tick の整数倍でない`).toBe(0);
    }
    expect(b.style, '消えている間の見た目の種別（CSS の .hide-warp）が無い').toBe('warp');
    // 詠唱は「姿のある窓」に収まる＝出現しても一度も撃たない、が起きない
    expect(b.castDelayMs, '詠唱が姿のある窓より長い＝撃つ前に消える').toBeLessThan(b.shownMs);
    // 殴れる窓（shown）は消えている窓（gone）より長い＝「待てば必ず殴れる」側に寄せる
    expect(b.shownMs, '消えている時間が姿のある時間以上＝殴る窓が細くて理不尽になる')
      .toBeGreaterThan(b.goneMs);

    // 魔弾＝stone 型（任意角の投擲物・盾で防げる）。出現距離が射程の内側にあること。
    const a = m.attack;
    // 型は magicBolt（挙動は stone と同じ＝enemy-ai.js の分岐を共有）。絵の中身は⑭が見る。
    expect(a.type, '魔弾が magicBolt 型でない＝盾で防げる遠隔攻撃の経路から外れている').toBe('magicBolt');
    expect(a.cooldown % TICK_MS, 'attack.cooldown が tick の整数倍でない').toBe(0);
    expect(b.range, '出現距離が魔弾の最短射程より近い＝出現しても撃たない回が出る')
      .toBeGreaterThanOrEqual(a.minRange);
    expect(b.range, '出現距離が魔弾の射程より遠い＝出現しても届かない')
      .toBeLessThanOrEqual(a.range);
    // ★ 出現距離は剣の間合い（1.5）の外＝「出た瞬間にタダで殴られる」位置には出ない
    expect(b.range, '出現距離が剣の間合い（1.5）以内＝出た瞬間に殴られて機構が成立しない')
      .toBeGreaterThan(1.5);
    // ★ 1回の出現で撃つのは1発だけ＝拍が読める（詠唱 + クールダウン > 姿のある窓）
    expect(b.castDelayMs + a.cooldown,
      '詠唱+クールダウンが姿のある窓に収まる＝1回の出現で2発以上撃つ（拍が読めない）')
      .toBeGreaterThan(b.shownMs);

    // 弱点 arrow＝「消える前に弓で落とす」遊び（倍率の機構は weakness.spec.js が番人）
    expect(m.weakness?.type, '術士の弱点が弓でない＝サブ武器の使い所が無い').toBe('arrow');
    expect(m.weakness.multiplier, '弱点の倍率が等倍以下').toBeGreaterThan(1);

    // 機構の取り違え防止（隠れ・跳躍・甲羅とは別の機構）
    expect(m.hide, '術士に meta.hide がある＝隠れ（潜行）と機構が混ざっている').toBeUndefined();
    expect(m.leap, '術士に meta.leap がある＝跳躍と機構が混ざっている').toBeUndefined();
  });

  test('② タイル定義・実スプライト（32×32・詠唱ポーズ付き）とパレット（床に沈まない・転移と同じ金）', () => {
    const m = M();
    expect(TILE_META[TILE.SORCERER], "TILE_META['η'] が無い＝エディタに出ない").toBeTruthy();
    expect(TILE_META[TILE.SORCERER].label, '術士のラベル').toBe('術士');
    expect(TILE_META[TILE.SORCERER].passable, '敵タイルは通行可（下は床）').toBe(true);
    expect(m.sprite, '術士のスプライト名').toBe('sorcerer');
    expect(m.pal, '術士のパレット名').toBe('sorcerer');
    expect(ENEMY_SPRITES[m.sprite], 'sorcerer スプライトが無い＝盤面で絵が消える').toBeTruthy();
    // ★ k-8b で実絵に差し替えた（k-8a はセンチネル 16×12 のエイリアス）∴寸法を主張する。
    //   32×32＝他の陸上敵と同じ土台（SPRITE-PIPELINE.md §6）。ここが崩れると盤面で
    //   拡大率が変わり「1体だけ小さい敵」になる。
    const palLen = ENEMY_PAL[m.pal]?.length ?? 0;
    const idle = ENEMY_SPRITES[m.sprite];
    const cast = ENEMY_SPRITES[`${m.sprite}Cast`];
    expect(idle.length, '待機が2フレームでない＝宝珠の脈動が消える').toBe(2);
    // ★ 詠唱ポーズ＝enemy-ai.js syncCastSprite が差し替える名前（leapSpiderWindup と同じ作法）。
    //   これが無いと詠唱の3 tick が絵に出ない＝「殴れる窓」が読めない（GUIDE §6-1）。
    expect(cast, `${m.sprite}Cast が無い＝詠唱の窓が絵に出ない`).toBeTruthy();
    expect(cast.length, '詠唱は単一フレーム（アニメーションしない姿）').toBe(1);
    for (const [label, frames] of [['sorcerer', idle], ['sorcererCast', cast]]) {
      for (const frame of frames) {
        expect(frame.length, `${label} の行数が 32 でない`).toBe(32);
        for (const row of frame) {
          expect(row.length, `${label} の列数が 32 でない`).toBe(32);
          for (const ch of row) {
            expect(parseInt(ch, 16), `${label} がパレットの範囲外の色番号 '${ch}' を指している`)
              .toBeLessThan(palLen);
          }
        }
      }
    }
    // ★ フレーム差＝§6 の下限（歩行/脈動 17ドット・ポーズ 48ドット）。下回ると
    //   1セル≒1.5画面px で潰れて「動いていない絵」になる（k-7b で実測した閾値）。
    expect(dots(idle[0], idle[1]), '待機2枚の差が 17ドット未満＝宝珠の脈動が実機で見えない')
      .toBeGreaterThanOrEqual(17);
    expect(dots(idle[0], cast[0]), '詠唱と待機の差が 48ドット未満＝ポーズの違いが読めない')
      .toBeGreaterThanOrEqual(48);
    expect(ENEMY_PAL[m.pal], 'sorcerer パレットが無い').toBeTruthy();
    expect(ENEMY_PAL[m.pal][0], 'index0 は透明').toBe('transparent');
    // ⚠ 縁色以外は石床（明部 57.6）より明るいこと＝暗い床に沈むと「居ることに気づけない」
    //   （k-4〜k-6 で実際に起きた欠陥）。縁の1色だけは暗くてよい＝輪郭が締まる。
    const dark = ENEMY_PAL[m.pal].slice(1).filter(c => lumOf(c) <= FLOOR_LUM);
    expect(dark.length, `sorcerer パレットの暗い色が多すぎる（${dark.join(' ')}）＝床に沈む`)
      .toBeLessThanOrEqual(1);
    // ★ k-8b 合格条件2＝「消える演出と同じ色系統」。金は CSS `.hide-warp` の輪と**同じ色**で、
    //   絵の中で面として見える量（1セル≒1.5画面px ∴数セルでは実機で消える）だけ使う。
    const goldIdx = ENEMY_PAL[m.pal].indexOf(WARP_GOLD);
    expect(goldIdx, `sorcerer パレットに魔法陣の金（${WARP_GOLD}）が無い`
      + '＝消える演出と絵の色系統が揃っていない（転移する敵だと読めない）').toBeGreaterThan(0);
    for (const [label, frame] of [['待機1', idle[0]], ['待機2', idle[1]], ['詠唱', cast[0]]]) {
      const n = frame.flat().filter(v => Number(v) === goldIdx).length;
      expect(n, `${label} の金が ${n} セル＝実機（1セル≒1.5px）で消える量`).toBeGreaterThanOrEqual(20);
    }
    // タイル→スプライトは shared/tile-sprites.js が単一の真実（エディタとゲームで分けない）
    expect(TILE_SPRITE_MAP[TILE.SORCERER], 'スプライトマップが無い（描画で消える）').toBeTruthy();
    expect(TILE_SPRITE_MAP[TILE.SORCERER].spr, 'スプライトマップの spr がメタと食い違う').toBe(m.sprite);
    expect(TILE_SPRITE_MAP[TILE.SORCERER].pal, 'スプライトマップの pal がメタと食い違う').toBe(m.pal);
  });

  test('③ エディタのパレットに術士が並ぶ（置けない敵は死蔵になる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(EDITOR);
    // ⚠ パレットは初期状態でパネルが畳まれていて visible にならない（DOM には在る）∴'attached'。
    await page.waitForSelector('#tile-palette .tile-btn', { state: 'attached' });
    const btn = page.locator('#tile-palette .tile-btn[title="術士"]');
    await expect(btn, "術士（'η'）がパレットに無い＝エディタで配置できない").toHaveCount(1);
    await expect(btn.locator('canvas'), '術士がスプライトで描かれていない').toHaveCount(1);
    expect(errors, 'エディタで pageerror').toEqual([]);
  });

  // ライブマップは手編集できる＝検証ステージの幾何は黙って変わる（GUIDE §4-3）。
  test('④ 検証ステージの幾何が前提どおり（外周＋通路・遮蔽ゼロ・敵(4,9) left・四方に出現先）', () => {
    const sd = MAP.layers[TEST_LAYER]?.stages?.[stageKey('sorcerer')];
    expect(sd, 'sorcerer のステージが無い').toBeTruthy();
    const grid = (sd.tiles ?? []).map(r => (Array.isArray(r) ? r : String(r).split('')));
    expect(grid.length, 'rows が 10 でない').toBe(10);
    const enemyCells = [];
    for (let r = 0; r < grid.length; r++) {
      expect(grid[r].length, `row ${r} の cols が 12 でない`).toBe(12);
      for (let c = 0; c < grid[r].length; c++) {
        const t = grid[r][c];
        const onEdge = r === 0 || r === grid.length - 1 || c === 0 || c === grid[r].length - 1;
        if (onEdge) {
          if (isArenaDoor(r, c, grid[r].length)) {
            expect(t, `通路 (${r},${c}) が塞がれている＝隣のアリーナへ歩いて行けない`).toBe(TILE.FLOOR);
          } else {
            expect(t, `外周 (${r},${c}) が壁でない（通路は rows ${ARENA_DOOR_ROWS.join('/')} だけ）`)
              .toBe(TILE.WALL);
          }
        } else if (t === TILE.SORCERER) {
          enemyCells.push(`${r},${c}`);
        } else {
          expect(t, `内部 (${r},${c}) が素の床でない＝宣言していない遮蔽がある`).toBe(TILE.FLOOR);
        }
      }
    }
    expect(enemyCells, '敵は (4,9) に1体だけ').toEqual(['4,9']);
    expect(sd.enemyDirs, '置かれた向きが left でない').toEqual({ '4,9': 'left' });
    // 通路は「歩いて隣へ行ける」ことが目的＝1つ内側も床（game.js arrivalIsWall）
    for (const [r, c] of arenaDoorCells(grid[0].length)) {
      const inner = c === 0 ? 1 : grid[0].length - 2;
      expect(grid[r][inner], `通路 (${r},${c}) の内側 (${r},${inner}) が床でない＝通れない`).toBe(TILE.FLOOR);
    }
    // ★ probe(4,5) の四方・距離 blink.range のセルがすべて内部の床
    //   ＝⑧（四方のランダム）が地形で潰れない土台。1つでも壁だと
    //   「ランダムに選ばれた」のか「壁で飛ばされた」のか区別できなくなる
    //   （＝「四方すべてが出る」assert が地形のせいで永久に赤になる）。
    const d = M().blink.range;
    for (const [dr, dc, label] of [[-1, 0, '北'], [0, 1, '東'], [1, 0, '南'], [0, -1, '西']]) {
      const r = 4 + dr * d, c = 5 + dc * d;
      expect(grid[r]?.[c], `probe(4,5) の${label}側 距離 ${d} のセル(${r},${c}) が床でない＝出現先が潰れる`)
        .toBe(TILE.FLOOR);
    }
  });

  test('⑤ 拍＝姿がある 12 tick → 消える 6 tick の周期（blinkPhase が数値どおり動く）', async ({ page }) => {
    await gotoFrozen(page, SORC());
    const res = await page.evaluate((a) => {
      const g = window.__game;
      g.pause();
      const out = { t0: g.getState().gameTime, rows: [] };
      for (let i = 1; i <= a.span; i++) {
        g.step(1);
        const e = g.getEnemies()[0];
        out.rows.push({ i, now: g.getState().gameTime, phase: e.blinkPhase, until: e.blinkUntil, hidden: e.hidden });
      }
      return out;
    }, { span: CYCLE * 2 + 2 });
    expect(res.t0, 'pause 前に論理時間が進んでいる（実時間ループが動いている）').toBe(0);
    const at = (i) => res.rows[i - 1];
    // 置いた直後は「姿がある」＝プレイヤーが最初に見るのは術士そのもの（tickHide と逆）
    expect(at(1).phase, 't1 は姿がある（shown）で始まる').toBe('shown');
    expect(at(1).hidden, 't1 に消えている＝置いた瞬間から無敵').toBe(false);
    expect(at(1).until, 't1 の shown が切れる論理時刻＝120 + shownMs').toBe(TICK_MS + M().blink.shownMs);
    // shown の最後の tick までは姿がある（12 tick）
    expect(at(T_GONE_1 - 1).phase, `t${T_GONE_1 - 1} で既に消えている＝姿のある窓が短い`).toBe('shown');
    // 消える tick
    expect(at(T_GONE_1).phase, `t${T_GONE_1} で消えていない＝shownMs を過ぎても居座る`).toBe('gone');
    expect(at(T_GONE_1).hidden, '消えているのに hidden が立っていない＝無敵にならない').toBe(true);
    expect(at(T_GONE_1).until, '消える窓が切れる論理時刻＝1560 + goneMs')
      .toBe(TICK_MS * T_GONE_1 + M().blink.goneMs);
    // 消えている間（6 tick）はずっと gone
    for (let i = T_GONE_1; i < T_APPEAR_1; i++) {
      expect(at(i).phase, `t${i} が gone でない＝消えている窓が揺れている`).toBe('gone');
    }
    // 出現の tick
    expect(at(T_APPEAR_1).phase, `t${T_APPEAR_1} で出現していない＝goneMs を過ぎても消えたまま`).toBe('shown');
    expect(at(T_APPEAR_1).hidden, '出現したのに hidden が残っている＝ずっと無敵').toBe(false);
    // 2周目も同じ周期（18 tick）で回る＝拍が読める
    expect(at(T_GONE_1 + CYCLE).phase, `t${T_GONE_1 + CYCLE}（2周目）で消えていない＝周期が揺れた`).toBe('gone');
    expect(at(T_APPEAR_1 + CYCLE).phase, `t${T_APPEAR_1 + CYCLE}（2周目）で出現していない＝周期が揺れた`).toBe('shown');
  });

  test('⑥ 消えている間は無敵・姿がある間は剣が通る（殴れる窓＝shown だけ）', async ({ page }) => {
    await gotoFrozen(page, SORC());
    const res = await page.evaluate((a) => {
      const g = window.__game;
      g.pause();
      const out = {};
      const hit = (label) => {
        const e = g.getEnemies()[0];
        // ⚠ `getState().player` は**コピー**（getEnemies() と同じ観測用スナップショット）∴
        //   そちらを書き換えても本体は動かない。立ち位置を変えるときは getPlayer()。
        const p = g.getPlayer();
        p.x = e.x - 1; p.y = e.y;      // 敵の西隣（dist 1.0＝剣の間合い）へ置く
        g.setHeroDir('right');
        const before = e.hp;
        g.swordAttack();
        out[label] = { phase: e.blinkPhase, hidden: e.hidden, loss: before - g.getEnemies()[0].hp };
      };
      for (let i = 1; i <= a.shownTick; i++) g.step(1);
      hit('shown');                     // 対照＝姿がある間は通る
      for (let i = a.shownTick; i < a.goneTick; i++) g.step(1);
      hit('gone');                      // 本命＝消えている間は通らない
      return out;
    }, { shownTick: 3, goneTick: T_GONE_1 });
    expect(res.shown.phase, '対照の tick で姿が無い＝測り方が崩れている').toBe('shown');
    expect(res.shown.loss, '姿がある術士に剣が通らない＝殴れる窓が無い（倒せない敵）').toBeGreaterThan(0);
    expect(res.gone.hidden, '本命の tick で消えていない＝測り方が崩れている').toBe(true);
    expect(res.gone.loss, '消えている術士に剣が通った＝無敵になっていない').toBe(0);
  });

  test('⑦ 消えている間は撃ってこない（無敵のまま撃つ敵にしない）', async ({ page }) => {
    await gotoFrozen(page, SORC());
    const res = await page.evaluate((a) => {
      const g = window.__game;
      g.pause();
      const out = { shots: [], goneShots: 0, shownShots: 0 };
      for (let i = 1; i <= a.span; i++) {
        const before = g.getProjectiles().length;
        g.step(1);
        const e = g.getEnemies()[0];
        const after = g.getProjectiles().length;
        if (after > before) {
          out.shots.push({ i, phase: e.blinkPhase, hidden: e.hidden });
          if (e.hidden) out.goneShots++; else out.shownShots++;
        }
      }
      return out;
    }, { span: CYCLE * 2 });
    expect(res.shownShots, '姿がある間に一度も撃たない＝遠隔攻撃が死んでいる').toBeGreaterThan(0);
    expect(res.goneShots,
      `消えている間に魔弾が出た（${JSON.stringify(res.shots)}）＝無敵のまま撃ってくる`).toBe(0);
  });

  test('⑧ 出現先はプレイヤーから距離 3 の四方のランダム（直前と同じ方向は続かない・固定巡回でもない）', async ({ page }) => {
    await gotoFrozen(page, SORC());
    const res = await page.evaluate((a) => {
      const g = window.__game;
      g.pause();
      const p = g.getPlayer();
      const out = { player: { x: p.x, y: p.y }, appears: [] };
      let prevCount = 0;
      for (let i = 1; i <= a.span; i++) {
        g.step(1);
        const e = g.getEnemies()[0];
        if ((e.blinkCount ?? 0) > prevCount) {
          prevCount = e.blinkCount;
          out.appears.push({ i, count: e.blinkCount, x: e.x, y: e.y, dir: e.dir });
        }
      }
      return out;
    }, { span: CYCLE * APPEARS + 2 });
    // プレイヤーは (4,5) に立ったまま（この本では動かさない）
    expect(res.player, 'probe の立ち位置が (4,5) でない＝出現先の期待値が変わる').toEqual({ x: 5, y: 4 });
    expect(res.appears.length, `${APPEARS} 周分で出現が ${res.appears.length} 回＝周期が崩れている`)
      .toBe(APPEARS);
    // 四方（プレイヤーから range セル）のどれかに出る＝出現セルは4通りしかない。
    // ⚠️ 出現の**順序**は主張しない（2026-08-18 のユーザー指摘でランダム化した）。
    const LEGAL = { '1,5': 'north', '4,8': 'east', '7,5': 'south', '4,2': 'west' };
    const FACE  = { north: 'down', east: 'left', south: 'up', west: 'right' };
    const seq = res.appears.map(a2 => {
      const key = `${a2.y},${a2.x}`;
      expect(LEGAL[key], `出現 #${a2.count} が ${key}＝四方（距離 ${M().blink.range}）の外`).toBeTruthy();
      // 距離が range で一定＝跳ぶたびに間合いがリセットされる
      expect(Math.abs(a2.x - 5) + Math.abs(a2.y - 4),
        `出現 #${a2.count} の距離が blink.range と違う`).toBe(M().blink.range);
      // 出現したらプレイヤーを向く（speed 0 ∴向きの持ち主は blink 側）
      expect(a2.dir, `${LEGAL[key]} に出たのに向きが ${a2.dir}＝プレイヤーを向いていない`)
        .toBe(FACE[LEGAL[key]]);
      return LEGAL[key];
    });
    // 同じ方向が2回続かない（同じセルに出続けると「跳んでいない」に見える）
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i], `出現 #${i + 1} が直前と同じ ${seq[i]}＝直前の方向を除外していない`)
        .not.toBe(seq[i - 1]);
    }
    // 四方すべてが出る（1方向に偏る／候補を減らす実装だと赤）
    expect(new Set(seq).size, `${APPEARS} 回で出た方向が ${[...new Set(seq)].join('/')} だけ`).toBe(4);
    // **固定巡回でないこと**＝ある方向の「次に来る方向」が1通りしかなければ巡回している。
    const nexts = {};
    for (let i = 1; i < seq.length; i++) (nexts[seq[i - 1]] ??= new Set()).add(seq[i]);
    const branching = Object.values(nexts).filter(s => s.size >= 2).length;
    expect(branching, `どの方向からも次が1通り＝固定巡回に戻っている（${JSON.stringify(
      Object.fromEntries(Object.entries(nexts).map(([k, v]) => [k, [...v]])))}）`).toBeGreaterThan(0);
  });

  test('⑨ 出現直後は詠唱の猶予がある（出た瞬間には撃たない・3 tick 後に1発）', async ({ page }) => {
    await gotoFrozen(page, SORC());
    const res = await page.evaluate((a) => {
      const g = window.__game;
      g.pause();
      const out = { rows: [] };
      for (let i = 1; i <= a.span; i++) {
        const before = g.getProjectiles().length;
        g.step(1);
        const e = g.getEnemies()[0];
        out.rows.push({
          i, now: g.getState().gameTime, phase: e.blinkPhase, count: e.blinkCount,
          freeze: e.freezeUntil, fired: g.getProjectiles().length > before,
        });
      }
      return out;
    }, { span: T_SHOT_1 + 2 });
    const at = (i) => res.rows[i - 1];
    // 出現の tick に詠唱の硬直が立つ（castDelayMs 先）
    expect(at(T_APPEAR_1).count, `t${T_APPEAR_1} が出現の tick でない＝測り方が崩れている`).toBe(1);
    expect(at(T_APPEAR_1).freeze, '出現時に詠唱の硬直が立っていない＝出た瞬間に弾が飛ぶ')
      .toBe(TICK_MS * T_APPEAR_1 + M().blink.castDelayMs);
    // 詠唱中（3 tick）は撃たない＝プレイヤーの反応の猶予
    for (let i = T_APPEAR_1; i < T_SHOT_1; i++) {
      expect(at(i).fired, `t${i}（詠唱中）に魔弾が出た＝出現と同時に撃っている（予告が無い）`).toBe(false);
    }
    // 詠唱明けに1発（クールダウンが出現でリセットされる＝出現したら必ず撃つ）
    expect(at(T_SHOT_1).fired, `t${T_SHOT_1}（詠唱明け）に魔弾が出ない＝出現しても撃たない回がある`).toBe(true);
    // 置いた場所からの1発目も出ている（出現前でも遠隔攻撃は生きている）
    expect(at(T_FIRST_SHOT).fired, `t${T_FIRST_SHOT}（置いた場所からの1発目）が出ていない`).toBe(true);
  });

  test('⑩ 1回の出現で撃つのは1発だけ（拍が読める）', async ({ page }) => {
    await gotoFrozen(page, SORC());
    const res = await page.evaluate((a) => {
      const g = window.__game;
      g.pause();
      const shotsPerAppear = {};
      for (let i = 1; i <= a.span; i++) {
        const before = g.getProjectiles().length;
        g.step(1);
        const e = g.getEnemies()[0];
        const key = String(e.blinkCount ?? 0);
        shotsPerAppear[key] = shotsPerAppear[key] ?? 0;
        if (g.getProjectiles().length > before) shotsPerAppear[key]++;
      }
      return shotsPerAppear;
      // ⚠ span は「出現 #3 の魔弾（t58＝出現 t55 + 詠唱 3）」まで含める必要がある
      //   ∴ CYCLE*3+2=56 では足りない（#3 が 0 発に見えて偽の赤になる）。
    }, { span: CYCLE * 4 });
    // 出現 #1〜#3（0 は「置いた場所」の期間＝クールダウンの初期値の都合で数えない）
    for (const k of ['1', '2', '3']) {
      expect(res[k], `出現 #${k} の魔弾が ${res[k]} 発＝「出現1回＝1発」の拍になっていない`).toBe(1);
    }
  });

  test('⑪ 消えている間は魔法陣が残る（今は殴れないことが画面から読める）', async ({ page }) => {
    await gotoFrozen(page, SORC());
    const res = await page.evaluate((a) => {
      const g = window.__game;
      g.pause();
      const cls = () => {
        const e = g.getEnemies()[0];
        const el = document.getElementById(`char-enemy-${e.id}`);
        return { phase: e.blinkPhase, cls: el ? el.className : null };
      };
      const out = {};
      for (let i = 1; i <= a.shownTick; i++) g.step(1);
      out.shown = cls();
      for (let i = a.shownTick; i < a.goneTick; i++) g.step(1);
      out.gone = cls();
      for (let i = a.goneTick; i < a.appearTick; i++) g.step(1);
      out.after = cls();
      return out;
    }, { shownTick: 3, goneTick: T_GONE_1, appearTick: T_APPEAR_1 });
    expect(res.shown.cls, '姿がある間に消えた見た目（hiding）が付いている').not.toContain('hiding');
    expect(res.gone.cls, '消えている間に hiding が付かない＝薄くならない').toContain('hiding');
    // 種別クラス＝波紋（水）や土煙（地中）と描き分ける＝「潜った」ではなく「転移した」と読ませる
    expect(res.gone.cls, '消えている間に hide-warp（魔法陣）が付かない＝転移だと読めない')
      .toContain('hide-warp');
    expect(res.after.cls, '出現しても hiding が残っている＝殴れる窓だと読めない').not.toContain('hiding');
  });

  test('⑫ 歩かない（姿がある間も消えている間も座標が動かない＝移動は出現だけ）', async ({ page }) => {
    await gotoFrozen(page, SORC());
    const res = await page.evaluate((a) => {
      const g = window.__game;
      g.pause();
      const out = { moves: [], appears: [] };
      let prev = g.getEnemies()[0];
      let prevPos = { x: prev.x, y: prev.y };
      let prevCount = prev.blinkCount ?? 0;
      for (let i = 1; i <= a.span; i++) {
        g.step(1);
        const e = g.getEnemies()[0];
        const moved = e.x !== prevPos.x || e.y !== prevPos.y;
        const appeared = (e.blinkCount ?? 0) > prevCount;
        if (moved) out.moves.push({ i, appeared, from: prevPos, to: { x: e.x, y: e.y } });
        if (appeared) out.appears.push(i);
        prevPos = { x: e.x, y: e.y };
        prevCount = e.blinkCount ?? 0;
      }
      return out;
    }, { span: CYCLE * 2 + 2 });
    expect(res.appears.length, '2周分で出現が起きていない＝測り方が崩れている').toBeGreaterThanOrEqual(2);
    // 座標が変わるのは出現の tick だけ＝歩いていない（speed 0 と blink の専有が効いている）
    const walked = res.moves.filter(m => !m.appeared);
    expect(walked, `出現以外の tick で座標が動いた（${JSON.stringify(walked)}）＝歩いている`).toEqual([]);
    expect(res.moves.length, '出現しても座標が変わらない＝瞬間移動していない')
      .toBe(res.appears.length);
  });

  test('⑬ 詠唱の3 tick だけ絵が sorcererCast になる（殴れる窓が画面から読める・k-8b）', async ({ page }) => {
    await gotoFrozen(page, SORC());
    const res = await page.evaluate((a) => {
      const g = window.__game;
      g.pause();
      const out = { rows: [] };
      for (let i = 1; i <= a.span; i++) {
        g.step(1);
        const e = g.getEnemies()[0];
        // DOM の canvas まで見る＝e.sprite だけ書き換えて描き直さない実装では赤になる。
        // ⚠ 敵の id は `4,9` のような座標文字列＝CSS セレクタに埋められない（querySelector が
        //   SyntaxError）∴⑪と同じく getElementById で引いてから中を探す。
        const el = document.getElementById(`char-enemy-${e.id}`);
        const cv = el ? el.querySelector('canvas.sprite') : null;
        out.rows.push({
          i, sprite: e.sprite, drawn: cv ? cv.dataset.sprite : null,
          phase: e.blinkPhase, hidden: e.hidden, castUntil: e.castUntil ?? null,
          now: g.getState().gameTime,
        });
      }
      return out;
    }, { span: T_SHOT_1 + 2 });
    const at = (i) => res.rows[i - 1];
    // 置いた直後は待機の絵（詠唱は出現に紐づく＝置いた場所では詠唱していない）
    expect(at(1).sprite, 't1 の絵が待機でない＝置いた瞬間から詠唱ポーズ').toBe('sorcerer');
    expect(at(1).drawn, 't1 に描かれている canvas が待機でない').toBe('sorcerer');
    // 出現の tick に詠唱の窓が立ち、絵が同じ tick で切り替わる
    expect(at(T_APPEAR_1).castUntil, '出現時に詠唱の窓（_castUntil）が立っていない')
      .toBe(TICK_MS * T_APPEAR_1 + M().blink.castDelayMs);
    for (let i = T_APPEAR_1; i < T_SHOT_1; i++) {
      expect(at(i).sprite, `t${i}（詠唱中）の絵が詠唱ポーズでない＝止まっている理由が読めない`)
        .toBe('sorcererCast');
      expect(at(i).drawn, `t${i} の canvas が描き替わっていない＝名前だけ変えて絵が古い`)
        .toBe('sorcererCast');
    }
    // 詠唱明け（魔弾が出る tick）には待機へ戻る＝ポーズが「予告」として機能する
    expect(at(T_SHOT_1).sprite, `t${T_SHOT_1}（詠唱明け）に詠唱ポーズが残っている＝ずっと詠唱中に見える`)
      .toBe('sorcerer');
    expect(at(T_SHOT_1).drawn, `t${T_SHOT_1} の canvas が待機に戻っていない`).toBe('sorcerer');
    // 消えている間は詠唱ポーズにしない（消えた敵の絵を触らない＝出現の瞬間まで待機のまま）
    for (let i = T_GONE_1; i < T_APPEAR_1; i++) {
      expect(at(i).sprite, `t${i}（消えている間）の絵が詠唱ポーズ＝消えている敵が詠唱している`)
        .toBe('sorcerer');
    }
  });

  test('⑭ 魔弾の絵は magicBolt（藍＋金・術士と同じパレット・stone は灰のまま）＝k-8c', () => {
    const m = M();
    // 型＝magicBolt。挙動は stone と同じ（enemy-ai.js の分岐を共有）が**絵が別**。
    expect(m.attack.type, '魔弾の型が magicBolt でない＝灰色の石が飛ぶ（金の宝珠から石が出る）')
      .toBe('magicBolt');
    // 投擲物のスプライト対応表（宣言表）に載っている＝型名＝スプライト名＝パレット名。
    expect(PROJECTILE_SPRITE[m.attack.type], 'PROJECTILE_SPRITE に magicBolt が無い')
      .toBe('magicBolt');
    // ★ projectile.js createProjEl は makeSprite(proj.type, proj.type) を呼ぶ＝
    //   型名と同名のスプライト／パレットが**両方**無いと弾が透明になる。
    const frames = ITEM_SPRITES.magicBolt;
    const pal    = ITEM_PAL.magicBolt;
    expect(frames, 'ITEM_SPRITES.magicBolt が無い＝弾が見えない（透明な遠隔攻撃）').toBeTruthy();
    expect(pal, 'ITEM_PAL.magicBolt が無い＝弾が見えない').toBeTruthy();
    expect(pal[0], 'index0 は透明').toBe('transparent');
    expect(frames.length, '魔弾が2フレームでない（フレーム1は将来アニメ用の差分）').toBe(2);
    expect(dots(frames[0], frames[1]), 'フレーム1がフレーム0と同一＝差分として持つ意味が無い')
      .toBeGreaterThan(0);
    for (const [fi, f] of frames.entries()) {
      expect(f.length, `フレーム${fi} の行数が 8 でない`).toBe(8);
      for (const row of f) {
        expect(row.length, `フレーム${fi} の列数が 8 でない`).toBe(8);
        for (const v of row) {
          expect(v, `フレーム${fi} がパレットの範囲外の色番号 ${v} を指している`).toBeLessThan(pal.length);
        }
      }
    }
    // ★ 放射対称＝projectile.js は magicBolt を回転させない（arrow の8方向・waterBlade の
    //   atan2 のような向き分岐を持たない）のに**任意角**へ飛ぶ∴左右・上下・転置のどれで
    //   写しても同じ形でないと、飛ぶ方向によって形が破綻して見える。
    const f0 = frames[0];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      expect(f0[y][x], `魔弾が左右対称でない (${y},${x})＝左右で違う弾に見える`).toBe(f0[y][7 - x]);
      expect(f0[y][x], `魔弾が上下対称でない (${y},${x})＝上下で違う弾に見える`).toBe(f0[7 - y][x]);
      expect(f0[y][x], `魔弾が転置対称でない (${y},${x})＝斜めに飛ぶと形が崩れる`).toBe(f0[x][y]);
    }
    // ★ 弾の色＝術士本体と同じパレット（誰が撃った弾か読める）。∴金は②が固定した
    //   `.hide-warp` の魔法陣と同じ色になる＝「転移するあの敵の弾」として一貫する。
    expect(pal, '魔弾のパレットが術士本体（ENEMY_PAL.sorcerer）と違う＝誰の弾か読めない')
      .toEqual(ENEMY_PAL[m.pal]);
    expect(pal.includes(WARP_GOLD), `魔弾に魔法陣の金（${WARP_GOLD}）が無い`).toBe(true);
    // ⚠ 実機の表示は 48px セル × 0.35 ≒ 17px（1ドット ≒ 2px）＝石床（明部 57.6）より
    //   暗い色だけで描くと弾が床に沈む。**使っている色**が全部床より明るいことを見る
    //   （パレットに未使用の暗色があっても構わない＝影用の予備）。
    const used = [...new Set(frames.flat(2))].filter(v => v !== 0);
    expect(used.length, '魔弾が1色しか使っていない＝層（縁/帯/芯）が無い').toBeGreaterThanOrEqual(3);
    for (const v of used) {
      expect(lumOf(pal[v]), `魔弾の色 ${pal[v]}（index ${v}）が石床（${FLOOR_LUM}）より暗い＝床に沈む`)
        .toBeGreaterThan(FLOOR_LUM);
    }
    // ★★ stone は塗り替えていない＝岩投げ系の敵（魔物・魔将ほか）が魔法の弾を投げない。
    //   石つぶては「ほぼ無彩色（各色の RGB 幅 ≤ 16）」かつ金を含まない。
    expect(ITEM_PAL.stone.includes(WARP_GOLD), 'stone のパレットに魔法陣の金がある＝石を魔弾に塗り替えた')
      .toBe(false);
    for (const c of ITEM_PAL.stone.slice(1)) {
      const n = parseInt(c.slice(1), 16);
      const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      expect(Math.max(...ch) - Math.min(...ch),
        `stone の色 ${c} が無彩色でない＝石つぶてを色付き（魔弾）に塗り替えている`).toBeLessThanOrEqual(16);
    }
    expect(ITEM_SPRITES.stone.length, 'stone のフレーム数が変わった＝石つぶてを触っている').toBe(2);
    expect(ITEM_SPRITES.stone[0].length, 'stone の寸法（6×6）が変わった＝石つぶてを触っている').toBe(6);
  });

  test('⑮ 撃った魔弾が magicBolt の絵で飛ぶ（型名＝スプライト名の解決が実機で通る）', async ({ page }) => {
    await gotoFrozen(page, SORC());
    const res = await page.evaluate((a) => {
      const g = window.__game;
      g.pause();
      const out = { rows: [], gone: null };
      for (let i = 1; i <= a.span; i++) {
        g.step(1);
        for (const p of g.getProjectiles()) {
          if (p.owner !== 'enemy') continue;
          // DOM の canvas の**中身のドット**まで見る。⚠️ 静止描画の canvas には
          // data-sprite が付かない（makeSprite は animated のときだけ dataset を書く）∴
          // 名前ではなく「描かれた寸法と色」で同一性を測る＝絵を差し替えると赤。
          const el = document.getElementById(`proj-${p.id}`);
          const cv = el ? el.querySelector('canvas.sprite') : null;
          const row = { i, id: p.id, type: p.type, x: p.x, y: p.y, hasCanvas: !!cv, w: null, h: null, px: null };
          if (cv) {
            row.w = cv.width; row.h = cv.height;   // backing store＝スプライトのドット数
            const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
            const at = (x, y) => {
              const o = (y * cv.width + x) * 4;
              return d[o + 3] === 0 ? null
                : '#' + [d[o], d[o + 1], d[o + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
            };
            row.px = { corner: at(0, 0), rim: at(2, 0), band: at(2, 2), core: at(3, 3) };
          }
          out.rows.push(row);
        }
        if (out.rows.length && !g.getProjectiles().length) { out.gone = i; break; }
      }
      return out;
    }, { span: T_FIRST_SHOT + 8 });
    expect(res.rows.length, '敵の投擲物が1つも観測できない＝魔弾が飛んでいない').toBeGreaterThan(0);
    const PAL = ITEM_PAL.magicBolt;
    for (const r of res.rows) {
      expect(r.type, `t${r.i} の魔弾の型が ${r.type}＝灰色の石が飛んでいる`).toBe('magicBolt');
      // canvas が無い＝makeSprite が null を返した（型名と同名のスプライトが未登録）＝透明な弾
      expect(r.hasCanvas, `t${r.i} の魔弾に canvas が無い＝絵が解決できていない（透明な遠隔攻撃）`).toBe(true);
      expect([r.w, r.h], `t${r.i} の魔弾のドット数が 8×8 でない（${r.w}×${r.h}）＝別の絵が飛んでいる`)
        .toEqual([8, 8]);
      // 描かれたドットの色＝魔弾のパレット（灰色の石なら縁が金にならない）
      expect(r.px.corner, `t${r.i} の魔弾の角が透明でない＝丸くない`).toBeNull();
      expect(r.px.rim,  `t${r.i} の魔弾の縁が金（${PAL[5]}）でない＝${r.px.rim} が飛んでいる`).toBe(PAL[5]);
      expect(r.px.band, `t${r.i} の魔弾の帯が藍（${PAL[2]}）でない`).toBe(PAL[2]);
      expect(r.px.core, `t${r.i} の魔弾の芯が淡紫（${PAL[4]}）でない`).toBe(PAL[4]);
    }
    // 挙動は stone と同じ経路＝西のプレイヤーへ向かって進み、到達して消える
    //（盾での防御・壁での消滅そのものの番人は tests/*projectile*.spec.js 側）。
    const first = res.rows[0], last = res.rows[res.rows.length - 1];
    expect(last.x, '魔弾が西（プレイヤー側）へ進んでいない＝飛翔経路に乗っていない')
      .toBeLessThan(first.x);
    expect(res.gone, '魔弾が盤面から消えない＝命中/壁の経路に乗っていない').not.toBeNull();
  });
});
