// tests/enemy-melee-windup-by-weapon.spec.js — 近接の予告の絵は「剣を持っているか」で分かれる
//
// 2026-08-26 ユーザー実プレイ報告：
//   「今きづいたんだけど、地中蟲とかも剣で攻撃するようになっちゃったの？？なんで？
//     こいつらは体当たり攻撃で、その予備動作はいままでどおりサイズの収縮でよかったんじゃない？
//     なんで剣で攻撃するようにしちゃったんだっけ？変じゃん。剣もってたら。
//     魔王系と剣を持ってる敵だけでいいんじゃないの？」
//
// 原因＝`attack.type: 'sword'` は engine の**近接の総称**（咬みつき・なぎ払い・鉗肢・舌・鉤爪・
// 巨体の体当たりも 'sword' で書いてある）なのに、0d-2.6 が予告の絵を**実際の刃**（`.swing-windup`
// ＝銀の刃＋金の鍔が頭上へ上がる）にし、0d-2.7 がその予告を**全敵の既定**にした∴剣を持たない
// 10 体（α 地中蟲・G・N・J・O・U・I・L・<・{）が持っていない剣を振り上げていた。
//
// ∴`ENEMY_META[..].wieldsSword` を宣言に足し、**見た目と音だけ**を振り分けた：
//   宣言あり（θ 骸骨剣士・μ 剣獣・ζ 盾騎士・魔王系 V/W/X/Z）… 刃を振り上げる（`.swing-windup`）
//     ＋金属の擦り上げ（swordWindup）＋斬撃の光線（`.sword-thrust`）
//   宣言なし（残りの近接 10 体）… 体を縮めて溜める（`.slam-windup`＝体当たりと同じ拡大縮小）
//     ＋低く沈む唸り（maulWindup）＋牙/爪の一撃（`.sword-thrust.maul-strike`）
//
// この本が守るのは次の5点：
//   ① データ … 宣言の集合が**絵から導出した集合と一致する**（手書きの一覧を突き合わせない）
//   ② 剣持ち … 予告中は `.swing-windup` だけが付く（収縮は付かない）
//   ③ 剣なし … 予告中は `.slam-windup` だけが付く（刃は上がらない）＋長さが要素へ渡る
//   ④ 解決の絵 … 剣持ちは光線・剣なしは牙/爪の変種（`.maul-strike`）で出る
//   ⑤ 音 … maulWindup は swordWindup と別物（音程の向きが逆）＋振り分けが1か所に在る
// ⚠️ **機構は分けない**（当たり判定・盾ブロック・硬直・予告→解決の拍は宣言に関係なく
//    resolveSwordHit の1経路）＝そちらの番人は tests/boss-sword-windup.spec.js（G で測る）。
//
// 測り方（GUIDE §4-2）：実配置の敵で測る（注入敵は DOM を持たない∴絵を測れない）。
//   剣持ち＝`bal_skeleton`（test_mechanics[3,1]・θ）／剣なし＝`bal_rock_golem`（[30,1]・G）。
//   毎 tick 敵の西隣へプレイヤーを置き直す＝歩かれても間合いが外れない。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { ENEMY_SPRITES } from '../shared/sprites-enemies.js';
import { PLAYER_SPRITES } from '../shared/sprites-player.js';
import { MELEE_WINDUP_MS } from '../game/constants.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';
const EFFECTS_CSS = readFileSync(fileURLToPath(new URL('../game/css/effects.css', import.meta.url)), 'utf8');
const BOARD_CSS   = readFileSync(fileURLToPath(new URL('../game/css/board.css', import.meta.url)), 'utf8');
const SOUNDS_JS   = readFileSync(fileURLToPath(new URL('../shared/sounds.js', import.meta.url)), 'utf8');
const AI_JS       = readFileSync(fileURLToPath(new URL('../game/enemy-ai.js', import.meta.url)), 'utf8');

function previewUrl(stage, row, col) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col), ps_weapon: '1',
  });
  return `${GAME}?${p.toString()}`;
}

// 近接（'sword' 型）を持つ敵＝engine の近接の総称を使っている敵すべて。
const meleeEntries = Object.entries(ENEMY_META)
  .filter(([, m]) => [...(m.attacks ?? []), ...(m.attack ? [m.attack] : [])].some(a => a?.type === 'sword'));

// **絵から**「剣を持っている」を導出する（名簿の宣言と突き合わせる相手＝手書き表を作らない）：
//   ・sprite が PLAYER_SPRITES に在る … 勇者の絵の派生（monsterD/escapeD/darklordD = heroD）
//     ＝魔王系。勇者の絵は剣を持っている。
//   ・`${sprite}Atk` が ENEMY_SPRITES に在る … **剣を振り下ろすポーズ**を持つ敵の絵
//     （skeletonDAtk / swordBeastDAtk / shieldKnightDAtk）。
//   ⚠️ 投擲鬼（bombOgreDAtk 等）も Atk ポーズを持つが近接を持たない∴この集合には入らない。
function artHoldsSword(meta) {
  return !!(PLAYER_SPRITES[meta.sprite] || ENEMY_SPRITES[`${meta.sprite}Atk`]);
}

// 毎 tick 西隣へ立ち直りながら予告のクラスと CSS 変数を集める。
async function measureWindup(page, stage, tile) {
  await page.addInitScript(() => {
    const native = window.setInterval;
    window.__loopBlocked = 0;
    window.setInterval = function (fn, ms, ...rest) {
      if (/step\s*\(\s*1\s*\)/.test(String(fn))) { window.__loopBlocked++; return 0; }
      return native.call(window, fn, ms, ...rest);
    };
  });
  await page.goto(previewUrl(stage, 4, 2));
  await waitForBoard(page);
  expect(await page.evaluate(() => window.__loopBlocked),
    '実時間ループの差し込み阻止が効いていない（game.js startGameLoop の形が変わった？）')
    .toBeGreaterThan(0);
  return page.evaluate((tile) => {
    const g = window.__game, p = g.getPlayer();
    g.pause();
    const foe = g.getEnemies().find(e => e.type === tile);
    if (!foe) return { error: `${tile} が居ない` };
    const tr = [];
    for (let i = 1; i <= 24; i++) {
      const e0 = g.getEnemies().find(e => e.id === foe.id);
      if (!e0) break;
      p.x = e0.x - 1; p.y = e0.y;                 // 西隣（2×2 なら左端から 1 セル）
      const before = document.querySelectorAll('.sword-thrust').length;
      g.step(1);
      const e = g.getEnemies().find(x => x.id === foe.id);
      const el = document.getElementById(`char-enemy-${e.id}`);
      const strikes = [...document.querySelectorAll('.sword-thrust')];
      tr.push({
        i,
        swingAt: e.swingAt ?? null,
        slamAt:  e.slamAt ?? null,
        swing:   !!el?.classList.contains('swing-windup'),
        slam:    !!el?.classList.contains('slam-windup'),
        swingMs: el?.style.getPropertyValue('--swing-windup-ms') || '',
        slamMs:  el?.style.getPropertyValue('--slam-pulse-ms') || '',
        // 解決の絵が**この tick に増えた**かどうか（残存する 260ms の要素と混ぜない）
        newStrike: strikes.length > before,
        mauls: strikes.filter(el2 => el2.classList.contains('maul-strike')).length,
        blades: strikes.filter(el2 => !el2.classList.contains('maul-strike')).length,
      });
    }
    return { tr };
  }, tile);
}

test.describe('近接の予告は「剣を持っているか」で絵が分かれる（2026-08-26）', () => {
  test('① 宣言（wieldsSword）の集合は絵から導出した集合と一致する（手書きの一覧ではない）', () => {
    expect(meleeEntries.length, "'sword' 型の近接を持つ敵が居ない（名簿の形が変わった）")
      .toBeGreaterThan(10);
    const declared = meleeEntries.filter(([, m]) => m.wieldsSword).map(([t]) => t).sort();
    const derived  = meleeEntries.filter(([, m]) => artHoldsSword(m)).map(([t]) => t).sort();
    expect(declared, '剣の絵を持つ敵と wieldsSword の宣言が食い違う（持っていない剣を振る／振らない）')
      .toEqual(derived);
    // 対照が在ること＝「全敵が剣持ち」に退化していない（退化すると②③が同じ本になる）
    const bare = meleeEntries.filter(([, m]) => !m.wieldsSword);
    expect(bare.length, '剣を持たない近接の敵が居ない＝ユーザー指摘の対象（地中蟲など）が消えた')
      .toBeGreaterThanOrEqual(10);
    // 宣言だけあって近接を持たない敵（死んだ宣言）が無いこと
    const dead = Object.entries(ENEMY_META).filter(([, m]) => m.wieldsSword
      && ![...(m.attacks ?? []), ...(m.attack ? [m.attack] : [])].some(a => a?.type === 'sword'));
    expect(dead.map(([t]) => t), '近接を持たない敵に wieldsSword が付いている（読まれない宣言）').toEqual([]);
    // 地中蟲＝ユーザーが名前で挙げた敵。近接を持ち、かつ剣は持たない。
    const worm = ENEMY_META['α'];
    expect(worm.name, '地中蟲のタイルが α でなくなった（前提が崩れた）').toBe('地中蟲');
    expect(worm.wieldsSword, '地中蟲に剣の宣言が付いた＝ユーザー指摘に反する').toBeFalsy();
  });

  test('② 剣持ち（θ 骸骨剣士）は刃を振り上げる＝収縮の絵は付かない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    expect(ENEMY_META['θ'].wieldsSword, '骸骨剣士が剣を持つ宣言を失った（前提が崩れた）').toBe(true);
    const r = await measureWindup(page, 'bal_skeleton', 'θ');
    expect(r.error).toBeUndefined();
    const armed = r.tr.filter(s => s.swingAt != null);
    expect(armed.length, '剣持ちが 24 tick で一度も予告しない').toBeGreaterThan(0);
    for (const s of armed) {
      expect(s.swing, `tick${s.i}：剣持ちの予告に .swing-windup が付いていない`).toBe(true);
      expect(s.slam,  `tick${s.i}：剣持ちの予告が体の収縮（.slam-windup）になっている`).toBe(false);
    }
    expect(armed[0].swingMs, '振り上げの長さが要素へ渡っていない').toBe(`${MELEE_WINDUP_MS}ms`);
    expect(errors).toEqual([]);
  });

  test('③ 剣なし（G 岩のゴーレム）は体を縮めて溜める＝刃は上がらない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    expect(ENEMY_META['G'].wieldsSword, '岩のゴーレムに剣の宣言が付いた（絵に剣は無い）').toBeFalsy();
    const r = await measureWindup(page, 'bal_rock_golem', 'G');
    expect(r.error).toBeUndefined();
    const armed = r.tr.filter(s => s.swingAt != null);
    expect(armed.length, '剣なしのボスが 24 tick で一度も予告しない').toBeGreaterThan(0);
    const sword = (ENEMY_META['G'].attacks ?? []).find(a => a.type === 'sword');
    for (const s of armed) {
      expect(s.swing, `tick${s.i}：持っていない剣を振り上げている（ユーザー指摘の状態）`).toBe(false);
      expect(s.slam,  `tick${s.i}：剣なしの予告に収縮（.slam-windup）が付いていない`).toBe(true);
    }
    // 長さは状態機械が持つ（CSS 側に書かない）＝拡大縮小2往復ぶん＝予告の半分
    expect(armed[0].slamMs, '収縮の長さが要素へ渡っていない（CSS 既定値に落ちる）')
      .toBe(`${Math.round((sword.windupMs ?? MELEE_WINDUP_MS) / 2)}ms`);
    expect(errors).toEqual([]);
  });

  test('④ 解決の絵も分かれる（剣持ち＝斬撃の光線／剣なし＝牙・爪の一撃）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // CSS の形＝色だけでなく**長さと太さ**も変える（同じ形の光線に見えると絵で読めない）
    expect(EFFECTS_CSS, '.maul-strike の規則が無い＝剣なしの一撃が斬撃の光線のまま')
      .toContain('.sword-thrust.maul-strike::before');
    const maulRules = EFFECTS_CSS.match(/\.sword-thrust\.maul-strike[^{]*\{[^}]*\}/g) ?? [];
    expect(maulRules.join('\n'), '.maul-strike が色しか変えていない（幅/高さの上書きが無い）')
      .toMatch(/width:/);

    const blade = await measureWindup(page, 'bal_skeleton', 'θ');
    const claw  = await measureWindup(page, 'bal_rock_golem', 'G');
    expect(blade.error).toBeUndefined();
    expect(claw.error).toBeUndefined();
    const bladeHit = blade.tr.find(s => s.newStrike);
    const clawHit  = claw.tr.find(s => s.newStrike);
    expect(bladeHit, '剣持ちの解決の絵が 24 tick で一度も出ない').toBeTruthy();
    expect(clawHit,  '剣なしの解決の絵が 24 tick で一度も出ない').toBeTruthy();
    expect(bladeHit.blades, '剣持ちの解決が斬撃の光線で出ていない').toBeGreaterThan(0);
    expect(bladeHit.mauls,  '剣持ちの解決が牙/爪の絵（.maul-strike）で出ている').toBe(0);
    expect(clawHit.mauls,   '剣なしの解決が牙/爪の絵（.maul-strike）で出ていない').toBeGreaterThan(0);
    expect(clawHit.blades,  '剣なしの解決が斬撃の光線で出ている＝持っていない剣で斬っている').toBe(0);
    expect(errors).toEqual([]);
  });

  test('⑤ 音も分かれる（maulWindup は swordWindup と逆向きの音程・振り分けは1か所）', () => {
    expect(SOUNDS_JS, "playSound('maulWindup') の音が無い＝剣なしの予告が無音になる")
      .toContain("kind === 'maulWindup'");
    const body = (kind) => SOUNDS_JS.match(new RegExp(`kind === '${kind}'\\)\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    const maul = body('maulWindup'), sword = body('swordWindup');
    expect(maul, 'maulWindup の中身が空').not.toBe('');
    expect(maul, '剣の予告と同じ音になっている＝聞き分けられない').not.toBe(sword);
    const freqs = (src) => [...src.matchAll(/,\s*(\d+(?:\.\d+)?),\s*0\./g)].map(m => Number(m[1]));
    const mf = freqs(maul), sf = freqs(sword);
    expect(mf.length, 'maulWindup の音が 1 音以下＝唸りに聞こえない').toBeGreaterThanOrEqual(3);
    expect(mf[mf.length - 1], '体を沈める予告なのに音程が下がっていない').toBeLessThan(mf[0]);
    expect(sf[sf.length - 1], '剣の予告の音程が上がっていない（対照が崩れた）').toBeGreaterThan(sf[0]);
    // 振り分けは1か所（宣言を読む場所が増えると「音だけ剣」が起きる）
    expect(AI_JS, '予告の音が剣/非剣で振り分けられていない')
      .toMatch(/playSound\(\s*meta\.wieldsSword\s*\?\s*'swordWindup'\s*:\s*'maulWindup'\s*\)/);
    // 絵の振り分け（`.swing-windup` は宣言した敵だけ）も engine の1か所で決まる
    expect(BOARD_CSS, '.swing-windup の規則が消えた（剣持ちの予告が見えない）')
      .toContain('.char-abs.swing-windup::after');
    expect(AI_JS, '.swing-windup が wieldsSword と無関係に付いている')
      .toMatch(/e\._swingAt != null && !!meta\?\.wieldsSword/);
  });
});
