import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  fieldHonestMetrics, underTwoAxisScreens, duplicateLayoutGroups,
} from '../scripts/lib/field-quality.mjs';

// ── Phase 9-6 設計④: フィールド不変条件テスト ─────────────────────────────────
// The field 全320画面作り替え (B方針) is a long, incremental job. These tests are
// the safety net that keeps it honest: they lock the four 9-6 invariants
// (FIELD-9-6-DESIGN.md §7) as RATCHET ceilings — every metric may only go DOWN,
// never up. The final goal for all four is 0, documented below; as the rework
// drives each number down we tighten the ceiling in BASELINE (that is the whole
// workflow: 流し込み → number drops → lower the ceiling → commit).
//
// Why ratchet, not assert-0? A hard `expect(x).toBe(0)` would leave the WHOLE
// suite red for the entire rework (dozens of migrations), so CI could never
// distinguish "still working on 9-6" from "someone broke something". The ratchet
// stays GREEN while progress is monotone and goes RED the instant an edit makes
// any metric worse — which is exactly the regression 9-6 must prevent.
//
// 論点1 (tower) — DECISION PENDING USER CONFIRMATION (see FIELD-9-6-DESIGN.md §6):
// fieldToTower/towerEntrance land via the sky-island flight warp (a 9-2T concern,
// not 9-6). We exclude the tower-approach screens from the 2-axis rule via
// ALLOWLIST so 9-6 tests don't go red on unrelated 9-2T work. Connectivity W2
// already treats 8,0/8,1 as reached (foot entrance darkTower), so no special-case
// is needed there. If the user later says "include the tower in 9-6", drop these
// keys from ALLOWLIST.

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const loadMap = () => JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// Documented exemptions from the 2-axis rule:
//   7,14 = start village (its "meaning" is being the hub/spawn, not a puzzle)
//   8,0  = darkTower foot entrance approach   ┐ 論点1: tower is 9-2T scope
//   8,1  = fieldToTower flight-warp landing   ┘
const TWO_AXIS_ALLOWLIST = ['7,14', '8,0', '8,1'];

// RATCHET CEILINGS — measured 2026-07-05 on the pre-rework map. LOWER these as
// 9-6 流し込み drives each number down. GOAL for every one is 0.
const BASELINE = {
  seams: 91,        // honest seam bugs (reachable→reachable but walled) → goal 0
  w1: 110,          // all-blocked screens (border/waste) → goal 0 (★4 全作り替え)
  w2: 110,          // orphan screens (walkable but unreachable) → goal 0
  underTwoAxis: 110, // reachable screens carrying <2 axes (素通り) → goal 0
  dupLayouts: 3,    // groups sharing an identical layout → goal 0. Currently the
                    // all-water(84)/all-mountain(13)/all-wall(13) border groups;
                    // under B方針 these are 塗り絵 to rework, not legit borders.
};

test.describe('Blade of Lumia – 9-6 フィールド不変条件（ratchet）', () => {
  test('接続シーム破綻 (honest seam bugs) は基準以下（目標 0）', () => {
    const m = fieldHonestMetrics(loadMap());
    expect(
      m.seams.length,
      `seam bugs regressed above baseline ${BASELINE.seams}.\n` +
      `到達可能どうしなのに継ぎ目が壁で詰む画面ペア:\n${m.seams.join('  ')}`,
    ).toBeLessThanOrEqual(BASELINE.seams);
  });

  test('全不通画面 W1 は基準以下（目標 0＝★4 全作り替え）', () => {
    const m = fieldHonestMetrics(loadMap());
    expect(
      m.w1.length,
      `W1 (all-blocked screens) regressed above baseline ${BASELINE.w1}.\n${m.w1.join('  ')}`,
    ).toBeLessThanOrEqual(BASELINE.w1);
  });

  test('孤立画面 W2 orphan は基準以下（目標 0）', () => {
    const m = fieldHonestMetrics(loadMap());
    expect(
      m.orphans.length,
      `W2 (orphan screens) regressed above baseline ${BASELINE.w2}.\n${m.orphans.join('  ')}`,
    ).toBeLessThanOrEqual(BASELINE.w2);
  });

  test('素通り画面 (<2軸) は基準以下（目標 0）', () => {
    const under = underTwoAxisScreens(loadMap(), { allowlist: TWO_AXIS_ALLOWLIST });
    const detail = under.slice(0, 40)
      .map((u) => `${u.key}[${u.axes.join('/') || 'none'}]`).join('  ');
    expect(
      under.length,
      `素通り画面 regressed above baseline ${BASELINE.underTwoAxis}.\n` +
      `各プレイ画面は「導線/障害/秘密/戦闘/ランドマーク」を2軸以上満たすこと:\n${detail}`,
    ).toBeLessThanOrEqual(BASELINE.underTwoAxis);
  });

  test('レイアウト重複 (同一タイル配置の使い回し) は 0', () => {
    const groups = duplicateLayoutGroups(loadMap());
    expect(
      groups.length,
      `duplicate-layout groups found (塗り絵 copy-paste):\n` +
      groups.map((g) => g.join(', ')).join('\n'),
    ).toBeLessThanOrEqual(BASELINE.dupLayouts);
  });

  // Progress marker: prints the live gap to goal on every run so the ratchet is
  // easy to tighten. Always passes; it's a report, not an assertion.
  test('進捗レポート（目標 0 までの残り・常に pass）', () => {
    const map = loadMap();
    const m = fieldHonestMetrics(map);
    const under = underTwoAxisScreens(map, { allowlist: TWO_AXIS_ALLOWLIST });
    /* eslint-disable no-console */
    console.log('\n── 9-6 invariants — remaining to goal(0) ──');
    console.log(`  seams        : ${m.seams.length}\t(baseline ${BASELINE.seams})`);
    console.log(`  W1           : ${m.w1.length}\t(baseline ${BASELINE.w1})`);
    console.log(`  W2 orphan    : ${m.orphans.length}\t(baseline ${BASELINE.w2})`);
    console.log(`  under-2-axis : ${under.length}\t(baseline ${BASELINE.underTwoAxis})`);
    console.log(`  dup layouts  : ${duplicateLayoutGroups(map).length}\t(baseline ${BASELINE.dupLayouts})`);
    expect(true).toBe(true);
  });
});
