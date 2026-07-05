// Phase 9-6 設計④: field "game-as-a-game" invariants, as machine-checkable
// metrics. This is the single source of truth for the four invariants the 9-6
// rework must satisfy (see FIELD-9-6-DESIGN.md §7):
//
//   1. 接続不変 (connectivity)   → honest seam bugs / W1 / W2 = 0
//   2. 2軸以上 (two-axis)        → every playable screen carries ≥2 of the five
//                                  axes 導線/障害/秘密/戦闘/ランドマーク
//   3. レイアウト重複0 (dup)      → no two screens in a region share an identical
//                                  tile layout (塗り絵 copy-paste guard)
//   4. 予告編実在 (foreshadow)    → the 6 preview screens (弓/爆弾/かがり火/笛/石押し/
//                                  はしご) each exist ahead of their dungeon
//
// Rules here INFER axes from tile/data composition (no per-screen metadata to
// author — data can't lie). The connectivity numbers reuse connectivity.mjs so
// there is one BFS, one BLOCKED rule. check-field-connectivity.mjs and the
// field-invariants spec both import from here.
import { bfsLayer, findOrphanRooms, findEntrances, isHardBlocked } from './connectivity.mjs';

// ── Screen-axis inference ────────────────────────────────────────────────────
// The five axes from FIELD-9-6-DESIGN.md §2-1 ("128画面すべてが意味を持つ" 分解).
// Inference is deliberately CONSERVATIVE: a screen only earns an axis when a
// concrete tile/data feature proves it. False negatives (under-counting) are
// safe — they show up as "work still to do", which is the point of 設計④.

const ENEMY_TILES = new Set(['E', 'C', 'F', 'V', 'W', 'X', 'Z',
  'G', 'N', 'J', 'A', 'L', 'O', 'U', 'I']); // patrol/chaser..bosses
const ELITE_TILES = new Set(['F', 'V', 'W', 'X', 'Z',
  'G', 'N', 'J', 'A', 'L', 'O', 'U', 'I']); // sentry + all named/mid/bosses
// Secret-bearing tiles: cuttable bush / breakable wall / pushable stone / a
// star-fragment sitting in the open behind one of them.
const SECRET_TILES = new Set(['u', '!', '*', 'Q']);
// Solvable道具ゲート + pit + bridge: a traversal challenge (障害と解法).
const GATE_TILES = new Set(['!', 'T', '(', ')', 'D', 'x', 'v']);
// Explicit landmark markers: altar / stone-floor plaza / buildings. Bare '#'
// (generic wall) is deliberately NOT here — a wall is just an obstacle border,
// not a memorable place. Ruins register as landmarks via their 'o' stone floor.
const LANDMARK_TILES = new Set(['^', 'o', 'h', 'p']);

/** Count edge cells that are steppable-off (a proxy for real branch junctions). */
function openEdgeCount(s) {
  const { rows, cols, tiles } = s;
  let open = 0;
  const walk = (r, c) => {
    const ch = tiles[r]?.[c];
    return !(ch === undefined || isHardBlocked(ch));
  };
  // top / bottom
  for (let c = 0; c < cols; c++) { if (walk(0, c)) { open++; break; } }
  for (let c = 0; c < cols; c++) { if (walk(rows - 1, c)) { open++; break; } }
  for (let r = 0; r < rows; r++) { if (walk(r, 0)) { open++; break; } }
  for (let r = 0; r < rows; r++) { if (walk(r, cols - 1)) { open++; break; } }
  return open;
}

/**
 * Infer which of the five axes a single field screen satisfies.
 * @param {object} s  a field stage {rows,cols,tiles,mapEnters,showConditions,...}
 * @returns {Set<string>} subset of {route,obstacle,secret,combat,landmark}
 */
export function screenAxes(s) {
  const axes = new Set();
  const flat = s.tiles.flat();
  const has = (ch) => flat.includes(ch);
  const mapEnters = s.mapEnters || {};
  const scVals = Object.values(s.showConditions || {});

  // 導線 (route): a map entrance, OR a genuine branch — 3+ open edges AND internal
  // blocking terrain that actually shapes the path (so it forces a choice, rather
  // than being a fully-open filler screen that merely happens to be open on 3 sides).
  const INTERNAL_TERRAIN = new Set(['t', 'M', '~', 'f', 'x']);
  const hasInternalStructure = [...INTERNAL_TERRAIN].some(has);
  if (Object.keys(mapEnters).length > 0) axes.add('route');
  else if (openEdgeCount(s) >= 3 && hasInternalStructure) axes.add('route');

  // 障害と解法 (obstacle): a solvable gate / pit / bridge crossing.
  if ([...GATE_TILES].some(has)) axes.add('obstacle');

  // 秘密 (secret): a secret-bearing tile, OR a chest sealed by a non-killAll flag.
  if ([...SECRET_TILES].some(has)) axes.add('secret');
  if (scVals.some((v) => v && v.trigger && v.trigger !== 'killAll')) axes.add('secret');

  // 戦闘 (combat with meaning): enemies AND a reason to fight here —
  // a killAll-sealed reward, an elite/boss, or a chest to guard.
  const hasEnemy = [...ENEMY_TILES].some(has);
  if (hasEnemy) {
    const killAll = scVals.some((v) => v && v.trigger === 'killAll');
    const elite = [...ELITE_TILES].some(has);
    const guardsChest = has('B');
    if (killAll || elite || guardsChest) axes.add('combat');
  }

  // ランドマーク (landmark): an explicit landmark marker tile.
  if ([...LANDMARK_TILES].some(has)) axes.add('landmark');

  return axes;
}

// ── Honest connectivity metrics (reuse connectivity.mjs) ─────────────────────
// See check-field-connectivity.mjs header comment for the W1/W2/seam definitions.

/** Screens with zero walkable cells (can't stand anywhere) — intended border or waste. */
function allBlockedScreens(stages) {
  const out = new Set();
  for (const k of Object.keys(stages)) {
    const s = stages[k];
    let anyWalk = false;
    for (let r = 0; r < s.rows && !anyWalk; r++)
      for (let c = 0; c < s.cols; c++)
        if (!isHardBlocked(s.tiles[r]?.[c])) { anyWalk = true; break; }
    if (!anyWalk) out.add(k);
  }
  return out;
}

/**
 * Compute the 9-6 honest metrics for the field layer.
 * @param {object} mapData  the whole map (needs startPos + all layers)
 * @returns {{
 *   reached:Set<string>, orphans:string[], w1:string[],
 *   seams:string[], rawDeadEdges:number
 * }}
 */
export function fieldHonestMetrics(mapData) {
  const field = (mapData.layers && mapData.layers.field) || mapData.field;
  const stages = field.stages;
  const start = {
    stage: (mapData.startPos && mapData.startPos.stage) || '1,0',
    row: mapData.startPos?.row ?? 2,
    col: mapData.startPos?.col ?? 2,
  };
  const { reachedRooms, deadEdges } = bfsLayer(stages, start);
  const { orphans } = findOrphanRooms(stages, findEntrances(mapData, 'field'));
  const w1Set = allBlockedScreens(stages);
  const orphanSet = new Set(orphans);

  const seams = new Set();
  for (const e of deadEdges) {
    if (!stages[e.to]) continue;       // no stage there → world edge, not a seam bug
    if (w1Set.has(e.to)) continue;     // dest all-blocked → intended border
    if (orphanSet.has(e.to)) continue; // dest never enterable → W2 class
    seams.add(`${e.from} -> ${e.to}`);
  }
  return {
    reached: reachedRooms,
    orphans: [...orphanSet].sort(),
    w1: [...w1Set].sort(),
    seams: [...seams].sort(),
    rawDeadEdges: deadEdges.length,
  };
}

/**
 * List reachable playable screens that carry fewer than 2 axes (素通り画面).
 * @param {object} mapData
 * @param {{allowlist?:Set<string>|string[]}} [opts]  screen keys to skip (e.g.
 *   the start village / tower approach — documented exemptions).
 * @returns {Array<{key:string, axes:string[]}>}
 */
export function underTwoAxisScreens(mapData, opts = {}) {
  const field = (mapData.layers && mapData.layers.field) || mapData.field;
  const stages = field.stages;
  const allow = new Set(opts.allowlist || []);
  const { reached } = fieldHonestMetrics(mapData);
  const out = [];
  for (const k of reached) {
    if (allow.has(k)) continue;
    const axes = screenAxes(stages[k]);
    if (axes.size < 2) out.push({ key: k, axes: [...axes] });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

// ── Layout-duplication guard (塗り絵 copy-paste detection) ────────────────────
/**
 * Find groups of screens that share an IDENTICAL tile layout (ignoring bgTiles
 * skin — the point is that the interactive structure is a copy).
 *
 * ⚠️ Uniform screens (all-water / all-mountain / all-wall border) ARE counted as
 * dups. Under 9-6's B方針 (全320画面を実プレイ可能に), an all-water screen is NOT a
 * "legitimate border" — it is 塗り絵 to be reworked, exactly like any other copy.
 * The measurement must reflect the goal state (every screen playable), so a
 * carve-out that assumes "border water is fine" would smuggle the rejected
 * "outer ring = border OK" premise back in. These uniform screens also show up in
 * W1; being counted by two invariants is fine — each drives to 0 independently.
 * @param {object} mapData
 * @returns {Array<string[]>} groups (each an array of ≥2 screen keys) that dup.
 */
export function duplicateLayoutGroups(mapData) {
  const field = (mapData.layers && mapData.layers.field) || mapData.field;
  const stages = field.stages;
  const byHash = new Map();
  for (const k of Object.keys(stages)) {
    const s = stages[k];
    const hash = s.tiles.map((row) => row.join('')).join('|');
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(k);
  }
  return [...byHash.values()].filter((g) => g.length >= 2).map((g) => g.sort());
}
