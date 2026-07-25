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
import { bfsLayer, findOrphanRooms, findEntrances, isHardBlocked, cellTile } from './connectivity.mjs';

// ── Region label map (叩き台 ZONE_MAP from analyze-zone-rebalance.mjs) ────────
// Rows = sy (0=north), cols = sx (0=west). Key format: "sx,sy" = stageKey.
// Note: ZONE_MAP[row][col] → stageKey "col,row".
// Outer ^/~ cells are reassigned to adjacent theme regions below (draft ZONE).
// Specials (T/K/V) kept as-is.
const _ZONE_RAW = [
  ['^','^','^','^','^','^','T','K','K','^','^','^','L','^','^','^'],
  ['^','^','F','^','^','G','G','G','G','G','^','L','L','L','^','^'],
  ['^','F','F','F','G','G','G','G','G','G','G','L','L','L','^','^'],
  ['F','F','F','F','G','G','G','G','G','G','G','G','L','S','^','^'],
  ['F','F','F','F','G','G','G','G','G','G','G','G','S','S','S','^'],
  ['F','F','F','F','G','G','G','G','G','G','G','S','S','S','S','^'],
  ['F','F','F','G','G','G','G','G','G','G','S','S','S','S','~','~'],
  ['F','F','F','G','G','G','G','G','G','W','W','S','S','~','~','~'],
  ['F','F','F','G','G','G','G','G','W','W','W','W','~','~','~','~'],
  ['F','F','G','G','G','G','G','G','W','W','W','~','~','~','~','~'],
  ['G','G','G','G','G','G','G','G','W','W','W','~','~','~','~','~'],
  ['G','G','G','G','G','G','G','G','G','W','W','~','~','~','~','~'],
  ['D','G','G','G','G','G','G','G','G','G','M','M','~','~','~','~'],
  ['D','D','G','G','G','G','G','G','G','M','M','M','~','~','~','~'],
  ['D','D','D','G','G','G','G','V','G','G','M','M','~','~','~','~'],
  ['D','D','D','G','G','G','G','G','G','M','M','M','~','~','~','~'],
  ['D','D','D','D','G','G','G','M','M','M','M','~','~','~','~','~'],
  ['~','D','D','~','G','G','G','M','M','~','~','~','~','~','~','~'],
  ['~','~','~','~','~','G','G','~','~','~','~','~','~','~','~','~'],
  ['~','~','~','~','~','~','~','~','~','~','~','~','~','~','~','~'],
];
const _GW = 16, _GH = 20;
const _OUTER = new Set(['^', '~']);
const _SPECIAL = new Set(['T', 'K', 'V']);
const _DEEP = 4;

// Build draft zone (outer → nearest-land; deep-sea → 'O'; M → M/P split).
// This mirrors analyze-zone-rebalance.mjs so both are in sync.
function _buildDraftZone() {
  const dist = Array.from({ length: _GH }, () => Array(_GW).fill(Infinity));
  const lbl  = Array.from({ length: _GH }, () => Array(_GW).fill(null));
  const q = [];
  for (let y = 0; y < _GH; y++) for (let x = 0; x < _GW; x++) {
    const z = _ZONE_RAW[y][x];
    if (!_OUTER.has(z) && !_SPECIAL.has(z)) { dist[y][x] = 0; lbl[y][x] = z; q.push([x,y]); }
  }
  let head = 0;
  while (head < q.length) {
    const [x, y] = q[head++];
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx, ny=y+dy;
      if (nx<0||nx>=_GW||ny<0||ny>=_GH) continue;
      if (dist[ny][nx] > dist[y][x]+1) { dist[ny][nx]=dist[y][x]+1; lbl[ny][nx]=lbl[y][x]; q.push([nx,ny]); }
    }
  }
  const draft = _ZONE_RAW.map(r => r.slice());
  for (let y=0;y<_GH;y++) for (let x=0;x<_GW;x++) {
    const z = _ZONE_RAW[y][x];
    if (_SPECIAL.has(z)) continue;
    if (!_OUTER.has(z)) continue;
    draft[y][x] = (z==='~' && dist[y][x]>=_DEEP) ? 'O' : lbl[y][x];
  }
  // M → M(north)/P(south) split using the same dual-BFS from analyze-zone-rebalance.
  const mCells = [];
  for (let y=0;y<_GH;y++) for (let x=0;x<_GW;x++) if (draft[y][x]==='M') mCells.push([x,y]);
  const inM = new Set(mCells.map(([x,y])=>`${x},${y}`));
  const mtnSeed = mCells.slice().sort((a,b)=>a[1]-b[1]||a[0]-b[0])[0];
  const swampSeeds = [[10,14],[9,15]].filter(([x,y])=>inM.has(`${x},${y}`));
  const owner = {};
  const qM = [`${mtnSeed[0]},${mtnSeed[1]}`];
  const qP = swampSeeds.map(([x,y])=>`${x},${y}`);
  owner[qM[0]]='M'; for (const k of qP) owner[k]='P';
  const refM={h:0}, refP={h:0};
  const grow=(gq,ref,tag)=>{
    while(ref.h<gq.length){
      const[x,y]=gq[ref.h].split(',').map(Number);
      for(const[dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){
        const k=`${x+dx},${y+dy}`;
        if(inM.has(k)&&owner[k]===undefined){owner[k]=tag;gq.push(k);return true;}
      }
      ref.h++;
    }
    return false;
  };
  let cntM=1, cntP=qP.length, liveM=true, liveP=true;
  while((liveM||liveP)&&(cntM+cntP)<mCells.length){
    if(cntP<=cntM&&liveP){liveP=grow(qP,refP,'P');if(liveP)cntP++;}
    else if(liveM){liveM=grow(qM,refM,'M');if(liveM)cntM++;}
    else if(liveP){liveP=grow(qP,refP,'P');if(liveP)cntP++;}
  }
  for(const[x,y] of mCells) draft[y][x]=owner[`${x},${y}`]||'M';
  // Grassland G (121 screens) is too large to manage as one region. Split it
  // into sub-regions by "which theme region this corridor leads to" — grassland
  // is the connective road (IDEA:163), so nearest-theme labels give each slice a
  // narrative/skin identity. See FIELD-BASELINE-BRAINSTORM.md「草原Gのサブ地域分割」.
  // 8 sub-regions: G0 村ハブ / G1 北森辺 / G2 南森辺 / G3 砂漠回廊 / G4 湖回廊 /
  //                G5 北の登り(黒城・空島) / G6 北東の登り(雪・火山) / G7 南(沼・山地)
  const _THEME_TO_GSUB = { V:'G0', F:null, D:'G3', W:'G4', K:'G5', T:'G5', S:'G6', L:'G6', P:'G7', M:'G7', O:'G4' };
  const gCells = [];
  for (let y=0;y<_GH;y++) for (let x=0;x<_GW;x++) if (draft[y][x]==='G') gCells.push([x,y]);
  // multi-source BFS from every non-G cell → nearest theme label per G cell.
  const gDist = Array.from({ length: _GH }, () => Array(_GW).fill(Infinity));
  const gLbl  = Array.from({ length: _GH }, () => Array(_GW).fill(null));
  const gq = [];
  for (let y=0;y<_GH;y++) for (let x=0;x<_GW;x++) if (draft[y][x]!=='G') { gDist[y][x]=0; gLbl[y][x]=draft[y][x]; gq.push([x,y]); }
  let gh = 0;
  while (gh < gq.length) {
    const [x,y] = gq[gh++];
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx, ny=y+dy;
      if (nx<0||nx>=_GW||ny<0||ny>=_GH) continue;
      if (gDist[ny][nx] > gDist[y][x]+1) { gDist[ny][nx]=gDist[y][x]+1; gLbl[ny][nx]=gLbl[y][x]; gq.push([nx,ny]); }
    }
  }
  for (const [x,y] of gCells) {
    const theme = gLbl[y][x];
    let sub;
    if (theme === 'F') sub = y<=6 ? 'G1' : 'G2'; // forest corridor: split north/south
    else sub = _THEME_TO_GSUB[theme] ?? 'G0';    // fallback → village hub
    draft[y][x] = sub;
  }
  return draft;
}
const _DRAFT_ZONE = _buildDraftZone();

/** Return the draft region label for a field stageKey "col,row". */
export function regionOf(stageKey) {
  const [sx, sy] = stageKey.split(',').map(Number);
  if (sy<0||sy>=_GH||sx<0||sx>=_GW) return '?';
  return _DRAFT_ZONE[sy][sx];
}

// ── Region → expected player power at arrival (§8-1 progression table) ────────
// Items accumulated in dungeon order D1→D2→D3→D4→D6→D5→D8→D7.
// Power score = sword_tier + (has_shield?1:0) + tool_count.
// Regions are ordered by when the player first reaches them.
const _REGION_POWER = {
  // Village hub + near regions (D1 done, {sword1,shield})
  // Grassland sub-regions G0..G7 all sit in the early-game power band like G.
  'G': 2, 'G0': 2, 'G1': 2, 'G2': 2, 'G3': 2, 'G4': 2, 'G5': 2, 'G6': 2, 'G7': 2,
  'D': 2, 'M': 2, 'P': 2,
  // After D2 boomerang  (+1 tool)
  'W': 4,
  // After D3 bow (+1 tool) — forests F surround D6
  'F': 5, 'L': 5,
  // After D4 candle (+1 tool) — snow S is D5 approach
  'S': 6,
  // After D6 bomb (+1 tool) — deep-ocean O reached mid-game
  'O': 7,
  // After D5 ladder (+1 tool)
  // After D8 flute (+1 tool) — late specials
  'T': 8, 'K': 8, 'V': 8,
};

function expectedPower(region) {
  return _REGION_POWER[region] ?? 3; // default mid-game if unknown
}

// ── Enemy threat score (per tile character on the field) ──────────────────────
// threat(tile) = hp * atk / max(1, def)
// Values sourced from shared/enemies.js.
const _THREAT = {
  'E': 3  * 1 / 1,   // PATROL  hp3 atk1 def0
  'C': 5  * 2 / 1,   // CHASER  hp5 atk2 def0
  'F': 6  * 2 / 2,   // SENTRY  hp6 atk2 def1
  'V': 20 * 4 / 3,   // BOSS(魔将) hp20 atk4 def2
  'W': 12 * 3 / 2,   // MONSTER hp12 atk3 def1
  'X': 50 * 6 / 4,   // DARK_LORD hp50 atk6 def3
  'Z': 80 * 8 / 5,   // ZARNEL   hp80 atk8 def4
  'G': 30 * 4 / 3,   // ROCK_GOLEM
  'N': 32 * 5 / 2,   // SAND_SCORPION
  'J': 38 * 4 / 4,   // SEA_SERPENT
  'A': 35 * 5 / 3,   // FIRE_SALAMANDER
  'L': 40 * 4 / 4,   // ICE_LEVIATHAN
  'O': 42 * 5 / 3,   // FOREST_GIANT
  'U': 36 * 6 / 2,   // STORM_EAGLE
  'I': 40 * 5 / 3,   // SWAMP_TOAD
};

// Hazard tiles on field (lava/pit/water-ford obstacles that threaten the player).
const _HAZARD_TILES = new Set(['l', 'x', '~']);

/**
 * The stage's tiles as a flat array, but with each bgTiles-water cell folded to
 * '~' (Phase 9-6 深洋O: water can live on the bgTiles underlay). This keeps the
 * quality metrics (hazard count, route-terrain, similarity) seeing water the same
 * whether it sits on the tiles layer or the bgTiles layer — so migrating water
 * from tiles '~' to bgTiles '~' leaves every metric unchanged (Step C 自己検証の前提).
 */
function effectiveFlat(s) {
  const bg = s.bgTiles;
  if (!bg) return s.tiles.flat();
  const out = [];
  for (let r = 0; r < s.tiles.length; r++) {
    const row = s.tiles[r];
    for (let c = 0; c < row.length; c++) {
      out.push(bg[`${r},${c}`] === '~' ? '~' : row[c]);
    }
  }
  return out;
}

/** Compute battle difficulty score for a single screen.
 *  score = (enemyThreat + hazardScore) / expectedPower(region)
 */
export function battleScore(stage, region) {
  const flat = effectiveFlat(stage);
  let threat = 0;
  const enemyCounts = {};
  for (const ch of flat) {
    if (_THREAT[ch] !== undefined) {
      threat += _THREAT[ch];
      enemyCounts[ch] = (enemyCounts[ch] || 0) + 1;
    }
  }
  // Number-of-enemies multiplier: 1 enemy = ×1, 2 = ×1.3, 3+ = ×1.6
  const count = Object.values(enemyCounts).reduce((a,b)=>a+b, 0);
  const mult = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 1.3 : 1.6;
  threat *= mult;
  // Hazard score: each hazard tile adds a small amount
  const hazard = flat.filter(ch => _HAZARD_TILES.has(ch)).length * 0.5;
  const power = Math.max(1, expectedPower(region));
  return (threat + hazard) / power;
}

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
  const { rows, cols } = s;
  let open = 0;
  const walk = (r, c) => {
    const ch = cellTile(s, r, c);  // folds bgTiles water → '~' (blocked edge)
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
  const flat = effectiveFlat(s);
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
        // cellTile folds bgTiles water underlay into '~' so an all-water screen
        // (water on the bgTiles layer, floor on tiles) still counts as W1, matching
        // the engine (isWaterAt) rather than seeing a walkable floor.
        if (!isHardBlocked(cellTile(s, r, c))) { anyWalk = true; break; }
    if (!anyWalk) out.add(k);
  }
  return out;
}

/**
 * Compute the 9-6 honest metrics for the field layer.
 * @param {object} mapData  the whole map (needs startPos + all layers)
 * @returns {{
 *   reached:Set<string>, orphans:string[], w1:string[],
 *   seams:string[], traps:string[], rawDeadEdges:number
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
  // TRAP edges (user principle 1: "入った後に動けなくなるステージを作ってはならない").
  // A trap = you step off an open edge of a REACHED screen and the engine scrolls
  // you into an EXISTING destination stage (checkStageTransition moves whenever a
  // stage exists there) but the arrival cell is hard-blocked → you clamp/stick,
  // and if that dest is all-blocked (W1) you can never leave = soft-lock. Unlike
  // `seams`, this does NOT exempt W1/orphan destinations — landing in one is the
  // very bug. It only requires the SOURCE be reached (an actually-walkable screen
  // the player can get to) so it flags real, reachable soft-locks.
  const traps = new Set();
  for (const e of deadEdges) {
    if (!stages[e.to]) continue;          // no dest stage → engine clamps in place, safe
    if (!reachedRooms.has(e.from)) continue; // source unreachable → not a live trap
    if (e.reason === 'arrival-wall') traps.add(`${e.from} -> ${e.to}`);
  }
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
    traps: [...traps].sort(),
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
    // Hash the EFFECTIVE tiles (bgTiles water folded into '~') so a screen keeps the
    // same fingerprint whether its water sits on the tiles or bgTiles layer — the
    // tiles '~' → bgTiles '~' migration must not change dup grouping (Step C 自己検証).
    const bg = s.bgTiles;
    const hash = s.tiles
      .map((row, r) => row.map((ch, c) => (bg?.[`${r},${c}`] === '~' ? '~' : ch)).join(''))
      .join('|');
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(k);
  }
  return [...byHash.values()].filter((g) => g.length >= 2).map((g) => g.sort());
}

// ── Warp / MAP_ENTER landing guard (ワープ着地の詰み検出・⑥-warp) ──────────────
/**
 * Verify every TELEPORT LANDING is a cell the player can stand on. This is the
 * blind spot behind the ⑥-warp bug (and 9-2T's "tower warp source vanished"):
 * bfsLayer only follows edge-scrolls, and `traps` only inspects edge crossings —
 * NEITHER models where a teleport actually DROPS the player. game.js enterStage()
 * places the player at the exact (row,col) with NO wall-clamping, so a landing on
 * a hard-blocked tile ('M' / '#' / '~' / 'l' ...) is an unrecoverable soft-lock:
 * you spawn embedded in a wall and can't move (unless you arrive flying — which
 * only happens for SKY/WATER/LAVA landings, handled below).
 *
 * Two teleport kinds are checked:
 *   1. `stageData.fluteEffect` of type 'warp' — direct {layer,stage,row,col} or
 *      {destId} → exitRegistry (mirrors game.js playFlute()).
 *   2. `stageData.mapEnters[cell].destId` — the '>' teleport / door / stair /
 *      flight-warp, landing on the (row,col) of the MAP_ENTER whose `id` matches
 *      destId (mirrors game.js buildExitRegistry() + enterStage()).
 *
 * A landing is BAD when it is unresolved (destId points nowhere) OR the arrival
 * tile is hard-blocked AND not a flight/ladder tile (SKY/WATER/LAVA landings are
 * survivable because the arriving actor keeps flying — see enterStage:365-368).
 *
 * @param {object} mapData  the whole map (all layers + startPos)
 * @returns {Array<{kind:'flute'|'mapEnter', from:string, at:string,
 *   dest:string|null, tile:string|null, reason:'unresolved'|'arrival-wall'}>}
 *   Empty = every teleport lands somewhere standable.
 */
export function warpEnterLandings(mapData) {
  const layers = mapData.layers || {};
  // id -> {layer,stage,row,col} (mirrors game.js buildExitRegistry).
  const registry = {};
  for (const lk of Object.keys(layers))
    for (const [sk, sd] of Object.entries(layers[lk].stages || {}))
      for (const [pk, e] of Object.entries(sd.mapEnters || {}))
        if (e.id) {
          const [row, col] = pk.split(',').map(Number);
          registry[e.id] = { layer: lk, stage: sk, row, col };
        }

  // A landing survives on a flight/ladder tile: the actor keeps flying (SKY on
  // the sky-island / WATER / LAVA) rather than embedding in a solid wall.
  const FLIGHT_LAND = new Set(['%', '~', 'l']);
  const tileAt = (d) => {
    const st = d && layers[d.layer]?.stages?.[d.stage];
    if (!st) return undefined;
    // Fold bgTiles water underlay into '~' so a landing on a bgTiles-water cell is
    // treated as a flight/ladder landing (survivable), matching isWaterAt.
    return cellTile(st, d.row, d.col);
  };

  const bad = [];
  const check = (kind, from, at, dest) => {
    if (!dest || !layers[dest.layer]?.stages?.[dest.stage]) {
      bad.push({ kind, from, at, dest: null, tile: null, reason: 'unresolved' });
      return;
    }
    const tile = tileAt(dest);
    if (isHardBlocked(tile) && !FLIGHT_LAND.has(tile)) {
      bad.push({
        kind, from, at,
        dest: `${dest.layer}/${dest.stage}(${dest.row},${dest.col})`,
        tile: tile ?? null, reason: 'arrival-wall',
      });
    }
  };

  for (const lk of Object.keys(layers))
    for (const [sk, sd] of Object.entries(layers[lk].stages || {})) {
      const from = `${lk}/${sk}`;
      const fx = sd.fluteEffect;
      if (fx && fx.type === 'warp') {
        let dest = null;
        if (fx.layer && fx.stage) {
          dest = { layer: fx.layer, stage: fx.stage, row: fx.row ?? 5, col: fx.col ?? 5 };
        } else if (fx.destId) {
          dest = registry[fx.destId] || null;
        }
        check('flute', from, 'fluteEffect', dest);
      }
      for (const [pk, e] of Object.entries(sd.mapEnters || {}))
        if (e.destId) check('mapEnter', from, pk, registry[e.destId] || null);
    }
  return bad;
}

// ── 3 new quality checks (Phase 9-6-BASE implementation) ─────────────────────

// Tiles that represent a "puzzle / obstacle" element (B-axis, environment puzzle).
const _PUZZLE_TILES = new Set(['!', 'T', '(', ')', '*', 'v', 'x', 'H', 'Y', '[', ']', 'S']);
// Tiles that represent a "showpiece combat" element (killAll gate handled separately).
const _COMBAT_SHOWPIECE = new Set(['F', 'V', 'W', 'X', 'Z', 'G', 'N', 'J', 'A', 'L', 'O', 'U', 'I']);
// Tiles that signal a "one-off" unique element (C-axis).
const _UNIQUE_TILES = new Set(['^', 'o', 'h', 'p', 'i']);
// Tiles that are a "story anchor" (A-axis).
const _ANCHOR_TILES = new Set(['^', 'o', 'p', 'i']);

function _classifyScreen(s) {
  const flat = s.tiles.flat();
  const has = (ch) => flat.includes(ch);
  const scVals = Object.values(s.showConditions || {});
  const killAll = scVals.some(v => v && v.trigger === 'killAll');
  const hasEnemy = [...ENEMY_TILES].some(has);
  return {
    puzzle:   [..._PUZZLE_TILES].some(has),
    combat:   hasEnemy && (killAll || [..._COMBAT_SHOWPIECE].some(has) || has('B')),
    unique:   [..._UNIQUE_TILES].some(has),
    anchor:   [..._ANCHOR_TILES].some(has),
  };
}

/**
 * Compute density metrics per region.
 * @param {object} mapData
 * @returns {Map<string, {screens:number, puzzle:number, combat:number, unique:number, anchor:number}>}
 */
export function regionDensityMetrics(mapData) {
  const field = (mapData.layers && mapData.layers.field) || mapData.field;
  const stages = field.stages;
  const { reached } = fieldHonestMetrics(mapData);
  const byRegion = new Map();
  for (const k of reached) {
    const r = regionOf(k);
    if (!byRegion.has(r)) byRegion.set(r, { screens:0, puzzle:0, combat:0, unique:0, anchor:0 });
    const rec = byRegion.get(r);
    rec.screens++;
    const cls = _classifyScreen(stages[k]);
    if (cls.puzzle)  rec.puzzle++;
    if (cls.combat)  rec.combat++;
    if (cls.unique)  rec.unique++;
    if (cls.anchor)  rec.anchor++;
  }
  return byRegion;
}

/**
 * Compute battle-score distribution per region.
 * @param {object} mapData
 * @returns {Map<string, {scores: number[], mean: number, max: number, zeroCount: number}>}
 */
export function regionBattleScores(mapData) {
  const field = (mapData.layers && mapData.layers.field) || mapData.field;
  const stages = field.stages;
  const { reached } = fieldHonestMetrics(mapData);
  const byRegion = new Map();
  for (const k of reached) {
    const r = regionOf(k);
    if (!byRegion.has(r)) byRegion.set(r, { scores: [] });
    const score = battleScore(stages[k], r);
    byRegion.get(r).scores.push(score);
  }
  const out = new Map();
  for (const [r, {scores}] of byRegion) {
    const mean = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : 0;
    const max  = scores.length ? Math.max(...scores) : 0;
    const zeroCount = scores.filter(s=>s===0).length;
    out.set(r, { scores, mean: Math.round(mean*100)/100, max: Math.round(max*100)/100, zeroCount });
  }
  return out;
}

/**
 * Detect structurally-similar screen pairs within the same region.
 * Similarity = cosine similarity of a feature vector derived from tile-type
 * distribution + gimmick positions (relative to centre).
 * Pairs with similarity >= threshold are flagged as "diff too small".
 *
 * @param {object} mapData
 * @param {{threshold?: number}} [opts]  default threshold 0.97
 * @returns {Array<{region:string, a:string, b:string, similarity:number}>}
 */
export function structuralSimilarityWarnings(mapData, opts = {}) {
  const threshold = opts.threshold ?? 0.995;
  const field = (mapData.layers && mapData.layers.field) || mapData.field;
  const stages = field.stages;
  const { reached } = fieldHonestMetrics(mapData);

  // Feature vector: tile-type histogram (14 buckets) + 4 corner quadrant gimmick counts.
  const BUCKETS = [
    ['floor',   (ch) => ch==='.'||ch===' '||ch===undefined],
    ['wall',    (ch) => ch==='#'||ch==='M'||ch==='t'],
    ['water',   (ch) => ch==='~'||ch==='l'],
    ['enemy',   (ch) => _THREAT[ch]!==undefined],
    ['gate',    (ch) => ['T','!','D','(',')',':'].includes(ch)],
    ['secret',  (ch) => ['u','*','Q'].includes(ch)],
    ['chest',   (ch) => ch==='B'||ch==='R'||ch==='b'],
    ['pit',     (ch) => ch==='x'],
    ['bridge',  (ch) => ch==='v'],
    ['switch',  (ch) => ['S','Y','H','[',']'].includes(ch)],
    ['enter',   (ch) => ch==='>'],
    ['npc',     (ch) => ch==='n'||ch==='i'],
    ['landmark',(ch) => ['o','h','^','p'].includes(ch)],
    ['stone',   (ch) => ch==='*'],
  ];

  function featureVec(s) {
    // effectiveFlat folds bgTiles water into '~' so the water histogram bucket is
    // invariant under the tiles '~' → bgTiles '~' migration (Step C 自己検証).
    const flat = effectiveFlat(s);
    const total = flat.length || 1;
    const hist = BUCKETS.map(([,pred]) => flat.filter(pred).length / total);
    // 4-quadrant gimmick density (bgTiles water carries no gimmick, so tiles is fine here)
    const { rows, cols } = s;
    const mid_r = rows >> 1, mid_c = cols >> 1;
    const quads = [0,0,0,0];
    const GIMMICK = new Set(['!','T','*','u','Y','H','S','B','R','b','x','v','o','^']);
    for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) {
      const ch = s.tiles[r]?.[c];
      if (!GIMMICK.has(ch)) continue;
      const q = (r<mid_r?0:2)+(c<mid_c?0:1);
      quads[q]++;
    }
    const qtotal = Math.max(1, quads.reduce((a,b)=>a+b,0));
    return [...hist, ...quads.map(v=>v/qtotal)];
  }

  function cosineSim(a, b) {
    let dot=0, na=0, nb=0;
    for (let i=0; i<a.length; i++) { dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
    return (na===0||nb===0) ? 0 : dot/Math.sqrt(na*nb);
  }

  // Group by region — only screens with ≥2 axes (素通り = under-2-axis are already
  // captured by underTwoAxisScreens; single-feature screens produce noisy similarities).
  const groups = new Map();
  for (const k of reached) {
    if (screenAxes(stages[k]).size < 2) continue;
    const r = regionOf(k);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(k);
  }

  const warnings = [];
  for (const [region, keys] of groups) {
    const vecs = keys.map(k => ({ k, v: featureVec(stages[k]) }));
    for (let i=0; i<vecs.length; i++) {
      for (let j=i+1; j<vecs.length; j++) {
        const sim = cosineSim(vecs[i].v, vecs[j].v);
        if (sim >= threshold) {
          warnings.push({ region, a: vecs[i].k, b: vecs[j].k, similarity: Math.round(sim*1000)/1000 });
        }
      }
    }
  }
  return warnings.sort((a,b)=>b.similarity-a.similarity);
}
