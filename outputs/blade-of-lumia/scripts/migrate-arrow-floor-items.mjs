#!/usr/bin/env node
// 実行キュー19（2026-09-21）: 「矢束」タイル '6' の配置を実データに合わせる。
//
// 背景:
//   ・タイル '6' は「弓＋矢N本」の融合タイルだった（拾うと弓が生えた）。エンジン側で
//     '6' を「矢束（矢だけ）」に分離した＝弓は宝箱/報酬専用（shared/tiles.js の
//     FLOOR_STACK_TILES の注記を参照）。
//   ・cave_1 [1,0] には '6' が4個並んでいるが、ユーザーの当初の意図は「弓を4つ」では
//     なく「矢を複数本」で、しかも**この部屋には弓も矢も要らない**（実行キュー19）。
//   ・dungeon_3 [2,1] は `scripts/migrate-d3-sentry.mjs` が「寄道の報酬に矢15本」を
//     置こうとして `floorItems['5,5'] = {count:15}` だけ書き、**タイルを置き忘れた**
//     ＝拾えない死んだデータになっていた。
//   ・dungeon_3 [1,2] の `floorItems['2,5']` も同型の死にデータ（そのセルは宝箱 'B'
//     ＝床アイテムの本数は読まれない。弓は宝箱の中身として渡る）。
//
// 直すこと:
//   1. cave_1 [1,0] の '6' 4個 → 床 '.'（当初要望どおり何も置かない）
//   2. dungeon_3 [2,1] (5,5) に '6' を置き、本数を 10 にする（「矢の10本セット」。
//      矢筒が未配置で上限は 8 ∴実際は満タンになる＝取り切れない分は捨てられる）
//   3. dungeon_3 [1,2] の死んだ `floorItems['2,5']` を削除
//
// 冪等（何度流しても同じ結果）＋自己検証（最後に現物を読み直して assert）。
// 実行は outputs/blade-of-lumia/ から:
//   node scripts/migrate-arrow-floor-items.mjs

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const ARROWS = '6';
const FLOOR  = '.';

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const changes = [];

// ── 1. cave_1 [1,0] の矢束（旧・弓）をすべて床に戻す ─────────────────────────
const cave = data.layers.cave_1.stages['1,0'];
cave.tiles.forEach((row, r) => {
	row.forEach((ch, c) => {
		if (ch !== ARROWS) return;
		row[c] = FLOOR;
		if (cave.floorItems) delete cave.floorItems[`${r},${c}`];
		changes.push(`cave_1 [1,0] (${r},${c}) '${ARROWS}' → '${FLOOR}'`);
	});
});

// ── 2. dungeon_3 [2,1] に矢束を置く（migrate-d3-sentry の未完の意図を果たす）──
// (5,5) は部屋の中央の床。同室の看板 '2,5'「渇いた碑文」が弓の言い伝えを語る部屋で、
// 弓を手にしてから戻ってくると矢束が拾える（弓が無いうちはタイルが残る）。
const st21 = data.layers.dungeon_3.stages['2,1'];
if (st21.tiles[5][5] !== ARROWS) {
	if (st21.tiles[5][5] !== FLOOR) {
		throw new Error(`dungeon_3 [2,1] (5,5) は床ではない: '${st21.tiles[5][5]}'`);
	}
	st21.tiles[5][5] = ARROWS;
	changes.push(`dungeon_3 [2,1] (5,5) '${FLOOR}' → '${ARROWS}'`);
}
if (!st21.floorItems) st21.floorItems = {};
if (st21.floorItems['5,5']?.count !== 10) {
	st21.floorItems['5,5'] = { ...(st21.floorItems['5,5'] ?? {}), count: 10 };
	changes.push('dungeon_3 [2,1] floorItems[5,5].count = 10');
}

// ── 3. dungeon_3 [1,2] の死んだ本数データを削除 ───────────────────────────────
const st12 = data.layers.dungeon_3.stages['1,2'];
if (st12.floorItems?.['2,5']) {
	const cell = st12.tiles[2][5];
	if (cell === ARROWS) throw new Error('dungeon_3 [1,2] (2,5) は矢束タイル＝死にデータではない');
	delete st12.floorItems['2,5'];
	if (!Object.keys(st12.floorItems).length) delete st12.floorItems;
	changes.push(`dungeon_3 [1,2] floorItems['2,5'] を削除（セルは '${cell}'＝読まれない）`);
}

// ── 保存 ─────────────────────────────────────────────────────────────────────
writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));

// ── 自己検証（保存したファイルを読み直して確かめる）──────────────────────────
const after = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const errors = [];

const caveAfter = after.layers.cave_1.stages['1,0'];
if (caveAfter.tiles.some(row => row.includes(ARROWS))) errors.push('cave_1 [1,0] に矢束が残っている');

const a21 = after.layers.dungeon_3.stages['2,1'];
if (a21.tiles[5][5] !== ARROWS) errors.push('dungeon_3 [2,1] (5,5) が矢束になっていない');
if (a21.floorItems?.['5,5']?.count !== 10) errors.push('dungeon_3 [2,1] の本数が 10 でない');
if (after.layers.dungeon_3.stages['1,2'].floorItems?.['2,5']) errors.push('dungeon_3 [1,2] の死にデータが残っている');

// 全レイヤー横断：`type` を持たない `count`（＝矢束/爆弾の本数）が、拾えるタイルの上に
// 載っているか。載っていなければ死にデータ＝今回と同じ事故の再発。
const STACK_TILES = new Set([ARROWS, '5']);
for (const [ln, layer] of Object.entries(after.layers ?? {})) {
	for (const [sk, st] of Object.entries(layer.stages ?? {})) {
		for (const [key, fi] of Object.entries(st.floorItems ?? {})) {
			if (fi.count === undefined || fi.type !== undefined) continue;
			const [r, c] = key.split(',').map(Number);
			const cell = st.tiles?.[r]?.[c];
			if (!STACK_TILES.has(cell)) errors.push(`死にデータ: ${ln} [${sk}] ${key} の count が '${cell}' の上にある`);
		}
	}
}
// タイルは文字の配列のまま（行を文字列にすると実ゲームが落ちる）
for (const [ln, layer] of Object.entries(after.layers ?? {})) {
	for (const [sk, st] of Object.entries(layer.stages ?? {})) {
		if (st.tiles && !Array.isArray(st.tiles[0])) { errors.push(`${ln} [${sk}] の tiles 行が配列でない`); break; }
	}
}

console.log('migrate-arrow-floor-items:');
if (!changes.length) console.log('  変更なし（既に適用済み）');
for (const c of changes) console.log(`  ${c}`);
if (errors.length) {
	for (const e of errors) console.error(`  ❌ ${e}`);
	process.exit(1);
}
console.log('  ✅ 検証 OK');
