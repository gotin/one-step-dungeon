#!/usr/bin/env node
/**
 * migrate-elder-sprite.mjs（実行キュー56・2026-10-13）
 *
 * はじまりの村（field 7,14）の老賢者 (3,3) に専用の見た目 npcElder を付ける。
 * ユーザーのプレイメモ「長老用の見た目新しく作った方がいいかも」→ 判断「長老は老賢者のつもり」。
 * それまでは商人のタイル 'b'（勇者の形＋商人の色）をそのまま流用していた。
 * 絵は shared/sprites-player.js npcElder（refs/老賢者1.png・2.png から起こした）、
 * 差し替えの仕組みは shared/npcs.js PERSON_NPC_SPRITES（npcData[セル].sprite）。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const st = map.layers.field.stages['7,14'];
const elder = st?.npcData?.['3,3'];
if (elder?.name !== '老賢者') throw new Error('field 7,14 (3,3) に老賢者がいない');
if (st.tiles[3][3] !== 'b') throw new Error(`老賢者のタイルが 'b' でない（${st.tiles[3][3]}）`);
if (elder.sprite !== undefined) throw new Error(`老賢者に既に sprite がある（${elder.sprite}）`);
elder.sprite = 'npcElder';

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');
console.log('老賢者に専用の見た目 npcElder を付けました');
