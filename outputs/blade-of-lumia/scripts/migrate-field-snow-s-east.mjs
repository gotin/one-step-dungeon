#!/usr/bin/env node
/**
 * migrate-field-snow-s-east.mjs
 *   9-6-BASE 外周解体＋隣接地域編入（キュー8番）の **⑨ 雪原S 東の縁 14画面** を作り込む。
 *   `14,3` `15,3` `15,4` `15,5` `14,6` `15,6` `13,7` `14,7` `15,7`
 *   `12,8` `13,8` `14,8` `12,9` `13,9`
 *
 * 背景（PLAN.md #8 の規則「残っている地域別の未満2軸の塊が最小の塊から着手する」）:
 *   ①深洋O → ②湖W東 → ③森F北西 → ④火山L外輪 → ⑤北の外周帯 → ⑥砂漠D南岸 →
 *   ⑦山地M 東の水落ち → ⑧沼P 南岸 に続く **最後の地域**。⑧終了時点で未満2軸は
 *   雪原S の14枚だけ＝これを0にすると外周解体（キュー8番）が閉じ、⑥-完了検査
 *   （キュー7番）が初めて意味を持つ。14枚とも実データは「タイル全面 '.'（＋外周に
 *   'M' の縁が付くものが数枚）／下地は草一色＋長方形の水たまり」という同一の空塗り絵
 *   ＝作り込み前の placeholder（links / mapEnters / chestContents / signData /
 *   showConditions はいずれも空＝保存すべき既存内容が無い）。
 *
 * テーマ（帯の同一性＝「氷に呑まれた渚＝時の止まった海際」）:
 *   北の火山L（`14,2` `15,2` の灰の広庭）から降りてきた熔け残りが、南で雪原に変わり、
 *   東で外海（深洋O の `14,9` `15,8`）に落ちて終わる帯。⑧で「海が都を呑んだ」と
 *   語った潮は、ここでは**凍って止まっている**∴下地は雪 's' を基調に、北端だけ
 *   火山灰 'c'、沈んだ渚の舗装と氷室の床は石畳 'o'、南東の潮境だけ砂 'd'、水は '~'。
 *   ⚠️ 石畳は**下地**に敷く（tiles 層の 'o' は浮き出た石ブロックに描かれる＝壁に見える）。
 *   到着時の持ち物は **剣・木の盾・ブーメラン・弓・ロウソク**（_REGION_POWER.S = 6）
 *   ∴「今できる」のは茂み刈り 'u'・石押し（'*'→'S'→'T'）・弓で 'Y'／かがり火 'H'・
 *   ブーメランの火運び・killAll の5系統。**はしご・爆弾・笛**の仕掛けは全て
 *   **任意報酬の袋小路**に置く（進行必須にしない）＝爆弾 `15,5`／はしご `15,6`／
 *   笛 `13,8`。
 *
 * 封印の一般則（⑧で確立・DECISIONS.md 参照）:
 *   **幅1の下地水だけで囲った窪みは封印にならない。** `blade-solver.mjs` の
 *   `canLadderCross` は「進入軸の幅1水で両隣が陸」を渡らせ、かつ `isBank` は
 *   刈れる茂み 'u' を陸として数える∴幅1水を挟んだ窪みははしごで裏から入れる。
 *   sealed に使う囲いは **水2幅以上か 'M'/'#' のハード壁**でなければならない
 *   （`13,7` の氷の川床は水2幅・`14,3` `12,9` の茂み封印は 'M'/'t' のハード壁）。
 *
 * 自己検証（沼P migrate の写し＝ロジックは1行も変えていない）:
 *   ⓐ BG_CHARS は雪 's'（TILE.SNOW）と火山灰 'c'（TILE.ASH）を含む（S の基調色）。
 *   ⓑ ボタン 'S' は links を使わず refreshGates の buttons 経路で 'T' を開く
 *      ∴「'T' に links が無い」を **'S' がある画面に限り** 許し、代わりに
 *      「'S' があるなら 'T' もある」を検査する（`15,3` の氷の樋＝帯で唯一の石押し画面）。
 *   ① 外周リング＝**現在の実データの歩ける/歩けないを1ビットも動かさない**（隣接画面＝
 *      作り込み済みの雪原S本体・火山L の灰の広庭・東の深洋O が既に縁を決めている∴
 *      現データの写しが唯一の安全な作法）。加えて**継ぎ目の相互整合**（自分の要開口と
 *      隣の実データが一致するか）を全交差で照合する＝seams/traps/footprintBlocked が
 *      構成上不変になる。
 *   ② 閉じたリングセルの見た目は岩山 'M' **または下地の水 '~'**（＝外海・入江の岸）。
 *   ③ 徒歩の塊は**複数あってよい**（この帯は結果として全画面1塊だが、検査は⑧のまま）。
 *      塊ごとに状態空間を展開し、到達セルを合併して無駄セル0を見る。
 *   ④ `sealed` ＝「その仕掛けを解かないと徒歩では届かないセル」を明示し、
 *      徒歩BFS（道具なし・ゲート閉・下地の水も壁）に**入っていないこと**を検査する。
 *      対照実験（tools）と対で「ゲートが何も塞いでいない飾り」を機械的に弾く。
 *   ⑤ 特別なタイル（'v' 橋・'=' 潮ゲート・'x' 穴・'B' 宝箱 等）の下地が水でないこと。
 *      ⚠️ `game/passable.js tilePassable` は **isWaterAt を潮ゲート/橋の判定より先に**
 *      見る∴下地が水のゲートは「開いたのに永久に通れない」（実装済みの罠）。
 *   ⑥〜⑨ 以降は⑧と同じ（無駄セル0・看板/かがり火の隣接・詰まない・対照実験・
 *      軸2以上・重複配置なし・宝箱/看板/links/breakableWalls/enemyDirs/弱点の整合。
 *      笛の封印は fluteEffect{type:'reveal'} と双方向で対応させる）。
 *
 * 使い方: node scripts/migrate-field-snow-s-east.mjs [--dry] [--rings]
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
// tiles: '.' 素の地面（見える地面は bg 側）/ 'M' 岩山＝雪庇・氷丘・断崖 / '#' 石壁（氷室の
//   柱・沈んだ鐘楼の礎石）/ 'u' 茂み（剣で刈れる）/ 'x' 陥没穴（はしごで幅1だけ渡る）/
//   'v' 橋・渡し板 / '=' 潮ゲート・'T' ゲート（'Y' の links または 'S' で開く）/
//   'Y' 叩くスイッチ（剣・矢で入る）/ '*' 押せる石・'S' ボタン（石が載ると永久 ON）/
//   'H' かがり火（ロウソク／ブーメランの火運び）/ 'B' 宝箱 / '!' 爆弾で割れる岩 /
//   'i' 石碑・道標 / 'h' 廃屋・船体の壁・'p' その屋根・甲板 / 't' 枯木 /
//   '>' 別レイヤーへの入口（既存の mapEnters を保つ）/
//   敵 'E' パトロール・'C' チェイサー・'α' 地中蟲・'β' 跳躍蜘蛛・'ξ' コウモリ群・
//   'σ' ルピー喰い・'φ' 火吐き亀・'ω' 突進猪（向き別スプライトの敵 θ μ ζ λ π は
//   field 不可＝enemyDirs を要する／弱点持ち δ η も field 不可）。
//   ⚠️ 'o' は tiles に書かない＝石畳は bg 側の 'o'（平らな石床）で敷く。
// bg: 見える地面（10行×12列）。's' 雪・'c' 火山灰・'o' 石畳・'d' 砂・'~' 水。
//   下地の水は実エンジン・接続チェッカー・軸計算のすべてが壁として畳む。
// sealed: 仕掛けを解かないと徒歩では届かないセル（④の検査対象）。
// tools: 対照実験（control を封じたら cell に到達できないこと）。
//   control: 'noTools'（爆弾/弓/ブーメラン/ロウソク封じ）/ 'noLadder' / 'noPush' / 'noBush'
const SCREENS = [
  {
    key: '14,3',
    title: '熔け残りの雪庇',
    // 帯の入口（北は `14,2` 灰の広庭）。灰が雪に変わる境目で、雪庇の下に穀物庫の
    // 跡が埋まっている。戸は茂み 'u' 一枚＝**到着時の剣だけで解ける**（帯で最初の報酬）。
    // 灰から降りてきた火吐き亀 φ が一匹（脅威度 8.0）＝北の火山Lの気配を1体だけ引き継ぐ。
    tiles: [
      '............',
      '....t.......',
      '.......MMM..',
      '.......MBM..',
      '.......MuM..',
      '....φ.......',
      '...MM.......',
      '.....i......',
      '........t...',
      'MMMMM..MMMMM',
    ],
    bg: [
      'cccccccccccc',
      'cccccccccccc',
      'cccccccccccc',
      'ccsssssssscc',
      'cssssssssssc',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
    ],
    chestContents: { '3,8': { type: 'rupee', value: 40, name: 'ルピー×40' } },
    signData: {
      '7,5': {
        name: '灰と雪の境の道標',
        lines: [
          '【熔け残りの雪庇】',
          '北は 灰の 広庭。南は 凍てつく 雪原。',
          '雪庇の 下に 昔の 蔵が 眠る。',
        ],
      },
    },
    sealed: ['3,8', '4,8'],
    tools: [{ control: 'noBush', cell: '3,8', why: '雪庇の蔵は茂みを刈らないと開かない' }],
  },
  {
    key: '15,3',
    title: '凍った溶岩流',
    // 火口から流れ落ちた溶岩が固まったまま凍った樋。樋は南から入る一本道で、
    // 底に丸石 '*' が落ちている＝**北へ押し上げて** 天井際のボタン 'S' に載せると、
    // 東の氷室のゲート 'T' が開く（ボタン盤面なので 'T' に links は書かない＝ⓑ）。
    tiles: [
      '...........M',
      '...........M',
      '....MMM....M',
      '....MSM....M',
      '....M.M....M',
      '....M.M.MTMM',
      '....M*M.MBMM',
      '....M.M.MMMM',
      '....i......M',
      'M..........M',
    ],
    bg: [
      'cccccccccccc',
      'sccccccccccs',
      'ssccccccccss',
      'sssccccccsss',
      'ssssccccssss',
      'sssssccsssss',
      'sssssccsssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
    ],
    chestContents: { '6,9': { type: 'rupee', value: 60, name: 'ルピー×60' } },
    signData: {
      '8,4': {
        name: '溶岩樋の石碑',
        lines: [
          '【凍った溶岩流】',
          '火の 川は ここで 止まった。',
          '樋の 石を 天井まで 押し上げよ。氷室が 開く。',
        ],
      },
    },
    sealed: ['5,9', '6,9'],
    tools: [{ control: 'noPush', cell: '6,9', why: '氷室は石をボタンに載せないと開かない' }],
  },
  {
    key: '15,4',
    title: '氷の鐘楼',
    // 雪に半分埋まった鐘楼。楼の前に一対のかがり火 'H' があり、両方に火を入れると
    // 供物の箱が現れる（火種は無い＝**ロウソクの献灯**。到着時に持っている）。
    // 鐘楼の床下から出る地中蟲 α が2匹（脅威度 8.0）＝献灯の間の圧。
    // ⚠️ 楼は**幅2・高さ3（屋根 'p' 1段＋外壁 'h' 2段）の塔の形**にする。
    //    実ブラウザで確かめた事実：'p'＋'h' を横に4枚並べると「家が4軒並んだ絵」に
    //    見えて「楼（塔）」に見えない（`14,8` の見張り櫓＝幅2・高さ2 は塔に見える）。
    //    ∴石畳の広場 'o' の中央に細く高い塔を建て、その足元の左右にかがり火を置く。
    tiles: [
      'M..........M',
      'M..........M',
      'M....pp....M',
      'M....hh....M',
      '....HhhH...M',
      '.....B.....M',
      'M....i.....M',
      'M....α.....M',
      'M.....α....M',
      'M..........M',
    ],
    bg: [
      'ssssssssssss',
      'ssssssssssss',
      'ssssoooossss',
      'ssssoooossss',
      'ssssoooossss',
      'ssssoooossss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
    ],
    chestContents: { '5,5': { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } },
    showConditions: { '5,5': { trigger: 'torchesLit', message: '🔥 一対の 火が 灯り 供物の 箱が 現れた！' } },
    signData: {
      '6,5': {
        name: '鐘楼の石碑',
        lines: [
          '【氷の鐘楼】',
          '鐘は 氷に 呑まれ 鳴らぬ。',
          '一対の 火を 灯せ。それが 今の 弔いだ。',
        ],
      },
    },
  },
  {
    key: '15,5',
    title: '風の裂け目',
    // 雪原の南端。岩の割れ目に石室があり、入口は爆弾で割れる岩 '!' で塞がっている
    // ＝**爆弾（D6報酬）を取った後で戻ってくる袋小路**（進行必須にしない）。
    // 突進猪 ω が1体（脅威度 9.0）＝突進は最大9セル∴横に開けた雪原が舞台として効く。
    tiles: [
      'M..........M',
      '...........M',
      '...MMM.....M',
      '...!BM.....M',
      '...MMM.....M',
      '...........M',
      '...i....MM.M',
      '......ω.MM.M',
      '...........M',
      '...........M',
    ],
    bg: [
      'ssssssssssss',
      'ssssssssssss',
      'sssooossssss',
      'sssooossssss',
      'sssooossssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
    ],
    chestContents: { '3,4': { type: 'rupee', value: 75, name: 'ルピー×75' } },
    breakableWalls: { '3,3': { breakDef: 1 } },
    signData: {
      '6,3': {
        name: '裂け目の石碑',
        lines: [
          '【風の裂け目】',
          '岩の 割れ目に 石室が ある。',
          '素手では 開かぬ。爆ぜる 力を 持って 戻れ。',
        ],
      },
    },
    sealed: ['3,3', '3,4'],
    tools: [{ control: 'noTools', cell: '3,4', why: '石室は爆弾で岩を割らないと開かない' }],
  },
  {
    key: '14,6',
    title: '雪原の道標',
    // 息継ぎの画面（仕掛け無し・報酬無し）。雪の下から湧いた水が凍らずに溜まり、
    // 枯木と小屋の跡だけが目印になる。帯の中で唯一「何もしなくてよい」画面。
    tiles: [
      'M...........',
      '........t...',
      '....pp......',
      '....hh......',
      '.....i......',
      '............',
      '..t.........',
      '............',
      '.........t..',
      '............',
    ],
    bg: [
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssss~~~~ss',
      'ssssss~~~~ss',
      'ssssssssssss',
      'ssssssssssss',
    ],
    signData: {
      '4,5': {
        name: '雪原の道標',
        lines: [
          '【雪原の道標】',
          '東へ 進めば 氷の 断崖。海の 匂いが する。',
          '南へ 下れば 潮境。北へ 戻れば 灰。',
        ],
      },
    },
  },
  {
    key: '15,6',
    title: '海へ落ちる氷の断崖',
    // 東（`15,7` の col11 は下地の水＝外海）へ落ちる断崖の上。氷が抜けた陥没穴 'x' の
    // 向こうに宝箱があり、**はしご（D5報酬）で幅1だけ渡る**＝取った後で戻る袋小路。
    // 断崖のコウモリ群 ξ が2つ。
    tiles: [
      '............',
      '..ξ.........',
      '............',
      '.....MMM....',
      '.....xBM....',
      '.....MMM....',
      '.......ξ....',
      '....i.......',
      '............',
      '............',
    ],
    bg: [
      'sssssssssss~',
      'sssssssssss~',
      'ssssssssss~~',
      'ssssssssss~~',
      'ssssssssss~~',
      'ssssssssss~~',
      'ssssssssss~~',
      'ssssssssss~~',
      'sssssssssss~',
      'sssssssssss~',
    ],
    chestContents: { '4,6': { type: 'rupee', value: 55, name: 'ルピー×55' } },
    signData: {
      '7,4': {
        name: '断崖の石碑',
        lines: [
          '【海へ落ちる 氷の 断崖】',
          '氷が 抜けた 穴の 先に 誰かの 荷が 残る。',
          '橋を 架ける 道具が あれば 届こう。',
        ],
      },
    },
    sealed: ['4,5', '4,6'],
    tools: [{ control: 'noLadder', cell: '4,6', why: '陥没穴の向こうははしごでしか渡れない' }],
  },
  {
    key: '13,7',
    title: '氷の川床',
    // 雪原を南北に流れる川。**水は2幅**＝はしごでは渡れない（⑧で確立した封印の一般則）。
    // ⚠️ ただしこの画面の川は「画面を割る封印」ではない：外周リング（row0 / row9）は
    //    北隣 `13,6` / 南隣 `13,8` の開口と一致させねばならず、両隣は乾いた床
    //    ∴川は row1〜row3 と row6〜row8 の二つの淵にしかできず、row0 と row9 を回れば
    //    迂回できる。**看板で「板だけが通り道」と書くのは嘘になる**（実ブラウザで気付いた）
    //    ∴中ほどの渡し板 'v' は「川床を跨ぐ唯一の橋」として書き、迂回は否定しない。
    // ⚠️ 板 'v' は必ず**乾いたセル**に置く：`game/passable.js` の `tilePassable()` は
    //    `isWaterAt()` で早期 return する＝bgTiles が水のセルは 'v' を載せても通れない。
    //    ∴橋は水の淵に挟まれた乾いた列に置き、水は橋の南北に置く（`12,8` `13,8` も同じ作法）。
    // 川床を挟んで地中蟲 α が2匹、東の岩囲いに宝箱。
    tiles: [
      '............',
      '............',
      '.......α....',
      '............',
      '....vv......',
      '....vv......',
      '......MMM...',
      '......MBM...',
      '..α...i.....',
      '............',
    ],
    bg: [
      'ssssssssssss',
      'ssss~~ssssss',
      'ssss~~ssssss',
      'ssss~~ssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssss~~ssssss',
      'ssss~~ssssss',
      'ssss~~ssssss',
      'ssssssssssss',
    ],
    chestContents: { '7,7': { type: 'rupee', value: 30, name: 'ルピー×30' } },
    signData: {
      '8,6': {
        name: '川床の石碑',
        lines: [
          '【氷の 川床】',
          '川は 二幅。氷の 下から 湧き 氷の 下へ 消える。',
          '川床を 跨ぐ 橋は 中ほど だけ。蟲は 板の 上で 待つ。',
        ],
      },
    },
  },
  {
    key: '14,7',
    title: '氷漬けの館',
    // 帯のランドマーク。潮が凍った日に置き去られた館が、屋根 'p' と外壁 'h' ごと
    // 雪原に埋もれている。奥の間（'h' の内側）に積荷が残り、**外の敵を全て倒すと**
    // 現れる（killAll）＝到着時の力だけで解ける。守り手はコウモリ群 ξ×2 と
    // チェイサー C（脅威度 14.0）＝帯で最も重い戦闘だが、奥の間に逃げ込める逃げ場がある。
    // ⚠️ 当初は「氷漬けの船」として設計したが、実ブラウザで見ると 'p'＝家の屋根・
    //    'h'＝家の外壁（窓付き）のスプライトで描かれ、**どう見ても建物で船に見えない**。
    //    ゲームに舟のタイルは無い（`shared/tiles.js` の 'p' は HOUSE_ROOF）∴絵の側に
    //    寄せて「館」に改名した（看板・封印メッセージ・敵配置表の記述もすべて合わせる）。
    tiles: [
      '............',
      '...ξ.....M..',
      '...pppppp...',
      '..hhhhhhhh..',
      '..h......h..',
      '..h..B...h..',
      '..hhh..hhh..',
      '.....C..i...',
      '..M.....ξ...',
      '............',
    ],
    bg: [
      'ssssssssssss',
      'ssssssssssss',
      'ssooooooooss',
      'ssooooooooss',
      'ssooooooooss',
      'ssooooooooss',
      'ssooooooooss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
    ],
    chestContents: { '5,5': { type: 'item', item: 'healPotion', name: '回復薬（小）' } },
    showConditions: { '5,5': { trigger: 'killAll', message: '⚔ 館を 守る 者を 退けた！奥の間の 積荷が 現れた！' } },
    signData: {
      '7,8': {
        name: '館の 門柱の 標',
        lines: [
          '【氷漬けの 館】',
          '潮が 凍った 日に 置いて 行かれた 館。',
          '奥の間は 生き物の 巣に なった。退けねば 開かぬ。',
        ],
      },
    },
  },
  {
    key: '15,7',
    title: '潮境の氷丘',
    // 雪が砂と石畳に変わる潮境（南東は深洋O の `15,8`）。氷丘の上の 'Y' は
    // **潮の中の小島に置き、四方を水2幅で囲って剣もはしごも届かない**∴**弓で撃つ**
    // しかない（到着時に持っている）。撃つと潮ゲート '=' が開き、入江の窪みの宝箱に届く。
    // ⚠️ 水1幅では封印にならない（⑧の一般則）＝`canLadderCross` が縦軸で渡してしまい、
    //    小島の隣に立って剣で叩けた（--dry が実際に検出）∴cols8-11 × rows1-3 を
    //    まとめて水にして 'Y' の1セルだけ島として残す。矢は水の上を飛ぶ＝row2 と col10
    //    の2レーンが射線になる。
    tiles: [
      '............',
      '...t........',
      '..........Y.',
      '............',
      '..MM........',
      '...M........',
      '....M=M.....',
      '....MBM.....',
      '...iMMM..t..',
      '............',
    ],
    bg: [
      'sssssssssss~',
      'ssssssss~~~~',
      'ssssssss~~s~',
      'ssssssss~~~~',
      'sssssssssss~',
      'sssssssssss~',
      'sssdddddddd~',
      'ssdddoooodd~',
      'sddoooooodd~',
      'dddoooooodd~',
    ],
    links: [{ switchId: '2,10', gateId: '6,5' }],
    chestContents: { '7,5': { type: 'rupee', value: 45, name: 'ルピー×45' } },
    showConditions: { '7,5': { trigger: 'switchOn', switchId: '2,10', message: '⚙ 潮の 戸が 開いた！' } },
    signData: {
      '8,3': {
        name: '潮境の石碑',
        lines: [
          '【潮境の 氷丘】',
          '雪は ここで 砂に 変わる。海の 領分は すぐ 東。',
          '氷丘の 印は 手では 届かぬ。遠くから 射よ。',
        ],
      },
    },
    sealed: ['6,5', '7,5'],
    tools: [{ control: 'noTools', cell: '7,5', why: '潮の戸は弓で氷丘のYを撃たないと開かない' }],
  },
  {
    key: '12,8',
    title: '湖からの落ち口',
    // 息継ぎの画面（仕掛け無し・報酬無し）。西の湖W（`11,8` の桟道）から溢れた水が
    // 雪原へ落ちる口。西の岸（col0 の r4/r5）から東へ渡るには**渡し板 'v' の土手**
    // 一本しかない＝画面の形そのものが導線になる。
    tiles: [
      '............',
      '............',
      '.....t......',
      '............',
      '.vvv........',
      '.vvv........',
      '............',
      '.....i......',
      '........t...',
      '............',
    ],
    bg: [
      '~sssssssssss',
      '~~~~ssssssss',
      '~~~~ssssssss',
      '~~~~ssssssss',
      'ssssssssssss',
      'ssssssssssss',
      '~~~~ssssssss',
      '~~~~ssssssss',
      '~~~~ssssssss',
      '~sssssssssss',
    ],
    signData: {
      '7,5': {
        name: '落ち口の道標',
        lines: [
          '【湖からの 落ち口】',
          '西の 湖の 水は ここで 雪原に こぼれる。',
          '西へ 抜ける 土手は ここ だけ。踏み外すな。',
        ],
      },
    },
  },
  {
    key: '13,8',
    title: '氷下の鐘',
    // 氷の下に沈んだ鐘楼の礎石 '#' が四本だけ残る。**笛（D8報酬）を吹くと**
    // 氷の下から供物の箱が浮く（fluteEffect{reveal} と showConditions を対で置く
    // ＝⑧で見つけた「笛の封印が永久に開かない」罠を踏まない）。取った後で戻る袋小路。
    tiles: [
      '............',
      '..#......#..',
      '............',
      '............',
      '.....vv.....',
      '....#...#...',
      '.....B......',
      '....#...#...',
      '..i.........',
      '............',
    ],
    bg: [
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      's~~~~ss~~~~s',
      'ssssooooosss',
      'ssssooooosss',
      'ssssooooosss',
      'ssssssssssss',
      'ssssssssssss',
    ],
    chestContents: { '6,5': { type: 'item', item: 'redPotion', name: '大回復薬' } },
    showConditions: { '6,5': { trigger: 'flutePlayed', message: '🎵 氷の 下から 供物の 箱が 浮き上がった！' } },
    fluteEffect: { type: 'reveal' },
    signData: {
      '8,2': {
        name: '沈んだ 鐘楼の 標',
        lines: [
          '【氷下の 鐘】',
          '礎石 四本。鐘楼は 氷の 下に ある。',
          '音で 呼べば 応える と 伝わる。',
        ],
      },
    },
  },
  {
    key: '14,8',
    title: '潮の見張り櫓',
    // 南東（深洋O）へ向かう砂と石畳の坂。潮を見張る櫓（'h'＋'p'）が建ち、その足元に
    // 旅人の荷が置かれている。ルピー喰い σ が荷にたかる＝倒してから開ける画面。
    tiles: [
      '............',
      '........t...',
      '.....pp.....',
      '.....hh.....',
      '.....hh.....',
      '.....B......',
      '..σ.........',
      '.....i......',
      '.........M..',
      '............',
    ],
    bg: [
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssddddddddss',
      'sdddddddddds',
      'dddddddddddd',
      'ddddoooodddd',
      'dddooooooddd',
      'ddoooooooodd',
      'dooooooooood',
    ],
    chestContents: { '5,5': { type: 'rupee', value: 25, name: 'ルピー×25' } },
    signData: {
      '7,5': {
        name: '見張り櫓の石碑',
        lines: [
          '【潮の 見張り櫓】',
          '雪は 砂に 変わり 石畳は 海へ 続く。',
          '荷を 置いた 者は 帰らなかった。',
        ],
      },
    },
  },
  {
    key: '12,9',
    title: '霜枯れの林',
    // 帯の南西の隅。霜で枯れた木立の中に一本だけ茂み 'u' が残り、その奥に木こりの
    // 隠し物がある＝**剣で刈るだけ**（到着時の力）。林をパトロールする 'E' が1体。
    tiles: [
      '............',
      '.......t....',
      '.........t..',
      '.ttt........',
      '.tBt........',
      '.tut........',
      '............',
      '......i.....',
      '..t.E.......',
      '............',
    ],
    bg: [
      '~sssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssss~~~s',
      'ssssssss~~~s',
      'ssssssssssss',
      'ssssssssssss',
    ],
    chestContents: { '4,2': { type: 'rupee', value: 35, name: 'ルピー×35' } },
    signData: {
      '7,6': {
        name: '林の石碑',
        lines: [
          '【霜枯れの 林】',
          '木は 枯れ 実も つかぬ。',
          '一本 だけ 青い 茂みが ある。木こりの 覚え書きだ。',
        ],
      },
    },
    sealed: ['4,2', '5,2'],
    tools: [{ control: 'noBush', cell: '4,2', why: '木こりの隠し物は茂みを刈らないと届かない' }],
  },
  {
    key: '13,9',
    title: '潮汲みの氷洞',
    // 帯の締め。潮を汲んで塩を焼いた氷の洞で、奥に三つのかがり火 'H' が並ぶ。
    // 一番奥（`4,3`）だけが消えずに残っている＝**ブーメランで火を運ぶ**（木の
    // ブーメラン射程3で `4,3`→`4,5`→`4,7` と繋がる幾何にしてある。ロウソクでも解ける）。
    // 洞の口に跳躍蜘蛛 β が1体（脅威度 8.0）＝火を運ぶ間に飛び込んでくる。
    tiles: [
      '............',
      '...MMMMMMM..',
      '..M.......M.',
      '..M.......M.',
      '..MH.H.H..M.',
      '..M.......M.',
      '..M.B.....M.',
      '..MMM..MMM..',
      '.....β......',
      '............',
    ],
    bg: [
      'ssssssssssss',
      'ssssssssssss',
      'sssoooooooss',
      'sssoooooooss',
      'sssoooooooss',
      'sssoooooooss',
      'sssoooooooss',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
    ],
    chestContents: { '6,4': { type: 'rupee', value: 50, name: 'ルピー×50' } },
    showConditions: { '6,4': { trigger: 'torchesLit', message: '🔥 三つの 火が 揃い 塩焼きの 蓄えが 現れた！' } },
    initLitTorches: ['4,3'],
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

/** 下地 bgTiles（10行×12列）。'd' 砂・'g' 草・'o' 石畳・'~' 水・'s' 雪・'c' 火山灰のみ許す。 */
const BG_CHARS = new Set([
  'd', 'g', TILE.MUD, TILE.STONE_FLOOR, TILE.WATER, TILE.SNOW, TILE.ASH,
]);
function bgGridOf(spec) {
  const bg = parse(spec.bg, `${spec.key}(bg)`);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!BG_CHARS.has(bg[r][c])) throw new Error(`${spec.key}: bg ${key(r, c)} が '${bg[r][c]}'（d/g/w/o/~/s/c のみ）`);
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
// この帯は隣接する火山L（灰の広庭）・雪原S本体・東の深洋O が既に縁を決めている∴
// **作り替える14枚自身の現データの歩ける/歩けないをそのまま要件にする**のが唯一安全。
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

console.log(`✅ 雪原S 東の縁 14画面を作り込み${DRY ? '（--dry: 書き込みなし）' : ''}`);
for (const { spec, states, axes, comps } of report) {
  console.log(`   ${spec.key.padEnd(5)} ${spec.title.padEnd(9)} 軸[${[...axes].join(',')}] 状態 ${states} 塊 ${comps}`
    + (spec.tools?.length ? ` 対照 ${spec.tools.map((t) => t.control).join('/')}` : ''));
}
