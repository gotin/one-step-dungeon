#!/usr/bin/env node
/**
 * migrate-field-orphan-chests.mjs  (実行キュー51 — field の宝箱 `B` の無いセルに残った chestContents)
 *
 * ── なぜ消すか ────────────────────────────────────────────────────────────
 * 2026-07-06 の森の作り直し（83284a7 / migrate-field-forest.mjs）が画面を丸ごと組み直したとき、
 * 宝箱タイル `B` は消えたが `chestContents` のキーが残った。宝箱の描画も開封も
 * `tiles[r][c] === 'B'` のセルでしか起きない（game/render-board.js・game/player.js）∴
 * 残ったキーは誰にも見えず開けられない。3か月以上その状態で遊べている＝
 * 「宝箱を置き直す」のではなく「消す」が現状と整合する。
 *
 * 対象は field の4件だけ（他レイヤーの同種不整合は別キュー）。
 *   2,2 (6,9)   回復薬（大）   … 床
 *   1,5 (2,8)   回復薬（大）   … 木の上（同じ画面の 8,2 の宝箱は生きている＝触らない）
 *   2,1 (6,10)  回復薬（大）   … 木の上
 *   1,7 (2,10)  ルピー×10      … 木の上
 *
 * 検査（throw で止める）：消す前に「本当に B が無い・showConditions も無い」を確かめる。
 * 書き込みは JSON.stringify(map, null, 2)（インデントはスペース2＝タブだと全行差分）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const TARGETS = [
	['2,2', '6,9'],
	['1,5', '2,8'],
	['2,1', '6,10'],
	['1,7', '2,10'],
];

let removed = 0;
for (const [room, cell] of TARGETS) {
	const st = map.layers.field.stages[room];
	if (!st) throw new Error(`field ${room} が無い`);
	if (!st.chestContents?.[cell]) {
		console.log(`skip field ${room} (${cell}) — 既に無い`);
		continue;
	}
	const [r, c] = cell.split(',').map(Number);
	const tile = st.tiles[r]?.[c];
	if (tile === 'B') throw new Error(`field ${room} (${cell}) は宝箱タイル B ＝孤立ではない`);
	if (st.showConditions?.[cell]) throw new Error(`field ${room} (${cell}) に showConditions がある＝要判断`);
	delete st.chestContents[cell];
	removed++;
	console.log(`removed field ${room} (${cell}) tile=${JSON.stringify(tile)}`);
}

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
console.log(`done: ${removed} removed`);
