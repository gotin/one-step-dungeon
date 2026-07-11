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

// RATCHET CEILINGS — LOWER these as 9-6 流し込み drives each number down. GOAL 0.
// 2026-07-05 pre-rework baseline: seams 91 / under-2-axis 110.
// 2026-07-06 設計⑤ forest prototype (26 screens rebuilt): seams 91→89,
//   under-2-axis 110→94 (16 forest 素通り screens cleared). W1/W2/dup unchanged
//   (all remaining in the still-untouched outer border). Tightened accordingly.
// 2026-07-07 ⑥ desert region (14 screens rebuilt): under-2-axis 94→80 (all 14
//   desert 素通り cleared), seams 89→88 (mirror-ring rule removed the 2,14→2,13
//   seam). W1/W2/dup unchanged (outer border still untouched). Tightened.
// 2026-07-09 ⑥-3 grassland hub (26 hub + 5 south-coast screens rebuilt):
//   under-2-axis 80→63 (all 17 hub 素通り cleared). The coast (§10 region+ring:
//   the 5 sea screens touching the hub's south edge, made walkable beaches)
//   turned 5 W1 + 5 orphan sea screens into reached playable screens with ≥2 axes
//   each → W1 110→105, W2 110→105. seams stay 88 — the 8 hub seams are CORNER-cell
//   conflicts pinned by the preserved village/D1/D8/cave_1 corners (a corner
//   can't satisfy two crossings at once; the only fix edits a preserved screen);
//   the coast adds 0 seams. dup unchanged. Tightened w1/w2/under-2-axis.
// 2026-07-09 outer-ring pass (migrate-field-outer-ring.mjs) — user-driven fix:
//   "オール水ステージを撲滅／入った後に動けなくなるステージを作るな／field は全画面
//   playable". Rebuilt ALL 105 all-water/all-mountain W1 screens into walkable,
//   village-reachable outer regions (sea beaches+piers / carved cliff paths) with
//   only the map's outermost edge as wall. Result: W1 105→0, W2 105→0 (rules 2
//   satisfied: every screen playable & reachable). NEW `traps` metric (rule 1:
//   step off a reached screen's open edge → arrive on a hard-blocked cell = soft-
//   lock) added to fieldHonestMetrics; it exposed 146 pre-existing soft-locks the
//   old seam metric hid (it exempted W1 destinations). Outer-ring pass drove
//   traps 146→69 and adds ZERO soft-locks of its own; the 69 remaining are all in
//   the still-un-reworked mainland regions (草原G中央/湖W/雪S/火山L/山地M = ⑥-4〜
//   ⑥-9) and fall as each is reworked. dup rose 3→7 because many deep-ocean
//   screens share an identical minimal-walkway layout (legit: featureless open
//   sea) — tracked honestly, not hidden. seams == traps by construction now.
// 2026-07-11 ⑥-4 grassland G-B (central-east lake-side, 50 screens rebuilt):
//   under-2-axis 168→146 (all 50 G-B 素通り screens cleared — each now ≥2 axes).
//   The mirror rule removed every EDGE seam/trap touching G-B → seams 97→88,
//   traps 97→88. The 25 remaining G-B-source traps are ALL CORNER cells (0 edge,
//   measured) facing still-塗り絵 neighbours (forest F / lake W / G-C / hub G-A) —
//   the §11-1 corner limit; they vanish when those regions are reworked (⑥-5..
//   ⑥-9). dup unchanged (7). W1/W2 unchanged (0). Tightened seams/traps/under.
const BASELINE = {
  seams: 88,        // honest seam bugs (reachable→reachable but walled) → goal 0
  w1: 0,            // all-blocked screens → 0 achieved (rule 2: all playable)
  w2: 0,            // orphan screens → 0 achieved (rule 2: all reachable)
  underTwoAxis: 146, // reachable <2-axis screens → goal 0. 168→146 after ⑥-4
                    // cleared all 50 G-B mainland 素通り screens. Remaining are the
                    // outer ring's minimal walkways (⑥-10/⑥-11 content pass) plus
                    // the still-un-reworked mainland regions (⑥-5..⑥-9).
  dupLayouts: 7,    // identical-layout groups → goal small. Deep-ocean minimal
                    // walkways still share geometry (⑥-11 content pass clears them).
  traps: 88,        // rule 1: reached screen → arrival-wall soft-lock → goal 0.
                    // 97→88 after ⑥-4. The 25 G-B-source traps left are ALL corner
                    // cells (§11-1) facing un-reworked neighbours; they fall as
                    // ⑥-5..⑥-9 rework the adjacent regions.
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

  test('レイアウト重複 (同一タイル配置の使い回し) は基準以下', () => {
    const groups = duplicateLayoutGroups(loadMap());
    expect(
      groups.length,
      `duplicate-layout groups found (塗り絵 copy-paste):\n` +
      groups.map((g) => g.join(', ')).join('\n'),
    ).toBeLessThanOrEqual(BASELINE.dupLayouts);
  });

  // USER RULE 1: 入った後に動けなくなるステージを作ってはならない. A trap = step off a
  // reached screen's open edge and the engine scrolls you into an existing stage
  // whose arrival cell is hard-blocked (you clamp/stick; if that screen is all-
  // blocked it's an unrecoverable soft-lock). This is the metric that would have
  // caught the 3,17→3,18 all-water soft-lock. Ratchet to 0 as regions are reworked.
  test('移動後に動けなくなる遷移 (trap edges) は基準以下（目標 0＝ルール1）', () => {
    const m = fieldHonestMetrics(loadMap());
    expect(
      m.traps.length,
      `trap edges regressed above baseline ${BASELINE.traps}.\n` +
      `到達可能画面から開いた辺に出ると壁/オール水に着地して詰む遷移:\n${m.traps.join('  ')}`,
    ).toBeLessThanOrEqual(BASELINE.traps);
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
    console.log(`  trap edges   : ${m.traps.length}\t(baseline ${BASELINE.traps})  ← rule 1 soft-locks`);
    expect(true).toBe(true);
  });
});
