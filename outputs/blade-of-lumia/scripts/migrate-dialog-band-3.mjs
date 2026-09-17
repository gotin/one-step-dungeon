#!/usr/bin/env node
/**
 * migrate-dialog-band-3.mjs
 *
 * 実行キュー 17-4＝帯3（D3 水の迷宮＋寄道 secret_grotto）の語りを作り直し、目的地マークを配る。
 * 対象は湖まわりの field 6 画面（`9,9`／`8,6`／`10,7`／`7,9`／`8,10`／`5,6`／`4,11`）と
 * `dungeon_3`・`secret_grotto`。あわせて**秘密の洞窟の入口を `field 9,9` から `field 8,9` へ移す**。
 *
 * 直す理由（すべて 2026-09-17 に一次ソース＝work/blade-of-lumia.json／shared/enemies.js／
 * shared/items.js／game/enemy-ai.js を実測して確認。ユーザー承認済み＝PLAN.md 17-4 の
 * 「📋 17-4 の承認済み内容」節）：
 *   ①`field 9,9` の【水の迷宮】が「水路が複雑に入り組み」と言うが D3 全18室の水は 34 マスだけ
 *     ＝迷路ではない（正体は弓の迷宮）。
 *   ②`dungeon_3 1,3` の入口の立札が「番兵が遠くから槍を投げる」と言うが槍のセンチネル F は
 *     D3 に居ない（居るのは η 術士の魔弾）。ただし「盾で防げる」は真（magicBolt は stone と
 *     同じ分岐で飛ぶ＝enemy-ai.js:1996）∴敵の名だけ直す。
 *   ③`dungeon_3 2,1`「水没した碑文」＝その部屋の水は 0 マス。
 *   ④`dungeon_3 0,1` がボス J の実態を語れていない（鍵の扉・def は 2 だけ・矢が弱点×2・
 *     coil の締め付け）。
 *   ⑤`secret_grotto 0,0`「元の場所へ戻れる」＝実際は片道（fluteEffect は field `2,0`＝
 *     風の環状列石＝空中の遺跡の入口画面へのワープ）。
 *   ⑥`secret_grotto 2,0`「雲の上」＝岩窟で空のタイルは 0。
 *   ⑦`secret_grotto 1,0` が必須の爆弾の壁（breakableWalls{"3,2":breakDef 2}）を語っていない。
 *   ⑧すみっこずきの方角2語（沼地の道は東ではなく南6／秘密の洞窟は移設先の西1）。
 *   ⑨`field 5,6`「東 … 湖」＝実測 南3東4。⑩`field 4,11`「北 … 湖」＝実測 北2東5。
 *
 * 入口の移設（ユーザー承認 2026-09-17）＝`field 9,9` は D3 の入口と秘密の洞窟の入口を同居させて
 * いたが、印は 1 画面 1 つ（markId(layer,stage)）で、この画面のラベルは帯1〜2 が既に「水の迷宮」で
 * 確定している∴秘密の洞窟が印を持てなかった。笛で現れる入口を `field 8,9 (1,10)`（岩 M の真下）へ
 * 移し、`field 9,9` の石碑に「秘密の洞窟＝`8,9`」の印を持たせる。
 * `field_secret_entrance` を destId に持つ側は無い（JSON 全体で 1 回だけ登場）∴相手側の着地セルは
 * 動かない（洞窟側の着地 `secret_grotto 0,0 (5,2)` は不変）。
 *
 * 温存（触らない）：すみっこずき・怪しい旅人の口調（方角の語だけ直す）・`dungeon_3 0,0`
 * （ザーネルの記憶 其の三＝ボス部屋系列）・`dungeon_3 1,3 (1,9)` の本文（名前だけ改める）・
 * `field 9,10`（暗黒の塔の牢＝帯8 の担当）・報酬（キュー13 の担当）。
 *
 * 冪等：本文・印・タイルが既に新版なら書かない（skip と数える）。
 * 事前条件：旧版の本文（name と lines）・タイルが実データと一致することを確かめてから書く。
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
const MARK_DUNGEON_3 = { layer: 'field', stage: '9,9',  label: '水の迷宮',   kind: 'dungeon' };
const MARK_DUNGEON_4 = { layer: 'field', stage: '12,2', label: '炎の神殿',   kind: 'dungeon' };
const MARK_DUNGEON_7 = { layer: 'field', stage: '2,0',  label: '空中の遺跡', kind: 'dungeon' };
const MARK_GROTTO    = { layer: 'field', stage: '8,9',  label: '秘密の洞窟', kind: 'cave' };

/**
 * 入口の移設。'>'（MAP_ENTER）とその mapEnter／出現条件／笛の効果を、別の画面のセルへ移す。
 * 冪等＝移設後の形（from が床・to が '>'）なら何もしない。
 */
const MOVES = [
  {
    layer: 'field',
    from: { stage: '9,9', pos: '5,3' },
    to:   { stage: '8,9', pos: '1,10' },
    enterId: 'field_secret_entrance',
    // 移設後の笛の効果（岩肌の前で吹く＝to の画面の絵に合わせて文言も変える）
    fluteEffect: {
      type: 'reveal',
      message: '{{flute}} 音色に応えて 岩肌の 洞窟の 入口が 現れた！',
    },
  },
];

/** 新設する会話（既存タイルは '.'＝床）＝タイルを 'i'（看板）へ変え、signData を新設する。 */
const CREATES = [
  // ── dungeon_3 1,2（弓矢の櫃の部屋）── 現地のしおりが 1 枚も無かった ──
  {
    layer: 'dungeon_3', stage: '1,2', pos: '1,4', home: 'signData',
    name: '射手の覚え書き',
    lines: [
      'この 部屋の {{bow}} 弓が この迷宮の 鍵だ。',
      '水の 向こうの 錠 ◎ は 矢だけが 打てる。',
      '矢は 尽きる。落ちた 矢を 拾い 集めよ。',
    ],
  },
];

/**
 * 既存会話の直し。
 *   lines＝本文の完全な差し替え（省くと本文は温存＝印・道具版だけ足す）
 *   replaceLines＝行単位の差し替え（不可侵の口調を保ちつつ方角だけ直す用）
 *   itemVersions＝道具の版｛itemId: { lines, mark? }｝（キュー26＝linesAfterBoss/markAfterBoss へ住む）
 */
const EDITS = [
  // ── field 9,9（3,9）水の迷宮の石碑 ── 迷路の嘘を弓の実態へ＋印 ─────
  {
    layer: 'field', stage: '9,9', pos: '3,9', home: 'npcData',
    expectName: '石碑', name: '水の迷宮の石碑',
    expectFirstLine: '【水の迷宮】',
    lines: [
      '【水の迷宮】',
      '水底に沈んだ古代の迷宮。',
      '水路は 細く、対岸の 錠は {{arrow}} 矢でしか 打てぬ。',
      '→ 入口はすぐ右。',
    ],
    mark: MARK_DUNGEON_3,
    markAfterBoss: { J: MARK_DUNGEON_4 },
  },
  // ── field 9,9（7,8）秘密の洞窟の石碑 ── 移設先の案内＋帰りの笛の警告＋印 ──
  {
    layer: 'field', stage: '9,9', pos: '7,8', home: 'npcData',
    expectName: '石碑', name: '秘密の洞窟の石碑',
    expectFirstLine: '【秘密の洞窟】',
    lines: [
      '【秘密の洞窟】',
      '岩肌に隠された 古い洞窟。',
      '笛の音色だけが その入口を開く。',
      '→ 西へ ひとつ。岸の 岩肌の 前で {{flute}} 笛を 吹け。',
      '奥には 銀の剣が 眠るという。',
      '帰りに吹く笛は、この岸へは 戻さぬという。',
    ],
    mark: MARK_GROTTO,
  },
  // ── field 9,9（1,11）すみっこずき ── 口調は不可侵∴方角の語だけ直す ──
  {
    layer: 'field', stage: '9,9', pos: '1,11', home: 'npcData',
    expectName: 'すみっこずき',
    expectFirstLine: '気味の悪い生き物がうようよしてて怖くてここに隠れてたのです。',
    replaceLines: [
      [4, 'すぐ南には 水の迷宮の入口。西の岸の岩肌には 笛を吹くと現れる 秘密の洞窟があるらしい。'],
      [5, 'ずっと南（下）へ進むと 沼地の道に出るみたい。鍵のかかった扉の先に 古い洞窟があるんだとか。'],
    ],
  },
  // ── field 8,6（6,3）── 湖ではなく草原の小池（水 8 マス）＋ブーメランの版＋印 ──
  {
    layer: 'field', stage: '8,6', pos: '6,3', home: 'signData',
    expectName: '湖を望む立札', name: '草原の小池の立札',
    expectFirstLine: '水の向こうの 小島に 光る物。',
    mark: MARK_DUNGEON_3,
    itemVersions: {
      boomerang: {
        lines: [
          '水の向こうの 小島に 光る物。',
          '{{boomerang}} その 旋る刃なら 投げて 手繰り寄せられる。',
        ],
      },
    },
  },
  // ── field 10,7（3,4）── 名前を土地の物に＋ブーメランの版＋印 ──────
  {
    layer: 'field', stage: '10,7', pos: '3,4', home: 'signData',
    expectName: '湖に浮かぶ 小島の光', name: '湖渡りの橋の立札',
    expectFirstLine: '橋の 架からぬ 小島に 光る物。',
    mark: MARK_DUNGEON_3,
    itemVersions: {
      boomerang: {
        lines: [
          '橋の 架からぬ 小島に 光る物。',
          '{{boomerang}} 投げて 手繰れば 手元へ 来る。',
        ],
      },
    },
  },
  // ── field 7,9（2,6）湖畔の的 ── 本文温存・弓の版＋印 ─────────────
  {
    layer: 'field', stage: '7,9', pos: '2,6', home: 'signData',
    expectName: '湖畔の的 (まと)',
    expectFirstLine: '水の向こうの 石の目。',
    mark: MARK_DUNGEON_3,
    itemVersions: {
      bow: {
        lines: [
          '水の向こうの 石の目。',
          '{{bow}} 矢を 番えれば 射抜ける。',
        ],
      },
    },
  },
  // ── field 8,10（5,3）湖の飛び石 ── 本文温存・はしごの版＋印 ────────
  {
    layer: 'field', stage: '8,10', pos: '5,3', home: 'signData',
    expectName: '湖の 飛び石',
    expectFirstLine: '向こう岸まで 一歩 届かぬ 淵。',
    mark: MARK_DUNGEON_3,
    itemVersions: {
      ladder: {
        lines: [
          '向こう岸まで 一歩 届かぬ 淵。',
          '{{ladder}} はしごを 渡せば 越えられる。',
        ],
      },
    },
  },
  // ── field 5,6（3,6）草原の辻の道標 ── 湖は東ではなく南東（実測 南3東4）──
  {
    layer: 'field', stage: '5,6', pos: '3,6', home: 'signData',
    expectName: '草原の辻の道標',
    expectFirstLine: '東 … 湖と 遺跡への道',
    replaceLines: [[0, '南東 … 湖と 遺跡への道']],
    mark: MARK_DUNGEON_3,
  },
  // ── field 4,11（3,6）南への道標 ── 湖は北ではなく北東（実測 北2東5）──
  {
    layer: 'field', stage: '4,11', pos: '3,6', home: 'signData',
    expectName: '南への道標',
    expectFirstLine: '南 … 村と 城下へ',
    replaceLines: [[1, '北東 … 湖と 峰の道']],
    mark: MARK_DUNGEON_3,
  },
  // ── dungeon_3 1,3（3,5）入口の立札 ── 槍の番兵は居ない∴術士の魔弾へ ──
  {
    layer: 'dungeon_3', stage: '1,3', pos: '3,5', home: 'signData',
    expectName: '水の迷宮の入口', name: '水の迷宮の入口の立札',
    expectFirstLine: '番兵が遠くから槍を投げる。',
    lines: [
      '水底の 術士が 遠くから 魔弾を 放つ。',
      '{{shield}} 盾を 構えれば 弾ける。構えたまま 詰め寄れ。',
      '奥の 錠には 手が 届かぬ。{{bow}} 遠矢が 要る。',
    ],
  },
  // ── dungeon_3 1,3（1,9）── 「其のN」はボス部屋系列だけの物にする（帯2の申し送り③）──
  {
    layer: 'dungeon_3', stage: '1,3', pos: '1,9', home: 'npcData',
    expectName: 'ザーネルの記憶 ―其の三―', name: '水に滲んだ手記',
  },
  // ── dungeon_3 2,1（2,5）── その部屋に水は無い∴名前を渇いた碑文へ（本文は温存）──
  {
    layer: 'dungeon_3', stage: '2,1', pos: '2,5', home: 'signData',
    expectName: '水没した碑文', name: '渇いた碑文',
    expectFirstLine: '「水面の向こうへは、遠く射抜く力で渡れ」',
  },
  // ── dungeon_3 1,1（8,1）── name:"ヒント" を世界の中の名前へ（帯2の申し送り④）──
  {
    layer: 'dungeon_3', stage: '1,1', pos: '8,1', home: 'signData',
    expectName: 'ヒント', name: '水鏡の立札',
    expectFirstLine: '北東の小島に 矢スイッチ ◎ がある。',
    lines: [
      '北東の 小島に 錠 ◎ が ひとつ。',
      '下の 通路から 上へ {{arrow}} 矢を 放て。',
    ],
  },
  // ── dungeon_3 0,1（1,7）── 鍵の扉・矢が弱点×2・締め付けを予告する ────
  {
    layer: 'dungeon_3', stage: '0,1', pos: '1,7', home: 'signData',
    expectName: '水の扉の脇の立札', name: '海蛇の扉の立札',
    expectFirstLine: [
      'この扉の奥に 深海の海蛇が潜む。',                        // 出荷時
      'この扉は {{key}} 鍵で 開く。奥に 深海の海蛇が 潜む。',   // 1周目で書いた形（下記の2行目だけ直す）
    ],
    // ⚠️ 2行目は「敵の名（深海／海蛇）」と「効く行い（矢・弓・射）」を**同じ1行**に
    // 置かねばならない＝`tests/weakness-hints.spec.js` ② の不変条件（強制経路の立札に
    // 「誰に何をするか」が1行で読めること）。1周目は名前を1行目・矢を2行目に分けて
    // 書いたため赤くなった∴2行目に「海蛇」を戻した。
    lines: [
      'この扉は {{key}} 鍵で 開く。奥に 深海の海蛇が 潜む。',
      '重ねた鱗は 刃を 鈍らせる。海蛇には {{arrow}} 矢が 二倍に 刺さる。',
      '巻きついて 締め上げてくる。間合いを 空けて 射よ。',
    ],
  },
  // ── secret_grotto 0,0（5,5）── 笛は片道（風の環状列石へ）＋空中の遺跡の印 ──
  {
    layer: 'secret_grotto', stage: '0,0', pos: '5,5', home: 'npcData',
    expectName: '石碑', name: '風を呼ぶ石碑',
    expectFirstLine: 'ここで もう一度 笛を吹けば',
    lines: [
      '【秘密の洞窟】',
      'ここで {{flute}} 笛を吹けば 風が 運んでくれる。',
      'されど 運ばれる先は 入ってきた 岸では ない。',
      '風の環状列石――空中の遺跡の 傍らへ 出る。',
    ],
    mark: MARK_DUNGEON_7,
  },
  // ── secret_grotto 1,0（7,1）── 必須の爆弾の壁を足す ─────────────
  {
    layer: 'secret_grotto', stage: '1,0', pos: '7,1', home: 'npcData',
    expectName: '石碑', name: '断たれた歩廊の石碑',
    expectFirstLine: '【断たれた歩廊】',
    lines: [
      '【断たれた歩廊】',
      '歩廊は 深い裂け目に断たれた。',
      '脆い岩が 道を 塞ぐ。{{bomb}} 爆ぜる力で 砕け。',
      'その先の 錠は 手では届かぬ。{{arrow}} 遠矢のみが これを打てる。',
    ],
  },
  // ── secret_grotto 2,0（1,5）── 雲の上ではなく岩窟＋盾の守り手＋銀の剣 ──
  {
    layer: 'secret_grotto', stage: '2,0', pos: '1,5', home: 'npcData',
    expectName: '石碑', name: '銀の玉座の石碑',
    expectFirstLine: '【銀の玉座】',
    lines: [
      '【銀の玉座】',
      '岩窟の 奥に 忘れられた 王の間。',
      '{{shield}} 盾を 構えた 守り手は 正面を 弾く。回り込んで 討て。',
      'すべて 討ち倒した者にのみ {{sword}} 銀の剣は 鞘を離れる。',
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

let moved = 0, created = 0, rewritten = 0, marked = 0, itemVersioned = 0, skipped = 0;

// ⓪ 入口の移設（'>' ＋ mapEnter ＋ 出現条件 ＋ 笛の効果）
for (const mv of MOVES) {
  const where = `${mv.layer} ${mv.from.stage}[${mv.from.pos}] → ${mv.to.stage}[${mv.to.pos}]（入口の移設）`;
  const src = data.layers[mv.layer]?.stages?.[mv.from.stage];
  const dst = data.layers[mv.layer]?.stages?.[mv.to.stage];
  if (!src || !dst) throw new Error(`${where}: ステージが無い`);
  const [sr, sc] = mv.from.pos.split(',').map(Number);
  const [dr, dc] = mv.to.pos.split(',').map(Number);
  const srcTile = src.tiles[sr][sc], dstTile = dst.tiles[dr][dc];

  if (srcTile === '.' && dstTile === '>' && dst.mapEnters?.[mv.to.pos]?.id === mv.enterId) {
    console.log(`skip ${where}（既に移設済み）`);
    skipped++;
    continue;
  }
  // 事前条件＝移設前の形であること（別の物を潰す事故を防ぐ）
  const enter = src.mapEnters?.[mv.from.pos];
  if (srcTile !== '>') throw new Error(`${where}: 移設元のタイルが '>' でない（実データ='${srcTile}'）`);
  if (enter?.id !== mv.enterId) throw new Error(`${where}: 移設元の入口 id が違う（実データ=${JSON.stringify(enter)}）`);
  if (dstTile !== '.') throw new Error(`${where}: 移設先のタイルが床でない（実データ='${dstTile}'）`);
  if (dst.mapEnters && Object.keys(dst.mapEnters).length) {
    throw new Error(`${where}: 移設先に既に入口がある（1画面1印の制約∴ここへは移さない）`);
  }
  // この入口を destId に持つ側が居ないこと＝相手側の着地セルを動かさずに済むことの確認
  // （[[blade-map-enter-moves-landing-cell]]＝'>' を動かすと対になる着地セルも動く）
  for (const [lk, ld] of Object.entries(data.layers)) {
    for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
      for (const [pk, en] of Object.entries(sd.mapEnters ?? {})) {
        if (en?.destId === mv.enterId) {
          throw new Error(`${where}: ${lk}/${sk}[${pk}] が destId=${mv.enterId} を指している＝着地セルの付け替えが必要`);
        }
      }
    }
  }

  const cond = src.showConditions?.[mv.from.pos];

  // 移設元を床へ戻す
  src.tiles[sr][sc] = '.';
  delete src.mapEnters[mv.from.pos];
  if (cond) delete src.showConditions[mv.from.pos];
  // 笛の効果は「この画面のこの入口」専用∴移設元からは外す
  if (src.fluteEffect) delete src.fluteEffect;

  // 移設先へ置く
  dst.tiles[dr][dc] = '>';
  dst.mapEnters ??= {};
  dst.mapEnters[mv.to.pos] = { ...enter };
  if (cond) { dst.showConditions ??= {}; dst.showConditions[mv.to.pos] = { ...cond }; }
  if (mv.fluteEffect) dst.fluteEffect = { ...mv.fluteEffect };
  moved++;
}

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
  st[c.home] ??= {};
  st[c.home][c.pos] = {
    name: c.name,
    lines: [...c.lines],
    ...(c.mark ? { mark: { ...c.mark } } : {}),
  };
  created++;
  if (c.mark) marked++;
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
  // 行単位の差し替えは1回目で1行目が変わり得る∴既に新版の行が入っていれば事前条件を免除する
  const lineAlreadyNew = (e.replaceLines ?? []).some(([idx, text]) => entry.lines[idx] === text);
  // expectFirstLine は配列も受ける＝一度流し込んだ後に本文を直す2周目でも、
  // 「出荷時の1行目」と「1周目で書いた1行目」の両方を通せるようにするため。
  const okFirstLines = [e.expectFirstLine].flat().filter(Boolean);
  if (okFirstLines.length && !isNewLines && !lineAlreadyNew && !okFirstLines.includes(entry.lines[0])) {
    throw new Error(`${where}: 1行目が想定と違う（実データ=${entry.lines[0]}）`);
  }

  // 本文
  if (e.name) entry.name = e.name;
  if (e.lines) entry.lines = [...e.lines];
  for (const [idx, text] of e.replaceLines ?? []) {
    if (entry.lines.length <= idx) throw new Error(`${where}: ${idx + 1}行目が無い`);
    entry.lines[idx] = text;
  }

  // 印（基本）
  if (e.mark !== undefined) {
    if (e.mark === null) delete entry.mark;
    else { assertMarkDest(e.mark, e.layer, `${where} mark`); entry.mark = { ...e.mark }; }
  }
  // 印（踏破後）
  for (const [boss, mk] of Object.entries(e.markAfterBoss ?? {})) {
    assertMarkDest(mk, e.layer, `${where} markAfterBoss[${boss}]`);
    entry.markAfterBoss ??= {};
    entry.markAfterBoss[boss] = { ...mk };
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
  if (e.mark || e.markAfterBoss) marked++;
  if (e.itemVersions) itemVersioned++;
}

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── 自己検証（書いたものを読み直して確かめる）──────────────────
const after = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const problems = [];

for (const mv of MOVES) {
  const src = after.layers[mv.layer].stages[mv.from.stage];
  const dst = after.layers[mv.layer].stages[mv.to.stage];
  const [sr, sc] = mv.from.pos.split(',').map(Number);
  const [dr, dc] = mv.to.pos.split(',').map(Number);
  if (src.tiles[sr][sc] !== '.') problems.push(`${mv.from.stage}[${mv.from.pos}] が床に戻っていない`);
  if (src.mapEnters?.[mv.from.pos]) problems.push(`${mv.from.stage}[${mv.from.pos}] の mapEnter が残っている`);
  if (src.showConditions?.[mv.from.pos]) problems.push(`${mv.from.stage}[${mv.from.pos}] の出現条件が残っている`);
  if (src.fluteEffect) problems.push(`${mv.from.stage} の fluteEffect が残っている`);
  if (dst.tiles[dr][dc] !== '>') problems.push(`${mv.to.stage}[${mv.to.pos}] が '>' になっていない`);
  if (dst.mapEnters?.[mv.to.pos]?.id !== mv.enterId) problems.push(`${mv.to.stage}[${mv.to.pos}] の入口 id が入っていない`);
  if (!dst.showConditions?.[mv.to.pos]) problems.push(`${mv.to.stage}[${mv.to.pos}] の出現条件が入っていない`);
  if (dst.fluteEffect?.type !== 'reveal') problems.push(`${mv.to.stage} の fluteEffect が入っていない`);
  // 行が文字配列のままであること（join した文字列にするとゲームが落ちる）
  for (const [label, st] of [[mv.from.stage, src], [mv.to.stage, dst]]) {
    if (!st.tiles.every(r => Array.isArray(r))) problems.push(`field ${label} の tiles が文字配列でなくなった`);
  }
}
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
  for (const [idx, text] of e.replaceLines ?? []) {
    if (entry.lines[idx] !== text) problems.push(`${e.layer}/${e.stage}[${e.pos}] の ${idx + 1}行目が入っていない`);
  }
  if (e.name && entry.name !== e.name) problems.push(`${e.layer}/${e.stage}[${e.pos}] の名前が入っていない`);
  if (e.mark && JSON.stringify(entry.mark) !== JSON.stringify(e.mark)) {
    problems.push(`${e.layer}/${e.stage}[${e.pos}] の印が入っていない`);
  }
  for (const boss of Object.keys(e.markAfterBoss ?? {})) {
    if (!entry.markAfterBoss?.[boss]) problems.push(`${e.layer}/${e.stage}[${e.pos}] の markAfterBoss[${boss}] が入っていない`);
  }
  if (e.itemVersions) {
    for (const itemId of Object.keys(e.itemVersions)) {
      const key = itemVariantKey(itemId);
      if (!entry.linesAfterBoss?.[key]) problems.push(`${e.layer}/${e.stage}[${e.pos}] の linesAfterBoss[${key}] が入っていない`);
    }
  }
}
// 帯3に限らずマップ全体の印を見る（既存の印を壊していないことまで確かめる）
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
console.log(`✓ migrate-dialog-band-3: 入口の移設 ${moved} 件／新設 ${created} 件／本文 ${rewritten} 件を書き換え（印を持つのは ${marked} 件・道具版を足したのは ${itemVersioned} 件）／skip ${skipped} 件`);
console.log(`✓ 自己検証: マップ全体の印 ${markTotal} 件はすべて実在する画面を指している`);
