#!/usr/bin/env node
/**
 * migrate-field-grassland-c.mjs  (Phase 9-6 ⑥-5 — 5th region, 草原G北・火山/雪ぎわ)
 *
 * Rebuilds the 34 塗り絵 grassland (G-zone) screens of rows 1-5 — the NORTH
 * grassland the player climbs toward the volcano dungeon D4 (entrance 12,2, NE)
 * and, later, the snow dungeon D5 (entrance 13,5, E). One screen is PRESERVED:
 *   - 8,1  : the dark-tower warp island (mapEnters darkTower/islandToTower). It is
 *            the §7-5 論点1 allowlist screen (currently UNREACHABLE = 9-2T scope),
 *            so it is NOT rebuilt; its neighbours simply mirror against its walls
 *            (the tower seams 7,1→8,1 / 8,2→8,1 / 9,1→8,1 are pre-existing residual).
 *
 * The FACE of this northern corridor is P1 放射導線 (open climbing routes) + P3
 * 狩り場 (light hunting grounds toward the harsh peaks) — §4-2 "G草原".
 * Mix: P1×18 / P2×7 / P3×6 / P4×3 (34 screens).
 *
 * ── Connectivity invariant — the DESERT/HUB/G-B "mirror" rule (OR version) ─────
 * Grassland is fully-open, and the neighbours (forest F west, 山 ^ north, tower T
 * / village K north-centre, 火山 L NE, 雪 S E, and the rebuilt G-B south) are open
 * too. A forest-style narrow backbone would PUNCH SEAMS into the open neighbours,
 * so we MIRROR THE NEIGHBOUR (identical to grassland-a/-b, desert):
 *   - side neighbour missing (map EDGE)            → whole side = 'M' cliff
 *   - neighbour is another rebuilt G-C screen      → whole side = floor (open)
 *   - neighbour is anything else (incl. preserved
 *     8,1 / G-B / F / ^ / T / K / L / S)           → per-cell mirror of its facing
 *       edge: floor where the neighbour cell is walkable, 'M' where it is wall.
 * Proof (EDGE cells): "I am walkable ⟺ my neighbour's facing cell is walkable", so
 * you can never step off an open edge onto a wall = no seam / no trap on any edge.
 * CORNER cells take part in two crossings and can't satisfy both when they wedge a
 * rebuilt screen against a still-塗り絵 neighbour (forest F / 山 ^ / snow S / volcano
 * L) whose facing corner is a wall — those residuals vanish when that neighbour
 * region is reworked (⑥-6..⑥-9). OR was measured cheaper than AND in ⑥-4.
 *
 * Content lives strictly in the interior (rows2-7 × cols2-9); row1/row8/col1/col10
 * stay a floor "moat" so every open ring cell reconnects through it regardless of
 * interior water. Each screen is BFS-asserted (open ring cells + combat/chest
 * features reachable) and dup-asserted before write.
 *
 * ── Tool-timing (§8-1, STRICT rule — overrides the loose PLAN ⑥-5 note) ─────────
 * Reaching the north grassland the player owns {sword, shield, boomerang, BOW}
 * (post-D3, pre-D4). So the "try-now" previews are:
 *   - 弓ゲート (Y→T, arrow-only) @ 11,3 : the bow IS owned here (D3 reward) → this is
 *     a genuine try-now, unlike G-B's come-back bow gate. Shoot the water-ringed 'Y'.
 *   - 石押し・ブロックパズル関門 (*→S→T, tool-free) @ 6,4 : previews dungeon stone gates.
 * The かがり火 (H + torchesLit sealed 'B') @ 10,2 is a COME-BACK-LATER near-cut, NOT a
 * preview: candle = D4's OWN reward, so it can't be lit on the way IN (never
 * required, §8-1). The PLAN ⑥-5 note "かがり火予告編(ロウソクはD4報酬∴D4手前に置ける)"
 * conflicts with §8-1's strict rule → corrected to come-back (see DECISIONS 2026-07-12).
 * The bomb-wall '!' @ 4,2 is likewise a come-back-later cut (bomb = D6 reward).
 *
 * bgTiles (grass 'g') untouched. Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const ROWS = 10, COLS = 12;
const FLOOR = '.';
const WALL = 'M'; // rock/cliff (hard-blocked, counts as INTERNAL_TERRAIN → route axis)

// 35 north-grassland screens. PRESERVED (existing designed content, NOT rebuilt):
//   - 8,1 : dark-tower warp island (mapEnters darkTower/islandToTower; §7-5 論点1).
//   - 5,3 : the 廃城・廃村 ruins area (Phase 6-3 — two 石碑 signData + a heartContainer
//           chest). Already ≥2-axis (landmark+secret+combat), so it is NOT 塗り絵 and
//           must be kept verbatim (tests/ruined-areas.spec.js + heart-containers).
// The 7,3 hidden heartContainer IS rebuilt (it was an empty 塗り絵 field) but its
// heart chest at 4,8 is preserved inside a P2 secret. So REBUILT = 33.
const PRESERVED = new Set(['8,1', '5,3']);
const GC = new Set([
  '5,1', '6,1', '7,1', '8,1', '9,1',
  '4,2', '5,2', '6,2', '7,2', '8,2', '9,2', '10,2',
  '4,3', '5,3', '6,3', '7,3', '8,3', '9,3', '10,3', '11,3',
  '4,4', '5,4', '6,4', '7,4', '8,4', '9,4', '10,4', '11,4',
  '4,5', '5,5', '6,5', '7,5', '8,5', '9,5', '10,5',
]);
const REBUILT = new Set([...GC].filter((k) => !PRESERVED.has(k)));

// ── per-screen specs (34 screens) ─────────────────────────────────────────────
const S = (pattern, place = [], data = null) => ({ pattern, place, data });
const rupee = (v) => ({ type: 'rupee', value: v, name: `ルピー×${v}` });
const heal = () => ({ type: 'item', item: 'healPotion', name: '回復薬（小）' });

const SCREENS = {
  // ══ Row 1 — the northern rim (mountains ^, tower T, village K) ════════════════
  '5,1': S('P1', [
    // NW rim lane (N=^ mtn, W=^ mtn via mirror); trees fork the path, a bush secret.
    [2, 4, 't'], [3, 4, 't'], [4, 4, 't'], [2, 7, 't'], [6, 6, 't'],
    [6, 7, 't'], [5, 8, 'u'], [3, 8, 't'], [7, 4, 't'],
  ]),
  '6,1': S('P2', [
    // below the dark tower (N=T): a bush-sealed niche rupee. B at 4,6 walled on
    // top/bottom/right, entered only by cutting the bush at 4,5 (from open 4,4).
    [3, 6, 'M'], [5, 6, 'M'], [4, 7, 'M'], [4, 5, 'u'], [4, 6, 'B'],
    [2, 4, 't'], [6, 3, 't'], [6, 8, 'u'], [2, 8, 't'],
  ], {
    chest: { pos: '4,6', content: rupee(15) },
  }),
  '7,1': S('P4', [
    // 北の聖域 landmark (N=village K): a stone-floor 'o' sanctuary + '#' pillars +
    // a 石碑 hinting at the altar / the tower to the north. (The actual altar warp is
    // 9-2T scope — this is the visual landmark only.) E faces preserved 8,1 (walled).
    [2, 5, '#'], [2, 6, '#'], [3, 5, 'o'], [3, 6, 'o'], [4, 5, 'o'], [4, 6, 'o'],
    [3, 4, 'M'], [4, 7, 'M'], [5, 5, 'i'], [6, 8, 'u'],
  ], {
    sign: { pos: '5,5', name: '北の聖域跡', lines: ['この 石段の 先に かつて 祭壇が あった。', '空を 舞う 力を得た 者のみ 塔へ 至れると 伝う。'] },
  }),
  '9,1': S('P3', [
    // NE rim hunting-post (N=^, E=^ via mirror; W faces walled tower island): an
    // elite 'F' + patrol guard a killAll chest as the road narrows toward the peaks.
    [2, 4, 'M'], [6, 8, 'M'], [3, 3, 'E'], [4, 6, 'F'], [6, 6, 'C'],
    [3, 7, 'M'], [4, 7, 'M'], [4, 8, 'B'],
  ], {
    chest: { pos: '4,8', content: heal() },
    show: { pos: '4,8', cond: { trigger: 'killAll', message: '⚔ 峰への 見張りを 退けた！宝箱が現れた！' } },
  }),

  // ══ Row 2 — forest border (W), tower island (mid), volcano front (E) ══════════
  '4,2': S('P2', [
    // forest-border ruined wall (W=F, N=^): a cracked '!' wall guards a rupee. Only
    // approach = bombing '!' (bomb = D6 reward → come-back near-cut, never required,
    // §8-1). A bush + hint sign give the try-now axis.
    [2, 6, 'M'], [3, 5, 'M'], [3, 7, 'M'], [4, 6, '!'], [3, 6, 'B'],
    [5, 4, 'u'], [6, 7, 't'], [6, 4, 't'], [2, 8, 'i'],
  ], {
    chest: { pos: '3,6', content: rupee(25) },
    sign: { pos: '2,8', name: '森ぎわの 罅割れ壁', lines: ['苔むした 岩壁に 罅 (ひび) が 走る。', '砕く 力あらば 奥に 眠る宝が 出よう。'] },
  }),
  '5,2': S('P1', [
    // open climbing route; trees split N/E/S, a lone bush secret.
    [2, 5, 't'], [2, 6, 't'], [4, 3, 't'], [5, 3, 't'], [6, 7, 't'],
    [7, 7, 't'], [4, 7, 'u'], [3, 8, 't'],
  ]),
  '6,2': S('P1', [
    // three-way copse junction; trees at the copse corners, a bush hides a drop.
    [2, 3, 't'], [2, 4, 't'], [3, 8, 't'], [4, 8, 't'], [6, 3, 't'],
    [6, 4, 't'], [4, 5, 'u'], [5, 8, 't'], [2, 7, 't'],
  ]),
  '7,2': S('P1', [
    // the north crossroads signpost — village/tower behind, peaks ahead.
    [2, 3, 't'], [2, 8, 't'], [7, 3, 't'], [7, 8, 't'], [4, 4, 't'],
    [4, 7, 't'], [5, 4, 't'], [5, 7, 't'], [3, 6, 'i'], [6, 5, 'u'],
  ], {
    sign: { pos: '3,6', name: '北原の 辻の道標', lines: ['南 … 村と 城下への 帰り道', '東 … 火の山と 白き峰', '北 … 聖域の 跡'] },
  }),
  '8,2': S('P3', [
    // hunting-ground below the tower island (N faces walled 8,1); a patrol trio guard
    // a killAll chest behind a copse.
    [2, 3, 't'], [2, 8, 't'], [6, 3, 't'], [6, 8, 't'], [4, 5, 'M'], [4, 7, 'M'],
    [3, 6, 'M'], [4, 6, 'B'], [3, 4, 'E'], [5, 5, 'E'], [5, 7, 'E'],
  ], {
    chest: { pos: '4,6', content: rupee(15) },
    show: { pos: '4,6', cond: { trigger: 'killAll', message: '⚔ 塔ぎわの 群れを 退けた！宝箱が現れた！' } },
  }),
  '9,2': S('P2', [
    // bush-sealed grove (bush to the LEFT of the chest): B at 4,6 boxed M on
    // top/bottom/right, entered only by cutting the bush at 4,5 (from open 4,4).
    [3, 6, 'M'], [5, 6, 'M'], [4, 7, 'M'], [4, 5, 'u'], [4, 6, 'B'],
    [2, 4, 't'], [6, 8, 'u'], [6, 4, 't'], [3, 3, 't'], [6, 3, 't'],
  ], {
    chest: { pos: '4,6', content: rupee(10) },
  }),
  '10,2': S('P2', [
    // かがり火 COME-BACK 近道 (H + torchesLit; candle = D4's OWN reward → can't be lit on
    // the way IN, NOT a preview — §8-1). Two unlit torches 'H'; lighting BOTH with the
    // candle (owned after D4) reveals a chest 'B'. Placed at the volcano front (E=L).
    // A bush + hint sign give the try-now axis. Volcano-front so 'M' cliffs frame it.
    [3, 5, 'H'], [3, 7, 'H'], [4, 6, 'B'], [2, 6, 'M'], [5, 5, 'M'], [5, 7, 'M'],
    [6, 3, 'u'], [6, 8, 't'], [2, 8, 'i'],
  ], {
    show: { pos: '4,6', cond: { trigger: 'torchesLit', message: '🔥 かがり火が 全て 灯り、宝箱が 現れた！' } },
    sign: { pos: '2,8', name: '火の山の 麓の 篝火跡', lines: ['冷えた 篝火が 二つ。', '炎を 灯す 術を 得た者に 山は 宝を 見せる。'] },
  }),

  // ══ Row 3 — mid climb; forest border (W), bow gate at the volcano corner (E) ══
  '4,3': S('P4', [
    // forest-edge GREAT TREE landmark (W=F): a tree cluster around a stone-floor 'o'
    // clearing with a bush at the roots — the last shade before the open north.
    [3, 4, 't'], [4, 4, 't'], [3, 8, 't'], [4, 8, 't'], [5, 5, 'o'], [5, 6, 'o'],
    [4, 5, 'u'], [4, 7, 'u'], [2, 6, 'o'], [6, 3, 't'],
  ]),
  // 5,3 is PRESERVED (廃城・廃村 ruins, Phase 6-3) — not rebuilt here.
  '6,3': S('P1', [
    // brook fork spanned by a 'v' bridge (obstacle) + a bush pocket.
    [3, 6, '~'], [4, 6, '~'], [4, 5, 'v'], [4, 7, '~'], [5, 6, '~'],
    [2, 4, 't'], [6, 3, 't'], [3, 3, 'u'], [6, 8, 't'], [2, 8, 't'],
  ]),
  '7,3': S('P2', [
    // HIDDEN HEART CONTAINER (preserved from the old field) — reworked from an empty
    // 塗り絵 into a bush-sealed secret grove that KEEPS the heartContainer chest at 4,8.
    // B at 4,8 is boxed by M on top/bottom/east, entered ONLY by sword-cutting the
    // bush at 4,7 to its west (approached from open 4,6). A 2nd bush + a copse give the
    // extra secret/route so the screen reads ≥2-axis.
    [3, 8, 'M'], [5, 8, 'M'], [4, 9, 'M'], [4, 7, 'u'], [4, 8, 'B'],
    [2, 4, 't'], [3, 4, 't'], [6, 6, 't'], [6, 7, 't'], [2, 8, 'u'], [5, 3, 't'],
  ], {
    chest: { pos: '4,8', content: { type: 'heartContainer', name: 'ハートの器' } },
  }),
  '8,3': S('P3', [
    // hunting-ground; chasers + a patrol guard a killAll chest in a rock pocket.
    [2, 3, 't'], [2, 8, 't'], [6, 4, 'M'], [6, 7, 'M'], [4, 5, 'M'], [4, 7, 'M'],
    [4, 6, 'B'], [3, 4, 'C'], [5, 6, 'C'], [3, 7, 'E'], [6, 3, 't'],
  ], {
    chest: { pos: '4,6', content: rupee(20) },
    show: { pos: '4,6', cond: { trigger: 'killAll', message: '⚔ 北原の 魔物を 一掃した！宝箱が現れた！' } },
  }),
  '9,3': S('P1', [
    // route toward the volcano; trees + a brook crossing (obstacle) + a bush.
    [2, 4, '~'], [3, 4, '~'], [3, 5, 'v'], [3, 6, '~'], [4, 4, '~'],
    [2, 8, 't'], [6, 7, 't'], [6, 3, 'u'], [7, 5, 't'],
  ]),
  '10,3': S('P1', [
    // volcano-approach lane; trees fork N/S, a bush secret near the crags.
    [2, 4, 't'], [3, 4, 't'], [2, 8, 't'], [6, 6, 't'], [6, 7, 't'],
    [3, 7, 't'], [5, 8, 'u'], [4, 5, 't'],
  ]),
  '11,3': S('P2', [
    // 弓ゲート TRY-NOW (Y→T, arrow-only): the 'Y' switch at 4,5 is ringed by water '~'
    // so the player can never stand next to it (no sword toggle) — only an arrow shot
    // along a clear lane hits it, opening the 'T' gate at 4,8 onto a boxed rupee. The
    // BOW IS OWNED here (D3 reward, post-D3/pre-D4) so this is a genuine try-now,
    // unlike G-B's come-back bow gate. Volcano corner (N=L, E=L) framed by 'M' cliffs.
    [3, 5, '~'], [4, 4, '~'], [4, 5, 'Y'], [4, 6, '~'], [5, 5, '~'],
    [3, 8, 'M'], [5, 8, 'M'], [4, 9, 'M'], [4, 8, 'B'], [4, 7, 'T'],
    [6, 3, 'u'], [6, 8, 't'], [2, 4, 'i'],
  ], {
    links: [{ switchId: '4,5', gateId: '4,7' }],
    chest: { pos: '4,8', content: rupee(30) },
    sign: { pos: '2,4', name: '火口を 望む 的 (まと)', lines: ['水を 隔てた 石の目。', '弓で 射抜けば 道が 開く — 得た 力を 試せ。'] },
  }),

  // ══ Row 4 — high climb; stone-push puzzle (mid), snow border (E) ══════════════
  '4,4': S('P1', [
    // forest-border lane (W=F); trees fork N/E, a bush secret.
    [2, 5, 't'], [2, 6, 't'], [4, 4, 't'], [5, 4, 't'], [6, 7, 't'],
    [7, 7, 't'], [4, 8, 'u'], [3, 8, 't'],
  ]),
  '5,4': S('P2', [
    // bush-sealed niche (bush BELOW the chest): B at 4,6 boxed M on top/sides, entered
    // only by cutting the bush at 5,6 below it (from open 6,6). A 2nd bush = secret.
    [3, 6, 'M'], [4, 5, 'M'], [4, 7, 'M'], [4, 6, 'B'], [5, 6, 'u'],
    [6, 3, 't'], [6, 8, 't'], [2, 8, 'u'], [2, 4, 't'], [7, 5, 't'],
  ], {
    chest: { pos: '4,6', content: rupee(15) },
  }),
  '6,4': S('P2', [
    // 石押し・ブロックパズル関門 TRY-NOW (tool-free): push the '*' at 3,6 DOWN col6 onto the
    // 'S' button at 6,6 (a wall 'M' at 7,6 stops the stone ON the button, else it
    // slides past and the gate re-closes) → the 'T' gate at 5,4 opens onto a rupee
    // boxed at 4,4 (M on 3 sides so the gate is its only entrance). Previews dungeon
    // stone-button gates. A hint sign teaches the push.
    [4, 4, 'B'], [3, 4, 'M'], [4, 3, 'M'], [4, 5, 'M'], [5, 4, 'T'],
    [3, 6, '*'], [6, 6, 'S'], [7, 6, 'M'], [2, 3, 't'], [2, 8, 't'], [3, 8, 'i'],
  ], {
    links: [{ switchId: '6,6', gateId: '5,4' }],
    chest: { pos: '4,4', content: rupee(10) },
    sign: { pos: '3,8', name: '苔むした 石標', lines: ['「石を 印の上へ 運べば 道は 開かん」', 'いにしえの 仕掛けの 教え。'] },
  }),
  '7,4': S('P3', [
    // hunting-ground; a sentry + chasers guard a killAll heal potion.
    [2, 4, 'M'], [6, 8, 'M'], [3, 8, 'C'], [5, 3, 'C'], [4, 5, 'F'],
    [5, 7, 'M'], [4, 7, 'M'], [4, 6, 'B'], [2, 8, 'M'],
  ], {
    chest: { pos: '4,6', content: heal() },
    show: { pos: '4,6', cond: { trigger: 'killAll', message: '⚔ 北原の 守り手を 退けた！宝箱が現れた！' } },
  }),
  '8,4': S('P1', [
    // grassy copse fork; trees split E/W with a bush secret.
    [2, 5, 't'], [3, 5, 't'], [4, 5, 't'], [6, 6, 't'], [6, 7, 't'],
    [3, 8, 't'], [5, 8, 'u'], [2, 3, 't'],
  ]),
  '9,4': S('P4', [
    // HIGHLAND CAIRN landmark: a ring of standing stones '#' around a stone-floor 'o'
    // circle + a 石碑 — a waymark of the high north, distinct from the 7,1 sanctuary.
    [2, 5, '#'], [2, 6, '#'], [3, 4, '#'], [3, 7, '#'], [4, 5, 'o'], [4, 6, 'o'],
    [3, 5, 'o'], [3, 6, 'o'], [5, 5, 'i'], [6, 8, 'u'],
  ], {
    sign: { pos: '5,5', name: '高原の 環状石', lines: ['旅人が 積んだ 環状の 石。', '東は 白き峰、北は 火の山 — 道は ここで 分かれる。'] },
  }),
  '10,4': S('P3', [
    // hunting-ground toward the snow (borders snow S at 11,4); elite + patrol guard a
    // killAll chest — the tougher gauntlet before the peaks.
    [2, 4, 'M'], [2, 8, 'M'], [6, 4, 'M'], [6, 8, 'M'], [4, 5, 'F'], [4, 7, 'C'],
    [3, 6, 'E'], [5, 6, 'B'],
  ], {
    chest: { pos: '5,6', content: rupee(25) },
    show: { pos: '5,6', cond: { trigger: 'killAll', message: '⚔ 峠の 精鋭を 退けた！宝箱が現れた！' } },
  }),
  '11,4': S('P1', [
    // snow-border lane (E=S, S=S via mirror); trees + a brook crossing + a bush.
    [3, 5, '~'], [4, 5, '~'], [4, 6, 'v'], [4, 7, '~'], [5, 5, '~'],
    [2, 3, 't'], [6, 8, 't'], [6, 3, 'u'], [2, 8, 't'], [6, 6, 't'],
  ]),

  // ══ Row 5 — the seam to G-B (south = rebuilt, floor); snow border (E) ═════════
  '4,5': S('P1', [
    // forest-border lane (W=F); crossroads copse + a bush secret.
    [2, 4, 't'], [2, 7, 't'], [7, 4, 't'], [7, 7, 't'], [4, 5, 't'],
    [4, 6, 't'], [3, 6, 'u'], [5, 4, 't'],
  ]),
  '5,5': S('P3', [
    // hunting-ground; a patrol trio guard a killAll chest tucked against the west.
    [2, 4, 't'], [2, 7, 't'], [6, 4, 't'], [6, 7, 't'], [3, 5, 'M'], [5, 5, 'M'],
    [4, 4, 'M'], [4, 5, 'B'], [3, 7, 'E'], [4, 8, 'E'], [5, 7, 'E'],
  ], {
    chest: { pos: '4,5', content: rupee(20) },
    show: { pos: '4,5', cond: { trigger: 'killAll', message: '⚔ 北原の 群れを 一掃した！宝箱が現れた！' } },
  }),
  '6,5': S('P1', [
    // brook fork + bridge (distinct water shape); a bush pocket.
    [3, 4, '~'], [3, 5, '~'], [3, 6, 'v'], [3, 7, '~'], [4, 6, '~'],
    [5, 6, '~'], [2, 3, 't'], [6, 8, 't'], [6, 3, 'u'], [2, 8, 't'],
  ]),
  '7,5': S('P2', [
    // bush-sealed pocket (bush ABOVE the chest, near the E edge): B at 5,7 boxed M on
    // bottom/sides, entered only by cutting the bush at 4,7 above it (from open 3,7).
    [5, 6, 'M'], [6, 7, 'M'], [5, 8, 'M'], [4, 7, 'u'], [5, 7, 'B'],
    [2, 4, 't'], [6, 3, 'u'], [2, 8, 't'], [3, 4, 't'],
  ], {
    chest: { pos: '5,7', content: rupee(10) },
  }),
  '8,5': S('P1', [
    // open route toward the lake-side (G-B below); trees split the lanes, a bush.
    [2, 4, 't'], [2, 8, 't'], [6, 3, 't'], [6, 8, 't'], [4, 5, 't'],
    [5, 5, 't'], [4, 7, 'u'], [3, 6, 't'], [6, 5, 't'],
  ]),
  '9,5': S('P1', [
    // route; a brook + bridge (obstacle) + an open rupee reward.
    [2, 5, '~'], [3, 5, '~'], [4, 5, 'v'], [4, 4, '~'], [5, 5, '~'],
    [6, 5, '~'], [2, 8, 't'], [6, 8, 'u'], [3, 8, 'B'],
  ], {
    chest: { pos: '3,8', content: rupee(5) },
  }),
  '10,5': S('P1', [
    // snow-border lane (E=S, S=S via mirror); trees fork with a bush secret.
    [2, 4, 't'], [3, 4, 't'], [4, 4, 't'], [6, 6, 't'], [6, 7, 't'],
    [3, 7, 't'], [5, 3, 'u'], [2, 8, 't'],
  ]),
};

// ── builders — AND mirror computed to a FIXED POINT across all rebuilt screens ─
// (corrected 2026-07-12 — the ⑥-4 OR rule was WRONG at corners.)
//
// A ring cell is floor IFF EVERY on-map crossing it takes part in faces an open
// neighbour cell; otherwise wall. Off-map crossings are ignored (the engine clamps at
// the world edge, so stepping toward a non-existent stage never transitions).
//   - EDGE cells have ONE crossing → "I open ⟺ neighbour open".
//   - CORNER cells have TWO crossings → open only if BOTH face open. This is the fix:
//     under OR, an open corner facing one open + one WALL neighbour was a trap SOURCE
//     (step off the open corner → land on the wall). AND walls that corner instead, so
//     NO rebuilt screen is ever the source of an arrival-wall hole. Applied to every
//     region rework, the end state has ZERO arrival-wall holes (the user's plan).
//
// ⚠️ Two rebuilt screens share a corner whose openness is MUTUALLY dependent (A's
// corner may need walling because A faces a wall on its OTHER side; once A walls it, B
// facing A must wall its matching corner too). So we can't assume "rebuilt neighbour =
// open" in a single pass. Instead: start every rebuilt ring all-floor, then repeatedly
// re-evaluate against the CURRENT computed rings until nothing changes. Walling is
// monotone (floor→wall only), so this converges. Preserved/external neighbours use
// their fixed live tiles.
function crossingsOf(sx, sy, r, c) {
  const out = [];
  if (r === 0) out.push([`${sx},${sy - 1}`, ROWS - 1, c]);          // up
  if (r === ROWS - 1) out.push([`${sx},${sy + 1}`, 0, c]);          // down
  if (c === 0) out.push([`${sx - 1},${sy}`, r, COLS - 1]);          // left
  if (c === COLS - 1) out.push([`${sx + 1},${sy}`, r, 0]);          // right
  return out;
}
const RING_CELLS = (() => {
  const cells = [];
  for (let c = 0; c < COLS; c++) { cells.push([0, c]); cells.push([ROWS - 1, c]); }
  for (let r = 1; r < ROWS - 1; r++) { cells.push([r, 0]); cells.push([r, COLS - 1]); }
  return cells;
})();

/** Compute every rebuilt screen's ring to a fixed point. Returns Map<key, grid>. */
function computeAllRings(field) {
  const rings = new Map();
  for (const key of REBUILT) rings.set(key, Array.from({ length: ROWS }, () => Array(COLS).fill(FLOOR)));

  // tile lookup that prefers the in-progress ring for rebuilt screens.
  const ringTileOpen = (nk, nr, nc) => {
    if (rings.has(nk)) return !isHardBlocked(rings.get(nk)[nr][nc]);
    const ns = field[nk];
    return ns ? !isHardBlocked(ns.tiles[nr]?.[nc]) : null;   // null = off-map
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const key of REBUILT) {
      const [sx, sy] = key.split(',').map(Number);
      const g = rings.get(key);
      for (const [r, c] of RING_CELLS) {
        let allPresentOpen = true, hasPresentCrossing = false;
        for (const [nk, nr, nc] of crossingsOf(sx, sy, r, c)) {
          const open = ringTileOpen(nk, nr, nc);
          if (open === null) continue;                 // off-map → ignore
          hasPresentCrossing = true;
          if (!open) allPresentOpen = false;
        }
        const want = (hasPresentCrossing && allPresentOpen) ? FLOOR : WALL;
        if (g[r][c] !== want) { g[r][c] = want; changed = true; }
      }
    }
  }
  return rings;
}

function placeAll(g, place) {
  for (const [r, c, ch] of place) {
    if (r <= 0 || r >= ROWS - 1 || c <= 0 || c >= COLS - 1)
      throw new Error(`feature on ring @ ${r},${c} (interior only)`);
    g[r][c] = ch;
  }
}

// ── verification ────────────────────────────────────────────────────────────
/** Walkable-cell BFS. Hard-blocked tiles block, EXCEPT '*' (pushable) and 'u'
 *  (sword-cuttable) which are treated eventually-walkable for reachability. 'T'
 *  gate / '!' breakable are SOLVABLE (not hard-blocked) so they already pass. */
function walkReach(g, sr, sc) {
  const seen = new Set([`${sr},${sc}`]);
  const q = [[sr, sc]];
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const k = `${nr},${nc}`;
      const ch = g[nr][nc];
      const openable = ch === '*' || ch === 'u';
      if (seen.has(k) || (isHardBlocked(ch) && !openable)) continue;
      seen.add(k); q.push([nr, nc]);
    }
  }
  return seen;
}

function assertScreen(g, key, spec) {
  if (isHardBlocked(g[1][1])) throw new Error(`moat seed (1,1) blocked on ${key}`);
  const reach = walkReach(g, 1, 1);
  for (let c = 0; c < COLS; c++) {
    for (const r of [0, ROWS - 1]) {
      if (!isHardBlocked(g[r][c]) && !reach.has(`${r},${c}`))
        throw new Error(`open ring cell ${r},${c} unreachable on ${key} (would orphan neighbour)`);
    }
  }
  for (let r = 0; r < ROWS; r++) {
    for (const c of [0, COLS - 1]) {
      if (!isHardBlocked(g[r][c]) && !reach.has(`${r},${c}`))
        throw new Error(`open ring cell ${r},${c} unreachable on ${key} (would orphan neighbour)`);
    }
  }
  // Combat/chest features must be reachable on foot ('u' bushes / 'T' gates / '!'
  // walls are passable in walkReach, so boxed chests behind them still pass).
  for (const [r, c, ch] of spec.place) {
    if (!'ECFB'.includes(ch)) continue;
    if (!reach.has(`${r},${c}`))
      throw new Error(`feature '${ch}' @ ${r},${c} unreachable inside ${key}`);
  }

  // DEAD-GATE guard (§11-4): a chest guarded by a link's 'T' gate must be UNREACHABLE
  // when the gate is treated closed — else the gate protects nothing (the G-A/G-B
  // trap where the reward was visible from an adjacent open floor). Only enforced on
  // chests whose position sits behind a gate (i.e. adjacent to a 'T' tile).
  const links = spec.data?.links || [];
  if (links.length) {
    const closed = walkReachGateClosed(g, 1, 1);
    for (const l of links) {
      const [gr, gc] = l.gateId.split(',').map(Number);
      // find the chest cell adjacent to this gate.
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cr = gr + dr, cc = gc + dc;
        if (g[cr]?.[cc] !== 'B') continue;
        if (closed.has(`${cr},${cc}`))
          throw new Error(`DEAD GATE on ${key}: chest @ ${cr},${cc} reachable with gate ${l.gateId} closed`);
      }
    }
  }
}

/** Same BFS as walkReach but 'T' gates are treated CLOSED (hard-blocked) — used to
 *  prove a gated chest is truly gated (unreachable without opening the gate). */
function walkReachGateClosed(g, sr, sc) {
  const seen = new Set([`${sr},${sc}`]);
  const q = [[sr, sc]];
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const k = `${nr},${nc}`;
      const ch = g[nr][nc];
      const openable = ch === '*' || ch === 'u';
      if (seen.has(k) || ch === 'T' || (isHardBlocked(ch) && !openable)) continue;
      seen.add(k); q.push([nr, nc]);
    }
  }
  return seen;
}

// ── apply ─────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

for (const k of GC) if (!field[k]) throw new Error(`missing G-C stage ${k}`);
for (const k of Object.keys(SCREENS)) {
  if (!GC.has(k)) throw new Error(`bad spec key ${k} (not in G-C set)`);
  if (PRESERVED.has(k)) throw new Error(`spec must NOT rebuild preserved screen ${k}`);
}
for (const k of REBUILT) if (!SCREENS[k]) throw new Error(`G-C screen ${k} has no spec (would stay 塗り絵)`);

const seenLayouts = new Map();
let touched = 0;

const rings = computeAllRings(field);   // fixed-point AND mirror across all rebuilt screens

for (const [key, spec] of Object.entries(SCREENS)) {
  const stage = field[key];
  if (stage.rows !== ROWS || stage.cols !== COLS)
    throw new Error(`unexpected size on ${key}: ${stage.rows}x${stage.cols}`);

  const g = rings.get(key);
  placeAll(g, spec.place);
  assertScreen(g, key, spec);

  const hash = g.map((row) => row.join('')).join('|');
  if (seenLayouts.has(hash)) throw new Error(`duplicate layout: ${key} == ${seenLayouts.get(hash)}`);
  seenLayouts.set(hash, key);

  stage.tiles = g.map((row) => row.slice());   // array-of-char-arrays (engine format)

  // reset per-screen data dicts so no stale 塗り絵 chest/condition lingers.
  stage.chestContents = {};
  stage.showConditions = {};
  stage.signData = {};
  stage.links = spec.data?.links ? spec.data.links.map((l) => ({ ...l })) : [];

  const d = spec.data || {};
  for (const ck of ['chest', 'chest2']) {
    if (d[ck]) stage.chestContents[d[ck].pos] = d[ck].content;
  }
  if (d.show) stage.showConditions[d.show.pos] = d.show.cond;
  if (d.sign) {
    const [sr, sc] = d.sign.pos.split(',').map(Number);
    if (stage.tiles[sr][sc] !== 'i')
      throw new Error(`sign on ${key} @ ${d.sign.pos} not on an 'i' tile (=${stage.tiles[sr][sc]})`);
    stage.signData[d.sign.pos] = { name: d.sign.name, lines: d.sign.lines };
  }
  touched++;
}

// ── guard: preserved screens untouched (8,1 keeps its tower mapEnters) ────────
if (!field['8,1'].mapEnters || !Object.keys(field['8,1'].mapEnters).length)
  throw new Error(`preserved screen 8,1 lost its tower mapEnters`);
// 5,3 must keep its 廃城/廃村 石碑 signData + heartContainer chest (Phase 6-3).
if (!field['5,3'].signData?.['3,3'] || !field['5,3'].chestContents?.['8,10'])
  throw new Error(`preserved screen 5,3 lost its ruins signData / heart container`);

// ── guard: no 'i' sign tile without a body ────────────────────────────────────
for (const key of Object.keys(SCREENS)) {
  const stage = field[key];
  for (let r = 0; r < stage.rows; r++)
    for (let c = 0; c < stage.cols; c++) {
      if (stage.tiles[r][c] !== 'i') continue;
      const pk = `${r},${c}`;
      if (!stage.signData?.[pk] && !stage.npcData?.[pk])
        throw new Error(`empty sign on ${key} @ ${pk} (no signData/npcData body)`);
    }
}

// ── guard: every chestContents key must sit on a 'B' tile ─────────────────────
for (const key of Object.keys(SCREENS)) {
  const stage = field[key];
  for (const pk of Object.keys(stage.chestContents)) {
    const [r, c] = pk.split(',').map(Number);
    if (stage.tiles[r][c] !== 'B')
      throw new Error(`chestContents on ${key} @ ${pk} not on a 'B' tile (=${stage.tiles[r][c]})`);
  }
}

// ── guard: every showConditions key must sit on a 'B' tile ────────────────────
for (const key of Object.keys(SCREENS)) {
  const stage = field[key];
  for (const pk of Object.keys(stage.showConditions)) {
    const [r, c] = pk.split(',').map(Number);
    if (stage.tiles[r][c] !== 'B')
      throw new Error(`showConditions on ${key} @ ${pk} not on a 'B' tile (=${stage.tiles[r][c]})`);
  }
}

// ── guard: every links gateId/switchId must sit on the right tile ─────────────
for (const key of Object.keys(SCREENS)) {
  const stage = field[key];
  for (const l of stage.links || []) {
    const [gr, gc] = l.gateId.split(',').map(Number);
    const [swr, swc] = l.switchId.split(',').map(Number);
    if (stage.tiles[gr][gc] !== 'T')
      throw new Error(`link gate on ${key} @ ${l.gateId} not a 'T' (=${stage.tiles[gr][gc]})`);
    const swTile = stage.tiles[swr][swc];
    if (swTile !== 'S' && swTile !== 'Y')
      throw new Error(`link switch on ${key} @ ${l.switchId} not a 'S'/'Y' (=${swTile})`);
  }
}

// ── guard: NO arrival-wall hole sourced from any rebuilt G-C screen ───────────
// The core of the AND rule: every open ring cell of a rebuilt screen must land on a
// walkable cell in the neighbour it faces (or off-map, which the engine clamps). If
// any open cell faces a neighbour WALL, this screen is a trap SOURCE = bug. This is
// what makes "rework every region → zero holes at the end" hold, per the user's plan.
{
  const holes = [];
  for (const key of REBUILT) {
    const [sx, sy] = key.split(',').map(Number);
    const t = field[key].tiles;
    const ring = [];
    for (let c = 0; c < COLS; c++) { ring.push([0, c]); ring.push([ROWS - 1, c]); }
    for (let r = 1; r < ROWS - 1; r++) { ring.push([r, 0]); ring.push([r, COLS - 1]); }
    for (const [r, c] of ring) {
      if (isHardBlocked(t[r][c])) continue;                 // wall cell can't step off
      const crossings = [];
      if (r === 0) crossings.push([`${sx},${sy - 1}`, ROWS - 1, c]);
      if (r === ROWS - 1) crossings.push([`${sx},${sy + 1}`, 0, c]);
      if (c === 0) crossings.push([`${sx - 1},${sy}`, r, COLS - 1]);
      if (c === COLS - 1) crossings.push([`${sx + 1},${sy}`, r, 0]);
      for (const [nk, nr, nc] of crossings) {
        const ns = field[nk];
        if (!ns) continue;                                  // off-map → engine clamps
        if (isHardBlocked(ns.tiles[nr]?.[nc]))
          holes.push(`${key}(${r},${c}) → ${nk}(${nr},${nc})=${ns.tiles[nr][nc]}`);
      }
    }
  }
  if (holes.length)
    throw new Error(`G-C sources ${holes.length} arrival-wall hole(s):\n  ${holes.join('\n  ')}`);
}

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── report the density basis ─────────────────────────────────────────────────
const byPat = {};
for (const spec of Object.values(SCREENS)) byPat[spec.pattern] = (byPat[spec.pattern] || 0) + 1;
console.log(`9-6 ⑥-5 grassland G-C (north, volcano/snow edge): ${touched} screens rebuilt (8,1 tower island preserved)`);
console.log('  pattern 配分:', JSON.stringify(byPat));
