#!/usr/bin/env node
/**
 * migrate-field-delta-o.mjs  (Phase 9-6 ④ — 深洋O デルタ上半 D1〜D5)
 *
 * 沈んだ都のデルタ（三角州）の上半5画面を作り込む。設計は FIELD-9-6-DESIGN.md
 * §19-11-G（2026-07-29 確定）。廊下 C1〜C4 が「潮ゲートの段階的難化」だったのに対し、
 * 上半は **1画面1道具の使い分け**（既得道具の総復習）＝到達時 O=7 で
 * はしご・弓・爆弾・ロウソク・ブーメラン・笛すべて所持済み（§8-1）。
 *
 *   D1 `14,16` 脇   … 爆弾壁 '!'（secret：壊した先に報酬）
 *   D2 `15,16` 玄関 … はしご水渡り（route/landmark：廊下から降りた者が最初に見る「都」）
 *   D3 `13,17`      … 弓ゲート（対岸の 'Y' を矢で叩く→潮が引く。secret）
 *   D4 `14,17` 中央 … 石押し '*'（route：4辺すべてデルタ内部の交差点）
 *   D5 `15,17`      … ブーメラン運搬（かがり火 'H' に炎を運ぶ→torchesLit で報酬・landmark）
 *
 * 海の主 `12,19`（ボス闘技場）は下半（キュー4番）で作る。上半には敵ゼロ（§19-8 分離原則）。
 *
 * ── 5道具それぞれの「実コードで裏取りした制約」（§19-11-G 🔑・設計前に全部確認）──
 *  1. 弓ゲート＝'Y' を水/壁で隔離し、矢が飛ぶ1レーンだけ開ける。projectile.js
 *     isTilePassableForProj は WALL と未破壊 '!' **だけ** 遮る＝矢は水も潮ゲートも
 *     飛び越える（水越しの弓ゲートは成立）。逆に 'Y' に隣接して立てると剣で叩けて
 *     弓の意味が消える∴隔離が要る。成否は下記ソルバー（arrowReach）で見る。
 *  2. 'Y' に switchOn 封印を紐づけない（showConditions.switchOn は switchStates＝'S'
 *     のみを見る）。'Y' の報酬は「開けた者だけが届く」で守る。
 *  3. 爆弾壁 '!' ＝wallBroken で封印できる唯一の道具。breakPower 3・AOE 半径2の円
 *     （projectile.js explodeBomb）。データは stage.breakableWalls[posKey]={breakDef:N}。
 *     未破壊の '!' は矢とブーメランも遮る＝弓ゲートと同じ画面に置くとレーンを塞ぐ。
 *  4. はしご水渡り＝isLadderCrossable は **進入軸** の橋だけ許す（縦連続水を縦に
 *     渡れない核心）。橋脚 isLadderBank は「水でない・LADDER_OVER でない・tilePassable」。
 *     裏返しが assertNoLadderBypass＝意図しない幅1の水は全部 throw。
 *  5. ブーメラン運搬＝かがり火2本以上＋torchesLit 封印、かつ spawn 時点で未充足。
 *     火元1本を initLitTorches で先に点け、未点灯1本以上を残す（全部点けると
 *     「何もしなくても緑」になる）。torchesLit は画面上の全 'H' 点灯を要求＝飾りの
 *     かがり火を置けない。'H' は passable:false＝ARRIVAL_WALL_TILES にも入る＝
 *     継ぎ目の境界セルには置けない。
 *  6. 石押し＝全探索ソルバー必須。ボタン上の石は再入時に復元される
 *     （game.js enterStage の solvedStonePositions）。
 *
 * ── ⑥-footprint は ⑥-landing（2026-07-29）で失効（§19-11-G 🔑）───────────────
 * 着地は整数セル（境界セルそのもの）になったので「継ぎ目の1つ内側を空ける」制約は
 * もう無い。∴デルタ上半は継ぎ目の1つ内側に石・'Y'・看板・'h'・'H' を置いてよい。
 * assertNoFootprintWall は流用しない（使うと失効した制約で設計を縛る）。
 * 境界セルの開閉が両側で一致すること（arrival-wall ガード）だけは残す。
 *
 * ── 接続の作法（§19-11-G ⑤）──────────────────────────────────────────────
 * デルタへの入口は `15,16` の北 cols5,6 だけ（廊下 C4 `15,15` の南出口とミラー）＝
 * ここは変えない（field-corridor-o.spec.js の ⑥-footprint 連鎖テストの条件）。
 * デルタ内部の縦横シームは全開・外周は §19-11-F で封鎖済み＝触るのは内部シームだけ。
 *
 * Usage (run from outputs/blade-of-lumia/):
 *   node scripts/migrate-field-delta-o.mjs --dry    # print final screens, no write
 *   node scripts/migrate-field-delta-o.mjs          # write work/blade-of-lumia.json
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

// デルタ上半5画面。下半9画面は次回（キュー4番）。
const DELTA_UPPER = ['14,16', '15,16', '13,17', '14,17', '15,17'];

// デルタへの唯一の入口（C4 `15,15` の南出口 cols5,6 とミラー）。ここは変えない。
const ENTRANCE = { screen: '15,16', side: 'N', cols: [5, 6] };

// ── 画面仕様 ──────────────────────────────────────────────────────────────
// bg    : 10行×12列。'~' 海 / 'o' 石畳（歩ける・沈んだ都の舗装）。
// tiles : 10行×12列。'.' 床 / '=' 潮ゲート / 'Y' スイッチ / 'S' ボタン / '*' 石 /
//         '!' 爆弾壁 / 'H' かがり火 / 'B' 宝箱 / 'h' 崩れ壁 / 'p' 屋根 / 'i' 石碑。
// links : [switchId, [gateId...]]。'=' は必ずどれかの links に載ること。
// break : { posKey: breakDef } 爆弾壁の硬さ。
// torch : { lit:[posKey...] } initLitTorches で先に点ける火元。
// solve : 検証メモ（closed/open で届くべきセル）。
// ⚠️ 設計の核心（実コードで裏取り・DECISIONS 2026-07-29 デルタ上半）:
// ratchet の接続歩行 fieldHonestMetrics → bfsLayer は **withLadder なし** で歩く。
// ∴「はしごを渡らないと反対側へ行けない」内部水路を作ると、その先が reached から
// 落ちて W1/orphan/under-2-axis が悪化する。道具ゲート（'='/'!'/'Y'/'H'/はしご渡り）は
// **本線にできない**＝本線は必ず外周リングの陸で担保し、道具の先は本線から外れた
// **secret（報酬）** に限る。各画面の外周リング（row0/row9/col0/col11）は現状の
// 開閉を保持（§19-11-G ⑤「触るのは内部シームだけ・外境界は動かさない」）＝
// bg のリング列は live データからそのままコピーしている。触るのは内部 rows1-8/cols1-10。
const SCREENS = {
  // ══ D2 `15,16` デルタ玄関（はしご水渡り）════════════════════════════════════
  // 廊下を降りた者が最初に見る「沈んだ都」。北 cols5,6 が唯一の入口（C4 とミラー）。
  // 本線＝外周リングの陸（col0-1・col9 の陸柱で上下が繋がる・現状不変）。内部の
  // 水面(cols2-8)に浮かぶ中州へ **はしご幅1橋** で渡ると宝＝secret。ランドマーク＝
  // 崩れた大門 'h'（袖）＋残った屋根 'p'（石畳 'o' は下地と同色で見えないので tiles で）。
  '15,16': {
    role: 'D2 デルタ玄関（はしご水渡り）',
    // リング固定（live）: N[~~~~~gg~~~~~] S[col0-10陸,col11水] W[row0水,他陸] E[全水]。
    // 内部 col1・col9-10 の陸で row1↔row8 が繋がる本線を残す。col1 陸から東へ突き出す
    // 陸の桟橋 finger(4,2)→はしご橋(4,3 横水)→中州(4,4)(4,5)。中州は幅2水で隔離。
    bg: [
      '~~~~~gg~~~~~',
      'ggggggggggg~',
      'gg~~~~~~~gg~',
      'gg~~~~~~~gg~',
      'ggg~gg~~~gg~',
      'gg~~~~~~~gg~',
      'gg~~~~~~~gg~',
      'gg~~~~~~~gg~',
      'ggggggggggg~',
      'ggggggggggg~',
    ],
    // 桟橋 finger(4,2)から はしご橋(4,3=横水・左右が陸) を渡って中州(4,4)(4,5)へ。
    // 着地(4,4)は空き陸・宝(4,5)。入口 row1 は開けたまま（幅1の南北backbone col1 と繋ぐ）。
    // ランドマークは 2 幅の迂回が効く所だけ: 崩れ門 'h' は南 row8 cols4,7（迂回 row9）、
    // 屋根 'p' は西 col0 の(2,0)（迂回 col1）。看板 'i' は西backbone(3,1)。
    tiles: [
      '............',
      '............',
      'p...........',
      '.i..........',
      '.....B......',
      '............',
      '............',
      '............',
      '....h..h....',
      '............',
    ],
    links: [],
    // (4,3) は横の幅1水＝はしご橋（設計上許可）。中州の宝はここを渡らないと届かない。
    ladderBridges: ['4,3'],
    chest: { pos: '4,5', content: { type: 'rupee', value: 30, name: 'ルピー×30' } },
    sign: {
      pos: '3,1',
      name: '沈んだ 都の 門',
      lines: [
        'ここは かつて 栄えた',
        '海底 都市 ルミアの 玄関。',
        'はしごで 渡れる 中州に 宝あり。',
      ],
    },
    solve: {
      entryCells: ['1,5', '1,6'],
      mustReach: ['4,4', '8,5', '8,6'],
    },
  },

  // ══ D1 `14,16` 脇（爆弾壁）══════════════════════════════════════════════════
  // D2 の西隣。本線＝リング陸（col1 の陸柱・row1・row8-9）。内部の中州(rows2-7)を
  // 爆弾壁 '!' で封じ、壊した先に宝＝secret。'!' は AOE 半径2＝隣の陸から届く。
  '14,16': {
    role: 'D1 脇（爆弾壁）',
    // リング固定（live 完全一致）: N[全水] S[col0水] W[全水] E[col11 row0水/他陸]。
    // col1 陸柱で row1↔row8 の本線。内部は大水面のまま、col1 から突き出す1セル陸
    // ポケット(4,3) を '!'(4,2) で封じる＝爆弾でだけ入れる secret。
    bg: [
      '~~~~~~~~~~~~',
      '~ggggggggggg',
      '~g~~~~~~~~gg',
      '~g~~~~~~~~gg',
      '~gggg~~~~~gg',
      '~g~~~~~~~~gg',
      '~g~~~~~~~~gg',
      '~g~~~~~~~~gg',
      '~ggggggggggg',
      '~ggggggggggg',
    ],
    // ポケット(4,3)は '!'(4,2) の背後＝爆弾で壊すまで col1 本線から入れない。
    // 崩れ壁 'h' で廃墟感（landmark）。
    tiles: [
      '............',
      '.......h....',
      '............',
      '............',
      '..!B........',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
    break: { '4,2': 2 },
    chest: { pos: '4,3', content: { type: 'rupee', value: 30, name: 'ルピー×30' } },
    sign: null,
    solve: {
      entryCells: ['1,10', '8,1'],
      mustReach: ['4,3', '9,5', '9,6'],
    },
  },

  // ══ D3 `13,17`（弓ゲート）══════════════════════════════════════════════════
  // D4 の西隣（東 → D4）。本線＝リング陸。対岸の 'Y' を矢で叩くと潮ゲートが引き、
  // 水に囲まれた宝の中州へ渡れる＝secret。'Y' は水で隔離し矢の1レーン（横）だけ通す。
  '13,17': {
    role: 'D3（弓ゲート）',
    // リング固定（live 完全一致）: N[全水] S[~+陸11] W[全水] E[col11 row0水/他陸]。
    // 本線＝col1 陸柱（rows1-8）＋row8＋col10-11 の陸ループ（外周に触れない）。
    // Y(2,6) は水で完全隔離した島＝矢でしか叩けない（歩いて剣で叩けない＝飾りでない）。
    // 宝島(5,6) は潮ゲート '='(6,6) 裏の袋小路＝Y を撃つまで不通の secret。
    // 入口 row1 は col5,6 を水にして Y の北を塞ぐ（幅2水＝はしご橋にもならない）。
    bg: [
      '~~~~~~~~~~~~',
      '~gggg~~ggggg',
      '~g~~~~g~~~gg',
      '~g~~~~~~~~gg',
      '~g~~~~~~~~gg',
      '~g~~~~g~~~gg',
      '~g~~~~g~~~gg',
      '~g~~~~g~~~gg',
      '~ggggggggggg',
      '~ggggggggggg',
    ],
    // Y(2,6) を col1 の陸柱(2,1)から東へ撃って叩く（間の(2,2)〜(2,5)は水＝矢は越える）。
    // '='(6,6) が引くと row8→(7,6)→gate→(5,6) の宝島へ。'h'(8,8) は廃墟の landmark。
    tiles: [
      '............',
      '............',
      '......Y.....',
      '............',
      '............',
      '......B.....',
      '......=.....',
      '............',
      '........h...',
      '............',
    ],
    links: [['2,6', ['6,6']]],
    chest: { pos: '5,6', content: { type: 'item', item: 'healPotion', name: '回復薬（小）' } },
    show: null, // 'Y' はトグル＝switchOn 封印は効かない（罠2）。報酬は到達で守る。
    sign: null,
    solve: {
      entryCells: ['4,11', '9,6'],
      arrowReach: '2,6',
      mustReach: ['5,6'],
    },
  },

  // ══ D4 `14,17` 中央（石押し）════════════════════════════════════════════════
  // 4辺すべてデルタ内部の交差点。本線＝リング陸（全周ほぼ陸）。中央の中州(rows2-7)を
  // 潮ゲートで封じ、石をボタン S へ押して開けると宝＝secret。石押しは全探索で詰み検査。
  '14,17': {
    role: 'D4 中央（石押し）',
    // リング固定（live 完全一致）: (0,0)のみ水・他は外周ほぼ全陸の交差点。col0-1/col10-11
    // 陸・row1/row8-9 陸＝本線は全周で担保。内部に「水で囲った陸の袋(rows4-5,cols5,6)」を
    // 作り、下の潮ゲート(6,5)(6,6)でだけ入れる secret。北の水を2行にして row1 からの
    // はしご渡り（幅1水）を封じる。石押し床＝row7 の陸棚（col1↔col10 に繋がる）。
    bg: [
      '~ggggggggggg',
      'gggggggggggg',
      'gg~~~~~~~~gg',
      'gg~~~~~~~~gg',
      'gg~~~gg~~~gg',
      'gg~~~gg~~~gg',
      'gg~~~gg~~~gg',
      'gggggggggggg',
      'gggggggggggg',
      'gggggggggggg',
    ],
    // 袋(rows4-5,cols5,6)の宝を潮ゲート '='(6,5)(6,6) で封じる。石 '*'(7,4) を陸棚 row7 で
    // 西のボタン S(7,2) へ押し込むと潮が引く。'h'(2,0) は廃墟の landmark。
    tiles: [
      '............',
      '............',
      'h...........',
      '............',
      '......B.....',
      '............',
      '.....==.....',
      '..S.*.......',
      '............',
      '............',
    ],
    links: [['7,2', ['6,5', '6,6']]],
    chest: { pos: '4,6', content: { type: 'rupee', value: 40, name: 'ルピー×40' } },
    show: { pos: '4,6', cond: { trigger: 'switchOn', switchId: '7,2', message: '≋ 潮が 引いた！中州の 箱が 現れた！' } },
    sign: null,
    solve: {
      entryCells: ['0,5', '9,6', '5,11', '5,0'],
      pushToButton: true,
      mustReach: ['4,6'],
    },
  },

  // ══ D5 `15,17`（ブーメラン運搬・かがり火）════════════════════════════════════
  // 玄関の南隣（北 → D2）・西 → D4。本線＝リング陸。廃祠の3本のかがり火 'H' に
  // 炎を運ぶ→torchesLit で宝＝secret。火元1本を initLitTorches で点け、残り2本を
  // ブーメランで点ける。崩れ壁 'h' で廃祠のランドマーク。
  '15,17': {
    role: 'D5（ブーメラン運搬・かがり火）',
    // リング固定（live）: N[col0-10陸,col11水] S[同] W[全陸] E[全水]。col0-1 陸柱＋
    // row0-1/row8-9 で本線。かがり火は内部の廃祠(row6-7)＝継ぎ目境界に置かない。
    // 廃祠(石畳 'o')＝cols4-6 rows5-7 の 3×3。左右の水濠は幅2（col2,3／col7,8）＝
    // はしご渡り不可。南 row8 の全陸で本線に接続（南から歩いて入れる）。
    bg: [
      'ggggggggggg~',
      'ggggggggggg~',
      'gg~~~~~~~gg~',
      'gg~~~~~~~gg~',
      'gg~~~~~~~gg~',
      'gg~~ooo~~gg~',
      'gg~~ooo~~gg~',
      'gg~~ooo~~gg~',
      'ggggggggggg~',
      'ggggggggggg~',
    ],
    // かがり火は col5 の縦一列 (5,5)(6,5)(7,5)。火元は最奥 (5,5) を initLitTorches で点灯、
    // 手前 (6,5)(7,5) は未点灯。プレイヤーは南 (8,5) から**上**へブーメランを投げると、
    // 往路で火元 (5,5) の炎を拾い（射程3で丁度届く）、復路で (6,5)(7,5) を灯す＝1投で全灯。
    // 崩れ壁 'h'(5,4)(5,6) は廃祠の landmark（石畳上）。宝箱は torchesLit 封印。
    tiles: [
      '............',
      '............',
      '............',
      '............',
      '............',
      '....hHh.....',
      '.....H......',
      '.....H......',
      '............',
      '......B.....',
    ],
    torch: { lit: ['5,5'] },
    chest: { pos: '9,6', content: { type: 'rupee', value: 50, name: 'ルピー×50' } },
    show: { pos: '9,6', cond: { trigger: 'torchesLit', message: '≋ かがり火が すべて 灯った！箱が 現れた！' } },
    sign: null,
    solve: {
      entryCells: ['0,5', '0,6', '4,1'],
      torchesToLight: ['6,5', '7,5'],
      mustReach: ['9,6'],
    },
  },
};

// ── 画面の組み立て ────────────────────────────────────────────────────────
const parseGrid = (rows, key, what) => {
  if (rows.length !== ROWS) throw new Error(`${key}: ${what} は ${ROWS} 行必要（${rows.length} 行）`);
  return rows.map((line) => {
    if (line.length !== COLS) throw new Error(`${key}: ${what} の行幅が ${COLS} でない: "${line}"`);
    return line.split('');
  });
};

/** エンジンと同じ畳み込みで見た「そのセルの実効タイル」。 */
const effTile = (tiles, bg, r, c) => (bg[r]?.[c] === W ? W : tiles[r]?.[c]);

/** はしごで 1セル幅の水を渡ってパズルを迂回できないこと（passable.js と同じ判定）。 */
function assertNoLadderBypass(tiles, bg, key, allow = new Set()) {
  const bank = (r, c) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (bg[r][c] === W) return false;
    const ch = tiles[r][c];
    return !isHardBlocked(ch) && ch !== TILE.TIDE_GATE;
  };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (bg[r][c] !== W) continue;
    if (allow.has(`${r},${c}`)) continue;   // 設計上の橋（はしご渡りが芯の画面）
    if (bank(r, c - 1) && bank(r, c + 1))
      throw new Error(`${key}: (${r},${c}) の水が横1セル幅＝はしごで意図せず渡れる`);
    if (bank(r - 1, c) && bank(r + 1, c))
      throw new Error(`${key}: (${r},${c}) の水が縦1セル幅＝はしごで意図せず渡れる`);
  }
}

const ENEMY_SET = new Set(ENEMY_TILES);

/**
 * 画面のパズルを検査する（9-6 の2大原則の実体）：
 *   ① 入口セルから、solve.mustReach の全セルへ **実手順で** 届く
 *   ② どの到達状態からも画面外（exitCells）に出られる（＝入って詰まない）
 *   ③ ゲート/壁/かがり火を道具で操作しないと mustReach に届かない（＝飾りでない）
 * @returns {{states, playerCells}}
 */
function verifyPuzzle(tiles, bg, spec, key) {
  const links = spec.links ?? [];
  const breakDefs = spec.break ?? {};
  const litInit = new Set(spec.torch?.lit ?? []);
  const S = makeSolver(tiles, bg, links, breakDefs, litInit);
  if (!S.exitCells.length) throw new Error(`${key}: 出入りできる外周セルが無い`);

  const entryCells = spec.solve?.entryCells ?? S.exitCells;
  const starts = entryCells.map((cell) => {
    const [r, c] = cell.split(',').map(Number);
    if (bg[r][c] === W || isHardBlocked(tiles[r][c]))
      throw new Error(`${key}: entryCell ${cell} が水/壁の上`);
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

  // ② どの到達状態からも exitCells に立つ状態へ行けること。
  const escapes = new Set();
  const rq = [];
  for (const st of seen) {
    if (S.exitCells.includes(st.split('|')[0])) { escapes.add(st); rq.push(st); }
  }
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

  const playerCells = new Set([...seen].map((st) => st.split('|')[0]));

  // ① mustReach の全セルへ届くこと。
  for (const cell of spec.solve?.mustReach ?? []) {
    if (!playerCells.has(cell)) throw new Error(`${key}: mustReach ${cell} に実手順で届かない`);
  }

  // ③ 道具を使わないと mustReach に届かないこと（飾りでない）。
  //   links 無し・爆弾/弓/はしご/ブーメランを封じたソルバーで mustReach に届いたら飾り。
  //   ここでは「潮ゲート/爆弾壁/かがり火封印を一切操作せず」の到達で判定する。
  const noTool = makeSolver(tiles, bg, [], breakDefs, litInit, { hasLadder: false, noTools: true });
  const noToolStart = entryCells.map((cell) => {
    const [r, c] = cell.split(',').map(Number);
    return noTool.encode(r, c, noTool.initStones, 0, 0, noTool.litInitMask);
  });
  const ntSeen = new Set(noToolStart);
  const ntq = [...noToolStart];
  while (ntq.length) {
    const st = ntq.shift();
    for (const nx of noTool.nextStates(st)) if (!ntSeen.has(nx)) { ntSeen.add(nx); ntq.push(nx); }
  }
  const ntCells = new Set([...ntSeen].map((st) => st.split('|')[0]));
  const secretCell = spec.chest?.pos ?? spec.show?.pos ?? null;
  if (spec.solve?.torchesToLight) {
    // かがり火の宝は「物理到達」でなく「全 'H' 点灯（torchesLit）」で出現。道具無しでは
    // 火元1本しか点かない＝全点灯状態に到達できない＝箱は出ない、で守る。
    const allLitMask = (1 << noTool.torchCells.length) - 1;
    const ntAllLit = [...ntSeen].some((st) => Number(st.split('|')[4]) === allLitMask);
    if (ntAllLit)
      throw new Error(`${key}: 道具を使わず全かがり火が点く＝torchesLit パズルが飾り`);
  } else if (secretCell && spec.solve && (spec.solve.arrowReach || spec.break || links.length)) {
    // それ以外（弓/爆弾/石押し）の secret は物理到達で守る。
    if (ntCells.has(secretCell))
      throw new Error(`${key}: 道具を使わずに報酬 ${secretCell} へ届く＝パズルが飾り`);
  }

  return { states: seen.size, playerCells };
}

function buildScreen(key, spec) {
  const bgRaw = parseGrid(spec.bg, key, 'bg');
  const tiles = parseGrid(spec.tiles, key, 'tiles');
  const bgChars = new Set([W, O, 'g', 'd']);
  for (const row of bgRaw) for (const ch of row)
    if (!bgChars.has(ch)) throw new Error(`${key}: bg に使えない文字 '${ch}'`);

  // 戦闘ゼロ（§19-8 分離原則）。
  for (const row of tiles) for (const ch of row)
    if (ENEMY_SET.has(ch)) throw new Error(`${key}: デルタ上半は戦闘ゼロのはず（敵 '${ch}'）`);

  const bg = bgRaw;   // デルタは渚 'd' を塗らない（都の石畳/草地をそのまま使う）

  // 罠①: '=' の下地が水だと開いても永久に通れない。
  const gateCells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (tiles[r][c] !== TILE.TIDE_GATE) continue;
    gateCells.push(`${r},${c}`);
    if (bg[r][c] === W)
      throw new Error(`${key}: 潮ゲート (${r},${c}) の下地が水（isWaterAt が先に効いて永久に不通）`);
  }
  // content は陸の上だけ。かがり火 'H'・爆弾壁 '!' は水の上に置けない（passable:false だが
  // bg 水だと二重に不通＝設計ミス）。
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = tiles[r][c];
    if (ch === '.' || ch === TILE.TIDE_GATE) continue;
    if (bg[r][c] === W) throw new Error(`${key}: '${ch}' (${r},${c}) が水の上`);
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

  // 爆弾壁: break のキーが '!' タイルの上にあること。
  for (const pk of Object.keys(spec.break ?? {})) {
    const [r, c] = pk.split(',').map(Number);
    if (tiles[r]?.[c] !== TILE.BREAKABLE_WALL)
      throw new Error(`${key}: break ${pk} が '!' タイルでない（=${tiles[r]?.[c]}）`);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
    if (tiles[r][c] === TILE.BREAKABLE_WALL && !(spec.break && spec.break[`${r},${c}`]))
      throw new Error(`${key}: '!' (${r},${c}) の breakDef が未定義`);

  // かがり火: 火元（initLitTorches）が画面内の 'H' の上にあること・全 'H' が消えてないこと。
  const torchCells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
    if (tiles[r][c] === TILE.TORCH) torchCells.push(`${r},${c}`);
  const litInit = spec.torch?.lit ?? [];
  for (const pk of litInit) {
    const [r, c] = pk.split(',').map(Number);
    if (tiles[r]?.[c] !== TILE.TORCH) throw new Error(`${key}: initLitTorches ${pk} が 'H' でない`);
  }
  if (torchCells.length && litInit.length === 0)
    throw new Error(`${key}: かがり火があるのに火元（initLitTorches）が無い（点けられない）`);
  if (torchCells.length && litInit.length >= torchCells.length)
    throw new Error(`${key}: 全かがり火が初期点灯＝torchesLit が spawn 時に充足（何もせず緑）`);

  // 継ぎ目の境界セルに 'H' を置かない（ARRIVAL_WALL_TILES／§19-11-G 罠5）。
  for (const cell of torchCells) {
    const [r, c] = cell.split(',').map(Number);
    if (isRing(r, c)) throw new Error(`${key}: かがり火 (${cell}) が継ぎ目の境界セル`);
  }

  // はしご迂回: D2 は設計上の橋を allow で許す。他画面は幅1水を作らない。
  assertNoLadderBypass(tiles, bg, key, new Set(spec.ladderBridges ?? []));

  // 実手順の全探索。
  const { states, playerCells } = verifyPuzzle(tiles, bg, spec, key);

  // 宝箱は実手順のどこかで踏めること（B は passable）。
  if (spec.chest) {
    const [cr, cc] = spec.chest.pos.split(',').map(Number);
    if (tiles[cr][cc] !== 'B') throw new Error(`${key}: chest ${spec.chest.pos} が 'B' でない`);
    if (!playerCells.has(spec.chest.pos)) throw new Error(`${key}: 宝箱 ${spec.chest.pos} に実手順で届かない`);
  }
  // 看板は隣に立てること。
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

  return { tiles, bg, states };
}

// ── 実行 ──────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

for (const k of DELTA_UPPER) {
  if (!field[k]) throw new Error(`missing delta stage ${k}`);
  if (!SCREENS[k]) throw new Error(`delta screen ${k} has no spec`);
  if (field[k].rows !== ROWS || field[k].cols !== COLS)
    throw new Error(`unexpected size on ${k}: ${field[k].rows}x${field[k].cols}`);
}
for (const k of Object.keys(SCREENS)) if (!DELTA_UPPER.includes(k)) throw new Error(`bad spec key ${k}`);

let built = 0;
const solverStats = [];
const results = {};
for (const key of DELTA_UPPER) {
  const spec = SCREENS[key];
  const { tiles, bg, states } = buildScreen(key, spec);
  results[key] = { tiles, bg };
  solverStats.push(`${key} ${spec.role}: ${states} 状態を全探索（詰み 0）`);
}

// レイアウト重複（5画面が同じ絵になっていないこと）。
{
  const seen = new Map();
  for (const key of DELTA_UPPER) {
    const { tiles, bg } = results[key];
    const hash = tiles.map((row, r) => row.map((ch, c) => (bg[r][c] === W ? W : ch)).join('')).join('|');
    if (seen.has(hash)) throw new Error(`duplicate layout: ${key} == ${seen.get(hash)}`);
    seen.set(hash, key);
  }
}

const DRY = process.argv.includes('--dry');
for (const key of DELTA_UPPER) {
  const spec = SCREENS[key];
  const { tiles, bg } = results[key];
  const stage = field[key];

  if (DRY) {
    console.log(`\n=== ${key} ${spec.role} — tiles | bgTiles ===`);
    for (let r = 0; r < ROWS; r++) {
      console.log(String(r).padStart(2), tiles[r].join(''), ' ', bg[r].join(''));
    }
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
  built++;
}

if (!DRY) writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

console.log('');
for (const line of solverStats) console.log(`  ${line}`);
console.log(`\n9-6 ④ 深洋O デルタ上半: ${built} screens built${DRY ? ' [DRY — not written]' : ''}`);
