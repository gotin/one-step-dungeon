#!/usr/bin/env node
/**
 * blade-solver.mjs  — 実ゲームの遷移規則を写した状態空間ソルバー（単一ソース）
 *
 * この `makeSolver` は 2 つの用途で **同じ遷移関数** を使うために切り出した：
 *   1. パズル検証（migrate-field-delta-o.mjs の verifyPuzzle）＝「入って詰まない・飾りでない」
 *   2. 難易度測定（measure-puzzle.mjs）＝ PUZZLE-DESIGN §4 の4軸
 * 別実装にすると「測定では難しいが実ゲームでは違う」乖離が起きる∴遷移は1箇所。
 *
 * 状態 = プレイヤー位置 × 石位置 × Yトグルマスク × brokenWalls集合 × litTorches集合
 *        × 石ロック × activeColor（色スイッチ）。
 * brokenWalls / litTorches は不可逆な単調増加ビットなので状態爆発しない。
 * activeColor は 3 値（none/red/blue）＝状態が3倍になるだけ（可逆・非単調）。
 *
 * エンジンから写した規則（ここがズレると「テスト緑・実機で詰む」）:
 *   ・ボタン S はモーメンタリ。ON ⟺ プレイヤー or 石が今その上にいる。
 *   ・石ロック（Phase 4.56/4.6）＝全ボタンに**石**が乗った瞬間に恒久ロック。以後
 *     石は押せず、全ゲート T は開いたまま（＝解いたパズルを解き直させない）。
 *     状態に locked ビットを持つ（単調増加）。これが無いと「ロック後に石をどかして
 *     通路を空ける」実ゲームの近道を見落とし、L を過大に測る。
 *   ・Y は武器で叩くトグル。隣接（射程1）から叩ける。踏むのではなく叩く。
 *   ・弓: 向いた方向へ矢が飛ぶ。WALL と未破壊 '!' だけ遮る（水/潮は飛び越える）。
 *     矢が 'Y' に当たるとトグル。プレイヤーは動かない（弓ゲート）。
 *   ・爆弾: プレイヤーのセルに置き、AOE 半径2の円内の未破壊 '!' を壊す（breakDef<=3）。
 *   ・ブーメラン: 向いた方向へ飛び、通過した 'H' に炎を運ぶ（火元→未点灯を点ける）。
 *   ・はしご: 進入軸の幅1水（両隣が陸）を1セルだけ渡れる。
 *   ・潮ゲートは openGates にある時だけ通れる。
 *   ・色スイッチ `[`（赤）/`]`（青）を武器で叩くと activeColor を**その色にセット**
 *     （トグルではない＝排他）。剣なら隣接（combat.js:321）、**矢/ビームでも当たればセット**
 *     （projectile.js:501）＝Y スイッチと同じ扱い∴遠くから色を変える手を見落とすと L を過大に測る。
 *     矢を止めるのは WALL と未破壊 '!' だけ（isTilePassableForProj）＝石や門は飛び越える。
 *     色ゲート `(` は activeColor==='red'、`)` は 'blue' のときだけ通行可。初期値は未設定＝**両方閉**。
 *     ∴色ゲートは「開くと同時に反対色が閉じる」非単調な関門＝潮ゲート `=`（開くだけ＝単調）と
 *     難しさの性質が違う。⚠️ `(`/`)` は `SOLVABLE_GATES` ＝`isHardBlocked` が false なので、
 *     ここで明示的に色を見ないと「常に通行可」として測ってしまう（T/= と同じ罠）。
 *   ・石を押した後プレイヤーは石の元セルへ入る∴その**下地**（門の開閉）が閉じていたら押せない
 *     （2026-08-02・ユーザー報告のバグ修正）。⚠️ これが無いと「閉じた門の中に立って石を押し出す」
 *     実エンジンのバグ挙動を前提に L を測ってしまう（旧 Phase 5-1 の色ゲート合成盤面が実際に
 *     それで成立していた＝撤回）。**押し先は通常の通行判定に任せる**＝開いた門へ石を押し込むのは
 *     正当な語彙（廊下C3 は「石でボタンを押さえて開けた潮ゲートを通して別の石を運ぶ」設計）。
 */

import { isHardBlocked } from './connectivity.mjs';
import { TILE } from '../../shared/tiles.js';

export const ROWS = 10, COLS = 12;
export const W = '~';   // bgTiles water = 海（徒歩不可・はしごで幅1だけ渡れる）
export const O = 'o';   // bgTiles 石畳 = 沈んだ都の舗装（歩ける）

export const isRing = (r, c) => r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;

export function makeSolver(tiles, bg, linkSpec, breakDefs, litInit, { hasLadder = true, noTools = false } = {}) {
  const linksBySwitch = new Map();
  for (const [sw, gates] of linkSpec ?? []) linksBySwitch.set(sw, gates);
  const toggleCells = [];   // Y の位置
  const stoneKeys = [];     // '*' の元位置
  const buttons = [];
  const gatesT = [];        // T（GATE）の位置＝新ルール「全ボタンON→全T開」の対象
  const breakCells = [];    // '!' の位置（インデックス＝bit）
  const torchCells = [];    // 'H' の位置（インデックス＝bit）
  const colorCells = [];    // 色スイッチ '['/']' の位置（[cell, 1|2]）
  const redGateCells = [];  // 色ゲート赤 '(' の位置
  const blueGateCells = []; // 色ゲート青 ')' の位置
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = tiles[r][c];
    if (ch === TILE.SWITCH_RED) colorCells.push([`${r},${c}`, 1]);
    if (ch === TILE.SWITCH_BLUE) colorCells.push([`${r},${c}`, 2]);
    if (ch === TILE.GATE_RED) redGateCells.push(`${r},${c}`);
    if (ch === TILE.GATE_BLUE) blueGateCells.push(`${r},${c}`);
    if (ch === TILE.SWITCH) toggleCells.push(`${r},${c}`);
    if (ch === TILE.STONE) stoneKeys.push(`${r},${c}`);
    if (ch === TILE.BUTTON) buttons.push(`${r},${c}`);
    if (ch === TILE.GATE) gatesT.push(`${r},${c}`);
    if (ch === TILE.BREAKABLE_WALL) breakCells.push(`${r},${c}`);
    if (ch === TILE.TORCH) torchCells.push(`${r},${c}`);
  }
  // 2026-08-04（再設計・PLAN 4.7）：色ゲートは閉じている間、石にもプレイヤーと同じ「壁」を
  // 適用する（下の passableFor が石にも同じ color 判定を課す＝既に単一の通行規則）。
  // ∴開いたゲートに乗った石を残したまま反対色へ切り替えると、その石は閉じるゲートの中に
  // 埋まる＝この切替を**不発**にする（実エンジン game/player.js setActiveColor と同じ規則）。
  // これで「押し込みの直線を幾何で禁止する」旧 I1/I1' は不要になる（ユーザー指摘で撤回）。
  const colorSwitchBlocked = (toColor, stones) => {
    const closing = toColor === 1 ? blueGateCells : redGateCells;
    return closing.some((g) => stones.includes(g));
  };
  if (toggleCells.length > 6) throw new Error('Y が多すぎる（ビットマスクの上限）');

  const initStones = stoneKeys.map((k) => k);
  // brokenWalls / litTorches はビットマスク。litInit（初期点灯）は最初から立てる。
  const litInitMask = torchCells.reduce((m, cell, i) => (litInit.has(cell) ? m | (1 << i) : m), 0);
  // locked は 6 番目・color は 7 番目の任意フィールド（既存の呼び出し側は 5 引数のまま＝
  // locked=0 / color=0＝色未設定＝色ゲートは両方閉）。フィールドを**末尾に足す**のは
  // 呼び出し側が `state.split('|')` の f[0]/f[1]/f[5] を見ているため（既存の索引を動かさない）。
  const encode = (pr, pc, stones, mask, broken, lit, locked = 0, color = 0) =>
    `${pr},${pc}|${stones.join(';')}|${mask}|${broken}|${lit}|${locked}|${color}`;
  // 全ボタンに石が乗ったか（＝実ゲームのロック条件・プレイヤーの足踏みは数えない）
  const allButtonsOnStones = (stones) =>
    buttons.length > 0 && buttons.every((b) => stones.includes(b));

  // ゲート開閉は実ゲーム game/conditions.js refreshGates() と同じ規則：
  //   ① ボタン S が1個以上あれば「全ボタン ON のときだけ全ゲート T を開く」（新仕様）。
  //   ② links（switchId→gateId）は潮ゲート = と、ボタンの無い盤面の Y→T を担う。
  //      ボタンがある盤面の T は①が担うので links の T エントリはスキップ（競合回避）。
  const openGatesOf = (pr, pc, stones, mask, locked = 0) => {
    const open = new Set();
    const here = `${pr},${pc}`;
    const onSwitch = (sw) => {
      const ti = toggleCells.indexOf(sw);
      if (ti >= 0) return (mask & (1 << ti)) !== 0;   // Y はマスク
      return sw === here || stones.includes(sw);       // ボタンは足/石
    };
    // ① 全ボタン ON → 全 T 開（ロック済みなら足を離しても開いたまま）
    if (locked || (buttons.length > 0 && buttons.every(onSwitch))) for (const g of gatesT) open.add(g);
    // ② links 連動（潮 = と、ボタン無し盤面の Y→T）
    for (const [sw, gates] of linksBySwitch) {
      if (!onSwitch(sw)) continue;
      for (const g of gates) {
        if (buttons.length > 0 && gatesT.includes(g)) continue;   // ボタン盤面の T は①が担う
        open.add(g);
      }
    }
    return open;
  };

  /**
   * 石の元セル（押した後プレイヤーが入るセル）の**下地**が開いているか。
   * 石そのものは今から動くので無視し、下のタイルだけを見る（passable.js statefulTileClosed
   * と同じ規則）。石は「押した時点で通行可だったセル」にしか居られない∴後から閉じ得るのは
   * 状態で開閉する門だけ＝ここでは門だけを見れば必要十分。
   */
  const underOpen = (r, c, open, color) => {
    const ch = tiles[r]?.[c];
    if (ch === TILE.GATE || ch === TILE.TIDE_GATE) return open.has(`${r},${c}`);
    if (ch === TILE.GATE_RED) return color === 1;
    if (ch === TILE.GATE_BLUE) return color === 2;
    return true;                        // 床・ボタン・未移動石の元セル等はそのまま通れる
  };

  // passable.js tilePassable の写し。broken は brokenWalls マスク。color は activeColor（0/1/2）。
  const passableFor = (r, c, stones, open, broken, { forStone }, color = 0) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (bg[r][c] === W) return false;                       // 水（bg 単一ソース）
    const ch = tiles[r][c];
    // 色ゲートは activeColor が一致する時だけ通れる（初期 color=0 は両方閉＝実ゲームと同じ）。
    if (ch === TILE.GATE_RED) return color === 1;
    if (ch === TILE.GATE_BLUE) return color === 2;
    // 色スイッチ '['/']' はプレイヤーは**踏める**が石は通せない（2026-08-04・PLAN 4.7
    // 再設計＝押し込み経路の一部にせず「叩くための的」のまま保つ・player.js stoneDestOk
    // と同じ規則）。これで旧 I1'（幾何での押し込み禁止）が丸ごと不要になる。
    // ⚠️ connectivity.mjs の HARD_BLOCKED は field 指標（traps/dead-edge）のベースライン
    //    維持のため保守的に壁扱いしている∴プレイヤー側はここで明示的に上書きしないと
    //    「スイッチの上に立って石を押す」立ち位置が消える（実測：合成盤面の石が1個も
    //    押せず状態 730 で解なしになった）。
    if (ch === TILE.SWITCH_RED || ch === TILE.SWITCH_BLUE) return !forStone;
    // ゲート T / 潮ゲート = は openGates に載っている時だけ通れる。
    // ⚠️ T は connectivity.mjs の SOLVABLE_GATES 側＝isHardBlocked('T') は false なので、
    //    ここで明示的に開閉を見ないと「T は常に通行可」として測ってしまう
    //    （＝ゲートで隔離した報酬が測定上は素通り＝L も貪欲も嘘になる）。
    if (ch === TILE.GATE || ch === TILE.TIDE_GATE) return open.has(`${r},${c}`);
    if (ch === TILE.BREAKABLE_WALL) {
      const bi = breakCells.indexOf(`${r},${c}`);
      return bi >= 0 && (broken & (1 << bi)) !== 0;          // 壊れていれば床
    }
    if (ch === TILE.STONE) {
      if (stones.includes(`${r},${c}`)) return false;
      const idx = stoneKeys.indexOf(`${r},${c}`);
      if (idx >= 0 && stones[idx] !== `${r},${c}`) return true;
      return false;
    }
    if (isHardBlocked(ch)) return false;
    if (forStone && ch === 'B') return false;
    return true;
  };

  // はしご渡り: 進入軸 axis（'v'/'h'）の幅1水（両隣が陸）を渡れるか。
  const isBank = (r, c, stones, broken) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (bg[r][c] === W) return false;
    const ch = tiles[r][c];
    if (isHardBlocked(ch)) return false;
    // ゲート（T/=/色）は橋脚にならない（保守側）
    if (ch === TILE.GATE || ch === TILE.TIDE_GATE
      || ch === TILE.GATE_RED || ch === TILE.GATE_BLUE) return false;
    if (ch === TILE.BREAKABLE_WALL) {
      const bi = breakCells.indexOf(`${r},${c}`);
      return bi >= 0 && (broken & (1 << bi)) !== 0;
    }
    if (ch === TILE.STONE && stones.includes(`${r},${c}`)) return false;
    return true;
  };
  const canLadderCross = (r, c, axis, stones, broken) => {
    if (!hasLadder) return false;
    if (bg[r][c] !== W) return false;
    if (axis === 'v') return isBank(r - 1, c, stones, broken) && isBank(r + 1, c, stones, broken);
    return isBank(r, c - 1, stones, broken) && isBank(r, c + 1, stones, broken);
  };

  const DIRS = [[-1, 0, 'v'], [1, 0, 'v'], [0, -1, 'h'], [0, 1, 'h']];

  function nextStates(state) {
    const [pos, stonesStr, maskStr, brokenStr, litStr, lockedStr, colorStr] = state.split('|');
    const [pr, pc] = pos.split(',').map(Number);
    const stones = stonesStr ? stonesStr.split(';') : [];
    const mask = Number(maskStr);
    const broken = Number(brokenStr);
    const lit = Number(litStr);
    const color = Number(colorStr) || 0;
    // ロックは単調増加＝一度全ボタンに石が乗ったら以後ずっと立つ（実ゲームと同じ）。
    const locked = (Number(lockedStr) || allButtonsOnStones(stones)) ? 1 : 0;
    const open = openGatesOf(pr, pc, stones, mask, locked);
    const out = [];
    // 後継状態のロックは「今ロック済み or その配置で全ボタンに石が乗った」＝正規化
    // （同じ石配置なのに locked 0/1 の2キーに割れると状態数と最短解本数が狂う）。
    const enc = (npr, npc, nstones, nmask, nbroken, nlit, ncolor = color) =>
      encode(npr, npc, nstones, nmask, nbroken, nlit,
        (locked || allButtonsOnStones(nstones)) ? 1 : 0, ncolor);

    // Y を叩く（隣接・剣）。プレイヤーは動かない。
    for (const [dr, dc] of DIRS) {
      const i = toggleCells.indexOf(`${pr + dr},${pc + dc}`);
      if (i >= 0) out.push(enc(pr, pc, stones, mask ^ (1 << i), broken, lit));
    }

    // 色スイッチ '['/']' を剣で叩く（隣接）。activeColor を**セット**（トグルではない）
    // ∴同じ色を叩き直す遷移は出さない（状態が増えるだけで意味が無い）。
    // 閉じる側のゲートに石が乗っていたら不発（colorSwitchBlocked＝§3-2e 再設計）。
    for (const [dr, dc] of DIRS) {
      const hit = colorCells.find(([cell]) => cell === `${pr + dr},${pc + dc}`);
      if (hit && hit[1] !== color && !colorSwitchBlocked(hit[1], stones)) out.push(enc(pr, pc, stones, mask, broken, lit, hit[1]));
    }

    // 弓: 4方向へ矢を飛ばす。WALL/未破壊'!'で止まる。途中の 'Y' に当たるとトグル。
    // 色スイッチに当たれば activeColor をセット（矢/ビームも setActiveColor を呼ぶ＝
    // 実エンジン projectile.js:501。これを落とすと「遠くから色を変える」手を見落とす）。
    if (!noTools) for (const [dr, dc] of DIRS) {
      let rr = pr + dr, cc = pc + dc;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
        const ch = tiles[rr][cc];
        const yi = toggleCells.indexOf(`${rr},${cc}`);
        if (yi >= 0) { out.push(enc(pr, pc, stones, mask ^ (1 << yi), broken, lit)); break; }
        const ci = colorCells.find(([cell]) => cell === `${rr},${cc}`);
        if (ci) {
          if (ci[1] !== color && !colorSwitchBlocked(ci[1], stones)) out.push(enc(pr, pc, stones, mask, broken, lit, ci[1]));
          break;   // 矢は色スイッチに当たって消える（貫通しない）
        }
        if (ch === TILE.WALL) break;
        if (ch === TILE.BREAKABLE_WALL) {
          const bi = breakCells.indexOf(`${rr},${cc}`);
          if (bi < 0 || (broken & (1 << bi)) === 0) break;   // 未破壊は矢を止める
        }
        rr += dr; cc += dc;
      }
    }

    // 爆弾: プレイヤーのセルに置き、AOE 半径2円内の未破壊 '!'（breakDef<=3）を壊す。
    if (!noTools && breakCells.length) {
      let nb = broken;
      breakCells.forEach((cell, i) => {
        const [br, bc] = cell.split(',').map(Number);
        if (Math.sqrt((br - pr) ** 2 + (bc - pc) ** 2) <= 2 && (breakDefs[cell] ?? 1) <= 3) nb |= (1 << i);
      });
      if (nb !== broken) out.push(enc(pr, pc, stones, mask, nb, lit));
    }

    // ブーメラン: 火元があれば、4方向へ飛ばして通過した 'H' を点ける。
    // 実エンジンは炎を1本運ぶが、ソルバーでは「その方向の直線上の H を全部点ける」＝
    // プレイヤーが順に投げ分ければ到達できるので、単調増加の上界として安全。
    const anyLit = torchCells.some((_, i) => lit & (1 << i));
    if (!noTools && anyLit) {
      for (const [dr, dc] of DIRS) {
        let rr = pr + dr, cc = pc + dc, nl = lit;
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const ch = tiles[rr][cc];
          if (ch === TILE.WALL) break;
          if (ch === TILE.BREAKABLE_WALL) {
            const bi = breakCells.indexOf(`${rr},${cc}`);
            if (bi < 0 || (broken & (1 << bi)) === 0) break;
          }
          const ti = torchCells.indexOf(`${rr},${cc}`);
          if (ti >= 0) nl |= (1 << ti);
          rr += dr; cc += dc;
        }
        if (nl !== lit) out.push(enc(pr, pc, stones, mask, broken, nl));
      }
    }

    // 移動・石押し・はしご渡り。
    for (const [dr, dc, axis] of DIRS) {
      const nr = pr + dr, nc = pc + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const si = stones.indexOf(`${nr},${nc}`);
      if (si >= 0) {
        if (locked) continue;   // ロック後は石を押せない（石は壁と同じ通行不可のまま）
        const sr = nr + dr, sc = nc + dc;
        if (!passableFor(sr, sc, stones, open, broken, { forStone: true }, color)) continue;
        if (stones.includes(`${sr},${sc}`)) continue;
        // 2026-08-02: 実エンジンと同じ規則＝押した後にプレイヤーが入る「石の元セル」の
        // 下地が閉じていたら押せない。これが無いと「閉じた門の中に立って石を押し出す」
        // 実エンジンのバグ挙動を前提に L を測ってしまう（Phase 5-1 の色ゲート合成盤面が
        // 実際にそれで成立していた＝撤回）。押し先は通常の通行判定（passableFor＝開いた門は
        // 通れる）に任せる＝**開いた門へ石を押し込むのは正当**（廊下C3 がその設計）。
        if (!underOpen(nr, nc, open, color)) continue;
        const ns = stones.slice();
        ns[si] = `${sr},${sc}`;
        out.push(enc(nr, nc, ns, mask, broken, lit));
        continue;
      }
      if (bg[nr][nc] === W) {
        if (canLadderCross(nr, nc, axis, stones, broken))
          out.push(enc(nr, nc, stones, mask, broken, lit));
        continue;
      }
      if (!passableFor(nr, nc, stones, open, broken, { forStone: false }, color)) continue;
      out.push(enc(nr, nc, stones, mask, broken, lit));
    }
    return out;
  }

  // 画面から出られる外周セル（陸で、隣画面へ抜ける口）。
  const exitCells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!isRing(r, c)) continue;
    if (bg[r][c] === W) continue;
    if (isHardBlocked(tiles[r][c])) continue;
    exitCells.push(`${r},${c}`);
  }

  return { initStones, litInitMask, encode, nextStates, exitCells, toggleCells, stoneKeys, buttons, breakCells, torchCells, colorCells };
}
