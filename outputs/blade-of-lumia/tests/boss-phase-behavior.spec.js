// tests/boss-phase-behavior.spec.js — Phase 8-4 (4) 層1「フェーズが行動表そのものを差し替える」
//
// ボスの `ENEMY_META[type].phases` は「HP がある比率を割ったら1回だけ効く」上書きの列。
// 8-4 (4) 層1 で入れた配線は2つ：
//   ① **表の差し替え**＝`phases[].attacks / modeWeights / hitAndAway / combat` を書くと、
//      その相から先は敵がその表で動く。書き込み先は**エンティティ側だけ**
//      （`boss.js applyBossPhase` が `e._attacks` 等を立てる）で、読み手は
//      `enemy-ai.js` の `resolve*()` 4本に一本化した＝二重管理にしない。
//   ② **`attackCooldownMultiplier` の実効化**。これは 8-4 (4) 以前は
//      `boss.attack.cooldown` を書き換えていたが、
//        ・`buildEnemies()` はエンティティに `attack` を持たせない＝条件が常に偽
//        ・AI が読むのは `meta.attacks`（複数攻撃の表）＝書けても読まれない
//      の**二重に死んでいた**∴13ボスのうち**10体**（X/Z/A/L/N/J/O/U/I/{）が持つ
//      「後半で攻撃が激しくなる」が1度も起きていなかった。②の本は
//      **層1 の変更を stash すると赤くなる**（2026-08-24 に実測・下の「歯の実測」）。
//
// ⚠️ 層1 では `ENEMY_META` の**中身を変えない**（機構だけ入れる）∴まだデータに無い
//    `phases[].attacks` 等は `__game.setEnemyMetaForTest(type, patch)` で一時的に足して測る。
//    差し込み先は共有モジュールの実体＝**そのページ読み込みの間ずっと効く**∴patch を使う本は
//    1本につき1回 goto する（Playwright の page は test ごとに新規＝本をまたいで漏れない）。
//
// 検証ステージ＝test_mechanics[32,0] `spare_arena`（10×12・遮蔽ゼロ・敵は置かれていない）。
// プレイヤーは (4,2)＝row 4 は計測帯（左右 rows 7/8 は隣アリーナへの通路＝tests/test-arena-doors.js）。
// 敵は `injectEnemy` で **プレイヤーと同じ行の東側**に置く＝距離を1つの数で作れる。
// ⚠️ `injectEnemy` の敵は `speed: 0`・`def: 0`（game.js injectTestEnemy）＝
//    ・距離が動かない∴「射程/クールダウンだけ」を測れる
//    ・`dealDamage(id, n)` が減算なしでそのまま入る＝HP 比を狙って割れる
//    ただし**フェーズの `speedMultiplier` は `meta.speed × 倍率`** を書く（元の speed を見ない）
//    ∴速度を止めたまま他の相を測りたい本は `patch` で `speed: 0` を渡す（②）。
//
// tick 換算（TICK_MS=120・`step(1)` が論理時間を 120ms 進める・now = 120×tick）：
//   敵の初撃は `_attackTimes[i] ?? 0` 起点＝**配置から cooldown 経過後**（GUIDE §4-1）。
//   ∴発火間隔は `ceil(cooldown / 120)` tick に量子化される（1600 → 14 tick＝1680ms）。
// ⚠️ 計測は1回の evaluate 内で完結させ、実時間ループは `gotoFrozen()` で**起動させない**
//    （GUIDE §4-2。pause() では「盤面が出るまで」の 1 tick が漏れて拍が1つずれる）。
// ⚠️ プレビュー（fromEditor=1）は debugMode:true ＝ `takeDamage()` が早期 return する
//    ∴ボスに撃たれ続けてもプレイヤーは死なない（ハートを積む必要がない）。
//
// 歯の実測（2026-08-24）：`git stash push game/boss.js game/enemy-ai.js` で
// **機構だけ**を 8-4 (4) 以前へ戻し（観測用の game.js/main.js は残す＝赤の理由が
// 「テストの口が無い」にならないようにする）、下の3本が赤・4本が緑になることを確認した：
//   ① 赤「相の後も撃たない＝表が差し替わっていない」（`_attacks` が書かれず meta の表のまま）
//   ② 赤「相の後の発火が少なすぎる」（間隔が 14 tick のまま∴観測窓 90 tick に 3 発しか入らない
//         ＝倍率が死んでいる状態そのもの）
//   ③ 赤「相の後に一度も選び直していない」（重みが direct のまま＝wander を選ばない）
//   ④⑤⑥⑦ 緑＝**回帰とデータの番人**（④は speedMultiplier が壊れていないこと・
//   他の表が漏れないこと／⑤⑥はデータ側の誤記と行き過ぎの検出／⑦は盤面のドリフト）。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { isArenaDoor } from './test-arena-doors.js';

const GAME = '/blade-of-lumia/game/';
const TICK_MS = 120;

// プレイヤーの立ち位置（計測帯 row 4・西寄り＝東側に敵を置く余地を残す）
const PL_ROW = 4;
const PL_COL = 2;

function previewUrl(stage, row, col, extra) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col),
    ps_weapon: '1',
    ...(extra ?? {}),
  });
  return `${GAME}?${p.toString()}`;
}
const ARENA = previewUrl('spare_arena', PL_ROW, PL_COL);

// 実時間ループ（game.js startGameLoop = setInterval(() => step(1), TICK_MS)）を
// ページ評価の前に無効化してから開く（facing-block-enemies.spec.js と同じ型・GUIDE §4-2）。
const frozen = new WeakSet();
async function gotoFrozen(page, url) {
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
  await page.goto(url);
  await waitForBoard(page);
  expect(await page.evaluate(() => window.__loopBlocked),
    '実時間ループの差し込み阻止が効いていない（game.js startGameLoop の形が変わった？）')
    .toBeGreaterThan(0);
}

/**
 * ボスを1体注入して n tick 進め、毎 tick のスナップショットと攻撃の発火時刻を返す。
 * @param {object} o
 * @param {string} o.type      ENEMY_META のタイル文字
 * @param {number} o.atDx      プレイヤーからの東方向の距離（セル）
 * @param {number} o.hp        注入 HP（maxHp も同値＝HP 比を狙って割れる）
 * @param {number} o.ticks     進める論理 tick 数
 * @param {Array<[number,number]>} [o.drops]  [tick, ダメージ]（その tick の step より前に入れる）
 * @param {object} [o.patch]   ENEMY_META へ一時的に差し込むフィールド
 */
async function measureBoss(page, o) {
  await gotoFrozen(page, ARENA);
  return page.evaluate((a) => {
    const g = window.__game;
    if (a.patch) g.setEnemyMetaForTest(a.type, a.patch);
    const pl = g.getPlayer();
    const ex = pl.x + a.atDx, ey = pl.y;
    const id = g.injectEnemy(ex, ey, a.hp, 1, 1, a.type);
    const find = () => g.getEnemies().find(e => e.id === id);

    const drops = new Map(a.drops ?? []);
    const samples = [];
    const fires = [];                 // 攻撃が発火した tick（{t, i, at}）
    const projTypes = new Set();
    let prevTimes = {};

    const gameTime0 = g.getState().gameTime;
    for (let t = 1; t <= a.ticks; t++) {
      if (drops.has(t)) g.dealDamage(id, drops.get(t));
      g.step(1);
      const e = find();
      if (!e) break;
      const times = e.attackTimes ?? {};
      for (const [k, v] of Object.entries(times)) {
        if (prevTimes[k] !== v) fires.push({ t, i: Number(k), at: v });
      }
      prevTimes = { ...times };
      for (const p of g.getProjectiles()) projTypes.add(p.type);
      samples.push({
        t, hp: e.hp, speed: e.speed, x: e.x, y: e.y,
        mode: e.approachMode ?? null, haPhase: e.haPhase ?? null,
        atkCdMul: e.atkCdMul ?? null,
      });
    }
    const e = find();
    return {
      gameTime0, ex, ey, samples, fires, projTypes: [...projTypes],
      playerHp: g.getPlayer().hp,
      end: e && {
        hp: e.hp, speed: e.speed, x: e.x, y: e.y,
        phasesTriggered: e.phasesTriggered ?? null,
        attacks: e.attacks, atkCdMul: e.atkCdMul,
        modeWeights: e.modeWeights, hitAndAway: e.hitAndAway, combat: e.combat,
        attackTimes: e.attackTimes,
      },
    };
  }, o);
}

/** cooldown（ms）→ 発火間隔（tick）。now は 120ms 刻み∴切り上げで量子化される。 */
const gapTicks = (cooldownMs) => Math.ceil(cooldownMs / TICK_MS);
/** 発火 tick 列 → 間隔（tick）の列 */
const diffs = (ts) => ts.slice(1).map((t, i) => t - ts[i]);

// ── ① phases[].attacks ＝攻撃表そのものを差し替える ───────────────────────
// 魔物 W の素の表は sword(range 1.5) / stone(range 4)＝距離6では**どちらも届かない**
// ∴相の前は1度も撃たない。相で range 7 の石だけの表に差し替えると撃ち始める
// ＝「撃てるようになった」以外の説明が付かない（速度0＝距離は動かない）。
test('① phases[].attacks で攻撃表が差し替わる（届かない→届く）', async ({ page }) => {
  const NEW_ATTACKS = [{ type: 'stone', range: 7, cooldown: 600, projectileSpeed: 1.0 }];
  const DROP_AT = 10;
  const r = await measureBoss(page, {
    type: 'W', atDx: 6, hp: 72, ticks: 30, drops: [[DROP_AT, 40]],   // 72 → 32（0.44 ≤ 0.5）
    patch: { phases: [{ hpThreshold: 0.5, attacks: NEW_ATTACKS }] },
  });
  expect(r.gameTime0, '実ループの tick が漏れている').toBe(0);

  // 相の前：射程外＝1度も撃っていない（沈黙の理由が cooldown でないことは①の後半が示す）
  expect(r.fires.filter(f => f.t < DROP_AT), '相の前に撃っている（射程の前提が崩れた）').toEqual([]);

  // 相の後：差し替えた表の index 0 が cooldown 600（=5 tick）ごとに撃つ
  const after = r.fires.filter(f => f.t >= DROP_AT);
  expect(after.length, '相の後も撃たない＝表が差し替わっていない').toBeGreaterThanOrEqual(4);
  expect(new Set(after.map(f => f.i)), '差し替えた表に無い index が撃っている').toEqual(new Set([0]));
  expect(diffs(after.map(f => f.t)), '差し替えた表の cooldown で撃っていない')
    .toEqual(Array(after.length - 1).fill(gapTicks(600)));
  expect(r.projTypes, '石が飛んでいない（発火だけして投擲物が出ていない）').toContain('stone');

  // エンティティ側に書かれた表がそのまま観測できる（読み手は resolveAttackList 一本）
  expect(r.end.attacks).toEqual(NEW_ATTACKS);
  // 距離は動いていない＝射程の議論が成立する
  expect(new Set(r.samples.map(s => `${s.x},${s.y}`)), '敵が動いた＝距離が変わった').toEqual(
    new Set([`${r.ex},${r.ey}`]));
});

// ── ② attackCooldownMultiplier が実際に効く（★層1 の本体・出荷データで測る）──────
// ザーネル Z の出荷データ：stone cooldown 1600（14 tick）／相2（HP 33%）で ×0.55 → 880（8 tick）。
// ⚠️ `speed: 0` を patch する理由＝相は `meta.speed × 倍率` を書く∴素のままだと相の後に
//    動き出して距離が変わり、間隔の変化が「クールダウンのせい」と言えなくなる。
//    倍率そのもの（測っている対象）は出荷データのまま。
test('② attackCooldownMultiplier で攻撃間隔が縮む（出荷データ・Z）', async ({ page }) => {
  const meta = ENEMY_META['Z'];
  const stone = meta.attacks[0];
  const mul = meta.phases.find(p => p.attackCooldownMultiplier).attackCooldownMultiplier;
  const DROP_AT = 43;   // 相の前に14 tick 間隔を2つ観測できるところ（発火 14/28/42 の直後）
  const r = await measureBoss(page, {
    type: 'Z', atDx: 4, hp: meta.hp, ticks: 90,
    drops: [[DROP_AT, 81]],            // 120 → 39（0.325 ≤ 0.33）＝相1・相2が同時に成立
    patch: { speed: 0 },
  });
  expect(r.gameTime0, '実ループの tick が漏れている').toBe(0);
  expect(new Set(r.samples.map(s => `${s.x},${s.y}`)), '敵が動いた＝距離が変わった').toEqual(
    new Set([`${r.ex},${r.ey}`]));

  // 相の前：素の cooldown（1600 → 14 tick）
  const before = r.fires.filter(f => f.t <= DROP_AT).map(f => f.t);
  expect(before.length, '相の前に撃っていない（射程 or cooldown の前提が崩れた）').toBeGreaterThanOrEqual(3);
  expect(diffs(before), '相の前の間隔が素の cooldown と違う')
    .toEqual(Array(before.length - 1).fill(gapTicks(stone.cooldown)));

  // 相の後：倍率のかかった cooldown（880 → 8 tick）
  const after = r.fires.filter(f => f.t > DROP_AT).map(f => f.t);
  expect(after.length, '相の後の発火が少なすぎる').toBeGreaterThanOrEqual(4);
  expect(diffs(after), '相の後も素の cooldown のまま＝倍率が効いていない（8-4 (4) 以前の死んだ状態）')
    .toEqual(Array(after.length - 1).fill(gapTicks(Math.round(stone.cooldown * mul))));

  expect(r.end.atkCdMul, '倍率がエンティティに書かれていない').toBe(mul);
  expect(r.end.phasesTriggered).toEqual(meta.phases.map(p => p.hpThreshold));
  // 倍率は**常に表の値**から計算する＝相を跨いでも複利で縮まない
  expect(r.end.attacks, '表そのものは差し替えていない（倍率は読み出し時に掛ける）').toBeNull();
});

// ── ③ phases[].modeWeights ＝接近の選び方を差し替える ──────────────────────
// ヒット＆アウェイの接近モードは `_modeWeights` の重み抽選（pickApproachMode）。
// 相の前は direct だけ・相の後は wander だけの重みに差し替える。
// ⚠️ 距離6・速度0＝退避相は毎回「距離が離れすぎ」の枝で即座に接近へ戻る（学習の枝を通らない）
//    ∴重みは学習で書き換わらない＝差し替えた値がそのまま残ることも見られる。
// ⚠️ wander は目標セルが乱択∴到達判定（wDist<1.0）で direct へ落ちうる
//    ∴主張は「相の後**最初の**選び直しが wander であること」に限る。
// ⚠️ `hitAndAway: true` を patch で**明示的に足す**（2026-08-25・0d-3 層2）。
//    W 魔物の出荷データは `hitAndAway: false`＋`combat` の二相に変わった∴meta 任せだと
//    接近モードが1度も立たない。ここが測るのは層1 の口（modeWeights の差し替え）であって
//    W の性格ではない∴機構だけを patch で用意する＝W の設計が変わっても腐らない。
test('③ phases[].modeWeights で接近モードの重みが差し替わる', async ({ page }) => {
  const PRE  = { flank: 0, direct: 1, wander: 0, strafe: 0 };
  const POST = { flank: 0, direct: 0, wander: 1, strafe: 0 };
  const DROP_AT = 40;
  const r = await measureBoss(page, {
    type: 'W', atDx: 6, hp: 72, ticks: 70, drops: [[DROP_AT, 40]],
    patch: {
      hitAndAway: true, combat: null,   // null で二相を切る（undefined は evaluate の引数で落ちる）
      initialModeWeights: PRE, phases: [{ hpThreshold: 0.5, modeWeights: POST }],
    },
  });
  expect(r.gameTime0).toBe(0);

  const modesBefore = r.samples.filter(s => s.t < DROP_AT).map(s => s.mode).filter(Boolean);
  expect(modesBefore.length, '接近モードが1度も立っていない（ヒット＆アウェイに乗っていない）')
    .toBeGreaterThan(10);
  expect(new Set(modesBefore), '相の前に direct 以外を選んでいる＝重みが効いていない')
    .toEqual(new Set(['direct']));

  const firstChanged = r.samples.find(s => s.t >= DROP_AT && s.mode && s.mode !== 'direct');
  expect(firstChanged, '相の後に一度も選び直していない（観測窓が短い）').toBeTruthy();
  expect(firstChanged.mode, '相の後の最初の選び直しが差し替えた重みに従っていない').toBe('wander');
  expect(r.end.modeWeights, 'エンティティ側の重みが差し替わっていない').toEqual(POST);
});

// ── ④ speedMultiplier の回帰＋「書いていない表は漏れない」────────────────────
// 8-4 (4) 以前から効いていた唯一の相（速度）を壊していないこと。
// 併せて：speed だけの相は `attacks`/`atkCdMul`/`hitAndAway`/`combat` を触らない
// （resolve*() が meta へ落ちる＝既存13ボスの挙動が変わらない根拠）。
test('④ speedMultiplier は meta.speed から計算し複利にならない／他の表は漏れない', async ({ page }) => {
  const meta = ENEMY_META['Z'];
  const [p1, p2] = meta.phases;
  const r = await measureBoss(page, {
    type: 'Z', atDx: 4, hp: meta.hp, ticks: 45,
    drops: [[10, 45], [25, 36]],       // 120 → 75（0.625≤0.66）→ 39（0.325≤0.33）
  });
  expect(r.gameTime0).toBe(0);

  // 相の前：注入時の speed 0＝1歩も動かない（＝速度が動きの唯一の駆動である裏取り）
  const pre = r.samples.filter(s => s.t < 10);
  expect(new Set(pre.map(s => s.speed))).toEqual(new Set([0]));
  expect(new Set(pre.map(s => `${s.x},${s.y}`))).toEqual(new Set([`${r.ex},${r.ey}`]));

  const mid = r.samples.filter(s => s.t >= 10 && s.t < 25);
  expect(new Set(mid.map(s => s.speed)), '相1 の速度が meta.speed×倍率 でない')
    .toEqual(new Set([meta.speed * p1.speedMultiplier]));
  expect(new Set(mid.map(s => s.atkCdMul)), '相1 は倍率を持たないのに書かれている')
    .toEqual(new Set([null]));

  const post = r.samples.filter(s => s.t >= 25);
  expect(new Set(post.map(s => s.speed)), '相2 の速度が meta.speed×倍率 でない（複利になっている？）')
    .toEqual(new Set([meta.speed * p2.speedMultiplier]));
  expect(meta.speed * p1.speedMultiplier * p2.speedMultiplier,
    '複利と非複利が同値のデータでは複利のバグを検出できない')
    .not.toBeCloseTo(meta.speed * p2.speedMultiplier, 5);

  // 速度が付いた後は実際に動く（speed を書いただけで終わっていない）
  expect(post.some(s => s.x !== r.ex || s.y !== r.ey), '速度が上がったのに1歩も動いていない').toBe(true);

  // 漏れの検査：Z の相は attacks/modeWeights/hitAndAway/combat を書いていない
  expect(r.end.attacks).toBeNull();
  expect(r.end.hitAndAway).toBeNull();
  expect(r.end.combat).toBeNull();
  // `_modeWeights` は学習で書き換わる生きた状態∴値は主張しない。ただしキーの集合は
  // 既定（flank/direct/wander）のまま＝「石を持つ敵は strafe 1.2」という**死んでいた
  // 既定表**（8-4 (4) で削除）が戻っていないことの番人（Z は石を持つ）。
  expect(Object.keys(r.end.modeWeights).sort()).toEqual(['direct', 'flank', 'wander']);
});

// ── ⑤ 出荷データの phases[] はスキーマ内のキーだけを使う ─────────────────────
// 誤記（`attackCooldownMultipler` 等）は**黙って無視される**＝8-4 (4) で直したのと同じ
// 種類のバグ∴データ側を型で縛る。層1 で足したキーもここが唯一の宣言。
test('⑤ ENEMY_META の phases[] は既知のキーだけを持ち、閾値は降順', () => {
  const PHASE_KEYS = ['hpThreshold', 'speedMultiplier', 'attackCooldownMultiplier',
                      'attacks', 'modeWeights', 'hitAndAway', 'combat',
                      // 0d-3（2体目 A）: 後半で**機構そのものを生やす**口（boss.js が `_dash` へ書き、
                      // enemy-ai.js の `resolveDash` が読む）。表の差し替えだけでは移動が変わらない。
                      'dash',
                      // 0d-3（3体目 N）: 隠れ↔出現の周期を相で差し替える口（boss.js が `_hide` へ
                      // 書き、enemy-ai.js の `resolveHide` が読む）＝潜行を短くして待ち伏せを増やす。
                      'hide'];
  const MODE_KEYS = ['flank', 'direct', 'wander', 'strafe'];
  const withPhases = Object.entries(ENEMY_META).filter(([, m]) => m.phases);
  expect(withPhases.length, 'phases を持つ敵が居ない（データが消えた？）').toBeGreaterThanOrEqual(13);

  for (const [t, m] of withPhases) {
    expect(Array.isArray(m.phases), `${t} の phases が配列でない`).toBe(true);
    const thresholds = m.phases.map(p => p.hpThreshold);
    // 降順でなければ「HP を一撃で複数の相ぶん割った」ときに弱い相が後から上書きする
    // （checkBossPhase は配列順に全部適用する）
    expect(thresholds, `${t} の phases が hpThreshold の降順でない`)
      .toEqual([...thresholds].sort((a, b) => b - a));
    for (const p of m.phases) {
      expect(Object.keys(p).filter(k => !PHASE_KEYS.includes(k)), `${t} の phases に未知のキー`)
        .toEqual([]);
      expect(typeof p.hpThreshold, `${t} の hpThreshold が数値でない`).toBe('number');
      expect(p.hpThreshold).toBeGreaterThan(0);
      expect(p.hpThreshold).toBeLessThanOrEqual(1);
      for (const k of ['speedMultiplier', 'attackCooldownMultiplier']) {
        if (p[k] !== undefined) expect(p[k], `${t} の ${k} が正の数でない`).toBeGreaterThan(0);
      }
      if (p.attacks !== undefined) {
        expect(Array.isArray(p.attacks), `${t} の phases[].attacks が配列でない`).toBe(true);
        for (const a of p.attacks) expect(typeof a.type, `${t} の phases[].attacks に type が無い`).toBe('string');
      }
      if (p.modeWeights !== undefined) {
        expect(Object.keys(p.modeWeights).filter(k => !MODE_KEYS.includes(k)),
          `${t} の phases[].modeWeights に未知のモード`).toEqual([]);
      }
      if (p.hitAndAway !== undefined) expect(typeof p.hitAndAway).toBe('boolean');
      if (p.hide !== undefined) {
        // 相の hide は meta.hide を**丸ごと差し替える**（`resolveHide`）∴部分指定は
        // 既定値（hiddenMs 2000 / shownMs 1200 / style 'water'）に落ちる＝地中の敵が
        // 水の波紋で出る事故になる。キーの綴りと必須項目をここで縛る。
        const HIDE_KEYS = ['hiddenMs', 'shownMs', 'style', 'emergeSound'];
        expect(Object.keys(p.hide).filter(k => !HIDE_KEYS.includes(k)),
          `${t} の phases[].hide に未知のキー`).toEqual([]);
        for (const k of ['hiddenMs', 'shownMs']) {
          expect(p.hide[k], `${t} の phases[].hide.${k} が正の数でない`).toBeGreaterThan(0);
        }
        expect(p.hide.style, `${t} の phases[].hide.style が meta.hide と違う`).toBe(m.hide?.style);
      }
    }
  }
});

// ── ⑥ 倍率のかかった cooldown が下限を割らない／倍率が空振りしない ─────────────
// 層1 で `attackCooldownMultiplier` が**初めて実際に効く**ようになった＝出荷データの
// 10体分が実質的な難易度変更になる∴行き過ぎ（連射で回避不能）をデータ側で止める。
// 実測の最小は Z の sword 700×0.55 = 385ms（3 tick 強）。
test('⑥ attackCooldownMultiplier は下限を割らず、掛ける相手が必ず居る', () => {
  const FLOOR_MS = 360;   // 3 tick＝プレイヤーが1歩（MOVE_STEP 0.5）動ける最小の間合い
  let min = Infinity;
  for (const [t, m] of Object.entries(ENEMY_META)) {
    for (const p of m.phases ?? []) {
      if (p.attackCooldownMultiplier === undefined) continue;
      const base = p.attacks ?? m.attacks ?? (m.attack ? [m.attack] : []);
      const withCd = base.filter(a => a && a.cooldown != null);
      // cooldown を明示した攻撃が1つも無ければ倍率は**何にも掛からない**＝死んだ指定
      expect(withCd.length, `${t} の attackCooldownMultiplier が掛かる攻撃が無い`).toBeGreaterThan(0);
      for (const a of withCd) {
        const eff = Math.round(a.cooldown * p.attackCooldownMultiplier);
        expect(eff, `${t} の ${a.type} が相の後 ${eff}ms＝連射すぎる`).toBeGreaterThanOrEqual(FLOOR_MS);
        min = Math.min(min, eff);
      }
    }
  }
  expect(min).toBeLessThan(Infinity);
});

// ── ⑦ 検証ステージの幾何（GUIDE §4-3＝前提を測る本自身で固定する）─────────────
test('⑦ spare_arena は 10×12・外周は通路以外すべて壁・内部は素の床・敵なし', () => {
  const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
  const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  const sd = MAP.layers[TEST_LAYER].stages[stageKey('spare_arena')];
  expect(sd.rows).toBe(10);
  expect(sd.cols).toBe(12);
  expect(sd.enemies ?? [], 'アリーナに敵が置かれた＝注入した1体だけを測れない').toEqual([]);
  const at = (r, c) => (Array.isArray(sd.tiles[r]) ? sd.tiles[r][c] : sd.tiles[r][c]);
  for (let r = 0; r < sd.rows; r++) {
    for (let c = 0; c < sd.cols; c++) {
      const edge = r === 0 || c === 0 || r === sd.rows - 1 || c === sd.cols - 1;
      const want = edge && !isArenaDoor(r, c, sd.cols) ? TILE.WALL : TILE.FLOOR;
      expect(at(r, c), `(${r},${c}) が想定と違う`).toBe(want);
    }
  }
  // 計測に使う行（プレイヤー・敵の並ぶ row 4）が通路と重ならない
  expect(isArenaDoor(PL_ROW, 0, sd.cols)).toBe(false);
});
