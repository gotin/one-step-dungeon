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
import { SWORD_REACH, MELEE_WINDUP_MS, MOVE_STEP } from '../game/constants.js';
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
  'laneStalk',      // 0d-3（2体目 A）: 車線取りの移動
  'burrowAmbush',   // 0d-3（3体目 N）: 潜行中だけ歩く待ち伏せの移動
  'coil',           // 0d-3（4体目 J）: 中心を決めて周回し輪を縮める移動（寄って来ない）
  'gaze',           // 0d-3（5体目 O）: 印（1拍前の足跡）へ寄る移動（プレイヤーを追わない）
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
// ハート7・木の剣ティア0・盾なし・防具なし）＋`UNLOCKED_AT.dungeon_3`＝弓とブーメラン持ち
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
// D6 のボス直前の想定装備（audit-balance の「D6 火山 / ボス直前 DEF 1・最大HP 20」＝
// ハート10・木の剣ティア0・盾なし・布の服ティア0）＋`UNLOCKED_AT.dungeon_6`＝
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
  expect(m.weakness).toEqual({ type: 'fire', multiplier: 2 });

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
