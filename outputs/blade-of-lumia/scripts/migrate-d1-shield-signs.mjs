#!/usr/bin/env node
/**
 * migrate-d1-shield-signs.mjs
 *
 * D1（森の遺跡）で「木の盾を手に入れてから W 魔物と戦う」ことを立札で示す。
 * 2026-08-26 のユーザー判定＝W の実プレイで「盾がない状態はかなりきつい」→ 対処は
 * 【A 現状維持（配置は動かさない）＋立札で誘導】に決定（PLAN 8-4 (4) の W の記録）。
 *
 * 実マップで裏取りした地形（ステージキーは "列,行"・部屋内は "行,列"）：
 *   入口 1,3 →（北）1,2 →（北）1,1 ＝木の盾の宝箱(3,5) →（北）1,0 ＝W の初戦
 *   1,1 は D1 の関節（`bfsLayer(..., { blockedRoom: '1,1' })` で 1,0 / 2,0 / 3,0 が
 *   丸ごと落ちる）∴木の盾の部屋は W への強制経路上にある。立札を置くのは
 *   「W の部屋に入るまでに必ず通る3部屋」＝1,3（入口）/ 1,2（分かれ道）/ 1,1（盾の部屋）。
 *
 * やること3つ：
 *   (1) 1,3 @3,5（既存「洞窟の入口」）＝盾の在処を**方角**で示す（北へ二部屋）。
 *   (2) 1,2 @7,5（**新設**）＝南の入口を入ってすぐ読む位置。ここは東西南北へ分かれる
 *       部屋∴「盾はこっち（北）」を言うのに一番効く。'i' は通行を塞ぐが、南北の車線は
 *       列5と列6の2本ある∴列6が空いたままで接続は不変（要 check-dungeon-connectivity）。
 *   (3) 1,1 @7,5（既存「ヒント」）＝「この部屋の宝箱が木の盾」と明言する（旧文は守護者の
 *       警告と盾の使い方だけで、盾がここにあることを言っていなかった）。
 *
 * 冪等：文面が既に新版なら何もしない／'i' が既にあれば tile は触らない。
 * Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

// [stage, "r,c", {name, lines}, 期待するタイル（'i' 新設なら null）]
const SIGNS = [
  ['1,3', '3,5', {
    name: '洞窟の入口',
    lines: [
      '奥に盾と輝く欠片が眠る。',
      '木の盾は北へ二つ進んだ部屋の宝箱だ。',
      '魔物と斬り合う前に手に入れよ。',
    ],
  }, 'i'],
  ['1,2', '7,5', {
    name: '北への道しるべ',
    lines: [
      '木の盾はこの北の部屋にある。',
      'その先の部屋には強き魔物が棲む。',
      '盾を手にせぬまま北へ進むな。',
    ],
  }, null],
  ['1,1', '7,5', {
    name: 'ヒント',
    lines: [
      'この部屋の宝箱に木の盾がある。',
      '北の部屋には強き守護者が待ち受ける。',
      '盾で飛び道具を防ぎながら戦え。',
    ],
  }, 'i'],
];

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
let placed = 0, rewritten = 0, skipped = 0;

for (const [stage, pk, body, expectTile] of SIGNS) {
  const s = data.layers.dungeon_1?.stages?.[stage];
  if (!s) throw new Error(`missing stage dungeon_1/${stage}`);
  const [r, c] = pk.split(',').map(Number);
  const tile = s.tiles[r][c];

  if (expectTile === 'i') {
    if (tile !== 'i') throw new Error(`dungeon_1/${stage} @${pk} は 'i' ではない (=${tile})`);
  } else if (tile !== 'i') {
    if (tile !== '.') throw new Error(`dungeon_1/${stage} @${pk} は床ではない (=${tile})＝別の物を潰す`);
    if (s.npcData?.[pk] || s.shopData?.[pk]) throw new Error(`dungeon_1/${stage} @${pk} は他の対話物が居る`);
    s.tiles[r][c] = 'i';
    placed++;
  }

  s.signData = s.signData || {};
  const cur = s.signData[pk];
  if (cur && cur.name === body.name && JSON.stringify(cur.lines) === JSON.stringify(body.lines)) {
    console.log(`skip dungeon_1/${stage} @${pk}（既に新版）`);
    skipped++;
    continue;
  }
  s.signData[pk] = body;
  rewritten++;
}

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
console.log(`placed ${placed} sign tile(s), wrote ${rewritten} body/bodies, skipped ${skipped}.`);
