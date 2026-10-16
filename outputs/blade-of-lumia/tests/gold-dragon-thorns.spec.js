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
    expect(P3.thorns.ringMin, '足元（隣接8セル）に落とさない').toBeGreaterThanOrEqual(1);
    expect(P3.thorns.count).toBeLessThanOrEqual(P3.thorns.maxOnFloor);
    expect(P3.thorns.stunMs).toBeGreaterThan(0);
    expect(P3.thorns.reachRatio).toBeGreaterThanOrEqual(0.5);
  });

  test('② 相の前の着地では降らない／相の後は隣接8セルと竜の体を避けて降り、予告の後に立つ', async ({ page }) => {
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
    expect(w.thorns.length).toBeLessThanOrEqual(P3.thorns.count);
    for (const t of w.thorns) {
      expect(t.phase, '降った直後は予告').toBe('warn');
      const g = gapOf(t.c, t.r, w.player.x, w.player.y);
      expect(g, `棘 (${t.r},${t.c}) がプレイヤーの隣接8セルに落ちる`).toBeGreaterThanOrEqual(P3.thorns.ringMin);
      expect(g).toBeLessThanOrEqual(P3.thorns.ringMax);
      expect(overlaps(t.c, t.r, 1, 1, w.dragon.x, w.dragon.y, 3, 3), '竜の体の下に落ちる').toBe(false);
    }
    // 予告の長さの後に立つ（予告の1 tick 前はまだ warn）
    const r = await page.evaluate((warnTicks) => {
      const g = window.__game;
      const pl = g.getPlayer();
      const seq = [];
      for (let t = 0; t <= warnTicks + 1; t++) {
        pl.x = 2; pl.y = 2; pl.hp = 40;
        g.step(1);
        seq.push(g.getThorns().map((o) => o.phase).join(','));
      }
      // 相3 でも炎の帯を吐き続ける（相2の滞空が続く）
      const b0 = g.getEnemies()[0].soarBreaths ?? 0;
      for (let t = 0; t < 300; t++) { pl.x = 2; pl.y = 2; pl.hp = 40; g.step(1); }
      return { seq, breaths: (g.getEnemies()[0].soarBreaths ?? 0) - b0, phases: g.getEnemies()[0].phasesTriggered };
    }, Math.ceil(P3.thorns.warnMs / 120));
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
      for (let t = 0; t < warnTicks + 1; t++) { pl.x = 2; pl.y = 2; g.step(1); }
      // 竜を棘から離れた隅へ置いて止める（剣が竜に吸われない・竜の体で塞がれない）
      const th0 = g.getThorns();
      const corners = [[1, 1], [8, 1], [1, 6], [8, 6]];
      const far = corners.map(([x, y]) => ({ x, y, d: Math.min(...th0.map((t) => Math.hypot(t.c - x - 1, t.r - y - 1))) }))
        .sort((a, b) => b.d - a.d)[0];
      g.setEnemyFieldForTest(id, { x: far.x, y: far.y, _freezeUntil: 1e12, stunUntil: 0 });
      const log = [];
      for (const t of th0) {
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
      g.setEnemyFieldForTest(id, { _freezeUntil: 1e12 });
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
      // 1 tick だけ印の上・残りは2セル離れた床で待つ
      pl.x = target.c; pl.y = target.r; g.step(1);
      for (let t = 0; t < warnTicks + 1; t++) { pl.x = 2; pl.y = 2; pl.hp = 40; g.step(1); }
      return { hits: (g.getEnemies()[0].thornHits ?? 0) - h0, stood: g.getThorns().some((o) => o.id === target.id && o.phase === 'up') };
    }, { warnTicks: Math.ceil(P3.thorns.warnMs / 120) });
    expect(r2, '2回目の波が来ない').not.toBeNull();
    expect(r2.hits, '印から出たのに当たった').toBe(0);
    expect(r2.stood, '誰も居ない印に棘が立たない').toBe(true);
    expect(errors).toEqual([]);
  });

  test('⑥ 何回降っても、隣接8セル・竜の体には落ちず、上限を守り、部屋の床の半分以上へ歩いて行ける', async ({ page }) => {
    const errors = await setup(page);
    const r = await page.evaluate(({ floor, ratio }) => {
      const g = window.__game;
      const pl = g.getPlayer();
      const id = g.getEnemies()[0].id;
      // 寿命を延ばして床の上限まで積もらせる（素の寿命 8 秒＜波の間隔＝上限に届かず測れない）
      g.setEnemyFieldForTest(id, { _thorns: { ...g.getEnemies()[0].thorns, lifeMs: 1e9 } });
      const bad = [];
      const seenIds = new Set();
      // プレイヤーは部屋の中を巡回する（いろいろな場所で棘が降る）
      const path = [[2, 2], [9, 2], [9, 7], [2, 7], [5, 4]];
      let worst = Infinity, waves = 0, maxOnFloor = 0;
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
          // 降った直後の棘＝隣接8セル・竜の体の下に落ちていない（波ごとに全部見る）
          for (const o of g.getThorns()) {
            if (seenIds.has(o.id)) continue;
            seenIds.add(o.id);
            const gx = Math.max(0, pl.x - (o.c + 1), o.c - (pl.x + 1));
            const gy = Math.max(0, pl.y - (o.r + 1), o.r - (pl.y + 1));
            if (Math.max(gx, gy) < 1) bad.push(`隣接 ${o.r},${o.c}`);
            if (o.c < e.x + 3 && e.x < o.c + 1 && o.r < e.y + 3 && e.y < o.r + 1) bad.push(`体の下 ${o.r},${o.c}`);
          }
          const blocked = new Set(g.getThorns().map((o) => `${o.r},${o.c}`));
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
      return { worst, waves, maxOnFloor, bad, total: seenIds.size };
    }, { floor: FLOOR, ratio: P3.thorns.reachRatio });
    expect(r.waves, '1500 tick で棘が3回も降らない').toBeGreaterThanOrEqual(3);
    expect(r.maxOnFloor, '床の棘が上限を超えた').toBeLessThanOrEqual(P3.thorns.maxOnFloor);
    expect(r.maxOnFloor, '上限まで積もっていない（上限を測れていない）').toBe(P3.thorns.maxOnFloor);
    expect(r.bad, '隣接8セル／竜の体の下に棘が落ちた').toEqual([]);
    expect(r.worst, '棘で部屋の半分以上へ歩けなくなった').toBeGreaterThanOrEqual(P3.thorns.reachRatio);
    expect(errors).toEqual([]);
  });
});
