// tests/facing-block-enemies.spec.js — Phase 5.5k k-4「方向依存の被ダメ」（解禁2体）
//
// #8 で作った `isGuardBlockingDir()`（一時的なガード＝攻撃クールダウン中だけ構える）を
// 2つの方向へ広げた。どちらも「殴れない敵」だが**崩し方が逆**：
//
//   ① 盾騎士 SHIELD_KNIGHT ('ζ') … `blockFacing`＝**向きで閉じる窓**。
//        正面（e.dir と一致する入射方向）からの攻撃は常に 0 ダメージ＋プレイヤーを弾く。
//        崩す手段は側面/背後へ回り込むことだけ。回り込みが成立する条件が
//        「毎tick向き直らない」＝turnMs（720ms＝6 tick）ごとの離散的な向き直り。
//        代償として**自分の剣も正面にしか振れない**＝側面に居るプレイヤーを殴れない。
//   ② 火吐き亀 FIRE_TURTLE ('φ') … `shell`＝**時間で開閉する窓**。
//        籠もり中（closed）は向きも攻撃種別も問わず全ダメージ 0・移動も攻撃もしない。
//        開いた瞬間に正面へ炎を吐く＝「開くのを待って正面から殴る」を罰する。
//
// 隠れ（k-3 の `hide`／`leap`）との違い＝**姿は消えない**＝いつでも攻撃対象になり、
// 弾かれる手応え（0ダメージ＋盾ブロックSE＋「-0」）が返る。無音で返す `e.hidden` とは
// 意図的に別扱い（combat.js dealDamageToEnemy のコメント）。
//
// 検証ステージ＝test_mechanics[33,0] `shield_knight` / [34,0] `fire_turtle`
// （⚠️ 2026-08-16、ユーザーが 32,0 に空きアリーナを挿入した＝キーが +1 ずれた。
//   座標は直書きせず `stageKey()` で引く＝この手の挿入で全スペックを直さない）
// （scripts/migrate-test-facing-block-arenas.mjs が自己検査付きで生成）。どちらも
// 遮蔽ゼロの 10×12・敵は (4,9)・**置かれた向きは 'left'（西）**。
// 外周は壁だが**左右 rows 7/8 は隣のアリーナへの通路**（tests/test-arena-doors.js）＝
// 敵を歩いて見比べるための道∴塞がない。⑦（ノックバックの壁止め）と⑫③（炎の壁止め）が
// 突き当たりに使うのは **(4,11)**＝計測帯 rows 4/5 の外周∴通路とは干渉しない。
// 敵の四方すべてが床＝正面/側面/背後の3方向から殴れる（GUIDE §3-2＝プレイヤーは
// 敵と同じセルに入れない∴回り込みには周囲1マスの余裕が要る）。
//
// tick 換算（TICK_MS=120・step() が論理時間を 120ms ずつ進める・now = 120×tick）：
//   盾騎士 … tick1 で _faceUntil=120+720=840 → now>=840 の tick7 で向き直り
//            → 以後 6 tick ごと（13・19・25…）＝**ticks 1-6 は置かれた向きのまま**
//   火吐き亀 … tick1 で closed・_shellUntil=120+1400=1520 → tick13(1560) で開く（＋炎）
//            → 1560+1000=2560 → tick22(2640) で籠もる → 2640+1400=4040 → tick34 で開く
//            ＝籠もり 1-12 / 開き 13-21 / 籠もり 22-33 / 開き 34-
//
// ⚠ 計測は1回の evaluate 内で完結させる（await をまたぐと実ループぶんの tick が混ざる）。
//   さらに各測定の冒頭で `pause()` し **gameTime===0 を前提として assert する**
//   ＝実ループの tick が漏れていたらそこで落ちる（黙ってズレた数を測らない）。
//   ただし「盤面が出てから pause() が届くまで」には実時間で 120ms の隙がある
//   ＝1 tick 漏れうる（enemy-sword-beast.spec.js:84 が「初期位置ぴったりを assert する
//   な」と書いているのと同じラグ）。ここは tick を1つ単位で数えるスペック∴ラグを
//   許容できない ⇒ `gotoFrozen()` で**実時間ループをそもそも起動させない**（下記）。
// ⚠ プレビュー（fromEditor=1）は debugMode:true ＝ takeDamage が早期 return する。
//   ∴プレイヤー側の被ダメ（炎・ノックバックの壁止め）を測る本は 'g' キーで debug を切る
//   （game.js toggleDebugMode＝実ゲームと同じ経路。debug ON のままでは isPassable が
//    常に true ＝「壁で押し込まれない」の検査が歯無しになる）。
// ⚠ k-4a 時点のスプライトは既存絵のエイリアス（GUIDE §2「機構が先・絵は後」）。
//   ∴絵の中身は主張せず名前解決だけを固定する。**火吐き亀の開/閉は今は同じ絵**＝
//   GUIDE §6-1（絵で機構を読ませる）は未達で、k-4b（32×32 実描き）で解消する。
//
// 歯の実測（2026-08-15・機構を1つずつ壊して赤くなる本を確認した）：
//   combat.js isBlockFacingDir を無効化        → ⑤⑥⑦ 赤
//   combat.js knockbackPlayerFrom を無効化      → ⑤⑥ 赤（⑦は緑＝押されないのが正解の本
//                                                 ∴「押す」側の⑤⑥が対の番人）
//   combat.js ノックバックの壁検査を外す         → ⑦ 赤（10 → 10.5＝壁に埋まる）
//   combat.js isShellClosed を無効化            → ⑪ 赤
//   enemy-ai.js tickFaceLock を毎tick向き直りに → ④⑤⑧⑨ 赤
//   enemy-ai.js 敵の剣の正面ゲートを外す         → ⑧ 赤
//   enemy-ai.js 甲羅の開閉を 1 tick 早める       → ⑩⑫ 赤
//   enemy-ai.js 炎の壁止め（break）を外す        → ⑫ 赤
//   enemy-ai.js syncShellSprite を固定名に      → ⑬ 赤
//   enemy-ai.js resolveEnemySprite の Atk 窓    → ⑨ 赤

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { ENEMY_META, ENEMY_SPEED_FAST } from '../shared/enemies.js';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { isArenaDoor, arenaDoorCells, ARENA_DOOR_ROWS } from './test-arena-doors.js';
import { placedCells, stageIdOf, PLACEMENT_STAGES } from './enemy-placed.js';

const GAME   = '/blade-of-lumia/game/';
const EDITOR = '/blade-of-lumia/editor/';
const TICK_MS = 120;
const MOVE_STEP = 0.5;
const SWORD_REACH = 1.2;

function previewUrl(stage, row, col, extra) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col),
    ps_weapon: '1',
    ...(extra ?? {}),
  });
  return `${GAME}?${p.toString()}`;
}

// 敵はどちらも (4,9)＝x9,y4。プレイヤーの立ち位置で「どの面から殴るか」を作る：
//   FRONT (4,8)  … 西＝置かれた向き 'left' の正面（弾かれる側）
//   BACK  (4,10) … 東＝背後（通る側）。壁 (4,11) が隣＝ノックバックの押し込み検査にも使う
//   FLANK (3,9)  … 北＝側面（通る側）。turnMs 後は正面になる＝回り込みに時間制限がある
const KNIGHT_FRONT = previewUrl('shield_knight', 4, 8);
const KNIGHT_BACK  = previewUrl('shield_knight', 4, 10);
const KNIGHT_FLANK = previewUrl('shield_knight', 3, 9);
// 火吐き亀：(4,7)＝炎の射程内（正面2セル）／(4,6)＝射程外／(4,10)＝壁 (4,11) の手前
const TURTLE_BURN  = previewUrl('fire_turtle', 4, 7);
const TURTLE_SAFE  = previewUrl('fire_turtle', 4, 6);
const TURTLE_WALL  = previewUrl('fire_turtle', 4, 10);

// 実時間ループ（game.js startGameLoop = setInterval(() => step(1), TICK_MS)）を
// **ページ評価の前に**無効化してから開く。理由＝pause() は「盤面が出た後」にしか届かず、
// その間に 1 tick 走ると tick 番号が丸ごと1つズレる（実測で flake になった）。
// step(1) を呼ぶ interval だけ潰す＝周期に依存しない（TICK_MS を変えても効く）。
// 差し込みが効いたことは毎回 assert する＝ループの形が変われば黙って戻らずここで落ちる。
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

const K4 = [
  [TILE.SHIELD_KNIGHT, '盾騎士',   'shieldKnight'],
  [TILE.FIRE_TURTLE,   '火吐き亀', 'fireTurtle'],
];
const threatOf = (m) => (m.hp * m.atk) / (m.def + 1);

// resolveEnemySprite（enemy-ai.js）の向き→接尾辞。左右は同じ絵を flipX で使う＝
// 用意すべきフレームは D/R/U の3方向×(通常/攻撃)の6枚（guards:false＝Guard は不要）。
const DIR_SUFFIX = ['D', 'R', 'U'];

// ── 1発殴って「通ったか・弾かれてどこへ押されたか」を返すヘルパー ────────────
// off tick まで進めてから dir へ剣を振り、敵 hp とプレイヤー座標の前後を返す。
// ⚠ 剣は実経路（combat.js swordAttack）で振る＝src 座標（player.x/y）も本番と同じ。
//   `dealDamage(id,dmg,'sword')` だけで測ると src 無し＝無方向扱いで**素通り**するので
//   向きの検査が丸ごと歯無しになる（game.js dealDamageToEnemyById のコメント）。
async function strike(page, { type, dir, off }) {
  return page.evaluate((a) => {
    const g = window.__game;
    g.pause();
    if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている（計測前提が崩れる）');
    const get = () => g.getEnemies().find(e => e.type === a.type);
    for (let i = 0; i < a.off; i++) g.step(1);
    const e0 = get();
    const p = g.getPlayer();
    const before = { hp: e0.hp, dir: e0.dir, blockDir: e0.blockDir, px: p.x, py: p.y };
    g.setHeroDir(a.dir);
    g.swordAttack();
    const e1 = get();
    return { before, after: { hp: e1?.hp ?? 0, px: p.x, py: p.y } };
  }, { type, dir, off });
}

test.describe('Phase 5.5k k-4 – 方向依存の被ダメ（盾騎士・火吐き亀）', () => {

  test('① 2種の定義（記号タイル・非ボス・機構フィールド・脅威度の上限）', () => {
    expect(TILE.SHIELD_KNIGHT, 'TILE.SHIELD_KNIGHT が未定義').toBe('ζ');
    expect(TILE.FIRE_TURTLE,   'TILE.FIRE_TURTLE が未定義').toBe('φ');

    for (const [tile, name] of K4) {
      const m = ENEMY_META[tile];
      expect(m, `ENEMY_META['${tile}'] が無い`).toBeTruthy();
      expect(m.name, `${tile} の名前`).toBe(name);
      expect(m.isBoss, `${name} は通常敵`).toBeFalsy();
      // 通常敵の最強格＝剣獣（脅威度 10）を超えない（2種は「中〜高」枠）
      expect(threatOf(m), `${name} の脅威度が剣獣（10）以上＝通常敵の最強格を追い越している`)
        .toBeLessThan(threatOf(ENEMY_META[TILE.SWORD_BEAST]));
      // GUIDE §7-2＝敵はプレイヤー（速度換算 1.0）より必ず遅い
      expect(m.speed, `${name} がプレイヤーと同速以上＝振り切れない`).toBeLessThan(ENEMY_SPEED_FAST);
      expect(m.weakness, `${name} に弱点属性は持たせない（位置取り／待ちで崩す敵）`).toBeUndefined();
    }

    // ① 盾騎士＝向きで閉じる窓。回り込みが成立する条件を数値で固定する。
    const k = ENEMY_META[TILE.SHIELD_KNIGHT];
    expect(k.blockFacing, '盾騎士に blockFacing が無い').toBeTruthy();
    expect(k.directional, '向き別スプライトが要る（正面がどこかを絵で読ませる）').toBe(true);
    expect(k.guards, 'ガード状態機械には乗せない＝ブロックは常設（Guard フレーム不要）').toBe(false);
    expect(k.blockFacing.turnMs, '向き直りの間隔が無い＝毎tick向き直る＝回り込めない')
      .toBeGreaterThan(0);
    // ★ 機構が成立する下限：向き直りまでの猶予でプレイヤーが1セル以上動けること。
    //   プレイヤーは 1 tick で MOVE_STEP(0.5) セル進む∴turnMs/TICK_MS × 0.5 ≧ 1.0。
    expect((k.blockFacing.turnMs / TICK_MS) * MOVE_STEP,
      '向き直りが速すぎて側面へ回り込む前に正面を向かれる＝blockFacing が理不尽になる')
      .toBeGreaterThanOrEqual(1.0);
    // 測定が決定論的であること（tick 境界に乗る＝ズレた tick を数えない）
    expect(k.blockFacing.turnMs % TICK_MS, 'turnMs が tick の整数倍でない＝観測 tick が揺れる').toBe(0);
    expect(k.blockFacing.knockback, '弾き返しの距離が無い＝正面が「ただ0ダメージ」になる')
      .toBeGreaterThan(0);
    expect(k.blockFacing.knockback % MOVE_STEP, 'ノックバックが移動単位の整数倍でない＝半端な座標になる').toBe(0);
    expect(k.blockFacing.knockback, '1歩で剣の間合いより外へ飛ぶ＝弾かれる意味を超えて吹っ飛ぶ')
      .toBeLessThan(SWORD_REACH);
    expect(k.attack?.type, '自分も剣で殴る（正面限定の攻撃）').toBe('sword');
    expect(k.attack.range, '隣接（距離1.0）のプレイヤーに届くリーチ').toBeGreaterThanOrEqual(1.2);

    // ② 火吐き亀＝時間で開閉する窓。殴れる窓を籠もりより短く保つ＝待ちのリズム。
    const t = ENEMY_META[TILE.FIRE_TURTLE];
    expect(t.shell, '火吐き亀に shell が無い').toBeTruthy();
    expect(t.shell.closedMs, '籠もり時間').toBeGreaterThan(0);
    expect(t.shell.openMs,   '開いている時間').toBeGreaterThan(0);
    expect(t.shell.closedMs, '開いている方が長い＝殴り放題になる').toBeGreaterThan(t.shell.openMs);
    // ★ 炎が剣の間合いより遠くまで届く＝「開くのを待って正面に立つ」が罰される。
    //   ここが SWORD_REACH 以下だと「正面で待って開いた瞬間に殴る」が最適解になり機構が死ぬ。
    expect(t.shell.breathCells, '炎が剣の間合い以下＝正面で待つのが最適解になる')
      .toBeGreaterThan(SWORD_REACH);
    expect(t.shell.breathAtk, '炎のダメージが体当たりより弱い＝浴びても痛くない')
      .toBeGreaterThanOrEqual(t.atk);
    expect(t.shell.breathMs, '炎の表示時間（CSS .enemy-fire-breath と対）').toBeGreaterThan(0);
    expect(t.attack?.type, '体当たり（charge）のみ（飛び道具は持たない＝炎は shell 側の一撃）').toBe('charge');
    expect(t.directional, '甲羅は開/閉の2枚で足りる＝向き別9枚は要らない').toBeFalsy();
    // 籠もりと開きの機構は別物＝取り違えを防ぐ（盾騎士に shell／亀に blockFacing は無い）
    expect(k.shell, '盾騎士に shell は無い（崩し方は向き）').toBeUndefined();
    expect(t.blockFacing, '火吐き亀に blockFacing は無い（崩し方は時間）').toBeUndefined();
  });

  test('② タイル定義・スプライト・パレット・スプライトマップの名前解決', () => {
    for (const [tile, name, pal] of K4) {
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
    }

    // 状態から導かれる**すべての**スプライト名が解決すること（1枚欠けるとその瞬間だけ絵が消える）。
    //   盾騎士 … resolveEnemySprite が `${base}${Dir}` / `${base}${Dir}Atk` を作る（Guard は guards:false で不要）
    //   火吐き亀 … syncShellSprite が `fireTurtle` / `fireTurtleClosed` を切り替える
    const required = [
      ...DIR_SUFFIX.flatMap(d => [`shieldKnight${d}`, `shieldKnight${d}Atk`]),
      'fireTurtle', 'fireTurtleClosed',
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
    // meta.sprite は「向き無しの起点」＝上の一覧に含まれていること（別名を書いても気付けない）
    expect(required, '盾騎士の meta.sprite が向き別スプライトの一覧に無い')
      .toContain(ENEMY_META[TILE.SHIELD_KNIGHT].sprite);
    expect(required, '火吐き亀の meta.sprite が一覧に無い')
      .toContain(ENEMY_META[TILE.FIRE_TURTLE].sprite);
  });

  test('③ エディタのパレットに2種が並ぶ（置けない敵は死蔵になる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(EDITOR);
    // ⚠ パレットは初期状態でパネルが畳まれていて visible にならない（DOM には在る）∴'attached'。
    await page.waitForSelector('#tile-palette .tile-btn', { state: 'attached' });

    for (const [tile, name] of K4) {
      const btn = page.locator(`#tile-palette .tile-btn[title="${name}"]`);
      await expect(btn, `${name}（'${tile}'）がパレットに無い＝エディタで配置できない`).toHaveCount(1);
      await expect(btn.locator('canvas'), `${name} がスプライトで描かれていない`).toHaveCount(1);
    }
    expect(errors, 'エディタで pageerror').toEqual([]);
  });

  // ── 盾騎士 ─────────────────────────────────────────────────────────────
  test('④ 盾騎士は置かれた向きを turnMs 維持し、6 tick ごとにだけ向き直る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, KNIGHT_BACK);       // プレイヤーは東（背後）＝置かれた向き 'left' の逆

    // tick8 でプレイヤーを北へ移す＝「向いていない側へ動いても即座に向き直らない」を測る。
    const rows = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const get = () => g.getEnemies().find(e => e.type === 'ζ');
      const out = [];
      for (let i = 1; i <= 20; i++) {
        if (i === 8) { const p = g.getPlayer(); p.y = 3; p.x = 9; }   // 東 → 北へ回り込む
        g.step(1);
        const e = get();
        out.push({ tick: i, dir: e.dir, blockDir: e.blockDir, faceUntil: e.faceUntil, x: e.x, y: e.y });
      }
      return out;
    });

    const dirAt = (t) => rows.find(r => r.tick === t).dir;
    // ticks 1-6＝置かれた向き（enemyDirs 'left'）のまま＝毎tick向き直っていない
    for (let t = 1; t <= 6; t++) {
      expect(dirAt(t), `tick${t}：置かれた向きを保っていない（毎tickプレイヤーを向いている＝回り込めない）`)
        .toBe('left');
    }
    expect(dirAt(7), 'tick7（turnMs 経過）でプレイヤー側（東）へ向き直っていない').toBe('right');
    // ticks 8-12＝プレイヤーは北へ移ったのに向きは据え置き＝これが回り込みの猶予
    for (let t = 8; t <= 12; t++) {
      expect(dirAt(t), `tick${t}：プレイヤーが北へ動いた直後に向き直った＝猶予が無い`).toBe('right');
    }
    expect(dirAt(13), 'tick13（次の turnMs）で北へ向き直っていない').toBe('up');
    for (let t = 14; t <= 18; t++) {
      expect(dirAt(t), `tick${t}：向きが揺れている`).toBe('up');
    }
    // 向き直りの時計＝turnMs ずつ進む（720ms＝6 tick）
    expect(rows.find(r => r.tick === 6).faceUntil, 'tick6 の _faceUntil').toBe(840);
    expect(rows.find(r => r.tick === 7).faceUntil, 'tick7 で _faceUntil が turnMs ぶん進んでいない').toBe(1560);
    expect(rows.find(r => r.tick === 13).faceUntil, 'tick13 で _faceUntil が進んでいない').toBe(2280);
    // ブロック面は常に向きと一致（combat.js が読むのは _blockDir＝ここがズレると弾く面が絵と違う）
    for (const r of rows) {
      expect(r.blockDir, `tick${r.tick}：ブロック面が向きと一致しない`).toBe(r.dir);
    }
    // 隣接したプレイヤーのセルへは入れない（GUIDE §3-2）＝測定中ずっと (4,9) に居る
    expect(rows.map(r => `${r.y},${r.x}`).filter((v, i, a) => a.indexOf(v) === i),
      '盾騎士が動いた＝プレイヤーのセルへ踏み込んでいる（位置が動くと入射方向も変わる）')
      .toEqual(['4,9']);
    expect(errors).toEqual([]);
  });

  test('⑤ 盾騎士：正面は0ダメージ＋プレイヤーが弾かれる／側面・背後は通る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // どれも tick3＝置かれた向き 'left' のまま（④で固定した窓 ticks 1-6 の内側）。
    await gotoFrozen(page, KNIGHT_FRONT);
    const front = await strike(page, { type: 'ζ', dir: 'right', off: 3 });
    expect(front.before.dir, '前提：tick3 は西を向いている').toBe('left');
    expect(front.after.hp, '正面から殴ってダメージが通った＝向き固定ブロックが効いていない')
      .toBe(front.before.hp);
    // ★ 0ダメージだけでは「置物」＝弾かれてプレイヤーが後退することまでが契約
    expect(front.after.px, '弾かれてプレイヤーが下がっていない（ノックバックが起きていない）')
      .toBeCloseTo(front.before.px - ENEMY_META[TILE.SHIELD_KNIGHT].blockFacing.knockback, 5);
    expect(front.after.py, '横へずれた（押す向きはカーディナル1方向）').toBeCloseTo(front.before.py, 5);

    await gotoFrozen(page, KNIGHT_BACK);
    const back = await strike(page, { type: 'ζ', dir: 'left', off: 3 });
    expect(back.before.dir, '前提：tick3 は西（プレイヤーと反対）を向いている').toBe('left');
    expect(back.after.hp, '背後から殴ってもダメージが通らない＝倒す手段が無い')
      .toBeLessThan(back.before.hp);
    expect(back.after.px, '通ったのに弾かれた（ノックバックは正面ブロック限定）').toBeCloseTo(back.before.px, 5);

    await gotoFrozen(page, KNIGHT_FLANK);
    const flank = await strike(page, { type: 'ζ', dir: 'down', off: 3 });
    expect(flank.before.dir, '前提：tick3 は西を向いている（プレイヤーは北）').toBe('left');
    expect(flank.after.hp, '側面から殴ってもダメージが通らない＝回り込みに報酬が無い')
      .toBeLessThan(flank.before.hp);
    expect(flank.after.py, '通ったのに弾かれた').toBeCloseTo(flank.before.py, 5);
    expect(errors).toEqual([]);
  });

  test('⑥ 盾騎士：向き直った後は同じ側面攻撃が弾かれる（回り込みには時間制限がある）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, KNIGHT_FLANK);

    // ④の窓＝tick7 で北（プレイヤー側）へ向き直る。⑤で通った同じ一撃が通らなくなる
    // ＝「側面はいつでも安全」ではない＝居座ると正面に変わる、が機構の芯。
    const late = await strike(page, { type: 'ζ', dir: 'down', off: 8 });
    expect(late.before.dir, '前提：tick8 は北（プレイヤー側）を向いている').toBe('up');
    expect(late.after.hp, '向き直った後も側面扱いでダメージが通った＝向き直りが判定に反映されていない')
      .toBe(late.before.hp);
    expect(late.after.py, '弾かれてプレイヤーが下がっていない')
      .toBeCloseTo(late.before.py - ENEMY_META[TILE.SHIELD_KNIGHT].blockFacing.knockback, 5);
    expect(errors).toEqual([]);
  });

  test('⑦ 盾騎士：壁際ではノックバックで押し込まれない（プレイヤーが壁に埋まらない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, KNIGHT_BACK);      // (4,10)＝東隣 (4,11) が外周の壁
    // ⚠ debug ON（プレビュー既定）では isPassable が常に true ＝壁の検査にならない∴
    //   'g' で debug を切る（game.js toggleDebugMode＝実ゲームと同じ経路）。
    await page.keyboard.press('g');

    const res = await strike(page, { type: 'ζ', dir: 'left', off: 8 });
    expect(res.before.dir, '前提：tick8 は東（プレイヤー側）を向いている＝正面ブロック').toBe('right');
    expect(res.after.hp, '正面なのにダメージが通った').toBe(res.before.hp);
    // ★ ⑤では同じ正面ブロックでプレイヤーが 0.5 下がる。ここで動かないのは壁のせい
    //   ＝「押せる時は押す／押せない時は詰まらない」の両側が揃って初めて歯になる。
    expect(res.after.px, '壁（4,11）の中へ押し込まれた').toBeCloseTo(res.before.px, 5);
    expect(res.after.py, '横へずれた').toBeCloseTo(res.before.py, 5);
    expect(errors).toEqual([]);
  });

  test('⑧ 盾騎士の剣も正面にしか振れない（側面のプレイヤーは向き直るまで殴られない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // 敵の剣エフェクト（.sword-thrust）が増えた tick を数える。除去は setTimeout(260ms)
    // ＝同期ループ中は消えない（k-3 ⑦ と同じ観測法）。
    //
    // ⚠ 初撃の時計＝`e._attackTimes[i] ?? 0` と cooldown（enemy-ai.js enemyAttack）
    //   ＝spawn から 1100ms 経過後∴**どんな向きでも tick9 までは振れない**。
    //   ∴「ticks 1-6 は殴られない」を assert してもクールダウンで自明＝歯が無い。
    //   向きゲートだけが理由になる窓＝**クールダウンが開いた後（tick10 以降）に
    //   向きが外れている状態**を作って測る。
    const swingsOf = (page, moveAt) => page.evaluate((mv) => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const swings = [];
      for (let i = 1; i <= 16; i++) {
        if (mv && i === mv.tick) { const p = g.getPlayer(); p.y = mv.y; p.x = mv.x; }
        const before = document.querySelectorAll('.sword-thrust').length;
        g.step(1);
        const after = document.querySelectorAll('.sword-thrust').length;
        const e = g.getEnemies().find(x => x.type === 'ζ');
        if (after > before) swings.push({ tick: i, dir: e.dir });
      }
      return swings;
    }, moveAt);

    // (A) 対照＝プレイヤーが正面（東）に居続ける。tick7 で東へ向き直り、クールダウンが
    //     開く tick10 に振る＝「tick10 が初撃」の基準線を実測で押さえる。
    await gotoFrozen(page, KNIGHT_BACK);
    const control = await swingsOf(page, null);
    expect(control[0], '正面に居るのに初撃が tick10（クールダウン明け）に来ない').toEqual({ tick: 10, dir: 'right' });

    // (B) 本番＝クールダウンが開く直前（tick9 の頭）にプレイヤーが北へ回り込む。
    //     向きは turnMs の窓（ticks 7-12）で 'right' に据え置かれる∴tick10-12 は
    //     「クールダウンは開いている・間合い 1.0 も満たす・向きだけが外れている」
    //     ＝振らない理由が向きゲートしか残らない窓。
    await gotoFrozen(page, KNIGHT_BACK);
    const res = await swingsOf(page, { tick: 9, y: 3, x: 9 });

    expect(res.filter(s => s.tick <= 12),
      'クールダウン明け（tick10-12）に側面のプレイヤーを殴った＝剣が正面限定になっていない'
      + '（向きロックの代償が払われず、回り込みがノーリスクの狩り場でなくなる）')
      .toEqual([]);
    expect(res.length, '向き直った後も一度も攻撃してこない＝無害な置物になっている')
      .toBeGreaterThan(0);
    expect(res[0], '次の向き直り（tick13・北）で振り直していない').toEqual({ tick: 13, dir: 'up' });
    expect(errors).toEqual([]);
  });

  test('⑨ 盾騎士：向きと攻撃窓でスプライトが切り替わる（e.sprite と DOM 両方）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, KNIGHT_FLANK);

    const rows = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const out = [];
      for (let i = 1; i <= 13; i++) {
        g.step(1);
        const e = g.getEnemies().find(x => x.type === 'ζ');
        const el = document.getElementById(`char-enemy-${e.id}`);
        out.push({
          tick: i, dir: e.dir, sprite: e.sprite,
          domSprite: el?.querySelector('canvas.sprite')?.dataset.sprite ?? null,
        });
      }
      return out;
    });

    // ④⑧で固定した拍＝ticks 1-6 は西向き（左右は同じ絵＝接尾辞 R）／tick7 で北へ向き直り
    // ／初撃はクールダウンが開く tick10（⑧の対照で実測）＝_atkUntil = 1200+180=1380
    // ∴tick10-11 が攻撃ポーズ・tick12 で通常へ戻る。
    const expected = { 1:'shieldKnightR', 2:'shieldKnightR', 3:'shieldKnightR', 4:'shieldKnightR',
      5:'shieldKnightR', 6:'shieldKnightR', 7:'shieldKnightU', 8:'shieldKnightU',
      9:'shieldKnightU', 10:'shieldKnightUAtk', 11:'shieldKnightUAtk',
      12:'shieldKnightU', 13:'shieldKnightU' };
    for (const r of rows) {
      expect(r.sprite, `tick${r.tick}（${r.dir}）の e.sprite が想定と違う`).toBe(expected[r.tick]);
      expect(r.domSprite, `tick${r.tick} の DOM canvas が e.sprite と食い違う（差し替えが起きていない）`)
        .toBe(expected[r.tick]);
    }
    expect(errors).toEqual([]);
  });

  // ── 火吐き亀 ───────────────────────────────────────────────────────────
  test('⑩ 火吐き亀は籠もりで登場し、籠もり1.4s↔開き1.0s の周期で開閉する', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, TURTLE_SAFE);

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const get = () => g.getEnemies().find(e => e.type === 'φ');
      const rows = [];
      let prev = null;
      const flips = [];
      for (let i = 1; i <= 36; i++) {
        g.step(1);
        const e = get();
        rows.push({ tick: i, phase: e.shellPhase, closed: e.shellClosed, until: e.shellUntil });
        if (e.shellClosed !== prev) { flips.push({ tick: i, closed: e.shellClosed }); prev = e.shellClosed; }
      }
      return { rows, flips };
    });

    // closedMs 1400 → now>=1520 の tick13 で開く／openMs 1000 → now>=2560 の tick22 で籠もる
    expect(res.flips[0], '登場時は籠もり（甲羅を閉じて現れる）').toEqual({ tick: 1, closed: true });
    expect(res.flips[1], '1.4s 経過で開かない').toEqual({ tick: 13, closed: false });
    expect(res.flips[2], '1.0s 経過で籠もり直さない').toEqual({ tick: 22, closed: true });
    expect(res.flips[3], '2周期目が来ない').toEqual({ tick: 34, closed: false });
    expect(res.flips.length, '観測窓（36 tick）に余計な切り替わりがある').toBe(4);
    // phase 名と closed フラグが一致（片方だけ書き換えると絵と判定が食い違う）
    for (const r of res.rows) {
      expect(r.closed, `tick${r.tick}：shellPhase と shellClosed が食い違う`).toBe(r.phase === 'closed');
    }
    expect(errors).toEqual([]);
  });

  test('⑪ 籠もり中は方向を問わず全ダメージ0／開いている間だけ通る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, TURTLE_SAFE);

    // 敵は (4,9)＝x9,y4。四方の隣接セルを発生源にして殴る（src を渡さないと無方向扱いで
    // 素通りする＝方向を測るテストは必ず src を渡す）。
    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const get = () => g.getEnemies().find(e => e.type === 'φ');
      const hitFromAll = () => {
        const out = [];
        for (const [sx, sy, label] of [[8,4,'west'],[10,4,'east'],[9,3,'north'],[9,5,'south']]) {
          const e = get();
          const before = e.hp;
          g.dealDamage(e.id, 3, 'sword', sx, sy);
          out.push({ label, closed: e.shellClosed, loss: before - (get()?.hp ?? 0) });
        }
        return out;
      };
      for (let i = 0; i < 3; i++) g.step(1);        // tick3 = 籠もり中
      const closed = hitFromAll();
      for (let i = 3; i < 15; i++) g.step(1);       // tick15 = 開いている
      const open = hitFromAll();
      return { closed, open };
    });

    for (const r of res.closed) {
      expect(r.closed, `前提：tick3 は籠もり中（${r.label}）`).toBe(true);
      expect(r.loss, `籠もり中に ${r.label} からのダメージが通った（甲羅は方向を問わず無敵）`).toBe(0);
    }
    for (const r of res.open) {
      expect(r.closed, `前提：tick15 は開いている（${r.label}）`).toBe(false);
      expect(r.loss, `開いている間に ${r.label} からのダメージが通らない＝倒せない`).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
  });

  test('⑫ 甲羅を開いた瞬間に正面へ炎を吐く（射程2セル・壁で止まる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // ⚠ プレビューは debugMode:true ＝ takeDamage が早期 return する∴'g' で切る。
    //   切らないと「炎を浴びても hp が減らない」＝歯の無いテストになる。
    const run = async (url, ticks) => {
      await gotoFrozen(page, url);
      await page.keyboard.press('g');
      return page.evaluate((n) => {
        const g = window.__game;
        g.pause();
        if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
        const cellPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
        const hp0 = g.getState().player.hp;
        const out = { hp0, drops: [], fireAt: null, fireCells: [], preFire: 0 };
        for (let i = 1; i <= n; i++) {
          const hpBefore = g.getState().player.hp;
          g.step(1);
          const hp = g.getState().player.hp;
          const fires = [...document.querySelectorAll('.enemy-fire-breath')];
          if (out.fireAt === null && fires.length > 0) {
            out.fireAt = i;
            out.fireCells = fires.map(el => Math.round(parseFloat(el.style.left) / cellPx));
          } else if (out.fireAt === null) {
            out.preFire = i;                       // 炎が出る前の最終 tick
          }
          if (hp !== hpBefore) out.drops.push({ tick: i, loss: hpBefore - hp });
        }
        return out;
      }, ticks);
    };

    // ① 射程内（正面2セル目）＝焼かれる。炎は (4,8)(4,7) の2セルに出る。
    const burn = await run(TURTLE_BURN, 14);
    expect(burn.fireAt, '甲羅が開く tick13 に炎が出ていない（開いた瞬間の一撃が無い）').toBe(13);
    expect(burn.fireCells.sort((a, b) => b - a), '炎が正面2セル（col 8→7）に出ていない')
      .toEqual([8, 7]);
    expect(burn.drops, '炎を浴びてもプレイヤーの hp が減らない')
      .toEqual([{ tick: 13, loss: ENEMY_META[TILE.FIRE_TURTLE].shell.breathAtk }]);

    // ② 射程外（正面3セル目）＝同じ炎でも届かない（射程が無限でない）
    const safe = await run(TURTLE_SAFE, 21);
    expect(safe.fireAt, '前提：tick13 に炎が出る').toBe(13);
    expect(safe.fireCells.sort((a, b) => b - a), '炎の射程が伸びている').toEqual([8, 7]);
    expect(safe.drops, '射程外（3セル目）のプレイヤーが焼かれた＝間合いを取る意味が無い').toEqual([]);

    // ③ 壁で止まる＝壁越しには焼かれない（(4,10) の東隣 (4,11) は外周の壁）
    const wall = await run(TURTLE_WALL, 14);
    expect(wall.fireAt, '前提：tick13 に炎が出る').toBe(13);
    expect(wall.fireCells, '炎が壁（col 11）を貫いた／向きが東になっていない').toEqual([10]);
    expect(wall.drops.map(d => d.tick), '正面1セル目のプレイヤーが焼かれない').toEqual([13]);
    expect(errors).toEqual([]);
  });

  test('⑬ 火吐き亀：籠もり/開きでスプライトが切り替わる（無敵の理由が絵で読める）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, TURTLE_SAFE);

    const rows = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const out = [];
      for (let i = 1; i <= 24; i++) {
        g.step(1);
        const e = g.getEnemies().find(x => x.type === 'φ');
        const el = document.getElementById(`char-enemy-${e.id}`);
        out.push({
          tick: i, closed: e.shellClosed, sprite: e.sprite,
          domSprite: el?.querySelector('canvas.sprite')?.dataset.sprite ?? null,
        });
      }
      return out;
    });

    // ⑩で固定した周期＝籠もり 1-12 / 開き 13-21 / 籠もり 22-
    for (const r of rows) {
      const expected = r.closed ? 'fireTurtleClosed' : 'fireTurtle';
      expect(r.sprite, `tick${r.tick}（closed=${r.closed}）の e.sprite が状態と食い違う`).toBe(expected);
      expect(r.domSprite, `tick${r.tick} の DOM canvas が e.sprite と食い違う（差し替えが起きていない）`)
        .toBe(expected);
    }
    // 切り替わりが実際に起きている（ずっと同じ名前なら上のループは通ってしまう）
    expect(new Set(rows.map(r => r.sprite)), '開閉でスプライト名が切り替わっていない')
      .toEqual(new Set(['fireTurtleClosed', 'fireTurtle']));
    expect(errors).toEqual([]);
  });

  test('⑭ 2種は本編レイヤーに配置済み・かつ配置表の部屋にだけ居る', () => {
    // 2026-08-19（5.5m）に配置した∴「未配置」ではなく「居る・想定外の部屋に湧いていない」
    // を守る（k-3 ⑬・sea-enemies ⑨ が辿った道と同じ）。配置の意図＝脅威度の梯子・
    // 弱点の関門・着地セル・向きは tests/enemy-placement.spec.js が持つ。
    const placed = placedCells(MAP, K4.map(([t]) => t));
    for (const [tile] of K4) {
      const name = ENEMY_META[tile].name;
      expect(placed[tile].length, `${name}（'${tile}'）が本編レイヤーに1体も居ない`).toBeGreaterThan(0);
      for (const loc of placed[tile]) {
        expect(PLACEMENT_STAGES.has(stageIdOf(loc)),
          `${name} が配置表に無い ${loc} に居る（表＝scripts/lib/enemy-placement.mjs）`).toBe(true);
      }
    }
  });

  // ⑮ ライブマップは手編集できる＝検証ステージの幾何は黙って変わる∴**前提を測る本**を
  //    置いて、崩れたときに「機構が壊れた」ではなく「盤面が崩れた」と読める形で赤くする。
  //    ⚠️ ただし外周は「全部壁」ではない：2026-08-16 に (4,0)(4,11)(5,0)(5,11) が床に
  //    なっているのを見て「手編集のドリフト」と決めつけ、**ユーザーが敵を歩いて見比べる
  //    ために開けた通路を2回塞いだ**（k-4b・k-5a）。通路は仕様＝rows 7/8 に移して
  //    tests/test-arena-doors.js に定義し、この本は
  //      (a) 通路以外の外周は壁（⑦⑫が突き当たりに使う (4,11) を含む）
  //      (b) **通路は開いている**（塞ぐと隣のアリーナへ歩いて行けない）
  //    の両方を測る＝どちらの向きの事故も赤くなる。
  test('⑮ 検証ステージの幾何が前提どおり（外周は壁＋左右の通路・内部は素の床・敵は (4,9) の left）', () => {
    for (const [name, tile] of [['shield_knight', TILE.SHIELD_KNIGHT], ['fire_turtle', TILE.FIRE_TURTLE]]) {
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
              // 隣のアリーナへの通路。塞ぐと敵を歩いて見比べられない（ユーザー指摘）。
              expect(t, `${name}: 通路 (${r},${c}) が塞がれている＝隣のアリーナへ歩いて行けない`)
                .toBe(TILE.FLOOR);
            } else {
              // ⑦ のノックバック・⑫ の炎はこの壁を突き当たりとして測る（無いと歯が無くなる）
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
      expect(sd.enemyDirs, `${name}: 置かれた向きが left でない＝正面/側面/背後の対応が入れ替わる`)
        .toEqual({ '4,9': 'left' });
      // ⑦⑫③ が突き当たりに使うのは (4,11)＝計測帯の外周（通路の行と食い違っていないこと）
      expect(grid[4][11], `${name}: (4,11) が壁でない＝⑦⑫の突き当たりが消える`).toBe(TILE.WALL);
      // 通路は「歩いて抜けられる」ことが目的＝1つ内側が壁だと着地が拒否される
      // （game.js arrivalIsWall）∴内側も床であること。
      for (const [r, c] of arenaDoorCells(grid[0].length)) {
        const inner = c === 0 ? 1 : grid[0].length - 2;
        expect(grid[r][inner], `${name}: 通路 (${r},${c}) の内側 (${r},${inner}) が床でない＝通れない`)
          .toBe(TILE.FLOOR);
      }
    }
  });
});
