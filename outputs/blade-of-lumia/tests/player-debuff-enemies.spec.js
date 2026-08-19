// tests/player-debuff-enemies.spec.js — Phase 5.5k k-7「プレイヤー側の一時デバフ窓」（解禁2体）
//
// k-7 で足したのは**プレイヤー側に立つ一時デバフの窓**（game/debuff.js）。既存の敵は
// 「HP を削る」以外の結果を持てなかった＝敵の手札が「痛い／速い／硬い」しか無かった。
// 窓は敵側の攻撃ポーズ窓（`e._atkUntil`）とまったく同型の論理時間（gameNow 基準）：
//
//   ① 呪い火 CURSE_FIRE ('ψ') … `inflict:{ type:'sealSword', ms }`
//        体当たりを受けると数秒**剣が振れない**（＋チャージも始まらない・溜め中なら中断される）。
//        ・体当たりのダメージは最小（atk 1）＝この敵の攻撃は「痛み」ではなく「手を1つ奪うこと」
//        ・**サブアイテム（弓/爆弾/ブーメラン）は封じない**＝名簿 #13「妨害特化＝弓/爆弾で処理」
//        ・**会話・看板も封じない**＝封じたら詰みかねない（ゲートを置く位置がその契約）
//        ・`move:'air'`＝水/溶岩を越えて追ってくる＝地形では撒けない（走って距離を取る）
//   ② 毒沼ヒル POISON_LEECH ('Γ') … `inflict:{ type:'poison', ms, tickMs, damage, decay }`
//        体当たりを受けると継続ダメージ。tickMs ごとに刻み、1刻みごとに decay だけ弱まる（下限1）。
//        ・**毒は無敵窓を貫通する**（被弾無敵の間も刻む）＝無敵は「HP を守る窓」であって
//          「当てられた事実」を消す窓ではない
//        ・**毒は無敵窓を与えない**＝毒を盾に使えない（受けている方が安全にならない）
//        ・鈍足（SLOW）＝出会った瞬間は無害に見えるが体当たり1回の実効は 打撃1＋毒3＝4
//
// 検証ステージ＝test_mechanics[39,0] `curse_fire` / [40,0] `poison_leech`
// （scripts/migrate-test-player-debuff-arenas.mjs が自己検査付きで生成。座標は `stageKey()`）。
// ⚠️ `curse_fire` のアリーナだけ**遮蔽ゼロではない**＝看板 `i`(5,4) が「宣言された例外」。
//    probe(4,4) の真南に置いてあり、⑩「封じ中でも看板は読める」を同じ盤面で測るためにある
//    （消すと「封印中は看板も読めない」実装に戻っても赤くならない）。
// 外周は壁だが**左右 rows 7/8 は隣のアリーナへの通路**（tests/test-arena-doors.js）∴塞がない。
//
// tick 換算（TICK_MS=120・step() が論理時間を 120ms 進める・tick i の now = 120×i）：
//   呪い火の封印   … ms 3000 ＝ 25 tick（当てられた tick の now + 3000 が窓の終わり）
//   毒の窓         … ms 2400 ＝ 20 tick／刻み tickMs 1200 ＝ 10 tick ごと（窓の中で2回）
//   被弾無敵       … INVINCIBLE_MS 1500 ＝ 12.5 tick ∴**毒の1刻み目（+10 tick）は
//                    無敵窓の内側に来る**＝「毒は無敵窓を貫通する」の歯が数値の側で立つ
//                    （migrate スクリプトが tickMs < INVINCIBLE_MS を検査している）
//   体当たり       … 予告 SLAM_WINDUP_MS 280（3 tick 後に解決）／クールダウン
//                    SLAM_COOLDOWN_MS 900（8 tick）／到達 SLAM_RANGE 1.5
//                    ∴当たり→次の当たりは 11 tick 間隔（実測 1320ms→2640ms）
//
// ⚠ **k-7.5（2026-08-17）でデバフの入口が変わった。** 接触ダメージは廃止された
//   （ユーザー決定②「接触だけでは攻撃を受けることはないようにする」）∴デバフが立つのは
//   **体当たり（slam）の予告が解決した tick だけ**（enemy-ai.js `tickSlam`）：
//     ① 敵が到達距離（1.5）に入った tick に予告が立つ（`getEnemies()[0].slamAt` が非 null）
//     ② 予告中（280ms＝3 tick）は敵は動かず攻撃もしない＝**この間はまだ無傷**
//     ③ 解決の tick に到達判定をやり直し、当たっていればダメージ＋`meta.inflict` のデバフ
//   ∴測り方は「敵に重ねて 1 tick」から**「隣に立って予告の解決を待つ」**に変わった。
//   実測（置いて待つだけ＝実プレイの形）：呪い火 t14 予告→t17 被弾（now 2040）／
//   毒沼ヒル t12 予告→t15 被弾（now 1800）。毎tick 敵の西隣（dist 1.0）へ置き直す場合は
//   どちらも t8 予告→t11 被弾（クールダウンの初期値 0 ＝ now 900 まで最初の予告が出ない）。
// ⚠ **もう「敵に重ねる」ことはできない**＝passable.js が連続座標の AABB で重なりを禁じた
//   （決定①）∴敵も自力で dist 1.0 より詰められない。重ねてもダメージは起きない
//   （旧 spec の `p.x = e.x; p.y = e.y` に戻すと全部の本が赤くなる）。
// ⚠ 計測は1回の evaluate 内で完結させ、冒頭で pause() → gameTime===0 を assert する。
//   実時間ループは `gotoFrozen()` でそもそも起動させない（k-4/k-5/k-6 spec と同じ理由）。
// ⚠ プレビュー（fromEditor=1）は debugMode:true ＝ takeDamage が早期 return する∴
//   **プレイヤーの HP を測る本だけ** 'g' で debug を切る。デバフ窓そのものは
//   takeDamage の結果に関係なく立つ（tickSlam は takeDamage の後に inflictDebuff を
//   呼ぶ）∴HP を見ない本は debug を切らない＝HP のノイズが混ざらない。
// ⚠ **体当たりは 11 tick ごとに再発火する**（張り付かれている限り窓は伸び続ける）。
//   窓の終わりを測る本は、当たった後に**毎tick「敵から最も遠い隅」へ置き直す**：
//   隅を固定するだけでは足りない＝敵は追って来てまた体当たりする（窓が伸びて境界が測れない）。
// ⚠ gameTick の順番は tickCharge() → enemyTick()（この中で tickSlam）→ tickPlayerDebuffs()。
//   ∴当てられた tick では**チャージはまだ生きている**（同じ tick の tickCharge は
//   封印より前に走り終えている）＝溜めの中断は次の tick で起きる（⑧ が 1 tick 余分に
//   進める理由）。デバフの窓そのものは当てられた tick の gameTime を基点に立つ。
// ⚠ k-7a 時点のスプライトは既存絵のエイリアス（GUIDE §2「機構が先・絵は後」）∴絵の中身は
//   主張せず、名前解決と「デバフ状態が DOM のクラスとして出ること」だけを固定する。
//   実描き（32×32・1枚＋左右反転）は k-7b の担当。
//
// ── 歯の実測（2026-08-17・機構を1つずつ壊して赤くなる本を数えた。k-7.5 で更新）──────
//   debuff.js inflictDebuff の sealSword 分岐を削る ………………………… ⑤⑥⑦⑧⑨⑩
//   debuff.js inflictDebuff の poison 分岐を削る …………………………… ⑪⑫⑬⑭⑮
//   debuff.js 毒の再発火で `_poisonNextAt` を毎回引き直す（修正前の形）… ⑮
//   debuff.js tickPlayerDebuffs の毒の while を削る ……………………… ⑫⑬⑭⑮
//   debuff.js の takeDamage から `ignoreInvincible` を外す ……………… ⑫⑬⑭
//   debuff.js の takeDamage から `noInvincible` を外す …………………… ⑭
//   debuff.js tickPlayerDebuffs の封印の解除（`_sealUntil=null`）を削る … ⑨
//   combat.js swordAttack の封印ゲートを削る ………………………………… ⑥⑦
//   combat.js の封印ゲートを NPC/看板の分岐より**前**へ動かす ………… ⑩
//   charge.js canAct() の `!isSwordSealed?.()` を削る ……………………… ⑧
//   enemy-ai.js tickSlam の `inflictDebuff` 呼び出しを削る ……………… ⑤〜⑮（11本）
//   enemy-ai.js の予告（startSlam）を飛ばして即ダメージにする ………… ⑤⑪（対照が死ぬ）
//   render-chars.js の `sealed` の class 切り替えを削る …………………… ⑤
//   render-chars.js の `poisoned` の class 切り替えを削る ………………… ⑪
//   save.js sanitizeLoadedPlayer の窓クリアを削る …………………………… ⑰
// ※ ①②③④⑯ はデータ／配置の番人（実行時の機構ではない）∴上の破壊では動かない。
// ※ 体当たりそのものの機構（予告の長さ・盾で防げない・重なり禁止）は
//    tests/slam-attack.spec.js が番人（この本はデバフの窓だけを見る）。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { ENEMY_META, ENEMY_SPEED_FAST } from '../shared/enemies.js';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { ITEM_META } from '../shared/items.js';
import { TICK_MS, INVINCIBLE_MS, SLAM_RANGE, SLAM_WINDUP_MS } from '../game/constants.js';
import { sanitizeLoadedPlayer } from '../game/save.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { isArenaDoor, arenaDoorCells, ARENA_DOOR_ROWS } from './test-arena-doors.js';
import { placedCells, stageIdOf, PLACEMENT_STAGES } from './enemy-placed.js';

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

// 敵はどちらも (4,9)＝x9,y4。計測に使う立ち位置（migrate スクリプトが幾何を検査している）。
// 寄って来る速さ＝1 tick あたり MOVE_STEP(0.5)×speed セル（enemyChase は accum が 1.0 に
// 達した tick だけ半セル動く）∴隣（dist 1.0）まで詰めるのに要る tick は
// (dist - 1.0) / (0.5 × speed)：
//   呪い火    … (4,4)＝同じ行・dist 5.0・速度 0.5  ∴ 14 tick で到達距離 1.5・17 tick で被弾
//   毒沼ヒル  … (4,6)＝同じ行・dist 3.0・速度 0.25 ∴ 12 tick で到達距離 1.5・15 tick で被弾
// ⚠ 敵は dist 1.0 より詰められない（重なり禁止＝決定①）が、到達距離 1.5 から体当たりできる
//   ∴**置いて待つだけで当てられる**（k-7a の「重ねて接触を作る」は不要になった）。
const CURSE  = (extra) => previewUrl('curse_fire',   4, 4, extra);
const POISON = (extra) => previewUrl('poison_leech', 4, 6, extra);

// 体当たりを1回受ける型（evaluate は別コンテキストなので関数を渡せない＝各テストで同じ形を書く）：
//   for (let i = 1; i <= 20; i++) {                       // 予告の解決を待つ
//     const e = g.getEnemies()[0]; p.x = e.x - 1; p.y = e.y;   // 毎tick 西隣（dist 1.0）へ置き直す
//     g.step(1);
//     if (g.getState().player.<デバフ>) { /* この tick で当てられた */ break; }
//   }
// 当てられた論理時刻＝step 後の gameTime（step は TICK_MS 足してから gameTick を回す）。
// 逃げる型（窓の終わりを測る本）＝毎tick「敵から最も遠い隅」へ置き直す：
//   const e = g.getEnemies()[0]; p.x = e.x >= 5.5 ? 1 : 10; p.y = e.y >= 4.5 ? 1 : 8;
// これで最接近 4.5 以上を保てる（到達距離 1.5 の外＝再発火しない）。

// 実時間ループ（game.js startGameLoop = setInterval(() => step(1), TICK_MS)）を
// ページ評価の**前に**無効化する（k-4/k-5/k-6 spec と同じ仕掛け）。
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

const K7 = [
  [TILE.CURSE_FIRE,   '呪い火',   'curseFire',   'sealSword'],
  [TILE.POISON_LEECH, '毒沼ヒル', 'poisonLeech', 'poison'],
];
// 石床の相対輝度（shared/sprites-tiles.js stoneFloor＝暗部 #2a2838=41.6・明部 #3a3848=57.6）。
// 敵の色がこれ以下だと床に沈んで輪郭が見えない（k-4/k-5/k-6 で実際に起きた欠陥）。
const FLOOR_LUM = 57.6;
const lumOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
const threatOf = (m) => (m.hp * m.atk) / (m.def + 1);
const CURSE_M  = () => ENEMY_META[TILE.CURSE_FIRE];
const POISON_M = () => ENEMY_META[TILE.POISON_LEECH];
// game.js の初期プレイヤー（hp 6 / maxHearts 3＝2hp が 1 ハート）。
// 「体当たり1回で何ハート持って行かれるか」の校正に使う（③ の名簿の脅威度は打撃の
// ダメージしか値踏みしない＝デバフの重さはこの数字で見る）。
const START_HP = 6;

test.describe('Phase 5.5k k-7 – プレイヤー側の一時デバフ窓（呪い火・毒沼ヒル）', () => {

  test('① 2種の定義（記号タイル・非ボス・脅威度と速度の上限・デバフの数値の整合）', () => {
    expect(TILE.CURSE_FIRE, 'TILE.CURSE_FIRE が未定義').toBe('ψ');
    expect(TILE.POISON_LEECH, 'TILE.POISON_LEECH が未定義').toBe('Γ');

    for (const [tile, name, , inflictType] of K7) {
      const m = ENEMY_META[tile];
      expect(m, `ENEMY_META['${tile}'] が無い`).toBeTruthy();
      expect(m.name, `${tile} の名前`).toBe(name);
      expect(m.isBoss, `${name} は通常敵`).toBeFalsy();
      // 通常敵の最強格＝剣獣（脅威度 10）を超えない
      expect(threatOf(m), `${name} の脅威度が剣獣（10）以上＝通常敵の最強格を追い越している`)
        .toBeLessThan(threatOf(ENEMY_META[TILE.SWORD_BEAST]));
      // GUIDE §7-2＝敵はプレイヤー（速度換算 1.0）より必ず遅い
      expect(m.speed, `${name} がプレイヤーと同速以上＝振り切れない`).toBeLessThan(ENEMY_SPEED_FAST);
      // 体当たり（charge）が機構の入口＝遠隔攻撃を持たない
      // （持つと「近づかずに掛かった」＝予告を見て間合いを外す答えが無い敵になる）
      expect(m.attack?.type, `${name} は体当たり専門（charge）でない`).toBe('charge');
      expect(m.inflict?.type, `${name} の inflict の型`).toBe(inflictType);
      // 窓の長さは tick の整数倍＝観測 tick が揺れない
      expect(m.inflict.ms % TICK_MS, `${name} の inflict.ms が tick の整数倍でない`).toBe(0);
      expect(m.inflict.ms, `${name} の窓が 0 以下＝掛かった瞬間に切れる`).toBeGreaterThan(0);
      // k-7b で描いた絵は 1 種＋左右反転＝向き別スプライトは持たない（PLAN k-7b）
      expect(m.directional, `${name} は向き別スプライトを持たない（1枚＋左右反転）`).toBeFalsy();
      expect(m.guards, `${name} はガードしない（k-4 の機構は持たせない）`).toBeFalsy();
    }

    // ① 呪い火＝「痛み」ではなく「手を奪う」敵。体当たりのダメージが大きいと
    //    「剣を封じられたこと」より「削られたこと」が主題になってしまう。
    const c = CURSE_M();
    expect(c.atk, '呪い火の体当たりのダメージが大きい＝妨害ではなく痛みが主題になっている')
      .toBeLessThanOrEqual(1);
    expect(c.move, '呪い火が飛行でない＝水/溶岩の向こうへ逃げれば無力化できてしまう').toBe('air');
    expect(c.inflict.ms, '封印が短すぎる＝封じられたことに気づかない').toBeGreaterThanOrEqual(TICK_MS * 10);

    // ② 毒沼ヒル＝毒の総量の校正。**体当たり1回で即死級にしない**こと。
    //    刻む回数は窓 ÷ 間隔（割り切れることは migrate スクリプトが検査）。
    const p = POISON_M().inflict;
    expect(p.tickMs, '毒の刻み間隔が無い＝刻まない').toBeGreaterThan(0);
    expect(p.ms % p.tickMs, '窓が刻み間隔で割り切れない＝刻む回数が定まらない').toBe(0);
    expect(p.damage, '毒の1刻み目のダメージが無い').toBeGreaterThan(0);
    expect(p.decay, '毒の減衰が無い＝名簿 #15 の「時間で減衰」になっていない').toBeGreaterThan(0);
    // 「1刻み目が痛く、後は弱く長く」＝減衰は1刻み目より小さい（初手で下限に落ちない）
    expect(p.decay, '減衰が1刻み目以上＝2刻み目でいきなり下限になる').toBeLessThan(p.damage);
    let dmg = p.damage, total = 0;
    for (let i = 0; i < p.ms / p.tickMs; i++) { total += dmg; dmg = Math.max(1, dmg - p.decay); }
    expect(total + POISON_M().atk, `体当たり1回の実効ダメージ（打撃+毒=${total + POISON_M().atk}）が`
      + `初期プレイヤーの HP（${START_HP}）以上＝1回当てられたら即死する`)
      .toBeLessThan(START_HP);
    // ★ 毒の1刻み目が被弾無敵の内側に来る＝「無敵窓を貫通する」が観測できる配置
    expect(p.tickMs, '毒の刻み間隔が被弾無敵以上＝1刻み目が無敵の外に来る'
      + '∴「毒は無敵窓を貫通する」を壊しても赤くならない').toBeLessThan(INVINCIBLE_MS);

    // 機構の取り違え防止（呪い火に毒の数値／毒沼ヒルに封印は無い）
    expect(c.inflict.tickMs, '呪い火に毒の刻み間隔がある＝型が混ざっている').toBeUndefined();
    expect(POISON_M().inflict.type, '毒沼ヒルが剣を封じている＝型が混ざっている').not.toBe('sealSword');
  });

  test('② タイル定義・専用スプライト・パレットの名前解決（k-7b で描いた 32×32・2フレーム）', () => {
    for (const [tile, name, pal] of K7) {
      const meta = ENEMY_META[tile];
      expect(TILE_META[tile], `TILE_META['${tile}'] が無い＝エディタに出ない`).toBeTruthy();
      expect(TILE_META[tile].label, `${name} のラベル`).toBe(name);
      expect(TILE_META[tile].passable, '敵タイルは通行可（下は床）').toBe(true);
      expect(meta.pal, `${name} の pal 名`).toBe(pal);
      // k-7b＝**専用の絵**（k-7a の「既存絵のエイリアス」から差し替えた）。他の敵の名前に
      // 戻っていないことを名前で押さえる＝呪い火がコウモリの姿だと機構が読めない（GUIDE §6-1）。
      expect(meta.sprite, `${name} のスプライトが専用のものでない（他の敵の絵を借りている）`).toBe(pal);
      expect(ENEMY_PAL[pal], `${pal} パレットが無い`).toBeTruthy();
      expect(ENEMY_PAL[pal][0], 'index0 は透明').toBe('transparent');
      // ⚠️ 色は石床より明るいこと＝床に沈むと「居ることに気づけない」（k-4〜k-6 で実際に起きた）
      for (const c of ENEMY_PAL[pal].slice(1)) {
        expect(lumOf(c), `${pal} の色 ${c} が石床の明部（${FLOOR_LUM}）より暗い＝床に沈む`)
          .toBeGreaterThan(FLOOR_LUM);
      }
      expect(ENEMY_SPRITES[meta.sprite], `${meta.sprite} が無い＝盤面で絵が消える`).toBeTruthy();
      // 2フレーム＝この2体は「動き」（炎の揺らぎ・体の伸縮）が本質（SPRITE-PIPELINE.md §3-1 ★★）
      expect(ENEMY_SPRITES[meta.sprite].length, `${meta.sprite} が2フレームでない＝動かない`).toBe(2);
      for (const frame of ENEMY_SPRITES[meta.sprite]) {
        expect(frame.length, `${meta.sprite} が 32 行でない`).toBe(32);
        for (const row of frame) expect(row.length, `${meta.sprite} の行が 32 列でない`).toBe(32);
      }
      // フレーム差＝17ドット以上（§6 の歩行2の下限。これ未満だと 400ms 交替でも動いて見えない）
      const [f1, f2] = ENEMY_SPRITES[meta.sprite];
      let diff = 0;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (f1[y][x] !== f2[y][x]) diff++;
      expect(diff, `${meta.sprite} の2フレームの差が ${diff} ドット＝動いて見えない`)
        .toBeGreaterThanOrEqual(17);
      // パレットを使い切っているか＝面/陰/縁/警告色が揃っていないと「単色の塊」になる
      const used = new Set(f1.flat().filter((v) => v));
      expect(used.size, `${meta.sprite} が ${used.size} 色しか使っていない＝陰影や警告色が無い`)
        .toBeGreaterThanOrEqual(5);
      // タイル→スプライトは shared/tile-sprites.js が単一の真実（エディタとゲームで分けない）
      expect(TILE_SPRITE_MAP[tile], 'スプライトマップが無い（描画で消える）').toBeTruthy();
      expect(TILE_SPRITE_MAP[tile].spr, 'スプライトマップの spr がメタと食い違う').toBe(meta.sprite);
      expect(TILE_SPRITE_MAP[tile].pal, 'スプライトマップの pal がメタと食い違う').toBe(meta.pal);
    }
  });

  test('③ エディタのパレットに2種が並ぶ（置けない敵は死蔵になる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(EDITOR);
    // ⚠ パレットは初期状態でパネルが畳まれていて visible にならない（DOM には在る）∴'attached'。
    await page.waitForSelector('#tile-palette .tile-btn', { state: 'attached' });

    for (const [tile, name] of K7) {
      const btn = page.locator(`#tile-palette .tile-btn[title="${name}"]`);
      await expect(btn, `${name}（'${tile}'）がパレットに無い＝エディタで配置できない`).toHaveCount(1);
      await expect(btn.locator('canvas'), `${name} がスプライトで描かれていない`).toHaveCount(1);
    }
    expect(errors, 'エディタで pageerror').toEqual([]);
  });

  // ライブマップは手編集できる＝検証ステージの幾何は黙って変わる（GUIDE §4-3）。
  // ⚠️ `curse_fire` は**遮蔽ゼロではない**＝看板 `i`(5,4) が「宣言された例外」。
  //    ⑩（封じ中でも看板は読める）がこのセルに乗っている∴消えたら赤くする。
  test('④ 検証ステージの幾何が前提どおり（外周＋通路・宣言した例外だけ・敵は (4,9) の left）', () => {
    const HOLES = {
      curse_fire:   { '5,4': TILE.SIGN },
      poison_leech: {},
    };
    for (const [name, tile] of [['curse_fire', TILE.CURSE_FIRE], ['poison_leech', TILE.POISON_LEECH]]) {
      const sd = MAP.layers[TEST_LAYER]?.stages?.[stageKey(name)];
      expect(sd, `${name} のステージが無い`).toBeTruthy();
      const grid = (sd.tiles ?? []).map(r => (Array.isArray(r) ? r : String(r).split('')));
      expect(grid.length, `${name}: rows が 10 でない`).toBe(10);
      const holes = HOLES[name];
      const seen = new Set();
      const enemyCells = [];
      for (let r = 0; r < grid.length; r++) {
        expect(grid[r].length, `${name}: row ${r} の cols が 12 でない`).toBe(12);
        for (let c = 0; c < grid[r].length; c++) {
          const t = grid[r][c];
          const onEdge = r === 0 || r === grid.length - 1 || c === 0 || c === grid[r].length - 1;
          if (onEdge) {
            if (isArenaDoor(r, c, grid[r].length)) {
              expect(t, `${name}: 通路 (${r},${c}) が塞がれている＝隣のアリーナへ歩いて行けない`)
                .toBe(TILE.FLOOR);
            } else {
              expect(t, `${name}: 外周 (${r},${c}) が壁でない（通路は rows ${ARENA_DOOR_ROWS.join('/')} だけ）`)
                .toBe(TILE.WALL);
            }
          } else if (t === tile) {
            enemyCells.push(`${r},${c}`);
          } else if (holes[`${r},${c}`] !== undefined) {
            expect(t, `${name}: 宣言した例外セル (${r},${c}) が想定と違う`).toBe(holes[`${r},${c}`]);
            seen.add(`${r},${c}`);
          } else {
            expect(t, `${name}: 内部 (${r},${c}) が素の床でない＝宣言していない遮蔽がある`).toBe(TILE.FLOOR);
          }
        }
      }
      expect([...seen].sort(), `${name}: 宣言した例外セルが盤面から消えている（機構が測れなくなる）`)
        .toEqual(Object.keys(holes).sort());
      expect(enemyCells, `${name}: 敵は (4,9) に1体だけ`).toEqual(['4,9']);
      expect(sd.enemyDirs, `${name}: 置かれた向きが left でない`).toEqual({ '4,9': 'left' });
      // 通路は「歩いて隣へ行ける」ことが目的＝1つ内側も床（game.js arrivalIsWall）
      for (const [r, c] of arenaDoorCells(grid[0].length)) {
        const inner = c === 0 ? 1 : grid[0].length - 2;
        expect(grid[r][inner], `${name}: 通路 (${r},${c}) の内側 (${r},${inner}) が床でない＝通れない`)
          .toBe(TILE.FLOOR);
      }
      // 敵の4近傍は床（立ち位置を変えて何度も体当たりを受ける余裕を残す）
      for (const [dr, dc, label] of [[1, 0, '南'], [-1, 0, '北'], [0, 1, '東'], [0, -1, '西']]) {
        expect(grid[4 + dr][9 + dc], `${name}: 敵の${label}隣が床でない`).toBe(TILE.FLOOR);
      }
    }

    // ★ 呪い火のアリーナ＝看板が probe(4,4) の**真南**にあり、本文が入っていること。
    //   `i` タイルは本文が無いと「（何も書かれていない）」の無言看板になる＝
    //   「読めた」ことを測っても機構の証明にならない（[[blade-sign-two-formats]]）。
    const curse = MAP.layers[TEST_LAYER].stages[stageKey('curse_fire')];
    const sign = curse.signData?.['5,4'];
    expect(sign?.lines?.length, '看板(5,4) に本文が無い＝⑩ が「読めた」ことを測れない')
      .toBeGreaterThan(0);
  });

  // ── 呪い火（剣封じ）─────────────────────────────────────────────────────
  // ⑤ は k-7.5 の芯を測る本＝「隣接しただけでは何も起きない／体当たりの**予告が解決した
  //    tick に**封じられる」（ユーザー決定②③）。プレイヤーは**一度も動かさない**＝
  //    実プレイの形（置いて待つだけで敵が寄って来て体当たりする）のまま測る。
  test('⑤ 体当たりの解決で剣封じの窓が立つ（対照＝到達距離に入っただけ・予告中は無傷）＋状態が絵に出る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, CURSE());

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const s0 = g.getState();
      const out = {
        enemy: g.getEnemies(),
        px: s0.player.x, py: s0.player.y,
        before: { sealUntil: s0.player.sealUntil, sealed: s0.player.swordSealed,
                  cls: document.getElementById('char-player')?.classList.contains('sealed') },
        trace: [],
      };
      // プレイヤーは動かさない（実プレイの形）。敵が寄って来て予告→解決するまでを記録する。
      for (let i = 1; i <= 24; i++) {
        g.step(1);
        const s = g.getState();
        const e = g.getEnemies()[0];
        out.trace.push({
          i, t: s.gameTime,
          dist: Math.hypot(e.x - s.player.x, e.y - s.player.y),
          slamAt: e.slamAt ?? null, windupMs: e.slamWindupMs ?? null,
          sealUntil: s.player.sealUntil,
        });
      }
      const s = g.getState();
      out.cls = document.getElementById('char-player')?.classList.contains('sealed');
      out.sealed = s.player.swordSealed;
      out.poisoned = s.player.poisoned;   // 呪い火は毒を持たない（型の取り違え防止）
      return out;
    });

    const m = CURSE_M();
    expect(res.enemy.length, '前提：呪い火が1体だけ居る').toBe(1);
    expect(res.enemy[0].type, '前提：置かれた敵が呪い火').toBe(TILE.CURSE_FIRE);
    expect([res.py, res.px], '前提：プレイヤーは (4,4)').toEqual([4, 4]);
    expect(res.before, '対照：開始時点で既に封じられている').toEqual({ sealUntil: null, sealed: false, cls: false });

    const tr = res.trace;
    // ★ 決定①：どの tick でも重ならない（最接近は 1.0＝隣のセル）
    const distMin = Math.min(...tr.map(r => r.dist));
    expect(distMin, '敵が寄って来ていない（速度・追跡・幾何が変わった？）').toBeLessThanOrEqual(1.05);
    expect(distMin, '敵がプレイヤーに重なった＝重なり禁止（決定①）が外れている')
      .toBeGreaterThanOrEqual(1.0);
    // ★ 予告は「到達距離に入った tick」に立つ（それより遠い間は立たない）
    const firstSlam = tr.find(r => r.slamAt != null);
    expect(firstSlam, '敵が体当たりの予告を出さない＝寄って来るだけの無害な敵になっている').toBeTruthy();
    expect(firstSlam.dist, `予告が到達距離（${SLAM_RANGE}）の外で立っている`)
      .toBeLessThanOrEqual(SLAM_RANGE + 0.001);
    expect(tr.filter(r => r.i < firstSlam.i).every(r => r.dist > SLAM_RANGE),
      '到達距離の外の tick で予告が立っている（間合いを外しても攻撃される）').toBe(true);
    expect(firstSlam.windupMs, `予告の長さが SLAM_WINDUP_MS（${SLAM_WINDUP_MS}）でない`).toBe(SLAM_WINDUP_MS);
    expect(firstSlam.slamAt, '予告の解決時刻が「予告を立てた時刻＋windup」でない')
      .toBe(firstSlam.t + SLAM_WINDUP_MS);
    // ★★ 決定②③の芯＝**隣接しただけ・予告中はまだ封じられていない**
    //    （ここが赤くなる実装＝到達距離に入った瞬間にダメージ＝予告を見て避けられない）
    const windupTicks = tr.filter(r => r.slamAt != null);
    expect(windupTicks.length, '予告中の tick が記録されていない＝予告が一瞬で解決している'
      + `（windup ${SLAM_WINDUP_MS}ms は ${Math.ceil(SLAM_WINDUP_MS / TICK_MS)} tick 分ある）`)
      .toBeGreaterThanOrEqual(2);
    expect(windupTicks.every(r => r.sealUntil === null),
      '予告中に封じられている＝「隣接したら即攻撃」に戻っている（予告を見て下がる余地が無い）').toBe(true);
    // ★ 封じられるのは**予告が解決した tick**＝予告の次の tick 群のうち slamAt が消えた最初
    const hitIdx = tr.findIndex((r, i) => i > 0 && tr[i - 1].slamAt != null && r.slamAt == null);
    const hit = tr[hitIdx];
    expect(hit, '予告が解決していない（予告が立ったまま宙に浮いている）').toBeTruthy();
    const firstSealed = tr.find(r => r.sealUntil != null);
    expect(firstSealed?.i, '封印が立つ tick が「予告が解決した tick」と違う').toBe(hit.i);
    expect(hit.dist, '前提：解決の tick に敵が到達距離の中に居ない（空振りを測っている）')
      .toBeLessThanOrEqual(SLAM_RANGE + 0.001);
    // ★ 窓は「当てられた論理時刻 + ms」＝論理時間で立つ（実時間の setTimeout ではない）
    expect(hit.sealUntil, '封印の窓が inflict.ms と合わない').toBe(hit.t + m.inflict.ms);
    expect(res.sealed, '封印が立たない').toBe(true);
    // ★ 絵に出る（GUIDE §6-1＝「剣が出ない」だけではバグに見える）
    expect(res.cls, 'プレイヤーに .sealed が付いていない＝封じられた理由が画面に出ていない').toBe(true);
    expect(res.poisoned, '呪い火の体当たりで毒になっている＝デバフの型が混ざっている').toBe(false);
    expect(errors).toEqual([]);
  });

  test('⑥ 封じられている間は剣が敵に当たらない（対照＝同じ間合いで封じ前は当たる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, CURSE());

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const p = g.getPlayer();
      const out = { atk: g.getPlayer().atk, sealedSwings: [] };

      // ⚠ **gameTime 0 では剣は振れない**（実測：hp 3→3・1 tick 進めると 3→1）。
      //   combat.js のクールダウンが `now - getLastSwordTime() < SWORD_COOLDOWN_MS`
      //   ＝時刻 0 では最後に振った時刻の初期値 0 との差が 0 < 100 ∴無条件に return する。
      //   ∴計測は必ず 1 tick 進めてから始める（k-4/k-5 spec も swordAttack の前に step(1)）。
      //   ここで 1 tick 進めても敵は動かない（速度 0.5＝accum が 1.0 に届くのは 2 tick 目）。
      g.step(1);

      // ── 対照：封じられる前に、同じ間合い（敵の西隣 dist 1.0）から殴る＝当たる
      const e0 = g.getEnemies()[0];
      p.x = e0.x - 1; p.y = e0.y;
      g.setHeroDir('right');
      out.hpBefore = g.getEnemies()[0].hp;
      out.sealedAtControl = g.getState().player.swordSealed;
      g.swordAttack();
      out.hpAfterControl = g.getEnemies()[0].hp;

      // ── 本番：体当たりを受けて封じられた状態を作り、**同じ間合いから同じ振り方**で殴る。
      //   毎tick 敵の西隣（dist 1.0）に置き直して予告の解決を待つ（実測 t11 で当たる）。
      for (let i = 1; i <= 20; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x - 1; p.y = e.y;
        g.step(1);
        if (g.getState().player.swordSealed) break;
      }
      out.sealed = g.getState().player.swordSealed;
      out.hpSealed0 = g.getEnemies()[0]?.hp;
      for (let i = 1; i <= 5; i++) {
        const e = g.getEnemies()[0];
        if (!e) break;
        // 毎回「敵の西隣 dist 1.0」へ置き直す＝対照とまったく同じ幾何で振る
        p.x = e.x - 1; p.y = e.y;
        g.setHeroDir('right');
        g.swordAttack();
        out.sealedSwings.push({ i, sealed: g.getState().player.swordSealed, hp: g.getEnemies()[0]?.hp });
        g.step(1);
      }
      out.hpSealed1 = g.getEnemies()[0]?.hp;
      return out;
    });

    // 対照が効いていること＝この間合い・この向きなら剣は届く（本番の主張が空にならない）
    expect(res.sealedAtControl, '対照：もう封じられている（体当たりより先に封印が立っている？）').toBe(false);
    expect(res.hpBefore - res.hpAfterControl, '対照：封じられていないのに剣が当たっていない'
      + '（間合い・向き・SWORD_REACH が変わった？）').toBe(res.atk);
    // 本番＝封じられている間は1回も削れない
    expect(res.sealed, '体当たりを受けても封印が立たない').toBe(true);
    expect(res.sealedSwings.length, '封印中の試行が行われていない').toBe(5);
    expect(res.sealedSwings.every(r => r.sealed), '振っている途中で封印が切れた＝この本は封印中を測れていない')
      .toBe(true);
    expect(res.hpSealed1, '封じられているのに剣が当たっている＝swordAttack のゲートが効いていない')
      .toBe(res.hpSealed0);
    expect(errors).toEqual([]);
  });

  test('⑦ 封じられていても弓は撃てる（妨害特化＝サブ武器で処理する敵）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, CURSE({ ps_bow: '1' }));

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const p = g.getPlayer();
      const out = { activeSubItem: g.getState().player.activeSubItem };
      // 体当たりを受けて封じられる（毎tick 西隣に置き直して予告の解決を待つ）
      for (let i = 1; i <= 20; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x - 1; p.y = e.y;
        g.step(1);
        if (g.getState().player.swordSealed) break;
      }
      out.sealed = g.getState().player.swordSealed;
      const e = g.getEnemies()[0];
      p.x = e.x - 1; p.y = e.y;
      g.setHeroDir('right');
      // 剣＝通らない（同じ tick・同じ向き・同じ間合い）
      out.hp0 = g.getEnemies()[0].hp;
      g.swordAttack();
      out.hpAfterSword = g.getEnemies()[0].hp;
      out.projAfterSword = g.getProjectiles().length;
      // 弓＝通る（封印の対象外＝input.js の別経路）
      g.useSubItem();
      out.proj = g.getProjectiles()[0] ?? null;
      out.sealedNow = g.getState().player.swordSealed;
      // 矢は実際に敵を削る（「撃てた」が「効かない」の言い換えにならないように）
      for (let i = 1; i <= 6; i++) { g.step(1); if (!g.getEnemies()[0] || g.getEnemies()[0].hp < out.hp0) break; }
      out.hpAfterArrow = g.getEnemies()[0]?.hp ?? 0;
      return out;
    });

    expect(res.activeSubItem, '前提：弓が選ばれている').toBe('bow');
    expect(res.sealed, '体当たりを受けても封印が立たない').toBe(true);
    expect(res.sealedNow, '弓を使う時点で封印が切れている＝この本は封印中を測れていない').toBe(true);
    expect(res.hpAfterSword, '対照：封じられているのに剣が当たっている').toBe(res.hp0);
    expect(res.projAfterSword, '剣がビーム等を出している（封印中に何か飛んだ）').toBe(0);
    expect(res.proj, '封じられている間に弓が撃てない＝妨害特化（弓/爆弾で処理）が成立しない')
      .toMatchObject({ owner: 'player', type: 'arrow' });
    expect(res.hpAfterArrow, '撃った矢が敵を削っていない').toBeLessThan(res.hp0);
    expect(errors).toEqual([]);
  });

  test('⑧ 封じ中はチャージを始められない／溜め中に封じられたら中断される', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, CURSE());

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const p = g.getPlayer();
      g.equipSwordTier(1);            // 銅の剣＝ビーム可（SWORD_TIERS[1].beam）
      g.setHeroDir('down');           // ビームは南の壁へ飛ばす（敵に当てない）
      const out = { tier: g.getState().player.swordTier };

      // ── 対照：封じられていなければ溜めてビームが出る。
      //    ⚠ 溜めている 8 tick の間に体当たりを当てられると封印が立って対照が崩れる∴
      //      毎tick プレイヤーを敵から遠い隅（1,1）へ置き直して到達距離の外に居続ける。
      g.startCharge();
      for (let i = 0; i < 8; i++) { p.x = 1; p.y = 1; g.step(1); }
      out.auraWhileCharging = !!document.querySelector('.charge-aura');
      out.sealedWhileCharging = g.getState().player.swordSealed;
      g.releaseCharge();
      out.beamControl = g.getProjectiles().filter(q => q.type === 'beam').length;
      // 対照のビームを消化する（壁に当たって消えるまで）
      for (let i = 0; i < 12 && g.getProjectiles().length; i++) { p.x = 1; p.y = 1; g.step(1); }
      out.projBeforeSeal = g.getProjectiles().length;

      // ── 本番(a)：溜めている最中に封じられたら中断される
      // ⚠ **オーラは溜め始めの 2 tick 目から見える**（実測 [tick0 false, tick1 true]）。
      //   1 tick 目は tickCharge がオーラを足した後に tickAttackPose の
      //   `if (wasIdle) updatePlayerCharEl()` が走り、updatePlayerCharEl の
      //   `el.innerHTML = ''` が同じ tick に足したオーラを消すため（k-7 と無関係の既存挙動）。
      //   ∴「溜め始められている」の前提は 2 tick 進めてから見る。
      g.startCharge();
      for (let i = 0; i < 2; i++) { p.x = 1; p.y = 1; g.step(1); }
      out.auraBeforeContact = !!document.querySelector('.charge-aura');
      // 溜めたまま敵の西隣に立ち続ける＝体当たりを受けて封印が立つ（溜めは中断されるまで続く）
      for (let i = 1; i <= 20; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x - 1; p.y = e.y;
        g.step(1);
        if (g.getState().player.swordSealed) break;
      }
      out.sealed = g.getState().player.swordSealed;
      // ⚠ gameTick は tickCharge() → enemyTick()（tickSlam）の順∴**封じられた tick の
      //   オーラはまだ残っている**（同じ tick の tickCharge は封印より前に走り終えている）。
      //   中断は次の tick の tickCharge が canAct() を見て起きる∴1 tick 余分に進める。
      out.auraSameTick = !!document.querySelector('.charge-aura');
      p.x = 1; p.y = 1;
      g.step(1);
      out.auraAfterSeal = !!document.querySelector('.charge-aura');
      g.releaseCharge();
      out.beamAfterCancel = g.getProjectiles().filter(q => q.type === 'beam').length;

      // ── 本番(b)：封じられている間は新しく溜め始められない
      g.startCharge();
      for (let i = 0; i < 8; i++) g.step(1);
      out.sealedStillB = g.getState().player.swordSealed;
      out.auraDuringB = !!document.querySelector('.charge-aura');
      g.releaseCharge();
      out.beamSealed = g.getProjectiles().filter(q => q.type === 'beam').length;
      return out;
    });

    expect(res.tier, '前提：ビームの出る剣ティアを装備できている').toBe(1);
    // 対照が効いていること（ここが崩れると本番の「出ない」は主張にならない）
    expect(res.sealedWhileCharging, '対照：溜めている間に封じられた（隅への置き直しが効いていない）').toBe(false);
    expect(res.auraWhileCharging, '対照：チャージのオーラが出ていない＝溜まっていない').toBe(true);
    expect(res.beamControl, '対照：封じられていないのにビームが出ない').toBe(1);
    expect(res.projBeforeSeal, '前提：対照のビームが消化できていない').toBe(0);
    // 本番(a)＝溜め中に封じられたら中断（charge.js tickCharge → cancelCharge）
    expect(res.auraBeforeContact, '前提：体当たりを受ける前に溜め始められている').toBe(true);
    expect(res.sealed, '体当たりを受けても封印が立たない').toBe(true);
    expect(res.auraAfterSeal, '封じられてもチャージのオーラが残っている＝中断されていない').toBe(false);
    expect(res.beamAfterCancel, '封じられた後に離してビームが出た＝溜めが中断されていない').toBe(0);
    // 本番(b)＝封じ中は溜め始められない
    expect(res.sealedStillB, '本番(b)：封印が切れている＝封印中を測れていない').toBe(true);
    expect(res.auraDuringB, '封じられているのにチャージのオーラが出た＝canAct の門が効いていない').toBe(false);
    expect(res.beamSealed, '封じられているのにビームが出た＝剣ビームが封印の対象外になっている').toBe(0);
    expect(errors).toEqual([]);
  });

  test('⑨ 封印は窓の境界 tick で切れる（切れたら剣が通る）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, CURSE());

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const p = g.getPlayer();
      const out = {};
      // 体当たりを1回受ける（毎tick 西隣に置き直して予告の解決を待つ）
      for (let i = 1; i <= 20; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x - 1; p.y = e.y;
        g.step(1);
        if (g.getState().player.swordSealed) break;
      }
      out.sealed    = g.getState().player.swordSealed;
      out.sealUntil = g.getState().player.sealUntil;
      out.sealedAt  = g.getState().gameTime;
      // ⚠ 体当たりは 11 tick ごとに再発火する（当たるたび窓が引き直される）∴境界を測る
      //   間は**毎tick「敵から最も遠い隅」へ置き直して**到達距離（1.5）の外に居続ける。
      //   隅を固定するだけでは足りない＝敵は追って来てまた当ててくる（k-7.5 の変化点）。
      let distMin = Infinity;
      for (let i = 1; i <= 40; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x >= 5.5 ? 1 : 10;
        p.y = e.y >= 4.5 ? 1 : 8;
        g.step(1);
        distMin = Math.min(distMin, Math.hypot(g.getEnemies()[0].x - p.x, g.getEnemies()[0].y - p.y));
        out.distMin = distMin;
        const s = g.getState();
        if (!s.player.swordSealed) {
          out.freeTick = i;
          out.freeTime = s.gameTime;
          out.sealUntilAfter = s.player.sealUntil;
          out.cls = document.getElementById('char-player')?.classList.contains('sealed');
          break;
        }
        out.lastSealUntil = s.player.sealUntil;
      }
      // 解けたら剣が通る（対照と同じ間合い・向き）
      const e = g.getEnemies()[0];
      p.x = e.x - 1; p.y = e.y;
      g.setHeroDir('right');
      out.hp0 = g.getEnemies()[0].hp;
      g.swordAttack();
      out.hp1 = g.getEnemies()[0].hp;
      out.atk = p.atk;
      return out;
    });

    const m = CURSE_M();
    expect(res.sealed, '体当たりを受けても封印が立たない').toBe(true);
    expect(res.sealUntil, '封印の窓が inflict.ms と合わない').toBe(res.sealedAt + m.inflict.ms);
    // 前提＝逃げ続けている間は到達距離（1.5）の外に居た＝再発火の余地が無かった
    expect(res.distMin, '逃げているのに到達距離の中に入った＝境界を測る前提が崩れている'
      + '（隅の選び方が敵の動きに追いついていない）').toBeGreaterThan(SLAM_RANGE);
    // 置き直している間に窓が伸びていない＝体当たりの再発火を本当に切れている
    expect(res.lastSealUntil, '隅へ逃げているのに窓が伸びている＝また当てられている')
      .toBe(res.sealUntil);
    expect(res.freeTick, `封印が切れない（${m.inflict.ms / 120} tick 待っても解けない）`).toBeTruthy();
    // ★ 境界＝「gameNow が sealUntil に達した最初の tick」で切れる（早くも遅くもない）
    expect(res.freeTime, '封印が切れる論理時刻が窓の終わりと一致しない').toBe(res.sealUntil);
    expect(res.sealUntilAfter, '窓が切れたのに `_sealUntil` が残っている（掃除されていない）').toBeNull();
    expect(res.cls, '封印が切れてもプレイヤーに .sealed が残っている＝絵が状態と食い違う').toBe(false);
    expect(res.hp0 - res.hp1, '封印が切れても剣が通らない＝ゲートが開かない').toBe(res.atk);
    expect(errors).toEqual([]);
  });

  test('⑩ 封じ中でも看板は読める（ゲートは NPC/看板の分岐より後に置く）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, CURSE());

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const out = {};
      const p = g.getPlayer();
      // 体当たりを受けて封じられ、看板の真北 (4,4) へ戻る
      for (let i = 1; i <= 20; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x - 1; p.y = e.y;
        g.step(1);
        if (g.getState().player.swordSealed) break;
      }
      out.sealed0 = g.getState().player.swordSealed;
      p.x = 4; p.y = 4;
      const s = g.getState();
      out.pos = [s.player.y, s.player.x];
      out.sealed = s.player.swordSealed;
      out.dialogBefore = s.isDialog;
      g.setHeroDir('down');            // 真南の看板(5,4) を向く
      g.swordAttack();                 // 「調べる」は剣キーと同じ入口（combat.js swordAttack）
      const s2 = g.getState();
      out.dialogAfter = s2.isDialog;
      out.sealedAfter = s2.player.swordSealed;
      out.text = document.querySelector('#dialog-box')?.textContent ?? '';
      return out;
    });

    const sign = MAP.layers[TEST_LAYER].stages[stageKey('curse_fire')].signData['5,4'];
    expect(res.sealed0, '体当たりを受けても封印が立たない').toBe(true);
    expect(res.pos, '前提：プレイヤーが看板の真北 (4,4) に居る').toEqual([4, 4]);
    expect(res.sealed, '前提：封じられている').toBe(true);
    expect(res.dialogBefore, '前提：まだダイアログが出ていない').toBe(false);
    // ★ 封じられていても看板は読める＝ゲートを NPC/店/看板の分岐より**後**に置いた契約。
    //   前へ動かすと「封じられている間は人と話せない」＝進行不能になりかねない。
    expect(res.dialogAfter, '封じられていると看板が読めない＝ゲートの位置が NPC/看板より前にある')
      .toBe(true);
    expect(res.text, '看板の本文が表示されていない').toContain(sign.lines[0]);
    expect(res.sealedAfter, '看板を読んだら封印が解けた＝読むことが封印の解除になっている').toBe(true);
    expect(errors).toEqual([]);
  });

  // ── 毒沼ヒル（毒 DoT）───────────────────────────────────────────────────
  // ⑪ は ⑤ の毒版＝「隣接しただけ・予告中は毒にならない／体当たりの解決で毒が立つ」。
  //    こちらもプレイヤーは動かさない（実測：t12 で予告・t15 で被弾）。
  test('⑪ 体当たりの解決で毒の窓が立つ（対照＝到達距離に入っただけ・予告中は無傷）＋状態が絵に出る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, POISON());

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const s0 = g.getState();
      const out = {
        enemy: g.getEnemies(),
        px: s0.player.x, py: s0.player.y,
        before: { until: s0.player.poisonUntil, nextAt: s0.player.poisonNextAt,
                  poisoned: s0.player.poisoned,
                  cls: document.getElementById('char-player')?.classList.contains('poisoned') },
        trace: [],
      };
      // プレイヤーは動かさない。敵が寄って来て予告→解決するまでを記録する。
      for (let i = 1; i <= 22; i++) {
        g.step(1);
        const s = g.getState();
        const e = g.getEnemies()[0];
        out.trace.push({
          i, t: s.gameTime,
          dist: Math.hypot(e.x - s.player.x, e.y - s.player.y),
          slamAt: e.slamAt ?? null, windupMs: e.slamWindupMs ?? null,
          until: s.player.poisonUntil, nextAt: s.player.poisonNextAt, dmg: s.player.poisonDmg,
        });
      }
      const s = g.getState();
      out.poisoned = s.player.poisoned;
      out.sealed   = s.player.swordSealed;     // ヒルは剣を封じない（型の取り違え防止）
      out.cls = document.getElementById('char-player')?.classList.contains('poisoned');
      return out;
    });

    const inf = POISON_M().inflict;
    expect(res.enemy.length, '前提：毒沼ヒルが1体だけ居る').toBe(1);
    expect(res.enemy[0].type, '前提：置かれた敵が毒沼ヒル').toBe(TILE.POISON_LEECH);
    expect([res.py, res.px], '前提：プレイヤーは (4,6)').toEqual([4, 6]);
    expect(res.before, '対照：開始時点で既に毒を受けている')
      .toEqual({ until: null, nextAt: null, poisoned: false, cls: false });

    const tr = res.trace;
    // ★ 決定①：どの tick でも重ならない（最接近は 1.0）
    const distMin = Math.min(...tr.map(r => r.dist));
    expect(distMin, '敵が寄って来ていない（速度・追跡・幾何が変わった？）').toBeLessThanOrEqual(1.05);
    expect(distMin, '敵がプレイヤーに重なった＝重なり禁止（決定①）が外れている')
      .toBeGreaterThanOrEqual(1.0);
    // ★ 予告→解決の順序（⑤ と同じ形＝この2体で機構を共有していることの確認でもある）
    const firstSlam = tr.find(r => r.slamAt != null);
    expect(firstSlam, '敵が体当たりの予告を出さない＝寄って来るだけの無害な敵になっている').toBeTruthy();
    expect(firstSlam.dist, `予告が到達距離（${SLAM_RANGE}）の外で立っている`)
      .toBeLessThanOrEqual(SLAM_RANGE + 0.001);
    expect(firstSlam.windupMs, `予告の長さが SLAM_WINDUP_MS（${SLAM_WINDUP_MS}）でない`).toBe(SLAM_WINDUP_MS);
    // ★★ 決定②③の芯＝隣接しただけ・予告中はまだ毒になっていない
    const windupTicks = tr.filter(r => r.slamAt != null);
    expect(windupTicks.length, '予告中の tick が記録されていない＝予告が一瞬で解決している')
      .toBeGreaterThanOrEqual(2);
    expect(windupTicks.every(r => r.until === null),
      '予告中に毒になっている＝「隣接したら即攻撃」に戻っている（予告を見て下がる余地が無い）').toBe(true);
    // ★ 毒が立つのは予告が解決した tick
    const hitIdx = tr.findIndex((r, i) => i > 0 && tr[i - 1].slamAt != null && r.slamAt == null);
    const hit = tr[hitIdx];
    expect(hit, '予告が解決していない（予告が立ったまま宙に浮いている）').toBeTruthy();
    const firstPoison = tr.find(r => r.until != null);
    expect(firstPoison?.i, '毒が立つ tick が「予告が解決した tick」と違う').toBe(hit.i);
    expect(hit.until, '毒の窓が inflict.ms と合わない').toBe(hit.t + inf.ms);
    expect(hit.nextAt, '毒の1刻み目の予定が inflict.tickMs と合わない').toBe(hit.t + inf.tickMs);
    expect(hit.dmg, '毒の1刻み目のダメージが inflict.damage と合わない').toBe(inf.damage);
    expect(res.poisoned, '毒が立たない').toBe(true);
    expect(res.cls, 'プレイヤーに .poisoned が付いていない＝毒の理由が画面に出ていない').toBe(true);
    expect(res.sealed, '毒沼ヒルの体当たりで剣が封じられている＝デバフの型が混ざっている').toBe(false);
    expect(errors).toEqual([]);
  });

  test('⑫ 毒は tickMs ごとに刻み、1刻みごとに弱まる（窓の終わりで抜ける）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, POISON());
    // ⚠ プレビューは debugMode:true ＝ takeDamage が早期 return する∴'g' で切る。
    await page.keyboard.press('g');

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const p = g.getPlayer();
      const out = { hpStart: g.getState().player.hp, def: g.getState().player.def, drops: [] };
      // 体当たりを1回受ける（毎tick 西隣に置き直して予告の解決を待つ）
      for (let i = 1; i <= 20; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x - 1; p.y = e.y;
        g.step(1);
        if (g.getState().player.poisoned) break;
      }
      let s = g.getState();
      out.poisoned = s.player.poisoned;
      out.hitTime = s.gameTime;
      out.hpAfterHit = s.player.hp;
      out.until = s.player.poisonUntil;
      // ⚠ 隣に居続けると 11 tick ごとに当てられて窓が伸びる∴**毎tick「敵から最も遠い隅」へ
      //   置き直して**到達距離の外に居続ける（後を引く毒だけを測る）。
      let hp = s.player.hp;
      let distMin = Infinity;
      for (let i = 1; i <= 40; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x >= 5.5 ? 1 : 10;
        p.y = e.y >= 4.5 ? 1 : 8;
        g.step(1);
        distMin = Math.min(distMin, Math.hypot(g.getEnemies()[0].x - p.x, g.getEnemies()[0].y - p.y));
        out.distMin = distMin;
        s = g.getState();
        if (s.player.hp < hp) {
          out.drops.push({ at: s.gameTime, dmg: hp - s.player.hp, nextAt: s.player.poisonNextAt });
          hp = s.player.hp;
        }
        if (!s.player.poisoned && !out.clearTime) {
          out.clearTime = s.gameTime;
          out.untilAfter = s.player.poisonUntil;
          out.nextAtAfter = s.player.poisonNextAt;
          out.dmgAfter = s.player.poisonDmg;
          out.cls = document.getElementById('char-player')?.classList.contains('poisoned');
        }
      }
      out.hpEnd = g.getState().player.hp;
      return out;
    });

    const inf = POISON_M().inflict;
    expect(res.def, '前提：防具なし（毒のダメージがそのまま入る）').toBe(0);
    expect(res.poisoned, '体当たりを受けても毒が立たない').toBe(true);
    // 体当たりそのものの打撃ダメージ（毒とは別勘定）
    expect(res.hpStart - res.hpAfterHit, '前提：体当たりのダメージが敵の atk と違う').toBe(POISON_M().atk);
    // 前提＝逃げている間は到達距離の外に居た（また当てられていたら窓が伸びて境界が測れない）
    expect(res.distMin, '逃げているのに到達距離の中に入った＝境界を測る前提が崩れている')
      .toBeGreaterThan(SLAM_RANGE);
    // ★ 刻む回数＝窓 ÷ 間隔（2回）。1刻み目 damage、2刻み目 damage-decay（下限1）。
    const expected = [];
    let dmg = inf.damage;
    for (let i = 1; i <= inf.ms / inf.tickMs; i++) {
      expected.push({ at: res.hitTime + inf.tickMs * i, dmg });
      dmg = Math.max(1, dmg - inf.decay);
    }
    expect(res.drops.map(d => ({ at: d.at, dmg: d.dmg })),
      '毒の刻みが「tickMs ごと・1刻みごとに decay だけ弱まる」になっていない').toEqual(expected);
    // ★ 窓の終わりで抜ける（境界＝gameNow が poisonUntil に達した tick）
    expect(res.clearTime, '毒が抜けない（窓が切れても刻み続ける）').toBe(res.until);
    expect(res.untilAfter, '毒が抜けたのに `_poisonUntil` が残っている').toBeNull();
    expect(res.nextAtAfter, '毒が抜けたのに次の刻みの予定が残っている').toBeNull();
    expect(res.dmgAfter, '毒が抜けたのに威力が残っている').toBeNull();
    expect(res.cls, '毒が抜けてもプレイヤーに .poisoned が残っている＝絵が状態と食い違う').toBe(false);
    // 抜けた後は削られない（「後を引く」は窓の中だけ）
    expect(res.hpEnd, '窓が切れた後も削られている').toBe(res.hpAfterHit - expected.reduce((a, e) => a + e.dmg, 0));
    expect(errors).toEqual([]);
  });

  test('⑬ 毒は無敵窓を貫通する（対照＝同じ窓の中で普通の被弾は防がれる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, POISON());
    await page.keyboard.press('g');

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const p = g.getPlayer();
      const out = {};
      // 体当たりを1回受ける（毒＋打撃ダメージ＋被弾無敵が張る）
      for (let i = 1; i <= 20; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x - 1; p.y = e.y;
        g.step(1);
        if (g.getState().player.poisoned) break;
      }
      let s = g.getState();
      out.poisoned = s.player.poisoned;
      out.hitTime = s.gameTime;
      out.hpAfterHit = s.player.hp;
      out.nextAt = s.player.poisonNextAt;
      // 隅（1,1）へ退いて到達距離の外に出る＝再発火を切る（毒だけが残る）。
      // ⚠ 毒沼ヒルは鈍足（0.125 セル/tick）∴この本の 25 tick 程度では追いつかれない
      //   （固定の隅で足りる。呪い火や 40 tick 級の本は「最も遠い隅」へ毎tick 置き直す）。
      p.x = 1; p.y = 1;
      // ── 対照：被弾無敵の内側で「普通の被弾」（敵の矢）を受ける＝防がれる
      g.injectEnemyProjectile(p.x + 1, p.y, -1, 0, 2, 2);
      for (let i = 0; i < 4; i++) { p.x = 1; p.y = 1; g.step(1); }
      s = g.getState();
      out.afterArrowTime = s.gameTime;
      out.hpAfterArrow   = s.player.hp;
      out.projLeft       = g.getProjectiles().length;
      // ── 本番：同じ無敵窓の中で毒が刻む＝HP が減る
      for (let i = 0; i < 20; i++) {
        p.x = 1; p.y = 1;
        g.step(1);
        s = g.getState();
        if (s.player.hp < out.hpAfterArrow) { out.tickTime = s.gameTime; out.hpAfterTick = s.player.hp; break; }
      }
      return out;
    });

    const inf = POISON_M().inflict;
    expect(res.poisoned, '体当たりを受けても毒が立たない').toBe(true);
    // 対照が効いていること＝この時刻には確かに無敵窓が張っている（本番の主張が空にならない）
    expect(res.afterArrowTime - res.hitTime, '前提：対照の被弾が被弾無敵の内側で起きていない')
      .toBeLessThan(INVINCIBLE_MS);
    expect(res.projLeft, '対照：矢が当たっていない（素通りした？）＝無敵を測れていない').toBe(0);
    expect(res.hpAfterArrow, '対照：無敵窓の中の被弾で HP が減った＝無敵が働いていない'
      + '（本番の「毒は貫通する」が主張にならない）').toBe(res.hpAfterHit);
    // 本番＝毒の1刻み目は無敵窓の内側に来て、それでも刻む
    expect(res.tickTime, '毒が刻まない').toBeTruthy();
    expect(res.tickTime, '毒の刻みが予定（tickMs）と違う時刻に来た').toBe(res.nextAt);
    expect(res.tickTime - res.hitTime, '前提：毒の1刻み目が無敵窓の外に来ている'
      + '＝この本は貫通を測れていない（inflict.tickMs が INVINCIBLE_MS 以上？）').toBeLessThan(INVINCIBLE_MS);
    expect(res.hpAfterHit - res.hpAfterTick, '無敵窓の中で毒が刻んでいない'
      + '＝1回当てられて無敵の間に離れれば毒が無効化される（機構が死ぬ）').toBe(inf.damage);
    expect(errors).toEqual([]);
  });

  test('⑭ 毒は無敵窓を与えない（毒を盾にできない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, POISON());
    await page.keyboard.press('g');

    const res = await page.evaluate((invincibleMs) => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const p = g.getPlayer();
      const out = { ticks: [] };
      // ① 体当たりを1回受ける（敵の西隣に立ち続ける＝予告 → 解決で毒＋打撃1）
      for (let i = 1; i <= 20; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x - 1; p.y = e.y;
        g.step(1);
        if (g.getState().player.poisoned) break;
      }
      let s = g.getState();
      out.poisoned = s.player.poisoned;
      out.hitTime = s.gameTime;
      let hp = s.player.hp;
      // ② 逃げて「毒だけ」を測る。⚠ 測るのは**2刻み目**＝1刻み目は被弾無敵の内側にあり
      //   「防がれたのは被弾無敵のせいか毒が与えた無敵のせいか」が区別できない。
      //   ⚠ 逃げ先は毎tick「敵から最も遠い隅」＝固定の隅だと追いつかれて体当たりが混ざり、
      //     HP の減りが毒か打撃か分からなくなる（distMin で前提を検査する）。
      out.distMin = 99;
      for (let i = 0; i < 40; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x >= 5.5 ? 1 : 10; p.y = e.y >= 4.5 ? 1 : 8;
        g.step(1);
        s = g.getState();
        const e2 = g.getEnemies()[0];
        out.distMin = Math.min(out.distMin, +Math.hypot(e2.x - p.x, e2.y - p.y).toFixed(3));
        if (s.player.hp < hp) { out.ticks.push({ at: s.gameTime, dmg: hp - s.player.hp }); hp = s.player.hp; }
        if (out.ticks.length === 2) break;
      }
      out.lastTickTime = out.ticks.at(-1)?.at;
      out.pastHitInvincible = (out.lastTickTime - out.hitTime) >= invincibleMs;
      out.hpBeforeArrow = hp;
      // ③ 毒が刻んだ直後に普通の被弾＝通る（毒が無敵を与えていたら防がれる）
      //    ⚠ 矢が飛ぶ間は動かない（逃げ続けると矢の線から外れる）∴敵から遠い隅に固定し、
      //      矢は「盤の内側から」飛ばす（外周は壁∴隅の外側に置くと即消える）。
      const eA = g.getEnemies()[0];
      const fx = eA.x >= 5.5 ? 1 : 10, fy = eA.y >= 4.5 ? 1 : 8;
      p.x = fx; p.y = fy;
      g.injectEnemyProjectile(fx === 1 ? fx + 1 : fx - 1, fy, fx === 1 ? -1 : 1, 0, 1, 2);
      for (let i = 0; i < 4; i++) {
        p.x = fx; p.y = fy;
        g.step(1);
        const e2 = g.getEnemies()[0];
        out.distMin = Math.min(out.distMin, +Math.hypot(e2.x - fx, e2.y - fy).toFixed(3));
      }
      s = g.getState();
      out.hpAfterArrow = s.player.hp;
      out.projLeft = g.getProjectiles().length;
      out.hpEnd = s.player.hp;
      return out;
    }, INVINCIBLE_MS);

    expect(res.poisoned, '体当たりを受けても毒が立たない').toBe(true);
    expect(res.distMin, `前提：逃げ切れていない（敵が到達距離 ${SLAM_RANGE} まで詰めている`
      + '＝HP の減りが毒か体当たりか区別できない）').toBeGreaterThan(SLAM_RANGE);
    expect(res.ticks.length, '毒が2回刻んでいない（窓と間隔が変わった？）').toBe(2);
    // 前提＝この時刻には被弾無敵が切れている（区別できる位置で測っている）
    expect(res.pastHitInvincible, `前提：2刻み目が被弾無敵（${INVINCIBLE_MS}ms）の内側にある`
      + '＝「防がれたのは被弾無敵のせい」と区別できない').toBe(true);
    expect(res.projLeft, '矢が当たっていない（素通りした？）').toBe(0);
    // ★ 毒が刻んだ直後でも被弾する＝毒は無敵窓を与えない（毒を受けている方が安全にならない）
    expect(res.hpBeforeArrow - res.hpAfterArrow, '毒が刻んだ直後の被弾が防がれた'
      + '＝毒が無敵窓を与えている（毒が盾になる＝機構が反転する）').toBe(1);
    expect(res.hpEnd, '前提：HP が 0 まで落ちている（ゲームオーバーの経路が混ざる）').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('⑮ 体当たりを繰り返し受けている間も毒は刻む（再発火で刻みの予定が先送りされない）', async ({ page }) => {
    // 回帰の番人：体当たりはクールダウン（SLAM_COOLDOWN_MS）ごとに再発火する＝隣に居続けると
    // 11 tick おきに当てられる∴**窓が切れる前に次が来る**。再発火で `_poisonNextAt` を
    // 引き直す実装だと次の刻みが先送りされ続け、当てられている間は1度も刻まない＝DoT が消える。
    // 窓の終わりだけ延ばし、刻みの予定と減衰は引き継ぐことをここで固定する。
    // ⚠ HP は見ない（debugMode のまま）＝体当たりのダメージのノイズも死亡も混ざらない。
    // ⚠ 「当てられた tick」は `slamAt` の消滅（予告→解決）から取る＝毒の窓そのものから
    //   導くと「刻みが止まっているのに検出もできない」歯のない本になる。
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, POISON());

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const p = g.getPlayer();
      const tr = [];
      let prevSlamAt = null;
      // 敵の西隣に立ち続ける（重なりは禁止＝これが取れる最短距離）＝当て続けられる状態
      for (let i = 1; i <= 34; i++) {
        const e0 = g.getEnemies()[0];
        p.x = e0.x - 1; p.y = e0.y;
        g.step(1);
        const s = g.getState(), e = g.getEnemies()[0];
        const slamAt = e.slamAt ?? null;
        tr.push({
          i, t: s.gameTime,
          dist: +Math.hypot(e.x - s.player.x, e.y - s.player.y).toFixed(3),
          hit: prevSlamAt != null && slamAt == null,     // 予告が解決した tick＝当たった tick
          until:  s.player.poisonUntil  ?? null,
          nextAt: s.player.poisonNextAt ?? null,
          dmg:    s.player.poisonDmg    ?? null,
        });
        prevSlamAt = slamAt;
      }
      return { tr };
    });

    const inf = POISON_M().inflict;
    const hits = res.tr.filter(r => r.hit);
    expect(hits.length, '前提：体当たりを2回以上受けていない（再発火していない＝窓の重なりを試せていない）')
      .toBeGreaterThanOrEqual(2);
    expect(Math.min(...res.tr.map(r => r.dist)), '前提：重なっている（決定①に反する＝別の本が赤くなるべき）')
      .toBeGreaterThanOrEqual(1);

    // ★ 窓・刻みの予定・減衰の全履歴を、debuff.js とは独立に組んだ期待値と突き合わせる。
    //   規則：当たった tick は窓の終わりを `t + ms` まで延ばす（縮めない）。**すでに毒なら
    //   刻みの予定と威力は引き継ぐ**。窓の中では tickMs ごとに刻み、1刻みごとに decay 弱まる。
    let until = null, next = null, dmg = null;
    const mismatches = [], tickTimes = [];
    for (const r of res.tr) {
      if (r.hit) {
        const wasPoisoned = until != null && r.t < until;
        until = Math.max(until ?? 0, r.t + inf.ms);
        if (!wasPoisoned || next == null) { next = r.t + inf.tickMs; dmg = inf.damage; }
      }
      while (next != null && r.t >= next && next <= until) {
        tickTimes.push(next);
        dmg = Math.max(1, dmg - inf.decay);
        next += inf.tickMs;
      }
      if (until != null && r.t >= until) { until = null; next = null; dmg = null; }
      if (r.until !== until || r.nextAt !== next || r.dmg !== dmg) {
        mismatches.push(`t${r.i}(${r.t}ms) 実 until=${r.until} next=${r.nextAt} dmg=${r.dmg}`
          + ` / 期待 until=${until} next=${next} dmg=${dmg}`);
      }
    }
    expect(mismatches, '毒の窓・刻みの予定・減衰が期待と食い違う'
      + '（再発火で予定を引き直している／窓を縮めている／減衰が戻っている）').toEqual([]);
    // ★ 当てられ続けている間に実際に刻んでいる（先送りで DoT が消えていない）
    expect(tickTimes.length, '体当たりを受け続けている間に毒が2回刻んでいない'
      + '＝刻みの予定が再発火のたびに先送りされている（DoT が消える）').toBeGreaterThanOrEqual(2);
    // ★ 窓の終わりは延びる（当てられ続ければ抜けない）
    expect(res.tr.at(-1).until, '当てられ続けているのに窓が延びていない（最後の当たりで引き直されていない）')
      .toBeGreaterThanOrEqual(hits.at(-1).t + inf.ms);
    expect(errors).toEqual([]);
  });

  test('⑯ 2種は本編レイヤーに配置済み・かつ配置表の部屋にだけ居る', () => {
    // 2026-08-19（5.5m）に配置した∴「未配置」ではなく「居る・想定外の部屋に湧いていない」
    // を守る（k-3 ⑬・k-4 ⑭・k-5 ⑯・k-6 ⑱ と同じ形）。呪い火は剣を封じる＝サブ武器が
    // 揃った D4 以降にしか置かない、という配置の意図は tests/enemy-placement.spec.js が持つ。
    const placed = placedCells(MAP, K7.map(([t]) => t));
    for (const [tile] of K7) {
      const name = ENEMY_META[tile].name;
      expect(placed[tile].length, `${name}（'${tile}'）が本編レイヤーに1体も居ない`).toBeGreaterThan(0);
      for (const loc of placed[tile]) {
        expect(PLACEMENT_STAGES.has(stageIdOf(loc)),
          `${name} が配置表に無い ${loc} に居る（表＝scripts/lib/enemy-placement.mjs）`).toBe(true);
      }
    }
  });

  test('⑰ セーブから戻したプレイヤーはデバフ窓を持ち越さない（save.js の純粋関数）', () => {
    // game.js saveGame() は player を丸ごと直列化する（`{ ...player }`）∴`_sealUntil` の
    // ような**論理時刻**も保存される。ロード後の gameTime は 0 から始まる∴保存された
    // 時刻はすべて「未来」に見え、剣が封じられたまま／毒が延々と刻むセーブデータになる。
    const loaded = sanitizeLoadedPlayer({
      subItems: { bow: { count: 3 } }, activeSubItem: 'bow',
      // 窓（消える側）
      _sealUntil: 9000, _poisonUntil: 8000, _poisonNextAt: 7000,
      _poisonDmg: 2, _poisonTickMs: 1200, _poisonDecay: 1,
      // 窓ではない `_` 付きの状態（残る側＝一律で消してはいけない）
      _equip: { swordName: '剣' }, _ladderAxis: 'v', _shownSubItemHint: true,
    }, ITEM_META);

    for (const k of ['_sealUntil', '_poisonUntil', '_poisonNextAt', '_poisonDmg', '_poisonTickMs', '_poisonDecay']) {
      expect(loaded[k], `${k} がロード後も残っている＝封じられたまま／毒が刻み続けるセーブになる`)
        .toBeNull();
    }
    // ⚠ アンダースコアを一律で消す実装にすると、これらが失われる（別のバグになる）
    expect(loaded._equip, 'ロードで `_equip`（装備名）が消えた＝窓以外まで消している').toEqual({ swordName: '剣' });
    expect(loaded._ladderAxis, 'ロードで `_ladderAxis`（はしごの進入軸）が消えた').toBe('v');
    expect(loaded._shownSubItemHint, 'ロードで `_shownSubItemHint` が消えた').toBe(true);
  });
});
