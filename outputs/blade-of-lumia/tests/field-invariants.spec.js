import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  fieldHonestMetrics, underTwoAxisScreens, duplicateLayoutGroups,
  duplicateLayoutScreenCount, warpEnterLandings, gatedScreenReport,
} from '../scripts/lib/field-quality.mjs';
import { firstWalkable } from '../scripts/lib/connectivity.mjs';
import { waitForBoard } from './helpers.js';

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
  underTwoAxis: 0,  // <2-axis screens the player can stand in (gates OPEN — see
                    // reachedWithGates) → goal 0. 114→110 after ⑥-8;
                    // 110→108 after ⑥-9 (all 7 L screens → ≥2 axes; only 2 were flagged
                    // before, the rest passed the heuristic as filler but were 塗り絵).
                    // 108→101 after 9-6④ アーム7 (the 7 深洋O entrance screens, designed
                    // one screen at a time — each earns ≥2 axes).
                    // 101→97 after ⑤ 廊下C1〜C4.
                    // 97→92 after ④ デルタ上半 D1〜D5 (each of the 5 delta screens earns
                    // ≥2 axes: a tool-gated secret + a landmark/route, designed one at a time).
                    // 92→83 after ⑥ デルタ下半9枚 (2026-08-19 — the ceiling was never
                    // tightened at the time; this commit closes that gap too).
                    // 83→76 after 9-6-BASE 湖W東拡張 (2026-08-20 — 7 screens each earn
                    // ≥2 axes: route+obstacle from the bridge-hop spine, plus a P2/P3
                    // feature on 2 of them).
                    // 76→68 after 9-6-BASE 森F北西+8 (2026-08-20 — the 8 rebuilt 塗り絵
                    // screens each earn ≥2 axes; 0,0 also carries the銅の剣 cave entrance).
                    // 68→59 after 9-6-BASE 火山L外輪+9 (2026-08-20 — the 9 rim screens
                    // each earn ≥2 axes; this completes 火山 L at 17/17 worked screens.
                    // Chosen as the smallest remaining region block, per the confirmed
                    // order「小さい編入分から着手」).
                    // 59→52 after 9-6-BASE 北の外周帯7枚 (2026-08-21 — 4,0/4,1/5,0/6,0/
                    // 7,0/9,0/10,1 each earn ≥2 axes. The band is the smallest remaining
                    // block; 8,0 stays in TWO_AXIS_ALLOWLIST＝9-2T の領分).
                    // 52→41 after 9-6-BASE 砂漠D南岸+渚11枚 (2026-08-21 — 0,17/0,18/0,19/
                    // 1,18/1,19/2,15/2,18/2,19/3,18/3,19 と 渚 4,19 が各々 ≥2 軸。
                    // 砂漠D と 草原G3 の 素通り はこれで 0 になった)。
                    // 41→28 after 9-6-BASE 山地M東の水落ち13枚 (2026-08-22 — 12,12/13,12/
                    // 14,12/12,13/13,13/14,13/13,14/14,14/13,15/14,15/12,16/13,16/12,17 が
                    // 各々 ≥2 軸。山地M の 素通り はこれで 0 になった)。
                    // 28→14 after 9-6-BASE 沼P南岸14枚 (2026-08-22 — 12,14/12,15/11,16/
                    // 11,17/11,18/10,17/10,18/10,19/9,17/9,18/9,19/8,18/8,19/7,19 が
                    // 各々 ≥2 軸。沼P の 素通り はこれで 0 になった)。
                    // 14→0 after 9-6-BASE 雪原S東の縁14枚 (2026-08-22 — 14,3/15,3/15,4/
                    // 15,5/14,6/15,6/13,7/14,7/15,7/12,8/13,8/14,8/12,9/13,9 が各々 ≥2 軸。
                    // ⑨＝外周解体の最後の地域ブロック∴**この指標は 0 に到達した**。
                    // ⚠️ 生の underTwoAxisScreens(map) は今も 3 を返す（7,14 / 8,0 / 8,1）が、
                    // その3枚は TWO_AXIS_ALLOWLIST＝9-2T（村・塔の領分）で別タスクの管轄。
                    // allowlist を通した母数では 0＝ここを hard 0 として固定する。
  dupScreens: 0,    // screens caught in SOME identical-layout group → GOAL MET (0).
                    // Ratcheted on screen COUNT, not group count (group count splits
                    // when a wall is added to an untouched 塗り絵 → false regression).
                    // 64→59 after ⑤ (the 4 corridor screens + 15,16 left their groups).
                    // 59→54 after ④ (the 5 delta screens left their all-water dup group).
                    // 54→46 after ⑥ デルタ下半9枚 (2026-08-19 — ceiling untightened then;
                    // closed here alongside underTwoAxis).
                    // 46→39 after 9-6-BASE 湖W東拡張 (2026-08-20 — the 7 new screens'
                    // bridge-hop layouts are each distinct; none share a dup group).
                    // 39→36 after 9-6-BASE 森F北西+8 (2026-08-20 — 3 of the 8 were in the
                    // 森F 塗り絵 dup groups; each new layout is hand-authored and unique).
                    // 36→32 after 9-6-BASE 火山L外輪+9 (2026-08-20 — 4 of the 9 rim screens
                    // were in 塗り絵 dup groups, incl. the 15,1/15,2 pair).
                    // 32 unchanged after 9-6-BASE 北の外周帯7枚 (2026-08-21 — none of the 7
                    // shared a hash with another screen even before the rebuild; the
                    // remaining 32 sit in the untouched 雪/砂漠/森F 塗り絵 groups).
                    // 32→29 after 9-6-BASE 砂漠D南岸+渚11枚 (2026-08-21 — 3 of the 11 were in
                    // 砂漠D の 塗り絵 dup groups; 残り 29 は 雪/山地/沼 側).
                    // 29→15 after 9-6-BASE 山地M東の水落ち13枚 (2026-08-22 — 山地M の 13枚は
                    // すべて 塗り絵 の巨大 dup group に居た＝1枚ずつ手で書いた盤面に置き換えて
                    // 全員が group を出た。残り 15 は 雪S/沼P 側だけ).
                    // 15→7 after 9-6-BASE 沼P南岸14枚 (2026-08-22 — 沼P の 8枚が 塗り絵 の
                    // dup group に居た＝1枚ずつ手で書いた盤面に置き換えて全員が group を出た。
                    // 残り 7 は 雪S の 2群＝{15,6 15,7} と {13,7 13,8 13,9 14,7 14,8}).
                    // 7→0 after 9-6-BASE 雪原S東の縁14枚 (2026-08-22 — その2群の7枚すべてを
                    // 1枚ずつ手で書いた盤面に置き換えた＝**同一レイアウトの群は地図から消えた**。
                    // 外周解体の完走でこの指標も 0 に到達∴以後は「新規の量産をしない」ための
                    // hard 0 の見張りになる).
                    // ⚠️ NOTE (2026-08-20): the *similarity* warning count (125) in
                    // FIELD-BASELINE-METRICS.md is NOT a usable signal inside 森F. Its
                    // cosine vector is dominated by the floor/wall histogram buckets, and a
                    // dense forest screen is 118/120 cells of just those two → any two
                    // forest screens read ≥0.995 no matter how different their gimmicks are.
                    // Not ratcheted for that reason; see DECISIONS.md 2026-08-20.
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
  //   dungeon_7/1,3 exit destId=field_dungeon7 → unresolved — the field-side
  //     receiver for D7's return exit is not wired (9-2i/9-2T scope; D7 is entered
  //     by flute-warp so this only affects the return trip).
  // Drop a key from KNOWN_BAD_LANDINGS the moment its owning task fixes it.
  // 2026-08-23（8.5 虚空の祠）: `mapEnter field/8,1@3,2`（fieldToTower → 8,0(3,2)='M'）は
  //   ここで解消した＝塔の扉のタイルを 'M' から '>' に直した（mapEnter だけあってタイルが
  //   山＝踏めない＝暗黒の塔に永久に入れない＝クリア不能だった）∴allowlist から外した。
  const KNOWN_BAD_LANDINGS = new Set([
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

  // 2026-08-22（9-6-BASE ⑧）: 笛の封印は showConditions だけでは開かない。
  // `game/game.js` playFlute は **現在ステージの `stageData.fluteEffect`** を読み、それが
  // 無いと「特に何も起きない」で return する＝`ss.flutePlayed` が立たず封印が永久に開かない。
  // ⑧ で `8,19` を作るときに踏み、既存の `field/11,14` `field/13,15` も同じ欠落だった
  // （`scripts/fix-flute-reveal-missing.mjs` で解消）。新規違反 0 で始まる∴ratchet ではなく 0 断定。
  test('笛で開く封印は fluteEffect{reveal} とセット（開かない宝箱を作らない）', () => {
    const map = loadMap();
    const bad = [];
    for (const [ln, layer] of Object.entries(map.layers ?? {})) {
      for (const [sk, st] of Object.entries(layer.stages ?? {})) {
        const sealed = Object.entries(st.showConditions ?? {})
          .filter(([, sc]) => sc.trigger === 'flutePlayed' || sc.trigger === 'killAllAndFlute')
          .map(([k]) => k);
        if (sealed.length && st.fluteEffect?.type !== 'reveal')
          bad.push(`${ln}/${sk} 封印 ${sealed.join(' ')} に fluteEffect{reveal} が無い`);
      }
    }
    expect(
      bad,
      '笛を吹いても flutePlayed が立たない画面に笛の封印がある＝取れない宝箱:\n' + bad.join('\n'),
    ).toEqual([]);
  });

  // ── ⑥-完了検査 (2026-08-22) ─────────────────────────────────────────────────
  // The three deliverables of PLAN.md 9-6 ⑥-完了検査. The 7 ratchet metrics above all
  // read 0 now, but "0" only proves what the metric MEASURES — these three tests pin
  // down what the 0 actually means, so nobody can read more (or less) into it later.

  // (a) `under-2-axis = 0` は「allowlist を除いた 0」。素の underTwoAxisScreens(map) は
  //     今も 3 を返す（7,14 = 開始村 / 8,0 = 塔の足元 / 8,1 = 飛行ワープ着地 ＝ 9-2T の
  //     領分）。この差を書き残すだけでは allowlist が黙って育つのを止められない∴
  //     「素の結果 == allowlist と完全一致」を固定する。allowlist に4枚目を足した瞬間、
  //     または allowlist の画面が 2軸を得た瞬間にここが赤くなる＝どちらも人間の判断が
  //     必要な変更で、黙って通ってはいけないもの。
  test('素通り 0 の意味＝allowlist 除外後の 0（allowlist が黙って増えない）', () => {
    const map = loadMap();
    expect(underTwoAxisScreens(map, { allowlist: TWO_AXIS_ALLOWLIST })).toEqual([]);
    const raw = underTwoAxisScreens(map).map((u) => u.key).sort();
    expect(
      raw,
      '素の <2軸 画面が TWO_AXIS_ALLOWLIST と一致しない。\n' +
      '・allowlist の画面が2軸を得た → allowlist から外す（9-2T 側の完成）\n' +
      '・新しい <2軸 画面が増えた → その画面を作り込む（allowlist に足して隠さない）',
    ).toEqual([...TWO_AXIS_ALLOWLIST].sort());
  });

  // (c) reached(strict) 302 と gates-open 320 の差 18枚の内訳＝**17 + 1**：
  //       - 17枚 = 深洋O デルタ（廊下C1〜C4 の潮の戸 '=' の奥）＝ ゲートを開ければ徒歩で
  //         到達する＝鍵/道具で開く正当な閉じ。
  //       - 1枚  = 8,1（塔/空島）＝徒歩の辺では入れず、飛び元 field/8,0@3,2 の '>' に乗る
  //         ワープでだけ入る画面。2026-08-23（8.5）でそのセルを 'M' → '>' に直したので
  //         **standable:true＝正当な閉じ**になった（mapEnter は翼の羽衣が無いと通れない
  //         ＝道具の関門）。それ以前は 'M'＝立てない＝徒歩でもワープでも入れない欠陥で、
  //         9-2T bug① として KNOWN_BAD_LANDINGS に置いてあった。
  //     この 17/1 の切り分けを machine-checkable にしたのが gatedScreenReport()。決め手は
  //     frontier.other == []：strict と gates-open を隔てるセルが 潮の戸/ゲート/鍵の扉/
  //     壊せる壁 か はしごで渡れる1マス幅の水/穴 だけ＝17枚へのどの経路も「開ける行為」を
  //     必ず1回は経由する。壁で塞がれた画面が混ざっていれば other に現れる。
  //     ⚠️ warpOnly の standable が false に戻ったら「飛び元に立てない＝入れない画面」の
  //        再発∴ここは true を固定する（欠陥の許容ではなく正当性の証明として読む）。
  const GATED_EXPECTED = {
    // 深洋O デルタ＝廊下C1〜C4 の潮の戸の奥（gates-open の徒歩で到達＝正当な閉じ）
    walk: [
      '11,19', '12,18', '12,19', '13,17', '13,18', '13,19', '14,16', '14,17',
      '14,18', '14,19', '15,13', '15,14', '15,15', '15,16', '15,17', '15,18', '15,19',
    ],
    // 徒歩では入れず、踏める飛び元（塔の扉）からのワープでだけ入る＝道具の関門
    warpOnly: [{
      key: '8,1',
      sources: [{ from: '8,0', at: '3,2', tile: '>', standable: true }],
    }],
  };

  test('strict 302 と gates-open 320 の差 18枚の内訳＝17枚は潮の戸・1枚は塔の扉のワープ', () => {
    const map = loadMap();
    const m = fieldHonestMetrics(map);
    const r = gatedScreenReport(map);
    expect(m.reachedWithGates.size).toBe(Object.keys(map.layers.field.stages).length);
    expect(r.gated.length).toBe(m.reachedWithGates.size - m.reached.size);
    expect(
      r.gated,
      `strict と gates-open の差の顔ぶれが変わった:\n${r.gated.join('  ')}`,
    ).toEqual([...GATED_EXPECTED.walk, ...GATED_EXPECTED.warpOnly.map((w) => w.key)].sort());
    expect(
      r.walkGated,
      'ゲートを開ければ徒歩で到達できるはずの画面が減った＝壁で塞がった疑い',
    ).toEqual(GATED_EXPECTED.walk);
    expect(
      r.warpOnly,
      'ワープでしか入れない画面の顔ぶれ／飛び元が変わった。standable:false は' +
      '「飛び元のセルが壁＝実際には入れない」＝正当な閉じではなく直すべき欠陥',
    ).toEqual(GATED_EXPECTED.warpOnly);
    expect(
      r.frontier.other,
      'strict と gates-open を隔てるセルにゲートでもはしご水でもないものがある＝' +
      '「鍵/道具で開く閉じ」の証明が崩れている:\n' + r.frontier.other.join('  '),
    ).toEqual([]);
    expect(r.frontier.gate.length).toBeGreaterThan(0);
  });

  // (b) 全320画面を実ブラウザで起動する。地域ごとの `.scratch/shot-*.mjs` は帯単位＝
  //     全画面を一度も一括では踏んでいない（＝「作った帯は見た」だけ）。ここは
  //     __game.enterStage() で1ページのまま320画面を順に入り直し、pageerror 0・盤面が
  //     描かれること・プレイヤーが居ることを見る。enterStage は buildEnemies →
  //     checkStoneOnSwitch → renderBoard → renderChars → updateHud → startBossBattle
  //     まで通る＝敵生成とスプライト解決を含む「起動」そのもの。
  //     ⚠️ 実ループは止めて step(2) で手動 tick する（enemy AI を1度は回すため。
  //     実ループのまま320回入り直すと tick の混ざり方で flaky になる）。
  test('全320画面が実ブラウザで起動する（pageerror 0）', async ({ page }) => {
    const map = loadMap();
    const stages = map.layers.field.stages;
    const keys = Object.keys(stages).sort();
    expect(keys.length).toBe(320);

    let current = '(boot)';
    const errors = [];
    page.on('pageerror', (e) => errors.push(`${current}: ${e.message}`));

    // 道具は全部持った状態で入る（道具が無いと出ない描画分岐＝はしご/飛行ローブ等を
    // 通すため）。fromEditor=1 は debugMode:true を含む。
    const p = new URLSearchParams({
      fromEditor: '1', layer: 'field', stage: '7,14', row: '2', col: '2',
      // ps_shield / ps_armor は**ティア番号**（2026-08-25 に曖昧さを解消）＝0 が下位ティア。
      ps_weapon: '1', ps_shield: '0', ps_armor: '0', ps_bow: '1', ps_boomerang: '1',
      ps_bomb: '1', ps_ladder: '1', ps_wingrobe: '1', ps_flute: '1', ps_candle: '1',
    });
    await page.goto(`/blade-of-lumia/game/?${p.toString()}`);
    await waitForBoard(page);
    await page.evaluate(() => window.__game.pause());

    const bad = [];
    for (const k of keys) {
      current = k;
      const { rows, cols } = stages[k];
      const { row, col } = firstWalkable(stages[k]);
      const snap = await page.evaluate(({ sk, r, c }) => {
        window.__game.enterStage('field', sk, r, c);
        window.__game.step(2);
        const board = document.getElementById('board');
        return {
          // renderBoard は rows*cols 個の .cell ＋ char-layer を作り直す
          cells: board ? board.querySelectorAll(':scope > .cell').length : 0,
          hasCharLayer: !!document.getElementById('char-layer'),
          hasPlayer: !!document.getElementById('char-player'),
          // ⚠️ stageKey は enterStage 冒頭で代入されるので「入れた」証拠にならない
          //   （stageData が無くても入る）。renderBoard が描いた HUD ラベルを見る。
          label: document.getElementById('hud-stage-label')?.textContent ?? '',
        };
      }, { sk: k, r: row, c: col });
      if (snap.cells !== rows * cols) bad.push(`${k}: セル数 ${snap.cells} ≠ ${rows * cols}（renderBoard が描いていない）`);
      if (!snap.hasCharLayer) bad.push(`${k}: char-layer が無い`);
      if (!snap.hasPlayer) bad.push(`${k}: #char-player が居ない（renderChars 未実行）`);
      if (snap.label !== `[field] ${k}`) bad.push(`${k}: HUD ラベルが "${snap.label}"＝この画面が描かれていない`);
    }
    expect(bad, `画面の起動に失敗:\n${bad.join('\n')}`).toEqual([]);
    expect(errors, `全320画面の起動中に pageerror:\n${errors.join('\n')}`).toEqual([]);
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
