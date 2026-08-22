#!/usr/bin/env node
/**
 * migrate-field-swamp-p-south.mjs
 *   9-6-BASE 外周解体＋隣接地域編入（キュー8番）の **⑧ 沼P 南岸 14画面** を作り込む。
 *   `12,14` `12,15` `11,16` `11,17` `11,18` `10,17` `10,18` `10,19`
 *   `9,17` `9,18` `9,19` `8,18` `8,19` `7,19`
 *
 * 背景（PLAN.md #8 の規則「残っている地域別の未満2軸の塊が最小の塊から着手する」）:
 *   ①深洋O → ②湖W東 → ③森F北西 → ④火山L外輪 → ⑤北の外周帯 → ⑥砂漠D南岸 →
 *   ⑦山地M 東の水落ち に続く⑧。⑦終了時点の実測は P:14 / S:14 で同数だが、沼P は
 *   ⑦で作り込んだ山地Mの帯と直に接する（`12,16` `12,17` の東隣が `12,18`＝沼P）∴
 *   帯として続けて南へ降りる方が地形の連続性を保てる。14枚とも実データは「タイル全面
 *   '.'（＋外周に 'M' の縁が付くものが数枚）／下地は草一色＋長方形の水たまり」という
 *   同一の空塗り絵＝作り込み前の placeholder（links / mapEnters / chestContents /
 *   signData / showConditions はいずれも空＝保存すべき既存内容が無い）。
 *
 * テーマ（帯の同一性＝「沼の南岸＝都を呑んだ潮の名残」）:
 *   北の沼P本体（`11,14` の祭壇跡・`8,17` の廃村）から続く泥の低地が、南で外海に飲まれて
 *   終わる帯。⑦で「海が都を呑んだ」と語った潮は、ここでは**都そのもの**を沈めている
 *   ∴下地は泥 'w' を基調に、干潟と林の縁だけ草 'g'、沈んだ都の舗装は石畳 'o'、水は '~'。
 *   ⚠️ 石畳は**下地**に敷く（tiles 層の 'o' は浮き出た石ブロックに描かれる＝壁に見える）。
 *   到着時の持ち物は **剣＋木の盾だけ**（_REGION_POWER.P = 2）∴「今できる」のは剣で叩く
 *   'Y'・茂み刈り 'u'・石押し（'*'→'S'→'T'）の3つ。はしご・爆弾・ロウソク・笛の仕掛けは
 *   全て**任意報酬の袋小路**に置く（進行必須にしない）＝
 *   爆弾 `11,17`／ロウソク `11,18`／はしご `10,18`／笛 `8,19`。
 *
 * 封印の一般則（⑧で確立・DECISIONS.md 参照）:
 *   **幅1の下地水だけで囲った窪みは封印にならない。** `blade-solver.mjs` の
 *   `canLadderCross` は「進入軸の幅1水で両隣が陸」を渡らせ、かつ `isBank` は
 *   刈れる茂み 'u' を陸として数える∴幅1水を挟んだ窪みははしごで裏から入れる。
 *   sealed に使う囲いは **水2幅以上か 'M'/'#' のハード壁**でなければならない
 *   （`10,17` の茂み封印・`8,18` の砂州はこの規則で水を2幅に取り直した）。
 *
 * 自己検証（山地M migrate の写し＝ロジックは1行も変えていない）:
 *   ⓐ BG_CHARS は泥 'w'（TILE.MUD）を含む（P の基調色）。
 *   ⓑ ボタン 'S' は links を使わず refreshGates の buttons 経路で 'T' を開く
 *      ∴「'T' に links が無い」を **'S' がある画面に限り** 許し、代わりに
 *      「'S' があるなら 'T' もある」を検査する（`11,16` の石樋＝帯で唯一の石押し画面）。
 *   ① 外周リング＝**現在の実データの歩ける/歩けないを1ビットも動かさない**（隣接画面＝
 *      作り込み済みの沼P本体・⑦の山地M・南の外海が既に縁を決めている∴現データの写しが
 *      唯一の安全な作法）。加えて**継ぎ目の相互整合**（自分の要開口と隣の実データが
 *      一致するか）を全交差で照合する＝seams/traps/footprintBlocked が構成上不変になる。
 *   ② 閉じたリングセルの見た目は岩山 'M' **または下地の水 '~'**（＝外海・入江の岸）。
 *   ③ 徒歩の塊は**複数あってよい**（`7,19` の `(0,0)` は北の `7,18` の `(9,0)` から
 *      だけ入れる1セルの磯＝画面内では孤立するのが正しい姿∴素の '.' のまま据える）。
 *      塊ごとに状態空間を展開し、到達セルを合併して無駄セル0を見る。
 *   ④ `sealed` ＝「その仕掛けを解かないと徒歩では届かないセル」を明示し、
 *      徒歩BFS（道具なし・ゲート閉・下地の水も壁）に**入っていないこと**を検査する。
 *      対照実験（tools）と対で「ゲートが何も塞いでいない飾り」を機械的に弾く。
 *   ⑤ 特別なタイル（'v' 橋・'=' 潮ゲート・'x' 穴・'B' 宝箱 等）の下地が水でないこと。
 *      ⚠️ `game/passable.js tilePassable` は **isWaterAt を潮ゲート/橋の判定より先に**
 *      見る∴下地が水のゲートは「開いたのに永久に通れない」（実装済みの罠）。
 *   ⑥〜⑨ 以降は⑦と同じ（無駄セル0・看板/かがり火の隣接・詰まない・対照実験・
 *      軸2以上・重複配置なし・宝箱/看板/links/breakableWalls/enemyDirs/弱点の整合）。
 *
 * 使い方: node scripts/migrate-field-swamp-p-south.mjs [--dry] [--rings]
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
// tiles: '.' 素の地面（見える地面は bg 側）/ 'M' 岩山＝畦・磯・崖 / '#' 石壁（樋の側壁・
//   都の列柱・墓所の囲い）/ 'u' 茂み（剣で刈れる）/ 'x' 陥没穴（はしごで幅1だけ渡る）/
//   'v' 橋・渡し板 / '=' 潮ゲート・'T' ゲート（'Y' の links または 'S' で開く）/
//   'Y' 叩くスイッチ（剣で入る）/ '*' 押せる石・'S' ボタン（石が載ると永久 ON）/
//   'H' かがり火（ロウソク）/ 'B' 宝箱 / '!' 爆弾で割れる岩 / 'i' 石碑・道標 /
//   'h' 廃屋の壁・'p' その屋根 / '>' 別レイヤーへの入口（既存の mapEnters を保つ）/
//   敵 'E' パトロール・'Γ' 毒沼ヒル・'σ' ルピー喰い・'ψ' 呪い火・'ξ' コウモリ群
//   （向き別スプライトの敵 θ μ ζ λ π は field 不可＝enemyDirs を要する）。
//   ⚠️ 'o' は tiles に書かない＝石畳は bg 側の 'o'（平らな石床）で敷く。
// bg: 見える地面（10行×12列）。'w' 泥・'g' 草・'o' 石畳・'~' 水（外海/潮溜まり/棚田）。
//   下地の水は実エンジン・接続チェッカー・軸計算のすべてが壁として畳む。
// sealed: 仕掛けを解かないと徒歩では届かないセル（④の検査対象）。
// tools: 対照実験（control を封じたら cell に到達できないこと）。
//   control: 'noTools'（爆弾/弓/ブーメラン/ロウソク封じ）/ 'noLadder' / 'noPush' / 'noBush'
const SCREENS = [
  {
    key: '12,14',
    title: '棚田の落し口',
    // 帯の入口。北の `12,13`（⑦山地M の段）から降りた水が、崩れた棚田を伝って
    // 東の溜まりへ落ちる。畦を積み直した岩山 'M' の中に穀物庫の跡があり、戸は
    // 茂み 'u' 一枚＝**到着時の剣だけで解ける**（帯で最初の報酬）。
    tiles: [
      '............',
      '....t.......',
      '..MMMMM.....',
      '..M...M.....',
      '..M.B.M.....',
      '..M...M.....',
      '..MMuMM.....',
      '...i........',
      '.......t....',
      '............',
    ],
    bg: [
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwgggww~~~w',
      'wwwgggww~~~w',
      'wwwgggww~~~w',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
    ],
    chestContents: { '4,4': { type: 'rupee', value: 20, name: 'ルピー×20' } },
    signData: {
      '7,3': {
        name: '棚田の落し口の石碑',
        lines: [
          '【棚田の落し口】',
          '山の 段を 落ちた 水は ここから 沼へ 入る。',
          '南へ 下れば 潮が 呑んだ 都に 出る。',
        ],
      },
    },
    // 穀物庫の中は岩山 'M' で囲い、戸の茂み 'u' 以外に口が無い（水を挟まない＝
    // はしごの裏口も無い）。
    sealed: ['3,3', '3,4', '3,5', '4,3', '4,4', '4,5', '5,3', '5,4', '5,5'],
    tools: [{ cell: '4,4', control: 'noBush', why: '茂みの戸を刈らないと穀物庫の跡の宝に届かない' }],
  },
  {
    key: '12,15',
    title: '毒の水門',
    // 棚田から落ちた水が最初に淀む場所。都が沈む前の水門（'#' の枡と潮ゲート '='）が
    // 泥の上に残り、枡の中は毒の淀み＝毒沼ヒル Γ が湧いている。
    // 'Y' を剣で叩くと '=' が開く＝**到着時の装備で解ける**関門。
    tiles: [
      '............',
      '...#####....',
      '...#...#....',
      '...#.B.#..Γ.',
      '...#...#....',
      '...##=##....',
      '............',
      '..Y....Γ....',
      '....i.......',
      '............',
    ],
    bg: [
      'wwwwwwwwwwww',
      'wwwooooowwww',
      'wwwooooowwww',
      'wwwooooowwww',
      'wwwooooowwww',
      'wwwooooowwww',
      'wwwwwwwww~~w',
      'wwwwwwwww~~w',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
    ],
    links: [{ switchId: '7,2', gateId: '5,5' }],
    chestContents: { '3,5': { type: 'rupee', value: 45, name: 'ルピー×45' } },
    showConditions: {
      '3,5': {
        trigger: 'switchOn',
        switchId: '7,2',
        message: '≋ 水門が 開き、淀みの 底から 箱が 現れた！',
      },
    },
    signData: {
      '8,4': {
        name: '毒の水門の石碑',
        lines: [
          '【毒の水門】',
          '都へ 送る 水を ここで 選り分けて いた。',
          '選り分ける 者が 絶えて、淀みは 毒に なった。',
        ],
      },
    },
    // 枡の中（3×3）は '#' と閉じた '=' で囲われている＝'Y' を叩くまで徒歩では入れない。
    sealed: ['2,4', '2,5', '2,6', '3,4', '3,5', '3,6', '4,4', '4,5', '4,6'],
  },
  {
    key: '11,16',
    title: '沼の東門',
    // 都の東門へ続く石樋。樋（'#' で挟んだ幅1の溝）に落ちている石 '*' を東へ押して
    // ボタン 'S' に載せると、南の門番小屋のゲート 'T' が永久に開く（石ロック）。
    // 帯で唯一の石押し画面＝**到着時の装備で解ける**2つ目の関門。
    tiles: [
      '............',
      '.........t..',
      '..######....',
      '...*..S#....',
      '..######....',
      '............',
      '....###.....',
      '....#BT..i..',
      '....###.....',
      '............',
    ],
    bg: [
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwoooooowwww',
      'wwoooooowwww',
      'wwoooooowwww',
      'wwwwwwwwwwww',
      'wwwwooowwwww',
      'wwwwooowwwww',
      'wwwwooowwwww',
      'wwwwwwwwwwww',
    ],
    // 'S' がある画面の 'T' に links は書かない（refreshGates が buttons 経路で開く＝
    // links の 'T' 行は読み飛ばされる飾りになる）。
    chestContents: { '7,5': { type: 'rupee', value: 30, name: 'ルピー×30' } },
    signData: {
      '7,9': {
        name: '沼の東門の石碑',
        lines: [
          '【沼の東門】',
          '樋の 石を 東の 座に 戻せば 門は 開く。',
          '門番は 都と ともに 沈んだ。',
        ],
      },
    },
    sealed: ['7,5', '7,6'],
    tools: [{ cell: '7,5', control: 'noPush', why: '樋の石をボタンまで押さないと門番小屋の宝に届かない' }],
  },
  {
    key: '11,17',
    title: '都の裏門',
    // 沈んだ都の外郭。潮が引いた石畳 'o' の広場に列柱 '#' と廃屋（'p' 屋根・'h' 壁）が
    // 顔を出す。東の物置は瓦礫 '!' で塞がれている＝爆弾（D6）で崩す**任意報酬の袋小路**。
    tiles: [
      '............',
      '..#..#..#...',
      '............',
      '...pp.......',
      '...hh.......',
      '............',
      '.......###..',
      '.....i.#B!..',
      '.......###..',
      '...........M',
    ],
    bg: [
      'wwwwwwwwwwww',
      'woooooooooow',
      'woooooooooow',
      'woooooooooow',
      'woooooooooow',
      'wwwwwwwwwwww',
      'wwwwwwwoooww',
      'wwwwwwwoooww',
      'wwwwwwwoooww',
      'wwwwwwwwwwww',
    ],
    chestContents: { '7,8': { type: 'rupee', value: 80, name: 'ルピー×80' } },
    breakableWalls: { '7,9': { breakDef: 1 } },
    signData: {
      '7,5': {
        name: '都の裏門の石碑',
        lines: [
          '【都の裏門】',
          '女王の 都は この 広場から 南へ 開けて いた。',
          '物置の 瓦礫の 奥に 運び出せぬ ものが 残る。',
        ],
      },
    },
    sealed: ['7,8', '7,9'],
    tools: [{ cell: '7,8', control: 'noTools', why: '爆弾で物置の瓦礫を割らないと奥の宝に届かない' }],
  },
  {
    key: '11,18',
    title: '都の墓所',
    // 都の墓所。東と南は外海に落ちている（下地の水で閉じた縁）。石室のかがり火2基は
    // **火種が無い**＝ブーメランでは運べない∴ロウソク（D7）で直接点ける
    // **任意報酬の袋小路**。呪い火 ψ が石室のまわりを漂う。
    tiles: [
      '............',
      '............',
      '...#####....',
      '...#H.H#....',
      '...#...#....',
      '...#.B.#....',
      '...##.##....',
      '..i..ψ......',
      '........ψ...',
      '............',
    ],
    bg: [
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
      'wwwooooowww~',
      'wwwooooowww~',
      'wwwooooowww~',
      'wwwooooowww~',
      'wwwooooowww~',
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
      '~~~~~~~~~~~~',
    ],
    chestContents: { '5,5': { type: 'rupee', value: 60, name: 'ルピー×60' } },
    showConditions: {
      '5,5': {
        trigger: 'torchesLit',
        message: '✦ 墓所に 灯が ともり、供物の 箱が 現れた！',
      },
    },
    signData: {
      '7,2': {
        name: '都の墓所の石碑',
        lines: [
          '【都の墓所】',
          '灯を 絶やすな、と 都の 者は 言い置いた。',
          '灯が 絶えて 久しい。火種すら 残って いない。',
        ],
      },
    },
    // 石室は歩いて入れる（封印は torchesLit の showConditions＝幾何ではない）∴sealed 無し。
  },
  {
    key: '10,17',
    title: '沼の一本道',
    // 泥沼を貫く畦（幅1の土手）だけの画面。北東の草地から畦を辿って西の口へ抜ける。
    // 中洲の窪みは茂み 'u' 一枚が戸で、**三方を幅2以上の水で隔てている**
    // （幅1の水だとはしごで裏から入れてしまう＝⑧で確立した封印の一般則）。
    tiles: [
      '............',
      '.......t....',
      '.........E..',
      '............',
      '...Bu.i.....',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
    bg: [
      'wwwwwwwwwwww',
      'w~~~~wwwwwww',
      'w~~~~wwwwwww',
      'w~~~~w~~~~~w',
      'w~~wwww~~~~w',
      'w~~~~w~~~~~w',
      'w~~~~w~~~~~w',
      'wwwwww~~~~~w',
      'w~~~~w~~~~~w',
      'wwwwwwwwwwww',
    ],
    chestContents: { '4,3': { type: 'rupee', value: 25, name: 'ルピー×25' } },
    signData: {
      '4,6': {
        name: '沼の一本道の道標',
        lines: [
          '【沼の一本道】',
          '畦から 降りるな。泥は 底なしだ。',
          '西の 口は 都の 裏門へ、東は 桟道へ 続く。',
        ],
      },
    },
    sealed: ['4,3'],
    tools: [{ cell: '4,3', control: 'noBush', why: '茂みの戸を刈らないと中洲の窪みの宝に届かない' }],
  },
  {
    key: '10,18',
    title: '朽ちた桟道',
    // 都へ渡していた桟道の残り。北の水路は渡し板 'v'（幅1の乾いた列）だけで越える。
    // 南の足場は**四方を幅2の水で切られ**、上の陥没穴 'x' をはしご（D5）で渡るしか
    // 入る道が無い**任意報酬の袋小路**。ルピー喰い σ が足場の手前を巡回する。
    tiles: [
      '............',
      '............',
      '.....v......',
      '.....v......',
      '............',
      '.......x....',
      '.......B....',
      '....σ.......',
      '............',
      '...........M',
    ],
    bg: [
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'w~~~~w~~~~~w',
      'w~~~~w~~~~~w',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwww~~w~~ww',
      'wwwwww~~~www',
      'wwwwwww~wwww',
      'wwwwwwwwwwww',
    ],
    chestContents: { '6,7': { type: 'rupee', value: 50, name: 'ルピー×50' } },
    sealed: ['5,7', '6,7'],
    tools: [{ cell: '6,7', control: 'noLadder', why: 'はしごで桟道の陥没穴を渡らないと足場の宝に届かない' }],
  },
  {
    key: '10,19',
    title: '海へ落ちる口',
    // 帯の東端。沼の水が外海へ落ちる崖の上に、都の獄の跡（岩山 'M' の房）が残る。
    // 'Y' を剣で叩けば房のゲート 'T' が開く＝**到着時の装備で解ける**3つ目の関門。
    // ⚠️ 房の中から 'Y' に矢は届かない（'M' は矢を止めないが 'Y' は房の視線上に無い）
    //    ∴中で門を閉め直して詰むことは無い。
    tiles: [
      '............',
      '........ξ...',
      '...MMMMM....',
      '...M.B.M....',
      '...MMTMM....',
      '............',
      '...Y........',
      '......ξ.....',
      '............',
      '............',
    ],
    bg: [
      'wwwwwwwwwww~',
      'wwwooooowww~',
      'wwwooooowww~',
      'wwwooooowww~',
      'wwwooooowww~',
      'wwwooooowww~',
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
      '~~~~~~~~~~~~',
    ],
    links: [{ switchId: '6,3', gateId: '4,5' }],
    chestContents: { '3,5': { type: 'rupee', value: 35, name: 'ルピー×35' } },
    showConditions: {
      '3,5': {
        trigger: 'switchOn',
        switchId: '6,3',
        message: '≋ 房の 扉が 開き、置き去りの 箱が 現れた！',
      },
    },
    sealed: ['3,4', '3,5', '3,6', '4,5'],
  },
  {
    key: '9,17',
    title: 'ヒルの澱み',
    // 沼の本体。渡し板 'v' の一本道の両側が毒沼ヒル Γ の澱みで、板を渡る間に三方から
    // 寄られる。澱みの底の箱はヒルを全滅させるまで現れない（killAll）。
    tiles: [
      '............',
      '......Γ.....',
      '.....v......',
      '.....v......',
      '.....v......',
      '...Γ..B..Γ..',
      '............',
      '.....i......',
      '............',
      '............',
    ],
    bg: [
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'ww~~~w~~~~ww',
      'ww~~~w~~~~ww',
      'ww~~~w~~~~ww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwww~~~ww',
      'wwwwwww~~~ww',
      'wwwwwwwwwwww',
    ],
    chestContents: { '5,6': { type: 'rupee', value: 40, name: 'ルピー×40' } },
    showConditions: {
      '5,6': {
        trigger: 'killAll',
        message: '✦ ヒルが 絶え、澱みの 底から 箱が 現れた！',
      },
    },
    signData: {
      '7,5': {
        name: 'ヒルの澱みの石碑',
        lines: [
          '【ヒルの澱み】',
          '板から 落ちれば ヒルが 群れる。',
          '澱みの 底に 沈んだ ものは 群れを 絶やして から。',
        ],
      },
    },
  },
  {
    key: '9,18',
    title: '水没した林',
    // 沼に呑まれた林。水に立ったままの木 't' の間を渡し板 'v' の一本で north-south に
    // 抜ける。敵も宝も置かない「息継ぎ」の画面（帯に1枚だけ置く静けさ）。
    tiles: [
      '............',
      '..t...v.....',
      '......v.....',
      '..t...v..t..',
      '......v.....',
      '...t........',
      '.....t...t..',
      '............',
      '..t..i.t....',
      '............',
    ],
    bg: [
      'wwwwwwwwwwww',
      'w~~~~~w~~~~w',
      'w~~~~~w~~~~w',
      'w~~~~~w~~~~w',
      'w~~~~~w~~~~w',
      'gggggggggggg',
      'gggg~~~~~ggg',
      'gggg~~~~~ggg',
      'gggggggggggg',
      'gggggggggggg',
    ],
    signData: {
      '8,5': {
        name: '水没した林の道標',
        lines: [
          '【水没した林】',
          '木は 立った まま 水に 沈んだ。',
          '板の 上だけを 歩け。東は 干潟、南は 沼尻。',
        ],
      },
    },
  },
  {
    key: '9,19',
    title: '干潟の潮溜まり',
    // 帯の東の縁。潮が引くと現れる干潟で、南は外海に落ちている。潮溜まりを渡し板 'v'
    // 三組で跨いで東西南北に抜ける＝帯の交差点。宝も敵も置かない通し所。
    tiles: [
      '............',
      '............',
      '...v...v....',
      '...v...v....',
      '............',
      '.....v......',
      '.....v......',
      '..t.......t.',
      '.....i......',
      '............',
    ],
    bg: [
      'gggggggggggg',
      'gggggggggggg',
      'g~~g~~~g~~~g',
      'g~~g~~~g~~~g',
      'gggggggggggg',
      'gg~~~g~~~~gg',
      'gg~~~g~~~~gg',
      'gggggggggggg',
      'gggggggggggg',
      '~~~~~~~~~~~~',
    ],
    signData: {
      '8,5': {
        name: '干潟の潮溜まりの石碑',
        lines: [
          '【干潟の潮溜まり】',
          '潮が 引く 間だけ 板を 渡せる。',
          '三日 引かぬ 朝に、海は 都を 呑んだ。',
        ],
      },
    },
  },
  {
    key: '8,18',
    title: '沼尻の渡し',
    // 沼の尻＝西は入江に落ちている（下地の水で閉じた縁）。中央の水路は渡し板 'v' で
    // 越える。入江に浮く砂州（`5,2`）は**三方を幅2の水で切られ**、残る一方が茂み 'u'
    // ＝剣で刈れば届く任意報酬（幅1の水だとはしごで裏から入れてしまう）。
    tiles: [
      '............',
      '............',
      '....t.......',
      '.......v....',
      '.......v....',
      '..Bu........',
      '............',
      '....E....t..',
      '......i.....',
      '............',
    ],
    bg: [
      'gggggggggggg',
      '~ggggggggggg',
      '~~~ggggggggg',
      '~~~g~~~g~~~g',
      '~~~g~~~g~~~g',
      '~~gggggggggg',
      '~~~ggggggggg',
      '~~~ggggggggg',
      '~ggggggggggg',
      '~ggggggggggg',
    ],
    chestContents: { '5,2': { type: 'rupee', value: 55, name: 'ルピー×55' } },
    signData: {
      '8,6': {
        name: '沼尻の渡しの石碑',
        lines: [
          '【沼尻の渡し】',
          '沼の 水は ここで 入江に 落ちて 終わる。',
          '砂州の 茂みの 陰に、渡し守の 荷が 残る。',
        ],
      },
    },
    sealed: ['5,2'],
    tools: [{ cell: '5,2', control: 'noBush', why: '茂みを刈らないと入江の砂州の宝に届かない' }],
  },
  {
    key: '8,19',
    title: '潮の祭壇',
    // 沈んだ都が海へ供物を捧げた祭壇。石畳 'o' の壇に置かれた箱は笛（D8）の音色に
    // 応えて現れる＝北の `11,14`（沼の祭壇跡）・`8,17`（廃村の石碑「水底に 眠る 宝は
    // 笛に 応える」）に呼応する**任意報酬の袋小路**。
    tiles: [
      '............',
      '..t.........',
      '......v.....',
      '......v.....',
      '............',
      '.....B......',
      '..t.........',
      '......i.....',
      '............',
      '............',
    ],
    bg: [
      '~ggggggggggg',
      'gggggggggggg',
      'gggg~~g~~ggg',
      'gggg~~g~~ggg',
      'ggggoooogggg',
      'ggggoooogggg',
      'ggggoooogggg',
      'gg~~~ggg~~~g',
      'gg~~~ggg~~~g',
      '~~~~~~~~~~~~',
    ],
    chestContents: { '5,5': { type: 'rupee', value: 70, name: 'ルピー×70' } },
    showConditions: {
      '5,5': {
        trigger: 'flutePlayed',
        message: '♪ 笛の 音色に 応え、潮の 祭壇の 供物が 現れた！',
      },
    },
    // ⚠️ flutePlayed の封印は showConditions だけでは開かない：playFlute
    //    （game/game.js:1554）は stageData.fluteEffect を読み、無い画面では
    //    「特に何も起きない」で終わる∴この1行が無いと永久に開かない箱になる。
    fluteEffect: { type: 'reveal', message: '♪ 音色に 応えて 祭壇の 供物が 現れた！' },
    signData: {
      '7,6': {
        name: '潮の祭壇の石碑',
        lines: [
          '【潮の祭壇】',
          '海に 供物を 捧げた 壇。都は それでも 沈んだ。',
          '水底に 眠る 宝は 笛に 応える、と 刻まれて いる。',
        ],
      },
    },
    // 封印は flutePlayed の showConditions＝幾何ではない∴sealed 無し。
  },
  {
    key: '7,19',
    title: '澪の孤岩',
    // 帯の南東の隅。入れるのは東の縁（col11）だけで、北の `7,18` からは `(9,0)` の
    // 磯を通って `(0,0)` に降りられる。⚠️ その `(0,0)` は画面内で完全に孤立している
    // （北も西も 'M' の磯）＝**素の '.' のまま据える**のが正しい（外周の開閉は
    // `7,18` の実データが決めており、1ビットも動かせない）。
    // 砂州の茂み 'u' は刈っても何も出ない飾り＝この画面の報酬は「隠れた画面を
    // 見つけたこと」そのもので、宝箱は歩いて届く場所に置く。
    tiles: [
      '.MMMMMMMMMMM',
      'M...........',
      'M......v....',
      'M......v....',
      'M...........',
      'M.......B...',
      'M...........',
      'M..u...i....',
      'M...........',
      'MMMMMMMMMMMM',
    ],
    bg: [
      'gggggggggggg',
      'gggggggggggg',
      'g~~~~~~g~~gg',
      'g~~~~~~g~~gg',
      'gggggggggggg',
      'gg~~~~gggggg',
      'gg~~~~gggggg',
      'gggggggggggg',
      'gggggggggggg',
      'gggggggggggg',
    ],
    chestContents: { '5,8': { type: 'rupee', value: 90, name: 'ルピー×90' } },
    signData: {
      '7,7': {
        name: '澪の孤岩の石碑',
        lines: [
          '【澪の孤岩】',
          '都の 澪は ここで 外海に 消える。',
          'ここまで 来た 者は 都の 全てを 見た ことに なる。',
        ],
      },
    },
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
const BG_CHARS = new Set(['d', 'g', TILE.MUD, TILE.STONE_FLOOR, TILE.WATER]);
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
// この帯は隣接する湖W（桟道）・深洋O（外海の岸）・沼P が既に縁を決めている∴
// **作り替える13枚自身の現データの歩ける/歩けないをそのまま要件にする**のが唯一安全。
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
  // 笛の効果はステージ側に持たせる（game/game.js playFlute は stageData.fluteEffect が
  // 無いと「特に何も起きない」で終わる＝flutePlayed の封印が永久に開かない）。
  const fluteEffect = spec.fluteEffect ?? prev?.fluteEffect;
  if (fluteEffect) stage.fluteEffect = fluteEffect;
  return stage;
}

function checkContent(spec, stage, prev) {
  const t = stage.tiles;
  const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r][c]; };
  const hasButton = t.some((row) => row.includes(TILE.BUTTON));
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
    // ⚠️ 2026-08-22：笛の封印は showConditions だけでは開かない。playFlute は
    //    stageData.fluteEffect を読み、無い画面では「特に何も起きない」で終わる
    //    ＝封印が永久に開かない（既存の field 11,14 / 13,15 が実際にそうなっていた）。
    if (sc.trigger === 'flutePlayed' && stage.fluteEffect?.type !== 'reveal')
      throw new Error(`${spec.key}: flutePlayed で封じた ${k} の画面に fluteEffect{type:'reveal'} が無い＝開かない封印`);
  }
  if (stage.fluteEffect?.type === 'reveal'
    && !Object.values(stage.showConditions).some((sc) => sc.trigger === 'flutePlayed'))
    throw new Error(`${spec.key}: fluteEffect{reveal} があるのに flutePlayed の封印が無い＝音だけの飾り`);
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
    // ⓑ ボタン 'S' は links を通らない：game/conditions.js refreshGates は「'S' が1つでも
    //    あれば全 'T' の開閉を buttons の押下だけで決め、links の 'T' 行は読み飛ばす」。
    //    ∴ 'S' がある画面の 'T' に links を書いてはいけない（書いても効かない飾りになる）。
    if (ch === TILE.GATE && !hasButton && !stage.links.some((l) => l.gateId === key(r, c)))
      throw new Error(`${spec.key}: ゲート ${key(r, c)} に links もボタン 'S' も無い＝開く手段が無い`);
    if (ch === TILE.TIDE_GATE && !stage.links.some((l) => l.gateId === key(r, c)))
      throw new Error(`${spec.key}: 潮ゲート ${key(r, c)} に links が無い＝開く手段が無い`);
    if (ch === TILE.BUTTON && !t.some((row) => row.includes(TILE.GATE)))
      throw new Error(`${spec.key}: 'S'(${key(r, c)}) の画面に 'T' が無い＝踏んでも何も開かない`);
    if (ch === TILE.STONE && !t.some((row) => row.includes(TILE.BUTTON)))
      throw new Error(`${spec.key}: '*'(${key(r, c)}) の画面に 'S' が無い＝押す意味が無い石`);
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

console.log(`✅ 沼P 南岸 14画面を作り込み${DRY ? '（--dry: 書き込みなし）' : ''}`);
for (const { spec, states, axes, comps } of report) {
  console.log(`   ${spec.key.padEnd(5)} ${spec.title.padEnd(9)} 軸[${[...axes].join(',')}] 状態 ${states} 塊 ${comps}`
    + (spec.tools?.length ? ` 対照 ${spec.tools.map((t) => t.control).join('/')}` : ''));
}
