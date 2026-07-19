#!/usr/bin/env node
// Generate FIELD-BASELINE-METRICS.md from live blade-of-lumia.json.
// Run from: outputs/blade-of-lumia/
//   node scripts/generate-field-metrics.mjs
// Writes to: FIELD-BASELINE-METRICS.md (overwrites if exists).

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  regionDensityMetrics,
  regionBattleScores,
  structuralSimilarityWarnings,
  fieldHonestMetrics,
  underTwoAxisScreens,
  duplicateLayoutGroups,
} from './lib/field-quality.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const OUT_PATH = join(__dir, '../FIELD-BASELINE-METRICS.md');

const mapData = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// ── Compute all metrics ───────────────────────────────────────────────────────
const { reached, w1, seams, traps, orphans } = fieldHonestMetrics(mapData);
const under2 = underTwoAxisScreens(mapData);
const dupGroups = duplicateLayoutGroups(mapData);
const density  = regionDensityMetrics(mapData);
const battle   = regionBattleScores(mapData);
const simWarn  = structuralSimilarityWarnings(mapData, { threshold: 0.995 });

// Region display order
const REGION_ORDER = ['G','F','D','W','L','S','M','P','O','T','K','V','?'];
const REGION_NAME = {
  G:'草原 G', F:'森 F', D:'砂漠 D', W:'湖 W', L:'火山 L', S:'雪 S',
  M:'山地 M', P:'沼 P', O:'深洋 O', T:'空島 T', K:'黒の城 K', V:'村 V', '?':'不明',
};

// Density thresholds by region size (from FIELD-BASELINE-BRAINSTORM.md v1)
// small(<22): puzzle≥2,combat≥1,unique≥1,anchor≥1
// mid(22-30): puzzle≥3,combat≥1,unique≥1,anchor≥1
// large(>30): puzzle≥5,combat≥2,unique≥1,anchor≥2
function densityTarget(screens) {
  if (screens <= 21) return { puzzle:2, combat:1, unique:1, anchor:1 };
  if (screens <= 30) return { puzzle:3, combat:1, unique:1, anchor:1 };
  return { puzzle:5, combat:2, unique:1, anchor:2 };
}
function check(val, target) { return val >= target ? '✅' : '⚠️'; }

// ── Build Markdown ────────────────────────────────────────────────────────────
const lines = [];
const now = new Date().toISOString().slice(0,10);
lines.push(`# FIELD-BASELINE-METRICS — v1（${now} 自動生成）`);
lines.push('');
lines.push('> **自動生成ファイル** — `scripts/generate-field-metrics.mjs` で更新。');
lines.push('> 数値目安は v1 仮値。毎開発で `FIELD-BASELINE-BRAINSTORM.md`「密度の目安」と照合し調整。');
lines.push('');

// ── 1. Honest connectivity ────────────────────────────────────────────────────
lines.push('## 1. 接続指標（ハード目標=全0）');
lines.push('');
lines.push(`- reached: **${reached.size}** / 320`);
lines.push(`- W1 (全封鎖): **${w1.length}** 画面`);
lines.push(`- seams (継ぎ目バグ): **${seams.length}**`);
lines.push(`- traps (到達後詰み): **${traps.length}**`);
lines.push(`- orphans: **${orphans.length}**`);
lines.push(`- under-2-axis (素通り): **${under2.length}**`);
lines.push(`- dup groups (完全一致重複): **${dupGroups.length}**`);
lines.push('');

// ── 2. Density metrics per region ─────────────────────────────────────────────
lines.push('## 2. 密度（地域ごと）');
lines.push('');
lines.push('| 地域 | 画面 | パズル | 戦闘見せ場 | 一回性 | アンカー | 判定 |');
lines.push('|------|-----:|------:|----------:|------:|--------:|------|');
for (const r of REGION_ORDER) {
  const d = density.get(r);
  if (!d || d.screens === 0) continue;
  const t = densityTarget(d.screens);
  const ok = d.puzzle>=t.puzzle && d.combat>=t.combat && d.unique>=t.unique && d.anchor>=t.anchor;
  const flag = ok ? '✅' : '⚠️';
  const note = ok ? '' : [
    d.puzzle<t.puzzle?`パズル${d.puzzle}<${t.puzzle}`:'',
    d.combat<t.combat?`戦闘${d.combat}<${t.combat}`:'',
    d.unique<t.unique?`一回性${d.unique}<${t.unique}`:'',
    d.anchor<t.anchor?`アンカー${d.anchor}<${t.anchor}`:'',
  ].filter(Boolean).join('・');
  lines.push(`| ${REGION_NAME[r]??r} | ${d.screens} | ${d.puzzle} ${check(d.puzzle,t.puzzle)} | ${d.combat} ${check(d.combat,t.combat)} | ${d.unique} ${check(d.unique,t.unique)} | ${d.anchor} ${check(d.anchor,t.anchor)} | ${flag}${note?' '+note:''} |`);
}
lines.push('');
lines.push('*目安: 小(≤21)=パズル2/戦闘1/一回性1/アンカー1、中(22-30)=3/1/1/1、大(>30)=5/2/1/2*');
lines.push('');

// ── 3. Battle score per region ────────────────────────────────────────────────
lines.push('## 3. バトル難易度スコア分布（地域ごと）');
lines.push('');
lines.push('> score = (敵脅威 × 数補正 + 地形ハザード) / expectedPower(地域)');
lines.push('');
lines.push('| 地域 | 画面 | 戦闘0画面 | 平均スコア | 最大スコア |');
lines.push('|------|-----:|--------:|----------:|----------:|');
for (const r of REGION_ORDER) {
  const b = battle.get(r);
  if (!b || b.scores.length === 0) continue;
  const d = density.get(r);
  const screens = d?.screens ?? b.scores.length;
  lines.push(`| ${REGION_NAME[r]??r} | ${screens} | ${b.zeroCount} | ${b.mean} | ${b.max} |`);
}
lines.push('');

// ── 4. Structural similarity warnings ─────────────────────────────────────────
lines.push('## 4. 構造的類似度警告（閾値 0.995・コンテンツ画面のみ対象）');
lines.push('');
if (simWarn.length === 0) {
  lines.push('警告なし ✅');
} else {
  lines.push(`**${simWarn.length} ペア**が閾値を超えて類似（diff が小さすぎる可能性）。`);
  lines.push('');
  lines.push('| 地域 | 画面A | 画面B | 類似度 |');
  lines.push('|------|-------|-------|------:|');
  for (const { region, a, b, similarity } of simWarn.slice(0, 50)) {
    lines.push(`| ${REGION_NAME[region]??region} | ${a} | ${b} | ${similarity} |`);
  }
  if (simWarn.length > 50) lines.push(`\n*(上位50件表示・全${simWarn.length}件)*`);
}
lines.push('');

// ── 5. Snapshot note ──────────────────────────────────────────────────────────
lines.push('## 5. スナップショット');
lines.push('');
lines.push(`更新: ${now}  `);
lines.push('数値目安は FIELD-BASELINE-BRAINSTORM.md「密度の目安」を参照。毎開発で調整。');
lines.push('');

writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');
console.log(`✅ Written: ${OUT_PATH}`);
console.log(`   reached=${reached.size} seams=${seams.length} traps=${traps.length} under2=${under2.length} dups=${dupGroups.length}`);
console.log(`   similarity warnings: ${simWarn.length}`);
