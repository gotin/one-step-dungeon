#!/usr/bin/env node
/**
 * migrate-field-6-13-breakable-walls.mjs
 *
 * field/6,13（キュー29・2026-09-22 に検査15を足したとき発覚）の breakableWalls が
 * 素の床 (6,3)/(7,3) を指していて、意図した破壊強度2（強い爆弾でしか壊れない、
 * という設計）が projectile.js の `?.breakDef ?? 1` に黙って落ちている。
 *
 * 実際の壊せる壁 '!' は field/6,13 に3枚：(1,4)（北の部屋の入口脇・単独）、
 * (6,0)/(7,0)（西端の帯・縦に隣接した2枚）。旧データが2キーだったのは
 * 「縦に隣接した2枚を1組として breakDef 2 にする」意図だったと判断し、
 * 形が一致する (6,0)/(7,0) の組へ張り替える。(1,4) は既定の breakDef 1（変更なし）。
 *
 * 自己検証：書き込み前後に (a) 旧キーが (6,3)/(7,3) である (b) 新キー (6,0)/(7,0) が
 * '!' である (c) (1,4) は '!' のまま・breakableWalls に定義を追加しない、を assert する。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const s = map.layers.field?.stages?.['6,13'];

// ── 事前検証 ──
if (!s) throw new Error('field/6,13 が見つからない');
const before = JSON.stringify(s.breakableWalls);
if (before !== JSON.stringify({ '6,3': { breakDef: 2 }, '7,3': { breakDef: 2 } })) {
  throw new Error(`breakableWalls が想定外（実際: ${before}）`);
}
if (s.tiles[6][3] !== '.' || s.tiles[7][3] !== '.') {
  throw new Error('(6,3)/(7,3) は素の床のはず');
}
if (s.tiles[1][4] !== '!' || s.tiles[6][0] !== '!' || s.tiles[7][0] !== '!') {
  throw new Error('実際の壊せる壁 (1,4)/(6,0)/(7,0) の形が変わっている');
}

// ── 変更 ──
s.breakableWalls = { '6,0': { breakDef: 2 }, '7,0': { breakDef: 2 } };

// ── 事後検証 ──
if (s.tiles[6][0] !== '!' || s.tiles[7][0] !== '!') {
  throw new Error('新キー (6,0)/(7,0) が壊せる壁 (!) を指していない');
}
if (JSON.stringify(s.breakableWalls) !== JSON.stringify({ '6,0': { breakDef: 2 }, '7,0': { breakDef: 2 } })) {
  throw new Error('breakableWalls の書き込みが想定外');
}

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
console.log('✅ field/6,13: breakableWalls の鍵を (6,3)/(7,3)（嘘の座標）→ (6,0)/(7,0)（実在の縦2枚組）へ張り替え。');
console.log('   (1,4) は既定の breakDef 1 のまま（変更なし）。');
