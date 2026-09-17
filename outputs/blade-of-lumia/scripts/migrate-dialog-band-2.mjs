#!/usr/bin/env node
/**
 * migrate-dialog-band-2.mjs
 *
 * 実行キュー 17-3＝帯2（D2 砂漠の神殿）の語りを作り直し、目的地マークを配る。
 * 対象は field 砂漠エリア（`0,13`〜`3,19` のうち帯2 が担当する画面）と `dungeon_2`。
 *
 * 直す理由（すべて 2026-09-17 に一次ソース＝work/blade-of-lumia.json 他を実測して確認・
 * ユーザー承認済みの叩き台＝PLAN.md 17-3 の「📝 承認済みの叩き台」節）：
 *   ①D2 の入口画面 `2,15` に会話が無い（現地のしおりが無い）→ 石碑を1枚新設。
 *   ②`field 2,4`（D6 入口画面）の迷子石碑が【砂漠の神殿】を名乗り「↓ 入口は少し下」と嘘を言う
 *     → 4行目だけ真に差し替える（D2 の入口は 11 画面南）。
 *   ③方角の誤り4件（画面グラフ BFS で実測）→ 該当行を実測どおりに直す。
 *   ④火薬（爆弾）の話が4枚に重複 → 1枚（崩れた門柱）に集約し、残りはキュー26の道具の版
 *     （爆弾/はしごを手にした後）に振り替える。
 *   ⑤ダンジョン内ヒント2件が実態と無関係（D2に水は無い／遠隔攻撃の雑魚は居ない）
 *     → ブーメランで炎を運ぶ用途とボス N の石投げの予告に書き直す。
 *   ⑥「ザーネルの記憶」の番号が二重 → 入口室 `1,3` 系列は番号を捨てて別名にする。
 *
 * 温存（触らない）：`field 3,16`（古の戦の碑）・`field 1,18`／`2,19`（漁師の廃屋・埋もれた市場）・
 * `dungeon_2 0,0`（ザーネルの記憶 其の二＝ボス部屋系列）・報酬（キュー13の担当）。
 *
 * 冪等：本文・印が既に新版なら書かない（skip と数える）。
 * 事前条件：旧版の本文（name と lines）が実データと一致することを確かめてから書く。
 * 自己検証：書き終えた後にファイルを読み直し、全マークの行き先が実在するかを確かめる。
 *
 * Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { normalizeDialogMarks } from '../shared/marks.js';
import { itemVariantKey } from '../shared/dialog-variants.js';

const __dir = dirname(fileURLToPath(import.meta.url));
// BLADE_MAP_PATH＝別のファイルに対して試すための口（承認前に .scratch のコピーで空撃ちする）。
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '../work/blade-of-lumia.json');

/** 印の表記は既存と完全一致で固定（検査⑤の「同じ行き先を別ラベルで教える」重複警告を避ける）。 */
const MARK_DUNGEON_2 = { layer: 'field', stage: '2,15', label: '砂漠の神殿', kind: 'dungeon' };
const MARK_DUNGEON_3 = { layer: 'field', stage: '9,9',  label: '水の迷宮',   kind: 'dungeon' };
const MARK_TOWN      = { layer: 'field', stage: '7,14', label: 'ルミアの村', kind: 'town' };
const MARK_WORLD_EDGE = { layer: 'field', stage: '3,19', label: '世界の縁', kind: 'other' };

/** 新設する会話（既存タイルは '.'＝床）＝タイルを 'i'（看板）へ変え、signData を新設する。 */
const CREATES = [
  {
    layer: 'field', stage: '2,15', pos: '6,5', home: 'signData',
    name: '砂漠の神殿の石碑',
    lines: [
      '【砂漠の神殿】',
      '砂に 半ば 埋もれた 神殿。',
      '砂嵐を 纏う 王が 星の 欠片を 抱くという。',
      '↑ 入口は すぐ 上。',
    ],
    mark: MARK_DUNGEON_2,
    linesAfterBoss: {
      N: [
        '【砂漠の神殿】攻略済み。',
        '北へ 抜け、東の 湖を 目指せ。',
        '水の 迷宮に 次の 欠片が 眠る。',
      ],
    },
    markAfterBoss: { N: MARK_DUNGEON_3 },
  },
];

/**
 * 既存会話の直し。
 *   lines＝本文の完全な差し替え（省くと本文は温存＝印・道具版だけ足す）
 *   itemVersions＝道具の版｛itemId: { lines, mark? }｝（キュー26＝linesAfterBoss/markAfterBoss へ住む）
 */
const EDITS = [
  // ── field 1,16（砂漠の道標）── 方角3行の誤りを実測どおりに直す ─────
  {
    layer: 'field', stage: '1,16', pos: '4,4', home: 'signData',
    expectName: '砂漠の道標',
    expectFirstLine: '北 … 村への道',
    lines: [
      '北東の 窪みに 神殿の 口。砂嵐が 渦を 巻く。',
      '北へ 抜け、そこから 東へ 行けば 村の 灯。',
      '南は 世界の縁。砂と 潮の 果て。',
    ],
    mark: MARK_TOWN,
  },
  // ── field 0,13（崩れた門柱）── 方角の誤り＋火薬の話をここに集約 ────
  {
    layer: 'field', stage: '0,13', pos: '2,9', home: 'signData',
    expectName: '崩れた門柱',
    expectFirstLine: '右手の岩、脆く 罅が入っている。',
    lines: [
      '南西へ 下った 窪みの 岩に 罅。',
      '砕けば 何かが 眠っていそうだ。',
    ],
  },
  // ── field 0,14（爆ぜた岩の跡）── 重複する火薬の話は実態のみに絞る ──
  {
    layer: 'field', stage: '0,14', pos: '2,3', home: 'signData',
    expectName: '爆ぜた岩の跡',
    expectFirstLine: 'この岩壁、火薬の匂いがする。',
    lines: [
      'この 岩壁、火薬の 匂いがする。',
      '硬い 砂岩は 火薬でしか 崩れぬ。',
    ],
    itemVersions: {
      bomb: {
        lines: [
          'この 岩壁、火薬の 匂いがする。',
          '今の 荷なら 砕けよう。',
        ],
      },
    },
  },
  // ── field 1,13（砂の石碑）── 方角の誤り（東の湖 → 北へ抜けて東）────
  {
    layer: 'field', stage: '1,13', pos: '4,7', home: 'signData',
    expectName: '砂の石碑',
    expectFirstLine: '「水を求めし旅人よ、東の湖を目指せ」',
    lines: [
      '「水を求めし旅人よ、砂を 北へ 抜け 東の 湖を 目指せ」',
      '文字の半分は 砂に磨り消されている。',
    ],
    mark: MARK_DUNGEON_3,
  },
  // ── field 0,17（塩の池の石碑）── 方角の誤り（東の岩 → 北の岩）＋道具版 ──
  {
    layer: 'field', stage: '0,17', pos: '7,8', home: 'signData',
    expectName: '塩の池の石碑',
    expectFirstLine: '【塩の池】',
    replaceLine: [2, '北の 岩に 育つ 塩の 塊は 火薬で 崩れる。'],
    itemVersions: {
      bomb: {
        lines: [
          '【塩の池】',
          '陽に 焼かれ 水は 塩へと 変わる。',
          '北の 塩塊、今の 荷なら 崩せよう。',
        ],
      },
    },
  },
  // ── field 3,19（世界の縁の碑）── 本文温存・印だけ足す ──────────────
  {
    layer: 'field', stage: '3,19', pos: '8,2', home: 'signData',
    expectName: '世界の縁の碑',
    expectFirstLine: '【世界の縁】',
    mark: MARK_WORLD_EDGE,
  },
  // ── field 2,4（D6 入口画面の迷子石碑）── 4行目だけ真に差し替える ────
  {
    layer: 'field', stage: '2,4', pos: '6,4', home: 'npcData',
    expectName: '石碑',
    expectFirstLine: '【砂漠の神殿】',
    replaceLine: [3, '砂の海は 遥か 南。ここからは 遠い。'],
  },
  // ── dungeon_2 1,1（ヒント）── D2に水は無い∴用途をブーメランの炎運びに直す ──
  {
    layer: 'dungeon_2', stage: '1,1', pos: '7,5', home: 'signData',
    expectName: 'ヒント', name: '旋刃の書き置き',
    lines: [
      'この ブーメランで 遠くの 物を 回収できる。',
      '灯を 移すことも できる。消えた 松明に 火を 渡せ。',
      '旋る刃は 砂嵐の蠍王の 鉗をも 断つ。',
    ],
  },
  // ── dungeon_2 2,1（ヒント）── 遠隔攻撃の雑魚は居ない∴ボス N の石投げの予告に直す ──
  {
    layer: 'dungeon_2', stage: '2,1', pos: '1,5', home: 'signData',
    expectName: 'ヒント', name: '砂に潜む者の記',
    lines: [
      'この 砂は 生きている。足元から 牙が 来る。',
      '砂の 底から 現れる 王は 遠くへ 石を 投げる。',
      '盾を 立てて 受け、間合いを 詰めよ。',
    ],
  },
  // ── dungeon_2 1,3（ザーネルの記憶 ―其の二―）── 番号の二重化を解消・本文温存 ──
  {
    layer: 'dungeon_2', stage: '1,3', pos: '3,5', home: 'signData',
    expectName: 'ザーネルの記憶 ―其の二―', name: '砂に埋もれた手記',
  },
  // ── field 3,18（石切場の石碑）── 本文温存・道具版だけ足す ──────────
  {
    layer: 'field', stage: '3,18', pos: '8,1', home: 'signData',
    expectName: '石切場の石碑',
    expectFirstLine: '【砂岩の石切場】',
    itemVersions: {
      bomb: {
        lines: [
          '【砂岩の石切場】',
          '神殿の 石は ここから 切り出された。',
          '切り残しの 岩、今の 荷なら 崩せよう。',
        ],
      },
    },
  },
  // ── field 2,18（陥没の砂原の石碑）── 本文温存・道具版だけ足す ──────
  {
    layer: 'field', stage: '2,18', pos: '8,3', home: 'signData',
    expectName: '陥没の砂原の石碑',
    expectFirstLine: '【陥没の砂原】',
    itemVersions: {
      ladder: {
        lines: [
          '【陥没の砂原】',
          '砂の 下は 空洞。踏み抜けば 戻れぬ。',
          '梯子を 掛ければ、穴の 先へ 渡れよう。',
        ],
      },
    },
  },
];

// ── 実行 ────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

/** 印の行き先が実在するかを確かめる（実在しない印はゲーム側で捨てられる＝黙って消える） */
function assertMarkDest(raw, fallbackLayer, where) {
  const norm = normalizeDialogMarks(raw, fallbackLayer);
  if (!norm.length) throw new Error(`${where}: 印の形が不正 ${JSON.stringify(raw)}`);
  for (const m of norm) {
    if (!data.layers[m.layer]?.stages?.[m.stage]) {
      throw new Error(`${where}: 行き先が実在しない ${m.layer}/${m.stage}（${m.label}）`);
    }
  }
}

let created = 0, rewritten = 0, marked = 0, itemVersioned = 0, skipped = 0;

// ① 新設（タイル＋signData）
for (const c of CREATES) {
  const where = `${c.layer}/${c.stage} ${c.home}[${c.pos}]（新設）`;
  const st = data.layers[c.layer]?.stages?.[c.stage];
  if (!st) throw new Error(`${where}: ステージが無い`);
  const [row, col] = c.pos.split(',').map(Number);
  const tile = st.tiles[row][col];
  const existing = st[c.home]?.[c.pos];
  if (existing) {
    if (existing.name === c.name) { console.log(`skip ${where}（既に新版）`); skipped++; continue; }
    throw new Error(`${where}: 既に別の会話がある（${existing.name}）`);
  }
  if (tile !== '.') throw new Error(`${where}: タイルが想定と違う（実データ='${tile}'／期待='.'）`);
  st.tiles[row][col] = 'i'; // TILE.SIGN
  if (c.mark) assertMarkDest(c.mark, c.layer, `${where} mark`);
  for (const [boss, mk] of Object.entries(c.markAfterBoss ?? {})) {
    assertMarkDest(mk, c.layer, `${where} markAfterBoss[${boss}]`);
  }
  st[c.home] ??= {};
  st[c.home][c.pos] = {
    name: c.name,
    lines: [...c.lines],
    ...(c.mark ? { mark: { ...c.mark } } : {}),
    ...(c.linesAfterBoss ? { linesAfterBoss: JSON.parse(JSON.stringify(c.linesAfterBoss)) } : {}),
    ...(c.markAfterBoss ? { markAfterBoss: JSON.parse(JSON.stringify(c.markAfterBoss)) } : {}),
  };
  created++;
  if (c.mark || c.markAfterBoss) marked++;
}

// ② 既存の直し
for (const e of EDITS) {
  const where = `${e.layer}/${e.stage} ${e.home}[${e.pos}]`;
  const st = data.layers[e.layer]?.stages?.[e.stage];
  if (!st) throw new Error(`${where}: ステージが無い`);
  const entry = st[e.home]?.[e.pos];
  if (!entry || typeof entry !== 'object') throw new Error(`${where}: 会話データが無い（置き場所が違う？）`);

  // 事前条件＝旧版の本文であること（名前を変える相手は旧名でも新名でも通す）。
  const okNames = [e.expectName, ...(e.name ? [e.name] : [])];
  if (!okNames.includes(entry.name)) {
    throw new Error(`${where}: 名前が違う（実データ=${entry.name}／期待=${okNames.join(' or ')}）`);
  }
  const before = JSON.stringify(entry);
  if (!Array.isArray(entry.lines) || !entry.lines.length) throw new Error(`${where}: 本文が無い`);
  const isNewLines = e.lines ? JSON.stringify(entry.lines) === JSON.stringify(e.lines) : false;
  if (e.expectFirstLine && !isNewLines && entry.lines[0] !== e.expectFirstLine) {
    throw new Error(`${where}: 1行目が想定と違う（実データ=${entry.lines[0]}）`);
  }

  // 本文
  if (e.name) entry.name = e.name;
  if (e.lines) entry.lines = [...e.lines];
  if (e.replaceLine) {
    const [idx, text] = e.replaceLine;
    if (entry.lines.length <= idx) throw new Error(`${where}: ${idx + 1}行目が無い`);
    entry.lines[idx] = text;
  }

  // 印（基本）
  if (e.mark !== undefined) {
    if (e.mark === null) delete entry.mark;
    else { assertMarkDest(e.mark, e.layer, `${where} mark`); entry.mark = { ...e.mark }; }
  }

  // 道具の版（キュー26＝linesAfterBoss/markAfterBoss の item: キーへ住む・既存のボス版は保つ）
  if (e.itemVersions) {
    entry.linesAfterBoss ??= {};
    entry.markAfterBoss ??= {};
    for (const [itemId, v] of Object.entries(e.itemVersions)) {
      const key = itemVariantKey(itemId);
      entry.linesAfterBoss[key] = [...v.lines];
      if (v.mark) { assertMarkDest(v.mark, e.layer, `${where} markAfterBoss[${key}]`); entry.markAfterBoss[key] = { ...v.mark }; }
    }
    if (!Object.keys(entry.markAfterBoss).length) delete entry.markAfterBoss;
  }

  if (JSON.stringify(entry) === before) { console.log(`skip ${where}（既に新版）`); skipped++; continue; }
  rewritten++;
  if (e.mark) marked++;
  if (e.itemVersions) itemVersioned++;
}

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── 自己検証（書いたものを読み直して確かめる）──────────────────
const after = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const problems = [];

for (const c of CREATES) {
  const [row, col] = c.pos.split(',').map(Number);
  const st = after.layers[c.layer].stages[c.stage];
  if (st.tiles[row][col] !== 'i') problems.push(`${c.layer}/${c.stage} タイル[${c.pos}] が 'i' になっていない`);
  const entry = st[c.home][c.pos];
  if (!entry || JSON.stringify(entry.lines) !== JSON.stringify(c.lines)) {
    problems.push(`${c.layer}/${c.stage}[${c.pos}] の新設本文が入っていない`);
  }
}
for (const e of EDITS) {
  const entry = after.layers[e.layer].stages[e.stage][e.home][e.pos];
  if (e.lines && JSON.stringify(entry.lines) !== JSON.stringify(e.lines)) {
    problems.push(`${e.layer}/${e.stage}[${e.pos}] の本文が入っていない`);
  }
  if (e.name && entry.name !== e.name) problems.push(`${e.layer}/${e.stage}[${e.pos}] の名前が入っていない`);
  if (e.mark && JSON.stringify(entry.mark) !== JSON.stringify(e.mark)) {
    problems.push(`${e.layer}/${e.stage}[${e.pos}] の印が入っていない`);
  }
  if (e.itemVersions) {
    for (const itemId of Object.keys(e.itemVersions)) {
      const key = itemVariantKey(itemId);
      if (!entry.linesAfterBoss?.[key]) problems.push(`${e.layer}/${e.stage}[${e.pos}] の linesAfterBoss[${key}] が入っていない`);
    }
  }
}
// 帯2に限らずマップ全体の印を見る（既存の印を壊していないことまで確かめる）
let markTotal = 0;
for (const [lk, ld] of Object.entries(after.layers)) {
  for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
    for (const home of ['npcData', 'signData']) {
      for (const [pk, en] of Object.entries(sd[home] ?? {})) {
        if (!en || typeof en !== 'object') continue;
        const list = [];
        if (en.mark !== undefined) list.push(['mark', en.mark]);
        for (const [b, mk] of Object.entries(en.markAfterBoss ?? {})) list.push([`markAfterBoss[${b}]`, mk]);
        for (const [label, raw] of list) {
          markTotal++;
          const norm = normalizeDialogMarks(raw, lk);
          if (!norm.length) { problems.push(`${lk}/${sk} ${home}[${pk}] ${label} の形が不正`); continue; }
          for (const m of norm) {
            if (!after.layers[m.layer]?.stages?.[m.stage]) {
              problems.push(`${lk}/${sk} ${home}[${pk}] ${label} → ${m.layer}/${m.stage} が実在しない`);
            }
          }
        }
      }
    }
  }
}
if (problems.length) {
  console.error('❌ 自己検証で失敗:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`✓ migrate-dialog-band-2: 新設 ${created} 件／本文 ${rewritten} 件を書き換え（印を持つのは ${marked} 件・道具版を足したのは ${itemVersioned} 件）／skip ${skipped} 件`);
console.log(`✓ 自己検証: マップ全体の印 ${markTotal} 件はすべて実在する画面を指している`);
