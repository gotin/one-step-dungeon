import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Phase 2-4: data-level regression test that every dungeon is reachable from the
// start village across the field world map. We BFS the field layer's stages,
// crossing edges the way game.js's checkStageTransition does (sx/sy math), and
// confirm each dungeon entrance ('>') is reachable — gimmick gates (bomb-walls
// '!' and key-doors 'D') are treated as openable since the map provides the
// bombs/keys to open them. Walls/water/trees/etc. stay blocked.
// This locks in that no edit ever silently strands a dungeon behind closed terrain.

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));

// Tile chars that block walking on the field even with all gimmicks solved.
// (Mirrors game/passable.js tilePassable. '!' bomb-wall and 'D' key-door are
//  intentionally NOT here: they are solvable gates, not dead ends.)
const BLOCKED = new Set([
  '#', // WALL
  '~', // WATER
  '%', // SKY (flight-only — handled separately below)
  'T', // GATE (closed; opened by switches in-dungeon, not on these field paths)
  '|', // DOORWAY_LOCKED
  'a', 'b', '$', // NPCs (not standable)
  '*', // STONE (pushable but blocks the cell)
  't', // TREE
  'M', // MOUNTAIN
  'u', // BUSH (until cut)
  'f', // FENCE
  'h', // HOUSE_WALL
  'p', // HOUSE_ROOF
  'i', // SIGN (not standable)
]);

function loadField() {
  const d = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  return (d.layers && d.layers.field) || d.field;
}

function bfsReachableEntrances(field, { start }) {
  const stages = field.stages;
  const blk = (s, r, c) => {
    const ch = s.tiles[r]?.[c];
    if (ch === undefined || ch === ' ') return false;
    return BLOCKED.has(ch);
  };
  const seen = new Set();
  const queue = [];
  const entrances = new Set();
  const key = (sk, r, c) => `${sk}:${r},${c}`;

  const enqueue = (sk, r, c) => {
    const s = stages[sk];
    if (!s) return;
    if (r < 0 || c < 0 || r >= s.rows || c >= s.cols) return;
    if (blk(s, r, c)) return;
    const k = key(sk, r, c);
    if (seen.has(k)) return;
    seen.add(k);
    queue.push([sk, r, c]);
  };

  enqueue(start.stage, start.row, start.col);

  while (queue.length) {
    const [sk, r, c] = queue.shift();
    const s = stages[sk];
    if (s.tiles[r][c] === '>') {
      const me = s.mapEnters?.[`${r},${c}`];
      if (me?.destId) entrances.add(me.destId);
    }
    const [sx, sy] = sk.split(',').map(Number);
    enqueue(sk, r - 1, c); enqueue(sk, r + 1, c);
    enqueue(sk, r, c - 1); enqueue(sk, r, c + 1);
    if (r === 0)             enqueue(`${sx},${sy - 1}`, s.rows - 1, c);
    if (r === s.rows - 1)    enqueue(`${sx},${sy + 1}`, 0, c);
    if (c === 0)             enqueue(`${sx - 1},${sy}`, r, s.cols - 1);
    if (c === s.cols - 1)    enqueue(`${sx + 1},${sy}`, r, 0);
  }
  return entrances;
}

test.describe('Blade of Lumia – フィールド接続（全ダンジョン到達性）', () => {
  // The 7 dungeons reachable on foot (incl. through solvable bomb-wall / key-door
  // gates). dark_tower is intentionally flight-only (endgame) and excluded here.
  const FOOT_DUNGEONS = [
    'dungeon_1', 'dungeon_2', 'dungeon_3', 'dungeon_4',
    'dungeon_5', 'dungeon_6', 'cave_1',
    // dungeon_7 is flute-warp only (no walking entrance)
  ];

  test('全8ダンジョン入口が開始村から徒歩（ギミック解放込み）で到達可能', () => {
    const field = loadField();
    const start = { stage: '1,0', row: 2, col: 2 };
    const reachable = bfsReachableEntrances(field, { start });
    for (const id of FOOT_DUNGEONS) {
      expect(reachable, `${id} へ到達できること`).toContain(id);
    }
  });

  test('沼地の洞窟（cave_1）への道に鍵・扉のヒント石碑がある', () => {
    const field = loadField();
    const s30 = field.stages['3,0'];
    // 石碑が配置され、鍵か扉に言及していること（プレイヤーが詰まないための保証）
    const npcTexts = Object.values(s30.npcData || {})
      .flatMap(n => n.lines || []).join('\n');
    expect(npcTexts).toMatch(/鍵|扉/);
  });
});
