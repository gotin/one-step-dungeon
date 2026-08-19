// tests/thrown-projectile-enemies.spec.js — Phase 5.5k k-6「投擲物の種別追加」（解禁2体）
//
// k-6 で足したのは**投擲物の「飛び方」を2つ**（projectile.js lobStep / boomerangStep の一般化）。
// 既存の投擲物はすべて「まっすぐ飛んで、当たったら消える」1種類だった：
//
//   ① 爆弾鬼 BOMB_OGRE ('λ') … `attack.type:'bombThrow'`＝**放物線（lob）**。
//        投げた瞬間のプレイヤーのセルを着弾点として記録し、そこへ必ず落ちて範囲爆発する。
//        ・飛翔中は当たり判定を一切通らない（壁・水・キャラを素通りする＝上を通る）∴
//          **遮蔽の裏に隠れても届く／盾では防げない**＝この敵の答えは「その場を離れる」
//        ・爆風はプレイヤーの爆弾と**同じ関数**（explodeAt）で起こす＝`!`（壊せる壁）も壊れる
//          （範囲・壊す力がプレイヤーの爆弾と別実装だと、自分の爆弾から範囲を学べない）
//        ・敵は巻き込まない（enemyDamage:0＝味方撃ちしない・DECISIONS 2026-08-16）
//   ② ブーメラン鬼 BOOMERANG_OGRE ('π') … `attack.type:'boomerangThrow'`＝**往復（returnsToOwner）**。
//        縦横が揃ったときだけ投げる（swordBeam と同型）が、**帰りは投げた敵へ向かう**∴
//        行きを横に避けたプレイヤーが行へ戻ると帰りに当たる（二度読み）。
//        ・回収（アイテム・かがり火）は `collects = owner === 'player'` で塞ぐ＝敵の
//          ブーメランでギミックが解けない
//        ・投げた敵が死んだら発射点へ帰って消える（追う相手を失って永久に飛ばない）
//
// 検証ステージ＝test_mechanics[37,0] `bomb_ogre` / [38,0] `boomerang_ogre`
// （scripts/migrate-test-thrown-projectile-arenas.mjs が自己検査付きで生成。座標は `stageKey()`）。
// ⚠️ `bomb_ogre` は**意図的に遮蔽ゼロではない**＝内部に壁(4,7)と壊せる壁 `!`(4,3) がある
//    （壁が無いと「越えた」ことを測れない＝bat_swarm の水帯と同型の例外）。
// 外周は壁だが**左右 rows 7/8 は隣のアリーナへの通路**（tests/test-arena-doors.js）∴塞がない。
//
// tick 換算（TICK_MS=120・step() が論理時間を 120ms 進める・tick i の now = 120×i）：
//   爆弾鬼の初撃     … cooldown 2160 ∴ tick18（tick17 では飛ばない＝対照・GUIDE §4-1）
//   爆弾の飛翔       … 発射点 x=8.2 → 着弾 x=4（4.2セル）を 1tick 0.5セルで進む＝9 step
//                      ＝投げた tick(18) を1歩目に数えて tick26 で着弾
//   ブーメラン鬼の初撃 … cooldown 2400 ∴ tick20
//   ブーメランの往復  … 1tick 1.0セル。折り返しは **tick 冒頭の飛距離**で決める（既存の
//                      プレイヤーのブーメランと同じ作法）∴maxRange 4.5 を最大 2tick 分
//                      （2.0セル）超えてから折り返す＝実測 6.0セル（x 8.2 → 2.2）
//
// ⚠ 計測は1回の evaluate 内で完結させ、冒頭で pause() → gameTime===0 を assert する。
//   実時間ループは `gotoFrozen()` でそもそも起動させない（k-4/k-5 spec と同じ理由）。
// ⚠ プレビュー（fromEditor=1）は debugMode:true ＝ takeDamage が早期 return する∴
//   プレイヤーの被ダメを測る本は 'g' で debug を切る（切らないと歯が抜ける）。
// ⚠ 「密着では投げない」「行/列が揃わないと投げない」は**毎tick プレイヤーを置き直して
//   条件を維持する**（敵は退がる／行を揃えに来る＝放っておくと条件が自然に外れて、
//   ゲートを壊しても緑のままになる）。
// ⚠ k-6a 時点のスプライトは既存絵のエイリアス（GUIDE §2「機構が先・絵は後」）∴絵の中身は
//   主張せず名前解決と「投擲物が実際に描かれること（canvas が生える）」だけを固定する。
//   実描き（32×32・向き別6枚×2体）は k-6b の担当。
//
// ── 歯の実測（2026-08-17・機構を1つずつ壊して赤くなる本を数えた）─────────────
//   projectile.js lobStep の routing（`else if (proj.lob)`）を外す ………… ⑥⑦⑧⑨⑩
//   projectile.js lobStep の着弾セルを「今のプレイヤー」に変える ………… ⑧
//   projectile.js explodeAt の playerDamage を落とす ……………………………… ⑥⑨
//   projectile.js explodeAt の enemyDamage を既定（5）にする ………………… ⑩
//   projectile.js boomerangStep の `returnsToOwner` を owner 判定に戻す … ⑰
//   projectile.js boomerangHome の「投げ手が死んだら発射点」を外す ……… ⑮
//   projectile.js collects ゲート（owner==='player'）を外す ………………… ⑯
//   enemy-ai.js   bombThrow / boomerangThrow の分岐を削る ………………… ⑤〜⑯
//   enemy-ai.js   boomerangThrow の縦横ゲート（sameCol/sameRow）を外す … ⑫
//   enemy-ai.js   minRange のゲートを外す ……………………………………………… ⑪
//   検証ステージの壁(4,7) を消す ………………………………………………………… ④⑥
// ※ ①②③⑱ はデータ／配置の番人（実行時の機構ではない）∴上の破壊では動かない。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { ENEMY_META, ENEMY_SPEED_FAST, PROJECTILE_SPRITE } from '../shared/enemies.js';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';
import { ITEM_SPRITES, ITEM_PAL } from '../shared/sprites-items.js';
import { SPRITES, PAL } from '../shared/sprites.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { ITEM_META } from '../shared/items.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { isArenaDoor, arenaDoorCells, ARENA_DOOR_ROWS } from './test-arena-doors.js';
import { placedCells, stageIdOf, PLACEMENT_STAGES } from './enemy-placed.js';

const GAME   = '/blade-of-lumia/game/';
const EDITOR = '/blade-of-lumia/editor/';
const TICK_MS = 120;
const MOVE_STEP = 0.5;

function previewUrl(stage, row, col, extra) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(stage),
    row: String(row), col: String(col),
    ps_weapon: '1',
    ...(extra ?? {}),
  });
  return `${GAME}?${p.toString()}`;
}

// 敵はどちらも (4,9)＝x9,y4。計測に使う立ち位置（migrate スクリプトが幾何を検査している）：
//   爆弾鬼      … (4,4)＝壁(4,7) の向こう・dist 5.0（射程 7・遠隔相 [2.5, 6.0] の内側）
//   ブーメラン鬼 … (4,6)＝同じ行・dist 3.0（射程 4.0・遠隔相 [2.5, 3.5] の内側）
const BOMB  = (extra) => previewUrl('bomb_ogre', 4, 4, extra);
const BOOM  = (extra) => previewUrl('boomerang_ogre', 4, 6, extra);

// 実時間ループ（game.js startGameLoop = setInterval(() => step(1), TICK_MS)）を
// ページ評価の**前に**無効化する（k-4/k-5 spec と同じ仕掛け）。
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

const K6 = [
  [TILE.BOMB_OGRE,      '爆弾鬼',        'bombOgre',      'bombThrow'],
  [TILE.BOOMERANG_OGRE, 'ブーメラン鬼',  'boomerangOgre', 'boomerangThrow'],
];
const threatOf = (m) => (m.hp * m.atk) / (m.def + 1);
const BOMB_M = () => ENEMY_META[TILE.BOMB_OGRE];
const BOOM_M = () => ENEMY_META[TILE.BOOMERANG_OGRE];

test.describe('Phase 5.5k k-6 – 投擲物の種別追加（爆弾鬼・ブーメラン鬼）', () => {

  test('① 2種の定義（記号タイル・非ボス・脅威度と速度の上限・遠隔の間合いの整合）', () => {
    expect(TILE.BOMB_OGRE, 'TILE.BOMB_OGRE が未定義').toBe('λ');
    expect(TILE.BOOMERANG_OGRE, 'TILE.BOOMERANG_OGRE が未定義').toBe('π');

    for (const [tile, name, , atkType] of K6) {
      const m = ENEMY_META[tile];
      expect(m, `ENEMY_META['${tile}'] が無い`).toBeTruthy();
      expect(m.name, `${tile} の名前`).toBe(name);
      expect(m.isBoss, `${name} は通常敵`).toBeFalsy();
      // 通常敵の最強格＝剣獣（脅威度 10）を超えない
      expect(threatOf(m), `${name} の脅威度が剣獣（10）以上＝通常敵の最強格を追い越している`)
        .toBeLessThan(threatOf(ENEMY_META[TILE.SWORD_BEAST]));
      // GUIDE §7-2＝敵はプレイヤー（速度換算 1.0）より必ず遅い
      expect(m.speed, `${name} がプレイヤーと同速以上＝振り切れない`).toBeLessThan(ENEMY_SPEED_FAST);
      expect(m.attack?.type, `${name} の攻撃種別`).toBe(atkType);
      expect(m.attack.cooldown % TICK_MS, `${name} の cooldown が tick の整数倍でない＝観測 tick が揺れる`)
        .toBe(0);
      expect(m.directional, `${name} は向き別スプライトを持つ（投げる方向が絵に出る）`).toBe(true);
      expect(m.guards, `${name} はガードしない（k-4 の機構は持たせない）`).toBeFalsy();

      // GUIDE §7-3＝遠隔敵は「撃てる間合いで止まる」こと。keepMin が minRange 以下だと
      // 敵は**自分から撃てない距離まで詰めて**棒立ちになる（機構が死ぬ罠）。
      expect(m.combat, `${name} に combat（遠隔/近接の二相）が無い`).toBeTruthy();
      expect(m.combat.keepMin, `${name} の keepMin が minRange 以下＝撃てない間合いで止まる`)
        .toBeGreaterThan(m.attack.minRange);
      expect(m.combat.keepMax, `${name} の keepMax が射程より遠い＝射程外で止まる`)
        .toBeLessThanOrEqual(m.attack.range);
      // 遠隔相が cooldown より短いと、**一度も投げないまま**近接相へ切り替わる（機構が死ぬ）。
      expect(m.combat.rangedMs, `${name} の遠隔相が cooldown より短い＝一度も投げずに近接相へ移る`)
        .toBeGreaterThanOrEqual(m.attack.cooldown);
      expect(m.combat.meleeMs, `${name} の近接相の長さが無い`).toBeGreaterThan(0);
    }

    // ① 爆弾鬼＝爆風の数値。プレイヤーの爆弾（ITEM_META.bomb）より**弱い**こと＝
    //    自分の爆弾で学んだ範囲より広くならない（理不尽にならない）。
    const b = BOMB_M().attack;
    expect(b.blast, '爆弾鬼に blast が無い＝爆発しない').toBeTruthy();
    expect(b.blast.radius, '爆風半径が無い').toBeGreaterThan(0);
    expect(b.blast.radius, '爆風がプレイヤーの爆弾より広い＝自分の爆弾から範囲を学べない')
      .toBeLessThanOrEqual(ITEM_META.bomb.aoeRadius);
    expect(b.blast.breakPower, '`!` を壊す力が無い＝壁を壊せない')
      .toBeGreaterThanOrEqual(1);
    expect(b.blast.damage, '爆風のダメージが無い').toBeGreaterThan(0);
    // 密着では投げない（minRange）＝「間合いを詰める」が答えになる設計の芯
    expect(b.minRange, '爆弾鬼に minRange が無い＝密着でも投げてくる').toBeGreaterThan(1.0);
    expect(b.range, '射程が minRange 以下').toBeGreaterThan(b.minRange);

    // ② ブーメラン鬼＝往復の数値。maxRange（折り返し距離）が射程より短いと
    //    「投げても届かない」＝機構が死ぬ。
    const k = BOOM_M().attack;
    expect(k.maxRange, 'ブーメラン鬼に maxRange が無い＝折り返さない').toBeGreaterThan(0);
    expect(k.maxRange, '折り返し距離が射程より短い＝投げても届かない')
      .toBeGreaterThanOrEqual(k.range);
    expect(k.minRange, 'ブーメラン鬼に minRange が無い').toBeGreaterThan(1.0);

    // 機構の取り違え防止（爆弾鬼に maxRange／ブーメラン鬼に blast は無い）
    expect(b.maxRange, '爆弾鬼に maxRange（折り返し）は無い').toBeUndefined();
    expect(k.blast, 'ブーメラン鬼に blast（爆風）は無い').toBeUndefined();
  });

  test('② タイル定義・スプライト・パレット・投擲物スプライトの名前解決', () => {
    for (const [tile, name, pal] of K6) {
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

      // directional＝向き別6枚（{D,R,U} ＋ {D,R,U}Atk）が全部解決すること。
      // 1枚でも欠けるとその向きになった瞬間に絵が消える（k-4 と同じ契約）。
      for (const suffix of ['D', 'R', 'U', 'DAtk', 'RAtk', 'UAtk']) {
        const spr = `${pal}${suffix}`;
        expect(ENEMY_SPRITES[spr], `${spr} が無い（その向きで絵が消える）`).toBeTruthy();
        expect(ENEMY_SPRITES[spr].length, `${spr} のフレームが無い`).toBeGreaterThan(0);
        for (const frame of ENEMY_SPRITES[spr]) {
          const w = frame[0].length;
          for (const row of frame) expect(row.length, `${spr} の行の長さが揃っていない`).toBe(w);
        }
      }
      expect(meta.sprite, `${name} の既定スプライトは down 向き`).toBe(`${pal}D`);
    }

    // 投げる爆弾の絵：createProjEl は makeSprite(proj.type, proj.type) を呼ぶ＝
    // **type 名**（'thrownBomb'）でスプライトとパレットの両方が引けないと弾が描かれない。
    expect(ITEM_SPRITES.thrownBomb, 'thrownBomb スプライトが無い').toBeTruthy();
    expect(ITEM_PAL.thrownBomb, 'thrownBomb パレットが無い').toBeTruthy();
    expect(SPRITES.thrownBomb, 'マージ後の SPRITES に thrownBomb が無い').toBeTruthy();
    expect(PAL.thrownBomb, 'マージ後の PAL に thrownBomb が無い').toBeTruthy();
    expect(PROJECTILE_SPRITE.thrownBomb, 'PROJECTILE_SPRITE に thrownBomb が無い').toBe('thrownBomb');
    // ブーメラン鬼はプレイヤーと同じ 'boomerang' を投げる（既存の絵を共有する）
    expect(PROJECTILE_SPRITE.boomerang, 'PROJECTILE_SPRITE に boomerang が無い').toBe('boomerang');
  });

  test('③ エディタのパレットに2種が並ぶ（置けない敵は死蔵になる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(EDITOR);
    // ⚠ パレットは初期状態でパネルが畳まれていて visible にならない（DOM には在る）∴'attached'。
    await page.waitForSelector('#tile-palette .tile-btn', { state: 'attached' });

    for (const [tile, name] of K6) {
      const btn = page.locator(`#tile-palette .tile-btn[title="${name}"]`);
      await expect(btn, `${name}（'${tile}'）がパレットに無い＝エディタで配置できない`).toHaveCount(1);
      await expect(btn.locator('canvas'), `${name} がスプライトで描かれていない`).toHaveCount(1);
    }
    expect(errors, 'エディタで pageerror').toEqual([]);
  });

  // ライブマップは手編集できる＝検証ステージの幾何は黙って変わる（GUIDE §4-3）。
  // ⚠️ `bomb_ogre` は**遮蔽ゼロではない**＝壁(4,7) と `!`(4,3) が「宣言された例外」。
  //    この2セルは機構（壁を越える／爆風で壊す）のために置いてある∴消えたら赤くする。
  test('④ 検証ステージの幾何が前提どおり（外周＋通路・宣言した遮蔽だけ・敵は (4,9) の left）', () => {
    const HOLES = {
      bomb_ogre:      { '4,7': TILE.WALL, '4,3': TILE.BREAKABLE_WALL },
      boomerang_ogre: {},
    };
    for (const [name, tile] of [['bomb_ogre', TILE.BOMB_OGRE], ['boomerang_ogre', TILE.BOOMERANG_OGRE]]) {
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
      // 敵の4近傍は床（投げる敵でも立ち位置を変えられる余裕を残す）
      for (const [dr, dc, label] of [[1, 0, '南'], [-1, 0, '北'], [0, 1, '東'], [0, -1, '西']]) {
        expect(grid[4 + dr][9 + dc], `${name}: 敵の${label}隣が床でない`).toBe(TILE.FLOOR);
      }
    }

    // ★ 爆弾鬼のアリーナ＝「壁が敵と立ち位置の**間**にある」ことまで測る。
    //   壁が横に逸れていると ⑥ は「開けた床で当たった」だけになる（歯が抜ける）。
    const cover = [4, 7], probe = [4, 4], enemy = [4, 9];
    expect(cover[0], '遮蔽が計測帯（row 4）に無い').toBe(probe[0]);
    expect(cover[1] > Math.min(enemy[1], probe[1]) && cover[1] < Math.max(enemy[1], probe[1]),
      '遮蔽が敵と立ち位置の間に無い＝「壁を越えた」の証明にならない').toBe(true);
    // ★ `!` は着弾セル（probe）から爆風半径の内側
    const bd = Math.hypot(4 - probe[0], 3 - probe[1]);
    expect(bd, '`!` が爆風の外＝「敵の爆弾で `!` が壊れる」の歯が抜ける')
      .toBeLessThanOrEqual(BOMB_M().attack.blast.radius);
  });

  // ── 爆弾鬼 ─────────────────────────────────────────────────────────────
  test('⑤ 初撃は cooldown 明けの tick に飛ぶ（対照＝その1つ前では飛ばない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOMB());

    const fireTick = BOMB_M().attack.cooldown / TICK_MS;   // 2160 / 120 = 18
    const res = await page.evaluate((n) => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const out = { enemy: g.getEnemies(), px: g.getState().player.x, py: g.getState().player.y, rows: [] };
      for (let i = 1; i <= n + 2; i++) {
        g.step(1);
        out.rows.push({ i, n: g.getProjectiles().length, proj: g.getProjectiles()[0] ?? null });
      }
      return out;
    }, fireTick);

    expect(res.enemy.length, '前提：爆弾鬼が1体だけ居る').toBe(1);
    expect(res.enemy[0].type, '前提：置かれた敵が爆弾鬼').toBe(TILE.BOMB_OGRE);
    expect([res.py, res.px], '前提：プレイヤーは壁の向こうの (4,4)').toEqual([4, 4]);
    // 対照＝cooldown 明けの1つ前の tick までは何も飛ばない（すぐ投げる敵ではない）
    const before = res.rows.filter(r => r.i < fireTick);
    expect(before.every(r => r.n === 0), `tick ${fireTick} より前に投げている＝cooldown を無視している`)
      .toBe(true);
    // 本番＝cooldown 明けの tick に1発だけ飛ぶ
    const at = res.rows.find(r => r.i === fireTick);
    expect(at.n, `tick ${fireTick}（cooldown 明け）に投げていない`).toBe(1);
    expect(at.proj.type, '投げたものが thrownBomb でない').toBe('thrownBomb');
    expect(at.proj.lob, '放物線（lob）で飛んでいない＝壁で消える普通の投擲物になっている').toBe(true);
    expect(at.proj.owner, '投擲物の owner が enemy でない').toBe('enemy');
    expect(at.proj.ownerId, '投げた本人の id が入っていない').toBe('4,9');
    // 着弾セル＝投げた瞬間のプレイヤーのセル（追尾しない）
    expect([at.proj.targetY, at.proj.targetX], '着弾セルが投げた瞬間のプレイヤーのセルでない')
      .toEqual([4, 4]);
    expect(errors).toEqual([]);
  });

  test('⑥ 爆弾は壁を越えて着弾しプレイヤーを削る（飛翔中は当たり判定を通らない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOMB());
    // ⚠ プレビューは debugMode:true ＝ takeDamage が早期 return する∴'g' で切る。
    await page.keyboard.press('g');

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const out = { hp0: g.getState().player.hp, def: g.getState().player.def, flight: [] };
      for (let i = 1; i <= 40; i++) {
        g.step(1);
        const p = g.getProjectiles()[0];
        if (p) {
          out.fireTick = out.fireTick ?? i;
          out.flight.push({ i, x: +p.x.toFixed(3), y: +p.y.toFixed(3) });
          // 絵が生えているか（エイリアスが欠けると canvas が無い＝見えない爆弾になる）
          out.hasCanvas = !!document.querySelector(`#proj-${p.id} canvas`);
        } else if (out.fireTick) {
          out.landTick = i;
          out.hp1 = g.getState().player.hp;
          break;
        }
      }
      return out;
    });

    const m = BOMB_M();
    // 前提の遮蔽は盤面から読み直す（④ と同じ主張だが、この本の「壁を越えた」は
    // 壁が在ることに乗っている＝壁が消えたらこの本も赤くする）。
    const bombGrid = MAP.layers[TEST_LAYER].stages[stageKey('bomb_ogre')].tiles[4];
    expect((Array.isArray(bombGrid) ? bombGrid : String(bombGrid).split(''))[7],
      '前提：敵と立ち位置の間の壁(4,7) が盤面から消えている').toBe(TILE.WALL);
    expect(res.def, '前提：防具なし（爆風のダメージがそのまま入る）').toBe(0);
    expect(res.fireTick, '爆弾が投げられていない').toBe(m.attack.cooldown / TICK_MS);
    expect(res.hasCanvas, '投擲物の絵（canvas）が生えていない＝見えない爆弾になっている').toBe(true);
    // ★ 壁(4,7) を跨いでいる＝飛翔中に壁で消えていない（普通の投擲物ならここで消える）
    const crossed = res.flight.some(f => f.x < 7) && res.flight.some(f => f.x > 7);
    expect(crossed, '爆弾が壁(4,7) を越えていない＝lob の経路を通っていない').toBe(true);
    // 飛翔は 4.2 セル（発射点 x=9-0.8 → 着弾 x=4）を 1tick 0.5 セル＝9 歩。
    // 1歩目は**投げた tick に同居する**（発射も進行も同じ step の中）∴着弾は fireTick+8。
    const steps = Math.ceil((9 - 0.8 - 4) / (m.attack.projectileSpeed * MOVE_STEP));
    expect(res.landTick, '着弾 tick が飛翔距離と合わない（速度と補間の関係が変わった？）')
      .toBe(res.fireTick + steps - 1);
    // ★ 着弾＝プレイヤーが削られる（盾も遮蔽も関係ない）
    expect(res.hp0 - res.hp1, '爆風のダメージが blast.damage と違う').toBe(m.attack.blast.damage);
    expect(errors).toEqual([]);
  });

  test('⑦ 爆風は `!`（壊せる壁）を壊す（プレイヤーの爆弾と同じ爆発を共有）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOMB());

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const out = { broken0: g.getStageState().brokenWalls };
      for (let i = 1; i <= 40; i++) {
        g.step(1);
        if (g.getStageState().brokenWalls.length) { out.brokeAt = i; break; }
      }
      out.broken1 = g.getStageState().brokenWalls;
      // 壊れた後は投擲物が通れる床になっている（renderBoard が走ったか）
      out.cellCleared = !document.querySelector('#board .cell[data-r="4"][data-c="3"][data-tile="!"]');
      return out;
    });

    expect(res.broken0, '前提：まだ何も壊れていない').toEqual([]);
    expect(res.broken1, '敵の爆弾で `!`(4,3) が壊れていない＝爆発がプレイヤーの爆弾と別物になっている')
      .toEqual(['4,3']);
    expect(errors).toEqual([]);
  });

  test('⑧ 着弾点は投げた瞬間のセルで固定＝走れば避けられる（追尾しない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOMB());
    await page.keyboard.press('g');

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const out = { hp0: g.getState().player.hp };
      for (let i = 1; i <= 40; i++) {
        g.step(1);
        const p = g.getProjectiles()[0];
        if (p && !out.fireTick) {
          out.fireTick = i;
          out.target = [p.targetY, p.targetX];
          for (let k = 0; k < 6; k++) g.movePlayer('up');   // 爆風半径の外へ走る
          out.moved = [g.getState().player.y, g.getState().player.x];
          continue;
        }
        if (out.fireTick && !p) {
          out.landTick = i;
          out.hp1 = g.getState().player.hp;
          out.broken = g.getStageState().brokenWalls;
          break;
        }
      }
      return out;
    });

    const radius = BOMB_M().attack.blast.radius;
    expect(res.fireTick, '爆弾が投げられていない').toBeTruthy();
    expect(res.target, '着弾セルが投げた瞬間のプレイヤーのセルでない').toEqual([4, 4]);
    // 逃げた先が本当に爆風の外であること（ここが半端だと「避けたのに当たらない」が偶然になる）
    expect(Math.hypot(res.moved[0] - res.target[0], res.moved[1] - res.target[1]),
      '逃げた先が爆風の内側＝この本は「避けられた」ことを測れていない').toBeGreaterThan(radius);
    expect(res.hp1, '走って逃げたのに削られた＝着弾点がプレイヤーを追尾している').toBe(res.hp0);
    // ★ 「当たらなかった」が「そもそも落ちなかった（壁で消えた等）」の言い換えに
    //   ならないよう、爆発そのものは起きたことを `!` の破壊で押さえる。
    expect(res.broken, '爆弾が着弾していない＝この本は「避けられた」ことを測れていない')
      .toEqual(['4,3']);
    expect(errors).toEqual([]);
  });

  test('⑨ 盾を正面に構えても爆発は防げない（対照＝同じ向きの矢は防げる）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOMB({ ps_shield: '1' }));
    await page.keyboard.press('g');

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      g.setHeroDir('right');                       // 敵（東）へ正面を向ける＝盾が効く向き
      const out = { shield: g.getPlayer().shield, dir: g.getState().heroDir, hp0: g.getState().player.hp };
      // 対照：東から飛んで来る普通の投擲物（矢）は正面の盾で防げる
      g.injectEnemyProjectile(6, 4, -1, 0, 2, 2);
      for (let i = 0; i < 6; i++) g.step(1);
      out.hpAfterArrow = g.getState().player.hp;
      out.projsAfterArrow = g.getProjectiles().length;
      // 本番：同じ向きに構えたまま爆弾鬼の爆弾を受ける
      for (let i = 1; i <= 40; i++) {
        g.step(1);
        if (g.getState().player.hp < out.hpAfterArrow) { out.hitAt = i; break; }
      }
      out.hpAfterBomb = g.getState().player.hp;
      return out;
    });

    expect(res.shield, '前提：盾を持っている').toBeTruthy();
    expect(res.dir, '前提：飛んで来る方向へ正面を向けている').toBe('right');
    // 対照が効いていること＝盾そのものは働いている（ここが崩れると本番の主張が空になる）
    expect(res.hpAfterArrow, '対照：正面の盾で矢を防げていない＝盾が働いていない（本番の主張が空になる）')
      .toBe(res.hp0);
    expect(res.projsAfterArrow, '対照：防いだ矢が消えていない').toBe(0);
    // 本番＝爆発は「点の投擲物」ではない∴盾では防げない（離れるしかない）
    expect(res.hitAt, '盾を構えたら爆弾を防げてしまった＝この敵から離れる理由が無くなる').toBeTruthy();
    expect(res.hpAfterArrow - res.hpAfterBomb, '爆風のダメージが blast.damage と違う')
      .toBe(BOMB_M().attack.blast.damage);
    expect(errors).toEqual([]);
  });

  test('⑩ 敵の爆弾は他の敵を巻き込まない（味方撃ちしない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOMB());

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      g.injectEnemy(5, 4, 10);                     // 着弾セル (4,4) の東隣＝爆風半径 1.5 の内側
      const out = { before: g.getEnemies().map(e => ({ id: e.id, hp: e.hp, x: e.x, y: e.y })) };
      for (let i = 1; i <= 40; i++) {
        g.step(1);
        if (g.getStageState().brokenWalls.length) { out.brokeAt = i; break; }
      }
      out.after = g.getEnemies().map(e => ({ id: e.id, hp: e.hp, x: e.x, y: e.y }));
      out.broken = g.getStageState().brokenWalls;
      return out;
    });

    const victim = res.before.find(e => e.x === 5 && e.y === 4);
    expect(victim, '前提：着弾セルの隣に敵を注入できている').toBeTruthy();
    // ★ 爆発そのものは起きている（`!` が壊れている）＝「巻き込まなかった」が
    //   「爆発しなかった」の言い換えになっていないことの担保。
    expect(res.broken, '前提：爆発が起きている（`!` が壊れている）').toEqual(['4,3']);
    const after = res.after.find(e => e.id === victim.id);
    expect(after, '注入した敵が消えている＝爆風で倒された（味方撃ちしている）').toBeTruthy();
    expect(after.hp, '注入した敵の hp が減っている＝味方撃ちしている').toBe(victim.hp);
    expect(errors).toEqual([]);
  });

  test('⑪ 密着（minRange の内側）では投げない／離れれば投げる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOMB());

    const res = await page.evaluate((minRange) => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const p = g.getPlayer();
      const out = { pinned: [], released: [] };
      // ★ 毎tick 敵の西隣へ置き直す＝敵が退がっても密着が続く（放っておくと敵が
      //   自分から間合いを開けて条件が外れる＝ゲートを壊しても緑になる）。
      for (let i = 1; i <= 30; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x - 1; p.y = e.y;
        // ⚠ 距離は step の**前**に記録する＝敵の判断がその tick に見た距離そのもの
        //   （step 後は敵が退がっていて「密着していた」証拠にならない）。
        const d = +Math.hypot(e.x - p.x, e.y - p.y).toFixed(2);
        g.step(1);
        out.pinned.push({ i, d, n: g.getProjectiles().length });
      }
      // 解放＝間合いを開けた次の tick に投げてくる（cooldown はもう明けている）
      p.x = 4; p.y = 4;
      for (let i = 1; i <= 12; i++) {
        g.step(1);
        out.released.push({ i, n: g.getProjectiles().length });
        if (g.getProjectiles().length) break;
      }
      out.minRange = minRange;
      return out;
    }, BOMB_M().attack.minRange);

    const cooldownTicks = BOMB_M().attack.cooldown / TICK_MS;
    expect(res.pinned.length, `前提：cooldown（${cooldownTicks} tick）より長く密着させている`)
      .toBeGreaterThan(cooldownTicks);
    expect(res.pinned.every(r => r.d < res.minRange),
      '前提：密着を維持できていない（毎tickの置き直しが効いていない）').toBe(true);
    expect(res.pinned.filter(r => r.n > 0), '密着している間に投げた＝minRange のゲートが効いていない')
      .toEqual([]);
    // ★ 「投げない」だけでは「壊れて投げられない」と区別できない∴離れたら投げることまで測る
    expect(res.released.at(-1).n, '間合いを開けても投げてこない＝機構が死んでいる').toBe(1);
    expect(res.released.length, '間合いを開けてから投げるまでが遅い（cooldown は明けている）')
      .toBeLessThanOrEqual(2);
    expect(errors).toEqual([]);
  });

  // ── ブーメラン鬼 ────────────────────────────────────────────────────────
  test('⑫ 縦横が揃ったときだけ投げる（対照＝行も列も外していると投げない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOOM());

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const p = g.getPlayer();
      const out = { enemy: g.getEnemies(), misaligned: [], aligned: [] };
      // 対照：毎tick「敵の斜め」へ置き直す（|dy|=1.0・|dx|=3）＝行も列も揃わない。
      // 敵は遠隔相で行を揃えに来る∴置き直さないと勝手に揃って投げてくる。
      for (let i = 1; i <= 30; i++) {
        const e = g.getEnemies()[0];
        p.x = e.x - 3; p.y = e.y + 1;
        // ⚠ ずれと距離は step の**前**＝敵がその tick に見た値（step 後は揺れる）
        const dy = +(p.y - e.y).toFixed(2);
        const d = +Math.hypot(e.x - p.x, e.y - p.y).toFixed(2);
        g.step(1);
        out.misaligned.push({ i, dy, d, n: g.getProjectiles().length });
      }
      // 本番：行を揃える → 次の tick に投げてくる
      const e = g.getEnemies()[0];
      p.x = e.x - 3; p.y = e.y;
      for (let i = 1; i <= 12; i++) {
        g.step(1);
        out.aligned.push({ i, n: g.getProjectiles().length });
        if (g.getProjectiles().length) break;
      }
      out.proj = g.getProjectiles()[0] ?? null;
      return out;
    });

    const m = BOOM_M();
    expect(res.enemy[0].type, '前提：置かれた敵がブーメラン鬼').toBe(TILE.BOOMERANG_OGRE);
    expect(res.misaligned.every(r => Math.abs(r.dy) >= 1.0),
      '前提：行を外し続けられていない（毎tickの置き直しが効いていない）').toBe(true);
    expect(res.misaligned.every(r => r.d <= m.attack.range),
      '前提：射程の外に居る＝「揃っていないから投げない」を測れていない').toBe(true);
    expect(res.misaligned.filter(r => r.n > 0), '行も列も揃っていないのに投げた＝縦横ゲートが効いていない')
      .toEqual([]);
    expect(res.aligned.at(-1).n, '行を揃えても投げてこない＝機構が死んでいる').toBe(1);
    expect(res.aligned.length, '揃えてから投げるまでが遅い（cooldown は明けている）').toBeLessThanOrEqual(2);
    expect(res.proj.type, '投げたものが boomerang でない').toBe('boomerang');
    expect(res.proj.returnsToOwner, '往復（returnsToOwner）のフラグが立っていない＝帰ってこない').toBe(true);
    expect(res.proj.ownerId, '投げた本人の id が入っていない＝帰る先が分からない').toBe('4,9');
    expect(errors).toEqual([]);
  });

  test('⑬ 往路で当たる／maxRange で折り返して投げた敵へ帰る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOOM());
    await page.keyboard.press('g');

    // (a) 行に立ったまま＝往路で当たる
    const hitRes = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const out = { hp0: g.getState().player.hp };
      for (let i = 1; i <= 40; i++) {
        g.step(1);
        if (g.getProjectiles().length && !out.fireTick) out.fireTick = i;
        if (g.getState().player.hp < out.hp0) {
          out.hitTick = i; out.hp1 = g.getState().player.hp; out.left = g.getProjectiles().length; break;
        }
      }
      return out;
    });
    const m = BOOM_M();
    expect(hitRes.fireTick, '投げていない').toBe(m.attack.cooldown / TICK_MS);
    expect(hitRes.hitTick, '往路で当たらない').toBeTruthy();
    expect(hitRes.hp0 - hitRes.hp1, '往路のダメージが敵の atk と違う').toBe(m.atk);
    expect(hitRes.left, '当たったブーメランが消えていない').toBe(0);

    // (b) 避けた場合＝maxRange で折り返して投げた敵の位置へ帰る
    await gotoFrozen(page, BOOM());
    await page.keyboard.press('g');
    const backRes = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const out = { path: [] };
      let fired = false;
      for (let i = 1; i <= 60; i++) {
        g.step(1);
        const p = g.getProjectiles()[0];
        if (p && !fired) {
          fired = true;
          out.start = [p.startY, p.startX];
          // ⚠ 2セル南へ退く。1セルだと**帰りの軌道に残る**＝帰りに当たって途中で消える
          //   （それは ⑭ の二度読みの筋＝ここでは「敵の手元まで帰る」ことを測りたい）。
          for (let k = 0; k < 4; k++) g.movePlayer('down');
          out.dodged = [g.getState().player.y, g.getState().player.x];
          continue;
        }
        if (fired) {
          if (p) {
            out.path.push({ i, x: +p.x.toFixed(2), returning: !!p.returning });
            if (p.returning && !out.turnAt) { out.turnAt = i; out.turnX = +p.x.toFixed(2); }
          } else { out.goneAt = i; out.enemy = g.getEnemies()[0]; break; }
        }
      }
      out.hp = g.getState().player.hp;
      return out;
    });

    const stepPerTick = m.attack.projectileSpeed * MOVE_STEP;
    expect(backRes.dodged, '前提：往路の行から2セル退いている').toEqual([6, 6]);
    expect(backRes.turnAt, 'maxRange まで飛んでも折り返さない（帰ってこない）').toBeTruthy();
    const flown = Math.abs(backRes.start[1] - backRes.turnX);
    expect(flown, `折り返しが maxRange（${m.attack.maxRange}）より手前`)
      .toBeGreaterThanOrEqual(m.attack.maxRange);
    // 折り返しの判定は **tick 冒頭の飛距離**で行う（既存のプレイヤーのブーメランと同じ作法）
    // ∴1tick 分（+ 判定の遅れ1tick）だけ超えてから折り返す。この上限を外すと
    // 「壁で折り返した」のを maxRange と見間違える。
    expect(flown, '折り返しが maxRange から離れすぎ（壁で折り返している？）')
      .toBeLessThanOrEqual(m.attack.maxRange + stepPerTick * 2);
    // 帰りは東（投げた敵の方向）へ戻り、敵の手元で消える
    const returning = backRes.path.filter(r => r.returning);
    expect(returning.length, '折り返した後の軌跡が無い').toBeGreaterThan(1);
    expect(returning.at(-1).x, '帰りが折り返し点より東へ進んでいない＝敵へ帰っていない')
      .toBeGreaterThan(returning[0].x);
    expect(backRes.goneAt, 'ブーメランが消えない（永久に飛び続けている）').toBeTruthy();
    // ⚠ 手元へ届いた tick に消える＝**最後に観測できる座標は最大2歩分手前**になる
    //   （観測は step 後・消えた tick には座標が無い）∴この幅で「敵の手元」を測る。
    expect(Math.abs(returning.at(-1).x - backRes.enemy.x),
      '消えた場所が投げた敵の手元でない（西の壁まで飛んで消えている？）')
      .toBeLessThanOrEqual(stepPerTick * 2 + 0.5);
    expect(backRes.hp, '避けたのに往路で当たっている').toBe(hitRes.hp0);
    expect(errors).toEqual([]);
  });

  test('⑭ 往路を避けて行へ戻ると帰りに当たる（二度読み）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOOM());
    await page.keyboard.press('g');

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const out = { hp0: g.getState().player.hp };
      let fired = false, back = false;
      for (let i = 1; i <= 80; i++) {
        g.step(1);
        const p = g.getProjectiles()[0];
        if (p && !fired) {
          fired = true;
          g.movePlayer('down'); g.movePlayer('down');     // 往路を避ける
          continue;
        }
        if (fired && !back) {
          if (p?.returning) {
            back = true;
            out.turnAt = i;
            out.hpAfterDodge = g.getState().player.hp;
            g.movePlayer('up'); g.movePlayer('up');       // 行へ戻る＝帰りの軌道に立つ
            out.backAt = [g.getState().player.y, g.getState().player.x];
            continue;
          }
          if (!p) { out.lostAt = i; break; }
        }
        if (back && g.getState().player.hp < out.hpAfterDodge) {
          out.hitAt = i; out.hp1 = g.getState().player.hp; break;
        }
      }
      return out;
    });

    expect(res.lostAt, '往路の途中でブーメランが消えた（避けたのに当たっている？）').toBeUndefined();
    expect(res.hpAfterDodge, '行から外れたのに往路で当たっている').toBe(res.hp0);
    expect(res.backAt, '行へ戻れていない').toEqual([4, 6]);
    expect(res.hitAt, '帰りに当たらない＝「避けても帰りに当たる」二度読みが成立していない').toBeTruthy();
    expect(res.hp0 - res.hp1, '帰りのダメージが敵の atk と違う').toBe(BOOM_M().atk);
    expect(errors).toEqual([]);
  });

  test('⑮ 投げた敵が死んだブーメランは発射点へ帰って消える（永久に飛ばない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOOM());
    await page.keyboard.press('g');

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      const out = { path: [] };
      let fired = false;
      for (let i = 1; i <= 80; i++) {
        g.step(1);
        const p = g.getProjectiles()[0];
        if (p && !fired) {
          fired = true;
          out.start = [p.startY, p.startX];
          g.movePlayer('down'); g.movePlayer('down');       // 当たらない位置へ退く
          g.dealDamage('4,9', 99, 'sword', 6, 4);          // 投げ手を倒す
          out.enemiesAfterKill = g.getEnemies().length;
          continue;
        }
        if (fired) {
          if (p) out.path.push({ i, x: +p.x.toFixed(2), returning: !!p.returning });
          else { out.goneAt = i; break; }
        }
      }
      out.hp = g.getState().player.hp;
      return out;
    });

    expect(res.enemiesAfterKill, '前提：投げ手を倒せている').toBe(0);
    expect(res.goneAt, '投げ手が死んだブーメランが消えない＝永久に飛び続ける').toBeTruthy();
    expect(res.path.some(r => r.returning), '折り返していない').toBe(true);
    // ★ 帰る先は「発射点」＝投げ手が消えても座標を失わない（startX/startY を全ての
    //   投擲物に入れている理由）。最後の座標が発射点の近くであること。
    const last = res.path.at(-1);
    const stepPerTick = BOOM_M().attack.projectileSpeed * MOVE_STEP;
    expect(Math.abs(last.x - res.start[1]), '消えた場所が発射点から遠い＝発射点へ帰っていない')
      .toBeLessThanOrEqual(stepPerTick * 2 + 0.5);
    expect(errors).toEqual([]);
  });

  test('⑯ 敵のブーメランは床のアイテムを拾わない（ギミックが敵の手で解けない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoFrozen(page, BOOM());

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      g.spawnFloorDrop(4, 5, 'rupee');                  // ブーメランの通り道（行 4）
      const out = { drops0: g.getFloorDrops(), rupees0: g.getState().player.rupees };
      let fired = false;
      for (let i = 1; i <= 80; i++) {
        g.step(1);
        const p = g.getProjectiles()[0];
        if (p && !fired) {
          fired = true;
          g.movePlayer('down'); g.movePlayer('down');    // プレイヤー自身が拾わない位置へ
          continue;
        }
        if (fired) {
          if (p) out.last = { i, x: +p.x.toFixed(2), carried: p.carriedCount, returning: !!p.returning };
          else { out.goneAt = i; break; }
        }
      }
      out.drops1 = g.getFloorDrops();
      out.rupees1 = g.getState().player.rupees;
      return out;
    });

    expect(res.drops0, '前提：通り道にドロップを置けている').toEqual([{ r: 4, c: 5, type: 'rupee' }]);
    expect(res.goneAt, '前提：ブーメランが往復し終わっている（通り道を2回通った）').toBeTruthy();
    expect(res.last.carried, '敵のブーメランがアイテムを運搬している').toBe(0);
    expect(res.drops1, '敵のブーメランが床のアイテムを持ち去った＝ギミックが敵の手で解ける')
      .toEqual(res.drops0);
    expect(res.rupees1, '敵のブーメランがルピーをプレイヤーへ渡した').toBe(res.rupees0);
    expect(errors).toEqual([]);
  });

  test('⑰ 打ち返されたプレイヤーのブーメランは往復しない（k-6 前の挙動を変えない）', async ({ page }) => {
    // 回帰の番人：往復の分岐を `owner !== 'player'` へ広げると、氷のリヴァイアサンに
    // 打ち返されたブーメランが**敵へ帰る**ようになる（打ち返しの意味が変わる）∴
    // 明示のフラグ（returnsToOwner）で分けていることをここで固定する。
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const p = new URLSearchParams({
      fromEditor: '1', layer: TEST_LAYER, stage: stageKey('melee_only_boss'),
      row: '7', col: '5', ps_weapon: '1', ps_boomerang: '1',
    });
    await gotoFrozen(page, `${GAME}?${p.toString()}`);
    await page.keyboard.press('g');

    const res = await page.evaluate(() => {
      const g = window.__game;
      g.pause();
      if (g.getState().gameTime !== 0) throw new Error('実ループの tick が漏れている');
      g.setHeroDir('up');
      g.step(1);
      g.useSubItem();                                    // 北のボスへ投げる
      const t = g.getProjectiles()[0];
      const out = { thrown: t ? { owner: t.owner, type: t.type, dy: t.dy } : null, path: [] };
      let reflected = false;
      for (let i = 1; i <= 40; i++) {
        g.step(1);
        const q = g.getProjectiles()[0];
        if (q && q.owner === 'enemy' && !reflected) {
          reflected = true;
          out.reflected = { i, y: +q.y.toFixed(2), dy: q.dy, ownerId: q.ownerId, returnsToOwner: q.returnsToOwner };
          g.movePlayer('left'); g.movePlayer('left');     // 列から外れて素通りさせる
        }
        if (reflected) {
          if (q) out.path.push({ i, y: +q.y.toFixed(2), returning: !!q.returning });
          else { out.goneAt = i; break; }
        }
      }
      return out;
    });

    expect(res.thrown, 'ブーメランを投げられていない').toMatchObject({ owner: 'player', type: 'boomerang' });
    expect(res.reflected, 'ボスが打ち返していない（前提の reflectsProjectiles が働いていない）').toBeTruthy();
    expect(res.reflected.returnsToOwner, '打ち返されたブーメランに往復フラグが付いた＝挙動が変わる')
      .toBeFalsy();
    expect(res.reflected.dy, '打ち返しの向きが南（プレイヤー側）でない').toBeGreaterThan(0);
    // ★ まっすぐ南へ飛び、壁で消える（往復の経路に乗ると壁で折り返して敵へ帰る＝消えない）
    expect(res.path.every(r => !r.returning), '打ち返されたブーメランが折り返した＝往復の経路に乗っている')
      .toBe(true);
    const ys = res.path.map(r => r.y);
    expect(ys.every((y, i) => i === 0 || y > ys[i - 1]), '打ち返されたブーメランが南へ進み続けていない')
      .toBe(true);
    expect(res.goneAt, '打ち返されたブーメランが消えない（壁で折り返して飛び続けている）').toBeTruthy();
    expect(errors).toEqual([]);
  });

  test('⑱ 2種は本編レイヤーに配置済み・かつ配置表の部屋にだけ居る', () => {
    // 2026-08-19（5.5m）に配置した∴「未配置」ではなく「居る・想定外の部屋に湧いていない」
    // を守る（k-3 ⑬・k-4 ⑭・k-5 ⑯ と同じ形）。爆弾鬼の爆風は壊せる壁 '!' を壊す∴
    // 配置先に '!' が無いことも含めた配置の意図は tests/enemy-placement.spec.js が持つ。
    const placed = placedCells(MAP, K6.map(([t]) => t));
    for (const [tile] of K6) {
      const name = ENEMY_META[tile].name;
      expect(placed[tile].length, `${name}（'${tile}'）が本編レイヤーに1体も居ない`).toBeGreaterThan(0);
      for (const loc of placed[tile]) {
        expect(PLACEMENT_STAGES.has(stageIdOf(loc)),
          `${name} が配置表に無い ${loc} に居る（表＝scripts/lib/enemy-placement.mjs）`).toBe(true);
      }
    }
  });
});
