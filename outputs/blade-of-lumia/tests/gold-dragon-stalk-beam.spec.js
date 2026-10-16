// 金翼の邪竜 Ω（キュー76③-4・2026-10-16）＝強化「速さ・ビーム・背後取り」の番人。
// ユーザー判定（③-3 の試遊）「まだ全然弱い」＋提案：①ザーネルと同じぐらいの速さ ②投石の代わりに
// ビーム（→ 同日の指示で目からのレーザー・盾でも防げない） ③ザーネルたちのように背後を取ってくる動き。
//
//   ① データ：速さ＝ザーネルと同値・ビームの予告でレーンを外せる・打点は atk 以下
//   ② 正面で噛みつきの間合いの外なら目からレーザー（予告の開始で形を固定＝目→プレイヤー→壁・太さは
//      プレイヤーの所で1セル）・予告と発射は別の見た目・盾でも防げない・予告中に形の外へ出れば当たらない
//      （2026-10-16 ユーザー指示で弾のビームから作り替えた）
//   ③ プレイヤーが背を向けて立っていると、竜はプレイヤーの背後へ回り込む（正面を突っ切らない）
//
// 測り方：主の間（dragon_lair 1,0）。被弾を測る本は `g` でデバッグ（無敵）を切る（GUIDE §7-16）。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';

const META = ENEMY_META[TILE.GOLD_DRAGON];
const BEAM = META.aspect.beam;
const URL = '/blade-of-lumia/game/?fromEditor=1&layer=dragon_lair&stage=1,0&row=4&col=1&ps_weapon=1&ps_hearts=20&ps_shield=0';

async function setup(page, { debugOff = false } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await waitForBoard(page);
  if (debugOff) await page.keyboard.press('g');
  await page.waitForFunction(() => window.__game.getEnemies().length === 1, null, { timeout: 10_000 });
  await page.evaluate(() => window.__game.pause());
  return errors;
}

/**
 * 竜を左向きで (7,1) に置いて止め、プレイヤーを正面の遠く（同じ行 y=2・x=2）に立たせてレーザーの予告が立つまで進める。
 * opts.face＝プレイヤーの向き、opts.dodge＝予告が立った後に形の外へ出る、opts.shield＝盾を構える。
 * ⚠️ row 4-5 は左の入口（扉）＝線が壁で止まらない∴扉の無い行で測る。
 */
const beamCase = (page, opts) => page.evaluate(({ face, dodge, shield, windupTicks }) => {
  const g = window.__game;
  const pl = g.getPlayer();
  if (shield) { g.equipShieldTier(2); pl.shield = true; }
  const id = g.getEnemies()[0].id;
  g.setEnemyFieldForTest(id, { x: 7, y: 1, dir: 'left', _aspTurnAt: 1e12, _aspNext: 0, _freezeUntil: 0,
    speed: 0, _aspPhase: 'idle' });
  pl.x = 2; pl.y = 2; pl.hp = 40;
  g.setHeroDir(face);
  let t0 = null;
  for (let t = 0; t < 30; t++) {
    pl.x = 2; pl.y = 2;
    g.step(1);
    if (g.getEnemies()[0].aspPhase === 'windup') { t0 = t; break; }
  }
  const e = g.getEnemies()[0];
  const kind = e.aspKind;
  const warn = e.laserWarn;
  const warnSvg = !!document.getElementById(`dragon-laser-warn-${id}`);
  const warnCls = document.getElementById(`dragon-laser-warn-${id}`)?.getAttribute('class') ?? null;
  // 形（y=2 の列）から1セルだけ外す＝最小の避け方（2セルだと体の幅の外＝追い直しても届かず歯が抜ける）
  if (dodge) pl.y = 3;
  const hp0 = pl.hp;
  let fireSeen = null, fireCls = null;
  for (let t = 0; t < windupTicks + 4; t++) {
    g.step(1);
    const f = g.getEnemies()[0].laserFire;
    if (f && !fireSeen) {
      fireSeen = f;
      fireCls = document.getElementById(`dragon-laser-fire-${id}`)?.getAttribute('class') ?? null;
    }
  }
  return { t0, kind, warn, warnSvg, warnCls, fireSeen, fireCls, hpLost: hp0 - pl.hp,
    projBeams: g.getProjectiles().filter((p) => p.type === 'beam').length };
}, { ...opts, windupTicks: Math.ceil(BEAM.windupMs / 120) });

test.describe('金翼の邪竜 Ω：③-4 速さ・ビーム・背後取り', () => {
  test('① データ：速さはザーネルと同値・レーザーは予告で外せる・打点は atk 以下・目の位置は体の中', () => {
    expect(META.speed, '速さがザーネルと違う').toBe(ENEMY_META[TILE.ZARNEL].speed);
    expect(BEAM.range).toBeGreaterThan(META.aspect.bite.range);
    expect(BEAM.minRange, 'ビームと噛みつきの間合いに隙間がある＝撃たない正面が生まれる')
      .toBeLessThanOrEqual(META.aspect.wing.range + 0.5);
    // レーン（1セル幅）を外す＝1 セル＝2 tick。予告の歩数 × 0.5 が上回る。
    expect(Math.floor(BEAM.windupMs / 120) * 0.5).toBeGreaterThan(1);
    expect(BEAM.atk ?? META.atk).toBeLessThanOrEqual(META.atk);
    expect(META.aspect.stalk?.backDist, '背後取りの設定が無い').toBeGreaterThan(0);
    for (const [d, [x, y]] of Object.entries(BEAM.eyes)) {
      expect(x, `${d} の目が体の外`).toBeGreaterThan(0); expect(x).toBeLessThan(META.size.w);
      expect(y, `${d} の目が体の外`).toBeGreaterThan(0); expect(y).toBeLessThan(META.size.h);
    }
  });

  test('② レーザー：目から・予告の形（目→プレイヤー→壁・太さは1セルまで）・予告と発射は別の見た目・当たる', async ({ page }) => {
    const errors = await setup(page, { debugOff: true });
    const r = await beamCase(page, { face: 'up', dodge: false, shield: false });
    expect(r.t0, 'レーザーの予告が立たない').not.toBeNull();
    expect(r.kind).toBe('beam');
    expect(r.warn, '予告の形が無い').not.toBeNull();
    // 目＝左向き＝右の目の鏡（体の左上 (7,1) から [3 - 2.63, 0.84]）
    const [rx, ry] = BEAM.eyes.right;
    expect(r.warn.E[0]).toBeCloseTo(7 + 3 - rx, 2);
    expect(r.warn.E[1]).toBeCloseTo(1 + ry, 2);
    // T＝プレイヤーの中心（2.5, 2.5）・F＝壁の手前（左の壁 x=1 の縁）・同じ行
    expect(r.warn.T[0]).toBeCloseTo(2.5, 2);
    expect(r.warn.T[1]).toBeCloseTo(2.5, 2);
    expect(r.warn.F[0]).toBeCloseTo(1, 2);
    expect(r.warn.F[1]).toBeCloseTo(2.5, 2);
    expect(r.warn.w0, '目の所の太さがプレイヤーより太い').toBeLessThan(1);
    expect(r.warnSvg, '予告の絵が無い').toBe(true);
    expect(r.fireSeen, '発射が無い').not.toBeNull();
    expect(r.fireSeen, '発射の形が予告の形と違う').toEqual(r.warn);
    expect(r.warnCls).toBe('dragon-laser-warn');
    expect(r.fireCls, '発射の見た目が予告と同じ').toBe('dragon-laser-fire');
    expect(r.projBeams, '弾が飛んでいる（レーザーは照射）').toBe(0);
    expect(r.hpLost, '形の中に居たのに当たらない').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('②b 盾を竜へ向けても防げない（予告があるから）', async ({ page }) => {
    const errors = await setup(page, { debugOff: true });
    const r = await beamCase(page, { face: 'right', dodge: false, shield: true });
    expect(r.kind).toBe('beam');
    expect(r.hpLost, '盾で防げた（防げない約束）').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('②c 予告中に形の外へ出れば当たらない', async ({ page }) => {
    const errors = await setup(page, { debugOff: true });
    const r = await beamCase(page, { face: 'up', dodge: true, shield: false });
    expect(r.kind).toBe('beam');
    expect(r.fireSeen, '発射が無い（外したことを測れていない）').not.toBeNull();
    expect(r.hpLost, '形の外へ出たのに当たった').toBe(0);
    expect(errors).toEqual([]);
  });

  test('③ 背を向けて立つプレイヤーの背後へ回り込む（正面を突っ切らない）', async ({ page }) => {
    const errors = await setup(page);
    const r = await page.evaluate(() => {
      const g = window.__game;
      const pl = g.getPlayer();
      const id = g.getEnemies()[0].id;
      // プレイヤーは部屋の中央より左（5,4）に立ち、右（＝竜の居る側）を向く＝背後は左側。
      // 竜は右（7,3）から始まる。面の技は止めておく（歩きだけを測る）。
      g.setEnemyFieldForTest(id, { x: 7, y: 3, _aspNext: 1e12, _aspTurnAt: 1e12 });
      const path = [];
      let reachedBack = null;
      for (let t = 0; t < 60; t++) {
        pl.x = 5; pl.y = 4; pl.hp = 40;
        g.setHeroDir('right');
        g.step(1);
        const e = g.getEnemies()[0];
        const cx = e.x + 1, cy = e.y + 1;
        path.push([cx, cy]);
        // 背後＝体の中心がプレイヤーより左（x < 5 - 1）で、行はプレイヤーの近く
        if (reachedBack == null && cx < 4 && Math.abs(cy - 4) <= 1.0) reachedBack = t;
      }
      // 正面を突っ切らない＝プレイヤーの行（y=4）の前（x>5）から後ろ（x<5）へ、行をずらさずに抜けていない
      const crossedFront = path.some(([cx, cy], i) => i > 0 && path[i - 1][0] >= 5 && cx < 5 && Math.abs(cy - 4) < 2);
      return { reachedBack, crossedFront, dir: g.getEnemies()[0].dir };
    });
    expect(r.reachedBack, '60 tick で背後へ回り込まない').not.toBeNull();
    expect(r.crossedFront, 'プレイヤーの正面を突っ切った').toBe(false);
    expect(errors).toEqual([]);
  });
});
