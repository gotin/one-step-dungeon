// ボス部屋の入室ロックの回帰テスト
// （2026-09-05 ユーザー報告「darklord_prison の 0,2 に入った途端に動けなくなった。
//  ボスドアは中に入ってから閉めるようにしないとだめなのでは？ ボスドアに挟まれたような
//  状態になって動けなくなってしまってる」の再発防止）。
//
// 何が起きていたか：
//   ボス部屋の ':'（DOORWAY_BOSS）は実マップの8部屋すべてで**部屋の境界セル**に在る。
//   端遷移の着地は境界セルそのもの（game.js checkStageTransition・9-6 ⑥-landing 2026-07-29
//   で半セル内側から整数の境界セルへ変えた）∴入室した瞬間に扉を閉じると
//   **プレイヤーが立っているセルが通行不可になる**。
//   isPassable は「今いるセル」を免除しない（免除は はしごで渡る水/穴だけ）＝半セル動いても
//   占有範囲が必ず扉セルに重なる∴4方向すべて塞がれる。さらに bossRoomLocked が端遷移も
//   禁じる（game.js checkStageTransition）∴自力で脱出する手が一つも無い恒久詰みだった
//   （測ったら8部屋すべてで再現した＝1部屋の配置ミスではなくエンジンの穴）。
//
// 直し（game/boss.js startBossBattle）＝**プレイヤーが扉のセルから降りてから閉める**。
// 降りずに引き返して部屋を出たら閉めずに諦める（再入室でまた掛かる）。
//
// このスペックは2つを別々に固定する：
//   ① データ：境界の ':' の1つ内側は通行可な床（降りる先が無いと永久に閉じない）。
//   ② エンジン：入室後に内側へ歩ける／歩いたらロックが掛かる（全ボス部屋・データ駆動）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { GAME_URL, waitForBoard } from './helpers.js';

const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));

const rowsOf = (stage) => stage.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

// 境界の ':' から「内側セル・手前の部屋・手前の立ち位置・押す向き」を導く。
// 手書きの表を作らない＝ボス部屋が増えたら自動で対象になる。
function bossDoorCases() {
  const out = [];
  for (const [layer, ld] of Object.entries(MAP.layers ?? {})) {
    for (const [stageKey, sd] of Object.entries(ld.stages ?? {})) {
      if (!sd.isBossRoom || !Array.isArray(sd.tiles)) continue;
      const t = rowsOf(sd);
      const [sx, sy] = stageKey.split(',').map(Number);
      t.forEach((row, r) => [...row].forEach((ch, c) => {
        if (ch !== ':') return;
        let inward = null, from = null, dir = null, standR = null, standC = null;
        if (r === 0)             { inward = [r + 1, c]; from = `${sx},${sy - 1}`; dir = 'down';  standR = 'last'; standC = c; }
        else if (r === sd.rows-1){ inward = [r - 1, c]; from = `${sx},${sy + 1}`; dir = 'up';    standR = 0;      standC = c; }
        else if (c === 0)        { inward = [r, c + 1]; from = `${sx - 1},${sy}`; dir = 'right'; standR = r;      standC = 'last'; }
        else if (c === sd.cols-1){ inward = [r, c - 1]; from = `${sx + 1},${sy}`; dir = 'left';  standR = r;      standC = 0; }
        if (!inward) return;   // 部屋の内部に置かれた ':' は着地しない＝この検査の対象外
        out.push({
          // 手前の部屋の「向かい合うセル」＝そこから歩いて扉に着地する足場。
          // 壁なら端遷移では入れない（例：D4 のボス扉の手前は鍵扉の行で埋まっている）、
          // '>' なら踏んだ瞬間にワープするので端遷移には至らない∴どちらも歩いて入る経路ではない。
          fromTile: (() => {
            const fsd = ld.stages?.[from];
            if (!fsd || !Array.isArray(fsd.tiles)) return undefined;
            const ft = rowsOf(fsd);
            const fr = standR === 'last' ? fsd.rows - 1 : standR;
            const fc = standC === 'last' ? fsd.cols - 1 : standC;
            return ft[fr]?.[fc];
          })(),
          layer, bossStage: stageKey, door: `${r},${c}`, inward,
          inwardTile: t[inward[0]]?.[inward[1]],
          from, dir, standR, standC,
        });
      }));
    }
  }
  return out;
}

const CASES = bossDoorCases();

test.describe('ボス部屋の入室ロック ① データ：扉の内側に降りる床がある', () => {
  test('境界のボス扉の1つ内側は通行可な床（全レイヤー）', () => {
    expect(CASES.length, '境界にボス扉のある部屋が1つも無い＝ケース導出が壊れている')
      .toBeGreaterThan(0);
    // '.' 床 / ';' 境界通路 / '>' 出入口 は乗れる。壁・水・看板などは乗れない＝
    // 降りる先が無いと「降りてから閉める」が永久に成立しない（＝扉が閉じない部屋になる）。
    const STANDABLE = new Set(['.', ';', '>']);
    const bad = CASES.filter((cs) => !STANDABLE.has(cs.inwardTile))
      .map((cs) => `${cs.layer} [${cs.bossStage}] 扉(${cs.door}) の内側(${cs.inward.join(',')})='${cs.inwardTile}'`);
    expect(bad, 'ボス扉の内側が床でない＝入室しても扉から降りられない').toEqual([]);
  });
});

// 1操作 = 0.5 セル（game/constants.js MOVE_STEP）。遷移は setTimeout を挟む∴実時間で待つ。
async function step(page, dir, n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate((d) => { window.__game.setHeroDir(d); window.__game.movePlayer(d); }, dir);
    await page.waitForTimeout(80);
  }
}

const st = (page) => page.evaluate(() => {
  const s = window.__game.getState();
  return { layer: s.currentLayer, room: s.stageKey, x: s.player.x, y: s.player.y, locked: s.bossRoomLocked };
});

test.describe('ボス部屋の入室ロック ② エンジン：入った途端に閉じ込められない', () => {
  // 部屋ごとに1ケースだけ測れば足りる（同じ辺の2枚は同じ経路）。
  // 内側が '>'（出入口タイル）の扉は避ける＝踏んだ瞬間にワープして部屋を出るので
  // 「扉から降りて動けたか」を測れない（キュー20b・2026-09-21 までの dark_tower 0,0 (8,5) が
  // 実際にこれだった＝玉座を 5,3 へ移してマップ入口を撤去した∴今は該当ゼロ。仕掛けは残す）。
  const byRoom = new Map();
  for (const cs of CASES) {
    if (cs.fromTile !== '.' && cs.fromTile !== ';') continue;   // 歩いて端から入れる扉だけ
    const k = `${cs.layer}|${cs.bossStage}|${cs.from}`;
    const cur = byRoom.get(k);
    if (!cur || (cur.inwardTile !== '.' && cs.inwardTile === '.')) byRoom.set(k, cs);
  }
  const uniq = [...byRoom.values()];

  for (const cs of uniq) {
    test(`${cs.layer} [${cs.from}] → [${cs.bossStage}]：扉(${cs.door})に着地しても内側へ歩ける`, async ({ page }) => {
      // 🔴（キュー11・2026-09-12）単独では 2.5 秒で済む軽いテストだが、フル並列実行時に
      //    数回「Target page, context or browser has been closed」で落ちた記録がある。
      //    この本は `game.js` の実時間ループ（setInterval）＋固定 `waitForTimeout`
      //    （80ms/1200ms）で実際の遷移・ロックの発火を待つ＝CPU競合でタイマーが実時間で
      //    遅延すると、既定30秒タイムアウトを超えてページが破棄されうる（test-arena-doors
      //    ②と同じ「重い並列実行下でだけ既定タイムアウトに触れる」系列）。同じ対処＝
      //    `test.slow()`（90秒に緩和・待ち方や計算量は変えない）。
      test.slow();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));

      const fs = MAP.layers[cs.layer].stages[cs.from];
      expect(fs, `手前の部屋 [${cs.from}] が無い`).toBeTruthy();
      const row = cs.standR === 'last' ? fs.rows - 1 : cs.standR;
      const col = cs.standC === 'last' ? fs.cols - 1 : cs.standC;
      await page.goto(`${GAME_URL}?fromEditor=1&layer=${cs.layer}&stage=${cs.from}`
        + `&row=${row}&col=${col}&ps_weapon=1&ps_sword=4&ps_hearts=20&ps_shield=2`);
      await waitForBoard(page);
      await page.waitForFunction(() => !!window.__game?.getState);

      // 手前の部屋の境界セルからボス部屋へ入る
      // 🔴（キュー11・2026-09-12）旧実装は「動かす→確認」の順＝遷移は `setTimeout(…,100)`
      //    越しに確定するため、80ms の固定待ちの直後（まだ確定前）は「動かして良い」と
      //    誤判定し、次のループで movePlayer を1回よけいに呼んでいた。通常は次の no-op
      //    （`isTransitioning` ガード）が吸収するが、フル並列実行の CPU 競合でタイマーが
      //    実時間で遅れると、その「よけいな1回」が確定**後**（新しい部屋の中）で発火し
      //    半セル分だけ奥へ進んでしまう（実測＝着地列が 0.5 ずれて `Math.round` で1に
      //    切り上がり "4,1" になった＝機構の穴ではなくテストの動かし方の競合）。
      //    ∴「確認→まだなら動かす」の順に変える＝既に着地した回では二度と movePlayer を
      //    呼ばない（状態待ちへの置き換え・待ち時間そのものは変えない）。
      for (let i = 0; i < 6; i++) {
        if ((await st(page)).room === cs.bossStage) break;
        await step(page, cs.dir);
      }
      const landed = await st(page);
      expect(landed.room, 'ボス部屋へ入れていない＝この経路の前提が崩れている').toBe(cs.bossStage);
      expect(`${Math.round(landed.y)},${Math.round(landed.x)}`, '扉のセルに着地していない＝検査が空虚')
        .toBe(cs.door);

      // ⚠️ ここで待つのが検査の歯：画面が切り替わったら人は一度手を止める（ユーザーの
      //    「入った途端に動けなくなった」がこれ）。旧挙動は入室から 400ms 後に無条件で
      //    閉めていた∴止まっているあいだに扉が閉じ、以後1歩も動けなかった。
      //    待たずに歩くテストは旧挙動でも通ってしまう（＝空虚な検査になる）。
      await page.waitForTimeout(1200);
      expect((await st(page)).locked,
        '扉のセルに立っているのに扉が閉じた＝この位置で閉じると4方向すべて塞がる').toBe(false);

      // 🔴 ここが本体：扉に立ったまま閉じられていたら1歩も動けない。
      await step(page, cs.dir, 2);
      const inside = await st(page);
      expect(inside.room, '内側へ歩いたら部屋の外へ出た').toBe(cs.bossStage);
      expect(`${inside.y},${inside.x}`,
        `扉のセル(${cs.door})から動けない＝閉じた扉に埋まっている`).not.toBe(`${landed.y},${landed.x}`);

      // 降りたらロックが掛かる（＝ロックを捨てたのではなく遅らせただけ）
      await page.waitForFunction(() => window.__game.getState().bossRoomLocked, null, { timeout: 5000 });
      expect((await st(page)).locked, '扉から降りてもロックが掛からない').toBe(true);
      expect(errors, 'pageerror が出た').toEqual([]);
    });
  }
});
