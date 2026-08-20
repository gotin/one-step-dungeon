#!/usr/bin/env node
/**
 * migrate-field-lake-w-east.mjs  (Phase 9-6-BASE 外周解体 — 2番目の試作地域)
 *
 * Rebuilds the 7 塗り絵 screens EAST of the existing 13-screen 湖 W (§15) — the
 * lake's easternmost reach, the "最果て" as seen from the village. Same P1 島渡り
 * face as the existing lake, continued.
 *
 * REBUILT = 11,9 / 11,10 / 12,10 / 13,10 / 11,11 / 12,11 / 13,11 (no PRESERVED
 * screen here — unlike §15's 9,9, none of these 7 carry hand-authored content).
 *
 * Neighbours (all "land" for the hybrid rule — none of them are in REBUILT):
 *   - west  : the existing 13-screen lake (already rebuilt, §15)
 *   - south : 11,11 borders the existing 山地M cluster (⑥-7, already rebuilt)
 *   - north : 12,10 / 13,10 border the 雪S outer-ring annex (not yet reworked — 塗
 *     り絵, all-floor tiles; mirrors whatever is there today and gets re-mirrored
 *     when 雪S annex is authored, same as every other region hand-off in this repo)
 *   - east  : 13,10 / 13,11 border 深洋O アーム7 (already rebuilt, 2026-07-27)
 *
 * ── Water is bgTiles-only (2026-07-25 migration) ───────────────────────────────
 * §15 was authored BEFORE that migration — its ring/spine algorithm computes a
 * grid using WATER='~' as the tiles hard-block char, then later migrate-water-to-
 * bgtiles.mjs folded the '~' cells into bgTiles + tiles '.'. We build that way from
 * the start: `applyGrid()` below writes water cells to bgTiles['~'] + tiles['.'],
 * and everything else (floor/bridge/feature) to tiles as computed. Land bgTiles use
 * 'g' (grass) — same skin as the existing lake screens, for visual continuity.
 * Neighbour-openness reads (`cellTile` from connectivity.mjs) fold bgTiles water
 * too, so a neighbour whose water lives in bgTiles (any post-migration screen) is
 * judged correctly — §15's original `ns.tiles[nr]?.[nc]` read would silently see
 * "floor" on every neighbour cell whose water is in bgTiles (i.e. ALL of them) and
 * open every crossing, hiding real traps. This is the fix.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked, cellTile } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const ROWS = 10, COLS = 12;
const WATER = '~';
const V = 'v';       // wooden bridge
const I = '.';       // island floor

const REBUILT = new Set([
  '11,9', '11,10', '11,11',
  '12,10', '12,11',
  '13,10', '13,11',
]);

const S = (pattern, island = [], place = [], data = null) => ({ pattern, island, place, data });
const rupee = (v) => ({ type: 'rupee', value: v, name: `ルピー×${v}` });
const bigHeal = () => ({ type: 'item', item: 'bigHealPotion', name: '回復薬（大）' });

// Central 2×2 island (rows4,5 × cols5,6) is implicit on every screen. Extra island
// cells extend it for feature anchors / layout variety (never on a ring row/col).
const SCREENS = {
  // ══ P1 島渡り（既存湖の延長・装飾のみ差別化） ═══════════════════════════════
  // ⚠️ 2026-08-20 ユーザー指摘＝橋タイル連続は「畑」に見える（applyGrid で見た目
  // は plain floor に変換済み・下記の 't'/'f' は全部「水セル上の装飾」＝経路の
  // 外＝通行可能性に影響しない。既存湖(§15)の decorative islet と同じ作法。
  '11,9': S('P1', [[2, 5], [2, 6], [7, 5]], [
    [3, 3, 't'], [6, 8, 't'], [8, 3, 'f'], [1, 8, 'f'],
  ]),
  '11,10': S('P1', [[3, 5], [6, 6], [7, 6]], [
    [2, 8, 't'], [7, 3, 't'], [7, 8, 'f'], [2, 3, 'f'],
  ]),
  '12,10': S('P1', [[2, 6], [3, 6], [6, 5]], [
    [2, 3, 't'], [7, 8, 't'], [8, 2, 'f'], [1, 8, 'f'],
  ]),
  '12,11': S('P1', [[2, 5], [7, 6]], [
    [3, 8, 't'], [6, 3, 't'], [1, 2, 'f'], [8, 8, 'f'],
  ]),
  '13,10': S('P1', [[3, 5], [3, 6], [6, 6], [7, 6]], [
    [2, 8, 't'], [7, 3, 't'], [6, 2, 'f'], [1, 2, 'f'],
  ]),

  // ══ P3 小さな番人（既存9,8「湖心の番人」F+C×2とは構成を変える＝F1+C1） ═══════
  '11,11': S('P3', [[3, 5], [3, 6], [6, 6]], [
    [3, 5, 'F'], [6, 6, 'C'], [3, 6, 'B'], [1, 2, 'f'], [1, 8, 't'],
  ], {
    chest: { pos: '3,6', content: bigHeal() },
    show: { pos: '3,6', cond: { trigger: 'killAll', message: '⚔ 最果ての 番人を 退けた！宝箱が現れた！' } },
  }),

  // ══ P2 隙間越し回収＋最果ての看板（東は深洋Oに接する） ═══════════════════════
  '13,11': S('P2', [[6, 6]], [
    // ブーメラン隙間越し回収（所持済み・D2報酬）: a large-rupee 'R' on a water-ringed
    // islet, grabbed by throwing across the gap from the col-5/6 bridge band.
    [2, 6, 'R'], [3, 5, 'i'], [1, 2, 'f'], [2, 2, 't'],
  ], {
    sign: {
      pos: '3,5',
      name: '朽ちた道しるべ',
      lines: [
        'この先、水は 深く昏い。',
        '確かな 備えなくば 進むべからず。',
      ],
    },
  }),
};

// ── HYBRID ring rule (same as §15 — see migrate-field-lake-w.mjs for the design
//    rationale). The only change: neighbour-openness folds bgTiles water via
//    cellTile(), so post-2026-07-25 screens (all of them) are judged correctly. ──
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
function isStandard(axis, r, c) {
  return axis === 'v' ? (c === 5 || c === 6) : (r === 4 || r === 5);
}

// NOTE: an earlier draft treated "untouched 塗り絵" neighbours (雪S annex 12,9/
// 13,9・山地M annex 12,12/13,12 — all-floor, no authored content) as CLOSED, to
// avoid flooding this screen's interior with bridge. That's WRONG for this repo's
// seams/traps invariant: `field-invariants.spec.js` holds seams/traps at a HARD 0
// (achieved 2026-07-16, ⑥-trap) precisely because every prior region mirrored the
// neighbour's ACTUAL state (open tiles = open), even when the neighbour was still
// 塗り絵 — the neighbour's own future rework re-mirrors against whatever's built
// here (§16-1/§17-1 hand-off pattern). Closing against an open-but-未着手 neighbour
// creates the exact "reachable→reachable but walled" seam the ratchet forbids. So
// landOpen() reads the neighbour's REAL tiles, unconditionally — the "flooded with
// bridge" look this produces is a VISUAL issue (addressed with decoration density,
// not by fabricating a wall that doesn't exist on the neighbour's side).
function computeAllRings(field) {
  const rings = new Map();
  for (const key of REBUILT) rings.set(key, Array.from({ length: ROWS }, () => Array(COLS).fill(WATER)));

  const lakeOpenNow = (nk, nr, nc) => !isHardBlocked(rings.get(nk)[nr][nc]);
  const landOpen = (nk, nr, nc) => {
    const ns = field[nk];
    return ns ? !isHardBlocked(cellTile(ns, nr, nc)) : null;   // null = off-map
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const key of REBUILT) {
      const [sx, sy] = key.split(',').map(Number);
      const g = rings.get(key);
      for (const [r, c] of RING_CELLS) {
        // §15's lake corners are forced-water (2 crossings can't both be routed to
        // the island without a ring-lane paint). We DON'T inherit that here: every
        // corner in this 7-screen patch faces either an all-open completed region
        // (深洋Oアーム7・既存山地M — no walls on their border at all) or a still-塗
        // り絵 annex (all-floor tiles) — so forcing water would create a NEW mismatch
        // (open neighbour / closed corner) instead of avoiding one. Corners here use
        // the SAME mirror/skeleton rule as edges: open iff some crossing wants it and
        // none vetoes. A corner with a REBUILT-side crossing routes via bridge like
        // any other open ring cell (layBridge handles r===0/ROWS-1 and c===0/COLS-1
        // uniformly).
        let veto = false, want = false;
        for (const [nk, nr, nc, axis] of crossingsOf(sx, sy, r, c)) {
          if (rings.has(nk)) {
            if (isStandard(axis, r, c) || lakeOpenNow(nk, nr, nc)) want = true;
          } else {
            const open = landOpen(nk, nr, nc);
            if (open === null) continue;
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

const ISLAND_R = [4, 5], ISLAND_C = [5, 6];
function layBridge(g, r, c) {
  const midR = 4, midC = 5;
  if (c === 0 || c === COLS - 1) {
    const dir = c === 0 ? 1 : -1;
    for (let cc = c; cc !== midC; cc += dir) if (!isFloor(g[r][cc])) g[r][cc] = V;
    if (!isFloor(g[r][midC])) g[r][midC] = V;
    const dr = r <= midR ? 1 : -1;
    for (let rr = r; rr !== midR; rr += dr) if (!isFloor(g[rr][midC])) g[rr][midC] = V;
  } else {
    const dir = r === 0 ? 1 : -1;
    for (let rr = r; rr !== midR; rr += dir) if (!isFloor(g[rr][c])) g[rr][c] = V;
    if (!isFloor(g[midR][c])) g[midR][c] = V;
    const dc = c <= midC ? 1 : -1;
    for (let cc = c; cc !== midC; cc += dc) if (!isFloor(g[midR][cc])) g[midR][cc] = V;
  }
}
function isFloor(ch) { return !isHardBlocked(ch); }

function buildInterior(g, spec) {
  for (const r of ISLAND_R) for (const c of ISLAND_C) g[r][c] = I;
  for (const [r, c] of spec.island) {
    if (r <= 0 || r >= ROWS - 1 || c <= 0 || c >= COLS - 1)
      throw new Error(`island cell on ring @ ${r},${c}`);
    g[r][c] = I;
  }
  for (const [r, c] of RING_CELLS) if (isFloor(g[r][c])) layBridge(g, r, c);
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

// ── verification (walkable BFS from the central island) ───────────────────────
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
      const openable = ch === 'u';
      if (seen.has(k) || (isHardBlocked(ch) && !openable)) continue;
      seen.add(k); q.push([nr, nc]);
    }
  }
  return seen;
}

function assertScreen(g, key, spec) {
  const reach = walkReach(g, 4, 5);
  for (const [r, c] of RING_CELLS) {
    if (!isHardBlocked(g[r][c]) && !reach.has(`${r},${c}`))
      throw new Error(`open ring cell ${r},${c} unreachable on ${key} (would orphan neighbour)`);
  }
  for (const [r, c, ch] of spec.place) {
    if (!'ECFB'.includes(ch)) continue;
    if (!reach.has(`${r},${c}`))
      throw new Error(`feature '${ch}' @ ${r},${c} unreachable inside ${key}`);
  }
}

// ── apply ─────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

for (const k of REBUILT) if (!field[k]) throw new Error(`missing field stage ${k}`);
for (const k of Object.keys(SCREENS)) if (!REBUILT.has(k)) throw new Error(`bad spec key ${k} (not in REBUILT)`);
for (const k of REBUILT) if (!SCREENS[k]) throw new Error(`screen ${k} has no spec (would stay 塗り絵)`);

const rings = computeAllRings(field);

if (process.argv.includes('--rings')) {
  for (const [key, spec] of Object.entries(SCREENS)) {
    const g = rings.get(key).map((row) => row.slice());
    buildInterior(g, spec);
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

/** Convert the computed grid (WATER='~' / V='v' bridge as internal markers) into the
 *  engine's post-migration split. Water cells -> bgTiles '~' + tiles '.'.
 *  ⚠️ 2026-08-20 ユーザー指摘＝橋('v')のスプライトは単体では良いが連続配置すると
 *  「畑」に見える（板目/柱/柵の専用セルが無い＝タイルセット自体の不足）。この
 *  patch では橋タイルの見た目を「中央の標準骨格帯（row4,5・col5,6の十字）」だけ
 *  に絞る — connectivity 計算（ring/spine）はそのまま湖のハイブリッド規則に
 *  従うが、骨格帯の外側にある V（開いた ring cell から中央島まで伸びる橋の
 *  「腕」の広い部分）は描画ではプレーンな床 '.' にする。理由＝`GATE_TILES`
 *  （field-quality.mjs）が 'v' を「障害と解法」軸の判定材料にしている＝橋を
 *  全部消すと under-2-axis が悪化する（実測 76→82）。十字だけ残せば既存湖
 *  (§15) と同じ「渡って中心へ」という体験は保持しつつ、広い開放地の連続板目
 *  は消える。装飾（木/茂み/柵）は spec.place で個別に手動配置する（下記）。
 *  橋タイル自体の改善（板目中央/柱/柵専用セル）は別タスクへ切り出した
 *  （PLAN.md 参照）。 */
function applyGrid(stage, g) {
  const tiles = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
  const bg = {};
  const inSkeletonBand = (r, c) => r === 4 || r === 5 || c === 5 || c === 6;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = g[r][c];
      if (ch === WATER) {
        bg[`${r},${c}`] = '~';
        tiles[r][c] = '.';
      } else if (ch === V && !inSkeletonBand(r, c)) {
        bg[`${r},${c}`] = 'g';
        tiles[r][c] = '.';               // plain grass floor, not the bridge sprite
      } else {
        bg[`${r},${c}`] = 'g';
        tiles[r][c] = ch;                 // features (F/C/B/R/i/t/u/f) pass through
      }
    }
  }
  stage.tiles = tiles;
  stage.bgTiles = bg;
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

  applyGrid(stage, g);

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

// ── guard: NO arrival-wall hole sourced from any rebuilt screen (bgTiles-aware) ─
{
  const holes = [];
  for (const key of REBUILT) {
    const [sx, sy] = key.split(',').map(Number);
    const stage = field[key];
    for (const [r, c] of RING_CELLS) {
      if (isHardBlocked(cellTile(stage, r, c))) continue;
      for (const [nk, nr, nc] of crossingsOf(sx, sy, r, c)) {
        const ns = field[nk];
        if (!ns) continue;
        if (isHardBlocked(cellTile(ns, nr, nc)))
          holes.push(`${key}(${r},${c}) → ${nk}(${nr},${nc})=${cellTile(ns, nr, nc)}`);
      }
    }
  }
  if (holes.length)
    throw new Error(`east-lake sources ${holes.length} arrival-wall hole(s):\n  ${holes.join('\n  ')}`);
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

console.log(`\n9-6-BASE 湖W東拡張: ${touched} screens rebuilt${DRY ? ' [DRY — not written]' : ''}`);
