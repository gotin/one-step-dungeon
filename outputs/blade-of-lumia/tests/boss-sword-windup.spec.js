// tests/boss-sword-windup.spec.js — Phase 8-4 (4) 0d-2.6「剣（近接）の予告つき攻撃」
//
// 2026-08-25 ユーザー実プレイ報告（D1 のボス G 岩のゴーレム）：
//   「盾を持っていない状態なので、現状の G からダメージを受けずに剣攻撃をあてるのは至難の業。
//     G の攻撃を瞬時に発生させるのではなく、前動作があってから攻撃が発生するようなつくりにして、
//     避けようと思えばがんばれば避けることができる、というつくりにしないといけない」
// ∴ `attack.windupMs` を持つ剣は **予告（剣を振り上げる）を経てから当たる** ようにした
// （体当たり slam と同じ3拍：到達で予告 → 予告中は他の行動をしない → 解決時に再判定）。
// D1 のボスであることが要点＝盾は D1 の報酬∴プレイヤーはまだ盾を持っていない
// ＝「盾で受ける」が答えにならない∴避ける余地そのものを機構で作る必要があった。
//
// 2026-08-25（同日・2回目の実プレイ報告）＝**予告だけでは足りなかった**：
//   「え、振り上げから攻撃までが短すぎるな。全然よけられないし、結局剣で攻撃をあてるのが
//     ほぼ不可能じゃない？ なんなら、攻撃がおわったあともちょっと動けない時間をつくるとか
//     しないと、剣を当てること自体がほぼ不可能。攻撃をあてようとすると自分が絶対ダメージを
//     くらう状況。」
// ∴2つ直した：①予告を 360ms（3 tick）→ 600ms（5 tick）へ延ばす＝「見て・どちらへ逃げるか
//   決めて・動く」ぶんの人の反応を予告の中に含める。②`attackFreezeMs`（攻撃後の硬直）を
//   G に入れる＝振り下ろした後 480ms は動かない・攻撃しない＝**避けた側の反撃の窓**。
// ②が必要な理由＝G の剣の間合い 1.2 はプレイヤーの SWORD_REACH 1.2 と**互角**∴「殴れる位置」
//   ＝「殴られる位置」で、隙が無いと当てにいくたび刺し違える（＝ユーザーの言う「絶対ダメージを
//   くらう」の正体は間合いの互角）。硬直は機構としては既存（Phase 5.5k・剣獣 360ms）＝
//   ここで足したのは **G のデータと、硬直の窓を絵に出すこと**（⑪⑫）。
//
// この本が守るのは次の6点（どれか1つでも消えると「至難の業」に戻る）：
//   ① データ    … G の剣に予告が付いている（見て避けられる長さ・連打にならない）
//   ② 対称性    … 剣の間合いは body の**端**から測る＝東西南北で同じ（0d-2.5 と同じ軸）
//   ③ 3拍      … 届いた tick は無傷・予告中も無傷・**解決の tick に**被弾
//   ④ 回避      … 予告を見て間合いを外せば空振り（＝ユーザー要望の実体）
//   ⑤ 専有      … 予告中は移動も他の攻撃も出ない（同じゲートが両方を止める）
//   ⑥ 二重化なし … 盾ブロック・学習は予告あり/なしで同じ1経路（resolveSwordHit）
// ＋ 既定の番人（⑦ `windupMs` を書いていない剣も予告を経る＝0d-2.7 で opt-in から既定へ）、
//    中断の番人（⑧ スタンで予告が消える）、絵と音の番人（⑨⑩＝機構が画面と音に出ている）、
//    反撃の窓の番人（⑪ 振り下ろした後の硬直＝当てても空振りでも動かない・攻撃しない、
//    ⑫ その窓が絵に出る＝止まって見える）。
//
// 2026-08-25（同日・3回目の実プレイ報告＝0d-2.7）＝**ボス1体だけでは足りなかった**：
//   「どの敵もそうなんだけど、接触しただけでもダメージくらうんだっけ？ もしそうだとしたら
//     接触によるダメージは一才無しでいい気がする（体当たり攻撃は別）。実際のところ、
//     まだ結構きびしくて。」
// 接触ダメージ自体は 2026-08-17（k-7.5）に廃止済み＝残っていたのは次の2つ：
//   ① 剣の予告が opt-in で、書いてあるのは G 1体だけ＝残りの剣持ちは「届いた tick に即ダメージ」
//   ② 体当たり（slam）の予告が 280ms＝人の反応（~300ms）より短い＝見えても避けられない
// ∴予告（MELEE_WINDUP_MS 480）と攻撃後の硬直（MELEE_FREEZE_MS 360）を**近接の既定**にした。
// この本ではその番人が ①（既定値の床）⑦（既定で予告が立つ）⑬（`windupMs: 0` の逃げ道）
// ⑭（硬直は近接だけ・遠隔は従来）⑮（名簿を触らないザコ＝骸骨剣士でも予告→硬直）。
//
// 測り方（GUIDE §4-2・tests/boss-2x2-mechanisms.spec.js / slam-attack.spec.js と同型）：
//   ・`spare_arena`（test_mechanics[32,0]・遮蔽ゼロ・敵ゼロ）へ **2×2 の G を注入**する
//     （注入敵は speed 0 ∴歩かない＝距離が動かない＝「予告の拍だけ」を測れる）
//   ・時間は論理時間（`step(1)` = TICK_MS 120ms・tick i の now = 120×i）
//   ・⚠️ クールダウンの初期値は 0（`_attackTimes` が空）＝**now が cooldown 900 を超える
//     まで最初の予告が出ない** ∴隣に置き続ける測り方では tick 8（now 960）で予告が立ち、
//     360ms 後＝tick 11（now 1320）に解決する（下の各本の算術の土台）。
//   ・⚠️ プレビュー（fromEditor=1）は debugMode:true ＝ takeDamage が早期 return する∴
//     **HP を測る本は 'g' で debug を切る**（予告の遷移そのものは debug に依らない）。
//
// ⚠️ 注入敵は DOM を持たない∴予告の**絵**は⑨で実配置のボス（`bal_rock_golem` =
//    test_mechanics[30,1] の G）で測る。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META, ENEMY_SPEED_FAST } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import { TICK_MS, SWORD_REACH, ATTACK_POSE_MS, MELEE_WINDUP_MS, MELEE_FREEZE_MS,
	SLAM_WINDUP_MS } from '../game/constants.js';
import { createEnemyAi } from '../game/enemy-ai.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';
const BOSS = 'G';                       // 予告を入れた最初のボス（岩のゴーレム＝dungeon_1）
const P_ROW = 4, P_COL = 5;             // プレイヤーの立ち位置（通路 rows 7/8 と重ならない）

function previewUrl(stage, row, col, extra) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col), ps_weapon: '1',
    ...(extra ?? {}),
  });
  return `${GAME}?${p.toString()}`;
}
const ARENA = (extra) => previewUrl('spare_arena', P_ROW, P_COL, extra);

const G_META    = () => ENEMY_META[BOSS];
const G_SWORD   = () => (G_META().attacks ?? []).find(a => a.type === 'sword');
const WINDUP_MS = () => G_SWORD().windupMs;
const FREEZE_MS = () => G_META().attackFreezeMs;    // 攻撃後の硬直＝反撃の窓
// 予告が立つ tick ＝クールダウン（初期値 0）に達する最初の tick。
// ⚠️ 判定は `now - last >= cooldown`（等号を含む）∴**切り上げ**で数える。cooldown が
//    TICK_MS の倍数のとき floor+1 だと 1 tick 遅く見積まる（0d-2.6 の2回目の調整で、
//    240ms に縮めた本＝⑪(B) が実際にこれを踏んだ）。
const ARM_TICK     = () => Math.max(1, Math.ceil(G_SWORD().cooldown / TICK_MS));   // 900 → 8
const RESOLVE_TICK = () => ARM_TICK() + Math.ceil(WINDUP_MS() / TICK_MS);     // 8 + 5 = 13

const BOARD_CSS = readFileSync(fileURLToPath(new URL('../game/css/board.css', import.meta.url)), 'utf8');
const SOUNDS_JS = readFileSync(fileURLToPath(new URL('../shared/sounds.js', import.meta.url)), 'utf8');

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
 * 東隣に 2×2 の G を注入して n tick 進め、毎 tick のスナップショットを返す。
 * @param {object} o
 * @param {object} [o.patch]  ENEMY_META[G] へ一時的に差し込む設定（既定 `{ speed: 0 }`）
 * @param {number} o.ticks    進める論理 tick 数
 * @param {number} [o.fleeAt] この tick 以降、毎 tick プレイヤーをアリーナの西端へ逃がす
 * @param {boolean} [o.stickUntilSwing] 予告が立つまで毎 tick プレイヤーを敵の**真西の隣**へ置き直す。
 *   歩く敵を測る本の土台＝徘徊で間合いが外れて予告がいつまでも立たない状況を作らない
 *   （速度を 0 にすると「動く駆動があるのに動かない」を主張できなくなる∴速度は落とさない）。
 * @param {boolean} [o.fleeOnSwing] 予告が立ったのを**観測してから**逃がす（tick 数で固定しない）。
 *   ⚠️ 歩く敵を測る本はこちらを使う＝接近の揺れ（徘徊）で予告が立つ tick が前後するため、
 *      `fleeAt` を算術で固定すると「逃げた後にまだ予告が立っていない」＝予告が永遠に立たない
 *      （プレイヤーが遠い）状況になり、並列実行で落ちる本になる（0d-2.6 の2回目で実際に踏んだ）。
 * @param {number} [o.stunAt] この tick の step の後に敵をスタンさせる（ms は stunMs）
 * @param {number} [o.stunMs]
 * @param {string} [o.faceDir] 毎 tick この向きへ heroDir を固定する（盾の向きを測る本用）
 */
async function measureSwing(page, o) {
  return page.evaluate((a) => {
    const g = window.__game;
    const p = g.getPlayer();
    g.pause();
    g.setEnemyMetaForTest(a.type, a.patch);
    // ⚠️ 注入先は**実際のプレイヤー位置から導く**（アリーナの初期位置を直書きすると、
    //    ステージを直したときに「隣接していないのに予告が立たない」を機構のバグと誤読する）。
    //    真東の隣＝2×2 の左上を (px+1, py) に置くと端からの距離がちょうど 1.0。
    const ex = p.x + 1, ey = p.y;
    // ⚠️ 注入敵は既定で `e.speed = 0`（resolveEnemySpeed は `e.speed ?? meta.speed`）∴
    //    **meta を patch しても歩かない**。歩く駆動が要る本は注入時に速度を渡す
    //    （`getEnemies()` はスナップショット＝返り値へ代入しても実体には効かない）。
    const id = g.injectEnemy(ex, ey, 100, a.w ?? 2, a.h ?? 2, a.type, a.enemySpeed ?? 0);
    const find = () => g.getEnemies().find(e => e.id === id);
    const hp0 = g.getState().player.hp;
    const samples = [];
    let sawSwing = false;
    for (let t = 1; t <= a.ticks; t++) {
      if (a.fleeAt != null && t >= a.fleeAt) { p.x = 1; p.y = 1; }
      if (a.stickUntilSwing && !sawSwing) {
        const e0 = find();
        if (e0) { p.x = e0.x - 1; p.y = e0.y; }   // 真西の隣＝端からの距離 1.0
      }
      if (a.fleeOnSwing && sawSwing) { p.x = 1; p.y = 1; }
      if (a.faceDir) g.setHeroDir(a.faceDir);
      g.step(1);
      const e = find();
      if (!e) break;
      if (e.swingAt != null) sawSwing = true;
      const s = g.getState();
      samples.push({
        t, now: s.gameTime, hp: s.player.hp,
        x: e.x, y: e.y, w: e.w, h: e.h,
        swingAt: e.swingAt ?? null,
        swingWindupMs: e.swingWindupMs ?? null,
        freezeUntil: e.freezeUntil ?? null,   // 攻撃硬直の窓（＝反撃の窓）
        attackTimes: { ...(e.attackTimes ?? {}) },
        modeWeights: e.modeWeights ? { ...e.modeWeights } : null,
        approachMode: e.approachMode ?? null,
        stunUntil: e.stunUntil ?? null,
        px: p.x, py: p.y,
        projectiles: g.getProjectiles().length,
        slashes: document.querySelectorAll('.sword-thrust').length,
        // ⚠️ 盾ブロックの演出はクラスを持たない（projectile.js showShieldBlockEffect が
        //    インラインの `animation:shield-block-anim` で作る）∴クラス名では数えられない。
        blocks: [...document.querySelectorAll('#char-layer div')]
          .filter(el => (el.style.animation || '').includes('shield-block-anim')).length,
      });
      if (a.stunAt === t) g.stunEnemy(id, a.stunMs ?? 600);
    }
    return { id, hp0, samples, atk: a.atk };
  }, {
    ...o,
    // 既定は 2×2 の G。`type`（＋w/h）を渡せば 1×1 のザコも同じ測り方で測れる（0d-2.7）。
    type:  o.type ?? BOSS,
    patch: o.patch ?? { speed: 0 },
    atk:   ENEMY_META[o.type ?? BOSS].atk,
  });
}

const at = (samples, t) => samples.find(s => s.t === t);
/**
 * 測った敵が 2×2 のまま・その場から動いていないか。
 * ・2×2 の番人＝1×1 を測って「大型でも対称」と誤結論しない（0d-2.5 と同じ轍）
 * ・不動の番人＝注入敵は speed 0 ∴距離が動かない＝観測した拍は「予告の拍」だけ
 *   （歩かれていると「離れたから空振り」を「予告が消えた」と読み違える）
 */
function expectStayed2x2(samples) {
  expect(samples.length, '1 tick も進んでいない').toBeGreaterThan(0);
  expect(new Set(samples.map(s => `${s.w}x${s.h}`)), '測った敵が 2×2 でない').toEqual(new Set(['2x2']));
  expect(new Set(samples.map(s => `${s.x},${s.y}`)).size, '注入敵が動いた（speed 0 の前提が崩れた）').toBe(1);
}

test.describe('Phase 8-4 (4) 0d-2.6/0d-2.7 – 近接（剣）の予告つき攻撃と攻撃後の硬直', () => {

  test('① G の剣は予告を持ち、大型ボスの間合いは端基準の帯に収まる（データの番人）', () => {
    const sword = G_SWORD();
    expect(sword, 'G が剣攻撃を持たない（名簿が変わった）').toBeTruthy();
    // 予告は「見て避けられる長さ」でなければ機構として成立しない。
    // ⚠️ 下限は 5 tick（600ms）。**3 tick（360ms）は実プレイで「振り上げから攻撃までが
    //    短すぎる・全然よけられない」と判定された**（2026-08-25 ユーザー・0d-2.6 の2回目の
    //    調整）＝間合いを外す操作そのものに要する 2 tick（MOVE_STEP 0.5）に、振り上げを見て
    //    どちらへ逃げるか決める人の反応（およそ 300ms＝2〜3 tick）を足した長さが必要。
    expect(WINDUP_MS(), 'G の剣に予告（windupMs）が無い＝即ダメージに戻っている').toBeGreaterThan(0);
    expect(WINDUP_MS(), '予告が短すぎる＝「全然よけられない」と判定された 360ms 級に戻っている')
      .toBeGreaterThanOrEqual(5 * TICK_MS);
    // クールダウンは予告より長い＝振り下ろした直後にまた振り上げる連打にならない
    expect(sword.cooldown, 'クールダウンが予告より短い＝予告が常に立ち続ける').toBeGreaterThan(WINDUP_MS());
    // 攻撃後の硬直（反撃の窓）＝ユーザー要望「攻撃がおわったあともちょっと動けない時間」。
    // 下限は「1歩踏み込む（1 tick）＋剣を振る（ATTACK_POSE_MS 180ms は足が止まる）＋1歩下がる
    // （1 tick）」＝420ms。これを下回ると、避けた後に詰めても振り終わる前に硬直が明ける。
    expect(FREEZE_MS(), 'G に攻撃後の硬直が無い＝避けても殴り返す窓が無い（間合いは互角）')
      .toBeGreaterThan(0);
    expect(FREEZE_MS(), '硬直が短すぎる＝踏み込んで振って下がる前に明ける')
      .toBeGreaterThanOrEqual(ATTACK_POSE_MS + 2 * TICK_MS);
    // 硬直はクールダウンの内側＝硬直が明けてから次の予告までにも間がある（連打にならない）
    expect(FREEZE_MS(), '硬直がクールダウンより長い＝硬直が明けた瞬間に次の予告が立つ')
      .toBeLessThan(sword.cooldown);
    // 旧データ（legacy `attack`）も同じ値＝片方だけ直すと差し替え経路で予告が消える
    expect(G_META().attack, '旧 attack フィールドが剣でない').toMatchObject({ type: 'sword' });
    expect(G_META().attack.windupMs, '旧 attack フィールドに予告が無い（差し替え経路で消える）')
      .toBe(WINDUP_MS());
    expect(G_META().attack.range, '旧 attack フィールドの間合いが attacks[0] と違う').toBe(sword.range);

    // 0d-2.5/0d-2.6 で `range` の意味を「body の**端**からプレイヤーまで」に統一した＝
    // プレイヤーの剣（SWORD_REACH）と同じ尺度で読める∴大型ボスも 1×1 と同じ帯に収まる。
    // 2.0 以上＝「1セル空けても殴られる」＝予告を見ても下がり切れない間合いになる。
    let swords = 0;
    for (const [tile, m] of Object.entries(ENEMY_META)) {
      for (const a of m.attacks ?? (m.attack ? [m.attack] : [])) {
        if (a.type !== 'sword') continue;
        swords++;
        expect(a.range, `'${tile}' の剣が隣接（1.0）に届かない`).toBeGreaterThanOrEqual(1.0);
        expect(a.range, `'${tile}' の剣が 2 セル先から届く＝端基準に直っていない（0d-2.5 の回帰）`)
          .toBeLessThan(2.0);
      }
    }
    expect(swords, '剣を持つ敵が居ない（名簿が消えた？）').toBeGreaterThanOrEqual(10);
    expect(SWORD_REACH, 'プレイヤーの剣の間合いが帯の外＝比べる尺度が違う').toBeLessThan(2.0);

    // 0d-2.7（2026-08-25）＝予告と硬直を**全敵の近接の既定**にした。既定値の床：
    //   予告 … 人が見て判断する ~300ms ＋ 間合いを外す1歩（TICK_MS）＝4 tick
    //   硬直 … 踏み込む1歩 ＋ 剣を振る（ATTACK_POSE_MS は足が止まる）＝ATTACK_POSE_MS + 1 tick
    expect(MELEE_WINDUP_MS, '近接の既定の予告が 4 tick 未満＝見えても避けられない（予告が飾りになる）')
      .toBeGreaterThanOrEqual(4 * TICK_MS);
    expect(MELEE_FREEZE_MS, '近接の既定の硬直が短すぎる＝踏み込んで振る前に明ける')
      .toBeGreaterThanOrEqual(ATTACK_POSE_MS + TICK_MS);
    // 体当たり（slam）の予告も同じ床を共有する＝「剣は避けられるのに体当たりは避けられない」を作らない
    expect(SLAM_WINDUP_MS, '体当たりの予告が近接の既定の床から外れた（280ms 級に戻っている）')
      .toBe(MELEE_WINDUP_MS);
    // ボスは既定より長い（G は 600ms＝2歩ぶん外せる）＝ボスの方が読みやすい
    expect(WINDUP_MS(), 'ボスの予告が既定より短い＝ザコより避けにくいボスになっている')
      .toBeGreaterThanOrEqual(MELEE_WINDUP_MS);
  });

  test('② 剣の到達判定は body の端から測る＝東西南北で同じ間合い（純関数）', () => {
    // 0d-2.5 の軸そのもの：大型敵は座標を**左上**で持つ∴中心/端で補正しないと
    // 「西/北から詰めたときだけ間合いが 1 セル遠い」＝プレイヤーに見えない安全な面ができる。
    const player = { x: 0, y: 0 };
    const ai = createEnemyAi({ getPlayer: () => player, getEnemies: () => [] });
    const atk = { type: 'sword', range: 1.2, windupMs: 360 };
    const DIRS = [['西', -1, 0], ['東', 1, 0], ['北', 0, -1], ['南', 0, 1]];

    // 2×2（左上座標・占有 2 セル）＝端から range までは届き、少し外れると届かない。
    // ⚠️ 間合いちょうど（= range）は使わない＝左上座標＋半分の足し引きで丸め誤差が出る
    //    （実測：西側の 1.2 が 1.2000000000000002 になって「届かない」と読めてしまう）。
    //    測りたいのは境界の厳密値ではなく**東西南北で同じか**∴内側/外側に 0.05 だけ寄せる。
    const IN = atk.range - 0.05, OUT = atk.range + 0.05;
    for (const [name, ux, uy] of DIRS) {
      for (const gap of [1.0, IN]) {
        // 端がプレイヤーから gap 離れる左上座標（w-1=h-1=1 ぶんを西/北側で戻す）
        const ex = ux > 0 ? gap : (ux < 0 ? -gap - 1 : 0);
        const ey = uy > 0 ? gap : (uy < 0 ? -gap - 1 : 0);
        const e = { x: ex, y: ey, w: 2, h: 2, dir: 'down' };
        expect(ai.swordReach(e, atk), `2×2 の${name}側・端から ${gap} に届かない`).toBeTruthy();
      }
      const ex = ux > 0 ? OUT : (ux < 0 ? -OUT - 1 : 0);
      const ey = uy > 0 ? OUT : (uy < 0 ? -OUT - 1 : 0);
      expect(ai.swordReach({ x: ex, y: ey, w: 2, h: 2, dir: 'down' }, atk),
        `2×2 の${name}側・端から ${OUT}（間合いの外）に届いてしまう`).toBeNull();
    }
    // 振る向きは中心から見たプレイヤーの方向（絵と当たった面が一致する）
    expect(ai.swordReach({ x: 1, y: -0.5, w: 2, h: 2, dir: 'down' }, atk).dir).toBe('left');
    expect(ai.swordReach({ x: -2, y: -0.5, w: 2, h: 2, dir: 'down' }, atk).dir).toBe('right');
    expect(ai.swordReach({ x: -0.5, y: 1, w: 2, h: 2, dir: 'down' }, atk).dir).toBe('up');
    expect(ai.swordReach({ x: -0.5, y: -2, w: 2, h: 2, dir: 'down' }, atk).dir).toBe('down');

    // 1×1 は従来と同値（halfW=halfH=0 ∴中心からの距離そのもの）
    for (const [name, ux, uy] of DIRS) {
      expect(ai.swordReach({ x: ux * IN, y: uy * IN, w: 1, h: 1, dir: 'down' }, atk),
        `1×1 の${name}側・${IN} に届かない（1×1 の挙動が変わった）`).toBeTruthy();
      expect(ai.swordReach({ x: ux * OUT, y: uy * OUT, w: 1, h: 1, dir: 'down' }, atk),
        `1×1 の${name}側・間合いの外に届いてしまう`).toBeNull();
    }
    // 十字の間合い（箱ではない）＝主軸ぴったりでも直交方向に 0.8 を超えてずれたら届かない
    expect(ai.swordReach({ x: 1.0, y: 0.8, w: 1, h: 1, dir: 'down' }, atk), '直交 0.8 のずれが届かない').toBeTruthy();
    expect(ai.swordReach({ x: 1.0, y: 0.9, w: 1, h: 1, dir: 'down' }, atk), '斜めから殴れてしまう（十字でなく箱）').toBeNull();
  });

  test('③ 予告→解決の3拍（届いた tick は無傷・予告中も無傷・解決の tick に被弾）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, ARENA());
    await page.keyboard.press('g');           // HP を測るので debug OFF
    const r = await measureSwing(page, { ticks: RESOLVE_TICK() + 2 });
    expectStayed2x2(r.samples);

    const arm = at(r.samples, ARM_TICK());
    const resolve = at(r.samples, RESOLVE_TICK());
    // 予告が立つ tick（クールダウンを超える最初の tick）と長さ
    expect(at(r.samples, ARM_TICK() - 1).swingAt, '予告がクールダウンより前に立った（算術の前提が崩れた）').toBeNull();
    expect(arm.swingAt, '到達しているのに予告が立たない（即ダメージに戻った？）').not.toBeNull();
    expect(arm.swingAt - arm.now, '解決の時刻が「今＋予告の長さ」でない').toBe(WINDUP_MS());
    expect(arm.swingWindupMs, '予告の長さがインスタンスに乗っていない').toBe(WINDUP_MS());

    // 届いた tick と予告中は**無傷**＝「間合いに入った瞬間にダメージ」ではない
    for (const s of r.samples.filter(s => s.t < RESOLVE_TICK())) {
      expect(s.hp, `tick${s.t}（到達直後/予告中）でダメージを受けた＝予告が機能していない`).toBe(r.hp0);
      expect(s.attackTimes['0'], `tick${s.t} で剣がクールダウンを記録した（振り下ろす前に成立した）`).toBeUndefined();
    }
    // 解決の tick に atk ぶん減る（クールダウンは**解決した時刻から**数える）
    expect(resolve.swingAt, '解決したのに予告が残っている').toBeNull();
    expect(r.hp0 - resolve.hp, '解決の tick のダメージが atk と違う').toBe(r.atk);
    expect(resolve.attackTimes['0'], 'クールダウンが解決の時刻から数えられていない')
      .toBe(RESOLVE_TICK() * TICK_MS);
    expect(resolve.slashes, '振り下ろしの剣エフェクトが出ていない').toBeGreaterThan(0);
    // 4拍目＝振り下ろした後の硬直（反撃の窓）は**解決の時刻から**数える
    expect(resolve.freezeUntil, '当てた後に硬直が入っていない＝殴り返す窓が無い')
      .toBe(RESOLVE_TICK() * TICK_MS + FREEZE_MS());
    // 予告中は硬直していない（＝硬直の窓と予告の窓が混ざっていない）
    for (const s of r.samples.filter(s => s.t < RESOLVE_TICK())) {
      expect(s.freezeUntil, `tick${s.t}：振り下ろす前から硬直している`).toBeNull();
    }
    expect(errors).toEqual([]);
  });

  test('④ 予告を見てから間合いを外せば空振り（＝ユーザー要望の実体）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 0d-2.6 の目的そのもの＝「避けようと思えばがんばれば避けることができる」。
    // 予告が立った次の tick からアリーナの反対の隅へ逃げる＝解決の tick は空振りになる。
    await gotoFrozen(page, ARENA());
    await page.keyboard.press('g');           // HP を測るので debug OFF
    const r = await measureSwing(page, { ticks: RESOLVE_TICK() + 3, fleeAt: ARM_TICK() + 1 });
    expectStayed2x2(r.samples);

    expect(at(r.samples, ARM_TICK()).swingAt, '予告が立たない（前提が崩れた）').not.toBeNull();
    const resolve = at(r.samples, RESOLVE_TICK());
    expect(resolve.px, '逃げていない（前提が崩れた）').toBe(1);
    expect(resolve.swingAt, '解決の時刻を過ぎても予告が残っている').toBeNull();
    // 空振り＝ダメージ無し。ただしクールダウンは数える（逃げた直後に予告なしで振り直さない）
    for (const s of r.samples) {
      expect(s.hp, `tick${s.t}：間合いを外したのに斬られた（解決時の再判定が無い）`).toBe(r.hp0);
    }
    expect(resolve.attackTimes['0'], '空振りでクールダウンを数えていない＝逃げた直後に振り直せる')
      .toBe(RESOLVE_TICK() * TICK_MS);
    // 空振りでも振り下ろしの絵は出る＝「避けた」ことが画面に出る
    expect(resolve.slashes, '空振りだと剣エフェクトが出ない＝避けたことが分からない').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('⑤ 予告中はこの tick を専有する（他の攻撃も出ない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // enemyTick の行動ゲート（`!swinging`）＝予告中は移動も他の攻撃もしない。
    // 「他の攻撃」を観測できるようにするため、G の遠隔（岩投げ）のクールダウンを 0 にする
    // ＝予告が無ければ毎 tick 岩が飛ぶ状況を作り、**予告中だけ増えない**ことを測る。
    // （移動も同じ 1 つのゲートで止まる∴このゲートの番人が移動の番人でもある。
    //   注入敵は speed 0 ∴移動そのものはこの本では観測できない。）
    await gotoFrozen(page, ARENA());
    const r = await measureSwing(page, {
      ticks: RESOLVE_TICK() + 2,
      patch: {
        speed: 0,
        // ⚠️ 硬直（attackFreezeMs）は 0 にして測る＝硬直も同じゲートで攻撃を止める∴
        //    残したままだと「岩を投げた → 硬直で数 tick 沈黙 → 予告が立つ tick がずれる」で
        //    測りたい「予告中だけ出ない」が硬直の沈黙と混ざる（ARM_TICK の算術も崩れる）。
        attackFreezeMs: 0,
        attacks: [
          { ...G_SWORD() },
          { type: 'stone', range: 6, cooldown: 0, projectileSpeed: 1.0 },
        ],
      },
    });
    expectStayed2x2(r.samples);

    const arm = at(r.samples, ARM_TICK());
    expect(arm.swingAt, '予告が立たない（前提が崩れた）').not.toBeNull();
    // 予告の前は毎 tick 岩が撃たれている（前提＝「出るはずの行動」がある）
    expect(at(r.samples, ARM_TICK() - 1).attackTimes['1'],
      '岩投げが一度も出ていない＝「予告中は出ない」を主張する前提が無い').toBeDefined();
    const stoneTimes = r.samples.map(s => s.attackTimes['1'] ?? null);
    // 予告中（arm の次 tick 〜 解決の1つ前）は岩投げの時刻が更新されない
    const during = r.samples.filter(s => s.t > ARM_TICK() && s.t < RESOLVE_TICK());
    expect(during.length, '予告中の tick が観測できていない（予告が短すぎる）').toBeGreaterThan(0);
    for (const s of during) {
      expect(s.attackTimes['1'], `tick${s.t}：予告中に岩投げが出た（this tick の専有が効いていない）`)
        .toBe(arm.attackTimes['1']);
    }
    expect(stoneTimes.filter(Boolean).length, '岩投げの観測が空（前提が崩れた）').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('⑥ 盾ブロックと学習は予告経路でも効く（機構を二重化していない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 予告あり/なしで同じ 1 経路（resolveSwordHit）を通す＝盾ブロックと
    // 「盾で防がれたら接近モードの重みを下げる」学習が予告経路でも動く。
    // ps_shield はティア番号＝跳ね返しの無い木の盾（0）。敵は東∴右を向いて受ける。
    // 接近モードは乱択∴`initialModeWeights` を direct だけにして学習の観測を決定論にする。
    await gotoFrozen(page, ARENA({ ps_shield: '0' }));
    await page.keyboard.press('g');           // HP を測るので debug OFF
    const r = await measureSwing(page, {
      ticks: RESOLVE_TICK() + 2,
      faceDir: 'right',
      patch: { speed: 0, initialModeWeights: { flank: 0, direct: 1, wander: 0, strafe: 0 } },
    });
    expectStayed2x2(r.samples);

    const arm = at(r.samples, ARM_TICK());
    const resolve = at(r.samples, RESOLVE_TICK());
    expect(arm.swingAt, '予告が立たない（前提が崩れた）').not.toBeNull();
    expect(arm.approachMode, '接近モードが direct に固定できていない（学習の観測が非決定になる）').toBe('direct');
    expect(arm.modeWeights.direct, '学習前の重みが 1 でない（前提が崩れた）').toBe(1);
    // 盾で受けた＝無傷・ブロックの絵が出る・クールダウンは数える（攻撃は成立した扱い）
    for (const s of r.samples) {
      expect(s.hp, `tick${s.t}：盾を向けているのに斬られた（予告経路が盾を通っていない）`).toBe(r.hp0);
    }
    expect(resolve.blocks, '盾ブロックのエフェクトが出ていない').toBeGreaterThan(0);
    expect(resolve.attackTimes['0'], '盾で防がれた攻撃がクールダウンを数えていない')
      .toBe(RESOLVE_TICK() * TICK_MS);
    // 学習＝防がれた接近モードの重みが下がる（0.6 倍）
    expect(resolve.modeWeights.direct, '盾で防がれたのに接近モードの学習が動かない（予告経路で二重化した）')
      .toBeCloseTo(0.6, 6);
    expect(errors).toEqual([]);
  });

  test('⑦ windupMs を書いていない剣も予告を経てから当たる（0d-2.7＝予告は全敵の既定）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // ❌ 旧主張（2026-08-25・0d-2.7 で失効）＝「windupMs を持たない剣は従来どおり届いた tick に
    //    当たる（opt-in の番人＝ザコの脅威度を動かさない）」。ユーザー実プレイ報告＝
    //    「どの敵もそうなんだけど、接触しただけでもダメージくらうんだっけ？」
    //    ＝予告の無い近接は、プレイヤーには**接触ダメージ**（2026-08-17 に廃止済み）と
    //      区別できない∴予告は全敵の既定（MELEE_WINDUP_MS）にした。
    await gotoFrozen(page, ARENA());
    await page.keyboard.press('g');           // HP を測るので debug OFF
    const sword = { ...G_SWORD() };
    delete sword.windupMs;
    const DEF_TICKS = Math.ceil(MELEE_WINDUP_MS / TICK_MS);
    const r = await measureSwing(page, {
      ticks: ARM_TICK() + DEF_TICKS + 1,
      patch: { speed: 0, attacks: [sword], attack: sword },
    });
    expectStayed2x2(r.samples);

    const arm = at(r.samples, ARM_TICK());
    expect(arm.swingAt, 'windupMs を省いた剣に予告が立たない＝既定が効いていない（即ダメージに戻った）')
      .not.toBeNull();
    expect(arm.swingWindupMs, '既定の予告の長さが MELEE_WINDUP_MS でない').toBe(MELEE_WINDUP_MS);
    // 届いた tick も予告中も無傷＝「寄った瞬間にダメージ」ではない（＝報告の解消そのもの）
    for (const s of r.samples.filter(s => s.t < ARM_TICK() + DEF_TICKS)) {
      expect(s.hp, `tick${s.t}：予告中に被弾した＝既定の予告が飾りになっている`).toBe(r.hp0);
    }
    const resolve = at(r.samples, ARM_TICK() + DEF_TICKS);
    expect(r.hp0 - resolve.hp, '既定の予告が解決しても当たらない（当たらない敵になった）').toBe(r.atk);
    expect(resolve.freezeUntil, '解決したのに硬直が入っていない').toBe(resolve.now + FREEZE_MS());
    expect(errors).toEqual([]);
  });

  test('⑬ windupMs: 0 を明示した剣だけ即ダメージに戻る（逃げ道の番人）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 既定を予告ありにした代わりに、**明示的に 0 と書いた攻撃**だけ従来の即ダメージにできる
    // （今この指定を使っている敵は居ない＝将来「予告を持たない一撃」を作るための逃げ道）。
    // これが効かないと `?? 既定` の式が `|| 既定` のような書き方に劣化しても気付けない。
    await gotoFrozen(page, ARENA());
    await page.keyboard.press('g');           // HP を測るので debug OFF
    const sword = { ...G_SWORD(), windupMs: 0 };
    const r = await measureSwing(page, {
      ticks: ARM_TICK() + 2,
      patch: { speed: 0, attacks: [sword], attack: sword },
    });
    expectStayed2x2(r.samples);

    for (const s of r.samples) {
      expect(s.swingAt, `tick${s.t}：windupMs: 0 なのに予告が立った（0 が既定に置き換わっている）`).toBeNull();
    }
    expect(at(r.samples, ARM_TICK() - 1).hp, '届いた tick より前に被弾した（前提が崩れた）').toBe(r.hp0);
    expect(r.hp0 - at(r.samples, ARM_TICK()).hp, 'windupMs: 0 の剣が届いた tick に当たらない')
      .toBe(r.atk);
    expect(errors).toEqual([]);
  });

  test('⑭ 攻撃後の硬直は近接だけ既定で入る（遠隔は従来どおり・純関数）', () => {
    // 硬直は「殴り返す窓」＝近接（sword / charge）にだけ既定で掛ける。遠隔にも掛けると
    // 撃つたびに固まる＝「間合いを保って撃つ」（enemyKeepDistance）挙動が壊れる。
    const ai = createEnemyAi({ getPlayer: () => ({ x: 0, y: 0 }), getEnemies: () => [] });
    const f = ai.resolveAttackFreezeMs;
    for (const type of ['sword', 'charge']) {
      expect(f({}, { type }), `${type} に近接の既定の硬直が入らない＝殴り返す窓が無い`).toBe(MELEE_FREEZE_MS);
      expect(f({ directional: true }, { type }), `${type}（directional）の硬直が攻撃ポーズ止まり`)
        .toBe(MELEE_FREEZE_MS);
    }
    for (const type of ['stone', 'spear', 'swordBeam', 'waterShot', 'waterBlade', 'bombThrow', 'boomerangThrow']) {
      expect(f({}, { type }), `${type}（遠隔）に近接の硬直が入った＝撃つたびに固まる`).toBe(0);
      expect(f({ directional: true }, { type }), `${type}（遠隔・directional）の既定が変わった`)
        .toBe(ATTACK_POSE_MS);
    }
    // meta の明示は最優先＝投擲の硬直を長くしている敵（爆弾鬼 480・剣獣 360）の意図を壊さない
    expect(f({ attackFreezeMs: 480 }, { type: 'sword' }), 'meta の明示が既定に負けた').toBe(480);
    expect(f({ attackFreezeMs: 0 }, { type: 'charge' }), 'meta で 0 と書いても硬直が入る').toBe(0);
    // 第2引数を省いた呼び出し＝従来の既定（既存の呼び出しと互換）
    expect(f({}), '攻撃を渡さない呼び出しの既定が変わった').toBe(0);
    expect(f({ directional: true }), 'directional の既定が攻撃ポーズの長さでない').toBe(ATTACK_POSE_MS);
  });

  test('⑮ ザコ（骸骨剣士・1×1）も予告を経てから当たり、その後硬直する（0d-2.7 の実体）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // ⑦はデータを差し替えた G で測る本＝「既定の式」の番人。こちらは**名簿を1文字も触らない
    // 実在のザコ**で測る＝ユーザーの言う「どの敵もそう」が実際に直ったことの番人。
    // 骸骨剣士＝1×1・directional・剣（range 1.5 / cooldown 900）・`windupMs` も
    // `attackFreezeMs` も書いていない＝両方が既定で効く敵。
    const meta = ENEMY_META[TILE.SKELETON];
    const sword = meta.attack;
    expect(sword, '骸骨剣士が剣を持たない（名簿が変わった）').toMatchObject({ type: 'sword' });
    expect(sword.windupMs, '骸骨剣士に windupMs が書かれた＝既定の番人にならない').toBeUndefined();
    expect(meta.attackFreezeMs, '骸骨剣士に attackFreezeMs が書かれた＝既定の番人にならない').toBeUndefined();
    const ARM = Math.max(1, Math.ceil(sword.cooldown / TICK_MS));
    const WIND = Math.ceil(MELEE_WINDUP_MS / TICK_MS);

    await gotoFrozen(page, ARENA());
    await page.keyboard.press('g');           // HP を測るので debug OFF
    const r = await measureSwing(page, {
      type: TILE.SKELETON, w: 1, h: 1, ticks: ARM + WIND + 2, patch: { speed: 0 },
    });
    expect(new Set(r.samples.map(s => `${s.w}x${s.h}`)), '測った敵が 1×1 でない').toEqual(new Set(['1x1']));

    const arm = at(r.samples, ARM);
    expect(arm.swingAt, 'ザコの剣に予告が立たない＝寄った瞬間に斬られる（報告の状態）').not.toBeNull();
    expect(arm.swingWindupMs, 'ザコの予告の長さが既定でない').toBe(MELEE_WINDUP_MS);
    for (const s of r.samples.filter(s => s.t < ARM + WIND)) {
      expect(s.hp, `tick${s.t}：ザコの予告中に被弾した`).toBe(r.hp0);
    }
    const resolve = at(r.samples, ARM + WIND);
    expect(r.hp0 - resolve.hp, 'ザコの剣が解決の tick に当たらない').toBe(r.atk);
    // 硬直＝既定 MELEE_FREEZE_MS（meta に書いていない）。この窓の間は動かない・攻撃しない。
    expect(resolve.freezeUntil, 'ザコに攻撃後の硬直が入らない＝避けても殴り返せない')
      .toBe(resolve.now + MELEE_FREEZE_MS);
    for (const s of r.samples.filter(s => s.t > ARM + WIND && s.now < resolve.freezeUntil)) {
      expect(s.swingAt, `tick${s.t}：硬直中に次の予告が立った`).toBeNull();
      expect(s.hp, `tick${s.t}：硬直中に斬られた`).toBe(resolve.hp);
    }
    expect(errors).toEqual([]);
  });

  test('⑧ 予告はスタンで消える（振り上げたところを殴れば無かったことになる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 体当たりの予告（slam）と同じ扱い＝止めたのに振り下ろされる、を作らない。
    // ⚠️ スタンは**本来の解決時刻を越えて明ける**長さにする（予告 + 2 tick）。スタンが
    //    解決時刻ちょうどで明けると、その tick に敵は（消えた予告の代わりに）新しい予告を
    //    正しく立てる＝「スタンしても予告が残っている」と読み違える（0d-2.6 の2回目の調整で
    //    予告を 5 tick に延ばしたとき、固定値 600ms のままで実際にこれを踏んだ）。
    await gotoFrozen(page, ARENA());
    await page.keyboard.press('g');           // HP を測るので debug OFF
    const r = await measureSwing(page, {
      ticks: RESOLVE_TICK() + 1, stunAt: ARM_TICK(), stunMs: WINDUP_MS() + 2 * TICK_MS,
    });
    expectStayed2x2(r.samples);

    const arm = at(r.samples, ARM_TICK());
    expect(arm.swingAt, '予告が立たない（前提が崩れた）').not.toBeNull();
    const after = r.samples.filter(s => s.t > ARM_TICK());
    expect(after.some(s => s.now >= arm.swingAt), '本来の解決時刻を跨いでいない（前提が崩れた）').toBe(true);
    for (const s of after) {
      expect(s.swingAt, `tick${s.t}：スタンしても予告が残っている`).toBeNull();
      expect(s.hp, `tick${s.t}：スタン中に斬られた`).toBe(r.hp0);
      expect(s.attackTimes['0'], `tick${s.t}：スタンで消えた予告が攻撃として成立した`).toBeUndefined();
    }
    expect(errors).toEqual([]);
  });

  test('⑨ 予告は「剣を振り上げる」絵で出る（キャラの拡大縮小ではない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 2026-08-25 ユーザー指定：「今の体当たりの予告動作はキャラ自体を縮小拡大する動作だけど、
    // 剣の攻撃の予告動作がそれだと変」∴刃が頭上へ上がる形（::after）にした。
    // ① CSS の形（体当たり `.slam-windup` の canvas 拡大縮小とは別物であること）
    expect(BOARD_CSS, '.swing-windup の規則が無い＝予告が見えない').toContain('.char-abs.swing-windup::after');
    expect(BOARD_CSS, '剣の予告がキャラ（canvas）の拡大縮小になっている＝ユーザー指定に反する')
      .not.toMatch(/\.char-abs\.swing-windup\s+canvas\.sprite/);
    expect(BOARD_CSS, 'enemy-swing-windup アニメーションが無い')
      .toMatch(/animation:\s*enemy-swing-windup\s+var\(--swing-windup-ms/);
    const kf = BOARD_CSS.match(/@keyframes enemy-swing-windup\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/)?.[0] ?? '';
    expect(kf, '@keyframes enemy-swing-windup が無い').toContain('@keyframes enemy-swing-windup');
    expect(kf, '刃が回って上がっていない（rotate が無い）＝振り上げに見えない').toMatch(/rotate\(/);

    // ② 実配置のボス（注入敵は DOM を持たない）でクラスと長さの受け渡しを測る。
    //    毎 tick ボスの西隣へ立ち直る＝歩かれても間合いが外れない。
    await gotoFrozen(page, previewUrl('bal_rock_golem', 4, 2));
    const r = await page.evaluate(() => {
      const g = window.__game, p = g.getPlayer();
      g.pause();
      const boss = g.getEnemies().find(e => e.type === 'G');
      if (!boss) return { error: 'G が居ない' };
      const tr = [];
      for (let i = 1; i <= 20; i++) {
        const e0 = g.getEnemies().find(e => e.id === boss.id);
        if (!e0) break;
        p.x = e0.x - 1; p.y = e0.y;          // 西隣（2×2 の左端から 1 セル）
        g.step(1);
        const e = g.getEnemies().find(x => x.id === boss.id);
        const el = document.getElementById(`char-enemy-${e.id}`);
        tr.push({
          i, swingAt: e.swingAt ?? null, dir: e.dir,
          cls: !!el?.classList.contains('swing-windup'),
          ms:  el?.style.getPropertyValue('--swing-windup-ms') || '',
          flip: el?.style.getPropertyValue('--swing-flip') || '',
        });
      }
      return { tr };
    });
    expect(r.error).toBeUndefined();
    const armed = r.tr.find(s => s.swingAt != null);
    expect(armed, '実配置のボスが 20 tick で一度も予告しない').toBeTruthy();
    // 予告中だけクラスが付く（解決後まで残ると機構の告知にならない）
    for (const s of r.tr) {
      expect(s.cls, `tick${s.i} の .swing-windup が予告状態（swingAt=${s.swingAt}）と食い違う`)
        .toBe(s.swingAt != null);
    }
    // 長さは状態機械が持つ（CSS 側に長さを書かない）＝要素へ ms が渡っている
    expect(armed.ms, '振り上げの長さが要素へ渡っていない（CSS 既定値に落ちる）').toBe(`${WINDUP_MS()}ms`);
    // 剣を持つ側＝振る向き（西/北へ振るときは左右反転）
    expect(armed.dir, '西隣に立ったのにボスが西を向いていない（前提が崩れた）').toBe('left');
    expect(armed.flip, '振る向きに応じた反転（--swing-flip）が渡っていない').toBe('-1');
    expect(errors).toEqual([]);
  });

  test('⑩ 予告の SE は突進の溜めと別の音（避け方が違うものを同じ音で告知しない）', () => {
    // 剣＝間合いを外す／突進＝軸から外れる∴音でも聞き分けられる必要がある（GUIDE §6-1）。
    expect(SOUNDS_JS, "playSound('swordWindup') が無い＝予告の音が鳴らない")
      .toContain("kind === 'swordWindup'");
    const body = (kind) => SOUNDS_JS.match(new RegExp(`kind === '${kind}'\\)\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    const sword = body('swordWindup'), dash = body('dashWindup');
    expect(sword, 'swordWindup の中身が空').not.toBe('');
    expect(dash, 'dashWindup の中身が空（対照が無い）').not.toBe('');
    expect(sword, '剣の予告と突進の溜めが同じ音になっている').not.toBe(dash);
    // 金属を擦り上げる＝音程が上がっていく（突進の溜めと逆に高い側で鳴る）
    const freqs = (src) => [...src.matchAll(/,\s*(\d+(?:\.\d+)?),\s*0\./g)].map(m => Number(m[1]));
    const sf = freqs(sword);
    expect(sf.length, 'swordWindup の音が 1 音以下＝グリッサンドになっていない').toBeGreaterThanOrEqual(3);
    expect(sf[sf.length - 1], '剣の予告の音程が上がっていない（振り上げに聞こえない）').toBeGreaterThan(sf[0]);
  });

  test('⑪ 振り下ろした後は硬直する＝空振りでも動かない・次の予告も立たない（反撃の窓）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 2026-08-25（2回目）ユーザー要望の実体＝「攻撃がおわったあともちょっと動けない時間」。
    // これが無いと、避けた直後に詰めても G がそのまま歩いて詰め直す／すぐ振り直すため
    // 「殴れる位置＝殴られる位置」（間合いが互角）から抜け出せない。
    const FREEZE_TICKS = Math.ceil(FREEZE_MS() / TICK_MS);
    await gotoFrozen(page, ARENA());
    await page.keyboard.press('g');           // HP を測るので debug OFF

    // (A) 空振りの後も硬直する＝**追ってこない**。
    //     ⚠️ 歩く駆動を与える（注入敵は既定 speed 0 ∴そのままでは「動かない」を主張できない）。
    //     ⚠️ 硬直より前の tick は予告（swinging）が this tick を専有していて同じく動かない∴
    //        「動く駆動がある」の証拠は**硬直が明けた tick に動くこと**で立てる（沈黙は守りのせい）。
    //     ⚠️ 歩く敵は接近の揺れ（徘徊）で予告の立つ tick が前後する∴**逃げるのも測るのも
    //        観測から導く**（tick 数で固定すると並列実行で落ちる本になる＝この本が実際に踏んだ）。
    //        さらに予告が立つまではプレイヤーを敵の隣へ置き直して「間合いが外れたまま予告が
    //        立たない」を潰す＝観測窓（ticks）の中で必ず解決まで進む。
    const a = await measureSwing(page, {
      ticks: RESOLVE_TICK() + FREEZE_TICKS + 8,
      stickUntilSwing: true,                  // 予告が立つまでは間合いを保つ（土台）
      fleeOnSwing: true,                      // 予告を見て逃げる＝解決は空振り
      enemySpeed: ENEMY_SPEED_FAST,           // 0.5 セル/tick ＝毎 tick 位置が動く速さ
    });
    const resolveIdx = a.samples.findIndex(s => s.freezeUntil != null);
    expect(resolveIdx, '硬直に入る tick が無い＝空振りでは硬直が入らない（避けても殴り返す窓が無い）')
      .toBeGreaterThanOrEqual(0);
    const resolve = a.samples[resolveIdx];
    const windup = a.samples.filter(s => s.t < resolve.t && s.swingAt != null);
    expect(new Set(a.samples.map(s => `${s.w}x${s.h}`)), '測った敵が 2×2 でない').toEqual(new Set(['2x2']));
    expect(resolve.px, '逃げていない（前提が崩れた）').toBe(1);
    // 被弾ゼロは**硬直が明けるまで**で見る（その後は G が詰め直して当ててよい＝別の話）
    expect(a.samples.filter(s => s.now <= resolve.freezeUntil).every(s => s.hp === a.hp0),
      '空振りなのに被弾している（前提が崩れた）').toBe(true);
    expect(windup.length, '予告を経ずに硬直へ入った（前提が崩れた）')
      .toBeGreaterThanOrEqual(Math.ceil(WINDUP_MS() / TICK_MS) - 1);
    expect(resolve.freezeUntil, '硬直が解決の tick から数えられていない')
      .toBe(resolve.now + FREEZE_MS());
    // 硬直中（解決の tick 〜 窓が明ける前）は1歩も動かない
    const during = a.samples.filter(s => s.t >= resolve.t && s.now < resolve.freezeUntil);
    expect(during.length, '硬直中の tick が観測できていない（硬直が短すぎる）').toBeGreaterThan(1);
    expect(new Set(during.map(s => `${s.x},${s.y}`)), '硬直中に動いた＝反撃の窓が無い')
      .toEqual(new Set([`${resolve.x},${resolve.y}`]));
    // 明けた tick には動く＝上の沈黙は「歩けないから」ではなく硬直のせい
    const freed = a.samples.filter(s => s.now >= resolve.freezeUntil);
    expect(freed.length, '硬直が明けた後の tick を観測していない').toBeGreaterThan(0);
    expect(`${freed[0].x},${freed[0].y}`, '硬直が明けても動かない＝「動く駆動がある」と言えない（前提が崩れた）')
      .not.toBe(`${resolve.x},${resolve.y}`);

    // (B) 硬直中は**次の予告も立たない**（クールダウンが明けていても）。
    //     クールダウンを 2 tick に縮めて「硬直が無ければ窓の内側で振り直せる」状況を作る。
    const CD = 2 * TICK_MS;
    const sword = { ...G_SWORD(), cooldown: CD };
    const ARM_B     = Math.max(1, Math.ceil(CD / TICK_MS));              // 240 → 2
    const RESOLVE_B = ARM_B + Math.ceil(WINDUP_MS() / TICK_MS);          // 2 + 5 = 7
    const FREE_B    = RESOLVE_B + FREEZE_TICKS;                          // 硬直が明ける tick
    // 前提＝硬直はクールダウンの明け（RESOLVE_B*TICK+CD）を跨いでいる（跨がなければ空虚な本）
    expect(FREEZE_MS(), '硬直がクールダウンより短い＝「硬直のせいで振り直せない」を測れない')
      .toBeGreaterThan(CD);
    // ⚠️ 論理時刻（gameTime）はページを跨いで**続く**（(A) の 19 tick ぶん進んでいる）∴
    //    「tick 数 × TICK_MS = now」の算術で測る本は測り直す前に読み込み直す。
    await gotoFrozen(page, ARENA());
    const b = await measureSwing(page, {
      ticks: FREE_B + 1,
      patch: { speed: 0, attacks: [sword], attack: sword },
    });
    expectStayed2x2(b.samples);
    expect(at(b.samples, ARM_B).swingAt, '縮めたクールダウンで予告が立たない（前提が崩れた）').not.toBeNull();
    expect(at(b.samples, RESOLVE_B).attackTimes['0'], '算術どおりに解決していない（前提が崩れた）')
      .toBe(RESOLVE_B * TICK_MS);
    expect(at(b.samples, RESOLVE_B).freezeUntil, '解決の tick から硬直が数えられていない')
      .toBe(RESOLVE_B * TICK_MS + FREEZE_MS());
    // 硬直中の tick はクールダウンが明けていても予告を立てない
    for (const s of b.samples.filter(s => s.t > RESOLVE_B && s.t < FREE_B)) {
      expect(s.swingAt, `tick${s.t}：硬直中なのに次の予告が立った（硬直が攻撃を止めていない）`).toBeNull();
      expect(s.attackTimes['0'], `tick${s.t}：硬直中に剣が成立した`).toBe(RESOLVE_B * TICK_MS);
    }
    expect(b.samples.filter(s => s.t > RESOLVE_B && s.t < FREE_B).length,
      '硬直中の tick が観測できていない').toBeGreaterThan(0);
    // 明けた tick に予告が立つ＝沈黙は硬直のせい（クールダウンのせいではない）
    expect(at(b.samples, FREE_B).swingAt, '硬直が明けたのに予告が立たない＝沈黙が硬直のせいだと言えない')
      .toBe(FREE_B * TICK_MS + WINDUP_MS());
    expect(errors).toEqual([]);
  });

  test('⑫ 硬直の窓は絵に出る（沈んで止まる＝予告3種と別の形）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 硬直を反撃の窓として使う以上、窓が絵に出ていなければプレイヤーは殴り返せない
    // （GUIDE §6-1「絵は機構を読ませる」）。予告3種はどれも**動き続ける**絵∴硬直は
    // 「沈んで止まる」＝繰り返さない（iteration 1 + forwards）形にして4つとも区別する。
    expect(BOARD_CSS, '.attack-recover の規則が無い＝硬直の窓が見えない')
      .toContain('.char-abs.attack-recover canvas.sprite');
    expect(BOARD_CSS, '硬直の長さが状態機械から渡されていない（CSS に長さを持たせている）')
      .toMatch(/animation:\s*enemy-attack-recover\s+var\(--recover-ms/);
    const kf = (name) => BOARD_CSS.match(new RegExp(`@keyframes ${name}\\s*\\{(?:[^{}]*\\{[^{}]*\\})*[^{}]*\\}`))?.[0] ?? '';
    const recover = kf('enemy-attack-recover');
    expect(recover, '@keyframes enemy-attack-recover が無い').toContain('@keyframes');
    for (const other of ['enemy-slam', 'enemy-dash-windup', 'enemy-swing-windup']) {
      expect(kf(other), `${other} が無い（対照が無い）`).toContain('@keyframes');
      expect(recover, `硬直の絵が ${other} と同じ形＝どの窓なのか読めない`).not.toBe(kf(other));
    }
    // 繰り返さない＝止まって見える（`2` や `infinite` の予告と違う）
    expect(BOARD_CSS.match(/animation:\s*enemy-attack-recover[^;]*/)?.[0], '硬直の絵が繰り返している＝止まって見えない')
      .toMatch(/\b1\s+forwards/);

    // 実配置のボス（注入敵は DOM を持たない）でクラスの付き外れを測る。
    await gotoFrozen(page, previewUrl('bal_rock_golem', 4, 2));
    const r = await page.evaluate(() => {
      const g = window.__game, p = g.getPlayer();
      g.pause();
      const boss = g.getEnemies().find(e => e.type === 'G');
      if (!boss) return { error: 'G が居ない' };
      const tr = [];
      for (let i = 1; i <= 22; i++) {
        const e0 = g.getEnemies().find(e => e.id === boss.id);
        if (!e0) break;
        p.x = e0.x - 1; p.y = e0.y;          // 西隣に立ち続ける（間合いを外さない）
        g.step(1);
        const e = g.getEnemies().find(x => x.id === boss.id);
        const el = document.getElementById(`char-enemy-${e.id}`);
        tr.push({
          i, now: g.getState().gameTime,
          swingAt: e.swingAt ?? null, freezeUntil: e.freezeUntil ?? null,
          cls: !!el?.classList.contains('attack-recover'),
          windupCls: !!el?.classList.contains('swing-windup'),
          ms: el?.style.getPropertyValue('--recover-ms') || '',
        });
      }
      return { tr };
    });
    expect(r.error).toBeUndefined();
    const inWindow = (s) => s.freezeUntil != null && s.now < s.freezeUntil && s.swingAt == null;
    expect(r.tr.some(inWindow), '実配置のボスが 22 tick で一度も硬直しない（前提が崩れた）').toBe(true);
    for (const s of r.tr) {
      expect(s.cls, `tick${s.i} の .attack-recover が硬直の窓（freezeUntil=${s.freezeUntil}）と食い違う`)
        .toBe(inWindow(s));
      // 予告と硬直が同時に付かない＝どちらの窓なのかが絵で一意に読める
      expect(s.cls && s.windupCls, `tick${s.i}：振り上げと硬直の絵が同時に出ている`).toBe(false);
    }
    // 長さは状態機械が渡す＝窓に入った最初の tick に硬直の全長が入る（CSS 既定値に落ちない）
    expect(r.tr.find(inWindow).ms, '硬直の長さが要素へ渡っていない').toBe(`${ENEMY_META.G.attackFreezeMs}ms`);
    expect(errors).toEqual([]);
  });
});
