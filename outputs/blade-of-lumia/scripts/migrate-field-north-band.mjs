#!/usr/bin/env node
/**
 * migrate-field-north-band.mjs
 *   9-6-BASE 外周解体＋隣接地域編入（キュー8番）の**北の外周帯 7画面**を作り込む。
 *   `4,0` `4,1`（草原G1）/ `5,0` `9,0`（草原G5）/ `10,1`（草原G6）/
 *   `6,0`（暗黒の塔T）/ `7,0`（空島K）
 *   ※地域記号は PLAN.md:1793 の凡例が真実＝`T`暗黒の塔（飛行のみの玄関）/ `K`空島（D7 笛ワープ）。
 *   （実データで全て 0〜1軸の空塗り絵＝縁取りだけ残った地図北端の帯）。
 *
 * 背景:
 *   ①深洋O → ②湖W東+7 → ③森F北西+8 → ④火山L外輪+9 に続く⑤。残っている「未満2軸の塊」を
 *   小さい順に片付ける規則に従うと、単発に見える 7枚は地図北端で一続きの帯になる＝ここが最小。
 *   `8,0`（空島Kの飛翔台＝塔へ渡る発射元）は TWO_AXIS_ALLOWLIST ＝ 9-2T の領分なので**触らない**。
 *   ∴空島K の「パズル画面 2枚」は `8,0` が作られるまで満たない（9-2T 待ちの既知の残り）。
 *
 * 設計（草原の語彙・§14-2 の道具の時制・隣接画面の実データから）:
 *   下地 bgTiles は草 'g'（既存 G1/G5/G6 画面と同じ単一値）／閉じた外周は岩山 'M'（＝断崖）。
 *   到着時の持ち物は{剣・木の盾・ブーメラン・弓}（D3後・D4前）＝弓・ブーメラン・剣・石押しは
 *   「今できる」側、はしご(D5)・爆弾(D6)・ロウソク(D4)は「後から戻る」側に振り分ける。
 *   近隣が既に見せた仕掛けと重ならないよう選んだ（`10,0` 灰境の橋・`10,2` ロウソクの篝火・
 *   `9,1` killAll の見張り・`4,2` 爆破壁・`11,3`/`12,1` 溶岩の弓ゲート）。
 *
 *   1画面ずつ「何のための画面か」を決めた一点物（量産しない）:
 *     4,0 崖端の見台     … 森から北へ登った突端。亀裂をはしごで渡る宝（後で戻る）＋石碑
 *     4,1 森辺の四つ辻   … 池の中の島に立つスイッチを**弓で射る**とゲートが開く（今できる）
 *     5,0 峰の関門       … 石を袋小路へ押し込みボタンに乗せてゲートを開く（今できる）
 *     6,0 虚空の淵       … 虚空 '%' の向こうに黒の塔が立つ見晴らし。地割れを橋1本で渡る
 *     7,0 空へ上がる参道 … 天の柱への参道（朽ちた石畳）。爆弾で割る宝室（後で戻る）
 *     9,0 峰の三叉の狼煙台 … 片方だけ燃える狼煙台。ブーメランで火を運ぶと封じが解ける（今できる）
 *     10,1 茂み道        … 茂みの塊の奥に宝。跳躍蜘蛛が塊を跳び越えて東の登りを塞ぐ
 *
 * 自己検証（このスクリプトは検証込みで1本＝流し込みだけの migrate にしない）:
 *   ① 外周リング：隣画面の**実データ**から必要な開口を不動点で求め、盤面と1セル単位で照合。
 *      閉じたリングセルは岩山 'M' で統一。`4,0`↔`4,1` の継ぎ目だけは col10/col11 も渡す
 *      （`5,1` の実データが `4,1`(0,11) を開かせる＝標準の細い十字だけだと1セルの孤立が出る）。
 *   ② 徒歩だけの到達（道具なし・ゲート閉・下地の水も壁）で、開いた外周セルが全部ひとつの塊。
 *   ③ 状態空間（scripts/lib/blade-solver.mjs＝実エンジンの遷移の写し）で
 *      - 壁でないセルが全部到達可能＝無駄セル0（下地が水のセルと、石で押さえる前提の
 *        ボタンだけは除外＝踏めないのが正しい）
 *      - 宝箱・看板・かがり火の隣が到達可能
 *      - どの到達状態からも開いた外周セルへ戻れる＝入って詰まない
 *      - 対照実験で「その道具が無いと届かない」＝仕掛けが飾りでないこと
 *   ④ 画面の軸（field-quality.screenAxes）が全画面 2軸以上＝素通り画面を増やさない。
 *   ⑤ 同一配置の重複が無い（既存 320 画面すべてとタイル列を照合）。
 *   ⑥ 宝箱/showConditions は 'B'・看板は 'i' で本文あり・'!' は breakableWalls 定義あり・
 *      links の両端が 'Y'/'T'・initLitTorches のセルが 'H'・向き別スプライトの敵に enemyDirs。
 *   ⑦ ブーメランの火運びは**幾何で**検証する。ソルバーは「直線上の H を全部点ける」上界
 *      近似で射程を見ないが、実エンジンは木のブーメランの折り返し距離
 *      （BOOMERANG_TIERS[0].maxRange = 3）で戻る∴射程内に収まる立ち位置が要る。
 *
 * 使い方: node scripts/migrate-field-north-band.mjs [--dry] [--rings]
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked, cellTile } from './lib/connectivity.mjs';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { screenAxes } from './lib/field-quality.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const DRY = process.argv.includes('--dry');
const RINGS_ONLY = process.argv.includes('--rings');

// ── 盤面 ────────────────────────────────────────────────────────────────────
// '.' 草地（下地 bgTiles 'g'）/ 'M' 岩山＝断崖 / 't' 木 / 'u' 茂み /
// 'x' 亀裂（穴。はしごで幅1だけ渡る）/ 'v' 橋 / '%' 虚空（徒歩不可・はしごでも渡れない）/
// 'h' 塔の壁・'p' 塔の屋根（どちらも通行不可＝虚空の向こうの絵）/
// '*' 押せる石 / 'S' ボタン / 'T' ゲート / 'Y' 叩くスイッチ（弓の矢でも入る）/
// 'H' かがり火 / 'B' 宝箱 / '!' 爆弾で割れる岩 / 'i' 石碑・道標 /
// 'o' 石畳＝**盤面へ落とす前に bgTiles へ振り替える**（下の pave()）/
// 敵 'E' パトロール・'C' チェイサー・'α' 地中蟲・'β' 跳躍蜘蛛・'ξ' コウモリ群・
//    'ω' 突進猪・'ζ' 盾騎士（**向き別スプライト＝enemyDirs 必須**）。
//    ※置けるのは**弱点を持たない敵だけ**（上の 10,1 の注記＝field は道具未所持扱い）。
//
// water 欄＝下地 bgTiles を水 '~' にするセル（tiles は '.' のまま）。実エンジン・接続
//   チェッカーはどちらも下地の水を壁として畳む∴「歩けない池」をここで作る。
// tools 欄＝その画面の仕掛けの「必須性」を対照実験で示す指定。
//   { cell, control } … control を封じたら cell に到達できないこと。
//   control: 'noTools'（爆弾/弓/ブーメラン/ロウソク封じ）/ 'noLadder' / 'noPush' / 'noBush'
const SCREENS = [
  {
    key: '4,0',
    title: '崖端の見台',
    // 森 F（西）から北へ登り切った突端。`3,1` の樹海の道標「北へ登れば崖」を受ける画面。
    // 北西の宝は幅1の亀裂の向こう＝はしご（D5）を得てから戻る側。
    tiles: [
      'MMMMMMMMMMMM',
      '...MMBx....M',
      '...MMMM....M',
      '....t...E..M',
      '............',
      '......t.....',
      '..t........M',
      '....i...β..M',
      '...........M',
      '.MMMM..MMM..',
    ],
    chestContents: { '1,5': { type: 'rupee', value: 50, name: 'ルピー×50' } },
    signData: {
      '7,4': {
        name: '見台の石碑',
        lines: [
          '【崖端の見台】',
          '樹海の north の 果て。ここで 地は 切れる。',
          '崖下の 亀裂は 深い。渡る術を 持たぬなら 覗くな。',
        ],
      },
    },
    tools: [{ cell: '1,5', control: 'noLadder', why: 'はしごで亀裂を渡らないと崖端の宝に届かない' }],
  },
  {
    key: '4,1',
    title: '森辺の四つ辻',
    // 四方に抜ける辻。北東の小池の中島にスイッチ 'Y' が立ち、**矢で射る**とゲート 'T' が開く。
    // 池は幅1でも「両岸が歩ける」形にしていない＝はしごでも中島に立てない（弓だけの解）。
    tiles: [
      '.MMMM..MMM..',
      '.......t....',
      '.........Y..',
      '....t.......',
      '....E.i.....',
      '.MMM........',
      '.MBT...t....',
      '.MMM....C...',
      '............',
      'M...........',
    ],
    water: ['1,8', '1,9', '1,10', '2,8', '2,10', '3,8', '3,9', '3,10'],
    links: [{ switchId: '2,9', gateId: '6,3' }],
    chestContents: { '6,2': { type: 'rupee', value: 40, name: 'ルピー×40' } },
    signData: {
      '4,6': {
        name: '四つ辻の道標',
        lines: [
          '【森辺の四つ辻】',
          '西へ 崖の 見台。南へ 森辺の 村道。',
          '北の 小池に 立つ 石柱は 遠くから 撃て。',
        ],
      },
    },
    tools: [{ cell: '6,2', control: 'noTools', why: '矢でスイッチを射たないとゲートの奥の宝に入れない' }],
  },
  {
    key: '5,0',
    title: '峰の関門',
    // 東西を細くつなぐ峰の道（row4/row5）。南の袋小路に石 '*' とボタン 'S' が一直線に並び、
    // 石を西へ押し込むと北のゲート 'T' が恒久に開く。押し戻せる向きが無い＝詰ませない形。
    tiles: [
      'MMMMMMMMMMMM',
      'M..MBM.....M',
      'M..MTM.....M',
      'M......t...M',
      '..t...ω.....',
      '............',
      'MMMMMMMM...M',
      'MS...*.....M',
      'MMMMMMMM...M',
      '...........M',
    ],
    chestContents: { '1,4': { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } },
    tools: [{ cell: '1,4', control: 'noPush', why: '石をボタンに押し込まないと関門のゲートが開かない' }],
  },
  {
    key: '6,0',
    title: '虚空の淵',
    // 暗黒の塔 T（1画面地域）の導入。北は虚空 '%' で切れ、その向こうに黒の塔が立つ＝終盤の
    // 目的地を**絵で**見せる画面（塔は通行不可のタイル＝決して届かない）。
    // 南の地割れは橋 (6,5) 一本で渡る。淵を守る盾騎士を退けると封じの宝が現れる。
    //
    // ★塔は壁 '#'（濃い石色の平塗り）で、2幅の尖塔→4幅の胴と裾を広げた輪郭にする。
    //   虚空 '%' の帯は画面を横断させたまま（塔で切らない）＝「地が断たれ、その向こうに塔が
    //   立つ」構図が実画面で読める（帯を塔で割ると夜空が2つの窓に見えて淵に見えなかった）。
    //   当初は家の外壁 'h'／屋根 'p' で輪郭を描いたが、実画面で見ると**赤い屋根の民家5軒**に
    //   しか見えなかった（絵で見せるつもりの塔が村になっていた）＝スクリーンショット目視で発覚。
    //   'h'/'p' と '#' はどちらも通行不可∴この差し替えで通行可能性は1セルも動かない。
    //   ⚠️ 引き換えに LANDMARK_TILES（'^' 'o' 'h' 'p'）を1つも持たなくなる＝ランドマーク軸は
    //     落ちる。この画面は障害（地割れ 'x'＋橋 'v'）と戦闘（killAll の封じ宝）で2軸を満たす
    //     ＝軸のために絵を偽らない（密度の一回性・アンカーは石碑 'i' が担う）。
    tiles: [
      'MMMMMMMMMMMM',
      'MMMMM##MMMMM',
      'MMMM####MMMM',
      'MM%%%%%%%%MM',
      '....E.......',
      '......ζ.....',
      'MxxxxvxxxxxM',
      'M.........BM',
      'M..i.......M',   // 石碑は南の入口側（穴の真下に置くと真上の穴が渡れなくなる＝両岸が要る）
      'MMMMM..MMMMM',
    ],
    enemyDirs: { '5,6': 'left' },
    chestContents: { '7,10': { type: 'rupee', value: 80, name: 'ルピー×80' } },
    showConditions: {
      '7,10': { trigger: 'killAll', message: '⚔ 淵の 守りを 退けた！封じの 宝箱が 現れた！' },
    },
    signData: {
      '8,3': {
        name: '淵の伝承碑',
        lines: [
          '【虚空の淵】',
          '地は ここで 断たれ 虚空となる。',
          '向こうに 立つ 黒き塔へは 空を 舞う者しか 至れぬ。',
        ],
      },
    },
  },
  {
    key: '7,0',
    title: '空へ上がる門の参道',
    // 空島 K（`7,0`+`8,0`）の西半分＝東の「天の柱」（`8,0` の飛翔台）へ続く参道。
    // 朽ちた石畳を下地で敷き、北の岩室は爆弾（D6）で割って入る＝後から戻る側。
    tiles: [
      'MMMMMMMMMMMM',
      'MMMMBMMMMMM.',
      'MMMM!M......',
      'M..oooo.E...',
      'oooooooooooo',
      'oioooooooooo',
      'M..α.oo....o',
      'M....oo....o',
      'M....oo....o',
      'M....oo....M',
    ],
    pave: ['5,1'],   // 石碑も参道の石畳の上（'o' と書けないセルの下地）
    breakableWalls: { '2,4': { breakDef: 1 } },
    chestContents: { '1,4': { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } },
    signData: {
      '5,1': {
        name: '参道の石碑',
        lines: [
          '【空へ上がる門の参道】',
          'この道は 東の 天の柱へ 続く。',
          '翼 無き者は 柱の 下で 引き返せ。',
        ],
      },
    },
    tools: [{ cell: '1,4', control: 'noTools', why: '爆弾で岩を割らないと参道の宝室に入れない' }],
  },
  {
    key: '9,0',
    title: '峰の三叉の狼煙台',
    // 西・東・南へ抜ける三叉路。並んだ狼煙台のうち西だけが燃えている（initLitTorches）＝
    // **ブーメランで火を運ぶ**と両方灯り、封じの宝が現れる（到着時の道具でできる）。
    tiles: [
      'MMMMMMMMMMMM',
      '........ξ...',
      '....M..M....',
      '.....HH.....',
      '....M..M....',
      '......i.....',
      '..ξ.....M...',
      '.....M.MBM..',
      '...C........',
      'M...........',
    ],
    initLitTorches: ['3,5'],
    chestContents: { '7,8': { type: 'rupee', value: 60, name: 'ルピー×60' } },
    showConditions: {
      '7,8': { trigger: 'torchesLit', message: '🔥 狼煙が 上がり、封じの 岩が 崩れた！' },
    },
    signData: {
      '5,6': {
        name: '三叉の道標',
        lines: [
          '【峰の三叉】',
          '西は 空へ 上がる門。東は 灰と 火の 領分。',
          '南は 峰の 見張り。狼煙は 二つで 上がる。',
        ],
      },
    },
  },
  {
    key: '10,1',
    title: '茂み道',
    // 北の灰境（`10,0`）と南の篝火跡（`10,2`）をつなぐ草の辻。中央の茂みの塊の奥に宝箱、
    // 東の登り口には跳躍蜘蛛 β が居座る（茂みの塊を跳び越えて来る＝地形が効く相手）。
    // ⚠️ 弱点持ちの敵（η 術士＝矢 など）は**フィールドに置けない**。
    //    tests/enemy-placement.spec.js ④ は UNLOCKED_AT['field'] を空集合として扱う
    //    （地域ごとに到達時期が違う∴地域別の表を作るまでは「道具を持たない地点」扱い）。
    tiles: [
      '...........M',
      '...t....ξ..M',
      '..t........M',
      '......i....M',
      '.........β..',
      '............',
      '....uuu....M',
      '....uBu....M',
      '....uuu....M',
      '...........M',
    ],
    chestContents: { '7,5': { type: 'rupee', value: 25, name: 'ルピー×25' } },
    signData: {
      '3,6': {
        name: '茂み道の道標',
        lines: [
          '【茂み道】',
          '北へ 登れば 灰境。南へ 下れば 冷えた 篝火。',
          '茂みは 刈れる。奥に 誰かが 置いた 物がある。',
        ],
      },
    },
    tools: [{ cell: '7,5', control: 'noBush', why: '茂みを刈らないと茂みの奥の宝に届かない' }],
  },
];

// ── 小道具 ──────────────────────────────────────────────────────────────────
const key = (r, c) => `${r},${c}`;
const parse = (rows, label) => {
  if (rows.length !== ROWS) throw new Error(`${label}: 行数が ${rows.length}（${ROWS} でない）`);
  return rows.map((row, r) => {
    if ([...row].length !== COLS) throw new Error(`${label}: row${r} の列数が ${[...row].length}（${COLS} でない）`);
    return [...row];
  });
};
/**
 * ★ 石畳は tiles 層に置かない＝bgTiles 側の 'o'（`bg-stonefloor` ＝平らな石床）で敷く。
 * tiles 層の 'o' は浮き出た石ブロックとして描かれる＝「歩けるのに壁に見える」（④で実測）。
 * 'o' も '.' も通行可＝**この振り替えで通行可能性は1セルも変わらない**。
 * ⚠️ 引き換えにランドマーク軸（LANDMARK_TILES in tiles）は 'o' では取れない。
 */
function pave(spec, tiles) {
  const paved = new Set();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (tiles[r][c] === TILE.STONE_FLOOR) { paved.add(key(r, c)); tiles[r][c] = TILE.FLOOR; }
  }
  for (const k of spec.pave ?? []) {
    const [r, c] = k.split(',').map(Number);
    if (tiles[r][c] === TILE.STONE_FLOOR) throw new Error(`${spec.key}: pave ${k} は grid が既に 'o'＝指定が重複`);
    if (tiles[r][c] === TILE.FLOOR) throw new Error(`${spec.key}: pave ${k} は素の床＝grid に 'o' と書けばよい`);
    paved.add(k);
  }
  return paved;
}

/** 下地 bgTiles を2次元で組む（草 'g' 基調・水 '~'・石畳 'o'）。ソルバーにも同じ物を渡す。 */
function bgGridOf(spec, paved) {
  const water = new Set(spec.water ?? []);
  const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = key(r, c);
    if (paved.has(k)) bg[r][c] = TILE.STONE_FLOOR;
    else if (water.has(k)) bg[r][c] = TILE.WATER;
    else if (spec.bgOf) bg[r][c] = spec.bgOf(r, c);
  }
  return bg;
}

const RING = [];
for (let c = 0; c < COLS; c++) { RING.push([0, c]); RING.push([ROWS - 1, c]); }
for (let r = 1; r < ROWS - 1; r++) { RING.push([r, 0]); RING.push([r, COLS - 1]); }
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 徒歩で立てるか（道具なし・ゲート閉）。下地の水は壁（実エンジン・接続チェッカーと同じ）。 */
const walkable = (tiles, bg, r, c) => {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  if (bg[r][c] === TILE.WATER) return false;
  const ch = tiles[r][c];
  if (ch === TILE.GATE) return false;
  if (ch === TILE.BREAKABLE_WALL) return false;
  if (ENEMY_META[ch]) return true;
  return !isHardBlocked(ch);
};

// ── ① 外周リングの必要開口（隣画面の実データからの不動点） ──────────────────
// 規則＝「隣が実在するなら隣の実タイルに合わせる（ミラー）／隣も今回作る画面なら
// 標準の細い十字（縦は col5,6・横は row4,5）」＋衝突する角セルは閉じる。
//
// ⚠️ `4,0`↔`4,1` だけ標準の十字では足りない。`5,1`（既存・作り替えない）の (0,0) が
//    歩ける∴ `4,1`(0,11) が開き、その north の `4,0`(9,11) も開く。col10/col11 を
//    この継ぎ目の渡り所として明示しないと (9,11) が1セルだけ孤立する（②が赤くなる）。
const SEAM_EXTRA = new Map([['4,0|4,1', new Set(['v:10', 'v:11'])]]);
const seamKey = (a, b) => [a, b].sort().join('|');
const isCross = (axis, r, c, selfKey, nbKey) => {
  if (axis === 'v' ? (c === 5 || c === 6) : (r === 4 || r === 5)) return true;
  return SEAM_EXTRA.get(seamKey(selfKey, nbKey))?.has(`${axis}:${axis === 'v' ? c : r}`) ?? false;
};
const crossingsOf = (sx, sy, r, c) => {
  const out = [];
  if (r === 0) out.push([`${sx},${sy - 1}`, ROWS - 1, c, 'v']);
  if (r === ROWS - 1) out.push([`${sx},${sy + 1}`, 0, c, 'v']);
  if (c === 0) out.push([`${sx - 1},${sy}`, r, COLS - 1, 'h']);
  if (c === COLS - 1) out.push([`${sx + 1},${sy}`, r, 0, 'h']);
  return out;
};
function requiredRings(fieldStages, rebuiltKeys) {
  const req = new Map();
  for (const k of rebuiltKeys) req.set(k, Array.from({ length: ROWS }, () => Array(COLS).fill(false)));
  let changed = true;
  while (changed) {          // 作り替え画面同士が互いを参照する∴不動点まで回す
    changed = false;
    for (const k of rebuiltKeys) {
      const [sx, sy] = k.split(',').map(Number);
      for (const [r, c] of RING) {
        let want = false, veto = false;
        for (const [nk, nr, nc, axis] of crossingsOf(sx, sy, r, c)) {
          if (rebuiltKeys.has(nk)) {
            if (isCross(axis, r, c, k, nk) || req.get(nk)[nr][nc]) want = true;
          } else {
            const ns = fieldStages[nk];
            if (!ns) continue;                                  // 地図の外＝この向きは無関係
            if (!isHardBlocked(cellTile(ns, nr, nc))) want = true;
            else veto = true;                                   // 隣が壁＝開けたら dead edge
          }
        }
        const next = want && !veto;
        if (req.get(k)[r][c] !== next) { req.get(k)[r][c] = next; changed = true; }
      }
    }
  }
  return req;
}

function checkRing(spec, tiles, bg, need) {
  for (const [r, c] of RING) {
    const open = walkable(tiles, bg, r, c);
    if (need[r][c] && !open)
      throw new Error(`${spec.key}: 外周 ${key(r, c)} は開いていないといけない（隣が開いている＝継ぎ目バグ）`);
    if (!need[r][c] && open)
      throw new Error(`${spec.key}: 外周 ${key(r, c)} は閉じていないといけない（隣が壁 or 地図の外＝dead edge）`);
    if (need[r][c]) continue;
    // 閉じた外周の見た目＝北端の帯は地図境界も内側も断崖 'M' で統一する。
    if (tiles[r][c] !== TILE.MOUNTAIN)
      throw new Error(`${spec.key}: 閉じた外周 ${key(r, c)} が '${tiles[r][c]}'（'M' で統一する）`);
  }
}

// ── ② 徒歩だけの到達（開いた外周が全部ひとつの塊か） ────────────────────────
function walkBFS(tiles, bg, startKey) {
  const seen = new Set([startKey]);
  const q = [startKey];
  while (q.length) {
    const [r, c] = q.shift().split(',').map(Number);
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc, k = key(nr, nc);
      if (seen.has(k)) continue;
      if (!walkable(tiles, bg, nr, nc)) continue;
      seen.add(k); q.push(k);
    }
  }
  return seen;
}

// ── ③ 状態空間（実エンジンの遷移の写し） ────────────────────────────────────
const FULL = { hasLadder: true, hasCandle: true, bushCuttable: true, pitCrossable: true };
const CONTROLS = {
  noTools: { ...FULL, noTools: true },
  noLadder: { ...FULL, hasLadder: false },
  noPush: { ...FULL, noPush: true },
  noBush: { ...FULL, bushCuttable: false },
};
function solverFor(tiles, bg, spec, opt) {
  const breaks = Object.fromEntries(
    Object.entries(spec.breakableWalls ?? {}).map(([k, v]) => [k, v.breakDef]));
  // ソルバーの links は [switch, [gate...]] の entries 形式（stage の {switchId,gateId} と別）。
  const bySwitch = new Map();
  for (const { switchId, gateId } of spec.links ?? []) {
    if (!bySwitch.has(switchId)) bySwitch.set(switchId, []);
    bySwitch.get(switchId).push(gateId);
  }
  return makeSolver(tiles, bg, [...bySwitch], breaks, new Set(spec.initLitTorches ?? []), opt);
}
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
/** 到達状態のどれかで石が乗っているセル（＝踏めなくて正しいボタン）。 */
const stoneCellsOf = (seen) => {
  const out = new Set();
  for (const st of seen) for (const k of st.split('|')[1].split(';')) if (k) out.add(k);
  return out;
};

// 壁として据え置くタイル（到達しなくてよい）。'i' 石碑・'H' かがり火・'Y' スイッチは
// 「隣から使う／撃つ」物。'%' 虚空と 'h'/'p' 塔は虚空の向こうの絵＝決して届かない。
// 穴 'x' は**除外しない**＝はしごで渡るとき実エンジンはその1セルを踏む∴到達対象。
const PROP_TILES = new Set([
  TILE.TREE, TILE.MOUNTAIN, TILE.WALL, TILE.WATER, TILE.LAVA, TILE.SIGN, TILE.TORCH,
  TILE.SWITCH, TILE.SKY, TILE.HOUSE_WALL, TILE.HOUSE_ROOF,
]);

function checkStates(spec, tiles, bg, openRing) {
  const S = solverFor(tiles, bg, spec, FULL);
  const { seen, rev } = explore(S, openRing[0]);
  const reached = cellsOf(seen);
  const stoned = stoneCellsOf(seen);

  // (a) 無駄セル0＝壁でないセルは全部（道具を使えば）到達できる。
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = key(r, c);
    if (PROP_TILES.has(tiles[r][c])) continue;
    if (bg[r][c] === TILE.WATER) continue;              // 下地が水＝歩けないのが正しい（池）
    // 袋小路のボタンは「石で押さえる前提」＝プレイヤーは一度も踏めないのが正しい。
    if (tiles[r][c] === TILE.BUTTON && stoned.has(k)) continue;
    if (!reached.has(k))
      throw new Error(`${spec.key}: ${k}('${tiles[r][c]}') に道具を使っても到達できない＝無駄セル`);
  }
  // (b) 看板は隣に立てる＝読める。
  for (const k of Object.keys(spec.signData ?? {})) {
    const [nr, nc] = k.split(',').map(Number);
    if (!DIRS.some(([dr, dc]) => reached.has(key(nr + dr, nc + dc))))
      throw new Error(`${spec.key}: 看板 ${k} に隣接できない＝読めない`);
  }
  // (b') かがり火は隣に立てる＝ロウソク/ブーメランで点けられる。
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (tiles[r][c] !== TILE.TORCH) continue;
    if (!DIRS.some(([dr, dc]) => reached.has(key(r + dr, c + dc))))
      throw new Error(`${spec.key}: かがり火 ${key(r, c)} に隣接できない＝点けられない封印`);
  }
  // (c) 入って詰まない＝どの到達状態からも「開いた外周セルに立つ状態」へ戻れる。
  const back = new Set();
  const rq = [];
  const openSet = new Set(openRing);
  for (const st of seen) if (openSet.has(st.split('|')[0])) { back.add(st); rq.push(st); }
  while (rq.length) {
    const st = rq.shift();
    for (const prev of rev.get(st) ?? []) {
      if (back.has(prev)) continue;
      back.add(prev); rq.push(prev);
    }
  }
  const stuck = [...seen].filter((st) => !back.has(st));
  if (stuck.length)
    throw new Error(`${spec.key}: 外周へ戻れない状態が ${stuck.length} 件（例 ${stuck[0]}）＝入って詰む`);

  // (d) 対照実験＝仕掛けが飾りでない。
  for (const t of spec.tools ?? []) {
    const opt = CONTROLS[t.control];
    if (!opt) throw new Error(`${spec.key}: 未知の control '${t.control}'`);
    const r2 = cellsOf(explore(solverFor(tiles, bg, spec, opt), openRing[0]).seen);
    if (r2.has(t.cell))
      throw new Error(`${spec.key}: ${t.control} でも ${t.cell} に届く＝「${t.why}」が成立していない`);
  }
  return { states: seen.size, reached };
}

// ── ⑦ ブーメランの火運び（射程を含めた幾何の検証） ──────────────────────────
// 実エンジン（game/projectile.js collectAlongBoomerang）＝飛行中に点いた 'H' を通ると
// 炎を拾い、消えた 'H' を通ると点ける。折り返しは maxRange＝木のブーメランで 3 セル。
// 往路・復路のどちらでも拾える∴「同じ直線上・射程内に 火元と 消えた火が 並ぶ」立ち位置が
// 実在すれば1投で灯る。投擲物が止まるのは '#' と 未破壊の '!' だけ（矢と同じ規則）。
function checkBoomerangFire(spec, tiles, reached) {
  const torches = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (tiles[r][c] === TILE.TORCH) torches.push(key(r, c));
  }
  if (!torches.length) return;
  const lit = new Set(spec.initLitTorches ?? []);
  if (!lit.size) return;                    // 火種が無い画面＝ロウソク（後から戻る）専用
  const range = BOOMERANG_TIERS[0].maxRange;
  const unlit = torches.filter((k) => !lit.has(k));
  let progress = true;
  while (progress) {                        // 点いた火が次の火元になる∴不動点まで
    progress = false;
    for (const target of unlit.filter((k) => !lit.has(k))) {
      for (const p of reached) {
        const [pr, pc] = p.split(',').map(Number);
        for (const [dr, dc] of DIRS) {
          let sawLit = false, sawTarget = false;
          for (let d = 1; d <= range; d++) {
            const rr = pr + dr * d, cc = pc + dc * d;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) break;
            const ch = tiles[rr][cc];
            if (ch === TILE.WALL) break;
            if (ch === TILE.BREAKABLE_WALL) break;   // 未破壊で止まる（保守側）
            const k = key(rr, cc);
            if (lit.has(k)) sawLit = true;
            if (k === target) sawTarget = true;
          }
          if (sawLit && sawTarget) { lit.add(target); progress = true; break; }
        }
        if (lit.has(target)) break;
      }
    }
  }
  const dead = torches.filter((k) => !lit.has(k));
  if (dead.length)
    throw new Error(`${spec.key}: かがり火 ${dead.join(' ')} は木のブーメラン（射程${range}）では灯せない`
      + '＝到着時の道具で解けない封印');
}

// ── ④⑥ 中身の整合（宝箱/看板/軸） ───────────────────────────────────────────
function buildStage(spec, tiles, bg) {
  const bgTiles = {};
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) bgTiles[key(r, c)] = bg[r][c];
  const stage = {
    cols: COLS,
    rows: ROWS,
    tiles,
    bgTiles,
    links: spec.links ?? [],
    enemyDirs: spec.enemyDirs ?? {},
    chestContents: spec.chestContents ?? {},
    floorItems: spec.floorItems ?? {},
    objects: {},
    npcData: {},
    shopData: {},
    mapEnters: spec.mapEnters ?? {},
    showConditions: spec.showConditions ?? {},
    breakableWalls: spec.breakableWalls ?? {},
    isBossRoom: false,
    signData: spec.signData ?? {},
  };
  if (spec.initLitTorches?.length) stage.initLitTorches = spec.initLitTorches;
  return stage;
}

function checkContent(spec, stage) {
  const t = stage.tiles;
  const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r][c]; };
  for (const k of Object.keys(stage.chestContents))
    if (at(k) !== TILE.CHEST) throw new Error(`${spec.key}: 宝箱 ${k} のタイルが '${at(k)}'（'B' でない）`);
  for (const [k, sc] of Object.entries(stage.showConditions)) {
    if (at(k) !== TILE.CHEST) throw new Error(`${spec.key}: showConditions ${k} のタイルが '${at(k)}'（'B' でない）`);
    if (sc.trigger === 'torchesLit' && !t.some((row) => row.includes(TILE.TORCH)))
      throw new Error(`${spec.key}: torchesLit で封じた ${k} の画面に 'H' が無い＝開かない封印`);
  }
  for (const [k, sd] of Object.entries(stage.signData)) {
    if (at(k) !== TILE.SIGN) throw new Error(`${spec.key}: 看板 ${k} のタイルが '${at(k)}'（'i' でない）`);
    if (!sd.lines?.length) throw new Error(`${spec.key}: 看板 ${k} に本文が無い（無言看板）`);
  }
  for (const { switchId, gateId } of stage.links) {
    if (at(switchId) !== TILE.SWITCH)
      throw new Error(`${spec.key}: links の switch ${switchId} が '${at(switchId)}'（'Y' でない）`);
    if (at(gateId) !== TILE.GATE)
      throw new Error(`${spec.key}: links の gate ${gateId} が '${at(gateId)}'（'T' でない）`);
  }
  for (const k of stage.initLitTorches ?? []) {
    if (at(k) !== TILE.TORCH) throw new Error(`${spec.key}: initLitTorches ${k} が '${at(k)}'（'H' でない）`);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (t[r][c] === TILE.SIGN && !stage.signData[key(r, c)])
      throw new Error(`${spec.key}: 'i'(${key(r, c)}) に signData が無い＝無言看板`);
    if (t[r][c] === TILE.CHEST && !stage.chestContents[key(r, c)])
      throw new Error(`${spec.key}: 'B'(${key(r, c)}) に中身が無い`);
    if (t[r][c] === TILE.BREAKABLE_WALL && !stage.breakableWalls[key(r, c)])
      throw new Error(`${spec.key}: '!'(${key(r, c)}) に breakableWalls の定義が無い`);
    if (t[r][c] === TILE.MAP_ENTER && !stage.mapEnters[key(r, c)])
      throw new Error(`${spec.key}: '>'(${key(r, c)}) に mapEnters が無い`);
    if (t[r][c] === TILE.SWITCH && !stage.links.some((l) => l.switchId === key(r, c)))
      throw new Error(`${spec.key}: 'Y'(${key(r, c)}) に links が無い＝押しても何も開かない`);
    if (ENEMY_META[t[r][c]]?.directional && !stage.enemyDirs[key(r, c)])
      throw new Error(`${spec.key}: 向き別スプライトの敵 '${t[r][c]}'(${key(r, c)}) に enemyDirs が無い`);
    // 弱点持ちはフィールドに置けない（tests/enemy-placement.spec.js ④ は
    // UNLOCKED_AT['field'] を空集合＝道具未所持として扱う）。
    if (ENEMY_META[t[r][c]]?.weakness)
      throw new Error(`${spec.key}: 弱点持ちの敵 '${t[r][c]}'(${key(r, c)}) は field に置けない`
        + `（要 ${ENEMY_META[t[r][c]].weakness.type}）`);
  }
  const axes = screenAxes(stage);
  if (axes.size < 2) throw new Error(`${spec.key}: 軸が ${axes.size} 個（[${[...axes]}]）＝素通り画面`);
  return axes;
}

// ── 実行 ────────────────────────────────────────────────────────────────────
const d = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = d.layers.field.stages;
const rebuilt = new Set(SCREENS.map((s) => s.key));
for (const k of rebuilt) if (!stages[k]) throw new Error(`field ${k} が無い`);

const req = requiredRings(stages, rebuilt);
if (RINGS_ONLY) {
  for (const s of SCREENS) {
    const g = req.get(s.key);
    console.log(`=== ${s.key} ${s.title}`);
    console.log('   要開口:', RING.filter(([r, c]) => g[r][c]).map(([r, c]) => key(r, c)).join(' '));
  }
  process.exit(0);
}

const report = [];
for (const spec of SCREENS) {
  const tiles = parse(spec.tiles, spec.key);
  const paved = pave(spec, tiles);   // 石畳を tiles→bgTiles へ振り替える（通行可能性は不変）
  const bg = bgGridOf(spec, paved);
  checkRing(spec, tiles, bg, req.get(spec.key));

  // ② 開いた外周が全部ひとつの塊にあること。
  const openRing = RING.filter(([r, c]) => req.get(spec.key)[r][c]).map(([r, c]) => key(r, c));
  if (!openRing.length) throw new Error(`${spec.key}: 開いた外周が無い＝孤立画面`);
  const comp = walkBFS(tiles, bg, openRing[0]);
  const off = openRing.filter((k) => !comp.has(k));
  if (off.length) throw new Error(`${spec.key}: 外周 ${off.join(' ')} が徒歩で他の外周とつながらない`);

  const { states, reached } = checkStates(spec, tiles, bg, openRing);
  checkBoomerangFire(spec, tiles, reached);
  const stage = buildStage(spec, tiles, bg);
  const axes = checkContent(spec, stage);
  report.push({ spec, stage, states, axes });
}

// ⑤ 同一配置の重複（既存の全画面と照合＝dup ratchet を増やさない）。
const hashOf = (s) => (s.tiles ?? []).map((row) => (Array.isArray(row) ? row.join('') : row)).join('|');
const others = new Map();
for (const [k, s] of Object.entries(stages)) if (!rebuilt.has(k)) others.set(hashOf(s), k);
const mine = new Map();
for (const { spec, stage } of report) {
  const h = hashOf(stage);
  if (others.has(h)) throw new Error(`${spec.key}: 既存 ${others.get(h)} と同一配置`);
  if (mine.has(h)) throw new Error(`${spec.key}: ${mine.get(h)} と同一配置`);
  mine.set(h, spec.key);
}

for (const { spec, stage } of report) stages[spec.key] = stage;

// 書式は他の migrate と同じ 2スペース・末尾改行なし（違えるとファイル全体が差分になる）。
if (!DRY) writeFileSync(MAP_PATH, JSON.stringify(d, null, 2));

console.log(`✅ 北の外周帯 +7画面を作り込み${DRY ? '（--dry: 書き込みなし）' : ''}`);
for (const { spec, states, axes } of report) {
  console.log(`   ${spec.key.padEnd(5)} ${spec.title.padEnd(11)} 軸[${[...axes].join(',')}] 状態 ${states}`
    + (spec.tools?.length ? ` 対照 ${spec.tools.map((t) => t.control).join('/')}` : ''));
}
