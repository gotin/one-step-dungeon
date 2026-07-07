#!/usr/bin/env node
/**
 * migrate-field-desert.mjs  (Phase 9-6 ⑥ — 2nd region, 1枚ずつ作り込む)
 *
 * Rebuilds the 14 "塗り絵" desert (D-zone) screens in the SW into the region's
 * ideal form. Desert's FACE is P2 遺跡/秘密 (secrets), the mirror-image of the
 * forest's P1 maze face — so this validates the §8 density basis on a genuinely
 * different pattern mix (see FIELD-9-6-DESIGN.md §9).
 *
 * The D2 gateway screen (2,15, mapEnters→dungeon_2 + 石碑 NPC) is DELIBERATELY
 * left as-is — touching it risks the warp / the guide sign (same as forest 2,4).
 *
 * ── Connectivity invariant — the DESERT rule is the INVERSE of the forest ─────
 * The forest was tree-dense with borders already narrowed to cols5,6/rows4,5, so
 * a narrow floor cross-backbone was safe. The desert is the opposite: every
 * screen's border ring is fully-walkable open sand 'd', AND the grassland (G)
 * neighbours are open too. Narrowing desert borders the forest way would PUNCH
 * NEW SEAMS into the open grassland (step G→D, land on a wall).
 *
 * So desert uses "MIRROR THE NEIGHBOUR":
 *   - side neighbour missing (map EDGE)            → whole side = 'M' mesa cliff
 *   - neighbour is another rebuilt DESERT screen   → whole side = floor (force open)
 *   - neighbour is anything else (grassland / W1)  → per-cell mirror of its facing
 *       edge: floor where the neighbour cell is walkable, 'M' where it is a wall
 *       (a W1 all-wall neighbour mirrors to an all-'M' side automatically).
 * Proof it adds no seam: for every non-corner ring cell, "I am walkable ⟺ my
 * neighbour's facing cell is walkable" — so you can never step off an open edge
 * onto a wall (no seam) and never from an open neighbour onto our wall. Corners
 * are always 'M' (you cannot cross diagonally, so they carry no transition).
 * As a bonus it REMOVES the one desert-origin seam 2,14→2,13 (grassland 2,13's
 * bottom col8 is a bush) by mirroring that wall. seam 89→88.
 *
 * Content lives strictly in the interior (rows1-8 × cols1-10); row1/row8/col1/
 * col10 are kept as a floor "moat" so every open ring cell reconnects through it.
 * Each screen is BFS-asserted (all open ring cells reachable + all combat/chest
 * features reachable) and dup-asserted before write.
 *
 * ── Tool-timing (§9-2) ────────────────────────────────────────────────────────
 * Desert is D2's region = the EARLIEST dungeon area. Arriving, the player owns
 * only {sword, wooden shield}. The only preview you can "try now" is the
 * tool-free 石押し block puzzle (*→S button→T gate), placed at 2,14 next to the
 * D2 entrance (previews the dungeon's stone puzzles — 4-4 石押し=序盤全般). Every
 * '!' bomb-wall is a "come back later" near-cut (bomb is D6's reward), never
 * required for progression (§8-1 general rule).
 *
 * bgTiles (desert 'd' sand) untouched. Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const ROWS = 10, COLS = 12;
const FLOOR = '.';
const WALL = 'M'; // mesa/rock (hard-blocked, counts as INTERNAL_TERRAIN → route axis)

const DESERT = new Set([
  '0,12', '0,13', '1,13', '0,14', '1,14', '2,14', '0,15', '1,15',
  '2,15', '0,16', '1,16', '2,16', '3,16', '1,17', '2,17',
]);
const PRESERVE = new Set(['2,15']); // D2 gateway — do not touch

// ── per-screen specs (14 screens; 2,15 D2-gateway excluded) ───────────────────
// place: [r,c,ch] interior placements (M/#/o/!/*/S/T/B/i/E/C/F). Everything else
// in the interior is floor sand. data: chest / show(condition) / sign / links.
const S = (pattern, place = [], data = null) => ({ pattern, place, data });

const SCREENS = {
  // ── P4 ランドマーク (o stone-floor plaza + i石碑) ──
  '1,13': S('P4', [
    // 砂に埋もれた遺跡広間
    [2, 4, '#'], [2, 5, '#'], [2, 6, '#'], [2, 7, '#'],
    [3, 4, 'o'], [3, 5, 'o'], [3, 6, 'o'], [3, 7, 'o'],
    [4, 4, 'o'], [4, 5, 'o'], [4, 6, 'o'], [4, 7, 'i'],
    [5, 4, '#'], [5, 7, '#'],
    [6, 3, 'M'], [6, 8, 'M'], [3, 3, 'M'],
  ], { sign: { pos: '4,7', name: '砂の石碑', lines: ['「水を求めし旅人よ、東の湖を目指せ」', '文字の半分は 砂に磨り消されている。'] } }),

  '3,16': S('P4', [
    // 世界の縁に近い大遺跡（南は世界の果て＝W1）
    [2, 4, '#'], [2, 6, '#'], [2, 8, '#'],
    [3, 4, 'o'], [3, 5, 'o'], [3, 6, 'o'], [3, 7, 'o'], [3, 3, 'i'],
    [4, 4, 'o'], [4, 5, 'B'], [4, 6, 'o'], [4, 7, 'o'],
    [5, 4, '#'], [5, 6, '#'], [5, 8, '#'],
    [6, 4, 'E'], [6, 7, 'C'], [2, 7, 'E'],
  ], {
    chest: { pos: '4,5', content: { type: 'rupee', value: 50, name: 'ルピー×50' } },
    show: { pos: '4,5', cond: { trigger: 'killAll', message: '🏛 守り手を退けると遺跡の宝が現れた！' } },
    sign: { pos: '3,3', name: '古の戦の碑', lines: ['ここは かつての戦場。', '砂の下に 数多の兵が眠るという。'] },
  }),

  // ── P3 狩り場/関門 (combat) ──
  '1,14': S('P3', [
    [3, 3, 'M'], [5, 8, 'M'], [2, 4, 'E'],
    [4, 5, 'F'],          // 騎士（精鋭）が宝を守る
    [3, 7, '#'], [5, 7, '#'], [4, 8, '#'],
    [4, 7, 'B'],          // gated by the sentry (killAll)
  ], {
    chest: { pos: '4,7', content: { type: 'item', item: 'healPotion', name: '回復薬（小）' } },
    show: { pos: '4,7', cond: { trigger: 'killAll', message: '⚔ 騎士を討ち取ると宝箱が現れた！' } },
  }),

  '2,16': S('P3', [
    [2, 5, 'M'], [6, 5, 'M'],
    [3, 4, 'F'], [5, 7, 'F'], [3, 7, 'C'], [5, 4, 'C'],  // gauntlet
    [4, 5, 'B'],
  ], {
    chest: { pos: '4,5', content: { type: 'rupee', value: 30, name: 'ルピー×30' } },
    show: { pos: '4,5', cond: { trigger: 'killAll', message: '🛡 精鋭を全て退けた！宝箱が現れた！' } },
  }),

  // ── P1 分岐/迷路 (route + …) ──
  '0,14': S('P1', [
    // メサ回廊の分岐 + 爆弾近道 #1（再訪＝砂漠では未所持なので任意）
    [2, 6, 'M'], [3, 6, 'M'], [6, 6, 'M'], [7, 6, 'M'],   // vertical mesa maze (gaps @rows4,5)
    // sealed bomb niche: B reachable ONLY through '!' below it (approach @6,4).
    [3, 4, 'M'], [4, 3, 'M'], [4, 5, 'M'], [5, 4, '!'], [4, 4, 'B'],
    [2, 3, 'i'],
  ], {
    chest: { pos: '4,4', content: { type: 'rupee', value: 20, name: 'ルピー×20' } },
    sign: { pos: '2,3', name: '爆ぜた岩の跡', lines: ['この岩壁、火薬の匂いがする。', '砕く力があれば 奥へ行けそうだ。'] },
  }),

  '0,15': S('P1', [
    // 岩迷路 + 石（秘密）
    [2, 3, 'M'], [2, 4, 'M'], [3, 6, 'M'], [4, 3, 'M'],
    [4, 4, 'M'], [5, 6, 'M'], [6, 7, 'M'], [6, 8, 'M'],
    [4, 7, '*'],
  ]),

  '1,16': S('P1', [
    // 十字路ハブ + 道標
    [2, 2, 'M'], [2, 3, 'M'], [2, 8, 'M'], [2, 9, 'M'],
    [7, 2, 'M'], [7, 3, 'M'], [7, 8, 'M'], [7, 9, 'M'],
    [4, 4, 'i'], [5, 7, '*'],
  ], { sign: { pos: '4,4', name: '砂漠の道標', lines: ['北 … 村への道', '東 … 砂漠の神殿', '南 … 世界の縁（引き返せ）'] } }),

  '2,17': S('P1', [
    // 世界の縁のメサ迷路 + 精鋭が宝を守る（南・右は世界の果て＝W1）
    [3, 5, 'M'], [3, 6, 'M'], [6, 6, 'M'], [2, 4, '*'],
    [4, 7, 'F'],           // 精鋭
    [5, 4, 'B'],           // killAll-sealed
  ], {
    chest: { pos: '5,4', content: { type: 'rupee', value: 20, name: 'ルピー×20' } },
    show: { pos: '5,4', cond: { trigger: 'killAll', message: '⚔ 縁の守り手を退けた！宝箱が現れた！' } },
  }),

  // ── P2 秘密 (顔・secret) ──
  '2,14': S('P2', [
    // 石押し予告編：*を押してSボタンに乗せるとTゲートが開き宝へ（道具不要）
    [3, 6, 'T'], [2, 7, 'M'], [4, 7, 'M'], [3, 8, 'M'], [2, 6, 'M'],  // niche around (3,7)
    [3, 7, 'B'],
    [6, 3, '*'], [6, 5, 'S'],   // push * right along row6 onto S
    [2, 3, 'i'],
  ], {
    links: [{ switchId: '6,5', gateId: '3,6' }],
    chest: { pos: '3,7', content: { type: 'rupee', value: 20, name: 'ルピー×20' } },
    sign: { pos: '2,3', name: '風化した立札', lines: ['「石を 印の上へ 運ぶべし」', '古の民は 力ではなく 知恵で扉を開いた。'] },
  }),

  '0,12': S('P2', [
    // 岩門アーチ + 石押しで暴く隠し（道具不要＝今取れる）
    [2, 5, 'M'], [2, 6, 'M'], [3, 5, 'M'], [3, 6, 'M'],  // 岩門アーチ
    // sealed niche: B at (5,8) reachable only past button-gate. Simpler: '*' push
    // reveals nothing structural here — use a killAll-sealed chest instead.
    [5, 7, 'M'], [5, 9, 'M'], [4, 8, 'M'], [6, 8, 'B'],  // niche open only from below (6,8 approached @7,8)
    [5, 4, '*'],
    [3, 8, 'E'], [6, 4, 'C'],
  ], {
    chest: { pos: '6,8', content: { type: 'rupee', value: 15, name: 'ルピー×15' } },
    show: { pos: '6,8', cond: { trigger: 'killAll', message: '🏺 砂の番兵を倒すと宝箱が現れた！' } },
  }),

  '0,13': S('P2', [
    // 遺跡 + killAll宝 + 爆弾近道 #2（sealed: B(5,3) reachable only via '!'(5,4))
    [2, 5, '#'], [3, 5, '#'], [2, 7, '#'], [3, 7, '#'],
    [4, 3, 'M'], [6, 3, 'M'], [5, 2, 'M'], [5, 4, '!'], [5, 3, 'B'],  // sealed bomb niche
    [4, 7, 'B'],           // killAll-sealed
    [6, 6, 'E'], [6, 8, 'C'], [4, 3, 'M'],
    [2, 9, 'i'],
  ], {
    chest: { pos: '5,3', content: { type: 'rupee', value: 15, name: 'ルピー×15' } },
    chest2: { pos: '4,7', content: { type: 'rupee', value: 20, name: '隠しルピー×20' } },
    show: { pos: '4,7', cond: { trigger: 'killAll', message: '🏺 番兵を倒すと遺跡に宝が現れた！' } },
    sign: { pos: '2,9', name: '崩れた門柱', lines: ['右手の岩、脆く 罅が入っている。', '砕けば 何かが眠っていそうだ。'] },
  }),

  '1,15': S('P2', [
    // 遺跡 + 精鋭が守る宝（killAll）
    [2, 4, 'M'], [2, 5, 'M'], [6, 7, 'M'], [6, 8, 'M'],
    [3, 7, 'M'], [5, 7, 'M'], [4, 8, 'M'], [4, 7, 'B'],  // niche open only from (4,6)
    [5, 5, 'F'],           // 精鋭 → combat（宝を守る）
    [3, 3, 'E'],
  ], {
    chest: { pos: '4,7', content: { type: 'item', item: 'healPotion', name: '回復薬（小）' } },
    show: { pos: '4,7', cond: { trigger: 'killAll', message: '⚔ 遺跡の守り手を倒した！宝箱が現れた！' } },
  }),

  '0,16': S('P2', [
    // 世界の縁の半埋没遺跡（南＝世界の果て W1）
    [4, 4, '#'], [4, 5, '#'],
    [5, 4, 'o'], [5, 5, 'o'], [6, 4, 'o'], [6, 5, 'o'],  // 半分砂に埋もれた石畳
    [3, 7, '*'], [2, 3, 'M'],
  ]),

  '1,17': S('P2', [
    // 砂漠深部 石（秘密） + 精鋭が守る宝（killAll・B は開けた床＝killAll でその場に出現）
    [4, 4, '*'], [2, 5, 'M'], [6, 3, 'M'],
    [4, 7, 'M'], [6, 7, 'M'], [5, 8, 'M'],   // partial ruins framing (B stays open @5,7 via 5,6)
    [5, 7, 'B'],
    [3, 6, 'F'],           // 精鋭 → combat
    [6, 8, 'E'],
  ], {
    chest: { pos: '5,7', content: { type: 'rupee', value: 15, name: 'ルピー×15' } },
    show: { pos: '5,7', cond: { trigger: 'killAll', message: '⚔ 砂漠の主を退けた！宝箱が現れた！' } },
  }),
};

// ── builders ──────────────────────────────────────────────────────────────────
function mirrorRing(field, key) {
  // Interior floor; every RING cell (corners included) computed by the mirror
  // rule so that "I am walkable ⟺ the neighbour across each crossing is
  // walkable". A ring cell participates in one crossing (edge cell) or two
  // (corner cell — e.g. [0,0] crosses UP at col0 and LEFT at row0). For each
  // applicable crossing we read the neighbour's FACING cell:
  //   - map edge (no neighbour)            → no constraint
  //   - rebuilt DESERT neighbour           → open (both sides forced floor)
  //   - grassland / W1 / preserved gateway → mirror walkable(facing cell)
  // The cell is walkable iff ANY crossing demands it open (opening satisfies the
  // open-neighbour crossing without seam; the other crossing, if it faces a wall,
  // is either a W1 dest (excluded from seam counting) or the same wall mirrored).
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(FLOOR));
  const [sx, sy] = key.split(',').map(Number);

  // crossings that a ring cell (r,c) takes part in → [neighbourKey, facing r,c].
  const crossingsAt = (r, c) => {
    const out = [];
    if (r === 0) out.push([`${sx},${sy - 1}`, ROWS - 1, c]);          // up
    if (r === ROWS - 1) out.push([`${sx},${sy + 1}`, 0, c]);          // down
    if (c === 0) out.push([`${sx - 1},${sy}`, r, COLS - 1]);          // left
    if (c === COLS - 1) out.push([`${sx + 1},${sy}`, r, 0]);          // right
    return out;
  };

  const ringCells = [];
  for (let c = 0; c < COLS; c++) { ringCells.push([0, c]); ringCells.push([ROWS - 1, c]); }
  for (let r = 1; r < ROWS - 1; r++) { ringCells.push([r, 0]); ringCells.push([r, COLS - 1]); }

  for (const [r, c] of ringCells) {
    let open = false, constrained = false;
    for (const [nk, nr, nc] of crossingsAt(r, c)) {
      const ns = field[nk];
      if (!ns) continue;                 // map edge → no crossing constraint
      constrained = true;
      if (DESERT.has(nk)) { open = true; continue; }  // desert–desert: both floor
      if (!isHardBlocked(ns.tiles[nr]?.[nc])) open = true;  // neighbour open here
    }
    g[r][c] = (constrained && open) ? FLOOR : WALL;  // edge-only or all-wall → mesa
  }
  return g;
}

function placeAll(g, place) {
  for (const [r, c, ch] of place) {
    if (r <= 0 || r >= ROWS - 1 || c <= 0 || c >= COLS - 1)
      throw new Error(`feature on ring @ ${r},${c} (interior only)`);
    g[r][c] = ch;
  }
}

// ── verification ────────────────────────────────────────────────────────────
/** Walkable-cell BFS; hard-blocked tiles block. Solvable gates ('!','T','B') pass
 *  (mirrors connectivity.mjs: reachable once you have the tool / open the gate). */
function walkReach(g, sr, sc) {
  const seen = new Set([`${sr},${sc}`]);
  const q = [[sr, sc]];
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const k = `${nr},${nc}`;
      if (seen.has(k) || isHardBlocked(g[nr][nc])) continue;
      seen.add(k); q.push([nr, nc]);
    }
  }
  return seen;
}

function assertScreen(g, key, place) {
  // seed on the moat (1,1) — always floor by construction.
  if (isHardBlocked(g[1][1])) throw new Error(`moat seed (1,1) blocked on ${key}`);
  const reach = walkReach(g, 1, 1);
  // every OPEN ring cell must be reachable (else it orphans the neighbour it faces).
  for (let c = 0; c < COLS; c++) {
    for (const r of [0, ROWS - 1]) {
      if (!isHardBlocked(g[r][c]) && !reach.has(`${r},${c}`))
        throw new Error(`open ring cell ${r},${c} unreachable on ${key} (would orphan neighbour)`);
    }
  }
  for (let r = 0; r < ROWS; r++) {
    for (const c of [0, COLS - 1]) {
      if (!isHardBlocked(g[r][c]) && !reach.has(`${r},${c}`))
        throw new Error(`open ring cell ${r},${c} unreachable on ${key} (would orphan neighbour)`);
    }
  }
  // combat/chest features must be reachable on foot (else dead content).
  for (const [r, c, ch] of place) {
    if ('ECFB'.includes(ch) && !reach.has(`${r},${c}`))
      throw new Error(`feature '${ch}' @ ${r},${c} unreachable inside ${key}`);
  }
}

// ── apply ─────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

// sanity: every DESERT key exists, PRESERVE not in SCREENS.
for (const k of DESERT) if (!field[k]) throw new Error(`missing desert stage ${k}`);
for (const k of PRESERVE) if (SCREENS[k]) throw new Error(`${k} is preserved but has a spec`);
for (const k of Object.keys(SCREENS)) if (!DESERT.has(k) || PRESERVE.has(k)) throw new Error(`bad spec key ${k}`);

const seenLayouts = new Map();
let touched = 0;

for (const [key, spec] of Object.entries(SCREENS)) {
  const stage = field[key];
  if (stage.rows !== ROWS || stage.cols !== COLS)
    throw new Error(`unexpected size on ${key}: ${stage.rows}x${stage.cols}`);

  const g = mirrorRing(field, key);
  placeAll(g, spec.place);
  assertScreen(g, key, spec.place);

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

// ── guard: no rebuilt screen may leave an 'i' sign tile without a body ────────
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

// ── guard: every chestContents key must sit on a 'B' tile (else orphan data) ──
for (const key of Object.keys(SCREENS)) {
  const stage = field[key];
  for (const pk of Object.keys(stage.chestContents)) {
    const [r, c] = pk.split(',').map(Number);
    if (stage.tiles[r][c] !== 'B')
      throw new Error(`chestContents on ${key} @ ${pk} not on a 'B' tile (=${stage.tiles[r][c]})`);
  }
}

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── report the density basis ─────────────────────────────────────────────────
const byPat = {};
for (const spec of Object.values(SCREENS)) byPat[spec.pattern] = (byPat[spec.pattern] || 0) + 1;
console.log(`9-6 ⑥ desert region: ${touched} screens rebuilt (2,15 D2-gateway preserved).`);
console.log('pattern 配分:', JSON.stringify(byPat));
