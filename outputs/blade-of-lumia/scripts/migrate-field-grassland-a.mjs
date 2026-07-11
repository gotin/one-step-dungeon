#!/usr/bin/env node
/**
 * migrate-field-grassland-a.mjs  (Phase 9-6 ⑥-3 — 3rd region, 村ハブ＋D1周辺)
 *
 * Rebuilds the 26 "塗り絵" grassland (G-zone) screens of the SOUTHERN HUB
 * (rows 13-18, the village's home block) into the region's ideal form.
 *
 * The hub is the game's STARTING area = the 放射導線の交差点 (radial-crossroads).
 * Its FACE is P1 分岐路 (crossroads / stream-forks) — the screens where the
 * player first asks "which way?". So the pattern mix leans P1, unlike the
 * forest (P1 maze) or desert (P2 遺跡). See FIELD-9-6-DESIGN.md §8-5 則3
 * (地域ごとに顔を変える) and PLAN 9-6 ⑥-3.
 *
 * PRESERVED (never touched — same as forest 2,4 / desert 2,15):
 *   7,14  the village (startPos, 老賢者/村人/諦めた老人 NPCs, guide signs)
 *   6,13  the dungeon_1 + hidden_cave entrance screen (hand-crafted guide NPCs)
 * Both keep their mapEnters/NPCs; we only mirror their EDGES from our side.
 *
 * ── Connectivity invariant — grassland uses the DESERT "mirror" rule ──────────
 * Grassland, like desert, is fully-open: every screen's border ring is walkable
 * grass 'g', and the frozen grass neighbours to the north (row12) are open on
 * ALL 12 bottom cells. A forest-style narrow backbone here would PUNCH SEAMS
 * into the open north (step G→G, land on a wall). So we MIRROR THE NEIGHBOUR
 * (identical to migrate-field-desert.mjs):
 *   - side neighbour missing (map EDGE)            → whole side = 'M' (cliff)
 *   - neighbour is another rebuilt HUB screen      → whole side = floor (open)
 *   - neighbour is anything else (frozen G / preserved village / D-desert /
 *     mountain / sea / D8 / cave_1)                → per-cell mirror of its
 *       facing edge: floor where the neighbour cell is walkable, 'M' where wall.
 * Proof it adds no seam on any EDGE cell: "I am walkable ⟺ my neighbour's facing
 * cell is walkable", so you can never step off an open edge onto a wall.
 *
 * ⚠️ CORNER LIMIT (honest): 8 pre-existing seams around the preserved core stay
 * (7,13→7,14, 8,14→7,14, 6,14→7,14, 5,13→6,13, 6,14→6,13, 7,13→6,13, 7,15→7,14,
 * 9,14→10,14). Each is a CORNER cell that takes part in TWO crossings: the open
 * frozen-grass / mountain edge on one axis wants it OPEN, while the preserved
 * village/D1/D8/cave_1 corner (a tree/fence) on the other axis is a WALL. A
 * corner can't satisfy both — walling it to fix one side just moves the seam to
 * the other (the frozen neighbour's corner is open too). The only true fix is
 * editing a PRESERVED screen's corner, which is out of scope. So this region
 * leaves seam at 88 (adds 0, removes 0) — unlike the desert's −1 bonus, which
 * had a removable NON-corner seam. This is the documented cost of pinning the
 * hub around the hand-crafted village/D1 screens.
 *
 * The southern coast (sea neighbours 3,17/4,18/5,19/6,19/7,18) mirrors to a
 * sealed 'M' cliff on that side — walkable beaches are 論点2/⑥-11 outer-sea
 * scope (density basis measured there first, §10-5). The mirror keeps those
 * edges seam-free in the meantime.
 *
 * Content lives strictly in the interior (rows1-8 × cols1-10); row1/row8/col1/
 * col10 are a floor "moat" so every open ring cell reconnects through it. Each
 * screen is BFS-asserted (all open ring cells + all combat/chest features
 * reachable) and dup-asserted before write.
 *
 * ── Tool-timing (§8-1 / §9-2) ────────────────────────────────────────────────
 * The hub is the EARLIEST area (village → D1 → …). Arriving, the player owns
 * only {sword, wooden shield}. The one "try-now" preview is the tool-free 石押し
 * block puzzle (*→S button→T gate), placed at 7,15 just below the village —
 * previewing D1's stone-button-gate room (verified: dungeon_1 has exactly one
 * *→S→T puzzle). Bush 'u' secrets ARE openable here (the sword cuts bushes —
 * combat.js:344), so they count as immediate rewards, not come-back-later.
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

// 26 hub screens to rebuild (village 7,14 + D1 6,13 preserved, NOT in this set).
const HUB = new Set([
  '2,13', '3,13', '4,13', '5,13', '7,13', '8,13',
  '3,14', '4,14', '5,14', '6,14', '8,14', '9,14',
  '3,15', '4,15', '5,15', '6,15', '7,15', '8,15',
  '4,16', '5,16', '6,16',
  '4,17', '5,17', '6,17',
  '5,18', '6,18',
]);
// The southern coast: the 5 sea ('~') screens that touch the hub's south edge.
// Per PLAN ⑥-3 / §10, each region is built TOGETHER WITH its adjacent outer ring
// — the hub's south shore is 村南の海岸, made walkable here (not punted to ⑥-11).
const COAST = new Set(['3,17', '4,18', '5,19', '6,19', '7,18']);
// Both hub and coast are "rebuilt", so mirrorRing forces the hub↔coast border
// edges OPEN (the hub's south edges re-open toward the new beaches).
const REBUILT = new Set([...HUB, ...COAST]);
// Screens we mirror against but must never overwrite.
const PRESERVE = new Set(['7,14', '6,13']);

// ── per-screen specs (26 screens) ─────────────────────────────────────────────
// place: [r,c,ch] interior placements. Everything else interior = floor grass.
// data: chest / chest2 / show(condition) / sign / npc / links.
const S = (pattern, place = [], data = null) => ({ pattern, place, data });

const SCREENS = {
  // ══ P1 分岐路 (the hub's FACE — route + obstacle/secret/combat) ══════════════
  // stream-fork: a 't' tree line + a '~' brook you cross on a 'v' bridge.
  '3,13': S('P1', [
    [2, 4, 't'], [3, 4, 't'], [4, 4, '~'], [4, 5, 'v'], [4, 6, '~'],
    [5, 4, '~'], [6, 4, '~'], [3, 7, 't'], [6, 7, 't'], [2, 7, 'u'],
  ]),
  '4,13': S('P1', [
    // three-way copse: trees split the screen; a bush hides a rupee.
    [2, 3, 't'], [2, 4, 't'], [3, 8, 't'], [4, 8, 't'], [6, 3, 't'],
    [6, 4, 't'], [4, 5, 'u'], [5, 6, 't'],
  ], {
    // cutting the bush 5? no — reward is on the bush tile via floorItem? keep simple:
    // bush is the secret axis; add a rupee chest guarded by nothing (open reward).
  }),
  '5,13': S('P1', [
    // brook crossing north of D1; a 'v' bridge fork + a bush + an open rupee chest
    // (keeps the old 5,6-rupee reward). obstacle('v') + secret('u') + route.
    [3, 5, '~'], [3, 6, '~'], [4, 5, '~'], [4, 6, 'v'], [4, 7, '~'],
    [5, 5, '~'], [5, 6, '~'], [2, 3, 't'], [6, 8, 't'], [6, 3, 'u'],
    [3, 8, 'B'],
  ], {
    chest: { pos: '3,8', content: { type: 'rupee', value: 5, name: 'ルピー×5' } },
  }),
  '8,13': S('P1', [
    // eastern copse fork toward the mountains; bush secret + open chest.
    [2, 4, 't'], [3, 4, 't'], [2, 7, 't'], [6, 4, 't'], [6, 7, 't'],
    [7, 7, 't'], [4, 6, 'u'], [5, 3, 'B'],
  ], {
    chest: { pos: '5,3', content: { type: 'rupee', value: 5, name: 'ルピー×5' } },
  }),
  '4,14': S('P1', [
    // crossroads hub with a signpost — the radial heart of the region. Bushes at
    // the copse corners give the secret axis (cut for random drops).
    [2, 3, 't'], [2, 8, 't'], [7, 3, 't'], [7, 8, 't'],
    [4, 4, 't'], [4, 7, 't'], [5, 4, 't'], [5, 7, 't'], [3, 5, 'i'],
    [6, 8, 'u'], [3, 3, 'u'],
  ], {
    sign: { pos: '3,5', name: '草原の道標', lines: ['北 … 村への近道', '西 … 砂の地へ', '南 … 湿った草地と海'] },
  }),
  '5,14': S('P1', [
    // brook fork just west of the village; ladder-cross preview of water.
    [2, 5, '~'], [3, 5, '~'], [4, 5, '~'], [4, 6, 'v'], [4, 7, '~'],
    [5, 5, '~'], [6, 5, '~'], [2, 8, 't'], [7, 3, 't'], [6, 8, 'u'],
  ]),
  '3,14': S('P1', [
    // tree-lined lane splitting N/S/E; a bush at a dead end hides a rupee (open).
    [2, 4, 't'], [3, 4, 't'], [4, 4, 't'], [6, 6, 't'], [6, 7, 't'],
    [3, 7, 't'], [5, 8, 'u'], [2, 8, 't'],
  ]),
  '3,15': S('P1', [
    // fork toward the desert gateway (2,15 is D2); trees + brook.
    [2, 6, 't'], [3, 6, 't'], [5, 3, '~'], [5, 4, 'v'], [5, 5, '~'],
    [6, 3, '~'], [4, 3, '~'], [6, 8, 't'], [2, 8, 't'],
  ]),
  '4,15': S('P1', [
    // central grassy junction; a patrol guards a killAll rupee chest in a copse
    // pocket. route + combat.
    [3, 3, 't'], [3, 4, 't'], [3, 8, 't'], [6, 3, 't'], [6, 8, 't'],
    [4, 6, 't'], [5, 6, 't'], [3, 7, 'M'], [5, 7, 'M'], [4, 8, 'B'],
    [4, 4, 'E'],
  ], {
    chest: { pos: '4,8', content: { type: 'rupee', value: 10, name: 'ルピー×10' } },
    show: { pos: '4,8', cond: { trigger: 'killAll', message: '⚔ 見張りを倒すと宝箱が現れた！' } },
  }),
  '5,15': S('P1', [
    // brook + bridge fork directly south of the village.
    [3, 4, '~'], [3, 5, '~'], [3, 6, '~'], [4, 5, 'v'], [4, 4, '~'],
    [4, 6, '~'], [2, 8, 't'], [6, 3, 't'], [6, 8, 'u'],
  ]),
  '6,17': S('P1', [
    // wet grass toward the coast; ladder brook + open chest (was 8,2 rupee).
    [3, 4, '~'], [4, 4, '~'], [4, 5, 'v'], [4, 6, '~'], [5, 4, '~'],
    [2, 7, 't'], [6, 7, 't'], [7, 3, 'u'], [3, 8, 'B'],
  ], {
    chest: { pos: '3,8', content: { type: 'rupee', value: 5, name: 'ルピー×5' } },
  }),

  // ══ P2 秘密 (secret — bush/stone/breakable + hint sign) ══════════════════════
  '7,15': S('P2', [
    // 石押し予告編: push '*' right along row6 onto the 'S' button → the 'T' gate at
    // 4,6 opens. The chest at 4,7 is boxed by rock on 3 sides so the gate is its
    // ONLY entrance (verified: no open approach without opening the gate).
    // Previews dungeon_1's stone-button-gate room. Tool-free = playable at hub.
    [4, 6, 'T'], [3, 7, 'M'], [5, 7, 'M'], [4, 8, 'M'],
    [4, 7, 'B'],
    [6, 3, '*'], [6, 7, 'S'],             // push * along row6 (6,4/6,5/6,6 free) onto S
    [5, 2, 'i'],
  ], {
    links: [{ switchId: '6,7', gateId: '4,6' }],
    chest: { pos: '4,7', content: { type: 'item', item: 'healPotion', name: '回復薬（小）' } },
    sign: { pos: '5,2', name: '古びた石碑', lines: ['「石を 印の上へ 運べば 道は開かん」', '村の外れの 忘れられた戒め。'] },
  }),
  '8,14': S('P2', [
    // "nothing here" 嘘看板 (e4); the chest sits in a niche whose only approach is
    // sword-cutting the bush at 4,6 (secret axis). No candle needed — sword cuts.
    [2, 4, 't'], [2, 7, 't'], [6, 4, 't'], [6, 7, 't'],
    [3, 7, 'M'], [5, 7, 'M'], [4, 8, 'M'], [4, 6, 'u'], [4, 7, 'B'],
    [3, 3, 'i'],
  ], {
    chest: { pos: '4,7', content: { type: 'rupee', value: 20, name: '隠しルピー×20' } },
    sign: { pos: '3,3', name: '意地悪な立札', lines: ['この辺りに 宝など無い。', '探すだけ 無駄骨だぞ。'] },
  }),
  '5,16': S('P2', [
    // bush-sealed niche: B at 5,5 is boxed by walls except the bush at 4,5 above
    // it — you MUST sword-cut the bush to reach the chest (secret is real, not
    // decorative). approach: 4,5(u) is reached from open 3,5.
    [4, 4, 'M'], [5, 4, 'M'], [6, 4, 'M'], [4, 6, 'M'], [5, 6, 'M'], [6, 5, 'M'],
    [4, 5, 'u'], [5, 5, 'B'],
    [2, 7, 't'], [3, 8, 't'], [6, 8, 'u'],
  ], {
    chest: { pos: '5,5', content: { type: 'rupee', value: 15, name: 'ルピー×15' } },
  }),
  '6,16': S('P2', [
    // a ring of boulders around a lone bush — an unnatural formation (hint). The
    // chest is bush-sealed: B at 4,5 is boxed by rock on 3 sides, entered only by
    // sword-cutting the bush at 3,5 above it. secret('u') + route. Distinct
    // layout from the other bush-seals (5,16/8,14).
    [3, 4, 'M'], [3, 6, 'M'], [4, 4, 'M'], [4, 6, 'M'], [5, 5, 'M'],
    [3, 5, 'u'], [4, 5, 'B'],
    [2, 8, 't'], [6, 3, 't'], [7, 7, 'u'], [2, 3, 't'],
  ], {
    chest: { pos: '4,5', content: { type: 'rupee', value: 15, name: 'ルピー×15' } },
  }),
  '4,16': S('P2', [
    // ruined outpost with a cracked wall. B at 3,4 is boxed by rock on 3 sides
    // and a breakable '!' below (4,4); its ONLY approach is bombing the '!'
    // (approach from open 5,4). Bomb = D6 reward → a come-back-later near-cut,
    // never required (§8-1). A hint sign + a bush secret give the "try-now" axis.
    [2, 4, 'M'], [3, 3, 'M'], [3, 5, 'M'], [4, 4, '!'],
    [3, 4, 'B'],
    [5, 8, 'u'], [6, 3, 't'], [2, 7, 't'], [6, 7, 'i'],
  ], {
    chest: { pos: '3,4', content: { type: 'rupee', value: 20, name: 'ルピー×20' } },
    sign: { pos: '6,7', name: '罅割れた砦跡', lines: ['北の岩壁、脆く 罅が入っている。', '砕く力が あれば 何か眠っていそうだ。'] },
  }),
  '5,17': S('P2', [
    // marsh-edge secret; bush hides an open rupee (keeps the old 9,2 rupee vibe).
    [2, 4, 't'], [2, 7, 't'], [3, 3, '~'], [4, 3, '~'], [4, 4, 'v'], [4, 5, '~'],
    [6, 7, 'u'], [6, 8, 'B'],
  ], {
    chest: { pos: '6,8', content: { type: 'rupee', value: 5, name: 'ルピー×5' } },
  }),
  '2,13': S('P2', [
    // desert-border secret grove: bushes + a killAll-sealed chest guarded by a patrol.
    [2, 4, 't'], [3, 4, 't'], [2, 8, 't'], [6, 8, 't'], [4, 6, 'u'], [7, 3, 'u'],
    [3, 7, 'E'], [5, 6, 'B'],
  ], {
    chest: { pos: '5,6', content: { type: 'rupee', value: 15, name: 'ルピー×15' } },
    show: { pos: '5,6', cond: { trigger: 'killAll', message: '🌿 草原の見張りを退けた！宝箱が現れた！' } },
  }),

  // ══ P3 狩り場/関門 (combat with meaning) ═════════════════════════════════════
  '9,14': S('P3', [
    // mountain-corner sentry post: an elite 'F' + patrol guard a killAll chest.
    [2, 4, 'M'], [6, 8, 'M'], [3, 3, 'E'], [4, 6, 'F'], [6, 4, 'C'],
    [5, 7, 'M'], [4, 8, 'M'], [4, 7, 'B'],
  ], {
    chest: { pos: '4,7', content: { type: 'item', item: 'healPotion', name: '回復薬（小）' } },
    show: { pos: '4,7', cond: { trigger: 'killAll', message: '⚔ 守りの兵を全て退けた！宝箱が現れた！' } },
  }),
  '7,13': S('P3', [
    // north gate hunting-ground between village & mountains; killAll rupee.
    [2, 4, 't'], [2, 7, 't'], [6, 3, 'M'], [6, 8, 'M'],
    [3, 5, 'E'], [4, 7, 'E'], [5, 4, 'C'], [4, 5, 'B'],
  ], {
    chest: { pos: '4,5', content: { type: 'rupee', value: 20, name: 'ルピー×20' } },
    show: { pos: '4,5', cond: { trigger: 'killAll', message: '⚔ 草原の魔物を一掃した！宝箱が現れた！' } },
  }),
  '4,17': S('P3', [
    // marsh gauntlet: two chasers + a sentry guard the wet crossing.
    [2, 5, '~'], [3, 5, '~'], [2, 6, '~'], [3, 6, 'v'], [4, 6, '~'],
    [4, 4, 'C'], [6, 7, 'C'], [5, 3, 'F'], [6, 4, 'B'],
  ], {
    chest: { pos: '6,4', content: { type: 'rupee', value: 20, name: 'ルピー×20' } },
    show: { pos: '6,4', cond: { trigger: 'killAll', message: '🛡 湿地の守り手を退けた！宝箱が現れた！' } },
  }),
  '5,18': S('P3', [
    // coastal hunting-ground (south edge = sea); patrols + killAll chest.
    [2, 4, 't'], [2, 8, 't'], [6, 7, 't'], [3, 5, 'E'], [5, 4, 'E'],
    [4, 7, 'C'], [4, 3, 'u'], [5, 6, 'B'],
  ], {
    chest: { pos: '5,6', content: { type: 'rupee', value: 15, name: 'ルピー×15' } },
    show: { pos: '5,6', cond: { trigger: 'killAll', message: '🌊 岸辺の魔物を退けた！宝箱が現れた！' } },
  }),
  '6,18': S('P3', [
    // coastal corner sentry (was a lone B + rupee); elite guards a heal.
    [2, 5, 't'], [2, 6, 't'], [6, 4, 'M'], [6, 6, 'M'], [5, 5, 'F'],
    [3, 8, 'E'], [5, 6, 'B'],
  ], {
    chest: { pos: '5,6', content: { type: 'rupee', value: 5, name: 'ルピー×5' } },
    show: { pos: '5,6', cond: { trigger: 'killAll', message: '⚔ 岸の精鋭を倒した！宝箱が現れた！' } },
  }),

  // ══ P4 ランドマーク (memorable terrain + secret) ═════════════════════════════
  '6,14': S('P4', [
    // 村外れの記念碑: a stone-floor 'o' shrine plaza with a 石碑 sign (e6).
    [2, 5, '#'], [2, 6, '#'], [3, 5, 'o'], [3, 6, 'o'], [4, 5, 'o'], [4, 6, 'o'],
    [3, 4, 'M'], [4, 7, 'M'], [4, 4, 'i'], [6, 8, 't'],
  ], {
    sign: { pos: '4,4', name: '村を見守る碑', lines: ['ルミアの女王 石に姿を変えられて 久し。', '旅人よ 星の欠片を八つ 北の祭壇へ。'] },
  }),
  '6,15': S('P4', [
    // a lone great tree ('t' cluster) landmark with a bush secret at its roots.
    [3, 5, 't'], [3, 6, 't'], [4, 5, 't'], [4, 6, 't'], [3, 4, 't'], [4, 7, 't'],
    [5, 5, 'u'], [5, 6, 'u'], [2, 8, 'o'], [6, 3, 'o'],
  ]),
  '8,15': S('P4', [
    // mountain-foot ruins (o stone floor + i石碑) near cave_1 (9,15).
    [2, 4, '#'], [2, 6, '#'], [3, 4, 'o'], [3, 5, 'o'], [3, 6, 'o'],
    [4, 4, 'o'], [4, 5, 'B'], [4, 6, 'o'], [5, 4, '#'], [5, 6, '#'], [3, 8, 'i'],
    [6, 3, 'E'],
  ], {
    chest: { pos: '4,5', content: { type: 'rupee', value: 25, name: 'ルピー×25' } },
    show: { pos: '4,5', cond: { trigger: 'killAll', message: '🏛 遺跡の見張りを退けた！宝が現れた！' } },
    sign: { pos: '3,8', name: '崩れた門柱', lines: ['ここは 昔の関所の跡。', '東の洞窟へ 続く道が あったという。'] },
  }),
};

// ── COAST specs (村南の海岸 — the hub's south shore, §10 outer-sea) ────────────
// Coast screens are SEA-interior (the inverse of the grassland floor-moat): the
// interior fills with sea '~', and a walkable 渚 (beach '.') is carved to connect
// every open ring cell the mirror leaves + the features. 'v' piers reach into the
// water; each screen hides a secret (bush 'u' on the beach / a killAll chest a
// guardian protects). Beach cells sit on the existing grass bgTile (renders as a
// grassy shore over which water tiles draw). No new tiles needed.
//
// beach: [r,c] interior cells forced walkable (floor). Everything else interior
// that is not a placed feature = sea '~'. place/data as with hub specs. The
// builder guarantees every OPEN ring cell + every beach cell + every feature is
// one connected walkable component (BFS-asserted), so the coast is truly
// enterable (turns 5 W1/orphan sea screens into reached beaches).
const C = (beach, place = [], data = null) => ({ coast: true, beach, place, data });

// Helper: a walkable "beach band" = every interior cell of row1 (the strand just
// inside the top edge) + a chosen side column's interior + a few reaching cells.
// This guarantees each open ring cell (which is always on row0/row1, the top, or
// one side column per the mirror geometry above) connects. Deep interior = sea.
const rowBand = (r, c0, c1) => { const o = []; for (let c = c0; c <= c1; c++) o.push([r, c]); return o; };
const colBand = (c, r0, r1) => { const o = []; for (let r = r0; r <= r1; r++) o.push([r, c]); return o; };

const COAST_SCREENS = {
  // 3,17 — SW cove. Open ring: top corners + right col (rows1-8) + (9,11).
  // Beach = row1 strand + right col; a short pier (col3) south + bushes on shore.
  '3,17': C(
    [...rowBand(1, 1, 10), ...colBand(10, 1, 8), [8, 10], [2, 3], [3, 3]],
    [[4, 3, 'v'], [1, 3, 'u'], [2, 10, 'u']],
    null,
  ),
  // 4,18 — main southern strand. Open ring: whole top (row0) + right col +
  // (9,11). Beach = row1 strand + right col + a col4 pier to a killAll chest;
  // an enemy on the shore guards it.
  '4,18': C(
    [...rowBand(1, 1, 10), ...colBand(10, 1, 8), [8, 10], [2, 4], [3, 4], [4, 4], [1, 7]],
    [[5, 4, 'B'], [1, 8, 'u'], [1, 5, 'E']],
    {
      chest: { pos: '5,4', content: { type: 'rupee', value: 20, name: '砂に埋もれたルピー×20' } },
      show: { pos: '5,4', cond: { trigger: 'killAll', message: '🌊 渚の魔物を退けた！宝箱が現れた！' } },
    },
  ),
  // 5,19 — south strand continued. Open ring: whole top + right col + (9,11).
  // Beach = row1 strand + right col; a quiet double pier + bushes. (distinct)
  '5,19': C(
    [...rowBand(1, 1, 10), ...colBand(10, 1, 8), [8, 10], [2, 3], [2, 4], [2, 7]],
    [[3, 3, 'v'], [3, 4, 'v'], [1, 3, 'u'], [1, 7, 'u']],
    null,
  ),
  // 6,19 — SE strand (bottom row). Open ring: whole top + LEFT col + (9,0).
  // Beach = row1 strand + left col; pier + bushes. (mirror side of 5,19)
  '6,19': C(
    [...rowBand(1, 1, 10), ...colBand(1, 1, 8), [8, 1], [2, 7], [2, 8], [2, 4]],
    [[3, 7, 'v'], [3, 8, 'v'], [1, 4, 'u'], [1, 8, 'u']],
    null,
  ),
  // 7,18 — SE cove by the mountains (7,17 above open all along bottom). Open
  // ring: whole top + LEFT col + (9,0). Beach = row1 strand + left col + a col7
  // pier south to a killAll chest a sentry guards on the shore.
  '7,18': C(
    [...rowBand(1, 1, 10), ...colBand(1, 1, 8), [8, 1], [2, 7], [3, 7], [4, 7], [1, 5]],
    [[5, 7, 'B'], [1, 6, 'F'], [1, 3, 'u']],
    {
      chest: { pos: '5,7', content: { type: 'item', item: 'healPotion', name: '回復薬（小）' } },
      show: { pos: '5,7', cond: { trigger: 'killAll', message: '🌊 岬の番兵を退けた！宝箱が現れた！' } },
    },
  ),
};

// ── builders ──────────────────────────────────────────────────────────────────
function mirrorRing(field, key) {
  // Interior floor; every RING cell computed by the mirror rule so that
  // "I am walkable ⟺ the neighbour across each crossing is walkable".
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

// Build a SEA-interior coast screen: mirror ring (open ring = beach, else 'M'
// cliff / sea via mirror), interior filled with sea '~' EXCEPT the carved beach
// cells (floor) and placed features. The beach must connect every open ring cell
// (asserted in assertCoast). Piers 'v' and bushes 'u' sit on the beach.
const SEA = '~';
function buildCoast(field, key, spec) {
  const g = mirrorRing(field, key);          // ring = FLOOR(open)/WALL; interior = FLOOR
  // flood the interior with sea, then re-carve the beach.
  for (let r = 1; r < ROWS - 1; r++)
    for (let c = 1; c < COLS - 1; c++) g[r][c] = SEA;
  for (const [r, c] of spec.beach) {
    if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) continue; // ring set by mirror
    g[r][c] = FLOOR;
  }
  // Also carve any OPEN ring cell that the mirror left FLOOR but which we need to
  // reach — the beach list must include the interior path to each; assertCoast
  // verifies connectivity. Features overwrite beach/sea.
  for (const [r, c, ch] of spec.place || []) {
    if (r <= 0 || r >= ROWS - 1 || c <= 0 || c >= COLS - 1)
      throw new Error(`coast feature on ring @ ${r},${c} (interior only) on ${key}`);
    g[r][c] = ch;
  }
  return g;
}

// ── verification ────────────────────────────────────────────────────────────
/** Walkable-cell BFS; hard-blocked tiles block. Solvable gates ('!','T','B',
 *  and the pushable stone '*' whose destination clears) pass — a stone can be
 *  pushed off, so we treat '*' as eventually-walkable for reachability. */
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
      // '*' stone and 'u' bush are openable (push / sword-cut) → treat walkable.
      const openable = ch === '*' || ch === 'u';
      if (seen.has(k) || (isHardBlocked(ch) && !openable)) continue;
      seen.add(k); q.push([nr, nc]);
    }
  }
  return seen;
}

function assertScreen(g, key, place) {
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
  // combat/chest features must be reachable on foot (else dead content).
  for (const [r, c, ch] of place) {
    if ('ECFB'.includes(ch) && !reach.has(`${r},${c}`))
      throw new Error(`feature '${ch}' @ ${r},${c} unreachable inside ${key}`);
  }
}

/** Coast: every OPEN ring cell + every feature must be one connected beach
 *  component (sea '~' blocks; there is no ladder here). Seeds from a beach cell. */
function assertCoast(g, key, spec) {
  // seed: first interior beach cell that is walkable.
  const seed = spec.beach.find(([r, c]) => r > 0 && r < ROWS - 1 && c > 0 && c < COLS - 1
    && !isHardBlocked(g[r][c]));
  if (!seed) throw new Error(`no interior beach seed on ${key}`);
  const reach = walkReach(g, seed[0], seed[1]);
  const isCorner = (r, c) => (r === 0 || r === ROWS - 1) && (c === 0 || c === COLS - 1);
  // Every OPEN *edge* ring cell must join the beach (else it orphans the
  // neighbour it faces). CORNER cells are exempt: a corner takes part in two
  // crossings, and when both its interior neighbours face frozen walls (e.g.
  // 3,17 wedged against rebuilt-desert 3,16/2,17), the corner can only connect
  // externally — it's a harmless 1-cell landing reached from that neighbour and
  // is NOT a seam (its open arrival matches the open neighbour). Same corner
  // limit as the hub (§11-1); forcing it open internally would just move the
  // seam to an edge cell. We still require it be non-wall (no seam) below.
  for (let c = 0; c < COLS; c++) for (const r of [0, ROWS - 1]) {
    if (isCorner(r, c)) continue;
    if (!isHardBlocked(g[r][c]) && !reach.has(`${r},${c}`))
      throw new Error(`open ring cell ${r},${c} unreachable on coast ${key} (orphans neighbour)`);
  }
  for (let r = 0; r < ROWS; r++) for (const c of [0, COLS - 1]) {
    if (isCorner(r, c)) continue;
    if (!isHardBlocked(g[r][c]) && !reach.has(`${r},${c}`))
      throw new Error(`open ring cell ${r},${c} unreachable on coast ${key} (orphans neighbour)`);
  }
  // every beach cell must be connected (no stranded islet the player can't reach).
  for (const [r, c] of spec.beach) {
    if (!reach.has(`${r},${c}`))
      throw new Error(`beach cell ${r},${c} stranded on ${key}`);
  }
  // features must be reachable on foot.
  for (const [r, c, ch] of spec.place || []) {
    if ('ECFB'.includes(ch) && !reach.has(`${r},${c}`))
      throw new Error(`coast feature '${ch}' @ ${r},${c} unreachable on ${key}`);
  }
  // a coast MUST actually use sea (else it's just a grass screen mislabelled).
  if (!g.flat().includes(SEA)) throw new Error(`coast ${key} has no sea`);
}

// ── apply ─────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

for (const k of HUB) if (!field[k]) throw new Error(`missing hub stage ${k}`);
for (const k of COAST) if (!field[k]) throw new Error(`missing coast stage ${k}`);
for (const k of PRESERVE) if (SCREENS[k] || COAST_SCREENS[k]) throw new Error(`${k} is preserved but has a spec`);
for (const k of Object.keys(SCREENS)) {
  if (!HUB.has(k) || PRESERVE.has(k)) throw new Error(`bad spec key ${k}`);
}
for (const k of Object.keys(COAST_SCREENS)) {
  if (!COAST.has(k)) throw new Error(`bad coast spec key ${k}`);
}
// every hub / coast screen must have a spec (nothing left as 塗り絵).
for (const k of HUB) if (!SCREENS[k]) throw new Error(`hub screen ${k} has no spec (would stay 塗り絵)`);
for (const k of COAST) if (!COAST_SCREENS[k]) throw new Error(`coast screen ${k} has no spec (would stay 塗り絵 sea)`);

// merged spec list: hub (mirror-ring floor) + coast (sea-interior beach).
const ALL_SPECS = { ...SCREENS, ...COAST_SCREENS };
const seenLayouts = new Map();
let touched = 0;

for (const [key, spec] of Object.entries(ALL_SPECS)) {
  const stage = field[key];
  if (stage.rows !== ROWS || stage.cols !== COLS)
    throw new Error(`unexpected size on ${key}: ${stage.rows}x${stage.cols}`);

  let g;
  if (spec.coast) {
    g = buildCoast(field, key, spec);
    assertCoast(g, key, spec);
  } else {
    g = mirrorRing(field, key);
    placeAll(g, spec.place);
    assertScreen(g, key, spec.place);
  }

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

// ── guard: no rebuilt screen may leave an 'i' sign tile without a body ────────
for (const key of Object.keys(ALL_SPECS)) {
  const stage = field[key];
  for (let r = 0; r < stage.rows; r++)
    for (let c = 0; c < stage.cols; c++) {
      if (stage.tiles[r][c] !== 'i') continue;
      const pk = `${r},${c}`;
      if (!stage.signData?.[pk] && !stage.npcData?.[pk])
        throw new Error(`empty sign on ${key} @ ${pk} (no signData/npcData body)`);
    }
}

// ── guard: every chestContents key must sit on a 'B' tile (else orphan data) ──
for (const key of Object.keys(ALL_SPECS)) {
  const stage = field[key];
  for (const pk of Object.keys(stage.chestContents)) {
    const [r, c] = pk.split(',').map(Number);
    if (stage.tiles[r][c] !== 'B')
      throw new Error(`chestContents on ${key} @ ${pk} not on a 'B' tile (=${stage.tiles[r][c]})`);
  }
}

// ── guard: every showConditions key must sit on a 'B' tile (else nothing to reveal) ──
for (const key of Object.keys(ALL_SPECS)) {
  const stage = field[key];
  for (const pk of Object.keys(stage.showConditions)) {
    const [r, c] = pk.split(',').map(Number);
    if (stage.tiles[r][c] !== 'B')
      throw new Error(`showConditions on ${key} @ ${pk} not on a 'B' tile (=${stage.tiles[r][c]})`);
  }
}

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── report the density basis ─────────────────────────────────────────────────
const byPat = {};
for (const spec of Object.values(SCREENS)) byPat[spec.pattern] = (byPat[spec.pattern] || 0) + 1;
console.log(`9-6 ⑥-3 grassland hub: ${touched} screens rebuilt`);
console.log(`  hub grassland: ${Object.keys(SCREENS).length} (7,14 village + 6,13 D1 preserved)`);
console.log(`  south coast (§10 region+ring): ${Object.keys(COAST_SCREENS).length} sea screens → walkable beaches`);
console.log('  hub pattern 配分:', JSON.stringify(byPat));
