// dungeon_7 `2,3`（十字路＝D7 の看板部屋）：D6 の写しの部屋を「空の崩れ天蓋」に作り替える
// （2026-10-04 / PLAN 実行キュー 39 の第3陣 3室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー39 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #....ω.....#     ← 突進猪 ω
//      3 #..π....π..#     ← ブーメラン鬼 π×2
//      4 ............
//      5 ............
//      6 #..t...u...#     ← 森の木 t・茂み u（突進の激突先）
//      7 #.....ω....#     ← 突進猪 ω
//      8 #..........#
//      9 #####..#####
//   敵の配置（5.5m の看板部屋・脅威度 117.0）だけを足した、D6 と同じ四角い広間。
//   空中の遺跡なのに空が 1 枚も無く、激突先は森の木と茂みのまま。
//
// ■ 新しい `2,3`＝空の崩れ天蓋（地形＋敵だけの通り道＝キュー39 のユーザー判定どおり謎・報酬なし）
//      0 #####..#####     ← 4つの口（北・南 列5-6／西・東 行4-5）は変えない
//      1 #%%%....%%%#
//      2 #%%..ω...%%#     ← 突進猪 ω(2,5)＝北の半分
//      3 #%.π#..#π.%#     ← ブーメラン鬼 π(3,3)・π(3,8)／天蓋の柱の残骸 #(3,4)・#(3,7)
//      4 ....%%%%....     ← 天蓋が抜け落ちた空の裂け目（行4-5 × 列4-7）
//      5 ....%%%%....        西と東の橋だけが北の半分と南の半分をつなぐ
//      6 #%..#..#..%#     ← 天蓋の柱の残骸 #(6,4)・#(6,7)
//      7 #%%...ω..%%#     ← 突進猪 ω(7,6)＝南の半分
//      8 #%%%....%%%#
//      9 #####..#####
//   ・見せ場＝**空は猪を止めるが、ブーメランは通す**。
//     - 陸の敵は空へ入れない（`enemyTilePassable`）∴猪の突進は空の縁で止まる＝壁と同じ激突
//       （`tickDash` ②＝地形に激突 → 気絶）。裂け目の向こうで軸が合った猪は、縁へ突っ込んで
//       気絶する＝空が猪の盾になる。
//     - 投擲物を止めるのは壁と崩れていない `!` だけ（`projectile.js isTilePassableForProj`）
//       ∴ブーメラン鬼の投擲は裂け目の上を越えて来る＝空は鬼の盾にならない。
//       裂け目の幅は 3（行3 ↔ 行6）＝鬼の投げる距離 4.0 の内側。
//     - 柱の残骸 4 本は裂け目の四隅＝列4・列7 の射線を切り、裂け目越しに投擲が通るのは
//       列5-6（北と南の口の列）だけ。柱は突進の激突先（旧 木・茂みの役）も兼ねる。
//   ・敵は書き換え前と同じ4体を同じセルに残す（5.5m の配置表 `scripts/lib/enemy-placement.mjs`
//     のとおり＝脅威度 117.0・SIGNATURE_LADDER の単調増加を崩さない）。enemyDirs も同じ。
//   ・森の木・茂みは撤去（空中の遺跡に森は無い）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／4つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵の構成とセル・脅威度・向きが書き換え前と同じ／宝箱・看板・植生が無い
//   ・柱の残骸は裂け目の四隅／裂け目のセルはすべて空
//   ・どの口からでも、ほかの3つの口へ道具なしで歩ける／取り残された床が無い／はしごで増えない
//   ・北の口から南の口へは裂け目を越えられない＝西か東の橋を回る（対照＝両方の橋を壁で塗ると
//     北から南へ歩けない／片方だけなら歩ける）
//   ・裂け目越し（列5-6・行3 ↔ 行6）に壁が無い＝投擲が通る／距離 3 は鬼の投げる距離と
//     猪の突進の距離の両方に入る（＝どちらも裂け目越しに反応する）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-2-3-sky-fallen-dome.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-2-3-sky-fallen-dome.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '2,3';
const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#%%%....%%%#',
	'#%%..ω...%%#',
	'#%.π#..#π.%#',
	'....%%%%....',
	'....%%%%....',
	'#%..#..#..%#',
	'#%%...ω..%%#',
	'#%%%....%%%#',
	'#####..#####',
];
const EXPECT_ENEMIES = { [TILE.CHARGE_BOAR]: ['2,5', '7,6'], [TILE.BOOMERANG_OGRE]: ['3,3', '3,8'] };
const EXPECT_DIRS = { '3,3': 'right', '3,8': 'left' };
const EXPECT_THREAT = 117.0;
// 口のセル（隣室との開き）＝書き換え前と同じ。
const EXITS = { 北: ['0,5', '0,6'], 南: ['9,5', '9,6'], 西: ['4,0', '5,0'], 東: ['4,11', '5,11'] };
// 天蓋が抜け落ちた空の裂け目と、その四隅に残る柱。
const RIFT = { r0: 4, r1: 5, c0: 4, c1: 7 };
const PILLARS = ['3,4', '3,7', '6,4', '6,7'];
// 裂け目越しに投擲が通る列（北と南の口の列）。
const ACROSS_COLS = [5, 6];
const COMMENT = '【キュー39 空の崩れ天蓋（2026-10-04）】天蓋が抜け落ちた空の裂け目（行4-5×列4-7）が広間を南北に割り、'
	+ '西と東の橋だけがつなぐ。見せ場＝空は猪を止めるがブーメランは通す（陸の敵は空へ入れず突進は縁で激突・気絶／'
	+ '投擲物は空の上を越える）。柱の残骸4本は裂け目の四隅＝列4・7 の射線を切り、突進の激突先も兼ねる。'
	+ '敵は5.5m 看板部屋の4体（突進猪2・ブーメラン鬼2＝117.0）を同じセルに残した。'
	+ '盤面は scripts/migrate-d7-2-3-sky-fallen-dome.mjs。';

// ── 読み込み ─────────────────────────────────────────────────────────
// 盤面（TARGET）は番人からも import する∴直接実行されたときだけ main を走らせる（呼ぶのはファイル末尾）。
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
	// ＝[[field-tiles-are-char-arrays]]）。ω・π は BMP 内の1文字＝split('') で1セル。
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => row.split(''));
		log.push(`  ${ROOM}: 盤面を差し替えた`);
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
		check(`画面の縁で開いているのは4つの口だけ（実測 ${open.join(' ')}）`, JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = {};
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const ch = t[r][c];
			if (ENEMY_META[ch]) (enemies[ch] ??= []).push(`${r},${c}`);
		}
		check(`敵の構成＝突進猪 ω×2・ブーメラン鬼 π×2 が書き換え前と同じセル（実測 ${JSON.stringify(enemies)}）`,
			Object.keys(enemies).length === Object.keys(EXPECT_ENEMIES).length
			&& Object.entries(EXPECT_ENEMIES).every(([ch, cells]) => JSON.stringify(enemies[ch]) === JSON.stringify(cells)));
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）`, threat === EXPECT_THREAT);
		check(`敵の向きが書き換え前と同じ（${JSON.stringify(room.enemyDirs)}）`,
			JSON.stringify(room.enemyDirs) === JSON.stringify(EXPECT_DIRS));
	}
	check(`宝箱・看板・本文が無い（報酬なしの通り道）`,
		cellsOf(t, (ch) => ch === TILE.CHEST || ch === TILE.SIGN).length === 0
		&& Object.keys(room.chestContents).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`石・植生が残っていない`, cellsOf(t, (ch) => ch === TILE.STONE || ch === TILE.TREE || ch === TILE.BUSH).length === 0);
	check(`links が書き換え前と同じ・bgTiles が空`,
		JSON.stringify(room.links) === baseLinks && Object.keys(room.bgTiles).length === 0);
	{
		const rift = [];
		for (let r = RIFT.r0; r <= RIFT.r1; r++) for (let c = RIFT.c0; c <= RIFT.c1; c++) rift.push(`${r},${c}`);
		check(`裂け目（行${RIFT.r0}-${RIFT.r1}×列${RIFT.c0}-${RIFT.c1}）がすべて空`, rift.every((k) => at(t, k) === TILE.SKY));
		check(`柱の残骸は裂け目の四隅 ${PILLARS.join(' ')} の4本だけ（内側の壁）`,
			JSON.stringify(cellsOf(t, (ch) => ch === TILE.WALL).filter((k) => {
				const [r, c] = k.split(',').map(Number);
				return r > 0 && r < ROWS - 1 && c > 0 && c < COLS - 1;
			})) === JSON.stringify(PILLARS));
	}

	// ── ② 歩ける範囲 ──────────────────────────────────────────────────
	for (const [from, fromCells] of Object.entries(EXITS)) {
		const foot = walkable(t, fromCells[0], false);
		for (const [to, cells] of Object.entries(EXITS)) {
			if (to === from) continue;
			check(`道具なしで${from}の口から${to}の口へ歩ける`, cells.every((k) => foot.has(k)));
		}
	}
	{
		const foot = walkable(t, EXITS.北[0], false);
		const ladder = walkable(t, EXITS.北[0], true);
		check(`はしごがあっても空は渡れない（歩ける ${foot.size} マス＝はしご ${ladder.size} マス）`, foot.size === ladder.size);
		const floors = cellsOf(t, (ch) => !HARD_BLOCKED.has(ch));
		check(`床のどのセルにも歩いて行ける（取り残された床が無い）`, floors.every((k) => foot.has(k)));
	}
	{
		// 対照＝西と東の橋（行4-5 の列1-3／列8-10）を壁で塗ると北から南へ歩けない＝裂け目は越えられない。
		// 片方だけ塗っても歩ける＝どちらの橋でも回れる（[[blade-control-experiment-needs-tile-wall]]）。
		const wallBridge = (g, c0, c1) => { for (let r = 4; r <= 5; r++) for (let c = c0; c <= c1; c++) g[r][c] = TILE.WALL; };
		const both = grid(room); wallBridge(both, 1, 3); wallBridge(both, 8, 10);
		check(`対照：西と東の橋を壁で塗ると、北の口から南の口へ歩けない（裂け目は越えられない）`,
			!walkable(both, EXITS.北[0], false).has(EXITS.南[0]));
		const west = grid(room); wallBridge(west, 1, 3);
		const east = grid(room); wallBridge(east, 8, 10);
		check(`西の橋だけ塞いでも、東の橋だけ塞いでも、北から南へ歩ける`,
			walkable(west, EXITS.北[0], false).has(EXITS.南[0]) && walkable(east, EXITS.北[0], false).has(EXITS.南[0]));
	}

	// ── ③ 裂け目越しの敵（空は猪を止め、ブーメランは通す）──────────────
	{
		const across = RIFT.r1 + 1 - (RIFT.r0 - 1);   // 行3 ↔ 行6
		const lineClear = (c) => {
			for (let r = RIFT.r0 - 1; r <= RIFT.r1 + 1; r++) if (t[r][c] === TILE.WALL || t[r][c] === TILE.BREAKABLE_WALL) return false;
			return true;
		};
		check(`裂け目越しの列 ${ACROSS_COLS.join('・')} は行${RIFT.r0 - 1}↔行${RIFT.r1 + 1} に壁が無い（投擲が通る）・両岸が床`,
			ACROSS_COLS.every((c) => lineClear(c) && !HARD_BLOCKED.has(t[RIFT.r0 - 1][c]) && !HARD_BLOCKED.has(t[RIFT.r1 + 1][c])));
		check(`柱が列${RIFT.c0}・列${RIFT.c1} の裂け目越しの射線を切る`, !lineClear(RIFT.c0) && !lineClear(RIFT.c1));
		const ogre = ENEMY_META[TILE.BOOMERANG_OGRE].attack;
		check(`裂け目の幅 ${across} はブーメラン鬼の投げる距離（${ogre.minRange}〜${ogre.range}）に入る`,
			across >= ogre.minRange && across <= ogre.range);
		const dash = ENEMY_META[TILE.CHARGE_BOAR].dash;
		check(`裂け目の幅 ${across} は猪の突進の距離（${dash.minRange}〜${dash.maxRange}）に入る＝裂け目越しに溜めて縁へ突っ込む`,
			across >= dash.minRange && across <= dash.maxRange);
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
	console.log(`# ${LAYER} ${ROOM}：十字路を「空の崩れ天蓋」に作り替える（キュー39 第3陣）`);
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
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
function cellsOf(t, pred) {
	const out = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
	return out;
}
// from から歩ける床（敵の文字は湧く前の床＝歩ける）。withLadder なら幅 1 の穴/水を
// 1 マスだけ渡れる＝エンジンの進入軸の橋（`game/passable.js`）。空 '%' ははしごの対象外。
function walkable(t, from, withLadder) {
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

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
