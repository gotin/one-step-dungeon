#!/usr/bin/env node
// 実行キュー16（目的地マーク）: 機構を動かすための最初のマークを1件だけ置く。
//
// なぜ1件だけか＝「どの NPC・看板が何を教えるか」は会話の設計そのもので、
// キュー17（NPC・看板の会話設計）の担当。ここで台詞を書き換えると 17 を先食いする。
// ∴**既にある台詞と食い違わない1件**だけを種として付ける：
//
//   field [7,14] の 老賢者（npcData "3,3"）
//     台詞（既存・書き換えない）＝「まず旅支度を。そこの剣を拾い、村すぐ西の洞窟で
//     力試しをするがよい。」
//   → 教える目的地＝field [6,13]（実測＝mapEnters "8,8" が destId:"dungeon_1"）
//     dungeon_1 の名前は「草原の洞窟」（layers.dungeon_1.name）∴印の名前もそれに揃える。
//
// 実行場所: outputs/blade-of-lumia/
//   node scripts/migrate-seed-map-mark.mjs

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const SAGE_STAGE = '7,14';   // 老賢者が居る field の画面
const SAGE_POS   = '3,3';    // その画面での位置（行,列）
const DEST_STAGE = '6,13';   // dungeon_1（草原の洞窟）の入口がある field の画面
const DEST_LAYER = 'field';

const field = data.layers[DEST_LAYER]?.stages;
if (!field) throw new Error('field レイヤーが無い');

// ── 前提の裏取り（データが動いていたら黙って壊さず止まる）────────────────
const sage = field[SAGE_STAGE]?.npcData?.[SAGE_POS];
if (!sage) throw new Error(`老賢者が居ない: ${DEST_LAYER}/${SAGE_STAGE} npcData[${SAGE_POS}]`);
if (sage.name !== '老賢者') throw new Error(`別の NPC が居る: ${sage.name}`);

const dest = field[DEST_STAGE];
if (!dest) throw new Error(`行き先の画面が無い: ${DEST_LAYER}/${DEST_STAGE}`);
const enters = Object.values(dest.mapEnters ?? {});
if (!enters.some(e => e.destId === 'dungeon_1')) {
	throw new Error(`${DEST_STAGE} に dungeon_1 の入口が無い（入口が移された？）`);
}

const label = data.layers.dungeon_1?.name ?? '草原の洞窟';

// ── 付ける ──────────────────────────────────────────────────────────────
sage.mark = { layer: DEST_LAYER, stage: DEST_STAGE, label, kind: 'dungeon' };

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
console.log('migrate-seed-map-mark: done');
console.log(`  ${DEST_LAYER}/${SAGE_STAGE} 老賢者(${SAGE_POS}) → mark ${DEST_LAYER}/${DEST_STAGE}「${label}」(dungeon)`);
