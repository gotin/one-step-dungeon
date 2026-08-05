// D2 の鍵部屋を「道具型①＝ブーメランで炎を運ぶ」に作り替える
// （2026-08-05 / PLAN 実行キュー 5.5b・設計は PUZZLE-DESIGN.md §7-4）。
//
// 芯：かがり火 H は3本。1本だけ initLitTorches で点いている。
//   ブーメランは通過セルの点いた H から炎を拾い（proj.flaming）、消えた H を通ると
//   点火する（game/projectile.js collectAlongBoomerang）。∴ **火元と対象が同一直線上に
//   無いと運べない**。そこで
//     L (6,4) = 点灯済み
//     A (6,6) = L と同じ行（row6）＝ L から運べる
//     B (4,6) = A と同じ列（col6）だが L とは行も列も共有しない
//   と置く。B を点けるには A を先に点けるしかない＝**手順の順序が強制される**（段数2）。
//   トリガーは torchesLit（全 H 点灯）＝ 鍵 (5,5) が出現する。
//
// 部屋の位相（PUZZLE-DESIGN §7-2）：dungeon_2 [0,1] は「実質終端」＝入口は東
//   (4,11)(5,11) の1本だけ、もう一方の辺は鍵扉 DD(1,5)(1,6)→ボス部屋。∴内部を
//   自由に作り替えてよい（通り抜けの背骨が無い）。
//
// このスクリプトは書き込む前に自分で盤面を検査する（migrate-test-sokoban-tiers.mjs と
// 同じ作法＝「書いたデータが設計どおりか」をデータ側で担保する）：
//   ① 10×12 の文字配列
//   ② 継ぎ目（東の入口・北の鍵扉・扉の外側）が壊れていない
//   ③ H は3本・点灯済みは1本
//   ④ **炎の連鎖が強制されている**（点灯済みから直接点けられる H は1本だけ・
//      残り1本はその1本を経由しないと点けられない）
//   ⑤ 各未点灯 H について「木のブーメラン（maxRange 3）で実際に運べる立ち位置」が在る
//   ⑥ 鍵に torchesLit の関門が付いている
//   ⑦ 入口から鍵セルと鍵扉の両方へ歩ける（H は壁）
//   ⑧ tiles 層に見た目だけの地面タイル（砂地・石畳など）を混ぜていない
//      ＝見える地面は bgTiles 層で塗る（描画経路が別物・下の BOARD のコメント参照）
//
// 使い方:
//   node scripts/migrate-key-room-d2.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-key-room-d2.mjs         # 書き込み
//
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_2';
const ROOM  = '0,1';

// 木のブーメランの折り返し距離（shared/items.js BOOMERANG_TIERS[0].maxRange）。
// 実際は開始位置が player+0.5 セルなので 3 セルより少し先まで届くが、検査は
// **保守側**（3 セル以内）で行う＝実機で届かない盤面を通さない。
const BOOMERANG_RANGE = 3;

// 新しい盤面。L=(6,4) 点灯済み / A=(6,6) / B=(4,6) / 鍵=(5,5)
// 敵 C（チェイサー）は外周回廊 (2,8) に置く＝投げ位置の調整中に追われる圧を残し、
// かがり火の射線（row6 / col6）上に初期配置しない。
//
// ⚠️ **見た目（砂地・石畳）は `tiles` 層で塗らない＝`bgTiles` 層で塗る。**
//    このスクリプトは初版で祭壇室を `tiles`='d'（SAND）にしていたが、同じ砂地でも
//    描画経路が別物になる（`tiles` 層の SAND は `ANIMATED_FIELD` に入った
//    **アニメーションする前景 canvas**／`bgTiles` の 'd' は `bg-sand` クラス＋
//    CSS background-image の**静止した下地**）＝地面の意味で使うと動いて見える。
//    ∴ここでは床を `.` のままにし、`bgTiles`（ユーザーが塗った祭壇室の砂地＋鍵の
//    石畳 'o'）には一切触れない。下の検査⑧が `tiles` 層への装飾タイル混入を止める。
const BOARD = [
  '#####..#####',
  '#####DD#####',
  '#.......C..#',
  '#.#######..#',
  '#.#...H.#...',
  '#.#..K..#...',
  '#.#.H.H.#..#',
  '#.#.....#..#',
  '#..........#',
  '############',
];

// tiles 層に置いてはいけない「見た目だけの地面タイル」（塗りは bgTiles の仕事）。
// d=砂地 / g=草 / o=石畳 / s=雪 / a=灰 / m=泥
const DECOR_TILES = new Set(['d', 'g', 'o', 's', 'a', 'm']);

const LIT       = ['6,4'];         // initLitTorches
const KEY_CELL  = [5, 5];
const ENEMY_RE  = /[WECFVXZALNJOUGI]/;

// ── 盤面の検査（書き込み前） ───────────────────────────────────────────────
const grid = BOARD.map(r => r.split(''));
const ROWS = grid.length, COLS = grid[0].length;
const at = (r, c) => grid[r]?.[c];
const isWall = (r, c) => at(r, c) === undefined || at(r, c) === '#';

// ① 形
if (ROWS !== 10) throw new Error(`rows が 10 でない: ${ROWS}`);
for (const [i, row] of grid.entries()) {
  if (row.length !== 12) throw new Error(`cols が 12 でない: row ${i} = ${row.length}`);
}

// ② 継ぎ目（既存データと同じ位置に保つ）
for (const [r, c, want, why] of [
  [0, 5, '.', '扉の外側（ボス部屋へ）'], [0, 6, '.', '扉の外側（ボス部屋へ）'],
  [1, 5, 'D', '鍵扉'],                   [1, 6, 'D', '鍵扉'],
  [4, 11, '.', '東の入口'],              [5, 11, '.', '東の入口'],
]) {
  if (at(r, c) !== want) throw new Error(`継ぎ目が壊れている: (${r},${c}) は '${want}'（${why}）でなく '${at(r, c)}'`);
}

// ③ かがり火の本数と点灯状態
const torches = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (at(r, c) === 'H') torches.push(`${r},${c}`);
if (torches.length !== 3) throw new Error(`H が3本でない: ${torches.join(' ')}`);
for (const pk of LIT) {
  if (!torches.includes(pk)) throw new Error(`initLitTorches (${pk}) が H でない`);
}
if (LIT.length !== 1) throw new Error(`点灯済みは1本にする（今 ${LIT.length} 本）＝残り2本を運ぶのがパズル`);

// ④⑤ 炎を運べる関係を出す：
//   「A から B へ運べる」⟺ ある立てるセル P と向き d があり、A と B が
//   P から d 方向の距離 1..RANGE のセル上にあり、P から遠い方までの間に壁が無い。
//   （往路で火元を通れば復路で対象を点ける／逆順でも成立するので順序は問わない）
const standable = (r, c) => !isWall(r, c) && !'HYD[]()*T=|~x'.includes(at(r, c));
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function carryPositions(srcKey, dstKey) {
  const [sr, sc] = srcKey.split(',').map(Number);
  const [dr, dc] = dstKey.split(',').map(Number);
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!standable(r, c)) continue;
      for (const [dy, dx] of DIRS) {
        // P から d 方向へ RANGE セル分たどり、途中に壁が出たら打ち切る
        const seen = [];
        for (let k = 1; k <= BOOMERANG_RANGE; k++) {
          const rr = r + dy * k, cc = c + dx * k;
          if (isWall(rr, cc)) break;          // 壁は投擲物も止める
          seen.push(`${rr},${cc}`);
        }
        if (seen.includes(`${sr},${sc}`) && seen.includes(`${dr},${dc}`)) {
          out.push(`(${r},${c})→${dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right'}`);
        }
      }
    }
  }
  return out;
}

const unlit = torches.filter(t => !LIT.includes(t));
// 点灯済みから直接運べる H は「ちょうど1本」＝残り1本は連鎖でしか点かない
const fromLit = unlit.filter(t => carryPositions(LIT[0], t).length > 0);
if (fromLit.length !== 1) {
  throw new Error(`点灯済み ${LIT[0]} から直接運べる H が ${fromLit.length} 本 [${fromLit.join(' ')}]`
    + ' ← 1本にする（0本＝解けない／2本＝順序が強制されず段数が1に落ちる）');
}
const first = fromLit[0];
const second = unlit.find(t => t !== first);
if (carryPositions(LIT[0], second).length > 0) {
  throw new Error(`${second} が点灯済みから直接点けられる＝連鎖が強制されない`);
}
const chainPos = carryPositions(first, second);
if (chainPos.length === 0) {
  throw new Error(`${first} から ${second} へ運べる立ち位置が無い＝解けない盤面`);
}

// ⑥ 鍵と関門
const [kr, kc] = KEY_CELL;
if (at(kr, kc) !== 'K') throw new Error(`鍵セル (${kr},${kc}) が K でない: '${at(kr, kc)}'`);
const keyCount = BOARD.join('').split('K').length - 1;
if (keyCount !== 1) throw new Error(`K が1個でない: ${keyCount}`);
if (!ENEMY_RE.test(BOARD.join(''))) throw new Error('敵が居ない（圧が無い部屋になっている）');

// ⑦ 入口から鍵セル・鍵扉へ歩けるか（H は壁・D は通れる扱い＝鍵で開くゲート）
function walkReach(startR, startC) {
  const seen = new Set([`${startR},${startC}`]);
  const q = [[startR, startC]];
  const BLOCK = new Set(['#', 'H', 'Y', '*', 'T', '[', ']', '(', ')', '~', 'x', 'i']);
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dy, dx] of DIRS) {
      const rr = r + dy, cc = c + dx;
      const t = at(rr, cc);
      if (t === undefined || BLOCK.has(t)) continue;
      const k = `${rr},${cc}`;
      if (seen.has(k)) continue;
      seen.add(k); q.push([rr, cc]);
    }
  }
  return seen;
}
const reach = walkReach(4, 11);
for (const [r, c, why] of [[kr, kc, '鍵'], [1, 5, '鍵扉'], [1, 6, '鍵扉'], [6, 3, '1投目の立ち位置'], [7, 6, '2投目の立ち位置']]) {
  if (!reach.has(`${r},${c}`)) throw new Error(`東の入口から (${r},${c})（${why}）へ歩けない`);
}

// ⑧ 見た目だけの地面タイルを tiles 層に混ぜていないか
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (DECOR_TILES.has(at(r, c))) {
      throw new Error(`tiles 層に見た目だけの地面タイル '${at(r, c)}' がある: (${r},${c})`
        + ' ← 砂地・石畳などの塗りは bgTiles 層で行う（tiles 層の SAND はアニメーションする'
        + '前景スプライトとして描かれる＝地面に見えない）');
    }
  }
}

// ── 書き込み ──────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stage = data.layers?.[LAYER]?.stages?.[ROOM];
if (!stage) throw new Error(`部屋が無い: ${LAYER} [${ROOM}]`);

const before = stage.tiles.map(r => (Array.isArray(r) ? r.join('') : String(r)));
stage.tiles  = grid.map(r => [...r]);       // ⚠️ 文字配列で持つ（行文字列だと実ゲームが落ちる）
stage.rows   = ROWS;
stage.cols   = COLS;
stage.initLitTorches = [...LIT];
stage.showConditions = { [`${kr},${kc}`]: { trigger: 'torchesLit' } };
if (!Array.isArray(stage.links)) stage.links = [];
stage.comment =
  '[key_gate D2] 道具型①（PUZZLE-DESIGN §7-3 B / キュー 5.5b）。かがり火3本のうち '
  + `${LIT[0]} だけが点灯済み。ブーメランは通過した点灯 H から炎を拾い、消えた H を通ると `
  + `点火する∴同一直線上にしか運べない。${first} は ${LIT[0]} と同じ行＝1投で点く。`
  + `${second} は ${first} と同じ列だが ${LIT[0]} とは行も列も共有しない∴${first} を先に `
  + '点けてから投げ位置を変える2段構成になる。全点灯（torchesLit）で鍵が出現する。'
  + 'ブーメランは同ダンジョンの [1,1] 宝箱で手に入り、鍵扉はボス部屋の手前だけ'
  + '∴鍵より先に必ず取れる（ハードロックしない）。';

console.log(`# ${LAYER} [${ROOM}] を道具型①（ブーメラン×かがり火）に更新`);
console.log(`  点灯済み ${LIT[0]} → 1本目 ${first}（立ち位置 ${carryPositions(LIT[0], first).join(' / ')}）`);
console.log(`  1本目 ${first} → 2本目 ${second}（立ち位置 ${chainPos.join(' / ')}）`);
console.log(`  鍵 (${kr},${kc}) 関門 torchesLit`);
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
