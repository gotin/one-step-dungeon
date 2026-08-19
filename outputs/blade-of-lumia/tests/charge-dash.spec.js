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
// 絵（k-9b・2026-08-19）＝手で組んだ 32×32（.scratch/draw-k9.mjs）。
//   chargeBoar        … 待機2枚（脚が交互に出る＝鈍足で歩く）
//   chargeBoarWindup  … 溜め（立ったまま頭を下げ背の剛毛が鋸歯に立つ＝上端が待機より高い）
//   chargeBoarStun    … 気絶（胴が床に落ち脚が消え鬣が寝て眼が閉じる＝背が縮む）
// 差し替えは enemy-ai.js `syncDashSprite`（leap の windup・甲羅の開閉と同じ作法）。
// ★ 溜めと気絶は**体の高さ**で見分ける（どちらも頭が下がる）∴②は高さの関係も押さえる。
// ★ 突進猪は **sideView（横向き反転）と単一フレームのポーズ絵を同時に持つ最初の敵**＝
//   `applySideFacing` が dataset を書くだけでは反転が画面に出ない（redrawAnimSprites は
//   `frames.length > 1` しか描き直さない）∴⑭が canvas の中身（牙の左右）で押さえる。
//
// ── 歯の実測（2026-08-18・k-9b 分を 2026-08-19 に追記。機構を1つずつ壊して**実際に**
//    赤くなった本を書いた。計測は .scratch/probe-dash-teeth.mjs＝置換／末尾追記→spec 実行→
//    復元を1機構ずつ。`ONLY=部分文字列` で1項だけ測り直せる）──────────
//   壊したもの → 赤くなった本（27 通りで赤が出た／歯なし 1＝下の★）
//     溜めを 0 にする（予告なしで突進）                        → ⑥⑨⑭
//     当たり判定を slam の十字（slamReachHit）に戻す           → ⑦⑩⑭  ← k-9a で実際に踏んだバグ
//     軸判定（off > alignTol）を消す＝どこに居ても突進する      → ④
//     間合い判定（minRange/maxRange）を消す                    → ④
//     接触判定（dashReachHit）を消す                           → ⑥
//     進めない理由がプレイヤーでも「激突」にする                → ⑦
//     壁に激突しても気絶しない（stunUntil を立てない）          → ⑦⑩⑭
//     硬直に気絶ぶんを足さない（endDash が cooldownMs だけ）    → ⑦⑩
//     cancelDash が硬直（recover）も畳む                       → ⑩
//     スタンで突進を中断しない（enemyTick の cancelDash を外す）→ ⑪
//     溜めの class 付け外し（syncDashMotion）を削る             → ⑨
//     ⭐（showDashStun）を出さない                             → ⑩
//     歩幅の細分（MOVE_STEP 補間）をやめて speed ぶん飛ばす      → ⑥⑧⑨
//     突進中も通常の攻撃を呼ぶ（`!dashing` ゲートを外す）        → ⑩
//     board.css の `.dash-windup` 規則を無効化                  → ③
//     dash.alignTol を 1.5 にする（1セル外れても突進が始まる）  → ①⑤⑦⑩⑭
//     dash.minRange を 1.0 にする（slam の間合いと重なる）      → ①
//     歩きを速くする（speed 2.0＝突進の意味が消える）           → ①
//   ── k-9b（絵）の分 ────────────────────────────────
//     待機を既存絵（火吐き亀）のエイリアスに戻す                → ②⑭
//     溜めの絵を待機と同じにする（ポーズ差が無い）              → ②
//     気絶の絵を登録しない（差替が黙って空振りする）            → ②⑩⑭
//     溜めを気絶と同じ高さにする（高さで見分けられない）        → ②
//     末尾の syncDashSprite を呼ばない                          → ⑨⑩⑭
//     スタン枝の syncDashSprite を呼ばない                      → ⑪
//     applySideFacing の描き直しを消す（dataset だけに戻す）    → ⑭   ← k-9b で実際に踏んだ欠陥
//     ポーズ差替の反転を e.flipX から取る（旧実装）             → ⑭
//   ★ 歯なし1件：syncDashSprite の「気絶を溜めより先に見る」順序（逆にしても全部緑）＝
//     スタンに入った tick の cancelDash が windup を畳む∴「気絶かつ溜め」が作れない
//     ＝二重の守り（cancelDash の畳み方を変えたときに効く）。
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
// 溜めは playSound('dashWindup')・壁の激突は playSound('doorLock') を鳴らす∴Node に
// AudioContext の張り子を置く（鳴らさない実装に変えると音が消えたことに気づけない＝黙らせない）。
// ★ 張り子は**鳴った音の周波数と開始時刻を記録する**＝⑮がそれを読んで「溜めに音が付いている・
//   激突とは別の音・溜めの窓に収まる」を測る（`playSound` は import 済みの関数∴DI で差し替え
//   られない＝音の観測点は AudioContext しかない）。ctx.currentTime は 0 固定∴t はそのまま
//   「playSound を呼んでから何秒後に鳴り始めるか」になる。
const TONES = [];                     // { f: 周波数, t: 開始秒 }（張り子が push する）
const tonesSince = (n) => TONES.slice(n);
const freqsOf = (list) => list.map(o => o.f);
function stubAudio() {
  if (globalThis.window?.AudioContext) return;
  const gainNode = () => ({
    gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    connect() {},
  });
  const oscNode = () => ({
    type: '',
    frequency: { setValueAtTime(f, t) { TONES.push({ f, t }); } },
    connect() {}, start() {}, stop() {},
  });
  globalThis.window = {
    ...(globalThis.window ?? {}),
    AudioContext: function () {
      return { currentTime: 0, destination: {}, createOscillator: oscNode, createGain: gainNode };
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

  test('② タイル定義・実絵（32×32・待機2枚＋溜め＋気絶）・パレット（床に沈まない色）', () => {
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
    // ★ k-9b: ポーズ絵が登録されていること＝enemy-ai.js syncDashSprite の差替先。
    //   未登録だと swapEnemySprite が黙って何もしない（敵は消えないが**状態が絵に出ない**）
    //   ∴「絵が無い」ことがテストで赤くならない＝ここで名前と中身を押さえる。
    const WINDUP = `${m.sprite}Windup`, STUN = `${m.sprite}Stun`;
    for (const name of [WINDUP, STUN]) {
      expect(ENEMY_SPRITES[name], `${name} が無い＝溜め／気絶の絵が出ない（差替が黙って空振りする）`)
        .toBeTruthy();
    }
    // ★ 実絵の寸法＝32×32（他の陸上敵と同じ土台。drawSprite は grid の大きさをそのまま
    //   canvas の大きさにする∴行数が違うと表示倍率がずれて他の敵と並ばない）。
    for (const name of [m.sprite, WINDUP, STUN]) {
      for (const [k, g] of ENEMY_SPRITES[name].entries()) {
        expect(g.length, `${name}[${k}] の行数が 32 でない＝他の敵と大きさが揃わない`).toBe(32);
        for (const row of g) expect(row.length, `${name}[${k}] の列数が 32 でない`).toBe(32);
      }
    }
    expect(ENEMY_SPRITES[WINDUP].length, '溜めは単一フレーム（揺れは CSS が持つ）').toBe(1);
    expect(ENEMY_SPRITES[STUN].length, '気絶は単一フレーム（動かないのが気絶）').toBe(1);
    // ★ フレーム差＝歩行が動いて見える下限（SPRITE-PIPELINE §6 の数え方＝17ドット）。
    //   エイリアス（同じ絵の使い回し）や「脚を1ドットずらした」絵はここで赤くなる。
    const dots = (a, b) => {
      let n = 0;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (a[y][x] !== b[y][x]) n++;
      return n;
    };
    const [idle1, idle2] = ENEMY_SPRITES[m.sprite];
    const windup = ENEMY_SPRITES[WINDUP][0], stun = ENEMY_SPRITES[STUN][0];
    expect(dots(idle1, idle2), '待機2枚の差が 17ドット未満＝止まって見える').toBeGreaterThanOrEqual(17);
    // ★ ポーズ差の下限は 48ドット＝**一瞬でも別の姿だと分かる**（待機の歩行差より大きい）
    expect(dots(idle1, windup), '待機と溜めの差が 48ドット未満＝予告が絵で読めない')
      .toBeGreaterThanOrEqual(48);
    expect(dots(idle1, stun), '待機と気絶の差が 48ドット未満＝殴り放題の窓が絵で読めない')
      .toBeGreaterThanOrEqual(48);
    expect(dots(windup, stun), '溜めと気絶の差が 48ドット未満＝予告と反撃の窓を取り違える')
      .toBeGreaterThanOrEqual(48);
    // ★ 溜めと気絶は**体の高さ**で見分ける（どちらも頭が下がる∴頭の位置では区別できない）。
    //   溜め＝立ったまま剛毛が立つ（上端が待機より高い）／気絶＝床に潰れて脚が消える
    //   （上端が待機より低い＝背が縮む）。ここが逆になると避け方を取り違える（GUIDE §6-1）。
    const topOf = (g) => g.findIndex(r => r.some(v => v));
    const heightOf = (g) => g.filter(r => r.some(v => v)).length;
    expect(topOf(windup), '溜めの上端が待機より低い＝剛毛が立っていない（予告が背で読めない）')
      .toBeLessThan(topOf(idle1));
    expect(topOf(stun), '気絶の上端が待機より高い＝潰れていない（気絶が背で読めない）')
      .toBeGreaterThan(topOf(idle1));
    expect(heightOf(stun), '気絶の背が溜めと同じか高い＝2つのポーズが高さで見分けられない')
      .toBeLessThan(heightOf(windup));

    // パレットの色番号がスプライトの最大値をカバーしていること（欠けると描画で落ちる）
    const pal = ENEMY_PAL[m.pal];
    expect(pal, 'ENEMY_PAL.chargeBoar が無い').toBeTruthy();
    const maxIdx = Math.max(...[m.sprite, WINDUP, STUN].flatMap(n => ENEMY_SPRITES[n].flat(2)));
    expect(pal.length, `パレットの色数が足りない（最大の色番号 ${maxIdx}）`).toBeGreaterThan(maxIdx);
    // 逆向きの門＝**使っていない色を残さない**（パレットだけ増やして絵が古いのを防ぐ）
    expect(maxIdx, 'パレットに絵で使われていない色がある＝絵とパレットが食い違っている')
      .toBe(pal.length - 1);
    // 床に沈まない色（輪郭＝index 1 だけは床より暗くて良い＝輪郭は暗いから見える）
    expect(lumOf(pal[1]), '輪郭が床より明るい＝輪郭線として効かない').toBeLessThan(FLOOR_LUM);
    for (const hex of pal.slice(2)) {
      expect(lumOf(hex), `パレットの色 ${hex} が石床（輝度 ${FLOOR_LUM}）より暗い＝床に沈む`)
        .toBeGreaterThan(FLOOR_LUM);
    }
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
          spr: e.sprite ?? null,
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
      // ★ k-9b: 絵そのものも溜めの姿（頭を下げ剛毛が立つ）へ替わる＝揺れだけでは
      //   「体当たりの予告」と見分けられない（避け方が違う＝GUIDE §6-1）
      expect(res.tr[i].spr, `tick${res.tr[i].i}：溜めの絵に替わっていない`).toBe('chargeBoarWindup');
    }
    // 走行中はモーションを外す（走っている絵が足踏みのままだと嘘になる）
    for (const r of res.tr.filter(r => r.phase === 'run')) {
      expect(r.cls, `tick${r.i}：走行中も .dash-windup が付いている`).toBe(false);
      expect(r.spr, `tick${r.i}：走行中も溜めの絵のまま＝走り出したことが読めない`).toBe('chargeBoar');
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
            spr: e.sprite ?? null,
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
      // ★ k-9b: ⭐ は 720ms で消える∴**絵そのものが気絶を持続的に名指す**（潰れて脚が消える）
      expect(crash.spr, '激突した tick に気絶の絵へ替わっていない').toBe('chargeBoarStun');
      // 気絶中は動かない（殴りに近寄れる窓）
      const stunned = res.tr.filter(r => r.t > crash.t && r.t < crash.stun);
      expect(stunned.length, '気絶の窓が観測できていない').toBeGreaterThan(0);
      for (const r of stunned) {
        expect(r.x, `tick${r.i}：気絶中に動いた`).toBe(crash.x);
        expect(r.phase, `tick${r.i}：気絶中に溜め/走行へ入った`).toBe('recover');
        expect(r.spr, `tick${r.i}：気絶の窓なのに絵が待機へ戻っている＝殴り放題が読めない`)
          .toBe('chargeBoarStun');
      }
      // ★ 気絶が明けても硬直が残る＝反撃の窓の直後にもう一度轢かれない
      //   （enemy-ai.js cancelDash が recover を畳まないことの番人）
      const afterStun = res.tr.filter(r => r.t >= crash.stun && r.t < crash.t + d.stunMs + d.cooldownMs);
      expect(afterStun.length, '気絶明けの硬直の窓が観測できていない').toBeGreaterThan(0);
      for (const r of afterStun) {
        expect(r.phase, `tick${r.i}：気絶が明けた直後に突進を始めた（硬直が畳まれている）`)
          .toBe('recover');
        // ★ 気絶が明けたら絵も起き上がる＝「まだ殴り放題」と誤読させない（硬直は無敵ではない
        //   が反撃は返って来る∴潰れたままの絵は嘘になる）
        expect(r.spr, `tick${r.i}：気絶が明けても潰れた絵のまま＝窓が続いているように見える`)
          .toBe('chargeBoar');
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
          spr: e.sprite ?? null,
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
      // ★ k-9b: 絵も溜めから気絶へ落ちる（止めた手応え）。ここが無いと
      //   「溜めの姿で固まった猪」＝止めたのにまだ来るように見える（GUIDE §6-1）。
      expect(r.spr, `tick${r.i}：スタンしても溜めの絵のまま＝止めた手応えが絵に出ない`)
        .toBe('chargeBoarStun');
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

  test('⑭ 溜め／気絶のポーズも左右反転が実際に描かれる（sideView × 単一フレーム）',
    async ({ page }) => {
      // ⚠️ 2026-08-19 に見つけた欠陥の番人。突進猪は **sideView（横向き＝プレイヤーの側へ
      //    canvas を反転）とポーズ差替（溜め/気絶）を同時に持つ最初の敵**。
      //    applySideFacing は `cv.dataset.flipX` を書くだけで、実際の描き直しは
      //    redrawAnimSprites（アニメループ）に任せていた＝あれは `frames.length > 1` しか
      //    描き直さない∴**単一フレームの溜め/気絶は反転が画面に出ず**「左へ突進しながら
      //    右を向いて溜める」絵になっていた。dataset だけを見るテストではこれが通ってしまう
      //    ∴canvas の中身（牙＝白 #f0e6d0 がどちら側にあるか）で押さえる。
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await gotoFrozen(page, BOAR_URL());

      const res = await page.evaluate(({ windupTicks }) => {
        const g = window.__game;
        g.pause();
        const p = g.getPlayer();
        // 牙（白＝パレット index 5 #f0e6d0）が canvas の左半分／右半分のどちらに在るか。
        // 素の絵は右向き（牙は右）∴プレイヤーが西にいる＝反転していれば牙は左に出る。
        const probe = () => {
          const e = g.getEnemies()[0];
          // id は posKey（'4,9'）＝セレクタに埋められない∴getElementById で引く
          const cv = document.getElementById(`char-enemy-${e.id}`)?.querySelector('canvas.sprite');
          if (!cv) return { spr: e.sprite ?? null, cv: null };
          const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
          let left = 0, right = 0;
          for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
            const i = (y * cv.width + x) * 4;
            if (px[i + 3] > 0 && px[i] >= 240 && px[i + 1] >= 224 && px[i + 2] >= 200) {
              if (x < cv.width / 2) left++; else right++;
            }
          }
          return { spr: e.sprite ?? null, w: cv.width, h: cv.height, flip: cv.dataset.flipX ?? '', left, right };
        };
        const out = { idle: null, windup: null, windupEast: null, stun: null, stunEast: null };
        // ① 待機（プレイヤーは西＝反転している）
        out.idle = probe();
        // ② 溜め（軸に入っている＝置いた次の tick から windup・最後の1 tick は③に残す）
        for (let i = 1; i < windupTicks; i++) g.step(1);
        out.windup = probe();
        // ③ 溜めの最後の tick でプレイヤーが東へ回り込む＝**溜めの絵のまま向きだけ変わる**
        //   （走る方向は溜めの開始で確定済み∴向き直っても西へ走る）。
        p.x = 11;
        g.step(1);
        out.windupEast = probe();
        // ④ 気絶（プレイヤーは西へ戻って軸から1セル外れる＝西壁に激突させる）
        p.x = 1; p.y = 5;
        for (let i = 1; i <= 12 && !(g.getEnemies()[0].stunUntil > 0); i++) g.step(1);
        out.stun = probe();
        // ⑤ 気絶中にプレイヤーが東へ回り込む＝**向きは変わらない**（気絶は反応しない）
        p.x = 11; p.y = 4;
        g.step(1);
        out.stunEast = probe();
        return out;
      }, { windupTicks: D().windupMs / TICK_MS });

      expect(res.idle.spr, '前提：待機の絵で始まっていない').toBe('chargeBoar');
      expect(res.windup.spr, '前提：溜めの絵に替わっていない').toBe('chargeBoarWindup');
      expect(res.stun.spr, '前提：気絶の絵に替わっていない').toBe('chargeBoarStun');
      for (const [name, r] of [['待機', res.idle], ['溜め', res.windup], ['気絶', res.stun]]) {
        expect(r.w, `${name}：canvas の幅が 32 でない`).toBe(32);
        expect(r.flip, `${name}：プレイヤーが西なのに dataset.flipX が立っていない`).toBe('1');
        expect(r.left + r.right, `${name}：牙（白）が1ドットも描かれていない`).toBeGreaterThan(0);
        expect(r.right, `${name}：反転しているのに牙が右にある＝canvas が描き直されていない`).toBe(0);
        expect(r.left, `${name}：牙が左に出ていない＝反転が画面に出ていない`).toBeGreaterThan(0);
      }
      // ★ ここが本命の歯：**溜めの絵（単一フレーム）のまま**プレイヤー側へ向き直る。
      //   dataset だけ書いて描き直しをアニメループに任せていた実装では、flip は '' になるのに
      //   牙は左に描かれたまま＝「東を向いた」と読めない絵になる（この2本が同時に赤くなる）。
      expect(res.windupEast.spr, '溜めの途中で絵が解けた（向き直りで待機へ戻った）')
        .toBe('chargeBoarWindup');
      expect(res.windupEast.flip, 'プレイヤーが東なのに反転が残っている').toBe('');
      expect(res.windupEast.left, '東へ回り込んでも牙が左のまま＝溜めの canvas が描き直されていない')
        .toBe(0);
      expect(res.windupEast.right, '東へ回り込んだのに牙が右に出ない').toBeGreaterThan(0);
      // ★ 気絶中は向き直らない＝**気絶は反応しない**（enemyTick はスタン枝で全行動を止める）。
      //   ここが変わると「潰れているのに顔だけ追って来る」＝殴り放題の窓が読めなくなる。
      expect(res.stunEast.spr, '気絶中に絵が解けた').toBe('chargeBoarStun');
      expect(res.stunEast.flip, '気絶中にプレイヤーを追って向き直った＝気絶が反応している')
        .toBe(res.stun.flip);
      expect(res.stunEast.left, '気絶中に牙の側が変わった＝向きが動いている').toBe(res.stun.left);
      expect(errors).toEqual([]);
    });

  test('⑮ 溜めに音が付く＝低い唸りが上がっていく・激突音とは別・窓に収まる（純関数）', () => {
    // 予告は絵（`.dash-windup` ＋ Windup ポーズ）だけでは足りない＝**画面の端で溜められると
    // プレイヤーは気づけない**（ユーザー指摘 2026-08-19）。∴溜めにも音を出す。
    // ⚠️ 激突音（doorLock）と同じ音にしてはいけない＝聞き分けるのは「これから来る（避けろ）」と
    //    「止まった（殴れる）」の2つ∴同じ音では機構が音から読めない。
    const d = D();
    const player = { x: 1, y: 9 };                   // まず軸から外れて立つ
    const b = bench({ player, wallAt: 0.5 });
    const windupTicks = d.windupMs / TICK_MS;

    // ① 突進が始まらない tick は無音（毎 tick 無条件に鳴らす実装を弾く）
    const silentMark = TONES.length;
    for (let i = 1; i <= 3; i++) b.step(i);
    expect(b.e._dashPhase, '前提：軸から外れているのに溜めへ入った').toBe('idle');
    expect(tonesSince(silentMark), '突進を始めていない tick に音が鳴った').toEqual([]);

    // ② 軸に入った tick＝溜めの音が鳴る
    player.y = 4;
    const windupMark = TONES.length;
    b.step(4);
    expect(b.e._dashPhase, '前提：軸に入ったのに溜めへ入らない').toBe('windup');
    const windup = tonesSince(windupMark);
    expect(windup.length, '溜めに音が付いていない（予告が絵だけ＝画面の端では気づけない）')
      .toBeGreaterThan(0);
    // 唸り＝低音（獣が溜めていると分かる高さ）／段で上がる＝溜まっていくことを音程で伝える。
    // ⚠️ 「2音以上」だと3段のうち1段を高音に変えても緑になった（歯の実測 2026-08-19）∴
    //    段の数（3）と底の低さ（100Hz 未満）の両方で押さえる。
    const growl = freqsOf(windup).filter(f => f < 200);
    expect(growl.length, '溜めの低い唸り（200Hz 未満）が3段に足りない＝唸りに聞こえない')
      .toBeGreaterThanOrEqual(3);
    expect(Math.min(...growl), '唸りの底が 100Hz 以上＝獣が溜めている低さでない')
      .toBeLessThan(100);
    for (let k = 1; k < growl.length; k++) {
      expect(growl[k], `唸りの ${k + 1} 音目が前より低い＝溜まっていくことが音程で伝わらない`)
        .toBeGreaterThan(growl[k - 1]);
    }
    // ★ 音は溜めの窓（windupMs）の中で鳴り終わる＝走り出した後に唸りが遅れて始まらない
    expect(Math.max(...windup.map(o => o.t)) * 1000,
      `溜めの音が windupMs（${d.windupMs}）を過ぎてから鳴り始める＝もう走っている`)
      .toBeLessThan(d.windupMs);

    // ③ 溜めが続く間は鳴り直さない（毎 tick 鳴らすと1回の突進で唸りが連発する）
    const holdMark = TONES.length;
    for (let i = 5; i < 4 + windupTicks; i++) b.step(i);
    expect(b.e._dashPhase, '前提：溜めが windupMs 続いていない').toBe('windup');
    expect(tonesSince(holdMark), '溜めの間に音が鳴り直した＝唸りが連発する').toEqual([]);

    // ④ 激突音は溜めと**別の音**＝「来る」と「止まった」を聞き分けられる
    player.y = 5;                                    // 軸から外れる＝西壁へ激突する
    const crashMark = TONES.length;
    for (let i = 4 + windupTicks; i <= 40; i++) { b.step(i); if (b.e.stunUntil) break; }
    expect(b.e.stunUntil, '前提：壁に激突していない').toBeTruthy();
    const crash = tonesSince(crashMark);
    expect(crash.length, '激突に音が鳴っていない（壁にぶつかった音は残す）').toBeGreaterThan(0);
    expect(freqsOf(crash).join(','),
      '溜めと激突が同じ音＝「これから来る」と「止まった」を音で聞き分けられない')
      .not.toBe(freqsOf(windup).join(','));
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
