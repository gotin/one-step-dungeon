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
//   [MUST] links が全部屋で配列であること（`{}` は refreshGates を TypeError で殺す）
//   [MUST] 鍵 'K' の総数 == 鍵扉 'D' の論理枚数（境界跨ぎの DD は1枚に畳む）
//   [MUST] 各鍵に showConditions の関門が付いていること（床置きの鍵を禁じる）
//   [MUST] 各鍵が「その鍵で開ける扉を通らずに」到達できること（順序＝鍵が自分の扉の奥にない）
//   [MUST] 各鍵の関門トリガーの対象が部屋に実在し、その時点の所持アイテムで成立し得ること
//          （例: torchesLit なのに 'H' が無い部屋＝鍵が永久に出現しない）
//
// ⚠️ 2026-08-05（キュー5番）に上4件を追加した経緯：それまで本チェッカーは
//    鍵の収支も links の形式も見ておらず、**dungeon_5 と dungeon_8 は入室した瞬間に
//    TypeError で死ぬ（links:{}）のに「合格」と表示していた**。さらに D5〜D8 は
//    鍵ゼロで鍵扉があり、ボスに到達できなかった＝進行の背骨が半分折れていた。
//    「機械チェックが緑」は「壊れていない」を意味しない＝検査していない軸は必ず壊れる。
//
// Item unlock order (PLAN.md 9-1):
//   D1: none | D2: boomerang | D3: bow | D4: candle | D5: ladder | D6: bomb
//   cave_1: flute | D7: (no new item)
//
// Usage:
//   node scripts/check-dungeon-integrity.mjs [dungeon_1|all]
//
import { readFileSync } from 'fs';
import { bfsLayer, SOLVABLE_GATES, findEntryRoom, firstWalkable } from './lib/connectivity.mjs';
import { isEnemyTile } from '../shared/enemies.js';

// BLADE_MAP_PATH で読むマップを差し替えられる（既定は実マップ）。
// 用途＝「わざと壊したコピー」を食わせて検査そのものが本当に落ちるかを確かめる
// （検査を足したのに落ちない＝検査が空虚、という事故を防ぐ）。実マップは触らない。
const MAP_PATH = process.env.BLADE_MAP_PATH
  ? new URL(`file://${process.env.BLADE_MAP_PATH}`)
  : new URL('../work/blade-of-lumia.json', import.meta.url);
const d = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// Boss tiles that have dropsTriforce:true (from shared/enemies.js)
const TRIFORCE_BOSS_TILES = new Set(['A', 'L', 'N', 'J', 'O', 'U', 'G', 'I']);
// All boss tiles (isBoss:true) — used to detect "has a boss"
// '{' = sea lord (Phase 9-6): isBoss but NOT dropsTriforce (it is yielded to, not killed),
// so it belongs here only and must stay out of TRIFORCE_BOSS_TILES.
const ALL_BOSS_TILES      = new Set(['W', 'V', 'X', 'Z', 'A', 'L', 'N', 'J', 'O', 'U', 'G', 'I', '{']);

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
  // 最終ダンジョン。ここに来る時点で全アイテム所持（PLAN 9-1 の進行順）。
  // ⚠️ このエントリが無いと unlocked が空集合になり「はしご必須の水で出口封鎖」を
  //    誤検出する。そもそも dark_tower は 2026-08-05 まで検査対象から漏れていた。
  dark_tower: new Set(['boomerang', 'bow', 'candle', 'ladder', 'bomb', 'flute']),
};

// レイヤーの種別。トライフォース8ダンジョン以外は「ボスがトライフォースを落とす」
// 「ハートの器がある」「地図とコンパスがある」を要求してはいけない。
//   final = dark_tower（最終ダンジョン。ボスは Z＝トライフォースを落とさない終幕役）
//   side  = cave_1（笛の洞窟。ボスもフロアマップも持たない寄道）
// 鍵の収支・links・関門・順序（5〜8）は種別に関係なく全レイヤーへ効かせる。
const LAYER_KIND = { dark_tower: 'final', cave_1: 'side' };

// 鍵扉 D を「物理的な1枚の扉」に畳むための隣接規則。
//  ① 同一部屋内の4近傍で連結した D は1枚（game/player.js collectDoorRun と同じ）。
//  ② 部屋の境界にある D は、隣室の対向セルにも D が描かれていれば同じ1枚
//     （＝境界を跨ぐ扉は両画面に描かれる。DECISIONS.md 2026-07-29 決定2）。
// これを畳まずに D セル数を数えると、境界扉が2枚に見えて鍵の収支が狂う。
// 実際 PLAN.md の初期監査はこれで D4 を「鍵不足」と誤判定していた。
function logicalDoors(stages) {
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
  const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const doorCells = [];
  for (const [k, s] of Object.entries(stages)) {
    const rows = s.rows, cols = s.cols;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (tileAt(s, r, c) !== 'D') continue;
        const id = `${k}:${r},${c}`;
        add(id);
        doorCells.push({ k, s, r, c, id });
      }
    }
  }
  for (const { k, s, r, c, id } of doorCells) {
    // ① 同室4近傍
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      if (tileAt(s, r + dr, c + dc) === 'D') union(id, `${k}:${r+dr},${c+dc}`);
    }
    // ② 境界を跨ぐ対向セル
    const [sx, sy] = k.split(',').map(Number);
    const mirrors = [];
    if (r === 0)            mirrors.push([`${sx},${sy-1}`, s.rows - 1, c]);
    if (r === s.rows - 1)   mirrors.push([`${sx},${sy+1}`, 0, c]);
    if (c === 0)            mirrors.push([`${sx-1},${sy}`, r, s.cols - 1]);
    if (c === s.cols - 1)   mirrors.push([`${sx+1},${sy}`, r, 0]);
    for (const [mk, mr, mc] of mirrors) {
      const ms = stages[mk];
      if (ms && tileAt(ms, mr, mc) === 'D') union(id, `${mk}:${mr},${mc}`);
    }
  }
  const groups = new Map();
  for (const { id } of doorCells) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  return [...groups.values()];
}

/** レイヤー内の鍵 'K' セルを列挙する。 */
function keyCells(stages) {
  const out = [];
  for (const [k, s] of Object.entries(stages)) {
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        if (tileAt(s, r, c) === 'K') out.push({ room: k, r, c, posKey: `${r},${c}` });
      }
    }
  }
  return out;
}

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
  // ⚠️ 範囲外は必ず undefined を返す。ガード無しだと String(undefined).split('')
  //    ＝ ['u','n','d','e','f','i','n','e','d'] になり、c=2 で 'd'（＝鍵扉 D ではないが
  //    小文字 d）等の幽霊タイルを返して隣接判定を壊す。
  if (row === undefined || row === null) return undefined;
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
  const kind = LAYER_KIND[layerName] ?? 'triforce';

  // ── 1. bossStage + triforceId ────────────────────────────────────────────
  if (!layer.bossStage) {
    if (kind === 'triforce') err('bossStage が未設定');
  } else if (!stages[layer.bossStage]) {
    err(`bossStage "${layer.bossStage}" に対応するステージが存在しない`);
  }
  if (layer.triforceId == null && kind === 'triforce') {
    err('triforceId が未設定');
  }

  // ── 2. Boss room contents ────────────────────────────────────────────────
  if (kind === 'triforce' && layer.bossStage && stages[layer.bossStage]) {
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
  // 寄道の洞窟（side）はフロアマップもコンパスも持たない設計なので要求しない。
  if (kind !== 'side') {
    if (!hasMap)     err('地図タイル (m) がどの部屋にも存在しない');
    if (!hasCompass) err('コンパスタイル (n) がどの部屋にも存在しない');
  }

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

  // ── 5. links は必ず配列 ──────────────────────────────────────────────────
  // `links: {}` は game/conditions.js refreshGates の for...of を TypeError で殺す。
  // refreshGates は enterStage から必ず呼ばれる∴入室した瞬間に board も描かれず死ぬ。
  // dungeon_5 / dungeon_8 が全部屋これで、まる1フェーズ気づかれなかった。
  for (const [stageKey, stage] of Object.entries(stages)) {
    if (stage.links === undefined) continue;
    if (!Array.isArray(stage.links)) {
      err(`ステージ [${stageKey}] の links が配列でない (${JSON.stringify(stage.links)})`
        + ` ← 入室時に refreshGates が TypeError で落ちる`);
    }
  }

  // ── 6. 鍵と鍵扉の収支 ────────────────────────────────────────────────────
  const doors = logicalDoors(stages);
  const keys  = keyCells(stages);
  if (doors.length !== keys.length) {
    const sign = keys.length - doors.length;
    err(`鍵の収支が合わない：鍵 K ${keys.length}個 / 鍵扉 ${doors.length}枚 (${sign > 0 ? '+' : ''}${sign})`
      + `  扉=[${doors.map(g => g.join('+')).join('] [')}]`);
  }

  // ── 7. 全ての鍵に関門（showConditions）が付いているか ───────────────────
  // 床に置いただけの鍵は「歩いて拾うだけ」＝進行の壁として何の意味も持たない。
  // 2026-08-05 ユーザー確定：まず killAll（部屋の敵全滅）で背骨を通し、後で強化する。
  for (const kc of keys) {
    const cond = stages[kc.room].showConditions?.[kc.posKey];
    if (!cond) {
      err(`鍵 [${kc.room}] (${kc.posKey}) に showConditions の関門が無い（床置きの鍵）`);
    }
  }

  // ── 8. 鍵の順序：鍵ゼロから始めて全ての扉を開けきれるか ─────────────────
  // ⚠️ 「全ての鍵が扉を1枚も通らずに取れること」では検査にならない。dark_tower は
  //    扉①の奥に鍵②がある＝正当な段階進行（鍵①で①を開け、その先で鍵②を拾い②を開ける）。
  //    単発 BFS で「扉ゼロ到達」を要求すると、これを softlock だと誤検出する。
  //    ∴「開けた扉を開に足して再走する」状態探索にする。
  //
  // 状態＝開けた扉集合（bitmask）。遷移＝「今の鍵の在庫（到達できる K の数 − 既に
  // 開けた扉の数）が1以上」かつ「その扉に触れる（開けると到達範囲が広がる）」とき
  // その扉を開ける。全ての扉を開けた状態に到達できれば合格。
  // 歩行自体は D 以外のゲート（T / 色 / 爆弾壁 / 潮 / ボス戸口）を開・はしご所持とみなす
  // 寛容な近似なので、誤検出（実際は解けるのにエラー）は出ない側に倒れる。
  // 鍵の持ち越しは 0 と仮定する（player.keys は実際はグローバルだが、単体で成立させる）。
  if (doors.length > 0) {
    const entryRoom = findEntryRoom(stages);
    const start = entryRoom ? firstWalkable(stages[entryRoom]) : null;
    if (!start) {
      warn('入口部屋（field へ戻る > を持つ部屋）が特定できず、鍵の順序検査をスキップ');
    } else if (doors.length > 12) {
      warn(`鍵扉が ${doors.length} 枚あり状態探索を打ち切った（順序検査は未実施）`);
    } else {
      const openExceptDoor = new Set([...SOLVABLE_GATES].filter(t => t !== 'D'));
      // 状態 mask の到達範囲。mask のビットが立った扉のセルを床に差し替えて歩く。
      const reachCache = new Map();
      const reachOf = (mask) => {
        if (reachCache.has(mask)) return reachCache.get(mask);
        const view = {};
        for (const [k, s] of Object.entries(stages)) {
          view[k] = { ...s, tiles: s.tiles.map(row => (Array.isArray(row) ? [...row] : String(row).split(''))) };
        }
        for (let i = 0; i < doors.length; i++) {
          if (!(mask & (1 << i))) continue;
          for (const cellId of doors[i]) {
            const [room, pos] = cellId.split(':');
            const [r, c] = pos.split(',').map(Number);
            view[room].tiles[r][c] = '.';
          }
        }
        const res = bfsLayer(view, { stage: entryRoom, row: start.row, col: start.col }, {
          withLadder: true, openTiles: openExceptDoor, followMapEnters: true,
        });
        reachCache.set(mask, res.reachedCells);
        return res.reachedCells;
      };
      const popcount = (m) => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };
      const ALL = (1 << doors.length) - 1;

      let best = 0, bestReach = reachOf(0);
      const seen = new Set([0]);
      const queue = [0];
      while (queue.length) {
        const mask = queue.shift();
        const reached = reachOf(mask);
        if (popcount(mask) > popcount(best)) { best = mask; bestReach = reached; }
        if (mask === ALL) { best = ALL; bestReach = reached; break; }
        const inStock = keys.filter(kc => reached.has(`${kc.room}:${kc.r},${kc.c}`)).length - popcount(mask);
        if (inStock <= 0) continue;
        for (let i = 0; i < doors.length; i++) {
          if (mask & (1 << i)) continue;
          const next = mask | (1 << i);
          if (seen.has(next)) continue;
          // 「触れる扉」だけ開けられる＝開けて到達範囲が増えないなら手が届いていない。
          if (reachOf(next).size <= reached.size) continue;
          seen.add(next);
          queue.push(next);
        }
      }

      if (best !== ALL) {
        const stuck = doors.filter((_, i) => !(best & (1 << i))).map(g => g.join('+'));
        const gotKeys = keys.filter(kc => bestReach.has(`${kc.room}:${kc.r},${kc.c}`)).length;
        err(`鍵の順序が詰む：鍵ゼロから開けられる扉は ${popcount(best)}/${doors.length} 枚まで`
          + `（その時点で取れる鍵 ${gotKeys}/${keys.length}個）`
          + `  開けられない扉=[${stuck.join('] [')}]`);
      }
    }
  }

  // ── 9. 関門トリガーの対象が部屋に実在するか ─────────────────────────────
  // 検査(7) は「showConditions が付いているか」しか見ない＝**トリガーの対象が
  // 部屋に無くても合格する**。例：trigger:'torchesLit' なのに 'H' が1本も無い部屋は
  // evaluateConditions の `allTorches.length > 0` が偽になり続け、鍵が永久に
  // 出現しない＝ダンジョンが詰む。killAll から本物の関門へ移す（キュー5.5）なら
  // この穴を先に塞いでおく必要がある。
  // ⚠️ game/conditions.js evaluateConditions にトリガーを足したら、ここにも足す。
  //    未知のトリガーは error にしてあるので、足し忘れは必ず検査で落ちる。
  for (const kc of keys) {
    const stage = stages[kc.room];
    const cond = stage.showConditions?.[kc.posKey];
    if (!cond) continue;                       // 検査(7) が既に error を出している
    const where = `鍵 [${kc.room}] (${kc.posKey}) の関門 '${cond.trigger}'`;
    const st = tilesOf(stage);
    const cellsOf = (tile) => {
      const out = [];
      for (let r = 0; r < stage.rows; r++) {
        for (let c = 0; c < stage.cols; c++) if (tileAt(stage, r, c) === tile) out.push(`${r},${c}`);
      }
      return out;
    };
    const needItem = (item, why) => {
      if (!unlocked.has(item)) err(`${where}：${why}が必要だがこのダンジョン時点で未所持`);
    };

    switch (cond.trigger) {
      case 'killAll':
        if (!st.some(t => isEnemyTile(t))) err(`${where}：部屋に敵が1体も居ない＝入室時点で条件成立`);
        break;

      case 'torchesLit': {
        const torches = cellsOf('H');
        const lit = new Set(stage.initLitTorches ?? []);
        for (const pk of lit) {
          if (!torches.includes(pk)) err(`${where}：initLitTorches の ${pk} が 'H' でない`);
        }
        if (!torches.length) {
          err(`${where}：部屋にかがり火 'H' が無い＝鍵が永久に出現しない`);
        } else if (torches.every(pk => lit.has(pk))) {
          err(`${where}：'H' が全て initLitTorches で点灯済み＝入室時点で条件成立`);
        } else if (![...lit].length) {
          // 火元が無いので自力で点ける＝ロウソクが要る
          needItem('candle', '火元（initLitTorches）が無いためロウソク');
        } else {
          // 火元がある＝運ぶ手段（ブーメラン）かロウソクのどちらかが要る
          if (!unlocked.has('boomerang') && !unlocked.has('candle')) {
            err(`${where}：炎を運ぶ手段（ブーメラン）もロウソクも未所持＝点火できない`);
          }
        }
        break;
      }

      case 'switchOn': {
        // ボタン 'S'（踏む）とスイッチ 'Y'（武器で叩く）の両方が対象になり得る
        // （evaluateConditions が switchStates / switchToggles の両方を見る）。
        if (!cond.switchId) { err(`${where}：switchId が無い`); break; }
        const t = tileAt(stage, ...cond.switchId.split(',').map(Number));
        if (t !== 'S' && t !== 'Y') {
          err(`${where}：switchId ${cond.switchId} が 'S'/'Y' でない（'${t}'）＝永久に ON にならない`);
        }
        // 'Y' に弓が要るかは幾何次第（隣が床なら剣で届く）なのでここでは要求しない。
        // 「歩いても剣でも届かない Y」の検査は幾何の問題＝移行スクリプト側で担保する。
        break;
      }

      case 'allSwitchesOn':
        if (!cellsOf('S').length) err(`${where}：部屋にボタン 'S' が無い＝鍵が永久に出現しない`);
        break;

      case 'stonesPlaced': {
        // 倉庫番型（キュー 5.5e / PUZZLE-DESIGN §7-5）。allSwitchesOn と違い
        // **石だけ**を数える∴ボタンに加えて石そのものが必要で、しかも石が足りないと
        // 永久に成立しない。さらに敵は石を押す（enemy-ai.js tryEnemyPushStone）ので
        // 測定した倉庫番が壊れる＝この型の部屋に敵を置くのは error にする。
        const buttons = cellsOf('S');
        const stones  = cellsOf('*');
        if (!buttons.length) { err(`${where}：部屋にボタン 'S' が無い＝鍵が永久に出現しない`); break; }
        if (!stones.length)  { err(`${where}：部屋に石 '*' が無い＝ボタンに石を乗せられない`); break; }
        if (stones.length < buttons.length) {
          err(`${where}：石 ${stones.length} 個 < ボタン ${buttons.length} 個＝全ボタンに石を乗せられない`);
        }
        // ⚠️ 「石が初期からボタン上にある（＝一部解けた状態）」はここでは検査できない：
        //    1セルは 'S' か '*' のどちらか一方しか持てない＝その状態が tiles で表現できず、
        //    データ上は単に「ボタンが1個少ない部屋」になる（実際に壊して確認済み）。
        //    石とボタンを別リストで重ねる移行スクリプト側（migrate-key-room-d4.mjs の検査④・
        //    generate-key-room-d4.mjs の pullBFS）でだけ表現でき、そこで弾いている。
        if (st.some(t => isEnemyTile(t))) {
          err(`${where}：倉庫番の部屋に敵が居る（敵が石を押す＝測定した解が崩れる/詰む）`);
        }
        break;
      }

      case 'wallBroken': {
        if (!cond.wallId) { err(`${where}：wallId が無い`); break; }
        const t = tileAt(stage, ...cond.wallId.split(',').map(Number));
        if (t !== '!') err(`${where}：wallId ${cond.wallId} が壊せる壁 '!' でない（'${t}'）`);
        needItem('bomb', '壁を壊す爆弾');
        break;
      }

      case 'bushBurned':
        if (!st.includes('u')) err(`${where}：部屋に茂み 'u' が無い＝鍵が永久に出現しない`);
        needItem('candle', '茂みを燃やすロウソク');
        break;

      case 'flutePlayed':
        needItem('flute', '笛');
        break;

      case 'hasItem':
        if (!cond.item) err(`${where}：item が無い`);
        else needItem(cond.item, `所持を条件にしている ${cond.item}`);
        break;

      default:
        err(`${where}：未知のトリガー（game/conditions.js に無い＝永久に成立しない）`);
    }
  }

  return issues;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const target = process.argv[2] || 'all';
const dungeons = target === 'all'
  // dark_tower も対象（2026-08-05 まで漏れていた＝最終ダンジョンだけ無検査だった）。
  ? Object.keys(d.layers).filter(l => l.startsWith('dungeon') || l === 'cave_1' || l === 'dark_tower')
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
