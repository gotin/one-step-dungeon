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
//   [MUST] 境界を跨ぐ鍵扉を両面 D で描いていないこと（抜けた先で扉に埋まる恒久詰みになる）
//   [MUST] 各鍵に showConditions の関門が付いていること（床置きの鍵を禁じる）
//   [MUST] 各鍵が「その鍵で開ける扉を通らずに」到達できること（順序＝鍵が自分の扉の奥にない）
//   [MUST] 各鍵の関門トリガーの対象が部屋に実在し、その時点の所持アイテムで成立し得ること
//          （例: torchesLit なのに 'H' が無い部屋＝鍵が永久に出現しない）
//   [MUST] すべての showConditions が `trigger` を持つこと（`type:` などの書式ミスは
//          evaluateConditions に読まれず、条件が永久に成立しない）
//   [MUST] trigger:'flutePlayed'/'killAllAndFlute' はそのステージに
//          fluteEffect:{type:'reveal'} が要る（playFlute() が ss.flutePlayed を
//          立てる唯一の経路。無いと笛を吹いても条件が永久に成立しない）
//   [MUST] '>' タイルと mapEnters が 1:1（未登録の '>' ＝飾りの入口／destId 付きなのに
//          タイルが無い登録 ＝永久に使えない出入口。id だけの着地専用エントリは除く）
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
import { bfsLayer, SOLVABLE_GATES, findEntryRoom, firstWalkable, isHardBlocked } from './lib/connectivity.mjs';
import { isEnemyTile } from '../shared/enemies.js';
import { toolsUsableIn } from '../shared/progression.js';

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

// dungeonLayer → そのレイヤーの中で使える道具（入場時の所持 ∪ そのレイヤー自身の報酬）。
// ⚠️ 2026-08-19（5.5m）に `scripts/lib/progression.mjs`（手書き）へ移し、2026-09-05（0g）で
//    手書きを消して `shared/progression.js` の**実マップからの導出**に置き換えた。
//    ここで引くのは `ITEM_LOCKED_TILES` の `ladder`（D5 の報酬）と `bomb`（D6 の報酬）だけ＝
//    どちらも「自分のレイヤーの報酬」を含む緩い上限で正しい（D5 の中で拾ったはしごで D5 の
//    奥の水を渡る）。部屋の順序は見ない粒度∴これ単体はソフトロックの厳密判定ではない。
const TOOLS_USABLE_IN = toolsUsableIn(d);

// レイヤーの種別。トライフォース8ダンジョン以外は「ボスがトライフォースを落とす」
// 「ハートの器がある」「地図とコンパスがある」を要求してはいけない。
//   final = dark_tower（最終ダンジョン。ボスは Z＝トライフォースを落とさない終幕役）
//   side  = 寄道（トライフォースもフロアマップも持たない）
//           cave_1       … 笛の洞窟
//           warlord_lair … 魔将の巣（0h・2026-09-05）。`bossStage` と `isBossRoom` は持つが
//                          落とすのは伝説の鎧＝星の欠片もハートの器も無い∴`triforce` の要求は当てない。
//           darklord_prison … 魔王の岩牢（0o・2026-09-05）。X 魔王の一対一。`bossStage` と
//                          `isBossRoom` を持ち報酬にハートの器はあるが**星の欠片は落とさない**
//                          （祭壇より後の寄道∴落とすと総数が 9 になって祭壇が開かない）。
//           forest_cave  … 爆弾＋かがり火で入る小部屋（0v・2026-09-05）。`bossStage` 無し。
//           secret_grotto … 笛 reveal で現れる寄道（D8 の後）。ミラーシールドを持つ。`bossStage` 無し。
//           void_shrine  … 羽衣ゲートの2部屋。`isBossRoom` を持たない代わりに脱出ゲート 'T' と
//                          色門・石車がある。`bossStage` 無し。
// 鍵の収支・links・関門・順序（5〜8）は種別に関係なく全レイヤーへ効かせる。
const LAYER_KIND = {
  dark_tower: 'final', cave_1: 'side', warlord_lair: 'side', darklord_prison: 'side',
  forest_cave: 'side', secret_grotto: 'side', void_shrine: 'side',
};

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

/**
 * レイヤー内の鍵を列挙する。
 *
 * ⚠️ 鍵はタイル 'K' だけではない：`floorItems` の `{ item:'key' }` も実ゲームでは
 *    まったく同じ鍵（player.keys が増える）。2026-08-06 までここは 'K' しか数えておらず、
 *    dungeon_6/7/8 の鍵部屋 [1,0] が**鍵を2個ずつ持っている**（'K'(5,7) と
 *    floorItems['6,5']）のを検査(6)「鍵の数 == 鍵扉の枚数」が緑のまま見逃していた
 *    ＝実ゲームでは鍵が3個余り、dark_tower の鍵扉2枚をパズル抜きで開けられた。
 *    余剰鍵は scripts/fix-stray-floor-keys.mjs で削除済み。ここで両方を数えるのは
 *    「同じ事故を次に持ち込まない」ため（検査していない軸は必ず壊れる）。
 */
function keyCells(stages) {
  const out = [];
  for (const [k, s] of Object.entries(stages)) {
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        if (tileAt(s, r, c) === 'K') out.push({ room: k, r, c, posKey: `${r},${c}`, kind: 'tile' });
      }
    }
    for (const [posKey, item] of Object.entries(s.floorItems ?? {})) {
      if (item?.item !== 'key') continue;
      const [r, c] = posKey.split(',').map(Number);
      out.push({ room: k, r, c, posKey, kind: 'floorItem' });
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
  const unlocked = TOOLS_USABLE_IN[layerName] ?? new Set();
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

  // ── 6b. 境界を跨ぐ鍵扉を「両面 D」で描いてはいけない ────────────────────
  // 2026-08-06 バグ（ユーザー報告「鍵をとって左のステージに移動したらドアの上に埋まって
  // 動けなくなった」）。エンジンの扉は部屋単位（ss.openedDoors／collectDoorRun は部屋内の
  // 連結成分だけ）∴同じ扉を両画面に D で描くと、手前を鍵1個で開けて抜けた先の D は閉じたまま
  // 残り、その閉じた扉セルに着地して4方向すべて塞がる（鍵は消費済み＝恒久詰み）。
  // 正しい描き方＝扉は鍵を持って来る側の1面だけに置き、着地側は ';'（常時開放の境界通路）。
  // ※ logicalDoors ② の畳み込みは残してある（両面 D を作ってしまった時に検査(6) の収支まで
  //   同時に崩れて原因が分かりにくくなるのを避けるため）∴ここで別に error を出す。
  for (const [stageKey, stage] of Object.entries(stages)) {
    const [sx, sy] = stageKey.split(',').map(Number);
    for (let r = 0; r < stage.rows; r++) {
      for (let c = 0; c < stage.cols; c++) {
        if (tileAt(stage, r, c) !== 'D') continue;
        const mirrors = [];
        if (r === 0)             mirrors.push([`${sx},${sy - 1}`, stage.rows - 1, c]);
        if (r === stage.rows - 1) mirrors.push([`${sx},${sy + 1}`, 0, c]);
        if (c === 0)             mirrors.push([`${sx - 1},${sy}`, r, stage.cols - 1]);
        if (c === stage.cols - 1) mirrors.push([`${sx + 1},${sy}`, r, 0]);
        for (const [mk, mr, mc] of mirrors) {
          const ms = stages[mk];
          if (ms && tileAt(ms, mr, mc) === 'D') {
            err(`境界を跨ぐ鍵扉が両面 D：[${stageKey}] (${r},${c}) ↔ [${mk}] (${mr},${mc})`
              + ` ← 着地側を ';' にする（scripts/migrate-boundary-doors.mjs）。`
              + `そのままだと扉を抜けた先で閉じた扉に埋まって動けなくなる`);
          }
        }
      }
    }
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

      // Phase 5.5h: 戦闘型の2段目（PUZZLE-DESIGN §7-4 D7）＝全滅＋笛の両方が要る。
      case 'killAllAndFlute':
        if (!st.some(t => isEnemyTile(t))) err(`${where}：部屋に敵が1体も居ない＝入室時点で条件成立`);
        needItem('flute', '笛');
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

  // ── 10. showConditions は必ず `trigger` を持つ ───────────────────────────
  // 検査(9) は**鍵に付いた関門だけ**を見る∴鍵以外（mapEnters・宝箱・タイル出現）に
  // 付いた関門の書式ミスを取りこぼしていた。
  // 2026-09-19 に実害を確認：dark_tower 2,2 / 3,2 の隠し門が `type: 'torchesLit'`
  // `type: 'flutePlayed'` と書かれており、game/conditions.js evaluateConditions は
  // `cond.trigger` しか読まない∴条件が永久に成立しない（かがり火と笛が無意味）。
  // 生成スクリプト（e98217b の migrate-dark-tower.mjs）由来で、既存の全検査が緑だった。
  for (const [stageKey, stage] of Object.entries(stages)) {
    for (const [posKey, cond] of Object.entries(stage.showConditions ?? {})) {
      if (!cond || typeof cond !== 'object') {
        err(`ステージ [${stageKey}] (${posKey}) の showConditions が object でない (${JSON.stringify(cond)})`);
      } else if (!cond.trigger) {
        err(`ステージ [${stageKey}] (${posKey}) の showConditions に trigger が無い (${JSON.stringify(cond)})`
          + ` ← evaluateConditions は cond.trigger しか読まない＝この条件は永久に成立しない`);
      }
    }
  }

  // ── 11b. flutePlayed / killAllAndFlute は fluteEffect:{type:'reveal'} が要る ──
  // 検査(9) は**鍵に付いた関門だけ**を見る＝MAP_ENTER に付いた関門（隠し門）は
  // 通らない。game.js playFlute() は `stageData.fluteEffect.type === 'reveal'` の
  // ときだけ `ss.flutePlayed = true` を立てる（evaluateConditions が読むのはこの
  // フラグだけ）∴fluteEffect が無いステージで trigger:'flutePlayed' を使うと、
  // 笛を吹いても「特に何も起きない」で条件が永久に成立しない。
  // 2026-09-19 に dark_tower 3,2 の隠し門で実害を確認（同じ e98217b の生成スクリプト
  // 由来。他の全 flutePlayed/killAllAndFlute ゲート7件は fluteEffect.reveal を持っていた
  // ＝この検査で初めて可視化した「たった1件だけ違う」異常）。
  for (const [stageKey, stage] of Object.entries(stages)) {
    for (const [posKey, cond] of Object.entries(stage.showConditions ?? {})) {
      if (cond?.trigger !== 'flutePlayed' && cond?.trigger !== 'killAllAndFlute') continue;
      if (stage.fluteEffect?.type !== 'reveal') {
        err(`ステージ [${stageKey}] (${posKey}) の関門 '${cond.trigger}' は`
          + ` fluteEffect:{type:'reveal'} が無い ← playFlute() が ss.flutePlayed を`
          + ` 立てられず、笛を吹いても永久に条件が成立しない`);
      }
    }
  }

  // ── 11. '>' タイルと mapEnters の 1:1 ──────────────────────────────────
  // game/game.js checkStageTransition は `tiles[r][c] === '>'` と
  // `mapEnters[posKey].destId` の**両方**を要求する∴片側だけのものは必ず死んでいる。
  //   ・登録の無い '>' ＝踏んでも何も起きない飾り（プレイヤーは入口だと思って踏む）。
  //   ・destId があるのにタイルが無い登録 ＝その出入口は永久に使えない。
  // 2026-09-19 に dark_tower で実害を確認（どちらも e98217b の生成スクリプト由来）：
  //   未登録の '>' が 12 枚（行の文字列に書いた '>' と tiles[r][4]='>' の列ズレ）、
  //   隠し門 2 件がタイル無し、さらに着地セル 0,1 (5,5) にタイルが無く**塔から歩いて
  //   出られなかった**。他の全レイヤーは 1:1 だったので、この検査は当時も落ちた。
  // ※ `destId` を持たない「着地専用」エントリ（id だけ＝他所の '>' の行き先）は対象外。
  //   例: secret_grotto 0,0 (5,2) は笛で現れる寄道の着地点で、出口は別セルにある。
  for (const [stageKey, stage] of Object.entries(stages)) {
    const arrows = [];
    for (let r = 0; r < stage.rows; r++) {
      for (let c = 0; c < stage.cols; c++) if (tileAt(stage, r, c) === '>') arrows.push(`${r},${c}`);
    }
    for (const posKey of arrows) {
      if (!stage.mapEnters?.[posKey]) {
        err(`ステージ [${stageKey}] (${posKey}) の '>' が mapEnters に無い`
          + ` ← 踏んでも何も起きない飾りの入口（'.' に戻すか行き先を登録する）`);
      }
    }
    for (const [posKey, ent] of Object.entries(stage.mapEnters ?? {})) {
      if (!ent?.destId) continue;                // 着地専用エントリ（id だけ）は '>' 不要
      if (!arrows.includes(posKey)) {
        err(`ステージ [${stageKey}] (${posKey}) は destId "${ent.destId}" を持つのに '>' タイルが無い`
          + ` ← この出入口は永久に使えない`);
      }
    }
  }

  // ── 12. 見せかけ開口（歩いて渡れそうに見える境界の先に行き先が無い）────────
  // なぜ静的に見るのか＝`check-dungeon-connectivity.mjs` の歩行BFSでは**到達しない
  // 部屋の境界は永久に検出されない**。dark_tower は階と階が階段ワープでしか繋がらない
  // ∴歩行BFSは B1F の4室しか歩かず「✅ no dead edges」と出ていたのに、実際は
  //   ・`1,0` の row0 が10セル素通しなのに真上の階が存在しない
  //   ・`5,2 (8,11)` の東に部屋が無い
  //   ・`1,1 (4,11)(5,11)` の東は `2,1` の col0 が全行 '#' ＝到着セルが壁
  // という見せかけ開口が3箇所あった（2026-09-21・キュー20b の棚卸し）。
  // プレイヤーには「行けそうなのに押し戻される」（`game/game.js checkStageTransition`
  // の隣接ステージ無し＝画面内クランプ／到着セルが壁＝取り消し＋押し戻し）としか見えない。
  //
  // 判定＝境界セル（row0／最終row／col0／最終col）が **hard-blocked でない**なら
  // 「開いた口」とみなし、(a) グリッド隣接ステージが存在し (b) 到着セル（対辺の同一座標）も
  // hard-blocked でないことを要求する。ゲート・扉・壊せる壁（SOLVABLE_GATES）は
  // 「いずれ開く口」∴開いた口として数える（閉じた関門の先が虚無でも欠陥）。
  for (const [stageKey, stage] of Object.entries(stages)) {
    const [sx, sy] = stageKey.split(',').map(Number);
    const R = stage.rows, C = stage.cols;
    const sides = [
      ['上', `${sx},${sy - 1}`, Array.from({ length: C }, (_, c) => [0, c]),      (r, c) => [R - 1, c]],
      ['下', `${sx},${sy + 1}`, Array.from({ length: C }, (_, c) => [R - 1, c]),  (r, c) => [0, c]],
      ['左', `${sx - 1},${sy}`, Array.from({ length: R }, (_, r) => [r, 0]),      (r, c) => [r, C - 1]],
      ['右', `${sx + 1},${sy}`, Array.from({ length: R }, (_, r) => [r, C - 1]),  (r, c) => [r, 0]],
    ];
    for (const [label, neighborKey, cells, arrivalOf] of sides) {
      const neighbor = stages[neighborKey];
      const openCells = cells.filter(([r, c]) => !isHardBlocked(tileAt(stage, r, c)));
      if (!openCells.length) continue;
      if (!neighbor) {
        err(`ステージ [${stageKey}] の${label}端が ${openCells.length} セル開いているのに`
          + ` 隣（${neighborKey}）にステージが無い ← 見せかけ開口（歩いて越えようとすると`
          + ` 画面内クランプで押し戻される）: ${openCells.map(([r, c]) => `${r},${c}`).join(' ')}`);
        continue;
      }
      const stuck = openCells.filter(([r, c]) => {
        const [ar, ac] = arrivalOf(r, c);
        if (ar < 0 || ac < 0 || ar >= neighbor.rows || ac >= neighbor.cols) return true;
        return isHardBlocked(tileAt(neighbor, ar, ac));
      });
      if (stuck.length) {
        err(`ステージ [${stageKey}] の${label}端 ${stuck.map(([r, c]) => `${r},${c}`).join(' ')} が開いているのに`
          + ` 隣（${neighborKey}）の到着セルが壁 ← 見せかけ開口（踏み出しが取り消される）`);
      }
    }
  }

  // ── 13. 境界セルに置かれた '>'（ワープの絵と通路の絵が同じ位置に見える）────
  // ユーザー指摘（2026-09-20・dark_tower `0,1`）＝「0,1 の上の方に入り口あるけど、
  // これ上のステージに行けちゃいそうな位置にあって変じゃん」。境界の `>` は
  // 「隣の部屋へ歩いて抜ける口」と見分けがつかないのに、踏むと別の階へ飛ぶ。
  // ⚠️ warn に留める理由＝「境界に着地点を置く」設計自体は壊れていない（他レイヤーに
  //    既存例があり得る）∴機械的な ❌ にはせず、設計で直す候補として挙げる。
  for (const [stageKey, stage] of Object.entries(stages)) {
    for (const posKey of Object.keys(stage.mapEnters ?? {})) {
      const [r, c] = posKey.split(',').map(Number);
      if (tileAt(stage, r, c) !== '>') continue;   // 12番とは別件（1:1 は 11番が見る）
      const onBorder = r === 0 || c === 0 || r === stage.rows - 1 || c === stage.cols - 1;
      if (onBorder) {
        warn(`ステージ [${stageKey}] (${posKey}) の '>' が境界セルに乗っている`
          + ` ← 隣室へ歩いて抜ける口と見分けがつかない（室内へ1マス下げる）`);
      }
    }
  }

  // ── 14. スイッチ 'Y' が配線されていない／ステージに幽霊フィールドが在る ────────
  // ユーザー指摘（2026-09-21・dark_tower `1,1`）＝「スイッチあってもなんの意味ないよね？」。
  // 実装の事実：`Y` → `T` の連動を張るのは **`stageData.links` の `{switchId, gateId}` だけ**
  // （`game/conditions.js` の `refreshGates()`②）。エンジン側の `switchToggles` は
  // **セーブ状態の実行時 Set**（`ss.switchToggles`／`game/player.js` `toggleSwitch()`）で、
  // **ステージデータに同名のフィールドを書いても誰も読まない**。
  // 2026-09-21 に実害を確認＝`dark_tower 1,1` は `switchToggles:{"7,9":["4,5","5,5"]}` という
  // 「配線に見えるフィールド」を持ちながら `links: []`＝叩いても門は永久に開かない。さらに
  // 指している `7,9` は空の床（本物の `Y` は `(7,8)`）＝座標まで嘘だった。`4,2` にも同型が在った。
  //
  // ⚠️ `Y` の出口は links だけではない：`showConditions` の `{trigger:'switchOn', switchId}`
  //    （`evaluateConditions()`）も `ss.switchToggles` を見る＝「叩くと宝箱／鍵が出る」型の配線。
  //    D3 `1,0` の `Y②(8,9)`・D5 `1,0` の `Y②(8,8)` が実例で、links には載らないが生きている。
  //    ∴ 生きている判定は「links か showConditions(switchOn) のどちらかが指している」。
  for (const [stageKey, stage] of Object.entries(stages)) {
    if (stage.switchToggles !== undefined) {
      err(`ステージ [${stageKey}] に幽霊フィールド 'switchToggles' がある`
        + ` ← エンジンはステージの switchToggles を読まない（実行時は ss.switchToggles）。`
        + `'Y'→'T' の連動は links の {switchId,gateId} で張る: ${JSON.stringify(stage.switchToggles)}`);
    }
    const links = Array.isArray(stage.links) ? stage.links : [];
    const wired = new Set(links.map((l) => l.switchId));
    for (const cond of Object.values(stage.showConditions ?? {})) {
      if (cond?.trigger === 'switchOn' && cond.switchId) wired.add(String(cond.switchId));
    }
    const switches = [];
    for (let r = 0; r < stage.rows; r++) {
      for (let c = 0; c < stage.cols; c++) if (tileAt(stage, r, c) === 'Y') switches.push(`${r},${c}`);
    }
    for (const pos of switches) {
      if (!wired.has(pos)) {
        err(`ステージ [${stageKey}] の 'Y'(${pos}) が links にも showConditions(switchOn) にも載っていない`
          + ` ← 叩いても何も起きない飾りのスイッチ`);
      }
    }
    // showConditions(switchOn) が指す先が本当にスイッチか（座標の嘘を防ぐ）
    for (const [posKey, cond] of Object.entries(stage.showConditions ?? {})) {
      if (cond?.trigger !== 'switchOn' || !cond.switchId) continue;
      const [sr, sc] = String(cond.switchId).split(',').map(Number);
      const st = tileAt(stage, sr, sc);
      if (st !== 'Y' && st !== 'S') {
        err(`ステージ [${stageKey}] の showConditions[${posKey}] の switchId(${cond.switchId})`
          + ` が 'Y' でも 'S' でもない: '${st}' ← 永久に成立しない条件`);
      }
    }
    // 逆向き＝links が指す switchId / gateId が実際のタイルと合っているか（座標の嘘を防ぐ）
    for (const l of links) {
      const [sr, sc] = String(l.switchId).split(',').map(Number);
      const st = tileAt(stage, sr, sc);
      if (st !== 'Y' && st !== 'S') {
        err(`ステージ [${stageKey}] の links の switchId(${l.switchId}) が 'Y' でも 'S' でもない: '${st}'`);
      }
      const [gr, gc] = String(l.gateId).split(',').map(Number);
      const gt = tileAt(stage, gr, gc);
      if (gt !== 'T' && gt !== '=') {
        err(`ステージ [${stageKey}] の links の gateId(${l.gateId}) が 'T' でも '=' でもない: '${gt}'`);
      }
    }
  }

  // ── 15. breakableWalls が壊せる壁を指しているか／形が {breakDef} か ────────────
  // 実装の事実：破壊強度を読むのは `game/projectile.js:942` の
  //   `sd.breakableWalls?.[posKey]?.breakDef ?? 1`
  // ∴ ① 鍵が `!` 以外を指していても ② 値が `true` のような非オブジェクトでも
  // **例外は出ず、黙って breakDef 1 に落ちる**＝「定義した破壊強度が捨てられている」ことに
  // 誰も気づけない（爆弾の breakPower は 3 ∴ 1 でも 2 でも壊れる＝挙動の差が出ない）。
  // 2026-09-22 に実害を確認（キュー20b ④ 2F）：`dark_tower 2,1` は `6,11`/`7,11`＝
  // **外壁 '#' を 1 マスずれて指し**、値も `true` だった（本物の `!` は col10）。`4,2` の
  // `2,4` も `true`。どちらも e98217b の生成スクリプト由来で、既存の全検査が緑だった。
  // ※ 逆向き（`!` なのに breakableWalls に定義が無い）は既定 breakDef 1 で正しく動く
  //   ∴ 欠陥ではない（多くの部屋がそうなっている）。
  for (const [stageKey, stage] of Object.entries(stages)) {
    for (const [posKey, def] of Object.entries(stage.breakableWalls ?? {})) {
      const [r, c] = posKey.split(',').map(Number);
      const tile = tileAt(stage, r, c);
      if (tile !== '!') {
        err(`ステージ [${stageKey}] の breakableWalls[${posKey}] が壊せる壁 '!' を`
          + ` 指していない: '${tile}' ← 座標の嘘（定義した破壊強度が誰にも読まれない）`);
      }
      if (typeof def !== 'object' || def === null) {
        err(`ステージ [${stageKey}] の breakableWalls[${posKey}] の値が`
          + ` {breakDef} の形でない: ${JSON.stringify(def)}`
          + ` ← projectile.js は \`?.breakDef ?? 1\` で読む＝黙って既定 1 に落ちる`);
      }
    }
  }

  return issues;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const target = process.argv[2] || 'all';
// `all` の対象＝8ダンジョン ＋ dark_tower ＋ LAYER_KIND に載っている寄道。
// dark_tower は 2026-08-05 まで漏れていた（最終ダンジョンだけ無検査だった）。
// ⚠️ 寄道は `LAYER_KIND` に `side` として載せた分だけが対象。forest_cave / secret_grotto /
//    void_shrine は 2026-09-05（0v）に追加＝それまで3つとも無検査だった（既存の穴）。
const dungeons = target === 'all'
  ? Object.keys(d.layers).filter(l => l.startsWith('dungeon') || l === 'dark_tower' || LAYER_KIND[l] === 'side')
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
