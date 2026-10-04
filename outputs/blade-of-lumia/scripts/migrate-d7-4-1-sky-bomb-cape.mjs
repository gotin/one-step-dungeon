// dungeon_7 `4,1`（`3,1` の東＝`3,1` と `4,2` をつなぐ通り道）：D6 の写しの部屋を
// 「空の爆弾鬼の岬」に作り替える（2026-10-04 / PLAN 実行キュー 39 の第4陣 3室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー39 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #....7.....#     ← 床に回復薬（小）
//      3 #..........#
//      4 ...........#     ← 床の拾い物＝小さな妖精（4,5）
//      5 ...........#
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   D6 `4,1` と同じ四角い広間に回復薬と妖精が置いてあるだけ。空中の遺跡なのに空が 1 枚も無く、敵もいない。
//
// ■ 新しい `4,1`＝空の爆弾鬼の岬（地形＋敵だけの通り道＝キュー39 のユーザー判定どおり謎・報酬なし）
//      0 ############
//      1 #%%%%%%....#     ← 岬（行1〜3・列7〜10）
//      2 #%%%%%%..λ.#     ← 爆弾鬼 λ(2,9)
//      3 #%%%%%%....#
//      4 .......#%..#     ← 西の口（行4-5）から土手道。列7-8 は空の割れ目＋崩れ残った柱 #(4,7)(5,7)
//      5 .......#%..#
//      6 #%%%%..%%..#     ← 土手道（列5-6）は南の口へ／岬の首（列9-10）は南で折り返す
//      7 #%%%%..%%..#
//      8 #%%%%......#     ← 行8 で土手道と岬の首がつながる（岬へ行く道はここだけ）
//      9 #####..#####     ← 南の口（列5-6）は変えない
//   床が空へ崩れ、西の口から南の口へ折れる土手道と、空の割れ目の向こうに突き出た岬だけが残った。
//   ・見せ場＝**爆弾鬼の爆弾は放物線で空を越えて来る（`lobStep` は壁も水も空も素通り）。こちらの剣は空を越えない。**
//     - 土手道の角 (4,6) と岬の先 (3,7) は斜めに隣り合う＝目の前に見えるのに、歩いて行くと
//       行8 を回って首を上る遠回り（11 歩）になる。
//     - 答えは3つ＝①駆け抜ける（爆弾は投げた瞬間のセルに落ちる＝走っていれば当たらない）
//       ②首を回って岬へ詰め寄る（爆弾鬼は 2 セルより近いと投げない＝密着で爆弾が止まる。
//       岬は行き止まり＝退がる鬼を岬の先へ追い詰められる）③弓で射る。
//   ・崩れ残った柱 #(4,7)(5,7)＝土手道（行4-5）から首への横の射線を切る。爆弾は柱も越える（`lobStep`）が、
//     矢は壁で止まる（`isTilePassableForProj`）。柱が無いと、角 (4,6) に立つだけで退がった鬼が首の上端 (4,9) で
//     同じ行に並び、矢 5 本・17 tick で落ちた（叩き台の初版の実測）＝岬へ回る理由が消える。
//     弓の射線は行8 の割れ目の下 (8,8) から北へ＝空越しに岬の列8 へ通る（探せば見つかる1本・隣の (8,7) は柱で止まる）。
//   ・西の口の脇（列0〜1）は投擲距離 7 の外＝入ってすぐの所で様子を見られる。
//   ・旧 回復薬（小）・床の妖精は撤去（通り道は報酬なし）。
//   ・爆弾鬼は 5.5m の配置表の外＝`scripts/lib/enemy-placement.mjs` の EXTRA_ENEMY_ROOMS に宣言する。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／2つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵は爆弾鬼1体だけ・向き／脅威度 36.0（看板部屋 117.0 より軽い）／宝箱・看板・植生・床の拾い物が無い
//   ・西の口から南の口へ道具なしで歩ける／はしごで歩ける床が増えない／取り残された床が無い
//   ・岬は土手道の角と斜めに隣り合うのに、歩くと行8 を回る遠回り（岬へ入る道は首の1本だけ）
//   ・岬から土手道の大半に爆弾が届く／西の口の脇は届かない
//   ・土手道（行4-5）から首への横の射線は柱で切れる／行8 の割れ目の下から岬へ北の射線が通る
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-4-1-sky-bomb-cape.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-4-1-sky-bomb-cape.mjs         # 書き込み

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
const ROOM  = '4,1';
const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#%%%%%%....#',
	'#%%%%%%..λ.#',
	'#%%%%%%....#',
	'.......#%..#',
	'.......#%..#',
	'#%%%%..%%..#',
	'#%%%%..%%..#',
	'#%%%%......#',
	'#####..#####',
];
export const OGRES = ['2,9'];
export const OGRE_DIRS = { '2,9': 'left' };
const EXPECT_THREAT = 36.0;
// 口のセル（隣室との開き）＝書き換え前と同じ。
export const EXITS = { 西: ['4,0', '5,0'], 南: ['9,5', '9,6'] };
// 岬＝行1〜3・列7〜10。土手道の角＝(4,6)。岬の先＝(3,7)。
export const CAPE = { r0: 1, r1: 3, c0: 7, c1: 10 };
export const CORNER = '4,6';
export const CAPE_TIP = '3,7';
const COMMENT = '【キュー39 空の爆弾鬼の岬（2026-10-04）】床が空へ崩れ、西の口から南の口へ折れる土手道と、'
	+ '空の割れ目の向こうに突き出た岬だけが残った。見せ場＝岬の爆弾鬼 λ の爆弾は放物線で空を越えて来るが、'
	+ 'こちらの剣は空を越えない。土手道の角と岬の先は斜めに隣り合うのに、歩くと行8 を回って首を上る遠回り。'
	+ '答え＝駆け抜ける／首を回って岬の先へ追い詰める（2セルより近いと投げない）／弓で射る'
	+ '（崩れ残った柱が土手道からの横の射線を切る＝射線は行8 の割れ目の下から北へ）。'
	+ '報酬なしの通り道（旧 回復薬・床の妖精は撤去）。盤面は scripts/migrate-d7-4-1-sky-bomb-cape.mjs。';

// ── 幾何の道具（番人からも import）────────────────────────────────────
// from から歩ける床（敵の文字は湧く前の床＝歩ける）。withLadder なら幅 1 の穴/水を
// 1 マスだけ渡れる＝エンジンの進入軸の橋（`game/passable.js`）。空 '%' ははしごの対象外。
export function walkable(t, from, withLadder) {
	return new Set(walkDist(t, from, withLadder).dist.keys());
}
// from からの歩数（BFS）。dist は Map（"r,c" → 歩数）。
export function walkDist(t, from, withLadder = false) {
	const blocked = (r, c) => HARD_BLOCKED.has(t[r][c]);
	const ladderOver = (ch) => ch === TILE.PIT || ch === TILE.WATER;
	const dist = new Map([[from, 0]]), q = [from.split(',').map(Number)];
	while (q.length) {
		const [r, c] = q.shift();
		const d = dist.get(`${r},${c}`);
		for (const [dr, dc] of DIRS4) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (!inside(nr, nc) || dist.has(k)) continue;
			const ladderOk = withLadder && ladderOver(t[nr][nc])
				&& inside(nr + dr, nc + dc) && !blocked(nr + dr, nc + dc);
			if (blocked(nr, nc) && !ladderOk) continue;
			dist.set(k, d + 1); q.push([nr, nc]);
		}
	}
	return { dist };
}
// 岬のセル。
export function capeCells() {
	const out = [];
	for (let r = CAPE.r0; r <= CAPE.r1; r++) for (let c = CAPE.c0; c <= CAPE.c1; c++) out.push(`${r},${c}`);
	return out;
}
// 爆弾鬼が岬のどこかに立てば爆弾が届く床か（投擲の距離の門＝minRange ≤ 距離 ≤ range・ユークリッド）。
export function inThrowReach(k, attack) {
	const [r, c] = k.split(',').map(Number);
	return capeCells().some((o) => {
		const [or, oc] = o.split(',').map(Number);
		const d = Math.hypot(r - or, c - oc);
		return d >= attack.minRange && d <= attack.range;
	});
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
	// ＝[[field-tiles-are-char-arrays]]）。λ は BMP 内の1文字＝split('') で1セル。
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => row.split(''));
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	if (Object.keys(room.floorItems ?? {}).length) {
		log.push(`  ${ROOM}: 床の拾い物を撤去した（${JSON.stringify(room.floorItems)}）`);
		room.floorItems = {};
	}
	if (JSON.stringify(room.enemyDirs ?? {}) !== JSON.stringify(OGRE_DIRS)) {
		room.enemyDirs = { ...OGRE_DIRS };
		log.push(`  ${ROOM}: 敵の向きを ${JSON.stringify(OGRE_DIRS)} にした`);
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
		check(`敵は爆弾鬼 λ×1 だけ（実測 ${JSON.stringify(enemies)}）`,
			JSON.stringify(enemies) === JSON.stringify({ [TILE.BOMB_OGRE]: OGRES }));
		check(`爆弾鬼の投擲は放物線（attack.type bombThrow）`, ENEMY_META[TILE.BOMB_OGRE]?.attack?.type === 'bombThrow');
		check(`敵の向きが ${JSON.stringify(OGRE_DIRS)}`, JSON.stringify(room.enemyDirs) === JSON.stringify(OGRE_DIRS));
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
	check(`links が書き換え前と同じ・bgTiles が空・showConditions が空`,
		JSON.stringify(room.links) === baseLinks && Object.keys(room.bgTiles).length === 0
		&& Object.keys(room.showConditions ?? {}).length === 0);

	// ── ② 歩ける範囲 ──────────────────────────────────────────────────
	const foot = walkable(t, EXITS.西[0], false);
	check(`道具なしで西の口から南の口へ歩ける`, EXITS.南.every((k) => foot.has(k)));
	{
		const ladder = walkable(t, EXITS.西[0], true);
		check(`はしごがあっても空は渡れない（歩ける ${foot.size} マス＝はしご ${ladder.size} マス）`, foot.size === ladder.size);
		const stranded = cellsOf(t, (ch) => !HARD_BLOCKED.has(ch)).filter((k) => !foot.has(k));
		check(`取り残された床が無い（実測 ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	}

	// ── ③ 岬（近いのに遠い）と爆弾の届き ─────────────────────────────
	{
		const cape = capeCells();
		check(`岬（行${CAPE.r0}〜${CAPE.r1}×列${CAPE.c0}〜${CAPE.c1}）はすべて歩ける床`, cape.every((k) => foot.has(k)));
		check(`爆弾鬼は岬の中`, OGRES.every((k) => cape.includes(k)));
		const [cr, cc] = CORNER.split(',').map(Number), [tr, tc] = CAPE_TIP.split(',').map(Number);
		check(`土手道の角 ${CORNER} と岬の先 ${CAPE_TIP} は斜めに隣り合う`, Math.abs(cr - tr) === 1 && Math.abs(cc - tc) === 1);
		const steps = walkDist(t, CORNER).dist.get(CAPE_TIP);
		check(`歩くと遠回り（${CORNER}→${CAPE_TIP} の歩数 ${steps} ≥ 10）`, steps >= 10);
		// 岬へ入る道は首の1本だけ＝岬に隣り合う岬の外の床は首の上端だけ。
		const gates = new Set();
		for (const k of cape) {
			const [r, c] = k.split(',').map(Number);
			for (const [dr, dc] of DIRS4) {
				const nk = `${r + dr},${c + dc}`;
				if (inside(r + dr, c + dc) && !cape.includes(nk) && !HARD_BLOCKED.has(at(t, nk))) gates.add(nk);
			}
		}
		check(`岬の外から岬へ入れるセルは首の上端 (4,9)(4,10) だけ（実測 ${[...gates].sort().join(' ')}）`,
			JSON.stringify([...gates].sort()) === JSON.stringify(['4,10', '4,9']));
		// 首（列9-10・行4〜7）を潰すと岬が切り離される＝岬へ行く道は行8 を回る1本。
		const t2 = t.map((row) => [...row]);
		t2[8][7] = TILE.WALL;
		check(`行8 の (8,7) を潰すと岬へ歩けない（岬へ行く道は行8 だけ）`, !walkable(t2, EXITS.西[0], false).has(CAPE_TIP));
		const atk = ENEMY_META[TILE.BOMB_OGRE].attack;
		const causeway = [...foot].filter((k) => !cape.includes(k) && Number(k.split(',')[1]) <= 6);
		const reached = causeway.filter((k) => inThrowReach(k, atk));
		check(`岬から土手道（列0〜6）の大半に爆弾が届く（${reached.length}/${causeway.length} ≥ 2/3）`,
			reached.length * 3 >= causeway.length * 2);
		check(`西の口の脇 (4,0)(5,0) には届かない＝入ってすぐ様子を見られる`,
			!inThrowReach('4,0', atk) && !inThrowReach('5,0', atk));
		// 弓の射線：土手道（行4-5）から東へは柱で切れる＝首にも岬にも届かない。
		const neckOrCape = (k) => cape.includes(k) || (Number(k.split(',')[1]) >= 9 && foot.has(k));
		const rowShots = ['4', '5'].flatMap((r) => [0, 1, 2, 3, 4, 5, 6].map((c) => arrowLane(t, `${r},${c}`, [0, 1])));
		check(`土手道（行4-5）から東への矢は柱 #(4,7)(5,7) で止まり、首にも岬にも届かない`,
			at(t, '4,7') === TILE.WALL && at(t, '5,7') === TILE.WALL && rowShots.every((lane) => !lane.some(neckOrCape)));
		// 土手道の縦（列5-6）から北へも岬に届かない（岬は列7〜10）。
		check(`土手道の縦（列5-6）から北への矢は岬に届かない`,
			['5', '6'].every((c) => [4, 5, 6, 7, 8].every((r) => !arrowLane(t, `${r},${c}`, [-1, 0]).some((k) => cape.includes(k)))));
		// 射線は行8 の割れ目の下 (8,8) から北へ＝空を越えて岬の列8 へ通る。
		check(`行8 の割れ目の下 (8,8) から北への矢は空を越えて岬へ届く／隣の (8,7) は柱で止まる`,
			arrowLane(t, '8,8', [-1, 0]).some((x) => cape.includes(x))
			&& !arrowLane(t, '8,7', [-1, 0]).some((x) => cape.includes(x)));
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
	console.log(`# ${LAYER} ${ROOM}：通り道を「空の爆弾鬼の岬」に作り替える（キュー39 第4陣）`);
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
