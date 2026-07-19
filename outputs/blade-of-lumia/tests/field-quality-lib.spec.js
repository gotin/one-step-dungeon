import { test, expect } from '@playwright/test';
import {
  screenAxes, duplicateLayoutGroups,
  regionOf, battleScore,
  regionDensityMetrics, regionBattleScores, structuralSimilarityWarnings,
} from '../scripts/lib/field-quality.mjs';

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

test.describe('field-quality — regionOf', () => {
  // ZONE_MAP[row][col] → stageKey "col,row"
  // Village V is at col7,row14 → stageKey 7,14 (V in raw ZONE) → draft reassigns V (SPECIAL) unchanged
  test('村 V ゾーン 7,14 は V', () => expect(regionOf('7,14')).toBe('V'));
  // Forest F: raw ZONE_MAP[3][0]='F' → stageKey "0,3"
  test('森 F ゾーン 0,3 は F', () => expect(regionOf('0,3')).toBe('F'));
  // Desert D: raw ZONE_MAP[12][0]='D' → stageKey "0,12"
  test('砂漠 D ゾーン 0,12 は D', () => expect(regionOf('0,12')).toBe('D'));
  // Grassland: raw ZONE_MAP[10][4]='G' → stageKey "4,10"
  test('草原 G ゾーン 4,10 は G', () => expect(regionOf('4,10')).toBe('G'));
  test('範囲外は ? を返す', () => expect(regionOf('99,99')).toBe('?'));
});

test.describe('field-quality — battleScore', () => {
  test('敵なし地形ハザードなしは 0', () => {
    const s = screen();
    expect(battleScore(s, 'G')).toBe(0);
  });
  test('パトロール E 1体は > 0', () => {
    const s = screen([{ r: 4, c: 4, ch: 'E' }]);
    expect(battleScore(s, 'G')).toBeGreaterThan(0);
  });
  test('同じ敵でも想定戦力の高い地域ほど score が低い', () => {
    const s = screen([{ r: 4, c: 4, ch: 'E' }]);
    const scoreD = battleScore(s, 'D'); // expectedPower 2
    const scoreF = battleScore(s, 'F'); // expectedPower 5
    expect(scoreD).toBeGreaterThan(scoreF);
  });
});

test.describe('field-quality — 3検査（smoke）', () => {
  function makeMap(stages) {
    // Minimal mapData: startPos must point to an existing stage so BFS can walk it.
    const firstKey = Object.keys(stages)[0];
    return {
      startPos: { stage: firstKey, row: 1, col: 1 },
      layers: { field: { stages } },
    };
  }

  test('regionDensityMetrics — パズル(T=gate)を含む画面が密度に計上される', () => {
    const s1 = screen([{ r: 4, c: 4, ch: 'T' }, { r: 5, c: 5, ch: 'E' }]);
    s1.showConditions = { '5,5': { trigger: 'killAll' } }; // combat axis
    // Open 3 edges for connectivity
    for (let c = 1; c <= 10; c++) { s1.tiles[0][c] = '.'; s1.tiles[9][c] = '.'; }
    for (let r = 1; r <= 8; r++) { s1.tiles[r][0] = '.'; s1.tiles[r][11] = '.'; }
    const s2 = screen([{ r: 4, c: 4, ch: 't' }]);
    for (let c = 1; c <= 10; c++) { s2.tiles[0][c] = '.'; s2.tiles[9][c] = '.'; }
    // 4,10 and 5,10 are both 'G' zone
    const mapData = makeMap({ '4,10': s1, '5,10': s2 });
    const density = regionDensityMetrics(mapData);
    const g = density.get('G');
    expect(g).toBeDefined();
    expect(g.puzzle).toBeGreaterThanOrEqual(1);
  });

  test('regionBattleScores — 戦闘画面が分布に含まれる', () => {
    const s = screen([{ r: 4, c: 4, ch: 'F' }]); // sentry = elite
    for (let c = 1; c <= 10; c++) { s.tiles[0][c] = '.'; s.tiles[9][c] = '.'; }
    for (let r = 1; r <= 8; r++) { s.tiles[r][0] = '.'; s.tiles[r][11] = '.'; }
    const mapData = makeMap({ '4,10': s });
    const b = regionBattleScores(mapData);
    const g = b.get('G');
    expect(g).toBeDefined();
    expect(g.scores.some(v => v > 0)).toBe(true);
  });

  test('structuralSimilarityWarnings — 完全一致画面は類似度 1.0 で検出', () => {
    // Two identical 2-axis screens in the same region
    function s2axis() {
      const s = screen([{ r: 4, c: 4, ch: 'T' }, { r: 5, c: 5, ch: 'u' }]);
      for (let c = 1; c <= 10; c++) { s.tiles[0][c] = '.'; s.tiles[9][c] = '.'; }
      for (let r = 1; r <= 8; r++) { s.tiles[r][0] = '.'; s.tiles[r][11] = '.'; }
      return s;
    }
    // 4,10 and 5,10 are both 'G' zone (ZONE_MAP[10][4]='G', ZONE_MAP[10][5]='G')
    const mapData = makeMap({ '4,10': s2axis(), '5,10': s2axis() });
    const warn = structuralSimilarityWarnings(mapData, { threshold: 0.99 });
    expect(warn.length).toBeGreaterThanOrEqual(1);
    expect(warn[0].similarity).toBeCloseTo(1.0, 2);
  });
});
