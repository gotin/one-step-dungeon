// D8 の鍵部屋を「倉庫番型②＝石4・純倉庫番（関門の上限帯）」に作り替える
// （2026-08-07 / PLAN 実行キュー 5.5g・設計は PUZZLE-DESIGN.md §7-4 #8）。
//
// 芯：部屋のボタン 'S' 4個すべてに石 '*' を乗せると showConditions(`stonesPlaced`) で
// 鍵 K(5,7) が出現する。`allSwitchesOn` を使わない理由＝D4/D6 と同じ（ボタンはモーメンタリで
// **プレイヤーが踏んでも ON** になる∴「石を3個運び、最後の1個は自分が踏む」で1手飛ばせる）。
// `stonesPlaced` は石だけを数える（game/conditions.js・refreshGates の `stonesLocked` と
// 同じ判定関数を共有）。
//
// D4（石3・純倉庫番）との違いは石の数だけ＝§3-2c の上限「3〜4」のうち4を割り当てた部屋。
// L の帯も §7-4/§7-6手順11で **40〜60（排他）** に固定（D4 20〜35／D6 34〜39 と重ねない）。
// 上限60は§7-3 Cの「必須進行路の関門」上限そのもの（23,0 の L=89 は関門には重すぎる）。
//
// 部屋の位相（PUZZLE-DESIGN §7-2）：dungeon_8 [1,0] は**孤島**＝辺で隣室と繋がらず
// ワープ `>`(7,9) で入る（d8_bosswing ↔ d8_gatehall＝[1,1](4,9) の双方向）。もう一方の
// 出口は西の鍵扉 D(4,0)(5,0)＝ボス部屋 [0,0]。∴部屋を丸ごとパズルに使える。
//
// 詰み対策（D4/D6 と同じ三段。ただし D8 は笛そのものの報酬部屋＝笛は絶対に効かない）：
//   ・ワープ `>` は**詰み救済の唯一の出口**（踏んで隣室へ出ると enterStage が未解決の石を
//     初期位置へ戻す）。∴ワープを石で塞がれると本当のハードロックになる。
//   ・そこで東列を「石が絶対に入れない安全地帯（前室）」にした。静的な帰納法で保証する
//     （generate 側の assertGeometry ②③）。本体との口は2つ（同④）。
//   ・仕上げに状態空間で実測して noEscape=0（どの到達状態からもワープへ戻れる）を確認する。
//   ・`fluteEffect:{type:'resetStones'}` も付けておく（笛は**この部屋の報酬**＝初回攻略時は
//     効かないが、笛入手後にこの部屋へ再訪したときの保険にはなる）。
//
// 敵は置かない：敵は enemy-ai.js tryEnemyPushStone で**石を押す**＝測定した倉庫番が
// 崩れる/詰む（check-dungeon-integrity.mjs の `stonesPlaced` ケースも敵が居たら error）。
// 元の盤面に居た W（森の巨人と同じボスタイル）はここで消える。
//
// ⚠️ 元の部屋には鍵が2個あった：タイル K(5,7) と floorItems['6,5']（`item:'key'`）。
//    どちらも `killAll` 関門付きだったが、敵を置かない倉庫番部屋では killAll は
//    永久に成立しない＝いずれにせよ床置きの余剰鍵。floorItems の鍵は削除する
//    （D6/D7 の同じ余剰鍵と同じ扱い＝鍵の収支を実数と一致させる）。
//
// このスクリプトは書き込む前に自分で盤面を検査する（migrate-key-room-d4/d6.mjs と
// 同じ作法）。検査は generate-key-room-d8.mjs の analyze/assertGeometry/measurePlacement を
// **そのまま import して再利用**する（規則を2箇所に書いて食い違わせない）：
//   ① 10×12 の文字配列／見た目だけの地面タイルを混ぜていない（analyze）
//   ② 外周＝孤島なので鍵扉 D(4,0)(5,0) 以外は全壁（assertGeometry ①）
//   ③ ボタン4個・鍵1個・ワープ1個・宝箱なし・ゲート T 無し・敵無し（analyze）
//   ④ 石はちょうど4個で、初期からボタン上・安全地帯・鍵セルの上に無い
//   ⑤ 安全地帯（前室）へ外から石を押し込める向きが存在しない（assertGeometry ②）
//   ⑥ 安全地帯は連結で本体との口が2つ以上（assertGeometry ③）
//   ⑦ 鍵扉の手前 (4,1)(5,1) が床（assertGeometry ④）
//   ⑧ 石ゼロ／解けた状態のどちらでもワープから鍵・扉の手前へ歩ける（assertGeometry ⑤⑥）
//   ⑨ ソルバー実測（この盤面の石配置で）：可解・L が帯 40〜60・貪欲では解けない・
//      deadlock>0・強制手率≤0.7・noEscape=0
//   ⑩ 既存のワープ(7,9)・鍵(5,7) のセルが動いていない（mapEnters のキーを付け替えずに
//      済む＝PUZZLE-DESIGN §7-2 の表と一致）／chestContents は空のまま
//
// 使い方:
//   node scripts/migrate-key-room-d8.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-key-room-d8.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { analyze, assertGeometry, measurePlacement } from './generate-key-room-d8.mjs';
import { verdict } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_8';
const ROOM  = '1,0';

// generate-key-room-d8.mjs のテンプレ v1 ＋ 逆算生成が採った石配置（3,2 / 3,4 / 6,1 / 8,4）。
// ',' は「安全地帯（前室）」の注釈で、書き込み時は床 '.' に戻す（analyze/buildTiles と同じ規則）。
const TEMPLATE = [
  '############',
  '#S...#..####',
  '#.#.#...####',
  '#.....#.,,##',
  'D..#S...#,##',
  'D..#.##K#,##',
  '#.....#.,,##',
  '#.#.#...#>##',
  '#S.....S#,##',
  '############',
];
const STONES = ['3,2', '3,4', '6,1', '8,4'];
const SAFE_MARK = ',';

// 測定の期待値（generate-key-room-d8.mjs の実測＝この盤面の素性。ズレたら error）。
const EXPECT = { L: 60, L_MIN: 40, L_MAX: 60 };

const KEY_CELL = '5,7';
const WARP_CELL = '7,9';
// 元の部屋にあった余剰の床置き鍵（削除する）。
const STRAY_KEY_CELL = '6,5';

// ── 盤面の検査（書き込み前） ───────────────────────────────────────────────
// ①〜③⑤⑥⑦⑧＝generate 側の解析器をそのまま使う
const t = analyze(TEMPLATE);
assertGeometry(t);

if (t.keyCell !== KEY_CELL) throw new Error(`鍵セルが ${KEY_CELL} でない: ${t.keyCell}`);
if (t.warp !== WARP_CELL) throw new Error(`ワープセルが ${WARP_CELL} でない: ${t.warp}`);

// ④ 石はちょうど4個・ボタン上でない・床の上・安全地帯の外・鍵の上でない
if (STONES.length !== 4) throw new Error(`石は4個（今 ${STONES.length}）`);
if (new Set(STONES).size !== STONES.length) throw new Error(`石の座標が重複している: ${STONES.join(' ')}`);
if (STONES.length !== t.buttons.length)
  throw new Error(`石 ${STONES.length} 個 ≠ ボタン ${t.buttons.length} 個`
    + '＝余った石が鍵セルの上でロックされ得る（鍵が拾えなくなる）／足りないと解なし');
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
if (m.noEscape !== 0) throw new Error(`脱出不能な状態が ${m.noEscape} 個ある＝ワープに戻れない詰み（笛はこの部屋の報酬＝未所持で入室する）`);
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
if (grid.flat().filter((ch) => ch === '*').length !== 4) throw new Error('書き込む盤面の石が4個でない');
if (grid.flat().includes(SAFE_MARK)) throw new Error(`書き込む盤面に注釈 '${SAFE_MARK}' が残っている`);

// ── 書き込み ──────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stage = data.layers?.[LAYER]?.stages?.[ROOM];
if (!stage) throw new Error(`部屋が無い: ${LAYER} [${ROOM}]`);

// ⑩ 既存の配線が新盤面のセルと一致しているか（付け替え漏れ防止）
if (!stage.mapEnters?.[WARP_CELL]) throw new Error(`mapEnters に ${WARP_CELL}（ワープ）が無い`);
if (Object.keys(stage.mapEnters).some((k) => k !== WARP_CELL))
  throw new Error(`mapEnters に新盤面と無関係なセルがある: ${Object.keys(stage.mapEnters).join(' ')}`);
if (Object.keys(stage.chestContents ?? {}).length)
  throw new Error(`chestContents が空でない: ${Object.keys(stage.chestContents).join(' ')}`
    + '（この盤面に宝箱 B は無い＝開けられない宝箱が残る）');

const before = stage.tiles.map((r) => (Array.isArray(r) ? r.join('') : String(r)));
const strayKey = stage.floorItems?.[STRAY_KEY_CELL];
stage.tiles = grid.map((r) => [...r]);       // ⚠️ 文字配列で持つ（行文字列だと実ゲームが落ちる）
stage.rows  = ROWS;
stage.cols  = COLS;
stage.links = [];                            // ゲート T が無い＝links は空配列（`{}` は refreshGates で落ちる）
stage.enemyDirs = {};                        // 敵を置かない
stage.floorItems = {};                       // 余剰の床置き鍵 (6,5) を削除
stage.showConditions = { [KEY_CELL]: { trigger: 'stonesPlaced' } };
// 笛はこの部屋の報酬そのもの＝初回攻略時は効かないが、再訪したときの保険にはなる。
stage.fluteEffect = { type: 'resetStones' };
stage.comment =
  '[key_gate D8] 倉庫番型②＝石4・純（PUZZLE-DESIGN §7-3 C / §7-4 #8 / キュー 5.5g）。'
  + `ボタン S ${t.buttons.join(' ')} の全てに石 ${STONES.join(' ')} を乗せると`
  + `showConditions(stonesPlaced) で鍵 ${KEY_CELL} が出現→西の鍵扉 D(4,0)(5,0) からボス部屋へ。`
  + 'stonesPlaced は石だけを数える（ボタンはモーメンタリでプレイヤーが踏んでも ON になるため'
  + 'allSwitchesOn では「最後の1個は自分が踏む」で1手飛ばせてしまう）。'
  + `実測 L=${m.L}（関門の上限帯 40〜60 の上限）・貪欲では解けない・deadlock=${m.deadlocks}`
  + `・強制手率=${m.forcedRatio}・最短解${m.solCount}本・状態${m.states}・脱出不能0。`
  + `東列（ワープ ${WARP_CELL} を含む前室）は石が絶対に入れない安全地帯＝`
  + '外から押し込める向きが1つも無く（幾何で保証）本体との口が2つある∴詰み救済の'
  + 'ワープを石で塞げない（笛は D8 の報酬そのものなので初回攻略時は使えない）。'
  + '敵は置かない（敵が石を押して測定した倉庫番が崩れる）。';

console.log(`# ${LAYER} [${ROOM}] を倉庫番型②（石4・stonesPlaced）に更新`);
console.log(`  ボタン ${t.buttons.join(' / ')}  石 ${STONES.join(' / ')}`);
console.log(`  鍵 ${KEY_CELL}（関門 stonesPlaced）  ワープ ${WARP_CELL}  鍵扉 ${t.doors.join(' / ')}`);
if (strayKey) console.log(`  余剰の床置き鍵 floorItems['${STRAY_KEY_CELL}'] (${JSON.stringify(strayKey)}) を削除`);
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
