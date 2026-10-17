// 金翼の邪竜 Ω（キュー76③-1・2026-10-16）＝相1「面で技が変わる」（aspect）の番人。
//
//   ① データ：3×3 のボス・向き別の絵（…D/R/U と …Atk）・欠片を落とさない・主の間に1体だけ
//   ② 立つ面で技が変わる（正面＝噛みつき／横・斜め＝翼打ち／背後＝尾）・遠い背後では何も出さない
//   ③ 噛みつきは盾で防げる／尾は盾を構えても当たる（GUIDE §7-16）
//   ④ 尾の予告中に危険域の外へ出れば当たらない＋床の危険域の絵が判定と同じ矩形
//   ⑤ 向き直りは turnMs ごとだけ（毎 tick プレイヤーを向かない＝回り込める）
//   ⑥ 翼打ちは横へ押し返す
//   ⑦ 絵のデータ（④-2）：待機は往復4コマ（1→2→3→2）・構え3種×3向き・全部 96×96・パレットの範囲内
//   ⑨ 盤面の待機の絵が実時間で 1→2→3→2 と往復する（animFrame が 0〜11 で回る＝% 2 に戻すと3コマ目が出ない）
//   ⑧ 予告から当たる瞬間まで、その技の構えの絵（スナップショットと盤面の canvas の両方）→終われば待機の絵
//
// 測り方：竜を (x4,y3) に置き直して右向きに固定し（体は x4-6 × y3-5）、移動を止める（speed 0）。
// 被弾を測る本は `g` でデバッグ（無敵）を切る（GUIDE §7-16 の罠＝プレビューは takeDamage が素通り）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ENEMY_SPRITES } from '../shared/sprites-enemies.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(readFileSync(join(__dir, '../work/blade-of-lumia.json'), 'utf8'));
const META = ENEMY_META[TILE.GOLD_DRAGON];
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

/** 竜を固定位置・右向きにし、無敵窓を明けさせてからプレイヤーを (px,py) に置き、竜の方を向く。 */
async function place(page, px, py, { turnLock = true } = {}) {
  await page.evaluate(({ px, py, turnLock }) => {
    const g = window.__game;
    const id = g.getEnemies()[0].id;
    const pl = g.getPlayer();
    g.setEnemyFieldForTest(id, { x: 4, y: 3, dir: 'right', speed: 0, _aspPhase: 'idle', _aspAt: null, _aspRetreat: null,
      ...(turnLock ? { _aspTurnAt: 1e12 } : {}) });
    pl.x = 10; pl.y = 8; g.step(14);   // 遠くで無敵窓（1500ms）を明けさせる
    // キュー76⑥: 盾で防いだ後の飛び退き・間合いを保つ番も前のケースから持ち越さない
    g.setEnemyFieldForTest(id, { _aspNext: 0, _freezeUntil: 0, _aspPhase: 'idle', _aspRetreat: null, _aspHold: false });
    pl.x = px; pl.y = py; pl.hp = 40;
    const dx = 5 - px, dy = 4 - py;
    g.setHeroDir(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }, { px, py, turnLock });
}

/** 予告が立つまで進めて技の名前を返す（20 tick で立たなければ null）。 */
const windupKind = (page) => page.evaluate(() => {
  const g = window.__game;
  for (let t = 0; t < 20; t++) {
    g.step(1);
    const e = g.getEnemies()[0];
    if (e.aspPhase === 'windup') return e.aspKind;
  }
  return null;
});
/** 予告が解決するまで進める（プレイヤーの位置は動かさない）。戻り値＝減った HP。 */
const resolveHp = (page) => page.evaluate(() => {
  const g = window.__game;
  const pl = g.getPlayer();
  const hp0 = pl.hp;
  for (let t = 0; t < 12 && g.getEnemies()[0].aspPhase === 'windup'; t++) g.step(1);
  return hp0 - pl.hp;
});

test.describe('金翼の邪竜 Ω：相1 面で技が変わる', () => {
  test('① データ：3×3 のボス・向き別の絵・欠片なし・主の間に1体だけ', () => {
    expect(META).toBeTruthy();
    expect(META.size).toEqual({ w: 3, h: 3 });
    expect(META.isBoss).toBe(true);
    expect(META.dropsTriforce ?? false, '欠片を落とすと祭壇の総数が狂う').toBe(false);
    expect(META.directional).toBe(true);
    expect(META.hitAndAway, 'hitAndAway を明示しないと aspect の分岐に来ない').toBe(false);
    for (const d of ['D', 'R', 'U']) {
      expect(ENEMY_SPRITES[`goldDragon${d}`], `goldDragon${d}`).toBeTruthy();
      expect(ENEMY_SPRITES[`goldDragon${d}Atk`], `goldDragon${d}Atk（無いと攻撃中に消える）`).toBeTruthy();
    }
    expect(TILE_SPRITE_MAP[TILE.GOLD_DRAGON]?.spr).toBe(META.sprite);
    // どの技も atk を超えない（新しい最大打点を作らない）
    expect(META.aspect.wing.atk).toBeLessThanOrEqual(META.atk);
    // 尾の猶予：予告の歩数 × 0.5 セル ＞ 危険域の外へ出る最大距離（奥行き）
    expect(Math.floor(META.aspect.tail.windupMs / 120) * 0.5).toBeGreaterThan(META.aspect.tail.depth);
    const lair = MAP.layers.dragon_lair.stages['1,0'];
    expect(lair.isBossRoom).toBe(true);
    const enemies = lair.tiles.flatMap((row, r) => row.flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}=${ch}`] : [])));
    expect(enemies, '主の間の敵は Ω だけ（雑魚を足すと killAll の封印に抜け道ができる）').toEqual([`3,7=${TILE.GOLD_DRAGON}`]);
  });

  test('② 立つ面で技が変わる（正面＝噛みつき／横・斜め＝翼打ち／背後＝尾）', async ({ page }) => {
    const errors = await setup(page);
    const cases = [
      [7, 4, 'bite'],   // 正面（右）
      [5, 2, 'wing'],   // 横（上）
      [5, 6, 'wing'],   // 横（下）
      [7, 2, 'wing'],   // 斜め前
      [3, 6, 'wing'],   // 斜め後ろ
      [3, 4, 'tail'],   // 背後
      [2, 4, 'tail'],   // 背後・奥行き2
      [1, 4, null],     // 遠い背後（奥行き3＝届かない）
    ];
    for (const [px, py, want] of cases) {
      await place(page, px, py);
      expect(await windupKind(page), `(${px},${py})`).toBe(want);
    }
    expect(errors).toEqual([]);
  });

  test('③ 噛みつきは盾で防げる／尾は盾を構えても当たる', async ({ page }) => {
    const errors = await setup(page, { debugOff: true });
    expect(await page.evaluate(() => !!window.__game.getPlayer().shield), '前提：盾を持っている').toBe(true);
    await place(page, 7, 4);
    expect(await windupKind(page)).toBe('bite');
    expect(await resolveHp(page), '正面で竜を向いて盾を構えたのに噛まれた').toBe(0);
    await place(page, 3, 4);
    expect(await windupKind(page)).toBe('tail');
    expect(await resolveHp(page), '尾が盾で消えた（正面で構える戦法が無敵になる）').toBeGreaterThan(0);
    // 盾を外せば噛みつきも当たる（①の 0 が「届いていない」ではないことの対照）
    await page.evaluate(() => { window.__game.getPlayer().shield = null; });
    await place(page, 7, 4);
    expect(await windupKind(page)).toBe('bite');
    expect(await resolveHp(page), '盾なしでも噛みつきが当たらない＝届いていない').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('④ 尾の予告中に危険域の外へ出れば当たらない＋床の危険域が判定と同じ矩形', async ({ page }) => {
    const errors = await setup(page, { debugOff: true });
    await place(page, 3, 4);
    expect(await windupKind(page)).toBe('tail');
    // 危険域＝体の後ろ（x2-3）× 体の幅＋左右1レーン（y2-6）＝px 単位で left2 top2 w2 h5
    const zone = await page.evaluate(() => {
      const el = document.querySelector('.dragon-tail-zone');
      const cell = document.querySelector('[data-row="0"][data-col="0"]').getBoundingClientRect().width;
      if (!el) return null;
      return { l: parseFloat(el.style.left) / cell, t: parseFloat(el.style.top) / cell,
        w: parseFloat(el.style.width) / cell, h: parseFloat(el.style.height) / cell };
    });
    expect(zone, '尾の予告中に床の危険域が出ていない').not.toBeNull();
    expect(zone.l).toBeCloseTo(2, 2); expect(zone.t).toBeCloseTo(2, 2);
    expect(zone.w).toBeCloseTo(2, 2); expect(zone.h).toBeCloseTo(5, 2);
    // 予告のあいだに上へ歩いて危険域（y2-6）の外 y1 へ出る
    const dmg = await page.evaluate(() => {
      const g = window.__game;
      const pl = g.getPlayer();
      const hp0 = pl.hp;
      for (let t = 0; t < 12 && g.getEnemies()[0].aspPhase === 'windup'; t++) { g.movePlayer('up'); g.step(1); }
      return { dmg: hp0 - pl.hp, y: pl.y };
    });
    expect(dmg.y, '前提：危険域の外へ出られた').toBeLessThan(1.5);
    expect(dmg.dmg, '危険域の外へ出たのに尾が当たった').toBe(0);
    // 振り終わりの硬直（最大の反撃の窓）が立つ
    const freeze = await page.evaluate(() => {
      const e = window.__game.getEnemies()[0];
      return e.freezeUntil - window.__game.getState().gameTime;
    });
    expect(freeze).toBeGreaterThan(META.aspect.tail.recoverMs - 240);
    expect(await page.locator('.dragon-tail-zone').count(), '解決後も危険域が残っている').toBe(0);
    expect(errors).toEqual([]);
  });

  test('⑤ 向き直りは turnMs ごとだけ（毎 tick プレイヤーを向かない）', async ({ page }) => {
    const errors = await setup(page);
    // 背後の遠い位置（技が出ない）に立つ＝向き直りだけを観測する
    await place(page, 1, 4, { turnLock: false });
    const dirs = await page.evaluate(() => {
      const g = window.__game;
      const id = g.getEnemies()[0].id;
      g.setEnemyFieldForTest(id, { _aspTurnAt: g.getState().gameTime + 1200 });
      const out = [];
      for (let t = 0; t < 14; t++) { g.step(1); out.push(g.getEnemies()[0].dir); }
      return out;
    });
    expect(dirs.slice(0, 9), '1200ms 経つ前に向き直った').toEqual(Array(9).fill('right'));
    expect(dirs.at(-1), 'turnMs を過ぎても背後のプレイヤーへ向き直らない').toBe('left');
    expect(errors).toEqual([]);
  });

  test('⑥ 翼打ちは横へ押し返す', async ({ page }) => {
    const errors = await setup(page);
    await place(page, 5, 6);   // 体の下（横）
    expect(await windupKind(page)).toBe('wing');
    await resolveHp(page);
    const p = await page.evaluate(() => { const pl = window.__game.getPlayer(); return { x: pl.x, y: pl.y }; });
    expect(p.x, '押し返しが横（体から離れる向き）でない').toBe(5);
    expect(p.y, '翼打ちで押し返されていない').toBeGreaterThanOrEqual(7.5);
    expect(errors).toEqual([]);
  });

  test('⑦ 絵のデータ：待機は往復4コマ・構え3種×3向き・96×96・パレットの範囲内', async () => {
    const { ENEMY_PAL } = await import('../shared/sprites-enemies.js');
    const pal = ENEMY_PAL[META.pal];
    expect(pal?.[0]).toBe('transparent');
    for (const d of ['D', 'R', 'U']) {
      const idle = ENEMY_SPRITES[`goldDragon${d}`];
      expect(idle.length, `goldDragon${d} の待機コマ数`).toBe(4);
      // 往復＝4コマ目は2コマ目と同じ絵・1〜3コマ目はそれぞれ別の絵
      expect(idle[3]).toBe(idle[1]);
      expect(new Set(idle.slice(0, 3).map((g) => JSON.stringify(g))).size, `goldDragon${d} の3コマが別の絵でない`).toBe(3);
      const names = [`goldDragon${d}`, ...['Bite', 'Wing', 'Tail', 'Atk'].map((k) => `goldDragon${d}${k}`)];
      for (const n of names) {
        const fr = ENEMY_SPRITES[n];
        expect(fr, n).toBeTruthy();
        for (const g of fr) {
          expect(g.length, `${n} の行数`).toBe(96);
          expect(g.every((row) => row.length === 96), `${n} の列数`).toBe(true);
          expect(g.flat().every((v) => Number.isInteger(v) && v >= 0 && v < pal.length), `${n} がパレットの外を指す`).toBe(true);
        }
      }
      // 構えは待機と見分けられる（差分が小さすぎると予告が読めない＝GUIDE §6-1）
      for (const k of ['Bite', 'Wing', 'Tail']) {
        const a = ENEMY_SPRITES[`goldDragon${d}${k}`][0], b = idle[0];
        let diff = 0;
        for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (a[y][x] !== b[y][x]) diff++;
        expect(diff, `goldDragon${d}${k} と待機の差分ドット`).toBeGreaterThan(400);
      }
    }
  });

  test('⑧ 予告から当たる瞬間まで技の構えの絵→終われば待機の絵', async ({ page }) => {
    const errors = await setup(page);
    const want = { bite: 'goldDragonRBite', wing: 'goldDragonRWing', tail: 'goldDragonRTail' };
    for (const [px, py, kind] of [[7, 4, 'bite'], [5, 6, 'wing'], [3, 4, 'tail']]) {
      await place(page, px, py);
      expect(await windupKind(page)).toBe(kind);
      const seen = await page.evaluate(() => {
        const g = window.__game;
        const e = g.getEnemies()[0];
        const cv = document.getElementById(`char-enemy-${e.id}`)?.querySelector('canvas.sprite');
        return { snap: e.sprite, dom: cv?.dataset.sprite ?? null, dir: e.dir };
      });
      expect(seen.dir, '前提：竜は右向きのまま（尾の予告でも向きを変えない）').toBe('right');
      expect(seen.snap, `${kind} の予告中の絵（スナップショット）`).toBe(want[kind]);
      expect(seen.dom, `${kind} の予告中の絵（盤面の canvas）`).toBe(want[kind]);
      // 解決した tick（当たる瞬間）も構えのまま
      const atHit = await page.evaluate(() => {
        const g = window.__game;
        for (let t = 0; t < 12 && g.getEnemies()[0].aspPhase === 'windup'; t++) g.step(1);
        return g.getEnemies()[0].sprite;
      });
      expect(atHit, `${kind} の当たる瞬間の絵`).toBe(want[kind]);
      // 攻撃の絵の窓（180ms）が明ければ待機の絵へ戻る
      const after = await page.evaluate(() => { window.__game.step(3); return window.__game.getEnemies()[0].sprite; });
      expect(after, `${kind} の後に待機へ戻らない`).toBe('goldDragonR');
    }
    expect(errors).toEqual([]);
  });

  test('⑨ 盤面の待機の絵が実時間で 1→2→3→2 と往復する', async ({ page }) => {
    const errors = await setup(page);
    // 遠い背後（技が出ない）に立たせて待機の絵のまま止める。pause 中もコマ送り（400ms）は進む。
    await place(page, 1, 4);
    const frames = await page.evaluate(async () => {
      const id = window.__game.getEnemies()[0].id;
      const seq = [];
      for (let i = 0; i < 40; i++) {
        const cv = document.getElementById(`char-enemy-${id}`)?.querySelector('canvas.sprite');
        seq.push(cv ? cv.toDataURL() : null);
        await new Promise((r) => setTimeout(r, 100));
      }
      return seq;
    });
    expect(frames.every(Boolean), '竜の canvas が消えた').toBe(true);
    const order = [];
    for (const f of frames) if (order.at(-1) !== f) order.push(f);
    const ids = [...new Set(order)];
    expect(ids.length, '待機で出た絵の種類（3コマ目が出ていない）').toBe(3);
    // 往復＝3コマ目の前後は必ず2コマ目（1→3／3→1 の飛びが無い）
    const n = order.map((f) => ids.indexOf(f));
    const mid = n.find((v, i) => i > 0 && i < n.length - 1 && n[i - 1] !== n[i + 1]);  // 端でない＝2コマ目
    for (let i = 1; i < n.length; i++) {
      expect(n[i - 1] === mid || n[i] === mid, `往復になっていない（${n.join(',')}）`).toBe(true);
    }
    expect(errors).toEqual([]);
  });
});
