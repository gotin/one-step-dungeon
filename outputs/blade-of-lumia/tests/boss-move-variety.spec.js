// tests/boss-move-variety.spec.js — Phase 8-4 (4) 0d-3「ボス1体ずつ、移動アルゴリズムを変える」
//
// ユーザーの要件（2026-08-25）＝「次のボスからは**攻撃方法や移動アルゴリズム**のバリエーションを
// 考えた方がよさそう。同じパターンだとつまらなすぎるので。」∴この本が測るのは
// 「固有の攻撃を1つ持っているか」ではなく **「近づき方（移動）が G と違うか」**。
//
// 収録するボス（1体ずつ追記していく・番号は追記順）：
//   ①〜⑥ ＝ **W 魔物**（1×1・道中の中ボス）＝間合いの二相 → 後半は回り込みの張り付き
//   ⑦〜⑬ ＝ **A 炎のサラマンドラ**（2×2・D4 炎の神殿のボス）＝車線取り＋円錐ブレス →
//            後半は同じ車線取りが突進に化ける
//   ⑭〜㉑ ＝ **N 砂嵐の蠍王**（2×2・D2 砂漠の神殿のボス）＝潜行待ち伏せ＝
//            **潜っているあいだだけ歩き、地上では1歩も動かない**（移動と交戦が時間で分離）
//   ㉒〜㉙ ＝ **J 深海の海蛇**（2×2・D3 水の迷宮のボス）＝巻きつき＝
//            **そもそも寄って来ない**（見つけた地点を中心に周回し、輪を縮めて締め上げる）
//   ㉚〜㊲ ＝ **O 古森の巨人**（2×2・D6 森の聖域のボス）＝見据え＝
//            **寄る先がプレイヤーではない**（1拍前に立っていた地点＝印を追い、そこへ岩を落とす）
//
// 1本目＝**W 魔物**（1×1・道中の中ボス。`dungeon_1 1,0` / `dungeon_1 3,0` /
// `cave_1 1,0` / `dungeon_2 1,0` / `dungeon_7 1,0` の5部屋に各1体）。
//   前半（HP 50% より上）＝`combat` の**遠近二相**＝keepMin〜keepMax の間合いを保って
//                          石を投げ、周期的にだけ踏み込む（＝張り付かない）
//   後半（HP 50% 以下）  ＝層1 の `phases[].hitAndAway/combat` で**移動 AI そのものを
//                          差し替える**＝二相をやめて回り込みの張り付き型になる
// G 岩のゴーレム（D1 のボス・確定済み）が「まっすぐ来て振り下ろす」型∴W はその逆から入る。
//
// ⚠️ 測り方の前提（GUIDE §4-2 / §7-4 / boss-phase-behavior.spec.js と同じ型）：
//   ・実時間ループ（`setInterval(() => step(1), TICK_MS)`）は `gotoFrozen()` で**起動させない**
//     ＝論理 tick だけで測る（pause() だと盤面が出るまでの 1 tick が漏れて拍がずれる）。
//   ・観測は `__game.getEnemies()`（`getEnemiesSnapshot()`＝**ホワイトリスト**）だけ。
//     `cmode` / `hitAndAway` / `combat` / `approachMode` は既に口が開いている（層1 で追加）。
//   ・相の**長さ**は `phaseOffsetMs(e.id, rangedMs+meleeMs)` ぶん敵ごとにずれる（乱数ではなく
//     id から決まる）∴「何 tick 目が近接相」を算術で書かない＝**観測した `cmode` から導く**。
//   ・プレビュー（`fromEditor=1`）は `debugMode: true`＝`takeDamage()` が早期 return する
//     ∴石を撃たれ続けてもプレイヤーは死なない（間合いの測定が中断しない）。
//
// 検証ステージ＝ライブマップの `test_mechanics[21,1]` `bal_monster`（W の実配置・遮蔽ゼロ）。
// 実配置で測る理由＝注入敵は DOM を持たず絵の観測が嘘になる（0d-2 の罠①）／
// 出荷データそのものを測りたい（`setEnemyMetaForTest` の patch を使わない）。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ARMOR_TIERS } from '../shared/items.js';
import { SWORD_REACH, MELEE_WINDUP_MS, MELEE_FREEZE_MS, MOVE_STEP, SWORD_COOLDOWN_MS,
  INVINCIBLE_MS, CANDLE_FIRE_DMG } from '../game/constants.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { isArenaDoor } from './test-arena-doors.js';

const GAME = '/blade-of-lumia/game/';
const TICK_MS = 120;

// W の実配置（`bal_monster` の盤面）と、そこから測るときのプレイヤーの立ち位置。
const W_ROW = 4, W_COL = 8;
const PL_ROW = 4, PL_COL = 3;      // 同じ行の西側 5 セル＝距離を1つの数で作れる

// D1 の道中（W の初遭遇地点）の想定装備＝`min`＝木の剣ティア0・盾なし・防具なし・ハート3。
// （`node scripts/audit-balance.mjs` の「D1 森の遺跡 / min」と同じ諸元）
const D1_MIN = { ps_hearts: '3', ps_sword: '0', ps_weapon: '1' };

function previewUrl(stage, row, col, extra) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col),
    ...D1_MIN, ...(extra ?? {}),
  });
  return `${GAME}?${p.toString()}`;
}

// 実時間ループを開く前に無効化する（GUIDE §4-2・facing-block-enemies.spec.js と同じ型）
const frozen = new WeakSet();
//
// ⚠️ `seed`（キュー11・2026-09-12）＝この本の測定は実時間待ちを一切使わず `g.step(1)` の
//    同期ループだけで進む（上のコメントのとおり）＝flaky の原因は CPU 負荷ではなく
//    `game/enemy-ai.js pickApproachMode` 等の **unseeded `Math.random()`** そのもの
//    （実測＝`--repeat-each=150` で 4/150＝2.7% が「150 tick 経っても最接近が閾値を
//    割らない」で落ちた＝統計的なテイルリスク・機構の穴ではない）。∴この不確定性を
//    テストの外に置く＝`seed` を渡した呼び出しだけ、ナビゲーションごとに再実行される
//    `addInitScript` で `Math.random` を固定シードの PRNG（mulberry32）に差し替える。
//    ゲームのコード（`game/enemy-ai.js` 等）は1バイトも変えない＝本物の乱数選択ロジックを
//    決定的な入力列で実行するだけ（AIの動き自体を測る本の意図は保たれる）。
//    `seed` を渡さない呼び出し（他の全ボスの本）は従来どおり素の `Math.random`。
async function gotoFrozen(page, url, seed) {
  if (!frozen.has(page)) {
    await page.addInitScript(() => {
      const native = window.setInterval;
      window.__loopBlocked = 0;
      window.setInterval = function (fn, ms, ...rest) {
        if (/step\s*\(\s*1\s*\)/.test(String(fn))) { window.__loopBlocked++; return 0; }
        return native.call(window, fn, ms, ...rest);
      };
    });
    frozen.add(page);
  }
  if (seed !== undefined) {
    // addInitScript はナビゲーションごとに再実行される＝毎回同じシードから始まる
    // （＝`trackDarkLord`/`trackZarnel` を同じ page で複数回呼んでも決定的）。
    await page.addInitScript((sd) => {
      let s = sd >>> 0;
      Math.random = function () {
        s |= 0; s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }, seed);
  }
  await page.goto(url);
  await waitForBoard(page);
  expect(await page.evaluate(() => window.__loopBlocked),
    '実時間ループの差し込み阻止が効いていない（game.js startGameLoop の形が変わった？）')
    .toBeGreaterThan(0);
}

/**
 * `bal_monster` の W を n tick 追って、毎 tick の間合い・相・移動型を返す。
 * @param {object} o
 * @param {number} o.ticks    進める論理 tick 数
 * @param {number} [o.dropAt] この tick の step より前に W へ与えるダメージの tick
 * @param {number} [o.dmg]    そのダメージ量
 */
async function trackMonster(page, o) {
  await gotoFrozen(page, previewUrl('bal_monster', PL_ROW, PL_COL), o.seed);
  return page.evaluate((a) => {
    const g = window.__game;
    const pl = g.getPlayer();
    const w0 = g.getEnemies().find(e => e.type === 'W');
    if (!w0) return { error: 'W が盤面に居ない' };
    const id = w0.id;
    const find = () => g.getEnemies().find(e => e.id === id);

    const samples = [];
    const projTypes = new Set();
    const gameTime0 = g.getState().gameTime;
    for (let t = 1; t <= a.ticks; t++) {
      if (a.dropAt === t) g.dealDamage(id, a.dmg);
      g.step(1);
      const e = find();
      if (!e) break;
      const p = g.getPlayer();
      for (const pr of g.getProjectiles()) projTypes.add(pr.type);
      samples.push({
        t, hp: e.hp, x: e.x, y: e.y,
        dist: Math.hypot(p.x - e.x, p.y - e.y),
        cmode: e.cmode ?? null,
        hitAndAway: e.hitAndAway ?? null,
        combat: e.combat ?? null,
        approachMode: e.approachMode ?? null,
        modeWeights: e.modeWeights ?? null,
        // 石が飛んだ tick を相と突き合わせるため、投擲物の種別もその tick で見る
        projNow: g.getProjectiles().map(pr => pr.type),
      });
    }
    const e = find();
    return {
      gameTime0, id, projTypes: [...projTypes], samples,
      player: { x: pl.x, y: pl.y, hp: g.getPlayer().hp },
      end: e && {
        hp: e.hp, maxHp: e.maxHp, speed: e.speed, cmode: e.cmode ?? null,
        hitAndAway: e.hitAndAway ?? null, combat: e.combat ?? null,
        modeWeights: e.modeWeights ?? null, approachMode: e.approachMode ?? null,
        phasesTriggered: e.phasesTriggered ?? null,
      },
    };
  }, o);
}

// ── ① データ＝W の層2（前半は間合いを保つ二相・後半は張り付き）─────────────────
// GUIDE §7-3 の罠（「遠隔モードなのに撃てない位置に居る」）をデータ側で止める本。
test('① W 魔物のデータ＝combat の間合いが自分の剣の外・石の内、後半は移動型が変わる', () => {
  const m = ENEMY_META['W'];
  const sword = m.attacks.find(a => a.type === 'sword');
  const stone = m.attacks.find(a => a.type === 'stone');

  // 前半＝二相。`hitAndAway` は enemyTick の分岐で combat より優先される∴明示 false が要る。
  expect(m.hitAndAway, 'hitAndAway が false でないと combat の移動が一度も使われない').toBe(false);
  expect(m.combat, 'combat が無い＝W が旧テンプレート（張り付き）に戻っている').toBeTruthy();

  const c = m.combat;
  expect(c.keepMin, '保つ間合いの下限が自分の剣の射程の内側＝遠隔相で殴り合いになる')
    .toBeGreaterThan(sword.range);
  expect(c.keepMax, '保つ間合いの上限が石の射程の外＝遠隔相なのに撃てない（GUIDE §7-3）')
    .toBeLessThan(stone.range);
  expect(c.keepMax, 'keepMax が keepMin を下回っている').toBeGreaterThan(c.keepMin);
  expect(c.rangedMs, '遠隔相が石の cooldown より短い＝1発も投げずに近接相へ移る')
    .toBeGreaterThanOrEqual(stone.cooldown);

  // 後半＝移動 AI そのものを差し替える（層1 の口）。
  const p = m.phases.find(ph => ph.hitAndAway !== undefined || ph.combat !== undefined);
  expect(p, '後半の相が移動型を差し替えていない＝前半と同じ動きのまま').toBeTruthy();
  expect(p.hitAndAway).toBe(true);
  expect(p.combat, '二相を切らないと hitAndAway 優先で combat が死んだまま残る').toBe(false);

  // 後半の寄り方＝**回り込み（flank）主体**。2つとも実測で踏んだ罠の番人：
  //   ・direct が最大 → G「まっすぐ来て振り下ろす」と同じ型（0d-3 の判定基準に反する）
  //   ・strafe が最大 → プレイヤーから 4.0〜6.0 の側方を周回する＝石の射程 4 の外で
  //                     何もしない案山子になる（2026-08-25 の実測）
  const w = p.modeWeights;
  expect(w, '後半の寄り方を書いていない（既定の均等重みでは回り込みにならない）').toBeTruthy();
  const top = Math.max(...Object.values(w));
  expect(w.flank, `寄り方の最大が flank ではない（${JSON.stringify(w)}）`).toBe(top);
  expect(w.strafe + w.wander, '崩し（strafe/wander）が多すぎる＝遠くを周回して詰めて来ない')
    .toBeLessThan(w.flank);
  // 前半は寄り方の抽選を通らない∴meta 直書きの死んだ数値を残さない
  expect(m.initialModeWeights, '前半は hitAndAway: false ＝ initialModeWeights は読まれない死んだ数値')
    .toBeUndefined();
});

// ── ② 実機・前半＝間合いを保つ（詰めて来ない）／近接相だけ踏み込む ─────────────
// ★ この本が 0d-3 の主張そのもの＝「近づき方が G と違う」。
// 沈黙の理由が「遅くて届かない」ではないことは、同じ run の**近接相で実際に密着する**
// ことが示す（GUIDE §4-1 の対照＋本番と同じ作り）。
//
// ⚠️ 測り方の落とし穴（実測 2026-08-25 で踏んだ）＝「遠隔相の**最小**距離」で測ると必ず落ちる。
//    近接相で 1.0 まで詰めた直後に相が遠隔へ変わる∴遠隔相の**入り口**は密着している
//    （速度 0.45 では keepMin まで戻るのに 10 tick 以上かかる）。
//    ∴測るのは「相の終わりに間合いの外へ戻れているか」＋「密着している時間の割合」。
const SWORD_RANGE_W = 1.5;   // W 自身の剣の射程＝ここより内側は「殴り合いの距離」

// cmode の連続区間（相）へ切り分ける。最後の区間は打ち切られている（次の相を観測して
// いない）∴「終わりに戻れたか」の判定からは外す＝tick 数を算術で決めない代わりの作法。
function runsOf(samples) {
  const runs = [];
  for (const s of samples) {
    const last = runs[runs.length - 1];
    if (last && last.mode === s.cmode) last.samples.push(s);
    else runs.push({ mode: s.cmode, samples: [s] });
  }
  return runs.map((r, i) => ({ ...r, complete: i < runs.length - 1 }));
}

test('② 前半は遠隔相で間合いを保ち、近接相でだけ剣の間合いまで詰める', async ({ page }) => {
  const c = ENEMY_META['W'].combat;
  const r = await trackMonster(page, { ticks: 160 });
  expect(r.error).toBeUndefined();
  expect(r.gameTime0, '実ループの tick が漏れている').toBe(0);

  const runs = runsOf(r.samples);
  const ranged = runs.filter(x => x.mode === 'ranged');
  const melee  = runs.filter(x => x.mode === 'melee');
  expect(ranged.length, '遠隔相が観測できていない（combat が効いていない）').toBeGreaterThanOrEqual(2);
  expect(melee.length, '近接相へ切り替わっていない（周期が長すぎる？）').toBeGreaterThanOrEqual(2);

  // (1) 完走した遠隔相は**終わりに間合いの外へ戻っている**＝「引く番」が成立している
  for (const run of ranged.filter(x => x.complete)) {
    const end = run.samples[run.samples.length - 1];
    expect(end.dist, `遠隔相の終わりに ${end.dist.toFixed(2)}＝間合いの外（${c.keepMin}）へ戻れていない`)
      .toBeGreaterThanOrEqual(c.keepMin);
  }
  // (2) 遠隔相のあいだ、殴り合いの距離に居るのは**離脱の遅れぶんだけ**＝張り付いていない
  const rangedTicks = ranged.flatMap(x => x.samples);
  const glued = rangedTicks.filter(s => s.dist <= SWORD_RANGE_W).length;
  expect(glued / rangedTicks.length,
    `遠隔相の ${(100 * glued / rangedTicks.length).toFixed(0)}% を剣の間合いで過ごした＝張り付き型のまま`)
    .toBeLessThan(0.2);
  // (3) 近接相では剣の間合いまで実際に詰める＝「遅くて届かない」ではない（沈黙の対照）
  for (const run of melee.filter(x => x.complete)) {
    const min = Math.min(...run.samples.map(s => s.dist));
    expect(min, `近接相でも ${min.toFixed(2)} までしか来ない＝踏み込みが成立していない`)
      .toBeLessThanOrEqual(SWORD_RANGE_W);
  }
});

// ── ③ 実機・遠隔相で石が飛ぶ（間合いを保つだけの案山子にならない）───────────────
test('③ 遠隔相のあいだに石が飛ぶ', async ({ page }) => {
  const r = await trackMonster(page, { ticks: 120 });
  expect(r.error).toBeUndefined();
  const stoneTicks = r.samples.filter(s => s.projNow.includes('stone')).map(s => s.t);
  expect(stoneTicks.length, '石が1度も飛んでいない（keepMax が石の射程外？）').toBeGreaterThan(0);
  const firstStone = r.samples.find(s => s.t === stoneTicks[0]);
  expect(firstStone.cmode, '石が飛んだのが遠隔相ではない').toBe('ranged');
});

// ── ④ 実機・HP 50% で移動アルゴリズムが切り替わる（層1 の口が出荷データで効く）──────
test('④ HP 半分で二相をやめ、回り込みの張り付き型に変わる', async ({ page }) => {
  const m = ENEMY_META['W'];
  // ⚠️ `dealDamage` は防御を通る（combat.js＝`max(1, dmg - e.def)`）∴HP の半分ぴったりを
  //    渡すと `def` ぶん足りずに閾値を割らない（実測でここに落ちた）。def を足して渡す。
  // 🔴（キュー11・2026-09-12）末尾の `minAfter <= SWORD_RANGE_W` は X-② と同型の
  //    unseeded Math.random（`bossTickHitAndAway` の寄り方抽選）に依存する統計的な
  //    テイルリスク（フル実行でこのサブテストが一度落ちた記録あり）。同じ `seed:1` で
  //    固定＝1〜40 の候補を実測し全部で minAfter<=1.5 を満たすことを確認済み。
  const r = await trackMonster(page, {
    ticks: 200, dropAt: 20, dmg: Math.ceil(m.hp / 2) + m.def, seed: 1,
  });
  expect(r.error).toBeUndefined();
  expect(r.end.hp / r.end.maxHp, '与えたダメージで HP が半分を割っていない＝相の前提が崩れた')
    .toBeLessThanOrEqual(0.5);

  const before = r.samples.filter(s => s.t < 20);
  const after  = r.samples.filter(s => s.t > 22);
  expect(before.every(s => s.hitAndAway === null && s.combat === null),
    '相の前にエンティティ側へ移動型が書かれている（初期状態が汚れている）').toBe(true);

  expect(r.end.phasesTriggered, '相が発火していない').toContain(0.5);
  expect(r.end.hitAndAway, '後半も張り付き型になっていない').toBe(true);
  expect(r.end.combat, '後半も二相が生きている＝移動型が変わっていない').toBe(false);
  expect(r.end.speed, '後半の速度倍率が効いていない')
    .toBeCloseTo(m.speed * m.phases[0].speedMultiplier, 6);

  // 相の後は cmode が消え（二相を切った）、ヒット＆アウェイの寄り方が立つ
  expect(after.every(s => s.cmode === null), '相の後も遠隔/近接の相が回っている').toBe(true);
  expect(after.some(s => s.approachMode != null), '相の後に寄り方（approachMode）が立たない').toBe(true);
  // 相の**直後**の重みを見る＝相が書いた値そのもの。
  // ⚠️ 終端で見てはいけない＝寄り方が `wander` を1周すると `_modeWeights` は
  //    `{flank,direct,wander}` へリセットされる（enemy-ai.js の学習・strafe が落ちる）∴
  //    「終わりに何が残っているか」は乱数任せ＝主張にできない。
  const justAfter = r.samples.find(s => s.t === 25);
  expect(justAfter.modeWeights, '相が寄り方の重みを書いていない')
    .toEqual(m.phases[0].modeWeights);

  // ★ 移動が実際に変わったことの実測＝**詰めて来る**（前半の遠隔相は間合いを保っていた）。
  // ⚠️ ヒット＆アウェイは寄り方の抽選もタイマーも乱数（既存機構）∴「何 tick で着くか」は
  //    主張にできない＝観測窓（200 tick ≒ 24 秒）の中で剣の間合いに入ることだけを見る。
  const minAfter = Math.min(...after.map(s => s.dist));
  expect(minAfter, `相の後も ${minAfter.toFixed(2)} までしか寄って来ない＝遠くを周回する案山子`)
    .toBeLessThanOrEqual(SWORD_RANGE_W);
});

// ── ⑤ 導出＝W の機構は G の機構と違う（手書きの表で数えない）─────────────────
// 完了条件 (b)「12体それぞれに固有機構が1つ以上ある（ENEMY_META から導出＝手書きしない）」
// のための型。以後の11体もこの関数を使い回す。
const MECHANISM_FIELDS = [
  'combat', 'hitAndAway', 'hide', 'leap', 'dash', 'blink', 'shell', 'blockFacing',
  'leech', 'split', 'zigzag', 'reflectsProjectiles', 'meleeOnly', 'aura',
  'laneStalk',      // 0d-3（2体目 A）: 車線取りの移動
  'burrowAmbush',   // 0d-3（3体目 N）: 潜行中だけ歩く待ち伏せの移動
  'coil',           // 0d-3（4体目 J）: 中心を決めて周回し輪を縮める移動（寄って来ない）
  'gaze',           // 0d-3（5体目 O）: 印（1拍前の足跡）へ寄る移動（プレイヤーを追わない）
  'soar',           // 0d-3（6体目 U）: 空へ退いて旋回し軸へ落ちる移動（届く手段が矢だけになる）
  'momentum',       // 0d-3（7体目 G）: 速度を追う移動（止まれない・曲がれない・壁で自壊する）
  'tongue',         // 0d-3（8体目 I）: 舌で**プレイヤーを動かす**（自分は寄って来ない）
  'surge',          // 0d-3（9体目 {）: 居られる場所が**地形で決まる**（水から出るのは乗り上げだけ）
  'glaciate',       // 0d-3（10体目 L）: 居場所を**自分で作る**（凍らせた床の上しか歩けない）
  'lockstep',       // 0d-3（11体目 X）: 詔（盾を無視する打点）の器＝時間で満ち、歩いた距離で
                    //   冷える（2026-09-03: 移動は魔将と同じ張り付き＝`hitAndAway` へ差し替え）
  'mirage',         // 0d-3（12体目 Z）: 見分けのつかない像を並べる（＝「どれが本物か」）。
                    //   ⚠️ **`phases[]` の中だけ**にある＝素のメタを見るだけでは使い手0に見える
];
const mechanismsOf = (meta) => new Set(MECHANISM_FIELDS.filter(k => meta[k]));
// 相の中まで数える版（2026-09-04・12体目 Z）＝`mirage` は `phases[].mirage` だけに在る
// （相1では像が湧かない）∴機構の在処は素のメタだけでは数えられない
// （[[blade-enemy-tables-derive-from-meta]]＝手書きの表も素のメタだけの導出も同じ穴を持つ）。
const mechanismsDeepOf = (meta) => new Set([
  ...MECHANISM_FIELDS.filter(k => meta[k]),
  ...(meta.phases ?? []).flatMap(p => MECHANISM_FIELDS.filter(k => p[k])),
]);
const attackTypesOf = (meta) => new Set(
  (meta.attacks ?? (meta.attack ? [meta.attack] : [])).map(a => a.type));

test('⑤ 機構の語彙は全部生きている／W の移動機構は G と重ならない', () => {
  // 語彙の番人＝どのフィールドも最低1体が使っている（改名・削除で表が腐るのを防ぐ）
  // ⚠️ 数えるのは `mechanismsDeepOf`＝**`phases[]` の中まで**（`mirage` は相の中だけに在る）。
  for (const k of MECHANISM_FIELDS) {
    const users = Object.entries(ENEMY_META).filter(([, m]) => mechanismsDeepOf(m).has(k));
    expect(users.length, `機構フィールド ${k} を使う敵が居ない（改名された？）`).toBeGreaterThan(0);
  }
  const w = mechanismsOf(ENEMY_META['W']);
  const g = mechanismsOf(ENEMY_META['G']);
  expect([...w].filter(k => !g.has(k)).length, 'W に G が持たない機構が1つも無い').toBeGreaterThan(0);
  // 攻撃の種別だけで差を付けた（＝移動は同じ）状態を許さない番人
  expect(w.has('combat') || w.has('hitAndAway'), 'W が移動機構を1つも持っていない').toBe(true);
  expect(attackTypesOf(ENEMY_META['W']).has('stone'), 'W が石を失っている＝遠隔相に撃つ物が無い').toBe(true);
});

// ── ⑥ 検証ステージの幾何（GUIDE §4-3＝前提を測る本自身で固定する）─────────────
test('⑥ bal_monster は 10×12・外周は通路以外すべて壁・W が (4,8) に1体だけ・水なし', () => {
  const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
  const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  const sd = MAP.layers[TEST_LAYER].stages[stageKey('bal_monster')];
  expect(sd.rows).toBe(10);
  expect(sd.cols).toBe(12);
  expect(Object.keys(sd.bgTiles ?? {}), '水や別地形が入った＝間合いの測定が地形のせいになる').toEqual([]);

  const at = (r, c) => sd.tiles[r][c];
  const monsters = [];
  for (let r = 0; r < sd.rows; r++) {
    for (let c = 0; c < sd.cols; c++) {
      const ch = at(r, c);
      if (ch === TILE.MONSTER) { monsters.push([r, c]); continue; }
      if (r === PL_ROW + 2 && c === 1) continue;   // 看板 i（プレイヤーの湧きの北）
      const edge = r === 0 || c === 0 || r === sd.rows - 1 || c === sd.cols - 1;
      const want = edge && !isArenaDoor(r, c, sd.cols) ? TILE.WALL : TILE.FLOOR;
      expect(at(r, c), `(${r},${c}) が想定と違う`).toBe(want);
    }
  }
  expect(monsters, 'W が1体だけ (4,8) に居る前提が崩れた').toEqual([[W_ROW, W_COL]]);
  // 計測に使う行（W とプレイヤーの並ぶ row 4）が通路と重ならない
  expect(isArenaDoor(W_ROW, 0, sd.cols)).toBe(false);
});

// ══════════════════════════════════════════════════════════════════════════
// 2体目＝**A 炎のサラマンドラ**（2×2・D4 炎の神殿のボス。`dungeon_4 0,0` に1体だけ）
//   前半 ＝`laneStalk`＝プレイヤーの**行 or 列を取りに横歩き**し、車線に乗ったら
//          間合い（holdMin〜holdMax）に整えて**止まり**、**炎の円錐**を予告つきで吐く
//   後半 ＝層1 の `phases[].dash`（0d-3 で新設した口）＝**同じ車線取りが突進に化ける**
//          ＝取った車線が「吐く線」から「走る線」に意味替えする（プレイヤーの読みが1段増える）
// G 岩のゴーレム＝「まっすぐ来て振り下ろす」／W 魔物＝「間合いを保って石を投げる」∴
// A は「斜めに来ない・正面に立つと焼かれる」＝3体とも近づき方が違う。
//
// 検証ステージ＝`test_mechanics[24,1]` `bal_fire_salamander`（A の実配置・遮蔽ゼロ）。
// 装備は **D4 のボス直前**（audit-balance の判定プロファイルと同じ諸元）＝ハート9・木の剣
// ティア0・盾なし・防具なし・弓/ブーメラン/ロウソク持ち（矢 ×2 の弱点に答えがある状態）。
const A_ROW = 4, A_COL = 7;          // 2×2 ∴ rows 4-5 / cols 7-8 を占める
const A_PL_ROW = 7, A_PL_COL = 1;    // 湧き（看板の南）＝**行も列も揃っていない**位置から測る
const D4_PRE = {
  ps_hearts: '9', ps_sword: '0', ps_shield: '0', ps_armor: '0',
  ps_weapon: '1', ps_bow: '1', ps_boomerang: '1', ps_candle: '1',
};

/**
 * `bal_fire_salamander` の A を n tick 追う。毎 tick の車線のずれ・間合い・予告・突進を返す。
 * @param {object} o
 * @param {number} o.ticks             進める論理 tick 数
 * @param {number} [o.dropAt]          この tick の step より前に A へ与えるダメージの tick
 * @param {number} [o.dmg]             そのダメージ量
 * @param {object} [o.dodge]           `{dir, maxSteps}`＝予告が立っている tick に1歩ずつ避ける
 * @param {object} [o.spawn]           プレイヤーの湧き（既定＝看板の南）を変える
 */
async function trackSalamander(page, o) {
  const sp = o.spawn ?? { row: A_PL_ROW, col: A_PL_COL };
  await gotoFrozen(page, previewUrl('bal_fire_salamander', sp.row, sp.col, D4_PRE));
  return page.evaluate((a) => {
    const g = window.__game;
    const a0 = g.getEnemies().find(e => e.type === 'A');
    if (!a0) return { error: 'A が盤面に居ない' };
    const id = a0.id;
    const find = () => g.getEnemies().find(e => e.id === id);
    const fireEls = () => [...document.querySelectorAll('.enemy-fire-breath')];
    // 炎のセルの座標は DOM から引く（showFireBreathEffect が left/top＝セル座標×cellPx で置く）。
    // cellPx は要素自身の幅＝盤の拡大率に依存しない（テストに px を焼かない）。
    const fireCells = (from) => fireEls().slice(from).map((el) => {
      const px = el.offsetWidth || 1;
      return { fx: parseFloat(el.style.left) / px, fy: parseFloat(el.style.top) / px };
    });
    // 2×2 の幾何（hitbox.js と同じ取り方＝中心はセル指標基準・間合いは body の端から）
    const geom = (e, p) => {
      const halfW = ((e.w ?? 1) - 1) / 2, halfH = ((e.h ?? 1) - 1) / 2;
      const cx = e.x + halfW, cy = e.y + halfH;
      const dx = p.x - cx, dy = p.y - cy;
      const alignRow = Math.abs(dy) <= Math.abs(dx);
      const gx = Math.max(0, Math.abs(dx) - halfW), gy = Math.max(0, Math.abs(dy) - halfH);
      return {
        cx, cy, alignRow,
        off:   Math.abs(alignRow ? dy : dx),   // 車線からの直交ずれ
        along: Math.abs(alignRow ? dx : dy),   // 車線方向の距離（中心間）
        reach: Math.hypot(gx, gy),             // body の端からの間合い
      };
    };

    const samples = [];
    let dodgeLeft = a.dodge?.maxSteps ?? 0;
    for (let t = 1; t <= a.ticks; t++) {
      if (a.dropAt === t) g.dealDamage(id, a.dmg);
      const before = find();
      // 予告が立っているあいだ **1 tick に1歩だけ**避ける（＝実プレイと同じ足の速さ）
      if (a.dodge && dodgeLeft > 0 && before?.breathAt != null) { g.movePlayer(a.dodge.dir); dodgeLeft--; }
      const fire0 = fireEls().length;
      g.step(1);
      const e = find();
      if (!e) break;
      const p = g.getPlayer();
      samples.push({
        t, hp: e.hp, x: e.x, y: e.y, dir: e.dir, speed: e.speed ?? null,
        ...geom(e, p),
        px: p.x, py: p.y, php: p.hp,
        breathAt: e.breathAt ?? null,
        breathDir: e.breathDir ?? null,
        breathWindupMs: e.breathWindupMs ?? null,
        dashPhase: e.dashPhase ?? null,
        dash: e.dash ?? null,
        newFire: fireCells(fire0),          // この tick に新しく出た炎のセル
        projNow: g.getProjectiles().map(pr => pr.type),
      });
    }
    const e = find();
    return {
      id, samples,
      end: e && {
        hp: e.hp, maxHp: e.maxHp, speed: e.speed ?? null, dash: e.dash ?? null,
        phasesTriggered: e.phasesTriggered ?? null, atkCdMul: e.atkCdMul ?? null,
      },
    };
  }, o);
}

// ── ⑦ データ＝A の層2（車線取り＋円錐ブレス・後半は突進）─────────────────────
// 「判定の距離が機構の実効範囲とずれている」型の罠（GUIDE §3-1／§7-3）を数値で止める本。
test('⑦ A 炎のサラマンドラのデータ＝車線取りの間合いが円錐の届く範囲・後半に突進が生える', () => {
  const m = ENEMY_META['A'];
  const breath = m.attacks.find(a => a.type === 'breath');
  const stone  = m.attacks.find(a => a.type === 'stone');
  const ls = m.laneStalk;

  expect(ls, 'laneStalk が無い＝A が旧テンプレート（寄って尻尾で殴る）に戻っている').toBeTruthy();
  expect(m.hitAndAway, 'hitAndAway が false でないと laneStalk の移動が一度も使われない').toBe(false);
  expect(m.combat, 'combat を持つと二相の移動が laneStalk より先に走る').toBeUndefined();
  expect(m.initialModeWeights, 'hitAndAway: false ＝ initialModeWeights は読まれない死んだ数値')
    .toBeUndefined();

  // 立ち止まる間合い＝**円錐が届く範囲そのもの**（外で止まると1発も当たらない案山子になる）
  expect(breath, '円錐ブレスを持っていない').toBeTruthy();
  expect(ls.holdMax, '立ち止まる間合いの上限がブレスの射程と違う＝届かない位置で吐き続ける')
    .toBe(breath.range);
  // 下がる下限＝**プレイヤーの剣の射程の外**（＝密着で棒立ちして殴られ続けない）
  expect(ls.holdMin, '下がる下限がプレイヤーの剣の射程の内側＝張り付いて殴られるだけになる')
    .toBeGreaterThan(SWORD_REACH);
  expect(ls.holdMin, 'holdMin が holdMax を上回っている').toBeLessThan(ls.holdMax);
  // 車線に乗ったと見なすずれ＝**円錐の幅の内側**（乗ったのに吐けない状態を作らない）
  expect(ls.lockTol, '車線の許容ずれが円錐の広がりより大きい＝乗ったのに芯から外れて吐けない')
    .toBeLessThanOrEqual(breath.spread ?? 1);

  // 予告＝近接の既定（480ms）以上あり、円錐は1レーンより広い
  expect(breath.windupMs, '予告が近接の既定より短い＝射線から出る時間が無い')
    .toBeGreaterThanOrEqual(MELEE_WINDUP_MS);
  expect(breath.cells,  '円錐の奥行きが1セル＝ただの接触になる').toBeGreaterThanOrEqual(2);
  expect(breath.spread, '円錐が広がらない＝直線1本（火吐き亀の炎と同じ）').toBeGreaterThanOrEqual(1);
  // ★ G と同じ「寄って振り下ろす」型に戻っていないことの番人
  expect(attackTypesOf(m).has('sword'),  'A が剣（尻尾）を持っている＝G と同じ近接型に戻った').toBe(false);
  expect(attackTypesOf(m).has('charge'), 'A が体当たりを持っている＝寄って当てる型に戻った').toBe(false);
  expect(stone, '遠距離の答えが無い＝車線を取るまで何もしない').toBeTruthy();

  // 後半＝突進が**生える**（表の差し替えではなく機構の追加＝0d-3 で新設した口）
  const ph = m.phases.find(p => p.dash !== undefined);
  expect(ph, '後半に突進が生えない＝前半と同じ動きのまま速くなるだけ').toBeTruthy();
  expect(m.dash, '前半から突進を持っている＝「後半で化ける」が成立しない').toBeUndefined();
  // 突進が発火する車線・距離が、車線取りが実際に立つ場所と重なっていること
  // （W の後半で踏んだ「案山子の相」＝重みは変えたが届かない、と同じ型の罠）
  expect(ph.dash.alignTol, '突進の車線が laneStalk の許容ずれより狭い＝乗ったのに走らない')
    .toBeGreaterThanOrEqual(ls.lockTol);
  expect(ph.dash.minRange, '突進の最短距離が立ち止まる間合いの外＝止まった位置から一度も走れない')
    .toBeLessThanOrEqual(ls.holdMax);
  expect(ph.dash.maxRange, '突進の最長距離が立ち止まる間合いより近い').toBeGreaterThan(ls.holdMax);
});

// ── ⑧ 実機・車線を取ってから詰める（＝まっすぐ来ない）───────────────────────
// ★ この本が 0d-3 の主張そのもの＝「近づき方が G と違う」。
// G（`enemyChase`）は縦横のずれを**同時に**削る∴「直交ずれが 0 になるまで車線方向の距離が
// 縮まない」のは laneStalk だけの性質＝機構を潰すと赤くなる（歯）。
test('⑧ A は先に行/列を取り（横歩き）、そのあいだ車線方向へは詰めない', async ({ page }) => {
  const ls = ENEMY_META['A'].laneStalk;
  const r = await trackSalamander(page, { ticks: 60 });
  expect(r.error).toBeUndefined();

  const s0 = r.samples[0];
  expect(s0.off, '初期配置で既に車線が揃っている＝横歩きを観測できない')
    .toBeGreaterThan(ls.lockTol);
  const locked = r.samples.find(s => s.off <= ls.lockTol);
  expect(locked, `${r.samples.length} tick で車線を取れていない（横歩きが動いていない）`).toBeTruthy();
  const held = r.samples.find(s => s.reach <= ls.holdMax);
  expect(held, '間合いまで詰めていない＝車線を取ったあと止まったまま').toBeTruthy();

  // (1) 車線を取るのが先＝間合いを詰めるより前（G のように斜めに寄って来ない）
  expect(locked.t, '車線を取る前に間合いへ入った＝まっすぐ寄っている（G と同じ型）')
    .toBeLessThan(held.t);
  // (2) 横歩きのあいだ車線方向の距離は**変わらない**（＝直交方向にだけ歩いている）
  const walking = r.samples.filter(s => s.t <= locked.t);
  const alongMax = Math.max(...walking.map(s => s.along));
  const alongMin = Math.min(...walking.map(s => s.along));
  expect(alongMax - alongMin, `横歩きのあいだに車線方向へ ${(alongMax - alongMin).toFixed(2)} 詰めた＝斜めに寄っている`)
    .toBeLessThan(0.01);
  // (3) 車線に乗ったら**その車線を保ったまま**詰める（乗り直しでふらつかない）
  for (const s of r.samples.filter(s => s.t > locked.t)) {
    expect(s.off, `t${s.t} で車線を外れた（${s.off.toFixed(2)}）＝取った車線が保たれていない`)
      .toBeLessThanOrEqual(ls.lockTol);
  }
  // (4) 間合いに入ったら止まる＝吐く構え（動き続ける敵なら「射線から出る」猶予が無い）
  const after = r.samples.filter(s => s.t > held.t);
  expect(after.every(s => s.reach <= ls.holdMax && s.reach >= ls.holdMin - 0.01),
    `間合いを保てていない（${after.map(s => s.reach.toFixed(1)).join(',')}）`).toBe(true);
  // (5) 車線を取るまでの間も黙っていない＝遠距離の石が飛ぶ
  expect(r.samples.some(s => s.projNow.includes('stone')),
    '石が1度も飛んでいない＝車線を取るまで何もしない').toBe(true);
});

// ── ⑨ 実機・予告 → 円錐の炎（正面に立てば焼かれる／溜め中は動かない）──────────────
test('⑨ 車線に乗ると予告を出して止まり、円錐の炎がプレイヤーのセルを覆う', async ({ page }) => {
  const breath = ENEMY_META['A'].attacks.find(a => a.type === 'breath');
  const r = await trackSalamander(page, { ticks: 60 });
  expect(r.error).toBeUndefined();

  const windup = r.samples.filter(s => s.breathAt != null);
  expect(windup.length, '予告が1度も立たない（車線の判定が円錐より狭い？）').toBeGreaterThan(0);
  expect(windup[0].breathWindupMs, '予告の長さがデータと違う').toBe(breath.windupMs);
  expect(['left', 'right', 'up', 'down']).toContain(windup[0].breathDir);
  // (1) 予告のあいだ 1 mm も動かない＝「溜めているあいだに射線から出る」が成立する
  const froze = windup.every(s => s.x === windup[0].x && s.y === windup[0].y);
  expect(froze, `予告中に動いた（${windup.map(s => `${s.x},${s.y}`).join(' / ')}）`).toBe(true);
  // (2) 予告の長さぶん溜める（届いた tick に即ダメージではない）
  expect(windup.length, '予告が短すぎる＝データの windupMs が窓になっていない')
    .toBeGreaterThanOrEqual(Math.floor(breath.windupMs / TICK_MS));

  // (3) 解決の tick に炎が出る＝**円錐**（1レーンではない）
  const fired = r.samples.find(s => s.t > windup[0].t && s.newFire.length > 0);
  expect(fired, '予告のあとに炎が1セルも出ていない＝解決していない').toBeTruthy();
  const lanes = new Set(fired.newFire.map(c => windup[0].breathDir === 'left' || windup[0].breathDir === 'right'
    ? c.fy : c.fx));
  expect(lanes.size, `炎が1レーンしか無い（${fired.newFire.length}セル）＝直線で円錐になっていない`)
    .toBeGreaterThanOrEqual(2);
  expect(fired.newFire.length, '炎のセル数が奥行き×レーンに足りない').toBeGreaterThanOrEqual(4);
  // (4) 吐いた向きは予告で固定した向き（＝解決時に追尾していない）
  const vec = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[windup[0].breathDir];
  for (const c of fired.newFire) {
    const along = vec[0] !== 0 ? (c.fx - fired.cx) * vec[0] : (c.fy - fired.cy) * vec[1];
    expect(along, `炎のセル (${c.fx},${c.fy}) が吐いた向きの後ろにある`).toBeGreaterThan(0);
  }
  // (5) ★ 対照＝**射線に立ったまま**なら覆われる（この run はプレイヤーが動いていない）
  const covered = fired.newFire.some(c => Math.abs(fired.px - c.fx) < 0.9 && Math.abs(fired.py - c.fy) < 0.9);
  expect(covered, `車線に立っているのに炎がプレイヤー (${fired.px},${fired.py}) を覆わない`).toBe(true);
});

// ── ⑩ 実機・予告を見て射線から出れば空振りする（この攻撃の答え）─────────────────
// **同じ湧き位置で2本走らせる**（GUIDE §4-1 の対照＋本番）＝「覆われない」のが地形や
// 射程のせいではなく**避けたから**であることを差で示す。
// ⚠️ 湧きは既定（看板の南 (7,1)）ではなく **(7,5)** ＝看板 i が北を塞いでいて逃げられない
//    （0d-3 の実測でここに落ちた＝「動かない」を「機構が効いた」と読み違える一歩前だった）。
const A_DODGE_SPAWN = { row: 7, col: 5 };
test('⑩ 予告のあいだに車線から出ると炎は空を焼く（向きは追尾しない）', async ({ page }) => {
  // (1) 対照＝立ったまま（同じ配置で覆われることを先に固める）
  const stay = await trackSalamander(page, { ticks: 60, spawn: A_DODGE_SPAWN });
  expect(stay.error).toBeUndefined();
  const stayWindup = stay.samples.filter(s => s.breathAt != null);
  expect(stayWindup.length, '対照の run で予告が立たない').toBeGreaterThan(0);
  const stayFired = stay.samples.find(s => s.t > stayWindup[0].t && s.newFire.length > 0);
  expect(stayFired, '対照の run で炎が出ていない').toBeTruthy();
  expect(stayFired.newFire.some(c => Math.abs(stayFired.px - c.fx) < 0.9 && Math.abs(stayFired.py - c.fy) < 0.9),
    `対照の湧き (${A_DODGE_SPAWN.row},${A_DODGE_SPAWN.col}) が射線に乗っていない＝本番の「覆われない」が空虚`)
    .toBe(true);

  // (2) 本番＝予告のあいだ 1 tick に 0.5 セルずつ北へ逃げる（実プレイと同じ足の速さ）
  const r = await trackSalamander(page, {
    ticks: 60, spawn: A_DODGE_SPAWN, dodge: { dir: 'up', maxSteps: 6 },
  });
  expect(r.error).toBeUndefined();

  const windup = r.samples.filter(s => s.breathAt != null);
  expect(windup.length, '予告が1度も立たない').toBeGreaterThan(0);
  const dir0 = windup[0].breathDir;
  // 溜めのあいだプレイヤーは動いたが、吐く向きは**固定されたまま**
  expect(windup.every(s => s.breathDir === dir0), '溜めの途中で吐く向きが変わった＝追尾している').toBe(true);
  const moved = Math.abs(windup[windup.length - 1].py - windup[0].py);
  expect(moved, `溜めのあいだに逃げられていない（${moved} セル）＝この本が何も測っていない`)
    .toBeGreaterThanOrEqual(1.0);

  const fired = r.samples.find(s => s.t > windup[0].t && s.newFire.length > 0);
  expect(fired, '炎が出ていない＝解決していない').toBeTruthy();
  const covered = fired.newFire.some(c => Math.abs(fired.px - c.fx) < 0.9 && Math.abs(fired.py - c.fy) < 0.9);
  expect(covered, `射線から出たのに炎がプレイヤー (${fired.px},${fired.py}) を覆っている＝避けられない攻撃`)
    .toBe(false);
});

// ── ⑪ 実機・HP 50% で車線取りが突進に化ける（層1 の `phases[].dash` が出荷データで効く）──
test('⑪ HP 半分で突進が生え、取った車線を走って来る', async ({ page }) => {
  const m = ENEMY_META['A'];
  const ph = m.phases.find(p => p.dash !== undefined);
  // ⚠️ `dealDamage` は防御を通る（combat.js＝`max(1, dmg - e.def)`）∴def を足して渡す。
  const r = await trackSalamander(page, { ticks: 200, dropAt: 45, dmg: Math.ceil(m.hp / 2) + m.def });
  expect(r.error).toBeUndefined();
  expect(r.end.hp / r.end.maxHp, '与えたダメージで HP が半分を割っていない＝相の前提が崩れた')
    .toBeLessThanOrEqual(0.5);
  expect(r.end.phasesTriggered, '相が発火していない').toContain(ph.hpThreshold);

  const before = r.samples.filter(s => s.t < 45);
  expect(before.every(s => s.dash === null), '相の前からエンティティ側に突進が書かれている').toBe(true);
  expect(before.every(s => s.dashPhase === null), '相の前から突進の状態機械が回っている').toBe(true);

  expect(r.end.dash, '相が突進を書いていない＝後半も歩いて来るだけ').toEqual(ph.dash);
  expect(r.end.speed, '後半の速度倍率が効いていない')
    .toBeCloseTo(m.speed * ph.speedMultiplier, 6);
  expect(r.end.atkCdMul, '後半の攻撃間隔の倍率が効いていない').toBe(ph.attackCooldownMultiplier);

  // ★ 移動が実際に変わったことの実測＝**突進が走る**（歩きでは出ない速さで動く tick がある）
  const after = r.samples.filter(s => s.t > 45);
  expect(after.some(s => s.dashPhase === 'windup'), '突進の溜めに入らない＝生えた突進が案山子').toBe(true);
  expect(after.some(s => s.dashPhase === 'run'), '溜めたまま走り出さない').toBe(true);
  let maxStep = 0;
  for (let i = 1; i < after.length; i++) {
    maxStep = Math.max(maxStep, Math.abs(after[i].x - after[i - 1].x) + Math.abs(after[i].y - after[i - 1].y));
  }
  expect(maxStep, `1 tick の最大移動が ${maxStep} セル＝歩幅のまま（突進が走っていない）`)
    .toBeGreaterThanOrEqual(1.0);
  // 前半にこの速さは出ない（＝上の数字が「相のせい」であることの対照）
  let maxStepBefore = 0;
  for (let i = 1; i < before.length; i++) {
    maxStepBefore = Math.max(maxStepBefore,
      Math.abs(before[i].x - before[i - 1].x) + Math.abs(before[i].y - before[i - 1].y));
  }
  expect(maxStepBefore, '前半から突進の速さで動いている＝相の効果が測れていない').toBeLessThan(1.0);
});

// ── ⑫ 導出＝A の機構は G・W と重ならない（手書きの表で数えない）──────────────────
test('⑫ A の移動機構は G・W のどちらとも重ならない', () => {
  const a = mechanismsOf(ENEMY_META['A']);
  const g = mechanismsOf(ENEMY_META['G']);
  const w = mechanismsOf(ENEMY_META['W']);
  expect(a.has('laneStalk'), 'A が移動機構（laneStalk）を持っていない').toBe(true);
  expect([...a].filter(k => !g.has(k) && !w.has(k)).length,
    'A に G・W が持たない機構が1つも無い＝3体目の型になっていない').toBeGreaterThan(0);
  expect(g.has('laneStalk') || w.has('laneStalk'),
    'G か W が車線取りを持っている＝A の固有機構ではない').toBe(false);
  // 攻撃の種別でも重ならない（円錐ブレスは A だけ）
  const breathUsers = Object.entries(ENEMY_META)
    .filter(([, m]) => attackTypesOf(m).has('breath')).map(([k]) => k);
  expect(breathUsers, '円錐ブレスを持つ敵が A 以外にも居る（設計が重複した）').toEqual(['A']);
});

// ── ⑬ 検証ステージの幾何（GUIDE §4-3）────────────────────────────────
test('⑬ bal_fire_salamander は 10×12・外周は通路以外すべて壁・A が (4,7) に1体だけ・水なし', () => {
  const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
  const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  const sd = MAP.layers[TEST_LAYER].stages[stageKey('bal_fire_salamander')];
  expect(sd.rows).toBe(10);
  expect(sd.cols).toBe(12);
  expect(Object.keys(sd.bgTiles ?? {}), '水や別地形が入った＝間合いの測定が地形のせいになる').toEqual([]);

  const at = (r, c) => sd.tiles[r][c];
  const salamanders = [];
  for (let r = 0; r < sd.rows; r++) {
    for (let c = 0; c < sd.cols; c++) {
      const ch = at(r, c);
      if (ch === TILE.FIRE_SALAMANDER) { salamanders.push([r, c]); continue; }
      if (r === A_PL_ROW - 1 && c === 1) continue;   // 看板 i（プレイヤーの湧きの北）
      const edge = r === 0 || c === 0 || r === sd.rows - 1 || c === sd.cols - 1;
      const want = edge && !isArenaDoor(r, c, sd.cols) ? TILE.WALL : TILE.FLOOR;
      expect(at(r, c), `(${r},${c}) が想定と違う`).toBe(want);
    }
  }
  expect(salamanders, 'A が1体だけ (4,7) に居る前提が崩れた').toEqual([[A_ROW, A_COL]]);
  // 円錐の届く範囲（プレイヤーの湧きの行＝row 7 の西 3 セル）に壁が無い
  // ＝⑨ の「覆われる」が地形で潰れない（0d-3 の測定はこの行の上で成立している）
  for (let c = 1; c <= 4; c++) {
    expect(at(A_PL_ROW, c), `(${A_PL_ROW},${c}) が床でない＝円錐が途中で止まる`).toBe(TILE.FLOOR);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 3体目＝**N 砂嵐の蠍王**（2×2・D2 砂漠の神殿のボス。`dungeon_2 0,0` に1体だけ）
//   潜行中（`hide.style 'burrow'`）＝**歩くのはここだけ**。`burrowAmbush` が
//     プレイヤーの**向こう側**（`pickAmbushCell`）へ BFS で回り込み、着いた瞬間に浮上する。
//   地上中 ＝**1歩も動かない**。向きだけ合わせて鉗肢（sword）と毒針（stone）で戦う。
// ∴移動と交戦が**時間で完全に分離する**＝G（常に歩いて殴る）・W（間合いを往復する）・
//   A（車線を取って止まる）のどれとも別の近づき方。プレイヤーの答えは「砂煙の出た場所から
//   離れる／浮上した窓に殴る（弱点ブーメラン×3 の窓＝浮上している時間そのもの）」。
//
// ⚠️ 実測（2026-08-26）で潰した2点＝この節が守っている前提：
//   ① **貪欲な1歩選択では回り込めない**＝待ち伏せ地点は「向こう側」∴直線の途中に
//      プレイヤーが立っており、2×2 の体は迂回に2セル必要（`isPassableForEnemy` は
//      重なりを拒む）∴潜行の窓を丸ごと使って 0.5 セルしか進まなかった → BFS へ。
//   ② **行き先が今立っている場所と同じ**だと「1 tick だけ潜る」ちらつきになった
//      → 現在地を候補から外し、隣接の輪が全滅したら1つ外の輪を試す。
//
// 検証ステージ＝`test_mechanics[26,1]` `bal_sand_scorpion`（N の実配置・遮蔽ゼロ）。
// 装備は **D2 のボス直前**（audit-balance の判定プロファイル＝ハート5・木の剣ティア0・
// 盾なし・防具なし・ブーメラン持ち＝弱点×3 に答えがある状態）。
const N_ROW = 4, N_COL = 7;          // 2×2 ∴ rows 4-5 / cols 7-8 を占める
const N_PL_ROW = 7, N_PL_COL = 1;    // 湧き（看板の南）
const D2_PRE = {
  ps_hearts: '5', ps_sword: '0', ps_shield: '0', ps_armor: '0',
  ps_weapon: '1', ps_boomerang: '1',
};
// 潜行の窓（tick）＝tickHide は now が `_hideUntil` を越えた tick に切り替える∴切り上げ。
const nHiddenTicks = (cfg) => Math.ceil(cfg.hiddenMs / TICK_MS);

// SE を観測するため AudioContext を張り子に差し替える（N の浮上音・J の締め上げ音で共用）。
// ⚠️ ページ側に置く＝spec ファイル間で張り子を取り合わない（Node 側に置くと同じ
//    worker で走る他の spec の張り子と衝突して、どちらかが黙って記録しなくなる）。
//    記録するのは周波数と tick ∴「潜った tick には鳴っていない」も言える。
const toneRec = new WeakSet();
async function installToneRec(page) {
  if (!toneRec.has(page)) {
    await page.addInitScript(() => {
      window.__tones = [];
      const rec = () => ({
        type: '', frequency: { setValueAtTime(f) { window.__tones.push(f); } },
        connect() {}, start() {}, stop() {},
      });
      const gain = () => ({
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {},
      });
      window.AudioContext = function () {
        return {
          currentTime: 0, state: 'running', destination: {},
          createOscillator: rec, createGain: gain, resume() {}, close() {},
        };
      };
      window.webkitAudioContext = window.AudioContext;
    });
    toneRec.add(page);
  }
}

/**
 * `bal_sand_scorpion` の N を n tick 追う。毎 tick の潜行状態・位置・待ち伏せ地点を返す。
 * @param {object} o
 * @param {number} o.ticks     進める論理 tick 数
 * @param {object} [o.spawn]   プレイヤーの湧き（既定＝看板の南 (7,1)）を変える
 * @param {number} [o.dropAt]  この tick 以降で**浮上している最初の** tick にダメージを与える
 * @param {number} [o.dmg]     そのダメージ量
 *
 * ⚠️ ダメージは「潜行中は無効」（`game/combat.js:453` の `if (e.hidden) return;`）∴
 *    tick 番号を固定で指定すると潜行に当たって**HP が減らない**（実測 2026-08-26＝
 *    t50 固定で HP 満タンのまま相が発火しなかった）。浮上を待って落とす。
 */
async function trackScorpion(page, o) {
  await installToneRec(page);
  const sp = o.spawn ?? { row: N_PL_ROW, col: N_PL_COL };
  await gotoFrozen(page, previewUrl('bal_sand_scorpion', sp.row, sp.col, D2_PRE));
  return page.evaluate((a) => {
    const g = window.__game;
    const n0 = g.getEnemies().find(e => e.type === 'N');
    if (!n0) return { error: 'N が盤面に居ない' };
    const id = n0.id;
    const find = () => g.getEnemies().find(e => e.id === id);

    const samples = [];
    const gameTime0 = g.getState().gameTime;
    let projCount = g.getProjectiles().length;
    let dropTick = null;
    for (let t = 1; t <= a.ticks; t++) {
      if (a.dropAt != null && dropTick === null && t >= a.dropAt && !find()?.hidden) {
        g.dealDamage(id, a.dmg);
        dropTick = t;
      }
      const tone0 = window.__tones.length;
      g.step(1);
      const e = find();
      if (!e) break;
      const p = g.getPlayer();
      const halfW = ((e.w ?? 1) - 1) / 2, halfH = ((e.h ?? 1) - 1) / 2;
      const cx = e.x + halfW, cy = e.y + halfH;
      const now = g.getProjectiles().length;
      samples.push({
        t, hp: e.hp, x: e.x, y: e.y, dir: e.dir, speed: e.speed ?? null,
        hidden: !!e.hidden, hideUntil: e.hideUntil ?? null,
        ambushTo: e.ambushTo ?? null, hide: e.hide ?? null,
        swingAt: e.swingAt ?? null,
        // body の端からの間合い（hitbox.js と同じ取り方）＝浮上した瞬間に殴れるか
        reach: Math.hypot(Math.max(0, Math.abs(p.x - cx) - halfW),
                          Math.max(0, Math.abs(p.y - cy) - halfH)),
        dx: p.x - cx, dy: p.y - cy,
        px: p.x, py: p.y, php: p.hp,
        newProj: Math.max(0, now - projCount),      // この tick に新しく飛んだ数
        newTones: window.__tones.slice(tone0),      // この tick に鳴った周波数
      });
      projCount = now;
    }
    const e = find();
    return {
      gameTime0, id, samples, dropTick,
      end: e && {
        hp: e.hp, maxHp: e.maxHp, speed: e.speed ?? null, hide: e.hide ?? null,
        phasesTriggered: e.phasesTriggered ?? null, atkCdMul: e.atkCdMul ?? null,
      },
    };
  }, o);
}

/** hidden の連続区間へ切り分ける（最後の区間は打ち切られている＝complete false）。 */
function hideRuns(samples) {
  const runs = [];
  for (const s of samples) {
    const last = runs[runs.length - 1];
    if (last && last.hidden === s.hidden) last.samples.push(s);
    else runs.push({ hidden: s.hidden, samples: [s] });
  }
  return runs.map((r, i) => ({ ...r, complete: i < runs.length - 1 }));
}
/** 区間内の総移動量（1 tick ごとの |Δx|+|Δy| の和） */
const movedIn = (run) => run.samples.slice(1).reduce((a, s, i) =>
  a + Math.abs(s.x - run.samples[i].x) + Math.abs(s.y - run.samples[i].y), 0);

// ── ⑭ データ＝N の層2（潜行＝移動の窓／地上＝交戦の窓・後半は潜行が短くなる）──────
test('⑭ N 砂嵐の蠍王のデータ＝潜行と待ち伏せが組になり、浮上の窓が弱点の窓になる', () => {
  const m = ENEMY_META['N'];
  const sword = m.attacks.find(a => a.type === 'sword');
  const stone = m.attacks.find(a => a.type === 'stone');

  // 移動機構＝`hide` と `burrowAmbush` の**組**（片方だけでは意味を持たない）
  expect(m.hide, 'hide が無い＝潜行の窓が無い＝burrowAmbush が一度も歩けない').toBeTruthy();
  expect(m.hide.style, '潜行の見た目が burrow でない＝水の波紋で砂から出る').toBe('burrow');
  expect(m.burrowAmbush, 'burrowAmbush が無い＝隠れても「まっすぐ寄って来る」だけ（旧 hide 単体）')
    .toBeTruthy();
  expect(m.hitAndAway, 'hitAndAway が false でないと burrowAmbush の移動が一度も使われない').toBe(false);
  expect(m.combat, 'combat を持つと二相の移動が burrowAmbush より先に走る').toBeUndefined();
  expect(m.laneStalk, 'laneStalk を持つと車線取り（A の型）が先に走る').toBeUndefined();
  expect(m.initialModeWeights, 'hitAndAway: false ＝ initialModeWeights は読まれない死んだ数値')
    .toBeUndefined();

  // 浮上した瞬間に**殴れる距離**に出る＝待ち伏せの間合いが鉗肢の届く範囲（GUIDE §3-1）
  expect(sword, '鉗肢（sword）が無い＝浮上しても何もしない').toBeTruthy();
  expect(m.burrowAmbush.ambushDist, '待ち伏せの間合いが鉗肢の射程の外＝出た瞬間に手が出ない')
    .toBeLessThanOrEqual(sword.range);
  expect(stone, '遠距離の答えが無い＝浮上しても遠ければ何もしない').toBeTruthy();

  // 潜行の窓＝**回り込める長さ**（速度 × tick 数 × MOVE_STEP がプレイヤーの向こう側に届く）
  const ticks = nHiddenTicks(m.hide);
  const cells = ticks * m.speed * MOVE_STEP;
  expect(cells, `潜行 ${ticks} tick で ${cells.toFixed(1)} セルしか進めない＝回り込めない（迂回に2セル要る）`)
    .toBeGreaterThanOrEqual(6);
  expect(m.speed, 'GUIDE §7-2＝敵はプレイヤー（速度換算 1.0）より速くない').toBeLessThan(1.0);
  // 浮上の窓が潜行の窓より短いと「殴れない時間」の方が長くなる（弱点×3 の答えが機能しない）
  expect(m.hide.shownMs, '浮上している時間が潜行より短い＝無敵の方が長いボスになる')
    .toBeGreaterThanOrEqual(m.hide.hiddenMs);
  expect(m.weakness, '弱点が無い＝浮上の窓に報酬が無い').toBeTruthy();
  expect(m.weakness.type, '弱点がブーメランでない（浮上の窓に投げる武器）').toBe('boomerang');

  // 後半＝潜行が**短くなる**＝待ち伏せの回数が増え、同時に無敵の窓も短くなる
  const ph = m.phases.find(p => p.hide !== undefined);
  expect(ph, '後半に潜行の周期が変わらない＝前半と同じまま速くなるだけ').toBeTruthy();
  expect(ph.hide.hiddenMs, '後半の潜行が長くなっている＝無敵の時間が増える強化（一方的に硬い）')
    .toBeLessThan(m.hide.hiddenMs);
  expect(ph.hide.shownMs, '後半の浮上が短くなっている＝殴れる窓を削る強化').toBe(m.hide.shownMs);
  expect(ph.hide.style, '後半の潜行の見た目が変わる（砂→水など）').toBe(m.hide.style);
  expect(m.speed * (ph.speedMultiplier ?? 1), '後半の潜行速度がプレイヤーを超える').toBeLessThan(1.0);
  // ★ G と同じ「寄って振り下ろす」型に戻っていないことの番人
  expect(m.dash, 'N が突進を持っている＝A の後半と同じ型になった').toBeUndefined();
  expect(m.phases.every(p => p.dash === undefined), 'N の相が突進を生やしている＝A と同じ化け方')
    .toBe(true);
});

// ── ⑮ 実機・歩くのは潜行中だけ／地上では1歩も動かない（★0d-3 の主張そのもの）────────
// G（`enemyChase`）も W も A も「見えている状態で歩く」∴「見えているあいだ**1 mm も動かない**」
// のは burrowAmbush だけの性質＝機構を潰すと赤くなる（歯）。
// 対照は同じ run の中にある＝潜行中は実際に何セルも移動する（＝止まっているのは
// 「遅くて動けない」ではなく「地上では歩かない」から）。
test('⑮ N は潜っているあいだだけ歩き、浮上しているあいだは1歩も動かない', async ({ page }) => {
  const m = ENEMY_META['N'];
  const r = await trackScorpion(page, { ticks: 90 });
  expect(r.error).toBeUndefined();
  expect(r.gameTime0, '実ループの tick が漏れている').toBe(0);

  const runs = hideRuns(r.samples);
  const hiddenRuns = runs.filter(x => x.hidden);
  const shownRuns  = runs.filter(x => !x.hidden);
  expect(hiddenRuns.length, '潜行の相が観測できていない（hide が効いていない）').toBeGreaterThanOrEqual(2);
  expect(shownRuns.length, '浮上の相が観測できていない').toBeGreaterThanOrEqual(2);

  // (1) 地上＝**1 mm も動かない**（区間の中で座標が1つしかない）
  for (const run of shownRuns) {
    const spots = new Set(run.samples.map(s => `${s.x},${s.y}`));
    expect([...spots], `浮上中に動いた（t${run.samples[0].t}〜）＝地上で歩いている`)
      .toEqual([`${run.samples[0].x},${run.samples[0].y}`]);
  }
  // (2) 潜行中＝**実際に何セルも歩く**（(1) が「遅くて動けない」ではないことの対照）
  const walked = Math.max(...hiddenRuns.map(movedIn));
  expect(walked, `潜行中の最大移動が ${walked} セル＝潜っても歩いていない`).toBeGreaterThanOrEqual(3);
  // (3) 無敵の窓は必ず hiddenMs で終わる（着けなくても潜ったままにならない）
  const cap = nHiddenTicks(m.hide);
  for (const run of hiddenRuns.filter(x => x.complete)) {
    expect(run.samples.length, `潜行が ${run.samples.length} tick 続いた＝hiddenMs（${cap} tick）を超えている`)
      .toBeLessThanOrEqual(cap);
  }
  // (4) 潜行中は攻撃しない（鉗肢の予告も毒針も出ない＝無敵と引き換え）
  const hiddenTicks = hiddenRuns.flatMap(x => x.samples);
  expect(hiddenTicks.every(s => s.swingAt === null), '潜行中に鉗肢の予告が立っている').toBe(true);
  expect(hiddenTicks.every(s => s.newProj === 0), '潜行中に毒針が飛んだ＝無敵のまま撃っている').toBe(true);
  // (5) 潜るたびに待ち伏せ地点を持ち、地上では持たない（＝移動の意思が時間で分離している）
  expect(hiddenRuns.every(x => x.samples.some(s => s.ambushTo !== null)),
    '潜行中に待ち伏せ地点が1度も立たない＝burrowAmbush が走っていない').toBe(true);
  expect(shownRuns.every(x => x.samples.every(s => s.ambushTo === null)),
    '浮上中も待ち伏せ地点が残っている＝地上で歩き出す一歩前').toBe(true);
});

// ── ⑯ 実機・プレイヤーの向こう側へ回り込んで出る（＝まっすぐ来ない）──────────────
// 湧きは **(5,4)**＝N（rows 4-5 / cols 7-8）の**西**に立つ位置。ここから見た N は東に居る∴
// 「向こう側に出た」は**東西の符号が反転する**ことで言える（距離だけでは言えない）。
// ⚠️ 既定の湧き (7,1) では使えない＝向こう側が盤外／看板／下壁で潰れ、手前や直交の脇に出る
//    （＝符号が反転しない。実測 2026-08-26 でこの位置に落ちた）。
const N_FLANK_SPAWN = { row: 5, col: 4 };
test('⑯ N は潜行中にプレイヤーを跨いで向こう側へ回り込み、殴れる距離に浮上する', async ({ page }) => {
  const m = ENEMY_META['N'];
  const sword = m.attacks.find(a => a.type === 'sword');
  const r = await trackScorpion(page, { ticks: 60, spawn: N_FLANK_SPAWN });
  expect(r.error).toBeUndefined();

  const s0 = r.samples[0];
  expect(s0.hidden, '初手が潜行で始まっていない（tickHide の初期状態が変わった？）').toBe(true);
  expect(s0.dx, `初期配置でプレイヤーが N の東側に居る（dx=${s0.dx}）＝符号の反転を観測できない`)
    .toBeLessThan(0);

  const runs = hideRuns(r.samples);
  const firstShown = runs.find(x => !x.hidden);
  expect(firstShown, '60 tick で1度も浮上していない').toBeTruthy();
  const out = firstShown.samples[0];
  // (1) 向こう側＝**東西の符号が反転している**（＝プレイヤーを跨いだ）
  expect(out.dx, `浮上した位置がまだ手前側（dx=${out.dx.toFixed(1)}）＝跨いでいない`).toBeGreaterThan(0);
  // (2) 出た瞬間に**殴れる距離**に居る（待ち伏せの間合いが鉗肢の射程の内側）
  expect(out.reach, `浮上した位置が鉗肢の射程外（${out.reach.toFixed(2)} > ${sword.range}）＝出ても届かない`)
    .toBeLessThanOrEqual(sword.range);
  // (3) 跨いだのは**潜行中だけ**＝浮上した tick に瞬間移動していない
  const prev = r.samples[r.samples.findIndex(s => s.t === out.t) - 1];
  expect(prev.hidden, '浮上の直前が潜行でない').toBe(true);
  expect(Math.abs(out.x - prev.x) + Math.abs(out.y - prev.y),
    '浮上した tick に動いた＝待ち伏せではなく瞬間移動になっている').toBeLessThan(0.01);
  expect(Math.sign(prev.dx), '潜行の最後の tick で既に向こう側に居る（＝跨ぎ切っている）が符号が違う')
    .toBe(Math.sign(out.dx));
});

// ── ⑰ 実機・着いた瞬間に浮上する（hiddenMs を待たない＝無償の無敵を作らない）──────────
// 湧きは **(7,7)**＝N の真下（rows 4-5 / cols 7-8 の南）＝待ち伏せ地点が近い位置。
// hiddenMs（20 tick）より**早く**着く∴「着いたら出る」が観測できる。
const N_NEAR_SPAWN = { row: 7, col: 7 };
test('⑰ N は待ち伏せ地点に着いた瞬間に浮上する（潜行の窓を余らせる）', async ({ page }) => {
  const m = ENEMY_META['N'];
  const r = await trackScorpion(page, { ticks: 60, spawn: N_NEAR_SPAWN });
  expect(r.error).toBeUndefined();

  const runs = hideRuns(r.samples);
  const dive = runs.find(x => x.hidden && x.complete);
  expect(dive, '完走した潜行が観測できていない').toBeTruthy();
  const cap = nHiddenTicks(m.hide);

  // (1) hiddenMs を**使い切る前に**浮上している＝時間切れではなく到着で出た
  expect(dive.samples.length, `潜行が ${dive.samples.length} tick＝窓（${cap} tick）を使い切った＝到着で出ていない`)
    .toBeLessThan(cap);
  // (2) 最後の tick に**待ち伏せ地点へ着いている**（＝出た理由が到着であることの裏取り）
  const last = dive.samples[dive.samples.length - 1];
  expect(last.ambushTo, '潜行の最後に待ち伏せ地点が消えている').toBeTruthy();
  expect([last.y, last.x], `潜行の最後の位置 (${last.y},${last.x}) が待ち伏せ地点 ${JSON.stringify(last.ambushTo)} と違う`)
    .toEqual(last.ambushTo);
  // (3) 余らせた窓の長さ＝無償の無敵として銀行に積まれていない（次の潜行も窓の中に収まる）
  for (const run of runs.filter(x => x.hidden && x.complete)) {
    expect(run.samples.length, '潜行が窓を超えた＝余りが繰り越されている').toBeLessThanOrEqual(cap);
  }
});

// ── ⑱ 実機・浮上した窓で鉗肢が来る／浮上の瞬間に砂が鳴る（音が唯一の予告）──────────
// 浮上は**背後にも起きる**∴`sandBurst` が「どこに出たか」を伝える唯一の手がかり
// （GUIDE §7-6＝結果の音。潜る側では鳴らさない）。
test('⑱ 浮上した窓で鉗肢を振り、浮上の瞬間だけ砂の SE が鳴る', async ({ page }) => {
  const m = ENEMY_META['N'];
  const r = await trackScorpion(page, { ticks: 90 });
  expect(r.error).toBeUndefined();

  const runs = hideRuns(r.samples);
  // (1) 浮上している窓で鉗肢の予告が立つ（＝浮上が「殴られる窓」でもある）
  const swings = r.samples.filter(s => s.swingAt !== null);
  expect(swings.length, '鉗肢の予告が1度も立たない＝浮上しても案山子').toBeGreaterThanOrEqual(4);
  expect(swings.every(s => !s.hidden), '潜行中に鉗肢の予告が立っている').toBe(true);

  // (2) 浮上した tick に `sandBurst` の周波数が全部鳴る（音が消えたら赤くなる）
  const SAND = [90, 1400, 900, 520];      // shared/sounds.js の 'sandBurst'
  const emerge = runs.filter(x => !x.hidden).map(x => x.samples[0]);
  expect(emerge.length, '浮上が観測できていない').toBeGreaterThanOrEqual(2);
  for (const s of emerge) {
    expect(SAND.every(f => s.newTones.includes(f)),
      `浮上した t${s.t} に砂の SE が鳴っていない（鳴った音＝${JSON.stringify(s.newTones)}）`).toBe(true);
  }
  // (3) 潜った tick には鳴らない＝「出た」だけを耳で伝える
  const dive = runs.filter(x => x.hidden).map(x => x.samples[0]).filter(s => s.t > 1);
  expect(dive.length, '潜り直しが観測できていない').toBeGreaterThanOrEqual(1);
  for (const s of dive) {
    expect(SAND.some(f => s.newTones.includes(f)),
      `潜った t${s.t} に砂の SE が鳴っている＝「出た」と区別が付かない`).toBe(false);
  }
  // (4) 近接の溜め（maulWindup）と音域が別＝浮上の直後に続けて鳴っても聞き分けられる
  expect(Math.max(...SAND), '砂の SE に高音が無い＝maulWindup（130→82Hz）と同じ音域')
    .toBeGreaterThan(1000);
  // データ側の裏取り＝N は剣を持たない敵の予告（maulWindup）を使う
  expect(m.wieldsSword, 'N が剣持ち扱いになった＝予告が swordWindup に変わり音が重なる').toBeFalsy();
});

// ── ⑲ 実機・HP 50% で潜行が短くなる（層1 の `phases[].hide` が出荷データで効く）────────
test('⑲ HP 半分で潜行が短くなり、待ち伏せの回数が増える', async ({ page }) => {
  const m = ENEMY_META['N'];
  const ph = m.phases.find(p => p.hide !== undefined);
  // ⚠️ `dealDamage` は防御を通る（combat.js＝`max(1, dmg - e.def)`）∴def を足して渡す。
  //    落とす tick は「浮上を待つ」＝潜行中は無効（trackScorpion の注記）。
  const r = await trackScorpion(page, { ticks: 200, dropAt: 50, dmg: Math.ceil(m.hp / 2) + m.def });
  expect(r.error).toBeUndefined();
  const DROP = r.dropTick;
  expect(DROP, '観測窓のあいだに1度も浮上しなかった＝ダメージを通せていない').toBeTruthy();
  expect(r.end.hp / r.end.maxHp, '与えたダメージで HP が半分を割っていない＝相の前提が崩れた')
    .toBeLessThanOrEqual(0.5);
  expect(r.end.phasesTriggered, '相が発火していない').toContain(ph.hpThreshold);

  const before = r.samples.filter(s => s.t < DROP);
  expect(before.every(s => s.hide === null), '相の前からエンティティ側に潜行の周期が書かれている').toBe(true);
  expect(r.end.hide, '相が潜行の周期を書いていない＝後半も同じ周期のまま').toEqual(ph.hide);
  expect(r.end.speed, '後半の速度倍率が効いていない').toBeCloseTo(m.speed * ph.speedMultiplier, 6);
  expect(r.end.atkCdMul, '後半の攻撃間隔の倍率が効いていない').toBe(ph.attackCooldownMultiplier);

  // ★ 実測＝**潜行の窓が実際に縮む**。時間切れで浮上した潜行（＝窓の長さがそのまま出る
  //   相）だけを比べる＝到着で早く出た潜行は窓の長さを表さない。
  const capBefore = nHiddenTicks(m.hide), capAfter = nHiddenTicks(ph.hide);
  expect(capAfter, 'データ上の窓が縮んでいない＝この本が何も測れない').toBeLessThan(capBefore);
  const runs = hideRuns(r.samples).filter(x => x.hidden && x.complete);
  const timedOut = (run, cap) => run.samples.length === cap;
  const afterRuns = runs.filter(x => x.samples[0].t > DROP + 2);
  expect(afterRuns.length, '相の後に潜行が観測できていない（観測窓が短い）').toBeGreaterThanOrEqual(1);
  for (const run of afterRuns) {
    expect(run.samples.length, `相の後の潜行が ${run.samples.length} tick＝縮んだ窓（${capAfter} tick）を超えている`)
      .toBeLessThanOrEqual(capAfter);
  }
  // 前半には縮んだ窓を超える潜行が居る＝上の上限が「相のせい」であることの対照
  const beforeRuns = runs.filter(x => x.samples[x.samples.length - 1].t < DROP);
  expect(beforeRuns.some(x => x.samples.length > capAfter),
    '前半の潜行も縮んだ窓に収まっている＝相の効果が測れていない').toBe(true);
  // 窓を使い切る潜行が前半に居る（＝上限の比較が「到着の早さ」の話になっていない）
  expect(beforeRuns.some(x => timedOut(x, capBefore)) || beforeRuns.some(x => x.samples.length > capAfter),
    '前半に窓いっぱいの潜行が1度も無い').toBe(true);
});

// ── ⑳ 導出＝N の機構は G・W・A のどれとも重ならない（手書きの表で数えない）─────────
test('⑳ N の移動機構は G・W・A のどれとも重ならない', () => {
  const n = mechanismsOf(ENEMY_META['N']);
  const others = ['G', 'W', 'A'].map(k => mechanismsOf(ENEMY_META[k]));
  expect(n.has('burrowAmbush'), 'N が移動機構（burrowAmbush）を持っていない').toBe(true);
  expect([...n].filter(k => others.every(o => !o.has(k))).length,
    'N に G・W・A が持たない機構が1つも無い＝4体目の型になっていない').toBeGreaterThan(0);
  expect(others.some(o => o.has('burrowAmbush')),
    'G・W・A のどれかが潜行待ち伏せを持っている＝N の固有機構ではない').toBe(false);
  // 潜行待ち伏せを使うのは N だけ（潜み鮫・地中蟲は `hide` 単体＝隠れても寄って来るだけ）
  const users = Object.entries(ENEMY_META).filter(([, m]) => m.burrowAmbush).map(([k]) => k);
  expect(users, '潜行待ち伏せを持つ敵が N 以外にも居る（設計が重複した）').toEqual(['N']);
  // `hide` を持つ他の敵に待ち伏せが漏れていない＝既存の敵の動きを変えていないことの番人
  const hiders = Object.entries(ENEMY_META).filter(([, m]) => m.hide).map(([k]) => k);
  expect(hiders.length, 'hide を持つ敵が N だけ＝既存の潜み敵が消えた').toBeGreaterThan(1);
});

// ── ㉑ 検証ステージの幾何（GUIDE §4-3）────────────────────────────────
test('㉑ bal_sand_scorpion は 10×12・外周は通路以外すべて壁・N が (4,7) に1体だけ・水なし', () => {
  const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
  const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  const sd = MAP.layers[TEST_LAYER].stages[stageKey('bal_sand_scorpion')];
  expect(sd.rows).toBe(10);
  expect(sd.cols).toBe(12);
  expect(Object.keys(sd.bgTiles ?? {}), '水や別地形が入った＝間合いの測定が地形のせいになる').toEqual([]);

  const at = (r, c) => sd.tiles[r][c];
  const scorpions = [];
  for (let r = 0; r < sd.rows; r++) {
    for (let c = 0; c < sd.cols; c++) {
      const ch = at(r, c);
      if (ch === TILE.SAND_SCORPION) { scorpions.push([r, c]); continue; }
      if (r === N_PL_ROW - 1 && c === 1) continue;   // 看板 i（プレイヤーの湧きの北）
      const edge = r === 0 || c === 0 || r === sd.rows - 1 || c === sd.cols - 1;
      const want = edge && !isArenaDoor(r, c, sd.cols) ? TILE.WALL : TILE.FLOOR;
      expect(at(r, c), `(${r},${c}) が想定と違う`).toBe(want);
    }
  }
  expect(scorpions, 'N が1体だけ (4,7) に居る前提が崩れた').toEqual([[N_ROW, N_COL]]);
  // ⑯ の湧き (5,4) の**西側**（回り込みの行き先）が床＝符号の反転が地形で潰れない
  for (let c = 1; c <= 3; c++) {
    expect(at(N_FLANK_SPAWN.row, c), `(${N_FLANK_SPAWN.row},${c}) が床でない＝向こう側に出られない`)
      .toBe(TILE.FLOOR);
  }
});

// ════════ 4体目＝J 深海の海蛇（2×2・D3 水の迷宮のボス）＝巻きつき（coil）════════════
// G・W・A・N のどれとも違う点＝**そもそも寄って来ない**。J は「見つけた地点」を輪の中心に
// 決め、そこへ近づくのではなく**接線方向に周回**し、半径を**毎 tick 少しずつ**縮めて最後に
// 輪の内側を潰す（締め上げ）。∴プレイヤーが読むのは「間合い（何セル離れているか）」ではなく
// **「自分が輪の内側に居るか外側に居るか」**＝閉じる前に外へ出るのが答え。
//   ・移動＝`coil`（`enemy-ai.js enemyCoil`）。中心 `_coilCx/_coilCy` はタイル中心へ丸める。
//   ・縮み＝`tickCoilShrink`（**硬直より前で毎 tick 呼ぶ時計**＝`shrinkPerSec` セル/秒）。
//     ⚠️ 2026-08-29 のユーザー判定で「段（半周ごとに 1.0 セル）」から作り直した：
//        「輪は段階的に小さくするんじゃなくて、ゆっくりでも常に小さくなっていく感じにしないと
//         …小さくなりきったときに攻撃がくるってことがわかりにくい」。
//        ∴主張は2つ増えた＝**①どの tick も止まらずに縮む**（攻撃硬直中も・㉔①）
//        **②縮むほど輪が赤くなり、予告の前に赤い点滅の段がある**（㉔③）。
//   ・締め上げ＝`startCoilCrush` → `tickCoilCrush`（予告 `crushWindupMs` → 解決）。
//     予告のあいだ J は動かない＝プレイヤーが動く番。解決後は `crushFreezeMs` の硬直。
//   ・後半（HP 50% 以下）＝`phases[].coil` で **速く締めて（0.3→0.5 セル/秒）広く潰す**
//     （締め上げに入る半径 1.6→2.0）。巻き始めの半径は前半と同じ 2.6＝相の境で輪が跳ばない。
//
// ⚠️ 測る湧きは **(4,4)＝部屋の中央寄り**（看板の南 (7,1) ではない）。理由＝実測
//    （2026-08-29）：(7,1) を中心にすると輪が角の壁に噛んで `coilSpin` の反転が続き、
//    `stallLimit` に達して巻き直す＝**半径が一度も縮まない**（40 tick で `coilR` 2.6 のまま）
//    ＝機構が測れない。㉙ で「(4,4) の周り radius+1 が全部床」を地形として裏取りする。
// ⚠️ ダメージを測る回（㉕㉖）は `page.keyboard.press('g')` で debug を切る
//    （プレビューは `debugMode: true`＝`takeDamage()` が早期 return する）。
const J_ROW = 4, J_COL = 7;          // 2×2 ∴ rows 4-5 / cols 7-8 を占める
const J_PL_ROW = 4, J_PL_COL = 4;    // 輪が壁に噛まない中央寄り（上の⚠️）
// D3 のボス直前の想定装備（audit-balance の「D3 水の迷宮 / ボス直前 DEF 1・最大HP 14」＝
// ハート7・木の剣ティア0・盾なし・防具なし）＋`toolsUsableIn(map).dungeon_3`＝弓とブーメラン持ち
// （弱点 arrow ×2 の答えを持っている状態）。
const D3_PRE = {
  ps_hearts: '7', ps_sword: '0', ps_shield: '0', ps_armor: '0',
  ps_weapon: '1', ps_bow: '1', ps_boomerang: '1',
};
// 連続座標 → タイル（`enemy-ai.js` の toTileRow/toTileCol と同じ丸め）
const toTile = (v) => Math.floor(v + 0.5);

/**
 * `bal_sea_serpent` の J を n tick 追う。毎 tick の輪（中心・半径・回った角度）と
 * 締め上げ（予告・解決・潰したセル）とプレイヤーの被弾を返す。
 * @param {object} o
 * @param {number} o.ticks      進める論理 tick 数
 * @param {object} [o.spawn]    プレイヤーの湧き（既定＝(4,4)）
 * @param {number} [o.dropAt]   この tick の step より前に J へ与えるダメージの tick
 * @param {number} [o.dmg]      そのダメージ量（`dealDamage` は def を引く∴+def して渡す）
 * @param {boolean} [o.debugOff] true＝'g' で debug を切る（ダメージが通る）
 * @param {object} [o.moveAt]   { dir, steps }＝**締め上げの予告中に**その向きへ steps 回歩く
 *                              （`movePlayer` 1回＝MOVE_STEP 0.5＝キー押しっぱなしより正確）
 * @param {object} [o.patch]    ENEMY_META['J'] へ一時的に差し込むフィールド（下の CRUSH_ONLY）
 */
async function trackSerpent(page, o) {
  await installToneRec(page);
  const sp = o.spawn ?? { row: J_PL_ROW, col: J_PL_COL };
  await gotoFrozen(page, previewUrl('bal_sea_serpent', sp.row, sp.col, D3_PRE));
  if (o.debugOff) await page.keyboard.press('g');
  return page.evaluate((a) => {
    const g = window.__game;
    if (a.patch) g.setEnemyMetaForTest('J', a.patch);
    const j0 = g.getEnemies().find(e => e.type === 'J');
    if (!j0) return { error: 'J が盤面に居ない' };
    const id = j0.id;
    const find = () => g.getEnemies().find(e => e.id === id);

    const samples = [];
    let stepsLeft = a.moveAt?.steps ?? 0;
    let movedAt = [];
    for (let t = 1; t <= a.ticks; t++) {
      if (a.dropAt === t) g.dealDamage(id, a.dmg);
      // 予告が出ている tick だけ歩く＝「輪が閉じる前に動く」というプレイヤー側の操作
      if (stepsLeft > 0 && find()?.crushAt != null) {
        g.movePlayer(a.moveAt.dir); stepsLeft--; movedAt.push(t);
      }
      const tone0 = window.__tones.length;
      g.step(1);
      const e = find();
      if (!e) break;
      const p = g.getPlayer(), st = g.getState();
      const cx = e.x + ((e.w ?? 1) - 1) / 2, cy = e.y + ((e.h ?? 1) - 1) / 2;
      // 潰した水の見た目＝1セル1枚の DOM（left/top はセル座標×cellPx）
      const cells = [...document.querySelectorAll('.enemy-coil-crush')].map((el) => {
        const px = el.offsetWidth || 1;
        return [parseFloat(el.style.top) / px, parseFloat(el.style.left) / px];
      });
      samples.push({
        t, now: st.gameTime, hp: e.hp, x: e.x, y: e.y, dir: e.dir, speed: e.speed ?? null,
        coil: e.coil ?? null,
        coilCx: e.coilCx, coilCy: e.coilCy, coilR: e.coilR, coilHeat: e.coilHeat,
        coilArc: e.coilArc, coilSpin: e.coilSpin, coilStall: e.coilStall,
        crushAt: e.crushAt, crushWindupMs: e.crushWindupMs, crushR: e.crushR,
        freezeUntil: e.freezeUntil ?? null, swingAt: e.swingAt ?? null,
        px: p.x, py: p.y, php: p.hp, pdef: st.player.def, inv: st.player.invincibleUntil,
        // 輪の中心からの距離／方角（＝周回しているかを1つの数で読む）
        dCenter: e.coilCx == null ? null : Math.hypot(cx - e.coilCx, cy - e.coilCy),
        bearing: e.coilCx == null ? null
          : Math.atan2(cy - e.coilCy, cx - e.coilCx) * 180 / Math.PI,
        // プレイヤーから見た「輪の中心までの距離」と「J の体の端までの距離」
        pdCenter: e.coilCx == null ? null : Math.hypot(p.x - e.coilCx, p.y - e.coilCy),
        pdEdge: Math.hypot(Math.max(0, Math.abs(p.x - cx) - 0.5),
                           Math.max(0, Math.abs(p.y - cy) - 0.5)),
        ring: !!document.getElementById(`coil-ring-${id}`),
        ringClosing: !!document.querySelector('.coil-ring-closing'),
        // 予告の前段（＝「もう来る」）を絵で読む：赤い点滅の class と実際の枠線の色。
        // 色は CSS が `--coil-heat` から計算する∴**計算後の値**を採る（変数だけ見ても
        // 見た目が赤いことにはならない＝2026-08-29 のユーザー判定に応える主張）。
        ringHot: !!document.getElementById(`coil-ring-${id}`)?.classList.contains('coil-ring-hot'),
        ringBorder: (() => {
          const el = document.getElementById(`coil-ring-${id}`);
          if (!el) return null;
          const m = getComputedStyle(el).borderTopColor.match(/[\d.]+/g);
          return m ? m.slice(0, 3).map(Number) : null;
        })(),
        cells,
        newTones: window.__tones.slice(tone0),
      });
    }
    const e = find();
    return { id, samples, movedAt, end: e && { hp: e.hp, maxHp: e.maxHp, speed: e.speed, coil: e.coil ?? null } };
  }, o);
}

// 締め上げの当たりだけを測るための一時パッチ＝J に**攻撃を撃たせない**（cooldown を伸ばす）。
// ⚠️ これが必要な理由（2026-08-29 実測）＝輪が縮み切る手前は**噛みつきの間合いの中**
//    （半径 1.7 ＝体の端が中心から 0.7・噛みつき range 1.6）＝設計どおり殴り合いになる∴
//    締め上げの 1〜2 tick 前に噛まれると INVINCIBLE_MS 1500ms の無敵窓が締め上げを飲み込み、
//    「HP が減ったか」では**当たり判定の正しさを測れない**（縮みを連続化して周期が
//    5秒→4.5秒に縮んだぶん、噛みつきと締め上げの間隔が無敵窓より短くなった）。
//    ∴ここでは攻撃を止めて「HP が動いた＝締め上げが当たった」だけが成立する状態を作る。
const CRUSH_ONLY = {
  attacks: [{ type: 'sword', range: 1.6, cooldown: 999000 }],
  attack: { type: 'sword', range: 1.6, cooldown: 999000 },
};

/** 方角の総回転量（度・折り返しを畳んで足す）＝「1周まわった」を1つの数で読む */
function sweepDeg(samples) {
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    let d = samples[i].bearing - samples[i - 1].bearing;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    total += d;
  }
  return Math.abs(total);
}

// ── ㉒ データ＝J の層2（寄らずに輪を縮める・締め上げには必ず逃げ道がある）─────────
test('㉒ J 深海の海蛇のデータ＝巻きつきの輪が縮み、締め上げには輪の外へ出る余裕がある', () => {
  const m = ENEMY_META['J'];
  const c = m.coil;
  const sword = m.attacks.find(a => a.type === 'sword');

  expect(c, 'coil が無い＝J に固有の移動機構が無い').toBeTruthy();
  // 綴りの番人（`resolveCoil` が読むキー＝1文字違うと既定値に落ちて黙って動く）
  expect(Object.keys(c).sort()).toEqual([
    'crushAtk', 'crushFreezeMs', 'crushMs', 'crushPad', 'crushWindupMs',
    'escapeMargin', 'radius', 'radiusMin', 'shrinkPerSec', 'stallLimit', 'tightenCues',
  ]);
  expect(c.radius, '巻き始めの半径が最小半径より大きくない＝一度も縮まない')
    .toBeGreaterThan(c.radiusMin);
  for (const k of ['shrinkPerSec', 'crushWindupMs', 'crushMs', 'crushFreezeMs']) {
    expect(c[k], `${k} が正の数でない`).toBeGreaterThan(0);
  }

  // 他の3体の移動機構を**持っていない**＝型を借りていない
  expect(m.hitAndAway, '間合いの往復（W の型）が生きている＝coil に来ない').toBe(false);
  for (const k of ['combat', 'laneStalk', 'burrowAmbush', 'hide', 'dash']) {
    expect(m[k], `${k} を持っている＝W/A/N/G の型を借りている`).toBeUndefined();
  }
  for (const p of m.phases ?? []) {
    expect(p.dash, '後半に突進が生えている＝A の後半（車線を走る）と同じ型').toBeUndefined();
  }

  // ── 締め上げの「逃げ道」と「読みやすさ」を**前半・後半の両方**で数として確かめる ────
  const ph = (m.phases ?? []).find(p => p.coil);
  expect(ph, '後半に coil の差し替えが無い＝相が変わっても輪が同じ').toBeTruthy();
  for (const [label, cfg] of [['前半', c], ['後半', ph.coil]]) {
    // ① 巻き直しの閾（radius+escapeMargin）は潰す範囲（半径+crushPad）より外側
    //    ＝「潰されない位置まで出た」なら必ず「巻き直しの外」にも出ている
    expect(cfg.escapeMargin, `${label}の逃げ幅が潰す余白以下＝輪の外に出ても潰される（答えが無い）`)
      .toBeGreaterThan(cfg.crushPad);
    // ② 予告のあいだに走れる距離 > 中心から潰す範囲の外まで＝間に合う
    const windupTicks = Math.floor(cfg.crushWindupMs / TICK_MS);
    const needSteps = Math.ceil((cfg.radiusMin + cfg.crushPad) / MOVE_STEP);
    expect(needSteps, `${label}は予告の tick 数では潰す範囲の外へ出られない＝理不尽`)
      .toBeLessThanOrEqual(windupTicks);
    // ③ 縮みは**連続に見える**＝締め切るまでに 8 tick 以上かける（2026-08-29 ユーザー判定＝
    //    「ゆっくりでも常に小さくなっていく」）。数 tick で終わるなら段と区別が付かない。
    const shrinkTicks = (cfg.radius - cfg.radiusMin) / (cfg.shrinkPerSec * TICK_MS / 1000);
    expect(shrinkTicks, `${label}の縮みが数 tick で終わる＝段と区別できない（連続に見えない）`)
      .toBeGreaterThanOrEqual(8);
    // ④ 縮み切る前に「もう来る」の合図が鳴る＝合図の閾は 0〜1 の**内側**で昇順
    expect(cfg.tightenCues.length, `${label}に締まりの合図が無い＝音の予兆が出ない`).toBeGreaterThan(0);
    expect(cfg.tightenCues, `${label}の tightenCues が昇順でない＝鳴る順が設計と違う`)
      .toEqual([...cfg.tightenCues].sort((a, b) => a - b));
    for (const q of cfg.tightenCues) {
      expect(q, `${label}の合図の閾が 0 以下＝巻いた瞬間に鳴る`).toBeGreaterThan(0);
      expect(q, `${label}の合図の閾が 1 以上＝締め上げと同時＝予兆にならない`).toBeLessThan(1);
    }
    // ⑤ 縮み切った輪では剣が届く＝反撃の窓がどちらの相にもある（2×2 ∴端は中心から 1 セル内側）
    expect(cfg.radiusMin - 1, `${label}の縮み切った輪でも剣が届かない＝反撃の窓が無い`)
      .toBeLessThanOrEqual(SWORD_REACH);
  }
  // ⑥ 速さはプレイヤー（1.0）未満＝走って逃げる側が必ず速い（GUIDE §7-2）
  expect(m.speed, 'J がプレイヤーより速い＝輪から出られない').toBeLessThan(1.0);

  // ── 半径と武器の噛み合い（2×2 ∴体の端は中心から 1 セル内側）──────────────
  expect(c.radius - 1, '巻き始めの輪でも剣が届く＝縮む意味が無い').toBeGreaterThan(SWORD_REACH);
  expect(sword.range, '噛みつきが縮み切った輪の内側に届かない＝密着が安全になる')
    .toBeGreaterThan(c.radiusMin - 1);
  // 締め上げは新しい最大打点を作らない（噛みつきと同じ）
  expect(c.crushAtk, '締め上げが噛みつきより痛い＝新しい最大打点を作っている').toBe(m.atk);
  // 弱点＝矢×2（弓は立ち止まって撃つ＝輪の中に留まる＝この機構と噛み合う）
  expect(m.weakness).toEqual({ type: 'arrow', multiplier: 2 });

  // ── 後半＝速く締めて広く潰す（巻き始めの半径は同じ＝相の境で輪の絵が跳ばない）──────
  const closeSec = (cfg) => (cfg.radius - cfg.radiusMin) / cfg.shrinkPerSec;
  // 前半は「縮んでいる」と初見で気づける長さを持つ（＝ユーザー判定の要求そのもの）
  expect(closeSec(c), '前半の縮みが速すぎる＝初見で気づく前に締め上げが来る')
    .toBeGreaterThanOrEqual(2.0);
  expect(ph.coil.radius, '後半の巻き始めが前半と違う＝相が切り替わった瞬間に輪の絵が跳ぶ')
    .toBe(c.radius);
  expect(ph.coil.shrinkPerSec, '後半の縮みが前半以下＝締め上げが速くなっていない')
    .toBeGreaterThan(c.shrinkPerSec);
  expect(closeSec(ph.coil), '後半も締め上げまでの時間が前半並み＝周期が短くなっていない')
    .toBeLessThan(closeSec(c));
  // 潰す範囲は後半のほうが広い＝踏み込んで殴った位置が危なくなる
  expect(ph.coil.radiusMin + ph.coil.crushPad, '後半の潰す範囲が前半以下＝踏み込みの危険が増えない')
    .toBeGreaterThan(c.radiusMin + c.crushPad);
  // 合図の意味（赤くなったら来る）は相で変えない＝前半で覚えた読みが後半でも通る
  expect(ph.coil.tightenCues, '後半で合図の閾が変わる＝色と音の学習が壊れる').toEqual(c.tightenCues);
});

// ── ㉓ 移動＝寄って来ない（プレイヤーのタイルを中心に周回する）─────────────────
test('㉓ J はプレイヤーへ寄らず、見つけた地点を中心にぐるりと回る', async ({ page }) => {
  const c = ENEMY_META['J'].coil;
  const out = await trackSerpent(page, { ticks: 70 });
  expect(out.error).toBeUndefined();
  // 輪が立っている窓＝「周回しているだけ」の窓（予告・締め上げ後の硬直は除く）。
  // ⚠️ 周回は**1周期をまたいで測る**＝縮みが 3.33 秒になった（2026-08-29 の連続化）ぶん
  //    1周期で回れるのは半周弱∴1周期だけ見ると「回っている」を数にできない。
  //    プレイヤーは動かない∴巻き直しても中心は同じ＝方角の連続性は保たれる。
  const pre = out.samples.filter(s => s.crushAt == null && s.coilCx != null);
  expect(pre.length, '輪が立っている窓が短すぎて周回を測れない').toBeGreaterThan(30);

  // ① 輪の中心＝プレイヤーの居るタイル（＝敵の位置ではない）。動かない限り変わらない
  for (const s of pre) {
    expect([s.coilCy, s.coilCx], `t${s.t} の輪の中心がプレイヤーのタイルでない`)
      .toEqual([J_PL_ROW, J_PL_COL]);
    expect(s.ring, `t${s.t} に輪の絵が無い＝機構がプレイヤーに伝わらない`).toBe(true);
  }

  // ② ぐるりと回った（＝往復や直進ではない）
  expect(sweepDeg(pre), '観測窓で 200°も回っていない＝周回になっていない')
    .toBeGreaterThan(200);
  const quadrants = new Set(pre.map(s => Math.floor(((s.bearing + 360) % 360) / 90)));
  expect(quadrants.size, '中心の同じ側にしか居ない＝囲んでいない').toBeGreaterThanOrEqual(3);

  // ③ 輪の上に乗り続ける＝距離が単調に減らない（G のまっすぐ来る型との違い）
  //    ⚠️ 湧きは輪の外（実測 d 3.54）∴最初の数 tick は「輪へ寄る」区間＝除く。
  //    許容 1.25 の根拠＝体は 0.5 刻みの軸移動で弧を近似する（弦を切る）＝実測の最大 1.1。
  const onRing = pre.filter(s => s.t >= 12);
  for (const s of onRing) {
    expect(Math.abs(s.dCenter - s.coilR), `t${s.t} が輪から離れすぎ（d ${s.dCenter} / R ${s.coilR}）`)
      .toBeLessThanOrEqual(1.25);
  }
  // ④ 中心（＝立っているプレイヤー）に重なりに来ない＝「寄って来ない」の実体
  expect(Math.min(...onRing.map(s => s.dCenter)),
    '中心に密着した＝寄って来ている（coil ではなく追跡になっている）')
    .toBeGreaterThanOrEqual(1.0);
  expect(Math.max(...pre.map(s => s.coilStall)),
    '回れずに停滞した回数が保険の閾に達した＝この湧きでは機構が測れていない')
    .toBeLessThan(c.stallLimit);
});

// ── ㉔ 輪が**止まらずに**縮む → 赤くなる → 予告 → 締め上げ → 硬直 → 巻き直す（1周期）──
// ★2026-08-29 のユーザー判定に応える本＝「段階的に縮む」を捨てた根拠と、
//   「小さくなりきったときに攻撃が来る」が**絵と音で読める**ことをここで固定する。
test('㉔ 輪は毎 tick 縮んで赤くなり、縮み切った所で予告つきの締め上げになる', async ({ page }) => {
  const c = ENEMY_META['J'].coil;
  const out = await trackSerpent(page, { ticks: 78 });
  const s = out.samples;
  const firstWindup = s.find(x => x.crushAt != null);
  expect(firstWindup, '78 tick 追っても締め上げの予告が来ない').toBeTruthy();

  // ── ① 縮みは連続＝**どの tick も止まらない**（段だと縮んだ瞬間しか情報が出ない）────
  const pre = s.slice(0, firstWindup.t);            // 巻き始め〜予告が立った tick
  const perTick = c.shrinkPerSec * TICK_MS / 1000;
  expect(pre.length, '縮みが数 tick で終わった＝連続に見えない').toBeGreaterThanOrEqual(8);
  const radii = pre.map(x => x.coilR);
  expect(new Set(radii).size, '同じ半径が続いた＝輪が止まって見える tick がある')
    .toBe(radii.length);
  for (let i = 1; i < pre.length; i++) {
    const drop = radii[i - 1] - radii[i];
    expect(drop, `t${pre[i].t} で輪が縮んでいない（止まった／広がった）`).toBeGreaterThan(0);
    // 最後の tick だけ `radiusMin` で丸める∴刻みが小さくなりうる。それ以外は一定の刻み。
    if (pre[i].coilR > c.radiusMin) {
      expect(drop, `t${pre[i].t} の縮み量が shrinkPerSec と違う＝段が残っている`)
        .toBeCloseTo(perTick, 6);
    }
  }
  // ★時計で縮む（泳いだ弧ではない）＝**攻撃硬直で1歩も動かない tick でも縮む**。
  //   弧に比例させた最初の実装はここが止まり、輪が1秒近く固まって見えた（実測 2026-08-29）。
  const held = [];
  for (let i = 1; i < pre.length; i++) {
    if (pre[i].x === pre[i - 1].x && pre[i].y === pre[i - 1].y) held.push(pre[i]);
  }
  expect(held.length, '1歩も動かない tick が観測窓に無い＝硬直中の縮みを測れていない')
    .toBeGreaterThan(0);
  for (const h of held) {
    expect(h.coilR, `動かなかった t${h.t} で輪が縮んでいない＝泳ぎに縛られている`)
      .toBeLessThan(s[h.t - 2].coilR);
  }
  // 縮み具合（`_coilHeat`）は 0 から 1 へ単調＝色・音・テストが読む唯一の数
  expect(pre[0].coilHeat, '巻き始めの締まり具合が 0 でない').toBeCloseTo(0, 6);
  expect(firstWindup.coilHeat, '縮み切った tick の締まり具合が 1 でない').toBe(1);
  for (let i = 1; i < pre.length; i++) {
    expect(pre[i].coilHeat, `t${pre[i].t} で締まり具合が戻った`).toBeGreaterThan(pre[i - 1].coilHeat);
  }

  // ── ② 締め上げは「縮み切ったから」来る（回った角度ではない）──────────────
  expect(firstWindup.coilR, '締め上げに入った半径が radiusMin でない').toBe(c.radiusMin);
  expect(s[firstWindup.t - 2].coilR, '縮み切る前に締め上げが来た')
    .toBeGreaterThan(c.radiusMin);

  // ── ③ 予告の**前に**「もう来る」が絵と音で出る（初見でも身構えられる）──────────
  // 輪は縮むほど赤くなる＝枠線の赤が単調に増え、青が減る（CSS が `--coil-heat` から計算）
  const ramp = pre.filter(x => x.ringBorder && !x.ringClosing);
  expect(ramp.length, '縮んでいるあいだの輪の色を採れていない').toBeGreaterThan(8);
  for (let i = 1; i < ramp.length; i++) {
    expect(ramp[i].ringBorder[0], `t${ramp[i].t} で輪の赤が減った＝赤くなっていく告知が壊れた`)
      .toBeGreaterThanOrEqual(ramp[i - 1].ringBorder[0]);
  }
  const first = ramp[0].ringBorder, last = ramp[ramp.length - 1].ringBorder;
  expect(last[0] - first[0], '縮み切る手前でも赤くなっていない＝攻撃が来る感じが出ない')
    .toBeGreaterThan(100);
  expect(last[2], '縮み切る手前でも青いまま＝巻き始めと色で区別できない').toBeLessThan(first[2]);
  // 赤い点滅（`coil-ring-hot`）は**予告より前**に始まる（予告 720ms だけでは足りない）
  const hotIdx = pre.findIndex(x => x.ringHot);
  expect(hotIdx, '赤い点滅の段が無い＝「もう来る」が予告まで告知されない').toBeGreaterThan(0);
  expect(pre[hotIdx].t, '赤い点滅が予告と同時に始まった＝前段になっていない')
    .toBeLessThan(firstWindup.t);
  expect(pre[hotIdx].coilHeat, '点滅が始まる締まり具合が 1 ＝縮み切ってから点滅している')
    .toBeLessThan(1);
  for (const x of pre.slice(0, hotIdx)) {
    expect(x.ringHot, `t${x.t} で既に点滅している＝巻き始めから警告が出っぱなし`).toBe(false);
  }
  // 点滅が始まる tick で輪は**もう赤**（＝色相は heat ではなく閾値で正規化した `--coil-warn`
  // から作る）。ここを heat 直結に戻すと点滅開始時点がまだマゼンタで（実測 rgb(255,82,249)）
  // 赤に届くのが締め上げと同時＝「赤くなったら来る」が間に合わない（2026-08-29 実測）。
  const hotRgb = pre[hotIdx].ringBorder;
  expect(hotRgb, '点滅が始まった tick の輪の色を採れていない').toBeTruthy();
  expect(hotRgb[0], '点滅開始時点で赤が振り切っていない').toBeGreaterThan(250);
  expect(Math.abs(hotRgb[1] - hotRgb[2]), '点滅開始時点がまだ紫／マゼンタ寄り＝赤に見えない')
    .toBeLessThan(24);
  // 締まりの合図（coilTighten）は閾を越えた tick に鳴り、予告の音とは違う音
  for (const q of c.tightenCues) {
    const cue = pre.find(x => x.coilHeat >= q);
    expect(cue, `締まり具合 ${q} を越える tick が観測窓に無い`).toBeTruthy();
    expect(cue.newTones.length, `締まり具合 ${q} を越えた t${cue.t} に音が鳴っていない`)
      .toBeGreaterThan(0);
    expect(JSON.stringify(cue.newTones),
      `締まりの合図が予告と同じ音＝「まだ縮んでいる」と「来る」が区別できない`)
      .not.toBe(JSON.stringify(firstWindup.newTones));
  }

  // ── ④ 予告＝固定した半径・輪の絵が閉じる・専用の SE・J は動かない ──────────
  expect(firstWindup.crushAt - firstWindup.now, '予告の長さが crushWindupMs と違う')
    .toBe(c.crushWindupMs);
  expect(firstWindup.crushR, '締め上げの半径が縮み切った半径で固定されていない').toBe(c.radiusMin);
  expect(firstWindup.ringClosing, '輪の絵が「閉じる」表示になっていない＝予告が読めない').toBe(true);
  expect(firstWindup.newTones.length, '予告の SE が鳴っていない').toBeGreaterThan(0);

  const resolveIdx = s.findIndex(x => x.cells.length > 0);
  const resolve = s[resolveIdx];
  expect(resolve, '締め上げが解決していない').toBeTruthy();
  const windup = s.slice(firstWindup.t - 1, resolveIdx);
  expect(windup.length, '予告の tick 数が想定と違う').toBe(Math.round(c.crushWindupMs / TICK_MS));
  for (const w of windup) {
    expect([w.y, w.x], `予告中の t${w.t} に J が動いた＝溜めていない`)
      .toEqual([firstWindup.y, firstWindup.x]);
  }

  // ⑤ 解決＝内側を潰し、中心を捨て（両方 null）、硬直を立てる
  expect(resolve.cells.length, '潰したセルが1枚も無い').toBeGreaterThan(0);
  expect([resolve.coilCx, resolve.coilCy], '中心が片方だけ残った＝半端な輪が観測される')
    .toEqual([null, null]);
  expect(resolve.ring, '解決後も輪の絵が残っている').toBe(false);
  expect(resolve.freezeUntil, '締め上げ後の硬直（反撃の窓）が立っていない')
    .toBe(resolve.now + c.crushFreezeMs);
  expect(resolve.newTones.length, '締め上げの SE が鳴っていない').toBeGreaterThan(0);
  expect(JSON.stringify(resolve.newTones),
    '予告と締め上げが同じ音＝「来る」と「潰れた」が区別できない')
    .not.toBe(JSON.stringify(firstWindup.newTones));

  // ⑥ 硬直のあいだ動かず、明けたら新しい中心で半径が初期値に戻る（巻き直し）
  const frozenTicks = s.filter(x => x.t > resolve.t && x.now < resolve.freezeUntil);
  expect(frozenTicks.length, '硬直の窓が観測できていない').toBeGreaterThan(0);
  for (const f of frozenTicks) {
    expect([f.y, f.x], `硬直中の t${f.t} に J が動いた＝反撃の窓が無い`).toEqual([resolve.y, resolve.x]);
  }
  const reclaim = s.find(x => x.t > resolve.t && x.coilCx != null);
  expect(reclaim, '締め上げのあと巻き直さない＝1周期で終わってしまう').toBeTruthy();
  expect(reclaim.coilR, '巻き直しで半径が初期値に戻っていない').toBe(c.radius);
  expect([reclaim.coilCy, reclaim.coilCx], '巻き直しの中心がプレイヤーのタイルでない')
    .toEqual([toTile(reclaim.py), toTile(reclaim.px)]);
});

// ── ㉕ 輪の中に居たまま予告をやり過ごすと潰される（絵は当たり判定の上位集合）─────────
test('㉕ 輪の中に居ると締め上げが当たり、潰した絵はダメージ範囲を必ず覆う', async ({ page }) => {
  const c = ENEMY_META['J'].coil;
  // 予告中に3歩（1.5セル）だけ動く＝**輪の中に留まったまま**位置を変える
  // ＋ J の攻撃を止める（CRUSH_ONLY）＝HP が減ったら「潰された」以外にありえない
  const out = await trackSerpent(page, {
    ticks: 78, debugOff: true, moveAt: { dir: 'left', steps: 3 }, patch: CRUSH_ONLY,
  });
  const s = out.samples;
  const resolveIdx = s.findIndex(x => x.cells.length > 0);
  expect(resolveIdx, '締め上げが解決していない').toBeGreaterThan(0);
  const resolve = s[resolveIdx], before = s[resolveIdx - 1];

  // 前提①＝この tick の直前に無敵窓が無い（＝減らなかったら本当に当たっていない）。
  //   J の攻撃は止めてある（CRUSH_ONLY）∴ここが生きていたら測定そのものが崩れている。
  expect(before.inv, '解決の直前に無敵窓が生きている＝ダメージの有無が測れない')
    .toBeLessThanOrEqual(before.now);
  // 前提②＝プレイヤーは潰す範囲の内側に居る（＝潰される条件を作れている）
  expect(before.pdCenter, '輪の外に出てしまった（この回は潰される条件を作れていない）')
    .toBeLessThanOrEqual(before.crushR + c.crushPad);
  // 前提③＝この回に減る HP は締め上げの分だけ（噛みつきも水球も撃たれていない）
  expect(s.slice(0, resolveIdx).every(x => x.php === s[0].php),
    '解決の前に HP が減っている＝締め上げ以外のダメージが混ざっている').toBe(true);

  // 潰しのダメージ＝crushAtk − 防御（盾では防げない＝答えは「輪の外に出る」だけ）
  expect(resolve.php, '締め上げが当たっていない（HP が減っていない）')
    .toBe(before.php - (c.crushAtk - resolve.pdef));
  expect(resolve.inv, '被弾後の無敵窓が立っていない＝ダメージ経路が takeDamage を通っていない')
    .toBeGreaterThan(resolve.now);

  // 絵はダメージ範囲の**上位集合**＝「何も描かれていない床で殴られた」が起きない
  const r = before.crushR + c.crushPad;
  const painted = new Set(resolve.cells.map(([row, col]) => `${row},${col}`));
  const cx = before.coilCx, cy = before.coilCy;
  // 立ち位置は MOVE_STEP 刻み∴整数 k で回す（0.5 を足し込むと丸めが1セルずれる）
  const n = Math.ceil(r / MOVE_STEP);
  for (let ky = -n; ky <= n; ky++) {
    for (let kx = -n; kx <= n; kx++) {
      const ox = kx * MOVE_STEP, oy = ky * MOVE_STEP;
      if (Math.hypot(ox, oy) > r) continue;      // ダメージを受ける立ち位置だけ見る
      const key = `${toTile(cy + oy)},${toTile(cx + ox)}`;
      expect(painted.has(key),
        `中心から (${ox.toFixed(1)},${oy.toFixed(1)}) は潰されるのにセル ${key} が塗られていない`)
        .toBe(true);
    }
  }
});

// ── ㉖ 答え＝閉じる前に輪の外へ出る（潰されず、J は巻き直す）──────────────────
test('㉖ 予告のあいだに輪の外へ出ると潰されず、J は中心を捨てて巻き直す', async ({ page }) => {
  const c = ENEMY_META['J'].coil;
  // 5歩（2.5セル）＝中心から潰す範囲（1.6+0.4）の外。予告は6 tick ∴間に合う。
  // ⚠️ J の攻撃は止める（CRUSH_ONLY）＝止めないと「無傷だった」が**無敵窓のおかげ**でも
  //    成立してしまう（噛みつきの無敵が締め上げを飲む＝㉕ で実測した罠の裏返し）。
  const out = await trackSerpent(page, {
    ticks: 84, debugOff: true, moveAt: { dir: 'left', steps: 5 }, patch: CRUSH_ONLY,
  });
  const s = out.samples;
  const firstWindup = s.find(x => x.crushAt != null);
  const resolveIdx = s.findIndex(x => x.cells.length > 0);
  const resolve = s[resolveIdx], before = s[resolveIdx - 1];
  expect(resolve, '締め上げが解決していない').toBeTruthy();

  // 逃げ切りは「予告の窓の中」で完了している＝押しっぱなしでなく数歩で足りる
  expect(out.movedAt.length, '予告中に歩き切れていない（窓が足りない）').toBe(5);
  expect(out.movedAt[out.movedAt.length - 1] - firstWindup.t + 1,
    '逃げるのに予告の tick を超えて掛かった＝間に合わない設計')
    .toBeLessThanOrEqual(Math.round(c.crushWindupMs / TICK_MS));

  // 潰す範囲の外に居る → HP は減らない（が、締め上げ自体は起きている）
  expect(before.pdCenter, '輪の外に出られていない（この回は逃げ切れていない）')
    .toBeGreaterThan(before.crushR + c.crushPad);
  // 無敵窓は閉じている＝「減らなかった」は逃げ切りのおかげ（無敵に飲まれたのではない）
  expect(before.inv, '解決の直前に無敵窓が生きている＝逃げ切りの成否を測れない')
    .toBeLessThanOrEqual(before.now);
  expect(resolve.php, '輪の外へ出たのに潰された＝答えが機能していない').toBe(before.php);
  expect(resolve.cells.length, '締め上げ自体が起きていない＝逃げの成否を測っていない')
    .toBeGreaterThan(0);
  expect(resolve.newTones.length, '締め上げの SE が鳴っていない').toBeGreaterThan(0);

  // J は新しい立ち位置を中心に巻き直す＝逃げた分だけ猶予が戻る
  const reclaim = s.find(x => x.t > resolve.t && x.coilCx != null);
  expect(reclaim, '逃げたあと巻き直さない＝逃げ続ければ何も起きなくなる').toBeTruthy();
  expect([reclaim.coilCy, reclaim.coilCx], '巻き直しの中心が逃げた先のタイルでない')
    .toEqual([toTile(reclaim.py), toTile(reclaim.px)]);
  expect(reclaim.coilR, '巻き直しで半径が初期値に戻っていない').toBe(c.radius);
});

// ── ㉗ HP 半分で「速く締めて広く潰す」に変わる（層1 の `phases[].coil` が出荷データで効く）──
test('㉗ HP 半分で輪の縮みが速くなり、締め上げが広い半径で来る', async ({ page }) => {
  const m = ENEMY_META['J'];
  const ph = m.phases.find(p => p.coil);
  // dealDamage は防御を引く∴+def して渡す（HP をちょうど 50% に落とす）
  const out = await trackSerpent(page, { ticks: 70, dropAt: 10, dmg: Math.ceil(m.hp / 2) + m.def });
  const s = out.samples;
  const after = s.filter(x => x.t > 10);
  expect(s[9].hp / m.hp, 'HP が 50% 以下に落ちていない＝相の条件を満たしていない')
    .toBeLessThanOrEqual(0.5);

  // 相の差し替えが実体（`_coil`）に載っている＝`resolveCoil` が読む側が変わった
  expect(after[after.length - 1].coil, '後半の coil が実体に載っていない').toEqual(ph.coil);

  // ① 縮みの刻みが後半の値に変わる（前半 0.3→後半 0.5 セル/秒）＝縮みは連続のまま速くなる
  const perTick = ph.coil.shrinkPerSec * TICK_MS / 1000;
  const preTick = m.coil.shrinkPerSec * TICK_MS / 1000;
  expect(perTick, '後半の刻みが前半と同じ＝速くなっていない').toBeGreaterThan(preTick);
  const drops = [];
  for (let i = 1; i < after.length; i++) {
    const a = after[i - 1], b = after[i];
    // 同じ巻き（中心が生きていて広がっていない）かつ丸めの入る最終 tick を除く
    if (a.coilCx == null || b.coilCx == null) continue;
    if (b.coilR >= a.coilR || b.coilR <= ph.coil.radiusMin || b.crushAt != null) continue;
    drops.push(b.coilR - 0 - a.coilR);
  }
  expect(drops.length, '後半に縮んでいる tick が観測できていない').toBeGreaterThan(5);
  for (const d of drops) expect(-d, '後半の縮み量が後半の shrinkPerSec と違う').toBeCloseTo(perTick, 6);

  // ② 締め上げは後半の `radiusMin`（2.0）で来る＝前半（1.6）まで縮む前に閉じる
  const windup = after.find(x => x.crushAt != null);
  expect(windup, '後半に締め上げが来ない').toBeTruthy();
  expect(windup.crushR, '締め上げの半径が後半の radiusMin でない＝相の差し替えが効いていない')
    .toBe(ph.coil.radiusMin);
  expect(Math.min(...after.filter(x => x.coilR != null).map(x => x.coilR)),
    '前半の最小半径まで縮んだ＝後半の輪が前半と同じところまで詰めている')
    .toBeGreaterThanOrEqual(ph.coil.radiusMin);

  const resolve = after.find(x => x.cells.length > 0);
  expect(resolve, '後半の締め上げが解決していない').toBeTruthy();
  // 潰す範囲は前半（半径 1.6+0.4＝実測 21 枚）より広い＝踏み込んだ位置が危なくなる
  expect(resolve.cells.length, '後半の潰す範囲が前半（21 枚）より広くない').toBeGreaterThan(21);
});

// ── ㉘ 導出＝J の機構は G・W・A・N のどれとも重ならない（手書きの表で数えない）───────
test('㉘ J の移動機構は G・W・A・N のどれとも重ならない', () => {
  const j = mechanismsOf(ENEMY_META['J']);
  const others = ['G', 'W', 'A', 'N'].map(k => mechanismsOf(ENEMY_META[k]));
  expect(j.has('coil'), 'J が移動機構（coil）を持っていない').toBe(true);
  expect([...j].filter(k => others.every(o => !o.has(k))).length,
    'J に G・W・A・N が持たない機構が1つも無い＝5体目の型になっていない').toBeGreaterThan(0);
  expect(others.some(o => o.has('coil')),
    'G・W・A・N のどれかが巻きつきを持っている＝J の固有機構ではない').toBe(false);
  const users = Object.entries(ENEMY_META).filter(([, m]) => m.coil).map(([k]) => k);
  expect(users, '巻きつきを持つ敵が J 以外にも居る（設計が重複した）').toEqual(['J']);
});

// ── ㉙ 検証ステージの幾何（GUIDE §4-3）───────────────────────────────
test('㉙ bal_sea_serpent は 10×12・外周は通路以外すべて壁・J が (4,7) に1体だけ・水なし', () => {
  const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
  const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  const sd = MAP.layers[TEST_LAYER].stages[stageKey('bal_sea_serpent')];
  expect(sd.rows).toBe(10);
  expect(sd.cols).toBe(12);
  // ⚠️ J は水の迷宮のボスだが、ここは**水を置かない**＝周回が地形で止まると機構が測れない
  expect(Object.keys(sd.bgTiles ?? {}), '水や別地形が入った＝周回の測定が地形のせいになる').toEqual([]);

  const at = (r, c) => sd.tiles[r][c];
  const serpents = [];
  for (let r = 0; r < sd.rows; r++) {
    for (let c = 0; c < sd.cols; c++) {
      const ch = at(r, c);
      if (ch === TILE.SEA_SERPENT) { serpents.push([r, c]); continue; }
      if (r === 6 && c === 1) continue;              // 看板 i（南の通路の脇）
      const edge = r === 0 || c === 0 || r === sd.rows - 1 || c === sd.cols - 1;
      const want = edge && !isArenaDoor(r, c, sd.cols) ? TILE.WALL : TILE.FLOOR;
      expect(at(r, c), `(${r},${c}) が想定と違う`).toBe(want);
    }
  }
  expect(serpents, 'J が1体だけ (4,7) に居る前提が崩れた').toEqual([[J_ROW, J_COL]]);

  // 測る湧き (4,4) の周り（巻き始めの半径＋体半分）が全部床＝輪が壁に噛まない。
  // ⚠️ これが崩れると `coilSpin` の反転が続いて半径が一度も縮まない（看板の南 (7,1) で
  //    実測した壊れ方＝2026-08-29）。この地形の裏取りが㉓㉔の前提。
  // 半径＝巻き始めの半径＋体半分×2（2×2 の端まで）＝この円の中に壁が無いこと
  const rad = ENEMY_META['J'].coil.radius + 1;
  const span = Math.ceil(rad);
  for (let r = J_PL_ROW - span; r <= J_PL_ROW + span; r++) {
    for (let c = J_PL_COL - span; c <= J_PL_COL + span; c++) {
      if (Math.hypot(r - J_PL_ROW, c - J_PL_COL) > rad) continue;
      if (r < 0 || c < 0 || r >= sd.rows || c >= sd.cols) continue;
      if (at(r, c) === TILE.SEA_SERPENT) continue;
      if (r === 6 && c === 1) continue;              // 看板 i（輪の縁に掛かるが通れなくて良い）
      expect(at(r, c), `(${r},${c}) が床でない＝(4,4) を中心にした輪が壁に噛む`).toBe(TILE.FLOOR);
    }
  }
});

// ════════ 5体目＝O 古森の巨人（2×2・D6 森の聖域のボス）＝見据え（gaze）═══════════
// G・W・A・N・J のどれとも違う点＝**寄る先がプレイヤーではない**。O は「見据えた瞬間に
// プレイヤーが立っていたタイル」へ印（`_gazeCx/_gazeCy`）を1つ押し、以後は**その印**へ
// 歩き、印の上へ放物線で岩を落とす。印は押した後1ドットも動かない（追尾しない）。
// ∴プレイヤーが読むのは間合い（G/W）でも射線（A）でも浮上位置（N）でも輪の内外（J）でも
// なく **「自分がいま印の内側に居るか」**＝立ち止まると足元に印が立ち、動けば印は置き去りになる。
//   ・周期＝`tickGaze`（**行動ゲートの外**の時計）＝'mark'（stampMs）→'flight'（岩の飛翔）
//     →'rest'（restMs）→次の印。**1つの印 ⇔ 1つの岩**（`_gazeCount`）。
//   ・移動＝`enemyGazeStride`（印へ BFS で寄る＝N の待ち伏せと同じ経路探索を使う）。
//   ・岩＝`lob`（遮蔽も盾も効かない）＋`blast`（半径＝印の絵と同じ `_gazeR`・`breakPower: 0`）。
//   ・投げた直後は `throwFreezeMs` の硬直＝**殴り返す窓**（`.attack-recover` の絵が出る）。
//   ・後半（HP 50% 以下）＝`phases[].gaze` で **印を速く押し直し（1080→720ms）広く潰す**
//     （半径 1.2→1.6）。打点（stampAtk）は据え置き＝速さと広さだけで圧を上げる。
//
// ⚠️ 測る湧きは **(4,4)**＝巨人 (4,7) と同じ行の西側3セル（看板の南 (7,1) ではない）。
//    理由＝印は「プレイヤーの立っていたタイル」＝湧きが部屋の隅だと巨人が印へ寄る経路が
//    壁沿いに限られ、「印へ踏み込む」が測りにくい。㊲ で (4,4) 周りの床を地形として裏取りする。
// ⚠️ ダメージを測る回（㉜㉝）は `page.keyboard.press('g')` で debug を切る
//    （プレビューは `debugMode: true`＝`takeDamage()` が早期 return する）。
const O_ROW = 4, O_COL = 7;          // 2×2 ∴ rows 4-5 / cols 7-8 を占める
const O_PL_ROW = 4, O_PL_COL = 4;    // 測る湧き（上の⚠️）
// D6 のボス直前の想定装備（audit-balance の「D6 森の聖域 / ボス直前 DEF 1・最大HP 20」＝
// ハート10・木の剣ティア0・盾なし・布の服ティア0）＋`toolsUsableIn(map).dungeon_6`＝
// ブーメラン・弓・ロウソク・爆弾持ち（弱点 fire ×2 の答え＝ロウソクを持っている状態）。
const D6_PRE = {
  ps_hearts: '10', ps_sword: '0', ps_shield: '0', ps_armor: '0',
  ps_weapon: '1', ps_boomerang: '1', ps_bow: '1', ps_candle: '1', ps_bomb: '1',
};

/**
 * `bal_forest_giant` の O を n tick 追う。毎 tick の印（座標・濃さ・相）と岩（着弾点）と
 * 土煙（絵の中心と半径）とプレイヤーの被弾を返す。
 * @param {object} o
 * @param {number} o.ticks      進める論理 tick 数
 * @param {object} [o.spawn]    プレイヤーの湧き（既定＝(4,4)）
 * @param {number} [o.dropAt]   この tick の step より前に O へ与えるダメージの tick
 * @param {number} [o.dmg]      そのダメージ量（`dealDamage` は def を引く∴+def して渡す）
 * @param {boolean} [o.debugOff] true＝'g' で debug を切る（ダメージが通る）
 * @param {object} [o.moveAt]   { dir, steps }＝**印が立っているあいだに**その向きへ steps 回歩く
 *                              （`movePlayer` 1回＝MOVE_STEP 0.5＝キー押しっぱなしより正確）
 * @param {object} [o.patch]    ENEMY_META['O'] へ一時的に差し込むフィールド（下の ROCK_ONLY）
 */
async function trackGiant(page, o) {
  await installToneRec(page);
  const sp = o.spawn ?? { row: O_PL_ROW, col: O_PL_COL };
  await gotoFrozen(page, previewUrl('bal_forest_giant', sp.row, sp.col, D6_PRE));
  if (o.debugOff) await page.keyboard.press('g');
  return page.evaluate((a) => {
    const g = window.__game;
    if (a.patch) g.setEnemyMetaForTest('O', a.patch);
    const o0 = g.getEnemies().find(e => e.type === 'O');
    if (!o0) return { error: 'O が盤面に居ない' };
    const id = o0.id;
    const find = () => g.getEnemies().find(e => e.id === id);
    const cellPx = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 48;

    const samples = [];
    let stepsLeft = a.moveAt?.steps ?? 0;
    const movedAt = [];
    let dustSeen = 0;
    for (let t = 1; t <= a.ticks; t++) {
      if (a.dropAt === t) g.dealDamage(id, a.dmg);
      // 印が立っている tick だけ歩く＝「岩が落ちる前に印から離れる」プレイヤー側の操作
      if (stepsLeft > 0 && find()?.gazePhase === 'mark') {
        g.movePlayer(a.moveAt.dir); stepsLeft--; movedAt.push(t);
      }
      const tone0 = window.__tones.length;
      g.step(1);
      const e = find();
      if (!e) break;
      const p = g.getPlayer(), st = g.getState();
      const cx = e.x + ((e.w ?? 1) - 1) / 2, cy = e.y + ((e.h ?? 1) - 1) / 2;
      const el = document.getElementById(`gaze-mark-${id}`);
      // 敵の投擲物（＝岩）の着弾点＝「印を狙っている」かをここで読む
      const rocks = g.getProjectiles().filter(pr => pr.owner === 'enemy').map(pr => ({
        type: pr.type, lob: !!pr.lob, x: pr.x, y: pr.y,
        targetX: pr.targetX, targetY: pr.targetY,
      }));
      // 岩が砕けた土煙（1発ぶん1枚）。⚠️ 実時間の消去タイマ（500ms）は同期ループの
      //    あいだ走らない∴消えずに溜まる＝**増分**で「この tick に落ちた」を読む。
      const dust = [...document.querySelectorAll('.explosion-effect.explosion-rock')];
      const newDust = dust.slice(dustSeen).map((d) => ({
        // 円の中心（セル座標）と半径（セル）＝ダメージ範囲を覆っているかを数で読む
        cx: (parseFloat(d.style.left) + parseFloat(d.style.width) / 2) / cellPx - 0.5,
        cy: (parseFloat(d.style.top) + parseFloat(d.style.height) / 2) / cellPx - 0.5,
        r: parseFloat(d.style.width) / cellPx / 2,
      }));
      dustSeen = dust.length;
      samples.push({
        t, now: st.gameTime, hp: e.hp, x: e.x, y: e.y, dir: e.dir, speed: e.speed ?? null,
        gaze: e.gaze ?? null,
        gazeCx: e.gazeCx ?? null, gazeCy: e.gazeCy ?? null, gazePhase: e.gazePhase ?? null,
        gazeAt: e.gazeAt ?? null, gazeSpan: e.gazeSpan ?? null, gazeR: e.gazeR ?? null,
        gazeHeat: e.gazeHeat ?? null, gazeCount: e.gazeCount ?? 0,
        freezeUntil: e.freezeUntil ?? null, swingAt: e.swingAt ?? null,
        px: p.x, py: p.y, php: p.hp, pdef: st.player.def, inv: st.player.invincibleUntil,
        // 巨人の中心から印まで／プレイヤーから印まで（＝「寄る先」と「危ない場所」を1つの数で）
        dMark: e.gazeCx == null ? null : Math.hypot(cx - e.gazeCx, cy - e.gazeCy),
        // 体の**端**から印まで（hitbox.js と同じ取り方）＝2×2 の中心距離では「隣に来た」が
        // 測れない（中心は必ず 0.5 ずれる∴隣接でも 1.58 になる）
        eMark: e.gazeCx == null ? null
          : Math.hypot(Math.max(0, Math.abs(e.gazeCx - cx) - ((e.w ?? 1) - 1) / 2 - 0.5),
                       Math.max(0, Math.abs(e.gazeCy - cy) - ((e.h ?? 1) - 1) / 2 - 0.5)),
        pdMark: e.gazeCx == null ? null : Math.hypot(p.x - e.gazeCx, p.y - e.gazeCy),
        // 印の絵（唯一の告知）＝出ているか・赤い段か・落下中か・大きさ・枠線の色
        mark: !!el,
        markHot: !!el?.classList.contains('gaze-mark-hot'),
        markFalling: !!el?.classList.contains('gaze-mark-falling'),
        markSpan: el ? parseFloat(el.style.width) / cellPx : null,
        markBorder: (() => {
          if (!el) return null;
          const m = getComputedStyle(el).borderTopColor.match(/[\d.]+/g);
          return m ? m.slice(0, 3).map(Number) : null;
        })(),
        // 硬直の絵（＝殴り返せる窓が画面に出ているか）
        recover: !!document.getElementById(`char-enemy-${id}`)?.classList.contains('attack-recover'),
        rocks, newDust,
        newTones: window.__tones.slice(tone0),
      });
    }
    const e = find();
    return { id, samples, movedAt, end: e && { hp: e.hp, maxHp: e.maxHp, speed: e.speed, gaze: e.gaze ?? null } };
  }, o);
}

// 岩の当たりだけを測るための一時パッチ＝O に**枝腕を振らせない**（cooldown を伸ばす）。
// ⚠️ 必要な理由＝O は印へ**歩いて来る**∴印に立ったまま待つと（㉝）岩が落ちる前に枝腕の
//    間合い（1.4）に入られる＝INVINCIBLE_MS 1500ms の無敵窓が岩を飲み込み「HP が減ったか」
//    では当たり判定を測れない（J の CRUSH_ONLY で踏んだ罠と同型）。
const ROCK_ONLY = {
  attacks: [{ type: 'sword', range: 1.4, cooldown: 999000 }],
  attack: { type: 'sword', range: 1.4, cooldown: 999000 },
};

/** `gazePhase` の連続区間へ切り分ける（最後の区間は打ち切られている＝complete false）。 */
function gazeRuns(samples) {
  const runs = [];
  for (const s of samples) {
    const last = runs[runs.length - 1];
    if (last && last.phase === s.gazePhase) last.samples.push(s);
    else runs.push({ phase: s.gazePhase, samples: [s] });
  }
  return runs.map((r, i) => ({ ...r, complete: i < runs.length - 1 }));
}

// ── ㉚ データ＝O の層2（見据えの綴りと「印から離れれば必ず助かる」算術）─────────────
test('㉚ O 古森の巨人のデータ＝見据えは印1つ＝岩1つで、印から離れる猶予が必ずある', () => {
  const m = ENEMY_META['O'];
  const c = m.gaze;

  expect(c, 'gaze が無い＝O に固有の移動機構が無い').toBeTruthy();
  // 綴りの番人（`resolveGaze` を読む3つの関数が読むキー＝1文字違うと既定値に落ちて黙って動く）
  expect(Object.keys(c).sort()).toEqual([
    'arcHeight', 'restMs', 'rockSpeed', 'stampAtk', 'stampMs', 'stampRadius', 'throwFreezeMs',
  ]);

  // 他の4体の移動機構を**持っていない**＝型を借りていない
  expect(m.hitAndAway, '間合いの往復（W/G の型）が生きている＝gaze の分岐に来ない').toBe(false);
  for (const k of ['combat', 'laneStalk', 'burrowAmbush', 'hide', 'dash', 'coil']) {
    expect(m[k], `${k} を持っている＝W/A/N/G/J の型を借りている`).toBeUndefined();
  }
  for (const p of m.phases ?? []) {
    for (const k of ['dash', 'coil', 'hide']) {
      expect(p[k], `後半に ${k} が生えている＝他のボスの後半と同じ型`).toBeUndefined();
    }
  }
  // 遠隔の攻撃を**持たない**＝投擲は見据えの周期だけが持つ（時計を2つにしない）
  expect([...attackTypesOf(m)], 'O の攻撃が枝腕（近接）だけでない＝岩以外の投擲が混ざる')
    .toEqual(['sword']);

  // ── 「印から離れる」が必ず間に合うことを**前半・後半の両方**で数として確かめる ────
  const ph = (m.phases ?? []).find(p => p.gaze);
  expect(ph, '後半に gaze の差し替えが無い＝相が変わっても見据えが同じ').toBeTruthy();
  expect(Object.keys(ph.gaze).sort(), '後半の gaze のキーが前半と違う＝部分指定で既定値に落ちる')
    .toEqual(Object.keys(c).sort());
  for (const [label, cfg] of [['前半', c], ['後半', ph.gaze]]) {
    // ① 予告（印が濃くなる窓）のあいだに歩ける距離 > 潰す半径＝立ち止まっていなければ助かる
    const windupTicks = Math.floor(cfg.stampMs / TICK_MS);
    expect(windupTicks * MOVE_STEP, `${label}は印が立ってから外へ出るまで走り切れない＝理不尽`)
      .toBeGreaterThan(cfg.stampRadius);
    expect(Math.ceil(cfg.stampRadius / MOVE_STEP), `${label}の予告 tick 数が逃げる歩数に足りない`)
      .toBeLessThanOrEqual(windupTicks);
    // ② 印は「初見でも気づける長さ」立っている（＝押した瞬間に落ちない）
    expect(windupTicks, `${label}の印が数 tick で消える＝告知に気づけない`).toBeGreaterThanOrEqual(6);
    for (const k of ['stampMs', 'restMs', 'throwFreezeMs', 'rockSpeed', 'stampRadius']) {
      expect(cfg[k], `${label}の ${k} が正の数でない`).toBeGreaterThan(0);
    }
    // ③ 岩は新しい最大打点を作らない（枝腕と同じ＝J の crushAtk と同じ作法）
    expect(cfg.stampAtk, `${label}の岩が枝腕より痛い＝新しい最大打点を作っている`).toBe(m.atk);
    // ④ 投げた直後の硬直で剣が届く＝反撃の窓が両方の相にある（2×2 ∴端は中心から1セル内側）
    expect(cfg.throwFreezeMs, `${label}の硬直が短すぎる＝殴り返せない`)
      .toBeGreaterThanOrEqual(2 * TICK_MS);
    // ⑤ **1周期のあいだに印まで歩き着ける**＝「さっき居た場所へ踏み込んで来る」が画面に出る
    //    （速さ 0.5＝1 tick に MOVE_STEP の半分＝0.25 セル）
    const cycleTicks = (cfg.stampMs + cfg.restMs) / TICK_MS;
    const speed = m.speed * (label === '後半' ? (ph.speedMultiplier ?? 1) : 1);
    expect(cycleTicks * speed * MOVE_STEP, `${label}は1周期で印の半径ぶんも歩けない＝踏み込みが見えない`)
      .toBeGreaterThan(cfg.stampRadius);
  }
  // ⑥ 速さはプレイヤー（1.0）未満＝走って離れる側が必ず速い（GUIDE §7-2）
  expect(m.speed, 'O がプレイヤーより速い＝印から離れ続けられない').toBeLessThan(1.0);
  // 枝腕は「印に立ち止まった相手」にだけ届く長さ（＝密着していなければ岩だけが脅威）
  const sword = m.attacks.find(a => a.type === 'sword');
  expect(sword.range, '枝腕の間合いが印の半径より広い＝離れても殴られる（印を読む意味が薄れる）')
    .toBeLessThanOrEqual(c.stampRadius + 0.5);
  // 弱点＝炎（ロウソク＝密着して焼く）＝この機構と噛み合う（寄って留まると足元に印が立つ）
  // 倍率は 0u（2026-09-05 の横並び1パス）で ×2 → ×5。置き炎は「1体に1回・同時3つまで」＝
  // 当てられる回数が機構で縛られている∴軽い1発では弱点ルートが死ぬ（旧 ×2 ＝24発）。
  expect(m.weakness).toEqual({ type: 'fire', multiplier: 5 });
  // 炎の弱点を持つ3体（I ×5／L ×3／O ×5）を**同じ武器で**並べた発数の帯＝8〜14発。
  // 手書きの数を置かず `CANDLE_FIRE_DMG` と meta から導く＝どちらを動かしても赤くなる。
  const burnHits = Math.ceil(m.hp / Math.max(1, Math.round(CANDLE_FIRE_DMG * m.weakness.multiplier) - m.def));
  expect(burnHits, 'O を炎で焼き切る発数が 8〜14 の帯から外れた（他の炎ボスと並ばない）')
    .toBeGreaterThanOrEqual(8);
  expect(burnHits).toBeLessThanOrEqual(14);

  // ── 後半＝速く押し直して広く潰す（打点は据え置き）──────────────────────
  expect(ph.gaze.stampMs, '後半の印が前半以上に長い＝押し直しが速くなっていない')
    .toBeLessThan(c.stampMs);
  expect(ph.gaze.restMs, '後半の余韻が前半以上＝周期が短くなっていない').toBeLessThan(c.restMs);
  expect(ph.gaze.stampRadius, '後半の潰す範囲が前半以下＝踏み込みの危険が増えない')
    .toBeGreaterThan(c.stampRadius);
  expect(ph.gaze.rockSpeed, '後半の岩が前半以下の速さ＝落ちるまでの猶予が増えている')
    .toBeGreaterThan(c.rockSpeed);
});

// ── ㉛ 移動＝プレイヤーを追わない（押した印へ寄る・向きも印を向く）───────────────
test('㉛ O は印（1拍前の足跡）へ寄り、印はプレイヤーのタイルに押されたまま動かない', async ({ page }) => {
  const out = await trackGiant(page, { ticks: 46 });
  expect(out.error).toBeUndefined();
  const s = out.samples;

  // ① 印はプレイヤーの立っていたタイル（＝敵の位置ではない）。動かない限り同じタイル
  const marked = s.filter(x => x.gazeCx != null);
  expect(marked.length, '印が立っている tick が観測できていない').toBeGreaterThan(20);
  for (const x of marked) {
    expect([x.gazeCy, x.gazeCx], `t${x.t} の印がプレイヤーのタイルでない`)
      .toEqual([O_PL_ROW, O_PL_COL]);
  }
  // ② 印の絵は 'mark'（押してから投げるまで）と 'flight'（岩が飛んでいる間）だけ出る
  //    ＝「どこに落ちるか」が出ている窓と、岩が空に居る窓が絵で一致する
  for (const x of s) {
    const want = x.gazePhase === 'mark' || x.gazePhase === 'flight';
    expect(x.mark, `t${x.t}（${x.gazePhase}）の印の絵の有無が相と合わない`).toBe(want);
    if (x.gazePhase === 'flight') {
      expect(x.markFalling, `t${x.t} に落下中の影が出ていない＝いつ落ちるかが読めない`).toBe(true);
    }
  }
  // ③ **印へ寄る**＝巨人の中心から印までの距離が観測窓で確かに詰まり、体が印の隣まで来る
  //    （印のタイルにはプレイヤーが立っている＝`isPassableForEnemy` で重なれない∴隣で止まる）
  expect(s[s.length - 1].dMark, '巨人が印へ寄っていない＝寄る先が印になっていない')
    .toBeLessThan(s[0].dMark);
  // 印のタイルは体の**真隣**まで詰める（0.5＝隣のタイルの中心＝体の縁から半セル）。
  // ⚠️ 中心距離（dMark）で測ると 2×2 は隣接でも 1.58 になる＝「寄っていない」と誤読する。
  expect(Math.min(...marked.map(x => x.eMark)), '巨人が印の隣まで来ない＝踏み込みが起きていない')
    .toBeLessThanOrEqual(0.5);
  // ④ 向きは**印**を向く（プレイヤーではなく印を見据えている＝機構の名前どおり）
  for (const x of marked) {
    const dx = x.gazeCx - (x.x + 0.5), dy = x.gazeCy - (x.y + 0.5);
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
    const want = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    expect(x.dir, `t${x.t} の向きが印の方向でない（印 ${x.gazeCy},${x.gazeCx}）`).toBe(want);
  }
  // ⑤ 押した瞬間に SE が鳴る（＝床の絵を見ていなくても「見据えられた」が分かる）
  const claims = gazeRuns(s).filter(r => r.phase === 'mark');
  expect(claims.length, '観測窓で印が1回も押されていない').toBeGreaterThan(0);
  for (const r of claims) {
    expect(r.samples[0].newTones.length, `t${r.samples[0].t} の印に SE が無い＝予告が音で出ない`)
      .toBeGreaterThan(0);
  }
});

// ── ㉜ 答え＝印から離れる（岩は置き去りの印に落ち、次の印は新しい足元に立つ）───────────
test('㉜ 印から離れれば岩は当たらず、次の印は逃げた先に立つ', async ({ page }) => {
  const c = ENEMY_META['O'].gaze;
  // 印が立っているあいだに西へ5歩（2.5セル）＝潰す半径 1.2 の外。予告は9 tick ∴間に合う。
  // ⚠️ 枝腕は止める（ROCK_ONLY）＝止めないと「無傷だった」が**無敵窓のおかげ**でも成立する。
  const out = await trackGiant(page, {
    ticks: 40, debugOff: true, moveAt: { dir: 'left', steps: 5 }, patch: ROCK_ONLY,
  });
  const s = out.samples;
  expect(out.movedAt.length, '印が立っているあいだに歩き切れていない（窓が足りない）').toBe(5);

  // ① 岩が離れる tick＝着弾点は**印そのもの**（プレイヤーの今の位置ではない）
  const throwT = s.findIndex(x => x.gazePhase === 'flight');
  expect(throwT, '観測窓で岩が投げられていない').toBeGreaterThan(0);
  const thrown = s[throwT];
  const rock = thrown.rocks.find(r => r.lob);
  expect(rock, '放物線の岩が飛んでいない').toBeTruthy();
  expect([rock.targetY, rock.targetX], '岩の着弾点が印と違う＝印が告知になっていない')
    .toEqual([O_PL_ROW, O_PL_COL]);
  // ② 印は逃げても**動かない**（追尾しない）＝逃げた側が安全になる根拠
  expect([thrown.gazeCy, thrown.gazeCx], '印がプレイヤーを追って動いた')
    .toEqual([O_PL_ROW, O_PL_COL]);
  expect(thrown.pdMark, 'この回はプレイヤーが印の外に出られていない＝逃げの成否を測れない')
    .toBeGreaterThan(thrown.gazeR);

  // ③ 着弾＝土煙は印の上に出るが、HP は減らない
  const hitIdx = s.findIndex(x => x.newDust.length > 0);
  expect(hitIdx, '岩が着弾していない').toBeGreaterThan(0);
  const hit = s[hitIdx], before = s[hitIdx - 1];
  expect([hit.newDust[0].cy, hit.newDust[0].cx], '土煙が印の上に出ていない')
    .toEqual([O_PL_ROW, O_PL_COL]);
  expect(before.inv, '着弾の直前に無敵窓が生きている＝逃げ切りの成否を測れない')
    .toBeLessThanOrEqual(before.now);
  expect(hit.php, '印の外へ出たのに潰された＝答えが機能していない').toBe(before.php);
  expect(hit.newTones.length, '着弾の SE が鳴っていない＝「落ちた」が音で出ない').toBeGreaterThan(0);
  // 着弾したら印の絵は消える（＝空振りでも「終わった」が読める）
  expect(hit.mark, '着弾後も印の絵が残っている').toBe(false);

  // ④ 次の印は**逃げた先の足元**に立つ＝逃げ続ければ何も起きなくなることはない
  const reclaim = s.find(x => x.t > hit.t && x.gazePhase === 'mark');
  expect(reclaim, '着弾のあと印を押し直さない＝1周期で終わってしまう').toBeTruthy();
  expect([reclaim.gazeCy, reclaim.gazeCx], '押し直した印が逃げた先のタイルでない')
    .toEqual([toTile(reclaim.py), toTile(reclaim.px)]);
  expect(reclaim.gazeCx, '押し直した印が元の場所と同じ＝逃げが反映されていない')
    .not.toBe(O_PL_COL);
  // 押し直しは着弾から `restMs` 空く（＝殴り返す余韻）
  expect((reclaim.now - hit.now), '着弾から次の印までの余韻が restMs と違う').toBe(c.restMs);
});

// ── ㉝ 印に残ると潰される（絵はダメージ範囲を覆う）＋投げた直後は殴り返せる ──────────
test('㉝ 印に立ち止まると岩に潰され、投げた直後の硬直が反撃の窓になる', async ({ page }) => {
  const m = ENEMY_META['O'];
  const c = m.gaze;
  // 一歩も動かない＝印は足元に立つ。枝腕は止める（ROCK_ONLY）＝HP が減ったら岩以外にありえない。
  const out = await trackGiant(page, { ticks: 40, debugOff: true, patch: ROCK_ONLY });
  const s = out.samples;

  const hitIdx = s.findIndex(x => x.newDust.length > 0);
  expect(hitIdx, '岩が着弾していない').toBeGreaterThan(0);
  const hit = s[hitIdx], before = s[hitIdx - 1];

  // 前提①＝直前に無敵窓が無い（＝減らなかったら本当に当たっていない）
  expect(before.inv, '着弾の直前に無敵窓が生きている＝ダメージの有無が測れない')
    .toBeLessThanOrEqual(before.now);
  // 前提②＝プレイヤーは潰す範囲の内側に居る／前提③＝ここまで HP は減っていない
  expect(before.pdMark, '印の外に出てしまった（この回は潰される条件を作れていない）')
    .toBeLessThanOrEqual(before.gazeR ?? c.stampRadius);
  expect(s.slice(0, hitIdx).every(x => x.php === s[0].php),
    '着弾の前に HP が減っている＝岩以外のダメージが混ざっている').toBe(true);

  // ① 潰しのダメージ＝stampAtk − 防御（盾では防げない＝答えは「印から離れる」だけ）
  expect(hit.php, '岩が当たっていない（HP が減っていない）')
    .toBe(before.php - (c.stampAtk - hit.pdef));
  expect(hit.inv, '被弾後の無敵窓が立っていない＝ダメージ経路が takeDamage を通っていない')
    .toBeGreaterThan(hit.now);
  // ② 絵はダメージ範囲の**上位集合**＝「何も描かれていない床で潰された」が起きない
  const dust = hit.newDust[0];
  expect([dust.cy, dust.cx], '土煙の中心が印と違う').toEqual([before.gazeCy, before.gazeCx]);
  expect(dust.r, '土煙の円がダメージ半径を覆っていない＝描かれていない床で潰される')
    .toBeGreaterThanOrEqual(before.gazeR);
  // 床の印そのものもダメージ範囲を覆う（絵の直径＝半径2つ＋自セル1枚）
  expect(before.markSpan, '床の印の直径がダメージ範囲より小さい')
    .toBeGreaterThanOrEqual(before.gazeR * 2);

  // ③ 投げた直後は硬直＝**動かない・絵も出る**（殴り返す窓）
  const throwT = s.findIndex(x => x.gazePhase === 'flight');
  const thrown = s[throwT];
  expect(thrown.freezeUntil, '岩を投げた直後の硬直が throwFreezeMs で立っていない')
    .toBe(thrown.now + c.throwFreezeMs);
  const frozenTicks = s.filter(x => x.t >= thrown.t && x.now < thrown.freezeUntil);
  expect(frozenTicks.length, '硬直の窓が観測できていない').toBeGreaterThan(1);
  for (const f of frozenTicks) {
    expect([f.y, f.x], `硬直中の t${f.t} に巨人が動いた＝反撃の窓が無い`).toEqual([thrown.y, thrown.x]);
    expect(f.recover, `硬直中の t${f.t} に硬直の絵が出ていない＝窓が画面に出ない`).toBe(true);
  }
});

// ── ㉞ 1つの印 ⇔ 1つの岩／印の濃さは**歩かない tick でも**上がる（時計は行動ゲートの外）──
test('㉞ 印1つに岩1つが対応し、印の濃さは巨人が動かない tick でも上がり続ける', async ({ page }) => {
  const c = ENEMY_META['O'].gaze;
  const out = await trackGiant(page, { ticks: 60 });
  const s = out.samples;

  // ① 印が押された回数＝岩が離れた回数＝`_gazeCount`（告知と結果が1対1）
  const claims = gazeRuns(s).filter(r => r.phase === 'mark');
  const flights = gazeRuns(s).filter(r => r.phase === 'flight');
  expect(claims.length, '観測窓で印が押されていない').toBeGreaterThanOrEqual(2);
  expect(s[s.length - 1].gazeCount, '押した印の数と投げた岩の数が合わない')
    .toBe(flights.length);
  // 同時に空を飛んでいる岩は1つまで（＝印が2つ出て岩が1つ、の逆も起きない）
  for (const x of s) {
    expect(x.rocks.filter(r => r.lob).length, `t${x.t} に岩が2つ以上飛んでいる`).toBeLessThanOrEqual(1);
  }

  // ② 濃さ（`_gazeHeat`）は 0→1 に単調＝色・音・テストが読む唯一の数
  const run = claims.find(r => r.complete && r.samples.length >= 6);
  expect(run, '完結した印の窓が観測できていない').toBeTruthy();
  expect(run.samples[0].gazeHeat, '押した瞬間の濃さが 0 でない').toBeCloseTo(0, 6);
  for (let i = 1; i < run.samples.length; i++) {
    expect(run.samples[i].gazeHeat, `t${run.samples[i].t} で濃さが戻った`)
      .toBeGreaterThan(run.samples[i - 1].gazeHeat);
  }
  expect(run.samples.length, '印の窓の tick 数が stampMs と合わない')
    .toBe(Math.round(c.stampMs / TICK_MS));
  // ★時計は**行動ゲートの外**＝1歩も動かない tick（歩幅の溜め）でも濃さは上がる。
  //   ここをゲートの中に置くと印が止まって見える（J の輪で実測した罠と同型）。
  const held = [];
  for (let i = 1; i < run.samples.length; i++) {
    const a = run.samples[i - 1], b = run.samples[i];
    if (a.x === b.x && a.y === b.y) held.push([a, b]);
  }
  expect(held.length, '1歩も動かない tick が観測窓に無い＝溜め中の濃さを測れていない')
    .toBeGreaterThan(0);
  for (const [a, b] of held) {
    expect(b.gazeHeat, `動かなかった t${b.t} で濃さが上がっていない＝歩幅に縛られている`)
      .toBeGreaterThan(a.gazeHeat);
  }
  // 飛翔中は 1 のまま（下がらない）＝「もう落ちる」が引っ込まない
  for (const f of flights) for (const x of f.samples) {
    expect(x.gazeHeat, `t${x.t}（飛翔中）の濃さが 1 でない`).toBe(1);
  }

  // ③ 「もう落ちる」の1段（赤い脈打ち）は**岩が離れる前**に始まり、そこで印は既に赤い
  const hotIdx = run.samples.findIndex(x => x.markHot);
  expect(hotIdx, '赤い脈打ちの段が無い＝「もう落ちる」が投げるまで告知されない').toBeGreaterThan(0);
  expect(run.samples[hotIdx].gazeHeat, '脈打ちが始まる濃さが 1 ＝濃くなり切ってから脈打っている')
    .toBeLessThan(1);
  for (const x of run.samples.slice(0, hotIdx)) {
    expect(x.markHot, `t${x.t} で既に脈打っている＝押した瞬間から警告が出っぱなし`).toBe(false);
  }
  // 印は濃くなるほど赤へ寄る（CSS が `--gaze-warn` から色相を作る＝土色 45° → 赤 0°）
  const ramp = run.samples.filter(x => x.markBorder);
  expect(ramp.length, '印の枠線の色を採れていない').toBeGreaterThan(4);
  for (let i = 1; i < ramp.length; i++) {
    expect(ramp[i].markBorder[1], `t${ramp[i].t} で印の緑が増えた＝赤へ寄る告知が壊れた`)
      .toBeLessThanOrEqual(ramp[i - 1].markBorder[1]);
  }
  const hotRgb = run.samples[hotIdx].markBorder;
  expect(hotRgb[0], '脈打ち開始時点で赤が振り切っていない').toBeGreaterThan(200);
  expect(hotRgb[1], '脈打ち開始時点でまだ黄／土色寄り＝赤に見えない').toBeLessThan(hotRgb[0] / 2);

  // ④ 「見据えた」音と「落ちた」音は別（＝離れろ／殴り返せ、が耳で区別できる）
  const claimTones = JSON.stringify(run.samples[0].newTones);
  const land = s.find(x => x.newDust.length > 0);
  expect(land, '観測窓で岩が着弾していない').toBeTruthy();
  expect(land.newTones.length, '着弾の SE が鳴っていない').toBeGreaterThan(0);
  expect(JSON.stringify(land.newTones), '印の音と着弾の音が同じ＝告知と結果が区別できない')
    .not.toBe(claimTones);
});

// ── ㉟ HP 半分で「速く押し直して広く潰す」へ変わる（層1 の `phases[].gaze` が出荷データで効く）──
test('㉟ HP 半分で印を押し直す間隔が短くなり、潰す範囲が広くなる', async ({ page }) => {
  const m = ENEMY_META['O'];
  const ph = m.phases.find(p => p.gaze);
  // dealDamage は防御を引く∴+def して渡す（HP をちょうど 50% に落とす）
  const out = await trackGiant(page, { ticks: 60, dropAt: 8, dmg: Math.ceil(m.hp / 2) + m.def });
  const s = out.samples;
  expect(s[7].hp / m.hp, 'HP が 50% 以下に落ちていない＝相の条件を満たしていない')
    .toBeLessThanOrEqual(0.5);

  // 相の差し替えが実体（`_gaze`）に載っている＝`resolveGaze` が読む側が変わった
  expect(out.end.gaze, '後半の gaze が実体に載っていない').toEqual(ph.gaze);
  expect(out.end.speed, '後半の速さ倍率が載っていない').toBeCloseTo(m.speed * ph.speedMultiplier, 6);

  // ① 相が変わった**後に押した印**は後半の値で立つ（押した瞬間に固定する＝latch の作法）
  const after = gazeRuns(s.filter(x => x.t > 8)).filter(r => r.phase === 'mark');
  const fresh = after.find(r => r.samples[0].gazeSpan === ph.gaze.stampMs);
  expect(fresh, '後半に入っても印が前半の長さで立ち続ける＝差し替えが効いていない').toBeTruthy();
  expect(fresh.samples[0].gazeR, '後半の印の潰す半径が差し替わっていない').toBe(ph.gaze.stampRadius);
  expect(fresh.samples.length, '後半の印の tick 数が後半の stampMs と合わない')
    .toBe(Math.round(ph.gaze.stampMs / TICK_MS));
  expect(fresh.samples.length, '後半の印が前半より長い／同じ＝押し直しが速くなっていない')
    .toBeLessThan(Math.round(m.gaze.stampMs / TICK_MS));
  // ② 印の絵も広くなる（絵と当たりが同じ1つの数から出ている＝`_gazeR`）
  expect(fresh.samples[0].markSpan, '後半の印の絵が前半と同じ大きさ＝広さが画面に出ない')
    .toBeGreaterThan(m.gaze.stampRadius * 2 + 1);
  // ③ 走っている1周の途中で相が変わっても、絵で見た印と落ちる岩の範囲はずれない
  //    （＝押した瞬間に固定した `_gazeR` を岩の爆風がそのまま使う）
  for (const x of s) {
    if (x.gazeR == null || x.newDust.length === 0) continue;
    expect(x.newDust[0].r, `t${x.t} の土煙がその印の半径を覆っていない`)
      .toBeGreaterThanOrEqual(x.gazeR);
  }
});

// ── ㊱ 導出＝O の機構は G・W・A・N・J のどれとも重ならない（手書きの表で数えない）─────
test('㊱ O の移動機構は G・W・A・N・J のどれとも重ならない', () => {
  const o = mechanismsOf(ENEMY_META['O']);
  const others = ['G', 'W', 'A', 'N', 'J'].map(k => mechanismsOf(ENEMY_META[k]));
  expect(o.has('gaze'), 'O が移動機構（gaze）を持っていない').toBe(true);
  expect([...o].filter(k => others.every(x => !x.has(k))).length,
    'O に G・W・A・N・J が持たない機構が1つも無い＝6体目の型になっていない').toBeGreaterThan(0);
  expect(others.some(x => x.has('gaze')),
    'G・W・A・N・J のどれかが見据えを持っている＝O の固有機構ではない').toBe(false);
  const users = Object.entries(ENEMY_META).filter(([, m]) => m.gaze).map(([k]) => k);
  expect(users, '見据えを持つ敵が O 以外にも居る（設計が重複した）').toEqual(['O']);
});

// ── ㊲ 検証ステージの幾何（GUIDE §4-3）───────────────────────────────
test('㊲ bal_forest_giant は 10×12・外周は通路以外すべて壁・O が (4,7) に1体だけ・水なし', () => {
  const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
  const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  const sd = MAP.layers[TEST_LAYER].stages[stageKey('bal_forest_giant')];
  expect(sd.rows).toBe(10);
  expect(sd.cols).toBe(12);
  // 遮蔽ゼロ＝岩は `lob`（遮蔽が効かない）∴地形で避けられると機構の測定が地形の話になる
  expect(Object.keys(sd.bgTiles ?? {}), '別地形が入った＝見据えの測定が地形のせいになる').toEqual([]);

  const at = (r, c) => sd.tiles[r][c];
  const giants = [];
  for (let r = 0; r < sd.rows; r++) {
    for (let c = 0; c < sd.cols; c++) {
      const ch = at(r, c);
      if (ch === TILE.FOREST_GIANT) { giants.push([r, c]); continue; }
      if (r === 6 && c === 1) continue;              // 看板 i（南の通路の脇）
      const edge = r === 0 || c === 0 || r === sd.rows - 1 || c === sd.cols - 1;
      const want = edge && !isArenaDoor(r, c, sd.cols) ? TILE.WALL : TILE.FLOOR;
      expect(at(r, c), `(${r},${c}) が想定と違う`).toBe(want);
    }
  }
  expect(giants, 'O が1体だけ (4,7) に居る前提が崩れた').toEqual([[O_ROW, O_COL]]);

  // 測る湧き (4,4) から**西へ逃げる道**が空いている＝㉜（印から離れる）の前提。
  // 後半の半径 1.6 の外（3歩＝1.5セル）より遠くまで走れることを地形で裏取りする。
  const ph = ENEMY_META['O'].phases.find(p => p.gaze);
  const needCells = Math.ceil(ph.gaze.stampRadius) + 1;
  for (let c = O_PL_COL - needCells; c <= O_PL_COL; c++) {
    expect(at(O_PL_ROW, c), `(${O_PL_ROW},${c}) が床でない＝印から離れる道が塞がっている`)
      .toBe(TILE.FLOOR);
  }
  // 巨人が印（4,4）へ寄る経路（同じ行の東側）も空いている＝㉛（踏み込み）の前提
  for (let c = O_PL_COL; c < O_COL; c++) {
    expect(at(O_PL_ROW, c), `(${O_PL_ROW},${c}) が床でない＝巨人が印へ歩けない`).toBe(TILE.FLOOR);
  }
});

// ════════ 6体目＝U 嵐の鷲王（2×2・D7 空の神殿のボス）＝滞空と急降下（soar）═════════
// G・W・A・N・J・O のどれとも違う点＝**こちらの届く手段が相によって変わる**。U は周期的に
// 空へ退き（`air`/`aim`）、そのあいだ **矢しか届かない**（`meta.soar.reachedBy`＝弱点と同じ
// 'arrow'）。空では剣の間合いへ自分から入らず `orbitRange` を保って**軸へ回り込み**、軸が
// 揃ったら急降下（`dive`）で落ちてくる。
//   ・6拍＝`tickSoar`：ground（地上＝殴れる・歩く・鉤爪）→ rise（舞い上がる溜め＝まだ殴れる）
//     → air（旋回＝矢だけ届く）→ aim（落ちる軸の予告＝矢だけ届く）→ dive（落下）
//     → land（着地硬直＝反撃の窓）→ ground。**1回の滞空 ⇔ 1回の急降下**（`soarFlights`/`soarDives`）。
//   ・移動＝`enemySoarStride`（ground は普通に追う／air だけ旋回＝寄り方そのものが相で変わる）。
//   ・答えは2つ＝①軸から外れる（`alignTol`・予告 `aimMs` のあいだに直交へ出る）
//     ②**矢で射抜く**（`crashSoar`＝墜落＝`crashStunMs` の気絶＝着地硬直より大きい隙）。
//     ∴弱点（矢 ×2）が倍率だけでなく**機構の解除鍵**（δ の `split.blockedBy` と同じ作法）。
//   ・後半（HP 50% 以下）＝`phases[].soar` で地上の時間が短く（1560→960ms）予告が短く
//     （600→480ms）急降下が速くなる（1.5→1.9）。打点（diveAtk）は据え置き。
//
// ⚠️ 測る湧きは **(4,4)**＝鷲王 (4,7) と**同じ行**（＝最初から軸に乗っている＝急降下が必ず出る）。
//    旋回そのものを測る回だけ軸を外した湧き（`U_OFF_SPAWN`）を使う。
// ⚠️ ダメージを測る回は `page.keyboard.press('g')` で debug を切る（プレビューは debugMode）。
// ⚠️ 鉤爪と雷撃弾は `DIVE_ONLY` で止める＝止めないと急降下の当たりが INVINCIBLE_MS の
//    無敵窓に飲まれて測れない（O の ROCK_ONLY・J の CRUSH_ONLY と同型の罠）。
const U_ROW = 4, U_COL = 7;          // 2×2 ∴ rows 4-5 / cols 7-8 を占める
const U_PL_ROW = 4, U_PL_COL = 4;    // 測る湧き（同じ行＝軸に乗っている）
const U_OFF_SPAWN = { row: 1, col: 3 };   // 軸を外した湧き（＝旋回で軸へ回り込む様子を測る）
// D7 のボス直前の想定装備（audit-balance の「D7 空中の遺跡 / ボス直前 DEF 1・最大HP 28」＝
// ハート14・木の剣ティア0・盾なし・布の服ティア0）＋`toolsUsableIn(map).dungeon_7`＝
// ブーメラン・弓・ロウソク・梯子・爆弾・笛持ち（弱点 arrow ×2 の答え＝弓を持っている状態）。
const D7_PRE = {
  ps_hearts: '14', ps_sword: '0', ps_shield: '0', ps_armor: '0',
  ps_weapon: '1', ps_boomerang: '1', ps_bow: '1', ps_candle: '1', ps_bomb: '1',
  ps_ladder: '1', ps_flute: '1',
};
// 急降下の当たりだけを測るための一時パッチ＝鉤爪も雷撃弾も出させない（上の⚠️）。
const DIVE_ONLY = {
  attacks: [{ type: 'sword', range: 1.1, cooldown: 999000 }],
  attack: { type: 'sword', range: 1.1, cooldown: 999000 },
};
// 「空からも遠隔は届く」を測るための一時パッチ＝雷撃弾の間合いを部屋より広く・周期を短く取る
// （＝観測窓の中で滞空中に必ず1発飛ぶ）。鉤爪（sword）は**実データのまま**＝
// 「空では鉤爪の間合いに入らない」を本物の数（range 1.1）で測る。
const BOLT_FAST = {
  attacks: [{ type: 'sword', range: 1.1, cooldown: 700 },
            { type: 'stone', range: 9, cooldown: 480, projectileSpeed: 1.4 }],
  attack: { type: 'sword', range: 1.1, cooldown: 700 },
};

/**
 * `bal_storm_eagle` の U を n tick 追う。毎 tick の滞空の相・落ちる軸・絵のクラスと
 * プレイヤーの被弾を返す。
 * @param {object} o
 * @param {number} o.ticks       進める論理 tick 数
 * @param {object} [o.spawn]     プレイヤーの湧き（既定＝(4,4)）
 * @param {boolean} [o.debugOff] true＝'g' で debug を切る（ダメージが通る）
 * @param {object} [o.patch]     ENEMY_META['U'] へ一時的に差し込むフィールド（DIVE_ONLY 等）
 * @param {number} [o.dropAt]    この tick の step より前に U へ与えるダメージの tick
 * @param {number} [o.dmg]       その量（`dealDamage` は def を引く∴+def して渡す）
 * @param {string} [o.dmgType]   その種別（既定 undefined＝弱点も滞空の判定も通らない）
 * @param {object[]} [o.hits]    { phase, dmg, atkType } を**その相の tick に1つずつ**当てる
 *                               （⚠️ 相の tick 番号を固定で指定すると滞空の周期とずれる＝
 *                                O の trackScorpion で踏んだ罠と同型∴相で待つ）
 * @param {object} [o.moveWhen]  { phase, dir, steps }＝その相のあいだその向きへ steps 回歩く
 */
async function trackEagle(page, o) {
  await installToneRec(page);
  const sp = o.spawn ?? { row: U_PL_ROW, col: U_PL_COL };
  await gotoFrozen(page, previewUrl('bal_storm_eagle', sp.row, sp.col, D7_PRE));
  if (o.debugOff) await page.keyboard.press('g');
  return page.evaluate((a) => {
    const g = window.__game;
    if (a.patch) g.setEnemyMetaForTest('U', a.patch);
    const u0 = g.getEnemies().find(e => e.type === 'U');
    if (!u0) return { error: 'U が盤面に居ない' };
    const id = u0.id;
    const find = () => g.getEnemies().find(e => e.id === id);
    const edgeDist = (e, px, py) => {
      const cx = e.x + ((e.w ?? 1) - 1) / 2, cy = e.y + ((e.h ?? 1) - 1) / 2;
      const gx = Math.max(0, Math.abs(px - cx) - ((e.w ?? 1) - 1) / 2);
      const gy = Math.max(0, Math.abs(py - cy) - ((e.h ?? 1) - 1) / 2);
      return Math.hypot(gx, gy);
    };

    const samples = [];
    const hits = [...(a.hits ?? [])];
    const hitAt = [];
    let stepsLeft = a.moveWhen?.steps ?? 0;
    const movedAt = [];
    let stunSeen = 0;
    for (let t = 1; t <= a.ticks; t++) {
      // ⚠️ SE の増分はこの tick で**注入した攻撃も含める**∴step の直前ではなく
      //    ループの先頭で取る（空振りの SE は `dealDamage` の中で鳴る）。
      const tone0 = window.__tones.length;
      if (a.dropAt === t) g.dealDamage(id, a.dmg, a.dmgType);
      // 相を見て**その相の tick に**当てる／歩く（tick 番号で固定しない＝上の⚠️）
      const phaseNow = find()?.soarPhase ?? null;
      if (hits.length > 0 && phaseNow === hits[0].phase) {
        const h = hits.shift();
        const before = find().hp;
        // ⚠️ 当てた瞬間の論理時刻＝**この tick の step より前**（＝サンプルの now より
        //    TICK_MS 古い）。気絶の窓（`stunUntil`）はこの時刻から立つ∴ここで記録する。
        const nowAtHit = g.getState().gameTime;
        g.dealDamage(id, h.dmg, h.atkType);
        hitAt.push({ t, atkType: h.atkType, before, after: find().hp, now: nowAtHit });
      }
      if (stepsLeft > 0 && phaseNow === a.moveWhen.phase) {
        g.movePlayer(a.moveWhen.dir); stepsLeft--; movedAt.push(t);
      }
      g.step(1);
      const e = find();
      if (!e) break;
      const p = g.getPlayer(), st = g.getState();
      const el = document.getElementById(`char-enemy-${id}`);
      // 気絶の⭐（`showDashStun` が char-layer へ生やす）＝実時間のタイマで消える∴増分で読む
      const stuns = [...document.querySelectorAll('.stun-burst')];
      const newStuns = stuns.length - stunSeen;
      stunSeen = stuns.length;
      samples.push({
        t, now: st.gameTime, hp: e.hp, x: e.x, y: e.y, dir: e.dir, speed: e.speed ?? null,
        soar: e.soar ?? null,
        soarPhase: e.soarPhase ?? null, soarAt: e.soarAt ?? null, soarSpan: e.soarSpan ?? null,
        soarVec: e.soarVec ?? null, soarLeft: e.soarLeft ?? null,
        soarFlights: e.soarFlights ?? 0, soarDives: e.soarDives ?? 0,
        soarCrashes: e.soarCrashes ?? 0,
        soarCx: e.soarCx ?? null, soarCy: e.soarCy ?? null, soarAng: e.soarAng ?? null,
        soarSpin: e.soarSpin ?? null, soarArc: e.soarArc ?? null,
        soarNextFlip: e.soarNextFlip ?? null, soarMaxAt: e.soarMaxAt ?? null,
        stunUntil: e.stunUntil ?? null, freezeUntil: e.freezeUntil ?? null,
        swingAt: e.swingAt ?? null, hidden: !!e.hidden,
        // 絵（機構の唯一の告知）＝浮いているか・真下の影・予告・落下・硬直
        soaring: !!el?.classList.contains('soaring'),
        rise: !!el?.classList.contains('soar-rise'),
        aim: !!el?.classList.contains('soar-aim'),
        dive: !!el?.classList.contains('soar-dive'),
        recover: !!el?.classList.contains('attack-recover'),
        // `.soaring::before`＝真下の影（＝「浮いている高さ」の手がかり）が出ているか
        shadow: el ? getComputedStyle(el, '::before').content !== 'none' : false,
        vx: el ? el.style.getPropertyValue('--soar-vx').trim() : '',
        vy: el ? el.style.getPropertyValue('--soar-vy').trim() : '',
        riseMsVar: el ? el.style.getPropertyValue('--soar-rise-ms').trim() : '',
        aimMsVar: el ? el.style.getPropertyValue('--soar-aim-ms').trim() : '',
        px: p.x, py: p.y, php: p.hp, pdef: st.player.def, inv: st.player.invincibleUntil,
        reach: edgeDist(e, p.x, p.y),
        // 雷撃弾（＝空からも届く遠隔）が飛んでいるか
        bolts: g.getProjectiles().filter(pr => pr.owner === 'enemy').map(pr => pr.type),
        newStuns, newTones: window.__tones.slice(tone0),
        // ⭐の**長さ**＝気絶の長さと一致していること（印が先に消えると「まだ無抵抗なのに
        // 終わったように見える」）。inline の変数と**計算後の animation-duration** の両方を
        // 見る＝変数を書いただけで CSS が読んでいない場合を弾く。
        stunMarkMs: stuns.length
          ? stuns[stuns.length - 1].style.getPropertyValue('--stun-burst-ms').trim() : '',
        stunMarkAnimMs: stuns.length
          ? getComputedStyle(stuns[stuns.length - 1]).animationDuration : '',
      });
    }
    const e = find();
    return {
      id, samples, movedAt, hitAt,
      end: e && { hp: e.hp, maxHp: e.maxHp, speed: e.speed, soar: e.soar ?? null },
    };
  }, o);
}

/** `soarPhase` の連続区間へ切り分ける（最後の区間は打ち切られている＝complete false）。 */
function soarRuns(samples) {
  const runs = [];
  for (const s of samples) {
    const last = runs[runs.length - 1];
    if (last && last.phase === s.soarPhase) last.samples.push(s);
    else runs.push({ phase: s.soarPhase, samples: [s] });
  }
  return runs.map((r, i) => ({ ...r, complete: i < runs.length - 1 }));
}

// ── ㊳ データ＝U の層2（滞空の綴りと「軸から外れられる／矢が答えになる」算術）──────────
test('㊳ U 嵐の鷲王のデータ＝滞空は矢だけが届き、予告のあいだに軸から外れられる', () => {
  const m = ENEMY_META['U'];
  const c = m.soar;
  const halfOff = ((m.size?.w ?? 1) - 1) / 2;   // 2×2 ∴直交の許容は alignTol + 0.5

  expect(c, 'soar が無い＝U に固有の移動機構が無い').toBeTruthy();
  // 綴りの番人（`resolveSoar` を読む4つの関数が読むキー＝1文字違うと既定値に落ちて黙って動く）
  expect(Object.keys(c).sort()).toEqual([
    'aimMs', 'airMaxMs', 'airMs', 'alignTol', 'centerFollow', 'crashStunMs', 'diveAtk',
    'diveCells', 'diveHitRange', 'diveSpeed', 'flipLapsMax', 'flipLapsMin', 'groundMs',
    'landFreezeMs', 'orbitRange', 'orbitSpeed', 'reachedBy', 'riseMs',
  ]);

  // 他の5体の移動機構を**持っていない**＝型を借りていない
  expect(m.hitAndAway, '間合いの往復（W/G の型）が生きている＝soar の分岐に来ない').toBe(false);
  for (const k of ['combat', 'laneStalk', 'burrowAmbush', 'hide', 'dash', 'coil', 'gaze', 'leap']) {
    expect(m[k], `${k} を持っている＝W/A/N/G/J/O の型を借りている`).toBeUndefined();
  }
  for (const p of m.phases ?? []) {
    for (const k of ['dash', 'coil', 'hide', 'gaze']) {
      expect(p[k], `後半に ${k} が生えている＝他のボスの後半と同じ型`).toBeUndefined();
    }
  }

  // ── 機構の鍵＝弱点そのもの（δ の `split.blockedBy` と同じ作法）────────────────
  expect(m.weakness).toEqual({ type: 'arrow', multiplier: 2 });
  expect(c.reachedBy, '滞空中に届く手段が弱点と違う＝弓が答えにならない（矢を持たない者が詰む）')
    .toBe(m.weakness.type);
  // 弓は D3 の報酬＝D7 では必ず持っている（進行の裏取り＝この機構の前提）
  expect(attackTypesOf(m), 'U の攻撃が鉤爪（近接）＋雷撃弾（遠隔）でない')
    .toEqual(new Set(['sword', 'stone']));
  // 鉤爪は**地上専用の間合い**＝密着でしか届かない（空では `isSoaring` が出さない）
  const claw = m.attacks.find(a => a.type === 'sword');
  expect(claw.range, '鉤爪の間合いが旋回半径より広い＝空から殴られる（滞空の対称が崩れる）')
    .toBeLessThan(c.orbitRange);

  // ── 前半・後半の**両方**で「答えが必ず間に合う」ことを数として確かめる ──────────
  const ph = (m.phases ?? []).find(p => p.soar);
  expect(ph, '後半に soar の差し替えが無い＝相が変わっても滞空が同じ').toBeTruthy();
  // ⚠️ `reachedBy` は**相で変わらない**（＝combat.js `isSoarOutOfReach` が読むのは基底の
  //    `meta.soar` だけ）∴相のキーは基底から `reachedBy` を除いた集合と完全一致させる。
  expect(Object.keys(ph.soar).sort(), '後半の soar のキーが基底と食い違う＝部分指定で既定値に落ちる')
    .toEqual(Object.keys(c).filter(k => k !== 'reachedBy').sort());
  for (const [label, cfg] of [['前半', c], ['後半', ph.soar]]) {
    // ① 予告（`aim`）のあいだに直交へ歩ける距離 > 落ちる軸の幅＝軸から外れれば必ず助かる
    const aimTicks = Math.floor(cfg.aimMs / TICK_MS);
    expect(aimTicks * MOVE_STEP, `${label}は予告のあいだに落ちる軸の外へ出られない＝理不尽`)
      .toBeGreaterThan(cfg.alignTol + halfOff);
    // ② 予告は「初見でも気づける長さ」立っている（＝落ちる直前に出て終わらない）
    expect(aimTicks, `${label}の予告が数 tick で終わる＝告知に気づけない`).toBeGreaterThanOrEqual(4);
    for (const k of ['groundMs', 'riseMs', 'airMs', 'airMaxMs', 'aimMs', 'diveSpeed', 'diveCells',
                     'landFreezeMs', 'crashStunMs', 'orbitRange', 'orbitSpeed', 'alignTol',
                     'flipLapsMin', 'flipLapsMax']) {
      expect(cfg[k], `${label}の ${k} が正の数でない`).toBeGreaterThan(0);
    }
    // centerFollow は「緩い追従」の割合＝0〜1（0＝一切追従しない・1＝毎歩ぴったり乗る）
    expect(cfg.centerFollow, `${label}の centerFollow が0以下＝中心が一切追従しない`).toBeGreaterThan(0);
    expect(cfg.centerFollow, `${label}の centerFollow が1以上＝緩い追従になっていない`).toBeLessThan(1);
    expect(cfg.flipLapsMax, `${label}の flipLapsMax が flipLapsMin 以下＝反転の間隔が不規則にならない`)
      .toBeGreaterThan(cfg.flipLapsMin);
    // airMs は**下限**（DECISIONS 2026-08-30（5）決定5）＝保険の上限（airMaxMs）は必ずそれより長い
    expect(cfg.airMaxMs, `${label}の airMaxMs が airMs（下限）以下＝保険が下限を包摂しない`)
      .toBeGreaterThan(cfg.airMs);
    expect(cfg.airMaxMs % TICK_MS, `${label}の airMaxMs が tick に揃っていない`).toBe(0);
    // ③ 急降下は新しい最大打点を作らない（鉤爪と同じ＝J の crushAtk・O の stampAtk と同じ作法）
    expect(cfg.diveAtk, `${label}の急降下が鉤爪より痛い＝新しい最大打点を作っている`).toBe(m.atk);
    // ④ 地上（＝殴れる窓）が周期の中に必ずある＝「ずっと空に居る案山子」にならない。
    //    ⚠️ sky は**保険の上限（airMaxMs）で測る**＝軸が最後まで揃わない最悪回でも
    //    地上の3倍を超えない、が本当の保証（airMs だけで測ると下限＝最良回しか測れない）。
    const sky = cfg.riseMs + cfg.airMaxMs + cfg.aimMs;
    const ground = cfg.groundMs + cfg.landFreezeMs;
    expect(Math.floor(cfg.groundMs / TICK_MS), `${label}の地上の窓が短すぎる＝剣が1度も届かない`)
      .toBeGreaterThanOrEqual(8);
    expect(sky / ground, `${label}は最悪回（保険の上限）でも空に居る時間が地上の3倍を超える＝弓が無いと戦いにならない`)
      .toBeLessThanOrEqual(3);
    // ⑤ 射抜いた（墜落）ほうが着地硬直より**大きい隙**＝矢を選ぶ理由が数で立っている
    expect(cfg.crashStunMs, `${label}の墜落の気絶が着地硬直以下＝射抜く旨みが無い`)
      .toBeGreaterThan(cfg.landFreezeMs);
    expect(Math.floor(cfg.crashStunMs / TICK_MS), `${label}の気絶が短すぎる＝射抜いても殴れない`)
      .toBeGreaterThanOrEqual(10);
    // ⑥ 旋回は**プレイヤー（1.0）より遅い**＝逃げる側が必ず速い（GUIDE §7-2）
    expect(cfg.orbitSpeed, `${label}の旋回がプレイヤー以上に速い＝軸から逃げ続けられない`)
      .toBeLessThan(1.0);
    // ⑦ 急降下は**旋回半径ぶん落ちられる**（＝軸に乗った相手には必ず届く）
    expect(cfg.diveCells * MOVE_STEP, `${label}の急降下が旋回半径に届かない＝落ちても当たらない`)
      .toBeGreaterThan(cfg.orbitRange);
  }
  // 地上の速さもプレイヤー未満（GUIDE §7-2）
  expect(m.speed, 'U がプレイヤーより速い＝地上でも間合いを切れない').toBeLessThan(1.0);

  // ── 後半＝地上の時間が短く・予告が短く・落下が速い（打点は据え置き）──────────────
  expect(ph.soar.groundMs, '後半の地上の時間が前半以上＝殴れる窓が減っていない')
    .toBeLessThan(c.groundMs);
  expect(ph.soar.airMs, '後半の滞空が前半以上＝周期が締まっていない').toBeLessThan(c.airMs);
  expect(ph.soar.airMaxMs, '後半の保険の上限が前半以上＝周期が締まっていない').toBeLessThan(c.airMaxMs);
  expect(ph.soar.aimMs, '後半の予告が前半以上＝軸を外す猶予が減っていない').toBeLessThan(c.aimMs);
  expect(ph.soar.diveSpeed, '後半の落下が前半以下＝圧が上がっていない').toBeGreaterThan(c.diveSpeed);
  expect(ph.soar.orbitSpeed, '後半の旋回が前半以下＝軸へ回り込むのが速くなっていない')
    .toBeGreaterThan(c.orbitSpeed);
  expect(ph.soar.diveAtk, '後半で急降下の打点が上がった＝速さと窓だけで圧を上げていない')
    .toBe(c.diveAtk);
});

// ── ㊴ 6拍＝ground→rise→air→aim→dive→land の順に回り、絵と長さが soar の数と一致する ────
test('㊴ U は6拍を順に回り、各相の長さ・絵のクラス・SE が soar の数と1対1で対応する', async ({ page }) => {
  const c = ENEMY_META['U'].soar;
  const diveStep = Math.round(c.diveSpeed / MOVE_STEP) * MOVE_STEP;
  // 予告のあいだに**軸に沿って**逃げる（＝急降下が空を切らずに走る＝1 tick ぶんの落下量を測れる）
  // ⚠️ ticks は airMs が**下限**になった分だけ前より要る（旧仕様は揃った瞬間に打ち切っていた
  //    ＝同じ行の湧きは即座に aim へ抜けた。今は最低 airMs（24 tick）は必ず回る＝
  //    0d-3「6体目 U の追い作業」でティック予算を計算し直した）。
  const out = await trackEagle(page, {
    ticks: 75, patch: DIVE_ONLY, moveWhen: { phase: 'aim', dir: 'left', steps: 5 },
  });
  expect(out.error).toBeUndefined();
  const s = out.samples;
  const runs = soarRuns(s);

  // ① 相は必ずこの順に回る（＝どの相からも飛び越しが無い）
  const NEXT = { ground: 'rise', rise: 'air', air: 'aim', aim: 'dive', dive: 'land', land: 'ground' };
  for (let i = 1; i < runs.length; i++) {
    expect(runs[i].phase, `${runs[i - 1].phase} の次が ${runs[i].phase}＝6拍の順序が壊れている`)
      .toBe(NEXT[runs[i - 1].phase]);
  }
  expect(runs.map(r => r.phase), '観測窓で1周（ground→…→land→ground）が回っていない')
    .toContain('land');

  // ①b airMs は**下限**（DECISIONS 2026-08-30（5）決定5）＝旋回で軸が自然に揃うまでの
  //    実測は下限以上になる（旧仕様は揃った瞬間に打ち切っていた＝この下限が効いている証拠）
  const airRun = runs.find(r => r.phase === 'air' && r.complete);
  expect(airRun, '完結した air の窓が観測できていない').toBeTruthy();
  expect(airRun.samples.length, 'air の窓が airMs（下限）より短い＝下限が効いていない')
    .toBeGreaterThanOrEqual(Math.round(c.airMs / TICK_MS));
  expect(airRun.samples.length, 'air の窓が airMaxMs（保険）を超えた＝保険より先に軸が揃う前提が崩れた')
    .toBeLessThanOrEqual(Math.round(c.airMaxMs / TICK_MS));

  // ② 長さは soar の数そのもの（＝CSS も音も測定もこの1つの時計を読む）
  for (const [phase, ms] of [['ground', c.groundMs], ['rise', c.riseMs],
                             ['aim', c.aimMs], ['land', c.landFreezeMs]]) {
    const run = runs.find(r => r.phase === phase && r.complete);
    expect(run, `完結した ${phase} の窓が観測できていない`).toBeTruthy();
    expect(run.samples.length, `${phase} の tick 数が ${ms}ms と合わない`)
      .toBe(Math.round(ms / TICK_MS));
  }
  // 舞い上がる／落ちる回数は1対1（＝空へ逃げて終わり、が無い）
  const last = s[s.length - 1];
  expect(last.soarFlights, '観測窓で1度も舞い上がっていない').toBeGreaterThanOrEqual(1);
  expect(last.soarDives, '舞い上がった回数と着地した回数が合わない')
    .toBe(runs.filter(r => r.phase === 'land').length);

  // ③ 絵＝相と1対1。**`.soaring`（＋真下の影）が出ている窓＝矢しか届かない窓**
  for (const x of s) {
    const sky = x.soarPhase === 'air' || x.soarPhase === 'aim';
    expect(x.soaring, `t${x.t}（${x.soarPhase}）の浮遊の絵が相と合わない＝判定と絵がズレる`).toBe(sky);
    expect(x.shadow, `t${x.t}（${x.soarPhase}）の真下の影が浮遊と一致しない＝高さが読めない`).toBe(sky);
    expect(x.rise, `t${x.t}（${x.soarPhase}）の舞い上がりの絵が相と合わない`).toBe(x.soarPhase === 'rise');
    expect(x.aim, `t${x.t}（${x.soarPhase}）の予告の絵が相と合わない`).toBe(x.soarPhase === 'aim');
    expect(x.dive, `t${x.t}（${x.soarPhase}）の落下の絵が相と合わない`).toBe(x.soarPhase === 'dive');
  }
  // 長さは JS が単一の真実（CSS 側に持たせない）＝要素に書き込まれている
  expect(s.find(x => x.soarPhase === 'rise').riseMsVar, '舞い上がりの長さが要素に書かれていない')
    .toBe(`${c.riseMs}ms`);
  expect(s.find(x => x.soarPhase === 'aim').aimMsVar, '予告の長さが要素に書かれていない')
    .toBe(`${c.aimMs}ms`);

  // ④ 予告は**止まって**出る（＝軸を読む時間）＋落ちる軸が絵に出ている（`--soar-vx/vy`）
  const aimRun = runs.find(r => r.phase === 'aim' && r.complete);
  const vec = aimRun.samples[0].soarVec;
  expect(vec, '予告の時点で落ちる軸が決まっていない＝どこへ落ちるか読めない').toBeTruthy();
  for (const x of aimRun.samples) {
    expect([x.y, x.x], `予告中の t${x.t} に鷲王が動いた＝軸を読む時間が無い`)
      .toEqual([aimRun.samples[0].y, aimRun.samples[0].x]);
    expect(x.soarVec, `予告中の t${x.t} に落ちる軸が変わった＝告知が嘘になる`).toEqual(vec);
    expect([x.vy, x.vx], `t${x.t} の落ちる軸が絵に出ていない`).toEqual([String(vec[0]), String(vec[1])]);
    // 向きも落ちる軸（＝「こちらへ来る」が絵で読める）
    const want = vec[1] !== 0 ? (vec[1] > 0 ? 'right' : 'left') : (vec[0] > 0 ? 'down' : 'up');
    expect(x.dir, `t${x.t} の向きが落ちる軸と違う`).toBe(want);
  }

  // ⑤ 落下は**予告した軸だけ**を、1 tick に diveSpeed ぶん進む（曲がって追って来ない）。
  //    ⚠️ 予告→落下へ移った tick は**まだ動かない**（相を切り替えて終わる）∴前の tick も
  //       落下だったサンプルだけを測る（＝丸ごと1 tick 落ちた回）。
  const dives = s.filter((x, i) => x.soarPhase === 'dive' && s[i - 1]?.soarPhase === 'dive');
  expect(dives.length, '丸ごと落下した tick が観測できていない（予告のあいだに軸へ逃げ切れた？）')
    .toBeGreaterThan(0);
  for (const x of dives) {
    const prev = s[s.indexOf(x) - 1];
    expect(x.soarVec, `落下中の t${x.t} に軸が変わった`).toEqual(vec);
    // 直交方向には1ドットも動かない
    if (vec[1] !== 0) expect(x.y, `落下中の t${x.t} に軸を外れて縦へ動いた`).toBe(prev.y);
    else expect(x.x, `落下中の t${x.t} に軸を外れて横へ動いた`).toBe(prev.x);
    // 相が `dive` のまま終わった tick＝接触も壁も無かった＝1 tick ぶん丸ごと進んでいる
    const moved = Math.abs(vec[1] !== 0 ? x.x - prev.x : x.y - prev.y);
    expect(moved, `t${x.t} の落下量が diveSpeed（${c.diveSpeed}）と合わない`).toBeCloseTo(diveStep, 6);
  }

  // ⑥ 3つの拍は**別の音**で鳴る（画面を見ていなくても「上がった／来る／落ちた」が分かる）
  const riseRun = runs.find(r => r.phase === 'rise');
  const landRun = runs.find(r => r.phase === 'land');
  for (const [label, run] of [['舞い上がり', riseRun], ['予告', aimRun], ['着地', landRun]]) {
    expect(run.samples[0].newTones.length, `${label}の SE が鳴っていない＝拍が音で出ない`)
      .toBeGreaterThan(0);
  }
  const riseTones = JSON.stringify(riseRun.samples[0].newTones);
  const aimTones = JSON.stringify(aimRun.samples[0].newTones);
  expect(aimTones, '舞い上がりと予告の音が同じ＝「上がった」と「落ちて来る」が区別できない')
    .not.toBe(riseTones);
  expect(JSON.stringify(landRun.samples[0].newTones), '予告と着地の音が同じ＝告知と結果が区別できない')
    .not.toBe(aimTones);
});

// ── ㊵ 答え①＝予告のあいだに軸から外れれば急降下は当たらない ───────────────────
test('㊵ 予告のあいだに落ちる軸の外へ出れば急降下は空を切り、HP は減らない', async ({ page }) => {
  const c = ENEMY_META['U'].soar;
  // 予告（5 tick）のあいだに直交へ3歩（1.5セル）＝軸の幅（alignTol 0.6 + 半身 0.5）の外。
  // ⚠️ 鉤爪と雷撃弾は止める（DIVE_ONLY）＝止めないと「無傷だった」が**無敵窓のおかげ**でも成立する。
  // ⚠️ 旋回は本当に円弧を描く（0d-3「6体目 U の追い作業」2026-08-31）＝滞空が長いほど
  //    落ちる軸（水平/垂直）が周回のどこで揃うか実測に依存し「上へ逃げれば必ず垂直へ
  //    外れる」という前提が崩れる。∴`airMs:1` で**下限をほぼ0にし**、`rise` 直後の
  //    まだ角度がほぼ0（同じ行＝水平）のうちに揃わせる＝落ちる軸を水平に固定する。
  // ⚠️ airMs をほぼ0にした分、1周期が短くなった＝ticks を長く取ると2周目の dive まで
  //    観測窓に入り、2周目の（別の）vec と1周目の vec の食い違いで赤くなる。1周目の
  //    land で止まる長さに絞る。
  const out = await trackEagle(page, {
    ticks: 35, debugOff: true, patch: { ...DIVE_ONLY, soar: { ...c, airMs: 1 } },
    moveWhen: { phase: 'aim', dir: 'up', steps: 3 },
  });
  const s = out.samples;
  expect(out.movedAt.length, '予告のあいだに軸の外へ歩き切れていない（窓が足りない）').toBe(3);

  const aimRun = soarRuns(s).find(r => r.phase === 'aim');
  const vec = aimRun.samples[0].soarVec;
  // ① 予告した軸は歩いても**変わらない**（追尾しない）＝外れた側が安全になる根拠
  const dives = s.filter(x => x.soarPhase === 'dive');
  expect(dives.length, '落下が起きていない＝空振りの成否を測れない').toBeGreaterThan(0);
  for (const x of dives) expect(x.soarVec, `落下中の t${x.t} に軸がこちらへ曲がった`).toEqual(vec);

  // ② 前提＝落下の直前に無敵窓が無い（＝減らなかったら本当に当たっていない）
  const first = dives[0], before = s[s.indexOf(first) - 1];
  expect(before.inv, '落下の直前に無敵窓が生きている＝空振りの成否を測れない')
    .toBeLessThanOrEqual(before.now);
  // ③ プレイヤーは軸の外に居る（＝この回は本当に「外れた」）
  const halfOff = 0.5;   // 2×2 ∴直交の許容は alignTol + 0.5
  const off = vec[1] !== 0 ? Math.abs(before.py - (before.y + 0.5))
                           : Math.abs(before.px - (before.x + 0.5));
  expect(off, 'この回はプレイヤーが軸の外に出られていない').toBeGreaterThan(c.alignTol + halfOff);

  // ④ 着地までに HP は1点も減らない（＝答えが機能している）
  const landIdx = s.findIndex(x => x.t > first.t && x.soarPhase === 'land');
  expect(landIdx, '落下が着地で終わっていない').toBeGreaterThan(0);
  for (const x of s.slice(0, landIdx + 1)) {
    expect(x.php, `t${x.t} で HP が減った＝軸から外れたのに当たっている`).toBe(s[0].php);
  }
  // ⑤ 空振りでも着地の音は鳴り、着地硬直（＝反撃の窓）は立つ＝「落ちた＝今なら殴れる」
  expect(s[landIdx].newTones.length, '空振りの着地に SE が無い＝反撃の合図が出ない').toBeGreaterThan(0);
  expect(s[landIdx].freezeUntil, '空振りの着地に硬直が立っていない＝空振りが得にならない')
    .toBe(s[landIdx].now + c.landFreezeMs);
  expect(s[landIdx].soaring, '着地しても浮遊の絵が出たまま＝殴れるのに殴れないように見える').toBe(false);
});

// ── ㊶ 軸に残ると急降下が当たる／着地硬直が反撃の窓（絵も出る）──────────────────
test('㊶ 落ちる軸に立ち止まると急降下に潰され、着地硬直が反撃の窓になる', async ({ page }) => {
  const m = ENEMY_META['U'];
  const c = m.soar;
  // 一歩も動かない＝軸に乗ったまま。鉤爪も雷撃弾も止める＝HP が減ったら急降下以外にありえない。
  const out = await trackEagle(page, { ticks: 100, debugOff: true, patch: DIVE_ONLY });
  const s = out.samples;

  // 当たった tick＝落下の途中で HP が減った tick
  const hitIdx = s.findIndex((x, i) => i > 0 && x.php < s[i - 1].php);
  expect(hitIdx, '急降下が当たっていない（HP が減っていない）').toBeGreaterThan(0);
  const hit = s[hitIdx], before = s[hitIdx - 1];
  expect(before.soarPhase, '当たった tick の直前が落下／予告でない＝急降下以外のダメージ')
    .toMatch(/dive|aim/);
  // 前提＝直前に無敵窓が無い／それまで HP は減っていない
  expect(before.inv, '当たる直前に無敵窓が生きている＝ダメージの有無が測れない')
    .toBeLessThanOrEqual(before.now);
  expect(s.slice(0, hitIdx).every(x => x.php === s[0].php),
    '当たる前に HP が減っている＝急降下以外のダメージが混ざっている').toBe(true);

  // ① 打点＝diveAtk − 防御（盾では防げない＝答えは「軸から外れる」だけ）
  expect(hit.php, '急降下の打点が diveAtk と合わない').toBe(before.php - (c.diveAtk - hit.pdef));
  expect(hit.inv, '被弾後の無敵窓が立っていない＝ダメージ経路が takeDamage を通っていない')
    .toBeGreaterThan(hit.now);
  // ② 当たった tick でそのまま着地する（＝落下は当たったらそこで終わる）
  expect(hit.soarPhase, '当たっても落下が続いている＝1回の急降下で2度当たりうる').toBe('land');
  expect(hit.soarDives, '着地の回数が増えていない').toBe(before.soarDives + 1);

  // ③ 着地硬直＝**動かない・浮遊が解ける・硬直の絵が出る**（殴り返す窓）
  const landRun = soarRuns(s).find(r => r.phase === 'land');
  expect(landRun.samples.length, '着地硬直の窓が観測できていない').toBeGreaterThan(1);
  for (const f of landRun.samples) {
    expect([f.y, f.x], `硬直中の t${f.t} に鷲王が動いた＝反撃の窓が無い`)
      .toEqual([landRun.samples[0].y, landRun.samples[0].x]);
    expect(f.recover, `硬直中の t${f.t} に硬直の絵が出ていない＝窓が画面に出ない`).toBe(true);
    expect(f.soaring, `硬直中の t${f.t} に浮遊の絵が残っている＝殴れる窓が読めない`).toBe(false);
  }
  // ④ 着地の直後は**地上**＝次に舞い上がるまで groundMs ある（着地して即また飛ばない）。
  //    ⚠️ ここを書かないと着地から直接 `rise` へ飛ぶ実装でもテストが通る（2026-08-30 の実バグ）。
  const after = s.find(x => x.t > landRun.samples[landRun.samples.length - 1].t);
  expect(after.soarPhase, '着地硬直の次が地上でない＝殴れる窓が消えている').toBe('ground');
  expect(after.soarAt, '地上の窓が groundMs で立っていない').toBe(after.now + c.groundMs);
  // 地上へ戻った tick で硬直は明けている＝**この窓は本当に殴れる**（絵も硬直から戻る）
  expect(after.freezeUntil ?? 0, '地上へ戻っても硬直が残っている＝反撃の窓が数より短い')
    .toBeLessThanOrEqual(after.now);
  expect(after.recover, '地上へ戻っても硬直の絵が出たまま＝窓の終わりが読めない').toBe(false);
  // 次に舞い上がるのは地上の窓を使い切ってから（＝着地して即また飛ばない）
  const nextRise = s.find(x => x.t > after.t && x.soarPhase === 'rise');
  if (nextRise) {
    expect(nextRise.now, '地上の窓を使い切る前に舞い上がった＝殴れる窓が予告なく消える')
      .toBeGreaterThanOrEqual(after.soarAt);
  }
});

// ── ㊷ 答え②＝滞空中は剣が届かず矢だけが刺さる／刺さると墜落して大きな隙になる ──────────
test('㊷ 滞空中の鷲王には剣が届かず、矢だけが刺さって墜落し気絶する', async ({ page }) => {
  const m = ENEMY_META['U'];
  const c = m.soar;
  // 予告（`aim`＝滞空の窓・5 tick）のあいだに剣→矢の順で当てる（相で待つ＝tick 固定にしない）。
  const out = await trackEagle(page, {
    ticks: 110, debugOff: true, patch: DIVE_ONLY,
    hits: [{ phase: 'aim', dmg: 4, atkType: 'sword' }, { phase: 'aim', dmg: 4, atkType: 'arrow' }],
  });
  const s = out.samples;
  expect(out.hitAt.length, '滞空中に剣と矢の2発を当てられていない').toBe(2);
  const [sword, arrow] = out.hitAt;

  // ① 剣は**1点も通らない**（滞空中は届かない）＝空振りの SE が鳴る
  expect(sword.after, '滞空中の鷲王に剣が通った＝機構が効いていない').toBe(sword.before);
  const swordTick = s.find(x => x.t === sword.t);
  expect(swordTick.newTones.length, '剣が届かなかった合図（SE）が鳴っていない＝ただの無反応に見える')
    .toBeGreaterThan(0);
  expect(swordTick.soaring, '剣を当てた tick に浮遊していない＝滞空中の判定を測れていない').toBe(true);

  // ② 矢は刺さる＝弱点の倍率が乗る（矢 ×2 − 防御）
  expect(arrow.before - arrow.after, '滞空中の矢に弱点の倍率が乗っていない')
    .toBe(4 * m.weakness.multiplier - m.def);
  const arrowTick = s.find(x => x.t === arrow.t);
  expect(JSON.stringify(arrowTick.newTones), '剣が届かない音と矢が刺さる音が同じ＝耳で区別できない')
    .not.toBe(JSON.stringify(swordTick.newTones));

  // ③ 刺さると**墜落**＝気絶（`crashStunMs`）が立ち、浮遊の絵が解け、⭐が出る
  expect(arrowTick.soarCrashes, '矢が刺さっても墜落していない').toBe(1);
  expect(arrowTick.soarPhase, '墜落したのに空の相のまま＝宙吊り').toBe('ground');
  expect(arrowTick.soaring, '墜落したのに浮遊の絵が出たまま＝殴れるのに殴れないように見える').toBe(false);
  expect(arrowTick.stunUntil, '墜落の気絶が crashStunMs で立っていない')
    .toBe(arrow.now + c.crashStunMs);
  expect(arrowTick.newStuns, '墜落の⭐（気絶の印）が出ていない＝止まっている理由が読めない')
    .toBeGreaterThan(0);
  // ③-b 印は**気絶が明けるまで**出ている（実画面で見つけた欠陥＝固定 1.5s の印が
  //      1800ms の気絶より 300ms 早く消え、まだ無抵抗なのに終わったように見えた）
  expect(arrowTick.stunMarkMs, '⭐の長さが気絶の長さで書かれていない')
    .toBe(`${c.crashStunMs}ms`);
  expect(arrowTick.stunMarkAnimMs, '⭐のアニメの長さが気絶の長さになっていない＝印が先に消える')
    .toBe(`${c.crashStunMs / 1000}s`);
  // ④ 射抜いた急降下は**来ない**（＝予告を矢で消せる＝弓が答えである理由）
  expect(arrowTick.soarDives, '射抜いたのに急降下が成立した').toBe(0);
  const stunned = s.filter(x => x.t > arrow.t && x.now < arrowTick.stunUntil);
  expect(stunned.length, '気絶の窓が観測できていない').toBeGreaterThan(5);
  for (const x of stunned) {
    expect([x.y, x.x], `気絶中の t${x.t} に鷲王が動いた＝大きな隙になっていない`)
      .toEqual([arrowTick.y, arrowTick.x]);
    expect(x.soarPhase, `気絶中の t${x.t} に空へ戻った`).toBe('ground');
    expect(x.php, `気絶中の t${x.t} にプレイヤーの HP が減った＝隙になっていない`).toBe(arrowTick.php);
  }
  // ⑤ 地上の時計は**気絶が明けてから**数える＝立ち上がった瞬間にまた舞い上がらない
  expect(arrowTick.soarAt, '地上の窓が気絶明けから数えられていない＝反撃の窓が気絶ぶんで終わる')
    .toBe(arrowTick.stunUntil + c.groundMs);
  const nextRise = s.find(x => x.t > arrow.t && x.soarPhase === 'rise');
  expect(nextRise, '墜落のあと1度も舞い上がらない＝周期が止まった').toBeTruthy();
  expect(nextRise.now, '墜落から次の滞空までが「気絶＋地上」より短い')
    .toBeGreaterThanOrEqual(arrowTick.stunUntil + c.groundMs);
});

// ── ㊸ 空では鉤爪の間合いに入らず旋回は本当に円弧を描いて回る／雷撃弾だけが空から届く ─────
// ⚠️ 「滞空中は近接を出さない」ゲート（enemy-ai.js `isSoaring(e,meta) && MELEE_ATTACK_TYPES`）
//    そのものは**実プレイでは踏めない**（旋回の許容ずれ 1.1 < 鉤爪の直交許容 SWORD_PERP+0.5
//    ＝1.3 で、位置は 0.5 刻み∴間の帯に立てない）＝二重の安全網。∴ここで測るのは
//    **本物の保証**＝「空に居るあいだ鉤爪の間合い（range 1.1）に自分から入らない」。
// ⚠️ 2026-08-31 ユーザー実プレイ指摘＝「90度に曲がることではなく、本当に円弧を描くように
//    回転する」で「四角い軌道（DECISIONS 2026-08-30（5）決定6）」は失効＝連続角度で回る
//    形（DECISIONS 2026-08-30（7）＝J の `coil` と同じ仕組み）に置き換えた。ここからは
//    「中心（`_soarCx/Cy`）から見た距離が旋回半径のまわりに留まる（＝本当に円を描く）・
//    向きが `soarSpin`（±1）で不規則な周期で反転する」を測る。
test('㊸ 滞空中は鉤爪を出さず、旋回は本当に円弧を描いて回り、雷撃弾だけが空から届く', async ({ page }) => {
  // 軸を外した湧き（1,3）＝旋回（`air`）の窓が数 tick 続く＝空からの遠隔を捕まえられる。
  // `alignTol:-1` で軸合わせを常に失敗させ、`airMaxMs`（保険）が尽きるまで確実に旋回を
  // 観測できるようにする（乱数・実プレイの軌道に依存しない＝㊼と同じ作法）。
  const c = ENEMY_META['U'].soar;
  const patch = { ...BOLT_FAST, soar: { ...c, alignTol: -1 } };
  const out = await trackEagle(page, {
    ticks: 120, spawn: U_OFF_SPAWN, patch,
  });
  const s = out.samples;
  const sky = s.filter(x => x.soaring);
  const ground = s.filter(x => x.soarPhase === 'ground');
  expect(sky.length, '滞空の窓が観測できていない').toBeGreaterThan(2);
  expect(ground.length, '地上の窓が観測できていない').toBeGreaterThan(2);

  // ① 滞空中は**1 tick も**鉤爪の予告が立たない＝空から殴られない（＝一方的な有利にならない）
  for (const x of sky) {
    expect(x.swingAt, `滞空中の t${x.t} に鉤爪の予告が立った＝空から殴られる`).toBeNull();
  }

  // 旋回の状態（`_soarCx/Cy/soarSpin/soarArc`）が立っている air サンプルだけを見る
  // （歩幅の溜めが1.0に達する最初の一歩まで未初期化＝正常）。
  const airSamples = s.filter(x => x.soarPhase === 'air' && x.soarCx != null);
  expect(airSamples.length, '旋回の状態が1度も観測できていない').toBeGreaterThan(5);

  // ② **中心からの距離**が旋回半径（`orbitRange`）のまわりに留まる＝本当に円を描いている
  //    （四角い軌道の名残りの直線飛行や、壁まで一直線に離れる穴〈実測で見つけた〉が
  //    無いことの数値的な証拠）。格子刻み（0.5セル）のノイズぶん幅を持たせる。
  for (const x of airSamples) {
    const dist = Math.hypot(x.x + 0.5 - x.soarCx, x.y + 0.5 - x.soarCy);   // 2×2 ∴中心は+0.5
    expect(dist, `旋回中の t${x.t} の中心からの距離が旋回半径から大きく外れた（${dist.toFixed(2)}）`)
      .toBeLessThanOrEqual(c.orbitRange + 1.2);
  }
  // 距離が1点に固定されない（＝実際に円周上を動いている・棒立ちではない）
  const dists = airSamples.map(x => Math.hypot(x.x + 0.5 - x.soarCx, x.y + 0.5 - x.soarCy));
  expect(Math.max(...dists) - Math.min(...dists), '中心からの距離が一切変わらない＝動いていない')
    .toBeGreaterThan(0.5);

  // ③ 観測は整数／有限（乱数っぽく見えても実は決定的＝テストが揺れない）。
  //    soarSpin は常に ±1・soarArc は0以上・soarNextFlip は有限の正数
  //    （`e.id` が `"行,列"` の文字列で四則演算に使うと NaN になる実バグを2026-08-31に
  //    見つけて直した＝ここで NaN に戻っていないかを固定する）。
  for (const x of airSamples) {
    expect([1, -1], `t${x.t} の soarSpin が ±1 でない`).toContain(x.soarSpin);
    expect(x.soarArc, `t${x.t} の soarArc が0以上の有限値でない`).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(x.soarNextFlip) && x.soarNextFlip > 0,
      `t${x.t} の soarNextFlip が有限の正数でない（id を数値扱いした NaN の再発）`).toBe(true);
  }
  // ④ 向きは不規則な周期で反転する（DECISIONS 2026-08-30（7）＝乱数は使わないが
  //    「四角い軌道」のような単調な等間隔にはしない）＝観測窓の中で最低1回は反転する。
  let flips = 0;
  for (let i = 1; i < airSamples.length; i++) {
    if (airSamples[i].soarSpin !== airSamples[i - 1].soarSpin) flips++;
  }
  expect(flips, '旋回中に1度も反転していない＝向きが固定されたまま').toBeGreaterThanOrEqual(1);

  // ⑤ 雷撃弾（遠隔）は空からも飛ぶ＝「空に居るあいだ何も起きない」にならない
  expect(sky.some(x => x.bolts.includes('stone')),
    '滞空中に雷撃弾が1発も飛ばない＝空に居るあいだ無害な案山子').toBe(true);
});

// ── ㊾ 旋回の中心はプレイヤーへ「緩く」追従する（きっちり固定しない）─────────────────
// ユーザー確定（2026-08-31）＝「きっちりプレーヤーに追従させず、うごいたら動いた方向に
// 少しずつ中心軸を移動させる」。中心が①動かないプレイヤーには落ち着いて止まり、
// ②動くプレイヤーには即座に追いつかず、時間をかけて差を詰めることを両方確かめる。
test('㊾ 旋回の中心はプレイヤーを瞬時に追わず、時間をかけて差を詰める', async ({ page }) => {
  const c = ENEMY_META['U'].soar;
  const out = await trackEagle(page, {
    ticks: 90, patch: { soar: { ...c, alignTol: -1 } },
    moveWhen: { phase: 'air', dir: 'right', steps: 12 },
  });
  const s = out.samples;
  const air = s.filter(x => x.soarPhase === 'air' && x.soarCx != null);
  expect(air.length, '旋回の状態が観測できていない').toBeGreaterThan(10);
  expect(out.movedAt.length, 'プレイヤーが動いた記録が無い').toBeGreaterThan(0);

  // ① 滞空の開始時点＝旋回の中心はプレイヤーの**元の位置**から始まる（`resetSoarOrbit` が
  //    入った瞬間にそこへ揃える）。`moveWhen` は air の最初の tick から動かし始めるため
  //    「動く前に何 tick か静定する窓」は無い＝開始直後の値で確かめる。
  const startPx = s[0].px;
  expect(air[0].soarCx, '滞空開始時点で中心がプレイヤーの元位置から始まっていない')
    .toBeCloseTo(startPx, 0);

  // ② プレイヤーが動いた直後、中心はまだプレイヤーの新しい位置に**きっちり**は乗らない
  //    （＝瞬時に追従しない）。差がゼロにならないことだけを見る＝丸めの偶然一致を避ける。
  const justAfterMove = air.find(x => x.t === out.movedAt[0] + 1);
  expect(justAfterMove, '動いた直後の旋回サンプルが観測できていない').toBeTruthy();
  const playerJustAfter = s.find(x => x.t === justAfterMove.t)?.px;
  expect(Math.abs(justAfterMove.soarCx - playerJustAfter),
    '動いた直後に中心がプレイヤーへ完全に飛んだ＝きっちり追従してしまっている')
    .toBeGreaterThan(0.01);

  // ③ 時間が経つと中心は徐々にプレイヤー側へ近づく（差が単調に縮む・瞬間移動ではない）
  const after = air.filter(x => x.t > out.movedAt[out.movedAt.length - 1]);
  expect(after.length, '追いつく過程の窓が観測できていない').toBeGreaterThan(3);
  const gaps = after.map(x => Math.abs(x.px - x.soarCx));
  expect(gaps[0], '差が最初から詰まっている＝緩い追従になっていない').toBeGreaterThan(0);
  expect(gaps[gaps.length - 1], '時間が経っても差が縮んでいない＝追従していない')
    .toBeLessThan(gaps[0]);
});


// ── ㊹ HP 半分で「地上の時間が短く・落下が速く」変わる（層1 の `phases[].soar` が出荷データで効く）──
test('㊹ HP 半分で地上の窓と予告が短くなり、急降下が速くなる', async ({ page }) => {
  const m = ENEMY_META['U'];
  const c = m.soar;
  const ph = m.phases.find(p => p.soar);
  // dealDamage は防御を引く∴+def して渡す（HP をちょうど 50% に落とす）。
  // ⚠️ 種別は 'sword'＝**地上に居る t2** に当てる（滞空中は矢しか通らない∴相を選ぶ）。
  const out = await trackEagle(page, {
    ticks: 60, patch: DIVE_ONLY, dropAt: 2, dmg: Math.ceil(m.hp / 2) + m.def, dmgType: 'sword',
    moveWhen: { phase: 'aim', dir: 'left', steps: 4 },
  });
  const s = out.samples;
  expect(s[1].soarPhase, '相を落とす tick に地上に居ない＝剣が通らない').toBe('ground');
  expect(s[1].hp / m.hp, 'HP が 50% 以下に落ちていない＝相の条件を満たしていない')
    .toBeLessThanOrEqual(0.5);

  // 差し替えが実体（`_soar`）に載っている＝`resolveSoar` が読む側が変わった
  expect(out.end.soar, '後半の soar が実体に載っていない').toEqual(ph.soar);
  expect(out.end.speed, '後半の速さ倍率が載っていない').toBeCloseTo(m.speed * ph.speedMultiplier, 6);

  const runs = soarRuns(s);
  // ① 走っている相の長さは**入った瞬間に固定**＝相が変わっても今の窓は伸び縮みしない
  const firstGround = runs[0];
  expect(firstGround.phase, '最初の相が地上でない').toBe('ground');
  expect(firstGround.samples.length, '相が変わった瞬間に走っていた地上の窓が縮んだ＝latch が効いていない')
    .toBe(Math.round(c.groundMs / TICK_MS));
  // ② 次の周からは後半の数で立つ（地上・予告・着地硬直がすべて短い）
  for (const [phase, ms] of [['ground', ph.soar.groundMs], ['rise', ph.soar.riseMs],
                             ['aim', ph.soar.aimMs], ['land', ph.soar.landFreezeMs]]) {
    const run = runs.slice(1).find(r => r.phase === phase && r.complete);
    expect(run, `後半に入ってから完結した ${phase} の窓が観測できていない`).toBeTruthy();
    expect(run.samples.length, `後半の ${phase} の tick 数が ${ms}ms と合わない`)
      .toBe(Math.round(ms / TICK_MS));
    expect(run.samples.length, `後半の ${phase} が前半より長い／同じ＝周期が締まっていない`)
      .toBeLessThan(Math.round((phase === 'land' ? c.landFreezeMs : c[`${phase}Ms`]) / TICK_MS));
  }
  // ③ 落下は前半より速い（1 tick に進むセル数が増える＝`diveSpeed` が実体に効いている）
  const diveStep2 = Math.round(ph.soar.diveSpeed / MOVE_STEP) * MOVE_STEP;
  expect(diveStep2, '後半の落下量が前半と同じ＝データ上は速くても実測は同じ')
    .toBeGreaterThan(Math.round(c.diveSpeed / MOVE_STEP) * MOVE_STEP);
  // ⚠️ 予告→落下へ移った tick は動かない（㊴ ⑤ と同じ）∴丸ごと落ちた tick だけ測る
  const dives = s.filter((x, i) => x.soarPhase === 'dive' && s[i - 1]?.soarPhase === 'dive');
  expect(dives.length, '後半で丸ごと落下した tick が観測できていない').toBeGreaterThan(0);
  for (const x of dives) {
    const prev = s[s.indexOf(x) - 1];
    const vec = x.soarVec;
    const moved = Math.abs(vec[1] !== 0 ? x.x - prev.x : x.y - prev.y);
    expect(moved, `後半の t${x.t} の落下量が後半の diveSpeed と合わない`).toBeCloseTo(diveStep2, 6);
  }
  // ④ 気絶（射抜いたときの隙）は後半で短くなるが、**着地硬直より大きい**関係は崩れない
  expect(ph.soar.crashStunMs, '後半の墜落の気絶が着地硬直以下＝射抜く旨みが消える')
    .toBeGreaterThan(ph.soar.landFreezeMs);
});

// ── ㊺ 導出＝U の機構は G・W・A・N・J・O のどれとも重ならない（手書きの表で数えない）─────
test('㊺ U の移動機構は G・W・A・N・J・O のどれとも重ならない', () => {
  const u = mechanismsOf(ENEMY_META['U']);
  const others = ['G', 'W', 'A', 'N', 'J', 'O'].map(k => mechanismsOf(ENEMY_META[k]));
  expect(u.has('soar'), 'U が移動機構（soar）を持っていない').toBe(true);
  expect([...u].filter(k => others.every(x => !x.has(k))).length,
    'U に G・W・A・N・J・O が持たない機構が1つも無い＝7体目の型になっていない').toBeGreaterThan(0);
  expect(others.some(x => x.has('soar')),
    'G・W・A・N・J・O のどれかが滞空を持っている＝U の固有機構ではない').toBe(false);
  const users = Object.entries(ENEMY_META).filter(([, m]) => m.soar).map(([k]) => k);
  expect(users, '滞空を持つ敵が U 以外にも居る（設計が重複した）').toEqual(['U']);
  // 跳躍（leap）との**別物**の番人＝跳躍は滞空中「全ての攻撃が無効（hidden）」＝U とは違う。
  // ここが同じになった瞬間に U の弱点（矢）は機構ごと死ぬ（設計の分かれ道＝DECISIONS）。
  expect(ENEMY_META['U'].hide, 'U に hide が生えた＝滞空が「無敵の窓」に化けている').toBeUndefined();
});

// ── ㊻ 検証ステージの幾何（GUIDE §4-3）───────────────────────────────
test('㊻ bal_storm_eagle は 10×12・外周は通路以外すべて壁・U が (4,7) に1体だけ・水なし', () => {
  const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
  const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  const sd = MAP.layers[TEST_LAYER].stages[stageKey('bal_storm_eagle')];
  expect(sd.rows).toBe(10);
  expect(sd.cols).toBe(12);
  // 遮蔽ゼロ＝急降下は直線∴地形で止まると機構の測定が地形の話になる
  expect(Object.keys(sd.bgTiles ?? {}), '別地形が入った＝滞空の測定が地形のせいになる').toEqual([]);

  const at = (r, c) => sd.tiles[r][c];
  const eagles = [];
  for (let r = 0; r < sd.rows; r++) {
    for (let c = 0; c < sd.cols; c++) {
      const ch = at(r, c);
      if (ch === TILE.STORM_EAGLE) { eagles.push([r, c]); continue; }
      if (r === 6 && c === 1) continue;              // 看板 i（南の通路の脇）
      const edge = r === 0 || c === 0 || r === sd.rows - 1 || c === sd.cols - 1;
      const want = edge && !isArenaDoor(r, c, sd.cols) ? TILE.WALL : TILE.FLOOR;
      expect(at(r, c), `(${r},${c}) が想定と違う`).toBe(want);
    }
  }
  expect(eagles, 'U が1体だけ (4,7) に居る前提が崩れた').toEqual([[U_ROW, U_COL]]);

  // 測る湧き (4,4) から**軸に沿って西へ落ちられる道**が空いている＝㊴（落下量）の前提。
  // 急降下は diveCells ぶん走る∴少なくとも旋回半径ぶんは床が続いていること。
  const needCells = Math.ceil(ENEMY_META['U'].soar.orbitRange);
  for (let c = Math.max(1, U_PL_COL - needCells); c < U_COL; c++) {
    expect(at(U_PL_ROW, c), `(${U_PL_ROW},${c}) が床でない＝落ちる軸が塞がっている`).toBe(TILE.FLOOR);
  }
  // 予告のあいだに**直交へ抜ける道**（北へ3歩＝1.5セル）も空いている＝㊵（軸から外れる）の前提
  for (let r = U_PL_ROW - 3; r <= U_PL_ROW; r++) {
    expect(at(r, U_PL_COL), `(${r},${U_PL_COL}) が床でない＝軸から外れる道が塞がっている`)
      .toBe(TILE.FLOOR);
  }
  // 軸を外した湧き (1,3)＝㊸（空からの遠隔）の前提
  expect(at(U_OFF_SPAWN.row, U_OFF_SPAWN.col), '軸を外した湧きが床でない').toBe(TILE.FLOOR);
});

// ── ㊼ airMs は下限・軸が最後まで揃わなければ保険（airMaxMs）で必ず落ちる ─────────────
// 0d-3「6体目 U の追い作業」（2026-08-30・決定5）＝「最低これだけ回る」に意味が変わった
// airMs の**もう半分**＝揃わなかった回の保証（宙吊り防止）を測る。`alignTol: -1` を注入すると
// `soarDiveVec` は `off > alignTol + halfOff` が常に真になり**絶対に揃わない**（Math.abs は
// 0 未満を返さない）＝保険の経路だけを確実に踏める（乱数・実プレイの軌道に依存しない）。
test('㊼ 軸が最後まで揃わなければ airMaxMs で強制的に落ちる（宙吊り防止）', async ({ page }) => {
  const c = ENEMY_META['U'].soar;
  const out = await trackEagle(page, {
    ticks: 70, patch: { soar: { ...c, alignTol: -1 } },
  });
  const s = out.samples;
  const air = soarRuns(s).find(r => r.phase === 'air' && r.complete);
  expect(air, '完結した air の窓が観測できていない').toBeTruthy();
  // 保険の上限ぴったりで抜ける（`alignTol:-1` は自然な揃いを一切許さない∴強制のみが理由）
  expect(air.samples.length, 'air の窓が airMaxMs（保険の上限）と合わない＝保険が効いていない')
    .toBe(Math.round(c.airMaxMs / TICK_MS));
  // 抜けた先（aim）の軸は `soarAnyVec`（成分の大きい軸）＝null ではない＝必ず落ちる
  const aim = soarRuns(s).find(r => r.phase === 'aim' && r.complete);
  expect(aim, '保険で抜けたのに aim（急降下の予告）へ移っていない').toBeTruthy();
  expect(aim.samples[0].soarVec, '保険で抜けたのに落ちる軸が決まっていない＝宙吊りのまま')
    .toBeTruthy();
  // 着地まで一周する＝機構が本当に止まらない（宙吊り防止の目的そのもの）
  expect(soarRuns(s).some(r => r.phase === 'land'), '保険で抜けても着地まで進んでいない').toBe(true);
});

// ── ㊽ 弓は画面内に飛んでいる自分の矢が同時2本まで（3本目は1本目が消えてから）─────────
// DECISIONS 2026-08-30（5）決定2＝弓は piercing かつクールダウン無し∴連打の唯一の制約が
// 矢の残数だった（U の直線移動と重なり過剰ダメージ）。ブーメラン（同時1枚）と同じ作法。
test('㊽ 弓は画面内2本まで（3本目は1本目が消えてから）', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // 隅（1,1）から右へ＝広い開けた床（bal_storm_eagle・鷲王は行が違うので射線に入らない）。
  await gotoFrozen(page, previewUrl('bal_storm_eagle', 1, 1,
    { ps_hearts: '10', ps_sword: '0', ps_shield: '0', ps_armor: '0', ps_bow: '1' }));
  const out = await page.evaluate(() => {
    const g = window.__game;
    g.movePlayer('right'); g.step(1);    // 右向き＝壁に当たらない開けた向き
    const arrows = () => g.getProjectiles().filter(p => p.type === 'arrow' && p.owner === 'player');
    g.useSubItem(); g.step(1);           // 1本目
    const afterFirst = arrows().length;
    const countAfterFirst = g.getPlayer().subItems.bow.count;
    g.useSubItem(); g.step(1);           // 2本目
    const afterSecond = arrows().length;
    const msgEl = document.getElementById('msg-bar');
    const msgBefore = { text: msgEl.textContent, hidden: msgEl.classList.contains('hidden') };
    g.useSubItem(); g.step(1);           // 3本目（拒否されるはず＝矢を消費しない）
    const afterThird = arrows().length;
    const countAfterThird = g.getPlayer().subItems.bow.count;
    const msgAfter = { text: msgEl.textContent, hidden: msgEl.classList.contains('hidden') };
    return { afterFirst, afterSecond, afterThird, countAfterFirst, countAfterThird, msgBefore, msgAfter };
  });
  expect(errors).toEqual([]);
  expect(out.afterFirst, '1本目が飛んでいない').toBe(1);
  expect(out.afterSecond, '2本目が飛んでいない＝同時2本まで許されていない').toBe(2);
  expect(out.afterThird, '3本目が出た＝同時2本の上限が効いていない').toBe(2);
  // 拒否された3本目は矢を消費していない（残数が減っていない）
  expect(out.countAfterThird, '拒否された3本目で矢を消費した').toBe(out.countAfterFirst - 1);
  // 🔴 2026-09-21 ユーザー報告＝上限に当たったときの断り文（旧「矢が飛んでいる！」）は出さない。
  //    連打が普通の撃ち方＝3本目は戦闘中ずっと来る∴文を出すと帯が点きっぱなしになる（爆弾は
  //    上限も断り文も無い）。告知は「矢が2本飛んでいる画面」そのもの＝設計の記録どおり文は不要。
  //    ⚠️ この本は `gotoFrozen`（`setInterval` を潰すだけ）∴ポーズ扱いではない＝`pulse()` は
  //    保留されず `#msg-bar` に直に出る（保留されるのは会話／店／ポーズ中だけ）。
  expect(out.msgAfter.hidden, '上限で断るときに帯が点いた（黙って断るべき）').toBe(true);
  expect(out.msgAfter.text, '上限で断るときに文が出た').toBe(out.msgBefore.text);

  // 1本が画面外まで飛んで消えるのを待ってから3本目を撃つ→今度は通る
  const out2 = await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 40; i++) g.step(1);   // 貫通∴壁か画面外まで進んで消える
    const remaining = g.getProjectiles().filter(p => p.type === 'arrow' && p.owner === 'player').length;
    g.useSubItem();
    const after = g.getProjectiles().filter(p => p.type === 'arrow' && p.owner === 'player').length;
    return { remaining, after };
  });
  expect(out2.remaining, '40 tick 後も矢が画面に残っている＝消える前提が崩れている').toBeLessThan(2);
  expect(out2.after, '1本消えたのに3本目が出ない＝上限が「同時」ではなく別の何かで縛られている')
    .toBe(out2.remaining + 1);
});

// ══════════════════════════════════════════════════════════════════════════════
// 7体目＝G 岩のゴーレム（2×2・D1 のボス）＝新機構 `momentum`（慣性）
// ══════════════════════════════════════════════════════════════════════════════
// 0d-3（2026-08-31）。層2 の設計＝**プレイヤーの「位置」ではなく「プレイヤーへ向かう速度」を
// 積む**＝止まれない・曲がれない重量級。
//   ・`accel` を毎 tick 速度へ足し、`friction` で減衰する∴終端速度＝`accel / friction`
//     （素の設定ではこれが `maxSpeed` と一致する）。上限へ乗るまで 10 tick 以上かかる＝
//     **止まるのにも曲がるのにも時間がかかる**（＝プレイヤーは横へ退いて空振りを作れる）。
//   ・`heavySpeed` は**1つのしきい値が3つの意味を持つ**＝①体当たりが成立する ②壁に当たると
//     自壊して長く気絶する ③土煙が出て地響きが鳴る。∴プレイヤーが覚える規則は1本
//     （「土煙が出た岩は避けて壁へ誘う」）。
//   ・答え＝**壁が武器になる**（ただし突進猪と違い敵は自分から壁へ走らない＝プレイヤーが
//     誘導して初めて起きる）／密着したら弱点（剣 × 攻撃硬直の窓 ×3）で削る。
//   ・後半（HP 50% 以下）＝`phases[].momentum` で**さらに止まれない**（最高速 ×1.4・
//     崩れている時間は短い 1800→1320ms）。打点（`ramAtk`）は据え置き。
//
// ⚠️ 状態機械を持たない（状態＝速度ベクトル1つだけ）∴0d-2.7（跳躍）・0d-3（滞空）で踏んだ
//    「相を忘れて宙吊り」の欠陥が構造的に存在しない＝その代わりに測るのは**連続量**
//    （速さ・向き・位置の履歴）。
// ⚠️ 測る湧きは (4,1)＝G (4,7) と**同じ行の西端**＝助走 6 セルと西の壁が1直線に並ぶ
//    （＝「加速する」「体当たりする」「誘い込むと壁で崩れる」を同じ舞台で測れる）。
// ⚠️ 壁激突を測る回だけ北の壁ぎわ (1,7)＝**G の真上**から測る（プレイヤーが横へ退いた後、
//    残りの助走が短い側の壁＝主軸が変わる前に必ず当たる）。
// ⚠️ 剣（range 1.2・予告 600ms）と岩（range 6）は `RAM_ONLY` で止める＝止めないと攻撃硬直が
//    惰性を捨てて加速が測れない／体当たりの打点が剣のダメージと混ざる
//    （U の `DIVE_ONLY`・O の `ROCK_ONLY`・J の `CRUSH_ONLY` と同型の罠）。
const G_ROW = 4, G_COL = 7;            // 2×2 ∴ rows 4-5 / cols 7-8 を占める
const G_PL_ROW = 4, G_PL_COL = 1;      // 測る湧き（同じ行の西端＝助走と壁が1直線）
const G_WALL_SPAWN = { row: 1, col: 7 };   // 北の壁ぎわ＝G の真上（誘い込みを測る回）
// D1 のボス直前の想定装備（`node scripts/audit-balance.mjs` の「D1 森の遺跡 / ボス直前」＝
// ハート3・木の剣ティア0・盾ティア0・布の服ティア0）。サブ道具は1つも無い＝**D1 の世界には
// 道具が無い**∴この敵の答えは道具ではなく「間」と「地形」（0d-2.11 (A) の弱点設計そのもの）。
const D1_PRE = { ps_hearts: '3', ps_sword: '0', ps_shield: '0', ps_armor: '0', ps_weapon: '1' };
// 慣性だけを測るための一時パッチ＝剣も岩も出させない（上の⚠️）。
const RAM_ONLY = {
  attacks: [{ type: 'sword', range: 0.01, cooldown: 999000, windupMs: 600 }],
  attack: { type: 'sword', range: 0.01, cooldown: 999000, windupMs: 600 },
};
// SE の指紋（`installToneRec` は周波数だけを記録する）＝同じ tick に全部揃ったら鳴った。
const RUMBLE_HZ = [58, 64, 55, 62];    // golemRumble＝heavySpeed を越えた瞬間の地響き
const CRASH_HZ  = [180, 130, 100];     // doorLock＝壁への激突（＝崩れて殴れる合図）
const rang = (tones, hz) => hz.every(f => tones.includes(f));

/**
 * `bal_rock_golem` の G を n tick 追う。毎 tick の速度ベクトル・位置・気絶・絵・音と
 * プレイヤーの被弾を返す。
 * @param {object} o
 * @param {number} o.ticks       進める論理 tick 数
 * @param {object} [o.spawn]     プレイヤーの湧き（既定＝(4,1)）
 * @param {boolean} [o.debugOff] true＝'g' で debug を切る（ダメージが通る）
 * @param {object} [o.patch]     ENEMY_META['G'] へ一時的に差し込むフィールド（RAM_ONLY 等）
 * @param {number} [o.dropAt]    この tick の step より前に G へ与えるダメージの tick
 * @param {number} [o.dmg]       その量（`dealDamage` は def を引く∴+def して渡す）
 * @param {object} [o.moveWhen]  { atSpeed?, atReach?, dir, steps }＝**条件が満たされた tick から**
 *                               1 tick に1歩ずつ steps 回だけその向きへ歩く（＝プレイヤーの
 *                               「土煙を見たら横へ退く」をそのまま機械にする。⚠️ tick 番号で
 *                               固定すると加速の数を変えた瞬間に意味がずれる＝O で踏んだ罠）
 */
async function trackGolem(page, o) {
  await installToneRec(page);
  const sp = o.spawn ?? { row: G_PL_ROW, col: G_PL_COL };
  await gotoFrozen(page, previewUrl('bal_rock_golem', sp.row, sp.col, D1_PRE));
  if (o.debugOff) await page.keyboard.press('g');
  return page.evaluate((a) => {
    const g = window.__game;
    if (a.patch) g.setEnemyMetaForTest('G', a.patch);
    const g0 = g.getEnemies().find(e => e.type === 'G');
    if (!g0) return { error: 'G が盤面に居ない' };
    const id = g0.id;
    const find = () => g.getEnemies().find(e => e.id === id);
    const edgeDist = (e, px, py) => {
      const cx = e.x + ((e.w ?? 1) - 1) / 2, cy = e.y + ((e.h ?? 1) - 1) / 2;
      const gx = Math.max(0, Math.abs(px - cx) - ((e.w ?? 1) - 1) / 2);
      const gy = Math.max(0, Math.abs(py - cy) - ((e.h ?? 1) - 1) / 2);
      return Math.hypot(gx, gy);
    };

    const samples = [];
    const movedAt = [];
    let stepsLeft = a.moveWhen?.steps ?? 0;
    let stunSeen = 0;
    for (let t = 1; t <= a.ticks; t++) {
      const tone0 = window.__tones.length;
      if (a.dropAt === t) g.dealDamage(id, a.dmg, a.dmgType);
      const cur = find();
      if (!cur) break;
      const p0 = g.getPlayer();
      if (stepsLeft > 0
        && (a.moveWhen.atSpeed === undefined || (cur.momSpeed ?? 0) >= a.moveWhen.atSpeed)
        && (a.moveWhen.atReach === undefined || edgeDist(cur, p0.x, p0.y) <= a.moveWhen.atReach)) {
        g.movePlayer(a.moveWhen.dir); stepsLeft--; movedAt.push(t);
      }
      g.step(1);
      const e = find();
      if (!e) break;
      const p = g.getPlayer(), st = g.getState();
      const el = document.getElementById(`char-enemy-${id}`);
      const sprite = el?.querySelector('canvas.sprite');
      // 気絶の⭐（`showDashStun` が char-layer へ生やす）＝実時間のタイマで消える∴増分で読む
      const stuns = [...document.querySelectorAll('.stun-burst')];
      const newStuns = stuns.length - stunSeen;
      stunSeen = stuns.length;
      samples.push({
        t, now: st.gameTime, hp: e.hp, x: e.x, y: e.y, dir: e.dir,
        momVx: e.momVx ?? null, momVy: e.momVy ?? null, momSpeed: e.momSpeed ?? 0,
        momCrashes: e.momCrashes ?? 0, momRams: e.momRams ?? 0,
        momentum: e.momentum ?? null,
        stunUntil: e.stunUntil ?? null, freezeUntil: e.freezeUntil ?? null,
        swingAt: e.swingAt ?? null,
        // 絵（機構の唯一の告知）＝土煙と速い傾き
        heavy: !!el?.classList.contains('momentum-heavy'),
        dust: el ? getComputedStyle(el, '::before').content !== 'none' : false,
        bodyAnim: sprite ? getComputedStyle(sprite).animationName : '',
        px: p.x, py: p.y, php: p.hp, pdef: st.player.def, inv: st.player.invincibleUntil,
        reach: edgeDist(e, p.x, p.y),
        newStuns, newTones: window.__tones.slice(tone0),
        // ⭐の**長さ**＝気絶の長さと一致していること（印が先に消えると「まだ無抵抗なのに
        // 終わったように見える」）。inline の変数と計算後の animation-duration の両方を見る。
        stunMarkMs: stuns.length
          ? stuns[stuns.length - 1].style.getPropertyValue('--stun-burst-ms').trim() : '',
        stunMarkAnimMs: stuns.length
          ? getComputedStyle(stuns[stuns.length - 1]).animationDuration : '',
      });
    }
    const e = find();
    return {
      id, samples, movedAt,
      end: e && { hp: e.hp, maxHp: e.maxHp, momSpeed: e.momSpeed ?? 0, momentum: e.momentum ?? null },
    };
  }, o);
}

// ── G-① データ＝G の層2（慣性の綴りと「終端速度・しきい値・打点」の算術）─────────────
test('G-① 岩のゴーレムのデータ＝慣性の終端速度はプレイヤーより遅く、しきい値に必ず届く', () => {
  const m = ENEMY_META['G'];
  const c = m.momentum;

  expect(c, 'momentum が無い＝G に固有の移動機構が無い').toBeTruthy();
  // 綴りの番人（`resolveMomentum` を読む関数が読むキー＝1文字違うと既定値に落ちて黙って動く）
  expect(Object.keys(c).sort()).toEqual([
    'accel', 'crashStunMs', 'friction', 'heavySpeed', 'maxSpeed', 'ramAtk', 'ramRange',
  ]);

  // `hitAndAway` は enemyTick の分岐で momentum より優先される∴**明示 false** が要る
  // （W/A/N/J/O/U で6回踏んだ罠＝書かないと新機構の分岐へ一度も来ない）。
  expect('hitAndAway' in m, 'hitAndAway を書いていない＝既定の張り付きに戻る余地が残る').toBe(true);
  expect(m.hitAndAway, 'hitAndAway が true ＝momentum の分岐に来ない').toBe(false);
  // `initialModeWeights`＝`hitAndAway` の寄り方の抽選＝この敵では一度も通らない死んだ数値
  expect(m.initialModeWeights, '寄り方の抽選が残っている＝読まれない数値（W/O/U で外した作法）')
    .toBeUndefined();

  // 終端速度＝accel / friction（enemy-ai.js は減衰→加速の順で積む∴この式が厳密に成り立つ）
  expect(c.accel / c.friction, '終端速度が maxSpeed と一致しない＝上限の数を別に信じることになる')
    .toBeCloseTo(c.maxSpeed, 6);
  // プレイヤーは1 tick に MOVE_STEP（0.5 セル）進める∴これ未満＝**歩いて逃げ切れる**（GUIDE §7-2）
  expect(c.maxSpeed, '最高速がプレイヤーの歩き（0.5 セル/tick）以上＝退く余地が無い')
    .toBeLessThan(MOVE_STEP);
  // しきい値は最高速より下＝「体当たりが成立する速さ」に必ず到達できる（死んだ数値でない）
  expect(c.heavySpeed, 'heavySpeed が maxSpeed 以上＝土煙も体当たりも一度も起きない')
    .toBeLessThan(c.maxSpeed);
  // 体当たりの打点は既存の atk と同じ＝この機構が新しい最大打点を作らない（U の diveAtk と同作法）
  expect(c.ramAtk, '体当たりの打点が atk と違う＝ボスの最大打点が機構で増えている').toBe(m.atk);
  // 崩れている時間は「安全に殴れる時間」＝剣のクールダウン数振り分（弱点 ×3 は乗らない）
  expect(c.crashStunMs, '崩れている時間が短すぎる＝壁へ誘っても見返りが無い')
    .toBeGreaterThanOrEqual(1200);

  // 後半＝**さらに止まれない**（最高速 ×1.4・崩れている時間は短い・打点は据え置き）
  const p = (m.phases ?? []).find(ph => ph.momentum !== undefined);
  expect(p, '後半の相が慣性を差し替えていない＝前半と同じ動きのまま').toBeTruthy();
  expect(p.hpThreshold).toBe(0.5);
  expect(p.momentum.maxSpeed, '後半の最高速が前半の 1.4 倍でない').toBeCloseTo(c.maxSpeed * 1.4, 6);
  expect(p.momentum.maxSpeed, '後半の最高速がプレイヤーの歩き以上＝退く余地が消える')
    .toBeLessThan(MOVE_STEP);
  expect(p.momentum.crashStunMs, '後半の方が長く崩れている＝後半が易しくなっている')
    .toBeLessThan(c.crashStunMs);
  expect(p.momentum.ramAtk, '後半で打点が上がっている＝新しい最大打点を作っている').toBe(c.ramAtk);
  expect(p.momentum.heavySpeed, '後半でしきい値が動いている＝プレイヤーの覚えた規則が変わる')
    .toBe(c.heavySpeed);
  // `speedMultiplier` は `resolveEnemySpeed`（歩幅の溜め）の数＝momentum は読まない∴死んだ数値
  expect(p.speedMultiplier, '相に speedMultiplier が残っている＝momentum は読まない死んだ数値')
    .toBeUndefined();

  // 時間の床（0d-2.6/0d-2.7・実プレイ判定で決着した数）と弱点＝この機構の前提そのもの
  const claw = m.attacks.find(a => a.type === 'sword');
  expect(claw.windupMs, '剣の予告が 600ms でない＝決着した時間の床を動かしている').toBe(600);
  expect(m.attackFreezeMs, '攻撃硬直が 480ms でない＝弱点 ×3 の窓の長さが変わっている').toBe(480);
  expect(m.weakness, '弱点が「剣 × 攻撃硬直の窓 ×3」でない')
    .toEqual({ type: 'sword', window: 'recover', multiplier: 3 });
});

// ── G-② 加速＝速度が単調に増えて終端へ漸近し、しきい値を越えた瞬間に土煙と地響き ────────
test('G-② 慣性は少しずつ積まれて終端速度へ漸近し、heavySpeed を越えた瞬間だけ地響きが鳴る', async ({ page }) => {
  const c = ENEMY_META['G'].momentum;
  const out = await trackGolem(page, { ticks: 20, patch: RAM_ONLY });
  const s = out.samples;
  expect(out.error).toBeUndefined();

  // ① 速さは単調に増える（減衰より加速が勝つ＝寄って来ることは寄って来る）
  for (let i = 1; i < s.length; i++) {
    expect(s[i].momSpeed, `t${s[i].t} で速さが落ちた＝加速が積まれていない`)
      .toBeGreaterThan(s[i - 1].momSpeed - 1e-9);
  }
  // ② 上限を越えない・そして終端（accel/friction）へ漸近する
  expect(Math.max(...s.map(x => x.momSpeed)), '最高速を越えた').toBeLessThanOrEqual(c.maxSpeed + 1e-9);
  expect(s[s.length - 1].momSpeed, '20 tick 経っても終端速度の 7 割に届かない＝寄って来ない')
    .toBeGreaterThan(c.maxSpeed * 0.7);
  // ③ しきい値に**到達する**（＝体当たり・自壊・土煙が死んだ機構でない）が、すぐには届かない
  //    ＝プレイヤーには「重くなっていく」を見る時間がある（GUIDE §7-8）。
  const firstHeavy = s.findIndex(x => x.momSpeed >= c.heavySpeed);
  expect(firstHeavy, 'heavySpeed に一度も届かない＝体当たりも自壊も起きない').toBeGreaterThan(-1);
  expect(firstHeavy, '1 tick でしきい値を越える＝重い体に見えない').toBeGreaterThan(2);

  // ④ 絵＝しきい値を越えている tick と `.momentum-heavy` が**完全に一致**する（土煙も出る）
  for (const x of s) {
    expect(x.heavy, `t${x.t}（速さ ${x.momSpeed.toFixed(3)}）で土煙の有無が速さと食い違う`)
      .toBe(x.momSpeed >= c.heavySpeed);
    if (x.heavy) {
      expect(x.dust, `t${x.t} で土煙（::before）が出ていない`).toBe(true);
      expect(x.bodyAnim, `t${x.t} で体の傾きが大型敵の既定（golem-lumber）のまま＝速さが絵に出ない`)
        .toBe('enemy-momentum-heavy');
    }
  }
  // ⑤ 音＝越えた**瞬間に1回だけ**（継続では鳴らさない＝GUIDE §7-6）
  const rumbleTicks = s.filter(x => rang(x.newTones, RUMBLE_HZ)).map(x => x.t);
  expect(rumbleTicks, '地響きが「越えた瞬間に1回」でない（0回＝告知が無い／2回以上＝轟音）')
    .toEqual([s[firstHeavy].t]);
});

// ── G-③ 止まれない＝横へ退かれても元の向きへ進み続ける（`enemyChase` との型の差）────────
// この本が守るのは設計そのもの＝「寄っては来るが、止まれないので狙った所に来られない」。
// 位置を追う既存の移動（`enemyChase`）に差し替えると**次の tick で向きが変わる**＝ここが赤くなる。
test('G-③ プレイヤーが横へ退いても数 tick は元の向きへ進み続ける（曲がるのに時間がかかる）', async ({ page }) => {
  const c = ENEMY_META['G'].momentum;
  // 土煙が出たら（＝しきい値を越えたら）北へ 6 歩＝3 セル退く＝プレイヤーの答えそのもの
  const out = await trackGolem(page, {
    ticks: 26, patch: RAM_ONLY,
    moveWhen: { atSpeed: c.heavySpeed, dir: 'up', steps: 6 },
  });
  const s = out.samples;
  expect(out.movedAt.length, 'プレイヤーが退けていない＝しきい値に届いていない').toBe(6);
  const done = out.movedAt[out.movedAt.length - 1];        // 退き終わった tick
  const after = s.filter(x => x.t > done);
  expect(after.length, '退いた後の観測が足りない').toBeGreaterThanOrEqual(8);

  // ⓪ 退き終わった時点で**プレイヤーは 3 セル北に居るのに、ゴーレムはまだ同じ行に居る**
  //    ＝「重い体は付いて来られない」（避ける余地がここに在る）。
  const atDone = s[done - 1];
  expect((atDone.y + 0.5) - atDone.py, '退き終わった時点でもう追い付かれている＝避ける余地が無い')
    .toBeGreaterThan(2);

  // ① 退き終わった後も**西（元の向き）へ進み続ける**＝速度は位置ではなく速度を追っている
  const keep = after.slice(0, 4);
  for (const x of keep) {
    expect(x.momVx, `t${x.t} で西向きの惰性が消えている＝止まれる体になっている`).toBeLessThan(0);
    expect(x.dir, `t${x.t} で向きが即座に北を向いた＝位置を追う移動（enemyChase）と同じ`)
      .toBe('left');
  }
  // ② 位置も西へ進み続ける（＝惰性が「絵の上でも」続いている）
  expect(keep[keep.length - 1].x, '退いた後に西へ1歩も進んでいない＝惰性が効いていない')
    .toBeLessThan(s[done - 1].x);
  // ③ 曲がるには時間がかかる＝北へ**曲がり始めてはいる**（縦の速度が毎 tick 増える）のに、
  //    8 tick かけても西向きの惰性を追い越せない＝「寄っては来るが狙った所には来られない」。
  //    ⚠️ 指標を「|vy| が |vx| を追い越した tick」で書くと**永久に立たない**（実測＝この幾何では
  //       追い越す前にプレイヤーへ届く：北 0.17 に対し西は 0.22 のまま）∴ここは
  //       「増えている」と「追い越していない」の2つで測る（[[field-axis-met-not-noticed]] と
  //       同じ話＝指標が満たされないことと機構が無いことは別）。
  const seq = [atDone, ...after.slice(0, 8)];
  for (let i = 1; i < seq.length; i++) {
    const x = seq[i];
    expect(Math.abs(x.momVy), `t${x.t} で北への曲がりが1 tick も進んでいない＝速度を追っていない`)
      .toBeGreaterThan(Math.abs(seq[i - 1].momVy) - 1e-9);
    expect(Math.abs(x.momVy), `t${x.t} で北向きが西向きを追い越した＝即座に曲がれる体になっている`)
      .toBeLessThan(Math.abs(x.momVx));
  }
});

// ── G-④ 壁激突＝誘い込むと自壊して長く崩れる（低速では崩れない）──────────────────
// 「壁が武器になる」＝この敵の答え。突進猪（自分から壁へ走る）と違い**プレイヤーが誘導して
// 初めて起きる**∴プレイヤーの操作（横へ退く）を機械にしてから測る。
test('G-④ 速いまま壁に当たると自壊して長く気絶する（⭐の長さ＝crashStunMs・体当たりは空振り）', async ({ page }) => {
  const c = ENEMY_META['G'].momentum;
  const out = await trackGolem(page, {
    ticks: 34, patch: RAM_ONLY, spawn: G_WALL_SPAWN,       // 北の壁ぎわ＝G の真上
    moveWhen: { atSpeed: c.heavySpeed, dir: 'right', steps: 6 },   // 土煙を見たら東へ 3 セル退く
  });
  const s = out.samples;
  const crashAt = s.findIndex(x => x.momCrashes >= 1);
  expect(crashAt, '壁へ誘い込んだのに自壊していない＝「壁が武器になる」が成立していない')
    .toBeGreaterThan(-1);
  const crash = s[crashAt];
  // ① 崩れた瞬間の姿＝速度は捨てられ、気絶の窓が立ち、⭐が1つ増える
  expect(crash.momSpeed, '激突したのに速度が残っている＝滑りながら崩れる').toBe(0);
  expect(crash.stunUntil, '気絶の窓が立っていない').toBeGreaterThan(crash.now);
  expect(crash.newStuns, '⭐（気絶の印）が出ていない＝崩れたことが絵で分からない').toBe(1);
  // ② 印の長さ＝気絶の長さ（先に消えると「まだ無抵抗なのに終わったように見える」）
  expect(crash.stunMarkMs, `⭐の長さが crashStunMs と違う`).toBe(`${c.crashStunMs}ms`);
  expect(crash.stunMarkAnimMs, '⭐の CSS が --stun-burst-ms を読んでいない')
    .toBe(`${c.crashStunMs / 1000}s`);
  // ③ 崩れる直前は heavySpeed 以上で走っていた（＝「速いまま当たった」が理由）
  expect(s[crashAt - 1].momSpeed, '低速で当たって崩れた＝しきい値が効いていない')
    .toBeGreaterThanOrEqual(c.heavySpeed);
  // ④ 音＝激突は `doorLock`（「重いものが止まった」＝殴れる合図）。地響きとは別の音。
  expect(rang(crash.newTones, CRASH_HZ), '激突の音が鳴っていない＝崩れた合図が耳に無い').toBe(true);
  // ⑤ 体当たりは**空振り**（避けたから壁で崩れた）＝この機構が成立している証拠
  expect(crash.momRams, '避けたのに体当たりが当たっている＝退く余地が無い').toBe(0);
  expect(crash.php, '避けたのにダメージを受けている').toBe(s[0].php);

  // ⑥ 歯＝**しきい値だけ**を上げると（＝速さが一度も heavySpeed を越えない）同じ誘い込みで
  //    崩れない＝「速いまま当たること」が自壊の理由（壁に触ったことではない）。
  const slow = await trackGolem(page, {
    ticks: 34, spawn: G_WALL_SPAWN,
    patch: { ...RAM_ONLY, momentum: { ...c, heavySpeed: 0.9 } },
    moveWhen: { atReach: 1.6, dir: 'right', steps: 6 },
  });
  expect(slow.samples.some(x => x.momCrashes >= 1),
    '低速（heavySpeed 未満）でも壁で崩れている＝壁に触っただけで自壊している').toBe(false);
  expect(slow.samples.some(x => x.heavy), '越えられないしきい値なのに土煙が出ている').toBe(false);
});

// ── G-⑤ 体当たり＝速いときだけ潰される（低速の接触は痛くない）──────────────────
test('G-⑤ 速いまま触れると ramAtk のダメージ、低速の接触では減らない', async ({ page }) => {
  const c = ENEMY_META['G'].momentum;
  const out = await trackGolem(page, { ticks: 34, patch: RAM_ONLY, debugOff: true });
  const s = out.samples;
  const ramAt = s.findIndex(x => x.momRams >= 1);
  expect(ramAt, '真っすぐ寄って来て体当たりが一度も当たらない＝機構が届いていない')
    .toBeGreaterThan(-1);
  const ram = s[ramAt];
  // ① 打点＝ramAtk − def（`ps_armor: 0` ＝布の服 def 1）
  const expected = Math.max(1, c.ramAtk - ram.pdef);
  expect(s[0].php - ram.php, `体当たりのダメージが ramAtk−def（${expected}）と違う`).toBe(expected);
  // ② 当たった瞬間に止まる（＝ぶつかった巨体はそこで速度を捨てる）
  expect(ram.momSpeed, '体当たりの後も走り続けている＝押し潰しながら通り抜ける').toBe(0);
  // ③ 体当たりは攻撃の共通後処理を通る＝**直後は剣が出ない**かつ攻撃硬直（弱点 ×3 の窓）が立つ
  //    ＝轢かれた側に反撃の権利が渡る（弱点の規則を「硬直の窓」の1本に保つ設計）。
  expect(ram.freezeUntil, '体当たりの後に攻撃硬直が立っていない＝殴り返す窓が開かない')
    .toBeGreaterThan(ram.now);
  // ④ **プレイヤーの体は壁ではない**＝棒立ちで受け止めても自壊しない（この回に壁は絡まない＝
  //    西の壁はプレイヤーの背後∴自壊が起きたらそれはプレイヤーに当たって崩れたということ）。
  //    ⚠️ 実際に踏んだ欠陥＝行き止められた主軸を「激突」と見なし、無傷のプレイヤーが
  //       1.8 秒の気絶を無料で取れていた（機構が裏返る）。
  expect(s.some(x => x.momCrashes >= 1),
    'プレイヤーの体に当たって自壊した＝棒立ちで気絶を取れる（機構が裏返っている）').toBe(false);

  // ⑤ 歯＝しきい値だけ上げる（速さが一度も越えない）と、同じ距離まで寄られても痛くない
  const slow = await trackGolem(page, {
    ticks: 34, debugOff: true,
    patch: { ...RAM_ONLY, momentum: { ...c, heavySpeed: 0.9 } },
  });
  // 「同じ距離まで寄られている」＝速い回が体当たりを決めた距離まで低速の回も詰めている。
  // ⚠️ `ramRange` の数と直接比べない＝`isPassableForEnemy` はプレイヤーと重なる手前で必ず
  //    止める（passable.js「どの向きでも最接近は 1.0」）∴刻みの端数だけ常に外側に居て
  //    「reach <= 1.0」は満たされない（実測 1.02）。比べるのは**実測した最接近**どうし。
  const closest = Math.min(...slow.samples.map(x => x.reach));
  expect(closest, '低速の回で速い回と同じ距離まで寄って来ていない＝比べる前提が崩れている')
    .toBeLessThanOrEqual(ram.reach + 1e-9);
  expect(slow.samples.some(x => x.momRams >= 1),
    '土煙が出ていない（低速の）岩に触れて潰された＝しきい値が絵と一致していない').toBe(false);
  expect(slow.samples[slow.samples.length - 1].php, '低速の接触でダメージを受けている')
    .toBe(slow.samples[0].php);
});

// ── G-⑥ 気絶のあいだ滑らない・土煙も消える（＝殴り返す窓が本当に止まっている）────────
// GUIDE §7-8＝告知の長さ＝窓の長さ。崩れているのに滑っていたら「殴れる窓」は窓ではない。
test('G-⑥ 崩れているあいだ体は1ミリも動かず、土煙も消える', async ({ page }) => {
  const c = ENEMY_META['G'].momentum;
  const out = await trackGolem(page, {
    ticks: 40, patch: RAM_ONLY, spawn: G_WALL_SPAWN,
    moveWhen: { atSpeed: c.heavySpeed, dir: 'right', steps: 6 },
  });
  const s = out.samples;
  const crashAt = s.findIndex(x => x.momCrashes >= 1);
  expect(crashAt, '自壊が観測できていない').toBeGreaterThan(-1);
  const stunned = s.filter((x, i) => i >= crashAt && x.stunUntil > x.now);
  expect(stunned.length, '気絶の窓が観測できていない（crashStunMs / TICK_MS ぶんは続く）')
    .toBeGreaterThan(3);
  for (const x of stunned) {
    expect(x.x, `t${x.t}（気絶中）に横へ滑った`).toBe(stunned[0].x);
    expect(x.y, `t${x.t}（気絶中）に縦へ滑った`).toBe(stunned[0].y);
    expect(x.momSpeed, `t${x.t}（気絶中）に速度が積まれている＝明けた瞬間に走り出す`).toBe(0);
    expect(x.heavy, `t${x.t}（気絶中）に土煙が出ている＝殴れる窓を絵が否定している`).toBe(false);
    expect(x.dust, `t${x.t}（気絶中）に土煙（::before）が残っている`).toBe(false);
  }
});

// ── G-⑦ 相の差し替え＝HP 半分で慣性の設定が変わり、走っている惰性は持ち込まれない ───────
test('G-⑦ HP 半分で慣性の設定が差し替わり、その瞬間に速度が初期化される', async ({ page }) => {
  const m = ENEMY_META['G'];
  const c = m.momentum, pc = m.phases.find(p => p.momentum !== undefined).momentum;
  await installToneRec(page);
  await gotoFrozen(page, previewUrl('bal_rock_golem', G_PL_ROW, G_PL_COL, D1_PRE));
  const out = await page.evaluate((a) => {
    const g = window.__game;
    g.setEnemyMetaForTest('G', a.patch);
    const id = g.getEnemies().find(e => e.type === 'G').id;
    const find = () => g.getEnemies().find(e => e.id === id);
    for (let t = 0; t < 14; t++) g.step(1);              // 惰性を積む
    const before = { momSpeed: find().momSpeed, momentum: find().momentum, hp: find().hp };
    // `dealDamage` は def を引く∴+def して渡す（半分ちょうどを越えさせる）
    g.dealDamage(id, a.dmg);
    const after = { momSpeed: find().momSpeed, momentum: find().momentum, hp: find().hp,
                    maxHp: find().maxHp };
    g.step(1);
    return { before, after, next: { momSpeed: find().momSpeed } };
  }, { patch: RAM_ONLY, dmg: Math.ceil(m.hp / 2) + m.def });

  expect(out.before.momSpeed, '相を切り替える前に走っていない＝惰性の持ち込みを測れない')
    .toBeGreaterThan(c.heavySpeed);
  expect(out.before.momentum, '最初から相の設定が入っている＝素の設定を測っていない').toBeNull();
  expect(out.after.hp / out.after.maxHp, 'HP が半分を割っていない＝相が発火していない')
    .toBeLessThanOrEqual(0.5);
  // ① 設定が差し替わる（`resolveMomentum` が読む口＝`_momentum`）
  expect(out.after.momentum, '後半の慣性が差し替わっていない').toEqual(pc);
  // ② 走っている惰性は**捨てる**（`_dash`/`_coil` と同じ側の扱い）＝新しい上限より速い1 tick を
  //    タダで作らない
  expect(out.after.momSpeed, '相の切り替えで惰性が持ち込まれている＝一瞬だけ規則の外の速さになる')
    .toBe(0);
  // ③ 次の tick からは新しい設定で積み直す（＝止まったままにならない）
  expect(out.next.momSpeed, '相の切り替え後に一度も加速していない＝動かなくなった')
    .toBeCloseTo(pc.accel, 6);
});

// ── G-⑧ G の移動機構は W・A・N・J・O・U のどれとも重ならない（0d-3 の判定基準）──────────
test('G-⑧ 慣性の使い手は G だけ・G は他の6体の移動機構を持たない', () => {
  const gm = mechanismsOf(ENEMY_META['G']);
  const others = ['W', 'A', 'N', 'J', 'O', 'U'].map(k => mechanismsOf(ENEMY_META[k]));
  expect(gm.has('momentum'), 'G が移動機構（momentum）を持っていない').toBe(true);
  expect([...gm].filter(k => others.every(x => !x.has(k))).length,
    'G に W・A・N・J・O・U が持たない機構が1つも無い＝7体目の型になっていない').toBeGreaterThan(0);
  expect(others.some(x => x.has('momentum')),
    'W・A・N・J・O・U のどれかが慣性を持っている＝G の固有機構ではない').toBe(false);
  const users = Object.entries(ENEMY_META).filter(([, m]) => m.momentum).map(([k]) => k);
  expect(users, '慣性を持つ敵が G 以外にも居る（設計が重複した）').toEqual(['G']);
  // 借り物でない番人＝特に `dash`（ω 突進猪と A の後半だけの機構）を持たないこと。
  // ここが生えた瞬間に「軸を取って直進してくる」＝A と同型になり、7体目の意味が消える。
  for (const k of ['combat', 'laneStalk', 'burrowAmbush', 'hide', 'dash', 'coil', 'gaze', 'soar', 'leap']) {
    expect(ENEMY_META['G'][k], `${k} を持っている＝W/A/N/J/O/U の型を借りている`).toBeUndefined();
  }
  for (const p of ENEMY_META['G'].phases ?? []) {
    for (const k of ['dash', 'coil', 'hide', 'gaze', 'soar']) {
      expect(p[k], `後半に ${k} が生えている＝他のボスの後半と同じ型`).toBeUndefined();
    }
  }
});

// ── G-⑨ 検証ステージの幾何（GUIDE §4-3）───────────────────────────────
test('G-⑨ bal_rock_golem は 10×12・外周は通路以外すべて壁・G が (4,7) に1体だけ・遮蔽ゼロ', () => {
  const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
  const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  const sd = MAP.layers[TEST_LAYER].stages[stageKey('bal_rock_golem')];
  expect(sd.rows).toBe(10);
  expect(sd.cols).toBe(12);
  // 遮蔽ゼロ＝惰性は地形で止まらない∴「壁で崩れた」は必ず**外周の壁**が理由になる
  expect(Object.keys(sd.bgTiles ?? {}), '別地形が入った＝慣性の測定が地形のせいになる').toEqual([]);

  const at = (r, c) => sd.tiles[r][c];
  const golems = [];
  for (let r = 0; r < sd.rows; r++) {
    for (let c = 0; c < sd.cols; c++) {
      const ch = at(r, c);
      if (ch === TILE.ROCK_GOLEM) { golems.push([r, c]); continue; }
      if (r === 6 && c === 1) continue;              // 看板 i（南の通路の脇）
      const edge = r === 0 || c === 0 || r === sd.rows - 1 || c === sd.cols - 1;
      const want = edge && !isArenaDoor(r, c, sd.cols) ? TILE.WALL : TILE.FLOOR;
      expect(at(r, c), `(${r},${c}) が想定と違う`).toBe(want);
    }
  }
  expect(golems, 'G が1体だけ (4,7) に居る前提が崩れた').toEqual([[G_ROW, G_COL]]);

  // 助走と壁が**両軸に**ある＝どちらの向きへ誘い込んでも崩せる（層2 の答えが地形に在る）
  for (let c = 1; c < G_COL; c++) {                  // 西の助走（測る湧き (4,1) の行）
    expect(at(G_PL_ROW, c), `(${G_PL_ROW},${c}) が床でない＝西への助走が塞がっている`).toBe(TILE.FLOOR);
  }
  // 北の助走（壁ぎわの湧き (1,7) の列）＝G 自身のセル (4,7) は含めない（そこはタイル 'G'）
  for (let r = 1; r < G_ROW; r++) {
    expect(at(r, G_COL), `(${r},${G_COL}) が床でない＝北への助走が塞がっている`).toBe(TILE.FLOOR);
  }
  expect(at(G_PL_ROW, 0), '西の端が壁でない＝誘い込む先が無い').toBe(TILE.WALL);
  expect(at(0, G_COL), '北の端が壁でない＝誘い込む先が無い').toBe(TILE.WALL);
  // 壁ぎわの湧き (1,7)＝G-④/G-⑥ の前提（G の真上・北の壁に背を付けて待てる）
  expect(at(G_WALL_SPAWN.row, G_WALL_SPAWN.col), '壁ぎわの湧きが床でない').toBe(TILE.FLOOR);
});

// ── G-⑩ 素のデータ（剣も岩も生きたまま）でも体当たりが届く＝土煙の告知が嘘にならない ──────
// ⚠️ この本は**実プレイの測定で見つけた欠陥**の再発防止。上の G-②〜G-⑦ は `RAM_ONLY` で
//    剣を止めて慣性だけを測る∴「剣が生きていると体当たりが一度も起きない」を見られなかった。
//    実測（.scratch の使い捨て・棒立ち 80 tick）＝体当たり 0 回／剣の被弾 8 回／間合い 1.3 以内
//    での最大速度 0.157 < heavySpeed 0.18。理由＝剣の到達距離 1.2 > 接触の距離 1.0 ∴必ず
//    先に剣の間合いへ入り、予告の攻撃硬直が惰性を捨てる＝土煙が「潰す」と告知したまま潰せない。
//    直し＝**走っている（速さ ≥ heavySpeed）あいだは剣を振らない**（enemy-ai.js `momFast`）。
test('G-⑩ 素のデータでも体当たりが届き、走っているあいだ剣の予告は立たない', async ({ page }) => {
  const c = ENEMY_META['G'].momentum;
  // パッチなし＝実プレイと同じ meta（剣 range 1.2・岩 range 6・相も生きている）。
  // ⚠️ ticks は最初の体当たりが決まるところまで（実測 t26）＝その後の剣で D1 装備（ハート3）の
  //    プレイヤーが死ぬところまでは測らない（gameover は測定の前提ではない）。
  const out = await trackGolem(page, { ticks: 30, debugOff: true });
  const s = out.samples;

  // ① 体当たりが実際に起きる（＝機構が実プレイで届く）
  const ramAt = s.findIndex(x => x.momRams >= 1);
  expect(ramAt, '素のデータでは体当たりが一度も起きない＝土煙の告知が嘘になっている')
    .toBeGreaterThan(-1);
  const ram = s[ramAt];
  expect(s[0].php - ram.php, '体当たりのダメージが ramAtk−def と違う')
    .toBe(Math.max(1, c.ramAtk - ram.pdef));

  // ② 走っているあいだ剣の予告は一度も立たない（＝「速い」と「剣を振る」は排他）
  const fast = s.filter(x => x.momSpeed >= c.heavySpeed);
  expect(fast.length, '一度も heavySpeed を越えていない＝②の前提が測れていない')
    .toBeGreaterThan(2);
  for (const x of fast) {
    expect(x.swingAt, `t${x.t}（速さ ${x.momSpeed.toFixed(3)}）に剣の予告が立った`
      + '＝走りながら剣を振る＝攻撃硬直で惰性が消えて体当たりが届かなくなる').toBeNull();
  }

  // ③ 体当たりより前に剣が当たっていない（＝間合いの内側に入った瞬間は体当たりが先に来る）
  //    ⚠️ 剣は ramAtk と同じ 4 ∴ php の減りだけでは区別できない∴**攻撃硬直が立った tick**で見る
  //    （markAttack は剣でも体当たりでも硬直を立てる∴体当たりの tick より前に立ったら剣）。
  const swordBefore = s.slice(0, ramAt).find(x => x.freezeUntil > x.now);
  expect(swordBefore, '体当たりより前に剣が解決している＝寄って来る途中で剣が惰性を捨てている')
    .toBeUndefined();
});

// ══════════════════════════════════════════════════════════════════════════════
// 8体目＝I 沼地の大蝦蟇（2×2・D8 のボス）＝新機構 `tongue`（舌）
// ══════════════════════════════════════════════════════════════════════════════
// 0d-3（2026-08-31）。層2 の設計＝**動くのはプレイヤーの方**＝13体で唯一「自分ではなく相手を
// 動かす」ボス。自分から歩いて詰めることはしない（帯の外に居るときだけ跳ねて寄る）。
//   ・相は7つ＝idle → cast（予告・体が膨らむ）→ lash（伸びる）→ hold（引き寄せる）→
//     pounce（沈む＝のしかかりの溜め）→ pounceAir（滞空）→ idle／空振りなら retract。
//     `cast` の**終わり**で狙いを固定する＝以後追尾しない（伸びているあいだに横へ 1 セル
//     退けば空振りする）。
//   ・掴まれても操作は一切奪われない＝`reelSpeed`（0.22）< プレイヤーの歩幅（MOVE_STEP 0.5）
//     ∴**歩けば離れられる**（払うのは時間）。歩かなければ `holdMs` の間に口元まで引かれる。
//   ・引き寄せの終点＝**噛みつきの到達距離**（`attacks[]` の sword の range 1.4）＝そこで舌を
//     離し、そのまま**のしかかり**へ渡す（「引かれた末に潰される」が繋がる）。
//   ・のしかかり（2026-09-01 追加）＝**口元（端 ≤ 噛みつきの間合い）に居る相手に跳ぶ**唯一の規則。
//     入口は2つ＝① 引き寄せの終幕（掴めたとき）② 打ち終わりの間が明けてもまだ口元に居るとき。
//     着地の一撃は**盾で防げない**（体当たり／締め上げ／ブレスと同じ扱い）∴これが I の
//     「盾で全部消える」を閉じる答え＝ユーザー報告（2026-09-01）「舌でひきこまれる、ろうそくで
//     火をつける／これを繰り返すだけでノーダメージで倒せてしまう。（攻撃は盾で防御できてしまう）」。
//     猶予は溜め＋滞空（840ms＝7 tick＝3.5 セル歩ける）≫ 半径と噛みつきの間合いの差（0.2）。
//   ・舌が出ているあいだ蝦蟇は**1歩も動かず攻撃もしない**（錨）＝引かれている時間がそのまま
//     「殴れる窓」になる。舌そのものはダメージ 0（痛いのは終幕ののしかかり）。
//
// ⚠️ 到達距離の表（GUIDE §7-12）に隙間を作らないこと＝帯の**内端は噛みつきの到達距離そのもの**
//    （データに `minRange` を持たない）。実測で踏んだ欠陥＝`minRange 1.8` を持っていたため
//    間合い 1.5 では噛みつきも舌も来ず（毒沫だけ）、しかも**引き寄せの終点がその隙間**だった。
// ⚠️ 引き寄せは連続座標で動かす∴終わった瞬間に必ず 0.5 格子へ戻すこと（半端な位置に置き去ると
//    幅1マスの出入口へ二度と入れない＝ボス部屋から出られなくなる）。しかも寄せる先は
//    **敵側の格子**（四捨五入だと間合い 1.27 → 1.5 へ押し戻され噛みつき 1.4 が永久に届かない
//    ＝これも実測で踏んだ）。
// ⚠️ この節は**ほとんどの本をパッチなし（実プレイと同じ meta）で測る**＝舌の時計は行動ゲートの
//    外で走る∴噛みつきも毒沫も止めずに測れる（G の `RAM_ONLY` に相当するものが要らない）。
//    唯一の例外は I-⑥＝**帯だけを付け替えて 2 つの極を作る**（`holdMs`・`reelSpeed` は素のまま）：
//    (a) 引き剥がせる側＝`cells` 3 に縮める（部屋の中に「帯の外へ歩き切る助走」を作る）／
//    (b) 引き剥がせない側＝`cells` 9 に伸ばす（部屋の対角 7.62 より長い＝どこへ歩いても帯の中）。
const I_ROW = 4, I_COL = 7;                  // 2×2 ∴ rows 4-5 / cols 7-8 を占める
const I_PL_ROW = 4, I_PL_COL = 2;            // 帯の内側（間合い 5.0）＝舌を打たせる立ち位置
const I_FAR   = { row: 4, col: 2 };          // 帯の外端ちょうど（5.0）＝holdMs の算術を測る
                                             // ⚠️ 2026-09-01 に cells 6 → 5 ∴col 1（6.0）から動かした。
                                             //    整数の立ち位置で外端ぴったりが取れる `cells` を選んである
                                             //    （edge 距離は整数 × 整数の hypot ∴4.5 は取れない）。
const I_EDGE  = { row: 3, col: 6 };          // 噛みつきの到達距離のすぐ外（1.414）＝隙間を測る
const I_NEAR  = { row: 4, col: 5 };          // 帯の内側で西に助走 4 セル＝引き剥がしを測る
const I_OUT   = { row: 1, col: 1 };          // 帯の外（6.71）＝跳ねて寄るのを測る
const I_MOUTH = { row: 4, col: 6 };          // 口元（0.5＝噛みつきの間合いの内側）＝舌は打てない
                                             //   ∴ここに居座る相手にはのしかかりで答える（I-⑮）
const I_MID   = { row: 4, col: 4 };          // 帯の内側（3.0）＝北へ 1 セル退いてもまだ帯の内側
                                             //   （3.16）＝「打ち終わりの間だけ跳ぶ」を測る（I-⑫）
// D8 のボス直前の想定装備（`node scripts/audit-balance.mjs` の「D8 沼地 / ボス直前」＝
// DEF 1（布の服ティア0）・最大HP 26＝ハート 13・剣ティア0）。弱点の炎は D4 のロウソク＝持っている。
const D8_PRE = {
  ps_hearts: '13', ps_sword: '0', ps_shield: '0', ps_armor: '0', ps_weapon: '1', ps_candle: '1',
};
// SE の指紋（`installToneRec` は周波数だけを記録する）
const TONGUE_CAST_HZ = [174];                // tongueCast＝打つ前の予告（音程を動かさず膨らむ）
const TONGUE_GRAB_HZ = [320, 384, 296];      // tongueGrab＝掴んだ（打撃音ではない＝ダメージ0）
const TONGUE_SNAP_HZ = [480, 720, 1000];     // tongueSnap＝空振り／引き剥がされた／時間切れ
const BITE_WINDUP_HZ = [130, 104];           // maulWindup＝噛みつきの予告（口元での噛みつき）
const POUNCE_HZ      = [196, 147, 110, 660]; // toadPounce＝沈んで跳んだ（終わりの高音＝滞空の合図）
const POUNCE_LAND_HZ = [82, 116, 262, 208];  // toadLand＝落ちた（＝当たり判定と同じ tick）

/**
 * `bal_swamp_toad` の I を n tick 追う。毎 tick の相・舌の長さ・間合い・絵・音と
 * プレイヤーの位置／HP を返す。
 * @param {object} o
 * @param {number} o.ticks       進める論理 tick 数
 * @param {object} [o.spawn]     プレイヤーの湧き（既定＝(4,2)）
 * @param {boolean} [o.debugOff] true＝'g' で debug を切る（ダメージが通る）
 * @param {object} [o.patch]     ENEMY_META['I'] へ一時的に差し込むフィールド
 * @param {number} [o.dropAt]    この tick の step より前に I へ与えるダメージの tick
 * @param {number} [o.dmg]       その量（`dealDamage` は def を引く∴+def して渡す）
 * @param {object} [o.moveWhen]  { atPhase?, attached?, dir, steps }＝**条件が満たされた tick から**
 *                               1 tick に1歩ずつ steps 回だけその向きへ歩く（tick 番号で固定すると
 *                               舌の数を変えた瞬間に意味がずれる＝O/G で踏んだ罠）
 * @param {boolean} [o.face]     true＝毎 tick 蝦蟇の方へ向き直る（＝盾の正面を蝦蟇に向け続ける。
 *                               ユーザー報告の戦法そのもの＝「向いて焼く」が完全防御だった）
 * @param {boolean} [o.candle]   true＝毎 tick ロウソクを置く（弱点の炎＝報告された戦法の再現）
 */
async function trackToad(page, o) {
  await installToneRec(page);
  const sp = o.spawn ?? { row: I_PL_ROW, col: I_PL_COL };
  await gotoFrozen(page, previewUrl('bal_swamp_toad', sp.row, sp.col, D8_PRE));
  if (o.debugOff) await page.keyboard.press('g');
  return page.evaluate((a) => {
    const g = window.__game;
    if (a.patch) g.setEnemyMetaForTest('I', a.patch);
    const i0 = g.getEnemies().find(e => e.type === 'I');
    if (!i0) return { error: 'I が盤面に居ない' };
    const id = i0.id;
    const find = () => g.getEnemies().find(e => e.id === id);
    const cellPx = document.querySelector('#board .cell').getBoundingClientRect().width;
    // 間合い＝`enemyEdgeDist`（セル添字基準の箱の面までの距離）と同じ式＝到達距離の表と揃う
    const edgeDist = (e, px, py) => {
      const cx = e.x + ((e.w ?? 1) - 1) / 2, cy = e.y + ((e.h ?? 1) - 1) / 2;
      const gx = Math.max(0, Math.abs(px - cx) - ((e.w ?? 1) - 1) / 2);
      const gy = Math.max(0, Math.abs(py - cy) - ((e.h ?? 1) - 1) / 2);
      return Math.hypot(gx, gy);
    };

    const samples = [];
    const movedAt = [];
    let stepsLeft = a.moveWhen?.steps ?? 0;
    for (let t = 1; t <= a.ticks; t++) {
      const tone0 = window.__tones.length;
      if (a.dropAt === t) g.dealDamage(id, a.dmg);
      const cur = find();
      if (!cur) break;
      // 盾の正面を蝦蟇へ向け続ける／弱点の炎を置く（＝ユーザー報告の戦法を再現する）
      if (a.face || a.candle) {
        const p0 = g.getPlayer();
        const cx = cur.x + ((cur.w ?? 1) - 1) / 2, cy = cur.y + ((cur.h ?? 1) - 1) / 2;
        const dx = cx - p0.x, dy = cy - p0.y;
        if (a.face) {
          g.setHeroDir(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
            : (dy > 0 ? 'down' : 'up'));
        }
        if (a.candle) g.useSubItem();
      }
      const mw = a.moveWhen;
      if (mw && stepsLeft > 0
        && (mw.atPhase === undefined || (cur.tonguePhase ?? 'idle') === mw.atPhase)
        && (mw.attached === undefined || !!cur.tongueAttached === mw.attached)) {
        g.movePlayer(mw.dir); stepsLeft--; movedAt.push(t);
      }
      g.step(1);
      const e = find();
      if (!e) break;
      const p = g.getPlayer(), st = g.getState();
      const el = document.getElementById(`char-enemy-${id}`);
      const strip = document.getElementById(`enemy-tongue-${id}`);
      samples.push({
        t, now: st.gameTime, hp: e.hp, x: e.x, y: e.y, dir: e.dir,
        phase: e.tonguePhase ?? 'idle', len: e.tongueLen ?? 0, ang: e.tongueAng,
        aimX: e.tongueAimX, aimY: e.tongueAimY, attached: !!e.tongueAttached,
        grabs: e.tongueGrabs ?? 0, snaps: e.tongueSnaps ?? 0,
        cfg: e.tongue ?? null, at: e.tongueAt ?? null, until: e.tongueUntil ?? null,
        swingAt: e.swingAt ?? null, freezeUntil: e.freezeUntil ?? null,
        projectiles: g.getProjectiles().length,
        px: p.x, py: p.y, php: p.hp, pdef: st.player.def,
        // 盾の向き・盾ティア・無敵窓＝「盾で防げない」を測るために要る3つ
        // （向きが蝦蟇を向いていない／盾を持っていない／無敵で吸われた、を後から切り分ける）
        pdir: st.heroDir, shieldTier: st.player.shieldTier, invUntil: st.player.invincibleUntil,
        reach: edgeDist(e, p.x, p.y),
        // 絵＝予告（体が膨らむ）と帯（舌そのもの）。数は JS が単一の真実として渡す。
        windup: !!el?.classList.contains('tongue-windup'),
        castMsVar: (el?.style.getPropertyValue('--tongue-cast-ms') ?? '').trim(),
        strip: !!strip, stripW: strip ? parseFloat(strip.style.width) : 0,
        stripAttached: !!strip?.classList.contains('tongue-attached'),
        // のしかかり＝数（跳んだ回数・当てた回数）と絵（体の沈み／滞空／床の危険域）。
        // 床の危険域は**セル単位**へ戻して渡す＝判定（`enemyEdgeDist ≤ r`）と同じ物差しで比べる。
        // ⚠️ スナップショットは「機構を持たない敵では null」の作法∴ここで 0 へ正規化する
        //    （grabs/snaps と同じ＝`toBe(0)` が null と食い違わない）
        pounces: e.toadPounces ?? 0, pounceHits: e.toadPounceHits ?? 0,
        pWindup: !!el?.classList.contains('pounce-windup'),
        pAir: !!el?.classList.contains('pounce-air'),
        pounceMsVar: (el?.style.getPropertyValue('--pounce-windup-ms') ?? '').trim(),
        zone: (() => {
          const z = document.getElementById(`toad-pounce-zone-${id}`);
          if (!z) return null;
          return { left: parseFloat(z.style.left) / cellPx, top: parseFloat(z.style.top) / cellPx,
            w: parseFloat(z.style.width) / cellPx, h: parseFloat(z.style.height) / cellPx,
            radius: parseFloat(z.style.borderRadius) / cellPx,
            falling: z.classList.contains('pounce-zone-falling') };
        })(),
        landFx: !!document.querySelector('.toad-pounce-land'),
        // 帯の付け根（char-layer の px 座標）と描いた角度＝絵の口元と先端を数で読む
        stripBase: strip ? [parseFloat(strip.style.left), parseFloat(strip.style.top)] : null,
        stripAng: strip
          ? parseFloat((strip.style.transform.match(/rotate\(([-0-9.e]+)rad\)/) ?? [])[1]) : null,
        newTones: window.__tones.slice(tone0),
      });
    }
    const e = find();
    return { id, cellPx, samples, movedAt,
      end: e && { hp: e.hp, maxHp: e.maxHp, cfg: e.tongue ?? null } };
  }, o);
}

// 相の連（[{ phase, from, to, ticks }]）＝時系列の順序と長さを1つの形で見る
function tongueRuns(samples) {
  const runs = [];
  for (const s of samples) {
    const last = runs[runs.length - 1];
    if (last && last.phase === s.phase) { last.to = s.t; last.ticks++; continue; }
    runs.push({ phase: s.phase, from: s.t, to: s.t, ticks: 1 });
  }
  return runs;
}
// 舌が出ているあいだの連（idle 以外が続く塊の配列）＝錨（出ているあいだ動かない）を
// **一巡ずつ**見るために持つ。全 tick を1つに混ぜると「巡と巡のあいだに跳んだ」ぶんまで
// 錨破りに数えてしまう（＝打ち終わりの間の跳び＝I-⑫ で正しい振る舞い）。
const busyStreaks = (samples) => {
  const runs = [];
  let cur = null;
  for (const s of samples) {
    if ((s.phase ?? 'idle') === 'idle') { cur = null; continue; }
    if (!cur) { cur = []; runs.push(cur); }
    cur.push(s);
  }
  return runs;
};
// 舌の先端（判定側の几何）＝enemy-ai.js `tongueTip` と同じ式（中心＋向き×(体の表面+長さ)）。
// 絵の先端がここに載っているかを測るために持つ（2×2 固定＝I 専用）。
const hitTipOf = (s) => {
  const w = 2, h = 2;
  const ux = Math.cos(s.ang), uy = Math.sin(s.ang);
  let t = Infinity;
  if (Math.abs(ux) > 1e-6) t = Math.min(t, (w / 2) / Math.abs(ux));
  if (Math.abs(uy) > 1e-6) t = Math.min(t, (h / 2) / Math.abs(uy));
  const span = Number.isFinite(t) ? t : 0;
  return { tx: s.x + w / 2 + ux * (span + s.len), ty: s.y + h / 2 + uy * (span + s.len) };
};
// 噛みつきの到達距離（＝舌を離す距離）を meta から導く＝`tongueBiteRange` と同じ導出
const biteRangeOf = (m) => {
  const list = m.attacks ?? (m.attack ? [m.attack] : []);
  const r = Math.max(0, ...list.filter(a => a.type === 'sword').map(a => a.range ?? 0));
  return r > 0 ? r : (m.attack?.range ?? 1.4);
};

// ── I-① データ＝I の層2（舌の綴りと「歩けば離れられる／歩かなければ必ず噛まれる」の算術）──
test('I-① 沼地の大蝦蟇のデータ＝舌は歩幅より遅く引き、帯のどこで掴まれても口元まで届く', () => {
  const m = ENEMY_META['I'];
  const c = m.tongue;
  const KEYS = ['castMs', 'cells', 'cooldownMs', 'holdMs', 'hopCells', 'hopMs',
    'lashSpeed', 'pounceAirMs', 'pounceAtk', 'pounceRadius', 'pounceRecoverMs', 'pounceWindupMs',
    'reelSpeed', 'retractMs'];

  expect(c, 'tongue が無い＝I に固有の移動機構が無い').toBeTruthy();
  // 綴りの番人（`resolveTongue` を読む関数が読むキー＝1文字違うと既定値に落ちて黙って動く）
  expect(Object.keys(c).sort()).toEqual(KEYS);
  // 帯の**内端は持たない**＝噛みつきの到達距離から導く（持つと「どちらも届かない隙間」ができる）
  expect('minRange' in c, 'minRange を持っている＝噛みつきの到達距離と二重に数を持っている')
    .toBe(false);

  // `hitAndAway` は enemyTick の分岐で tongue より優先される∴**明示 false** が要る
  // （W/A/N/J/O/U/G で7回踏んだ罠＝書かないと新機構の分岐へ一度も来ない）。
  expect('hitAndAway' in m, 'hitAndAway を書いていない＝既定の張り付きに戻る余地が残る').toBe(true);
  expect(m.hitAndAway, 'hitAndAway が true ＝tongue の分岐に来ない').toBe(false);
  expect(m.initialModeWeights, '寄り方の抽選が残っている＝読まれない数値（W/O/U/G で外した作法）')
    .toBeUndefined();

  const bite  = biteRangeOf(m);
  const spray = (m.attacks ?? []).find(a => a.type === 'stone');
  expect(bite, '噛みつきの到達距離が 1.4 でない＝帯の内端が動いている').toBe(1.4);
  // ① 到達距離の表に隙間が無い＝噛みつき(0,1.4] → 舌(1.4,6] → その外は毒沫（range 7）と跳ね寄り
  expect(c.cells, '帯の外端が噛みつきの到達距離以下＝舌を打てる間合いが存在しない')
    .toBeGreaterThan(bite);
  expect(spray.range, '毒沫が帯の外端より短い＝帯の外に「何も来ない距離」ができる')
    .toBeGreaterThan(c.cells);
  // ② 歩けば離れられる（引き寄せは操作を奪わない＝払うのは時間）
  expect(c.reelSpeed, '引き寄せがプレイヤーの歩幅以上＝歩いても離れられない（操作を奪う）')
    .toBeLessThan(MOVE_STEP);
  // ③ 歩かなければ必ず口元まで＝`reelSpeed × 掴める tick 数 ≥ 帯の幅`
  //    （満たさないと帯の外端で掴まれた人だけ時間切れで解放される＝規則に穴が空く）
  expect(c.reelSpeed * Math.floor(c.holdMs / TICK_MS),
    '掴んでいられる間に帯の幅を引き切れない＝帯の外端で掴まれても噛まれない穴が残る')
    .toBeGreaterThanOrEqual(c.cells - bite);
  // ④ 伸びる当たり判定は MOVE_STEP 以下に刻める（速くしても判定を飛び越さない）
  expect(c.lashSpeed / Math.max(1, Math.ceil(c.lashSpeed / MOVE_STEP)),
    '舌の1刻みが MOVE_STEP を越える＝プレイヤーを飛び越して当たらない').toBeLessThanOrEqual(MOVE_STEP);
  // ⑤ 予告は時間の床（近接の溜め＝480ms）以上＝見てから動ける長さ
  expect(c.castMs, '予告が近接の溜め（MELEE_WINDUP_MS）より短い＝見てから動けない')
    .toBeGreaterThanOrEqual(MELEE_WINDUP_MS);
  // ⑥ 跳ねて寄る速さ ≪ プレイヤー（GUIDE §7-2）＝自分からは詰めて来ない
  const playerCps = (MOVE_STEP / TICK_MS) * 1000;      // 4.17 セル/秒
  expect((c.hopCells / c.hopMs) * 1000, '跳ねる速さがプレイヤーの半分以上＝自分から詰めて来る')
    .toBeLessThan(playerCps / 2);
  // ⑦ 噛みつきの予告は既定の床に任せる（`windupMs` を書かない＝MELEE_WINDUP_MS）
  const biteAtk = m.attacks.find(a => a.type === 'sword');
  expect(biteAtk.windupMs, '噛みつきに独自の予告時間を書いている＝時間の床から外れる').toBeUndefined();
  // ⑧ のしかかりの算術（2026-09-01・ユーザー報告「盾＋ロウソクでノーダメージ」への答え）。
  //    (a) 半径 ≥ 噛みつきの間合い＝**引き寄せの終点は必ず円の中**（＝掴まれて動かなければ潰される）。
  //        逆にすると引かれた末に「円の外に置かれる」＝終幕の見返りが消える（設計が捻れる）。
  //    (b) 猶予（溜め＋滞空）で**円の外へ歩き切れる**＝見てから避けられる（払うのは操作）。
  //    (c) 予告は時間の床（MELEE_WINDUP_MS）以上＝盾で防げない一撃に「見てから」を保証する。
  //    (d) 着地に硬直がある＝潰した後は殴り返せる（撃ち逃げにならない）。
  //    (e) 打点は噛みつきと同じ atk まで＝盾で防げない一撃を防げる一撃より重くしない
  //        （O の `stampAtk`／U の `diveAtk` と同じ作法）。
  const pounceArith = (cc, label) => {
    expect(cc.pounceRadius, `${label}：のしかかりの半径が噛みつきの間合い（${bite}）より小さい`
      + '＝口元まで引いたのに円の外＝終幕の見返りが消える').toBeGreaterThanOrEqual(bite);
    const graceTicks = Math.floor((cc.pounceWindupMs + cc.pounceAirMs) / TICK_MS);
    expect(graceTicks * MOVE_STEP, `${label}：猶予 ${graceTicks} tick で歩ける `
      + `${(graceTicks * MOVE_STEP).toFixed(2)} セルが円の外（${cc.pounceRadius} − ${bite}）へ`
      + '届かない＝避けられない攻撃になる').toBeGreaterThan(cc.pounceRadius - bite);
    expect(cc.pounceWindupMs, `${label}：のしかかりの溜めが時間の床（MELEE_WINDUP_MS）より短い`
      + '＝盾で防げない一撃を見てから動けない').toBeGreaterThanOrEqual(MELEE_WINDUP_MS);
    expect(cc.pounceRecoverMs, `${label}：着地に硬直が無い＝潰した直後に殴り返せない`)
      .toBeGreaterThan(0);
    expect(cc.pounceAtk, `${label}：のしかかりが噛みつき（atk ${m.atk}）より重い`
      + '＝盾で防げない一撃の方が痛い').toBeLessThanOrEqual(m.atk);
    expect(cc.pounceAtk, `${label}：のしかかりが D8 の防御（DEF 1）で 1 まで削れる＝罰にならない`)
      .toBeGreaterThan(2);
  };
  pounceArith(c, '前半');
  // ⑧ 弱点は炎＝D4 のロウソクが答えになる前提。倍率の**値**はここで固定しない
  //    （2026-08-31：ロウソクが「置き炎」になり連打が効かなくなった代わりに ×2 → ×5 へ。
  //     倍率が妥当かは `tests/candle-flame.spec.js` F-⑦ が戦闘時間の算術で見張る）。
  expect(m.weakness?.type, '弱点が炎でない（D4 のロウソクが答えにならない）').toBe('fire');
  expect(m.weakness?.multiplier, '炎が等倍以下＝弱点になっていない').toBeGreaterThan(1);

  // 後半（HP 50% 以下）＝速く打ち・長く届き・強く引く。ただし上の①〜⑥は**すべて保つ**。
  const p = (m.phases ?? []).find(ph => ph.tongue !== undefined);
  expect(p, '後半の相が舌を差し替えていない＝前半と同じ動きのまま').toBeTruthy();
  expect(p.hpThreshold).toBe(0.5);
  expect(Object.keys(p.tongue).sort(), '後半の綴りが前半と違う＝どれかが既定値に落ちる').toEqual(KEYS);
  expect(p.tongue.castMs, '後半の予告が短くなっていない').toBeLessThan(c.castMs);
  expect(p.tongue.castMs, '後半の予告が時間の床を割った').toBeGreaterThanOrEqual(MELEE_WINDUP_MS);
  expect(p.tongue.cells, '後半の帯が広がっていない').toBeGreaterThan(c.cells);
  expect(p.tongue.reelSpeed, '後半の引きが強くなっていない').toBeGreaterThan(c.reelSpeed);
  expect(p.tongue.reelSpeed, '後半の引きがプレイヤーの歩幅以上＝逃げ道が消える').toBeLessThan(MOVE_STEP);
  expect(p.tongue.reelSpeed * Math.floor(p.tongue.holdMs / TICK_MS),
    '後半は帯が広いのに引き切れない＝外端で掴まれても噛まれない穴ができる')
    .toBeGreaterThanOrEqual(p.tongue.cells - bite);
  expect(spray.range, '後半の帯が毒沫の射程を越えた＝帯の外に何も来ない距離ができる')
    .toBeGreaterThanOrEqual(p.tongue.cells);
  expect((p.tongue.hopCells / p.tongue.hopMs) * 1000,
    '後半の跳ねる速さがプレイヤーの半分以上＝自分から詰めて来る').toBeLessThan(playerCps / 2);
  // 後半のしかかり＝**広く・速く落ちる**。ただし上の(a)〜(e)は**すべて保つ**（避ける余地を残す）。
  pounceArith(p.tongue, '後半');
  expect(p.tongue.pounceRadius, '後半のしかかりの円が広がっていない＝後半の強化が無い')
    .toBeGreaterThan(c.pounceRadius);
  expect(p.tongue.pounceAirMs, '後半の滞空が短くなっていない＝落ちるのが速くなっていない')
    .toBeLessThan(c.pounceAirMs);
  // ⚠️ 溜めだけは**後半でも縮めない**（床のまま）＝盾で防げない一撃の「見てから動く」を守る。
  //    後半の強化を溜めの短縮で払うと、円が広いのに猶予も短い＝避けられない攻撃に化ける。
  expect(p.tongue.pounceWindupMs, '後半でのしかかりの溜めを縮めた＝盾で防げない一撃の予告が'
    + '時間の床を割る（強化は円の広さと落ちる速さで払う）').toBe(c.pounceWindupMs);
  expect(p.tongue.pounceAtk, '後半でのしかかりの打点を上げた＝避けられる技を重くしている')
    .toBe(c.pounceAtk);
  // `speedMultiplier` は `resolveEnemySpeed`（歩幅の溜め）の数＝tongue は読まない∴死んだ数値
  expect(p.speedMultiplier, '相に speedMultiplier が残っている＝tongue は読まない死んだ数値')
    .toBeUndefined();
});

// ── I-② 7相＝idle→cast→lash→hold→pounce→pounceAir→idle の順に回り、絵・音・長さが一致する ──
test('I-② 舌は7相を順に回り、予告の長さ・絵（体が膨らむ）・音が castMs と1対1で対応する', async ({ page }) => {
  const c = ENEMY_META['I'].tongue;
  const out = await trackToad(page, { ticks: 44 });
  const s = out.samples;
  expect(out.error).toBeUndefined();

  // ① 相の順序＝帯の内側に立っているだけで cast から始まり、hold の終わりは**のしかかり**
  //    （＝口元で舌を離し、そのまま跳ぶ。2026-09-01 まではここが idle → 噛みつきだった）
  const runs = tongueRuns(s);
  expect(runs.map(r => r.phase).slice(0, 6),
    '相の順序が idle→cast→lash→hold→pounce→pounceAir になっていない')
    .toEqual(['cast', 'lash', 'hold', 'pounce', 'pounceAir', 'idle']);
  // ② 予告の長さ＝castMs（時計は行動ゲートの外＝噛みつきや毒沫の硬直で伸び縮みしない）
  expect(runs[0].ticks, `予告が ${c.castMs}ms（${c.castMs / TICK_MS} tick）でない`)
    .toBe(c.castMs / TICK_MS);
  // ③ 絵＝予告の tick と `.tongue-windup` が完全に一致し、CSS へ渡す長さも同じ数
  for (const x of s) {
    expect(x.windup, `t${x.t}（相 ${x.phase}）で体の膨らみの有無が相と食い違う`)
      .toBe(x.phase === 'cast');
    if (x.phase === 'cast') {
      expect(x.castMsVar, `t${x.t} で CSS へ渡した予告の長さが castMs と違う`).toBe(`${c.castMs}ms`);
      expect(x.len, `t${x.t}（予告中）に舌が伸びている＝予告が予告になっていない`).toBe(0);
      expect(x.strip, `t${x.t}（予告中）に舌の帯が出ている`).toBe(false);
    }
  }
  // ④ 音＝予告の始まりに1回だけ（GUIDE §7-6）／掴んだ瞬間に1回だけ
  expect(s.filter(x => rang(x.newTones, TONGUE_CAST_HZ)).map(x => x.t),
    '予告の音が「打つ前に1回」でない').toEqual([runs[0].from]);
  expect(s.filter(x => rang(x.newTones, TONGUE_GRAB_HZ)).map(x => x.t),
    '掴んだ音が「掴んだ瞬間に1回」でない').toEqual([runs[2].from]);
  // ⑤ 伸びる＝lashSpeed 刻み（最後の刻みだけ掴んだ／端に当たった分だけ短い）
  const lash = s.filter(x => x.phase === 'lash');
  for (let i = 1; i < lash.length; i++) {
    const d = lash[i].len - lash[i - 1].len;
    expect(d, `t${lash[i].t} で舌が伸びていない`).toBeGreaterThan(0);
    expect(d, `t${lash[i].t} で 1 tick に lashSpeed を越えて伸びた＝判定を飛び越す`)
      .toBeLessThanOrEqual(c.lashSpeed + 1e-9);
  }
  // ⑥ 帯（絵）は**口元から先端まで**の1本＝付け根が体の中・先端が判定の先端に載る。
  //    ⚠️ この2つは実測で踏んだ絵の欠陥の番人（`.scratch/toad-mouth.png`）＝帯を「幾何の
  //       body 表面」から描いていたため (a) 体との間に 0.2 セルの隙間ができ（スプライトの体は
  //       footprint の内側に描かれる）(b) 出どころが**目の高さ**になっていた（口から出ていない）。
  const withStrip = s.filter(x => x.strip && x.len > 0);
  expect(withStrip.length, '舌の帯が一度も出ていない＝機構が絵に出ていない').toBeGreaterThan(3);
  const cell = out.cellPx;
  for (const x of withStrip) {
    // (a) 付け根は体の footprint の中（＝体から浮かない）。しかも**下半分**＝口の高さ
    const [bx, by] = x.stripBase;
    expect(bx / cell, `t${x.t} の帯の付け根（列 ${(bx / cell).toFixed(2)}）が体の外＝舌が体から浮く`)
      .toBeGreaterThanOrEqual(x.x);
    expect(bx / cell, `t${x.t} の帯の付け根が体の外＝舌が体から浮く`).toBeLessThanOrEqual(x.x + 2);
    expect(by / cell, `t${x.t} の帯の付け根（行 ${(by / cell).toFixed(2)}）が体の上半分＝口ではなく`
      + '目の高さから舌が出ている').toBeGreaterThan(x.y + 1);
    expect(by / cell, `t${x.t} の帯の付け根が体の下へ抜けた`).toBeLessThanOrEqual(x.y + 2);
    // (b) 絵の先端＝判定の先端（±0.2 セル＝判定より少し長く描くぶんだけ先）
    const ex = (bx + x.stripW * Math.cos(x.stripAng)) / cell;
    const ey = (by + x.stripW * Math.sin(x.stripAng)) / cell;
    const hit = hitTipOf(x);
    expect(Math.hypot(ex - hit.tx, ey - hit.ty),
      `t${x.t} の絵の先端が判定の先端から離れている＝絵と判定が別の数を読んでいる`)
      .toBeLessThan(0.25);
    if (x.attached) {
      expect(Math.hypot(ex - (x.px + 0.5), ey - (x.py + 0.5)),
        `t${x.t} で掴んでいるのに絵の先端がプレイヤーから離れている`).toBeLessThan(0.6);
    }
  }
  // 幅は長さと一緒に伸びる（絵が状態機械の数を読んでいる＝別の時計で動いていない）
  const lashStrips = withStrip.filter(x => x.phase === 'lash');
  for (let i = 1; i < lashStrips.length; i++) {
    expect(lashStrips[i].stripW, `t${lashStrips[i].t} で帯の幅が伸びていない＝絵が長さを読んでいない`)
      .toBeGreaterThan(lashStrips[i - 1].stripW);
  }
  // ⑦ 掴んでいるあいだだけ帯に `.tongue-attached`（＝引かれていることが絵で分かる）
  for (const x of s) {
    if (!x.strip) continue;
    expect(x.stripAttached, `t${x.t}（相 ${x.phase}）で帯の「掴んでいる」表示が実体と食い違う`)
      .toBe(x.attached);
  }
  // ⑧ 口元まで引き寄せた＝空振りではない（snaps 0）／掴んだのは1回
  //    （見るのは**のしかかりへ移った tick**＝引き寄せの終幕。詳しくは I-⑬）
  const firstPounce = s[runs[3].from - 1];
  expect(firstPounce.phase, '相の連の 4 番目がのしかかりでない').toBe('pounce');
  expect(firstPounce.grabs, '掴んだ回数が1回でない').toBe(1);
  expect(firstPounce.snaps, '口元まで引いたのに空振り（snap）として数えている').toBe(0);
});

// ── I-③ 狙いは予告の終わりに固定＝以後追尾しない（伸びているあいだに退けば空振りする）────
// この本が守るのは設計そのもの＝「予告の終わりに狙いを固定する」。伸びながら追尾する実装に
// すると（＝毎 tick プレイヤーへ向き直す）ここが赤くなる。
test('I-③ 舌は打ち出した向きへ真っすぐ伸びる＝横へ 1 セル退けば空振りして巻き戻る', async ({ page }) => {
  const c = ENEMY_META['I'].tongue;
  const out = await trackToad(page, {
    ticks: 24,
    // 伸び始めてから北へ 2 歩＝1 セル退く（予告中に退いても狙いは固定されていない＝意味が無い）
    moveWhen: { atPhase: 'lash', dir: 'up', steps: 2 },
  });
  const s = out.samples;
  expect(out.movedAt.length, 'プレイヤーが退けていない＝舌が伸びていない').toBe(2);

  // ① 狙いは固定された値＝**予告の終わりのプレイヤーの座標**（湧いた場所のまま）
  const lash = s.filter(x => x.phase === 'lash');
  expect(lash.length, '伸びる相が観測できていない').toBeGreaterThan(2);
  expect(lash[0].aimX, '固定した狙いの列が湧いた場所と違う').toBe(I_PL_COL);
  expect(lash[0].aimY, '固定した狙いの行が湧いた場所と違う').toBe(I_PL_ROW);
  for (const x of lash) {
    expect(x.aimX, `t${x.t} で狙いが更新された＝追尾している`).toBe(lash[0].aimX);
    expect(x.aimY, `t${x.t} で狙いが更新された＝追尾している`).toBe(lash[0].aimY);
    expect(x.ang, `t${x.t} で伸びる向きが変わった＝伸びながら曲がって追いかけている`)
      .toBeCloseTo(lash[0].ang, 9);
  }
  // ② 退いたので掴めない＝空振り（snap）1回・掴み 0回・HP も減らない
  const snapAt = s.findIndex(x => x.snaps >= 1);
  expect(snapAt, '空振りが観測できていない＝1 セル退いても掴まれる（避けられない予告）')
    .toBeGreaterThan(-1);
  expect(s[snapAt].grabs, '退いたのに掴まれている').toBe(0);
  expect(s[snapAt].len, '帯の外端まで伸びる前に空振りした＝届く長さが足りていない')
    .toBeGreaterThanOrEqual(c.cells - 1e-9);
  expect(s[s.length - 1].php, '空振りなのに HP が減っている').toBe(s[0].php);
  // ③ 音＝空振りは tongueSnap（掴んだ音とは別）＝1回だけ
  expect(s.filter(x => rang(x.newTones, TONGUE_SNAP_HZ)).map(x => x.t),
    '空振りの音が1回鳴っていない').toEqual([s[snapAt].t]);
  // ④ 巻き戻しは retractMs かけて**補間**する（長さが単調に減って 0 になる＝瞬間消滅しない）
  const retract = s.filter(x => x.phase === 'retract');
  expect(retract.length, `巻き戻しが ${c.retractMs / TICK_MS} tick でない`)
    .toBe(c.retractMs / TICK_MS);
  for (let i = 1; i < retract.length; i++) {
    expect(retract[i].len, `t${retract[i].t} で巻き戻しが進んでいない`)
      .toBeLessThan(retract[i - 1].len);
  }
  // ⑤ 巻き戻した後は間（cooldownMs）が空く＝空振りの直後に打ち直さない
  const after = s.find(x => x.t > retract[retract.length - 1].t);
  expect(after.phase, '巻き戻した直後に次の舌が始まっている＝間が無い').toBe('idle');
  expect(after.until - after.now, `打ち終わりの間が ${c.cooldownMs}ms でない`)
    .toBeGreaterThan(c.cooldownMs - TICK_MS * 2);
});

// ── I-④ 掴む＝**プレイヤーが動く**（蝦蟇は錨・1歩も動かない）＝13体で唯一の型 ─────────
test('I-④ 掴まれるとプレイヤーが reelSpeed で引かれ、蝦蟇は1歩も動かない', async ({ page }) => {
  const c = ENEMY_META['I'].tongue;
  const out = await trackToad(page, { ticks: 30 });
  const s = out.samples;
  const hold = s.filter(x => x.phase === 'hold');
  expect(hold.length, '掴んでいる相が観測できていない').toBeGreaterThan(5);

  // ① 動くのは**プレイヤーの方**＝毎 tick きっちり reelSpeed だけプレイヤーが運ばれる
  //    （掴んだ tick は引かない∴2つ目の hold から見る）。
  //    ⚠️ 「間合い」の縮みは reelSpeed より僅かに小さい＝斜めに引かれるとき箱の面までの距離
  //       （`enemyEdgeDist`＝軸ごとに 0 で切る）は移動量の一部しか食わない∴ここは
  //       **プレイヤーの移動距離**で測る（間合いは単調に縮むことだけを見る）。
  for (let i = 1; i < hold.length; i++) {
    const moved = Math.hypot(hold[i].px - hold[i - 1].px, hold[i].py - hold[i - 1].py);
    expect(moved, `t${hold[i].t} でプレイヤーが運ばれた距離が reelSpeed と違う（${moved.toFixed(3)}）`)
      .toBeCloseTo(c.reelSpeed, 6);
    const closed = hold[i - 1].reach - hold[i].reach;
    expect(closed, `t${hold[i].t} で間合いが縮んでいない＝引き寄せが空回りしている`)
      .toBeGreaterThan(0);
    expect(closed, `t${hold[i].t} で間合いが reelSpeed より速く縮んだ`)
      .toBeLessThanOrEqual(c.reelSpeed + 1e-9);
  }
  // ② 蝦蟇は錨＝掴んでいるあいだ座標が1ミリも動かない（＝殴れる窓が本当に止まっている）
  for (const x of s.filter(x => x.phase !== 'idle')) {
    expect(x.x, `t${x.t}（舌が出ている）に蝦蟇が横へ動いた＝錨になっていない`).toBe(s[0].x);
    expect(x.y, `t${x.t}（舌が出ている）に蝦蟇が縦へ動いた＝錨になっていない`).toBe(s[0].y);
  }
  // ③ 引かれているのは連続座標＝格子の外の位置を通る（＝「じわじわ引かれる」が絵に出る）
  expect(hold.some(x => Math.round(x.px * 2) !== x.px * 2 || Math.round(x.py * 2) !== x.py * 2),
    '引かれている途中も 0.5 格子の上にしか居ない＝段階的にワープして見える').toBe(true);
  // ④ 舌そのものはダメージ 0（掴まれること自体では減らない）＝痛いのは引かれた先の噛みつき
  for (const x of s.filter(x => x.phase !== 'idle')) {
    expect(x.php, `t${x.t}（舌が出ている）に HP が減った＝舌が打点を持っている`).toBe(s[0].php);
  }
  // ⑤ 向きは掴んでいる相手を向く（絵と機構が食い違わない）
  expect(hold[0].dir, '掴んでいるのに西（プレイヤー側）を向いていない').toBe('left');
});

// ── I-⑤ 引き寄せの終点で**必ずのしかかりが届く**（帯の外端で掴まれても）＋必ず 0.5 格子に戻る ──
// ⚠️ この本は**実測で見つけた2つの欠陥**の再発防止：
//    (a) 終点で格子へ戻すとき四捨五入していた＝間合い 1.27 → 1.5 へ押し戻され、噛みつき（1.4）が
//        永久に届かなかった（引き寄せの見返りが消える）。
//    (b) 帯の外端（6.0）で掴まれると holdMs 2400 では 4.4 セルしか引けず（帯の幅 4.6）、
//        時間切れで解放されていた＝「掴まれたら噛まれる」の規則に穴があった。
// ⚠️ 2026-09-01：終幕は噛みつきではなく**のしかかり**（盾で防げない）＝ユーザー報告への答え。
//    「離した位置が噛みつきの間合いの内側」は**のしかかりの円の内側であることの言い換え**として
//    残す（`pounceRadius ≥ 噛みつきの間合い` は I-① の不変条件）＝(a) の番人はそのまま効く。
test('I-⑤ 帯の外端で掴まれても口元まで引かれ、離した同じ tick にのしかかりの溜めが立つ', async ({ page }) => {
  const m = ENEMY_META['I'];
  const bite = biteRangeOf(m);
  const out = await trackToad(page, { ticks: 44, spawn: I_FAR, debugOff: true });
  const s = out.samples;
  // ① 帯の外端ちょうど（6.0）から始まっている＝(b) を測る前提
  expect(s[0].reach, '湧きが帯の外端（cells）ちょうどでない＝(b) の穴を測れていない')
    .toBeCloseTo(m.tongue.cells, 6);
  expect(s[0].phase, '帯の外端では舌を打たない＝外端が帯に含まれていない').toBe('cast');

  // ② 口元まで引かれて舌を離す（時間切れの snap ではない）＝離した tick はもう `pounce`
  const relAt = s.findIndex((x, i) => i > 0 && x.phase === 'pounce' && s[i - 1].phase === 'hold');
  expect(relAt, '掴んだのに離すところまで届かない＝引き寄せが途中で終わっている').toBeGreaterThan(-1);
  const rel = s[relAt];
  expect(rel.snaps, '時間切れ（snap）で解放された＝帯の外端で掴まれても噛まれない穴が残っている')
    .toBe(0);
  expect(rel.grabs, '掴んだ回数が1回でない').toBe(1);
  // ③ 離した位置＝噛みつきが届く（(a) の番人）かつ **0.5 格子の上**（詰み防止の番人）
  expect(rel.reach, `離した位置の間合い ${rel.reach.toFixed(2)} が噛みつきの到達距離 ${bite} を越えている`
    + '＝引き寄せの終点で噛めない（見返りが消える）').toBeLessThanOrEqual(bite);
  expect(rel.px * 2, `離した位置の列 ${rel.px} が 0.5 格子の上でない＝幅1マスの出入口へ入れなくなる`)
    .toBe(Math.round(rel.px * 2));
  expect(rel.py * 2, `離した位置の行 ${rel.py} が 0.5 格子の上でない＝幅1マスの出入口へ入れなくなる`)
    .toBe(Math.round(rel.py * 2));
  // ④ 離した**同じ tick** にのしかかりの溜めが立つ（窓を空けない＝「引かれた末に潰される」が繋がる）
  expect(rel.phase, '離した tick にのしかかりの溜めが立っていない＝引き寄せと終幕が繋がっていない')
    .toBe('pounce');
  expect(rang(rel.newTones, POUNCE_HZ), 'のしかかりの溜めの音が鳴っていない').toBe(true);
  expect(rel.swingAt, '離した tick に噛みつきの予告も立った＝終幕が二重になっている').toBeNull();
  // ⑤ 溜め＋滞空のぶんだけ遅れて実際に潰される（打点＝pounceAtk − def・盾は関係しない）
  const c = m.tongue;
  const hitAt = s.findIndex((x, i) => i > relAt && x.php < rel.php);
  expect(hitAt, '離した後に一度も潰されない＝引き寄せの終点が空振りになる').toBeGreaterThan(relAt);
  expect(s[hitAt].t - rel.t, `のしかかりが溜め（${c.pounceWindupMs}ms）＋滞空（${c.pounceAirMs}ms）`
    + 'の後に来ていない').toBe((c.pounceWindupMs + c.pounceAirMs) / TICK_MS);
  expect(rel.php - s[hitAt].php, 'のしかかりのダメージが pounceAtk − def と違う')
    .toBe(Math.max(1, c.pounceAtk - rel.pdef));
  expect(s[hitAt].pounceHits, '当てた回数が1回でない').toBe(1);
  expect(rang(s[hitAt].newTones, POUNCE_LAND_HZ), '着地の音が打点と同じ tick に鳴っていない').toBe(true);
  // ⑥ 引き寄せの途中でプレイヤーを壁や水へ押し込んでいない（部屋の内側に居続ける）
  for (const x of s) {
    expect(x.px >= 1 && x.px <= 10, `t${x.t} でプレイヤーが列 ${x.px}＝部屋の外へ引き込まれた`).toBe(true);
    expect(x.py >= 1 && x.py <= 8, `t${x.t} でプレイヤーが行 ${x.py}＝部屋の外へ引き込まれた`).toBe(true);
  }
});

// ── I-⑥ 答え＝歩けば離れられる／引き剥がせなくても holdMs で必ず離される（詰まない保証）────
test('I-⑥ 逆へ歩けば間合いが開いて舌が外れ、外せなくても時間切れで必ず離される', async ({ page }) => {
  const m = ENEMY_META['I'];
  const c = m.tongue;

  // (a) 帯の外へ歩き切る＝掴まれたまま逆へ歩き続けると外れる。
  //     ⚠️ 10×12 の部屋では帯 6 セルの外へ出る助走が取れない∴`cells` だけ 3 に縮めて測る
  //        （縮めても「歩き < 引き」の関係は素のまま＝測るのは引き剥がせるかどうか）。
  const escape = await trackToad(page, {
    ticks: 30, spawn: I_NEAR,
    patch: { tongue: { ...c, cells: 3 } },
    moveWhen: { attached: true, dir: 'left', steps: 12 },
  });
  const es = escape.samples;
  expect(escape.movedAt.length, '掴まれていない＝引き剥がしを測れていない').toBeGreaterThan(2);
  const held = es.filter(x => x.attached);
  expect(held.length, '掴んでいる相が観測できていない').toBeGreaterThan(2);
  // ① 歩いているあいだ間合いは**開いていく**（reelSpeed < MOVE_STEP の差し引き）
  for (let i = 1; i < held.length; i++) {
    expect(held[i].reach, `t${held[i].t} で歩いているのに引き寄せに負けて間合いが縮んだ`)
      .toBeGreaterThan(held[i - 1].reach);
  }
  // ② 帯の外まで開くと外れる（＝空振りと同じ扱い）／時間切れより前に外れている
  const escAt = es.findIndex(x => x.snaps >= 1);
  expect(escAt, '帯の外まで歩いても舌が外れない＝歩いて離れられない（操作を奪っている）')
    .toBeGreaterThan(-1);
  // 外れた tick の間合いは帯の外端まで開いている＝**帯の外へ出たから**外れた。
  // ⚠️ ちょうど外端（3.00）で観測されるのは、外した後に 0.5 格子へ戻すとき**敵側の格子点**を
  //    選ぶため（外れた瞬間の値は帯の外・戻した後は外端）＝詰み防止の作法の裏返し。
  expect(es[escAt].reach, '帯の内側なのに外れた＝歩いた結果ではない別の理由で解放されている')
    .toBeGreaterThanOrEqual(3);
  expect(es[escAt - 1].reach, '帯の外へ出る前の tick で既に外れていた').toBeLessThan(3);
  const grabbedAt = es.find(x => x.attached);
  expect(es[escAt].now - grabbedAt.now, '時間切れで外れた＝歩いた結果ではない')
    .toBeLessThan(c.holdMs);
  // ③ 外れた後もプレイヤーは 0.5 格子の上（詰み防止）
  expect(es[escAt].px * 2, '引き剥がした後に 0.5 格子から外れたまま').toBe(Math.round(es[escAt].px * 2));
  expect(es[escAt].py * 2, '引き剥がした後に 0.5 格子から外れたまま').toBe(Math.round(es[escAt].py * 2));
  expect(es[escAt].php, '引き剥がしただけで HP が減っている').toBe(es[0].php);

  // (b) 壁を背にして引き剥がせない場合＝**必ず** holdMs で離される（＝詰まない保証）。
  //     西の壁ぎわ（(4,2) から西へ歩くと 1 セルで壁）＝歩いても壁で止まる。
  //     ⚠️ 2026-09-01：帯を 6 → 5 に狭めた∴壁ぎわ（間合い 6.0）は**帯の外**＝西へ歩くと
  //        「外へ出た」で外れてしまい時間切れを測れない（実測：掴んだ 1 tick 後に外れた）。
  //        ∴(a) が `cells` を縮めて引き剥がしを測るのと対称に、ここは `cells` を部屋の対角
  //        （≈7.6）より長くして**どこへ歩いても帯の外へ出られない**状態を作る。
  //        縮める／伸ばすのは帯だけ＝`holdMs`・`reelSpeed` は素のまま∴測るのは時計そのもの。
  const pinned = await trackToad(page, {
    ticks: 44, patch: { tongue: { ...c, cells: 9 } },
    moveWhen: { attached: true, dir: 'left', steps: 40 },
  });
  const ps = pinned.samples;
  const grab = ps.find(x => x.attached);
  expect(grab, '掴まれていない＝時間切れを測れていない').toBeTruthy();
  const outAt = ps.findIndex(x => x.snaps >= 1);
  expect(outAt, '壁を背にすると永久に掴まれたまま＝詰む（holdMs の保証が効いていない）')
    .toBeGreaterThan(-1);
  // 時間切れは holdMs のところで来る（1 tick の刻みぶんだけ後）
  expect(ps[outAt].now - grab.now, `時間切れが holdMs（${c.holdMs}ms）で来ていない`)
    .toBeGreaterThanOrEqual(c.holdMs);
  expect(ps[outAt].now - grab.now, '時間切れが holdMs より大きく遅れている')
    .toBeLessThan(c.holdMs + TICK_MS * 2);
  // 引き剥がせなかった＝噛みつきの間合いには入っていない（＝時間切れの解放と離すのは別物）
  expect(ps[outAt].reach, '時間切れの時点で噛みつきの間合いに居る＝これは離す（release）の側')
    .toBeGreaterThan(biteRangeOf(m));
  expect(ps[outAt].px * 2, '時間切れの後に 0.5 格子から外れたまま').toBe(Math.round(ps[outAt].px * 2));
  expect(ps[outAt].py * 2, '時間切れの後に 0.5 格子から外れたまま').toBe(Math.round(ps[outAt].py * 2));
});

// ── I-⑦ 舌が出ているあいだは移動も攻撃もしない＝引かれている時間が「殴れる窓」になる ────
// ⚠️ 歯＝**舌が終わった直後に攻撃が出る**こと（＝止めていたのは行動ゲートで、そもそも
//    出せる状態だった）。これが無いと「たまたま出さなかった」だけで本が緑になる。
test('I-⑦ 舌が出ているあいだ噛みつきも毒沫も出ない（直後に攻撃が出る＝止めていた証拠）', async ({ page }) => {
  const out = await trackToad(page, { ticks: 40, spawn: I_FAR, debugOff: true });
  const s = out.samples;
  const busy = s.filter(x => x.phase !== 'idle');
  expect(busy.length, '舌が出ている tick が足りない＝窓の長さを測れていない').toBeGreaterThan(20);

  for (const x of busy) {
    expect(x.swingAt, `t${x.t}（舌が出ている）に噛みつきの予告が立った＝錨が効いていない`).toBeNull();
    expect(x.freezeUntil, `t${x.t}（舌が出ている）に攻撃硬直が立った＝攻撃を解決している`).toBeNull();
    expect(x.projectiles, `t${x.t}（舌が出ている）に毒沫が飛んだ＝錨が効いていない`).toBe(0);
  }
  // 舌が終わった直後に攻撃が出る＝ずっと「出せるのに出さなかった」
  // ⚠️ 2026-09-01：終幕がのしかかりになった＝着地に硬直（`pounceRecoverMs`）が入る∴「同じ tick か
  //    次の tick」では**もう緑にならない**（硬直は設計）。∴測るのは**硬直が明けた直後に出る**こと
  //    ＝待たされた理由が「舌の錨 → 着地の硬直」だけで説明でき、クールダウン待ちではないこと。
  // ⚠️ 2026-09-06（0u-2）：証拠を**毒沫から「噛みつきの予告または毒沫」へ広げた**。毒沫は
  //    `minRange 2.0` を持った＝引き寄せの終点（噛みつきの間合い 1.4 の内側）では**設計どおり
  //    飛ばない**∴「直後に毒沫が飛ぶ」はもう成り立たない。毒沫が来ない理由が「撃てないから」
  //    ではなく「近すぎるから」であることは、この後の間合いの数で確かめる。
  const recoverTicks = Math.ceil(ENEMY_META['I'].tongue.pounceRecoverMs / TICK_MS);
  const lastBusy = busy[busy.length - 1];
  const firstAct = s.find(x => x.t > lastBusy.t && (x.swingAt !== null || x.projectiles >= 1));
  expect(firstAct, '舌が終わっても噛みつきも毒沫も一度も出ない＝止めていた証拠が無い').toBeTruthy();
  expect(firstAct.t - lastBusy.t, '攻撃が着地の硬直より早く出た＝硬直が効いていない')
    .toBeGreaterThan(recoverTicks - 2);
  expect(firstAct.t - lastBusy.t, '攻撃が着地の硬直（'
    + `${ENEMY_META['I'].tongue.pounceRecoverMs}ms＝${recoverTicks} tick）より遅れて出た`
    + '＝クールダウン待ちだった可能性').toBeLessThanOrEqual(recoverTicks + 2);
  // 毒沫が来ないのは撃てないからではなく**近すぎるから**（0u-2 の下限）＝引き寄せの終点は密着。
  const spray = ENEMY_META['I'].attacks.find(a => a.type === 'stone');
  expect(firstAct.reach, `錨が解けた時点の間合い ${firstAct.reach.toFixed(2)} が毒沫の下限`
    + ` ${spray.minRange} の外＝この本の前提（引き寄せの終点は噛みつきの間合い）が崩れている`)
    .toBeLessThan(spray.minRange);
});

// ── I-⑧ 到達距離の表に隙間が無い（噛みつきの外なら必ず舌）／帯の外は跳ねて寄る ─────────
test('I-⑧ 噛みつきのすぐ外（1.41）でも舌が来て、帯の外では跳ねて寄る', async ({ page }) => {
  const m = ENEMY_META['I'];
  const c = m.tongue;
  const bite = biteRangeOf(m);

  // (a) 噛みつきの到達距離のすぐ外＝**ここが実測で踏んだ隙間**（旧 minRange 1.8 では毒沫だけ）
  const near = await trackToad(page, { ticks: 16, spawn: I_EDGE, debugOff: true });
  const ns = near.samples;
  expect(ns[0].reach, '湧きの間合いが「噛みつきの外・帯の内」でない＝隙間を測れていない')
    .toBeGreaterThan(bite);
  expect(ns[0].reach, '湧きの間合いが帯の外＝隙間を測れていない').toBeLessThanOrEqual(c.cells);
  expect(ns[0].phase, `間合い ${ns[0].reach.toFixed(2)}（噛みつき ${bite} のすぐ外）で舌を打たない`
    + '＝噛みつきも舌も届かない隙間ができている').toBe('cast');
  // 掴んで口元まで引き、のしかかりへ繋ぐ（＝隙間ではなく「舌の帯の内側」として扱われている）
  const relAt = ns.findIndex((x, i) => i > 0 && x.phase === 'pounce' && ns[i - 1].phase === 'hold');
  expect(relAt, 'すぐ外から掴んだのに離すところまで来ない').toBeGreaterThan(-1);
  expect(ns[relAt].reach, '離した位置がのしかかりの円の外＝終幕の見返りが消える')
    .toBeLessThanOrEqual(c.pounceRadius);
  expect(ns[relAt].reach, '離した位置で噛みつきが届かない').toBeLessThanOrEqual(bite);

  // (b) 帯の外＝舌は打たず、跳ねて寄る（1回の跳びが hopCells・**帯へ入るまで跳び続ける**）
  //     ⚠️ 2026-09-01：帯を 6 → 5 に狭めた∴帯の外（6.71）から 1 回の跳び（1.5）では
  //        帯へ入らない（5.21）。「1回で入る」を固定すると帯を触るたびに嘘になる∴
  //        測るのは **① 1回の跳びが hopCells ② 跳びの間隔が hopMs ③ 帯へ入るまで跳び続ける
  //        ④ 入ったら舌へ切り替わり自分からは詰めない**の4点（跳びの回数は帯と部屋の広さの
  //        引き算＝データ側の話∴固定しない）。
  const far = await trackToad(page, { ticks: 30, spawn: I_OUT });
  const fs = far.samples;
  const spawnReach = Math.hypot(I_COL - 0.5 - I_OUT.col, I_ROW + 0.5 - I_OUT.row);
  expect(fs[0].phase, '帯の外なのに舌を打った＝帯の外端が効いていない').toBe('idle');
  const hop = Math.hypot(fs[0].x - I_COL, fs[0].y - I_ROW);
  expect(hop, `跳んだ距離が hopCells（${c.hopCells}）と違う`).toBeCloseTo(c.hopCells, 6);
  expect(fs[0].reach, '跳んでも間合いが縮んでいない＝プレイヤーの方へ跳んでいない')
    .toBeLessThan(spawnReach);
  // ② 跳びの**間隔**は hopMs（＝跳ぶたびに hopMs 待つ）。
  //    ⚠️ これが無いと「毎 tick 1.5 セル跳ぶ（＝プレイヤーの 3 倍で滑って来る）」実装でも
  //       緑になる（実測で踏んだ穴：`_toadHopAt` の門を外しても本が1つも赤くならなかった）。
  const hopTicks = [];
  for (let i = 0; i < fs.length; i++) {
    const px = i === 0 ? I_COL : fs[i - 1].x, py = i === 0 ? I_ROW : fs[i - 1].y;
    if (Math.hypot(fs[i].x - px, fs[i].y - py) > 1e-9) hopTicks.push(fs[i].t);
  }
  expect(hopTicks.length, '跳びが1回しか観測できていない＝間隔を測れない').toBeGreaterThan(1);
  for (let i = 1; i < hopTicks.length; i++) {
    expect(hopTicks[i] - hopTicks[i - 1], `t${hopTicks[i]} の跳びが前の跳びから`
      + `${hopTicks[i] - hopTicks[i - 1]} tick しか経っていない（hopMs ${c.hopMs}ms）`)
      .toBeGreaterThanOrEqual(Math.floor(c.hopMs / TICK_MS));
  }
  // ③ 帯の外に居るあいだは舌を打たず、跳び続けて帯の内側へ入る
  const inAt = fs.findIndex(x => x.reach <= c.cells);
  expect(inAt, '跳び続けても帯の内側へ入らない＝寄って来ない（置物に見える）').toBeGreaterThan(-1);
  for (const x of fs.slice(0, inAt)) {
    expect(x.phase, `t${x.t}（間合い ${x.reach.toFixed(2)}＝帯の外）で舌を打った`).toBe('idle');
  }
  // ④ 帯の内側に入ったら舌へ切り替わる（同じ tick か次の tick＝跳んだ tick は寄っただけ）
  const castAt = fs.findIndex(x => x.phase === 'cast');
  expect(castAt, '帯の内側へ入っても舌を打たない').toBeGreaterThan(-1);
  expect(castAt - inAt, '帯の内側に入る前に舌を打った').toBeGreaterThanOrEqual(0);
  expect(castAt - inAt, '帯の内側に入ってから舌までに間がある＝寄ったまま固まる tick がある')
    .toBeLessThanOrEqual(1);
  // 舌が出ているあいだは錨＝跳ねない（＝引かれている時間が殴れる窓のまま）
  for (const run of busyStreaks(fs)) {
    for (const x of run) {
      expect(x.x, `t${x.t}（舌が出ている）に跳ねた＝錨が効いていない`).toBe(run[0].x);
      expect(x.y, `t${x.t}（舌が出ている）に跳ねた＝錨が効いていない`).toBe(run[0].y);
    }
  }
  // 自分からは噛みつきの間合いへ詰めない（＝寄って来るのは舌を打てる位置まで）
  for (const x of fs.slice(0, castAt + 1)) {
    expect(x.reach, `t${x.t} で自分から噛みつきの間合い（${bite}）へ詰めて来た`).toBeGreaterThan(bite);
  }
});

// ── I-⑨ 相の差し替え＝HP 半分で舌の設定が変わり、掴んだままのプレイヤーは格子へ戻される ────
// ⚠️ boss.js `applyBossPhase` は相を畳むだけ（`_tongueAttached` は消さない）＝格子へ戻す後始末は
//    enemy-ai.js `tickTongue` の入口が受け持つ（deps を持つのがこちら側だけ∴役割を分けている）。
//    ここを両方が畳むと「掴まれたまま半端な位置で放置」＝出入口へ入れなくなる詰みが復活する。
test('I-⑨ HP 半分で舌の設定が差し替わり、掴んでいた舌は畳まれてプレイヤーが格子へ戻る', async ({ page }) => {
  const m = ENEMY_META['I'];
  const pc = m.phases.find(p => p.tongue !== undefined).tongue;
  await installToneRec(page);
  await gotoFrozen(page, previewUrl('bal_swamp_toad', I_PL_ROW, I_PL_COL, D8_PRE));
  const out = await page.evaluate((a) => {
    const g = window.__game;
    const id = g.getEnemies().find(e => e.type === 'I').id;
    const find = () => g.getEnemies().find(e => e.id === id);
    const strip = () => document.getElementById(`enemy-tongue-${id}`);
    // 掴まれてから2 tick 引かれるまで進める＝**プレイヤーが格子の外に居る**状態で切り替える
    // （掴んだ tick はまだ引いていない＝格子の上∴そこで切り替えると後始末を測れない）。
    let guard = 0;
    while (!find().tongueAttached && guard++ < 60) g.step(1);
    for (let k = 0; k < 2 && find().tongueAttached; k++) g.step(1);
    const p0 = g.getPlayer();
    const before = {
      attached: !!find().tongueAttached, phase: find().tonguePhase, cfg: find().tongue ?? null,
      px: p0.x, py: p0.y, strip: !!strip(),
    };
    g.dealDamage(id, a.dmg);
    const at = {
      hp: find().hp, maxHp: find().maxHp, cfg: find().tongue ?? null,
      phase: find().tonguePhase, len: find().tongueLen, attached: !!find().tongueAttached,
    };
    g.step(1);
    const p1 = g.getPlayer();
    const after = {
      attached: !!find().tongueAttached, phase: find().tonguePhase,
      px: p1.x, py: p1.y, strip: !!strip(),
    };
    // 次の舌が始まるまで進める＝新しい設定（短い予告）で打つことを確かめる
    let cast = 0, seen = 0;
    for (let t = 0; t < 40; t++) {
      g.step(1);
      if (find().tonguePhase === 'cast') { cast++; seen = 1; } else if (seen) break;
    }
    return { before, at, after, castTicks: cast };
  }, { dmg: Math.ceil(m.hp / 2) + m.def });

  // 前提＝引き寄せの途中（掴んでいる・素の設定）で切り替えた
  expect(out.before.attached, '掴まれる前に相を切り替えた＝後始末を測れていない').toBe(true);
  expect(out.before.phase).toBe('hold');
  expect(out.before.cfg, '最初から相の設定が入っている＝素の設定を測っていない').toBeNull();
  expect(out.before.strip, '掴んでいるのに舌の帯が出ていない').toBe(true);
  // この本が意味を持つ前提＝切り替えの瞬間にプレイヤーが 0.5 格子の**外**に居る
  // （既に格子の上なら「格子へ戻す後始末」を測ったことにならない＝歯の無い本になる）
  expect(out.before.px * 2 !== Math.round(out.before.px * 2)
    || out.before.py * 2 !== Math.round(out.before.py * 2),
  '切り替えの瞬間にプレイヤーが既に格子の上＝格子へ戻す後始末を測れていない').toBe(true);
  expect(out.at.hp / out.at.maxHp, 'HP が半分を割っていない＝相が発火していない').toBeLessThanOrEqual(0.5);

  // ① 設定が差し替わる（`resolveTongue` が読む口＝`_tongue`）＝後半の舌になる
  expect(out.at.cfg, '後半の舌が差し替わっていない').toEqual(pc);
  // ② 相は畳まれる（伸びも長さも持ち込まない＝新しい設定の外側の1 tick を作らない）
  expect(out.at.phase, '相が畳まれていない＝古い相のまま新しい設定で走る').toBe('idle');
  expect(out.at.len, '舌の長さが持ち込まれている').toBe(0);
  // ③ 掴んでいた実体は**次の tick で** enemy-ai.js が畳み、プレイヤーは 0.5 格子へ戻る
  expect(out.after.attached, '掴んだままの実体が残っている＝引き寄せが幽霊として続く').toBe(false);
  expect(out.after.px * 2, `切り替え後の列 ${out.after.px} が 0.5 格子の上でない＝出入口へ入れなくなる`)
    .toBe(Math.round(out.after.px * 2));
  expect(out.after.py * 2, `切り替え後の行 ${out.after.py} が 0.5 格子の上でない＝出入口へ入れなくなる`)
    .toBe(Math.round(out.after.py * 2));
  // 格子へ戻すだけ＝ワープさせない（各軸 0.5 セル以内）
  expect(Math.abs(out.after.px - out.before.px), '切り替えでプレイヤーが飛んだ').toBeLessThanOrEqual(0.5);
  expect(Math.abs(out.after.py - out.before.py), '切り替えでプレイヤーが飛んだ').toBeLessThanOrEqual(0.5);
  expect(out.after.strip, '畳んだのに舌の帯が絵として残っている').toBe(false);
  // ④ 次に打つ舌は**後半の長さの予告**（＝差し替えた数が実際に効いている）
  expect(out.castTicks, `後半の予告が ${pc.castMs}ms（${pc.castMs / TICK_MS} tick）でない`)
    .toBe(pc.castMs / TICK_MS);
});

// ── I-⑩ I の移動機構は W・A・N・J・O・U・G のどれとも重ならない（0d-3 の判定基準）────────
test('I-⑩ 舌の使い手は I だけ・I は他の7体の移動機構を持たない', () => {
  const im = mechanismsOf(ENEMY_META['I']);
  const others = ['W', 'A', 'N', 'J', 'O', 'U', 'G'].map(k => mechanismsOf(ENEMY_META[k]));
  expect(im.has('tongue'), 'I が移動機構（tongue）を持っていない').toBe(true);
  expect([...im].filter(k => others.every(x => !x.has(k))).length,
    'I に他の7体が持たない機構が1つも無い＝8体目の型になっていない').toBeGreaterThan(0);
  expect(others.some(x => x.has('tongue')),
    '他のボスが舌を持っている＝I の固有機構ではない').toBe(false);
  const users = Object.entries(ENEMY_META).filter(([, m]) => m.tongue).map(([k]) => k);
  expect(users, '舌を持つ敵が I 以外にも居る（設計が重複した）').toEqual(['I']);
  // 借り物でない番人＝特に `momentum`（G）や `dash`（ω/A）が生えた瞬間に「自分から詰めて来る」
  // ＝「動くのは相手の方」という8体目の意味が消える。
  for (const k of ['combat', 'laneStalk', 'burrowAmbush', 'hide', 'dash', 'coil', 'gaze',
    'soar', 'momentum', 'leap']) {
    expect(ENEMY_META['I'][k], `${k} を持っている＝W/A/N/J/O/U/G の型を借りている`).toBeUndefined();
  }
  for (const p of ENEMY_META['I'].phases ?? []) {
    for (const k of ['dash', 'coil', 'hide', 'gaze', 'soar', 'momentum']) {
      expect(p[k], `後半に ${k} が生えている＝他のボスの後半と同じ型`).toBeUndefined();
    }
  }
});

// ── I-⑪ 検証ステージの幾何（GUIDE §4-3）＝帯と跳び寄りを同じ部屋で測れる ─────────────
test('I-⑪ bal_swamp_toad は 10×12・外周は通路以外すべて壁・I が (4,7) に1体だけ・遮蔽ゼロ', () => {
  const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
  const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  const sd = MAP.layers[TEST_LAYER].stages[stageKey('bal_swamp_toad')];
  expect(sd.rows).toBe(10);
  expect(sd.cols).toBe(12);
  // 遮蔽ゼロ＝舌が途中で止まる理由は**外周の壁だけ**（沼の水を敷くと引き寄せの測定が地形のせいになる）
  expect(Object.keys(sd.bgTiles ?? {}), '別地形が入った＝舌と引き寄せの測定が地形のせいになる')
    .toEqual([]);

  const at = (r, c) => sd.tiles[r][c];
  const toads = [];
  for (let r = 0; r < sd.rows; r++) {
    for (let c = 0; c < sd.cols; c++) {
      const ch = at(r, c);
      if (ch === TILE.SWAMP_TOAD) { toads.push([r, c]); continue; }
      if (r === 6 && c === 1) continue;              // 看板 i（南の通路の脇）
      const edge = r === 0 || c === 0 || r === sd.rows - 1 || c === sd.cols - 1;
      const want = edge && !isArenaDoor(r, c, sd.cols) ? TILE.WALL : TILE.FLOOR;
      expect(at(r, c), `(${r},${c}) が想定と違う`).toBe(want);
    }
  }
  expect(toads, 'I が1体だけ (4,7) に居る前提が崩れた').toEqual([[I_ROW, I_COL]]);

  // この節の湧きが全部床＝各本の前提（間合いは `enemyEdgeDist` と同じ式で出す）
  const edgeDist = (row, col) => Math.hypot(
    Math.max(0, Math.abs(col - (I_COL + 0.5)) - 0.5),
    Math.max(0, Math.abs(row - (I_ROW + 0.5)) - 0.5));
  const c = ENEMY_META['I'].tongue;
  const bite = biteRangeOf(ENEMY_META['I']);
  for (const [name, sp] of [['帯の内側', { row: I_PL_ROW, col: I_PL_COL }], ['帯の外端', I_FAR],
    ['噛みつきのすぐ外', I_EDGE], ['西に助走', I_NEAR], ['帯の外', I_OUT], ['退く余地つき', I_MID]]) {
    expect(at(sp.row, sp.col), `${name}の湧き(${sp.row},${sp.col}) が床でない`).toBe(TILE.FLOOR);
  }
  // I-⑫ の前提＝帯の内側で北へ 1 セル退いてもまだ帯の内側（＝跳ぶ理由が「打ち終わりの間」だけになる）
  expect(edgeDist(I_MID.row, I_MID.col), '「退く余地つき」の湧きが帯の外').toBeLessThanOrEqual(c.cells);
  expect(edgeDist(I_MID.row - 1, I_MID.col), '北へ 1 セル退くと帯の外＝帯の外の跳びと区別できない')
    .toBeLessThanOrEqual(c.cells);
  expect(at(I_MID.row - 1, I_MID.col), '「退く余地つき」の北が床でない').toBe(TILE.FLOOR);
  // 帯の外端ちょうど（5.0）と帯の外（> 5.0）の両方がこの部屋に在る＝舌と跳び寄りを同じ舞台で測れる
  expect(edgeDist(I_FAR.row, I_FAR.col), '帯の外端ちょうどの立ち位置が無い').toBeCloseTo(c.cells, 6);
  expect(edgeDist(I_OUT.row, I_OUT.col), '帯の外に立てる場所が無い＝跳び寄りを測れない')
    .toBeGreaterThan(c.cells);
  // 帯の外の床が**部屋の1割以上**ある＝跳び寄りが実プレイで成立する（GUIDE §7-15）。
  // ⚠️ 2026-09-01 のユーザー実プレイ報告「なぜか全然移動しなかった」の再発防止。帯 6 では
  //    この部屋の床 82 枚のうち帯の外は 7 枚（8.5%）＝**跳ぶ条件が事実上立たない**＝置物に見えた
  //    （帯 5 で 15 枚＝18.3%）。帯を広げ直すとここが赤くなる。
  let floors = 0, outside = 0;
  for (let r = 0; r < sd.rows; r++) {
    for (let cc = 0; cc < sd.cols; cc++) {
      if (at(r, cc) !== TILE.FLOOR) continue;
      floors++;
      if (edgeDist(r, cc) > c.cells) outside++;
    }
  }
  expect(outside / floors, `帯の外の床が ${outside}/${floors} しかない`
    + '＝プレイヤーが帯の外に居ることが稀＝跳ねて寄る姿が実プレイで見えない').toBeGreaterThan(0.1);
  // 噛みつきのすぐ外（＝実測で踏んだ隙間）に立てる
  const gap = edgeDist(I_EDGE.row, I_EDGE.col);
  expect(gap, '噛みつきのすぐ外に立てる場所が無い＝隙間の再発を測れない').toBeGreaterThan(bite);
  expect(gap, '「噛みつきのすぐ外」が帯の外だった').toBeLessThanOrEqual(c.cells);
  // 西の助走＝引き剥がしの測定（I-⑥）が地形で止まらない
  for (let col = 1; col < I_NEAR.col; col++) {
    expect(at(I_NEAR.row, col), `(${I_NEAR.row},${col}) が床でない＝西へ引き剥がす助走が無い`)
      .toBe(TILE.FLOOR);
  }
});

// ── I-⑫ 打ち終わりの間（cooldownMs）は帯の内側でも跳ねる＝同じ地点から2度引かない ──────────
// ⚠️ この本は 2026-09-01 のユーザー実プレイ報告「なぜか全然移動しなかった」への答え。
//    設計どおり（帯の内側では舌を打つだけ）でも、舌の一巡が約 7 秒ある∴プレイヤーから見ると
//    ボスは**置物**だった。∴「舌の仕事の外＝打ち終わりの間」だけ跳ねて位置を変える。
// ⚠️ 歯＝**帯の内側で**跳ぶこと（`enemy-ai.js` の `inBand && !cooling` を `inBand` へ戻すと赤）。
//    ∴湧きは「北へ 1 セル退いてもまだ帯の内側」の場所（I-⑪ が幾何を見張る）＝跳んだ理由が
//    「帯の外へ出たから」に化けない。
test('I-⑫ 空振りの後、帯の内側でも打ち終わりの間だけ跳ねて寄る（噛みつきの間合いへは詰めない）', async ({ page }) => {
  const m = ENEMY_META['I'];
  const c = m.tongue;
  const bite = biteRangeOf(m);
  // I-③ と同じ recipe＝伸びているあいだに北へ 1 セル退いて空振りさせる（狙いは固定∴当たらない）
  const out = await trackToad(page, {
    ticks: 40, spawn: I_MID, moveWhen: { atPhase: 'lash', dir: 'up', steps: 2 },
  });
  const s = out.samples;
  expect(out.movedAt.length, 'プレイヤーが退けていない＝空振りを作れていない').toBe(2);
  const snapAt = s.findIndex(x => x.snaps >= 1);
  expect(snapAt, '空振りが観測できていない＝打ち終わりの間を測れていない').toBeGreaterThan(-1);

  // 打ち終わりの間＝相が idle かつ次の舌までの時計が生きている tick
  const coolFrom = s.findIndex(x => x.phase === 'idle' && x.until != null && x.now < x.until);
  expect(coolFrom, '打ち終わりの間が観測できていない').toBeGreaterThan(0);
  const cooling = s.filter(x => x.phase === 'idle' && x.until != null && x.now < x.until);
  expect(cooling.length, '打ち終わりの間が短すぎる＝跳ぶ余地を測れていない').toBeGreaterThan(4);
  // ① その窓のあいだ**プレイヤーは帯の内側に居る**＝跳んだ理由は「帯の外」ではない
  for (const x of cooling) {
    expect(x.reach, `t${x.t} でプレイヤーが帯の外（${x.reach.toFixed(2)}）`
      + '＝帯の外の跳び寄りと区別できていない').toBeLessThanOrEqual(c.cells);
  }
  // ② その窓のあいだに跳んだ＝位置が変わった（ここが「置物」への答え）。
  //    ⚠️ 比べるのは**打ち終わる直前（舌が出ていた＝錨の位置）**と窓の終わり。窓の中だけで
  //       比べると赤くならない＝跳ぶのは窓の**最初の tick**（実測：t14 で 1.26 セル跳ぶ）。
  const anchor = s[coolFrom - 1], last = cooling[cooling.length - 1];
  const hopped = Math.hypot(last.x - anchor.x, last.y - anchor.y);
  expect(hopped, '打ち終わりの間に一歩も動かない＝帯の内側では置物のまま').toBeGreaterThan(0.05);
  expect(hopped, `1回の跳びが hopCells（${c.hopCells}）より大きい＝寄り方が粗い`)
    .toBeLessThanOrEqual(c.hopCells + 1e-9);
  // ③ 寄った＝間合いは縮む（プレイヤーの方へ跳んでいる）
  expect(last.reach, '打ち終わりの間に跳んだのに間合いが縮んでいない').toBeLessThan(anchor.reach);
  // ④ ただし**自分から噛みつきの間合いへは詰めない**（＝寄られても殴り返す間合いは残る）
  //    ⚠️ 掴まれてからは「引かれた結果」＝自分で詰めたのではない∴最初に掴まれるまでを見る。
  const grabAt = s.findIndex(x => x.attached);
  for (const x of s.slice(0, grabAt === -1 ? s.length : grabAt)) {
    expect(x.reach, `t${x.t} で自分から噛みつきの間合い（${bite}）へ詰めて来た`)
      .toBeGreaterThan(bite);
  }
  // ⑤ 舌が出ているあいだは錨＝跳ばない（引かれている時間が殴れる窓のまま）
  const streaks = busyStreaks(s);
  expect(streaks[0]?.length ?? 0, '舌が出ている tick が無い＝錨を測れていない').toBeGreaterThan(4);
  for (const run of streaks) {
    for (const x of run) {
      expect(x.x, `t${x.t}（舌が出ている）に跳ねた＝錨が効いていない`).toBe(run[0].x);
      expect(x.y, `t${x.t}（舌が出ている）に跳ねた＝錨が効いていない`).toBe(run[0].y);
    }
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// I-⑬〜⑮＝のしかかり（2026-09-01 追加）＝**盾で防げない終幕**
// ══════════════════════════════════════════════════════════════════════════════
// ユーザー実プレイ報告（2026-09-01）：「舌でひきこまれる、ろうそくで火をつける／これを繰り返す
// だけでノーダメージで倒せてしまう。（攻撃は盾で防御できてしまう）／ジャンプして、プレーヤーに
// 体当たりしてくる、みたいな攻撃を加える、とか／何かしら付け加える必要がありそう。」
//
// 何が起きていたか（実測で裏取り）＝I の打点は噛みつき（`sword`）と毒沫（`stone`）の2つだけ＝
// **どちらも盾が向きだけで消せる**。しかも弱点の炎（ロウソク）を当てるにも引き寄せられるにも
// 蝦蟇の方を向く必要がある∴**「焼くために向く」＝「防ぐために向く」**＝完全防御が成立していた。
//   ・張り付いて焼き続ける戦法：22.9 秒で撃破・**被弾 0**（`.scratch/toad-turtle.mjs`）
//   ・のしかかりを入れた後：同じ戦法は t170 で**プレイヤーが力尽きる**（7回跳ばれ 7回被弾）
//   ・下がりながら焼く戦法：32 秒で撃破・被弾 16（＝「下がる」が答えとして機能している）
// ∴この3本が守るのは **「向いて焼くだけでは無傷で終わらない／下がれば避かる」** の両立。
//
// ⚠️ 測り方の罠（ここで実際に踏んだ）＝プレビュー（`fromEditor=1`）は `debugMode: true`＝
//    `takeDamage()` が早期 return する∴**`debugOff: true` を忘れると被弾が永久に 0**＝
//    「盾で防げない」の本が**歯なしで緑**になる（潰しても赤くならない）。下の3本すべてで渡す。

// ── I-⑬ のしかかりの一巡＝溜め（沈む）→ 滞空 → 着地。長さ・床の告知・硬直が数と一致する ────
test('I-⑬ 引き寄せの終幕でのしかかる＝溜め→滞空→着地の長さ・床の危険域・着地の硬直が数と一致', async ({ page }) => {
  const c = ENEMY_META['I'].tongue;
  const r = c.pounceRadius;
  const out = await trackToad(page, { ticks: 50, spawn: I_FAR, debugOff: true });
  const s = out.samples;
  const runs = tongueRuns(s);
  const pi = runs.findIndex(x => x.phase === 'pounce');
  expect(pi, '引き寄せの終幕にのしかかりが来ない').toBeGreaterThan(-1);
  expect(runs[pi - 1].phase, 'のしかかりの前が引き寄せ（hold）でない＝入口が違う').toBe('hold');

  // ① 長さ＝溜め pounceWindupMs・滞空 pounceAirMs（時計は行動ゲートの外＝硬直で伸び縮みしない）
  expect(runs[pi].ticks, `溜めが ${c.pounceWindupMs}ms（${c.pounceWindupMs / TICK_MS} tick）でない`)
    .toBe(c.pounceWindupMs / TICK_MS);
  expect(runs[pi + 1].phase, '溜めの次が滞空でない').toBe('pounceAir');
  expect(runs[pi + 1].ticks, `滞空が ${c.pounceAirMs}ms（${c.pounceAirMs / TICK_MS} tick）でない`)
    .toBe(c.pounceAirMs / TICK_MS);
  expect(runs[pi + 2].phase, '滞空の次が idle でない＝着地で相が閉じていない').toBe('idle');

  // ② 絵＝体の沈み（`.pounce-windup`）と滞空（`.pounce-air`）が相と1対1・CSS へ渡す長さも同じ数
  for (const x of s) {
    expect(x.pWindup, `t${x.t}（相 ${x.phase}）で体の沈みの有無が相と食い違う`)
      .toBe(x.phase === 'pounce');
    expect(x.pAir, `t${x.t}（相 ${x.phase}）で滞空の絵の有無が相と食い違う`)
      .toBe(x.phase === 'pounceAir');
    if (x.phase === 'pounce') {
      expect(x.pounceMsVar, `t${x.t} で CSS へ渡した溜めの長さが pounceWindupMs と違う`)
        .toBe(`${c.pounceWindupMs}ms`);
    }
    // 跳ぶときは舌を離している（帯が残っていると「掴んだまま跳んだ」ように見える）
    if (x.phase === 'pounce' || x.phase === 'pounceAir') {
      expect(x.strip, `t${x.t}（のしかかり中）に舌の帯が残っている`).toBe(false);
      expect(x.attached, `t${x.t}（のしかかり中）にまだ掴んでいる`).toBe(false);
      expect(x.len, `t${x.t}（のしかかり中）に舌が伸びたまま`).toBe(0);
    }
  }
  // ③ 床の危険域＝溜めと滞空のあいだだけ出て、形が**判定と厳密に一致する**（角丸矩形・半径 r）。
  //    ⚠️ ここが円だと「塗られていない床で殴られる／塗られているのに当たらない」が出る＝
  //       `enemyEdgeDist ≤ r` の集合は body の箱を r 膨らませた角丸矩形（GUIDE §6-1）。
  for (const x of s) {
    const on = x.phase === 'pounce' || x.phase === 'pounceAir';
    expect(!!x.zone, `t${x.t}（相 ${x.phase}）で床の危険域の有無が相と食い違う`).toBe(on);
    if (!on) continue;
    expect(x.zone.radius, `t${x.t} の危険域の角丸が半径（${r}）と違う＝形が判定と別物`)
      .toBeCloseTo(r, 6);
    expect(x.zone.left, `t${x.t} の危険域の左端が body を r 膨らませた箱と違う`)
      .toBeCloseTo(x.x + 0.5 - r, 6);
    expect(x.zone.top, `t${x.t} の危険域の上端が body を r 膨らませた箱と違う`)
      .toBeCloseTo(x.y + 0.5 - r, 6);
    expect(x.zone.w, `t${x.t} の危険域の幅が body（2セル）＋ r×2 と違う`).toBeCloseTo(1 + r * 2, 6);
    expect(x.zone.h, `t${x.t} の危険域の高さが body（2セル）＋ r×2 と違う`).toBeCloseTo(1 + r * 2, 6);
    // 溜め＝薄い／滞空＝濃い（`pounce-zone-falling`）＝「もう落ちてくる」が絵で分かれる
    expect(x.zone.falling, `t${x.t}（相 ${x.phase}）で危険域の濃さが相と食い違う`)
      .toBe(x.phase === 'pounceAir');
  }
  // ④ 錨＝溜めと滞空のあいだ蝦蟇は1ミリも動かない（＝跳んで場所を変える技ではない）
  const anchor = s[runs[pi].from - 2];          // 引き寄せの最後の tick
  for (const x of s.filter(x => x.phase === 'pounce' || x.phase === 'pounceAir')) {
    expect(x.x, `t${x.t}（のしかかり中）に蝦蟇が横へ動いた＝その場で潰す技になっていない`)
      .toBe(anchor.x);
    expect(x.y, `t${x.t}（のしかかり中）に蝦蟇が縦へ動いた`).toBe(anchor.y);
  }
  // ⑤ 着地＝数（跳んだ回数）・絵（衝撃）・音・硬直・打ち終わりの間が**同じ tick で立つ**
  const landAt = runs[pi + 2].from - 1;
  const land = s[landAt];
  expect(land.pounces, '跳んだ回数が1回でない').toBe(1);
  expect(land.landFx, '着地の衝撃が絵に出ていない').toBe(true);
  expect(s.slice(0, landAt).some(x => x.landFx), '着地する前から衝撃の絵が出ている').toBe(false);
  expect(rang(land.newTones, POUNCE_LAND_HZ), '着地の音が鳴っていない').toBe(true);
  expect(land.freezeUntil - land.now, `着地の硬直が pounceRecoverMs（${c.pounceRecoverMs}ms）でない`
    + '＝潰した直後に殴り返せない').toBeGreaterThan(c.pounceRecoverMs - TICK_MS);
  expect(land.freezeUntil - land.now, '着地の硬直が pounceRecoverMs より長い')
    .toBeLessThanOrEqual(c.pounceRecoverMs);
  expect(land.until - land.now, `着地から次の舌までの間が cooldownMs（${c.cooldownMs}ms）でない`)
    .toBeGreaterThan(c.cooldownMs - TICK_MS * 2);
  // ⑥ 溜めの音は跳び上がる前に1回だけ（＝滞空の合図の高音を含む指紋）
  expect(s.filter(x => rang(x.newTones, POUNCE_HZ)).map(x => x.t),
    'のしかかりの溜めの音が「跳ぶ前に1回」でない').toEqual([runs[pi].from]);
});

// ── I-⑭ のしかかりは**盾で防げない**（正面で受けても潰される）／円の外へ歩けば避かる ──────
// ⚠️ この本がユーザー報告への直接の答え。歯＝(a) で `takeDamage` を盾判定つきの経路へ替えると赤／
//    (b) で「猶予のあいだに歩いても当たる」実装（着地時ではなく跳ぶ時に判定する）にすると赤。
test('I-⑭ のしかかりは盾を向けても防げず、円の外へ歩けば当たらない（答えは「下がる」）', async ({ page }) => {
  const c = ENEMY_META['I'].tongue;

  // (a) 報告の姿勢＝**蝦蟇を向いたまま一歩も下がらない**（盾の正面が蝦蟇を向いている）
  const stand = await trackToad(page, {
    ticks: 50, spawn: I_FAR, debugOff: true, face: true,
  });
  const ss = stand.samples;
  expect(ss[0].shieldTier, '盾を持っていない＝「盾で防げない」を測れていない').toBeGreaterThanOrEqual(0);
  const landAt = ss.findIndex(x => (x.pounces ?? 0) >= 1);
  expect(landAt, '下がらないのに一度も跳ばれない＝報告の姿勢が罰されていない').toBeGreaterThan(-1);
  const land = ss[landAt];
  // 盾は蝦蟇（東）を向いたまま＝向きで消せる攻撃なら消えている
  for (const x of ss.slice(0, landAt + 1)) {
    expect(x.pdir, `t${x.t} で盾の正面が蝦蟇（東）を向いていない＝防げるはずの姿勢になっていない`)
      .toBe('right');
  }
  // ① 着地までは**1ダメージも通らない**＝噛みつきも毒沫も舌も盾（と錨）で消えている
  //    ＝ここが「盾＋ロウソクで無傷」だった中身そのもの。
  for (const x of ss.slice(0, landAt)) {
    expect(x.php, `t${x.t}（着地前）に HP が減った＝のしかかり以外の打点で測ってしまっている`)
      .toBe(ss[0].php);
  }
  // ② 着地の tick に**盾を向けているのに**打点が通る（＝盾で防げない）
  expect(land.php, '盾を向けて立っていれば着地の一撃も消える＝報告の完全防御が残っている')
    .toBeLessThan(ss[0].php);
  expect(ss[0].php - land.php, 'のしかかりのダメージが pounceAtk − def と違う')
    .toBe(Math.max(1, c.pounceAtk - land.pdef));
  expect(land.pounceHits, '当てた回数が数えられていない').toBe(1);
  expect(land.projectiles, '着地の tick に毒沫が飛んでいる＝打点の出どころが混ざっている').toBe(0);

  // (b) 答え＝**円の外へ歩く**（溜めが立ってから下がる＝猶予 840ms＝7 tick）
  const dodge = await trackToad(page, {
    ticks: 50, spawn: I_FAR, debugOff: true, face: true,
    moveWhen: { atPhase: 'pounce', dir: 'left', steps: 4 },
  });
  const ds = dodge.samples;
  expect(dodge.movedAt.length, '溜めのあいだに下がれていない＝避け方を測れていない').toBe(4);
  const dLandAt = ds.findIndex(x => (x.pounces ?? 0) >= 1);
  expect(dLandAt, '跳ばれてすらいない＝避けたことを測れていない').toBeGreaterThan(-1);
  // ① 着地の時点で円の外に居る＝避け切れている（＝猶予が足りている＝I-① の算術の実測）
  expect(ds[dLandAt].reach, `着地の時点でまだ円の中（${ds[dLandAt].reach.toFixed(2)} ≤ ${c.pounceRadius}）`
    + '＝猶予のあいだに歩いても逃げ切れない').toBeGreaterThan(c.pounceRadius);
  // ② 当たっていない＝跳ばれた回数は増えるが**当てた回数は 0**・HP も減らない
  expect(ds[dLandAt].pounceHits, '円の外へ出たのに当たっている＝判定が円になっていない').toBe(0);
  for (const x of ds) {
    expect(x.php, `t${x.t} で HP が減った＝下がっても避けられない（答えが無い攻撃）`).toBe(ds[0].php);
  }
});

// ── I-⑮ 口元に張り付く戦法の番人＝掴めなくても跳ぶ（「向いて焼くだけ」がもう無傷で終わらない）──
// ⚠️ ユーザーの選択は「跳ぶのは掴めたときだけ」だったが、それだけでは**同じ穴が残る**：
//    口元（端 ≤ 噛みつきの間合い）には舌を打てない（帯の内端）∴自分から張り付いた相手は
//    永久に掴まれない＝盾＋ロウソクの無傷戦法がそのまま生き残る。
//    ∴機構の規則は1つ＝**「口元に居る相手にのしかかる」**（入口が2つ：引き寄せの終幕／居座り）。
//    「逃げ切った側は跳ばれない」は保たれる（I-⑭(b) が見張る）。
test('I-⑮ 口元に張り付いて焼き続けても無傷では終わらない（掴めなくても居座りに跳ぶ）', async ({ page }) => {
  const m = ENEMY_META['I'];
  const bite = biteRangeOf(m);
  const out = await trackToad(page, {
    ticks: 60, spawn: I_MOUTH, debugOff: true, face: true, candle: true,
  });
  const s = out.samples;
  // ① 前提＝口元に居る（帯の内端の内側）＝**舌は一度も打てない**立ち位置
  expect(s[0].reach, '湧きが口元（噛みつきの間合いの内側）でない＝居座りを測れていない')
    .toBeLessThanOrEqual(bite);
  expect(s.some(x => x.phase === 'cast'), '口元なのに舌を打った＝帯の内端が効いていない').toBe(false);
  expect(s.some(x => x.attached), '掴まれている＝「掴めない立ち位置」を測れていない').toBe(false);
  // ② 居座りに対しては**即のしかかり**（打ち終わりの間を待たずに最初の tick から溜めが立つ）
  expect(s[0].phase, '口元に居る相手に何もしない＝居座りへの罰が無い').toBe('pounce');
  // ③ 報告の戦法そのもの（向いて焼く）＝炎は入っている（＝焼きながら被弾している）
  expect(s[s.length - 1].hp, 'ロウソクの炎が一度も入っていない＝報告の戦法を再現できていない')
    .toBeLessThan(s[0].hp);
  for (const x of s) {
    expect(x.pdir, `t${x.t} で盾の正面が蝦蟇（東）を向いていない`).toBe('right');
  }
  // ④ **無傷では終わらない**＝60 tick（7.2 秒）のうちに2回跳ばれ、2回とも当たる
  //    （張り付いている＝円の中に居続ける∴跳ばれた回数＝当てた回数）
  const last = s[s.length - 1];
  expect(last.pounces, '張り付いても跳ばれる回数が足りない＝罰が薄すぎて戦法が生き残る')
    .toBeGreaterThanOrEqual(2);
  expect(last.pounceHits, '跳ばれたのに当たっていない＝張り付いていても避けられてしまう')
    .toBe(last.pounces);
  expect(last.php, '口元に張り付いて焼き続けても無傷＝ユーザー報告の穴がまだ空いている')
    .toBeLessThan(s[0].php);
  // ⑤ 打点の出どころはのしかかりだけ（盾で防げる攻撃は相変わらず全部消えている＝設計どおり）
  let hits = 0;
  for (let i = 1; i < s.length; i++) {
    if (s[i].php >= s[i - 1].php) continue;
    hits++;
    expect(s[i - 1].php - s[i].php, `t${s[i].t} の被弾が pounceAtk − def と違う`
      + '＝のしかかり以外の打点が混ざっている（盾で防げる攻撃が通っている）')
      .toBe(Math.max(1, m.tongue.pounceAtk - s[i].pdef));
    expect(s[i].pounceHits, `t${s[i].t} の被弾と「当てた回数」の数え上げが食い違う`).toBe(hits);
  }
  expect(hits, '被弾が観測できていない').toBeGreaterThanOrEqual(2);
});

// ── 9体目 `{` 海の主：打ち寄せ（surge）＝**地形が硬直の長さを決める**移動 ────────────
// 設計の骨（PLAN 8-4 (4) 0n）は2つ：
//   ① 平時は**両生**＝水でも陸でもプレイヤーへ寄る。地形が変えるのは**速さ**だけ
//      （`moveSpeed { water 1.0, land 0.5 }`＝水 2.08／陸 1.04 セル毎秒）。
//   ② `triggerRange` に入り、かつ**当たる軸が在る**相手へ掃過する：
//      idle →（距離＋軸）windup（予告・完全停止）→ sweep（掃過＝**盾で防げない唯一の打点**）
//           → stranded（完全停止＝反撃の窓・長さは足元の地形が決める）→ crawl（引き波）→ idle
//      陸で終われば `strandedMs 1300`／水で終われば `strandedWaterMs 400` ∴**岸から
//      引き離して戦うのが正解**になる（水際で殴ると窓が 1/3）。
// ⚠️ 2026-09-01（0n）に「平時は水から出ない」を**捨てた**＝実プレイで「この位置にいれば
//    ずっと攻撃があたらない」床が実測9セル在った（池に閉じた主は斜めにずれた床へ軸を合わせ
//    られず、唯一の遠隔 `waterShot` は柱で消えた）。∴この節の「水から出ない」を測る本は
//    **意図的に失効させ、逆（陸へも上がる）を測る本に置き換えた**（`{-⑤`／`{-⑥`）。
// ⚠️ `{` は**弱点を持たない**腕試しのボス∴弱点の窓の代わりに「敵が自分で作る隙（stranded）」が
//    唯一の攻め口になる＝機構と攻略法が1本に繋がる（GUIDE §7-16 の対価の払い方）。
const SL = TILE.SEA_LORD;
const SL_ROW = 4, SL_COL = 7;          // 2×2 ∴ rows 4-5 / cols 7-8（水帯 2 行にぴったり収まる）
const SL_STAND = { row: 8, col: 7 };   // 南岸＝端 3.0（引き金 3.5 の内側）で掃過 3.0 がちょうど届く
const SL_FAR   = { row: 8, col: 1 };   // 引き金の外（6.71）＝平時の泳ぎ（岸沿いの横滑り）を測る
// `{` は field のボス＝ボス直前の装備が作れず audit-balance では「開始直後 / min」に落ちる
// （ハート3＝掃過2発で死ぬ）∴**観測用に器だけ増やした**装備で測る（盾は持たせる＝
// 「盾を向けても掃過は止まらない」を測るため・剣と防具は min のまま）。
const SL_OBS = { ps_hearts: '13', ps_sword: '0', ps_shield: '0', ps_armor: '0', ps_weapon: '1' };
// 本番のボス部屋（field 12,19）＝**水際の窓**（`strandedWaterMs`）を測れる唯一の舞台。
// ⚠️ 闘技場 `bal_sea_lord` の水帯は 2 行＝体（2×2）が丸ごと水に入るのは y が整数のときだけ
//    ∴「掃過が水で終わる」立ち位置が床の上に1つも無い（0n で測り直して分かった）。
//    本番の池は 4×4（rows 3-6 × cols 4-7）∴池の縁に立てば掃過は**池の中で**止まる。
function roomUrl(row, col) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: 'field', stage: '12,19',
    row: String(row), col: String(col), ...D1_MIN, ...SL_OBS,
  });
  return `${GAME}?${p.toString()}`;
}
// SE の指紋（`installToneRec` は周波数だけを記録する）
const SURGE_HZ = [98, 131, 165, 208];  // seaSurge＝乗り上げの予告（低音から昇る＝波が立つ）
const SL_CRASH_HZ = [87, 175, 587, 880]; // seaCrash＝波が覆い被さった（＝掃過の打点）

/**
 * `bal_sea_lord` の `{` を n tick 追い、毎 tick の相・位置・陸のセル数・危険域・音と
 * プレイヤーの位置／HP を返す。
 * @param {object} o
 * @param {number} o.ticks       進める論理 tick 数
 * @param {object} [o.spawn]     プレイヤーの湧き（既定＝南岸 (8,7)）
 * @param {boolean} [o.debugOff] true＝'g' で debug を切る（ダメージが通る）
 * @param {object} [o.patch]     ENEMY_META['{'] へ一時的に差し込むフィールド
 * @param {object} [o.dropWhen]  { atPhase, dmg }＝**その相になった最初の tick**にダメージを落とす
 *                               （tick 番号で固定すると相の長さを変えた瞬間に意味がずれる）
 * @param {object} [o.moveWhen]  { atPhase, dir, steps }＝その相のあいだ 1 tick に1歩ずつ歩く
 * @param {boolean} [o.face]     true＝毎 tick 海の主の方へ向き直る（＝盾の正面を向け続ける）
 * @param {boolean} [o.room]     true＝闘技場でなく**本番のボス部屋**（field 12,19）で測る
 */
async function trackSeaLord(page, o) {
  await installToneRec(page);
  const sp = o.spawn ?? SL_STAND;
  await gotoFrozen(page, o.room ? roomUrl(sp.row, sp.col)
    : previewUrl('bal_sea_lord', sp.row, sp.col, SL_OBS));
  if (o.debugOff) await page.keyboard.press('g');
  return page.evaluate((a) => {
    const g = window.__game;
    if (a.patch) g.setEnemyMetaForTest('{', a.patch);
    const e0 = g.getEnemies().find(x => x.type === '{');
    if (!e0) return { error: '{ が盤面に居ない' };
    const id = e0.id;
    const find = () => g.getEnemies().find(x => x.id === id);
    const cellPx = document.querySelector('#board .cell').getBoundingClientRect().width;
    // 間合い＝`enemyEdgeDist`（セル添字基準の箱の面までの距離）と同じ式＝到達距離の表と揃う
    const edgeDist = (e, px, py) => {
      const cx = e.x + ((e.w ?? 1) - 1) / 2, cy = e.y + ((e.h ?? 1) - 1) / 2;
      const gx = Math.max(0, Math.abs(px - cx) - ((e.w ?? 1) - 1) / 2);
      const gy = Math.max(0, Math.abs(py - cy) - ((e.h ?? 1) - 1) / 2);
      return Math.hypot(gx, gy);
    };

    const samples = [];
    const movedAt = [];
    let stepsLeft = a.moveWhen?.steps ?? 0;
    let dropped = false;
    for (let t = 1; t <= a.ticks; t++) {
      const tone0 = window.__tones.length;
      const cur = find();
      if (!cur) break;
      // ⚠️ `getEnemies()` はスナップショット＝`_surgePhase` ではなく `surgePhase` で読む
      //   （`_` 付きで読むと常に undefined ＝相を狙った差し込みが1度も起きない）
      const phase = cur.surgePhase ?? 'idle';
      // ダメージは**相を見て**落とす（相の切り替えが「殴られている最中」に起きることの再現）
      if (a.dropWhen && !dropped && phase === a.dropWhen.atPhase) {
        g.dealDamage(id, a.dropWhen.dmg); dropped = true;
      }
      if (a.face) {
        const p0 = g.getPlayer();
        const cx = cur.x + ((cur.w ?? 1) - 1) / 2, cy = cur.y + ((cur.h ?? 1) - 1) / 2;
        const dx = cx - p0.x, dy = cy - p0.y;
        g.setHeroDir(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up'));
      }
      const mw = a.moveWhen;
      if (mw && stepsLeft > 0 && (mw.atPhase === undefined || phase === mw.atPhase)) {
        g.movePlayer(mw.dir); stepsLeft--; movedAt.push(t);
      }
      g.step(1);
      const e = find();
      if (!e) break;
      const p = g.getPlayer(), st = g.getState();
      const el = document.getElementById(`char-enemy-${id}`);
      samples.push({
        t, now: st.gameTime, hp: e.hp, x: e.x, y: e.y, dir: e.dir,
        phase: e.surgePhase ?? 'idle', span: e.surgeSpan ?? 0, at: e.surgeAt ?? null,
        left: e.surgeLeft ?? 0, vx: e.surgeVx ?? null, vy: e.surgeVy ?? null,
        sx: e.surgeSx ?? null, sy: e.surgeSy ?? null,
        homeX: e.surgeHomeX ?? null, homeY: e.surgeHomeY ?? null,
        surges: e.surges ?? 0, hits: e.surgeHits ?? 0, land: e.surgeLand,
        afloat: e.surgeAfloat,          // 掃過が水で終わったか（＝短い窓）
        cfg: e.surge ?? null, readyAt: e.surgeReadyAt ?? null,
        attackTimes: e.attackTimes, projectiles: g.getProjectiles().length,
        px: p.x, py: p.y, php: p.hp, pdef: st.player.def,
        pdir: st.heroDir, shieldTier: st.player.shieldTier,
        reach: edgeDist(e, p.x, p.y),
        // 絵＝相ごとに別のポーズ（4つ）＋長さは JS が単一の真実として渡す
        wind: !!el?.classList.contains('surge-windup'),
        sweep: !!el?.classList.contains('surge-sweep'),
        strand: !!el?.classList.contains('surge-stranded'),
        crawl: !!el?.classList.contains('surge-crawl'),
        spanVar: (el?.style.getPropertyValue('--surge-span-ms') ?? '').trim(),
        // 床の危険域＝**セル単位**へ戻して渡す（判定 `enemyEdgeDist ≤ hitRange` と同じ物差し）
        zone: (() => {
          const z = document.getElementById(`sea-surge-zone-${id}`);
          if (!z) return null;
          return { left: parseFloat(z.style.left) / cellPx, top: parseFloat(z.style.top) / cellPx,
            w: parseFloat(z.style.width) / cellPx, h: parseFloat(z.style.height) / cellPx,
            radius: parseFloat(z.style.borderRadius) / cellPx,
            sweeping: z.classList.contains('surge-zone-sweeping') };
        })(),
        hitFx: !!document.querySelector('.sea-surge-hit'),
        newTones: window.__tones.slice(tone0),
      });
    }
    const e = find();
    return { id, cellPx, samples, movedAt,
      end: e && { hp: e.hp, maxHp: e.maxHp, cfg: e.surge ?? null } };
  }, o);
}

// 相の連（[{ phase, from, to, ticks }]）＝時系列の順序と長さを1つの形で見る
function surgeRuns(samples) {
  const runs = [];
  for (const s of samples) {
    const last = runs[runs.length - 1];
    if (last && last.phase === s.phase) { last.to = s.t; last.ticks++; continue; }
    runs.push({ phase: s.phase, from: s.t, to: s.t, ticks: 1 });
  }
  return runs;
}
// 相の長さ（tick）＝始まった tick も1 tick と数える（時計は「now が at を越えた tick」に進む）
const nSurgeTicks = (ms) => Math.ceil(ms / TICK_MS);

test('{-① 海の主のデータ＝乗り上げは体当たりの外から来て、予告のあいだに横へ退ける', () => {
  const m = ENEMY_META[SL];
  const c = m.surge;
  const KEYS = ['cooldownMs', 'crawlMs', 'hitRange', 'strandedMs', 'strandedWaterMs',
    'surgeAtk', 'surgeCells', 'surgeSpeed', 'triggerRange', 'windupMs'];
  // 本番のボス部屋（field 12,19）で危険域の外へ出るのに要る最大の距離＝実測 3 セル
  // （`{-⑩` ⑤ が床で測り直す。ここはデータ側の下限として同じ数を持つ）。
  const ROOM_ESCAPE_CELLS = 3.0;

  expect(c, 'surge が無い＝{ に固有の移動機構が無い').toBeTruthy();
  // 綴りの番人（`resolveSurge` を読む関数が読むキー＝1文字違うと既定値に落ちて黙って動く）
  expect(Object.keys(c).sort()).toEqual(KEYS);
  // 這い戻りの速さは**持たない**＝`surgeCells / (crawlMs / TICK_MS)` から導く
  //（数を2つ持つと「深く乗り上げるのに戻りが遅い」で陸に取り残される食い違いが生える）
  expect('crawlSpeed' in c, 'crawlSpeed を持っている＝這い戻りの速さが二重管理になる').toBe(false);

  // `hitAndAway` は enemyTick の分岐で surge より優先される∴**明示 false** が要る
  // （W/A/N/J/O/U/G/I で8回踏んだ罠＝書かないと新機構の分岐へ一度も来ない）
  expect('hitAndAway' in m, 'hitAndAway を書いていない＝既定の張り付きに戻る余地が残る').toBe(true);
  expect(m.hitAndAway, 'hitAndAway が true ＝surge の分岐に来ない').toBe(false);
  expect(m.initialModeWeights, '寄り方の抽選が残っている＝読まれない数値（W/O/U/G/I で外した作法）')
    .toBeUndefined();
  // 弱点を持たない＝「陸で止まっている窓」が唯一の攻め口という設計の前提そのもの
  expect(m.weakness, '弱点が生えた＝stranded が「唯一の攻め口」でなくなる（設計の前提が変わる）')
    .toBeUndefined();

  const ram   = m.attacks.find(a => a.type === 'sword');
  const spout = m.attacks.find(a => a.type === 'waterShot');
  const halfW = ((m.size?.w ?? 1) - 1) / 2;
  const playerCps = (MOVE_STEP / TICK_MS) * 1000;      // 4.17 セル/秒
  // ① 到達距離の表に隙間も入れ子も無い（GUIDE §7-12）＝体当たり 1.2 < 乗り上げ 3.5 < 潮吹き 8
  expect(c.triggerRange, '乗り上げの引き金が体当たりの間合いの内＝殴られる距離でしか乗り上げない')
    .toBeGreaterThan(ram.range);
  // ①' 体当たりの到達 ＝ プレイヤーの剣の到達（2026-09-01・実プレイの判断（d））。
  //    1.8 だった間は「自分の剣が届かない距離から殴られる」＝水際で斬り合うという攻略の
  //    芯が成立せず、横へ退く動作が（盾は向いている方向しか守らないので）被弾に変わっていた。
  //    同値に固定する＝「届く間合いは殴り合いの間合い」＝間合いを覚える相手になる。
  expect(ram.range, '体当たりの到達がプレイヤーの剣（SWORD_REACH）と違う＝'
    + '一方的に殴られる距離（>）か体当たりが死ぬ距離（<）ができる').toBe(SWORD_REACH);
  expect(c.triggerRange, '乗り上げの引き金が潮吹きの射程より外＝遠距離攻撃の意味が消える')
    .toBeLessThan(spout.range);
  // ② 予告は時間の床（近接の溜め）以上＝**見てから動ける**（盾で防げない打点の対価・§7-16）
  expect(c.windupMs, '予告が近接の溜め（MELEE_WINDUP_MS）より短い＝見てから動けない')
    .toBeGreaterThanOrEqual(MELEE_WINDUP_MS);
  // ③ 予告のあいだに歩ける距離 > 危険域の半幅（halfW ＋ hitRange）＝**横へ退けば必ず避かる**
  //    ⚠️ この算術は「狙いを予告に入った瞬間に固定する」から成立する（追尾すると成立しない）
  const graceTicks = Math.floor(c.windupMs / TICK_MS);
  expect(graceTicks * MOVE_STEP, `猶予 ${graceTicks} tick で歩ける `
    + `${(graceTicks * MOVE_STEP).toFixed(2)} セルが危険域の半幅（${halfW} ＋ ${c.hitRange}）`
    + 'を越えない＝避けられない攻撃になる').toBeGreaterThan(halfW + c.hitRange);
  // ③' 半幅ぶんでは足りない：**本番の部屋の床**は真横が空いていない場所がある（両生になって
  //    主が輪の上にも立つ∴南北 2 行の通路で軸に沿って背中側へ抜けるしかない場合が在る）。
  //    ∴猶予は「実測で要る 3 セル」を歩ける長さが要る（600ms＝2.5 セルでは 17 通り避けられない）。
  expect(graceTicks * MOVE_STEP, `猶予 ${c.windupMs}ms で歩ける ${graceTicks * MOVE_STEP} セルが`
    + `本番の部屋で逃げるのに要る ${ROOM_ESCAPE_CELLS} セルに足りない＝避けられない立ち位置が残る`)
    .toBeGreaterThanOrEqual(ROOM_ESCAPE_CELLS);
  // ④ 掃過は MOVE_STEP 以下に刻める（速くしても判定と壁を飛び越さない）
  expect(c.surgeSpeed / Math.max(1, Math.ceil(c.surgeSpeed / MOVE_STEP)),
    '掃過の1刻みが MOVE_STEP を越える＝プレイヤーを飛び越して当たらない').toBeLessThanOrEqual(MOVE_STEP);
  // ⑤ 打点は体当たりと同じ atk まで（盾で防げない一撃を防げる一撃より重くしない）＋罰になる重さ
  expect(c.surgeAtk, '掃過が体当たり（atk）より重い＝盾で防げない一撃の方が痛い')
    .toBeLessThanOrEqual(m.atk);
  expect(c.surgeAtk, '掃過が防御で 1 まで削れる＝罰にならない').toBeGreaterThan(2);
  // ⑥ 陸で止まる窓＝木の剣を3振り以上返せる長さ（弱点が無い敵の唯一の攻め口）
  expect(Math.floor(c.strandedMs / SWORD_COOLDOWN_MS),
    `反撃の窓 ${c.strandedMs}ms で剣を3振り返せない＝弱点も窓も無い＝削り切れない`)
    .toBeGreaterThanOrEqual(3);
  // ⑥' **地形が窓の長さを決める**（0n の機構の核）＝水で終わった掃過の硬直は陸の窓より短く、
  //    しかも「剣を3振り返せない」側に落ちる∴岸から引き離して戦うことが報酬になる。
  //    ⚠️ ここが同値（または水のほうが長い）に戻ったら機構が消える＝水際で殴っても同じになる。
  expect(c.strandedWaterMs, '水で終わった硬直が陸と同じか長い＝「岸から引き離す」に意味が無い')
    .toBeLessThan(c.strandedMs);
  expect(Math.floor(c.strandedWaterMs / SWORD_COOLDOWN_MS),
    `水の窓 ${c.strandedWaterMs}ms で剣を3振り返せる＝陸の窓と体感が変わらない（引き離す理由が無い）`)
    .toBeLessThan(3);
  expect(c.strandedWaterMs, '水の窓が 0 ＝水際では反撃が一切できない（両生の圧に答えが無くなる）')
    .toBeGreaterThan(0);
  // ⑦ 引き波は掃過よりずっと遅く、かつ**上限のうちに起点まで引き切れる**
  //   （0n で「水へ帰る」ではなくなった＝帰り先は乗り上げの起点＝水か陸かは問わない）
  const crawlSpeed = c.surgeCells / (c.crawlMs / TICK_MS);
  expect(crawlSpeed, '引き波が掃過の半分より速い＝「戻りは遅い」が数の関係になっていない')
    .toBeLessThan(c.surgeSpeed / 2);
  expect(crawlSpeed * nSurgeTicks(c.crawlMs),
    '引き波の上限のうちに乗り上げた深さを戻れない＝掃過ぶん前へ出たまま次の周期に入る')
    .toBeGreaterThanOrEqual(c.surgeCells);
  expect(c.cooldownMs, '次の乗り上げまでの間が無い＝予告と窓が連続して読めない').toBeGreaterThan(0);
  // ⑧ 泳ぎ < プレイヤー（GUIDE §7-2）＝走って逃げれば必ず引き離せる。
  //    ⚠️ 0n で両生になった＝「陸に上がれば追われない」は**もう成立しない**（縛りが要る理由が
  //    強くなった側の変更）。縛りは据え置きで **7 割以下**＝並ばない・追い抜かない。
  const SWIM_CAP = playerCps * 0.7;
  expect((m.speed * (m.moveSpeed?.water ?? 1) / TICK_MS) * 1000,
    '泳ぎがプレイヤーの 7 割より速い＝走って逃げても引き離せない')
    .toBeLessThanOrEqual(SWIM_CAP);
  // ⑧' 地形が変えるのは**速さだけ**（陸でも歩ける＝両生）＝水は速く陸は鈍い
  expect(m.moveSpeed.land, '陸の倍率が水以上＝陸に上がっても鈍くならない（水の意味が消える）')
    .toBeLessThan(m.moveSpeed.water);
  expect(m.moveSpeed.land, '陸の倍率が 0 ＝陸へ上がれない（両生でなくなる＝斜めの安全地帯が戻る）')
    .toBeGreaterThan(0);

  // 後半（HP 50% 以下）＝広く・深く・休みは短く。ただし①〜⑧は**すべて保つ**。
  const p = (m.phases ?? []).find(ph => ph.surge !== undefined);
  expect(p, '後半の相が打ち寄せを差し替えていない＝前半と同じ動きのまま').toBeTruthy();
  expect(p.hpThreshold).toBe(0.5);
  expect(Object.keys(p.surge).sort(), '後半の綴りが前半と違う＝どれかが既定値に落ちる').toEqual(KEYS);
  expect(p.surge.triggerRange, '後半の引き金が広がっていない').toBeGreaterThan(c.triggerRange);
  expect(p.surge.triggerRange, '後半の引き金が潮吹きの射程を越えた＝射程外が消える')
    .toBeLessThan(spout.range);
  expect(p.surge.surgeCells, '後半の乗り上げが深くなっていない').toBeGreaterThan(c.surgeCells);
  expect(p.surge.cooldownMs, '後半の休みが短くなっていない').toBeLessThan(c.cooldownMs);
  expect(p.surge.strandedMs, '後半の窓が短くなっていない').toBeLessThan(c.strandedMs);
  // ⚠️ 後半でも**窓は残す**（弱点の無い敵から攻め口を消すと `yieldAt` に届かない）
  expect(Math.floor(p.surge.strandedMs / SWORD_COOLDOWN_MS),
    '後半の窓で剣を3振り返せない＝攻め口が消える').toBeGreaterThanOrEqual(3);
  // 後半も「地形が窓を決める」を保つ（水の窓は陸より短く・0 でなく・3振りは返せない）
  expect(p.surge.strandedWaterMs, '後半の水の窓が陸と同じか長い＝引き離す意味が後半で消える')
    .toBeLessThan(p.surge.strandedMs);
  expect(p.surge.strandedWaterMs, '後半の水の窓が 0 ＝水際で反撃が一切できない').toBeGreaterThan(0);
  expect(Math.floor(p.surge.strandedWaterMs / SWORD_COOLDOWN_MS),
    '後半の水の窓で剣を3振り返せる＝陸と体感が変わらない').toBeLessThan(3);
  expect(p.surge.strandedWaterMs, '後半の水の窓が前半より長い＝後半で楽になっている')
    .toBeLessThanOrEqual(c.strandedWaterMs);
  // ⚠️ 予告と打点と当たり判定は**後半でも据え置き**＝「見てから横へ退く」が最後まで成立する
  expect(p.surge.windupMs, '後半で予告を縮めた＝盾で防げない一撃の予告が時間の床を割る'
    + '（強化は間合いと深さと休みの短さで払う）').toBe(c.windupMs);
  expect(p.surge.hitRange, '後半で当たり判定を広げた＝横へ退く算術が変わる').toBe(c.hitRange);
  expect(p.surge.surgeAtk, '後半で掃過の打点を上げた＝避けられる技を重くしている').toBe(c.surgeAtk);
  // 後半も③③'④⑦を満たす（深さが増えた分だけ引き波も速くなる＝前へ出たままにならない）
  expect(Math.floor(p.surge.windupMs / TICK_MS) * MOVE_STEP,
    '後半は猶予のあいだに危険域の外へ出られない').toBeGreaterThan(halfW + p.surge.hitRange);
  expect(Math.floor(p.surge.windupMs / TICK_MS) * MOVE_STEP,
    `後半は猶予のあいだに本番の部屋で要る ${ROOM_ESCAPE_CELLS} セルを歩けない`)
    .toBeGreaterThanOrEqual(ROOM_ESCAPE_CELLS);
  const crawl2 = p.surge.surgeCells / (p.surge.crawlMs / TICK_MS);
  expect(crawl2 * nSurgeTicks(p.surge.crawlMs),
    '後半は深く乗り上げるのに引き波の上限が足りない＝掃過ぶん前へ出たまま次の周期に入る')
    .toBeGreaterThanOrEqual(p.surge.surgeCells);
  expect(crawl2, '後半の引き波が掃過の半分より速い').toBeLessThan(p.surge.surgeSpeed / 2);
  expect(crawl2, '後半の引き波の1刻みが MOVE_STEP を越える').toBeLessThanOrEqual(MOVE_STEP);
  // `speedMultiplier` は**生きている数値**＝平時の泳ぎ（resolveEnemySpeed）に効く（I とは違う）
  expect(p.speedMultiplier, '後半に泳ぎの加速が無い＝水の中の圧が変わらない').toBeGreaterThan(1);
  expect((m.speed * p.speedMultiplier * m.moveSpeed.water / TICK_MS) * 1000,
    '後半の泳ぎがプレイヤーの 7 割より速い＝岸沿いに逃げても引き離せない')
    .toBeLessThanOrEqual(SWIM_CAP);
});

test('{-② 乗り上げは5相を順に回り、各相の長さ・絵・音・床の危険域が surge の数と一致する', async ({ page }) => {
  const c = ENEMY_META[SL].surge;
  const out = await trackSeaLord(page, { ticks: 40 });
  const s = out.samples;
  expect(out.error).toBeUndefined();

  // ① 相の順序＝南岸（端 3.0＝引き金の内側）に立っているだけで乗り上げが始まる
  const runs = surgeRuns(s);
  expect(runs.map(r => r.phase).slice(0, 5),
    '相の順序が windup→sweep→stranded→crawl→idle になっていない')
    .toEqual(['windup', 'sweep', 'stranded', 'crawl', 'idle']);
  // ② 予告の長さ＝windupMs（時計は行動ゲートの外＝他の攻撃の硬直で伸び縮みしない）
  expect(runs[0].ticks, `予告が ${c.windupMs}ms（${c.windupMs / TICK_MS} tick）でない`)
    .toBe(c.windupMs / TICK_MS);
  // ③ 予告のあいだ体は1ミリも動かない（＝床に描いた帯が動かない＝嘘にならない）
  for (const x of s.slice(0, runs[0].ticks)) {
    expect(x.phase).toBe('windup');
    expect(x.y, `t${x.t}（予告中）に体が動いた＝帯の基準がずれる`).toBe(s[0].y);
    expect(x.x, `t${x.t}（予告中）に体が動いた＝帯の基準がずれる`).toBe(s[0].x);
    expect(x.land, `t${x.t}（予告中）に陸へ出ている＝予告の前に乗り上げている`).toBe(0);
  }
  // ④ 狙い＝軸に沿った1本（南）で、予告に入った瞬間に固定される（以後 1 tick も動かない）
  const aimed = s.slice(0, runs[0].to);
  for (const x of aimed) {
    expect([x.vx, x.vy], `t${x.t} の狙いが南（0,+1）でない＝軸に沿っていない`).toEqual([0, 1]);
    expect([x.sx, x.sy], `t${x.t} で帯の基準が動いた`).toEqual([s[0].sx, s[0].sy]);
  }
  expect(s[0].dir, '予告の向きが狙いと食い違う').toBe('down');
  // ⑤ 掃過＝陸へ乗り上げる（陸のセル数が 0 → 正）＝**この舞台では窓は陸の長さ**（0n の核）
  const strandRun = runs[2], crawlRun = runs[3];
  const strand = s.find(x => x.t === strandRun.from);
  expect(strand.land, '陸で止まっているのに体が水の中＝乗り上げていない').toBeGreaterThan(0);
  expect(strand.afloat, '陸で止まったのに「水で終わった」と記録されている＝窓の長さが逆に出る')
    .toBe(false);
  expect(strand.span, `陸で終わった窓の長さが ${c.strandedMs}ms でない＝地形で窓を選べていない`)
    .toBe(c.strandedMs);
  expect(strandRun.ticks, `陸での停止が ${c.strandedMs}ms でない＝反撃の窓の長さが数と食い違う`)
    .toBe(nSurgeTicks(c.strandedMs));
  // ⑥ 引き波の終点＝**乗り上げを始めた位置**（0n で「水へ帰る」ではなくなった＝起点へ引く。
  //    この舞台では起点が水帯の中∴結果として水へ帰る＝陸のセル数も 0 に戻る）
  const back = s.find(x => x.t === crawlRun.to + 1);
  expect(back.phase, '引き波の次が idle でない').toBe('idle');
  expect([back.x, back.y], '帰り着いた位置が乗り上げの起点と違う＝掃過ぶん前へ出たままになる')
    .toEqual([strand.homeX, strand.homeY]);
  expect([back.homeX, back.homeY], '帰り先の記録が起点と食い違う').toEqual([s[0].sx, s[0].sy]);
  expect(back.land, '起点（水帯の中）へ帰ったのに陸のセル数が 0 でない＝起点の記録がずれている')
    .toBe(0);
  // ⑦ 絵＝4相それぞれ別のポーズが立ち、長さは JS が渡した数（CSS に数を持たせない）
  for (const x of s) {
    expect([x.wind, x.sweep, x.strand, x.crawl].filter(Boolean).length,
      `t${x.t} で相のポーズが2つ以上（または相と食い違って）立っている`)
      .toBe(x.phase === 'idle' ? 0 : 1);
    if (x.phase === 'windup')   expect(x.wind, `t${x.t} の絵が予告になっていない`).toBe(true);
    if (x.phase === 'sweep')    expect(x.sweep, `t${x.t} の絵が掃過になっていない`).toBe(true);
    if (x.phase === 'stranded') expect(x.strand, `t${x.t} の絵が陸での停止になっていない`).toBe(true);
    if (x.phase === 'crawl')    expect(x.crawl, `t${x.t} の絵が這い戻りになっていない`).toBe(true);
    if (x.phase !== 'idle') {
      expect(x.spanVar, `t${x.t} の絵の長さが相の長さ（${x.span}ms）と違う`).toBe(`${x.span}ms`);
    }
  }
  // ⑧ 床の危険域＝予告と掃過のあいだだけ・形は「起点の body → 終点の body」を hitRange ぶん
  //    膨らませた角丸矩形（＝判定 `enemyEdgeDist ≤ hitRange` を軸に沿って掃いた集合そのもの）
  // ⚠️ 形は**判定と同じ座標系**で測る＝`enemyEdgeDist` は body を「セル添字の箱」
  //    （中心から半幅 (w-1)/2 ＝ 0.5）として見る∴危険域は その箱 を hitRange ぶん膨らませた物
  //    ＝幅 (w-1) + hitRange×2。描画は +0.5 セルずらす（セル添字→左上原点）。
  //    絵をセル幅（2.0）基準で描くと**判定より広い帯**になる＝「塗ってあるのに当たらない」。
  const HALF = 1;                        // body 2×2 の (w-1) ＝ 判定が見る箱の一辺
  const zone = s[0].zone;
  expect(zone, '予告なのに床の危険域が描かれていない＝盾で防げない打点に告知が無い').toBeTruthy();
  expect(zone.radius, '角の丸みが hitRange と違う＝描いた形が判定の形でない').toBeCloseTo(c.hitRange, 6);
  expect(zone.w, '帯の幅が 判定の箱（w-1） ＋ hitRange×2 と違う').toBeCloseTo(HALF + c.hitRange * 2, 6);
  expect(zone.h, '帯の長さが 乗り上げの深さ ＋ 判定の箱 ＋ hitRange×2 と違う')
    .toBeCloseTo(c.surgeCells + HALF + c.hitRange * 2, 6);
  // 判定の箱＝添字で [sx, sx+1]／描画では各セルの**中心**（＝添字 +0.5）が基準
  // ∴帯の左端 ＝ sx + 0.5 − hitRange（右端も同じだけ外へ出る＝体に対して左右対称）
  expect(zone.left, '帯の左端が起点の body から hitRange ぶん外へ広がっていない')
    .toBeCloseTo(s[0].sx + 0.5 - c.hitRange, 6);
  expect(zone.top, '帯の上端が起点の body から hitRange ぶん外へ広がっていない')
    .toBeCloseTo(s[0].sy + 0.5 - c.hitRange, 6);
  expect(zone.sweeping, '予告の帯が「もう来ている」色になっている').toBe(false);
  expect(s.find(x => x.phase === 'sweep').zone.sweeping,
    '掃過なのに帯の色が予告のまま＝「もう当たる」が絵で読めない').toBe(true);
  for (const x of s) {
    if (x.phase === 'windup' || x.phase === 'sweep') continue;
    expect(x.zone, `t${x.t}（${x.phase}）に危険域が残っている＝当たらない床が塗られている`).toBeNull();
  }
  // ⑨ 音＝予告の立ち上がりに seaSurge、当たった tick に seaCrash（＝打点と音が1対1）
  expect(s[0].newTones, '乗り上げの予告に SE が鳴っていない').toEqual(SURGE_HZ);
  const hitAt = s.findIndex(x => x.hits >= 1);
  expect(hitAt, '南岸に立ち続けて一度も当たらない＝乗り上げが届いていない').toBeGreaterThan(-1);
  expect(s[hitAt].newTones, '波が覆い被さった tick に seaCrash が鳴っていない').toEqual(SL_CRASH_HZ);
  expect(s[hitAt].hitFx, '当たった tick に波の絵が出ていない').toBe(true);
});

test('{-③ 掃過は盾を向けても防げず、陸で止まっている窓のあいだ攻撃は一切出ない', async ({ page }) => {
  const m = ENEMY_META[SL];
  const c = m.surge;
  // 報告と同じ姿勢＝**海の主を向いたまま一歩も退かない**（盾の正面が海の主を向いている）
  const out = await trackSeaLord(page, { ticks: 70, debugOff: true, face: true });
  const s = out.samples;
  expect(out.error).toBeUndefined();
  expect(s[0].shieldTier, '盾を持っていない＝「盾で防げない」を測れていない').toBeGreaterThanOrEqual(0);
  for (const x of s) {
    expect(x.pdir, `t${x.t} で盾の正面が海の主（北）を向いていない＝防げるはずの姿勢になっていない`)
      .toBe('up');
  }
  // ① 掃過が当たる（盾を向けていても）＝ダメージは surgeAtk − def ちょうど
  const hitAt = s.findIndex(x => x.hits >= 1);
  expect(hitAt, '盾を向けて立っていれば掃過も消える＝「向いて待つだけで無傷」が残っている')
    .toBeGreaterThan(-1);
  expect(s[hitAt].php, '当てた回数は増えたのに HP が減っていない＝盾に吸われている')
    .toBeLessThan(s[0].php);
  expect(s[0].php - s[hitAt].php, '掃過のダメージが surgeAtk − def と違う')
    .toBe(Math.max(1, c.surgeAtk - s[hitAt].pdef));
  // ② 掃過の前に1ダメージも通らない＝体当たりも潮吹きも盾で消えている（＝穴の中身そのもの）
  for (const x of s.slice(0, hitAt)) {
    expect(x.php, `t${x.t}（掃過の前）に HP が減った＝掃過以外の打点で測ってしまっている`)
      .toBe(s[0].php);
  }
  // ③ 1回の乗り上げで打点は1回だけ（何 tick 重なっても増えない）
  const firstCycle = s.filter(x => x.surges === 1);
  expect(Math.max(...firstCycle.map(x => x.hits)), '1回の乗り上げで2回以上当たっている').toBe(1);
  // ④ 陸で止まっている窓＝**攻撃が一切出ない**（体当たりの間合いの内に居るのに振らない）
  const win = s.filter(x => ['sweep', 'stranded', 'crawl'].includes(x.phase));
  const ram = m.attacks.find(a => a.type === 'sword');
  expect(win.some(x => x.reach <= ram.range),
    '陸で止まった巨体が体当たりの間合いの外に居る＝窓の意味（殴り合える距離）が無い').toBe(true);
  // ⚠️ 比べる相手は「窓に入る直前の値」＝巡と巡のあいだ（idle）には潮吹きを撃つのが正しい
  //    （全 tick を t1 の値と比べると、休みのあいだの射撃まで窓破りに数える＝歯のない赤）
  const streaks = [];
  let cur = null;
  for (let i = 0; i < s.length; i++) {
    if (!['sweep', 'stranded', 'crawl'].includes(s[i].phase)) { cur = null; continue; }
    if (!cur) { cur = { before: s[i - 1] ?? s[0], items: [] }; streaks.push(cur); }
    cur.items.push(s[i]);
  }
  expect(streaks.length, '窓が1度も来ていない').toBeGreaterThanOrEqual(2);
  for (const st of streaks) {
    const before = JSON.stringify(st.before.attackTimes);
    for (const x of st.items) {
      expect(JSON.stringify(x.attackTimes),
        `t${x.t}（${x.phase}）に新しい攻撃が出た＝反撃の窓が窓でない`).toBe(before);
    }
  }
  // ⑤ 周期は繰り返す（＝陸で固まらない＝機構が2周目に入る）
  const last = s[s.length - 1];
  expect(last.surges, '70 tick（8.4 秒）で乗り上げが2回来ない＝陸で固まっているか休みが長すぎる')
    .toBeGreaterThanOrEqual(2);
  expect(last.hits, '2回目の乗り上げが当たっていない＝棒立ちが罰されていない')
    .toBe(last.surges);
  // ⑥ 打点の出どころは掃過だけ（盾で防げる攻撃は相変わらず全部消えている＝設計どおり）
  let hits = 0;
  for (let i = 1; i < s.length; i++) {
    if (s[i].php >= s[i - 1].php) continue;
    hits++;
    expect(s[i - 1].php - s[i].php, `t${s[i].t} の被弾が surgeAtk − def と違う`
      + '＝掃過以外の打点が混ざっている（盾で防げる攻撃が通っている）')
      .toBe(Math.max(1, c.surgeAtk - s[i].pdef));
    expect(s[i].hits, `t${s[i].t} の被弾と「当てた回数」の数え上げが食い違う`).toBe(hits);
  }
  expect(hits, '被弾が観測できていない').toBeGreaterThanOrEqual(2);
});

test('{-④ 予告のあいだに横へ退けば波は空を打つ（狙いは追尾しない＝床の帯が嘘にならない）', async ({ page }) => {
  const c = ENEMY_META[SL].surge;
  // 予告に入ってから西へ3歩（1.5 セル）＝危険域の半幅（0.5 ＋ 0.8）の外へ出る
  const out = await trackSeaLord(page, {
    ticks: 36, debugOff: true, moveWhen: { atPhase: 'windup', dir: 'left', steps: 3 },
  });
  const s = out.samples;
  expect(out.error).toBeUndefined();
  expect(out.movedAt.length, '予告のあいだに退けていない＝避け方を測れていない').toBe(3);
  // ① 乗り上げは来た（＝引き金は引かれた）が、当たっていない
  const last = s[s.length - 1];
  expect(last.surges, '一度も乗り上げて来ない＝避けたことを測れていない').toBeGreaterThanOrEqual(1);
  expect(last.hits, '横へ退いたのに当たっている＝狙いが追尾している（帯が嘘になる）').toBe(0);
  for (const x of s) {
    expect(x.php, `t${x.t} で HP が減った＝横へ退いても避けられない（答えが無い攻撃）`).toBe(s[0].php);
  }
  // ② 掃過は**予告で固定した向き**へ真っすぐ進んだ（＝退いた方へ曲がっていない）
  const sweeps = s.filter(x => x.phase === 'sweep');
  for (const x of sweeps) {
    expect([x.vx, x.vy], `t${x.t} の狙いが変わった＝追尾している`).toEqual([0, 1]);
    expect(x.x, `t${x.t} で横（西）へ寄った＝軸に沿った1本になっていない`).toBe(s[0].x);
  }
  // ③ 逃げ切った時点で床の帯の外に居る＝「絵を見て避けた」が数で言える
  const lastZone = [...s].reverse().find(x => x.zone)?.zone;
  expect(lastZone, '掃過のあいだ床の帯が消えている').toBeTruthy();
  const px = s[sweeps.length - 1].px + 0.5;
  expect(px < lastZone.left || px > lastZone.left + lastZone.w,
    `プレイヤー（描画 x ${px}）がまだ帯（${lastZone.left}〜${lastZone.left + lastZone.w}）の中`
    + '＝避け切れていない立ち位置で測っている').toBe(true);
  // ④ 避けても乗り上げは完結する（硬直して起点まで引く）＝空振りで宙吊りにならない。
  //    ⚠️ 0n（両生）以降は「空振りの後に陸へ残っていないこと」では測れない＝周期が畳まれた後は
  //    平時の歩きが陸へも上がる∴測るのは**引き波が起点まで引き切ったこと**。
  expect(s.some(x => x.phase === 'stranded'), '空振りだと硬直しない').toBe(true);
  // ⚠️ 「掃過は空を打っても最後まで走る」を測るのは**この本**（南へ 3.0 セル走る道が
  //    ボスの体（2×2）にとって最後まで空いている唯一の幾何）。`{-⑪`（西へ走る）では
  //    舞台の看板 (6,1) が両生になった主の体に当たって途中で止まる∴深さは測れない。
  const strandFirst = s.find(x => x.phase === 'stranded');
  expect(strandFirst.y - s[0].y, '南へ進んだ量が surgeCells に届かない＝空振りだと途中で止まる')
    .toBeCloseTo(c.surgeCells, 6);
  const crawlEnd = surgeRuns(s).find(r => r.phase === 'crawl');
  expect(crawlEnd, '空振りの後に引き波へ入っていない').toBeTruthy();
  const home = s.find(x => x.t === crawlEnd.to);
  expect(home.x, '引き波が横へずれた＝掃過の道を逆に辿っていない').toBe(home.homeX);
  // ⚠️ **端数は許す**：引き波の速さは `surgeCells / (crawlMs / TICK_MS)` ＝「上限でちょうど
  //    帰り着く」設計∴実時間の tick が 120ms より僅かに長いだけで最後の1歩が上限に切られる
  //    （満タンの深さ 3.0 を引くとき実測 0.17 セル残った）。測るのは「起点へ**帰った**こと」
  //    ∴残りは1歩（0.5 セル）未満で足りる（引き波が無い／逆向きなら残りは 3.0 になる）。
  expect(Math.abs(home.y - home.homeY),
    `空振りの後に起点まで引いていない（残り ${Math.abs(home.y - home.homeY)} セル）`
    + '＝掃過ぶん前へ出たままになる').toBeLessThan(MOVE_STEP);
  expect(last.phase, '空振りの後に相が畳まれていない').toBe('idle');
  expect(last.readyAt, '次の乗り上げまでの間が数えられていない').toBeGreaterThan(0);
  expect(c.hitRange, '当たり判定が広がった＝この本の立ち位置（1.5 セル退避）では測れない')
    .toBeLessThan(1.5 - 0.5);
});

// ⚠️ この本は 0n（2026-09-01）で**意図的に裏返した**：旧 `{-⑤` は「平時は水のセルから
//    はみ出さない／陸の向こうの相手には岸に沿って横滑りする」を測っていた。捨てた理由は
//    節の頭の ⚠️（池に閉じた主は斜めにずれた床へ軸を合わせられず、実測9セルが永久の安全地帯に
//    なった）。∴測る物を「水から出ないこと」から「**陸へも上がって寄ること**」へ入れ替える。
test('{-⑤ 平時は両生＝水でも陸でもプレイヤーへ寄る（地形が変えるのは速さだけ）', async ({ page }) => {
  // 引き金の外（端 6.71）＝乗り上げは起きない∴平時の歩きだけを測れる
  const m = ENEMY_META[SL];
  const out = await trackSeaLord(page, { ticks: 14, spawn: SL_FAR });
  const s = out.samples;
  expect(out.error).toBeUndefined();
  const first = s[0], last = s[s.length - 1];
  // ① 前提＝この 14 tick は一度も乗り上げていない（＝測っているのは平時の歩き）
  expect(last.surges, '引き金の外なのに乗り上げた＝triggerRange が効いていない').toBe(0);
  for (const x of s) expect(x.phase, `t${x.t} の相が idle でない`).toBe('idle');
  // ② **水帯を出て陸へ上がる**（両生）＝プレイヤーは南（陸の向こう）に居る∴南へ動く手を指す。
  //    ここが 0 のままなら「水から出ない」実装に戻った＝斜めの安全地帯が復活している。
  expect(last.y, 'プレイヤー側（南）へ 1 ミリも動かない＝水帯に閉じている（両生でない）')
    .toBeGreaterThan(first.y);
  expect(Math.max(...s.map(x => x.land)), '14 tick のあいだ体が一度も陸に掛からない'
    + '＝水の外へ出られていない（＝斜めにずれて立つだけで無敵に戻る）').toBeGreaterThan(0);
  // ③ 遠い軸から詰める（`enemyChase` と同じ歩き方）＝西（dx 6.5）が先で、南（dy 3.5）は後
  //    （s[0] ＝1 tick 進めた後の値∴湧きの座標は定数 SL_ROW/SL_COL で見る）
  expect(last.x, '西へ寄っていない＝プレイヤーを追っていない（置物）').toBeLessThan(first.x);
  expect(s[0].x, '1 tick 目に西へ動いていない').toBeLessThan(SL_COL);
  expect(s[0].y, '1 tick 目に南へ動いた＝遠い軸（西）より近い軸を先に詰めている').toBe(SL_ROW);
  // ④ 1 tick の刻みは**必ず** `speed × moveSpeed`（水 0.25／陸 0.125）の内側＝
  //    プレイヤーの1歩（MOVE_STEP 0.5）より小さい＝走って逃げれば必ず引き離せる
  const swim = m.speed * m.moveSpeed.water;
  for (let i = 1; i < s.length; i++) {
    const d = Math.abs(s[i].x - s[i - 1].x) + Math.abs(s[i].y - s[i - 1].y);
    expect(d, `t${s[i].t} の刻みが speed × moveSpeed.water（${swim}）を越えた＝地形倍率が効いていない`)
      .toBeLessThanOrEqual(swim + 1e-9);
    expect(d, `t${s[i].t} の刻みがプレイヤーの1歩（${MOVE_STEP}）以上＝逃げ切れない`)
      .toBeLessThan(MOVE_STEP);
  }
  // ⑤ 平時に**帰り先を記録しない**＝帰り先は「乗り上げの起点」だけを指す（0n の単一の真実）。
  //    ⚠️ 0n までは毎 tick 更新していた（＝最後に丸ごと水だった座標）。毎 tick 更新へ戻すと
  //    引き波が「起点」ではなく「直前の位置」へ引く＝掃過ぶん前へ出たままになる。
  for (const x of s) {
    expect(x.homeX, `t${x.t} に帰り先が記録された＝乗り上げていないのに引き波の終点が動いている`)
      .toBeNull();
    expect(x.homeY, `t${x.t} に帰り先が記録された`).toBeNull();
  }
});

// ⚠️ この本も 0n で前提を入れ替えた：旧題は「乗り上げた体は**必ず水へ帰る**（這い戻りが
//    上限で切れても泳ぎが帰り先へ連れ戻す）」＝水に閉じた主だから要った保証。両生になった今
//    「陸に残ること」は事故ではない（陸でも歩ける）∴測るべきは
//    **引き波が上限で切れて途中に残っても周期が宙吊りにならない**ことへ移る。
test('{-⑥ 引き波は起点へ引き、上限で切れて途中に残っても周期は宙吊りにならない', async ({ page }) => {
  const c = ENEMY_META[SL].surge;
  // 引き波を**わざと間に合わない遅さにする**＝上限（`crawlMs`）で切れた時点でまだ起点から
  // 遠い、という状況を作る。⚠️ `crawlMs` を縮めるだけでは作れない：引き波の速さは
  // `surgeCells / (crawlMs/TICK_MS)` の**導出値**∴縮めるほど速くなり、必ず間に合ってしまう
  // （実測＝`crawlMs 240` は 1.5 セル/tick で 2 tick で帰り着く＝この本の前提に届かない）。
  // ∴取り残しを作る唯一の入口は `crawlSpeed` の直接指定（出荷データには無い＝{-① が番をする）。
  const m = ENEMY_META[SL];
  const out = await trackSeaLord(page, {
    ticks: 50, patch: { surge: { ...c, crawlMs: 240, crawlSpeed: 0.05 } },
  });
  const s = out.samples;
  expect(out.error).toBeUndefined();
  // ① 上限が足りない＝引き波の終わりに**まだ起点から遠い**（この本の前提）
  const crawlRun = surgeRuns(s).find(r => r.phase === 'crawl');
  expect(crawlRun, '引き波に入っていない＝前提が崩れた').toBeTruthy();
  expect(crawlRun.ticks, '引き波が上限で切れていない＝取り残される状況を作れていない')
    .toBe(nSurgeTicks(240));
  const stuck = s.find(x => x.t === crawlRun.to);
  const distTo = (x) => Math.hypot(x.x - stuck.homeX, x.y - stuck.homeY);
  expect(distTo(stuck), '引き波の上限で切れたのに起点へ帰り着いている＝前提が崩れた')
    .toBeGreaterThan(MOVE_STEP);
  expect(stuck.land, '掃過が陸で終わっていない＝この舞台（南岸）の前提が崩れた').toBeGreaterThan(0);
  // ② 引き波のあいだは**起点から遠ざからない**（＝掃過の逆向きへ引く。追い直さない）
  const crawling = s.filter(x => x.phase === 'crawl');
  for (let i = 1; i < crawling.length; i++) {
    expect(distTo(crawling[i]), `t${crawling[i].t} で起点から遠ざかった＝引き波が追っている`)
      .toBeLessThanOrEqual(distTo(crawling[i - 1]) + 1e-9);
  }
  // ③ 上限で切れたら**必ず idle へ畳む**＝相が crawl のまま固まらない（宙吊りの正体）
  const after = s.find(x => x.t === crawlRun.to + 1);
  expect(after.phase, '引き波が切れた後の相が idle でない＝周期が crawl で固まる').toBe('idle');
  expect(after.readyAt, '次の乗り上げまでの間が数えられていない＝周期が止まる').toBeGreaterThan(0);
  // ④ 途中に残ったまま**平時の歩きが再開する**（両生∴陸でも歩ける＝置物にならない）。
  //    ⚠️ ここが 0n の変更点そのもの：旧実装は「陸に居るあいだの仕事は帰ることだけ」で、
  //    その規則を落とすと巨体が陸で永久に固まった。今はその規則自体が無い＝歩けることを測る。
  const roam = s.filter(x => x.t > crawlRun.to && x.phase === 'idle');
  expect(roam.length, '引き波の後に idle の tick が無い＝測れていない').toBeGreaterThan(2);
  expect(roam.some(x => x.x !== after.x || x.y !== after.y),
    '引き波が切れた後 1 ミリも動かない＝陸で固まっている（機構が死ぬ）').toBe(true);
  const swim = m.speed * m.moveSpeed.water;
  for (let i = 1; i < roam.length; i++) {
    const d = Math.abs(roam[i].x - roam[i - 1].x) + Math.abs(roam[i].y - roam[i - 1].y);
    if (roam[i].t !== roam[i - 1].t + 1) continue;      // 相を跨いだ差分は測らない
    expect(d, `t${roam[i].t} の刻みが speed × moveSpeed.water を越えた＝陸の上で速くなっている`)
      .toBeLessThanOrEqual(swim + 1e-9);
  }
  // ⑤ 周期は普通に回る（＝2回目の乗り上げが来る）＝取り残しが周期を殺していない
  expect(s[s.length - 1].surges, '取り残された後に乗り上げが再開しない＝周期が宙吊り')
    .toBeGreaterThanOrEqual(2);
});

test('{-⑦ HP 半分で打ち寄せの設定が差し替わり、走っている周期は畳まれない（窓は縮まない）', async ({ page }) => {
  const m = ENEMY_META[SL];
  const c = m.surge, p2 = m.phases.find(ph => ph.surge !== undefined).surge;
  // **陸で止まっている最中に**半分を割らせる（＝殴り返している最中に相が切り替わる状況そのもの）
  const out = await trackSeaLord(page, {
    ticks: 60, debugOff: true, dropWhen: { atPhase: 'stranded', dmg: 53 + m.def },
  });
  const s = out.samples;
  expect(out.error).toBeUndefined();
  const runs = surgeRuns(s);
  const strandRun = runs.find(r => r.phase === 'stranded');
  expect(strandRun, '陸で止まる相に入っていない＝前提が崩れた').toBeTruthy();
  const dropIdx = s.findIndex(x => x.hp < m.hp);
  expect(dropIdx, 'ダメージが入っていない').toBeGreaterThan(-1);
  expect(s[dropIdx].hp, 'HP が半分を割っていない＝相が発火しない').toBeLessThanOrEqual(m.hp * 0.5);
  expect(s[dropIdx].phase, '陸で止まっている最中に落とせていない＝測りたい場面と違う')
    .toBe('stranded');
  // ① 設定が差し替わった（`_surge`＝エンティティ側の1つの入口）
  expect(s[s.length - 1].cfg, '後半の打ち寄せの設定が入っていない').toEqual(p2);
  // ② **走っている1周は畳まれない**＝殴り返している窓が「殴った本人のせいで」消えない
  expect(strandRun.ticks, `相が切り替わった瞬間に陸での停止が ${p2.strandedMs}ms へ縮んだ`
    + '＝殴り返す窓が殴った本人のせいで消える').toBe(nSurgeTicks(c.strandedMs));
  expect(runs[runs.indexOf(strandRun) + 1].phase, '相の切り替えで周期が idle へ飛んだ'
    + '＝陸の上で泳ぎしか持たない移動に戻る（動かない砲台になる）').toBe('crawl');
  // ③ 2周目は後半の数で動く＝**深く**乗り上げ、**予告は縮まない**
  const second = s.filter(x => x.surges >= 2);
  expect(second.length, '後半に入ってから乗り上げが来ない').toBeGreaterThan(0);
  const w2 = surgeRuns(second).find(r => r.phase === 'windup');
  expect(w2.ticks, '後半で予告が縮んだ＝盾で防げない一撃を見てから動けない')
    .toBe(p2.windupMs / TICK_MS);
  const sw2 = second.filter(x => x.phase === 'sweep');
  expect(Math.max(...sw2.map(x => x.zone?.h ?? 0)),
    '後半の帯が深くなっていない＝強化が絵に出ていない')
    .toBeCloseTo(p2.surgeCells + 1 + p2.hitRange * 2, 6);
  // ④ 後半でも周期は宙吊りにならない＝2周目も予告→掃過→硬直と進む（相が sweep で固まらない）。
  //    ⚠️ 「水へ帰れず陸で固まっている」を測る本ではなくなった（0n＝両生∴陸に居てよい）。
  expect(surgeRuns(second).map(r => r.phase).slice(0, 2),
    '後半の2周目が 予告→掃過 の順で進んでいない').toEqual(['windup', 'sweep']);
  expect(second.some(x => x.phase === 'stranded'),
    '後半の掃過の後に硬直へ入っていない＝相が sweep のまま固まる').toBe(true);
});

test('{-⑧ 打ち寄せの使い手は { だけ・{ は他の8体の移動機構を持たない', () => {
  const sm = mechanismsOf(ENEMY_META[SL]);
  const others = ['W', 'A', 'N', 'J', 'O', 'U', 'G', 'I'].map(k => mechanismsOf(ENEMY_META[k]));
  expect(sm.has('surge'), '{ が移動機構（surge）を持っていない').toBe(true);
  expect([...sm].filter(k => others.every(x => !x.has(k))).length,
    '{ に他の8体が持たない機構が1つも無い＝9体目の型になっていない').toBeGreaterThan(0);
  expect(others.some(x => x.has('surge')),
    '他のボスが打ち寄せを持っている＝{ の固有機構ではない').toBe(false);
  const users = Object.entries(ENEMY_META).filter(([, m]) => m.surge).map(([k]) => k);
  expect(users, '打ち寄せを持つ敵が { 以外にも居る（設計が重複した）').toEqual([SL]);
  // 借り物でない番人＝特に `combat`（W）や `dash` が生えた瞬間に「地形が位置を決める」が消える
  for (const k of ['combat', 'laneStalk', 'burrowAmbush', 'hide', 'dash', 'coil', 'gaze',
    'soar', 'momentum', 'leap', 'tongue', 'zigzag']) {
    expect(ENEMY_META[SL][k], `${k} を持っている＝W/A/N/J/O/U/G/I の型を借りている`).toBeUndefined();
  }
  for (const p of ENEMY_META[SL].phases ?? []) {
    for (const k of ['dash', 'coil', 'hide', 'gaze', 'soar', 'momentum', 'tongue']) {
      expect(p[k], `後半に ${k} が生えている＝他のボスの後半と同じ型`).toBeUndefined();
    }
  }
});

test('{-⑨ bal_sea_lord は 10×12・水帯は body と同じ 2 行・{ が (4,7) に1体だけ・南北に岸がある', () => {
  const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
  const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  const sd = MAP.layers[TEST_LAYER].stages[stageKey('bal_sea_lord')];
  expect(sd.rows).toBe(10);
  expect(sd.cols).toBe(12);
  const c = ENEMY_META[SL].surge;
  // 水判定は passable.js `isWaterAt` と同じ式（tiles 層でも bgTiles 層でも水）
  const water = (r, cc) => sd.tiles[r]?.[cc] === TILE.WATER
    || sd.bgTiles?.[`${r},${cc}`] === TILE.WATER;

  const lords = [];
  for (let r = 0; r < sd.rows; r++) {
    for (let cc = 0; cc < sd.cols; cc++) {
      const ch = sd.tiles[r][cc];
      if (ch === TILE.SEA_LORD) { lords.push([r, cc]); continue; }
      if (r === 6 && cc === 1) continue;              // 看板 i（南岸の脇）
      if (water(r, cc)) continue;                     // 水帯（下で形を測る）
      const edge = r === 0 || cc === 0 || r === sd.rows - 1 || cc === sd.cols - 1;
      const want = edge && !isArenaDoor(r, cc, sd.cols) ? TILE.WALL : TILE.FLOOR;
      expect(sd.tiles[r][cc], `(${r},${cc}) が想定と違う`).toBe(want);
    }
  }
  expect(lords, '{ が1体だけ (4,7) に居る前提が崩れた').toEqual([[SL_ROW, SL_COL]]);
  // ① 水帯＝**body と同じ 2 行**（rows 4-5）で横は端から端まで。
  // ⚠️ この「丸ごと水に入れる y が1点しかない」幾何を**残す**こと＝引き波の帰り先を座標で
  //    持たず条件（「丸ごと水」など）で判定すると、固定幅の刻みでは条件を満たす点を必ず
  //    通り過ぎる（2026-09-01 に実装中に踏んだ＝北岸で永久に固まった）＝その罠を再発させたら
  //    赤くなる舞台。両生（0n）になっても引き波の刻み方は同じ∴この舞台の価値は変わらない。
  const rowsOfWater = [];
  for (let r = 0; r < sd.rows; r++) {
    const n = [...Array(sd.cols).keys()].filter(cc => water(r, cc) || sd.tiles[r][cc] === TILE.SEA_LORD).length;
    if (n > 0) rowsOfWater.push([r, n]);
  }
  expect(rowsOfWater.map(([r]) => r), '水帯が rows 4-5 の 2 行でない＝機構の舞台が変わった')
    .toEqual([SL_ROW, SL_ROW + 1]);
  for (const [r, n] of rowsOfWater) {
    expect(n, `水帯 row ${r} が端から端まで（10 セル）でない＝横滑りの助走が足りない`).toBe(10);
  }
  // ② 南北に岸がある＝乗り上げの深さ（surgeCells）ぶんの床が両方にある
  for (const dir of [-1, 1]) {
    for (let k = 1; k <= c.surgeCells; k++) {
      const r = dir < 0 ? SL_ROW - k : SL_ROW + 1 + k;
      expect(sd.tiles[r]?.[SL_COL], `(${r},${SL_COL}) が床でない＝${dir < 0 ? '北' : '南'}へ`
        + '乗り上げる深さが足りない').toBe(TILE.FLOOR);
    }
  }
  // ③ この節の湧きの前提＝間合い（`enemyEdgeDist` と同じ式）
  const edgeDist = (row, col) => Math.hypot(
    Math.max(0, Math.abs(col - (SL_COL + 0.5)) - 0.5),
    Math.max(0, Math.abs(row - (SL_ROW + 0.5)) - 0.5));
  expect(sd.tiles[SL_STAND.row][SL_STAND.col], '南岸の湧きが床でない').toBe(TILE.FLOOR);
  expect(sd.tiles[SL_FAR.row][SL_FAR.col], '引き金の外の湧きが床でない').toBe(TILE.FLOOR);
  // 南岸＝引き金の内側で、掃過（surgeCells）がちょうど届く距離
  expect(edgeDist(SL_STAND.row, SL_STAND.col), '南岸の湧きが引き金の外')
    .toBeLessThanOrEqual(c.triggerRange);
  expect(edgeDist(SL_STAND.row, SL_STAND.col), '南岸の湧きへ掃過が届かない＝当たりを測れない')
    .toBeLessThanOrEqual(c.surgeCells);
  // 引き金の外が実在する（GUIDE §7-15＝部屋が狭くて常に射程内、を作らない）
  expect(edgeDist(SL_FAR.row, SL_FAR.col), '引き金の外に立てる場所が無い＝平時の泳ぎを測れない')
    .toBeGreaterThan(c.triggerRange);
  // 西へ 3 歩（1.5 セル）退く床がある（{-④ の避け方）
  for (let k = 1; k <= 2; k++) {
    expect(sd.tiles[SL_STAND.row][SL_STAND.col - k], `(${SL_STAND.row},${SL_STAND.col - k}) が床でない`
      + '＝横へ退く助走が無い').toBe(TILE.FLOOR);
  }
});

// ── {-⑩ 本番のボス部屋（field 12,19）の前提＝闘技場で測った機構がそのまま成立する ─────────
// ⚠️ 検証ステージで緑でも本番の部屋で機構が死ぬ（＝プレイヤーが一生見ない）ことがある
//    ＝U 嵐の鷲王・I 沼地の大蝦蟇の実プレイ報告で2度踏んだ穴（GUIDE §7-15）。∴本番の幾何も測る。
// ⚠️ 0n（2026-09-01 の再判定 NG）で**測り方そのものを入れ替えた**（下の ⑤〜⑧ の ⚠️）。
test('{-⑩ 本番のボス部屋に無敵セルが無く、予告のあいだに危険域の外へ出られる（前半・後半とも）', () => {
  const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
  const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  const sd = MAP.layers.field.stages['12,19'];
  expect(sd?.isBossRoom, '本番のボス部屋（field 12,19）がボス部屋でない').toBe(true);
  const c = ENEMY_META[SL].surge;
  const water = (r, cc) => sd.tiles[r]?.[cc] === TILE.WATER
    || sd.bgTiles?.[`${r},${cc}`] === TILE.WATER;
  // 陸＝乗り上げ先になれる床（石畳・床）。壁／家の外壁は乗り上げられない。
  const landable = (r, cc) => {
    const ch = sd.tiles[r]?.[cc];
    return !!ch && !water(r, cc) && (ch === TILE.FLOOR || ch === TILE.STONE_FLOOR);
  };
  let at = null;
  for (let r = 0; r < sd.rows; r++) {
    for (let cc = 0; cc < sd.cols; cc++) if (sd.tiles[r][cc] === TILE.SEA_LORD) at = [r, cc];
  }
  expect(at, '本番のボス部屋に { が居ない').toBeTruthy();
  const [br, bc] = at;
  // ① { は**水の中**に立っている（2×2 の4セルすべて水）＝平時の泳ぎが成立する
  for (let r = br; r <= br + 1; r++) {
    for (let cc = bc; cc <= bc + 1; cc++) {
      expect(water(r, cc) || sd.tiles[r][cc] === TILE.SEA_LORD,
        `本番の { の body (${r},${cc}) が水でない＝湧いた瞬間に陸に乗っている`).toBe(true);
    }
  }
  // ② 乗り上げ先＝4軸のどれかで、掃過の道が塞がっておらず、**終点で体の下に陸がある**
  //    （＝盾で防げない唯一の打点が本番でも出る。ここが 0 なら「正面を向いて待つだけで無傷」に戻る）
  const passable = (r, cc) => water(r, cc) || landable(r, cc)
    || sd.tiles[r]?.[cc] === TILE.SEA_LORD || sd.tiles[r]?.[cc] === TILE.DOORWAY_BOSS;
  const bodyOk = (r, cc) => passable(r, cc) && passable(r + 1, cc)
    && passable(r, cc + 1) && passable(r + 1, cc + 1);
  const bodyLand = (r, cc) => [[r, cc], [r + 1, cc], [r, cc + 1], [r + 1, cc + 1]]
    .filter(([y, x]) => landable(y, x)).length;
  const hauls = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dr, dc]) => {
    // 掃過は連続座標を surgeSpeed 刻みで進む∴間のセルも通れないと途中で止まる
    for (let k = 1; k <= c.surgeCells; k++) {
      if (!bodyOk(br + dr * k, bc + dc * k)) return false;
    }
    return bodyLand(br + dr * c.surgeCells, bc + dc * c.surgeCells) > 0;
  });
  expect(hauls.length, '本番のボス部屋では乗り上げる先が無い＝盾で防げない唯一の打点が出ない'
    + '（＝正面を向いて待つだけで無傷に戻る）').toBeGreaterThan(0);
  // ③ 引き金（triggerRange）の内側に**立てる床**がある＝乗り上げが実プレイで起きる
  let inside = 0;
  const edgeDist = (row, col) => Math.hypot(
    Math.max(0, Math.abs(col - (bc + 0.5)) - 0.5),
    Math.max(0, Math.abs(row - (br + 0.5)) - 0.5));
  for (let r = 0; r < sd.rows; r++) {
    for (let cc = 0; cc < sd.cols; cc++) {
      if (landable(r, cc) && edgeDist(r, cc) <= c.triggerRange) inside++;
    }
  }
  expect(inside, '引き金の内側に立てる床が無い＝本番では一度も乗り上げて来ない').toBeGreaterThan(0);
  // ④ { が実際に泳げる水面＝**body を含む水の連結成分**（部屋の外周も水だが石畳の輪で隔たれて
  //    いる∴部屋全体の水を数えても意味が無い）。
  //    ⚠️ 2026-09-01 実測＝内側の池は 4×4 の 16 セル（body 2×2 ∴横滑りの余地は縦横 2 セルずつ）。
  //    実プレイの判断（d）で部屋を作り直したが、**池はこの 16 セルのまま**（広げたのは
  //    まわりの輪＝下の ⑤/⑥）＝ユーザー決定「このボスがいる4x4の枠はそのままに、そのまわりの
  //    移動できる部分を外側に広げる」。∴この数が動いたら池を触った＝別の設計変更。
  const seen = new Set([`${br},${bc}`]);
  const q = [[br, bc]];
  while (q.length) {
    const [r, cc] = q.shift();
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nr = r + dr, nc = cc + dc, k = `${nr},${nc}`;
      if (seen.has(k) || nr < 0 || cc < 0 || nr >= sd.rows || nc >= sd.cols) continue;
      if (!water(nr, nc) && sd.tiles[nr][nc] !== TILE.SEA_LORD) continue;
      seen.add(k); q.push([nr, nc]);
    }
  }
  expect(seen.size, '本番の池の広さが変わった＝横滑りの余地が変わった'
    + '（PROGRESS に実測を記録してこの数を更新せよ）').toBe(16);
  // 池は body より縦横 2 セル大きい＝**滑る余地はあるが張り付き続けられはしない**
  const rowsIn = [...seen].map(k => +k.split(',')[0]);
  const colsIn = [...seen].map(k => +k.split(',')[1]);
  expect(Math.max(...rowsIn) - Math.min(...rowsIn) + 1, '池の縦幅が body（2）より狭い＝泳げない')
    .toBeGreaterThan(2);
  expect(Math.max(...colsIn) - Math.min(...colsIn) + 1, '池の横幅が body（2）より狭い＝泳げない')
    .toBeGreaterThan(2);

  // ── ⑤〜⑧ 2026-09-01（0n）実プレイの再判定 NG＝「この位置にいればずっと攻撃があたらず、
  //    枠攻撃のあとに近づいて剣攻撃連打、あたらなくなったらまたこの位置に戻る、で倒せてしまう」
  // 旧 ⑤/⑥ は**両生になって嘘になった**∴測り方を2つ入れ替えた：
  //   ・立ち位置＝「池の中に収まる 2×2」ではなく**両生の BFS**（水も陸も通る）で数える。
  //     旧＝池の中だけ ∴池の外に立って撃つ掃過を1つも数えていなかった（＝安全地帯を見逃す側）。
  //   ・危険域＝軸を**無限の行／列**として見ていた（池に閉じた主ならそれで足りた）。両生では
  //     嘘になる（掃過は前方 `surgeCells` で終わる∴軸に沿って主の背中側へ抜ける逃げ方が実在
  //     するのに、無限の行では逃げ場ゼロに見える＝実測 111 通りの偽の違反）。∴**床に描く矩形と
  //     同じ形**（`surgeZoneBox`）で測り、逃げ道は床グラフの BFS で数える。
  // ⚠️ 柱（家の外壁 'h' ×4）は 0n で撤去した：2×2 の体には柱の**斜めの影**があり、隅の2セル
  //    （(1,10)・(8,1)）が「乗り上げは起きるのに当たらない」床として残った（実測＝乗り上げ5回・
  //    命中0）。海の聖域に家の外壁が立っている絵の不自然さも同時に消える。
  expect(sd.tiles.flatMap(row => [...row]).filter(ch => ch === TILE.HOUSE_WALL).length,
    '柱（家の外壁）が戻った＝2×2 の体に斜めの影ができる＝無料の反撃窓が復活する').toBe(0);
  const HALF = 0.5;
  // 戦闘中にプレイヤーが立てる床（門は入室で `boss_closed` ＝**戦闘中は通れない**）
  const bossFloor = (r, cc) => landable(r, cc) && sd.tiles[r]?.[cc] !== TILE.DOORWAY_BOSS;
  const inPool = (r, cc) => seen.has(`${r},${cc}`);
  // 主の体（2×2）が入れる位置＝**両生**∴水でも陸でもよい（塞ぐのは壁・宝箱・閉じた門）
  const bodyFree = (r, cc) => [[r, cc], [r + 1, cc], [r, cc + 1], [r + 1, cc + 1]]
    .every(([y, x]) => y >= 0 && x >= 0 && y < sd.rows && x < sd.cols
      && (water(y, x) || landable(y, x) || sd.tiles[y][x] === TILE.SEA_LORD));
  // 主が実際に取り得る立ち位置＝湧き位置から BFS（整数格子＝engine の 0.5 刻みの部分集合
  // ∴ここで到達と言えるものは engine でも到達できる／取りこぼしは安全側に出る）
  expect(bodyFree(br, bc), '主の体が湧き位置に入らない＝部屋の形が前提と違う').toBe(true);
  const anchors = [];
  {
    const seenA = new Set([`${br},${bc}`]);
    const q2 = [[br, bc]];
    while (q2.length) {
      const [r, cc] = q2.shift();
      anchors.push([r, cc]);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = cc + dc, k = `${nr},${nc}`;
        if (seenA.has(k) || !bodyFree(nr, nc)) continue;
        seenA.add(k); q2.push([nr, nc]);
      }
    }
  }
  expect(anchors.some(([r, cc]) => !inPool(r, cc)),
    '主の立ち位置が池の中だけ＝両生になっていない（＝斜めにずれた床が永久の安全地帯に戻る）')
    .toBe(true);
  const floors = [];
  for (let r = 0; r < sd.rows; r++) {
    for (let cc = 0; cc < sd.cols; cc++) if (bossFloor(r, cc)) floors.push([r, cc]);
  }
  expect(floors.length, '戦闘中に立てる床が数えられない＝部屋の形が前提と違う').toBeGreaterThan(20);
  const anchorEdge = (ar, ac, pr, pc) => Math.hypot(
    Math.max(0, Math.abs(pc - (ac + HALF)) - HALF),
    Math.max(0, Math.abs(pr - (ar + HALF)) - HALF));
  // 実際に飛んで来る掃過＝軸が合い（直交のずれ ≤ hitRange）・軸方向に届き・道が塞がっていないもの
  const firingAxes = (cfg, ar, ac, pr, pc) => [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([uy, ux]) => {
    const gx = Math.max(0, Math.abs(pc - (ac + HALF)) - HALF);
    const gy = Math.max(0, Math.abs(pr - (ar + HALF)) - HALF);
    if (ux !== 0 ? gy > cfg.hitRange : gx > cfg.hitRange) return false;
    if (ux !== 0 ? gx > cfg.surgeCells + cfg.hitRange : gy > cfg.surgeCells + cfg.hitRange) return false;
    if (ux !== 0 ? Math.sign(pc - (ac + HALF)) !== ux : Math.sign(pr - (ar + HALF)) !== uy) return false;
    const need = Math.ceil(ux !== 0 ? gx : gy);
    for (let k = 1; k <= need; k++) if (!bodyFree(ar + uy * k, ac + ux * k)) return false;
    return true;
  });
  // 危険域＝床に描く角丸矩形と**同じ形**（`enemy-ai.js surgeZoneBox`）
  const inZone = (cfg, ar, ac, uy, ux, r, cc) => {
    const pad = HALF + cfg.hitRange;
    const cx = ac + HALF, cy = ar + HALF;
    const ex = cx + ux * cfg.surgeCells, ey = cy + uy * cfg.surgeCells;
    return cc >= Math.min(cx, ex) - pad && cc <= Math.max(cx, ex) + pad
      && r >= Math.min(cy, ey) - pad && r <= Math.max(cy, ey) + pad;
  };
  // 危険域の外の床へ出るまでの歩数（床グラフの BFS・1歩＝1セル）。出られなければ Infinity
  const escapeSteps = (cfg, ar, ac, uy, ux, pr, pc) => {
    if (!inZone(cfg, ar, ac, uy, ux, pr, pc)) return 0;
    const got = new Set([`${pr},${pc}`]);
    let front = [[pr, pc]];
    for (let step = 1; step <= 8; step++) {
      const next = [];
      for (const [r, cc] of front) {
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = cc + dc, k = `${nr},${nc}`;
          if (got.has(k) || !bossFloor(nr, nc)) continue;
          if (!inZone(cfg, ar, ac, uy, ux, nr, nc)) return step;
          got.add(k); next.push([nr, nc]);
        }
      }
      front = next;
      if (!front.length) return Infinity;
    }
    return Infinity;
  };
  // ⑤〜⑦ は**前半・後半それぞれの数**で測る（後半は深さ 4.0 ＝危険域が長い＝逃げるのも遠い）
  const PHASES = [['前半', c], ['後半', ENEMY_META[SL].phases.find(ph => ph.surge).surge]];
  // ⑤ **無敵セルが無い**：どの床にも「体当たりが届く立ち位置」と「実際に飛んで来る掃過」が在る。
  //    ＝実プレイの NG（立っているだけで無傷な床が9セル）を幾何で潰した本体。
  const noRam = floors.filter(([r, cc]) =>
    !anchors.some(([ar, ac]) => anchorEdge(ar, ac, r, cc) <= SWORD_REACH));
  expect(noRam.map(([r, cc]) => `(${r},${cc})`),
    '体当たりが永久に届かない床がある＝そこに立てば無傷で待てる').toEqual([]);
  for (const [label, cfg] of PHASES) {
    const noSweep = floors.filter(([r, cc]) =>
      !anchors.some(([ar, ac]) => firingAxes(cfg, ar, ac, r, cc).length));
    expect(noSweep.map(([r, cc]) => `(${r},${cc})`),
      `${label}: 掃過が永久に届かない床がある＝盾で防げない打点が来ない立ち位置（＝無料の反撃窓）`)
      .toEqual([]);
    // ⑥ 予告を見てから危険域の外へ出られる（歩ける距離＝`windupMs / TICK_MS × MOVE_STEP` セル）。
    //    ⚠️ ここが 0n で `windupMs` を 600 → 720 へ上げた理由そのもの（2.5 セルでは 17 通り
    //    出られなかった＝南北の 2 行しかない通路で軸に沿って 3 セル走るしかない場合が在る）。
    const budget = (cfg.windupMs / TICK_MS) * MOVE_STEP;
    const trapped = [];
    for (const [pr, pc] of floors) {
      for (const [ar, ac] of anchors) {
        for (const [uy, ux] of firingAxes(cfg, ar, ac, pr, pc)) {
          const steps = escapeSteps(cfg, ar, ac, uy, ux, pr, pc);
          if (steps > budget) {
            trapped.push(`(${pr},${pc})←主(${ar},${ac})の`
              + `${ux ? (ux > 0 ? '東' : '西') : (uy > 0 ? '南' : '北')}掃過(${steps}歩)`);
          }
        }
      }
    }
    expect(trapped.length, `${label}: 予告 ${cfg.windupMs}ms（${budget} セル）で危険域から出られない`
      + `床が ${trapped.length} 通りある＝予告を見ても避ける先が無い立ち位置`
      + `: ${trapped.slice(0, 6).join(' / ')}`).toBe(0);
  }
  // ⑦ 「岸から引き離すのが正解」が**床の上で成立する**＝どちらの窓も選べる。
  //    水際（池に接した床）で殴れば掃過は水で終わり得る＝窓は `strandedWaterMs`（短い）／
  //    池から `surgeCells` 以上離れた床へ届く掃過は必ず陸で終わる＝窓は `strandedMs`（長い）。
  const poolDist = (r, cc) => Math.min(...[...seen].map((k) => {
    const [pr, pc] = k.split(',').map(Number);
    return Math.hypot(r - pr, cc - pc);
  }));
  const shore = floors.filter(([r, cc]) => poolDist(r, cc) <= 1);
  const inland = floors.filter(([r, cc]) => poolDist(r, cc) >= c.surgeCells);
  expect(shore.length, '池に接した床が無い＝水際で殴る（短い窓）という選択が存在しない')
    .toBeGreaterThan(0);
  expect(inland.length, `池から ${c.surgeCells} セル以上離れた床が無い＝主を岸から引き離せない`
    + '（＝長い窓 strandedMs を取る攻略が床の上に無い）').toBeGreaterThan(0);
  // ⑧ 「射程外」＝0n 以降は**空間ではなく時間**（`cooldownMs`）が作る。
  //    ⚠️ 旧 ⑥ は「素の `triggerRange`（3.5）の外に立てる床が在る」を測っていた。両生になった
  //    今その床は**幾何的に作れない**（主は部屋のどこへでも歩いて来る）∴この本で測るのは
  //    「引き金の内側に立てる床が在る（＝機構が起きる）」＝上の ③ だけにして、息を継ぐ側は
  //    `{-①` の `cooldownMs > 0` と「主はプレイヤーより遅い（7 割以下）」が保証する。
});

test('{-⑪ 狙いは予告に**入った瞬間**に固定される（掃過の開始で取り直さない）', async ({ page }) => {
  // {-④（横へ退く）では狙いの取り直しを検出できない：あの立ち位置（南 3.5・西 2.5 まで退避）
  // では取り直しても軸が西へ倒れない∴「予告の終わりで取り直す」細工が緑のまま通る。
  // ∴**軸が入れ替わる**幾何をわざと作る：
  //   立ち位置 (6,4) ＝ dx −3.5 / dy 1.5 ∴予告に入った瞬間の軸は**西**（面まで 3.16＝引き金 3.5 の内側）。
  //   予告のあいだに南へ 4 歩（0.5×4）歩くと (8,4) ＝ dx −3.5 / dy 3.5 ＝**同点**
  //   ∴`Math.abs(dx) > Math.abs(dy)` が偽になり、取り直せば軸は**南**へ倒れる。
  const c = ENEMY_META[SL].surge;
  const out = await trackSeaLord(page, {
    ticks: 24, debugOff: true, spawn: { row: 6, col: 4 },
    moveWhen: { atPhase: 'windup', dir: 'down', steps: 4 },
  });
  const s = out.samples;
  expect(out.error).toBeUndefined();
  expect(out.movedAt.length, '予告のあいだに南へ歩けていない＝軸の入れ替えを作れていない').toBe(4);
  // ① 予告の帯は**西向き**（＝入った瞬間の軸）で描かれる
  const wind = s.filter(x => x.phase === 'windup');
  expect(wind.length, '予告に入っていない＝引き金の内側に立てていない').toBeGreaterThan(0);
  for (const x of wind) {
    expect([x.vx, x.vy], `t${x.t} の予告の軸が西でない＝立ち位置の前提が崩れた`).toEqual([-1, 0]);
  }
  const z = wind[wind.length - 1].zone;
  expect(z, '予告のあいだ床の帯が無い').toBeTruthy();
  expect(z.w, '西向きの帯の幅が surgeCells ぶんに伸びていない')
    .toBeCloseTo(c.surgeCells + 1 + c.hitRange * 2, 6);
  expect(z.h, '西向きの帯の高さが body 1本ぶんでない＝軸に沿った1本になっていない')
    .toBeCloseTo(1 + c.hitRange * 2, 6);
  // ② 掃過は**南へ倒れない**＝軸は予告に入った瞬間のまま（取り直したらここで赤くなる）
  const sweeps = s.filter(x => x.phase === 'sweep');
  expect(sweeps.length, '掃過に入っていない＝取り直しを測れていない').toBeGreaterThan(0);
  for (const x of sweeps) {
    expect([x.vx, x.vy], `t${x.t} の狙いが取り直された＝予告のあいだに追尾している`).toEqual([-1, 0]);
  }
  // 軸が西のまま∴**周期のあいだ**体は1 tick も縦へ動かない（南へ倒れていれば赤くなる）。
  // ⚠️ 基準は s[0] ではなく**予告に入った tick**の y＝0n（両生）の主は平時の歩きで南へ寄る
  //    ∴予告が始まるまでに y が 4 → 4.5 へ動く（実測）。それは正しい動きで、測りたいのは
  //    「予告に入ってから軸が倒れないこと」∴基準を予告の1 tick 目に取る。
  const cycle = s.filter(x => x.phase === 'windup' || x.phase === 'sweep' || x.phase === 'stranded');
  for (const x of cycle) {
    expect(x.y, `t${x.t} で南（歩いた方）へ動いた＝軸が倒れている`).toBeCloseTo(wind[0].y, 6);
  }
  // ③ 体は西へ走り、**止まるのは地形だけ**（＝空を打っても自分から途中で止めない）
  // ⚠️ ここで深さ（surgeCells ぶん走り切る）は測れない：両生になった主は予告までに南へ半セル
  //    寄る∴体（2×2）が行 6 に掛かり、西へ走ると舞台の看板 (6,1) に当たって 2.6／3.0 で止まる
  //    （壁で止まるのは仕様どおり＝`beginSurgeSweep` の上限の ⚠️）。深さは `{-④` が測る。
  const strand = s.find(x => x.phase === 'stranded');
  expect(strand, '掃過の後に止まっていない＝走り切りを測れていない').toBeTruthy();
  expect(wind[0].x - strand.x, '西へほとんど進んでいない＝空を打つと途中で止めている')
    .toBeGreaterThan(c.surgeCells - 1);
  // ④ 歩いて離れた相手には当たらない（＝床の帯の外に居るのに殴られない）
  const last = s[s.length - 1];
  expect(last.hits, '帯の外へ歩いたのに当たっている＝狙いが追尾している').toBe(0);
  for (const x of s) expect(x.php, `t${x.t} で HP が減った＝帯の外で殴られている`).toBe(s[0].php);
});

// 0n の機構の核＝**地形が決めるのは硬直の長さ**。ここが `{` の攻略の分かれ道になる：
//   池の縁で殴る → 掃過は池の中で止まる（水）→ 窓は `strandedWaterMs`（1振り）
//   池から離れて誘う → 掃過は輪の上で止まる（陸）→ 窓は `strandedMs`（4振り）
// ⚠️ この対比は**本番のボス部屋でしか作れない**（`roomUrl` の ⚠️）∴この1本だけ舞台が違う。
test('{-⑫ 水際で殴ると窓は strandedWaterMs・池から離して殴ると strandedMs（地形が窓を決める）',
  async ({ page }) => {
    const c = ENEMY_META[SL].surge;
    // ① 池の縁（(7,5)＝池の南の岸のすぐ外）に立つ＝掃過はプレイヤーの体に阻まれて**池の中で**
    //    止まる∴主は水に浮いたまま＝短い窓
    const near = await trackSeaLord(page, { ticks: 24, room: true, spawn: { row: 7, col: 5 } });
    expect(near.error).toBeUndefined();
    const ns = near.samples;
    const nStrand = surgeRuns(ns).find(r => r.phase === 'stranded');
    expect(nStrand, '池の縁に立っても乗り上げて来ない＝本番の部屋で機構が起きていない').toBeTruthy();
    const nFirst = ns.find(x => x.t === nStrand.from);
    expect(nFirst.afloat, '池の中で止まったのに「陸で終わった」と記録されている＝窓が長く出る')
      .toBe(true);
    expect(nFirst.land, '水で終わったはずなのに体が陸のセルに掛かっている').toBe(0);
    expect(nFirst.span, `水で終わった窓が ${c.strandedWaterMs}ms でない`).toBe(c.strandedWaterMs);
    expect(nStrand.ticks, `水際の停止が ${c.strandedWaterMs}ms でない＝窓が地形で変わっていない`)
      .toBe(nSurgeTicks(c.strandedWaterMs));
    expect(ns[ns.length - 1].hits, '池の縁に立ち続けて一度も当たらない＝この立ち位置が安全になっている')
      .toBeGreaterThanOrEqual(1);

    // ② 池から 1 セル離れて立つ（(8,5)）＝掃過は輪の上まで来て止まる∴陸＝長い窓
    const far = await trackSeaLord(page, { ticks: 24, room: true, spawn: { row: 8, col: 5 } });
    expect(far.error).toBeUndefined();
    const fs = far.samples;
    const fStrand = surgeRuns(fs).find(r => r.phase === 'stranded');
    expect(fStrand, '池から離れて立つと乗り上げて来ない＝引き離す攻略が成り立たない').toBeTruthy();
    const fFirst = fs.find(x => x.t === fStrand.from);
    expect(fFirst.afloat, '輪の上まで来たのに「水で終わった」と記録されている').toBe(false);
    expect(fFirst.land, '陸で終わったのに体が水の中＝乗り上げていない').toBeGreaterThan(0);
    expect(fFirst.span, `陸で終わった窓が ${c.strandedMs}ms でない`).toBe(c.strandedMs);

    // ③ ∴「引き離して戦う」が正解＝窓の差は剣を振れる回数の差（1振り ⇔ 4振り）
    expect(fStrand.ticks, '陸の窓が水の窓より長くない＝地形で攻略が変わらない')
      .toBeGreaterThan(nStrand.ticks);
    expect(Math.floor(c.strandedWaterMs / SWORD_COOLDOWN_MS),
      '水際の窓でも剣が2回以上振れる＝水際で殴るのが損にならない').toBeLessThan(2);
    expect(Math.floor(c.strandedMs / SWORD_COOLDOWN_MS),
      '陸の窓で剣が3回以上振れない＝引き離す旨みが無い').toBeGreaterThanOrEqual(3);
  });


// ── 10体目 `L` 氷のリヴァイアサン：氷結（glaciate）＝**居場所を自分で作る**移動 ──────────
// 設計の骨（PLAN 8-4 (4) 0d-3 の「10体目」）は3つ：
//   ① L は**自分で凍らせた床の上しか歩けない**∴進む前に必ず足を止めて「道」を敷く
//      （`freeze`＝`freezeMs`）。この相のあいだ**咬みつきも氷礫も出さない**＝剣を入れる唯一の窓。
//   ② 道は敷いた瞬間に固定（向き・深さ `laneTiles`）＝走っている途中で追尾しない。
//      塞がれたら（**プレイヤーの体でも**）その場で敷き直す。
//   ③ 敷いた氷は `spikeMs` 後に**氷柱**となって噴き上がる＝**盾を無視する唯一の打点**。
//      最後の `warnMs` が赤い予告。噴いたセルは消えるが**体の下だけ凍り直す**
//      ∴L は足場を失わない／張り付き続けると `spikeMs` ごとに足元が噴く。
// ⚠️ L の攻撃2本（咬みつき 1.5・氷礫 8）は**どちらも盾で消える**（`isShieldBlockingDir`）＝
//    I 沼地の大蝦蟇・`{` 海の主と同じ穴∴氷柱が盾を通さないことがこの機構の存在理由。
//    対価（GUIDE §7-16）は3つ＝予告 `warnMs 1080` ≧ 実測の逃げ切り 4.0 セル・床に描く危険域が
//    当たり判定と同じ1タイル・**後半フェーズでも予告を縮めない**。
// ⚠️ 弱点は炎 ×3。**炎は氷を溶かさない**（＝道を断つ機構は作らない）＝道から外れられない L に
//    「置き炎」を踏ませるのが3つ目の答え（L-⑬）。溶かす形にすると L が炎の上を通らず
//    `burnEnemiesOnFlame`（`enemyOccupiesTile` の重なり）が一度も成立せず弱点が死ぬ。
const LV = TILE.ICE_LEVIATHAN;
const LV_ROW = 4, LV_COL = 7;              // 2×2 ∴ rows 4-5 / cols 7-8
const LV_WEST = { row: 4, col: 3 };        // 同じ行の西＝端距離 3.0（噛みつき 1.5 の外から測る）
const LV_SOUTH = { row: 8, col: 7 };       // 真南＝道（南へ 3 枚）がプレイヤーの足元まで届く
// 袋小路（`.scratch/leviathan-farm-spots.mjs` が見つけた床）＝貪欲な軸選びだと L が
// cols 1-2 の縦の溝で振動して**60 秒でも被弾 0** になった立ち位置（`glaciateStepToward` の番人）。
const LV_POCKET = { row: 7, col: 0 };
// `{` と同じ「観測用に器だけ増やした」装備（盾は持たせる＝盾が氷柱を止めないことを測る）。
const LV_OBS = { ps_hearts: '13', ps_sword: '0', ps_shield: '0', ps_armor: '0', ps_weapon: '1' };
// SE の指紋（`installToneRec` は周波数だけを記録する）
const FREEZE_HZ = [1568, 1319, 1109, 988, 831, 698];  // iceFreeze＝道を敷いた（＝剣の窓が開いた）
const SPIKE_HZ  = [784, 1245, 1661, 2093];            // iceSpike＝氷柱が噴いた（低音を持たない）
// 丸めの単一の真実（`hitbox.js toTileIndex`）＝氷柱の判定は「プレイヤーの中心が在るタイル」
const lvTile = (v) => Math.floor(v + 0.5);

/**
 * `bal_ice_leviathan` の `L` を n tick 追い、毎 tick の相・位置・敷かれた氷・絵・音と
 * プレイヤーの位置／HP を返す。
 * @param {object} o
 * @param {number} o.ticks       進める論理 tick 数
 * @param {object} [o.spawn]     プレイヤーの湧き（既定＝西 (4,3)）
 * @param {boolean} [o.debugOff] true＝'g' で debug を切る（プレイヤーにダメージが通る）
 * @param {object} [o.patch]     ENEMY_META['L'] へ一時的に差し込むフィールド
 * @param {object} [o.dropWhen]  { atPhase, dmg }＝**その相になった最初の tick**にダメージを落とす
 * @param {object} [o.moveWhen]  { atPhase, dir, steps }＝その相のあいだ 1 tick に1歩ずつ歩く
 * @param {boolean} [o.face]     true＝毎 tick L の方へ向き直る（＝盾の正面を向け続ける）
 * @param {object} [o.extra]     URL のプリセット追加（ps_candle など）
 */
async function trackLeviathan(page, o) {
  await installToneRec(page);
  const sp = o.spawn ?? LV_WEST;
  await gotoFrozen(page, previewUrl('bal_ice_leviathan', sp.row, sp.col, { ...LV_OBS, ...(o.extra ?? {}) }));
  if (o.debugOff) await page.keyboard.press('g');
  return page.evaluate((a) => {
    const g = window.__game;
    if (a.patch) g.setEnemyMetaForTest('L', a.patch);
    const e0 = g.getEnemies().find(x => x.type === 'L');
    if (!e0) return { error: 'L が盤面に居ない' };
    const id = e0.id;
    const find = () => g.getEnemies().find(x => x.id === id);
    const tile = (v) => Math.floor(v + 0.5);
    // 体が跨ぐタイル＝`enemy-ai.js glaciateBodyTiles`／`passable.js isPassableForEnemy` と同じ式
    const bodyTiles = (e) => {
      const ew = e.w ?? 1, eh = e.h ?? 1;
      const c0 = Math.floor(e.x), c1 = Math.floor(e.x + ew - 1 + 0.999);
      const r0 = Math.floor(e.y), r1 = Math.floor(e.y + eh - 1 + 0.999);
      const out = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(`${r},${c}`);
      return out;
    };
    const edgeDist = (e, px, py) => {
      const cx = e.x + ((e.w ?? 1) - 1) / 2, cy = e.y + ((e.h ?? 1) - 1) / 2;
      const gx = Math.max(0, Math.abs(px - cx) - ((e.w ?? 1) - 1) / 2);
      const gy = Math.max(0, Math.abs(py - cy) - ((e.h ?? 1) - 1) / 2);
      return Math.hypot(gx, gy);
    };
    const frostPrefix = `frost-${id}-`;

    const samples = [];
    const movedAt = [];
    let stepsLeft = a.moveWhen?.steps ?? 0;
    let dropped = false;
    for (let t = 1; t <= a.ticks; t++) {
      const tone0 = window.__tones.length;
      const cur = find();
      if (!cur) break;
      // ⚠️ スナップショット越しに読む＝`_glPhase` ではなく `glPhase`（`_` 付きは常に undefined）
      const phase = cur.glPhase ?? null;
      if (a.dropWhen && !dropped && phase === a.dropWhen.atPhase) {
        g.dealDamage(id, a.dropWhen.dmg); dropped = true;
      }
      if (a.face) {
        const p0 = g.getPlayer();
        const cx = cur.x + ((cur.w ?? 1) - 1) / 2, cy = cur.y + ((cur.h ?? 1) - 1) / 2;
        const dx = cx - p0.x, dy = cy - p0.y;
        g.setHeroDir(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up'));
      }
      const mw = a.moveWhen;
      if (mw && stepsLeft > 0 && (mw.atPhase === undefined || phase === mw.atPhase)) {
        g.movePlayer(mw.dir); stepsLeft--; movedAt.push(t);
      }
      g.step(1);
      const e = find();
      if (!e) break;
      const p = g.getPlayer(), st = g.getState();
      const el = document.getElementById(`char-enemy-${id}`);
      const cells = e.frostCells ?? [];
      samples.push({
        t, now: st.gameTime, hp: e.hp, x: e.x, y: e.y, dir: e.dir,
        phase: e.glPhase ?? null, span: e.glSpan ?? null, at: e.glAt ?? null,
        dy: e.glDy ?? null, dx: e.glDx ?? null, left: e.glLeft ?? null,
        blocked: e.glBlocked ?? null, freezes: e.glFreezes ?? 0,
        spikes: e.spikes ?? 0, hits: e.spikeHits ?? 0,
        cfg: e.glaciate ?? null,
        // 氷＝キー（"r,c"）と時計だけを持ち出す（＝床に描く1枚と当たり判定が同じ集合）
        frost: cells.map(f => ({ key: `${f.r},${f.c}`, at: f.at, span: f.span,
          warn: f.warn, spikeAt: f.spikeAt, warnAt: f.warnAt })),
        body: bodyTiles(e),
        onIce: bodyTiles(e).every(k => cells.some(f => `${f.r},${f.c}` === k)),
        attackTimes: JSON.stringify(e.attackTimes ?? null),
        projectiles: g.getProjectiles().length,
        px: p.x, py: p.y, php: p.hp, pdef: st.player.def,
        ptile: `${tile(p.y)},${tile(p.x)}`,
        pdir: st.heroDir, shieldTier: st.player.shieldTier,
        reach: edgeDist(e, p.x, p.y),
        // 絵＝凍結相だけ体に付くクラス（形は変えず filter だけ振る）＋長さは JS が渡す
        freezeCls: !!el?.classList.contains('glaciate-freeze'),
        spanVar: (el?.style.getPropertyValue('--glaciate-span-ms') ?? '').trim(),
        // 床の氷の絵＝1セル＝1枚の div（id に r,c が入る＝判定と同じ集合を DOM で確かめる）
        frostEls: [...document.querySelectorAll(`div[id^="${frostPrefix}"]`)].map(x => ({
          key: x.id.slice(frostPrefix.length),
          warn: x.classList.contains('frost-warn'),
          heat: parseFloat(x.style.getPropertyValue('--frost-heat')),
        })),
        spikeFx: document.querySelectorAll('.enemy-frost-spike').length,
        newTones: window.__tones.slice(tone0),
      });
    }
    const e = find();
    return { id, samples, movedAt, end: e && { hp: e.hp, maxHp: e.maxHp, cfg: e.glaciate ?? null } };
  }, o);
}

// 相の連（[{ phase, from, to, ticks }]）＝`surgeRuns` と同じ形
function glaciateRuns(samples) {
  const runs = [];
  for (const s of samples) {
    const last = runs[runs.length - 1];
    if (last && last.phase === s.phase) { last.to = s.t; last.ticks++; continue; }
    runs.push({ phase: s.phase, from: s.t, to: s.t, ticks: 1 });
  }
  return runs;
}
// 相の長さ（tick）＝始まった tick も1 tick と数える（`nSurgeTicks` と同じ規約）
const nGlTicks = (ms) => Math.ceil(ms / TICK_MS);

test('L-① 氷のリヴァイアサンのデータ＝噛みつきは剣の外・氷柱の予告は実測の逃げ切りより長い', () => {
  const m = ENEMY_META[LV];
  const c = m.glaciate;
  const KEYS = ['freezeMs', 'laneTiles', 'spikeAtk', 'spikeMs', 'warnMs'];
  // `.scratch/leviathan-geom.mjs` の実測＝帯の中から帯の外の通れるセルへ歩く距離の最大
  //   闘技場 4 マス／本番のボス部屋 3 マス／melee_only 検証室 2 マス
  const WORST_ESCAPE_CELLS = 4.0;

  expect(c, 'glaciate が無い＝L に固有の移動機構が無い').toBeTruthy();
  // 綴りの番人（`resolveGlaciate` を読む関数が読むキー＝1文字違うと既定値に落ちて黙って動く）
  expect(Object.keys(c).sort()).toEqual(KEYS);

  // `hitAndAway` は enemyTick の分岐で glaciate より優先される∴**明示 false** が要る
  //（W/A/N/J/O/U/G/I/`{` で9回踏んだ罠＝書かないと新機構の分岐へ一度も来ない）
  expect('hitAndAway' in m, 'hitAndAway を書いていない＝既定の張り付きに戻る余地が残る').toBe(true);
  expect(m.hitAndAway, 'hitAndAway が true ＝glaciate の分岐に来ない').toBe(false);
  expect(m.initialModeWeights, '寄り方の抽選が残っている＝読まれない数値（W/O/U/G/I/{ で外した作法）')
    .toBeUndefined();
  // 弱点は炎 ×3（＝置き炎に道を踏ませる3つ目の答えの前提）
  expect(m.weakness, '弱点が消えた＝「道の先に炎を仕込む」攻略が成り立たない')
    .toMatchObject({ type: 'fire' });
  expect(m.weakness.multiplier, '炎の倍率が下がった＝弱点が実用でなくなる').toBeGreaterThanOrEqual(2);

  const bite  = m.attacks.find(a => a.type === 'sword');
  const shard = m.attacks.find(a => a.type === 'stone');
  // ① 到達距離の表（GUIDE §7-12）＝噛みつき 1.5 は**プレイヤーの剣 1.2 より外**
  //    ＝歩いている L と剣を打ち合っても勝てない∴凍結相が窓であることに意味が出る
  expect(bite.range, '噛みつきがプレイヤーの剣の内側＝歩いている L に打ち勝てる（窓が要らなくなる）')
    .toBeGreaterThan(SWORD_REACH);
  expect(shard.range, '氷礫の射程が噛みつきより短い＝到達距離の表が入れ子になっている')
    .toBeGreaterThan(bite.range);
  // ② 氷柱の予告＝時間の床（近接の溜め）以上（盾で防げない打点の対価・§7-16）
  expect(c.warnMs, `予告 ${c.warnMs}ms が近接の溜め（MELEE_WINDUP_MS）より短い＝見てから動けない`)
    .toBeGreaterThanOrEqual(MELEE_WINDUP_MS);
  // ③ 予告のあいだに歩ける距離 > 実測した最悪の逃げ切り＝**歩けば必ず避かる**
  const warnTicks = Math.floor(c.warnMs / TICK_MS);
  expect(warnTicks * MOVE_STEP, `予告 ${warnTicks} tick で歩ける ${(warnTicks * MOVE_STEP).toFixed(2)} `
    + `セルが実測の最悪 ${WORST_ESCAPE_CELLS} セルに足りない＝避けられない立ち位置が残る`)
    .toBeGreaterThan(WORST_ESCAPE_CELLS);
  // ④ 打点は `atk` と同値まで（盾で防げない一撃を防げる一撃より重くしない）＋罰になる重さ
  expect(c.spikeAtk, '氷柱が噛みつき（atk）より重い＝盾で防げない一撃の方が痛い')
    .toBeLessThanOrEqual(m.atk);
  expect(c.spikeAtk - m.def, '氷柱が防御で 1 まで削れる＝張り付きの罰にならない').toBeGreaterThan(1);
  // ⑤ 凍結相＝剣が2振り入る窓（弱点を使わない素の攻め口）
  expect(Math.floor(c.freezeMs / SWORD_COOLDOWN_MS), '凍結相で剣が2回振れない＝窓が窓でない')
    .toBeGreaterThanOrEqual(2);
  // ⑥ 氷は溜まらない＝`spikeMs` は1周期（凍結＋道を歩き切る時間）より短い
  //    ⚠️ 歩く速さは `speed` セル/tick **ではない**（`enemyGlaciateStride` は歩幅の溜め＝
  //    `accum += speed` が 1.0 を越えた tick に `MOVE_STEP` だけ動く）∴1 tick あたりは
  //    `MOVE_STEP × speed` ＝ 0.125 セル（＝1.04 セル/秒）。ここを `speed` で割ると2倍速く
  //    見積もって不変条件が偽になる（実際に一度そう書いて PLAN の算術を疑った）。
  const cellsPerTick = MOVE_STEP * m.speed;
  const walkMs = (c.laneTiles / cellsPerTick) * TICK_MS;
  expect(c.spikeMs, `氷柱までの ${c.spikeMs}ms が1周期（${Math.round(c.freezeMs + walkMs)}ms）より長い`
    + '＝次の道を敷くとき前の氷が残る＝凍った面積が積み上がる（逃げ切りの算術が1枚の帯で閉じない）')
    .toBeLessThan(c.freezeMs + walkMs);
  // ⑦ 道は部屋を覆わない（§7-15 は半径ではなく**面積**で引き算する＝I の cells 6 の失敗の逆側）
  //    体 4 枚＋前方 laneTiles × 幅2 ＝最大の帯。闘技場の床 83 枚の 2 割を越えたら
  //    「氷の上に立たない」が成立しない（＝床がほぼ氷になる）。
  const maxSlab = (m.size.w * m.size.h) + c.laneTiles * m.size.w;
  expect(maxSlab, `帯の最大 ${maxSlab} 枚が闘技場の床 83 枚の 2 割を越える＝床が氷で埋まる`)
    .toBeLessThan(83 * 0.2);

  // 後半（`phases[0].glaciate`）＝速くなるのは**道を敷く速さと氷柱の早さだけ**
  const p = m.phases.find(ph => ph.glaciate !== undefined);
  expect(p, '後半の相が氷結の設定を差し替えていない＝前半と同じ動きのまま').toBeTruthy();
  expect(Object.keys(p.glaciate).sort()).toEqual(KEYS);
  expect(p.glaciate.freezeMs, '後半の凍結相が前半より長い＝窓が広がっている').toBeLessThan(c.freezeMs);
  expect(p.glaciate.spikeMs, '後半の氷柱が前半より遅い＝床の時計が緩んでいる').toBeLessThan(c.spikeMs);
  // ⚠️ 据え置きの番人（§7-16「後半でも予告を縮めない」＝逃げ切りの算術を1文字も変えない）
  expect(p.glaciate.warnMs, '後半で予告を縮めた＝盾で防げない打点の予告が時間の床を割る')
    .toBe(c.warnMs);
  expect(p.glaciate.laneTiles, '後半で道を伸ばした＝帯の面積の引き算が変わる').toBe(c.laneTiles);
  expect(p.glaciate.spikeAtk, '後半で氷柱の打点を上げた＝避けられる技を重くしている').toBe(c.spikeAtk);
  // 後半でも「氷が溜まらない」が保つ（速度倍率ぶん歩くのが速い）
  const walkMs2 = (c.laneTiles / (cellsPerTick * (p.speedMultiplier ?? 1))) * TICK_MS;
  expect(p.glaciate.spikeMs, '後半は氷柱が1周期より遅い＝後半だけ氷が積み上がる')
    .toBeLessThan(p.glaciate.freezeMs + walkMs2);
});

test('L-② 周期＝凍結（道を敷く）→ 歩行 の2相を順に回り、長さ・絵・音が glaciate の数と一致する',
  async ({ page }) => {
    const c = ENEMY_META[LV].glaciate;
    const r = await trackLeviathan(page, { ticks: 60 });
    expect(r.error).toBeUndefined();
    const s = r.samples;

    // ① 最初の相は凍結＝**足場を作ってからしか動かない**
    const runs = glaciateRuns(s);
    expect(runs[0].phase, '最初の相が凍結でない＝氷の無い床を歩き出している').toBe('freeze');
    // ② 相は freeze と walk の2つだけ・交互に並ぶ（宙吊りの相が生えていない）
    expect([...new Set(runs.map(x => x.phase))].sort(), '相が freeze / walk の2つでない')
      .toEqual(['freeze', 'walk']);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].phase, `t${runs[i].from} で同じ相が2度続いている＝連の切り方が壊れている`)
        .not.toBe(runs[i - 1].phase);
    }
    // ③ 完走した凍結相の長さ＝freezeMs（JS が持つ1つの数＝絵にも同じ数を渡す）
    const freezes = runs.filter(x => x.phase === 'freeze' && x.to < s.length);
    expect(freezes.length, '凍結相が1度も完走していない＝周期が回っていない').toBeGreaterThanOrEqual(1);
    for (const f of freezes.slice(0, -1)) {
      expect(f.ticks, `凍結相が ${c.freezeMs}ms でない（t${f.from}〜t${f.to}）`).toBe(nGlTicks(c.freezeMs));
    }
    // ④ 絵＝凍結相のあいだだけクラスが付き、長さは JS が渡す（絵に閾値を持たせない）
    for (const x of s) {
      expect(x.freezeCls, `t${x.t}（相 ${x.phase}）の凍結の絵がずれている`).toBe(x.phase === 'freeze');
    }
    expect(s.find(x => x.phase === 'freeze').spanVar, '凍結の絵に渡す長さが freezeMs でない')
      .toBe(`${c.freezeMs}ms`);
    // ⑤ 音＝凍結に入った tick に iceFreeze（＝剣の窓が開いた合図）
    const firstFreeze = s.find(x => x.phase === 'freeze');
    expect(firstFreeze.newTones, '凍結に入った tick に iceFreeze が鳴っていない')
      .toEqual(expect.arrayContaining(FREEZE_HZ));
    // ⑥ 音＝氷柱が噴いた tick に iceSpike（何枚噴いても1回だけ）
    const erupt = s.find((x, i) => i > 0 && x.spikes > s[i - 1].spikes);
    expect(erupt, '60 tick で氷柱が1枚も噴かない＝床の時計が止まっている').toBeTruthy();
    expect(erupt.newTones, '氷柱が噴いた tick に iceSpike が鳴っていない')
      .toEqual(expect.arrayContaining(SPIKE_HZ));
    const spikeCount = erupt.newTones.filter(f => f === SPIKE_HZ[0]).length;
    expect(spikeCount, `同じ tick に iceSpike が ${spikeCount} 回鳴っている＝枚数ぶん重なっている`)
      .toBe(1);
  });

test('L-③ 氷の上しか歩けない＝歩いた全 tick で体が氷に載り、1周で進むのは laneTiles まで',
  async ({ page }) => {
    const c = ENEMY_META[LV].glaciate;
    const r = await trackLeviathan(page, { ticks: 60 });
    const s = r.samples;

    // ① 敷いた瞬間から**体の4枚は必ず氷**（＝足場を作ってから歩く）
    for (const x of s) {
      expect(x.onIce, `t${x.t}（相 ${x.phase}・(${x.y},${x.x})）で体が氷の上に載っていない`
        + `＝氷の外を歩いている（氷 ${JSON.stringify(x.frost.map(f => f.key))}）`).toBe(true);
    }
    // ② 1周（凍結→歩行）で進む距離は laneTiles まで＝道の外へは出ない
    const runs = glaciateRuns(s);
    for (let i = 0; i < runs.length; i++) {
      if (runs[i].phase !== 'walk') continue;
      const first = s.find(x => x.t === runs[i].from), last = s.find(x => x.t === runs[i].to);
      const moved = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
      expect(moved, `t${runs[i].from}〜t${runs[i].to} の歩行で ${moved} セル進んだ＝道 ${c.laneTiles} `
        + 'セルを越えている（追尾して道の外へ出た）').toBeLessThanOrEqual(c.laneTiles);
      // 進んだ軸は道の向きだけ（斜めに動かない＝1軸の道）
      if (first.dy !== 0) expect(last.x, `t${runs[i].to} で道の軸と違う向きに動いた`).toBe(first.x);
      else expect(last.y, `t${runs[i].to} で道の軸と違う向きに動いた`).toBe(first.y);
    }
    // ③ 歩行相は残り（`left`）を食い潰しながらしか進まない（＝道が移動の定義域）
    const walks = s.filter(x => x.phase === 'walk');
    expect(walks.length, '歩行相が一度も来ない＝凍結で固まっている').toBeGreaterThan(0);
    for (const x of walks) expect(x.left, `t${x.t} の道の残りが負＝道の外へ出ている`).toBeGreaterThanOrEqual(0);
    // ④ 氷は溜まらない（§7-15 の面積の引き算＝**実測した最大枚数**で閉じる）。
    //    L-① が静的に測るのは「`spikeMs` < 1周期」＝設計上は帯1枚だけ。ただし L は道を歩き切る
    //    前に塞がれて敷き直すことが多い（実測＝1周で 1.5〜1.7 セル）∴実行時は前の帯が噴く前に
    //    次の帯が敷かれて一時的に重なる。上限として帯の最大 × 2 を置く。
    //    ここが破れると床がほぼ氷になり「氷の上に立たない」という答えが消える。
    const m = ENEMY_META[LV];
    const maxSlab = (m.size.w * m.size.h) + c.laneTiles * m.size.w;
    const peak = Math.max(...s.map(x => x.frost.length));
    expect(peak, `同時に凍っていた最大 ${peak} 枚が帯の最大 ${maxSlab} 枚の 2 倍を越えた`
      + '＝帯が3枚以上重なっている（氷が積み上がっている）').toBeLessThanOrEqual(maxSlab * 2);
    expect(peak, `同時に凍っていた最大 ${peak} 枚が闘技場の床 83 枚の 3 割を越えた`
      + '＝床が氷で埋まって「氷の上に立たない」が選べない').toBeLessThan(83 * 0.3);
  });

test('L-④ 道は敷いた瞬間に固定＝歩いている途中でプレイヤーが動いても向きを変えない',
  async ({ page }) => {
    // 凍結相のあいだにプレイヤーを北へ歩かせる（＝道を敷いた向きの軸から外れる）
    const r = await trackLeviathan(page, {
      ticks: 60, spawn: LV_WEST, moveWhen: { atPhase: 'freeze', dir: 'up', steps: 8 },
    });
    const s = r.samples;
    expect(r.movedAt.length, 'プレイヤーが一歩も動いていない＝追尾しないことを測れていない')
      .toBeGreaterThan(0);

    const runs = glaciateRuns(s);
    const walk = runs.find(x => x.phase === 'walk' && x.to < s.length);
    expect(walk, '歩行相が完走していない').toBeTruthy();
    const first = s.find(x => x.t === walk.from);
    for (const x of s.filter(x => x.t >= walk.from && x.t <= walk.to)) {
      expect([x.dy, x.dx], `t${x.t} で道の向きが変わった＝走っている途中で追尾している`)
        .toEqual([first.dy, first.dx]);
      expect(x.dir, `t${x.t} で体の向きが道の向きと違う`).toBe(
        first.dy !== 0 ? (first.dy > 0 ? 'down' : 'up') : (first.dx > 0 ? 'right' : 'left'));
    }
    // 敷いた氷の集合も固定＝歩行相のあいだに新しく凍るセルは無い（噴いて消える／体の下だけ戻る）
    const laid = new Set(first.frost.map(f => f.key));
    for (const x of s.filter(x => x.t > walk.from && x.t <= walk.to)) {
      for (const f of x.frost) {
        if (laid.has(f.key)) continue;
        expect(x.body, `t${x.t} で体の外のセル ${f.key} が歩行中に凍った＝道を継ぎ足している`)
          .toContain(f.key);
      }
    }
  });

test('L-⑤ 袋小路に立っても寄って来る（最短路の1歩目＝永久の安全地帯が生まれない）',
  async ({ page }) => {
    // ⚠️ この本の由来＝`.scratch/leviathan-farm-spots.mjs` の総当たりで見つけた実害。
    //    貪欲な軸選び（離れている軸を先に試す）だと L は row 4 を西へ走り切って cols 1-2 の
    //    縦の溝に入り、南は看板 (6,1)・西は外壁で塞がれて上下に振動し続けた
    //    ＝(7,0) に立って動かないだけで **60 秒（500 tick）でも被弾 0**。
    //    N 砂嵐の蠍王の待ち伏せと同じ穴（`planBurrowPath`）∴同じ道具＝BFS の最短路の1歩目。
    const r = await trackLeviathan(page, { ticks: 300, spawn: LV_POCKET, debugOff: true, face: true });
    const s = r.samples;
    const last = s[s.length - 1];
    // ① 端距離が噛みつきの間合いまで詰む＝溝から出て回り込んで来た
    const closest = Math.min(...s.map(x => x.reach));
    expect(closest, `袋小路 (${LV_POCKET.row},${LV_POCKET.col}) に立つと L が ${closest} まで`
      + 'しか寄って来ない＝立っているだけで無傷の床が残っている').toBeLessThanOrEqual(1.5);
    // ② 実害の指標そのもの＝**被弾する**（盾を向け続けていても氷柱は通る）
    expect(s[0].php - last.php, '袋小路に立ち続けて HP が1も減らない＝無料の反撃窓が残っている')
      .toBeGreaterThan(0);
    // ③ 溝の中で振動していない＝1軸の往復だけで時間を使い切っていない
    const cols = new Set(s.map(x => x.x));
    expect(cols.size, 'L が同じ列で上下に振動しているだけ＝袋小路から出られていない').toBeGreaterThan(2);
  });

test('L-⑥ 氷柱は盾を無視する（正面で受けても通る）／氷から歩いて出れば当たらない',
  async ({ page }) => {
    const c = ENEMY_META[LV].glaciate;
    // ① 真南に立って**盾の正面を L に向けたまま一歩も退かない**＝噛みつきと氷礫は消える
    const stay = await trackLeviathan(page, {
      ticks: 90, spawn: LV_SOUTH, debugOff: true, face: true,
    });
    const s = stay.samples;
    expect(s[0].shieldTier, '盾を持っていない＝「盾で防げない」を測れていない').toBeGreaterThanOrEqual(0);
    for (const x of s) {
      expect(['up', 'down', 'left', 'right']).toContain(x.pdir);
    }
    expect(s[s.length - 1].hits, '盾を向けて立ち続けて氷柱が一度も当たらない＝盾で待つ抜け道が残る')
      .toBeGreaterThanOrEqual(1);
    // 打点＝spikeAtk − def ちょうど（当たった tick だけ HP が減る＝他の攻撃は盾で消えている）
    const dmg = Math.max(1, c.spikeAtk - s[0].pdef);
    const lost = s[0].php - s[s.length - 1].php;
    expect(lost, `失った HP ${lost} が氷柱の回数 × (spikeAtk − def) と違う`
      + '＝盾で消えるはずの噛みつき／氷礫が通っている').toBe(s[s.length - 1].hits * dmg);
    // 当たった tick には**その1枚が本当に足元に在った**（塗られていないセルでは当たらない）
    for (let i = 1; i < s.length; i++) {
      if (s[i].hits === s[i - 1].hits) continue;
      expect(s[i - 1].frost.map(f => f.key),
        `t${s[i].t} で足元 ${s[i - 1].ptile} に氷が無いのに氷柱が当たった＝告知の嘘`)
        .toContain(s[i - 1].ptile);
    }

    // ② 噴いた枚数 > 当たった回数＝**塗られた氷の大半は空振り**（立ち位置で決まる打点）
    expect(s[s.length - 1].spikes, '噴いた氷柱が命中回数以下＝どこに居ても当たる打点になっている')
      .toBeGreaterThan(s[s.length - 1].hits);

    // ③ 帯（体と同じ2列／2行）から**歩いて出る**＝氷柱は噴くが1度も当たらない。
    // ⚠️ 立ち位置は西 (4,3)＝道は西へ敷かれる（帯は rows 4-5）∴北へ3セル歩けば帯の外。
    //    真南 (8,7) から西へ逃がすと row 8 は左右が隣室への通路＝**ステージを出てしまう**
    //    （最初に書いた形。敵が消えて samples が途切れ、噴く前に測定が終わっていた）。
    const flee = await trackLeviathan(page, {
      ticks: 40, spawn: LV_WEST, debugOff: true, moveWhen: { dir: 'up', steps: 6 },
    });
    const f = flee.samples;
    expect(f.length, '逃げた側の測定が途中で切れた＝ステージを出ている').toBe(40);
    expect(f[f.length - 1].spikes, '逃げた側で氷柱が1枚も噴いていない＝比較になっていない')
      .toBeGreaterThan(0);
    expect(f[f.length - 1].hits, '歩いて氷から出ても氷柱が当たる＝避けられない打点になっている')
      .toBe(0);
  });

test('L-⑦ 赤い予告は warnMs ぶん先に出て、噴いた瞬間に絵が消える（判定と絵が同じ集合）',
  async ({ page }) => {
    const c = ENEMY_META[LV].glaciate;
    const r = await trackLeviathan(page, { ticks: 60 });
    const s = r.samples;

    // ① どのセルも「赤くなる時刻 ＝ 噴く時刻 − warnMs」＝敷いた瞬間に固定される
    for (const x of s) {
      for (const f of x.frost) {
        expect(f.spikeAt - f.warnAt, `t${x.t} のセル ${f.key} の予告が warnMs でない`).toBe(c.warnMs);
        expect(f.spikeAt - f.at, `t${x.t} のセル ${f.key} が spikeMs 後に噴かない`).toBe(c.spikeMs);
      }
    }
    // ② 床の絵＝氷の集合と1対1（塗られたのに無傷は許すが、塗られずに被弾は許さない）
    for (const x of s) {
      const drawn = new Set(x.frostEls.map(e => e.key));
      for (const f of x.frost) {
        expect(drawn, `t${x.t} のセル ${f.key} が凍っているのに床に描かれていない`).toContain(f.key);
      }
    }
    // ③ 赤（`frost-warn`）が付くのは warnAt を越えた後だけ＝早くも遅くもならない
    for (const x of s) {
      for (const e of x.frostEls) {
        const cell = x.frost.find(f => f.key === e.key);
        if (!cell) continue;                       // 噴いた直後の残骸（実時間で消える）は見ない
        expect(e.warn, `t${x.t}（now ${x.now}）のセル ${e.key} の赤が warnAt ${cell.warnAt} と`
          + '合っていない＝告知の色と時計がずれている').toBe(x.now >= cell.warnAt);
        expect(e.heat, `t${x.t} のセル ${e.key} の濃さが 0〜1 の外`).toBeGreaterThanOrEqual(0);
        expect(e.heat).toBeLessThanOrEqual(1);
      }
    }
    // ④ 噴いた tick に氷柱の絵が出る（1枚＝1セル）
    const erupt = s.find((x, i) => i > 0 && x.spikes > s[i - 1].spikes);
    expect(erupt.spikeFx, '氷柱が噴いた tick に絵が1枚も出ていない＝盾を無視する打点が無告知')
      .toBeGreaterThanOrEqual(1);
  });

test('L-⑧ 凍結相は咬みつきも氷礫も出さない＝そこだけが剣の窓', async ({ page }) => {
    // 噛みつきの間合い（1.5）の内側に立つ＝「窓の外なら殴られる」も同じ run で見える
    const r = await trackLeviathan(page, { ticks: 90, spawn: LV_SOUTH, debugOff: true });
    const s = r.samples;
    const runs = glaciateRuns(s);
    const freezes = runs.filter(x => x.phase === 'freeze' && x.to < s.length);
    expect(freezes.length, '凍結相が完走していない').toBeGreaterThanOrEqual(1);

    // ① 凍結相のあいだ攻撃の時計が1つも進まない（＝咬みつきも氷礫も出ていない）
    for (const f of freezes) {
      const inRun = s.filter(x => x.t >= f.from && x.t <= f.to);
      for (let i = 1; i < inRun.length; i++) {
        expect(inRun[i].attackTimes, `t${inRun[i].t}（凍結相）で攻撃が出た＝剣の窓が窓でない`)
          .toBe(inRun[0].attackTimes);
      }
      // 投擲物（氷礫）も増えない
      for (const x of inRun) {
        expect(x.projectiles, `t${x.t}（凍結相）で氷礫が飛んだ`).toBeLessThanOrEqual(inRun[0].projectiles);
      }
    }
    // ② 対照＝歩行相では攻撃が出る（「ずっと攻撃しない案山子」になっていない）
    const walkAttacked = s.some((x, i) => i > 0 && x.phase === 'walk'
      && x.attackTimes !== s[i - 1].attackTimes);
    expect(walkAttacked, '歩行相でも一度も攻撃しない＝凍結相が窓であることに意味が無い').toBe(true);
    // ③ 凍結相でも**床の時計は進む**（止まると「赤くなったのに噴かない」＝告知の嘘）
    const frozeSpiked = s.some((x, i) => i > 0 && x.phase === 'freeze' && x.spikes > s[i - 1].spikes);
    expect(frozeSpiked, '凍結相のあいだ氷柱が1枚も噴かない＝床の時計が行動ゲートの中に入っている')
      .toBe(true);
  });

test('L-⑨ 敷き直しても時計は戻らない／体の下だけ凍り直す（張り付きに対価がある）',
  async ({ page }) => {
    const c = ENEMY_META[LV].glaciate;
    const r = await trackLeviathan(page, { ticks: 120, spawn: LV_SOUTH, debugOff: true, face: true });
    const s = r.samples;

    // ① 続けて在るセルの時計は**据え置き**（＝赤くなった予告が白紙に戻らない）
    for (let i = 1; i < s.length; i++) {
      for (const f of s[i].frost) {
        const prev = s[i - 1].frost.find(x => x.key === f.key);
        if (!prev) continue;                       // 新しく凍ったセル
        if (prev.at !== f.at) {
          // 噴いた直後の凍り直し＝**体の下のセルだけ**（それ以外は消える）
          expect(s[i].body, `t${s[i].t} で体の外のセル ${f.key} が凍り直された＝氷が溜まる`)
            .toContain(f.key);
          expect(f.at, `t${s[i].t} のセル ${f.key} の凍り直しが過去の時刻になっている`)
            .toBeGreaterThan(prev.at);
          continue;
        }
        expect(f.spikeAt, `t${s[i].t} のセル ${f.key} の噴く時刻が後ろへずれた`
          + '＝敷き直しで時計が戻っている（張り付けば足元が噴かない抜け道）').toBe(prev.spikeAt);
      }
    }
    // ② 足場を失わない＝氷が 0 枚になる tick が無い（機構が自分を詰ませない）
    for (const x of s) expect(x.frost.length, `t${x.t} で氷が0枚＝L が足場を失っている`).toBeGreaterThan(0);
    // ③ 張り付き続けた対価＝`spikeMs` ごとに足元が噴く（当たった間隔がその周期に収まる）
    const hitTicks = s.filter((x, i) => i > 0 && x.hits > s[i - 1].hits).map(x => x.now);
    expect(hitTicks.length, '密着し続けて氷柱が一度も当たらない＝張り付きに対価が無い')
      .toBeGreaterThanOrEqual(2);
    for (let i = 1; i < hitTicks.length; i++) {
      expect(hitTicks[i] - hitTicks[i - 1], `氷柱の当たる間隔 ${hitTicks[i] - hitTicks[i - 1]}ms が`
        + `spikeMs（${c.spikeMs}ms）の 2 周を越える＝張り付きが安くなっている`)
        .toBeLessThanOrEqual(c.spikeMs * 2);
    }
  });

test('L-⑩ 相の差し替え＝HP 半分で道を敷くのが速く氷が早く噴く／予告は縮まない',
  async ({ page }) => {
    const m = ENEMY_META[LV];
    const c = m.glaciate, p2 = m.phases.find(ph => ph.glaciate !== undefined).glaciate;
    // 歩いている途中（＝殴られている最中）に相が変わる形で落とす
    const r = await trackLeviathan(page, {
      ticks: 90, dropWhen: { atPhase: 'walk', dmg: Math.ceil(m.hp * 0.6) },
    });
    const s = r.samples;
    const after = s.filter(x => x.hp <= m.hp * 0.5);
    expect(after.length, '後半に入っていない＝落としたダメージが足りない').toBeGreaterThan(0);

    // ① 設定が差し替わった（`_glaciate`＝エンティティ側の1つの入口）
    expect(after[0].cfg, '後半の設定が差し替わっていない（boss.js の applyBossPhase に口が無い）')
      .toMatchObject(p2);
    // ② 差し替え後の凍結相は短い（＝剣の窓が 2 振り→1 振り）
    const runs = glaciateRuns(after);
    const f2 = runs.find(x => x.phase === 'freeze' && x.to < after[after.length - 1].t);
    expect(f2, '後半に凍結相が完走していない＝相が宙吊り').toBeTruthy();
    expect(after.find(x => x.t === f2.from).span, `後半の凍結相が ${p2.freezeMs}ms でない`)
      .toBe(p2.freezeMs);
    // ③ 差し替え後に**新しく**凍ったセルは後半の spikeMs で噴く／予告は前半と同じ長さ
    const before = new Set(s.filter(x => x.hp > m.hp * 0.5).flatMap(x => x.frost.map(f => f.key + '@' + f.at)));
    const fresh = after.flatMap(x => x.frost).filter(f => !before.has(f.key + '@' + f.at));
    expect(fresh.length, '後半に新しく凍ったセルが無い＝差し替えを測れていない').toBeGreaterThan(0);
    for (const f of fresh) {
      expect(f.span, `後半に凍ったセル ${f.key} が前半の spikeMs のまま`).toBe(p2.spikeMs);
      expect(f.spikeAt - f.warnAt, `後半のセル ${f.key} の予告が縮んだ＝§7-16 の対価を割っている`)
        .toBe(c.warnMs);
    }
    // ④ 相が変わる前に敷いた氷は**そのままの時計で噴く**（床の絵と噴く拍がずれない）
    const old = after.flatMap(x => x.frost).filter(f => before.has(f.key + '@' + f.at));
    for (const f of old) {
      expect(f.span, `相が変わった瞬間に既存のセル ${f.key} の時計が書き換わった`).toBe(c.spikeMs);
    }
  });

test('L-⑪ 氷結の使い手は L だけ・L は他の9体の移動機構を持たない', () => {
  const lm = mechanismsOf(ENEMY_META[LV]);
  const others = ['W', 'A', 'N', 'J', 'O', 'U', 'G', 'I', SL].map(k => mechanismsOf(ENEMY_META[k]));
  expect(lm.has('glaciate'), 'L が移動機構（glaciate）を持っていない').toBe(true);
  expect(others.some(x => x.has('glaciate')),
    '他のボスが氷結を持っている＝L の固有機構ではない').toBe(false);
  const users = Object.entries(ENEMY_META).filter(([, m]) => m.glaciate).map(([k]) => k);
  expect(users, '氷結を持つ敵が L 以外にも居る（設計が重複した）').toEqual([LV]);
  // 借り物でない番人＝特に `combat` や `surge` が生えた瞬間に「居場所を自分で作る」が消える
  for (const k of ['combat', 'laneStalk', 'burrowAmbush', 'hide', 'dash', 'coil', 'gaze',
    'soar', 'momentum', 'leap', 'tongue', 'zigzag', 'surge', 'blockFacing']) {
    expect(ENEMY_META[LV][k], `${k} を持っている＝他の9体の型を借りている`).toBeUndefined();
  }
  for (const p of ENEMY_META[LV].phases ?? []) {
    for (const k of ['dash', 'coil', 'hide', 'gaze', 'soar', 'momentum', 'tongue', 'surge']) {
      expect(p[k], `後半に ${k} が生えている＝他のボスの後半と同じ型`).toBeUndefined();
    }
  }
});

test('L-⑫ 検証ステージと本番のボス部屋の幾何（GUIDE §4-3）＝氷の帯が部屋を覆わない', () => {
  const MAP = JSON.parse(readFileSync(
    fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url)), 'utf8'));
  const c = ENEMY_META[LV].glaciate;
  const m = ENEMY_META[LV];

  for (const [label, layer, key] of [
    ['闘技場', TEST_LAYER, stageKey('bal_ice_leviathan')],
    ['本番のボス部屋', 'dungeon_5', '0,0'],
  ]) {
    const sd = MAP.layers[layer].stages[key];
    expect(sd, `${label}（${layer} ${key}）が無い`).toBeTruthy();
    const rows = sd.tiles.map(r => (Array.isArray(r) ? r.join('') : r));
    expect(rows.length, `${label} の行数が 10 でない`).toBe(10);
    // ① 水が無い（`bgTiles` に水があると L の初期位置が水没する＝キュー 0f の注記）
    expect(Object.keys(sd.bgTiles ?? {}).length, `${label} に bgTiles がある＝水没の恐れ`).toBe(0);
    // ② L が1体だけ居る
    const lv = [];
    rows.forEach((row, r) => [...row].forEach((ch, cc) => { if (ch === LV) lv.push([r, cc]); }));
    expect(lv.length, `${label} に L が1体ではない`).toBe(1);
    // ③ 床（＝立てるセル）が帯の最大（体4枚＋前方 laneTiles × 幅2）の 5 倍以上ある
    //    ＝「氷の上に立たない」という答えが選べる（床の大半が氷になる部屋では選べない）
    const floors = rows.reduce((n, row) => n + [...row].filter(ch => ch === '.').length, 0);
    const maxSlab = (m.size.w * m.size.h) + c.laneTiles * m.size.w;
    expect(floors, `${label} の床 ${floors} 枚が帯の最大 ${maxSlab} 枚の 5 倍に届かない`
      + '＝床が氷で埋まって逃げ場が無い').toBeGreaterThanOrEqual(maxSlab * 5);
    // ④ L の初期位置から4方向すべてに道（laneTiles ぶん）が敷ける必要は無いが、
    //    少なくとも1方向は歩ける＝置いた瞬間から機構が回る
    const [lr, lc] = lv[0];
    const open = (r, cc) => rows[r]?.[cc] === '.' || rows[r]?.[cc] === LV;
    const walkable = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dr, dc]) => {
      for (let i = 1; i <= c.laneTiles; i++) {
        for (let k = 0; k < m.size.w; k++) {
          const r = lr + (dr !== 0 ? (dr > 0 ? m.size.h - 1 : 0) + dr * i : k);
          const cc = lc + (dc !== 0 ? (dc > 0 ? m.size.w - 1 : 0) + dc * i : k);
          if (!open(r, cc)) return false;
        }
      }
      return true;
    });
    expect(walkable.length, `${label} の L の初期位置 (${lr},${lc}) からどの向きへも `
      + `${c.laneTiles} セルの道が敷けない＝置いた瞬間に固まる`).toBeGreaterThanOrEqual(1);
  }

  // ⑤ 本番のボス部屋だけの前提＝ハートの器の宝箱と扉（戦闘中は閉じる）が在る
  const boss = MAP.layers.dungeon_5.stages['0,0'];
  expect(boss.isBossRoom, '本番のボス部屋に isBossRoom が立っていない＝扉が閉じない').toBe(true);
});

test('L-⑬ 炎は氷を溶かさない＝道の上に置いた炎を L が踏んで弱点で焼ける', async ({ page }) => {
  const m = ENEMY_META[LV];
  // 置き炎（0j）は弱点 ×3 が乗る＝`3 × multiplier − def`。連打では増えない（candle-flame.spec.js）
  const burn = Math.max(1, Math.round(CANDLE_FIRE_DMG * m.weakness.multiplier) - m.def);
  const r = await trackLeviathan(page, {
    ticks: 60, spawn: LV_SOUTH, extra: { ps_candle: '1' },
  });
  expect(r.error).toBeUndefined();

  // 真南に立つ＝道は南へ敷かれる∴プレイヤーの手前（北）のセルは必ず氷になる。
  // そこへ炎を置く＝L は道から外れられない∴必ず炎の上を通る。
  const out = await page.evaluate(() => {
    const g = window.__game;
    const e = g.getEnemies().find(x => x.type === 'L');
    const before = { hp: e.hp, frost: (e.frostCells ?? []).map(f => `${f.r},${f.c}`) };
    g.setHeroDir('up');
    g.useSubItem();                             // 北隣（＝道の上）に炎を置く
    const flames0 = g.getPlacedFlames().map(f => `${f.r},${f.c}`);
    let burned = 0, hp = before.hp;
    const frostSeen = [];
    for (let t = 0; t < 60; t++) {
      g.step(1);
      const cur = g.getEnemies().find(x => x.type === 'L');
      if (!cur) break;
      frostSeen.push((cur.frostCells ?? []).map(f => `${f.r},${f.c}`));
      if (cur.hp < hp) { burned++; hp = cur.hp; }
    }
    const flames = g.getPlacedFlames();
    return { before, flames0, flames: flames.map(f => ({ key: `${f.r},${f.c}`, burned: f.burnedCount })),
      hp, frostSeen };
  });

  expect(out.flames0.length, '炎が置けていない＝ロウソクのプリセットが効いていない').toBe(1);
  const spot = out.flames0[0];
  // ① 炎を置いたセルは（氷が敷かれていれば）氷のまま＝**炎は氷を溶かさない**
  const wasFrost = out.frostSeen.some(list => list.includes(spot));
  expect(wasFrost, `炎を置いた ${spot} が一度も氷にならない＝道の上に置けていない（測れていない）`)
    .toBe(true);
  // ② L は道から外れられない∴炎の上を通って焼ける（弱点 ×3 が生きている）
  expect(out.before.hp - out.hp, `L が炎で焼けていない（HP ${out.before.hp} → ${out.hp}）`
    + '＝置き炎に道を踏ませる攻略が成り立たない').toBeGreaterThanOrEqual(burn);
  // ③ 1つの炎は1回だけ焼く（連打の穴が氷経由で復活していない）
  for (const f of out.flames) {
    expect(f.burned, `炎 ${f.key} が同じ敵を2回以上焼いた＝連打の穴`).toBeLessThanOrEqual(1);
  }
});

// ── 11体目 `X` 魔王：詔（lockstep）＝**盾を無視する魔法攻撃**＋魔将と同じ張り付き ──────
// 2026-09-03（ユーザーの実プレイ判定→追い作業）: 旧設計（歩調＝自分の時計では歩かず、
// プレイヤーが歩いた距離ぶんだけ進む）は「今までのボスより弱い」と判定された。
// ユーザーの言葉＝「魔将のほうがスピードが早い？早いのに、こちらの横や背後を取ろうとする
// 動きがあって、盾で防げない位置にこようとするのが強さになってる。なのに魔王は魔将より
// 遅くて、その強さがまったくなくなってしまってる。魔将と同じような速さがあって、かつ、
// 魔法攻撃があると強さが出ると思う」＝一旦その数値で試すことをユーザー自身が了承済み
// （「強すぎて倒せないかもしれないけど、一度それで試してみたい」）。
// ✅ 現行の設計の骨は2つ：
//   ① 移動は**魔将（V）と同じ張り付き**（`hitAndAway`＋`initialModeWeights` を魔将の
//      後半フェーズと同じ数で丸ごと借りる）＝速さ `ENEMY_SPEED_FAST`（魔将と同速）・
//      背後・側面を取りに来る（flank 主体）＝盾の正面が守らない位置を取りに来る。
//   ② 詔（みことのり＝「魔法攻撃」）は移動の主導権を失っても**残す**＝器（`_lsHeat` 0〜1）
//      は**時間で満ち、歩いた距離だけ押し戻る**（`fillPerSec`/`coolPerCell`）。満ちると
//      錨のように止まって唱え（`warnMs`）、**唱え始めた瞬間のプレイヤーのタイル**を中心に
//      半径 `radius`（端距離）の集合へ**盾を無視する**打点が落ちる。当たれば `sealMs`
//      だけ剣が封じられ、外せば `rootMs` の硬直（＝避けた側の追加の窓）。
// ⚠️ X の攻撃2本（剣 1.5・石 6）は**どちらも盾で消える**（`isShieldBlockingDir`）＝
//    I 沼地の大蝦蟇・`{` 海の主・L 氷のリヴァイアサンと同じ穴∴詔が盾を通さないことが
//    この機構の存在理由。対価（GUIDE §7-16）は3つ＝予告 `warnMs 1200` ≧ 実測の逃げ切り
//    3.0 セル＋剣の硬直 1.5 セル・床に描く円が当たり判定と同じ集合・**後半でも予告を縮めない**。
// ⚠️ 「距離のゲート」を持たない（＝どこに立っていても詔は来る）＝I/`{`/L で塞いだ
//    「立っているだけで無傷」の穴を距離ではなく**時間**で閉じる。実測＝闘技場の床 82 セル
//    すべてで 60 tick 以内に被弾（`.scratch/darklord-farm-spots.mjs`）。
// ⚠️ §7-2「敵の速度をプレイヤーと同速にしてはいけない」に**意図的に触れる**（魔将 V も
//    既に同じ数で運用されている＝ユーザーがその強さを「正解」として指定した2026-09-03）。
const DL = TILE.DARK_LORD;
const DL_ROW = 4, DL_COL = 8;              // 1×1（`bal_dark_lord` の実配置）
const DL_FAR  = { row: 1, col: 1 };        // 北西の隅＝X から 7.62（石 6 の外）＝距離ゲートの番人
const DL_NEAR = { row: 4, col: 6 };        // 同じ行の西 2.0（剣 1.5 の外・石 6 の内）
const DL_OBS = { ps_hearts: '13', ps_sword: '0', ps_shield: '0', ps_armor: '0', ps_weapon: '1' };
// SE の指紋（`installToneRec` は周波数だけを記録する）
const DECREE_CAST_HZ = [110, 165, 110, 104];   // decreeCast＝唱え始め（低音の鐘が3つ・最後だけ下がる）
const DECREE_HIT_HZ  = [82, 233, 311];         // decreeHit＝盾を無視する打点が入った
const DECREE_MISS_HZ = [294, 220, 147];        // decreeMiss＝外した（＝硬直が開く）
// 丸めの単一の真実（`hitbox.js toTileIndex`）＝詔の判定は「プレイヤーの中心が在るタイル」
const dlTile = (v) => Math.floor(v + 0.5);
// 相の長さ（tick）＝始まった tick も1 tick と数える（`nGlTicks` と同じ規約）
const nDlTicks = (ms) => Math.ceil(ms / TICK_MS);

/**
 * `bal_dark_lord` の `X` を n tick 追い、毎 tick の器・相・位置・詔の集合・絵・音と
 * プレイヤーの位置／HP／剣封じを返す。
 * @param {object} o
 * @param {number} o.ticks       進める論理 tick 数
 * @param {object} [o.spawn]     プレイヤーの湧き（既定＝北西の隅 (1,1)）
 * @param {boolean} [o.debugOff] true＝'g' で debug を切る（プレイヤーにダメージが通る）
 * @param {boolean} [o.pace]     true＝毎 tick 上下に歩き続ける（rows 1〜5 を往復＝器を押し戻す）
 * @param {object} [o.moveWhen]  { atPhase, dir, steps }＝その相のあいだ 1 tick に1歩ずつ歩く
 * @param {object} [o.dropWhen]  { atPhase, dmg }＝**その相になった最初の tick**にダメージを落とす
 * @param {boolean} [o.face]     true＝毎 tick X の方へ向き直る（＝盾の正面を向け続ける）
 * @param {object} [o.extra]     URL のプリセット追加
 * @param {object} [o.patch]     `setEnemyMetaForTest('X', patch)`＝出荷の数値では見えない
 *                               不変条件（溜めの上限）だけを極端な数で測るための口
 */
async function trackDarkLord(page, o) {
  await installToneRec(page);
  const sp = o.spawn ?? DL_FAR;
  await gotoFrozen(page, previewUrl('bal_dark_lord', sp.row, sp.col, { ...DL_OBS, ...(o.extra ?? {}) }), o.seed);
  if (o.debugOff) await page.keyboard.press('g');
  return page.evaluate((a) => {
    const g = window.__game;
    if (a.patch) g.setEnemyMetaForTest('X', a.patch);
    const e0 = g.getEnemies().find(x => x.type === 'X');
    if (!e0) return { error: 'X が盤面に居ない' };
    // ⚠️ `getEnemies()` は**スナップショット**（ホワイトリスト・別オブジェクト）＝ここへの
    //    代入は実体に効かない。`speed` はスポーン時に実体へ写された値（`e.speed`）を
    //    `resolveEnemySpeed` が優先して読む（`e.speed ?? meta.speed`）＝META の patch も
    //    間に合わない（実体はもう出来ている）∴実体を直接書く `setEnemyFieldForTest` を使う
    //    （`speed:0` で X を立ち止まらせたい呼び出し元のため＝移動だけ止め、詔の時計は動かす）。
    if (a.patch?.speed !== undefined) g.setEnemyFieldForTest(e0.id, { speed: a.patch.speed });
    // `entityPatch`＝任意のフィールドを実体へ直接書く（座標・`_haPhase` を固定して
    // 角に追い詰められた状況を作るためなど）。
    if (a.entityPatch) g.setEnemyFieldForTest(e0.id, a.entityPatch);
    const id = e0.id;
    const find = () => g.getEnemies().find(x => x.id === id);
    const tile = (v) => Math.floor(v + 0.5);
    const zonePrefix = `decree-${id}-`;

    const samples = [];
    const movedAt = [];
    let stepsLeft = a.moveWhen?.steps ?? 0;
    let dropped = false;
    let paceDir = 'up';
    const p0 = g.getPlayer();
    let prev = { px: p0.x, py: p0.y, ex: e0.x, ey: e0.y };
    let travel = 0, enemyMoved = 0;
    for (let t = 1; t <= a.ticks; t++) {
      const tone0 = window.__tones.length;
      const cur = find();
      if (!cur) break;
      // ⚠️ スナップショット越しに読む＝`_lsPhase` ではなく `lsPhase`（`_` 付きは常に undefined）
      const phase = cur.lsPhase ?? null;
      if (a.dropWhen && !dropped && phase === a.dropWhen.atPhase) {
        g.dealDamage(id, a.dropWhen.dmg); dropped = true;
      }
      if (a.face) {
        const p1 = g.getPlayer();
        const dx = cur.x - p1.x, dy = cur.y - p1.y;
        g.setHeroDir(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up'));
      }
      if (a.pace) {
        const p1 = g.getPlayer();
        if (p1.y <= 1) paceDir = 'down';
        if (p1.y >= 5) paceDir = 'up';
        g.movePlayer(paceDir); movedAt.push(t);
      }
      const mw = a.moveWhen;
      if (mw && stepsLeft > 0 && (mw.atPhase === undefined || phase === mw.atPhase)) {
        g.movePlayer(mw.dir); stepsLeft--; movedAt.push(t);
      }
      g.step(1);
      const e = find();
      if (!e) break;
      const p = g.getPlayer(), st = g.getState();
      travel     += Math.hypot(p.x - prev.px, p.y - prev.py);
      enemyMoved += Math.hypot(e.x - prev.ex, e.y - prev.ey);
      prev = { px: p.x, py: p.y, ex: e.x, ey: e.y };
      const el = document.getElementById(`char-enemy-${id}`);
      samples.push({
        t, now: st.gameTime, hp: e.hp, x: e.x, y: e.y, dir: e.dir,
        heat: e.lsHeat ?? 0, phase: e.lsPhase ?? null, span: e.lsSpan ?? null, at: e.lsAt ?? null,
        center: e.lsR != null ? `${e.lsR},${e.lsC}` : null,
        cells: (e.lsCells ?? []).map(c => `${c.r},${c.c}`),
        step: e.lsTravel ?? 0, casts: e.lsCasts ?? 0, hits: e.lsHits ?? 0, whiffs: e.lsWhiffs ?? 0,
        cfg: e.lockstep ?? null,
        travel: travel, enemyMoved: enemyMoved,
        attackTimes: JSON.stringify(e.attackTimes ?? null),
        projectiles: g.getProjectiles().length,
        px: p.x, py: p.y, php: p.hp, pdef: st.player.def,
        ptile: `${tile(p.y)},${tile(p.x)}`,
        pdir: st.heroDir, shieldTier: st.player.shieldTier,
        sealed: !!st.player.swordSealed, sealUntil: st.player.sealUntil ?? null,
        // 絵＝唱えている体／外した硬直（形は変えず浮く・傾く）＋器と長さは JS が渡す
        castCls: !!el?.classList.contains('lockstep-cast'),
        rootCls: !!el?.classList.contains('lockstep-root'),
        heatVar: (el?.style.getPropertyValue('--lockstep-heat') ?? '').trim(),
        spanVar: (el?.style.getPropertyValue('--lockstep-span-ms') ?? '').trim(),
        // 床の円＝1セル＝1枚の div（id に r,c が入る＝判定と同じ集合を DOM で確かめる）
        zoneEls: [...document.querySelectorAll(`div[id^="${zonePrefix}"]`)].map(x => ({
          key: x.id.slice(zonePrefix.length),
          progress: parseFloat(x.style.getPropertyValue('--decree-progress')),
        })),
        fallFx: document.querySelectorAll('.enemy-decree-fall').length,
        newTones: window.__tones.slice(tone0),
      });
    }
    const e = find();
    return { id, samples, movedAt,
      end: e && { hp: e.hp, maxHp: e.maxHp, cfg: e.lockstep ?? null,
        casts: e.lsCasts ?? 0, hits: e.lsHits ?? 0, whiffs: e.lsWhiffs ?? 0 } };
  }, o);
}

// 相の連（[{ phase, from, to, ticks }]）＝`glaciateRuns` と同じ形
function lockstepRuns(samples) {
  const runs = [];
  for (const s of samples) {
    const last = runs[runs.length - 1];
    if (last && last.phase === s.phase) { last.to = s.t; last.ticks++; continue; }
    runs.push({ phase: s.phase, from: s.t, to: s.t, ticks: 1 });
  }
  return runs;
}

test('X-① 魔王のデータ＝魔将と同じ速さで寄る／詔の予告は実測の逃げ切り＋剣の硬直より長い', () => {
  const m = ENEMY_META[DL];
  const v = ENEMY_META[TILE.BOSS];   // 魔将＝ユーザーが「同じ速さ」の基準に指定した相手
  const c = m.lockstep;
  const KEYS = ['coolPerCell', 'decreeAtk', 'fillPerSec', 'radius', 'rootMs', 'sealMs', 'warnMs'];
  // `.scratch/darklord-geom.mjs` の実測（闘技場 10×12・立てるセル 84 枚を総当たり）＝
  // 半径 1.6 の円（端距離）の外へ出るのに要るタイル数は**どのセルでも 3 タイル＝3.0 セル
  // ＝6 tick**（出られないセル 0・円の枚数 7〜21）∴逃げ切りの床はここ。
  const ESCAPE_CELLS = 3.0;

  expect(c, 'lockstep が無い＝X に固有の機構（詔）が無い').toBeTruthy();
  // 綴りの番人（`resolveLockstep` を読む関数が読むキー＝1文字違うと既定値に落ちて黙って動く）
  expect(Object.keys(c).sort()).toEqual(KEYS);

  // 2026-09-03（ユーザーの実プレイ判定）＝移動は魔将（V）と同じ張り付きに差し替えた。
  // `hitAndAway` は enemyTick の分岐で他の10体の機構より優先される＝明示 true が要る。
  expect(m.hitAndAway, '移動が魔将と同じ張り付きでない＝速さが実感できない設計に戻っている')
    .toBe(true);
  expect(m.speed, '速さが魔将と違う＝「魔将と同じような速さ」の判定と食い違う').toBe(v.speed);
  // 2026-09-03（2回目のユーザー実プレイ判定）＝寄り方の癖は魔将から意図的に外した
  // （「もっと回り込んでくる動きを積極的にやらせたほうがいいかも」）＝魔将の既定の均等抽選
  // （flank 1/3）より flank を強く出す。値は W 魔物の後半フェーズと同じ（実測済みの重み）。
  expect(m.initialModeWeights, '寄り方の重みが無い＝魔将と同じ均等抽選のまま（回り込みを強めていない）')
    .toEqual({ flank: 1.6, direct: 0.7, strafe: 0.25, wander: 0.15 });
  expect(m.initialModeWeights.flank, '回り込み（flank）の重みが他の型以下＝均等抽選から強めていない')
    .toBeGreaterThan(m.initialModeWeights.direct + m.initialModeWeights.wander);

  // ① 詔の予告＝時間の床（近接の溜め）以上（盾で防げない打点の対価・§7-16）
  expect(c.warnMs, `予告 ${c.warnMs}ms が近接の溜め（MELEE_WINDUP_MS）より短い＝見てから動けない`)
    .toBeGreaterThanOrEqual(MELEE_WINDUP_MS);
  // ② 予告のあいだに歩ける距離 > 実測の逃げ切り ＋ **剣を振った硬直で歩けない距離**
  //    ＝「殴っていた最中に唱えられても、振り終えてから歩けば避かる」
  const warnTicks = Math.floor(c.warnMs / TICK_MS);
  const freezeCells = Math.ceil(MELEE_FREEZE_MS / TICK_MS) * MOVE_STEP;
  expect(warnTicks * MOVE_STEP, `予告 ${warnTicks} tick で歩ける ${(warnTicks * MOVE_STEP).toFixed(2)} `
    + `セルが実測の逃げ切り ${ESCAPE_CELLS} ＋剣の硬直 ${freezeCells} セルに足りない`
    + '＝剣を振った直後に唱えられると避けられない')
    .toBeGreaterThan(ESCAPE_CELLS + freezeCells);

  // ③ 打点は `atk` と同値まで（盾で防げない一撃を防げる一撃より重くしない）＋罰になる重さ
  expect(c.decreeAtk, '詔が剣（atk）より重い＝盾で防げない一撃の方が痛い').toBeLessThanOrEqual(m.atk);
  // 被弾は `max(1, decreeAtk - player.def)` の減算∴**最強の防具（伝説の鎧 def 3）でも**
  // 床の 1 に張り付かない＝立ち止まりの罰が終盤で消えない
  const maxDef = Math.max(...ARMOR_TIERS.map(a => a.def));
  expect(c.decreeAtk - maxDef, `詔が最強の防具（def ${maxDef}）で 1 まで削れる`
    + '＝終盤に立ち止まりの罰が消える').toBeGreaterThan(1);
  // ④ 剣封じは無敵より短い＝被弾が「次も殴れない」へ連鎖しない
  expect(c.sealMs, `剣封じ ${c.sealMs}ms が無敵 ${INVINCIBLE_MS}ms 以上＝起き上がっても振れない`)
    .toBeLessThan(INVINCIBLE_MS);
  // ⑤ 外したときの硬直＝剣が1振り入る窓（避けるのが報われる）
  expect(Math.floor(c.rootMs / SWORD_COOLDOWN_MS), '外させても剣が1回も振れない＝避ける旨みが無い')
    .toBeGreaterThanOrEqual(1);

  // ⑥ 器＝止まれば必ず満ちる／歩けば必ず押し戻る（両方向の番人）
  const fillPerTick = c.fillPerSec * (TICK_MS / 1000);
  const coolPerTick = c.coolPerCell * MOVE_STEP;     // 全速で歩いた 1 tick ぶん
  expect(coolPerTick, '全速で歩いても器が満ちる＝「走れば来ない」が成り立たない')
    .toBeGreaterThan(fillPerTick);
  const fillTicks = Math.ceil(1 / fillPerTick);
  expect(fillTicks * TICK_MS, `器が満ちるまで ${fillTicks * TICK_MS}ms＝剣が2振りも入らない`
    + '（詔が来る前に何もできない）').toBeGreaterThan(SWORD_COOLDOWN_MS * 2);
  // 剣を振り続ける（硬直で歩けない）だけでも器は満ちる＝立ち回りの穴を作らない
  expect(MELEE_FREEZE_MS * c.fillPerSec / 1000, '剣1振りの硬直で器が1%も満ちない＝振り続けが安全')
    .toBeGreaterThan(0.01);

  // ⑦ 円は部屋を覆わない（§7-15 は半径ではなく**面積**で引き算する）
  //    端距離 radius のタイル集合の枚数＝`enemy-ai.js decreeCells` と同じ式で数える
  const span = Math.ceil(c.radius + 0.5);
  let area = 0;
  for (let dr = -span; dr <= span; dr++) {
    for (let dc = -span; dc <= span; dc++) {
      const gy = Math.max(0, Math.abs(dr) - 0.5), gx = Math.max(0, Math.abs(dc) - 0.5);
      if (Math.hypot(gx, gy) <= c.radius) area++;
    }
  }
  expect(area, `詔の円 ${area} 枚が闘技場の床 83 枚の 3 割を越える＝部屋のどこへ逃げても同じ`)
    .toBeLessThan(83 * 0.3);

  // ⑧ 到達距離の表（GUIDE §7-12）＝剣 1.5 はプレイヤーの剣 1.2 より外・石はその外
  const sword = m.attacks.find(a => a.type === 'sword');
  const stone = m.attacks.find(a => a.type === 'stone');
  expect(sword.range, '魔王の剣がプレイヤーの剣の内側＝張り付いても打ち勝てる')
    .toBeGreaterThan(SWORD_REACH);
  expect(stone.range, '石の射程が剣より短い＝到達距離の表が入れ子になっている')
    .toBeGreaterThan(sword.range);
  // 2026-09-03（ユーザーの実プレイ判定）＝密着（斬り合いの間合い）では石を出さない。
  // 剣と石の cooldown は完全に独立∴距離のゲートが無いと「盾で受けた直後に斬りたいのに、
  // 斬っている間に石が刺さる」＝見てから動けない一撃になる（§9-6 の minRange と同じ型）。
  expect(stone.minRange, '石に minRange が無い＝密着でも構わず飛んでくる').toBeGreaterThan(sword.range);
  expect(stone.minRange, '石の minRange がプレイヤーの剣より内側＝斬り合いの間合いで石が来る')
    .toBeGreaterThan(SWORD_REACH);

  // 後半（`phases[0]`）＝魔将と同じ加速（×1.5）＋詔の器だけ速く満ちる
  const p = m.phases.find(ph => ph.lockstep !== undefined);
  expect(p, '後半の相が詔の設定を差し替えていない＝前半と同じ強さのまま').toBeTruthy();
  const vPhaseSpeed = v.phases.find(ph => ph.speedMultiplier)?.speedMultiplier;
  expect(vPhaseSpeed, '基準にした魔将の後半加速が読めない＝比較の裏取りが崩れている').toBeTruthy();
  expect(p.speedMultiplier, '後半で速さが魔将の後半（×1.5）と違う＝強さの基準がずれる').toBe(vPhaseSpeed);
  expect(Object.keys(p.lockstep).sort()).toEqual(KEYS);
  expect(p.lockstep.fillPerSec, '後半の器が前半より遅く満ちる＝詔の間隔が伸びている')
    .toBeGreaterThan(c.fillPerSec);
  // ⚠️ 据え置きの番人（§7-16「後半でも予告を縮めない」＝逃げ切りの算術を1文字も変えない）
  for (const k of ['warnMs', 'radius', 'decreeAtk', 'sealMs', 'coolPerCell', 'rootMs']) {
    expect(p.lockstep[k], `後半で ${k} を動かした＝盾で防げない打点の対価（§7-16）を割っている`)
      .toBe(c[k]);
  }
  // 回り込みの重みは後半で差し替えない（速さだけ増す＝前半と同じ癖のまま強くなる）
  expect(p.modeWeights, '後半に modeWeights がある＝速さと同時に寄り方の癖まで変わる').toBeUndefined();
  // 後半でも「歩けば器が押し戻る」が保つ
  expect(p.lockstep.coolPerCell * MOVE_STEP, '後半は全速で歩いても器が満ちる＝走る答えが消える')
    .toBeGreaterThan(p.lockstep.fillPerSec * (TICK_MS / 1000));
});

test('X-② 移動＝プレイヤーが止まっていても魔将と同じ速さで寄る／器は歩いた距離だけ冷える',
  async ({ page }) => {
    // ① 止まっているプレイヤーへ実際に寄る（＝旧「歩調」の逆＝これが今回の追い作業の核）。
    //    北西の隅（距離 7.62）から確実に間合いへ入ることを確かめる。
    // ⚠️ 60 tick だと approach/retreat の周期（1周 約32〜45 tick）が1〜2回しか回らず、
    //    flank/strafe/wander の均等抽選（魔将と同じ既定の重み）が**たまたま**遠回りだけを
    //    引く確率が無視できない（実測でも 3.04 セルまで詰め切れない回が出た＝閾値の
    //    すぐ外＝空振り）。150 tick（複数周）に伸ばして「引きの悪さ」を均す。
    // 🔴（キュー11・2026-09-12）150 tick に伸ばしても引きの悪さは 0 にならない＝実測で
    //    `--repeat-each=150` を回すと 4/150（2.7%）が「最接近 2.0615〜3.04」で落ちた
    //    （`pickApproachMode` の unseeded Math.random が真因＝機構の穴ではない統計的
    //    テイルリスク）。∴この tick 数のあいだの「引きの悪さ」を均す判定そのものは
    //    乱数任せから**固定シード**へ移す＝`seed:1` は 151 個の候補（1〜40・1000〜1150）を
    //    実測し全部で closest<2.0 かつ casts>=2 を満たすことを確認済み（`.scratch/`
    //    の使い捨てスクリプトで検証・AIロジックは無改修）。
    const still = await trackDarkLord(page, { ticks: 150, spawn: DL_FAR, seed: 1 });
    expect(still.error).toBeUndefined();
    const dist = (x) => Math.hypot(x.y - x.py, x.x - x.px);
    const start = dist(still.samples[0]);
    const closest = Math.min(...still.samples.map(dist));
    expect(start, '測定の前提＝最初は剣も石も届かない距離であること').toBeGreaterThan(7);
    expect(closest, `150 tick 経っても最接近が ${closest.toFixed(2)} セル＝魔将と同じ速さで`
      + '寄っていない（旧「歩調」の再発）').toBeLessThan(2.0);
    // 止まっていても**器は満ちる**＝寄るだけでなく詔でも罰が来る（案山子ではない）
    expect(still.samples[still.samples.length - 1].casts,
      '150 tick 止まっていて詔が一度も来ない＝止まるのが最強の戦法になる').toBeGreaterThanOrEqual(2);

    // ② 歩き続ける（`pace`）と器は満ちない（`coolPerCell` が `fillPerSec` を上回る）
    //    ＝「立ち止まりの罰」は移動アルゴリズムを差し替えても保つ（詔だけの不変条件）。
    const pace = await trackDarkLord(page, { ticks: 60, spawn: { row: 3, col: 3 }, pace: true });
    const last = pace.samples[pace.samples.length - 1];
    expect(last.travel, '歩いていない＝測れていない').toBeGreaterThan(10);
    for (const x of pace.samples) {
      expect(x.heat, `t${x.t} で歩き続けているのに器が満ちた（器 ${x.heat}）`
        + '＝「走れば詔は来ない」が成り立たない').toBeLessThan(1);
    }
  });

test('X-③ 器が満ちた tick に唱え始め、唱えているあいだは錨（移動も剣も石も出ない）',
  async ({ page }) => {
    const c = ENEMY_META[DL].lockstep;
    const r = await trackDarkLord(page, { ticks: 60, spawn: DL_NEAR });
    const s = r.samples;
    expect(r.error).toBeUndefined();

    // ① 器は毎 tick `fillPerSec × TICK_MS` ぶんだけ満ちる（止まっている＝押し戻しゼロ）
    const fill = c.fillPerSec * (TICK_MS / 1000);
    for (let i = 1; i < s.length; i++) {
      if (s[i].phase || s[i - 1].phase) continue;           // 唱え／硬直の tick は器が動かない
      if (s[i].heat >= 1 || s[i].heat === 0) continue;       // 満ちた tick・落ちた直後は別の規則
      expect(s[i].heat - s[i - 1].heat, `t${s[i].t} の器の満ちが fillPerSec と違う`)
        .toBeCloseTo(fill, 6);
    }
    // ② 器が 1 に届いた tick に唱え始める（＝告知と時計が同じ数で動く）
    const cast = s.find(x => x.phase === 'warn');
    expect(cast, `60 tick で詔が一度も来ない＝器の時計が止まっている`).toBeTruthy();
    expect(cast.heat, '唱え始めた tick の器が 1 でない＝満ちる前／後に唱えている').toBe(1);
    // ③ 唱えは warnMs ぶん続く（完走した連で測る）
    const runs = lockstepRuns(s);
    const warns = runs.filter(x => x.phase === 'warn' && x.to < s.length);
    expect(warns.length, '唱えが1度も完走していない＝周期が回っていない').toBeGreaterThanOrEqual(1);
    for (const w of warns) {
      expect(w.ticks, `唱えが ${c.warnMs}ms でない（t${w.from}〜t${w.to}）`).toBe(nDlTicks(c.warnMs));
    }
    // ④ 錨＝唱えているあいだ1歩も動かず、攻撃の時計も1つも進まない
    for (const w of warns) {
      const inRun = s.filter(x => x.t >= w.from && x.t <= w.to);
      for (const x of inRun) {
        expect(x.y, `t${x.t}（唱え中）に X が動いた＝錨が効いていない`).toBe(inRun[0].y);
        expect(x.x, `t${x.t}（唱え中）に X が動いた＝錨が効いていない`).toBe(inRun[0].x);
      }
      for (let i = 1; i < inRun.length; i++) {
        expect(inRun[i].attackTimes, `t${inRun[i].t}（唱え中）に攻撃が出た＝剣の窓が窓でない`)
          .toBe(inRun[0].attackTimes);
      }
    }
    // ⑤ 絵＝唱えているあいだだけクラスが付き、長さは JS が渡す（絵に閾値を持たせない）
    for (const x of s) {
      expect(x.castCls, `t${x.t}（相 ${x.phase}）の唱えの絵がずれている`).toBe(x.phase === 'warn');
      expect(x.rootCls, `t${x.t}（相 ${x.phase}）の硬直の絵がずれている`).toBe(x.phase === 'root');
    }
    expect(s.find(x => x.phase === 'warn').spanVar, '唱えの絵に渡す長さが warnMs でない')
      .toBe(`${c.warnMs}ms`);
    // ⑥ 器はオーラの色へ**そのまま**渡る（閾値を絵に持たせない＝新しい絵を作らない）
    for (const x of s.filter(y => !y.phase)) {
      expect(parseFloat(x.heatVar), `t${x.t} のオーラに渡した器 ${x.heatVar} が実際の器と違う`)
        .toBeCloseTo(x.heat, 2);
    }
    // ⑦ 音＝唱え始めた tick に decreeCast（＝錨に入った＝剣を入れる窓の合図）
    expect(cast.newTones, '唱え始めた tick に decreeCast が鳴っていない')
      .toEqual(expect.arrayContaining(DECREE_CAST_HZ));
  });

test('X-④ 詔は盾を無視する＝盾を向けて構えていても剣は封じられて通る（剣・石は黙らせて測る）',
  async ({ page }) => {
    const m = ENEMY_META[DL];
    const c = m.lockstep;
    // 2026-09-03: 移動が魔将と同じ張り付きに替わった＝X 自身が寄って来る∴この本の主題
    // （距離のゲートが無いこと＝**部屋の隅に立ち止まっても詔は届く**）を測るには X を
    // 立ち止まらせる必要がある（寄って来ること自体は別に X-② で確かめてある）。
    // `speed: 0` は歩調の器・詔の周期には効かない（`tickLockstep` は `resolveEnemySpeed` を
    // 読まない＝`bossTickHitAndAway` の歩幅の溜めだけを黙らせる）。剣・石は cooldown を
    // 巨大化して黙らせ、**詔だけの被弾**を測る。
    const NEUTER = { attacks: m.attacks.map(a => ({ ...a, cooldown: 999999 })), speed: 0 };
    const r = await trackDarkLord(page, {
      ticks: 80, spawn: DL_FAR, debugOff: true, face: true, patch: NEUTER,
    });
    const s = r.samples;
    const last = s[s.length - 1];
    expect(s[0].shieldTier, '盾を持っていない＝「盾で防げない」を測れていない').toBeGreaterThanOrEqual(0);

    // ① 一歩も動いていない（＝プレイヤーも `speed:0` の X も＝本当に届かない距離のまま）
    for (const x of s) {
      expect(`${x.py},${x.px}`, `t${x.t} でプレイヤーが動いた＝測定が崩れている`)
        .toBe(`${DL_FAR.row},${DL_FAR.col}`);
      expect(Math.hypot(x.py - x.y, x.px - x.x), `t${x.t} で X が石の射程 6 の内側まで寄った`)
        .toBeGreaterThan(m.attacks.find(a => a.type === 'stone').range);
    }
    // ② 盾を向けて立ち続けても詔は当たる（＝この機構の存在理由）
    expect(last.hits, '盾を向けて立ち続けて詔が一度も当たらない＝盾で待つ抜け道が残る')
      .toBeGreaterThanOrEqual(1);
    expect(last.whiffs, '立ち止まっているのに詔が外れた＝円の中心の取り方が壊れている').toBe(0);
    // ③ 打点＝(decreeAtk − def) ちょうど × 当たった回数（剣・石は黙らせてある＝詔だけの被弾）
    const dmg = Math.max(1, c.decreeAtk - s[0].pdef);
    expect(s[0].php - last.php, `失った HP が詔の回数 ${last.hits} × ${dmg} と違う`
      + '＝黙らせたはずの剣／石が通っている').toBe(last.hits * dmg);
    // ④ 当たった tick には**足元が本当に円の中**だった（描かれていないセルでは当たらない）
    for (let i = 1; i < s.length; i++) {
      if (s[i].hits === s[i - 1].hits) continue;
      expect(s[i - 1].cells, `t${s[i].t} で足元 ${s[i - 1].ptile} が円の外なのに詔が当たった＝告知の嘘`)
        .toContain(s[i - 1].ptile);
      // 剣が封じられる（`sealMs`）＝当たった罰が「痛い」だけで終わらない
      expect(s[i].sealed, `t${s[i].t} に詔が当たったのに剣が封じられていない`).toBe(true);
      expect(s[i].sealUntil - s[i].now, `剣封じの窓が sealMs（${c.sealMs}ms）でない`).toBe(c.sealMs);
      // 音＝当たった tick に decreeHit
      expect(s[i].newTones, `t${s[i].t}（詔が当たった tick）に decreeHit が鳴っていない`)
        .toEqual(expect.arrayContaining(DECREE_HIT_HZ));
    }
    // ⑤ 当てた側に硬直は付かない（プレイヤーは無敵 1500ms ∴窓を二重にしない）
    for (let i = 1; i < s.length; i++) {
      if (s[i].hits === s[i - 1].hits) continue;
      expect(s[i].phase, `t${s[i].t} で詔を当てた直後に硬直が付いた＝無敵と窓が二重になる`).toBe(null);
    }
    // ⑥ 器は落ちた tick に 0 へ戻り、また満ち始める（＝立ち続ければ何度でも来る）
    expect(last.casts, '80 tick で詔が2回来ない＝落ちた後に器が回っていない').toBeGreaterThanOrEqual(2);
  });

test('X-⑤ 予告のあいだに円の外へ歩けば外れ、外した硬直のあいだ魔王は完全に止まる',
  async ({ page }) => {
    const c = ENEMY_META[DL].lockstep;
    // 唱え始めたら北へ 3 タイル（6歩）歩く＝端距離 1.6 の円の外（実測の最悪 3.0 セル）
    // ⚠️ `debugOff` は**付けない**（既定の debugMode:true のまま）＝2026-09-03 以降は X が
    //    寄って来る（`hitAndAway`）∴デバッグを切ると「敵と重なる位置には移動できない」
    //    （`game/passable.js isPassable`＝Phase 5.5k k-7.5）が効き、逃げる先の北の列に
    //    たまたま X の body が居合わせると 6 歩の北上げが物理的に塞がれて**外れなくなる**
    //    （実測＝25 回中 1〜2 回の頻度で再現）。この本の主題（外した詔の相）は被弾の
    //    実数値を測らない∴デバッグは切らず、X との重なりをすり抜けさせて測る。
    const r = await trackDarkLord(page, {
      ticks: 80, spawn: DL_NEAR,
      moveWhen: { atPhase: 'warn', dir: 'up', steps: 6 },
    });
    const s = r.samples;
    const last = s[s.length - 1];
    expect(s.length, '測定が途中で切れた＝ステージを出ている／死んでいる').toBe(80);

    // ① 外れた（＝歩いて避けられる）
    expect(last.whiffs, '予告のあいだに円の外まで歩いても詔が当たった＝避けられない打点')
      .toBeGreaterThanOrEqual(1);
    // ② 外した tick に音（decreeMiss）＋硬直へ入る
    const miss = s.find((x, i) => i > 0 && x.whiffs > s[i - 1].whiffs);
    expect(miss.newTones, '外した tick に decreeMiss が鳴っていない')
      .toEqual(expect.arrayContaining(DECREE_MISS_HZ));
    expect(miss.phase, '外したのに硬直へ入らない＝避けた側の窓が無い').toBe('root');
    expect(miss.span, `硬直が rootMs（${c.rootMs}ms）でない`).toBe(c.rootMs);
    // ③ 硬直は rootMs ぶん続き、そのあいだ1歩も動かず攻撃も出ない（＝2つめの反撃の窓）
    const runs = lockstepRuns(s);
    const roots = runs.filter(x => x.phase === 'root' && x.to < s.length);
    expect(roots.length, '硬直が1度も完走していない').toBeGreaterThanOrEqual(1);
    for (const rt of roots) {
      expect(rt.ticks, `硬直が ${c.rootMs}ms でない（t${rt.from}〜t${rt.to}）`).toBe(nDlTicks(c.rootMs));
      const inRun = s.filter(x => x.t >= rt.from && x.t <= rt.to);
      for (const x of inRun) {
        expect(`${x.y},${x.x}`, `t${x.t}（硬直中）に X が動いた`).toBe(`${inRun[0].y},${inRun[0].x}`);
      }
      for (let i = 1; i < inRun.length; i++) {
        expect(inRun[i].attackTimes, `t${inRun[i].t}（硬直中）に攻撃が出た＝硬直が窓でない`)
          .toBe(inRun[0].attackTimes);
      }
    }
    // ④ 円は**唱え始めた瞬間のタイル**に据え置き＝走っている先に付いて来ない
    //    ⚠️ 80 tick には詔が何度も来る∴**1つの詔のあいだ**（`casts` が同じ tick）で測る
    //       （中心で束ねると、たまたま同じタイルへ2度唱えた詔が混ざる）
    const firstCast = s.find(x => x.phase === 'warn').casts;
    const warnTicks = s.filter(x => x.phase === 'warn' && x.casts === firstCast);
    const centers = new Set(warnTicks.map(x => x.center));
    const cellSets = new Set(warnTicks.map(x => x.cells.join('|')));
    expect(centers.size, '唱えているあいだに円の中心が動いた＝追尾する円（歩いて避ける答えが消える）')
      .toBe(1);
    expect(cellSets.size, '唱えているあいだに円の集合が変わった＝床の告知が嘘になる').toBe(1);
    // ⑤ 外した後、プレイヤーの足元は本当に円の外だった
    expect(miss.cells, '外した tick に円の集合が残っている＝解決で消していない').toEqual([]);
    const before = s.find(x => x.t === miss.t - 1);
    expect(before.cells, `外した直前の足元 ${before.ptile} が円の中にある＝外れる理屈が合わない`)
      .not.toContain(before.ptile);
  });

test('X-⑥ 床に描いた円＝当たり判定の集合そのもの（進みは 0→1・落ちた瞬間に消えて絵が出る）',
  async ({ page }) => {
    const c = ENEMY_META[DL].lockstep;
    const r = await trackDarkLord(page, { ticks: 60, spawn: DL_NEAR });
    const s = r.samples;

    // ① 唱えているあいだ、床の div の集合は判定の集合と**同一**（順序を除いて一致）
    const warnTicks = s.filter(x => x.phase === 'warn');
    expect(warnTicks.length, '唱えている tick が無い＝測れていない').toBeGreaterThanOrEqual(1);
    for (const x of warnTicks) {
      expect([...x.zoneEls.map(e => e.key)].sort(), `t${x.t} の床の円が判定の集合と違う`)
        .toEqual([...x.cells].sort());
      // 進みは 0〜1（1 になる tick は落ちる tick＝そこでは消えている）
      for (const e of x.zoneEls) {
        expect(e.progress, `t${x.t} のセル ${e.key} の進み ${e.progress} が 0〜1 の外`)
          .toBeGreaterThanOrEqual(0);
        expect(e.progress).toBeLessThan(1);
      }
    }
    // ② 進みは単調に増える（＝残り時間そのもの＝速さを絵に持たせていない）
    for (let i = 1; i < warnTicks.length; i++) {
      if (warnTicks[i].casts !== warnTicks[i - 1].casts) continue;   // 別の詔（唱えた回数で分ける）
      const a = warnTicks[i - 1].zoneEls[0], b = warnTicks[i].zoneEls[0];
      if (!a || !b) continue;
      expect(b.progress, `t${warnTicks[i].t} の進みが前の tick より小さい＝時計が戻っている`)
        .toBeGreaterThan(a.progress);
    }
    // ③ 円の枚数は「通れるセルだけ」＝壁の中には描かない（＝嘘の告知を出さない）
    for (const x of warnTicks) {
      expect(x.cells.length, `t${x.t} の円が0枚＝告知の無い打点`).toBeGreaterThan(0);
      expect(x.cells.length, `t${x.t} の円 ${x.cells.length} 枚が半径 ${c.radius} の最大より多い`)
        .toBeLessThanOrEqual(21);
    }
    // ④ 落ちた tick＝床の円が消え、落ちた絵（`.enemy-decree-fall`）が出る
    const resolved = s.find((x, i) => i > 0 && (x.hits + x.whiffs) > (s[i - 1].hits + s[i - 1].whiffs));
    expect(resolved, '60 tick で詔が一度も解決していない').toBeTruthy();
    expect(resolved.zoneEls, '落ちた tick に床の円が残っている＝消し忘れ（次の詔と混ざる）')
      .toEqual([]);
    const prev = s.find(x => x.t === resolved.t - 1);
    expect(resolved.fallFx - prev.fallFx, '落ちた tick に絵が1枚も出ていない＝盾を無視する打点が無告知')
      .toBe(prev.cells.length);
  });

test('X-⑦ 相の差し替え＝HP 半分で速さ（魔将と同じ×1.5）と詔の器が速くなる／予告は縮まず、唱えている詔は畳まれない',
  async ({ page }) => {
    const m = ENEMY_META[DL];
    const c = m.lockstep, p2 = m.phases.find(ph => ph.lockstep !== undefined).lockstep;
    // **唱えている最中**に相を跨がせる（＝走っている詔が畳まれないことを測る）
    const r = await trackDarkLord(page, {
      ticks: 90, spawn: DL_NEAR, dropWhen: { atPhase: 'warn', dmg: Math.ceil(m.hp * 0.6) },
    });
    const s = r.samples;
    const after = s.filter(x => x.hp <= m.hp * 0.5);
    expect(after.length, '後半に入っていない＝落としたダメージが足りない').toBeGreaterThan(0);

    // ① 設定が差し替わった（`_lockstep`＝エンティティ側の1つの入口）
    expect(after[0].cfg, '後半の設定が差し替わっていない（boss.js の applyBossPhase に口が無い）')
      .toMatchObject(p2);
    // ② 走っていた詔は畳まれない＝相を跨いだ tick も同じ集合・同じ落ちる時刻のまま
    const swapAt = after[0];
    if (swapAt.phase === 'warn') {
      // ⚠️ 同じ詔だけを見る＝`casts`（唱えた回数）で束ねる（中心だと別の詔が混ざる）
      const sameCast = s.filter(x => x.phase === 'warn' && x.casts === swapAt.casts);
      const ats = new Set(sameCast.map(x => x.at));
      const sets = new Set(sameCast.map(x => x.cells.join('|')));
      expect(ats.size, '相が変わった瞬間に落ちる時刻が書き換わった＝床の絵と落ちる拍がずれる').toBe(1);
      expect(sets.size, '相が変わった瞬間に円の集合が書き換わった＝告知が嘘になる').toBe(1);
      expect(sameCast.length, `相を跨いだ詔が ${c.warnMs}ms 続いていない＝畳まれた`)
        .toBe(nDlTicks(c.warnMs));
    }
    // ③ 差し替え後の器は**後半の速さ**で満ちる
    const fill2 = p2.fillPerSec * (TICK_MS / 1000);
    const pairs = [];
    for (let i = 1; i < after.length; i++) {
      if (after[i].phase || after[i - 1].phase) continue;
      if (after[i].heat >= 1 || after[i].heat === 0) continue;
      pairs.push(after[i].heat - after[i - 1].heat);
    }
    expect(pairs.length, '後半に器が満ちる tick が無い＝差し替えを測れていない').toBeGreaterThan(0);
    for (const d of pairs) expect(d, '後半の器の満ちが phases[].lockstep と違う').toBeCloseTo(fill2, 6);
    // ④ 後半に唱えた詔の予告は前半と同じ長さ（§7-16 の据え置き）
    const runs2 = lockstepRuns(after);
    const warn2 = runs2.filter(x => x.phase === 'warn' && x.to < after[after.length - 1].t);
    expect(warn2.length, '後半に唱えが完走していない').toBeGreaterThanOrEqual(1);
    for (const w of warn2) {
      expect(after.find(x => x.t === w.from).span, `後半の唱えが ${c.warnMs}ms でない＝予告が縮んだ`)
        .toBe(c.warnMs);
    }
  });

test('X-⑧ 詔（lockstep）の使い手は X だけ・X は他の10体の移動機構を持たない', () => {
  const xm = mechanismsOf(ENEMY_META[DL]);
  const others = ['W', 'A', 'N', 'J', 'O', 'U', 'G', 'I', SL, LV].map(k => mechanismsOf(ENEMY_META[k]));
  expect(xm.has('lockstep'), 'X が固有機構（詔＝lockstep）を持っていない').toBe(true);
  expect(others.some(x => x.has('lockstep')),
    '他のボスが詔を持っている＝X の固有機構ではない').toBe(false);
  const users = Object.entries(ENEMY_META).filter(([, m]) => m.lockstep).map(([k]) => k);
  expect(users, '詔を持つ敵が X 以外にも居る（設計が重複した）').toEqual([DL]);
  // 借り物でない番人＝特に `blink`（η 術士の素の機構）が生えた瞬間に「歩調」が意味を失う
  for (const k of ['combat', 'laneStalk', 'burrowAmbush', 'hide', 'dash', 'coil', 'gaze',
    'soar', 'momentum', 'leap', 'tongue', 'zigzag', 'surge', 'glaciate', 'blink', 'blockFacing']) {
    expect(ENEMY_META[DL][k], `${k} を持っている＝他の10体の型を借りている`).toBeUndefined();
  }
  for (const p of ENEMY_META[DL].phases ?? []) {
    for (const k of ['dash', 'coil', 'hide', 'gaze', 'soar', 'momentum', 'tongue', 'surge',
      'glaciate', 'hitAndAway', 'combat']) {
      expect(p[k], `後半に ${k} が生えている＝他のボスの後半と同じ型`).toBeUndefined();
    }
  }
});

test('X-⑨ 検証ステージの幾何（GUIDE §4-3）＝詔の円が床を覆わない／X が1体だけ', () => {
  const MAP = JSON.parse(readFileSync(
    fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url)), 'utf8'));
  const c = ENEMY_META[DL].lockstep;
  const sd = MAP.layers[TEST_LAYER].stages[stageKey('bal_dark_lord')];
  expect(sd, `闘技場（${TEST_LAYER} ${stageKey('bal_dark_lord')}）が無い`).toBeTruthy();
  const rows = sd.tiles.map(r => (Array.isArray(r) ? r.join('') : r));
  expect(rows.length, '闘技場の行数が 10 でない').toBe(10);
  expect(sd.cols, '闘技場の列数が 12 でない').toBe(12);
  // ① 水が無い（歩調は地形を見ない＝水があると測定が地形のせいになる）
  expect(Object.keys(sd.bgTiles ?? {}).length, '闘技場に bgTiles がある＝地形が測定に混ざる').toBe(0);
  // ② X が1体だけ、実測どおりの位置に居る
  const found = [];
  rows.forEach((row, r) => [...row].forEach((ch, cc) => { if (ch === DL) found.push([r, cc]); }));
  expect(found.length, '闘技場に X が1体ではない').toBe(1);
  expect(found[0], 'X の位置が出荷データと違う＝測定の立ち位置（距離）の前提が崩れる')
    .toEqual([DL_ROW, DL_COL]);
  // ③ 床（立てるセル）＝円の 3 倍以上ある＝「円の外へ歩く」答えが選べる
  const floors = rows.reduce((n, row) => n + [...row].filter(ch => ch === '.').length, 0) + 1;
  const span = Math.ceil(c.radius + 0.5);
  let area = 0;
  for (let dr = -span; dr <= span; dr++) {
    for (let dc = -span; dc <= span; dc++) {
      const gy = Math.max(0, Math.abs(dr) - 0.5), gx = Math.max(0, Math.abs(dc) - 0.5);
      if (Math.hypot(gx, gy) <= c.radius) area++;
    }
  }
  expect(floors, `闘技場の床 ${floors} 枚が円 ${area} 枚の 3 倍に届かない＝逃げ場が無い`)
    .toBeGreaterThanOrEqual(area * 3);
  // ④ 測定に使う立ち位置が床である（(1,1) の隅・(4,6) の剣の外）
  for (const p of [DL_FAR, DL_NEAR]) {
    expect(rows[p.row][p.col], `測定の立ち位置 (${p.row},${p.col}) が床でない`).toBe('.');
  }
  // ⑤ 予告のあいだに逃げ切れる床が (4,6) の北にある＝X-⑤ の前提（3 タイル）
  for (let i = 1; i <= 3; i++) {
    expect(rows[DL_NEAR.row - i][DL_NEAR.col], `(${DL_NEAR.row - i},${DL_NEAR.col}) が床でない`
      + '＝X-⑤ の「北へ3タイル歩く」が成り立たない').toBe('.');
  }
});

// 2026-09-03（ユーザーの実プレイ判定）＝剣と石は cooldown が完全に独立＝距離のゲート
// （`minRange`）が無いと密着している最中でも石が普通に飛んできて「盾で受けた直後に
// 斬りたいのに、斬っている間に石が刺さる」＝見てから動けない一撃になる。
test('X-⑩ 石はプレイヤーの剣の間合い（密着）では出さない＝斬り合いの最中に石が刺さらない',
  async ({ page }) => {
    const m = ENEMY_META[DL];
    const stoneIdx = m.attacks.findIndex(a => a.type === 'stone');
    const swordIdx = m.attacks.findIndex(a => a.type === 'sword');
    const stone = m.attacks[stoneIdx];
    expect(stoneIdx, '石の index が読めない＝この本の前提が崩れている').toBeGreaterThanOrEqual(0);
    // ⚠️ approach/retreat の自然な往復に任せると「密着している瞬間に石のクールダウンが
    //    ちょうど明けている」が滅多に起きず、歯の無い（潰しても緑の）本になる（実測で確認
    //    ＝`minRange` を外すミュータントでも 200 tick 陣取りでは1度も緑にならなかった）。
    //    ∴機械的に固定する＝`speed: 0` で密着（1.0）に居させ続け、石の cooldown を極端に
    //    縮めて「ゲートが無ければ毎 tick でも撃てる」状態を作る。剣（近接）は cooldown その
    //    ままで密着から普通に出る＝「X は攻撃を試み続けている」ことも同時に確かめる。
    const NEUTER = { attacks: m.attacks.map(a => a.type === 'stone' ? { ...a, cooldown: 10 } : a), speed: 0 };
    const r = await trackDarkLord(page, { ticks: 60, spawn: { row: 4, col: 7 }, patch: NEUTER });
    const s = r.samples;
    expect(r.error).toBeUndefined();

    let stoneFired = 0, swordFired = 0;
    const violations = [];
    for (let i = 1; i < s.length; i++) {
      const prev = JSON.parse(s[i - 1].attackTimes ?? '{}');
      const cur  = JSON.parse(s[i].attackTimes ?? '{}');
      if (cur[swordIdx] !== prev[swordIdx]) swordFired++;
      if (cur[stoneIdx] === prev[stoneIdx]) continue;
      stoneFired++;
      // `enemyAttack` は移動を終えた後のこの tick の位置で間合いを見る＝この tick の
      // サンプル（post-step）がその判定に使われた位置と同じ（GUIDE §7-4）。X は 1×1 ＝
      // 端距離は中心距離と一致する（`enemyEdgeDist`）。
      const reach = Math.hypot(s[i].py - s[i].y, s[i].px - s[i].x);
      if (reach < stone.minRange) violations.push({ t: s[i].t, reach: reach.toFixed(2) });
    }
    expect(swordFired, '密着なのに剣が1回も出ていない＝X が攻撃を試みていない（測定の前提が崩れている）')
      .toBeGreaterThan(0);
    expect(stoneFired, `60 tick・cooldown 10ms でも石が一度も飛んでいない＝${stoneIdx} 番の`
      + 'index が違うか、この本自体が空振りしている').toBe(0);
    expect(violations, `密着（minRange ${stone.minRange} 未満）で石が飛んだ tick: `
      + `${JSON.stringify(violations)}`).toEqual([]);
  });

// 2026-09-03（ユーザーの実プレイ報告・スクリーンショットつき）＝X が部屋の角に留まり続け、
// プレイヤーが距離を詰め直すだけで「密着→防御→攻撃→魔法を避けて詰め直す」を繰り返せてしまう。
// 原因は `bossTickHitAndAway` の retreat（後退）が「プレイヤーの逆方向」の2択（軸優先＋直交）
// しか見ておらず、角ではどちらも壁で固まっていた＝**X だけでなく `hitAndAway` を使う
// 全ボス（魔将 V・魔物 W の後半）に共通の穴**＝この本は X を借りて測る（`DL` の闘技場の
// (1,1) は北＝壁・西＝壁の実在の角）。
test('X-⑪ 角に追い詰められても退避（retreat）で固まらない＝通れる方向へ逃げて局面を動かす',
  async ({ page }) => {
    // X を角（1,1）へ直接置き、retreat 中に固定する（`_haTimer` を遠い未来にして
    // 時間切れでの相の切り替えを止める）。プレイヤーを (2,2) に置く＝「プレイヤーの逆」は
    // 北・西のどちらも壁＝旧実装ならここで1歩も動けない。
    const r = await trackDarkLord(page, {
      ticks: 5, spawn: { row: 2, col: 2 },
      entityPatch: { x: 1, y: 1, _haPhase: 'retreat', _haTimer: 1e9 },
    });
    const s = r.samples;
    expect(r.error).toBeUndefined();
    expect(`${s[0].y},${s[0].x}`, '角（1,1）から1歩も動けていない＝退避が壁で固まったまま')
      .not.toBe('1,1');
  });

// ── 12体目 `Z` ザーネル（ラスボス）：幻影（mirage）＝**「どれが本物か」** ────────────
// 2026-09-04（0d-3 の最後）。他の11体はすべて「敵が**どこに**居るか／**どこへ**行くか」を
// 読む機構だった∴Z だけは**敵の同定**を課題にする＝Z は自分と見分けのつかない像を並べる。
//   ・像は `count` 体（相2＝2・相3＝4）湧き、**そのとき本体も一緒に散る**（放射状）
//     ∴「今どれが本物か」が波ごとにリセットされる（`blink` の流用ではない）。
//   ・像は**打点を持たない**（剣を振り上げず石も撃たない）＝**予告を出すのは本物だけ**。
//   ・像は**すり抜けられる**（`getEnemies()` に居ない＝プレイヤーの通行判定が見ない）。
//   ・像は**剣の一撃で消える**（HP を持たない置き物）。
//   ・`mirageMs` 放っておくと像は本体へ**収束**し、`convergeWarnMs` の予告のあと
//     **盾を無視する**打点が本体の周囲（端距離 `convergeRadius`）へ落ちる。打点は
//     `convergeAtkPerMirage × 生き残った像の数`∴**斬って消した像は打点を削る**。
// ⚠️ データは **base に持たせず `phases[].mirage` だけ**（相1では像が湧かない）
//    ∴機構の使い手を数える導出は `phases[]` の中まで見る（`mechanismsDeepOf`）。
// ⚠️ Z の攻撃2本（剣 1.5・石 7.0）は**どちらも盾で消える**＝I／`{`／L／X と同じ穴
//    ∴収束が「盾を無視する唯一の打点」＝この機構の存在理由（§7-16）。対価は
//    予告 `convergeWarnMs 720` を**相3 でも縮めない**・床に描いた危険域が当たり判定と同じ集合・
//    像を斬れば打点が減る（＝逃げる以外の答えがある）の3つ。
// ⚠️ 本番＝`dark_tower 0,0`（玉座の間・床 78・完全な空箱）／闘技場＝`test_mechanics 33,1`
//    （`bal_zarnel`・床 82）＝ほぼ同型∴`{`／L が踏んだ「闘技場で測って本番で壊れる」幾何差は
//    無いが、幾何の本（Z-⑪）は**両方**を測る。
const Z = TILE.ZARNEL;
const Z_ROW = 4, Z_COL = 8;                 // 闘技場 `bal_zarnel` の実配置（1×1）
const Z_FAR   = { row: 1, col: 1 };         // 北西の隅＝Z から 7.62（石 7.0 の外）
const Z_HUNT  = { row: 6, col: 3 };         // 像を追って斬る本の立ち位置（駐める場所と離す）
// 本体を駐める場所＝**部屋の中央 (4,5)**（＝像を追う運を測定から外す）。隅ではなく中央にする
// 理由＝`decreeCells` は壁のセルを落とす∴隅に駐めると危険域が壁で削れて枚数が測れない。
// (4,5) は闘技場・本番のどちらでも上下左右 2 セルすべてが床＝円が1枚も欠けない。
const Z_PARK  = { row: 4, col: 5 };
// 像を追って斬る本（`huntMirages`）で本体を退かす先の候補＝闘技場の床の四隅と中央の上下。
// 像の湧き先は放射状＋乱れ∴**そのとき像から一番遠い候補**を選ぶ（固定の1点は像の隣になりうる）。
const Z_PARK_CANDS = [
  { row: 1, col: 1 }, { row: 1, col: 10 }, { row: 6, col: 10 }, { row: 6, col: 5 },
  { row: 1, col: 5 }, { row: 6, col: 2 },
];
const Z_OBS   = { ps_hearts: '13', ps_sword: '0', ps_shield: '0', ps_armor: '0', ps_weapon: '1' };
// HP 120 に対して落とす量＝相の境（0.66 / 0.33）をどこまで踏むかで2種類だけ使う。
const Z_P2_DMG = 45;                        // → 75（62.5%）＝相2 だけ（33% は跨がない）
const Z_P3_DMG = 85;                        // → 35（29%）＝相2・相3 を続けて踏む
// SE の指紋（`installToneRec` は周波数だけを記録する）＝4音すべて**離調した対**を持つ
const MG_SPLIT_HZ    = [523, 531, 494, 508];        // 像が湧いた（本体も散った）
const MG_CONVERGE_HZ = [392, 698, 440, 622, 523, 538]; // 収束の予告（上がる線と下がる線）
const MG_CURSE_HZ    = [73, 138, 146, 277];         // 盾を無視する打点が入った
const MG_FADE_HZ     = [659, 672, 440, 444];        // 無害に解けた（斬り切った／外した）
const nZTicks = (ms) => Math.ceil(ms / TICK_MS);
// 端距離 `radius` のタイル集合の枚数（`enemy-ai.js decreeCells` と同じ式＝X-① と同型）
function edgeArea(radius) {
  const span = Math.ceil(radius + 0.5);
  let area = 0;
  for (let dr = -span; dr <= span; dr++) {
    for (let dc = -span; dc <= span; dc++) {
      const gy = Math.max(0, Math.abs(dr) - 0.5), gx = Math.max(0, Math.abs(dc) - 0.5);
      if (Math.hypot(gx, gy) <= radius) area++;
    }
  }
  return area;
}
// タイル (r,c) が中心 (cr,cc) から端距離 radius 以内か（床に描いた集合の検算用）
const inEdgeRadius = (cr, cc, r, c, radius) => Math.hypot(
  Math.max(0, Math.abs(c - cc) - 0.5), Math.max(0, Math.abs(r - cr) - 0.5)) <= radius + 1e-9;

/**
 * `bal_zarnel` の `Z` を n tick 追い、毎 tick の相・像の一覧・床の危険域・絵・音と
 * プレイヤーの位置／HP を返す。
 * @param {object} o
 * @param {number} o.ticks        進める論理 tick 数
 * @param {object} [o.spawn]      プレイヤーの湧き（既定＝北西の隅 (1,1)）
 * @param {number} [o.drop]       t=1 の step より前に Z へ与えるダメージ（相を跨がせる）
 * @param {boolean} [o.debugOff]  true＝'g' で debug を切る（プレイヤーにダメージが通る）
 * @param {object} [o.park]       {row,col}＝**像が湧いた後**に本体をそこへ駐める（speed 0）
 * @param {boolean} [o.stop]      true＝像が湧いた後に本体を speed 0 にする（位置は動かさない）
 * @param {boolean} [o.chaseBody] true＝毎 tick 本体へ1歩寄る（収束の円の中に立つ）
 * @param {boolean} [o.face]      true＝毎 tick 本体の方へ向き直る（盾の正面を向け続ける）
 * @param {object} [o.patch]      `setEnemyMetaForTest('Z', patch)`
 */
async function trackZarnel(page, o) {
  await installToneRec(page);
  const sp = o.spawn ?? Z_FAR;
  await gotoFrozen(page, previewUrl('bal_zarnel', sp.row, sp.col, { ...Z_OBS, ...(o.extra ?? {}) }), o.seed);
  if (o.debugOff) await page.keyboard.press('g');
  return page.evaluate((a) => {
    const g = window.__game;
    if (a.patch) g.setEnemyMetaForTest('Z', a.patch);
    const e0 = g.getEnemies().find(x => x.type === 'Z');
    if (!e0) return { error: 'Z が盤面に居ない' };
    const id = e0.id;
    const find = () => g.getEnemies().find(x => x.id === id);
    const tile = (v) => Math.floor(v + 0.5);
    const zonePrefix = `mirage-${id}-`;
    const samples = [];
    let stopped = false;
    for (let t = 1; t <= a.ticks; t++) {
      const tone0 = window.__tones.length;
      const cur = find();
      if (!cur) break;
      if (a.drop && t === 1) g.dealDamage(id, a.drop);
      // ⚠️ 駐めるのは**像が湧いた後**＝`spawnMirages` が本体を散らした後（先に駐めると
      //    散る先が測定の外から決まる＝湧きの制約そのものを測れなくなる）。
      if ((a.park || a.stop) && !stopped && (cur.mgPhase ?? null) === 'live') {
        g.setEnemyFieldForTest(id, a.park
          ? { x: a.park.col, y: a.park.row, speed: 0, accum: 0 }
          : { speed: 0, accum: 0 });
        stopped = true;
      }
      if (a.chaseBody && stopped) {
        const p1 = g.getPlayer(), b = find();
        const dx = b.x - p1.x, dy = b.y - p1.y;
        // 円の中（本体の隣）まで寄ったら止まる＝そこから先は立ち止まって収束を受ける
        if (Math.hypot(dx, dy) > 1.2) {
          g.movePlayer(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
            : (dy > 0 ? 'down' : 'up'));
        }
      }
      if (a.face) {
        const p1 = g.getPlayer(), b = find();
        const dx = b.x - p1.x, dy = b.y - p1.y;
        g.setHeroDir(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up'));
      }
      g.step(1);
      const e = find();
      if (!e) break;
      const p = g.getPlayer(), st = g.getState();
      const bodyEl = document.getElementById(`char-enemy-${id}`);
      samples.push({
        t, now: st.gameTime, hp: e.hp, x: e.x, y: e.y, dir: e.dir, sprite: e.sprite,
        speed: e.speed ?? null,
        // ⚠️ スナップショット越し＝`_mgPhase` ではなく `mgPhase`（`_` 付きは常に undefined）
        phase: e.mgPhase ?? null, span: e.mgSpan ?? null, at: e.mgAt ?? null,
        nextAt: e.mgNextAt ?? null,
        center: e.mgR != null ? `${e.mgR},${e.mgC}` : null,
        cells: (e.mgCells ?? []).map(c => `${c.r},${c.c}`),
        waves: e.mgWaves ?? 0, converges: e.mgConverges ?? 0,
        hits: e.mgHits ?? 0, whiffs: e.mgWhiffs ?? 0, slain: e.mgSlain ?? 0,
        cfg: e.mirage ?? null,
        // 像は敵ではない＝この数は像が湧いても増えない（`killAll` ゲート・遭遇表の番人）
        enemies: g.getEnemies().length,
        // 像の数の唯一の真実（§7-7）＝絵・打点・テストが同じ配列を読む
        mirages: g.getMirages().map(m => ({ id: m.id, ownerId: m.ownerId, type: m.type,
          x: m.x, y: m.y, sprite: m.sprite, pal: m.pal, speed: m.speed })),
        // 像の DOM（毎 tick 貼り直す＝`renderChars()` が char-layer を作り直しても消えない）
        mirageEls: [...document.querySelectorAll('[data-mirage-owner]')].map(x => ({
          id: x.id, owner: x.dataset.mirageOwner, cls: x.className,
          canvas: !!x.querySelector('canvas'),
          auras: [...x.children].filter(c => String(c.className).startsWith('dark-lord-aura')).length,
          enemyId: x.dataset.enemyId ?? null,
        })),
        bodyCls: !!bodyEl?.classList.contains('mirage-converge'),
        spanVar: (bodyEl?.style.getPropertyValue('--mirage-span-ms') ?? '').trim(),
        // 床の危険域＝1セル＝1枚の div（id に r,c が入る＝判定と同じ集合を DOM で確かめる）
        zoneEls: [...document.querySelectorAll(`div[id^="${zonePrefix}"]`)].map(x => ({
          key: x.id.slice(zonePrefix.length),
          progress: parseFloat(x.style.getPropertyValue('--mirage-progress')),
        })),
        burstFx: document.querySelectorAll('.enemy-mirage-burst').length,
        attackTimes: JSON.stringify(e.attackTimes ?? null),
        projOwners: g.getProjectiles().map(pr => pr.ownerId ?? null),
        px: p.x, py: p.y, php: p.hp, pdef: st.player.def, pdir: st.heroDir,
        ptile: `${tile(p.y)},${tile(p.x)}`, shieldTier: st.player.shieldTier,
        newTones: window.__tones.slice(tone0),
      });
    }
    return { id, samples };
  }, o);
}

/**
 * 像を**歩いて追い、剣で斬る**本のための道具（Z-④／Z-⑧）。
 * 相2 へ落として像を湧かせ、**本体を隅へ駐めて**（speed 0）像の寿命の時計も止め（`_mgAt`）、
 * 一番近い像へ列→行の順に歩いて**その像のセルへ乗り**（＝すり抜けの証拠）、1歩下がって斬る。
 * @param {object} o
 * @param {number|'all'} o.kill 斬る像の数（'all'＝全部）
 */
async function huntMirages(page, o) {
  await installToneRec(page);
  await gotoFrozen(page, previewUrl('bal_zarnel', Z_HUNT.row, Z_HUNT.col, Z_OBS));
  return page.evaluate((a) => {
    const g = window.__game;
    if (a.patch) g.setEnemyMetaForTest('Z', a.patch);
    const e0 = g.getEnemies().find(x => x.type === 'Z');
    if (!e0) return { error: 'Z が盤面に居ない' };
    const id = e0.id;
    const find = () => g.getEnemies().find(x => x.id === id);
    g.dealDamage(id, a.dmg);                       // 相2 へ（像が湧く）
    for (let t = 0; t < 60 && g.getMirages().length === 0; t++) g.step(1);
    const count0 = g.getMirages().length;
    if (count0 === 0) return { error: '相2 に落としても 60 tick で像が1体も湧かない' };
    // 本体を**像から一番遠い床**へ駐め、**像の寿命を止める**（`_mgAt` を遠い未来）＝歩いて
    // 追うあいだに収束が始まらない（この本が測るのは「すり抜け」と「剣で消える」だけ）。
    // ⚠️ 駐める先を固定値にしてはいけない＝像の湧き先は放射状＋乱れ∴固定の1点は像の隣に
    //    なりうる（本体の体は塞ぐ＝歩く道が測定の外の理由で詰まる／剣が本体に吸われる）。
    const park = a.parkCands
      .map(p => ({ ...p, d: Math.min(...g.getMirages().map(m => Math.hypot(m.x - p.col, m.y - p.row))) }))
      .sort((A, B) => B.d - A.d)[0];
    if (park.d < 2) return { error: `どの候補も像から 2 セル以内（最遠 ${park.d.toFixed(2)}）`, count0 };
    g.setEnemyFieldForTest(id, { x: park.col, y: park.row, speed: 0, accum: 0, _mgAt: 1e9 });
    g.step(1);
    const onCells = [];
    const kills = [];
    let warnPhase = null;                          // `forceWarn` で立てた相（'warn' を期待）
    const want = a.kill === 'all' ? count0 : a.kill;
    const pos = () => g.getPlayer();
    // すり抜けの証拠＝**プレイヤーが歩いて像に重なった**（AABB＝|dx|<1 かつ |dy|<1）。
    // ⚠️ 「同じセルにぴったり乗る」で測ってはいけない＝像は毎 tick 0.16 セルずつ歩く
    //    ∴座標が一致することはほぼ無い。通行判定が見るのは重なり（AABB）そのもの
    //    ∴敵として実装されていればこの1歩が**そもそも拒否される**＝重なりが証拠になる。
    const note = (target, moved) => {
      const p = pos();
      const m = g.getMirages().find(o => o.id === target.id);
      if (!moved || !m) return;
      if (Math.abs(p.x - m.x) < 1 && Math.abs(p.y - m.y) < 1) {
        onCells.push({ id: m.id, at: `${p.y.toFixed(2)},${p.x.toFixed(2)}`,
          mirage: `${m.y.toFixed(2)},${m.x.toFixed(2)}` });
      }
    };
    // ⚠️ `getPlayer()` は**実体そのもの**を返す（コピーではない）∴前後を比べるときは
    //    数値を先に取り出す（同じオブジェクトを2回読むと差は常に 0＝「歩いていない」に見える）。
    const stepMove = (dir, target) => {
      const x0 = pos().x, y0 = pos().y;
      g.movePlayer(dir);
      g.step(1);
      const moved = Math.abs(pos().x - x0) > 1e-9 || Math.abs(pos().y - y0) > 1e-9;
      note(target, moved);
      return moved;
    };
    // 波が畳まれた**その tick** で次の波までの間隔を測る（1 tick でも遅れて測ると
    // `respawnMs` から tick ぶん足りない数が出る＝時計を測ったことにならない）。
    let fold = null;
    const stepAndWatch = (n) => {
      for (let k = 0; k < n; k++) {
        g.step(1);
        const e1 = find();
        if (fold == null && (e1?.mgPhase ?? null) === null && e1?.mgNextAt != null) {
          fold = { gap: e1.mgNextAt - g.getState().gameTime, at: g.getState().gameTime };
        }
      }
    };
    for (let n = 0; n < want; n++) {
      const px0 = pos().x, py0 = pos().y;
      const target = g.getMirages()
        .sort((A, B) => Math.hypot(A.x - px0, A.y - py0) - Math.hypot(B.x - px0, B.y - py0))[0];
      if (!target) return { error: '斬る像が残っていない', count0, onCells, kills };
      let lastDir = null;
      // 列 → 行の順に寄せる（像も歩いて寄って来る∴残り 0.5 セル未満になったら詰め終わり）。
      // ⚠️ 経路上に本体（駐め先）や別の像が挟まって移動が拒否されることがある（0y で実測）
      //    ∴その軸で動けなかった tick は逆軸へ1歩迂回してから同じ軸を再試行する。
      const cur = () => g.getMirages().find(o => o.id === target.id) ?? target;
      for (let k = 0; k < 30 && Math.abs(pos().x - cur().x) >= a.moveStep; k++) {
        lastDir = pos().x < cur().x ? 'right' : 'left';
        if (!stepMove(lastDir, target)) {
          const altDir = pos().y < cur().y ? 'down' : 'up';
          stepMove(altDir, target);
        }
      }
      for (let k = 0; k < 30 && Math.abs(pos().y - cur().y) >= a.moveStep; k++) {
        lastDir = pos().y < cur().y ? 'down' : 'up';
        if (!stepMove(lastDir, target)) {
          const altDir = pos().x < cur().x ? 'right' : 'left';
          stepMove(altDir, target);
        }
      }
      const back = { up: 'down', down: 'up', left: 'right', right: 'left' }[lastDir] ?? 'down';
      g.movePlayer(back); g.step(1);               // 1歩（0.5 セル）下がる＝剣の間合い
      // 予告のあいだに斬る（＝盾を無視する打点が落ちる**直前**に無害化する）を測るための口。
      // 収束を今から始めさせる＝像はまだ動いていない（進み 0）∴足元の像がそのまま斬れる。
      if (a.forceWarn) {
        g.setEnemyFieldForTest(id, { _mgAt: g.getState().gameTime + 1 });
        g.step(1);
        warnPhase = find()?.mgPhase ?? null;
      }
      g.setHeroDir(lastDir ?? 'down');
      const before = g.getMirages().length;
      const tone0 = window.__tones.length;
      g.swordAttack();
      kills.push({ id: target.id, before, after: g.getMirages().length,
        tones: window.__tones.slice(tone0) });
      stepAndWatch(6);                             // 硬直＋クールダウンを明けさせる
    }
    const e = find();
    const st = g.getState();
    return { id, count0, onCells, kills, fold, warnPhase,
      mirages: g.getMirages().length,
      phase: e?.mgPhase ?? null, nextAt: e?.mgNextAt ?? null, now: st.gameTime,
      hits: e?.mgHits ?? 0, whiffs: e?.mgWhiffs ?? 0, converges: e?.mgConverges ?? 0,
      slain: e?.mgSlain ?? 0, waves: e?.mgWaves ?? 0,
      cfg: e?.mirage ?? null, php: g.getPlayer().hp };
  }, { ...o, dmg: o.dmg ?? Z_P2_DMG, parkCands: o.parkCands ?? Z_PARK_CANDS, moveStep: MOVE_STEP });
}

test('Z-① ラスボスのデータ＝相の中だけに幻影がある／到達距離の入れ子・打点の上限・据え置きの予告', () => {
  const m = ENEMY_META[Z];
  const v = ENEMY_META[TILE.BOSS];       // 魔将＝速さの基準（X と同じ 3例目の根拠）
  const KEYS = ['convergeAtkPerMirage', 'convergeRadius', 'convergeWarnMs', 'count',
    'mirageMs', 'respawnMs', 'spawnKeepMin', 'spawnSpread'];

  // ① データの持ち方＝**base に `mirage` を持たせない**（相1では像が湧かない）
  expect(m.mirage, 'base に mirage がある＝相1（100〜66%）から像が湧く（設計と違う）')
    .toBeUndefined();
  const ph = (m.phases ?? []).filter(p => p.mirage !== undefined);
  expect(ph.length, '幻影を持つ相が2つでない（相2・相3）').toBe(2);
  // 綴りの番人＝`resolveMirage` を読む側が読むキー（1文字違うと既定値に落ちて黙って動く）
  for (const p of ph) expect(Object.keys(p.mirage).sort()).toEqual(KEYS);

  // ② 速さ＝魔将 V・魔王 X と同値（§7-2 の意図的な例外の3例目）＋張り付きの移動
  expect(m.speed, 'ラスボスが魔将より鈍い＝X が 2026-09-03 に落とされたのと同じ形').toBe(v.speed);
  expect(m.hitAndAway, '移動が張り付きでない＝相1 の圧が出ない').toBe(true);

  // ③ 収束の打点は `atk` を超えない（新しい最大打点を作らない・§7-16）
  for (const p of ph) {
    expect(p.mirage.convergeAtkPerMirage * p.mirage.count,
      `収束の打点 ${p.mirage.convergeAtkPerMirage * p.mirage.count} が atk ${m.atk} を超える`)
      .toBeLessThanOrEqual(m.atk);
  }
  // 相3 は**ちょうど `atk` と同値**＝上限に触れている（＝これ以上増やせない設計の証拠）
  expect(ph[1].mirage.convergeAtkPerMirage * ph[1].mirage.count).toBe(m.atk);

  // ④ 予告は相をまたいで**同値**（§7-16 の据え置き＝後半でも縮めない）かつ近接の溜め以上
  expect(ph[1].mirage.convergeWarnMs, '相3 で予告を縮めた＝盾を無視する打点の対価を割っている')
    .toBe(ph[0].mirage.convergeWarnMs);
  expect(ph[0].mirage.convergeWarnMs,
    `予告 ${ph[0].mirage.convergeWarnMs}ms が近接の溜め（${MELEE_WINDUP_MS}ms）より短い`
    + '＝見てから動けない').toBeGreaterThanOrEqual(MELEE_WINDUP_MS);

  // ⑤ 到達距離の表（GUIDE §7-12）＝プレイヤーの剣 1.2 ＜ Z の剣 1.5 ＜ 収束 1.6/2.0 ＜ 石 7.0
  const sword = m.attacks.find(x => x.type === 'sword');
  const stone = m.attacks.find(x => x.type === 'stone');
  expect(sword.range, 'Z の剣がプレイヤーの剣の内側＝張り付いても打ち勝てる')
    .toBeGreaterThan(SWORD_REACH);
  for (const p of ph) {
    expect(p.mirage.convergeRadius, '収束の円が Z の剣の間合いの内側＝「剣の間合いに居るのに'
      + '収束だけ避ける」が成立する＝殴りに来た側が払わない').toBeGreaterThan(sword.range);
    expect(stone.range, '石の射程が収束の円より短い＝到達距離の表が入れ子になっていない')
      .toBeGreaterThan(p.mirage.convergeRadius);
  }
  // 石の距離のゲート＝X が 2026-09-03 の割り込み 0q で受けたのと同じ欠陥をラスボスも持っていた
  expect(stone.minRange, '石に minRange が無い＝斬り合いの最中に予告なしの石が刺さる')
    .toBeGreaterThan(sword.range);
  expect(stone.minRange, '石の minRange がプレイヤーの剣より内側＝密着で石が来る')
    .toBeGreaterThan(SWORD_REACH);
  expect(m.attack.minRange, 'legacy `attack` の石にゲートが無い＝古い経路から抜ける')
    .toBe(stone.minRange);

  // ⑥ 湧きの制約＝プレイヤーの隣に像も本体も湧かない（＝湧いた瞬間に殴られない・斬られない）
  for (const p of ph) {
    expect(p.mirage.spawnKeepMin, '湧きの最小距離が Z の剣の間合い以内＝散った本体が'
      + 'プレイヤーの隣に出て即殴れる／即斬れる').toBeGreaterThan(sword.range);
    expect(p.mirage.spawnKeepMin, '湧きの最小距離がプレイヤーの剣の間合い以内')
      .toBeGreaterThan(SWORD_REACH);
  }

  // ⑦ 相3 は「数が増えて周期が速くなり、円が広がる」（＝予告と1体あたりの打点は動かさない）
  expect(ph[1].mirage.count, '相3 で像が増えない').toBeGreaterThan(ph[0].mirage.count);
  // ⚠️ 円の広さは**タイルへ量子化された枚数**で測る＝端距離の数字だけ見ると嘘になる
  //    （1.6 と 2.0 は同じ 21 枚＝「広がった」が絵にも判定にも出ない死んだ数だった）。
  expect(edgeArea(ph[1].mirage.convergeRadius),
    `相3 の円 ${edgeArea(ph[1].mirage.convergeRadius)} 枚が相2 の円 `
    + `${edgeArea(ph[0].mirage.convergeRadius)} 枚と同じ＝端距離を上げても量子化で消えている`)
    .toBeGreaterThan(edgeArea(ph[0].mirage.convergeRadius));
  expect(ph[1].mirage.mirageMs, '相3 で収束までが長い＝後半のほうが緩い')
    .toBeLessThan(ph[0].mirage.mirageMs);
  expect(ph[1].mirage.respawnMs, '相3 で次の波までが長い＝後半のほうが緩い')
    .toBeLessThan(ph[0].mirage.respawnMs);
  expect(ph[1].mirage.convergeAtkPerMirage, '相3 で1体あたりの打点を上げた＝斬る作業の価値が変わる')
    .toBe(ph[0].mirage.convergeAtkPerMirage);

  // ⑧ 円は部屋を覆わない（§7-15 は半径ではなく**面積**で引き算する・闘技場の床 82 枚）
  for (const p of ph) {
    const area = edgeArea(p.mirage.convergeRadius);
    expect(area, `収束の円 ${area} 枚が闘技場の床 82 枚の 1/3 を越える＝どこへ逃げても同じ`)
      .toBeLessThan(82 / 3);
  }
  // 相の器の側（速さ）も魔将・魔王と同じ形で増える
  expect(m.phases[0].speedMultiplier, '相2 の加速が無い').toBeGreaterThan(1);
  expect(m.phases[1].speedMultiplier, '相3 で相2 より速くならない')
    .toBeGreaterThan(m.phases[0].speedMultiplier);
});

test('Z-② 相1（100〜66%）では像が1体も湧かない／66% を割ると湧き、波は respawnMs ごとに回る',
  async ({ page }) => {
    const m = ENEMY_META[Z];
    const cfg = m.phases[0].mirage;

    // ① 素のデータのまま 120 tick＝相1 では像 0（＝`phases[].mirage` だけに在ることの実測）
    const p1 = await trackZarnel(page, { ticks: 120 });
    expect(p1.error).toBeUndefined();
    for (const x of p1.samples) {
      expect(x.mirages.length, `t${x.t}（相1・HP ${x.hp}）で像が湧いた＝base に機構が漏れている`)
        .toBe(0);
      expect(x.phase, `t${x.t}（相1）で幻影の相が立った`).toBe(null);
      expect(x.cfg, `t${x.t}（相1）に幻影の設定が入っている`).toBe(null);
    }
    expect(p1.samples[p1.samples.length - 1].hp, '相1 の測定で HP が 66% を割った＝前提が崩れた')
      .toBeGreaterThan(m.hp * 0.66);

    // ② 66% を割ると湧く（⛔(i) の番人＝`hitAndAway` の分岐が機構を食っていないこと）
    const r = await trackZarnel(page, { ticks: 120, drop: Z_P2_DMG });
    const s = r.samples;
    expect(r.error).toBeUndefined();
    expect(s[s.length - 1].cfg, '相2 の設定が差し替わっていない（boss.js に mirage の口が無い）')
      .toMatchObject(cfg);
    const first = s.find(x => x.mirages.length > 0);
    expect(first, '相2 へ落として 120 tick 進めても像が1体も湧かない'
      + '（⛔(i)＝機構が hitAndAway の分岐に食われている／相の切り替えが読んでいない）')
      .toBeTruthy();
    expect(first.mirages.length, `湧いた像が ${cfg.count} 体でない`).toBe(cfg.count);
    expect(first.phase, '像が湧いた tick の相が live でない').toBe('live');
    expect(first.span, `像の寿命が mirageMs（${cfg.mirageMs}ms）でない`).toBe(cfg.mirageMs);
    expect(first.newTones, '像が湧いた tick に mirageSplit が鳴っていない')
      .toEqual(expect.arrayContaining(MG_SPLIT_HZ));
    // 湧いた瞬間は**本体も散る**＝プレイヤーから `spawnKeepMin` 以上離れる（湧きの制約）。
    // ⚠️ 本体は散った**同じ tick に1歩歩く**（湧きは行動ゲートを閉じない＝像が居るあいだ本体は
    //    普通に戦う）∴1歩（≤ 0.5 セル）の余裕を見て測る。像はこの tick に歩かない∴厳密。
    expect(Math.hypot(first.x - first.px, first.y - first.py),
      '散った本体がプレイヤーの近く（spawnKeepMin 未満）に出た＝湧いた瞬間に殴り合いが始まる')
      .toBeGreaterThan(cfg.spawnKeepMin - MOVE_STEP);
    for (const mg of first.mirages) {
      expect(Math.hypot(mg.x - first.px, mg.y - first.py),
        `像 ${mg.id} がプレイヤーの隣（spawnKeepMin 未満）に湧いた＝理不尽`)
        .toBeGreaterThanOrEqual(cfg.spawnKeepMin - 1e-9);
    }

    // ③ 波は回る＝収束が解決した tick から respawnMs 後に次の波（時計は1つの数だけ）
    const resolved = s.find((x, i) => i > 0 && x.converges > 0 && x.phase === null
      && s[i - 1].phase === 'warn');
    expect(resolved, '120 tick で収束が一度も解決していない＝波の時計が止まっている').toBeTruthy();
    expect(resolved.nextAt - resolved.now, `次の波までが respawnMs（${cfg.respawnMs}ms）でない`)
      .toBe(cfg.respawnMs);
    expect(s[s.length - 1].waves, '120 tick で波が2つ立たない＝周期が回っていない')
      .toBeGreaterThanOrEqual(2);
    // 像は**敵として数えない**（`killAll` ゲート・遭遇表・数値監査に影響させない）
    for (const x of s) {
      expect(x.enemies, `t${x.t} で敵の数が ${x.enemies} ＝像が敵として数えられている`).toBe(1);
    }
  });

test('Z-③ 像は本体と同じ見た目・同じ速さで**歩いて**寄る／攻撃だけ持たない（予告は本物だけ）',
  async ({ page }) => {
    const m = ENEMY_META[Z];
    // 相2 の live のあいだだけを見る（収束は Z-⑤ 以降で測る）。プレイヤーは隅で動かない。
    // 🔴（キュー11・2026-09-12）像の歩行も `bossTickHitAndAway` 系の unseeded Math.random
    //    を経由する＝X-② と同じ統計的テイルリスクの系列（フル実行でだけ稀に「像が寄って
    //    いない」で落ちた報告と一致）。X-② と同じ `seed:1` で固定＝40 個の候補（1〜40）を
    //    実測し全部で「40 tick 以内に少なくとも1セル寄る」を満たすことを確認済み。
    const r = await trackZarnel(page, { ticks: 40, drop: Z_P2_DMG, seed: 1 });
    const s = r.samples;
    expect(r.error).toBeUndefined();
    const live = s.filter(x => x.phase === 'live' && x.mirages.length > 0);
    expect(live.length, 'live の tick が無い＝測れていない').toBeGreaterThan(10);

    for (const x of live) {
      for (const mg of x.mirages) {
        // ① 速さは本体と**同値**（相の倍率が乗った tick も）＝動きで見分けられない
        expect(mg.speed, `t${x.t} の像 ${mg.id} の速さ ${mg.speed} が本体 ${x.speed} と違う`
          + '＝速さだけで本物が分かる').toBe(x.speed);
        // ② パレット・型も同じ（新規スプライト0・半透明や色差を付けない）
        expect(mg.pal, `t${x.t} の像 ${mg.id} のパレットが本体と違う＝色で見分けられる`).toBe('darklord');
        expect(mg.type, `t${x.t} の像 ${mg.id} の型が Z でない＝歩き方の導出が変わる`).toBe(Z);
        // ③ **攻撃の絵を持たない**＝像は剣を振り上げない（`*Atk` の絵になるのは本物だけ）
        expect(mg.sprite, `t${x.t} の像 ${mg.id} が攻撃の絵（${mg.sprite}）になった`
          + '＝予告を出すのは本物だけ、が壊れている').toMatch(/^darklord[DRU]$/);
      }
      // ④ DOM は毎 tick 貼り直されている＝像の数だけ要素が在る（`renderChars()` に消されない）
      expect(x.mirageEls.length, `t${x.t} の像の要素が ${x.mirageEls.length} 枚＝`
        + `像 ${x.mirages.length} 体と合わない（貼り直しが漏れている）`).toBe(x.mirages.length);
      for (const el of x.mirageEls) {
        expect(el.cls, `t${x.t} の像の要素のクラスが本体と違う`).toBe('char-abs');
        expect(el.canvas, `t${x.t} の像 ${el.id} に絵が無い`).toBe(true);
        expect(el.auras, `t${x.t} の像 ${el.id} のオーラが3枚でない＝本体と見た目が違う`).toBe(3);
        // 像は敵として数えられてはいけない（`dataset.enemyId` を持たない）
        expect(el.enemyId, `t${x.t} の像 ${el.id} が敵の目印を持っている`).toBe(null);
      }
      // ⑤ 石を撃つのは本物だけ（投擲物の持ち主に像の id が出ない）
      const mgIds = new Set(x.mirages.map(mg => mg.id));
      for (const owner of x.projOwners) {
        expect(mgIds.has(owner), `t${x.t} の投擲物の持ち主 ${owner} が像＝像が石を撃っている`)
          .toBe(false);
      }
    }
    // ⑥ 像は**歩いて寄って来る**（止まっている置き物なら一目で見分けられる＝機構が死ぬ）
    const nearest = (x) => Math.min(...x.mirages.map(mg => Math.hypot(mg.x - x.px, mg.y - x.py)));
    const start = nearest(live[0]);
    expect(Math.min(...live.map(nearest)), `像がプレイヤーへ寄っていない（最初 ${start.toFixed(2)}`
      + ' セルから縮まらない）＝「動かないのが像」で一目で分かる').toBeLessThan(start - 1);
    // 歩いた総距離＝像ごとに 0 でない（全部が同じ場所に立ち続けていない）
    for (const mg of live[0].mirages) {
      const last = live[live.length - 1].mirages.find(o => o.id === mg.id);
      if (!last) continue;
      expect(Math.hypot(last.x - mg.x, last.y - mg.y), `像 ${mg.id} が1歩も動いていない`)
        .toBeGreaterThan(0);
    }
  });

test('Z-④ 像はすり抜けられる（敵ではない）／剣の一撃で消え、斬った数だけ打点が減る',
  async ({ page }) => {
    const r = await huntMirages(page, { kill: 1 });
    expect(r.error).toBeUndefined();
    expect(r.count0, '像が湧いていない').toBeGreaterThanOrEqual(2);

    // ① **像のセルへ乗れた**＝プレイヤーの通行判定は像を見ない（⛔(iii)＝`passable.js` に
    //    2つ目の例外を作らずに済んだことの実測＝像を `getEnemies()` に入れていない証拠）
    expect(r.onCells.length, '像のセルへ一度も乗れなかった＝すり抜けられない'
      + '（＝像が通行判定に見えている＝敵として実装されている）').toBeGreaterThanOrEqual(1);
    // ② 剣の一撃で1体だけ消える（HP を持たない置き物＝ダメージ計算も無敵窓も通らない）
    expect(r.kills.length).toBe(1);
    expect(r.kills[0].after, `剣を振っても像が減っていない（${r.kills[0].before} → `
      + `${r.kills[0].after}）＝剣の当たり判定が像を見ていない`).toBe(r.kills[0].before - 1);
    expect(r.kills[0].tones, '像を斬った tick に mirageFade が鳴っていない')
      .toEqual(expect.arrayContaining(MG_FADE_HZ));
    // ③ 斬った数が数えられている＝「像を消す作業が打点を削る」の観測窓
    expect(r.slain, '斬った像の数が数えられていない（mgSlain）').toBe(1);
    expect(r.mirages, '斬った後の像の数が合わない').toBe(r.count0 - 1);
    // ④ 斬っても本物は無傷（＝剣が像に吸われても本体の HP は動かない・その逆も無い）
    expect(r.hits, '像を斬っただけで収束が当たったことになっている').toBe(0);
  });

test('Z-⑤ 収束の予告＝本体は錨（1歩も動かず攻撃も出ない）／像は本体へ吸い寄せられ、本物だけ光る',
  async ({ page }) => {
    const cfg = ENEMY_META[Z].phases[0].mirage;
    // 本体は隅に駐めて（像を追う運を外す）＝寿命はそのまま＝40 tick 後に収束が始まる
    const r = await trackZarnel(page, { ticks: 60, drop: Z_P2_DMG, park: Z_PARK });
    const s = r.samples;
    expect(r.error).toBeUndefined();
    const warn = s.filter(x => x.phase === 'warn');
    expect(warn.length, `60 tick で収束の予告が一度も来ない（mirageMs ${cfg.mirageMs}ms）`)
      .toBeGreaterThanOrEqual(1);

    // ① 予告の長さ＝`convergeWarnMs`（＝絵に渡す長さと同じ1つの数）
    const begin = warn[0];
    expect(begin.span, `予告が convergeWarnMs（${cfg.convergeWarnMs}ms）でない`)
      .toBe(cfg.convergeWarnMs);
    expect(begin.newTones, '収束が始まった tick に mirageConverge が鳴っていない')
      .toEqual(expect.arrayContaining(MG_CONVERGE_HZ));
    const sameWave = warn.filter(x => x.converges === begin.converges);
    expect(sameWave.length, `予告が ${cfg.convergeWarnMs}ms 続いていない`)
      .toBe(nZTicks(cfg.convergeWarnMs));

    // ② 錨＝予告のあいだ本体は1歩も動かず、攻撃の時計も1つも進まない
    for (const x of sameWave) {
      expect(`${x.y},${x.x}`, `t${x.t}（予告中）に本体が動いた＝錨が効いていない`)
        .toBe(`${sameWave[0].y},${sameWave[0].x}`);
    }
    for (let i = 1; i < sameWave.length; i++) {
      expect(sameWave[i].attackTimes, `t${sameWave[i].t}（予告中）に攻撃が出た＝殴り返す窓が窓でない`)
        .toBe(sameWave[0].attackTimes);
    }
    // ③ 像は本体へ**単調に**吸い寄せられる（＝収束が絵で見える／どこへ集まるかが読める）
    const dists = sameWave.map(x => x.mirages.map(mg => Math.hypot(mg.x - x.x, mg.y - x.y)));
    expect(dists[0].length, '予告中に像が居ない＝測れていない').toBeGreaterThanOrEqual(1);
    for (let i = 1; i < dists.length; i++) {
      for (let k = 0; k < dists[i].length; k++) {
        expect(dists[i][k], `t${sameWave[i].t} の像が本体から遠ざかった＝収束していない`)
          .toBeLessThanOrEqual(dists[i - 1][k] + 1e-9);
      }
    }
    expect(Math.max(...dists[dists.length - 1]), '予告の終わりに像が本体へ寄り切っていない')
      .toBeLessThan(Math.max(...dists[0]));
    // ④ **本物だけが光る**＝予告のあいだに限りクラスが付き、長さは JS が渡す（絵に閾値を持たせない）
    for (const x of s) {
      expect(x.bodyCls, `t${x.t}（相 ${x.phase}）の輪郭の光りがずれている`).toBe(x.phase === 'warn');
    }
    expect(begin.spanVar, '輪郭の光りに渡す長さが convergeWarnMs でない')
      .toBe(`${cfg.convergeWarnMs}ms`);
  });

test('Z-⑥ 床に描いた危険域＝当たり判定の集合そのもの（進みは 0→1・落ちた瞬間に消えて絵が出る）',
  async ({ page }) => {
    const cfg = ENEMY_META[Z].phases[0].mirage;
    const r = await trackZarnel(page, { ticks: 60, drop: Z_P2_DMG, park: Z_PARK });
    const s = r.samples;
    const warn = s.filter(x => x.phase === 'warn');
    expect(warn.length, '予告の tick が無い＝測れていない').toBeGreaterThanOrEqual(1);

    for (const x of warn) {
      // ① 床の div の集合は判定の集合と**同一**（順序を除いて一致）
      expect([...x.zoneEls.map(e => e.key)].sort(), `t${x.t} の床の危険域が判定の集合と違う`)
        .toEqual([...x.cells].sort());
      expect(x.cells.length, `t${x.t} の危険域が0枚＝告知の無い打点`).toBeGreaterThan(0);
      // ② 中心は**収束を始めた瞬間の本体のタイル**（以後追わない）／半径どおり
      const [cr, cc] = x.center.split(',').map(Number);
      for (const key of x.cells) {
        const [rr, cc2] = key.split(',').map(Number);
        expect(inEdgeRadius(cr, cc, rr, cc2, cfg.convergeRadius),
          `t${x.t} のセル ${key} が中心 ${x.center} から半径 ${cfg.convergeRadius} の外`)
          .toBe(true);
      }
      // ③ 進みは 0〜1（1 になる tick は落ちる tick＝そこでは消えている）
      for (const e of x.zoneEls) {
        expect(e.progress, `t${x.t} のセル ${e.key} の進み ${e.progress} が 0〜1 の外`)
          .toBeGreaterThanOrEqual(0);
        expect(e.progress).toBeLessThan(1);
      }
    }
    // ④ 同じ波のあいだ中心も集合も動かない（＝走っている先へ付いて来ない・告知が嘘にならない）
    const wave = warn.filter(x => x.converges === warn[0].converges);
    expect(new Set(wave.map(x => x.center)).size, '予告中に危険域の中心が動いた＝追尾する円').toBe(1);
    expect(new Set(wave.map(x => x.cells.join('|'))).size, '予告中に集合が変わった＝告知が嘘になる')
      .toBe(1);
    // ⑤ 進みは単調に増える（＝残り時間そのもの＝速さを絵に持たせていない）
    for (let i = 1; i < wave.length; i++) {
      const a = wave[i - 1].zoneEls[0], b = wave[i].zoneEls[0];
      if (!a || !b) continue;
      expect(b.progress, `t${wave[i].t} の進みが前の tick より小さい＝時計が戻っている`)
        .toBeGreaterThan(a.progress);
    }
    // ⑥ 落ちた tick＝床の危険域が消え、落ちた絵（`.enemy-mirage-burst`）が枚数ぶん出る
    const idx = s.findIndex((x, i) => i > 0 && s[i - 1].phase === 'warn' && x.phase !== 'warn');
    expect(idx, '収束が一度も解決していない').toBeGreaterThan(0);
    expect(s[idx].zoneEls, '落ちた tick に床の危険域が残っている＝次の波と混ざる').toEqual([]);
    expect(s[idx].burstFx - s[idx - 1].burstFx,
      '落ちた tick に絵が1枚も出ていない＝盾を無視する打点が無告知で終わる')
      .toBe(s[idx - 1].cells.length);
  });

test('Z-⑦ 収束は盾を無視して当たる／打点は生き残った像の数ぶん（剣・石は黙らせて測る）',
  async ({ page }) => {
    const m = ENEMY_META[Z];
    const cfg = m.phases[0].mirage;
    // 剣（1.5）と石（7.0）は cooldown を巨大化して黙らせる＝**収束だけの被弾**を測る。
    // 本体は像が湧いた位置で止め（`stop`）、プレイヤーは本体の隣まで歩いて盾を向け続ける
    // ＝「盾を上げて待つ」が抜け道にならないことがこの機構の存在理由（§7-16）。
    const NEUTER = { attacks: m.attacks.map(a => ({ ...a, cooldown: 999999 })) };
    const r = await trackZarnel(page, {
      ticks: 60, drop: Z_P2_DMG, debugOff: true, stop: true, chaseBody: true, face: true,
      patch: NEUTER,
    });
    const s = r.samples;
    expect(r.error).toBeUndefined();
    expect(s[0].shieldTier, '盾を持っていない＝「盾で防げない」を測れていない')
      .toBeGreaterThanOrEqual(0);

    const idx = s.findIndex((x, i) => i > 0 && x.hits > s[i - 1].hits);
    expect(idx, '本体の隣で盾を向けて立ち続けても収束が一度も当たらない'
      + '＝盾を上げて待つ抜け道が残っている').toBeGreaterThan(0);
    const hit = s[idx], before = s[idx - 1];
    // ① 当たった tick の足元は**本当に危険域の中**だった（描いていないセルでは当たらない）
    expect(before.cells, `t${hit.t} で足元 ${before.ptile} が危険域の外なのに収束が当たった`)
      .toContain(before.ptile);
    // ② 盾は正面を向けていた（＝それでも通る＝盾を無視する打点）
    expect(before.pdir, '盾の向きが本体側でない＝「盾を向けていても通る」を測れていない')
      .toBeTruthy();
    // ③ 打点＝`convergeAtkPerMirage × 生き残った像の数`（`atk` が上限）− 防具
    const survivors = before.mirages.length;
    expect(survivors, '生き残った像が0体＝打点の式を測れていない').toBeGreaterThanOrEqual(1);
    const raw = Math.min(cfg.convergeAtkPerMirage * survivors, m.atk);
    expect(before.php - hit.php, `失った HP が「像 ${survivors} 体 × `
      + `${cfg.convergeAtkPerMirage}（上限 ${m.atk}）− 防具 ${before.pdef}」と違う`
      + '＝黙らせたはずの剣／石が通っているか、打点の式が像の数を見ていない')
      .toBe(Math.max(1, raw - before.pdef));
    // ④ 音＝当たった tick に mirageCurse
    expect(hit.newTones, `t${hit.t}（収束が当たった tick）に mirageCurse が鳴っていない`)
      .toEqual(expect.arrayContaining(MG_CURSE_HZ));
    // ⑤ 落ちた後は波が畳まれ、次の波は `respawnMs` 後（＝立ち続ければ何度でも来る）
    expect(hit.phase, '収束が落ちた tick に相が残っている＝波が畳まれていない').toBe(null);
    expect(hit.mirages.length, '収束が落ちたのに像が残っている').toBe(0);
    expect(hit.nextAt - hit.now, `次の波までが respawnMs（${cfg.respawnMs}ms）でない`)
      .toBe(cfg.respawnMs);
  });

test('Z-⑧ 像を全部斬れば波は打点0で畳まれる＝斬る作業が被弾を消す（次の波は respawnMs 後）',
  async ({ page }) => {
    const cfg = ENEMY_META[Z].phases[0].mirage;
    const r = await huntMirages(page, { kill: 'all' });
    expect(r.error).toBeUndefined();
    expect(r.count0, '像が湧いていない').toBe(cfg.count);

    // ① 全部斬れた＝像は1体も残っていない（数の真実は `getMirages()` だけ）
    expect(r.mirages, '斬り切ったのに像が残っている').toBe(0);
    expect(r.slain, `斬った像の数が ${cfg.count} でない`).toBe(cfg.count);
    // ② 波は畳まれ、**収束は一度も落ちていない**＝斬った作業がそのまま被弾を消した
    expect(r.phase, '像を全部斬っても相が残っている＝幽霊の波が続く').toBe(null);
    expect(r.hits, '像を全部斬ったのに収束が当たっている＝斬る作業が報われない').toBe(0);
    // ③ 次の波は `respawnMs` 後（＝斬り切った直後に湧き直さない）
    expect(r.fold, '波が畳まれた tick を捕まえられていない').toBeTruthy();
    expect(r.fold.gap, `次の波までが respawnMs（${cfg.respawnMs}ms）でない`).toBe(cfg.respawnMs);
    // ④ 最後の1体を斬った tick の音＝mirageFade（＝無害に解けた合図）
    expect(r.kills[r.kills.length - 1].tones, '最後の像を斬った tick に mirageFade が鳴っていない')
      .toEqual(expect.arrayContaining(MG_FADE_HZ));
  });

test('Z-⑧b **予告のあいだ**に斬り切っても無害に解ける＝盾を無視する打点が落ちる直前まで答えがある',
  async ({ page }) => {
    const m = ENEMY_META[Z];
    const cfg = m.phases[0].mirage;
    // ⚠️ 像を1体だけにする＝**予告は 720ms（6 tick）しかない**∴剣のクールダウン 300ms を
    //    挟んで複数体を斬り切るのは tick の並びに依存する（歯の無い flaky になる）。
    //    この本が測る分岐は「予告中に**最後の1体**が消えたら波が畳まれる」であって数ではない
    //    ∴`count` を 1 に落として分岐だけを裸にする（数の側は Z-⑧ が測っている）。
    const patch = {
      phases: m.phases.map(p => (p.mirage
        ? { ...p, mirage: { ...p.mirage, count: 1 } } : { ...p })),
    };
    const r = await huntMirages(page, { kill: 'all', patch, forceWarn: true });
    expect(r.error).toBeUndefined();
    expect(r.count0, '像が1体になっていない（patch が効いていない）').toBe(1);

    // ① 収束の予告が立っていた（＝斬ったのは「もう落ちる」状態の波）
    expect(r.warnPhase, '予告が立っていない＝この本が測りたい分岐に入っていない').toBe('warn');
    expect(r.converges, '収束が始まった数が1でない').toBe(1);
    // ② 斬った＝波は畳まれ、**結果の判定は一度も走らなかった**（当たりも空振りも0）
    expect(r.mirages, '予告中に斬っても像が残っている').toBe(0);
    expect(r.slain, '斬った像が数えられていない').toBe(1);
    expect(r.phase, '予告のまま止まっている＝落ちない打点が居座る').toBe(null);
    expect(r.hits, '予告中に斬り切ったのに盾を無視する打点が入った').toBe(0);
    expect(r.whiffs, '空振りとして解決された＝収束が落ちてしまっている'
      + '（＝「落ちる直前に無害化する」が成立していない）').toBe(0);
    // ③ 次の波は `respawnMs` 後（＝予告を潰した直後に湧き直さない）
    expect(r.fold, '波が畳まれた tick を捕まえられていない').toBeTruthy();
    expect(r.fold.gap, `次の波までが respawnMs（${cfg.respawnMs}ms）でない`).toBe(cfg.respawnMs);
    // ④ 床の危険域も消えている（＝畳んだのに告知だけ残らない）
    const zones = await page.evaluate(id =>
      document.querySelectorAll(`div[id^="mirage-${id}-"]`).length, r.id);
    expect(zones, '波を畳んだのに床の危険域が残っている').toBe(0);
  });

test('Z-⑨ 相3（33% 以下）＝像が4体・収束までが短く円が広い／予告は縮まない・打点は atk を超えない',
  async ({ page }) => {
    const m = ENEMY_META[Z];
    const c2 = m.phases[0].mirage, c3 = m.phases[1].mirage;
    const r = await trackZarnel(page, { ticks: 60, drop: Z_P3_DMG, park: Z_PARK });
    const s = r.samples;
    expect(r.error).toBeUndefined();

    // ① 設定が相3 のものへ差し替わっている（`_mirage`＝エンティティ側の1つの入口）
    expect(s[s.length - 1].cfg, '相3 の設定が差し替わっていない').toMatchObject(c3);
    // ⚠️ 速さは**駐める前の tick**（t=1＝相の差し替えが起きた tick）で測る＝以後は
    //    `park` が speed 0 を差し込む（駐めた後の値を見ると常に 0 で無条件に落ちる）。
    expect(s[0].speed, '相3 の速さが meta.speed × 1.6 でない')
      .toBeCloseTo(m.speed * m.phases[1].speedMultiplier, 6);
    // ② 像は4体（相2 の2体より多い）＝湧きの制約は同じまま
    const first = s.find(x => x.mirages.length > 0);
    expect(first, '相3 で像が1体も湧かない').toBeTruthy();
    expect(first.mirages.length, `相3 の像が ${c3.count} 体でない`).toBe(c3.count);
    expect(first.mirages.length, '相3 の像が相2 より増えていない').toBeGreaterThan(c2.count);
    // ③ 収束までが短い（`mirageMs` 3600＝30 tick）
    expect(first.span, `相3 の像の寿命が ${c3.mirageMs}ms でない`).toBe(c3.mirageMs);
    // ④ 予告は**縮まない**（§7-16 の据え置き）／円は広い（半径 2.0）
    const warn = s.filter(x => x.phase === 'warn');
    expect(warn.length, '相3 で収束の予告が来ない').toBeGreaterThanOrEqual(1);
    expect(warn[0].span, `相3 の予告が ${c2.convergeWarnMs}ms から縮んだ`).toBe(c2.convergeWarnMs);
    const [cr, cc] = warn[0].center.split(',').map(Number);
    for (const key of warn[0].cells) {
      const [rr, cc2] = key.split(',').map(Number);
      expect(inEdgeRadius(cr, cc, rr, cc2, c3.convergeRadius),
        `相3 のセル ${key} が中心 ${warn[0].center} から半径 ${c3.convergeRadius} の外`).toBe(true);
    }
    // 中央 (4,5) に駐めた＝壁で1枚も欠けない∴枚数は端距離から決まる数と**一致**する。
    expect(warn[0].center, `本体が駐めた中央 (${Z_PARK.row},${Z_PARK.col}) に居ない`)
      .toBe(`${Z_PARK.row},${Z_PARK.col}`);
    expect(warn[0].cells.length, `相3 の危険域が ${edgeArea(c3.convergeRadius)} 枚でない`)
      .toBe(edgeArea(c3.convergeRadius));
    expect(warn[0].cells.length, `相3 の円が相2 の円（${edgeArea(c2.convergeRadius)} 枚）より広くない`
      + '＝端距離を上げてもタイルへの量子化で消えている')
      .toBeGreaterThan(edgeArea(c2.convergeRadius));
    // ⑤ 打点は `atk` を超えない（生き残り4体 × 2 ＝ 8 ＝ atk＝上限にちょうど触れる）
    expect(Math.min(c3.convergeAtkPerMirage * c3.count, m.atk), '相3 の打点が atk を超えている')
      .toBe(m.atk);
  });

test('Z-⑩ 幻影（mirage）の使い手は Z だけ・Z は他の11体の移動機構を借りていない', () => {
  // ⚠️ 数えるのは**相の中まで**（`mirage` は `phases[].mirage` だけに在る＝素のメタを見る
  //    導出だと「使い手0」に見える＝[[blade-enemy-tables-derive-from-meta]] と同じ穴）。
  const zm = mechanismsDeepOf(ENEMY_META[Z]);
  expect(zm.has('mirage'), 'Z が固有機構（幻影＝mirage）を持っていない（相の中まで数えた）')
    .toBe(true);
  expect(mechanismsOf(ENEMY_META[Z]).has('mirage'),
    '素のメタに mirage がある＝相1 から像が湧く（設計と違う）').toBe(false);
  const users = Object.entries(ENEMY_META)
    .filter(([, m]) => mechanismsDeepOf(m).has('mirage')).map(([k]) => k);
  expect(users, '幻影を持つ敵が Z 以外にも居る（設計が重複した）').toEqual([Z]);
  // 借り物でない番人＝ザコの素の機構（`blink`／`split`）を横流ししていない（2026-09-03 の裏取り）
  for (const k of ['combat', 'laneStalk', 'burrowAmbush', 'hide', 'dash', 'coil', 'gaze',
    'soar', 'momentum', 'leap', 'tongue', 'zigzag', 'surge', 'glaciate', 'lockstep',
    'blink', 'split', 'blockFacing', 'shell', 'leech']) {
    expect(ENEMY_META[Z][k], `${k} を持っている＝他の11体／ザコの型を借りている`).toBeUndefined();
    for (const p of ENEMY_META[Z].phases ?? []) {
      expect(p[k], `相の中に ${k} が生えている＝他のボスの後半と同じ型`).toBeUndefined();
    }
  }
});

test('Z-⑪ 幾何（GUIDE §4-3）＝闘技場（床 82）と本番 dark_tower 0,0（床 78・空箱）の両方で'
  + '収束の円が部屋を覆わない', () => {
  const MAP = JSON.parse(readFileSync(
    fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url)), 'utf8'));
  const c3 = ENEMY_META[Z].phases[1].mirage;      // 最大の円（半径 2.0）で測る
  const area = edgeArea(c3.convergeRadius);
  const rooms = [
    { label: '闘技場 test_mechanics 33,1', layer: TEST_LAYER, key: stageKey('bal_zarnel'),
      floors: 82, at: [Z_ROW, Z_COL] },
    { label: '本番 dark_tower 0,0（玉座の間）', layer: 'dark_tower', key: '0,0',
      floors: 78, at: [1, 5] },
  ];
  for (const room of rooms) {
    const sd = MAP.layers[room.layer]?.stages[room.key];
    expect(sd, `${room.label} が無い`).toBeTruthy();
    const rows = sd.tiles.map(r => (Array.isArray(r) ? r.join('') : r));
    expect(rows.length, `${room.label} の行数が 10 でない`).toBe(10);
    expect(sd.cols, `${room.label} の列数が 12 でない`).toBe(12);
    // ① 水も塗り分けも無い＝幻影は地形を見ない（在ると測定が地形のせいになる）
    expect(Object.keys(sd.bgTiles ?? {}).length, `${room.label} に bgTiles がある`).toBe(0);
    // ② Z が1体だけ、実測どおりの位置に居る
    const found = [];
    rows.forEach((row, r) => [...row].forEach((ch, cc) => { if (ch === Z) found.push([r, cc]); }));
    expect(found.length, `${room.label} に Z が1体ではない`).toBe(1);
    expect(found[0], `${room.label} の Z の位置が出荷データと違う`).toEqual(room.at);
    // ③ 床の枚数（＝§7-15 の引き算と `.scratch` の総当たりが使う数の裏取り）
    const floors = rows.reduce((n, row) => n + [...row].filter(ch => ch === '.').length, 0);
    expect(floors, `${room.label} の床が ${room.floors} 枚でない＝部屋が作り変えられた`
      + '（無傷セル0の総当たりの前提が崩れる）').toBe(room.floors);
    // ④ 円は部屋を覆わない＝「本体から離れる」答えが選べる（§7-15）
    expect(floors, `${room.label} の床 ${floors} 枚が円 ${area} 枚の 3 倍に届かない＝逃げ場が無い`)
      .toBeGreaterThanOrEqual(area * 3);
    // ⑤ 湧きの逃げ場＝像 4 体＋本体 1 体が `spawnKeepMin` の外に立てる床が在る
    expect(floors - area, `${room.label} は円の外の床が ${floors - area} 枚しかない`)
      .toBeGreaterThan(c3.count + 1);
  }
});
