// tests/boss-2x2-mechanisms.spec.js — Phase 8-4 (4) 0d-2「2×2 での既存機構の適用可否の実測」
//
// 層2（ボス1体ずつに固有の機構を与える）で使う予定の既存機構は、すべて**1×1 の雑魚**の
// ために書かれている（跳躍蜘蛛 β / 火吐き亀 φ / 術士 η / 突進猪 ω / ルピー喰い σ / 地中蟲 α）。
// 一方 13 ボスのうち **9 体が 2×2**（`ENEMY_META[t].size = {w:2,h:2}`）＝
// G 岩のゴーレム・N 砂嵐の蠍王・J 深海の海蛇・A 炎のサラマンドラ・L 氷のリヴァイアサン・
// O 古森の巨人・U 嵐の鷲王・I 沼地の大蝦蟇・`{` 海の主。
// ∴機構をそのまま流用できるかを**1体ずつ実装する前に**測る（さもなければ層2で13回同じ罠を踏む）。
//
// ★ 測っている軸は1つ＝**大型敵の座標は「左上」で持つ**（`e.x/e.y` は占有範囲の top-left）。
//   ∴「プレイヤーとの距離」を `player.x - e.x` で書くと、2×2 では西/北から測ったときだけ
//   体の幅ぶん（1 セル）遠く出る＝**発動する間合いが向きで 1 セル変わる**。
//   0d-2 の初版（2026-08-25）はこの非対称を**実測して固定した**本だった。
//   0d-2.5（同日）で機構側を直した＝間合いを測る所はすべて hitbox.js の
//   `enemyCellCenter`（セル添字基準の中心）／`enemyHalf`／`enemyEdgeDist`（body の端からの
//   距離）を通す∴この本は今「4方向で対称であること」を測る本になっている。
//   1×1 では halfW=halfH=0 ＝ 従来と同値（ザコの挙動は 1体も変わらない）。
//
// 測り方（GUIDE §4-2 と boss-phase-behavior.spec.js と同型）：
//   ・`spare_arena`（test_mechanics[32,0]・10×12・遮蔽ゼロ・敵ゼロ）へ **2×2 を注入**する。
//     注入敵は `speed: 0`（game.js injectTestEnemy）∴歩かない＝距離が動かない
//     ＝「機構の発動条件だけ」を1つの数で作れる。機構側の移動（跳躍の滞空・突進の走行）は
//     `speed` を通さない∴速度0でも機構は動く。
//   ・`setEnemyMetaForTest('G', {...})` で機構の設定を一時的に足す（0d-2 は ENEMY_META を
//     変えない＝層2で1体ずつ入れる）。差し込みはそのページ読み込みの間だけ有効。
//   ・`patch` に必ず `speed: 0` を入れる＝G の相（hpThreshold 0.5 / speedMultiplier 1.4）が
//     HP を割ったときに `meta.speed × 倍率` を書いて歩き出すのを止める（距離を固定する）。
//   ・時間は論理時間（`step(1)` = 120ms）。窓の tick は下の各本で算術から出す。
//
// ⚠️ 注入敵は **DOM 要素を持たない**（injectTestEnemy は el を作らない・gameTick は
//    renderChars を呼ばない）∴絵の検証には使えない。しかも `swapEnemySprite` は
//    el が無いとき **絵の登録有無を確かめずに `e.sprite` を書く**（enemy-ai.js:1645）
//    ＝注入敵で `sprite` を読むと「無い絵に差し替わった」と嘘の観測が出る。
//    ∴DOM・絵は⑧で**実配置のボス**（`bal_rock_golem` = test_mechanics[30,1] の G）で測る。
//
// 実測の結論（2026-08-25 初版 → 同日 0d-2.5/0d-2.6 の修正後に更新。PLAN 8-4 (4) 層2 の前提）：
//   ① hide      … そのまま使える（無敵窓・占有・痕跡の絵すべて 2×2 で成立）
//   ② leap      … 0d-2.5 (1) で直した：発動距離を body の端から測る＝**4方向で対称**
//                  （密着＝端から 1.0 ではどの向きでも跳ばない／端から 2.0 ではどの向きでも跳ぶ）
//   ③ dash      … 0d-2.5 (2) で直した：トリガの車線＝当たりの車線（`alignTol + 半サイズ`）
//                  ＝**上の行の正面でも下の行の正面でも同じ拍で突進して当たる**
//   ④ dash 気絶  … そのまま使える（壁激突→stunUntil→全行動停止・占有は壁を踏み越えない）。
//                  硬直が明けた tick に岩投げが**即**出る＝凍結中の沈黙は守りのせい。
//                  剣は 0d-2.6 の予告（3 tick 振り上げ）を経てから当たる
//   ⑤ blink     … 0d-2.5 (3) で直した：出現先は「body の**手前の端**を range セル離す」
//                  ＝4方向どこへ出てもプレイヤーとの間隔が同じ
//   ⑥ leech     … 0d-2.5 (4) で直した：張り付き判定も端から＝**4方向どこからでも張り付く**。
//                  張り付いた体は**中心**がプレイヤーのセルに合う（左上を合わせると半セルずれる）
//   ⑦ ポーズ絵   … 直す必要あり（層2で作る）：2×2 の9体は Windup/Closed/Cast/Stun の
//                  ポーズ絵を1枚も持たない。⑦は「機構を足したら絵も足す」を強制する番人
//   ⑧ 絵の名前   … 直す必要あり（軽微）：ヒット＆アウェイ（13ボス全部）が `e.sprite` に
//                  向き接尾辞を書くのに、ポーズ差替は接尾辞なしの名前へ戻す＝向きが消える
//   ⑨ DOM       … そのまま使える（wrapper は 2 セル・`.hiding` の痕跡は % 指定∴体に追従）
//   ⑩ 幾何      … この本の算術の前提（アリーナの寸法・G の配置）を固定する

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ENEMY_SPRITES } from '../shared/sprites-enemies.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { isArenaDoor } from './test-arena-doors.js';

const GAME = '/blade-of-lumia/game/';
const TICK_MS = 120;
const BOSS = 'G';                    // 2×2 の代表（岩のゴーレム＝dungeon_1 のボス）

function previewUrl(stage, row, col) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col), ps_weapon: '1',
  });
  return `${GAME}?${p.toString()}`;
}
// 計測用の立ち位置：row 4（通路 rows 7/8 と重ならない）・col 5（東西どちらにも 2×2 を置ける）
const P_ROW = 4, P_COL = 5;
const ARENA = previewUrl('spare_arena', P_ROW, P_COL);

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
 * 2×2 の敵を1体注入して n tick 進め、毎 tick のスナップショットを返す。
 * @param {object} o
 * @param {string} [o.url]   開くプレビュー URL（既定 ARENA）
 * @param {number} o.ex      注入する **左上** の列
 * @param {number} o.ey      注入する **左上** の行
 * @param {number} o.hp      注入 HP（def 0 ∴ dealDamage がそのまま入る）
 * @param {number} o.ticks   進める論理 tick 数
 * @param {object} [o.patch] ENEMY_META[BOSS] へ一時的に差し込む設定
 * @param {Array<[number,number]>} [o.drops] [tick, ダメージ]（その tick の step より前）
 * @param {Array<[number,string[]]>} [o.moves] [tick, 方向列]（その tick の step より前にプレイヤーを動かす）
 */
async function measure2x2(page, o) {
  await gotoFrozen(page, o.url ?? ARENA);
  // 0d-3（7体目 G・2026-08-31）: G の素の meta は `momentum`（慣性）を持つ＝**何も点けなくても
  // 体が滑る**。この本は「機構を1つだけ点けて 2×2 の算術を測る」形∴既定で慣性を切る
  // （切らないと間合いも拍も慣性のせいになり、測っている機構の主張が立たなくなる）。
  // 慣性そのものを測る本（boss-move-variety の G の節）は patch で上書きして点ける。
  const patch = { momentum: null, ...(o.patch ?? {}) };
  return page.evaluate((a) => {
    const g = window.__game;
    if (a.patch) g.setEnemyMetaForTest(a.type, a.patch);
    const id = g.injectEnemy(a.ex, a.ey, a.hp, 2, 2, a.type);
    const find = () => g.getEnemies().find(e => e.id === id);
    const drops = new Map(a.drops ?? []);
    const moves = new Map(a.moves ?? []);
    const samples = [];
    for (let t = 1; t <= a.ticks; t++) {
      if (drops.has(t)) g.dealDamage(id, drops.get(t));
      for (const d of moves.get(t) ?? []) g.movePlayer(d);
      g.step(1);
      const e = find();
      if (!e) break;
      const p = g.getPlayer();
      samples.push({
        t, x: e.x, y: e.y, w: e.w, h: e.h, hp: e.hp, hidden: e.hidden,
        leapPhase: e.leapPhase, dashPhase: e.dashPhase, dashLeft: e.dashLeft,
        blinkPhase: e.blinkPhase, blinkCount: e.blinkCount,
        attached: e.attached, stunUntil: e.stunUntil, sprite: e.sprite,
        speed: e.speed,
        // 0d-2.6: 剣の予告（振り上げ）の窓＝解決の論理時刻。null なら振り上げていない
        swingAt: e.swingAt ?? null,
        attackTimes: { ...(e.attackTimes ?? {}) },
        px: p.x, py: p.y,
      });
    }
    return { gameTime0: 0, samples, player: { x: g.getPlayer().x, y: g.getPlayer().y } };
  }, { ...o, patch, type: BOSS });
}

/** 全 tick で 2×2 のままだったか（1×1 を測って「そのまま使える」と誤結論しないための番人） */
function expectStayed2x2(samples) {
  expect(samples.length, '1 tick も進んでいない').toBeGreaterThan(0);
  expect(new Set(samples.map(s => `${s.w}x${s.h}`)), '測った敵が 2×2 でない').toEqual(new Set(['2x2']));
}
const at = (samples, t) => samples.find(s => s.t === t);

/**
 * 2×2 の body の**端**からプレイヤーまでの距離（hitbox.js enemyEdgeDist と同じ定義）。
 * 0d-2.5 以降の機構はすべてこの距離で発動する∴各本の「間合い」はここから出す
 * （テスト側で左上からの距離を書くと、また向きで 1 セルずれた主張になる）。
 */
function edgeDist(ex, ey, px = P_COL, py = P_ROW) {
  const cx = ex + (2 - 1) / 2, cy = ey + (2 - 1) / 2;   // セル添字基準の中心
  const gx = Math.max(0, Math.abs(px - cx) - 0.5);
  const gy = Math.max(0, Math.abs(py - cy) - 0.5);
  return Math.hypot(gx, gy);
}

// 密着（間に 0 セル＝端から 1.0）と、端から 2.0 離れた位置を4方向ぶん。
// 左上座標は向きごとに違う（西/北は体の幅ぶん手前に置く）が、**端からの距離は同じ**
// ＝この表そのものが「2×2 の間合いは端で測る」の定義（下の②⑥が共有する）。
const AROUND = [
  { label: '東', near: [6, 4], far: [7, 4] },
  { label: '西', near: [3, 4], far: [2, 4] },
  { label: '北', near: [5, 2], far: [5, 1] },
  { label: '南', near: [5, 5], far: [5, 6] },
];

// ── ① hide＝そのまま使える（無敵窓・占有・位置すべて 2×2 で成立）──────────────
// hiddenMs/shownMs = 480ms = 4 tick。tickHide は初回に「隠れ」で始まる（enemy-ai.js:1042）
// ∴tick 1 で hidden=true / _hideUntil = 120+480 = 600 → tick 5（now=600）で出現 →
// tick 9（now=1080）で再び隠れ。ダメージは step の**前**に入れる∴
//   tick 3（隠れ中）＝通らない／tick 7（出ている）＝通る。
test('① hide は 2×2 でもそのまま使える（無敵窓の拍・占有・位置）', async ({ page }) => {
  const r = await measure2x2(page, {
    ex: 8, ey: 4, hp: 100, ticks: 12,
    patch: { speed: 0, hide: { hiddenMs: 480, shownMs: 480, style: 'burrow' } },
    drops: [[3, 10], [7, 10]],
  });
  expectStayed2x2(r.samples);

  const hidden = r.samples.map(s => s.hidden);
  expect(hidden, '隠れ↔出現の拍が 4 tick で切り替わっていない').toEqual(
    [true, true, true, true, false, false, false, false, true, true, true, true]);

  // 無敵窓：隠れ中のダメージは通らない・出ている間のダメージは通る
  expect(at(r.samples, 6).hp, '隠れ中のダメージが通った（無敵窓が効いていない）').toBe(100);
  expect(at(r.samples, 7).hp, '出ているのにダメージが通らない').toBe(90);

  // 占有：隠れは位置を動かさない（左上のまま＝2×2 の箱がずれない）
  expect(new Set(r.samples.map(s => `${s.x},${s.y}`)), '隠れているだけで動いた').toEqual(new Set(['8,4']));
});

// ── ② leap＝0d-2.5 (1) で直した（発動距離が 4方向で対称）────────────────────
// tickLeap のトリガは `enemyEdgeDist`（body の端からの距離）で minRange 1.8 / maxRange 6.0。
// ∴プレイヤーが (row 4, col 5) に立つとき、東西南北どこから測っても：
//   ・密着（間に 0 セル＝端から 1.0）… 1.0 < 1.8 ∴**どの向きでも跳ばない**
//     （初版の実測では西/北からだけ「左上からの距離 2.0」に化けて跳んでいた＝
//      0 セル進んで着地＝密着で滞空の無敵窓だけ得るという、プレイヤーには見えない得）
//   ・端から 2.0 … 1.8 ≤ 2.0 ≤ 6.0 ∴**どの向きでも跳ぶ**
// 拍：windupMs 360 → tick 1 で windup（_leapUntil = 480）・tick 2,3 windup・
//     tick 4 で air（hidden=true・この tick は動かない）・tick 5 から airSpeed 1.0 = 1 セル/tick。
test('② leap の発動距離は 2×2 でも4方向で対称（密着では跳ばない・端から 2.0 で跳ぶ）', async ({ page }) => {
  const patch = { speed: 0, leap: { windupMs: 360, cells: 3, airSpeed: 1.0, cooldownMs: 1000, minRange: 1.8, maxRange: 6.0, style: 'air' } };
  const { minRange, maxRange } = patch.leap;

  // 主張の前提＝表の左上座標は向きで違うのに、端からの距離は 4方向で同じ
  for (const { label, near, far } of AROUND) {
    expect(edgeDist(...near), `${label}の密着が端から 1.0 でない`).toBeCloseTo(1.0, 6);
    expect(edgeDist(...far), `${label}の遠い側が端から 2.0 でない`).toBeCloseTo(2.0, 6);
  }
  expect(1.0, '密着が minRange 未満でない＝この本の主張の前提が崩れた').toBeLessThan(minRange);
  expect(2.0 >= minRange && 2.0 <= maxRange, '端から 2.0 が発動範囲に入らない').toBe(true);

  // 密着＝4方向どこからでも跳ばない（滞空の無敵窓も立たない）
  for (const { label, near } of AROUND) {
    const r = await measure2x2(page, { ex: near[0], ey: near[1], hp: 100, ticks: 6, patch });
    expectStayed2x2(r.samples);
    expect(r.player).toEqual({ x: P_COL, y: P_ROW });
    expect(new Set(r.samples.map(s => s.leapPhase)), `${label}から密着したのに跳んだ＝minRange が向きで変わっている`)
      .toEqual(new Set(['ground']));
    expect(r.samples.some(s => s.hidden), `${label}：跳んでいないのに無敵窓が立った`).toBe(false);
    expect(new Set(r.samples.map(s => `${s.x},${s.y}`)), `${label}：密着で動いた（speed 0 の前提が崩れた）`)
      .toEqual(new Set([`${near[0]},${near[1]}`]));
  }

  // 端から 2.0＝4方向どこからでも同じ拍で跳ぶ
  for (const { label, far } of AROUND) {
    const r = await measure2x2(page, { ex: far[0], ey: far[1], hp: 100, ticks: 4, patch });
    expectStayed2x2(r.samples);
    expect(r.samples.map(s => s.leapPhase), `${label}からの跳躍の拍が算術と合わない`)
      .toEqual(['windup', 'windup', 'windup', 'air']);
    expect(at(r.samples, 4).hidden, `${label}：滞空なのに無敵窓が立っていない`).toBe(true);
    // ⚠️ 一度も隠れていない敵の `hidden` は undefined（setEnemyHidden を通っていない）∴
    //    toBe(false) ではなく falsy で測る
    expect(at(r.samples, 3).hidden, `${label}：溜め中に無敵窓が立った（溜めは殴れる窓）`).toBeFalsy();
  }

  // 滞空の無敵窓と着地の硬直（西からの1本で代表して測る＝拍は上で4方向とも同じと確認済み）。
  // 西（左上 col 2・占有 2-3）から東へ跳ぶ：tick 5 で x 2→3（2 歩）・
  // tick 6 の 1 歩目（x 3.5＝占有 cols 3-5）はプレイヤーのセルを含む∴塞がれて着地（recover）。
  const west = await measure2x2(page, {
    ex: 2, ey: 4, hp: 100, ticks: 12, patch, drops: [[5, 10], [9, 10]],
  });
  expectStayed2x2(west.samples);
  expect(at(west.samples, 5).hp, '滞空中のダメージが通った（無敵窓が効いていない）').toBe(100);
  expect(at(west.samples, 5).x, '滞空で 1 セル進んでいない（跳躍が動いていない）').toBe(3);
  expect(at(west.samples, 6).leapPhase, 'プレイヤーに塞がれて着地していない').toBe('recover');
  expect(at(west.samples, 9).hp, '着地硬直中のダメージが通らない').toBe(90);
});

// ── ③ dash＝0d-2.5 (2) で直した（トリガの車線＝当たりの車線）──────────────────
// tickDash の idle 判断も当たり判定 dashReachHit も**中心基準**＝どちらの車線も
// `alignTol + 半サイズ`（2×2 なら 0.8 + 0.5 = 1.3）＝
//   初版の実測では idle だけ左上基準（±0.8）で、**自分の下の行の前に立つプレイヤーは
//   轢けるのに突進して来なかった**（プレイヤーには見えない安全な面）。
// プレイヤー row 4 に対して（どちらも直交ずれ 0.5 ≤ 1.3 ∴突進する）：
//   ・敵の左上 row 4（占有 4-5・プレイヤーは上の行の正面）
//   ・敵の左上 row 3（占有 3-4・プレイヤーは下の行の正面）
// 走行の算術（どちらも同じ）：windup 3 tick → tick 4 で run（この tick は動かない）→
//   speed 1.5 = 1 tick 3 歩（MOVE_STEP 0.5）・当たりは `along = cx - 5 ≤ hitRange + 0.5 = 1.5`
//   ∴tick 5 で x 8→6.5・tick 6 で 6.0 に達した歩で along = 1.5 → 命中（markAttack が記録を残す）。
// 距離の上下限も端から（`along - halfW`）＝左上基準の 3.5 ではなく 3.0 で測る。
test('③ dash は 2×2 で「突進する車線」と「当たる車線」が一致する（上下どちらの行でも突進）', async ({ page }) => {
  const dash = { windupMs: 360, speed: 1.5, maxCells: 10, alignTol: 0.8, hitRange: 1.0, minRange: 2.0, maxRange: 9.0, stunMs: 1440, cooldownMs: 1200 };
  const patch = { speed: 0, dash };
  const half = (2 - 1) / 2;
  const LANE = dash.alignTol + half;                    // トリガも当たりもこの車線（1.3）

  // 上の行の正面・下の行の正面＝どちらも直交ずれ 0.5 ∴同じ拍で突進して同じ位置で当たる
  for (const [label, ey] of [['上の行', 4], ['下の行', 3]]) {
    const off = Math.abs(P_ROW - (ey + half));
    expect(off, `${label}：直交ずれが車線の内側でない＝この本の前提が崩れた`).toBeLessThanOrEqual(LANE);
    const r = await measure2x2(page, { ex: 8, ey, hp: 100, ticks: 8, patch });
    expectStayed2x2(r.samples);
    expect(r.samples.map(s => s.dashPhase), `${label}：突進の拍が算術と合わない（突進して来ない？）`)
      .toEqual(['windup', 'windup', 'windup', 'run', 'run', 'recover', 'recover', 'recover']);
    expect(at(r.samples, 6).attackTimes['0'], `${label}：当たったのに攻撃として記録されていない`).toBe(6 * TICK_MS);
    expect(at(r.samples, 6).stunUntil, `${label}：プレイヤーに当たったのに気絶した（プレイヤーが壁扱い）`).toBeNull();
    expect(at(r.samples, 6).x, `${label}：当たった位置が算術と合わない`).toBe(6);
  }

  // 車線の**広がりぶん**（`alignTol + halfOff` の `halfOff`）を測る半セルの立ち位置。
  // ⚠️ 上の2件では halfOff を潰しても赤くならない（歯の実測 2026-08-25）＝プレイヤーが
  //    整数セルに居る限り 2×2 の直交ずれは 0.5 か 1.5 しか取れず、広がりの帯
  //    （0.8 < off ≤ 1.3）に**入る立ち位置が存在しない**。∴プレイヤーを半セル下げて
  //    off = |4.5 - 3.5| = 1.0 を作る＝ここだけが「体の下半分の前」を表せる立ち位置。
  //    左上基準（halfOff なし）だと 1.0 > 0.8 で突進して来ない＝当たるのに来ない面が残る。
  const HALF_LANE_OFF = 1.0;
  expect(HALF_LANE_OFF, '半セルの立ち位置が車線の広がりの帯に入っていない')
    .toBeGreaterThan(dash.alignTol);
  expect(HALF_LANE_OFF, '半セルの立ち位置が車線の外＝突進しないのが正しくなってしまう')
    .toBeLessThanOrEqual(LANE);
  const halfLane = await measure2x2(page, {
    ex: 8, ey: 3, hp: 100, ticks: 8, patch, moves: [[1, ['down']]],
  });
  expectStayed2x2(halfLane.samples);
  expect(at(halfLane.samples, 1).py, 'プレイヤーが半セル下がっていない（movePlayer の刻みが変わった？）').toBe(P_ROW + 0.5);
  expect(halfLane.samples.map(s => s.dashPhase), '体の下半分の前（直交ずれ 1.0）に立たれても突進して来ない＝車線が左上基準に戻った')
    .toEqual(['windup', 'windup', 'windup', 'run', 'run', 'recover', 'recover', 'recover']);
  expect(at(halfLane.samples, 6).attackTimes['0'], '半セルずれの立ち位置で当たっていない').toBe(6 * TICK_MS);
  expect(at(halfLane.samples, 6).x, '半セルずれでも命中位置は同じはず').toBe(6);

  // 車線の外（直交ずれ 1.5 > 1.3）＝突進しない。当たり判定も同じ車線∴
  // 「轢けるのに来ない」ではなく「轢けないから来ない」＝プレイヤーの避け方（軸から外れる）が成立する。
  const outsideEy = 2;
  expect(Math.abs(P_ROW - (outsideEy + half)), '車線の外に置けていない＝この本の前提が崩れた').toBeGreaterThan(LANE);
  const outside = await measure2x2(page, { ex: 8, ey: outsideEy, hp: 100, ticks: 20, patch });
  expectStayed2x2(outside.samples);
  expect(new Set(outside.samples.map(s => s.dashPhase)), '車線の外なのに突進した（避け方が成立しない）')
    .toEqual(new Set(['idle']));

  // 「当たりの車線は中心基準」側の裏取り。
  // ⚠️ 既定の alignTol 0.8 では**この差は観測できない**（歯の実測 2026-08-25）＝
  //    当たりの車線（|off| ≤ 0.8 + 0.5）は重なり禁止の帯（左上から -1 〜 +2 列）の**内側**に
  //    完全に収まる∴halfOff を 0 に潰しても、当たり判定をすり抜けた次の歩が
  //    「プレイヤーで進めない」＝接触（tickDash の枝②）で拾われて同じ tick・同じ位置で当たる。
  //    ∴既定値のまま `dashReachHit` の中心補正を潰しても**挙動は変わらない**（重なり禁止が
  //    隠してしまう）。この本が halfOff を測れるのは alignTol を重なりの帯より広く取ったとき。
  // alignTol 1.2・プレイヤーを東へ 2 セル（8 列＝敵の占有 6-7 の外）逃がす：
  //   直交ずれ |8 - 6.5| = 1.5 ≤ 1.2 + 0.5 = 1.7 ∴当たる（左上基準なら 2.0 > 1.2 で当たらない）。
  //   進行方向：along = e.y + 0.5 - 1 ≤ hitRange + 0.5 = 1.5 → e.y ≤ 2.0
  //   tick 5: 6→4.5・tick 6: →3.0・tick 7: 3.0→2.5→2.0 の歩で命中（④と同じ走行の算術）。
  const wide = { speed: 0, dash: { ...dash, alignTol: 1.2 } };
  const graze = await measure2x2(page, {
    url: previewUrl('spare_arena', 1, 6),
    ex: 6, ey: 6, hp: 100, ticks: 9, patch: wide,
    moves: [[2, ['right', 'right']], [3, ['right', 'right']]],
  });
  expectStayed2x2(graze.samples);
  expect(at(graze.samples, 4).px, 'プレイヤーが 2 セル分だけ横へ避けていない').toBe(8);
  // 重なり禁止では説明できない位置＝プレイヤーは占有列（6-7）の外に居る
  expect(8, 'プレイヤーが敵の占有列に入っている＝接触で当たったのか区別できない').toBeGreaterThanOrEqual(6 + 2);
  expect(at(graze.samples, 7).attackTimes['0'], '当たりの車線が中心基準でない（体の右半分を無視した）')
    .toBe(7 * TICK_MS);
  expect(at(graze.samples, 7).stunUntil, '当たったのに壁激突として扱われた').toBeNull();
  expect(at(graze.samples, 7).y, '命中位置が算術と合わない').toBe(2);
});

// ── ④ dash の壁激突＝そのまま使える（気絶窓・占有）──────────────────────
// プレイヤー(row 1, col 6)・敵の左上 (row 6, col 6)＝真南 5 セル → 北へ突進。
// 溜め中（tick 2,3）にプレイヤーを東へ 4 歩（0.5×4 = 2 セル）逃がす＝
//   当たり判定の直交ずれ 8 - 6.5 = 1.5 > alignTol 0.8 + halfOff 0.5 = 1.3 ∴当たらない
// ∴北の壁まで走り切る：tick 5 で y 6→4.5・tick 6 →3.0・tick 7 →1.5・
//   tick 8 で 1.0 まで進み、次の歩 0.5 は占有行 floor(0.5)=0 が壁 → 激突＝
//   stunUntil = 960 + 1440 = 2400（占有は row 0 を踏まない）。
//
// 「凍って何もしない」を主張するには**するはずの行動**を先に用意する必要がある
// （歯の実測 2026-08-25）。ここでは2つ用意した：
//   ・剣（G の attacks[0]・range 1.2）… 激突地点は端から 1.0 ＝**間合いの内側**∴凍結が
//     明けた tick 30 に**即座に**振り上げる（`swingAt` がその tick に立つ）＝ tick 9〜29 の
//     沈黙は「出せないから」ではなく守りのせい。
//     ⚠️ 2026-09-06（0u-2）まではこの証拠を**岩投げ**（attacks[1]・range 6）で採っていた。
//        岩に `minRange 2.0` が入った＝激突地点（端から 1.0）は**下限の内側**∴設計どおり
//        投げない∴証拠には使えなくなった（下でも「投げないこと」を明示して固定する）。
//   ・歩く駆動 … 注入敵は `e.speed = 0`（resolveEnemySpeed は `e.speed ?? meta.speed`
//     ∴meta を patch しても 0）∴ tick 10 に HP を割って G の相（hpThreshold 0.5 /
//     speedMultiplier 1.4）に `e.speed = 0.25×1.4` を書かせる
// 凍結が明ける刻は `endDash(stunMs + cooldownMs)` の硬直＝960 + 1440 + 1200 = 3600（tick 30）。
// ⚠️ 気絶ゲート（enemyTick 先頭の continue・now < 2400）はこの硬直の**内側**＝二重の守り
//    ∴ゲートだけを外しても観測差は出ない（実測済み）。この本が守るのは GUIDE の警告そのもの
//    ＝「気絶が明けた次の tick に即・再突進」の回帰（硬直を cooldown だけに縮めると赤）。
//
// 0d-2.6 以降の剣（attacks[0]・range 1.2・windupMs 360）はこの本では**別の拍**になる：
//   明けた tick 30 に予告（振り上げ）が立つだけ＝`swingAt = 3600 + 360`。ダメージと
//   クールダウンの記録は 3 tick 後（tick 33・3960）＝「予告を経てから当たる」の実測。
// 再突進は**始まらない**＝距離を body の端から測ると 1.5 - 0.5 = 1.0 < minRange 2.0
// （0d-2.5 (2)）＝密着では走らずに剣で殴る、という設計どおり。左上基準だった初版では
// ここが 2.0 = minRange ちょうどで「気絶明けの直後に再突進」と読めていた。
test('④ dash の壁激突と気絶窓は 2×2 でもそのまま使える', async ({ page }) => {
  const STUN_MS = 1440, COOLDOWN_MS = 1200;
  const meta = ENEMY_META[BOSS];
  // 0d-3（2026-08-31）: G の相は**速度を書かなくなった**（慣性 `momentum` に移り、速さは
  // accel/friction/maxSpeed の3つだけが決める＝`speedMultiplier` は書かない設計）∴
  // この本が要る「動く駆動」は patch で作る（測っているのは 2×2 の突進の算術＝G の相の中身
  // ではない。相そのものは tests/boss-phase-behavior.spec.js と boss-move-variety が持つ）。
  const PHASE = { hpThreshold: 0.5, speedMultiplier: 1.4 };
  const PHASE_SPEED = meta.speed * PHASE.speedMultiplier;   // 0.25 × 1.4
  const FREE_AT = (8 * TICK_MS + STUN_MS + COOLDOWN_MS) / TICK_MS;   // 3600ms = tick 30
  // 剣（0d-2.6）の予告は明けた tick に立って WINDUP_TICKS 後に解決する∴観測はそこまで要る。
  // ⚠️ tick 数は**データから導く**（直書きすると予告を延ばした瞬間に観測が足りず、
  //    「解決していない」ではなく `undefined` で落ちる＝0d-2.6 の2回目で実際に踏んだ）。
  const sword = (meta.attacks ?? []).find(a => a.type === 'sword');
  const WINDUP_TICKS = Math.ceil(sword.windupMs / TICK_MS);         // 600ms = 5 tick
  const r = await measure2x2(page, {
    url: previewUrl('spare_arena', 1, 6),
    ex: 6, ey: 6, hp: 100, ticks: FREE_AT + WINDUP_TICKS + 1,
    patch: {
      dash: { windupMs: 360, speed: 1.5, maxCells: 10, alignTol: 0.8, hitRange: 1.0, minRange: 2.0, maxRange: 9.0, stunMs: STUN_MS, cooldownMs: COOLDOWN_MS },
      phases: [PHASE],
    },
    moves: [[2, ['right', 'right']], [3, ['right', 'right']]],
    drops: [[10, 60]],                 // 100 → 40（0.4 ≤ 0.5）＝相が速度を書く
  });
  expectStayed2x2(r.samples);
  expect(at(r.samples, 4).px, 'プレイヤーが軸から外れていない（前提が崩れた）').toBe(8);
  expect(at(r.samples, 8).speed, '激突までは速度 0（走行は dash が動かしている）').toBe(0);

  const crash = at(r.samples, 8);
  expect(crash.stunUntil, '壁に激突したのに気絶していない').toBe(8 * TICK_MS + STUN_MS);
  expect(crash.dashPhase, '激突後に硬直へ入っていない').toBe('recover');
  expect(crash.y, '激突位置が算術と合わない（占有 2 行が壁を踏み越えた？）').toBe(1);
  expect(crash.attackTimes['0'], 'プレイヤーに当たった扱いになっている（避けたのに轢かれた）').toBeUndefined();

  // 凍結中は位置も相も攻撃も動かない（歩く駆動と射程内の剣を持っているのに）
  const during = r.samples.filter(s => s.t > 8 && s.t < FREE_AT);
  expect(new Set(during.filter(s => s.t > 10).map(s => s.speed)),
    '相が速度を書いていない＝「動かない」を主張する前提（動く駆動）が無い').toEqual(new Set([PHASE_SPEED]));
  expect(new Set(during.map(s => `${s.x},${s.y}`)), '凍結中に動いた').toEqual(new Set(['6,1']));
  expect(new Set(during.map(s => s.dashPhase)), '凍結中に次の突進を始めた').toEqual(new Set(['recover']));
  expect(new Set(during.map(s => JSON.stringify(s.attackTimes))), '凍結中に攻撃した')
    .toEqual(new Set(['{}']));

  // 明ける刻は気絶＋硬直の合計ぶん後（＝気絶明け即再突進にならない）。
  expect(at(r.samples, FREE_AT - 1).dashPhase, '硬直が算術より早く明けた（即・再突進の回帰）').toBe('recover');
  expect(at(r.samples, FREE_AT).dashPhase, '硬直が算術どおり明けていない').toBe('idle');
  // 剣（0d-2.6）は明けた tick に**予告が立つだけ**＝WINDUP_TICKS 後に当たる。
  // この予告が「明けた tick に即」立つこと＝間合いの内側で待たされていた＝上の沈黙は守りのせい。
  expect(at(r.samples, FREE_AT).swingAt, '明けたのに剣の予告が立たない'
    + '＝凍結中の沈黙が守りのせいだと言えない')
    .toBe(FREE_AT * TICK_MS + sword.windupMs);
  // 岩（attacks[1]）は明けても投げない＝密着（端から 1.0 < minRange 2.0）では遠隔を出さない
  // （0u-2・`shared/enemies.js` 冒頭の minRange の項）。剣と岩で拍が違うことをここで固定する。
  const stone = (meta.attacks ?? []).find(a => a.type === 'stone');
  expect(stone.minRange, '岩に minRange が無い＝密着でも投げる形に戻っている').toBeGreaterThan(1.0);
  expect(at(r.samples, FREE_AT).attackTimes['1'], '密着なのに岩を投げた（minRange のゲートが効いていない）')
    .toBeUndefined();
  expect(at(r.samples, FREE_AT).attackTimes['0'], '予告なしで剣が当たった（0d-2.6 の予告が消えた）')
    .toBeUndefined();
  expect(at(r.samples, FREE_AT + WINDUP_TICKS).attackTimes['0'], '予告の後に剣が解決していない')
    .toBe((FREE_AT + WINDUP_TICKS) * TICK_MS);

  // 再突進は始まらない＝端から測った距離が minRange 未満（密着では走らずに剣で殴る）。
  const cx = crash.x + (2 - 1) / 2;                              // セル添字基準の中心
  const along = Math.abs(at(r.samples, FREE_AT).px - cx) - (2 - 1) / 2;   // body の端から
  expect(along, '激突地点が minRange の外＝「密着だから走らない」と言えない').toBeLessThan(2.0);
  expect(new Set(r.samples.filter(s => s.t >= FREE_AT).map(s => s.dashPhase)),
    '密着（端から 1.0）なのに再突進を始めた＝距離が左上基準に戻っている').toEqual(new Set(['idle']));

  // 行は 1（占有 1-2）＝壁（row 0）に接して止まっている
  expect(1 + 2 - 1, '占有の下端が算術と合わない').toBe(2);
});

// ── ⑤ blink＝0d-2.5 (3) で直した（出現先の間合いが 4方向で同じ）─────────────────
// pickBlinkCell は「プレイヤーのセルから range セル空けて **body を置く**」＝北/西へ出るときは
// 体の幅ぶん（w-1 / h-1）だけ余分に手前へ下げる∴**手前の端**がどの向きでも range セル離れる。
// プレイヤー (4,5)・range 2 のとき出現先（左上）は
//   北 (1,5)＝占有 rows 1-2 → 間隔 1 行 ／ 南 (6,5)＝占有 rows 6-7 → 間隔 1 行
//   西 (4,2)＝占有 cols 2-3 → 間隔 1 列 ／ 東 (4,7)＝占有 cols 7-8 → 間隔 1 列
// 初版（左上をそのまま pr±range に置く）では北/西だけ 1 セル近かった＝出る向きで間合いが変わり、
// プレイヤーは「北に出たら殴れるが南なら届かない」を絵から読めない。
// 方向は「直前を除く乱択」∴セルの列は予測しない＝**観測した出現先が上の4つのどれかであること**と
// **4方向の間隔がすべて同じこと**を主張する（拍：shown 2 tick → gone 2 tick → 出現の 4 tick 周期）。
// ⚠️ range 3 では北の出現先が row 0（壁）になって候補から落ちる＝北を測れない∴range 2 で測る。
test('⑤ blink は 2×2 でも出現先の間合いが4方向で同じ', async ({ page }) => {
  const RANGE = 2;
  const BACK = 2 - 1;                       // 北/西へ出るときに下げる体の幅（w-1 = h-1）
  const r = await measure2x2(page, {
    ex: 1, ey: 1, hp: 100, ticks: 100,     // 初期位置は出現先4セルのどれとも重ならない所
    patch: { speed: 0, blink: { shownMs: 240, goneMs: 240, castDelayMs: 120, range: RANGE } },
  });
  expectStayed2x2(r.samples);
  const last = r.samples[r.samples.length - 1];
  expect(last.blinkCount, '100 tick で出現回数が足りない（拍の算術が変わった？）').toBeGreaterThanOrEqual(8);

  const DEST = {
    北: [P_ROW - RANGE - BACK, P_COL],
    南: [P_ROW + RANGE, P_COL],
    西: [P_ROW, P_COL - RANGE - BACK],
    東: [P_ROW, P_COL + RANGE],
  };
  const EXPECT = new Set(Object.values(DEST).map(([row, col]) => `${row},${col}`));
  const seen = new Set(r.samples.filter(s => !(s.x === 1 && s.y === 1)).map(s => `${s.y},${s.x}`));
  expect([...seen].filter(k => !EXPECT.has(k)), '出現先が「端から range セル」以外のセルになった').toEqual([]);
  expect(seen.size, '出現方向が偏りすぎて対称性を測れない（乱択の前提が崩れた）').toBeGreaterThanOrEqual(3);

  // 間隔（プレイヤーと占有箱の間に空くセル数）＝4方向すべて range - 1
  const gap = ([row, col]) => (row === P_ROW)
    ? (col < P_COL ? P_COL - (col + 2 - 1) - 1 : col - P_COL - 1)
    : (row < P_ROW ? P_ROW - (row + 2 - 1) - 1 : row - P_ROW - 1);
  for (const [label, dest] of Object.entries(DEST)) {
    expect(gap(dest), `${label}の間隔が算術と合わない`).toBe(RANGE - 1);
  }
  expect(new Set(Object.values(DEST).map(gap)), '出現先の間隔が向きで変わっている').toEqual(new Set([RANGE - 1]));
  // プレイヤーに重なる出現は無い（isPassableForEnemy が塞ぐ）
  for (const k of seen) {
    const [ry, rx] = k.split(',').map(Number);
    expect(rx < P_COL + 1 && rx + 2 > P_COL && ry < P_ROW + 1 && ry + 2 > P_ROW,
      `出現先 (${ry},${rx}) がプレイヤーに重なっている`).toBe(false);
  }
});

// ── ⑥ leech＝0d-2.5 (4) で直した（4方向どこからでも張り付く・体の中心が合う）──────────
// tickLeech の張り付き判定も `enemyEdgeDist`（端からの距離）≤ attachRange 1.1 ∴
// 密着（端から 1.0）なら**東西南北どこからでも**張り付く。
// 「敵は自力でプレイヤーのセルへ踏み込めない∴詰められるのは 1.0 まで」（enemy-ai.js の注意）は
// 1×1 の話だったが、端で測るようになった今は 2×2 でも同じ 1.0 ＝
// attachRange 1.0 未満は**どんな体格でも永久に張り付けない**（GUIDE §3-1 の罠）という
// 1本の規則になった。初版の実測では左上基準で西/北だけ 2.0 に化けて張り付けなかった。
// 張り付いた後は body の**中心**をプレイヤーのセルに合わせる（左上を合わせると体が右下へ
// 半セルずれて「掴んでいる絵」に見えない）∴左上は player - 0.5。
test('⑥ leech は 2×2 でも4方向どこからでも張り付く（体の中心がプレイヤーに合う）', async ({ page }) => {
  const patch = { speed: 0, leech: { attachRange: 1.1, drainMs: 2400, amount: 1, cooldownMs: 1200 } };
  const half = (2 - 1) / 2;

  for (const { label, near } of AROUND) {
    expect(edgeDist(...near), `${label}の密着が端から 1.0 でない`).toBeCloseTo(1.0, 6);
    expect(1.0, '密着が attachRange の外＝この本の前提が崩れた').toBeLessThanOrEqual(patch.leech.attachRange);
    const r = await measure2x2(page, { ex: near[0], ey: near[1], hp: 100, ticks: 6, patch });
    expectStayed2x2(r.samples);
    expect(at(r.samples, 1).attached, `${label}から密着したのに張り付かない（判定距離が向きで変わっている）`).toBe(true);
    // 張り付き先＝body の中心がプレイヤーのセル（左上は半セル手前）
    expect(at(r.samples, 1).x, `${label}：張り付いた体の左上（列）が算術と合わない`).toBe(P_COL - half);
    expect(at(r.samples, 1).y, `${label}：張り付いた体の左上（行）が算術と合わない`).toBe(P_ROW - half);
    expect(at(r.samples, 1).x + half, `${label}：張り付いた 2×2 の中心がプレイヤーの列と合わない`).toBe(P_COL);
    expect(at(r.samples, 1).y + half, `${label}：張り付いた 2×2 の中心がプレイヤーの行と合わない`).toBe(P_ROW);
  }
});

// ── ⑦ ポーズ絵の番人＝機構を足したら絵も足す（層2 で赤くなる本）───────────────
// ポーズ差替（syncLeapSprite / syncShellSprite / syncCastSprite / syncDashSprite）は
// `${meta.sprite}Windup|Closed|Cast|Stun` を要求する。未登録なら `makeSprite` が null を
// 返して**黙って差し替えない**（enemy-ai.js:1654＝敵が消える事故は塞いである）＝
// 機構は動くのに絵が何も変わらない＝GUIDE §6-1（絵が機構を読ませる）違反が無音で通る。
// 2026-08-25 時点で 2×2 の 9 体はポーズ絵を1枚も持たない∴層2 で機構を入れる本人が絵も作る。
test('⑦ leap/shell/blink/dash を持つ敵は対応するポーズ絵を必ず持つ', () => {
  const NEED = { leap: ['Windup'], shell: ['Closed'], blink: ['Cast'], dash: ['Windup', 'Stun'] };
  let checked = 0;
  for (const [t, m] of Object.entries(ENEMY_META)) {
    for (const [mech, suffixes] of Object.entries(NEED)) {
      if (!m[mech]) continue;
      for (const sfx of suffixes) {
        checked++;
        expect(ENEMY_SPRITES[`${m.sprite}${sfx}`],
          `${t}（${m.sprite}）は ${mech} を持つのに ${m.sprite}${sfx} が未登録＝状態が絵に出ない`)
          .toBeTruthy();
      }
    }
  }
  expect(checked, '機構を持つ敵が居ない（データが消えた？）').toBeGreaterThanOrEqual(5);
});

// ── ⑧ ポーズ差替とヒット＆アウェイが `e.sprite` を取り合う（軽微だが直す）──────────
// ❌ 「13 ボス全部が `hitAndAway: true`」は失効（2026-08-31・0d-3 で W/A/N/J/O/U/G の7体が
//    固有の移動機構へ移った＝`hitAndAway: false`）。この本が測るのは**取り合いの規則**
//    そのもの∴代表の G では patch で `hitAndAway: true` を点けて測る（下記）。
// 以下は取り合いの説明（規則自体は変わっていない）＝bossTickHitAndAway は向きが変わった tick に
// `e.sprite = ${base}${D|R|U}` を書く（enemy-ai.js:466-469）。一方ポーズ差替は
// **接尾辞なしの素の名前**へ戻す（`swapEnemySprite(e, base)`）∴機構を持つボスは
// 向き接尾辞を失う（次に向きが変わるまで戻らない）。今の 2×2 は D/R/L/U が同じ絵の
// エイリアス∴見た目は変わらないが、向き別の絵を描いた瞬間に「左へ走りながら正面を向く」になる。
// ⚠️ 測る立ち位置は**突進の車線の外**にする（0d-2.5 (2) 以降、車線は中心基準の
//    `alignTol + 半サイズ` ＝真正面の行に置くと 2×2 は必ず走り出す＝idle で測れない）。
//    左上 (row 6, col 8)＝中心 (6.5, 8.5)・プレイヤー (4,5) に対して
//    直交ずれ |4 - 6.5| = 2.5 > 0.8 + 0.5 = 1.3 ∴突進しない。向きは横成分が大きい∴'R'。
test('⑧ dash を足すと向き接尾辞が失われる（ポーズ差替が素の名前へ戻す）', async ({ page }) => {
  const base = ENEMY_META[BOSS].sprite;
  const EX = 8, EY = 6;
  // 機構なし：ヒット＆アウェイの向き接尾辞が残る（プレイヤーは西∴'R' + flipX）
  const plain = await measure2x2(page, {
    ex: EX, ey: EY, hp: 100, ticks: 4, patch: { speed: 0, hitAndAway: true },
  });
  expect(at(plain.samples, 4).sprite, 'ヒット＆アウェイが向き接尾辞を書いていない（前提が崩れた）')
    .toBe(`${base}R`);

  // 機構あり（突進しない位置＝idle のまま）：素の名前へ戻される
  const withDash = await measure2x2(page, {
    ex: EX, ey: EY, hp: 100, ticks: 4,
    patch: { speed: 0, hitAndAway: true,
      dash: { windupMs: 360, alignTol: 0.8, minRange: 2.0, maxRange: 9.0 } },
  });
  expect(at(withDash.samples, 4).dashPhase, '突進が始まってしまった（この本は idle で測る）').toBe('idle');
  expect(at(withDash.samples, 4).sprite, 'ポーズ差替が向き接尾辞を残している（実装が直った？）').toBe(base);
});

// ── ⑨ 実配置の 2×2 ボスの DOM＝そのまま使える（大きさ・隠れの痕跡）────────────────
// 注入敵は DOM を持たない∴絵/DOM はライブの G（bal_rock_golem = test_mechanics[30,1]・
// 左上 (4,7)）で測る。測るのは2つ：
//   ・wrapper が 2 セル四方（render-chars.js applyEnemySize）＝占有が画面に出ている
//   ・`.hiding` の痕跡（board.css の ::after）は **% 指定**∴2×2 の体に追従して広がる
//     （1 セル固定なら大型敵の足元に小さな染みが出るだけ＝機構が読めない）
test('⑨ 実配置の 2×2 ボスは 2 セルで描かれ、隠れの痕跡も体に追従する', async ({ page }) => {
  await gotoFrozen(page, previewUrl('bal_rock_golem', 4, 2));
  const r = await page.evaluate(() => {
    const g = window.__game;
    const boss = g.getEnemies().find(e => e.type === 'G');
    if (!boss) return { error: 'G が居ない' };
    g.setEnemyMetaForTest('G', { speed: 0, hide: { hiddenMs: 480, shownMs: 480, style: 'burrow' } });
    g.step(1);   // tickHide の初回＝隠れで始まる
    const el = document.getElementById(`char-enemy-${boss.id}`);
    if (!el) return { error: 'ボスの DOM が無い' };
    const cell = document.querySelector('.cell');
    const cellPx = cell.getBoundingClientRect().width;
    const box = el.getBoundingClientRect();
    const after = getComputedStyle(el, '::after');
    return {
      id: boss.id, cellPx, w: box.width, h: box.height,
      cls: [...el.classList], afterW: parseFloat(after.width), afterH: parseFloat(after.height),
      // ⚠️ canvas は大型敵の揺れ（board.css .large-enemy の golem-lumber）で transform が
      //    かかっている∴getBoundingClientRect では 2 セルより小さく出る（実測 -3.7px）。
      //    「wrapper 全面に追従しているか」はレイアウト上の寸法＝offsetWidth で測る。
      canvasW: el.querySelector('canvas.sprite')?.offsetWidth ?? 0,
    };
  });
  expect(r.error).toBeUndefined();
  expect(r.id, 'ライブのボスの id が配置座標と違う（アリーナの前提が崩れた）').toBe('4,7');
  expect(r.cellPx).toBeGreaterThan(4);
  // 2 セル四方（丸めの 1px は許す）
  expect(Math.abs(r.w - 2 * r.cellPx), 'wrapper の幅が 2 セルでない').toBeLessThanOrEqual(1);
  expect(Math.abs(r.h - 2 * r.cellPx), 'wrapper の高さが 2 セルでない').toBeLessThanOrEqual(1);
  expect(Math.abs(r.canvasW - 2 * r.cellPx), 'canvas が wrapper 全面に追従していない').toBeLessThanOrEqual(1);
  // 隠れの痕跡が付き、体（2 セル）に比例して広がっている（board.css: width 76%）
  expect(r.cls, '隠れのクラスが付いていない').toContain('hiding');
  expect(r.cls, 'style ごとの痕跡クラスが付いていない').toContain('hide-burrow');
  expect(r.afterW, '痕跡が 1 セル幅に留まっている＝大型敵の体に追従していない')
    .toBeGreaterThan(r.cellPx * 1.2);
  expect(r.afterH).toBeGreaterThan(0);
});

// ── ⑩ 検証ステージの幾何（GUIDE §4-3＝前提を測る本自身で固定する）─────────────
test('⑩ spare_arena と bal_rock_golem の幾何（この本の算術の前提）', () => {
  const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
  const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  const layer = MAP.layers[TEST_LAYER].stages;

  // ① spare_arena＝注入用（10×12・外周は通路以外すべて壁・内部は素の床・敵なし）
  const sp = layer[stageKey('spare_arena')];
  expect(sp.rows).toBe(10);
  expect(sp.cols).toBe(12);
  expect(sp.enemies ?? [], 'アリーナに敵が置かれた＝注入した1体だけを測れない').toEqual([]);
  for (let r = 0; r < sp.rows; r++) {
    for (let c = 0; c < sp.cols; c++) {
      const edge = r === 0 || c === 0 || r === sp.rows - 1 || c === sp.cols - 1;
      const want = edge && !isArenaDoor(r, c, sp.cols) ? TILE.WALL : TILE.FLOOR;
      expect(sp.tiles[r][c], `spare_arena (${r},${c}) が想定と違う`).toBe(want);
    }
  }
  // 計測に使う行が通路と重ならない（②③⑤⑥は row 4・④は row 1）
  expect(isArenaDoor(P_ROW, 0, sp.cols)).toBe(false);
  expect(isArenaDoor(1, 0, sp.cols)).toBe(false);

  // ② bal_rock_golem＝ライブの 2×2 ボス（左上 (4,7)・占有 rows 4-5 / cols 7-8）
  const bg = layer[stageKey('bal_rock_golem')];
  expect(bg.rows).toBe(10);
  expect(bg.cols).toBe(12);
  expect(bg.tiles[4][7], 'G の配置位置が動いた（⑨の id と占有の前提が崩れる）').toBe('G');
  for (const [r, c] of [[4, 8], [5, 7], [5, 8]]) {
    expect(bg.tiles[r][c], `ボスの占有セル (${r},${c}) が床でない`).toBe(TILE.FLOOR);
  }
  expect(ENEMY_META['G'].size, 'G が 2×2 でない').toEqual({ w: 2, h: 2 });
});
