import { test, expect } from '@playwright/test';
import { screenAxes, duplicateLayoutGroups } from '../scripts/lib/field-quality.mjs';

// Phase 9-6 設計④: like connectivity-tool.spec.js, the axis-inference rules ARE
// the invariant, so the rules themselves must be tested against hand-built
// fixtures with KNOWN axis content. Otherwise "the ratchet passed" means nothing.

// Build a 10x12 field screen: all floor, walls on the border, then stamp tiles.
function screen(stamp = [], extra = {}) {
  const rows = 10, cols = 12;
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    const line = [];
    for (let c = 0; c < cols; c++) {
      const border = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      line.push(border ? '#' : '.');
    }
    tiles.push(line);
  }
  for (const { r, c, ch } of stamp) tiles[r][c] = ch;
  return { rows, cols, tiles, mapEnters: {}, showConditions: {}, ...extra };
}

test.describe('field-quality — screenAxes inference', () => {
  test('空の床画面は 0 軸（素通り＝作り替え対象）', () => {
    expect([...screenAxes(screen())]).toEqual([]);
  });

  test('敵を置いただけ（意味なし）は combat 軸を得ない', () => {
    // A lone patrol 'E' with no elite / killAll / chest = 素通り.
    const axes = screenAxes(screen([{ r: 4, c: 4, ch: 'E' }]));
    expect(axes.has('combat')).toBe(false);
    expect(axes.size).toBeLessThan(2);
  });

  test('敵＋killAll封印宝箱は combat 軸を得る', () => {
    const s = screen([{ r: 4, c: 4, ch: 'E' }, { r: 5, c: 5, ch: 'B' }]);
    s.showConditions = { '5,5': { trigger: 'killAll' } };
    expect(screenAxes(s).has('combat')).toBe(true);
  });

  test('精鋭(F)がいれば宝箱なしでも combat 軸', () => {
    expect(screenAxes(screen([{ r: 4, c: 4, ch: 'F' }])).has('combat')).toBe(true);
  });

  test('道具ゲート(!爆破壁)は obstacle 軸', () => {
    expect(screenAxes(screen([{ r: 4, c: 4, ch: '!' }])).has('obstacle')).toBe(true);
  });

  test('茂み(u)は secret 軸', () => {
    expect(screenAxes(screen([{ r: 4, c: 4, ch: 'u' }])).has('secret')).toBe(true);
  });

  test('map入口は route 軸', () => {
    const s = screen([{ r: 4, c: 4, ch: '>' }]);
    s.mapEnters = { '4,4': { destId: 'dungeon_9' } };
    expect(screenAxes(s).has('route')).toBe(true);
  });

  test('祭壇(^)は landmark 軸', () => {
    expect(screenAxes(screen([{ r: 4, c: 4, ch: '^' }])).has('landmark')).toBe(true);
  });

  test('2軸を満たす画面（分岐路の水堀＋橋の奥に茂み秘密）', () => {
    // bridge (obstacle) + bush (secret) = 2 axes → passes the invariant.
    const axes = screenAxes(screen([{ r: 4, c: 4, ch: 'v' }, { r: 6, c: 6, ch: 'u' }]));
    expect(axes.has('obstacle')).toBe(true);
    expect(axes.has('secret')).toBe(true);
    expect(axes.size).toBeGreaterThanOrEqual(2);
  });
});

test.describe('field-quality — duplicateLayoutGroups', () => {
  test('同一レイアウト2枚を重複として検出', () => {
    const a = screen([{ r: 4, c: 4, ch: 't' }]);
    const b = screen([{ r: 4, c: 4, ch: 't' }]);
    const map = { layers: { field: { stages: { '0,0': a, '1,0': b } } } };
    const groups = duplicateLayoutGroups(map);
    expect(groups.length).toBe(1);
    expect(groups[0]).toEqual(['0,0', '1,0']);
  });

  test('一様画面（全水など）も重複としてカウントする（B方針＝塗り絵は境界でも作り替え対象）', () => {
    // Two all-water screens ARE a dup: under 全320画面プレイ可能, an all-water
    // border screen is 塗り絵 to rework, not a legitimate identical border.
    const uniform = () => {
      const tiles = Array.from({ length: 10 }, () => Array(12).fill('~'));
      return { rows: 10, cols: 12, tiles };
    };
    const map = { layers: { field: { stages: { '0,0': uniform(), '1,0': uniform() } } } };
    const groups = duplicateLayoutGroups(map);
    expect(groups.length).toBe(1);
    expect(groups[0]).toEqual(['0,0', '1,0']);
  });

  test('レイアウトが違えば重複としない', () => {
    const a = screen([{ r: 4, c: 4, ch: 't' }]);
    const b = screen([{ r: 5, c: 5, ch: 't' }]);
    const map = { layers: { field: { stages: { '0,0': a, '1,0': b } } } };
    expect(duplicateLayoutGroups(map).length).toBe(0);
  });
});
