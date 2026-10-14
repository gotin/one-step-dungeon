#!/usr/bin/env node
/**
 * migrate-veteran-sprite.mjs（実行キュー63 の続き・2026-10-14）
 *
 * 草原の洞窟の前（field 6,13）の老兵ガルド (8,10) に専用の見た目 npcVeteran を付ける。
 * ユーザー指摘「老兵なのに、それっぽく見えない」＋参考画像 refs/老兵1.png・2.png。
 * それまでは人のタイル 'b'（茶髪の人）をそのまま使っていた。
 * 絵は shared/sprites-player.js npcVeteran、差し替えの仕組みは shared/npcs.js PERSON_NPC_SPRITES
 * （npcData[セル].sprite・老賢者 npcElder と同じ）。
 * 冪等：既に npcVeteran なら何もしない。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const st = map.layers.field.stages['6,13'];
const vet = st?.npcData?.['8,10'];
if (vet?.name !== '老兵 ガルド') throw new Error('field 6,13 (8,10) に老兵ガルドがいない');
if (st.tiles[8][10] !== 'b') throw new Error(`老兵のタイルが 'b' でない（${st.tiles[8][10]}）`);
if (vet.sprite === 'npcVeteran') { console.log('既に npcVeteran＝何もしない'); process.exit(0); }
if (vet.sprite !== undefined) throw new Error(`老兵に既に別の sprite がある（${vet.sprite}）`);
vet.sprite = 'npcVeteran';

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');
console.log('老兵ガルドに専用の見た目 npcVeteran を付けました');
