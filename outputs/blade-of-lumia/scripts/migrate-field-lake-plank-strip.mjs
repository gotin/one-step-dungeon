#!/usr/bin/env node
/**
 * migrate-field-lake-plank-strip.mjs（キュー10番・10c-2・2026-09-12）
 *
 * 湖域の「陸の上に敷かれた板張り」を剥がし、`field 11,9`（ユーザー手編集の見本）と
 * 同じ作法へ揃える。
 *
 * 見本の作法（`git show a67680c` の 11,9 と現物の差分で裏取りした）：
 *   - 板が乗っている「陸の帯」を橋の軸に直交して伸ばし、両端が水（溶岩・穴）で閉じる
 *     幅3セル以内の細い地峡なら＝渡っている＝残す。
 *     片側が水で閉じない（広い陸／画面外へ抜ける）＝岸に寝ているだけ＝撤去。
 *     見本でも、片側だけ水だった row3/row6/row8 は撤去され、両側が水の row0 だけ残っていた。
 *   - 残る断面から軸方向に1断面ぶんだけ陸へ食い込ませる（木口）。見本の「2セル分」がこれ。
 *   - 隣画面から橋が入ってくる辺は、継ぎ目が切れないように境界の断面を残す。
 *   - それ以外＝草地の上を延々と続く板張り＝撤去（'.' に戻す。下地の bgTiles は草地のまま）
 *
 * §15 の標準形の湖（`9,7` `10,8` `11,8` `9,11` など）は幅2〜3セルの地峡に板が乗っている
 * ＝作法どおりなので1セルも触らない。
 *
 * 撤去するセルは `.scratch/10c2-plank-rule.mjs` の判定結果をそのまま直値で持つ
 * （後から差分を目で追えるようにするため）。判定の再現手順はそのスクリプトのコメント参照。
 * 既に '.' のセルは飛ばす＝何度実行しても同じ状態になる。
 *
 * 通行性は変わらない（板の下地はすべて草地＝もともと歩ける）。橋が水を渡っている
 * セルは1つも触らないので、画面間の接続も不変。
 *
 * 対象外として残したもの：
 *   - `field 8,9` / `field 10,9` の「板の絨毯」（縦横4セル以上の塊）＝画面ごとの造形が
 *     要るので個別設計に回す
 *   - `field 3,19` の単独の板（7,5）＝湖域外の装飾。10c-2 の範囲ではない
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TILE, BRIDGE_KIN } from '../shared/tiles.js';
import { cellTile, isHardBlocked } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

/** 撤去する板（画面キー → "r,c" の配列）＝合計113セル・5画面 */
const STRIP = {
	'13,11': ['0,5', '0,6', '1,5', '1,6', '2,5', '3,6',
		'4,2', '4,3', '4,4', '4,7', '4,8', '4,9', '4,10', '4,11',
		'5,2', '5,3', '5,4', '5,7', '5,8', '5,9', '5,10', '5,11',
		'6,5', '7,5', '7,6', '8,5', '8,6', '9,5', '9,6'],
	'13,10': ['0,5', '0,6', '1,5', '1,6', '2,5', '2,6',
		'4,2', '4,3', '4,4', '4,7', '4,8', '4,9', '4,10', '4,11',
		'5,2', '5,3', '5,4', '5,7', '5,8', '5,9', '5,10', '5,11',
		'6,5', '7,5', '8,5', '8,6', '9,5', '9,6'],
	'11,11': ['4,2', '4,3', '4,4', '4,7', '4,8', '4,9', '5,2', '5,3', '5,4', '5,7', '5,8', '5,9',
		'6,5', '7,5', '7,6', '8,5', '8,6', '9,5', '9,6'],
	'12,11': ['4,2', '4,3', '4,4', '4,7', '4,8', '4,9', '5,2', '5,3', '5,4', '5,7', '5,8', '5,9',
		'6,5', '6,6', '7,5', '8,5', '8,6', '9,5', '9,6'],
	'12,10': ['0,5', '0,6', '1,5', '1,6', '2,5', '3,5',
		'4,2', '4,3', '4,4', '4,7', '4,8', '4,9', '5,2', '5,3', '5,4', '5,7', '5,8', '5,9'],
};

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
let stripped = 0;

for (const [key, cells] of Object.entries(STRIP)) {
	const stage = data.layers.field.stages[key];
	if (!stage) throw new Error(`missing field stage ${key}`);
	if (stage.rows !== 10 || stage.cols !== 12) throw new Error(`unexpected size on ${key}`);
	for (const cell of cells) {
		const [r, c] = cell.split(',').map(Number);
		// 事前条件＝下地が草地（＝もともと歩ける陸）であること。板の上に何も乗っていない前提。
		if ((stage.bgTiles || {})[cell] !== TILE.GRASS) throw new Error(`下地が草地でない @ ${key} ${cell}: ${stage.bgTiles?.[cell]}`);
		if (stage.tiles[r][c] === TILE.FLOOR) continue; // 既に撤去済み
		if (!BRIDGE_KIN.has(stage.tiles[r][c])) throw new Error(`板ではない @ ${key} ${cell}: ${stage.tiles[r][c]}`);
		stage.tiles[r][c] = TILE.FLOOR;
		stripped++;
	}
}

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── 自己検証 ──────────────────────────────────────────────────────
const check = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
for (const [key, cells] of Object.entries(STRIP)) {
	const cs = check.layers.field.stages[key];
	for (const cell of cells) {
		const [r, c] = cell.split(',').map(Number);
		if (cs.tiles[r][c] !== TILE.FLOOR) throw new Error(`板が残っている @ ${key} ${cell}`);
		if (cs.bgTiles[cell] !== TILE.GRASS) throw new Error(`下地が変わった @ ${key} ${cell}`);
		if (isHardBlocked(cellTile(cs, r, c))) throw new Error(`撤去後に通行不可 @ ${key} ${cell}`);
	}
}
// 両脇が水の橋は1セルも消えていないこと＝画面ごとに残る板の枚数で確かめる
const EXPECT_REMAIN = {
	'13,11': 4, '13,10': 4, '11,11': 14, '12,11': 15, '12,10': 15,
	// 触らない標準形＝板の枚数が変わっていないことも一緒に見張る
	'11,8': 36, '9,7': 32, '10,8': 33, '9,11': 32,
};
for (const [key, want] of Object.entries(EXPECT_REMAIN)) {
	const cs = check.layers.field.stages[key];
	const got = cs.tiles.flat().filter((ch) => BRIDGE_KIN.has(ch)).length;
	if (got !== want) throw new Error(`残る板の枚数が違う @ ${key}: ${got} ≠ ${want}`);
	if (got === 0) throw new Error(`板が1枚も残っていない @ ${key}`);
}
console.log(`✅ 湖域の陸上の板張りを撤去（${stripped}セル・${Object.keys(STRIP).length}画面・自己検証OK）`);
for (const key of Object.keys(STRIP)) {
	console.log(`\n=== ${key} ===`);
	console.log(check.layers.field.stages[key].tiles.map((row) => row.join('')).join('\n'));
}
