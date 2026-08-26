// tests/boss-move-variety.spec.js — Phase 8-4 (4) 0d-3「ボス1体ずつ、移動アルゴリズムを変える」
//
// ユーザーの要件（2026-08-25）＝「次のボスからは**攻撃方法や移動アルゴリズム**のバリエーションを
// 考えた方がよさそう。同じパターンだとつまらなすぎるので。」∴この本が測るのは
// 「固有の攻撃を1つ持っているか」ではなく **「近づき方（移動）が G と違うか」**。
//
// 収録するボス（1体ずつ追記していく・番号は追記順）：
//   ①〜⑥ ＝ **W 魔物**（1×1・道中の中ボス）＝間合いの二相 → 後半は回り込みの張り付き
//   ⑦〜⑫ ＝ **A 炎のサラマンドラ**（2×2・D4 炎の神殿のボス）＝車線取り＋円錐ブレス →
//            後半は同じ車線取りが突進に化ける
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
import { SWORD_REACH, MELEE_WINDUP_MS } from '../game/constants.js';
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
 * `bal_monster` の W を n tick 追って、毎 tick の間合い・相・移動型を返す。
 * @param {object} o
 * @param {number} o.ticks    進める論理 tick 数
 * @param {number} [o.dropAt] この tick の step より前に W へ与えるダメージの tick
 * @param {number} [o.dmg]    そのダメージ量
 */
async function trackMonster(page, o) {
  await gotoFrozen(page, previewUrl('bal_monster', PL_ROW, PL_COL));
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
  const r = await trackMonster(page, { ticks: 200, dropAt: 20, dmg: Math.ceil(m.hp / 2) + m.def });
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
  'laneStalk',   // 0d-3（2体目 A）: 車線取りの移動
];
const mechanismsOf = (meta) => new Set(MECHANISM_FIELDS.filter(k => meta[k]));
const attackTypesOf = (meta) => new Set(
  (meta.attacks ?? (meta.attack ? [meta.attack] : [])).map(a => a.type));

test('⑤ 機構の語彙は全部生きている／W の移動機構は G と重ならない', () => {
  // 語彙の番人＝どのフィールドも最低1体が使っている（改名・削除で表が腐るのを防ぐ）
  for (const k of MECHANISM_FIELDS) {
    const users = Object.entries(ENEMY_META).filter(([, m]) => m[k]);
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
