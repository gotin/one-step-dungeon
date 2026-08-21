#!/usr/bin/env node
/**
 * migrate-field-desert-south.mjs
 *   9-6-BASE 外周解体＋隣接地域編入（キュー8番）の **⑥ 砂漠D 南岸 10画面 ＋ `4,19`（渚G3）**
 *   ＝計11画面を作り込む。
 *   砂漠D: `0,17` `0,18` `0,19` `1,18` `1,19` `2,15` `2,18` `2,19` `3,18` `3,19`
 *   渚G3 : `4,19`（単発の未満2軸＝PLAN の⑥に同梱すると決めた画面）
 *
 * 背景（PLAN.md #8 の規則「残っている地域別の未満2軸の塊が最小の塊から着手する」）:
 *   ①深洋O → ②湖W東 → ③森F北西 → ④火山L外輪 → ⑤北の外周帯 に続く⑥。実測で
 *   D:10 / M:13 / P:14 / S:14 ＝砂漠Dが最小の塊。`4,19` は単独の残り（南端）なので同梱する。
 *   11枚とも実データは「タイル全面 '.'／下地は草の縁取り＋長方形の水たまり」という
 *   同一の空塗り絵＝作り込み前の placeholder（dupScreens にも効いている）。
 *
 * テーマ（FIELD-9-6-DESIGN §9〜§9-2 の砂漠の作法から）:
 *   「世界の縁」＝砂漠が海に落ちる南岸／砂に沈んだ港。下地は砂 'd'、外海と入江は水 '~'、
 *   石畳 'o' は下地に敷く（tiles 層の 'o' は浮き出た石ブロックに描かれる＝壁に見える）。
 *   到着時の持ち物は **剣＋木の盾だけ**（ブーメランD2・ロウソクD4・はしごD5・爆弾D6は後）。
 *   ∴「今できる」のは剣で叩く 'Y'（潮ゲート）と茂み刈り 'u' の2つだけ。
 *   はしご・爆弾・ロウソクの仕掛けは全て**任意報酬の袋小路**に置く（進行必須にしない）。
 *   石押し（'*'→'S'→'T'）は砂漠の枠を既に `2,14`／`0,12` で使っている∴ここでは使わない。
 *
 * 自己検証（北の外周帯 migrate の写し＋海岸線向けに4点だけ改造）:
 *   ① 外周リング＝**現在の実データの歩ける/歩けないを1ビットも動かさない**（北の外周帯は
 *      「細い十字」で開口を作り直したが、南岸は隣接画面（作り込み済みの砂漠・渚）が既に
 *      入り組んだ縁を持つ∴現データの写しが唯一の安全な作法）。加えて**継ぎ目の相互整合**
 *      （自分の要開口と隣の実データが一致するか）を全交差で照合する＝seams/traps/
 *      footprintBlocked が構成上不変になる。
 *   ② 閉じたリングセルの見た目は岩山 'M' **または下地の水 '~'**（＝外海・入江の岸）。
 *   ③ 徒歩の塊は**複数あってよい**（`0,17`/`3,18`/`4,19` の (0,11) は隣画面の 'M' 壁に
 *      挟まれた1セルの通し所＝画面内では孤立するのが正しい姿）。塊ごとに状態空間を
 *      展開し、到達セルを合併して無駄セル0を見る。
 *   ④ `sealed` ＝「その仕掛けを解かないと徒歩では届かないセル」を明示し、
 *      徒歩BFS（道具なし・ゲート閉・下地の水も壁）に**入っていないこと**を検査する。
 *      対照実験（tools）と対で「ゲートが何も塞いでいない飾り」を機械的に弾く。
 *   ⑤ 特別なタイル（'v' 橋・'=' 潮ゲート・'x' 穴・'B' 宝箱 等）の下地が水でないこと。
 *      ⚠️ `game/passable.js tilePassable` は **isWaterAt を潮ゲート/橋の判定より先に**
 *      見る∴下地が水のゲートは「開いたのに永久に通れない」（実装済みの罠）。
 *   ⑥〜⑨ 以降は北の外周帯と同じ（無駄セル0・看板/かがり火の隣接・詰まない・対照実験・
 *      軸2以上・重複配置なし・宝箱/看板/links/breakableWalls/enemyDirs/弱点の整合）。
 *
 * 使い方: node scripts/migrate-field-desert-south.mjs [--dry] [--rings]
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
// tiles: '.' 素の地面（見える地面は bg 側）/ 'M' 岩山＝メサ・断崖 / '#' 石壁（採石の切羽・
//   難破船の肋材・柱）/ 'u' 茂み（剣で刈れる）/ 'x' 陥没穴（はしごで幅1だけ渡る）/
//   'v' 橋・渡し板 / '=' 潮ゲート（'Y' とリンク）/ 'Y' 叩くスイッチ（剣で入る）/
//   'H' かがり火（ロウソク）/ 'B' 宝箱 / '!' 爆弾で割れる岩 / 'i' 石碑・道標 /
//   'h' 廃屋の壁・'p' 廃屋の屋根 / '>' 別レイヤーへの入口（既存の mapEnters を保つ）/
//   敵 'E' パトロール・'C' チェイサー・'α' 地中蟲・'ξ' コウモリ群（弱点持ちは field 不可）。
//   ⚠️ 'o' は tiles に書かない＝石畳は bg 側の 'o'（平らな石床）で敷く。
// bg: 見える地面（10行×12列）。'd' 砂・'g' 草・'o' 石畳・'~' 水（外海/入江/塩湖）。
//   下地の水は実エンジン・接続チェッカー・軸計算のすべてが壁として畳む。
// sealed: 仕掛けを解かないと徒歩では届かないセル（④の検査対象）。
// tools: 対照実験（control を封じたら cell に到達できないこと）。
//   control: 'noTools'（爆弾/弓/ブーメラン/ロウソク封じ）/ 'noLadder' / 'noPush' / 'noBush'
const SCREENS = [
  {
    key: '0,17',
    title: '塩の池',
    // 砂漠の南西の隅。北は `0,16` のメサの裾（実データが西・南を 'M' で閉じている）、
    // 西は外海。干上がりかけた塩湖を回り込む画面。東の岩に育った塩の結晶（'!'）の裏に
    // 小さな袋があり、爆弾（D6）を得てから戻る＝任意報酬。
    tiles: [
      '.MMMMMMMMMM.',
      '...........M',
      '...........M',
      '.........MMM',
      '.........!BM',
      '.........MMM',
      '...........M',
      '........i..M',
      '...........M',
      '...........M',
    ],
    bg: [
      '~ddddddddddd',
      '~ddddddddddd',
      '~d~~~~~~dddd',
      '~d~~~~~~dddd',
      '~d~~~~~~dddd',
      '~d~~~~~~dddd',
      '~d~~~~~ddddd',
      '~dd~~~dddddd',
      '~ddddddddddd',
      '~ddddddddddd',
    ],
    chestContents: { '4,10': { type: 'rupee', value: 40, name: 'ルピー×40' } },
    breakableWalls: { '4,9': { breakDef: 1 } },
    signData: {
      '7,8': {
        name: '塩の池の石碑',
        lines: [
          '【塩の池】',
          '陽に 焼かれ 水は 塩へと 変わる。',
          '東の 岩に 育つ 塩の 塊は 火薬で 崩れる。',
        ],
      },
    },
    sealed: ['4,10'],
    tools: [{ cell: '4,10', control: 'noTools', why: '爆弾で塩の結晶を割らないと岩の袋に入れない' }],
  },
  {
    key: '0,18',
    title: '沈んだ桟橋',
    // 海が引いて取り残された入江。石畳の桟橋（下地 'o'）が入江を西へ突き出し、
    // 板が抜けた1セル（'x'）で切れている＝はしご（D5）で渡ると先端の宝に届く。
    // 桟橋の南北は入江の水∴縦の橋は成立しない（横向きにだけ渡れる形）。
    tiles: [
      '...........M',
      '............',
      '............',
      '........α...',
      '.B.x........',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
    bg: [
      '~ddddddddddd',
      '~ddddddddddd',
      '~~~~~~~ddddd',
      '~~~~~~~ddddd',
      '~ooooodddddd',
      '~~~~~~~ddddd',
      '~~~~~~~ddddd',
      '~ddddddddddd',
      '~ddddddddddd',
      '~ddddddddddd',
    ],
    chestContents: { '4,1': { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } },
    sealed: ['4,1', '4,2'],
    tools: [{ cell: '4,1', control: 'noLadder', why: 'はしごで桟橋の抜けた板を渡らないと先端の宝に届かない' }],
  },
  {
    key: '0,19',
    title: '岬の狼煙',
    // 地図の南西の角。北の入江から流れ込む潮の水路が画面を横切り、渡し板（'v'）1枚だけが
    // 南の岬へ通じる。岬には狼煙台が2つ並び、両方灯すと（torchesLit）沈んでいた箱が現れる
    // ＝火種が無い∴ロウソク（D4）を得てから戻る画面。
    tiles: [
      '............',
      '............',
      '............',
      '....v.......',
      '............',
      '..H.........',
      '....B.......',
      '..H.........',
      '............',
      '............',
    ],
    bg: [
      '~ddddddddddd',
      '~ddddddddddd',
      '~ddddddddddd',
      '~~~~d~~~dddd',
      '~ddddddd~ddd',
      '~ddddddd~ddd',
      '~ddddddd~ddd',
      '~ddddddd~ddd',
      '~ddddddd~ddd',
      '~~~~~~~~~~~~',
    ],
    chestContents: { '6,4': { type: 'rupee', value: 60, name: 'ルピー×60' } },
    showConditions: {
      '6,4': { trigger: 'torchesLit', message: '🔥 岬の 狼煙が 二つ 上がった！封じの 箱が 現れた！' },
    },
  },
  {
    key: '1,18',
    title: '埋もれた市場',
    // 砂に沈んだ港町の市場。下地の石畳（'o'）に石壁（'#'）の露店が並ぶ。
    // 北は `1,17` のメサ（実データが row0 を閉じている）で、(0,11) だけが東への通し所。
    // 露店の間に封じの宝箱＝killAll（剣だけで倒せる E と C）。
    tiles: [
      'MMMMMMMMMMM.',
      '............',
      '..##....##..',
      '..#..E...#..',
      '............',
      '..#..B...#..',
      '..##.C..##..',
      '............',
      '...i........',
      '............',
    ],
    bg: [
      'dddddddddddd',
      'dddddddddddd',
      'ddoooooooodd',
      'ddoooooooodd',
      'ddoooooooodd',
      'ddoooooooodd',
      'ddoooooooodd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
    ],
    chestContents: { '5,5': { type: 'rupee', value: 50, name: 'ルピー×50' } },
    showConditions: {
      '5,5': { trigger: 'killAll', message: '⚔ 市場を 荒らす 者を 退けた！封じの 宝箱が 現れた！' },
    },
    signData: {
      '8,3': {
        name: '市場跡の石碑',
        lines: [
          '【埋もれた市場】',
          'この 石畳は 海へ 続く 道の 跡。',
          '商いの 声は とうに 砂の 下。',
        ],
      },
    },
  },
  {
    key: '1,19',
    title: '潮ゲートの入江',
    // 砂漠側で最初に「今の道具で解ける」画面。岩棚のスイッチ 'Y' を**剣で叩く**と
    // 入江の潮ゲート '=' が開き、沈んだ窪みへ降りられる（窪みは水で四方を囲まれ、
    // ゲートが唯一の入口＝sealed で機械的に保証する）。窪みの箱は switchOn で現れる。
    tiles: [
      '............',
      '.....Y......',
      '............',
      '............',
      '.....==.....',
      '......B.....',
      '............',
      '............',
      '............',
      '............',
    ],
    bg: [
      'dddddddddddd',
      'dddddddddddd',
      'dd~~dddd~~dd',
      'dd~~~dd~~~dd',
      'dd~~~dd~~~dd',
      'dd~~~dd~~~dd',
      'dd~~~~~~~~dd',
      'dddddddddddd',
      'dddddddddddd',
      '~~~~~~~~~~~~',
    ],
    links: [{ switchId: '1,5', gateId: '4,5' }, { switchId: '1,5', gateId: '4,6' }],
    chestContents: { '5,6': { type: 'rupee', value: 30, name: 'ルピー×30' } },
    showConditions: {
      '5,6': { trigger: 'switchOn', switchId: '1,5', message: '≋ 潮が 引き、沈んでいた 箱が 現れた！' },
    },
    sealed: ['5,5', '5,6'],
  },
  {
    key: '2,15',
    title: '神殿の前庭',
    // ダンジョン2（砂の神殿）の玄関。'>' (5,5) と mapEnters は既存のまま据える。
    // ⚠️ 実データは下地が**草**だった＝砂漠の真ん中に緑の島が浮いて見えていた（塗り忘れ）。
    //    砂 'd' に塗り替え、参道だけ石畳 'o' を下地に敷いて入口へ視線を通す。
    //    外周40セルは全部開いている（四方の隣が全部開いた辻）∴内側だけを彫る。
    tiles: [
      '............',
      '............',
      '...#....#...',
      '............',
      '...#.E..#...',
      '.....>......',
      '...#....#...',
      '.....E......',
      '...#B...#...',
      '............',
    ],
    bg: [
      'dddddodddddd',
      'dddddodddddd',
      'dddddodddddd',
      'dddddodddddd',
      'ddddoooddddd',
      'ddddoooddddd',
      'ddddoooddddd',
      'dddddodddddd',
      'dddddodddddd',
      'dddddodddddd',
    ],
    chestContents: { '8,4': { type: 'rupee', value: 20, name: 'ルピー×20' } },
  },
  {
    key: '2,18',
    title: '陥没の砂原',
    // 砂が抜けて落ちた陥没穴が2つ。西の穴（2,3）の下は岩に囲まれた袋で、
    // はしご（D5）で1セルだけ渡ると宝に届く＝任意報酬。東の穴（5,6）は道の途中の近道。
    // 北は `2,17` のメサ（実データが row0 を閉じ、(0,0) だけ通す）。
    tiles: [
      '.MMMMMMMMMMM',
      '............',
      '..MxM...MMM.',
      '..M.M...M.E.',
      '..MBM...M...',
      '..MMM.x.....',
      '....E.......',
      '............',
      '...i........',
      '............',
    ],
    bg: [
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
    ],
    chestContents: { '4,3': { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } },
    signData: {
      '8,3': {
        name: '陥没の砂原の石碑',
        lines: [
          '【陥没の砂原】',
          '砂の 下は 空洞。踏み抜けば 戻れぬ。',
          '梯子を 持つ 者だけが 穴の 先を 見る。',
        ],
      },
    },
    sealed: ['3,3', '4,3'],
    tools: [{ cell: '4,3', control: 'noLadder', why: 'はしごで陥没穴を渡らないと岩の袋の宝に届かない' }],
  },
  {
    key: '2,19',
    title: '漁師の廃屋',
    // 海が遠ざかって取り残された漁師の家が2軒（'p' 屋根＋'h' 壁）＝南岸のランドマーク。
    // 潮だまりが残り、コウモリ群 ξ が屋根に巣を作っている。killAll で封じの宝箱。
    tiles: [
      '............',
      '............',
      '...p...p....',
      '...h...h....',
      '............',
      '.....B......',
      '..ξ.....C...',
      '............',
      '..i.........',
      '............',
    ],
    bg: [
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddd~~dddddd',
      'dddd~~dddddd',
      'dddddddddddd',
      '~~~~~~~~~~~~',
    ],
    chestContents: { '5,5': { type: 'rupee', value: 40, name: 'ルピー×40' } },
    showConditions: {
      '5,5': { trigger: 'killAll', message: '⚔ 廃屋に 巣くう 者を 払った！封じの 宝箱が 現れた！' },
    },
    signData: {
      '8,2': {
        name: '漁師の廃屋の石碑',
        lines: [
          '【漁師の廃屋】',
          '海が 遠ざかり 舟は 砂に 残された。',
          '家の 主は もう 帰らぬ。',
        ],
      },
    },
  },
  {
    key: '3,18',
    title: '砂岩の石切場',
    // 神殿の石を切り出した跡。切羽（'#'）に囲まれた棚の奥に宝があり、
    // 塞ぐ砂岩（'!'）は爆弾（D6）で割る＝任意報酬。採石で湧いた水が窪みに溜まっている。
    // (0,11) は `3,17`↔`4,18` を結ぶ1セルの通し所（画面内では孤立するのが正しい）。
    tiles: [
      'MMMMMMMMMMM.',
      '...........M',
      '..####.....M',
      '..#B!......M',
      '..####.....M',
      '...........M',
      '...........M',
      '...........M',
      '.i.........M',
      '...........M',
    ],
    bg: [
      'dddddddddddd',
      'dddddddddddd',
      'ddoooooddddd',
      'ddoooooddddd',
      'ddoooooddddd',
      'dddddddddddd',
      'dddd~~dddddd',
      'ddddd~~ddddd',
      'dddddddddddd',
      'dddddddddddd',
    ],
    chestContents: { '3,3': { type: 'rupee', value: 70, name: 'ルピー×70' } },
    breakableWalls: { '3,4': { breakDef: 1 } },
    signData: {
      '8,1': {
        name: '石切場の石碑',
        lines: [
          '【砂岩の石切場】',
          '神殿の 石は ここから 切り出された。',
          '切り残しの 岩は 火薬で 崩せる。',
        ],
      },
    },
    sealed: ['3,3'],
    tools: [{ cell: '3,3', control: 'noTools', why: '爆弾で切り残しの岩を割らないと石棚の宝に入れない' }],
  },
  {
    key: '3,19',
    title: '難破船の骨',
    // `1,16` の道標「南 … 世界の縁（引き返せ）」の答え合わせ＝地図の南の果て。
    // 打ち上げられた船の骨組み（'#' の肋材）が浜に横たわり、渡し板（'v'）1枚が船内への
    // 唯一の入口。船倉に積み荷が残っている。
    // ⚠️ 2026-08-21 実画面を見て輪郭を作り直した：長方形の囲いは「石の囲い」に見えて
    //    船に読めなかった（[[judge-obvious-visual-defects-yourself]]）。舳先（北）と
    //    艫（南）を絞った紡錘形にして、艫の渡し板 'v'(7,5) を唯一の入口にした。
    tiles: [
      '...........M',
      '.....##.....',
      '....#..#....',
      '...#....#...',
      '...#.B..#...',
      '...#....#...',
      '....#..#....',
      '.....v#.C...',
      '..i.........',
      '............',
    ],
    bg: [
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      'dddddddddddd',
      '~~~~~~~~~~~~',
    ],
    chestContents: { '4,5': { type: 'rupee', value: 80, name: 'ルピー×80' } },
    signData: {
      '8,2': {
        name: '世界の縁の碑',
        lines: [
          '【世界の縁】',
          '砂漠の 道標が 告げた 果てが ここ。',
          '船の 骨だけが 波打ち際に 残る。',
        ],
      },
    },
  },
  {
    key: '4,19',
    title: '渚の茂み',
    // 渚 G3 の南端（下地は草 'g'）。西の `3,19` からだけ入れ、東の (0,11) は
    // `4,18`↔`5,19` を結ぶ1セルの通し所。潟湖を回り込むと茂みの塊があり、
    // **剣で刈れば**（到着時の道具で解ける）中の宝に届く。
    tiles: [
      'MMMMMMMMMMM.',
      '...........M',
      '........uuuM',
      '........uBuM',
      '........uuuM',
      '...........M',
      '...........M',
      '...........M',
      '...........M',
      '...........M',
    ],
    bg: [
      'gggggggggggg',
      'gggggggggggg',
      'gg~~~~gggggg',
      'gg~~~~gggggg',
      'gg~~~~gggggg',
      'ggg~~~gggggg',
      'ggg~~ggggggg',
      'gggggggggggg',
      'gggggggggggg',
      '~~~~~~~~~~~~',
    ],
    chestContents: { '3,9': { type: 'rupee', value: 25, name: 'ルピー×25' } },
    sealed: ['3,9'],
    tools: [{ cell: '3,9', control: 'noBush', why: '茂みを刈らないと塊の中の宝に届かない' }],
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

/** 下地 bgTiles（10行×12列）。'd' 砂・'g' 草・'o' 石畳・'~' 水のみ許す。 */
const BG_CHARS = new Set(['d', 'g', TILE.STONE_FLOOR, TILE.WATER]);
function bgGridOf(spec) {
  const bg = parse(spec.bg, `${spec.key}(bg)`);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!BG_CHARS.has(bg[r][c])) throw new Error(`${spec.key}: bg ${key(r, c)} が '${bg[r][c]}'（d/g/o/~ のみ）`);
  }
  return bg;
}

// 下地が水だと**機構が永久に死ぬ**タイル（game/passable.js tilePassable は isWaterAt を
// 潮ゲート/橋/穴の判定より先に見る）。'.' と 'M' だけは水の上に置いてよい
// （'.'＋水下地＝ただの水面、'M'＋水下地＝海に突き出た岩）。
const NEEDS_DRY_BG = new Set([
  TILE.BRIDGE, TILE.TIDE_GATE, TILE.GATE, TILE.PIT, TILE.CHEST, TILE.SIGN, TILE.TORCH,
  TILE.SWITCH, TILE.BUTTON, TILE.STONE, TILE.BREAKABLE_WALL, TILE.BUSH, TILE.MAP_ENTER,
]);

const RING = [];
for (let c = 0; c < COLS; c++) { RING.push([0, c]); RING.push([ROWS - 1, c]); }
for (let r = 1; r < ROWS - 1; r++) { RING.push([r, 0]); RING.push([r, COLS - 1]); }
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 徒歩で立てるか（道具なし・ゲート閉）。下地の水は壁（実エンジン・接続チェッカーと同じ）。 */
const walkable = (tiles, bg, r, c) => {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  if (bg[r][c] === TILE.WATER) return false;
  const ch = tiles[r][c];
  if (ch === TILE.GATE || ch === TILE.TIDE_GATE) return false;   // 閉じている（スイッチ待ち）
  if (ch === TILE.BREAKABLE_WALL) return false;
  if (ENEMY_META[ch]) return true;
  return !isHardBlocked(ch);
};

// ── ① 外周リングの必要開口（**現データの写し**＋継ぎ目の相互整合） ──────────
// 北の外周帯は「隣が既存ならミラー／隣も作り替えなら細い十字」で開口を作り直したが、
// 南岸は隣接する砂漠・渚が既に入り組んだ縁（メサの裾・入江・1セルの通し所）を持つ∴
// **作り替える11枚自身の現データの歩ける/歩けないをそのまま要件にする**のが唯一安全。
// これで seams / traps / footprintBlocked / W1 / W2 は構成上1件も動かない。
const openNow = (stage, r, c) => !isHardBlocked(cellTile(stage, r, c));
const crossingsOf = (sx, sy, r, c) => {
  const out = [];
  if (r === 0) out.push([`${sx},${sy - 1}`, ROWS - 1, c]);
  if (r === ROWS - 1) out.push([`${sx},${sy + 1}`, 0, c]);
  if (c === 0) out.push([`${sx - 1},${sy}`, r, COLS - 1]);
  if (c === COLS - 1) out.push([`${sx + 1},${sy}`, r, 0]);
  return out;
};
function requiredRings(stages, rebuiltKeys) {
  const req = new Map();
  for (const k of rebuiltKeys) {
    const self = stages[k];
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    for (const [r, c] of RING) grid[r][c] = openNow(self, r, c);
    req.set(k, grid);
  }
  // 継ぎ目の相互整合＝「自分が開くなら隣も開いている / 自分が閉じるなら隣も閉じている」。
  // 現データは seams:0（dead edge なし）で保たれている∴ここは現状の再確認だが、
  // 要件の出し方を間違えたときに黙って通らないための番犬として残す。
  for (const k of rebuiltKeys) {
    const [sx, sy] = k.split(',').map(Number);
    for (const [r, c] of RING) {
      const mine = req.get(k)[r][c];
      for (const [nk, nr, nc] of crossingsOf(sx, sy, r, c)) {
        const ns = stages[nk];
        if (!ns) {                                 // 地図の外＝縁は閉じていなければならない
          if (mine) throw new Error(`${k}: 外周 ${key(r, c)} は地図の外へ開いている`);
          continue;
        }
        const theirs = rebuiltKeys.has(nk) ? req.get(nk)[nr][nc] : openNow(ns, nr, nc);
        if (mine !== theirs)
          throw new Error(`${k}: 外周 ${key(r, c)} の開閉が隣 ${nk}(${key(nr, nc)}) と食い違う`
            + `（自分 ${mine ? '開' : '閉'} / 隣 ${theirs ? '開' : '閉'}）＝継ぎ目バグ`);
      }
    }
  }
  return req;
}

function checkRing(spec, tiles, bg, need) {
  for (const [r, c] of RING) {
    const open = walkable(tiles, bg, r, c);
    if (need[r][c] && !open)
      throw new Error(`${spec.key}: 外周 ${key(r, c)} は開いていないといけない（現データが開＝継ぎ目バグ）`);
    if (!need[r][c] && open)
      throw new Error(`${spec.key}: 外周 ${key(r, c)} は閉じていないといけない（隣が壁 or 地図の外＝dead edge）`);
    if (need[r][c]) {
      // 開いた外周は素の地面だけ＝到着セルに開閉するタイルを置かない
      // （trap＝arrival-wall / footprintBlocked が構成上0のままになる）。
      if (tiles[r][c] !== TILE.FLOOR)
        throw new Error(`${spec.key}: 開いた外周 ${key(r, c)} が '${tiles[r][c]}'（到着セルは素の地面 '.' に限る）`);
      continue;
    }
    // 閉じた外周の見た目＝岩山 'M'（メサ・断崖）か、下地の水 '~'（外海・入江の岸）。
    if (tiles[r][c] !== TILE.MOUNTAIN && bg[r][c] !== TILE.WATER)
      throw new Error(`${spec.key}: 閉じた外周 ${key(r, c)} が '${tiles[r][c]}'（'M' か下地の水で閉じる）`);
  }
}

// ── ② 徒歩だけの到達（塊は複数あってよい＝1セルの通し所） ────────────────────
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
/** 開いた外周セルを徒歩の塊ごとに分ける（各塊の代表を状態空間の開始点にする）。 */
function walkComponents(tiles, bg, openRing) {
  const comps = [];
  const done = new Set();
  for (const k of openRing) {
    if (done.has(k)) continue;
    const comp = walkBFS(tiles, bg, k);
    for (const c of comp) done.add(c);
    comps.push({ start: k, cells: comp, ring: openRing.filter((x) => comp.has(x)) });
  }
  return comps;
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
// 「隣から使う／叩く」物。穴 'x' は**除外しない**＝はしごで渡るとき実エンジンはその
// 1セルを踏む∴到達対象。
const PROP_TILES = new Set([
  TILE.TREE, TILE.MOUNTAIN, TILE.WALL, TILE.WATER, TILE.LAVA, TILE.SIGN, TILE.TORCH,
  TILE.SWITCH, TILE.SKY, TILE.HOUSE_WALL, TILE.HOUSE_ROOF,
]);

function checkStates(spec, tiles, bg, comps) {
  const openSet = new Set(comps.flatMap((cp) => cp.ring));
  const reached = new Set();
  const stoned = new Set();
  let states = 0;
  for (const cp of comps) {
    const S = solverFor(tiles, bg, spec, FULL);
    const { seen, rev } = explore(S, cp.start);
    states += seen.size;
    for (const k of cellsOf(seen)) reached.add(k);
    for (const k of stoneCellsOf(seen)) stoned.add(k);

    // (c) 入って詰まない＝どの到達状態からも「開いた外周セルに立つ状態」へ戻れる。
    const back = new Set();
    const rq = [];
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
  }

  // (a) 無駄セル0＝壁でないセルは全部（道具を使えば）到達できる。
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = key(r, c);
    if (PROP_TILES.has(tiles[r][c])) continue;
    if (bg[r][c] === TILE.WATER) continue;              // 下地が水＝歩けないのが正しい（海/入江）
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
  // (d) 対照実験＝仕掛けが飾りでない（control を封じたらそのセルへ届かない）。
  for (const t of spec.tools ?? []) {
    const opt = CONTROLS[t.control];
    if (!opt) throw new Error(`${spec.key}: 未知の control '${t.control}'`);
    for (const cp of comps) {
      const r2 = cellsOf(explore(solverFor(tiles, bg, spec, opt), cp.start).seen);
      if (r2.has(t.cell))
        throw new Error(`${spec.key}: ${t.control} でも ${t.cell} に届く＝「${t.why}」が成立していない`);
    }
  }
  return { states, reached };
}

/** ④ sealed ＝仕掛けを解く前（徒歩・ゲート閉・道具なし）には届かないセル。 */
function checkSealed(spec, comps, reached) {
  const walkAll = new Set(comps.flatMap((cp) => [...cp.cells]));
  for (const k of spec.sealed ?? []) {
    if (walkAll.has(k))
      throw new Error(`${spec.key}: sealed ${k} が徒歩だけで届く＝仕掛けが何も塞いでいない飾り`);
    if (!reached.has(k))
      throw new Error(`${spec.key}: sealed ${k} は道具を使っても届かない＝死んだセル`);
  }
}

// ── ⑦ ブーメランの火運び（射程を含めた幾何の検証） ──────────────────────────
// 火種（initLitTorches）が無い画面はロウソク専用＝ここでは早期 return する。
function checkBoomerangFire(spec, tiles, reached) {
  const torches = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (tiles[r][c] === TILE.TORCH) torches.push(key(r, c));
  }
  if (!torches.length) return;
  const lit = new Set(spec.initLitTorches ?? []);
  if (!lit.size) return;
  const range = BOOMERANG_TIERS[0].maxRange;
  const unlit = torches.filter((k) => !lit.has(k));
  let progress = true;
  while (progress) {
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
            if (ch === TILE.BREAKABLE_WALL) break;
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
    throw new Error(`${spec.key}: かがり火 ${dead.join(' ')} は木のブーメラン（射程${range}）では灯せない`);
}

// ── ④⑥ 中身の整合（宝箱/看板/軸） ───────────────────────────────────────────
function buildStage(spec, tiles, bg, prev) {
  const bgTiles = {};
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) bgTiles[key(r, c)] = bg[r][c];
  // '>' の mapEnters は既存データのまま据える（作り替えで別レイヤーへの入口を失わない）。
  const mapEnters = spec.mapEnters ?? prev?.mapEnters ?? {};
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
    mapEnters,
    showConditions: spec.showConditions ?? {},
    breakableWalls: spec.breakableWalls ?? {},
    isBossRoom: false,
    signData: spec.signData ?? {},
  };
  if (spec.initLitTorches?.length) stage.initLitTorches = spec.initLitTorches;
  return stage;
}

function checkContent(spec, stage, prev) {
  const t = stage.tiles;
  const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r][c]; };
  // 既存の mapEnters を1件も落としていない（'>' のセルも動かしていない）。
  for (const [k, me] of Object.entries(prev?.mapEnters ?? {})) {
    if (JSON.stringify(stage.mapEnters[k]) !== JSON.stringify(me))
      throw new Error(`${spec.key}: 既存の mapEnters ${k} が失われた/変わった`);
    if (at(k) !== TILE.MAP_ENTER) throw new Error(`${spec.key}: mapEnters ${k} のタイルが '${at(k)}'（'>' でない）`);
  }
  for (const k of Object.keys(stage.chestContents))
    if (at(k) !== TILE.CHEST) throw new Error(`${spec.key}: 宝箱 ${k} のタイルが '${at(k)}'（'B' でない）`);
  for (const [k, sc] of Object.entries(stage.showConditions)) {
    if (at(k) !== TILE.CHEST) throw new Error(`${spec.key}: showConditions ${k} のタイルが '${at(k)}'（'B' でない）`);
    if (sc.trigger === 'torchesLit' && !t.some((row) => row.includes(TILE.TORCH)))
      throw new Error(`${spec.key}: torchesLit で封じた ${k} の画面に 'H' が無い＝開かない封印`);
    if (sc.trigger === 'switchOn' && at(sc.switchId) !== TILE.SWITCH && at(sc.switchId) !== TILE.BUTTON)
      throw new Error(`${spec.key}: switchOn の switchId ${sc.switchId} が '${at(sc.switchId)}'（'Y'/'S' でない）`);
    if (sc.trigger === 'killAll' && !t.some((row) => row.some((ch) => ENEMY_META[ch])))
      throw new Error(`${spec.key}: killAll で封じた ${k} の画面に敵が居ない＝開かない封印`);
  }
  for (const [k, sd] of Object.entries(stage.signData)) {
    if (at(k) !== TILE.SIGN) throw new Error(`${spec.key}: 看板 ${k} のタイルが '${at(k)}'（'i' でない）`);
    if (!sd.lines?.length) throw new Error(`${spec.key}: 看板 ${k} に本文が無い（無言看板）`);
  }
  for (const { switchId, gateId } of stage.links) {
    if (at(switchId) !== TILE.SWITCH)
      throw new Error(`${spec.key}: links の switch ${switchId} が '${at(switchId)}'（'Y' でない）`);
    if (at(gateId) !== TILE.GATE && at(gateId) !== TILE.TIDE_GATE)
      throw new Error(`${spec.key}: links の gate ${gateId} が '${at(gateId)}'（'T'/'=' でない）`);
  }
  for (const k of stage.initLitTorches ?? []) {
    if (at(k) !== TILE.TORCH) throw new Error(`${spec.key}: initLitTorches ${k} が '${at(k)}'（'H' でない）`);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = t[r][c];
    if (ch === TILE.STONE_FLOOR)
      throw new Error(`${spec.key}: 'o'(${key(r, c)}) を tiles に置いている（石畳は bg 側に敷く）`);
    if (NEEDS_DRY_BG.has(ch) && stage.bgTiles[key(r, c)] === TILE.WATER)
      throw new Error(`${spec.key}: '${ch}'(${key(r, c)}) の下地が水＝実エンジンでは永久に通れない`);
    if (ch === TILE.SIGN && !stage.signData[key(r, c)])
      throw new Error(`${spec.key}: 'i'(${key(r, c)}) に signData が無い＝無言看板`);
    if (ch === TILE.CHEST && !stage.chestContents[key(r, c)])
      throw new Error(`${spec.key}: 'B'(${key(r, c)}) に中身が無い`);
    if (ch === TILE.BREAKABLE_WALL && !stage.breakableWalls[key(r, c)])
      throw new Error(`${spec.key}: '!'(${key(r, c)}) に breakableWalls の定義が無い`);
    if (ch === TILE.MAP_ENTER && !stage.mapEnters[key(r, c)])
      throw new Error(`${spec.key}: '>'(${key(r, c)}) に mapEnters が無い`);
    if (ch === TILE.SWITCH && !stage.links.some((l) => l.switchId === key(r, c)))
      throw new Error(`${spec.key}: 'Y'(${key(r, c)}) に links が無い＝叩いても何も開かない`);
    if ((ch === TILE.GATE || ch === TILE.TIDE_GATE) && !stage.links.some((l) => l.gateId === key(r, c)))
      throw new Error(`${spec.key}: ゲート ${key(r, c)} に links が無い＝開く手段が無い`);
    if (ENEMY_META[ch]?.directional && !stage.enemyDirs[key(r, c)])
      throw new Error(`${spec.key}: 向き別スプライトの敵 '${ch}'(${key(r, c)}) に enemyDirs が無い`);
    if (ENEMY_META[ch]?.weakness)
      throw new Error(`${spec.key}: 弱点持ちの敵 '${ch}'(${key(r, c)}) は field に置けない`
        + `（要 ${ENEMY_META[ch].weakness.type}）`);
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
  const bg = bgGridOf(spec);
  checkRing(spec, tiles, bg, req.get(spec.key));

  // ② 開いた外周を徒歩の塊に分ける（1セルの通し所は単独の塊になるのが正しい）。
  const openRing = RING.filter(([r, c]) => req.get(spec.key)[r][c]).map(([r, c]) => key(r, c));
  if (!openRing.length) throw new Error(`${spec.key}: 開いた外周が無い＝孤立画面`);
  const comps = walkComponents(tiles, bg, openRing);

  const { states, reached } = checkStates(spec, tiles, bg, comps);
  checkSealed(spec, comps, reached);
  checkBoomerangFire(spec, tiles, reached);
  const stage = buildStage(spec, tiles, bg, stages[spec.key]);
  const axes = checkContent(spec, stage, stages[spec.key]);
  report.push({ spec, stage, states, axes, comps: comps.length });
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

console.log(`✅ 砂漠D南岸+渚 +11画面を作り込み${DRY ? '（--dry: 書き込みなし）' : ''}`);
for (const { spec, states, axes, comps } of report) {
  console.log(`   ${spec.key.padEnd(5)} ${spec.title.padEnd(9)} 軸[${[...axes].join(',')}] 状態 ${states} 塊 ${comps}`
    + (spec.tools?.length ? ` 対照 ${spec.tools.map((t) => t.control).join('/')}` : ''));
}
