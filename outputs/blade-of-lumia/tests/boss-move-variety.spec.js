// tests/boss-move-variety.spec.js — Phase 8-4 (4) 0d-3「ボス1体ずつ、移動アルゴリズムを変える」
//
// ユーザーの要件（2026-08-25）＝「次のボスからは**攻撃方法や移動アルゴリズム**のバリエーションを
// 考えた方がよさそう。同じパターンだとつまらなすぎるので。」∴この本が測るのは
// 「固有の攻撃を1つ持っているか」ではなく **「近づき方（移動）が G と違うか」**。
//
// この1本目＝**W 魔物**（1×1・道中の中ボス。`dungeon_1 1,0` / `dungeon_1 3,0` /
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
