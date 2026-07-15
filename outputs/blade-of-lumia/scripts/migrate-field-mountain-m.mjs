#!/usr/bin/env node
/**
 * migrate-field-mountain-m.mjs  (Phase 9-6 ⑥-7 — 7th region, 山地/沼 M)
 *
 * Rebuilds the 14 塗り絵 highland/swamp (M-zone) screens SE of the village — the
 * mountain foothills that hold the swamp dungeon D8 (entrance 10,14) and the small
 * cave_1 (entrance 9,15). Two PRESERVED screens (designed content, NOT rebuilt):
 *   - 10,14 : the D8 swamp-temple entrance (mapEnters dungeon_8, an npcData pair, a
 *             fenced courtyard with a stone-push puzzle). Neighbours mirror its edges
 *             (top opens cols 5,6,7 / bottom cols 5,6 / right rows 4,5 — the corridors
 *             INTO D8; its west side is a fence wall).
 *   - 9,15  : the cave_1 approach (mapEnters cave_1, S-switch puzzle + showConditions
 *             revealing the '>' stair). Fully open on all borders → M mirrors open.
 *
 * The FACE of the highland is P1 山の1本道/分岐 (mountain single-path routes, §4-2 "M
 * 山地/沼") + P3 隘路の関門 (chokepoint elites). Mix P1×7 / P2×3 / P3×2 / P4×2 (14).
 *
 * ── 🔑 Connectivity invariant — grassland's FLOOR-default mirror-AND (NOT the lake
 *    hybrid) ──────────────────────────────────────────────────────────────────────
 * The ⑥-6 hand-off note called M "a water-skin region, reuse the §15 lake hybrid".
 * The DATA says otherwise: every M screen's bgTile is 'w' (mud) and the interior is
 * DEFAULT FLOOR carved by 'M' mountains into corridors, with only *local* '~' swamp
 * pockets — it is NOT water-everywhere like the lake. The lake hybrid exists ONLY
 * because the lake's interior default is water (open ring cells orphan without a
 * bridge spine); M's interior default is floor, so open ring cells auto-connect
 * through a floor moat exactly like grassland. Applying the lake hybrid here would
 * wrongly turn M into a second lake. → M uses grassland-c's proven rule (§14-3):
 *   A ring cell is FLOOR iff EVERY on-map crossing faces an OPEN neighbour; else 'M'.
 *   EDGE cells (one crossing) mirror; CORNER cells (two crossings) open only if BOTH
 *   face open → a rebuilt screen is NEVER the source of an arrival-wall hole.
 * Neighbours: rebuilt M → in-progress ring; everything else (grassland G open, the
 * finished lake W, preserved D8/cave_1, the finished outer sea ~) → their fixed tiles.
 * Content lives in the interior (rows2-7 × cols2-9); row1/row8/col1/col10 stay a floor
 * moat so open ring cells reconnect regardless of interior mountains/swamp.
 *
 * ── Tool-timing (§8-1, STRICT rule — matches PLAN ⑥-7 note) ─────────────────────
 * M is adjacent to the village (D8 is 3 cols east of 7,14) → reachable from the START
 * with only {sword, shield}, while its dungeons (D8/cave_1) unlock LATE. So:
 *   - TRY-NOW preview = 石押し・1本道関門 (*→S→T, tool-free) @ 10,13 — the north approach
 *     to D8, previewing dungeon stone-button gates. Needs no item → always valid.
 *   - COME-BACK-LATER (NOT previews — the tool is D8/D5's OWN reward, §8-1):
 *       • 笛reveal 沼の祭壇 @ 11,14 : flute = D8's OWN reward → can't be blown on the way
 *         IN → a come-back sealed 'B' (flutePlayed), never on the critical path.
 *       • はしご水渡り @ 11,15 : ladder = D5 reward → a pit-boxed chest crossable only
 *         after D5. A come-back near-cut (behindPit exempts it from the walk-check).
 *   - Sword-cut 'u' bush secrets are try-now (sword owned from the start).
 *
 * bgTiles ('w' mud) untouched — '~' swamp / 'M' mountains / features render over it.
 * Purely a `tiles`-layer + per-screen data rewrite. Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const ROWS = 10, COLS = 12;
const FLOOR = '.';
const WALL = 'M';  // mountain/cliff (hard-blocked → route axis via internal terrain)

// 16 M screens. PRESERVED (existing designed content, NOT rebuilt):
//   - 10,14 : D8 swamp-temple entrance (mapEnters dungeon_8 + npcData + stone puzzle).
//   - 9,15  : cave_1 approach (mapEnters cave_1 + S-switch reveal puzzle).
const PRESERVED = new Set(['10,14', '9,15']);
const MZONE = new Set([
  '10,12', '11,12',
  '9,13', '10,13', '11,13',
  '10,14', '11,14',
  '9,15', '10,15', '11,15',
  '7,16', '8,16', '9,16', '10,16',
  '7,17', '8,17',
]);
const REBUILT = new Set([...MZONE].filter((k) => !PRESERVED.has(k)));

// ── per-screen specs (14 screens) ─────────────────────────────────────────────
// `place`: interior feature tiles [r,c,ch] (rows2-7 × cols2-9 — never on the moat).
// The RING is auto-computed by the mirror; the FLOOR interior + moat connect it.
const S = (pattern, place = [], data = null) => ({ pattern, place, data });
const rupee = (v) => ({ type: 'rupee', value: v, name: `ルピー×${v}` });
const heal = () => ({ type: 'item', item: 'healPotion', name: '回復薬（小）' });

const SCREENS = {
  // ══ Cluster A — the swampy highland approaching D8 (lake W to the N) ═══════════
  // ── Row 12 — the lake-side swamp rim (N = 湖 W, finished in ⑥-6) ───────────────
  '10,12': S('P1', [
    // lake→swamp transition: a '~' swamp band crossed by a single 'v' bridge (obstacle),
    // mountains fork the mud path. The lake drains south into these marshes.
    [3, 5, '~'], [3, 6, '~'], [4, 5, '~'], [4, 6, 'v'], [5, 5, '~'], [5, 6, '~'],
    [2, 3, 'M'], [2, 8, 't'], [6, 3, 't'], [6, 8, 'M'], [7, 5, 't'],
  ]),
  '11,12': S('P1', [
    // NE swamp rim (E faces the sea ~): a mountain spur splits the road, a bush secret
    // tucked against the crag (sword-cuttable = try-now).
    [2, 4, 'M'], [3, 4, 'M'], [4, 4, 'M'], [2, 7, '~'], [3, 7, '~'], [3, 8, 'v'],
    [6, 6, 't'], [6, 3, 't'], [5, 8, 'u'],
  ]),

  // ── Row 13 — the north D8 approach (stone-push try-now @ 10,13) ────────────────
  '9,13': S('P1', [
    // W edge borders grassland (open); a mountain defile forks the climb, a bush pocket.
    [2, 4, 'M'], [2, 5, 'M'], [3, 5, 'M'], [5, 6, 'M'], [6, 6, 'M'], [6, 5, 'M'],
    [4, 8, 't'], [7, 7, 'u'], [3, 8, 't'],
  ]),
  '10,13': S('P2', [
    // 石押し・1本道関門 TRY-NOW (tool-free): push the '*' at 3,4 DOWN col4 onto the 'S'
    // button at 6,4 (a wall 'M' at 7,4 stops the stone ON the button, else it slides
    // past and the gate re-closes) → the 'T' gate at 4,7 opens onto a rupee boxed at
    // 4,8 (M on 3 sides so the gate is its only entrance). Previews D8's stone gates.
    // Bottom edge opens cols5,6,7 (mirrors the D8 courtyard gate below).
    [3, 4, '*'], [6, 4, 'S'], [7, 4, 'M'],
    [4, 7, 'T'], [4, 8, 'B'], [3, 8, 'M'], [5, 8, 'M'], [4, 9, 'M'],
    [2, 6, 't'], [6, 8, 't'], [2, 3, 'i'],
  ], {
    links: [{ switchId: '6,4', gateId: '4,7' }],
    chest: { pos: '4,8', content: rupee(20) },
    sign: { pos: '2,3', name: '沼の 関の 石標', lines: ['「石を 印へ 運べば 沼路は 開く」', 'この先の 神殿にも 同じ 仕掛けあり。'] },
  }),
  '11,13': S('P3', [
    // NE chokepoint: an elite 'F' + two chasers 'C' hold a killAll chest where the
    // mountains pinch the road to a single lane (E faces the sea ~).
    [2, 5, 'M'], [2, 6, 'M'], [6, 5, 'M'], [6, 6, 'M'], [3, 5, 'F'], [5, 5, 'C'],
    [5, 6, 'C'], [4, 6, 'B'], [4, 5, 'M'],
  ], {
    chest: { pos: '4,6', content: heal() },
    show: { pos: '4,6', cond: { trigger: 'killAll', message: '⚔ 沼路の 番人を 退けた！宝箱が現れた！' } },
  }),

  // ── Row 14 — flanking D8 (10,14 preserved); 沼の祭壇 flute come-back @ 11,14 ────
  '11,14': S('P4', [
    // 沼の祭壇 landmark + 笛reveal COME-BACK: a stone-floor 'o' altar ringed by pillars
    // '#'; blowing the flute (flutePlayed — flute = D8's OWN reward, so it is a
    // come-back, NOT a try-now, §8-1) reveals a sealed 'B' offering at 5,6. Right of
    // the D8 entrance (W mirrors D8's open right rows 4,5). A 石碑 tells the rite.
    [3, 5, '#'], [3, 6, '#'], [4, 5, 'o'], [4, 6, 'o'], [5, 5, 'o'], [5, 6, 'B'],
    [3, 4, 'M'], [6, 7, 'M'], [6, 4, 'i'], [2, 8, 't'],
  ], {
    show: { pos: '5,6', cond: { trigger: 'flutePlayed', message: '♪ 笛の 音色に 応え、祭壇の 供物が 現れた！' } },
    chest: { pos: '5,6', content: rupee(30) },
    sign: { pos: '6,4', name: '沼の 祭壇跡', lines: ['沼を 統べし者に 捧ぐ 古き 祭壇。', '笛の 音色を 供えよ、と 刻まれて いる。'] },
  }),

  // ── Row 15 — the south D8 approach; はしご come-back @ 11,15 (cave_1 9,15 W) ────
  '10,15': S('P1', [
    // south approach to D8 (top opens cols5,6 mirroring the D8 courtyard's bottom gate).
    // a mountain 1本道 winds up to the entrance, a swamp pocket crossed by a 'v' bridge.
    [2, 3, 'M'], [2, 4, 'M'], [3, 4, 'M'], [6, 7, '~'], [6, 8, '~'], [5, 8, 'v'],
    [7, 3, 't'], [3, 7, 't'], [6, 3, 'u'],
  ]),
  '11,15': S('P2', [
    // はしご水渡り COME-BACK (ladder = D5 reward → not a preview, §8-1): a 1-cell PIT 'x'
    // at 4,4 fronts a rupee chest 'B' boxed at 4,3 (M on the other 3 sides), crossable
    // ONLY with the ladder (both banks are floor = a valid ladder bridge). Until D5 it
    // is an unreachable near-cut (behindPit exempts it from the walk-check). Sign hints.
    // E/S face the sea ~ (mirror walls). A bush secret is reachable today.
    [4, 4, 'x'], [4, 3, 'B'], [3, 3, 'M'], [5, 3, 'M'], [4, 2, 'M'],
    [6, 6, 'u'], [6, 7, 'M'], [2, 6, 't'], [3, 7, 'i'],
  ], {
    chest: { pos: '4,3', content: rupee(15) },
    sign: { pos: '3,7', name: '沼の 飛び石', lines: ['向こう岸まで 一歩 届かぬ 泥沼。', 'はしごを 渡す 力あらば 越えられよう。'] },
  }),

  // ══ Cluster B — the southern mountain foothills near cave_1 & the sea ══════════
  // ── Row 16 — foothills; cave_1 9,15 to the N of 9,16 ──────────────────────────
  '7,16': S('P1', [
    // SW foothill (W borders grassland): a mountain switchback forks the trail, a bush.
    [2, 5, 'M'], [3, 5, 'M'], [4, 5, 'M'], [5, 7, 'M'], [6, 7, 'M'], [6, 6, 'M'],
    [3, 8, 't'], [7, 4, 'u'], [2, 3, 't'],
  ]),
  '8,16': S('P2', [
    // bush-sealed niche: a rupee chest 'B' at 5,6 walled on top/sides, entered only by
    // cutting the 'u' bush at 6,6 below it (from the open moat) — a try-now sword secret.
    [4, 6, 'M'], [5, 5, 'M'], [5, 7, 'M'], [5, 6, 'B'], [6, 6, 'u'],
    [2, 4, 't'], [2, 8, 't'], [6, 3, 't'], [3, 7, 'u'],
  ], {
    chest: { pos: '5,6', content: rupee(15) },
  }),
  '9,16': S('P1', [
    // directly S of the cave_1 approach (9,15): a mountain gorge with a single lane,
    // a swamp trickle crossed by a 'v' bridge (obstacle). Trees frame the cave road.
    [3, 4, 'M'], [3, 5, 'M'], [6, 6, 'M'], [6, 7, 'M'], [4, 8, '~'], [5, 8, '~'],
    [5, 7, 'v'], [2, 7, 't'], [7, 3, 't'],
  ]),
  '10,16': S('P3', [
    // the cluster-A↔B junction chokepoint (10,15 above): an elite 'F' + patrol hold a
    // killAll chest where the mountains squeeze the pass — the tougher southern gauntlet.
    [2, 4, 'M'], [2, 8, 'M'], [6, 4, 'M'], [6, 8, 'M'], [4, 4, 'F'], [4, 8, 'C'],
    [3, 6, 'E'], [5, 6, 'B'],
  ], {
    chest: { pos: '5,6', content: rupee(25) },
    show: { pos: '5,6', cond: { trigger: 'killAll', message: '⚔ 峠の 精鋭を 退けた！宝箱が現れた！' } },
  }),

  // ── Row 17 — the southern edge foothills (S = outer sea ~, finished) ───────────
  '7,17': S('P1', [
    // SW corner foothill (S faces the sea ~): a mountain corridor bends toward the
    // coast, a bush pocket in the crag.
    [2, 5, 'M'], [2, 6, 'M'], [3, 6, 'M'], [5, 4, 'M'], [6, 4, 'M'], [6, 5, 'M'],
    [4, 8, 't'], [7, 7, 'u'], [3, 3, 't'],
  ]),
  '8,17': S('P4', [
    // 廃村 landmark (§4-3 M = 崩れた遺跡 '#' + 石碑): a ruined hamlet of collapsed walls
    // '#' with a stone-floor 'o' plaza and a 石碑 — the drowned village the swamp swallowed.
    // S faces the sea ~. Broken/asymmetric ruin footprint (distinct from the highland
    // cairn at 9,4) with a swamp puddle '~' seeping among the ruins; a bush secret.
    [2, 4, '#'], [2, 5, 'o'], [2, 6, '#'], [3, 3, '#'], [4, 4, 'o'], [4, 5, 'o'],
    [3, 5, 'o'], [5, 6, '#'], [5, 5, 'i'], [3, 7, '~'], [4, 7, '~'], [6, 3, 'u'],
  ], {
    sign: { pos: '5,5', name: '沼に 沈む 廃村', lines: ['沼が 呑み込んだ 村の 名残。', '「水底に 眠る 宝は 笛に 応える」と 古老は 言う。'] },
  }),
};

// ── builders — FLOOR-default mirror-AND to a fixed point (grassland-c §14-3) ────
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
      throw new Error(`feature on ring/moat @ ${r},${c} (interior rows2-7×cols2-9 only)`);
    if (r === 1 || r === ROWS - 2 || c === 1 || c === COLS - 2)
      throw new Error(`feature on the floor moat @ ${r},${c} (would break ring reconnection)`);
    g[r][c] = ch;
  }
}

// ── verification ────────────────────────────────────────────────────────────
/** Walkable-cell BFS. '*' pushable / 'u' cuttable / 'T' gate / '!' wall are treated
 *  eventually-walkable so boxed chests behind them still pass. '~'/'x'/'M' block. */
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
  for (const [r, c] of RING_CELLS) {
    if (!isHardBlocked(g[r][c]) && !reach.has(`${r},${c}`))
      throw new Error(`open ring cell ${r},${c} unreachable on ${key} (would orphan neighbour)`);
  }
  // combat/chest features must be reachable on foot ('u'/'*'/'T'/'!' pass in walkReach).
  // a 'B' behind a PIT (ladder come-back) is exempt.
  for (const [r, c, ch] of spec.place) {
    if (!'ECFB'.includes(ch)) continue;
    if (ch === 'B' && behindPit(g, r, c)) continue;
    if (!reach.has(`${r},${c}`))
      throw new Error(`feature '${ch}' @ ${r},${c} unreachable inside ${key}`);
  }
  // DEAD-GATE guard (§11-4): a chest guarded by a link's 'T' gate must be UNREACHABLE
  // with the gate closed — else the gate protects nothing.
  const links = spec.data?.links || [];
  if (links.length) {
    const closed = walkReachGateClosed(g, 1, 1);
    for (const l of links) {
      const [gr, gc] = l.gateId.split(',').map(Number);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cr = gr + dr, cc = gc + dc;
        if (g[cr]?.[cc] !== 'B') continue;
        if (closed.has(`${cr},${cc}`))
          throw new Error(`DEAD GATE on ${key}: chest @ ${cr},${cc} reachable with gate ${l.gateId} closed`);
      }
    }
  }
}
/** true if the cell is isolated from the reach set by a PIT on all its land neighbours
 *  (the come-back ladder reward). */
function behindPit(g, r, c) {
  let pitAdj = false, floorAdj = false;
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const t = g[r + dr]?.[c + dc];
    if (t === 'x') pitAdj = true;
    else if (t !== undefined && !isHardBlocked(t)) floorAdj = true;
  }
  return pitAdj && !floorAdj;
}
/** Same BFS but 'T' gates are treated CLOSED — proves a gated chest is truly gated. */
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

for (const k of MZONE) if (!field[k]) throw new Error(`missing M-zone stage ${k}`);
for (const k of Object.keys(SCREENS)) {
  if (!MZONE.has(k)) throw new Error(`bad spec key ${k} (not in M-zone set)`);
  if (PRESERVED.has(k)) throw new Error(`spec must NOT rebuild preserved screen ${k}`);
}
for (const k of REBUILT) if (!SCREENS[k]) throw new Error(`M-zone screen ${k} has no spec (would stay 塗り絵)`);

const rings = computeAllRings(field);

// ── inspection: --dry prints each rebuilt screen's final grid; --rings prints the
//    computed ring + floor interior (no features) so we can see the open borders.
if (process.argv.includes('--rings')) {
  for (const [key] of Object.entries(SCREENS)) {
    const g = rings.get(key).map((row) => row.slice());
    console.log(`\n=== ${key} (${SCREENS[key].pattern}) ring ===`);
    g.forEach((row, r) => console.log(String(r).padStart(2), row.join('')));
  }
  process.exit(0);
}

const seenLayouts = new Map();
let touched = 0;

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

// ── guard: preserved screens untouched ────────────────────────────────────────
if (!field['10,14'].mapEnters || !Object.values(field['10,14'].mapEnters).some((v) => v.destId === 'dungeon_8'))
  throw new Error(`preserved screen 10,14 lost its D8 mapEnter`);
if (!field['9,15'].mapEnters || !Object.values(field['9,15'].mapEnters).some((v) => v.destId === 'cave_1'))
  throw new Error(`preserved screen 9,15 lost its cave_1 mapEnter`);

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

// ── guard: every chestContents / showConditions key must sit on a 'B' tile ────
for (const key of Object.keys(SCREENS)) {
  const stage = field[key];
  for (const pk of Object.keys(stage.chestContents)) {
    const [r, c] = pk.split(',').map(Number);
    if (stage.tiles[r][c] !== 'B')
      throw new Error(`chestContents on ${key} @ ${pk} not on a 'B' tile (=${stage.tiles[r][c]})`);
  }
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

// ── guard: NO arrival-wall hole sourced from any rebuilt M screen ─────────────
{
  const holes = [];
  for (const key of REBUILT) {
    const [sx, sy] = key.split(',').map(Number);
    const t = field[key].tiles;
    for (const [r, c] of RING_CELLS) {
      if (isHardBlocked(t[r][c])) continue;                 // wall cell can't step off
      for (const [nk, nr, nc] of crossingsOf(sx, sy, r, c)) {
        const ns = field[nk];
        if (!ns) continue;                                  // off-map → engine clamps
        if (isHardBlocked(ns.tiles[nr]?.[nc]))
          holes.push(`${key}(${r},${c}) → ${nk}(${nr},${nc})=${ns.tiles[nr][nc]}`);
      }
    }
  }
  if (holes.length)
    throw new Error(`M sources ${holes.length} arrival-wall hole(s):\n  ${holes.join('\n  ')}`);
}

const DRY = process.argv.includes('--dry');
if (DRY) {
  for (const key of Object.keys(SCREENS)) {
    console.log(`\n=== ${key} (${SCREENS[key].pattern}) ===`);
    field[key].tiles.forEach((row, i) => console.log(String(i).padStart(2), row.join('')));
  }
} else {
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
}

const byPat = {};
for (const spec of Object.values(SCREENS)) byPat[spec.pattern] = (byPat[spec.pattern] || 0) + 1;
console.log(`\n9-6 ⑥-7 mountain M: ${touched} screens rebuilt (10,14 D8 + 9,15 cave_1 preserved)${DRY ? ' [DRY — not written]' : ''}`);
console.log('  pattern 配分:', JSON.stringify(byPat));
