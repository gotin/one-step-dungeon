#!/usr/bin/env node
// Phase 9-3 (story B): Renumber "ザーネルの記憶" tablets to PLAY ORDER.
//
// Play order = D1,D2,D3,D4,D6,D5,D8,D7,(塔=終章).
// Tablets are stored per dungeon layer; D1-D4 + dark_tower already match.
// Only the last four need renumbering, and D8/D7 bodies are rewritten so the
// "last shard / road to the tower" beat lands on the TRUE final dungeon (D7),
// not prematurely on D8.
//
//   dungeon_6 (森・5th)  其の六 → 其の五   (body kept)
//   dungeon_5 (雪・6th)  其の五 → 其の六   (body kept)
//   dungeon_8 (沼・7th)  其の八 → 其の七   (body rewritten: "残る欠片は空に一つ")
//   dungeon_7 (空・8th)  ―其の七― → 其の八 (body rewritten: true finale + 祭壇へ)
//
// Run from: outputs/blade-of-lumia/
//   node scripts/migrate-lore-playorder.mjs

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const L = data.layers;

function tablet(layer, stage, key) {
  const sd = L[layer]?.stages?.[stage]?.signData?.[key];
  if (!sd) throw new Error(`tablet not found: ${layer}/${stage}[${key}]`);
  return sd;
}

// ── dungeon_6 (森・5th visit) → 其の五 ──────────────────────────────────────
// Body unchanged: "守護獣を魔物へ変え、八つの欠片を神殿の奥に封じた" fits the
// mid-journey "the land became a monster's nest" beat regardless of number.
tablet('dungeon_6', '0,0', '1,5').name = 'ザーネルの記憶 其の五';

// ── dungeon_5 (雪・6th visit) → 其の六 ──────────────────────────────────────
tablet('dungeon_5', '0,0', '1,5').name = 'ザーネルの記憶 其の六';

// ── dungeon_8 (沼・7th visit) → 其の七 (body rewritten) ─────────────────────
// Was 其の八 ("最後の欠片"/"全て揃えば塔へ") — premature at the 7th dungeon.
const t8 = tablet('dungeon_8', '0,0', '1,5');
t8.name = 'ザーネルの記憶 其の七';
t8.lines = [
  '沼の底に 七つ目の欠片が 眠っていた。',
  '大蝦蟇の守る宝を 奪い返せ。',
  '残る欠片は ただ一つ―― 空の彼方に。',
];

// ── dungeon_7 (空・8th visit = TRUE finale) → 其の八 (body rewritten) ────────
const t7 = tablet('dungeon_7', '0,0', '1,5');
t7.name = 'ザーネルの記憶 其の八';
t7.lines = [
  '嵐の鷲王が 最後の欠片を 守っている。',
  '弓を手に 嵐を穿て。',
  '八つ全てが揃いし時 北の祭壇へ 道は開かれる。',
];

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── verify ─────────────────────────────────────────────────────────────────
const order = [
  ['dungeon_1', '0,0', '1,9', '其の一'],
  ['dungeon_2', '0,0', '1,1', '其の二'],
  ['dungeon_3', '0,0', '1,9', '其の三'],
  ['dungeon_4', '0,0', '1,5', '其の四'],
  ['dungeon_6', '0,0', '1,5', '其の五'],
  ['dungeon_5', '0,0', '1,5', '其の六'],
  ['dungeon_8', '0,0', '1,5', '其の七'],
  ['dungeon_7', '0,0', '1,5', '其の八'],
  ['dark_tower', '0,1', '1,1', '終章'],
];
console.log('Tablets in PLAY order:');
for (const [layer, stage, key, frag] of order) {
  const sd = tablet(layer, stage, key);
  const ok = sd.name.includes(frag);
  console.log(`  ${ok ? '✓' : '✗'} ${layer.padEnd(11)} ${frag}  ${sd.name}`);
  if (!ok) process.exitCode = 1;
}
