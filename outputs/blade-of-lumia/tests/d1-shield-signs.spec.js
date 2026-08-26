import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { bfsLayer, findEntrances, firstWalkable } from '../scripts/lib/connectivity.mjs';
import { ENEMY_META } from '../shared/enemies.js';

// 2026-08-26：W 魔物の実プレイ判定で挙がった「盾がない状態はかなりきつい」への対処＝
// 【A 配置は動かさず、立札で盾の在処と「先に取れ」を示す】（PLAN 8-4 (4) の W の記録）。
// この本が守るのは文面ではなく**構造**＝「木の盾は W に会う前に必ず通る部屋にあり、
// そこへ至る強制経路の全部屋に本文つきの立札が立っている」。
// ⚠️ 部屋・敵・宝箱はすべて実マップと ENEMY_META から**導出**する（タイル文字や部屋キーを
//    手書きしない）＝D1 の地形を作り替えたら、新しい強制経路に対して自動で赤くなる。

const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
const LAYER = 'dungeon_1';
const stages = MAP.layers[LAYER].stages;
const ENTRANCE = findEntrances(MAP, LAYER)[0];

/** 部屋 k のタイルに現れる敵文字の集合 */
function enemyCharsOf(stage) {
  const out = new Set();
  for (const row of stage.tiles) for (const ch of row) if (ENEMY_META[ch]) out.add(ch);
  return out;
}

/** 木の盾（shieldTier 0）の宝箱がある部屋 */
const shieldRooms = Object.entries(stages)
  .filter(([, s]) => Object.values(s.chestContents || {})
    .some((v) => v?.type === 'shield' && v.shieldTier === 0))
  .map(([k]) => k);

/** 中ボスの部屋＝`isBoss` の敵が居るがボス部屋ではない部屋（D1 では W 魔物） */
const midBossRooms = Object.entries(stages)
  .filter(([, s]) => !s.isBossRoom && [...enemyCharsOf(s)].some((ch) => ENEMY_META[ch].isBoss))
  .map(([k]) => k);

/** 入口から target に至るのに必ず通る部屋（塞ぐと target が到達不能になる部屋） */
function mandatoryRoomsTo(target) {
  return Object.keys(stages).filter((k) => {
    if (k === ENTRANCE || k === target) return false;
    const { reachedRooms } = bfsLayer(stages, { stage: ENTRANCE, ...firstWalkable(stages[ENTRANCE]) },
      { blockedRoom: k });
    return !reachedRooms.has(target);
  });
}

test.describe('Blade of Lumia – D1 木の盾の道しるべ（W 戦の前に盾を拾わせる）', () => {
  test('① 木の盾は D1 に1つだけ・中ボス（W）の部屋はその部屋を塞ぐと全部到達不能', () => {
    expect(shieldRooms).toHaveLength(1);
    expect(midBossRooms.length).toBeGreaterThan(0);
    const shieldRoom = shieldRooms[0];
    const { reachedRooms } = bfsLayer(stages, { stage: ENTRANCE, ...firstWalkable(stages[ENTRANCE]) },
      { blockedRoom: shieldRoom });
    for (const k of midBossRooms) expect(reachedRooms.has(k), `${k} が盾の部屋を経ずに到達できる`).toBe(false);
  });

  test('② 入口から盾の部屋までの強制経路の全部屋に、本文つきの立札が立っている', () => {
    const shieldRoom = shieldRooms[0];
    const route = [ENTRANCE, ...mandatoryRoomsTo(shieldRoom), shieldRoom];
    for (const k of route) {
      const s = stages[k];
      const signs = Object.entries(s.signData || {});
      const bodies = signs.filter(([, sd]) => Array.isArray(sd?.lines) && sd.lines.length > 0);
      expect(bodies.length, `${k} に本文つきの立札が無い`).toBeGreaterThan(0);
      // 本文つきなら 'i' タイルとして実際に読める位置にあること
      for (const [pk] of bodies) {
        const [r, c] = pk.split(',').map(Number);
        expect(s.tiles[r][c], `${k} @${pk} が 'i' でない`).toBe('i');
      }
    }
  });

  test('③ 強制経路の立札は「盾」と方角に触れている＝在処が読み取れる', () => {
    const shieldRoom = shieldRooms[0];
    const route = [ENTRANCE, ...mandatoryRoomsTo(shieldRoom), shieldRoom];
    const text = route
      .flatMap((k) => Object.values(stages[k].signData || {}))
      .flatMap((sd) => (Array.isArray(sd?.lines) ? sd.lines : []))
      .join('\n');
    expect(text).toMatch(/盾/);
    expect(text, '方角が書かれていない＝「こっちにある」が伝わらない').toMatch(/[北南東西]/);
  });
});
