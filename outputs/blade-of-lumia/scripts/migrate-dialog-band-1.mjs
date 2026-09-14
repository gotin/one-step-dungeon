#!/usr/bin/env node
/**
 * migrate-dialog-band-1.mjs
 *
 * 実行キュー 17-2＝帯1（start＋D1）の語りを作り直し、目的地マークを配る。
 * 対象は field `7,14`（ルミアの村）／field `6,13`（草原の洞窟の画面）／`dungeon_1`／`hidden_cave`。
 *
 * 直す理由（すべて 2026-09-14 に一次ソース＝work/blade-of-lumia.json で実測した食い違い）：
 *   (1) 方角が3件まちがっていた。ステージキーは "x,y" で y は南が正（shared/marks.js）∴
 *       D1 入口のある `6,13` は村 `7,14` の **北西**。旧文はタロ「下（南）の草むらの先」・
 *       ハナ「この辺りは草原の南エリア」・看板「↓ 南：草原南エリア」と南に案内していた。
 *   (2) 諦めた老人の「あの台（祭壇）」＝祭壇 '^' は field `7,1`（村の真北13画面）＝村からは
 *       見えない。嘘をつく役（＝進むと嘘だと分かる仕掛け）は温存し、位置だけ直す。
 *   (3) D1 `2,2` の石碑「水堀の向こうの 矢スイッチ」＝D1 に水は1マスも無い（全16室走査）。
 *       かつ 'Y' は剣でも叩ける（shared/tiles.js）∴「射手の試練」は成立していない。
 *   (4) `hidden_cave` は層名が空＝名前が無く、どの会話も存在を語らない（導線ゼロ）。
 *       名前を「草陰の祠」（ユーザー決定 2026-09-14）とし、タロの噂で1行だけ触れる。
 *   (5) マークが進行に追従できなかった＝会話1件に1組しか持てなかった。17-2 で
 *       `markAfterBoss`（`linesAfterBoss` と同じ選択規則）を新設した∴老賢者の9分岐が
 *       名指ししている「次の地」を、そのまま地図の印として配れる。
 *
 * 温存（触らない）：`6,13` の立て看板・通りすがりの冒険者（ユーザー作の声）・【閉ざされた扉】・
 * 【草原の洞窟】の本文・D1 `0,0` ザーネルの記憶・D1 `0,1` 石の扉の脇の立札・
 * `hidden_cave` の石碑・報酬（キュー13の担当∴宝箱と床置きには一切触らない）。
 *
 * 冪等：本文・印が既に新版なら書かない（skip と数える）。
 * 事前条件：旧版の本文（name と lines）が実データと一致することを確かめてから書く＝
 * データが動いていたら止まる（黙って上書きしない）。
 * 自己検証：書き終えた後にファイルを読み直し、全マークの行き先が実在するかを
 * shared/marks.js の正規化を通して確かめる。
 *
 * Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { normalizeDialogMarks } from '../shared/marks.js';

const __dir = dirname(fileURLToPath(import.meta.url));
// BLADE_MAP_PATH＝別のファイルに対して試すための口（承認前に .scratch のコピーで空撃ちする）。
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '../work/blade-of-lumia.json');

const HIDDEN_CAVE_NAME = '草陰の祠';

/** 老賢者の踏破後マーク＝各ボスを倒した直後の本文が名指ししている「次の地」の入口画面。 */
const SAGE_MARK_AFTER_BOSS = {
  // G＝岩のゴーレム（D1）を倒した後 → 南西の砂漠
  G: { layer: 'field', stage: '2,15',  label: '砂漠の神殿', kind: 'dungeon' },
  N: { layer: 'field', stage: '9,9',   label: '水の迷宮',   kind: 'dungeon' },
  J: { layer: 'field', stage: '12,2',  label: '炎の神殿',   kind: 'dungeon' },
  A: { layer: 'field', stage: '2,4',   label: '森の聖域',   kind: 'dungeon' },
  O: { layer: 'field', stage: '13,5',  label: '氷の廃墟',   kind: 'dungeon' },
  L: { layer: 'field', stage: '10,14', label: '沼地の神殿', kind: 'dungeon' },
  I: { layer: 'field', stage: '2,0',   label: '空中の遺跡', kind: 'dungeon' },
  // U＝嵐の鷲王（D7）を倒した後＝欠片が揃う → 北の古代の祭壇（ダンジョンではない∴other）
  U: { layer: 'field', stage: '7,1',   label: '古代の祭壇', kind: 'other' },
};

/**
 * 直す会話の一覧。
 *   layer / stage / pos＝場所、home＝本文の置き場所（ゲームは signData を先に読む）
 *   expectName / expectFirstLine＝事前条件（データが動いていたら止める）
 *   name / lines＝新しい本文（lines を省くと本文は温存＝印だけ足す）
 *   mark / markAfterBoss＝目的地の印（null を渡すと消す・省略すると温存）
 */
const EDITS = [
  // ── field 7,14（ルミアの村）─────────────────────────────────────
  {
    layer: 'field', stage: '7,14', pos: '3,3', home: 'npcData',
    expectName: '老賢者',
    expectFirstLine: 'おお、目を覚ましたか若き勇者よ。',
    // 4行目だけ差し替える（1〜3行目と踏破後9分岐の本文は温存）。
    replaceLine: [3, 'まず旅支度を。そこの剣を拾い、村を出て西、そこからひとつ北へ。草原の窪みに洞窟が口を開けておる。'],
    // 層名との食い違いを直す（層名は「空中の遺跡」＝旧文だけ「空島」と呼んでいた）。
    replaceWord: ['空島の遺跡', '空中の遺跡'],
    markAfterBoss: SAGE_MARK_AFTER_BOSS,
  },
  {
    layer: 'field', stage: '7,14', pos: '3,5', home: 'npcData',
    expectName: '村人 タロ',
    expectFirstLine: 'ここはルミアの草原じゃ。',
    lines: [
      'ここはルミアの村。草原のへりの、小さな村じゃよ。',
      '洞窟は村を出て西、そこからひとつ北。草原の窪みに口を開けておる。',
      '💡 看板は 向いて攻撃ボタンを押すと読めるぞ。',
      '旅人が言っておった。南西の砂漠に神殿があり、砂嵐が渦を巻いていると。',
      '西の森の奥には 巨きな者の気配があるとも。……わしは近づかんよ。',
      `この草原の窪みには、火があれば開く「${HIDDEN_CAVE_NAME}」もあるという噂じゃ。`,
    ],
  },
  {
    layer: 'field', stage: '7,14', pos: '6,9', home: 'npcData',
    expectName: '看板',
    expectFirstLine: '→ 東：草原の森',
    lines: [
      '← 西へ出て 北 ： 草原の洞窟',
      '→ 東 ： 木立の草原',
      '↓ 南 ： 野の道 ── 東に 古い関所の跡',
    ],
    // 帰る場所のしおり（村を出てから「どこが村だったか」を見失わないため）。
    mark: { layer: 'field', stage: '7,14', label: 'ルミアの村', kind: 'town' },
  },
  {
    layer: 'field', stage: '7,14', pos: '7,3', home: 'npcData',
    expectName: '諦めた老人',
    expectFirstLine: 'あの台（祭壇）には近づくな。触っても何も起きない。',
    lines: [
      '北の果てに 石の台があるじゃろう。あれは飾りじゃ。',
      'わしも昔 欠片を集めて 台に乗った。何も起きんかったわい。',
      '女王を助ける力なんぞ もうこの世にはない。',
      'やめておけ。旅なんぞ 無駄じゃ。',
    ],
  },

  // ── field 6,13（草原の洞窟の入口画面）───────────────────────────
  {
    layer: 'field', stage: '6,13', pos: '5,7', home: 'npcData',
    expectName: '村人 ハナ',
    expectFirstLine: 'この辺りは草原の南エリアだよ。',
    // 未所持の道具の操作説明（ブーメラン・爆弾の B キー）を落とし、同じ画面にある実物だけを語る。
    lines: [
      'ここは村の北西、草原の窪みだよ。',
      'そこの黒い口が 草原の洞窟。魔物がいるって、みんな近づかない。',
      '柵の中の鍵と、ひびの入った壁……わたしには手が出せないよ。',
      'いつか道具を手にしたら、また来てみて。',
    ],
  },
  {
    layer: 'field', stage: '6,13', pos: '7,8', home: 'npcData',
    expectName: '石碑',
    expectFirstLine: '【草原の洞窟】',
    // 本文は温存（実測どおり入口は真下）＝現地のしおりとして印だけ足す。
    // 老賢者と同じ id∴一覧が増えない（先に賢者に聞いていても重ならない）。
    mark: { layer: 'field', stage: '6,13', label: '草原の洞窟', kind: 'dungeon' },
    // 踏破後の本文は「次は南西の砂漠へ」と言う∴印も同じ場所を指す。
    markAfterBoss: { G: SAGE_MARK_AFTER_BOSS.G },
  },

  // ── dungeon_1（3枚が同じ「木の盾は北」を言っていた∴役割を分ける）──
  {
    layer: 'dungeon_1', stage: '1,3', pos: '3,5', home: 'signData',
    expectName: '洞窟の入口',
    expectFirstLine: '奥に盾と輝く欠片が眠る。',
    lines: [
      '【草原の洞窟】',
      '岩の腕を持つ者が 眠るという。',
      '奥に 木の盾と 星の欠片。',
      '支度なき者は 帰れ。',
    ],
  },
  {
    layer: 'dungeon_1', stage: '1,2', pos: '7,5', home: 'signData',
    expectName: '北への道しるべ',
    expectFirstLine: '木の盾はこの北の部屋にある。',
    // 実測＝北へ1つ（1,1）が木の盾の櫃・北へ2つ（1,0）が W の初戦。
    lines: [
      '北へ ひとつ 櫃の間。',
      '北へ ふたつ 守護者の間。',
      '備えなき者は 引き返せ。',
    ],
  },
  {
    layer: 'dungeon_1', stage: '1,1', pos: '7,5', home: 'signData',
    expectName: 'ヒント',
    expectFirstLine: 'この部屋の宝箱に木の盾がある。',
    name: '壁の刻み',
    lines: [
      '此処の櫃に 木の盾。',
      '北の間に 強き守護者。',
      '盾なくば 飛び道具に 沈む。',
    ],
  },
  {
    layer: 'dungeon_1', stage: '2,2', pos: '4,3', home: 'npcData',
    expectName: '石碑',
    expectFirstLine: '【射手の試練】',
    name: '壁の刻み',
    // 水堀も「矢でしか押せないスイッチ」も実在しない∴実態（'Y'＝武器で切り替わる）を書く。
    lines: [
      '壁に 刻まれた 目が ひとつ。',
      '打てば 開き、また 打てば 閉じる。',
      '遠くの目には 矢が 届く。',
    ],
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

let rewritten = 0, marked = 0, skipped = 0;

for (const e of EDITS) {
  const where = `${e.layer}/${e.stage} ${e.home}[${e.pos}]`;
  const st = data.layers[e.layer]?.stages?.[e.stage];
  if (!st) throw new Error(`${where}: ステージが無い`);
  const entry = st[e.home]?.[e.pos];
  if (!entry || typeof entry !== 'object') throw new Error(`${where}: 会話データが無い（置き場所が違う？）`);

  // 事前条件＝旧版の本文であること（作業の間にデータが動いていたら止める）。
  // 名前を変える相手は「旧名」でも「新名」でも通す（2回目の実行で止まらないため）。
  const okNames = [e.expectName, ...(e.name ? [e.name] : [])];
  if (!okNames.includes(entry.name)) {
    throw new Error(`${where}: 名前が違う（実データ=${entry.name}／期待=${okNames.join(' or ')}）`);
  }
  const before = JSON.stringify(entry);
  if (!Array.isArray(entry.lines) || !entry.lines.length) throw new Error(`${where}: 本文が無い`);
  const isNew = e.lines ? JSON.stringify(entry.lines) === JSON.stringify(e.lines) : false;
  if (!isNew && entry.lines[0] !== e.expectFirstLine) {
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
  if (e.replaceWord) {
    const [from, to] = e.replaceWord;
    const swap = arr => arr.map(l => l.split(from).join(to));
    entry.lines = swap(entry.lines);
    if (entry.linesAfter) entry.linesAfter = swap(entry.linesAfter);
    for (const key of Object.keys(entry.linesAfterBoss ?? {})) {
      entry.linesAfterBoss[key] = swap(entry.linesAfterBoss[key]);
    }
  }

  // 印
  if (e.mark !== undefined) {
    if (e.mark === null) delete entry.mark;
    else { assertMarkDest(e.mark, e.layer, `${where} mark`); entry.mark = { ...e.mark }; }
  }
  if (e.markAfterBoss !== undefined) {
    if (e.markAfterBoss === null) delete entry.markAfterBoss;
    else {
      for (const [boss, mk] of Object.entries(e.markAfterBoss)) {
        assertMarkDest(mk, e.layer, `${where} markAfterBoss[${boss}]`);
      }
      entry.markAfterBoss = JSON.parse(JSON.stringify(e.markAfterBoss));
    }
  }

  if (JSON.stringify(entry) === before) { console.log(`skip ${where}（既に新版）`); skipped++; continue; }
  rewritten++;
  if (e.mark || e.markAfterBoss) marked++;
}

// hidden_cave に名前を与える（層名が空＝「名前を語る」以前に名前が無かった）
const hc = data.layers.hidden_cave;
if (!hc) throw new Error('hidden_cave 層が無い');
if (hc.name === HIDDEN_CAVE_NAME) console.log('skip hidden_cave の層名（既に新版）');
else if (hc.name) throw new Error(`hidden_cave に既に別の名前がある（${hc.name}）`);
else hc.name = HIDDEN_CAVE_NAME;

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── 自己検証（書いたものを読み直して確かめる）──────────────────
const after = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const problems = [];
if (after.layers.hidden_cave.name !== HIDDEN_CAVE_NAME) problems.push('hidden_cave の層名が入っていない');
for (const e of EDITS) {
  const entry = after.layers[e.layer].stages[e.stage][e.home][e.pos];
  if (e.lines && JSON.stringify(entry.lines) !== JSON.stringify(e.lines)) {
    problems.push(`${e.layer}/${e.stage}[${e.pos}] の本文が入っていない`);
  }
  if (e.name && entry.name !== e.name) problems.push(`${e.layer}/${e.stage}[${e.pos}] の名前が入っていない`);
  if (e.mark && JSON.stringify(entry.mark) !== JSON.stringify(e.mark)) {
    problems.push(`${e.layer}/${e.stage}[${e.pos}] の印が入っていない`);
  }
  if (e.markAfterBoss) {
    for (const boss of Object.keys(e.markAfterBoss)) {
      if (!entry.markAfterBoss?.[boss]) problems.push(`${e.layer}/${e.stage}[${e.pos}] の markAfterBoss[${boss}] が入っていない`);
    }
  }
}
// 帯1に限らずマップ全体の印を見る（既存の印を壊していないことまで確かめる）
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
console.log(`✓ migrate-dialog-band-1: 本文 ${rewritten} 件を書き換え（印を持つのは ${marked} 件）／skip ${skipped} 件`);
console.log(`✓ 自己検証: マップ全体の印 ${markTotal} 件はすべて実在する画面を指している`);
console.log(`✓ hidden_cave の層名 = ${HIDDEN_CAVE_NAME}`);
