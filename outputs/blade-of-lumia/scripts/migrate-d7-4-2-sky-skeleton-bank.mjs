// dungeon_7 `4,2`（`4,1` の南＝`4,1` と `3,2` をつなぐ角の通り道）：D6 の写しの部屋を
// 「空の骸骨の並走岸」に作り替える（2026-10-05 / PLAN 実行キュー 39 の第4陣 4室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー39 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 ...........#
//      5 ...........#
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 ############
//   D6 `4,2` と同じ四角い広間に何も無い。空中の遺跡なのに空が 1 枚も無く、敵もいない。
//
// ■ 新しい `4,2`＝空の骸骨の並走岸（地形＋敵だけの通り道＝キュー39 のユーザー判定どおり謎・報酬なし）
//      0 #####..#####
//      1 #%%%%..%%%%#     ← 北の口（列5-6）から下りる桟橋
//      2 #%%%%..%%%%#
//      3 #%%%%..%%%%#
//      4 .......%%%%#     ← 西の口（行4-5）へ折れる土手道
//      5 .......%%%%#
//      6 #%%.%%%%%%%#     ← 空の割れ目。(6,3) だけが崩れ残った幅1の渡り＝合流点
//      7 #θ.........#     ← 南の岸（行7-8）＝骸骨剣士 θ×2（西の端 (7,1)・東の端 (8,9)）
//      8 #........θ.#
//      9 ############
//   床が空へ崩れ、北の口から西の口へ折れる土手道と、空の割れ目を挟んだ南の岸だけが残った。
//   ・見せ場＝**骸骨は空を渡れない＝向こう岸をこちらと並んで歩いて来る。** 骸骨の追い方は「プレイヤーへ
//     近い方の軸へ1歩」（`enemyChase`）∴割れ目の向こうでは縦に進めず、横だけを詰めて**同じ列に並び、
//     こちらが歩くとついて来る**。合流点 (6,3) の列を通った瞬間、並んでいた骸骨が割れ目を渡って上がって来る。
//   ・2体の役＝東の骸骨は北の桟橋を下りるこちらと列を合わせて並走する／西の骸骨は北から来たこちらへ寄る途中で
//     合流点の列を通る＝そのまま上がって来て、西の口への道を塞ぐ（叩き台の初版は2体とも東に置いた＝
//     並走して遅れるだけで、駆け抜けても立ち止まっても一度も上がって来なかった）。
//   ・答えは3つ＝①駆け抜ける（骸骨は遅い＝合流点から上がる頃には先へ行ける）②合流点で迎え撃つ
//     （渡りは幅1＝1体ずつしか上がって来られない）③空越しに矢で射る（並んで足を止めた骸骨は割れ目の
//     向こうの的＝D7 の弓の再演）。
//   ・旧 床は何も無い（拾い物なし）。
//   ・骸骨剣士は 5.5m の配置表の外＝`scripts/lib/enemy-placement.mjs` の EXTRA_ENEMY_ROOMS に宣言する。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／2つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵は骸骨剣士2体だけ／脅威度 36.0（看板部屋 117.0 より軽い）／宝箱・看板・植生・床の拾い物が無い
//   ・北の口から西の口へ道具なしで歩ける／はしごで歩ける床が増えない／取り残された床が無い
//   ・岸と土手道をつなぐのは合流点 (6,3) の1マスだけ／合流点を潰すと岸へ行けない
//   ・土手道（行4-5）の各列のうち岸と縦に向かい合う列は空1枚越し（矢の射線が通る）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-4-2-sky-skeleton-bank.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-4-2-sky-skeleton-bank.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '4,2';
const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#%%%%..%%%%#',
	'#%%%%..%%%%#',
	'#%%%%..%%%%#',
	'.......%%%%#',
	'.......%%%%#',
	'#%%.%%%%%%%#',
	'#θ.........#',
	'#........θ.#',
	'############',
];
export const SKELETONS = ['7,1', '8,9'];
const EXPECT_THREAT = 36.0;
// 口のセル（隣室との開き）＝書き換え前と同じ。
export const EXITS = { 北: ['0,5', '0,6'], 西: ['4,0', '5,0'] };
// 合流点＝空の割れ目に崩れ残った幅1の渡り。
export const JUNCTION = '6,3';
// 南の岸＝行7-8。
export const BANK_ROWS = [7, 8];
const COMMENT = '【キュー39 空の骸骨の並走岸（2026-10-05）】床が空へ崩れ、北の口から西の口へ折れる土手道と、'
	+ '空の割れ目を挟んだ南の岸だけが残った。見せ場＝骸骨剣士は空を渡れない∴向こう岸をこちらと同じ列に並んで'
	+ 'ついて来る。割れ目に崩れ残った幅1の渡り（合流点）の列を通ると、並んでいた骸骨が上がって来る。'
	+ '答え＝駆け抜ける／合流点で1体ずつ迎え撃つ／空越しに矢で射る。'
	+ '報酬なしの通り道。盤面は scripts/migrate-d7-4-2-sky-skeleton-bank.mjs。';

// ── 幾何の道具（番人からも import）────────────────────────────────────
// from から歩ける床（敵の文字は湧く前の床＝歩ける）。withLadder なら幅 1 の穴/水を
// 1 マスだけ渡れる＝エンジンの進入軸の橋（`game/passable.js`）。空 '%' ははしごの対象外。
export function walkable(t, from, withLadder = false) {
	const blocked = (r, c) => HARD_BLOCKED.has(t[r][c]);
	const ladderOver = (ch) => ch === TILE.PIT || ch === TILE.WATER;
	const seen = new Set([from]), q = [from.split(',').map(Number)];
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of DIRS4) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(k)) continue;
			const ladderOk = withLadder && ladderOver(t[nr][nc])
				&& inside(nr + dr, nc + dc) && !blocked(nr + dr, nc + dc);
			if (blocked(nr, nc) && !ladderOk) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
// 矢の射線：from から dir へ、矢を止めるセル（壁 #）に当たるまでに通るセル（エンジンの
// `isTilePassableForProj` と同じ＝壁だけが止める。空・床は越える）。
export function arrowLane(t, from, [dr, dc]) {
	const out = [];
	let [r, c] = from.split(',').map(Number);
	for (;;) {
		r += dr; c += dc;
		if (!inside(r, c) || t[r][c] === TILE.WALL) return out;
		out.push(`${r},${c}`);
	}
}
// 岸のセル（行7-8 の歩ける床）。
export function bankCells(t) {
	return cellsOf(t, (ch) => !HARD_BLOCKED.has(ch)).filter((k) => BANK_ROWS.includes(Number(k.split(',')[0])));
}

// ── 読み込み ─────────────────────────────────────────────────────────
// 盤面（TARGET）と道具は番人からも import する∴直接実行されたときだけ main を走らせる（呼ぶのはファイル末尾）。
function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の着地セル
	const layerRun = () => bfsLayer(stages, START, { withLadder: true, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: true, openTiles: new Set(['T', '!', 'D', '=']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();
	const baseLinks = JSON.stringify(room.links ?? []);

	const before = room.tiles.map(rowStr);
	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	// tiles は「文字の配列の配列」で持つ（行文字列にするとゲームが落ちる
	// ＝[[field-tiles-are-char-arrays]]）。θ は BMP 内の1文字＝split('') で1セル。
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => row.split(''));
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	if (Object.keys(room.floorItems ?? {}).length) {
		log.push(`  ${ROOM}: 床の拾い物を撤去した（${JSON.stringify(room.floorItems)}）`);
		room.floorItems = {};
	}
	if (room.comment !== COMMENT) {
		room.comment = COMMENT;
		log.push(`  ${ROOM}: comment を書き換えた`);
	}
	room.links ??= [];
	room.bgTiles ??= {};
	room.signData ??= {};
	room.npcData ??= {};
	room.chestContents ??= {};
	room.floorItems ??= {};

	// ── ① 盤面とデータ ────────────────────────────────────────────────
	const t = grid(room);
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	for (const [name, cells] of Object.entries(EXITS)) {
		check(`${name}の口（${cells.join(' ')}）が開いている`, cells.every((k) => at(t, k) === TILE.FLOOR));
	}
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは2つの口だけ（実測 ${open.join(' ')}）`, JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = {};
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const ch = t[r][c];
			if (ENEMY_META[ch]) (enemies[ch] ??= []).push(`${r},${c}`);
		}
		check(`敵は骸骨剣士 θ×2 だけ（実測 ${JSON.stringify(enemies)}）`,
			JSON.stringify(enemies) === JSON.stringify({ [TILE.SKELETON]: SKELETONS }));
		const meta = ENEMY_META[TILE.SKELETON];
		check(`骸骨剣士は陸を歩いて追う敵（move なし・combat なし・遠隔なし）`,
			!meta.move && !meta.combat && !meta.attacks && meta.attack?.type === 'sword');
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）＝十字路 2,3（看板部屋 117.0）より軽い`, threat === EXPECT_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`宝箱・看板・本文・床の拾い物・回復薬が無い（報酬なしの通り道）`,
		cellsOf(t, (ch) => ch === TILE.CHEST || ch === TILE.SIGN || ch === TILE.ITEM_HEAL_POTION).length === 0
		&& Object.keys(room.chestContents).length === 0 && Object.keys(room.floorItems).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`石・植生が無い`, cellsOf(t, (ch) => ch === TILE.STONE || ch === TILE.TREE || ch === TILE.BUSH).length === 0);
	check(`links が書き換え前と同じ・bgTiles が空・showConditions が空・enemyDirs が空`,
		JSON.stringify(room.links) === baseLinks && Object.keys(room.bgTiles).length === 0
		&& Object.keys(room.showConditions ?? {}).length === 0 && Object.keys(room.enemyDirs ?? {}).length === 0);

	// ── ② 歩ける範囲 ──────────────────────────────────────────────────
	const foot = walkable(t, EXITS.北[0]);
	check(`道具なしで北の口から西の口へ歩ける`, EXITS.西.every((k) => foot.has(k)));
	{
		const ladder = walkable(t, EXITS.北[0], true);
		check(`はしごがあっても空は渡れない（歩ける ${foot.size} マス＝はしご ${ladder.size} マス）`, foot.size === ladder.size);
		const stranded = cellsOf(t, (ch) => !HARD_BLOCKED.has(ch)).filter((k) => !foot.has(k));
		check(`取り残された床が無い（実測 ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	}

	// ── ③ 岸と合流点 ──────────────────────────────────────────────────
	{
		const bank = bankCells(t);
		check(`骸骨は2体とも南の岸`, SKELETONS.every((k) => bank.includes(k)));
		// 岸に隣り合う岸の外の床＝合流点だけ。
		const gates = new Set();
		for (const k of bank) {
			const [r, c] = k.split(',').map(Number);
			for (const [dr, dc] of DIRS4) {
				const nk = `${r + dr},${c + dc}`;
				if (inside(r + dr, c + dc) && !bank.includes(nk) && !HARD_BLOCKED.has(at(t, nk))) gates.add(nk);
			}
		}
		check(`岸の外から岸へ入れるセルは合流点 ${JUNCTION} だけ（実測 ${[...gates].sort().join(' ')}）`,
			JSON.stringify([...gates]) === JSON.stringify([JUNCTION]));
		const t2 = t.map((row) => [...row]);
		const [jr, jc] = JUNCTION.split(',').map(Number);
		t2[jr][jc] = TILE.SKY;
		check(`合流点を空にすると岸へ歩けない（岸と土手道をつなぐのは合流点だけ）`,
			!bank.some((k) => walkable(t2, EXITS.北[0]).has(k)));
		check(`合流点は西の土手道（行4-5・列0〜6）の真下＝土手道を歩くと必ずその列を通る`,
			jr === 6 && jc >= 0 && jc <= 6 && at(t, `5,${jc}`) === TILE.FLOOR);
		// 土手道（行5）から南への矢は空1枚を越えて岸へ届く（合流点の列以外）＝射線。
		const lanes = [1, 2, 4, 5, 6].map((c) => arrowLane(t, `5,${c}`, [1, 0]));
		check(`土手道の行5（列1〜6・合流点の列を除く）から南への矢は空1枚を越えて岸へ届く`,
			lanes.every((lane) => lane[0] && at(t, lane[0]) === TILE.SKY && lane.some((k) => bank.includes(k))));
		// 土手道と岸の縦の距離＝2（空1枚）＞剣の届き 1.5＝空越しには斬り合えない。
		const reach = ENEMY_META[TILE.SKELETON].attack.range;
		check(`割れ目越しの距離 2 は骸骨の剣の届き ${reach} より遠い＝空越しには斬られない`, 2 > reach);
	}

	// ── ④ 層の到達性は不変 ─────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
			same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(open.reachedRooms, baseOpen.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ───────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：通り道を「空の骸骨の並走岸」に作り替える（キュー39 第4陣）`);
	console.log(log.join('\n') || '  （変更なし）');

	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => {
		const now = rowStr(row);
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === now ? '=' : '→'}   ${now}`);
	});

	console.log('\n## 検証');
	let ng = 0;
	for (const [cond, msg] of verify) {
		console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
		if (!cond) ng++;
	}
	if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);

	if (DRY) {
		console.log('\n--dry: 書き込みなし');
	} else {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('\n書き込み完了:', MAP_PATH);
	}
}

// ── 道具 ─────────────────────────────────────────────────────────────
function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function grid(room) { return room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split(''))); }
function at(t, k) { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; }
function inside(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
function cellsOf(t, pred) {
	const out = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
	return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
