#!/usr/bin/env node
/**
 * blade-solver.mjs  — 実ゲームの遷移規則を写した状態空間ソルバー（単一ソース）
 *
 * この `makeSolver` は 2 つの用途で **同じ遷移関数** を使うために切り出した：
 *   1. パズル検証（migrate-field-delta-o.mjs の verifyPuzzle）＝「入って詰まない・飾りでない」
 *   2. 難易度測定（measure-puzzle.mjs）＝ PUZZLE-DESIGN §4 の4軸
 * 別実装にすると「測定では難しいが実ゲームでは違う」乖離が起きる∴遷移は1箇所。
 *
 * 状態 = プレイヤー位置 × 石位置 × Yトグルマスク × brokenWalls集合 × litTorches集合。
 * brokenWalls / litTorches は不可逆な単調増加ビットなので状態爆発しない。
 *
 * エンジンから写した規則（ここがズレると「テスト緑・実機で詰む」）:
 *   ・ボタン S はモーメンタリ。ON ⟺ プレイヤー or 石が今その上にいる。
 *   ・Y は武器で叩くトグル。隣接（射程1）から叩ける。踏むのではなく叩く。
 *   ・弓: 向いた方向へ矢が飛ぶ。WALL と未破壊 '!' だけ遮る（水/潮は飛び越える）。
 *     矢が 'Y' に当たるとトグル。プレイヤーは動かない（弓ゲート）。
 *   ・爆弾: プレイヤーのセルに置き、AOE 半径2の円内の未破壊 '!' を壊す（breakDef<=3）。
 *   ・ブーメラン: 向いた方向へ飛び、通過した 'H' に炎を運ぶ（火元→未点灯を点ける）。
 *   ・はしご: 進入軸の幅1水（両隣が陸）を1セルだけ渡れる。
 *   ・潮ゲートは openGates にある時だけ通れる。
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
  const breakCells = [];    // '!' の位置（インデックス＝bit）
  const torchCells = [];    // 'H' の位置（インデックス＝bit）
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = tiles[r][c];
    if (ch === TILE.SWITCH) toggleCells.push(`${r},${c}`);
    if (ch === TILE.STONE) stoneKeys.push(`${r},${c}`);
    if (ch === TILE.BUTTON) buttons.push(`${r},${c}`);
    if (ch === TILE.BREAKABLE_WALL) breakCells.push(`${r},${c}`);
    if (ch === TILE.TORCH) torchCells.push(`${r},${c}`);
  }
  if (toggleCells.length > 6) throw new Error('Y が多すぎる（ビットマスクの上限）');

  const initStones = stoneKeys.map((k) => k);
  // brokenWalls / litTorches はビットマスク。litInit（初期点灯）は最初から立てる。
  const litInitMask = torchCells.reduce((m, cell, i) => (litInit.has(cell) ? m | (1 << i) : m), 0);
  const encode = (pr, pc, stones, mask, broken, lit) =>
    `${pr},${pc}|${stones.join(';')}|${mask}|${broken}|${lit}`;

  const openGatesOf = (pr, pc, stones, mask) => {
    const open = new Set();
    toggleCells.forEach((cell, i) => {
      if (mask & (1 << i)) for (const g of linksBySwitch.get(cell) ?? []) open.add(g);
    });
    const here = `${pr},${pc}`;
    for (const b of buttons) {
      if (b === here || stones.includes(b)) for (const g of linksBySwitch.get(b) ?? []) open.add(g);
    }
    return open;
  };

  // passable.js tilePassable の写し。broken は brokenWalls マスク。
  const passableFor = (r, c, stones, open, broken, { forStone }) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (bg[r][c] === W) return false;                       // 水（bg 単一ソース）
    const ch = tiles[r][c];
    if (ch === TILE.TIDE_GATE) return open.has(`${r},${c}`);
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
    if (ch === TILE.TIDE_GATE) return false;           // 閉じた潮ゲートも橋脚にならない
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
    const [pos, stonesStr, maskStr, brokenStr, litStr] = state.split('|');
    const [pr, pc] = pos.split(',').map(Number);
    const stones = stonesStr ? stonesStr.split(';') : [];
    const mask = Number(maskStr);
    const broken = Number(brokenStr);
    const lit = Number(litStr);
    const open = openGatesOf(pr, pc, stones, mask);
    const out = [];

    // Y を叩く（隣接・剣）。プレイヤーは動かない。
    for (const [dr, dc] of DIRS) {
      const i = toggleCells.indexOf(`${pr + dr},${pc + dc}`);
      if (i >= 0) out.push(encode(pr, pc, stones, mask ^ (1 << i), broken, lit));
    }

    // 弓: 4方向へ矢を飛ばす。WALL/未破壊'!'で止まる。途中の 'Y' に当たるとトグル。
    if (!noTools) for (const [dr, dc] of DIRS) {
      let rr = pr + dr, cc = pc + dc;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
        const ch = tiles[rr][cc];
        const yi = toggleCells.indexOf(`${rr},${cc}`);
        if (yi >= 0) { out.push(encode(pr, pc, stones, mask ^ (1 << yi), broken, lit)); break; }
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
      if (nb !== broken) out.push(encode(pr, pc, stones, mask, nb, lit));
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
        if (nl !== lit) out.push(encode(pr, pc, stones, mask, broken, nl));
      }
    }

    // 移動・石押し・はしご渡り。
    for (const [dr, dc, axis] of DIRS) {
      const nr = pr + dr, nc = pc + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const si = stones.indexOf(`${nr},${nc}`);
      if (si >= 0) {
        const sr = nr + dr, sc = nc + dc;
        if (!passableFor(sr, sc, stones, open, broken, { forStone: true })) continue;
        if (stones.includes(`${sr},${sc}`)) continue;
        const ns = stones.slice();
        ns[si] = `${sr},${sc}`;
        out.push(encode(nr, nc, ns, mask, broken, lit));
        continue;
      }
      if (bg[nr][nc] === W) {
        if (canLadderCross(nr, nc, axis, stones, broken))
          out.push(encode(nr, nc, stones, mask, broken, lit));
        continue;
      }
      if (!passableFor(nr, nc, stones, open, broken, { forStone: false })) continue;
      out.push(encode(nr, nc, stones, mask, broken, lit));
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

  return { initStones, litInitMask, encode, nextStates, exitCells, toggleCells, stoneKeys, buttons, breakCells, torchCells };
}
