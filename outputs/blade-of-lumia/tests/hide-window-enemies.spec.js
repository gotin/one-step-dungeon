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

function previewUrl(stage, row, col, extra) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col),
    ps_weapon: '1',
    ...(extra ?? {}),
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
// 投擲物の検証用＝弓/ブーメラン/爆弾を持った状態で同じアリーナに入る（⑭⑮）
const ITEMS = { ps_bow: '1', ps_boomerang: '1', ps_bomb: '1' };
const WORM_ITEMS_URL   = previewUrl('burrow_worm', 4, 10, ITEMS);
const SPIDER_ITEMS_URL = previewUrl('leap_spider', 4, 5,  ITEMS);

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const K3 = [
  [TILE.BURROW_WORM, 'burrowWorm', '地中蟲'],
  [TILE.LEAP_SPIDER, 'leapSpider', '跳躍蜘蛛'],
  [TILE.BAT_SWARM,   'batSwarm',   'コウモリ群'],
];
const threatOf = (m) => (m.hp * m.atk) / (m.def + 1);

// ── 投擲物を撃って着弾までを追うヘルパー（⑭⑮）────────────────────────
// off tick まで進めてから weapon を dir へ撃ち、flight tick ぶん進めて
// 「hp が減った tick」と「その tick の隠れ状態」を返す。
// ⚠ 計測は1回の evaluate 内で完結させる（await をまたぐと実ループぶんの tick が混ざる）。
// ⚠ 爆風は投擲物ではなく設置爆弾なので `.explosion-effect` の出現 tick も返す
//   （爆発しないまま終わっても「ダメージ0」で通ってしまう＝歯が無くなるため）。
async function shootAndTrack(page, { type, dir, off, weapon, flight }) {
  return page.evaluate((a) => {
    const g = window.__game;
    const get = () => g.getEnemies().find(e => e.type === a.type);
    for (let i = 0; i < a.off; i++) g.step(1);
    const e0 = get();
    const fire = { hidden: e0.hidden, phase: e0.leapPhase ?? null, hp: e0.hp };
    g.getPlayer().activeSubItem = a.weapon;
    g.setHeroDir(a.dir);
    g.useSubItem();
    const hits = [];
    let boomTick = null, boomHidden = null;
    let prev = fire.hp;
    for (let i = 1; i <= a.flight; i++) {
      g.step(1);
      const e = get();
      const hp = e?.hp ?? 0;
      if (boomTick === null && document.querySelectorAll('.explosion-effect').length > 0) {
        boomTick = a.off + i;
        boomHidden = e?.hidden ?? null;
      }
      if (hp !== prev) {
        hits.push({ tick: a.off + i, hidden: e?.hidden ?? null, phase: e?.leapPhase ?? null, drop: prev - hp });
      }
      prev = hp;
    }
    return { fire, after: prev, hits, boomTick, boomHidden };
  }, { type, dir, off, weapon, flight });
}

// ── 「当たり判定そのものが起きていない」を撮るヘルパー（⑯⑰）──────────────
// ⑭⑮ は hp（ダメージ数値）で無敵を測る。だがユーザー報告（2026-08-14）の実体は
// **hp は減らないのに接触の帰結だけが起きていた**＝ブーメランが地中の蟲・滞空の蜘蛛で
// Uターンし、スタン⭐・ガード解除・「-0」ポップアップまで出ていた。
// ∴ hp ではなく接触の痕跡を見る：Uターン位置／stunUntil／.stun-burst／.dmg-popup。
// 併せて「無敵窓の時計がズレないこと」も返す＝スタンが入ると enemyTick の
// early-continue（stunUntil）が tickHide/tickLeap より前にあるので窓が延びる。
async function probeContact(page, { type, dir, off, weapon, span }) {
  return page.evaluate((a) => {
    const g = window.__game;
    const get = () => g.getEnemies().find(e => e.type === a.type);
    for (let i = 0; i < a.off; i++) g.step(1);
    const e0 = get();
    const fire = { hidden: e0.hidden, phase: e0.leapPhase ?? null, hp: e0.hp, x: e0.x };
    g.setHeroDir(a.dir);
    if (a.weapon === 'sword') {
      g.swordAttack();
    } else {
      g.getPlayer().activeSubItem = a.weapon;
      g.useSubItem();
    }
    const out = { fire, turnedAt: null, stunned: false, star: false, popup: false, hits: [], state: [] };
    // ⚠ 接触の痕跡は「隠れている間に観測されたか」だけを立てる。隠れが解けた後の
    //   正当なヒット（ブーメランの復路が着地硬直に当たる等）を拾うと歯が無くなる。
    //   判定は着弾の瞬間で測る規則と同じ＝その tick の e.hidden で見る。
    const scan = () => {
      const e = get();
      const p = g.getProjectiles()[0];
      if (out.turnedAt === null && p?.returning) out.turnedAt = p.x;
      if (!e?.hidden) return;
      if (e.stunUntil) out.stunned = true;
      if (document.querySelector('.stun-burst')) out.star = true;
      if (document.querySelector('.dmg-popup')) out.popup = true;
    };
    scan();                       // 剣は即時判定∴step の前も見る
    let prev = fire.hp;
    for (let i = 1; i <= a.span; i++) {
      g.step(1);
      scan();
      const e = get();
      const hp = e?.hp ?? 0;
      if (hp !== prev) out.hits.push({ tick: a.off + i, hidden: e?.hidden ?? null, phase: e?.leapPhase ?? null, drop: prev - hp });
      prev = hp;
      out.state.push(e ? (e.hidden ? 'hidden' : (e.leapPhase ?? 'shown')) : 'gone');
    }
    return out;
  }, { type, dir, off, weapon, span });
}

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

  // コウモリは「1体＝1匹」で、群れはステージに複数置くことで表現する（5.5m の配置側の話）。
  // 一方この節で測るのは機構（飛行・ジグザグ）＝1匹で測らないと成立しない：敵同士は重なれない
  // ので、隣に同種がいると互いに進路を塞いで振れが潰れる（実測：5匹並べると符号変化 0 になる）。
  // ∴測定前に主役 (4,9) 以外の 'ξ' を倒して退かす。アリーナへ何匹足しても機構の測定は濁らない。
  const MECH_BAT = '4,9';                 // 敵の id は湧いた位置の "r,c"
  const isolateBat = (page) => page.evaluate((keep) => {
    const g = window.__game;
    for (const e of g.getEnemies()) {
      if (e.type === 'ξ' && e.id !== keep) g.dealDamage(e.id, 999, 'sword');
    }
    return g.getEnemies().filter(e => e.type === 'ξ').map(e => e.id);
  }, MECH_BAT);

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
    expect(await isolateBat(page), `前提：主役の 'ξ' (${MECH_BAT}) が居ない`).toEqual([MECH_BAT]);

    const res = await page.evaluate((keep) => {
      const get = () => window.__game.getEnemies().find(e => e.id === keep);
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
    }, MECH_BAT);

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
      expect(await isolateBat(page), `前提：主役の 'ξ' (${MECH_BAT}) が居ない`).toEqual([MECH_BAT]);
      return page.evaluate((keep) => {
        const get = () => window.__game.getEnemies().find(e => e.id === keep);
        const out = [];
        for (let i = 1; i <= 40; i++) {
          window.__game.step(1);
          const e = get(); const p = window.__game.getPlayer();
          if (!e) break;
          out.push([e.x, e.y - p.y]);      // 主軸=x（詰める）／副軸=y のずれ（振れる）
        }
        return out;
      }, MECH_BAT);
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

  // ── ⑭⑮ 投擲物の経路（ユーザー報告 2026-08-14 の裏取り）─────────────────────
  // 報告＝「地中蟲と跳躍蜘蛛に、ダメージを与えられないはずの間に弓矢やブーメランで
  // ダメージを与えられてしまう」。⑤⑨ は `dealDamage(id,dmg,'sword')` しか通していない＝
  // projectile.js 経由の3経路（貫通＝弓/剣ビーム・ブーメラン・爆風）は無検証だった。
  // 実測の結論＝**無敵窓は投擲物にも効いている**。ダメージが通るのは「着弾の瞬間に
  // 隠れが解けている」場合だけ＝gameTick は enemyTick()（tickHide/tickLeap）→
  // projectileTick() の順∴浮上/着地する tick に着弾すると同じ tick 内で「解除→命中」になる。
  // 弓は 2.25 セル/tick・ブーメランは往復1秒級・爆弾は導火線 17 tick ∴
  // 「撃った瞬間の状態」と「当たった瞬間の状態」がずれる＝これが報告の見え方の正体。
  // ∴ここで固定する契約は2本：①着弾の瞬間が隠れ中ならどの経路でも0 ②解除の瞬間なら通る。

  test('⑭ 地中蟲：弓・ブーメラン・爆風も潜伏中は通らない（判定は着弾の瞬間）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // tick の根拠（④で固定した周期＝潜伏 1〜14 / 浮上 15〜23 / 潜伏 24〜37）：
    //   弓 speed4.5（=2.25 セル/tick）＋敵は西隣∴撃った次の tick に着弾
    //   ブーメラン 往路の1体目で折り返す∴同じく次の tick（atk は 2）
    //   爆弾 導火線 17 tick（設置 tick + 17 で爆発・.scratch/check-bomb-fuse.mjs で実測）
    const shoot = async (opt) => {
      await page.goto(WORM_ITEMS_URL);
      await waitForBoard(page);
      return shootAndTrack(page, { type: 'α', dir: 'left', ...opt });
    };

    // ① 潜伏中に着弾＝3経路すべて無効
    const bowHidden = await shoot({ off: 3, weapon: 'bow', flight: 6 });
    expect(bowHidden.fire.hidden, '前提：tick3 は潜伏中').toBe(true);
    expect(bowHidden.hits, '潜伏中の地中蟲に弓矢が通った（貫通経路が無敵窓を無視している）')
      .toEqual([]);

    const boomHidden = await shoot({ off: 3, weapon: 'boomerang', flight: 12 });
    expect(boomHidden.fire.hidden, '前提：tick3 は潜伏中').toBe(true);
    expect(boomHidden.hits, '潜伏中の地中蟲にブーメランが通った').toEqual([]);

    // 爆弾は tick8 設置 → tick25 爆発＝2周目の潜伏窓（24〜37）の中
    const bombHidden = await shoot({ off: 8, weapon: 'bomb', flight: 20 });
    expect(bombHidden.boomTick, '爆発が観測できない＝ダメージ0が「爆発しなかった」で通ってしまう')
      .toBe(25);
    expect(bombHidden.boomHidden, '前提：tick25 は潜伏中（2周目）').toBe(true);
    expect(bombHidden.hits, '潜伏中の地中蟲に爆風が通った（srcX/srcY 無しの経路）').toEqual([]);

    // ② 浮上中に着弾＝3経路すべて通る（無敵が強すぎて倒せない、の逆側を塞ぐ）
    const bowShown = await shoot({ off: 18, weapon: 'bow', flight: 4 });
    expect(bowShown.fire.hidden, '前提：tick18 は浮上中').toBe(false);
    expect(bowShown.hits.map(h => h.tick), '浮上中に弓矢が当たらない').toEqual([19]);
    expect(bowShown.hits[0].drop, '弓矢の固定ダメージ 5（def 差引後）が入らない').toBeGreaterThan(0);

    const boomShown = await shoot({ off: 16, weapon: 'boomerang', flight: 6 });
    expect(boomShown.fire.hidden, '前提：tick16 は浮上中').toBe(false);
    expect(boomShown.hits.map(h => h.tick), '浮上中にブーメランが当たらない').toEqual([17]);
    expect(boomShown.hits[0].hidden, '命中 tick で潜伏へ戻っていない前提').toBe(false);

    // ③ 「潜伏中に投げた」爆弾でも、爆発の瞬間が浮上中ならダメージは通る
    //    ＝判定は発射でなく着弾（報告の見え方そのもの・仕様として固定する）
    //    ⚠ tick18 が浮上中である根拠は④の周期（浮上 15〜23）。爆風で敵が死んで
    //      リストから消えるため boomHidden は観測できない（null になる）∴周期側に依存する。
    const bombLate = await shoot({ off: 1, weapon: 'bomb', flight: 20 });
    expect(bombLate.fire.hidden, '前提：tick1 は潜伏中（設置は潜伏中）').toBe(true);
    expect(bombLate.boomTick, '爆発 tick（1+17）').toBe(18);
    expect(bombLate.hits.map(h => h.tick), '爆発の瞬間が浮上中なのにダメージが通らない')
      .toEqual([18]);

    // ④ 境界＝浮上する tick（15）に着弾すると通る。gameTick が enemyTick→projectileTick の
    //    順である証拠＝この順序が逆になると「浮上した瞬間に撃ち込めない」体感になる。
    const bowEdge = await shoot({ off: 14, weapon: 'bow', flight: 3 });
    expect(bowEdge.fire.hidden, '前提：tick14 はまだ潜伏中').toBe(true);
    expect(bowEdge.hits.map(h => h.tick), '浮上 tick(15) の着弾が通らない（判定順が逆）')
      .toEqual([15]);

    expect(errors).toEqual([]);
  });

  test('⑮ 跳躍蜘蛛：滞空中は弓もブーメランも通らない・着地硬直では通る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // ⑧で固定した拍＝溜め tick1〜3 / 滞空 tick4〜6 / 着地硬直 tick7〜15。
    // 敵は東（4,9）＝プレイヤー(4,5)から距離4∴dir は right。
    const shoot = async (opt) => {
      await page.goto(SPIDER_ITEMS_URL);
      await waitForBoard(page);
      return shootAndTrack(page, { type: 'β', dir: 'right', ...opt });
    };

    const bowAir = await shoot({ off: 4, weapon: 'bow', flight: 3 });
    expect(bowAir.fire.phase, '前提：tick4 は滞空中').toBe('air');
    expect(bowAir.fire.hidden, '前提：滞空中は隠れている').toBe(true);
    expect(bowAir.hits, '滞空中の跳躍蜘蛛に弓矢が通った（当たり判定が消えていない）').toEqual([]);

    const boomAir = await shoot({ off: 4, weapon: 'boomerang', flight: 14 });
    expect(boomAir.fire.phase, '前提：tick4 は滞空中').toBe('air');
    expect(boomAir.hits.filter(h => h.hidden), '滞空中の跳躍蜘蛛にブーメランが通った').toEqual([]);
    // 2026-08-14 の修正で「素通り」になった＝滞空中に投げた1投は無駄にならず、
    // 復路が着地硬直（＝反撃の窓）に当たる。⑰でスタン/⭐/ポップアップ側も固定している。
    expect(boomAir.hits.map(h => h.phase), '滞空を素通りした復路が着地硬直に当たっていない')
      .toEqual(['recover']);

    // 着地硬直＝反撃の窓（⑨の sword と同じ結論を投擲物でも固定する）
    const bowRecover = await shoot({ off: 8, weapon: 'bow', flight: 4 });
    expect(bowRecover.fire.phase, '前提：tick8 は着地硬直中').toBe('recover');
    expect(bowRecover.hits.map(h => h.tick), '着地硬直中に弓矢が当たらない＝反撃の窓が無い')
      .toEqual([9]);

    const boomRecover = await shoot({ off: 8, weapon: 'boomerang', flight: 8 });
    expect(boomRecover.fire.phase, '前提：tick8 は着地硬直中').toBe('recover');
    expect(boomRecover.hits.map(h => h.tick), '着地硬直中にブーメランが当たらない').toEqual([9]);
    expect(boomRecover.hits[0].phase, '命中 tick でまだ硬直中である前提').toBe('recover');

    expect(errors).toEqual([]);
  });

  // ⑯⑰ = 2026-08-14 ユーザー報告のバグの回帰。「ダメージが 0 なら無敵」では足りない：
  // 報告は「地中にいる間にブーメランを投げると当たる」で、実際に当たっていた（判定が
  // 起きてスタン・⭐・Uターン・-0 ポップアップまで出ていた）。∴ 無敵窓の契約を
  // 「あらゆる攻撃判定を無視する＝そこに敵が居ないのと同じ」に強めて固定する。
  test('⑯ 地中蟲：潜伏中は当たり判定そのものが起きない（剣も矢もブーメランも素通り）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const probe = async (opt) => {
      await page.goto(WORM_ITEMS_URL);
      await waitForBoard(page);
      return probeContact(page, { type: 'α', dir: 'left', off: 3, span: 16, ...opt });
    };

    for (const weapon of ['sword', 'bow', 'boomerang']) {
      const r = await probe({ weapon });
      expect(r.fire.hidden, `前提：tick3 は潜伏中（${weapon}）`).toBe(true);
      expect(r.hits, `潜伏中の地中蟲に ${weapon} でダメージが入った`).toEqual([]);
      expect(r.stunned, `潜伏中の地中蟲に ${weapon} でスタンが入った（無敵なのに阻害が通る）`).toBe(false);
      expect(r.star,    `潜伏中の地中蟲に ${weapon} でスタン⭐が出た（当たったように見える）`).toBe(false);
      expect(r.popup,   `潜伏中の地中蟲に ${weapon} で「-0」ポップアップが出た（当たったように見える）`).toBe(false);
      // ★ 最も強い歯：スタンは enemyTick の early-continue（tickHide より前）に入るので
      //    潜伏中に当たると無敵窓が延びる。④の周期（潜伏1〜14／浮上15〜）が動かないこと。
      expect(r.state[14 - 3 - 1], `${weapon}：tick14 はまだ潜伏中`).toBe('hidden');
      expect(r.state[15 - 3 - 1], `${weapon}：tick15 に浮上していない＝無敵窓が延びた`).toBe('shown');
    }

    // ブーメランは敵を素通りする＝敵の位置（x=9）ではなく最大射程で折り返す。
    // ∴ 潜伏中に投げた1投が無駄にならない（浮上後に復路で当て直せる）。
    const boom = await probe({ weapon: 'boomerang' });
    expect(boom.turnedAt, '前提：ブーメランは折り返している').not.toBeNull();
    expect(boom.turnedAt, '潜伏中の地中蟲(x=9)でUターンした＝投擲物が敵に触れている')
      .toBeLessThan(8);

    expect(errors).toEqual([]);
  });

  test('⑰ 跳躍蜘蛛：滞空中も当たり判定が起きない（跳躍の相が固まらない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const probe = async (opt) => {
      await page.goto(SPIDER_ITEMS_URL);
      await waitForBoard(page);
      return probeContact(page, { type: 'β', dir: 'right', off: 4, span: 8, ...opt });
    };

    for (const weapon of ['bow', 'boomerang']) {
      const r = await probe({ weapon });
      expect(r.fire.phase, `前提：tick4 は滞空中（${weapon}）`).toBe('air');
      expect(r.stunned, `滞空中の跳躍蜘蛛に ${weapon} でスタンが入った`).toBe(false);
      expect(r.star,    `滞空中の跳躍蜘蛛に ${weapon} でスタン⭐が出た`).toBe(false);
      expect(r.popup,   `滞空中の跳躍蜘蛛に ${weapon} で「-0」ポップアップが出た`).toBe(false);
      // ★ 滞空中にスタンが入ると leap の FSM が空中で止まる＝⑧の3拍（滞空4〜6／
      //   硬直7〜）が崩れ「無敵の敵が空中で停止」になる。相の遷移を固定する。
      expect(r.state[6 - 4 - 1], `${weapon}：tick6 はまだ滞空中`).toBe('hidden');
      expect(r.state[7 - 4 - 1], `${weapon}：tick7 に着地していない＝滞空（無敵）が延びた`).toBe('recover');
    }

    // 滞空中に投げたブーメランは素通り→最大射程で折り返し→復路が着地硬直に当たる。
    // ＝「無敵中に投げても1投を無駄にしない」ことの実証（⑯の地中蟲と同じ結論）。
    const boom = await probe({ weapon: 'boomerang', span: 12 });
    expect(boom.hits.map(h => h.phase), '復路が着地硬直に当たっていない')
      .toEqual(['recover']);

    expect(errors).toEqual([]);
  });
});
