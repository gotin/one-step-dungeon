// tests/solver-tiles-water-ladder.spec.js
// 実行キュー21 F14（2026-10-11）: solver は tiles 層の水 '~' もはしごで渡す（実エンジンと同じ）。
//
// 実エンジン（game/passable.js LADDER_OVER）は、水が tiles 層にあっても bgTiles 層にあっても
// 幅1ならはしごで渡す。旧 solver は bgTiles の水しか見ておらず、D5 [1,0]（鍵の部屋）を
// 「はしごがあっても解なし」と誤判定した＝通しプレイで実機では鍵が取れたのに solver は否と言った。
// パズル検証を solver に頼る方針（[[blade-puzzle-must-verify-with-solver]]）なので、偽の
// 「解なし」は検証そのものを誤らせる。
//
// 盤面: Y①(4,8) は水(3,9)、Y②(8,8) は水(7,9) で隔離され、どちらも水の対岸からしか叩けない
// （部屋の comment どおり）。この水は tiles 層の '~'。
//   はしご無し → 2つとも叩けない（解なし）
//   はしご有り → 2つとも叩ける
// 歯の確認: isGap から tiles 層の '~' を外すと「はしご有り」が null になって赤（2026-10-11 実施）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { makeSolver, ROWS, COLS } from '../scripts/lib/blade-solver.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

function loadRoom(layer, key) {
  const st = map.layers[layer].stages[key];
  const tiles = st.tiles.map((row) => row.slice());
  const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
  for (const [k, ch] of Object.entries(st.bgTiles ?? {})) {
    const [r, c] = k.split(',').map(Number);
    bg[r][c] = ch;
  }
  const linkMap = new Map();
  for (const { switchId, gateId } of st.links ?? []) {
    if (!linkMap.has(switchId)) linkMap.set(switchId, []);
    linkMap.get(switchId).push(gateId);
  }
  return { st, tiles, bg, links: [...linkMap.entries()] };
}

/** 入口から BFS して、スイッチ2つを両方 ON にできるか（できれば最短手数・できなければ null）。 */
function stepsToBothSwitches(hasLadder) {
  const room = loadRoom('dungeon_5', '1,0');
  const S = makeSolver(room.tiles, room.bg, room.links, {}, new Set(), { hasLadder });
  expect(S.toggleCells.sort()).toEqual(['4,8', '8,8']);
  const start = S.encode(9, 6, S.initStones, 0, 0, S.litInitMask, 0, 0);
  const full = (1 << S.toggleCells.length) - 1;
  const seen = new Set([start]);
  let frontier = [start];
  for (let depth = 0; frontier.length; depth++) {
    const next = [];
    for (const st of frontier) {
      if (Number(st.split('|')[2]) === full) return depth;
      for (const ns of S.nextStates(st)) {
        if (!seen.has(ns)) { seen.add(ns); next.push(ns); }
      }
    }
    frontier = next;
  }
  return null;
}

test.describe('キュー21 F14 – solver は tiles 層の水もはしごで渡す', () => {
  test('前提: D5 [1,0] のスイッチを隔てる水は tiles 層の「~」', () => {
    const { tiles } = loadRoom('dungeon_5', '1,0');
    expect(tiles[3][9]).toBe('~');
    expect(tiles[7][9]).toBe('~');
  });

  test('はしご無しではスイッチ2つを両方叩けない', () => {
    expect(stepsToBothSwitches(false)).toBeNull();
  });

  test('はしご有りならスイッチ2つを両方叩ける（実機で鍵が取れたのと一致）', () => {
    expect(stepsToBothSwitches(true)).not.toBeNull();
  });
});
