// tests/unblockable-signal.spec.js — キュー59「体当たりが盾で防げないことが伝わる形にする」
//
// きっかけ＝プレイメモ field 8,13（2026-10-13）「みずいろの敵（パトロール E）が体当たり攻撃を
// してきてるのがわかりにくく、盾をもってるときにそのまま待っていれば防御できると誤認して
// 攻撃をうけてしまう」。✅ ユーザー決定（2026-10-14）＝**防げないまま・それを見せる**
// （k-7.5 決定④「体当たり系の答えは下がるだけ」は変えない）。
//
// この本が固定すること：
//   ① 体当たり（slam）の予告中は `.unblockable-windup`（赤い点滅）が付き、盾の効かない溜め音
//      （880Hz 矩形波×2）が鳴る。予告が終われば外れる。
//   ② 盾を攻撃の来る側へ向けたまま当たると、盾の側に赤い×（`.shield-pierce`）と貫通音
//      （320Hz のこぎり波から始まる下降）が出る。**ダメージは変わらない**（判定には使わない）。
//   ③ 対照：背を向けて当たる／盾を持たずに当たる＝×も貫通音も出ない（＝「盾越し」だけを告げる）。
//   ④ 対照：剣を持たない敵の近接（G 岩のゴーレム＝同じ拡大縮小だが盾で防げる）は赤くならない。
//   ⑤ 突進（φ 突進猪）の溜めにも赤い点滅が付き、盾越しに轢かれると×が出る。スタンで溜めが
//      消えれば点滅も消える。
//
// 音の観測点＝AudioContext.createOscillator を包んで（周波数・波形）を記録する
// （`playSound` は import 済みの関数＝差し替えられない∴charge-dash.spec.js と同じ考え方）。
//
// ── 歯の実測（2026-10-14・1か所ずつ壊して赤くなる本）──────────────────────
//   enemy-ai.js syncUnblockable の toggle を常に false …………………… ①⑤
//   enemy-ai.js startSlam の playSound('unblockableWindup') を消す ………… ①
//   enemy-ai.js noteShieldPierced の向き判定を外す（常に出す） ………… ③
//   enemy-ai.js tickSlam の noteShieldPierced 呼び出しを消す ……………… ②
//   enemy-ai.js syncUnblockable に swingIsBody を足す（近接も赤） ………… ④

import { test, expect } from '@playwright/test';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl(stage, row, col, extra) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col),
    ps_weapon: '1',
    ...(extra ?? {}),
  });
  return `${GAME}?${p.toString()}`;
}

// 呪い火のアリーナ（slam-attack.spec.js と同じ＝敵は (x9,y4) の1体・遠隔なし）
const CURSE = (extra) => previewUrl('curse_fire', 4, 4, extra);
// 突進猪のアリーナ（charge-dash.spec.js と同じ＝敵 (x9,y4)・プレイヤー (x1,y4)＝同じ行）
const BOAR  = (extra) => previewUrl('charge_boar', 4, 1, extra);

// 初期化スクリプトは page ごとに1回だけ＝2回足すと音の記録が二重になる
const prepared = new WeakSet();
async function gotoFrozen(page, url) {
  if (!prepared.has(page)) {
    prepared.add(page);
    await freezeGameLoop(page);
    await addToneRecorder(page);
  }
  await page.goto(url);
  await waitForBoard(page);
  expect(await page.evaluate(() => window.__loopBlocked),
    '実時間ループの差し込み阻止が効いていない（game.js startGameLoop の形が変わった？）')
    .toBeGreaterThan(0);
}

async function addToneRecorder(page) {
  await page.addInitScript(() => {
    window.__tones = [];
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const orig = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () {
      const osc = orig.call(this);
      const set = osc.frequency.setValueAtTime.bind(osc.frequency);
      osc.frequency.setValueAtTime = (f, t) => {
        window.__tones.push({ f, type: osc.type });
        return set(f, t);
      };
      return osc;
    };
  });
}

// 呪い火に隣（西）へ張り付き、予告→解決までを tick ごとに記録する（1回の evaluate で完結）。
// face＝プレイヤーの向き（'right'＝盾が敵側／'left'＝背を向ける）。
async function slamTrace(page, face) {
  return page.evaluate((face) => {
    const g = window.__game, p = g.getPlayer();
    g.pause();
    const hp0 = g.getState().player.hp;
    const tr = [];
    for (let i = 1; i <= 24; i++) {
      const e0 = g.getEnemies()[0];
      p.x = e0.x - 1; p.y = e0.y;
      g.setHeroDir(face);
      const nTones = window.__tones.length;
      g.step(1);
      const e = g.getEnemies()[0];
      const el = document.getElementById(`char-enemy-${e.id}`);
      const tones = window.__tones.slice(nTones);
      tr.push({
        i,
        slamAt: e.slamAt ?? null,
        slam:   !!el?.classList.contains('slam-windup'),
        red:    !!el?.classList.contains('unblockable-windup'),
        hp:     g.getState().player.hp,
        pierce: document.querySelectorAll('.shield-pierce').length,
        warn:   tones.filter(t => t.f === 880 && t.type === 'square').length,
        crack:  tones.filter(t => t.f === 320 && t.type === 'sawtooth').length,
      });
      if (g.getState().player.hp < hp0) break;
    }
    return { hp0, shield: !!p.shield, tr };
  }, face);
}

test.describe('キュー59 – 盾の効かない攻撃を見せる', () => {

  test('① 体当たりの予告中だけ赤く点滅し、溜め音が鳴る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, CURSE({ ps_shield: '0' }));
    await page.keyboard.press('g');   // HP を測るので debug OFF
    const r = await slamTrace(page, 'right');
    const armed = r.tr.filter(s => s.slamAt != null);
    expect(armed.length, '24 tick で体当たりの予告が一度も立たない（前提が崩れた）').toBeGreaterThan(0);
    for (const s of armed) {
      expect(s.red, `tick${s.i}：予告中なのに赤い点滅（.unblockable-windup）が無い`).toBe(true);
    }
    for (const s of r.tr.filter(s => s.slamAt == null)) {
      expect(s.red, `tick${s.i}：予告していないのに赤い点滅が残っている`).toBe(false);
    }
    const first = r.tr.find(s => s.slamAt != null);
    expect(first.warn, '予告の始まりに盾の効かない溜め音（880Hz 矩形波×2）が鳴っていない').toBe(2);
    expect(errors).toEqual([]);
  });

  test('② 盾を向けたまま当たる＝赤い×と貫通音（ダメージは変わらない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, CURSE({ ps_shield: '0' }));
    await page.keyboard.press('g');
    const r = await slamTrace(page, 'right');
    expect(r.shield, '前提：ps_shield=0 で盾を持っている').toBe(true);
    const hit = r.tr.at(-1);
    expect(hit.hp, '体当たりが当たらない（前提が崩れた）').toBeLessThan(r.hp0);
    expect(r.hp0 - hit.hp, '盾越しの体当たりのダメージが変わった（決定④＝判定は変えない）')
      .toBe(ENEMY_META[TILE.CURSE_FIRE].atk);
    expect(hit.pierce, '盾越しに当たったのに赤い×（.shield-pierce）が出ない').toBeGreaterThan(0);
    expect(hit.crack, '盾越しに当たったのに貫通音が鳴らない').toBe(1);
    expect(errors).toEqual([]);
  });

  test('③ 対照：背を向けて当たる／盾なしで当たる＝×も貫通音も出ない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, CURSE({ ps_shield: '0' }));
    await page.keyboard.press('g');
    const back = await slamTrace(page, 'left');
    expect(back.tr.at(-1).hp, '背を向けた体当たりが当たらない（前提）').toBeLessThan(back.hp0);
    expect(back.tr.at(-1).pierce, '背を向けて当たったのに×が出た（盾越しではない）').toBe(0);
    expect(back.tr.at(-1).crack, '背を向けて当たったのに貫通音が鳴った').toBe(0);

    await gotoFrozen(page, CURSE());
    await page.keyboard.press('g');
    const bare = await slamTrace(page, 'right');
    expect(bare.shield, '前提：盾を持っていない').toBe(false);
    expect(bare.tr.at(-1).hp, '盾なしの体当たりが当たらない（前提）').toBeLessThan(bare.hp0);
    expect(bare.tr.at(-1).pierce, '盾を持っていないのに×が出た').toBe(0);
    expect(errors).toEqual([]);
  });

  test('④ 対照：剣を持たない敵の近接（盾で防げる）は同じ拡大縮小でも赤くならない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    expect(ENEMY_META['G'].wieldsSword, '前提：岩のゴーレムは剣を持たない').toBeFalsy();
    await gotoFrozen(page, previewUrl('bal_rock_golem', 4, 2));
    const r = await page.evaluate(() => {
      const g = window.__game, p = g.getPlayer();
      g.pause();
      const foe = g.getEnemies().find(e => e.type === 'G');
      if (!foe) return { error: 'G が居ない' };
      const tr = [];
      for (let i = 1; i <= 24; i++) {
        const e0 = g.getEnemies().find(e => e.id === foe.id);
        if (!e0) break;
        p.x = e0.x - 1; p.y = e0.y;
        const nTones = window.__tones.length;
        g.step(1);
        const e = g.getEnemies().find(x => x.id === foe.id);
        const el = document.getElementById(`char-enemy-${e.id}`);
        tr.push({
          i, swingAt: e.swingAt ?? null, slamAt: e.slamAt ?? null,
          slam: !!el?.classList.contains('slam-windup'),
          red:  !!el?.classList.contains('unblockable-windup'),
          warn: window.__tones.slice(nTones).filter(t => t.f === 880 && t.type === 'square').length,
        });
      }
      return { tr };
    });
    expect(r.error).toBeUndefined();
    const melee = r.tr.filter(s => s.swingAt != null && s.slamAt == null);
    expect(melee.length, '24 tick で近接の予告が一度も立たない（前提）').toBeGreaterThan(0);
    for (const s of melee) {
      expect(s.slam, `tick${s.i}：前提＝近接の予告は拡大縮小`).toBe(true);
      expect(s.red, `tick${s.i}：盾で防げる近接が赤く点滅している＝色で区別できない`).toBe(false);
      expect(s.warn, `tick${s.i}：盾で防げる近接に盾の効かない溜め音が鳴った`).toBe(0);
    }
    expect(errors).toEqual([]);
  });

  test('⑤ 突進の溜めも赤く点滅し、盾越しに轢かれると×が出る・スタンで点滅は消える', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOAR({ ps_shield: '0' }));
    await page.keyboard.press('g');
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      g.setHeroDir('right');                       // 盾を猪（東）へ向けて待つ
      const hp0 = g.getState().player.hp;
      const tr = [];
      for (let i = 1; i <= 20; i++) {
        g.step(1);
        g.setHeroDir('right');
        const e = g.getEnemies()[0];
        const el = document.getElementById(`char-enemy-${e.id}`);
        tr.push({
          i, phase: e.dashPhase ?? null,
          red: !!el?.classList.contains('unblockable-windup'),
          hp: g.getState().player.hp,
          pierce: document.querySelectorAll('.shield-pierce').length,
        });
        if (g.getState().player.hp < hp0) break;
      }
      return { hp0, tr };
    });
    const windup = r.tr.filter(s => s.phase === 'windup');
    expect(windup.length, '突進の溜めが立たない（前提）').toBeGreaterThan(0);
    for (const s of windup) expect(s.red, `tick${s.i}：突進の溜めに赤い点滅が無い`).toBe(true);
    for (const s of r.tr.filter(s => s.phase === 'run')) {
      expect(s.red, `tick${s.i}：走り出した後も赤い点滅が残っている`).toBe(false);
    }
    const hit = r.tr.at(-1);
    expect(hit.hp, '突進に轢かれない（前提）').toBeLessThan(r.hp0);
    expect(hit.pierce, '盾を向けて轢かれたのに×が出ない').toBeGreaterThan(0);

    // スタンで溜めが消えたら点滅も消える
    await gotoFrozen(page, BOAR({ ps_shield: '0' }));
    const s = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      let armed = null;
      for (let i = 1; i <= 6; i++) {
        g.step(1);
        const e = g.getEnemies()[0];
        if (e.dashPhase === 'windup') { armed = e.id; break; }
      }
      if (armed == null) return { armed: null };
      g.stunEnemy(armed, 720);
      g.step(1);
      const el = document.getElementById(`char-enemy-${armed}`);
      return { armed, red: !!el?.classList.contains('unblockable-windup') };
    });
    expect(s.armed, '溜めが立たない（前提）').not.toBeNull();
    expect(s.red, 'スタンで溜めが消えたのに赤い点滅が残っている').toBe(false);
    expect(errors).toEqual([]);
  });
});
