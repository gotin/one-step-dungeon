// D4・D6・D8 の転移の石碑を「入口の画面そのものにある石碑」へ入れ替える移行スクリプト（実行キュー43・2026-10-03）
//
// なぜ：キュー27 の選定は本文が signData にある看板だけを数えていて、本文が npcData 側にある
//   入口の画面の石碑を落としていた∴D4・D6・D8 だけ「入口の隣（や2画面北）の碑」が転移碑になっていた
//   （D2・D3・D5 は入口と同じ画面の碑）。
//   ✅ 2026-10-03 ユーザー判定「3つとも入れ替える」。
//
// やること：
//   ・今の転移碑3枚 `‡` → 普通の石碑 `†`（本文・名前はそのまま）
//   ・入口の画面の石碑3枚 `†` → 転移碑 `‡`
//   ・名前が汎用の「石碑」だけの2枚に名前を付ける（行き先の一覧で区別が付かないため）。
//     他の入口の碑（水の迷宮の石碑・森の聖域の石碑…）に揃える。本文は1文字も変えない。
//
// 使い方：node scripts/migrate-q43-warp-entrance.mjs          … 確かめるだけ
//         node scripts/migrate-q43-warp-entrance.mjs --write  … 書き込む

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { TILE } from '../shared/tiles.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = resolve(HERE, '../work/blade-of-lumia.json');
const WRITE = process.argv.includes('--write');

// [画面, セル, 今の名前（取り違え防止の照合用）]
const DEMOTE = [
	['12,0',  '6,6', '火口の 石碑'],
	['3,5',   '1,9', '苔むした石碑'],
	['10,13', '2,3', '沼の 関の 石標'],
];
// [画面, セル, 今の名前, 新しい名前（null＝そのまま）]
const PROMOTE = [
	['12,2',  '7,5', '石碑',           '炎の神殿の石碑'],
	['2,4',   '4,3', '森の聖域の石碑', null],
	['10,14', '8,9', '石碑',           '沼地の神殿の石碑'],
];

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = map.layers.field.stages;
const bodyAt = (sd, k) => sd.signData?.[k] ?? sd.npcData?.[k];
const setTile = (sd, r, c, ch) => {
	if (typeof sd.tiles[r] === 'string') sd.tiles[r] = sd.tiles[r].slice(0, c) + ch + sd.tiles[r].slice(c + 1);
	else sd.tiles[r][c] = ch;
};

function swap(sk, k, wantTile, wantName, toTile) {
	const sd = field[sk];
	const [r, c] = k.split(',').map(Number);
	const body = bodyAt(sd, k);
	if (sd.tiles[r][c] !== wantTile || body?.name !== wantName) {
		throw new Error(`照合に失敗: field ${sk} (${k}) tile=${sd.tiles[r][c]} name=${body?.name}（期待 ${wantTile} ${wantName}）`);
	}
	setTile(sd, r, c, toTile);
	return body;
}

for (const [sk, k, name] of DEMOTE) {
	swap(sk, k, TILE.WARP_STONE, name, TILE.MONUMENT);
	console.log(`‡→† field ${sk} (${k}) ${name}`);
}
for (const [sk, k, name, rename] of PROMOTE) {
	const body = swap(sk, k, TILE.MONUMENT, name, TILE.WARP_STONE);
	if (rename) body.name = rename;
	console.log(`†→‡ field ${sk} (${k}) ${name}${rename ? ` → ${rename}` : ''}`);
}

if (WRITE) {
	writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));   // 元のファイルに末尾改行は無い
	console.log('書き込んだ:', MAP_PATH);
} else {
	console.log('（確かめただけ。書き込むには --write）');
}
