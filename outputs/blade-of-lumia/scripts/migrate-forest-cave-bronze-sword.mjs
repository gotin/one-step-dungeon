#!/usr/bin/env node
/**
 * migrate-forest-cave-bronze-sword.mjs
 *   新レイヤー `forest_cave`（樹海の岩室）＝**銅の剣 swordTier 1** の寄道を作る（キュー 8.5番）。
 *   入口は field `0,0`「岩室の裂け目」の爆弾壁の奥 '>'(1,2)
 *   （`scripts/migrate-field-forest-north.mjs` が先に作る＝このスクリプトは対の存在を検証する）。
 *
 * 位置づけ（ユーザー確定 2026-08-20）:
 *   剣は 木(tier0) → **銅(tier1)** → 銀(tier2) → 聖剣(tier3)。銀は `secret_grotto`＝笛（D7 後）で
 *   入る寄道∴その手前の関門として「**爆弾**（D6 の報酬）で開く洞窟」に銅を置く。
 *   ここに笛の要素は入れない（笛は銀の側の鍵＝2つの寄道の鍵を分ける）。
 *
 * 2部屋:
 *   0,0「石車の前室」… 1マス幅の岩溝が2本。溝の中では石を**押せる向きが1つしかない**
 *       （プレイヤーが石の反対側へ回り込めない）＝押し間違いで詰む形が原理的に無い。
 *       2つのボタンを石が押さえた瞬間に門が恒久ロック（refreshGates の stonesLocked）。
 *       南の袋には爆弾で割る岩 '!' の奥に小さな宝。
 *   1,0「かがり火の岩室」… ロウソクで 'H' 3基を点けると封印宝箱（銅の剣）が現れる。
 *       骸骨剣士2＋剣獣（脅威度 20.0）が部屋を巡回する＝火を点ける間の圧。
 *
 * なぜ「石押し＋かがり火」か（PUZZLE-DESIGN の語彙）:
 *   ボタン 'S' はモーメンタリ＝プレイヤーの足でも ON になる∴石1個＋自分の足では
 *   「門の前に立つ」と足が離れて閉じる。石2個で押さえた時だけ恒久ロックする
 *   （game/conditions.js refreshGates の stonesLocked）＝倉庫番が飾りにならない。
 *   ロウソクは前方1セルの 'H' を点ける（game.js playCandle）＝火元不要∴
 *   「3基を巡って点ける」だけで成立し、道具の順番の縛りを増やさない。
 *
 * 自己検証（状態空間＝実エンジンの遷移の写し `scripts/lib/blade-solver.mjs`）:
 *   ① 幾何：12×10・外周は '#'・部屋の継ぎ目（0,0 の (2,11) ↔ 1,0 の (2,0)）が揃う。
 *   ② 前室：門の東 (2,11) へ到達できる／`noPush`（石を壁に固定）では到達できない／
 *      **石1個だけの対照盤面**でも到達できない（＝「石1個＋自分の足」で抜けられない）。
 *   ③ どちらの部屋も壁でないセルが全部到達可能＝無駄セル0。
 *   ④ どの到達状態からも出口（前室 '>'／岩室の西口）へ戻れる＝入って詰まない。
 *   ⑤ 岩室：ロウソクで 'H' 3基すべてを点けられる／ロウソク無しでは点けられない
 *      （火元が無い＝ブーメランの火運びも成立しない）。宝箱は 'B' かつ torchesLit 封印。
 *   ⑥ 敵：脅威度 20.0（D6 看板部屋 22.0 未満）・着地セルと外周に敵を置かない・
 *      向き別スプライトの敵に向きがある・`EXTRA_ENEMY_ROOMS` に部屋が宣言済み。
 *   ⑦ 進行：`shared/progression.js` の ORDER に forest_cave が載っており、その位置で
 *      爆弾を持っている（＝D6 以降・はしご/笛は不要）。
 *   ⑧ field 側の入口と id が対になっている（`field_forest_cave` ↔ `forest_cave`）。
 *
 * 使い方: node scripts/migrate-forest-cave-bronze-sword.mjs [--dry]
 *   ⚠️ 先に `node scripts/migrate-field-forest-north.mjs` を走らせて入口を作ること。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { SWORD_TIERS } from '../shared/items.js';
import { isHardBlocked } from './lib/connectivity.mjs';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { EXTRA_ENEMY_ROOMS, THREAT_OF, stageThreat } from './lib/enemy-placement.mjs';
import { ORDER, toolsUsableIn } from '../shared/progression.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'forest_cave';
const FIELD_ENTRY_ID = 'field_forest_cave';   // field 0,0 (1,2) 側の入口 id
const CAVE_ENTRY_ID = 'forest_cave';          // 前室 (1,1) 側の出口 id（cave_1/hidden_cave と同じ命名）

// ── 盤面 ────────────────────────────────────────────────────────────────────
// '#' 岩壁 / '.' 洞床 / '>' 出入口 / 'S' ボタン / '*' 押せる石 / 'T' 門 /
// '!' 爆弾で割れる岩 / 'B' 宝箱 / 'i' 石碑 / 'H' かがり火 / 'θ' 骸骨剣士 / 'μ' 剣獣
const ROOMS = [
  {
    key: '0,0',
    title: '石車の前室',
    // 岩溝①＝row3 の cols2-7（上下は岩壁・西端が袋）。溝へ入れるのは東 (3,8) だけ∴
    //   プレイヤーは石の西側へ回り込めない＝押せる向きは西のみ＝袋の底のボタン (3,2) 一択。
    // 岩溝②＝col10 の rows6-8（左右は岩壁・南端が袋）。入れるのは北 (5,10) だけ∴押せる向きは南のみ。
    // 門 'T'(2,10) の東 (2,11) が岩室への継ぎ目。門の上下 (1,11)(3,11) は岩壁＝迂回できない。
    tiles: [
      '############',
      '#>.........#',
      '########.#T.',
      '##S...*..###',
      '########.###',
      '########...#',
      '########.#*#',
      '#B!..i...#.#',
      '###......#S#',
      '############',
    ],
    breakableWalls: { '7,2': { breakDef: 2 } },
    chestContents: { '7,1': { type: 'rupee', value: 30, name: 'ルピー×30' } },
    mapEnters: { '1,1': { id: CAVE_ENTRY_ID, destId: FIELD_ENTRY_ID } },
    signData: {
      '7,5': {
        name: '石車の碑',
        lines: [
          '【石車の前室】',
          '二つの岩溝に 石車を落とせ。',
          '二つとも据わったとき 門は開いたまま止まる。',
          '片方と己の足では 門は待ってくれない。',
        ],
      },
    },
    entry: '1,1',       // 入場の着地セル（field からのワープ先）＝ここへ戻れれば詰まない
    goal: '2,11',       // 岩室への継ぎ目
  },
  {
    key: '1,0',
    title: 'かがり火の岩室',
    // 西口 (2,0) から入り、'H' 3基（(3,2) 西・(3,9) 東・(7,5) 南）を点けると
    // 壁龕の封印宝箱 (1,6) が現れる＝部屋を一周させる鍵。
    // 骸骨剣士2＋剣獣が巡回する＝火を点ける間の圧（脅威度 20.0）。
    tiles: [
      '############',
      '#...#.B.#..#',
      '....#.i.#..#',
      '#.H......H.#',
      '#....θ.....#',
      '#..........#',
      '#..μ....θ..#',
      '#....H.....#',
      '#..........#',
      '############',
    ],
    chestContents: { '1,6': { type: 'weapon', swordTier: 1 } },
    showConditions: { '1,6': { trigger: 'torchesLit' } },
    enemyDirs: { '4,5': 'down', '6,3': 'up', '6,8': 'left' },
    signData: {
      '2,6': {
        name: '岩室の碑',
        lines: [
          '【かがり火の岩室】',
          '三つの火が揃うまで 壁は宝を離さない。',
          '灯を持つ者だけが ここへ来られる。',
        ],
      },
    },
    entry: '2,0',
    torchesAll: 3,
  },
];

// ── 小道具 ──────────────────────────────────────────────────────────────────
const key = (r, c) => `${r},${c}`;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const parse = (rows, label) => {
  if (rows.length !== ROWS) throw new Error(`${label}: 行数が ${rows.length}`);
  return rows.map((row, r) => {
    if (row.length !== COLS) throw new Error(`${label}: row${r} の列数が ${row.length}`);
    return [...row];
  });
};
const BG = Array.from({ length: ROWS }, () => Array(COLS).fill(TILE.FLOOR));
const FULL = { hasLadder: true, hasCandle: true };

/** 到達状態と逆辺（詰み判定用）。 */
function explore(S, startKey) {
  const [r, c] = startKey.split(',').map(Number);
  const start = S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
  const seen = new Set([start]);
  const rev = new Map();
  const q = [start];
  let guard = 0;
  while (q.length) {
    if (++guard > 3000000) throw new Error('状態空間が大きすぎる（設計を単純に）');
    const st = q.shift();
    for (const nx of S.nextStates(st)) {
      if (!rev.has(nx)) rev.set(nx, []);
      rev.get(nx).push(st);
      if (seen.has(nx)) continue;
      seen.add(nx); q.push(nx);
    }
  }
  return { seen, rev };
}
const cellsOf = (seen) => new Set([...seen].map((st) => st.split('|')[0]));
/** 「使われたセル」＝プレイヤーが立てた ∪ 石が乗った。
 *  1マス幅の岩溝の底のボタンは**石が乗るためのセル**＝人は永久に立てない∴
 *  立てるかどうかだけで無駄セルを測ると設計の要のセルを無駄と誤判定する。 */
function usedCells(seen) {
  const used = cellsOf(seen);
  for (const st of seen) {
    const stones = st.split('|')[1];
    if (stones) for (const k of stones.split(';')) if (k) used.add(k);
  }
  return used;
}
const solverFor = (tiles, room, opt) => makeSolver(
  tiles, BG, [],
  Object.fromEntries(Object.entries(room.breakableWalls ?? {}).map(([k, v]) => [k, v.breakDef])),
  new Set(), opt);

// 壁として据え置くタイル（到達しなくてよい＝隣から使う物・岩壁）。
const PROP_TILES = new Set([TILE.WALL, TILE.SIGN, TILE.TORCH]);

function buildStage(room, tiles) {
  return {
    cols: COLS,
    rows: ROWS,
    tiles,
    bgTiles: {},
    links: [],
    enemyDirs: room.enemyDirs ?? {},
    chestContents: room.chestContents ?? {},
    floorItems: {},
    objects: {},
    npcData: {},
    shopData: {},
    mapEnters: room.mapEnters ?? {},
    showConditions: room.showConditions ?? {},
    breakableWalls: room.breakableWalls ?? {},
    isBossRoom: false,
    signData: room.signData ?? {},
  };
}

// ── ① 幾何 ─────────────────────────────────────────────────────────────────
function checkGeometry(room, tiles) {
  const openRing = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!(r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1)) continue;
    if (tiles[r][c] === TILE.WALL) continue;
    openRing.push(key(r, c));
  }
  return openRing;
}

// ── ③④ 到達と詰み ──────────────────────────────────────────────────────────
function checkReach(room, tiles, seen, rev, backTargets) {
  const reached = cellsOf(seen);
  const used = usedCells(seen);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (PROP_TILES.has(tiles[r][c])) continue;
    if (!used.has(key(r, c)))
      throw new Error(`${room.key}: ${key(r, c)}('${tiles[r][c]}') に到達できない＝無駄セル`);
  }
  for (const k of Object.keys(room.signData ?? {})) {
    const [sr, sc] = k.split(',').map(Number);
    if (!DIRS.some(([dr, dc]) => reached.has(key(sr + dr, sc + dc))))
      throw new Error(`${room.key}: 石碑 ${k} に隣接できない＝読めない`);
  }
  // 出口へ戻れる状態の逆到達（backTargets のいずれかに立つ状態から逆向きに広げる）。
  const back = new Set();
  const q = [];
  const targets = new Set(backTargets);
  for (const st of seen) if (targets.has(st.split('|')[0])) { back.add(st); q.push(st); }
  if (!back.size) throw new Error(`${room.key}: 出口に立つ状態が1つも無い`);
  while (q.length) {
    const st = q.shift();
    for (const prev of rev.get(st) ?? []) {
      if (back.has(prev)) continue;
      back.add(prev); q.push(prev);
    }
  }
  const stuck = [...seen].filter((st) => !back.has(st));
  if (stuck.length)
    throw new Error(`${room.key}: 出口へ戻れない状態が ${stuck.length} 件（例 ${stuck[0]}）＝入って詰む`);
  return reached;
}

// ── 実行 ────────────────────────────────────────────────────────────────────
const d = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// ⑧ field 側の入口（先に migrate-field-forest-north.mjs を走らせている前提）。
const fieldEntrance = d.layers.field?.stages?.['0,0'];
const fieldEnter = fieldEntrance?.mapEnters?.['1,2'];
if (!fieldEnter || fieldEnter.destId !== CAVE_ENTRY_ID || fieldEnter.id !== FIELD_ENTRY_ID)
  throw new Error('field 0,0 (1,2) の洞窟入口が無い（先に migrate-field-forest-north.mjs を実行する）');
if (fieldEntrance.tiles[1][2] !== TILE.MAP_ENTER)
  throw new Error(`field 0,0 (1,2) が '>' でない`);
for (const [lk, ld] of Object.entries(d.layers)) {
  for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
    for (const [pk, e] of Object.entries(sd.mapEnters ?? {})) {
      if (e.id === CAVE_ENTRY_ID && !(lk === LAYER))
        throw new Error(`入口 id '${CAVE_ENTRY_ID}' が ${lk}/${sk} ${pk} と衝突する`);
    }
  }
}

// ⑦ 進行の宣言（爆弾を持つ地点＝D6 以降。はしご・笛は要らない）。
// 「この地点で何を持っているか」は `shared/progression.js` の ORDER の位置から導出する
// （2026-09-05・0g で手書きの `UNLOCKED_AT` を廃止）∴宣言の実体は ORDER にこのレイヤーが
// 載っていること＝載っていなければ導出表にも出ない。
if (!ORDER.some((cp) => cp.layer === LAYER)) {
  throw new Error(`${LAYER} が shared/progression.js の ORDER に無い（進行上の位置を宣言する）`);
}
const unlocked = toolsUsableIn(d)[LAYER];
if (!unlocked.has('bomb')) throw new Error(`${LAYER} の地点で bomb を持っていない（入口は爆弾で開く）`);
if (!unlocked.has('candle')) throw new Error(`${LAYER} の地点で candle を持っていない（かがり火の鍵）`);

const built = {};
const report = [];
for (const room of ROOMS) {
  const tiles = parse(room.tiles, `${LAYER}/${room.key}`);
  const openRing = checkGeometry(room, tiles);
  const S = solverFor(tiles, room, FULL);
  const { seen, rev } = explore(S, room.entry);

  // ④ 戻り先＝前室は出入口 '>'、岩室は西口（=前室へ帰る継ぎ目）。
  const backTargets = room.mapEnters ? Object.keys(room.mapEnters) : openRing;
  const reached = checkReach(room, tiles, seen, rev, backTargets);

  if (room.goal) {
    // ② 門の東へ抜けられる＋石を押さないと抜けられない＋石1個では抜けられない。
    if (!reached.has(room.goal)) throw new Error(`${room.key}: ${room.goal} へ抜けられない＝解けない`);
    const noPush = cellsOf(explore(solverFor(tiles, room, { ...FULL, noPush: true }), room.entry).seen);
    if (noPush.has(room.goal)) throw new Error(`${room.key}: 石を押さずに ${room.goal} へ抜けられる`);
    // 石1個だけの対照盤面（残りの '*' を素の床にする）を全パターン試す。
    const stoneCells = [];
    tiles.forEach((row, r) => row.forEach((ch, c) => { if (ch === TILE.STONE) stoneCells.push([r, c]); }));
    if (stoneCells.length !== 2) throw new Error(`${room.key}: 石は2個の設計（実際 ${stoneCells.length}）`);
    for (const [kr, kc] of stoneCells) {
      const one = tiles.map((row) => row.slice());
      for (const [r, c] of stoneCells) if (r !== kr || c !== kc) one[r][c] = TILE.FLOOR;
      const r1 = cellsOf(explore(solverFor(one, room, FULL), room.entry).seen);
      if (r1.has(room.goal))
        throw new Error(`${room.key}: 石が (${kr},${kc}) の1個だけでも ${room.goal} へ抜けられる`
          + '＝「石1個＋自分の足」で門が開く（倉庫番が飾りになる）');
    }
    // 宝の袋（爆弾で割る岩の奥）＝道具なしでは届かない。
    for (const ck of Object.keys(room.chestContents ?? {})) {
      const noTools = cellsOf(explore(solverFor(tiles, room, { ...FULL, noTools: true }), room.entry).seen);
      if (noTools.has(ck)) throw new Error(`${room.key}: 爆弾なしで宝 ${ck} に届く`);
    }
  }

  if (room.torchesAll) {
    // ⑤ かがり火を全部点けられる／ロウソクが無いと点けられない。
    if (S.torchCells.length !== room.torchesAll)
      throw new Error(`${room.key}: かがり火が ${S.torchCells.length} 基（${room.torchesAll} 基の設計）`);
    const fullMask = (1 << room.torchesAll) - 1;
    const litOf = (st) => Number(st.split('|')[4]);
    if (![...seen].some((st) => litOf(st) === fullMask))
      throw new Error(`${room.key}: かがり火を全部点けられない`);
    const noCandle = explore(solverFor(tiles, room, { ...FULL, hasCandle: false }), room.entry).seen;
    if ([...noCandle].some((st) => litOf(st) === fullMask))
      throw new Error(`${room.key}: ロウソク無しでも全点灯できる＝ロウソクが鍵になっていない`);
    // 封印宝箱＝'B' かつ torchesLit・そのセルへ立てる。
    for (const [ck, cond] of Object.entries(room.showConditions ?? {})) {
      if (tiles[+ck.split(',')[0]][+ck.split(',')[1]] !== TILE.CHEST)
        throw new Error(`${room.key}: showConditions ${ck} が 'B' でない`);
      if (cond.trigger !== 'torchesLit') throw new Error(`${room.key}: ${ck} の封印が torchesLit でない`);
      if (!reached.has(ck)) throw new Error(`${room.key}: 宝箱 ${ck} に立てない`);
    }
  }

  built[room.key] = buildStage(room, tiles);
  report.push({ room, tiles, states: seen.size, openRing });
}

// ① 部屋の継ぎ目（0,0 の東 (2,11) ↔ 1,0 の西 (2,0)）。
const A = built['0,0'].tiles, B = built['1,0'].tiles;
for (let r = 0; r < ROWS; r++) {
  const aOpen = A[r][COLS - 1] !== TILE.WALL;
  const bOpen = B[r][0] !== TILE.WALL;
  if (aOpen !== bOpen) throw new Error(`部屋の継ぎ目が row${r} で揃わない（前室 ${A[r][COLS - 1]} / 岩室 ${B[r][0]}）`);
}
if (A[2][COLS - 1] === TILE.WALL) throw new Error('前室の東口 (2,11) が閉じている');

// ⑥ 敵（岩室）。
const cave = built['1,0'];
const enemyCells = {};
cave.tiles.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) enemyCells[key(r, c)] = ch; }));
const threat = stageThreat(cave, ENEMY_META);
const d6 = stageThreat(d.layers.dungeon_6.stages['2,3'], ENEMY_META);
if (Object.keys(enemyCells).length !== 3) throw new Error(`岩室の敵は3体の設計（実際 ${Object.keys(enemyCells).length}）`);
if (!(threat < d6)) throw new Error(`岩室の脅威度 ${threat} が D6 看板部屋 ${d6} 以上（寄道が本編より重い）`);
for (const [k, tile] of Object.entries(enemyCells)) {
  const [r, c] = k.split(',').map(Number);
  if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) throw new Error(`岩室 ${k} の敵が外周に居る`);
  if (k === '2,0' || k === '2,1') throw new Error(`岩室 ${k} の敵が入口の着地セルを塞ぐ`);
  if (ENEMY_META[tile].isBoss) throw new Error(`岩室 ${k} にボスを置いている`);
  if (ENEMY_META[tile].directional && !cave.enemyDirs[k])
    throw new Error(`岩室 ${k} '${tile}' は向き別スプライト∴向きが必要`);
}
for (const k of Object.keys(cave.enemyDirs)) if (!enemyCells[k]) throw new Error(`岩室 enemyDirs ${k} が幽霊キー`);
const openCount = cave.tiles.flat().filter((ch) => !isHardBlocked(ch) && ch !== TILE.GATE).length;
if (openCount / Object.keys(enemyCells).length < 10)
  throw new Error(`岩室の敵密度が高すぎる（歩ける床 ${openCount} / 敵 3）`);
if (!EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === '1,0'))
  throw new Error(`EXTRA_ENEMY_ROOMS に ${LAYER}/1,0 の宣言が無い（配置表の外の敵部屋＝ドリフト扱いになる）`);

// 報酬（銅の剣）。
const reward = cave.chestContents['1,6'];
if (reward?.type !== 'weapon' || reward.swordTier !== 1) throw new Error('岩室の宝箱が銅の剣でない');
if (SWORD_TIERS[1]?.name !== '銅の剣') throw new Error('SWORD_TIERS[1] が銅の剣でない');

// ── 書き込み ────────────────────────────────────────────────────────────────
if (d.layers[LAYER]) throw new Error(`${LAYER} は既に存在する（このスクリプトは新設用）`);
d.layers[LAYER] = { name: '樹海の岩室', bgm: 'dungeon', stages: built };

if (!DRY) writeFileSync(MAP_PATH, JSON.stringify(d, null, 2));

console.log(`✅ ${LAYER}（樹海の岩室）を新設${DRY ? '（--dry: 書き込みなし）' : ''}`);
for (const { room, states, openRing } of report) {
  console.log(`   ${room.key} ${room.title.padEnd(9)} 状態 ${states} 外周の口 [${openRing.join(' ')}]`);
}
console.log(`   報酬: ${SWORD_TIERS[1].name}（swordTier 1・ATK+${SWORD_TIERS[1].atk}・ビーム${SWORD_TIERS[1].beam ? 'あり' : 'なし'}）`);
console.log(`   敵: ${Object.entries(enemyCells).map(([k, t]) => `${t}@${k}`).join(' ')} 脅威度 ${threat}（D6 看板 ${d6} 未満）`);
