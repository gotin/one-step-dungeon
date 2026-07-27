#!/usr/bin/env node
/**
 * migrate-field-corridor-o.mjs  (Phase 9-6 ⑤ — 深洋O 廊下C1〜C4 ＋ O 西外周の封鎖)
 *
 * 2つの仕事を **1回で** やる。分けられない理由が下にある。
 *
 *  (1) 廊下 C1〜C4（`15,12`〜`15,15`）を作り込む。§19-8-B のとおり戦闘ゼロ、
 *      潮ゲート '=' ＋石押し '*' だけで成立させる 1画面1テーマの4段階難化：
 *        C1 潮の教   … Y を叩く→潮が引く→渡る（機構をここで教える）
 *        C2 石で保持 … モーメンタリな S を石で押さえ続けて渡る
 *        C3 順序依存 … 石Aで開けたレーンを通して石Bを S2 まで運ぶ
 *        C4 複合     … 石で GB を保持 → 中州の Y で GA を開ける（直列）
 *      各画面は自己完結。詰んだら画面を出入りすれば石はリセットされる
 *      （game.js enterStage: 全ボタン充足時だけ solvedStonePositions で保持）。
 *
 *  (2) 深洋O の西外周（O の sy>=12 側＝廊下＋デルタ）を全周封鎖する。
 *      理由＝ユーザー確定の2点が、封鎖しないと**成立していない**：
 *        「廊下を迂回できない」… col14 の M 面（`14,12`〜`14,15`）とデルタ西面
 *          （`13,16`/`12,17`/`11,18`/`10,19`）が全部 塗り絵で開いており、
 *          廊下を通らずデルタへ歩いて入れた。
 *        「聖域は海の主が門番」… 聖域 `11,19` は北 `11,18` と西 `10,19` の
 *          両方から素通りで入れた。
 *      封鎖は「O 側＝bgTiles 水」「M/P 側＝tiles 'M'（山）」で行う。
 *      壁は **必ず両側** に入れる。片側だけだと arrival-wall＝ルール1違反
 *      （入った直後に動けない）を相手の画面に押し付けることになる。
 *
 * ── なぜ (1) と (2) を分けられないか ──────────────────────────────────────
 * 廊下だけ作ると「作った廊下を通らずデルタに行ける」ので廊下の意味が無く、
 * 封鎖だけやると「廊下が唯一の道なのに廊下が塗り絵」＝入って詰む。どちらの
 * 半分も単体では 9-6 の2大原則（全画面 playable / 入って詰まない）を満たさない。
 *
 * ── 潮ゲート '=' の 2つの罠（実装を読んで確定した事実）────────────────────
 *  ① `=` のセルに bgTiles 水を置いてはいけない。passable.js tilePassable は
 *     isWaterAt() を TIDE_GATE 判定より **先** に見るので、水の上の潮ゲートは
 *     openGates に入っても永久に通れない（見た目は開くのに歩けない最悪の形）。
 *     ∴ '=' の下地は 'o' 石畳。閉時の「水に見える」演出は render-board.js が
 *     water クラスを付けて出す（データを水にする必要は無い）。
 *  ② はしごは 1セル幅の水を渡れる（isLadderBridge）。潮ゲートは LADDER_OVER に
 *     入っていないので `=` 自体は渡れないが、**ゲートの隣に 1セル幅の水路**が
 *     あるとそこをはしごで渡ってパズルを迂回できる。∴ 水は必ず 2セル以上の幅で
 *     置く。この不変条件はスクリプト内 assertNoLadderBypass() で機械的に守る。
 *
 * ── スイッチ2種の混同は致命的（memory: blade-button-vs-switch）─────────────
 *   'Y' SWITCH … 武器で叩くトグル。ss.switchToggles。showConditions の
 *                 'switchOn' は **効かない**（あれは switchStates を見る）。
 *   'S' BUTTON … 踏んでいる間だけ ON のモーメンタリ。ss.switchStates。石で
 *                 押さえれば保持できる。'switchOn' 条件はこちらで効く。
 * ∴ C1（Y だけの画面）の宝箱は封印しない。C2/C3（S の画面）は switchOn で封印。
 *
 * Usage (run from outputs/blade-of-lumia/):
 *   node scripts/migrate-field-corridor-o.mjs --seal   # print the computed seal only
 *   node scripts/migrate-field-corridor-o.mjs --dry    # print final screens, no write
 *   node scripts/migrate-field-corridor-o.mjs          # write work/blade-of-lumia.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isHardBlocked, cellTile } from './lib/connectivity.mjs';
import { regionOf } from './lib/field-quality.mjs';
import { TILE } from '../shared/tiles.js';
import { ENEMY_TILES } from '../shared/enemies.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const ROWS = 10, COLS = 12;
const W = '~';   // bgTiles water = 海（徒歩不可。ここでは「封鎖」もこれ）
const O = 'o';   // bgTiles 石畳 = 沈んだ都の舗装（歩ける）
const D = 'd';   // bgTiles 砂  = 渚（自動計算。水に接する陸）
const MTN = TILE.MOUNTAIN;  // M/P 側の封鎖に使う壁（山地/沼地の既存語彙）

// 廊下4画面。デルタ14画面は次回（封鎖はミラーで自動継承される）。
const CORRIDOR = ['15,12', '15,13', '15,14', '15,15'];
// アームから廊下への唯一の入口（ここだけは封鎖の対象外＝O へ入る道）。
const ARM_ENTRANCE = { from: '15,12', to: '15,11' };

// ── 画面仕様 ──────────────────────────────────────────────────────────────
// bg    : 10行×12列。'~' 海 / 'o' 陸。渚 'd' は paintShore が塗る。
// tiles : 10行×12列。'.' 床 / '=' 潮ゲート / 'Y' トグル / 'S' ボタン / '*' 石 /
//         'B' 宝箱 / 'h' 立ち壁（ランドマーク）/ 'i' 石碑。
// links : [switchId, [gateId...]]。'=' は必ずどれかの links に載ること（assert）。
// solve : 実解法のメモ。closed 到達性の assert に使う cells を含む。
const SCREENS = {
  // ══ C1 `15,12` 潮の教 ════════════════════════════════════════════════════
  // 廊下の入口。北はアーム E3 の南岸が丸ごと開いているので（ミラー）row0 の
  // cols1-10 が陸＝広い渚として受ける。ここで機構を1つだけ教える：
  // 「Y を叩くと潮が引き、水だった所が渡れる」。ゲートは4セル1枚扱い（cols5,6 ×
  // rows3,4）で、渡る先に小さな報酬。ランドマークは潮門の番小屋 'h'
  // （'o' 石畳は下地と同色で見えないので使わない — memory: field-axis-met-not-noticed）。
  '15,12': {
    role: 'C1 潮の教',
    bg: [
      '~oooooooooo~',
      '~oooooooooo~',
      '~oooooooooo~',
      '~~~~~oo~~~~~',
      '~~~~~oo~~~~~',
      '~~~ooooooo~~',
      '~~~ooooooo~~',
      '~~~~~oo~~~~~',
      '~~~~~oo~~~~~',
      '~~~~~oo~~~~~',
    ],
    tiles: [
      '............',
      '.........Y..',
      '...h........',
      '.....==.....',
      '.....==.....',
      '........B...',
      '............',
      '............',
      '............',
      '............',
    ],
    links: [['1,9', ['3,5', '3,6', '4,5', '4,6']]],
    chest: { pos: '5,8', content: { type: 'rupee', value: 20, name: 'ルピー×20' } },
    // Y はトグル＝switchStates を使わないので switchOn 封印は付けない（付けても
    // 永久に開かない看板になる）。宝箱は「渡れた者だけが届く」ことで守られている。
    sign: null,
    solve: {
      // 潮が満ちている状態で「Y を叩ける位置」に立てること。
      closedMustReach: ['1,8', '2,9'],
      // 潮が引いた状態で宝箱と南出口に届くこと。
      openMustReach: ['5,8', '9,5', '9,6'],
    },
  },

  // ══ C2 `15,13` 石でボタンを保持 ══════════════════════════════════════════
  // 教わった「潮が引く」を、モーメンタリなボタン S で難しくする。踏んでいる間
  // だけ開くので、自分が乗ったままでは渡れない＝石を乗せて保持する。石を2回
  // 左へ押すだけの短い手順に絞る（テーマは「保持」1つ）。
  '15,13': {
    role: 'C2 石で保持',
    bg: [
      '~~~~~oo~~~~~',
      '~~ooooooo~~~',
      '~~ooooooo~~~',
      '~~ooooooo~~~',
      '~~~~~oo~~~~~',
      '~~~~~oo~~~~~',
      '~~ooooooo~~~',
      '~~ooooooo~~~',
      '~~~~~oo~~~~~',
      '~~~~~oo~~~~~',
    ],
    tiles: [
      '............',
      '............',
      '..S.*.......',
      '............',
      '.....==.....',
      '.....==.....',
      '.......B....',
      '............',
      '............',
      '............',
    ],
    links: [['2,2', ['4,5', '4,6', '5,5', '5,6']]],
    chest: { pos: '6,7', content: { type: 'item', item: 'healPotion', name: '回復薬（小）' } },
    show: { pos: '6,7', cond: { trigger: 'switchOn', switchId: '2,2', message: '≋ 潮が 引いた！沈んでいた 箱が 現れた！' } },
    sign: null,
    solve: {
      closedMustReach: ['2,5', '1,2'],       // 石の右に立てる／S まで歩ける
      openMustReach: ['6,7', '9,5', '9,6'],
    },
  },

  // ══ C3 `15,14` 順序依存 ══════════════════════════════════════════════════
  // 「保持」を2つ重ねる。石Aを S1（1,2）まで押すと col8 の縦レーン（GA=3,8/4,8）が
  // 開く。そのレーンは **通り道ではなく石Bの通路** で、B を S2（5,8）まで押し下げると
  // 出口 GB が開く。B は GA が開くまで1マスも下がれない（押し先が不通）＝順序が
  // 機構として強制される。両ボタンが石で埋まる＝再入しても解けたまま（game.js
  // enterStage の solvedStonePositions）。
  //
  // 初稿は静的 BFS では全部緑だったが、ソルバーが実手順で詰みを見つけた:
  // 石Bの上（1,8）へ回り込む唯一の道が row2 で、そこを通ると B が右へ押し出されて
  // レーン col8 から永久に外れた（押し戻す手が無い）。∴ 直したのは2点──
  //   ・回り込みは row1（石の無い行）に移し、B の右 (2,9) を水にして横押しを封じた
  //   ・降り道 col7 をレーン col8 の隣に足した（B が S2 に載ると col8 が塞がるので、
  //     これが無いとプレイヤーが 4,8 で行き止まりになる）
  '15,14': {
    role: 'C3 順序依存',
    bg: [
      '~~~~~oo~~~~~',
      '~~oooooooo~~',
      '~~ooooooo~~~',
      '~~~~~~~oo~~~',
      '~~~~~~~oo~~~',
      '~~~ooooooo~~',
      '~~~ooooooo~~',
      '~~~~~oo~~~~~',
      '~~~~~oo~~~~~',
      '~~~~~oo~~~~~',
    ],
    tiles: [
      '............',
      '..S..*......',
      '........*...',
      '........=...',
      '........=...',
      '........S...',
      '...B........',
      '.....==.....',
      '.....==.....',
      '............',
    ],
    links: [
      ['1,2', ['3,8', '4,8']],                // S1（石A）→ 縦レーン GA
      ['5,8', ['7,5', '7,6', '8,5', '8,6']],  // S2（石B）→ 出口 GB
    ],
    chest: { pos: '6,3', content: { type: 'rupee', value: 30, name: 'ルピー×30' } },
    show: { pos: '6,3', cond: { trigger: 'switchOn', switchId: '5,8', message: '≋ 二つの 潮が 引いた！箱が 現れた！' } },
    sign: null,
  },

  // ══ C4 `15,15` 複合（石保持＋Yトグルの直列）═══════════════════════════════
  // 廊下の締め。石で GB を開けて中州へ渡り、中州の Y で GA を開けて出る＝
  // 2枚の潮ゲートが直列。GB を渡る前に Y には届かないので、順序も強制される。
  // 報酬は物ではなく 海の石碑（デルタ導入のロア）。
  '15,15': {
    role: 'C4 複合',
    bg: [
      '~~~~~oo~~~~~',
      '~~oooooooo~~',
      '~~oooooooo~~',
      '~~~~~oo~~~~~',
      '~~~~~oo~~~~~',
      '~~~ooooooo~~',
      '~~~ooooooo~~',
      '~~~~~oo~~~~~',
      '~~~~~oo~~~~~',
      '~~~~~oo~~~~~',
    ],
    tiles: [
      '............',
      '..S..*......',
      '............',
      '.....==.....',
      '.....==.....',
      '...Y....i...',
      '............',
      '.....==.....',
      '.....==.....',
      '............',
    ],
    links: [
      ['1,2', ['3,5', '3,6', '4,5', '4,6']],   // S（石）→ GB（前半）
      ['5,3', ['7,5', '7,6', '8,5', '8,6']],   // Y（トグル）→ GA（後半）
    ],
    chest: null,
    sign: {
      pos: '5,8',
      name: '潮 廊 (しおろう) の 果て',
      lines: [
        '潮の 廊を 越えた 者よ。',
        'この先は 沈んだ 都の 中枢 (ちゅうすう)。',
        '海の 主が 門を 守って いる。',
      ],
    },
    solve: {
      closedMustReach: ['1,6', '1,3'],       // 石の右に立てる／S まで歩ける
      openMustReach: ['5,3', '5,7', '9,5', '9,6'],
    },
  },
};

// ── 封鎖の計算 ────────────────────────────────────────────────────────────
const crossingsOf = (sx, sy, r, c) => {
  const out = [];
  if (r === 0) out.push([`${sx},${sy - 1}`, ROWS - 1, c]);
  if (r === ROWS - 1) out.push([`${sx},${sy + 1}`, 0, c]);
  if (c === 0) out.push([`${sx - 1},${sy}`, r, COLS - 1]);
  if (c === COLS - 1) out.push([`${sx + 1},${sy}`, r, 0]);
  return out;
};
const isRing = (r, c) => r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;

/** O の「廊下＋デルタ」＝ sy>=12 の O 画面。ここが封鎖の内側。 */
function ownedScreens(field) {
  return new Set(Object.keys(field).filter((k) => {
    const sy = Number(k.split(',')[1]);
    return regionOf(k) === 'O' && sy >= 12;
  }));
}

/**
 * 封鎖セル集合を求める。
 *  step1: 内側↔外側の crossing を全部閉じる（アーム入口だけ除外）。両側に入れる。
 *  step2: 固定点まで伝播。片側が壁で相手が開いているセルは相手も壁にする
 *         （＝ arrival-wall を1つも残さない）。authored 画面の壁もここで外へ伝播する。
 * @returns {Map<string, Set<string>>} stageKey → 'r,c' の集合
 */
function computeSeal(field, owned, isWalledNow) {
  const closed = new Map();
  const add = (k, r, c) => {
    if (!closed.has(k)) closed.set(k, new Set());
    const s = closed.get(k);
    const id = `${r},${c}`;
    if (s.has(id)) return false;
    s.add(id);
    return true;
  };
  const queue = [];
  for (const k of owned) {
    const [sx, sy] = k.split(',').map(Number);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!isRing(r, c)) continue;
      for (const [nk, nr, nc] of crossingsOf(sx, sy, r, c)) {
        if (!field[nk]) continue;                 // 地図外 → エンジンはクランプ（安全）
        if (owned.has(nk)) continue;              // 内側どうし → 廊下の道
        if (k === ARM_ENTRANCE.from && nk === ARM_ENTRANCE.to) continue;  // O への唯一の入口
        if (add(k, r, c)) queue.push([k, r, c]);
        if (add(nk, nr, nc)) queue.push([nk, nr, nc]);
      }
    }
  }
  // authored 画面が自分で作った壁も外へ伝播させる（例: C4 の row9 は cols5,6 だけ
  // 開くので、南隣 `15,16` の row0 も同じ形に閉じないと相手側が trap になる）。
  for (const k of owned) {
    const [sx, sy] = k.split(',').map(Number);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!isRing(r, c)) continue;
      if (isWalledNow(k, r, c)) queue.push([k, r, c]);
    }
  }
  let guard = 0;
  while (queue.length) {
    if (++guard > 200000) throw new Error('seal propagation did not converge');
    const [k, r, c] = queue.shift();
    const [sx, sy] = k.split(',').map(Number);
    for (const [nk, nr, nc] of crossingsOf(sx, sy, r, c)) {
      if (!field[nk]) continue;
      if (closed.get(nk)?.has(`${nr},${nc}`)) continue;
      if (isWalledNow(nk, nr, nc)) continue;      // すでに壁 → 穴ではない
      if (add(nk, nr, nc)) queue.push([nk, nr, nc]);
    }
  }
  return closed;
}

// ── 画面の組み立て ────────────────────────────────────────────────────────
/** 渚: 海に直交で接する陸を 'd' 砂にする（アームと同じ肌）。 */
function paintShore(bg) {
  const isSea = (r, c) => bg[r]?.[c] === W;
  return bg.map((row, r) => row.map((ch, c) => {
    if (ch === W) return W;
    return (isSea(r - 1, c) || isSea(r + 1, c) || isSea(r, c - 1) || isSea(r, c + 1)) ? D : ch;
  }));
}

const parseGrid = (rows, key, what) => {
  if (rows.length !== ROWS) throw new Error(`${key}: ${what} は ${ROWS} 行必要（${rows.length} 行）`);
  return rows.map((line) => {
    if (line.length !== COLS) throw new Error(`${key}: ${what} の行幅が ${COLS} でない: "${line}"`);
    return line.split('');
  });
};

/** エンジンと同じ畳み込みで見た「そのセルの実効タイル」。 */
const effTile = (tiles, bg, r, c) => (bg[r]?.[c] === W ? W : tiles[r]?.[c]);

/** 徒歩 BFS。openGates を開けた状態にするかを gatesOpen で切り替える。 */
function walkReach(tiles, bg, seeds, { gatesOpen }) {
  const seen = new Set();
  const q = [];
  const push = (r, c) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    const k = `${r},${c}`;
    if (seen.has(k)) return;
    const ch = effTile(tiles, bg, r, c);
    if (ch === TILE.TIDE_GATE) { if (!gatesOpen) return; }
    else if (isHardBlocked(ch)) return;
    seen.add(k); q.push([r, c]);
  };
  for (const [r, c] of seeds) push(r, c);
  while (q.length) {
    const [r, c] = q.shift();
    push(r - 1, c); push(r + 1, c); push(r, c - 1); push(r, c + 1);
  }
  return seen;
}

// ── パズルのソルバー（静的 BFS では足りない理由）────────────────────────────
// 「開いた状態で目的地に届く」という静的 BFS は、石押しパズルの詰みを **原理的に**
// 見つけられない。実際に C3 の初稿は静的には全部緑で、手順を回すと「石をボタンに
// 載せた後その石が自分の帰り道を塞ぐ」形になっていた。
// ∴ エンジンと同じ規則（player.js movePlayer の押し判定 / conditions.js
// checkStoneOnSwitch / player.js checkSwitchOff / toggleSwitch）で状態空間を
// 全探索する。状態 = プレイヤー位置 × 各石の位置 × Y トグル集合。
//
// エンジンから写した規則（ここがズレると「テスト緑・実機で詰む」になる）:
//   ・ボタン S はモーメンタリ。ON ⟺ プレイヤー or 石が今その上にいる
//     （checkSwitchOff は stoneSwitches に関係なく空きボタンを OFF にする）。
//   ・Y は武器で叩くトグル。隣接（射程1）から叩ける。踏むのではなく叩く。
//   ・石を押せる条件: 押し先が範囲内 && tilePassable && 他の石がいない。
//     押せたらプレイヤーは石の元位置へ進む。
//   ・潮ゲートは openGates にある時だけ通れる。石はゲートの上にも押せる（開いていれば）。
function makeSolver(tiles, bg, linkSpec) {
  const linksBySwitch = new Map();
  for (const [sw, gates] of linkSpec ?? []) linksBySwitch.set(sw, gates);
  const toggleCells = [];   // Y の位置（トグル状態をビットで持つ）
  const stoneKeys = [];     // '*' の元位置（stonePositions のキーと同じ）
  const buttons = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = tiles[r][c];
    if (ch === TILE.SWITCH) toggleCells.push(`${r},${c}`);
    if (ch === TILE.STONE) stoneKeys.push(`${r},${c}`);
    if (ch === TILE.BUTTON) buttons.push(`${r},${c}`);
  }
  if (toggleCells.length > 8) throw new Error('Y が多すぎる（ビットマスクの上限）');

  const initStones = stoneKeys.map((k) => k);   // 初期位置 = 元位置
  const encode = (pr, pc, stones, mask) => `${pr},${pc}|${stones.join(';')}|${mask}`;

  /** その状態で開いているゲート集合。ボタンは「今乗っているか」だけで決まる。 */
  const openGatesOf = (pr, pc, stones, mask) => {
    const open = new Set();
    toggleCells.forEach((cell, i) => {
      if (mask & (1 << i)) for (const g of linksBySwitch.get(cell) ?? []) open.add(g);
    });
    const here = `${pr},${pc}`;
    for (const b of buttons) {
      if (b === here || stones.includes(b)) for (const g of linksBySwitch.get(b) ?? []) open.add(g);
    }
    return open;
  };

  /** game/passable.js tilePassable の写し（石の「元位置は押した後は床」も含む）。 */
  const passableFor = (r, c, stones, open, { forStone }) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (bg[r][c] === W) return false;                       // 水（bg 単一ソース）
    const ch = tiles[r][c];
    if (ch === TILE.TIDE_GATE) return open.has(`${r},${c}`);
    if (ch === TILE.STONE) {
      // 元位置に石が残っているなら不通。押されて別位置にいるなら床。
      if (stones.includes(`${r},${c}`)) return false;
      const idx = stoneKeys.indexOf(`${r},${c}`);
      if (idx >= 0 && stones[idx] !== `${r},${c}`) return true;
      return false;
    }
    if (isHardBlocked(ch)) return false;
    if (forStone && ch === 'B') return false;   // 宝箱の上に石を乗せて封じない（安全側）
    return true;
  };

  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  /** 1状態から行ける次状態の列挙（移動・石押し・Y を叩く）。 */
  function nextStates(state) {
    const [pos, stonesStr, maskStr] = state.split('|');
    const [pr, pc] = pos.split(',').map(Number);
    const stones = stonesStr ? stonesStr.split(';') : [];
    const mask = Number(maskStr);
    const open = openGatesOf(pr, pc, stones, mask);
    const out = [];

    // Y を叩く（隣接。プレイヤーは動かない）。
    for (const [dr, dc] of DIRS) {
      const t = `${pr + dr},${pc + dc}`;
      const i = toggleCells.indexOf(t);
      if (i >= 0) out.push(encode(pr, pc, stones, mask ^ (1 << i)));
    }

    for (const [dr, dc] of DIRS) {
      const nr = pr + dr, nc = pc + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const si = stones.indexOf(`${nr},${nc}`);
      if (si >= 0) {
        // 石を押す。押し先は「石にとっての通行可」＋他の石なし。
        const sr = nr + dr, sc = nc + dc;
        if (!passableFor(sr, sc, stones, open, { forStone: true })) continue;
        if (stones.includes(`${sr},${sc}`)) continue;
        const ns = stones.slice();
        ns[si] = `${sr},${sc}`;
        out.push(encode(nr, nc, ns, mask));
        continue;
      }
      if (!passableFor(nr, nc, stones, open, { forStone: false })) continue;
      out.push(encode(nr, nc, stones, mask));
    }
    return out;
  }

  /** 画面から出られる外周セル（陸で、そこから隣の画面へ抜ける口）。 */
  const exitCells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!isRing(r, c)) continue;
    if (bg[r][c] === W) continue;
    if (isHardBlocked(tiles[r][c])) continue;
    exitCells.push(`${r},${c}`);
  }

  return { initStones, encode, nextStates, exitCells, toggleCells, stoneKeys, buttons };
}

/**
 * 画面のパズルを検査する。ここが 9-6 の2大原則の実体：
 *   ① 入口から出口まで **実際の手順で** 抜けられる（solvable）
 *   ② どの到達状態からも画面外に出られる（＝入って詰まない）
 *   ③ ゲートを永久に閉じたままだと抜けられない（＝パズルが飾りでない）
 * @returns {{states:number, playerCells:Set<string>}}
 */
function verifyPuzzle(tiles, bg, linkSpec, key) {
  const S = makeSolver(tiles, bg, linkSpec);
  if (!S.exitCells.length) throw new Error(`${key}: 出入りできる外周セルが無い`);

  const starts = S.exitCells.map((cell) => {
    const [r, c] = cell.split(',').map(Number);
    return S.encode(r, c, S.initStones, 0);
  });

  // 前向き探索（到達状態）と、辺の逆引き（詰み検査用）。
  const seen = new Set(starts);
  const rev = new Map();
  const q = [...starts];
  let guard = 0;
  while (q.length) {
    if (++guard > 4000000) throw new Error(`${key}: 状態空間が大きすぎる（設計を単純に）`);
    const st = q.shift();
    for (const nx of S.nextStates(st)) {
      if (!rev.has(nx)) rev.set(nx, []);
      rev.get(nx).push(st);
      if (seen.has(nx)) continue;
      seen.add(nx); q.push(nx);
    }
  }

  // ② 到達したどの状態からも「外周セルに立つ状態」へ行けること。
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

  // ① 北の口から南の口へ、実手順で抜けられること（廊下は南北に通す）。
  const northExits = S.exitCells.filter((c) => c.startsWith('0,'));
  const southExits = S.exitCells.filter((c) => c.startsWith(`${ROWS - 1},`));
  if (!northExits.length || !southExits.length)
    throw new Error(`${key}: 廊下なのに南北どちらかの口が無い（north=${northExits.length} south=${southExits.length}）`);
  const fromNorth = (() => {
    const [r, c] = northExits[0].split(',').map(Number);
    const start = S.encode(r, c, S.initStones, 0);
    const vis = new Set([start]); const qq = [start];
    while (qq.length) {
      const st = qq.shift();
      if (southExits.includes(st.split('|')[0])) return true;
      for (const nx of S.nextStates(st)) if (!vis.has(nx)) { vis.add(nx); qq.push(nx); }
    }
    return false;
  })();
  if (!fromNorth) throw new Error(`${key}: 北の口から南の口へ抜けられない（廊下が繋がっていない）`);

  // ③ 潮ゲートを永久に閉じたまま（＝スイッチ機構が無い）だと抜けられないこと。
  //    これが通ってしまう画面は「パズルを無視して素通りできる」＝飾り。
  const noGate = makeSolver(tiles, bg, []);   // links 無し → ゲートは永久に閉
  const bypass = (() => {
    const [r, c] = northExits[0].split(',').map(Number);
    const start = noGate.encode(r, c, noGate.initStones, 0);
    const vis = new Set([start]); const qq = [start];
    while (qq.length) {
      const st = qq.shift();
      if (southExits.includes(st.split('|')[0])) return true;
      for (const nx of noGate.nextStates(st)) if (!vis.has(nx)) { vis.add(nx); qq.push(nx); }
    }
    return false;
  })();
  if (bypass) throw new Error(`${key}: 潮ゲートを開けずに南へ抜けられる＝パズルが飾り`);

  const playerCells = new Set([...seen].map((st) => st.split('|')[0]));
  return { states: seen.size, playerCells };
}

/** はしごで 1セル幅の水を渡ってパズルを迂回できないこと（passable.js と同じ判定）。 */
function assertNoLadderBypass(tiles, bg, key) {
  const bank = (r, c) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;   // 画面外は橋脚にならない
    if (bg[r][c] === W) return false;
    const ch = tiles[r][c];
    return !isHardBlocked(ch) && ch !== TILE.TIDE_GATE;  // 閉じた潮ゲートも橋脚にならない
  };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (bg[r][c] !== W) continue;
    if (bank(r, c - 1) && bank(r, c + 1))
      throw new Error(`${key}: (${r},${c}) の水が横1セル幅＝はしごで渡れる（潮ゲートを迂回できる）`);
    if (bank(r - 1, c) && bank(r + 1, c))
      throw new Error(`${key}: (${r},${c}) の水が縦1セル幅＝はしごで渡れる（潮ゲートを迂回できる）`);
  }
}

const ENEMY_SET = new Set(ENEMY_TILES);

function buildScreen(key, spec, sealOf) {
  const bgRaw = parseGrid(spec.bg, key, 'bg');
  const tiles = parseGrid(spec.tiles, key, 'tiles');
  for (const row of bgRaw) for (const ch of row)
    if (ch !== W && ch !== O) throw new Error(`${key}: bg に使えない文字 '${ch}'（'~' と 'o' のみ）`);

  // 戦闘ゼロ（§19-8 分離原則）。敵タイルは ENEMY_META 由来の集合で見る。
  for (const row of tiles) for (const ch of row)
    if (ENEMY_SET.has(ch)) throw new Error(`${key}: 廊下は戦闘ゼロのはず（敵 '${ch}' がいる）`);

  const bg = paintShore(bgRaw);

  // 罠①: '=' の下地が水だと開いても永久に通れない。
  const gateCells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (tiles[r][c] !== TILE.TIDE_GATE) continue;
    gateCells.push(`${r},${c}`);
    if (bg[r][c] === W)
      throw new Error(`${key}: 潮ゲート (${r},${c}) の下地が水（isWaterAt が先に効いて永久に不通）`);
  }
  // content は陸の上だけ（水の上の宝箱/看板/石は永久に触れない）。
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = tiles[r][c];
    if (ch === '.' || ch === TILE.TIDE_GATE) continue;
    if (bg[r][c] === W) throw new Error(`${key}: '${ch}' (${r},${c}) が水の上`);
  }

  // links: 全ゲートがどれかのスイッチに繋がっていること／スイッチが実在すること。
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
    if (!linked.has(g)) throw new Error(`${key}: 潮ゲート ${g} がどのスイッチにも繋がっていない（永久に閉じた壁）`);

  assertNoLadderBypass(tiles, bg, key);

  // 封鎖と整合しているか（外周セル）。封鎖対象は水、非対象の crossing は陸。
  const sealed = sealOf(key);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!isRing(r, c)) continue;
    const mustSeal = sealed.has(`${r},${c}`);
    const isWater = bg[r][c] === W;
    if (mustSeal && !isWater)
      throw new Error(`${key}: 外周 (${r},${c}) は封鎖対象なのに陸（迂回路が残る）`);
  }

  // 実手順の全探索: 解ける / 詰まない / ゲートを迂回できない を同時に固定する。
  const { states, playerCells } = verifyPuzzle(tiles, bg, spec.links, key);

  // 宝箱は「実手順のどこかで隣に立てる」こと（潮を開けた状態を含む）。
  // 静的 BFS で「開けば届く」だけ見ると、開けた瞬間に石が道を塞ぐ形を見逃す。
  const canStandNextTo = (pos) => {
    const [r, c] = pos.split(',').map(Number);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => playerCells.has(`${r + dr},${c + dc}`));
  };
  if (spec.chest) {
    const [cr, cc] = spec.chest.pos.split(',').map(Number);
    if (tiles[cr][cc] !== 'B') throw new Error(`${key}: chest ${spec.chest.pos} が 'B' タイルでない`);
    // 宝箱は踏んで開ける（B は passable）＝そのセルに立てること。
    if (!playerCells.has(spec.chest.pos)) throw new Error(`${key}: 宝箱 ${spec.chest.pos} に実手順で届かない`);
  }
  if (spec.sign) {
    const [sr, sc] = spec.sign.pos.split(',').map(Number);
    if (tiles[sr][sc] !== 'i') throw new Error(`${key}: sign ${spec.sign.pos} が 'i' タイルでない`);
    if (!canStandNextTo(spec.sign.pos)) throw new Error(`${key}: 石碑 ${spec.sign.pos} を読める位置に立てない`);
  }
  // 'i' タイルに本文が無い（無言看板）を作らない。
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (tiles[r][c] !== 'i') continue;
    if (spec.sign?.pos !== `${r},${c}`) throw new Error(`${key}: 本文の無い石碑 (${r},${c})`);
  }

  return { tiles, bg, states };
}

// ── 実行 ──────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = data.layers.field.stages;

for (const k of CORRIDOR) {
  if (!field[k]) throw new Error(`missing corridor stage ${k}`);
  if (!SCREENS[k]) throw new Error(`corridor screen ${k} has no spec`);
  if (field[k].rows !== ROWS || field[k].cols !== COLS)
    throw new Error(`unexpected size on ${k}: ${field[k].rows}x${field[k].cols}`);
}
for (const k of Object.keys(SCREENS)) if (!CORRIDOR.includes(k)) throw new Error(`bad spec key ${k}`);

const owned = ownedScreens(field);
for (const k of CORRIDOR) if (!owned.has(k)) throw new Error(`${k} が封鎖の内側に入っていない`);

// 封鎖の伝播には「authored 画面の壁」も要るので、先に廊下の bg を仮組みする
// （封鎖と整合するかの assert は本組みで行う）。
const draftBg = new Map();
for (const k of CORRIDOR) draftBg.set(k, paintShore(parseGrid(SCREENS[k].bg, k, 'bg')));
const isWalledNow = (k, r, c) => {
  const d = draftBg.get(k);
  if (d) return d[r][c] === W;
  return isHardBlocked(cellTile(field[k], r, c));
};

const seal = computeSeal(field, owned, isWalledNow);
const sealOf = (k) => seal.get(k) ?? new Set();

if (process.argv.includes('--seal')) {
  let cells = 0;
  for (const [k, s] of [...seal].sort()) {
    cells += s.size;
    // 壁の種類は「封鎖の内側か」ではなく **地域** で決まる。アームの `14,11`/`15,11`
    // は内側ではないが O（海）なので水で塞ぐ。ここを owned で書くと海に山が生える。
    console.log(`${k.padEnd(6)} region=${String(regionOf(k)).padEnd(3)} ${regionOf(k) === 'O' ? '海側(bg水)' : '陸側(山) '} ${s.size} cells`);
  }
  console.log(`封鎖: ${seal.size} 画面 / ${cells} セル`);
  process.exit(0);
}

// (1) 廊下4画面を作る。
let built = 0;
const solverStats = [];
for (const key of CORRIDOR) {
  const spec = SCREENS[key];
  const { tiles, bg, states } = buildScreen(key, spec, sealOf);
  solverStats.push(`${key} ${spec.role}: ${states} 状態を全探索（詰み 0 / 迂回不能）`);
  const stage = field[key];

  stage.tiles = tiles.map((row) => row.slice());
  const bgObj = {};
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) bgObj[`${r},${c}`] = bg[r][c];
  stage.bgTiles = bgObj;

  // 塗り絵時代のデータが残らないよう毎回作り直す。
  stage.chestContents = {};
  stage.showConditions = {};
  stage.signData = {};
  stage.links = (spec.links ?? []).flatMap(([switchId, gates]) => gates.map((gateId) => ({ switchId, gateId })));
  if (spec.chest) stage.chestContents[spec.chest.pos] = spec.chest.content;
  if (spec.show) stage.showConditions[spec.show.pos] = spec.show.cond;
  if (spec.sign) stage.signData[spec.sign.pos] = { name: spec.sign.name, lines: spec.sign.lines };
  built++;
}

// (2) 封鎖を焼く。O 側は bgTiles 水、外側（M/P/W）は tiles 'M'。
let sealedCells = 0;
for (const [key, cells] of seal) {
  const stage = field[key];
  const isO = regionOf(key) === 'O';
  for (const id of cells) {
    const [r, c] = id.split(',').map(Number);
    if (isO) {
      stage.bgTiles ??= {};
      stage.bgTiles[id] = W;
    } else {
      stage.tiles[r][c] = MTN;
    }
    sealedCells++;
  }
}

// ── guard: 封鎖後、境界に arrival-wall の穴が片方向でも残っていないこと ─────
// 「O → 外」だけ見ると足りない。O が壁にしたセルの向かいが開いた陸なら、
// trap の発生源が相手の画面に移るだけで、地図全体の traps は増える。
{
  const holes = [];
  const check = (k) => {
    const [sx, sy] = k.split(',').map(Number);
    const s = field[k];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!isRing(r, c)) continue;
      const here = isHardBlocked(cellTile(s, r, c));
      for (const [nk, nr, nc] of crossingsOf(sx, sy, r, c)) {
        const ns = field[nk];
        if (!ns) continue;
        const there = isHardBlocked(cellTile(ns, nr, nc));
        if (!here && there) holes.push(`out: ${k}(${r},${c}) → ${nk}(${nr},${nc})`);
        if (here && !there) holes.push(`in:  ${nk}(${nr},${nc}) → ${k}(${r},${c})`);
      }
    }
  };
  for (const k of owned) check(k);
  for (const k of seal.keys()) check(k);
  if (holes.length)
    throw new Error(`境界に arrival-wall の穴 ${holes.length} 件:\n  ${[...new Set(holes)].join('\n  ')}`);
}

// ── guard: chestContents / showConditions のキーは 'B' タイルの上 ────────────
for (const key of CORRIDOR) {
  const stage = field[key];
  for (const [name, dict] of [['chestContents', stage.chestContents], ['showConditions', stage.showConditions]]) {
    for (const pk of Object.keys(dict)) {
      const [r, c] = pk.split(',').map(Number);
      if (stage.tiles[r][c] !== 'B')
        throw new Error(`${name} on ${key} @ ${pk} が 'B' タイルの上でない（=${stage.tiles[r][c]}）`);
    }
  }
}

// ── guard: レイアウト重複（廊下4画面が同じ絵になっていないこと）──────────────
{
  const seen = new Map();
  for (const key of CORRIDOR) {
    const s = field[key];
    const hash = s.tiles
      .map((row, r) => row.map((ch, c) => (s.bgTiles[`${r},${c}`] === W ? W : ch)).join(''))
      .join('|');
    if (seen.has(hash)) throw new Error(`duplicate layout: ${key} == ${seen.get(hash)}`);
    seen.set(hash, key);
  }
}

const DRY = process.argv.includes('--dry');
if (DRY) {
  for (const key of CORRIDOR) {
    const s = field[key];
    console.log(`\n=== ${key} ${SCREENS[key].role} — tiles | bgTiles ===`);
    for (let r = 0; r < ROWS; r++) {
      let bg = '';
      for (let c = 0; c < COLS; c++) bg += s.bgTiles[`${r},${c}`];
      console.log(String(r).padStart(2), s.tiles[r].join(''), ' ', bg);
    }
  }
} else {
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
}

console.log('');
for (const line of solverStats) console.log(`  ${line}`);
console.log(`\n9-6 ⑤ 深洋O 廊下: ${built} screens built${DRY ? ' [DRY — not written]' : ''}`);
console.log(`  西外周の封鎖: ${seal.size} 画面 / ${sealedCells} セル（O側=bg水 / 外側=山）`);
console.log(`  廊下の道は 1本: ${ARM_ENTRANCE.to} → ${CORRIDOR.join(' → ')} → デルタ`);
