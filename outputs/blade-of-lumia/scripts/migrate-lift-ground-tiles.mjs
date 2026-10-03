// tiles 層に置かれた地面（石畳 `o`・砂 `d` など）を bgTiles へ移す移行スクリプト（実行キュー42・2026-10-03）
//
// なぜ：tiles 層の地面は盤面で「物」として小さく（0.7 セル）描かれ、周りに暗い隙間が出ていた
//   （2026-09-21 ユーザー報告「field 5,3 の石畳の中に石畳が小さめに表示される」）。地面が見える層は
//   bgTiles だけ。移し方の規則は shared/ground-layer.js（ゲーム・エディタと同じ関数）が単一の真実。
//
// 実測（2026-10-03・移す前）＝石畳 `o` 114 マス（field 22 画面）＋砂 `d` 5 マス（dungeon_2 1,2／2,3）。
//   通行・ギミックは変わらない（地面も床も通行可・ゲームの判定に床との一致を見る所は無い）。
//
// 使い方：node scripts/migrate-lift-ground-tiles.mjs          … 移す対象を数えるだけ
//         node scripts/migrate-lift-ground-tiles.mjs --write  … 書き込む

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { liftGroundTiles } from '../shared/ground-layer.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = resolve(HERE, '../work/blade-of-lumia.json');
const WRITE = process.argv.includes('--write');

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// 移す前の文字を控える（報告用＝どの地面を何マス移したか）
const before = new Map();
for (const [lk, ld] of Object.entries(map.layers)) {
	for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
		before.set(`${lk} ${sk}`, sd.tiles.map((row) => [...row]));
	}
}

const { changes } = liftGroundTiles(map);
const byChar = {};
let total = 0;
for (const { layer, stage, cells } of changes) {
	const tiles = before.get(`${layer} ${stage}`);
	for (const k of cells) {
		const [r, c] = k.split(',').map(Number);
		byChar[tiles[r][c]] = (byChar[tiles[r][c]] ?? 0) + 1;
		total++;
	}
	console.log(`${layer} ${stage}: ${cells.length}`);
}
console.log(`計 ${total} マス・${changes.length} 画面`, byChar);

if (!WRITE) {
	console.log('（検査だけ＝書き込むには --write）');
} else if (total === 0) {
	console.log('移すものが無い＝書き込まない');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
	console.log(`書き込んだ: ${MAP_PATH}`);
}
