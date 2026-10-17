#!/usr/bin/env node
// scripts/migrate-q79-field-2-4-one-stele.mjs ── 実行キュー79（2026-10-17・プレイメモ）
// field 2,4（D6 森の聖域の入口画面）の石碑を1つにする。
//
//   ・プレイメモ（2026-10-17・field 2,4 (6,3)）「なんでここ石碑二つあるんだ？ 文言をひとつにまとめて石碑ひとつにしてよさそう」。
//   ・(4,3) 森の聖域の石碑＝入口 `>` (4,2) の隣・撃破後の文（linesAfterBoss.O）つき＝これを残す（文は変えない）。
//   ・(6,4) 砂漠の神殿の石碑（migrate-dialog-band-2 が「迷子石碑」と呼んで本文だけ直していた物）を消す。
//     砂漠の神殿＝dungeon_2（進行の2番目）＝D6（5番目）の入口に来る頃には攻略済み＝案内として古い。
//     案内は他の NPC の会話にもある。ユーザー決定（AskUserQuestion）＝「砂漠の文は消す」。
//   ・消し方＝タイル `†`（MONUMENT・通れない）→ 床 `.`／`npcData['6,4']` を削除（本文はここにだけある＝signData に無いのを確認）。
//     石碑が消えて通れるセルが1つ増えるだけ＝接続は悪くならない。下地（bgTiles）は 6,4 に指定が無い＝既定の地面。
//
// 実行：outputs/blade-of-lumia/ から `node scripts/migrate-q79-field-2-4-one-stele.mjs`（2回目は何もしない）

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TILE } from '../shared/tiles.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const R = 6, C = 4;

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const st = map.layers.field?.stages?.['2,4'];
if (!st) die('field 2,4 が無い');
if (!st.npcData?.['4,3']?.lines?.[0]?.startsWith('【森の聖域】')) die('残す側（4,3 森の聖域の石碑）が見当たらない');

const tile = st.tiles[R][C];
const npc = st.npcData?.[`${R},${C}`];
if (tile === TILE.FLOOR && !npc) { console.log('· 済み（6,4 は既に床・本文なし）'); process.exit(0); }
if (tile !== TILE.MONUMENT) die(`(6,4) が石碑でない: '${tile}'`);
if (!npc?.lines?.[0]?.startsWith('【砂漠の神殿】')) die('(6,4) の本文が砂漠の神殿でない＝想定と違う');
if (st.signData?.[`${R},${C}`]) die('(6,4) の本文が signData にもある＝両方消す必要（先に確かめる）');

st.tiles[R][C] = TILE.FLOOR;
delete st.npcData[`${R},${C}`];
writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));   // 末尾の改行なし＝元のファイルに合わせる
console.log('✓ field 2,4 (6,4) 砂漠の神殿の石碑を消した（森の聖域の石碑だけ残る）');
