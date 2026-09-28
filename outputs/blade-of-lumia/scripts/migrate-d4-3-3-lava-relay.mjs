// dungeon_4 `3,3`：飾りの「石＋ボタンの門」部屋を「溶岩越しの灯火」（ロウソク＋ブーメランの
// 火の受け渡し）に作り替える（2026-09-28 / PLAN 実行キュー 34 の3室目・設計は Opus、主題は
// ユーザー確定＝案 A）
//
// ■ 何が壊れていたか（キュー34 の指摘＋着手前の実測）
//      0 #####..#####     ← 北の口
//      1 #........T.#     ← 門 T(1,9)
//      2 #........B.#     ← 宝箱 B(2,9)＝ルピー×10
//      3 #..*...S...#     ← 石 *(3,3)・ボタン S(3,7)
//      4 ............     ← 西と東の口
//      7 #i.........#     ← 看板「押し石の 覚え書き」
//   宝箱 (2,9) は (2,8)(2,10)(3,9) から素で歩いて開けられた＝門は宝箱の「上」に立っているだけで
//   何も守っていない飾り。看板の文言（石を板へ送れ）も飾りの仕掛けを教えていただけ。
//
// ■ 新しい `3,3`＝溶岩越しの灯火（通り抜けの部屋＋寄り道の報酬）
//      0 #####..#####
//      1 #..........#
//      4 ............     ← 西と東の口（通り抜けの道は北半分＝旧と同じ3口）
//      6 #.lll.lllll#     ← 突堤 (6,5)＝手前の火へロウソクが届く唯一の足場
//      7 #.lHlH#llll#     ← 西の岸 (7,1)・奥の火 H(7,3)・手前の火 H(7,5)・柱 (7,6)
//      8 #Blllllllll#     ← 宝箱 B(8,1)＝ルピー×20（torchesLit で出る）
//      9 ############
//   南半分を溶岩の池 'l'（tiles 層）にし、かがり火2枚を池の中に置く。
//   ・奥の H(7,3) は四方が溶岩＝隣に立てる床が無い∴ロウソク（前方1マス・`game/game.js`
//     playCandle）では点けられない。射線に乗る床は西の岸 (7,1) だけ（row7 の右向き）。
//   ・手前の H(7,5) は北の突堤 (6,5) からだけロウソクが届く。
//   ・(7,1) から右へブーメランを投げると、往路では奥の H を**火を持たずに**素通りし、手前の
//     点いた H で炎を拾い（`proj.flaming`）、柱で折り返した**復路で奥の H に点火する**
//     （`game/projectile.js` collectAlongBoomerang は往路・復路の両方の毎サブステップで走る）。
//     D2 `0,1` の「投げた先へ炎を運ぶ」の逆向き＝火を取りに行って持ち帰る。
//   ∴解は「突堤でロウソク → 岸から右へブーメラン」の2手。ロウソクだけ／ブーメランだけでは
//     点かない。点ける座は木・銀・星のどのブーメランでも (7,1)→右 の1つだけ（下の ③ が実測）。
//   ・全点灯（`torchesLit`）で宝箱 B(8,1) が出る。(7,1) の真下＝投げた岸から1歩で開けられる
//     （宝箱は踏んで開けるタイル。封印中に踏んでも「何かが封印されているようだ…」で開かない）。
//   ・柱 (7,6) は謎解きの必須要素ではない（溶岩にしても解と座は同じ＝叩き台で実測）。
//     手前の火のすぐ先でブーメランを折り返させ、銀・星でも木と同じ「拾ってすぐ戻る」
//     動きに揃える区切り。
//   ・D4 の道具はブーメラン・弓・ロウソク（`shared/progression.js` toolsUsableIn）。D4 の
//     かがり火は `1,1` の3枚（ロウソクで歩いて点ける部屋）だけだった＝ブーメランで炎を運ぶ
//     のはこの部屋が初出。直前の D2 `0,2`（ブーメランで拾う）・D3 `3,0`（石運び）とも重ならない。
//   ・報酬＝ルピー×20（旧 ×10 から上げた＝道具2つの合わせ技の対価）。
//
// ■ 例外（後から手に入る道具で楽になる手）
//   ・翼の羽衣（最終盤に祭壇で授かる）は溶岩の上を飛べる（`game/passable.js` FLYABLE_OVER）＝
//     飛んで奥の H の隣へ行けばロウソクで直接点けられる。羽衣は全ダンジョン後の道具∴D4 を
//     解く一周目の約束（ロウソク＋ブーメラン）は崩れない（D7 `3,0` の「二周目は道具が強く
//     なる」と同じ扱い）。
//   ・はしごは溶岩を渡れない（`LADDER_OVER` に溶岩が無い）＝抜け道にならない。
//
// ■ 撤去したもの
//   旧石 *(3,3)・旧ボタン S(3,7)・旧門 T(1,9)・旧宝箱 B(2,9)・旧 links（3,7→1,9）・
//   看板 i(7,1) と signData。看板は置かない。`initLitTorches` は置かない（火元はロウソク）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／宝の中身／showConditions／links・signData が空／石・ボタン・門・看板が残っていない
//   ・3つの口（北・西・東）が互いに歩いてつながる／外周の口の形が書き換え前と同じ
//   ・奥の H の隣に立てる床が0マス・手前の H の隣は突堤 (6,5) の1マスだけ
//   ・火の受け渡しの実測（collectAlongBoomerang と同じ規則・実効の届き）で：解がある／
//     ロウソクだけ・ブーメランだけでは解けない／奥を点ける座は (7,1)→右 だけ／
//     対照＝(7,2) を床にするとロウソクだけで解ける・手前の H を壁にすると解けない
//   ・ソルバー（hasCandle）で全点灯に届く／ロウソク無しでは届かない／入って詰む状態が0
//   ・はしごで架けられるセルが1枚も無い（溶岩ははしごで渡れない）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d4-3-3-lava-relay.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d4-3-3-lava-relay.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { MOVE_STEP } from '../game/constants.js';
import { bfsLayer, HARD_BLOCKED, LADDER_OVER, isLadderBridgeCell } from './lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_4';
const ROOM  = '3,3';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
const TARGET = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'............',
	'............',
	'#.lll.lllll#',
	'#.lHlH#llll#',
	'#Blllllllll#',
	'############',
];
const FAR    = '7,3';   // 奥の火＝四方が溶岩
const NEAR   = '7,5';   // 手前の火＝突堤からロウソク
const PIER   = '6,5';   // 突堤
const SHORE  = '7,1';   // 西の岸＝ブーメランの座
const CHEST  = '8,1';
const OPENINGS = { 北: ['0,5', '0,6'], 西: ['4,0', '5,0'], 東: ['4,11', '5,11'] };
const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } };
const SHOW_CONDITIONS = { [CHEST]: { trigger: 'torchesLit' } };

// ブーメランの実効の届き（セル数）＝`migrate-d7-3-0-boomerang-isles.mjs` reachOf と同じ式
// （`game/projectile.js` の往路をなぞる・一周目の速度）。↑← と →↓ で 1 セル違う。
function reachOf(tier) {
	const step = tier.speed * MOVE_STEP;
	let p = 0.5;
	while (p < tier.maxRange) p += step;
	const travel = p + step;
	return { neg: Math.ceil(travel - 0.5), pos: Math.floor(travel + 0.5) };
}
const TIERS = BOOMERANG_TIERS.map((t) => [t.name, reachOf(t)]);

// ── 読み込み ─────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`${LAYER} が無い`);
const room = stages[ROOM];
if (!room) die(`${LAYER} ${ROOM} が無い`);

const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2) の着地セル
const layerRun = () => bfsLayer(stages, START, { withLadder: true, openTiles: null });
const layerRunOpen = () => bfsLayer(stages, START, { withLadder: true, openTiles: new Set(['T', '!', 'D', '=']) });
const baseClosed = layerRun();
const baseOpen = layerRunOpen();

const before = room.tiles.map(rowStr);
const log = [];
const verify = [];
const check = (msg, cond) => verify.push([!!cond, msg]);

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');

// ── 書き換え ─────────────────────────────────────────────────────────
// tiles は「文字の配列の配列」で持つ（[[field-tiles-are-char-arrays]]）。
if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
	room.tiles = TARGET.map((row) => row.split(''));
	log.push(`  ${ROOM}: 盤面を差し替えた`);
}
if ((room.links ?? []).length) {
	log.push(`  ${ROOM}: links（${room.links.map((l) => `${l.switchId}→${l.gateId}`).join(' / ')}）を外した`);
	room.links = [];
}
if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
	log.push(`  ${ROOM}: 宝箱を ${Object.entries(room.chestContents ?? {}).map(([k, v]) => `${k}=${v.name}`).join(' ') || 'なし'} → ${CHEST}=ルピー×20 にした`);
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
}
if (JSON.stringify(room.showConditions ?? {}) !== JSON.stringify(SHOW_CONDITIONS)) {
	log.push(`  ${ROOM}: showConditions を ${CHEST}=torchesLit にした`);
	room.showConditions = JSON.parse(JSON.stringify(SHOW_CONDITIONS));
}
if (Object.keys(room.signData ?? {}).length) {
	log.push(`  ${ROOM}: 看板データ（${Object.keys(room.signData).join(' ')}）を外した`);
	room.signData = {};
}
room.signData ??= {};
room.bgTiles ??= {};
room.breakableWalls ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const at = (t, k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
const nbrs = (k) => {
	const [r, c] = k.split(',').map(Number);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
		.filter(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS).map(([rr, cc]) => `${rr},${cc}`);
};
// 3つの口から歩ける床。壁・溶岩（HARD_BLOCKED）・かがり火は踏めない。宝箱は踏んで開ける
// タイル（TILE_META passable）＝立てる床に数える（封印中でも乗れる＝そこからの投げも測る）。
const standOk = (ch) => ch !== undefined && !HARD_BLOCKED.has(ch) && ch !== TILE.TORCH;
function walkable(t, from) {
	const seen = new Set(), q = [];
	for (const k of from) if (standOk(at(t, k))) { seen.add(k); q.push(k); }
	while (q.length) {
		const k = q.shift();
		for (const n of nbrs(k)) {
			if (seen.has(n) || !standOk(at(t, n))) continue;
			seen.add(n); q.push(n);
		}
	}
	return seen;
}
const allOpenings = Object.values(OPENINGS).flat();

// 火の受け渡しの実測＝`collectAlongBoomerang` と同じ規則。投擲物は '#' と未破壊 '!' で止まり
// （止まったセルでも通過判定は走る）、同じ道を戻る。点いた H を通ると炎を拾い、炎を持って
// 消えた H を通ると点ける＝往路・復路とも。状態＝点いたかがり火の集合で総当たり。
function throwFrom(t, k, dir, reach, lit) {
	const [r, c] = k.split(',').map(Number);
	const [dr, dc] = { 上: [-1, 0], 下: [1, 0], 左: [0, -1], 右: [0, 1] }[dir];
	const n = (dir === '上' || dir === '左') ? reach.neg : reach.pos;
	const path = [];
	for (let i = 1; i <= n; i++) {
		const kk = `${r + dr * i},${c + dc * i}`;
		const ch = at(t, kk);
		if (ch === undefined) break;
		path.push(kk);
		if (ch === TILE.WALL || ch === TILE.BREAKABLE_WALL) break;
	}
	const out = new Set(lit);
	let flaming = false;
	for (const kk of [...path, ...[...path].reverse()]) {
		if (at(t, kk) !== TILE.TORCH) continue;
		if (out.has(kk)) flaming = true;
		else if (flaming) out.add(kk);
	}
	return out;
}
function relay(t, reach, { candle = true, boomerang = true } = {}) {
	const torches = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === TILE.TORCH) torches.push(`${r},${c}`);
	const stand = [...walkable(t, allOpenings)];
	const key = (s) => [...s].sort().join('|');
	const seen = new Map([[key(new Set()), null]]);
	const q = [new Set()];
	while (q.length) {
		const s = q.shift();
		if (torches.length && torches.every((x) => s.has(x))) {
			const steps = []; let k = key(s);
			while (seen.get(k)) { const [pk, mv] = seen.get(k); steps.unshift(mv); k = pk; }
			return steps;
		}
		const moves = [];
		for (const k of stand) {
			if (candle) for (const n of nbrs(k)) {
				if (at(t, n) === TILE.TORCH && !s.has(n)) moves.push([new Set([...s, n]), `ロウソク ${k}→${n}`]);
			}
			if (boomerang) for (const d of ['上', '下', '左', '右']) {
				const n = throwFrom(t, k, d, reach, s);
				if (n.size > s.size) moves.push([n, `ブーメラン ${k}→${d}`]);
			}
		}
		for (const [n, mv] of moves) {
			const k = key(n);
			if (!seen.has(k)) { seen.set(k, [key(s), mv]); q.push(n); }
		}
	}
	return null;
}
// 手前が点いた状態で、奥の H を点けられる投げを全部並べる
function farSeats(t, reach) {
	const out = [];
	for (const k of walkable(t, allOpenings)) for (const d of ['上', '下', '左', '右']) {
		if (throwFrom(t, k, d, reach, new Set([NEAR])).has(FAR)) out.push(`${k}→${d}`);
	}
	return out.sort();
}

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列`, room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
check(`${ROOM} の宝箱＝${CHEST} のルピー×20 だけ`, JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
check(`${ROOM} の showConditions＝${CHEST} が torchesLit`, JSON.stringify(room.showConditions) === JSON.stringify(SHOW_CONDITIONS));
check(`${ROOM} の links が空`, (room.links ?? []).length === 0);
check(`${ROOM} の看板データが空`, Object.keys(room.signData).length === 0);
check(`${ROOM} に initLitTorches が無い（火元はロウソク）`, !(room.initLitTorches ?? []).length);
check(`${ROOM} の bgTiles が空（溶岩は tiles 層）`, Object.keys(room.bgTiles).length === 0);
for (const ch of [TILE.STONE, TILE.BUTTON, TILE.GATE, TILE.SWITCH, TILE.SIGN]) {
	check(`${ROOM} に '${ch}' が残っていない`, !t.some((row) => row.includes(ch)));
}
{
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	check(`かがり火は ${FAR}・${NEAR} の2枚・宝箱は ${CHEST} の1枚`,
		count(TILE.TORCH) === 2 && at(t, FAR) === TILE.TORCH && at(t, NEAR) === TILE.TORCH
		&& count(TILE.CHEST) === 1 && at(t, CHEST) === TILE.CHEST);
	check(`溶岩 'l' は TILE.LAVA`, TILE.LAVA === 'l');
}
check(`外周の口の形が書き換え前と同じ（北・西・東の3口）`, ringOf(room.tiles.map(rowStr)) === ringOf(before));

// ── ② 歩ける床 ──────────────────────────────────────────────────────
{
	for (const [name, cells] of Object.entries(OPENINGS)) {
		const w = walkable(t, cells);
		check(`${name}の口から他の2口へ歩ける`, allOpenings.every((k) => w.has(k)));
	}
	const w = walkable(t, allOpenings);
	check(`口から突堤 ${PIER}・西の岸 ${SHORE} まで歩ける`, w.has(PIER) && w.has(SHORE));
	const farNb = nbrs(FAR).filter((k) => w.has(k));
	check(`奥の火 ${FAR} の隣に立てる床が0マス（実測 ${farNb.join(' ') || 'なし'}）`, farNb.length === 0);
	const nearNb = nbrs(NEAR).filter((k) => w.has(k));
	check(`手前の火 ${NEAR} の隣に立てる床は突堤 ${PIER} だけ（実測 ${nearNb.join(' ') || 'なし'}）`,
		nearNb.length === 1 && nearNb[0] === PIER);
	const chestNb = nbrs(CHEST).filter((k) => w.has(k));
	check(`宝箱 ${CHEST} へは西の岸 ${SHORE} からだけ踏み込める（実測 ${chestNb.join(' ') || 'なし'}）`,
		w.has(CHEST) && chestNb.length === 1 && chestNb[0] === SHORE);
}

// ── ③ 火の受け渡しの実測 ────────────────────────────────────────────
for (const [name, reach] of TIERS) {
	const sol = relay(t, reach);
	check(`${name}（届き ↑←${reach.neg}／→↓${reach.pos}）＋ロウソクで全点灯：${sol ? sol.join(' → ') : '解なし'}`,
		sol && sol.length === 2 && sol[0] === `ロウソク ${PIER}→${NEAR}` && sol[1] === `ブーメラン ${SHORE}→右`);
	check(`${name}だけ（ロウソク無し）では点かない`, relay(t, reach, { candle: false }) === null);
	const seats = farSeats(t, reach);
	check(`${name}で奥の火を点ける座は ${SHORE}→右 だけ（実測 ${seats.join(' ') || 'なし'}）`,
		seats.length === 1 && seats[0] === `${SHORE}→右`);
}
check(`ロウソクだけ（ブーメラン無し）では点かない`, relay(t, TIERS[0][1], { boomerang: false }) === null);
{
	// 対照①＝奥の火の西 (7,2) を床にするとロウソクだけで解ける（溶岩の隔離が効いている証明）
	const open = grid(); open[7][2] = TILE.FLOOR;
	check(`対照：(7,2) を床にするとロウソクだけで全点灯できる`, relay(open, TIERS[0][1], { boomerang: false }) !== null);
	// 対照②＝手前の火を壁にすると（奥だけ残る）どの道具でも点かない＝火の受け渡しが要
	//         （潰すのは必ず '#'＝[[blade-control-experiment-needs-tile-wall]]）
	const noNear = grid(); noNear[7][5] = TILE.WALL;
	check(`対照：手前の火 ${NEAR} を壁にするとロウソク＋ブーメランでも点かない`, relay(noNear, TIERS[0][1]) === null);
	// 対照③＝往路だけで測ると解けない＝復路で点けていることの証明
	const outOnly = (tt, k, dir, reach, lit) => {
		const [r, c] = k.split(',').map(Number);
		const [dr, dc] = { 上: [-1, 0], 下: [1, 0], 左: [0, -1], 右: [0, 1] }[dir];
		const n = (dir === '上' || dir === '左') ? reach.neg : reach.pos;
		let flaming = false;
		for (let i = 1; i <= n; i++) {
			const kk = `${r + dr * i},${c + dc * i}`;
			const ch = at(tt, kk);
			if (ch === undefined) break;
			if (ch === TILE.TORCH) { if (lit.has(kk)) flaming = true; else if (flaming) return true; }
			if (ch === TILE.WALL) break;
		}
		return false;
	};
	check(`対照：往路だけで測ると ${SHORE}→右 は奥の火を点けない（点くのは復路）`,
		!outOnly(t, SHORE, '右', TIERS[0][1], new Set([NEAR])));
}

// ── ④ ソルバー（状態空間）＝全点灯に届く・詰まない ─────────────────────
{
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const solve = (opts) => {
		const S = makeSolver(t, bg, [], {}, new Set(), { hasLadder: true, ...opts });
		const starts = allOpenings.map((cell) => {
			const [r, c] = cell.split(',').map(Number);
			return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
		});
		const fullLit = (1 << S.torchCells.length) - 1;
		return measureMetrics(S, starts, (st) => Number(st.split('|')[4]) === fullLit, () => 0,
			{ guardMax: 2_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
	};
	const on = solve({ hasCandle: true });
	check(`ソルバー（ロウソク＋ブーメラン）で全点灯に届く（L=${on.L}）`, on.L !== null);
	check(`入って詰む状態が無い（実測 noEscape=${on.noEscape}）`, on.noEscape === 0);
	check(`対照：ソルバーでもロウソク無しでは全点灯に届かない`, solve({ hasCandle: false }).L === null);
}

// ── ⑤ はしごで溶岩を渡れない ────────────────────────────────────────
{
	check(`はしごで渡れるタイル（${[...LADDER_OVER].join(' ')}）に溶岩が入っていない`, !LADDER_OVER.has(TILE.LAVA));
	const bridges = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		if (LADDER_OVER.has(t[r][c]) && isLadderBridgeCell(t, ROWS, COLS, r, c, room.bgTiles)) bridges.push(`${r},${c}`);
	}
	check(`はしごで架けられるセルが1枚も無い（実測 ${bridges.join(' ') || 'なし'}）`, bridges.length === 0);
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
console.log(`# ${LAYER} ${ROOM}：飾りの石＋ボタンの門を「溶岩越しの灯火」に作り替える（キュー34）`);
console.log(log.join('\n') || '  （変更なし）');

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
