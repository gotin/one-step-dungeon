// tests/player-debuff-enemies.spec.js — Phase 5.5k k-7「プレイヤー側の一時デバフ窓」（解禁2体）
//
// k-7 で足したのは**プレイヤー側に立つ一時デバフの窓**（game/debuff.js）。既存の敵は
// 「HP を削る」以外の結果を持てなかった＝敵の手札が「痛い／速い／硬い」しか無かった。
// 窓は敵側の攻撃ポーズ窓（`e._atkUntil`）とまったく同型の論理時間（gameNow 基準）：
//
//   ① 呪い火 CURSE_FIRE ('ψ') … `inflict:{ type:'sealSword', ms }`
//        触れると数秒**剣が振れない**（＋チャージも始まらない・溜め中なら中断される）。
//        ・接触ダメージは最小（atk 1）＝この敵の攻撃は「痛み」ではなく「手を1つ奪うこと」
//        ・**サブアイテム（弓/爆弾/ブーメラン）は封じない**＝名簿 #13「妨害特化＝弓/爆弾で処理」
//        ・**会話・看板も封じない**＝封じたら詰みかねない（ゲートを置く位置がその契約）
//        ・`move:'air'`＝水/溶岩を越えて追ってくる＝地形では撒けない（走って距離を取る）
//   ② 毒沼ヒル POISON_LEECH ('Γ') … `inflict:{ type:'poison', ms, tickMs, damage, decay }`
//        触れると継続ダメージ。tickMs ごとに刻み、1刻みごとに decay だけ弱まる（下限1）。
//        ・**毒は無敵窓を貫通する**（接触無敵の間も刻む）＝無敵は「HP を守る窓」であって
//          「触れた事実」を消す窓ではない
//        ・**毒は無敵窓を与えない**＝毒を盾に使えない（受けている方が安全にならない）
//        ・鈍足（SLOW）＝出会った瞬間は無害に見えるが接触1回の実効は 接触1＋毒3＝4
//
// 検証ステージ＝test_mechanics[39,0] `curse_fire` / [40,0] `poison_leech`
// （scripts/migrate-test-player-debuff-arenas.mjs が自己検査付きで生成。座標は `stageKey()`）。
// ⚠️ `curse_fire` のアリーナだけ**遮蔽ゼロではない**＝看板 `i`(5,4) が「宣言された例外」。
//    probe(4,4) の真南に置いてあり、⑩「封じ中でも看板は読める」を同じ盤面で測るためにある
//    （消すと「封印中は看板も読めない」実装に戻っても赤くならない）。
// 外周は壁だが**左右 rows 7/8 は隣のアリーナへの通路**（tests/test-arena-doors.js）∴塞がない。
//
// tick 換算（TICK_MS=120・step() が論理時間を 120ms 進める・tick i の now = 120×i）：
//   呪い火の封印   … ms 3000 ＝ 25 tick（接触した tick の now + 3000 が窓の終わり）
//   毒の窓         … ms 2400 ＝ 20 tick／刻み tickMs 1200 ＝ 10 tick ごと（窓の中で2回）
//   接触無敵       … INVINCIBLE_MS 1500 ＝ 12.5 tick ∴**毒の1刻み目（+10 tick）は
//                    無敵窓の内側に来る**＝「毒は無敵窓を貫通する」の歯が数値の側で立つ
//                    （migrate スクリプトが tickMs < INVINCIBLE_MS を検査している）
//
// ⚠ 計測は1回の evaluate 内で完結させ、冒頭で pause() → gameTime===0 を assert する。
//   実時間ループは `gotoFrozen()` でそもそも起動させない（k-4/k-5/k-6 spec と同じ理由）。
// ⚠ プレビュー（fromEditor=1）は debugMode:true ＝ takeDamage が早期 return する∴
//   **プレイヤーの HP を測る本だけ** 'g' で debug を切る。デバフ窓そのものは
//   takeDamage の結果に関係なく立つ（enemy-ai.js の contact は takeDamage の後に
//   inflictDebuff を呼ぶ）∴HP を見ない本は debug を切らない＝HP のノイズが混ざらない。
// ⚠ **接触は「触れている間ずっと毎 tick」起きる**＝窓は毎 tick 引き直される。
//   窓の終わりを測る本は、接触した後に**毎 tick プレイヤーを遠くへ置き直して**
//   再接触を切る（放っておくと永久に封じられたまま＝境界を測れない）。
// ⚠ **敵は自力では接触箱（0.9）に入れない。** passable.js isPassableForEnemy が
//   「プレイヤーの占有セルへは移動できない」＝敵が詰められる限界は dist 1.0
//   （k-5 のルピー喰いで attachRange 1.1 が必要だったのと同じ理由・GUIDE §3-2）。
//   ∴ステージに置いて待つだけでは**永久に接触しない**（実測：呪い火は 16 tick で
//   x=5 まで来てそこで止まる）。接触は**プレイヤー側から作る**：`p.x = e.x; p.y = e.y`
//   と重ねて 1 tick 進める（k-4/k-5 spec と同じ手法）。実プレイでは半セル移動の
//   プレイヤーが自分から踏み込んで dist 0.5 になる＝接触はプレイヤーの前進で起きる。
//   「寄って来るが自力では触れない」ことは ⑤⑪ が対照として測る（＝この制約の番人）。
// ⚠ gameTick の順番は tickCharge() → checkEnemyContact() → tickPlayerDebuffs()。
//   ∴接触した tick では**チャージはまだ生きている**（同じ tick の tickCharge は
//   封印より前に走り終えている）＝溜めの中断は次の tick で起きる（⑧ が 1 tick 余分に
//   進める理由）。デバフの窓そのものは接触した tick の gameTime を基点に立つ。
// ⚠ k-7a 時点のスプライトは既存絵のエイリアス（GUIDE §2「機構が先・絵は後」）∴絵の中身は
//   主張せず、名前解決と「デバフ状態が DOM のクラスとして出ること」だけを固定する。
//   実描き（32×32・1枚＋左右反転）は k-7b の担当。
//
// ── 歯の実測（2026-08-17・機構を1つずつ壊して赤くなる本を数えた）─────────────
//   debuff.js inflictDebuff の sealSword 分岐を削る ………………………… ⑤⑥⑦⑧⑨⑩
//   debuff.js inflictDebuff の poison 分岐を削る …………………………… ⑪⑫⑬⑭⑮
//   debuff.js 毒の再接触で `_poisonNextAt` を毎回引き直す（修正前の形）… ⑮
//   debuff.js tickPlayerDebuffs の毒の while を削る ……………………… ⑫⑬⑭⑮
//   debuff.js の takeDamage から `ignoreInvincible` を外す ……………… ⑫⑬⑭
//   debuff.js の takeDamage から `noInvincible` を外す …………………… ⑭
//   debuff.js tickPlayerDebuffs の封印の解除（`_sealUntil=null`）を削る … ⑨
//   combat.js swordAttack の封印ゲートを削る ………………………………… ⑥⑦
//   combat.js の封印ゲートを NPC/看板の分岐より**前**へ動かす ………… ⑩
//   charge.js canAct() の `!isSwordSealed?.()` を削る ……………………… ⑧
//   enemy-ai.js checkEnemyContact の `inflictDebuff` 呼び出しを削る … ⑤〜⑮（11本）
//   render-chars.js の `sealed` の class 切り替えを削る …………………… ⑤
//   render-chars.js の `poisoned` の class 切り替えを削る ………………… ⑪
//   save.js sanitizeLoadedPlayer の窓クリアを削る …………………………… ⑰
// ※ ①②③④⑯ はデータ／配置の番人（実行時の機構ではない）∴上の破壊では動かない。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { ENEMY_META, ENEMY_SPEED_FAST } from '../shared/enemies.js';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { ITEM_META } from '../shared/items.js';
import { TICK_MS, INVINCIBLE_MS } from '../game/constants.js';
import { sanitizeLoadedPlayer } from '../game/save.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { isArenaDoor, arenaDoorCells, ARENA_DOOR_ROWS } from './test-arena-doors.js';
import { gameLayerEntries } from '../shared/layers.js';

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
//   呪い火    … (4,4)＝同じ行・dist 5.0・速度 0.5  ∴ 16 tick で隣（実測一致）＋真南に看板(5,4)
//   毒沼ヒル  … (4,6)＝同じ行・dist 3.0・速度 0.25 ∴ 16 tick で隣
// ⚠ そこから先は入って来ない（上の「敵は自力では接触箱に入れない」）∴接触は重ねて作る。
const CURSE  = (extra) => previewUrl('curse_fire',   4, 4, extra);
const POISON = (extra) => previewUrl('poison_leech', 4, 6, extra);

// 接触を1回作る型（evaluate は別コンテキストなので関数を渡せない＝各テストで同じ形を書く）：
//   const e = g.getEnemies()[0]; p.x = e.x; p.y = e.y; g.step(1);   // ← この tick で接触
// 接触した論理時刻＝step 後の gameTime（step は TICK_MS 足してから gameTick を回す）。

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
// 「接触1回で何ハート持って行かれるか」の校正に使う（③ の名簿の脅威度は接触ダメージ
// しか値踏みしない＝デバフの重さはこの数字で見る）。
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
      // 接触が機構の入口＝遠隔攻撃を持たない（持つと「接触せずに掛かった」ように見える）
      expect(m.attack?.type, `${name} は接触専門（charge）でない`).toBe('charge');
      expect(m.inflict?.type, `${name} の inflict の型`).toBe(inflictType);
      // 窓の長さは tick の整数倍＝観測 tick が揺れない
      expect(m.inflict.ms % TICK_MS, `${name} の inflict.ms が tick の整数倍でない`).toBe(0);
      expect(m.inflict.ms, `${name} の窓が 0 以下＝掛かった瞬間に切れる`).toBeGreaterThan(0);
      // k-7b で描く絵は 1 枚＋左右反転＝向き別スプライトは持たない（PLAN k-7b）
      expect(m.directional, `${name} は向き別スプライトを持たない（1枚＋左右反転）`).toBeFalsy();
      expect(m.guards, `${name} はガードしない（k-4 の機構は持たせない）`).toBeFalsy();
    }

    // ① 呪い火＝「痛み」ではなく「手を奪う」敵。接触ダメージが大きいと
    //    「剣を封じられたこと」より「削られたこと」が主題になってしまう。
    const c = CURSE_M();
    expect(c.atk, '呪い火の接触ダメージが大きい＝妨害ではなく痛みが主題になっている')
      .toBeLessThanOrEqual(1);
    expect(c.move, '呪い火が飛行でない＝水/溶岩の向こうへ逃げれば無力化できてしまう').toBe('air');
    expect(c.inflict.ms, '封印が短すぎる＝封じられたことに気づかない').toBeGreaterThanOrEqual(TICK_MS * 10);

    // ② 毒沼ヒル＝毒の総量の校正。**接触1回で即死級にしない**こと。
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
    expect(total + POISON_M().atk, `接触1回の実効ダメージ（接触+毒=${total + POISON_M().atk}）が`
      + `初期プレイヤーの HP（${START_HP}）以上＝1回触れたら即死する`)
      .toBeLessThan(START_HP);
    // ★ 毒の1刻み目が接触無敵の内側に来る＝「無敵窓を貫通する」が観測できる配置
    expect(p.tickMs, '毒の刻み間隔が接触無敵以上＝1刻み目が無敵の外に来る'
      + '∴「毒は無敵窓を貫通する」を壊しても赤くならない').toBeLessThan(INVINCIBLE_MS);

    // 機構の取り違え防止（呪い火に毒の数値／毒沼ヒルに封印は無い）
    expect(c.inflict.tickMs, '呪い火に毒の刻み間隔がある＝型が混ざっている').toBeUndefined();
    expect(POISON_M().inflict.type, '毒沼ヒルが剣を封じている＝型が混ざっている').not.toBe('sealSword');
  });

  test('② タイル定義・スプライト・パレットの名前解決（k-7a は既存絵のエイリアス）', () => {
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
      // 敵の4近傍は床（立ち位置を変えて何度も接触させる余裕を残す）
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
  test('⑤ 接触で剣封じの窓が立つ（対照＝接触前は窓が無い）＋状態が絵に出る', async ({ page }) => {
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
        pre: [],
      };
      // ── 対照(a)：**敵が寄って来るだけでは封じられない**。20 tick 追わせると隣（dist 1.0）
      //    まで詰めるが、そこから先は入って来ない（passable.js の重なり防止）。
      let distMin = Infinity;
      for (let i = 1; i <= 20; i++) {
        g.step(1);
        const s = g.getState();
        const e = g.getEnemies()[0];
        distMin = Math.min(distMin, Math.hypot(e.x - s.player.x, e.y - s.player.y));
        out.pre.push({ i, sealUntil: s.player.sealUntil });
      }
      out.distMin = distMin;
      // ── 本番：プレイヤーから踏み込む（重ねて 1 tick）＝接触が1回起きる
      const p = g.getPlayer();
      const e = g.getEnemies()[0];
      p.x = e.x; p.y = e.y;
      g.step(1);
      const s = g.getState();
      out.gameTime  = s.gameTime;
      out.sealed    = s.player.swordSealed;
      out.sealUntil = s.player.sealUntil;
      out.cls = document.getElementById('char-player')?.classList.contains('sealed');
      out.poisoned = s.player.poisoned;   // 呪い火は毒を持たない（型の取り違え防止）
      return out;
    });

    const m = CURSE_M();
    expect(res.enemy.length, '前提：呪い火が1体だけ居る').toBe(1);
    expect(res.enemy[0].type, '前提：置かれた敵が呪い火').toBe(TILE.CURSE_FIRE);
    expect([res.py, res.px], '前提：プレイヤーは (4,4)').toEqual([4, 4]);
    // 対照＝接触するまでは窓が無い（置いただけで封じられる実装ではない）
    expect(res.before, '対照：開始時点で既に封じられている').toEqual({ sealUntil: null, sealed: false, cls: false });
    expect(res.pre.every(r => r.sealUntil === null),
      '接触していない tick で窓が立っている（近づかれただけで封じられている）').toBe(true);
    // ★ 対照(a) の要：敵はちゃんと寄って来る（＝機構が「敵が来ない」で空振りしていない）が、
    //   **自力では接触箱（0.9）に入れない**（重なり防止）。この2つが同時に成り立つことが
    //   「接触はプレイヤーの踏み込みで起きる」の根拠＝ここが崩れたら測り方を作り直す。
    expect(res.distMin, '敵が寄って来ていない（速度・追跡・幾何が変わった？）').toBeLessThanOrEqual(1.05);
    expect(res.distMin, '敵が自力で接触箱（0.9）に入った＝重なり防止が外れている'
      + '（この spec の接触の作り方＝重ねる手法を見直すこと）').toBeGreaterThanOrEqual(0.9);
    // ★ 窓は「接触した論理時刻 + ms」＝論理時間で立つ（実時間の setTimeout ではない）
    expect(res.sealed, '踏み込んで重なっても封印が立たない').toBe(true);
    expect(res.sealUntil, '封印の窓が inflict.ms と合わない').toBe(res.gameTime + m.inflict.ms);
    // ★ 絵に出る（GUIDE §6-1＝「剣が出ない」だけではバグに見える）
    expect(res.cls, 'プレイヤーに .sealed が付いていない＝封じられた理由が画面に出ていない').toBe(true);
    expect(res.poisoned, '呪い火に触れて毒になっている＝デバフの型が混ざっている').toBe(false);
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

      // ── 本番：踏み込んで（重ねて）封じられた状態を作り、**同じ間合いから同じ振り方**で殴る
      const e1 = g.getEnemies()[0];
      p.x = e1.x; p.y = e1.y;
      g.step(1);
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
    expect(res.sealedAtControl, '対照：もう封じられている（接触より先に封印が立っている？）').toBe(false);
    expect(res.hpBefore - res.hpAfterControl, '対照：封じられていないのに剣が当たっていない'
      + '（間合い・向き・SWORD_REACH が変わった？）').toBe(res.atk);
    // 本番＝封じられている間は1回も削れない
    expect(res.sealed, '踏み込んで重なっても封印が立たない').toBe(true);
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
      // 踏み込んで（重ねて）封じられる
      const e0 = g.getEnemies()[0];
      p.x = e0.x; p.y = e0.y;
      g.step(1);
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
    expect(res.sealed, '踏み込んで重なっても封印が立たない').toBe(true);
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
      //    ⚠ 溜めている 8 tick の間に接触されると封印が立って対照が崩れる∴
      //      毎tick プレイヤーを敵から遠い隅へ置き直して接触を切る。
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
      // 溜めたまま踏み込む（重ねる）＝封印が立つ
      const e = g.getEnemies()[0];
      p.x = e.x; p.y = e.y;
      g.step(1);
      out.sealed = g.getState().player.swordSealed;
      // ⚠ gameTick は tickCharge() → checkEnemyContact() の順∴**封じられた tick の
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
    expect(res.auraBeforeContact, '前提：接触前に溜め始められている').toBe(true);
    expect(res.sealed, '踏み込んで重なっても封印が立たない').toBe(true);
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
      const e0 = g.getEnemies()[0];
      p.x = e0.x; p.y = e0.y;
      g.step(1);
      out.sealed    = g.getState().player.swordSealed;
      out.sealUntil = g.getState().player.sealUntil;
      out.sealedAt  = g.getState().gameTime;
      // ⚠ 触れ続けると窓は毎tick引き直される∴**毎tick 隅へ置き直して再接触を切る**。
      for (let i = 1; i <= 40; i++) {
        p.x = 1; p.y = 1;
        g.step(1);
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
    expect(res.sealed, '踏み込んで重なっても封印が立たない').toBe(true);
    expect(res.sealUntil, '封印の窓が inflict.ms と合わない').toBe(res.sealedAt + m.inflict.ms);
    // 置き直している間に窓が伸びていない＝再接触を本当に切れている
    expect(res.lastSealUntil, '隅へ逃げているのに窓が伸びている＝再接触が続いている')
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
      // 踏み込んで（重ねて）封じられ、看板の真北 (4,4) へ戻る
      const e = g.getEnemies()[0];
      p.x = e.x; p.y = e.y;
      g.step(1);
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
    expect(res.sealed0, '踏み込んで重なっても封印が立たない').toBe(true);
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
  test('⑪ 接触で毒の窓が立つ（対照＝接触前は窓が無い）＋状態が絵に出る', async ({ page }) => {
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
        pre: [],
      };
      // ── 対照：寄って来るだけでは毒にならない（敵は自力で接触箱に入れない）
      let distMin = Infinity;
      for (let i = 1; i <= 20; i++) {
        g.step(1);
        const s = g.getState();
        const e = g.getEnemies()[0];
        distMin = Math.min(distMin, Math.hypot(e.x - s.player.x, e.y - s.player.y));
        out.pre.push({ i, until: s.player.poisonUntil });
      }
      out.distMin = distMin;
      // ── 本番：踏み込む（重ねて 1 tick）
      const p = g.getPlayer();
      const e = g.getEnemies()[0];
      p.x = e.x; p.y = e.y;
      g.step(1);
      const s = g.getState();
      out.gameTime = s.gameTime;
      out.poisoned = s.player.poisoned;
      out.until    = s.player.poisonUntil;
      out.nextAt   = s.player.poisonNextAt;
      out.dmg      = s.player.poisonDmg;
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
    expect(res.pre.every(r => r.until === null),
      '接触していない tick で毒の窓が立っている（近づかれただけで毒になっている）').toBe(true);
    // 対照の要（⑤ と同じ）：寄って来るが自力では接触箱（0.9）に入れない
    expect(res.distMin, '敵が寄って来ていない（速度・追跡・幾何が変わった？）').toBeLessThanOrEqual(1.05);
    expect(res.distMin, '敵が自力で接触箱（0.9）に入った＝重なり防止が外れている')
      .toBeGreaterThanOrEqual(0.9);
    expect(res.poisoned, '踏み込んで重なっても毒が立たない').toBe(true);
    expect(res.until, '毒の窓が inflict.ms と合わない').toBe(res.gameTime + inf.ms);
    expect(res.nextAt, '毒の1刻み目の予定が inflict.tickMs と合わない').toBe(res.gameTime + inf.tickMs);
    expect(res.dmg, '毒の1刻み目のダメージが inflict.damage と合わない').toBe(inf.damage);
    expect(res.cls, 'プレイヤーに .poisoned が付いていない＝毒の理由が画面に出ていない').toBe(true);
    expect(res.sealed, '毒沼ヒルに触れて剣が封じられている＝デバフの型が混ざっている').toBe(false);
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
      const e0 = g.getEnemies()[0];
      p.x = e0.x; p.y = e0.y;
      g.step(1);                       // ← この tick で接触（毒＋接触ダメージ）
      let s = g.getState();
      out.poisoned = s.player.poisoned;
      out.contactTime = s.gameTime;
      out.hpAfterContact = s.player.hp;
      out.until = s.player.poisonUntil;
      // ⚠ 触れ続けると窓が伸びる∴**毎tick 隅へ置き直して再接触を切る**（後を引く毒だけを測る）。
      let hp = s.player.hp;
      for (let i = 1; i <= 40; i++) {
        p.x = 1; p.y = 1;
        g.step(1);
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
    expect(res.poisoned, '踏み込んで重なっても毒が立たない').toBe(true);
    // 接触そのもののダメージ（毒とは別勘定）
    expect(res.hpStart - res.hpAfterContact, '前提：接触ダメージが敵の atk と違う').toBe(POISON_M().atk);
    // ★ 刻む回数＝窓 ÷ 間隔（2回）。1刻み目 damage、2刻み目 damage-decay（下限1）。
    const expected = [];
    let dmg = inf.damage;
    for (let i = 1; i <= inf.ms / inf.tickMs; i++) {
      expected.push({ at: res.contactTime + inf.tickMs * i, dmg });
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
    expect(res.hpEnd, '窓が切れた後も削られている').toBe(res.hpAfterContact - expected.reduce((a, e) => a + e.dmg, 0));
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
      const e0 = g.getEnemies()[0];
      p.x = e0.x; p.y = e0.y;
      g.step(1);                       // ← 接触（毒＋接触ダメージ＋接触無敵が張る）
      let s = g.getState();
      out.poisoned = s.player.poisoned;
      out.contactTime = s.gameTime;
      out.hpAfterContact = s.player.hp;
      out.nextAt = s.player.poisonNextAt;
      // 隅へ退いて再接触を切る（毒だけが残る）
      p.x = 1; p.y = 1;
      // ── 対照：接触無敵の内側で「普通の被弾」（敵の矢）を受ける＝防がれる
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
    expect(res.poisoned, '踏み込んで重なっても毒が立たない').toBe(true);
    // 対照が効いていること＝この時刻には確かに無敵窓が張っている（本番の主張が空にならない）
    expect(res.afterArrowTime - res.contactTime, '前提：対照の被弾が接触無敵の内側で起きていない')
      .toBeLessThan(1500);
    expect(res.projLeft, '対照：矢が当たっていない（素通りした？）＝無敵を測れていない').toBe(0);
    expect(res.hpAfterArrow, '対照：無敵窓の中の被弾で HP が減った＝無敵が働いていない'
      + '（本番の「毒は貫通する」が主張にならない）').toBe(res.hpAfterContact);
    // 本番＝毒の1刻み目は無敵窓の内側に来て、それでも刻む
    expect(res.tickTime, '毒が刻まない').toBeTruthy();
    expect(res.tickTime, '毒の刻みが予定（tickMs）と違う時刻に来た').toBe(res.nextAt);
    expect(res.tickTime - res.contactTime, '前提：毒の1刻み目が無敵窓の外に来ている'
      + '＝この本は貫通を測れていない（inflict.tickMs が INVINCIBLE_MS 以上？）').toBeLessThan(1500);
    expect(res.hpAfterContact - res.hpAfterTick, '無敵窓の中で毒が刻んでいない'
      + '＝1回触れて張り付けば毒が無効化される（機構が死ぬ）').toBe(inf.damage);
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
      const e0 = g.getEnemies()[0];
      p.x = e0.x; p.y = e0.y;
      g.step(1);                       // ← 接触（毒＋接触ダメージ＋接触無敵が張る）
      let s = g.getState();
      out.poisoned = s.player.poisoned;
      out.contactTime = s.gameTime;
      let hp = s.player.hp;
      // ⚠ 測るのは**2刻み目**。1刻み目は接触無敵の内側にあり「防がれたのは接触無敵の
      //   せいか毒が与えた無敵のせいか」が区別できない（2刻み目は接触無敵の外）。
      for (let i = 0; i < 30; i++) {
        p.x = 1; p.y = 1;
        g.step(1);
        s = g.getState();
        if (s.player.hp < hp) { out.ticks.push({ at: s.gameTime, dmg: hp - s.player.hp }); hp = s.player.hp; }
        if (out.ticks.length === 2) break;
      }
      out.lastTickTime = out.ticks.at(-1)?.at;
      out.pastContactInvincible = (out.lastTickTime - out.contactTime) >= invincibleMs;
      out.hpBeforeArrow = hp;
      // 毒が刻んだ直後に普通の被弾＝通る（毒が無敵を与えていたら防がれる）
      g.injectEnemyProjectile(p.x + 1, p.y, -1, 0, 1, 2);
      for (let i = 0; i < 4; i++) { p.x = 1; p.y = 1; g.step(1); }
      s = g.getState();
      out.hpAfterArrow = s.player.hp;
      out.projLeft = g.getProjectiles().length;
      out.hpEnd = s.player.hp;
      return out;
    }, INVINCIBLE_MS);

    expect(res.poisoned, '踏み込んで重なっても毒が立たない').toBe(true);
    expect(res.ticks.length, '毒が2回刻んでいない（窓と間隔が変わった？）').toBe(2);
    // 前提＝この時刻には接触無敵が切れている（区別できる位置で測っている）
    expect(res.pastContactInvincible, `前提：2刻み目が接触無敵（${INVINCIBLE_MS}ms）の内側にある`
      + '＝「防がれたのは接触無敵のせい」と区別できない').toBe(true);
    expect(res.projLeft, '矢が当たっていない（素通りした？）').toBe(0);
    // ★ 毒が刻んだ直後でも被弾する＝毒は無敵窓を与えない（毒を受けている方が安全にならない）
    expect(res.hpBeforeArrow - res.hpAfterArrow, '毒が刻んだ直後の被弾が防がれた'
      + '＝毒が無敵窓を与えている（毒が盾になる＝機構が反転する）').toBe(1);
    expect(res.hpEnd, '前提：HP が 0 まで落ちている（ゲームオーバーの経路が混ざる）').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('⑮ 張り付かれている間も毒は刻む（再接触で刻みの予定が先送りされない）', async ({ page }) => {
    // 回帰の番人：接触は「触れている間ずっと毎tick」起きる∴再接触で `_poisonNextAt` を
    // 引き直す実装だと**次の刻みが永久に先送りされ、張り付かれている間は1度も刻まない**
    // ＝DoT が消える。窓の終わりだけ延ばし、刻みの予定と減衰は引き継ぐことをここで固定する。
    // ⚠ HP は見ない（debugMode のまま）＝接触ダメージのノイズも死亡も混ざらない。
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, POISON());

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const p = g.getPlayer();
      const out = {};
      const e0 = g.getEnemies()[0];
      p.x = e0.x; p.y = e0.y;
      g.step(1);                       // ← 1回目の接触（ここから張り付きを続ける）
      let s = g.getState();
      out.poisoned0 = s.player.poisoned;
      out.contactTime = s.gameTime;
      out.nextAt0 = s.player.poisonNextAt;
      out.until0  = s.player.poisonUntil;
      out.dmg0    = s.player.poisonDmg;
      // 毎tick 敵に重ねる＝「張り付かれている（毎tick 再接触）」状態を維持する
      out.contacts = 0;
      for (let i = 1; i <= 25; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x; p.y = e.y;
        g.step(1);
        if (g.getState().player.poisonUntil > out.until0) out.contacts++;
      }
      s = g.getState();
      out.nextAt1 = s.player.poisonNextAt;
      out.until1  = s.player.poisonUntil;
      out.dmg1    = s.player.poisonDmg;
      out.poisoned = s.player.poisoned;
      return out;
    });

    const inf = POISON_M().inflict;
    expect(res.poisoned0, '踏み込んで重なっても毒が立たない').toBe(true);
    expect(res.contacts, '前提：張り付き（毎tickの再接触）を維持できていない').toBeGreaterThan(20);
    // ★ 窓の終わりは延びる（触り続ければ抜けない）
    expect(res.until1, '再接触しても窓が延びていない＝触り続けても抜けてしまう')
      .toBeGreaterThan(res.until0);
    expect(res.poisoned, '張り付かれているのに毒が抜けている').toBe(true);
    // ★ 刻みの予定は引き継ぐ＝25tick（3000ms）の間に 2 回刻んでいる
    expect(res.nextAt1, '張り付かれている間に毒が刻んでいない（刻みの予定が毎tick引き直されている）')
      .toBe(res.nextAt0 + inf.tickMs * 2);
    // ★ 減衰も引き継ぐ＝威力が 1 刻み目に戻らない（触り続けて痛いままにならない）
    expect(res.dmg0, '前提：1刻み目の威力が inflict.damage でない').toBe(inf.damage);
    expect(res.dmg1, '再接触で毒の威力が戻っている＝減衰が効かない（触り続けると常に最大）')
      .toBe(Math.max(1, inf.damage - inf.decay));
    expect(errors).toEqual([]);
  });

  test('⑯ 2種はまだ本編レイヤーに配置していない（k-7a は部品のみ）', () => {
    // k-7a はエンジン＋テストまで。ライブ配置は 5.5m（絵が出来てから）。
    // ⚠ ここが赤くなったら「配置した側」が正しい：この test を配置の検証に書き換える。
    const placed = [];
    for (const [layerName, layer] of gameLayerEntries(MAP)) {
      for (const [sk, stage] of Object.entries(layer.stages ?? {})) {
        const tiles = stage.tiles ?? [];
        for (let r = 0; r < tiles.length; r++) {
          const row = Array.isArray(tiles[r]) ? tiles[r] : String(tiles[r]).split('');
          for (let c = 0; c < row.length; c++) {
            if (K7.some(([t]) => t === row[c])) placed.push(`${layerName}/${sk} (${r},${c}) '${row[c]}'`);
          }
        }
      }
    }
    expect(placed, 'k-7a の時点では本編レイヤーに配置しない（5.5m で配置する）').toEqual([]);
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
