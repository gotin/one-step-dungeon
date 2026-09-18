#!/usr/bin/env node
/**
 * migrate-dialog-band-4.mjs
 *
 * 実行キュー 17-5＝帯4（D4 炎の神殿）の語りを作り直し、目的地マークを配る。
 * 対象は灰スキン（bgTiles の優勢が 'c'＝ASH）の field 17 画面のうち会話がある 13 画面と
 * `dungeon_4`（20 室・会話 6 件）。あわせて帯3 からの申し送りで field `5,6` の方角 1 語を直す。
 *
 * ⚠️ 座標の convention＝`signData`/`npcData` のキーは "row,col"（行,列）。
 *    ステージキー "x,y"（`shared/marks.js` の南正 y）とは別物。
 *
 * 直す理由（すべて 2026-09-17 に一次ソース＝work/blade-of-lumia.json／shared/enemies.js／
 * shared/tiles.js／game/projectile.js／game/game.js を実測して確認。ユーザー承認済み＝
 * PLAN.md 17-5 の「📋 17-5 の承認済み内容」節）：
 *   ①`field 12,2 (7,5)` の踏破後台詞「ロウソクでかがり火を灯せ。森の聖域の扉が開く。」＝嘘。
 *     D6 の入口（field `2,4` の mapEnters{"4,2"}）は無条件で、かがり火の門は D6 の内側
 *     （`dungeon_6 1,1` の H×3＋showConditions{"4,9":torchesLit}）にある。方角「西」は真（西12画面）。
 *   ②`field 5,6`「北 … 火の山」＝実測 北東11（17-4 申し送り①）。
 *   ③`field 14,2`「西へ戻れば 火口」＝火口の石碑 `12,0` は北西4（果ての火口跡 `15,0` は北東3）。
 *   ④`field 15,2`「氷の底に 沈んだ遺跡」＝D5 入口 `13,5` は南西5・名前は「氷の廃墟」。
 *   ⑤`field 11,0`「落ちれば 帰れぬ」＝溶岩は通行不可（passable.js:247）で落ちる状態が無い
 *     （穴 PIT 'x' に落ちる話が真になるのは `field 14,0`）。
 *   ⑥`dungeon_4 1,2` のヒントが `1,1` と同文（「全ての火を灯せば 道は開ける。」）。
 *   ⑦`name:"ヒント"` 2枚（`1,2`／`3,3`）＝世界の中の物の名前に改める（17-3 申し送り④）。
 *     `3,3` の「石を押して スイッチを踏め。」は3枚同文の1枚。
 *   ⑧`dungeon_4 1,3 (1,9)`「ザーネルの記憶 ―其の四―」＝D3 と同じ拍（17-3 申し送り③）
 *     ∴番号を捨てて別名・別の拍にする（番号はボス部屋 `0,0` 系列だけの物）。
 *
 * 温存（本文に触らない）：`12,2 (4,5)` ピンクあたま（ユーザー自作の口調＝不可侵・印だけ足す）・
 * `12,1` 溶岩の 射的場（Y は山と溶岩で隔離＝「剣を拒む」は真）・`12,3` 溶岩の 手向け
 * （投擲物は溶岩を素通りし collectFieldItem が ITEM_RUPEE_LARGE を運ぶ＝真）・`15,0` 火口跡の
 * 石碑（島へ渡る橋は v 1枚＝真）・`dungeon_4 0,0` ザーネルの記憶 其の四（ボス部屋系列＝
 * `tests/lore-tablets.spec.js` が番号を要求）・報酬（キュー13 の担当）。
 *
 * 不変条件（本文を書く前に洗った＝17-4 申し送り①）：
 *   `tests/weakness-hints.spec.js` ② は `dungeon_4` の強制経路（1,3 1,2 1,1 1,0 0,0）の
 *   'i' タイル上の signData に「炎 or サラマンドラ」と [矢弓射] が**同じ1行**にあることを要求する
 *   ∴入口の立札 `1,3 (3,5)` の2行目でこれを維持する。
 *
 * 冪等：本文・印・タイルが既に新版なら書かない（skip と数える）。
 * 事前条件：旧版の name／lines[0]（冪等のため新版も許す）とタイルが実データと一致することを確かめる。
 * 自己検証：書き終えた後にファイルを読み直し、全エントリの形とマークの行き先の実在を確かめる。
 *
 * Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { normalizeDialogMarks } from '../shared/marks.js';
import { itemVariantKey } from '../shared/dialog-variants.js';

const __dir = dirname(fileURLToPath(import.meta.url));
// BLADE_MAP_PATH＝別のファイルに対して試すための口（本番前に .scratch のコピーで空撃ちする）。
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '../work/blade-of-lumia.json');

/** 印の表記は既存と完全一致で固定（検査⑤の「同じ行き先を別ラベルで教える」重複警告を避ける）。 */
const MARK_D4 = { layer: 'field', stage: '12,2', label: '炎の神殿',   kind: 'dungeon' };
const MARK_D6 = { layer: 'field', stage: '2,4',  label: '森の聖域',   kind: 'dungeon' };
const MARK_D5 = { layer: 'field', stage: '13,5', label: '氷の廃墟',   kind: 'dungeon' };

const K_CANDLE = itemVariantKey('candle');
const K_BOMB   = itemVariantKey('bomb');
const K_LADDER = itemVariantKey('ladder');
const K_FLUTE  = itemVariantKey('flute');

/**
 * 新設する会話＝床 '.' のセルをタイル 'i'（看板）に変え、会話を新設する。
 * 置き場所の選び方（接続を壊さない／読める位置にする）：
 *   field 14,0 (6,3)  … 東西の境界横断行（row4/row5）を避けた内側の床。
 *   field 13,1 (3,2)  … 同じ理由で row3。番所の西の入口側。
 *   dungeon_4 1,0 (1,2) … 石の押し経路（列1 を北上）と踏み板・櫃の隣接床を塞がないセル。
 *                         ⚠️ 入口 '>' (7,9) の真下 (8,9) は隣接床が '>' だけ＝乗ると遷移して
 *                         読めない死データになる∴使わない。
 */
const CREATES = [
  {
    layer: 'field', stage: '14,0', pos: '6,3', home: 'signData',
    name: '灰の 落とし穴',
    lines: [
      '【灰の 陥穽】',
      '灰が 薄い。踏み抜けば 底が 無い。',
      '向こう岸へ 渡る 術を 持たぬ 者は 引き返せ。',
    ],
    // はしご所持で「渡れる」に変わる（PIT は はしごで両隣が地上の1セルだけ渡れる＝tiles.js:78）。
    linesAfterBoss: {
      [K_LADDER]: [
        '【灰の 陥穽】',
        '灰が 薄い。踏み抜けば 底が 無い。',
        'その {{ladder}} はしごなら 一跨ぎで 渡れる。',
      ],
    },
    mark: MARK_D4,
  },
  {
    layer: 'field', stage: '13,1', pos: '3,2', home: 'signData',
    name: '火口の 見張り',
    lines: [
      '【火口の 番所】',
      '槍持ちと 追い手が 橋を 塞ぐ。',
      '一体でも 残る間は 何も 開かぬ。',
    ],
    mark: MARK_D4,
  },
  {
    layer: 'dungeon_4', stage: '1,0', pos: '1,2', home: 'signData',
    name: '石送りの間の 書き置き',
    lines: [
      '踏み板は 三つ。石も 三つ。',
      '石を 詰まらせても 一度 外へ 出れば 元へ 戻る。',
    ],
    // 笛は D8 の物＝この時点では持っていない∴基本の本文では笛に触れない（道具の版で足す）。
    // fluteEffect{type:'resetStones'} は実在（game/game.js:1629）。
    linesAfterBoss: {
      [K_FLUTE]: [
        '踏み板は 三つ。石も 三つ。',
        '石を 詰まらせても 一度 外へ 出れば 元へ 戻る。',
        'その {{flute}} 笛の 音色でも 石は 戻る。',
      ],
    },
  },
];

/**
 * 書き換える会話。
 *   expectName／expectFirstLine … 事前条件（配列＝旧版と新版の両方を許す＝冪等のため）
 *   name／lines … 省略したら触らない（＝本文温存で印だけ足す形）
 *   linesAfterBoss … 指定したキーだけ差し替え／追加（他のキーは触らない）
 */
const EDITS = [
  // ── field（灰境）──
  {
    layer: 'field', stage: '10,0', pos: '5,5', home: 'signData',
    expectName: '灰境の道標',
    expectFirstLine: '【灰境の登り口】',
    lines: [
      '【灰境の登り口】',
      'ここより先は 灰と火の領分。',
      '草は絶え 石は熱を帯びる。',
      '南東へ 四つ、熱の底に 炎の神殿。',   // 実測＝10,0 から 12,2 は東2 南2
    ],
    mark: MARK_D4,
  },
  {
    layer: 'field', stage: '11,0', pos: '2,2', home: 'signData',
    expectName: '隘路の石碑',
    expectFirstLine: '【外輪の隘路】',
    lines: [
      '【外輪の隘路】',
      '谷を裂くは 冷えぬ流れ。',
      '橋は 一本きり。触れれば 灰も 残らぬ。',  // 溶岩は通行不可＝「落ちる」状態が無い
    ],
    mark: MARK_D4,
  },
  {
    layer: 'field', stage: '11,2', pos: '2,8', home: 'signData',
    expectName: '消えた かがり火',
    expectFirstLine: '冷えた かがり火は 火種を 待つ。',
    linesAfterBoss: {
      [K_CANDLE]: [
        '冷えた かがり火は 火種を 待つ。',
        'その {{candle}} ロウソクの 火を 移せ。封が 崩れる。',
      ],
    },
    mark: MARK_D4,
  },
  {
    layer: 'field', stage: '12,0', pos: '6,6', home: 'signData',
    expectName: '火口の 石碑',
    expectFirstLine: '山は 眠らぬ。ただ 息を 潜めておるのみ。',
    lines: [
      '山は 眠らぬ。ただ 息を 潜めておるのみ。',
      '炎の 神殿は この 熱の 底で 目を 覚ます。',
      '南へ 二つ 下れば その 口が 開く。',   // 実測＝12,0 から 12,2 は南2
    ],
    mark: MARK_D4,
  },
  {
    // 本文温存（Y は山と溶岩で隔離＝剣が届かない・遠くから射れば T が開く＝真）。印だけ。
    layer: 'field', stage: '12,1', pos: '2,3', home: 'signData',
    expectName: '溶岩の 射的場',
    expectFirstLine: '熔けた 堀の 向こうの 石突は 剣を 拒む。',
    mark: MARK_D4,
  },
  {
    layer: 'field', stage: '12,2', pos: '7,5', home: 'npcData',
    expectName: '石碑',
    expectFirstLine: '【炎の神殿】',
    linesAfterBoss: {
      A: [
        '【炎の神殿】攻略済み。',
        'ここより ずっと 西、木々の 奥に 森の聖域が ある。',
        '携えた {{candle}} ロウソクを 使え。茂りは 火で 退く。',
      ],
    },
    mark: MARK_D4,
    markAfterBoss: { A: MARK_D6 },
  },
  {
    // ユーザー自作の口調＝不可侵∴本文は1文字も触らない。印だけ足す（ユーザー承認 2026-09-17）。
    layer: 'field', stage: '12,2', pos: '4,5', home: 'npcData',
    expectName: 'ピンクあたま',
    expectFirstLine: '私の髪の毛の色はピンクです。',
    mark: MARK_D4,
  },
  {
    layer: 'field', stage: '12,3', pos: '2,5', home: 'signData',
    expectName: '溶岩の 手向け',
    expectFirstLine: '熔けた 池に 落ちた 宝は 拾えぬ。',
    linesAfterBoss: {
      [K_BOMB]: [
        '熔けた 池に 落ちた 宝は 拾えぬ。',
        'されど 投げ物は 火を 越えて 戻る。',
        '南の 岩の 罅は 今の 荷なら 崩せよう。',   // breakableWalls{"6,4":breakDef 1}
      ],
    },
    mark: MARK_D4,
  },
  {
    layer: 'field', stage: '13,0', pos: '6,3', home: 'signData',
    expectName: '岩棚の石碑',
    expectFirstLine: '【熔けた岩棚】',
    linesAfterBoss: {
      [K_BOMB]: [
        '【熔けた岩棚】',
        '黒き板は 冷えた炎の名残。',
        '北の岩肌に 詰まった 空洞がある。',
        '詰まった 岩は {{bomb}} 火薬でしか 開かぬ。',  // breakableWalls{"1,3":breakDef 2}
      ],
    },
    mark: MARK_D4,
  },
  {
    layer: 'field', stage: '14,2', pos: '5,4', home: 'signData',
    expectName: '広庭の道標',
    expectFirstLine: '【灰の広庭】',
    lines: [
      '【灰の広庭】',
      '北西へ 戻れば 火口。南へ 下れば 雪。',   // 実測＝12,0 は北西4／14,3 は雪 76/120
      '灰の段丘で 息を整えよ。',
    ],
    mark: MARK_D4,
  },
  {
    // 本文温存（島へ渡る橋は v 1枚＝真）。印だけ。
    layer: 'field', stage: '15,0', pos: '7,3', home: 'signData',
    expectName: '火口跡の石碑',
    expectFirstLine: '【果ての火口跡】',
    mark: MARK_D4,
  },
  {
    layer: 'field', stage: '15,1', pos: '3,9', home: 'signData',
    expectName: '狼煙台の石碑',
    expectFirstLine: '【東の狼煙台】',
    linesAfterBoss: {
      [K_CANDLE]: [
        '【東の狼煙台】',
        'その {{candle}} ロウソクで 火を 掲げよ。',
        '狼煙は 灰の 向こうへ 渡る。',
      ],
    },
    mark: MARK_D4,
  },
  {
    layer: 'field', stage: '15,2', pos: '7,4', home: 'signData',
    expectName: '下りの道標',
    expectFirstLine: '【熔け残りの下り】',
    lines: [
      '【熔け残りの下り】',
      '南へ 下れば 灰は雪に変わる。',
      '南西へ 五つ、石畳の町の 先に 氷の廃墟。',   // 実測＝15,2 から 13,5 は西2 南3
    ],
    mark: MARK_D5,
  },
  {
    // 帯3 からの申し送り＝方角1語だけ（帯3 が付けた「水の迷宮」の印はそのまま）。
    layer: 'field', stage: '5,6', pos: '3,6', home: 'signData',
    expectName: '草原の辻の道標',
    expectFirstLine: '南東 … 湖と 遺跡への道',
    lines: [
      '南東 … 湖と 遺跡への道',
      '北東 … 火の山と 白き峰',   // 実測＝5,6 から 10,0／12,2 はどちらも北東11
      '南 … 村への 帰り道',
    ],
  },

  // ── dungeon_4（炎の神殿）──
  {
    layer: 'dungeon_4', stage: '1,3', pos: '3,5', home: 'signData',
    expectName: '炎の神殿の入口',
    expectFirstLine: ['炎は全てを焼き尽くす。', '炎は 全てを 焼き 尽くす。灯を 絶やすな。'],
    lines: [
      '炎は 全てを 焼き 尽くす。灯を 絶やすな。',
      // ⚠️ この1行が weakness-hints.spec.js ② の不変条件（敵の名＋矢を同じ行に置く）。
      '奥に 棲む 炎のサラマンドラには {{arrow}} 矢が 二倍に 刺さる。',
      '火を 灯して 門を 開き、石を 送って 錠を 得よ。',
    ],
    markAfterBoss: { A: MARK_D6 },
  },
  {
    layer: 'dungeon_4', stage: '1,3', pos: '1,9', home: 'npcData',
    expectName: ['ザーネルの記憶 ―其の四―', '焼け残りの 手記'],
    expectFirstLine: ['「死を覆す術はないのか」と 彼は呟いた。', 'この 社は 元は 灯を 守る 場であった。'],
    name: '焼け残りの 手記',
    lines: [
      'この 社は 元は 灯を 守る 場であった。',
      'ザーネルが 来た日、灯は 獣に なった。',
      '書き手は 名を 記していない。',
    ],
  },
  {
    layer: 'dungeon_4', stage: '1,2', pos: '8,1', home: 'signData',
    expectName: ['ヒント', '灯火番の 書き置き'],
    expectFirstLine: ['炎を絶やすな。', 'この 間の 櫃に 火を 運ぶ 物がある。'],
    name: '灯火番の 書き置き',
    lines: [
      'この 間の 櫃に 火を 運ぶ 物がある。',
      '灰の 中では 灯が 命だ。絶やすな。',
    ],
  },
  {
    layer: 'dungeon_4', stage: '1,1', pos: '8,1', home: 'signData',
    expectName: 'かがり火の間',
    expectFirstLine: ['全ての火を灯せば 道は開ける。', '{{torch}} 三つの 火を 全て 灯せば 道は 開ける。'],
    lines: [
      '{{torch}} 三つの 火を 全て 灯せば 道は 開ける。',   // H は 3 本（実測）
    ],
  },
  {
    layer: 'dungeon_4', stage: '3,3', pos: '7,1', home: 'signData',
    expectName: ['ヒント', '押し石の 覚え書き'],
    expectFirstLine: ['石を押して スイッチを踏め。', '石は 押せる。踏み板の 上へ 送れ。'],
    name: '押し石の 覚え書き',
    lines: [
      '石は 押せる。踏み板の 上へ 送れ。',
      '板が 沈めば 門が 上がる。',
    ],
  },
];

// ── ここから下は道具 ──────────────────────────────────────

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const asList = (v) => (Array.isArray(v) ? v : [v]);

function stageOf(layer, stage) {
  const st = map.layers?.[layer]?.stages?.[stage];
  if (!st) throw new Error(`ステージが無い: ${layer} ${stage}`);
  return st;
}

/** tiles は「文字配列の配列」＝行を文字列にすると実ゲームが落ちる（[[field-tiles-are-char-arrays]]）。 */
function setTile(st, pos, ch) {
  const [r, c] = pos.split(',').map(Number);
  if (!Array.isArray(st.tiles[r])) throw new Error(`tiles[${r}] が文字配列でない`);
  st.tiles[r][c] = ch;
}
function tileAt(st, pos) {
  const [r, c] = pos.split(',').map(Number);
  const row = st.tiles[r];
  return (Array.isArray(row) ? row : String(row).split(''))[c];
}

let created = 0, updated = 0, skipped = 0;

// ── 新設 ─────────────────────────────────────────────────
for (const c of CREATES) {
  const st = stageOf(c.layer, c.stage);
  const home = (st[c.home] ??= {});
  const cur = home[c.pos];
  const want = {
    name: c.name,
    lines: c.lines,
    ...(c.linesAfterBoss ? { linesAfterBoss: c.linesAfterBoss } : {}),
    ...(c.mark ? { mark: c.mark } : {}),
  };
  if (cur && eq(cur, want) && tileAt(st, c.pos) === 'i') {
    console.log(`  skip  新設済み ${c.layer} ${c.stage} (${c.pos}) ${c.name}`);
    skipped++;
    continue;
  }
  // 事前条件＝まだ何も無い床（既に別の会話が居るなら黙って潰さない）
  if (cur && cur.name !== c.name) {
    throw new Error(`${c.layer} ${c.stage} (${c.pos}) に別の会話が居る: ${JSON.stringify(cur.name)}`);
  }
  const t = tileAt(st, c.pos);
  if (t !== '.' && t !== 'i') {
    throw new Error(`${c.layer} ${c.stage} (${c.pos}) のタイルが '.' でない: '${t}'`);
  }
  setTile(st, c.pos, 'i');
  home[c.pos] = want;
  console.log(`  作成  ${c.layer} ${c.stage} (${c.pos}) ${c.name}${c.mark ? ' ＋印' : ''}`);
  created++;
}

// ── 書き換え ─────────────────────────────────────────────
for (const e of EDITS) {
  const st = stageOf(e.layer, e.stage);
  const entry = st[e.home]?.[e.pos];
  if (!entry) throw new Error(`会話が無い: ${e.layer} ${e.stage} (${e.pos}) [${e.home}]`);
  if (Array.isArray(entry)) throw new Error(`${e.layer} ${e.stage} (${e.pos}) が古い文字列配列形式`);

  // 事前条件（旧版・新版のどちらでも通す＝冪等）
  if (!asList(e.expectName).includes(entry.name)) {
    throw new Error(`name が想定と違う: ${e.layer} ${e.stage} (${e.pos}) = ${JSON.stringify(entry.name)}`);
  }
  if (!asList(e.expectFirstLine).includes(entry.lines?.[0])) {
    throw new Error(`1行目が想定と違う: ${e.layer} ${e.stage} (${e.pos}) = ${JSON.stringify(entry.lines?.[0])}`);
  }
  // 読める位置か（'i' か NPC タイル）＝死データを作らない
  const t = tileAt(st, e.pos);
  if (!'iPab$'.includes(t)) {
    throw new Error(`${e.layer} ${e.stage} (${e.pos}) のタイル '${t}' は読めない`);
  }

  let changed = false;
  if (e.name !== undefined && entry.name !== e.name) { entry.name = e.name; changed = true; }
  if (e.lines !== undefined && !eq(entry.lines, e.lines)) { entry.lines = e.lines; changed = true; }
  if (e.linesAfterBoss) {
    const lab = (entry.linesAfterBoss ??= {});
    for (const [k, v] of Object.entries(e.linesAfterBoss)) {
      if (!eq(lab[k], v)) { lab[k] = v; changed = true; }
    }
  }
  if (e.mark && !eq(entry.mark, e.mark)) { entry.mark = e.mark; changed = true; }
  if (e.markAfterBoss) {
    const mab = (entry.markAfterBoss ??= {});
    for (const [k, v] of Object.entries(e.markAfterBoss)) {
      if (!eq(mab[k], v)) { mab[k] = v; changed = true; }
    }
  }
  if (!changed) { console.log(`  skip  変化なし ${e.layer} ${e.stage} (${e.pos}) ${entry.name}`); skipped++; continue; }
  console.log(`  更新  ${e.layer} ${e.stage} (${e.pos}) ${entry.name}`);
  updated++;
}

if (created + updated === 0) {
  console.log(`\n変更なし（skip ${skipped} 件）＝既に適用済み。`);
  process.exit(0);
}

writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
console.log(`\n書き込み: ${MAP_PATH}（作成 ${created} / 更新 ${updated} / skip ${skipped}）`);

// ── 自己検証（書いた後に読み直す）────────────────────────
const after = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const errs = [];

for (const c of CREATES) {
  const st = after.layers[c.layer].stages[c.stage];
  if (tileAt(st, c.pos) !== 'i') errs.push(`${c.layer} ${c.stage} (${c.pos}) が 'i' でない`);
  const en = st[c.home]?.[c.pos];
  if (!en || en.name !== c.name || !eq(en.lines, c.lines)) errs.push(`新設が読み直せない: ${c.layer} ${c.stage} (${c.pos})`);
}
for (const e of EDITS) {
  const st = after.layers[e.layer].stages[e.stage];
  const en = st[e.home]?.[e.pos];
  if (!en) { errs.push(`書き換えが消えた: ${e.layer} ${e.stage} (${e.pos})`); continue; }
  if (e.name !== undefined && en.name !== e.name) errs.push(`name 不一致: ${e.layer} ${e.stage} (${e.pos})`);
  if (e.lines !== undefined && !eq(en.lines, e.lines)) errs.push(`lines 不一致: ${e.layer} ${e.stage} (${e.pos})`);
  for (const [k, v] of Object.entries(e.linesAfterBoss ?? {})) {
    if (!eq(en.linesAfterBoss?.[k], v)) errs.push(`版 ${k} 不一致: ${e.layer} ${e.stage} (${e.pos})`);
  }
  if (e.mark && !eq(en.mark, e.mark)) errs.push(`印 不一致: ${e.layer} ${e.stage} (${e.pos})`);
  for (const [k, v] of Object.entries(e.markAfterBoss ?? {})) {
    if (!eq(en.markAfterBoss?.[k], v)) errs.push(`踏破後の印 ${k} 不一致: ${e.layer} ${e.stage} (${e.pos})`);
  }
}

// tiles が文字配列のまま（[[field-tiles-are-char-arrays]]）
for (const [ln, ld] of Object.entries(after.layers)) {
  for (const [sk, st] of Object.entries(ld.stages ?? {})) {
    for (let r = 0; r < (st.tiles ?? []).length; r++) {
      if (!Array.isArray(st.tiles[r])) { errs.push(`${ln} ${sk} tiles[${r}] が文字配列でない`); break; }
    }
  }
}

// マップ全体の印の行き先が実在するか（会話 1 件に静的＋踏破後の複数）
let markCount = 0;
for (const [ln, ld] of Object.entries(after.layers)) {
  for (const [sk, st] of Object.entries(ld.stages ?? {})) {
    for (const home of ['signData', 'npcData']) {
      for (const [pos, en] of Object.entries(st[home] ?? {})) {
        if (!en || Array.isArray(en)) continue;
        const marks = [en.mark, ...Object.values(en.markAfterBoss ?? {})].filter(Boolean);
        for (const m of marks) {
          markCount++;
          const norm = normalizeDialogMarks({ mark: m }, ln)[0] ?? { layer: m.layer ?? ln, stage: m.stage };
          if (!after.layers[norm.layer]?.stages?.[norm.stage]) {
            errs.push(`印の行き先が無い: ${ln} ${sk} (${pos}) → ${norm.layer} ${norm.stage}`);
          }
        }
      }
    }
  }
}

if (errs.length) {
  console.error('\n❌ 自己検証で不整合:');
  for (const m of errs) console.error(`   - ${m}`);
  process.exit(1);
}
console.log(`✅ 自己検証 OK（マップ全体の印 ${markCount} 件すべて実在する画面を指している）`);
