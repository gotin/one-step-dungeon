#!/usr/bin/env node
// 実行キュー49 — field の敵の少ない画面に、配置表 FIELD_ENEMY_FILL の敵を書き込む。
//
// 実行：outputs/blade-of-lumia/ から
//   node scripts/migrate-field-enemies-fill.mjs          … 検査だけ（書き込まない）
//   node scripts/migrate-field-enemies-fill.mjs --write  … 書き込む
//
// 冪等＝既にその敵が置いてあるセルは飛ばす。表は scripts/lib/field-enemy-tiers.mjs が単一の真実。
// 書き込む前に自己検証する（1件でも落ちたら書かない）：
//   ①置くセルが床（'.'）か、既に同じ敵　②水棲の敵は bgTiles が水のセル・陸の敵は水でないセル
//   ③画面の端から2マス以内でない　④その画面の段で置ける敵　⑤書いた後の脅威度が段の上限以内
//   ⑥KEEP_EMPTY の画面には置かない

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from './lib/enemy-placement.mjs';
import {
	FIELD_ENEMY_FILL, KEEP_EMPTY, tierOf, enemiesAllowedAt, TIER_THREAT_CAP, CAP_EXEMPT,
} from './lib/field-enemy-tiers.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const WRITE = process.argv.includes('--write');

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers.field.stages;
const errors = [];
let placed = 0, already = 0;

const seen = new Set();
for (const entry of FIELD_ENEMY_FILL) {
	const k = entry.stage;
	const s = stages[k];
	if (!s) { errors.push(`${k}: 画面が無い`); continue; }
	if (seen.has(k)) errors.push(`${k}: 表に2回出てくる`);
	seen.add(k);
	if (KEEP_EMPTY[k]) errors.push(`${k}: KEEP_EMPTY の画面に置こうとしている`);
	const tier = tierOf(k);
	const allowed = enemiesAllowedAt(tier);
	for (const [ch, cells] of Object.entries(entry.place)) {
		const meta = ENEMY_META[ch];
		if (!meta) { errors.push(`${k}: 知らない敵 ${ch}`); continue; }
		if (meta.isBoss) errors.push(`${k}: ボス ${ch} は置かない`);
		if (!allowed.has(ch)) errors.push(`${k}: 段${tier} では ${ch}（${meta.name}）を置けない`);
		for (const cell of cells) {
			const [r, c] = cell.split(',').map(Number);
			if (r < 2 || c < 2 || r > s.rows - 3 || c > s.cols - 3) errors.push(`${k} (${cell}): 端から2マス以内`);
			const cur = s.tiles[r]?.[c];
			if (cur === ch) { already++; continue; }
			if (cur !== '.') { errors.push(`${k} (${cell}): 床でない（'${cur}'）`); continue; }
			const water = s.bgTiles?.[cell] === '~';
			if (meta.move === 'water' && !water) errors.push(`${k} (${cell}): 水棲の ${ch} を水でないセルに置こうとしている`);
			if (meta.move !== 'water' && meta.move !== 'air' && water) errors.push(`${k} (${cell}): 陸の ${ch} を水の上に置こうとしている`);
			s.tiles[r][c] = ch;
			placed++;
		}
	}
	const threat = stageThreat(s, ENEMY_META);
	if (threat > TIER_THREAT_CAP[tier] && !CAP_EXEMPT[k]) {
		errors.push(`${k}: 脅威度 ${threat} が段${tier} の上限 ${TIER_THREAT_CAP[tier]} を超える`);
	}
}

if (errors.length) {
	console.error('❌ 自己検証で失敗（書き込まない）：');
	for (const e of errors) console.error('  ' + e);
	process.exit(1);
}
console.log(`✅ 自己検証 OK：表 ${FIELD_ENEMY_FILL.length} 画面・新しく置く ${placed} 体・置き済み ${already} 体`);
if (WRITE && placed > 0) {
	writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
	console.log('書き込んだ：' + MAP_PATH);
} else if (!WRITE) {
	console.log('（検査だけ。書き込むには --write）');
}
