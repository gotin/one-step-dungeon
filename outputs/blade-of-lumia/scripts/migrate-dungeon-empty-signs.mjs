#!/usr/bin/env node
/**
 * migrate-dungeon-empty-signs.mjs
 *
 * Fixes dungeon sign ('i') tiles that render blank in-game. A sign is read via
 * openSignDialog(sd) → openDialog(sd.name, sd.lines ?? ['（何も書かれていない）'])
 * (game/game.js:896), so a sign shows "（何も書かれていない）" in TWO cases:
 *   (a) no signData/npcData entry at all, or
 *   (b) a signData entry that is a bare STRING (sd.lines is undefined).
 * A full-map sign audit (2026-07-06) found both classes hiding across layers:
 *
 * Class (a) — missing body (3):
 *   dungeon_3/2,1 @2,5  — interior room of the water labyrinth (D3, reward: bow)
 *   dungeon_6/1,3 @3,5  — ENTRY room of the forest sanctuary (D6, reward: bomb)
 *   dungeon_7/1,3 @3,5  — ENTRY room of the sky ruins (D7, flute-warp landing)
 *
 * Class (b) — string-form signData that never renders (4):
 *   dungeon_5/1,1 @1,3 · dungeon_5/1,2 @7,8 · dungeon_5/1,3 @3,4 · dungeon_8/1,3 @7,4
 *   (the hint text WAS written, just in the wrong shape — normalise to {name,lines}).
 *
 * The entry-room signs act as the classic "first thing you read on entering"
 * hint/flavor. Text follows the existing dungeon sign style ({name, lines[]}).
 *
 * Idempotent: (a) only fills if the tile is 'i' and has no body; (b) only
 * converts entries that are still bare strings.
 * Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

// [layer, stage, "r,c", {name, lines}]
const SIGNS = [
  ['dungeon_3', '2,1', '2,5',
    { name: '水没した碑文', lines: ['「水面の向こうへは、遠く射抜く力で渡れ」', '弓を手にした者への言い伝えだという。'] }],
  ['dungeon_6', '1,3', '3,5',
    { name: '森の聖域・入口の石碑', lines: ['ここは古森の巨人が眠る聖域。', '炎を宿す灯りが、閉ざされた道を開くだろう。'] }],
  ['dungeon_7', '1,3', '3,5',
    { name: '空の遺跡・入口の石碑', lines: ['笛の音に導かれし者よ、よくぞ空へ至った。', '嵐の鷲王を射抜けば、最後の欠片が得られよう。'] }],
];

// Class (b): string-form signData → {name, lines}. Names match dungeon style.
const STRING_FORM = [
  ['dungeon_5', '1,1', '1,3', '氷の廃墟の石碑'],
  ['dungeon_5', '1,2', '7,8', 'ヒント'],
  ['dungeon_5', '1,3', '3,4', '氷の廃墟・入口の石碑'],
  ['dungeon_8', '1,3', '7,4', '沼地の神殿・入口の石碑'],
];

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
let filled = 0, converted = 0;

// (a) fill missing bodies
for (const [layer, stage, pk, body] of SIGNS) {
  const s = data.layers[layer]?.stages?.[stage];
  if (!s) throw new Error(`missing stage ${layer}/${stage}`);
  const [r, c] = pk.split(',').map(Number);
  if (s.tiles[r][c] !== 'i')
    throw new Error(`${layer}/${stage} @${pk} is not an 'i' tile (=${s.tiles[r][c]})`);
  if (s.signData?.[pk] || s.npcData?.[pk]) {   // already has a body → leave it
    console.log(`skip ${layer}/${stage} @${pk} (already has body)`);
    continue;
  }
  s.signData = s.signData || {};
  s.signData[pk] = body;
  filled++;
}

// (b) normalise string-form signData to {name, lines} (split on newlines, strip 「」)
for (const [layer, stage, pk, name] of STRING_FORM) {
  const s = data.layers[layer]?.stages?.[stage];
  if (!s) throw new Error(`missing stage ${layer}/${stage}`);
  const v = s.signData?.[pk];
  if (typeof v !== 'string') {   // already converted (or unexpected) → leave it
    console.log(`skip ${layer}/${stage} @${pk} (not string-form)`);
    continue;
  }
  const lines = v.split('\n').map((l) => l.trim()).filter(Boolean);
  s.signData[pk] = { name, lines };
  converted++;
}

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
console.log(`filled ${filled} empty sign(s), converted ${converted} string-form sign(s).`);
