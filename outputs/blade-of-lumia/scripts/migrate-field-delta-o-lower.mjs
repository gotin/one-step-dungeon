#!/usr/bin/env node
/**
 * migrate-field-delta-o-lower.mjs  (Phase 9-6 ④ — 深洋O デルタ下半9画面)
 *
 * 沈んだ都のデルタの下半9画面を作り込む。設計は FIELD-9-6-DESIGN.md §19-11-I
 * （2026-08-19 確定・ユーザー確定4件）。上半 D1〜D5 が「1画面1道具の総復習」だったのに対し、
 * 下半は **ロアの収束＋聖域への一本道**＝石碑3枚で都が沈んだ理由を語り、海の主の闘技場を
 * 抜けた先に聖域（ハートの器）を置く。
 *
 *   12,18 海の石碑A（民の証言）＋海草の隠し    secret + landmark
 *   13,18 D7 はしごの縦橋                      route  + landmark
 *   14,18 D8 弓の縦撃ち（row18→row19 の降り口） route  + obstacle + landmark
 *   15,18 海の石碑B（咎）＋ブーメラン献灯       secret + landmark
 *   11,19 聖域（女王の石碑＋ハートの器）        landmark + secret
 *   12,19 海の主の闘技場（isBossRoom＋報酬の宝箱） combat + landmark
 *   13,19 D10 大通りの跡                       secret + landmark
 *   14,19 D11 沈没船と石の物置（row19 の入口）  route  + secret + landmark
 *   15,19 隠し報酬（爆弾壁＋笛の二重）          obstacle + secret + landmark
 *
 * ── 上半の migrate から変えた点（§19-11-I ⑦）────────────────────────────────
 *  1. 敵タイルを許す＝12,19 はボス画面。しかも `{`（海の主）は **両生ボスなので bg 水の上**に
 *     置くのが正しい∴「content は陸の上だけ」の一律 throw を敵タイルで例外化した。
 *  2. initLitTorches 0本を許す＝聖域はロウソクで点ける「献灯の儀」∴火元が無い状態から始まる。
 *     代わりに (a) 全 'H' に隣接する立てるセルがある (b) torchesLit 封印が実在する を検査する。
 *  3. makeSolver に opt-in オプション（hasCandle / bushCuttable / noPush）を足して使う。
 *     いずれも既定 off ∴既存の呼び出し側（廊下・上半・measure-puzzle.mjs）の値は動かない。
 *  4. assertNoLadderBypass を **2回** 走らせる＝素の盤面と「全部の茂みを刈った盤面」。
 *     茂みを刈ると橋脚が生まれて幅1の水ができる場合を潰す。
 *  5. assertNoFootprintWall は流用しない（⑥-footprint は 2026-07-29 に失効）。
 *     代わりに **双方向 arrival-wall ガード**＝live の隣接画面と境界セルの開閉を突き合わせる。
 *  6. リングのセルに hard-blocked な tiles を置かないガード（'h'/'p'/'H'/'i'/'u' を境界に
 *     置くと「見えない壁」になる）。
 *  7. ボス報酬は **宝箱** で渡す（2026-08-19 ユーザー確定）＝12,19 の 'B'(2,5) を
 *     showConditions の trigger:'bossYielded' で封印する。bossReward（その場で授与）は
 *     使わない∴「いつの間にか手に入ってた」が起きない。ボス部屋の宝箱に bossYielded 封印が
 *     無い／報酬がどこにも無い構成を throw で止める。
 *
 * ── 実コードで裏取りした3つの発見（§19-11-I 🔑）─────────────────────────────
 *  ・ボス扉 ':' は seam/trap/W2 をどれも増やさない（findOrphanRooms は solvable gate を
 *    開いて歩き、bfsLayer の dead-edge 判定は isHardBlocked ＝':' は壁でない）。減るのは
 *    ログ専用の strict `reached` だけ。∴扉で囲った闘技場が採れる。
 *  ・bushBurned 封印は作らない（剣でも茂みは刈れるのにフラグが立たない＝永久ソフトロック）。
 *  ・聖域に祭壇 '^' を置かない（踏むと offerAtAltar が発火し hasAltar のマップ走査にも乗る）。
 *
 * Usage (run from outputs/blade-of-lumia/):
 *   node scripts/migrate-field-delta-o-lower.mjs --dry   # print final screens, no write
 *   node scripts/migrate-field-delta-o-lower.mjs         # write work/blade-of-lumia.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked } from './lib/connectivity.mjs';
import { TILE } from '../shared/tiles.js';
import { ENEMY_TILES } from '../shared/enemies.js';
import { ROWS, COLS, W, O, isRing, makeSolver } from './lib/blade-solver.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

// デルタ下半9画面（キー = "col,row"）。
const DELTA_LOWER = [
  '12,18', '13,18', '14,18', '15,18',
  '11,19', '12,19', '13,19', '14,19', '15,19',
];

// この地域では全道具を所持している（§8-1 O=7）＝ソルバーもロウソク・剣（茂み刈り）を持つ。
const SOLVER_OPTS = { hasCandle: true, bushCuttable: true };

// ── 画面仕様 ──────────────────────────────────────────────────────────────
// bg    : 10行×12列。'~' 海 / 'g' 地面 / 'o' 石畳（沈んだ都の舗装）。
//   ⚠️ **舗装は bg にしか置かない**。tiles 側の 'o'(STONE_FLOOR) は render-board.js の
//   fieldSpriteMap で stoneFloor **スプライト**（浮き出た石ブロック）として描かれる∴床の
//   つもりで置くと「通れるのに壁に見える」画面になる（2026-08-19 実スクショで確認して修正）。
//   bg の 'o' は bgClassMap の 'bg-stonefloor' ＝平らな石床として塗られる（field 14,9 が実例）。
// tiles : '.' 床 / '=' 潮ゲート / 'Y' スイッチ / '*' 石 / '!' 爆弾壁 / 'H' かがり火 /
//         'B' 宝箱 / 'h' 崩れ壁 / 'p' 屋根 / 'i' 石碑 / 'u' 海草(茂み) /
//         ':' ボス扉 / '{' 海の主。
// solve : 検証メモ。entryCells/mustReach に加えて
//         ladderOnly  … はしご無しでは届かないべきセル
//         stoneOnly   … 石を押さないと届かないべきセル
//         torchesToLight / candleTorches … 点けるべきかがり火（後者は火元 0 本＝儀式）
const SCREENS = {
  // ══ 12,18 海の石碑A（民の証言）＋海草の隠し ═══════════════════════════════════
  // 北西が外海の岬（row0/col0 は全水＝隣が山と海で閉じている）。東の 13,18 だけが口。
  // 崩れ家 p/h を岬の高台に置き、石碑 i(5,7) で「潮が三日引かぬ朝」を語る。
  // 宝箱(7,5) は海草 u で四方を囲む＝剣で刈って入る secret（bushBurned 封印は使わない）。
  '12,18': {
    role: '海の石碑A（民の証言）＋海草の隠し',
    bg: [
      '~~~~~~~~~~~~',
      '~~~~gggggggg',
      '~~~~gggggggg',
      '~~~~~~~ggggg',
      '~~~~~~~ggggg',
      '~~~~gggggggg',
      '~~~~gggggggg',
      '~~~~gggggggg',
      '~~~~gggggggg',
      '~~~~~~~~~~~~',
    ],
    tiles: [
      '............',
      '.....pp.....',
      '.....hh.....',
      '............',
      '............',
      '.......i....',
      '....uuu.....',
      '....uBu.....',
      '.....u......',
      '............',
    ],
    links: [],
    chest: { pos: '7,5', content: { type: 'item', item: 'healPotion', name: '回復薬（小）' } },
    sign: {
      pos: '5,7',
      name: '民の 石碑',
      lines: [
        '潮が 三日 引かぬ 朝、',
        '海が 都を 呑んだ。',
        '我らは 逃げ、女王は 残った。',
      ],
    },
    solve: { entryCells: ['4,11', '7,11'], mustReach: ['7,5', '5,6'] },
  },

  // ══ 13,18 D7 はしごの縦橋 ═════════════════════════════════════════════════
  // 中央の入江に浮かぶ中州（rows5-6 cols5-6）へ、縦1セル幅の水(4,5) をはしごで渡る。
  // 橋脚は上 (3,5)・下 (5,5)。row8 cols5-6 は **幅2** の水＝2本目の橋を作らない。
  // 崩れ家2軒の間を舗装（bg 'o' の col5）で抜けて桟橋に出る＝橋の位置を絵で示す。
  '13,18': {
    role: 'D7 はしごの縦橋',
    bg: [
      '~ggggggggggg',
      'gggggggggggg',
      'gggggogggggg',
      'gg~~~o~~~~gg',
      'gg~~~~~~~~gg',
      'gg~~~gg~~~gg',
      'gg~~~gg~~~gg',
      'gg~~~~~~~~gg',
      'ggggg~~ggggg',
      '~~~~~~~~~~~~',
    ],
    tiles: [
      '............',
      '....p.p.....',
      '....h.h.....',
      '............',
      '............',
      '......h.....',
      '......B.....',
      '............',
      '............',
      '............',
    ],
    links: [],
    // (4,5) は縦の幅1水＝設計上のはしご橋。中州の宝はここを渡らないと届かない。
    ladderBridges: ['4,5'],
    chest: { pos: '6,6', content: { type: 'rupee', value: 40, name: 'ルピー×40' } },
    sign: null,
    solve: {
      entryCells: ['0,5', '4,0', '4,11'],
      mustReach: ['6,6', '3,5'],
      ladderOnly: ['6,6', '5,5', '6,5'],
    },
  },

  // ══ 14,18 D8 弓の縦撃ち（row18 → row19 の降り口）══════════════════════════════
  // Y(4,5) を四方水で完全隔離した小島に置き、北の桟橋（bg 'o' の (1,4)-(1,6)）から **南へ** 矢を
  // 撃って叩く（矢は水を越える）。潮ゲート =(8,8) が引くと col8 rows5-7 の宝島へ渡れる。
  // row9 cols1-10 が開いた唯一の降り口（14,19 の row0 とミラー）。
  '14,18': {
    role: 'D8 弓の縦撃ち（row19 への降り口）',
    bg: [
      'gggggggggggg',
      'ggggoooggggg',
      'gg~~~~~~~~~g',
      'gg~~~~~~~~~g',
      'gg~~~g~~~~~g',
      'gg~~~~~~g~~g',
      'gg~~~~~~g~~g',
      'gg~~~~~~g~~g',
      'gggggggggggg',
      '~gggggggggg~',
    ],
    tiles: [
      '............',
      '.p..........',
      '.h..........',
      '............',
      '.....Y......',
      '........B...',
      '............',
      '............',
      '........=...',
      '............',
    ],
    links: [['4,5', ['8,8']]],
    chest: { pos: '5,8', content: { type: 'rupee', value: 50, name: 'ルピー×50' } },
    show: null,   // 'Y' はトグル＝switchOn 封印は効かない。報酬は到達で守る。
    sign: null,
    solve: {
      entryCells: ['0,5', '4,0', '4,11', '9,5'],
      arrowReach: '4,5',
      mustReach: ['5,8', '9,5', '9,6'],
    },
  },

  // ══ 15,18 海の石碑B（咎）＋ブーメラン献灯 ═══════════════════════════════════
  // かがり火3本を横一列 H(4,7)(4,8)(4,9)。**火元は投擲点から最も遠い (4,9)**
  // （collectAlongBoomerang は往路で点いた火を拾い復路で消えた火を点ける∴最奥でないと
  // 1投で全灯しない＝D5 15,17 と同じ形）。投擲点 (4,6) から右へ、射程3で丁度届く。
  // row4 cols6-9 を舗装（bg 'o'）＝かがり火の並ぶ祭壇前の石畳。
  '15,18': {
    role: '海の石碑B（咎）＋ブーメラン献灯',
    bg: [
      'ggggggggggg~',
      'ggggggggggg~',
      'gggg~~ggggg~',
      'gggg~~ggggg~',
      'ggggggoooog~',
      'gg~~~~~~~~~~',
      'gg~~~~~~~~~~',
      'gg~~~~~~~~~~',
      'gg~~~~~~~~~~',
      '~~~~~~~~~~~~',
    ],
    tiles: [
      '............',
      '..i.........',
      '.......p.p..',
      '.......hBh..',
      '.......HHH..',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
    links: [],
    torch: { lit: ['4,9'] },
    chest: { pos: '3,8', content: { type: 'item', item: 'healPotionL', name: '回復薬（大）' } },
    show: { pos: '3,8', cond: { trigger: 'torchesLit', message: '≋ かがり火が すべて 灯った！箱が 現れた！' } },
    sign: {
      pos: '1,2',
      name: '咎の 石碑',
      lines: [
        'ザーネル は 女王を 欺き、',
        'その 身を 海の 底へ 沈めた。',
        '力を 失った 女王は 深みへ 消えた。',
      ],
    },
    solve: {
      entryCells: ['0,5', '4,0'],
      mustReach: ['3,8', '4,6', '1,3'],
      torchesToLight: ['4,7', '4,8'],
    },
  },

  // ══ 11,19 聖域（女王の石碑＋ハートの器）═════════════════════════════════════
  // 石畳（bg 'o'）の広間を持つ小島。'^' は使わない（offerAtAltar が発火する）。
  // 献灯の儀＝ロウソクでかがり火3本 (5,5)(5,7)(7,6) を点ける（initLitTorches は空）。
  // 中央の宝箱(5,6) は torchesLit 封印で、中身がハートの器。col11 rows4,5 がボス部屋の門。
  '11,19': {
    role: '聖域（女王の石碑＋ハートの器）',
    bg: [
      '~~~~~~~~~~~~',
      '~~~~~~~~~~~~',
      '~~~ggggggg~~',
      '~~gggggggg~~',
      '~~ggoooooggg',
      '~~ggoooooggg',
      '~~ggooooog~~',
      '~~~gggoggg~~',
      '~~~~~~~~~~~~',
      '~~~~~~~~~~~~',
    ],
    tiles: [
      '............',
      '............',
      '.....ppp....',
      '.....hih....',
      '............',
      '.....HBH....',
      '............',
      '......H.....',
      '............',
      '............',
    ],
    links: [],
    torch: { lit: [] },   // 火元なし＝ロウソクで点ける儀式（buildScreen の例外は candleTorches）
    chest: { pos: '5,6', content: { type: 'heartContainer', name: 'ハートの器' } },
    show: { pos: '5,6', cond: { trigger: 'torchesLit', message: '✨ 三つの 灯が 揃い 女王の 器が 現れた！' } },
    sign: {
      pos: '3,6',
      name: '女王の 石碑',
      lines: [
        'わたしは 石と なり 眠る。',
        '光の 剣を 継ぐ 者よ、',
        'この 器を 持ち 空へ 昇れ。',
      ],
    },
    solve: {
      entryCells: ['4,11', '5,11'],
      mustReach: ['5,6', '4,5', '4,7', '6,6'],
      candleTorches: ['5,5', '5,7', '7,6'],
    },
  },

  // ══ 12,19 海の主の闘技場 ═══════════════════════════════════════════════════
  // 4×4 の外海の淵（rows3-6 cols4-7）を石畳（bg 'o'＝陸を全面舗装）がぐるりと囲む。'{'(4,5) は淵の水上
  // （2×2 の当たりは rows4-5 cols5-6＝全部水）。ボス扉 ':' は **プレイヤーが着地する境界
  // セルそのもの** (4,0)(5,0)(4,11)(5,11) に置く（内側に置くと入場した瞬間に入口とボスの
  // 間に扉が降りて戦えない）。
  // 報酬（銀のブーメラン。器は聖域へ移した）は **淵の北の回廊 (2,5) の宝箱** で渡す＝
  // bossReward の即時授与は使わない（2026-08-19 ユーザー確定「いつの間にか手に入ってた／
  // 普通に宝箱が出ればいい」）。封印は showConditions の trigger:'bossYielded'（主に
  // 認められた瞬間に解ける・boss.js onBossYielded が立てる）。
  '12,19': {
    role: '海の主の闘技場（isBossRoom）',
    bg: [
      '~~~~~~~~~~~~',
      '~~~~~~~~~~~~',
      '~~oooooooo~~',
      '~~oo~~~~oo~~',
      'oooo~~~~oooo',
      'oooo~~~~oooo',
      '~~oo~~~~oo~~',
      '~~oooooooo~~',
      '~~~~~~~~~~~~',
      '~~~~~~~~~~~~',
    ],
    tiles: [
      '............',
      '............',
      '..h..B...h..',
      '............',
      ':....{.....:',
      ':..........:',
      '............',
      '..h......h..',
      '............',
      '............',
    ],
    links: [],
    boss: {
      // その場で配る報酬は無し（宝箱で渡す）。空配列＝ビルダーが bossReward を消す。
      reward: [],
    },
    chest: { pos: '2,5', content: { type: 'boomerang', boomerangTier: 1, name: '銀のブーメラン' } },
    show: { pos: '2,5', cond: { trigger: 'bossYielded', message: '☐ 淵の ほとりに 宝箱が 現れた！' } },
    sign: null,
    solve: {
      entryCells: ['4,11', '5,11'],
      // 闘技場を一周できること（東の入口から西の門へ抜けられる＝聖域へ続く）＋報酬の宝箱へ届くこと。
      mustReach: ['4,0', '5,0', '2,3', '2,8', '7,3', '7,8', '2,5'],
    },
  },

  // ══ 13,19 D10 大通りの跡 ═══════════════════════════════════════════════════
  // 都の大通りを石畳（bg 'o'）の2行（rows4-5 cols1-10）で横断させる収束画面。両脇に崩れ家 p/h。
  // 宝箱(8,5) は海草 u(7,5)(8,4)(8,6) と南の海で囲む secret。col0 rows4,5 がボス部屋の門。
  '13,19': {
    role: 'D10 大通りの跡',
    bg: [
      '~~~~~~~~~~~~',
      '~~~ggggggggg',
      '~~gggggggggg',
      '~ggggggggggg',
      'goooooooooog',
      'goooooooooog',
      '~ggggggggggg',
      '~~gggggggggg',
      '~~~ggggggggg',
      '~~~~~~~~~~~~',
    ],
    tiles: [
      '............',
      '...pp....pp.',
      '...hh....hh.',
      '............',
      '............',
      '............',
      '............',
      '.....u......',
      '....uBu.....',
      '............',
    ],
    links: [],
    chest: { pos: '8,5', content: { type: 'rupee', value: 30, name: 'ルピー×30' } },
    sign: null,
    solve: {
      entryCells: ['4,0', '4,11', '5,11'],
      mustReach: ['8,5', '4,5', '5,5'],
    },
  },

  // ══ 14,19 D11 沈没船と石の物置（row19 の入口）═════════════════════════════════
  // 北西に沈没船の船倉（rows2-4 cols1-4 の水）。南東に h で囲った物置（内部 (6,7)(6,8)
  // (7,7)(7,8)）を作り、唯一の入口を石 *(5,7) で塞ぐ。北 (4,7) から南へ2回押すと入れて、
  // (6,7)→(6,8)→(7,8) で宝。石は (7,7) から更に南へ押せない（h 壁）＝押し切っても詰まない。
  '14,19': {
    role: 'D11 沈没船と石の物置（row19 の入口）',
    bg: [
      '~gggggggggg~',
      'gggggggggggg',
      'g~~~~ggggggg',
      'g~~~~ggggggg',
      'g~~~~ggggggg',
      'gggggggggggg',
      'gggggggggggg',
      'gggggggggggg',
      'gggggggggggg',
      '~~~~~~~~~~~~',
    ],
    tiles: [
      '............',
      '............',
      '............',
      '............',
      '......p.pp..',
      '......h*hh..',
      '......h..h..',
      '......h.Bh..',
      '......hhhh..',
      '............',
    ],
    links: [],
    chest: { pos: '7,8', content: { type: 'rupee', value: 50, name: 'ルピー×50' } },
    sign: null,
    solve: {
      entryCells: ['0,5', '4,0', '4,11'],
      mustReach: ['7,8', '6,7'],
      stoneOnly: ['7,8', '6,8'],
    },
  },

  // ══ 15,19 隠し報酬（爆弾壁＋笛の二重）═══════════════════════════════════════
  // 沈んだ宝物庫。h の金庫の唯一の入口を爆弾壁 !(5,7) で塞ぎ、さらに中の宝箱(6,7) を
  // flutePlayed で封印する＝爆弾と笛の両方を要求。看板 i(2,6) が両方を示唆する。
  '15,19': {
    role: '隠し報酬（爆弾壁＋笛の二重）',
    bg: [
      '~~~~~~~~~~~~',
      'gggggggggg~~',
      'gggggggggg~~',
      'gg~~gggggg~~',
      'gg~~gggggg~~',
      'gggggggggg~~',
      'gggggggggg~~',
      'gggggggggg~~',
      'gggggggggg~~',
      '~~~~~~~~~~~~',
    ],
    tiles: [
      '............',
      '............',
      '......i.....',
      '............',
      '......p.p...',
      '......h!h...',
      '......hBh...',
      '......hhh...',
      '............',
      '............',
    ],
    links: [],
    break: { '5,7': 2 },
    chest: { pos: '6,7', content: { type: 'rupee', value: 100, name: 'ルピー×100' } },
    show: { pos: '6,7', cond: { trigger: 'flutePlayed' } },
    flute: { type: 'reveal', message: '🎵 音色に 応えて 宝物庫の 箱が 現れた！' },
    sign: {
      pos: '2,6',
      name: '沈んだ 宝物庫',
      lines: [
        '壁は 固く 音は 通る。',
        '爆ぜる 火と 笛の 音を もて。',
      ],
    },
    solve: {
      entryCells: ['4,0', '2,0'],
      mustReach: ['6,7', '4,7'],
    },
  },
};

// ── 汎用ヘルパ ────────────────────────────────────────────────────────────
const parseGrid = (rows, key, what) => {
  if (rows.length !== ROWS) throw new Error(`${key}: ${what} は ${ROWS} 行必要（${rows.length} 行）`);
  return rows.map((line) => {
    if (line.length !== COLS) throw new Error(`${key}: ${what} の行幅が ${COLS} でない: "${line}"`);
    return line.split('');
  });
};

/** live ステージ（文字配列 or 行文字列）から1行を文字配列で取る。 */
const liveRow = (stage, r) => {
  const row = stage.tiles[r];
  return Array.isArray(row) ? row : String(row).split('');
};

const ENEMY_SET = new Set(ENEMY_TILES);

/**
 * 「そのセルは隣画面から歩いて入れるか」＝bg が水でなく tiles が hard-blocked でない。
 * ⚠️ ':'（ボス扉）は SOLVABLE_GATES ＝isHardBlocked が false ∴**開いている**と数える
 *   （engine も STATEFUL_TILES に ':' を入れず着地を許す＝入場後に閉まるだけ）。
 */
const openBg = (bgCh, tileCh) => bgCh !== W && !isHardBlocked(tileCh);

/** はしごで1セル幅の水を渡ってパズルを迂回できないこと（passable.js と同じ判定）。 */
function assertNoLadderBypass(tiles, bg, key, allow = new Set(), label = '') {
  const bank = (r, c) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;   // 画面外は橋脚にならない
    if (bg[r][c] === W) return false;
    const ch = tiles[r][c];
    return !isHardBlocked(ch) && ch !== TILE.TIDE_GATE;
  };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (bg[r][c] !== W) continue;
    if (allow.has(`${r},${c}`)) continue;   // 設計上の橋
    if (bank(r, c - 1) && bank(r, c + 1))
      throw new Error(`${key}${label}: (${r},${c}) の水が横1セル幅＝はしごで意図せず渡れる`);
    if (bank(r - 1, c) && bank(r + 1, c))
      throw new Error(`${key}${label}: (${r},${c}) の水が縦1セル幅＝はしごで意図せず渡れる`);
  }
}

/** 全状態を展開して { seen, rev } を返す（内部ヘルパ）。 */
function explore(S, entryCells, key) {
  const starts = entryCells.map((cell) => {
    const [r, c] = cell.split(',').map(Number);
    return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
  });
  const seen = new Set(starts);
  const rev = new Map();
  const q = [...starts];
  let guard = 0;
  while (q.length) {
    if (++guard > 6000000) throw new Error(`${key}: 状態空間が大きすぎる（設計を単純に）`);
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

/**
 * 画面のパズルを検査する（9-6 の2大原則の実体）：
 *   ① 入口セルから solve.mustReach の全セルへ実手順で届く
 *   ② どの到達状態からも画面外（exitCells）に出られる（＝入って詰まない）
 *   ③ 道具を使わないと報酬に届かない（＝飾りでない）。道具別に対照実験を張る。
 */
function verifyPuzzle(tiles, bg, spec, key) {
  const links = spec.links ?? [];
  const breakDefs = spec.break ?? {};
  const litInit = new Set(spec.torch?.lit ?? []);
  const S = makeSolver(tiles, bg, links, breakDefs, litInit, SOLVER_OPTS);
  if (!S.exitCells.length) throw new Error(`${key}: 出入りできる外周セルが無い`);

  const entryCells = spec.solve?.entryCells ?? S.exitCells;
  for (const cell of entryCells) {
    const [r, c] = cell.split(',').map(Number);
    if (bg[r][c] === W || isHardBlocked(tiles[r][c]))
      throw new Error(`${key}: entryCell ${cell} が水/壁の上`);
  }

  const { seen, rev } = explore(S, entryCells, key);

  // ② どの到達状態からも exitCells に立つ状態へ行けること。
  const escapes = new Set();
  const rq = [];
  for (const st of seen) if (S.exitCells.includes(st.split('|')[0])) { escapes.add(st); rq.push(st); }
  while (rq.length) {
    const st = rq.shift();
    for (const prev of rev.get(st) ?? []) {
      if (escapes.has(prev)) continue;
      escapes.add(prev); rq.push(prev);
    }
  }
  const stuck = [...seen].filter((st) => !escapes.has(st));
  if (stuck.length)
    throw new Error(`${key}: 詰む状態が ${stuck.length} 件（例 ${stuck[0]}）＝入って出られない`);

  const playerCells = cellsOf(seen);

  // ① mustReach の全セルへ届くこと。
  for (const cell of spec.solve?.mustReach ?? [])
    if (!playerCells.has(cell)) throw new Error(`${key}: mustReach ${cell} に実手順で届かない`);

  // ①' かがり火の儀式が実際に完遂できること（全 'H' 点灯状態に到達する）。
  const allLitMask = (1 << S.torchCells.length) - 1;
  const needAllLit = spec.solve?.torchesToLight || spec.solve?.candleTorches;
  if (needAllLit) {
    const declared = new Set([...(spec.solve.torchesToLight ?? []), ...(spec.solve.candleTorches ?? [])]);
    for (const cell of S.torchCells)
      if (!litInit.has(cell) && !declared.has(cell))
        throw new Error(`${key}: かがり火 ${cell} が点け方の宣言に無い（飾りのかがり火）`);
    const canAllLit = [...seen].some((st) => Number(st.split('|')[4]) === allLitMask);
    if (!canAllLit) throw new Error(`${key}: 全かがり火を灯せない（儀式が完遂できない）`);
  }

  // ③ 対照実験。道具（弓/爆弾/ブーメラン/ロウソク）を封じたソルバー。
  //    茂み刈り（剣）は封じない＝剣は常に持っているので「茂みの奥」は道具ゲートではない。
  const noTool = makeSolver(tiles, bg, [], breakDefs, litInit,
    { hasLadder: false, noTools: true, bushCuttable: true });
  const ntCells = cellsOf(explore(noTool, entryCells, key).seen);
  const secretCell = spec.chest?.pos ?? spec.show?.pos ?? null;
  if (needAllLit) {
    const ntAllLit = [...explore(noTool, entryCells, key).seen]
      .some((st) => Number(st.split('|')[4]) === allLitMask);
    if (ntAllLit) throw new Error(`${key}: 道具を使わず全かがり火が点く＝torchesLit パズルが飾り`);
  }
  if (secretCell && (spec.solve?.arrowReach || spec.break || links.length)) {
    if (ntCells.has(secretCell))
      throw new Error(`${key}: 道具を使わずに報酬 ${secretCell} へ届く＝パズルが飾り`);
  }
  // ③-b はしご専用のセル（はしごを外すと届かないべき）。
  if (spec.solve?.ladderOnly?.length) {
    const noLadder = makeSolver(tiles, bg, links, breakDefs, litInit,
      { ...SOLVER_OPTS, hasLadder: false });
    const nlCells = cellsOf(explore(noLadder, entryCells, key).seen);
    for (const cell of spec.solve.ladderOnly)
      if (nlCells.has(cell))
        throw new Error(`${key}: はしご無しで ${cell} へ届く＝はしご橋が飾り`);
  }
  // ③-c 石押し専用のセル（石を固定すると届かないべき）。
  if (spec.solve?.stoneOnly?.length) {
    const noPush = makeSolver(tiles, bg, links, breakDefs, litInit, { ...SOLVER_OPTS, noPush: true });
    const npCells = cellsOf(explore(noPush, entryCells, key).seen);
    for (const cell of spec.solve.stoneOnly)
      if (npCells.has(cell))
        throw new Error(`${key}: 石を押さずに ${cell} へ届く＝石押しが飾り`);
  }

  return { states: seen.size, playerCells };
}

function buildScreen(key, spec) {
  const bg = parseGrid(spec.bg, key, 'bg');
  const tiles = parseGrid(spec.tiles, key, 'tiles');
  const bgChars = new Set([W, O, 'g', 'd']);
  for (const row of bg) for (const ch of row)
    if (!bgChars.has(ch)) throw new Error(`${key}: bg に使えない文字 '${ch}'`);

  // 敵は 12,19（ボス闘技場）だけ。他は戦闘ゼロ（§19-8 分離原則）。
  const enemyCells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
    if (ENEMY_SET.has(tiles[r][c])) enemyCells.push(`${r},${c}`);
  if (enemyCells.length && !spec.boss)
    throw new Error(`${key}: boss 指定の無い画面に敵 (${enemyCells.join(' ')})`);
  if (spec.boss && !enemyCells.length) throw new Error(`${key}: boss 指定なのに敵タイルが無い`);

  // 罠①: '=' の下地が水だと開いても永久に通れない。
  const gateCells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (tiles[r][c] !== TILE.TIDE_GATE) continue;
    gateCells.push(`${r},${c}`);
    if (bg[r][c] === W)
      throw new Error(`${key}: 潮ゲート (${r},${c}) の下地が水（isWaterAt が先に効いて永久に不通）`);
  }
  // content は陸の上だけ。**例外＝敵タイル**（海の主は両生ボス＝水上に居るのが正しい配置）。
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = tiles[r][c];
    if (ch === '.' || ch === TILE.TIDE_GATE || ENEMY_SET.has(ch)) continue;
    if (bg[r][c] === W) throw new Error(`${key}: '${ch}' (${r},${c}) が水の上`);
  }
  // リングのセルに hard-blocked な tiles を置かない（見えない壁になる）。
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!isRing(r, c)) continue;
    if (bg[r][c] === W) continue;
    if (isHardBlocked(tiles[r][c]))
      throw new Error(`${key}: 境界セル (${r},${c}) に通れないタイル '${tiles[r][c]}'`);
  }

  // links: 全ゲートがどれかのスイッチに繋がっていること。
  const linked = new Set();
  for (const [switchId, gates] of spec.links ?? []) {
    const [sr, sc] = switchId.split(',').map(Number);
    const st = tiles[sr]?.[sc];
    if (st !== TILE.SWITCH && st !== TILE.BUTTON)
      throw new Error(`${key}: links の switchId ${switchId} が Y/S でない（=${st}）`);
    for (const g of gates) {
      const [gr, gc] = g.split(',').map(Number);
      if (tiles[gr]?.[gc] !== TILE.TIDE_GATE)
        throw new Error(`${key}: links の gateId ${g} が潮ゲートでない（=${tiles[gr]?.[gc]}）`);
      linked.add(g);
    }
  }
  for (const g of gateCells)
    if (!linked.has(g)) throw new Error(`${key}: 潮ゲート ${g} がどのスイッチにも繋がっていない`);

  // 爆弾壁: break のキーが '!' タイルの上にあること（逆向きも）。
  for (const pk of Object.keys(spec.break ?? {})) {
    const [r, c] = pk.split(',').map(Number);
    if (tiles[r]?.[c] !== TILE.BREAKABLE_WALL)
      throw new Error(`${key}: break ${pk} が '!' タイルでない（=${tiles[r]?.[c]}）`);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
    if (tiles[r][c] === TILE.BREAKABLE_WALL && !(spec.break && spec.break[`${r},${c}`]))
      throw new Error(`${key}: '!' (${r},${c}) の breakDef が未定義`);

  // かがり火。
  const torchCells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
    if (tiles[r][c] === TILE.TORCH) torchCells.push(`${r},${c}`);
  const litInit = spec.torch?.lit ?? [];
  for (const pk of litInit) {
    const [r, c] = pk.split(',').map(Number);
    if (tiles[r]?.[c] !== TILE.TORCH) throw new Error(`${key}: initLitTorches ${pk} が 'H' でない`);
  }
  if (torchCells.length) {
    // 火元 0 本を許すのは「ロウソクで点ける儀式」を宣言した画面だけ。
    if (litInit.length === 0 && !spec.solve?.candleTorches)
      throw new Error(`${key}: かがり火があるのに火元が無い（candleTorches の宣言も無い）`);
    if (litInit.length >= torchCells.length)
      throw new Error(`${key}: 全かがり火が初期点灯＝torchesLit が spawn 時に充足（何もせず緑）`);
    // 飾りでないこと＝torchesLit 封印が実在すること。
    if (spec.show?.cond?.trigger !== 'torchesLit')
      throw new Error(`${key}: かがり火があるのに torchesLit 封印が無い（飾りのかがり火）`);
    // 各かがり火に「隣に立って点けられる」セルがあること（ロウソクは前方1セル）。
    for (const cell of torchCells) {
      const [r, c] = cell.split(',').map(Number);
      const standable = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) return false;
        return bg[rr][cc] !== W && !isHardBlocked(tiles[rr][cc]);
      });
      if (!standable) throw new Error(`${key}: かがり火 ${cell} の隣に立てるセルが無い（点けられない）`);
      if (isRing(r, c)) throw new Error(`${key}: かがり火 (${cell}) が継ぎ目の境界セル`);
    }
  }

  // はしご迂回は2回検査する＝素の盤面と「全部の茂みを刈った盤面」（刈ると橋脚が生まれる）。
  const allow = new Set(spec.ladderBridges ?? []);
  assertNoLadderBypass(tiles, bg, key, allow, '');
  const cut = tiles.map((row) => row.map((ch) => (ch === TILE.BUSH ? '.' : ch)));
  assertNoLadderBypass(cut, bg, key, allow, '（茂みを刈った後）');

  // 実手順の全探索。
  const { states, playerCells } = verifyPuzzle(tiles, bg, spec, key);

  // 宝箱は実手順のどこかで踏めること（B は passable）。
  if (spec.chest) {
    const [cr, cc] = spec.chest.pos.split(',').map(Number);
    if (tiles[cr][cc] !== 'B') throw new Error(`${key}: chest ${spec.chest.pos} が 'B' でない`);
    if (!playerCells.has(spec.chest.pos)) throw new Error(`${key}: 宝箱 ${spec.chest.pos} に実手順で届かない`);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
    if (tiles[r][c] === 'B' && spec.chest?.pos !== `${r},${c}`)
      throw new Error(`${key}: 中身の無い宝箱 (${r},${c})`);
  // ボス部屋の報酬は「主に認められてから」渡す＝宝箱に bossYielded 封印が必須。
  // 封印が無いと戦う前に開けられる＝先に銀のブーメランを持って主と戦えてしまい儀式が飾りになる。
  if (spec.boss && spec.chest) {
    if (spec.show?.pos !== spec.chest.pos || spec.show?.cond?.trigger !== 'bossYielded')
      throw new Error(`${key}: ボス部屋の宝箱 ${spec.chest.pos} に bossYielded 封印が無い`);
  }
  if (spec.show?.cond?.trigger === 'bossYielded' && !spec.boss)
    throw new Error(`${key}: bossYielded 封印なのにボスが居ない（永久に開かない宝箱）`);
  // 報酬がどこにも無いボス部屋を作らない（bossReward も宝箱も無い＝倒して終わり）。
  if (spec.boss && !spec.boss.reward?.length && !spec.chest)
    throw new Error(`${key}: ボス部屋に報酬が無い（bossReward も宝箱も無い）`);
  // 看板は隣に立てること・本文の無い石碑を置かないこと。
  if (spec.sign) {
    const [sr, sc] = spec.sign.pos.split(',').map(Number);
    if (tiles[sr][sc] !== 'i') throw new Error(`${key}: sign ${spec.sign.pos} が 'i' でない`);
    const canStand = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => playerCells.has(`${sr + dr},${sc + dc}`));
    if (!canStand) throw new Error(`${key}: 石碑 ${spec.sign.pos} を読める位置に立てない`);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (tiles[r][c] !== 'i') continue;
    if (spec.sign?.pos !== `${r},${c}`) throw new Error(`${key}: 本文の無い石碑 (${r},${c})`);
  }
  // 笛の封印には fluteEffect が要る（playFlute は stageData.fluteEffect が無いと何もしない）。
  if (spec.show?.cond?.trigger === 'flutePlayed' && !spec.flute)
    throw new Error(`${key}: flutePlayed 封印なのに fluteEffect が無い（笛が鳴らない）`);

  return { tiles, bg, states };
}

// ── 実行 ──────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

for (const k of DELTA_LOWER) {
  if (!field[k]) throw new Error(`missing delta stage ${k}`);
  if (!SCREENS[k]) throw new Error(`delta screen ${k} has no spec`);
  if (field[k].rows !== ROWS || field[k].cols !== COLS)
    throw new Error(`unexpected size on ${k}: ${field[k].rows}x${field[k].cols}`);
}
for (const k of Object.keys(SCREENS)) if (!DELTA_LOWER.includes(k)) throw new Error(`bad spec key ${k}`);

let built = 0;
const solverStats = [];
const results = {};
for (const key of DELTA_LOWER) {
  const spec = SCREENS[key];
  const { tiles, bg, states } = buildScreen(key, spec);
  results[key] = { tiles, bg };
  solverStats.push(`${key} ${spec.role}: ${states} 状態を全探索（詰み 0）`);
}

// ── 双方向 arrival-wall ガード ─────────────────────────────────────────────
// 境界セルの開閉が両側で一致すること。片側だけ開いていると「開いて見えるのに弾かれる
// 見えない壁」か「dead edge（seam/trap）」になる。新9画面同士は新データ、外側は live と
// 突き合わせる（外境界は §19-11-G ⑤ のとおり動かさない＝ここで一致が壊れたら設計ミス）。
{
  const SIDES = [
    ['N', -1, 0], ['S', 1, 0], ['W', 0, -1], ['E', 0, 1],
  ];
  const openAt = (key, r, c) => {
    if (results[key]) return openBg(results[key].bg[r][c], results[key].tiles[r][c]);
    const st = field[key];
    return openBg(st.bgTiles?.[`${r},${c}`] ?? 'g', liveRow(st, r)[c]);
  };
  const problems = [];
  for (const key of DELTA_LOWER) {
    const [sx, sy] = key.split(',').map(Number);
    for (const [side, dy, dx] of SIDES) {
      const nKey = `${sx + dx},${sy + dy}`;
      if (!field[nKey]) continue;   // 地図外＝エンジンはクランプ（安全）
      for (let i = 0; i < (side === 'N' || side === 'S' ? COLS : ROWS); i++) {
        const [r, c] = side === 'N' ? [0, i] : side === 'S' ? [ROWS - 1, i]
          : side === 'W' ? [i, 0] : [i, COLS - 1];
        const [nr, nc] = side === 'N' ? [ROWS - 1, i] : side === 'S' ? [0, i]
          : side === 'W' ? [i, COLS - 1] : [i, 0];
        const a = openAt(key, r, c), b = openAt(nKey, nr, nc);
        if (a !== b)
          problems.push(`${key} ${side} (${r},${c})=${a ? '開' : '閉'} ↔ ${nKey} (${nr},${nc})=${b ? '開' : '閉'}`);
      }
    }
  }
  if (problems.length)
    throw new Error(`境界セルの開閉が片側だけ違う（見えない壁 / dead edge）:\n  ${problems.join('\n  ')}`);
}

// レイアウト重複（9画面が同じ絵になっていないこと・既存の field 全画面とも衝突しないこと）。
{
  const hashOf = (tiles, bg) =>
    tiles.map((row, r) => row.map((ch, c) => (bg[r][c] === W ? W : ch)).join('')).join('|');
  const seen = new Map();
  for (const key of DELTA_LOWER) {
    const { tiles, bg } = results[key];
    const hash = hashOf(tiles, bg);
    if (seen.has(hash)) throw new Error(`duplicate layout: ${key} == ${seen.get(hash)}`);
    seen.set(hash, key);
  }
  for (const [key, st] of Object.entries(field)) {
    if (DELTA_LOWER.includes(key)) continue;
    const tiles = Array.from({ length: ROWS }, (_, r) => liveRow(st, r));
    const bg = Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => st.bgTiles?.[`${r},${c}`] ?? 'g'));
    const hit = seen.get(hashOf(tiles, bg));
    if (hit) throw new Error(`duplicate layout: ${hit} == 既存の ${key}`);
  }
}

const DRY = process.argv.includes('--dry');
for (const key of DELTA_LOWER) {
  const spec = SCREENS[key];
  const { tiles, bg } = results[key];
  const stage = field[key];

  if (DRY) {
    console.log(`\n=== ${key} ${spec.role} — tiles | bgTiles ===`);
    for (let r = 0; r < ROWS; r++) console.log(String(r).padStart(2), tiles[r].join(''), ' ', bg[r].join(''));
    continue;
  }

  stage.tiles = tiles.map((row) => row.slice());
  const bgObj = {};
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) bgObj[`${r},${c}`] = bg[r][c];
  stage.bgTiles = bgObj;

  stage.chestContents = {};
  stage.showConditions = {};
  stage.signData = {};
  stage.breakableWalls = {};
  stage.links = (spec.links ?? []).flatMap(([switchId, gates]) => gates.map((gateId) => ({ switchId, gateId })));
  if (spec.chest) stage.chestContents[spec.chest.pos] = spec.chest.content;
  if (spec.show) stage.showConditions[spec.show.pos] = spec.show.cond;
  if (spec.sign) stage.signData[spec.sign.pos] = { name: spec.sign.name, lines: spec.sign.lines };
  for (const [pk, bd] of Object.entries(spec.break ?? {})) stage.breakableWalls[pk] = { breakDef: bd };
  if (spec.torch?.lit?.length) stage.initLitTorches = spec.torch.lit.slice();
  else delete stage.initLitTorches;
  if (spec.flute) stage.fluteEffect = { ...spec.flute };
  else delete stage.fluteEffect;
  if (spec.boss) {
    stage.isBossRoom = true;
    // reward が空＝その場で配る報酬は無い（宝箱で渡す）。空配列を残すと「報酬あり」の
    // 誤読を招くのでキーごと消す。
    if (spec.boss.reward?.length) stage.bossReward = spec.boss.reward.map((x) => ({ ...x }));
    else delete stage.bossReward;
  } else {
    stage.isBossRoom = false;
    delete stage.bossReward;
  }
  built++;
}

if (!DRY) writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

console.log('');
for (const line of solverStats) console.log(`  ${line}`);
console.log(`\n9-6 ④ 深洋O デルタ下半: ${built} screens built${DRY ? ' [DRY — not written]' : ''}`);
