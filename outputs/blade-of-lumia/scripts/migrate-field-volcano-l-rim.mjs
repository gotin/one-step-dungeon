#!/usr/bin/env node
/**
 * migrate-field-volcano-l-rim.mjs
 *   9-6-BASE 外周解体＋隣接地域編入（キュー8番）の**火山 L 外輪 +9画面**を作り込む。
 *   `10,0` `11,0` `13,0` `14,0` `15,0` `14,1` `15,1` `14,2` `15,2`
 *   （実データで全て 0〜1軸の空塗り絵＝縁取りだけ残った外周）。
 *
 * 背景:
 *   火山 L は 17画面のうち中央8画面（カルデラ・弓ゲート・かがり火など）だけが作り込まれ、
 *   北の外輪と東の下り坂が「歩けるが何も無い」ままだった。ここを埋めると L は 17/17 が
 *   作り込み済みになり、併せて dup ペア `15,1`/`15,2`（同一配置）も解消する。
 *   この編入分を選んだ理由＝残っている地域別の「未満2軸の塊」で L が最小（9枚）＝
 *   確定済みの実行順「小さい編入分から着手」（湖W東 +7 → 森F北西 +8 → ここ）に沿う。
 *
 * 設計（火山 L の語彙・FIELD-9-6-DESIGN.md §18 と既存 L 画面の実データから）:
 *   下地 bgTiles は灰 'c'（既存 L 画面と同じ単一値）／閉じた外周は岩山 'M'／
 *   溶岩は実タイル 'l'（通行不可・**はしごでは渡れない**）／溶岩を渡るのは橋 'v'。
 *   道具の時制（§8-1）＝到着時は{剣・盾・ブーメラン・弓}のみ。ロウソク(D4)・爆弾(D6)・
 *   はしご(D5)・笛(D8) は「後から戻って開ける」側＝外輪の宝はこの4つで配る。
 *   既存 L が既に見せた仕掛け（弓ゲート 12,1／ブーメラン島 12,3／爆破壁 12,3／
 *   かがり火 11,2／石押し 12,2／killAll 13,1）と重ならないよう、外輪では
 *   「はしごで火口の亀裂を渡る」「石でボタンを押さえてゲートを開ける」を主役にする。
 *
 *   1画面ずつ「何のための画面か」を決めた一点物（量産しない）:
 *     10,0 灰境の登り口 … 草原G5から灰へ変わる関門。遺構の石畳＋茂みの奥の宝
 *     11,0 外輪の隘路   … 溶岩の裂け目を橋1本で渡る。火吐き亀が宝を守る
 *     13,0 熔けた岩棚   … 爆弾で割る岩室の宝＋黒曜の岩棚（石畳を下地で敷いた段丘）
 *     14,0 亀裂の尾根   … 火口の亀裂 'x' をはしごで渡る宝＋尾根道の突進猪
 *     15,0 果ての火口跡 … 北東の袋小路。火口の中島へ橋1本で渡る（コウモリ群）
 *     14,1 灰の十字路   … 石をボタンへ押し込みゲートを開ける四つ辻
 *     15,1 東の狼煙台   … かがり火を点すと封じが解ける狼煙台（ロウソクで再訪）
 *     14,2 灰の広庭     … 南北と雪原をつなぐ広場。灰の段丘＋火吐き亀
 *     15,2 熔け残りの下り … 雪原へ下る最後の灰。茂みの奥の宝と道標
 *
 * 自己検証（このスクリプトは検証込みで1本＝流し込みだけの migrate にしない）:
 *   ① 外周リング：隣画面の**実データ**から必要な開口を不動点で求め、盤面と1セル単位で照合。
 *      閉じたリングセルは岩山 'M' で統一（地図境界も内側も L は 'M'）。
 *   ② 徒歩だけの到達（道具なし・ゲート閉）で、開いた外周セルが**全部ひとつの塊**にある。
 *   ③ 状態空間（scripts/lib/blade-solver.mjs＝実エンジンの遷移の写し）で
 *      - 壁でないセルが**全部**到達可能＝無駄セル0
 *      - 宝箱・看板の隣が到達可能
 *      - どの到達状態からも開いた外周セルへ戻れる＝入って詰まない
 *      - 対照実験で「その道具が無いと届かない」＝仕掛けが飾りでないこと
 *   ④ 画面の軸（field-quality.screenAxes）が全画面 2軸以上＝素通り画面を増やさない。
 *   ⑤ 同一配置の重複が無い（既存 320 画面すべてとタイル列を照合）。
 *   ⑥ 宝箱/showConditions のセルは 'B'・看板は 'i' で本文がある・'!' は breakableWalls 定義あり。
 *      加えて **torchesLit で封じた宝箱の画面には 'H' が実在すること**（点けられない封印を作らない）。
 *
 * 使い方: node scripts/migrate-field-volcano-l-rim.mjs [--dry] [--rings]
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked, cellTile } from './lib/connectivity.mjs';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { screenAxes } from './lib/field-quality.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const DRY = process.argv.includes('--dry');
const RINGS_ONLY = process.argv.includes('--rings');

// ── 盤面 ────────────────────────────────────────────────────────────────────
// '.' 灰の地面（下地 bgTiles 'c'）/ 'M' 岩山 / 'l' 溶岩（はしご不可・橋で渡る）/
// 'v' 橋 / 'u' 茂み / '!' 爆弾で割れる岩 /
// 'o' 石畳（黒曜の岩棚・遺構・火口の縁）＝**盤面へ落とす前に bgTiles へ振り替える**（下の pave()）/
// 'x' 火口の亀裂（穴。実描画は黒い縦穴∴蒸気の出る「噴気孔」とは呼ばない）/
// '*' 押せる石 / 'S' ボタン / 'T' ゲート / 'H' かがり火 / 'B' 宝箱 / 'i' 石碑・道標 /
// 'φ' 火吐き亀 / 'ψ' 呪い火 / 'ω' 突進猪 / 'ξ' コウモリ群（いずれも向き別スプライト不要）。
//
// tools 欄＝その画面の仕掛けの「必須性」を対照実験で示す指定。
//   { cell, control } … control を封じたら cell に到達できないこと。
//   control: 'noTools'（爆弾/弓/ロウソク封じ）/ 'noLadder' / 'noPush' / 'noBush'
const SCREENS = [
  {
    key: '10,0',
    title: '灰境の登り口',
    // 草原 G5（西）から火山へ入る関門。下地を西だけ草にして「ここから灰」を絵で見せる。
    // 北の遺構（石畳の広間）が目印、その東端の茂みの奥が宝。南は溶岩の細流を橋で渡る。
    tiles: [
      'MMMMMMMMMMMM',
      '....MoooouBM',
      '..ψ.MoooMMMM',
      '....Mooooo.M',
      '............',
      '.....i......',
      '..M.......ψM',
      '.llllvllll.M',
      '...........M',
      '...........M',
    ],
    // 下地＝西から東へ草→灰のぎざぎざした境目（接続には影響しない見た目だけの作り込み）。
    bgOf: (r, c) => (c <= 3 - Math.floor(r / 4) ? 'g' : 'c'),
    pave: ['1,9', '1,10'],   // 茂みと宝箱も遺構の石畳の上（'o' と書けないセルの下地）
    chestContents: { '1,10': { type: 'item', item: 'healPotion', name: '回復薬（小）' } },
    signData: {
      '5,5': {
        name: '灰境の道標',
        lines: [
          '【灰境の登り口】',
          'ここより先は 灰と火の領分。',
          '草は絶え 石は熱を帯びる。',
        ],
      },
    },
    tools: [{ cell: '1,10', control: 'noBush', why: '茂みを刈らないと遺構の宝に届かない' }],
  },
  {
    key: '11,0',
    title: '外輪の隘路',
    // 外輪を南北に裂く溶岩の谷。西と東をつなぐのは橋 (4,4) の一本だけ＝道が細い。
    // 東側では火吐き亀が宝箱の前に居座る（封印ではなく「居座り」で戦わせる）。
    tiles: [
      'MMMMMMMMMMMM',
      'M...l......M',
      'M.i.l..B...M',
      'M...l..φ...M',
      '....v.......',
      '....l.......',
      'M...l..ψ...M',
      'M...l......M',
      'M...l......M',
      'MMMMM..MMMMM',
    ],
    chestContents: { '2,7': { type: 'rupee', value: 30, name: 'ルピー×30' } },
    signData: {
      '2,2': {
        name: '隘路の石碑',
        lines: [
          '【外輪の隘路】',
          '谷を裂くは 冷えぬ流れ。',
          '橋は 一本きり。落ちれば 帰れぬ。',
        ],
      },
    },
  },
  {
    key: '13,0',
    title: '熔けた岩棚',
    // 黒曜が板状に固まった岩棚（石畳 'o'）が広間の目印。北西の岩室は爆弾で割って入る。
    // 東の細道は溶岩の帯を橋 (4,8) で渡った先＝ここも道が細い。
    tiles: [
      'MMMMMMMMMMMM',
      'MMB!....l..M',
      'M.MM....l..M',
      'M.......l..M',
      '.......ov...',
      '..ooooool...',   // 岩棚が橋 (4,8) の袂まで続く（袂だけ孤立した石畳に見えないように）
      'M.oio...l..M',
      'M.......l..M',
      'M.......l..M',
      'MMMMM..MMMMM',
    ],
    chestContents: { '1,2': { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } },
    pave: ['6,3'],   // 石碑は岩棚の上に立つ（下地が灰だと段丘に穴が空いて見える）
    breakableWalls: { '1,3': { breakDef: 2 } },
    signData: {
      '6,3': {
        name: '岩棚の石碑',
        lines: [
          '【熔けた岩棚】',
          '黒き板は 冷えた炎の名残。',
          '北の岩肌に 詰まった 空洞がある。',
        ],
      },
    },
    tools: [{ cell: '1,2', control: 'noTools', why: '爆弾で岩を割らないと岩室の宝に入れない' }],
  },
  {
    key: '14,0',
    title: '亀裂の尾根',
    // 尾根道に火口の亀裂 'x' が点々と開く。北西の宝は幅1の亀裂をはしごで渡る先にある。
    // 突進猪と呪い火が尾根を行き来する＝走り抜けるか倒すかを選べる。
    tiles: [
      'MMMMMMMMMMMM',
      'MBx........M',
      'MM.........M',
      'M....x.....M',
      '.....ω......',
      '..........ψ.',
      'M.....x....M',
      'M..........M',
      'M....x.....M',
      'MMMMM..MMMMM',
    ],
    chestContents: { '1,1': { type: 'rupee', value: 40, name: 'ルピー×40' } },
    tools: [{ cell: '1,1', control: 'noLadder', why: 'はしごで亀裂を渡らないと宝に届かない' }],
  },
  {
    key: '15,0',
    title: '果ての火口跡',
    // 地図の北東端＝袋小路（西と南だけが口）。冷えた火口の縁を石畳が輪に囲み、
    // 中島へは橋 (5,5) 一本。コウモリ群が火口の上を舞う。
    tiles: [
      'MMMMMMMMMMMM',
      'MMoooooooMMM',
      'MMollllloMMM',
      'M.ol.B.lo.MM',
      '..ol...lo.MM',
      '..ollvllo.MM',
      'M.ooooooo.MM',
      'M..i....ξ.MM',
      'MM...ξ....MM',
      'MMMMM..MMMMM',
    ],
    chestContents: { '3,5': { type: 'item', item: 'healPotion', name: '回復薬（小）' } },
    signData: {
      '7,3': {
        name: '火口跡の石碑',
        lines: [
          '【果ての火口跡】',
          '古い火口は 冷えて輪に残った。',
          '中の島へ 渡した橋は 一本。',
        ],
      },
    },
  },
  {
    key: '14,1',
    title: '灰の十字路',
    // 四方に抜ける辻。北西のゲート 'T' は、石 '*' を西へ一手押してボタン 'S' に
    // 乗せると恒久に開く（自分で踏んでも開くが、踏んだままでは通れない＝石が要る）。
    // 東の細道は溶岩の帯を橋 (4,9) で渡る。
    tiles: [
      'MMMMM..MMMMM',
      'MMBM.....l.M',
      'M.T......l.M',
      'M........l.M',
      '..S*.....v..',
      '.........l..',
      'M...ψ....l.M',
      'M........l.M',
      'M..........M',
      'MMMMM..MMMMM',
    ],
    chestContents: { '1,2': { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } },
    tools: [{ cell: '1,2', control: 'noPush', why: '石をボタンに押し込まないとゲートが開かない' }],
  },
  {
    key: '15,1',
    title: '東の狼煙台',
    // 石畳の台にかがり火が据えられ、点すと封じの岩が崩れて宝箱が現れる（トリガ torchesLit）。
    // 到着時は火種が無い＝ロウソク（ダンジョン4の報酬）を得てから戻る画面。
    tiles: [
      'MMMMM..MMMMM',
      'M..l.......M',
      'M..l.ooo...M',
      'M..l.oHo.i.M',
      '...v.oBo...M',
      '...l.ooo...M',
      'M..l.......M',
      'M..l.......M',
      'M..........M',
      'MMMMM..MMMMM',
    ],
    // 報酬は大きめのルピー。⚠️ `heartContainer` は**配置総数がゲームの最大ハート数**なので
    // ここで増やすとハート予算（現在 21 枚）を黙って動かす＝リバランス（キュー9番）の領分。
    chestContents: { '4,6': { type: 'rupee', value: 100, name: 'ルピー×100' } },
    // 台座の中央（かがり火と宝箱のセル）も石畳＝3×3が1枚の台に見える
    pave: ['3,6', '4,6'],
    showConditions: {
      '4,6': { trigger: 'torchesLit', message: '🔥 狼煙が上がり、封じの岩が 崩れ落ちた！' },
    },
    signData: {
      '3,9': {
        name: '狼煙台の石碑',
        lines: [
          '【東の狼煙台】',
          '火を掲げよ。灰の向こうへ 知らせが渡る。',
          '火種を持たぬ者は いずれ戻れ。',
        ],
      },
    },
  },
  {
    key: '14,2',
    title: '灰の広庭',
    // 外輪の南で西・南へ大きく開く広場（雪原 S への下り口を兼ねる）。灰の段丘（石畳）と
    // 道標が目印。溶岩の細流を橋 (3,8) で渡ると東の宝。火吐き亀と呪い火が広庭を巡る。
    tiles: [
      'MMMMM..MMMMM',
      '....M...l..M',
      '..M.....l..M',
      '........v.BM',
      '...φ.oo.l...',
      '....ioo.l...',
      '..ψ.M...l..M',
      '....M...l..M',
      '.......ψ...M',
      '............',
    ],
    chestContents: { '3,10': { type: 'rupee', value: 50, name: 'ルピー×50' } },
    signData: {
      '5,4': {
        name: '広庭の道標',
        lines: [
          '【灰の広庭】',
          '西へ戻れば 火口。南へ下れば 雪。',
          '灰の段丘で 息を整えよ。',
        ],
      },
    },
  },
  {
    key: '15,2',
    title: '熔け残りの下り',
    // 灰が尽き雪原へ下る最後の画面。北西の岩室は茂みの奥（刈ってから入る）。
    // 溶岩の熔け残りを橋 (4,7) で渡ると東の袋小路。道標が南の雪原を指す。
    tiles: [
      'MMMMM..MMMMM',
      'MMBM...l...M',
      'M.u....l...M',
      'M......l...M',
      '.......v...M',
      '.......l...M',
      'M......l...M',
      'M...i......M',
      'M..........M',
      '...........M',
    ],
    chestContents: { '1,2': { type: 'rupee', value: 35, name: 'ルピー×35' } },
    signData: {
      '7,4': {
        name: '下りの道標',
        lines: [
          '【熔け残りの下り】',
          '南へ下れば 灰は雪に変わる。',
          '氷の底に 沈んだ遺跡があるという。',
        ],
      },
    },
    tools: [{ cell: '1,2', control: 'noBush', why: '茂みを刈らないと岩室の宝に入れない' }],
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
 *
 * tiles 層の 'o' は `fieldSpriteMap` の `stoneFloor` スプライトとして描かれる＝
 * **浮き出た灰色の石ブロック**＝「歩けるのに壁に見える」（2026-08-20 に実ブラウザで
 * tiles 側と bg 側を並べて実測した。平らな bg の実例＝`field 14,9` の港の舗装）。
 * 設計上の絵（火口のリング・岩棚・狼煙台の台座）は grid に 'o' で書いたまま、
 * 盤面へ落とす直前に **tiles を床 '.' へ／bgTiles を 'o' へ**振り替える。
 * 'o' も '.' も通行可＝**この振り替えで通行可能性は1セルも変わらない**（状態空間は不変）。
 * ⚠️ 引き換えにランドマーク軸（`LANDMARK_TILES = {^,o,h,p}` in tiles）は取れなくなる。
 *    火山に家 'h'/'p' は置けず '^' は星の欠片の祭壇（唯一の報酬機構）∴代替タイルが無い。
 *    軸は障害/秘密/戦闘/導線で確保する（軸のために壁に見える絵を置かない）。
 */
function pave(spec, tiles) {
  const paved = new Set();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (tiles[r][c] === TILE.STONE_FLOOR) { paved.add(key(r, c)); tiles[r][c] = TILE.FLOOR; }
  }
  // spec.pave ＝ **床でないタイルが乗っているセル**の下地も石畳にする指定
  // （grid には 'H' 'B' 'i' と書くしかない＝石畳と書けない）。
  // これを省くと台座の真ん中だけ灰が残って「石の額縁に茶色の帯」に見える（実測して足した）。
  for (const k of spec.pave ?? []) {
    const [r, c] = k.split(',').map(Number);
    if (tiles[r][c] === TILE.STONE_FLOOR) throw new Error(`${spec.key}: pave ${k} は grid が既に 'o'＝指定が重複`);
    if (tiles[r][c] === TILE.FLOOR) throw new Error(`${spec.key}: pave ${k} は素の床＝grid に 'o' と書けばよい`);
    paved.add(k);
  }
  return paved;
}

const RING = [];
for (let c = 0; c < COLS; c++) { RING.push([0, c]); RING.push([ROWS - 1, c]); }
for (let r = 1; r < ROWS - 1; r++) { RING.push([r, 0]); RING.push([r, COLS - 1]); }
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 徒歩で立てるか（道具なし・ゲート閉）。敵タイルは床の上に立っている＝歩ける。 */
const walkable = (tiles, r, c) => {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  const ch = tiles[r][c];
  if (ch === TILE.GATE) return false;
  if (ch === TILE.BREAKABLE_WALL) return false;
  if (ENEMY_META[ch]) return true;
  return !isHardBlocked(ch);
};

// ── ① 外周リングの必要開口（隣画面の実データからの不動点） ──────────────────
// 森F北西と同じ規則＝「隣が実在するなら隣の実タイルに合わせる（ミラー）／隣も今回作る画面
// なら標準の細い十字（縦は col5,6・横は row4,5）」を採り、両者が衝突する角セルは閉じる。
const isStandardCross = (axis, r, c) => (axis === 'v' ? (c === 5 || c === 6) : (r === 4 || r === 5));
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
            if (isStandardCross(axis, r, c) || req.get(nk)[nr][nc]) want = true;
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

function checkRing(spec, tiles, need) {
  for (const [r, c] of RING) {
    const open = walkable(tiles, r, c);
    if (need[r][c] && !open)
      throw new Error(`${spec.key}: 外周 ${key(r, c)} は開いていないといけない（隣が開いている＝継ぎ目バグ）`);
    if (!need[r][c] && open)
      throw new Error(`${spec.key}: 外周 ${key(r, c)} は閉じていないといけない（隣が壁 or 地図の外＝dead edge）`);
    if (need[r][c]) continue;
    // 閉じた外周の見た目＝火山 L は地図境界も内側も岩山 'M' で統一する。
    if (tiles[r][c] !== TILE.MOUNTAIN)
      throw new Error(`${spec.key}: 閉じた外周 ${key(r, c)} が '${tiles[r][c]}'（'M' で統一する）`);
  }
}

// ── ② 徒歩だけの到達（開いた外周が全部ひとつの塊か） ────────────────────────
function walkBFS(tiles, startKey) {
  const seen = new Set([startKey]);
  const q = [startKey];
  while (q.length) {
    const [r, c] = q.shift().split(',').map(Number);
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc, k = key(nr, nc);
      if (seen.has(k)) continue;
      if (!walkable(tiles, nr, nc)) continue;
      seen.add(k); q.push(k);
    }
  }
  return seen;
}

// ── ③ 状態空間（実エンジンの遷移の写し） ────────────────────────────────────
// 火山 L の下地は灰 'c'（水 '~' は無い）∴ソルバーの「bg 水」経路は発生しない。
// 溶岩 'l' は tiles 層の通行不可タイルで、はしごの対象（LADDER_OVER = {WATER, PIT}）に
// **入っていない**＝橋 'v' でしか渡れない。この非対称が外輪の道を細く保つ根拠。
const BG = Array.from({ length: ROWS }, () => Array(COLS).fill('c'));
const FULL = { hasLadder: true, hasCandle: true, bushCuttable: true, pitCrossable: true };
const CONTROLS = {
  noTools: { ...FULL, noTools: true },
  noLadder: { ...FULL, hasLadder: false },
  noPush: { ...FULL, noPush: true },
  noBush: { ...FULL, bushCuttable: false },
};
function solverFor(tiles, spec, opt) {
  const breaks = Object.fromEntries(
    Object.entries(spec.breakableWalls ?? {}).map(([k, v]) => [k, v.breakDef]));
  return makeSolver(tiles, BG, [], breaks, new Set(), opt);
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

// 壁として据え置くタイル（到達しなくてよい）。'i' 石碑と 'H' かがり火は「隣から使う」物。
// 溶岩 'l' は森には無かった＝火山で追加（はしごでも渡れない∴決して立てない）。
// 穴 'x' は**除外しない**＝はしごで渡るとき実エンジンはその1セルを踏む（solver も同じ）∴到達対象。
const PROP_TILES = new Set([
  TILE.TREE, TILE.MOUNTAIN, TILE.WALL, TILE.WATER, TILE.LAVA, TILE.SIGN, TILE.TORCH,
]);

function checkStates(spec, tiles, openRing) {
  const S = solverFor(tiles, spec, FULL);
  const { seen, rev } = explore(S, openRing[0]);
  const reached = cellsOf(seen);

  // (a) 無駄セル0＝壁でないセルは全部（道具を使えば）到達できる。
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (PROP_TILES.has(tiles[r][c])) continue;
    if (!reached.has(key(r, c)))
      throw new Error(`${spec.key}: ${key(r, c)}('${tiles[r][c]}') に道具を使っても到達できない＝無駄セル`);
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
    const r2 = cellsOf(explore(solverFor(tiles, spec, opt), openRing[0]).seen);
    if (r2.has(t.cell))
      throw new Error(`${spec.key}: ${t.control} でも ${t.cell} に届く＝「${t.why}」が成立していない`);
  }
  return seen.size;
}

// ── ④⑥ 中身の整合（宝箱/看板/軸） ───────────────────────────────────────────
function buildStage(spec, tiles, paved) {
  const bgTiles = {};
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = key(r, c);
    bgTiles[k] = paved.has(k) ? TILE.STONE_FLOOR : (spec.bgOf ? spec.bgOf(r, c) : 'c');
  }
  return {
    cols: COLS,
    rows: ROWS,
    tiles,
    bgTiles,
    links: [],
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
}

function checkContent(spec, stage) {
  const t = stage.tiles;
  const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r][c]; };
  for (const k of Object.keys(stage.chestContents))
    if (at(k) !== TILE.CHEST) throw new Error(`${spec.key}: 宝箱 ${k} のタイルが '${at(k)}'（'B' でない）`);
  for (const [k, sc] of Object.entries(stage.showConditions)) {
    if (at(k) !== TILE.CHEST) throw new Error(`${spec.key}: showConditions ${k} のタイルが '${at(k)}'（'B' でない）`);
    // torchesLit で封じるなら、その画面に点けられる 'H' が実在しないと永久に開かない。
    if (sc.trigger === 'torchesLit' && !t.some((row) => row.includes(TILE.TORCH)))
      throw new Error(`${spec.key}: torchesLit で封じた ${k} の画面に 'H' が無い＝開かない封印`);
  }
  for (const [k, sd] of Object.entries(stage.signData)) {
    if (at(k) !== TILE.SIGN) throw new Error(`${spec.key}: 看板 ${k} のタイルが '${at(k)}'（'i' でない）`);
    if (!sd.lines?.length) throw new Error(`${spec.key}: 看板 ${k} に本文が無い（無言看板）`);
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
    if (ENEMY_META[t[r][c]]?.directional && !stage.enemyDirs[key(r, c)])
      throw new Error(`${spec.key}: 向き別スプライトの敵 '${t[r][c]}'(${key(r, c)}) に enemyDirs が無い`);
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
  checkRing(spec, tiles, req.get(spec.key));

  // ② 開いた外周が全部ひとつの塊にあること。
  const openRing = RING.filter(([r, c]) => req.get(spec.key)[r][c]).map(([r, c]) => key(r, c));
  if (!openRing.length) throw new Error(`${spec.key}: 開いた外周が無い＝孤立画面`);
  const comp = walkBFS(tiles, openRing[0]);
  const off = openRing.filter((k) => !comp.has(k));
  if (off.length) throw new Error(`${spec.key}: 外周 ${off.join(' ')} が徒歩で他の外周とつながらない`);

  const states = checkStates(spec, tiles, openRing);
  const stage = buildStage(spec, tiles, paved);
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

console.log(`✅ 火山L 外輪 +9画面を作り込み${DRY ? '（--dry: 書き込みなし）' : ''}`);
for (const { spec, states, axes } of report) {
  console.log(`   ${spec.key.padEnd(5)} ${spec.title.padEnd(9)} 軸[${[...axes].join(',')}] 状態 ${states}`
    + (spec.tools?.length ? ` 対照 ${spec.tools.map((t) => t.control).join('/')}` : ''));
}
