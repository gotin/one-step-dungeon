import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  fieldHonestMetrics, underTwoAxisScreens, duplicateLayoutGroups,
  duplicateLayoutScreenCount, warpEnterLandings,
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
// 2026-07-13 ⑥-6 lake W (13 screens rebuilt, 9,9 D3 entrance preserved): a HYBRID
//   ring rule (NOT grassland's mirror-AND, which collapses lake↔lake seams to a
//   permanently-CLOSED fixed-point and orphans the fully-lake-surrounded interior
//   screens). lake↔land edges MIRROR (open→open, closed→veto); lake↔lake edges open
//   the standard skeleton (col5,6 / row4,5) + OR-propagation; corners forced water
//   (§11-1). Result: seams 70→64, traps 70→64 — lake-SOURCED seams/traps = 0 (the
//   region eradicates its own holes). under-2-axis 125→124 (8,9 west hub cleared).
//   The 10 remaining "into lake" traps are all sourced from adjacent un-reworked
//   land screens (their walls face the lake's open cells) and fall as ⑥-7..⑥-9
//   rework those. dup unchanged (7 — every lake layout is distinct). W1/W2 = 0.
// 2026-07-15 ⑥-7 mountain/swamp M (14 screens rebuilt, 10,14 D8 + 9,15 cave_1
//   preserved): M is a FLOOR-default highland (bgTile 'w' mud carved by 'M' into
//   1本道 corridors), NOT a water-skin region — so it uses grassland-c's mirror-AND
//   fixed-point (§14-3), NOT the ⑥-6 lake hybrid (the hand-off note was corrected
//   against the data). Result: seams 64→61, traps 64→61 — M-SOURCED seams/traps = 0.
//   The 3 remaining M-touching residuals are corner cells (§11-1) + edges facing the
//   PRESERVED D8 fence / still-un-reworked grassland (⑥-8/⑥-9). under-2-axis 124→114
//   (all 14 M screens now ≥2 axes). dup/W1/W2 unchanged.
// 2026-07-15 ⑥-8 snow S (13 screens rebuilt, 13,5 D5 entrance preserved): snow is a
//   FLOOR-default region (bgTile 's' carved by 'M' into 石/迷路 with local '~' pools),
//   the same class as grassland/mountain-M — so it reuses the mirror-AND fixed-point
//   (§14-3/§16-1), NOT the lake hybrid. Result: seams 61→43, traps 61→43 — S-SOURCED
//   seams/traps = 0 (the arrival-hole guard passes). under-2-axis 114→110 (all 13 S
//   screens now ≥2 axes). dup/W1/W2 unchanged. 9-6-P: the showcase 石押し (13,4 —
//   order-dependent 2-stone allSwitchesOn) and 弓ゲート (11,6 — sword-unreachable Y
//   across a frozen moat) raise the puzzle bar.
// 2026-07-16 ⑥-trap cross-map arrival-wall root-out (migrate-field-trap-corners.mjs):
//   the FINAL trap pass. With every region + outer ring finished, the last 35 traps
//   (== 35 seams) were all §11-1 CORNER RESIDUALS: an open corner cell on a reached
//   screen faced a wall corner (t/M/~/f) on a region-boundary neighbour — a grid
//   corner answers to two crossings on two neighbours, so it couldn't be resolved
//   until BOTH were reworked. The global mirror-AND fixed point walls each open
//   source corner to match the wall it faces (54 empty corners; 't'/'M' kept, '~'/'f'
//   → 'M'), except the preserved D6 approach (2,4) which mirrors on its plain-forest
//   dest side (2,3 cells 9,4/9,7 opened). Result: seams 43→0, traps 43→0 — BOTH GOALS
//   MET. reached 319 unchanged (a corner is decorative border, never load-bearing),
//   W1/W2/dup/under-2-axis all unchanged. seams & traps ceilings are now hard 0.
// 2026-07-27 ⑤ 深洋O 廊下C1〜C4 + 西外周封鎖 (migrate-field-corridor-o.mjs): 4 corridor
//   screens authored as combat-zero 潮ゲート+石押し puzzles (each verified by full
//   state-space search: solvable, zero dead states, gate cannot be bypassed), and the
//   O west perimeter sealed (26 screens / 266 cells; sea side = bgTiles water, land
//   side = 'M') so the corridor is the ONLY road into the delta and the sanctuary is
//   reachable only past the sea lord. under-2-axis 101→97 (the 4 corridor screens).
//   seams/traps/W1/W2 stay 0. TWO metric holes were found and closed first, because
//   both made this very change look better than it was:
//   (a) under-2-axis counted only the STRICT walk, so the 17 screens behind the new
//       tide gates fell out of the population and the number "improved" 101→83 with
//       zero content change — i.e. gating an unfinished screen hid it. Population is
//       now `reachedWithGates` (320, unchanged by this pass).
//   (b) dupLayouts was ratcheted on GROUP COUNT. Adding a wall to the outer ring of
//       still-塗り絵 neighbours split the 37-screen group into 21+4+4+3+… → 7→13 groups
//       while actual duplication FELL (64→59 screens). Group count punishes progress,
//       so the ceiling is now duplicateLayoutScreenCount (64→59 here).
const BASELINE = {
  seams: 0,         // honest seam bugs (reachable→reachable but walled) → GOAL MET (0).
                    // 43→35 after ⑥-9 volcano; 35→0 after ⑥-trap (all §11-1 corners closed).
  w1: 0,            // all-blocked screens → 0 achieved (rule 2: all playable)
  w2: 0,            // orphan screens → 0 achieved (rule 2: all reachable)
  underTwoAxis: 92, // <2-axis screens the player can stand in (gates OPEN — see
                    // reachedWithGates) → goal 0. 114→110 after ⑥-8;
                    // 110→108 after ⑥-9 (all 7 L screens → ≥2 axes; only 2 were flagged
                    // before, the rest passed the heuristic as filler but were 塗り絵).
                    // 108→101 after 9-6④ アーム7 (the 7 深洋O entrance screens, designed
                    // one screen at a time — each earns ≥2 axes).
                    // 101→97 after ⑤ 廊下C1〜C4.
                    // 97→92 after ④ デルタ上半 D1〜D5 (each of the 5 delta screens earns
                    // ≥2 axes: a tool-gated secret + a landmark/route, designed one at a time).
                    // Remaining: the rest of 深洋O (デルタ下半9/聖域) + the hub.
  dupScreens: 54,   // screens caught in SOME identical-layout group → goal small.
                    // Ratcheted on screen COUNT, not group count (group count splits
                    // when a wall is added to an untouched 塗り絵 → false regression).
                    // 64→59 after ⑤ (the 4 corridor screens + 15,16 left their groups).
                    // 59→54 after ④ (the 5 delta screens left their all-water dup group).
                    // Deep-ocean minimal walkways still share geometry (⑥-11 clears them).
  traps: 0,         // rule 1: reached screen → arrival-wall soft-lock → GOAL MET (0).
                    // 43→35 after ⑥-9 volcano; 35→0 after ⑥-trap (mirror-AND fixed point
                    // closes every §11-1 corner residual across region boundaries).
  footprintBlocked: 0,  // 見えない壁: seam looks open, engine bounces you back → GOAL MET (0).
                    // NEW class (2026-07-27 ⑥-footprint). 71→67 by moving the offending
                    // tiles in 深洋O (the region the user actually walked), then 67→0 on
                    // 2026-07-29 by ⑥-landing making the engine land on the BOUNDARY CELL
                    // instead of half a cell inward — the footprint is now one cell, so the
                    // whole class is impossible BY CONSTRUCTION rather than fixed per screen.
                    // ⚠️ Keep this at 0 and keep footprintBlockedEdges() a faithful mirror of
                    // game.js arrivalIsWall: it is now the guard that catches the landing
                    // drifting back off the boundary cell (which would resurrect all 68).
};

// 2026-07-27 ⑥-footprint — the metric hole the USER found by playing, not by measuring:
// 「15,13 から南に歩いても弾き返される」 while seams/traps/W1/W2 all read 0.
//
// Root cause (game.js:1144-1147 + arrivalIsWall): checkStageTransition is symmetric in
// FLOAT coords (0.5 / size-1.5) but asymmetric in TILES — entering downward lands on tile
// row 0, entering upward on row rows-2. Either way the half-cell landing puts the 1-cell
// hitbox across TWO rows (or cols), and the transition is CANCELLED if either holds a
// wall. So the real data rule — undocumented until now, and violated 72× map-wide — is:
//   ⚠️ an open crossing must keep the boundary row/col AND the next row/col inward clear.
// Every checker measured only the boundary cell, so 72 invisible walls coexisted with
// traps = 0. Lesson (DECISIONS.md): 画面の中を検証するテストは、画面に入れることを検証しない.
//
// ✅ RESOLVED 2026-07-29 (⑥-landing) — the fix was in the ENGINE, not the data. The landing
// is now the BOUNDARY CELL itself (row 0 / rows-1), so the footprint is exactly one cell.
// The half-cell landing had TWO opposite defects, both measured in-engine, and neither
// landing was correct alone:
//   - half cell → a wall one row inward silently cancels the crossing (68 invisible walls)
//   - integer  → the player would land ON a closed solvable gate and freeze there …
//     UNLESS the arrival check also refuses that. Which turned out not to be a second
//     feature but the SAME missing check: arrivalIsWall judged gates by TILE TYPE, so '|'
//     was always a wall (over-block) while 'T'/'='/'('/')'/'!' were always walk-through
//     (the half cell then let the player sail THROUGH the unbroken '!' at 5,13→6,13).
//     Both directions are fixed by judging the arrival cell against the destination's ss
//     via the shared statefulTileClosed() (passable.js) — one source of truth with
//     tilePassable, so the two can't drift apart again.
// 'D' (key door) and ':' (boss doorway) are deliberately exempt: crossing a border 'D'
// means the source side already unlocked it, and blocking ':' would seal re-entry after
// fleeing a boss. See DECISIONS.md 2026-07-29 / PLAN.md ⑥-landing.

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

  // Ratchet on the number of SCREENS caught in a dup group, not the number of groups.
  // 2026-07-27: sealing the O perimeter added one wall to the outer ring of many
  // untouched 塗り絵 screens; their interiors were byte-identical before and after, but
  // the differing wall shapes SPLIT one 37-screen group into 21+4+4+3+… → group count
  // 7→13 (a "regression" that was actually 64→59 fewer duplicated screens). Group
  // count therefore rewards never touching a copy-pasted screen's border.
  test('レイアウト重複 (同一タイル配置の使い回し) は基準以下', () => {
    const map = loadMap();
    const groups = duplicateLayoutGroups(map);
    expect(
      duplicateLayoutScreenCount(map),
      `duplicate-layout screens found (塗り絵 copy-paste):\n` +
      groups.map((g) => g.join(', ')).join('\n'),
    ).toBeLessThanOrEqual(BASELINE.dupScreens);
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

  // ⑥-footprint: 見えない壁. Unlike `traps` (arrival cell IS a wall → you clamp and stick)
  // this crossing LOOKS open from both sides: the player walks into the seam and is
  // silently pushed back, with no wall in sight to explain it. Ratcheted separately, and
  // NOT filtered by reachability — the strict walk keeps gates shut, and filtering hid
  // the user's own case (15,13→15,14 is behind the corridor tide gates).
  test('見えない壁 (arrival footprint) は基準以下（目標 0＝⑥-footprint）', () => {
    const m = fieldHonestMetrics(loadMap());
    expect(
      m.footprintBlocked.length,
      `footprint-blocked crossings regressed above baseline ${BASELINE.footprintBlocked}.\n` +
      `継ぎ目は開いて見えるのに、着地 footprint（境界の1つ内側）が壁で遷移が` +
      `キャンセルされる＝プレイヤーには理由の分からない「見えない壁」:\n` +
      m.footprintBlocked.slice(0, 40).join('  '),
    ).toBeLessThanOrEqual(BASELINE.footprintBlocked);
  });

  // ⑥-warp: ワープ/テレポート着地が「詰み」でないこと. bfsLayer/traps only model
  // edge-scrolls; NEITHER inspects where a teleport DROPS the player. game.js
  // enterStage() places the player at the exact (row,col) with no wall-clamping,
  // so a landing on a hard-blocked tile is an unrecoverable soft-lock. This is the
  // metric that catches the secret_grotto flute-warp landing on field 2,0 (4,4)=M
  // (fixed by moving it to 8,6), and it guards every future warp/MAP_ENTER too.
  //
  // KNOWN out-of-⑥-scope residuals (must NOT regress, tracked as an allow-list):
  //   field/8,1 mapEnter fieldToTower → field 8,0(3,2)=M  — the sky-island was
  //     dropped in the M1-M4 re-key; restoring it (+ this landing) is 9-2T bug①
  //     (PLAN 9-2T「空島復元」). Until then the tower is unreachable anyway.
  //   dungeon_7/1,3 exit destId=field_dungeon7 → unresolved — the field-side
  //     receiver for D7's return exit is not wired (9-2i/9-2T scope; D7 is entered
  //     by flute-warp so this only affects the return trip).
  // Drop a key from KNOWN_BAD_LANDINGS the moment its owning task fixes it.
  const KNOWN_BAD_LANDINGS = new Set([
    'mapEnter field/8,1@3,2',      // fieldToTower → 8,0(3,2)=M (9-2T sky-island)
    'mapEnter dungeon_7/1,3@7,2',  // field_dungeon7 unresolved (9-2i D7 return)
  ]);

  test('ワープ/テレポート着地が壁でない (warp-landing soft-lock) — ⑥-warp', () => {
    const bad = warpEnterLandings(loadMap());
    const live = bad.filter(
      (b) => !KNOWN_BAD_LANDINGS.has(`${b.kind} ${b.from}@${b.at}`),
    );
    const fmt = (b) =>
      `${b.kind} ${b.from}@${b.at} → ${b.dest ?? '(unresolved)'}` +
      `${b.tile ? ` tile='${b.tile}'` : ''} [${b.reason}]`;
    expect(
      live.map(fmt),
      '笛/テレポートの着地セルが徒歩不可の壁＝spawn 即詰み（enterStage は壁でも' +
      'クランプしない）。着地点を歩けるセルに直すこと:\n' + live.map(fmt).join('\n'),
    ).toEqual([]);
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
    console.log(`  under-2-axis : ${under.length}\t(baseline ${BASELINE.underTwoAxis})  ← gates-open population`);
    console.log(`  dup screens  : ${duplicateLayoutScreenCount(map)}\t(baseline ${BASELINE.dupScreens})  in ${duplicateLayoutGroups(map).length} groups`);
    console.log(`  reached      : strict ${m.reached.size} / gates-open ${m.reachedWithGates.size} of ${Object.keys(map.layers.field.stages).length}`);
    console.log(`  trap edges   : ${m.traps.length}\t(baseline ${BASELINE.traps})  ← rule 1 soft-locks`);
    console.log(`  見えない壁   : ${m.footprintBlocked.length}\t(baseline ${BASELINE.footprintBlocked})  ← arrival footprint (⑥-footprint)`);
    expect(true).toBe(true);
  });
});
