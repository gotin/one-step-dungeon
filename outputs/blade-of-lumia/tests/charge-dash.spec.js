// tests/charge-dash.spec.js — Phase 5.5k k-9「直線突進＋壁ヒット気絶」（解禁1体・#14 突進猪）
//
// k-9 で足したのは **meta.dash ＝体当たり（k-7.5 の slam）の強化版**（enemy-ai.js `tickDash`）。
// slam は「隣接してから予告→解決」＝間合いの中の話しかできない。突進はその外側＝
// **プレイヤーが自分の行/列に入った瞬間に、遠くから一直線に走って来る**攻撃で、
// 「距離を取っていれば安全」を崩す（GUIDE §7-2 の縛り＝敵は歩きでは追いつけない、の抜け道）。
// 代わりに走り終わりの失敗が重い＝**壁に激突すると気絶して殴り放題になる**。
//
//   突進猪 CHARGE_BOAR ('ω') … `dash:{ windupMs, speed, maxCells, alignTol, hitRange,
//                                      minRange, maxRange, stunMs, cooldownMs }`
//     idle    … 鈍足（SLOW 0.25）で歩く。プレイヤーが自分の行/列（直交ずれ alignTol 0.8 以内）の
//               minRange 2.0〜maxRange 9.0 に入ると溜めへ
//     windup  … 溜め 360ms（3 tick）＝動かない・攻撃しない予告の窓（**隠れない＝殴れる**）。
//               走る方向はここで確定するカーディナル1方向（board.css `.dash-windup`＝前後の足踏み）
//     run     … 1.5 セル/tick（歩きの6倍）で直進。終わり方は3通り：
//               ① プレイヤーに接触（hitRange 1.0）… 体当たりと同じダメージ・**気絶しない**
//               ② 地形に激突 …………………………… stunMs 1440ms（12 tick）の気絶＝反撃の窓（⭐）
//               ③ maxCells 10 セル走り切る …………… 空振り
//     recover … 硬直 cooldownMs 1200ms。②の後は **stunMs + cooldownMs**＝気絶が明けてから
//               硬直ぶん待つ（＝反撃の窓の直後にもう一度轢かれない）
//     弱点なし（気絶させたときだけが弱点）・脅威度 9.0（剣獣 10.0 未満）
//
// プレイヤーの答え＝**軸から1セル外れる**（下がるのは無効＝走って追われる）。∴避け方が slam と
// 違う∴予告の絵も別の形にする（slam＝拡大縮小 `.slam-windup` ／突進＝前後の足踏み
// `.dash-windup`）。同じ絵だと「どっちの避け方をすべきか」が読めない（GUIDE §6-1）。
//
// 検証ステージ＝test_mechanics[42,0] `charge_boar`
// （scripts/migrate-test-charge-arena.mjs が自己検査付きで生成。座標は `stageKey()` から引く）。
// 外周は壁だが**左右 rows 7/8 は隣のアリーナへの通路**（tests/test-arena-doors.js）∴塞がない。
// ⚠️ probe(4,1) は「敵と同じ行の西端」＝**助走路（列8〜1が一直線に床）とその先の西の外壁**を
//    同じ盤面に収める立ち位置。ここを敵に近づけると dash.minRange 2.0 の内側＝突進が始まらず
//    体当たり（slam）の検証に化ける（migrate スクリプトが距離と助走路を検査している）。
//
// tick 換算（TICK_MS=120・step() が論理時間を 120ms 進める・tick i の now = 120×i）。
// 実測（probe(4,1) に置いて待つだけ＝実プレイの形。実アリーナの⑨⑩の測定値）：
//   t 1 now  120 … 溜め開始（dashPhase 'windup'・dashUntil 480・`.dash-windup` が付く）
//   t 4 now  480 … 走行開始（'run'・dashLeft 10。この tick はまだ動かない）
//   t 5〜   …… 1.5 セル/tick で西へ（9.0 → 7.5 → 6.0 → 4.5 → 3.0 …）
//   t 9 now 1080 … ①立っていた場合＝x 2.0 で接触＝HP -3（atk）・**stunUntil は立たない**
//   t10 now 1200 … ②軸から1セル外れた場合＝x 0.5 で西壁に激突＝stunUntil 2640（12 tick）・⭐
//                  硬直は 3840 まで（気絶 1440 ＋ 硬直 1200）＝t22 で気絶が明けても
//                  t32 まで次の突進は始まらない
//
// ⚠ 計測は1回の evaluate 内で完結させ、冒頭で pause() する。実時間ループは
//   `gotoFrozen()` でそもそも起動させない（k-3〜k-8 spec と同じ理由）。
// ⚠ プレビュー（fromEditor=1）は debugMode:true ＝ takeDamage が早期 return する∴
//   **HP を測る本は 'g' で debug を切る**（切らないと①の轢かれが観測できない）。
// ⚠ k-9a 時点のスプライトは既存絵（火吐き亀）のエイリアス＋突進猪パレット
//   （GUIDE §2「機構が先・絵は後」）∴絵の中身は主張せず、名前解決と
//   「床に沈まない色であること」だけを押さえる。実描き（32×32＝待機／溜め／気絶）は k-9b の担当。
//
// ── 歯の実測（2026-08-18・機構を1つずつ壊して**実際に**赤くなった本を書いた。
//    計測は .scratch/probe-dash-teeth.mjs＝置換→spec 実行→復元を1機構ずつ）──────────
//   壊したもの → 赤くなった本（18 通り全部で赤が出た＝歯なしはゼロ）
//     溜めを 0 にする（予告なしで突進）                        → ⑥⑨
//     当たり判定を slam の十字（slamReachHit）に戻す           → ⑦⑩   ← k-9a で実際に踏んだバグ
//     軸判定（off > alignTol）を消す＝どこに居ても突進する      → ④
//     間合い判定（minRange/maxRange）を消す                    → ④
//     接触判定（dashReachHit）を消す                           → ⑥
//     進めない理由がプレイヤーでも「激突」にする                → ⑦
//     壁に激突しても気絶しない（stunUntil を立てない）          → ⑦⑩
//     硬直に気絶ぶんを足さない（endDash が cooldownMs だけ）    → ⑦⑩
//     cancelDash が硬直（recover）も畳む                       → ⑩
//     スタンで突進を中断しない（enemyTick の cancelDash を外す）→ ⑪
//     溜めの class 付け外し（syncDashMotion）を削る             → ⑨
//     ⭐（showDashStun）を出さない                             → ⑩
//     歩幅の細分（MOVE_STEP 補間）をやめて speed ぶん飛ばす      → ⑥⑧⑨
//     突進中も通常の攻撃を呼ぶ（`!dashing` ゲートを外す）        → ⑩
//     board.css の `.dash-windup` 規則を無効化                  → ③
//     dash.alignTol を 1.5 にする（1セル外れても突進が始まる）  → ①⑤⑦⑩
//     dash.minRange を 1.0 にする（slam の間合いと重なる）      → ①
//     歩きを速くする（speed 2.0＝突進の意味が消える）           → ①
//   （k-9b の実絵と一緒に更新する予定＝この表は k-9a 時点の実測）
//
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { ENEMY_META, ENEMY_SPEED_SLOW, ENEMY_SPEED_FAST } from '../shared/enemies.js';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { TICK_MS, MOVE_STEP, SLAM_RANGE } from '../game/constants.js';
import { createEnemyAi } from '../game/enemy-ai.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { isArenaDoor, ARENA_DOOR_ROWS } from './test-arena-doors.js';

const GAME   = '/blade-of-lumia/game/';
const EDITOR = '/blade-of-lumia/editor/';

function previewUrl(stage, row, col, extra) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col),
    ps_weapon: '1',
    ...(extra ?? {}),
  });
  return `${GAME}?${p.toString()}`;
}

// 敵は (4,9)＝x9,y4。probe は (4,1)＝同じ行の西端・dist 8.0（突進の間合い 2.0〜9.0 の内側）。
const BOAR_URL = (extra) => previewUrl('charge_boar', 4, 1, extra);

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

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const BOARD_CSS = readFileSync(fileURLToPath(new URL('../game/css/board.css', import.meta.url)), 'utf8');

// 石床の相対輝度（shared/sprites-tiles.js stoneFloor＝明部 #3a3848=57.6）。
// 敵の色がこれ以下だと床に沈んで輪郭が見えない（k-4〜k-6 で実際に起きた欠陥）。
const FLOOR_LUM = 57.6;
const lumOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
const threatOf = (m) => (m.hp * m.atk) / (m.def + 1);
const M = () => ENEMY_META[TILE.CHARGE_BOAR];
const D = () => M().dash;

// ── 純関数（tickDash）用の作業台 ───────────────────────────────
// enemy-ai.js は factory ＝DOM もゲーム状態も要らない（k-7.5 ⑪・k-8 と同じ作法）。
//   wallAt … これ以下の x は通れない（＝西の壁。null で壁なし）
// 壁に激突する枝は playSound('doorLock') を鳴らす∴Node に AudioContext の張り子を置く
// （鳴らさない実装に変えると音が消えたことに気づけない＝ここでは黙らせずに通す）。
function stubAudio() {
  if (globalThis.window?.AudioContext) return;
  const node = () => ({
    type: '', frequency: { setValueAtTime() {} },
    gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    connect() {}, start() {}, stop() {},
  });
  globalThis.window = {
    ...(globalThis.window ?? {}),
    AudioContext: function () {
      return { currentTime: 0, destination: {}, createOscillator: node, createGain: node };
    },
  };
}

//   blockOnPlayer … 実ゲームと同じ「敵はプレイヤーに重なれない」（k-7.5 決定①）を模す
//                   ＝進めない理由がプレイヤーになる枝を通せる
function bench({ player, wallAt = null, blockOnPlayer = false }) {
  stubAudio();
  const m = M();
  const e = { id: 'b1', type: TILE.CHARGE_BOAR, x: 9, y: 4, atk: m.atk, hp: m.hp };
  const damage = [];
  const overlapsPlayer = (y, x) => Math.abs(x - player.x) < 1 && Math.abs(y - player.y) < 1;
  const ai = createEnemyAi({
    getPlayer: () => player,
    getEnemies: () => [e],
    takeDamage: (amt) => damage.push(amt),
    isPassableForEnemy: (y, x) => (wallAt != null && x <= wallAt ? false
      : !(blockOnPlayer && overlapsPlayer(y, x))),
    moveCharEl: () => {},
    getCharLayerEl: () => null,     // ⭐ の生成は DOM 無しなので早期 return する
    gameNow: () => 0,
  });
  // tick を1つ進める（now = TICK_MS × i）。戻り値＝tickDash がこの tick を専有したか。
  const step = (i) => ai.tickDash(e, m, TICK_MS * i);
  return { ai, e, damage, step, m };
}

test.describe('Phase 5.5k k-9 – 直線突進＋壁で気絶（突進猪）', () => {

  test('① 突進猪の定義（記号タイル・非ボス・鈍足・拍と間合いの整合・弱点なし）', () => {
    expect(TILE.CHARGE_BOAR, 'TILE.CHARGE_BOAR が未定義').toBe('ω');
    const m = M();
    expect(m, "ENEMY_META['ω'] が無い").toBeTruthy();
    expect(m.name, '突進猪の名前').toBe('突進猪');
    expect(m.isBoss, '突進猪は通常敵').toBeFalsy();
    // 通常敵の最強格＝剣獣（脅威度 10）を超えない
    expect(threatOf(m), '突進猪の脅威度が剣獣（10）以上＝通常敵の最強格を追い越している')
      .toBeLessThan(threatOf(ENEMY_META[TILE.SWORD_BEAST]));
    // ★ 歩きは鈍足＝**速いのは予告付きの突進の窓だけ**。歩きを速くすると
    //   「常時速い敵」になり GUIDE §7-2（走れば振り切れる）の逃げ道が消える。
    expect(m.speed, '突進猪の歩きが鈍足でない＝常時速い敵になっている').toBe(ENEMY_SPEED_SLOW);
    expect(m.speed, 'GUIDE §7-2＝敵はプレイヤー（速度換算 1.0）より速くない')
      .toBeLessThan(ENEMY_SPEED_FAST);

    const d = D();
    expect(d, '突進猪に dash が無い＝突進の機構を持っていない').toBeTruthy();
    // 拍は tick の整数倍（相が切り替わる tick が揺れると観測できない）
    for (const k of ['windupMs', 'stunMs', 'cooldownMs']) {
      expect(d[k], `dash.${k} が無い`).toBeGreaterThan(0);
      expect(d[k] % TICK_MS, `dash.${k}=${d[k]} が tick の整数倍でない`).toBe(0);
    }
    // ★ 溜めは 2 tick 以上＝**見てから軸を外せる**（予告になっている）
    expect(d.windupMs / TICK_MS, '溜めが 1 tick＝見て避けられない（予告になっていない）')
      .toBeGreaterThanOrEqual(2);
    // ★ 気絶は溜めより長い＝失敗のリスクが釣り合う（反撃の窓になる）
    expect(d.stunMs, '気絶が溜め以下＝壁に当てても反撃の窓にならない').toBeGreaterThan(d.windupMs);
    expect(d.stunMs / TICK_MS, '気絶が 6 tick 未満＝殴りに回り込む余裕が無い')
      .toBeGreaterThanOrEqual(6);
    // ★ 突進は歩きより速い（そうでなければ機構が無意味）
    expect(d.speed, '突進が歩きより速くない').toBeGreaterThan(m.speed);
    // ★ 軸から1セル外れれば始まらない＝プレイヤーの答えが成立する
    expect(d.alignTol, 'alignTol が 1 以上＝1セル外れても突進が始まる（避け方が無い）').toBeLessThan(1);
    // ★ 素通りしない＝重なり禁止（k-7.5 決定①）での最接近 1.0 に届く判定距離
    expect(d.hitRange, 'hitRange が 1.0 未満＝突進がプレイヤーを素通りする').toBeGreaterThanOrEqual(1);
    // ★ 体当たり（slam）と間合いが重ならない＝同じ距離で予告が2種類立たない
    expect(d.minRange, 'dash.minRange が体当たりの到達距離以下＝どちらの予告か読めない')
      .toBeGreaterThan(SLAM_RANGE);
    expect(d.maxRange, 'maxRange が minRange 以下').toBeGreaterThan(d.minRange);
    // ★ 最遠から始めた突進が届く長さ＝maxCells が maxRange に足りていること
    //   （足りないと「走って来たのに目の前で止まる」＝空振りが仕様でなく事故になる）
    expect(d.maxCells, 'maxCells が maxRange に届かない＝最遠からの突進が必ず空振りする')
      .toBeGreaterThanOrEqual(d.maxRange);

    // 隣接した後の攻撃は体当たり（k-7.5 の slam を共有）＝突進が終わっても無害にならない
    const list = m.attacks ?? (m.attack ? [m.attack] : []);
    expect(list.some(a => a.type === 'charge'), '突進猪が体当たり（charge）を持たない').toBe(true);

    // 弱点なし＝気絶させた窓だけが弱点（名簿 #14「弱点なし（気絶時のみ）」）
    expect(m.weakness, '突進猪に弱点がある＝名簿（弱点なし・気絶時のみ）と食い違う').toBeUndefined();
    // 機構の取り違え防止（跳躍・隠れ・瞬間移動とは別の機構）
    expect(m.leap, '突進猪に meta.leap がある＝跳躍と機構が混ざっている').toBeUndefined();
    expect(m.hide, '突進猪に meta.hide がある＝隠れと機構が混ざっている').toBeUndefined();
    expect(m.blink, '突進猪に meta.blink がある＝瞬間移動と機構が混ざっている').toBeUndefined();
  });

  test('② タイル定義・スプライト名の解決・パレット（床に沈まない色）', () => {
    const m = M();
    expect(TILE_META[TILE.CHARGE_BOAR], "TILE_META['ω'] が無い＝エディタに出ない").toBeTruthy();
    expect(TILE_META[TILE.CHARGE_BOAR].label, '突進猪のラベル').toBe('突進猪');
    expect(TILE_META[TILE.CHARGE_BOAR].passable, '敵タイルは通行可（下は床）').toBe(true);
    expect(m.sprite, '突進猪のスプライト名').toBe('chargeBoar');
    expect(m.pal, '突進猪のパレット名').toBe('chargeBoar');
    expect(ENEMY_SPRITES[m.sprite], 'chargeBoar スプライトが無い＝盤面で絵が消える').toBeTruthy();
    expect(ENEMY_SPRITES[m.sprite].length, '待機が2フレーム以上でない＝止まって見える')
      .toBeGreaterThanOrEqual(2);
    // タイル→スプライトは shared/tile-sprites.js が単一の真実（エディタとゲームで分けない）
    expect(TILE_SPRITE_MAP[TILE.CHARGE_BOAR], 'TILE_SPRITE_MAP に突進猪が無い＝エディタで絵が出ない')
      .toEqual({ spr: 'chargeBoar', pal: 'chargeBoar' });
    // パレットの色番号がスプライトの最大値をカバーしていること（欠けると描画で落ちる）
    const pal = ENEMY_PAL[m.pal];
    expect(pal, 'ENEMY_PAL.chargeBoar が無い').toBeTruthy();
    const maxIdx = Math.max(...ENEMY_SPRITES[m.sprite].flat(2));
    expect(pal.length, `パレットの色数が足りない（最大の色番号 ${maxIdx}）`).toBeGreaterThan(maxIdx);
    // 床に沈まない色（輪郭＝index 1 だけは床より暗くて良い＝輪郭は暗いから見える）
    expect(lumOf(pal[1]), '輪郭が床より明るい＝輪郭線として効かない').toBeLessThan(FLOOR_LUM);
    for (const hex of pal.slice(2)) {
      expect(lumOf(hex), `パレットの色 ${hex} が石床（輝度 ${FLOOR_LUM}）より暗い＝床に沈む`)
        .toBeGreaterThan(FLOOR_LUM);
    }
    // ⚠️ k-9a のスプライトは既存絵のエイリアス（GUIDE §2「機構が先・絵は後」）∴
    //    ここでは寸法や差分ドットを主張しない。実絵（32×32・溜め／気絶ポーズ）は k-9b。
  });

  test('③ 溜めのモーションが CSS にあり、体当たりの予告とは別の形（避け方が違う）', () => {
    expect(BOARD_CSS, '.dash-windup の規則が無い＝溜めが見えない')
      .toContain('.char-abs.dash-windup canvas.sprite');
    expect(BOARD_CSS, 'enemy-dash-windup アニメーションが無い')
      .toMatch(/animation:\s*enemy-dash-windup\s/);
    const kf = BOARD_CSS.match(/@keyframes enemy-dash-windup\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/)?.[0] ?? '';
    expect(kf, '@keyframes enemy-dash-windup が無い').toContain('@keyframes enemy-dash-windup');
    // ★ 体当たり（拡大縮小＝scale）とは別の形＝走る軸の足踏み（translateX）。
    //   同じ形にすると「下がる」のか「軸から外れる」のかが絵から読めない（GUIDE §6-1）。
    expect(kf, '溜めが軸方向に揺れていない（translateX が無い）').toMatch(/translateX\(/);
    const slamKf = BOARD_CSS.match(/@keyframes enemy-slam\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/)?.[0] ?? '';
    expect(slamKf, '@keyframes enemy-slam が無い（前提が崩れている）').toContain('@keyframes enemy-slam');
    expect(kf === slamKf, '突進の溜めと体当たりの予告が同じモーション＝避け方の違いが読めない')
      .toBe(false);
    // 溜めの終わりは状態機械が持つ＝CSS に長さを埋め込まない（infinite）
    expect(BOARD_CSS, '溜めのアニメーションが繰り返しでない＝溜めの長さを CSS に二重管理している')
      .toMatch(/animation:\s*enemy-dash-windup[^;]*infinite/);
  });

  test('④ 軸に入っていなければ突進しない（純関数・プレイヤーの答えが成立する）', () => {
    const d = D();
    // 直交ずれが alignTol ちょうど＝始まる（境界は内側）
    {
      const b = bench({ player: { x: 1, y: 4 + d.alignTol } });
      expect(b.step(1), `直交ずれ ${d.alignTol}（alignTol ちょうど）で突進が始まらない`).toBe(true);
      expect(b.e._dashPhase).toBe('windup');
    }
    // alignTol を超えたら始まらない＝**1セル外れれば安全**
    {
      const b = bench({ player: { x: 1, y: 4 + d.alignTol + 0.1 } });
      for (let i = 1; i <= 10; i++) {
        expect(b.step(i), `直交ずれ ${d.alignTol + 0.1} で突進が始まった＝軸から外れても轢かれる`)
          .toBe(false);
      }
      expect(b.e._dashPhase, '軸外なのに相が進んだ').toBe('idle');
      expect(b.e.x, '軸外なのに突進で移動した').toBe(9);
    }
    // 近すぎ（minRange 未満）＝突進しない（そこは体当たり slam の間合い）
    {
      const b = bench({ player: { x: 9 - (d.minRange - 0.5), y: 4 } });
      for (let i = 1; i <= 5; i++) {
        expect(b.step(i), `距離 ${d.minRange - 0.5}（minRange 未満）で突進が始まった＝slam と間合いが重なる`)
          .toBe(false);
      }
    }
    // 遠すぎ（maxRange 超）＝突進しない（届かない突進で隙だけ晒さない）
    {
      const b = bench({ player: { x: 9 - (d.maxRange + 1), y: 4 } });
      for (let i = 1; i <= 5; i++) {
        expect(b.step(i), `距離 ${d.maxRange + 1}（maxRange 超）で突進が始まった`).toBe(false);
      }
    }
  });

  test('⑤ 当たり判定は走行軸の前方だけ（横をすり抜けても轢かれない・純関数）', () => {
    // ⚠️ 2026-08-18 実測で見つけた欠陥の番人。当初は体当たりの間合い（slamReachHit）を
    //    流用していた＝あれは**向きを持たない十字**（主軸 ≤ range・直交 ≤ 0.8 を両軸それぞれ）∴
    //    軸から1セル外れたプレイヤーの横（前方 0.5・横 1.0）を走り抜けるとき縦軸の腕で当たり、
    //    **避けたのに轢かれる**（k-9 のプレイヤーの答えが消える）。
    const d = D();
    const { ai } = bench({ player: { x: 0, y: 0 } });
    const e = { x: 5, y: 5 };
    const WEST = [0, -1], NORTH = [-1, 0];
    const hit = (vec, x, y) => ai.dashReachHit(e, { x, y }, vec, d.hitRange, d.alignTol);
    // 進行方向の正面＝hitRange まで当たる／その先は当たらない
    expect(hit(WEST, 5 - d.hitRange, 5), `西へ走って正面 ${d.hitRange} に当たらない`).toBe(true);
    expect(hit(WEST, 5 - d.hitRange - 0.1, 5), '到達距離より遠い正面に当たる').toBe(false);
    // ★ 車線の幅＝alignTol（突進が**始まる**幅と同じ）。1セル横は当たらない＝避け方が成立する
    expect(hit(WEST, 5 - d.hitRange, 5 + d.alignTol), '車線の縁（alignTol）に当たらない').toBe(true);
    expect(hit(WEST, 5 - d.hitRange, 5 + 1), '1セル横に外れたプレイヤーに当たる＝避けても轢かれる')
      .toBe(false);
    expect(hit(WEST, 5 - 0.5, 5 + 1), '横をすり抜けるときに当たる（十字の腕で当たる旧欠陥）')
      .toBe(false);
    // 後ろ（すでに通り過ぎた側）には当たらない
    expect(hit(WEST, 5 + d.hitRange, 5), '背後（通り過ぎた側）に当たる＝走行方向を見ていない')
      .toBe(false);
    // 縦の突進でも同じ形（向きごとに導出＝1方向の結論を流用しない）
    expect(hit(NORTH, 5, 5 - d.hitRange), '北へ走って正面に当たらない').toBe(true);
    expect(hit(NORTH, 5 + 1, 5 - d.hitRange), '北へ走るとき1セル横に当たる').toBe(false);
    expect(hit(NORTH, 5, 5 + d.hitRange), '北へ走るとき背後に当たる').toBe(false);
  });

  test('⑥ 立っていれば轢かれる：溜め→突進→接触＝ダメージ（気絶しない・純関数）', () => {
    const d = D(), m = M();
    const player = { x: 1, y: 4 };
    const b = bench({ player });                     // 壁なし＝止まるのは接触だけ
    const tr = [];
    for (let i = 1; i <= 20; i++) {
      const own = b.step(i);
      tr.push({ i, own, phase: b.e._dashPhase, x: b.e.x, dmg: b.damage.length });
      if (b.damage.length) break;
    }
    const windupTicks = d.windupMs / TICK_MS;
    // 溜めは「入った tick」に立ち、windupMs のあいだ続く
    expect(tr[0].phase, '軸に入っているのに溜めが立たない').toBe('windup');
    for (let i = 0; i < windupTicks; i++) {
      expect(tr[i].phase, `tick${tr[i].i}：溜めが ${windupTicks} tick 続いていない`).toBe('windup');
      expect(tr[i].x, `tick${tr[i].i}：溜め中に動いた（予告の窓が予告になっていない）`).toBe(9);
    }
    expect(tr[windupTicks].phase, '溜めの後が走行でない').toBe('run');
    // 走行の速さ＝dash.speed セル/tick（歩きの倍率をここで固定する）
    const moving = tr.filter((r, k) => k > windupTicks && r.phase === 'run');
    expect(moving.length, '走行の tick が観測できない').toBeGreaterThan(1);
    const perTick = moving[0].x - moving[1].x;
    expect(perTick, `1 tick の移動が dash.speed（${d.speed}）でない`).toBeCloseTo(d.speed, 6);
    expect(d.speed % MOVE_STEP, 'dash.speed が MOVE_STEP の整数倍でない＝補間で端数が残る').toBe(0);
    // 接触＝体当たりと同じダメージ・**気絶しない**（避けなかった側がご褒美をもらわない）
    expect(b.damage, '突進が当たってもダメージが出ない').toEqual([m.atk]);
    expect(b.e.stunUntil, '接触で気絶した＝立っていただけのプレイヤーが反撃の窓をもらえる')
      .toBeFalsy();
    // 止まる位置＝hitRange（＝素通りしていない・めり込んでもいない）
    expect(b.e.x - player.x, `接触した距離が hitRange（${d.hitRange}）でない`)
      .toBeCloseTo(d.hitRange, 6);
    // 当たった後は硬直（連続で轢かない）
    expect(b.e._dashPhase, '当たった後に硬直へ入っていない').toBe('recover');
    const hitNow = TICK_MS * tr[tr.length - 1].i;
    expect(b.e._dashUntil, '当たった後の硬直が cooldownMs でない').toBe(hitNow + d.cooldownMs);
  });

  test('⑦ 軸から外れれば壁に激突＝気絶（反撃の窓）／硬直は気絶の後から数える（純関数）', () => {
    const d = D();
    const player = { x: 1, y: 4 };
    // 西の壁＝x が 0.5 以下は通れない（アリーナの外壁と同じ位置関係）
    const b = bench({ player, wallAt: 0.5 });
    const windupTicks = d.windupMs / TICK_MS;
    let crashAt = null;
    for (let i = 1; i <= 30; i++) {
      // 溜めを見た＝軸から1セル外れる（走る向きはもう確定している＝進路から外れられる）
      if (i === windupTicks) player.y = 5;
      b.step(i);
      if (b.e.stunUntil) { crashAt = TICK_MS * i; break; }
    }
    expect(crashAt, '軸から外れたのに壁に激突しない（気絶が起きない）').not.toBeNull();
    expect(b.damage, '軸から外れたのにダメージを受けた＝避け方が成立していない').toEqual([]);
    expect(b.e.stunUntil, '気絶の長さが stunMs でない').toBe(crashAt + d.stunMs);
    // ★ 硬直は「気絶が明けてから cooldownMs」＝反撃の窓の直後に轢かれ直さない
    expect(b.e._dashPhase, '激突の後が硬直でない').toBe('recover');
    expect(b.e._dashUntil, '硬直が気絶より先に明ける＝気絶明けに即・再突進する')
      .toBe(crashAt + d.stunMs + d.cooldownMs);
    // 壁を越えて走り抜けていないこと（補間が飛ばしていない）
    expect(b.e.x, '壁を越えた（当たり判定を飛び越している）').toBeGreaterThan(0.5);

    // ★ 裏面：**進めない理由がプレイヤーなら激突ではない**（重なり禁止＝k-7.5 決定①で
    //    プレイヤーは「通れないもの」になっている∴ここを壁と同じ扱いにすると
    //    「避けずに立っていた側が気絶＝反撃の窓をもらう」逆の設計になる）。
    //    当たり判定の車線（alignTol 0.8）の外・けれど重なる位置（ずれ 0.9）に立って塞ぐ。
    const edge = { x: 1, y: 4 };
    const offEdge = (d.alignTol + 1) / 2;             // 0.9＝車線の外・けれど重なる
    expect(offEdge, '車線の外で重なる位置が存在しない（alignTol と重なり幅が一致した）')
      .toBeGreaterThan(d.alignTol);
    const c = bench({ player: edge, wallAt: 0.5, blockOnPlayer: true });
    for (let i = 1; i <= 30; i++) {
      if (i === windupTicks) edge.y = 4 + offEdge;    // 軸に入って突進を引き出してから半端にずれる
      c.step(i);
      if (c.damage.length || c.e.stunUntil) break;
    }
    expect(c.damage, '塞いだプレイヤーに当たらず素通り／壁扱いになった').toEqual([M().atk]);
    expect(c.e.stunUntil, 'プレイヤーに塞がれたのを激突扱いした＝避けなかった側がご褒美をもらう')
      .toBeFalsy();
  });

  test('⑧ 誰にも当たらなければ maxCells で力尽きる（空振り・気絶もしない・純関数）', () => {
    const d = D();
    const player = { x: 1, y: 4 };
    const b = bench({ player });                     // 壁なし
    const windupTicks = d.windupMs / TICK_MS;
    const startX = 9;
    for (let i = 1; i <= 40; i++) {
      if (i === windupTicks) player.y = 9;           // 溜めの後に軸から大きく外れる
      b.step(i);
      if (b.e._dashPhase === 'recover') break;
    }
    expect(b.damage, '空振りなのにダメージが出た').toEqual([]);
    expect(b.e.stunUntil, '何にも当たっていないのに気絶した').toBeFalsy();
    expect(startX - b.e.x, `走った距離が maxCells（${d.maxCells}）でない`).toBeCloseTo(d.maxCells, 6);
  });

  test('⑨ 実アリーナ：立って待つと溜め（.dash-windup）→突進→轢かれる（HP -atk）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOAR_URL());
    await page.keyboard.press('g');                  // HP を測るので debug OFF

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      const p = g.getPlayer();
      const start = { hp: g.getState().player.hp, px: p.x, py: p.y, t: g.getState().gameTime };
      const e0 = g.getEnemies()[0];
      const tr = [];
      for (let i = 1; i <= 20; i++) {
        g.step(1);
        const s = g.getState(), e = g.getEnemies()[0];
        const el = document.getElementById(`char-enemy-${e.id}`);
        tr.push({
          i, t: s.gameTime, x: e.x, y: e.y, dir: e.dir,
          phase: e.dashPhase ?? null, left: e.dashLeft ?? null,
          stun: e.stunUntil ?? null, hp: s.player.hp,
          cls: !!el?.classList.contains('dash-windup'),
        });
        if (s.player.hp < start.hp) break;
      }
      return { start, enemy0: { x: e0.x, y: e0.y }, tr };
    });

    expect(res.start.t, '前提：計測開始時点で論理時間が進んでいない').toBe(0);
    expect([res.enemy0.x, res.enemy0.y], '前提：敵は (x9,y4)').toEqual([9, 4]);
    expect([res.start.px, res.start.py], '前提：プレイヤーは (x1,y4)＝敵と同じ行の西端').toEqual([1, 4]);

    const d = D(), m = M();
    const windupTicks = d.windupMs / TICK_MS;
    // 溜めは1 tick 目から立つ（置いた瞬間に軸に入っている）
    expect(res.tr[0].phase, '軸に入れても溜めが立たない').toBe('windup');
    expect(res.tr[0].dir, '突進の向きがプレイヤー側（西）でない').toBe('left');
    for (let i = 0; i < windupTicks; i++) {
      expect(res.tr[i].phase, `tick${res.tr[i].i}：溜めが ${windupTicks} tick 続かない`).toBe('windup');
      expect(res.tr[i].x, `tick${res.tr[i].i}：溜め中に動いた`).toBe(9);
      expect(res.tr[i].hp, `tick${res.tr[i].i}：溜め中にダメージを受けた`).toBe(res.start.hp);
      // ★ 溜めモーションは**溜めている間だけ**出る（機構の告知＝GUIDE §6-1）
      expect(res.tr[i].cls, `tick${res.tr[i].i}：.dash-windup が付いていない＝溜めが見えない`).toBe(true);
    }
    // 走行中はモーションを外す（走っている絵が足踏みのままだと嘘になる）
    for (const r of res.tr.filter(r => r.phase === 'run')) {
      expect(r.cls, `tick${r.i}：走行中も .dash-windup が付いている`).toBe(false);
    }
    // 実アリーナでも 1.5 セル/tick で走る（歩き 0.25 の6倍）
    const run = res.tr.filter(r => r.phase === 'run' && r.x < 9);
    expect(run.length, '走行が観測できない').toBeGreaterThan(1);
    expect(run[0].x - run[1].x, `実アリーナの走行速度が dash.speed（${d.speed}）でない`)
      .toBeCloseTo(d.speed, 6);
    // 轢かれる＝atk ぶん減る・気絶はしない
    const hit = res.tr[res.tr.length - 1];
    expect(res.start.hp - hit.hp, '轢かれたダメージが atk と違う（debug が切れていない？）').toBe(m.atk);
    expect(hit.stun, '接触で敵が気絶した＝避けなかった側が反撃の窓をもらっている').toBeFalsy();
    expect(errors).toEqual([]);
  });

  test('⑩ 実アリーナ：軸から1セル外れると壁に激突＝気絶（⭐）／気絶明けに即・再突進しない',
    async ({ page }) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await gotoFrozen(page, BOAR_URL());
      await page.keyboard.press('g');                // HP を測るので debug OFF

      const res = await page.evaluate(({ windupTicks }) => {
        const g = window.__game;
        g.pause();
        const p = g.getPlayer();
        const startHp = g.getState().player.hp;
        const tr = [];
        for (let i = 1; i <= 34; i++) {
          // 溜めを見た＝軸から1セル南へ外れる（実プレイの答え）
          if (i === windupTicks) p.y = 5;
          g.step(1);
          const s = g.getState(), e = g.getEnemies()[0];
          tr.push({
            i, t: s.gameTime, x: e.x, y: e.y,
            phase: e.dashPhase ?? null, until: e.dashUntil ?? null,
            stun: e.stunUntil ?? null, hp: s.player.hp,
            burst: document.querySelectorAll('.stun-burst').length,
          });
        }
        return { startHp, tr };
      }, { windupTicks: D().windupMs / TICK_MS });

      const d = D();
      const crash = res.tr.find(r => r.stun != null && r.stun > 0);
      expect(crash, '軸から外れたのに壁に激突しない（気絶が起きない）').toBeTruthy();
      expect(crash.stun, '気絶の長さが stunMs でない').toBe(crash.t + d.stunMs);
      expect(crash.x, '壁を越えて走り抜けた（当たり判定を飛び越している）').toBeGreaterThan(0);
      // ★ ⭐ が出る＝「今は殴り放題」の告知（気絶に気づかないと機構が死ぬ＝GUIDE §6-1）
      expect(crash.burst, '激突しても ⭐ が出ない＝反撃の窓が見えない').toBeGreaterThan(0);
      // 気絶中は動かない（殴りに近寄れる窓）
      const stunned = res.tr.filter(r => r.t > crash.t && r.t < crash.stun);
      expect(stunned.length, '気絶の窓が観測できていない').toBeGreaterThan(0);
      for (const r of stunned) {
        expect(r.x, `tick${r.i}：気絶中に動いた`).toBe(crash.x);
        expect(r.phase, `tick${r.i}：気絶中に溜め/走行へ入った`).toBe('recover');
      }
      // ★ 気絶が明けても硬直が残る＝反撃の窓の直後にもう一度轢かれない
      //   （enemy-ai.js cancelDash が recover を畳まないことの番人）
      const afterStun = res.tr.filter(r => r.t >= crash.stun && r.t < crash.t + d.stunMs + d.cooldownMs);
      expect(afterStun.length, '気絶明けの硬直の窓が観測できていない').toBeGreaterThan(0);
      for (const r of afterStun) {
        expect(r.phase, `tick${r.i}：気絶が明けた直後に突進を始めた（硬直が畳まれている）`)
          .toBe('recover');
      }
      // 避け切ったのだから、この間ずっと無傷
      for (const r of res.tr.filter(r => r.t < crash.t + d.stunMs + d.cooldownMs)) {
        expect(r.hp, `tick${r.i}：軸から外れたのにダメージを受けた`).toBe(res.startHp);
      }
      expect(errors).toEqual([]);
    });

  test('⑪ 溜め中に殴って止めれば突進は消える（スタンで中断＝反応の余地）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOAR_URL());
    await page.keyboard.press('g');                  // HP を測るので debug OFF

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      const startHp = g.getState().player.hp;
      // 溜めが立つのを待つ
      let armed = null;
      for (let i = 1; i <= 6; i++) {
        g.step(1);
        const e = g.getEnemies()[0];
        if (e.dashPhase === 'windup') { armed = { i, id: e.id, x: e.x }; break; }
      }
      if (!armed) return { armed: null };
      // 6 tick ぶん止める（下で見る 5 tick が全部スタンの窓に収まる長さ＝
      // 窓を跨ぐと「スタンが明けて溜め直した」姿を「中断できていない」と読み違える）
      g.stunEnemy(armed.id, 720);
      const tr = [];
      for (let i = 1; i <= 5; i++) {
        g.step(1);
        const s = g.getState(), e = g.getEnemies()[0];
        const el = document.getElementById(`char-enemy-${e.id}`);
        tr.push({
          i, x: e.x, phase: e.dashPhase ?? null, hp: s.player.hp,
          cls: !!el?.classList.contains('dash-windup'),
        });
      }
      return { armed, startHp, tr };
    });

    expect(res.armed, '溜めが立たない（前提が崩れている）').toBeTruthy();
    for (const r of res.tr) {
      expect(r.phase, `tick${r.i}：スタンしても溜め/走行が残っている＝止めたのに突進して来る`)
        .toBe('idle');
      expect(r.x, `tick${r.i}：スタン中に走った`).toBe(res.armed.x);
      expect(r.cls, `tick${r.i}：スタンしたのに溜めモーションが残っている`).toBe(false);
      expect(r.hp, `tick${r.i}：スタン中の敵にダメージを受けた`).toBe(res.startHp);
    }
    expect(errors).toEqual([]);
  });

  test('⑫ エディタのパレットに突進猪が並ぶ（置けない敵は死蔵になる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(EDITOR);
    // ⚠ パレットは初期状態でパネルが畳まれていて visible にならない（DOM には在る）∴'attached'。
    await page.waitForSelector('#tile-palette .tile-btn', { state: 'attached' });
    const btn = page.locator('#tile-palette .tile-btn[title="突進猪"]');
    await expect(btn, "突進猪（'ω'）がパレットに無い＝エディタで配置できない").toHaveCount(1);
    await expect(btn.locator('canvas'), '突進猪がスプライトで描かれていない').toHaveCount(1);
    expect(errors, 'エディタで pageerror').toEqual([]);
  });

  // ライブマップは手編集できる＝検証ステージの幾何は黙って変わる（GUIDE §4-3）。
  test('⑬ 検証ステージの幾何が前提どおり（外周＋通路・遮蔽ゼロ・敵(4,9)・助走路と西壁）', () => {
    const sd = MAP.layers[TEST_LAYER]?.stages?.[stageKey('charge_boar')];
    expect(sd, 'charge_boar のステージが無い').toBeTruthy();
    const grid = (sd.tiles ?? []).map(r => (Array.isArray(r) ? r : String(r).split('')));
    expect(grid.length, 'rows が 10 でない').toBe(10);
    const enemyCells = [];
    for (let r = 0; r < grid.length; r++) {
      expect(grid[r].length, `row ${r} の cols が 12 でない`).toBe(12);
      for (let c = 0; c < grid[r].length; c++) {
        const t = grid[r][c];
        const onEdge = r === 0 || r === grid.length - 1 || c === 0 || c === grid[r].length - 1;
        if (onEdge) {
          if (isArenaDoor(r, c, grid[r].length)) {
            expect(t, `通路 (${r},${c}) が塞がれている＝隣のアリーナへ歩いて行けない`).toBe(TILE.FLOOR);
          } else {
            expect(t, `外周 (${r},${c}) が壁でない（通路は rows ${ARENA_DOOR_ROWS.join('/')} だけ）`)
              .toBe(TILE.WALL);
          }
        } else if (t === TILE.CHARGE_BOAR) {
          enemyCells.push([r, c]);
        } else {
          expect(t, `内部 (${r},${c}) が素の床でない＝宣言していない遮蔽がある`).toBe(TILE.FLOOR);
        }
      }
    }
    expect(enemyCells, '突進猪は1体だけ置く').toHaveLength(1);
    const [er, ec] = enemyCells[0];
    expect([er, ec], '敵の位置が (4,9) でない（他の検証ステージと揃えている）').toEqual([4, 9]);
    expect(sd.enemyDirs?.[`${er},${ec}`], '敵の向きが left（プレイヤー側）でない').toBe('left');
    // ★ probe(4,1) の前提＝同じ行・突進の間合いの内側・助走路が一直線・その先が西の外壁
    const d = D();
    const [pr, pc] = [4, 1];
    expect(pr, 'probe が敵と同じ行でない＝突進が始まらない').toBe(er);
    const dist = Math.abs(pc - ec);
    expect(dist, `probe の距離 ${dist} が突進の間合い [${d.minRange}, ${d.maxRange}] の外`)
      .toBeGreaterThanOrEqual(d.minRange);
    expect(dist, `probe の距離 ${dist} が maxRange の外`).toBeLessThanOrEqual(d.maxRange);
    for (let c = pc; c < ec; c++) {
      expect(grid[pr][c], `助走路 (${pr},${c}) が床でない＝probe に着く前に激突する`).toBe(TILE.FLOOR);
    }
    expect(grid[pr][pc - 1], 'probe の先が外壁でない＝軸から外れても激突する壁が無い').toBe(TILE.WALL);
    // 軸から1セル外れる余地（避け方が盤面で成立している）
    expect(grid[pr + 1][pc], 'probe の南が床でない＝軸から外れられない').toBe(TILE.FLOOR);
    expect(grid[pr - 1][pc], 'probe の北が床でない＝軸から外れられない').toBe(TILE.FLOOR);
    // 気絶を殴りに回り込める（敵の四方が床）
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      expect(grid[er + dr][ec + dc], `敵の隣 (${er + dr},${ec + dc}) が床でない＝気絶を殴りに行けない`)
        .toBe(TILE.FLOOR);
    }
  });
});
