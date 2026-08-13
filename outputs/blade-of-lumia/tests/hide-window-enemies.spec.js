// tests/hide-window-enemies.spec.js — Phase 5.5k k-3「隠れ↔出現の無敵窓」（陸/空へ一般化）
//
// 潜み鮫（水）だけが持っていた「潜行中は無敵・浮上した窓だけ殴れる」機構を
// `meta.submerge`/`e.submerged` → **`meta.hide`（style 付き）/`e.hidden`** に改名して
// 陸と空へ広げた。この1つの規則に3体を乗せる（PLAN 5.5k 名簿 #1 #2 #9）：
//
//   ① 地中蟲 BURROW_WORM ('α')  … `hide`（タイマー駆動）＝潜伏1.6s↔浮上1.0s の周期。
//        潜伏中は無敵・攻撃なし・接触ダメージなしのまま寄ってくる＝「待って合わせる敵」。
//   ② 跳躍蜘蛛 LEAP_SPIDER ('β') … `leap`（行動駆動）＝溜め→滞空（この間だけ隠れ）→
//        着地硬直。滞空中は当たり判定が消え、**着地硬直が反撃の窓**になる（因果が逆＝
//        時間で開く窓ではなく、敵の行動が窓を開ける）。
//   ③ コウモリ群 BAT_SWARM ('ξ') … 無敵窓は持たない。代わりに `move:'air'`（水/溶岩/空を
//        飛び越える）＋ `zigzag`（進路が左右に振れる）で「狙いを付けにくい空の敵」にする。
//        ⚠ PLAN.md の k-3 見出しは3体すべてを無敵窓の枠に入れていたが、実装では
//        コウモリに無敵窓を持たせていない（脆さと機動が売りの敵に無敵は要らない）。
//        ∴ここで固定する契約は「飛行＋ジグザグ」＝PLAN.md 側も 2026-08-13 に修正済み。
//
// 検証ステージ＝test_mechanics[29,0] `burrow_worm` / [30,0] `leap_spider` / [31,0] `bat_swarm`
// （scripts/migrate-test-hide-window-arenas.mjs が自己検査付きで生成）。
// 1枚に混ぜない＝どの機構が壊れたか混ざらない。コウモリの盤面だけ中央に水の縦帯があり、
// 「陸上敵には渡れない幾何」を migrate が陸の BFS で証明済み＝越えたら飛行の証明になる。
//
// tick 換算（TICK_MS=120・step() が論理時間を 120ms ずつ進める）：
//   地中蟲 … spawn 時 hidden=true → 初 tick(now=120) で _hideUntil=1720
//            → now>=1720 で浮上 = tick15(1800) → 浮上は 1800+1000=2800 まで
//            → now>=2800 で再潜伏 = tick24(2880) → 次の浮上 = tick38(4560)
//   跳躍蜘蛛 … windupMs 360 = tick1-3 溜め / airSpeed 1.0・cells 3 = tick4-6 滞空
//            → tick7 着地 → cooldownMs 1000（≈9 tick）= tick7-15 硬直 → tick16 から地上
//
// ⚠ 計測は1回の evaluate 内で完結させる（ゲームループも gameTime を進めるので
//   await をまたいで tick を数えると実時間ぶんが混ざって数がずれる）。sea-enemies と同じ。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { ENEMY_META, ENEMY_SPEED_FAST } from '../shared/enemies.js';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { createEnemyAi } from '../game/enemy-ai.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { gameLayerEntries } from '../shared/layers.js';

const GAME   = '/blade-of-lumia/game/';
const EDITOR = '/blade-of-lumia/editor/';
const TICK_MS = 120;
const MOVE_STEP = 0.5;

function previewUrl(stage, row, col) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col),
    ps_weapon: '1',
  });
  return `${GAME}?${p.toString()}`;
}

// 各アリーナの敵は (4,9)。プレイヤーの立ち位置は migrate の comment と同じ意味：
//   地中蟲   (4,10) … 隣接＝噛みつき range1.4 が届く／こちらの剣も届く
//   跳躍蜘蛛 (4,5)  … 距離4＝leap の minRange1.8〜maxRange6.0 の内側
//   コウモリ (4,2)  … 水の縦帯(col6)の西側＝飛んで越えないと近づけない
const WORM_URL   = previewUrl('burrow_worm', 4, 10);
const SPIDER_URL = previewUrl('leap_spider', 4, 5);
const BAT_URL    = previewUrl('bat_swarm',   4, 2);

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const K3 = [
  [TILE.BURROW_WORM, 'burrowWorm', '地中蟲'],
  [TILE.LEAP_SPIDER, 'leapSpider', '跳躍蜘蛛'],
  [TILE.BAT_SWARM,   'batSwarm',   'コウモリ群'],
];
const threatOf = (m) => (m.hp * m.atk) / (m.def + 1);

test.describe('Phase 5.5k k-3 – 隠れ↔出現の無敵窓（地中蟲・跳躍蜘蛛・コウモリ群）', () => {

  test('① 3種の定義（記号タイル・非ボス・機構フィールド・脅威度の上限）', () => {
    expect(TILE.BURROW_WORM, 'TILE.BURROW_WORM が未定義').toBe('α');
    expect(TILE.LEAP_SPIDER, 'TILE.LEAP_SPIDER が未定義').toBe('β');
    expect(TILE.BAT_SWARM,   'TILE.BAT_SWARM が未定義').toBe('ξ');

    for (const [tile, , name] of K3) {
      const m = ENEMY_META[tile];
      expect(m, `ENEMY_META['${tile}'] が無い`).toBeTruthy();
      expect(m.name, `${tile} の名前`).toBe(name);
      expect(m.isBoss, `${name} は通常敵`).toBeFalsy();
      // 通常敵の最強格＝剣獣（脅威度 10）を超えない（3種は「低〜中」枠）
      expect(threatOf(m), `${name} の脅威度が剣獣（10）以上＝通常敵の最強格を追い越している`)
        .toBeLessThan(threatOf(ENEMY_META[TILE.SWORD_BEAST]));
      // GUIDE §7-2＝敵はプレイヤー（速度換算 1.0）より必ず遅い
      expect(m.speed, `${name} がプレイヤーと同速以上＝振り切れない`).toBeLessThan(ENEMY_SPEED_FAST);
    }

    // ① 地中蟲＝タイマー駆動の隠れ。殴れる窓（浮上）を潜伏より短く保つ＝リズムの芯。
    const worm = ENEMY_META[TILE.BURROW_WORM];
    expect(worm.hide, '地中蟲に hide が無い').toBeTruthy();
    expect(worm.hide.hiddenMs, '潜伏時間').toBeGreaterThan(0);
    expect(worm.hide.shownMs, '浮上時間').toBeGreaterThan(0);
    expect(worm.hide.hiddenMs, '浮上の方が長い＝殴り放題になる').toBeGreaterThan(worm.hide.shownMs);
    expect(worm.hide.style, '陸の隠れ表現（土の盛り上がり）').toBe('burrow');
    expect(worm.attack?.type, '浮上中は噛みつき（sword）').toBe('sword');
    expect(worm.attack.range, '隣接（距離1.0）のプレイヤーに届くリーチ').toBeGreaterThanOrEqual(1.2);

    // ② 跳躍蜘蛛＝行動駆動の隠れ。着地硬直が滞空より長い＝必ず反撃の窓が開く。
    const spider = ENEMY_META[TILE.LEAP_SPIDER];
    expect(spider.leap, '跳躍蜘蛛に leap が無い').toBeTruthy();
    const airMs = (spider.leap.cells / spider.leap.airSpeed) * TICK_MS;
    expect(spider.leap.windupMs, '溜めが無い＝予告なしで跳ぶ').toBeGreaterThan(0);
    expect(spider.leap.cells, '跳躍距離').toBeGreaterThan(1);
    expect(spider.leap.cooldownMs, '着地硬直が滞空より短い＝反撃の窓が開かない')
      .toBeGreaterThan(airMs);
    expect(spider.leap.minRange, '密着でも跳ぶ設定（すり抜けになる）').toBeGreaterThan(1.0);
    expect(spider.leap.maxRange, 'maxRange が minRange 以下').toBeGreaterThan(spider.leap.minRange);
    // 跳んで届く範囲を跳躍距離が覆っている（跳んでも絶対に届かない設定を弾く）
    expect(spider.leap.cells, '跳躍距離が minRange より短い＝跳んでも間合いが詰まらない')
      .toBeGreaterThan(spider.leap.minRange - 1);
    expect(spider.attack?.type, '接触ダメージのみ（飛び道具なし）').toBe('charge');
    expect(spider.speed, '地上が速い＝跳躍が「間合いを詰める唯一の手段」にならない')
      .toBeLessThan(ENEMY_META[TILE.BURROW_WORM].speed);

    // ③ コウモリ群＝無敵窓を持たない代わりに飛行＋ジグザグ（PLAN 記述の訂正点）
    const bat = ENEMY_META[TILE.BAT_SWARM];
    expect(bat.hide, 'コウモリ群に無敵窓は持たせない（脆さと機動が売り）').toBeUndefined();
    expect(bat.leap, 'コウモリ群は跳躍しない').toBeUndefined();
    expect(bat.move, '飛行（水/溶岩/空を越える）').toBe('air');
    expect(bat.zigzag, 'ジグザグが無い＝真っすぐ来る').toBeTruthy();
    expect(bat.zigzag.amplitude, '振り幅').toBeGreaterThan(0);
    expect(bat.zigzag.periodMs, '左右の入れ替え周期').toBeGreaterThan(0);
    // 横の実効速度＝speed/2（1手おきに横へ振る）∴片側へ振り切るには
    // amplitude*2 セルぶんの時間が要る。足りないと実画面ではほぼ直線に見える。
    const lateralPerTick = (bat.speed * MOVE_STEP) / 2;
    expect(bat.zigzag.periodMs / TICK_MS,
      'periodMs が短すぎて振り切る前に折り返す＝直線に見える')
      .toBeGreaterThanOrEqual((bat.zigzag.amplitude * 2) / lateralPerTick);
    expect(bat.sideView, '横向きシルエット＝左右反転で向きを出す').toBe(true);
    expect(bat.attack?.type, '接触ダメージのみ').toBe('charge');
  });

  test('② タイル定義・スプライト・パレット・スプライトマップの名前解決', () => {
    // ⚠ k-3a 時点のスプライトは既存絵のエイリアス（GUIDE §2 の「機構が先」）。
    // ∴絵の中身は主張せず「名前が全部解決する（描画で消えない）」だけを固定する。
    for (const [tile, spr, name] of K3) {
      const meta = ENEMY_META[tile];
      expect(TILE_META[tile], `TILE_META['${tile}'] が無い＝エディタに出ない`).toBeTruthy();
      expect(TILE_META[tile].label, `${name} のラベル`).toBe(name);
      expect(TILE_META[tile].passable, '敵タイルは通行可（下は床）').toBe(true);
      expect(meta.sprite, `${name} の sprite 名`).toBe(spr);
      expect(meta.pal, `${name} の pal 名`).toBe(spr);
      expect(ENEMY_SPRITES[spr], `${spr} スプライトが無い`).toBeTruthy();
      expect(ENEMY_SPRITES[spr].length, `${spr} のフレームが無い`).toBeGreaterThan(0);
      for (const frame of ENEMY_SPRITES[spr]) {
        expect(frame.length, `${spr} の行が無い`).toBeGreaterThan(0);
        const w = frame[0].length;
        for (const row of frame) expect(row.length, `${spr} の行の長さが揃っていない`).toBe(w);
      }
      expect(ENEMY_PAL[spr], `${spr} パレットが無い`).toBeTruthy();
      expect(ENEMY_PAL[spr][0], 'index0 は透明').toBe('transparent');
      expect(TILE_SPRITE_MAP[tile], 'スプライトマップが無い（描画で消える）').toBeTruthy();
      expect(TILE_SPRITE_MAP[tile].spr, 'スプライトマップの spr がメタと食い違う').toBe(spr);
      expect(TILE_SPRITE_MAP[tile].pal, 'スプライトマップの pal がメタと食い違う').toBe(meta.pal);
    }
  });

  test('③ エディタのパレットに3種が並ぶ（置けない敵は死蔵になる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(EDITOR);
    // ⚠ パレットは初期状態でパネルが畳まれていて **visible にならない**（DOM には在る）。
    // ∴ 'attached' で待つ。ここを visible で待つと 30 秒タイムアウトで落ちる。
    await page.waitForSelector('#tile-palette .tile-btn', { state: 'attached' });

    for (const [tile, , name] of K3) {
      const btn = page.locator(`#tile-palette .tile-btn[title="${name}"]`);
      await expect(btn, `${name}（'${tile}'）がパレットに無い＝エディタで配置できない`)
        .toHaveCount(1);
      // アイコン文字ではなくスプライトの canvas が出る＝TILE_SPRITE_MAP が効いている
      await expect(btn.locator('canvas'), `${name} がスプライトで描かれていない`).toHaveCount(1);
    }
    expect(errors, 'エディタで pageerror').toEqual([]);
  });

  test('④ 地中蟲は潜伏で登場し、潜伏1.6s↔浮上1.0s の周期で切り替わる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(WORM_URL);
    await waitForBoard(page);

    const flips = await page.evaluate(() => {
      const get = () => window.__game.getEnemies().find(e => e.type === 'α');
      let prev = get()?.hidden;
      const first = prev;
      const at = [];
      for (let i = 1; i <= 45; i++) {
        window.__game.step(1);
        const cur = get()?.hidden;
        if (cur !== prev) { at.push({ tick: i, hidden: cur }); prev = cur; }
      }
      return { first, at, pos: (() => { const e = get(); return e ? [e.y, e.x] : null; })() };
    });

    expect(flips.first, '登場時は潜伏（地中から現れる）').toBe(true);
    // hiddenMs 1600 → now>=1720 で浮上 = tick15 / shownMs 1000 → now>=2800 = tick24 で再潜伏
    expect(flips.at.length, '1周期ぶんの切り替わりが観測できない').toBeGreaterThanOrEqual(3);
    expect(flips.at[0], '1.6s 経過で浮上').toEqual({ tick: 15, hidden: false });
    expect(flips.at[1], '1.0s 経過で再潜伏').toEqual({ tick: 24, hidden: true });
    expect(flips.at[2], '2周期目の浮上').toEqual({ tick: 38, hidden: false });
    // 潜伏中も追跡は続く＝隣接したまま（遮蔽ゼロの盤面なので地形で止まらない）
    expect(flips.pos, '地中蟲が動いた／消えた（隣接のまま張り付くはず）').toEqual([4, 9]);
    expect(errors).toEqual([]);
  });

  test('⑤ 潜伏中は無敵・浮上中はダメージが通る（陸のリズム戦闘）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(WORM_URL);
    await waitForBoard(page);

    const res = await page.evaluate(() => {
      const get = () => window.__game.getEnemies().find(e => e.type === 'α');
      const out = [];
      for (let i = 1; i <= 20; i++) {
        window.__game.step(1);
        if (i !== 3 && i !== 20) continue;         // tick3 = 潜伏中 / tick20 = 浮上中
        const e = get();
        const before = e.hp;
        window.__game.dealDamage(e.id, 5, 'sword');
        out.push({ tick: i, hidden: e.hidden, loss: before - (get()?.hp ?? 0) });
      }
      return out;
    });

    expect(res[0].hidden, '前提：tick3 は潜伏中').toBe(true);
    expect(res[0].loss, '潜伏中は無敵＝ダメージ0').toBe(0);
    expect(res[1].hidden, '前提：tick20 は浮上中').toBe(false);
    expect(res[1].loss, '浮上中にダメージが通らない＝倒せない').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('⑥ 潜伏中の地中蟲は接触ダメージを与えない（浮上中は与える）', () => {
    // checkEnemyContact 単体（DOM 不要）。プレイヤーと敵を同一セルに重ねる。
    const calls = [];
    const enemy = { id: 'e1', type: TILE.BURROW_WORM, x: 5, y: 5, hidden: true };
    const ai = createEnemyAi({
      getPlayer:  () => ({ x: 5, y: 5 }),
      getEnemies: () => [enemy],
      takeDamage: (amt) => calls.push(amt),
    });
    ai.checkEnemyContact();
    expect(calls, '潜伏中は重なってもダメージなし').toEqual([]);
    enemy.hidden = false;
    ai.checkEnemyContact();
    expect(calls.length, '浮上中は接触ダメージが入る').toBe(1);
    expect(calls[0], '地中蟲の atk が入る').toBe(ENEMY_META[TILE.BURROW_WORM].atk);
  });

  test('⑦ 潜伏中は攻撃しない・浮上中だけ噛みつく', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(WORM_URL);
    await waitForBoard(page);

    // 敵の剣エフェクト（.sword-thrust）が増えた tick の潜伏状態を数える。
    // 除去は setTimeout(260ms) なので同期ループ中は消えない。
    const res = await page.evaluate(() => {
      let whileHidden = 0, whileShown = 0;
      for (let i = 0; i < 40; i++) {
        const before = document.querySelectorAll('.sword-thrust').length;
        window.__game.step(1);
        const after = document.querySelectorAll('.sword-thrust').length;
        if (after > before) {
          const e = window.__game.getEnemies().find(x => x.type === 'α');
          if (e?.hidden) whileHidden++; else whileShown++;
        }
      }
      return { whileHidden, whileShown };
    });

    expect(res.whileShown, '浮上中に噛みついてこない＝無害な置物').toBeGreaterThan(0);
    expect(res.whileHidden, '潜伏中に攻撃した（無敵のまま殴ってくる）').toBe(0);
    expect(errors).toEqual([]);
  });

  test('⑧ 跳躍蜘蛛は 溜め→滞空→着地硬直 の3拍で跳ぶ（滞空中だけ隠れる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(SPIDER_URL);
    await waitForBoard(page);

    const rows = await page.evaluate(() => {
      const out = [];
      for (let i = 1; i <= 20; i++) {
        window.__game.step(1);
        const e = window.__game.getEnemies().find(x => x.type === 'β');
        if (!e) break;
        out.push({ tick: i, phase: e.leapPhase, hidden: e.hidden, y: e.y, x: e.x });
      }
      return out;
    });

    const phasesOf = (p) => rows.filter(r => r.phase === p).map(r => r.tick);
    // windupMs 360 = 3 tick / cells3・airSpeed1.0 = 3 tick 滞空 / cooldownMs 1000 ≈ 9 tick 硬直
    expect(phasesOf('windup'), '溜めの3拍が観測できない').toEqual([1, 2, 3]);
    expect(phasesOf('air'), '滞空の3拍が観測できない').toEqual([4, 5, 6]);
    expect(phasesOf('recover'), '着地硬直が観測できない').toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(rows.filter(r => r.phase === 'ground').map(r => r.tick), '硬直が明けて地上へ戻らない')
      .toEqual([16, 17, 18, 19, 20]);

    // 隠れているのは滞空中だけ（溜めと硬直は無敵でない＝そこが反撃の窓）
    for (const r of rows) {
      expect(r.hidden, `tick${r.tick}（${r.phase}）の隠れ状態が想定と違う`).toBe(r.phase === 'air');
    }
    // 跳躍で間合いが cells ぶん詰まる（x 9 → 6）。溜め中は動かない。
    expect(rows[2].x, '溜め中に動いた（予告として成立しない）').toBe(9);
    expect(rows[6].x, '3セル跳んでいない').toBe(9 - 3);
    expect(rows[6].y, '横へずれた（プレイヤーは同じ行にいる）').toBe(4);
    expect(errors).toEqual([]);
  });

  test('⑨ 滞空中は攻撃が通らない・着地硬直中は通る（硬直＝反撃の窓）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(SPIDER_URL);
    await waitForBoard(page);

    const res = await page.evaluate(() => {
      const get = () => window.__game.getEnemies().find(e => e.type === 'β');
      const out = [];
      for (let i = 1; i <= 9; i++) {
        window.__game.step(1);
        if (i !== 5 && i !== 9) continue;      // tick5 = 滞空中 / tick9 = 着地硬直中
        const e = get();
        const before = e.hp;
        window.__game.dealDamage(e.id, 2, 'sword');
        out.push({ tick: i, phase: e.leapPhase, loss: before - (get()?.hp ?? 0) });
      }
      return out;
    });

    expect(res[0].phase, '前提：tick5 は滞空中').toBe('air');
    expect(res[0].loss, '滞空中は当たり判定が消えるはず＝ダメージ0').toBe(0);
    expect(res[1].phase, '前提：tick9 は着地硬直中').toBe('recover');
    expect(res[1].loss, '着地硬直中にダメージが通らない＝反撃の窓が無い').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('⑩ 密着では跳ばない／間合いへ戻すと跳び直す（minRange とクールダウン）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(SPIDER_URL);
    await waitForBoard(page);

    const res = await page.evaluate(() => {
      const get = () => window.__game.getEnemies().find(e => e.type === 'β');
      // 1回目の跳躍を終わらせる（tick16 から地上・着地後は距離1.0＝密着）
      for (let i = 0; i < 20; i++) window.__game.step(1);
      const near = { dist: Math.hypot(get().x - window.__game.getPlayer().x, get().y - window.__game.getPlayer().y) };
      // 密着のまま 20 tick 進めても跳ばない（minRange 1.8 の外に出ていない）
      const phasesNear = new Set();
      for (let i = 0; i < 20; i++) { window.__game.step(1); phasesNear.add(get().leapPhase); }
      // プレイヤーを間合い（距離4）へ戻す → もう一度3拍が回る
      const p = window.__game.getPlayer();
      p.x = get().x - 4; p.y = get().y;
      const phasesFar = [];
      for (let i = 0; i < 8; i++) { window.__game.step(1); phasesFar.push(get().leapPhase); }
      return { near, phasesNear: [...phasesNear], phasesFar };
    });

    expect(res.near.dist, '前提：着地後は密着している').toBeLessThan(ENEMY_META[TILE.LEAP_SPIDER].leap.minRange);
    expect(res.phasesNear, '密着なのに跳んだ（minRange が効いていない）').toEqual(['ground']);
    expect(res.phasesFar, '2回目の跳躍が始まらない＝1回で打ち止め')
      .toEqual(['windup', 'windup', 'windup', 'air', 'air', 'air', 'recover', 'recover']);
    expect(errors).toEqual([]);
  });

  test('⑪ コウモリ群は水の縦帯を飛び越える（陸上敵には渡れない幾何）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // 幾何の前提をデータから確認（水帯が抜けていたら飛行の証明にならない）
    const stage = MAP.layers[TEST_LAYER].stages[stageKey('bat_swarm')];
    for (let r = 1; r <= 8; r++) {
      expect(stage.tiles[r][6], `bat_swarm (${r},6) が水でない＝東西が分断されていない`)
        .toBe(TILE.WATER);
    }

    await page.goto(BAT_URL);
    await waitForBoard(page);

    const res = await page.evaluate(() => {
      const get = () => window.__game.getEnemies().find(e => e.type === 'ξ');
      const start = get();
      let onWater = false, minX = start.x;
      for (let i = 1; i <= 40; i++) {
        window.__game.step(1);
        const e = get();
        if (!e) break;
        if (Math.round(e.x) === 6) onWater = true;      // 水の縦帯の上を通った
        minX = Math.min(minX, e.x);
      }
      return { startX: start.x, move: start.move, onWater, minX };
    });

    expect(res.move, "インスタンスに move:'air' が乗っていない").toBe('air');
    expect(res.startX, '前提：コウモリは水帯の東（col9）から始まる').toBe(9);
    expect(res.onWater, '水の上を通っていない＝飛べていない').toBe(true);
    expect(res.minX, '水帯（col6）の西へ抜けていない＝陸上敵と同じで詰まっている')
      .toBeLessThan(6);
    expect(errors).toEqual([]);
  });

  test('⑫ コウモリ群はジグザグで寄る（直線で来ない・乱数なしで決定論的）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const fly = async () => {
      await page.goto(BAT_URL);
      await waitForBoard(page);
      return page.evaluate(() => {
        const get = () => window.__game.getEnemies().find(e => e.type === 'ξ');
        const out = [];
        for (let i = 1; i <= 40; i++) {
          window.__game.step(1);
          const e = get(); const p = window.__game.getPlayer();
          if (!e) break;
          out.push([e.x, e.y - p.y]);      // 主軸=x（詰める）／副軸=y のずれ（振れる）
        }
        return out;
      });
    };

    const path = await fly();
    const lateral = path.map(([, dy]) => dy);
    // 符号の変化＝左右に振れている（0 は跨ぐ途中なので無視する）
    let changes = 0, last = 0;
    for (const v of lateral) {
      const s = Math.sign(v);
      if (s === 0) continue;
      if (last !== 0 && s !== last) changes++;
      last = s;
    }
    expect(changes, '横のずれの符号が変わらない＝プレイヤーの脇へ振れていない')
      .toBeGreaterThanOrEqual(2);
    expect(Math.max(...lateral.map(Math.abs)), '振り幅が 1 セル未満＝実画面では直線に見える')
      .toBeGreaterThanOrEqual(1.0);

    // 乱数を使っていない（GUIDE §7-3）＝同じ盤面をやり直すと同じ軌跡になる
    const again = await fly();
    expect(again, '軌跡が再現しない＝乱数が混ざっている（テストが不安定になる）').toEqual(path);
    expect(errors).toEqual([]);
  });

  test('⑬ 3種はまだ本編レイヤーに配置していない（k-3a は部品のみ）', () => {
    // k-3a はエンジン＋テストまで。ライブ配置は 5.5m（絵が出来てから）。
    // ⚠ ここが赤くなったら「配置した側」が正しい：この test を配置の検証に書き換える
    //   （sea-enemies ⑨ が辿った道と同じ）。
    const placed = [];
    for (const [layerName, layer] of gameLayerEntries(MAP)) {
      for (const [sk, stage] of Object.entries(layer.stages ?? {})) {
        const tiles = stage.tiles ?? [];
        for (let r = 0; r < tiles.length; r++) {
          const row = Array.isArray(tiles[r]) ? tiles[r] : String(tiles[r]).split('');
          for (let c = 0; c < row.length; c++) {
            if (K3.some(([t]) => t === row[c])) placed.push(`${layerName}/${sk} (${r},${c}) '${row[c]}'`);
          }
        }
      }
    }
    expect(placed, 'k-3a の時点では本編レイヤーに配置しない（5.5m で配置する）').toEqual([]);
  });
});
