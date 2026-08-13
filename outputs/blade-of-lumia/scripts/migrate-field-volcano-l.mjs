#!/usr/bin/env node
/**
 * migrate-field-volcano-l.mjs  (Phase 9-6 ⑥-9 — 9th region, 火山 L)
 *
 * Rebuilds the 7 塗り絵 volcano (L-zone) screens in the NE-central highland — the
 * fire-mountain whose caldera crowns the map and whose slopes hold the D4 fire-temple.
 * One PRESERVED screen (designed content, NOT rebuilt):
 *   - 12,2 : the D4 fire-temple entrance (mapEnters dungeon_4, a hand-built 石押し room).
 *            Its ring openings are top/bot cols5,6 · left rows4,5 · right rows4,5,6,7;
 *            neighbours mirror those exactly (a rebuilt L never forces its wall).
 *
 * The FACE of the volcano is 溶岩足場 (§4-2/§4-3 "L 火山" = `l`溶岩を`v`橋足場で渡る分岐 +
 * `!`爆破壁): lava channels crossed by `v` bridges that fork the descent, plus the region's
 * showcase 弓ゲート (a sight-line read across a lava moat). Mix P1×2 / P2×3 / P3×1 / P4×1 (7).
 *
 * 🔴 LAVA is a REAL new tile ('l', added 2026-07-15 after the user caught '~' rendering as
 * blue WATER everywhere — the old design's "'~'を溶岩スキン扱い" was never true in the
 * renderer). TILE.LAVA behaves IDENTICALLY to WATER in every gameplay respect (impassable on
 * foot · flyable-over · ladder-crossable · projectiles fly over it) and differs ONLY in
 * rendering (water sprite shape + red/orange 'lava' palette). So the connectivity rule below
 * is unchanged: isHardBlocked('l') === true (connectivity.mjs), same as '~'.
 *
 * ── 🔑 Connectivity invariant — grassland's FLOOR-default mirror-AND (§14-3/§16-1/§17-1) ──
 * Volcano is a FLOOR-default region: EVERY L screen's bgTile is 'c' (ash), the interior is
 * default floor carved by `#`/`M`, and `~` (lava, same tile skin as water) appears only as
 * LOCAL pools/channels — NOT a water-default interior. This is the same class as
 * grassland/mountain-M/snow-S (NOT the lake's water-default hybrid §15). The lava's *look*
 * is not the connectivity class — the interior default (floor) is. So L reuses the proven
 * rule from snow-S / mountain-M verbatim:
 *   A ring cell is FLOOR iff EVERY on-map crossing faces an OPEN neighbour; else 'M'.
 *   EDGE cells (one crossing) mirror; CORNER cells (two crossings) open only if BOTH
 *   face open → a rebuilt screen is NEVER the source of an arrival-wall hole.
 * Neighbours: rebuilt L → in-progress ring; everything else (grassland G open to W/S, the
 * finished outer mountains ^ to N/E, the preserved D4 entrance, the finished snow S to SE)
 * → their fixed tiles. Content lives in the interior (rows2-7 × cols2-9); row1/row8/col1/
 * col10 stay a floor moat so open ring cells reconnect regardless of interior lava/bridges.
 *
 * ── Tool-timing (§8-1, STRICT) ──────────────────────────────────────────────────
 * 攻略 order D1→D2→D3→D4→D6→D5→D8→D7. Volcano is the D4 region, reached AFTER D3 →
 * owned = {sword, shield, boomerang, bow}. NOT owned: candle (D4's OWN reward), bomb (D6),
 * ladder (D5), flute (D8). So:
 *   - TRY-NOW previews (openable with what you already hold):
 *       • 弓ゲート (Y struck by an arrow across a lava moat) @ 12,1 — bow owned since D3.
 *         A single sight-line lane over the lava makes the shot a read, not a point-blank
 *         tap (9-6-P). Previews D3's arrow gates you have just graduated from.
 *       • ブーメラン隙間越し回収 (R big-rupee on a lava islet) @ 12,3 — boomerang owned
 *         since D2. Thrown over the lava (projectiles fly over `~`), grabbed by the return.
 *   - COME-BACK-LATER (NOT a preview — the tool is a LATER reward, §8-1, like G-C's かがり火):
 *       • かがり火 @ 11,2 : candle = D4's OWN reward → an H beacon whose torchesLit seal
 *         opens a 'B' offering only AFTER clearing D4. A near-reward you return to light.
 *       • !爆破壁 @ 12,3 : bomb = D6 reward → a breakable wall near-cut, opened on return.
 *   - Sword-cut 'u' bush secrets are try-now (sword owned from the start).
 *
 * bgTiles ('c' ash) untouched — `~` lava / `M`/`#` walls / features render over it.
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
const WALL = 'M';  // cliff/crag (hard-blocked → route axis via internal terrain)

// 8 L screens. PRESERVED (existing designed content, NOT rebuilt):
//   - 12,2 : D4 fire-temple entrance (mapEnters dungeon_4 + hand-built 石押し room).
const PRESERVED = new Set(['12,2']);
const LZONE = new Set([
  '12,0',
  '11,1', '12,1', '13,1',
  '11,2', '12,2', '13,2',
  '12,3',
]);
const REBUILT = new Set([...LZONE].filter((k) => !PRESERVED.has(k)));

// ── per-screen specs (7 screens) ──────────────────────────────────────────────
// `place`: interior feature tiles [r,c,ch] (rows2-7 × cols2-9 — never on the moat).
// The RING is auto-computed by the mirror; the FLOOR interior + moat connect it.
const S = (pattern, place = [], data = null) => ({ pattern, place, data });
const rupee = (v) => ({ type: 'rupee', value: v, name: `ルピー×${v}` });
const heal = () => ({ type: 'item', item: 'healPotion', name: '回復薬（小）' });

const SCREENS = {
  // ══ Row 0 — the summit caldera (top = map edge = the mountain's peak) ══════════
  '12,0': S('P4', [
    // 火口 landmark (§4-3 L = 火口 `l`(溶岩)+`M` + ランドマーク): a lava lake pooled in the
    // caldera, spilling over a black obsidian 'o' shelf with a 石碑; crags ring the rim.
    // Distinct broken footprint (no dup with any cairn). Bush secret tucked in a crag.
    [3, 5, 'l'], [3, 6, 'l'], [4, 5, 'l'], [4, 6, 'l'], [2, 6, 'l'],
    [5, 5, 'o'], [5, 6, 'o'], [5, 7, 'o'], [6, 6, 'i'],
    [3, 4, 'M'], [4, 8, 'M'], [6, 3, 'M'], [7, 8, 'u'], [2, 3, 'M'],
  ], {
    sign: { pos: '6,6', name: '火口の 石碑', lines: ['山は 眠らぬ。ただ 息を 潜めておるのみ。', '炎の 神殿は この 熱の 底で 目を 覚ます。'] },
  }),

  // ══ Row 1 — the upper slope: forks, the 弓ゲート, and the chokepoint ═══════════
  '11,1': S('P1', [
    // lava-foothold 分岐: two lava channels 'l' crossed by 'v' bridges fork the descent
    // from the caldera; a charred tree marks the trailhead, a bush in the ash pocket.
    [3, 5, 'l'], [4, 5, 'l'], [4, 4, 'v'], [5, 7, 'l'], [5, 8, 'l'], [6, 7, 'v'],
    [3, 7, 't'], [2, 4, 'M'], [6, 4, 'M'], [7, 6, 'u'],
  ]),
  '12,1': S('P2', [
    // 弓ゲート TRY-NOW (bow owned since D3, §8-1) — 9-6-P sight-line read, not a tap:
    // the switch 'Y' at 5,4 sits on a spit walled by crags (5,3 / 4,4 / 6,4) with a lava
    // moat 'l' at 5,5-5,6 to its east, so the sword can NEVER reach it. The ONLY way is to
    // STAND east of the moat (5,7/5,8) facing LEFT and fire an arrow WEST along row5 — the
    // arrow flying OVER the lava to strike Y (a sight-line read). Hitting Y opens the linked
    // 'T' gate at 4,7 — the sole entrance to a rupee boxed at 3,7 (M on its other 3 sides).
    // Previews D3's arrow gates. The dead-gate guard confirms 3,7 is UNREACHABLE with 4,7
    // closed. A 'v' bridge (6,7) over a spur pool completes the lava-foothold face.
    [5, 4, 'Y'], [5, 5, 'l'], [5, 6, 'l'], [5, 3, 'M'], [4, 4, 'M'], [6, 4, 'M'],
    [4, 7, 'T'], [3, 7, 'B'], [3, 6, 'M'], [3, 8, 'M'], [2, 7, 'M'],
    [6, 6, 'l'], [6, 7, 'v'], [2, 3, 'i'],
  ], {
    links: [{ switchId: '5,4', gateId: '4,7' }],
    chest: { pos: '3,7', content: rupee(25) },
    sign: { pos: '2,3', name: '溶岩の 射的場', lines: ['熔けた 堀の 向こうの 石突は 剣を 拒む。', '遠く より 射よ。神殿の 掟の 予行なり。'] },
  }),
  '13,1': S('P3', [
    // chokepoint gauntlet (N/E border the outer mountains ^): an elite 'F' + two chasers
    // 'C' hold a killAll chest at a lava pinch where crags squeeze the slope to one lane.
    [2, 5, 'M'], [2, 6, 'M'], [6, 5, 'M'], [6, 6, 'M'], [4, 4, 'l'], [4, 5, 'v'],
    [3, 5, 'F'], [5, 5, 'C'], [5, 6, 'C'], [4, 6, 'B'],
  ], {
    chest: { pos: '4,6', content: heal() },
    show: { pos: '4,6', cond: { trigger: 'killAll', message: '⚔ 火口を 守る 精鋭を 退けた！宝箱が現れた！' } },
  }),

  // ══ Row 2 — the mid slope (W/S = grassland G, open); D4 entrance 12,2 preserved ══
  '11,2': S('P2', [
    // かがり火 COME-BACK (candle = D4's OWN reward → NOT a preview, §8-1, like G-C's 10,2):
    // a lone beacon 'H' at 4,5; lighting it (torchesLit) reveals a sealed 'B' offering at
    // 4,7 — openable ONLY after clearing D4 and returning with the candle. W/S face open
    // grassland. A bush secret is reachable today (sword). Charred trees frame the shrine.
    [4, 5, 'H'], [4, 7, 'B'], [3, 7, 'M'], [5, 7, 'M'], [4, 8, 'M'],
    [2, 4, 't'], [6, 6, 'u'], [6, 3, 't'], [2, 8, 'i'],
  ], {
    show: { pos: '4,7', cond: { trigger: 'torchesLit', message: '🔥 かがり火が 応え、燃え残りの 封印が 崩れた！' } },
    chest: { pos: '4,7', content: rupee(20) },
    sign: { pos: '2,8', name: '消えた かがり火', lines: ['冷えた かがり火は 火種を 待つ。', '神殿の 灯を 持ち帰りし 者にのみ 応えよう。'] },
  }),
  '13,2': S('P1', [
    // lava-foothold 分岐 (E = outer mountains ^, S = snow S, both finished): a lava gorge
    // forces the path onto a 'v' bridge, then a short cliff-cut past a crag; a bush in the
    // ash. Distinct layout (bridges laid differently than 11,1).
    [3, 4, 'l'], [4, 4, 'l'], [4, 5, 'v'], [5, 7, 'l'], [5, 6, 'v'], [6, 7, 'l'],
    [2, 5, 'M'], [6, 4, 'M'], [3, 8, 't'], [7, 5, 'u'],
  ]),

  // ══ Row 3 — the foot of the volcano, just N of the D4 gate (12,2) ══════════════
  '12,3': S('P2', [
    // ブーメラン隙間越し回収 TRY-NOW (boomerang owned since D2, §8-1): a big rupee 'R' sits
    // on a lava islet at 4,7, ringed by lava 'l' (4,6 / 3,7 / 5,7 / 4,8) so it can't be
    // walked to — STAND on the ash at 4,5 facing RIGHT and throw; the boomerang flies over
    // the lava (projectiles pass 'l', same as '~') and the return grabs the rupee. !爆破壁
    // COME-BACK (bomb = D6 reward): a breakable '!' wall at 6,4 fronting a niche chest 'B' at
    // 6,3 (a near-cut opened on return). Sign hints the islet. Up = the D4 gate.
    [4, 7, 'R'], [4, 6, 'l'], [3, 7, 'l'], [5, 7, 'l'], [4, 8, 'l'],
    [6, 4, '!'], [6, 3, 'B'], [5, 3, 'M'], [7, 3, 'M'], [6, 2, 'M'],
    [2, 5, 'i'], [3, 4, 't'], [7, 8, 'u'],
  ], {
    breakable: ['6,4'],
    chest: { pos: '6,3', content: rupee(15) },
    sign: { pos: '2,5', name: '溶岩の 手向け', lines: ['熔けた 池に 落ちた 宝は 拾えぬ。', 'されど 投げ物は 火を 越えて 戻る。'] },
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
      const openable = ch === '*' || ch === 'u' || ch === '!';
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
  // combat/chest features must be reachable on foot ('u'/'*'/'!'/'T' pass in walkReach).
  // a 'B' behind a breakable wall '!' (bomb come-back) is exempt (walkReach passes '!'
  // so it stays reachable in the model — the come-back gate is the bomb, not geometry).
  for (const [r, c, ch] of spec.place) {
    if (!'ECFB'.includes(ch)) continue;
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
  // ISLET guard (9-6-P boomerang grab): an 'R' floor-item ringed by lava must be
  // UNREACHABLE on foot — else the boomerang-throw is pointless (you could just walk).
  for (const [r, c, ch] of spec.place) {
    if (ch !== 'R') continue;
    if (reach.has(`${r},${c}`))
      throw new Error(`islet fail on ${key}: 'R' @ ${r},${c} is walkable (boomerang grab is pointless)`);
  }
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
      const openable = ch === '*' || ch === 'u' || ch === '!';
      if (seen.has(k) || ch === 'T' || (isHardBlocked(ch) && !openable)) continue;
      seen.add(k); q.push([nr, nc]);
    }
  }
  return seen;
}

// ── apply ─────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

for (const k of LZONE) if (!field[k]) throw new Error(`missing L-zone stage ${k}`);
for (const k of Object.keys(SCREENS)) {
  if (!LZONE.has(k)) throw new Error(`bad spec key ${k} (not in L-zone set)`);
  if (PRESERVED.has(k)) throw new Error(`spec must NOT rebuild preserved screen ${k}`);
}
for (const k of REBUILT) if (!SCREENS[k]) throw new Error(`L-zone screen ${k} has no spec (would stay 塗り絵)`);

const rings = computeAllRings(field);

// ── inspection: --rings prints the computed ring + floor interior (no features).
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
  // breakableWalls is an OBJECT keyed by "r,c" (engine: sd.breakableWalls?.[pk]?.breakDef ?? 1).
  stage.breakableWalls = {};
  for (const pk of spec.data?.breakable || []) stage.breakableWalls[pk] = { breakDef: 1 };

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
if (!field['12,2'].mapEnters || !Object.values(field['12,2'].mapEnters).some((v) => v.destId === 'dungeon_4'))
  throw new Error(`preserved screen 12,2 lost its D4 mapEnter`);

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

// ── guard: every breakableWalls entry must sit on a '!' tile ──────────────────
for (const key of Object.keys(SCREENS)) {
  const stage = field[key];
  for (const pk of Object.keys(stage.breakableWalls || {})) {
    const [r, c] = pk.split(',').map(Number);
    if (stage.tiles[r][c] !== '!')
      throw new Error(`breakableWalls on ${key} @ ${pk} not a '!' (=${stage.tiles[r][c]})`);
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

// ── guard: NO arrival-wall hole sourced from any rebuilt L screen ─────────────
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
    throw new Error(`L sources ${holes.length} arrival-wall hole(s):\n  ${holes.join('\n  ')}`);
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
console.log(`\n9-6 ⑥-9 volcano L: ${touched} screens rebuilt (12,2 D4 preserved)${DRY ? ' [DRY — not written]' : ''}`);
console.log('  pattern 配分:', JSON.stringify(byPat));
