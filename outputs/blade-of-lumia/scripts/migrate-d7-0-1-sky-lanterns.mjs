// dungeon_7 `0,1`（西の輪の北＝`1,1` の西）：D6 の写しの部屋を「空の灯籠継ぎ」に作り替える
// （2026-10-04 / PLAN 実行キュー 39 の第3陣 1室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー39 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #....B.....#     ← 宝箱 B(2,5)＝ルピー×5（素で開く）
//      3〜8 #..........#  （行4-5 は東の口・行9 の列5-6 は南の口）
//      9 #####..#####
//   `0,1`↔`0,2` は `1,1` と `1,2` をつなぐ迂回路（西の輪）。本筋ではない寄り道。
//
// ■ 新しい `0,1`＝空の灯籠継ぎ（ロウソク＋ブーメラン＋はしご＝火を投げる「立ち位置」を穴の先に置く）
//      0 ############
//      1 #%%%%%%%%%%#
//      2 #%%%%B%%%%%#     ← 宝箱 B(2,5)＝ルピー×30（torchesLit で出る）
//      3 #H%H%.%%%%%#     ← 灯③(3,1)・灯④(3,3)・北の小島 (3,5)
//      4 #%%%%x......     ← 穴 (4,5)＝北の小島へのはしご
//      5 #H%%H.......     ← 灯②(5,1)・灯①(5,4)＝唯一ロウソクが届く（本土の西端 (5,5) の隣）
//      6 #%%%%..%%%%#
//      7 #...x..%%%%#     ← 西の小島 (7,1)〜(7,3)・穴 (7,4)
//      8 #%%%%..%%%%#
//      9 #####..#####
//   ・本土は東の口から南の口へ折れる L 字の通路（行4-5／列5-6）＝灯を点けなくても通り抜けられる。
//     西半分と北は空 '%' に崩れ落ち、かがり火 H が4つ空に浮く（灯①だけ本土に接する）。
//   ・火は「同じ行・列に並んだ灯どうし」でしか渡らない（ブーメランは往路・復路とも通過した灯で炎を
//     拾い／点ける＝`game/projectile.js` collectAlongBoomerang）。投げる人もその行・列に立つ必要がある。
//     灯②→灯③は列1、灯③→灯④は行3 で並ぶ＝列1 に立てるのは西の小島 (7,1)、行3 に立てるのは
//     北の小島 (3,5) だけ。どちらの小島も本土から穴1枚を隔てる＝はしごで渡る。
//   ・解き筋（最短 19 手＝南の口から）：本土の西端 (5,5) で ロウソク → 灯① ／そのまま西へ投げる＝灯①で炎を拾い灯②を
//     点ける → 穴 (7,4) を渡って西の小島の端 (7,1) から北へ投げる＝灯②で拾い灯③を点ける → 本土へ戻り
//     穴 (4,5) を渡って北の小島 (3,5) から西へ投げる＝往路は灯④を素通りし、灯③で拾って復路で灯④を点ける
//     → 全点灯で北の小島の上 (2,5) に宝箱が現れる。
//   ・おとり＝西の小島の (7,3) から北へ投げると列3 の灯④に届くが、その列に火元が無いので何も起きない。
//   ・銀・星のブーメランは壁まで届く＝手数は同じ（届きでなく「並び」で縛っている∴はしごは必ず要る）。
//   ・敵は置かない（謎解きの部屋）。木・茂み・看板も置かない。`initLitTorches` も置かない。
//
// ■ 例外（後から手に入る道具で楽になる手）
//   ・翼の羽衣は D7 では使えない（`shared/progression.js` toolsUsableIn）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／口（東・南）／敵・植生・看板が無い／宝箱の中身と出現条件
//   ・灯①だけがロウソクで点けられる（ほかの灯の四方は空か壁）
//   ・状態空間（位置×点いた灯）で全点灯に届く＝どの段のブーメランでも 19 手
//   ・対照＝はしご無し／ブーメラン無し／ロウソク無し→届かない・どちらの穴を空にしても届かない
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-0-1-sky-lanterns.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-0-1-sky-lanterns.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { MOVE_STEP } from '../game/constants.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '0,1';
const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#%%%%%%%%%%#',
	'#%%%%B%%%%%#',
	'#H%H%.%%%%%#',
	'#%%%%x......',
	'#H%%H.......',
	'#%%%%..%%%%#',
	'#...x..%%%%#',
	'#%%%%..%%%%#',
	'#####..#####',
];
export const EXITS = ['4,11', '5,11', '9,5', '9,6'];   // 東・南の口＝書き換え前と同じ
export const TORCHES = ['5,4', '5,1', '3,1', '3,3'];   // 灯①〜④（点く順）
export const PITS = ['7,4', '4,5'];
export const CHEST_CELL = '2,5';
export const CHEST_CONTENTS  = { [CHEST_CELL]: { type: 'rupee', value: 30, name: 'ルピー×30' } };
export const SHOW_CONDITIONS = { [CHEST_CELL]: { trigger: 'torchesLit' } };
export const SHORTEST = 19;

// ブーメランの実効の届き（セル数）＝`migrate-d7-3-1-compass-rose.mjs` reachOf と同じ式
// （`game/projectile.js` の往路をなぞる・一周目の速度）。↑← と →↓ で 1 セル違う。
function reachOf(tier) {
	const step = tier.speed * MOVE_STEP;
	let p = 0.5;
	while (p < tier.maxRange) p += step;
	const travel = p + step;
	return { neg: Math.ceil(travel - 0.5), pos: Math.floor(travel + 0.5) };
}
export const TIERS = BOOMERANG_TIERS.map((t) => [t.name, reachOf(t)]);

// ── 状態空間（位置 × 点いた灯）の最短手順 ───────────────────────────────
// 規則＝歩けるのは床と宝箱（封印中の宝箱にも乗れる）。はしごは「陸→穴1枚→陸」を同じ軸で一気に渡る
// （穴の上では止まらない・道具を使わない）。ロウソク＝前方1マスの未点灯の灯。ブーメラン＝4方向へ
// 届きのセル数だけ飛び、壁で止まり（止まったセルも通過判定）、同じ道を戻る。点いた灯を通ると炎を
// 拾い、炎を持って消えた灯を通ると点ける＝往路・復路とも（collectAlongBoomerang）。
const DIRS = [[-1, 0, '上'], [1, 0, '下'], [0, -1, '左'], [0, 1, '右']];
export function solveLanterns(t, { reach = TIERS[0][1], ladder = true, boomerang = true, candle = true } = {}) {
	const torches = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === TILE.TORCH) torches.push(`${r},${c}`);
	const full = (1 << torches.length) - 1;
	const land = (r, c) => t[r]?.[c] === TILE.FLOOR || t[r]?.[c] === TILE.CHEST;
	const ti = (r, c) => torches.indexOf(`${r},${c}`);
	const starts = EXITS.map((k) => k.split(',').map(Number)).filter(([r, c]) => land(r, c));
	const seen = new Map();
	const q = [];
	for (const [r, c] of starts) { const k = `${r},${c}|0`; seen.set(k, null); q.push([r, c, 0]); }
	while (q.length) {
		const [r, c, m] = q.shift();
		const here = `${r},${c}|${m}`;
		if (m === full && torches.length) {
			const steps = [];
			for (let k = here; seen.get(k); k = seen.get(k)[0]) steps.unshift(seen.get(k)[1]);
			return steps;
		}
		const push = (nr, nc, nm, act) => { const k = `${nr},${nc}|${nm}`; if (!seen.has(k)) { seen.set(k, [here, act]); q.push([nr, nc, nm]); } };
		for (const [dr, dc, name] of DIRS) {
			if (land(r + dr, c + dc)) push(r + dr, c + dc, m, `歩く ${r + dr},${c + dc}`);
			if (ladder && t[r + dr]?.[c + dc] === TILE.PIT && land(r + 2 * dr, c + 2 * dc)) push(r + 2 * dr, c + 2 * dc, m, `はしご ${r + dr},${c + dc}`);
			if (candle) { const i = ti(r + dr, c + dc); if (i >= 0 && !(m & (1 << i))) push(r, c, m | (1 << i), `ロウソク ${r},${c}→${name}`); }
			if (boomerang) {
				const n = (dr < 0 || dc < 0) ? reach.neg : reach.pos;
				const path = [];
				for (let i = 1; i <= n; i++) {
					const rr = r + dr * i, cc = c + dc * i;
					if (t[rr]?.[cc] === undefined) break;
					path.push([rr, cc]);
					if (t[rr][cc] === TILE.WALL || t[rr][cc] === TILE.BREAKABLE_WALL) break;
				}
				let flaming = false, nm = m;
				for (const [a, b] of [...path, ...[...path].reverse()]) {
					const i = ti(a, b);
					if (i < 0) continue;
					if (nm & (1 << i)) flaming = true; else if (flaming) nm |= (1 << i);
				}
				if (nm !== m) push(r, c, nm, `ブーメラン ${r},${c}→${name}`);
			}
		}
	}
	return null;
}

// ── 読み込み ─────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();

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

	const before = room.tiles.map(rowStr);
	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	// tiles は「文字の配列の配列」で持つ（[[field-tiles-are-char-arrays]]）。
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => row.split(''));
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
		room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
		log.push(`  ${ROOM}: 宝箱 ${CHEST_CELL}＝ルピー×30（旧＝同じセルのルピー×5・素で開く）`);
	}
	if (JSON.stringify(room.showConditions ?? {}) !== JSON.stringify(SHOW_CONDITIONS)) {
		room.showConditions = JSON.parse(JSON.stringify(SHOW_CONDITIONS));
		log.push(`  ${ROOM}: showConditions を ${CHEST_CELL}=torchesLit にした`);
	}
	room.links ??= [];
	room.bgTiles ??= {};
	room.signData ??= {};
	room.npcData ??= {};
	room.floorItems ??= {};
	room.enemyDirs ??= {};
	room.breakableWalls ??= {};

	// ── 検証の道具 ─────────────────────────────────────────────────────
	const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
	const P = (k) => k.split(',').map(Number);
	const at = (t, k) => { const [r, c] = P(k); return t[r]?.[c]; };
	const cellsOf = (t, pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
		return out;
	};
	const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
	const nextTo = (k) => { const [r, c] = P(k); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };

	// ── ① 盤面とデータ ────────────────────────────────────────────────
	const t = grid();
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) { edge.push(`0,${c}`, `9,${c}`); }
		for (let r = 1; r < ROWS - 1; r++) { edge.push(`${r},0`, `${r},11`); }
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
		check(`画面の縁で開いているのは東・南の口だけ（実測 ${open.join(' ')}）`, same(open, EXITS));
	}
	check(`敵が居ない（謎解きの部屋）`, cellsOf(t, (ch) => !!ENEMY_META[ch]).length === 0);
	check(`植生・看板・スイッチ・石・壊せる壁が無い`,
		cellsOf(t, (ch) => [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH, TILE.STONE, TILE.BREAKABLE_WALL].includes(ch)).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`かがり火は ${TORCHES.join(' ')} の4つ`, same(cellsOf(t, (ch) => ch === TILE.TORCH), TORCHES));
	check(`穴は ${PITS.join(' ')} の2つ`, same(cellsOf(t, (ch) => ch === TILE.PIT), PITS));
	check(`宝箱 B は ${CHEST_CELL} の1枚・中身＝ルピー×30・出現＝torchesLit`,
		same(cellsOf(t, (ch) => ch === TILE.CHEST), [CHEST_CELL])
		&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS)
		&& JSON.stringify(room.showConditions) === JSON.stringify(SHOW_CONDITIONS));
	check(`links・breakableWalls・floorItems・bgTiles が空・initLitTorches を持たない`,
		room.links.length === 0 && Object.keys(room.breakableWalls).length === 0
		&& Object.keys(room.floorItems).length === 0 && Object.keys(room.bgTiles).length === 0
		&& !(room.initLitTorches?.length));

	// ── ② ロウソクが届く灯は灯①だけ ─────────────────────────────────────
	{
		const candleable = TORCHES.filter((k) => nextTo(k).some((n) => [TILE.FLOOR, TILE.CHEST].includes(at(t, n))));
		check(`ロウソクで点けられる（床に接する）灯は ${TORCHES[0]} だけ（実測 ${candleable.join(' ')}）`, same(candleable, [TORCHES[0]]));
	}

	// ── ③ 状態空間＝全点灯に届く・道具とはしごが要る ─────────────────────────
	for (const [name, reach] of TIERS) {
		const sol = solveLanterns(t, { reach });
		check(`${name}（届き ↑←${reach.neg}／→↓${reach.pos}）で全点灯（${sol ? sol.length : '解なし'} 手＝想定 ${SHORTEST}）`, sol?.length === SHORTEST);
		check(`${name}：はしご無しでは全点灯しない（並びの立ち位置が穴の先にしか無い）`, solveLanterns(t, { reach, ladder: false }) === null);
	}
	{
		const sol = solveLanterns(t);
		console.log(`\n## 解き筋（木のブーメラン）\n  ${sol?.join(' → ')}`);
		check(`対照：ブーメラン無しでは全点灯しない`, solveLanterns(t, { boomerang: false }) === null);
		check(`対照：ロウソク無しでは全点灯しない`, solveLanterns(t, { candle: false }) === null);
		for (const pit of PITS) {
			const g = grid(); const [r, c] = P(pit); g[r][c] = TILE.SKY;
			check(`対照：穴 ${pit} を空にすると全点灯しない（どちらの小島も要る）`, solveLanterns(g) === null);
		}
	}

	// ── ④ 層の到達性は不変 ─────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
			same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(open.reachedRooms, baseOpen.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ───────────────────────────────────────────────────────────
	console.log(`\n# ${LAYER} ${ROOM}：西の輪の北を「空の灯籠継ぎ」に作り替える（キュー39 第3陣）`);
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

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
