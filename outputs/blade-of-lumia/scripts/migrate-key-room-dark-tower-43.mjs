// dark_tower の鍵部屋 [4,3] を「純倉庫番（石4）」にする
// （2026-08-09 / PLAN 実行キュー 5.5i）。
//
// ⚠️ 経緯（2026-08-09・ユーザーと再設計）：
//   当初「合成型（石4＋色ゲート）＝26,0 移植」→「色ゲート抜き・純倉庫番で L>60」を
//   狙ったが、旧測定手法（§2 の4軸＝全到達状態を rev グラフ付きで保持するフル BFS）が
//   石4×広い盤面で OOM＝測れないと実測判明。ユーザーと基準を再設計し **2軸だけ**に：
//     ① L（押し手数）＝逆算 pull-BFS の引き距離で測る（フル BFS 廃止＝OOM 回避）
//     ② 貪欲NG＝素朴なヒルクライムでは解けない（前向き探索だけ＝OOM しない）
//   deadlock 数・強制手率・noEscape は捨てた（全列挙が必要＝OOM の元凶）。
//   → 生成器 generate-key-room-dark-tower-43.mjs が v1（床66）で **貪欲NG かつ
//      最大 L=42（押し手数）** の配置を発見：石 4,3 / 5,8 / 6,6 / 7,7・プレイヤー初期 5,3。
//   解の存在は pull-BFS が構成的に保証（goal から引いた配置 ∴ 逆に押せば必ず解ける）。
//
// この部屋のルール：
//   ・敵なし・enemyDirs {}・floorItems {}（enemy-ai が石を押す＝測定した倉庫番が壊れる）
//   ・鍵 K(7,6) 据え置き・showConditions {"7,6":{trigger:"stonesPlaced"}}（全ボタンに石＝
//     stonesLocked と同じ判定を共有＝「最後の1個は自分が踏む」で飛ばせない）
//   ・fluteEffect {type:"resetStones"}（笛所持済み＝詰みは笛で石を初期位置へ戻して回復）
//   ・links: []・北入口(0,5)(0,6)・南鍵扉(9,5)(9,6) は不変
//
// このスクリプトは2箇所へ同一盤面を書く：
//   ① 本番 dark_tower[4,3]
//   ② test_mechanics[24,0]（＝①と1文字違わぬミラー・ユーザーが試せる正規ステージ）
// 検証ステージは fixture でなくライブマップ `test_mechanics` に置く決まり
// （DECISIONS 2026-07-25／PLAN 4.6-(4)）＝エディタで開け・プレビューで試せる。
//
// 使い方:
//   node scripts/migrate-key-room-dark-tower-43.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-key-room-dark-tower-43.mjs         # 書き込み（本番＋test ミラー）
//   TEST_KEY=24,0 node scripts/migrate-key-room-dark-tower-43.mjs  # ミラー先を変える

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { analyze, assertGeometry, buildTiles, TEMPLATES } from './generate-key-room-dark-tower-43.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dark_tower', ROOM = '4,3';
const TEMPLATE = 'v1';
const STONES = ['4,3', '5,8', '6,6', '7,7'];  // 生成器の採用配置（L=42・貪欲NG）
const KEY_CELL = [7, 6];
const ENTRY = ['0,5', '0,6'], DOOR = ['9,5', '9,6'];

// ── 生成器の規則を再利用して盤面を組む（規則を二重化しない）─────────────────
const t = analyze(TEMPLATES.find(x => x.name === TEMPLATE).template);
assertGeometry(t);

// 採用配置が生成器の幾何と矛盾しないか（石がボタン/壁/入口/鍵と重ならない）。
const stoneSet = new Set(STONES);
for (const s of STONES) {
  if (!t.floors.has(s)) throw new Error(`石 ${s} が床でない`);
  if (t.buttons.includes(s)) throw new Error(`石 ${s} が初期からボタン上（解が自明になる）`);
  if (ENTRY.includes(s) || s === t.keyCell) throw new Error(`石 ${s} が入口/鍵に重なる`);
}
if (stoneSet.size !== STONES.length) throw new Error('石の位置に重複');
if (STONES.length !== t.buttons.length) throw new Error(`石${STONES.length}個 ≠ ボタン${t.buttons.length}個`);

// buildTiles は鍵扉 'D' を壁化する（測定用）∴ここでは使わず、テンプレの生地 +
// 石 '*' を自前で置く（ボタン 'S'・鍵 'K'・扉 'D' はテンプレの文字をそのまま残す）。
const after = TEMPLATES.find(x => x.name === TEMPLATE).template.map(row => row.split(''));
const key = (r, c) => `${r},${c}`;
for (let r = 0; r < 10; r++) for (let c = 0; c < 12; c++) {
  if (stoneSet.has(key(r, c))) {
    if (after[r][c] !== '.') throw new Error(`石を置く (${r},${c}) が床 '.' でない: '${after[r][c]}'`);
    after[r][c] = '*';
  }
}

// ── 検査 ────────────────────────────────────────────────────────────────
function assertShape(board) {
  if (board.length !== 10) throw new Error(`rows が 10 でない: ${board.length}`);
  for (const [i, row] of board.entries())
    if (row.length !== 12) throw new Error(`cols が 12 でない: row ${i} = ${row.length}`);
}
const ENEMY_RE = /[WECFVXZALNJOUGI]/;

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stage = data.layers?.[LAYER]?.stages?.[ROOM];
if (!stage) throw new Error(`部屋が無い: ${LAYER}[${ROOM}]`);
const before = stage.tiles.map(r => [...r]);

assertShape(after);
// 境界（外周＝入口2セル・扉2枚を含む）を変えていないこと。
for (let r = 0; r < 10; r++) for (const c of [0, 11])
  if (before[r][c] !== after[r][c]) throw new Error(`境界セル (${r},${c}) を変更: '${before[r][c]}'→'${after[r][c]}'`);
for (const r of [0, 9]) for (let c = 0; c < 12; c++)
  if (before[r][c] !== after[r][c]) throw new Error(`境界セル (${r},${c}) を変更: '${before[r][c]}'→'${after[r][c]}'`);
// 入口・扉・鍵の据え置き。
for (const e of ENTRY) { const [r, c] = e.split(',').map(Number); if (after[r][c] !== '.') throw new Error(`入口 ${e} が床でない`); }
for (const d of DOOR) { const [r, c] = d.split(',').map(Number); if (after[r][c] !== 'D') throw new Error(`扉 ${d} が 'D' でない`); }
if (after[KEY_CELL[0]][KEY_CELL[1]] !== 'K') throw new Error(`鍵セル(${KEY_CELL})が 'K' でない`);
// 敵が居ないこと（倉庫番に敵は不可）。
if (ENEMY_RE.test(after.map(r => r.join('')).join(''))) throw new Error('敵タイルが混入');
// ボタン数＝石数。
const btnCount = after.flat().filter(x => x === 'S').length;
const stoneCount = after.flat().filter(x => x === '*').length;
if (btnCount !== 4 || stoneCount !== 4) throw new Error(`ボタン${btnCount}/石${stoneCount}（各4必要）`);

const COMMENT_43 =
  '[key_gate dark_tower] 純倉庫番・石4（PUZZLE-DESIGN §7-3 C / キュー 5.5i）。'
  + '生成器 generate-key-room-dark-tower-43.mjs v1 が発見（石 4,3/5,8/6,6/7,7）。'
  + '合格基準は再設計後の2軸＝L(押し手数)=42・貪欲NG。解の存在は逆算 pull-BFS が構成的に保証。'
  + '詰みは笛(resetStones)で石を初期位置へ戻して回復。敵なし（enemy-ai が石を押すと別物になる）。';

// ── ① 本番 dark_tower[4,3] へ書き込み ─────────────────────────────────────
stage.tiles = after;
stage.enemyDirs = {};
stage.floorItems = {};
stage.showConditions = { '7,6': { trigger: 'stonesPlaced' } };
stage.fluteEffect = { type: 'resetStones' };
stage.links = [];
stage.comment = COMMENT_43;

// ── ② test_mechanics へ同一盤面のミラーを置く（ユーザーが試せる正規ステージ）─────
//   決まり（DECISIONS 2026-07-25／PLAN 4.6-(4)）＝検証ステージは fixture でなく
//   ライブマップ `test_mechanics` レイヤーに正規ステージとして置く（エディタで開ける・
//   プレビューで試せる）。∴使い捨て HTML でなくここへ本番と1文字違わぬ盤面をミラーする。
//   ゴールも本番と同一（stonesPlaced→鍵 K(7,6) 出現）＝倉庫番の芯を挙動ごと試せる。
//   南鍵扉 DD(9,5)(9,6) は links 無し＝隣室が無くその場に留まるだけ（倉庫番の検証には不要）。
const TEST_LAYER = 'test_mechanics';
const TEST_KEY = process.env.TEST_KEY ?? '24,0';  // 20〜23,0 の倉庫番試作の並びの次
const testStages = data.layers?.[TEST_LAYER]?.stages;
if (!testStages) throw new Error(`${TEST_LAYER} レイヤーが無い`);
const testMirror = {
  comment: '[sokoban_darktower] 純倉庫番・石4（キュー 5.5i の本番 dark_tower/4,3 盤面ミラー）。'
    + 'dark_tower[4,3] と1文字違わぬ同一盤面＝ここで試すと本番と同じ挙動になる。'
    + '北入口 (0,5)(0,6) からスポーン。石4を4隅ボタンへ乗せると stonesPlaced で鍵 K(7,6) 出現。'
    + '詰みは笛(resetStones)。南鍵扉 DD は links 無し（隣室が無いだけ・パズルには無関係）。'
    + '↔ 本番 dark_tower[4,3]。片方だけ直すと乖離する（両方 migrate で同時に書く）。',
  tiles: after.map(row => [...row]),
  links: [],
  showConditions: { '7,6': { trigger: 'stonesPlaced' } },
  fluteEffect: { type: 'resetStones' },
  rows: 10,
  cols: 12,
};

console.log(`# ${LAYER}[${ROOM}] → 純倉庫番（石4・L=42・貪欲NG）`);
console.log('  before / after:');
for (let i = 0; i < 10; i++) {
  const a = before[i].join(''), b = after[i].join('');
  console.log(`   ${String(i).padStart(2)} ${a}   ${a === b ? '=' : '→'}   ${b}`);
}
console.log(`  ボタン ${btnCount} / 石 ${stoneCount} / 鍵 ${KEY_CELL} / トリガー stonesPlaced / 笛 resetStones`);
console.log(`  ミラー: ${TEST_LAYER}[${TEST_KEY}]（本番と同一盤面・${testStages[TEST_KEY] ? '既存を上書き' : '新規作成'}）`);

if (DRY) {
  console.log('\n--dry: 書き込みなし');
} else {
  testStages[TEST_KEY] = testMirror;
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
  console.log('\n書き込み完了:', MAP_PATH);
  console.log(`\n▶ 試す URL（vite dev / port 18080）:`);
  console.log(`  http://localhost:18080/blade-of-lumia/game/index.html`
    + `?fromEditor=1&layer=${TEST_LAYER}&stage=${TEST_KEY}&row=0&col=6&ps_flute=1`);
  console.log('  （または editor でレイヤー test_mechanics → ' + TEST_KEY + ' を開いてプレビュー）');
}
