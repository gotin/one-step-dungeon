#!/usr/bin/env node
/**
 * migrate-field-lake-w.mjs  (Phase 9-6 ⑥-6 — 6th region, 湖 W)
 *
 * Rebuilds the 13 塗り絵 lake (W-zone) screens EAST of the village — the wide lake
 * the player crosses to reach the water dungeon D3 (entrance 9,9). 9-4 had already
 * turned them from "grass-cross punched through water" into island+bridge screens,
 * but all 12 shared the SAME central-island + 4-bridge-arm STAMP (differing only by
 * a decorative islet), and their border openings (col5,6 / row4,5) DID NOT MATCH the
 * open neighbours (草原 G / 雪 S / 山地 M / 外周海 ~), sourcing 16 arrival-wall traps.
 *
 * One screen is PRESERVED:
 *   - 9,9 : the D3 lakeshore entrance (mapEnters field_dungeon3 + two secret_grotto
 *           entries, chests candle/healPotion, a 'C'/'E'/'F' hunt, an 'i' sign). It
 *           is a horizontal lakeshore corridor (top=all-wall M / bottom=all-tree t /
 *           LEFT+RIGHT fully open) — already ≥2-axis (route+combat+secret). Neighbours
 *           mirror against its edges (its top/bottom walls stay residual corners).
 *
 * The FACE of the lake is P1 島渡り (bridge-hopping route puzzles) — §4-2 "W 湖".
 * Mix P1×8 / P2×3 / P3×2 (13 screens; the lake is small so no P4 landmark screen —
 * the D3 entrance IS the region's landmark and is preserved).
 *
 * ── Connectivity invariant — the "mirror" rule, LAKE variant ───────────────────
 * Same fixed-point AND mirror as grassland-c (§14-3): a RING cell is OPEN iff EVERY
 * on-map crossing it faces an OPEN neighbour cell; else water '~'. EDGE cells (one
 * crossing) mirror their neighbour; CORNER cells (two crossings) open only if BOTH
 * face open → a rebuilt screen is NEVER the source of an arrival-wall hole.
 *
 * ⚠️ The ONE difference from grassland: grassland's interior DEFAULT is floor, so
 * open ring cells auto-connect through the interior. The lake's interior DEFAULT is
 * WATER — an open ring cell would be an isolated shore stub unless a bridge reaches
 * it. So after the mirror computes the ring, we build a BRIDGE SPINE: connect the
 * screen's central island to every open ring cell with 'v' bridge arms. This spine
 * IS the P1 島渡り face (you walk the bridges island-to-island). Every screen then
 * BFS-asserts (open ring cells + combat/chest features reachable) before write.
 *
 * ── Tool-timing (§8-1, STRICT rule) ────────────────────────────────────────────
 * Attack order D1→D2→D3→D4→…; item rewards D2 boomerang / D3 BOW / D5 ladder. The
 * lake IS the D3 region, reached post-D2 / pre-D3 → owns {sword, shield, BOOMERANG}
 * (bow/ladder NOT yet owned). So the try-now preview is:
 *   - ブーメラン隙間越し回収 (owned): a floor 'R'/'K' on a water-ringed islet, grabbed
 *     ONLY by throwing the boomerang across the gap (collectFieldItem, player.js:881)
 *     = a direct preview of D3's across-the-water item retrieval, RIGHT before D3.
 * COME-BACK-LATER (not previews — the tool is D3/D5's OWN reward, §8-1):
 *   - はしご水渡り (x PIT + ladder): ladder = D5 reward → a boxed reward reachable only
 *     after D5. Placed as a come-back near-cut, never on the critical path.
 *   - 弓ゲート (Y→T, arrow): bow = D3's OWN reward → come-back, not a try-now here
 *     (unlike G-C where the bow was already owned). Not used on the lake to avoid a
 *     dead preview; the boomerang islet carries the try-now axis.
 *
 * bgTiles (grass 'g') untouched — water '~' / bridges 'v' render over grass. Purely a
 * `tiles`-layer + per-screen data rewrite. Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const ROWS = 10, COLS = 12;
const WATER = '~';   // water (hard-blocked; the lake's "wall")
const V = 'v';       // wooden bridge (passable; the walkable shore/island link)
const I = '.';       // island floor (renders as grass bgTile beneath)

// 14 lake screens. PRESERVED (existing designed content, NOT rebuilt):
//   - 9,9 : the D3 lakeshore entrance (mapEnters + chests + hunt + sign).
const PRESERVED = new Set(['9,9']);
const LAKE = new Set([
  '9,7', '10,7',
  '8,8', '9,8', '10,8', '11,8',
  '8,9', '9,9', '10,9',
  '8,10', '9,10', '10,10',
  '9,11', '10,11',
]);
const REBUILT = new Set([...LAKE].filter((k) => !PRESERVED.has(k)));

// ── per-screen specs (13 screens) ──────────────────────────────────────────────
// `island`: interior island cells (floor '.') the bridge spine connects to and where
//           features sit. `place`: interior feature tiles [r,c,ch]. `data`: chest/sign/
//           show/links. The RING is computed by the mirror; the SPINE auto-links every
//           open ring cell to the nearest island cell. Islands/features are interior
//           only (never on a ring row/col).
const S = (pattern, island = [], place = [], data = null) => ({ pattern, island, place, data });
const rupee = (v) => ({ type: 'rupee', value: v, name: `ルピー×${v}` });
const heal = () => ({ type: 'item', item: 'healPotion', name: '回復薬（小）' });

// Central 2×2 island (rows4,5 × cols5,6) is implicit on every screen — the spine
// always anchors there. Extra island cells below extend it for feature placement.
// Feature-placement discipline (the fix for the earlier stuck point):
//  • P1 screens carry NO interior features — the bridge-hop spine over water already
//    earns route+obstacle (≥2 axes). Island SPURS (bridged '.') vary the layout so no
//    two screens dup, and decorative trees 't' sit ONLY on cells that are water in the
//    pure spine (never on a spine lane, or they'd wall off a crossing).
//  • Feature tiles NEVER overwrite a spine lane. Water-locked islets (boomerang R /
//    ladder-pit chest) use the DEFAULT water — we don't paint explicit '~', we just
//    place the item on an interior cell the spine doesn't route through, so water
//    surrounds it automatically.
//  • Signs sit on an interior water cell ADJACENT to a spine cell (readable from it).
const SCREENS = {
  // ══ Row 7 — the north lake rim (N = 草原 G open shore) ════════════════════════
  '9,7': S('P1', [[3, 5], [3, 6], [6, 6], [7, 6]], [
    [2, 3, 't'], [7, 8, 't'],   // decorative islets (water cells, off the spine)
  ]),
  '10,7': S('P2', [[6, 5]], [
    // ブーメラン隙間越し回収 TRY-NOW: a large-rupee 'R' sits on a lone islet (2,3) ringed
    // by the default water with NO bridge — foot-unreachable, grabbed ONLY by hurling
    // the boomerang (owned post-D2, maxRange 3) across the 2-tile gap from the col-5
    // bridge at (2,5). Previews D3's across-water retrieval, right before D3. A hint
    // sign at (3,4), read from the row-4 spine below it.
    [2, 3, 'R'], [3, 4, 'i'],
  ], {
    sign: { pos: '3,4', name: '湖に浮かぶ 小島の光', lines: ['橋の 架からぬ 小島に 光る物。', '投げて 手繰る 術 (すべ) あらば 取れよう。'] },
  }),

  // ══ Row 8 — the lake's wide middle ═══════════════════════════════════════════
  '8,8': S('P1', [[3, 5], [6, 6]], [
    [2, 3, 't'], [7, 8, 't'],
  ]),
  '9,8': S('P3', [[3, 5], [3, 6], [6, 5], [6, 6]], [
    // 湖心の番人 hunting island: an elite 'F' + two chasers 'C' hold a killAll chest on
    // the bridged central arena; the four converging bridges funnel you into the fight.
    [3, 5, 'F'], [6, 5, 'C'], [6, 6, 'C'], [3, 6, 'B'],
  ], {
    chest: { pos: '3,6', content: heal() },
    show: { pos: '3,6', cond: { trigger: 'killAll', message: '⚔ 湖心の 番人を 退けた！宝箱が現れた！' } },
  }),
  '10,8': S('P1', [[3, 6], [6, 5], [7, 5]], [
    [2, 3, 't'], [7, 8, 't'],
  ]),
  '11,8': S('P2', [[6, 4]], [
    // 茂み封じ TRY-NOW secret (sword owned): from the bridged spur (6,4) a bush 'u' at
    // (7,4) seals a rupee chest 'B' at (8,4) — cut the bush (today's tool) to reach it.
    // The bush is INTERIOR (not on a crossing) so sealing it traps nothing.
    [7, 4, 'u'], [8, 4, 'B'],
  ], {
    chest: { pos: '8,4', content: rupee(20) },
  }),

  // ══ Row 9 — the D3 approach row (9,9 preserved = lakeshore corridor) ══════════
  '8,9': S('P1', [[2, 5], [3, 6], [6, 5], [7, 6]], [
    // the lake's WEST HUB (was an empty 塗り絵): all four sides open onto the lake, so
    // the mirror opens every edge and the spine becomes a full bridge crossroads — the
    // "which way across the lake" junction feeding the D3 corridor to the east.
    [1, 2, 't'], [8, 9, 't'],
  ]),
  '10,9': S('P1', [[3, 6], [6, 6]], [
    [2, 3, 't'], [7, 3, 't'],
  ]),

  // ══ Row 10 — the south lake ══════════════════════════════════════════════════
  '8,10': S('P2', [[4, 3]], [
    // はしご水渡り COME-BACK (ladder = D5 reward → not a preview, §8-1): from the bridged
    // spur (4,3) a 1-cell PIT 'x' at (3,3) fronts a boxed rupee chest 'B' at (2,3),
    // crossable ONLY with the ladder (both banks are floor = a valid ladder bridge).
    // Until D5 it's an unreachable near-cut (behindPit exempts it from the walk-check,
    // and the pit isolates it from any open ring cell). A hint sign at (5,3).
    [3, 3, 'x'], [2, 3, 'B'], [5, 3, 'i'],
  ], {
    chest: { pos: '2,3', content: rupee(15) },
    sign: { pos: '5,3', name: '湖の 飛び石', lines: ['向こう岸まで 一歩 届かぬ 淵。', 'はしごを 渡す 力あらば 越えられよう。'] },
  }),
  '9,10': S('P3', [[3, 5], [3, 6], [6, 5], [6, 6]], [
    // 南湖の群れ hunting island (mirrors 9,8 as the south combat beat): an elite 'F' +
    // two chasers 'C' guard a killAll chest as the bridges converge.
    [4, 7, 'F'], [6, 6, 'C'], [3, 5, 'C'], [6, 5, 'B'],
  ], {
    chest: { pos: '6,5', content: rupee(20) },
    show: { pos: '6,5', cond: { trigger: 'killAll', message: '⚔ 南湖の 群れを 一掃した！宝箱が現れた！' } },
  }),
  '10,10': S('P1', [[3, 6], [6, 5]], [
    [2, 3, 't'], [7, 8, 't'],
  ]),

  // ══ Row 11 — the south lake shore (S = 草原 G / 山地 M open) ═══════════════════
  '9,11': S('P1', [[3, 5], [3, 6], [6, 6], [7, 6]], [
    [3, 3, 't'], [7, 8, 't'],
  ]),
  '10,11': S('P1', [[3, 6], [6, 5], [7, 5]], [
    [2, 3, 't'], [6, 8, 't'],
  ]),
};

// ── HYBRID ring rule — lake variant (NOT grassland's mirror-AND) ───────────────
// 🔑 Why grassland's rule fails here (the root cause of the earlier stuck point):
// grassland opens a ring cell IFF every crossing faces an OPEN neighbour (AND). For
// a lake↔lake seam BOTH sides default to water, so "open iff neighbour open" is a
// stable CLOSED fixed-point — every lake↔lake seam seals shut, orphaning the three
// fully-lake-surrounded interior screens (9,8 / 10,8 / 9,10). The interior can never
// connect. So the lake needs a rule that OPENS lake↔lake seams by construction.
//
// The hybrid rule, per crossing:
//   • crossing to LAND (present neighbour NOT rebuilt — incl. preserved 9,9):
//       MIRROR it. If the land facing cell is OPEN this crossing "wants open"; if it
//       is CLOSED it VETOES the whole cell (→ water). Guarantees zero trap toward land.
//   • crossing to LAKE (a rebuilt neighbour):
//       open the SKELETON — the standard connection cells (col 5,6 on a top/bottom
//       edge, row 4,5 on a left/right edge). A standard cell "wants open"; it is the
//       SAME standard position on the neighbour's facing edge, so both sides open →
//       symmetric, never a trap. A non-standard lake cell wants open only if the
//       neighbour cell is already open (OR-propagation, lets openness flow along a
//       corridor). Standard cells are never corners, so they are never vetoed.
//   • off-map crossing: ignored (engine clamps at the world edge — no trap).
// A cell is OPEN iff (no land veto) AND (at least one crossing wants open). Iterated
// to an OR fixed-point (monotonic: cells only ever open, so it converges).
function crossingsOf(sx, sy, r, c) {
  const out = [];
  if (r === 0) out.push([`${sx},${sy - 1}`, ROWS - 1, c, 'v']);
  if (r === ROWS - 1) out.push([`${sx},${sy + 1}`, 0, c, 'v']);
  if (c === 0) out.push([`${sx - 1},${sy}`, r, COLS - 1, 'h']);
  if (c === COLS - 1) out.push([`${sx + 1},${sy}`, r, 0, 'h']);
  return out;
}
const RING_CELLS = (() => {
  const cells = [];
  for (let c = 0; c < COLS; c++) { cells.push([0, c]); cells.push([ROWS - 1, c]); }
  for (let r = 1; r < ROWS - 1; r++) { cells.push([r, 0]); cells.push([r, COLS - 1]); }
  return cells;
})();
// standard connection cells: vertical edges join at cols 5,6; horizontal at rows 4,5.
function isStandard(axis, r, c) {
  return axis === 'v' ? (c === 5 || c === 6) : (r === 4 || r === 5);
}

function computeAllRings(field) {
  const rings = new Map();
  for (const key of REBUILT) rings.set(key, Array.from({ length: ROWS }, () => Array(COLS).fill(WATER)));

  // openness of a neighbour cell: rebuilt → current ring iteration; land → fixed tiles.
  const lakeOpenNow = (nk, nr, nc) => !isHardBlocked(rings.get(nk)[nr][nc]);
  const landOpen = (nk, nr, nc) => {
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
        // Corner cells (two crossings) are forced water: they can't be routed to the
        // island without painting along a ring lane, and satisfying both neighbours is
        // the documented §11-1 corner-limit seam cost. Their trap-cost is measured, not
        // hidden — remaining lake corner residue falls when adjacent regions rework.
        const isCorner = (r === 0 || r === ROWS - 1) && (c === 0 || c === COLS - 1);
        if (isCorner) { if (g[r][c] !== WATER) { g[r][c] = WATER; changed = true; } continue; }
        let veto = false, want = false;
        for (const [nk, nr, nc, axis] of crossingsOf(sx, sy, r, c)) {
          if (rings.has(nk)) {
            // lake↔lake: skeleton (standard) OR neighbour already open.
            if (isStandard(axis, r, c) || lakeOpenNow(nk, nr, nc)) want = true;
          } else {
            // lake↔land (incl. preserved 9,9): mirror. open→want, closed→veto.
            const open = landOpen(nk, nr, nc);
            if (open === null) continue;                 // off-map → ignore
            if (open) want = true; else veto = true;
          }
        }
        const next = (want && !veto) ? V : WATER;
        if (g[r][c] !== next) { g[r][c] = next; changed = true; }
      }
    }
  }
  return rings;
}

// ── bridge spine — connect the central island to every open ring cell ─────────
// The lake interior defaults to water, so an open ring cell is an isolated shore
// stub unless a bridge reaches it. We lay an L-shaped bridge from each open ring
// cell to the central 2×2 island (rows4,5 × cols5,6): first travel along the ring's
// row/col to the island's band, then into the island. This is the P1 島渡り face.
const ISLAND_R = [4, 5], ISLAND_C = [5, 6];
function layBridge(g, r, c) {
  // Route from an open ring cell (r,c) to the central island. Move along the entry
  // axis to the island band, then perpendicular into col5/6 or row4/5.
  const midR = 4, midC = 5;
  if (c === 0 || c === COLS - 1) {
    // horizontal entry: walk cols to midC at this row, then rows to midR.
    const dir = c === 0 ? 1 : -1;
    for (let cc = c; cc !== midC; cc += dir) if (!isFloor(g[r][cc])) g[r][cc] = V;
    if (!isFloor(g[r][midC])) g[r][midC] = V;
    const dr = r <= midR ? 1 : -1;
    for (let rr = r; rr !== midR; rr += dr) if (!isFloor(g[rr][midC])) g[rr][midC] = V;
  } else {
    // vertical entry (r===0 or ROWS-1): walk rows to midR at this col, then cols to midC.
    const dir = r === 0 ? 1 : -1;
    for (let rr = r; rr !== midR; rr += dir) if (!isFloor(g[rr][c])) g[rr][c] = V;
    if (!isFloor(g[midR][c])) g[midR][c] = V;
    const dc = c <= midC ? 1 : -1;
    for (let cc = c; cc !== midC; cc += dc) if (!isFloor(g[midR][cc])) g[midR][cc] = V;
  }
}
function isFloor(ch) { return !isHardBlocked(ch); }

function buildInterior(g, spec) {
  // central 2×2 island
  for (const r of ISLAND_R) for (const c of ISLAND_C) g[r][c] = I;
  // extra island cells (feature anchors / spurs)
  for (const [r, c] of spec.island) {
    if (r <= 0 || r >= ROWS - 1 || c <= 0 || c >= COLS - 1)
      throw new Error(`island cell on ring @ ${r},${c}`);
    g[r][c] = I;
  }
  // bridge spine: link every open ring cell to the central island
  for (const [r, c] of RING_CELLS) if (isFloor(g[r][c])) layBridge(g, r, c);
  // connect extra island cells to the island band with a short bridge, so they're
  // reachable even if not adjacent (vertical then horizontal toward col5).
  for (const [r, c] of spec.island) {
    let rr = r; const dr = r <= 4 ? 1 : -1;
    while (rr !== 4 && !(ISLAND_R.includes(rr) && ISLAND_C.includes(c))) {
      if (!isFloor(g[rr][c])) g[rr][c] = V; rr += dr;
    }
    const targetC = c <= 5 ? 5 : 6;
    let cc = c; const dc = c <= targetC ? 1 : -1;
    while (cc !== targetC) { if (!isFloor(g[4][cc])) g[4][cc] = V; cc += dc; }
  }
}

function placeAll(g, place) {
  for (const [r, c, ch] of place) {
    if (r <= 0 || r >= ROWS - 1 || c <= 0 || c >= COLS - 1)
      throw new Error(`feature on ring @ ${r},${c} (interior only)`);
    g[r][c] = ch;
  }
}

// ── verification ────────────────────────────────────────────────────────────
/** Walkable-cell BFS from the central island. 'u' bush is eventually-walkable;
 *  '~' water / 'x' pit / 'M' etc are hard-blocked. */
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
      const openable = ch === 'u';   // sword-cuttable bush
      if (seen.has(k) || (isHardBlocked(ch) && !openable)) continue;
      seen.add(k); q.push([nr, nc]);
    }
  }
  return seen;
}

function assertScreen(g, key, spec) {
  // seed from the central island (always floor).
  const reach = walkReach(g, 4, 5);
  // every OPEN ring cell must be reachable (else it orphans the neighbour it faces).
  for (const [r, c] of RING_CELLS) {
    if (!isHardBlocked(g[r][c]) && !reach.has(`${r},${c}`))
      throw new Error(`open ring cell ${r},${c} unreachable on ${key} (would orphan neighbour)`);
  }
  // combat/chest features must be reachable on foot ('u' bushes are cuttable, so a
  // bush-boxed chest still passes; 'x' pit-boxed chests are come-back and are NOT in
  // this check because the ladder reward chest sits behind PIT — handled below).
  for (const [r, c, ch] of spec.place) {
    if (!'ECFB'.includes(ch)) continue;
    // a 'B' chest that is intentionally behind a PIT (ladder come-back) is exempt.
    if (ch === 'B' && behindPit(g, r, c)) continue;
    if (!reach.has(`${r},${c}`))
      throw new Error(`feature '${ch}' @ ${r},${c} unreachable inside ${key}`);
  }
}
/** true if the cell is separated from the reach set by a PIT on all its land-side
 *  neighbours (i.e. it's the come-back ladder reward). */
function behindPit(g, r, c) {
  let pitAdj = false, floorAdj = false;
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const t = g[r + dr]?.[c + dc];
    if (t === 'x') pitAdj = true;
    else if (t !== undefined && !isHardBlocked(t)) floorAdj = true;
  }
  return pitAdj && !floorAdj;
}

// ── apply ─────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

for (const k of LAKE) if (!field[k]) throw new Error(`missing lake stage ${k}`);
for (const k of Object.keys(SCREENS)) {
  if (!LAKE.has(k)) throw new Error(`bad spec key ${k} (not in lake set)`);
  if (PRESERVED.has(k)) throw new Error(`spec must NOT rebuild preserved screen ${k}`);
}
for (const k of REBUILT) if (!SCREENS[k]) throw new Error(`lake screen ${k} has no spec (would stay 塗り絵)`);

const rings = computeAllRings(field);

// ── inspection: print each screen's ring + pure spine (no features), marking the
//    open ring cells with '*' — lets us design features to avoid the spine lanes.
if (process.argv.includes('--rings')) {
  for (const [key, spec] of Object.entries(SCREENS)) {
    const g = rings.get(key).map((row) => row.slice());
    buildInterior(g, spec);   // spine only (no placeAll)
    console.log(`\n=== ${key} (${spec.pattern}) ===`);
    g.forEach((row, r) => {
      const marked = row.map((ch, c) => {
        const onRing = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
        return onRing && !isHardBlocked(ch) ? '*' : ch;
      });
      console.log(String(r).padStart(2), marked.join(''));
    });
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
  buildInterior(g, spec);
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

// ── guard: preserved D3 entrance untouched ────────────────────────────────────
if (!field['9,9'].mapEnters || !field['9,9'].mapEnters['3,10'])
  throw new Error(`preserved screen 9,9 lost its D3 mapEnter`);

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

// ── guard: NO arrival-wall hole sourced from any rebuilt lake screen ──────────
{
  const holes = [];
  for (const key of REBUILT) {
    const [sx, sy] = key.split(',').map(Number);
    const t = field[key].tiles;
    for (const [r, c] of RING_CELLS) {
      if (isHardBlocked(t[r][c])) continue;
      for (const [nk, nr, nc] of crossingsOf(sx, sy, r, c)) {
        const ns = field[nk];
        if (!ns) continue;                                  // off-map → engine clamps
        if (isHardBlocked(ns.tiles[nr]?.[nc]))
          holes.push(`${key}(${r},${c}) → ${nk}(${nr},${nc})=${ns.tiles[nr][nc]}`);
      }
    }
  }
  if (holes.length)
    throw new Error(`lake sources ${holes.length} arrival-wall hole(s):\n  ${holes.join('\n  ')}`);
}

const DRY = process.argv.includes('--dry');
if (DRY) {
  for (const key of Object.keys(SCREENS)) {
    console.log(`\n=== ${key} ===`);
    field[key].tiles.forEach((row, i) => console.log(String(i).padStart(2), row.join('')));
  }
} else {
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
}

const byPat = {};
for (const spec of Object.values(SCREENS)) byPat[spec.pattern] = (byPat[spec.pattern] || 0) + 1;
console.log(`\n9-6 ⑥-6 lake W: ${touched} screens rebuilt (9,9 D3 entrance preserved)${DRY ? ' [DRY — not written]' : ''}`);
console.log('  pattern 配分:', JSON.stringify(byPat));
