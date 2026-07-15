#!/usr/bin/env node
/**
 * migrate-field-snow-s.mjs  (Phase 9-6 ⑥-8 — 8th region, 雪 S)
 *
 * Rebuilds the 13 塗り絵 alpine-snow (S-zone) screens NE of the map — the frozen
 * highland descending from the volcano (L to the N/W) toward the ice-ruins dungeon
 * D5 (entrance 13,5) and the sea (~ to the E/S). One PRESERVED screen (designed
 * content, NOT rebuilt):
 *   - 13,5 : the D5 ice-temple entrance (mapEnters dungeon_5, a hand-built shrine
 *            room). Its ring openings are top/bot cols5,6 · left rows4-7 · right rows
 *            4,5; neighbours mirror those exactly (a rebuilt S never forces its wall).
 *
 * The FACE of the snow highland is 石/迷路 (§4-2 "S 雪" + PLAN ⑥-8 "石/迷路が顔"):
 * open snow-drift mazes carved by 'M' mountains into single-path 分岐, plus the region's
 * showcase 倉庫番-grade stone puzzle. Mix P1×7 / P2×3 / P3×2 / P4×1 (13).
 *
 * ── 🔑 Connectivity invariant — grassland's FLOOR-default mirror-AND (§14-3/§16-1) ──
 * Snow is a FLOOR-default region: every S screen's bgTile is 's' (snow), the interior
 * is default floor carved by 'M' mountains, and '~' appears only as local frozen pools.
 * This is the same class as grassland/mountain-M (NOT the lake's water-default hybrid).
 * So S reuses the proven rule from mountain-M (§16-1) verbatim:
 *   A ring cell is FLOOR iff EVERY on-map crossing faces an OPEN neighbour; else 'M'.
 *   EDGE cells (one crossing) mirror; CORNER cells (two crossings) open only if BOTH
 *   face open → a rebuilt screen is NEVER the source of an arrival-wall hole.
 * Neighbours: rebuilt S → in-progress ring; everything else (grassland G open, the
 * finished volcano-side L, the preserved D5 entrance, the finished outer sea ~) → their
 * fixed tiles. Content lives in the interior (rows2-7 × cols2-9); row1/row8/col1/col10
 * stay a floor moat so open ring cells reconnect regardless of interior mountains/pools.
 *
 * ── Tool-timing (§8-1, STRICT) ──────────────────────────────────────────────────
 * 攻略 order D1→D2→D3→D4→D6→D5→D8→D7. Snow is the D5 region, reached AFTER D4 →
 * owned = {sword, shield, boomerang, bow, candle}. NOT owned: ladder (D5's OWN reward),
 * bomb (D6), flute (D8). So:
 *   - TRY-NOW previews (openable with what you already hold):
 *       • 石押し・倉庫番 (2 stones → 2 buttons → allSwitchesOn sealed chest) @ 13,4 —
 *         the region's showcase puzzle, previewing D5's stone gates. Tool-free.
 *       • 弓ゲート (Y struck by an arrow across a frozen moat) @ 11,6 — bow owned since
 *         D3. A single sight-line lane makes the shot a read, not a point-blank tap.
 *       • かがり火 (H lit by the candle → reveals a sealed 'B') @ 10,6 — candle owned
 *         since D4. A come-back-flavoured reward that is openable now (candle in hand).
 *   - COME-BACK-LATER (NOT a preview — the tool is D5's OWN reward, §8-1):
 *       • はしご水渡り @ 11,7 : ladder = D5 reward → a pit-boxed chest crossable only
 *         after clearing D5. Unreachable near-cut today (behindPit exempts the walk-check).
 *   - Sword-cut 'u' bush secrets are try-now (sword owned from the start).
 *
 * bgTiles ('s' snow) untouched — '~' pools / 'M' mountains / features render over it.
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

// 14 S screens. PRESERVED (existing designed content, NOT rebuilt):
//   - 13,5 : D5 ice-temple entrance (mapEnters dungeon_5 + hand-built shrine).
const PRESERVED = new Set(['13,5']);
const SZONE = new Set([
  '13,3',
  '12,4', '13,4', '14,4',
  '11,5', '12,5', '13,5', '14,5',
  '10,6', '11,6', '12,6', '13,6',
  '11,7', '12,7',
]);
const REBUILT = new Set([...SZONE].filter((k) => !PRESERVED.has(k)));

// ── per-screen specs (13 screens) ─────────────────────────────────────────────
// `place`: interior feature tiles [r,c,ch] (rows2-7 × cols2-9 — never on the moat).
// The RING is auto-computed by the mirror; the FLOOR interior + moat connect it.
const S = (pattern, place = [], data = null) => ({ pattern, place, data });
const rupee = (v) => ({ type: 'rupee', value: v, name: `ルピー×${v}` });
const heal = () => ({ type: 'item', item: 'healPotion', name: '回復薬（小）' });

const SCREENS = {
  // ══ Row 3 — the volcano-side upper snowfield (N/W = 火山 L, finished) ══════════
  '13,3': S('P1', [
    // the highest snow shelf: mountains fork the descent from the volcano ridge,
    // a lone snow-laden tree marks the trailhead, a bush tucked in a crag.
    [2, 4, 'M'], [2, 5, 'M'], [3, 5, 'M'], [5, 6, 'M'], [6, 6, 'M'], [6, 7, 'M'],
    [4, 8, 't'], [3, 8, 't'], [7, 4, 'u'],
  ]),

  // ══ Row 4 — the stone-puzzle terrace + maze approaches ═════════════════════════
  '12,4': S('P1', [
    // W borders grassland (open): a snow-drift maze — mountains crook the path into
    // a switchback with a frozen pool '~' crossed by a 'v' ice-bridge (obstacle).
    [2, 5, 'M'], [3, 5, 'M'], [4, 5, 'M'], [5, 3, 'M'], [6, 3, 'M'],
    [4, 7, '~'], [5, 7, '~'], [5, 8, 'v'], [3, 8, 't'], [7, 6, 'u'],
  ]),
  '13,4': S('P2', [
    // 石押し・倉庫番 TRY-NOW (tool-free, 9-6-P showcase — an ORDER puzzle, not a 1-push tap):
    // TWO stones must each rest on their OWN button; the chest at 3,3 is sealed by
    // `allSwitchesOn` (unseals only when BOTH buttons are pressed — one alone does nothing).
    //   • stone A @ 5,5 : push DOWN col5 → rests on button 6,5 (wall 'M' 7,5 stops it ON).
    //   • stone B @ 5,7 : push LEFT row5 → rests on button 5,3 (wall 'M' 5,2 stops it ON).
    //   🔑 A's START cell (5,5) lies ON B's push-lane (row5), so ORDER matters:
    //     WRONG (B first): B slides (5,7)→(5,6)→ jams at (5,6) against stone A on (5,5) =
    //       dead-end (recoverable by leaving+re-entering — enterStage resets stones, 9-6-P).
    //     RIGHT: push A DOWN out of the corridor FIRST (5,5→6,5), THEN push B LEFT over the
    //       now-empty (5,5) to (5,3). The buttons (6,5)/(5,3) are non-adjacent and the
    //       player-follow cells (5,5)/(5,4) are plain floor — so there is no "stand on a
    //       button" shortcut. Previews D5's stone gates. Chest stays walkable (logical seal).
    [5, 5, '*'], [6, 5, 'S'], [7, 5, 'M'],
    [5, 7, '*'], [5, 3, 'S'], [5, 2, 'M'],
    [3, 3, 'B'], [2, 8, 'i'], [2, 5, 't'], [7, 8, 'u'],
  ], {
    // NOTE: no `links` — the chest is revealed by allSwitchesOn (both buttons), not a
    // per-switch gate. The dead-gate guard (links-only) therefore doesn't apply; the
    // sealed-chest secret axis comes from showConditions. The order dependency is verified
    // end-to-end in snow-stone-gate.spec.js (A-first solves; B-first jams).
    chest: { pos: '3,3', content: rupee(30) },
    show: { pos: '3,3', cond: { trigger: 'allSwitchesOn', message: '⚙ 二つの 印が 揃った！氷の 封印が 解けた！' } },
    sign: { pos: '2,8', name: '氷の 関の 石標', lines: ['「二つの 石を 二つの 印へ。片方では 開かぬ」', '押す 順を 誤れば 石は 道を 塞ぐ。'] },
  }),
  '14,4': S('P1', [
    // NE corner shelf (E faces the sea ~): a narrow cliff-cut lane doglegs past two
    // snow crags, a frozen pool seeps at the base with a bush on the far bank.
    [2, 6, 'M'], [3, 6, 'M'], [3, 7, 'M'], [5, 4, 'M'], [6, 4, 'M'], [6, 5, 'M'],
    [4, 8, '~'], [5, 8, '~'], [7, 7, 'u'], [2, 3, 't'],
  ]),

  // ══ Row 5 — the D5 approach (13,5 preserved); guards & mazes flank it ══════════
  '11,5': S('P1', [
    // W/N border grassland (open): the main descent — a mountain defile splits into a
    // long lane and a short cut past a snow tree, a bush pocket at the dead-end.
    [2, 4, 'M'], [3, 4, 'M'], [4, 4, 'M'], [5, 5, 'M'], [6, 5, 'M'], [6, 6, 'M'],
    [3, 7, 't'], [4, 8, 't'], [7, 8, 'u'],
  ]),
  '12,5': S('P3', [
    // W approach chokepoint to D5: an elite 'F' + two chasers 'C' hold a killAll chest
    // where the mountains pinch the snowfield to a single lane before the temple gate.
    [2, 5, 'M'], [2, 6, 'M'], [6, 5, 'M'], [6, 6, 'M'], [3, 5, 'F'], [5, 5, 'C'],
    [5, 6, 'C'], [4, 6, 'B'], [4, 5, 'M'],
  ], {
    chest: { pos: '4,6', content: heal() },
    show: { pos: '4,6', cond: { trigger: 'killAll', message: '⚔ 神殿を 守る 精鋭を 退けた！宝箱が現れた！' } },
  }),
  '14,5': S('P1', [
    // E-of-D5 shelf (E faces the sea ~, S faces the sea ~): a cliff terrace with a
    // frozen pool crossed by a 'v' ice-bridge; snow trees frame a bush secret.
    [3, 4, 'M'], [3, 5, 'M'], [4, 7, '~'], [5, 7, '~'], [5, 6, 'v'],
    [6, 4, 'M'], [2, 7, 't'], [6, 7, 'u'], [7, 4, 't'],
  ]),

  // ══ Row 6 — the lower snowfield: 弓ゲート & かがり火 previews (sea to E) ═════════
  '10,6': S('P2', [
    // かがり火 TRY-NOW (candle owned since D4, §8-1): a single beacon 'H' at 4,5; lighting
    // it (torchesLit) reveals a sealed 'B' offering at 4,7. N/W border grassland (open).
    // A snow tree and a bush round out the shrine clearing.
    [4, 5, 'H'], [4, 7, 'B'], [3, 7, 'M'], [5, 7, 'M'], [4, 8, 'M'],
    [2, 4, 't'], [6, 6, 'u'], [6, 3, 't'],
  ], {
    show: { pos: '4,7', cond: { trigger: 'torchesLit', message: '🔥 かがり火が 灯り、雪の 封印が 解けた！' } },
    chest: { pos: '4,7', content: rupee(20) },
  }),
  '11,6': S('P2', [
    // 弓ゲート TRY-NOW (bow owned since D3, §8-1): the switch 'Y' at 5,4 sits on a spit
    // walled by mountains (5,3 / 4,4 / 6,4) with a frozen moat '~' at 5,5-5,6 to its east,
    // so the sword can NEVER reach it — the ONLY way is to STAND east of the moat (5,7/5,8)
    // facing LEFT and fire an arrow WEST along row5, the arrow flying over the ice to strike
    // Y (a sight-line read, not a point-blank tap). Hitting Y opens the linked 'T' gate at
    // 4,7 — the sole entrance to a rupee boxed at 3,7 (M on its other 3 sides). Previews
    // D3's arrow gates. The dead-gate guard confirms 3,7 is UNREACHABLE with 4,7 closed.
    [5, 4, 'Y'], [5, 5, '~'], [5, 6, '~'], [5, 3, 'M'], [4, 4, 'M'], [6, 4, 'M'],
    [4, 7, 'T'], [3, 7, 'B'], [3, 6, 'M'], [3, 8, 'M'], [2, 7, 'M'],
    [2, 3, 'i'], [6, 7, 'u'],
  ], {
    links: [{ switchId: '5,4', gateId: '4,7' }],
    chest: { pos: '3,7', content: rupee(25) },
    sign: { pos: '2,3', name: '氷結の 射的場', lines: ['凍った 堀の 向こうの 石突を 射よ。', '矢のみ 届く。神殿の 仕掛けの 予行なり。'] },
  }),
  '12,6': S('P3', [
    // S-of-D5 chokepoint: an elite 'F' + patrol hold a killAll chest at a mountain
    // pinch — the harder southern gauntlet before the sea edge.
    [2, 4, 'M'], [2, 8, 'M'], [6, 4, 'M'], [6, 8, 'M'], [4, 4, 'F'], [4, 8, 'C'],
    [3, 6, 'E'], [5, 6, 'B'],
  ], {
    chest: { pos: '5,6', content: rupee(25) },
    show: { pos: '5,6', cond: { trigger: 'killAll', message: '⚔ 峠の 精鋭を 退けた！宝箱が現れた！' } },
  }),
  '13,6': S('P1', [
    // SE snowfield (E faces the sea ~): a mountain gorge with a single lane and a
    // frozen pool crossed by a 'v' ice-bridge; a bush against the crag.
    [3, 4, 'M'], [3, 5, 'M'], [6, 6, 'M'], [6, 7, 'M'], [4, 8, '~'], [5, 8, '~'],
    [5, 7, 'v'], [2, 7, 't'], [7, 4, 'u'],
  ]),

  // ══ Row 7 — the coastal snow edge (S/W = outer sea ~, finished) ════════════════
  '11,7': S('P2', [
    // はしご水渡り COME-BACK (ladder = D5 reward → NOT a preview, §8-1): a 1-cell PIT 'x'
    // at 4,4 fronts a rupee chest 'B' boxed at 4,3 (M on the other 3 sides), crossable
    // ONLY with the ladder (both banks are floor = a valid ladder bridge). Until D5 it is
    // an unreachable near-cut (behindPit exempts it from the walk-check). Sign hints.
    // W/S face the sea ~ (mirror walls). A bush secret is reachable today.
    [4, 4, 'x'], [4, 3, 'B'], [3, 3, 'M'], [5, 3, 'M'], [4, 2, 'M'],
    [6, 6, 'u'], [6, 7, 'M'], [2, 6, 't'], [3, 7, 'i'],
  ], {
    chest: { pos: '4,3', content: rupee(15) },
    sign: { pos: '3,7', name: '雪解けの 飛び石', lines: ['凍え 割れた 谷。一歩 届かぬ。', 'はしごを 渡す 力あらば 越えられよう。'] },
  }),
  '12,7': S('P4', [
    // 凍った滝 landmark (§4-3 S = 凍った滝 '~'+'M' + ランドマーク): a frozen cascade '~'
    // spilling over a stone-floor 'o' terrace with a 石碑, ringed by mountains. S faces the
    // sea ~. A bush secret in the drift; distinct broken footprint (no dup with any cairn).
    [2, 5, '~'], [3, 5, '~'], [4, 5, '~'], [3, 4, 'M'], [3, 6, 'M'],
    [5, 5, 'o'], [5, 6, 'o'], [5, 4, 'o'], [6, 5, 'i'], [4, 8, 'M'], [6, 8, 'u'], [2, 8, 't'],
  ], {
    sign: { pos: '6,5', name: '凍てつく 滝', lines: ['時を 止めた 氷の 滝。', '雪の 神殿は この 音の 奥に 眠る。'] },
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
  // NOTE (9-6-P): a chest sealed by `allSwitchesOn` is a LOGICAL seal (player.js:847
  // blocks OPENING until every button is pressed), NOT a physical one — the chest stays
  // walkable so the player can open it after solving, exactly like a killAll chest in the
  // open. So there is deliberately no "boxed-by-wall" guard here; the puzzle's teeth are
  // the two-stone routing (crossing lanes), verified end-to-end in snow-stone-gate.spec.js.
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

for (const k of SZONE) if (!field[k]) throw new Error(`missing S-zone stage ${k}`);
for (const k of Object.keys(SCREENS)) {
  if (!SZONE.has(k)) throw new Error(`bad spec key ${k} (not in S-zone set)`);
  if (PRESERVED.has(k)) throw new Error(`spec must NOT rebuild preserved screen ${k}`);
}
for (const k of REBUILT) if (!SCREENS[k]) throw new Error(`S-zone screen ${k} has no spec (would stay 塗り絵)`);

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

// ── guard: preserved screen untouched ─────────────────────────────────────────
if (!field['13,5'].mapEnters || !Object.values(field['13,5'].mapEnters).some((v) => v.destId === 'dungeon_5'))
  throw new Error(`preserved screen 13,5 lost its D5 mapEnter`);

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

// ── guard: NO arrival-wall hole sourced from any rebuilt S screen ─────────────
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
    throw new Error(`S sources ${holes.length} arrival-wall hole(s):\n  ${holes.join('\n  ')}`);
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
console.log(`\n9-6 ⑥-8 snow S: ${touched} screens rebuilt (13,5 D5 preserved)${DRY ? ' [DRY — not written]' : ''}`);
console.log('  pattern 配分:', JSON.stringify(byPat));
