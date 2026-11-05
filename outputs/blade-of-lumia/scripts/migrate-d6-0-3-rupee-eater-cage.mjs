// dungeon_6 `0,3`（入口の西の行き止まり）：薄い部屋を「ルピー喰いの檻」に作り替える
// （2026-11-05 / PLAN 実行キュー 95 の1室目・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー95 の着手時の実測＝`.scratch/q95/dump-d6.mjs`）
//      0 ############
//      2 #..t....u..#
//      4 #...........     ← 東の口（入口 `1,3`）。北・西・南は閉じている＝行き止まり
//      6 #..u....t..#
//      9 ############
//   四角い広間に木2本・茂み2つ・床のルピー（5）が1つだけ・敵なし。
//
// ■ 新しい `0,3`＝ルピー喰いの檻（石の檻の中に宝箱とルピー喰い。扉は朽ちた根1枚）
//      0 ############
//      1 #..........#     ← 北の回廊
//      2 ##########.#
//      3 ##B......#.#     ← 檻の奥の宝箱 B(3,2)
//      4 ##σ......!..     ← ルピー喰い σ(4,2)／朽ちた根の扉 !(4,9)／東の口
//      5 ##.......#..
//      6 ##########.#
//      7 #..........#     ← 南の回廊
//      8 #..t....t..#
//      9 ############
//   ・檻（壁の箱・中は 3×7）の口は東の朽ちた根 (4,9) の1枚だけ。剣・矢・ブーメランは壁と根で
//     止まる＝**爆弾でしか開かない**。
//   ・D6 で最初に入れる部屋の1つ（入口 `1,3` の西隣）＝**爆弾を手に入れる前に来る**。東の口から
//     入ると真正面に根の扉、その奥に宝箱とルピー喰いが見える＝「ここで手に入る火薬で開ける」の
//     予告（D4 `0,3`「怨念の封じ祠」がロウソクを予告したのと対）。爆弾は入口の北 `1,2` の宝箱。
//   ・爆風は半径 2 の円で壁を越える（勇者は傷まない）＝扉の外 (4,10) に置くと、扉 (4,9) と
//     **扉の内側 (4,8)** に届く（hp 15 ＜ 爆弾 20＝そこに居れば一撃）。
//   ・ルピー喰いの家は檻の西の端＝さまよう箱（家から3マス＝列5 まで）は扉の外 (4,10) から
//     5 マス以上＝**扉の前に立っても気づかない**。北か南の回廊を歩いて近づけば気づいて、檻の
//     中を勇者について来る＝**回廊で起こして扉の前まで連れて来てから置く**のが答え。起こさずに
//     置けば扉だけが開き、檻へ入ったところで気づかれて張り付かれ、財布を吸われる（剣で5振り）。
//   ・報酬＝宝箱のルピー×30（旧 床のルピー×5）。ルピー喰いの守る蔵＝吸われる前に倒せば丸儲け。
//   ・使う爆弾は1個（キュー95 の約束①＝鍵の部屋 `1,0` の2個を食わない）。床の爆弾は置かない（約束②）。
//   ・D6 の他の部屋と型を分けた＝`2,3` 分裂スライムの巣（看板・開けた広間の戦闘）／`3,3` 檻の番人
//     （番人に石を運ばせる）／`1,0` 朽ち根の環（倉庫番）。D4 `4,2`「爆弾鬼の封じ窯」は敵の爆弾で
//     ひびを壊させる部屋＝こちらは自分の爆弾で檻ごと敵を巻き込む（向きが逆）。
//
// ■ 撤去したもの
//   床のルピー r(4,5)（floorItems も）・木と茂み（壁の檻に置き換え・飾りの木を4本残す）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／宝の中身／breakableWalls／floorItems・showConditions・links・signData が空／外周の口の形が不変
//   ・扉を開ける前：東の口から宝箱に届かない・檻の外の床は全部届く（取り残しなし）
//   ・扉を開けると宝箱に届く／檻の口は扉1枚だけ（対照〈扉を床〉で届く・〈扉を壁〉で届かない）
//   ・扉の外の立てる床は (4,10) だけ・そこに置いた爆風が扉と (4,8) に届き、(3,8)(5,8) には届かない
//   ・檻の外から檻の中へ、剣・矢・ブーメランの直線が無い（壁と扉が全部ふさぐ）
//   ・敵と脅威度（看板 `2,3` より軽い）・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-0-3-rupee-eater-cage.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-0-3-rupee-eater-cage.mjs         # 書き込み

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

export const LAYER = 'dungeon_6';
export const ROOM  = '0,3';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#..........#',
	'##########.#',
	'##B......#.#',
	'##σ......!..',
	'##.......#..',
	'##########.#',
	'#..........#',
	'#..t....t..#',
	'############',
];
export const CHEST  = '3,2';
export const DOOR   = '4,9';
export const SEAT   = '4,10';  // 爆弾を置く足場（扉の外）
export const INNER  = '4,8';   // 扉の内側＝爆風が届く檻の中のセル
export const EATER  = '4,2';
export const OPENINGS = ['4,11', '5,11'];
export const CAGE_INSIDE = [];
for (let r = 3; r <= 5; r++) for (let c = 2; c <= 8; c++) CAGE_INSIDE.push(`${r},${c}`);
export const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } };
export const BREAKABLE = { [DOOR]: { breakDef: 1 } };
export const BOMB_RADIUS = 2;
// ルピー喰いのさまよい方（shared/enemies.js ROAM_DEFAULT）＝家から縦横 radius の箱の中を歩き、
// 勇者が notice 以内に来ると気づいて追う（game/enemy-ai.js・距離はセルの中心どうし）。
export const ROAM = { notice: 4, lose: 6, radius: 3 };

// 部屋の中だけの歩行（4近傍）。`openDoor` で扉を開けた後を測る。敵のセルは床とみなす。
export function reach(grid, starts, { openDoor = false } = {}) {
	const seen = new Set();
	const q = [];
	const ok = (r, c) => {
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
		const ch = grid[r][c];
		if (ch === TILE.BREAKABLE_WALL) return openDoor;
		if (ENEMY_META[ch]) return true;
		if (ch === TILE.CHEST) return true;   // 宝箱は踏んで開けるタイル
		return !HARD_BLOCKED.has(ch);
	};
	for (const k of starts) {
		const [r, c] = k.split(',').map(Number);
		if (ok(r, c) && !seen.has(k)) { seen.add(k); q.push([r, c]); }
	}
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}

// 爆風のセル（game/projectile.js blastCells と同じ円）
export function blast(k, radius = BOMB_RADIUS) {
	const [r, c] = k.split(',').map(Number);
	const out = [];
	const R = Math.ceil(radius);
	for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
		if (Math.sqrt(dr * dr + dc * dc) > radius) continue;
		const tr = r + dr, tc = c + dc;
		if (tr < 0 || tc < 0 || tr >= ROWS || tc >= COLS) continue;
		out.push(`${tr},${tc}`);
	}
	return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2) の着地セル
	const layerRun = () => bfsLayer(stages, START, { withLadder: false, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: false, openTiles: new Set(['T', '!', 'D', '=']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`盤面は ${ROWS}×${COLS}`, TARGET.length === ROWS && TARGET.every((row) => [...row].length === COLS));
	check(`外周の口の形が書き換え前と同じ`, ringOf(before) === ringOf(TARGET));
	room.tiles = TARGET.map((row) => [...row]);
	room.chestContents = { ...CHEST_CONTENTS };
	room.breakableWalls = { ...BREAKABLE };
	room.floorItems = {};
	room.showConditions = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`宝箱 ${CHEST} の中身＝ルピー×30`, JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
	check(`宝箱は1つだけ・檻の中`, t.flat().filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST) === TILE.CHEST && CAGE_INSIDE.includes(CHEST));
	check(`朽ちた根の扉は ${DOOR} の1枚だけ（breakableWalls も同じ1件）`,
		t.flat().filter((ch) => ch === TILE.BREAKABLE_WALL).length === 1 && at(DOOR) === TILE.BREAKABLE_WALL
		&& JSON.stringify(Object.keys(room.breakableWalls)) === JSON.stringify([DOOR]));
	check(`床の爆弾 '5' が無い（約束②）`, !t.flat().includes(TILE.ITEM_BOMB));
	check(`floorItems・showConditions・signData が空`,
		!Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length && !Object.keys(room.signData ?? {}).length);
	check(`床のルピー（旧 r）が残っていない`, !t.flat().includes(TILE.ITEM_RUPEE));

	// ── ② 歩行：扉を開ける前は宝箱に届かず、開けると届く ─────────────────
	const pre = reach(t, OPENINGS);
	const post = reach(t, OPENINGS, { openDoor: true });
	check(`開ける前：東の口から宝箱 ${CHEST} に届かない`, !pre.has(CHEST));
	check(`開ける前：檻の中に1マスも届かない`, CAGE_INSIDE.every((k) => !pre.has(k)));
	check(`開けた後：宝箱と檻の中に全部届く`, post.has(CHEST) && CAGE_INSIDE.every((k) => post.has(k)));
	const floors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = t[r][c];
		if (ch === TILE.FLOOR || ENEMY_META[ch]) floors.push(`${r},${c}`);
	}
	const stranded = floors.filter((k) => !CAGE_INSIDE.includes(k) && !pre.has(k));
	check(`開ける前：檻の外の床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	{
		// 対照①＝扉を床にすると開けずに届く／対照②＝扉を壁にすると開けても届かない
		//         （潰すのは必ず '#'＝[[blade-control-experiment-needs-tile-wall]]）
		const g = (ch) => t.map((row, r) => row.map((x, c) => (`${r},${c}` === DOOR ? ch : x)));
		check(`対照：扉を床にすると開けずに宝箱へ届く`, reach(g(TILE.FLOOR), OPENINGS).has(CHEST));
		check(`対照：扉を壁にすると開けても宝箱へ届かない`, !reach(g(TILE.WALL), OPENINGS, { openDoor: true }).has(CHEST));
	}
	const nbrs = (k) => { const [r, c] = k.split(',').map(Number); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };
	const outsideSeats = nbrs(DOOR).filter((k) => pre.has(k));
	check(`扉の外の立てる床は ${SEAT} だけ（実測 ${outsideSeats.join(' ')}）`, outsideSeats.join() === SEAT);

	// ── ③ 爆風：扉の外に置くと扉と扉の内側だけに届く ─────────────────────
	{
		const b = blast(SEAT);
		check(`${SEAT} に置いた爆風が扉 ${DOOR} に届く`, b.includes(DOOR));
		const inside = b.filter((k) => CAGE_INSIDE.includes(k));
		check(`${SEAT} の爆風が届く檻の中は ${INNER} の1マスだけ（実測 ${inside.join(' ')}）`, inside.join() === INNER);
		check(`爆弾 20 でルピー喰いが一撃（hp ${ENEMY_META[TILE.RUPEE_EATER].hp}）`, ENEMY_META[TILE.RUPEE_EATER].hp <= 20);
	}

	// ── ④ 剣・矢・ブーメランの直線は檻の中に届かない ─────────────────────
	{
		// 檻の外の立てる床から4方向へ直線を伸ばし、壁・扉・宝箱で止める。檻の中に入る線が無いこと。
		const leaks = [];
		for (const k of pre) {
			const [r0, c0] = k.split(',').map(Number);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				let r = r0 + dr, c = c0 + dc;
				while (r >= 0 && c >= 0 && r < ROWS && c < COLS) {
					const ch = t[r][c];
					if (ch === TILE.WALL || ch === TILE.BREAKABLE_WALL || ch === TILE.TREE) break;
					if (CAGE_INSIDE.includes(`${r},${c}`)) { leaks.push(`${k}→${r},${c}`); break; }
					r += dr; c += dc;
				}
			}
		}
		check(`檻の外から檻の中への直線が無い（実測 ${leaks.join(' ') || 'なし'}）`, leaks.length === 0);
	}

	// ── ⑤ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵はルピー喰い σ ${EATER} の1体だけ（実測 ${mobs.join(' ')}）`, mobs.join() === `${TILE.RUPEE_EATER}@${EATER}`);
		check(`ルピー喰いは檻の中`, CAGE_INSIDE.includes(EATER));
		// 気づかれない限り扉へ来ない＝さまよう箱の檻の中のどのセルも、扉の外 (4,10) から notice より遠い
		const [er, ec] = EATER.split(',').map(Number);
		const [sr, sc] = SEAT.split(',').map(Number);
		const box = CAGE_INSIDE.filter((k) => { const [r, c] = k.split(',').map(Number); return Math.abs(r - er) <= ROAM.radius && Math.abs(c - ec) <= ROAM.radius; });
		const near = box.filter((k) => { const [r, c] = k.split(',').map(Number); return Math.hypot(r - sr, c - sc) <= ROAM.notice; });
		check(`さまよう箱（${box.length} マス）のどこからも扉の外 ${SEAT} は notice ${ROAM.notice} より遠い（近いセル ${near.join(' ') || 'なし'}）`, near.length === 0);
		check(`扉の内側 ${INNER} はさまよう箱の外（自分からは扉に寄らない）`, !box.includes(INNER));
		// 起こせる＝檻の外の歩ける床のどこかが、さまよう箱の notice 以内
		const wake = [...pre].filter((k) => { const [r, c] = k.split(',').map(Number); return box.some((b) => { const [br, bc] = b.split(',').map(Number); return Math.hypot(r - br, c - bc) <= ROAM.notice; }); });
		const wakeRows = [...new Set(wake.map((k) => k.split(',')[0]))].sort();
		check(`北と南の回廊から起こせる（起こせる行 ${wakeRows.join(' ')}）`, wakeRows.includes('1') && wakeRows.includes('7'));
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（σ 1体＝22.5）が D6 の看板部屋 2,3（${sig}）より軽い`, threat === 22.5 && threat < sig);
	}

	// ── ⑥ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
			same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(open.reachedRooms, baseOpen.reachedRooms));
		check(`${ROOM} に到達できる`, closed.reachedRooms.has(ROOM));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「ルピー喰いの檻」に作り替える（キュー95 の1室目）`);
	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${rowStr(row)}`);
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

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
