// field の地図（'m'）を最初の画面に置く移行スクリプト（実行キュー15・2026-09-13）
//
// なぜ床タイルなのか：
//   IDEA.md の当初案は「D1 クリア後に村の NPC が渡す」だったが、渡す機構が現状どこにも無い
//   （`shared/items.js` の `dungeonMap` は `grantable:false`＝床タイル専用／`grantReward()` に
//   `dungeonItem` の type が無い／NPC の会話データに報酬の欄が無い／`conditions.js` に
//   「ダンジョンを踏破した」を判定する条件が無い）。∴既にある `'m'` 床タイルを置く形にする
//   （PLAN 実行キュー15 の「⛔ 止まる条件」＝`giveSubItem()` とセーブ互換に手を出すなら止まる、
//    に触れないための選択）。
//
// なぜ最初の画面なのか：
//   ユーザーの不満の芯は「今自分がどこにいるのかすらわからない」＝**迷う前に**持っていないと
//   効かない。かつ未訪問の画面は真っ黒（`getSS().visited` でゲート）∴早く拾っても
//   「行っていない場所」は見えない＝探索の楽しみを先に見せてしまう心配が無い。
//
// 置く場所＝field 7,14（ゲーム開始画面・村人タロが居る画面）の 4,3。
//   プレイヤーの開始位置 2,2 の右下2歩＝最初の画面の中で必ず目に入る。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = resolve(HERE, '../work/blade-of-lumia.json');

const LAYER = 'field';
const STAGE = '7,14';
const R = 4, C = 3;
const MAP_TILE = 'm';   // TILE.ITEM_DUNGEON_MAP
const FROM_TILE = '.';  // TILE.FLOOR

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const sd = map.layers?.[LAYER]?.stages?.[STAGE];
if (!sd) throw new Error(`stage not found: ${LAYER} ${STAGE}`);

// ── 事前アサート ───────────────────────────────────────────
// 何もない床であること（何かを潰していないこと）＋メタデータが乗っていないこと。
const before = sd.tiles[R][C];
if (before !== FROM_TILE) {
	throw new Error(`${LAYER} ${STAGE} (${R},${C}) は '${FROM_TILE}' ではなく '${before}'＝別の物を潰す`);
}
for (const key of ['floorItems', 'objects', 'chestContents', 'npcData', 'signData', 'mapEnters', 'links', 'showConditions', 'breakableWalls']) {
	const holder = sd[key];
	if (holder && !Array.isArray(holder) && Object.prototype.hasOwnProperty.call(holder, `${R},${C}`)) {
		throw new Error(`${LAYER} ${STAGE} (${R},${C}) に ${key} が付いている＝上書きになる`);
	}
}
// field に地図タイルが既に無いこと（二重に置かない）。
const already = [];
for (const [sk, s] of Object.entries(map.layers[LAYER].stages)) {
	for (let r = 0; r < s.rows; r++) {
		for (let c = 0; c < s.cols; c++) if (s.tiles[r][c] === MAP_TILE) already.push(`${sk} (${r},${c})`);
	}
}
if (already.length) throw new Error(`${LAYER} に既に地図タイルがある: ${already.join(' / ')}`);

// ── 書き換え ───────────────────────────────────────────────
// field の tiles は「1文字の配列の配列」＝行を文字列にすると実ゲームが落ちる
// （[[field-tiles-are-char-arrays]]）∴要素1つだけを差し替える。
if (!Array.isArray(sd.tiles[R])) throw new Error('tiles の行が配列でない＝この移行は行文字列に対応しない');
sd.tiles[R][C] = MAP_TILE;

// ── 事後アサート ───────────────────────────────────────────
if (sd.tiles[R][C] !== MAP_TILE) throw new Error('書き換えに失敗');
if (sd.tiles[R].length !== sd.cols) throw new Error('行の長さが変わった');
if (sd.tiles.length !== sd.rows) throw new Error('行数が変わった');
const count = sd.tiles.flat().filter(t => t === MAP_TILE).length;
if (count !== 1) throw new Error(`地図タイルが ${count} 個ある＝1個でない`);
// 見える地面は bgTiles 側（[[field-bgtile-is-visible-ground]]）＝触っていないことを確認。
if ((sd.bgTiles?.[`${R},${C}`] ?? '-') !== 'g') throw new Error('bgTiles が変わった（草地 g のはず）');

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));

console.log(`置いた: ${LAYER} ${STAGE} (${R},${C}) '${before}' -> '${MAP_TILE}'`);
console.log(`その行: ${sd.tiles[R].join('')}`);
console.log(`bgTiles(${R},${C}) = ${sd.bgTiles?.[`${R},${C}`] ?? '-'}（変更なし）`);
