// 金翼の邪竜 Ω（キュー76③-3・2026-10-16）＝相3「金の棘」の番人。
//
//   ① データ：HP 33% の相で `thorns` が生える・相2の滞空は書かない（続く）・予告の猶予・打点
//   ② 相の前の着地では降らない／相の後の着地で降る＝プレイヤーの隣接8セルと竜の体には落ちない・
//      予告（warn）の後に立つ（up）・相3でも炎の帯は吐き続ける
//   ③ 立った棘はプレイヤーを通さない（予告中の印は通れる）
//   ④ 剣の1振りで1本壊れる／床の棘を全部壊すと竜が怯む（1回）／寿命で消えても怯まない
//   ⑤ 落ちる瞬間に下に居ると打点（その棘は立たない）・予告を見て出れば当たらない
//   ⑥ 何回降っても、プレイヤーは部屋の床の半分以上へ歩いて行ける（閉じ込めない）
//
// 測り方：主の間（dragon_lair 1,0）で HP を 33% 未満に削って相を起こす（`dealDamage`＝防御を通る∴
// def を足す）。被弾を測る本は `g` でデバッグ（無敵）を切る（GUIDE §7-16）。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';

const META = ENEMY_META[TILE.GOLD_DRAGON];
const P2 = META.phases?.find((p) => p.soar);
const P3 = META.phases?.find((p) => p.thorns);
const URL = '/blade-of-lumia/game/?fromEditor=1&layer=dragon_lair&stage=1,0&row=4&col=1&ps_weapon=1&ps_hearts=20&ps_shield=0';
const PHASE2_DMG = Math.ceil(META.hp * (1 - (P2?.hpThreshold ?? 0.66))) + META.def + 1;
const PHASE3_DMG = Math.ceil(META.hp * (1 - (P3?.hpThreshold ?? 0.33))) + META.def + 1;
// 主の間の床（12×10 の内側）
const FLOOR = { x0: 1, x1: 10, y0: 1, y1: 8 };

async function setup(page, { debugOff = false, dmg = PHASE3_DMG } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await waitForBoard(page);
  if (debugOff) await page.keyboard.press('g');
  await page.waitForFunction(() => window.__game.getEnemies().length === 1, null, { timeout: 10_000 });
  await page.evaluate((dmg) => {
    const g = window.__game;
    g.pause();
    if (dmg > 0) g.dealDamage(g.getEnemies()[0].id, dmg, 'arrow', 0, 0);
  }, dmg);
  return errors;
}

/** プレイヤーを (px,py) に留めたまま、竜が棘を降らせようとする（着地する）まで進める。 */
const stepUntilWave = (page, { px = 2, py = 2, maxTicks = 400 } = {}) => page.evaluate(({ px, py, maxTicks }) => {
  const g = window.__game;
  const pl = g.getPlayer();
  const w0 = g.getEnemies()[0].thornWaves ?? 0;
  const d0 = g.getEnemies()[0].soarDives ?? 0;
  for (let t = 0; t < maxTicks; t++) {
    pl.x = px; pl.y = py; pl.hp = 40;
    g.step(1);
    const e = g.getEnemies()[0];
    if ((e.thornWaves ?? 0) > w0 || (e.soarDives ?? 0) > d0) {
      return { t, landed: true, waves: (e.thornWaves ?? 0) - w0, thorns: g.getThorns(),
               dragon: { x: e.x, y: e.y, w: 3, h: 3 }, player: { x: pl.x, y: pl.y } };
    }
  }
  return null;
}, { px, py, maxTicks });

const gapOf = (c, r, px, py) => Math.max(
  Math.max(0, px - (c + 1), c - (px + 1)), Math.max(0, py - (r + 1), r - (py + 1)));
const overlaps = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;

test.describe('金翼の邪竜 Ω：相3 金の棘', () => {
  test('① データ：HP33% で金の棘が生える・猶予と打点', () => {
    expect(META.thorns, '基底に thorns を持つと相1から降る').toBeUndefined();
    expect(P3, '相3（thorns を持つ相）が無い').toBeTruthy();
    expect(P3.hpThreshold).toBe(0.33);
    expect(P3.soar, '相3に soar を書くと相2の滞空を上書きする（書かなければ続く）').toBeUndefined();
    expect(P3.thorns.atk, '新しい最大打点を作らない').toBeLessThanOrEqual(META.atk);
    // 落ちる1セルの外へ出るのに要る歩数＝半セル位置でも 1 セル＝2 tick。予告の歩数 × 0.5 が上回る。
    expect(Math.floor(P3.thorns.warnMs / 120) * 0.5, '予告のあいだに落ちる場所から出られない').toBeGreaterThan(1);
    // 後半でも予告は縮めない（GUIDE §7-16）＝相1の尾の予告以上
    expect(P3.thorns.warnMs).toBeGreaterThanOrEqual(META.aspect.tail.windupMs);
    // キュー76⑥（2026-10-17 ユーザー判定「プレイヤーが今いる位置から移動しないとダメージを受ける状態を作る」）：
    // 旧「隙間 1〜3 セルに散らす（ringMin/ringMax/count）」は失効＝足元の3×3＋移動先を読む2撃目。
    expect(P3.thorns.ringMin, '旧の散らす設定が残っている').toBeUndefined();
    expect(P3.thorns.block, '足元の3×3').toBe(1);
    expect(P3.thorns.follow, '2撃目（移動先を読む）').toBe(true);
    // 3×3 の外へ出る歩数（中心から block+1 セル）＜ 予告のあいだに歩ける歩数
    expect(Math.floor(P3.thorns.warnMs / 120) * 0.5, '予告のあいだに3×3の外へ出られない').toBeGreaterThan(P3.thorns.block + 1 - 1e-9);
    expect(P3.thorns.maxOnFloor, '2撃ぶん置けない').toBeGreaterThanOrEqual(2 * (2 * P3.thorns.block + 1) ** 2);
    expect(P3.thorns.stunMs).toBeGreaterThan(0);
    expect(P3.thorns.reachRatio).toBeGreaterThanOrEqual(0.5);
  });

  test('② 相の前の着地では降らない／相の後は足元の3×3（竜の体は除く）に降り、予告の後に立つ', async ({ page }) => {
    const errors = await setup(page, { dmg: PHASE2_DMG });
    const before = await stepUntilWave(page);
    expect(before?.landed, '相2で一度も着地しない').toBe(true);
    expect(before.thorns, '相3の前の着地で棘が降った').toEqual([]);
    // 相3 へ
    await page.evaluate((dmg) => {
      const g = window.__game;
      g.dealDamage(g.getEnemies()[0].id, dmg, 'arrow', 0, 0);
    }, PHASE3_DMG - PHASE2_DMG + META.def);   // 2回目の dealDamage も防御を通る＝def ぶん足す
    const w = await stepUntilWave(page);
    expect(w?.landed, '相3で着地しない').toBe(true);
    expect(w.thorns.length, '着地で棘が降らない').toBeGreaterThanOrEqual(1);
    expect(w.thorns.length).toBeLessThanOrEqual((2 * P3.thorns.block + 1) ** 2);
    for (const t of w.thorns) {
      expect(t.phase, '降った直後は予告').toBe('warn');
      expect(Math.max(Math.abs(t.r - w.player.y), Math.abs(t.c - w.player.x)), `棘 (${t.r},${t.c}) が足元の3×3の外`).toBeLessThanOrEqual(P3.thorns.block);
      expect(overlaps(t.c, t.r, 1, 1, w.dragon.x, w.dragon.y, 3, 3), '竜の体の下に落ちる').toBe(false);
    }
    expect(w.thorns.some((t) => t.r === w.player.y && t.c === w.player.x), '足元に落ちない').toBe(true);
    // 予告の長さの後に立つ（予告の1 tick 前はまだ warn）
    const r = await page.evaluate(({ warnTicks, ids }) => {
      const g = window.__game;
      const pl = g.getPlayer();
      const seq = [];
      for (let t = 0; t <= warnTicks + 1; t++) {
        pl.x = 2; pl.y = 2; pl.hp = 40;
        g.step(1);
        // 1撃目の棘だけ（2撃目＝移動先を読む波は同じ tick に新しく予告で降る）
        seq.push(g.getThorns().filter((o) => ids.includes(o.id)).map((o) => o.phase).join(','));
      }
      // 相3 でも炎の帯を吐き続ける（相2の滞空が続く）
      const b0 = g.getEnemies()[0].soarBreaths ?? 0;
      for (let t = 0; t < 300; t++) { pl.x = 2; pl.y = 2; pl.hp = 40; g.step(1); }
      return { seq, breaths: (g.getEnemies()[0].soarBreaths ?? 0) - b0, phases: g.getEnemies()[0].phasesTriggered };
    }, { warnTicks: Math.ceil(P3.thorns.warnMs / 120), ids: w.thorns.map((t) => t.id) });
    expect(r.seq[0]).toMatch(/warn/);
    expect(r.seq[r.seq.length - 1], '予告の後に立たない').toMatch(/^(up,?)+$/);
    expect(r.phases).toEqual([0.66, 0.33]);
    expect(r.breaths, '相3で炎の帯を吐かなくなった（相2の滞空が消えた）').toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('③ 立った棘はプレイヤーを通さない', async ({ page }) => {
    const errors = await setup(page);
    const w = await stepUntilWave(page);
    expect(w?.thorns.length).toBeGreaterThanOrEqual(1);
    const r = await page.evaluate(({ warnTicks, floor }) => {
      const g = window.__game;
      const pl = g.getPlayer();
      const e = g.getEnemies()[0];
      // 竜は止めておく（体で塞がれたのか棘で塞がれたのかを混ぜない）
      g.setEnemyFieldForTest(e.id, { _freezeUntil: 1e12 });
      for (let t = 0; t < warnTicks + 1; t++) { pl.x = 2; pl.y = 2; g.step(1); }
      const th = g.getThorns().filter((o) => o.phase === 'up');
      const out = [];
      for (const t of th) {
        // 棘の隣の床から棘へ向かって歩く
        for (const [dx, dy, dir] of [[-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down'], [0, 1, 'up']]) {
          const sx = t.c + dx, sy = t.r + dy;
          if (sx < floor.x0 || sx > floor.x1 || sy < floor.y0 || sy > floor.y1) continue;
          if (g.getThorns().some((o) => o.r === sy && o.c === sx)) continue;
          const d = g.getEnemies()[0];
          if (sx < d.x + 3 && d.x < sx + 1 && sy < d.y + 3 && d.y < sy + 1) continue;
          pl.x = sx; pl.y = sy;
          // 半マス×2 だけ押す（4歩だと通り抜けた先に出て「中に居ない」になる＝歯が抜ける）
          for (let k = 0; k < 2; k++) { g.movePlayer(dir); g.step(1); }
          const inside = pl.x !== sx || pl.y !== sy;
          out.push({ thorn: `${t.r},${t.c}`, dir, inside });
          break;
        }
      }
      return out;
    }, { warnTicks: Math.ceil(P3.thorns.warnMs / 120), floor: FLOOR });
    expect(r.length, '棘の隣に立てる床が無い（測れていない）').toBeGreaterThanOrEqual(1);
    for (const o of r) expect(o.inside, `棘 ${o.thorn} へ ${o.dir} に1歩でも進めた`).toBe(false);
    expect(errors).toEqual([]);
  });

  test('④ 剣の1振りで1本壊れる・全部壊すと怯む（1回）・寿命で消えても怯まない', async ({ page }) => {
    const errors = await setup(page);
    const w = await stepUntilWave(page);
    expect(w?.thorns.length).toBeGreaterThanOrEqual(2);
    const r = await page.evaluate(({ warnTicks, floor }) => {
      const g = window.__game;
      const pl = g.getPlayer();
      const id = g.getEnemies()[0].id;
      // キュー76⑥: 壊す仕組みだけを測る＝2撃目（移動先を読む）は止める
      g.setEnemyFieldForTest(id, { _thornFollow: null, _thornTimerAt: 1e12, _thorns: { ...g.getEnemies()[0].thorns, follow: false } });
      for (let t = 0; t < warnTicks + 1; t++) { pl.x = 2; pl.y = 2; g.step(1); }
      // 竜を棘から離れた隅へ置いて止める（剣が竜に吸われない・竜の体で塞がれない）
      const th0 = g.getThorns();
      const corners = [[1, 1], [8, 1], [1, 6], [8, 6]];
      const far = corners.map(([x, y]) => ({ x, y, d: Math.min(...th0.map((t) => Math.hypot(t.c - x - 1, t.r - y - 1))) }))
        .sort((a, b) => b.d - a.d)[0];
      g.setEnemyFieldForTest(id, { x: far.x, y: far.y, _freezeUntil: 1e12, stunUntil: 0 });
      const log = [];
      // 3×3 の塊＝真ん中の棘は隣が全部棘＝外側から壊していく（毎回「隣に立てる棘」を選び直す）
      const canReach = (t) => [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => {
        const sx = t.c + dx, sy = t.r + dy;
        if (sx < floor.x0 || sx > floor.x1 || sy < floor.y0 || sy > floor.y1) return false;
        if (g.getThorns().some((o) => o.r === sy && o.c === sx)) return false;
        const d = g.getEnemies()[0];
        return !(sx < d.x + 3 && d.x < sx + 1 && sy < d.y + 3 && d.y < sy + 1);
      });
      for (let n = 0; n < th0.length; n++) {
        const t = g.getThorns().find(canReach) ?? g.getThorns()[0];
        if (!t) break;
        const before = g.getThorns().length;
        let swung = false;
        for (const [dx, dy, dir] of [[-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down'], [0, 1, 'up']]) {
          const sx = t.c + dx, sy = t.r + dy;
          if (sx < floor.x0 || sx > floor.x1 || sy < floor.y0 || sy > floor.y1) continue;
          if (g.getThorns().some((o) => o.r === sy && o.c === sx)) continue;
          const d = g.getEnemies()[0];
          if (sx < d.x + 3 && d.x < sx + 1 && sy < d.y + 3 && d.y < sy + 1) continue;
          pl.x = sx; pl.y = sy;
          g.setHeroDir(dir);
          for (let k = 0; k < 4; k++) g.step(1);   // 剣のクールダウン（300ms）を明ける
          g.swordAttack();
          swung = true;
          break;
        }
        const e = g.getEnemies()[0];
        log.push({ swung, removed: before - g.getThorns().length, left: g.getThorns().length,
                   stuns: e.thornStuns ?? 0, broken: e.thornsBroken ?? 0, stunned: (e.stunUntil ?? 0) > 0 });
      }
      return log;
    }, { warnTicks: Math.ceil(P3.thorns.warnMs / 120), floor: FLOOR });
    for (const o of r) {
      expect(o.swung, '棘の隣に立てなかった（測れていない）').toBe(true);
      expect(o.removed, '剣の1振りで棘が1本壊れない').toBe(1);
    }
    // 最後の1本を壊すまで怯まない＝1本ごとに怯ませない（GUIDE §7-14）
    for (const o of r.slice(0, -1)) expect(o.stuns, '全部壊す前に怯んだ').toBe(0);
    expect(r[r.length - 1].left).toBe(0);
    expect(r[r.length - 1].stuns, '全部壊したのに怯まない').toBe(1);
    expect(r[r.length - 1].stunned).toBe(true);

    // 寿命で消えた棘は数えない（怯まない）
    const life = await page.evaluate(({ lifeTicks, warnTicks }) => {
      const g = window.__game;
      const pl = g.getPlayer();
      const id = g.getEnemies()[0].id;
      g.setEnemyFieldForTest(id, { _freezeUntil: 0, stunUntil: 0 });
      const s0 = g.getEnemies()[0].thornStuns ?? 0;
      // 次の波を待つ
      let waved = false;
      const w0 = g.getEnemies()[0].thornWaves ?? 0;
      for (let t = 0; t < 600 && !waved; t++) {
        pl.x = 2; pl.y = 2; pl.hp = 40; g.step(1);
        waved = (g.getEnemies()[0].thornWaves ?? 0) > w0 && g.getThorns().length > 0;
      }
      // 棘を壊さずに寿命まで待つ（竜は止める＝次の波を降らせない）
      // キュー76⑥: 地上の時計（groundEveryMs）も止める
      g.setEnemyFieldForTest(id, { _freezeUntil: 1e12, _thornTimerAt: 1e12 });
      for (let t = 0; t < warnTicks + lifeTicks + 2; t++) { pl.x = 2; pl.y = 2; pl.hp = 40; g.step(1); }
      return { waved, left: g.getThorns().length, stuns: (g.getEnemies()[0].thornStuns ?? 0) - s0 };
    }, { lifeTicks: Math.ceil(P3.thorns.lifeMs / 120), warnTicks: Math.ceil(P3.thorns.warnMs / 120) });
    expect(life.waved, '2回目の波が来ない').toBe(true);
    expect(life.left, '寿命で消えない').toBe(0);
    expect(life.stuns, '寿命で消えたのに怯んだ').toBe(0);
    expect(errors).toEqual([]);
  });

  test('⑤ 落ちる瞬間に下に居ると打点・予告を見て出れば当たらない', async ({ page }) => {
    const errors = await setup(page, { debugOff: true });
    const r = await page.evaluate(({ warnTicks }) => {
      const g = window.__game;
      const pl = g.getPlayer();
      const id = g.getEnemies()[0].id;
      // 無敵窓（竜の別の技で被弾した直後の 1500ms）が棘の落ちる時刻より前に明けている波を選ぶ
      // （無敵窓が打点を飲むと「当たった／当たらない」の両方に間違った理由が付く・GUIDE §7-7）。
      // ⚠️ 着地の直前は炎の帯＝固定の立ち位置だと毎回焼かれて無敵窓が棘の落ちる時刻を覆う∴
      //    帯の予告が立ったら帯の外の床へ移る（＝実プレイの答えどおりに避ける）。
      const spots = [[2, 2], [9, 2], [9, 7], [2, 7], [5, 1], [5, 8], [1, 4], [10, 4]];
      let at = [2, 2];
      for (let wave = 0; wave < 8; wave++) {
        g.setEnemyFieldForTest(id, { _freezeUntil: 0 });
        const w0 = g.getEnemies()[0].thornWaves ?? 0;
        for (let t = 0; t < 600 && (g.getEnemies()[0].thornWaves ?? 0) === w0; t++) {
          const e = g.getEnemies()[0];
          const b = e.soarBand;
          const inBand = ([x, y]) => b && x < b.left + b.w && b.left < x + 1 && y < b.top + b.h && b.top < y + 1;
          const inBody = ([x, y]) => x < e.x + 3 && e.x < x + 1 && y < e.y + 3 && e.y < y + 1;
          if (inBand(at)) at = spots.find((s) => !inBand(s) && !inBody(s)) ?? at;
          pl.x = at[0]; pl.y = at[1]; pl.hp = 40; g.step(1);
        }
        const stay = g.getThorns().find((o) => o.phase === 'warn');
        if (!stay) continue;
        if ((g.getState().player.invincibleUntil ?? 0) >= stay.at) continue;
        g.setEnemyFieldForTest(id, { _freezeUntil: 1e12 });
        // 予告の印の上に立ち続ける
        pl.hp = 40;
        for (let t = 0; t < warnTicks + 1; t++) { pl.x = stay.c; pl.y = stay.r; g.step(1); }
        const e = g.getEnemies()[0];
        return {
          hpLost: 40 - pl.hp, hits: e.thornHits ?? 0,
          stayLeft: g.getThorns().some((o) => o.id === stay.id),
          others: g.getThorns().filter((o) => o.id !== stay.id && o.at === stay.at).map((o) => o.phase),
        };
      }
      return null;
    }, { warnTicks: Math.ceil(P3.thorns.warnMs / 120) });
    expect(r, '無敵窓の明けた波が来ない').not.toBeNull();
    expect(r.hits, '印の上に立ち続けたのに当たらない').toBe(1);
    expect(r.hpLost).toBeGreaterThan(0);
    expect(r.stayLeft, '下に居た棘が立った（プレイヤーに重なる）').toBe(false);
    for (const p of r.others) expect(p, '印の外の棘が立たない').toBe('up');

    // 次の波：印から出れば当たらない
    const r2 = await page.evaluate(({ warnTicks }) => {
      const g = window.__game;
      const pl = g.getPlayer();
      const id = g.getEnemies()[0].id;
      g.setEnemyFieldForTest(id, { _freezeUntil: 0 });
      const h0 = g.getEnemies()[0].thornHits ?? 0;
      const w0 = g.getEnemies()[0].thornWaves ?? 0;
      let target = null;
      for (let t = 0; t < 900 && !target; t++) {
        pl.x = 2; pl.y = 2; pl.hp = 40; g.step(1);
        if ((g.getEnemies()[0].thornWaves ?? 0) > w0) target = g.getThorns().find((o) => o.phase === 'warn') ?? null;
      }
      if (!target) return null;
      g.setEnemyFieldForTest(id, { _freezeUntil: 1e12 });
      // 1 tick だけ印の上・残りはどの印とも重ならない床で待つ（キュー76⑥：足元も狙う＝元の立ち位置も印になる）
      const marks = g.getThorns().map((o) => `${o.r},${o.c}`);
      const e0 = g.getEnemies()[0];
      const safe = [[9, 7], [2, 7], [9, 2], [5, 8], [1, 4], [10, 4], [5, 1]].find(([x, y]) =>
        !marks.includes(`${y},${x}`) && !(x < e0.x + 3 && e0.x < x + 1 && y < e0.y + 3 && e0.y < y + 1));
      pl.x = target.c; pl.y = target.r; g.step(1);
      for (let t = 0; t < warnTicks + 1; t++) { pl.x = safe[0]; pl.y = safe[1]; pl.hp = 40; g.step(1); }
      return { hits: (g.getEnemies()[0].thornHits ?? 0) - h0, stood: g.getThorns().some((o) => o.id === target.id && o.phase === 'up') };
    }, { warnTicks: Math.ceil(P3.thorns.warnMs / 120) });
    expect(r2, '2回目の波が来ない').not.toBeNull();
    expect(r2.hits, '印から出たのに当たった').toBe(0);
    expect(r2.stood, '誰も居ない印に棘が立たない').toBe(true);
    expect(errors).toEqual([]);
  });

  test('⑥ 何回降っても、足元を狙いつつ予告のあいだに抜けられる道を残し、竜の体には落ちず、上限を守り、部屋の床の半分以上へ歩いて行ける', async ({ page }) => {
    const errors = await setup(page);
    const r = await page.evaluate(({ floor, ratio, budget }) => {
      const g = window.__game;
      const pl = g.getPlayer();
      const id = g.getEnemies()[0].id;
      // 寿命を延ばして床の上限まで積もらせる（素の寿命 8 秒＜波の間隔＝上限に届かず測れない）
      g.setEnemyFieldForTest(id, { _thorns: { ...g.getEnemies()[0].thorns, lifeMs: 1e9 } });
      const bad = [];
      const seenIds = new Set();
      // プレイヤーは部屋の中を巡回する（いろいろな場所で棘が降る）
      // 扉の隣（西 (1,4)・東 (10,5)）と隅（(1,1)・(10,8)）も通る＝外周と抜け道の確認を試す
      const path = [[2, 2], [9, 2], [1, 4], [9, 7], [10, 8], [2, 7], [1, 1], [5, 4], [10, 5]];
      let worst = Infinity, waves = 0, maxOnFloor = 0, footWaves = 0;
      const total = (floor.x1 - floor.x0 + 1) * (floor.y1 - floor.y0 + 1);
      let w0 = g.getEnemies()[0].thornWaves ?? 0;
      for (let t = 0; t < 1500; t++) {
        const [px, py] = path[Math.floor(t / 37) % path.length];
        // 巡回先が棘なら今の場所に留まる
        if (!g.getThorns().some((o) => o.r === py && o.c === px && o.phase === 'up')) { pl.x = px; pl.y = py; }
        pl.hp = 40;
        g.step(1);
        const e = g.getEnemies()[0];
        maxOnFloor = Math.max(maxOnFloor, g.getThorns().length);
        if ((e.thornWaves ?? 0) > w0) {
          w0 = e.thornWaves; waves++;
          // 降った直後の棘＝竜の体の下に落ちていない（波ごとに全部見る）
          for (const o of g.getThorns()) {
            if (seenIds.has(o.id)) continue;
            seenIds.add(o.id);
            if (o.r === pl.y && o.c === pl.x) footWaves++;
            if (o.c < e.x + 3 && e.x < o.c + 1 && o.r < e.y + 3 && e.y < o.r + 1) bad.push(`体の下 ${o.r},${o.c}`);
            // 外周（壁の列・閉じた扉 `:`）に落ちない（キュー76⑥：西の扉に予告が出ていた）
            if (o.c < floor.x0 || o.c > floor.x1 || o.r < floor.y0 || o.r > floor.y1) bad.push(`外周 ${o.r},${o.c}`);
          }
          const blocked = new Set(g.getThorns().map((o) => `${o.r},${o.c}`));
          // 抜け道＝予告のあいだに歩ける歩数で、立っている棘・竜の体・壁を避けて、予告の印の外へ出られる
          const up = new Set(g.getThorns().filter((o) => o.phase === 'up').map((o) => `${o.r},${o.c}`));
          const warn = new Set(g.getThorns().filter((o) => o.phase === 'warn').map((o) => `${o.r},${o.c}`));
          if (warn.has(`${pl.y},${pl.x}`)) {
            let fr = [[pl.y, pl.x]]; const sn = new Set([`${pl.y},${pl.x}`]); let out = false;
            for (let d = 0; d < budget && !out; d++) {
              const nx = [];
              for (const [rr, cc] of fr) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = rr + dr, nc = cc + dc, k = `${nr},${nc}`;
                if (sn.has(k) || up.has(k)) continue;
                if (nc < floor.x0 || nc > floor.x1 || nr < floor.y0 || nr > floor.y1) continue;
                if (nc < e.x + 3 && e.x < nc + 1 && nr < e.y + 3 && e.y < nr + 1) continue;
                if (!warn.has(k)) { out = true; break; }
                sn.add(k); nx.push([nr, nc]);
              }
              fr = nx;
            }
            if (!out) bad.push(`抜け道なし ${pl.y},${pl.x}`);
          }
          const r0 = Math.floor(pl.y + 0.5), c0 = Math.floor(pl.x + 0.5);
          const seen = new Set([`${r0},${c0}`]);
          const q = [[r0, c0]];
          while (q.length) {
            const [rr, cc] = q.shift();
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nr = rr + dr, nc = cc + dc, k = `${nr},${nc}`;
              if (seen.has(k) || blocked.has(k)) continue;
              if (nc < floor.x0 || nc > floor.x1 || nr < floor.y0 || nr > floor.y1) continue;
              seen.add(k); q.push([nr, nc]);
            }
          }
          worst = Math.min(worst, seen.size / total);
        }
      }
      return { worst, waves, maxOnFloor, bad, total: seenIds.size, footWaves };
    }, { floor: FLOOR, ratio: P3.thorns.reachRatio, budget: Math.floor(Math.floor(P3.thorns.warnMs / 120) * 0.5) });
    expect(r.waves, '1500 tick で棘が3回も降らない').toBeGreaterThanOrEqual(3);
    expect(r.maxOnFloor, '床の棘が上限を超えた').toBeLessThanOrEqual(P3.thorns.maxOnFloor);
    expect(r.maxOnFloor, '上限まで積もっていない（上限を測れていない）').toBe(P3.thorns.maxOnFloor);
    expect(r.bad, '抜け道の無い波／竜の体の下に棘が落ちた').toEqual([]);
    expect(r.footWaves, '足元を一度も狙わない（プレイヤーの周辺を狙っていない）').toBeGreaterThan(0);
    expect(r.worst, '棘で部屋の半分以上へ歩けなくなった').toBeGreaterThanOrEqual(P3.thorns.reachRatio);
    expect(errors).toEqual([]);
  });

  test('⑦ 立ち止まると2撃とも当たる／まっすぐ逃げ続けると2撃目（移動先を読む）に当たる／逃げて向きを変えれば無傷', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const run = async (policy) => {
      await page.goto(URL);
      await waitForBoard(page);
      await page.waitForFunction(() => window.__game.getEnemies().length === 1, null, { timeout: 10_000 });
      return page.evaluate(({ policy, dmg }) => {
        const g = window.__game;
        g.pause();
        const id = g.getEnemies()[0].id;
        const pl = g.getPlayer();
        pl.x = 2; pl.y = 7; g.step(1);
        g.dealDamage(id, dmg, 'arrow', 0, 0);
        // 竜は右上の隅で止める（体が逃げ道に絡まない・他の技を出さない）
        g.setEnemyFieldForTest(id, { x: 8, y: 1, speed: 0, _freezeUntil: 1e12, _aspNext: 1e12 });
        let t0 = null;
        for (let t = 0; t < 24; t++) {
          if (t0 == null && g.getThorns().some((o) => o.phase === 'warn')) t0 = t;
          if (t0 != null) {
            const k = t - t0;
            if (policy === 'straight') g.movePlayer('right');
            if (policy === 'turn') g.movePlayer(k < 4 ? 'right' : 'up');
          }
          g.step(1);
        }
        const e = g.getEnemies()[0];
        return { hits: e.thornHits ?? 0, follows: e.thornFollows ?? 0, waves: e.thornWaves ?? 0 };
      }, { policy, dmg: PHASE3_DMG });
    };
    const still = await run('still');
    expect(still.waves, '前提：相3に入った瞬間に降る').toBe(1);
    expect(still.follows, '2撃目が降らない').toBe(1);
    expect(still.hits, '立ち止まったのに2撃とも当たらない').toBe(2);
    const straight = await run('straight');
    expect(straight.hits, 'まっすぐ逃げ続けたのに2撃目が当たらない（移動先を読めていない）／1撃目が避けられない').toBe(1);
    const turn = await run('turn');
    expect(turn.hits, '逃げて向きを変えたのに当たった（避けようがない）').toBe(0);
    expect(errors).toEqual([]);
  });

  test('⑧ 閉じ込めない：四方が塞がれたら隣の棘が崩れる／竜は自分の棘を踏み潰して進む', async ({ page }) => {
    // (a) 2026-10-17 ユーザーのスクショの形＝西が壁・東が竜の体（西の扉 rows 4-5 は避ける）。足元の3×3が落ちると南北の棘で四方が塞がる
    //     （壁と棘だけで囲む置き方は既存の「床の半分へ歩ける」確認が弾く＝竜の体が絡んだときだけ起きる）→ 崩れて動ける
    const errors = await setup(page, { dmg: 0 });
    const a = await page.evaluate(({ warnTicks, dmg }) => {
      const g = window.__game;
      const id = g.getEnemies()[0].id;
      const pl = g.getPlayer();
      g.setEnemyFieldForTest(id, { x: 2, y: 1, speed: 0, _freezeUntil: 1e12, _aspNext: 1e12 });
      pl.x = 1; pl.y = 2; pl.hp = 40;
      g.dealDamage(id, dmg, 'arrow', 0, 0);
      g.step(1);   // 相3に入った最初の tick＝足元の3×3
      g.setEnemyFieldForTest(id, { _thornTimerAt: 1e12, _thornFollow: null });
      const warned = g.getThorns().filter((t) => t.phase === 'warn').map((t) => `${t.r},${t.c}`).sort();
      for (let t = 0; t < warnTicks + 2; t++) { pl.x = 1; pl.y = 2; pl.hp = 40; g.step(1); }
      const left = g.getThorns().filter((t) => t.phase === 'up').map((t) => `${t.r},${t.c}`);
      const y0 = pl.y;
      for (let k = 0; k < 2; k++) { g.movePlayer('down'); g.step(1); }
      return { warned, left, released: g.getEnemies()[0].thornsReleased ?? 0, moved: pl.y - y0 };
    }, { warnTicks: Math.ceil(P3.thorns.warnMs / 120), dmg: PHASE3_DMG });
    expect(a.warned, '前提：足元の3×3（竜の体と壁を除く3セル）に予告').toEqual(['1,1', '2,1', '3,1']);
    expect(a.released, '四方が塞がれたのに棘が崩れない').toBe(2);
    expect(a.left.filter((k) => k === '1,1' || k === '3,1'), '隣の棘が残っている').toEqual([]);
    expect(a.moved, '崩れた後も動けない').toBeGreaterThan(0);

    // (b) 竜の進む先に自分の棘 → 止まらず進み、重なった棘は砕ける（怯みの数には入らない）
    await page.reload();
    errors.push(...await setup(page, { dmg: 0 }));
    const b = await page.evaluate(({ warnTicks, dmg }) => {
      const g = window.__game;
      const id = g.getEnemies()[0].id;
      const pl = g.getPlayer();
      // 竜＝体 (3..5, 3..5)。プレイヤー (7,4) で相3に入る＝3×3 (6..8, 3..5) の西の列 6 が竜の東隣
      g.setEnemyFieldForTest(id, { x: 3, y: 3, speed: 0, _freezeUntil: 1e12, _aspNext: 1e12 });
      pl.x = 7; pl.y = 4;
      g.dealDamage(id, dmg, 'arrow', 0, 0);
      g.step(1);
      g.setEnemyFieldForTest(id, { _thornTimerAt: 1e12, _thornFollow: null });
      for (let t = 0; t < warnTicks + 2; t++) { pl.x = 10; pl.y = 8; pl.hp = 40; g.step(1); }
      const col6 = () => g.getThorns().filter((t) => t.phase === 'up' && t.c === 6 && t.r >= 3 && t.r <= 5).length;
      const before = col6();
      const s0 = g.getEnemies()[0].thornStuns ?? 0;
      // 飛び退きの仕組みで東へ2セル進ませる（地上の移動は isPassableForEnemy を通る）
      g.setEnemyFieldForTest(id, { _freezeUntil: 0, _aspRetreat: { tx: 5, ty: 3 } });
      for (let t = 0; t < 4; t++) { pl.x = 10; pl.y = 8; g.step(1); }
      const e = g.getEnemies()[0];
      return { before, x: e.x, crushed: e.thornsCrushed ?? 0, left: col6(), stuns: (e.thornStuns ?? 0) - s0 };
    }, { warnTicks: Math.ceil(P3.thorns.warnMs / 120), dmg: PHASE3_DMG });
    expect(b.before, '前提：竜の東隣に棘が立っている').toBe(3);
    expect(b.x, '自分の棘に足を止められた').toBe(5);
    expect(b.crushed, '重なった棘が砕けない').toBeGreaterThan(0);
    expect(b.left, '竜の体の下に棘が残っている').toBe(0);
    expect(b.stuns, '踏み潰しで怯んだ（壊した数に入っている）').toBe(0);
    expect(errors).toEqual([]);
  });
});
