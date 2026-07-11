#!/usr/bin/env node
/**
 * migrate-field-grassland-b.mjs  (Phase 9-6 ⑥-4 — 4th region, 草原G中央〜東・湖ぎわ)
 *
 * Rebuilds the 50 "塗り絵" grassland (G-zone) screens of rows 6-12, cols 0-9 —
 * the map's central-east grassland that the player crosses on the way to the lake
 * dungeon D3 (entrance 9,9). No mapEnters / NPCs live in this block, so every
 * screen is rebuildable (unlike ⑥-3's preserved village 7,14 / D1 6,13).
 *
 * The FACE of the grassland is P1 放射導線 (open radial routes) + P3 軽い狩り場
 * (light hunting-grounds) — §4-2 "G草原 = E巡回中心の軽い狩り場, 放射導線の交差点".
 * So the pattern mix leans P1/P3, unlike the forest (P1 maze), desert (P2 遺跡) or
 * the southern hub (P1 crossroads). See FIELD-9-6-DESIGN.md §8-5 則3.
 *
 * ── Connectivity invariant — the DESERT/HUB "mirror" rule ─────────────────────
 * Grassland is fully-open: every screen's border ring is walkable grass, and the
 * neighbours (forest F west, lake W east, 雪 S NE, 山地 M SE, desert D SW, the
 * rebuilt hub G-A south, and the still-塗り絵 G-C north) are open too. A
 * forest-style narrow backbone would PUNCH SEAMS into the open neighbours, so we
 * MIRROR THE NEIGHBOUR (identical to migrate-field-desert / grassland-a):
 *   - side neighbour missing (map EDGE)            → whole side = 'M' cliff
 *   - neighbour is another rebuilt G-B screen      → whole side = floor (open)
 *   - neighbour is anything else                   → per-cell mirror of its facing
 *       edge: floor where the neighbour cell is walkable, 'M' where it is wall.
 * Proof it adds no seam / trap on any EDGE cell: "I am walkable ⟺ my neighbour's
 * facing cell is walkable", so you can never step off an open edge onto a wall.
 * This removes the 27 G-B-touching seams AND the 27 G-B-touching arrival-wall
 * traps (both the 7 internal and the 20 boundary ones) in one pass.
 *
 * ⚠️ CORNER LIMIT (same as §11-1): a corner cell takes part in two crossings and
 * can't satisfy both when it wedges a rebuilt screen against a still-塗り絵 G-C
 * screen whose corner is a wall. Those are left to the G-C rework (⑥-5); the
 * mirror keeps every EDGE cell seam-free meanwhile.
 *
 * Content lives strictly in the interior (rows2-7 × cols2-9); row1/row8/col1/
 * col10 stay a floor "moat" so every open ring cell reconnects through it
 * regardless of interior water. Each screen is BFS-asserted (all open ring cells
 * + all combat/chest features reachable) and dup-asserted before write.
 *
 * ── Tool-timing (§8-1) ────────────────────────────────────────────────────────
 * Reaching the lake-side grassland the player owns {sword, wooden shield,
 * boomerang} (post-D2, pre-D3). The "try-now" previews are therefore:
 *   - 石押し (stone-push, tool-free): 隠し暴き at 3,8 and a *→S→T block-puzzle 関門
 *     at 6,9 — previewing dungeon stone-button gates.
 *   - ブーメラン隙間越し回収 (a6, owned post-D2): 8,6 — a reward on a tiny island
 *     across a 1-cell water gap, grabbed with the boomerang = a preview of D3's
 *     across-the-water item retrieval.
 * The 弓ゲート (Y→T, arrow-only) at 7,9 is a COME-BACK-LATER near-cut: the bow is
 * D3's own reward, so it can't be opened on the way IN (never required — §8-1).
 * The bomb-wall '!' at 6,11 is likewise a come-back-later cut (bomb = D6 reward).
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

// 50 grassland screens to rebuild (rows 6-12, cols 0-9). No preserved screens.
const GB = new Set([
  '3,6', '4,6', '5,6', '6,6', '7,6', '8,6', '9,6',
  '3,7', '4,7', '5,7', '6,7', '7,7', '8,7',
  '3,8', '4,8', '5,8', '6,8', '7,8',
  '2,9', '3,9', '4,9', '5,9', '6,9', '7,9',
  '0,10', '1,10', '2,10', '3,10', '4,10', '5,10', '6,10', '7,10',
  '0,11', '1,11', '2,11', '3,11', '4,11', '5,11', '6,11', '7,11', '8,11',
  '1,12', '2,12', '3,12', '4,12', '5,12', '6,12', '7,12', '8,12', '9,12',
]);
const REBUILT = new Set([...GB]);

// ── per-screen specs (50 screens) ─────────────────────────────────────────────
// place: [r,c,ch] interior placements (rows2-7, cols2-9 to keep the moat clear).
// data: chest / chest2 / show(condition) / sign / links.
const S = (pattern, place = [], data = null) => ({ pattern, place, data });
const rupee = (v) => ({ type: 'rupee', value: v, name: `ルピー×${v}` });
const heal = () => ({ type: 'item', item: 'healPotion', name: '回復薬（小）' });

const SCREENS = {
  // ══ West edge — forest border lanes (cols 3, rows6-8) ════════════════════════
  '3,6': S('P1', [
    // forest-edge lane splitting N/E/S; a bush at a copse dead-end (secret).
    [2, 4, 't'], [3, 4, 't'], [4, 4, 't'], [3, 7, 't'], [6, 6, 't'],
    [6, 7, 't'], [5, 8, 'u'], [2, 8, 't'],
  ]),
  '3,7': S('P1', [
    // trees fork the path around a lone bush (secret + route).
    [2, 5, 't'], [2, 6, 't'], [4, 3, 't'], [5, 3, 't'], [6, 7, 't'],
    [7, 7, 't'], [4, 7, 'u'], [3, 8, 't'],
  ]),
  '3,8': S('P2', [
    // 石押し・ブロックパズル関門 (tool-free preview): push the '*' DOWN col7 onto the
    // 'S' button at 6,7 (wall 'M' at 7,7 stops the stone ON the button, else it
    // slides past and the gate re-closes) → the 'T' gate at 5,5 opens onto a rupee
    // boxed at 4,5. Chest boxed by M on 3 sides so the gate is its only entrance.
    // Vertical push (distinct from 6,9's row push). push: 3,7→..→6,7(S), 7,7=M.
    [4, 5, 'B'], [3, 5, 'M'], [4, 4, 'M'], [4, 6, 'M'], [5, 5, 'T'],
    [4, 7, '*'], [6, 7, 'S'], [7, 7, 'M'], [2, 4, 't'], [2, 8, 't'], [3, 3, 'i'],
  ], {
    links: [{ switchId: '6,7', gateId: '5,5' }],
    chest: { pos: '4,5', content: rupee(10) },
    sign: { pos: '3,3', name: '苔むした石標', lines: ['「石を 印の上へ 運べば 道は開かん」', 'いにしえの 仕掛けの 教え。'] },
  }),

  // ══ Central grassland — radial routes + hunting (cols 4-6, rows6-9) ══════════
  '4,6': S('P1', [
    // three-way copse; trees split the screen, a bush hides a random drop.
    [2, 3, 't'], [2, 4, 't'], [3, 8, 't'], [4, 8, 't'], [6, 3, 't'],
    [6, 4, 't'], [4, 5, 'u'], [5, 7, 't'],
  ]),
  '5,6': S('P1', [
    // the central signpost junction — the radial heart of the east grassland.
    [2, 3, 't'], [2, 8, 't'], [7, 3, 't'], [7, 8, 't'], [4, 4, 't'],
    [4, 7, 't'], [5, 4, 't'], [5, 7, 't'], [3, 6, 'i'], [6, 5, 'u'],
  ], {
    sign: { pos: '3,6', name: '草原の辻の道標', lines: ['東 … 湖と 遺跡への道', '北 … 火の山と 白き峰', '南 … 村への 帰り道'] },
  }),
  '6,6': S('P3', [
    // hunting-ground: a patrol + chaser guard a killAll rupee chest in a copse.
    [2, 4, 't'], [2, 7, 't'], [6, 4, 't'], [6, 7, 't'], [3, 6, 'M'], [5, 6, 'M'],
    [4, 7, 'B'], [3, 3, 'E'], [5, 4, 'C'], [4, 8, 'M'],
  ], {
    chest: { pos: '4,7', content: rupee(20) },
    show: { pos: '4,7', cond: { trigger: 'killAll', message: '⚔ 草原の魔物を一掃した！宝箱が現れた！' } },
  }),
  '4,7': S('P2', [
    // bush-sealed niche: B at 4,4 is boxed by M on 3 sides, entered only by
    // sword-cutting the bush at 4,5 to its east (approached from open 4,6).
    [3, 4, 'M'], [5, 4, 'M'], [4, 3, 'M'], [4, 5, 'u'], [4, 4, 'B'],
    [2, 7, 't'], [6, 3, 't'], [6, 8, 'u'], [2, 3, 't'],
  ], {
    chest: { pos: '4,4', content: rupee(15) },
  }),
  '5,7': S('P1', [
    // tree copse fork with a bush; open rupee reward in a pocket.
    [2, 4, 't'], [3, 4, 't'], [2, 7, 't'], [6, 3, 't'], [6, 7, 't'],
    [7, 7, 't'], [4, 6, 'u'], [4, 8, 'B'],
  ], {
    chest: { pos: '4,8', content: rupee(5) },
  }),
  '6,7': S('P4', [
    // a TWIN-TREE grove landmark (distinct from the hub's single great tree 6,15):
    // two tree clusters flank a stone-floor 'o' clearing with bushes at the roots.
    [3, 4, 't'], [4, 4, 't'], [3, 8, 't'], [4, 8, 't'], [5, 5, 'o'], [5, 6, 'o'],
    [4, 5, 'u'], [4, 7, 'u'], [2, 6, 'o'], [6, 3, 't'],
  ]),
  '7,7': S('P3', [
    // open hunting-ground toward the lake; two chasers + a sentry guard a heal.
    [2, 4, 'M'], [6, 8, 'M'], [3, 8, 'C'], [5, 3, 'C'], [4, 5, 'F'],
    [5, 7, 'M'], [4, 7, 'M'], [4, 6, 'B'],
  ], {
    chest: { pos: '4,6', content: heal() },
    show: { pos: '4,6', cond: { trigger: 'killAll', message: '⚔ 湖畔の守り手を退けた！宝箱が現れた！' } },
  }),
  '4,8': S('P1', [
    // grassy copse fork; trees split E/W with a bush secret.
    [2, 5, 't'], [3, 5, 't'], [4, 5, 't'], [6, 6, 't'], [6, 7, 't'],
    [3, 8, 't'], [5, 3, 'u'], [2, 8, 't'],
  ]),
  '5,8': S('P3', [
    // central hunting-ground; a patrol trio guard a killAll chest behind a copse.
    [2, 3, 't'], [2, 8, 't'], [6, 3, 't'], [6, 8, 't'], [4, 5, 'M'], [4, 7, 'M'],
    [3, 6, 'M'], [4, 6, 'B'], [3, 4, 'E'], [5, 5, 'E'], [5, 7, 'E'],
  ], {
    chest: { pos: '4,6', content: rupee(15) },
    show: { pos: '4,6', cond: { trigger: 'killAll', message: '⚔ 草原の群れを退けた！宝箱が現れた！' } },
  }),

  // ══ Lake-side (cols 7-9, rows6-12) — water crossings, boomerang & bow ════════
  '7,6': S('P1', [
    // lake-approach fork: a brook '~' crossed on a 'v' bridge (obstacle) + trees.
    [3, 4, '~'], [4, 4, '~'], [4, 5, 'v'], [4, 6, '~'], [5, 4, '~'],
    [2, 7, 't'], [6, 7, 't'], [6, 3, 'u'], [2, 3, 't'],
  ]),
  '8,6': S('P2', [
    // ブーメラン隙間越し回収 (a6 preview): a LARGE-RUPEE floor item 'R' sits on a tiny
    // island ringed by water '~' with no bridge, so the only way to grab it is to
    // throw the boomerang (owned post-D2) across the '~' — collectFieldItem picks
    // up 'R' along the boomerang's flight (player.js:collectFieldItem). Previews
    // D3's across-the-water item retrieval. secret('R'-behind-water) + route. The
    // 'R' is NOT a walk feature (it's water-locked on purpose), so the BFS skips it
    // (only 'ECFB' are walk-checked). A hint sign teaches the throw.
    [3, 5, '~'], [3, 6, '~'], [3, 7, '~'], [4, 5, '~'], [4, 7, '~'],
    [5, 5, '~'], [5, 6, '~'], [5, 7, '~'], [4, 6, 'R'], [2, 3, 't'], [6, 8, 'u'], [6, 3, 'i'],
  ], {
    sign: { pos: '6,3', name: '湖を望む立札', lines: ['水の向こうの 小島に 光る物。', '投げて 手繰り寄せる 術 (すべ) が要る。'] },
  }),
  '9,6': S('P3', [
    // lakeshore sentry post: an elite 'F' + patrol guard a killAll heal potion.
    [2, 4, 'M'], [6, 3, 'M'], [3, 3, 'E'], [4, 6, 'F'], [6, 7, 'C'],
    [3, 7, 'M'], [4, 7, 'M'], [4, 8, 'B'],
  ], {
    chest: { pos: '4,8', content: heal() },
    show: { pos: '4,8', cond: { trigger: 'killAll', message: '⚔ 岸辺の精鋭を倒した！宝箱が現れた！' } },
  }),
  '8,7': S('P1', [
    // lakeshore water crossing: a '~' inlet spanned by a 'v' bridge (obstacle).
    [3, 5, '~'], [4, 5, '~'], [4, 6, 'v'], [4, 7, '~'], [5, 5, '~'],
    [6, 5, '~'], [2, 3, 't'], [6, 8, 'u'], [2, 8, 't'],
  ]),
  '6,8': S('P1', [
    // a brook fork with a bridge + a bush secret pocket.
    [3, 6, '~'], [4, 6, '~'], [4, 5, 'v'], [4, 7, '~'], [5, 6, '~'],
    [2, 4, 't'], [6, 3, 't'], [3, 3, 'u'], [6, 8, 't'],
  ]),
  '7,8': S('P1', [
    // lake inlet crossing (borders lake 8,8); brook + bridge + open rupee.
    [2, 5, '~'], [3, 5, '~'], [4, 5, 'v'], [4, 4, '~'], [5, 5, '~'],
    [6, 5, '~'], [2, 8, 't'], [6, 3, 'u'], [3, 8, 'B'],
  ], {
    chest: { pos: '3,8', content: rupee(5) },
  }),

  // ══ Row 9 — mid grassland toward the lake dungeon (cols 2-7) ═════════════════
  '2,9': S('P2', [
    // forest-corner grove: bushes + a killAll-sealed rupee guarded by a patrol.
    [2, 4, 't'], [3, 4, 't'], [2, 8, 't'], [6, 8, 't'], [4, 6, 'u'], [7, 3, 'u'],
    [3, 7, 'E'], [5, 5, 'B'],
  ], {
    chest: { pos: '5,5', content: rupee(15) },
    show: { pos: '5,5', cond: { trigger: 'killAll', message: '🌿 森影の見張りを退けた！宝箱が現れた！' } },
  }),
  '3,9': S('P3', [
    // hunting-ground; a chaser pair + patrol guard a killAll chest.
    [2, 3, 't'], [2, 8, 't'], [6, 4, 'M'], [6, 7, 'M'], [4, 5, 'M'], [4, 7, 'M'],
    [4, 6, 'B'], [3, 4, 'C'], [5, 6, 'C'], [3, 7, 'E'],
  ], {
    chest: { pos: '4,6', content: rupee(20) },
    show: { pos: '4,6', cond: { trigger: 'killAll', message: '⚔ 草原の魔物を一掃した！宝箱が現れた！' } },
  }),
  '4,9': S('P1', [
    // crossroads copse; trees at the four copse corners split the routes.
    [2, 4, 't'], [2, 7, 't'], [7, 4, 't'], [7, 7, 't'], [4, 5, 't'],
    [4, 6, 't'], [5, 5, 'u'], [5, 6, 't'],
  ]),
  '5,9': S('P1', [
    // brook fork with a bridge crossing toward the lake.
    [2, 5, '~'], [3, 5, '~'], [4, 5, 'v'], [4, 6, '~'], [5, 5, '~'],
    [2, 8, 't'], [6, 3, 't'], [6, 8, 'u'], [7, 4, 't'],
  ]),
  '6,9': S('P2', [
    // 石押し・ブロックパズル関門 (tool-free): push the '*' RIGHT along row6 onto the
    // 'S' button → the 'T' gate at 4,6 opens onto a heal in a boxed niche. A wall
    // 'M' at 6,8 stops the stone ON the button (else it slides past and the gate
    // re-closes). A bush secret gives a distinct 2nd axis. Deeper stone-puzzle
    // preview (§4-1補) — needs no tool = playable now. push: 6,3→..→6,7(S), 6,8=M.
    [4, 6, 'T'], [3, 7, 'M'], [5, 7, 'M'], [4, 8, 'M'], [4, 7, 'B'],
    [6, 3, '*'], [6, 7, 'S'], [6, 8, 'M'], [2, 5, 't'], [2, 8, 'u'],
  ], {
    links: [{ switchId: '6,7', gateId: '4,6' }],
    chest: { pos: '4,7', content: heal() },
  }),
  '7,9': S('P2', [
    // 弓ゲート COME-BACK 近道 (Y→T, arrow-only): the 'Y' switch at 4,4 is ringed by
    // water '~' so the player can never stand next to it (no sword toggle) — only
    // an arrow shot east along row4 (flies over the water) hits it, opening the 'T'
    // gate at 4,8. The rupee chest at 3,8 is boxed by M on 3 sides so the gate is
    // its ONLY entrance. Bow = D3's own reward → cannot be opened on the way IN
    // (never required, §8-1). Hint sign = the "come back" nudge; a bush = try-now.
    [3, 4, '~'], [4, 3, '~'], [4, 4, 'Y'], [4, 5, '~'], [5, 4, '~'],
    [2, 8, 'M'], [3, 7, 'M'], [3, 9, 'M'], [3, 8, 'B'], [4, 8, 'T'],
    [6, 3, 'u'], [6, 8, 't'], [2, 6, 'i'],
  ], {
    links: [{ switchId: '4,4', gateId: '4,8' }],
    chest: { pos: '3,8', content: rupee(30) },
    sign: { pos: '2,6', name: '湖畔の的 (まと)', lines: ['水の向こうの 石の目。', '射抜く 力を得た 者だけが 先へ。'] },
  }),

  // ══ West grassland — forest/desert border (cols 0-3, rows10-12) ══════════════
  '0,10': S('P1', [
    // west-edge lane (map edge left → 'M' cliff via mirror); trees + a bush.
    [2, 4, 't'], [3, 4, 't'], [4, 4, 't'], [6, 6, 't'], [6, 7, 't'],
    [3, 7, 't'], [5, 8, 'u'], [2, 8, 't'],
  ]),
  '1,10': S('P2', [
    // bush-sealed niche rupee (distinct box from 4,7): B at 5,6 walled except the
    // bush at 4,6 above it (approached from open 3,6).
    [4, 5, 'M'], [5, 5, 'M'], [6, 5, 'M'], [4, 7, 'M'], [5, 7, 'M'], [6, 6, 'M'],
    [4, 6, 'u'], [5, 6, 'B'], [2, 3, 't'], [2, 8, 't'], [3, 8, 'u'],
  ], {
    chest: { pos: '5,6', content: rupee(15) },
  }),
  '2,10': S('P4', [
    // a RUINED SHRINE landmark: 'o' stone-floor plaza + '#' pillars + a 石碑 sign.
    [2, 5, '#'], [2, 6, '#'], [3, 5, 'o'], [3, 6, 'o'], [4, 5, 'o'], [4, 6, 'o'],
    [3, 4, 'M'], [4, 7, 'M'], [4, 4, 'i'], [6, 8, 'u'],
  ], {
    sign: { pos: '4,4', name: '草原の古祠', lines: ['旅の 無事を 祈る 小さな祠。', '西の森、南の砂 — 道は ここで 交わる。'] },
  }),
  '3,10': S('P3', [
    // hunting-ground; patrols guard a killAll chest in a rock pocket.
    [2, 4, 't'], [2, 7, 't'], [6, 3, 'M'], [6, 8, 'M'], [4, 5, 'M'], [4, 7, 'M'],
    [4, 6, 'B'], [3, 5, 'E'], [5, 4, 'E'], [3, 8, 'C'],
  ], {
    chest: { pos: '4,6', content: rupee(20) },
    show: { pos: '4,6', cond: { trigger: 'killAll', message: '⚔ 草原の魔物を一掃した！宝箱が現れた！' } },
  }),
  '4,10': S('P1', [
    // crossroads copse (distinct tree pattern); a bush + open rupee pocket.
    [2, 5, 't'], [2, 6, 't'], [7, 5, 't'], [7, 6, 't'], [4, 4, 't'],
    [4, 8, 't'], [5, 3, 'u'], [3, 8, 'B'],
  ], {
    chest: { pos: '3,8', content: rupee(5) },
  }),
  '5,10': S('P1', [
    // brook fork + bridge (distinct water shape from 5,9); bush pocket.
    [3, 4, '~'], [3, 5, '~'], [3, 6, 'v'], [3, 7, '~'], [4, 6, '~'],
    [5, 6, '~'], [2, 3, 't'], [6, 8, 't'], [6, 3, 'u'],
  ]),
  '6,10': S('P1', [
    // junction toward the lake; trees split the lanes, a bush secret pocket.
    [2, 4, 't'], [2, 8, 't'], [6, 3, 't'], [6, 8, 't'], [4, 5, 't'],
    [5, 5, 't'], [4, 7, 'u'], [3, 6, 't'],
  ]),
  '7,10': S('P3', [
    // lakeshore sentry (borders lake 8,10); elite guards a killAll chest.
    [2, 5, 'M'], [6, 8, 'M'], [3, 3, 'C'], [4, 6, 'F'], [6, 3, 'E'],
    [3, 7, 'M'], [5, 7, 'M'], [4, 7, 'B'],
  ], {
    chest: { pos: '4,7', content: heal() },
    show: { pos: '4,7', cond: { trigger: 'killAll', message: '⚔ 岸辺の番兵を退けた！宝箱が現れた！' } },
  }),

  // ══ Row 11 (cols 0-8) ════════════════════════════════════════════════════════
  '0,11': S('P1', [
    // west-edge lane (map edge left → mirror cliff); trees fork N/S, bush secret.
    [2, 5, 't'], [3, 5, 't'], [4, 5, 't'], [6, 7, 't'], [7, 7, 't'],
    [3, 8, 't'], [5, 3, 'u'], [2, 8, 't'],
  ]),
  '1,11': S('P3', [
    // hunting-ground between forest & the shrine; chasers guard a killAll chest.
    [2, 4, 't'], [2, 8, 't'], [6, 4, 'M'], [6, 7, 'M'], [4, 6, 'M'], [3, 6, 'M'],
    [4, 5, 'B'], [3, 4, 'C'], [5, 6, 'C'], [5, 3, 'E'],
  ], {
    chest: { pos: '4,5', content: rupee(15) },
    show: { pos: '4,5', cond: { trigger: 'killAll', message: '⚔ 草原の群れを退けた！宝箱が現れた！' } },
  }),
  '2,11': S('P2', [
    // bush-sealed grove (distinct box: bush to the LEFT of the chest): B at 4,6 is
    // boxed by M on top/bottom/right, entered only by sword-cutting the bush at 4,5
    // to its west (approached from open 4,4). A 2nd bush gives another secret.
    [3, 6, 'M'], [5, 6, 'M'], [4, 7, 'M'], [4, 5, 'u'], [4, 6, 'B'],
    [2, 4, 't'], [6, 8, 'u'], [6, 3, 't'], [3, 3, 't'],
  ], {
    chest: { pos: '4,6', content: rupee(10) },
  }),
  '3,11': S('P2', [
    // bush-sealed rupee (distinct box orientation — bush BELOW the chest): B at 4,6
    // is boxed by M on top+sides, entered only by sword-cutting the bush at 5,6
    // below it (approached from open 6,6).
    [3, 6, 'M'], [4, 5, 'M'], [4, 7, 'M'], [4, 6, 'B'], [5, 6, 'u'],
    [6, 3, 't'], [6, 8, 't'], [2, 8, 'u'], [2, 4, 't'],
  ], {
    chest: { pos: '4,6', content: rupee(15) },
  }),
  '4,11': S('P1', [
    // crossroads signpost toward the village/D1 south; trees + a bush.
    [2, 4, 't'], [2, 7, 't'], [7, 4, 't'], [7, 7, 't'], [4, 5, 't'],
    [4, 6, 't'], [3, 6, 'i'], [5, 4, 'u'],
  ], {
    sign: { pos: '3,6', name: '南への道標', lines: ['南 … 村と 城下へ', '北 … 湖と 峰の道', '迷わば 川の音を 頼れ。'] },
  }),
  '5,11': S('P3', [
    // hunting-ground (distinct box orientation from 5,8); a patrol trio guard a
    // killAll chest tucked against the west with the pocket open to the east.
    [2, 4, 't'], [2, 7, 't'], [6, 4, 't'], [6, 7, 't'], [3, 5, 'M'], [5, 5, 'M'],
    [4, 4, 'M'], [4, 5, 'B'], [3, 7, 'E'], [4, 8, 'E'], [5, 7, 'E'],
  ], {
    chest: { pos: '4,5', content: rupee(20) },
    show: { pos: '4,5', cond: { trigger: 'killAll', message: '⚔ 草原の群れを一掃した！宝箱が現れた！' } },
  }),
  '6,11': S('P2', [
    // ruined outpost with a cracked wall: B at 3,5 boxed by M on 3 sides + a
    // breakable '!' below (4,5). Only approach = bombing '!' (bomb = D6 reward →
    // come-back-later near-cut, never required, §8-1). A bush + hint sign give the
    // try-now axis.
    [2, 5, 'M'], [3, 4, 'M'], [3, 6, 'M'], [4, 5, '!'], [3, 5, 'B'],
    [5, 8, 'u'], [6, 3, 't'], [2, 8, 't'], [6, 7, 'i'],
  ], {
    chest: { pos: '3,5', content: rupee(25) },
    sign: { pos: '6,7', name: '罅の入った砦跡', lines: ['この岩壁、脆く 罅が走っている。', '砕く力あらば 眠る宝が 出よう。'] },
  }),
  '7,11': S('P1', [
    // lakeshore fork; a brook + bridge (obstacle) + a bush.
    [3, 5, '~'], [4, 5, '~'], [4, 6, 'v'], [4, 7, '~'], [5, 5, '~'],
    [2, 3, 't'], [6, 8, 't'], [6, 3, 'u'], [2, 8, 't'],
  ]),
  '8,11': S('P1', [
    // lakeshore crossing (borders lake 9,11); brook spanned by a bridge + rupee.
    [2, 5, '~'], [3, 5, '~'], [4, 5, 'v'], [4, 4, '~'], [5, 5, '~'],
    [6, 5, '~'], [2, 8, 't'], [6, 8, 'u'], [3, 3, 'B'],
  ], {
    chest: { pos: '3,3', content: rupee(5) },
  }),

  // ══ Row 12 (cols 1-9) — southern edge toward the hub / D1 ════════════════════
  '1,12': S('P3', [
    // southern hunting-ground (borders desert 0,12 SW & hub 1,13); killAll chest.
    [2, 4, 't'], [2, 8, 't'], [6, 4, 'M'], [6, 7, 'M'], [4, 5, 'M'], [4, 7, 'M'],
    [4, 6, 'B'], [3, 5, 'E'], [5, 6, 'E'], [3, 8, 'C'],
  ], {
    chest: { pos: '4,6', content: rupee(15) },
    show: { pos: '4,6', cond: { trigger: 'killAll', message: '⚔ 草原の魔物を退けた！宝箱が現れた！' } },
  }),
  '2,12': S('P4', [
    //崩れた廃屋の landmark: 'h' house-wall ruin + 'o' stone floor + a bush secret.
    // distinct from the 2,10 shrine (buildings, not a plaza).
    [2, 4, 'h'], [2, 5, 'h'], [2, 6, 'h'], [3, 4, 'o'], [3, 5, 'o'], [3, 6, 'o'],
    [4, 5, 'o'], [3, 8, 'M'], [5, 4, 'u'], [6, 7, 't'],
  ]),
  '3,12': S('P1', [
    // lane toward the hub; trees split E/S, a bush pocket + open rupee.
    [2, 4, 't'], [3, 4, 't'], [2, 8, 't'], [6, 6, 't'], [6, 7, 't'],
    [4, 8, 't'], [5, 3, 'u'], [4, 6, 'B'],
  ], {
    chest: { pos: '4,6', content: rupee(5) },
  }),
  '4,12': S('P1', [
    // crossroads copse (distinct); trees + a bush secret.
    [2, 5, 't'], [2, 6, 't'], [7, 4, 't'], [7, 8, 't'], [4, 4, 't'],
    [4, 8, 't'], [5, 6, 'u'], [3, 4, 't'],
  ]),
  '5,12': S('P3', [
    // hunting-ground; chasers + a sentry guard a killAll heal potion.
    [2, 4, 't'], [2, 7, 't'], [6, 3, 'M'], [6, 8, 'M'], [4, 5, 'M'], [3, 6, 'M'],
    [4, 6, 'B'], [3, 4, 'C'], [5, 7, 'C'], [4, 7, 'F'],
  ], {
    chest: { pos: '4,6', content: heal() },
    show: { pos: '4,6', cond: { trigger: 'killAll', message: '⚔ 精鋭を退けた！宝箱が現れた！' } },
  }),
  '6,12': S('P1', [
    // fork just north of the D1 entrance (6,13 preserved below); trees + a bush.
    [2, 4, 't'], [3, 4, 't'], [2, 8, 't'], [6, 3, 't'], [6, 7, 't'],
    [3, 7, 't'], [5, 8, 'u'], [4, 5, 't'],
  ]),
  '7,12': S('P2', [
    // bush-sealed pocket (distinct box: bush ABOVE the chest, near the E edge): B at
    // 5,7 is boxed by M on bottom/sides, entered only by sword-cutting the bush at
    // 4,7 above it (approached from open 3,7). A 2nd bush gives another secret.
    [5, 6, 'M'], [6, 7, 'M'], [5, 8, 'M'], [4, 7, 'u'], [5, 7, 'B'],
    [2, 4, 't'], [6, 3, 'u'], [2, 8, 't'], [3, 3, 't'],
  ], {
    chest: { pos: '5,7', content: rupee(10) },
  }),
  '8,12': S('P3', [
    // lakeshore sentry (borders lake 8,11 N & hub 8,13 S); elite + killAll chest.
    [2, 4, 'M'], [6, 3, 'M'], [3, 3, 'E'], [4, 6, 'F'], [6, 8, 'C'],
    [3, 7, 'M'], [5, 7, 'M'], [4, 7, 'B'],
  ], {
    chest: { pos: '4,7', content: rupee(20) },
    show: { pos: '4,7', cond: { trigger: 'killAll', message: '⚔ 岸辺の精鋭を倒した！宝箱が現れた！' } },
  }),
  '9,12': S('P3', [
    // SE corner hunting-ground (borders 山地 M 10,12 E & lake 9,11 N); two elites
    // guard a killAll chest — the tougher lakeside gauntlet.
    [2, 4, 'M'], [2, 8, 'M'], [6, 4, 'M'], [6, 8, 'M'], [4, 5, 'F'], [4, 7, 'F'],
    [3, 6, 'C'], [5, 6, 'B'],
  ], {
    chest: { pos: '5,6', content: rupee(25) },
    show: { pos: '5,6', cond: { trigger: 'killAll', message: '⚔ 峠の精鋭を退けた！宝箱が現れた！' } },
  }),
};

// ── builders (identical mirror-ring approach to grassland-a / desert) ─────────
function mirrorRing(field, key) {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(FLOOR));
  const [sx, sy] = key.split(',').map(Number);

  const crossingsAt = (r, c) => {
    const out = [];
    if (r === 0) out.push([`${sx},${sy - 1}`, ROWS - 1, c]);          // up
    if (r === ROWS - 1) out.push([`${sx},${sy + 1}`, 0, c]);          // down
    if (c === 0) out.push([`${sx - 1},${sy}`, r, COLS - 1]);          // left
    if (c === COLS - 1) out.push([`${sx + 1},${sy}`, r, 0]);          // right
    return out;
  };

  const ringCells = [];
  for (let c = 0; c < COLS; c++) { ringCells.push([0, c]); ringCells.push([ROWS - 1, c]); }
  for (let r = 1; r < ROWS - 1; r++) { ringCells.push([r, 0]); ringCells.push([r, COLS - 1]); }

  // Per-cell mirror (same as ⑥-3 grassland-a): a ring cell is floor iff SOME
  // crossing it takes part in faces an open neighbour cell. EDGE cells have one
  // crossing, so "I open ⟺ my neighbour's facing cell open" holds exactly = no
  // seam, no trap on any edge. CORNERS take part in two crossings and are the sole
  // residual (§11-1 corner limit): when a corner wedges this screen against a
  // still-塗り絵 neighbour (forest F west / lake W east / G-C north / hub G-A south)
  // whose facing corner is a wall, opening it (this OR) leaves an arrival-wall trap
  // on the diagonal — but AND-walling it instead just moves the trap to the
  // neighbour's open corner (measured: OR 88 < AND 90 traps here, since G-B's
  // non-rebuilt neighbours have more open corners than wall corners). These corner
  // mismatches vanish when the neighbour region is reworked (⑥-5..⑥-9 force both
  // sides open). The floor moat carries every open edge cell, so corners are never
  // load-bearing for connectivity.
  for (const [r, c] of ringCells) {
    let open = false, constrained = false;
    for (const [nk, nr, nc] of crossingsAt(r, c)) {
      const ns = field[nk];
      if (!ns) continue;                 // map edge → no crossing constraint
      constrained = true;
      if (REBUILT.has(nk)) { open = true; continue; }  // rebuilt–rebuilt: both floor
      if (!isHardBlocked(ns.tiles[nr]?.[nc])) open = true;  // neighbour open here
    }
    g[r][c] = (constrained && open) ? FLOOR : WALL;
  }
  return g;
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
  // Combat/chest features must be reachable on foot. (A boomerang-island reward is
  // a floor-item 'R', not in this set, so it is correctly NOT walk-checked — it is
  // intentionally water-locked and grabbed by throwing.)
  for (const [r, c, ch] of spec.place) {
    if (!'ECFB'.includes(ch)) continue;
    if (!reach.has(`${r},${c}`))
      throw new Error(`feature '${ch}' @ ${r},${c} unreachable inside ${key}`);
  }
}

// ── apply ─────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

for (const k of GB) if (!field[k]) throw new Error(`missing G-B stage ${k}`);
for (const k of Object.keys(SCREENS)) {
  if (!GB.has(k)) throw new Error(`bad spec key ${k} (not in G-B set)`);
}
for (const k of GB) if (!SCREENS[k]) throw new Error(`G-B screen ${k} has no spec (would stay 塗り絵)`);

const seenLayouts = new Map();
let touched = 0;

for (const [key, spec] of Object.entries(SCREENS)) {
  const stage = field[key];
  if (stage.rows !== ROWS || stage.cols !== COLS)
    throw new Error(`unexpected size on ${key}: ${stage.rows}x${stage.cols}`);

  const g = mirrorRing(field, key);
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

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── report the density basis ─────────────────────────────────────────────────
const byPat = {};
for (const spec of Object.values(SCREENS)) byPat[spec.pattern] = (byPat[spec.pattern] || 0) + 1;
console.log(`9-6 ⑥-4 grassland G-B (central-east, lake-side): ${touched} screens rebuilt`);
console.log('  pattern 配分:', JSON.stringify(byPat));
