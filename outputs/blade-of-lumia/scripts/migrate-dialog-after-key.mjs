#!/usr/bin/env node
/**
 * migrate-dialog-after-key.mjs
 *
 * 実行キュー25＝「星の欠片を1つ以上手にした後」の版を、エントリ直下の単独キー `linesAfter` から
 * `linesAfterBoss` の予約キー `after` へ畳む（＝他の版と同じキーの列に住まわせる）。
 *
 * なぜ（ユーザー指摘 2026-09-15）＝単独キーは `linesAfterBoss` のキーの順（＝会話ごとの優先順・
 * エディタの▲▼）の中に位置を持てず、`readEntryVariants()` が常に一番上（一番弱い）に置いていた。
 * ∴「最初のボスを倒した直後はこの台詞／欠片を拾ったらこの台詞」という書き分けができなかった。
 * ボス撃破と欠片の所持は独立した状態（`game/boss.js` は欠片をその場に落とすだけ＝拾うまで
 * `triforceCount` は増えない）∴版の上下でこの2つを書き分けられる。
 *
 * 何をするか（2段）：
 *   (1) `linesAfter` を持つ 6 エントリを機械変換＝`linesAfterBoss.after` の位置は**先頭**
 *       ＝旧実装（常に一番上＝一番弱い）と同じ優先順∴**この移行で今の挙動は1つも変わらない**。
 *       本文は1文字も触らない（配列をそのまま移すだけ）。
 *   (2) 村人ハナ（field `6,13` npcData `5,7`）に `G`（岩のゴーレム＝草原の洞窟のボス）の版を足し、
 *       `after` をその**下**へ置く＝「倒したが欠片は未回収」→ G の版（奥に光が残っていると教える）／
 *       「欠片を回収済み」→ 既存の本文（そのまま）。**新機構が実データで効いていることの番人**
 *       （`tests/editor-dialog-variants.spec.js` ⑮が実ゲームでこの2状態を測る）。
 *       ハナは帯1（既に語り直し済み）の相手＝17番の残り7帯の本文と衝突しない。
 *
 * 冪等：既に新形式なら skip（2回目の実行で何も書かない）。
 * 事前条件：移す本文が実データと一致すること・`linesAfterBoss.after` が既に別内容で存在しないこと。
 *          食い違ったら**書かずに止まる**（黙って上書きしない）。
 * 自己検証：書き終えたファイルを読み直し、①`linesAfter` が1件も残っていない ②6件の `after` の
 *          本文が移行前と一致する ③`markAfterBoss.after` を作っていない ④ハナの並びが
 *          `G` → `after` であることを確かめる。
 *
 * Run from: outputs/blade-of-lumia/
 *   node scripts/migrate-dialog-after-key.mjs
 *   BLADE_MAP_PATH=.scratch/copy.json node scripts/migrate-dialog-after-key.mjs   # 空撃ち
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { AFTER_KEY } from '../shared/dialog-variants.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '../work/blade-of-lumia.json');
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const HOMES = ['npcData', 'signData'];

/** 会話エントリを全部なめる（層・ステージ・置き場所を問わない） */
function* eachEntry(map) {
  for (const [ln, ld] of Object.entries(map.layers ?? {})) {
    for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
      for (const home of HOMES) {
        for (const [pos, entry] of Object.entries(sd[home] ?? {})) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
          yield { where: `${ln}/${sk} ${home}[${pos}]`, entry };
        }
      }
    }
  }
}

// ── (1) `linesAfter` → `linesAfterBoss.after`（先頭＝旧挙動と同じ優先順）─────────
const moved = [];
let skipped = 0;
for (const { where, entry } of eachEntry(data)) {
  if (entry.linesAfter === undefined) continue;
  const lines = Array.isArray(entry.linesAfter) ? entry.linesAfter : [String(entry.linesAfter)];
  if (!lines.length) throw new Error(`${where}: linesAfter が空＝移す本文が無い（手で確かめる）`);

  const lab = entry.linesAfterBoss ?? {};
  const existing = lab[AFTER_KEY];
  if (existing !== undefined) {
    // 既に新形式の版がある＝2回目の実行か、手で書いた版と衝突している。
    if (JSON.stringify(existing) !== JSON.stringify(lines)) {
      throw new Error(`${where}: linesAfterBoss.${AFTER_KEY} が既に別の本文を持っている（手で確かめる）`);
    }
    delete entry.linesAfter;
    skipped++;
    continue;
  }
  // `after` を**先頭**に置き直す（キーの順＝優先順∴入れ直して並びを作る）。
  entry.linesAfterBoss = { [AFTER_KEY]: lines, ...lab };
  delete entry.linesAfter;
  moved.push({ where, lines });
}

// ── (2) 村人ハナ＝欠片の版をボスの版の下に置く実データ1件（機構の番人）────────────
const HANA = { layer: 'field', stage: '6,13', home: 'npcData', pos: '5,7', name: '村人 ハナ' };
const HANA_G = [
  '洞窟の魔物、倒したんだね！すごい……！',
  'でもね、奥からまだ かすかに光がもれてるよ。',
  'あの光、置いてきちゃったんじゃない？',
];
const hana = data.layers[HANA.layer]?.stages?.[HANA.stage]?.[HANA.home]?.[HANA.pos];
if (!hana || typeof hana !== 'object') throw new Error('ハナの会話データが無い（位置が動いた？）');
if (hana.name !== HANA.name) throw new Error(`ハナの名前が違う（実データ=${hana.name}）`);
const hanaLab = hana.linesAfterBoss ?? {};
if (hanaLab[AFTER_KEY] === undefined) throw new Error('ハナの `after` の版が無い＝(1) が走っていない');

let hanaDone = false;
if (hanaLab.G !== undefined) {
  if (JSON.stringify(hanaLab.G) !== JSON.stringify(HANA_G)) {
    throw new Error('ハナに別内容の G の版がある（手で確かめる）');
  }
  hanaDone = true;   // 2回目の実行
} else {
  // 並び＝`G`（倒したが未回収）→ `after`（回収済み）＝下がヒットしたら勝つ。
  hana.linesAfterBoss = { G: [...HANA_G], [AFTER_KEY]: hanaLab[AFTER_KEY], ...omit(hanaLab, [AFTER_KEY]) };
}

function omit(obj, keys) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (!keys.includes(k)) out[k] = v;
  return out;
}

// ── 書き込み ─────────────────────────────────────────────────────────────
writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── 自己検証（読み直して確かめる）────────────────────────────────────────
const after = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const problems = [];
let afterVariants = 0, markAfterMisplaced = 0;
for (const { where, entry } of eachEntry(after)) {
  if (entry.linesAfter !== undefined) problems.push(`${where}: 旧 linesAfter が残っている`);
  if (entry.linesAfterBoss?.[AFTER_KEY] !== undefined) afterVariants++;
  if (entry.markAfterBoss?.[AFTER_KEY] !== undefined) {
    markAfterMisplaced++;
    problems.push(`${where}: markAfterBoss.${AFTER_KEY} は作らない（印を持てない版）`);
  }
}
for (const m of moved) {
  const entry = [...eachEntry(after)].find((x) => x.where === m.where)?.entry;
  if (JSON.stringify(entry?.linesAfterBoss?.[AFTER_KEY]) !== JSON.stringify(m.lines)) {
    problems.push(`${m.where}: 移した本文が入っていない`);
  }
}
const hanaAfter = after.layers[HANA.layer].stages[HANA.stage][HANA.home][HANA.pos];
const hanaKeys = Object.keys(hanaAfter.linesAfterBoss ?? {});
if (hanaKeys.indexOf('G') < 0 || hanaKeys.indexOf(AFTER_KEY) < 0
    || hanaKeys.indexOf('G') > hanaKeys.indexOf(AFTER_KEY)) {
  problems.push(`ハナの並びが G → ${AFTER_KEY} になっていない（実データ=${hanaKeys.join(',')}）`);
}
if (problems.length) {
  console.error('❌ 自己検証で失敗:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`✓ migrate-dialog-after-key: ${moved.length} 件を linesAfterBoss.${AFTER_KEY} へ移した`
  + `（既に新形式 ${skipped} 件）／ハナの G の版＝${hanaDone ? 'skip（既にある）' : '追加'}`);
console.log(`✓ 自己検証: 旧 linesAfter 0 件 / ${AFTER_KEY} の版 ${afterVariants} 件`
  + ` / markAfterBoss.${AFTER_KEY} ${markAfterMisplaced} 件 / ハナの並び ${hanaKeys.join(' → ')}`);
