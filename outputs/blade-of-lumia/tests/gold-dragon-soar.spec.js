// 金翼の邪竜 Ω（キュー76③-2・2026-10-16）＝相2「滞空と炎の帯」の番人。
//
//   ① データ：HP 66% の相で `soar`（strike: 'breath'）が生える・予告の猶予・打点・届く手段は矢
//   ② 相の前は飛ばない／相の後は6拍（ground→rise→air→aim→breath→land）が一周する・
//      地上以外の相では面の技（aspect）を出さない
//   ③ 空の間は剣が届かない（0）・矢は届いて墜落する（気絶→地上）
//   ④ 帯の予告中に帯の外へ出れば当たらない／帯に残れば盾を構えても当たる
//   ⑤ 床の予告の絵＝当たりと同じ矩形（`soarBand`）・吐いている間は炎が同じ矩形に出る
//   ⑥ 地上の相では向き直りが turnMs ごとだけ（追うたびにプレイヤーを向かない＝回り込める）
//
// 測り方：主の間（dragon_lair 1,0）で HP を 66% 未満に削って相を起こす（`dealDamage`＝防御を通る∴
// def を足す）。被弾を測る本は `g` でデバッグ（無敵）を切る（GUIDE §7-16）。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';

const META = ENEMY_META[TILE.GOLD_DRAGON];
const P2 = META.phases?.find((p) => p.soar);
const URL = '/blade-of-lumia/game/?fromEditor=1&layer=dragon_lair&stage=1,0&row=4&col=1&ps_weapon=1&ps_hearts=20&ps_shield=0';
const SOAR_PHASES = ['ground', 'rise', 'air', 'aim', 'breath', 'land'];
const PHASE2_DMG = Math.ceil(META.hp * (1 - (P2?.hpThreshold ?? 0.66))) + META.def + 1;

async function setup(page, { debugOff = false, phase2 = true } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await waitForBoard(page);
  if (debugOff) await page.keyboard.press('g');
  await page.waitForFunction(() => window.__game.getEnemies().length === 1, null, { timeout: 10_000 });
  await page.evaluate(({ phase2, dmg }) => {
    const g = window.__game;
    g.pause();
    // HP を 66% 未満へ（dealDamage は防御を通る＝def を足す・スナップショットに def は無い∴META から）。
    // 矢の手段は地上では墜落を起こさない。
    if (phase2) g.dealDamage(g.getEnemies()[0].id, dmg, 'arrow', 0, 0);
  }, { phase2, dmg: PHASE2_DMG });
  return errors;
}

/** プレイヤーを (px,py) に留めたまま、竜の滞空の相が want になるまで進める（maxTicks で諦める）。 */
const stepUntilSoar = (page, want, { px = 2, py = 2, maxTicks = 300 } = {}) => page.evaluate(({ want, px, py, maxTicks }) => {
  const g = window.__game;
  const pl = g.getPlayer();
  for (let t = 0; t < maxTicks; t++) {
    pl.x = px; pl.y = py; pl.hp = 40;
    g.step(1);
    if (g.getEnemies()[0].soarPhase === want) return t;
  }
  return null;
}, { want, px, py, maxTicks });

test.describe('金翼の邪竜 Ω：相2 滞空と炎の帯', () => {
  test('① データ：HP66% で炎の帯の滞空が生える・猶予と打点', () => {
    expect(META.soar, '基底に soar を持つと相1から飛ぶ').toBeUndefined();
    expect(P2, '相2（soar を持つ相）が無い').toBeTruthy();
    expect(P2.hpThreshold).toBe(0.66);
    expect(P2.soar.strike).toBe('breath');
    expect(P2.soar.reachedBy, '空に届くのは矢（U と同じ解除鍵）').toBe('arrow');
    expect(P2.soar.breathAtk, '新しい最大打点を作らない').toBeLessThanOrEqual(META.atk);
    // 中央レーンから帯（体の幅）の外へ出る距離＝体の半幅＋1。旋回の後の竜はセルの半端な位置に
    // 居る（帯の縁も半端）∴プレイヤーの歩幅（0.5）の丸めで最大 0.5 余計に歩く。予告の歩数 × 0.5 が上回る。
    const out = (META.size.w - 1) / 2 + 1 + 0.5;
    expect(Math.floor(P2.soar.aimMs / 120) * 0.5, '予告のあいだに帯の外へ歩けない').toBeGreaterThan(out);
    // 後半でも予告は縮めない（GUIDE §7-16）＝相1の尾の予告以上
    expect(P2.soar.aimMs).toBeGreaterThanOrEqual(META.aspect.tail.windupMs);
    expect(P2.soar.crashStunMs, '射落とす旨みが着地より大きい').toBeGreaterThan(P2.soar.landFreezeMs);
  });

  test('② 相の前は飛ばない／相の後は6拍が一周する・空では面の技を出さない', async ({ page }) => {
    const errors = await setup(page, { phase2: false });
    const before = await page.evaluate(() => {
      const g = window.__game;
      const pl = g.getPlayer();
      const seen = new Set();
      for (let t = 0; t < 120; t++) { pl.x = 2; pl.y = 2; pl.hp = 40; g.step(1); seen.add(g.getEnemies()[0].soarPhase); }
      return [...seen];
    });
    expect(before, '相1で滞空の周期が回っている').toEqual([null]);
    const r = await page.evaluate((dmg) => {
      const g = window.__game;
      g.dealDamage(g.getEnemies()[0].id, dmg, 'arrow', 0, 0);
      const pl = g.getPlayer();
      const seen = new Set();
      let aspInAir = 0, orbitMoves = 0, prevAng = null;
      // プレイヤーは部屋の中を巡回する（面と間合いが変わり続ける＝面の技も滞空も起きる）
      const path = [[2, 2], [9, 2], [9, 7], [2, 7]];
      for (let t = 0; t < 400; t++) {
        const [px, py] = path[Math.floor(t / 25) % 4];
        pl.x = px; pl.y = py; pl.hp = 40;
        g.step(1);
        const e = g.getEnemies()[0];
        // null＝相が起きた直後、面の技の硬直が明けるまで周期が初期化されていない tick（地上と同じ扱い）
        if (e.soarPhase != null) seen.add(e.soarPhase);
        if (e.soarPhase != null && e.soarPhase !== 'ground' && e.aspPhase === 'windup') aspInAir++;
        // 空では旋回（`enemySoarStride` の角度）で動く＝面の技の「寄るだけ」の分岐に落ちていない
        if (e.soarPhase === 'air' && prevAng != null && e.soarAng !== prevAng) orbitMoves++;
        prevAng = e.soarPhase === 'air' ? e.soarAng : null;
      }
      const e = g.getEnemies()[0];
      return { seen: [...seen], aspInAir, orbitMoves, phases: e.phasesTriggered ?? null, breaths: e.soarBreaths ?? 0 };
    }, PHASE2_DMG);
    expect(r.phases).toEqual([0.66]);
    expect(r.seen.sort(), '6拍のどれかが周期から消えた（GUIDE §7-8）').toEqual([...SOAR_PHASES].sort());
    expect(r.breaths, '400 tick で炎の帯を一度も吐かない').toBeGreaterThanOrEqual(2);
    expect(r.aspInAir, '空の相で面の技の予告が立った').toBe(0);
    expect(r.orbitMoves, '空で旋回していない（移動の分岐が相で生えた滞空を見ていない）').toBeGreaterThan(10);
    expect(errors).toEqual([]);
  });

  test('③ 空の間は剣が届かない・矢は届いて墜落する', async ({ page }) => {
    const errors = await setup(page);
    expect(await stepUntilSoar(page, 'air')).not.toBeNull();
    const r = await page.evaluate(() => {
      const g = window.__game;
      const e = g.getEnemies()[0];
      const hp0 = e.hp;
      g.dealDamage(e.id, 20, 'sword', e.x, e.y);
      const afterSword = g.getEnemies()[0];
      const swordDmg = hp0 - afterSword.hp;
      const stillAir = afterSword.soarPhase;
      g.dealDamage(e.id, 20, 'arrow', e.x, e.y);
      const afterArrow = g.getEnemies()[0];
      return { swordDmg, stillAir, arrowDmg: afterSword.hp - afterArrow.hp,
        phase: afterArrow.soarPhase, crashes: afterArrow.soarCrashes ?? 0 };
    });
    expect(r.swordDmg, '空の竜に剣が届いた').toBe(0);
    expect(r.stillAir).toBe('air');
    expect(r.arrowDmg, '矢が届かない').toBeGreaterThan(0);
    expect(r.crashes, '矢で射落とせない').toBe(1);
    expect(r.phase, '墜落したのに空に居る').toBe('ground');
    expect(errors).toEqual([]);
  });

  test('④ 予告中に帯の外へ出れば当たらない／残れば盾を構えても当たる', async ({ page }) => {
    const errors = await setup(page, { debugOff: true });
    expect(await page.evaluate(() => !!window.__game.getPlayer().shield), '前提：盾を持っている').toBe(true);
    // ⚠️ 無敵窓（1500ms）の心配は要らない：aim の前に必ず rise＋air（≧ 25 tick＝3000ms）を通り、
    //    その間は面の技を出さない（②）∴地上で受けた傷の無敵窓は予告の開始までに明けている。
    // 帯に残る（盾を竜へ向けて構える）
    expect(await stepUntilSoar(page, 'aim')).not.toBeNull();
    const stay = await page.evaluate(() => {
      const g = window.__game;
      const pl = g.getPlayer();
      const e = g.getEnemies()[0];
      const b = e.soarBand;
      const [vy, vx] = e.soarVec;
      // 帯の芯（中央レーン）の先端寄りに立ち直す＝確実に帯の中。竜の方を向く。
      const px = Math.round((vx !== 0 ? (vx > 0 ? b.left + b.w - 1 : b.left) : b.left + 1) * 2) / 2;
      const py = Math.round((vy !== 0 ? (vy > 0 ? b.top + b.h - 1 : b.top) : b.top + 1) * 2) / 2;
      let dmg = 0;
      for (let t = 0; t < 12; t++) {
        pl.x = px; pl.y = py; pl.hp = 40;
        g.setHeroDir(vx !== 0 ? (vx > 0 ? 'left' : 'right') : (vy > 0 ? 'up' : 'down'));
        g.step(1);
        dmg = Math.max(dmg, 40 - pl.hp);
        if (g.getEnemies()[0].soarPhase === 'land') break;
      }
      return { dmg, px, py, band: b };
    });
    expect(stay.dmg, `帯の中 (${stay.px},${stay.py}) で盾を構えたら焼かれない＝盾で消えた／当たっていない`)
      .toBeGreaterThan(0);
    // 帯の外へ出る（次の予告で帯の横へ1セル出る）
    expect(await stepUntilSoar(page, 'aim', { maxTicks: 400 })).not.toBeNull();
    const out = await page.evaluate(() => {
      const g = window.__game;
      const pl = g.getPlayer();
      const e = g.getEnemies()[0];
      const b = e.soarBand;
      const [vy, vx] = e.soarVec;
      // 帯の横（軸と直交する向き）へ外れたセル。部屋の内側（1〜10, 1〜8）に収める。
      // 帯の縁はセルの半端な位置（旋回の後）∴外側へ丸める（歩幅 0.5 の格子）。
      const lo = (v) => Math.floor(v * 2) / 2, hi = (v) => Math.ceil(v * 2) / 2;
      let px, py;
      if (vx !== 0) { px = lo(vx > 0 ? b.left + 1 : b.left + b.w - 2); py = b.top - 1 >= 1 ? lo(b.top - 1) : hi(b.top + b.h); }
      else { py = lo(vy > 0 ? b.top + 1 : b.top + b.h - 2); px = b.left - 1 >= 1 ? lo(b.left - 1) : hi(b.left + b.w); }
      const inside = px < b.left + b.w && px + 1 > b.left && py < b.top + b.h && py + 1 > b.top;
      let dmg = 0;
      for (let t = 0; t < 12; t++) {
        pl.x = px; pl.y = py; pl.hp = 40;
        g.step(1);
        dmg = Math.max(dmg, 40 - pl.hp);
        if (g.getEnemies()[0].soarPhase === 'land') break;
      }
      return { dmg, inside, px, py, band: b, hits: g.getEnemies()[0].soarBandHits ?? 0 };
    });
    expect(out.inside, `前提：(${out.px},${out.py}) が帯の外`).toBe(false);
    expect(out.dmg, `帯の外 (${out.px},${out.py}) に居たのに焼かれた band=${JSON.stringify(out.band)}`).toBe(0);
    expect(errors).toEqual([]);
  });

  test('⑤ 床の予告の絵＝当たりと同じ矩形・吐いている間は炎が同じ矩形', async ({ page }) => {
    const errors = await setup(page);
    expect(await stepUntilSoar(page, 'aim')).not.toBeNull();
    const r = await page.evaluate(() => {
      const g = window.__game;
      const e = g.getEnemies()[0];
      const cell = document.querySelector('#char-layer .char-abs canvas.sprite')?.getBoundingClientRect().width;
      const zone = document.getElementById(`soar-band-zone-${e.id}`);
      const layer = document.getElementById('char-layer').getBoundingClientRect();
      const zr = zone?.getBoundingClientRect();
      return { band: e.soarBand, cellPx: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || null,
        zone: zr ? { left: zr.left - layer.left, top: zr.top - layer.top, w: zr.width, h: zr.height } : null, cell };
    });
    expect(r.zone, 'aim の間に床の予告が無い').not.toBeNull();
    // セルの px＝竜の体（3セル）の canvas 幅 / 3 は描画の都合で丸まる∴予告の帯から逆算して比べる
    const cpx = r.zone.w / r.band.w;
    expect(Math.abs(r.zone.h / r.band.h - cpx), '縦横で倍率が違う＝矩形が判定と食い違う').toBeLessThan(0.5);
    expect(Math.abs(r.zone.left - r.band.left * cpx)).toBeLessThan(1);
    expect(Math.abs(r.zone.top - r.band.top * cpx)).toBeLessThan(1);
    expect(await stepUntilSoar(page, 'breath', { maxTicks: 12 })).not.toBeNull();
    const fire = await page.evaluate(() => {
      const g = window.__game;
      const e = g.getEnemies()[0];
      const el = document.querySelector('#char-layer .soar-band-fire');
      const layer = document.getElementById('char-layer').getBoundingClientRect();
      const fr = el?.getBoundingClientRect();
      return { zoneGone: !document.getElementById(`soar-band-zone-${e.id}`),
        fire: fr ? { left: fr.left - layer.left, top: fr.top - layer.top, w: fr.width, h: fr.height } : null,
        sprite: e.sprite };
    });
    expect(fire.fire, '吐いている間に炎が出ない').not.toBeNull();
    expect(fire.zoneGone, '吐いている間も予告が残っている').toBe(true);
    for (const k of ['left', 'top', 'w', 'h']) {
      expect(Math.abs(fire.fire[k] - r.zone[k]), `炎の ${k} が予告と違う`).toBeLessThan(1);
    }
    expect(fire.sprite, '吐いている間は口を開いた絵').toMatch(/^goldDragon[DRU]Bite$/);
    expect(await stepUntilSoar(page, 'land', { maxTicks: 12 })).not.toBeNull();
    expect(await page.evaluate(() => !document.querySelector('#char-layer [id^="soar-band-zone-"]'))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('⑥ 地上の相では向き直りが turnMs ごとだけ（追うたびに向かない）', async ({ page }) => {
    const errors = await setup(page);
    const r = await page.evaluate((turnTicks) => {
      const g = window.__game;
      const pl = g.getPlayer();
      // プレイヤーが竜の周りを速く回る（毎 tick 向くなら向きが頻繁に変わる）
      const ring = [[2, 2], [9, 2], [9, 7], [2, 7]];
      let prevDir = g.getEnemies()[0].dir, lastChange = -999, minGap = Infinity, changes = 0, groundTicks = 0;
      for (let t = 0; t < 300; t++) {
        const [px, py] = ring[Math.floor(t / 6) % 4];
        pl.x = px; pl.y = py; pl.hp = 40;
        g.step(1);
        const e = g.getEnemies()[0];
        if (e.soarPhase !== 'ground') { prevDir = e.dir; lastChange = -999; continue; }
        groundTicks++;
        if (e.dir !== prevDir) {
          if (lastChange > -999) minGap = Math.min(minGap, t - lastChange);
          lastChange = t; changes++; prevDir = e.dir;
        }
      }
      return { minGap, changes, groundTicks };
    }, Math.round(META.aspect.turnMs / 120));
    expect(r.groundTicks, '前提：地上の相が測れていない').toBeGreaterThan(60);
    expect(r.changes, '前提：向き直りが起きていない').toBeGreaterThan(1);
    expect(r.minGap, '地上で turnMs より短い間隔で向きが変わった＝追う側が向きを書いている')
      .toBeGreaterThanOrEqual(Math.round(META.aspect.turnMs / 120));
    expect(errors).toEqual([]);
  });
});
