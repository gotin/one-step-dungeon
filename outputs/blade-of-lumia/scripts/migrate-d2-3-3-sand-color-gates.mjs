// dungeon_2 `3,3`（地図の庭への唯一の通り道）：床の真ん中に回復薬が1つあるだけの部屋を「二色の砂門」に作り替える
// （2026-10-11 / PLAN 実行キュー 41 の第3陣 5室目＝最後の1室・設計は Opus・主題＝ユーザー選択「二色の砂門」）
//
// ■ 何が薄かったか（キュー41 の着手時の実測）
//      0 #####..#####     ← 北の口（地図の部屋 `3,2` の南東の庭）
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 ...........#     ← 西の口（`2,3` 流砂の大穴）
//      5 .....7.....#     ← 床の回復薬
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 ############
//   四角い広間の真ん中に回復薬が1つだけ（D1 `3,3` の写しから宝箱＝ハートの器を抜いた形）。敵なし・下地なし。
//   `3,2` を「地下水路の向こうの地図」にしたことで、この部屋は地図の庭へ上がる唯一の道になった。
//
// ■ 新しい `3,3`＝二色の砂門（赤と青の門は共には開かない＝紋を打つたびに色が移る）
//      0 #####..#####     ← 北の口（地図の庭へ）
//      1 #..........#     ┐ 北の廊下（北の口・赤の紋 (3,6)）
//      2 #..........#     ┘
//      3 #((###[##))#     ← 北西の赤門・北東の青門・祠の北面に赤の紋
//      4 ...†####]..#     ← 西の口＝西の門番の間（祠の西面に石碑 (4,3)・青の紋 (5,3)）／東の門番の間（青の紋 (4,8)）
//      5 ...]#####..#
//      6 #))##[###((#     ← 南西の青門・南東の赤門・祠の南面に赤の紋
//      7 #..........#     ┐ 南の廊下
//      8 #.........7#     ┘ 回復薬（書き換え前の物を南東の隅へ）
//      9 ############
//   ・部屋の真ん中を砂に埋もれた祠（壁 6×4）にし、まわりを幅2の環（「回」の字）にした。環は四隅の色門4枚で
//     4つの区画（西の門番の間・南の廊下・東の門番の間・北の廊下）に割れ、門の色は環を回る順に赤・青が交互。
//   ・紋（色スイッチ）は祠の壁面に1区画1つ。剣で叩くとその色の門が開き、反対の色の門が閉じる（`setActiveColor`
//     ＝トグルでなくセット）。D2 の道具では遠くの紋を打てない（ブーメランは色スイッチに効かない＝矢とビームだけ）
//     ＝**隣に立って剣で叩く**だけの謎。
//   ・入口（西の門番の間）から北の口は赤門1枚の向こうに見えるが、西の門番の間の紋は青。赤の紋は青門の向こうの
//     南の廊下にある∴南へ回り（青）→ 赤を打ち（背中の青門が閉じ、遠くの北西の赤門が開くのが見える）→ 南東の
//     赤門から東の門番の間へ → 青を打って北東の青門から北の廊下へ、と環を 3/4 周する（色の切り替え最少 3 回）。
//   ・北の廊下の赤の紋は帰り道の近道＝地図を取って戻ったら赤を打てば北西の赤門から入口へ直に帰れる。
//     この紋が無いと北の廊下から出られない状態ができる（ソルバーの詰みで対照を取る）。
//   ・色ゲートの導入は本編でここが最初になる（D8 `3,0`「二色の鐘」は池越し・門越しに矢で鐘を射る一段上の形）。
//     西の門番の間の碑（祠の西面・紋の隣）で規則を一度だけ言葉にする。
//   ・敵なし（3,1 方位盤と同じ謎だけの部屋）。石・ボタン・`fluteEffect`・`initActiveColor` は置かない
//     （笛の resetStones は `activeColor` も null に戻す＝色門の奥で吹くと閉じ込められる）。
//   ・赤と青の紋は同じ行・列に置かない（銅の剣以上の溜め撃ちは色スイッチを貫く＝D8 `3,0` と同じ作法）。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（2つの口は同じセルで開いたまま）。
//
// 使い方:
//   node scripts/migrate-d2-3-3-sand-color-gates.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d2-3-3-sand-color-gates.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED } from './lib/connectivity.mjs';
import { makeSolver } from './lib/blade-solver.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_2';
const ROOM  = '3,3';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'...........#',
	'.....7.....#',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

// ── 狙いの盤面 ─────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#((###[##))#',
	'...†####]..#',
	'...]#####..#',
	'#))##[###((#',
	'#..........#',
	'#.........7#',
	'############',
];
// 下地の絵（'d' 砂／' ' なし＝壁・紋・碑）。⚠️ 石畳 'o' はダンジョンだとレンガ積みに描かれ、
// 2×2 の門番の間が壁に見えた（.scratch/q41-3-3-a.png）∴床は全部砂にした。
export const TARGET_BG_ART = [
	'     dd     ',
	' dddddddddd ',
	' dddddddddd ',
	' dd      dd ',
	'ddd      dd ',
	'ddd      dd ',
	' dd      dd ',
	' dddddddddd ',
	' dddddddddd ',
	'            ',
];
export const EXITS = { north: ['0,5', '0,6'], west: ['4,0', '5,0'] };
export const RED_SWITCHES  = ['3,6', '6,5'];    // 北の廊下（帰り道）・南の廊下
export const BLUE_SWITCHES = ['4,8', '5,3'];    // 東の門番の間・西の門番の間
export const RED_GATES  = ['3,1', '3,2', '6,9', '6,10'];   // 北西（入口→北の近道）・南東
export const BLUE_GATES = ['3,9', '3,10', '6,1', '6,2'];   // 北東・南西
export const POTION = '8,10';
export const SIGN = '4,3';   // 祠の西面（紋の隣）＝門番の間の床を塞がない。「〜の碑」は石碑タイル '†'（木の看板 'i' は碑を名乗らない＝tests/warp-stone.spec.js ①）
export const SIGN_DATA = {
	name: '砂門の碑',
	lines: [
		'【砂門の環】',
		'赤の 門と 青の 門は 共には 開かぬ。',
		'紋を 打てば、門は その 色に 従う。',
	],
};
// 区画（環を回る順）と、各区画で紋を叩く立ち位置。
export const REGIONS = {
	west:  ['4,0', '5,0', '4,1', '4,2', '5,1', '5,2'],
	south: ['7,1', '7,2', '7,3', '7,4', '7,5', '7,6', '7,7', '7,8', '7,9', '7,10',
		'8,1', '8,2', '8,3', '8,4', '8,5', '8,6', '8,7', '8,8', '8,9', '8,10'],
	east:  ['4,9', '4,10', '5,9', '5,10'],
	north: ['0,5', '0,6', '1,1', '1,2', '1,3', '1,4', '1,5', '1,6', '1,7', '1,8', '1,9', '1,10',
		'2,1', '2,2', '2,3', '2,4', '2,5', '2,6', '2,7', '2,8', '2,9', '2,10'],
};
export const STRIKE_FROM = { '5,3': '5,2', '6,5': '7,5', '4,8': '4,9', '3,6': '2,6' };
const STRIKE_FROM_INV = Object.fromEntries(Object.entries(STRIKE_FROM).map(([k, v]) => [v, k]));

export function targetBg() {
	const bg = {};
	TARGET_BG_ART.forEach((row, r) => [...row].forEach((ch, c) => {
		if (ch === TILE.SAND || ch === 'o') bg[`${r},${c}`] = ch;
	}));
	return bg;
}

const P = (k) => k.split(',').map(Number);
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

// 色ゲートを openColors の色だけ通す歩行の到達（モジュールとしても使う＝番人が import する）。
export function walkColors(t, from, openColors = []) {
	const ok = (r, c) => {
		if (!inside(r, c)) return false;
		const ch = t[r][c];
		if (ch === TILE.GATE_RED) return openColors.includes('red');
		if (ch === TILE.GATE_BLUE) return openColors.includes('blue');
		return !BLOCKED.has(ch);
	};
	const seen = new Set([from]), q = [from];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (seen.has(nk) || !ok(nr, nc)) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}

// 実ゲームと同じ遷移（lib/blade-solver.mjs）で測る＝西の口から入り北の口へ抜けられるか・
// 色の切り替え最少回数・詰み（西の口へ戻れない到達状態）の数・北の口から西の口へ戻る最少の切り替え回数。
// D2 で色スイッチを打てるのは剣だけ（ブーメランは色スイッチに効かない）∴既定は noTools（剣で隣を叩くだけ）。
export function solve(t, { noTools = true } = {}) {
	const grid = t.map((row) => [...row]);
	const bg = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 'g'));
	const S = makeSolver(grid, bg, [], {}, new Set(), { hasLadder: false, noTools });
	const west = EXITS.west, north = EXITS.north;
	const starts = west.map((k) => { const [r, c] = P(k); return S.encode(r, c, [], 0, 0, 0); });
	const edges = new Map(), seen = new Set(starts), q = [...starts];
	for (let h = 0; h < q.length; h++) {
		const ns = S.nextStates(q[h]); edges.set(q[h], ns);
		for (const n of ns) if (!seen.has(n)) { seen.add(n); q.push(n); }
	}
	const colorOf = (s) => s.split('|')[6];
	const cellOf = (s) => s.split('|')[0];
	const zeroOne = (from) => {
		const cost = new Map(from.map((s) => [s, 0])), dq = [...from];
		while (dq.length) {
			const s = dq.shift();
			for (const n of edges.get(s) ?? []) {
				const w = colorOf(n) !== colorOf(s) ? 1 : 0, nk = cost.get(s) + w;
				if (cost.has(n) && cost.get(n) <= nk) continue;
				cost.set(n, nk);
				if (w) dq.push(n); else dq.unshift(n);
			}
		}
		return cost;
	};
	const cost = zeroOne(starts);
	const goals = q.filter((s) => north.includes(cellOf(s)));
	const rev = new Map();
	for (const [s, ns] of edges) for (const n of ns) { if (!rev.has(n)) rev.set(n, []); rev.get(n).push(s); }
	const ok = new Set(q.filter((s) => west.includes(cellOf(s)))), rq = [...ok];
	for (let h = 0; h < rq.length; h++) for (const p of rev.get(rq[h]) ?? []) if (!ok.has(p)) { ok.add(p); rq.push(p); }
	// 帰り道＝初めて北の口に着いた色（青）のまま北の口に立った状態から、西の口へ戻る最少の切り替え回数。
	const firstArrivals = goals.filter((s) => cost.get(s) === Math.min(...goals.map((g) => cost.get(g))));
	const back = zeroOne(firstArrivals);
	const westBack = [...back.keys()].filter((s) => west.includes(cellOf(s)));
	return {
		solved: goals.length > 0,
		changes: goals.length ? Math.min(...goals.map((s) => cost.get(s))) : null,
		states: q.length,
		noEscape: q.length - ok.size,
		returnChanges: westBack.length ? Math.min(...westBack.map((s) => back.get(s))) : null,
		arrivalColors: [...new Set(firstArrivals.map(colorOf))],
	};
}

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// import されたときはここで止める（番人は定数と walkColors・solve だけ使う）。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	// 事前条件＝盤面の外の中身が無い（下地・碑は空か、このスクリプトが書いた物なら受ける＝冪等）。
	const extras = ['mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects', 'enemyDirs', 'showConditions', 'chestContents'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	{
		const bg = JSON.stringify(room.bgTiles ?? {});
		if (bg !== '{}' && bg !== JSON.stringify(targetBg())) die(`${ROOM} の bgTiles が想定外の中身`);
		const sd = JSON.stringify(room.signData ?? {});
		if (sd !== '{}' && sd !== JSON.stringify({ [SIGN]: SIGN_DATA })) die(`${ROOM} の signData が想定外の中身`);
	}
	if (room.links?.length) die(`${ROOM} の links が空でない`);
	if (room.fluteEffect || room.initActiveColor) die(`${ROOM} に fluteEffect／initActiveColor がある`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の戻り口の着地
	const OPEN = new Set(['T', '!', 'D', '=', TILE.GATE_RED, TILE.GATE_BLUE]);
	const runs = () => ({
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		ladder: bfsLayer(stages, START, { withLadder: true, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: false, openTiles: null }),
	});
	// 層の到達性の基準は「書き換え前の盤面」で測る＝適用済みの地図に再実行しても同じ基準になる（冪等）。
	const before = room.tiles.map(rowStr);
	const applied = { tiles: room.tiles, bgTiles: room.bgTiles };
	room.tiles = ORIGINAL.map((row) => row.split(''));
	room.bgTiles = {};
	const base = runs();
	room.tiles = applied.tiles;
	room.bgTiles = applied.bgTiles;

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え（tiles は文字の配列の配列＝[[field-tiles-are-char-arrays]]） ──
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => [...row]);
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(targetBg())) {
		room.bgTiles = targetBg();
		log.push(`  ${ROOM}: 下地＝床と門は全部砂`);
	}
	if (JSON.stringify(room.signData ?? {}) !== JSON.stringify({ [SIGN]: SIGN_DATA })) {
		room.signData = { [SIGN]: SIGN_DATA };
		log.push(`  ${ROOM}: 西の門番の間に碑「${SIGN_DATA.name}」`);
	}

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const t = room.tiles.map((r) => [...r]);
	const bg = room.bgTiles ?? {};
	const at = (k) => { const [r, c] = P(k); return t[r]?.[c]; };
	const cellsOf = (pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c], `${r},${c}`)) out.push(`${r},${c}`);
		return out.sort();
	};
	const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k)));
		const was = edge.filter((k) => { const [r, c] = P(k); return !HARD_BLOCKED.has(ORIGINAL[r][c]); });
		const want = Object.values(EXITS).flat();
		check(`画面の縁で開いているのは北・西の口だけ＝書き換え前と同じ（実測 ${open.sort().join(' ')}）`,
			same(open, want) && same(was, want));
	}
	check(`赤の紋 ${RED_SWITCHES.join(' ')}・青の紋 ${BLUE_SWITCHES.join(' ')}`,
		same(cellsOf((ch) => ch === TILE.SWITCH_RED), RED_SWITCHES) && same(cellsOf((ch) => ch === TILE.SWITCH_BLUE), BLUE_SWITCHES));
	check(`赤門 ${RED_GATES.join(' ')}・青門 ${BLUE_GATES.join(' ')}`,
		same(cellsOf((ch) => ch === TILE.GATE_RED), RED_GATES) && same(cellsOf((ch) => ch === TILE.GATE_BLUE), BLUE_GATES));
	check(`赤と青の紋は同じ行・列に無い（溜め撃ちのビームは色スイッチを貫く）`,
		RED_SWITCHES.every((a) => BLUE_SWITCHES.every((b) => { const [ar, ac] = P(a), [br, bc] = P(b); return ar !== br && ac !== bc; })));
	check(`紋は全部祠の壁面＝紋の四方のうち床は叩く立ち位置1つだけ`,
		[...RED_SWITCHES, ...BLUE_SWITCHES].every((k) => {
			const [r, c] = P(k);
			const floors = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => `${r + dr},${c + dc}`)
				.filter((n) => { const [nr, nc] = P(n); return inside(nr, nc) && !BLOCKED.has(t[nr][nc]); });
			return floors.length === 1 && floors[0] === STRIKE_FROM[k];
		}));
	check(`敵がいない（謎だけの部屋）`, cellsOf((ch) => !!ENEMY_META[ch]).length === 0);
	check(`回復薬は ${POTION} の1つだけ（書き換え前の物を南東の隅へ）`,
		at(POTION) === TILE.ITEM_HEAL_POTION && cellsOf((ch) => ch === TILE.ITEM_HEAL_POTION).length === 1);
	check(`碑 ${SIGN} に本文（${SIGN_DATA.lines.length} 行）`,
		at(SIGN) === TILE.MONUMENT && cellsOf((ch) => ch === TILE.MONUMENT).length === 1 && cellsOf((ch) => ch === TILE.SIGN).length === 0 && room.signData?.[SIGN]?.lines?.length === SIGN_DATA.lines.length);
	check(`石・ボタン・門 T・Y スイッチ・宝箱・links・fluteEffect・initActiveColor が無い`,
		cellsOf((ch) => [TILE.STONE, TILE.BUTTON, TILE.GATE, TILE.SWITCH, TILE.CHEST, TILE.KEY, TILE.DOOR, TILE.TORCH, TILE.PIT, TILE.BREAKABLE_WALL].includes(ch)).length === 0
		&& !(room.links?.length) && !room.fluteEffect && !room.initActiveColor
		&& extras.every((k) => !room[k] || Object.keys(room[k]).length === 0));
	{
		const want = targetBg();
		const floors = cellsOf((ch) => !BLOCKED.has(ch) || ch === TILE.GATE_RED || ch === TILE.GATE_BLUE)
			.filter((k) => at(k) !== TILE.SWITCH_RED && at(k) !== TILE.SWITCH_BLUE);
		check(`下地が狙いどおり（砂 ${Object.values(bg).filter((v) => v === TILE.SAND).length}）・床と門には全部砂・壁と紋と碑には無い`,
			JSON.stringify(bg) === JSON.stringify(want)
			&& floors.every((k) => bg[k] === TILE.SAND)
			&& Object.keys(bg).every((k) => floors.includes(k)));
	}

	// ── ② 環の幾何（色ごとの歩行） ─────────────────────────────────────
	{
		const W = '5,1';
		const none = walkColors(t, W), red = walkColors(t, W, ['red']), blue = walkColors(t, W, ['blue']);
		const both = walkColors(t, W, ['red', 'blue']);
		const all = Object.values(REGIONS).flat();
		check(`区画の分け方が盤面と一致＝4区画で全部の床（門と紋を除く ${all.length} マス）`,
			same(cellsOf((ch) => !BLOCKED.has(ch) && ch !== TILE.SWITCH_RED && ch !== TILE.SWITCH_BLUE), all));
		check(`門が全部閉じていると西の門番の間から出られない`, same(none, REGIONS.west));
		check(`西の門番の間の紋は青だけ・赤の紋は無い`,
			REGIONS.west.every((k) => !RED_SWITCHES.includes(STRIKE_FROM_INV[k])) && STRIKE_FROM['5,3'] === '5,2');
		check(`赤だけ開くと西から北の廊下へ直に行ける（北西の赤門＝近道）が、西の門番の間には赤の紋が無い`,
			REGIONS.north.every((k) => red.has(k)) && !red.has('7,5'));
		check(`青だけ開くと西から南の廊下へ行け、赤の紋を叩く立ち位置 (7,5) に立てる・北の廊下には届かない`,
			blue.has('7,5') && !blue.has('2,6') && !REGIONS.east.some((k) => blue.has(k)));
		check(`赤と青を両方開ければ環を一周できる（全区画）`, all.every((k) => both.has(k)));
		// 区画の隣り合い＝環を回る順に赤・青が交互（西→南＝青・南→東＝赤・東→北＝青・北→西＝赤）
		const through = (gate) => { const tt = t.map((r) => [...r]); for (const g of [...RED_GATES, ...BLUE_GATES]) if (!gate.includes(g)) { const [r, c] = P(g); tt[r][c] = TILE.WALL; } return tt; };
		const link = (a, b, gates, color) => walkColors(through(gates), REGIONS[a][REGIONS[a].length - 1], [color]).has(REGIONS[b][REGIONS[b].length - 1]);
		check(`西→南＝南西の青門／南→東＝南東の赤門／東→北＝北東の青門／北→西＝北西の赤門`,
			link('west', 'south', ['6,1', '6,2'], 'blue') && link('south', 'east', ['6,9', '6,10'], 'red')
			&& link('east', 'north', ['3,9', '3,10'], 'blue') && link('north', 'west', ['3,1', '3,2'], 'red'));
	}

	// ── ③ ソルバー（実ゲームと同じ遷移・剣で隣を叩くだけ） ────────────────
	{
		const m = solve(t);
		check(`西の口から北の口へ抜けられる（状態 ${m.states}）`, m.solved);
		check(`色の切り替え最少 3 回（南で赤を叩く前に西で青・東で青）＝実測 ${m.changes}`, m.changes === 3);
		check(`詰み 0（どの到達状態からも西の口へ戻れる）＝実測 ${m.noEscape}`, m.noEscape === 0);
		check(`初めて北の口に着いたときの色は青＝実測 ${m.arrivalColors.join(',')}`, same(m.arrivalColors, ['2']));
		check(`帰り道は北の赤の紋1回で入口へ戻れる（近道）＝実測 ${m.returnChanges}`, m.returnChanges === 1);
		for (const k of [...RED_SWITCHES, ...BLUE_SWITCHES]) {
			const tt = t.map((r) => [...r]); const [r, c] = P(k); tt[r][c] = TILE.WALL;
			const mm = solve(tt);
			check(`対照：紋 ${k} を壁にすると抜けられないか詰む（解 ${mm.solved}・詰み ${mm.noEscape}）`, !mm.solved || mm.noEscape > 0);
		}
	}

	// ── ④ 層の到達性 ──────────────────────────────────────────────────
	{
		const now = runs();
		check(`徒歩・錠を全部開けた到達室が書き換え前と同じ（${now.foot.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(now.foot.reachedRooms, base.foot.reachedRooms));
		check(`はしご込みの到達室が書き換え前と同じ（${now.ladder.reachedRooms.size} 室）`,
			same(now.ladder.reachedRooms, base.ladder.reachedRooms));
		check(`門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`,
			same(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${now.foot.deadEdges.length}）`, now.foot.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：地図の庭への通り道を「二色の砂門」に作り替える（キュー41 第3陣 5室目）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => {
		const now = rowStr(row);
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === now ? '=' : '→'}   ${now}   ${TARGET_BG_ART[i]}`);
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
