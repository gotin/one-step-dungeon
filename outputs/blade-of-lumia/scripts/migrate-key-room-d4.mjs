// D4 の鍵部屋を「倉庫番型①＝石3・純倉庫番」に作り替える
// （2026-08-06 / PLAN 実行キュー 5.5e・設計は PUZZLE-DESIGN.md §7-4 #4）。
//
// 芯：部屋のボタン 'S' 3個すべてに石 '*' を乗せると showConditions(`stonesPlaced`) で
// 鍵 K(5,7) が出現する。`allSwitchesOn` を使わない理由＝ボタンはモーメンタリで
// **プレイヤーが踏んでも ON** になる∴「石を2個運び、最後の1個は自分が踏む」で
// 1手ぶん飛ばせてしまい倉庫番として成立しない。`stonesPlaced` は石だけを数える
// （game/conditions.js・refreshGates の `stonesLocked` と同じ判定関数を共有）。
//
// 部屋の位相（PUZZLE-DESIGN §7-2）：dungeon_4 [1,0] は**孤島**＝辺で隣室と繋がらず
// ワープ `>`(7,9) で入る（d4_bosswing→d4_gatehall の双方向）。もう一方の出口は
// 西の鍵扉 D(4,0)(5,0)＝ボス部屋。∴部屋を丸ごとパズルに使える。
//
// 詰み対策（この部屋の設計上の核心）：
//   ・ワープ `>` は**詰み救済の唯一の出口**（踏んで隣室へ出ると enterStage が
//     未解決の石を初期位置へ戻す）。∴ワープを石で塞がれると本当のハードロックになる。
//     笛の `resetStones` は救済にならない（笛は D8 の報酬＝D4 時点で未所持）。
//   ・そこで東列を「石が絶対に入れない安全地帯（前室）」にした。宝箱もその中。
//     石が入れないことは静的な帰納法で保証する（下の検査⑤）。口は2つ以上（検査⑥）。
//   ・仕上げに状態空間で実測して noEscape=0（どの到達状態からもワープへ戻れる）を確認する（検査⑨）。
//   ・`fluteEffect:{type:'resetStones'}` も付けておく（笛入手後に再訪したとき用の保険。
//     D4 初回攻略時は笛が無いので効かない＝上の3段が本体）。
//
// 敵は置かない：敵は enemy_ai.js tryEnemyPushStone で**石を押す**＝測定した倉庫番が
// 崩れる/詰む。他の鍵部屋（D5 など）は「敵が1体は居る」を検査しているが、
// 倉庫番型はこの理由で逆に敵ゼロを要求する（check-dungeon-integrity.mjs の
// `stonesPlaced` ケースも敵が居たら error にしてある）。
//
// このスクリプトは書き込む前に自分で盤面を検査する（migrate-key-room-d2/d3/d5.mjs と
// 同じ作法）。検査は generate-key-room-d4.mjs の analyze/assertGeometry/measurePlacement を
// **そのまま import して再利用**する（規則を2箇所に書いて食い違わせない）：
//   ① 10×12 の文字配列／見た目だけの地面タイルを混ぜていない（analyze）
//   ② 外周＝孤島なので鍵扉 D(4,0)(5,0) 以外は全壁（assertGeometry ①）
//   ③ ボタン3個・鍵1個・宝箱1個・ワープ1個・ゲート T 無し・敵無し（analyze）
//   ④ 石はちょうど3個で、初期からボタン上に乗っていない
//   ⑤ 安全地帯（前室）へ外から石を押し込める向きが存在しない（assertGeometry ②③）
//   ⑥ 安全地帯は連結で本体との口が2つ以上（assertGeometry ④）
//   ⑦ 鍵扉の手前 (4,1)(5,1) が床（assertGeometry ⑤）
//   ⑧ 石ゼロ／解けた状態のどちらでもワープから鍵・宝箱・扉の手前へ歩ける（assertGeometry ⑥⑦）
//   ⑨ ソルバー実測（この盤面の石配置で）：可解・L が帯 20〜35・貪欲では解けない・
//      deadlock>0・強制手率≤0.7・noEscape=0
//   ⑩ 既存の宝箱(2,9 ハートの器)・ワープ(7,9)・鍵(5,7) のセルが動いていない
//      （chestContents/mapEnters のキーを付け替えずに済む＝PUZZLE-DESIGN §7-2 の表と一致）
//
// 使い方:
//   node scripts/migrate-key-room-d4.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-key-room-d4.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { analyze, assertGeometry, measurePlacement } from './generate-key-room-d4.mjs';
import { verdict } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_4';
const ROOM  = '1,0';

// generate-key-room-d4.mjs のテンプレ v2 ＋ 逆算生成が採った石配置（3,1 / 7,6 / 8,2）。
// ',' は「安全地帯（前室）」の注釈で、書き込み時は床 '.' に戻す（analyze/buildTiles と同じ規則）。
const TEMPLATE = [
  '############',
  '#S......####',
  '#.#..#..#B##',
  '#.....#.,,##',
  'D..#S...#,##',
  'D....#.K#,##',
  '#.#...#.,,##',
  '#.......#>##',
  '#......S#,##',
  '############',
];
const STONES = ['3,1', '7,6', '8,2'];
const SAFE_MARK = ',';

// 測定の期待値（generate-key-room-d4.mjs の実測＝この盤面の素性。ズレたら error）。
const EXPECT = { L: 32, L_MIN: 20, L_MAX: 35 };

const KEY_CELL = '5,7';
const CHEST_CELL = '2,9';
const WARP_CELL = '7,9';

// ── 盤面の検査（書き込み前） ───────────────────────────────────────────────
// ①②③⑤⑥⑦⑧＝generate 側の解析器をそのまま使う
const t = analyze(TEMPLATE);
assertGeometry(t);

if (t.keyCell !== KEY_CELL) throw new Error(`鍵セルが ${KEY_CELL} でない: ${t.keyCell}`);
if (t.chest !== CHEST_CELL) throw new Error(`宝箱セルが ${CHEST_CELL} でない: ${t.chest}`);
if (t.warp !== WARP_CELL) throw new Error(`ワープセルが ${WARP_CELL} でない: ${t.warp}`);

// ④ 石はちょうど3個・ボタン上でない・床の上・安全地帯の外
if (STONES.length !== 3) throw new Error(`石は3個（今 ${STONES.length}）`);
if (new Set(STONES).size !== STONES.length) throw new Error(`石の座標が重複している: ${STONES.join(' ')}`);
for (const s of STONES) {
  if (!t.floors.has(s)) throw new Error(`石 ${s} が床でない`);
  if (t.buttons.includes(s)) throw new Error(`石 ${s} が初期からボタン上にある＝パズルが一部解けている`);
  if (t.safe.has(s)) throw new Error(`石 ${s} が安全地帯の中にある＝不変条件②（石は前室に入れない）が崩れる`);
  if (s === t.keyCell) throw new Error(`石 ${s} が鍵セルの上にある`);
}

// ⑨ ソルバー実測（4軸＋帯＋I3）
const m = measurePlacement(t, STONES, 9000000);
const v = verdict(m);
console.log(`# 実測: L=${m.L} 貪欲=${m.greedy ? '解ける(NG)' : '解けない(OK)'} deadlock=${m.deadlocks}`
  + ` 強制手率=${m.forcedRatio} 最短解=${m.solCount} 状態=${m.states} 脱出不能=${m.noEscape} → ${v.label}`);
if (m.L === Infinity || m.L == null) throw new Error('この石配置では鍵に到達できない＝解なし');
if (!v.pass) throw new Error(`4軸の下限を満たしていない: ${v.label}`);
if (m.noEscape !== 0) throw new Error(`脱出不能な状態が ${m.noEscape} 個ある＝ワープに戻れない詰み（笛は D4 時点で未所持）`);
if (m.L < EXPECT.L_MIN || m.L > EXPECT.L_MAX) throw new Error(`L=${m.L} が帯 ${EXPECT.L_MIN}〜${EXPECT.L_MAX} の外`);
if (m.L !== EXPECT.L) throw new Error(`L=${m.L} が記録値 ${EXPECT.L} と違う（ソルバー規則が変わった可能性＝要調査）`);

// 書き込む盤面（',' → '.'／石 '*' を配置）
const grid = TEMPLATE.map((row) => [...row]);
const ROWS = grid.length, COLS = grid[0].length;
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) if (grid[r][c] === SAFE_MARK) grid[r][c] = '.';
}
for (const s of STONES) {
  const [r, c] = s.split(',').map(Number);
  grid[r][c] = '*';
}
if (grid.flat().filter((ch) => ch === '*').length !== 3) throw new Error('書き込む盤面の石が3個でない');
if (grid.flat().includes(SAFE_MARK)) throw new Error(`書き込む盤面に注釈 '${SAFE_MARK}' が残っている`);

// ── 書き込み ──────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stage = data.layers?.[LAYER]?.stages?.[ROOM];
if (!stage) throw new Error(`部屋が無い: ${LAYER} [${ROOM}]`);

// ⑩ 既存の宝箱・ワープの配線が新盤面のセルと一致しているか（付け替え漏れ防止）
if (!stage.chestContents?.[CHEST_CELL]) throw new Error(`chestContents に ${CHEST_CELL}（ハートの器）が無い`);
if (Object.keys(stage.chestContents).some((k) => k !== CHEST_CELL))
  throw new Error(`chestContents に新盤面と無関係なセルがある: ${Object.keys(stage.chestContents).join(' ')}`);
if (!stage.mapEnters?.[WARP_CELL]) throw new Error(`mapEnters に ${WARP_CELL}（ワープ）が無い`);
if (Object.keys(stage.mapEnters).some((k) => k !== WARP_CELL))
  throw new Error(`mapEnters に新盤面と無関係なセルがある: ${Object.keys(stage.mapEnters).join(' ')}`);

const before = stage.tiles.map((r) => (Array.isArray(r) ? r.join('') : String(r)));
stage.tiles = grid.map((r) => [...r]);       // ⚠️ 文字配列で持つ（行文字列だと実ゲームが落ちる）
stage.rows  = ROWS;
stage.cols  = COLS;
stage.links = [];                            // ゲート T が無い＝links は空配列（`{}` は refreshGates で落ちる）
stage.enemyDirs = {};                        // 敵を置かない
stage.floorItems = {};
stage.showConditions = { [KEY_CELL]: { trigger: 'stonesPlaced' } };
// 笛入手後に再訪したときの保険（D4 初回攻略時は笛が無いので効かない＝救済の本体はワープ）。
stage.fluteEffect = { type: 'resetStones' };
stage.comment =
  '[key_gate D4] 倉庫番型①＝石3・純（PUZZLE-DESIGN §7-3 C / §7-4 #4 / キュー 5.5e）。'
  + `ボタン S ${t.buttons.join(' ')} の全てに石 ${STONES.join(' ')} を乗せると`
  + `showConditions(stonesPlaced) で鍵 ${KEY_CELL} が出現→西の鍵扉 D(4,0)(5,0) からボス部屋へ。`
  + 'stonesPlaced は石だけを数える（ボタンはモーメンタリでプレイヤーが踏んでも ON になるため'
  + 'allSwitchesOn では「最後の1個は自分が踏む」で1手飛ばせてしまう）。'
  + `実測 L=${m.L}・貪欲では解けない・deadlock=${m.deadlocks}・強制手率=${m.forcedRatio}`
  + `・最短解${m.solCount}本・状態${m.states}・脱出不能0。`
  + `東列（宝箱 ${CHEST_CELL} とワープ ${WARP_CELL} を含む前室）は石が絶対に入れない安全地帯＝`
  + '外から押し込める向きが1つも無く（幾何で保証）本体との口が2つある∴詰み救済の'
  + 'ワープを石で塞げない（笛の resetStones は D8 の報酬なので D4 では使えない）。'
  + '敵は置かない（敵が石を押して測定した倉庫番が崩れる）。';

console.log(`# ${LAYER} [${ROOM}] を倉庫番型①（石3・stonesPlaced）に更新`);
console.log(`  ボタン ${t.buttons.join(' / ')}  石 ${STONES.join(' / ')}`);
console.log(`  鍵 ${KEY_CELL}（関門 stonesPlaced）  宝箱 ${CHEST_CELL}  ワープ ${WARP_CELL}  鍵扉 ${t.doors.join(' / ')}`);
console.log('  before / after:');
for (let i = 0; i < ROWS; i++) {
  const a = before[i] ?? '';
  const b = grid[i].join('');
  console.log(`   ${String(i).padStart(2)} ${a}   ${a === b ? '=' : '→'}   ${b}`);
}

if (DRY) {
  console.log('\n--dry: 書き込みなし');
} else {
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
  console.log('\n書き込み完了:', MAP_PATH);
}
