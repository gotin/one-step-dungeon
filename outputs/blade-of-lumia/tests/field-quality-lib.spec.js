import { test, expect } from '@playwright/test';
import {
  screenAxes, duplicateLayoutGroups, duplicateLayoutScreenCount,
  regionOf, battleScore, underTwoAxisScreens, fieldHonestMetrics,
  regionDensityMetrics, regionBattleScores, structuralSimilarityWarnings,
} from '../scripts/lib/field-quality.mjs';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';

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

  // 2026-07-27 深洋O 廊下: 潮ゲート '=' は「スイッチで開く水の門」＝解ける障害の
  // 代表そのものなのに GATE_TILES に無く、潮ゲートだけの画面が 0 軸＝素通り判定に
  // なっていた（廊下C1〜C4 は戦闘ゼロ・秘密ゼロの設計なので、これを塞がないと
  // 「作ったのに素通り扱い」になる）。TILE 定数から引いて手書きの取り違えも防ぐ。
  test('潮ゲート(=)は obstacle 軸（スイッチで開く水の門＝解ける障害）', () => {
    expect(screenAxes(screen([{ r: 4, c: 4, ch: TILE.TIDE_GATE }])).has('obstacle')).toBe(true);
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

  // 2026-07-27 深洋O 廊下: 「グループ数」を天井にしていた穴。廊下の封鎖で外周に
  // 'M' を足したら、同一だった 37枚の塗り絵グループが「足した壁の形が違う」だけで
  // 21+4+4+3… に**分裂**し、groups 7→13 に増えた。内側の塗り絵は 1マスも変わって
  // いないのに指標が悪化する＝「作り込みを進めるほど dup が増える」誤った圧力。
  // 実態を表すのは「重複に巻き込まれている画面数」（64→59 と正しく減る）。
  // グループ数は分裂で増減するので天井に使えない。
  test('duplicateLayoutScreenCount — 分裂しても重複画面数は増えない（グループ数は増える）', () => {
    const withWall = (cells) => {
      const s = screen([{ r: 4, c: 4, ch: 't' }]);
      for (const [r, c] of cells) s.tiles[r][c] = 'M';
      return s;
    };
    // 4枚すべて中身は同一の塗り絵。外周の壁（＝封鎖の形）だけ違う。
    const split = { layers: { field: { stages: {
      '0,0': withWall([[0, 3]]), '1,0': withWall([[0, 3]]),
      '2,0': withWall([[9, 3]]), '3,0': withWall([[9, 3]]),
    } } } };
    const same = { layers: { field: { stages: {
      '0,0': withWall([]), '1,0': withWall([]),
      '2,0': withWall([]), '3,0': withWall([]),
    } } } };
    // グループ数は分裂で 1→2 に増える（＝天井にすると偽の悪化になる）。
    expect(duplicateLayoutGroups(same).length).toBe(1);
    expect(duplicateLayoutGroups(split).length).toBe(2);
    // 画面数は 4 のまま（＝作り込みが進んでいないことを正しく表す）。
    expect(duplicateLayoutScreenCount(same)).toBe(4);
    expect(duplicateLayoutScreenCount(split)).toBe(4);
  });
});

// ── ゲートの奥を指標から消さない（2026-07-27）─────────────────────────────────
// 深洋O 廊下に潮ゲート '=' を置いたら under-2-axis が 101→83 に「改善」した。中身は
// 悪化していない — bfsLayer の reached は解けるゲートを通らないので、ゲートの奥の
// 17画面が reached から落ち、素通り画面としてカウントされなくなっただけだった。
// これを許すと「未完成の画面をゲートで封じれば指標が良くなる」＝最悪の抜け道になる。
// ∴ 「2軸を満たすべき画面」の母集団は **ゲートを開けた到達集合**（findOrphanRooms が
// 使っているのと同じ、solvable gate を開と見る到達性）で取る。
test.describe('field-quality — ゲートの奥も指標に残る', () => {
  // 2画面: 入口 0,0 の南辺 → 1画面南 0,1。0,1 は素通りの塗り絵。
  // 境界に潮ゲートを置いて「ゲートの奥」にする。
  function gatedPair({ gate }) {
    const open = (s) => {
      for (let c = 1; c <= 10; c++) { s.tiles[0][c] = '.'; s.tiles[9][c] = '.'; }
      return s;
    };
    const entry = open(screen([{ r: 4, c: 4, ch: 't' }, { r: 5, c: 5, ch: 'u' }]));
    const behind = open(screen());          // 0 軸の塗り絵（素通り）
    if (gate) entry.tiles[9][5] = TILE.TIDE_GATE;   // 南へ出る唯一の口を潮ゲートで封じる
    for (let c = 1; c <= 10; c++) if (c !== 5) { entry.tiles[9][c] = '#'; behind.tiles[0][c] = c === 5 ? '.' : '#'; }
    entry.tiles[9][5] = gate ? TILE.TIDE_GATE : '.';
    behind.tiles[0][5] = '.';
    return { startPos: { stage: '0,0', row: 1, col: 1 }, layers: { field: { stages: { '0,0': entry, '0,1': behind } } } };
  }

  test('ゲート無しなら奥の塗り絵は素通り画面として数えられる（対照）', () => {
    const keys = underTwoAxisScreens(gatedPair({ gate: false })).map((u) => u.key);
    expect(keys).toContain('0,1');
  });

  test('潮ゲートで封じても奥の塗り絵は素通り画面のまま（ゲートで隠せない）', () => {
    const keys = underTwoAxisScreens(gatedPair({ gate: true })).map((u) => u.key);
    expect(keys).toContain('0,1');
  });

  test('fieldHonestMetrics は「ゲートを開けた到達集合」も返す', () => {
    const m = fieldHonestMetrics(gatedPair({ gate: true }));
    expect(m.reached.has('0,1')).toBe(false);          // 厳密到達（ゲート閉）には入らない
    expect(m.reachedWithGates.has('0,1')).toBe(true);  // ゲートを開ければ到達できる
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
  // Grassland is split into sub-regions G0..G7 by corridor destination.
  // raw ZONE_MAP[10][4]='G' → stageKey "4,10" now maps to a sub-region (G2).
  test('草原 4,10 は G サブ地域(G2)', () => expect(regionOf('4,10')).toBe('G2'));
  test('草原サブ地域は G で始まる', () => expect(regionOf('4,10').startsWith('G')).toBe(true));
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

// ── 敵表の単一ソース（2026-07-25）──────────────────────────────────────────
// _THREAT / ELITE_TILES / ENEMY_TILES はすべて shared/enemies.js の ENEMY_META
// 由来。手書きの表だった頃、Phase 9-6 の海棲雑魚 & < / が漏れて深洋 25 画面が
// threat 0＝「敵がいない」と判定されていた。同じ穴が二度開かないよう
// 「ENEMY_META に敵を足したら自動でここに現れる」ことを敵ごとに固定する。
test.describe('field-quality — 敵表は ENEMY_META 由来', () => {
  const entries = Object.entries(ENEMY_META);

  test(`ENEMY_META の全 ${entries.length} 種が battleScore に計上される`, () => {
    const missing = entries
      .filter(([tile]) => battleScore(screen([{ r: 4, c: 4, ch: tile }]), 'G') <= 0)
      .map(([tile]) => tile);
    expect(missing).toEqual([]);
  });

  test('threat は hp*atk/(def+1)＝敵ごとの score 比が能力値比と一致する', () => {
    // battleScore = threat / expectedPower（敵1体なら体数倍率は ×1）∴同じ地域なら
    // score の比 = threat の比。基準を PATROL(E) に取って全敵で突き合わせる。
    const base = battleScore(screen([{ r: 4, c: 4, ch: 'E' }]), 'G');
    const baseThreat = ENEMY_META['E'].hp * ENEMY_META['E'].atk / ((ENEMY_META['E'].def ?? 0) + 1);
    for (const [tile, m] of entries) {
      const threat = m.hp * m.atk / ((m.def ?? 0) + 1);
      const score = battleScore(screen([{ r: 4, c: 4, ch: tile }]), 'G');
      expect(score / base, `threat ratio for ${tile} (${m.name})`)
        .toBeCloseTo(threat / baseThreat, 6);
    }
  });

  test('ボスは1体で combat 軸を立てる（精鋭＝ELITE_TILES も ENEMY_META 由来）', () => {
    const bosses = entries.filter(([, m]) => m.isBoss).map(([tile]) => tile);
    expect(bosses.length).toBeGreaterThan(0);
    for (const tile of bosses) {
      expect(screenAxes(screen([{ r: 4, c: 4, ch: tile }])).has('combat'), `boss ${tile}`).toBe(true);
    }
  });

  test('雑魚は1体だけでは combat 軸を立てない（センチネル F は精鋭扱い）', () => {
    const mobs = entries.filter(([tile, m]) => !m.isBoss && tile !== 'F').map(([tile]) => tile);
    for (const tile of mobs) {
      expect(screenAxes(screen([{ r: 4, c: 4, ch: tile }])).has('combat'), `mob ${tile}`).toBe(false);
    }
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
    // 4,2 and 5,2 are both grassland sub-region G1
    const mapData = makeMap({ '4,2': s1, '5,2': s2 });
    const density = regionDensityMetrics(mapData);
    const g = density.get('G1');
    expect(g).toBeDefined();
    expect(g.puzzle).toBeGreaterThanOrEqual(1);
  });

  // 2026-07-27: 潮ゲートは screenAxes だけでなく密度検査（§18 の「地域あたり
  // パズル画面3枚」目標）にも計上されないと、廊下4枚を作っても深洋O のパズル密度が
  // 上がらない＝目標未達の見落としになる。
  test('regionDensityMetrics — 潮ゲート(=)だけの画面もパズル密度に計上される', () => {
    const s = screen([{ r: 4, c: 4, ch: TILE.TIDE_GATE }]);
    for (let c = 1; c <= 10; c++) { s.tiles[0][c] = '.'; s.tiles[9][c] = '.'; }
    for (let r = 1; r <= 8; r++) { s.tiles[r][0] = '.'; s.tiles[r][11] = '.'; }
    const density = regionDensityMetrics(makeMap({ '4,2': s }));
    expect(density.get('G1').puzzle).toBe(1);
  });

  // 手書きの敵表が二度目の穴を開けていた: _COMBAT_SHOWPIECE（1体で戦闘画面と
  // 数える精鋭）に海の主 '{' が無く、ボス部屋がボス部屋と数えられなかった。
  // ENEMY_META 由来にして「ボスを足したら自動で入る」ことを全ボスで固定する。
  test('regionDensityMetrics — ENEMY_META の全ボスが1体で戦闘画面に数えられる', () => {
    const bosses = Object.entries(ENEMY_META).filter(([, m]) => m.isBoss).map(([t]) => t);
    const missing = [];
    for (const tile of bosses) {
      const s = screen([{ r: 4, c: 4, ch: tile }]);
      for (let c = 1; c <= 10; c++) { s.tiles[0][c] = '.'; s.tiles[9][c] = '.'; }
      for (let r = 1; r <= 8; r++) { s.tiles[r][0] = '.'; s.tiles[r][11] = '.'; }
      if (regionDensityMetrics(makeMap({ '4,2': s })).get('G1').combat !== 1) missing.push(tile);
    }
    expect(missing).toEqual([]);
  });

  test('regionBattleScores — 戦闘画面が分布に含まれる', () => {
    const s = screen([{ r: 4, c: 4, ch: 'F' }]); // sentry = elite
    for (let c = 1; c <= 10; c++) { s.tiles[0][c] = '.'; s.tiles[9][c] = '.'; }
    for (let r = 1; r <= 8; r++) { s.tiles[r][0] = '.'; s.tiles[r][11] = '.'; }
    const mapData = makeMap({ '4,2': s });
    const b = regionBattleScores(mapData);
    const g = b.get('G1');
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
    // 4,2 and 5,2 are both grassland sub-region G1
    const mapData = makeMap({ '4,2': s2axis(), '5,2': s2axis() });
    const warn = structuralSimilarityWarnings(mapData, { threshold: 0.99 });
    expect(warn.length).toBeGreaterThanOrEqual(1);
    expect(warn[0].similarity).toBeCloseTo(1.0, 2);
  });
});
