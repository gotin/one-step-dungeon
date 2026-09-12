// tests/test-arena-doors.spec.js — 敵アリーナの「通路」が **実際に歩いて抜けられる** ことを測る。
// 対象は2本の鎖（tests/test-arena-doors.js DOOR_CHAINS）：
//   ・row 0 … ギミック検証アリーナ 28,0〜38,0（②）
//   ・row 1 … Phase 8-4 (2) のリバランス検証行 0,1〜33,1（③・2026-08-23 追加）
//
// 通路の仕様は tests/test-arena-doors.js（単一の真実）＝左右の外周の rows 7/8。
// 目的は「敵を並べて試すとき、save 注入で飛ばずに歩いて見比べられること」（ユーザーが
// 自分で開けていた道）。2026-08-16 に「外周は全部壁」と決めつけて2回塞ぐ事故を起こした
// ∴通路は仕様として生成スクリプトが開け、この本が「通れること」を固定する。
//
// ⚠️ 幾何（床か壁か）の検査は各スペックにもある（facing-block ⑮ / hit-trigger ④）が、
//    **床であること ≠ 通れること**。横断遷移は
//      ・`game.js checkStageTransition` が反対軸の座標を**そのまま持ち込む**（newRow = y
//        ＝半セル 7.5 になりうる）
//      ・`arrivalIsWall()` が float の footprint（rows 7〜8 の2行）で着地を弾く
//      ・遷移は `setTimeout(…, 100)` 越しに確定する
//    ∴「開いているのに入れない通路」が成立しうる。この本は**実機で歩いて**測る。
//
// 測る位置は y=7.5（半セル）だけ＝footprint が rows 7 と 8 の両方に跨る**最も厳しい条件**
// ∴どちらか一方の行を塞げばこの本が赤くなる（1行だけの通路は「たまに入れない」）。
//
// 歯の実測（2026-08-16・壊して赤くなることを確認し必ず復元した＝地図はバイト同一に戻した）：
//   ARENA_DOOR_ROWS を [7] にして migrate 4本を流す（＝row 8 を塞ぐ）
//     → ②が赤（`◯◯,0 から right へ歩いて △△,0 に入れない`）／**①は緑**
//        ＝①の期待値は同じ定数から導かれる∴「宣言ごと縮めた」事故は①では捕まらない。
//        通路が2行必要であることを守っているのは②（実機で y=7.5 から渡る本）だけ。
//   上の状態から定数だけ [7, 8] に戻す（＝地図が宣言から外れた状態）
//     → ①②とも赤＝地図側のドリフトは①が捕まえる（宣言と盤面の食い違いを読み分けられる）

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import {
  ARENA_DOOR_ROWS, DOOR_ARENAS, BALANCE_ARENAS, DOOR_CHAINS, arenaDoorCells, isArenaDoor,
} from './test-arena-doors.js';

const GAME = '/blade-of-lumia/game/';
const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const gridOf = (name) => MAP.layers[TEST_LAYER].stages[stageKey(name)].tiles
  .map(r => (Array.isArray(r) ? r : String(r).split('')));

function previewUrl(name, row, col) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey(name),
    row: String(row), col: String(col), ps_weapon: '1',
  });
  return `${GAME}?${p.toString()}`;
}

/**
 * 実機で `name` のアリーナに入り、`dir` の端まで歩いて隣のステージへ渡る。
 * 立ち位置は**いちばん厳しい半セル（y = ARENA_DOOR_ROWS[0] + 0.5）**＝着地 footprint が
 * 通路の2行に跨る条件（1行だけ開いた通路なら弾かれる）。
 * @returns {Promise<string>} 渡った後の stageKey（渡れていなければ元のキー）
 */
async function walkAcross(page, name, dir) {
  const from = stageKey(name);
  const startCol = dir === 'right' ? 10 : 1;
  await page.goto(previewUrl(name, ARENA_DOOR_ROWS[0], startCol));
  await waitForBoard(page);
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.pause());   // 実ループの tick を混ぜない
  // 半セル位置へ（例 y=7 → 7.5）＝着地 footprint が rows 7/8 の2行に跨る条件
  await page.evaluate(() => window.__game.movePlayer('down'));
  expect(await page.evaluate(() => window.__game.getState().player.y),
    `${from}: 半セル位置（${ARENA_DOOR_ROWS[0] + 0.5}）に立てない＝通路の内側が塞がっている`)
    .toBe(ARENA_DOOR_ROWS[0] + 0.5);

  // 端まで歩く。遷移は setTimeout(…,100) 越しに確定する∴1手ごとに待つ。
  // 🔴（キュー11・2026-09-12）400ms の `waitForFunction` が稀に間に合わない（CPU 競合で
  //    `setTimeout(…,100)` の発火が遅れる）と、次の周でまた movePlayer を呼ぶ＝その
  //    直後に前の遷移がようやく確定すると、**新しい部屋の中で**もう半セル進んでしまう
  //    （boss-door-entry.spec.js で実測した同型の競合＝「動かす→確認」の順が空ける隙）。
  //    ∴ここでも「確認→まだなら動かす」の順にする＝一度でも遷移していたら二度と動かさない。
  for (let k = 0; k < 8; k++) {
    if ((await page.evaluate(s => window.__game.getState().stageKey !== s, from))) break;
    await page.evaluate(d => window.__game.movePlayer(d), dir);
    try {
      await page.waitForFunction(s => window.__game.getState().stageKey !== s, from, { timeout: 400 });
      break;
    } catch { /* まだ端に着いていない＝次の一歩 */ }
  }
  return page.evaluate(() => window.__game.getState().stageKey);
}

test.describe('敵アリーナ間の通路（rows 7/8）', () => {
  // ① 通路を持つステージすべてを横断で見る（各スペックの④/⑮は自分の2枚しか見ていない＝抜けが出る）
  //    ＝row 0 のアリーナ（DOOR_ARENAS）＋ row 1 のリバランス検証行（BALANCE_ARENAS）。
  test('① 通路を持つ全ステージで通路が開いていて、その内側も床', () => {
    expect(DOOR_CHAINS.flat().length, '鎖の合計枚数')
      .toBe(DOOR_ARENAS.length + BALANCE_ARENAS.length);
    for (const name of DOOR_CHAINS.flat()) {
      const grid = gridOf(name);
      const cols = grid[0].length;
      for (const [r, c] of arenaDoorCells(cols)) {
        expect(grid[r][c], `${name}: 通路 (${r},${c}) が塞がれている＝隣のアリーナへ歩いて行けない`)
          .toBe(TILE.FLOOR);
        const inner = c === 0 ? 1 : cols - 2;
        expect(grid[r][inner], `${name}: 通路 (${r},${c}) の内側 (${r},${inner}) が壁＝着地が拒否される`)
          .toBe(TILE.FLOOR);
      }
      // 通路以外の外周は壁のまま（通路を「外周を全部開ける」に読み替えない）
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < cols; c++) {
          const onEdge = r === 0 || r === grid.length - 1 || c === 0 || c === cols - 1;
          if (!onEdge || isArenaDoor(r, c, cols)) continue;
          expect(grid[r][c], `${name}: 外周 (${r},${c}) が壁でない（通路は rows ${ARENA_DOOR_ROWS.join('/')} だけ）`)
            .toBe(TILE.WALL);
        }
      }
    }
  });

  // ② 実機で歩いて抜ける。隣り合うペア×東西の2方向を、いちばん厳しい y=7.5 で測る
  //   （鎖は DOOR_ARENAS から導く＝アリーナを挿し込んでもこの本を直さない）。
  // 🔴（キュー11・2026-09-12）実測＝`--workers=1`（負荷なし）でも **25.8 秒**＝既定タイム
  //    アウト30秒のすぐ内側。11枚×2方向＝20回の横断（goto＋歩行＋遷移待ち）を1本の
  //    テストで直列にやる構造そのものが重い＝フル並列実行のわずかな遅延（CPU競合で
  //    `page.goto`/`setTimeout` が実時間で遅れる）だけで30秒を超え、Playwright が
  //    テストを強制終了してページを破棄する（`Target page, context or browser has been
  //    closed` の実体はこれ＝原因はテストの重さそのもの・機構の穴ではない）。
  //    ⑨（tests/field-corridor-o.spec.js・PLAN 実行キュー1）と同じ「既定タイムアウトに
  //    近接した重いE2E」＝同じ対処＝`test.slow()`（90秒に緩和・計算量は変えない）。
  test('② 隣り合うアリーナへ歩いて抜けられる（東西両方向・半セル位置 y=7.5）', async ({ page }) => {
    test.slow();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const keys = DOOR_ARENAS.map(stageKey);
    const crossed = [];

    for (const [i, from] of keys.entries()) {
      const [fc, fr] = from.split(',').map(Number);
      for (const dir of ['left', 'right']) {
        const to = `${dir === 'right' ? fc + 1 : fc - 1},${fr}`;
        if (!keys.includes(to)) continue;   // 鎖の外（27,0 は東半分が壁＝通路にならない）
        const after = await walkAcross(page, DOOR_ARENAS[i], dir);
        expect(after, `${from} から ${dir} へ歩いて ${to} に入れない（通路が使えていない）`).toBe(to);
        crossed.push(`${from}→${to}`);
      }
    }

    // 鎖の本数＝(枚数-1)ペア×2方向（塞がれたペアが黙って skip されていないことを固定する）
    expect(crossed.length, `渡れたのは ${crossed.join(' ')} だけ`).toBe((DOOR_ARENAS.length - 1) * 2);
    expect(errors, 'ゲームで pageerror').toEqual([]);
  });

  // ③ リバランス検証行（y=1・34枚）も**歩いて**抜けられる（2026-08-23・Phase 8-4 (2)）。
  //   ユーザー依頼の核が「ステージの間に壁なしで移動できる」∴①（幾何）だけでは足りない
  //   （②のコメントのとおり「開いているのに入れない通路」が成立しうる）。
  //   ⚠️ 1ペア＝1テストにする理由：34枚を1テストに入れると横断 66 回＝Playwright の既定
  //      タイムアウト（30 秒）を超える。ペア単位なら並列に流れ、塞がったペアが名前で分かる。
  //   ⚠️ ボスの部屋でも渡れること自体が歯＝`isBossRoom` を立てると入室で扉が閉じて
  //      隣へ歩けなくなる（この行は立てない、という決まりの番人）。
  for (const [i, name] of BALANCE_ARENAS.entries()) {
    if (i === BALANCE_ARENAS.length - 1) continue;      // 最後の枚は東の相手が居ない
    const next = BALANCE_ARENAS[i + 1];
    test(`③ ${stageKey(name)} ⇔ ${stageKey(next)} を歩いて往復できる（${name} ⇔ ${next}）`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const [ax, ay] = stageKey(name).split(',').map(Number);
      const [bx, by] = stageKey(next).split(',').map(Number);
      expect([bx - ax, by - ay], `${name} と ${next} が東西に隣り合っていない`
        + '（BALANCE_ARENAS の順序はステージキーの並び順と一致していなければならない）')
        .toEqual([1, 0]);

      expect(await walkAcross(page, name, 'right'),
        `${stageKey(name)} から east へ歩いて ${stageKey(next)} に入れない`).toBe(stageKey(next));
      expect(await walkAcross(page, next, 'left'),
        `${stageKey(next)} から west へ歩いて ${stageKey(name)} に入れない`).toBe(stageKey(name));
      expect(errors, 'ゲームで pageerror').toEqual([]);
    });
  }
});
