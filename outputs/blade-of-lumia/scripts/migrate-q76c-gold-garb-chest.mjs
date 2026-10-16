#!/usr/bin/env node
// scripts/migrate-q76c-gold-garb-chest.mjs ── 実行キュー76 の⑤（2026-10-16）
// 邪竜の巣の主の間（dragon_lair 1,0）に報酬の宝箱（金の装束）を置く。
//
//   ・(1,10)＝北東の角。魔将の間（warlord_lair 1,0 の (1,10)）と同じ「寄道の主の報酬」の置き方。
//     竜の初期の体（rows 3-5 × cols 7-9）にも西の扉 `:`（rows 4-5）にも触れない。
//   ・showConditions＝killAll ∴竜を倒すまで出ない（出るまでは床として扱われる＝戦いの床は変わらない）。
//     ⚠️ この部屋に雑魚を足してはいけない（雑魚だけ倒して開く抜け道になる）。
//   ・中身＝`{ type:'item', item:'goldGarb' }`（`ITEM_META.goldGarb`＝passive）。
//
// 実行：outputs/blade-of-lumia/ から `node scripts/migrate-q76c-gold-garb-chest.mjs`

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TILE } from '../shared/tiles.js';
import { ITEM_META } from '../shared/items.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const CELL = '1,10';
const CONTENT = { type: 'item', item: 'goldGarb', name: ITEM_META.goldGarb?.name };

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

if (!CONTENT.name) die('ITEM_META.goldGarb が無い（先に shared/items.js を足す）');
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const lair = map.layers.dragon_lair?.stages?.['1,0'];
if (!lair) die('dragon_lair 1,0 が無い');
if (!lair.isBossRoom) die('dragon_lair 1,0 がボス部屋でない（先に migrate-q76b）');
const [r, c] = CELL.split(',').map(Number);
if (lair.tiles[r][c] !== TILE.FLOOR) die(`dragon_lair 1,0 (${CELL}) が床でない: ${lair.tiles[r][c]}`);

lair.tiles[r][c] = TILE.CHEST;
lair.chestContents = { ...(lair.chestContents ?? {}), [CELL]: CONTENT };
lair.showConditions = { ...(lair.showConditions ?? {}), [CELL]: { trigger: 'killAll' } };
lair.comment = lair.comment.replace(
	'報酬の宝箱（金の装束・killAll 封印）はキュー76⑤で置く',
	`報酬の宝箱 (${CELL})＝金の装束・killAll 封印（キュー76⑤）`,
);

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
const back = JSON.parse(readFileSync(MAP_PATH, 'utf8')).layers.dragon_lair.stages['1,0'];
if (back.tiles[r][c] !== TILE.CHEST || back.chestContents[CELL]?.item !== 'goldGarb'
	|| back.showConditions[CELL]?.trigger !== 'killAll') die('書き戻しの検証に失敗');
console.log(`✓ dragon_lair 1,0 (${CELL}) に金の装束の宝箱を置いた（killAll 封印）`);
