// tests/arrival-landing.spec.js — Phase 9-6 ⑥-landing（2026-07-29）
//
// ユーザー指摘（原文）：「相変わらず、上から1.5セルの位置にいますね。これでいいんですか？
// これだと row=1 のところに侵入できない壁があったらおかしなことになりませんか？」
//
// 辺遷移の着地は「境界セルそのもの」の整数座標になった（旧：境界から半セル内側 0.5 /
// rows-1.5）。半セル着地はプレイヤーの当たり箱（1セル幅）を2行/2列に跨らせるので、
// 正反対の2つのバグが同時に起きていた：
//   (a) 境界の1つ内側に石/看板/スイッチがあると遷移が無言でキャンセル（見えない壁 68件）
//   (b) 境界セルが閉じた門でも当たり箱が内側の床に半分乗るので門をすり抜けて入れる
// 整数着地なら footprint は1セル＝(a) は構造的に消える。ただし (b) の裏返しで
// 「閉じた門セルの上に降りて詰む」が出るので、着地判定を「タイル種別」から
// 「着地先ステージの ss を見た今の開閉状態」へ直すのが対になる（両方で1セット）。
//
// ⚠️ 状態判定を通行判定（tilePassable）と着地判定（arrivalIsWall）の2箇所に書くと
// 片方だけ状態を見ないズレが再発する＝根因そのもの。∴ 判定は passable.js の
// statefulTileClosed() ただ1つ。このスペックはその単一点と、実エンジンでの
// 「閉じた門へは入れない／開ければ入れる」を固定する。
//
// ①〜③ ユニット：statefulTileClosed の開閉判定・tilePassable との一致・D/: の免除
// ④〜⑦ 実エンジン：閉じた 'T' 境界へは遷移しない／スイッチで開けたら遷移する／
//        着地が整数セルになっている／押し戻し後に連打しても遷移が再トリガーしない

import { test, expect } from '@playwright/test';
import { TILE } from '../shared/tiles.js';
import {
  createPassable, STATEFUL_TILES, statefulTileClosed,
} from '../game/passable.js';
import { waitForBoard } from './helpers.js';

const GAME = '/blade-of-lumia/game/';

// dungeon_7 の縦3連（1,0 → 1,1 → 1,2）。1,1 の上端 col5/col6 が 'T'（閉じた門）で、
// links で同ステージ内の Y スイッチ (1,1) に配線されている＝「閉じた門の境界」の実データ。
// 1,0 の下端 row9 col5/col6 は床なので、そこから南へ歩くと 1,1 の (0,5)='T' に着地する。
// ⚠️ 2026-09-25（実行キュー 30）に 1,1 を作り替えた＝Y は (3,9) から (1,1) へ移り、
//    池の向こう＝**矢でしか叩けない**（剣では届かない）。門の手前 (1,5)(1,6) は爆弾で
//    壊す '!' ∴この境界を「開けて通る」には弓と爆弾の両方が要る（⑥ がそれを歩く）。
//    `1,2` の上端にあった門は同じ作業で撤去した＝迂回できる飾りだった（実測で確認）。
const D7 = {
  layer: 'dungeon_7', from: '1,0', to: '1,1', gate: '0,5',
  toggle: '1,1', walls: ['1,5', '1,6'], shootFrom: { row: 1, col: 4 },
};

function previewUrl({ layer, stage, row, col, extra = {} }) {
  const p = new URLSearchParams({
    fromEditor: '1', layer, stage, row: String(row), col: String(col), ps_weapon: '1',
    ...extra,
  });
  return `${GAME}?${p.toString()}`;
}

const stageOf = (page) => page.evaluate(() => window.__game.getState().stageKey);
const posOf   = (page) => page.evaluate(() => {
  const { x, y } = window.__game.getState().player;
  return { x, y };
});
// ⚠️ checkStageTransition は enterStage を setTimeout(…, 100) で呼ぶ（isTransitioning が
// 立っている間の入力は無視される）。step(1) だけでは遷移が完了しないので、1操作ごとに
// 実時間を少し待つ。待たないと「遷移しなかった」ように見える偽の赤になる。
// ⚠️ その実時間待ちの間、`startGameLoop()` の setInterval(step, 120) が裏で走っていると
// 手動 step と並走して余分に前進する（着地直後を測れず y=8.5 のような値が出る）。
// ∴ 実エンジン系は必ず先に pause() する（遷移の setTimeout はループとは独立なので影響しない）。
async function boot(page, url) {
  await page.goto(url);
  await waitForBoard(page);
  await page.evaluate(() => window.__game.pause());
}
async function walk(page, dir, n) {
  for (let i = 0; i < n; i++) {
    await page.evaluate((d) => window.__game.movePlayer(d), dir);
    await page.evaluate(() => window.__game.step(1));
    await page.waitForTimeout(150);
  }
}
// 着地座標を測るときは「遷移した瞬間」で止める必要がある（1操作 = 0.5セルなので、
// 1歩でも余分に歩くと整数着地が 8.5 のような値に見えて判定できない）。
async function walkUntilStage(page, dir, target, max) {
  for (let i = 0; i < max; i++) {
    await walk(page, dir, 1);
    if (await stageOf(page) === target) return true;
  }
  return false;
}

test.describe('⑥-landing ① 状態つきタイルの開閉判定は単一点（statefulTileClosed）', () => {
  // 「今の状態」で開閉が変わるタイルの全リスト。ここに載っていないタイルは種別だけで
  // 通行可否が決まる＝着地判定は ARRIVAL_WALL_TILES 側で処理する。
  test('STATEFUL_TILES は開閉しうるタイルだけを持つ（D/: は含まない）', () => {
    expect([...STATEFUL_TILES].sort()).toEqual(
      [TILE.GATE, TILE.TIDE_GATE, TILE.GATE_RED, TILE.GATE_BLUE,
       TILE.BREAKABLE_WALL, TILE.DOORWAY_LOCKED, TILE.BUSH, TILE.STONE].sort(),
    );
    // 'D'（鍵扉）と ':'（ボス扉）は意図的に対象外。'D' の通行判定は debugMode 免除を
    // 持つのでこの Set には入れず、着地判定（game.js arrivalTileBlocked）が openedDoors を
    // 直接見て「閉じた鍵扉には着地しない」を担保する（2026-08-06 修正・下の ④ で固定）。
    // ':' を着地でブロックするとボス戦から逃げた後の再入場が塞がる。
    expect(STATEFUL_TILES.has(TILE.DOOR), 'D は着地判定の対象外').toBe(false);
    expect(STATEFUL_TILES.has(TILE.DOORWAY_BOSS), ': は着地判定の対象外').toBe(false);
  });

  // 各タイルの「閉」「開」を1つずつ。開の条件（何を立てれば開くか）もここに固定する
  // ＝ss のキー名を間違えると「常に閉」または「常に開」になって静かに壊れる。
  // perCell: その開閉状態がセル単位か（true）ステージ単位か（false）。色ゲートの
  // activeColor はステージ全体の色なので、posKey では区別されない（仕様）。
  const CASES = [
    { tile: TILE.GATE,           name: "'T' 門（スイッチ）",        perCell: true,  open: () => ({ openGates: new Set(['2,3']) }) },
    { tile: TILE.TIDE_GATE,      name: "'=' 潮ゲート（openGates）", perCell: true,  open: () => ({ openGates: new Set(['2,3']) }) },
    { tile: TILE.GATE_RED,       name: "'(' 赤ゲート",              perCell: false, open: () => ({ activeColor: 'red' }) },
    { tile: TILE.GATE_BLUE,      name: "')' 青ゲート",              perCell: false, open: () => ({ activeColor: 'blue' }) },
    { tile: TILE.BREAKABLE_WALL, name: "'!' 破壊壁（爆弾）",        perCell: true,  open: () => ({ brokenWalls: new Set(['2,3']) }) },
    { tile: TILE.DOORWAY_LOCKED, name: "'|' 施錠ドアウェイ",        perCell: true,  open: () => ({ doorwayStates: { '2,3': 'open' } }) },
    { tile: TILE.BUSH,           name: "'u' 茂み（剣で刈る）",      perCell: true,  open: () => ({ cutBushes: new Set(['2,3']) }) },
    { tile: TILE.STONE,          name: "'*' 石（押して動かす）",    perCell: true,  open: () => ({ stonePositions: { '2,3': { r: 4, c: 3 } } }) },
  ];

  for (const { tile, name, perCell, open } of CASES) {
    test(`${name}: 閉→通行不可 / 開→通行可（判定は ss を見る）`, () => {
      expect(statefulTileClosed(tile, '2,3', {}), `${name} は既定で閉`).toBe(true);
      expect(statefulTileClosed(tile, '2,3', open()), `${name} を開いても閉のまま`).toBe(false);
      if (perCell) {
        // セル単位の状態は posKey で引く＝別セルの状態で開いたことにならない。
        expect(statefulTileClosed(tile, '9,9', open()), `${name} が別セルの状態で開いた`).toBe(true);
      } else {
        // 色ゲートはステージ全体の activeColor で開く（セル単位ではない）。
        expect(statefulTileClosed(tile, '9,9', open()), `${name} はステージ単位で開く`).toBe(false);
      }
    });
  }

  test('赤/青ゲートは activeColor が自色のときだけ開く（もう片方では閉）', () => {
    expect(statefulTileClosed(TILE.GATE_RED,  '2,3', { activeColor: 'blue' })).toBe(true);
    expect(statefulTileClosed(TILE.GATE_BLUE, '2,3', { activeColor: 'red'  })).toBe(true);
  });

  test('ss が undefined でも落ちずに「閉」を返す（未訪問ステージの着地判定）', () => {
    for (const { tile } of CASES) {
      expect(statefulTileClosed(tile, '2,3', undefined)).toBe(true);
    }
  });

  test('状態を持たないタイルは常に「閉じていない」（判定を横取りしない）', () => {
    for (const t of [TILE.WALL, TILE.WATER, TILE.DOOR, TILE.DOORWAY_BOSS, ' ', '.']) {
      expect(statefulTileClosed(t, '2,3', {}), `${t} が STATEFUL 扱いされている`).toBe(false);
    }
  });
});

test.describe('⑥-landing ② tilePassable が同じ単一点を使う（2箇所に書かない）', () => {
  // tilePassable を statefulTileClosed 経由にリファクタしたので、既存の通行判定が
  // 一切変わっていないことを全タイル分まとめて確認する（等価性の証明）。
  function makePassable(tiles, ss) {
    const stageData = { rows: tiles.length, cols: tiles[0].length, tiles };
    return createPassable({
      getStageData: () => stageData,
      getEnemies: () => [],
      getPlayer: () => ({ x: 0, y: 0 }),
      getCurrentLayer: () => 'field',
      getStageKey: () => '0,0',
      getDebugMode: () => false,
      getSS: () => ss,
      toTileRow: (y) => Math.floor(y),
      toTileCol: (x) => Math.floor(x),
    });
  }

  for (const tile of [TILE.GATE, TILE.TIDE_GATE, TILE.GATE_RED, TILE.GATE_BLUE,
                      TILE.BREAKABLE_WALL, TILE.DOORWAY_LOCKED, TILE.BUSH, TILE.STONE]) {
    test(`tilePassable('${tile}') は statefulTileClosed の否定と一致する`, () => {
      const tiles = [['.', '.', '.'], ['.', tile, '.'], ['.', '.', '.']];
      const openStates = [
        {}, { openGates: new Set(['1,1']) }, { activeColor: 'red' }, { activeColor: 'blue' },
        { brokenWalls: new Set(['1,1']) }, { doorwayStates: { '1,1': 'open' } },
        { cutBushes: new Set(['1,1']) }, { stonePositions: { '1,1': { r: 2, c: 1 } } },
      ];
      for (const partial of openStates) {
        // tilePassable が触る既定キーを埋めた ss（本番の getSS と同じ形）。
        const ss = { openGates: new Set(), stonePositions: {}, conditionsMet: new Set(), ...partial };
        const p = makePassable(tiles, ss);
        expect(
          p.tilePassable(1, 1),
          `ss=${JSON.stringify(Object.keys(partial))} で通行判定と状態判定がズレた`,
        ).toBe(!statefulTileClosed(tile, '1,1', ss));
      }
    });
  }

  test("デバッグモードのバイパスは 'D' だけ＝門はデバッグでも閉じたまま", () => {
    // 着地判定は debugMode を見ない。'D' は STATEFUL_TILES 外だが、着地判定側で
    // openedDoors を見てブロックする（2026-08-06 修正）＝両者は整合している。門でバイパスが増えると
    // 着地判定と食い違うので、ここで「デバッグでも門は閉」を固定する。
    const tiles = [['.', '.', '.'], ['.', TILE.GATE, '.'], ['.', '.', '.']];
    const ss = { openGates: new Set(), stonePositions: {}, conditionsMet: new Set() };
    const stageData = { rows: 3, cols: 3, tiles };
    const p = createPassable({
      getStageData: () => stageData,
      getEnemies: () => [],
      getPlayer: () => ({ x: 0, y: 0 }),
      getCurrentLayer: () => 'field',
      getStageKey: () => '0,0',
      getDebugMode: () => true,      // ← デバッグ ON
      getSS: () => ss,
      toTileRow: (y) => Math.floor(y),
      toTileCol: (x) => Math.floor(x),
    });
    expect(p.tilePassable(1, 1), 'デバッグモードで門が開いてしまった').toBe(false);
  });
});

// ── 実エンジン ─────────────────────────────────────────────────
// 上のユニットは「判定関数が正しい」までしか言えない。実際に辺を歩いて
// 「閉じた門の画面に入れない／開ければ入れる」までを通す（配線ミスは全部ここに出る）。
test.describe('⑥-landing ③ 実エンジン：閉じた門の境界は越えられない', () => {
  test('④ 閉じた門セルへ向かう辺遷移は拒否される（dungeon_7 1,0→1,1 の T）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // 1,0 の下端 row9 col5 は床。そこから南へ出ると 1,1 の (0,5)='T' に着地する。
    await boot(page, previewUrl({ layer: D7.layer, stage: D7.from, row: 8, col: 5 }));

    await walk(page, 'down', 8);
    expect(await stageOf(page), '閉じた門をすり抜けて隣のステージに入った').toBe(D7.from);
    // 押し戻しは「出ようとした軸だけ」＝境界セルの整数座標に留まる。
    const pos = await posOf(page);
    expect(pos.y, `押し戻し後の y=${pos.y} が境界セル row9 でない`).toBe(9);
    expect(pos.x, '押し戻しで横軸がズレた').toBe(5);
    expect(errors).toEqual([]);
  });

  test('⑤ 押し戻し座標は整数＝連打しても遷移が再トリガーしない', async ({ page }) => {
    await boot(page, previewUrl({ layer: D7.layer, stage: D7.from, row: 8, col: 5 }));
    // 30回連打。半セル押し戻しだと境界外に残って毎tick遷移判定が走る形になり得るので、
    // 「何回押しても同じ整数セルに留まる」ことを確かめる。
    await walk(page, 'down', 30);
    expect(await stageOf(page)).toBe(D7.from);
    expect(await posOf(page)).toEqual({ x: 5, y: 9 });
  });

  // ④ だけでは「常に拒否する実装」でも緑になる（vacuous pass）。∴ **同じ境界**を
  // 「開けてから」歩いて越えられることまで通す（1,1 側から北へ出て 1,0 へ、そして戻る）。
  // 1,1 の Y(1,1) は池の向こう＝矢で叩き、門の手前の '!' は爆弾で砕く＝実データそのままの
  // 弓＋爆弾の関門を歩く（2026-09-25 にこの部屋を作り替えた＝旧版は 1,2 の飾りの門を使っていた）。
  test('⑥ 門を開けてから同じ辺を歩くと遷移できる（vacuous pass 防止）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boot(page, previewUrl({
      layer: D7.layer, stage: D7.to, row: 3, col: 4, extra: { ps_bow: '1' },
    }));

    // (3,4) から北へ2セル上がって射座 (1,4) に立つ（1操作 = 0.5セル）。
    await walk(page, 'up', 4);
    expect(await posOf(page), '射座 (1,4) に立てない').toEqual({ x: 4, y: 1 });

    // 西を向いて矢を放つ＝池 (1,3)(1,2) の上を飛んで Y(1,1) に当たる（剣は届かない距離）。
    // 西は水で塞がっているので movePlayer('left') では動かない＝向きだけが変わる。
    await page.evaluate(() => window.__game.movePlayer('left'));
    await page.evaluate(() => window.__game.step(1));
    expect(await posOf(page), '水の上へ歩けてしまった').toEqual({ x: 4, y: 1 });
    await page.evaluate(() => window.__game.useSubItem());
    await page.evaluate(() => window.__game.step(30));
    const ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.switchToggles, `矢が Y(${D7.toggle}) に当たっていない`).toContain(D7.toggle);
    expect(ss.openGates, `Y スイッチで 1,1 の門 (${D7.gate}) が開いていない`).toContain(D7.gate);

    // 門の手前 (1,5)(1,6) は '!'＝爆弾で砕かないと門まで歩けない（弓だけでは越えられない）。
    await page.evaluate(() => {
      const p = window.__game.getPlayer();
      p.subItems.bomb = { count: 3 };
      p.activeSubItem = 'bomb';
    });
    await page.evaluate(() => {
      window.__game.step(2);        // クールダウン解消
      window.__game.useSubItem();   // 足元 (1,4) に設置＝爆風半径2の円で '!' 2枚を砕く
      window.__game.step(30);       // 爆発まで待つ
    });
    const broken = (await page.evaluate(() => window.__game.getStageState())).brokenWalls ?? [];
    for (const w of D7.walls) expect(broken, `爆弾で ${w} が砕けていない`).toContain(w);

    // 砕けた壁を通って col5 へ寄り、開いた門から北へ抜ける → 1,0 の row9（床）に着地。
    await walk(page, 'right', 2);
    expect(await walkUntilStage(page, 'up', D7.from, 12), '開いた門を通って北へ抜けられない').toBe(true);
    expect(await posOf(page), '1,0 側の着地が境界セルの整数でない').toEqual({ x: 5, y: 9 });

    // そのまま南へ戻る → 今度は「開いた門セルへの着地」＝許可される（④ の裏返し）。
    expect(await walkUntilStage(page, 'down', D7.to, 4), '開いた門セルへは着地できるはず').toBe(true);
    expect(await posOf(page), `開いた門セル (${D7.gate}) に整数で着地していない`).toEqual({ x: 5, y: 0 });
    expect(errors).toEqual([]);
  });
});

test.describe('⑥-landing ④ 実エンジン：着地は整数セル（境界セルそのもの）', () => {
  // 旧実装はここで y=0.5（上から1.5セル）に降りていた＝ユーザーが見つけた症状。
  // 4方向すべてで「境界セルの整数座標に降りる」ことを固定する。
  // ⚠️ 着地した「直後」を測る必要がある＝そのまま歩き続けると奥へ進んで座標が変わり、
  //   半セル着地に戻っていても気づけない。∴ ステージが変わった時点で止める。
  const CROSSINGS = [
    { name: '北へ出る → 下端 rows-1', from: '13,2', row: 0, col: 5,  dir: 'up',    to: '13,1', land: { x: 5, y: 9 } },
    { name: '南へ出る → 上端 row0',   from: '13,1', row: 9, col: 5,  dir: 'down',  to: '13,2', land: { x: 5, y: 0 } },
    { name: '東へ出る → 左端 col0',   from: '13,2', row: 1, col: 11, dir: 'right', to: '14,2', land: { x: 0, y: 1 } },
    { name: '西へ出る → 右端 cols-1', from: '13,2', row: 4, col: 0,  dir: 'left',  to: '12,2', land: { x: 11, y: 4 } },
  ];
  for (const c of CROSSINGS) {
    test(`${c.name}（field ${c.from}→${c.to}）`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await boot(page, previewUrl({ layer: 'field', stage: c.from, row: c.row, col: c.col }));

      // 遷移した瞬間で止める（それ以上歩くと着地座標が測れない）。
      expect(await walkUntilStage(page, c.dir, c.to, 8), '正当な開口で遷移できていない').toBe(true);
      const pos = await posOf(page);
      expect(pos, `着地 (${pos.x},${pos.y}) が境界セルの整数でない（半セル着地に戻っている）`)
        .toEqual(c.land);
    });
  }
});
