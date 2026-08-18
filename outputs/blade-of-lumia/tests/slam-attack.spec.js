// tests/slam-attack.spec.js — Phase 5.5k k-7.5「体当たり攻撃（slam）と重なり禁止」
//
// 2026-08-17 のユーザー決定（5項目）を丸ごと固定する本。k-7.5 以前は
// **接触ダメージ**（`checkEnemyContact`＝毎tick プレイヤーと同じセルにいる敵の atk を通す）が
// 「接触専門の敵」の攻撃だった。これを次の形に置き換えた：
//
//   ① 重なりはどの位置であろうと絶対に発生させない
//        … passable.js `overlapArea` の AABB を**プレイヤー側（isPassable）と
//          敵側（isPassableForEnemy）の両方**に掛ける。旧実装は丸めたタイルセル1つで
//          比べていた＝半セル位置では西/北から 0.5 まで詰めて絵が半分重なり、
//          しかも東/南は 1.5 で止まる（向きで不平等）だった。
//   ② 接触だけでは攻撃を受けない
//        … `checkEnemyContact` は削除（enemy-ai.js の墓碑コメントが残る）。
//   ③ 接触攻撃系の敵は「接触位置になるとき」に攻撃モーションを出し、
//      モーション中に隣接していたら攻撃される
//        … `attack:{type:'charge'}` の10種が **予告（windup）→ 解決** の2段になった。
//          予告 = board.css `.slam-windup`（拡大縮小を高速に2往復）＝機構の告知。
//   ④ 剣攻撃と投擲攻撃は盾で防げるが、それ以外の隣接攻撃モーションは盾で防げない
//        … `tickSlam` は `isShieldBlockingDir` を通さない＝体当たりの答えは「下がる」だけ。
//   ⑤ ルピー喰いだけは例外＝プレイヤーに重なってルピーを食べる
//        … `e._attached` の敵だけ重なり禁止から除外する（張り付き中は吸うのが攻撃）。
//
// この本は**体当たりそのものの機構**の番人。デバフの窓（呪い火の封印・毒沼ヒルの毒）は
// tests/player-debuff-enemies.spec.js、被弾で起きる敵側の変化（分裂・張り付き）は
// tests/hit-trigger-enemies.spec.js が持つ。
//
// 検証ステージ＝test_mechanics[39,0] `curse_fire`（ψ 呪い火）を主に使う。
//   ・アリーナは 12×10（内側 x1..10 / y1..8。rows 7/8 は隣のアリーナへの東西通路＝x11 も床）
//   ・敵は (4,9)＝x9,y4 の1体だけ・速度 0.5・atk 1・遠隔攻撃を持たない
//     ∴「体当たり以外のダメージ源が無い」＝HP の変化がそのまま体当たりの証拠になる
//   ・張り付きの例外（決定⑤）だけ test_mechanics[36,0] `rupee_eater`（σ）を使う
//
// tick 換算（TICK_MS=120・step() が論理時間を 120ms 進める・tick i の now = 120×i）：
//   到達距離 SLAM_RANGE 1.5 ／ 予告 SLAM_WINDUP_MS 280 ＝ 3 tick 後に解決
//   クールダウン SLAM_COOLDOWN_MS 900 ＝ 8 tick ∴当たり→次の当たりは 11 tick 間隔
//   ⚠ クールダウンの初期値は 0（`_attackTimes` が空）＝**now 900 までは最初の予告が出ない**
//     ∴隣に置き続ける測り方では t8 予告→t11 被弾になる（到達した tick ではない）。
//     「到達した tick に予告が立つ」を測る本は**歩いて来させる**（now が 900 を過ぎている）。
//   呪い火は (4,4) 立ち＝dist 5.0・速度 0.5 ∴ 14 tick で到達距離・17 tick で被弾（実測）。
//
// ⚠ プレビュー（fromEditor=1）は debugMode:true ＝ takeDamage が早期 return し
//   isPassable も無条件 true を返す∴**HP を測る本と踏み込みを測る本は 'g' で debug を切る**。
//   予告・解決そのもの（`slamAt` の遷移）と敵側の重なり禁止は debug の影響を受けない。
// ⚠ 計測は1回の evaluate 内で完結させる（実時間ループも gameTime を進めるため）。
//   実時間ループは `gotoFrozen()` でそもそも起動させない。
//
// ── 歯の実測（2026-08-17・機構を1つずつ壊して赤くなる本を数えた。
//    計測は .scratch/probe-slam-teeth.mjs＝置換→spec 実行→復元を1機構ずつ）──────────
//   constants.js SLAM_WINDUP_MS を 0 にする（＝予告を飛ばす） ………………… ③④
//   enemy-ai.js tickSlam の解決時の再判定（slamReachHit）を消す ……………… ⑬（避けられない）
//   enemy-ai.js tickSlam のクールダウン記録（markAttack）を消す ……………… ④（毎tick被弾）
//   enemy-ai.js tickSlam の `e.hidden` 空振りを消す ………………………………… ⑪
//   enemy-ai.js tickSlam に `isShieldBlockingDir` を通す（盾で防げるようにする）… ⑨
//   enemy-ai.js の stun で `_slamAt` を消す処理を削る ……………………………… ⑩
//   enemy-ai.js syncSlamMotion（class の付け外し）を削る ………………………… ③
//   enemy-ai.js tickLeech のプレイヤー位置への代入を削る ………………………… ⑫
//   constants.js SLAM_RANGE を 0.9 に戻す（＝隣接に届かない） … ②③④⑤⑥⑦⑨⑩⑪⑬（10本）
//   passable.js isPassableForEnemy の重なり禁止を消す ……………………………… ⑥⑦
//   passable.js isPassable の重なり禁止を消す ………………………………………… ⑧
//   board.css `.slam-windup` 規則を無効化 ……………………………………………… ②
// ※ ①⑤⑭ はデータ／純関数の番人（実行時の機構ではない）∴上の破壊では動かない。
// ※ passable.js isPassable の `if (e._attached) continue;`（決定⑤の除外）を消しても
//   **赤くならない**＝張り付き中はどの向きへ動いても重なりが減る（＝「重なりが減る動きは
//   許す」規則で通る）∴あの除外は保険。決定⑤の実効部分＝「張り付きが重なりを作れること」は
//   tickLeech のプレイヤー位置への代入で、その番人が⑫。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TICK_MS, SLAM_RANGE, SLAM_WINDUP_MS, SLAM_COOLDOWN_MS } from '../game/constants.js';
import { overlapArea } from '../game/passable.js';
import { createEnemyAi } from '../game/enemy-ai.js';
import { waitForBoard } from './helpers.js';
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

// 呪い火のアリーナ。row/col は**プレイヤーの立ち位置**（敵は常に (4,9)＝x9,y4）。
const CURSE = (row, col, extra) => previewUrl('curse_fire', row, col, extra);
const EATER = (extra) => previewUrl('rupee_eater', 4, 8, extra);

const CURSE_M = () => ENEMY_META[TILE.CURSE_FIRE];
const WINDUP_TICKS   = Math.ceil(SLAM_WINDUP_MS / TICK_MS);      // 280/120 → 3
const COOLDOWN_TICKS = Math.ceil(SLAM_COOLDOWN_MS / TICK_MS);    // 900/120 → 8

// 実時間ループ（game.js startGameLoop = setInterval(() => step(1), TICK_MS)）を
// ページ評価の**前に**無効化する（k-4〜k-7 spec と同じ仕掛け）。
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

const BOARD_CSS = readFileSync(fileURLToPath(new URL('../game/css/board.css', import.meta.url)), 'utf8');

test.describe('Phase 5.5k k-7.5 – 体当たり攻撃（slam）と重なり禁止', () => {

  test('① 全ての敵が攻撃手段を持ち、接触専門の10種は charge（無害な置物を作らない）', () => {
    // 決定②で接触ダメージを消した＝「攻撃を持たない敵」を残すと**触っても何も起きない置物**
    // になる（k-7.5 の最大の事故）。名簿の側でそれを禁じる。
    const noAttack = Object.entries(ENEMY_META)
      .filter(([, m]) => !(m.attack || (m.attacks?.length ?? 0) > 0))
      .map(([tile]) => tile);
    expect(noAttack, '攻撃手段を持たない敵がいる＝接触廃止で無害な置物になっている').toEqual([]);

    // 旧「接触専門」＝体当たり（charge）に移した10種。この一覧が縮むのは
    // 「誰かの攻撃が別の型に変わった」＝設計変更のときだけ（黙って減らさない）。
    const CHARGE = [
      TILE.PATROL, TILE.CHASER, TILE.LEAP_SPIDER, TILE.BAT_SWARM, TILE.FIRE_TURTLE,
      TILE.SPLIT_SLIME, TILE.RUPEE_EATER, TILE.CURSE_FIRE, TILE.POISON_LEECH, TILE.FISH_SCHOOL,
    ];
    for (const tile of CHARGE) {
      const m = ENEMY_META[tile];
      const list = m.attacks ?? (m.attack ? [m.attack] : []);
      expect(list.some(a => a.type === 'charge'), `'${tile}' が体当たり（charge）を持たない`).toBe(true);
    }
    const charge = Object.entries(ENEMY_META)
      .filter(([, m]) => (m.attacks ?? (m.attack ? [m.attack] : [])).some(a => a.type === 'charge'))
      .map(([tile]) => tile);
    expect(charge.sort(), '体当たりを持つ敵の顔ぶれが変わった').toEqual([...CHARGE].sort());
  });

  test('② 予告の定数と拡大縮小モーションの CSS（機構の告知が消えていない）', () => {
    // 予告は「見て避けられる長さ」でなければ機構として成立しない＝2 tick 以上。
    expect(WINDUP_TICKS, '予告が 1 tick で終わる＝見て避けられない').toBeGreaterThanOrEqual(2);
    // クールダウンは予告より長い＝毎tick 予告が立ち続けない。
    expect(SLAM_COOLDOWN_MS, 'クールダウンが予告より短い＝連続で殴られる').toBeGreaterThan(SLAM_WINDUP_MS);
    // 到達距離は「隣接（1.0）に届く」かつ「1セル飛ばして届かない（2.0 未満）」。
    expect(SLAM_RANGE, '隣接に届かない到達距離').toBeGreaterThanOrEqual(1.0);
    expect(SLAM_RANGE, '2セル先から殴れてしまう到達距離').toBeLessThan(2.0);

    expect(BOARD_CSS, '.slam-windup の規則が無い＝予告が見えない').toContain('.char-abs.slam-windup canvas.sprite');
    expect(BOARD_CSS, 'enemy-slam アニメーションが無い').toMatch(/animation:\s*enemy-slam\s+var\(--slam-pulse-ms/);
    expect(BOARD_CSS, '2往復（iteration-count 2）でない＝予告の長さと合わない')
      .toMatch(/animation:\s*enemy-slam\s+var\(--slam-pulse-ms[^;]*\s2;/);
    const kf = BOARD_CSS.match(/@keyframes enemy-slam\s*\{[^}]*\}[^}]*\}[^}]*\}/)?.[0] ?? '';
    expect(kf, '@keyframes enemy-slam が無い').toContain('@keyframes enemy-slam');
    expect(kf, '拡大縮小していない（scale が無い）').toMatch(/scale\(/);
  });

  test('③ 予告→解決の時系列（到達した tick は無傷・予告中も無傷・解決で被弾）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 敵と同じ行の (4,4)＝dist 5.0 に立って**歩いて来させる**（クールダウンの初期値 0 の
    // 影響を避ける＝到達する頃には now が 900 を過ぎている）。HP を測るので debug は切る。
    await gotoFrozen(page, CURSE(4, 4));
    await page.keyboard.press('g');

    const res = await page.evaluate(({ range }) => {
      const g = window.__game, p = g.getPlayer();
      g.pause();
      const t0 = g.getState().gameTime;
      const startHp = g.getState().player.hp;
      const tr = [];
      for (let i = 1; i <= 25; i++) {
        g.step(1);
        const s = g.getState(), e = g.getEnemies()[0];
        const el = document.getElementById(`char-enemy-${e.id}`);
        tr.push({
          i, t: s.gameTime,
          dist: +Math.hypot(e.x - p.x, e.y - p.y).toFixed(3),
          slamAt: e.slamAt ?? null,
          windupMs: e.slamWindupMs ?? null,
          hp: s.player.hp,
          cls: !!el?.classList.contains('slam-windup'),
          pulse: el?.style.getPropertyValue('--slam-pulse-ms') || '',
        });
        if (s.player.hp < startHp) break;
      }
      return { t0, startHp, tr };
    }, { range: SLAM_RANGE });

    expect(res.t0, '前提：計測開始時点で論理時間が進んでいない').toBe(0);
    // ⚠ debug が切れていない（'g' が効いていない）場合は takeDamage が早期 return する＝
    //   下の「解決の tick に atk 減る」が赤くなる∴前提の assert は要らない。

    // 予告が立った tick と、解決した tick（＝直前が予告中で自分は null）を拾う
    const startIdx   = res.tr.findIndex(r => r.slamAt != null);
    const resolveIdx = res.tr.findIndex((r, i) => i > 0 && r.slamAt == null && res.tr[i - 1].slamAt != null);
    expect(startIdx, '予告が一度も立たない（体当たりが出ていない）').toBeGreaterThanOrEqual(0);
    expect(resolveIdx, '予告が解決しない').toBeGreaterThan(startIdx);
    const start = res.tr[startIdx], resolve = res.tr[resolveIdx];

    // ③-a 予告は「到達距離に入った tick」に立つ（その1 tick 前はまだ距離の外）
    expect(start.dist, '到達距離の外で予告が立った').toBeLessThanOrEqual(SLAM_RANGE + 1e-9);
    expect(res.tr[startIdx - 1].dist, '到達距離に入る前の tick で既に到達していた（前提が崩れている）')
      .toBeGreaterThan(SLAM_RANGE);

    // ③-b 到達した tick と予告中は**無傷**＝「隣接した瞬間にダメージ」ではない（決定②③）
    for (const r of res.tr.slice(0, resolveIdx)) {
      expect(r.hp, `tick${r.i}（予告中/到達直後）でダメージを受けた＝接触即ダメージに戻っている`)
        .toBe(res.startHp);
    }
    // ③-c 解決の tick に atk ぶんだけ減る
    expect(res.startHp - resolve.hp, '解決の tick のダメージが atk と違う').toBe(CURSE_M().atk);
    // ③-d 予告の長さ＝SLAM_WINDUP_MS（tick 換算）
    expect(resolveIdx - startIdx, '予告の長さが SLAM_WINDUP_MS と合わない').toBe(WINDUP_TICKS);
    expect(start.windupMs, '予告の長さがインスタンスに乗っていない').toBe(SLAM_WINDUP_MS);
    expect(start.slamAt - start.t, '解決の時刻が「今＋予告の長さ」でない').toBe(SLAM_WINDUP_MS);

    // ③-e 拡大縮小モーションは**予告中だけ**出る（解決後まで残ると機構の告知にならない）
    for (let i = 0; i < res.tr.length; i++) {
      const r = res.tr[i];
      expect(r.cls, `tick${r.i} の .slam-windup が予告状態（slamAt=${r.slamAt}）と食い違う`)
        .toBe(r.slamAt != null);
    }
    // 1往復の長さ＝予告の半分（CSS の iteration-count 2 とセット）
    expect(start.pulse, '--slam-pulse-ms が予告の半分でない')
      .toBe(`${Math.round(SLAM_WINDUP_MS / 2)}ms`);
    expect(errors).toEqual([]);
  });

  test('④ クールダウン＝当たり→当たりは 11 tick 間隔（張り付かれても毎tick被弾しない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 毎tick 敵の西隣（dist 1.0）へ置き直す＝一番厳しい状況。HP は見ないので debug のまま
    // （封印の窓＝呪い火の inflict が「解決した」印になる）。
    await gotoFrozen(page, CURSE(4, 4));

    const res = await page.evaluate(() => {
      const g = window.__game, p = g.getPlayer();
      g.pause();
      const resolves = [], seals = [];
      let prev = null;
      for (let i = 1; i <= 40; i++) {
        const e0 = g.getEnemies()[0];
        p.x = e0.x - 1; p.y = e0.y;
        g.step(1);
        const s = g.getState(), e = g.getEnemies()[0];
        const slamAt = e.slamAt ?? null;
        if (prev != null && slamAt == null) { resolves.push(i); seals.push(s.player.sealUntil ?? null); }
        prev = slamAt;
      }
      return { resolves, seals };
    });

    expect(res.resolves.length, '40 tick で体当たりが2回も解決しない').toBeGreaterThanOrEqual(2);
    const gaps = res.resolves.slice(1).map((v, i) => v - res.resolves[i]);
    for (const gap of gaps) {
      expect(gap, `当たり→当たりの間隔が ${COOLDOWN_TICKS + WINDUP_TICKS} tick でない（毎tick被弾／間隔が伸びた）`)
        .toBe(COOLDOWN_TICKS + WINDUP_TICKS);
    }
    // 解決のたびにデバフ（呪い火＝封印）が立ち直る＝「解決＝攻撃が通った」の裏取り
    for (const seal of res.seals) expect(seal, '解決したのに封印が立っていない').not.toBeNull();
    expect(errors).toEqual([]);
  });

  test('⑤ 到達判定は4方向で同じ間合い（slamReachHit・純関数）', () => {
    // 旧実装の欠陥は「向きで不平等」だった（西/北は 0.5 まで詰め・東/南は 1.5 で止まる）。
    // 到達判定そのものが向きに依らないことを純関数で固定する。
    const ai = createEnemyAi({ getPlayer: () => ({ x: 0, y: 0 }), getEnemies: () => [] });
    const e = { x: 0, y: 0 };
    const DIRS = [['西', -1, 0], ['東', 1, 0], ['北', 0, -1], ['南', 0, 1]];
    for (const [name, dx, dy] of DIRS) {
      for (const d of [1.0, SLAM_RANGE]) {
        expect(ai.slamReachHit(e, { x: dx * d, y: dy * d }, SLAM_RANGE),
          `${name} 側の距離 ${d} に届かない`).toBe(true);
      }
      const out = SLAM_RANGE + 0.1;
      expect(ai.slamReachHit(e, { x: dx * out, y: dy * out }, SLAM_RANGE),
        `${name} 側の距離 ${out}（到達距離の外）に届いてしまう`).toBe(false);
    }
    // 十字の間合い（箱ではない）＝主軸ぴったりでも直交方向に 0.8 を超えてずれたら届かない
    expect(ai.slamReachHit(e, { x: 1.0, y: 0.8 }, SLAM_RANGE), '直交 0.8 のずれが届かない').toBe(true);
    expect(ai.slamReachHit(e, { x: 1.0, y: 0.9 }, SLAM_RANGE), '斜めから殴れてしまう（十字でなく箱）').toBe(false);
  });

  // ── 重なり禁止（決定①）────────────────────────────────────
  // 敵側：プレイヤーを固定して寄らせ、①重なり面積の最大 ②最接近距離 を測る。
  // 同時に「それでも体当たりは当たる」（封印が立つ）を測る＝**近づけないだけの敵**に
  // なっていないことの裏取り（到達距離 1.5 と最接近 1.0 の関係が壊れたら赤くなる）。
  const APPROACH = [
    // [名前, プレイヤーの立ち位置]（敵は (9,4)。rows 7/8 は東西通路＝x11 も床）
    ['敵が東から来る（プレイヤーは西側）', 6, 4],
    ['敵が南から来る（プレイヤーは北側）', 9, 1],
    ['敵が北から来る（プレイヤーは南側）', 9, 7],
    ['敵が西から来る（プレイヤーは東側・通路 row7）', 10, 7],
  ];
  const APPROACH_HALF = [
    ['敵が東から来る（半セル）', 6.5, 4.5],
    ['敵が南から来る（半セル）', 9.5, 1.5],
    ['敵が北から来る（半セル）', 9.5, 7.5],
    ['敵が西から来る（半セル・通路 row7/8）', 10.5, 7.5],
  ];

  // 1ケース＝1ページ（敵の位置とクールダウンを初期化するため）。
  async function measureApproach(page, px, py) {
    await gotoFrozen(page, CURSE(4, 4));
    return page.evaluate(({ px, py }) => {
      const g = window.__game, p = g.getPlayer();
      g.pause();
      const ov = (ax, ay, aw, ah, bx, by) => {
        const ox = Math.min(ax + aw, bx + 1) - Math.max(ax, bx);
        const oy = Math.min(ay + ah, by + 1) - Math.max(ay, by);
        return (ox > 0 && oy > 0) ? +(ox * oy).toFixed(3) : 0;
      };
      let maxOverlap = 0, minDist = 99, sealed = false;
      for (let i = 0; i < 50; i++) {
        p.x = px; p.y = py;
        g.step(1);
        const e = g.getEnemies()[0];
        if (!e) break;
        maxOverlap = Math.max(maxOverlap, ov(e.x, e.y, e.w ?? 1, e.h ?? 1, px, py));
        minDist = Math.min(minDist, +Math.hypot(e.x - px, e.y - py).toFixed(3));
        if (g.getState().player.sealUntil != null) sealed = true;
      }
      return { maxOverlap, minDist, sealed };
    }, { px, py });
  }

  for (const [label, list] of [['⑥ 整数位置', APPROACH], ['⑦ 半セル位置', APPROACH_HALF]]) {
    test(`${label}：敵はプレイヤーに重ならない（最接近 1.0）が、体当たりは当たる`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      for (const [name, px, py] of list) {
        const r = await measureApproach(page, px, py);
        expect(r.maxOverlap, `${name}：敵の絵がプレイヤーに重なった（面積 ${r.maxOverlap}）`).toBe(0);
        expect(r.minDist, `${name}：最接近が 1.0 未満（めり込んでいる）`).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(r.minDist, `${name}：1.0 まで詰めて来ない（重なり禁止が過剰＝近づけない敵）`)
          .toBeLessThanOrEqual(1.2);
        expect(r.sealed, `${name}：詰めても体当たりが当たらない（到達距離が最接近に届いていない）`).toBe(true);
      }
      expect(errors).toEqual([]);
    });
  }

  test('⑧ プレイヤー側も踏み込めない（どの向き・どの位置から歩いても最接近 1.0）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, CURSE(4, 4));
    await page.keyboard.press('g');   // debug OFF（すり抜け解除）

    const res = await page.evaluate(() => {
      const g = window.__game, p = g.getPlayer();
      g.pause();
      const e = g.getEnemies()[0];      // (9,4)。step() を呼ばないので動かない
      const ov = (ax, ay, bx, by) => {
        const ox = Math.min(ax + 1, bx + 1) - Math.max(ax, bx);
        const oy = Math.min(ay + 1, by + 1) - Math.max(ay, by);
        return (ox > 0 && oy > 0) ? +(ox * oy).toFixed(3) : 0;
      };
      const out = [];
      // 東から西へ（x=10.5 は列11＝壁を含むので使わない）／西から東へ／南から北へ／北から南へ
      const CASES = [
        ['left', 10, 4], ['left', 10, 4.5],
        ['right', 5, 4], ['right', 5.5, 4], ['right', 5, 4.5],
        ['up', 9, 8], ['up', 9.5, 8], ['up', 9, 7.5],
        ['down', 9, 1], ['down', 9.5, 1], ['down', 9, 1.5],
      ];
      for (const [dir, sx, sy] of CASES) {
        p.x = sx; p.y = sy;
        let maxOverlap = 0, minDist = 99;
        for (let i = 0; i < 20; i++) {
          g.movePlayer(dir);
          maxOverlap = Math.max(maxOverlap, ov(p.x, p.y, e.x, e.y));
          minDist = Math.min(minDist, +Math.hypot(p.x - e.x, p.y - e.y).toFixed(3));
        }
        out.push({ dir, sx, sy, maxOverlap, minDist, end: [p.x, p.y] });
      }
      return { enemy: [e.x, e.y], cases: out };
    });

    // ⚠ debug が切れていない場合 isPassable が常に true ＝敵をすり抜ける∴下の overlap が
    //   0 でなくなる（前提の assert は要らない＝この本自体が 'g' の効きの番人でもある）。
    for (const c of res.cases) {
      const name = `${c.dir} start(${c.sx},${c.sy})`;
      expect(c.maxOverlap, `${name}：敵に重なって歩けた（面積 ${c.maxOverlap}）`).toBe(0);
      expect(c.minDist, `${name}：最接近が 1.0 未満（半セルめり込んだ＝旧実装の欠陥）`)
        .toBeGreaterThanOrEqual(1 - 1e-9);
      expect(c.minDist, `${name}：隣（1.0）まで歩けない＝敵に近づけない`).toBeLessThanOrEqual(1.2);
    }
    expect(errors).toEqual([]);
  });

  test('⑨ 体当たりは盾で防げない（対照＝同じ向きの投擲物は防げる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 決定④＝盾が効くのは剣攻撃と投擲攻撃だけ。体当たりの答えは「下がる」しかない。
    await gotoFrozen(page, CURSE(4, 4, { ps_shield: '1' }));
    await page.keyboard.press('g');   // HP を測るので debug OFF

    const res = await page.evaluate(() => {
      const g = window.__game, p = g.getPlayer();
      g.pause();
      const out = { shield: !!g.getPlayer().shield };
      // ── 対照：右を向いて右から来る投擲物 → 盾でブロック（無傷）
      g.setHeroDir('right');
      const hp0 = g.getState().player.hp;
      g.injectEnemyProjectile(p.x + 1, p.y, -1, 0, 1, 2);
      for (let i = 0; i < 4; i++) g.step(1);
      out.hpAfterArrow = g.getState().player.hp;
      out.arrowLoss = hp0 - out.hpAfterArrow;
      out.projLeft = g.getProjectiles().length;
      // ── 本題：同じく右を向いたまま（盾は敵の側を向いている）体当たりを待つ
      out.slamLoss = 0;
      for (let i = 0; i < 20; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x - 1; p.y = e.y;
        g.setHeroDir('right');
        g.step(1);
        const hp = g.getState().player.hp;
        if (hp < out.hpAfterArrow) { out.slamLoss = out.hpAfterArrow - hp; out.slamTick = i + 1; break; }
      }
      out.blockEffects = document.querySelectorAll('.shield-block').length;
      return out;
    });

    expect(res.shield, '前提：ps_shield=1 で盾を持っている').toBe(true);
    expect(res.arrowLoss, '対照が成立しない＝投擲物を盾で防げていない（盾の向き判定が壊れている）').toBe(0);
    expect(res.projLeft, '対照が成立しない＝ブロックした投擲物が消えていない').toBe(0);
    expect(res.slamLoss, '盾を向けている側からの体当たりを防いでしまった（決定④に反する）')
      .toBe(CURSE_M().atk);
    expect(errors).toEqual([]);
  });

  test('⑩ 予告はスタンで消える（解決前に殴れば無かったことになる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, CURSE(4, 4));
    await page.keyboard.press('g');   // HP を測るので debug OFF

    const res = await page.evaluate(() => {
      const g = window.__game, p = g.getPlayer();
      g.pause();
      // 隣に置き続けて予告が立つのを待つ
      let armed = null;
      for (let i = 1; i <= 20; i++) {
        const e0 = g.getEnemies()[0];
        p.x = e0.x - 1; p.y = e0.y;
        g.step(1);
        const e = g.getEnemies()[0];
        if (e.slamAt != null) { armed = { tick: i, slamAt: e.slamAt, id: e.id }; break; }
      }
      if (!armed) return { armed: null };
      const hp0 = g.getState().player.hp;
      g.stunEnemy(armed.id, 600);       // 5 tick ぶんのスタン（ブーメラン相当）
      const tr = [];
      for (let i = 1; i <= 5; i++) {
        const e0 = g.getEnemies()[0];
        p.x = e0.x - 1; p.y = e0.y;     // 隣に居続ける（それでも当たらないことが主張）
        g.step(1);
        const s = g.getState(), e = g.getEnemies()[0];
        tr.push({ i, t: s.gameTime, slamAt: e.slamAt ?? null, hp: s.player.hp });
      }
      return { armed, hp0, tr };
    });

    expect(res.armed, '予告が立たない（前提が崩れている）').toBeTruthy();
    expect(res.tr[0].slamAt, 'スタンしても予告が残っている（スタン中に解決してしまう）').toBeNull();
    // 本来の解決時刻を跨いでも無傷＝予告そのものが消えている
    const past = res.tr.filter(r => r.t >= res.armed.slamAt);
    expect(past.length, '本来の解決時刻を跨いでいない（前提が崩れている）').toBeGreaterThan(0);
    for (const r of res.tr) {
      expect(r.hp, `スタン中の tick${r.i} で体当たりを受けた`).toBe(res.hp0);
    }
    expect(errors).toEqual([]);
  });

  test('⑪ 隠れている間に予告が解決したら空振り（tickSlam 単体・DOM 不要）', () => {
    // 旧 tests/sea-enemies.spec.js ⑤ / tests/hide-window-enemies.spec.js ⑥ の主張の移設先。
    // 潜行（潜み鮫）・地中（地中蟲）・滞空（跳躍蜘蛛）は「無敵だが攻撃もされない」窓＝
    // 予告が立った後に隠れたら空振りにしないと「隠れながら殴る」敵になる。
    const calls = [];
    const player = { x: 8, y: 4 };
    const meta = ENEMY_META[TILE.CURSE_FIRE];
    const enemy = { id: 'e1', type: TILE.CURSE_FIRE, x: 9, y: 4, hidden: true, _slamAt: 1000, _slamIdx: 0 };
    const ai = createEnemyAi({
      getPlayer: () => player,
      getEnemies: () => [enemy],
      takeDamage: (amt) => calls.push(amt),
    });

    expect(ai.tickSlam(enemy, meta, 999), '予告中は true（この tick を専有する）').toBe(true);
    expect(calls, '予告中にダメージが出た').toEqual([]);

    expect(ai.tickSlam(enemy, meta, 1000), '解決の tick は true').toBe(true);
    expect(calls, '隠れているのにダメージが出た（隠れながら殴れる）').toEqual([]);
    expect(enemy._slamAt, '解決したのに予告が残っている').toBeNull();

    // 同じ距離でも隠れていなければ当たる＝上の空振りが「距離のせい」でない証明
    enemy.hidden = false;
    enemy._slamAt = 2000; enemy._slamIdx = 0;
    expect(ai.tickSlam(enemy, meta, 2000)).toBe(true);
    expect(calls, '隠れていない解決でダメージが出ない').toEqual([meta.atk]);
  });

  test('⑫ ルピー喰いの張り付きだけは重なる（決定⑤の例外・重なってもプレイヤーは動ける）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // σ ルピー喰いは「重なってルピーを食べる」のが攻撃＝重なり禁止の唯一の例外。
    await gotoFrozen(page, EATER({ ps_rupees: '20' }));
    await page.keyboard.press('g');   // debug OFF（重なり禁止を本当に効かせた状態で測る）

    const res = await page.evaluate(() => {
      const g = window.__game, p = g.getPlayer();
      g.pause();
      const ov = (ax, ay, bx, by) => {
        const ox = Math.min(ax + 1, bx + 1) - Math.max(ax, bx);
        const oy = Math.min(ay + 1, by + 1) - Math.max(ay, by);
        return (ox > 0 && oy > 0) ? +(ox * oy).toFixed(3) : 0;
      };
      let attachTick = null, overlapWhileAttached = 0;
      for (let i = 1; i <= 20; i++) {
        g.step(1);
        const e = g.getEnemies()[0];
        if (!e) break;
        if (e.attached) {
          if (attachTick == null) attachTick = i;
          overlapWhileAttached = Math.max(overlapWhileAttached, ov(p.x, p.y, e.x, e.y));
        }
      }
      // 張り付かれたまま動けるか（重なり禁止に掛けると1歩も動けなくなる＝詰み）
      const before = [p.x, p.y];
      g.movePlayer('left');
      const moved = p.x !== before[0] || p.y !== before[1];
      return { attachTick, overlapWhileAttached, moved };
    });

    expect(res.attachTick, 'ルピー喰いが張り付かない（前提が崩れている）').not.toBeNull();
    expect(res.overlapWhileAttached, '張り付いているのに重なっていない＝決定⑤の例外が消えている')
      .toBeGreaterThan(0);
    expect(res.moved, '張り付かれたプレイヤーが1歩も動けない（剥がす手段が無くなる＝詰み）').toBe(true);
    expect(errors).toEqual([]);
  });

  test('⑬ 予告を見てから間合いを外せば空振りする（＝反応で避けられる攻撃）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 決定③の核心＝「予告中に隣接していたら攻撃される」の対偶。予告が立った後に離れれば
    // 解決の tick は空振り（tickSlam が到達判定をやり直す）＝プレイヤーに答えがある攻撃になる。
    await gotoFrozen(page, CURSE(4, 4));
    await page.keyboard.press('g');   // HP を測るので debug OFF

    const res = await page.evaluate(() => {
      const g = window.__game, p = g.getPlayer();
      g.pause();
      // 立って待って予告を立てさせる（歩いて来させる＝実プレイの形）
      let armed = null;
      for (let i = 1; i <= 25; i++) {
        g.step(1);
        const e = g.getEnemies()[0];
        if (e.slamAt != null) { armed = { tick: i, slamAt: e.slamAt, ex: e.x, ey: e.y }; break; }
      }
      if (!armed) return { armed: null };
      const hp0 = g.getState().player.hp;
      const tr = [];
      // 予告を見た＝毎tick「敵から最も遠い隅」へ下がる（到達距離 1.5 の外に出続ける）
      for (let i = 1; i <= 6; i++) {
        const e0 = g.getEnemies()[0];
        p.x = e0.x >= 5.5 ? 1 : 10; p.y = e0.y >= 4.5 ? 1 : 8;
        g.step(1);
        const s = g.getState(), e = g.getEnemies()[0];
        tr.push({
          i, t: s.gameTime, hp: s.player.hp, slamAt: e.slamAt ?? null,
          dist: +Math.hypot(e.x - p.x, e.y - p.y).toFixed(3),
          seal: s.player.sealUntil ?? null,
        });
      }
      return { armed, hp0, tr };
    });

    expect(res.armed, '予告が立たない（前提が崩れている）').toBeTruthy();
    // 本来の解決時刻を跨いだ tick が観測できていること（前提）
    const past = res.tr.filter(r => r.t >= res.armed.slamAt);
    expect(past.length, '本来の解決時刻を跨いでいない（前提が崩れている）').toBeGreaterThan(0);
    expect(past[0].slamAt, '解決の tick を過ぎても予告が残っている').toBeNull();
    for (const r of res.tr) {
      expect(r.dist, `tick${r.i}：下がり切れていない（到達距離の内側にいる＝前提が崩れている）`)
        .toBeGreaterThan(SLAM_RANGE);
      expect(r.hp, `tick${r.i}：間合いを外したのに体当たりを受けた（解決時の再判定が無い）`).toBe(res.hp0);
      expect(r.seal, `tick${r.i}：空振りなのにデバフ（封印）が立った`).toBeNull();
    }
    expect(errors).toEqual([]);
  });

  test('⑭ overlapArea は AABB の面積（重なり禁止の単一の測り方）', () => {
    // 重なり判定を「丸めたタイルセルの一致」に戻すと半セル位置で穴が空く（k-7.5 の原因）。
    // 単一の関数であることと、半セルずれで 0 にならないことを純関数で固定する。
    expect(overlapArea(0, 0, 1, 1, 1, 0, 1, 1), '隣接（1.0）は重なりではない').toBe(0);
    expect(overlapArea(0, 0, 1, 1, 0.5, 0, 1, 1), '半セルずれが重なりと出ない（旧実装の穴）').toBeCloseTo(0.5, 6);
    expect(overlapArea(0, 0, 1, 1, 0, 0, 1, 1), '完全一致の面積').toBeCloseTo(1, 6);
    expect(overlapArea(0, 0, 1, 1, 0.5, 0.5, 2, 2), '大型敵（w×h）の占有範囲を見ていない').toBeCloseTo(0.25, 6);
  });
});
