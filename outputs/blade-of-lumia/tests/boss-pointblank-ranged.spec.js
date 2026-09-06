// 0u-2（2026-09-06）: ボスの遠隔攻撃は「密着（プレイヤーの剣の間合い）では出さない」の番人。
//
// 由来＝2026-09-03 のユーザーの実プレイ報告（0q・X 魔王について）：
//   「剣を盾で防御した直後に攻撃したいけど、攻撃してる間に石をなげられて避けることが不可能」
// エンジンの事実3つ（一次ソースで確認）：
//   ① `enemyAttack`（game/enemy-ai.js）の攻撃ループは1発撃っても抜けない（`markAttack` の
//      後に `break` が無い）＝近接の予告を始めた同じ tick に遠隔も撃てる。
//   ② 盾は「攻撃している間は下がる」（projectile.js `isShieldActive` が `_atkUntil` と
//      `ATTACK_POSE_MS` の窓で false を返す）＝斬り返している最中の弾は盾で受けられない。
//   ③ 密着（端から 1.2 以内）で撃たれた弾は**その step の中で決着する**＝避ける猶予が
//      0 tick（実測：W/V/L/N/G の石は 20〜40 発すべて猶予 0。当たるか外れるかは
//      プレイヤーの半セルのずれで決まり、プレイヤーの操作では変えられない）。
// ∴ 密着の遠隔は「見てから動けない一撃」＝X／Z に入れた `minRange 2.0` を全ボスへ広げた。
//
// この本が守るもの（3種）：
//   ① データの番人＝ボスの遠隔はすべて `minRange > SWORD_REACH`（例外は「予告つき」だけ）。
//   ② 機構の歯＝密着に固定して遠隔の cooldown を極端に縮めても1発も飛ばない。
//   ③ 逆側の歯＝間合いの外（端から 3.0）では飛ぶ＝下限が遠隔そのものを殺していない。
//
// ⚠️ ②は「自然な往復に任せると密着と cooldown 明けが重ならず、潰しても緑になる」
//    （X-⑩ で実測済みの落とし穴）∴`speed: 0` で密着に据え、cooldown を 10ms に縮める。
// ⚠️ プレビューは debugMode=true（無敵）で始まる∴'g' で切る（切らないと被弾が観測できない）。

import { test, expect } from '@playwright/test';
import { ENEMY_META } from '../shared/enemies.js';
import { SWORD_REACH, MELEE_WINDUP_MS } from '../game/constants.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';
const MELEE = new Set(['sword', 'charge']);

// ボスのタイル → リバランス検証行（y=1）のステージ名。座標は test-stage-keys.js が持ち主。
const ARENA = {
  W: 'bal_monster', V: 'bal_boss', X: 'bal_dark_lord', A: 'bal_fire_salamander',
  L: 'bal_ice_leviathan', N: 'bal_sand_scorpion', J: 'bal_sea_serpent',
  U: 'bal_storm_eagle', G: 'bal_rock_golem', I: 'bal_swamp_toad',
  '{': 'bal_sea_lord', Z: 'bal_zarnel',
};

// 立ち位置＝bal_* 行の決まり（1×1 は (4,8)・2×2 は (4,7) 起点で rows 4-5/cols 7-8）から導く。
//   密着 … 端から 1.0（プレイヤーの剣 SWORD_REACH 1.2 の内側）
//   離れ … 端から 3.0（`minRange` 2.0 の外・どのボスの `range`〈最小 4〉にも収まる）
// ⚠️ `{` 海の主の闘技場だけ rows 4/5 が水（bgTiles）＝水の上には立てない∴南北の乾いた行から測る。
const SPOT = {
  small: { near: { row: 4, col: 7 }, far: { row: 4, col: 5 } },
  large: { near: { row: 4, col: 6 }, far: { row: 4, col: 4 } },
  sea:   { near: { row: 6, col: 7 }, far: { row: 1, col: 7 } },
};

function spotOf(tile) {
  if (tile === '{') return SPOT.sea;
  return (ENEMY_META[tile].size?.w ?? 1) > 1 ? SPOT.large : SPOT.small;
}

// 密着に据えるための追加の押さえ（実体フィールドを直接書く）。
// U 嵐の鷲王は `speed: 0` でも**舞い上がる**（滞空は `tickSoar` が座標を動かす＝速度と別の
// 駆動）＝200 tick のうち密着は 18 tick しか作れなかった∴滞空だけ止めて地上に据える
// （`_soar: null` ＝ `resolveSoar` が null を返す）。下限の検査に滞空は関係ない：急降下は
// `airMaxMs` で**時間から**強制される＝距離では止まらない∴「離れて待てば安全」は作れない。
const NEAR_FIELDS = { U: { _soar: null } };

// 「離れ」の立ち位置の例外＝そのボスの設計が遠隔に割り当てている距離から測る。
// I 沼地の大蝦蟇は舌の帯（`tongue.cells` 5）の中ならプレイヤーを引き寄せる∴3.0 では
// 12 tick で帯の中へ引かれる。毒沫の持ち場は**帯の外**（`cells` 5 < 毒沫の range 7 ＝
// 「帯の外では毒沫が来る」が設計・shared/enemies.js の I の項）∴端から 6.0 で測る。
const FAR_SPOT = { I: { row: 4, col: 1 } };

/** 遠隔で「密着でも撃っていい」例外の条件＝予告が近接の予告以上ある＝見てから動ける。 */
function isTelegraphed(atk) { return (atk.windupMs ?? 0) >= MELEE_WINDUP_MS; }

/** ある META の攻撃表を「どこに書かれていたか」つきで全部並べる（legacy `attack`・フェーズも）。 */
function allAttacks(m) {
  const out = [];
  const push = (where, list) => (list ?? []).forEach((a, i) => a && out.push({ where: `${where}[${i}]`, atk: a }));
  push('attacks', m.attacks);
  if (m.attack) push('attack', [m.attack]);
  (m.phases ?? []).forEach((p, pi) => {
    push(`phases[${pi}].attacks`, p.attacks);
    if (p.attack) push(`phases[${pi}].attack`, [p.attack]);
  });
  return out;
}

/** 下限（`minRange`）が要る遠隔＝近接でない・予告も無い攻撃。 */
function gatedRanged(m) {
  return allAttacks(m).filter(({ atk }) => !MELEE.has(atk.type) && !isTelegraphed(atk));
}

const BOSSES = Object.entries(ENEMY_META).filter(([, m]) => m.isBoss);
// ②③ の対象＝出荷の攻撃表（`attacks`）に下限つきの遠隔を持つボス。ENEMY_META から導出する
// （手書きの表を作らない＝敵を1体足したときに黙って漏れない）。
const RANGED_BOSSES = BOSSES
  .filter(([, m]) => (m.attacks ?? []).some(a => a && !MELEE.has(a.type) && !isTelegraphed(a)))
  .map(([tile, m]) => ({ tile, name: m.name }));

// ── 実時間ループを止めて開く（GUIDE §4-2）───────────────────────
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
 * ボスを1体、指定の立ち位置から n tick 追う。
 * 遠隔の cooldown を `cd` に縮め、`speed: 0` で立ち止まらせる（＝距離を固定する）。
 * 返す samples は post-step の観測（`enemyAttack` は移動後のこの位置で間合いを見る＝GUIDE §7-4）。
 */
async function probeBoss(page, tile, o) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(ARENA[tile]),
    row: String(o.spot.row), col: String(o.spot.col),
    ps_weapon: '1', ps_sword: '0', ps_hearts: '20',
  });
  await gotoFrozen(page, `${GAME}?${p.toString()}`);
  await page.keyboard.press('g');   // debugMode（無敵）を切る＝被弾が観測できる
  return page.evaluate(({ tile, ticks, cd, baseAttacks, fields }) => {
    const g = window.__game;
    if (g.getState().debugMode) return { error: 'debugMode が切れていない（g キーの割り当てが変わった？）' };
    const e0 = g.getEnemies().find(x => x.type === tile);
    if (!e0) return { error: `${tile} が盤面に居ない` };
    const id = e0.id;
    const find = () => g.getEnemies().find(x => x.id === id);
    // ⚠️ スナップショットの `attacks` は**フェーズが差し替えたときだけ**入る（既定 null）
    //    ∴素の攻撃表は Node 側（ENEMY_META）から渡す。
    const base = e0.attacks ?? baseAttacks;
    if (!base?.length) return { error: `${tile} の攻撃表が空` };
    const MELEE = new Set(['sword', 'charge']);
    // ⚠️ `getEnemies()` はスナップショット＝代入は実体に効かない。実体へ直接書く
    //    （`resolveAttackList` は `e._attacks` を META より優先する）。
    const patched = base.map(a => (a && !MELEE.has(a.type) ? { ...a, cooldown: cd } : a));
    g.setEnemyFieldForTest(id, { _attacks: patched, speed: 0, ...(fields ?? {}) });
    // body の端からの距離（`enemyEdgeDist` と同じ式）＝`range`/`minRange` の判定に使う数。
    const edge = (e, p) => {
      const ew = e.w ?? 1, eh = e.h ?? 1;
      const cx = e.x + (ew - 1) / 2, cy = e.y + (eh - 1) / 2;
      return Math.hypot(Math.max(0, Math.abs(p.x - cx) - (ew - 1) / 2),
        Math.max(0, Math.abs(p.y - cy) - (eh - 1) / 2));
    };
    const samples = [];
    const hpStart = g.getPlayer().hp;
    for (let t = 1; t <= ticks; t++) {
      const pre = find();
      if (!pre) break;
      const times0 = pre.attackTimes ?? {};
      g.step(1);
      const post = find();
      if (!post) break;
      const times1 = post.attackTimes ?? {};
      const fired = Object.keys(times1)
        .filter(k => times1[k] !== times0[k])
        .map(Number);
      samples.push({
        t, fired, reach: edge(post, g.getPlayer()), hp: g.getPlayer().hp,
        gameover: g.getState().isGameover ?? false,
      });
    }
    return { attacks: patched, samples, hpStart };
  }, {
    tile, ticks: o.ticks, cd: o.cd ?? 10, fields: o.fields ?? null,
    baseAttacks: ENEMY_META[tile].attacks ?? [],
  });
}

// ── ① データの番人 ───────────────────────────────────────
test('密着遠隔-① ボスの遠隔はすべてプレイヤーの剣の間合いの外でしか出ない（データ）', () => {
  const bad = [];
  for (const [tile, m] of BOSSES) {
    for (const { where, atk } of gatedRanged(m)) {
      if (!(atk.minRange > SWORD_REACH)) {
        bad.push(`${tile} ${m.name} ${where} ${atk.type} minRange=${atk.minRange ?? 'なし'}`);
      }
    }
  }
  expect(bad, '密着（プレイヤーの剣 SWORD_REACH 以内）でも飛ぶ遠隔が残っている＝'
    + `斬り合いの最中に見てから動けない一撃が刺さる: ${JSON.stringify(bad)}`).toEqual([]);
  // 下限は上限より内側であること＝撃てる帯が残っていること（下限 ≥ 射程＝機構の削除）。
  const dead = [];
  for (const [tile, m] of BOSSES) {
    for (const { where, atk } of gatedRanged(m)) {
      if (!(atk.minRange < atk.range)) {
        dead.push(`${tile} ${m.name} ${where} minRange=${atk.minRange} range=${atk.range}`);
      }
    }
  }
  expect(dead, `下限が射程に届いている＝遠隔が一度も撃てない: ${JSON.stringify(dead)}`).toEqual([]);
  // 予告つきの例外が「予告がある」ことに本当に依っているか＝例外を使っている攻撃を数え上げる。
  // 名前で例外表を作らない代わりに、例外が増えたらここで気づく（増やすときは (d) の判断が要る）。
  const exempt = [];
  for (const [tile, m] of BOSSES) {
    for (const { where, atk } of allAttacks(m)) {
      if (MELEE.has(atk.type) || !isTelegraphed(atk)) continue;
      if (atk.minRange > SWORD_REACH) continue;     // 下限もある＝例外に頼っていない
      exempt.push(`${tile} ${where} ${atk.type} windup=${atk.windupMs}`);
    }
  }
  expect(exempt, '密着でも撃てる遠隔（予告つきの例外）の一覧が変わった＝'
    + '新しい遠隔が「予告」を口実に密着へ入り込んでいないか確かめること').toEqual([
    'A attacks[0] breath windup=720',
    'A attack[0] breath windup=720',
  ]);
});

test('密着遠隔-①b 予告の下限は近接の予告と同じ数＝「見てから動ける」の基準を1つにする', () => {
  // 例外の条件（`windupMs >= MELEE_WINDUP_MS`）が近接の予告と同じ数であること＝
  // プレイヤーに要求する反応の速さを攻撃の種類で変えない。
  expect(MELEE_WINDUP_MS, '近接の予告が 0＝「予告つきなら密着でも許す」の基準が消えた')
    .toBeGreaterThan(0);
  const breath = ENEMY_META.A.attacks.find(a => a.type === 'breath');
  expect(breath.windupMs, 'A 炎のサラマンドラの息の予告が近接の予告より短い＝'
    + '「密着の答え」として成り立たない（A は近接を持たない∴ここが唯一の密着の答え）')
    .toBeGreaterThanOrEqual(MELEE_WINDUP_MS);
  expect(ENEMY_META.A.attacks.some(a => MELEE.has(a.type)),
    'A が近接を持つようになった＝息を例外にしている理由（密着の答えが他に無い）が消えた')
    .toBe(false);
});

// ── ②③ 機構の歯（ボスごと）────────────────────────────────
for (const { tile, name } of RANGED_BOSSES) {
  const spot = spotOf(tile);
  const gated = (ENEMY_META[tile].attacks ?? [])
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a && !MELEE.has(a.type) && !isTelegraphed(a));
  const minRange = Math.min(...gated.map(({ a }) => a.minRange ?? 0));

  test(`密着遠隔-② ${tile} ${name}：密着に据えて cooldown を縮めても遠隔を1発も撃たない`,
    async ({ page }) => {
      // 測る前の関門＝下限そのものが在ること（無ければ「違反 0」が自動で成り立つ＝歯が抜ける）
      expect(minRange, `${tile} の遠隔に \`minRange\` が無い＝この本は何も測れない`)
        .toBeGreaterThan(SWORD_REACH);
      const r = await probeBoss(page, tile,
        { spot: spot.near, ticks: 200, cd: 10, fields: NEAR_FIELDS[tile] });
      expect(r.error).toBeUndefined();
      const s = r.samples;
      expect(s.length, '1 tick も進んでいない').toBeGreaterThan(100);
      // 前提＝密着で居た tick が十分あること。割合ではなく実数で見る（機構が自分から動く
      // ボスも居る＝I の舌はプレイヤーを引き寄せ、`{` の突進は自分が動く）。
      const near = s.filter(x => x.reach < SWORD_REACH).length;
      expect(near, `密着（端から ${SWORD_REACH} 以内）に居た tick が ${near}/${s.length} しかない`
        + '＝この本の前提（密着で測る）が崩れている').toBeGreaterThanOrEqual(20);
      // 本題＝下限の内側で遠隔が撃たれた tick は無い
      const gatedIdx = new Set(gated.map(({ i }) => i));
      const violations = s
        .filter(x => x.fired.some(i => gatedIdx.has(i)) && x.reach < minRange)
        .map(x => ({ t: x.t, reach: x.reach.toFixed(2) }));
      expect(violations, `密着（minRange ${minRange} 未満）で遠隔が飛んだ tick: `
        + `${JSON.stringify(violations)}`).toEqual([]);
      // 歯の裏＝ボスは黙っていない（別の攻撃が出た／ダメージが入った）＝
      // 「何も起きない状態を測って緑」になっていないことを同じ本で確かめる。
      const other = s.some(x => x.fired.some(i => !gatedIdx.has(i)));
      const hurt = s.some(x => x.hp < r.hpStart);
      expect(other || hurt, `${tile} は密着で何一つしていない＝下限ではなく別の理由で`
        + '静かになっている（測定の前提が崩れている）').toBe(true);
    });

  test(`密着遠隔-③ ${tile} ${name}：間合いの外（端から 3.0）では遠隔が飛ぶ＝下限が機構を殺していない`,
    async ({ page }) => {
      const r = await probeBoss(page, tile,
        { spot: FAR_SPOT[tile] ?? spot.far, ticks: 150, cd: 10 });
      expect(r.error).toBeUndefined();
      const s = r.samples;
      const gatedIdx = new Set(gated.map(({ i }) => i));
      // 前提＝下限の外に居た tick が十分あること（＝撃つ機会が在った）。ここも実数で見る：
      // I の舌はプレイヤーを引き寄せ、`{` の突進と U の滞空は自分から距離を詰める∴
      // 「離れた場所に立たせた」だけでは全 tick が外側にはならない。
      const outside = s.filter(x => x.reach >= minRange);
      expect(outside.length, `下限（${minRange}）の外に居た tick が ${outside.length}/${s.length}`
        + ' しかない＝撃つ機会そのものが無い＝この本は何も測れない').toBeGreaterThanOrEqual(20);
      const fired = outside.filter(x => x.fired.some(i => gatedIdx.has(i)));
      expect(fired.length, `${tile} の遠隔が下限の外でも一度も飛ばない＝`
        + `\`minRange\`（${minRange}）が遠隔そのものを殺している`).toBeGreaterThan(0);
    });
}
