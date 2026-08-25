// tests/hit-trigger-enemies.spec.js — Phase 5.5k k-5「被弾トリガー」（解禁2体）
//
// k-5 で足したのは**ダメージの漏斗に置いたフック点1つ**（combat.js onEnemyDamaged）。
// 「殴った結果が HP の減少だけで終わらない敵」をここから生やす：
//
//   ① 分裂スライム SPLIT_SLIME ('δ') … `meta.split`＝**倒した瞬間が引き金**。
//        HP0 で killEnemy へ流さず、小型 count 体へ置き換える（combat.js trySplitEnemy）。
//        ・小型は `_splitFrom` を持つ＝もう分裂しない（無限増殖の防止）
//        ・弱点の**爆弾だけは分裂を飛ばす**（split.blockedBy）＝弱点が「倍率」ではなく
//          **機構の解除鍵**として働く（この敵の設計の芯）
//        ・小型の置き場所が無ければ分裂せず素直に倒れる（pickSplitCells が空）
//   ② ルピー喰い RUPEE_EATER ('σ') … `meta.leech`＝**張り付いている間ずっと**引き金が続く。
//        隣接で張り付き、以後プレイヤーの座標へ貼り付いて drainMs ごとにルピーを吸う。
//        ・敵は必ずプレイヤーより遅い（GUIDE §7-2）∴「寄ってくるだけ」では逃げられて無害
//          ＝貼り付き（速度では振り切れない）が機構の芯
//        ・**被弾で剥がれる**（フック点 → enemy-ai.js detachLeech）＝叩く手が意味を持つ
//        ・張り付き中はダメージを出さない（吸うことが攻撃）＝重なっていても HP は減らない。
//          機構：`tickLeech` が true を返す tick は移動も攻撃もしない∴体当たり（slam）も出ない。
//          剥がれた後（再張り付きの猶予の間）は普通に体当たりしてくる＝無害な敵にはならない
//        ・倒すと吸われた分の refund 割が戻る＝倒す動機（PLAN 名簿 #11「倒す優先度を強制」）
//
// 検証ステージ＝test_mechanics[35,0] `split_slime` / [36,0] `rupee_eater`
// （⚠️ 2026-08-16 の 32,0 空きアリーナ挿入でキーが +1 ずれた＝座標は `stageKey()` で引く）
// （scripts/migrate-test-hit-trigger-arenas.mjs が自己検査付きで生成）。どちらも遮蔽ゼロの
// 10×12・敵は (4,9)・向き 'left'。分裂は「置き場所」が要る∴敵の四方は床。
// 外周は壁だが**左右 rows 7/8 は隣のアリーナへの通路**（tests/test-arena-doors.js）＝
// 敵を歩いて見比べるための道∴塞がない（計測はすべて rows 4/5 で行う＝通路と干渉しない）。
//
// tick 換算（TICK_MS=120・step() が論理時間を 120ms 進める・tick i の now = 120×i）：
//   剣    … SWORD_COOLDOWN_MS 100 ∴ tick1 以降なら振れる（gameTime 0 では振れない）
//   吸血  … tick1 で張り付き _leechNext=120+600=720 → tick6 で1回目 → 以後 5 tick ごと（11・16…）
//   剥がし… tick3 で殴ると _leechCooldownUntil=360+1200=1560 → tick13 で猶予明け
//             （0d-2.7 以降、実際に張り付き直すのは攻撃硬直が明ける tick15＝⑬の注記）
//   体当たり… 予告 SLAM_WINDUP_MS（0d-2.7 で 280 → MELEE_WINDUP_MS 480＝4 tick 後に解決）
//             ／攻撃硬直 MELEE_FREEZE_MS 360（3 tick）／クールダウン
//             SLAM_COOLDOWN_MS 900（8 tick）／到達 SLAM_RANGE 1.5
//             ⚠️ tick 数は定数から導出する（`Math.ceil(SLAM_WINDUP_MS / TICK_MS)`）＝
//             280→480 のような調整で期待値を手で直さない
//
// ⚠ **k-7.5（2026-08-17）で接触ダメージは廃止された**（ユーザー決定②「接触だけでは攻撃を
//   受けることはないようにする」）∴「敵に重ねて1 tick 進める」では HP は減らない。
//   δ/σ はどちらも `attack:{type:'charge'}`＝体当たり（隣に居ると予告が出て、解決の tick に
//   隣に居ればダメージ）。**もう「敵に重ねる」ことはできない**（重なり禁止＝決定①。
//   例外は張り付き中の σ だけ＝決定⑤）∴当てられ方は「敵の西隣（`e.x-1`）に立ち続ける」。
//   体当たりそのものの機構は tests/slam-attack.spec.js が番人。
//
// ⚠ 計測は1回の evaluate 内で完結させ、冒頭で pause() → gameTime===0 を assert する
//   （実ループの tick が漏れていたらそこで落ちる）。さらに実時間ループは `gotoFrozen()` で
//   そもそも起動させない（k-4 spec と同じ理由＝1 tick の漏れが tick 番号を丸ごとズラす）。
// ⚠ プレビュー（fromEditor=1）は debugMode:true ＝ takeDamage も isPassable も素通りする。
//   ∴「張り付かれても動ける」「張り付き中はダメージが出ない」を測る本は 'g' で debug を
//   切る（切らないと重なり例外も無敵も検査されず歯が抜ける）。逆に debug のままで良い本
//   （張り付きの周期・払い戻し）は切らない＝プレイヤーが削られて gameover になるのを避ける。
// ⚠ 木の剣の攻撃力は ps_weapon=1 では入らない（weapon フラグだけ立つ）∴`equipSwordTier(0)`
//   で本番と同じ atk（BASE_ATK 2 + 木の剣 2 = 4）にしてから殴る。分裂スライムの hp 4 は
//   この「木の剣1発」を数字にしたもの＝ここがズレると設計の主張ごと崩れる。
// ⚠ k-5a 時点のスプライトは既存絵のエイリアス（GUIDE §2「機構が先・絵は後」）∴絵の中身は
//   主張せず名前解決だけを固定する。実描き（32×32）は k-5b の担当。
//
// ── 歯の実測（2026-08-16・機構を1つずつ壊して赤くなる本を数えた）─────────────
// 「緑のまま通る破壊」が無いことを実測した（.scratch/verify-teeth-k5.mjs で自動化）。
//   combat.js  被弾フック点（onEnemyDamaged 呼び出し）を外す ……… ⑤⑥⑦⑫⑬
//   combat.js  split.blockedBy の判定を外す ……………………………… ⑧
//   combat.js  小型の再分裂ガード（`_splitFrom != null`）を外す … ⑥
//   combat.js  撃破記録を素朴に（兄弟を見ずに child id を記録）… ⑥
//   combat.js  置き場所の選択で他の敵の占有を無視 …………………… ⑨
//   combat.js  refundLeech を外す ……………………………………………… ⑭
//   enemy-ai.js 体当たりの解決で e.atk を見ない（親の atk 固定）… ⑦
//   enemy-ai.js tickLeech の戻り値 true を捨てる（張り付き中も攻撃を通す）… ⑫
//   enemy-ai.js プレイヤーへの貼り付き（座標追従）を外す ………… ⑩⑪⑫
//   enemy-ai.js 再張り付きの猶予を 0 に ……………………………………… ⑫⑬⑮
//   enemy-ai.js 0ルピーで自分から剥がれるのを外す ………………… ⑮
//   passable.js 重なり防止から張り付き敵を除外しない ……………… ⑪
//   検証ステージの幾何を壊す（分裂の置き場所を壁で潰す）………… ④⑤
// ※ ①②③⑯ はデータ／配置の番人（実行時の機構ではない）∴上の破壊では動かない。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { ENEMY_META, ENEMY_SPEED_FAST } from '../shared/enemies.js';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';
import { SLAM_WINDUP_MS, MELEE_FREEZE_MS } from '../game/constants.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { isArenaDoor, arenaDoorCells, ARENA_DOOR_ROWS } from './test-arena-doors.js';
import { placedCells, stageIdOf, PLACEMENT_STAGES } from './enemy-placed.js';

const GAME   = '/blade-of-lumia/game/';
const EDITOR = '/blade-of-lumia/editor/';
const TICK_MS = 120;
const MOVE_STEP = 0.5;
const BASE_ATK = 2;          // shared/items.js（木の剣を装備した本番の atk = 2 + 2 = 4）
const WOOD_SWORD_ATK = 4;

function previewUrl(stage, row, col, extra) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col),
    ps_weapon: '1',
    ...(extra ?? {}),
  });
  return `${GAME}?${p.toString()}`;
}

// 敵はどちらも (4,9)＝x9,y4。プレイヤーは西隣 (4,8)＝距離ちょうど 1.0 に置く：
//   ・剣が届く（SWORD_REACH 1.2）＝分裂の引き金を実経路で引ける
//   ・張り付き圏（attachRange 1.1）に入る＝**敵が自力で詰められる限界の距離**
//     （敵はプレイヤーのセルへ踏み込めない∴これより近い初期配置は作れない）
const SLIME = previewUrl('split_slime', 4, 8);
const EATER = (rupees) => previewUrl('rupee_eater', 4, 8, { ps_rupees: String(rupees) });

// 実時間ループ（game.js startGameLoop = setInterval(() => step(1), TICK_MS)）を
// ページ評価の**前に**無効化する（k-4 spec と同じ仕掛け）。差し込みが効いたことは
// 毎回 assert する＝ループの形が変わったら黙って戻らずここで落ちる。
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

const K5 = [
  [TILE.SPLIT_SLIME, '分裂スライム', 'splitSlime'],
  [TILE.RUPEE_EATER, 'ルピー喰い',   'rupeeEater'],
];
const threatOf = (m) => (m.hp * m.atk) / (m.def + 1);

test.describe('Phase 5.5k k-5 – 被弾トリガー（分裂スライム・ルピー喰い）', () => {

  test('① 2種の定義（記号タイル・非ボス・機構フィールド・脅威度と速度の上限）', () => {
    expect(TILE.SPLIT_SLIME, 'TILE.SPLIT_SLIME が未定義').toBe('δ');
    expect(TILE.RUPEE_EATER, 'TILE.RUPEE_EATER が未定義').toBe('σ');

    for (const [tile, name] of K5) {
      const m = ENEMY_META[tile];
      expect(m, `ENEMY_META['${tile}'] が無い`).toBeTruthy();
      expect(m.name, `${tile} の名前`).toBe(name);
      expect(m.isBoss, `${name} は通常敵`).toBeFalsy();
      // 通常敵の最強格＝剣獣（脅威度 10）を超えない（名簿の脅威「中」枠）
      expect(threatOf(m), `${name} の脅威度が剣獣（10）以上＝通常敵の最強格を追い越している`)
        .toBeLessThan(threatOf(ENEMY_META[TILE.SWORD_BEAST]));
      // GUIDE §7-2＝敵はプレイヤー（速度換算 1.0）より必ず遅い。
      // ★ ルピー喰いはここが機構の前提でもある：遅いからこそ「寄ってくるだけ」では
      //   逃げられて無害＝**張り付き**が要る（tickLeech が座標を貼り付ける理由）。
      expect(m.speed, `${name} がプレイヤーと同速以上＝振り切れない`).toBeLessThan(ENEMY_SPEED_FAST);
      expect(m.attack?.type, `${name} は体当たり（charge）のみ（飛び道具は k-6 の担当）`).toBe('charge');
    }

    // ① 分裂スライム＝倒した瞬間が引き金。「1発で片付いたつもりが増える」を数字で固定する。
    const s = ENEMY_META[TILE.SPLIT_SLIME];
    expect(s.split, '分裂スライムに split が無い').toBeTruthy();
    expect(s.split.count, '分かれる数が2体未満＝「増える」にならない').toBeGreaterThanOrEqual(2);
    // ★ 親は木の剣1発で分裂まで届く（名簿「剣で1回叩くと2体の小型へ分裂」）。
    //   def を上げたり hp を増やすとここが崩れる＝設計の主張が変わる。
    expect(s.hp - s.def, '木の剣1発（atk 4）で HP0 に届かない＝「1回叩くと分裂」でなくなる')
      .toBeLessThanOrEqual(WOOD_SWORD_ATK);
    expect(s.split.childHp, '小型が木の剣1発で倒せない＝増えた数を捌けない')
      .toBeLessThanOrEqual(WOOD_SWORD_ATK - (s.split.childDef ?? 0));
    expect(s.split.childHp, '小型が親と同じ硬さ＝ただ敵が増えるだけ').toBeLessThan(s.hp);
    expect(s.split.childAtk, '小型の体当たりのダメージが親と同じ＝分裂が理不尽な増強になる')
      .toBeLessThan(s.atk);
    expect(s.split.childSprite, '小型の絵の名前が無い（親と同じ絵では増えたことが読めない）').toBeTruthy();
    // ★ 弱点＝機構の解除鍵。blockedBy と weakness.type が食い違うと「爆弾で潰せる」の
    //   手触りが弱点表示と噛み合わなくなる（プレイヤーは弱点表示から手段を推す）。
    expect(s.weakness?.type, '分裂スライムの弱点は爆弾（名簿）').toBe('bomb');
    expect(s.split.blockedBy, '分裂を飛ばす攻撃種別が弱点と一致していない')
      .toBe(s.weakness.type);

    // ② ルピー喰い＝張り付いている間ずっと引き金。数値が機構の生死を決める。
    const r = ENEMY_META[TILE.RUPEE_EATER];
    expect(r.leech, 'ルピー喰いに leech が無い').toBeTruthy();
    // ★ 敵はプレイヤーのセルへ自力で入れない（isPassableForEnemy）∴詰められる限界は 1.0。
    //   1.0 未満だと永久に張り付けない＝機構が死ぬ（GUIDE §3-1「判定距離＝到達距離」）。
    expect(r.leech.attachRange, '張り付き距離が 1.0 未満＝隣接しても永久に張り付けない')
      .toBeGreaterThanOrEqual(1.0);
    expect(r.leech.attachRange, '張り付き距離が広すぎる＝離れていても吸われる').toBeLessThanOrEqual(1.5);
    expect(r.leech.amount, '吸う量が無い＝張り付いても損しない').toBeGreaterThan(0);
    expect(r.leech.drainMs, '吸う間隔が無い＝毎tick吸って即座に全額失う').toBeGreaterThan(0);
    expect(r.leech.drainMs % TICK_MS, '吸う間隔が tick の整数倍でない＝観測 tick が揺れる').toBe(0);
    expect(r.leech.cooldownMs, '再張り付きの猶予が無い＝殴っても即座に張り付き直す＝叩く手が無意味')
      .toBeGreaterThan(0);
    expect(r.leech.cooldownMs % TICK_MS, '猶予が tick の整数倍でない＝観測 tick が揺れる').toBe(0);
    expect(r.leech.refund, '払い戻しが 0＝倒しても戻らない＝倒す動機が無い').toBeGreaterThan(0);
    expect(r.leech.refund, '全額戻る＝吸われても損しない＝放置していい敵になる').toBeLessThan(1);
    expect(r.weakness, 'ルピー喰いに弱点は持たせない（名簿＝属性で楽にならない敵）').toBeUndefined();
    // 機構の取り違え防止（分裂に leech／ルピー喰いに split は無い）
    expect(s.leech, '分裂スライムに leech は無い').toBeUndefined();
    expect(r.split, 'ルピー喰いに split は無い').toBeUndefined();
  });

  test('② タイル定義・スプライト・パレット・スプライトマップの名前解決', () => {
    for (const [tile, name, pal] of K5) {
      const meta = ENEMY_META[tile];
      expect(TILE_META[tile], `TILE_META['${tile}'] が無い＝エディタに出ない`).toBeTruthy();
      expect(TILE_META[tile].label, `${name} のラベル`).toBe(name);
      expect(TILE_META[tile].passable, '敵タイルは通行可（下は床）').toBe(true);
      expect(meta.pal, `${name} の pal 名`).toBe(pal);
      expect(ENEMY_PAL[pal], `${pal} パレットが無い`).toBeTruthy();
      expect(ENEMY_PAL[pal][0], 'index0 は透明').toBe('transparent');
      expect(TILE_SPRITE_MAP[tile], 'スプライトマップが無い（描画で消える）').toBeTruthy();
      expect(TILE_SPRITE_MAP[tile].spr, 'スプライトマップの spr がメタと食い違う').toBe(meta.sprite);
      expect(TILE_SPRITE_MAP[tile].pal, 'スプライトマップの pal がメタと食い違う').toBe(meta.pal);
      expect(meta.directional, `${name} は向き別スプライトを持たない（1枚の絵）`).toBeFalsy();
    }

    // 状態から導かれる**すべての**スプライト名が解決すること。分裂の小型は
    // タイルとして存在しない＝TILE_SPRITE_MAP には出ない∴ここだけが番人になる
    // （欠けると分裂した瞬間に絵が消える＝一番見られる瞬間に壊れる）。
    const required = [
      ENEMY_META[TILE.SPLIT_SLIME].sprite,
      ENEMY_META[TILE.SPLIT_SLIME].split.childSprite,
      ENEMY_META[TILE.RUPEE_EATER].sprite,
    ];
    for (const spr of required) {
      expect(ENEMY_SPRITES[spr], `${spr} スプライトが無い（その状態で絵が消える）`).toBeTruthy();
      expect(ENEMY_SPRITES[spr].length, `${spr} のフレームが無い`).toBeGreaterThan(0);
      for (const frame of ENEMY_SPRITES[spr]) {
        expect(frame.length, `${spr} の行が無い`).toBeGreaterThan(0);
        const w = frame[0].length;
        for (const row of frame) expect(row.length, `${spr} の行の長さが揃っていない`).toBe(w);
      }
    }
    // 小型の絵は親と別名でなければ「増えた」ことが読めない（k-5b で別の絵を入れる前提）
    expect(ENEMY_META[TILE.SPLIT_SLIME].split.childSprite, '小型の絵の名前が親と同じ')
      .not.toBe(ENEMY_META[TILE.SPLIT_SLIME].sprite);
  });

  test('③ エディタのパレットに2種が並ぶ（置けない敵は死蔵になる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(EDITOR);
    // ⚠ パレットは初期状態でパネルが畳まれていて visible にならない（DOM には在る）∴'attached'。
    await page.waitForSelector('#tile-palette .tile-btn', { state: 'attached' });

    for (const [tile, name] of K5) {
      const btn = page.locator(`#tile-palette .tile-btn[title="${name}"]`);
      await expect(btn, `${name}（'${tile}'）がパレットに無い＝エディタで配置できない`).toHaveCount(1);
      await expect(btn.locator('canvas'), `${name} がスプライトで描かれていない`).toHaveCount(1);
    }
    expect(errors, 'エディタで pageerror').toEqual([]);
  });

  // ライブマップは手編集できる＝検証ステージの幾何は黙って変わる。前提を測る本を置いて、
  // 崩れたときに「機構が壊れた」でなく「盤面が崩れた」と読める形で赤くする（GUIDE §4-3）。
  //
  // ⚠️ 外周は「全部壁」ではない＝**左右 rows 7/8 は隣のアリーナへの通路**
  //    （tests/test-arena-doors.js＝敵を歩いて見比べるためにユーザーが開けた通路。
  //     2026-08-16 に「外周は全部壁」と決めつけて2回塞ぐ事故を起こした）∴
  //    この本は「通路以外の外周は壁」と「**通路は開いている**」の両方を測る。
  test('④ 検証ステージの幾何が前提どおり（外周は壁＋左右の通路・内部は素の床・敵は (4,9) の left）', () => {
    for (const [name, tile] of [['split_slime', TILE.SPLIT_SLIME], ['rupee_eater', TILE.RUPEE_EATER]]) {
      const sd = MAP.layers[TEST_LAYER]?.stages?.[stageKey(name)];
      expect(sd, `${name} のステージが無い`).toBeTruthy();
      const grid = (sd.tiles ?? []).map(r => (Array.isArray(r) ? r : String(r).split('')));
      expect(grid.length, `${name}: rows が 10 でない`).toBe(10);
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
          } else {
            expect(t, `${name}: 内部 (${r},${c}) が素の床でない＝遮蔽ゼロが崩れている`).toBe(TILE.FLOOR);
          }
        }
      }
      expect(enemyCells, `${name}: 敵は (4,9) に1体だけ`).toEqual(['4,9']);
      expect(sd.enemyDirs, `${name}: 置かれた向きが left でない`).toEqual({ '4,9': 'left' });
    }
    // ★ 通路は「隣のアリーナへ歩いて行ける」ことが目的＝外周が開いているだけでは足りない
    //   （1つ内側が壁だと着地が拒否される＝game.js arrivalIsWall）∴内側も床であること。
    for (const name of ['split_slime', 'rupee_eater']) {
      const grid = MAP.layers[TEST_LAYER].stages[stageKey(name)].tiles
        .map(r => (Array.isArray(r) ? r : String(r).split('')));
      for (const [r, c] of arenaDoorCells(grid[0].length)) {
        const inner = c === 0 ? 1 : grid[0].length - 2;
        expect(grid[r][inner], `${name}: 通路 (${r},${c}) の内側 (${r},${inner}) が床でない＝通れない`)
          .toBe(TILE.FLOOR);
      }
    }
    // ★ 分裂は「小型の置き場所」を要求する＝親の周囲が床でないと**分裂そのものが起きない**
    //   （pickSplitCells が空 → 素直に倒れる経路に落ちて ⑤⑥⑦ が黙って歯を失う）。
    const slime = MAP.layers[TEST_LAYER].stages[stageKey('split_slime')].tiles
      .map(r => (Array.isArray(r) ? r : String(r).split('')));
    for (const [dr, dc, label] of [[1, 0, '南'], [-1, 0, '北'], [0, 1, '東'], [0, -1, '西']]) {
      expect(slime[4 + dr][9 + dc], `分裂スライムの${label}隣が床でない＝小型の置き場所が足りない`)
        .toBe(TILE.FLOOR);
    }
  });

  // ── 分裂スライム ───────────────────────────────────────────────────────
  test('⑤ 木の剣1発で倒れずに小型2体へ分かれる（撃破はまだ記録されない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, SLIME);

    const res = await page.evaluate((sk) => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている（計測前提が崩れる）');
      g.equipSwordTier(0);                     // 本番と同じ木の剣（atk = 2 + 2）
      const atk = g.getPlayer().atk;
      g.step(1);                               // 剣のクールダウン（100ms）を越える
      const before = g.getEnemies();
      g.setHeroDir('right');
      g.swordAttack();                         // 実経路で殴る（src 付き＝本番と同じ）
      const after = g.getEnemies();
      return {
        atk, before, after,
        defeated: g.getDefeatedEnemies('test_mechanics', sk),
        dom: after.map(e => !!document.getElementById(`char-enemy-${e.id}`)),
        px: g.getPlayer().x, py: g.getPlayer().y,
      };
    }, stageKey('split_slime'));

    expect(res.atk, '木の剣を装備しても atk が本番と違う').toBe(BASE_ATK + 2);
    expect(res.before.length, '前提：分裂スライムが1体だけ居る').toBe(1);
    expect(res.before[0].id, '前提：親の id はタイル座標（撃破記録のキー）').toBe('4,9');
    expect(res.before[0].hp, '前提：親の hp').toBe(ENEMY_META[TILE.SPLIT_SLIME].hp);
    expect(res.px, '前提：プレイヤーは西隣 (4,8)').toBe(8);
    expect(res.py, '前提：プレイヤーは西隣 (4,8)').toBe(4);

    const cfg = ENEMY_META[TILE.SPLIT_SLIME].split;
    // ★ 1発で「倒れた」のではなく「分かれた」＝敵の数が増えている
    expect(res.after.length, '倒れてしまった（分裂していない）／数が想定と違う').toBe(cfg.count);
    for (const c of res.after) {
      expect(c.type, '小型が親と別タイプになっている').toBe(TILE.SPLIT_SLIME);
      expect(c.hp, '小型の hp が childHp でない').toBe(cfg.childHp);
      expect(c.maxHp, '小型の maxHp が childHp でない（HP バーの見た目が親のまま）').toBe(cfg.childHp);
      expect(c.atk, '小型の atk が childAtk でない＝体当たりのダメージが親のまま').toBe(cfg.childAtk);
      expect(c.sprite, '小型の絵が childSprite でない').toBe(cfg.childSprite);
      expect(c.splitFrom, '小型が親の posKey を引き継いでいない＝撃破記録が迷子になる').toBe('4,9');
    }
    // 置き場所の選択順（親のセル → 東 …）＝プレイヤーのセル (4,8) は避ける
    expect(res.after.map(c => `${c.y},${c.x}`).sort(), '小型の湧き場所が想定と違う')
      .toEqual(['4,10', '4,9']);
    expect(res.dom, '小型の DOM が生えていない（renderChars を呼んでいない＝見えない敵になる）')
      .toEqual([true, true]);
    // ★ 分裂は「まだ倒していない」＝この時点で親を記録すると部屋を出入りしただけで消える
    expect(res.defeated, '分裂の時点で撃破が記録された（1発＋部屋の出入りで敵が消える）').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('⑥ 小型はもう分裂しない／最後の1体を倒したときだけ親の撃破が記録される', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, SLIME);

    const res = await page.evaluate((sk) => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      g.equipSwordTier(0);
      g.step(1);
      g.setHeroDir('right');
      g.swordAttack();                                  // 親 → 小型2体
      const kids = g.getEnemies().map(e => e.id);
      const out = { kids, steps: [] };
      for (const id of kids) {
        // 小型を1発で倒す（src 付き＝漏斗は本番と同じ経路を通る）
        g.dealDamage(id, 4, 'sword', 8, 4);
        out.steps.push({
          killed: id,
          left: g.getEnemies().map(e => ({ id: e.id, splitFrom: e.splitFrom })),
          defeated: g.getDefeatedEnemies('test_mechanics', sk),
        });
      }
      return out;
    }, stageKey('split_slime'));

    expect(res.kids.length, '前提：小型が2体居る').toBe(2);
    // 1体目：小型は分裂しない（増えない）／兄弟が残っている間は記録しない
    expect(res.steps[0].left.map(e => e.id), '小型を倒したのに敵が増えた＝小型まで分裂している（無限増殖）')
      .toEqual([res.kids[1]]);
    expect(res.steps[0].defeated, '兄弟が残っているのに親の撃破を記録した（部屋の出入りで残りが消える）')
      .toEqual([]);
    // 2体目：最後の兄弟＝ここで初めて親の posKey を記録する
    expect(res.steps[1].left, '2体目を倒しても敵が残っている').toEqual([]);
    expect(res.steps[1].defeated, '全部倒したのに親の撃破が記録されない（部屋へ戻ると親が復活する）')
      .toEqual(['4,9']);
    expect(errors).toEqual([]);
  });

  test('⑦ 分裂した小型の体当たりのダメージは childAtk（親より弱い）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, SLIME);
    // ⚠ プレビューは debugMode:true ＝ takeDamage が早期 return する∴'g' で切る
    //   （切らないと「当てられても減らない」＝歯の無いテストになる）。
    await page.keyboard.press('g');

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      g.equipSwordTier(0);
      g.step(1);
      g.setHeroDir('right');
      g.swordAttack();                                  // 親 → 小型（(4,9) と (4,10)）
      const kids = g.getEnemies();
      const hp0 = g.getState().player.hp;
      const p = g.getPlayer();
      // k-7.5: 重ねてもダメージは出ない∴小型の西隣に立ち続けて**体当たりを1回受ける**。
      const out = { hp0, kids, hp1: hp0, distMin: 99 };
      for (let i = 1; i <= 20; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x - 1; p.y = e.y;
        g.step(1);
        const e2 = g.getEnemies()[0];
        out.distMin = Math.min(out.distMin, +Math.hypot(e2.x - p.x, e2.y - p.y).toFixed(3));
        const hp = g.getState().player.hp;
        if (hp < hp0) { out.hp1 = hp; out.hitTick = i; break; }
      }
      return out;
    });

    const cfg = ENEMY_META[TILE.SPLIT_SLIME].split;
    expect(res.kids.length, '前提：小型が2体居る').toBe(2);
    expect(res.hitTick, '20 tick 隣に立ち続けても小型が体当たりして来ない（無害な敵になっている）')
      .toBeGreaterThan(0);
    expect(res.distMin, '前提：小型がプレイヤーに重なっている（重なり禁止＝決定①に反する）')
      .toBeGreaterThanOrEqual(1);
    // ★ 親の atk（2）で計算していたら 2 減る＝小型が親と同じ強さになる。
    //   tickSlam が e.atk を先に読むこと（＝分裂の弱体化が体当たりにも効くこと）の番人。
    expect(res.hp0 - res.hp1, '小型の体当たりのダメージが childAtk になっていない（親の atk を使っている）')
      .toBe(cfg.childAtk);
    expect(errors).toEqual([]);
  });

  test('⑧ 弱点の爆弾で潰すと分裂しない（弱点＝機構の解除鍵）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, SLIME);

    const res = await page.evaluate((sk) => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      g.step(1);
      // 爆弾（弱点）で HP を尽かせる。弱点倍率が乗るので木の剣と同じ 4 で足りる。
      g.dealDamage('4,9', 4, 'bomb', 8, 4);
      return {
        left: g.getEnemies(),
        defeated: g.getDefeatedEnemies('test_mechanics', sk),
      };
    }, stageKey('split_slime'));

    // ★ ここが「弱点＝倍率」だけの実装だと小型2体が残る（分裂を飛ばせない）。
    expect(res.left, '爆弾で潰したのに分裂した＝split.blockedBy が効いていない').toEqual([]);
    expect(res.defeated, '爆弾で倒したのに撃破が記録されない').toEqual(['4,9']);
    expect(errors).toEqual([]);
  });

  test('⑨ 小型の置き場所が無いときは分裂せず素直に倒れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, SLIME);

    const res = await page.evaluate((sk) => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      // 親のセル＋周囲8セルのうち、プレイヤーが居る (4,8) 以外を全部他の敵で埋める
      // ＝pickSplitCells の候補が1つも残らない状態を作る（地形は遮蔽ゼロのまま）。
      const blocked = [[4, 9], [4, 10], [3, 9], [5, 9], [3, 8], [5, 8], [3, 10], [5, 10]];
      for (const [r, c] of blocked) g.injectEnemy(c, r, 5, 1, 1, 'E');
      g.step(1);
      g.dealDamage('4,9', 4, 'sword', 8, 4);
      const left = g.getEnemies();
      return {
        children: left.filter(e => e.splitFrom != null),
        slimes: left.filter(e => e.type === 'δ'),
        defeated: g.getDefeatedEnemies('test_mechanics', sk),
      };
    }, stageKey('split_slime'));

    // ★ 置き場所が無いのに分裂させると小型が壁や他の敵に重なる（進行不能の元）。
    //   ∴「分裂できないなら素直に倒れる」が正しい退避路＝撃破も普通に記録される。
    expect(res.children, '置き場所が無いのに小型が湧いた（重なった敵が生まれている）').toEqual([]);
    expect(res.slimes, '分裂スライムが倒れていない').toEqual([]);
    expect(res.defeated, '分裂できなかったのに撃破が記録されない＝倒しても復活する').toEqual(['4,9']);
    expect(errors).toEqual([]);
  });

  // ── ルピー喰い ─────────────────────────────────────────────────────────
  test('⑩ 隣接で張り付き、drainMs ごとに amount ルピーを吸う', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, EATER(10));

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const get = () => g.getEnemies()[0];
      const rows = [];
      const drains = [];
      let prev = g.getState().player.rupees;
      for (let i = 1; i <= 17; i++) {
        g.step(1);
        const e = get();
        const rupees = g.getState().player.rupees;
        rows.push({
          tick: i, attached: e.attached, next: e.leechNext, rupees,
          stolen: e.stolenRupees, ex: e.x, ey: e.y,
          px: g.getPlayer().x, py: g.getPlayer().y,
        });
        if (rupees !== prev) { drains.push({ tick: i, loss: prev - rupees }); prev = rupees; }
      }
      return { rows, drains };
    });

    const cfg = ENEMY_META[TILE.RUPEE_EATER].leech;
    const at = (t) => res.rows.find(r => r.tick === t);
    // 距離ちょうど 1.0（敵が自力で詰められる限界）で張り付く＝attachRange の実効性
    expect(at(1).attached, 'tick1（隣接）で張り付いていない＝attachRange が届いていない').toBe(true);
    expect(at(1).next, '張り付いた瞬間に次の吸血時刻が立っていない').toBe(TICK_MS + cfg.drainMs);
    // ★ 貼り付き＝プレイヤーと同じ座標（速度では振り切れない設計の実体）
    for (const r of res.rows) {
      expect(r.attached, `tick${r.tick}：張り付きが外れている`).toBe(true);
      expect(`${r.ey},${r.ex}`, `tick${r.tick}：張り付いているのに座標がプレイヤーと違う`)
        .toBe(`${r.py},${r.px}`);
    }
    // drainMs 600 ＝5 tick ごと（tick6 で1回目・以後 11・16）
    expect(res.drains, '吸血の周期が drainMs と合っていない')
      .toEqual([6, 11, 16].map(tick => ({ tick, loss: cfg.amount })));
    expect(at(17).stolen, '吸った累計（払い戻しの元）が合わない').toBe(cfg.amount * 3);
    expect(at(17).rupees, '所持ルピーの減り方が合わない').toBe(10 - cfg.amount * 3);
    expect(errors).toEqual([]);
  });

  test('⑪ 張り付かれても動ける／走っても振り切れない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, EATER(10));
    // ⚠ debug ON（プレビュー既定）では isPassable が常に true ＝重なり例外の検査にならない
    //   ∴'g' で切る（passable.js の `_attached` 除外を外すとここが赤くなる）。
    await page.keyboard.press('g');

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      g.step(1);                                  // 張り付く
      const rows = [{ px: g.getPlayer().x, ex: g.getEnemies()[0].x, attached: g.getEnemies()[0].attached }];
      for (let i = 0; i < 4; i++) {
        g.movePlayer('left');                     // 逃げる（プレイヤー 0.5 セル/操作）
        g.step(1);
        const e = g.getEnemies()[0];
        rows.push({ px: g.getPlayer().x, ex: e.x, attached: e.attached });
      }
      return rows;
    });

    // ★ 重なり防止から `_attached` を外していないと1歩も動けない（詰み＝機構が事故になる）
    expect(res.map(r => r.px), '張り付かれている間プレイヤーが動けない（重なり防止の例外が無い）')
      .toEqual([8, 8 - MOVE_STEP, 8 - MOVE_STEP * 2, 8 - MOVE_STEP * 3, 8 - MOVE_STEP * 4]);
    // ★ 逃げても付いてくる（速度では振り切れない＝叩いて剥がすしかない）
    for (const r of res) {
      expect(r.attached, '逃げたら勝手に外れた（走るだけで無害になる）').toBe(true);
      expect(r.ex, '張り付いているのに置いていかれた（貼り付けが効いていない）').toBeCloseTo(r.px, 5);
    }
    expect(errors).toEqual([]);
  });

  test('⑫ 張り付き中はダメージが出ない／剥がれた後は体当たりが当たる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, EATER(10));
    await page.keyboard.press('g');               // debug を切る（takeDamage を効かせる）

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const hp0 = g.getState().player.hp;
      for (let i = 1; i <= 16; i++) g.step(1);    // 張り付き＋吸血2回ぶん（重なり続けている）
      const attachedHp = g.getState().player.hp;
      const e = g.getEnemies()[0];
      const overlapped = Math.abs(e.x - g.getPlayer().x) < 0.01 && Math.abs(e.y - g.getPlayer().y) < 0.01;
      g.dealDamage(e.id, 2, 'sword', 8, 4);       // 剥がす（def 1 ∴ 1 ダメージ＝生き残る）
      const after = g.getEnemies()[0];
      // 剥がれた後＝再張り付きの猶予（cooldownMs）の間は普通の敵＝体当たりして来る。
      // ⚠ プレイヤーは動かさない（動くと「逃げれば当たらない」ぶんが混ざる）。
      //   予告（slamAt）が立った tick も記録する＝「予告なしで削られた」と区別する。
      const drops = [], windups = [];
      for (let i = 17; i <= 34; i++) {
        const before = g.getState().player.hp;
        g.step(1);
        const en = g.getEnemies()[0];
        if (en?.slamAt != null) windups.push(i);
        const hp = g.getState().player.hp;
        if (hp !== before) drops.push({ tick: i, loss: before - hp });
      }
      return {
        hp0, attachedHp, overlapped, attachedAfter: after?.attached, hpEnemy: after?.hp,
        detachTick: 16, drops, windups,
      };
    });

    expect(res.overlapped, '前提：張り付き中は敵がプレイヤーに重なっている').toBe(true);
    // ★ 張り付いている間は tickLeech が true を返す＝その tick は移動も攻撃もしない（吸うのが攻撃）。
    //   戻り値を捨てると重なったまま体当たりが通る＝距離0で必ず当たる即死級になる。
    expect(res.attachedHp, '張り付き中にダメージを受けた（重なったまま体当たりが通っている＝即死級）')
      .toBe(res.hp0);
    // 対照＝剥がれた後は普通に攻撃してくる（免除が張り付き限定であることの番人）
    expect(res.attachedAfter, '殴っても剥がれていない').toBe(false);
    expect(res.hpEnemy, '剥がすつもりの一撃で倒してしまった（この本は生存前提）').toBeGreaterThan(0);
    expect(res.windups.length, '剥がれた後に体当たりの予告が出ない（張り付き中の免除が剥がれた後も続いている）')
      .toBeGreaterThan(0);
    // 剥がれた次の tick に予告が立ち、SLAM_WINDUP_MS（3 tick）後に解決して当たる
    expect(res.drops[0], '剥がれた後も体当たりが当たらない＝ただの無害な敵になっている')
      .toEqual({
        tick: res.detachTick + 1 + Math.ceil(SLAM_WINDUP_MS / TICK_MS),
        loss: ENEMY_META[TILE.RUPEE_EATER].atk,
      });
    expect(errors).toEqual([]);
  });

  test('⑬ 剣で殴ると剥がれ、cooldownMs の間は張り付き直せない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // debug は切らない＝プレイヤーが体当たりで削られて gameover になるのを避ける
    // （測るのは張り付きの時計だけ。ダメージが出ない側は ⑫ が受け持つ）。
    await gotoFrozen(page, EATER(10));

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      g.equipSwordTier(0);
      for (let i = 1; i <= 3; i++) g.step(1);     // tick3（now=360）＝張り付き中
      const before = g.getEnemies()[0];
      g.setHeroDir('right');
      g.swordAttack();                            // ★ 実経路で殴る（距離0の敵にも剣は届く）
      const hit = g.getEnemies()[0];
      const rows = [];
      for (let i = 4; i <= 30; i++) {
        g.step(1);
        const e = g.getEnemies()[0];
        rows.push({ tick: i, attached: e.attached, cooldownUntil: e.leechCooldownUntil });
      }
      return { before, hit, rows };
    });

    const cfg = ENEMY_META[TILE.RUPEE_EATER].leech;
    expect(res.before.attached, '前提：tick3 は張り付いている').toBe(true);
    // 剣は距離0（重なっている敵）にも当たる＝殴って剥がすが成立する
    expect(res.hit.hp, '剣が当たっていない（重なった敵が剣の当たり判定から外れている）')
      .toBe(ENEMY_META[TILE.RUPEE_EATER].hp - (WOOD_SWORD_ATK - ENEMY_META[TILE.RUPEE_EATER].def));
    expect(res.hit.attached, '殴っても剥がれていない＝吸われ続ける（反撃が無意味）').toBe(false);
    expect(res.hit.leechCooldownUntil, '再張り付きの猶予が cooldownMs で立っていない')
      .toBe(3 * TICK_MS + cfg.cooldownMs);
    // ★ 猶予の間は隣接（距離0）でも張り付かない＝叩いた見返りに間合いを立て直せる
    const reattach = cfg.cooldownMs / TICK_MS + 3;          // tick13
    for (const r of res.rows.filter(r => r.tick < reattach)) {
      expect(r.attached, `tick${r.tick}：猶予中なのに張り付き直した（殴る手が無意味になる）`).toBe(false);
    }
    // ❌ 失効（2026-08-25・0d-2.7）：以前は「猶予明けの tick13 に**ぴったり**張り付き直す」。
    //    近接（体当たり）の攻撃硬直（MELEE_FREEZE_MS）が全敵の既定になった今、剥がれた直後に
    //    出す体当たりの解決（tick12）から 3 tick は硬直で何もしない＝張り付き直しもその間は
    //    起きない（実測 tick15）。∴「猶予明け以降・硬直ぶんの遅れの内に張り付き直す」を固定する。
    //    ＝猶予（cooldownMs）の歯は上のループが持ち、ここは「永久に無害にならない」ことの番人。
    const again = res.rows.filter(r => r.attached).map(r => r.tick);
    const freezeTicks = Math.ceil(MELEE_FREEZE_MS / TICK_MS);
    expect(again[0], `猶予明け（tick${reattach} 以降）で張り付き直さない＝一度殴れば永久に無害になる`)
      .toBeGreaterThanOrEqual(reattach);
    expect(again[0], `猶予明け＋硬直（tick${reattach + freezeTicks}）までに張り付き直さない＝猶予が伸びている`)
      .toBeLessThanOrEqual(reattach + freezeTicks);
    expect(errors).toEqual([]);
  });

  test('⑭ 倒すと吸われたルピーの refund 割が戻る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, EATER(10));

    const res = await page.evaluate((sk) => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      for (let i = 1; i <= 11; i++) g.step(1);    // 吸血2回（tick6・tick11）
      const e = g.getEnemies()[0];
      const stolen = e.stolenRupees;
      const before = g.getState().player.rupees;
      g.dealDamage(e.id, 20, 'sword', 8, 4);      // 倒す
      return {
        stolen, before, after: g.getState().player.rupees,
        left: g.getEnemies(), defeated: g.getDefeatedEnemies('test_mechanics', sk),
      };
    }, stageKey('rupee_eater'));

    const cfg = ENEMY_META[TILE.RUPEE_EATER].leech;
    expect(res.stolen, '前提：2回ぶん吸われている').toBe(cfg.amount * 2);
    expect(res.before, '前提：吸われた分だけ所持ルピーが減っている').toBe(10 - cfg.amount * 2);
    expect(res.left, '倒せていない').toEqual([]);
    // ★ 一部だけ戻る＝「逃げれば損したまま／倒せば取り戻せる」＝倒す優先度を作る数字
    expect(res.after - res.before, '倒しても吸われたルピーが戻らない（倒す動機が消える）')
      .toBe(Math.floor(cfg.amount * 2 * cfg.refund));
    expect(res.after, '払い戻しが全額＝吸われても損しない（放置していい敵になる）').toBeLessThan(10);
    expect(res.defeated, '撃破が記録されていない').toEqual(['4,9']);
    expect(errors).toEqual([]);
  });

  test('⑮ 所持ルピーが 0 なら自分から剥がれる（無敵の置物にならない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, EATER(0));

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const flips = [];
      let prev = false;
      const rows = [];
      for (let i = 1; i <= 22; i++) {
        g.step(1);
        const e = g.getEnemies()[0];
        rows.push({ tick: i, attached: e.attached, stolen: e.stolenRupees });
        if (e.attached !== prev) { flips.push({ tick: i, attached: e.attached }); prev = e.attached; }
      }
      return { flips, rows, rupees: g.getState().player.rupees };
    });

    const cfg = ENEMY_META[TILE.RUPEE_EATER].leech;
    const drainTick = cfg.drainMs / TICK_MS + 1;                 // tick6＝1回目の吸血
    const retryTick = drainTick + cfg.cooldownMs / TICK_MS;       // tick16＝猶予明け
    // ★ 吸うものが無いまま張り付き続けると「ダメージも出さない無敵の置物」になる
    //   ∴自分から剥がれて通常の体当たり攻撃をする敵に戻る（⑫の対照と同じ振る舞い）。
    expect(res.flips, '0ルピーのときの張り付き↔剥がれの周期が想定と違う').toEqual([
      { tick: 1, attached: true },
      { tick: drainTick, attached: false },
      { tick: retryTick, attached: true },
      { tick: retryTick + cfg.drainMs / TICK_MS, attached: false },
    ]);
    expect(res.rows.at(-1).stolen, '吸うものが無いのに吸った記録が立っている').toBe(0);
    expect(res.rupees, '所持ルピーがマイナスになっている').toBe(0);
    expect(errors).toEqual([]);
  });

  test('⑯ 2種は本編レイヤーに配置済み・かつ配置表の部屋にだけ居る', () => {
    // 2026-08-19（5.5m）に配置した∴「未配置」ではなく「居る・想定外の部屋に湧いていない」
    // を守る（k-3 ⑬・k-4 ⑭ が辿った道と同じ）。分裂スライムは弱点（爆弾）が入手済みの
    // D6 以降にしか置けない＝その関門は tests/enemy-placement.spec.js ④ が持つ。
    const placed = placedCells(MAP, K5.map(([t]) => t));
    for (const [tile] of K5) {
      const name = ENEMY_META[tile].name;
      expect(placed[tile].length, `${name}（'${tile}'）が本編レイヤーに1体も居ない`).toBeGreaterThan(0);
      for (const loc of placed[tile]) {
        expect(PLACEMENT_STAGES.has(stageIdOf(loc)),
          `${name} が配置表に無い ${loc} に居る（表＝scripts/lib/enemy-placement.mjs）`).toBe(true);
      }
    }
  });
});
