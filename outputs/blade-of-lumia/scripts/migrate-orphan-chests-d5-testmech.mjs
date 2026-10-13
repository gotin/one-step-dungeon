#!/usr/bin/env node
/**
 * migrate-orphan-chests-d5-testmech.mjs  (実行キュー55 — 宝箱 `B` の無いセルを指す chestContents の残り2件)
 *
 * ── dungeon_5 [1,0]：ハートの器を宝箱 (1,10) に置き直す ─────────────────────
 * D5 の新築（3d1c1a8 / 2026-06-27）の時点で、中身 `2,9 = ハートの器` だけが書かれ、
 * 宝箱タイル `B` は一度も置かれていなかった（置き忘れ）。鍵部屋の作り直し
 * （b8762d3 / migrate-key-room-d5.mjs）は「旧・宝箱を引き継ぐ」つもりでキーだけを (1,9) へ移した。
 * 宝箱の描画も開封も `tiles[r][c] === 'B'` のセルでしか起きない∴この器は誰にも取れなかった。
 * 一方、設計（ユーザー確定 2026-07-01「器の配置総数＝最大ハート」・D3/D4/D5 は中ボス部屋に2個目）と
 * 報酬の監査（shared/progression.js は B を見ずに chestContents を数える）は、この器を数に入れている。
 * ∴消さずに置き直す＝実際に取れる最大ハートが設計値に戻る（ユーザー判断 2026-10-13）。
 * 置き場所は (1,10)＝縦穴の入口 (1,9) の右隣の行き止まり（本道から常時取れる・ユーザー選択）。
 *
 * ── test_mechanics [1,0]（torch_relay）：宝箱タイルを (7,10) → (7,9) へ戻す ─────
 * 部屋のコメント・tests/torch.spec.js・chestContents・showConditions(torchesLit) はすべて (7,9)。
 * タイルだけが1列ずれて (7,10) に置かれていた（作成時 ff0f6fe から）∴タイル側を直す。
 *
 * 検査（throw で止める）：書き換える前に「今の姿が想定どおり」を確かめる。
 * 書き込みは JSON.stringify(map, null, 2)（インデントはスペース2＝タブだと全行差分）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const HEART = { type: 'heartContainer', name: 'ハートの器' };

function stageOf(layer, room) {
	const st = map.layers?.[layer]?.stages?.[room];
	if (!st) throw new Error(`部屋が無い: ${layer} [${room}]`);
	return st;
}

// ── dungeon_5 [1,0] ──────────────────────────────────────────────────────
{
	const st = stageOf('dungeon_5', '1,0');
	if (st.tiles[1][10] === 'B' && st.chestContents?.['1,10']) {
		console.log('skip dungeon_5 [1,0] — 既に (1,10) に宝箱がある');
	} else {
		if (JSON.stringify(st.chestContents) !== JSON.stringify({ '1,9': HEART })) {
			throw new Error(`dungeon_5 [1,0] の chestContents が想定と違う: ${JSON.stringify(st.chestContents)}`);
		}
		if (st.tiles[1][9] !== '.' || st.tiles[1][10] !== '.') {
			throw new Error(`dungeon_5 [1,0] の (1,9)/(1,10) が床でない: ${st.tiles[1][9]}/${st.tiles[1][10]}`);
		}
		if (st.showConditions?.['1,10']) throw new Error('dungeon_5 [1,0] (1,10) に showConditions がある＝要判断');
		st.tiles[1][10] = 'B';
		st.chestContents = { '1,10': HEART };
		console.log('dungeon_5 [1,0]: ハートの器 (1,9 の孤立キー) → 宝箱 B (1,10)');
	}
}

// ── test_mechanics [1,0] ─────────────────────────────────────────────────
{
	const st = stageOf('test_mechanics', '1,0');
	if (st.tiles[7][9] === 'B' && st.tiles[7][10] === '.') {
		console.log('skip test_mechanics [1,0] — 既に (7,9) に宝箱がある');
	} else {
		if (st.tiles[7][10] !== 'B' || st.tiles[7][9] !== '.') {
			throw new Error(`test_mechanics [1,0] の (7,9)/(7,10) が想定と違う: ${st.tiles[7][9]}/${st.tiles[7][10]}`);
		}
		if (!st.chestContents?.['7,9'] || st.showConditions?.['7,9']?.trigger !== 'torchesLit') {
			throw new Error('test_mechanics [1,0] の (7,9) に中身か torchesLit が無い＝要判断');
		}
		st.tiles[7][9] = 'B';
		st.tiles[7][10] = '.';
		console.log('test_mechanics [1,0]: 宝箱タイル (7,10) → (7,9)');
	}
}

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
console.log('done');
