#!/usr/bin/env node
// scripts/migrate-q76b-place-gold-dragon.mjs ── 実行キュー76 の③-1（2026-10-16）
// 邪竜の巣の主の間（dragon_lair 1,0）に金翼の邪竜 Ω（3×3）を置き、ボス部屋にする。
//
//   ・左上 (3,7) に置く＝体は rows 3-5 × cols 7-9。西の扉 `:`（rows 4-5）から入ったプレイヤーと
//     向き合う（初期の向き left）。体の周りは全方向に2セル以上の床が残る＝回り込める。
//   ・isBossRoom:true ＝入室で `:` が閉じ HP バーが出る（魔将の巣と同じ一対一）。
//   ・報酬の宝箱（金の装束・killAll 封印）はキュー76⑤で置く＝今は置かない。
//
// 実行：outputs/blade-of-lumia/ から `node scripts/migrate-q76b-place-gold-dragon.mjs`

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const CELL = '3,7';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const lair = map.layers.dragon_lair?.stages?.['1,0'];
if (!lair) die('dragon_lair 1,0 が無い');
const meta = ENEMY_META[TILE.GOLD_DRAGON];
if (!meta?.isBoss || meta.size?.w !== 3 || meta.size?.h !== 3) die('Ω が 3×3 のボスとして登録されていない');
if (meta.dropsTriforce) die('Ω が星の欠片を落とす＝羽衣ゲートが循環する');
const [r0, c0] = CELL.split(',').map(Number);
for (let r = r0; r < r0 + 3; r++) for (let c = c0; c < c0 + 3; c++) {
	if (lair.tiles[r][c] !== TILE.FLOOR) die(`dragon_lair 1,0 (${r},${c}) が床でない`);
}

lair.tiles[r0][c0] = TILE.GOLD_DRAGON;
lair.enemyDirs = { [CELL]: 'left' };
lair.isBossRoom = true;
lair.comment = '[dragon_lair 1,0] 金翼の邪竜の間（キュー76）。Ω（3×3）を (3,7) に置いた（体は rows 3-5 × cols 7-9・'
	+ '西の扉を向く）。isBossRoom:true ∴入室で `:`（西辺 4,0/5,0）が閉じ HP バーが出る。遮蔽物を置かない＝'
	+ '回り込み（横・背後で技が変わる）の床を塞がない。報酬の宝箱（金の装束・killAll 封印）はキュー76⑤で置く'
	+ '＝**この部屋に雑魚を足してはいけない**（雑魚だけ倒して開く抜け道になる）。';

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
const back = JSON.parse(readFileSync(MAP_PATH, 'utf8')).layers.dragon_lair.stages['1,0'];
const enemies = back.tiles.flatMap((row, r) => row.flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}=${ch}`] : [])));
if (enemies.join() !== `${CELL}=${TILE.GOLD_DRAGON}` || !back.isBossRoom) die(`書き戻しの検証に失敗: ${enemies.join()}`);
console.log(`✓ dragon_lair 1,0 (${CELL}) に金翼の邪竜を置いた`);
