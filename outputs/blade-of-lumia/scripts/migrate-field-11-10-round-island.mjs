#!/usr/bin/env node
/**
 * migrate-field-11-10-round-island.mjs（キュー10番・10c 追い作業・2026-09-11）
 *
 * `field 11,10` の中央の島を 2×2（＋非対称な追加床3セル）から、きれいな 4×4 の
 * 「角丸の島」へ作り直す。橋の幅は変えない（ユーザー確定＝「橋のサイズはかえずに」）。
 *
 * 直す理由＝ユーザー実プレイ判定「橋の中央が草地になってるようにしか見えない」。
 * 核の 2×2 に非対称な単セルの装飾床（旧 [3,5]/[6,6]/[7,6]）がくっついていたせいで
 * 「島」ではなく「橋に空いた歯抜け」に見えていた。
 *
 * 角の丸みは `shared/sprites-tiles.js` の `islandCornerNw/Ne/Sw/Se`（草は丸く残り、
 * 隅の外側だけ本物の水スプライトの模様で欠ける・2026-09-11 ユーザー判定で確定）。
 *
 * 変更範囲＝rows3-6 × cols4-7（16セル）を島の床にする。うち4隅（角の4セル）は
 * ISLAND_CORNER_* タイル、残り12セルは通常の草地（'g'）。
 *   - tiles[r][c] は全セル '.'（床・下地が見える）
 *   - bgTiles["r,c"] は角=ISLAND_CORNER_*／それ以外='g'
 *
 * 橋（v）・水（~）のセルは1つも触らない（橋幅・接続は不変）。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TILE } from '../shared/tiles.js';
import { cellTile, isHardBlocked } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const STAGE_KEY = '11,10';
const ROWS = [3, 4, 5, 6];
const COLS = [4, 5, 6, 7];
const CORNERS = {
	'3,4': TILE.ISLAND_CORNER_NW,
	'3,7': TILE.ISLAND_CORNER_NE,
	'6,4': TILE.ISLAND_CORNER_SW,
	'6,7': TILE.ISLAND_CORNER_SE,
};

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stage = data.layers.field.stages[STAGE_KEY];
if (!stage) throw new Error(`missing field stage ${STAGE_KEY}`);
if (stage.rows !== 10 || stage.cols !== 12) throw new Error(`unexpected size on ${STAGE_KEY}`);

// 事前条件＝旧・非対称な島（核2×2＋単セル3つ）がまだ現物にあること。
// これが崩れていたら「想定と違うものを上書きする」事故なので先に止める。
const OLD_ISLAND = new Set(['4,5', '4,6', '5,5', '5,6', '3,5', '6,6', '7,6']);
for (const key of OLD_ISLAND) {
	const [r, c] = key.split(',').map(Number);
	if (stage.tiles[r][c] !== TILE.FLOOR) throw new Error(`旧・島の前提が崩れている @ ${key}`);
}
if (stage.tiles[7][6] !== TILE.FLOOR) throw new Error('旧・島の前提が崩れている @ 7,6');

// 書き込み＝4×4 の床（12セルは草地・4隅は角丸）
for (const r of ROWS) {
	for (const c of COLS) {
		const key = `${r},${c}`;
		stage.tiles[r][c] = TILE.FLOOR;
		stage.bgTiles[key] = CORNERS[key] ?? TILE.GRASS;
	}
}
// 旧・非対称な装飾床のうち 4×4 の外に出ていたセル（7,6）はもう島の一部ではない
// ＝橋（縦のアーム）へ戻す（縦のアームは col6 を通る＝v に戻せば橋が繋がり直す）。
if (ROWS.includes(7)) throw new Error('assumption changed: 7 is now in ROWS (this branch assumes it stays outside the block)');
stage.tiles[7][6] = TILE.BRIDGE;
delete stage.bgTiles['7,6'];

writeFileSync(MAP_PATH, JSON.stringify(data));

// ── 自己検証 ──────────────────────────────────────────────────────
const check = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const cs = check.layers.field.stages[STAGE_KEY];
for (const r of ROWS) {
	for (const c of COLS) {
		const key = `${r},${c}`;
		if (cs.tiles[r][c] !== TILE.FLOOR) throw new Error(`書き込み後も床でない @ ${key}`);
		if (isHardBlocked(cellTile(cs, r, c))) throw new Error(`書き込み後に通行不可 @ ${key}`);
		const want = CORNERS[key] ?? TILE.GRASS;
		if (cs.bgTiles[key] !== want) throw new Error(`bgTiles が期待値と違う @ ${key}`);
	}
}
if (cs.tiles[7][6] !== TILE.BRIDGE) throw new Error('7,6 が橋に戻っていない');
if (cs.bgTiles['7,6'] !== undefined) throw new Error('7,6 の bgTiles が残っている');
// 橋（縦横のアーム）は1セルも変えていないことを確認（触った範囲の外）
const untouchedBridgeSample = [[1, 5], [1, 6], [4, 1], [4, 10], [8, 5], [8, 6]];
for (const [r, c] of untouchedBridgeSample) {
	if (cs.tiles[r][c] !== TILE.BRIDGE) throw new Error(`橋の外形が変わった @ ${r},${c}`);
}
console.log(`✅ ${STAGE_KEY}: 4×4 の角丸の島に書き換え完了（自己検証OK）`);
console.log(cs.tiles.map((row) => row.join('')).join('\n'));
