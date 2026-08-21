#!/usr/bin/env node
/**
 * migrate-field-mountain-m-coast.mjs
 *   9-6-BASE 外周解体＋隣接地域編入（キュー8番）の **⑦ 山地M 東の水落ち 13画面** を作り込む。
 *   `12,12` `12,13` `12,16` `12,17` `13,12` `13,13` `13,14` `13,15` `13,16`
 *   `14,12` `14,13` `14,14` `14,15`
 *
 * 背景（PLAN.md #8 の規則「残っている地域別の未満2軸の塊が最小の塊から着手する」）:
 *   ①深洋O → ②湖W東 → ③森F北西 → ④火山L外輪 → ⑤北の外周帯 → ⑥砂漠D南岸 に続く⑦。
 *   ⑥終了時点の実測は M:13 / P:14 / S:14 ＝山地Mが最小の塊∴ここから着手する。
 *   13枚とも実データは「タイル全面 '.'（＋外周に 'M' の縁が付くものが6枚）／下地は草
 *   一色＋長方形の水たまり」という同一の空塗り絵＝作り込み前の placeholder。
 *
 * テーマ（帯の同一性＝「東の水落ち」）:
 *   北の湖W（`12,11` `13,11` の桟道）から溢れた水が、段を落ちながら東の外海へ注ぐ泥の斜面。
 *   同時に「沈んだ都（`12,18` の碑）を逃れた者が通った道」でもある。下地は泥 'w' を基調に、
 *   湖の縁だけ草 'g'、堰・灯台・都の遺構は石畳 'o'、水は '~'。
 *   ⚠️ 石畳は**下地**に敷く（tiles 層の 'o' は浮き出た石ブロックに描かれる＝壁に見える）。
 *   到着時の持ち物は **剣＋木の盾だけ**∴「今できる」のは剣で叩く 'Y'・茂み刈り 'u'・
 *   石押し（'*'→'S'→'T'）の3つ。はしご・爆弾・ロウソク・笛の仕掛けは全て
 *   **任意報酬の袋小路**に置く（進行必須にしない）。
 *
 * 自己検証（砂漠D南岸 migrate の写し＋山地M向けに2点だけ改造）:
 *   ⓐ BG_CHARS に泥 'w'（TILE.MUD）を足した（M の基調色）。
 *   ⓑ ボタン 'S' を認める：'S' は links を使わず refreshGates の buttons 経路で 'T' を開く
 *      ∴「'T' に links が無い」を **'S' がある画面に限り** 許し、代わりに
 *      「'S' があるなら 'T' もある」を検査する（`13,12` の石樋＝帯で唯一の石押し画面）。
 *   ① 外周リング＝**現在の実データの歩ける/歩けないを1ビットも動かさない**（北の外周帯は
 *      「細い十字」で開口を作り直したが、この帯は隣接画面（作り込み済みの湖W・深洋O・
 *      沼P の placeholder）が既に縁を決めている∴現データの写しが唯一の安全な作法）。
 *      加えて**継ぎ目の相互整合**
 *      （自分の要開口と隣の実データが一致するか）を全交差で照合する＝seams/traps/
 *      footprintBlocked が構成上不変になる。
 *   ② 閉じたリングセルの見た目は岩山 'M' **または下地の水 '~'**（＝外海・入江の岸）。
 *   ③ 徒歩の塊は**複数あってよい**（隣画面の 'M' 壁や外海に挟まれた1セルの通し所は
 *      画面内では孤立するのが正しい姿）。塊ごとに状態空間を展開し、到達セルを
 *      合併して無駄セル0を見る。
 *   ④ `sealed` ＝「その仕掛けを解かないと徒歩では届かないセル」を明示し、
 *      徒歩BFS（道具なし・ゲート閉・下地の水も壁）に**入っていないこと**を検査する。
 *      対照実験（tools）と対で「ゲートが何も塞いでいない飾り」を機械的に弾く。
 *   ⑤ 特別なタイル（'v' 橋・'=' 潮ゲート・'x' 穴・'B' 宝箱 等）の下地が水でないこと。
 *      ⚠️ `game/passable.js tilePassable` は **isWaterAt を潮ゲート/橋の判定より先に**
 *      見る∴下地が水のゲートは「開いたのに永久に通れない」（実装済みの罠）。
 *   ⑥〜⑨ 以降は北の外周帯と同じ（無駄セル0・看板/かがり火の隣接・詰まない・対照実験・
 *      軸2以上・重複配置なし・宝箱/看板/links/breakableWalls/enemyDirs/弱点の整合）。
 *
 * 使い方: node scripts/migrate-field-mountain-m-coast.mjs [--dry] [--rings]
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
// tiles: '.' 素の地面（見える地面は bg 側）/ 'M' 岩山＝畦・稜線・崖 / '#' 石壁（堰の樋・
//   都の列柱・囲い）/ 'u' 茂み（剣で刈れる）/ 'x' 陥没穴（はしごで幅1だけ渡る）/
//   'v' 橋・渡し板 / '=' 潮ゲート・'T' ゲート（'Y' の links または 'S' で開く）/
//   'Y' 叩くスイッチ（剣で入る）/ '*' 押せる石・'S' ボタン（石が載ると永久 ON）/
//   'H' かがり火（ロウソク）/ 'B' 宝箱 / '!' 爆弾で割れる岩 / 'i' 石碑・道標 /
//   'h' 廃屋・灯台の壁・'p' その屋根 / '>' 別レイヤーへの入口（既存の mapEnters を保つ）/
//   敵 'E' パトロール・'C' チェイサー・'F' センチネル・'ξ' コウモリ群・'Γ' 毒沼ヒル・
//   'σ' ルピー喰い・'β' 跳躍蜘蛛・'ψ' 呪い火（弱点持ち・向き別スプライトは field 不可）。
//   ⚠️ 'o' は tiles に書かない＝石畳は bg 側の 'o'（平らな石床）で敷く。
// bg: 見える地面（10行×12列）。'w' 泥・'g' 草・'o' 石畳・'~' 水（外海/落水/棚田/溜まり）。
//   下地の水は実エンジン・接続チェッカー・軸計算のすべてが壁として畳む。
// sealed: 仕掛けを解かないと徒歩では届かないセル（④の検査対象）。
// tools: 対照実験（control を封じたら cell に到達できないこと）。
//   control: 'noTools'（爆弾/弓/ブーメラン/ロウソク封じ）/ 'noLadder' / 'noPush' / 'noBush'
const SCREENS = [
  {
    key: '12,12',
    title: '堰の口',
    // 帯の入口。北の `12,11`（湖W）の桟道（'vv' cols5-6）がそのまま降りてくる画面で、
    // 湖から溢れた水が二つの溜まりに分かれて東へ落ちていく。下地は湖の縁の草 'g' から
    // 泥 'w' へ移る（M＝山地だが、この帯は「湖の水が海へ落ちる泥の斜面」）。
    // 東の岩陰は茂み 'u' 一枚が戸＝**到着時の剣だけで解ける**（帯で最初の報酬）。
    tiles: [
      '............',
      '.....vv.....',
      '.....vv.....',
      '.....vv.....',
      '............',
      '.........MM.',
      '.........MM.',
      '...i....MBu.',
      '.........MM.',
      '............',
    ],
    bg: [
      'gggggggggggg',
      'g~~~~ww~~~~g',
      'g~~~~ww~~~~g',
      'g~~~~ww~~~~g',
      'gwwwwwwwwwwg',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
    ],
    chestContents: { '7,9': { type: 'rupee', value: 20, name: 'ルピー×20' } },
    signData: {
      '7,3': {
        name: '堰の口の石碑',
        lines: [
          '【堰の口】',
          '湖の 水は ここから 段を 落ちて 海へ 向かう。',
          '東へ 下れば 沈んだ 都の 門に 出る。',
        ],
      },
    },
    sealed: ['7,9'],
    tools: [{ cell: '7,9', control: 'noBush', why: '茂みを刈らないと堰の口の岩陰の宝に届かない' }],
  },
  {
    key: '13,12',
    title: '堰守の庭',
    // 帯で唯一の「石押し」画面。幅1の石樋（'#' で囲った cols2-4）に石 '*' が置かれ、
    // 下端は '###' で塞がっている∴押せる向きは南だけ＝石は必ずボタン 'S'(3,3) に載る。
    // 石が載ると refreshGates が stonesLocked を立てて庭のゲート 'T'(6,7) が永久に開く。
    // ⚠️ ボタンは踏んでも開くが、樋の入口(0,3)からは石が邪魔で 'S' に立てない∴
    //    「石を押す」以外の解が無い（noPush の対照実験で機械的に確かめる）。
    tiles: [
      '............',
      '..#*#.......',
      '..#.#.......',
      '..#S#.......',
      '..###..####.',
      '.......#..#.',
      '.......T.B#.',
      '.......#..#.',
      '..i....####.',
      '............',
    ],
    bg: [
      'gggggggggggg',
      'ggoooggggggg',
      'wwooowwwwwww',
      'wwooowwwwwww',
      'wwooowwoooow',
      'wwwwwwwoooow',
      'w~~~~wwoooow',
      'w~~~~wwoooow',
      'wwwwwwwoooow',
      'wwwwwwwwwwww',
    ],
    chestContents: { '6,9': { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } },
    signData: {
      '8,2': {
        name: '堰守の庭の石碑',
        lines: [
          '【堰守の庭】',
          '堰を 守る 者は 石を 樋に 落として 門を 開けた。',
          '水が 引けば 石は 二度と 動かぬ。',
        ],
      },
    },
    sealed: ['5,8', '5,9', '6,8', '6,9', '7,8', '7,9'],
    tools: [{ cell: '6,9', control: 'noPush', why: '石をボタンに押し込まないと堰守の庭のゲートが開かない' }],
  },
  {
    key: '14,12',
    title: '風穴の崖',
    // 泥の斜面が外海へ落ちる崖（東端 col11 は下地の水＝外海∴閉じている）。
    // 岩の割れ目から風が抜ける＝爆弾（D6）で崩す '!' の裏に袋がある任意報酬。
    // 稜線が一箇所だけ切れていて（(5,9)(5,10)）海を見下ろせる。
    tiles: [
      '............',
      '..MMM.......',
      '..MB!....MM.',
      '..MMM....MM.',
      '.........MM.',
      '....ξ.......',
      '.........MM.',
      '...i.....MM.',
      '.......ξ.MM.',
      '............',
    ],
    bg: [
      'wwwwwwwwwoo~',
      'wwwwwwwwwoo~',
      'wwwwwwwwwoo~',
      'wwwwwwwwwoo~',
      'wwwwwwwwwoo~',
      'wwwwwwwwwoo~',
      'wwwwwwwwwoo~',
      'wwwwwwwwwoo~',
      'wwwwwwwwwoo~',
      'wwwwwwwwwoo~',
    ],
    chestContents: { '2,3': { type: 'rupee', value: 60, name: 'ルピー×60' } },
    breakableWalls: { '2,4': { breakDef: 1 } },
    signData: {
      '7,3': {
        name: '風穴の崖の石碑',
        lines: [
          '【風穴の崖】',
          '岩の 割れ目から 海の 風が 鳴る。',
          '割れ目の 奥は 火薬で 開く。',
        ],
      },
    },
    sealed: ['2,3'],
    tools: [{ cell: '2,3', control: 'noTools', why: '爆弾で風穴の岩を割らないと崖の袋の宝に届かない' }],
  },
  {
    key: '12,13',
    title: '泥の棚田',
    // 段を落ちる水を受けた棚田の跡。岩の畦（'M'）が段の縁で、水を張った田に
    // 毒沼ヒル Γ が居着いている。段の下の蔵は茂み 'u' 三枚が戸＝剣だけで開く任意報酬。
    tiles: [
      '............',
      '....MMMM....',
      '........Γ...',
      '..MMM..MMM..',
      '.....E......',
      '..MMMMM.....',
      '..M...M.....',
      '..M.B.M.i...',
      '..MuuuM.....',
      '............',
    ],
    bg: [
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'w~~~wwwwwwww',
      'wwwwwwwwwwww',
      'wwwwww~~~~~w',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
    ],
    chestContents: { '7,4': { type: 'rupee', value: 35, name: 'ルピー×35' } },
    signData: {
      '7,8': {
        name: '泥の棚田の石碑',
        lines: [
          '【泥の棚田】',
          '段ごとに 水を 溜め、泥は 米を 育てた。',
          '田を 捨てた 後に 残るのは ヒルばかり。',
        ],
      },
    },
    sealed: ['6,3', '6,4', '6,5', '7,3', '7,4', '7,5'],
    tools: [{ cell: '7,4', control: 'noBush', why: '茂みを刈らないと棚田の下の蔵の宝に届かない' }],
  },
  {
    key: '13,13',
    title: '隘路の番人',
    // 岩の塊を南北に貫く一本道。通り抜けるだけなら素通りできるが、道の中に
    // センチネル F が居座り、全滅（killAll）で封じの宝箱が現れる＝戦うか避けるかを選ぶ画面。
    tiles: [
      '............',
      '...MMM.MMM..',
      '...M.....M..',
      '...M.F...M..',
      '...M..B..M..',
      '...M.....M..',
      '...MMM.MMM..',
      '.....E......',
      '....i.......',
      '............',
    ],
    bg: [
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'w~~wwwwwww~w',
      'w~~wwwwwww~w',
      'w~~wwwwwww~w',
      'w~~wwwwwww~w',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
    ],
    chestContents: { '4,6': { type: 'rupee', value: 45, name: 'ルピー×45' } },
    showConditions: {
      '4,6': { trigger: 'killAll', message: '⚔ 隘路の 番人を 退けた！封じの 宝箱が 現れた！' },
    },
    signData: {
      '8,4': {
        name: '隘路の石碑',
        lines: [
          '【隘路】',
          '岩を 貫く 道は 一本きり。',
          '番人が 通す 者だけが 東へ 抜ける。',
        ],
      },
    },
  },
  {
    key: '14,13',
    title: '水路の分かれ',
    // 段を落ちた水が中洲で二筋に分かれ、東の外海へ注ぐ（col11 は下地の水＝閉じている）。
    // 西の水路は幅1で陥没しており（'x'）、はしご（D5）で渡ると中洲の袋の宝に届く任意報酬。
    // 中洲の岩（(5,6)(5,7)）は水に囲まれて立てない＝眺めるだけの景物。
    tiles: [
      '............',
      '............',
      '.......σ....',
      '............',
      '............',
      '..MxM.MM....',
      '..M.M.......',
      '..MBM..i....',
      '..MMM.......',
      '............',
    ],
    bg: [
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
      'wwwww~~~~~~~',
      'wwwww~ww~~~~',
      'wwwww~~~~~~~',
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
    ],
    chestContents: { '7,3': { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } },
    signData: {
      '7,7': {
        name: '水路の分かれの石碑',
        lines: [
          '【水路の分かれ】',
          '水は 中洲で 二筋に 分かれ 海へ 落ちる。',
          '抜けた 底は 梯子で 越えよ。',
        ],
      },
    },
    sealed: ['5,3', '6,3', '7,3'],
    tools: [{ cell: '7,3', control: 'noLadder', why: 'はしごで水路の陥没を渡らないと中洲の袋の宝に届かない' }],
  },
  {
    key: '13,14',
    title: '落水の段',
    // 帯の中央。水が段を落ちて滝壺（四方を水で囲まれた窪み）を掘っている。
    // 岩棚のスイッチ 'Y'(1,3) を**剣で叩く**と潮ゲート '='(2,6)(2,7) が開き、
    // 窪みへ降りて封じの箱（switchOn）に届く＝到着時の道具で解ける二枚目。
    tiles: [
      '............',
      '...Y........',
      '......==....',
      '............',
      '......B.....',
      '............',
      '............',
      '....i.......',
      '............',
      '............',
    ],
    bg: [
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'ww~~~~ww~~~w',
      'ww~~~~ww~~~w',
      'ww~~~~ww~~~w',
      'ww~~~~ww~~~w',
      'ww~~~~~~~~~w',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
    ],
    links: [{ switchId: '1,3', gateId: '2,6' }, { switchId: '1,3', gateId: '2,7' }],
    chestContents: { '4,6': { type: 'rupee', value: 55, name: 'ルピー×55' } },
    showConditions: {
      '4,6': { trigger: 'switchOn', switchId: '1,3', message: '≋ 落水が 止み、滝壺の 箱が 現れた！' },
    },
    signData: {
      '7,4': {
        name: '落水の段の石碑',
        lines: [
          '【落水の段】',
          '堰の 石を 叩けば 水は 一度 止まる。',
          '止まる 間に 滝壺へ 降りよ。',
        ],
      },
    },
    sealed: ['3,6', '3,7', '4,6', '4,7', '5,6', '5,7'],
  },
  {
    key: '14,14',
    title: '見張りの狼煙',
    // 崖の上の石の台（下地 'o'）に狼煙台が2基（'H'）。火種は無い＝ロウソク（D4）を
    // 得てから戻り、両方点けると（torchesLit）台の中央の箱が現れる任意報酬。
    // 台は跳躍蜘蛛 β の巣で、南の口(6,6)から入る間に跳ばれる。
    tiles: [
      '............',
      '............',
      '...MMMMMMM..',
      '...M.....M..',
      '...MH.B.HM..',
      '...M.....M..',
      '...MMM.MMM..',
      '......E.....',
      '...β........',
      '............',
    ],
    bg: [
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
      'wwwooooooow~',
      'wwwooooooow~',
      'wwwooooooow~',
      'wwwooooooow~',
      'wwwooooooow~',
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
    ],
    chestContents: { '4,6': { type: 'rupee', value: 60, name: 'ルピー×60' } },
    showConditions: {
      '4,6': { trigger: 'torchesLit', message: '🔥 見張りの 狼煙が 二つ 上がった！封じの 箱が 現れた！' },
    },
  },
  {
    key: '13,15',
    title: '滝裏の祭壇',
    // 大瀑布の落ち口の裏。落水が画面を横切り、渡し板（'v' 2枚・cols5）だけが
    // 岩室の口(5,5)に通じる。岩室の祭壇は笛（flutePlayed）に応えて箱を現す任意報酬。
    tiles: [
      '............',
      '............',
      '...MMMMMM...',
      '...M....M...',
      '...M.B..M...',
      '...MM.MMM...',
      '.....v......',
      '.....v......',
      '....i.......',
      '............',
    ],
    bg: [
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'w~~~~w~~~~~w',
      'w~~~~w~~~~~w',
      'wwwwwwwwwwww',
      'wwwwwwwwwww~',
    ],
    chestContents: { '4,5': { type: 'rupee', value: 65, name: 'ルピー×65' } },
    showConditions: {
      '4,5': { trigger: 'flutePlayed', message: '🎵 祭壇が 笛に 応えた！封じの 箱が 現れた！' },
    },
    signData: {
      '8,4': {
        name: '滝裏の祭壇の石碑',
        lines: [
          '【滝裏の祭壇】',
          '落水の 裏に 岩室が ある。',
          '笛の 音だけが 祭壇を 開く。',
        ],
      },
    },
  },
  {
    key: '14,15',
    title: '灯台の跡',
    // 帯のランドマーク。外海（東 col11）と南（row9）に囲まれた岬の先端に、
    // 沈んだ都の港を照らしていた灯台の残骸が立つ。
    // ⚠ 実画面で確認した結果：'p'+'h' を2列幅で積むと `12,16` 潮見の廃村の民家と
    //    同じ「家」に見えてしまい「灯台」が読めなかった∴**1列幅×4段**（屋根1＋壁3）の
    //    塔の輪郭にした（廃村の民家は 2列幅×2段＝並べて見ても別物と分かる）。
    // 石畳の前庭に巣を張ったコウモリ群 ξ を払うと（killAll）封じの箱が現れる。
    tiles: [
      '............',
      '............',
      '.....p......',
      '.....h......',
      '.....h......',
      '.....h......',
      '......B.....',
      '..ξ.....E...',
      '.....i......',
      '............',
    ],
    bg: [
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
      'wwwooooowww~',
      'wwwooooowww~',
      'wwwooooowww~',
      'wwwooooowww~',
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
      'wwwwwwwwwww~',
      '~~~~~~~~~~~~',
    ],
    chestContents: { '6,6': { type: 'rupee', value: 30, name: 'ルピー×30' } },
    showConditions: {
      '6,6': { trigger: 'killAll', message: '⚔ 灯台に 巣くう 者を 払った！封じの 箱が 現れた！' },
    },
    signData: {
      '8,5': {
        name: '灯台の跡の石碑',
        lines: [
          '【灯台の跡】',
          'この 灯は 都の 港を 照らしていた。',
          '照らす 港が 沈み、灯も 落ちた。',
        ],
      },
    },
  },
  {
    key: '12,16',
    title: '潮見の廃村',
    // 都を逃れた者が海を見張りながら暮らした村。廃屋が2軒（'p' 屋根＋'h' 壁）並び、
    // 潮だまりが残る。毒沼ヒル Γ が家の間に湧いていて、払うと（killAll）箱が現れる。
    tiles: [
      '............',
      '............',
      '...pp...pp..',
      '...hh...hh..',
      '......E.....',
      '.....B......',
      '..Γ......Γ..',
      '............',
      '....i.......',
      '............',
    ],
    bg: [
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwoowwwooww',
      'wwwoowwwooww',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      'wwwww~~~~www',
      'wwwww~~~~www',
      'wwwwwwwwwwww',
      'wwwwwwwwwww~',
    ],
    chestContents: { '5,5': { type: 'rupee', value: 40, name: 'ルピー×40' } },
    showConditions: {
      '5,5': { trigger: 'killAll', message: '⚔ 廃村に 湧く 者を 払った！封じの 宝箱が 現れた！' },
    },
    signData: {
      '8,4': {
        name: '潮見の廃村の石碑',
        lines: [
          '【潮見の廃村】',
          '都を 逃れた 者が 海を 見張って 暮らした。',
          '潮が 戻らぬ 事を 確かめ、皆 山へ 去った。',
        ],
      },
    },
  },
  {
    key: '13,16',
    title: '大瀑布の淵',
    // 帯の水がまとめて外海へ落ちる淵。下地の水が南東へ広がる（外海の入口）。
    // 岩室のゲート 'T'(5,6) は南の 'Y'(7,2) を**剣で叩く**と開く＝到着時の道具で解ける三枚目。
    // 霧に コウモリ群 ξ が飛ぶ。
    tiles: [
      '............',
      '.......ξ....',
      '....MMMMM...',
      '....M...M...',
      '....M.B.M...',
      '....MMTMM...',
      '............',
      '..Y.i.......',
      '............',
      '............',
    ],
    bg: [
      'wwwwwwwwwww~',
      'wwwwwwwwww~~',
      'wwwwwwwww~~~',
      'wwwwwwwww~~~',
      'wwwwwwwww~~~',
      'wwwwwwwww~~~',
      'wwwwwwww~~~~',
      'wwwwwww~~~~~',
      'wwwwww~~~~~~',
      '~~~~~~~~~~~~',
    ],
    links: [{ switchId: '7,2', gateId: '5,6' }],
    chestContents: { '4,6': { type: 'rupee', value: 70, name: 'ルピー×70' } },
    showConditions: {
      '4,6': { trigger: 'switchOn', switchId: '7,2', message: '≋ 岩室の 門が 開いた！封じの 箱が 現れた！' },
    },
    signData: {
      '7,4': {
        name: '大瀑布の淵の石碑',
        lines: [
          '【大瀑布の淵】',
          '帯の 水は ここで まとめて 海へ 落ちる。',
          '落ちた 先が 都の あった 場所。',
        ],
      },
    },
    sealed: ['3,5', '3,6', '3,7', '4,5', '4,6', '4,7'],
  },
  {
    key: '12,17',
    title: '沈んだ都の門',
    // 帯の終点。潮が引いて水没した都の門と列柱（'#'）が泥の上に顔を出している。
    // 南の `12,18` の碑「潮が 三日 引かぬ 朝、海が 都を 呑んだ」の答え合わせの画面。
    // 崩れた門の瓦礫（'!'）は爆弾（D6）で崩す＝帯で最後の任意報酬。呪い火 ψ が漂う。
    tiles: [
      '............',
      '............',
      '..#..#..#...',
      '..#..#..#...',
      '.......ψ....',
      '....###.....',
      '....#B!.....',
      '....###.....',
      '..i.....E...',
      '............',
    ],
    bg: [
      'wwwwwwwwwww~',
      'wooooooooow~',
      'wooooooooow~',
      'wooooooooow~',
      'wooooooooow~',
      'wooooooooow~',
      'wooooooooow~',
      'wooooooooow~',
      'wooooooooow~',
      '~~~~~~~~~~~~',
    ],
    chestContents: { '6,5': { type: 'rupee', value: 80, name: 'ルピー×80' } },
    breakableWalls: { '6,6': { breakDef: 1 } },
    signData: {
      '8,2': {
        name: '沈んだ都の門の石碑',
        lines: [
          '【沈んだ都の門】',
          '女王は 残り、都は 潮の 下に 沈んだ。',
          '門の 瓦礫の 奥に 持ち出せぬ ものが 残る。',
        ],
      },
    },
    sealed: ['6,5'],
    tools: [{ cell: '6,5', control: 'noTools', why: '爆弾で崩れた門の瓦礫を割らないと門の奥の宝に届かない' }],
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

console.log(`✅ 山地M 東の水落ち 13画面を作り込み${DRY ? '（--dry: 書き込みなし）' : ''}`);
for (const { spec, states, axes, comps } of report) {
  console.log(`   ${spec.key.padEnd(5)} ${spec.title.padEnd(9)} 軸[${[...axes].join(',')}] 状態 ${states} 塊 ${comps}`
    + (spec.tools?.length ? ` 対照 ${spec.tools.map((t) => t.control).join('/')}` : ''));
}
