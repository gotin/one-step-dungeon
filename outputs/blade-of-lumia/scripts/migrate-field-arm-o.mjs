#!/usr/bin/env node
/**
 * migrate-field-arm-o.mjs  (Phase 9-6 ④ — 深洋O アーム7＝入口・海の戦闘)
 *
 * Builds the FIRST 7 of 深洋O's 25 screens: the ARM (DESIGN §19-1 geometry / §19-7
 * role map / §19-8-A escalation). The arm is where the player first meets the sunken
 * sea city, and it is the ONLY section of O whose face is 戦闘 — the corridor is
 * puzzle-only and the delta is exploration-only (分離原則 §19-8). So this script
 * places the three new sea mobs (魚群 '&' / 潜み鮫 '<' / 射水魚 '/') in the live map
 * for the first time; they existed only as parts + test-layer fixtures until now.
 *
 * ── Why O is NOT the lake-W script with different letters ──────────────────────
 * migrate-field-lake-w.mjs was the template, but O differs on ONE decisive point,
 * and getting it wrong would produce a map that passes every checker and is
 * unplayable in the browser:
 *
 *   Lake W:  water lives on the `tiles` layer, ground on bgTiles ('g' grass).
 *            → a bridge is `tiles`='v' and it is WALKABLE (it replaces the water).
 *   深洋 O:  water lives on the `bgTiles` layer (the 2026-07-25 single-source
 *            migration, so sea mobs can stand on it), `tiles` is all floor.
 *            → passable.js isWaterAt() returns true when EITHER layer is water,
 *              so painting `tiles`='v' over a bgTiles-water cell yields a bridge
 *              you CANNOT WALK ON. Walkability here is created by REMOVING the
 *              bgTiles water (bg 'o' stone / 'd' sand), never by drawing on tiles.
 *
 * ∴ in this script the ring/spine is carved in the **bgTiles** layer, and the
 * `tiles` layer carries only content (enemies / chest / sign / landmark stone).
 * `assertScreen` walks with the same cellTile() fold the engine uses, so a screen
 * whose walkway was drawn on the wrong layer fails the BFS instead of shipping.
 *
 * ── Connectivity: lake-hybrid ring rule (§15-1), not mirror-AND (§14-3) ───────
 * O's interior default is WATER (bg '~'), so it is the 湖 class, chosen by measuring
 * the interior default rather than by the skin name (§16-1 lesson). Ring cells:
 *   • O↔land crossing  → MIRROR: neighbour open → want open, neighbour walled → VETO.
 *   • O↔O crossing     → the standard skeleton cells (cols 5,6 vertical / rows 4,5
 *                        horizontal) always want open, plus OR-propagation so
 *                        openness can flow along the arm.
 *   • corners (two crossings) → forced water (§11-1 documented corner cost).
 * Iterated to a fixed point, then every open ring cell must be BFS-reachable from
 * the screen's spine or the screen would orphan the neighbour it faces.
 *
 * ── Ground skin (ユーザー確定 2026-07-26) ──────────────────────────────────────
 * O's visible ground was 'g' grass — wrong for a sunken sea city. This script
 * repaints the ARM's 7 screens: 'o' 石畳 (the drowned city's paving) as the base,
 * with 'd' 砂 one cell in from every water edge = 渚. Only the arm is repainted;
 * the corridor/delta keep their skin until their own screens are built (this task
 * is arm-only by user scope, and a skin-only touch of 18 more screens would be the
 * 量産 the user has twice rejected).
 *
 * NOTE the skin cannot fake quality: field-quality's effectiveFlat only folds bg
 * WATER, and LANDMARK_TILES needs 'o' on the *tiles* layer — so bg 'o' paving adds
 * zero axes. Every axis these 7 screens earn is earned by real content.
 *
 * ── Tool timing (§8-1) ────────────────────────────────────────────────────────
 * O is reached after D6 (expectedPower 7) = every tool owned (sword/shield/boomerang/
 * bow/candle/ladder/bomb/flute). So the arm has no come-back-later gating: all three
 * sea mobs and every chest here are try-now content. The one deliberate use of a
 * tool as a lock is A3's bomb wall '!' (bomb owned since D6, one screen earlier).
 *
 * Usage (run from outputs/blade-of-lumia/):
 *   node scripts/migrate-field-arm-o.mjs --rings   # print computed ring + spine
 *   node scripts/migrate-field-arm-o.mjs --dry     # print final screens, no write
 *   node scripts/migrate-field-arm-o.mjs           # write work/blade-of-lumia.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked, cellTile } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const ROWS = 10, COLS = 12;
const W = '~';   // bgTiles water = the sea (hard-blocked on foot; mobs stand on it)
const O = 'o';   // bgTiles 石畳 = the drowned city's paving (walkable)
const D = 'd';   // bgTiles 砂   = 渚 (walkable; one cell in from the water)
const F = '.';   // tiles floor (no content)

// ── the 7 arm screens (§19-1) ────────────────────────────────────────────────
// E0..E3 = the main road south-east along col15; A1..A3 = col14 side treasures.
const ARM = ['15,8', '14,9', '15,9', '14,10', '15,10', '14,11', '15,11'];

// ── per-screen spec ───────────────────────────────────────────────────────────
// `land`  : interior bgTiles cells to make walkable (the spine + platforms). The RING
//           is computed by the hybrid rule; open ring cells are auto-linked to the
//           nearest spine cell, so `land` shapes the FOOTING, not the connectivity.
// `place` : content on the `tiles` layer [r,c,ch]. Enemies may sit on water (that is
//           the whole point of the bgTiles migration); chests/signs may NOT.
// `data`  : chest / show / sign / links.
const S = (pattern, role, land, place = [], data = null) =>
  ({ pattern, role, land, place, data });
const rupee = (v, name) => ({ type: 'rupee', value: v, name: name || `ルピー×${v}` });
const heal = (big) => big
  ? { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' }
  : { type: 'item', item: 'healPotion', name: '回復薬（小）' };

// Helper: a rectangle of interior land cells.
const rect = (r0, r1, c0, c1) => {
  const out = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push([r, c]);
  return out;
};

const SCREENS = {
  // ══ E0 `15,8` — 教（the arm's entrance from 雪S / the teaching screen）═══════
  // The north+west ring is wide-open land (S is still 塗り絵 open), so E0 reads as
  // "you walk off the snow coast onto the first paving of the drowned city".
  // §19-8-A: ONE ranged enemy, low density. A single 射水魚 sits in the flooded
  // plaza and shoots across it — the player learns "the sea shoots back" while
  // standing on a wide, safe quay with no encirclement risk. The killAll chest is
  // the reason to engage rather than walk past (and earns the 戦闘 axis honestly).
  // The 雪S screen above is open across its whole bottom edge, so the mirror opens
  // E0's entire row0 — authored here as a 2-row shore band so the sea begins at row3
  // (rather than letting the spine punch ragged lanes down through the plaza).
  '15,8': S('P3', 'E0 教', [
    ...rect(1, 2, 1, 10),     // the shore band you walk in on from the snow coast
    ...rect(3, 8, 1, 3),      // the west quay (wide = safe footing while you learn)
    ...rect(4, 5, 4, 8),      // a paved causeway east across the flooded plaza
    ...rect(3, 6, 8, 10),     // the east plaza (holds the reward)
    ...rect(6, 8, 5, 6),      // the south spur → the col5/6 exit to E1
  ], [
    [3, 6, '/'],              // 射水魚: in the water north of the causeway, range 6
    [5, 9, 'B'],              // the reward, on the far side of the crossing
    [7, 2, 'i'],              // 海の石碑（番号なし・§19-9）: read from the arrival quay
  ], {
    chest: { pos: '5,9', content: heal(false) },
    show: { pos: '5,9', cond: { trigger: 'killAll', message: '⚔ 海の 弓手を 沈めた！宝箱が 現れた！' } },
    sign: {
      pos: '7,2',
      name: '沈んだ 都の 標 (しるし)',
      lines: ['ここより 先は 海の 領分。', '水は 見て いる。近づけば 撃たれよう。'],
    },
  }),

  // ══ A1 `14,9` — 脇の宝①（the first side screen, off the main road）══════════
  // A1..A3 are reached from the col14 land ring (open on N/W/E per the fixed point).
  // §19-8-A: the side screens vary the FOOTING. A1's footing is a 1-WIDE PIER (row 4
  // only) spanning open water to an east landing — a 潜み鮫 lurks directly beneath it,
  // so the whole span is walked with a shark surfacing at your elbow (bite range 1.6
  // reaches the pier from the water below it). Note col5/6 N+S are standard crossing
  // cells here, so the south road is a genuine road, not a dead end.
  '14,9': S('P2', 'A1 脇の宝①', [
    ...rect(1, 2, 1, 10),     // the north shelf (spans the wide-open N ring)
    ...rect(3, 8, 1, 2),      // the west shore (the col0 land ring)
    ...rect(6, 8, 3, 6),      // the south walk out to the col5/6 S crossing
    ...rect(4, 5, 3, 4),      // the pier root, off the west causeway
    [4, 5], [4, 6], [4, 7], [4, 8],   // the pier: 1-wide, over open water
    ...rect(3, 5, 9, 10),     // the east landing (rows 4,5 = the E standard cells)
  ], [
    [5, 7, '<'],              // 潜み鮫: surfaces directly beneath the pier's midspan
    [5, 10, 'B'],             // the reward, on the landing the pier reaches
    [3, 7, '&'],              // a fish school drifting along the pier's north side
  ], {
    chest: { pos: '5,10', content: rupee(30) },
  }),

  // ══ E1 `15,9` — 試の入口①（melee + ranged mixed）════════════════════════════
  // §19-8-A escalation: E1 is the first screen that mixes types. The 潜み鮫 forces
  // you off the rail while the 射水魚 punishes standing still — but the footing is
  // still generous (a T-shaped quay), so the mix is legible before it gets cruel.
  // Ring: only cols 5,6 (N/S) and rows 4,5 (W) are land here — a genuinely narrow,
  // sea-locked screen, which is exactly the "you are out at sea now" beat.
  '15,9': S('P3', 'E1 試①', [
    ...rect(1, 3, 5, 6),      // the north rail in from E0
    ...rect(4, 5, 1, 6),      // the west arm out to the row4/5 land ring
    ...rect(6, 8, 5, 6),      // the south rail out to E2
    ...rect(4, 6, 7, 8),      // a small east platform (dead-end footing to fight on)
  ], [
    [4, 9, '/'],              // 射水魚 east: shoots down the whole width of the quay
    [7, 4, '<'],              // 潜み鮫 south-west: surfaces at the rail's elbow
    [6, 8, 'B'],              // the reward, on the platform's tip
  ], {
    chest: { pos: '6,8', content: rupee(20) },
    show: { pos: '6,8', cond: { trigger: 'killAll', message: '⚔ 波間の 二匹を 退けた！宝箱が 現れた！' } },
  }),

  // ══ A2 `14,10` — 脇の宝②（the fish-school screen）═══════════════════════════
  // Footing varied again: A2 is a broad flooded courtyard with stepping platforms,
  // and its threat is NUMBERS — three 魚群 (hp2 each) converge from three sides.
  // On a wide floor that is a fun scrap rather than a death sentence; E3 later reuses
  // the same swarm on a 1-wide ledge, which is what makes E3 the hardest screen.
  '14,10': S('P3', 'A2 脇の宝②', [
    ...rect(1, 8, 1, 2),
    ...rect(4, 5, 3, 10),     // the full-width causeway (W ring → E ring)
    ...rect(1, 3, 5, 5),      // north step: 1-wide off the causeway (col5 only)
    ...rect(1, 2, 6, 6),
    ...rect(6, 8, 6, 6),      // south step: 1-wide, offset to col6 (asymmetric)
    ...rect(7, 8, 5, 5),
    ...rect(1, 3, 8, 9),      // a raised courtyard corner holding the chest
  ], [
    [3, 4, '&'], [2, 7, '&'], [6, 7, '&'],   // three 魚群 converge on the causeway
    [1, 9, 'B'],
  ], {
    chest: { pos: '1,9', content: heal(true) },
    show: { pos: '1,9', cond: { trigger: 'killAll', message: '⚔ 魚群を 散らした！宝箱が 現れた！' } },
  }),

  // ══ E2 `15,10` — 試の入口②（the same pair, harder geometry）═════════════════
  // E2 keeps E1's enemy mix but takes the footing away: the road is a zig-zag of
  // 1-wide paving, so the shark's bite and the two fishes' shots overlap on the only
  // cells you can stand on. Its axes are route + landmark + combat via the killAll-
  // sealed offering left at the landmark's foot.
  // 🔑 The landmark must be VISIBLE, not just metric-visible. 'o' (石畳) on the tiles
  // layer earns the landmark axis, but this screen's bg skin is ALSO 'o' — checked in a
  // real browser and the cell was indistinguishable from the paving around it. So the
  // landmark is 'h' (家の外壁): a standing wall of the drowned city, the one silhouette
  // out at sea. `LANDMARK_TILES` counts 'h' too, so the axis still holds honestly.
  '15,10': S('P3', 'E2 試②', [
    ...rect(1, 2, 5, 6),      // in from E1
    ...rect(2, 3, 2, 6),      // west jog
    ...rect(4, 5, 1, 3),      // out to the west land ring
    ...rect(3, 6, 7, 8),      // east jog (the zig)
    ...rect(6, 7, 3, 8),      // the low road
    ...rect(7, 8, 5, 6),      // out to E3
  ], [
    [4, 2, 'h'],              // 廃都の 立ち壁: the one silhouette out at sea = landmark
    [1, 8, '/'],              // 射水魚 covers the north jog
    [5, 9, '/'],              // 射水魚 covers the east jog
    [5, 5, '<'],              // 潜み鮫 in the pocket the zig wraps around (bites both lanes)
    [4, 3, 'B'],              // the offering left on the mosaic
  ], {
    chest: { pos: '4,3', content: rupee(15, '沈んだ 都の 供物 ルピー×15') },
    show: { pos: '4,3', cond: { trigger: 'killAll', message: '⚔ 廃都の 番いを 沈めた！供物が 現れた！' } },
  }),

  // ══ A3 `14,11` — 脇の宝③（bomb wall・the arm's last side room）══════════════
  // Footing: a walled CISTERN. The whole south ring is open land (山地M below is
  // 塗り絵-open), so the footing is authored as a full-width south walk at row 8 with
  // the flooded cistern (rows 6-7) held between it and the causeway. A 潜み鮫 and a
  // 魚群 share that pool, so crossing between causeway and south walk is contested.
  // §8-1 try-now: the bomb (D6's reward, owned one region back) breaks '!' at 3,9 —
  // the vault's ONLY entry, since a water moat isolates it on every other side. The
  // wall is INTERIOR (never on a crossing) so sealing it traps nothing.
  '14,11': S('P2', 'A3 脇の宝③', [
    ...rect(1, 8, 1, 1),      // the west shore column (feeds the whole W land ring)
    ...rect(1, 3, 2, 6),      // the north-west court
    ...rect(4, 5, 2, 10),     // the causeway (W ring → E standard cells)
    ...rect(8, 8, 2, 10),     // the south walk (feeds the wide-open S land ring)
    ...rect(1, 2, 8, 10),     // the vault chamber (moat-isolated except via 3,9)
    [3, 9],                   // the vault's sole approach — sealed by the bomb wall
  ], [
    [3, 9, '!'],              // 爆弾壁: the vault's only entry
    [1, 9, 'B'],              // 秘宝 behind it
    [6, 5, '<'],              // 潜み鮫 in the cistern pool between causeway and walk
    [7, 7, '&'],              // 魚群 sharing the pool
  ], {
    chest: { pos: '1,9', content: rupee(50, '沈んだ 都の 隠し ルピー×50') },
  }),

  // ══ E3 `15,11` — 最難（multiple types + fish-school encirclement）═══════════
  // §19-8-A's hardest screen, and the arm's climax before the corridor's quiet.
  // The footing is a single 1-wide causeway crossing the whole screen; TWO 魚群 sit
  // on opposite flanks of its narrowest point (they encircle a player who stops),
  // a 潜み鮫 surfaces mid-span, and a 射水魚 covers the exit. The south ring is
  // wide-open land (山地M below is 塗り絵-open) so the screen still hands you off
  // safely — the difficulty is the crossing, never a soft-lock.
  '15,11': S('P3', 'E3 最難', [
    ...rect(1, 3, 5, 6),      // the rail in from E2
    ...rect(4, 5, 1, 4),      // the west arm out to the W land ring (rows 4,5)
    [4, 5], [4, 6], [4, 7],   // THE SPAN: 1-wide over open water = the kill zone
    [5, 7], [6, 7], [7, 7],   // the descent to the shore, also 1-wide
    ...rect(7, 7, 3, 4),      // a ledge off the shore (holds the reward)
    ...rect(8, 8, 1, 10),     // the south shore (feeds the full-width S land ring)
  ], [
    // THREE 魚群 packed under the span = a real 包囲 on 1-wide footing, and the
    // reason E3 outscores E2 on battleScore (§19-8-A: E3 must be the arm's hardest).
    [5, 5, '&'], [5, 6, '&'], [3, 7, '&'],
    [4, 8, '<'],              // 潜み鮫 surfaces at the span's far end
    // TWO 射水魚 in crossfire over the reward ledge — east one rakes the descent,
    // west one covers the ledge itself, so collecting the chest is never free.
    [6, 9, '/'], [6, 4, '/'],
    [7, 3, 'B'],
    // 海の石碑B: the arm's closing line. Kept OFF the col7 descent junction (8,7) —
    // a sign is hard-blocked, and putting it there severed the only path down.
    // ⚠️ ALSO off row8 (⑥-footprint): row8 is the full-width south shore = the whole
    // northward crossing from C1 `15,12`, whose landing row 8.5 spans rows 8+9. The
    // draft put it at (8,9) and that column bounced the player back with no visible
    // wall. It now sits on the reward ledge, still readable from the shore below
    // (8,4), and the chest at (7,3) stays reachable from (8,3).
    [7, 4, 'i'],
  ], {
    chest: { pos: '7,3', content: rupee(25) },
    show: { pos: '7,3', cond: { trigger: 'killAll', message: '⚔ 海の 難所を 越えた！宝箱が 現れた！' } },
    sign: {
      pos: '7,4',
      name: '潮 廊 (しおろう) の 手前',
      lines: ['海の 難所は ここで 尽きる。', 'この先の 廊は 潮が 満ちて 塞ぐ。', '潮を 引かせる 術を 探せ。'],
    },
  }),
};

// ── ring computation (lake-hybrid, §15-1) ─────────────────────────────────────
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
const isStandard = (axis, r, c) => (axis === 'v' ? (c === 5 || c === 6) : (r === 4 || r === 5));
const isCorner = (r, c) => (r === 0 || r === ROWS - 1) && (c === 0 || c === COLS - 1);

const ARM_SET = new Set(ARM);

/** Compute, for every arm screen, which ring cells must be LAND (walkable). */
function computeAllRings(field) {
  const open = new Map();
  for (const k of ARM) open.set(k, Array.from({ length: ROWS }, () => Array(COLS).fill(false)));

  // a neighbour cell's openness: arm screen → current iteration; outside → its real tiles
  const armOpenNow = (nk, nr, nc) => open.get(nk)[nr][nc];
  const outsideOpen = (nk, nr, nc) => {
    const ns = field[nk];
    if (!ns) return null;                       // off-map → engine clamps, ignore
    return !isHardBlocked(cellTile(ns, nr, nc)); // cellTile folds bg water → '~'
  };

  let changed = true, guard = 0;
  while (changed) {
    if (++guard > 200) throw new Error('ring fixed point did not converge');
    changed = false;
    for (const key of ARM) {
      const [sx, sy] = key.split(',').map(Number);
      const g = open.get(key);
      for (const [r, c] of RING_CELLS) {
        if (isCorner(r, c)) continue;   // corners are decided by the cluster pass below
        let want = false, veto = false;
        for (const [nk, nr, nc, axis] of crossingsOf(sx, sy, r, c)) {
          if (ARM_SET.has(nk)) {
            if (isStandard(axis, r, c) || armOpenNow(nk, nr, nc)) want = true;
          } else {
            const o = outsideOpen(nk, nr, nc);
            if (o === null) continue;
            if (o) want = true; else veto = true;
          }
        }
        const next = want && !veto;
        if (g[r][c] !== next) { g[r][c] = next; changed = true; }
      }
    }
  }

  // ── corner pass (§11-1 corner limit, resolved honestly) ─────────────────────
  // A corner faces TWO crossings, so the mirror can't satisfy both independently:
  // it must agree with every facing cell at once or somebody sources a trap. And
  // corners of adjacent arm screens face EACH OTHER, so a per-cell mirror-AND is
  // circular — it converges to "all closed" even when the outside land corners it
  // faces are open, which flips the trap onto the neighbour.
  //
  // So corners are resolved by CLUSTER: group every mutually-facing corner cell
  // (arm corners linked to each other, plus the outside corners they face), then
  // open the whole cluster iff EVERY outside cell in it is already open land. The
  // arm's neighbours (雪S/山地M/湖W/未着手O) are all 塗り絵 with open corners today,
  // so every cluster opens → zero traps in both directions. If a neighbour region
  // later walls a corner, the cluster closes as one and stays trap-free.
  const cornerCells = RING_CELLS.filter(([r, c]) => isCorner(r, c));
  const seen = new Set();
  for (const key of ARM) {
    for (const [r, c] of cornerCells) {
      const id = `${key}:${r},${c}`;
      if (seen.has(id)) continue;
      // flood the mutually-facing corner cluster
      const cluster = [], outside = [];
      const stack = [[key, r, c]];
      seen.add(id);
      while (stack.length) {
        const [k, rr, cc] = stack.pop();
        cluster.push([k, rr, cc]);
        const [kx, ky] = k.split(',').map(Number);
        for (const [nk, nr, nc] of crossingsOf(kx, ky, rr, cc)) {
          if (!field[nk]) continue;                        // off-map → ignore
          if (!ARM_SET.has(nk)) { outside.push([nk, nr, nc]); continue; }
          const nid = `${nk}:${nr},${nc}`;
          if (seen.has(nid)) continue;
          seen.add(nid);
          stack.push([nk, nr, nc]);
        }
      }
      const allOutsideOpen = outside.length > 0 && outside.every(([nk, nr, nc]) => outsideOpen(nk, nr, nc));
      for (const [k, rr, cc] of cluster) open.get(k)[rr][cc] = allOutsideOpen;
    }
  }
  return open;
}

// ── build one screen's bgTiles grid ───────────────────────────────────────────
/** The spine: connect an open ring cell inward until it meets existing land.
 *  Walks straight in along the entry axis, paving sea cells, and stops as soon as
 *  the NEXT cell inward is already land (so it joins the authored footing instead
 *  of tunnelling through it). Always paves the ring cell itself. */
function layWalk(bg, r, c) {
  const inBounds = (rr, cc) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS;
  const isLand = (rr, cc) => inBounds(rr, cc) && bg[rr][cc] !== W;
  const horizontal = (c === 0 || c === COLS - 1);
  const dr = horizontal ? 0 : (r === 0 ? 1 : -1);
  const dc = horizontal ? (c === 0 ? 1 : -1) : 0;
  let rr = r, cc = c;
  for (let guard = 0; guard <= Math.max(ROWS, COLS); guard++) {
    if (bg[rr][cc] === W) bg[rr][cc] = O;
    const nr = rr + dr, nc = cc + dc;
    if (!inBounds(nr, nc)) return;   // walked clean through (screen has no footing here)
    if (isLand(nr, nc)) return;      // joined the authored footing
    rr = nr; cc = nc;
  }
}

function buildBg(ringOpen, spec, key) {
  const bg = Array.from({ length: ROWS }, () => Array(COLS).fill(W));
  // interior footing from the spec
  for (const [r, c] of spec.land) {
    if (r <= 0 || r >= ROWS - 1 || c <= 0 || c >= COLS - 1)
      throw new Error(`${key}: land cell on the ring @ ${r},${c} (ring is computed, not authored)`);
    bg[r][c] = O;
  }
  // ring: open cells become land, closed cells stay sea
  for (const [r, c] of RING_CELLS) if (ringOpen[r][c]) bg[r][c] = O;
  // spine: every open ring cell must reach the interior footing
  for (const [r, c] of RING_CELLS) if (ringOpen[r][c]) layWalk(bg, r, c);
  return bg;
}

/** 渚: every land cell orthogonally touching the sea becomes 'd' sand. */
function paintShore(bg) {
  const isSea = (r, c) => bg[r]?.[c] === W;
  const out = bg.map((row) => row.slice());
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (bg[r][c] === W) continue;
    if (isSea(r - 1, c) || isSea(r + 1, c) || isSea(r, c - 1) || isSea(r, c + 1)) out[r][c] = D;
  }
  return out;
}

// ── verification ──────────────────────────────────────────────────────────────
/** Walk the screen the way the engine does: bg water blocks, tiles content blocks. */
function effTile(tiles, bg, r, c) {
  if (bg[r]?.[c] === W) return W;            // mirrors passable.js isWaterAt
  return tiles[r]?.[c];
}
function walkReach(tiles, bg, sr, sc) {
  const seen = new Set([`${sr},${sc}`]);
  const q = [[sr, sc]];
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const k = `${nr},${nc}`;
      if (seen.has(k)) continue;
      const ch = effTile(tiles, bg, nr, nc);
      // '!' bomb wall and 'u' bush are openable with tools the player owns here.
      const openable = ch === '!' || ch === 'u';
      if (isHardBlocked(ch) && !openable) continue;
      seen.add(k); q.push([nr, nc]);
    }
  }
  return seen;
}

function assertScreen(tiles, bg, ringOpen, key, spec) {
  // seed: any open ring cell (that is how the player actually arrives).
  const seed = RING_CELLS.find(([r, c]) => ringOpen[r][c] && effTile(tiles, bg, r, c) !== W);
  if (!seed) throw new Error(`${key}: no walkable open ring cell to enter from`);
  const reach = walkReach(tiles, bg, seed[0], seed[1]);

  // 1. every open ring cell reachable → the screen never orphans a neighbour.
  for (const [r, c] of RING_CELLS) {
    if (!ringOpen[r][c]) continue;
    if (!reach.has(`${r},${c}`))
      throw new Error(`${key}: open ring cell ${r},${c} unreachable (would orphan the neighbour it faces)`);
  }
  // 2. chests / signs must be reachable on foot, and must NOT sit on water.
  for (const [r, c, ch] of spec.place) {
    if (!'Bi'.includes(ch)) continue;
    if (bg[r][c] === W) throw new Error(`${key}: '${ch}' @ ${r},${c} sits on water (unreachable forever)`);
    if (ch === 'B' && !reach.has(`${r},${c}`))
      throw new Error(`${key}: chest @ ${r},${c} unreachable`);
    if (ch === 'i') {
      // a sign is not standable; it must be READ from an adjacent reachable cell.
      const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .some(([dr, dc]) => reach.has(`${r + dr},${c + dc}`));
      if (!adj) throw new Error(`${key}: sign @ ${r},${c} has no adjacent reachable cell to read from`);
    }
  }
  // 3. every enemy must be able to act: water mobs need water under them.
  for (const [r, c, ch] of spec.place) {
    if (!'&</'.includes(ch)) continue;
    if (bg[r][c] !== W)
      throw new Error(`${key}: water mob '${ch}' @ ${r},${c} is on land (it cannot move or reach you)`);
  }
  // 4. a water mob must be able to threaten SOMEBODY: at least one reachable land
  //    cell within its attack reach, else it is decoration (the "harmless ornament"
  //    failure the shark's two-stage attack was added to prevent).
  const REACH_OF = { '&': 1.5, '<': 6, '/': 6 };
  for (const [r, c, ch] of spec.place) {
    if (!(ch in REACH_OF)) continue;
    const rad = REACH_OF[ch];
    let threatens = false;
    for (const k of reach) {
      const [pr, pc] = k.split(',').map(Number);
      if (Math.hypot(pr - r, pc - c) <= rad) { threatens = true; break; }
    }
    if (!threatens) throw new Error(`${key}: '${ch}' @ ${r},${c} can never reach any walkable cell (decoration)`);
  }
}

// ── apply ─────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

for (const k of ARM) {
  if (!field[k]) throw new Error(`missing arm stage ${k}`);
  if (!SCREENS[k]) throw new Error(`arm screen ${k} has no spec (would stay 塗り絵)`);
}
for (const k of Object.keys(SCREENS)) if (!ARM_SET.has(k)) throw new Error(`bad spec key ${k}`);

const rings = computeAllRings(field);

if (process.argv.includes('--rings')) {
  for (const key of ARM) {
    const spec = SCREENS[key];
    const bg = buildBg(rings.get(key), spec, key);
    console.log(`\n=== ${key} ${spec.role} (${spec.pattern}) — bg spine, * = open ring ===`);
    bg.forEach((row, r) => {
      const marked = row.map((ch, c) => {
        const onRing = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
        return onRing && ch !== W ? '*' : ch;
      });
      console.log(String(r).padStart(2), marked.join(''));
    });
  }
  process.exit(0);
}

let touched = 0;
const seenLayouts = new Map();

for (const key of ARM) {
  const spec = SCREENS[key];
  const stage = field[key];
  if (stage.rows !== ROWS || stage.cols !== COLS)
    throw new Error(`unexpected size on ${key}: ${stage.rows}x${stage.cols}`);

  const ringOpen = rings.get(key);
  const bgGrid = paintShore(buildBg(ringOpen, spec, key));

  // tiles layer: floor everywhere, then content. (Walkability lives in bgTiles.)
  const tiles = Array.from({ length: ROWS }, () => Array(COLS).fill(F));
  for (const [r, c, ch] of spec.place) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) throw new Error(`${key}: place out of range @ ${r},${c}`);
    if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1)
      throw new Error(`${key}: content on the ring @ ${r},${c} (interior only — a ring cell is a crossing)`);
    if (tiles[r][c] !== F) throw new Error(`${key}: two features stacked @ ${r},${c}`);
    tiles[r][c] = ch;
  }

  assertScreen(tiles, bgGrid, ringOpen, key, spec);

  // dup guard on the EFFECTIVE layout (the same fold duplicateLayoutGroups uses).
  const hash = tiles
    .map((row, r) => row.map((ch, c) => (bgGrid[r][c] === W ? W : ch)).join(''))
    .join('|');
  if (seenLayouts.has(hash)) throw new Error(`duplicate layout: ${key} == ${seenLayouts.get(hash)}`);
  seenLayouts.set(hash, key);

  stage.tiles = tiles.map((row) => row.slice());   // array-of-char-arrays (engine format)
  const bgObj = {};
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) bgObj[`${r},${c}`] = bgGrid[r][c];
  stage.bgTiles = bgObj;

  // reset per-screen data so no stale 塗り絵 entry lingers.
  stage.chestContents = {};
  stage.showConditions = {};
  stage.signData = {};
  stage.links = spec.data?.links ? spec.data.links.map((l) => ({ ...l })) : [];

  const d = spec.data || {};
  for (const ck of ['chest', 'chest2']) if (d[ck]) stage.chestContents[d[ck].pos] = d[ck].content;
  if (d.show) stage.showConditions[d.show.pos] = d.show.cond;
  if (d.sign) {
    const [sr, sc] = d.sign.pos.split(',').map(Number);
    if (stage.tiles[sr][sc] !== 'i')
      throw new Error(`sign on ${key} @ ${d.sign.pos} not on an 'i' tile (=${stage.tiles[sr][sc]})`);
    stage.signData[d.sign.pos] = { name: d.sign.name, lines: d.sign.lines };
  }
  touched++;
}

// ── guard: no 'i' tile without a body (無言看板) ───────────────────────────────
for (const key of ARM) {
  const stage = field[key];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (stage.tiles[r][c] !== 'i') continue;
    const pk = `${r},${c}`;
    if (!stage.signData?.[pk] && !stage.npcData?.[pk])
      throw new Error(`empty sign on ${key} @ ${pk} (no signData/npcData body)`);
  }
}

// ── guard: chestContents / showConditions keys must sit on a 'B' tile ─────────
for (const key of ARM) {
  const stage = field[key];
  for (const [name, dict] of [['chestContents', stage.chestContents], ['showConditions', stage.showConditions]]) {
    for (const pk of Object.keys(dict)) {
      const [r, c] = pk.split(',').map(Number);
      if (stage.tiles[r][c] !== 'B')
        throw new Error(`${name} on ${key} @ ${pk} not on a 'B' tile (=${stage.tiles[r][c]})`);
    }
  }
}

// ── guard: no arrival-wall hole in EITHER direction across the arm's border ────
// Both directions matter. Checking only "arm → neighbour" misses the mirror bug:
// if the arm walls a cell whose facing neighbour cell is open LAND, the NEIGHBOUR
// becomes the trap source and the whole-map trap metric goes up while this script
// reports success. (That is exactly what happened with forced-water corners.)
{
  const holes = [];
  for (const key of ARM) {
    const [sx, sy] = key.split(',').map(Number);
    const s = field[key];
    for (const [r, c] of RING_CELLS) {
      const here = cellTile(s, r, c);
      for (const [nk, nr, nc] of crossingsOf(sx, sy, r, c)) {
        const ns = field[nk];
        if (!ns) continue;                       // off-map → engine clamps
        const there = cellTile(ns, nr, nc);
        if (!isHardBlocked(here) && isHardBlocked(there))
          holes.push(`out: ${key}(${r},${c}) → ${nk}(${nr},${nc})=${there}`);
        if (isHardBlocked(here) && !isHardBlocked(there))
          holes.push(`in:  ${nk}(${nr},${nc}) → ${key}(${r},${c})=${here}`);
      }
    }
  }
  if (holes.length)
    throw new Error(`arm border has ${holes.length} arrival-wall hole(s):\n  ${holes.join('\n  ')}`);
}

const DRY = process.argv.includes('--dry');
if (DRY) {
  for (const key of ARM) {
    const s = field[key];
    console.log(`\n=== ${key} ${SCREENS[key].role} — tiles | bgTiles ===`);
    for (let r = 0; r < ROWS; r++) {
      const t = s.tiles[r].join('');
      let bg = '';
      for (let c = 0; c < COLS; c++) bg += s.bgTiles[`${r},${c}`];
      console.log(String(r).padStart(2), t, ' ', bg);
    }
  }
} else {
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
}

const byPat = {};
for (const k of ARM) byPat[SCREENS[k].pattern] = (byPat[SCREENS[k].pattern] || 0) + 1;
console.log(`\n9-6 ④ 深洋O アーム7: ${touched} screens built${DRY ? ' [DRY — not written]' : ''}`);
console.log('  pattern 配分:', JSON.stringify(byPat));
console.log('  海棲雑魚 初配置: 魚群 & / 潜み鮫 < / 射水魚 /');
