#!/usr/bin/env node
/**
 * migrate-secret-grotto-silver-sword.mjs
 *   秘密の洞窟（secret_grotto）を拡張し、**銀の剣（swordTier 2）** を置く。
 *   ⚠️ 2026-09-05 までこの寄道は無名で、当時の記述は `dungeon_7` の実名「空中の遺跡」を
 *      借りていた（名前の確定＝`scripts/migrate-secret-grotto-name.mjs`）。
 *
 * 背景（PLAN「剣のtier強化」／キュー8番の一部）:
 *   ライブマップに存在する剣は field 7,14 の floorItems「木の剣（tier0）」1本だけで、
 *   SWORD_TIERS（shared/items.js）の 1〜3 は誰も手に入れられなかった。その tier2＝銀の剣を
 *   「笛でしか入れない終盤の寄道」である secret_grotto に置く（ロア【秘密の洞窟】＝笛所持後
 *   にしか来られない∴全道具前提のパズルを置ける唯一の場所）。
 *
 * 作るもの（既存 0,0 は宝箱ルピー30の小部屋のまま・東の壁を1マス開けるだけ）:
 *   1,0 「断たれた歩廊」＝道具3つの直列パズル。
 *        爆弾で '!'(3,2) を割って北の射座へ入り → 弓で列 2 を撃ち 隔離された 'Y'(2,6) を叩き →
 *        links で門 'T'(5,10) が開く。東西は col5 の穴で断たれ、**渡れるのは (7,5) の1セルだけ**
 *        （はしご）＝はしご・爆弾・弓のどれが欠けても出口 (5,11) に立てない。
 *   2,0 「銀の玉座」＝盾騎士2・術士・剣獣（脅威度 33.5）を全滅させると封印が解ける宝箱。
 *        中身 { type:'weapon', swordTier:2 }（grantReward の 'weapon' 分岐＝game/player.js:733）。
 *
 * 自己検証（このスクリプトは検証込みで1本＝流し込みだけの migrate にしない）:
 *   ① 幾何：はしごで渡れる穴が (7,5) の1セル1軸だけ／'Y' に隣接できるセルが無い／
 *      東側から 'Y' へ矢の直線が通らない／(5,11) へ行くには 'T'(5,10) を通るしかない／
 *      北の射座へ入る口は '!'(3,2) だけ／全ての開いた外周セルの着地先が歩ける。
 *   ② 状態空間（scripts/lib/blade-solver.mjs＝実エンジンの遷移の写し）:
 *      - 入口 (5,0) から出口 (5,11) に立てる（＝解ける）
 *      - どの到達状態からも入口 (5,0) へ戻れる（＝入って詰まない）
 *      - 対照実験3本で「3つとも必須（飾りでない）」を示す:
 *          a. はしご無し           → (5,11) に立てない
 *          b. 道具封じ（爆弾/弓無し） → (5,11) に立てない
 *          c. 壁を割れない硬さ(99)   → (5,11) に立てない（弓だけでは射座に入れない）
 *          d. 壁を最初から壊した状態＋道具封じ → (5,11) に立てない（＝弓が必須）
 *   ③ 玉座の間：敵は素の床の上・入口の着地セル (5,0)/(5,1) を塞がない／向き別スプライトの
 *      敵には enemyDirs がある／宝箱セルに killAll の封印がある／宝箱まで歩いて届く。
 *
 * 使い方: node scripts/migrate-secret-grotto-silver-sword.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked } from './lib/connectivity.mjs';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

// ── 盤面 ────────────────────────────────────────────────────────────────────
// '#' 壁 / '.' 床 / 'x' 穴（はしごで幅1だけ渡れる）/ 'Y' スイッチ（武器・矢で叩く）/
// 'T' 門（links で開く）/ '!' 爆弾壁 / 'i' 石碑 / 'B' 宝箱 / 'ζημ' 敵。
//
// 1,0「断たれた歩廊」
//   西 col1-4 が上下2つに割れている（row3 の壁・唯一の口が '!'(3,2)）。
//   北 rows1-2 が射座＝ここから列 2 を東へ撃つと穴 3枚を飛び越えて 'Y'(2,6) に当たる。
//   'Y' は四方が穴/壁＝**剣で叩けない**（隣に立てない）。東側からは (2,7) の壁が矢を止める。
//   東西を断つ col5 の穴のうち、両隣が陸なのは (7,5) だけ＝はしごの橋はここ1本。
const ROOM_B = {
  title: '断たれた歩廊',
  tiles: [
    '############',
    '#....xx....#',
    '#..xxxY#...#',
    '##!##xx....#',
    '#....x#....#',
    '.....xx...T.',
    '#....xx....#',
    '#i...x.....#',
    '#....xx....#',
    '############',
  ],
  links: [{ switchId: '2,6', gateId: '5,10' }],
  breakableWalls: { '3,2': { breakDef: 2 } },
  npcData: {
    '7,1': {
      name: '石碑',
      lines: [
        '【断たれた歩廊】',
        '歩廊は 深い裂け目に断たれた。',
        '向こう岸の 錠は 手では届かぬ。',
        '遠矢のみが これを打てる。',
      ],
    },
  },
  entry: '5,0',
  exit: '5,11',
  ladderBridge: { cell: '7,5', axis: 'h' },
  gate: '5,10',
  toggle: '2,6',
  bombWall: '3,2',
};

// 2,0「銀の玉座」＝報酬部屋。北の壁龕（rows1-2 cols5-7）に石碑と宝箱。
//   盾騎士 ζ は正面を弾く∴入口(西)を向いた (5,5) と 壁龕の口を向いた (3,6) に置き、
//   どちらも上下から回り込める（周囲2マス以上の空きを確保）。
const ROOM_C = {
  title: '銀の玉座',
  tiles: [
    '############',
    '#...#iB.#..#',
    '#...#...#..#',
    '#.....ζ....#',
    '#..........#',
    '.....ζ.....#',
    '#..........#',
    '#..μ....η..#',
    '#..........#',
    '############',
  ],
  chest: '1,6',
  chestContents: { type: 'weapon', swordTier: 2 },
  enemyDirs: { '3,6': 'down', '5,5': 'left', '7,3': 'right' },
  npcData: {
    '1,5': {
      name: '石碑',
      lines: [
        '【銀の玉座】',
        '雲の上に 取り残された 王の間。',
        '守り手を すべて討ち倒した者にのみ',
        '銀の剣は 鞘を離れる。',
      ],
    },
  },
  entry: '5,0',
};

// 既存 0,0 の東の壁をここだけ開ける（1,0 の入口 (5,0) と向かい合う）。
const ROOM_A_OPEN = '5,11';

// ── 小道具 ──────────────────────────────────────────────────────────────────
const key = (r, c) => `${r},${c}`;
const parse = (rows, label) => {
  if (rows.length !== ROWS) throw new Error(`${label}: 行数が ${rows.length}（${ROWS} でない）`);
  return rows.map((row, r) => {
    if (row.length !== COLS) throw new Error(`${label}: row${r} の列数が ${row.length}`);
    return [...row];
  });
};
/** 徒歩で立てるか（穴/壁/石碑/敵タイル等は false）。実エンジン tilePassable の保守側の写し。 */
const walkable = (tiles, r, c) => {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  const ch = tiles[r][c];
  if (ch === TILE.GATE) return false;             // 閉じている門は歩けない
  if (ch === TILE.BREAKABLE_WALL) return false;   // 未破壊の壁
  if (ENEMY_META[ch]) return true;                // 敵は床の上に立っている
  return !isHardBlocked(ch);
};
/** はしごの橋脚（穴/水でない・立てるセル）。game/passable.js isLadderBank と同じ規則。 */
const isBank = (tiles, r, c) => {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  if (tiles[r][c] === TILE.PIT) return false;
  return walkable(tiles, r, c);
};

// ── ① 幾何の検査 ───────────────────────────────────────────────────────────
function checkGeometryB(tiles) {
  const fail = (m) => { throw new Error(`1,0: ${m}`); };

  // (a) はしごで渡れる穴は設計した1セル1軸だけ。
  const bridges = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (tiles[r][c] !== TILE.PIT) continue;
    if (isBank(tiles, r, c - 1) && isBank(tiles, r, c + 1)) bridges.push(`${r},${c}:h`);
    if (isBank(tiles, r - 1, c) && isBank(tiles, r + 1, c)) bridges.push(`${r},${c}:v`);
  }
  const want = `${ROOM_B.ladderBridge.cell}:${ROOM_B.ladderBridge.axis}`;
  if (bridges.join(' ') !== want)
    fail(`はしごで渡れる穴が [${bridges.join(' ')}]＝設計は ${want} の1本だけのはず`);

  // (b) 'Y' は剣で叩けない（四方に立てるセルが無い）。
  const [yr, yc] = ROOM_B.toggle.split(',').map(Number);
  if (tiles[yr][yc] !== TILE.SWITCH) fail(`${ROOM_B.toggle} が 'Y' でない`);
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (walkable(tiles, yr + dr, yc + dc))
      fail(`'Y' の隣 ${key(yr + dr, yc + dc)} に立てる＝剣で叩けてしまう（弓が飾りになる）`);
  }

  // (c) 東側（col>=7）から 'Y' へ矢の直線が通らない。矢を止めるのは壁と未破壊 '!' だけ。
  const arrowHitsY = (r0, c0, dr, dc) => {
    let r = r0 + dr, c = c0 + dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      const ch = tiles[r][c];
      if (ch === TILE.SWITCH) return r === yr && c === yc;
      if (ch === TILE.WALL || ch === TILE.BREAKABLE_WALL) return false;
      r += dr; c += dc;
    }
    return false;
  };
  const shooters = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!walkable(tiles, r, c)) continue;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (arrowHitsY(r, c, dr, dc)) shooters.push(key(r, c));
    }
  }
  if (!shooters.length) fail(`'Y' を撃てるセルが1つも無い＝解けない`);
  if (shooters.some((s) => Number(s.split(',')[1]) >= 7))
    fail(`東側から 'Y' を撃てる（${shooters.join(' ')}）＝門を開けてから渡る順序が崩れる`);

  // (d) 出口 (5,11) の手前は門だけ＝門を開けないと出られない。
  const [er, ec] = ROOM_B.exit.split(',').map(Number);
  const [gr, gc] = ROOM_B.gate.split(',').map(Number);
  if (tiles[gr][gc] !== TILE.GATE) fail(`${ROOM_B.gate} が 'T' でない`);
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nr = er + dr, nc = ec + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
    if (nr === gr && nc === gc) continue;
    if (walkable(tiles, nr, nc)) fail(`出口 ${ROOM_B.exit} に門を通らず隣接できる（${key(nr, nc)}）`);
  }

  // (e) 北の射座への口は '!' だけ＝爆弾が必須。'!' を壁に戻した盤面で射座が孤立すること。
  const [br, bc] = ROOM_B.bombWall.split(',').map(Number);
  if (tiles[br][bc] !== TILE.BREAKABLE_WALL) fail(`${ROOM_B.bombWall} が '!' でない`);
  const sealed = tiles.map((row) => row.slice());
  sealed[br][bc] = TILE.WALL;
  const reach = walkBFS(sealed, ROOM_B.entry);
  for (const s of shooters) if (reach.has(s)) fail(`'!' を割らずに射座 ${s} へ入れる＝爆弾が飾り`);
}

/** はしご込みの徒歩到達（穴は幅1の橋だけ渡る・門は閉じたまま）。 */
function walkBFS(tiles, startKey) {
  const seen = new Set([startKey]);
  const q = [startKey];
  while (q.length) {
    const [r, c] = q.shift().split(',').map(Number);
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const k = key(nr, nc);
      if (seen.has(k)) continue;
      const ch = tiles[nr][nc];
      if (ch === TILE.PIT) {
        const axisOk = dr === 0
          ? isBank(tiles, nr, nc - 1) && isBank(tiles, nr, nc + 1)
          : isBank(tiles, nr - 1, nc) && isBank(tiles, nr + 1, nc);
        if (!axisOk) continue;
      } else if (!walkable(tiles, nr, nc)) continue;
      seen.add(k); q.push(k);
    }
  }
  return seen;
}

// ── ② 状態空間の検査 ───────────────────────────────────────────────────────
/** 到達状態集合と、逆辺（詰み判定用）を返す。 */
function explore(S, startKey) {
  const [r, c] = startKey.split(',').map(Number);
  const start = S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
  const seen = new Set([start]);
  const rev = new Map();
  const q = [start];
  let guard = 0;
  while (q.length) {
    if (++guard > 2000000) throw new Error('状態空間が大きすぎる（設計を単純に）');
    const st = q.shift();
    for (const nx of S.nextStates(st)) {
      if (!rev.has(nx)) rev.set(nx, []);
      rev.get(nx).push(st);
      if (seen.has(nx)) continue;
      seen.add(nx); q.push(nx);
    }
  }
  return { seen, rev, start };
}
const cellsOf = (seen) => new Set([...seen].map((st) => st.split('|')[0]));

function checkSolvableB(tiles) {
  const bg = tiles.map((row) => row.map(() => TILE.FLOOR));   // 下地は素の床（水は無い）
  const links = ROOM_B.links.map((l) => [l.switchId, [l.gateId]]);
  const breaks = Object.fromEntries(
    Object.entries(ROOM_B.breakableWalls).map(([k, v]) => [k, v.breakDef]));
  const opt = { pitCrossable: true };

  // (a) 解ける＝出口セルに立てる。
  const S = makeSolver(tiles, bg, links, breaks, new Set(), opt);
  const { seen, rev } = explore(S, ROOM_B.entry);
  if (!cellsOf(seen).has(ROOM_B.exit))
    throw new Error(`1,0: 出口 ${ROOM_B.exit} に実手順で届かない＝解けない`);

  // (b) 入って詰まない＝どの到達状態からも入口セルに立つ状態へ戻れる。
  //     ※ exitCells（出口も含む）ではなく **入口** で測る＝「先へ進めるから詰みでない」を
  //        逃げ道にしない（報酬部屋は行き止まり∴戻れることが本当の安全条件）。
  const back = new Set();
  const rq = [];
  for (const st of seen) if (st.split('|')[0] === ROOM_B.entry) { back.add(st); rq.push(st); }
  while (rq.length) {
    const st = rq.shift();
    for (const prev of rev.get(st) ?? []) {
      if (back.has(prev)) continue;
      back.add(prev); rq.push(prev);
    }
  }
  const stuck = [...seen].filter((st) => !back.has(st));
  if (stuck.length)
    throw new Error(`1,0: 入口へ戻れない状態が ${stuck.length} 件（例 ${stuck[0]}）`);

  // (c) 対照実験＝3つの道具がどれも必須（飾りでない）。
  const reachesExit = (solver) => cellsOf(explore(solver, ROOM_B.entry).seen).has(ROOM_B.exit);
  const hardBreaks = Object.fromEntries(Object.keys(breaks).map((k) => [k, 99]));  // 爆弾で割れない
  const controls = [
    ['はしご無し', makeSolver(tiles, bg, links, breaks, new Set(), { ...opt, hasLadder: false })],
    ['道具封じ', makeSolver(tiles, bg, links, breaks, new Set(), { ...opt, noTools: true })],
    ['壁が硬すぎる（爆弾不可）', makeSolver(tiles, bg, links, hardBreaks, new Set(), opt)],
  ];
  for (const [label, solver] of controls) {
    if (reachesExit(solver)) throw new Error(`1,0: ${label} でも出口に届く＝その道具が飾り`);
  }
  // (d) 弓だけを封じる＝'!' を最初から壊した盤面（床）＋道具封じ。壁を割った後でも
  //     'Y' を叩けないので門は開かない＝弓が必須であることを単独で示す。
  const opened = tiles.map((row) => row.slice());
  const [br, bc] = ROOM_B.bombWall.split(',').map(Number);
  opened[br][bc] = TILE.FLOOR;
  const noBow = makeSolver(opened, bg, links, {}, new Set(), { ...opt, noTools: true });
  if (reachesExit(noBow)) throw new Error('1,0: 壁を割った後は弓なしで出口に届く＝弓が飾り');

  return seen.size;
}

// ── ③ 玉座の間の検査 ───────────────────────────────────────────────────────
function checkThrone(tiles) {
  const fail = (m) => { throw new Error(`2,0: ${m}`); };
  const enemies = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (ENEMY_META[tiles[r][c]]) enemies.push([key(r, c), tiles[r][c]]);
  }
  if (enemies.length !== 4) fail(`敵が ${enemies.length} 体（設計は4体）`);

  // 入口の着地セルとその内側を塞がない（着地は境界セルそのもの＝⑥-landing）。
  const landings = new Set([ROOM_C.entry, '5,1']);
  for (const [k, tile] of enemies) {
    if (landings.has(k)) fail(`敵 '${tile}' が入口の着地セル ${k} を塞いでいる`);
    if (ENEMY_META[tile].directional && !ROOM_C.enemyDirs[k])
      fail(`'${tile}' は向き別スプライト∴${k} に enemyDirs が必要`);
  }
  for (const k of Object.keys(ROOM_C.enemyDirs)) {
    if (!enemies.some(([ek]) => ek === k)) fail(`enemyDirs ${k} に敵が居ない（幽霊キー）`);
  }

  // 宝箱まで歩いて届く（敵は素通り扱い＝倒した後の到達性）。
  const reach = walkBFS(tiles, ROOM_C.entry);
  if (!reach.has(ROOM_C.chest)) fail(`宝箱 ${ROOM_C.chest} まで歩いて届かない`);
  const [cr, cc] = ROOM_C.chest.split(',').map(Number);
  if (tiles[cr][cc] !== TILE.CHEST) fail(`${ROOM_C.chest} が 'B' でない`);
  for (const k of Object.keys(ROOM_C.npcData)) {
    const [nr, nc] = k.split(',').map(Number);
    if (tiles[nr][nc] !== TILE.SIGN) fail(`npcData ${k} のタイルが 'i' でない`);
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => reach.has(key(nr + dr, nc + dc))))
      fail(`石碑 ${k} に隣接できない＝読めない`);
  }
  const threat = enemies.reduce((t, [, tile]) => {
    const m = ENEMY_META[tile];
    return t + (m.hp * m.atk) / (m.def + 1);
  }, 0);
  return threat;
}

// ── 組み立て ────────────────────────────────────────────────────────────────
function buildStage(spec) {
  return {
    cols: COLS,
    rows: ROWS,
    tiles: parse(spec.tiles, spec.title),
    bgTiles: {},
    links: spec.links ?? [],
    enemyDirs: spec.enemyDirs ?? {},
    chestContents: spec.chest ? { [spec.chest]: spec.chestContents } : {},
    objects: {},
    npcData: spec.npcData ?? {},
    shopData: {},
    // 宝箱の封印＝全滅で解ける（cave_1 1,0 のハートの器と同じ規則）。
    showConditions: spec.chest ? { [spec.chest]: { trigger: 'killAll' } } : {},
    breakableWalls: spec.breakableWalls ?? {},
    isBossRoom: false,
  };
}

const d = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const layer = d.layers.secret_grotto;
if (!layer?.stages?.['0,0']) throw new Error('secret_grotto 0,0 が無い');

const tilesB = parse(ROOM_B.tiles, ROOM_B.title);
const tilesC = parse(ROOM_C.tiles, ROOM_C.title);

checkGeometryB(tilesB);
const states = checkSolvableB(tilesB);
const threat = checkThrone(tilesC);

// 0,0 の東を1マス開ける（1,0 の入口と向かい合わせ）。
const roomA = layer.stages['0,0'];
const [ar, ac] = ROOM_A_OPEN.split(',').map(Number);
roomA.tiles[ar] = [...(Array.isArray(roomA.tiles[ar]) ? roomA.tiles[ar] : [...roomA.tiles[ar]])];
roomA.tiles[ar][ac] = TILE.FLOOR;

layer.stages['1,0'] = buildStage(ROOM_B);
layer.stages['2,0'] = buildStage(ROOM_C);

// 部屋を跨ぐ境界の突き合わせ（0,0 東 ↔ 1,0 西 ↔ 2,0 西）。
const boundary = [
  ['0,0→1,0', roomA.tiles, ROOM_A_OPEN, tilesB, ROOM_B.entry],
  ['1,0→2,0', tilesB, ROOM_B.exit, tilesC, ROOM_C.entry],
];
for (const [label, fromTiles, fromKey, toTiles, toKey] of boundary) {
  const f = fromKey.split(',').map(Number);
  const t = toKey.split(',').map(Number);
  if (!walkable(fromTiles, f[0], f[1])) throw new Error(`${label}: 出発側 ${fromKey} が歩けない`);
  if (!walkable(toTiles, t[0], t[1])) throw new Error(`${label}: 着地側 ${toKey} が歩けない`);
  if (f[0] !== t[0]) throw new Error(`${label}: 行が揃っていない（${fromKey} vs ${toKey}）`);
}

// field 9,9 の石碑（7,8）＝この寄道の案内。「→ 東の空島（右の画面）で笛を吹け。」は
// 入口が同じ画面の (5,3)（笛 reveal）に移った後も直っていなかった失効記述∴ここで正す。
// 併せて奥に銀の刃があることを匂わせる（報酬への導線が世界の中に無いと誰も辿り着けない）。
// ⚠️ 2026-09-05 に寄道の名前を「秘密の洞窟」に確定した（それまで無名で、この石碑が
//    `dungeon_7` の実名【空中の遺跡】を借りていた）∴本文もそれに合わせてある
//    （`scripts/migrate-secret-grotto-name.mjs` と同じ5行＝再実行しても名前が巻き戻らない）。
const tablet = d.layers.field?.stages?.['9,9']?.npcData?.['7,8'];
if (!tablet) throw new Error('field 9,9 の石碑 (7,8) が無い');
tablet.lines = [
  '【秘密の洞窟】',
  '岩肌に隠された 古い洞窟。',
  '笛の音色だけが その入口を開く。',
  '→ この地で笛を吹け。扉は 北西に現れる。',
  '奥には 銀の刃が 眠るという。',
];

// 書式は他の migrate と同じ 2スペース・末尾改行なし（違えるとファイル全体が差分になる）。
if (!DRY) writeFileSync(MAP_PATH, JSON.stringify(d, null, 2));

console.log(`✅ secret_grotto 拡張${DRY ? '（--dry: 書き込みなし）' : ''}`);
console.log(`   0,0 東を開通（${ROOM_A_OPEN}）`);
console.log(`   1,0 断たれた歩廊：状態 ${states}／はしご橋 ${ROOM_B.ladderBridge.cell}・`
  + `爆弾壁 ${ROOM_B.bombWall}・スイッチ ${ROOM_B.toggle}→門 ${ROOM_B.gate}`);
console.log(`   2,0 銀の玉座：脅威度 ${threat.toFixed(1)}／宝箱 ${ROOM_C.chest} = 銀の剣（swordTier 2・killAll 封印）`);
