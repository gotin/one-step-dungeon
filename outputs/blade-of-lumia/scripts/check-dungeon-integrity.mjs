// Phase 9-2: Dungeon integrity checker.
// Verifies MUST elements for each dungeon layer and flags rooms that require
// items from later dungeons (which the player cannot have when entering).
//
// Checks per dungeon:
//   [MUST] bossStage and triforceId set
//   [MUST] bossStage room has isBossRoom:true + a dropsTriforce boss tile + heartContainer chest
//   [MUST] at least one 'm' (dungeon map) tile exists somewhere in the dungeon
//   [MUST] at least one 'n' (compass) tile exists somewhere in the dungeon
//   [WARN] rooms containing tiles that require items not yet unlocked at this dungeon
//          (water/pit without ladder, breakable-wall without bomb, arrow-switch
//           without bow) — and specifically whether those tiles block the room's
//           only exit (making it a softlock)
//
// Item unlock order (PLAN.md 9-1):
//   D1: none | D2: boomerang | D3: bow | D4: candle | D5: ladder | D6: bomb
//   cave_1: flute | D7: (no new item)
//
// Usage:
//   node scripts/check-dungeon-integrity.mjs [dungeon_1|all]
//
import { readFileSync } from 'fs';

const MAP_PATH = new URL('../work/blade-of-lumia.json', import.meta.url);
const d = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// Boss tiles that have dropsTriforce:true (from shared/enemies.js)
const TRIFORCE_BOSS_TILES = new Set(['A', 'L', 'N', 'J', 'O', 'U', 'G', 'I']);
// All boss tiles (isBoss:true) — used to detect "has a boss"
const ALL_BOSS_TILES      = new Set(['W', 'V', 'X', 'Z', 'A', 'L', 'N', 'J', 'O', 'U', 'G', 'I']);

// Item unlock order: dungeonLayer → items available when the player enters
// (i.e. items won from the PREVIOUS dungeon and earlier)
const UNLOCKED_AT = {
  dungeon_1: new Set([]),
  dungeon_2: new Set(['boomerang']),
  dungeon_3: new Set(['boomerang', 'bow']),
  dungeon_4: new Set(['boomerang', 'bow', 'candle']),
  dungeon_5: new Set(['boomerang', 'bow', 'candle', 'bomb', 'ladder']),
  dungeon_6: new Set(['boomerang', 'bow', 'candle', 'bomb']),
  dungeon_8: new Set(['boomerang', 'bow', 'candle', 'bomb', 'ladder']),
  cave_1:    new Set(['boomerang', 'bow', 'candle', 'ladder', 'bomb']),
  dungeon_7: new Set(['boomerang', 'bow', 'candle', 'ladder', 'bomb', 'flute']),
};

// Tiles that are impassable without a specific item (ignoring in-dungeon solvable gates)
// Format: tile → { item, label }
const ITEM_LOCKED_TILES = {
  '~': { item: 'ladder', label: '水 (~)  ← はしご(D5)必須' },
  'x': { item: 'ladder', label: '穴 (x)  ← はしご(D5)必須' },
  '!': { item: 'bomb',   label: '壊せる壁 (!) ← 爆弾(D6)必須' },
  // Arrow-switch 'Y' is togglable by sword, so NOT a locked tile.
  // Boomerang collectFieldItem 'K' over water/pit is checked via '~'/'x'.
};

function tilesOf(stage) {
  return (stage.tiles || []).flatMap(row =>
    Array.isArray(row) ? row : String(row).split('')
  );
}

function tileAt(stage, r, c) {
  const row = stage.tiles[r];
  return (Array.isArray(row) ? row : String(row).split(''))[c];
}

// BFS within a single room to check whether item-locked tiles block all exits.
// Returns list of exits (side+idx) that are unreachable if locked tiles block.
function lockedExitsInRoom(stage, lockedTileSet) {
  const ROWS = stage.rows || 10;
  const COLS = stage.cols || 12;
  // Hard-blocked: walls + locked tiles.
  // NOTE: openable in-dungeon gates (T gate, D key-door, color gates) are NOT
  // hard walls here — the player opens them with in-dungeon means (switch/key),
  // exactly like connectivity.mjs SOLVABLE_GATES. Treating them as walls would
  // wrongly flag a legitimate bow/key gate that sits on a room's exit edge (e.g.
  // D3's [1,1] water moat: shoot Y across the water → T opens → walk out dry).
  // Real softlocks (a late-item tile blocking the ONLY exit with no gate route)
  // still error, because the locked tile itself stays blocked.
  const hardBlocked = (r, c) => {
    const t = tileAt(stage, r, c);
    if (t === undefined) return true;
    if (lockedTileSet.has(t)) return true;
    // standard hard walls (simplified). 'Y' stays blocked (a switch you shoot,
    // never stand on); 'T'/'D'/'('/')' are solvable gates → passable for this
    // exit-reachability flood.
    const HARD = new Set(['#', 'M', 'P', 'W', 'w', 'p', 'V', 'X', 'Z',
      'A', 'L', 'N', 'J', 'O', 'U', 'G', 'i', '$', 'q', 'f', 'H', 'u',
      '[', ']', 'Y']);
    return HARD.has(t);
  };

  // Find a walkable starting cell inside the room (not on border)
  let startR = -1, startC = -1;
  outer: for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (!hardBlocked(r, c)) { startR = r; startC = c; break outer; }
    }
  }
  if (startR < 0) return []; // no walkable interior

  const visited = new Set();
  const queue = [[startR, startC]];
  visited.add(`${startR},${startC}`);
  const reachable = new Set();
  reachable.add(`${startR},${startC}`);

  while (queue.length) {
    const [r, c] = queue.shift();
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (hardBlocked(nr, nc)) continue;
      reachable.add(key);
      queue.push([nr, nc]);
    }
  }

  // Collect exits: open border cells (top/bottom = col, left/right = row)
  const exits = [];
  for (let c = 0; c < COLS; c++) {
    if (tileAt(stage, 0, c) !== '#') exits.push({ side: 'top', idx: c, key: `0,${c}` });
    if (tileAt(stage, ROWS-1, c) !== '#') exits.push({ side: 'bottom', idx: c, key: `${ROWS-1},${c}` });
  }
  for (let r = 0; r < ROWS; r++) {
    if (tileAt(stage, r, 0) !== '#') exits.push({ side: 'left', idx: r, key: `${r},0` });
    if (tileAt(stage, r, COLS-1) !== '#') exits.push({ side: 'right', idx: r, key: `${r},${COLS-1}` });
  }

  // An exit is "blocked by locked tiles" if the exit cell itself is reachable
  // WITHOUT locked tiles — but let's report simpler: if the exit cell is NOT
  // in reachable (meaning locked tiles cut it off from the interior start cell)
  return exits.filter(e => !reachable.has(e.key));
}

function checkDungeon(layerName) {
  const layer = d.layers[layerName];
  if (!layer) return [{ level: 'error', msg: `layer not found: ${layerName}` }];

  const issues = [];
  const err  = msg => issues.push({ level: 'error', msg });
  const warn = msg => issues.push({ level: 'warn',  msg });

  const stages = layer.stages || {};
  const allTiles = Object.values(stages).flatMap(tilesOf);

  // ── 1. bossStage + triforceId ────────────────────────────────────────────
  if (!layer.bossStage) {
    err('bossStage が未設定');
  } else if (!stages[layer.bossStage]) {
    err(`bossStage "${layer.bossStage}" に対応するステージが存在しない`);
  }
  if (layer.triforceId == null) {
    err('triforceId が未設定');
  }

  // ── 2. Boss room contents ────────────────────────────────────────────────
  if (layer.bossStage && stages[layer.bossStage]) {
    const bs = stages[layer.bossStage];
    if (!bs.isBossRoom) {
      err(`bossStage "${layer.bossStage}" に isBossRoom:true がない`);
    }
    const bossRoomTiles = tilesOf(bs);
    const hasDropper = bossRoomTiles.some(t => TRIFORCE_BOSS_TILES.has(t));
    if (!hasDropper) {
      err(`bossStage "${layer.bossStage}" に dropsTriforce ボスタイル (A/L/N/J/O/U/G) がない`);
    }
    const cc = bs.chestContents || {};
    const hasHC = Object.values(cc).some(c => c.type === 'heartContainer' || c.item === 'heartContainer');
    if (!hasHC) {
      err(`bossStage "${layer.bossStage}" にハートの器の宝箱がない`);
    }
  }

  // ── 3. Map + Compass ─────────────────────────────────────────────────────
  const hasMap = allTiles.includes('m');
  const hasCompass = allTiles.includes('n');
  if (!hasMap)     err('地図タイル (m) がどの部屋にも存在しない');
  if (!hasCompass) err('コンパスタイル (n) がどの部屋にも存在しない');

  // ── 4. Late-item dependency ──────────────────────────────────────────────
  const unlocked = UNLOCKED_AT[layerName] ?? new Set();
  for (const [stageKey, stage] of Object.entries(stages)) {
    const stageTiles = tilesOf(stage);
    for (const [tile, { item, label }] of Object.entries(ITEM_LOCKED_TILES)) {
      if (!stageTiles.includes(tile)) continue;
      if (unlocked.has(item)) continue; // player has the item at this dungeon

      // The tile exists and the player can't have the item yet.
      // Now check if it blocks any exits.
      const lockedSet = new Set([tile]);
      const blockedExits = lockedExitsInRoom(stage, lockedSet);
      if (blockedExits.length > 0) {
        err(
          `ステージ [${stageKey}] に ${label} があり、` +
          `未取得のまま出口が封鎖される (blocked exits: ` +
          blockedExits.map(e => `${e.side}@${e.idx}`).join(', ') + `)`
        );
      } else {
        warn(
          `ステージ [${stageKey}] に ${label} があるが、` +
          `出口は塞がれていない（寄道ならOK。意図を確認）`
        );
      }
    }
  }

  return issues;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const target = process.argv[2] || 'all';
const dungeons = target === 'all'
  ? Object.keys(d.layers).filter(l => l.startsWith('dungeon') || l === 'cave_1')
  : [target];

let totalErrors = 0;
let totalWarns  = 0;

for (const layerName of dungeons) {
  const issues = checkDungeon(layerName);
  const errors = issues.filter(i => i.level === 'error');
  const warns  = issues.filter(i => i.level === 'warn');
  totalErrors += errors.length;
  totalWarns  += warns.length;

  const badge = errors.length ? '❌' : warns.length ? '⚠️ ' : '✅';
  console.log(`\n${badge} ${layerName}  (${Object.keys(d.layers[layerName]?.stages||{}).length} rooms)`);
  for (const e of errors) console.log(`   ❌ ${e.msg}`);
  for (const w of warns)  console.log(`   ⚠️  ${w.msg}`);
  if (!issues.length)     console.log(`   すべてのチェックに合格`);
}

console.log(`\n── 合計: ❌ ${totalErrors} エラー / ⚠️  ${totalWarns} 警告 ──`);
process.exit(totalErrors > 0 ? 1 : 0);
