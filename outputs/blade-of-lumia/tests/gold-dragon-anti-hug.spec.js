// @ts-check
// キュー76⑥（2026-10-17 ユーザー判定）：金翼の邪竜 Ω の「張り付き戦法」対策の番人。
//   判定「龍の正面にくっついてると盾で守れる攻撃しかしてこなくなるので、かなり簡単に倒せる」
//   「へばりつき戦法でたたかったらトゲを一度も見ることなく倒せてしまった」。
//   ① 噛みつきを盾で防がれたら、離れられるだけ離れる（飛び退き）→ 止まったらすぐレーザーの予告
//   ② 正面で噛みつきの外なら、向き直るたび交互に「間合いを保つ」番が来る（寄らない・近ければ下がる）
//   ③ 金の棘は相3に入った瞬間に1回・その後は地上でも groundEveryMs ごとに降る（着地を待たない）
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';

const META = ENEMY_META[TILE.GOLD_DRAGON];
const P3 = META.phases?.find((p) => p.thorns);
const URL = '/blade-of-lumia/game/?fromEditor=1&layer=dragon_lair&stage=1,0&row=4&col=1&ps_weapon=1&ps_hearts=20&ps_shield=0';
const PHASE3_DMG = Math.ceil(META.hp * (1 - (P3?.hpThreshold ?? 0.33))) + META.def + 1;

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

test.describe('金翼の邪竜 Ω：張り付き対策（キュー76⑥）', () => {
  test('⓪ データ：飛び退き・間合いを保つ番・地上の棘の時計がある', () => {
    expect(META.aspect.retreat?.cellsPerTick, '飛び退きはプレイヤー（0.5/tick）より速い').toBeGreaterThan(0.5);
    expect(META.aspect.hold?.every).toBeGreaterThanOrEqual(2);
    expect(META.aspect.hold?.keepMin, '保つ間合いはレーザーの最短距離より外').toBeGreaterThanOrEqual(META.aspect.beam.minRange);
    expect(P3.thorns.groundEveryMs).toBe(3000);
    expect(P3.thorns.block, '足元の3×3').toBe(1);
  });

  test('① 噛みつきを盾で防ぐと、壁まで飛び退いてすぐレーザーの予告／盾が無ければ飛び退かない', async ({ page }) => {
    const errors = await setup(page, { debugOff: true });
    const run = (withShield) => page.evaluate((withShield) => {
      const g = window.__game;
      const id = g.getEnemies()[0].id;
      const pl = g.getPlayer();
      if (!withShield) pl.shield = null;
      // 竜＝体 (4..6, 3..5)・右向き。プレイヤー＝正面 (7,4)・竜の方（左）を向く
      g.setEnemyFieldForTest(id, { x: 4, y: 3, dir: 'right', speed: 0, _aspTurnAt: 1e12, _aspPhase: 'idle', _aspAt: null,
        _aspRetreat: null, _aspHold: false, _aspRetreats: 0 });
      pl.x = 10; pl.y = 8; g.step(14);   // 無敵窓を明けさせる
      g.setEnemyFieldForTest(id, { _aspNext: 0, _freezeUntil: 0, _aspPhase: 'idle', _stalkTx: null });
      pl.x = 7; pl.y = 4; pl.hp = 40;
      g.setHeroDir('left');
      const log = [];
      let bit = false;
      for (let t = 0; t < 40; t++) {
        pl.x = 7; pl.y = 4;
        g.step(1);
        const e = g.getEnemies()[0];
        log.push({ x: e.x, ph: e.aspPhase, kind: e.aspKind, ret: e.aspRetreating });
        if (e.aspKind === 'bite') bit = true;
        if (bit && e.aspKind === 'beam') break;
      }
      const e = g.getEnemies()[0];
      return { log, retreats: e.aspRetreats ?? 0, x: e.x, kind: e.aspKind, phase: e.aspPhase, hp: pl.hp };
    }, withShield);
    const r = await run(true);
    expect(r.log.some((o) => o.kind === 'bite'), '前提：噛みつきの予告が立つ').toBe(true);
    expect(r.retreats, '盾で防いだのに飛び退かない').toBe(1);
    expect(r.x, '離れられるだけ離れていない（部屋の西の壁＝体の左端 1）').toBe(1);
    expect([r.phase, r.kind], '止まったのにレーザーの予告が立たない').toEqual(['windup', 'beam']);
    // 下がる途中では技を出さない＝飛び退きの tick は予告なし
    // 止まった tick（飛び退きの最後の次）にもうレーザーの予告＝普通の流れ（次の tick）を待たない
    const lastRet = r.log.map((o) => o.ret).lastIndexOf(true);
    expect(r.log[lastRet + 1], '止まった瞬間にレーザーの予告が立たない').toMatchObject({ ph: 'windup', kind: 'beam' });
    const during = r.log.filter((o) => o.ret);
    expect(during.length, '飛び退きの tick が無い').toBeGreaterThan(0);
    expect(during.every((o) => o.ph !== 'windup'), '下がりながら技を出した').toBe(true);

    await page.reload();
    await setup(page, { debugOff: true });
    const r2 = await run(false);
    expect(r2.retreats, '噛まれた（盾なし）のに飛び退いた').toBe(0);
    expect(errors).toEqual([]);
  });

  test('①b 壁を背にした竜の真下で盾を構えても、横・斜めへ逃げて向き直り、レーザーの予告（2026-10-17 ユーザーのスクショの配置）', async ({ page }) => {
    const errors = await setup(page, { debugOff: true });
    const r = await page.evaluate(() => {
      const g = window.__game;
      const id = g.getEnemies()[0].id;
      const pl = g.getPlayer();
      // 竜＝体 (4..6, 1..3)・下向き＝背中が北の壁。プレイヤー＝真下 (5,4)・竜の方（上）を向く
      g.setEnemyFieldForTest(id, { x: 4, y: 1, dir: 'down', speed: 0, _aspTurnAt: 1e12, _aspPhase: 'idle', _aspAt: null,
        _aspRetreat: null, _aspHold: false, _aspRetreats: 0 });
      pl.x = 10; pl.y = 8; g.step(14);
      g.setEnemyFieldForTest(id, { x: 4, y: 1, dir: 'down', _aspNext: 0, _freezeUntil: 0, _aspPhase: 'idle', _stalkTx: null });
      pl.x = 5; pl.y = 4; pl.hp = 40;
      g.setHeroDir('up');
      let bit = false, stopped = null;
      for (let t = 0; t < 50; t++) {
        pl.x = 5; pl.y = 4;
        const wasRet = g.getEnemies()[0].aspRetreating;
        g.step(1);
        const e = g.getEnemies()[0];
        if (e.aspKind === 'bite') bit = true;
        // 逃げ終わった tick（直前まで逃げていて、今は逃げていない）の様子＝向き直りの待ち（turnMs）を挟まない
        if (wasRet && !e.aspRetreating) { stopped = { dir: e.dir, kind: e.aspKind, phase: e.aspPhase }; break; }
      }
      const e = g.getEnemies()[0];
      return { bit, stopped, retreats: e.aspRetreats ?? 0, x: e.x, y: e.y, dir: e.dir, kind: e.aspKind, phase: e.aspPhase,
               warn: !!e.laserWarn };
    });
    expect(r.bit, '前提：噛みつきの予告が立つ').toBe(true);
    expect(r.retreats, '盾で防いだのに逃げない').toBe(1);
    expect(r.x, '真後ろが壁なのに横へ逃げない').not.toBe(4);
    expect(r.stopped, '逃げ終わらない').not.toBeNull();
    expect([r.stopped.phase, r.stopped.kind], '逃げ終わった瞬間にレーザーの予告が立たない（向き直していない）').toEqual(['windup', 'beam']);
    expect(r.warn, 'レーザーの予告の形が無い').toBe(true);
    expect(errors).toEqual([]);
  });

  test('② 正面で噛みつきの外なら、向き直るたび交互に「間合いを保つ」番＝寄らず、近ければ下がる', async ({ page }) => {
    const errors = await setup(page);
    const r = await page.evaluate(() => {
      const g = window.__game;
      const id = g.getEnemies()[0].id;
      const pl = g.getPlayer();
      // 竜＝体 (4..6)・右向き。プレイヤー＝正面 (8,4)＝enemyEdgeDist 2（噛みつき 1.2 の外・keepMin 3 の内）
      g.setEnemyFieldForTest(id, { x: 4, y: 3, dir: 'right', _aspPhase: 'idle', _aspAt: null,
        _aspNext: 1e12, _freezeUntil: 0, _aspTurnAt: 0, _aspHold: false, _aspHoldSeq: 0, _stalkTx: null });
      g.setHeroDir('left');
      const log = [];
      for (let t = 0; t < 60; t++) {
        pl.x = 8; pl.y = 4; pl.hp = 40;
        const before = g.getEnemies()[0];
        const bx = before.x, by = before.y;
        g.step(1);
        const e = g.getEnemies()[0];
        log.push({ hold: e.aspHold, dx: e.x - bx, dy: e.y - by, x: e.x, dir: e.dir });
      }
      return log;
    });
    const holds = r.filter((o) => o.hold);
    expect(holds.length, '間合いを保つ番が一度も来ない').toBeGreaterThan(0);
    expect(r.some((o) => !o.hold), '毎回保つ＝回り込みの番が来ない').toBe(true);
    // 保つ番の間は寄らない（右＝プレイヤーの方へは1歩も出ない）
    expect(holds.every((o) => !(o.dir === 'right' && o.dx > 0)), '保つ番なのにプレイヤーへ寄った').toBe(true);
    // 近い（keepMin の内）ので下がる歩が少なくとも1回ある
    expect(holds.some((o) => o.dir === 'right' && o.dx < 0), '近いのに下がらない').toBe(true);
    expect(errors).toEqual([]);
  });

  test('③ 金の棘：相3に入った最初の tick に降り、地上でも groundEveryMs ごとに降る（着地を待たない）', async ({ page }) => {
    const errors = await setup(page);
    const r = await page.evaluate((dmg) => {
      const g = window.__game;
      const id = g.getEnemies()[0].id;
      const pl = g.getPlayer();
      pl.x = 2; pl.y = 7;
      g.step(1);
      const before = g.getEnemies()[0].thornWaves ?? 0;
      g.dealDamage(id, dmg, 'arrow', 0, 0);
      g.step(1);
      const e1 = g.getEnemies()[0];
      const entry = { waves: (e1.thornWaves ?? 0) - before, thorns: g.getThorns().length, dives: e1.soarDives ?? 0, soar: e1.soarPhase };
      // 地上に留めたまま（滞空へ移らない）時計だけで次の波が来るか
      const waves = [];
      for (let t = 1; t <= 60; t++) {
        g.setEnemyFieldForTest(id, { _soarPhase: 'ground', _soarAt: 1e15 });
        pl.x = 2; pl.y = 7; pl.hp = 40;
        g.step(1);
        const e = g.getEnemies()[0];
        if ((e.thornWaves ?? 0) > entry.waves + before + waves.length) waves.push({ t, dives: e.soarDives ?? 0 });
      }
      return { before, entry, waves };
    }, PHASE3_DMG);
    expect(r.before, '前提：相の前は降っていない').toBe(0);
    expect(r.entry.waves, '相3に入った瞬間に降らない').toBe(1);
    expect(r.entry.thorns, '相3に入った瞬間の棘が床に無い').toBeGreaterThan(0);
    expect(r.waves.length, '地上で時計の波が来ない').toBeGreaterThanOrEqual(1);
    const everyTicks = Math.ceil(P3.thorns.groundEveryMs / 120);
    expect(r.waves[0].t, '時計の波が groundEveryMs より早い／遅い').toBeGreaterThanOrEqual(everyTicks - 1);
    expect(r.waves[0].t).toBeLessThanOrEqual(everyTicks + 1);
    expect(r.waves.length, '2回目の時計の波が来ない').toBeGreaterThanOrEqual(2);
    expect(Math.abs((r.waves[1].t - r.waves[0].t) - everyTicks), '2回目までの間隔が groundEveryMs でない').toBeLessThanOrEqual(1);
    expect(r.waves.every((w) => w.dives === r.entry.dives), '着地で降った（時計を測れていない）').toBe(true);
    expect(errors).toEqual([]);
  });
});
